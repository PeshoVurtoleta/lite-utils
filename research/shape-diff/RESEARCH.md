# Research: `shape-diff` (ROADMAP L2, scheduled last)

Status: research note + reproducible probes + runnable prototype (not a shipped script or adopted plan).
Host / runtime probed: `darwin-arm64`, `node v26.8.2` (`V8 14.6.202.34-node.28`), `/bin/bash 3.2.57`, BSD awk.
Reproducible probe runner: `probes/run-probes.sh` (runs 6 committed `.mjs` drivers under `env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS`, untimed, **REPORTED** tier).

> **Coverage gap (UNCONFIRMED):** Only `node v26.8.2` on `darwin-arm64` is installed on this host.
> **No Node 22, Node 24, or Linux x64 run has been performed yet.** In particular, **whether Node 22
> traces array-kind changes at all** under `--trace-elements-transitions` (and whether its
> `--log-maps` / `--trace-generalization` formats match Node 26) is **UNCONFIRMED**.

---

## 1. Point of View (Why `shape-diff` Belongs Last -- and Why `--stable` Should Be Dropped)

Live counterexample probing on `node v26.8.2` confirmed that `shape-diff` is by far the hardest,
most V8-hostile tool in the LiteUtils roadmap. Four hard findings govern its design:

1. **No single V8 flag sees all shape-instability modes (3-stream split).**
   - `--log-maps` (with `map-details` ON) sees `Deprecate`, `Normalize`/`NormalizeCached`, `SlowToFast`, `ReplaceDescriptors`, and `HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS` -- but is **100% blind** to fast `JSArray` transitions (`PACKED_SMI -> PACKED_DOUBLE -> PACKED_ELEMENTS -> HOLEY`) and in-place field generalizations (`const -> mutable`, `HeapObject -> Tagged`, `Class(X) -> Any`).
   - `--trace-elements-transitions` (stdout) sees inline fast `JSArray` writes and C++-runtime builtins like `splice` -- but is **100% blind** to `HOLEY -> DICTIONARY_ELEMENTS` AND **completely silent** on CSA/Torque `Array.prototype.push(1.5)`!
   - `--trace-generalization` (stdout) sees deprecating and in-place field generalizations -- but mixes thousands of `node:*` bootstrap lines into stdout AND fires on completely monomorphic object literals `{ a: i, b: 2 }` (`v{None;const}->s{Any;const}`).
2. **DROP `--stable` gate mode: an unqualified `STABLE` verdict is dishonest on V8 14.6.**
   - Probed in `probes/push-silent.mjs` (`--allow-natives-syntax`):
     `const a = [1, 2, 3]; %HasSmiElements(a)` is `true`; after `a.push(1.5)`, `%HasDoubleElements(a)` is `true` -- and **ALL THREE V8 flags (`--log-maps`, `--trace-elements-transitions`, `--trace-generalization`) emit ZERO lines** (not even `<unknown>:<unknown>`)!
   - V8 14.6's CSA/Torque fast path for `Array.prototype.push` transitions elements kinds without invoking `JSObject::TransitionElementsKind` (where `--trace-elements-transitions` logs). Under LiteUtils Q-AUDIT-RUBRIC ("Rubric by consequence"), a `--stable` gate that prints `VERDICT STABLE` (exit 0) on `a.push(1.5)` gives a **wrong verdict** and cannot be fixed from bash.
   - Therefore, the revised prototype **removes `--stable`** and focuses strictly on `diff` mode, documenting the CSA `Array.prototype.push` blind spot prominently.
3. **Other builtin mutations (`Reflect.deleteProperty`, `Array.prototype.splice`) CAN be caught fail-closed in `diff` mode.**
   - Probed in `probes/builtins-dirty.mjs`:
     - `Reflect.deleteProperty(o, 'y')` emits `map,NormalizeCached,...,DeletingProperty,` with `pc` inside `Builtin:ReflectDeleteProperty` (line `0`, col `-1`).
     - `a.splice(0, 1, 'str')` emits `elements transition [PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS] in splice+0 at <unknown>:<unknown>`.
   - A naive per-`--fn` filter drops both and falsely prints `VERDICT SAME` (rc 0).
   - **Fix implemented in the revised prototype:** track the whole-process **unattributed builtin instability multiset** (`UM` from `Builtin:*`/`NONE` map events + `UE` from `<unknown>:<unknown>`/`[]` stdout events; verified 3/3 identical across runs). If attributed `--fn` sites look `SAME` while unattributed builtin instability differs between BEFORE and AFTER, **fail closed to `NO-VERDICT` (exit 2)** naming the exact builtin delta instead of lying with `SAME`.
