# Research: `shape-diff` (ROADMAP L2, scheduled last)

Status: research drop (INTAKE + self-checking probes + runnable prototype; not a shipped script).
Provenance: 2026-11-22T23:58Z-2026-11-23T00:02Z, `darwin-arm64`, `/bin/bash 3.2.57(1)-release`, BSD awk,
load1 `5.88-9.90` (PRELIMINARY shared host; untimed, **REPORTED** tier), 4 env vars stripped
(`NODE_OPTIONS`, `NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE`, `NODE_REDIRECT_WARNINGS`).
Node binaries probed on this host:
- `v22.23.5` (`V8 12.4.254.21-node.57`)
- `v24.22.3` (`V8 13.6.233.17-node.63`)
- `v26.8.2` (`V8 14.6.202.34-node.28`)
- `v27.0.0-alpha.0.1.0` (`V8 15.6.75.50-node.11`)

Self-checking probe runner: [probes/run-probes.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/shape-diff/probes/run-probes.sh) (exits 0 iff all 27 assertions pass; exits 1 on any drift).
Runnable blueprint: [shape-diff.prototype.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/shape-diff/shape-diff.prototype.sh).

> **Coverage gap (UNCONFIRMED):** Only `darwin-arm64` was run here. **Linux x64** (47-bit numeric `pc`
> subscript precision in mawk/gawk, Ubuntu uutils `cmp`/`tail -c`/`seq`, and Linux bootstrap line counts)
> is **UNCONFIRMED** and must be captured on one CI leg before any L2 implementation ships.

---

## 1. Root Cause & Fix Analysis: Why Node 22 and Node 24 Failed -- and How Both Are Fixed

Prior recheck (`RECHECK-shape-diff.md` defects `N3` and `N4`) found two real cross-version failures:
Node 22 crashed on every run (`exit 133`, `SIGTRAP`), and Node 24 misreported clean monomorphic object
literals as unstable (`before 1 | after 1`). Live bisection across all four local Node majors uncovered
the exact V8 C++ root causes and clean, portable fixes that pass **27/27 assertions on Node 22, 24, 26,
and 27**.

### 1.1 Node 22.23.5 Crash (`N3`, exit 133 `SIGTRAP`): Sparkplug `CHECK` in `PrintGeneralization`

**Bisection:** Running each flag alone on `node v22.23.5` exits `0`. The crash is triggered by the
exact 2-flag pair `--trace-generalization --no-node-snapshot` (even on `node -e ""`).

**Verbatim stderr/stdout from `v22.23.5`:**
```text
[generalizing]assert:h{Any;const}->h{Any;mutable} (uninitialized field) [^wrapConsole+121
# Fatal error in , line 0
# Check failed: kind(isolate) != CodeKind::BASELINE.
 3: v8::internal::AbstractCode::SourceStatementPosition(v8::internal::Isolate*, int)
 4: v8::internal::JavaScriptFrame::PrintFunctionAndOffset(...)
 5: v8::internal::JavaScriptFrame::PrintTop(...)
 6: v8::internal::(anonymous namespace)::PrintGeneralization(...)
 7: v8::internal::MapUpdater::TryReconfigureToDataFieldInplace()
```

**Why it happens:** In V8 12.4 (`Node 22`), `MapUpdater::TryReconfigureToDataFieldInplace` calls
`PrintGeneralization` -> `JavaScriptFrame::PrintTop` -> `AbstractCode::SourceStatementPosition()`.
That C++ helper asserts `CHECK(kind(isolate) != CodeKind::BASELINE)` whenever the active JS frame is
compiled with Sparkplug (`^`). Under `--no-node-snapshot`, Node's bootstrap compiles `wrapConsole`
(`node:internal/util/inspector:91`) to Sparkplug (`^`) before its first field generalization, tripping
the `CHECK` on every process start. Even *without* `--no-node-snapshot`, any user function that reaches
Sparkplug (`^`) before generalizing hits the same V8 12.4 `CHECK`. Fixed upstream in V8 13.x (`Node 24+`).

