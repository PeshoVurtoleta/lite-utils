# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Package scaffold: private, `node:test` only, no dependencies.
- `build.sh` + `lib/` + `src/`: shipped scripts are generated from `src/` + `lib/` fragments;
  `test/build.test.mjs` fails on drift (fresh build vs committed root script), on a stray root
  script, and when a malformed input (bad or missing marker, nested include, no final newline, a NUL byte,
  `src/build.sh`, an OUTDIR of `src/` or `lib/`, a `bash -n` failure, a later script failing) does not
  abort closed (exit 2, file named on stderr, no output changed, no temp leftovers). The drift check
  also compares the exec bits.
- `test/inlining-budget-diff.test.mjs`: `--self-test` exact count (43), an unmodified-copy
  baseline, and 12 mutant rows that must each turn the self-test red.
- `bytecode-budget.sh`: V8 bytecode length of named functions on one node binary. Report mode
  (`--fn A,B`, exit 0 REPORTED) or gate mode (`--max fn=N[,fn=N]` plus a required
  `--node-version vX.Y.Z`; exit 0 WITHIN, 1 OVER, 2 NO-VERDICT). Names match exactly and every
  same-name function is gated. Fails closed (NO-VERDICT, never OVER) on a node version mismatch
  (checked before any probe), a never-compiled function, an unknown header format, a driver failure,
  and when run k differs from run 1 (null control, `--runs` 2..20). Each length is REPORTED against
  this binary's inlining limits. Refuses before any node spawn (exit 2): a repeated value option
  (`--max a=1 --max b=2`, `--fn a --fn b`; give one comma list), a newline in `--fn` / `--max` /
  `--v8-flags`, a stray comma (`--max add=6,`, `--fn ,add`, `--fn add,,mid`), a `--v8-flags`
  `max*inlined*bytecode*` flag without an `=N` of 1..9 digits, a `reserve*inline*budget*` flag without
  an `=X` of N or N.M, N and M of 1..9 digits (`=1.5` runs; `=abc`, `=.5` refused), the negated forms of those two
  budget flags
  (V8 spells them `no` + optional `-` / `_`: `--no-max-inlined-bytecode-size=5`, `--no_...`, `--nomax-...`,
  `--no-reserve-inline-budget-scale-factor=1.5`, `--noreserve-...`), `--self-test` combined with anything but
  `--fixtures DIR`, an empty separate value for any value option (`--fixtures ''`, `--out ''`), an
  empty `--opt=` value (`--fn=`, `--runs=`), `--self-test` / `--help` with `=value`, and a `--v8-flags`
  of only blanks (`' '`, a tab). The node version must match exactly (v26.8.2-pre is not v26.8.2).
  `--self-test` (49 canned checks; the 4 ref / file rows need git: with no git on PATH they are one
  FAIL line and `--self-test` exits 1) and `--self-test --fixtures DIR` (+24 checks on node v26.8.2
  captures in `test/fixtures/bytecode-budget/node-26.8.2/`).
  DETERMINISTIC (gated in `npm test` via `test/bytecode-budget.test.mjs`, 145 tests): the exact
  self-test counts (49 and 49+24), 19 self-test mutant rows (12 report/gate, 3 of them on the length
  cap, + 7 diff) plus a NODE_OPTIONS-leak and a version-prefix mutant that must each be caught, gate
  rows on a fake node, 48 refusal rows with 0 node spawns (41 report/gate + 7 diff), the driver cwd,
  spawn and retention counts (8 spawns for 3 fns x 2 runs), and a live pair on node v26.8.2
  (`mid=211` exit 0, `mid=210` exit 1; on any other node the pair must exit 2 with a version-mismatch
  NO-VERDICT).
  REPORTED (not gated): 20/20 runs per side of `--max add=6,mid=211,dup=19` / `mid=210`, one
  distinct output with 0x stripped (2026-11-02, Darwin arm64, node v26.8.2, script sha256 a26e9f15,
  load1 2.31 before / 2.49 after, 4 other node processes before / 8 after, none >= 10% CPU before,
  one after (another package's `node --test`)).
- `bytecode-budget.sh --diff`: the same named functions in two drivers on one node binary, their
  length multisets compared. `--diff --fn LIST DRIVER_BEFORE DRIVER_AFTER` (`--node-version`,
  `--runs`, `--node`, `--v8-flags`, `--out` as in report mode; `--max` is refused). Per fn: SAME
  (identical multiset), DIFF (the multisets differ; each length whose count differs is listed as
  `before=<n> after=<m>  <len>`) or NO-VERDICT. The compare is order-free and counts duplicates
  (6,19 equals 19,6; 6 differs from 6,6). The node version is checked once, before any probe (one
  binary for both sides; a mismatch is NO-VERDICT for every fn). Each side is judged on its own with the
  null control (run 1 vs runs 2..N) and every other report-mode guard (never-compiled, unknown format,
  driver failure); a NO-VERDICT on either side is NO-VERDICT, never DIFF. The verdict is the worst over
  fns (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT. The head names
  `before` and `after` with each driver's `sha256/8`. `--out DIR` keeps `report.txt` plus
  `raw/before/<fn>.<k>.txt` and `raw/after/<fn>.<k>.txt` (gate and report mode still write
  directly under `raw/`). Spawns: 1 `--version`, 1 `--v8-options`, then fn x runs x 2 probes
  (3 fns x 2 runs = 14). Refuses with exit 2 and 0 spawns: `--diff` with `--max`, a count of
  DRIVERs other than two, `--diff` twice, `--diff=x`, `--self-test` with `--diff`, and two
  DRIVERs without `--diff` (unchanged). Tier: DETERMINISTIC (both drivers on the same node binary;
  any run-to-run change on either side is NO-VERDICT). Gated in `test/bytecode-budget.test.mjs`:
  9 diff rows on a fake node, each also run on the pre-diff build a26e9f15 (`git show
  b376a5a:bytecode-budget.sh`, skipped when git history is absent), where it must exit 2
  "unknown option --diff"; mutants M1-M6, a
  missing-FINAL control, a deleted `--diff`/`--max` exclusion check, and a raw-name mutant
  in each of report and diff mode, each of which must turn its row red; 7 of the 19
  self-test mutant rows cover diff; and a live pair on node v26.8.2 (a driver against itself ->
  SAME, against a copy with one function made longer -> DIFF; on any other node exit 2).
  Also gated in `test/bytecode-budget-diff-boundary.test.mjs` (36 tests: 12 rows, each with a
  "teeth" twin that must be red on the a26e9f15 base, 24 tests; 1 parity test; 2 parity mutants;
  1 header-sha mutant; M-two-loops, M-sort-text, M-runs-wide, M-ver-skip-diff, M-prefix-match
  and M-no-cap;
  2 A4 retention mutants). It covers: A1 parity of report, gate and refusal cases (10 cases
  including a gate `--out` tree) against the pre-diff build a26e9f15 (stdout, stderr, rc, spawn count,
  `--out` tree), with two parity mutants that must differ from the base; the header `sha256/8` of
  each side (own file, not the other's); the probe order `b a b a b a` for `--runs 3` (and 2 and 20);
  numeric, not text, ascending order of the count lines (9 20 100 3000); the `--runs` refusal matrix
  (1, 21, 0, -1, -0, NaN, null, undefined, 020, 1.5, 2e1 and the 2^30 .. 2^53 values up to
  9007199254740992, plus `--fn mid,mid` and an empty `--runs=`: exit 2, 0 spawns) and `--runs` 2 / 20 /
  02 running 6 / 42 / 6 spawns; the length matrix (L | L -> SAME and L | L+1 -> DIFF at L = 0, 1,
  99999999, 100000000, 999999998; 999999999 | 1000000000 -> NO-VERDICT on the after side only; a
  length of 10+ digits (1000000000, 2^30, 2^31-1, 2^32, 2^53, 2^53+1, 20 digits) on both sides ->
  NO-VERDICT unknown format, never SAME or DIFF, which M-no-cap (the 686de5bf length scan) turns
  red); the diff-mode `--node-version` check
  (a match runs 6 spawns; a mismatch exits 2 after exactly 1 spawn, one NO-VERDICT line per fn);
  exact function names (`read` never matches `read.set`, `readAll`, `Store.read`); driver stderr (plain
  stderr keeps the verdict; a header-shaped stderr line is NO-VERDICT, unknown format); the same
  basename for both drivers (each side runs with cwd = its own dir); `--out` into an existing
  directory (other files kept, `raw/before` and `raw/after` created; a `raw/` holding an empty
  `before/` is refused with 0 spawns); an adversarial driver (BEFORE rewrites the AFTER capture
  between runs, or deletes the AFTER driver: NO-VERDICT, never SAME or DIFF); and A4 retention
  controls (a diff run without `--out` leaves nothing in TMPDIR or the cwd; two mutants that keep
  the report in a temp file or in the cwd must leave an entry). The a26e9f15 rows (parity, parity
  mutants, teeth twins) are skipped when `git show b376a5a:bytecode-budget.sh` fails (no git
  history); the other rows still run.
  REPORTED (not gated): 20 runs per pair of the diff mode on build 686de5bf (HEAD 41720de, before
  the F1 length cap), untimed (output determinism, no quiet lock): 2026-11-02T05:49Z, Darwin arm64, node
  v26.8.2, script sha256/8 686de5bf, driver 01d34da8 against itself and against an edited copy
  32c8f433 (`mid` made longer). 4 pairs: self `add,mid,dup` -> SAME, exit 0 in 20 of 20; self `mid`
  -> SAME, exit 0 in 20 of 20; edit `mid` -> DIFF (211 -> 220), exit 1 in 20 of 20; edit
  `add,mid,dup` -> DIFF, exit 1 in 20 of 20; one distinct set of per-fn verdict lines per pair.
  load1 4.61 before / 4.21 after; 2 other node processes at >= 10% CPU before and 2 after, all from
  LiteSignal (before: two `bench/soak/main.mjs`; after: `bench/soak/calibration/calibrate.mjs` and a
  `node --test test/43-soak-model.test.mjs` child). An earlier 20/20 run on the B1 build 06cb4911
  (load1 4.16 before / 3.95 after, 2 node processes before / 0 after, none >= 10% CPU) gave the same
  verdicts. The shipped 9173830d (F1) was not rerun 20/20; its live diff pair runs once per `npm test`.
- `bytecode-budget.sh --diff`, ref and file mode, and `lib/stage.sh` (new fragment, built into the
  script): the same diff, but each side is one module file staged by the script instead of two
  DRIVER paths. Ref mode: `--diff --fn LIST --before-ref R1 --after-ref R2 --module REL --driver D
  --out DIR` (each side is `git cat-file blob <sha>:REL`: plumbing, no textconv, frozen by
  construction). File mode: `--diff --fn LIST --before FROZEN --after LIVE --driver D --out DIR`
  (each side is a `cp`, so an edit after staging cannot leak in). `--out DIR` is required and
  `DIR/stage` must be absent or empty; `DIR/stage/before` and `DIR/stage/after` each get the module
  as NAME plus a copy of `--driver`, and each driver runs there (cwd = its own stage dir; the driver
  must import `./NAME`). One module file per side: a module with relative imports of its own fails
  closed (its driver exits non-zero: NO-VERDICT). Verdicts, exit codes (0 SAME, 1 DIFF, 2
  NO-VERDICT), the null control and the spawn count are those of diff mode; `DIR` holds
  `report.txt`, `raw/` and `stage/`. The head reads `before  REF @ <sha12>  REL  sha256/8 x` (ref)
  or `before  <abs FILE>  sha256/8 x` (file), the same for `after`, then `driver  <abs>  sha256/8
  x`, where x is the staged copy's; when the two staged modules are byte-identical a NOTE line says
  the run is a null control (expect SAME). The mode line reads `diff (ref)` or `diff (file)`. Both
  modes refuse with exit 2, 0 spawns and nothing written to `--out`: the two kinds mixed or
  half-given, DRIVER paths, a missing `--out` / `--driver`, a non-empty `DIR/stage`, a newline in a
  path option, no git on PATH, any of the six `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`,
  `GIT_OBJECT_DIRECTORY`, `GIT_COMMON_DIR`, `GIT_CEILING_DIRECTORIES` set (each can make a tracked
  `--before` read as untracked: every repo is found from its path), a driver with the module's file
  name or without `'./NAME'` or `"./NAME"`, and a ref that is not a commit, starts with `-`, or
  lacks `REL` (`REL` relative, no empty, `.` or `..` segment). File mode also refuses `--module`,
  and a `--before` that is not a frozen copy: it, or the end of its symlink chain, is git-tracked;
  it is the same device:inode as a tracked `<top>/Signal.js` or `<top>/<same name>` (`<top>` = the
  repo around the cwd, `--after`, `--before` and its link target, and `--repo`); or it is the same
  file as `--after` (a hard link or symlink anywhere). NOT detected (also in `-h`): a driver that
  reaches the live module by another path (an absolute path or a package self-reference) instead of
  `./NAME`; a hard link of `--before` to a tracked file that is not `--after`, `<top>/Signal.js` or
  `<top>/<same name>`; a git error while checking (e.g. safe.directory "dubious ownership") reads as
  untracked, so a tracked `--before` behind it is not refused. Tier: DETERMINISTIC (one node binary;
  each staged side keeps its null control). Gated in `npm test` by
  `test/bytecode-budget-stage.test.mjs` (113 tests; they need git and skip without it): verdict rows
  on a fake node whose length is the staged module's bytes (r1 = 211, r2 = 212, hand-derived),
  refusal rows (exit 2, 0 spawns, the OUT dir is not created, except the stage-not-empty row, which
  starts from an existing OUT holding stage/junk and a 4-byte report.txt and leaves it as it was:
  report.txt still 4 bytes, no raw/), each row also run on the pre-staging build 9173830d (`git show
  6835177:bytecode-budget.sh`, skipped without git history), where it must exit 2 "unknown option"
  naming its first staged option (--before-ref or --before; --after-ref, --driver, --repo or --module
  on the 4 rows that start with one); mutants
  M7-M13, M-stage-order, M-git-env (x4), G2 x3, U1-U3 and STAGE_SAME-forced-1, each of which must
  turn its row red; retention (20 ref runs, each into a new `--out`: 0 entries left in TMPDIR and
  the cwd, the repo untouched, exactly 17 files per `--out`) with a mutant that stages under TMPDIR;
  and the `--self-test` count rows (49 ok, with the 4 staged checks present once each, absent from
  the 9173830d build; self-test mutants M7 and M10; a PATH without git -> exit 1 with one FAIL line;
  the six GIT_* vars set -> still 49 ok). No REPORTED (timed or measured) numbers exist for this
  entry.
- `bytecode-budget.sh --diff` ref / file staging, QA boundary rows. Tier: DETERMINISTIC. Gated in `npm test`
  by `test/bytecode-budget-stage-boundary.test.mjs` (63 tests; they need git and skip without it): 24
  boundary rows, each with a teeth twin on the pre-staging build 9173830d (`git show
  6835177:bytecode-budget.sh`) where it must exit 2 "unknown option" and its own check must go red; 5
  `--self-test` rows (a real git < 2.32, skipped here; an emulated git < 2.32 and its 9173830d twin; a
  SIGINT run on this build and on 9173830d); and 10 one-edit mutant tests (8 distinct exact-once edits of a
  copy of the script; each must turn its row red). Row groups: ref names (odd bytes, a rev expression, an
  annotated tag, a tag that is also a branch), a leading-dash `--before` / `--after` / `--out`, driver and
  module file names that contain or start with the module name, `--out` with spaces (exactly 17 files), an
  existing but empty `OUT/stage` (allowed) versus one holding a file (refused), and a `--self-test` run with
  a git older than 2.32. A real git < 2.32 row is skipped on git 2.54.0. KNOWN GAPS, pinned as current
  behaviour (not features; each is a later code fix): a git-tracked symlink as `--module` stages the link
  and ends NO-VERDICT (driver exits non-zero) after 6 spawns; `git replace` of the module's blob changes the
  staged bytes (the script does not pass `--no-replace-objects`); `OUT/stage` as a regular file is refused
  with the reason "is not empty"; an emulated git < 2.32 with `tag.gpgSign=true` makes `--self-test` exit 1
  (its tag helper lacks `-c tag.gpgSign=false`); SIGINT during `--self-test` leaves its temp dir (no INT /
  TERM trap; pre-existing, not new in group 2b). `npm test`: 401 tests, 400 pass, 1 skip, 0 fail (node
  v26.8.2, bash 3.2.57, git 2.54.0).
  REPORTED (not gated, untimed, a maintainer-side evidence script, not shipped): ref mode with real node
  v26.8.2 on the bundled driver split into a driver and a module: commits that differ only outside the
  probed add / mid -> SAME in 20 of 20 runs; a longer `mid` (211 -> 223) -> DIFF in 20 of 20 runs
  (2026-11-02T14:54Z, Darwin arm64, script sha256/8 99790884, load1 1.85 before / 1.61 after, quiet-lock
  QUIET, no other node process; about 19 s).

### Changed

- `bytecode-budget.sh` report and gate mode: an unreadable DRIVER (chmod 000) is now refused before any
  node spawn ("DRIVER not found (or not a readable file): X", exit 2). It used to be probed and ended
  "driver exited 1" NO-VERDICT, also exit 2.
- `inlining-budget-diff.sh` is now generated from `src/` + `lib/`; the output is byte-identical to
  7f0ba7b (sha256 740da13b...).
- `lib/v8probe.sh` (LIMITS_AWK, BYTECODE_AWK) and `lib/v8limits.sh` (the limits read and `lim`)
  are cut verbatim from `src/inlining-budget-diff.sh` and shared with `bytecode-budget.sh`; the
  generated `inlining-budget-diff.sh` stays byte-identical (sha256 740da13b...).

### Fixed

- `bytecode-budget.sh` read any digit run after `Bytecode length:` as a length. awk doubles lose
  precision past 2^53 and bash `(( ))` wraps past 2^63, so diff mode read 2^53 | 2^53+1 as SAME and
  gate mode passed 2^63 and 2^64+1 against `--max mid=6` as WITHIN (exit 0). A length must now have
  1..9 digits (< 10^9: exact in awk doubles and bash `(( ))`; real V8 bytecode lengths are far
  smaller); a longer one is NO-VERDICT (unknown format) in report, gate and diff mode. `--self-test`
  gains a length-cap check (999999999 is a length; 1000000000, 2^53+1 and 0000000006 are not) and a
  diff null-control check per side (run 2 changes on the before or the after side -> NO-VERDICT
  naming that side); `-h` documents that a node version mismatch in diff mode prints
  `<fn>: NO-VERDICT -- node version mismatch: ...` with no before / after prefix (help text, not
  gated; the printed line is pinned by the boundary `--node-version` row and a `--self-test`
  check). Tier: DETERMINISTIC. Gated in `test/bytecode-budget.test.mjs` by 3 length-cap rows (report, gate,
  diff), each with a teeth twin that must be red on 686de5bf (`git show 41720de:bytecode-budget.sh`, skipped
  when git history is absent) and with cap-8 and cap-10 mutants (999999999 must still be a length,
  1000000000 must not), by cap-off / cap-8 / cap-10 rows that must turn `--self-test --fixtures` red, by
  st-M5 and st-M6 self-test mutant rows, and in `test/bytecode-budget-diff-boundary.test.mjs` by the length
  matrix (valid lengths up to 999999999; 10+ digits NO-VERDICT) with an M-no-cap mutant.
