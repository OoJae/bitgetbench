// SSRF-hardened outbound JSON POST for calling participant-supplied webhook URLs from the VPS.
// BitgetBench POSTs to URLs strangers register, from a host that also runs internal services,
// so a naive fetch would let an attacker reach cloud metadata (169.254.169.254), localhost, or
// RFC1918 hosts. Defenses: https-only + port allowlist, resolve DNS ourselves and reject any
// private/loopback/link-local address, connect to the validated IP we pinned (anti DNS-rebind),
// no redirect following, a hard timeout, and a response size cap. Every webhook call routes here.

import { lookup } from "node:dns/promises";
import * as https from "node:https";
import * as http from "node:http";
import { isIP } from "node:net";

const ALLOW_INSECURE = process.env.BITGETBENCH_ALLOW_INSECURE_WEBHOOKS === "1";
const ALLOW_PRIVATE = process.env.BITGETBENCH_ALLOW_PRIVATE_WEBHOOKS === "1";
const EXTRA_BLOCKED = (process.env.BITGETBENCH_BLOCK_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_PORTS = new Set([443, ...(ALLOW_INSECURE ? [80] : [])]);

function ipv4OctetsBlocked(o: number[]): boolean {
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o as [number, number, number, number];
  if (a === 0 || a === 127) return true; // unspecified, loopback
  if (a === 10) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18/15
  if (a >= 224) return true; // multicast + reserved (224.0.0.0+)
  return false;
}

function ipv4Blocked(ip: string): boolean {
  return ipv4OctetsBlocked(ip.split(".").map(Number));
}

/** Expand any IPv6 literal (compression + embedded IPv4) to its 16 bytes, or null if invalid. */
function ipv6ToBytes(input: string): Uint8Array | null {
  let ip = input.toLowerCase().split("%")[0]!; // drop any zone id
  // Convert a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hex groups.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = tail.split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16);
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0]!.split(":") : [];
  const tailGroups = halves.length === 2 ? (halves[1] ? halves[1]!.split(":") : []) : null;
  let groups: string[];
  if (tailGroups === null) {
    groups = head;
  } else {
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...head, ...new Array(missing).fill("0"), ...tailGroups];
  }
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const g = parseInt(groups[i] || "0", 16);
    if (Number.isNaN(g) || g < 0 || g > 0xffff || !/^[0-9a-f]{1,4}$/.test(groups[i] || "0")) {
      return null;
    }
    bytes[i * 2] = g >> 8;
    bytes[i * 2 + 1] = g & 0xff;
  }
  return bytes;
}

function ipv6Blocked(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true; // unparseable -> block (fail closed)
  const allZeroThru = (n: number) => b.slice(0, n).every((x) => x === 0);
  // Loopback ::1 and unspecified ::
  if (allZeroThru(15) && (b[15] === 0 || b[15] === 1)) return true;
  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 (embedded v4 in the low 32 bits)
  if (allZeroThru(10) && b[10] === 0xff && b[11] === 0xff) {
    return ipv4OctetsBlocked([b[12]!, b[13]!, b[14]!, b[15]!]);
  }
  if (allZeroThru(12)) return ipv4OctetsBlocked([b[12]!, b[13]!, b[14]!, b[15]!]);
  // NAT64 64:ff9b::/96 -> the embedded IPv4 could be private/metadata
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return ipv4OctetsBlocked([b[12]!, b[13]!, b[14]!, b[15]!]);
  }
  if (b[0] === 0x20 && b[1] === 0x02) return true; // 6to4 2002::/16 (could embed a private v4)
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // link-local fe80::/10
  if ((b[0]! & 0xfe) === 0xfc) return true; // unique-local fc00::/7
  if (b[0] === 0xff) return true; // multicast ff00::/8
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // Teredo 2001::/32
  if (b[0] === 0x01 && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x00) return true; // discard 100::/64
  return false;
}