4. **Telling "compiled" from "ran" is NOT solved by `code-creation` or `--log-function-events`.**
   - Probed in `probes/uncalled.mjs`:
     - Under default lazy mode, `(function neverCalledParenFn(x) { return x.a; })` emits `code-creation,JS,10,...,~` AND `function,interpreter,...` (`--log-function-events`) without ever running.
     - Under `--no-lazy --always-sparkplug`, **every** uncalled function emits BOTH Ignition `~` AND Sparkplug `^` without ever running!
   - **Fix implemented in the revised prototype:** the Law #4 guard requires **execution evidence** (`R <fn>` = an optimizing compile `+`/`*`/OSR OR >= 1 attributed `map` event, OR an attributed stdout `ELEM`/`GEN`/`v{None}` event -- NEVER `~` or `^` alone!). Both `neverCalledParenFn` (default lazy) and `neverCalledTop` (`--no-lazy`) now fail closed to `NO-VERDICT`. Cold non-object functions remain an open gap (section 5).

---

## 2. Empirical V8 Probe Findings (`node v26.8.2`, `darwin-arm64`)

Every line below is **verbatim** output captured from:
```sh
/bin/bash research/shape-diff/probes/run-probes.sh
```
(`<REPO>` = `/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils`.)

### 2.1 The 3-Source Visibility Matrix (`node v26.8.2`)

| Shape event | `--log-maps` (with `map-details`) | `--trace-elements-transitions` | `--trace-generalization` |
| --- | --- | --- | --- |
| Property add (`InitialMap` / `Transition`) | **SEEN** (`pc`, `line:col`) | blind | blind |
| `delete p.y` (`Normalize` / `NormalizeCached`) | **SEEN** (`DeletingProperty`, works even from TurboFan `*'` `pc`) | blind | blind |
| `Reflect.deleteProperty(o, 'y')` | **SEEN UNATTRIBUTED** (`pc` in `Builtin:ReflectDeleteProperty`, line `0`, col `-1`) | blind | blind |
| Inline `arr[0] = 1.5` (`PACKED_SMI -> PACKED_DOUBLE`) | **BLIND** (root maps pre-allocated in `NativeContext`) | **SEEN ATTRIBUTED** (`in ~work+63 at ...:42`) | blind |
| `arr.splice(0, 1, 'str')` (`PACKED_DOUBLE -> PACKED_ELEMENTS`) | **BLIND** | **SEEN UNATTRIBUTED** (`in splice+0 at <unknown>:<unknown>`) | blind |
| `arr.push(1.5)` (`PACKED_SMI -> PACKED_DOUBLE`) | **BLIND** | **BLIND (0 lines! CSA/Torque fast path)** | **BLIND** |
| `arr[100000] = 'dict'` (`HOLEY -> DICTIONARY_ELEMENTS`) | **SEEN** (`map,Transition` + `map-details` `HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS`) | **BLIND (0 lines!)** | blind |
| Deprecating field repr change (`Point` `x: s -> d`) | **SEEN** (`map,Deprecate`, no field types) | blind | **SEEN** (`x:s{Any;const}->d{Any;const} (+1 maps)`) |
| In-place field generalization (`const -> mutable`, `Class(X) -> Any`, `h -> t`) | **BLIND** (mutates `DescriptorArray` in place) | blind | **SEEN** (prints 2 lines: `(uninitialized field)` + `(field type generalization)`) |
| Plain `{ a: i, b: 2 }` boilerplate init | normal `Transition` (`a`, `b`) | none | **FIRES** (`a:v{None;const}->s{Any;const}` -- must filter `:v{None;...}->`!) |

### 2.2 Log Size vs Accuracy: Why `map-details` MUST Stay ON

