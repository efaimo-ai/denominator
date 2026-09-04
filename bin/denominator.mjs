#!/usr/bin/env node
// denominator - the CLI half.
//
//   denominator -- node check.mjs           verify against denominators.json
//   denominator --bless --why "..." -- ...  record what the run declared
//
// It runs your check, passes the output straight through so nothing is hidden,
// harvests the `denominator: <label> n=<int>` lines, and compares them with a
// committed baseline.
//
// Exit codes are three, not two, because "the scope moved" and "I could not
// read the scope at all" are different problems and collapsing them is how a
// broken harness reads as a clean tree:
//   0  every declared count matches the baseline (and the command exited 0)
//   1  a count moved, vanished, is unblessed, malformed, or is zero
//   2  the run could not be measured (no baseline, bad flags, spawn failure)
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { compare, harvest, parseBaseline, toBaseline, MARKER } from "../src/index.mjs";

const HELP = `denominator - a passing check has a denominator; ratchet it

usage:
  denominator [options] -- <command...>

options:
  --baseline <file>   baseline to compare against (default: denominators.json)
  --bless             write what this run declared as the new baseline
  --why "<reason>"    required with --bless, stored in the baseline
  --pattern <regex>   harvest with your own regex instead of the marker;
                      needs named groups (?<label>...) and (?<n>...)
  --json              machine-readable result on stdout
  --version           print the version
  -h, --help          this

your check prints, once per assertion it makes:
  denominator: <label> n=<int>

exit codes:
  0  every declared scope matches the baseline (and the command exited 0)
  1  a scope moved, vanished, was never blessed, was malformed, or was zero
  2  the run could not be measured at all
`;

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const flags = sep === -1 ? argv : argv.slice(0, sep);
const cmd = sep === -1 ? [] : argv.slice(sep + 1);

const opt = (name, fallback = null) => {
  const i = flags.indexOf(name);
  return i === -1 ? fallback : flags[i + 1];
};
const has = (name) => flags.includes(name);

if (has("--version")) {
  console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
  process.exit(0);
}
if (has("--help") || has("-h") || !cmd.length) {
  process.stdout.write(HELP);
  process.exit(cmd.length ? 0 : 2);
}

const baselinePath = resolve(opt("--baseline", "denominators.json"));
const bless = has("--bless");
const why = opt("--why");
const asJson = has("--json");

if (bless && !why) {
  fail2('--bless needs --why "<reason>". A baseline that changes without a sentence is a baseline nobody can audit later.');
}

