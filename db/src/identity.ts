// Anonymous client id for honest distinct-user counting. Generated once and stored at
// ~/.bitgetbench/client-id. It is a random UUID with no PII; it only lets telemetry count
// distinct installs rather than raw invocations.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getClientId(): string {
  const dir = join(homedir(), ".bitgetbench");
  const file = join(dir, "client-id");
  if (existsSync(file)) {
    const id = readFileSync(file, "utf8").trim();
    if (id.length > 0) return id;
  }
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  writeFileSync(file, id + "\n", "utf8");
  return id;
}

/** Default on-disk database path: env override, else the repo data dir. */
export function defaultDbPath(): string {
  return process.env.BITGETBENCH_DB ?? join(process.cwd(), "data-cache", "bitgetbench.db");
}