Measured by `probes/run-probes.sh` section 1 on `probes/unstable-all.mjs`:
```text
  with details:    12304211 bytes  (18139 lines)
  no-map-details:  2691976 bytes   (18139 lines)
```
Although `--no-log-maps-details` cuts log size ~4.6x, V8's internal `elements_transition_symbol` has
**no description string**. Both sparse-array dictionary transitions AND benign user `Symbol()`
properties emit the exact same `map,Transition,...,symbol(hash <hex>)` line:
```text
# Verbatim from probes/clean-and-literal.mjs (benign user `const anonSym = Symbol(); box[anonSym] = 42`):
map,Transition,496346,0x079ad7a5a289,0x3293af8db769,0x31e80015ff70,25,16,,symbol(hash 2c26c9e3)  [EK: HOLEY_ELEMENTS -> HOLEY_ELEMENTS]

# Verbatim from probes/unstable-all.mjs (sparse array `arr[100000] = 'dict'`):
map,Transition,512773,0x2888d5de2429,0x20f29521c401,0x0cc5b88602cc,43,31,,symbol(hash 28443365)  [EK: HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS]
```
Keeping default `--log-maps` (with `map-details` ON) lets `MAP_AWK` record `map_ek[$3]` from
`elements kind: [A-Z0-9_]+` and detect `map_ek[$4] != map_ek[$5]` cleanly across V8 versions with
zero hardcoded snapshot hashes and zero false positives on `Symbol()`.

### 2.3 Verbatim Sample Trace Lines (`node v26.8.2`, `probes/run-probes.sh`)

1. **`--log-maps` (`probes/unstable-all.mjs` and `probes/builtins-dirty.mjs`):**
   ```text
   map,Transition,512661,0x20f29521c1c9,0x20f29521c261,0x0cc5b88603a2,14,30,,x
   map,Transition,512773,0x2888d5de2429,0x20f29521c401,0x0cc5b88602cc,43,31,,symbol(hash 28443365)
   map,Normalize,512801,0x20f29521c2b9,0x20f29521c499,0x0cc5b88602da,44,19,DeletingProperty,
   map,Deprecate,512808,0x20f29521c2b9,0x000000000000,0x0cc5b88603a2,14,30,,
   map,NormalizeCached,551082,0x1f7c54ddb3d9,0x16ab7b741439,0x00010657b464,0,-1,DeletingProperty,
   ```
   (Last line is `Reflect.deleteProperty(o, 'y')` from `builtins-dirty.mjs`, whose `pc` `0x00010657b464` resolves to `Builtin:ReflectDeleteProperty`.)

2. **`--trace-elements-transitions` (`probes/unstable-all.mjs` and `probes/builtins-dirty.mjs`):**
   ```text
   elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+63 at file://<REPO>/research/shape-diff/probes/unstable-all.mjs:42 for 0x0f7368f9f5a1 <JSArray[3]> from 0x20f29521c0c9 <FixedArray[3]> to 0x0f7368f9f9c1 <FixedDoubleArray[3]>
   elements transition [PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS] in splice+0 at <unknown>:<unknown> for 0x3ec017d1eb31 <JSArray[4]> from 0x3ec017d1ec39 <FixedDoubleArray[22]> to 0x3ec017d1ecf9 <FixedArray[22]>
   ```

3. **`--trace-generalization` (`probes/unstable-all.mjs`, `probes/clean-and-literal.mjs`, and `node:diagnostics_channel`):**
   ```text
   [generalizing]x:s{Any;const}->d{Any;const} (+1 maps) [new ~Point+2 at file://<REPO>/research/shape-diff/probes/unstable-all.mjs:14]
   [generalizing]child:h{Class(0x20f29521bc09);const}->h{Any;const} (field type generalization) [new ~Holder+2 at file://<REPO>/research/shape-diff/probes/unstable-all.mjs:18]
   [generalizing]x:d{Any;const}->d{Any;mutable} (uninitialized field) [~fieldGen+7 at file://<REPO>/research/shape-diff/probes/unstable-all.mjs:23]
   [generalizing]y:h{Class(0x20f29521bfc9);const}->t{Any;mutable} (field type generalization) [~fieldGen+13 at file://<REPO>/research/shape-diff/probes/unstable-all.mjs:24]
   [generalizing]a:v{None;const}->s{Any;const} (uninitialized field) [~makeLit+19 at file://<REPO>/research/shape-diff/probes/clean-and-literal.mjs:15]
   [generalizing]{symbol 0x3c473b527679}:h{Any;const}->h{Any;mutable} (field type generalization) [new ~TracingChannel+37 at node:diagnostics_channel:424]
   ```

### 2.4 Verified Format & Normalization Traps

