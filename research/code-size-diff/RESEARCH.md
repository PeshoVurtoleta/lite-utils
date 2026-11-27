# Research: `code-size-diff` (ROADMAP L4, target 1.3.0) -- v4

Status: research drop v4 (INTAKE + self-checking probes + runnable prototype; not a shipped script).
Folds in L8 `ir-diff` research (final Turboshaft IR multisets, section 5).
Every Q-CSD-* id in section 4 is UNRULED.

Provenance (this pass): 2026-11-27T08:27Z-08:35Z, `darwin-arm64`, `/bin/bash 3.2.57(1)-release`, BSD awk.
Each phase ran under `quiet-lock.mjs run` with the host QUIET (load1 2.58-3.53, baseline 2.34).
Tier: REPORTED (untimed; sizes and verdicts, no timing claims). 5 env vars stripped (`NODE_OPTIONS`,
`NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE`, `NODE_REDIRECT_WARNINGS`, `NODE`). One run per phase.
Node binaries probed (verbatim `--version` / `process.versions.v8`):
- `v22.23.5` (`V8 12.4.254.21-node.57`)
- `v24.22.3` (`V8 13.6.233.17-node.63`)
- `v26.3.1` (`V8 14.6.202.34-node.20`)
- `v26.8.2` (`V8 14.6.202.34-node.28`)
- `v27.0.0-alpha.0.1.0` (`V8 15.6.75.50-node.11`)

Evidence logs (local, gitignored): `.handoff/evidence/csd-v4/` -- `A-*.log` (v3 baseline), `BC-v4-*.log`
(v4 probes), `C3-escapes.log`, `D-B1-identity.log`, `D-B3-xscope.log`, `D-B4-codemove.log`,
`D-B5-mechanisms.log`, `E-ir-diff.log`, `B-mutants-and-teeth.log`, `B-selftest-v4.log`.
Self-checking probe runner: `probes/run-probes.sh` (exits 0 iff all assertions pass).
Runnable blueprint: `code-size-diff.prototype.sh` (`--self-test`: 45 checks).

> **Coverage gap (UNCONFIRMED):** only `darwin-arm64` was run. Linux x64 (x64 encoding under ASLR,
> mawk/gawk, Ubuntu uutils `cmp` / `tail -c` / `seq`, bash 5 OLDPWD) is UNCONFIRMED (Rung R5).
> **Real code (C6) is PENDING:** every number below comes from canned probe drivers.

---

## 0. v4 Changes (vs v3 prototype c6de8c79, run-probes da73ac45)

Prototype v4 = sha256/8 `45375555`; run-probes v4 = `9c86adfd`. The v4 author was an outside agent. An Opus
review (EVAL) REJECTED round 1 with 2 LITERAL blockers + 1 DESIGN; one literal fix round followed, and
round 2 was APPROVED. With v4's `--self-test` grafted onto v3, 8 rows fail on v3 and all 45 pass on v4.
- **A1 (N1 teeth):** `repeat_check` needs exit 0 + a non-empty signature + a minimum record count, and a
  throwing-driver lane must FAIL. Live: v3's logic passes 2/2 on a throwing driver with empty signatures
  (`A1-v3-throwing-proof.log`); v4's must-fail lane FAILS it (0/2) on all 5 nodes. Open gap: F-B3, section 2.4.
- **A2:** empty value after `need()` is refused for every value option. Live (EVAL): v3 `--out ""` rc 0, 6
  spawns; v4 rc 2, 0 spawns.
- **A3:** rows for M3b (duplicate `--fn`), M3c (empty `--opt=`), M4b (resolved `--out` newline via `nl_dir`
  before spawn / mkdir; the shim is byte-identical to `lib/common.sh`), M5 (3-run null control end to end),
  M6c (`--max` trailing comma; the check already existed in v3, v4 adds the row).
- **A4:** rows for M1b (two `index.mjs` in different dirs) and M1c (two nested `hot` in one file).
- **A5:** every byte number in section 2 is printed as a `DATA` line by `run-probes.sh` (saved logs).
- **A6:** the `--turbolev` / `--turbolev-future` exact-name refusal now runs before the `node -p` spawn (0
  spawns; v3: 2 spawns).
- **A7:** exit-2 rows assert the reason line (Turbolev, `--platform-arch`, `--inspect`).
- **C1:** `--out SYMLINK/` and `SYMLINK/.` are refused (0 spawns). v3 wrote through the link (rc 0).
- **C2:** a driver in a `-` dir runs, in report AND diff mode (v3: `cd -` OLDPWD trap -> NO-VERDICT).
  Linux bash 5 keeps an inherited OLDPWD, so the two CI legs would differ without the fix.
- **C5:** unknown option -> did-you-mean; `-h` lists every trace flag and refusal; no runtime line cites
  RESEARCH.md.
- **Extras (EVAL: stricter only):** `unset CDPATH` and the NODE_* vars at the top; `--self-test` refuses
  extra options; an ambiguity message shows full paths when two basenames match.
