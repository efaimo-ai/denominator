// The CLI, spawned for real. The library tests above cannot see the two things
// most likely to be wrong out here: the exit code, and whether the arguments
// survive the trip through a shell on Windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "..", "bin", "denominator.mjs");
const FIXTURE = join(HERE, "fixtures", "emitter.mjs");

function run(args, { env = {}, cwd } = {}) {
  const dir = cwd ?? mkdtempSync(join(tmpdir(), "denom-"));
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { ...r, dir, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const withBaseline = (counts) => {
  const dir = mkdtempSync(join(tmpdir(), "denom-"));
  writeFileSync(join(dir, "denominators.json"), JSON.stringify({ blessed: "2026-09-04", why: "test", counts }));
  return dir;
};

test("a run whose scopes match the baseline exits 0", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /2 declared scope\(s\) match the baseline, 19 things examined/);
  rmSync(dir, { recursive: true, force: true });
});

test("the check's own output is passed through, not swallowed", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir });
  assert.match(r.out, /PASS {2}every route answers/);
  rmSync(dir, { recursive: true, force: true });
});

test("a scope that shrank exits 1 even though the check passed", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir, env: { DENOM_FIXTURE_ROUTES: "5" } });
  assert.equal(r.status, 1);
  assert.match(r.out, /examined 5, down from 7/);
  rmSync(dir, { recursive: true, force: true });
});

test("a scope that stopped being declared exits 1", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir, env: { DENOM_FIXTURE_DROP: "1" } });
  assert.equal(r.status, 1);
  assert.match(r.out, /is in the baseline at 12 but the run never declared it/);
  rmSync(dir, { recursive: true, force: true });
});

test("a line that starts a declaration and does not parse is reported, not ignored", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir, env: { DENOM_FIXTURE_MALFORMED: "1" } });
  assert.equal(r.status, 1);
  assert.match(r.out, /does not parse, so its scope is not watched/);
  rmSync(dir, { recursive: true, force: true });
});

test("the check's own failure is not swallowed by matching scopes", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir, env: { DENOM_FIXTURE_EXIT: "3" } });
  assert.equal(r.status, 3, "the command's exit code has to survive");
  rmSync(dir, { recursive: true, force: true });
});

test("no baseline is exit 2, with the command to create one", () => {
  const r = run(["--", process.execPath, FIXTURE]);
  assert.equal(r.status, 2);
  assert.match(r.out, /no baseline at/);
  assert.match(r.out, /--bless --why/);
  rmSync(r.dir, { recursive: true, force: true });
});

test("blessing without a reason is refused", () => {
  const r = run(["--bless", "--", process.execPath, FIXTURE]);
  assert.equal(r.status, 2);
  assert.match(r.out, /needs --why/);
  rmSync(r.dir, { recursive: true, force: true });
});

test("blessing writes the counts and the reason", () => {
  const r = run(["--bless", "--why", "first baseline", "--", process.execPath, FIXTURE]);
  assert.equal(r.status, 0, r.out);
  const doc = JSON.parse(readFileSync(join(r.dir, "denominators.json"), "utf8"));
  assert.equal(doc.why, "first baseline");
  assert.equal(doc.counts["every route answers"], 7);
  assert.match(doc.blessed, /^\d{4}-\d{2}-\d{2}$/);
  rmSync(r.dir, { recursive: true, force: true });
});

test("a zero scope cannot be blessed into the baseline", () => {
  const r = run(["--bless", "--why", "x", "--", process.execPath, FIXTURE], { env: { DENOM_FIXTURE_ROUTES: "0" } });
  assert.equal(r.status, 2);
  assert.match(r.out, /refusing to bless a zero denominator/);
  rmSync(r.dir, { recursive: true, force: true });
});

test("a command that declares nothing is exit 1, not a pass", () => {
  const dir = withBaseline({ anything: 1 });
  const r = run(["--", process.execPath, "-e", "console.log('all good')"], { cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.out, /no `denominator: <label> n=<int>` lines/);
  rmSync(dir, { recursive: true, force: true });
});

test("a command that cannot be run is exit 2, not a pass", () => {
  const dir = withBaseline({ anything: 1 });
  const r = run(["--", join(dir, "no-such-binary-here")], { cwd: dir });
  assert.equal(r.status, 2, r.out);
  rmSync(dir, { recursive: true, force: true });
});

test("--pattern needs both named groups", () => {
  const dir = withBaseline({ anything: 1 });
  const r = run(["--pattern", "^(?<label>.+): (\\d+)$", "--", process.execPath, FIXTURE], { cwd: dir });
  assert.equal(r.status, 2);
  assert.match(r.out, /needs named groups/);
  rmSync(dir, { recursive: true, force: true });
});

test("--json prints the observed scopes", () => {
  const dir = withBaseline({ "every route answers": 7, "no em or en dash in maintained copy": 12 });
  const r = run(["--json", "--", process.execPath, FIXTURE], { cwd: dir });
  const payload = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
  assert.equal(payload.ok, true);
  assert.equal(payload.observed["every route answers"], 7);
  rmSync(dir, { recursive: true, force: true });
});

test("a broken baseline is exit 2, so it cannot read as agreement", () => {
  const dir = mkdtempSync(join(tmpdir(), "denom-"));
  writeFileSync(join(dir, "denominators.json"), "{ not json");
  const r = run(["--", process.execPath, FIXTURE], { cwd: dir });
  assert.equal(r.status, 2);
  assert.match(r.out, /not valid JSON/);
  rmSync(dir, { recursive: true, force: true });
});
