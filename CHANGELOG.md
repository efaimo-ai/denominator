# Changelog

All notable changes to denominator are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-04

> **Not on npm at the time of writing.** The `v0.1.0` tag fired the release
> workflow on 2026-09-04 and npm answered `404 PUT /denominator`: trusted
> publishing is configured from an existing package's settings page, so it
> cannot create a package that has never been published. The first publish has
> to come from an authenticated session and will therefore carry no provenance;
> every version after it will. Until then, run it with
> `npx -y github:efaimo-ai/denominator`.

First release. A skill and a CLI for the same idea: a check that passes reports
a numerator, and the denominator it found that numerator over is rarely printed
and rarely stable.

### Added

- **The wire format.** One line per set assertion, `denominator: <label> n=<int>`,
  emittable from any language with a print statement. A line that begins with the
  marker and does not parse is reported rather than skipped, because a
  declaration that looks watched and is not is the worst thing this format can
  produce.
- **`denominator -- <command>`.** Wraps a check, passes its output through
  unchanged, harvests declarations, and compares them against a committed
  baseline. Three exit codes: 0 matched, 1 a scope moved, 2 the run could not be
  measured at all. The wrapped command's own exit code survives a clean compare.
- **`--bless --why "<reason>"`.** Records the observed counts. The reason is
  required: a baseline that changes without a sentence cannot be audited later.
- **Exact and floor baselines.** An integer is exact, a `"N+"` string is a floor.
  Exact is the default because a floor cannot catch a scope that grew from 34 to
  38 and then broke back to 34.
- **Seven verdicts**: nothing declared, zero, malformed, duplicate, missing,
  unblessed, moved. Each one is a way a green check can be covering less than
  the reader thinks.
- **`--pattern`** for wrapping a tool you do not control that already prints a
  count, with named groups `label` and `n`.
- **The skill.** `SKILL.md` plus `references/failures.md` (the taxonomy, each
  entry with a case that actually happened) and `references/deriving.md` (how to
  get an expected count that cannot agree with the bug).

### Fixed before it shipped

- **A shell rewriting the payload it carried.** The first version spawned the
  wrapped command with `shell: true` on Windows so that `.cmd` shims would
  resolve. Node concatenates rather than escapes in that mode, so a
  `C:\Program Files\...` executable path arrived at the shell as `C:\Program`,
  and ten of the fifteen CLI tests went red on their first run. It now spawns
  without a shell and retries through one only for a bare command name, with a
  command line it quoted itself.
- **A dead child finishing the run.** A failed spawn emits `close` after
  `error`, so the direct child's close arrived before the retry produced
  anything and the run was judged on an empty capture. The retry is now latched.

[0.1.0]: https://github.com/efaimo-ai/denominator/releases/tag/v0.1.0