- **Provenance of the B logs:** `B-selftest-v4.log` and `B-mutants-and-teeth.log` ran on the pre-EVAL build
  218032e1 (44 rows). The 45 rows and the 20/20 kill on 45375555 were re-confirmed by RECHECK3 on a private copy
  (stub node).
- **Mutant table:** 20 count-checked single-match mutants, all killed (`B-mutants-and-teeth.log`), plus 2 from
  EVAL (the diff-mode C2 arms), killed by the round-1 row. 7 of the 20 SURVIVED on v3 (M1b, M1c, M3b, M3c,
  M4b, M5, M6c).

## 1. INTAKE Ladder, Kill Rules, and LEDGER Law Mapping

### 1.1 Question & Ladder
Question: can a standalone bash + POSIX awk script compare V8 machine-code byte sizes per named function
BEFORE vs AFTER from `--log-code` CSV across Node 22 / 24 / 26 / 27, obeying LiteUtils's fail-closed
template and LEDGER laws 1, 3, 4, 5, 6, 7, 10?

| Rung | Gate / criterion | Kill rule | Status (darwin-arm64, this pass) |
| --- | --- | --- | --- |
| R1 Schema | parseable CSV, 0 empty `$9` on JS/Eval/Script | kill `$9` keying on any empty `$9` | PASS on 5 nodes |
| R2 Determinism | non-empty identical signatures across runs | kill if size varies across runs on one binary | PASS arm64 (ASLR 8/8, natives 20/20 on 5 nodes); Sparkplug lane vacuous on v22 (F-B3); x64 UNCONFIRMED |
| R3 Signal | bloat -> DIFF, line shift -> SAME, deopt churn visible | kill if line shift DIFFs or bloat reads SAME | PASS on 5 nodes |
| R4 Guards | ambiguity -> NO-VERDICT, refusals before spawn | kill on any false SAME | PASS; refusals 0 spawns (EVAL) |
| R5 Linux x64 | same probes green on Ubuntu x64 | hold release if x64 sizes vary | OPEN |
| R6 Real code (C6) | known-SAME pairs read SAME on 5 real packages | false DIFF on known-SAME not explained by a documented limit -> design item + Q-id | PENDING (not run) |

### 1.2 LEDGER Law Mapping
- **Law 3 (refuse before first spawn or write):** CLI conflicts, empty values (A2), empty / trailing-comma lists,
  newline / CR paths (`nl_refuse`, `nl_dir` on the resolved `--out`), `--out` symlink (incl. `SYMLINK/`,
  `SYMLINK/.`), Turbolev by name (A6): all exit 2 with 0 spawns and an unchanged tree (EVAL: 12 refusal forms).
  The runtime allowlist exits 2 after one `--v8-options` read.
- **Law 4 (allowlist):** `lib/v8flags.sh` embedded verbatim. GC flags `--stress-compaction`, `--gc-interval=100`,
  `--expose-gc` and `--compact-on-every-full-gc` are all accepted (`D-B4-codemove.log`).
  `--interpreted-frames-native-stack` is also accepted, and its log then trips the Q-CSD-KEY tripwire (section 2.5).
- **Law 5:** `NODE_RES` resolved once; `-`-led `--out` normalized to `./$OUT`; `-` driver dirs normalized to `./-`.
- **Law 6:** `--self-test` 45 rows, each new row fails on v3 (section 0).
- **Law 7:** NUL check via `tr -d '\000' | cmp -s`, octal `\047`, `FILENAME == ARGV[1]`, `set -f`. Linux leg OPEN.

---

## 2. Empirical 5-Node Probe Results (`darwin-arm64`, REPORTED)

v3 baseline: frozen v3 `run-probes.sh` rc 0 on all 5 nodes (23 / 23 / 22 / 22 / 23 assertions on
v26.8.2 / v26.3.1 / v22.23.5 / v24.22.3 / v27-alpha). v4: `run-probes.sh` rc 0 with 33 / 33 assertions on all 5.

### 2.1 Numeric `CodeKind` (`$3`) vs Symbolic Marker (`$9`) (`DATA CODEKIND_TABLE`)

| Node | Builtin | RegExp | `~` | `^` | `+` `+'` `o+` | `*` `*'` `o*` | markers seen (`markers.mjs`) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v22.23.5 | 2 (NF=7) | 3 (NF=7) | 9 | 10 | (Maglev off) | 12 | 3: `* ^ ~` |
| v24.22.3 | 2 | 3 | 9 | 10 | 11 | 12 | 6: `* *' + +' ^ ~` |
| v26.3.1 | 3 | 4 | 10 | 11 | 12 | 13 | 8: `* *' + +' ^ o* o+ ~` |
| v26.8.2 | 3 | 4 | 10 | 11 | 12 | 13 | 8 (same) |
| v27-alpha | 3 | 4 | 10 | 11 | 12 | 13 | 8 (same) |

- 0 empty or non-9-field JS/Eval/Script records on all 5. `o+'` / `o*'` never observed.
- `$1` event inventory identical on all 5 (9 events): `code-creation code-source-info delete heap-available
  heap-capacity new script-source v8-platform v8-version`. `code-move` / `sfi-move` appear under GC (2.6).
