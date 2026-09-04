// denominator - the library half.
//
// A check that passes reports a numerator: zero problems. The denominator, how
// many things it actually looked at, is almost never printed and is almost
// never what the reader assumes. It shrinks on its own: a glob stops matching,
// a walker's depth bound bites, a rule abstains because its input is absent, a
// new carrier of the same fact is added somewhere the check does not read.
//
// This module is three small pieces: emit a declaration, harvest declarations
// out of arbitrary output, and compare a harvest against a committed baseline.
// Nothing here touches the filesystem or the network; the CLI does that.

/**
 * The wire format. One line, greppable, emittable from any language with a
 * print statement. Deliberately not JSON: a check that has to build a JSON
 * document to say "I looked at 19 things" will not bother.
 *
 *   denominator: cited repo paths are public n=19
 *
 * The label is everything between the marker and the count, so it may contain
 * spaces. `n=` is the terminator, which is why it comes last.
 */
export const MARKER = /^[ \t]*denominator:[ \t]+(?<label>\S.*?)[ \t]+n=(?<n>\d[\d,]*)[ \t]*$/;

/** Build the line a check should print. Use this instead of hand-writing it. */
export function declare(label, n) {
  const clean = String(label).trim();
  if (!clean) throw new Error("denominator: a declaration needs a label");
  if (!Number.isInteger(n) || n < 0) throw new Error(`denominator: n must be a non-negative integer, got ${n}`);
  if (/[\r\n]/.test(clean)) throw new Error("denominator: a label cannot span lines");
  if (/\sn=\d/.test(` ${clean}`)) throw new Error(`denominator: label "${clean}" contains its own n=, which would split the parse`);
  return `denominator: ${clean} n=${n}`;
}

/**
 * Pull declarations out of a run's combined output.
 *
 * `pattern` lets you wrap a tool you do not control, as long as it already
 * prints a count: pass a RegExp with named groups `label` and `n`. That mode is
 * strictly worse than emitting the marker, because you are now parsing prose
 * that nobody promised to keep stable, and it is offered for the case where
 * changing the tool is not yours to do.
 *
 * Returns { counts: Map<string, number>, duplicates: string[] }. A label that
 * appears twice with DIFFERENT counts is a duplicate: the run disagrees with
 * itself about its own scope, and picking either number would be a guess.
 */
export function harvest(text, pattern = MARKER) {
  const counts = new Map();
  const duplicates = [];
  const malformed = [];
  const usingMarker = pattern === MARKER;
  for (const line of String(text).split(/\r?\n/)) {
    const m = pattern.global || pattern.sticky ? matchOnce(pattern, line) : line.match(pattern);
    if (!m?.groups?.label || m.groups.n === undefined) {
      // A line that tried to be a declaration and failed is the worst outcome
      // this format can produce: the author believes the scope is watched and
      // it is not. Trailing prose after the count is the common way in.
      if (usingMarker && /^[ 	]*denominator:/.test(line)) malformed.push(line.trim());
      continue;
    }
    const label = m.groups.label.trim();
    const n = Number(String(m.groups.n).replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (counts.has(label) && counts.get(label) !== n) {
      if (!duplicates.includes(label)) duplicates.push(label);
    }
    counts.set(label, n);
  }
  return { counts, duplicates, malformed };
}

function matchOnce(re, line) {
  re.lastIndex = 0;
  return re.exec(line);
}

/**
 * Baseline shape:
 *
 *   { "blessed": "2026-09-04", "why": "...", "counts": { "label": 19, "other": "7+" } }
 *
 * A plain integer is EXACT: the set is supposed to be stable, and any movement
 * in either direction wants a human sentence. A "N+" string is a FLOOR: the set
 * is supposed to grow, so growth passes and shrinkage does not.
 *
 * Exact is the default on purpose. A floor cannot catch the case this tool was
 * written for, where a count grew to 38, broke back to 34, and the floor of 34
 * was still satisfied.
 */
export function parseBaseline(raw) {
  let doc;
  try {
    doc = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error(`denominator: the baseline is not valid JSON (${e.message})`);
  }
  if (!doc || typeof doc !== "object" || !doc.counts || typeof doc.counts !== "object") {
    throw new Error('denominator: the baseline needs a "counts" object');
  }
  const expect = new Map();
  for (const [label, value] of Object.entries(doc.counts)) {
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value < 0) throw new Error(`denominator: "${label}" has a non-integer count`);
      expect.set(label, { n: value, kind: "exact" });
    } else if (typeof value === "string" && /^\d+\+$/.test(value)) {
      expect.set(label, { n: Number(value.slice(0, -1)), kind: "floor" });
    } else {
      throw new Error(`denominator: "${label}" must be an integer or a "N+" floor, got ${JSON.stringify(value)}`);
    }
  }
  return { expect, blessed: doc.blessed ?? null, why: doc.why ?? null };
}