**Why dropping `--no-node-snapshot` is the WRONG fix:**
- Measured on `v22.23.5` (`probes/unstable-all.mjs`) without `--no-node-snapshot`: `rc=0`, **but `94`
  non-zero map `pc`s remain unresolved** (snapshot code ranges never emit `code-creation`), AND any
  Sparkplug-compiled user function that generalizes can still abort Node 22 with exit `133`.

**Why adding `--no-sparkplug` (while KEEPING `--no-node-snapshot`) is the RIGHT fix:**
- Disabling Sparkplug prevents *any* frame (bootstrap or user) from entering `CodeKind::BASELINE`,
  while `--no-node-snapshot` ensures every code object logs `code-creation`.
- Shape transitions, map deprecations, dictionary normalizations, elements-kind changes, and field
  generalizations are tier-independent (Sparkplug is a non-optimizing baseline compiler).
- Measured across all 4 Node majors with `--no-sparkplug --no-node-snapshot` (`probes/run-probes.sh`
  Section 1): **`rc=0` AND `unresolved_nonzero=0`** on `v22.23.5`, `v24.22.3`, `v26.8.2`, and
  `v27.0.0-alpha.0.1.0`.
- `--v8-flags` refuses `*sparkplug*` so callers cannot re-enable Sparkplug and re-trigger the crash.

**Bonus finding (closes EVAL Row 45 -- does Node 22 trace array-kind changes?):**
**CONFIRMED YES.** With `--no-sparkplug`, `v22.23.5` traces ALL THREE array streams:
1. Inline fast elements transition:
   `elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+... at file:///.../unstable-all.mjs:42`
2. Builtin elements transition (note non-zero `+1700` offset vs `+0` on Node 26 -- `strip_frame` strips `\+[0-9]+$` cleanly):
   ```text
   elements transition [PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS] in splice+1700 at <unknown>:<unknown> for 0x16731c7f5bd1 <JSArray[4]> from 0x16731c7f5cd9 <FixedDoubleArray[22]> to 0x16731c7f5d99 <FixedArray[22]>
   ```
3. Sparse dictionary transition (`--log-maps` + `map-details`): `HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS`.

### 1.2 Node 22 & Node 24 Clean-Literal False Positives (`N4`) + 4-Major Dual Reason-Pair (`D6`)

**Verbatim `makeLit` (`{ a: i, b: 2 }`) `--trace-generalization` output across all 4 Node majors:**

| Node / V8 | `a:s{Any;const}->s{Any;const} (uninitialized field)` | `a:v{None;const}->s{Any;const} (uninitialized field)` | `a:v{None;const}->s{Any;const} (field type generalization)` |
| --- | --- | --- | --- |
| `v22.23.5` (`V8 12.4`) | **12x** (`[~makeLit+11 ...]`) | 1x (`[~makeLit+18 ...]`) | 1x (`[~makeLit+18 ...]`) |
| `v24.22.3` (`V8 13.6`) | **12x** (`[~makeLit+11 ...]`) | 1x (`[~makeLit+18 ...]`) | 1x (`[~makeLit+18 ...]`) |
| `v26.8.2` (`V8 14.6`) | **0x** | 1x (`[~makeLit+19 ...]`) | 1x (`[~makeLit+19 ...]`) |
| `v27.0.0-alpha.0.1.0` (`V8 15.6`) | **0x** | 1x (`[~makeLit+18 ...]`) | 1x (`[~makeLit+18 ...]`) |

**Why it happens:**
1. In V8 12.4 (`Node 22`) and V8 13.6 (`Node 24`), `CreateObjectLiteral` boilerplate verification prints
   no-op generalization lines where **LHS == RHS** (e.g., `a:s{Any;const}->s{Any;const}`, and after a
   double transition `a:d{Any;const}->d{Any;const}`): zero representation, field-type, or constness
   change occurred. V8 14.6+ (`Node 26/27`) stopped printing these no-op checks. Because the previous
   prototype only filtered `:v{None;...}->`, Node 22 and Node 24 reported `makeLit` as having `1`
   instability site and caused `add-field` (`{a:i,b:2}` -> `{a:i,b:2,c:3}`) to false-DIFF.