- The Q-CSD-KEY (a) tripwire (one numeric `$3` per base tier per log) holds on all 5 in default runs.

### 2.2 Inlining Bloat, Line Shift, Deopt Churn (prototype REPORTED lines, `BC-v4-*.log`)

| Node | bloat-before (ign / sp / maglev / turbo B) | bloat-after (ign / sp / maglev / turbo B) |
| --- | --- | --- |
| v22.23.5 | 37 / - / - / 468 | 71 / - / - / 688 |
| v24.22.3 | 37 / - / 828 / 436 | 71 / 616 / 1156 / 644 |
| v26.3.1 | 38 / 440 / 824 / 596 | 72 / 616 / 1144 / 644 |
| v26.8.2 | 38 / - / 824 / 596 | 72 / 616 / 1144 / 644 |
| v27-alpha | 37 / - / 652 / 552 | 71 / 624 / 860 / 544 |

- On all 5: A/A -> SAME rc 0; line-shifted twin -> SAME rc 0; bloat -> DIFF rc 1; 0 raw TABs.
- On v27-alpha TurboFan shrinks (552 -> 544) while Maglev grows: the multiset still reads DIFF. The two
  tiers can move in opposite directions.
- Sparkplug for bloat-before appears on v26.3.1 (440 B) and not on v26.8.2. Both run V8 14.6.202.34, with
  different node patch levels. Sparkplug is not in the default `--tiers`.
- Deopt churn, `deoptReopt` (`DATA DEOPT_DEFAULT`):
  - v26.8.2: `~6 +'348 *'204 +'392 *'344`, top-level `o+796`.
  - v27-alpha: `~6 +'348 *'204 +'376 *'344`.
  - v22.23.5: `~6 *236 *368`, top-level `*492` / `*652`.
- With `--turbolev` the final `*'` is 336 (v26.8.2, v26.3.1) and 336 (v27, after a 196 first compile). The
  prototype refuses `--turbolev` by name (rc 2 + reason, 0 spawns).

### 2.3 Repeatability, Natives, Getter, Escaping
- ASLR heap constants (`aslr-const.mjs`): 8/8 identical and non-empty on all 5.
  - v26.8.2: `~63 +'880 *'680`. v22: `~61 *496`. v24: `~61 +'884 *'464`. v27: `~61 +'736 *'680`.
  - v26.3.1: adds `^712`.
- S-8 natives (`natives-ctrl` vs `natives-diff`): must-SAME rc 0, must-DIFF rc 1, 20/20 identical on all 5.
  Turbo before -> after: v22 244 -> 276, v24 / v26 220 -> 244, v27 212 -> 244. Ignition 12 -> 63 on all 5.
- Getter order (D2, v26.8.2): `get` 920 B, `get value` 836 B (max(turbo,maglev)); both orders rc 0.
- Comma in a dir is escaped as `\x2C` with 0 raw commas on all 5 (6-10 hits per node).
- C3: 7 dirs (`sp dir`, `a,b`, `x [1]`, `x for 0x1`, `q'dir`, `q"dir`, `c:dir`) x `.mjs` / `.cjs` = 14 pairs -> SAME
  with non-zero bytes on all 5. In the raw logs (v26.8.2, v22.23.5), ESM URLs %-encode space, `[`, `]` and `"`
  but keep `'` and `:` raw. CJS paths are raw except the comma (so `" [1]"` and `" for 0x1"` appear verbatim
  in `$7`). The prototype parses both (`C3-escapes.log`).
- C4: path-length A/A -> SAME with non-zero bytes on all 5.

### 2.4 FINDING F-B3: the Sparkplug repeatability lane is vacuous on v22
- `repeat_check` counts records that name the driver file. It does not check for the lane's tier marker (EVAL
  blocker 3, DESIGN).
- Live: `BC-v4-v22.23.5.log` `DATA SPARKPLUG` has 0 `^` records (`smallFn:~ medFn:~ noLoop:~` + `*` only),
  yet "Sparkplug 10-run repeatability" passed. v3's "Sparkplug 10/10 on all majors" measured no
  Sparkplug code on v22.
- The other nodes do log `^` in this lane, and every ASLR lane logs an optimized marker.
- `--no-baseline-batch-compilation` makes `^` appear on v22 (2.7). Fix options: Q-CSD-RPT.

### 2.5 B3: `--interpreted-frames-native-stack` (`D-B3-xscope.log`)
- The flag passes the allowlist. Raw logs on v22 / v24 / v26.8.2 / v27 add JS / Eval / Script records with the
  BUILTIN kind (2 on v22/v24, 3 on v26/v27) and marker `~` (interpreter-entry copies): 491-509 JS + 79-85 Eval + 1 Script per node.
- The prototype therefore hits the tripwire on every node: `tier-marker/CodeKind conflict: ignition seen
  with kinds 2 and 9` (v22 / v24) or `kinds 3 and 10` (v26 / v27), +576-589 more X lines -> NO-VERDICT rc 2,
  AFTER spawning. Fail closed, but late.
  The canned self-test shape is real.