1. **No space after `[generalizing]`:** V8 14.6 prints `[generalizing]x:...` with zero space after `]`.
2. **Monomorphic literal `{ a: i, b: 2 }` boilerplate init (`:v{None;...}->`):**
   - `makeLit` emits `a:v{None;const}->s{Any;const}` once on first literal creation.
   - **Important trap:** V8 14.6 ALSO prints the suffix `(uninitialized field)` on real `x:d{Any;const}->d{Any;mutable}` and `y:h{Class(...);const}->t{Any;mutable}` generalizations! So filtering MUST match `:v\{None;[^}]*\}->`, NEVER the string `(uninitialized field)`.
3. **Three per-run random hex values (verified across consecutive runs in `probes/run-probes.sh` section 6):**
   - `Symbol` hashes in `--log-maps`: `symbol(hash 32709bb4)` vs `symbol(hash 13f8deb7)` (and named `symbol("ResolveCache" hash 30d325)` vs `b75eaad`) -> normalize `hash [0-9a-fA-F]+` to `hash *`.
   - `Class(0x...)` pointers in `--trace-generalization`: `Class(0x222bc6adbf89)` vs `Class(0x32488821bc09)` -> normalize to `Class(0xADDR)`.
   - `{symbol 0x...}` pointers in `--trace-generalization`: `{symbol 0x3c473b527679}` -> normalize to `{symbol 0xADDR}`.
4. **Constructor `new ` prefix:** `[new ~Point+2 at ...]` and `[new ~Holder+2 at ...]`.
5. **Regular-file stdout redirection (never a pipe):** V8 writes `--trace-elements-transitions` and `--trace-generalization` directly to stdout; non-blocking pipes drop V8 writes when JS touches `process.stdout` (`src/bytecode-budget.sh`).
6. **Compiled vs ran (`probes/uncalled.mjs` verbatim evidence):**
   - Default lazy: `neverCalledParenFn` emitted `code-creation,JS,10,...,~` AND `function,interpreter,...,neverCalledParenFn` (`--log-function-events`) without running.
   - `--no-lazy --always-sparkplug`: all 3 uncalled functions (`neverCalledArrow`, `neverCalledParenFn`, `neverCalledTop`) emitted BOTH `~` AND `^` without running.
   - `--no-lazy --no-lazy-feedback-allocation --log-ic`: `LoadIC` fired ONLY on `calledOnce` (`LoadIC,...,key=a,0->1`), never on the 3 uncalled functions (works for functions with IC sites, not for pure-arithmetic functions).

---

## 3. Proposed Architecture (`src/shape-diff.sh` & Prototype Decisions)

See runnable blueprint: [shape-diff.prototype.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/shape-diff/shape-diff.prototype.sh).

- **Mode:** `diff` mode only (`--stable` intentionally omitted; see section 1).
- **Flags:** `--log-maps --trace-elements-transitions --trace-generalization --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot --logfile=<abs>/run.log`, with stdout+stderr redirected to a regular file `run.<k>.out`.
- **LEDGER law 4 `--v8-flags` allowlist:** embeds `lib/v8flags.sh` (`v8fl_check` against `node --v8-options`).
- **`--out DIR` parity:** full symlink / hardlink / non-empty / writable / input-collision refusals; writes `DIR/report.txt` and `DIR/raw/{before,after}/run.<k>.{log,out}`.
- **Two single-pass POSIX awk parsers:**
  - `MAP_AWK`: `pc -> code-creation` join (generation-cached newest-first, allows optimized `*`/`+` `pc`s, cross-Node `$9` markers), `map-details` `elements kind:` extraction for `MAP_ELEM_DICT`, per-site deduplication (`M`), separate `K` (compiled) vs `R` (execution evidence) records, and whole-process `UM` records for `Builtin:*` / `NONE` instability events.
  - `SHAPE_STDOUT_AWK`: parses `^elements transition ` and `^\[generalizing\]`, filters `:v{None;...}->` into `I` (REPORTED boilerplate inits + execution evidence), normalizes `Class(0xADDR)` and `{symbol 0xADDR}`, records attributed sites `E`, and records unattributed `<unknown>:<unknown>` / `[]` instability lines as `UE`.
