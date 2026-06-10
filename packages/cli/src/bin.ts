#!/usr/bin/env node
// The `bitgetbench` binary. Thin commander wrapper over the command implementations.

import { Command } from "commander";
import {
  initScaffold,
  runBacktestCommand,
  verifyCommand,
  statsCommand,
  seedCommand,
} from "./index.js";

const program = new Command();
program
  .name("bitgetbench")
  .description("Leak-free evaluation and paper-trading harness for Bitget Agent Hub agents")
  .version("0.0.0");

program
  .command("init")
  .description("Scaffold an agent + config in a directory")
  .argument("[dir]", "target directory", ".")
  .option("-f, --force", "overwrite existing files", false)
  .action((dir: string, opts: { force: boolean }) => {
    const written = initScaffold(dir, opts.force);
    console.log(JSON.stringify({ ok: true, written }, null, 2));
    if (written.length === 0) {
      console.error("Nothing written (files exist). Use --force to overwrite.");
    }
  });

program
  .command("backtest")
  .description("Run a leak-audited, benchmarked backtest from a config file")
  .requiredOption("-c, --config <path>", "path to bitgetbench.config.json")
  .option("-j, --journal <path>", "write the hash-chained journal to this JSONL file")
  .option("-s, --submit", "persist the run to the leaderboard database", false)
  .option("--db <path>", "database path (defaults to data-cache/bitgetbench.db)")
  .action(async (opts: { config: string; journal?: string; submit: boolean; db?: string }) => {
    try {
      const outcome = await runBacktestCommand(opts.config, {
        ...(opts.journal ? { journalOut: opts.journal } : {}),
        submit: opts.submit,
        ...(opts.db ? { dbPath: opts.db } : {}),
      });
      console.log(JSON.stringify({ ok: true, ...outcome }, null, 2));
    } catch (err) {
      console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exitCode = 1;
    }
  });

program
  .command("stats")
  .description("Print telemetry counters from the leaderboard database")
  .option("--db <path>", "database path (defaults to data-cache/bitgetbench.db)")
  .action((opts: { db?: string }) => {
    const stats = statsCommand(opts.db);
    console.log(JSON.stringify(stats, null, 2));
  });

program
  .command("seed")
  .description("Run the reference agents over the cached data and submit them to the board")
  .option("--db <path>", "database path (defaults to data-cache/bitgetbench.db)")
  .action(async (opts: { db?: string }) => {
    try {
      const outcome = await seedCommand(opts.db);
      console.log(JSON.stringify({ ok: true, ...outcome }, null, 2));
    } catch (err) {
      console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exitCode = 1;
    }
  });

program
  .command("verify")
  .description("Verify a journal JSONL file's hash chain")
  .argument("<journal>", "path to the journal JSONL file")
  .action((journal: string) => {
    try {
      const v = verifyCommand(journal);
      console.log(JSON.stringify(v, null, 2));
      if (!v.ok) process.exitCode = 1;
    } catch (err) {
      console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