### 2.6 B4: Code Moves Under GC (`D-B4-codemove.log`)
- Ran with `--stress-compaction --expose-gc --gc-interval=200` on all 5 nodes.
- `code-move` 12679-17923 (of `hot`: 55-145); `sfi-move` 76275-171358.
- `hot`'s size signature is identical to the no-GC baseline on every node: the size join keys on
  `code-creation` records, so moved code loses no size and no wrong size appears.
- B4 kill rule not hit: no B4 Q-id.

### 2.7 B5: Mechanisms (`D-B5-mechanisms.log`)
- **`--no-concurrent-recompilation`** (K=10 per mode, v22 / v24 / v26.8.2, `bloat-before` + a race driver):
  - 1 distinct signature in every mode: concurrency did not cause run-to-run drift here.
  - But it changes WHAT is logged. Concurrent bloat-before on v26.8.2 logs `~38 +'824 ^440` with NO turbo
    record (sync: `~38 +'824 *'596`); v24 is the same shape.
  - So the flag decides whether TurboFan is reached before exit. Claim VERIFIED as a coverage mechanism.
- **Sparkplug batch threshold:**
  - `--v8-options` default is `--baseline-batch-compilation-threshold=4096` on v22 / v24 / v26.8.2.
  - bloat-before default -> 0 `^`; `=0` or `--no-baseline-batch-compilation` -> `hot` `^` 440 B (3 `^` in the driver).
  - bloat-after (v24/v26) logs `^` 616 in all three modes; on v22 only with the threshold off (608 B).
  - Coupling to another function's size VERIFIED for the padded callee `leaf` (bloat-after `^` 616 by default
    on v24 / v26.8.2); a non-callee sibling is not probed.
- Concurrent recompilation cannot drop the turbo record in the prototype: it forces
  `--no-concurrent-recompilation` and refuses overrides (RECHECK3).

### 2.8 B1: Function Identity (`D-B1-identity.log`, 4 majors)
- `$8` (SFI address) is the same across every tier of one function within a run. It separates
  `dir1/index.mjs` vs `dir2/index.mjs` `hot` and the two nested `hot`. It differs across processes, so it
  cannot key BEFORE vs AFTER.
- Class fields: `class C { x = 1; ...; constructor }` logs under name `C` at TWO locations: the field
  initializer (`1:9` on v22, `1:11` on v24+) and the constructor (`1:36`). `class D { static s; x }` logs `D` with 3 SFIs (3 distinct locations on v24+, 2 on v22).
  Prototype `--fn C` / `--fn D` -> NO-VERDICT rc 2 (ambiguous). Nit: the `D` message says "3 definition
  locations" but lists 2.
- Line shift (`1:13` -> `6:13`): same sizes. A moved identical function (`mod-a.mjs` vs `mod-b.mjs`, `--fn hot`)
  -> SAME rc 0: the v_ms key ignores the path, so a move is invisible.
- Common names (`get`, `run` in two modules): logged per path with distinct SFIs; today -> NO-VERDICT.
- `code-source-info` join: INCONCLUSIVE. The probe looked records up at `code-creation` time, before the
  `code-source-info` line was read (csi=NONE everywhere); no V8 conclusion is drawn.

### 2.9 B2: Null Control
`lib/nullctl.sh` hard-codes `for side in before after` over `$OUT/ms/$key.$tier.$side.$k.txt`, so report /
gate modes (side `one`) cannot include it unchanged. The v3 claim "promotion without altering any 1.0.0 lib
file" is withdrawn; the prototype keeps a local null control (Q-CSD-NCTL).

---

## 3. Architecture, Exit Table, and Shared `lib/*.sh` Reuse Map

### 3.1 Exit Table per Mode

| Mode | Invocation | Exit 0 | Exit 1 | Exit 2 |
| --- | --- | --- | --- | --- |
| `diff` (default) | `--fn LIST BEFORE AFTER` | `VERDICT SAME` | `VERDICT DIFF` | `VERDICT NO-VERDICT` (refusal, `X`, ambiguous `A`, nullctl, guard) |
| `report` | `--report --fn LIST DRIVER` | `VERDICT OK` | (never) | `VERDICT NO-VERDICT` |
| `gate` (if Q-CSD-MODES (b)) | `--max fn=N --node-version vX.Y.Z --platform-arch OS-ARCH DRIVER` | `VERDICT WITHIN` | `VERDICT OVER` | `VERDICT NO-VERDICT` |
| `self-test` | `--self-test` (no other option) | all 45 ok | >= 1 FAILED | unexpected error / extra option |
| `help` | `-h` / `--help` | (never) | (never) | usage to stderr |

### 3.2 `lib/*.sh` Reuse Map
- `lib/prologue.sh`, `lib/msdiff.sh` (`MSDIFF_AWK`), `lib/args.sh` (`need()`), `lib/v8flags.sh` (verbatim, 0 edits).
- `lib/common.sh`: `die`, `say`, `sha8`, `usage`, `multiset`, `worst` (diff mode), `nl_refuse`, `nl_dir`
  (shim byte-identical), `rep_refuse`. Report / gate use a local `vworst()` (as `src/bytecode-budget.sh:304`).
