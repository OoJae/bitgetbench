// Tamper-evident trade journal: one immutable entry per step, hash-chained so any edit to
// any entry breaks every hash after it. The final journalRoot summarizes the whole run,
// and verifyJournal recomputes the chain to detect tampering. Deterministic.

import { createHash } from "node:crypto";
import type { AgentDecision, GuardRailVerdict, Fill, JournalEntry } from "./types.js";

/** The prevHash of the first entry. 64 hex zeros. */
export const GENESIS_HASH = "0".repeat(64);

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic JSON with recursively sorted object keys, so hashing is stable. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** The preimage that gets hashed for one entry. */
function preimage(
  seq: number,
  prevHash: string,
  timestamp: number,
  decision: AgentDecision,
  verdict: GuardRailVerdict,
  fill: Fill | null,
  equityAfter: number,
): string {
  return [
    seq,
    prevHash,
    timestamp,
    stableStringify(decision),
    stableStringify(verdict),
    stableStringify(fill),
    equityAfter,
  ].join("|");
}

/** Append-only journal builder. Each push hash-chains onto the previous entry. */
export class Journal {
  private readonly entriesArr: JournalEntry[] = [];

  get entries(): readonly JournalEntry[] {
    return this.entriesArr;
  }

  get root(): string {
    const last = this.entriesArr[this.entriesArr.length - 1];
    return last ? last.hash : GENESIS_HASH;
  }

  append(
    timestamp: number,
    decision: AgentDecision,
    verdict: GuardRailVerdict,
    fill: Fill | null,
    equityAfter: number,
  ): JournalEntry {
    const seq = this.entriesArr.length;
    const prevHash = this.root;
    const hash = sha256Hex(
      preimage(seq, prevHash, timestamp, decision, verdict, fill, equityAfter),
    );
    const entry: JournalEntry = {
      seq,
      prevHash,
      timestamp,
      decision,
      verdict,
      fill,
      equityAfter,
      hash,
    };
    this.entriesArr.push(entry);
    return entry;
  }
}

export interface JournalVerification {
  ok: boolean;
  /** seq of the first entry that fails the chain, or null if intact. */
  brokenAt: number | null;
  checked: number;
}

/** Recompute the chain and detect any tampering. */
export function verifyJournal(entries: readonly JournalEntry[]): JournalVerification {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]!;
    const expected = sha256Hex(
      preimage(e.seq, prevHash, e.timestamp, e.decision, e.verdict, e.fill, e.equityAfter),
    );
    if (e.seq !== i || e.prevHash !== prevHash || e.hash !== expected) {
      return { ok: false, brokenAt: i, checked: entries.length };
    }
    prevHash = e.hash;
  }
  return { ok: true, brokenAt: null, checked: entries.length };
}
