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
  `test/bytecode-budget-stage.test.mjs` (119 tests; they need git and skip without it): verdict rows
  on a fake node whose length is the staged module's bytes (r1 = 211, r2 = 212, hand-derived),
  refusal rows (exit 2, 0 spawns, the OUT dir is not created, except the stage-not-empty row, which
  starts from an existing OUT holding stage/junk and a 4-byte report.txt and leaves it as it was:
  report.txt still 4 bytes, no raw/), each row also run on the pre-staging build 9173830d (`git show
  6835177:bytecode-budget.sh`, skipped without git history), where it must exit 2 "unknown option"
  naming its first staged option (--before-ref or --before; --after-ref, --driver, --repo or --module
  on the 4 rows that start with one); mutants
  M7-M13, M-stage-order, M-git-env (x4), M-relimport-sibling-staged (ref + file), G2 x3, U1-U3 and
  STAGE_SAME-forced-1, each of which must turn its row red; retention (20 ref runs, each into a new
  `--out`: 0 entries left in TMPDIR and the cwd, the repo untouched, exactly 17 files per `--out`)
  with a mutant that stages under TMPDIR; and the `--self-test` count rows (49 ok, with the 4 staged
  checks present once each, absent from the 9173830d build; self-test mutants M7 and M10; a PATH
  without git -> exit 1 with one FAIL line; the six GIT_* vars set -> still 49 ok). No REPORTED
  (timed or measured) numbers exist for this entry.
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
  with the reason "--out: <OUT>/stage is not empty (give a new or empty DIR)"; an emulated
  git < 2.32 with `tag.gpgSign=true` makes `--self-test` exit 1
  (its tag helper lacks `-c tag.gpgSign=false`); SIGINT during `--self-test` leaves its temp dir (no INT /
  TERM trap; pre-existing, not new in group 2b). `npm test`: 401 tests, 400 pass, 1 skip, 0 fail (node
  v26.8.2, bash 3.2.57, git 2.54.0).
  REPORTED (not gated, untimed, a maintainer-side evidence script, not shipped): ref mode with real node
  v26.8.2 on the bundled driver split into a driver and a module: commits that differ only outside the
  probed add / mid -> SAME in 20 of 20 runs; a longer `mid` (211 -> 223) -> DIFF in 20 of 20 runs
  (2026-11-02T14:54Z, Darwin arm64, script sha256/8 99790884, load1 1.85 before / 1.61 after, quiet-lock
  QUIET, no other node process; about 19 s).
