# Research: `code-size-diff` (ROADMAP L4, target 1.3.0)

Status: research note + reproducible probes + runnable prototype (not a shipped script or adopted plan).
Host / runtime probed: `darwin-arm64`, `node v26.8.2` (`V8 14.6.202.34-node.28`), `/bin/bash 3.2.57`, BSD awk.
Reproducible probe runner: `probes/run-probes.sh` (runs 8 committed `.mjs` drivers under `env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS`, untimed, **REPORTED** tier).

> **Coverage gap (UNCONFIRMED):** Only `node v26.8.2` on `darwin-arm64` is installed on this host.
> **No Node 22, Node 24, or Linux x64 run has been performed yet.** Every cross-Node or Linux x64
> expectation below is explicitly marked **UNCONFIRMED** and must be verified in a pre-planning TASK 0
> run before 1.3.0 is planned.

---

## 1. Point of View (Why 1.3.0 Is the Right Slot)

`code-size-diff` is the cleanest, highest-signal post-1.0 script in the LiteUtils pipeline after `import-audit`:

1. **It closes the exact blind spot left by `bytecode-budget` and `inlining-budget-diff`.**
   - `bytecode-budget` measures Ignition bytecode length (`--print-bytecode`). On `probes/bloat-before.mjs` vs `probes/bloat-after.mjs`, `hot` grew from `38 B -> 72 B` in Ignition, while Maglev grew `824 B -> 1144 B` (`+320 B`) and TurboFan grew `596 B -> 644 B` (`+48 B`).
   - `inlining-budget-diff` tracks whether a callee was inlined and bytecode budget spent, not the emitted native machine-code footprint or deopt-recompile churn (`probes/deopt-reopt.mjs`).
2. **It fits the LiteUtils 7-law template cleanly.**
   - `--log-code --logfile=<abs>/run.log` writes structured CSV into a dedicated file, never mixing with driver stdout/stderr (no pipe truncation, no forging via `console.log`).
   - Reuses the `ic-diff.sh` / `lib/*.sh` architecture verbatim (`prologue`, `msdiff`, `common`, `tracked`, `v8flags`, `args`, plus `stage` if ref/file mode is added).
3. **Hypothesis for avoiding `ic-diff`'s V8-14-only `CodeKind` lock-in (UNCONFIRMED on Node 22/24):**
   - `ic-diff.sh` gates on V8's numeric `CodeKind` enum in CSV field `$3` (`10/11/12/13`), which causes `NO-VERDICT` on Node 22/24 where V8 12/13 used different enum numbers (`LEDGER.md #110, #128`).
   - `code-size-diff` does not need numeric `$3` to classify tiers: field `$9` carries V8's symbolic tier marker (`~`, `^`, `+`, `+'`, `o+`, `*`, `*'`, `o*`). Keying on `$9` *should* work across Node 22/24/26/27+ without a version-keyed enum table, **subject to verifying `$9` markers and `NF == 9` on real Node 22 and Node 24 binaries**.
4. **Three concrete hazards already proven on `node v26.8.2`:**
   - **Hazard 1 -- `--concurrent-sparkplug` is ON by default independently of `--no-concurrent-recompilation`.** Must pass `--no-concurrent-sparkplug` too (section 2.4).
   - **Hazard 2 -- `--turbolev` reuses TurboFan's `JS,13,*'` marker** while changing machine-code size (`344 B -> 336 B` on `probes/deopt-reopt.mjs`). Must refuse `--turbolev` / `--turbolev-future` by exact name AND refuse default-on Turbolev via `--v8-options` (`LEDGER.md #107 G5c`).
   - **Hazard 3 -- `--max` on native code size MUST pin CPU/OS (`--platform-arch`), not only `--node-version`.** A byte limit measured on Apple ARM (`darwin-arm64`) gives a wrong `WITHIN` or `OVER` verdict on `linux-x64` CI legs unless mismatched platform-arch exits `2 NO-VERDICT`.

---

## 2. Empirical V8 Probe Findings (`node v26.8.2`, `darwin-arm64`)

All outputs below were produced verbatim by:
```sh
/bin/bash research/code-size-diff/probes/run-probes.sh
```
(Paths shortened only where noted by `<REPO>` = `/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils`.)

### 2.1 CSV Schema & Event Inventory (`probes/bloat-before.mjs`)

