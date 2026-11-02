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
  an `=X` of N or N.M, N and M of 1..9 digits (`=1.5` runs; `=abc`, `=.5` refused), the negated forms of those two budget flags
  (V8 spells them `no` + optional `-` / `_`: `--no-max-inlined-bytecode-size=5`, `--no_...`, `--nomax-...`,
  `--no-reserve-inline-budget-scale-factor=1.5`, `--noreserve-...`), `--self-test` combined with anything but
  `--fixtures DIR`, an empty separate value for any value option (`--fixtures ''`, `--out ''`), an empty `--opt=` value (`--fn=`, `--runs=`), `--self-test` / `--help` with `=value`, and a `--v8-flags` of only blanks (`' '`, a tab). The node version must match exactly (v26.8.2-pre is not v26.8.2).
  `--self-test` (42 canned checks) and `--self-test --fixtures DIR` (+24 checks on node v26.8.2
  captures in `test/fixtures/bytecode-budget/node-26.8.2/`).
  DETERMINISTIC (gated in `npm test` via `test/bytecode-budget.test.mjs`, 128 tests): the exact
  self-test counts (42 and 42+24), 14 self-test mutant rows (9 report/gate + 5 diff) plus a
  NODE_OPTIONS-leak and a version-prefix mutant that must each be caught, gate rows on a fake node,
  48 refusal rows with 0 node spawns (41 report/gate + 7 diff), the driver cwd, spawn and retention
  counts (8 spawns for 3 fns x 2 runs), and a
  live pair on node v26.8.2 (`mid=211` exit 0, `mid=210` exit 1; on any other node the pair must
  exit 2 with a version-mismatch NO-VERDICT).
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
  in each of report and diff mode, each of which must turn its row red; 5 of the 14
  self-test mutant rows cover diff; and a live pair on node v26.8.2 (a driver against itself ->
  SAME, against a copy with one function made longer -> DIFF; on any other node exit 2).
  REPORTED (not gated): 20/20 live runs per side of the diff pair (`add` and `dup` SAME, `mid`
  211 -> 220 DIFF), exit codes 20x0 and 20x1, one distinct output each with 0x stripped
  (2026-11-02, Darwin 27.0.0, node v26.8.2, build 06cb4911 = the B1 build; load1 4.16 before / 3.95
  after, 2 node processes before / 0 after, none >= 10% CPU). The final 686de5bf was not rerun 20/20:
  one hand run of 14 diff-mode cases (6 that spawn node, 8 refusals) matched the B1 output except for
  temp-dir paths.

### Changed

- `bytecode-budget.sh` report and gate mode: an unreadable DRIVER (chmod 000) is now refused before any
  node spawn ("DRIVER not found (or not a readable file): X", exit 2). It used to be probed and ended
  "driver exited 1" NO-VERDICT, also exit 2.
- `inlining-budget-diff.sh` is now generated from `src/` + `lib/`; the output is byte-identical to
  7f0ba7b (sha256 740da13b...).
- `lib/v8probe.sh` (LIMITS_AWK, BYTECODE_AWK) and `lib/v8limits.sh` (the limits read and `lim`)
  are cut verbatim from `src/inlining-budget-diff.sh` and shared with `bytecode-budget.sh`; the
  generated `inlining-budget-diff.sh` stays byte-identical (sha256 740da13b...).
