# Deriving an expected count that cannot agree with the bug

Printing a denominator is the easy half. The number is only worth something if
something independent expects it to be a particular value. The trap is that the
obvious source for that expectation is the check itself.

## The circularity

```
             the bug
                |
                v
   +------------------------+
   |  the check's own list   |  ---> examines 34 things
   +------------------------+
                |
                v
   +------------------------+
   |  expected, from the     |  ---> expects 34 things
   |  same list              |
   +------------------------+
                |
                v
              agrees
```

Anything the check derives from its own inputs will move with them. A list that
lives next to the code that reads it is a comment, not a check.

## Three sources that do not move with the bug

**The filesystem.** Ask the directory, not the array. A projects table checked
against a hardcoded set of nine names passes forever; checked against
`readdirSync(root).filter(hasGitDir)` it fails the day a tenth appears.

**A file somebody else maintains.** A preflight script that runs a list of steps
you typed is one layer above the bug it is meant to catch. A preflight script
that parses `ci.yml` with a YAML parser and runs the steps it finds cannot drift
from CI, because CI is the source. When a step appears there that the script
cannot classify, that is a hard stop, not a skip.

**A second implementation.** Two walkers over one tree that disagree, 34 against
38, is more informative than either number alone. The disagreement is the signal.
Keep the second implementation, or unify them and keep the byte-comparison of
their output as the proof they were unified.

## The rule for a hardcoded list

Sometimes you have to write one. If the source of truth is a human decision with
no machine-readable form, an array is honest. Two conditions make it safe:

1. **The list is derived from a file, not from memory.** A protect-list read out
   of a git exclude file grows when someone adds an exclusion. A protect-list
   typed into the checker protects what its author remembered that day, and the
   next document added is unprotected while the check stays green.
2. **A missing entry is red, not absent.** If an item named in the list is gone,
   say so. The failure mode of a hardcoded list is not a wrong entry; it is a
   missing one, and a missing one produces no output at all.

## Blessing, and what a reason is for

A baseline that changes without a sentence is a baseline nobody can audit. The
`--why` is not ceremony:

```
"why": "read-back joined the skill set, so the carrier count is 3 not 2"
```

is a reason. "update baseline" is a shrug. Six months later the only question
that matters about a count that moved is whether anyone looked, and the reason
field is the whole answer.

## Where the number should live

In the output, next to the assertion, in the run that produced it. Not in a
README, not in a comment, not in a dashboard assembled later. The count and the
claim have to travel together, or the next person to reword the claim will leave
the count behind, and the count will keep being true about something nobody is
asserting any more.