Exact field-1 event counts observed on `bloat-before.mjs`:
```text
  2843  code-creation
   659  code-source-info
    80  script-source
    36  new
    28  delete
     1  v8-version
     1  v8-platform
     1  heap-capacity
     1  heap-available
```
(Plus `code-move` and `sfi-move` in GC-heavy runs.)

`code-creation` field counts:
- **7 fields** for non-JS code (`Builtin`, `BytecodeHandler`, `RegExp`, ...): `code-creation,<type>,<kind_num>,<ts>,<addr>,<size>,<name>`
- **9 fields** for JS code (`JS`, `Eval`, `Script`): `code-creation,<type>,<kind_num>,<ts>,<addr>,<size>,<name_and_loc>,<sfi_addr>,<marker>`

Verbatim `node v26.8.2` lines from `probes/markers.mjs` and `probes/getter-order.mjs`:
```text
code-creation,JS,10,75116,0x3e3b7ba1efd0,36,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,~
code-creation,JS,11,76011,0x115886e60,416,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,^
code-creation,JS,12,75250,0x115849500,756,multiCtx file://<REPO>/research/code-size-diff/probes/markers.mjs:27:27,0xd0cdce93df8,+
code-creation,JS,12,75309,0x115849860,768,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,+'
code-creation,JS,12,76950,0x11584a2e0,780,modOsr file://<REPO>/research/code-size-diff/probes/markers.mjs:14:16,0xd0cdce90d78,o+
code-creation,JS,13,75951,0x115849be0,528,multiCtx file://<REPO>/research/code-size-diff/probes/markers.mjs:27:27,0xd0cdce93df8,*
code-creation,JS,13,76363,0x11584a080,536,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,*'
code-creation,JS,13,75109,0x122e4cd60,552,modOsr file://<REPO>/research/code-size-diff/probes/markers.mjs:14:16,0x3f7583290d68,o*
code-creation,JS,12,75360,0x119949500,340,get file://<REPO>/research/code-size-diff/probes/getter-order.mjs:6:13,0x2cf2acf10a40,+'
code-creation,JS,13,76024,0x1199498a0,220,get value file://<REPO>/research/code-size-diff/probes/getter-order.mjs:4:12,0x2cf2acf10af0,*'
```

### 2.2 Comma Escaping in File Paths (`run-probes.sh` section 6)

Copying `bloat-before.mjs` into `<tmp>/a,b/drv.mjs` produced strictly `NF=9` with `\x2C` escaping:
```text
NF=9  code-creation,Script,10,75504,0xcb6bf11d3b8,115, file:///private/var/folders/.../a\x2Cb/drv.mjs:1:1,0x3733ce810960,~
NF=9  code-creation,JS,10,75916,0xcb6bf11ed18,38,hot file:///private/var/folders/.../a\x2Cb/drv.mjs:3:13,0x3733ce810a88,~
```
`FS = ","` does not split paths containing commas.

### 2.3 Symbolic Tier Marker Table (`$9`) -- Observed vs Unobserved

| `$9` marker | Tier | OSR? | Context-specialized? | Observed live on `node v26.8.2`? |
| --- | --- | --- | --- | --- |
| `~` | `ignition` | no | no | **OBSERVED** (`probes/markers.mjs`: `modHot`, 36 B) |
| `^` | `sparkplug` | no | no | **OBSERVED** (`probes/markers.mjs`: `modHot`, 416 B) |
| `+` | `maglev` | no | no | **OBSERVED** (`probes/markers.mjs`: `multiCtx`, 756 B) |
| `+'` | `maglev` | no | yes | **OBSERVED** (`probes/markers.mjs`: `modHot`, 768 B) |
| `o+` | `maglev-osr` | yes | no | **OBSERVED** (`probes/markers.mjs`: `modOsr` 780 B, `osrCaptures` 940 B) |
| `o+'` | `maglev-osr` | yes | yes | **UNOBSERVED** (`osrCaptures` capturing outer `let` emitted `o+`, not `o+'`; kept defensively) |
| `*` | `turbo` | no | no | **OBSERVED** (`probes/markers.mjs`: `multiCtx`, 528 B) |
| `*'` | `turbo` | no | yes | **OBSERVED** (`probes/markers.mjs`: `modHot`, 536 B) |
| `o*` | `turbo-osr` | yes | no | **OBSERVED** (`probes/markers.mjs` + `--no-maglev`: `modOsr` 552 B, `osrCaptures` 740 B) |
| `o*'` | `turbo-osr` | yes | yes | **UNOBSERVED** (`osrCaptures` + `--no-maglev` emitted `o*`, not `o*'`; kept defensively) |
| anything else | UNKNOWN | -- | -- | **FAIL CLOSED (`X`)** |

