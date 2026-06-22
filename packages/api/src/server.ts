// The BitgetBench public write API: a framework-free node:http service on the VPS. It owns all
// writes (register an agent, run a spec or remote backtest) and mirrors the read endpoints so an
// MCP client has one base URL. Vercel stays a pure reader of the existing Next routes. Auth is a
// per-agent API key (stored hashed); spec backtests are unauthenticated but rate-limited.

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { sha256Hex, verifyJournal, type JournalEntry } from "@bitgetbench/core";
import {
  topRuns,
  getRun,
  getStats,
  recentHeartbeat,
  recordEvent,
  insertRemoteAgent,
  getRemoteAgent,
  createJob,
  getJob,
  type Db,
  type RunMode,
} from "@bitgetbench/db";
import { validateSpec, type StrategySpec } from "@bitgetbench/reference-agents";
import { assertWebhookUrlAllowed } from "@bitgetbench/adapters";
import { runSpecBacktest, runRemoteBacktest, NoMarketDataError } from "./backtest.js";
import { JobQueue } from "./jobs.js";
import { RateLimiter } from "./rateLimit.js";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function ipOf(req: IncomingMessage): string {
  // Trust only the rightmost X-Forwarded-For entry: our nginx uses $proxy_add_x_forwarded_for,
  // which APPENDS the real peer it saw, so the last hop is the trustworthy one. Taking the
  // leftmost (client-supplied) value would let anyone forge the rate-limit key. The service also
  // binds 127.0.0.1 (see bin.ts), so only nginx can reach it directly.
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) {
    const parts = fwd.split(",");
    const last = parts[parts.length - 1]!.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}

/** Constant-time compare of two hex digests of equal length. */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJson(req: IncomingMessage, maxBytes = 256 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new HttpError(413, "request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text.trim()) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, "request body was not valid JSON"));
      }
    });
    req.on("error", () => reject(new HttpError(400, "could not read request body")));
  });
}

export interface ServerDeps {
  db: Db;
  jobs?: JobQueue;
}