2. Across all 4 majors, every real in-place field generalization emits **two** lines with different
   trailing reasons (`(uninitialized field)` and `(field type generalization)`), which inflated site
   counts (`fieldGen` reported 4 sites for 2 real events).

**Exact fix (`Q-SD-GEN-INIT (a)`, implemented in `SHAPE_STDOUT_AWK`):**
1. `norm_gen()` normalizes random addresses (`Class(0xADDR)`, `{symbol 0xADDR}`) AND strips trailing
   ` (uninitialized field)` / ` (field type generalization)` while preserving ` (+N maps)`. That folds
   each dual reason-pair into **1 canonical site** (`fieldGen` now reports `before 2 | after 2 site(s)`
   instead of `4`).
2. `is_noop_or_vnone()` filters BOTH `:v{None;[^}]*}->` AND any `LHS == RHS` (comparing the substring
   after the last `:` before `->` against the substring after `->` minus any ` (+N maps)`) into `I`
   (REPORTED boilerplate/no-op inits + execution evidence, NEVER instability `E`).
3. Verified on **all 4 Node majors** (`v22.23.5`, `v24.22.3`, `v26.8.2`, `v27.0.0-alpha.0.1.0`):
   - `clean-and-literal.mjs` A/A: `makeLit` reads **`SAME` (`before 0 | after 0 site(s)`, rc 0)**.
   - `addf-before.mjs` vs `addf-after.mjs` (`{a:i,b:2}` vs `{a:i,b:2,c:3}`): reads **`SAME` (rc 0)**
     with `REPORTED normal-transitions: before=2 after=3`.

---

## 2. INTAKE Ladder, Kill Rules, and LEDGER Law Mapping

### 2.1 Question & Ladder
Question: Can a standalone bash + POSIX awk script diff V8 shape / elements-kind / field-generalization
instability BEFORE vs AFTER per named function across Node 22 / 24 / 26 / 27+ using V8's three native
shape trace streams, without false `SAME` on external/builtin mutations or false `UNSTABLE` on
monomorphic literals?

| Rung | Gate / criterion | Kill rule | Status on darwin-arm64 |
| --- | --- | --- | --- |
| R0 Cross-Node Schema | 3 streams run with `rc=0`, `unresolved_nonzero=0`, inline + builtin ELEM traced across Node 22/24/26/27 | Kill Node 22 support if crash or 0 ELEM tracing cannot be fixed cleanly | **PASS** on Node 22/24/26/27 (`--no-sparkplug --no-node-snapshot`) |
| R1 Clean A/A & Add-Field | Monomorphic `{a:i,b:2}`, benign `Symbol()`, and adding field `c:3` read `SAME` (`0` instability sites) | Kill GEN filter if monomorphic literal or add-field false-DIFFs | **PASS** on Node 22/24/26/27 (`LHS==RHS` + `v{None}` filter) |
| R2 Must-Fail Signal | Catches `GEN`, `MAP_DEPRECATE`, inline `ELEM`, `MAP_ELEM_DICT`, `MAP_NORMALIZE` with `0` raw TABs and dual reason-pair folded | Kill if any of the 5 classes misses or leaks raw TABs | **PASS** on Node 22/24/26/27 (`fieldGen`: 2 sites, not 4) |
| R3 Fail-Closed External & Uncalled Guards | Builtin (`Reflect.deleteProperty`, `splice`), non-target user helper (`del()` at 200 calls), and compiled-but-uncalled fns (lazy & `--no-lazy`) -> `NO-VERDICT` (never false `SAME`) | Kill if any external/uncalled mutant returns `SAME` | **PASS** on Node 22/24/26/27 (`helper-del` 200->`NO-VERDICT`, 20k->`DIFF`) |
| R4 Warm Array Fn & Cold `push` Honesty | Document `arr(i){return [1,2,3]}` warm-up requirement (`N2`) and `push(1.5)` 1-call `0` vs 200-call `2` behavior; keep `--stable` dropped | Kill `--stable` permanently while 1-call `push(1.5)` emits 0 lines | **PASS** (`--stable` dropped; `N2` & `push` verified and documented) |
| R5 Linux x64 CI | Same probes green on Ubuntu x64 (mawk/gawk 47-bit `pc` keys, uutils `cmp`/`tail`/`seq`) | Hold L2 planning if mawk collides 47-bit `pc` subscripts | **OPEN** (1 CI capture needed) |

