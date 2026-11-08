# lite-utils -- the consolidated ledger

*Every design refused, every defect found and fixed, every CI / platform / test-gate / process lesson, and the rule
each one produced. This is the evidence base the tools' current behaviour rests on: it is why a refusal happens
before any spawn, why a timeout must fail by name, and why a matcher must reject more than one failure form. Nothing
here is re-litigated without a **new mechanism**.*

Provenance: built in burst 42 from seven sweep tables (history, changelog, plans, audit, ci, memory; local,
untracked, under `.handoff/evidence/b42-ledger/`) plus the primary files they cite. Evidence labels: a bare sha is a
commit verified present in this repo; `CHANGELOG "<label>"` is a section label in `CHANGELOG.md`; `HISTORY b<n>` is
the burst entry in `.handoff/HISTORY.md` or `.handoff/archive/` (local, untracked); `PLAN-*` files live in
`.handoff/` (local, untracked). A cause the sources do not record is written "cause not recorded" or OPEN. Timings
carry their tier: all CI timings below are REPORTED (hosted CI, one run each, as the cited text gives them).

---

## The laws that fell out (read this first)

1. **A timeout is a named failure before any other check.** A capped child that is killed must throw "timed out after
   <cap> ms" first; an `assert.throws`, a bare `null !== 0`, or a mutant row that only expects "some failure" passes
   on a hung run and turns a gate into a rubber stamp. *(#43, #46-#50)*
2. **A matcher must reject every failure form, not one.** A cap-kill AND a spawn error both fail by name; EPIPE is
   benign only with a numeric exit and no timeout. *(#45, #49, #50, #51)*
3. **Refuse before the first spawn or write.** Every unverified input (node binary, `--out`, symlinks, hard links)
   is refused exit 2 with 0 spawns; accepting it and failing later is a fail-open. A `--v8-flags` refusal comes at
   the latest after one `--v8-options` read (#10, #33; gap #66). *(#2, #3, #21, #22,
   #24, #26, #27, #29, #31)*
4. **Allowlist, never denylist.** A denylist of dangerous flags missed one (`--run`, `--prof`, `--report-*`,
   `--require-module`); the runtime V8 allowlist is the winner, and its one known gap is recorded, not hidden.
   *(#6, #8, #9, #22, #66)*
5. **Resolve once, to one absolute path.** Node is resolved once; a dash-led argument is a name, not an
   option; a logical `..` after a symlink is refused. *(#4, #21, #26, #27, #28)*
6. **Test the tests: every new gate must fail on the old code.** A row that passes on a timeout, a mutant that
   survives, or a control that is not reproducible is a defect in the test, never "re-run it". *(#36, #47-#53, #56)*
7. **Oracles must be portable across userlands.** BSD vs uutils coreutils, macOS awk (cuts at NUL) vs NUL-clean awk:
   accept every form or probe the host. *(#32, #39, #54)*
8. **`spawnSync` blocks the event loop, so a timer cannot fire.** Never judge a child timed out by a timer that
   could not have run; check the exit first. Size caps to the slowest CI leg, and `--test-timeout` to the slowest
   FILE. *(#40, #42, #43)*
9. **A history pin must be reachable from a ref, and a CI view must include `.git`.** Otherwise it passes locally
   and dies (or silently skips) in CI. *(#11, #38, #55)*
10. **Never kill by pattern, never share a scratch dir, never run a test on the live tree.** Lanes work in private
    `mktemp -d` dirs, kill only their own PIDs, and test in an overlay. *(#57-#61)*
11. **A literal REJECT gets one in-burst fix round; a design REJECT stops the unit.** Rejected diffs are parked
    against the overlay base, never reset to HEAD. *(#25, #62, #63)*

---

## A. Designs refused / rejected

**#1 MD-32: keep MD-3 and record a READY "ibd hardening" unit.** Options (b) lift MD-3 and fix four lib files plus ibd
(all five shas move) and (c) lift MD-3 for only the B1 fail-open plus a validator both needed a maintainer lift of
MD-3 at that time; (c) was not chosen, no reason recorded. Winner: (a) keep MD-3. Evidence: PLAN-ext-audit.md:229-231
(local, untracked).

**#2 dd refuses M1 before any spawn (0 spawns), contract unchanged.** Option (b), moving the dd M1 check after the
spawn, would weaken a documented claim and was a maintainer-only call. Rule: refuse first. Evidence:
PLAN-ext-audit.md:313-314 (local, untracked).

**#3 Refuse, do not `cd -P` everywhere.** `cd -P` for all header paths moves every header path under a symlinked
dir, so goldens and anchors move. Winner: refuse before any spawn or write. Evidence: PLAN-ext-audit.md:384 (A4 Q1;
local, untracked).

**#4 B2R `mkdir -p --` rejected; B2S `[[ "$OUT" != -* ]] || OUT="./$OUT"` wins.** With `mkdir -p --`, `--out -o`
reached `ls`, which read `-o` as an option and skipped the emptiness refusals (FAIL-OPEN, engine REJECT x2, burst
19). Rule: a dash-led argument becomes `./name`. Evidence: PLAN-ext-audit.md:441-442; CHANGELOG "external-audit
group" (line 699); HISTORY b19 (local, untracked).

**#5 Hard-linked report.txt and DRIVER report.txt refused, not left "not planned".** The orchestrator's option (d)
(no ID written) left both unrefused though they still truncate, a real gap; MD-37 (A12) refuses a hard-linked
report.txt. The bb port went through MD-48: guard MD-37 with `-f` (option (b), port alloc :782 read-only check
first, was a larger change that alters C-10 for bb; option (c), copying the `-e` text verbatim, is false for a
directory). Evidence: PLAN-ext-audit.md:475; PLAN-ext-audit-gB-four-bb.md:97-98 (local, untracked); CHANGELOG
"B-four" (line 796).

**#6 Denylist of entry-replacing / driver-writing flags rejected; runtime V8 allowlist (MD-50) wins.** The denylist
(A18 "Q-ids: denylist vs allowlist", MD-46 LEAD) still accepted `--run`, `--prof`, `--report-*` and flags that
replace the entry point (FAIL-OPEN). Rule: allowlist. Evidence: PLAN-ext-audit.md:614 (A22, Q-1..Q-7, MD-50..56);
PLAN-ext-audit-gB-alloc.md:297-299 (local, untracked).

**#7 MD-34: any symlink is refused, even one whose target is inside DIR.** Keeping an inside-DIR symlink working was
flagged as a maintainer-only narrowing; no reason is recorded for refusing it. Winner: any symlink refused, exit 2.
Evidence: PLAN-ext-audit-gA2.md:79-81 (local, untracked); CHANGELOG "external-audit group (MD-34)" (line 720).

**#8 Preload / print flag arms: prefix globs win over exact forms.** MD-43 rejected the exact `--require` pin
(`--require-module` bypassed it, fail-open) for the literal `--require*` arm; MD-45 rejected exact `--eval` /
`--print` (V8 `--print-*` prints internals into the measured run) for `--eval*|--print*`; MD-44 declined extra `-e`
/ `-p` arms because the letter gate already refuses them; MD-47 chose the die text "or prints V8 internals"
because "never runs" stays false for `--print-*`; bb's MD-44 probe inputs use `--print-opt-code` because bb's own
`*print-bytecode*` refusal fires first with `--print-bytecode`. D2-3 rejected a second backstop arm (check 71 greps
only the prefix) for one widened preload arm. Evidence: PLAN-ext-audit-gB-alloc.md:211,217,223,302,160;
PLAN-ext-audit-gB-four-dd.md:23-24,105-106 (local, untracked); CHANGELOG "B-four" (line 787);
"allocation-diff.sh, external-audit group" (line 827).

**#9 MD-39 / MD-40: exact default-config-file arm, same arm in all four tools.** A broad `*config-file*` glob lost
(reason not recorded; over-refusal risk implied); leaving `--experimental-default-config-file` unrefused lost because
node >= 24 reads `./node.config.json` from the driver's dir; an allocation-diff-only env-file/config refusal lost
because the preload risk applies to all four tools. The alloc test block went to a new `test/ext-audit-alloc.test.mjs`
(it would serialize with B-four, which owns `test/ext-audit.test.mjs`). Evidence: PLAN-ext-audit-gB-alloc.md:81-88
(local, untracked); CHANGELOG "B-four" (line 789).

**#10 MD-56 / MD-57: where the `--v8-options` read goes.** Hoisting bb's read above its `--out` writes puts four
spawn-free refusals behind two spawns; instead it reads right after `--version`, after the writes (MD-57). For ic,
dropping its hashed probe for a single read lost to the MD-56 literal: ic keeps its hashed probe (2 spawns) and gets
a new read right after `--version`. MD-57 amended (Q-BB3, b42): the read still sits right after `--version`, but bb's
`raw/before`, `raw/after` and `stage_write` now come after it and after the version-mismatch exit (only `raw/` and an
empty `report.txt` precede it). Evidence: PLAN-md46.md:236-237,247; PLAN-md46.md "A-b42"; RULINGS-b42-audit.md Q-BB3
(local, untracked).

**#11 History-dependent test rows FAIL when `CI=true`, they do not skip.** Silent skips hide missing pins; the
ruling chose failure. Evidence: PLAN-ci.md:46 (A1 pin check, B2; local, untracked); see #38.

**#12 Q-TN1 / Q-TN2: one shared `test/spawn-cap.mjs` (`capSync`), not per-file copies.** Option (B), local copies of
the v8flags helpers, duplicated 14 hang rows and the census; option (C), shared guard and format only with the async
exit-flag local in 5 files, was not picked (no reason recorded); leaving deopt-diff / v8flags helpers on an allowlist
permanently was refused because the ruling requires one wording across files. Evidence: PLAN-timeout-named.md:65-68
(local, untracked); CHANGELOG "TIMEOUT-NAMED" lines 559-592.

**#13 deopt-diff verdict design (MD-9..14).** Rejected: an opt-in `--by-offset` key (an unrelated edit above a site
would DIFF); a null control over D records only (misses tier-up noise; winner E+D records, tier-up noise gives
NO-VERDICT); counting inlined frames (needs TASK 0c); an `invalidate` D record (needs TASK 0b; listed under "Not
detected"); plain `--trace-deopt` (no frame dump, G3 needs `;;; deoptimize at`; winner `--trace-deopt-verbose`);
default `--runs 2` or a `--concurrent` hatch (no reason written; winner `--runs` 3, no `--concurrent`). Evidence:
PLAN-phase3-g1.md:110-119 (local, untracked).

**#14 Staged mode and report shape (MD-15..17, MD-19, MD-20).** A mktemp stage removed on exit needs a lib edit and
TMPDIR retention, so `--out` is required in staged mode; a NOTE-only bytecode-budget parity line lost because
identical modules read as DIFF (winner NOTE plus DIFF becomes NO-VERDICT); inheriting the lib wording lost to
deopt-diff's own non-directory-OUT refusal; a section only in `OUT/raw/<side>/run.1.txt` is missing without `--out`
(winner: in-memory KEEP clause); exit 2 under -h was refused (no reason written). Evidence: PLAN-phase3-g2.md:92-96;
PLAN-phase3-g3.md:98-100 (local, untracked).

**#15 Numbered markers `@@LITE-MARK op <n>` (MD-18 A).** A bare `@@LITE-MARK op` per op keeps a line per op and
needs a cap; an own prefix `@@DEOPT-DIFF op <n>` means two marker protocols. Evidence: PLAN-phase3-g3.md:93-95
(local, untracked).

**#16 Live rows run on every node (MD-21).** Skipping live rows off node v26.8.2 was refused: exit codes 1 / 0 on
every node, exact lines on v26.8.2. Evidence: PLAN-phase3-g4.md:75 (local, untracked).

**#17 allocation-diff design (MD-22, 23, 24, 29, 31).** REPORTED-only young-count verdicts lost (a leak-driven DIFF
would never get a verdict; winner NO-VERDICT on old-gen GC in window); a `--semi-space N` option lost (no reason
written; fixed 1 MB, min = max); fencing GCs around the window lost to (A) trace on/off (no reason written); a driver
opt-in counter lost to the tool preloading its own counter into every spawn (no reason written); default `--runs 3`
lost to `--runs 5` because of an expected binomial false-DIFF rate on A/A of 0.8-2.4 percent at R=3 vs 0.02-0.12 at
R=5 (INFERRED, not an observed DIFF; PLAN-phase4-g1.md:424-425). Also: the B0 evidence review was REJECTED (DESIGN)
because a G=0 guard made `--zero` always NO-VERDICT (a zero-alloc driver prints 0 GC lines by design). Evidence:
PLAN-phase4-g1.md:232-296,423 (local, untracked).

**#18 ic-diff design (MD-25..28, A7).** `--logfile=-` lost (mixes with driver output; forge/glue risk; winner a
per-run file in a private mktemp dir); an opt-in `--by-site` key lost (line:col shifts on edits); "any X site gives
NO-VERDICT" lost (no reason written; X as a final-state value); limiting attribution to non-`node:` scripts lost (no
reason written; MD-28 later NOT reopened, A3); a combined `--v8-options` probe folded into `--version` lost
(no argv prints both texts, cannot say which failed; own cold spawn, count 7 to 8). Evidence: PLAN-phase5-g1.md:264-
271,369 (local, untracked).

**#19 Scope: four scripts, statistical claims REPORTED only.** S-1: nine separate scripts lost (tiering folds into
deopt-diff, map diff into ic-diff); S-5: statistical claims in `npm test` or on a stat host lost (tier-up timing is
noisy); S-8: a control not reproducible in `npm test` (nondeterministic over 20 local runs) moves to STATISTICAL.
Dropped: warmup-cost as an ms script ("ops until TurboFan" kept in deopt-diff). Deferred: escape-analysis (no stable
user-land trace on release builds) and ArrayBuffer / memory-layout count. Evidence: ROADMAP.md:38,64,73,233-236.

**#20 Sec 6 ruling: no NaN rejection in the allowlist.** Fixing the allowlist to reject NaN numeric
values was out of scope; the maintainer ruled "Record as known". See #66. Evidence: ROADMAP.md:264.

---

## B. Defects found and fixed

**#21 Node binary re-looked-up after each `cd` (FAIL-OPEN; inlining F1).** Before and after could run different
binaries. Fix: node is resolved once to an absolute path; `--node` naming a builtin, directory or non-executable
file is refused exit 2 before any spawn (inlining F11 is the same class). Evidence: CHANGELOG "external-audit group
(bb, dd)" lines 693, 696; audit FINDINGS F1, F11 (local, untracked).

**#22 `--v8-flags` unchecked passthrough (FAIL-OPEN; F2, F15, A3, A5, B19, D4).** Flags that load code (`--require*`,
`--import*`, `--loader*`, `--snapshot-blob`), read files (`--env-file*`, `--experimental-config-file*`), run code
(`--eval*`, `--print*`) or write files ran inside the measured process. Fix: prefix-matched refusal before any spawn
(MD-39, 40, 42, 43, 44, 45), later the runtime allowlist (MD-50, see #6). Evidence: CHANGELOG "B-four" lines 787,
788; "allocation-diff.sh, external-audit group" line 827; audit FINDINGS (local, untracked).

**#23 Malformed `--v8-flags` entries accepted.** `---x` and `--=1` passed (ic-diff); each flag must now be `--` plus a
letter. Related: a non-numeric inlining limit in `--v8-flags` died only after spawns (F12). Evidence: CHANGELOG
"ic-diff external-audit" line 744.

**#24 Unwritable / unreadable output paths passed (F2 of the external audit; MD-34, MD-37, MD-36).** An unwritable
report.txt / raw or an unreadable raw/ (0300) passed checks, the run executed, exit 0, files overwritten; a
report.txt symlink was followed (write changed the target); a report.txt with another hard link was written through;
a dangling raw/ symlink was misreported "not empty" (and macOS `ls -A` lists the dangling entry, so plan premise P36
was wrong - HISTORY b31). Fix: refused with 0 spawns ("would follow it", "would change that file too", "is a
symlink"). Evidence: 151985d (F2 closed); CHANGELOG "external-audit group" lines 705, 720; "B-four" lines 795, 796;
HISTORY b31, b27 (local, untracked).

**#25 Dangling raw/ read as "not empty": engine REJECT (DESIGN), burst 27.** MD-36 was placed after the `ls -A` line,
so the dangling case never reached it; unit parked, MD-42 added. Evidence: HISTORY b27 (local, untracked); CHANGELOG
"B-four" line 795.

**#26 `..` after a symlink put outputs in different directories.** raw/ and report.txt named different directories
(OUT_L); the out was written to a checked dir. Fix: one directory (logical or physical) for all outputs; refused with
0 spawns; the header prints the physical path. Evidence: CHANGELOG "external-audit group" lines 728, 765.

**#27 Dash-led `--out` read as `mkdir` options (exit 2 only after the `--version` spawn); `cd -- -` = OLDPWD.**
Engine REJECT x2 (FAIL-OPEN) in burst 18: a dash-leading arg resolved to OLDPWD, and `--node -/node` ran. Fix: a
dash-led path is a name. Evidence: CHANGELOG "external-audit group (bb, dd)" line 699; HISTORY b18 (local,
untracked); inlining F7 / F16 (dash-led `--before/--after/--driver`, local, untracked).

**#28 Logical `cd` resolves `..` lexically: `link/../d.mjs` ran a decoy (FAIL-OPEN, burst 19).** Engine REJECT x2;
unit parked, planner DELTA A4. Evidence: HISTORY b19 (local, untracked); PLAN-ext-audit.md A4.

**#29 Empty-value arguments exited 0 (burst 4 qa FAIL-OPEN).** `--fixtures ''`, `--out ''`, `--node-version ''`,
`--v8-flags ''` were not rejected; fix is a one-line die on empty value (a blank `' '` was still fail-open and got an
engine REJECT). Evidence: HISTORY b4 (local, untracked).

**#30 Parser and matcher fail-opens in the first bursts.** Burst 2: repeated `--max` / newline dropped gate entries
(fixes C1-C8). Burst 3: `--nomax-...` prefix form accepted and no-form rows missing (engine REJECT, hard stop,
R1-R9). Burst 9: a deopt line glued after driver output was dropped (A3 addendum). Burst 13: TF taken from a loose
substring match (4 LITERAL rejects). Also, bytecode-budget 2^53 / 2^63 lengths read as SAME and passed
WITHIN exit 0 - fix: length capped at 1..9 digits, longer is NO-VERDICT. Evidence: HISTORY b2, b3, b9, b13 (local,
untracked); CHANGELOG "bytecode-budget" line 674.

**#31 Walk hang on relative OUT in an unsearchable cwd (burst 23).** Fix: guard `&& "$OUT_UP" != .`. An unreadable
DRIVER (chmod 000) was probed and ended NO-VERDICT after a spawn; now refused exit 2 before any spawn. Evidence:
HISTORY b23 (local, untracked); CHANGELOG "Changed (bytecode-budget)" line 650.

**#32 macOS awk cuts a line at NUL (FAIL-OPEN, burst 10).** The deopt read was the same. Fix: `tr '\000' '?'` between
`tee` and `awk`. See #54. Evidence: HISTORY b10 (local, untracked); PLAN-phase3-g1 A4.

**#33 Wrong premises that reached a ruling.** Q-H1 (burst 37) was written on a false premise: dd / bb / alloc refuse
node options after one read (wording corrected; true for all 48 probes). Burst 32: B1b r2 "one more FAIL line"
understated 2-6 rows (A5 premise wrong for 4 drivers; hard stop; literal
REJECT). Burst 31: plan and dd A3 premise wrong
(MD-36 row added). Rule: premises are checked against the code before they become a ruling. Evidence: HISTORY b37,
b32, b31 (local, untracked).

**#34 --watch hangs all five tools; `--run=x` ran a package.json script (burst 33).** The tools accepted node-only /
non-V8 options unguarded. Fix: MD-50..56 refuse them. Evidence: HISTORY b33 (local, untracked).

**#35 Later fail-opens in test machinery (burst 38-40).** `runOne` marked a run timed out though it had already
exited (false red): timedOut only if `'exit'` is absent after one `setImmediate` (TIMEOUT-ATTRIB, burst 40).
`liveV8Options` had no cap; cap 0 meant an unbounded hang; the ENOENT check broke under a spaced TMPDIR (V8N). The
allocation-diff V2 mutant's designed-row list was wrong (36, 78 vs 36, 71, 77, 78; ADV2). Evidence: CHANGELOG
"TIMEOUT-ATTRIB" 524, "V8N" 537, "ADV2" 554.

**#36 STAGE-NITS / BBA4 / ICN (burst 39): surviving mutants closed.** F_LIVE fake-node call count was not asserted
(now `./calls` is 6); the A4 `--v8-flags` refusal checked only raw/ and report.txt, so three mutants passed (now an
exact sorted recursive OUT listing); `--node` relative-path refusal was unpinned and M-v8fl-bin not caught (relNodeDie
row and mutant). Evidence: CHANGELOG "STAGE-NITS" 486, "BBA4" 510, "ICN" 517.

**#37 NUL-LEAK (burst 39).** A SIGINT / SIGTERM-killed test process leaked its NUL awk shim dir. Fix: `nulTmpDir`
removes the dir on SIGINT / SIGTERM, then re-raises. Evidence: CHANGELOG "NUL-LEAK" line 468.

---

## C. CI / platform lessons

**#38 History pins reachable only via the local reflog (burst 35).** Review of `ci.yml` found 4 of 5 history-test
pins (b376a5a, 6835177, cb9fa65, 41720de, 6ed93ed loop) unreachable from any ref (`cat-file` exit 128): green
locally, red on every leg in CI. Fix: re-pin to rebased commits; history rows FAIL (not skip) when `CI=true`;
CI-strict in 7 test files. Rule: pins must be proven reachable. Evidence: HISTORY b35; `.handoff/evidence/b35-ci/
REVIEW.md` (local, untracked); memory `history-pins-must-be-reachable`.

**#39 First CI runs red for platform reasons (burst 37).** All 4 ubuntu legs failed the same 6 rows, which assumed BSD
userland (BSD clap-style errors, TMPDIR behaviour) and macOS NUL-keeping awk; macOS 22 / 26.8.2 were cancelled at
`timeout-minutes` 60 (npm test 57.7 min; HISTORY :106, local, untracked). Fix: uutils-aware option checks accepting
GNU, uutils and BSD forms; a NUL-clean-aware awk PATH shim; workflow `timeout-minutes` 60 -> 120. Evidence: CI runs
41975539068 (b692aa0), 41987982156 (2016586); CHANGELOG "CI on Linux" line 430.

**#40 macOS node 22 / 26.8.2 SIGTERM at the 180 s cap on the dd NUL-shim control (burst 37-38).** The plain dd
self-test took 102-108 s against a 120 s cap on the hosted macOS runner (REPORTED, run 42056284029). Fix: per-run
caps raised (360 s, 900 s) and the timeout named (CI-TIMEOUT). Rule: generous CI cap headroom; treat a bare
`null !== 0` as a timeout first. Evidence: CI run 42056284029 (218bb48); CHANGELOG "CI-TIMEOUT" line 444.

**#41 SIGINT race (burst 38).** `bb-stage-boundary` row 9 read code=0 on node 22: the signal landed after the
self-test finished. Fix: an awk PATH shim blocks the self-test after the first ok line and SIGINT is sent only after
a provable block (ready file). Evidence: CI run 41975539068 (b692aa0); CHANGELOG "SIGINT-FLAKE" line 457.

**#42 node 22 applies `--test-timeout` per FILE (burst 39).** The macOS node 22 leg killed
`allocation-diff.test.mjs` at 30.0 min ("test timed out after 1800000ms"); the 7 legs that finished the file took
28.7-36.8 min (REPORTED, hosted CI, run 42087141421). Fix: Q-TT2
`--test-timeout=3600000`. Rule: size the timeout to the slowest CI file. Evidence: CI run 42087141421 (9b18f5d);
CHANGELOG "CI-FIX (a)" line 499; memory `node22-test-timeout-per-file` (local, untracked).

**#43 `spawnSync` blocks the event loop; a timer cannot fire (burst 39).** On ubuntu node 24 / 26 the `--fixtures MUST
FAIL on mutant` rows (ifalse, M1, M3, S1) were reported "timed out after 180000 ms" though the children had finished,
so the rows went red on finished runs (a false red, never a false pass). Fix: FIX_CAP 780 s, RUN_CAP 540 s. Rule: a
timeout mark is trusted only after the exit status is checked. Evidence: CI run 42087141421 (9b18f5d); CHANGELOG
"CI-FIX (b)" line 504.

**#44 V8-TIMEOUT (burst 39).** A5 M5 passed on a hung driver, and A4 could run 280 min against the 120 min job cap
(a worst-case bound, 40 x the old 420 s cap; INFERRED, not measured). Fix: timeout fails by name;
60 s cap per spawn. Evidence: CHANGELOG "V8-TIMEOUT" line 477.

**#45 CI-EPIPE (burst 40).** ubuntu node 24 + 26 went RED on `v8flags.test.mjs:356` "A5 M5": spawn error EPIPE. A
`spawnSync` stdin write races the child's exit, and `spawnOk` failed on any `r.error`. Ruling Q-EP1: EPIPE is benign
only with a numeric exit and no timeout. Fix: row SE (3ca5e79) and v8flags (97c2122). Run 42118030748 (b0465b8) was
the red run; run 42130164758 (aecb40f) is the first fully green run, 8 of 8 legs
(`.handoff/evidence/b42-d4b/REVIEW.md:11`, local, untracked). Evidence: those runs; CHANGELOG "CI-EPIPE" line 565;
`.handoff/evidence/b40-ci/` (local, untracked).

**#73 macOS node 22 / 24: `env-strip ic real old` past its 120 s cap; "killed by SIGPIPE" is a trapped TERM (burst 53).**
Run 42458559718 (96baf24) failed E5 ic at the cap on two legs, in 128.1 s and 131.6 s. Not a hang: across runs
42408769500, 42429510147, 42458559718 and nightly 42475104571, the ic real rows (E3 + E5) that finished took 27-93 s on
hosted macOS node 22 / 24 and 2-26 s on every other leg (REPORTED). Why node 22 / 24 are that much slower on that runner
is NOT explained (no local node 22 / 24 to profile). Fix in `test/env-strip.test.mjs` (law 8): `IC_REAL_CAP` 600000 for
the ic real rows only, the other 14 tool runs keep `TOOL_CAP` 120000 (all-hang bound 48 min), and `killSignal: 'SIGKILL'`.
The signal: `spawnSync` sends SIGTERM to bash only, then closes the stdio pipes. ic-diff has a `trap ... INT TERM`, so
bash holds the trap until its foreground step ends, and the trap's `printf` to the closed stderr dies by SIGPIPE. That is
consistent with the 8-12 s past the cap (row wall time, which includes setup). Reproduced on local node 26.8.2 + bash 3.2
(the failed legs were node 22 / 24): a trapped `sleep 4` under a 1000 ms cap reads SIGPIPE at 4006 ms, the no-trap
control SIGTERM at 1002 ms, the 0560272 ic root SIGPIPE under a 1200 ms cap; with its node step hung 9 s under a 2000 ms
cap, SIGTERM returns at 10407 ms and SIGKILL at 2004 ms. Rule: a capped child with a TERM trap can outlive the cap without
limit and name another signal; cap such a child with SIGKILL, and read the cap line, not the signal, as the verdict.
Evidence: those CI runs; `.handoff/evidence/b53-sigpipe/` (local, untracked).

---

## D. Test-gate lessons

**#46 TIMEOUT-NAMED B0 (burst 40).** A cap-killed child failed as a bare `null !== 0` or passed as a green mutant
row. Fix: shared `capSync` / `armCap` / `noTimeout` in `test/spawn-cap.mjs`; "timed out after <cap> ms". Evidence:
3ca5e79; CHANGELOG "TIMEOUT-NAMED B0" line 561.

**#47 dd base() re-ran 59 x 360 s on a timeout (burst 41, r1 REJECT FAIL-OPEN).** The timeout was not surfaced by
name; fix `BASE_ERR` on timeout, r2 APPROVED. Merged in dd-stage: M-nocheck and M-goonly PASSED on a timed-out run in
the old code; closed via `capSync` / `armCap` in withCase, A5, selfRun. Evidence: CHANGELOG "TIMEOUT-NAMED b41 dds"
line 574; HISTORY b41 (local, untracked).

**#48 bbsb M-stage-chk-off PASSED on a timeout.** Fix: `runOn` / `stRun` via `capSync`. Evidence: CHANGELOG
"TIMEOUT-NAMED b41 bbsb" line 576.

**#49 allocation-diff: `-h` revert row and 15 of 16 refusal revert rows PASSED on a timeout; a spawn error hung 10
min.** Fix: `capErr` guard; a spawn `'error'` fails by name. Evidence: CHANGELOG "TIMEOUT-NAMED b41 alloc" line 579.

**#50 v8flags and nul-awk (burst 41).** An assumed-SIGTERM fallback could pass a hung run (fallback and local
capped / spawnOk helpers removed; Q-TN2 = A), and a racing timed-out awk probe could pass (`whichOn` / `probeAwk`
via `capSync`). Evidence: CHANGELOG "TIMEOUT-NAMED b41 v8f" 585, "b41 nul-awk" 587.

**#51 Matcher accepted one capSync failure form only (bursts 40-41, three lanes).** Three reviewers independently
found the same fail-open: the matcher must reject timeout AND spawn error. The census (S5) first came back REJECT:
the sleep exemption was FAIL-OPEN and the `ps` re-probe flaked; r2 APPROVED with S5 census and teeth. Evidence:
HISTORY b40 and b41 (local, untracked).

**#52 Row-12 SIGKILL escalation passed (burst 40, B2).** Pre-existing FAIL-OPEN on escalation plus a ROOT leak in r1;
r2 APPROVED. Evidence: HISTORY b40 (local, untracked).

**#53 Gate teeth must survive every mutant (burst 14, G3 B1r2).** The second engine REJECT (DESIGN): gate teeth were
missing for 6 mutants; hard stop, parked. Also the burst 29 reviewer-run overlay test (pids 11656 / 11934) could not
be killed (kill refused by the classifier); it ended on its own, no rule recorded. Evidence: HISTORY b14, b29 (local,
untracked).

**#54 NUL-defense mutants need a host-probed shim.** The mutants (deopt-diff T1-tr-replaced-by-cat, Rf-tr-after-awk;
allocation-diff M10) probe the host awk and, when NUL-clean, run under `test/nul-awk.mjs`, a PATH shim awk that cuts
each record at its first NUL as BSD awk does (maintainer ruling Q-CI-5). Evidence: CHANGELOG "CI on Linux" line 430-
436; `test/nul-awk.mjs`.

**#55 `npm test` copies need `.git` (burst 38).** The first CI-view copy lacked `.git`: about 170 history rows
skipped (1574 tests run). Rule: private copies include `.git`, excluding only `.handoff` and `.DS_Store`. Evidence:
HISTORY b38 (local, untracked); memory `npmtest-copy-needs-git`.

**#56 Deterministic-tier test that "died" at 193 s with no failing subtest (burst 19).** `ic-diff.test` died; not
reproduced in 4 runs; cause not recorded. Rule: in the DETERMINISTIC tier this is a test bug, never "re-run it".
Related, burst 27: a test file died silently (OOM and timeouts ruled out; cause OPEN); the spec reporter hides the
signal and sync files buffer events, so a death-reporter plus death-signature gate (7 tests) was added. Evidence:
HISTORY b19, b27; `.handoff/evidence/b27/u2-file-death-investigation.md` (local, untracked); CHANGELOG lines 663-670.

---

## E. Process lessons

**#57 Nested `.git` under `audit/` breaks WebStorm (2026-11-05).** A reviewer's repro left broken nested git repos
(bytecode-budget B21); the git panel errored. Rule: build repros under `mktemp -d` and delete, or rename `.git`
after use. Evidence: memory `audit-nested-git-webstorm` (local, untracked).

**#58 Cross-lane `pkill -f` by pattern (burst 39).** A lane's `pkill -f` killed the sibling lane's first deopt-diff
run (redone). Rule: never pkill by pattern; kill only self-started PIDs; stated in every later brief. Evidence:
HISTORY b39 (local, untracked); memory `lanes-no-pkill-pattern`.

**#59 `GIT_EDITOR` leaks into tests (burst 9).** An emulated git < 2.32 test row passed only because the agent shell
had `GIT_EDITOR=true`. Rule: git-spawning tests pin or strip editor env; run with and without. Evidence: memory
`agent-harness-git-editor-leak` (local, untracked).

**#60 Private `mktemp -d` per lane (burst 18, 2026-11-03).** Two parallel coders shared scratchpad dirs; MANIFESTs
interleaved and `rm -rf` deleted peer files. Rule: every coder / reviewer brief names a private `mktemp -d`.
Evidence: memory `parallel-coders-private-tmp` (local, untracked).

**#61 Coder edited the live root during its own test run (burst 26).** The edit landed 9 s into the run; the run was
discarded and the reviewer's clean run was 149/149. Rule: test on an overlay or frozen copy, never the live tree.
Evidence: HISTORY b26 (local, untracked).

**#62 Park rejected diffs against the overlay base, not HEAD (burst 6, 2026-11-02).** A first-cut reset to HEAD would
have wiped the approved uncommitted B1 (same file as rejected B2). Rule: park with `--base <overlay>/base`. Evidence:
`~/.claude/LESSONS.md` (outside the repo).

**#63 A literal REJECT gets one in-burst fix round (burst 7, 2026-11-02).** Burst 7 stopped at ~150K tokens on a
literal engine REJECT with a one-line fix; a design REJECT still stops. Evidence: `~/.claude/LESSONS.md` (outside
the repo).

**#64 The git guard scans heredoc text; sweepers are one-criterion and cannot Write.** Writing a file whose content
merely mentions a history-changing verb via heredoc/echo is denied as a whole: use the Write tool, then `cp`. Two
3-4-criterion sweeps returned only SPLIT (burst 17); one criterion per sweeper, orchestrator saves tables. The
maintainer strips `Co-Authored-By` from `.handoff/COMMIT_MSG*.txt` (burst 29). Evidence: `CLAUDE.md` (Git section);
memory `haiku-sweeper-one-criterion`, `commit-msg-no-coauthor` (local, untracked).

---

## F. Open / known limits

**#65 O-2: bash 3.2 `set -u` exit 0.** Post-1.0, MAINTAINER DECISION; decided in b45
(RULINGS-b45-finding2.md Q-F2a / Q-F2b: fixed now, superseding the post-1.0 deferral). Evidence: `.handoff/NEXT.md`
lines 33, 74; mechanism (EXIT trap sees `$? = 0` on 3.2.57): `.handoff/research/post-1.0/RESEARCH.md:285-287`
(local, untracked). Closed by Q-F2a (b45) for the `set -u` fail-open: the EXIT trap now maps
rc 0 without FINAL=1 to 2 (CHANGELOG "Q-F2a (G-FINAL)").

**#66 MD-58: the `--v8-flags` allowlist checks a numeric value's FORM only.** `--max-inlined-bytecode-size=NaN`
(also `=/etc/passwd`, `=*`, `=2^53+1`) passes; real node exits 9 on every run and the tool fails closed later as
NO-VERDICT. Maintainer ruling: "Record as known". Evidence: CHANGELOG lines 421-423; ROADMAP.md:264.

**#67 The nul-awk shim cuts stdin only.** A file operand reaches the real awk as is; every NUL path the mutant rows
exercise is a stdin pipe. Evidence: `test/nul-awk.mjs` lines 10-17.

**#68 The 3.8 h allocation-diff "M18" local hang: cause not recorded (LEAD).** The Q-H1 `npm test` hung about 3.8 h in
the alloc M18 mutant row and the maintainer killed it; a rerun on a fresh copy took 862 s with M18 at 51 s (local
timings, REPORTED, one run). Evidence: `.handoff/evidence/b37-npmtest/qh1-killed-hang/` (local, untracked); HISTORY
b37.

**#69 The 2026-11-04 audits -- per-id status NOT mapped here (UNVERIFIED).** The five audits' findings are Phase 7
work; their per-id status lives in the audit chain and the b42 triage / rulings (`.handoff/RULINGS-b42-audit.md`
(local, untracked)), not in this ledger. Ids already closed by a ledger entry are named in entries #21, #22, #24;
`.handoff/RULINGS-b42-audit.md` rules on the bb and dd findings, plus alloc / ic under Q-ENV (alloc A2 / A6, ic I2 /
I6) and Q-DD4a (alloc A3 / A5).

**#70 G-SHLIB (b48), G-DDAWK (b50): dd audit argon 2026-11-07 -- A1a / A1b / A2 / A3 / A4 / A5 CLOSED, A6 OPEN.**
Closed by G-SHLIB (Q-SHLIB-A2, CHANGELOG "G-SHLIB"): A1a (logical `is_tracked` dir; STAGE_ABS_B / _A decoy, a
symlink before `..`) and A1b (`resolve_links`: a relative link in a symlinked dir) on bb and dd, A2 (`live_tops`
swallowing git errors, `2>/dev/null || true`) on bb and dd. Closed by G-DDAWK (b50, CHANGELOG "G-DDAWK"): A3
(DEOPT_AWK greedy tails, CR / `[` / `]`), A4 (`judge()` early awk `exit` under pipefail, in deopt-diff and
ic-diff; "consistent with" the Q-NIGHTLY flake, not proven its cause), A5 (TIER_AWK: a `@@LITE-MARK` line taken
for a position line). OPEN: A6 = hygiene (LOW), routed to FILLERS by orchestrator/SPOT-CHECK.md:35.
Leads for the D-4a inlining-budget-diff group:
(1) ibd A1a stays OPEN (its own logical `is_tracked`); (2) ibd's "--after not found" now reads as the `--before` git
failure when `--after`'s directory is missing (`refuse_live` runs first; fail-closed, wording only); (3) ibd runs
`mkdir -p "$OUT"` (inlining-budget-diff.sh:652) before `refuse_live` (:706), so a refusal leaves OUT behind.
Evidence: `.handoff/PLAN-b48-shlib.md`, `.handoff/evidence/b48-shlib/`, `.handoff/PLAN-b50-ddawk.md`,
`.handoff/evidence/b50-ddawk/` (local, untracked).

**#71 G-SHL3 (b50-b52): bb / dd audit B2a / B2b / B2c / B3 / N1 CLOSED or documented; residuals move to ibd U2.**
CLOSED by G-SHL3 (CHANGELOG "G-SHL3"): B2b (a symlinked `--after`: the repo around the END of its chain is now a
live toplevel; an unresolvable chain dies exit 2), B2c (widened: `--after`'s name joins the hard-link candidates),
B3 (an unwritable OUT is refused before any spawn or write; no truncated report), N1 (the fallback `is_tracked`
is physical; ibd includes lib/tracked.sh). DOCUMENTED (Class 3): B2a = `refuse_live` checks `--before` and the END
of its symlink chain, not the intermediate hops; B2c residual = a hard link under another name or in a
subdirectory stays undetected. OPEN until ibd U2 (ruled, Q-SHL3-R3; do not close here): devino `--` (a clean
`-`-led `--before` on ibd dies in devino's stat as "unexpected error (exit 1)": fail closed, wrong text),
resolve_links' `readlink || die` (class 3, reachable only by a race), `refuse_live` `dirname "$f"` / `"$p"`
`--`, ibd `cp "$f"` `--`, F16 entry `./` prefix; U2 also retargets / retires M-dash-revert + M-trap-off.
Test-gate lessons: (a) r2: a maintainer-ruled code change (A4's devino `--`) voided 3 existing mutants whose
oracle was the old stat failure, measured only after the fact because the "105+1 SKIP / 120" gate was run before
the change. (b) r3: a portable oracle validated against a build carrying a later-reverted change (A4) went red under
bash >= 4.4 emulation (shlib D1t), so a test oracle must be re-validated on the state that ships. Reviews: r1
REJECTED (DESIGN), r2 REJECTED (DESIGN), r3 APPROVED after one test-only fix. Real-Linux behaviour UNVERIFIED
locally (emulated; CI will show it).
Evidence: `.handoff/PLAN-b50-shl3.md` (A2, A3, A5), `.handoff/evidence/b50-shl3/` (local, untracked).

**#72 G-BBAWK (b50-b52): bb audit B1a / B1c / B4a CLOSED; B1b documented.**
CLOSED by G-BBAWK (CHANGELOG "G-BBAWK"): B1a (COUNT_AWK: a header after column 1 and a `Bytecode length:` line
with no header above it count bad), B1c (`tr '\000' '?'` on both probe branches, tee before tr), B4a (LIMITS_AWK
`/^  --/` reset; bb + ibd REPORTED limits). DOCUMENTED: B1b = driver output is trusted; a driver that prints V8
header text can forge a result. OPEN -> ibd triage: Opus N1 (ibd bytecode probe; to be closed by ibd U1 / U3, rulings
Q-IBD-2). Test-gate lesson: a plan's "anchors stay" claim checked only one substring; the stop gate caught a
sibling anchor (M-prefix-match) displaced by the spec's own text.
Evidence: `.handoff/PLAN-b50-bbawk.md` (A1, A2), `.handoff/evidence/b52-bbawk/` (local, untracked).