- **Fail-closed unattributed delta guard:**
  - Verified live on `probes/builtins-clean.mjs` vs `probes/builtins-dirty.mjs`: `mutBuiltins` had `0` attributed sites on both sides, while `UM` + `UE` captured BOTH `UNATTR ELEM splice PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS` and `UNATTR MAP_NORMALIZE Builtin:ReflectDeleteProperty DeletingProperty`, failing closed to **`VERDICT NO-VERDICT` (exit 2)** instead of returning a false `SAME`.
  - Verified live on `probes/clean-and-literal.mjs` vs itself: `Point`, `makeLit` (`{ a: i, b: 2 }`), and `work` (benign `Symbol()`) all returned **`VERDICT SAME` (exit 0)** with `0` instability sites (`boilerplate-vNone-inits: before=2 after=2` for `makeLit`).
  - Verified live on `probes/uncalled.mjs` (both default lazy and `--no-lazy`): `neverCalledParenFn` and `neverCalledTop` both returned **`VERDICT NO-VERDICT` (exit 2)** (`compiled (~ or ^) only`).

---

## 4. Known Limits & Open Maintainer Decisions

### Known Limits (Permanent V8 Limits on Node 26.8.2)
1. **CSA/Torque `Array.prototype.push` is completely silent:** `a.push(1.5)` transitions `PACKED_SMI -> PACKED_DOUBLE` with 0 lines across all 3 V8 flags (`probes/push-silent.mjs`). Neither `diff` nor any `--stable` gate can detect it via V8 trace flags.
2. **Other builtin mutations (`Reflect.deleteProperty`, `splice`, `Object.setPrototypeOf`) lack JS caller attribution:** `shape-diff` fails closed to `NO-VERDICT` when they differ between BEFORE and AFTER, rather than falsely claiming `SAME`, but cannot attribute them to a specific `--fn`.
3. **Driver stdout is trusted:** driver output printing `elements transition ` or `[generalizing]` collides with `SHAPE_STDOUT_AWK`.
4. **Inlined callees attribute to the optimized caller:** runtime calls from inlined code resolve `pc` inside the caller's compiled range.
5. **Debug-print format fragility:** `--trace-elements-transitions` and `--trace-generalization` are human-readable V8 debug prints; parsers fail closed (`X`) if format changes across V8 majors.

### Open Questions Before Planning `shape-diff`
- **`Q-SD-KEEP`:** Given the unfixable CSA `Array.prototype.push` blind spot and the fragility of 3 combined V8 streams (2 of them stdout debug prints), should `shape-diff` stay a bash trace-diff tool, become a Node inspector/V8-native tool (like `alloc-per-op.mjs`), or be narrowed/dropped when the roadmap reaches it?
- **`Q-SD-UNATTR`:** In `diff` mode, is upgrading `SAME -> NO-VERDICT` on unattributed builtin instability deltas (implemented in prototype) the right contract, or should a `@@LITE-MARK` stdout window (like `allocation-diff.sh`) be required for whole-process builtin diffs?
- **`Q-SD-TRANS`:** Default `diff` on instability events only (with `--include-transitions` opt-in), or diff all `Transition` events by default?

---

## 5. Unconfirmed / Open Research Gaps (Must Probe Before Planning)

1. **Node 22 and Node 24 (`--trace-elements-transitions`, `--trace-generalization`, `--log-maps`):**
   **UNCONFIRMED.** In particular, it is NOT yet verified whether Node 22 traces array-kind changes
   at all under `--trace-elements-transitions`, whether its `[generalizing]` prefix has a space or
   prints dual `(uninitialized field)` / `(field type generalization)` lines, or whether its
   `--log-maps` `map` / `map-details` schema matches Node 26.8.2.
2. **Linux x64:** **UNCONFIRMED.** No Linux x64 run has been performed (unattributed Node bootstrap
   counts and `map-details` lines may differ across OS/V8 builds).
3. **How to tell "compiled" from "ran" for cold non-object functions:**
   **OPEN GAP.** Our execution guard (`R` = optimizing compile `+`/`*` OR attributed `map`/`ELEM`/`GEN`/`v{None}` event) accurately rejects compiled-but-uncalled functions (`neverCalledParenFn`, `--no-lazy`, `--always-sparkplug`) AND accepts every hot or shape-touching function. However, for a cold function called once that touches zero objects/arrays (pure arithmetic), pure V8 log flags (`--log-maps`, `--log-code`, `--log-function-events`, `--log-ic`) cannot prove it executed; doing so reliably would require V8 precise coverage (`node:inspector` `Profiler.startPreciseCoverage`), which implies a Node CLI architecture rather than a bash script.