- `lib/nullctl.sh`: NOT includable for side `one` without an edit (2.9, Q-CSD-NCTL).
- `lib/tracked.sh` + `lib/stage.sh`: only if Q-CSD-REF (b).

### 3.3 Alternatives That Lost
- **`max` or `last` size instead of a multiset:** collapses deopt churn (2.2) into one number.
- **Builtin-relative numeric `$3`:** the kind numbers shift between V8 12/13 and 14/15 (2.1), while `$9`
  encodes OSR / context specialization directly.
- **Merging same-named functions across files:** swapped sizes read a false SAME.
- **Folding OSR into non-OSR:** hides a tier-path change.
- **Editing `lib/v8flags.sh` to share the Turbolev read:** moves every 1.0.0 root sha (S-11).
- **SFI address as the cross-side key:** it changes per process (2.8). Usable only within one run, e.g. to
  count definition locations.

### 3.4 Mocks Inventory Draft (C7, for `mocks/code-size-diff/`; Q-MK-NEWTOOL (a))
DRAFT: the cases are not built yet; rows marked "pending" depend on a ruling or on C6.

| id | kind | class | smallest before -> after | expected |
| --- | --- | --- | --- | --- |
| CSD-C1 | C | inlining bloat | `hot` + 1-line `leaf` -> padded `leaf` | DIFF |
| CSD-C2 | C | inlining shrinkage | padded `leaf` -> 1-line `leaf` | DIFF |
| CSD-C3 | C | deopt + recompile churn | monomorphic loop -> warm + poison + re-warm | DIFF (extra compiles in multiset) |
| CSD-C4 | C | forced TurboFan under natives | small body -> larger body | DIFF (S-8) |
| CSD-C5 | C | OSR vs entry compile | entry loop -> long OSR loop | DIFF on Node >= 26 (`o+` / `o*`); per-major note |
| CSD-C6 | C | `--tiers sparkplug` opt-in | small -> larger `hot`, batch threshold off | DIFF (`^` size) |
| CSD-C7 | C | `--report` healthy | warm driver | OK, non-zero bytes |
| CSD-C8 | C | getter vs plain fn order | `get value()` + `function get()` | OK both orders |
| CSD-S1 | S | A/A same path | identical driver | SAME, non-zero bytes |
| CSD-S2 | S | line shift | +5 comment lines above `hot` | SAME |
| CSD-S3 | S | A/A path lengths | same bytes, short vs > 120-char dir | SAME |
| CSD-S4 | S | special-char paths, `.mjs` + `.cjs` | the 7 C3 dirs | SAME |
| CSD-S5 | S | unrelated edit outside the target | sibling un-inlined helper changed | SAME (pending C6) |
| CSD-S6 | S | Sparkplug toggles, `+` / `*` fixed | default `--tiers` | SAME |
| CSD-L1 | L | Turbolev | `--v8-flags --turbolev` | NO-VERDICT rc 2, 0 spawns |
| CSD-L2 | L | Node 22 Maglev off | `--tiers maglev` on v22 | NO-VERDICT on v22; OK on >= 24 |
| CSD-L3 | L | class field initializer under the class name | `class C { x = 1; constructor }`, `--fn C` | NO-VERDICT (pending Q-CSD-NAME) |
| CSD-L4 | L | `--interpreted-frames-native-stack` | `--v8-flags` with the flag | NO-VERDICT (pending Q-CSD-XSCOPE) |
| CSD-L5 | L | moved function (same name, other file) | `mod-a.mjs` `hot` -> `mod-b.mjs` `hot` | SAME today (2.8); NO-VERDICT if Q-CSD-NAME (a) |
| CSD-L6 | L | selected tier reached on neither side | driver reaching Maglev but never TurboFan, both sides | SAME today; per Q-CSD-TIERMISS |
| CSD-G1 | G | cold function | never or rarely called | NO-VERDICT (warmup hint) |
| CSD-G2 | G | same name in two files / nested | two `index.mjs`; nested `hot` | NO-VERDICT |
| CSD-G3 | G | run-to-run drift | nondeterministic compile | NO-VERDICT (null control) |
| CSD-G4 | G | second isolate | `new Worker(...)` | NO-VERDICT |
| CSD-G5 | G | CLI refusals | `--out ""`, `SYMLINK/`, `--inspect`, dup `--fn`, newline path | NO-VERDICT rc 2, 0 spawns |
| CSD-R1 | R | real-code seed | C6 pairs | pending C6 |

---

## 4. Maintainer Rulings Needed (`Q-CSD-*`, recommended option first, all UNRULED)

