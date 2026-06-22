#!/usr/bin/env node
// Entry point for the BitgetBench write API service. Runs on the VPS beside the Next read app.

import { getDb, defaultDbPath } from "@bitgetbench/db";
import { createServer } from "./server.js";
import { JobQueue } from "./jobs.js";

const port = Number(process.env.BENCH_API_PORT ?? 3940);
const db = getDb(process.env.BITGETBENCH_DB ?? defaultDbPath());
const jobs = new JobQueue(db);

// Bind localhost only: nginx (the trusted proxy) reverse-proxies the public write paths to us.
// This keeps the only path in through nginx, so the X-Forwarded-For the API trusts is real.
createServer({ db, jobs }).listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`bitgetbench-api listening on 127.0.0.1:${port}`);
});