/** Serialise a harvest back out as a baseline document. */
export function toBaseline(counts, { why, blessed, previous } = {}) {
  const kinds = new Map();
  if (previous) for (const [label, spec] of previous.expect) kinds.set(label, spec.kind);
  const out = {};
  for (const label of [...counts.keys()].sort()) {
    const n = counts.get(label);
    out[label] = kinds.get(label) === "floor" ? `${n}+` : n;
  }
  return { blessed: blessed ?? new Date().toISOString().slice(0, 10), why: why ?? "", counts: out };
}

/**
 * The whole judgement, in one place.
 *
 * Six ways a green check can be lying about its scope, and every one of them
 * has actually happened to somebody:
 *
 *   no-declarations  nothing was harvested. An empty harvest is not agreement;
 *                    it is a run that said nothing about what it examined.
 *   zero             a check examined zero things and passed. Always a failure,
 *                    even blessed: a check with an empty input has no opinion.
 *   malformed        a line began with the marker and did not parse, so its
 *                    scope went unwatched while looking watched. Usually prose
 *                    after the count.
 *   duplicate        one run reported two different counts for one label.
 *   missing          the baseline knows this label and the run did not print it.
 *                    This is the silent-deletion case: the check stopped running,
 *                    got renamed, or its output moved, and nothing else notices.
 *   unblessed        the run declared a label the baseline has never seen. A
 *                    denominator nobody wrote down is a denominator nobody watches.
 *   moved            the count changed. Shrinkage always; growth too, unless the
 *                    baseline marked that label as a floor with "N+".
 */
export function compare(harvested, baseline) {
  const problems = [];
  const { counts, duplicates, malformed = [] } = harvested;

  for (const line of malformed) {
    problems.push({
      kind: "malformed",
      message: `this line starts a declaration and does not parse, so its scope is not watched: ${JSON.stringify(line)}. The declaration owns its line: nothing may follow the count.`,
    });
  }

  if (counts.size === 0) {
    problems.push({
      kind: "no-declarations",
      message:
        "no `denominator: <label> n=<int>` lines in the run's output. Nothing to compare is not the same as nothing wrong: either the check stopped declaring, or it never did, or it did not run at all.",
    });
    return { ok: false, problems };
  }

  for (const label of duplicates) {
    problems.push({ kind: "duplicate", label, message: `"${label}" was declared twice with different counts in one run` });
  }

  for (const [label, n] of counts) {
    if (n === 0) {
      problems.push({
        kind: "zero",
        label,
        observed: 0,
        message: `"${label}" examined 0 things and reported a result. A check with an empty input has no opinion to report.`,
      });
    }
  }

  for (const [label, spec] of baseline.expect) {
    if (!counts.has(label)) {
      problems.push({
        kind: "missing",
        label,
        expected: spec.n,
        message: `"${label}" is in the baseline at ${spec.n} but the run never declared it. The check was renamed, removed, or silently skipped.`,
      });
    }
  }

  for (const [label, n] of counts) {
    const spec = baseline.expect.get(label);
    if (!spec) {
      problems.push({
        kind: "unblessed",
        label,
        observed: n,
        message: `"${label}" declared n=${n} and the baseline has never seen it. Bless it so a later change to it can be noticed.`,
      });
      continue;
    }
    if (n === 0) continue; // already reported, and the shrink line would be noise
    if (n < spec.n) {
      problems.push({
        kind: "moved",
        label,
        observed: n,
        expected: spec.n,
        direction: "shrank",
        message: `"${label}" examined ${n}, down from ${spec.n}. It still passed, over a smaller set.`,
      });
    } else if (n > spec.n && spec.kind === "exact") {
      problems.push({
        kind: "moved",
        label,
        observed: n,
        expected: spec.n,
        direction: "grew",
        message: `"${label}" examined ${n}, up from ${spec.n}. Growth is recorded too, so a later fall back to ${spec.n} cannot hide inside it.`,
      });
    }
  }

  return { ok: problems.length === 0, problems };
}