**8 of 10** markers are empirically confirmed on `node v26.8.2`; **2 (`o+'`, `o*'`)** were never emitted by V8 14.6 even for an OSR loop capturing a mutable module-scoped variable. Keeping them in the closed allowlist is harmless (they map to `maglev-osr` / `turbo-osr`), and any truly unknown marker still triggers `X`.

### 2.4 Sparkplug (`^`): Concurrency & Batch-Threshold Truth (`probes/sparkplug-10x.mjs`)

Earlier speculation that Sparkplug is "timing noise" was **incorrect / incomplete**. Probing `node --v8-options` and `probes/sparkplug-10x.mjs` revealed two concrete V8 14.6 mechanisms:

1. **`--concurrent-sparkplug` is ON by default AND independent of `--no-concurrent-recompilation`:**
   ```text
   --concurrent-sparkplug (compile Sparkplug code in a background thread)
         type: bool  default: --concurrent-sparkplug
   --baseline-batch-compilation-threshold (the estimated instruction size of a batch to trigger compilation)
         type: int   default: --baseline-batch-compilation-threshold=4096
   ```
   - Without `--no-concurrent-sparkplug`, `sparkplug-10x.mjs` showed **9/10** identical in one 10-run pass (and 10/10 and 20/20 in two other passes) because the Sparkplug background thread raced main-thread logging, and flushed `^` after Maglev/TurboFan (`medFn:+':900 ... medFn:*':720 medFn:^:576`).
   - With **`--no-concurrent-sparkplug`**, Sparkplug compiles synchronously on the main thread (`10/10` identical, script `^` flushed first: `sparkplug-10x.mjs:1:1:^:1128 medFn:^:576 smallFn:^:112 noLoop:^:200`).
   - **Action:** `TRACE_FLAGS` MUST include `--no-concurrent-sparkplug` alongside `--no-concurrent-recompilation`, and `--v8-flags` must refuse `*concurrent-sparkplug*`.
2. **Why `^` still stays out of default `--tiers turbo,maglev` (even with `--no-concurrent-sparkplug`):**
   - Because of `--baseline-batch-compilation-threshold=4096`, whether `fn` emits `^` depends on total bytecode accumulated across *unrelated* functions in the driver (`bloat-before.mjs` stayed below 4096 -> 0 `^` lines; `bloat-after.mjs` crossed 4096 -> `^` flushed for `h1`, `h2`, `h3`, `hot`, and script).
   - Sparkplug is a non-inlining 1:1 baseline template compiler (its size tracks Ignition bytecode rather than inlining bloat). Defaulting to `--tiers turbo,maglev` matches `inlining-budget-diff.sh`, while `~` and `^` stay visible in `REPORTED`.

### 2.5 ASLR Repeatability, Deopt Churn, `--turbolev`, and S-8 Control

- **ASLR heap-constant stability (`probes/aslr-const.mjs`, 8 runs):**
  `8/8` byte-identical: `aslrHot:~:63  aslrHot:+':880  aslrHot:*':680`.
  (On arm64 fixed-width instructions + V8 pointer compression, heap address randomization did not change emitted byte size. **UNCONFIRMED on Linux x64.**)
- **Inlining bloat (`probes/bloat-before.mjs` vs `probes/bloat-after.mjs`):**
  `hot`: Ignition `38 -> 72 B`, Maglev `824 -> 1144 B` (`+320 B`), TurboFan `596 -> 644 B` (`+48 B`).
- **Deopt-recompile churn & `--turbolev` collision (`probes/deopt-reopt.mjs`):**
  - Default flags: `~ 6 B`, `+' 348 B`, `*' 204 B`, `+' 392 B`, `*' 344 B` (multiset retains BOTH Maglev and BOTH TurboFan compiles; `max`/`last` would hide churn).
  - With `--turbolev`: `~ 6 B`, `+' 348 B`, `*' 204 B`, `+' 392 B`, **`*' 336 B`** -- identical `JS,13,*'` marker, different byte size (`344 -> 336`). Hence exact-name `--turbolev` / `--turbolev-future` refusal + `--v8-options` default-on check.
