#!/usr/bin/env node
// Hard rule 1: no em dashes anywhere in the repo. This check fails the build if a
// U+2014 (em dash) appears in any tracked source or doc file. Run via `pnpm lint`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const EM_DASH = "—";
const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".vercel",
  "coverage",
  "data-cache",
  "brandfiles",
  ".git",
]);

const CHECK_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".css",
  ".html",
  ".txt",
]);

// The check script itself names the character it forbids, so skip it.
const SELF = "scripts/no-em-dash.mjs";

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.slice(ROOT.length + 1);
    if (IGNORE_DIRS.has(entry)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (CHECK_EXT.has(extname(entry)) && rel !== SELF) {
      out.push(full);
    }
  }
}

const files = [];
walk(ROOT, files);

const violations = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    let idx = line.indexOf(EM_DASH);
    while (idx !== -1) {
      violations.push(`${file.slice(ROOT.length + 1)}:${i + 1}:${idx + 1}`);
      idx = line.indexOf(EM_DASH, idx + 1);
    }
  });
}

if (violations.length > 0) {
  console.error(`no-em-dash: found ${violations.length} em dash(es). This is a defect.`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(`no-em-dash: clean (${files.length} files scanned).`);