- **`Q-CSD-INTAKE`:** how to proceed into 1.3.0.
  - **(a) (Recommended)** Before the PROPOSAL, run the C6 real-code rung (5 packages, expectations frozen
    first, template `.handoff/PLAN-RP-1.2.0.md`) and one Ubuntu x64 CI capture of `probes/run-probes.sh`. Then
    adopt the rulings into a PROPOSAL and brief the planner. Evidence: every number here comes from canned
    drivers; the shape-diff F1 lesson (real code read DIFF on unchanged code) was found only on real code.
  - (b) Go to the planner now; put C6 and the x64 capture in G0 TASK 0.
  - (c) Shelve and start from the earlier DRAFT.
- **`Q-CSD-MODES`:** which verdict modes ship in 1.3.0.
  - **(a) (Recommended)** `diff` + `--report` only (no `--max`). Evidence: Sparkplug emission differs between
    v26.3.1 and v26.8.2 on the same V8 base (2.2: bloat-before `^` 440 vs none; ASLR `^` 712 vs none), so a
    ceiling pinned to a node version and architecture is fragile. S-5: user-driver code size is STATISTICAL with no statistical host.
  - (b) `diff` + `--report` + `--max`, pinned to `--node-version`, `--platform-arch` AND a build fingerprint
    (`--v8-options` sha + pointer-compression / sandbox config), only after an S-6-style 20-run settle on
    every CI leg.
  - (c) `--max` with `--node-version` + `--platform-arch` only (current prototype).
- **`Q-CSD-MAXQ` (only if Q-CSD-MODES (b)):** what `--max` bounds.
  - **(a) (Recommended)** Per tier (`--max fn:turbo=N`); a missing tier -> NO-VERDICT. Evidence: tiers can move
    in opposite directions (v27 bloat, 2.2).
  - (b) Max across the selected tiers (prototype).
  - (c) Sum across the multiset.
- **`Q-CSD-KEY`:** how tiers are classified.
  - **(a) (Recommended, implemented)** `$9` symbolic marker + the version-free tripwire (1:1 base tier <-> numeric
    `$3` within each log, else `X`). Evidence: holds on 5 nodes (2.1). It fires on the real kind-mixing shape
    under `--interpreted-frames-native-stack` (2.5).
  - (b) `$9` only, no tripwire.
  - (c) Builtin-relative numeric `$3`.