export function createApp(deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => void {
  const { db } = deps;
  const jobs = deps.jobs ?? new JobQueue(db);
  const registerRl = new RateLimiter(10, 0.05); // ~10 burst, 3/min sustained
  const backtestRl = new RateLimiter(20, 0.1); // ~20 burst, 6/min sustained

  function heartbeatView(): { ts: number; ok: boolean; latencyMs: number } | null {
    const hb = recentHeartbeat(db);
    return hb ? { ts: hb.ts, ok: hb.ok === 1, latencyMs: hb.latencyMs } : null;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const ip = ipOf(req);

    if (method === "GET" && path === "/api/health") return sendJson(res, 200, { ok: true });

    if (method === "GET" && path === "/api/stats") {
      recordEvent(db, "api_call", `ip:${ip}`, { route: "stats" });
      return sendJson(res, 200, { ...getStats(db), sandboxHeartbeat: heartbeatView() });
    }

    if (method === "GET" && path === "/api/runs") {
      const limit = Math.min(
        500,
        Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100),
      );
      const mode = (url.searchParams.get("mode") ?? undefined) as RunMode | undefined;
      const tierParam = url.searchParams.get("tier") ?? undefined;
      const tier =
        tierParam === "engine-verified" ||
        tierParam === "data-clean" ||
        tierParam === "disqualified"
          ? tierParam
          : undefined;
      return sendJson(res, 200, topRuns(db, limit, mode, tier));
    }

    if (method === "GET" && path.startsWith("/api/run/")) {
      const id = decodeURIComponent(path.slice("/api/run/".length));
      const detail = getRun(db, id);
      if (!detail) return sendJson(res, 404, null);
      return sendJson(res, 200, detail);
    }

    if (method === "GET" && path.startsWith("/api/jobs/")) {
      const id = decodeURIComponent(path.slice("/api/jobs/".length));
      const job = getJob(db, id);
      if (!job) return sendJson(res, 404, { error: "no such job" });
      return sendJson(res, 200, {
        id: job.id,
        status: job.status,
        progress: job.progress,
        runId: job.runId,
        error: job.error,
      });
    }

    if (method === "POST" && path === "/api/verify") {
      const body = (await readJson(req, 4 * 1024 * 1024)) as { journal?: unknown };
      if (!Array.isArray(body.journal))
        throw new HttpError(400, "expected { journal: JournalEntry[] }");
      return sendJson(res, 200, verifyJournal(body.journal as JournalEntry[]));
    }

    if (method === "POST" && path === "/api/agents") {
      if (!registerRl.take(`ip:${ip}`))
        throw new HttpError(429, "rate limit: too many registrations");
      const body = (await readJson(req)) as Record<string, unknown>;
      return sendJson(res, 201, await registerAgent(db, body));
    }

    if (method === "POST" && path === "/api/backtest/spec") {
      if (!backtestRl.take(`ip:${ip}`)) throw new HttpError(429, "rate limit: too many backtests");
      const body = (await readJson(req)) as { spec?: unknown };
      let spec: StrategySpec;
      try {
        spec = validateSpec(body.spec) as StrategySpec;
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      const { runId, result } = await runSpecBacktest(db, spec, `ip:${ip}`);
      recordEvent(db, "backtest_run", `ip:${ip}`, { agent: result.agent, via: "api-spec" });
      return sendJson(res, 200, { runId, result });
    }

    if (method === "POST" && path === "/api/backtest/remote") {
      const apiKey = req.headers["x-api-key"];
      if (typeof apiKey !== "string" || !apiKey) throw new HttpError(401, "missing x-api-key");
      const body = (await readJson(req)) as { agentId?: unknown };
      const agentId = String(body.agentId ?? "");
      const agent = getRemoteAgent(db, agentId);
      if (!agent || !hashEquals(agent.apiKeyHash, sha256Hex(apiKey))) {
        throw new HttpError(401, "invalid agent id or api key");
      }
      if (agent.kind !== "remote-webhook" || !agent.webhookUrl) {
        throw new HttpError(400, "agent is not a remote-webhook agent");
      }
      const jobId = `job_${randomUUID()}`;
      const runId = `remote:${agent.id}`;
      createJob(db, {
        id: jobId,
        kind: "remote-backtest",
        payloadJson: JSON.stringify({ agentId }),
        clientId: agent.clientId,
      });
      jobs.enqueue(jobId, async () => {
        const out = await runRemoteBacktest(db, agent, agent.clientId, runId);
        recordEvent(db, "backtest_run", agent.clientId, { agent: agent.name, via: "api-remote" });
        return out.runId;
      });
      return sendJson(res, 202, { jobId, runId, status: "queued" });
    }

    sendJson(res, 404, { error: "not found" });
  }

  return (req, res) => {
    handle(req, res).catch((err: unknown) => {
      // Intentional client errors are typed HttpError (validation throwers are wrapped at their
      // call sites). Everything else is an unexpected server fault: return a generic 500 and never
      // echo the internal message, so we cannot leak internals or misclassify a bug as a 400.
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      if (err instanceof NoMarketDataError) return sendJson(res, 503, { error: err.message });
      sendJson(res, 500, { error: "internal error" });
    });
  };
}

async function registerAgent(db: Db, body: Record<string, unknown>): Promise<unknown> {
  const name = String(body.name ?? "")
    .slice(0, 64)
    .trim();
  if (!name) throw new HttpError(400, "name is required");
  const kind =
    body.kind === "strategy-spec"
      ? "strategy-spec"
      : body.kind === "remote-webhook"
        ? "remote-webhook"
        : null;
  if (!kind) throw new HttpError(400, 'kind must be "remote-webhook" or "strategy-spec"');

  let webhookUrl: string | null = null;
  let specJson: string | null = null;

  if (kind === "remote-webhook") {
    if (body.attestNoOutsideData !== true) {
      throw new HttpError(
        400,
        "must accept the backtest-integrity clause: set attestNoOutsideData=true",
      );
    }
    webhookUrl = String(body.webhookUrl ?? "");
    try {
      await assertWebhookUrlAllowed(webhookUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  } else {
    try {
      specJson = JSON.stringify(validateSpec(body.spec) as StrategySpec);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }

  const id = randomUUID();
  const apiKey = `bbk_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
  const clientId = `key:${sha256Hex(apiKey).slice(0, 16)}`;
  insertRemoteAgent(db, {
    id,
    name,
    kind,
    webhookUrl,
    specJson,
    apiKeyHash: sha256Hex(apiKey),
    clientId,
  });
  return { agentId: id, apiKey, name, kind };
}

export function createServer(deps: ServerDeps): Server {
  return createHttpServer(createApp(deps));
}
