import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Journal, type AgentDecision, type GuardRailVerdict } from "@bitgetbench/core";
import { initScaffold, verifyCommand } from "../src/index.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bgb-cli-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("initScaffold", () => {
  it("writes the agent, config, and readme", () => {
    const written = initScaffold(dir);
    expect(written.length).toBe(3);
    expect(existsSync(join(dir, "bitgetbench.agent.mjs"))).toBe(true);
    expect(existsSync(join(dir, "bitgetbench.config.json"))).toBe(true);
    const cfg = JSON.parse(readFileSync(join(dir, "bitgetbench.config.json"), "utf8"));
    expect(cfg.symbol).toBe("BTCUSDT");
  });

  it("does not overwrite without force, and does with force", () => {
    initScaffold(dir);
    expect(initScaffold(dir)).toEqual([]); // nothing written
    expect(initScaffold(dir, true).length).toBe(3); // forced
  });
});

describe("verifyCommand", () => {
  function writeJournal(): string {
    const decision: AgentDecision = {
      action: "long",
      symbol: "BTCUSDT",
      sizePct: 1,
      rationale: "x",
    };
    const verdict: GuardRailVerdict = { allowed: decision, blocked: false, reasons: [] };
    const j = new Journal();
    j.append(
      1000,
      decision,
      verdict,
      { price: 100, sizeUsd: 10, feeUsd: 0.06, slippageBps: 0 },
      10_000,
    );
    j.append(2000, decision, verdict, null, 10_010);
    const path = join(dir, "run.journal.jsonl");
    writeFileSync(path, j.entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    return path;
  }

  it("passes on an intact journal", () => {
    const v = verifyCommand(writeJournal());
    expect(v.ok).toBe(true);
    expect(v.checked).toBe(2);
  });

  it("fails on a tampered journal", () => {
    const path = writeJournal();
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const e0 = JSON.parse(lines[0]!);
    e0.equityAfter = 999_999;
    lines[0] = JSON.stringify(e0);
    writeFileSync(path, lines.join("\n") + "\n", "utf8");
    const v = verifyCommand(path);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(0);
  });
});
