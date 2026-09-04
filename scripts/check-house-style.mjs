#!/usr/bin/env node
// House style guard: ASCII hyphen only, no em (U+2014) or en (U+2013) dash,
// anywhere in this skill's text. There is no build here, so it runs in CI
// (see .github/workflows/house-style.yml). Bytes, not a regex on a decoded
// string, because the decode is where a byte check goes blind. An empty scan is
// a failure: a guard that stops finding files stops guarding while still exiting
// 0, so too few files is a hard error, not a quiet pass.
import { readdirSync, readFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = new Set([".md", ".txt", ".json", ".yml", ".yaml", ".mjs", ".js", ".ts", ".css", ".html", ".svg", ".toml"]);
const NOEXT = new Set(["LICENSE", "NOTICE"]);
const SKIP = new Set([".git", "node_modules"]);

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (TEXT.has(extname(e.name).toLowerCase()) || NOEXT.has(e.name)) files.push(p);
  }
})(ROOT);

const offenders = [];
for (const f of files) {
  const b = readFileSync(f);
  for (let i = 0; i < b.length - 2; i++) {
    if (b[i] === 0xe2 && b[i + 1] === 0x80 && (b[i + 2] === 0x94 || b[i + 2] === 0x93)) {
      const line = b.subarray(0, i).toString("utf8").split("\n").length;
      offenders.push(`${f.slice(ROOT.length + 1)}:${line}: ${b[i + 2] === 0x94 ? "em" : "en"} dash`);
      break;
    }
  }
}

// Empty-harvest floor tied to real content, not just to the guard's own two
// infra files: a skill carries SKILL.md, README, LICENSE, NOTICE and this
// script at least, so a walk that found fewer stopped looking somewhere.
if (files.length < 5) {
  console.error(`house-style: scanned only ${files.length} files; the guard is not looking where it should.`);
  process.exit(2);
}
if (offenders.length) {
  console.error("house-style: em or en dash found (ASCII hyphen only):");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log(`house-style: ${files.length} files clean, no em or en dash.`);