- **`Q-CSD-NAME` (re-issued with v4 evidence, 2.8):** function identity.
  - **(a) (Recommended)** Path-keyed with a `name@path-suffix` narrowing:
    - The verdict key is (normalized script path, name), with only `:line:col` stripped, so line shifts stay
      SAME. Normalization, per side: the DRIVER file itself maps to one fixed token (`<driver>`) on both
      sides; every other script maps to its path relative to that side's driver directory. So BEFORE
      `a/bloat-before.mjs` vs AFTER `b/bloat-after.mjs` compare `<driver>` with `<driver>`, and
      `a/lib/x.mjs` vs `b/lib/x.mjs` compare `lib/x.mjs` with `lib/x.mjs`.
    - Several definition locations within ONE script for a selected name -> NO-VERDICT. This covers nested
      functions and class field initializer + constructor.
    - A selected name found in more than one normalized script on a side -> NO-VERDICT unless
      `--fn name@path-suffix` matches exactly one normalized script on EACH side (the one shared `--fn`
      value is matched against each side's normalized paths separately).
    - A name whose single normalized script differs between the sides (a moved function, e.g. `lib/a.mjs`
      -> `lib/b.mjs`) -> NO-VERDICT with a "moved" reason. No suffix override in 1.3.0.
    - Evidence: today a moved function reads SAME silently. Common names (`get`, `run`) stay NO-VERDICT
      forever. The class name also names its field initializer.
  - (b) Key on (script URL, start position) from `code-source-info` / `script-source` with the SFI joining tiers.
    Not proven: the join probe was INCONCLUSIVE (2.8), and a start position moves with every line shift, so
    line-shift twins would need extra normalization. Kept as a later diagnostic.
  - (c) `name@path-suffix` only, as an opt-in narrowing on top of today's rule: an ambiguous name ->
    NO-VERDICT, moves stay invisible.
  - (d) Keep today's rule unchanged (ambiguous name -> NO-VERDICT; path-blind compare), documented as a known
    limit.
- **`Q-CSD-TIERMISS` (new, RECHECK3 B7):** a selected tier reached on NEITHER side.
  - Today (prototype 45375555, `judge_side` ~486, verdict ~1187): one selected-tier record is enough, so a tier
    missing on both sides still prints "SAME -- identical code-size multiset in [turbo,maglev]". A driver that
    reaches Maglev but never TurboFan reads SAME on TurboFan without measuring it. Warmup or a tier-disabling
    `--v8-flags` can cause this; concurrency cannot (forced flag, 2.7).
  - **(a) (Recommended)** Any `--tiers` entry (a base tier counted together with its OSR key) with 0 records on both sides -> NO-VERDICT, naming the tier, with a
    hint to warm up or narrow `--tiers`. Consequence: on v22 (Maglev off by default, 2.1) the default
    `--tiers turbo,maglev` would always read NO-VERDICT, so (a) also drops `maglev` from the DEFAULT tiers when
    `--v8-options` shows Maglev off (an explicit `--tiers maglev` still reads NO-VERDICT there). Evidence: fail
    closed on unmeasured state; null is not zero.
  - (b) SAME, plus a printed "tier not reached on either side" line per missing tier.
  - (c) Document as a known limit.
- **`Q-CSD-NCTL` (re-issued, 2.9):** the null control for report / gate modes.
  - **(a) (Recommended)** Keep a local null control in `src/code-size-diff.sh` and drop the "no 1.0.0 lib
    change" claim. Evidence: `lib/nullctl.sh` hard-codes `before after`.
  - (b) Generalize `lib/nullctl.sh` to a side list (moves 1.0.0 root shas; S-11 drift).
- **`Q-CSD-XSCOPE` (re-issued, 2.5):** kind-mixing flags and the `X` scope.
  - **(a) (Recommended)** Keep `X` global. Refuse `--interpreted-frames-native-stack` (and any later flag shown
    to mix kinds) by exact name before any spawn, with a reason line. Evidence: the flag passes the allowlist
    and always ends NO-VERDICT after spawning, on 4 majors.
  - (b) Scope `X` to the target functions (the flag would then pass if the targets' own records stay
    consistent; unverified).
  - (c) Document only (today: fail closed, late).
- **`Q-CSD-RPT` (new, forced by F-B3, 2.4):** teeth of the probe repeatability lanes.
  - **(a) (Recommended)** Every lane requires its tier marker in every run's signature, from a per-node marker
    table taken from these logs. The Sparkplug lane runs with `--no-baseline-batch-compilation` so `^` appears
    (shown in 2.7 for `bloat-before` on v22 / v24 / v26.8.2; the lane driver under the flag is unprobed).
    Mocks and probe drivers may add a read-only PREMISE line after the workload (`%ActiveTierIs*`, never the raw
    `%GetOptimizationStatus` bits, which differ between V8 12.4 and 14.6), per
    `.handoff/research/post-1.0/REF-v8-mjsunit-mocks.md`. Evidence: v22 passed with 0 `^`.
  - (b) Require the marker, and mark the Sparkplug lane N/A on v22.
  - (c) Keep the record-count floor (vacuous on v22).
- **`Q-CSD-SPARK`:** Sparkplug in the default verdict.
  - **(a) (Recommended, implemented)** Default `--tiers turbo,maglev`; `sparkplug` opt-in with
    `--no-concurrent-sparkplug`. Evidence: the 4096 batch threshold is VERIFIED (2.7). `^` emission differs
    between v26.3.1 and v26.8.2 on the same driver (2.2).
  - (b) Include `sparkplug` in the default `--tiers`.
  - (c) Never selectable (REPORTED only).
- **`Q-CSD-TLLIB`:** where the Turbolev check lives.
  - **(a) (Recommended, implemented)** Local in `src/code-size-diff.sh` (name check before any spawn, A6; default-on
    check with one extra `--v8-options` spawn); 0 changes to `lib/v8flags.sh`.
  - (b) Extract `lib/turbolev.sh` and update `inlining-budget-diff.sh` (moves a 1.0.0 root sha).
- **`Q-CSD-CTX`:** the context-specialization apostrophe (`+'` / `*'`).
  - **(a) (Recommended, implemented)** Strip `'` from the verdict key; keep a `ctx` column REPORTED.
  - (b) Keep `'` in the key (a specialization change at equal size -> DIFF).
  - (c) Strip `'` and print a REPORTED note when `ctx` differs across sides.
- **`Q-CSD-OSR`:** OSR compiles (`o+`, `o*`).
  - **(a) (Recommended, implemented)** Separate keys (`maglev-osr`, `turbo-osr`) inside their base tier's selection.
    Evidence: `o+` / `o*` on v26/v27 only; v22/v24 log OSR as `*` / `+`.
  - (b) Fold OSR into `maglev` / `turbo`.
  - (c) Exclude OSR unless listed in `--tiers`.
- **`Q-CSD-REF`:** ref / file staging.
  - **(a) (Recommended)** Driver mode only in 1.3.0 (as `ic-diff` 1.0.0; staging parity deferred).
  - (b) Include `lib/stage.sh` ref / file modes.
- **`Q-CSD-TL`:** Turbolev handling.
  - **(a) (Recommended, verified live)** Refuse `--turbolev` / `--turbolev-future` by exact name (any `-` / `_`, any
    `=value`) before any spawn, and refuse a default-on node (LEDGER #107 G5c). Evidence: with `--turbolev`
    the final `*'` code is 336 B, and the record is indistinguishable from TurboFan (2.2).
  - (b) Allow and tag the header.
  - (c) An opt-in flag to allow.
- **`Q-CSD-IR-SHAPE` (L8, E2):** how `ir-diff` ships.
  - **(a) (Recommended)** A separate tool (`ir-diff`) in a later minor, sharing `lib/*.sh`. Evidence: it uses a
    different trace (`--trace-turbo-graph`), different flags (`--trace-turbo-filter`, forced tier-up), a
    per-version grammar (banner and DeoptimizeIf meta differ, section 5), and its own identity rule.
    Post-1.0 policy is one small script per minor.
  - (b) One tool with modes (`--size` from `--log-code`, `--ir` from the final IR, optional `--slots` from
    `--print-opt-code --code-comments`).
- **`Q-CSD-IR-ROUTE` (L8, E4):** the final-IR source.
  - **(a) (Recommended)** stdout `--trace-turbo-graph` + POSIX awk. Structural anchor = the LAST Turboshaft-grammar
    section before `Instruction sequence`, with a reached-codegen flag; the banner is diagnostic only.
    Evidence: 4/4 must-fail pairs DIFF and A/A 10/10 with 0 X on 4 majors (section 5).
  - (b) `--trace-turbo` JSON (`turboshaft_graph` phases) through a node `.mjs` helper. Evidence: 1 file of
    770412 B per function written to cwd; its `function` object carries `sourceName` + `startPosition`, a
    real identity key (E3).
  - (c) Both: stdout for the verdict, JSON for identity only.
  - Limit under (a): a stdout unit names only the function, so it cannot be tied to a script; a single unit per
    side may still be a different same-named function (only one of two reached TurboFan, or a moved function).
    Closing it needs (c) (JSON `sourceName` + `startPosition`, E4) or a paired `--log-code` identity check.

---

## 5. L8 `ir-diff` Probes (`E-ir-diff.log`, 4 majors, REPORTED)
- Extractor (written from scratch, POSIX awk):
  - A unit runs from `Begin compiling method <fn> using TurboFan` to `Finished compiling method`.
  - It keeps the last section with Turboshaft body grammar (`BLOCK` / `MERGE` / `LOOP B<n>` + `<n>: Op` lines)
    before `Instruction sequence`.
  - It normalizes `#N` and `0x...`, and emits multisets of DeoptimizeIf[meta], Call[target], StoreWB and Allocate.
  - `X` (NO-VERDICT) on: 0 units, no Turboshaft section, no codegen, nested or unterminated units.
- Final-phase banner: v22 `V8.TFTurboshaftRecreateSchedule`; v24 / v26.8.2 / v27
  `V8.TFTurboshaftSpecialRPOScheduling`.
- Must-fail pairs (`target` under natives, `--no-concurrent-recompilation`): all DIFF on all 4 nodes.
  - EA: the escaping temporary adds `Call [Code:Allocate ...]` + StoreWB. It also adds `Call
    ThrowAccessedUninitializedVariable` (TDZ check on a module `let`), which is a confound the real tool's
    case must remove.
  - GUARD: adds `DeoptimizeIf [WrongMap]` + `[Smi]` and drops one `[NotASmi]` (v24+).
  - CALL: the non-inlined helper adds `Call [JS:js-call]` and drops an `Overflow` deopt.
  - WB: adds `StoreWB [... PointerWriteBarrier]`.
- A/A K=10 on ea-esc: 10/10 identical, 0 X, on every node.
- Grammar findings (E1 / E4):
  - G1: 0 `Allocate` OPS appear in the final IR on any node; allocation is a `Call [Code:Allocate]`.
  - G2: v22 DeoptimizeIf meta is `[1, 0xADDR]` with no reason text (v24+ print NotASmi / WrongMap / Overflow
    / WrongCallTarget / Smi). On v22 the deopt key is reason-less: per-version note, never cross-version.
  - G3: StoreWB meta differs by version (`tagged base ... offset: 40` on v22 vs `raw, ...` on v26).
- E3 identity: `--trace-turbo-filter=hot` on two files compiles BOTH (2 units) on every node, so a name filter
  merges same-named functions. Required regardless of the ruling: more than 1 unit per selected name per side,
  or a different unit count across sides -> NO-VERDICT. `--trace-turbo-filter=C` gave 1 unit (natives and a
  natural 60k warmup).
- E4 JSON (v26.8.2): 57 phases, 8 `turboshaft_graph`, the last is `V8.TFTurboshaftSpecialRPOScheduling` (agrees
  with the stdout anchor); `has_sourcePositions` false, `has_nodePositions` true, `has_inlinings` true.
- Not covered: x64; Turbolev (refused anyway); OSR compiles.

## 6. Open / PENDING
- C6 real-code rung (Phase F): not run. Template: per package (LiteSignal, LiteArena, LiteFastBit32, LiteLogLogN,
  LiteYggdrasil) 2 known-DIFF, 2 known-SAME (logic-only elsewhere + comment-only), A/A same path, A/A two path
  lengths, 1 injected must-fail. Expectations frozen (sha) before any run; files read via `git show <sha>:<file>`
  into a private dir. Kill rule as R6.
- R5 Linux x64 capture; B6 open.
- ir-diff: the EA must-fail pair's TDZ confound (use a non-lexical sink: a `var` or an object property); OSR compiles unprobed.
- F-B3 probe teeth (Q-CSD-RPT); the `code-source-info` join probe (fix the join order) if Q-CSD-NAME (b) is wanted.
- Nits: `hint()` on a bare `-` suggests `--fn`; the help line for refused flags is long; the class `D`
  ambiguity message count vs list.