### 2.2 LEDGER Law Mapping (Accurate Numbering; Fixes Old Row-44 Mis-Cite)
- **LEDGER law 3 (refuse before first spawn or write):** `--fn 'mk,'` trailing comma (`N6`), empty `--fn=`, unknown flags, `--v8-flags` preload/eval/print and `*sparkplug*` conflicts, `nl_refuse`/`nl_dir`, and `--out` symlink (including `--out` itself!), hard-link, non-empty, and input-collision refusals (`D9`) all exit `2` with `0` spawns. Runtime allowlist exits `2` after one `--v8-options` read.
- **LEDGER law 4 (allowlist, never denylist; MD-46):** Embeds `lib/v8flags.sh` verbatim (`v8fl_check` against `node --v8-options`), splitting `V8_EXTRA` under `set -f` (`D8`).
- **LEDGER law 5 (resolve once to one absolute path):** `NODE_RES` and both drivers resolved once from caller cwd; `-`-led `--out` normalized to `./$OUT`.
- **LEDGER law 6 (test the tests -- every gate must fail on old code):** `--self-test` (15 checks; **9/9 mutants killed**) directly tests `diff_fn()`'s unattributed `SAME -> NO-VERDICT` guard, `UE` nullctl, `NONE`-owner `UM` (`N5`), `D12` run-2 execution guard, `N4` no-op filter, `D6` dual fold, `N1` non-target user fn, `N6` trailing comma, `D8` allowlist, `D9` newline path, and `D11` `--fn=mk`.
- **LEDGER law 7 (portable oracles):** NUL check (`tr -d '\000' | cmp -s`), octal `\047` in POSIX awk, `FILENAME == ARGV[1]`, `set -f` around `V8_EXTRA`. Note Linux mawk 47-bit `pc` subscript check remains a CI LEAD.

---

## 3. Empirical 4-Node Probe Results (`darwin-arm64`)

All 27 assertions in [probes/run-probes.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/shape-diff/probes/run-probes.sh) passed on all four Node binaries:
- `v22.23.5`: **27/27 ok**
- `v24.22.3`: **27/27 ok**
- `v26.8.2`: **27/27 ok**
- `v27.0.0-alpha.0.1.0`: **27/27 ok**

### 3.1 The 3-Source Visibility Matrix (Verified Across Node 22 / 24 / 26 / 27 with `--no-sparkplug`)

