import { describe, expect, it } from "vitest";
import {
  Journal,
  verifyJournal,
  stableStringify,
  GENESIS_HASH,
  type AgentDecision,
  type GuardRailVerdict,
  type JournalEntry,
} from "../src/index.js";

function decision(action: AgentDecision["action"] = "hold"): AgentDecision {
  return { action, symbol: "BTCUSDT", sizePct: 0, rationale: "x" };
}
const pass: GuardRailVerdict = { allowed: decision(), blocked: false, reasons: [] };

function buildJournal(): Journal {
  const j = new Journal();
  j.append(
    1000,
    decision("long"),
    pass,
    { price: 100, sizeUsd: 10, feeUsd: 0.06, slippageBps: 0 },
    10_000,
  );
  j.append(2000, decision("hold"), pass, null, 10_010);
  j.append(
    3000,
    decision("close"),
    pass,
    { price: 110, sizeUsd: 11, feeUsd: 0.066, slippageBps: 0 },
    10_050,
  );
  return j;
}

describe("Journal hash chain", () => {
  it("chains entries from the genesis hash and verifies intact", () => {
    const j = buildJournal();
    expect(j.entries[0]!.prevHash).toBe(GENESIS_HASH);
    expect(j.entries[1]!.prevHash).toBe(j.entries[0]!.hash);
    expect(j.root).toBe(j.entries[2]!.hash);
    expect(verifyJournal(j.entries)).toEqual({ ok: true, brokenAt: null, checked: 3 });
  });

  it("detects tampering with any field", () => {
    const entries: JournalEntry[] = buildJournal().entries.map((e) => ({ ...e }));
    entries[1] = { ...entries[1]!, equityAfter: 999_999 };
    const v = verifyJournal(entries);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
  });

  it("detects a swapped hash", () => {
    const entries: JournalEntry[] = buildJournal().entries.map((e) => ({ ...e }));
    entries[2] = { ...entries[2]!, hash: "deadbeef".repeat(8) };
    expect(verifyJournal(entries).ok).toBe(false);
  });

  it("is empty-safe: an empty journal verifies and roots at genesis", () => {
    const j = new Journal();
    expect(j.root).toBe(GENESIS_HASH);
    expect(verifyJournal(j.entries).ok).toBe(true);
  });
});

describe("stableStringify", () => {
  it("is independent of key insertion order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ a: { y: 1, x: 2 } })).toBe(stableStringify({ a: { x: 2, y: 1 } }));
  });
});
