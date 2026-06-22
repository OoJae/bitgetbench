import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MarketContext } from "@bitgetbench/core";

// Control the mocked transport per test.
let responder: () => { status: number; json: unknown; latencyMs: number };

vi.mock("../src/safeFetch.js", () => ({
  assertWebhookUrlAllowed: vi.fn(async () => ({
    hostname: "h",
    ip: "8.8.8.8",
    family: 4,
    port: 443,
    scheme: "https",
    path: "/",
  })),
  safePostJson: vi.fn(async () => responder()),
}));

const { RemoteAgent } = await import("../src/remoteAgent.js");

const ctx: MarketContext = {
  timestamp: 1000,
  symbol: "BTCUSDT",
  timeframe: "15m",
  candles: [],
  position: null,
  equity: 10_000,
};

function ok(json: unknown) {
  return () => ({ status: 200, json, latencyMs: 12 });
}

describe("RemoteAgent", () => {
  beforeEach(() => {
    responder = ok({ action: "hold", sizePct: 0, rationale: "x" });
  });

  it("parses and clamps a valid response", async () => {
    responder = ok({
      action: "long",
      sizePct: 2,
      leverage: 999,
      rationale: "y".repeat(500),
      confidence: 9,
      symbol: "ETHUSDT",
    });
    const a = new RemoteAgent({ name: "r", webhookUrl: "https://h/d", runId: "run1" });
    const d = await a.decide(ctx);
    expect(d.action).toBe("long");
    expect(d.sizePct).toBe(1); // clamped to [0,1]
    expect(d.leverage).toBe(50); // clamped to max
    expect(d.confidence).toBe(1); // clamped to [0,1]
    expect(d.rationale.length).toBe(280); // truncated
    expect(d.symbol).toBe("BTCUSDT"); // forced to the run symbol
    expect(a.errorCount).toBe(0);
  });

  it("falls back to hold on a 5xx and counts the error", async () => {
    responder = () => ({ status: 503, json: {}, latencyMs: 1 });
    const errs: string[] = [];
    const a = new RemoteAgent({
      name: "r",
      webhookUrl: "https://h/d",
      runId: "run1",
      onError: (_s, m) => errs.push(m),
    });
    const d = await a.decide(ctx);
    expect(d.action).toBe("hold");
    expect(d.sizePct).toBe(0);
    expect(a.errorCount).toBe(1);
    expect(errs.length).toBe(1);
  });

  it("falls back to hold on a malformed body", async () => {
    responder = ok({ nonsense: true });
    const a = new RemoteAgent({ name: "r", webhookUrl: "https://h/d", runId: "run1" });
    const d = await a.decide(ctx);
    expect(d.action).toBe("hold");
    expect(a.errorCount).toBe(1);
  });

  it("records and then clears the last response for the journal", async () => {
    responder = ok({ action: "hold", sizePct: 0, rationale: "z" });
    const a = new RemoteAgent({ name: "r", webhookUrl: "https://h/d", runId: "run1" });
    await a.decide(ctx);
    const meta = a.consumeLastResponse();
    expect(meta?.httpStatus).toBe(200);
    expect(meta?.latencyMs).toBe(12);
    expect(a.consumeLastResponse()).toBeUndefined(); // consumed
  });
});
