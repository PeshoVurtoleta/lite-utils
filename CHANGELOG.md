# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- b76 Phase 6 (ROADMAP "Phase 6 -- docs", D-1): the package is publish-shaped and documented. `package.json` drops
  `"private": true` (Q-P6-PRIVATE; the version stays 0.0.0 until 1.0.0, D-3) and gains `files` (the five generated
  root scripts + README.md, LICENSE, CHANGELOG.md, llms.txt; not src/, lib/, test/, build.sh, LEDGER.md, ROADMAP.md),
  `bin` (allocation-diff, bytecode-budget, deopt-diff, ic-diff, inlining-budget-diff -> the matching root .sh;
  Q-P6-BIN), `repository` / `homepage` / `bugs` (Q-P6-REPO) and `keywords` (Q-P6-KEYWORDS). New README.md (the
  LiteSepforge spine: install three ways, a quick-start, one section per tool with usage, modes, verdict and exit
  codes and tier, CLI reference, a CI recipe, design notes, Known limits incl. LEDGER #124 and #126) and
  llms.txt. New gate `test/pack.test.mjs` (13 tests): `npm pack --dry-run --json` lists exactly the 10 shipped
  paths in a decoy copy (A1), the ruled package.json fields and `npm pkg fix` leaves it byte-identical (A2), an
  offline tarball install gives five `node_modules/.bin` commands whose `-h` exits 2 (A3), the shipped docs are
  ASCII with no tool-call tag (A4), README.md and llms.txt hold the #124 sentence exactly once (A5), and no shipped
  root sources lib/ (A6); each with a must-fail control, and A1 / A2 / A3 red on the 861f3d3 package.json (history
  rows: SKIP locally, FAIL under CI when the commit is unreachable). npm runs as `process.execPath` + npm-cli.js
  with a dead registry, never via PATH. Tier: DETERMINISTIC. The README flag claims are a review check this burst
  (Q-P6-DOCGATE); README numbers come from this burst (`.handoff/evidence/b76-p6/quickstart.txt`, the closing
  npm test) (local, untracked).

- G5c inlining-budget-diff (reading-list finding Q-RL-TURBO; Q-B62-TL). A Turbolev run is no longer mislabelled as
  a Maglev one: V8 14.6 with Turbolev on prints TurboFan-tier (@TF) units under --trace-maglev-inlining, so the old
  build compared them and could say SAME or DIFF about a different tier (MEASURED on real node v26.8.2: `--tiers
  maglev --v8-flags=--turbolev` null pair, old and before builds exit 0 SAME with 11 @TF lines in
  dec/maglev.before.1.tsv). Now: (1) `--v8-flags` with --turbolev or --turbolev-future (exact names,
  `--turbolev_future` and every `=value` form too) is refused after v8fl_check and before any run, exit 2, named
  reason; --no-turbolev, --no-turbolev-future and --max-turbolev-inline-depth=N pass. (2) When the captured
  --v8-options shows Turbolev on by default (a V8 default flip; the check also holds under `--concurrent`, where
  units carry no tag), or its default cannot be read (a row other than exactly on / off, e.g. `--turbolev-future`
  under the --turbolev header), every tier is NO-VERDICT, exit 2, before any driver spawn (0 extra spawns; ref /
  file mode leaves staged files, stated in -h). A V8 that lists neither flag reads as off (Q-B62-TL). (3) In tag
  mode, any @TF / @TF-OSR unit in a maglev-tier dec file makes that tier NO-VERDICT with the count ("N decision
  line(s) in TurboFan-tier (@TF) units (Turbolev?)"), never a DIFF; a unit merely named `TF` does not count. (4)
  Doc truth: the lowercase V8 14.6 line `generated N nodes. regular_budget += B ~~> T` (printed for non-eager
  Maglev inlining) is now read as a budget event (the regex took only capital G), so no "no budget counters" NOTE;
  -h and the Known limits say so. `--self-test` 85 -> 89 checks (tl node default, @TF count 6 not 4, lowercase
  budget, --v8-flags refusal). Gates: audit-g5 73 -> 98 tests (25 new 5c rows; all 11 gate rows red on the old
  build 7c91d1c, 8 controls green, a real-node old-build twin opt-in via LITEUTILS_REAL_HOLD=1),
  test/inlining-budget-diff.test.mjs CHECKS 85 -> 89 with 4 new MUTANTS (tl-no-cmdline-arm, tl-no-default-on,
  tl-no-tf-unit-check, budget-capital-g-only), v8fl-check-after-mkdir re-anchored, a new -h phrase row, PARITY pin
  e297d240. Tier: DETERMINISTIC (fake-node rows) plus MEASURED on real node v26.8.2 only: of 509 default-off bool
  flags only --turbolev and --turbolev-future can turn Turbolev on (--future does not), and a Turbolev-off real
  maglev + turbo run is SAME with 0 @TF lines. Limits: LEDGER #109. Other roots unchanged (bb f1070535, dd
  2ce1d32e, alloc 195242d9, ic 50a6fc34); lib/ unchanged. Review r1 APPROVED. mawk / gawk / bash 5 / Linux:
  UNPROVEN until CI.
- G4 ic-diff (audit R13 = ICD-fable-1 / ICD-opus-1, R14 = ICD-fable-2 / ICD-opus-2, R26 = ICD-opus-3, R6 name guard;
  Q-B57-MINOR, Q-B57-FLAG, Q-B64-REPRO). R13 (Q-B57-MINOR, Opus form): V8 expands `%p` (pid), `%t` and `%%` in
  --logfile, so a `%` in the run dir (`--out DIR` or TMPDIR holding one) made the trace write elsewhere and the run
  ended `no IC log` (NO-VERDICT, never a wrong verdict); run_side now doubles every `%` in the trace subshell's own copy
  of the run dir (`rd=${rd//%/%%}`, bash builtin, no fork; the parent's `$rd` stays raw for the glob, mv and awk), so V8
  expands it back to the one `%`. R14: a relative TMPDIR made the private log dir relative while the trace runs from
  the driver's directory; the private dir is now resolved once to an absolute path (`cd -- DIR && pwd`) before any
  run, so every `--logfile=` starts with `/` (with a trailing-slash TMPDIR the // before ic-diff.XXXXXX becomes one /
  in argv (read: the report is unchanged)). R26 (one line per tool): an `=` in the resolved node path is refused, exit
  2, 0 spawns, with the dd / bb text (`node binary: an = is not allowed in the resolved path (env would read it as a
  NAME=value operand, not as the program): PATH`), on both routes (`--node` and a bare node found via PATH); the check
  is on the resolved path, before any node spawn. R6 name guard (Q-B57-FLAG): a `--v8-flags` token holding
  `*stress-concurrent-inlining*` (every spelling, `_` or `-`, the `--no-` form and the `--v8-flags=` form included) is
  refused, exit 2, 0 spawns (V8 implies --concurrent-recompilation from it, which overrides the script's
  --no-concurrent-recompilation; before the fix it ran (A4 OLD twin, fake node: rc 0 SAME, 7 spawns at --runs 2; a
  wrong ic verdict under the flag is argued from R6, measured only for deopt-diff)). -h: the node-binary line names the
  `=` refusal, three whole lines name the flag refusal, and one line says each `%` in the run dir is passed doubled
  (%%); the newline-refusal -h line is split into three to name the = refusal (no other existing line changes). On
  normal input the records are byte-identical to the before build 7c91d1c / sha256/8 11279540: golden parity on the B1
  root 5142d62a (byte-identical: report.txt, rc, stdout and the argv log with and without --out; the self-test keeps
  rows 1-76 and adds 77-81; -h differs by that split line and the inserted lines; evidence/golden/PROVENANCE.txt, node
  26.8.2, load1 2.27). Final roots: ic-diff.sh sha256/8 50a6fc34, src/ic-diff.sh f1568ac8, test/ic-diff.test.mjs
  c2b321b8, test/audit-g4.test.mjs 23f84cf9. Spawns: unchanged (7 at --runs 2, 9 at the default --runs 3, one mktemp);
  a refusal makes 0 spawns and 0 mktemp. Tests: `--self-test` 76 -> 81 checks (rows 77-81: R13a `--out DIR` holding
  `o%pz%%q`, R13b TMPDIR `t%p`, R14, R26 on both routes, R6 on three spellings; rows 1-76 keep their numbers; the
  self-test's fake node now expands `%%` / `%p` in --logfile as V8 does); test/ic-diff.test.mjs C 76 -> 81, 9 new
  mutants (M-pct, M-pct-parent, M-pct-first, M-pct-p, M-abs, M-eq, M-eq-bin, M-sci, M-sci-exact); the test requires each
  mutant to fail its listed rows (M-pct and M-pct-parent 77, 78; M-pct-first and M-pct-p 77; M-abs 79; M-eq and M-eq-bin
  80; M-sci and M-sci-exact 81), at-least rows; "each red on its own rows only" was measured by hand: the 7 mutants by
  mut-b1 on the B1 root 5142d62a (row 77 then `o%pz`), M-pct-first and M-pct-p on the final root 50a6fc34 (red on
  exactly [77]). The before build 7c91d1c fails exactly rows 77-81 (mut-b1-OLD.txt, B1 root 5142d62a; r1 revert-all on
  the r1 root 09fb5c15). test/audit-g4.test.mjs added (35 tests, black-box, its own fake node with V8's `%` expansion,
  each A1-A4 row with an OLD twin on `git show 7c91d1c:ic-diff.sh`; A5 parity runs OLD vs fix; retention has a
  must-fail control; rows: A1 R13 at `o%pz%t%%q` / TMPDIR `t%p%t%%` plus real node, A2 R14, A3 R26, A4 R6, A5 parity,
  zero-write refusals and 12-cycle TMPDIR retention). Review: r1 REJECTED (1 LITERAL: the -h promise "each %" had no
  must-fail mutant, the one-`%` vectors let `rd=${rd/\%/%%}` and `rd=${rd//%p/%%p}` through); one fix round
  (multi-`%` vectors, M-pct-first, M-pct-p); r2 APPROVED. Audit repro rows (Q-B64-REPRO: the two ic-diff reproduction
  scripts as unmodified copies, REPORTED demonstrations): before build RED ICD-fable-1, ICD-fable-2, ICD-opus-1,
  ICD-opus-2, ICD-opus-3 (ICD-fable-3 GREEN); the B1 root 5142d62a all six GREEN (REPRO-b64-before.txt,
  REPRO-b64-after-b1.txt; the later roots changed only one -h line and the test vectors; the repro was not re-run on
  the final root). `npm test` pre-review (lane copy with .git, quiet lock, host PRELIMINARY, load1 5.43 -> 14.63,
  baseline 2.21, on the r1 root 09fb5c15 / audit-g4 a9f67f70): 2720 tests, 2712 pass, 0 fail, 8 skip, 1401 s
  (NPMTEST-b64-g4-prereview.txt). `npm test` (final tree, roots 50a6fc34 / f1568ac8; lane copy with .git, quiet lock,
  host QUIET at start, load1 1.33 -> 6.33, 1007 s): 2724 tests, 2716 pass, 0 fail, 8 skip (run 2 per Q-B64-A8; run 1 at
  load1 ~21 had 1 fail, the audit-g2 A8 real-node cap kill, outside lane g4; NPMTEST-b64-g4-final-run2.txt, -run1.txt).
  Local proof is bash 3.2.57 / macOS / node 26.8.2 only. Known limits: LEDGER #104.
- G3 allocation-diff (reading-list finding Q-RL-PRETEN; audit R6 = DD-fable-2 / cross-opus R2 sibling, R8, R20, R26 =
  ICD-opus-3 sibling; Q-RL-PRETEN, Q-B57-FLAG, Q-B57-C1, Q-B57-MINOR). Q-RL-PRETEN: TRACE_FLAGS now holds
  `--no-allocation-site-pretenuring` (head line and spawn argv: `--trace-gc --min-semi-space-size=1
  --max-semi-space-size=1 --no-concurrent-recompilation --no-allocation-site-pretenuring`), and a `--v8-flags` holding
  `*allocation-site-pretenuring*` (every spelling, `--no-` included) is refused by name, exit 2, 0 spawns (a pretenured
  literal site allocates straight into old space: no young GC, a wrong ZERO). Before, on node v26.8.2, a
  literal-factory driver read `VERDICT ZERO`, exit 0, young 0,0,0 in 3 of 3 invocations (golden-before.txt, frozen
  root, every "Old:" column); after, `VERDICT NONZERO`, exit 1, young 19,19,19 (b1-gate.txt). R6 sibling: a
  `--v8-flags` holding `*stress-concurrent-inlining*` is refused by name, exit 2, 0 spawns (the reviewer swept all 754
  V8 bool flags on v26.8.2: only `--stress-concurrent-inlining` and `--stress-concurrent-inlining-attach-code` flip a
  pin, and no bool flag turns pretenuring back on: on v26.8.2 the two refusal arms cover every bool flag that undoes
  a pin). R8: ycount and the old-GC count
  use awk, not `grep -c ... || true`; a failing grep (a PATH shim, or darwin `GREP_OPTIONS=-P`) gave empty counts and a
  wrong ZERO; no grep is left in the run path (under `GREP_OPTIONS=-P` only `--self-test` fails closed: its own
  greps). R20: the guard preload (`gcn.cjs`) returns at once off the main thread (worker_threads isMainThread); a
  Worker that triggers a GC now reads NO-VERDICT `<d> GC line(s) in run <k> the guard did not count` (before:
  `@@LITE-MARK gcn before @@LITE-MARK end`, the Worker writing its own fence); a Worker that triggers no GC is not
  detected, nor is a lost line cancelled by an extra one (e.g. a worker isolate's), which -h still lists (a Worker GC
  can be cancelled out that way); a `child_process.fork()` child still reads `@@LITE-MARK gcn given twice`. The guard
  grows 1989 B (sha256/8 279a5f87) -> 2042 B (2089e91f); the A14 row is re-pinned. R26: an `=` in the resolved node
  path is refused, exit 2, 0 spawns (after the newline check, the G2 template). `-h` names the pin, the refusals and
  the Worker / fork limits. Roots (sha256/8): allocation-diff.sh 195242d9 (before e0b55101 at 7c91d1c), src 056870fc
  -> cde0ad19; deopt-diff, bytecode-budget, ic-diff and inlining-budget-diff roots are byte-identical to HEAD
  (b1-gate.txt gate 2); `exit 0` census 12 -> 12. `--self-test` 79 -> 83 checks (80 R6, 81 PRETEN, 82 R26, 83 R8; rows
  1-79 are byte-identical to the before build except A14's label), 5 of 5 runs green (b1-gate.txt). Tests:
  test/audit-g3.test.mjs added (13 `test(` calls, 18 rows with the 6-case A4 loop, review r2: A1 pretenuring, A2
  control, A3 retention, A4 x6 refusals, A5 / A5b R26, A6 / A7 R8, A8 Worker, A9 fork control, A10 heredoc / -h /
  self-test; on the frozen before root A1, A4 x6, A5, A6, A7, A8 and A10 x3 are red and A2, A3, A9 green (reviewer r1;
  A5b red on it at r2)); test/allocation-diff.test.mjs re-pinned to 83 (+7 mutant rows M-preten-pin,
  M-preten-arm, M-r6-arm, M-r26, M-r8, M-r8o, M-worker, each with a revert check, and 8 live rows on real node:
  L1 / L1 teeth, L2 control, R20 + revert, R20 fork control, R8 + revert). Tier: the new live rows are DETERMINISTIC
  (GC counts, no clock); the pretenuring row's teeth (the mutant that drops the pin reads ZERO) are measured on node
  v26.8.2 only; the teeth twin gates on node major 26 (any 26.x, e.g. CI's floating 26 leg, unmeasured there) and
  skips on other majors; node 22 / 24 are CI-only (unverified here). Known limits:
  LEDGER #101. Review: r1 REJECTED (1 LITERAL, test-only: a 170000 ms cap on the 83-row self-test timed out at load
  32-35 on both builds), r2 APPROVED. `npm test` (lane copy with .git, quiet lock, host PRELIMINARY, pre-review run of
  this lane, before the r2 test fix): 2710 tests, 2702 pass, 0 fail, 8 skip; the integrated final-tree run is not
  recorded here. Proven locally on bash 3.2.57 / macOS / node v26.8.2 only; bash 5 / Linux / node 22 / 24 are CI-only.
- G5 inlining-budget-diff (audit R2 = BB-opus-1 reach, R4 sibling, R9 = IBD-opus-1, R10 = IBD-opus-2, R11 = IBD-opus-3,
  R12 = IBD-opus-5, R15 = IBD-fable-1 / IBD-opus-6, R16 = IBD-fable-3 / IBD-opus-7, R18 = IBD-fable-2, R26 = ICD-opus-3;
  Q-B57-C1, Q-B57-COMPILE, Q-B57-TIERS, Q-B57-MINOR, Q-B57-BB3, Q-B57-PIPE, Q-B60-TMPFULL, Q-B62-REPRO, Q-B62-FLAG,
  Q-B62-WAIVE, Q-B62-TEAR, Q-B62-TEAR2, Q-B62-ADDR, Q-B62-TEAR3, Q-B62-WAIVE2). Batch 5a, refusals before any trace run
  (exit 2, NO-VERDICT; 0 spawns, except R10 and R11, which refuse after node's two setup spawns `-p` and
  `--v8-options`): R10 a set GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or
  GIT_CEILING_DIRECTORIES is refused in ref / file mode (driver mode is unchanged), and `--self-test` unsets the six in
  a subshell around its own git init / add (before: under GIT_DIR the self-test failed 7 checks and wrote 2 entries into
  that repo). R12: `-h|--help`, `--self-test`, `--only-fn`, `--concurrent` and `--no-bytecode` given a value
  (`--only-fn=0`) die `<flag> takes no value` (before: `--fn g --only-fn=0` ran and exited 0 SAME). R11: two `-ef` lines
  refuse a driver whose directory cannot be resolved (`DRIVER_AFTER:` / `DRIVER_BEFORE: cannot resolve the directory
  of`; a symlink before `..`; before: a wrong DIFF for identical named files, a wrong SAME for different ones). R16 a
  backslash in `--out`, or in the current directory when `--out` is relative; R18 an empty `--tiers` (`--tiers " "`);
  R26 an `=` in the resolved node path. R4 sibling (Q-B57-BB3): the driver check in lib/modes.sh strips `//` and block
  comments, and needs `import`, `from` or `require` before the quoted `./Signal.js` (a plain string no longer passes);
  the wrong SAME was reproduced on real node 26.8.2 first (a driver whose only `./Signal.js` is a comment and which
  imports --before by absolute path: exit 0 SAME, control exit 1 DIFF). Q-B62-FLAG: `--v8-flags` holding
  `*stress-concurrent-inlining*` is refused by name, and without `--concurrent` a `[compiling method ` line with
  `ConcurrencyMode::kConcurrent` in any run is NO-VERDICT (compile lines only; `[marking ... kConcurrent` is on every
  run; the flag brought back 8-10 such lines per direct real-node run and 7-9 per tool run). Batch 5b, reading the
  trace: R9 (Q-B62-ADDR) addr() collapses a `0x<hex>` only after line start, a space, `{` or `(`, so a name such as
  `h0x1` is kept (before: `h0x1` vs `h0x2` read SAME). R15 (Q-B57-COMPILE) a `D` event is emitted only when a
  `[completed compiling` line carries the open unit's key (text from `<JSFunction ` through `(target X)`, plus ` OSR`);
  a --fn with no decision line but a completed compile at THIS tier is SAME evidence, a compile that only aborted or was
  completed by another tier or function is NO-VERDICT `no completed <tier> compile of it` (budget.*.tsv byte-identical;
  bud/ gains a D row per completed unit). R2 (Q-B57-PIPE, Q-B60-TMPFULL) the REPORTED bytecode probe writes to one
  `mktemp "${TMPDIR:-/tmp}/inlining-budget-diff.XXXXXX"` regular file, never a pipe, then appends 64 KiB of spaces with
  the builtin and removes it; a mktemp or append failure prints `(<step> exited N)` in that side's slot and moves no
  verdict, a node / tr / awk failure dies `bytecode probe of <fn>: <step> exited <rc>` (exit 2). Shared lib/v8probe.sh
  (Q-B62-TEAR, Q-B62-TEAR2): BYTECODE_AWK reads a strict record shape and reports `?` when a header line is not whole
  (`[generated bytecode for function: <name> (0x<hex> <SharedFunctionInfo...>)]`, an anonymous name allowed), a
  `Bytecode length:` line is not exactly `Bytecode length: <digits>` (a trailing CR allowed), a header has no length
  before the next header or EOF, or a length has no header (before: a Worker's output interleaved with --print-bytecode
  in 28 of 180 parallel file-mode runs and 26 of them read as `3` with no `?`; after, 180 runs: 170 `3,50`, 10 `?`, 0
  short lists; REPORTED only, no verdict moves). bytecode-budget.sh uses BYTECODE_AWK in its self-test only, so its root
  moves (bb f1070535, before e0cfec2a) with no behaviour change. Roots (sha256/8): inlining-budget-diff.sh 74c2fcb5
  (before dc5927cc at 7c91d1c), src 520b96e3, lib/modes.sh 6b384de8, lib/v8probe.sh 41a3ec9b; deopt-diff,
  allocation-diff and ic-diff roots are unchanged. `--self-test` 54 -> 85 checks. Audit repro rows (REPRO-b62-before.txt
  vs REPRO-b62-final.txt, unmodified copies of the three audit scripts, Q-B62-REPRO): before the unit 22 rows RED (fable
  3, opus 6, cross 13); on the final root every row GREEN. Tests: test/audit-g5.test.mjs added (43 `test(` calls,
  old-root twins on 7c91d1c, mutants included); the ibd, deopt-diff-boundary, ext-audit-inl and bytecode-budget tests
  move with the new text and roots. Known limits (tear residual per Q-B62-TEAR3 -- a driver write that starts with a
  newline, or with digits then a newline, inside or right after a length's digits is not detected -- and the rest):
  LEDGER #98. Q-B57-TIERS: the CI-only row (audit-g5 "A5 Q-B57-TIERS", bash >= 4.4 on the ubuntu legs, FAILs rather than
  skips there) has not run on CI; local bash 3.2 skips it, and class 1 of the `--tiers " "` finding stays UNPROVEN until
  the first CI run. Proven locally on bash 3.2.57 / macOS / node 26.8.2 only; bash 5 / Linux / node 22 / 24 are CI-only.
  Full-suite `npm test` before review (private copy with .git, quiet lock, host PRELIMINARY): 5a tree 2743 tests, 2733
  pass, 1 fail (a parity pin, re-pinned), 9 skip; 5b tree 2826 tests, 2813 pass, 2 fail (the A5 held-pipe row and its
  7c91d1c twin, 180000 ms attempt cap under suite parallelism), 11 skip. Q-B62-A5 / Q-B62-A8: that real-node race row
  and its twin, and G2's audit-g2 A8 held-pipe row (it ran over its 150 s cap in 2 of 3 full runs on the G5 tree; cause
  UNEXPLAINED, not cleared by the opt-in), are opt-in (`LITEUTILS_REAL_HOLD=1`, run the file alone), never part of `npm
  test`. Final tree: 2823 tests, 2811 pass, 0 fail, 12 skip (private copy with .git, quiet lock, host QUIET); alone with
  the opt-in, audit-g2 37 pass and audit-g5 72 pass, 1 skip (the CI-only TIERS row).
- G2 deopt-diff (audit R2 = BB-opus-1 reach, R6 = DD-fable-2 / cross-opus R2, R7 = DD-opus-1 / cross-opus R1, R26 =
  ICD-opus-3, R24 = DD-fable-1, R25 = DD-opus-3; Q-B57-PIPE, Q-B57-FLAG, Q-B57-C1, Q-B57-MINOR, Q-B57-DOC,
  Q-B60-TMPFULL, Q-B61-DD-TRAP, Q-B61-DD-GLUE, Q-B61-DD-TORN2). R2: each driver run's stdout and stderr go to one
  regular file, `mktemp "${TMPDIR:-/tmp}/deopt-diff.XXXXXX"`, never a pipe (a full pipe dropped V8's own writes while
  the run still ended cleanly, so a deopt could vanish and read as SAME); the file is read through `tee | tr | awk`
  (the `@ n t r a` status line is kept), then removed. A failing mktemp is NO-VERDICT `cannot read driver output in
  run k (mktemp exited N)` and that run's driver never starts. Q-B60-TMPFULL: after the read, 64 KiB of spaces are
  appended to the file with the bash builtin (no spawn, raw/ unchanged); a failure is NO-VERDICT `append exited N`;
  precedence awk > tr > tee > append > driver exit. Q-B61-DD-TRAP: one EXIT trap in the main shell removes the temp
  file on every exit path (residual: LEDGER #95 b) and chains the script's fail-closed EXIT trap, so an unexpected
  error still prints its VERDICT line; on SIGTERM the report now says `unexpected error (exit 143)` (bash 3.2; bash 5
  prints `(exit 0)`, see LEDGER #106; superseded b70: `interrupted (SIGTERM)`, LEDGER #117) where the before build said `(exit 0)`. R7 (Q-B57-C1): a line starting `[bailout (kind: ` that names no function and is not a whole
  bailout line, or holds a second `[bailout (kind: ` after its own, is X "bailout: torn trace line" for every fn
  (another thread wrote into the line). Q-B61-DD-GLUE + Q-B61-DD-TORN2: the same refusal for a torn `[bailout (kind: `
  glued after other text on a line (a `[bailout end. ..` prefix included), and for a second head after it; a glued
  WHOLE bailout with no second head keeps its old path. R6 (Q-B57-FLAG): a `[compiling method ` line with `, mode:
  ConcurrencyMode::kConcurrent` is X "background compile (--no-concurrent-recompilation overridden by a V8 flag
  implication)" for every fn (the compile line only: `[marking ... kConcurrent` is on every normal run); `--v8-flags`
  holding `*stress-concurrent-inlining*` (every spelling, `_` read as `-`, the `--no-` form included) is refused, exit
  2, 0 spawns. R26: an `=` in the resolved node path is refused, exit 2, 0 spawns. R24 / R25 (Q-B57-DOC): -h only: the
  staged copies take the `type` of the nearest package.json above DIR (DD-fable-1 stays RED by design: a documented
  behaviour); a driver that closes fd 1 is Not detected (DD-opus-3 GREEN). On normal trace text the records are
  byte-identical to the before build ff6108b / sha256/8 050e01e1: golden parity at the first coder stage (root
  8eb49219: self-test and fixtures output, SAME / DIFF / NO-VERDICT reports and raw/ files; the other four roots
  unchanged) and again on the final root 2ce1d32e (REPRO-b61-final.txt: gold.sh byte-identical to GOLDEN-b61-g2/after,
  which equals before/), plus reviewer r2's corpus check (node 26.8.2 traces, 8 files x 8 fn names = 64 pairs, record
  output byte-identical to the before build, 0 X; REVIEW-b61-g2-r2.md). Spawns: node spawns unchanged (8 at --runs 3);
  mktemp +1 per run; temp files left after a run: 0. Measured on macOS, bash 3.2.57, node 26.8.2, host PRELIMINARY
  (load1 2.2-2.8, sibling sessions, not under the quiet lock; demonstrations, not gates): the b57-rpipe held-full-pipe
  driver pair, 8 rounds each: before build ff6108b / sha256/8 050e01e1 gave 4 wrong SAME, 4 NO-VERDICT, 0 DIFF; the G2
  r1 root 114324af gave DIFF 7, NO-VERDICT 1 (`bailout: torn trace line`), 0 wrong SAME; the final root 2ce1d32e gave
  DIFF 6, NO-VERDICT 2 (`bailout: torn trace line` and `bailout: after code tier`), 0 wrong SAME
  (REPRO-b61-final.txt). The audit repro rows are GREEN on the r1 root 114324af and on the final root 2ce1d32e
  (REPRO-b61-final.txt): cross-opus R1 R2 R3, DD-fable-2, DD-opus-1 / -2 / -3 (DD-opus-2 is G0's); DD-fable-1 RED by
  design (before build: R1 R2 DD-fable-1 DD-fable-2 DD-opus-1 DD-opus-3 RED). The r2 fix touched the torn rules and
  the `--no-` die text. Tests: test/audit-g2.test.mjs added (37 rows, mutants included; A1 is the R2 row run on the
  before build, A8 the real-node "never the wrong verdict" row with no old-code tooth of its own); `--self-test` 99 ->
  107 checks, `--fixtures` 116 -> 124; the pins in deopt-diff / -boundary / -stage / -stage-boundary tests move with
  the run_side text, and final-trap's deopt-diff raw `exit 0` census 18 -> 19. `npm test` (final tree): 2671 tests,
  2663 pass, 0 fail, 8 skip (one run on the final tree in a private copy with .git, quiet lock, host PRELIMINARY,
  load1 1.73 -> 6.14). Local proof is bash 3.2.57 / macOS / node 26.8.2 only. Known limits: LEDGER #95.
- G1 bytecode-budget (audit R2 = BB-opus-1, R5 = BB-fable-1, R3 = BB-opus-2, R22 = BB-opus-5, R23 = BB-opus-6, R26 =
  ICD-opus-3, R24 = DD-fable-1; Q-B57-PIPE, Q-B57-C1, Q-B57-BB2, Q-B57-MINOR, Q-B57-DOC, Q-B60-TMPFULL). R2: the
  driver's stdout and stderr go to a per-probe mktemp regular file, never a pipe (a full pipe dropped V8's own writes
  while the run still ended cleanly); the file is read, then removed. R5: `--no-flush-bytecode` comes after every
  --v8-flags token and before --print-bytecode, on every probe and on the baseline, and is in the mode line (a
  function V8 flushed and recompiled no longer counts as two same-name functions). R3: one baseline spawn per run (`-e
  "console.log('')"`, filter `*`) lists the functions node compiles itself; a --fn in that list is NO-VERDICT, and any
  baseline failure (mktemp, node exit, tr, awk, append, an unreadable status, zero names) makes every fn NO-VERDICT.
  Q-B60-TMPFULL: after each temp file is read, 64 KiB of spaces are appended to it with the bash builtin (no spawn,
  raw/ unchanged); a failure is NO-VERDICT `append exited N` (a TMPDIR still full when the probe ends). R22: a newline
  in a DRIVER, in --out or in the cwd they resolve against is refused, exit 2, 0 spawns. R23: with --out, --fn names
  equal up to ASCII case are refused. R26: an `=` in the resolved node path is refused (env would read it as a
  NAME=value operand). R24: the -h sentence on staged copies inheriting `type` (the nearest package.json above DIR).
  Spawns: +1 (the baseline) past the limits, none on a version mismatch or a refusal; mktemp +1 per probe and +1 per
  run; temp files left after a run: 0. Tests: test/audit-g1.test.mjs added (64 rows); pins moved in 9 test files. `npm
  test` (private copy with .git, 2026-11-10, ONE run, node 26.8.2, bash 3.2.57, macOS, host PRELIMINARY, load 3.12):
  2634 tests, 2626 pass, 0 fail, 8 skip. Local proof is bash 3.2.57 / macOS / node 26.8.2 only; node 22 / 24 accepting
  `--no-flush-bytecode` is a Lead only CI proves (by reading: a node without it fails closed as `driver exited`).
  Known limits: LEDGER #92.
- G0 shared lib, all five tools (audit R1 = BB-opus-4 / DD-opus-2 / IBD-opus-4, R17 = IBD-fable-4 / ICD-fable-3, R21 =
  AD-opus-3, R19 = AD-fable-1, R4 = BB-opus-3; Q-B58-STDERR, Q-B58-ALIAS, Q-B59-POSIX-COND). `is_tracked`
  (lib/tracked.sh): the ls-files pathspec is `:(literal)` and `--icase-pathspecs` (ASCII case folding), the list is
  NUL-separated, and git's stderr stays out of the name stream (a core.fsmonitor hook printing on a successful call
  cannot make a tracked file read untracked, parity with 57b93d1). A match counts only as the exact name or the same
  inode; a tracked `Thing.js` given as `thing.js` on a case-folding file system is now refused (R1). Every name git
  did not match gets one more `ls-files -z` of its directory: an entry with the same inode counts as tracked, so a
  tracked hard link or symlink to `--before` in `--before`'s directory or below is refused as "git-tracked" (the text
  says so although that name itself is not tracked), and so are Unicode case aliases (U+212A, sharp s) and NFC / NFD
  spellings; a tracked hard link elsewhere in the repository stays undetected. A git error still dies exit 2, an
  inherited GIT_LITERAL_PATHSPECS=1 included. Git spawns per call: 3 for a name ls-files did not match, 2 when it
  matched, 1 outside a work tree. `die`: the die line and `VERDICT NO-VERDICT` also go to report.txt, only from the
  main shell and only once the report has its head, so a run that dies after its head and before its verdict ends with
  exactly one VERDICT line (ic-diff's INT / TERM window after the verdict can add a second: LEDGER #88 d) and a die
  before the head leaves a 0-byte report (R17). `REPORT=""` is set in the prologue, after the fail-closed trap: an
  inherited `$REPORT` is never a report file (bytecode-budget and inlining-budget-diff assign it late). `sha8`: a
  backslash in the file name no longer corrupts the head `sha256/8` (R21, `tr -d '\\'`). Prologue: an inherited posix
  mode (POSIXLY_CORRECT, SHELLOPTS=posix) is turned off, only when it is set (R19); an unconditional `set +o posix`
  also turns bash 3.2's alias expansion off, which would kill the `node` alias refusal of allocation-diff and ic-diff.
  bytecode-budget and deopt-diff: the `--driver` import check reads the driver with awk instead of grep (R4): `//` and
  `/* */` comments are stripped, and `import`, `from` or `require` must lead the quoted `./NAME` on its line, so a
  commented-out import and a plain mention are refused; known limits (a plain string holding the text passes; only the
  first quoted occurrence per quote style is tested) are in -h. -h of bytecode-budget and deopt-diff: the "Not
  detected" paragraph states the new reach of the inode sweep; ic-diff -h: die lines also go to report.txt once it has
  its head. The R4 sibling in lib/modes.sh is not part of this entry. Tests: test/audit-g0.test.mjs added (die /
  report, sha8, posix, import-check rows and the mutants); G-T1 rows in test/tracked.test.mjs; the spawn-count pins,
  the M7 mutant, the X1d fixture and the A5 rows are re-targeted. Known limits: LEDGER #89.
- FILLERS (bb audit B4b / N1 / B4a; ibd inherits the limits read). `bytecode-budget.sh`: a failure of the
  driver-output pipeline (awk, tr or tee, not the driver) is NO-VERDICT, exit 2, naming the stage: `cannot read driver
  output in run <k> (<tee|tr|awk> exited <rc>)`; precedence as deopt-diff (awk > tr > tee > driver rc). The --version
  and the --v8-options limits reads strip NODE_COMPILE_CACHE. A failed limits read is a named die, exit 2, `cannot run
  <bin> --v8-options` (bytecode-budget and inlining-budget-diff), no longer "unexpected error". bytecode-budget no
  longer lists the 3 limits it does not use (cumulative inlined size, reserve-inline-budget scale factor, maglev
  cumulative) as ASSUMED; inlining-budget-diff keeps all nine. Tests: test/bytecode-budget-fillers.test.mjs added; the
  no-exit-trap self-test mutant is retired (the final-trap rows cover ibd's trap); the A4 parity row is re-pinned to
  the post-FILLERS ibd root.
- `inlining-budget-diff.sh` U1 (MD-54; audit F1, F2, F3, F4, F4b, F11, F12, F15, N1 tr, N2). U1 lifts MD-3 for ibd (MD-54). Refused exit 2 with a named
  die, before any measured run: a `--node` that is a builtin, directory or non-executable file, resolved once to an
  absolute path (F1, F11); a newline in `--fn` / `--tiers` / `--v8-flags` / `--out` / `--node` / `--driver` /
  `--before` / `--after` / `--repo` / a driver path (F3); a `--v8-flags` token that is not `--` plus a letter, and a
  `max*inlined*bytecode*` / `reserve*inline*budget*` flag without a numeric `=N` (F12); a `--v8-flags` flag outside the
  `--v8-options` allowlist (lib/v8flags.sh, now included; one `--v8-options` read, after the --out preflight, before
  the first write) (F2, F15); a symlinked, non-writable or non-empty raw/ dec/ bud/ ms/ stage/, an uncreatable --out
  and an unwritable report.txt (F4 preflight, 0 spawns); a `'./Watch.js'` single-quoted re-export with no Watch.js
  beside a file-mode input (F4b, lib/modes.sh grep). After the traced run: driver output glued to a V8 compile line is
  refused exit 2 (N2, not under `--concurrent`). judge() always writes the diff file, so a SAME run leaves a 0-byte `all.<tier>.diff.txt`. `NUL` reads as
  `?` in the trace and the bytecode probe (N1 tr). A `=09` limit reads base 10. A refusal in ref / file mode can
  leave staged files in stage/ and a rerun needs a fresh --out; modes.sh refusals take 2 node spawns (Q-IBD-7). Known
  limits: LEDGER #76.
- `inlining-budget-diff.sh --self-test`: 43 -> 54 checks; test/ext-audit-inl.test.mjs added (T-U1); the A4 parity row is
  re-pinned to the U1 root (the bd1f283 history row retired, Q-IBD-4 (a)); test/build.test.mjs V8FL roster now
  includes inlining-budget-diff (MD-54); test/shlib.test.mjs `IBD_PRE = 2` (ibd modes.sh refusals spawn 2).
  Follow-up (LiteSignal): its vendored bench copy needs the new root, and its test/94 CHECKS moves 43 -> 54.
- `inlining-budget-diff.sh` U2 (audit F5, F7, F8, F9, F10a, F13, F14, F16, F17, L2; Q-IBD-1 (a)). Refused exit 2 with a
  named die, before any measured run: `--fn ""`, `--v8-flags ""` and an empty `--opt=` on any of the 12 value options
  ("<opt> needs a non-empty value"; `--out=` no longer takes the next argument) (F8); an fn or a tier given twice ("fn 'f' is given twice",
  "tier 'turbo' is given twice") (F14, F17); `--before` and `--after` the same file, by hard link or symlink
  (F13); `--after` not found, now named instead of read as a `--before` git failure (L2); a report.txt in OUT that is
  a symlink, or has another hard link (F5, 0 spawns). `--runs` takes at most 2 digits and reads base 10 (`--runs 09`
  runs 9; 3 or more digits are refused) (F9). A dash-led `--before` / `--after` / `--driver` / `--repo` / `--out`
  or positional path gets a `./` prefix, and the `basename` of a dash-led driver too (F7, F16). The `-p` version
  probe runs without NODE_OPTIONS and a failed probe is a named die, `cannot run <bin> -p` (F10a). lib/common.sh
  is in all 5 roots, so all 5 are rebuilt: `stat -L`, `dirname` and `basename` take `--` on the `refuse_live` path
  (called by bb, dd and ibd; alloc and ic carry the text only), and an unreadable symlink in a chain dies "cannot
  read the symlink" (class 3, race only). lib/modes.sh is ibd only: `cp` and `dirname` take `--` on its `--before` /
  `--after` staging lines. Known limits: LEDGER #79. Tests: test/ibd-u2.test.mjs added; the A4 parity row is re-pinned.
- `inlining-budget-diff.sh` U3 (audit N1; Q-IBD-ENV). F10b landed in FILLERS. lib/v8probe.sh BYTECODE_AWK prints `?` for a function whose
  bytecode header is glued to preceding text, or whose `Bytecode length:` line has no header since the previous length
  line (an orphan), instead of a partial or misattributed number, or nothing; the number is REPORTED only, `?` takes the say-only
  branch, no VERDICT moves. bytecode-budget.sh shares the lib and is rebuilt. ibd now unsets NODE_OPTIONS,
  NODE_V8_COVERAGE, NODE_COMPILE_CACHE and NODE_REDIRECT_WARNINGS at the top of the script (Q-ENV, as the other four
  tools), so no node spawn sees one. `-h` gains a Known limits paragraph (what a refusal leaves in OUT and whether a
  rerun is accepted; a glued V8 compile line is a real case, refused outside --concurrent; the U2 refusals). The A4 parity row is re-pinned to the U3
  ibd root. Known limits: LEDGER #80, #81. Follow-up (LiteSignal): its vendored bench copy
  (LiteSignal/bench/inlining-budget-diff.sh) needs the new root, and test/94-inlining-budget-diff.test.mjs:14 holds
  CHECKS = 43 (U1 moved the self-test to 54); LEDGER #82.
- `allocation-diff.sh` G-ALLOC-CLOSE (audit A1, A4; Q-A1). The GC line grammar accepts one or more spaces before
  `(average mu` and before the `(+ ...)` group, which makes the node 22 `--trace-gc` line (v22.23.4, audit A1)
  parse; it was NO-VERDICT on every node 22 run. Single-space lines parse as before. `-h` Driver contract gains the
  scalar-replacement paragraph (A4): an allocation TurboFan removes reads young 0, ZERO, which is correct for
  optimized code; keep the objects reachable to measure it. Real node 22 proof comes from CI (none on the host).
  LEDGER #85.
- `ic-diff.sh` (audit I1; Q-I1). `-h` says that on node 22 this tool ends NO-VERDICT (the code-kind numbering table
  is V8 14.x only). Documented, no code change; LEDGER #83.
- Package scaffold: private, `node:test` only, no dependencies.
- `build.sh` + `lib/` + `src/`: shipped scripts are generated from `src/` + `lib/` fragments;
  `test/build.test.mjs` fails on drift (fresh build vs committed root script), on a stray root
  script, and when a malformed input (bad or missing marker, nested include, no final newline, a NUL byte,
  `src/build.sh`, an OUTDIR of `src/` or `lib/`, a `bash -n` failure, a later script failing) does not
  abort closed (exit 2, file named on stderr, no output changed, no temp leftovers). The drift check
  also compares the exec bits.
- `test/inlining-budget-diff.test.mjs`: `--self-test` exact count (43; 54 after U1), an unmodified-copy
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
  `--self-test` (54 canned checks, 57 after MD-46, 60 after G-STAGE, 61 after G-ENV, 63 after G-TRACKED, 64 after
  G-FIFO; the 9 staged ref / file rows need git: with no git on PATH they are one FAIL line and `--self-test`
  exits 1) and `--self-test --fixtures DIR` (+24 checks on node v26.8.2
  captures in `test/fixtures/bytecode-budget/node-26.8.2/`).
  DETERMINISTIC (gated in `npm test` via `test/bytecode-budget.test.mjs`, 152 tests; 161 after MD-46, 162 after
  Q-H1, 163 after G-ENV, 166 after G-FIFO): the exact self-test counts (54 and 54+24; 57 and 81 after MD-46; 60 and
  84 after G-STAGE; 61 and 85 after G-ENV; 63 and 87 after G-TRACKED; 64 and 88 after G-FIFO), 24 self-test mutant
  rows, 25 after G-FIFO (17 report/gate, 18 after G-FIFO with M-fifo-off, 3 of them on the length cap and 5 on the
  B-four refusals, + 7 diff: the 6 DIFF_MUTANTS plus the --diff / --max exclusion mutant) plus a NODE_OPTIONS-leak
  and a version-prefix mutant that must each be caught, gate rows on a fake node, 48 refusal rows with 0 node spawns
  (41 report/gate + 7 diff), the driver cwd, spawn and retention counts (8 spawns for 3 fns x 2 runs; 9 after
  MD-46), and a live pair on node v26.8.2 (`mid=211` exit 0, `mid=210` exit 1; on any other node the pair must exit
  2 with a version-mismatch NO-VERDICT). REPORTED (not gated): 20/20 runs per side of `--max add=6,mid=211,dup=19`
  / `mid=210`, one distinct output with 0x stripped (2026-11-02, Darwin arm64, node v26.8.2, script sha256 a26e9f15,
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
  --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation
  --no-allocation-site-pretenuring --require <tmp>/gcn.cjs
  ./<driver>` with cwd = the driver's directory and NODE_OPTIONS stripped (b43 G-ENV: all four);
  the driver marks the window
  with the whole lines `@@LITE-MARK start` and `@@LITE-MARK end`. The tool's own guard preload counts
  the run's GCs and the count must equal the trace's GC-line count. Fails closed (NO-VERDICT) on an
  unparseable trace, a missing guard count, an old-generation GC in the window, a driver failure and a
  failed null control (runs 2..N must give run 1's multiset). The `-h` text holds the driver contract,
  every record and NO-VERDICT reason, and the Not detected list. Tier: the script logic is
  DETERMINISTIC (`--self-test`, 76 checks, 78 after MD-46, 79 after b43, 83 after G3, no real node); a verdict
  on a user driver is STATISTICAL, REPORTED only (no statistical host in this repo).
- `test/allocation-diff.test.mjs`: `--self-test` exact count (76; 78 after MD-46; 79 after b43; 83 after G3) on the
  in-repo script and a copy outside the repo, one row per printed check, self-test mutant rows (each an exact-once edit of a temp
  copy that must turn the self-test red at its designed rows, with a revert check on the unmutated
  copy), the exit wiring, `-h` / `--help` exit 2, and refusal rows on the file's own fake node and
  mktemp shim. 200 tests (206 after MD-46, 208 after CI on Linux, 239 at G3 on darwin / node v26.8.2).
  DETERMINISTIC; real node since G-ALLOC-CLOSE (2 Q-A1 live rows), 8 more live rows since G3.
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

- G-FIFO (Q-FIFO), bytecode-budget (b47): `--out DIR` now refuses a `DIR/report.txt` that is not a writable regular
  file before any write. Before, a FIFO `report.txt` passed every `--out` check and the empty-report write
  `: >"$REPORT"` blocked for ever with no reader: a hang, no verdict. The deopt-diff / ic-diff / allocation-diff
  pre-write clause is ported (byte-identical), after the report.txt symlink check and before `mkdir -p raw`:
  report.txt must be a writable regular file, or absent with DIR absent or writable; else exit 2 NO-VERDICT, 0 node
  spawns, nothing written, one line `--out: cannot write DIR/report.txt`. Two refusal changes (all still exit 2, 0
  spawns): an existing unwritable DIR with no report.txt and no raw/ now says "cannot write DIR/report.txt" (was
  "cannot create DIR/raw"); a directory or mode-444 report.txt no longer leaves a raw/ behind. The `: >"$REPORT" ||
  die` line is now a race backstop only. `-h` (--out): report.txt must be absent (then DIR absent or writable) or a
  writable regular file (never a FIFO, a device or a directory). Self-test MD-FIFO (fd 3 holds the FIFO open
  read-write, so a build without the clause fails the row instead of hanging; needs no git): 63 -> 64 (`--fixtures`
  87 -> 88; with no git 54 -> 55). Roots: bytecode-budget.sh 6fde4a26 -> 03f88d58 (src e7aa77fc -> 91cd961a); every
  other root, src and lib file is unchanged. allocation-diff already refused a FIFO report.txt (exit 2, 0 spawns).
  Tests: `test/bytecode-budget.test.mjs` C 63 -> 64, mutant M-fifo-off (killed exactly by MD-FIFO), a direct G-FIFO
  row (FIFO report.txt -> exit 2, the die line once, 0 spawns, no raw/, FIFO kept; 30 s cap) and its teeth twin (the
  M-fifo-off code path blocks and is killed by its own 5 s cap); 166 tests in the file (was 163);
  `test/bytecode-budget-stage.test.mjs` pins 63 -> 64 and no-git 54 -> 55 (mkfifo added to the no-git PATH shim);
  `test/bytecode-budget-stage-boundary.test.mjs` emulation pin 54 -> 55; `test/ext-audit.test.mjs` N10 (OUT mode
  555, no raw/) and N12 (report.txt mode 444, no raw/) now run for bb as well as dd (and assert the exact refusal
  line once, 0 spawns, no raw/), so the clause's `-w "$OUT"` and `-w "$OUT/report.txt"` arms are gated for bb
  (mutants: drop `&& -w "$OUT/report.txt"` is killed by bb N12, `( ! -e "$OUT" || -w "$OUT" )` -> `true` by bb N10;
  both survived before); 224 -> 226 tests in the file. Revert check on the 6fde4a26 root: the G-FIFO row is red by
  its 30 s SIGKILL cap, the self-test counts C / C+F are red (63 / 87), M-fifo-off and the twin are red (anchor 0),
  bb N10 (wrong message) and bb N12 (raw/ left behind) are red. Tier: DETERMINISTIC. Review:
  .handoff/evidence/b47-fifo/REVIEW-r1.md APPROVED (no blockers; three NITs: the bb gates for the two clause arms,
  the two refusal changes above, and a stale `checks 50-54` comment at test/bytecode-budget.test.mjs:149 (fixed in
  b49)) (local, untracked).

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

- b75 F-F: allocation-diff (ad), bytecode-budget (bb), deopt-diff (dd) and ic-diff refuse a newline or a CR in a raw
  DRIVER positional, and ad, bb, dd, ic-diff and inlining-budget-diff (ibd) in the raw `--out` value, before any refusal
  prints them (finding fe-rev-1, LEDGER #125; rulings Q-B74-FERAW, Q-B75-FFSCOPE, Q-B75-FFBBSTAGE; commit 145c4bf).
  Before, the G-X6 check ran on the RESOLVED name while earlier refusals echoed the RAW value, so a CR reached stderr
  (exit 2, 0 node spawns, no verdict change): `DRIVER (before|after|driver) not found ...` (bb measure: `DRIVER not
  found ...`), `cannot resolve the directory of ...` and (dd / ic) rep_refuse for a DRIVER such as
  `d<CR>/../o/report.txt`; the --out refusals of ad, dd, ic and ibd (`--out: f^M exists and is not a directory`); bb
  ref / file mode's stage_check (`--out: o^M/stage is a symlink`). Now a CR (and a newline in an ad / dd / ic DRIVER)
  gets `<tool>: DRIVER: a newline or a CR is not allowed (it would forge report lines)` (or `--out: ...`), then
  `VERDICT NO-VERDICT`, exit 2, in every mode; the value is never echoed. A newline in --out (all five) or in a bb
  DRIVER still meets the earlier newline-only refusal, its text unchanged. It replaces ad / dd / ic's newline-only
  `DRIVER: a newline is not allowed in a path`. Inputs with no newline or CR behave as before. -h (ad, bb, dd, ic):
  --out and the DRIVER paths take "no newline or CR"; ibd -h unchanged; self-tests unchanged. Tier: DETERMINISTIC.
  Gated in test/ref-cr-refuse.test.mjs (96 -> 223 tests: ROW 12 per tool and mode with old twins on 4dadb5d and no-CR
  controls; ROW 13, 29 mutants). A4 ibd pin ae0544f9 -> fe8919f5. Roots: allocation-diff 953026e3 -> cd026337,
  bytecode-budget 5c24c28b -> 409a1543, deopt-diff e841a841 -> a6c13350, ic-diff 3a866749 -> d85d8b0e,
  inlining-budget-diff ae0544f9 -> fe8919f5; lib unchanged. Review: r1 REJECTED (1 LITERAL: no after-positional row),
  r2 APPROVED. npm test (private copy, /bin/bash 3.2, quiet lock, host PRELIMINARY: one other node at 12.9% CPU): 3614
  tests, 3600 pass, 0 fail, 14 skip, rc 0, 1664 s.
- b74 F-E: deopt-diff (dd), ic-diff and inlining-budget-diff (ibd): F-C's input-file refusal (rep_refuse, which prints the
  input value) now runs after the G-X6 newline / CR refusals, still before any node / git / mktemp spawn or write
  (finding fd-rev-1, the F-D r1 reviewer; rulings Q-B74-FCSEAM, Q-B74-FESCOPE). Before, an input with a CR that was
  also `-ef` OUT/report.txt (or an ibd OUT_NAMES file) was refused with the rep_refuse text and put a CR on stderr
  (exit 2, 0 spawns, no verdict change). bb already had this order; 2 rows now pin it. Inputs with no CR are all
  still refused, but when one is `-ef` an OUT file and another refusal also applies (a symlink / unwritable /
  hard-linked report.txt; (dd / ic) an --out raw/ that cannot be created, a node path or a driver dir refusal; a
  newline / CR in the cwd, `--node`, a resolved DRIVER / --before / --after name or `--out`), that refusal now prints
  its own message first. -h and self-tests unchanged. Tier: DETERMINISTIC. Gated in test/ref-cr-refuse.test.mjs (77 ->
  96 tests: 6 rows ibd DRIVER -> report.txt / budget.turbo.tsv, ibd --before, ibd --after, dd DRIVER, ic DRIVER, with
  old twins on 768c388; 2 bb-clean pins (live + 768c388); 3 move-back mutants). A4 ibd pin 476d640a -> ae0544f9.
  Roots: deopt-diff 3e405c1a -> e841a841, ic-diff 4d5d3214 -> 3a866749, inlining-budget-diff 476d640a ->
  ae0544f9. Review: r1 APPROVED.
- b74 F-D: bytecode-budget (bb), deopt-diff (dd) and inlining-budget-diff (ibd) refuse a newline or a CR in a ref /
  file value, exit 2 before any spawn or write (ruling Q-XF-CR (a); findings IBD-opus-b-2, DD-opus-a-2,
  lib-cross-fable-1). The text is the G-X6 line `<label>: a newline or a CR is not allowed (it would forge report
  lines)`; the value is never echoed. bb / dd (lib/stage.sh) check `--before-ref`, `--after-ref`, `--before`,
  `--after`, `--module`, `--driver` and `--repo`. Before, only a newline was refused: a CR in a resolvable ref or a
  committed `--module` dir reached node and `--out`, and a CR in `--repo` / a missing `--driver` / `--before` /
  `--after` was echoed to stderr. ibd (G-X6 preflight, placed before F-C's rep_refuse) checks `--before-ref`,
  `--after-ref`, `--driver` and `--repo`; before, a ref with a newline or a CR reached node and `--out`. -h: bb says
  "the seven ref / file values take no newline or CR", dd "ref / file values take no newline or CR"; ibd -h
  unchanged; self-tests unchanged. Tier: DETERMINISTIC. Gated in the new test/ref-cr-refuse.test.mjs (77 tests: gated
  rows with rc 2, 0 node spawns, 0 stdout bytes, stderr exactly the G-X6 line + `VERDICT NO-VERDICT`, no CR on
  stderr, tree unchanged; old twins on `git show 035e939:<root>`; controls; mutant rows incl. fixC (a) / (b) / (c) and
  drop-one-value x 7 bb / 7 dd / 4 ibd). Review: r1 REJECTED (1 LITERAL: ibd's F-C rep_refuse printed a `--driver`
  with a CR before the new refusal ran; the line moved above it, row 4b), r2 APPROVED. A4 ibd pin 6bb459f3 ->
  476d640a. Roots: bytecode-budget e399e975 -> 5c24c28b, deopt-diff 7030e57e -> 3e405c1a, inlining-budget-diff
  6bb459f3 -> 476d640a; lib/stage.sh 2f1525c9 -> 928e62cf. Commit 768c388. npm test (private copy, /bin/bash 3.2, quiet
  lock, host PRELIMINARY at start, load1 4.13 vs baseline 2.21): 3468 tests, 3454 pass, 0 fail, 14 skip, rc 0, 1674 s.
- b74 F-C: bytecode-budget (bb), deopt-diff (dd), ic-diff and inlining-budget-diff (ibd) refuse an input file that is
  OUT/report.txt (findings dd-fable-1, DD-opus-a-1, ibd-cross-opus-1; commit 035e939). Before, an input (a DRIVER,
  `--driver`, `--before` or `--after`, any name, same file by `-ef`) that IS OUT/report.txt was truncated by the report;
  ibd also wrote OUT/budget.<tier>.tsv and OUT/<all | fn>.<tier>.diff.txt in place, through a symlink, a hard link or
  over an input file: exit 0 SAME with the victim destroyed. Now lib/common.sh rep_refuse (pure builtins, no fork) dies
  `--out: OUT/<name> is an input file of this run (<x>): the run would overwrite it`, exit 2, before any spawn or
  write, with `VERDICT NO-VERDICT`; ibd fills OUT_NAMES per tier and also refuses a symlink (`is a symlink`) or an
  extra hard link (`has another hard link`) at those names. bb / dd / ic assign OUT_NAMES="" on their defaults line, so
  an inherited value is ignored. allocation-diff is unchanged (its own check and wording; it only gains the unused
  shared rep_refuse). -h: one new refusal per tool (bb / dd / ic in the --out DIR text, ibd in "Also refused"); every
  other line byte-identical; self-tests unchanged (ad 83, bb 69, dd 107, ic 83, ibd 92). Tier: DETERMINISTIC. Gated
  in the new test/out-input-refuse.test.mjs (60 tests: 25 live rows with rc 2, 0 node spawns, 0 stdout bytes, input
  sha256 and the --out tree unchanged; 25 old twins on `git show c1618a5:<root>`, SKIP locally / FAIL under CI=true
  if the commit is unreachable; 4 controls; 6 env OUT_NAMES rows). Review: r1 REJECTED (3 LITERAL: inherited
  OUT_NAMES; no --before / --after row; bb write ordering ungated), r2 APPROVED. Sibling rows moved: shlib I6f, ibd-u2
  F5 (anchor narrowed), audit-sig PSUB ic anchor (ends at `REPORT=/dev/null`), deopt-diff-boundary A4 ibd pin
  706adc81 -> 6bb459f3. npm test (private copy with .git + frozen fillers-final, private TMPDIR, /bin/bash 3.2, quiet
  lock, host PRELIMINARY at start, load1 3.65 vs baseline 2.21): 3391 tests, 3376 pass, 1 fail, 14 skip, rc 1, 1590 s;
  the fail was audit-sig PSUB ic (its anchor pinned the defaults line the fix extended), fixed, file re-ran 143 / 143
  (quiet lock, QUIET).
- b73 F-B: inlining-budget-diff: the default scope is every decision line of the compile units that involve a named
  `--fn` (a unit that compiles it, or has a decision line naming it); node's own functions (normalizeString, node:path;
  they reach Maglev or not with the driver's path length, which differs between the two sides) no longer turn
  byte-identical programs into a DIFF (finding ibd-fable-1; ruling Q-X-IBD-SCOPE (a); commit c1618a5). Under
  `--concurrent` every line is unit "*" (no attribution), so a DIFF in which no differing line names a `--fn` is
  NO-VERDICT, exit 2 (the block can only turn DIFF into NO-VERDICT; an awk failure gives NO-VERDICT). Cost: a real
  change seen only through an unattributed line under `--concurrent` is now NO-VERDICT; `--only-fn` or dropping
  `--concurrent` gives a verdict. -h: the default-scope bullet only; the other four roots' -h / --help byte-identical;
  self-test 92 unchanged. Tier: DETERMINISTIC. Gated in the new test/ibd-scope.test.mjs (fake node, canned maglev
  traces: G1-G7 rows, 9 mutant rows, ef9cf7f history rows where G1 and G4a are red; G5 real node, opt-in
  LITEUTILS_IBD_LIVE=1). Review: r1 REJECTED (2 LITERAL test-only: multi-fn and INLINE / SKIP mutants survived), r2
  APPROVED. deopt-diff-boundary A4 ibd pin 76c31db5 -> 706adc81. npm test (private copy with .git + frozen
  fillers-final, private TMPDIR, /bin/bash 3.2, quiet lock, host QUIET at start, load1 1.91): 3331 tests, 3317 pass,
  0 fail, 14 skip (b72's 12 + the 2 opt-in G5 rows), rc 0, 1597 s.
- b73 F-A: two class-1 findings (commit ffff1f7; rulings Q-B73-CITIME, Q-B73-FACOMMIT). ic-fable-1, all five tools: an
  inherited BASHOPTS=nocasematch (bash >= 4.1) no longer makes `[[ == ]]` ignore letter case. ic-diff read two IC
  multisets that differ only in a key's case (`value` vs `Value`) as SAME, exit 0; it now says DIFF, exit 1.
  lib/prologue.sh runs `shopt -u nocasematch` right after `set -euo pipefail`, before any string compare (bash 3.2 was
  never affected). IBD-opus-b-1: inlining-budget-diff ref mode stages each side by its FULL commit sha (it handed
  `git rev-parse --short` back to git; a tag or branch named like the abbreviation staged the wrong commit: a wrong
  SAME). Heads print `<ref> @ <sha 12>` (was <sha 7>), the form bb and dd already print (lib/modes.sh). -h / --help of
  all five roots byte-identical; self-tests unchanged. Tier: DETERMINISTIC. Gated in test/ic-diff.test.mjs NOCASE
  (bash >= 4.1; counted SKIP without one, FAIL under CI_STRICT on linux; ef9cf7f twin reads SAME exit 0) and
  test/ibd-u2.test.mjs FULLSHA (tags named like every prefix 4..40 of the before sha; ef9cf7f twin stages the after
  commit and reads SAME). Review: r1 APPROVED. deopt-diff-boundary A4 ibd pin 5b9f3c26 -> 76c31db5. npm test (private
  copy with .git + frozen fillers-final, private TMPDIR, /bin/bash 3.2, quiet lock, host PRELIMINARY at start, load1
  2.69, one other node at 107%): 3300 tests, 3286 pass, 2 fail, 12 skip, 1648 s; the 2 fails were the A4 pin and its
  teeth row (root moved on purpose); after the re-pin test/deopt-diff-boundary.test.mjs: 110 tests, 110 pass, 0 fail
  (140 s, host QUIET, load1 2.02).
- b73 CI time (Q-B73-CITIME; commit ffff1f7): workflow job timeout 120 -> 180 min (`ci.yml` timeout-minutes; three of
  the four macOS legs ran 108-118 min wall (node 26: 63 min) against 120 in run 43049200147,
  8 / 8 legs green, 3288 tests, 0 fail each).
- b72 CI-HANG: every ubuntu leg hung on 085c54d (run 42965376108); macOS (bash 3.2) was green (findings lib-opus-c-1,
  ic-fable-2; rulings Q-B72-REPRO, Q-B72-G1FLAKE; commit ef9cf7f). `_sig` (lib/prologue.sh) ran a bare `wait` after
  `trap '' INT TERM HUP`; on bash 5 that also waits for a live `< <( )` writer (not a job, never killed), so the tool
  hung and ignored every later signal. `_sig` now SIGKILLs each pid of `$SIG_PID $(jobs -pr)` once (deduped), then
  waits by pid; no operand-less wait is left, and a signal between the `&` and drv_wait's `SIG_PID=$!` is covered.
  Residual: bash's SIGCHLD handler may reap a listed job between the listing and its kill. -h, --help and --self-test
  of every root byte-identical; self-tests unchanged. Harness: test/spawn-cap.mjs gains psGroup / armGroup /
  capSync opts.group, so a hung signal row ends as a NAMED timeout with a ps dump of its group instead of a 3600 s
  file kill. Tier: DETERMINISTIC. Gated in test/spawn-cap.test.mjs (G1-G4, S6), test/audit-sig.test.mjs (T, PSUB
  bash >= 5 CI_STRICT on linux, W; aed6684 twins time out) and audit-g2 A3. Review: r1 REJECTED (2 LITERAL: kill after
  reap of a duplicate pid; G3 had no teeth), r2 APPROVED. deopt-diff-boundary A4 ibd pin 06927a13 -> 5b9f3c26. npm
  test (private copy with .git + frozen fillers-final, private TMPDIR, /bin/bash 3.2, quiet lock, host QUIET at
  start, load1 1.77): 3288 tests, 3276 pass, 0 fail, 12 skip, rc 0, 1669 s (run 1, PRELIMINARY, had 1 fail: the
  host-dependent audit-g1 BB-opus-1 twin, Q-B72-G1FLAKE). CI proof of the fix: run 43049200147 (push of ef9cf7f), 8 / 8
  legs green; ubuntu bash 5.3.9, uutils env 0.10.0 execs (that lead is closed).
- b71 test-leak (Q-B71-TMPLEAK; commit aed6684): test/inlining-budget-diff.test.mjs ran each mutant's `--self-test`
  with the caller's TMPDIR, so the probe-no-rm mutant left 7 inlining-budget-diff.XXXXXX files in the shared TMPDIR
  per `npm test` (245 found, 35 runs since b62); the tools themselves did not leak. Every mutant run there now goes
  through mutSelfTest with a private TMPDIR, and a row fails if the leak lands outside the mutant's own dir. Tier:
  DETERMINISTIC.
- b71 G-SIG-2: allocation-diff (ad) run_side, bytecode-budget's per-fn probe runs and inlining-budget-diff's bytecode
  probes no longer run the driver inside `$( )` (commit aed6684; rulings Q-B70-ADPIPE, Q-B71-TRAPS). Before, a SIGINT /
  SIGTERM / SIGHUP waited for the in-flight run and a killed probe could leave one bytecode-budget.XXXXXX /
  inlining-budget-diff.XXXXXX. All three are now main-shell jobs `( cd .. && exec env .. ) >FILE 2>&1 <&0 & drv_wait`;
  the tee | tr | awk parse reads FILE in a `$( )` that runs no driver. bb / ibd hand back PROBE_OUT (byte-equal to the
  old `$( )` value); bb reuses BB_TMP and its chained EXIT trap, ibd gains IBD_TMP + a chained EXIT trap, both turning
  `set -e` off first (r1: a failing rm in the trap exited rc 1, a DIFF code). The die-in-`$( )` census guards go 6 ->
  1 (lib/common.sh refuse_live). ad's driver stdout is now the regular file $T/run.out (Q-B70-ADPIPE: bb / dd / ibd /
  ad all write driver output to a regular file), with dd's 64 KiB append check: a full TMPDIR is NO-VERDICT `(append
  exited N)`, order awk > tr > tee > append > driver. -h: bb, ibd and ad say a signal now SIGKILLs the run and the temp
  goes with the EXIT trap; ad's pipe text becomes the regular-file text, its console.log drop is labelled a pipe-era
  measurement. Residual: a signal inside `$(mktemp)`, or a SIGKILL of the tool. Unchanged: stdin rule (`<&0`), spawn
  and mktemp counts, self-tests (ad 83, bb 69 (--fixtures 93), dd 107 (124), ic 83, ibd 92); golden vs 085c54d: 106 /
  112 files byte-identical, only ad / bb / ibd -h and --help differ. REPORTED, not gated (coder probes, bash 3.2,
  PRELIMINARY host): ad / bb / ibd exit 2 8-13 ms after the signal in the run / probe phase; 085c54d waits ~30 s. Tier:
  DETERMINISTIC. Gated in test/audit-sig.test.mjs (90 -> 119 tests; second old twin `git show 085c54d:<root>`,
  CI_STRICT; A1 kill rows <= 10 s, A2 retention with trap-rm mutant teeth, STDIN per-site mutants, A4 ad append
  fail-closed under ulimit -f 32, RMFAIL). Sibling rows moved: allocation-diff E1 / E4 / E5 / R1, audit-g1 redir-in-cd
  / noapp-probe, bytecode-budget-awk TEE / TR_PLAIN, bytecode-budget-diff-boundary A1-gate-raw-name / M-two-loops,
  ext-audit-inl probe tr / MUT_PROBE, inlining-budget-diff probe mutants + -h pin; deopt-diff-boundary A4 ibd pin
  5875cc34 -> 06927a13. Review: r1 REJECTED (2 LITERAL: the trap order; the TMPLEAK row bypassed the runner it
  guards), r2 APPROVED. npm test (private copy with .git + frozen fillers-final, /bin/bash 3.2, quiet lock, host
  PRELIMINARY load1 1.93): 3256 tests, 3244 pass, 0 fail, 12 skip, rc 0, 1754 s.
- b70 G-SIG-1: a SIGINT / SIGTERM / SIGHUP while a tool waits for its driver now ends at once (cross-script audit L1 /
  L5; Q-B66-SIG, Q-B67-STDIN; LEDGER #117). Before, bytecode-budget (bb), deopt-diff (dd) and inlining-budget-diff (ibd)
  died by the signal inside `$( )` or printed `unexpected error (exit 143)` (bash 3.2; `(exit 0)` on bash 5, LEDGER
  #106) and ic-diff printed `interrupted` without the signal; the driver could outlive the tool. Now bb (base_list), dd,
  ic-diff and ibd (run_trace) exit 2 at once (gated bound 10 s, audit-sig A1) with `<tool>: interrupted (SIG<X>)` and
  exactly one `VERDICT NO-VERDICT` line (stderr, and the last two lines of `--out DIR/report.txt`), the driver run is
  killed (SIGKILL on its recorded pid), and the temp files are removed. allocation-diff, bb's per-fn probe runs and
  ibd's bytecode probes run the driver inside `$( )`, so a signal there waits for the in-flight run first and then
  prints the same lines (G-SIG-2 keeps that residual) (closed b71, G-SIG-2). ic-diff's message gains the signal
  name (`ic-diff: interrupted (SIGTERM)`, was `ic-diff: interrupted`). L1: an abort that exits 2 without a `die` (for
  example `sh -c "exit 2"` after the prologue) used to stay silent because the EXIT trap tested `rc -eq 2`; it now
  prints `<tool>: unexpected error
  (exit 2)` and `VERDICT NO-VERDICT`, because `die` sets a DIED flag and the trap tests that flag instead (6 die-in-`$(
  )` sites in the census: common.sh refuse_live; bb RB / RA / RL probe lines; ibd b= / a= probe lines, each `|| {
  DIED=1; exit 2; }`). A signal after FINAL=1 changes nothing. Unchanged by design: bb's base_list keeps `</dev/null`,
  and every other driver run keeps the caller's stdin (`<&0`, Q-B67-STDIN). -h: bb, dd, ic-diff and ibd gain a signal
  paragraph; -h stderr and rc are byte-identical. The paragraph says a signal before the verdict line gives
  `interrupted`; the first draft said "after the verdict line a signal changes nothing", which was false (the `say
  "VERDICT .."` line runs one command before FINAL=1: a signal there gives a second `VERDICT NO-VERDICT`, rc 2), so the
  claim names the FINAL=1 step. Residuals (NITs, not fixed): see LEDGER #117 (e). REPORTED, not gated (coder probes, one
  run per tool x signal x mode): dd / ic / bb / ibd exit 1-8 ms after the signal on bash 3.2, driver pid dead, 1 VERDICT
  line. Golden vs 465881b: --self-test outputs and counts unchanged (ad 83, bb 68, dd 107, ic 81, ibd 89; --fixtures bb
  92, dd 124) except one ic self-test label; fake-node SAME / DIFF / NO-VERDICT runs byte-identical. Tier:
  DETERMINISTIC. Gated in test/audit-sig.test.mjs (90 tests, old twins `git show 465881b:<root>`, CI_STRICT). Sibling
  rows moved: audit-g1 MUT A6 anchor `>>"$base"`, bytecode-budget-stage-boundary row 9 (the bb --self-test temp dir is
  still left behind on SIGINT; the row is pinned to that), and the ic / dd / bb / ibd signal text in the existing rows.
  npm test (private copy with .git, quiet lock): run 1 3212 tests, 3195 pass, 3 fail, 14 skip (the three sibling reds:
  audit-g1 MUT A6 anchor `>>"$base"`, bytecode-budget-stage-boundary row 9, and the spawn-cap S5 raw-cap census on
  test/audit-sig.test.mjs; also moved: the h-exit0 -> h-nodied mutant in allocation-diff.test and ic-diff.test, and the
  final-trap G-SIG A4 / A5 rows); run 2 on the final tree 3213 tests, 3199 pass, 0 fail, 14 skip, rc 0, 1470 s.
- b70 NULLCTL: every tool's own null-control comparison now has a self-test row and a node:test mutant that go red
  when it is turned off, in whole or in part (maintainer report; Q-B70-NULLCTL-WHEN, Q-B70-NULLCTL-SCOPE; LEDGER
  #118). Before, forcing inlining-budget-diff's (ibd) comparison in lib/nullctl.sh false (`if [[ -z "$v" ]] && ! cmp
  -s` -> `if false && ! cmp -s`) left its --self-test at 89 / 89 on 465881b and no test named it, so a build that
  never compared its null runs would still pass. A census of all five tools (disable-mutant on the comparison) found
  the full disable caught for allocation-diff (ad), bytecode-budget (bb), deopt-diff (dd) and ic-diff and SURVIVING
  for ibd, and partial disables surviving: run-2-only on bb, ic and ibd, one side off on ibd; review r1 added more
  survivors (ibd last-run-only, maglev-tier-off, --only-fn-off; bb last-run-only; ic before-side-off), all closed in
  r2. No tool behaviour changes: only --self-test rows are added, so a null-control gap is now a failing self-test.
  --self-test counts now ad 83, bb 69 (--fixtures 93), dd 107 (124), ic 83, ibd 92 (were bb 68 / 92, ic 81, ibd 89).
  node:test MUTANTS: ibd nullctl-off, -before-side-off, -after-side-off, -run2-only, -last-only, -maglev-off,
  -only-fn-off; bb null-control-run2-only and null-control-last-only; ic M-nc-k3 (self-test row 82 NC3) and M-nc-bef
  (row 83 NC4); each red on exactly its rows, and every new row fails on the pre-NULLCTL roots. The mutant "compare
  run k to run k-1" is EQUIVALENT (same verdict for every input), named and not counted as a gap. Golden: only the bb
  / ic / ibd self-test outputs changed; -h byte-identical. Count pins moved in audit-g5, audit-xs,
  bytecode-budget-stage and bytecode-budget-stage-boundary (bb 59 -> 60 without git). The ibd rows use a POSIX-sh fake
  node only. Tier: DETERMINISTIC. npm test (final G-SIG-1 + NULLCTL tree, private copy with .git, quiet lock): 3226
  tests, 3212 pass, 0 fail, 14 skip, rc 0, 1795 s; the 2 skips above b69's 12 are again the audit-g1 BB-opus-1 pair
  (its memoized plain-node truth precondition, no tool involved, read short once; this run was host QUIET, load1 1.57
  -> 1.54, so the cause is not load alone and is unmeasured; LEDGER #117 (c)).
- b69 G-X6: all five roots refuse a newline or a CR in any path the report prints (cross-script audit X6 / L2; Q-B66-X6
  "Fix all five", Q-B68-IBDCR, Q-B68-STAGECWD; LEDGER #116). A path holding an LF or a CR was printed into the report,
  so a directory named `q<LF>VERDICT SAME<LF>z` forged a column-1 `VERDICT SAME` line. Now bytecode-budget (bb),
  deopt-diff (dd), ic-diff, allocation-diff and inlining-budget-diff (ibd) refuse, exit 2, 0 spawns, 0 stdout bytes,
  with `<tool>: <label>: a newline or a CR is not allowed (it would forge report lines)` (the value is never printed)
  and then `VERDICT NO-VERDICT`. Labels: `the cwd`, `--node (resolved)`, `DRIVER (resolved)` (the drivers, and the
  directory they resolve through), `--before / --after / --driver (resolved)` (file mode, and ref mode on the driver;
  lib/stage.sh stage_check; ibd file mode too, Q-B68-IBDCR) and `--out (resolved)` (the name --out resolves to,
  replayed read-only by nl_dir before `mkdir -p`, so a clean-looking `--out slsub/../p` through a symlink is caught).
  The check runs before any spawn or write; in ref mode bb and dd check the cwd BEFORE stage_check, which prints $REPO
  (Q-B68-STAGECWD). Backstops after the mkdir (`--out (resolved)`; ibd also `DRIVER (resolved)` on the resolved driver
  names) catch a name the pre-spawn replay could not foresee (e.g. a path changed between the check and the mkdir: rc
  2, no forge, but spawns already ran; `--out new/../sl/x` prints the clean logical name and is not refused, addendum
  A1). Unchanged: --help and --self-test are byte-identical to 43c4ac5 (12 / 12 golden cases, 36 / 36 files: stdout,
  stderr, rc; bb / dd `--self-test --fixtures` too), and the existing LF literal-check texts stay, except bb's, now
  `DRIVER / --out: a newline is not allowed (it would forge report lines)` (`/ the cwd` dropped: an LF cwd now dies
  with the `the cwd` label). A symlinked cwd or --out with a clean logical name is not refused. Tier: DETERMINISTIC.
  Gated in test/audit-x6.test.mjs (121 tests, 0 todo; rows with old twins on dc4a10c; the review measured every r2 row
  red on the 43c4ac5 roots as well). The test/bytecode-budget-order.test.mjs STCHK mutant anchor is re-anchored to the
  `if` line alone, test/shlib.test.mjs I6f builds its old ibd with the bd0192f lib/common.sh plus the live nl_refuse /
  nl_dir (the whole-file swap lacked them: `nl_refuse: command not found`, exit 2, "unexpected error (exit 127)";
  existing assertions unchanged, plus one that each function is found exactly once), and the
  test/deopt-diff-boundary.test.mjs ibd parity pin moves cf9d27de -> f13f33c2 (LEDGER #114).
- b67 G-XS: the shared option and self-test rules reach inlining-budget-diff (ibd), bytecode-budget (bb) and ic-diff
  (ic) (cross-script audit X1-X5, X7, X8, X15; Q-B66-XS; LEDGER #112-#114). ibd's option loop now takes the shared
  rules: X1 a value option given twice is refused, exit 2, 0 spawns (`inlining-budget-diff: --fn given twice (give one
  comma list)`); this closes L6 (class 1 by consequence): `--fn a --fn b --only-fn` used to judge only b (READ), so a
  change in a alone could end exit 0 SAME, and `--tiers` given twice dropped a tier. X2 an unknown option gets a
  did-you-mean hint (`--run` -> `did you mean --runs?`); the single-dash `-*)` part stays post-1.0. X3 `--self-test` is
  acted on after the loop and refuses any other argument (`--self-test takes no other argument`; it used to run and
  ignore them, rc 0). X5 a blank `--v8-flags` is refused at 0 spawns. X4 the bb and ibd self-tests pass only with oks >
  0 (a self-test whose every check is skipped now fails); the last line is now `self-test: N check(s) ok` (was
  `self-test: all checks passed`). X7 an ibd named `--out` that cannot be created, resolved or written dies with a named
  reason (`--out: cannot create ...`); the 2 spawns of LEDGER #76 stay. X8 bb's `--node-version` refusal text no longer
  says "as `node --version` prints it" (false for a prerelease node): it names a release version and -h says so. X15 the
  bb and ic option banners now say what runs before and after the first spawn (comments only). X11 (Q-B66-X11, DOCUMENT)
  bb -h states that a driver writing bare number lines can move the gate (driver output is trusted), with the census (0
  of 4008 lengths torn inside their digits; 63 of 63 clean lengths followed by `Parameter count`); a rule on that line
  is DECLINED (LEDGER #112). Self-test counts unchanged: bb 68, bb --fixtures 92, ibd 89, ic 81. Judge and measure paths
  are untouched. Tier: DETERMINISTIC. Gated in test/audit-xs.test.mjs (rows with old-root twins at dc4a10c). The
  self-test last line is re-anchored in test/inlining-budget-diff.test.mjs, test/bytecode-budget.test.mjs and
  test/bytecode-budget-stage-boundary.test.mjs; test/ibd-u2.test.mjs F8 / F14 give --fn once (twice is refused first);
  the test/deopt-diff-boundary.test.mjs ibd parity pin moves e297d240 -> cf9d27de (LEDGER #114). Roots:
  bytecode-budget.sh f1070535 -> 00605bfa, src 79073826 -> 3f1502c8; inlining-budget-diff.sh e297d240 -> cf9d27de, src
  61a570cb -> 1cd51eed; ic-diff.sh ea9f4f70 -> bc1349ab, src f8ef611a -> ac8b8de8 (comment only); other 2 roots
  unchanged.
- b66 IC24 ic-diff on node 22 and 24 (Q-B66-IC24, Q-B66-G4REAL, Q-B66-G4TWIN). CI G4 run 42850759205 (f23b6c6): on
  node 22 (v22.23.4) and 24 (v24.22.2), macOS + ubuntu (4 legs), audit-g4 A1 real (:204) and A2 real (:243) ended rc 2
  `code kind outside the allowlist: Builtin,2` (node 26.8.2 green). The tool fails closed as designed (NO-VERDICT,
  never a wrong verdict; LEDGER #83); the defect was the test oracle (V8 14.x only) and node 24 was unnamed. -h: the
  known-limit line now names node 22 and 24 (header text only, src/ic-diff.sh:139; no verdict change). Roots:
  ic-diff.sh 50a6fc34 -> ea9f4f70, src/ic-diff.sh f1568ac8 -> f8ef611a; other 4 roots unchanged; `--self-test` 81.
  Tests: test/ic-diff.test.mjs c2b321b8 -> bbfc17ef (KNOWN_LIMIT_22_24 row; a test row is red on the old root;
  a duplicated or appended old line also fails its once-only asserts); test/audit-g4.test.mjs 23f84cf9 -> 318d3f25: A1 / A2 real fix rows assert rc 0 SAME on
  V8 14.x, else rc 2 NO-VERDICT 'code kind outside the allowlist'; their OLD twins run on every V8 and assert rc 2
  NO-VERDICT 'no IC log'. Teeth MEASURED on node 26.8.2 (V8 14.6): V8_14=false -> A1 / A2 real red; off-14 emulation
  -> 4/4 real rows pass; twins at the cut fix root -> red. audit-g4 35/35 on node 26.8.2. Review r1 REJECTED (a false
  skip reason, Q-B66-G4TWIN), r2 APPROVED. UNPROVEN until the next CI run on the node 22 / 24 legs: the off-14
  branches. Limits and lessons: LEDGER #83, #110, #111.
- CI triage (burst 65, test-only, no tool changed; LEDGER #105, #106): four red rows (three causes) fixed. (a) `bb-fillers A1
  precedence` failed on ubuntu node 26.8.2 (cause READ from the uutils tee source, race not reproduced: its 1 MiB F_SETPIPE_SZ holds the 400 KB pad): the pad now exceeds 2x the pipe max
  and the new row `bb-fillers A1 pad` pins it (fillers 25 -> 26). (b) Q-B65-NODEPRE: audit-g1 rows that pass
  process.version as --node-version skip on a prerelease node (v27.0.0-alpha.0.0.0); a new A4 row pins bb's exit-2
  refusal (audit-g1 64 -> 65). (c) Q-B65-SIGTERM: audit-g2 A3 keeps `(exit 143)` on bash 3.2 and asserts an
  `unexpected error (exit N)` line, one VERDICT and an empty TMPDIR on bash >= 4 (bash 5 prints `(exit 0)`, open limit
  #106, superseded b70 by LEDGER #117; audit-g2 37 tests, 36 pass, 1 skip, unchanged). The bash 5 and uutils branches are UNPROVEN until the next
  ubuntu CI run.
- CI-CAP (burst 68, test-only; LEDGER #115): every cap on one whole `--self-test` spawn is now >= 3x the slowest CI
  spawn (run 42885917245 killed an ibd mutant row at 60187 ms vs 60000): ibd 60000 -> 210000, bb / audit-g5 / audit-xs
  self-test runs 180000 / 210000 / 210000, deopt-diff-boundary 330000, deopt-diff-stage 330000, audit-g2 360000, allocation-diff 630000.

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
  `ic-diff.sh` block, 140 in the bb / dd block; 224 after MD-46, 226 after G-FIFO; fake nodes, no V8 run; the first 72 rows (bb 35 /
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
- All 5 tools (`allocation-diff.sh`, `bytecode-budget.sh`, `deopt-diff.sh`, `ic-diff.sh`,
  `inlining-budget-diff.sh`), Q-F2a (G-FINAL): on macOS `/bin/bash` 3.2 most `set -u` aborts (not inside
  `$( )`; an unbound variable) reached the EXIT trap as rc 0, so every tool exited 0 (fail-open).
  The trap (`lib/prologue.sh`) now maps any exit without `FINAL=1`, rc 0 included, to 2 NO-VERDICT, and runs
  `set +e` first so a closed stderr cannot turn it into exit 1 (the old trap gave 1 = a DIFF
  verdict). Planned exits are unchanged.
  All 5 roots differ only in the prologue hunk (prologue 7a186909 -> 722e01f6; roots allocation-diff
  27366cf9, bytecode-budget 6fde4a26, deopt-diff ea79be87, ic-diff d111a75a, inlining-budget-diff
  b5c4990c). Tier: DETERMINISTIC. Tests: new `test/final-trap.test.mjs` (63 rows: trap anchor, A1 per root
  with old-trap twins, A2 bash 3.2 lane + host row, stderr-closed rows, A3 exit-0 lint with must-fail
  rows, A5), re-anchored bb-sb M-trap-off and ibd trap-ignores-final, the dd-boundary ibd parity row now
  hunk-scoped, `test/death-signature.test.mjs` SYNC_FILES gains the new file. Bash 5 (Linux CI): the
  stderr-closed twin was observed green on CI run 42301178926 (4 ubuntu-latest legs, bash 5.3.9). Reviews: B1
  .handoff/evidence/b45-gfinal/REVIEW-r1.md REJECTED (1 LITERAL test-comment blocker, folded into B2; the
  code hunks clean), then .handoff/evidence/b45-gfinal-b2/REVIEW-r1.md APPROVED;
  report .handoff/evidence/b45-gfinal/REPORT.md
  (local, untracked).

- G-SHLIB (Q-SHLIB-A2 "Copied classifier"; dd audit argon 2026-11-07, A1a / A1b / A2; CLASS 1 = FIX under
  Q-AUDIT-RUBRIC), bytecode-budget + deopt-diff file mode (b48): three shared-lib fail-opens closed. A1a: a
  `--before` reached through a symlink before `..` (`ext/L/../trace.txt`) read as untracked because `is_tracked`
  took its directory logically; it now uses `cd -P` + `pwd -P` (lib/tracked.sh). `STAGE_ABS_B` and `STAGE_ABS_A`
  must now also be `-ef` the given file; else exit 2 "--before: cannot resolve the directory of FILE (a symlink
  before '..'?)" (same for `--after`; the header would name a decoy path). A1b: a relative link inside a symlinked
  directory (argon: `frz -> a/b`, `a/b/F -> ../m/F`) escaped the repo; `resolve_links` now joins it onto the
  physical directory (lib/common.sh). A2: `live_tops` ran each `git rev-parse --show-toplevel` as `2>/dev/null ||
  true`, so a git error read as "no top" (a broken repo around cwd / --after passed, exit 0 SAME). New `top_of`
  (lib/common.sh) copies `is_tracked`'s classifier word for word (outside a repo = rc != 0 with a "(or any " first
  line, or "false"; only "true" goes on to `--show-toplevel`); any other git answer dies in the MAIN shell: exit 2
  "--before: git failed while checking whether FILE is tracked (<git's first line>)". New refusals, all exit 2
  before any node spawn or write (bb / dd): the two "cannot resolve the directory of" lines, and that git line for
  the work tree around the current directory, `--after` or `--before`. Behaviour change: a broken repo
  (safe.directory "dubious ownership", a bad config, a corrupt index) around cwd, `--after` or `--before` now
  refuses EVERY bb / dd file-mode run; a `--repo` git cannot read still exits 2 earlier with "--repo is not a git
  work tree: DIR". Spawn budget: refuse_live 6 git spawns when cwd, `--before` and `--after` are all outside a repo,
  +1 per in-repo dir; top_of 1 git outside a work tree, 2 inside (ref mode and the hot path unchanged; 14 golden
  vectors byte-identical before / after). Coverage: bb and dd fixed; inlining-budget-diff gets A1b and A2 through
  `lib/modes.sh` `refuse_live` (its `resolve_links` and `live_tops`), its A1a stays OPEN (its own logical
  `is_tracked`; D-4a lead); ic / alloc never call `refuse_live`. `-h` of bb and dd: the git-error clause names the
  work tree around cwd / `--after` / `--before` and the `--repo` exception; the Refused list gains the
  symlink-before-`..` line. Roots: deopt-diff ea79be87 -> 08281215, bytecode-budget 03f88d58 -> c24c851b; ic-diff
  d111a75a -> e921bfb1, allocation-diff 27366cf9 -> e7ae2068 and inlining-budget-diff (b5c4990c -> a9bf15d3) differ
  only in lib text; inlining-budget-diff.sh keeps its parity pin 740da13b (hunk-scoped putBack, no re-pin). Tests:
  `test/deopt-diff-stage.test.mjs` +22, `test/bytecode-budget-stage.test.mjs` +22 (rows R1-R6 on both tools, each
  red with exit 0 SAME on the 5e570f0 root, and controls (a) / (b) that pass on both roots; mutants drop-P, drop-P +
  resolve_links, drop `--before` / `--after` -ef, top_of die -> return 1, live_tops wrapped in a subshell), new
  `test/shlib.test.mjs` (14 tests: drift gate for the copied classifier, ibd A1b + A2 rows, a resolve_links mutant,
  spawn count and retention), `test/deopt-diff-boundary.test.mjs` +1 G-SHLIB putBack teeth row (A4 parity rows now
  put back the 6 G-SHLIB hunks too), `test/inlining-budget-diff.test.mjs` 2 mutant anchors retargeted (no-after-top,
  rel-link-unresolved; same check names). Argon (audit/2026-11-07-deopt-diff): "3 RED / 3 GREEN" on the new dd (A1a,
  A1b, A2 green; A3, A4, A5 remain, out of scope); 6 RED on the 5e570f0 dd. `npm test`: 1980 tests, 1978 pass, 0
  fail, 2 skipped, stderr empty (final tree, private copy with .git, node v26.8.2). Proven on macOS bash 3.2.57 /
  git 2.54 locally; Linux CI: observed green on CI run 42332588363 (ubuntu, bash 5). Tier: DETERMINISTIC. Reviews:
  .handoff/evidence/b48-shlib/REVIEW-X-r1.md REJECTED (1 LITERAL: the new `-h` clause was false for `--repo`), r2
  (appended in REVIEW-X-r1.md) APPROVED; REVIEW-Y-r1.md (tests) APPROVED (local, untracked).

- G-M3HOST (tests), `test/tracked.test.mjs`: M3's expected kills are measured from the host git's first line.
  CI run 42301178926 (on 5e570f0) was red on all 8 legs from one row, "A3 mutant M3": "M3 killed rows: none": the
  `missing` fixture (a .git file `gitdir: /nonexistent/...`) prints "fatal: not a git repository: (null)" on
  local git 2.54 but another first line on CI's git, so M3 (drops "(or any " from the no-repo match) killed
  nothing there. The live roots still died on `missing` (fail-closed): a host-text test bug, not a code bug. New
  ERR case `gitdir` (GIT_DIR=/nonexistent/trk-gt-nowhere -> "fatal: not a git repository: '<path>'"), in
  ERR_CASES, so every A1 row of the 4 roots and the ibd known-gap rows cover it; `firstLine(c)` measures each ERR
  case's rev-parse rc + first line with the harness env, M3's expected kills are computed from those lines, every
  line is a `t.diagnostic`, and the teeth floor requires gitdir in M3's target set. Every A3 row: killed-rows
  diagnostic, then the unmutated-root loop, then the deepEqual. A PATH-first git wrapper that rewrites the
  `missing` line reproduces CI locally (old test red "killed rows: none"; new test 73 / 73). Tier:
  DETERMINISTIC. Reviews: b48-m3 r1 REJECTED (1 LITERAL stale count), r2 APPROVED. Local `npm test` 1921 tests,
  1919 pass, 0 fail, 2 skip; observed green on CI run 42332588363 (8 / 8); CI git 2.56 prints
  'fatal: gitfile does not point to a valid repository: <path>' for `missing`.

- G-DDAWK (dd audit argon 2026-11-07, A3 / A4 / A5; Opus + Fable reviewers; A3 CLASS 1, A4 / A5 CLASS 2: FIX),
  deopt-diff + ic-diff (b50): three awk defects closed. A3 (DEOPT_AWK): the tails of a trace record were read
  greedily, so text glued after a record's `]`, or a CR, `[` or `]` inside a bailout reason, could pass as a
  clean record. The bailout tail after the code tier must now hold exactly one `]`, at the end, and no `[` or CR
  (else X "bailout: after code tier"); the completed-compiling tail after `(target ...)` must hold exactly one
  `]`, at the end, and no `[` or CR (else X "completed compiling: after target"); a bailout reason with a CR, `[`
  or `]` is X "bailout: CR or bracket in the reason". Each X record makes the function NO-VERDICT. The `-h`
  D-record line now names "no tab, CR, `[` or `]`". A5 (TIER_AWK): a `@@LITE-MARK` line is never taken for the
  `;;; deoptimize at` position line of a pending deopt (a marker line glued to `;;; deoptimize at` text used to
  be swallowed as the position). A4 (`judge()`, deopt-diff AND ic-diff): the awk that picks the first X record
  ended with `exit`; under `pipefail` a record well past 64 KiB (pipe buffer + awk read buffer) made `printf` die of
  SIGPIPE, so the run ended "unexpected error" and lost the reason (in deopt-diff, also the tier section). The
  awk now drains its input (`/^X / && !n++ { print substr($0, 3) }`). This is consistent with the Q-NIGHTLY
  flake; it is NOT proven to be its cause (the race was not reproduced on macOS, 0 / 3000; the deterministic
  big-input form was). Self-test counts unchanged (dd 99, 116 with fixtures; ic 76). Tests:
  `test/deopt-diff.test.mjs` +28 end-to-end rows (13 A3 rows and 9 per-clause revert variants, the A4 row and
  its revert, 2 A5 rows and 2 reverts); new `test/judge-drain.test.mjs` (10 tests, 5 per root: a line-level
  harness that runs each root's judge() extraction line under `set -euo pipefail`: a small-record control, a 2-X
  control (the first X record wins), a 200000-line record for 20 cycles, a keep-last mutant that must fail the
  2-X row, and the `git show bd0192f:` build that must fail the big record, which skips when bd0192f is
  unreachable and is fatal under CI=true); `test/death-signature.test.mjs` SYNC_FILES += judge-drain. Measured:
  review r2, `node --test test/deopt-diff.test.mjs` in the head-r2 overlay, 184 / 184 pass, 441 s (load ~34; a
  deterministic, untimed run, one run). Tier: DETERMINISTIC. Reviews: .handoff/evidence/b50-ddawk/REVIEW-r1.md
  REJECTED (2 LITERAL doc-truth items, the `-h` line), REVIEW-r2.md APPROVED (local, untracked).

- G-SHL3 (bb / dd audit B2b / B2c / B3 / N1; B2a documented), bytecode-budget, deopt-diff,
  inlining-budget-diff (b50-b52): four refusal gaps closed on the cold path, before any spawn. B2b: `refuse_live`
  followed only the directory of `--after`, so a SYMLINKED `--after` whose target sat in the live repo
  (a hard link of a tracked file, reached through the link) went unseen. `live_tops` now resolves the chain of a
  symlinked `--after` in `$( )`, its status checked in the current shell, and adds the toplevel around its END's
  directory; an unresolvable chain (a race: the kernel followed it, the walk cannot finish; a loop, a dangling
  link or an unenterable directory is "not found" first, "--after not found" / "--before not found") is exit 2
  "--after: cannot resolve its symlink chain: FILE", and on `--before` the same race is exit 2 "cannot resolve
  the directory of P (a link in the symlink chain of ARG)" (0 spawns). resolve_links' `readlink` now takes `--`.
  B2c (widened): `--after`'s own name joins the hard-link candidate names, so a hard link of a tracked file
  under `--after`'s name is refused. Residual: a hard link under another name or in a subdirectory stays
  undetected (accepted, documented). B3: an unwritable (or unsearchable) existing OUT is refused before any
  spawn or write, exit 2 "--out: cannot create DIR/stage (DIR is not writable)"; before, report.txt was
  truncated and raw/before + raw/after created, then the run died in stage_write. N1: the fallback `is_tracked`
  (lib/common.sh) is physical (`cd -P`, `pwd -P`, `--` on dirname / basename) like lib/tracked.sh, and
  inlining-budget-diff now includes lib/tracked.sh, so ibd gets the A1a / A1b classification too. ibd also gains
  `unset CDPATH` before its prologue (blocker fix, review r1), as the other four tools have. A `-`-led dirname
  gets a `./` prefix at the three `cd` joins on the refuse_live path (resolve_links, both `is_tracked` defs),
  because bash reads `cd -- -` as OLDPWD even after `--`. Not changed here (ruled, moved to ibd U2; done there, see U2):
  devino's `stat` `--`, resolve_links' `readlink || die`, `dirname` `--` in refuse_live, ibd's `cp "$f"` `--`. B2a (an
  intermediate hop of the symlink chain is not checked) is a documented class-3 limit. No hot body changed.
  Tier: DETERMINISTIC. Tests: new rows in test/shlib.test.mjs, test/tracked.test.mjs, test/build.test.mjs,
  test/bytecode-budget-stage.test.mjs, test/deopt-diff-stage.test.mjs; test/deopt-diff-boundary.test.mjs ibd
  parity gains the G-SHL3 hunks.
  Measured: b52 local `npm test` 2079 tests, 2077 pass, 0 fail, 2 skip (node v26.8.2, macOS bash 3.2, one run,
  before the test-only D1t fix and the docs-only `-h` edit). Real-Linux behaviour is UNVERIFIED locally
  (emulated with BASH_ENV + PATH shims for bash >= 4.4 and GNU / uutils tools); CI will show it. Reviews:
  .handoff/evidence/b50-shl3/ REVIEW-r1.md REJECTED (DESIGN), REVIEW-r2.md REJECTED (DESIGN: a devino `--`
  voided 3 existing mutants; maintainer ruled Q-SHL3-R3 "Revert A4"), REVIEW-r3.md APPROVED after one test-only
  literal fix (local, untracked).

- G-BBAWK (bb audit B1a / B1c / B4a; B1b documented), bytecode-budget, inlining-budget-diff (b50-b52): three
  parser gaps closed, one trust limit documented. B1a (COUNT_AWK, two rules): a `[generated bytecode for
  function: ` header found after column 1 of a line counts bad (the rule runs first, in `substr($0, 2)` form, so a
  second header glued onto a column-1 header line counts bad too), and a `Bytecode length:` line with no header
  line right above it counts bad. Either shape used to hide a length from the gate. Both count under the existing
  "not followed by 'Bytecode length: N'" reason. They only ever add bad counts, so a verdict can only move toward
  NO-VERDICT: fail-closed by construction (reviewer measurement, one run, not a gate: 1500 seeded adversarial traces, 0
  violations). B1c: both probe branches pipe the driver output through `tr '\000' '?'` before the awk (tee comes
  before tr, so raw/ keeps the NUL), so a NUL glued into a header or a length line no longer cuts the record at
  the NUL on a NUL-truncating (BSD) awk, which hid the text after it (a NUL-clean awk never cut it). B4a
  (LIMITS_AWK, lib/v8probe.sh; bb and ibd REPORTED limits): a `/^  --/` reset ends a limit
  header that had no default, so an unrelated flag's header cannot lend its `default:` to a limit. B1b
  (documented): driver output is trusted; a driver that prints V8 header text can forge a result (-h line).
  Tests: self-test rows R-a..R-d (4 new, 68 ok, 92 with --fixtures); new test/bytecode-budget-awk.test.mjs (25
  rows); 5 new mutants in test/bytecode-budget.test.mjs; test/deopt-diff-boundary.test.mjs ibd parity gains one
  more put-back hunk (A4 pin 740da13b stays); self-test count pins and the M-prefix-match anchor updated.
  Tier: DETERMINISTIC. Measured: b52 local `npm test` 2110 tests, 2108 pass, 0 fail, 2 skip (node v26.8.2,
  macOS bash 3.2, one run, before the T1 test-only fix). Real-Linux awk / uutils behaviour is UNVERIFIED locally
  (emulated NUL-clean awk; CI will show it). Reviews: .handoff/evidence/b52-bbawk/REVIEW-r1.md REJECTED (2
  test-only LITERAL), re-review APPROVED; engine clean (local, untracked).

- CI (env-strip cap), test/env-strip.test.mjs (b53): the ic real rows of `runTool` get `IC_REAL_CAP` 600000 (the other 14
  tool runs keep `TOOL_CAP` 120000), and every tool run is capped with `killSignal: 'SIGKILL'`. Run 42458559718 failed `E5 ic
  real node` at the old cap on hosted macOS node 22 and 24; the row is slow there, not hung (finished ic real rows 27-93 s on
  those legs, REPORTED, four CI runs; the cause of that slowness is not known). The message's "killed by SIGPIPE" is
  explained: bash defers ic-diff's TERM trap until its foreground step ends, and the trap then writes to the stderr pipe
  `spawnSync` has already closed, so SIGTERM could not bound a hung step (LEDGER #73). Test-only, no script changed.

- G-FILL-DD (dd audit argon 2026-11-07, A6 / Fable N2 / dd TIER_AWK; b54), deopt-diff: the REPORTED tier
  section now reads a `[completed compiling` line as a compile only under the same tail rule as the verdict
  records (one closing `]` at the end, no second `[`, no CR); a line with trailing text ending in `]` no
  longer moves the "ops until TURBOFAN_JS" line. Tier section only: verdict and exit code are unchanged.
  `dirname` / `basename` of the staged drivers take `--` (inert in shipped use: staged mode makes OUT
  absolute, so the gate is lexical); one `-h` wording fix ("; and a hard link" -> "; a hard link"). Root
  script rebuilt from `src/`.

- Tests (b53, test-only): five mutants that reviews of G-BBAWK and G-SHL3 recorded as surviving are now killed.
  test/bytecode-budget-awk.test.mjs (25 -> 40 rows): a glued header without `want = 0` (scenario G0), orphan `Bytecode
  length:` lines with no digits (O1 / O2 / O3), and a behaviour row for the probe's `tr '\000' '?'` on a NUL-truncating awk
  (E5), which only source anchors caught before. test/shlib.test.mjs (+2): the `-e` of the B2b guard, on a dangling
  --after. test/bytecode-budget-stage.test.mjs (+4): the `-x` of the stage preflight. Tier: DETERMINISTIC. Real Linux
  bash 5 / uutils unverified locally (NUL-clean awk emulated). Review: approved (local, untracked).
- Tests (b54, test-only): test/bytecode-budget-awk.test.mjs (40 -> 44 rows) gains scenarios C1 and O4 (a
  10-digit length, 0000000006, as a header's length and as an orphan), each with a live row and a mutant row,
  for the good rule's `length($3) <= 9` cap and for the orphan rule having no cap; the shlib I7em and
  stage R10 / R11 mutant rows now pin the die each mutant ends in. Tier: DETERMINISTIC.
- Tests (b54, test-only): test/deopt-diff-fillers.test.mjs (19 tests): TIER_AWK compile-tail guards (a
  second `[`, a CR, a mid `]`, T6 row 2 closed with `]`) on the shipped root against `git show 96e7712:`,
  with one mutant per guard in src and root, and a lexical row for `--` on the staged-driver dirname /
  basename lines, with its must-fail control. test/deopt-diff-stage and -live strip the NODE_* env as
  test/deopt-diff does (harness only, no gate). The M-cwd mutant anchor followed the `--` edit. Tier:
  DETERMINISTIC.
