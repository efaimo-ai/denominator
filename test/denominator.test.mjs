// Tests for the library half. The CLI half is covered in cli.test.mjs, which
// spawns the real binary, because the two things most likely to be wrong here
// are the exit code and the spawn, and neither exists at this level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { declare, harvest, parseBaseline, toBaseline, compare, MARKER } from "../src/index.mjs";

const base = (counts) => parseBaseline({ counts });
const runOf = (pairs) => harvest(pairs.map(([l, n]) => declare(l, n)).join("\n"));

test("declare produces a line harvest can read back", () => {
  const line = declare("cited repo paths are public", 19);
  assert.equal(line, "denominator: cited repo paths are public n=19");
  const { counts } = harvest(line);
  assert.equal(counts.get("cited repo paths are public"), 19);
});

test("declare refuses input that would corrupt the parse", () => {
  assert.throws(() => declare("", 1), /needs a label/);
  assert.throws(() => declare("x", 1.5), /non-negative integer/);
  assert.throws(() => declare("x", -1), /non-negative integer/);
  assert.throws(() => declare("a\nb", 1), /cannot span lines/);
  // A label that ends in its own count would split at the wrong place.
  assert.throws(() => declare("files n=3", 1), /contains its own n=/);
});

test("harvest finds declarations inside unrelated output", () => {
  const out = [
    "PASS  every project has a row",
    "denominator: every project has a row n=9",
    "some other line about n=99 that is not a declaration",
    "PASS  the route list matches",
    "  denominator: the route list matches n=7  ",
  ].join("\n");
  const { counts } = harvest(out);
  assert.deepEqual([...counts.entries()].sort(), [
    ["every project has a row", 9],
    ["the route list matches", 7],
  ]);
});

test("harvest reads grouped digits and ignores a bare number", () => {
  const { counts } = harvest("denominator: tokens weighed n=34,206");
  assert.equal(counts.get("tokens weighed"), 34206);
  assert.equal(harvest("n=5").counts.size, 0);
});

test("harvest flags one run that reports two counts for one label", () => {
  const { counts, duplicates } = harvest("denominator: files n=3\ndenominator: files n=4");
  assert.deepEqual(duplicates, ["files"]);
  assert.equal(counts.get("files"), 4);
  // Repeating the SAME count is not a disagreement.
  assert.deepEqual(harvest("denominator: files n=3\ndenominator: files n=3").duplicates, []);
});

test("a custom pattern can wrap a tool that already prints a count", () => {
  const out = "OK  routes checked: 7\nOK  files checked: 12";
  const re = /^OK\s+(?<label>.+?) checked: (?<n>\d+)$/;
  const { counts } = harvest(out, re);
  assert.deepEqual([...counts.entries()], [
    ["routes", 7],
    ["files", 12],
  ]);
});

test("an empty harvest is a failure, not agreement", () => {
  const r = compare(harvest("nothing here"), base({ anything: 1 }));
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kind, "no-declarations");
  // And it says so alone: piling on missing-label noise would bury the cause.
  assert.equal(r.problems.length, 1);
});

test("a matching run passes", () => {
  const r = compare(runOf([["a", 9], ["b", 7]]), base({ a: 9, b: 7 }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test("a shrunken scope fails even though the check itself passed", () => {
  const r = compare(runOf([["skills walked", 34]]), base({ "skills walked": 38 }));
  assert.equal(r.ok, false);
  const p = r.problems.find((x) => x.kind === "moved");
  assert.equal(p.direction, "shrank");
  assert.equal(p.observed, 34);
  assert.equal(p.expected, 38);
});

test("growth fails on an exact count and passes on a floor", () => {
  assert.equal(compare(runOf([["rows", 10]]), base({ rows: 9 })).ok, false);
  assert.equal(compare(runOf([["rows", 10]]), base({ rows: "9+" })).ok, true);
  // A floor still catches the fall.
  assert.equal(compare(runOf([["rows", 8]]), base({ rows: "9+" })).ok, false);
});

test("a label the baseline knows and the run never printed is the deletion case", () => {
  const r = compare(runOf([["a", 1]]), base({ a: 1, b: 4 }));
  const p = r.problems.find((x) => x.kind === "missing");
  assert.equal(p.label, "b");
  assert.match(p.message, /renamed, removed, or silently skipped/);
});

test("a scope nobody blessed is reported, so it cannot drift unwatched", () => {
  const r = compare(runOf([["brand new", 5]]), base({}));
  assert.equal(r.problems.find((x) => x.kind === "unblessed").label, "brand new");
});

test("zero is a failure even when the baseline says zero", () => {
  const r = compare(runOf([["files scanned", 0]]), base({ "files scanned": 0 }));
  assert.equal(r.ok, false);
  assert.equal(r.problems.filter((p) => p.kind === "zero").length, 1);
  // and it is not double-reported as a shrink
  assert.equal(r.problems.filter((p) => p.kind === "moved").length, 0);
});

test("the baseline rejects shapes it cannot ratchet", () => {
  assert.throws(() => parseBaseline("{ not json"), /not valid JSON/);
  assert.throws(() => parseBaseline({}), /needs a "counts" object/);
  assert.throws(() => parseBaseline({ counts: { a: 1.5 } }), /non-integer/);
  assert.throws(() => parseBaseline({ counts: { a: "lots" } }), /integer or a "N\+" floor/);
  assert.throws(() => parseBaseline({ counts: { a: "+5" } }), /integer or a "N\+" floor/);
});

test("blessing keeps a floor a floor", () => {
  const previous = parseBaseline({ counts: { grows: "5+", fixed: 3 } });
  const doc = toBaseline(new Map([["grows", 9], ["fixed", 3]]), { why: "r", previous });
  assert.equal(doc.counts.grows, "9+");
  assert.equal(doc.counts.fixed, 3);
  assert.equal(doc.why, "r");
});

test("the marker is anchored, so prose about it is not a declaration", () => {
  assert.equal(MARKER.test("denominator: label n=3"), true);
  assert.equal(MARKER.test("see denominator: label n=3"), false);
  assert.equal(MARKER.test("denominator: label n=3 and more"), false);
  assert.equal(MARKER.test("denominator: n=3"), false);
});