- `deopt-diff.sh`: the deoptimizations of named functions, DRIVER_BEFORE vs DRIVER_AFTER, on one
  node binary: per fn, the multiset of its deopt records (code tier, kind, reason) compared across
  the two drivers. Usage: `deopt-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER`. Flags: `--fn`
  (required, comma list of short V8 names, `add` or `get value`, never `Store.add`, no repeat, no
  stray comma; matching is exact on the name between `<JSFunction ` and ` (sfi = `), `--runs N`
  (2..20, default 3; run 1 vs runs 2..N is the null control), `--node BIN` (default `$NODE`, else
  `node`), `--v8-flags STR` (flags only, split on spaces; refused, `_` read as `-`: any
  `*trace-deopt*`, `*trace-opt*` or `*concurrent-recompilation*` flag, which the script sets, and
  any `*trace-file-names*` flag, which changes the text the records are read from), `--out DIR`
  (keeps `report.txt` and `raw/{before,after}/run.<k>.txt`, addresses and NUL kept; `DIR/raw` must
  be absent or empty; without `--out` nothing is written to disk), `--self-test`, `-h` (exit 2).
  Each driver runs as `node [v8 flags] --trace-deopt-verbose --trace-opt
  --no-concurrent-recompilation DRIVER` with cwd = its directory, NODE_OPTIONS stripped, stderr
  merged, through `tee | tr | awk`; one run per side per k serves every fn, sides alternate.
  Records, from trace lines that start with `[` only: `E <fn>@<tier>[-OSR]` (a `[completed
  compiling` line), `D <fn>@<tier><TAB><kind> (<reason>)` (a `[bailout` line; reason cut at the
  first `): begin. deoptimizing `), `X <why>` (a line naming fn that cannot be read, or trace text
  glued after other output; a NUL byte counts as output). Never part of a record: addresses, sfi,
  opt id, bytecode offset, deopt exit, deltas, pc, timings, paths. Verdict per fn on the run-1 D
  multisets (never `sort -u`), worst over fns (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF (with
  `before=<n> after=<m>` per differing record), 2 NO-VERDICT. NO-VERDICT, per side: `cannot read
  driver output in run <k> (<tee|tr|awk> exited <rc>)` (first failure in the order awk > tr > tee >
  driver exit), `driver exited <rc> in run <k>`, an X record (unparseable line, or a NUL / glued
  `[bailout` that BSD awk would have cut), a null-control difference in E or D records, and no E and
  no D record in run 1. Every refused argument exits 2 before any spawn and before anything is
  written; spawns are one `node --version` plus 2 x runs. Maintainer decisions: the bytecode offset
  is not in the key; the null control covers E and D; a deopt counts only for the JSFunction on the
  bailout line (an inlinee's deopt counts for its caller); a dependency invalidation of code not on
  the stack (no bailout line) and a driver that itself prints `[bailout` / `[completed compiling `
  at line start (read as V8 trace output) are Not detected; `--runs` default 3. Tier: `--self-test`
  is DETERMINISTIC (canned trace text and a fake node that counts spawns); a verdict on a user
  driver is STATISTICAL (deopts follow tier-up timing; run it under the host quiet lock). Gated in
  `npm test` by `test/deopt-diff.test.mjs` (115 tests): the exact self-test count (84), an unmodified
  copy outside the repo, 36 mutants of the script, each of which must turn its own self-test row red
  (and each with a revert row: the kill assertion fails on the unmutated run), a 16-row tier mutant
  table (G1-G6, V1-V3, TW1-TW7: each must turn its designed T row(s) red, each with a revert
  row), 2 controls that must survive (an awk crash the old records helper swallowed), `-h`, and 3
  end-to-end rows on a fake node with their revert rows (a glued `[completed compiling` line,
  `abc<CR>[bailout`, a CRLF bailout line: each NO-VERDICT with its own reason).
  `test/deopt-diff-boundary.test.mjs` (84 tests) adds outside rows, each with a mutant row that must turn
  it red: retention over 3 cycles of SAME / DIFF / NO-VERDICT without `--out` (cwd, TMPDIR and a
  logging mktemp shim stay empty; 7 spawns each), the self-test leaving 0 dirs (also when killed by
  SIGTERM mid-run), `--runs` 2 / 20 / 08 / 09 (5 / 41 / 17 / 19 spawns, before / after alternating,
  exact argv), 26 refused `--runs` values,
  11 further refusals and 7 `--out` refusals (exit 2, 0 spawns, OUT unchanged), and A4 parity of
  inlining-budget-diff.sh 740da13b. REPORTED (not gated; one
  PRELIMINARY run under the quiet lock, 2026-11-02 20:43 EET, Darwin arm64, node v26.8.2,
  deopt-diff.sh 221ff2ec, load1 3.63 before / 3.50 after vs baseline 2.21, no other node >= 10% CPU,
  5 invocations per pair with the default `--runs 3`, `--v8-flags --allow-natives-syntax --fn add`
  and an `--out` dir, on the maintainer-side probe drivers): deopt | mono DIFF 5/5
  (`before=1 after=0  [add@TURBOFAN_JS] deopt-eager (not a Smi)`), mono | mono SAME 5/5,
  deopt | deopt SAME 5/5.
- `deopt-diff.sh` ref and file mode (Phase 3 group 2): the same verdict, but each side is ONE module
  file staged by the script beside a copy of ONE driver, instead of two DRIVER paths, with the
  option names of `bytecode-budget.sh --diff` and the same `lib/stage.sh`. Ref mode: `--fn LIST
  --out DIR --driver FILE --before-ref REF --after-ref REF --module REL [--repo DIR]` (each side is
  `git cat-file blob <sha>:REL`: plumbing, no textconv, frozen by construction). File mode: `--fn
  LIST --out DIR --driver FILE --before FROZEN --after FILE` (each side is a `cp`, so an edit of the
  live file after staging cannot leak in; the before file must be a frozen copy, not git-tracked and
  not the same file as `--after`). `--out DIR` is required and `DIR/stage` must be absent or an
  empty directory (a regular file, a symlink to a file or a dangling symlink at `DIR/stage` is
  refused: `--out: DIR/stage exists and is not a directory`, exit 2, 0 spawns, nothing written);
  after the `node --version` spawn, `DIR/stage/before` and `DIR/stage/after` each get the module
  as NAME plus a copy of the driver, and each side runs from there (the driver must import
  `./NAME`; a module with relative imports of its own fails closed: NO-VERDICT). Nothing is
  written before `node --version` succeeds. The head gains a `driver  <abs>  sha256/8 x` line (x =
  the staged copy's) and the mode line reads `diff (ref)` or `diff (file)`. When the two staged
  modules are byte-identical a NOTE line says the run is a null control (expect SAME), and a DIFF
  then becomes NO-VERDICT (exit 2, "the DIFF is run-to-run noise"; SAME and NO-VERDICT stay as they
  are; maintainer decision MD-16). New refusals, each exit 2 with 0 spawns and nothing written:
  `--driver / --module / --repo go only with --before-ref/--after-ref or --before/--after` (MD-17
  covers the `DIR/stage` one above), a mixed or half-given pair, and the further stage / git checks
  of `bytecode-budget.sh --diff`. Group 2 leaves driver-mode output unchanged (group 3 below adds only
  `tier    ` lines): 43 golden-vector files (10 cases, 7 runs and 3 refusals: exit code, stdout, stderr
  and spawn log each = 40 files, plus the `--out` report and file list and `leftovers.count`) of the
  pre-group build 221ff2ec equal those of the group 2 build. `-h` documents both modes and the known
  gaps as Not detected (a tracked symlink `--module` stages the link text, `refs/replace` swaps the
  staged blob, a leading-dash path value exits 2 only through the EXIT trap, an unreadable
  `DIR/stage` or one that is a symlink to an empty directory). Tier: a verdict on a user driver is
  STATISTICAL, as in driver mode (run it under the host quiet lock); the staging,
  the refusals and the byte-identical NO-VERDICT are DETERMINISTIC.
  `--self-test` gains 18 ref / file rows on a temp git repo with a fake node (S1-S4: ref r1 | r2
  DIFF, r1 | r1 SAME with the NOTE, file mode frozen | live with the live file rewritten mid-run,
  byte-identical DIFF -> NO-VERDICT; R1-R14: refusals, each with its own die line), 53 -> 71 checks;
  with no git on PATH, or a failed repo set-up, the 18 rows are ONE FAIL line. Its git calls are
  isolated (no editor, global or system config, hooks or signing; the six `GIT_*` variables unset).
  Gated in `npm test` by `test/deopt-diff.test.mjs` (the pin now 84) and
  `test/deopt-diff-stage.test.mjs` (65 tests: 22 verdict / refusal rows, each with a twin that must
  exit 2 `unknown option` and go red on the pre-group build; 11 exact-once mutants; 2 retention
  rows, 20 staged runs = 140 spawns and 11 files per OUT; 8 self-test rows: env, no git, two control
  mutants, the pre-group count) and `test/deopt-diff-stage-boundary.test.mjs` (95 tests: 40
  boundary rows of the ref / file modes -- 35 new behaviour, 2 pre-existing --runs refusals, 3
  KNOWN GAP pins -- each with a twin on the pre-group build; 1 parity row + twin; retention over 3
  cycles of SAME / DIFF / NO-VERDICT / refusal and a SIGTERM mid-run, each row + twin + mutant; 7
  row mutants, 9 mutant tests from 7 distinct edits).
- `deopt-diff.sh` tier section (Phase 3 group 3): every report that reaches VERDICT now prints a
  REPORTED section after the fn lines and before `VERDICT`, read from run 1 of each side. It opens
  with `tier    REPORTED: run 1 of each side, never part of the verdict`; then, per `--fn` in order,
  the before lines and then the after lines: the compile counts per unit (MAGLEV, MAGLEV-OSR,
  TURBOFAN_JS, TURBOFAN_JS-OSR, other units after them), `cycles <c>: <seq>` (run 1's E / D records
  in order, cut after 16; c = D records with a later E), one `deopt <i>/<d>` line per D record with
  its bytecode offset and `;;; deoptimize at` source position (base file name, inlined chain; `no
  source position` or `source position unreadable` when there is none or it does not parse; a single
  `deopts unreadable (<a> bailout line(s), <d> D record(s))` line instead when the line-start
  `[bailout` lines naming fn, those whose offset reads and the D records are not one count), and
  `ops until TURBOFAN_JS: after op <a>, before op <b>`. The record awk is unchanged; the keep filter
  also keeps `;;; deoptimize at` and `@@LITE-MARK` lines (the kept text of a run is held in memory,
  so dense markers grow it). Fail closed (MD-20): when the section awk (`TIER_AWK`) exits non-zero,
  prints nothing, or prints a line not starting `tier    `, that fn / side prints exactly one
  `unreadable (awk exited <rc>)` line (rc 0 for a clean exit) and the verdict stands; a side whose
  run 1 did not exit 0 prints `not reported (run 1: <rc>)`. Marker protocol: the driver writes
  `@@LITE-MARK op <n>` at line start (n = ops done so far, strictly increasing), recommended with
  `fs.writeSync(1, ...)`; a malformed op line, a non-increasing n, or a marker after column 1 reads
  `markers unreadable (<why>)`. Limits (listed under Not detected in `-h`): an asynchronous marker
  writer (`console.log`, `process.stdout.write`) is not proven to keep its order against the trace
  under a full pipe, and ops are only as fine as the marker spacing. Tier: REPORTED, gates nothing;
  it never moves the exit code or a verdict line, and every non-`tier` line stays byte-identical.
  `--self-test` gains 13 tier rows (T1-T13), 71 -> 84 checks, gated by a 16-row tier mutant table
  in `test/deopt-diff.test.mjs`.

- `ic-diff.sh` (Phase 5 group 1, driver mode only): the inline-cache states of named functions,
  DRIVER_BEFORE vs DRIVER_AFTER, on one node binary. Usage: `ic-diff.sh [opts] --fn LIST DRIVER_BEFORE
  DRIVER_AFTER`. Flags: `--fn` (required; a short V8 name, at most one space part, e.g. `get`, `get
  value`), `--runs` 2..20 (default 3), `--node`, `--v8-flags`, `--out DIR`, `--self-test`, `-h`. Per fn,
  one record per IC site (kind, key, final state) from `--log-ic`, taken from the last IC line at that
  site; the key is `[]` at the keyed kinds (a per-run Symbol hash never reaches the verdict). The
  verdict compares the run-1 multisets of `fn kind key final[ mod]` (line:col is a label, never
  compared): exit 0 SAME, 1 DIFF (one `before=<a> after=<b>` line per differing entry), 2 NO-VERDICT.
  Null control: runs 2..N of each side must give run 1's records. Fails closed (NO-VERDICT, never SAME
  or DIFF) on an unresolved pc, a pc in Maglev / Turbofan code, a code-move from an unknown start, a log
  line that does not parse (wrong field count, bad hex or decimal, an IC state outside `X01P^NDG`, an
  unknown IC kind or event, a code kind outside the allowlist), a driver exit != 0, a missing log, a
  log-file count != 1 (expected from a Worker or a forked child; only the 2-file count is gated), a
  v8-version line count != 1, a NUL byte, no final newline, and when fn has no IC site or only X sites
  in run 1 (hint `--v8-flags=--no-lazy-feedback-allocation`). Every spawn runs under `env -u
  NODE_OPTIONS -u NODE_COMPILE_CACHE`: one `--version`, one `--v8-options`, then 2 x runs trace runs
  (runs 3: 8 spawns); a failing probe exits 2 before anything is written. Refuses before any spawn or
  disk write (exit 2): a repeated or empty value option, a newline in `--fn` / `--v8-flags` / `--out` /
  `--node`, a stray comma in `--fn`, a repeated fn, an unknown option (a did-you-mean hint when it
  shares a prefix with a known option), a `--v8-flags` flag matching `*log*`, `*prof*`,
  `*concurrent-recompilation*`, `*interpreted-frames-native-stack*` or `*snapshot*`, a node binary that
  does not exist, and a non-empty `DIR/raw`. An IC pc, code-creation start or code-move from / to wider
  than `0x` + 13 hex digits is an X line (awk sums those in a double, exact to 2^53); a driver file name
  starting with `-` runs as `./<name>`; without `--out` the logs go to one private `mktemp -d` dir
  removed on every exit (INT / TERM: exit 2 `interrupted`), with `--out` no mktemp and exactly 4 x runs
  + 1 files. The header carries `v8-opts sha256/8 <x>` (the hash of the `--v8-options` byte stream),
  REPORTED, never part of the verdict. Tier: on a user driver the verdict is STATISTICAL (IC states
  follow warm-up, GC and tier-up timing; run it under the host quiet lock) and gated nowhere;
  `--self-test` is DETERMINISTIC. `--self-test` (64 checks, no real node): canned node v26.8.2
  `--log-ic` text through the record awk, judge and diff_fn (records, every X reason, the
  basename-collision and keyed-Symbol rows), then the script end to end on a fake node that counts
  spawns and mktemp calls (spawn budget, exact probe argvs, env stripped on every spawn, 13 files under
  `--out`, no entry left after SAME / DIFF / NO-VERDICT cycles and a SIGTERM, 10 refusals with 0
  spawns). `-h` documents every option, X and NO-VERDICT reason, the report lines and the Tier, and
  lists what is not detected: two sites of fn that swap states, fn inlined into optimized code, eval /
  vm / `data:` scripts, computed method names, a detached child that outlives the driver. Known gap (in
  `-h`): after a run with != 1 isolate file, those files stay in the run dir and later runs of that side
  count them too (still NO-VERDICT). Not yet in this group: ref / file modes, per-kind IC totals and
  `--deterministic`, the map section (G3), the natives control pair and node fixtures (G4).
- `test/ic-diff.test.mjs`: `--self-test` exact count (64), an unmodified-copy baseline, a row table
  that names each printed check, 64 self-test mutant rows (each an exact-once edit of a temp copy
  that must turn the self-test red on its designed rows, each with a revert check on the unmutated
  copy; the one mutant that survives on bash 3.2, an INT / TERM landing while mktemp runs, is
  host-semantics and not in the table), the exit wiring (a flipped expectation gives exit 1 and one
  FAIL), the `-h` text with its revert checks, and 6 rows on the file's own fake node, each with
  revert checks (spawn and mktemp counts, 13 files under `--out`, retention, a `-x.js` driver, the
  verdict fold over fns, `mod` in the verdict key). DETERMINISTIC; no real V8 run.

### Changed

- `bytecode-budget.sh` report and gate mode: an unreadable DRIVER (chmod 000) is now refused before any
  node spawn ("DRIVER not found (or not a readable file): X", exit 2). It used to be probed and ended
  "driver exited 1" NO-VERDICT, also exit 2.
- `inlining-budget-diff.sh` is now generated from `src/` + `lib/`; the output is byte-identical to
  7f0ba7b (sha256 740da13b...).
- `lib/v8probe.sh` (LIMITS_AWK, BYTECODE_AWK) and `lib/v8limits.sh` (the limits read and `lim`)
  are cut verbatim from `src/inlining-budget-diff.sh` and shared with `bytecode-budget.sh`; the
  generated `inlining-budget-diff.sh` stays byte-identical (sha256 740da13b...).
- `bytecode-budget.sh` / `deopt-diff.sh` header `node` field: the resolved absolute path.
  `-h` for `--node`: resolved once before any cd, must be an executable file; for `--v8-flags`: each
  flag is `--` and a letter.
- `test/deopt-diff-boundary.test.mjs`: the A4 parity row no longer pins `bytecode-budget.sh` (it leaves the
  Phase 2 freeze, MD-32 (a)); the `inlining-budget-diff.sh` pin (740da13b) stays.

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

- `bytecode-budget.sh` and `deopt-diff.sh`, external-audit group (exit 2 refusals, all before any node
  spawn unless a bullet says otherwise; the scripts are generated from `src/`, root scripts rebuilt):
  - node is resolved ONCE, from the caller's cwd, to one absolute path used for every spawn. A relative
    PATH entry used to be looked up again after the `cd` into each driver's directory, so before and
    after could run different binaries (fail-open). The header `node` field prints that path.
  - `--node` naming a shell builtin or function, a directory or a non-executable file is refused (exit 2):
    "node binary is not a file on PATH (...)" / "node binary is not an executable file".
  - `CDPATH` is unset at the top of both scripts, so no `cd X && pwd` join resolves X through a CDPATH entry.
  - A dash-led path is a name, never an option or OLDPWD: `--node -/node`, a DRIVER `./-driver.mjs` (it
    reaches node as `./-driver.mjs`), `--out -`, `--out -x`. A dash-led `--out` used to end exit 2
    "--out: cannot create" (mkdir read it as options; `deopt-diff.sh` after the `--version` spawn); in
    ref / file mode the stage/ emptiness refusal now sees it (`ls` used to read `-x/stage` as options;
    both tools).
  - `--v8-flags` a `---` flag, `--=1` and `--1x` are refused (each flag must be `--` and a letter).
  - An unwritable `report.txt` (a directory, a read-only file) is refused with "--out: cannot write
    <DIR>/report.txt" before any node spawn. `deopt-diff.sh` known residue (F2: exit 2 after the
    `--version` spawn, from the later mkdir / write backstop; `bytecode-budget.sh` refuses each of these
    with 0 spawns, except an unwritable empty raw/ in report / gate mode: not refused, the probes run
    and it ends NO-VERDICT "driver exited 1 in run 1", exit 2): an absent OUT under an unwritable
    parent, a dangling-symlink OUT, a `report.txt` that is a dangling symlink into a missing directory,
    an existing OUT that is not writable but has a writable `report.txt` and no raw/, an unwritable
    empty raw/.
  - Printed joins no longer contain `//`.
  - A `--node` path (every mode) or a DRIVER (driver mode) whose `..` follows a symlink, so that its
    logical and physical paths name different files, is refused with 0 spawns;
    `--out` with such a `..` writes into the directory that was checked and the header prints its
    physical path.
  Tier: DETERMINISTIC. Gated in `test/ext-audit.test.mjs` (74 tests = 72 rows, `bytecode-budget.sh` 35 /
  `deopt-diff.sh` 37, plus 2 retention loops; fake nodes, no V8 run; the rows are red on 8070907's
  scripts (bb 99790884 / dd db89aba0) except 8 that pin behavior 8070907 already had: the controls B4B
  x2, N18 x2 and dd N15, plus N8 x2 and dd N11; the bb N19a control is red there). In `npm test`.
