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
   survives, or a control that is not reproducible is a defect in the test, never "re-run it". *(#36, #47-#53, #56, #94, #99, #100, #105, #108, #110, #117-#119, #121, #126)*
7. **Oracles must be portable across userlands.** BSD vs uutils coreutils, macOS awk (cuts at NUL) vs NUL-clean awk:
   accept every form or probe the host. *(#32, #39, #54, #99, #105)*
8. **`spawnSync` blocks the event loop, so a timer cannot fire.** Never judge a child timed out by a timer that
   could not have run; check the exit first. Size caps to the slowest CI leg, and `--test-timeout` to the slowest
   FILE. *(#40, #42, #43, #100, #120)*
9. **A history pin must be reachable from a ref, and a CI view must include `.git`.** Otherwise it passes locally
   and dies (or silently skips) in CI. *(#11, #38, #55, #94)*
10. **Never kill by pattern, never share a scratch dir, never run a test on the live tree.** Lanes work in private
    `mktemp -d` dirs, kill only their own PIDs, and test in an overlay. *(#57-#61, #93, #119)*
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

**#112 Parameter-count rule DECLINED (Q-B66-X11; bb; cross-script audit X11).** A rule that accepts a `Bytecode length:`
number only when it is followed by `Parameter count` was considered to close the bare-number-line forgery (#92 (b), #98
(a)) and declined: MEASURED on node v26.8.2 (census of 4008 correct lengths under Worker tears), the rule refuses 591 of
the 4008 correct lengths, and 430 more had `Parameter count ` split from its number (refused only by a whole-line
match). The clean side: 63 of 63 clean lengths were followed by `Parameter count`, and 0 of 4008 lengths were torn
inside their digits. Node 22 / 24: unverified. Ruled DOCUMENT: no code change; bb -h states the trusted-driver limit
with the census (b67). What would re-open it: a new mechanism (a form that does not refuse correct lengths under tears).
Evidence: `.handoff/RULINGS-b66-cross.md` Q-B66-X11, audit/2026-11-10-cross-script/FINDINGS.md, CROSSCHECK.md (local,
untracked).

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
TMPDIR empty, stderr `unexpected error (exit 143)` on bash 3.2 (bash 5 prints `(exit 0)`, see #106; superseded b70, #117: `interrupted (SIGTERM)`), exactly one
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

**#113 G-XS (b67): ibd option rules, self-test floor, named --out die (cross-script audit X1-X5, X7, X8, X15;
Q-B66-XS).** CLOSED, all DETERMINISTIC. X1: a value option given twice is refused (exit 2, 0 spawns) in ibd; L6 CLOSED
by consequence (class 1; old behaviour READ, PLAN-b67-gxs L6; the old twin gates only > 0 spawns): `--fn a --fn b
--only-fn` judged only b (a never judged), so a change in a alone could end exit 0 SAME; without --only-fn a dropped fn
lost its guard (NO-VERDICT -> SAME), and `--tiers turbo --tiers maglev` dropped a tier the same way. X2: did-you-mean
hint (single-dash `-*)` stays post-1.0). X3: `--self-test` acts after the loop and refuses any other argument. X5: a
blank --v8-flags refused at 0 spawns. X4: bb and ibd self-tests pass only with oks > 0 (a self-test whose every check is
skipped fails; last line `self-test: N check(s) ok`); counts unchanged (bb 68, bb --fixtures 92, ibd 89, ic 81). X7: ibd
named --out dies by name (#76). X8: bb prerelease text (#106 (b)). X15: bb / ic option banners true. Gate:
test/audit-xs.test.mjs, rows with old-root twins (dc4a10c). Mutants proven by the round-2 reviewer, each killed: m1 drop
the POS clause of the --self-test refusal, m2 drop the 001 clause, m3 a spawn before the loop. Review: r1 REJECTED (2
LITERAL), r2 APPROVED, r3 a 5-line test-only round (ibd-u2 F8 / F14, the parity pin, 2 audit-xs nits). Evidence:
`.handoff/PLAN-b67-gxs.md`, `.handoff/overlay/b67-gxs/` (local, untracked).

---

**#116 G-X6 (b67 / b69): newline and CR refusal for every printed path (cross-script audit X6 / L2; Q-B66-X6,
Q-B68-IBDCR, Q-B68-STAGECWD, Q-B69-R2TEST).** (a) Defect class: the report prints the cwd, --node, the drivers and the
resolved --out, and an LF or CR in any of them forges a column-1 line (`VERDICT SAME`). The old roots failed the cwd /
--out rows on all five tools (bb's LF cwd by die text only), forged through a driver reached via a symlinked `..` on all
five (T7) and in file mode on bb and dd (T8) (census on the 43c4ac5 roots, .handoff/evidence/b68-x6/CENSUS.md; the
dc4a10c old twins fail the same rows); fixed by nl_refuse / nl_dir (lib/common.sh, cold path, before any spawn or write)
plus post-mkdir backstops (#91 (c) covered the given arguments and `$PWD` for LF only; superseded here). (b) r1 DESIGN
catch (B3, ruled Q-B68-STAGECWD): in ref mode bb and dd ran stage_check, which prints `$REPO` (the cwd's toplevel),
BEFORE the cwd check; a refusal placed after a call that prints the same path is no refusal (for an LF a bb regression
vs 43c4ac5, whose old cwd check refused first; a CR already forged bb there, and dd forged with either). Rule (law 3):
put the refusal before the first call that prints the value, not only before the first spawn. The same r1 found B1 (ibd
checked each driver's dirname only, so a CR in a driver BASENAME reached the backstop after 2 spawns and a mkdir) and B2
(ROW 5 skipped as "not testable portably", false). (c) r2 gate-teeth catch (REJECTED, test-only, Q-B69-R2TEST): the fix
covered the driver basename, the rows covered only the directory, so removing the B1 fix survived all 24 ibd rows. Rule
(law 6): a row must put the bad byte where the FIX looks, and a mutant that removes the fix must go red; ROW 11 (a CR in
an ibd driver basename, CR only because an LF dies earlier with another message) was added with an old twin. Law 6
again: the rows derive from the plan ASSERTIONS and the rulings, never from what a root printed, and each has an
old-root twin. (d) Sibling anchor fallout (applies #114): the new early-cwd line made the
test/bytecode-budget-order.test.mjs STCHK mutant anchor match 0 times; it is re-anchored to the `if` line alone, and the
ibd parity pin in test/deopt-diff-boundary.test.mjs moves cf9d27de -> f13f33c2. A test that swaps a WHOLE old lib file
into a fresh build breaks when a unit adds a lib function the roots call (test/shlib.test.mjs I6f: bd0192f lib/common.sh
has no nl_refuse, `command not found`, exit 2, "unexpected error (exit 127)"); the targeted list missed it because that
file does not import the changed root, and only the full suite caught it (#114). Reviews: r1 REJECTED (3 blockers), r2
REJECTED (1 test-only LITERAL), r3 APPROVED. Golden: --help and --self-test (bb / dd `--self-test --fixtures` too)
byte-identical to 43c4ac5, 12 / 12 cases (36 / 36 files). Gate: test/audit-x6.test.mjs, 121 tests, 0 todo,
DETERMINISTIC. Evidence: `.handoff/PLAN-b67-gx6.md`, `.handoff/RULINGS-b68.md`, `.handoff/RULINGS-b69.md`,
`.handoff/evidence/b69-gx6/`, `.handoff/evidence/b68-x6/` (local, untracked).

---

**#117 G-SIG-1 (b70): a signal while a tool waits for its driver (cross-script audit L1 / L5; Q-B66-SIG, Q-B67-STDIN;
supersedes #106 (a)).** (a) Defect class and mechanism: the EXIT trap decided "a die already printed" with `rc -eq 2`,
so any abort that exits 2 without a die was silent (L1), and a signal during the run died by the signal inside `$( )` or
ran the trap with `$?` 0 / 143 (bash-dependent text, #106). Now `die` sets DIED first and the trap tests DIED
(lib/prologue.sh); the driver run is a main-shell background job (`( cd DIR && exec env .. NODE .. ) >FILE 2>&1 <&0 &`
then `drv_wait`, DRV_RC its exit); `_sig` (L5, armed by sig_arm for INT / TERM / HUP) ignores further signals, KILLs the
recorded pid, reaps it and goes through die: `<tool>: interrupted (SIG<X>)`, one VERDICT NO-VERDICT, exit 2, same text
on every bash, bash 5 UNPROVEN until the next ubuntu CI run of audit-sig. A die inside `$( )` exits only that subshell,
so the 6 census sites (lib/common.sh refuse_live; bb RB / RA / RL probe lines; ibd b= / a= probe lines) each carry `|| {
DIED=1; exit 2; }`. Measured (coder, bash 3.2): dd / ic / bb (base_list) / ibd (run_trace) exit 1-8 ms after SIGTERM /
SIGINT / SIGHUP, driver pid dead, 1 VERDICT line; ad, bb's probe runs and ibd's bytecode probes wait for the in-flight
driver (inside `$( )`, G-SIG-2; closed b71, #119). Q-B67-STDIN: `<&0` keeps the caller's stdin at every run site except bb's base_list,
which stays `</dev/null` (its stdin today). (b) r1 doc-truth catch (REJECTED, 1 LITERAL): the -h claim "after the
verdict line a signal changes nothing" was false: `say "VERDICT .."` runs one command before FINAL=1, so a signal there
gives a second VERDICT NO-VERDICT, rc 2. Rule (law 6 spirit): a contract sentence about "after X" must name the exact
flag or step (FINAL=1) and be derived from the code order, never from the intent. r2 APPROVED. (c) Sibling fallout (#114
again): the first full npm test (private copy with .git, frozen fillers, quiet lock) was 3212 tests, 3195 pass, 3 fail,
14 skip: audit-g1 MUT A6 (its anchor `>>"$base"` moved with the base_list rewrite), bytecode-budget-stage-boundary row 9
(the bb --self-test temp dir is left behind on SIGINT; re-pinned to that), and spawn-cap S5 (the raw-cap census flagged
the NEW audit-sig file). Rules: a NEW test file must pass the spawn-cap S5 raw-cap census (helpers use capSync / armCap
only, no raw timeout key), and a lib change runs the FULL suite before review, not the targeted list. Final tree (run
2): 3213 tests, 3199 pass, 0 fail, 14 skip, rc 0, 1470 s. The 2 skips above b69's 12 were the audit-g1 `A1 real
BB-opus-1` pair, whose plain-node truth precondition (no tool involved) read "3," once (run 2: load1 2.36 ->
3.43, load15 10.50 -> 15.39; the NULLCTL run skipped them again at load1 ~1.5, so the cause is
unmeasured); re-run on the same tree: truth 5 / 5 `3,50`, the 2 rows 2 / 2 pass. (d) Equivalent-mutant
catch: with DIED, the `exit 2 -> exit 0` mutant on the -h line (`usage; DIED=1; exit 2`) is equivalent (rc 0 runs the
EXIT trap path: a silent 2), so it was replaced by the h-nodied mutant (drop `DIED=1`) in allocation-diff.test /
ic-diff.test (audit-sig ROW H is the separate -h drop-DIED row: `unexpected error` printed). Gate:
test/audit-sig.test.mjs, 90 tests, DETERMINISTIC, old twins `git show 465881b:<root>` (CI_STRICT). Golden vs 465881b:
--self-test outputs and counts unchanged on all 5 (ad 83, bb 68, dd 107, ic 81, ibd 89; --fixtures bb 92, dd 124) except
one ic self-test label; fake-node SAME / DIFF / NO-VERDICT runs byte-identical; -h changed only by the new signal
paragraphs (bb, dd, ic, ibd), -h stderr and rc byte-identical. Reviews: code r1 REJECTED (b), r2 APPROVED. (e) Residuals
named by review (NITs, not fixed): a signal during die or the EXIT trap gives two NO-VERDICT lines and can skip the
chained temp rm (microsecond window, rc 2); the census guard maps any non-zero status of that `$( )` to a silent 2 (only
0 / 2 reachable today); `_sig`'s bare `wait` has no deterministic tooth on bb / dd / ic; on bash >= 5.1 `wait` may also
wait for a `< <( )` producer (UNVERIFIED, no bash 5 here); a signal between `&` and `SIG_PID=$!` waits the run out
(accepted by the spec); the bb --self-test temp dir is still left behind on SIGINT. b72 (#120) closed two of these: `_sig`'s bare `wait` is gone (audit-sig T / PSUB / W give it teeth) and the bash >= 5.1 `< <( )` wait was REAL on bash 5.3.9 (CI run 43049200147) and is fixed; the rest stay open. (f) Evidence:
`.handoff/PLAN-b67-gsig.md`, `.handoff/evidence/b70-gsig/`, `.handoff/evidence/b70-npm/` (local, untracked).

---

**#118 NULLCTL (b70): a gate with no teeth on the tool's own null control (maintainer report; Q-B70-NULLCTL-WHEN,
Q-B70-NULLCTL-SCOPE; section B, next to #116 (c), the gate-teeth lesson).** (a) Defect: turning off a tool's
null-control comparison (the check that run k of the same build equals run 1) was caught by nothing for
inlining-budget-diff: at 465881b lib/nullctl.sh `if [[ -z "$v" ]] && ! cmp -s` -> `if false && ! cmp -s` gave
--self-test 89 / 89, rc 0, and no test file named ibd's null control. A tool without that check can call SAME or DIFF
on a noisy driver (fail-open). (b) Census method (TASK 0, read-only, untimed, bash 3.2, node v26.8.2): per mutant a full
private copy of the tree, one count-checked single-match replacement of the comparison, the self-test (and --fixtures
for bb / dd) run on each. Result, full disable: ad, bb, dd and ic CAUGHT (ad 2 rows, bb 4, dd 6, ic 3), ibd SURVIVED
(89 / 89). Partial disables: run-2-only SURVIVED on bb, ic and ibd and was caught on ad and dd; one side off SURVIVED
on ibd (before-side and after-side each). Sites: ad, dd, ic one `nk != first` loop each; bb one `line != first` loop;
ibd the shared macro in lib/nullctl.sh. (c) r1 catch (REJECTED, 3 LITERAL, gate teeth): the first census and fix
covered the full disable and run-2-only but not every partial disable; r1 found survivors ibd last-run-only, ibd
maglev-tier-off, ibd --only-fn-off, bb last-run-only and ic before-side-off. Rule (law 6): "turned off" includes every
partial disable, meaning one side, one tier, one mode, a subset of the runs (first, last, all but one); a census must
try each, and an equivalent mutant is NAMED, not counted ("compare run k to run k-1" gives the same verdict for every
input, so it is no gap). Now: self-tests ad 83, bb 69 (--fixtures 93), dd 107 (124), ic 83, ibd 92; node:test MUTANTS
ibd nullctl-off, -before-side-off, -after-side-off, -run2-only, -last-only, -maglev-off, -only-fn-off; bb
null-control-run2-only, -last-only; ic M-nc-k3 (row 82) and M-nc-bef (row 83); each red on exactly its rows and every
new row red on the pre-NULLCTL roots. r2 APPROVED. Count pins moved in audit-g5, audit-xs, bytecode-budget-stage and
bytecode-budget-stage-boundary (bb 59 -> 60 without git; #114 again). The ibd rows use a POSIX-sh fake node (law 7).
Tier DETERMINISTIC. (d) Evidence: `.handoff/RULINGS-b70.md`, `.handoff/PLAN-b70-nullctl.md`,
`.handoff/evidence/b70-nullctl/CENSUS.md` (local, untracked).

---

**#119 G-SIG-2 (b71): the last driver runs inside `$( )` (Q-B66-SIG, Q-B70-ADPIPE, Q-B71-TMPLEAK, Q-B71-TRAPS; closes
#92 (e), #117's residual; commit aed6684).** (a) Defect class and mechanism: allocation-diff's run_side,
bytecode-budget's per-fn probe runs and inlining-budget-diff's bytecode probes still ran the driver inside `$( )`, so a
SIGTERM / SIGINT / SIGHUP waited for the in-flight run (085c54d: ~30 s, coder probe) and a killed probe could leave one
`bytecode-budget.XXXXXX` / `inlining-budget-diff.XXXXXX`. All three are now main-shell jobs `( cd .. && exec env ..
) >FILE 2>&1 <&0 & drv_wait`; the `tee | tr | awk` parse reads FILE in a `$( )` that runs no driver. bb / ibd hand back
PROBE_OUT (byte-equal to the old `$( )` value); bb reuses BB_TMP and its chained EXIT trap, ibd gains IBD_TMP and a
chained EXIT trap. The die-in-`$( )` census guards go 6 -> 1 (lib/common.sh refuse_live). Q-B70-ADPIPE: ad's driver
stdout is now the regular file `$T/run.out` (bb / dd / ibd / ad all write driver output to a regular file), with dd's
64 KiB append check: a full TMPDIR is NO-VERDICT `(append exited N)`, order awk > tr > tee > append > driver; the
pipe-era console.log drop no longer applies to ad (-h keeps the old measurement, labelled pipe-era). -h of bb, ibd and
ad say a signal now SIGKILLs the run and the temp goes with the EXIT trap. Residuals (-h): a signal inside
`$(mktemp)`, a SIGKILL of the tool. Coder probes (bash 3.2, PRELIMINARY host, REPORTED): ad / bb / ibd exit 2 8-13 ms
after the signal in the run / probe phase. Golden vs 085c54d: 106 / 112 files byte-identical, only ad / bb / ibd -h and
--help stdout differ; self-tests unchanged (ad 83, bb 69 (--fixtures 93), dd 107 (124), ic 83, ibd 92); spawn and
mktemp counts unchanged. Roots: allocation-diff.sh 129a90bb -> 29d6e484, bytecode-budget.sh eff64188 -> 0b9c9157,
deopt-diff.sh 03f90d3d -> fc04657d, ic-diff.sh a7334599 -> f4a6f429, inlining-budget-diff.sh 5875cc34 -> 06927a13 (dd /
ic by the prologue comment only); lib/prologue.sh 6a5ea148 -> 29b5811f. (b) Review r1 REJECTED (2 LITERAL), r2
APPROVED: (1) bb's / ibd's chained EXIT trap ran `rm -f` before `set +e`, so a failing rm under set -e exited the trap
rc 1 (a DIFF code, fail-open) instead of 2; both traps now turn set -e off FIRST (audit-sig RMFAIL rows, red on the
pre-fix roots). The same rm-before-`set +e` shape in 6 PRE-EXISTING traps (allocation-diff :348 / :920, deopt-diff :577
/ :1408, ic-diff :332 / :881) was ruled its own unit, not this round (Q-B71-TRAPS). (2) The TMPLEAK row bypassed the
runner it guards (see (c)). (c) TMPLEAK lesson (law 10 applied to tests; Q-B71-TMPLEAK): test/inlining-budget-diff.test.mjs
ran each mutant's `--self-test` with the caller's TMPDIR (cleanEnv() never sets it), so the `probe-no-rm` mutant left 7
`inlining-budget-diff.XXXXXX` files in the shared TMPDIR per npm test: 245 found (35 runs since b62, 7 per run, sizes
32768 / 65536 / 65583 / 67120 / 67125), removed with the maintainer's OK (Q-B71-TMPDEL). The tools themselves did not
leak (TERM / HUP / KILL mid-probe on 085c54d left 0 files). Rule: a mutant runner whose mutant drops a temp `rm` gives
the child a PRIVATE TMPDIR, or the suite leaks into the shared one; the leak was found by a residue census of the
shared TMPDIR, not by any gate. Now every mutant run there goes through mutSelfTest with a private TMPDIR, and a row
fails if the leak lands outside the mutant's own dir. (d) Gate: test/audit-sig.test.mjs, 90 -> 119 tests, DETERMINISTIC,
second old twin `git show 085c54d:<root>` (CI_STRICT): A1 kill rows (ad run, bb probe diff + file mode, ibd probe, x 3
signals, exit <= 10 s, twin overrun row), A2 retention with bb / ibd trap-rm mutant teeth, STDIN per-site ` <&0 &`
mutants (ad, bb / ibd probe sites), A4 ad append fail-closed under `ulimit -f 32` with a no-append mutant, RMFAIL.
Sibling rows moved (#114): allocation-diff E1 / E4 / E5 / R1, audit-g1 redir-in-cd / noapp-probe, bytecode-budget-awk
TEE / TR_PLAIN, bytecode-budget-diff-boundary A1-gate-raw-name / M-two-loops, ext-audit-inl probe tr / MUT_PROBE,
inlining-budget-diff probe mutants and the -h pin, deopt-diff-boundary A4 ibd parity pin 5875cc34 -> 06927a13. npm test
(private copy with .git + frozen fillers-final, /bin/bash 3.2, quiet lock, host PRELIMINARY load1 1.93): 3256 tests,
3244 pass, 0 fail, 12 skip, rc 0, 1754 s. Evidence: `.handoff/PLAN-b70-gsig2.md`, `.handoff/RULINGS-b71.md`,
`.handoff/evidence/b71-tmpdir/FINDINGS.md`, `.handoff/evidence/b71-gsig2/`, `.handoff/evidence/b71-npm/` (local,
untracked).

---

**#121 final review fixes (b73 / b74): F-A, F-B, F-C, F-D, F-E (audit 2026-11-11-final; rulings Q-B73-FACOMMIT,
Q-X-IBD-SCOPE, Q-XF-CR, Q-B74-FCSEAM, Q-B74-FESCOPE).** (a) F-A (ffff1f7; findings ic-fable-1, IBD-opus-b-1; both class 1). ic-fable-1: an inherited
`BASHOPTS=nocasematch` (bash >= 4.1) made `[[ == ]]` ignore letter case, so ic-diff read two IC multisets that differ
only in a key's case (`value` vs `Value`) as SAME, exit 0. lib/prologue.sh now runs `shopt -u nocasematch` right after
`set -euo pipefail`, before any string compare, in all five roots; bash 3.2 was never affected (it ignores BASHOPTS).
IBD-opus-b-1: ibd ref mode kept `git rev-parse --short` and handed it back to git; a tag or branch named like that
abbreviation wins over an abbreviated object name, so the wrong commit was staged and the run read a wrong SAME.
lib/modes.sh resolves the full sha and stages from it; the head now prints `<ref> @ <sha 12>` (was <sha 7>), the form
bb and dd already print. Gate: ic-diff.test NOCASE (bash >= 4.1; counted SKIP without one, FAIL under CI_STRICT on
linux; the ef9cf7f twin reads SAME) and ibd-u2.test FULLSHA (tags named like every prefix 4..40 of the before sha;
12-hex heads; the `--short` and re-abbreviate-before-show mutants red). Review claude-opus-5-5 APPROVED r1; mutants
nocaseglob, shopt after the compare, `shopt -s`, `${sha:0:7}` in show, head `${sha:0:7}` and full, `--short=12` all
caught. npm test (private copy, /bin/bash 3.2, host PRELIMINARY, load1 2.69): 3300 tests, 3286 pass, 2 fail, 12 skip,
1648 s; the 2 fails were the A4 parity pin and its teeth row (root moved on purpose); re-pin 5b9f3c26 -> 76c31db5, then
test/deopt-diff-boundary.test.mjs 110 / 110 (host QUIET, load1 2.02). Q-B73-FACOMMIT: F-A landed alone (its approved ibd
root staged from the overlay copy) because F-B had already rebuilt the same live root. CI proof of b72 (run 43049200147,
ef9cf7f): 8 / 8 legs green (see #120). (b) F-B (c1618a5; finding ibd-fable-1, class 1; Q-X-IBD-SCOPE (a)). The default
scope was the whole trace, so node's own functions entered it or not with the driver's path length, which differs
between the two sides (`stage/before/` vs `stage/after/`): `normalizeString` (node:path) reaches Maglev once node
resolves a path of >= 45 characters, and byte-identical programs read DIFF. Now the default scope is every decision
line of the compile units that involve a named `--fn` (a unit that compiles it, or has a decision line naming it):
SCOPE_AWK gains hit() and a marking pass (`pass=1 FILE pass=2 FILE`). Under `--concurrent` every line is unit `*` (no
attribution), so a DIFF in which no differing line names a `--fn` is NO-VERDICT, exit 2. Cost (stated in -h): a real
change seen only through an unattributed line under `--concurrent` is NO-VERDICT; `--only-fn` or dropping
`--concurrent` gives a verdict. Gate: test/ibd-scope.test.mjs (fake node, canned traces; G1-G4b, G6 / G6c, G7 / G7s, 9
mutant rows, ef9cf7f history rows, G5 real node opt-in `LITEUTILS_IBD_LIVE=1`). Review r1 REJECTED (2 LITERAL,
test-only, GATE TEETH: multi-fn and INLINE / SKIP fail-open mutants survived); fix round G6 / G6c / G7 / G7s + 4 mutant
rows; r2 APPROVED. npm test (host QUIET, load1 1.91): 3331 tests, 3317 pass, 0 fail, 14 skip (b72's 12 + the 2 opt-in
G5 rows), rc 0, 1597 s. A4 pin 76c31db5 -> 706adc81. (c) F-C (035e939; findings dd-fable-1, DD-opus-a-1,
ibd-cross-opus-1; class 3). bb, dd, ic and ibd truncated an input file (a driver, `--driver`, `--before`, `--after`)
that IS `OUT/report.txt` (ad already refused); ibd also wrote `OUT/budget.<tier>.tsv` and `OUT/<all | fn>.<tier>.diff.txt`
in place, through a symlink, a hard link or over an input file: exit 0 SAME with the victim destroyed. Fix: lib/common.sh
`rep_refuse` (pure builtins, `-ef` over `report.txt ${OUT_NAMES-}` x every input value), dies `--out: OUT/<name> is an
input file of this run (<x>): the run would overwrite it`, exit 2 before any spawn or write; ibd fills OUT_NAMES per
tier and refuses a symlink / an extra hard link at each name first. Review r1 REJECTED (3 LITERAL), r2 APPROVED: (1) an
inherited-env read: `env OUT_NAMES='*'` refused a valid run, so bb / dd / ic now assign `OUT_NAMES=""` on their
defaults line; (2) no `--before` / `--after` row, so mutant M12 survived; (3) bb's write ordering was ungated, so mutant
M11 survived. M11, M12, M13 / M14 (the OUT_NAMES reverts) each turn rows red. Gate: test/out-input-refuse.test.mjs, 60
tests (25 live rows, 25 old twins on `git show c1618a5:<root>`, 4 controls, 6 ROW 8 rows). npm test (host PRELIMINARY,
load1 3.65 vs baseline 2.21): 3391 tests, 3376 pass, 1 fail, 14 skip, rc 1, 1590 s; the fail was audit-sig PSUB ic (see
#114: the stop-gate suite caught a sibling anchor). A4 pin 706adc81 -> 6bb459f3. Roots after F-C: allocation-diff
953026e3, bytecode-budget e399e975, deopt-diff 7030e57e, ic-diff 4d5d3214, inlining-budget-diff 6bb459f3; lib/common.sh
9573fe7a -> 3237d5b1. Tier DETERMINISTIC. (d) F-D (768c388, APPROVED r2; findings
IBD-opus-b-2, DD-opus-a-2, lib-cross-fable-1; Q-XF-CR (a) "Refuse in all values"). Before: a CR in a resolvable ref or
a committed `--module` dir reached node and `--out`; a CR in `--repo`, a missing `--driver` / `--before` / `--after`
was echoed to stderr; an ibd ref with a newline or CR reached node and `--out`. Fix: lib/stage.sh's newline-only loop
became one `nl_refuse` over the seven bb / dd values (`--before-ref`, `--after-ref`, `--before`, `--after`, `--module`,
`--driver`, `--repo`); ibd: one `nl_refuse` over `--before-ref`, `--after-ref`, `--driver`, `--repo` in the G-X6
preflight; bb / dd -h say "no newline or CR". Review (claude-opus-5-5) r1 REJECTED, LITERAL, FAIL-OPEN class "a refusal
that echoes the value fires before the value's own CR refusal": the fix spec (fixC) predates F-C's rep_refuse, so in
ibd a `--driver` with a CR that is `-ef OUT/report.txt` was printed by rep_refuse first; the CR line moved above it
(row 4b); r2 APPROVED. Rule: a fix spec written against an older snapshot can be ordered wrong against a fix that landed
after the snapshot; re-derive refusal ORDER on the live tree (fixC vs F-C). The same seam for ibd POS /
`--before` / `--after`, dd POS and ic POS is closed by (e), unit F-E (Q-B74-FCSEAM, Q-B74-FESCOPE, `.handoff/RULINGS-b74.md`). Gate:
test/ref-cr-refuse.test.mjs, 77 tests, old twins on 035e939, mutant rows. (e) F-E (working tree, APPROVED r1, not yet
committed; finding fd-rev-1 from the F-D r1 reviewer; Q-B74-FCSEAM, Q-B74-FESCOPE). In ibd, dd and ic, F-C's
rep_refuse (it prints the input value) ran before the G-X6 newline / CR refusals, so an input with a CR that was `-ef
OUT/report.txt` (or an ibd OUT_NAMES file) put a CR on stderr. The call moved below G-X6 (dd / ic: out of the `--out`
block as `[[ -z "$OUT" ]] || rep_refuse ...`), still before any node / git / mktemp spawn or write (review decided: in
this suite "spawn" = node, git, mktemp; bb already ran sha8 before rep_refuse). The refusal ORDER changed for non-CR
inputs (all still refused). bb already had the right order (pinned by 2 bb-clean pins, live + 768c388). Gate: ref-cr-refuse 96 tests (6 rows +
768c388 twins, 2 bb pins, 3 move-back mutants). Evidence: the three commit messages, `.handoff/RULINGS-b73.md`,
`.handoff/RULINGS-final-review.md`, `.handoff/evidence/b73-npm/`, `.handoff/evidence/b74-npm/` (local, untracked).

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
60 s cap per spawn. Evidence: CHANGELOG "V8-TIMEOUT" line 477. b73 (#120 (e)): the 120 min job cap was raised to 180 min (Q-B73-CITIME, ffff1f7; three of the four macOS legs ran 108-118 min in run 43049200147).

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
Q-B65-SIGTERM ("Test oracle per bash"; superseded b70 by #117, text now `interrupted (SIG<X>)`): A3 keeps (exit 143) on bash 3.2; on bash >= 4 it asserts an `unexpected
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

**#115 CI-CAP: self-test caps sized to the slowest CI leg (burst 68).** Run 42885917245 (dc4a10c), macOS node 24,
failed one row: inlining-budget-diff.test.mjs "--self-test MUST FAIL on mutant no-newline-refusal" at 60187 ms against
its 60000 ms cap; run 42865876509 (5fcffb5), macOS node 26, failed "mutant trap-ignores-final" the same way at 61322 ms.
Both mutants were going red as designed (FAIL lines in stdout): the cap was sized below the slowest leg; the rows pass
their assertion when not capped (law 8). The label "killed by SIGPIPE" is not the cap's signal: it names the signal
that ended bash after the trapped TERM (#73: spawnSync sends SIGTERM to bash only and closes the pipes; the EXIT trap's
printf to the closed stderr dies by SIGPIPE; re-probed this burst). test/spawn-cap.mjs unchanged (FROZEN).
Policy (orchestrator): a cap that bounds ONE whole --self-test spawn is >= 3x the slowest CI observation of any row it
bounds, rounded UP to 30000 ms; never lowered; non-self-test caps, killSignal and --test-timeout unchanged. Data: every
top-level row of all 16 leg-runs of the two runs (11 of the 16 legs (all 8 of run 42865876509, 3 of run 42885917245) log the step as "UNKNOWN STEP", so the first
SLOW-ROWS.txt, built from "npm test" lines only, saw 5 legs and missed 11). A pooled (async) row's time includes its queue wait, so
the per-spawn time is read from the run's own ms diagnostic (deopt-diff) or the pool's wave timing (a 6-row window).
Changed (old -> new, slowest bounded spawn, ratio): inlining-budget-diff.test.mjs selfTest and the --self-test=x row
60000 -> 210000 (61.3 s, 3.4x); bytecode-budget.test.mjs run() 120000 -> 180000 for a --self-test argv only (59.0 s
M-fifo-off, 3.1x; the 93.9 s G-ENV teeth row is 2 equal self-tests, ~47 s each); deopt-diff-boundary.test.mjs fxRow
240000 -> 330000 for a --self-test argv only (102.2 s K2-gotopt-substring, 3.2x); deopt-diff-stage.test.mjs selfRun
240000 -> 330000 (87.4 s ST.base, the one directly observed spawn of the 3-wide pool; 330000 covers 110 s; the 105.2 s
"A3 teeth" row is mostly queue wait); allocation-diff.test.mjs:192 runSelfTest armCap 600000 -> 630000 (<= 200.4 s
M10b, macOS node 26, run 42865876509, 6-row window bound: the first wave is nbase + M1..M5, so M10b starts at >=
C(M1) = 246.1 s and ends at 446.5 s; 3.1x); audit-g2.test.mjs 3 dd self-test calls 170000 -> 360000 (99.3 s in this
file, 103.3 s the slowest dd spawn anywhere, 3.5x); audit-g5.test.mjs run() 90000 -> 210000 for a --self-test argv
(59.4 s, 3.5x); audit-xs.test.mjs run() / runN() default 120000 -> 210000 for a --self-test argv (no CI data: the file
is new at 43c4ac5; ibd 61.3 s / bb 59.0 s). Already >= 3x (unchanged): deopt-diff.test.mjs SELF_CAP 360000 (103.3 s),
RUN_CAP 540000 (164.8 s run ms), NBASE 900000 (196.7 s), FIX_CAP 780000 (218.4 s); ic-diff.test.mjs 300000 / 300000 (55.6 s sync, ~95.7 s pooled); ext-audit.test.mjs
run() 300000 (dd B2 75.4 s); ext-audit-alloc 480000 (B2 137.4 s); ext-audit-inl SELFCAP 600000 (46.3 s); audit-g3
600000 (142.8 s); bytecode-budget-stage 240000 (54.1 s); bytecode-budget-stage-boundary 240000 (51.8 s);
deopt-diff-boundary selfTestRun 240000 (66.4 s). The allocation-diff R8 row (932.6 / 981.3 s) waits for every other
self-test of its file to settle before it launches; its armCap starts at its own spawn, so the cap never saw the wait.
File timeout (node 22 bounds each WHOLE file; package.json --test-timeout=3600000): (a) observed CI wall, as the sum
of the file's top-level row times on its slowest leg: ibd 2200.8 s (macOS node 26), bb 1592.3, dd-boundary 691.3,
audit-g2 332.5, audit-g5 296.4, dd-stage 259.9; audit-xs none (new). All under 3600 s (ibd 61%), so the timeout stays
the all-hang backstop and package.json is unchanged. (b) worst-case sum of the self-test caps, before -> after: ibd 82
spawns 4.92M -> 17.22M ms; bb 41 spawns 4.92M -> 7.38M; dd-boundary 21 spawns 5.04M -> 6.93M; dd-stage 3 waves
0.72M -> 0.99M; audit-g2 0.51M -> 1.08M; audit-g5 4 spawns 0.36M -> 0.84M; audit-xs 20 spawns 2.40M -> 4.20M (the
other caps are unchanged and not summed). ibd, bb and dd-boundary were already past 3600000 before: a fully hung file
dies by the file timeout, not row by row. Not covered by the policy: test/bytecode-budget-stage-boundary.test.mjs
~:665 waits at most 60 s (3000 x 20 ms) for a checkpoint inside a --self-test before its SIGINT; same risk class on a
slow leg (FILLERS). Measured numbers are REPORTED (hosted CI, 2 runs, 16 leg-runs). Evidence:
.handoff/evidence/b68-ci/ (SLOW-ROWS-16.txt, perfile.mjs, gh-run-*.log; local, untracked).

---

**#120 CI-HANG (b72): an operand-less `wait` in `_sig` hung every ubuntu leg (Q-B72-REPRO, Q-B72-G1FLAKE; findings
lib-opus-c-1, ic-fable-2; commit ef9cf7f).** (a) Symptom: CI run 42965376108 (085c54d) was RED on every ubuntu leg
(node 22 FAILED at the 3600 s per-file bound; node 24 / 26 / 26.8.2 CANCELLED at the job timeout); macOS (bash 3.2) was
green. Mechanism, reproduced by two independent final-review lanes (lib-opus-c-1, claude-opus-5-5; ic-fable-2, Fable
5.2): `_sig` (lib/prologue.sh) ran a bare `wait` after `trap '' INT TERM HUP`. On bash 5 a bare wait also waits for a
live `< <( )` writer, which is not a job, is never killed and is never drained inside the trap: the tool hangs, ignores
every later INT / TERM / HUP, and only SIGKILL ends it. bash 3.2's bare wait ignores process substitutions. The
reviewer's reproduction (deopt-diff file mode, a 30000-file repo, SIGTERM during is_tracked's `git ls-files -z`) is RED
on aed6684 and GREEN on the fix under bash 5.3.20 (exit 2 `interrupted (SIGTERM)` after 100 ms). (b) Fix: `_sig`
SIGKILLs each pid of `$SIG_PID $(jobs -pr)` once, before any reap (deduped: during drv_wait both name the driver and
bash's SIGCHLD handler reaps it inside the kill pass, so a second kill would hit a freed pid; review r1), then waits by
pid on that list. No operand-less wait is left; `jobs -pr` also covers a signal between the `&` and drv_wait's
`SIG_PID=$!` (the old `_sig` skipped its kill there and waited the run out). Residual: bash's SIGCHLD handler may reap
a listed job between the listing and its kill. -h, --help and --self-test of every root byte-identical (15 vectors);
self-tests ad 83, bb 69, dd 107, ic 83, ibd 92. (c) Harness (Q-B72-REPRO "CI only + ps dump": no local ubuntu, no
container): test/spawn-cap.mjs gains psGroup, armGroup (detached child, at cap a `ps` dump of the pgid, group signal,
SIGKILL after a grace; law 8 re-check after a blocked loop) and capSync `opts.group`, so a hung signal row ends as a
NAMED timeout with a ps dump instead of a 3600 s file kill (audit-g2 sigtermRun, the deopt-diff- / bytecode-budget-
stage-boundary escalations, ic-diff.test, ext-audit). Rows: spawn-cap.test G1-G4 + law-8 control, S6 runner census;
audit-sig T (no operand-less wait; 6 on aed6684), PSUB (lib-opus-c-1's gate; bash >= 5, CI_STRICT on linux; aed6684
twins = named timeout), W (SIGTERM between `&` and drv_wait, 5 roots; aed6684 twins time out on bash 3.2 and 5.3.20);
audit-g2 A3 tooth. (d) Review r1 REJECTED (2 LITERAL: a kill after the reap of a duplicate pid; G3 had no teeth on the
group kill), r2 APPROVED. Q-B72-G1FLAKE: the b72 run 1 (r1 tree, PRELIMINARY host) failed only the pre-existing,
host-dependent audit-g1 "A1 real BB-opus-1 twin" (statuses 2,2,1 under load; passed alone at load1 1.94); ruled re-run
the full suite once as the stop gate (FILLER 1: make the twin load-proof). npm test (private copy with .git, private
TMPDIR, /bin/bash 3.2, quiet lock, host QUIET at start, load1 1.77): 3288 tests, 3276 pass, 0 fail, 12 skip, rc 0, 1669
s. (e) CI proof (b73, run 43049200147, ef9cf7f): 8 / 8 legs green, 3288 tests, 0 fail on each; ubuntu runs bash 5.3.9
with uutils env 0.10.0, the env exec probe reads `comm=sleep children=[]` (env execs: the uutils-env lead is closed),
the PSUB rows ran and the aed6684 twins reach their named timeout, so the old `_sig` hung on bash 5.3.9 too. Three of the four macOS legs ran 108-118 min wall (node 26: 63 min) against the 120 min job timeout: raised to 180 min (Q-B73-CITIME, ffff1f7). Roots: allocation-diff
29d6e484 -> fbed0e8b, bytecode-budget 0b9c9157 -> c01fce6b, deopt-diff fc04657d -> 178bb508, ic-diff f4a6f429 ->
850606e0, inlining-budget-diff 06927a13 -> 5b9f3c26; lib/prologue.sh 29b5811f -> 24527638. Closes #117 (e)'s bare-`wait`
and bash >= 5.1 residuals. Tier DETERMINISTIC. Evidence: `.handoff/PLAN-b72-cihang.md`, `.handoff/RULINGS-b72.md`,
`.handoff/evidence/b72-cihang/`, `.handoff/evidence/b72-npm/`, `.handoff/evidence/b73-ci/CI-READ.md` (local,
untracked).

**#128 Nightly on node 27 alpha (b78): two test oracles keyed on the wrong input (Q-B78-ICV8, Q-B78-PACK,
Q-B78-LATEST).** Class: none -- test-oracle defects, no wrong verdict, no tool change, no A4 re-pin. Scheduled nightly
43220611758 (df7dcb2, 2026-11-12): node `latest` = v27.0.0-alpha.0.0.0 (V8 15.6.75.25, npm 12.1.0) failed 4 rows on
ubuntu (audit-g4 A1 / A2 real node; pack.test A1 and its history twin); macOS `latest` was cancelled at the 120 min
job timeout. Earlier reds on the same `latest`: 42817727624 (bb prerelease rows, fixed by Q-B65-NODEPRE in 5fcffb5,
#105) and 43015590140 (the same audit-g4 rows on macOS latest, plus the ubuntu node 22 SIGTERM-row hang fixed by b72
CI-HANG ef9cf7f, #120). (a) audit-g4 A1 / A2: the rows keyed the expected verdict on V8 major 14 exactly (`/^14\./` of
process.versions.v8), but ic-diff gates on the code-kind allowlist, not on a V8 version. V8 src/objects/code-kind.h
CODE_KIND_LIST is identical at 14.6.202.34 and 15.6.75.25 (READ from source: 0 BYTECODE_HANDLER .. 3 BUILTIN, 4
REGEXP, 10 INTERPRETED_FUNCTION, 11 BASELINE, 12 MAGLEV, 13 TURBOFAN_JS, 14 WASM_STACK_ENTRY), so SAME on V8 15.6 is
correct. A shifted numbering would still end NO-VERDICT: every run log carries thousands of `Builtin,3` and ~140
`Eval,10` code-creation lines (MEASURED b78, --runs 2 mono vs poly with --out: node v26.8.2 3322 Builtin,3 / 140
Eval,10; node v27.0.0-alpha.0.1.0 (V8 15.6.75.50) 3836 / 140; kinds seen on both: Builtin,3 BytecodeHandler,0 RegExp,4
JS,10 JS,11 JS,12 Eval,10), so a shift of BUILTIN or of the JS range leaves the allowlist. Both nodes printed the same
VERDICT DIFF (get LoadIC x 1 -> P) on that mono vs poly pair. Q-B78-ICV8 (a) "Test fix + document": the real-node rows
expect SAME on V8 >= 14 and the refusal below 14, plus canned version rows; docs say V8 15.6 has the same numbering;
src/ic-diff.sh and its -h known-limit line are NOT changed. (b) pack.test A1: npm 12 (npm/cli PR 9247, merged
2026-04-16, BREAKING CHANGE) prints `pack --dry-run --json` as an object keyed by package name, not an array.
Q-B78-PACK (a): the test accepts an array of exactly one package (npm <= 11) or an object with exactly one key equal
to the package name (npm 12), each holding a files array; canned rows cover both good shapes and the must-fail shapes
(two packages, the wrong key, no files). (c) Q-B78-LATEST (a): `latest` (the first entry of
nodejs.org/dist/index.json, alpha included) is kept on purpose, the nightly is an early-warning signal and never a
required check; only the job timeout goes 120 -> 180 min (as ci.yml, Q-B73-CITIME). Reproduced locally on
v27.0.0-alpha.0.1.0 (V8 15.6.75.50, npm 12.2.2; downloaded with the maintainer's OK, Q-B78-DL): the same 4 red at HEAD
3e2aa5f, all green after the fix. Rule: key a test's expectation on the range the tool's real gate accepts (the
code-kind numbering: V8 >= 14, checked in source at 14.6 and 15.6), never on one exact version; a later V8 that shifts
the numbering turns the nightly red, the early warning; parse a tool's JSON by its documented shapes, each with a
must-fail row. Fixed in the b78 triage commit. Tier DETERMINISTIC. Evidence: `.handoff/evidence/b78-repro/`,
`.handoff/RULINGS-b78.md` (local, untracked).

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
newline in its name forged a column-1 `VERDICT SAME` (T1.4 missed that route); the refusal now also covers
`$PWD` (see #116). (d) bash 3.2 counts `ulimit -f` in 1024-byte blocks outside posix mode (a limit is not in
bytes). (e) A redirect-open
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
(bash 3.2; bash 5 prints `(exit 0)`, see #106; superseded b70, #117: `interrupted (SIGTERM)`) where the before build printed `(exit 0)`; on bash 3.2 the trap's
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
design: `V8_14 = /^14\./`; a node whose V8 major is not 14 but whose code-kind numbering still matches 14.x would make the fix rows red,
the signal to re-measure the table. Measured (node 26.8.2, V8 14.6): V8_14=false -> A1 / A2 real red; off-14
emulation -> 4/4 real rows pass; twins at the cut fix root -> red on 'no IC log'. Roots: ic-diff.sh 50a6fc34 ->
ea9f4f70, src f1568ac8 -> f8ef611a. Evidence: `.handoff/RULINGS-b66-ic.md`, `.handoff/evidence/b66-ic/` (local,
untracked).

**#114 b67 G-XS: a rule change breaks the sibling rows that relied on the old rule.** Last-wins became given-twice in
ibd, and test/ibd-u2.test.mjs F8 / F14 and the ibd self-test refusal() helper had relied on the old rule and went red.
Rule: a targeted test list must include every file that runs the changed root (test/ibd-u2.test.mjs, and the
test/deopt-diff-boundary.test.mjs parity pin of the ibd root), not only the new gate. The old self-test last line (`all
checks passed`) was also re-anchored in test/inlining-budget-diff.test.mjs, test/bytecode-budget.test.mjs and
test/bytecode-budget-stage-boundary.test.mjs. See #113. Instance b74 (#121 (c), F-C): a fix that extends a shared source line breaks the sibling test whose injection anchor pinned the whole line: test/audit-sig.test.mjs PSUB_ANCHOR (ic-diff) matched the whole ic defaults line that the OUT_NAMES fix extended; only the stop-gate full npm test caught it (audit-sig PSUB ic red). The anchor now ends at `REPORT=/dev/null` (unique at a line start in the live, aed6684 and c1618a5 roots); likewise ibd-u2 F5's anchor matched 3 lines until narrowed. Rule: an anchor pins the shortest unique prefix, never a whole line that a later fix may extend.

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
deopt-diff too, not only bytecode-budget; it is ruled to G1, G2 and G5, not G0. (d) (superseded b70, #117: the trap is now `interrupted (SIG<X>)` in lib/prologue.sh) ic-diff's INT / TERM trap (`die
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
b67 (G-XS, X7): that mkdir failure now dies by name (`--out: cannot create ...`), no longer `unexpected error (exit 1)`; the
2 spawns stay. The `cannot resolve` and `cannot write` dies are backstops no test reaches (the preflight refuses first).
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
(another package). Open until the maintainer syncs it. b74 clause: the vendored copy now lags further: F-A changed the heads to `<ref> @ <sha 12>` and F-B / F-C / F-D / F-E changed the root (root sha8 ae0544f9 after F-E, uncommitted; self-test still 92); still the maintainer's sync.

**#83 Q-I1: ic-diff on node 22 and 24 ends NO-VERDICT (known limit, class 2; audit I1; b66 IC24).** Ruled DOCUMENT
(RULINGS-b56-audit-closure Q-I1): the code-kind numbering table (src/ic-diff.sh:193, 195, 215-216) is V8 14.x only, so
every node 22 run is NO-VERDICT, never a wrong verdict (usability only; package.json engines.node is >= 22). The audit's
candidate fix did NOT land: I4 and I5 are candidate-only and not present (landing the candidate would revive both: I4
needs its guard, I5 a decision). Text: one -h line (src/ic-diff.sh:139; names node 22 and 24 since b66, Q-B66-IC24).
Repro (audit reproduction.mjs on a copy): I1 RED; a canned node 22 log gives exit 2 NO-VERDICT. Node 24 MEASURED b66 (CI
run 42850759205, f23b6c6, v24.22.2, macOS + ubuntu): the same NO-VERDICT, `code kind outside the allowlist: Builtin,2`
(Q-B66-IC24). REPORTED, not measured (V8 branch heads 12.4 / 13.6 / 14.6 read via a fetch summarizer): node 22 and 24
share one numbering; V8 14 inserted FOR_TESTING_JS at 2, moving every later kind up one (Builtin 2 -> 3, Interpreted 9
-> 10, Baseline 10 -> 11, Maglev 11 -> 12, Turbofan 12 -> 13). Gate: a mutant widening the allowlist to node 22 numbers
survives --self-test but is caught by the Q-I1 row of test/ic-diff.test.mjs (canned `Builtin,2` and `JS,9` logs;
M-c7-node22, M-c9-node22); that widening is the fail-open the audit warned of (Maglev read as baseline). Evidence:
`.handoff/evidence/b56-ic-audit-closure.md`, audit 2026-11-04-ic-diff FINDINGS (local, untracked). Other I-ids: I2 / I3
/ I6 FIXED per that closure check, not mapped further here (#69).
b78 (#128): V8 15.6 (node 27 alpha) uses the V8 14.x numbering (code-kind.h CODE_KIND_LIST identical at 14.6.202.34
and 15.6.75.25, read from source), so ic-diff gives verdicts there; node 22 / 24 are unchanged.

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
driver, covered by "driver output is trusted" (-h). b67 (Q-B66-X11): bb -h now states it: a driver writing bare number
lines in every run alike can move bb's gate. Census (MEASURED, node v26.8.2): 0 of 4008 lengths torn inside their
digits. The Parameter-count rule is DECLINED (#112). (c) A driver that reopens /dev/stdout on Linux gets a new file
description at offset 0 and can overwrite earlier output: READ, not run (-h). (d) The baseline lists node's own
functions at startup only: an internal compiled after the driver imports something (e.g. node:fs) is missed (by
reading; -h). The list on node 26.8.2 has 24 names; of about 40 common names only `get` and `set` collide (MEASURED,
reviewer r1). (e) A killed run can leave one `bytecode-budget.XXXXXX` (no EXIT trap inside the `$( )` subshell; by
reading; -h). b70 (#117, G-SIG-1): base_list's temp is now removed on a signal; the probe `$( )` runs stay a G-SIG-2 residual. CLOSED b71 (#119): the probe runs are main-shell jobs; residual: a signal inside `$(mktemp)` or a SIGKILL of the tool. (f) With the default SIGXFSZ a file-size limit kills the shell: base_list's append ends the run with rc
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
MEASURED (28 of 180 runs before the fix, 10 `?` of 180 after). b67 (Q-B66-X11): bb -h states the trusted-driver
limit with the census (node v26.8.2, MEASURED): 0 of 4008 lengths torn inside their digits; a driver writing bare number
lines in every run alike can move bb's gate. A rule on the `Parameter count` line is DECLINED (#112). (b) A Maglev abort was not reproduced (`mlabort.js`:
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

**#106 b65 open limits.** (a) MEASURED on CI logs for deopt-diff only (audit-g2 A3, ubuntu bash 5.3.9; bash 4.x not
run), mechanism ARGUED: a SIGTERM while a tool waits for the driver prints `unexpected error (exit 0)` (EXIT trap $? =
0, then SIGTERM re-raised); the verdict stays NO-VERDICT (fail closed). allocation-diff, bytecode-budget and
inlining-budget-diff carry the same lib/prologue.sh:9 trap and no INT/TERM trap, so ARGUED to print it too; ic-diff
traps INT TERM (`die "interrupted"`, src/ic-diff.sh:851, :869) and prints `ic-diff: interrupted` instead (READ). A
prologue signal-trap fix is for the cross-script reviewer (Phase 7), Q-B65-SIGTERM. SUPERSEDED b70 (#117, G-SIG-1): a
SIGTERM now prints `<tool>: interrupted (SIG<X>)`, rc 2, one VERDICT NO-VERDICT, on every bash, bash 5 UNPROVEN until the next
ubuntu CI run of audit-sig (bb, dd, ic, ibd measured on bash 3.2; ad after its in-flight driver run, G-SIG-2; closed b71 (#119)); the SIGTERM
`(exit 0)` text is gone. (b) CLOSED b67 (G-XS, X8): bb's
refusal text "(as `node --version` prints it)" was false for prerelease nodes (v27.0.0-alpha.0.0.0 is refused); the text
now names a release version and -h says "Release versions only" (Q-B65-NODEPRE). (c) PROVEN on ubuntu (b67, CI run
42865876509 of 5fcffb5, node 22 and 24, GNU bash 5.3.9; node 26 legs success): the bash >= 4 branch of audit-g2 A3 and
its mutant GREEN, and the 45 fillers / pad rows (the pad fix of #105 (a)) GREEN; the only reds were audit-g4 A1 / A2
real (the oracle defect IC24 addresses in dc4a10c; its CI proof is open, #111). bash 4.x and the macOS legs were not
read. SUPERSEDED b70 (#117, G-SIG-1): audit-g2 A3's bash >= 4 branch is removed (one oracle on every bash).

**#109 G5c open limits.** Measured, read or argued is stated per item. (a) ARGUED: a V8 that drops --turbolev from
--v8-options (or lists it under a name this build does not read) while `--concurrent` is on gives units with no tag, so
neither the default check nor the @TF count fires; -h says the maglev tier is NO-VERDICT only through its check for
decision lines in TurboFan-tier (@TF) units, which --concurrent turns off. The turbo tier under an always-on Turbolev is
unverified. Not reproduced (no such V8). (b) MEASURED survivor: the `$` of `/@TF(-OSR)?(#[0-9]+)?$/` dropped survives;
the direction is a false NO-VERDICT for a function named like `x@TF` (fail closed). FILLER: a self-test row for a
function named `x@TF`. (c) No committed row for the CR strip or the `true` / `false` arms of the turbolev awk
(hand-checked on BSD awk only, B1 A3 "by awk alone"); dropping one dies "cannot read", fails closed. (d) READ: in ref /
file mode the default-on refusal leaves staged files in stage/ (modes.sh runs before the limits read); a rerun needs a
fresh --out, stated in -h. (e) UNPROVEN until the dc4a10c CI run reads green: the G5c rows on Linux, GNU bash 5 and gawk
(ubuntu legs: GNU bash 5.3.9, GNU Awk 5.3.2). mawk is in no CI leg and stays UNPROVEN. Everything above ran on BSD awk,
bash 3.2.57, macOS. The b67 read of run 42865876509 is of 5fcffb5, which predates G5c (6aa2cf3, whose run was
cancelled), so it proves no G5c row. The real-node old twin is opt-in only (LITEUTILS_REAL_HOLD=1). (f) MEASURED only on
node v26.8.2: a Turbolev-off real maglev + turbo run is SAME with 0 @TF lines (no false NO-VERDICT there); node 22 / 24
are not run (UNPROVEN).

**#111 b66 open limits.** UNPROVEN until the next CI run on the node 22 / 24 legs: the off-14 branches of audit-g4
A1 / A2 real (rc 2 NO-VERDICT 'code kind outside the allowlist') and of their old twins ('no IC log'); only V8 14.6
(node 26.8.2) ran them. See #83, #110.

**#122 lib-cross-fable-2: a refusal prints a name that git or readlink RESOLVED (class 3, known limit; Q-XF-LINK (a)
"Document now": no code change before 1.0.0).** A refusal line may print a name that git or readlink resolved (the
repository root, a symlink's target). A newline or a CR in such a name, behind a symlink with a clean name, reaches
stderr inside that one refusal (exit 2; the last line is still VERDICT NO-VERDICT; no report line is written). G-X6
(#116) covers the names the REPORT prints and the values as typed. Mechanism (RUN by the audit lane on all of ibd / bb /
dd; unchanged on its three fix variants): every argument and `$PWD` are clean, so `nl_refuse "the cwd" "$PWD"` and every
value check pass; the printed names are resolved later, by `git rev-parse --show-toplevel` (lib/stage.sh, lib/modes.sh)
and `resolve_links` (lib/common.sh), and `die` prints its text raw. Shapes: `--repo link` (a clean-named symlink to a
directory whose name holds a CR) with an unknown `--before-ref`: `... is not a commit in <top>/q<CR>VERDICT SAME<CR>z...`
(bb, dd; ibd from `cd link`); file mode `--before` a tracked symlink: `is a git-tracked working-tree file (<top>/q<CR>
VERDICT SAME<CR>z.../Signal.js)`. A reader or tool that splits stderr on CR sees a `VERDICT SAME` line. A newline in the
directory name works the same way (ARGUED, same lines). The report is not written in these rows (bb, dd: refused in
`stage_check`) or is 0 bytes (ibd: ARGUED from lib/common.sh `die`). Optional post-1.0 code fix, UNVERIFIED beyond the
12 refusal rows: `die` replaces a newline or CR in its text with `?` (two lines in lib/common.sh; all five roots
change); no self-test or test file was run on that copy, and any test pinning a multi-line refusal would need a look.
Same class, b77 (Q-B76-FGPATH (a)): the --node refusals print `$NODE_RES`; when it came from a PATH lookup (`command -v`),
a CR in a PATH directory name reaches `node binary is not an executable file: <dir>/node` (MEASURED by probe P6 on all
five roots at 861f3d3, `.handoff/evidence/b76-fg/P6.txt`; an executable node in such a directory is already refused by
`--node (resolved)`). Not changed by F-G (#126): a resolved name, not a raw argv value.
Evidence: `audit/2026-11-11-final/fable/cross/CROSSCHECK.md` "lib-cross-fable-2" (local), `.handoff/RULINGS-final-review.md`.

**#123 ibd-fable-2 = IBD-opus-b-3: the null-control NOTE ignores a differing Watch.js (class 2, triaged DOCUMENT).**
In ibd file mode the NOTE `before and after are byte-identical: this run is a null control (expect SAME)` is decided on
Signal.js alone, but the stage dir also holds Watch.js (staged beside each side, lib/modes.sh), so two sides with the
same Signal.js and a different Watch.js (a one-line helper vs a 120-statement helper, re-exported by an identical
Signal.js) print the NOTE and then `VERDICT DIFF`, exit 1. RUN (opus cross lane, snap, file mode; header: both sides
`sha256/8 8a298b04`). The verdict is right; the one NOTE line is false (the header also prints only Signal.js's
sha256/8). Reach: ibd file mode RUN; ibd ref mode ARGUED (lib/modes.sh stages the ref's Watch.js, same NOTE line,
src/inlining-budget-diff.sh); deopt-diff and bytecode-budget ARGUED out of reach (their NOTE comes from STAGE_SAME over
the one staged module). A NOTE-text limit, not a verdict change: DIFF is still reported. Not fixed (triaged DOCUMENT, final-review triage, no Q-id; the
audit lane's candidate fix kept DIFF and dropped the NOTE, and optionally would print the Watch.js sha256/8).
Evidence: `audit/2026-11-11-final/opus/cross/CROSSCHECK.md` "ibd-fable-2" (local).

**#124 SHELLOPTS=noexec: an inherited `SHELLOPTS=noexec` makes every root run nothing and exit 0 (class 2, known limit;
Q-B74-NOEXEC; source b73 F-A reviewer, claude-opus-5-5).** MEASURED on bash 3.2 and bash 5.3.20: `SHELLOPTS=noexec bash
./ic-diff.sh --no-such-flag` -> rc 0, no output. With `noexec` set no line of the script runs, so the exit 0 reads as
SAME by exit code with no VERDICT line, and it cannot be fixed inside the script (not even the prologue runs). Callers
must require the VERDICT line, not only the exit code. The README /
llms.txt Known-limits line landed in b76 Phase 6 (README.md and llms.txt "Known limits").
Evidence: `.handoff/RULINGS-b74.md`.

**#125 fe-rev-1: a CR in a path component that `..` removes reaches stderr in driver mode (class 3; FIXED b75 F-F, ruled b74
Q-B74-FERAW: fix next burst; source F-E reviewer).** In driver mode dd, ic and bb run G-X6 on the RESOLVED driver name
(DESC_B / DESC_A; bb DRV_DIR / DRV_BASE), but some refusals print the RAW positional (rep_refuse; also the older
`DRIVER (before) not found ...: ${POS[0]}` raw-echo refusals), so a CR in a component that `..` removes is printed.
Repro: `ic-diff.sh --fn m0 --out o b.js $'d\r/../o/report.txt'` (`d<CR>/` a directory) -> rc 2, stderr
`(d^M/../o/report.txt)` with 1 CR; same on deopt-diff and `bytecode-budget --diff`. ibd and staged mode are safe (they
nl_refuse the raw values). Not caused by F-E (768c388 behaves the same); exit 2, no verdict change. Any fix changes a
message (print the resolved name) or adds a refusal (nl_refuse the raw POS). Mirror case: #122 (lib-cross-fable-2).
Ruled 2026-11-12 (Q-B74-FERAW): unit F-F, next burst -- dd, ic and bb (driver mode) nl_refuse the RAW positional
values before any refusal can print them (as ibd and staged mode already do), + rows per tool.
FIXED 2026-11-12 (b75 F-F, commit 145c4bf): the b75 orchestrator's probes (Q-B75-FFSCOPE) found the same seam
wider: bb measure mode and ad's raw DRIVER, and the raw --out value in the --out refusals of ad, dd, ic, ibd; the F-F
coder (Q-B75-FFBBSTAGE) added bb ref / file mode's stage_check. Each root now nl_refuses the raw DRIVER positionals
(ad, bb, dd, ic) and the raw --out (all five) before the first refusal that echoes them; gate
test/ref-cr-refuse.test.mjs ROW 12 / 13. Lesson: the r1 reviewer's `${POS[0]}`-only mutant survived because every
DRIVER row put the CR in the BEFORE positional -- a check over a list needs a row per list position. Non-path raw
echoes were closed by #126 (b77 F-G).
Evidence: #121 (e), `.handoff/RULINGS-b74.md`, `.handoff/RULINGS-b75.md`.

**#126 Non-path refusals echo a raw argv value with its CR (class 3; FIXED b77 F-G, ruled b75 Q-B75-NONPATH: unit F-G; source b75
F-F coder's sweep, claude-opus-5-5).** After F-F the raw DRIVER and --out values are refused before they are printed, but some
refusals still print a raw argv value that is not a path: `unknown option $a` (all five roots), a --fn entry that fails FN_RE
(`got '$t'`: bb, dd, ic, ibd), `--v8-flags ... got '$f'` (all five), `--runs ... got '$RUNS'`, bb `--max` (`'$e'` /
`'$n'`) and `--node-version` (`'$WANT_VER'`), and `node binary not found: $NODE_BIN`. A CR in such a value reaches stderr:
exit 2, 0 spawns, no verdict change (UNVERIFIED per site beyond the sweep's reading). Ruled 2026-11-12 (Q-B75-NONPATH):
one LEDGER finding, unit F-G after F-F nl_refuses / stops echoing them. Also echoed raw (b75 docs reviewer,
claude-opus-5-5; not in the sweep): lib/v8flags.sh `--v8-flags must not set $f` (after the --version / --v8-options
spawns, so not 0 spawns), the --node path echoes `node binary is not an executable file: $NODE_RES`, `... not a file
on PATH ...: $NODE_BIN -> $NODE_RES` and `node binary: cannot resolve the directory of $NODE_RES`, and dd `--fixtures:
not a readable directory: $FIXTURES`; ibd's --fn check is an inline regex, not FN_RE. Mirror: #122
(lib-cross-fable-2), #125.
FIXED 2026-11-12 (b77 F-G, commit 747d995; rulings Q-B75-NONPATH, Q-B76-FGPATH (a), Q-B76-FGV8R (a)): the planner's
site table found ten sites, all cold and, except S5, before the first spawn: S1 `unknown option $a` (all five roots); S2
a --fn entry that fails FN_RE (bb, dd, ic; ibd's inline regex); S3 `--runs ... got '$RUNS'`; S4 `--v8-flags ... got
'$f'`, the deny arms and, not in #126, bb / ibd `$f needs =N` / `needs =X`; S5 lib/v8flags.sh `must not set $f`, which
ran after the --version / --v8-options spawns and is now covered by the S4 line before them; S6 bb `--max` (`'$e'` /
`'$n'`); S7 bb `--node-version`; S8 the --node echoes (`node binary not found`, `not an executable file`, `cannot
resolve the directory of`; the value also comes from `$NODE`); S9 `--fixtures: not a readable directory` (dd, bb); S10
ibd `unknown tier` (`--tiers`; not in #126). Mechanism: each root gets one block of fork-free `nl_refuse "<option>"
"$VALUE"` calls, one line per raw value, right after its existing newline line (so every existing newline refusal keeps
its text), plus one new parse-loop case arm that refuses an option name holding a newline or a CR (`-*` on ad, bb, dd,
ic; `--*` on ibd, which reads a single-dash argument as a DRIVER, refused by its G-X6 `DRIVER (resolved)` line,
ref-cr-refuse ROW 10). Text: `<tool>: <option>: a newline or a CR is not allowed (it would forge report lines)`,
`VERDICT NO-VERDICT`, exit 2, 0 spawns; the label names the option, never the value. No new spawn, subshell or write;
self-test counts unchanged. Gate: test/nonpath-cr-refuse.test.mjs, 395 tests = 93 refusal rows + 93 old twins on 861f3d3
(each fails there; all but the 5 V6 twins also show the raw CR / LF echo) + 83 controls + 5 budget rows + 54 mutants and
54 revert checks + 10 self-test count rows (5 tools x live / 861f3d3) + 3 census / retention rows (M1 arm dropped 5, M2
each line dropped 24, M3 block moved above NODE_RES 5, M4 first entry only 11, M5 arm newline-only 5, M6 arm narrowed to
`--*` 4), each mutant with a revert check; also audit-x6 ROW 5 / 5p and ext-audit N11 / N28 / N28p / MD38n. Lesson of
#125 applied: a check over a list needs a row per list position, and the first-entry-only mutants (M4) are the teeth
(--fn `add,x<CR>`, --v8-flags position 2, --max `add=1,b<CR>=1`, --tiers `turbo,<CR>maglev`). Review: B2 + B3 r1
REJECTED (test-only: no row put a CR in a SINGLE-dash option name, so a mutant narrowing the arm to `--*` survived;
fixed by row U4 and mutants M6), r2 APPROVED. Also closed: a report-head forge (Q-B76-FGV8R (a)): probe P5
(.handoff/evidence/b76-fg/P5.txt, real node v26.8.2) showed that `--v8-flags $'--stack-size=100\rx'` passed the shape
check, the deny arms and the allowlist on 861f3d3 and was written with the raw CR into the report head `v8 flags` line
of all five tools (node then refused it, rc 2); the new `--v8-flags` line refuses it first. Q-B76-FGPATH (a): a CR in a
PATH DIRECTORY name still reaches the `node binary is not an executable file: <dir>/node` refusal (P6,
.handoff/evidence/b76-fg/P6.txt: all five tools, a non-executable node in `p<CR>/` on PATH; an executable one is already
refused by `--node (resolved)`), because that name is resolved by a PATH lookup, not typed: no code change, documented
under #122 (README / llms.txt Known limits: "a name that git, readlink or a PATH lookup resolved"). CHANGED text: a CR
in a raw `--node` path (or `$NODE`) now says `--node:` (was `--node (resolved):`), and so does a newline on bb (was
`node binary: a newline is not allowed in the resolved path`, or a raw echo); the other tools' newline texts are
unchanged; `--node (resolved)` stays for a PATH-lookup name (audit-x6 ROW 5p, ext-audit N28p); a newline in --runs says
`--runs:`. B2 finding F1: bb's N11 `-ef` check (a PATH directory ending in a newline plus the same name without it) is
now reachable only that way, since a raw --node or $NODE is refused first; ext-audit N9 keeps the check statically (a
comment records it). Roots: ad cd026337 -> cfcaa43a, bb 409a1543 -> deeee04c, dd a6c13350 -> 95e12a28, ic d85d8b0e ->
15316298, ibd fe8919f5 -> 7a5cf99b; lib unchanged. npm test: 4034 tests, 4020 pass, 0 fail, 14 skip, rc 0, 1687 s
(.handoff/evidence/b77-npm/NPMTEST-fg.*). Tier: DETERMINISTIC. The README / llms.txt Known-limits bullet for #126 is
deleted.
Evidence: `.handoff/RULINGS-b75.md`, `.handoff/RULINGS-b76.md`, `.handoff/evidence/b76-fg/`.

**#127 X10 (audit 2026-11-10-cross-script): bb and ibd parse the --print-bytecode stream with two rule sets (class 3;
documented (Q-B77-X10 (a)); source b77 confirmation pass part B, claude-opus-5-5).** bytecode-budget's COUNT_AWK
(src/bytecode-budget.sh:279-288 now; :265-274 at 6aa2cf3, the finding cites 265-275) counts `<count> <bad> <lengths>`
for the function name; lib/v8probe.sh BYTECODE_AWK (:23-32, the finding cites 23-33; the same lines at 6aa2cf3) prints
the lengths, or `?` on a torn stream. MEASURED by the audit (BSD awk, fixtures in X10;
audit/2026-11-10-cross-script/FINDINGS.md:182-188, :233): the two tear forms of the b62 evidence, a header split by
newlines and `Bytecode length: ` / `50`, are caught by both (bb: bad > 0, judge NO-VERDICT; ibd: `?`); a blank line
between a whole header and its length is NO-VERDICT in bb (`3 2 3`) and read cleanly by ibd (`3,50`); bb needs the
length on the very next line and refuses a trailing CR, ibd accepts both; ibd checks that the header is whole, bb does
not (bb's adjacency rule catches the same tears). A tear inside the digits (`Bytecode length: 5` / `0`) is the separate
finding X11 (#112, DECLINED, Q-B66-X11 "Document"): both parsers read 5 with no bad count and no `?` (bb `2 0 3,5`, ibd
`3,5`). No wrong verdict was measured for X10 (class 3: bb is stricter; both fail closed on the two measured tear
forms). Confirmation pass, part B (.handoff/evidence/b77-confirm/B/CONFIRM-B.md, xs.rc.out, xs.control.out): the X10 row
is RED on the RC (b77, F-G B1 + B2 tree) and RED on the control 6aa2cf3, with identical output. The finding's own fix
text: "none required; note the two rule sets in LEDGER, or move both to one lib/ parser (DESIGN)". No triage record
existed: RULINGS-b66-cross.md routes X10 to no question and does not list it OUT. Ruled (Q-B77-X10 (a), maintainer
2026-11-12, RULINGS-b77.md): "Document; no code change before 1.0.0" -- a documented known difference (class 3: both
parsers fail closed on every measured tear form; bb is stricter); no README / llms.txt bullet; one shared lib/ parser
stays a post-1.0 candidate.
Evidence: `audit/2026-11-10-cross-script/FINDINGS.md`, `.handoff/evidence/b77-confirm/B/`.
