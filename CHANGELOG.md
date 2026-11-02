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
  `--fixtures DIR`, an empty separate value for any value option (`--fixtures ''`, `--out ''`), and a `--v8-flags` of only blanks (`' '`, a tab). The node version must match exactly (v26.8.2-pre is not v26.8.2).
  `--self-test` (29 canned checks) and `--self-test --fixtures DIR` (+24 checks on node v26.8.2
  captures in `test/fixtures/bytecode-budget/node-26.8.2/`).
  DETERMINISTIC (gated in `npm test` via `test/bytecode-budget.test.mjs`, 72 tests): the exact
  self-test counts (29 and 29+24), 9 self-test mutant rows plus a NODE_OPTIONS-leak and a
  version-prefix mutant that must each be caught, gate rows on a fake node, 36 refusal rows with
  0 node spawns, the driver cwd, spawn and retention counts (8 spawns for 3 fns x 2 runs), and a
  live pair on node v26.8.2 (`mid=211` exit 0, `mid=210` exit 1; on any other node the pair must
  exit 2 with a version-mismatch NO-VERDICT).
  REPORTED (not gated): 20/20 runs per side of `--max add=6,mid=211,dup=19` / `mid=210`, one
  distinct output with 0x stripped (2026-11-02, Darwin arm64, node v26.8.2, script 2d83e824,
  load1 7.39 before / 7.37 after, 5 other node processes, none >= 10% CPU).

### Changed

- `inlining-budget-diff.sh` is now generated from `src/` + `lib/`; the output is byte-identical to
  7f0ba7b (sha256 740da13b...).
- `lib/v8probe.sh` (LIMITS_AWK, BYTECODE_AWK) and `lib/v8limits.sh` (the limits read and `lim`)
  are cut verbatim from `src/inlining-budget-diff.sh` and shared with `bytecode-budget.sh`; the
  generated `inlining-budget-diff.sh` stays byte-identical (sha256 740da13b...).