| Shape event | `--log-maps` (with `map-details`) | `--trace-elements-transitions` | `--trace-generalization` | Prototype verdict (`diff`) |
| --- | --- | --- | --- | --- |
| Property add (`InitialMap` / `Transition`) | **SEEN** (`pc`, `line:col`) | blind | blind | `SAME` (REPORTED; opt-in `--include-transitions`) |
| `delete p.y` (`Normalize` / `NormalizeCached`) | **SEEN** (even from TurboFan `*'` `pc`) | blind | blind | `DIFF` (`MAP_NORMALIZE`) |
| `Reflect.deleteProperty(o, 'y')` | **SEEN UNATTR** (`Builtin:ReflectDeleteProperty`) | blind | blind | `NO-VERDICT` via `UM` (`D1`) |
| Non-target user `del(o)` (`--fn mk`) | **SEEN** (`user:del` at 200 calls; inlined into `mk` at 20k) | blind | blind | `NO-VERDICT` at 200 (`UM`); `DIFF` at 20k (`N1`) |
| Inline `arr[0] = 1.5` (`PACKED_SMI -> DOUBLE`) | blind | **SEEN ATTRIBUTED** (`in ~work+...`) | blind | `DIFF` (`ELEM`) |
| `arr.splice(0, 1, 'str')` | blind | **SEEN UNATTR** (`in splice+1700` on 22, `+0` on 26) | blind | `NO-VERDICT` via `UE` (`D1`) |
| `arr.push(1.5)` **1 cold call** | **BLIND** | **BLIND (0 lines on 22/24/26/27!)** | **BLIND** | **KNOWN LIMIT** (reads `SAME`) |
| `arr.push(1.5)` **200 calls** | blind | **SEEN UNATTR** (`2x in push+0 at <unknown>`) | blind | `NO-VERDICT` via `UE` |
| `arr[100000] = 'dict'` (`HOLEY -> DICT`) | **SEEN** (`map-details` `elements kind:` diff) | blind | blind | `DIFF` (`MAP_ELEM_DICT`) |
| Deprecating field repr (`Point` `x: s -> d`) | **SEEN** (`Deprecate`) | blind | **SEEN** (`(+1 maps)`) | `DIFF` (`MAP_DEPRECATE` + `GEN`) |
| In-place field gen (`const->mut`, `h->t`, `Class->Any`) | blind | blind | **SEEN** (2 lines folded to 1 site) | `DIFF` (`GEN`) |
| Plain `{ a: i, b: 2 }` boilerplate init | normal `Transition` | none | `v{None}` (all 4) + `12x s->s` (22/24) | `SAME` (filtered to `I`; `N4` + `D6`) |

### 3.2 Additional Verified Behaviors
- **Log size & `map-details`:** `--log-maps` keeps `map-details` ON (~4.6x larger than `--no-log-maps-details`: ~12.3 MB vs ~2.7 MB on `unstable-all.mjs`, depending on absolute path length) so `MAP_AWK` distinguishes `HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS` from benign `Symbol()` transitions (`HOLEY_ELEMENTS -> HOLEY_ELEMENTS`) across Node 22/24/26/27 with zero hardcoded hashes.
- **N1 non-target user helper (`helper-clean.mjs` vs `helper-del.mjs`, `--fn mk`):**
  - At **200 calls** (`del` not inlined): `NO-VERDICT` (rc 2) naming `UNATTR MAP_NORMALIZE user:del DeletingProperty` (verified on all 4 Node majors).
  - At **20,000 calls** (`del` inlined into `mk`, verified on `v26.8.2`): `DIFF` (rc 1) naming `before=0 after=1 mk MAP_NORMALIZE DeletingProperty`.
  - Owner tag uses `user:<fn>` (never full file path), so A/A twins with different filenames stay `SAME`.
- **N2 warm clean array function (`arr(i){ return [1,2,3]; }`, verified on `v26.8.2`):**
  - At **200 calls**: `arr` compiles only to Ignition `~` with 0 map/stdout events -> **`NO-VERDICT` (rc 2)** with explicit guidance `(warm up more until optimizing compile, or function was never called)`.
  - At **20,000 calls**: `arr` reaches optimizing compile (`R arr`) -> **`SAME` (`before 0 | after 0 site(s)`, rc 0)**.
  - Honesty note: the execution guard (`R` = optimizing compile OR attributed map/ELEM/GEN/I event) does **not** accept un-optimized warm clean array or pure-arithmetic functions; callers must warm those drivers until an optimizing compile fires (or adopt `Q-SD-GUARD (a)`).
- **D2 compiled-but-uncalled (`probes/uncalled.mjs`):** Both `neverCalledParenFn` (default lazy) and `neverCalledTop` (`--no-lazy`) return **`NO-VERDICT` (rc 2)** on all 4 Node majors.
- **D12 multi-run execution guard:** `judge_side()` checks `exec_state` on **every** run `1..N` (not only run 1), verified by `--self-test` Test 6 and mutant kill.
- **Format-drift honesty (`N7`):** `X` catches malformed lines that keep known prefixes (`elements transition `, `[generalizing]`, `map,`, `code-creation,`), NOT a future V8 build that silently renames or suppresses a prefix. Mitigation: per-major real captures plus S-8 must-DIFF controls (`probes/run-probes.sh` Section 4).