/** True if an IP literal is in a range we must never connect to. */
export function ipIsBlocked(ip: string): boolean {
  if (EXTRA_BLOCKED.includes(ip)) return true;
  const fam = isIP(ip);
  if (fam === 4) return ipv4Blocked(ip);
  if (fam === 6) return ipv6Blocked(ip);
  return true; // not a recognizable IP
}

export interface PinnedTarget {
  hostname: string;
  ip: string;
  family: number;
  port: number;
  scheme: "https" | "http";
  path: string;
}

const DNS_TIMEOUT_MS = Number(process.env.BENCH_WEBHOOK_DNS_TIMEOUT_MS ?? 2500);

/** Resolve a hostname with a hard timeout so a slow/hostile resolver cannot hang a step. */
async function resolveWithTimeout(
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("webhook host resolution timed out")),
      DNS_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([lookup(hostname, { all: true }), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Validate a webhook URL and resolve it to a single pinned IP that is safe to connect to.
 * Throws on any disallowed scheme, port, or private/loopback/link-local address.
 */
export async function assertWebhookUrlAllowed(rawUrl: string): Promise<PinnedTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("webhook url is not a valid URL");
  }
  const scheme = url.protocol.replace(":", "");
  if (scheme !== "https" && !(scheme === "http" && ALLOW_INSECURE)) {
    throw new Error("webhook url must use https");
  }
  const port = url.port ? Number(url.port) : scheme === "https" ? 443 : 80;
  // In production only 443 (and 80 if http is enabled). The explicit insecure dev flag, used for
  // local testing against a webhook on an arbitrary port, relaxes the port allowlist only.
  if (!ALLOW_INSECURE && !ALLOWED_PORTS.has(port)) {
    throw new Error(`webhook url port ${port} is not allowed`);
  }

  const hostname = url.hostname;
  let ip = hostname;
  let family = isIP(hostname);
  if (family === 0) {
    // A hostname: resolve it ourselves (with a hard timeout, so a hostile/slow resolver cannot
    // hang the step) and validate every answer, then pin the first.
    const answers = await resolveWithTimeout(hostname);
    if (!answers.length) throw new Error("webhook host did not resolve");
    for (const a of answers) {
      if (!ALLOW_PRIVATE && ipIsBlocked(a.address)) {
        throw new Error("webhook host resolves to a private or disallowed address");
      }
    }
    ip = answers[0]!.address;
    family = answers[0]!.family;
  } else if (!ALLOW_PRIVATE && ipIsBlocked(ip)) {
    throw new Error("webhook host is a private or disallowed address");
  }

  return {
    hostname,
    ip,
    family,
    port,
    scheme: scheme as "https" | "http",
    path: `${url.pathname}${url.search}`,
  };
}

export interface SafePostResult {
  status: number;
  json: unknown;
  latencyMs: number;
}

export interface SafePostOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

/**
 * POST a JSON body to a validated webhook, connecting to the pinned IP (anti DNS-rebinding),
 * refusing redirects, capping the response, and timing out. Resolves with the parsed JSON and
 * status; rejects on transport error, timeout, oversize body, redirect, or non-JSON.
 */
export function safePostJson(
  target: PinnedTarget,
  body: unknown,
  opts: SafePostOptions = {},
): Promise<SafePostResult> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const start = process.hrtime.bigint();
  const transport = target.scheme === "https" ? https : http;

  return new Promise<SafePostResult>((resolve, reject) => {
    const req = transport.request(
      {
        host: target.ip, // connect to the IP we validated, not a re-resolved hostname
        servername: target.scheme === "https" ? target.hostname : undefined, // TLS SNI + cert check
        port: target.port,
        path: target.path,
        method: "POST",
        headers: {
          host: target.hostname,
          "content-type": "application/json",
          "content-length": String(payload.length),
          accept: "application/json",
          ...opts.headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          reject(new Error(`webhook returned a redirect (${status}), which is not followed`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new Error("webhook response exceeded the size cap"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            reject(new Error("webhook response was not valid JSON"));
            return;
          }
          resolve({ status, json, latencyMs });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("webhook call timed out"));
    });
    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}