- **S-8 natives control (`probes/natives-ctrl.mjs`, `--allow-natives-syntax`):**
  Emits exactly two lines for `natFn`: `~ 12 B` and `*' 220 B`.

---

## 3. Proposed Architecture (`src/code-size-diff.sh` & Prototype Decisions)

See runnable blueprint: [code-size-diff.prototype.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/code-size-diff/code-size-diff.prototype.sh).

1. **LEDGER law 4 `--v8-flags` runtime allowlist:**
   - Reuses `lib/v8flags.sh` (`V8FL_AWK`, `V8FL_RE`, `v8fl_read`, `v8fl_ok`, `v8fl_check`): reads `node --v8-options` ONCE, allows ONLY known non-string, non-logging/tracing V8 tuning flags of that binary in valid bool/numeric form, and refuses every Node CLI option (`--eval`, `--inspect`, `--run`, `--test`), unknown flag, and string flag (`--sparkplug-filter=...`).
   - Reuses that same `--v8-options` capture for `TURBOLEV_AWK` (0 extra spawns).
2. **Order-independent prefix ownership (`--fn 'get,get value'` bug fix):**
   - `CODESIZE_AWK` checks `substr(name_loc, 1, pl) == fn " "` AND `rest` starts with `/` or `file:///`, putting `break` **inside** the `rest` path match. Verified on `probes/getter-order.mjs` with both `--fn 'get,get value'` (`get: 340B`, `get value: 416B/220B`) and `--fn 'get value,get'` (identical results).
3. **`--max` gate pins BOTH `--node-version` AND `--platform-arch`:**
   - Probes `node -p 'process.version + " " + process.platform + "-" + process.arch'` from the resolved `NODE_RES` binary itself (avoiding `uname -m` vs Rosetta mismatches).
   - Mismatch on either `--node-version` OR `--platform-arch` exits `2 NO-VERDICT` before any measured run, so an `arm64` baseline can never produce a false `WITHIN` or `OVER` on `linux-x64` CI.
4. **`--out DIR` parity with `ic-diff.sh`:**
   - Refuses symlinks (`DIR/raw`, `DIR/report.txt`), non-empty `DIR/raw`, hardlinked `DIR/report.txt`, or `DIR/report.txt` equal to an input driver BEFORE any spawn; writes `DIR/report.txt` and `DIR/raw/<side>/run.<k>.{log,out}`.
5. **Verdict & guard:**
   - Null control on selected-tier `S` multiset (`tier, size, base:line:col`); cross-side diff on `V` multiset (`fn, tier, size`, stripping line:col so line shifts never false-DIFF).
   - Guard requires >= 1 compile in selected `--tiers`; tells the user if Ignition `~` was seen (`warm up more`) vs never compiled (`no such name or never called`).

---

## 4. Open Maintainer Decisions & Known Limits

### Open Questions Before Planning 1.3.0
- **`Q-CSD-MODES`:** Ship `diff` + `--report` + `--max` (requiring `--node-version` + `--platform-arch`), OR ship `diff` + `--report` only (omitting `--max` because native byte ceilings must be maintained per OS/arch/Node leg)?
- **`Q-CSD-CTX`:** Strip context-specialization `'` from the verdict tier key (prototype default) or keep `'` in the verdict key?
- **`Q-CSD-REF`:** Include ref/file staging (`lib/stage.sh`) in 1.3.0, or driver-mode only like `ic-diff` 1.0.0?

### Unconfirmed / Pre-Planning TASK 0 Gaps
1. **Node 22 and Node 24 (`--log-code` CSV schema & `$9` markers):** UNCONFIRMED. Must run `probes/run-probes.sh` on real Node 22 and Node 24 binaries to confirm `NF == 9`, `$9` symbolic markers, `--no-concurrent-sparkplug` availability, and event allowlist.
2. **Linux x64 (and x64 ASLR repeatability):** UNCONFIRMED. Must run `probes/aslr-const.mjs` (8+ runs) on Linux x64 to verify x64 variable-length instruction encoding does not vary byte sizes across ASLR runs.
3. **Unobserved markers `o+'` and `o*'`:** Never emitted by `node v26.8.2` (`V8 14.6`). Confirm in V8 source whether OSR ever sets context-specialization, or whether removing them tightens the allowlist.
4. **Pointer compression / build flags:** Two Node binaries with the same `--node-version` and `--platform-arch` but different V8 build flags (e.g. pointer compression off) would have different code sizes; `--max` only guarantees same release binary target.