---

## 4. Architecture, Exit Table, Reuse Map, and Alternatives That Lost

### 4.1 Exit Table

| Mode | Invocation | Exit `0` | Exit `1` | Exit `2` |
| --- | --- | --- | --- | --- |
| `diff` | `--fn LIST BEFORE AFTER` | `VERDICT SAME` (attributed AND unattributed/external identical) | `VERDICT DIFF` (attributed sites differ) | `VERDICT NO-VERDICT` (refusal, `X`, nullctl, guard, or unattributed/external delta) |
| `self-test` | `--self-test` | all 15 checks ok | `>= 1` check FAILED | unexpected error / extra arg |
| `help` | `-h \| --help` | *(never)* | *(never)* | usage text printed to stderr |

### 4.2 Exact `lib/*.sh` Reuse Map (Verified Against Live `lib/`)
- `lib/prologue.sh`: strict mode, `nocasematch`, `posix`, `FINAL`/`DIED` fail-closed EXIT trap, `_sig`, `sig_arm`, `drv_wait`, `LC_ALL=C`.
- `lib/msdiff.sh`: `MSDIFF_AWK` verbatim.
- `lib/common.sh`: `die`, `say`, `multiset`, `worst` (`SAME/DIFF/NO-VERDICT` matches directly because `--stable` is dropped!), `nl_refuse`, `nl_dir`, `rep_refuse`.
- `lib/args.sh`: `need()` verbatim (supports `--fn=LIST` and refuses `--fn=`).
- `lib/v8flags.sh`: `V8FL_AWK`, `V8FL_RE`, `v8fl_read`, `v8fl_ok`, `v8fl_check` verbatim (`0` edits to `lib/v8flags.sh`).
- `lib/nullctl.sh`: file-based `cmp -s` + `MSDIFF_AWK` pattern over `$MSDIR/<fn>.<side>.<k>.txt` (and `_unattr.<side>.<k>.txt`).

### 4.3 Alternatives That Lost
- **Shipping a `--stable` gate:** Loses because 1 cold call to `a.push(1.5)` transitions `PACKED_SMI -> PACKED_DOUBLE` with 0 lines across all 3 flags on Node 22/24/26/27; an exit-0 `STABLE` verdict would lie.
- **Dropping `--no-node-snapshot` to dodge the Node 22 crash:** Loses because it leaves 94+ unresolved non-zero map `pc`s and still crashes Node 22 if any Sparkplug user frame generalizes. `--no-sparkplug` fixes both cleanly.
- **`ic-diff` Phase 5 `--log-maps` section instead of `shape-diff`:** Loses because `--log-maps` alone is 100% blind to fast `JSArray` elements-kind transitions (`PACKED_SMI -> DOUBLE -> ELEMENTS -> HOLEY`) and all in-place field generalizations (`const -> mutable`, `Class(X) -> Any`, `h -> t`).
- **157-line stdout-only draft (`research/shape-diff.sh`):** Loses because stdout flags alone are blind to `delete` (`Normalize`/`NormalizeCached`), `Deprecate`, and `HOLEY -> DICTIONARY_ELEMENTS`, and its "record exists" guard could never say `SAME` on a clean function.
- **Node `node:inspector` CLI (like `alloc-per-op.mjs`):** Could solve cold compiled-vs-ran via `Profiler.startPreciseCoverage`, but cannot observe V8 internal map transitions / elements kinds / field generalizations without the exact same V8 trace flags, while breaking the standalone bash diff template.

---

## 5. Maintainer Rulings Needed (`Q-SD-*`, Recommended Option First)

- **`Q-SD-NODE` (`N3`/`N4`):** Supported Node range.
  - **(a) (Recommended, verified live)** Support Node `>= 22` (`22/24/26/27+`) by passing `--no-sparkplug --no-node-snapshot` (fixes the Node 22 `CodeKind::BASELINE` crash with `0` unresolved `pc`s) plus the `LHS == RHS` no-op GEN filter (`N4`), with one real capture per major in `--self-test`.
  - (b) Support Node `>= 24` only and refuse Node 22 before first spawn.
  - (c) Node 26 only.
