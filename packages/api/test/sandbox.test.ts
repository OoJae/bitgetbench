import { describe, expect, it } from "vitest";
import { getDb, insertRemoteAgent, getRemoteAgent, listEnabledRemoteAgents } from "@bitgetbench/db";
import { runRemoteSandboxPass } from "../src/index.js";

// Deterministic without a market-data cache or network: a strategy-spec agent whose stored spec
// is invalid makes specToAgent throw inside the pass, before any reader/window access. That proves
// the per-agent isolation (the pass never throws and records the outcome) and the circuit breaker.
// The happy path (a valid spec or a live webhook over cached data) is covered end to end.

const BAD_SPEC = JSON.stringify({ kind: "sma_cross", params: { fast: 50, slow: 20 } }); // slow<=fast

describe("runRemoteSandboxPass isolation + circuit breaker", () => {
  it("isolates per-agent failures and never throws", async () => {
    const db = getDb(":memory:");
    insertRemoteAgent(db, {
      id: "a1",
      name: "alpha",
      kind: "strategy-spec",
      specJson: BAD_SPEC,
      apiKeyHash: "h1",
      clientId: "c",
    });
    insertRemoteAgent(db, {
      id: "a2",
      name: "beta",
      kind: "strategy-spec",
      specJson: BAD_SPEC,
      apiKeyHash: "h2",
      clientId: "c",
    });
    const out = await runRemoteSandboxPass(db, "c");
    expect(out.ran.length).toBe(2);
    expect(out.ran.every((r) => r.ok === false)).toBe(true);
    expect(getRemoteAgent(db, "a1")!.consecutiveFailures).toBe(1);
    expect(getRemoteAgent(db, "a1")!.enabled).toBe(1);
  });

  it("auto-disables an agent that keeps failing", async () => {
    const db = getDb(":memory:");
    insertRemoteAgent(db, {
      id: "x",
      name: "flaky",
      kind: "strategy-spec",
      specJson: BAD_SPEC,
      apiKeyHash: "h",
      clientId: "c",
    });
    for (let i = 0; i < 5; i += 1) await runRemoteSandboxPass(db, "c");
    expect(getRemoteAgent(db, "x")!.enabled).toBe(0);
    expect(listEnabledRemoteAgents(db).length).toBe(0);
  });
});
