import { describe, expect, it } from "vitest";
import { ipIsBlocked, assertWebhookUrlAllowed } from "../src/safeFetch.js";

describe("ipIsBlocked", () => {
  it("blocks loopback, RFC1918, link-local/metadata, CGNAT, multicast", () => {
    for (const ip of [
      "127.0.0.1",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.3.4",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback (dotted)
      // IPv4-mapped in HEX form must also be blocked (the original bypass):
      "::ffff:7f00:1", // 127.0.0.1
      "::ffff:a00:5", // 10.0.0.5
      "::ffff:c0a8:1", // 192.168.0.1
      "::ffff:a9fe:a9fe", // 169.254.169.254 cloud metadata
      "0:0:0:0:0:ffff:127.0.0.1", // uncompressed mapped form
      "::a9fe:a9fe", // IPv4-compatible 169.254.169.254
      "2002:7f00:1::", // 6to4
      "64:ff9b::7f00:1", // NAT64 -> 127.0.0.1
      "2001:0:1234::1", // Teredo 2001::/32
      "garbage::nope", // unparseable -> fail closed
    ]) {
      expect(ipIsBlocked(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10", "2606:4700:4700::1111"]) {
      expect(ipIsBlocked(ip), ip).toBe(false);
    }
    expect(ipIsBlocked("not-an-ip")).toBe(true);
  });
});

describe("assertWebhookUrlAllowed", () => {
  it("rejects non-https schemes", async () => {
    await expect(assertWebhookUrlAllowed("http://example.com/decide")).rejects.toThrow(/https/);
    await expect(assertWebhookUrlAllowed("ftp://example.com/x")).rejects.toThrow();
  });

  it("rejects private and metadata IP literals", async () => {
    await expect(assertWebhookUrlAllowed("https://127.0.0.1/x")).rejects.toThrow(/private/);
    await expect(assertWebhookUrlAllowed("https://169.254.169.254/latest")).rejects.toThrow(
      /private/,
    );
    await expect(assertWebhookUrlAllowed("https://10.0.0.5:443/x")).rejects.toThrow(/private/);
  });

  it("rejects disallowed ports", async () => {
    await expect(assertWebhookUrlAllowed("https://8.8.8.8:22/x")).rejects.toThrow(/port/);
  });

  it("accepts a public https URL and pins the target", async () => {
    const t = await assertWebhookUrlAllowed("https://8.8.8.8/decide?x=1");
    expect(t.scheme).toBe("https");
    expect(t.ip).toBe("8.8.8.8");
    expect(t.port).toBe(443);
    expect(t.path).toBe("/decide?x=1");
  });
});