- **`Q-SD-OWNER` (`N1`):** Non-target JS (`user:<fn>` / `node:<fn>`) and builtin instability.
  - **(a) (Recommended, implemented in prototype)** Record all non-target map / ELEM / GEN instability into `UM` / `UE` (path-stripped `user:<fn>`, `node:<fn>`, `Builtin:*`, `NONE`) so any delta upgrades `SAME -> NO-VERDICT` naming the external owner; pin with must-fail rows at both 200 (`NO-VERDICT`) and 20,000 (`DIFF`) calls.
  - (b) Require every callee in `--fn`, documented.
  - (c) Document as known limit (retains false `SAME`).
- **`Q-SD-GEN-INIT` (`D6`/`N4`):** What counts as a GEN instability.
  - **(a) (Recommended, implemented in prototype)** Fold the dual reason lines (`(uninitialized field)` + `(field type generalization)`) into one canonical record, and move both `:v{None;...}->` and `LHS == RHS` no-ops (Node 22/24) out of `E` into REPORTED `I`.
  - (b) Keep raw reason lines separate and drop only `v{None}`.
- **`Q-SD-GUARD` (`N2`):** Execution evidence for warm clean array / pure-arithmetic functions.
  - **(a) (Recommended for L2)** Accept `K` as evidence ONLY when the function has `K` in every run on both sides AND the driver emits a `@@LITE-MARK` execution bracket, else `NO-VERDICT` with warm-up guidance.
  - (b) Keep `R`-only (optimizing compile or attributed map/shape event, current prototype) and document that clean array fns need a hot driver (e.g., 20,000 calls).
  - (c) Require an optimizing compile (`--min-tier`) on every target fn.
- **`Q-SD-UNATTR` (`D1`/`D4`/`N5`):** Unattributed/external instability delta contract.
  - **(a) (Recommended, implemented in prototype)** Put `UM` + `UE` through the null control and upgrade `SAME -> NO-VERDICT` on any cross-side delta, guarded by dedicated `--self-test` rows for `diff_fn`, `UE` nullctl, and `NONE` owner.
  - (b) Require a `@@LITE-MARK` stdout window before checking unattributed deltas.
  - (c) REPORTED only (retains false `SAME` on `Reflect.deleteProperty` and `splice`).
- **`Q-SD-KEEP`:** Whether/how `shape-diff` ships when L2 comes up.
  - **(a) (Recommended)** Standalone bash `diff`-only tool (no `--stable`), Node `>= 22`, 1-call `push(1.5)` blind spot prominently documented, scheduled last after 1.1.0-1.4.0.
  - (b) Re-architect around a Node inspector driver if `Q-SD-GUARD (a)` and `(b)` prove inadequate.
  - (c) Drop L2.
- **`Q-SD-TRANS`:** Normal `Transition` / `InitialMap` events.
  - **(a) (Recommended, implemented in prototype)** REPORTED counts by default; opt-in `--include-transitions`.
  - (b) Included in default `diff` verdict.
  - (c) Never diffed (drop `--include-transitions`).
- **`Q-SD-ICDIFF`:** Who owns `--log-maps` (ROADMAP L2 vs `ic-diff` Phase 5).
  - **(a) (Recommended; rule early before any Phase 5 work)** `shape-diff` owns `--log-maps`; drop the `ic-diff` Phase 5 map section from ROADMAP.
  - (b) Both parse `--log-maps` (two parsers to maintain).
  - (c) `ic-diff` Phase 5 owns `--log-maps`; `shape-diff` uses stdout flags only.
- **`Q-SD-OUT` (`D9`/`D11`):** Output and CLI contract.
  - **(a) (Recommended, implemented in prototype)** Full shipped contract (`--out DIR`, `report.txt`, `raw/`, `nl_refuse`/`nl_dir`, symlink check on `--out` itself, `rep_refuse`, hard-link check, `lib/args.sh` `need()` for `--fn=x`, checked-in per-major real captures in `--self-test`).
  - (b) Temp-dir only.
