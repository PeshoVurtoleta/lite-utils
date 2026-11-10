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
   #24, #26, #27, #29, #31, #93, #99, #107; gap #109 d)*
4. **Allowlist, never denylist.** A denylist of dangerous flags missed one (`--run`, `--prof`, `--report-*`,
   `--require-module`); the runtime V8 allowlist is the winner, and its one known gap is recorded, not hidden.
   *(#6, #8, #9, #22, #66)*
5. **Resolve once, to one absolute path.** Node is resolved once; a dash-led argument is a name, not an
   option; a logical `..` after a symlink is refused. *(#4, #21, #26, #27, #28)*
6. **Test the tests: every new gate must fail on the old code.** A row that passes on a timeout, a mutant that
   survives, or a control that is not reproducible is a defect in the test, never "re-run it". *(#36, #47-#53, #56, #94, #99, #100, #105, #108, #110)*
7. **Oracles must be portable across userlands.** BSD vs uutils coreutils, macOS awk (cuts at NUL) vs NUL-clean awk:
   accept every form or probe the host. *(#32, #39, #54, #99, #105)*
8. **`spawnSync` blocks the event loop, so a timer cannot fire.** Never judge a child timed out by a timer that
   could not have run; check the exit first. Size caps to the slowest CI leg, and `--test-timeout` to the slowest
   FILE. *(#40, #42, #43, #100)*
9. **A history pin must be reachable from a ref, and a CI view must include `.git`.** Otherwise it passes locally
   and dies (or silently skips) in CI. *(#11, #38, #55, #94)*
10. **Never kill by pattern, never share a scratch dir, never run a test on the live tree.** Lanes work in private
    `mktemp -d` dirs, kill only their own PIDs, and test in an overlay. *(#57-#61, #93)*
11. **A literal REJECT gets one in-burst fix round; a design REJECT stops the unit.** Rejected diffs are parked
    against the overlay base, never reset to HEAD. *(#25, #62, #63, #100)*

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
(bb, dd)" lines 693, 696; audit FINDINGS F1, F11 (local, untracked). ibd: was "open until the D-4a group lands"; closed by U1 (F1 / F11), which ran first (CHANGELOG "U1").

**#22 `--v8-flags` unchecked passthrough (FAIL-OPEN; F2, F15, A3, A5, B19, D4).** Flags that load code (`--require*`,
`--import*`, `--loader*`, `--snapshot-blob`), read files (`--env-file*`, `--experimental-config-file*`), run code
(`--eval*`, `--print*`) or write files ran inside the measured process. Fix: prefix-matched refusal before any spawn
(MD-39, 40, 42, 43, 44, 45), later the runtime allowlist (MD-50, see #6). Evidence: CHANGELOG "B-four" lines 787,
788; "allocation-diff.sh, external-audit group" line 827; audit FINDINGS (local, untracked). ibd: was "open until the D-4a group lands"; closed by U1 (F2 / F15) (CHANGELOG "U1").

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

**#86 G0 shared lib (b58-b59): four mechanisms, each caught by a review round or the first full `npm test`.** (a)
is_tracked T0.1, ruled and cross-checked in b57, still regressed: its `2>&1` put git's stderr into the NUL name
stream, so a tracked file read untracked when a core.fsmonitor hook printed on a successful ls-files (r1 blocker 1;
fix Q-B58-STDERR: `exec 3>&1; x=$(git ... 2>&1 >&3)`). (b) A fragment that starts reading a global must check that
every root assigns it first: die now writes into `$REPORT`, but bytecode-budget and inlining-budget-diff assign REPORT
late, so an inherited REPORT took writes outside `--out` (r2 blocker 1); `REPORT=""` in the prologue. (c) An
assignment ahead of the fail-closed trap is a fail-open window: that line sat above the trap, and `readonly
REPORT=...` through BASH_ENV made bytecode-budget exit 1 with no VERDICT (measured, r3 blocker 2; 57b93d1 exits 2);
the line now sits directly below the trap. `FINAL=""` has the same window on the base (measured in r3b with `readonly
FINAL=1` through BASH_ENV: #89 b). (d) An unconditional `set +o posix` turns expand_aliases off on bash 3.2, which
killed the `node` alias refusal of allocation-diff and ic-diff (five BASH_ENV alias rows red), caught only by the
first full `npm test` on the G0 diff; fix Q-B59-POSIX-COND: `[[ ! -o posix ]] || set +o posix`. Evidence:
`.handoff/RULINGS-b58-g0.md`, `.handoff/evidence/REVIEW-b58-g0-r1.md`, `REVIEW-b58-g0-r2.md`, `REVIEW-b59-g0-r3.md`,
`REVIEW-b59-g0-r3b.md` (local, untracked).

---

**#90 G1 bytecode-budget (b60): six mechanisms and what proves each.** (a) R2 regular file (Q-B57-PIPE): proved by the
A1 rows of test/audit-g1.test.mjs (a fake logging `[ -p /dev/stdout ]`: 0 pipe lines, with and without --out; relative
TMPDIR; TMPDIR a regular file) and the real BB-opus-1 row (each of 3 attempts exit 1 OVER or a torn-record NO-VERDICT,
never WITHIN; the old root is red on that row; its ff6108b twin, local only, pins the old WITHIN). (b) R5 no-flush
(Q-B57-C1): A2 rows (fake argv: baseline and both probes carry the token after every --v8-flags token and before
--print-bytecode; exact mode line), the real `mid` row under `--expose-gc --stress-flush-code`, mutants M-len and
token-before-flags. (c) R3 baseline (Q-B57-BB2): A3 rows (fake `*` printing `get`; five shim rows: exit 3, zero
headers, tr, awk, mktemp failing on the baseline call only; spawn counts 10 for a 3-fn report, 8 for a 1-fn diff, 2 on
a mismatch). (d) Q-B60-TMPFULL append: A6 rows under `ulimit -f` with SIGXFSZ ignored (`append exited N`, 0 `driver
exited`, raw/ bytes equal the fake's output) and a drop-append must-fail control. (e) R22 / R23 / R26 refusals
(Q-B57-MINOR), R24 text (Q-B57-DOC): A4 rows, 0 spawns each. (f) Precedence and anchoring contracts: five MUT rows
(see #91). The repro rows BB-opus-1 .. BB-opus-6 are GREEN on the index-only copies (orchestrator-reported). The
reviewer (r1b, APPROVED) built the five mutants with its own edits: each turns exactly its own pin row red. Evidence:
`.handoff/RULINGS-b60-g1.md`, `.handoff/PLAN-b60-g1.md`, `.handoff/evidence/REVIEW-b60-g1-r1.md`,
`REVIEW-b60-g1-r1b.md`, `NPMTEST-b60-g1-r1b.txt`, `.handoff/evidence/GATE-b60-g1.txt` (local, untracked).

---

**#93 G2 deopt-diff (b61): six mechanisms and what proves each.** Hex labels in #93-#94 are sha256/8 of the named file, not commits: before build = commit ff6108b / sha256/8 050e01e1 (frozen); 8eb49219 = the B1 root; 114324af = the r1 root (src ea07f9d5); 2ce1d32e / 95364e21 = the final roots after r2. (a) R2 regular file (Q-B57-PIPE): run_side writes
the driver's output to one `mktemp "${TMPDIR:-/tmp}/deopt-diff.XXXXXX"` file per run, read through tee | tr | awk with
the `@ n t r a` status line kept; a `mktemp N` token reads "cannot read driver output in run k (mktemp exited N)".
Proved by audit-g2 A1 (a fake logging `[ -p /dev/stdout ]`: 6 file, 0 pipe, 8 spawns, with and without --out; relative
TMPDIR; TMPDIR a regular file) -- A1 is the R2 row run on the before build (r1 review and the B1 proof rows, before build: 6 pipe, TMPDIR-file row exit 0 SAME) --
A2 (retention: 6 mktemp calls per invocation, 54 logged over 9, 0 left; a no-`rm` mutant leaves 54) and A8 (real node,
the b57-rpipe pair, 3 attempts: never exit 0 / SAME; no old-code tooth of its own, its drivers are inlined strings).
MEASURED demonstration, not a gate (macOS, bash 3.2.57, node 26.8.2, host PRELIMINARY, load1 2.45 -> 2.54 before and
2.42 -> 2.79 after (r1 root) and 2.77 -> 2.18 final, not under the quiet lock, 8 rounds each): before build ff6108b / 050e01e1 gave 4 wrong SAME, 4 NO-VERDICT, 0
DIFF; the r1 root 114324af gave DIFF 7, NO-VERDICT 1 ("bailout: torn trace line"), 0 wrong SAME; the final root 2ce1d32e gave DIFF 6, NO-VERDICT 2 ("bailout: torn trace line" and "bailout: after code tier"), 0 wrong SAME (`RPIPE-b61-before.txt`,
`REPRO-b61-after.txt`, `REPRO-b61-final.txt`). (b) T2.6 Q-B60-TMPFULL: 64 KiB appended after the read; precedence awk > tr > tee > append >
driver exit; proved by A7 under `ulimit -f 32` with SIGXFSZ ignored (`append exited N`, 0 `driver exited`, raw/ bytes
equal the fake's output; a driver rc 3 still reads `append exited N` (append before driver exit) and a tr exit 6 keeps `tr exited 6` (tr before append)) and three mutants (drop the append, drop the
`!= *' '*` guard, append before the precedence line). (c) Q-B61-DD-TRAP: one chained EXIT trap removes the temp file on
every exit path (residual: #95 b) and runs the script's fail-closed trap after it; proved by A3 (SIGTERM during the 3rd driver run:
TMPDIR empty, stderr `unexpected error (exit 143)` on bash 3.2 (bash 5 prints `(exit 0)`, see #106), exactly one
VERDICT NO-VERDICT), the a3-noold mutant (drop `$old`),
the no-rm mutant (leaves exactly 1 file) and deopt-diff-stage-boundary row 12; SIGTERM / SIGINT / SIGHUP to the process
group during run 3 MEASURED by reviewer r1 (macOS bash 3.2) on the r1 root 114324af and base 050e01e1 (TMPDIR empty, one VERDICT line; the r1 root reported (exit 143 / 130 / 129), base reported (exit 0)). (d) R7 / Q-B61-DD-GLUE / Q-B61-DD-TORN2: a torn `[bailout (kind: ` line is X "bailout: torn trace
line" for every fn: at line start when it is not a whole bailout line or holds a second head after column 16; glued
after other text (a `[bailout end. ..` prefix included, no line-start exclusion) when the text from the head is not a
whole bailout line or holds a second head; a glued WHOLE bailout keeps its old path. Proved by self-test rows (the plan's labels (a) (f)
(g) (h)) and audit-g2 A4 (+ controls and the guard mutant), A11, A12, A12-glued, A13, each with a mutant that turns its
own row red (drop the T2.2 second-head term: row (g) + A12; drop the glue second-head term: row (g) + A12-glued;
restore the r1 `substr($0, 1, 8) != "[bailout"` conjunct: row (h) + A13). Argued, not run, by reviewer r2: in any
interleaving of two or more writers the earliest head is followed by a second head or by text that fails the full
shape, so at least one line is refused for every fn. (e) R6 kConcurrent: a `[compiling method ` line with `, mode:
ConcurrencyMode::kConcurrent` is X "background compile (...)" for every fn, and any `*stress-concurrent-inlining*`
flag (every spelling, `--no-` included) is refused before any spawn. Proved by audit-g2 A5 (R2 fake exit 2; a compile
line naming `other` still blocks add; R3 kSynchronous plus `[marking .. kConcurrent` stays SAME; the name refusal rows
0 spawns) and the whole-condition mutant (widened to index($0, "ConcurrencyMode::kConcurrent")): R3 turns NO-VERDICT
and the canned self-test rows go red; repro rows cross-opus R1 R2 R3 and DD-fable-2 GREEN on the r1 root 114324af and on the final root 2ce1d32e (`REPRO-b61-final.txt`). (f) R26 `=` in the resolved
node path refused, 0 spawns (A6); R24 / R25 are -h sentences (A9: `closes fd 1`, `nearest package.json above DIR`;
DD-opus-3 GREEN on 114324af and on 2ce1d32e, DD-fable-1 RED by design). Parity: golden vectors from the frozen before build 050e01e1 (B1 stage,
root 8eb49219 / src d5d76e75): self-test and fixtures output (99 / 116 ok), and the SAME, DIFF and NO-VERDICT reports
and raw/ trees, byte-identical; the other four roots unchanged (`.handoff/evidence/GOLDEN-b61-g2/`); on the final root 2ce1d32e gold.sh is byte-identical to GOLDEN-b61-g2/after, which equals before/ (`REPRO-b61-final.txt`). Counts: self-test
99 -> 107 checks, fixtures 116 -> 124 (exact pins), audit-g2 37 rows, the deopt-diff / -boundary / -stage /
-stage-boundary pins re-pinned, final-trap's deopt-diff raw `exit 0` census 18 -> 19. `npm test` (final tree): 2671 tests, 2663 pass, 0 fail, 8 skip (one run on the final tree in a private copy with .git, quiet lock, host PRELIMINARY, load1 1.73 -> 6.14) (`NPMTEST-b61-g2.txt`).
Roots after r2: deopt-diff.sh 2ce1d32e, src 95364e21; build.sh regenerates every root byte-identical (reviewer r2).
Evidence: `.handoff/PLAN-b61-g2.md`, `.handoff/RULINGS-b61-g2.md`, `.handoff/evidence/REVIEW-b61-g2-r1.md`,
`REVIEW-b61-g2-r2.md`, `REPRO-b61-before.txt`, `REPRO-b61-after.txt`, `REPRO-b61-final.txt`, `RPIPE-b61-before.txt`,
`NPMTEST-b61-g2.txt`, `NPMTEST-b61-g2-prereview.txt` (local, untracked).

**#96 G5 inlining-budget-diff (b62): mechanisms and what proves each.** Hex labels in #96-#98 are sha256/8 of the named
file, not commits: before build = commit 7c91d1c / ibd root dc5927cc (frozen in `.handoff/frozen/b62-g5/`); 2e94e012 /
d195e254 / 0d8929b7 = the 5a roots reviewed by r1 / r2 / r3 (0d8929b7 = after the r2 fixture fix); 74c2fcb5 = the final
ibd root (src 520b96e3); lib/modes.sh 6b384de8; lib/v8probe.sh 41a3ec9b; bytecode-budget.sh f1070535 (before e0cfec2a).
(a) R12 (Q-B57-C1): five `takes no value` guards (-h|--help, --self-test, --only-fn, --concurrent, --no-bytecode);
proved by audit-g5 A1 (exit 2, 0 spawns; old root: `--fn g --only-fn=0` exits 0 SAME, `--help=x` prints usage) and a
mutant per guard. (b) R10 (Q-B57-C1): the six-name GIT_* block in lib/modes.sh (ref / file mode only) and a subshell
unset around the self-test's git init / add / refusal spawn; proved by A2 (each of the six names, ref twin, driver-mode
control still prints a verdict, self-test under GIT_DIR exits 0 with the target repo's ls-files count unchanged; old
root: 5 rows exit 0 SAME, self-test FAILs) and the mutants (drop `${GIT_CEILING_DIRECTORIES+x}`, unconditional block,
drop the self-test unset); TASK 0d MEASURED the old self-test under GIT_DIR: 7 FAIL, 47 ok, ls-files 1 -> 3. (c) R11:
two `-ef` lines, proved by A3 (old root: 3a exit 1 DIFF, 3b exit 0 SAME). (d) R16 / R18 / R26 (Q-B57-MINOR): `--out`
backslash incl. the relative-cwd clause, empty `--tiers`, `=` in the node path, proved by A4 (0 spawns, OUT absent,
absolute-OUT control) and A6 retention (20 cycles leave raw dec bud ms stage and a 0-byte report.txt; 20 cycles of each
A4 refusal add 0 entries). (e) Q-B57-TIERS: audit-g5 "A5 Q-B57-TIERS" removes the tiers line from a root copy (one-match
anchor) and asserts exit 0 SAME with zero measured runs; on CI linux it FAILs unless /bin/bash is >= 4.4; local bash 3.2
skips with the reason; the class 1 claim waits for the first CI run (#98 d). (f) R4 sibling (Q-B57-BB3): the
lib/modes.sh driver check is the lib/stage.sh comment-aware awk (STAGE_IMP=./Signal.js, stdin); TASK 0b reproduced the
wrong SAME on real node first (`.handoff/evidence/b62-g5a/VERDICT.txt`); proved by the self-test's `cdrv.mjs` fixture
(`//` line, a 4-line JSDoc block naming the import, a plain string, an absolute-path import; expected `2|1/2|0`) and six
reviewer mutants (r1 m1 m2 m5, alt1, alt2, alt5; each red on the comment row only, r3) plus the MUTANTS row
driver-import-block-ends-at-eol. (g) Q-B62-FLAG: name refusal for `*stress-concurrent-inlining*` (every spelling,
`--no-` included) and the NO-VERDICT on a kConcurrent compile line without `--concurrent`; proved by A7 (old root runs
both flag forms; the same canned trace gives a verdict without the check and with --concurrent; a trace whose only
kConcurrent text is `[marking` stays a verdict, which a whole-line mutant turns red). MEASURED (TASK 0c, real node
26.8.2): compile-line kConcurrent 0 without the flag (3 direct runs); with `--stress-concurrent-inlining` 8-10 in 3
direct runs and 7-9 in 8 tool runs; `--concurrent-recompilation` is harmless (the trailing --no- wins). A wrong verdict
from the flag was ARGUED, not shown (10 of 10 tool runs still refused on the glue check; one direct run had no glued
line). (h) R9 (Q-B62-ADDR): addr() collapses a `0x<hex>` only after line start, a space, `{` or `(` (the only contexts
in all 22 census logs: space 563, `{` 57, reviewer r2); proved by A1 R9 (`h0x1` vs `h0x2` DIFF, `h0x1` self-pair SAME,
the exact line `a_0x1$0x2.0x3h0x4k90x5`, a Maglev pair) and a non-ASCII row (self-test, src:596: `<e-acute>0x1` vs
`<e-acute>0x2`, U+00E9 as UTF-8 bytes, a DIFF, the 0x kept) and the mutants addr-class-rule, addr-always-collapse,
addr-no-space, addr-no-brace. (i) R15 (Q-B57-COMPILE): the `D` event, ukey() = `<JSFunction ` through `(target X)` plus
` OSR` (checked against the first cut rule on the 14 concurrency-off logs of b62-g5b/0b/raw: 76 compile and completion
lines, 39 + 37, 0 key mismatches; the 22 logs hold 154 such lines, and the 8 concurrency-on logs are not part of that
check); proved by A2 (a) .. (d) (HEAD exit 2 "no trace of m0"; a MAGLEV-only compile, an `[aborted optimizing` unit and
another function's completion each exit 2; budget.turbo.tsv byte-identical to HEAD) and the mutants done-any-tier,
accept-`[aborted`, drop the key compare. CENSUS (real node 26.8.2, `.handoff/evidence/b62-g5b/CENSUS.md`): Maglev prints
`[completed compiling ... (target MAGLEV)`, the OSR suffix follows `(target X)` on both lines, an aborted unit carries
the compile's key and prints no completion, and with concurrency off no unit has another `[` line inside it. (j) R2
(Q-B57-PIPE, Q-B60-TMPFULL): the probe is a mktemp regular file plus 64 KiB append, precedence awk > tr > append > node;
proved by A3 (2 file / 0 pipe per --fn, old root 2 pipe; 9 runs log 18 mktemp calls and leave 0 files, a no-rm mutant
leaves 18) and A4 (relative TMPDIR, TMPDIR a regular file, `ulimit -f 32` with SIGXFSZ ignored -> `(append exited N)`,
an awk shim -> `awk exited` with one VERDICT line). (k) Q-B62-TEAR / TEAR2: BYTECODE_AWK strict record shape (header
whole, length exactly `Bytecode length: <digits>`, no header without a length, no length without a header), proved
against bb's 23 real fixture pairs (must equal COUNT_AWK; an anonymous header `function: (0x...` stays whole), TR1-TR5 /
R4d rows and must-fail mutants; A5 real held pipe accepts `3,50`, a `?` on a side, or a glue-check / kConcurrent
NO-VERDICT with exactly one VERDICT line, never a short list without `?`. MEASURED: before, 28 of 180 file-mode probe
runs damaged, 26 read `3` with no `?`; after, 180 runs 170 `3,50`, 10 `?`, 0 short (`b62-g5b/a5-probe-matrix.out.txt`,
`b2b/`). Parity: golden vectors from the frozen before build (`b62-g5a/goldens-dc5927cc`, `b62-g5b/goldens-0d8929b7`;
deltas explained by the new refusals / D rows); reviewers rebuilt all five roots byte-identical with build.sh. Audit
repros (Q-B62-REPRO, unmodified copies): REPRO-b62-before.txt had 22 RED rows (fable 1-3, opus 1-3 5-7, cross 1a 1b 2 x5
3a 3b 5 x4); REPRO-b62-after5a.txt left fable-1, opus-1, opus-6, cross 1a 1b RED (the 5b rows); REPRO-b62-final.txt: all
GREEN on 74c2fcb5. Counts: self-test 54 -> 85, audit-g5 43 `test(` calls. Evidence: `.handoff/PLAN-b62-g5a.md`,
`PLAN-b62-g5b.md`, `RULINGS-b62-g5.md`, `evidence/REVIEW-b62-g5a-r1.md` .. `-r3.md`, `REVIEW-b62-g5b-r1.md`, `-r2.md`,
`REPRO-b62-before.txt`, `REPRO-b62-after5a.txt`, `REPRO-b62-final.txt`, `NPMTEST-b62-g5a-prereview.txt`,
`NPMTEST-b62-g5b-prereview.txt` (local, untracked).

**#99 G3 allocation-diff (b63): five mechanisms and what proves each.** Hex labels in #99 .. #101 are sha256/8 of
the named file, not commits: before build = commit 7c91d1c / allocation-diff.sh e0b55101 (frozen in
`.handoff/frozen/b63-g3/`); final root 195242d9 (src cde0ad19, was 056870fc); gcn.cjs heredoc 279a5f87 -> 2089e91f.
(a) Q-RL-PRETEN pin + refusal: TRACE_FLAGS gains `--no-allocation-site-pretenuring` (head line, spawn argv, A14(e));
`*allocation-site-pretenuring*` in `--v8-flags` is refused before any spawn. Proved by self-test row 81 (3 spellings
run: `--`, `_`, `--no-`; the glob covers every spelling, 0 spawns, 0 mktemp, the die line once), the live row L1 of
test/allocation-diff.test.mjs (a pretenurable literal driver, `--zero --runs 3`, 3 invocations: each exit 1 or 2,
never ZERO, run 1 young >= 1) and its teeth twin (the root minus the pin reads exit 0 VERDICT ZERO, and L1 fails on
it), the control L2 (no allocation in the window: ZERO, young 0,0,0), and mutants M-preten-pin (row 33) and
M-preten-arm (row 81). MEASURED on v26.8.2: before the unit young 0,0,0 exit 0 in 3 of 3 (golden-before.txt); after
young 19,19,19 exit 1 (b1-gate.txt). (b) R6: the `*stress-concurrent-inlining*` refusal, proved by row 80 and
M-r6-arm; a reviewer sweep of all 754 V8 bool flags on v26.8.2 (each + the pins + --print-flag-values) found only the
two stress-concurrent-inlining flags flipping a pin (concurrent-recompilation true despite its `--no-` pin) and none
re-enabling pretenuring. (c) R8: ycount / the old count in awk, no grep in the run path; proved by row 83, the live
row A7 (`GREP_OPTIONS=-P`, grep -c exits 2: D-YOUNG still exit 1 NONZERO, old 0) with revert check, mutants M-r8 /
M-r8o (M-r8o is verdict-equivalent: the judge reads O records with awk; row 83 catches it through the counts line,
'old 0' read as 'old '), and audit-g3 A6 / A7 (red on the frozen root; A2 kills mutant MB, #101 d). (d) R20:
`if (!require('worker_threads').isMainThread) return;` in the guard preload; proved by row 15 (A14 byte pin) and
M-worker, the live row A8 (D-WORKER, a Worker allocating in the window, `--zero --runs 2`: exit 2, "the guard did not
count", never `@@LITE-MARK gcn`) with revert check (M-worker reads `@@LITE-MARK gcn before @@LITE-MARK end`, as the
before build did), and the control A9 (D-FORK: exit 2 "@@LITE-MARK gcn given twice" on the root and on M-worker). (e)
R26: `*=*` on the resolved node path refused after the newline check (the G2 template, deopt-diff.sh G2 line pair);
proved by row 82, M-r26 and audit-g3 A5 / A5b (relative `--node` in an `a=b` cwd; the A5b mutant on NODE_RES and the
frozen root go red). Tier: the new live rows are DETERMINISTIC (GC counts, no clock); PLAN-b63-g3 ADDENDUM A2.
Parity: build.sh regenerates the root byte-identical; the other four roots equal HEAD; `--self-test` rows 1-79 equal
selftest-before.txt (only A14's label differs); `exit 0` census 12 -> 12; 83 ok x 5 runs. Counts: self-test 79 -> 83,
audit-g3 13 `test(` calls (18 rows at r2 incl. the controls A2 / A3 / A9, per REVIEW-b63-g3-r1.md), `npm test` lane copy
(PRELIMINARY host, pre-review run, before the r2 test fix; the integrated run belongs to the integration step) 2710
tests, 2702 pass, 0 fail, 8 skip. Evidence: `.handoff/lanes/g3/PLAN-b63-g3.md`, `.handoff/RULINGS-reading-2026-11-10.md`
(Q-RL-PRETEN), `.handoff/RULINGS-b57-audit.md` (R6, R8, R20, R26), `.handoff/lanes/g3/evidence/golden-before.txt`,
`b1-gate.txt`, `b2-gate.txt`, `NPMTEST-b63-g3-prereview.txt`, `REVIEW-b63-g3-r1.md` (local, untracked).

**#102 G4 ic-diff (b64): four mechanisms and what proves each.** Before build = commit 7c91d1c / sha256/8 11279540
(frozen, .handoff/frozen/b64-g4/; src b49e1374); 5142d62a = the B1 root (before B2's -h line, src :64); 09fb5c15 (src
020cecb0) = the r1 root; 50a6fc34 (src f1568ac8) = the final root after r2. (a) R13 `%` in the run dir
(Q-B57-MINOR, Opus form): V8 expands `%p`, `%t` and `%%` in --logfile, so a run dir holding a `%` (`--out DIR` or
TMPDIR) wrote the trace to a different path and the run read `no IC log` (NO-VERDICT, fail closed). run_side now does
`( cd "$2" && rd=${rd//%/%%} && exec ... "--logfile=$rd/run.log" ...)`: the doubling lives in the trace subshell's
copy, so the parent's `$rd` stays raw for the glob, mv and awk, and it costs no fork on the hot path (a bash builtin
substitution). Proved by self-test rows 77 (`--out $d/o%pz%%q`, argv anchor `--logfile=${d//%/%%}/o%%pz%%%%q/raw/`,
run.1.log kept, 6 argvs) and 78 (TMPDIR `t%p`, 0 entries left), whose fake node expands `%%` / `%p` as V8 does, so the
before build fails both; and by audit-g4 A1 (`o%pz%t%%q`, TMPDIR `t%p%t%%`, argv 4 of 4 doubled, with the real node).
Mutants: M-pct and M-pct-parent (77, 78), M-pct-first `rd=${rd/\%/%%}` and M-pct-p `rd=${rd//%p/%%p}` (77 only: measured
by hand on the final root 50a6fc34, red on exactly [77], row 77 `2|VERDICT NO-VERDICT|9|0|0|0` against the head's
`0|VERDICT SAME|9|0|1|6`; the test gates at-least rows). (b) R14 relative TMPDIR: the private log dir is resolved
once after the -d check, `IC_ABS=$(cd -- "$IC_TMP" && pwd) || die ...; IC_TMP=$IC_ABS`, so every `--logfile=` is
absolute; no new leak window (the main shell never cds, the EXIT trap's rm -rf is valid either side). Proved by row 79
(TMPDIR `../tmp` from a cwd: 6 argvs `--logfile=/`, 0 entries left) and audit-g4 A2; mutant M-abs (79). (c) R26 `=` in
the resolved node path: one die line after the NODE_RES resolve, text byte-identical to dd / bb, before any node spawn;
exit 2, 0 spawns, 0 mktemp, on `--node DIR/a=b/node` and on a bare node found via PATH. Proved by row 80 (both routes)
and audit-g4 A3; mutants M-eq (line -> `true`) and M-eq-bin (tests NODE_BIN instead of NODE_RES; the PATH route kills
it) (80). (d) R6 name guard (Q-B57-FLAG): a first case arm `*stress-concurrent-inlining*)` in the --v8-flags
allowlist refuses every spelling (`_` / `-`, `--no-`, `--v8-flags=`), exit 2, 0 spawns. Proved by row 81 (three
spellings; the before build refuses with the allowlist text after 2 spawns) and audit-g4 A4 (the before build ran
`--stress-concurrent-inlining` to rc 0 SAME, 7 spawns at --runs 2, on audit-g4's fake node: a wrong ic verdict under
the flag is argued from R6, measured only for deopt-diff); mutants M-sci (delete the arm) and M-sci-exact (arm -> the
one spelling) (81). Arm order is not pinned: no other arm matches any spelling, an order mutant is EQUIVALENT
(reviewer r1: "scilast" survived, confirmed). -h names the `=` refusal, the flag refusal and the `%%` rule; the
newline-refusal -h line is split into three to name the = refusal (no other existing line changes). Parity: golden
G1-G4 from the frozen root against the B1 root 5142d62a, on real node: byte-identical: report.txt, rc, stdout and the
argv log with and without --out; the self-test keeps rows 1-76 and adds 77-81; -h differs by that split line and the
inserted lines (evidence/golden/PROVENANCE.txt, node 26.8.2, load1 2.27). Self-test 76 -> 81; the before build fails
exactly rows 77-81 (mut-b1-OLD.txt, B1 root 5142d62a; r1 revert-all on the r1 root 09fb5c15); the fake's `%` expansion
causes only rows 77-78 to fail on the before build, not 79-81. test/ic-diff.test.mjs C 76 -> 81 with 9 new mutants; its
assertKilled requires the listed rows to fail (at-least rows); "each red on its own rows only" was measured by hand:
7 mutants by mut-b1 on the B1 root 5142d62a (mut-b1-a.txt, mut-b1-b.txt), M-pct-first and M-pct-p on the final root
50a6fc34. audit-g4 35 tests, each A1-A4 row with an OLD twin on `git show 7c91d1c:ic-diff.sh`; A5 parity runs OLD vs
fix; retention (12 cycles) has a must-fail control (EXIT trap's rm -rf deleted leaves >= 1 entry per cycle). Audit
repro (Q-B64-REPRO, REPORTED): before RED ICD-fable-1, -2, ICD-opus-1, -2, -3; the B1 root 5142d62a all six GREEN
(ICD-fable-3 GREEN throughout).

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
SIGKILL's cost: it kills bash only, so the step bash was running (the hung ic-diff node step) is not signalled and runs
on as an orphan; it can leave one stray `es-*` entry in the tmpdir on a row that is already red (the cap line names it),
so the separate E7 row at the end of the file can go red as a second failure of that run.
Evidence: those CI runs; `.handoff/evidence/b53-sigpipe/` (local, untracked).

**#105 CI triage (b65): four red rows, three causes.** Local darwin, bash 3.2.57, node 26.8.2. Fixes are test-only; no
tool changed. (a) Push run 42747170672 (G1 2704e41, ubuntu node 26.8.2 only): `bb-fillers A1 precedence` mutant half
named tr (tee exited 0 before the tr shim did). Cause READ from source, race not reproduced: uutils coreutils 0.10.0 tee
(Linux splice path) calls fcntl(F_SETPIPE_SZ, 1 MiB) on its stdout pipe, so the 400 KB pad (`'x\n'.repeat(200000)`) fits
and tee can finish first; the 4 ubuntu legs of run 42839354306 passed the same row. TEST DEFECT (law 6). Fix: pad
> 2x the pipe-max-size an unprivileged writer can set; new row `bb-fillers A1 pad` (fillers 25 -> 26). Gate lesson (r1
LITERAL REJECT): the row first pinned only the PAD_BYTES constant, so a mutant putting the old 400 KB pad back in
fakeNode survived; it now also reads the fakeNode trace.txt and asserts >= PAD_BYTES. Red with PAD_BYTES = 400000 and
red with the old pad in fakeNode (MEASURED). The uutils race itself is UNPROVEN until the next ubuntu run. (b) Nightly
42817727624 (G1 tree, both `node latest` legs): setup-node resolved `latest` to v27.0.0-alpha.0.0.0; audit-g1 A2 and A3
pass process.version as --node-version and bb refuses it (src/bytecode-budget.sh:852, `^v[0-9]+\.[0-9]+\.[0-9]+$`)
before any spawn: exit 2. Cause READ from the CI log and the source. Q-B65-NODEPRE (maintainer, "Skip rows, keep
refusal"): 4 rows skip with a named reason when process.version is not vX.Y.Z (A1 real BB-opus-1, its twin, A2 real flush, A3
gate half); the tool keeps refusing (fail closed). New A4 refusal row pins it: `--node-version v27.0.0-alpha.0.0.0`
-> exit 2, 0 spawns (audit-g1 64 -> 65); red on a bb copy whose version regex drops `$`, on a refusal-line delete, and
on a --version spawn before the refusal (MEASURED). (c) Push run 42839354306 (G5 c563ec0, all 4 ubuntu legs; macOS
green): audit-g2 A3 expects `unexpected error (exit 143)`. Cause READ from the CI log plus ARGUED: bash 5 runs the
fail-closed EXIT trap (lib/prologue.sh:9) with $? = 0 when SIGTERM ends it while it waits for the driver, then
re-raises SIGTERM (rc null, sig SIGTERM); stderr has `unexpected error (exit 0)`, exactly one VERDICT NO-VERDICT,
TMPDIR empty. bash 3.2 prints (exit 143) and also ends by SIGTERM (MEASURED locally, b65), so the signal check does not separate the bashes.
Q-B65-SIGTERM ("Test oracle per bash"): A3 keeps (exit 143) on bash 3.2; on bash >= 4 it asserts an `unexpected
error (exit N)` line, one VERDICT NO-VERDICT, TMPDIR empty, SIGTERM end; the widened mutant row (no `unexpected error
(exit N)` line, any bash) is red on the live tool (MEASURED). The bash 5 branch is UNPROVEN locally (no bash 5 /
Linux); open limit #106. Rule: oracles that name a shell- or userland-specific text probe the host or accept every
form (law 7; memory `ci-ubuntu-uutils-userland`). Counts: fillers 26/26, audit-g1 65/65, audit-g2 37 tests, 36 pass,
1 skip (opt-in A8), unchanged. Evidence: those CI runs; `.handoff/RULINGS-b65-ci.md`, `.handoff/evidence/b65-ci/`
(local, untracked).

**#107 G5c inlining-budget-diff (b65, Q-RL-TURBO / Q-B62-TL): four mechanisms and what proves each.** Before build
= commit f23b6c6 / root sha256/8 74c2fcb5 (src 520b96e3); after = root e297d240 (src 61a570cb); old for the gates =
7c91d1c / dc5927cc. Other roots unchanged; lib/ unchanged (lib/v8flags.sh stays as is: deopt-diff is stable under
Turbolev). Local darwin, bash 3.2.57, BSD awk, node v26.8.2 (V8 14.6.202.34). (a) Command line (ruling 1):
--turbolev and --turbolev-future, with `-` or `_` and any `=value`, are refused by exact name after v8fl_check and
before mkdir (exit 2, 0 spawns beyond node's two setup spawns, OUT absent). A glob `*turbolev*` was rejected: it
refuses --no-turbolev and --max-turbolev-inline-depth. MEASURED by the reviewer on real node: of 509 default-off
bool flags only these two turn Turbolev on (--future does not), so the exact-name arm leaves no gap on that node.
Proof: self-test row, audit-g5 gate rows red on 7c91d1c, mutants tl-no-cmdline-arm, `glob`, `before v8fl_check` (B1
mutants, spawns 0). (b) Default (ruling 2): tl_* awk rules read the --v8-options row of each flag from the same
capture (0 extra spawns); a default token counts only for its own flag, a header line containing `default:` is not
its default line, `--turbolev-future` under the --turbolev header reads `?`, CR is stripped, `true` / `false` count
as on / off. on -> die "Turbolev is on by default in this V8", any row but exactly on / off -> die "cannot read the
--turbolev default", both exit 2 before any driver spawn, every tier NO-VERDICT; neither flag listed -> off. Proof:
audit-g5 A3 rows (on, on-with-future, :738 deleted; controls unmodified and header absent); the CR strip and the
`true` / `false` arms by a BSD awk hand check only (no committed row, #109 c), mutants tl-no-default-on and `?`
read as off. (c) Tag mode (ruling 3): in the maglev tier, count dec lines whose unit matches
`/@TF(-OSR)?(#[0-9]+)?$/`; any count != "0" -> `=== maglev: NO-VERDICT -- N decision line(s) in TurboFan-tier (@TF)
units (Turbolev?)`, no "all decision lines:" list; an awk failure dies. The row proves the exact count (2 @TF lines
per before run + 1 @TF-OSR line per after run, x 2 runs = 6 lines, where `/@TF$/` would read 4). Proof:
tl-no-tf-unit-check and B1 mutants /@TF$/ (OSR variant DIFF rc 1) and unanchored /TF/ (control fn named TF
NO-VERDICT). MEASURED on the old twin (B0, real node): --turbolev null pair gave SAME with 11 @TF lines; new build
exit 2. (d) Doc truth (ruling 4): the budget regex accepts `^[Gg]enerated`; the V8 14.6 lowercase line gives `B
m0@ML regular 54 54` and `small 67 67`, no NOTE (old: 0 B rows plus the NOTE). -h and the Known limits were
reworded (the `Newer V8` sentence stays: the capital-G format is canned-sample only). Proof: budget-capital-g-only,
B1 mutants ^Generated and ^generated (self-test "newer-V8 regular_budget event" fails), a new -h phrase row. Rules
sit in FRONT of the shared LIMITS_AWK (#108 c). Counts: --self-test 85 -> 89 (the 4 new rows: v8-flags refusal, tl
default, @TF count, lowercase budget); audit-g5 73 -> 98 tests (25 new: 11 gate rows red on 7c91d1c, 8 controls
green, 6 old twins, one of them the real-node twin opt-in via LITEUTILS_REAL_HOLD=1, Q-B62-A5). Normal-run spawns
unchanged (9, cmp-equal to the 74c2fcb5 golden); census [2,5,{1,2,0,2}] unchanged. Evidence:
.handoff/evidence/b65-g5c/ (local, untracked); .handoff/PLAN-b62-g5c.md.

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

**#78 npm exports NODE into test children; a PATH-resolved fake node passes under `node --test` (b55).** The roots
default `--node` to `$NODE`, which npm sets for its scripts, so a row that puts a fake `node` first on PATH ran the
real node under `npm test` and failed only there (test/ext-audit-inl.test.mjs:285, T-U1, `PATH=bin:`). Rule: a test's cleanEnv for a root
drops `NODE` (its cleanEnv is at test/ext-audit-inl.test.mjs:57); run each new row under both `node --test` and
`npm test`.

**#87 G0: two test-gate lessons.** (a) A lib change that adds a fallback path can make old mutants verdict-equivalent:
after the inode sweep, `--icase-pathspecs` and `:(literal)` both read the old fixtures the same (the sweep finds the
file by inode), and the X1d hard link was refused as "git-tracked" before the check it pinned. Retarget each row to
what still differs (the git spawn count for `--icase-pathspecs`; a glob-named file that is a hard link of a tracked
file for `:(literal)`; the hard link in a subdirectory with the tracked file above --before's directory, outside the
sweep, for X1d) rather than delete it, and say in the row which part is now only a parity control. (b) A unit that
touches lib/ runs the FULL suite before its first review: G0 went two review rounds without one, and the posix line's
alias regression (#86 d) showed only at the first full `npm test`. Evidence: `.handoff/evidence/REVIEW-b59-g0-r3.md`
(local, untracked).

---

**#91 G1: defects and gate lessons the unit caught.** (a) A deterministic row asserting "3 of 3 OVER" on a driver that
holds a pipe went red once under full-suite load: a torn record gives NO-VERDICT, which is correct, so the row now
asserts the run is never WITHIN (measured once; the old root is red on the loosened row). (b) Reviewer r1 blocker 2:
five mutants of precedence and anchoring contracts survived every file (append hiding the driver exit, append hiding a
tool failure, append / node order swapped in base_list, the baseline checks moved above `n == 0`, `*"$fn"*`
unanchored); each got a pin row and a MUT control asserting the specific wrong text and the absence of the right one.
(c) r1 blocker 3: the newline refusal checked the given arguments only; a relative DRIVER or --out from a cwd with a
newline in its name forged a column-1 `VERDICT SAME` (T1.4 missed that route); the refusal now also covers `$PWD`. (d)
bash 3.2 counts `ulimit -f` in 1024-byte blocks outside posix mode (a limit is not in bytes). (e) A redirect-open
failure leaks past a `2>/dev/null` written after it on the same command (redirects apply left to right); the code
wraps the append in a brace group, `{ ...; } 2>/dev/null`. (f) `set -e` is cleared inside `$( )`, so every probe step
is guarded by hand with `||`. (g) r1 blocker 1: a row titled "local only" must skip itself under CI=true; its skip
clause tests CI_STRICT, or it runs on all legs. Evidence: `.handoff/evidence/REVIEW-b60-g1-r1.md`,
`REVIEW-b60-g1-r1b.md`; for (a) also `.handoff/evidence/NPMTEST-b60-g1.txt` (the pre-review run, rc 1, the one red
row) (local, untracked).

---

**#94 G2: defects and gate lessons the unit caught.** (a) Review r1 REJECTED (1 DESIGN + 2 LITERAL), one fix round
under the maintainer's waiver (Q-B61-WAIVE of the design-REJECT stop rule; a second REJECT would have parked the
unit); r2 APPROVED. (b) Two torn forms gave a wrong SAME on 114324af: a torn head followed on the same line by a whole
bailout of another function (the greedy `.*` matched it), and a torn head glued after a real `[bailout end. ..` prefix
(the glue rule's line-start exclusion skipped it); fixed by Q-B61-DD-TORN2 with the reviewer's text. The orchestrator's
by-reading assumption "only the main thread prints bailouts" was challenged by the reviewer's argument (not reproduced): V8 flags are process-wide
and a Worker isolate prints its own bailouts to the shared fd 1 in several PrintF calls; ARGUED from V8's printing,
NOT reproduced on real node. (c) The planner's widened-index A5 mutant was verdict-equivalent (the `[compiling method ` guard still keeps the
`[marking` line out, so widening the index alone changes nothing); only the whole-condition mutant is a tooth, and the
guard-only mutant is equivalent too (the `[marking` line has no `, mode: `): a mutant needs a row that can tell it apart before it counts. (d) audit-g2 A8
copied its drivers from the gitignored `audit/` tree: it passed locally and would die ENOENT on CI; a test never reads
an untracked path, the drivers are now string constants. (e) The drop-`$old` trap mutant survived r1: chaining the
fail-closed trap needs its own must-fail row (A3's stderr / single-VERDICT assertions and a3-noold). (f) The first full
`npm test` caught final-trap's deopt-diff raw `exit 0` census (18 -> 19): any new `exit 0` text in a root moves it;
that run (pre-review, private copy with .git, root 114324af, host PRELIMINARY, load1 6.44 -> 5.91): 2664 tests, 2655
pass, 1 fail, 8 skip, the one fail that census. (g) A SIGTERM during a run now ends `unexpected error (exit 143)`
(bash 3.2; bash 5 prints `(exit 0)`, see #106) where the before build printed `(exit 0)`; on bash 3.2 the trap's
`(exit $st_rc)` subshell also prints a cosmetic
`Terminated: 15 ( exit $st_rc )` (or `Hangup: 1`) line to stderr (reviewer r1: exit code and the single VERDICT line
are right). (h) Leads checked, no change: `grep -c ... || true` at the count sites feeds printed counts only; the
verdict is the d_ms comparison, so a grep exit 2 can blank a printed count and never move a verdict (by reading).
Evidence: `.handoff/evidence/REVIEW-b61-g2-r1.md`, `REVIEW-b61-g2-r2.md`, `NPMTEST-b61-g2-prereview.txt` (local,
untracked).

**#97 G5: defects and gate lessons the unit caught.** (a) 5a review r1 REJECTED (1 LITERAL): the comment-stripping
import check had branches with no row; three reviewer mutants survived the full self-test (block comments not stripped,
the `import|from|require` prefix test dropped, a block comment that never spans lines). Fix: fixture lines for each. (b)
Re-review r2 REJECTED (1 LITERAL): the 3-line block-comment fixture let alt5 (a block comment ends after its first inner
line) survive, so a JSDoc example naming the import would have passed. The maintainer waived the second-REJECT stop once
(Q-B62-WAIVE); the fixture became a 4-line JSDoc block plus the MUTANTS row driver-import-block-ends-at-eol; r3 APPROVED
with six reviewer mutants each red on the comment row only. Lesson: a multi-line construct needs a fixture longer than
the shortest mutant that ends it early. (c) 5b: the first TEAR rule ("an empty header name is torn") turned 10 of bb's
23 real fixture pairs into `?`, because V8 prints an anonymous function's header as `function: (0x...`; found by B2b
against the real fixtures, amended by Q-B62-TEAR2 (strict record shape, anonymous allowed) and pinned by an
anonymous-header control row; 1 of 18 real attempts under the first fix still read `3,50 -> 3`. (d) 5b review r1
REJECTED (2 DESIGN): addr() erased a `0x` after a non-ASCII identifier byte under LC_ALL=C (a wrong SAME for names
differing only there), fixed by Q-B62-ADDR; and the tear residual was wider than Q-B62-TEAR2 said (Q-B62-TEAR3 reworded
it, #98 a). One fix round under Q-B62-WAIVE2 (plus the NITs: DONE_AWK anchored on the function and tier, "no completed
<tier> compile of it", a stale TODO comment); r2 APPROVED. (e) Lesson: a ruling's stated residual is a claim to measure
-- the reviewer's BSD awk repro found cases the ruling text missed. (f) The 5a pre-review `npm test` caught one fail,
the deopt-diff-boundary teeth-parity pin on the ibd root (moved by G5), re-pinned with the frozen copy. (g) The 5b
pre-review `npm test` had 2 fails: the A5 real held-pipe row and its 7c91d1c twin hit the 180000 ms attempt cap (191 s
and 291 s rows) under full-suite parallelism; both failed by the cap, not by an assertion (reviewer r2 saw 26 spawn-cap
fails at load1 ~30, no assertion failures). The final tree run (after Q-B62-A5 made the A5 pair opt-in,
`LITEUTILS_REAL_HOLD=1`, never in `npm test`, and Q-B62-A8 did the same for G2's audit-g2 A8, which ran over its 150 s
cap in 2 of 3 full runs on this tree; its cause is UNEXPLAINED (run 3 began on a quiet host, load1 1.41; dd root
2ce1d32e is unchanged by G5; alone it passes in 20 s): the opt-in takes it out of `npm test`, it does not clear it):
2823 tests, 2811 pass, 0 fail, 12 skip (private copy with .git, quiet lock, host QUIET); alone with the opt-in, audit-g2
37 pass and audit-g5 72 pass, 1 skip (the CI-only TIERS row). Lesson (the A5 pair, whose rows were over the cap inside
the full suite but pass alone): a real-node race row inside `npm test` is a timing gate in the DETERMINISTIC tier. (h)
The ext-audit-inl N1 `probe tr->cat` mutant became verdict-equivalent for a NUL in a header (the cut header is no longer
whole, `?` either way); a second fixture with a NUL inside a length line (`Bytecode length: 7\0 77`; tr gives `?`, cat
gives 7) restores the tooth. (i) Mutants confirmed equivalent by reviewer r2 (rc 0, no tooth: drop the line-start
context, drop `(`, revert DONE_AWK). (j) A shared lib change moves two roots at once: lib/v8probe.sh moved bb and ibd,
so the parity pins and mutant anchors of both were re-swept (the shared-fragment lesson). Evidence:
`.handoff/evidence/REVIEW-b62-g5a-r1.md` .. `-r3.md`, `REVIEW-b62-g5b-r1.md`, `-r2.md`, `NPMTEST-b62-g5a-prereview.txt`,
`NPMTEST-b62-g5b-prereview.txt` (local, untracked).

**#100 G3: defects and gate lessons the unit caught.** (a) Review r1 REJECTED (1 LITERAL, test-only): the audit-g3
A10 row capped the 83-row self-test (~60 script spawns) at 170000 ms; at load 32-35 it timed out on BOTH builds (head
170457 ms, frozen 171193 ms), so it flaked on the head and on the old root went red from the timeout, not from 79 vs 83
(law 8). Fix: cap 600000 (as test/allocation-diff.test.mjs); A3 `--runs 2` -> 3 (the assertion says 3 x A1); new A5b.
r2 APPROVED (full file 18/18 at load 13-24, A10 self-test 36.3 s against the 600 s cap). (b) R26 "resolved path"
had no row that fails when it breaks: mutant MA (`[[ "$NODE_RES" != *=* ]]`) passed self-test 82 and audit-g3 A5 (both
absolute paths); A5b closes it (relative `--node` in an `a=b` cwd; MA red). MA is verdict-equivalent (both give exit 2,
different text). (c) A literal pretenuring teeth row is a fact about V8 14.6 (node v26.8.2): the mutant twin gates on
node major 26 (any 26.x, e.g. CI's floating 26 leg, unmeasured there; measured on v26.8.2 only) and skips on other
majors, so a green skip elsewhere proves nothing about the pin; CI has to carry it (law 6). (d) Rows 1-79 stayed
byte-identical except A14's label (row 15), so a row-count move (79 -> 83) is checked by parity against the frozen
vectors, not by the count.

**#103 G4: defects and gate lessons the unit caught.** (a) Review r1 REJECTED (1 LITERAL, gate teeth), one fix round;
r2 APPROVED. The -h line promises every `%` is doubled, but every R13 vector held one `%p`; `rd=${rd/\%/%%}` (first
only) and `rd=${rd//%p/%%p}` survived (self-test 81 ok, audit-g4 A1 6/6 on fake and real node) and gave NO-VERDICT on
the real node with a relative TMPDIR `../t%p%t%%` from a symlinked cwd. Lesson: a gate for an all-occurrences contract
needs a vector with several `%` and a mutant per partial slip; fixed by `o%pz%%q` at four sites in row 77,
M-pct-first and M-pct-p, and audit-g4 A1 `o%pz%t%%q` / `t%p%t%%`. Reviewer r2's extra mutants (the pairs
`${rd//%%/%%%%}` and the triple `${rd//%/%%%}`) were caught by the new rows (77, 78). (b) The helper's first audit-g4
`verdict()` read stdout only; a refusal prints VERDICT on stderr, so 6 rows failed falsely. The orchestrator's run on
the new root caught it before review: a verdict helper reads both streams (a refusal is the common case in a refusal
gate). (c) Equivalent mutants the reviewer found: the R6 arm moved last (no other arm matches), and `cd -P` / `pwd -P`
for IC_ABS (both name the same dir; no row or contract pins logical vs physical spelling); a mutant counts only when a
row can tell it apart. (d) Review NIT (fixed): the M-pct-parent description said "cd then reads the doubled dir"; it
is the parent glob that reads it. (e) FILLERS #4 "two ic mutants survive": no source found by a scout or the planner;
the nearest lead (M-walk-dot / M-walk-x) is already killed by ext-audit N34 / N35. Recorded, no row planned. (f) A5's
retention runs 12 cycles, not the planned 20 (r2 ruling): a leak on these fake-node, signal-free paths shows in cycle
0 or never, and the must-fail control keeps its own 3. Open test-label NITs for FILLERS (r2, test-only): audit-g4 :173
label says `o%pz` but its body checks no argv; :204 still says `--out o%pz` (fix the label or add
`cnt(c.lfs(), (p) => p.includes('o%pz%t%%q')) === 4` to the OLD twin); :171 `/^o\d+z$/` can never fire (drop it or
the "no <d>/o<digits>z" in the :165 label); :35 a timing comment with no provenance (mark PRELIMINARY or remove);
test/ic-diff.test.mjs:462 comment credits mut-b1 for all 9 mutants. Evidence: .handoff/lanes/g4/evidence/
REVIEW-b64-g4-r1.md, REVIEW-b64-g4-r2.md (local, untracked).

**#108 G5c: defects and gate lessons the unit caught.** (a) The MUTANT `v8fl-check-after-mkdir` matched 0 times
(before B2 re-anchored it) once the task-1 --v8-flags block sat between `v8fl_check` and `mkdir`: a mutant whose
anchor matches nothing went red as a stale anchor (B1: 1 of its 3 red tests, a test-owned fix by the next batch).
Fix: anchor on v8fl_check + the task-1 block (sliced from the root text) + mkdir, moved as one adjacent run; red
evidence got 2|1|present (want absent). Lesson: a new block between two anchored lines breaks every mutant anchored
across them; run the mutant table after each source hunk. (b) The dropped-`$` mutant of `/@TF(-OSR)?(#[0-9]+)?$/`
SURVIVES every committed row: it can only misread a function named like `x@TF`, giving a false NO-VERDICT (fails
closed); not fixed, FILLER (#109 b). Lesson: a survivor is recorded with its direction (here fail closed), never
silently accepted. (c) Decision (coder, plan silent): the tl_* rules are PREPENDED to LIMITS_AWK, not appended: the
limit rules `next` past their own header lines, so appended rules never see the max-* header that must close a
Turbolev section (a default token would bleed into the next flag). Related: a default token counts only for its own
flag, and a header line containing `default:` is not its default line. (d) Fake node lists --turbolev and
--turbolev-future default off, so every older row still reads Turbolev off; the on case uses a sed copy with
`default: --turbolev`. (e) The PARITY pin (deopt-diff-boundary.test.mjs:603 and the fillers-final copy) moved
74c2fcb5 -> e297d240 (one line of that file; the fillers-final copy was red too, B1 557 / 558). (f) Reviewer r1
APPROVED, no blockers; every plan mutant is killed by a committed test except the `$` drop. Review shas: src
61a570cb, root e297d240, ibd test 08cbf657, deopt-diff-boundary 1fc4ee68, audit-g5 4be52244 (then a comment-only
fix). Test of the gate, per law 6: every one of the 11 gate rows fails on 7c91d1c.

**#110 b66 IC24: test-gate lessons (ic-diff on node 22 / 24; Q-B66-IC24, Q-B66-G4REAL, Q-B66-G4TWIN).** (a) A
real-node oracle written on one V8 (14.x) went red on the supported 22 / 24 (CI run 42850759205: audit-g4 A1 real
:204 and A2 real :243 rc 2 `code kind outside the allowlist: Builtin,2`, 4 legs; node 26 green). Rule: a real-node row
states the V8 it holds for and asserts the known-limit verdict elsewhere (A1 / A2 real now: rc 0 SAME on V8 14.x, else
rc 2 NO-VERDICT). (b) FOUND by the Fable 5.2 cross-check: test/env-strip.test.mjs:270 (E3) and :305 (E5) hand ic-diff a
real trace on every leg but assert only the env strip, so the 22 / 24 NO-VERDICT passed through them silently; a row
that runs a tool on a real node and asserts nothing about the verdict hides a platform limit. (c) A skip justified by an
unmeasured premise ("passes for the wrong reason") was false: the r1 review measured the old twin's reason (`no IC
log`, before any code-kind check) and the skip became an assertion with teeth (Q-B66-G4TWIN: twins run on every V8,
assert rc 2 NO-VERDICT and 'no IC log'). Lesson: measure a reason before writing it into a skip. (d) Tripwire, by
design: `V8_14 = /^14\./`; a node whose V8 major is not 14 but whose numbering matches would make the fix rows red,
the signal to re-measure the table. Measured (node 26.8.2, V8 14.6): V8_14=false -> A1 / A2 real red; off-14
emulation -> 4/4 real rows pass; twins at the cut fix root -> red on 'no IC log'. Roots: ic-diff.sh 50a6fc34 ->
ea9f4f70, src f1568ac8 -> f8ef611a. Evidence: `.handoff/RULINGS-b66-ic.md`, `.handoff/evidence/b66-ic/` (local,
untracked).

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

**#75 ibd U1 reject lessons (b52-b55).** (a) Exit-status overload: a tool error was read as "no glue" (the glue scan's
failure and its "clean" answer shared one status); the scan now prints `clean` / `glued` and a scan failure dies exit 2.
(b) Base-8 arithmetic on a user digit string: `=09` in `(( ))` is an error; the bytecode report now reads the limit
as `10#$3`. (c) A ruling whose premise was false (Q-IBD-3 (a), "a rerun works", REVIEW-b1-r1 blocker 3) and a ruling
option that misstated its model (Q-IBD-6 as first worded misstated bb's order; corrected by the maintainer the same
sitting): read the cited script before writing "as X does" into option text. (d) Hoist past an unvetted write: moving a
spawn above a write must carry the write's failure modes into the preflight; addendum A1's "Nothing else moves" missed
it (REVIEW-b1r-r2 blocker 1). Evidence: `.handoff/evidence/u1/REVIEW-b1-r1.md`, `REVIEW-b1r-r2.md`,
`REVIEW-b1r2-r1.md` (local, untracked).

**#88 G0: rulings and process.** (a) Q-B58-ALIAS: after round 2's REJECT the maintainer ruled that every name ls-files
does not match gets the inode sweep (not only non-ASCII names), because an ASCII-typed `--before` can open a tracked
non-ASCII file on APFS (U+212A, sharp s, U+FB01 aliases; rc 1 on old and new) and the audit rubric makes a wrong
verdict a fix however rare. Cost: +1 git spawn on every untracked `--before` (3 / 2 / 1). Real reach: the sweep lists
`--before`'s directory and below, so a tracked hard link elsewhere in the repository stays undetected; -h says that,
not "everywhere". (b) The b57 cross-check found that the first-pass fixes of seven audit findings (five fix forms)
would have regressed; the shared lib took the cross-checked forms. (c) R2 (full stdout pipe drops V8 records) reaches
deopt-diff too, not only bytecode-budget; it is ruled to G1, G2 and G5, not G0. (d) ic-diff's INT / TERM trap (`die
"interrupted"`, src/ic-diff.sh:815 and :833) can now give `VERDICT X` and then `VERDICT NO-VERDICT` in the report,
exit 2: accepted, the last line matches the exit status. Evidence: `.handoff/RULINGS-b58-g0.md`,
`.handoff/RULINGS-b57-audit.md`, `.handoff/PLAN-b58-g0.md`, `.handoff/evidence/REVIEW-b58-g0-r1.md` (local,
untracked).

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
(1) ibd A1a: its own logical `is_tracked` is closed by G-SHL3 N1 (#71); (2) ibd's "--after not found" now reads as the `--before` git
failure (closed by U2 L2, #79) when `--after`'s directory is missing (`refuse_live` runs first; fail-closed,
wording only); (3) ibd runs
`mkdir -p "$OUT"` (inlining-budget-diff.sh:652) before `refuse_live` (:706), so a refusal leaves OUT behind
(documented by U3 B3 in the -h Known limits; the finding is #80).
Evidence: `.handoff/PLAN-b48-shlib.md`, `.handoff/evidence/b48-shlib/`, `.handoff/PLAN-b50-ddawk.md`,
`.handoff/evidence/b50-ddawk/` (local, untracked).

**#71 G-SHL3 (b50-b52): bb / dd audit B2a / B2b / B2c / B3 / N1 CLOSED or documented; ibd residuals: #79.**
CLOSED by G-SHL3 (CHANGELOG "G-SHL3"): B2b (a symlinked `--after`: the repo around the END of its chain is now a
live toplevel; an unresolvable chain dies exit 2), B2c (widened: `--after`'s name joins the hard-link candidates),
B3 (an unwritable OUT is refused before any spawn or write; no truncated report), N1 (the fallback `is_tracked`
is physical; ibd includes lib/tracked.sh). DOCUMENTED (Class 3): B2a = `refuse_live` checks `--before` and the END
of its symlink chain, not the intermediate hops; B2c residual = a hard link under another name or in a
subdirectory stays undetected. [Superseded in part by #88 a (G0, Q-B58-ALIAS): a tracked hard link or symlink to `--before`
in its directory or below is now refused as git-tracked.] The ibd items ruled to U2 (Q-SHL3-R3) are CLOSED by U2 (#79): devino `--` (a clean
`-`-led `--before` on ibd died in devino's stat as "unexpected error (exit 1)": fail closed, wrong text),
resolve_links' `readlink || die` (class 3, reachable only by a race), `refuse_live` `dirname "$f"` / `"$p"`
`--`, ibd `cp "$f"` `--`, F16 entry `./` prefix; U2 also retargeted M-dash-revert and retired M-trap-off
(test/bytecode-budget-stage-boundary.test.mjs, test/deopt-diff-stage-boundary.test.mjs).
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
header text can forge a result. Opus N1 (ibd bytecode probe; rulings Q-IBD-2) was routed to ibd triage and
is CLOSED by ibd U1 (tr) and U3 (awk rule) (#81). Test-gate lesson: a plan's "anchors stay" claim checked only one substring; the stop gate caught a
sibling anchor (M-prefix-match) displaced by the spec's own text.
Evidence: `.handoff/PLAN-b50-bbawk.md` (A1, A2), `.handoff/evidence/b52-bbawk/` (local, untracked).

**#74 G-FILL-DD (b54): dd audit argon 2026-11-07 A6.2-A6.6 dispositions (A6.4 closed by FILLERS B2).**
A6.2 lib/common.sh:82,85 NOT edited: no reach in dd or bb (lib/stage.sh:28 normalizes a dash-led path to
./NAME; refuse_live is reached in dd only via lib/stage.sh:62, after that line), and an edit would move all 5
roots. ibd's unnormalized path (lib/modes.sh:54, `refuse_live "$BEFORE_FILE"`) is open for ibd triage. A6.3
lib/v8flags.sh:25 unchanged (its `env -u` strips only NODE_OPTIONS and NODE_COMPILE_CACHE): the top unsets at
src/bytecode-budget.sh:194 and src/deopt-diff.sh:229 cover bb and dd, the other two b54 includers also
unset at the top (src/allocation-diff.sh:125, src/ic-diff.sh:137); ibd, a later includer, has no such unset; standalone sourcing is test-only. A6.5 /
A6.6 CLOSED as NOT REPRODUCED: the text argon cites never existed. At the audited 5e570f0,
test/deopt-diff-stage-boundary.test.mjs:551 is a `mutant(` row, test/deopt-diff.test.mjs:16 is an import and
CHECKS is the constant 99 at :20, not a 95-row array; `git log --all -S` finds no `33 checks` / `27 teeth`,
and no version of test/deopt-diff.test.mjs has a trailing `// N` ordinal. A6.4
was closed in two steps: the env strip for test/deopt-diff-stage.test.mjs and test/deopt-diff-live.test.mjs (harness
only, no gate), then FILLERS B2 (ADDENDUM A6) for test/deopt-diff-boundary.test.mjs and
test/deopt-diff-stage-boundary.test.mjs (the latter found by the b54 review).
Evidence: `.handoff/PLAN-b54-audit-fillers.md` (local, untracked).

**#76 ibd U1 (b52-b55): known limits; the F7 / F5 shapes of (3) were closed by U2 (#79).**
(1) Q-IBD-3 RESTATED (maintainer, 2026-11-08): "a refusal in ref / file mode can leave staged files in stage/, and a
rerun needs a fresh --out". Class 2 (awkward but closed): the lib/modes.sh refusal exits 2 after the staging copies, a
rerun on the same --out is refused ("stage ... is not empty", exit 2). Also in the -h text of `--out`.
(2) Q-IBD-7 carve-out from law 3: every lib/modes.sh refusal of ibd now exits 2 after 2 node spawns (`-p` and one
`--v8-options`; neither carries the driver), was 0. The node version read and `v8fl_check` sit after the read-only
--out preflight and before the first write (Q-IBD-6 CORRECTED).
(3) Law-3 exceptions still live after U1 (REVIEW-b1r2-r1 NITs), all exit 2, neither spawn carries the driver: `--out -foo`
and `--out -` (F7; mkdir exit 64; CLOSED by U2 with its `./` rewrite); report.txt dangling-symlink shapes (F5; CLOSED by
U2, the `! -L` check stays above the hoist, PLAN A13). ENAMETOOLONG (a 300-char basename) is not predictable by a
preflight, like ENOSPC, takes 2 spawns, no planned fix. U2 reworded the source comment above the node version read: the
preflight refuses a bad --out with 0 spawns, and a path only mkdir can see through (ENAMETOOLONG) still
takes the 2 spawns.
Evidence: `.handoff/PLAN-b52-ibd-u1.md` (A5, A8), `.handoff/evidence/b5x-ibd-triage.md`,
`.handoff/evidence/u1/` (local, untracked).

**#77 FILLERS docs (b54-b55): bb / dd audit dispositions (B5a, B5b, B2a; A6.2, A6.3, A6.5 / A6.6 see #74).**
B5a: not a defect; the gate is test/bytecode-budget-stage.test.mjs, `--self-test` never claimed lib coverage.
B5b: the resolve_links-only mutant is RETIRED as equivalent (test/shlib.test.mjs); argon's 2-hop row is not adopted
(a row that cannot fail breaks law 6). A6.2: not edited, no reach in bb / dd (lib/stage.sh normalizes a dash-led
path), an edit would move all 5 roots. A6.3: lib/v8flags.sh unchanged, the top unsets cover bb and dd; ibd has no such unset.
A6.5 / A6.6: NOT REPRODUCED, not "gone" (PLAN-b54 A8): the text argon cited never existed; A6.4: closed by FILLERS B2 (A6). B2a: the
symlink hop walk is left out (not trivial); see #71. Evidence: `.handoff/PLAN-b54-audit-fillers.md` (CLOSED,
task 8, A5, A8), `.handoff/evidence/fillers/REVIEW-b1-r1.md` (local, untracked).

**#79 ibd U2 (b56): audit F5 / F7 / F8 / F9 / F10a / F13 / F14 / F16 / F17 / L2 and #71's ibd residuals CLOSED.**
CLOSED by U2 (CHANGELOG "U2"): F5 (a report.txt symlink or extra hard link in OUT is refused, 0 spawns), F7 / F16 (a
dash-led path option, positional or driver basename gets `./`), F8 (empty `--opt=` on a value option refused), F9 (`--runs 09` is 9, a
third digit refused), F10a (the `-p` probe runs under `env -u NODE_OPTIONS`), F13 (`--before` and `--after` the
same file refused), F14 / F17 (a fn or tier given twice refused), L2 (`--after` not found named). #71: devino `--`,
`readlink || die` and `refuse_live`'s `dirname` / `basename` `--` are in lib/common.sh, built into all 5 roots (called
by bb, dd, ibd; alloc and ic never call `refuse_live`); `cp` `--` is in lib/modes.sh, ibd only. Not closed here (known deferred
residuals, they would move a root): the `-h` text omitted U2's refusals; CLOSED by U3 B3's Known limits paragraph,
which lists a report.txt that is a symlink, not regular writable or hard-linked, an fn or tier given twice, `--before`
and `--after` the same file, an empty value on a value option, `--runs` of more than 2 digits and a failed `-p` probe.
What remains unlisted in `-h`: the dash-led `./` rewrite (F7 / F16, behaviour, not a refusal); lib/modes.sh:26 `cp "$DRIVER"`, :56 `dirname "$BEFORE_FILE"` and :75-76 `dirname` / `basename` of POS have no `--`
(unreachable while F16 rewrites the path first); `TMPDIR=-tmp` (the default OUT is built after the F16 loop: mkdir
exits 64 on BSD (GNU: 1 expected, unverified), "unexpected error", exit 2, 2 spawns). Real GNU / uutils `stat`, `cp`, `dirname`,
`basename`, `readlink` and `mkdir` with `--`, bash 5 and node 22 / 24 UNVERIFIED locally (BSD only; CI will show it).
Evidence: `.handoff/PLAN-b52-ibd-u2.md` (A1), `.handoff/evidence/b5x-ibd-triage.md`,
`.handoff/evidence/u1/REVIEW-u2-b1-r1.md`, `REVIEW-u2-tests-r1.md`, `REVIEW-u2-tests-r2.md` (APPROVED) (local,
untracked).

**#80 ibd L3 (U3 B3): a refusal after `mkdir -p "$OUT"` leaves OUT behind; whether a rerun is accepted depends on what was written.**
Raised by PLAN task 6, which asked to check it; the first B3 review (REVIEW-u3-b3-r1) added the rerun-refused half: the ruled wording "empty subdirs" was
short, a refusal after the mkdir leaves empty raw/ dec/ bud/ ms/ stage/ AND a 0-byte report.txt, and a rerun on that
OUT is accepted. A refusal after files were staged (ref / file mode: an unknown `--after-ref`, a bad `--driver`) and a
run that fails later (raw/ and report.txt partly written) leave a non-empty subdir, and a rerun on that OUT is
refused. Not fixed (class 2: awkward but closed, exit 2); documented in the -h Known limits (src/inlining-budget-diff.sh
:86-95; the same refusal-after-mkdir shapes as #70 (3) and #76 (1)). The first -h text overreached twice (r1: "a driver
not found" and "an unknown git ref" listed under rerun-accepted, "the option checks" leaving OUT as it was; r2: "a bad
option value" likewise, since the mode-combination checks of lib/modes.sh run after the mkdir); round 3 ruled by the maintainer
(Q-B3-R3, one more literal round) and corrected the text. No row pins rerun accepted / refused (hand-run only, REVIEW
NIT carried). Real GNU / uutils behaviour UNVERIFIED.
Evidence: `.handoff/evidence/u1/REVIEW-u3-b3-r1.md`, `REVIEW-u3-b3-r2.md` (local, untracked).

**#81 ibd N1 / N2 (U3): N1 closed for the BYTECODE_AWK read; the N2 real-V8 note.**
Fable N1 / audit F10b (the `--v8-options` limits read without the env strip) is CLOSED for this read only: lib/v8limits.sh:4
strips NODE_OPTIONS and NODE_COMPILE_CACHE (landed by FILLERS; U3 adds ibd's top-of-script unset, Q-IBD-ENV, and a
row that a leaked var reaches no spawn). The Opus N1 (ibd bytecode probe) is CLOSED by ibd U1 (tr) and U3 (awk rule): lib/v8probe.sh BYTECODE_AWK
printing `?` on a glued header or an orphan length; REPORTED only, no verdict byte moves (REVIEW-u3-b1-r1 Q3). N2
real-V8 note (in the -h Known limits): driver output glued to a V8 compile line was observed on node v26.8.2 in
front of a Maglev OSR compile; a glued TurboFan header is UNVERIFIED (never observed on a real node). Real gawk /
mawk / uutils awk and node 22 / 24 UNVERIFIED.
Evidence: `.handoff/evidence/u1/REVIEW-u3-b1-r1.md`, `REVIEW-u3-b2-r1.md`, `.handoff/evidence/b5x-ibd-triage.md`
(local, untracked).

**#82 Follow-up (LiteSignal): the vendored ibd bench copy and its CHECKS literal.**
/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteSignal/bench/inlining-budget-diff.sh needs the new ibd root,
and /Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteSignal/test/94-inlining-budget-diff.test.mjs:14 holds
`const CHECKS = 43;` (this tool's `--self-test` has moved to 54 since U1, CHANGELOG "U1"). Not edited from here
(another package). Open until the maintainer syncs it.

**#83 Q-I1: ic-diff on node 22 and 24 ends NO-VERDICT (known limit, class 2; audit I1; b66 IC24).**
Ruled DOCUMENT (RULINGS-b56-audit-closure Q-I1): the code-kind numbering table (src/ic-diff.sh:187, 189, 208) is
V8 14.x only, so every node 22 run is NO-VERDICT, never a wrong verdict (usability only; package.json engines.node
is >= 22). The audit's candidate fix did NOT land: I4 and I5 are candidate-only and not present (landing the candidate
would revive both: I4 needs its guard, I5 a decision). Text: one -h line (src/ic-diff.sh:139; names node 22 and 24 since b66, Q-B66-IC24). Repro (audit
reproduction.mjs on a copy): I1 RED; a canned node 22 log gives exit 2 NO-VERDICT. Node 24 MEASURED b66 (CI run 42850759205, f23b6c6, v24.22.2, macOS + ubuntu): the same NO-VERDICT, `code kind outside
the allowlist: Builtin,2` (Q-B66-IC24). REPORTED, not measured (V8 branch heads 12.4 / 13.6 / 14.6 read via a fetch
summarizer): node 22 and 24 share one numbering; V8 14 inserted FOR_TESTING_JS at 2, moving every later kind up one
(Builtin 2 -> 3, Interpreted 9 -> 10, Baseline 10 -> 11, Maglev 11 -> 12, Turbofan 12 -> 13). Gate: a mutant widening the allowlist to node 22 numbers survives --self-test but is caught by the Q-I1 row of test/ic-diff.test.mjs (canned `Builtin,2` and `JS,9` logs; M-c7-node22, M-c9-node22); that widening is the fail-open the audit warned of
(Maglev read as baseline). Evidence: `.handoff/evidence/b56-ic-audit-closure.md`, audit 2026-11-04-ic-diff FINDINGS
(local, untracked). Other I-ids: I2 / I3 / I6 FIXED per that closure check, not mapped further here (#69).

**#84 Q-NO-WARNINGS: NODE_NO_WARNINGS stays unstripped in allocation-diff (known limit; audit A6 residual).**
Ruled DOCUMENT, no code change (this ruling moves no root). Q-ENV lists four names; NODE_NO_WARNINGS is
not one. Measurement (b56 closure check, REPORTED, one reviewer run): on a warning-heavy driver the GC count moved
16 -> 11; across 5 smaller sizes it was never ZERO, and one size read NONZERO -> NO-VERDICT (cause not examined).
No wrong verdict shown. Evidence: `.handoff/evidence/b56-alloc-audit-closure.md` (local, untracked).

**#85 G-ALLOC-CLOSE: allocation-diff audit A1 and A4 CLOSED; A8 recorded.**
A1 (Q-A1): GC_AWK allows one or more spaces before `(average` / `(+ ...)`, so the node 22 `--trace-gc` line
(audit R1, v22.23.4) parses; fixture row from that line plus a must-fail mutant; single-space lines unchanged. No node
22 on the host: real-node proof is the CI legs (a fixture proves the grammar, the live row runs on 22 only in CI).
A4: the -h Driver contract gains the scalar-replacement paragraph (text only; ZERO is correct for optimized code).
A8 (audit-side oracle file reproduction.mjs:77, 83; not a gate; cosmetic): record only, no action. Review
(REVIEW-gac-r1): APPROVED, 3 NITs, 2 applied; open for FILLERS: two grammar mutants (`[^()]*` -> `.*`, group `?` -> `*`)
survive the A1 rows and cannot change a kind, count or verdict. Evidence: `.handoff/evidence/REVIEW-gac-r1.md`,
`.handoff/evidence/b56-alloc-audit-closure.md` (local, untracked).


**#89 G0 open limits.** (a) when ls-files exits 0 with hit 0 (git matched the name ignoring case, but it is neither
the exact name nor the same inode), is_tracked returns 1 (untracked) with no sweep, so on a case-sensitive file system
a hard link under a case-only sibling name of a tracked file stays undetected; documented in the bytecode-budget and
deopt-diff -h; by reading, no regression against 57b93d1. (b) `readonly FINAL=1` through BASH_ENV makes
bytecode-budget exit 1 with no VERDICT; pre-existing, measured identical on 57b93d1. Evidence:
`.handoff/evidence/REVIEW-b59-g0-r3b.md` (local, untracked).

**#92 G1 open limits.** Measured or read is stated per item. (a) A TMPDIR full during the run and freed before the
append check: not caught; no real full disk was run, so node's exit status there is unproven (READ; -h). (b) Torn
records from another thread (a Worker's writeSync while V8 prints): MEASURED by reviewer r1 on node 26.8.2 with a
Worker writing `\n` during a print, regular file, 2941 length lines: 1924 clean, 1017 torn at `Bytecode length: ` |
digits, 0 partial digit strings (pipe, 250: 58 clean, 192 torn the same way); a torn record gives a matched header
without a length or a null-control mismatch, so NO-VERDICT (fails closed, not new against the pipe). A line holding
only a number can forge a length (3 workers spamming `7\n` over 250 compiles read 7 on 91 records); that is a hostile
driver, covered by "driver output is trusted" (-h). (c) A driver that reopens /dev/stdout on Linux gets a new file
description at offset 0 and can overwrite earlier output: READ, not run (-h). (d) The baseline lists node's own
functions at startup only: an internal compiled after the driver imports something (e.g. node:fs) is missed (by
reading; -h). The list on node 26.8.2 has 24 names; of about 40 common names only `get` and `set` collide (MEASURED,
reviewer r1). (e) A killed run can leave one `bytecode-budget.XXXXXX` (no EXIT trap inside the `$( )` subshell; by
reading; -h). (f) With the default SIGXFSZ a file-size limit kills the shell: base_list's append ends the run with rc
153 and one temp file left, exit outside -h's 0 / 1 / 2 (MEASURED; fails closed, hostile setup). (g) Open FILLERS from
the r1b NITs (the PWD case MEASURED by reviewer r1b; the two wording items READ, not measured): a deleted cwd with no
PWD in the environment gives "PWD: unbound variable", generic `unexpected error`, exit 2 (fix `"${PWD-}"`); src line
82 "(nor the cwd they resolve against)" understates the code, suggested "(nor the cwd, even for absolute paths)"; the
torn-record sentences at src lines 108-111 sit before "No address reaches that line" so "that line" reads wrongly
(move them after the null-control sentence). Also a broken `tr` with --out ends `unexpected error (exit 1)`, exit 2, 0
spawns, fails closed (r1 NIT, measured). UNVERIFIED: Linux, bash 5, node 22 / 24, uutils `mktemp`. Evidence:
`.handoff/evidence/REVIEW-b60-g1-r1.md`, `REVIEW-b60-g1-r1b.md` (local, untracked).

**#95 G2 open limits.** Measured, read or argued is stated per item. (a) TMPFULL: a TMPDIR full during a run and freed
before the append check is not caught, and a real full disk was not run: only `ulimit -f` with SIGXFSZ ignored was
tested, so node's exit status on a real full disk is unproven (READ; -h). (b) A signal inside `$(mktemp)` before the
script has the file's name can leak one `deopt-diff.XXXXXX`; SIGKILL leaks the file in flight (by reading; -h; the
Q-B61-DD-TRAP residual). (c) Tearing by a Worker isolate (V8 printing a bailout in several PrintF calls to a shared fd
1) is ARGUED by the reviewer, not reproduced on real node; the Q-B61-DD-TORN2 second-head terms and the `[bailout end. ..` glue case are built on that argument (a line-start torn head is reproduced on real node: R7 / DD-opus-1, cross-opus R1, rpipe round 5). (d) R24
(staged copies inherit `type` from the nearest package.json above DIR; DD-fable-1 stays RED by design) and R25 (a driver
that closes fd 1 and 2 loses V8's trace with exit 0; DD-opus-3) are documented in -h only (Q-B57-DOC). (e) bash 5,
Linux, uutils `mktemp`, mawk / gawk, and node 22 / 24 are proved only by CI; local proof is bash 3.2.57, macOS, node
26.8.2 (the A3 stderr text on bash 5 is UNVERIFIED). (f) A driver that itself prints trace-like text stays "Not
detected" (a plain line a hostile or careless driver writes can read as a record). (g) Open FILLERS from the r2 NIT
(READ, no wrong verdict): the -h X list says a glued WHOLE bailout naming fn gives X "trace text not at line start";
after a `[bailout end. ..` prefix it gives "bailout: no (kind: prefix", after a `[completed compiling ` prefix
"completed compiling: function name" (still refusals; wording predates r2, deopt-diff.sh:124-127). Evidence:
`.handoff/evidence/REVIEW-b61-g2-r1.md`, `REVIEW-b61-g2-r2.md` (local, untracked).

**#98 G5 open limits.** Measured, read or argued is stated per item. (a) Tear residual (Q-B62-TEAR3, REPORTED probe
only, no verdict moves): a driver write that starts with a newline, or with digits then a newline, inside or right after
a length's digits is not detected; the length reads short or as other digits. MEASURED by reviewer r1 (BSD awk): header
+ `Bytecode length: 3` + header, then `Bytecode length: 5` / `worker line` / `0` reads `3,5`; `Bytecode length: 512` /
`0` reads `3,512`; `Bytecode length: 12` / `50` reads `3,12`, no `?`. ARGUED by reviewer r2 (BSD awk), not in the ruled
sentence: a write landing just before the digits (`Bytecode length: ` + `12\n` + `50`) reads 12. The tearing itself is
MEASURED (28 of 180 runs before the fix, 10 `?` of 180 after). (b) A Maglev abort was not reproduced (`mlabort.js`:
Maglev ignores `--max-optimized-bytecode-size` and completes); only `[completed compiling` counts, so an unseen abort
shape cannot count as evidence (argued from the rule). (c) Completion lines were censused on node 26.8.2 only; node 22 /
24 completion lines are UNPROVEN, and a node that prints none leaves no D row, which fails closed (NO-VERDICT where a
compile is the only evidence; by reading). (d) Q-B57-TIERS: the CI-only row has not run; class 1 of the `--tiers " "`
finding is UNPROVEN until the first CI run on the ubuntu legs (bash >= 4.4), and this ledger records PROVEN or KILLED
from that run. (e) The kConcurrent compile-line check may refuse a run whose Worker isolate compiles concurrently
(ARGUED, not run; fail closed). The flag-driven wrong verdict itself was argued, not shown (#96 g). (f) TMPFULL: a
TMPDIR full during the probe and freed before the append check is not caught; a real full disk was not run, only `ulimit
-f 32` with SIGXFSZ ignored, so node's status on a real full disk is unproven (READ; -h). (g) The probe has no trap: a
signal mid-probe leaves one `inlining-budget-diff.XXXXXX` file (READ from the design); SIGKILL likewise. (h) With
`--concurrent` units interleave (MEASURED on the 8 concurrent-on census logs: 0-3 compiles inside an open unit, up to 3
key mismatches, an orphan completion in every log) and a completion whose key differs from the open unit emits no D, so
no evidence row is added; there are no D rows for it by design (fail closed, not widened). (i) The comment-stripping
import check refuses a real import that follows `'http://x';` on the same line, and an `import(` whose path is on the
next line (READ, reviewer r1; fail closed). (j) bash 5, Linux, uutils `mktemp`, mawk / gawk and node 22 / 24 are proved
only by CI; local proof is bash 3.2.57, macOS, node 26.8.2. Evidence: `.handoff/evidence/REVIEW-b62-g5b-r1.md`,
`REVIEW-b62-g5b-r2.md`, `b62-g5b/CENSUS.md`, `b62-g5b/a5-probe-matrix.out.txt` (local, untracked).

**#101 G3 open limits.** Measured, read or argued is stated per item. (a) A Worker that triggers no GC is not detected
(named in -h; the guard cannot count a Worker's isolate; MEASURED: a Worker's bootstrap alone causes young GCs on v26,
so a Worker that does anything usually reads NO-VERDICT). (b) Worker / main isolate line interleaving in the trace
(the grammar NO-VERDICT instead of "did not count"): theoretical, not seen in 7+ runs (reviewer r1). (c) The
pretenuring row's teeth are measured on node v26.8.2 only; node 22 / 24 live rows are UNVERIFIED here (CI proves
them). (d) ycount `+0` / an empty Y: the verdict `[[ $Y -eq 0 ]]` reads an empty Y as 0, guarded only by set -e /
pipefail; `[[ $Y =~ ^[0-9]+$ ]] || die` would close it (reviewer NIT, a FILLER, not fixed in G3; mutant MB, `+0`
dropped, passes the self-test and is caught by audit-g3 A2 and L2). (e) Under `GREP_OPTIONS=-P` on darwin only
`--self-test` fails closed (rc 1, 60 checks FAILED, MEASURED in b1-gate.txt): its own greps, not the run path. (f) The
reviewer did not run the full test/allocation-diff.test.mjs: estimated +15-20% wall time (~1.8 ks at the coder's load,
under the 3600 s cap; estimate, CI baseline unknown). (g) audit-g3.test.mjs:6 header lists "(A1 A4 A5 A6 A7 A8 A10)":
add A5b (FILLER).

**#104 G4 open limits.** Measured, read or argued is stated per item. (a) UNPROVEN, ubuntu bash 5 / uutils / GNU
mktemp leg: `${rd//%/%%}` was verified on bash 3.2.57 only; rows 77-81 prove it there on the first CI run (not run;
nothing local). (b) READ, not measured: with a trailing-slash TMPDIR the // before ic-diff.XXXXXX becomes one / in
argv after IC_ABS; the report is unchanged. (c) EMULATED (doc review, GNU-like mktemp shim on macOS, root 50a6fc34): a
% TMPDIR puts a % in the self-test's own d and all 81 rows pass (the row-77 anchor doubles $d since the r1 fix; r1 NIT
2 closed); an = TMPDIR fails 30 of 81 rows, exit 1 (the fake node path holds the =, R26 refuses it): fail closed. Not
run on ubuntu. (d) A5 retention is 12 cycles, not 20 (r2 ruling; PLAN addendum A2). (e) READ: cross-tool lead, not in
this lane: dd :1651 and bb :1235 (at 7c91d1c; bb is :1240 in the live tree from another lane) test `=` on NODE_BIN, so
the PATH route reaches env there and dies later with `cannot run`, still exit 2 (no wrong verdict; reviewer r1 NIT 3
and cross-fable placement). (f) The audit repro was run on the before build and the B1 root 5142d62a only (REPORTED);
the final root's gates are the self-test and audit-g4. (g) The reviewers did not re-run the golden G1-G4, and r2 did
not re-run M-pct / M-pct-parent or the audit-g4 OLD twins A1 / A2 and A5 parity (r1 ran audit-g4 35/35 with OLD twins,
PRELIMINARY); they ran on the B1 / r1 roots; on the final root npm test run 2 (h) runs the mutants, OLD twins and A5
parity (at-least rows); golden G1-G4 is in no npm test file and was not re-run there. (h)
Pre-review `npm test` (lane copy, quiet lock, host PRELIMINARY, load1 5.43, baseline 2.21; on the r1 root 09fb5c15 /
audit-g4 a9f67f70): 2720 tests, 2712 pass, 0 fail, 8 skip; final (roots 50a6fc34 / f1568ac8, quiet lock, host QUIET at
start, load1 1.33 -> 6.33, 1007 s): 2724 tests, 2716 pass, 0 fail, 8 skip, run 2 per Q-B64-A8 (run 1 at load1 ~21: 1
fail, the audit-g2 A8 real-node row killed at its 150 s cap; alone at load1 1.5 it passed in 20 s; outside lane g4;
NPMTEST-b64-g4-final-run1.txt, -run2.txt, DIAG-b64-a8-selftest.txt). (i) ARGUED: the IC_ABS `|| die` is
unreachable and not gated (under set -e it still exits 2). Evidence: .handoff/lanes/g4/evidence/ (local, untracked).

**#106 b65 open limits.** (a) MEASURED on CI logs for deopt-diff only (audit-g2 A3, ubuntu bash 5.3.9; bash 4.x not run), mechanism ARGUED: a SIGTERM while a tool waits for the driver prints
`unexpected error (exit 0)` (EXIT trap $? = 0, then SIGTERM re-raised); the verdict stays NO-VERDICT (fail closed).
allocation-diff, bytecode-budget and inlining-budget-diff carry the same lib/prologue.sh:9 trap and no INT/TERM trap, so ARGUED to print it too; ic-diff traps INT TERM (`die "interrupted"`, src/ic-diff.sh:850, :868) and prints `ic-diff: interrupted` instead (READ). A prologue signal-trap fix is for the cross-script
reviewer (Phase 7), Q-B65-SIGTERM. (b) READ: bb's refusal text "(as `node --version` prints it)"
(src/bytecode-budget.sh:852) is false for prerelease nodes (v27.0.0-alpha.0.0.0 is refused); FILLER for Phase 7,
Q-B65-NODEPRE. (c) UNPROVEN until the next ubuntu CI run: the bash 5 branch of A3 and the pad fix of #105 (a) (no bash
5 or Linux here).

**#109 G5c open limits.** Measured, read or argued is stated per item. (a) ARGUED: a V8 that drops --turbolev from
--v8-options (or lists it under a name this build does not read) while `--concurrent` is on gives units with no
tag, so neither the default check nor the @TF count fires; -h says the maglev tier is NO-VERDICT only through its
check for decision lines in TurboFan-tier (@TF) units, which --concurrent turns off. The turbo tier under an
always-on Turbolev is unverified. Not reproduced (no such V8). (b) MEASURED survivor: the `$` of
`/@TF(-OSR)?(#[0-9]+)?$/` dropped survives; the direction is a false NO-VERDICT for a function named like `x@TF`
(fail closed). FILLER: a self-test row for a function named `x@TF`. (c) No committed row for the CR strip or the
`true` / `false` arms of the turbolev awk (hand-checked on BSD awk only, B1 A3 "by awk alone"); dropping one dies
"cannot read", fails closed. (d) READ: in ref / file mode the default-on refusal leaves staged files in stage/
(modes.sh runs before the limits read); a rerun needs a fresh --out, stated in -h. (e) UNPROVEN until CI: mawk,
gawk, bash 5 and Linux (everything above ran on BSD awk, bash 3.2.57, macOS); the real-node old twin is opt-in only
(LITEUTILS_REAL_HOLD=1). (f) MEASURED only on node v26.8.2: a Turbolev-off real maglev + turbo run is SAME with 0
@TF lines (no false NO-VERDICT there); node 22 / 24 are not run (UNPROVEN).

**#111 b66 open limits.** UNPROVEN until the next CI run on the node 22 / 24 legs: the off-14 branches of audit-g4
A1 / A2 real (rc 2 NO-VERDICT 'code kind outside the allowlist') and of their old twins ('no IC log'); only V8 14.6
(node 26.8.2) ran them. See #83, #110.
