# How a denominator falls

Every entry here is a shape, then a case where it actually happened. None of
them involved anyone breaking a check on purpose. That is the point: a
denominator is not attacked, it erodes, and the check keeps printing green the
whole way down.

## 1. The rule abstains because its input is absent

A rule guards against something, opens with a guard clause, and returns nothing
when the guard fires. Nothing is rendered as no problems.

```js
check(ctx) {
  if (!ctx.repo?.sdk) return [];   // no repo context -> no findings -> "clean"
  ...
}
```

**Case.** A linter for MCP servers has a rule that warns when a project depends
on the pre-2026-07-28 SDK line. Its published self-audit runs against a spawned
command rather than a source tree, so `ctx.repo` is undefined, the rule returns
`[]`, and the run prints `0 errors 0 warnings 0 info / no quality findings.
clean.` The project did depend on that SDK line. Pointing the same command at
the repo turned three findings into twelve.

**Tell.** Count the rules that ran, not the findings they produced. If a rule
can abstain, its abstention is a third state and it belongs in the output.

## 2. The walk stops early and does not say so

A recursive walker has a depth bound, an extension filter, or a rule about
hidden directories. Every one of those is a place the set can quietly get
smaller than the reader believes.

**Case.** A skill auditor never entered a directory whose name begins with a
dot, so `.claude/skills/`, the standard location, was invisible; its depth bound
of 3 also cut layouts one level deeper. On the same corpus it found 34 skills
where a sibling script found 38, and both printed their number with confidence.
The fix was two lines of policy and one of honesty: enter dot directories for
this one purpose, measure the depth bound instead of guessing it, and report
every directory the bound refused to enter.

**Tell.** A bound that truncates in silence is the same failure as a check that
examines nothing. Make the walker say what it declined to open.

## 3. A second carrier of the same fact appears

A value lives in more than one file. The check reads the carriers it knew about
when it was written. Someone adds a third.

**Case.** A name that is globally unique on a platform, and unchangeable after
creation, was asserted in three wiki pages. The check that guarded it extracted
the value from two of them and reported `2 carriers agree`. The third had been
holding the previous value since the day the name changed. The check had been
sabotage-tested and did go red on demand; it was simply pointed at two thirds of
the world.

**Tell.** Passing `red-before-green` proves a check can fail. It says nothing
about how much the check can see. These are different properties and you need
both.

## 4. The harvest returns nothing and nothing is compared

A check greps, matches, or globs, gets an empty result, finds no violations in
it, and passes.

**Case.** A gate tied a documentation sentence to a build constant by regular
expression. The sentence was reworded. The regex matched nothing, there were no
mismatches among the zero matches it found, and the gate went green over a claim
it was no longer reading. It now exits with a distinct code and asks to be
re-aimed.

**Tell.** Zero harvested is a failure, always. Write it as a hard error the day
you write the harvest, not the day it bites.

## 5. Only one cell of the matrix ran

CI runs four combinations. Your machine is one of them. "It passes locally" and
"CI will pass" are claims about different sets.

**Case.** Two pushes landed on a red CI in a row. Locally the typecheck, build
and tests were green; CI died on a dependency audit that nothing local ran. The
fix was not discipline but derivation: a preflight script that reads the
workflow file and runs the steps it finds, and whose summary line says out loud
that it is one cell of four.

**Tell.** State the denominator in the summary. "Passes" is a claim; "passes on
one of four configurations" is a measurement.

## 6. The count grew, then fell back

A floor is satisfied by the old number forever. A set that went 34 to 38 to 34
never breaks a floor of 34.

**Tell.** Record the exact count, not a minimum, unless the set genuinely churns.
Growth is worth a sentence too: it usually means the world changed and someone
should know which way.

## 7. The threshold, not the scope, is what narrowed

Everything ran, nothing abstained, and the tool was configured to care about
less.

**Case.** An audit gate runs at `--audit-level=high`. Two moderate advisories
sit under it permanently. That is a defensible threshold and an honest one only
while somebody says the two exist. Silence turns a threshold into a claim of
zero.

**Tell.** A filtered check should report what it filtered out, not just what
survived.