let pattern = MARKER;
const custom = opt("--pattern");
if (custom) {
  if (!/\(\?<label>/.test(custom) || !/\(\?<n>/.test(custom)) {
    fail2("--pattern needs named groups (?<label>...) and (?<n>...), or there is nothing to key the count by.");
  }
  try {
    pattern = new RegExp(custom);
  } catch (e) {
    fail2(`--pattern is not a valid regular expression: ${e.message}`);
  }
}

let captured = "";
let settled = false;
// Set the instant we decide to retry. A failed spawn still emits `close` after
// its `error`, so without this the dead child's close arrives first, finishes
// the run on an empty capture, and reports the retry's output as nothing at all.
let retrying = false;
let directChild = null;

function tee(stream, out) {
  stream.setEncoding("utf8");
  stream.on("data", (d) => {
    captured += d;
    out.write(d);
  });
}

function wire(child) {
  tee(child.stdout, process.stdout);
  tee(child.stderr, process.stderr);
  child.on("close", (code) => {
    if (settled || (retrying && child === directChild)) return;
    settled = true;
    finish(code);
  });
}

// Spawning, and the one place a shell could rewrite what we meant.
//
// The first version of this ran with `shell: true` on Windows so that `npm` and
// `npx`, which are .cmd shims there, would resolve. Node's own deprecation
// notice says what that costs: with a shell and an argument array, arguments
// are "not escaped, only concatenated". The very first CLI test spawned
// `process.execPath`, which on that machine is `C:\Program Files\nodejs\node.exe`,
// so the shell received `C:\Program` as the command and ten tests went red at
// once. That is precisely the failure `read-back` is about, arriving inside the
// tool whose whole job is to notice when a check stopped covering what you think.
//
// So: no shell. If the executable genuinely cannot be found and we are on
// Windows, retry through the shell with a command line WE quoted, which is the
// only form where the payload is ours rather than a concatenation's.
function launch(args) {
  const direct = spawn(args[0], args.slice(1), { shell: false });
  directChild = direct;
  direct.on("error", (e) => {
    if (settled) return;
    // Retry only for a BARE command name, which is the shim case (`npm`,
    // `npx`, `pnpm`). A path that does not exist is not a resolution problem,
    // and handing it to cmd.exe would turn "I could not run this" (exit 2)
    // into "this ran and declared nothing" (exit 1), which are different
    // answers to different questions.
    const bareName = /^[\w.@-]+$/.test(args[0]);
    if (process.platform !== "win32" || e.code !== "ENOENT" || !bareName) {
      settled = true;
      return fail2(`could not run \`${args.join(" ")}\`: ${e.message}`);
    }
    retrying = true;
    const line = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
    const viaShell = spawn(line, { shell: true });
    viaShell.on("error", (e2) => {
      if (settled) return;
      settled = true;
      fail2(`could not run \`${args.join(" ")}\`: ${e2.message}`);
    });
    wire(viaShell);
  });
  return direct;
}

wire(launch(cmd));

function finish(code) {
  const harvested = harvest(captured, pattern);

  if (bless) {
    if (harvested.counts.size === 0) {
      fail2("nothing to bless: the run declared no denominators, so the baseline would be empty and would then agree with everything.");
    }
    if (harvested.malformed.length) {
      fail2(`refusing to bless a run with a declaration that does not parse:\n  ${harvested.malformed.join("\n  ")}`);
    }
    const zeros = [...harvested.counts].filter(([, n]) => n === 0).map(([l]) => l);
    if (zeros.length) {
      fail2(`refusing to bless a zero denominator: ${zeros.map((z) => `"${z}"`).join(", ")}. A check that examined nothing has nothing to record.`);
    }
    const previous = existsSync(baselinePath) ? safeParse(readFileSync(baselinePath, "utf8")) : null;
    writeFileSync(baselinePath, JSON.stringify(toBaseline(harvested.counts, { why, previous }), null, 2) + "\n");
    console.log(`\ndenominator: wrote ${harvested.counts.size} count(s) to ${baselinePath}`);
    process.exit(code === 0 ? 0 : 1);
  }

  if (!existsSync(baselinePath)) {
    fail2(
      `no baseline at ${baselinePath}.\n` +
        `  Record one with:  denominator --bless --why "first baseline" -- ${cmd.join(" ")}\n` +
        `  Until then there is nothing to compare against, and reporting that as a pass is the failure this tool exists to catch.`,
    );
  }

  let baseline;
  try {
    baseline = parseBaseline(readFileSync(baselinePath, "utf8"));
  } catch (e) {
    fail2(e.message);
  }

  const result = compare(harvested, baseline);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          commandExit: code,
          observed: Object.fromEntries([...harvested.counts].sort((a, b) => a[0].localeCompare(b[0]))),
          problems: result.problems,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("");
    if (result.ok) {
      const total = [...harvested.counts.values()].reduce((s, n) => s + n, 0);
      console.log(`denominator: ${harvested.counts.size} declared scope(s) match the baseline, ${total} things examined in total`);
    } else {
      for (const p of result.problems) console.log(`denominator FAIL  ${p.kind.padEnd(16)}${p.message}`);
      console.log(`\ndenominator: ${result.problems.length} problem(s). Fix the check, or bless the change with a reason.`);
    }
  }

  // The check's own exit code still counts. A run whose scopes all match but
  // which failed on its own terms is not a pass, and swallowing that would be
  // worse than not running at all.
  if (!result.ok) process.exit(1);
  process.exit(code === 0 ? 0 : code);
}

function fail2(msg) {
  console.error(`denominator: ${msg}`);
  process.exit(2);
}

function safeParse(text) {
  try {
    return parseBaseline(text);
  } catch {
    return null;
  }
}
