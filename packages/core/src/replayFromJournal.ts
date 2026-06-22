// Replay-from-journal: re-drive the deterministic engine from a run's recorded decisions and
// confirm it reproduces the same hash-chained journalRoot. This proves the engine executed the
// recorded decisions faithfully, even for a non-deterministic remote agent that cannot be
// re-called identically. The hash chain (verifyJournal) proves the journal was not tampered;
// this proves the journal is consistent with our engine on the same data and config.

import type { JournalEntry, AgentDecision, BenchAgent, MarketContext } from "./types.js";
import { runBacktest, type RunBacktestParams } from "./engine.js";
import { GENESIS_HASH } from "./journal.js";

/** An agent that replays a fixed list of recorded decisions in order, ignoring context. */
class ReplayAgent implements BenchAgent {
  readonly name: string;
  private i = 0;
  constructor(
    name: string,
    private readonly decisions: AgentDecision[],
  ) {
    this.name = name;
  }
  decide(_ctx: MarketContext): Promise<AgentDecision> {
    const d = this.decisions[this.i];
    this.i += 1;
    if (!d) throw new Error(`replayFromJournal: ran out of recorded decisions at step ${this.i}`);
    return Promise.resolve(d);
  }
}

export interface JournalReplay {
  /** True when the recomputed journalRoot matches the recorded one. */
  ok: boolean;
  /** The journalRoot recorded in the input journal (its last entry's hash). */
  expectedRoot: string;
  /** The journalRoot produced by re-driving the engine from the recorded decisions. */
  actualRoot: string;
  steps: number;
}

/**
 * Replay a journal's recorded decisions through the engine and compare journal roots. The
 * caller must supply the SAME reader, window, config, and guardrail the original run used, or
 * the roots will not match. Returns the comparison rather than throwing on mismatch.
 */
export async function replayFromJournal(
  entries: readonly JournalEntry[],
  params: Omit<RunBacktestParams, "agent">,
  agentName = "replay",
): Promise<JournalReplay> {
  const decisions = entries.map((e) => e.decision);
  const run = await runBacktest({ ...params, agent: new ReplayAgent(agentName, decisions) });
  const expectedRoot = entries.length ? entries[entries.length - 1]!.hash : GENESIS_HASH;
  return {
    ok: run.journalRoot === expectedRoot,
    expectedRoot,
    actualRoot: run.journalRoot,
    steps: run.journal.length,
  };
}
