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
  `--self-test` (54 canned checks, 57 after MD-46; the 4 ref / file rows need git: with no git on PATH they are one
  FAIL line and `--self-test` exits 1) and `--self-test --fixtures DIR` (+24 checks on node v26.8.2
  captures in `test/fixtures/bytecode-budget/node-26.8.2/`).
  DETERMINISTIC (gated in `npm test` via `test/bytecode-budget.test.mjs`, 152 tests; 161 after MD-46, 162 after
  Q-H1): the exact self-test counts (54 and 54+24; 57 and 81 after MD-46), 24 self-test mutant rows (17 report/gate,
  3 of them on the length cap and 5 on the B-four refusals, + 7 diff) plus a NODE_OPTIONS-leak and a version-prefix
  mutant that must each be caught, gate rows on a fake node, 48 refusal rows with 0 node spawns (41 report/gate + 7
  diff), the driver cwd, spawn and retention counts (8 spawns for 3 fns x 2 runs; 9 after MD-46), and a live pair on
  node v26.8.2 (`mid=211` exit 0, `mid=210` exit 1; on any other node the pair must exit 2 with a version-mismatch
  NO-VERDICT). REPORTED (not gated): 20/20 runs per side of `--max add=6,mid=211,dup=19` / `mid=210`, one
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
  directly under `raw/`). Spawns: 1 `--version`, 1 `--v8-options` (2 after MD-46), then fn x runs x 2 probes
  (3 fns x 2 runs = 14; 15 after MD-46). Refuses with exit 2 and 0 spawns: `--diff` with `--max`, a count of
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
  02 running 6 / 42 / 6 spawns (7 / 43 / 7 after MD-46); the length matrix (L | L -> SAME and L | L+1 -> DIFF at L =
  0, 1, 99999999, 100000000, 999999998; 999999999 | 1000000000 -> NO-VERDICT on the after side only; a
  length of 10+ digits (1000000000, 2^30, 2^31-1, 2^32, 2^53, 2^53+1, 20 digits) on both sides ->
  NO-VERDICT unknown format, never SAME or DIFF, which M-no-cap (the 686de5bf length scan) turns
  red); the diff-mode `--node-version` check
  (a match runs 6 spawns, 7 after MD-46; a mismatch exits 2 after exactly 1 spawn, 2 after MD-46, one NO-VERDICT
  line per fn); exact function names (`read` never matches `read.set`, `readAll`, `Store.read`); driver stderr
  (plain stderr keeps the verdict; a header-shaped stderr line is NO-VERDICT, unknown format); the same
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
  untracked, so a tracked `--before` behind it is not refused (closed by G-TRACKED, b45: exit 2 NO-VERDICT, 0
  spawns, naming git's first line; a .git git does not recognise as a repository still reads as no repository).
  Tier: DETERMINISTIC (one node binary; each staged side keeps its null control). Gated in `npm test` by
  `test/bytecode-budget-stage.test.mjs` (119 tests, 123 after MD-46; they need git and skip without it): verdict
  rows on a fake node whose length is the staged module's bytes (r1 = 211, r2 = 212, hand-derived),
  refusal rows (exit 2, 0 spawns, the OUT dir is not created, except the stage-not-empty row, which
  starts from an existing OUT holding stage/junk and a 4-byte report.txt and leaves it as it was:
  report.txt still 4 bytes, no raw/), each row also run on the pre-staging build 9173830d (`git show
  6835177:bytecode-budget.sh`, skipped without git history), where it must exit 2 "unknown option"
  naming its first staged option (--before-ref or --before; --after-ref, --driver, --repo or --module
  on the 4 rows that start with one); mutants
  M7-M13, M-stage-order, M-git-env (x4), M-relimport-sibling-staged (ref + file), G2 x3, U1-U3 and
  STAGE_SAME-forced-1, each of which must turn its row red; retention (20 ref runs, each into a new
  `--out`: 0 entries left in TMPDIR and the cwd, the repo untouched, exactly 17 files per `--out`)
  with a mutant that stages under TMPDIR; and the `--self-test` count rows (54 ok, 57 after MD-46, with the 4 staged
  checks present once each, absent from the 9173830d build; self-test mutants M7 and M10; a PATH
  without git -> exit 1 with one FAIL line; the six GIT_* vars set -> still 54 ok (57 after MD-46); the 9173830d
  build stays at 45). No REPORTED (timed or measured) numbers exist for this entry.
- `bytecode-budget.sh --diff` ref / file staging, QA boundary rows. Tier: DETERMINISTIC. Gated in `npm test`
  by `test/bytecode-budget-stage-boundary.test.mjs` (63 tests, 64 after CI on Linux; they need git and skip without
  it): 24 boundary rows, each with a teeth twin on the pre-staging build 9173830d (`git show
  6835177:bytecode-budget.sh`) where it must exit 2 "unknown option" and its own check must go red; 5
  `--self-test` rows (a real git < 2.32, skipped here; an emulated git < 2.32 and its 9173830d twin; a
  SIGINT run on this build and on 9173830d); and 10 one-edit mutant tests (8 distinct exact-once edits of a
  copy of the script; each must turn its row red). Row groups: ref names (odd bytes, a rev expression, an
  annotated tag, a tag that is also a branch), a leading-dash `--before` / `--after` / `--out` (`--before` / `--after`
  now run as ./<name>, G-STAGE b44), driver and module file names that contain or start with the module name, `--out`
  with spaces (exactly 17 files), an existing but empty `OUT/stage` (allowed) versus one holding a file (refused), and
  a `--self-test` run with a git older than 2.32. A real git < 2.32 row is skipped on git 2.54.0. KNOWN GAPS, pinned
  as
  current
  behaviour (not features; each is a later code fix): a git-tracked symlink as `--module` stages the link and ends
  NO-VERDICT (driver exits non-zero) after 6 spawns (7 after MD-46) (closed by G-STAGE, b44: exit 2, 0 spawns); `git
  replace` of the module's blob changes the staged bytes (the script does not pass `--no-replace-objects`);
  `OUT/stage` as a regular file is refused with the reason "--out: <OUT>/stage is not empty (give a new or empty
  DIR)"; an emulated
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
  be absent or an empty, readable and writable directory and `DIR/report.txt` must not be a symlink;
  without `--out` nothing is written to disk), `--self-test`, `-h` (exit 2).
  Each driver runs as `node [v8 flags] --trace-deopt-verbose --trace-opt
  --no-concurrent-recompilation DRIVER` with cwd = its directory, NODE_OPTIONS stripped
  (b45 G-ENV: all four), stderr merged, through `tee | tr | awk`; one run per side per k serves every fn, sides
  alternate.
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
  written; spawns are one `node --version` plus 2 x runs (after MD-46 also one `node --v8-options`). Maintainer
  decisions: the bytecode offset is not in the key; the null control covers E and D; a deopt counts only for the
  JSFunction on the bailout line (an inlinee's deopt counts for its caller); a dependency invalidation of code not
  on the stack (no bailout line) and a driver that itself prints `[bailout` / `[completed compiling `
  at line start (read as V8 trace output) are Not detected; `--runs` default 3. Tier: `--self-test`
  is DETERMINISTIC (canned trace text and a fake node that counts spawns); a verdict on a user
  driver is STATISTICAL (deopts follow tier-up timing; run it under the host quiet lock). Gated in
  `npm test` by `test/deopt-diff.test.mjs` (137 tests; 141 after MD-46, 145 after CI on Linux, 146 after the b38 cap
  row, 150 after b39 NUL-LEAK, 152 after b40 TIMEOUT-ATTRIB):
  the exact self-test count (89; 92 after MD-46), an unmodified copy outside the repo,
  36 mutants of the script, each of which must turn its own self-test row red (and each with a revert row: the kill
  assertion fails on the unmutated run), 5 more (OUT_MUTANTS M36, M37, M40, M42, M44, the B-four refusals: each
  kills exactly one of checks 85-89, plus a revert row), a 16-row tier mutant table (G1-G6, V1-V3, TW1-TW7: each
  must turn its designed T row(s) red, each with a revert row), 2 controls that must survive (an awk crash the old
  records helper swallowed), `-h`, and 3 end-to-end rows on a fake node with their revert rows (a glued `[completed
  compiling` line, `abc<CR>[bailout`, a CRLF bailout line: each NO-VERDICT with its own reason).
  `test/deopt-diff-boundary.test.mjs` (111 tests) adds outside rows, each with a mutant row that must turn
  it red: retention over 3 cycles of SAME / DIFF / NO-VERDICT without `--out` (cwd, TMPDIR and a
  logging mktemp shim stay empty; 7 spawns each, 8 after MD-46), the self-test leaving 0 dirs (also when killed by
  SIGTERM mid-run), `--runs` 2 / 20 / 08 / 09 (5 / 41 / 17 / 19 spawns, 6 / 42 / 18 / 20 after MD-46, before / after
  alternating, exact argv), 26 refused `--runs` values,
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
  after the `node --version` spawn (and, after MD-46, the `--v8-options` read), `DIR/stage/before` and
  `DIR/stage/after` each get the module as NAME plus a copy of the driver, and each side runs from there (the driver
  must import `./NAME`; a module with relative imports of its own fails closed: NO-VERDICT). Nothing is
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
  gaps as Not detected (a tracked symlink `--module` stages the link text, `refs/replace` swaps the staged blob, a
  leading-dash path value exits 2 only through the EXIT trap, an unreadable `DIR/stage` or one that is a symlink to an
  empty directory; all but `refs/replace` closed by G-STAGE, b44). Tier: a verdict on a user driver is STATISTICAL, as
  in driver mode (run it under the host quiet lock); the staging, the refusals and the byte-identical NO-VERDICT are
  DETERMINISTIC.
  `--self-test` gains 18 ref / file rows on a temp git repo with a fake node (S1-S4: ref r1 | r2
  DIFF, r1 | r1 SAME with the NOTE, file mode frozen | live with the live file rewritten mid-run,
  byte-identical DIFF -> NO-VERDICT; R1-R14: refusals, each with its own die line), 53 -> 71 checks (21 rows, R1-R17,
  95 checks after G-STAGE, b44); with no git on PATH, or a failed repo set-up, the 18 rows are ONE FAIL line. Its git
  calls are isolated (no editor, global or system config, hooks or signing; the six `GIT_*` variables unset).
  Gated in `npm test` by `test/deopt-diff.test.mjs` (the pin now 89; 92 after MD-46; 95 after G-STAGE, b44) and
  `test/deopt-diff-stage.test.mjs` (65 tests: 22 verdict / refusal rows, each with a twin that must
  exit 2 `unknown option` and go red on the pre-group build; 11 exact-once mutants; 2 retention
  rows, 20 staged runs = 140 spawns (160 after MD-46) and 11 files per OUT; 8 self-test rows: env, no git, two
  control mutants, the pre-group count) and `test/deopt-diff-stage-boundary.test.mjs` (95 tests: 40
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
  `--self-test` gains 13 tier rows (T1-T13), 71 -> 84 checks (89 after the B-four refusals; 92 after MD-46), gated
  by a 16-row tier mutant table in `test/deopt-diff.test.mjs`.

- `deopt-diff.sh --self-test --fixtures DIR` (Phase 3 group 4): 17 more rows, F1-F17 ("ok fixture ..."), read
  from the real node v26.8.2 traces in DIR (`test/fixtures/deopt-diff/node-26.8.2`; each `<driver>.txt`
  through the record awk and the tier section, `deopt.txt` and `mono.txt` end to end through the fake node;
  0 real-node spawns), so a clean run is 89 -> 106 checks (92 -> 109 after MD-46); plain `--self-test` stays 89 (92
  after MD-46). A missing or unreadable `<driver>.txt` is one more "FAIL fixture <driver>.txt: missing or not a
  readable file" line (exit 1) and the rows reading it get empty text. New refusals, each exit 2 before any spawn:
  "--self-test takes only --fixtures DIR", "--fixtures goes with --self-test", "--fixtures: a newline is not
  allowed", "--fixtures: not a readable directory: DIR". The hot body is unchanged. Tier: the `--fixtures`
  self-test and the natives pair below are DETERMINISTIC. Gated in `test/deopt-diff.test.mjs` (+12 tests: the
  C + 17 row, an unmodified-copy baseline, a FIX copy without `deopt.txt`, an `if false` mutant on the fixture
  block and the G1 M1 / M3 and S1 mutants run with `--fixtures`, each failing its designed fixture rows, with
  revert rows) and `test/deopt-diff-boundary.test.mjs` (+27: 9 rows over the four refusals, each with a teeth
  mutant and a revert row, 0 spawns).
- `test/deopt-diff-live.test.mjs` (5 tests): `deopt-diff.sh` driver mode on REAL node (the S-8 natives pair),
  7 node spawns each (8 after MD-46), no `--out`. L1: `--fn add --v8-flags --allow-natives-syntax deopt.mjs
  mono.mjs` exits 1 with `VERDICT DIFF` and `before=1 after=0  [add@TURBOFAN_JS] deopt-eager (not a Smi)`; L2:
  `deopt.mjs` against a byte-identical copy exits 0 with SAME. Exit codes are asserted on every node, the exact
  lines on node v26.8.2 only (MD-21 (a)). Mutants Z1 (the D print removed: L1 exits 0) and Z2 (the D record is
  the whole trace line: L1 and L2 exit 2) must go red. Tier: DETERMINISTIC.
- `test/fixtures/deopt-diff/node-26.8.2/`: real node v26.8.2 traces (S-9), captured verbatim with
  `--allow-natives-syntax --trace-deopt-verbose --trace-opt --no-concurrent-recompilation` (NODE_OPTIONS
  stripped, Darwin arm64, 2026-11-03), one `.txt` per driver: `deopt.mjs` / `mono.mjs` (`add` forced to
  TURBOFAN_JS, then `add('x', 'y')` deopts it or `add(7, 8)` does not; `@@LITE-MARK op 2/3/4` markers through
  `fs.writeSync(1, ...)`) and the six p3-probe shapes copied verbatim: lazy deopt (`lazyFn`), dependency
  invalidation off the stack (`offFn`, no bailout), inlined callee (`outer` deopts, `inner` has no compile), OSR
  (`loopFn` MAGLEV OSR), getter (`get value`, out of bounds), and 100 ops with markers every 10 (`f-marks`).
  The fixture README lists the capture commands and a grep census per file. Each trace, masked (0x addresses,
  `took ... ms`), was byte-identical over 3 further captures in the same dir.

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
  NODE_OPTIONS -u NODE_COMPILE_CACHE` (b43 G-ENV: all four, unset once at script start): one `--version`, one
  `--v8-options`, then 2 x runs trace runs
  (runs 3: 8 spawns; 9 after MD-46, which adds the allowlist `--v8-options` read first); a failing probe exits 2
  before anything is written. Refuses before any spawn or disk write (exit 2): a repeated or empty value option, a
  newline in `--fn` / `--v8-flags` / `--out` / `--node`, a stray comma in `--fn`, a repeated fn, an unknown option
  (a did-you-mean hint when it shares a prefix with a known option), a `--v8-flags` flag matching `*log*`, `*prof*`,
  `*concurrent-recompilation*`, `*interpreted-frames-native-stack*` or `*snapshot*`, a node binary that
  does not exist, and a non-empty `DIR/raw`. An IC pc, code-creation start or code-move from / to wider
  than `0x` + 13 hex digits is an X line (awk sums those in a double, exact to 2^53); a driver file name
  starting with `-` runs as `./<name>`; without `--out` the logs go to one private `mktemp -d` dir
  removed on every exit (INT / TERM: exit 2 `interrupted`), with `--out` no mktemp and exactly 4 x runs
  + 1 files. The header carries `v8-opts sha256/8 <x>` (the hash of the `--v8-options` byte stream),
  REPORTED, never part of the verdict. Tier: on a user driver the verdict is STATISTICAL (IC states
  follow warm-up, GC and tier-up timing; run it under the host quiet lock) and gated nowhere;
  `--self-test` is DETERMINISTIC. `--self-test` (72 checks, 75 after MD-46; no real node): canned node v26.8.2
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
- `test/ic-diff.test.mjs` (171 tests; 177 after MD-46, 181 after b39 ICN): `--self-test` exact count (72; 75 after
  MD-46), an unmodified-copy baseline, a row table that names each printed check, 80 self-test mutant rows (each
  an exact-once edit of a temp copy that must turn the self-test red on its designed rows, each with a revert
  check on the unmutated copy; the one mutant that survives on bash 3.2, an INT / TERM landing while mktemp runs,
  is host-semantics and not in the table), the exit wiring (a flipped expectation gives exit 1 and one FAIL), the
  `-h` text with its revert checks, and 7 rows on the file's own fake node, each with revert checks (spawn and
  mktemp counts, 13 files under `--out`, retention, a `-x.js` driver, the verdict fold over fns, `mod` in the
  verdict key, `--node <relative>` + a failed allowlist read). DETERMINISTIC; no real V8 run.
- `allocation-diff.sh` (Phase 4 group 1): young-generation GC EVENT COUNTS inside a marked window of a
  driver, never bytes, on one node binary. `allocation-diff.sh [opts] DRIVER_BEFORE DRIVER_AFTER` (diff
  mode: exit 0 SAME, 1 DIFF) or `allocation-diff.sh [opts] --zero DRIVER` (gate mode: exit 0 ZERO, 1
  NONZERO); exit 2 NO-VERDICT. Options: `--zero`, `--runs` 2..20 (default 5), `--node`, `--v8-flags`,
  `--out DIR`, `--self-test`, `-h` / `--help` (exit 2). ZERO means less than one semi-space (1 MB) of
  young allocation in the window, not zero bytes. Each run is `node [v8 flags] --trace-gc
  --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation --require <tmp>/gcn.cjs
  ./<driver>` with cwd = the driver's directory and NODE_OPTIONS stripped (b43 G-ENV: all four);
  the driver marks the window
  with the whole lines `@@LITE-MARK start` and `@@LITE-MARK end`. The tool's own guard preload counts
  the run's GCs and the count must equal the trace's GC-line count. Fails closed (NO-VERDICT) on an
  unparseable trace, a missing guard count, an old-generation GC in the window, a driver failure and a
  failed null control (runs 2..N must give run 1's multiset). The `-h` text holds the driver contract,
  every record and NO-VERDICT reason, and the Not detected list. Tier: the script logic is
  DETERMINISTIC (`--self-test`, 76 checks, 78 after MD-46, no real node); a verdict on a user driver is STATISTICAL,
  REPORTED only (no statistical host in this repo).
- `test/allocation-diff.test.mjs`: `--self-test` exact count (76; 78 after MD-46) on the in-repo script and a copy
  outside the repo, one row per printed check, self-test mutant rows (each an exact-once edit of a temp
  copy that must turn the self-test red at its designed rows, with a revert check on the unmutated
  copy), the exit wiring, `-h` / `--help` exit 2, and refusal rows on the file's own fake node and
  mktemp shim. 200 tests (206 after MD-46, 208 after CI on Linux). DETERMINISTIC; no real V8 run.
- `deopt-diff.sh` / `bytecode-budget.sh` / `ic-diff.sh` / `allocation-diff.sh`: `--v8-flags` is a runtime allowlist
  (`lib/v8flags.sh`, MD-46 G1-G5, MD-50..58; one shared entry, per-tool deltas below). Right after its `--version`
  probe each tool makes one `node --v8-options` read (even with no `--v8-flags`), then every token must be a V8
  tuning flag that this node lists. Accepted: a bool as `--flag` / `--no-flag`, a numeric flag as `--flag=N` (N
  non-empty). Refused (exit 2, `VERDICT NO-VERDICT`, 0 runs): node options (`--experimental-require-module`,
  `--openssl-config`), `--snapshot-blob` / `--build-snapshot`, string-valued V8 flags, the log / trace / print /
  prof / perf / dump / snapshot / file families, the tool's own flags, a bool with `=value`, a numeric flag without
  `=value`, and `--no-` on a non-bool. A failing or empty `--v8-options` read also refuses (fail closed). Every
  refusal that spawned nothing before still spawns nothing (MD-55). `deopt-diff`: the read is before the `--out`
  mkdir; 2 + 2R spawns (8 at R=3); self-test 92 checks (+17 with `--fixtures`). `bytecode-budget`: the read sits
  after `raw/` and the empty `report.txt` but before `raw/before`, `raw/after` and `stage/` (MD-57, amended by Q-BB3,
  b45), so a refusal leaves `OUT/raw` empty and `report.txt` 0 bytes; +1 spawn
  overall; self-test 57 (81 with `--fixtures`). `ic-diff`: 3 + 2R spawns (9 at R=3); a refusal comes before any disk
  write or trace run; self-test 75. `allocation-diff`: a refusal is before the trap / mktemp; 8 spawns at `--runs 3`
  (5 with `--zero`); self-test 78. Hot bodies are byte-identical. DETERMINISTIC (`test/v8flags.test.mjs`, every
  tool's test file, `test/ext-audit*.test.mjs`, `test/build.test.mjs` include roster); the `-h` of each tool carries
  the shared text.
- Known limit of the allowlist (maintainer ruling, burst 37, "Record as known"): a numeric value is checked for its
  FORM only (MD-58: non-empty after `=`). `--max-inlined-bytecode-size=NaN` (or `=/etc/passwd`, `=*`, `=2^53+1`)
  passes the allowlist; real node then exits 9 on every run and the tool fails closed later as NO-VERDICT.
- `.github/workflows/ci.yml` + `nightly.yml` (commit b692aa0): GitHub Actions push CI (node 22 / 24 / 26 x
  ubuntu-latest / macos-latest, plus node 26.8.2 on both = 8 legs; fail-fast off, full clone) running `npm test`,
  every tool's `--self-test`, and `--self-test --fixtures` for bytecode-budget and deopt-diff; nightly (daily cron +
  manual) on node latest + 22 x both OSes. Deterministic gates only. The history-pinned test rows were re-pinned to
  reachable commits and, under `CI=true`, now fail instead of skipping. Neither workflow had run on GitHub when it
  was committed.
- CI on Linux (burst 37): CI runs 41975539068 and 41987982156 failed the same 6 test rows on every ubuntu-latest
  leg; the tools are correct on Linux, the rows assumed BSD userland; ubuntu-latest ships uutils coreutils and a
  NUL-clean awk. `bytecode-budget-stage-boundary` rows 4 accept the uutils `dirname` / `basename` / `stat` option
  error; `deopt-diff-boundary` A5 probes whether `mktemp` honours `TMPDIR`; the NUL-defense mutants (deopt-diff
  T1-tr-replaced-by-cat, Rf-tr-after-awk; allocation-diff M10) probe the host awk and, when it is NUL-clean, run
  under `test/nul-awk.mjs`, a PATH shim awk that cuts each record at its first NUL as BSD awk does (maintainer
  ruling Q-CI-5), with new rows pinning the probe and the shim. Workflow `timeout-minutes` 60 -> 120 and the
  provenance step prints the awk version, a NUL probe and the tr / mktemp flavour. Linux was emulated on macOS (PATH
  shims); not yet confirmed on a real Linux runner when written. npm test (macOS, untimed): 1572 tests, 1570 pass, 0
  fail, 2 skip.
- Q-H1 (burst 37): the shared `--v8-flags` `-h` sentence of the four tools (and `lib/v8flags.sh`'s header text) now
  reads "Refused, exit 2 at the latest after one --v8-options read": in deopt-diff, bytecode-budget and
  allocation-diff a node option is refused after the --version probe and that read (2 spawns); ic-diff refuses
  `--cpu-prof` and `--snapshot-blob` by its own checks at 0 spawns, its other node options after 2.
- CI-TIMEOUT (burst 38, test side only; confirmed by CI run 42130164758 on aecb40f, all 8 legs green): on CI run
  42056284029 (218bb48) the `deopt-diff.test.mjs` NUL-shim control run was killed at its 180 s cap on the macOS node
  22 and node 26.8.2 legs, and the plain self-test row used about 90% of its 120 s cap. Per-run caps in
  `test/deopt-diff.test.mjs`: plain self-test 360 s, the NUL-shim control run 900 s, mutant runs stay 180 s (b39
  CI-FIX: 540 s, the 5 --fixtures runs 780 s); a run its cap kills now fails as "timed
  out after <cap> ms" (one gate row: a 5 s fake self-test at a 300 ms cap must time out, at 60000 ms it must exit 0,
  which is the +1 test) and the NUL control row logs its elapsed ms. Per-spawn caps raised where one spawn used 50%
  or more of its cap on that run: `deopt-diff-boundary` fxRow and selfTestRun 240 s, `ext-audit-alloc` B2 480 s,
  `v8flags` run() 420 s. The rule was a new cap of at least 3x the longest CI row, rounded up to a multiple of 60 s,
  at most 900 s. `package.json` "test" now runs `node --test --test-timeout=1800000` (maintainer ruling Q-TT1,
  2026-11-05: 30 min per test; b39 Q-TT2: `--test-timeout=3600000`, 60 min, which node 22 applies per test file), so
  a hung async test fails by name instead of using up the 120-minute CI job (at 60 min only in a file that starts
  early enough, see CI-FIX). No script, lib or hot path changed.
- SIGINT-FLAKE (burst 38, test side only): `bytecode-budget-stage-boundary` row 9 (`--self-test` SIGINT after its
  first ok line -> killed by SIGINT, its temp dir left behind) failed once on CI (b692aa0, node 22) with code=0
  because the signal could land after the self-test had finished. The row now puts an awk PATH shim first and sends
  SIGINT to the process group only once the self-test is provably blocked after its first ok line (the shim catches
  the self-test's awk call on its `names` file, which is written after that line, then writes `ready` and sleeps);
  no `ready` within the bound means SIGKILL and a failed row, never a SIGINT. All assertions kept; the 9173830d base
  row uses the same shim. The file stays at 64 tests. Linux not yet verified (no local bash 5 / uutils); the next CI
  push is the check.
- EA-NITS (burst 38, test side only): the `ext-audit.test.mjs` ic and bb `--v8-flags` allowlist refusal rows also
  pin `VERDICT NO-VERDICT` exactly once and 0 stdout bytes; a dead ic `acceptedRow` helper was removed. The file
  stays at 224 tests.
- NUL-LEAK (burst 39, test side only): the NUL awk shim dir of the dd / ad test files (`dd-nul-*` in
  `test/deopt-diff.test.mjs`, `ad-nul-*` in `test/allocation-diff.test.mjs`) was removed on 'exit' only, which
  never fires on a default-action signal, so a SIGINT / SIGTERM-killed test process leaked it. Both files now take
  it from the new `nulTmpDir(prefix)` in `test/nul-awk.mjs`, which also removes it on SIGINT / SIGTERM (its own
  listeners come off first, then the dir is removed, then the same signal is re-raised, so the process still dies by
  that signal). Four new rows in `test/deopt-diff.test.mjs` pin it (146 -> 150 tests). Not covered: SIGKILL is never
  cleaned, and the handler runs only when the process next yields to the event loop (after every spawnSync in the
  current synchronous turn; under `node --test` the runner may exit first and the file runs on until then). Another
  SIGINT listener in the same process would see the signal twice; none exists today.
- V8-TIMEOUT (burst 39, test side only; confirmed by CI run 42130164758 on aecb40f, all 8 legs green):
  `test/v8flags.test.mjs` `run()` results now go through one check, so A5 M5 no longer passes on a driver that hung
  until its spawnSync timeout (status null): a timeout fails as "<what> timed out after <cap> ms (killed by SIGTERM)",
  any other spawn error as "<what> spawn error <code>" (except an EPIPE with a numeric exit status, b40 CI-EPIPE), and
  a per-call cap must be a positive integer. The live `node --v8-options` spawn uses it too (cap 120000 ms). A4's 40
  sequential spawns now carry a 60000 ms cap each (worst case 40 min per row, was 280 min, over the 120-minute job
  cap). The cap is sized from the 2 logged macOS legs of CI run 42056284029 only (the whole A4 row took at most 7.7 s
  there, jobs 127345428176 and 127345428628); the other 6 legs' logs were not kept. One new row "run() cap" (50 -> 51
  tests; 52 after b40 V8N).
- STAGE-NITS (burst 39, test side only): `deopt-diff-stage.test.mjs` F_LIVE now asserts the fake node's `./calls` is
  `6` (2R at the default RUNS=3; the probes exit before the counter), which kills the arm-after-counter fake-node
  mutants the old row let pass. The fake-node header comments of `deopt-diff-boundary`, `deopt-diff-stage` and
  `deopt-diff-stage-boundary` now describe the `--v8-options` arm as coded; `bytecode-budget-stage-boundary` row 9
  names in its failure message whether the 60 s wait ran out or the self-test exited before the SIGINT
  (reworded in burst 40, STN);
  `bytecode-budget-diff-boundary` has a comment on the A1 parity term. Test titles and counts are unchanged in all
  five files.
- EA3-NITS (burst 39, comments only): the `ext-audit.test.mjs` MD-51 comment now says the MOD / EVAL refusal rows
  run for every tool in TOOLS (it said "v8fl tools"), and the `ext-audit-alloc.test.mjs` b27 FROZEN EXPECTATION
  comment names its controls as they were then (MOD-ok / EVAL-ok, flipped to MOD-node / EVAL-node at G5). No code
  line changed; `ext-audit.test.mjs` stays at 224 tests.
- CI-FIX (burst 39, test side only; confirmed by CI run 42130164758 on aecb40f, all 8 legs green): CI run 42087141421
  (9b18f5d) was red on 3 of 8 legs. (a) macOS node 22: node 22 applies `--test-timeout` per test FILE, and
  `allocation-diff.test.mjs` took 28.7-36.8 min on the 7 CI legs that finished the file (the macOS node 22 leg was
  killed at 30.0 min), so the 30-minute Q-TT1 bound killed it; maintainer ruling Q-TT2 (2026-11-05): `package.json`
  "test" runs `--test-timeout=3600000` (60 min). The bound is honest only in part: a hung file fails by name only if
  it starts early enough for its 60 min to end inside the 120-minute job (the macOS `npm test` takes about an hour).
  (b) ubuntu node 24 / 26: the `deopt-diff.test.mjs` --fixtures mutant rows failed with "timed out after 180000 ms"
  after their runs had already finished, because two spawnSync rows blocked the event loop past the async timer. Caps
  now: the 5 --fixtures runs 780 s, the mutant runs 540 s (3x the CI-modelled worst case, the cap rule); each of the 5
  runs' rows logs its loop-timed run ms. The real durations: CI run 42130164758 (aecb40f) printed them on all 8 legs,
  every run under 50% of its cap (REPORTED, hosted CI, one run). Known limit: the timer can still mark such a run
  timed out (a false red only, never a false pass) (fixed in burst 40, TIMEOUT-ATTRIB).
- BBA4 (burst 39, test side only): the `bytecode-budget.test.mjs` A4 `--v8-flags` refusal row with `--out` checked
  only `raw/` and `report.txt`; both runs now assert the exact sorted recursive listing of OUT, derived from the
  script's `--out` block: report mode `raw`, `report.txt`; diff mode `raw`, `raw/after`, `raw/before`, `report.txt`
  (amended by Q-BB3, b45: diff mode now `raw`, `report.txt`, raw/ empty)
  (the refusal comes before any other write, so an extra or a missing entry is red). Mutants on private copies: an
  extra file in report mode, an extra file or a `stage/` dir in diff mode, a skipped `report.txt` each turn it red
  (HEAD's row passed the first three). The comment of the 25-token row now says its regex takes every `  --name (`
  line of the excerpt (any type; 14 today, floor >= 13) and checks no type. Titles unchanged: 162 tests.
- ICN (burst 39, test side only): `ic-diff.test.mjs` gains the A4 row relNodeDie (+ revert row): `--node ../fk/node`
  from a sibling cwd, the fake's `--v8-options` read exits 1 -> exit 2, empty stdout, stderr exactly the die +
  `VERDICT NO-VERDICT`, argv `--version`, `--v8-options`, 0 mktemp, and the die names the ABSOLUTE resolved path.
  The mutant M-v8fl-bin (`v8fl_check "$NODE_RES"` -> `"$NODE_BIN"`) turns it red. New mutant M-v8fl-afterhash
  (`v8fl_check` moved after the hashed `--v8-options` probe): the self-test fails exactly its designed rows 73 and
  74 (+ revert row). Rig: the fake node exits early on `--v8-options` when `fk/opts_rc` exists; `run()` takes an
  optional node and returns stderr. `ic-diff.sh` unchanged. `ic-diff.test.mjs`: 177 -> 181 tests.
- TIMEOUT-ATTRIB (burst 40, test side only; confirmed by CI run 42130164758 on aecb40f, all 8 legs green):
  `deopt-diff.test.mjs` `runOne` no longer marks a run as timed out when it exited before its cap timer ran (a run
  that exits only after the first poll phase past its cap is still killed and marked, with its real exit status). The
  cap timer now waits one `setImmediate` and kills / marks `timedOut` only if the child's 'exit' has not arrived by
  then (a flag on 'close' did not work: 'exit' is delivered in the poll phase and 'close' later). That closes the b39
  CI-FIX known limit (a run that exited while the loop was blocked could be marked timed out). `timeoutMsg` names its
  run ("self-test" or "e2e run") and prints "exit status <n>, no signal" when the signal is null. Each mutant MUST
  FAIL row logs "<name> mutant run: <ms> ms of its <cap> ms cap". New rows: a blocked-loop row (red on HEAD's
  `runOne`) and a `timeoutMsg` row; the e2e E-row revert checks call `noTimeout` outside `assert.throws`, so a timeout
  there is red and not a pass; the e2e cap is one const, `E2E_CAP` (60000 ms). `deopt-diff.test.mjs`: 150 -> 152
  tests. Known limits: the libuv phase order was run on macOS only (node 26.3.1 and 26.8.2); on Linux (where the b39
  rows failed) and on node 22 / 24 only the blocked-loop row exercises it, and that row (its Linux `ps` path included)
  passed on all 8 legs of CI run 42130164758; the row's 1.0 s sleep is fixed, not derived from the cap.
- V8N (burst 40, test side only; confirmed by CI run 42130164758 on aecb40f, all 8 legs green):
  `test/v8flags.test.mjs` runs the live `node --v8-options` spawn through `liveV8Options(node, cap = LIVE_CAP)`, which
  refuses a cap that is not a positive integer before any spawn (cap 0 is spawnSync's "no timeout", an unbounded hang
  that `--test-timeout` cannot interrupt). A hang already failed by name since b39 ("live node --v8-options timed out
  after <cap> ms (killed by SIGTERM)"); the new "live cap" row pins that message on `liveV8Options`, the helper the
  live spawn calls.
  The `run()` ENOENT check now matches the exact WORK path, so a TMPDIR containing a space no longer reads red.
  `v8flags.test.mjs`: 51 -> 52 tests. Not run: the whole file under a spaced TMPDIR.
- STN (burst 40, test side only): `deopt-diff-stage.test.mjs` F_LIVE title, comment and message now name driver call
  3 (node spawn 5; spawns 1-2 are `--version` and `--v8-options`). `bytecode-budget-stage-boundary` row 9 `sigCheck`
  checks `killed` first and names the no-SIGINT cause: the ~60 s wait ran out; exited after the awk shim blocked on
  "names"; or exited with no ready file (the self-test ended before that call, or the shim guard did not match it).
  The two exit messages carry the exit code and signal. This replaces the b39 STAGE-NITS wording (which named only
  the 60 s wait or an early exit before the SIGINT). Pass / fail is unchanged in every state (112 synthetic states
  compared). One `deopt-diff-stage` title text changed (the row and its teeth twin); counts unchanged
  (`deopt-diff-stage` 65, `bytecode-budget-stage-boundary` 64). The outside-SIGKILL path to the after-ready arm is
  coder-run only (6 trials), not reviewer-reproduced.
- ADV2 (burst 40, test side only): the `allocation-diff.test.mjs` tier mutant V2 now lists its designed rows as
  36, 71, 77, 78 (was 36, 78), re-derived on a V2 mutant self-test where exactly those 4 rows FAIL (each breaks a
  spawn count or the spawn log; row 77's log reads `--v8-options` alone). V1 was checked and is unchanged (16, 71,
  77, 78). Test count unchanged. V2 ran on the 4 ubuntu legs of CI run 42130164758 (its MUST FAIL row and revert row
  passed).
- TIMEOUT-NAMED (bursts 40 and 41, test side only): a child run that a cap killed now fails "<what> timed out after
  <cap> ms (killed by <signal>)" instead of a bare `null !== 0`, a missing ok row, or a green mutant row.
  - B0 (b40, 3ca5e79): new `test/spawn-cap.mjs` (`capSync` / `armCap` / `noTimeout` / `timeoutMsg`; ruling Q-TN1 =
    A; no tests of its own). It refuses before spawning a cap of 0, a non-integer cap, and an `opts.timeout` key;
    the async cap of a `spawn()` child sets its flag on the exit event and kills after one `setImmediate`, only if
    'exit' has not arrived. New rows S1-S4 in `test/spawn-cap.test.mjs`.
  - CI-EPIPE (b40; capSync + row SE 3ca5e79, v8flags 97c2122; ruling Q-EP1): `capSync` treats a stdin EPIPE as
    non-fatal ONLY when the child exited with a numeric status and did not time out; rows SE and v8flags "EPIPE".
    `v8flags.test.mjs` 53 tests.
  - B1-B3 (b40, 768cc24, 6a3e2ee, 2e17670): build / bytecode-budget / bb-stage / bb-diff-boundary / ibd / dd-live /
    death-signature; dd-boundary / dd-stage-boundary (row 12's SIGKILL escalation fails by name); ic-diff /
    ext-audit-alloc (a timed-out mutant run no longer reads as "survived").
  - b41 ext-audit (B4): the run helper and the two N34 chmod-000 spawns go through `capSync`; the N34 cwd is
    unlocked in a `finally` before the throw; the ic block FAKE NODE comment names rig() in `ic-diff.test.mjs` by
    text, not by its old line range :530-538.
  - b41 dds: `deopt-diff-stage.test.mjs` withCase / A5 / selfRun via capSync / armCap. The old code let M-nocheck
    and M-goonly PASS on a timed-out run.
  - b41 bbsb, bbsb-esc: `bytecode-budget-stage-boundary` runOn / stRun via `capSync` (the old code let MUTANT
    M-stage-chk-off PASS on a timeout); sigintRun's 30000 ms group SIGKILL escalation fails by name (row 9, its
    9173830d-build twin, M-int-trap).
  - b41 alloc, alloc-nit: `allocation-diff` self-test via `armCap`, rig via `capSync`, with a capErr guard (the old
    code let the -h revert row and 15 of 16 refusal revert rows PASS on a timeout). A spawn 'error' now fails by
    name (it was a 10 minute hang), a cleanup throw no longer masks the named timeout, and release() always runs.
  - b41 dd: `deopt-diff.test.mjs` local helpers replaced by spawn-cap (ruling Q-TN2 = A; one wording; the local "N
    ok row(s) printed" timeoutMsg is gone). `base()` caches a baseline error (BASE_ERR), so one timeout fails 59
    rows by name instead of re-running a 360 s baseline 59 times.
  - b41 v8f: the `v8flags.test.mjs` local capped / spawnOk (and its assumed-SIGTERM fallback) / benignEpipe are
    removed; the EPIPE / timeout / ENOBUFS rows are real runs; one title edited under ruling Q-TN3 = A. 53 tests.
  - b41 nul-awk: `nul-awk.mjs` whichOn / probeAwk via `capSync` (a racing timed-out probe no longer passes).
  - b41 B5: `spawn-cap.test.mjs` census row S5 and the "S5 teeth" history row (no raw `timeout` key or kill timer is
    left in `test/*.mjs` outside spawn-cap; escalation timers are allowed only with `escalated`); S1 checks the fake
    is gone unconditionally; the `ci.yml` history-row comment list is updated. `spawn-cap.test.mjs`: 11 tests.
  Confirmed: CI run 42140187169 (0e7f198, all legs green; evidence/b43-ci/SUMMARY.md), the second fully green run
  in a row after 42130164758.
- G-ENV (Q-ENV), allocation-diff + ic-diff (burst 43): `allocation-diff.sh` and `ic-diff.sh` now unset NODE_OPTIONS,
  NODE_V8_COVERAGE, NODE_COMPILE_CACHE and NODE_REDIRECT_WARNINGS once at script start, so no spawn sees them (the
  `--version` / `--v8-options` allowlist reads included); the head line and `-h` name all four. Each tool's fake node
  trips (exit 7) on any of the four. New self-test rows: allocation-diff 79 (79 checks), ic-diff 76 (76 checks).
  Mutants M-env-off per tool; the census mutants are converted (allocation-diff E5; ic-diff M22, M-v8fl-env,
  trace-env) -- they now also delete the top line. Closes audit findings allocation-diff A2 / A6 and ic-diff I2 / I6;
  bytecode-budget and deopt-diff follow in a later rung (behind G-STAGE and G-ORDER (PLAN-b42-genv A1)) (both
  landed in b45: see the two G-ENV entries below). Tier:
  DETERMINISTIC. Reviews: .handoff/evidence/b43-env-alloc/REVIEW-r1.md and .handoff/evidence/b43-env-ic/REVIEW-r1.md
  (local, untracked), both APPROVED r1 (3 NITS each: host-env strip list, fake-node comment, one doc line).
  Reviewer runs (r1), one run each, untimed (allocation-diff run load 18-32; the ic-diff run's load is not recorded):
  `ic-diff.test.mjs` 183/183, `allocation-diff.test.mjs` 210/210, `ext-audit-alloc.test.mjs` 55/55. NIT round
  (.handoff/evidence/b43-env-nit/, re-review .handoff/evidence/b43-env-nit/REVIEW-r2.md, APPROVED): the three test
  files' host-env strip lists (`test/ic-diff.test.mjs`, `test/allocation-diff.test.mjs`,
  `test/ext-audit-alloc.test.mjs`) now delete all four names AND pin `NODE_V8_COVERAGE = undefined`, because node's
  child_process re-inserts NODE_V8_COVERAGE into a spawn env that lacks the key (reproduced by the re-review on host
  node v26.8.2 and v26.3.1, REVIEW-r2.md; node 22 / 24 not run): with NODE_V8_COVERAGE set on the host, M-env-off
  went from 26 (ic-diff) / 45 (allocation-diff) FAILs to exactly 1 (row 76 / row 79); the fake-node comments name
  all four; the ic-diff `-h` "Report:" line is rewrapped (<= 120 cols). Re-run counts: `ic-diff.test.mjs` 183/183,
  `ext-audit-alloc.test.mjs` 55/55, `allocation-diff.test.mjs` 210/210 (one run each, untimed; load averages
  158 / 71 / 50 at the start, .handoff/evidence/b43-env-nit/provenance.txt).
- G-STAGE (burst 44), bytecode-budget + deopt-diff ref / file mode (`lib/stage.sh`, shared; 49d22705 -> 6895301f):
  stage_check / stage_write now refuse, each exit 2 with its die line once, 0 node spawns, 0 mktemp, OUT not created
  or left as it was (unless stated): G1 a dash-led `--before` / `--after` / `--driver` is read as ./<name> (it now
  runs; it was an "unexpected error" through the EXIT trap), `--module` gets `--`; C-22 `--` on every basename /
  dirname / cd / grep / mkdir / cp path argument; G2 `OUT/stage` as a symlink; G3 an `OUT/stage` that is not readable
  / searchable or not writable, refused as "is not empty" like a non-empty one (an unsearchable or unwritable one was
  refused only after raw/ + report.txt were written, in deopt-diff after 2 spawns); D1 a `--driver` whose directory
  bash's `cd` resolves to another file than the one read (`-ef`; a symlink before '..': a decoy driver would be
  staged); D6 a module and driver with the same name up to ASCII case; Q-DD6a a module or `--driver` file name with a
  byte outside printable ASCII (APFS folds Unicode case and NFC / NFD, so E-acute.js / e-acute.js were one file and
  the driver overwrote the staged module -> fail-open SAME), plus a stage_write `-ef` belt (a staged module and driver
  that are one file; it fires after OUT, raw/, report.txt and stage/before are written, and after the
  --version and --v8-options spawns (deopt-diff; bytecode-budget too since Q-BB3, b45, with raw/before and raw/after
  made first)); B4 `--module` must be a regular file in git at each ref (ls-tree mode 100644 /
  100755, `--literal-pathspecs`; a tracked symlink, mode 120000, is refused). Still not detected: `refs/replace`.
  Self-tests: bytecode-budget 57 -> 60 ok (D7: D1 decoy, D6 case clash, Q-DD6a NFC / NFD; `--fixtures` 81 -> 84; no
  git 53 + one FAIL); deopt-diff 92 -> 95 check(s) ok (R15 D1, R16 D6, R17 Q-DD6a; 21 staged rows S1-S4, R1-R17). `-h`
  of both names the new refusals. Roots bb f48d745e -> 44e94b60, dd f3f2ab7e -> 4273f48d (src bb 71cec9b3 -> 5c73bd26,
  src dd 39abdbaa -> 9e9f0319); ic / alloc / ibd roots byte-unchanged (6665d231 / 6f95901d / 740da13b). Tests:
  `bytecode-budget*.test.mjs` (count pins, -stage, -stage-boundary) gain rows for D1, D6, B4, G1, G2, G3 and Q-DD6a
  U1-U4 (+ a LANG / LC_ALL=en_US.UTF-8 row and an ASCII control), the -ef belt on a carrier root and the `:x.js`
  literal-pathspec row, with exact-once mutant twins (M-ef-off, M-nocase, M-lstree-off, M-dash-revert, M-trap-off
  re-carried, M-stage-link-off, M-stage-readable, M-ascii-off, M-ef-belt-off, M-literal-off); `deopt-diff*.test.mjs`
  gain rows for G1, G2, G3, B4 (+ `:x.js`), Q-DD6a U1-U3 (+ the UTF-8 row and an ASCII control) and the belt carrier,
  with twins M-lstree-off, M-literal-off, M-dash-revert, M-stage-link-off and M-ef-belt-off; its D1 / D6 / Q-DD6a
  refusals are pinned through the self-test count (R15-R17, 95). Not yet pinned (FILLERS): the G3 `-x` half in both
  tools, the `-w` half in deopt-diff (its M-stage-readable anchor matches 0 times: an abort, not a caught mutant), and
  deopt-diff's Q-DD6a (i) rows have a mutant (the M-ascii-off carrier) only where the file system folds. The belt rows
  SKIP "not checked, never passed" where the file system does not fold the names. 32 new rows are red on the 943bed4
  roots, the 3 controls green. Tier: DETERMINISTIC. Reviews: B1 r1 REJECTED (DESIGN, ruled Q-DD6a), then
  .handoff/evidence/b44-gstage-b1/REVIEW-r2.md APPROVED; .handoff/evidence/b44-gstage-b2/REVIEW-r1.md APPROVED;
  .handoff/evidence/b44-gstage-b3b4/REVIEW-r1.md APPROVED (6 test files: 743 tests, 742 pass, 1 known skip) (local,
  untracked). `npm test` (private copy with .git, node v26.8.2, untimed, host PRELIMINARY, load1 4.73 at start ->
  17.60 at end; .handoff/evidence/b44-npmtest/gstage/PROVENANCE.txt): 1684 tests, 1682 pass, 0 fail, 2 known skips,
  stderr empty.

- G-ENV (Q-ENV), deopt-diff (b45): `deopt-diff.sh` now unsets NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE and
  NODE_REDIRECT_WARNINGS once at script start, so no spawn sees them (the `--version` / `--v8-options` reads included;
  the per-spawn `env -u` belts stay); the head line and `-h` name all four, and its fake node trips (exit 7) on any of
  the four. New self-test row 96 (Q-ENV e2e: all four set in the environment reach no spawn, mono vs mono SAME, 8
  spawns). D5: the tier line "ops until TURBOFAN_JS" also reads node 22's `(target TURBOFAN)` and `(target TURBOFAN)
  OSR` compile lines (REPORTED tier only); new row 97 (T14, synthetic node 22 lines per the D5 ruling, with a `(target
  TURBOFANX)` control). Self-test 95 -> 97 checks; ok 1..95 are byte-identical to 0220d94. Roots: src/deopt-diff.sh
  9e9f0319 -> f19c57c5, deopt-diff.sh 4273f48d -> 6742fd3d. Tests: `test/deopt-diff.test.mjs` 152 -> 156 (its host-env
  strip deletes all four names and pins `NODE_V8_COVERAGE = undefined`), `test/deopt-diff-stage.test.mjs` 68 (A3 count
  pin 95 -> 97); mutants M-env-off (fails row 96 only) and M-d5-off (fails row 97 only); the reviewer also ran
  M-d5-wide (fails row 97 only; not a test twin). (bytecode-budget's G-ENV lane landed in b45: next entry.) Tier:
  DETERMINISTIC. Review: .handoff/evidence/b45-genv-dd/REVIEW-r1.md APPROVED; report
  .handoff/evidence/b45-genv-dd/REPORT.md (local, untracked).
- G-ENV (Q-ENV), bytecode-budget (b45): `bytecode-budget.sh` now unsets NODE_OPTIONS, NODE_V8_COVERAGE,
  NODE_COMPILE_CACHE and NODE_REDIRECT_WARNINGS once at script start, so no spawn sees them (every spawn:
  `--version`, both `--v8-options` reads, the probes; the per-spawn `env -u` belts stay); the head line and `-h`
  name all four, and its fake node trips (exit 7) on any of the four. Before this change the limits `--v8-options`
  read (`lib/v8limits.sh`, `LIMITS=...`) had no `env -u`, so all four variables reached it, NODE_OPTIONS included;
  that is why M-keep-NODE_OPTIONS is caught in bytecode-budget (it ends `2|NO-VERDICT|3|1`), unlike deopt-diff,
  allocation-diff and ic-diff. New self-test row 61 (Q-ENV e2e): 61 checks, 85 with `--fixtures`; ok 1..60 are
  byte-identical to the G-ORDER build d59a09de. Roots: src/bytecode-budget.sh 5fe1b678 -> e167367f,
  bytecode-budget.sh d59a09de -> 85e4f92a; the other four roots are byte-unchanged (deopt-diff 6742fd3d, ic-diff
  6665d231, allocation-diff 6f95901d, ibd 740da13b). Tests: `test/bytecode-budget.test.mjs` count pins 60 -> 61 and
  84 -> 85 (163 tests, including the G-ENV teeth test), `test/bytecode-budget-stage.test.mjs` 60 -> 61 / 53 -> 54,
  `test/bytecode-budget-stage-boundary.test.mjs` 53 -> 54; leak-node-options is converted (it now fails at the
  `--version` spawn) and its regex narrowed to that `--version` leak path, because the old regex also accepted an
  unrelated `-u` command failure (variantAll rewrote the allowlist `--v8-options` read's (v8fl_read) `env -u` belt
  into a command named `-u`); `test/bytecode-budget-order.test.mjs` A2 (b) head-line pin re-pinned to the four-name
  line. Mutant M-env-off is a test twin (bb.test); M-keep-V8 / CC / RW (each `2|NO-VERDICT|1|0`),
  M-keep-NODE_OPTIONS and M-say-old are reviewer-run; not test twins (each exactly 1 FAIL); M-top-late (the unset
  moved just above the `--version` read) survives and is equivalent (every spawn follows it). 10 new pins are red on
  the d59a09de root. Tier: DETERMINISTIC. Review: .handoff/evidence/b45-genv-bb/REVIEW-r1.md APPROVED; report
  .handoff/evidence/b45-genv-bb/REPORT.md (local, untracked).
- Q-BB3 (b45), bytecode-budget order of effects (G-ORDER; amends MD-57): the spawn-free refusals still come first;
  then `raw/` is made and `report.txt` truncated, then `--version`, the `--v8-options` allowlist read and the
  version-mismatch exit run BEFORE `raw/before`, `raw/after` and `stage_write`. So a `--node-version` mismatch, a
  failing `--version` or an allowlist refusal with `--out` leaves DIR holding `raw/` (empty) and `report.txt` only: no
  `raw/before`, `raw/after` or `stage/`. In ref / file mode a mismatch prints the head, mode and out lines, one `<fn>:
  NO-VERDICT -- node version mismatch: ...` line per fn and `VERDICT NO-VERDICT` (no before / after / driver / NOTE
  line: nothing is staged yet) and stages nothing; the run head is printed by `bb_head`, once after staging on an
  accepted run. deopt-diff is unchanged (already in this order). Pins unchanged: self-test 60 (84 with `--fixtures`),
  `-h` and the header text updated. Roots: src/bytecode-budget.sh 5c73bd26 -> 5fe1b678, bytecode-budget.sh 44e94b60 ->
  d59a09de. Tests: new `test/bytecode-budget-order.test.mjs`, 67 tests = 1 pipeline control + 30 rows + 36 mutant
  twins. Rows: A1 (mismatch with `--out` in diff / ref / file mode -> exit 2 after `--version` + `--v8-options`, DIR =
  empty `raw/` + `report.txt` equal to stdout; a matching rerun into the same DIR -> exit 1 DIFF, 7 spawns); A2 (a
  `--v8-flags` refusal and a failing `--version`, each in diff / ref / file mode, 6 rows: exit 2, die line on stderr,
  empty stdout, DIR = empty `raw/` + 0-byte `report.txt`) and A2 (b) (the staged-mismatch head: exactly the 5-line
  stdout, empty stderr, 2 rows); A4 (16 REGRESSION PIN rows: 14 spawn-free `--out` / `stage/` refusals with a mismatch
  still exit 2 with 0 spawns and the case dir byte-unchanged; 2 gate / report mismatch rows leave DIR = empty `raw/` +
  `report.txt` equal to stdout); A5 (20 cycles of mismatch + accepted rerun per mode: 2 + 7 spawns per cycle, 0
  mktemp, TMPDIR / cwd delta 0). Existing rows rewritten to the new order: `test/bytecode-budget.test.mjs`,
  `test/bytecode-budget-stage.test.mjs`, `test/bytecode-budget-stage-boundary.test.mjs` (row 12 belt now asserts the
  spawns `--version`, `--v8-options`); `test/death-signature.test.mjs` SYNC_FILES gains the new file. Mutants:
  M-raw-early, M-stage-early, M-head-staged, M-head-guard-off, M-hoist-above-out, M-hoist-above-stage,
  M-raw-all-modes. The A1 / A2 / A2 (b) / A5 rows and the pipeline control are red on the 44e94b60 root; the A4 rows
  are regression pins (green on both). Tier: DETERMINISTIC. Reviews: .handoff/evidence/b44-gorder-b1/REVIEW-r1.md and
  .handoff/evidence/b44-gorder-b2/REVIEW-r1.md (code), both APPROVED; tests:
  .handoff/evidence/b45-gorder-b3/REVIEW-A-r1.md REJECTED (1 LITERAL: a capped-run timeout counted as a mutant kill),
  then REVIEW-A-r2.md APPROVED; REVIEW-B-r1.md APPROVED (local, untracked).

- G-TRACKED (Q-BB2; B18 / B21 / B22), bytecode-budget + deopt-diff file mode (b45): a git error while checking whether
  `--before` is tracked (dubious ownership, a broken .git file, a gitfile to a missing dir, a bad config, a corrupt
  index) now exits 2 NO-VERDICT with 0 spawns, naming git's first line. Before, such a `--before` read as untracked:
  the old `is_tracked` passed git's 128 (127 with no git, which still reads as untracked) through as "not
  tracked". Not detected: a .git git does not recognise as
  a repository (unreadable, corrupt HEAD, no objects/) reads as no repository. The `ls-files` call now also runs with
  `--literal-pathspecs` (is_tracked now reads a tracked `:x.js` as tracked and an untracked `*` as untracked;
  pinned by the tracked.test.mjs `A1 literal-pathspecs` rows and mutant M7). New fragment
  `lib/tracked.sh` (`is_tracked`) is included in bb, dd, ic and alloc (ic / alloc: definition only, no caller; their
  self-test and `-h` are byte-identical); inlining-budget-diff is unchanged (its `is_tracked` keeps the known gap,
  D-4a). Self-test GT1 / GT2: bytecode-budget 61 -> 63 (`--fixtures` 85 -> 87; with no git, 54), deopt-diff 97 -> 99
  (23 staged rows); the `-h` text of both names the refusal. Tests: new `test/tracked.test.mjs` (68 tests from the
  plan's ASSERTIONS: A1 per tool, ibd known-gap rows, A5 git-spawn counts / retention, mutants M1-M7 with exact kill
  sets); `test/build.test.mjs` roster rows (+4); the bb-sb M-literal-off anchor narrowed;
  `test/death-signature.test.mjs` SYNC_FILES gains the new file. Tier: DETERMINISTIC.
  Reviews: .handoff/evidence/b45-gtracked-b1/REVIEW-r1.md REJECTED (2 LITERAL), then REVIEW-r2.md APPROVED;
  .handoff/evidence/b45-gtracked-t/REVIEW-r1.md REJECTED (2 LITERAL), then REVIEW-r2.md APPROVED;
  .handoff/evidence/b45-gtracked-b2/REVIEW-r1.md APPROVED (B2 + B3); reports REPORT.md in each
  (local, untracked). This does not make every unexpected git error exit 2 elsewhere (G-FINAL has not landed).

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
  `-h` for `--node`: resolved once from the caller's cwd, must be an executable file; for
  `--v8-flags`: each flag is `--` and a letter.
- `test/deopt-diff-boundary.test.mjs`: the A4 parity row no longer pins `bytecode-budget.sh` (it leaves the
  Phase 2 freeze, MD-32 (a)); the `inlining-budget-diff.sh` pin (740da13b) stays.
- `npm test` runs `test/death-reporter.mjs` on stderr next to spec on stdout. A test-file child that dies prints
  `FILE DIED <file> exitCode=<x> signal=<y> after=<ms>ms`; a file that dies after a failed subtest (node then hides
  its exit status) prints `exitCode=unknown signal=unknown` on node >= 24 only (node 22 stamps no data.entryFile:
  there such a death prints no FILE DIED line, the run still fails, and the gate's hidden-status row skips with that
  reason). Ordinary passing or failing tests print nothing. The await-free spawnSync files (`ext-audit`, `build`,
  `bytecode-budget`, `bytecode-budget-stage`, `bytecode-budget-diff-boundary`, `inlining-budget-diff`) yield in a
  `beforeEach` so a death names the last test that passed; their test counts are unchanged. Gated in `npm test` by
  `test/death-signature.test.mjs` (7 tests, DETERMINISTIC).

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
    <DIR>/report.txt" before any node spawn. Both tools now refuse each of these with 0 spawns (F2
    closed; `deopt-diff.sh` used to exit 2 only after the `--version` spawn, and `bytecode-budget.sh`
    did not refuse an unwritable empty raw/ in report / gate mode): an absent OUT under an unwritable
    parent, a dangling-symlink OUT, a `report.txt` that is a dangling symlink into a missing
    directory, an existing OUT that is not writable but has a writable `report.txt` and no raw/, an
    empty raw/ that is not writable or not searchable (0000, 0600, 0500, or a symlink to one). An
    unreadable raw/ (0300, or a symlink to one) used to pass the emptiness test: both tools ran it in
    every mode and exited 0, and `bytecode-budget.sh` report / gate mode overwrote a `<fn>.<k>.txt`
    already in it; it is now refused with 0 spawns too. `bytecode-budget.sh`: "--out: <OUT>/raw is
    not readable" / "is not writable". `deopt-diff.sh`: the same readable check, and a walk from
    `raw/before` up to the first existing path (or a symlink, or `.`) that must be a writable,
    searchable directory, else "--out: cannot create <OUT>/raw/before and <OUT>/raw/after (<X> is not
    a writable directory)"; the walk stops at `.`, so a relative `--out` in an unsearchable cwd is
    refused with 0 spawns.
  - A `report.txt` that is a symlink (even one pointing inside DIR; the target stays untouched) is
    refused, both tools: "--out: <DIR>/report.txt is a symlink (refused: the write would follow it)".
  - A `--node` (`bytecode-budget.sh`) or PATH (both tools) directory whose name ends in a newline now
    exits 2 with 0 spawns and no raw `cd:` line, as "node binary: cannot resolve the directory of ..."
    (or "node binary is not an executable file" when the name without its trailing newline is also a
    directory; `deopt-diff.sh` refuses a `--node` with a newline earlier, as "a newline is not
    allowed").
  - Printed joins no longer contain `//`.
  - A `--node` path (every mode) or a DRIVER (driver mode) whose `..` follows a symlink, so that its
    logical and physical paths name different files, is refused with 0 spawns;
    `--out` with such a `..` writes into the directory that was checked and the header prints its
    physical path.
  Tier: DETERMINISTIC. Gated in `test/ext-audit.test.mjs` (205 tests in the file: 65 in the
  `ic-diff.sh` block, 140 in the bb / dd block; 224 after MD-46; fake nodes, no V8 run; the first 72 rows (bb 35 /
  dd 37) are red on 8070907's scripts (bb 99790884 / dd db89aba0) except 8 that pin behavior 8070907
  already had: the controls B4B x2, N18 x2 and dd N15, plus N8 x2 and dd N11; the bb N19a control is
  red there). In `npm test`.

- `ic-diff.sh`, external-audit group (exit 2 refusals, all before any node spawn unless a bullet says
  otherwise; the same classes as the bullet above, plus the node / DRIVER resolution rules). F2 is
  closed here too (the F2 bullet below); the "F2 closed" wording above was written for `bytecode-budget.sh`
  and `deopt-diff.sh`.
  - `CDPATH` is unset at the top of the script, so no `cd X && pwd` join resolves X through a CDPATH
    entry.
  - `--v8-flags`: each flag must be `--` and a letter; `---x` and `--=1` are refused ("--v8-flags takes
    flags only (each starts with -- and a letter), got '---x'").
  - A dash-led `--out` is a name: `--out -x` writes `<cwd>/-x` (it used to be read as options by mkdir).
  - DIR/raw must be absent, or an empty directory that is readable (and searchable): an unreadable raw/
    (0300) used to pass the emptiness test; it is now refused, "--out: <DIR>/raw is not readable".
  - A `report.txt` that is a symlink is refused (maintainer decision MD-34), with the same message as
    `bytecode-budget.sh` / `deopt-diff.sh`: "--out: <DIR>/report.txt is a symlink (refused: the write
    would follow it)". An unwritable `report.txt` (a directory) is refused before any spawn: "--out:
    cannot write <DIR>/report.txt"; the write at the point of use is now checked too (same message; it
    used to end "unexpected error (exit 1)" after the two probes), a backstop for a write that races
    the check.
  - node resolution: a bare name is looked up on PATH; a name with a slash is a path and is never looked
    up on PATH (`--node ./node` with node only on PATH: "node binary is not an executable file:
    ./node"); it must pass `-f` and `-x`, else exit 2 ("node binary not found: <name>" for a bare name
    not on PATH). A `-` dirname (`--node -/node`) resolves as `./-`. The resolved directory + name must
    be the same file as the given path (`-ef`): `--node <link>/../node`, where `..` follows a symlink,
    is refused. The header prints the absolute path.
  - DRIVER: a dash-led file name reaches node as `./<name>` (unchanged; the header prints
    `<dir>/-x.js`); `--` is not an end-of-options marker (unchanged; unknown option, exit 2). A DRIVER
    whose `..` follows a symlink is refused, "DRIVER (before): cannot resolve the directory of <path>
    (a symlink before '..'?)".
  - `OUT_L`: raw/, report.txt and the printed `out` line name one directory: the logical path when it
    is the same directory as the given `--out`, else the physical one. `--out <link>/../outd`, where
    `..` follows a symlink and an `outd` also exists at the logical path, used to put raw/ in the
    physical directory and report.txt in the logical one, and printed the logical one.
  - The header `node`, `before` and `after` paths are joined with `${X%/}`, so a node or DRIVER directly
    under `/` prints `/<name>`, not `//<name>`; refusal messages still print `--out` as given (`--out
    DIR/` prints "DIR//raw ...").
  - F2 closed (151985d): `deopt-diff.sh`'s `--out` walk, verbatim, now refuses an OUT whose raw/before and
    raw/after cannot be created (an absent DIR under an unwritable parent, a dangling-symlink DIR, an existing
    unwritable DIR with a writable `report.txt` and no raw/, an empty raw/ that is readable but not writable;
    a raw/ symlink to one is refused earlier by MD-36, "is a symlink"), exit 2 with 0 spawns, nothing written,
    "--out: cannot create DIR/raw/before and DIR/raw/after (<first existing ancestor> is not a writable
    directory)" (before: raw/ 0500 made the 2 probe spawns, `--version` and `--v8-options`, and only then
    exited 2 "--out: cannot create DIR/raw/before and DIR/raw/after").
  Tier: DETERMINISTIC. Gated in `test/ext-audit.test.mjs` (the ic block: fake nodes, no V8 run; the
  F2 pin of the 12fa753 era became N29 "F2 closed", with walk rows N30-N36, N33 a control) and
  `test/ic-diff.test.mjs` (`--self-test` prints "self-test: 72 check(s) ok", 75 after MD-46; checks 64 and 65 are
  the node refusals "node binary is not an executable file: ./nonode" and "node binary not found: nonode", and
  checks 66-72 are the --out walk and the B-four refusals, see the F2 and B-four bullets). In `npm test`.

- `deopt-diff.sh`, `bytecode-budget.sh`, `ic-diff.sh`, external-audit group B-four (exit 2 refusals, all before
  any node spawn, nothing written; the same arms as the `allocation-diff.sh` bullet below):
  - `--v8-flags` refuses, with `_` read as `-` and as prefix matches, every `--require*`, `--import*`,
    `--loader*` and `--experimental-loader*` flag (MD-42); every `--env-file*`,
    `--experimental-config-file*` and `--experimental-default-config-file*` flag (MD-39 / MD-40); and every
    `--eval*` and `--print*` flag (MD-44, MD-47 text: `--eval` / `--print` run code of yours instead of the
    driver; V8's `--print-*` flags print V8 internals into the measured run). `-r` / `-e` / `-p` stay
    refused by the letter gate. In `bytecode-budget.sh` its own `*print-bytecode*` refusal still fires first;
    in `ic-diff.sh` the arms are byte-identical to `deopt-diff.sh`'s and none overlaps the earlier `*log*` /
    `*prof*` arm (census on node v26.8.2: 46 flags hit a new arm, 0 hit both).
  - `--out`: a `raw/` symlink is refused before the `ls -A` check (MD-36; a dangling `raw/` now reads "is a
    symlink", it read "is not empty"); a `report.txt` with another hard link is refused (MD-37;
    `bytecode-budget.sh` guards it with `! -f`, MD-48, so a directory `report.txt` keeps "cannot write");
    a newline in the resolved node path is refused (MD-38).
  - Self-test: `deopt-diff.sh` 84 -> 89 checks, `bytecode-budget.sh` 49 -> 54 (73 -> 78 with `--fixtures`),
    `ic-diff.sh` 65 -> 72 (the walk, MD-36 / 37 / 38 / 40 / 42 / 44).
  Tier: DETERMINISTIC. Gated in `test/deopt-diff.test.mjs` (5 OUT_MUTANTS, one each for MD-36 / 37 / 39-40 /
  42 / 44), `test/deopt-diff-boundary.test.mjs` (the `raw/` symlink rows expect "is a symlink"),
  `test/bytecode-budget.test.mjs` (5 MUTANTS rows, each killing exactly one of checks 50-54),
  `test/ic-diff.test.mjs` (11 mutants M-walk, M-walkL, M-walkd, M36, M37, M38, M40, M42, M42x, M44, M44x, each
  with a revert row) and `test/ext-audit.test.mjs` (205 tests, was 154:
  14 rows per tool for deopt-diff / bytecode-budget, MD36a / b / n, MD37a / c, MD38, ENV, MOD, MOD-r,
  MOD-ok, EVAL, EVAL-ep, EVAL-ok, RET, plus MD38n for both; the ic block 44 -> 65 tests: F2 re-pinned as
  N29, walk rows N30-N36, the same class rows and an ic RET row). In `npm test`.

- `allocation-diff.sh`, external-audit group (exit 2 refusals, all before any node spawn, 0 mktemp, nothing
  written; the same classes as the `ic-diff.sh` bullet above, plus MD-36 to MD-45). The hot body
  (`run_side` and the run loop) is unchanged.
  - `CDPATH` is unset at the top of the script, so no `cd X && pwd` join resolves X through a CDPATH
    entry.
  - `--v8-flags`: each flag must be `--` and a letter; `---x` and `--=1` are refused ("--v8-flags takes
    flags only (each starts with -- and a letter), got '---x'"; was: any `--*`).
  - MD-39 / MD-40: every `--env-file*`, `--experimental-config-file*` and
    `--experimental-default-config-file*` flag is refused, a prefix match with `_` read as `-` ("--v8-flags
    must not set --env-file=x: it loads environment variables or node options from a file (e.g. a
    NODE_OPTIONS preload) into the measured process"; was: accepted; node read the file into the measured
    process).
  - MD-42 / MD-43: every `--require*`, `--import*`, `--loader*` and `--experimental-loader*` flag is
    refused, a prefix match (`--loader=F`, `--experimental_loader=F`, `--require-module`; one arm). Was:
    only bare / `=FILE` `--require` and `--import`. A module of yours, preload or loader, is part of the
    measured process, and a `--require` one runs ahead of the guard's own. `-r` was already refused (as a
    non-flag, by the old `--*` gate) and is not new.
  - MD-44 / MD-45: every `--eval*` and `--print*` flag is refused, a prefix match with `_` read as `-`,
    before any spawn ("--v8-flags must not set --eval=F: it runs code of yours in the measured
    process instead of the driver (node evaluates it; the driver becomes argv and never runs)"). With one,
    node ran that code in the measured process and the driver only became argv, while the head named the
    driver (was: accepted). V8's `--print-*` flags (e.g. `--print-bytecode`) are refused with it; `-e` /
    `-p` were already refused as non-flags.
  - A dash-led `--out` is a name: `--out -x` writes `<cwd>/-x` (it used to be read as options by mkdir).
  - MD-36: a DIR/raw that is a symlink is refused, "--out: <DIR>/raw is a symlink (refused: the writes
    would follow it)". The check comes right after the readable check, so a dangling raw/ now reads "is a
    symlink" (it used to read "is not empty (give a new or empty DIR)", also before any spawn) and a
    symlink to a 0300 directory still reads "is not readable".
  - MD-37 and the `report.txt` rules: a `report.txt` that is a symlink is refused ("--out: <DIR>/report.txt
    is a symlink (refused: the write would follow it)"), an unwritable one before any spawn ("--out: cannot
    write <DIR>/report.txt"), and one with another hard link ("--out: <DIR>/report.txt has another hard link
    (refused: the write would change that file too)"; the DRIVER `-ef` refusal still covers a hard link to a
    DRIVER). The write at the point of use is now checked too (same message; it used to end "unexpected
    error (exit 1)" after the `--version` probe), a backstop for a write that races the checks.
  - The `--out` walk: from DIR/raw/before (DIR/raw/driver with `--zero`) up to the first path that exists,
    which must be a writable, searchable directory, else "--out: cannot create <DIR>/raw/before and
    <DIR>/raw/after (<path> is not a writable directory)" (`--zero`: "... cannot create <DIR>/raw/driver
    (...)"), before any spawn. It used to be refused only after the `--version` probe. The walk stops at
    `.`, so a relative DIR with no existing parent is judged in the current directory.
  - node resolution (`--node`, default `$NODE`, else `node`): a bare name is looked up with `command -v --`;
    a name with a slash is a path and is never looked up on PATH ("node binary not found: <name>" for a bare
    name not on PATH). It must pass `-f` and `-x`, else exit 2 ("node binary is not an executable file:
    <path>"). The resolved path is
    absolute and the head prints it; a `-` dirname (`--node -/node`) resolves as `./-`; the resolved
    directory + name must be the same file as the given path (`-ef`), so `--node <link>/../node`, where `..`
    follows a symlink, is refused. MD-38: a newline in the resolved path is refused ("node binary: a newline
    is not allowed in the resolved path").
  - DRIVER: the directory is resolved with `cd --` and the result must be the same file as the given path
    (`-ef`); a DRIVER whose `..` follows a symlink is refused, "DRIVER (after): cannot resolve the directory
    of <path> (a symlink before '..'?)".
  - `OUT_L`: raw/, report.txt and the printed `out` line name one directory: the logical path when it is the
    same directory as the given `--out`, else the physical one. The header `node`, `before` and `after`
    paths are joined with `${X%/}`, so a node or DRIVER directly under `/` prints `/<name>`, not `//<name>`.
  - `--self-test` 73 -> 76 checks: the new last three are MD-39 (env-file / config-file), MD-42 (module
    loaders) and MD-44 (eval / print).
  Tier: DETERMINISTIC. Gated in `test/ext-audit-alloc.test.mjs` (50 tests, 55 after MD-46; fake nodes, no V8 run;
  each refusal row asserts exit 2, the exact die line once, 0 spawns, 0 mktemp and 0 new entries; on
  73508a2's `allocation-diff.sh` 42 are red and 8 are controls that pin behavior it already had; on the
  fixed script all 50 are green) and `test/allocation-diff.test.mjs` (200 tests, 206 after MD-46, 208 after CI on
  Linux; `--self-test` prints "self-test: 76 check(s) ok", 78 after MD-46). `test/death-signature.test.mjs` lists
  the new file among the await-free spawnSync files. In `npm test`.
