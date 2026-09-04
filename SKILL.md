---
name: denominator
description: Use when a check, test, lint, or audit comes back passing and you are about to trust it. Green reports a numerator; the denominator, how many things were actually examined, is rarely printed and narrows on its own when a glob, walker, carrier list, or CI matrix quietly shrinks.
license: Apache-2.0
metadata:
  version: "0.1.0"
  homepage: "https://efaimo.ai"
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
npm i -D github:efaimo-ai/denominator   # not on npm yet; this is the install
npx denominator --bless --why "first baseline" -- node check.mjs
npx denominator -- node check.mjs       # exit 1 when a scope moves
```

The tool is optional. The wire format is one `printf` and the ratchet is a
committed JSON file, so a project that does not want a dependency can implement
both in an afternoon; the discipline is the part that matters.

## Six ways a green check lies about its scope

- **nothing declared** - the run said nothing about what it examined. Not agreement.
- **zero** - it examined nothing and reported a result. A check with an empty
  input has no opinion. See `red-before-green` for the sibling case.
- **malformed** - a declaration that does not parse. It looks watched and is not.
- **duplicate** - one run gave two different counts for one label.
- **missing** - the baseline knows a scope the run never printed: renamed,
  removed, or silently skipped, and nothing else will notice.
- **moved** - the count changed. Down is a regression. Up wants a sentence.

## Do this

1. Run the check. Read its output for counts it already prints.
2. For each set assertion, emit `denominator: <label> n=<int>` on its own line.
   Nothing may follow the count.
3. Derive the expected set independently where you can: read the directory, not
   the array; read the workflow file, not your memory of it.
4. Bless a baseline with a reason. Commit it.
5. Wire the run into CI. When a count moves, fix the check or bless the change.

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

Every skill in this set is about a report that was true about the wrong thing. The set: https://efaimo.ai/skills

- `red-before-green` - first make sure the check can fail at all; the right denominator on a check that cannot go red is still worthless.
- `claim-sweep` - when a scope shrank because a fact moved and something stopped matching it.

<!-- /generated:siblings -->
