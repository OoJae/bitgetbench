import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { getDb } from "@bitgetbench/db";
import { Journal, type JournalEntry } from "@bitgetbench/core";
import { createServer } from "../src/server.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const db = getDb(":memory:");
  server = createServer({ db });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("read + health routes", () => {
  it("health, empty stats and runs", async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    const stats = await (await fetch(`${base}/api/stats`)).json();
    expect(stats.leaderboardSize).toBe(0);
    expect(stats.sandboxHeartbeat).toBeNull();
    const runs = await (await fetch(`${base}/api/runs`)).json();
    expect(runs).toEqual([]);
  });

  it("404s an unknown route and a missing run", async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/run/does-not-exist`)).status).toBe(404);
  });
});

describe("verify route", () => {
  it("verifies a good journal and flags a tampered one", async () => {
    const j = new Journal();
    const dec = { action: "hold" as const, symbol: "BTCUSDT", sizePct: 0, rationale: "x" };
    const verdict = { allowed: dec, blocked: false, reasons: [] };
    j.append(1, "c1", dec, verdict, null, 10_000);
    j.append(2, "c2", dec, verdict, null, 10_000);
    const good = [...j.entries];
    expect((await (await post("/api/verify", { journal: good })).json()).ok).toBe(true);

    const tampered: JournalEntry[] = good.map((e, i) => (i === 1 ? { ...e, equityAfter: 999 } : e));
    const res = await (await post("/api/verify", { journal: tampered })).json();
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(1);
  });

  it("400s a malformed verify body", async () => {
    expect((await post("/api/verify", { journal: "nope" })).status).toBe(400);
  });
});

describe("register + auth", () => {
  it("registers a strategy-spec agent and returns an api key", async () => {
    const res = await post("/api/agents", {
      name: "spec-bot",
      kind: "strategy-spec",
      spec: { kind: "sma_cross", params: { fast: 10, slow: 30 } },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agentId).toBeTruthy();
    expect(body.apiKey).toMatch(/^bbk_/);
  });

  it("requires the integrity attestation and a valid webhook for remote agents", async () => {
    const noAttest = await post("/api/agents", {
      name: "r1",
      kind: "remote-webhook",
      webhookUrl: "https://8.8.8.8/d",
    });
    expect(noAttest.status).toBe(400);

    const privateUrl = await post("/api/agents", {
      name: "r2",
      kind: "remote-webhook",
      webhookUrl: "https://127.0.0.1/d",
      attestNoOutsideData: true,
    });
    expect(privateUrl.status).toBe(400);

    const ok = await post("/api/agents", {
      name: "r3",
      kind: "remote-webhook",
      webhookUrl: "https://8.8.8.8/d",
      attestNoOutsideData: true,
    });
    expect(ok.status).toBe(201);
    expect((await ok.json()).kind).toBe("remote-webhook");
  });

  it("rejects bad kinds and missing names", async () => {
    expect((await post("/api/agents", { name: "x", kind: "nope" })).status).toBe(400);
    expect(
      (await post("/api/agents", { kind: "strategy-spec", spec: { kind: "buy_and_hold" } })).status,
    ).toBe(400);
  });

  it("guards the remote backtest route with the api key", async () => {
    expect((await post("/api/backtest/remote", { agentId: "x" })).status).toBe(401);
    expect(
      (await post("/api/backtest/remote", { agentId: "x" }, { "x-api-key": "wrong" })).status,
    ).toBe(401);
  });
});

describe("spec backtest validation", () => {
  it("400s an invalid spec before touching market data", async () => {
    const res = await post("/api/backtest/spec", {
      spec: { kind: "sma_cross", params: { fast: 50, slow: 20 } },
    });
    expect(res.status).toBe(400);
  });
});
