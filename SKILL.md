---
name: denominator
description: Use when writing, reviewing or relying on a check that runs over a set of things (a test or lint glob, a file walker, a list of packages or routes, a CI matrix) where a passing result could hide that the set shrank. Print how many items each assertion examined, derive the expected set from the filesystem or config instead of a hand-kept list, treat zero as a failure, and ratchet the counts so any change fails until someone approves it with a reason. Includes a zero-dependency Node script that enforces the ratchet. Whether a check can fail at all is red-before-green.
license: Apache-2.0
metadata:
  version: "0.1.0"
  homepage: "https://efaimo.com"
  verified_against: "2026-09-04"
---

# denominator

A check that passes tells you a numerator: zero problems. It almost never tells
you the denominator: how many things it looked at to find zero.

Nobody breaks a denominator on purpose. It falls on its own.

## The question

When a check passes, ask it one thing: **how many?**

Then ask the harder half: **how many should there be**, computed from somewhere
that is not the check's own code path. If the check counts the set and also
decides what the set is, it agrees with itself no matter how much it lost.

## Not every assertion has one

Two shapes, and only one of them can shrink:

| shape | example | denominator |
|---|---|---|
| set | "all 23 cited paths resolve" | 23, and it can fall to 19 without a word |
| point | "this folder is a repo and the doc says so" | none; it is one claim about one thing |

Give set assertions a count. Leaving point assertions alone is correct, not lazy.

## Three moves

**1. Print it.** Every passing assertion says how many things it covered. Put the
number in the output, not in your head:

```
PASS  every path CLAUDE.md cites resolves  23 paths
denominator: every path CLAUDE.md cites resolves n=23
```

**2. Derive it.** The expected set comes from the thing that grows, never from a
list someone maintains. A hardcoded list protects what its author remembered on
the day; the next item added is unprotected while the check stays green. Derive
it and a new item is a new obligation the moment it exists.

**3. Ratchet it.** Commit the counts. Fail when one moves. Growth counts too:
a scope that grew from 34 to 38 and then broke back to 34 satisfies any floor
of 34, and that is exactly how a real regression hides.

```sh
node "${CLAUDE_SKILL_DIR}/scripts/denominator.mjs" --bless --why "first baseline" -- node check.mjs
node "${CLAUDE_SKILL_DIR}/scripts/denominator.mjs" -- node check.mjs   # exit 1 when a scope moves
```

The script needs Node 20 or later and nothing else (where the variable is not
substituted, it sits at `scripts/denominator.mjs` next to this file). It runs
the command after `--` with your permissions, so treat it like running that
command yourself. The baseline is `denominators.json` in the working
directory.

This copy lives with the skill, not on a CI runner. To ratchet in CI, copy
`scripts/denominator.mjs` and `scripts/denominator-lib.mjs` into one folder of
the repository, keep the LICENSE and NOTICE beside them, and call
`node <folder>/denominator.mjs -- <your check>`.

<!-- until-published -->
An npm package of the same name is planned and not published yet, so nothing
here installs from npm.
<!-- /until-published -->

The tool is optional. The wire format is one line of output and the ratchet is
a committed JSON file, so a project that wants no extra files can implement
both itself; the discipline is the part that matters.

## Six ways a green check lies about its scope

- **nothing declared** - the run said nothing about what it examined. Not agreement.
- **zero** - it examined nothing and reported a result. A check with an empty
  input has no opinion. See `red-before-green` for the sibling case.
- **malformed** - a declaration that does not parse. It looks watched and is not.
- **duplicate** - one run gave two different counts for one label.
- **missing** - the baseline knows a scope the run never printed: renamed,
  removed, or silently skipped, and nothing else will notice.
- **moved** - the count changed. Down is a regression. Up wants a sentence.

## Getting the count from common tools

| tool | how many it examined |
|---|---|
| pytest | `pytest --collect-only -q`, last line `N tests collected` |
| jest | `jest --listTests`, one test file per line |
| eslint | `eslint -f json <paths>`, one array entry per file linted |
| tsc | `tsc --listFilesOnly -p .`, one file per line (filter out `node_modules` and the lib files) |
| ripgrep | `rg --files -g '<glob>'`, the files a search over that glob reads |
| CI matrix | the matrix in the workflow file against the jobs in the run summary |

## Do this

1. Run the check. Read its output for counts it already prints.
2. For each set assertion, emit `denominator: <label> n=<int>` on its own line.
   Nothing may follow the count.
3. Derive the expected set independently where you can: read the directory, not
   the array; read the workflow file, not your memory of it.
4. Bless a baseline with a reason. Commit it.
5. Wire the run into CI (copy the two scripts, as above). When a count moves,
   fix the check or bless the change.

## When not to use this

A one-off script you will delete. A check over a set that legitimately churns
every run, where a floor (`"9+"` in the baseline) is the honest form. And never
as a replacement for `red-before-green`: a check with the right denominator and
no ability to fail is still worthless.

## References

- `references/failures.md` - the taxonomy, each entry with a case that happened
- `references/deriving.md` - how to get an expected count that cannot agree with the bug

<!-- generated:siblings -->

## Siblings

Every skill in this set is about a report that was true about the wrong thing. The set: https://efaimo.com/skills

- `red-before-green` - first make sure the check can fail at all; the right denominator on a check that cannot go red is still worthless.
- `claim-sweep` - when a scope shrank because a fact moved and something stopped matching it.

<!-- /generated:siblings -->
