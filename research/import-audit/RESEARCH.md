# Research: `import-audit` (ROADMAP L1, target 1.4.0) -- v1

Status: first research drop v1 (INTAKE + self-checking probes + runnable prototype + 8-package real-code rung + C4 mocks inventory; not a shipped script).
Every `Q-IA-*` id is **RULED (a)** (2026-11-27, section 4 head; amended / new ids in section 6.5).

**Assessment (ia-1.4.0, 2026-11-27, different-model review): REJECTED (DESIGN).** Section 6 is binding over
sections 0-5 wherever they differ (review changes, amended and new `Q-IA-*` option text, U3 / U4 results).

Provenance (this pass): 2026-11-27T09:12Z-09:45Z, `darwin-arm64`, `/bin/bash 3.2.57(1)-release`, BSD awk, `HEAD 0e3952831b533d9042bcbae43fc03ee24b202f11`.
Every Node batch ran under `quiet-lock.mjs run` (host QUIET for Phases A, C, D and diagnostics, load1 2.45-3.26; host PRELIMINARY load1 3.46 during one probe-matrix batch; baseline 2.34, 12 cores).
Tier: REPORTED (untimed; verdicts, descriptor/handle/protector sets, and REPORTED-only young GC counts; no release-gating timing claims).
5 env vars stripped (`NODE_OPTIONS`, `NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE`, `NODE_REDIRECT_WARNINGS`, `NODE`).
Node binaries probed (verbatim `--version` / `process.versions.v8`, `.handoff/evidence/import-audit/A-baseline.txt`):
- `v22.23.5` (`V8 12.4.254.21-node.57`) -- `.handoff/nodes/v22.23.5/x/node-v22.23.5-darwin-arm64/bin/node`
- `v24.22.3` (`V8 13.6.233.17-node.63`) -- `.handoff/nodes/v24.22.3/x/node-v24.22.3-darwin-arm64/bin/node`
- `v26.3.1` (`V8 14.6.202.34-node.20`) -- `/usr/local/bin/node`
- `v26.8.2` (`V8 14.6.202.34-node.28`, primary = CI) -- `/opt/homebrew/bin/node`
- `v27.0.0-alpha.0.1.0` (`V8 15.6.75.50-node.11`) -- `.handoff/nodes/v27.0.0-alpha.0.1.0/x/node-v27.0.0-alpha.0.1.0-darwin-arm64/bin/node`

Evidence logs (local, gitignored): `.handoff/evidence/import-audit/` --
`A-baseline.txt`, `A-draft-{v22.23.5,v24.22.3,v26.3.1,v26.8.2,v27-alpha}.log`,
`B-selftest.log`, `B-teeth-untimed.log`, `B-teeth-live.log`, `B-mutants-bash.log`, `B-mutants-js.log`,
`CASES-EXPECT.tsv`, `CASES-SHA.txt`, `D-diag-3discoveries.log`,
`P-probes-{v22.23.5,v24.22.3,v26.3.1,v26.8.2,v27-alpha}.log`,
`C-B1-B8.log`, `C-B9-fnevents.log`, `C-followup.log`,
`D-realcode-expect.tsv`, `D-realcode-expect.sha256`, `D-realcode.log`.
Self-checking probe runner: `research/import-audit/probes/run-probes.sh` (sha256/8 `02a6720d`, pure bash + awk + node, zero Python, exits 0 iff all 47 assertions across 4 non-empty lanes pass).
Runnable blueprint: `research/import-audit/import-audit.prototype.sh` (sha256/8 `9cc77b5a`, `--self-test`: 34 checks ok).

> **Coverage gap (UNCONFIRMED):** only `darwin-arm64` was run. Linux x64 (mawk/gawk, Ubuntu uutils `cmp`/`seq`, bash 5 inherited `OLDPWD`, Linux process-group `kill -KILL -- -$pgid`, PTY/pipe resource info, V8 protector output on x64) is **UNCONFIRMED** (Rung R7, C5).

---

## 0. Changes vs 2026-11-05 Draft (`a29197a9`)

Frozen baseline: `.handoff/research/post-1.0/research/import-audit.sh` (sha256/8 `a29197a9`, never edited; tested from private copies). Prototype: `research/import-audit/import-audit.prototype.sh` (sha256/8 `9cc77b5a`).

- **A1 + A2 (prototype descriptor + symbol snapshot):** Replaced the draft's `Object.getOwnPropertyNames(p)` name-only Set with `Reflect.ownKeys(p)` + `Object.getOwnPropertyDescriptor(p, k)` + `descEq(d0, d1)` comparing `enumerable`, `configurable`, accessor vs data kind (using `Object.hasOwn`, never `in`), `Object.is(get/set)`, `writable`, and `Object.is(value)`. Catches replaced methods (`Array.prototype.map`), symbol-keyed additions (`Array.prototype[Symbol.for(...)]`), attribute edits, and deletions.
- **A3 (`lib/v8flags.sh` allowlist + pre-spawn refusal):** Replaced the draft's ad-hoc flag denylist with the verbatim `lib/v8flags.sh` allowlist (`v8fl_read` / `v8fl_ok` / `v8fl_check`), plus pre-spawn refusal of tool-owned flags (`*trace-gc*`, `*semi-space*`, `*protector*`, `*concurrent-recompilation*`, `*log-function-events*`), node preload/eval/print flags, and `V8FL_RE` log/prof/trace/print/dump/snapshot/file families (0 spawns on `--log-all` and `--prof`, LEDGER law 3 + law 4).
- **A4 (5-var env strip):** Strips `NODE_OPTIONS`, `NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE`, `NODE_REDIRECT_WARNINGS` at script startup (`unset`, matching `src/ic-diff.sh:154` / `src/allocation-diff.sh:158` Q-ENV; `lib/common.sh` has no env-strip helper today -- see section 3.2) and strips all 4 plus `NODE` in `PROBE_ENV` on every child spawn.
- **A5 (descriptor-only `globalThis` + fixed-point baseline):** Replaced `globalThis[k]` value reads with `Reflect.ownKeys(globalThis)` + `Object.getOwnPropertyDescriptor(globalThis, k)`. Never invokes JS getters (draft invoked redefined `globalThis.crypto` getter during diff and still read CLEAN; prototype has 0 getter invocations and reads DIRTY `G changed crypto x1`). Iterates `g0` to a fixed point (`<= 4` passes) before `@@LITE-MARK start` because Node's C++ `SetLazyDataProperty` on `globalThis.FormData` materializes `Symbol(undici.globalDispatcher.1)` (and `.2` on Node 24+) during the first descriptor walk (`D-diag-3discoveries.log`).
- **A6 (per-run process-group timeout):** Added `--timeout SEC` (1..300, default 15). Each audit runs in its own process group (`set -m`, private `$TMP_DIR/cwd.$k`) with a watchdog killing `-$SIG_PGID` -> `NO-VERDICT -- timed out after Ns in run k` (rc 2; never `pkill`, LEDGER laws 1 & 10).
- **Primordial tamper resistance:** `audit.mjs` captures `Reflect.ownKeys`, `Object.getOwnPropertyDescriptor`, `Object.is`, `Object.hasOwn`, `Map` methods (via bound `Function.prototype.call`), `String.prototype.replace`, `Symbol.prototype.toString`, `process.getActiveResourcesInfo`, and `process.exit` before `await import()`, uses indexed `for` loops (never `for..of`), and concatenates `out` as a string -- immune to modules that poison `Array.prototype[Symbol.iterator]`, `Object.prototype.get`, or `Map.prototype.get`.
- **Zero-evidence baseline gate:** `audit.mjs` emits `B globals=<n> protos=<n> resources=<n>` on fd 3; `FD3_CHECK_AWK` refuses (`NO-VERDICT`) unless `R ok` appears exactly once, `globals >= 10 && protos >= 50`, and 0 unexpected fd-3 lines appear.
- **C1 + C2 CLI & URL fixes:** `pathToFileURL(process.env.IA_MODULE_PATH).href` (fixes `%20`, `#`, `?`, spaces, quotes in module paths); empty value refusal (`""` and `--opt=`, 0 spawns, SD-neon-4); duplicate option refusal (0 spawns); `--out SYMLINK/` and `SYMLINK/.` refusal (0 spawns, SD-neon-5); `nl_dir` resolved-newline refusal before spawn/mkdir; `rep_refuse` input collision refusal; `-` dir `./-` guard (SD-neon-6); did-you-mean `hint()` and full `-h` citing no unshipped files (SD-neon-8); private per-run cwd `$TMP_DIR/cwd.$k` so nothing V8/Node writes can land beside `MODULE`.
- **Law 6 teeth (`B-teeth-untimed.log`, `B-teeth-live.log`):** 17/17 checks (11 untimed CLI/env/flag/timeout + 6 live Node `A1`/`A2`/`A5`/`A5-no-invoke`/`C1-%20`/`tamper-primordials`) FAIL on frozen draft `a29197a9` and PASS on prototype `9cc77b5a`.
- **Mutant kill table (`B-mutants-bash.log`, `B-mutants-js.log`):** 31/31 single-match (`matches=1`) count-checked mutants KILLED (22 bash/awk + 9 live `DRIVER_JS`), 0 survived, unmodified revert control verified (`sha_match=yes`).

---

## 1. INTAKE Question, Ladder, Kill Rules, and LEDGER Law Mapping

### 1.1 Question & Ladder
Question: can a standalone zero-dependency bash + POSIX awk + embedded `.mjs` driver tool deterministically audit ESM and CJS module imports for global mutations, built-in prototype mutations, open libuv handles, and V8 protector cell invalidations across Node 22 / 24 / 26 / 27 (while reporting import-time young GCs as statistical/REPORTED-only per S-5), obeying LiteUtils's fail-closed contract and LEDGER laws 1, 3, 4, 5, 6, 7, 10?

| Rung | Capability / gate | Kill rule | Status (`darwin-arm64`, this pass) |
| --- | --- | --- | --- |
| R1 Kernel | 1 module adding 1 global on 1 node -> DIRTY; empty module -> CLEAN with non-empty baseline (`globals>=10 protos>=50`) | kill if empty reads DIRTY or 0-baseline reads CLEAN | PASS (`P-probes-v26.8.2.log`; initially failed until `FormData` fixed-point `g0` closed B4 noise, `D-diag-3discoveries.log`) |
| R2 Descriptors & symbols | `Reflect.ownKeys` + full descriptors (`A1`, `A2`, `A5`, tamper-primordials) without invoking JS getters | kill if replaced method/getter/symbol reads CLEAN or audit invokes user getter | PASS on 5 nodes (`B-teeth-live.log`, `P-probes-*.log`) |
| R3 Hygiene & timeout | `lib/v8flags.sh` allowlist (`A3`), 5-var env strip (`A4`), process-group `--timeout` (`A6`), C1 CLI/path guards | kill if `--log-all`/`--prof` spawns node, `NODE_REDIRECT_WARNINGS` leaks, or hang escapes timeout | PASS (`B-selftest.log`, `B-teeth-untimed.log`, `P-probes-*.log`) |
| R4 Protectors, handles & A/A noise | `--trace-protector-invalidation` (`B5`), active resources (`B6`), empty A/A x {file, pipe, PTY} (`B4`), path-length A/A (`C2`), young GC REPORTED only (`B8`) | kill if unfiltered node-owned record breaks empty A/A or GC flips CLEAN -> DIRTY | PASS on 5 nodes (`C-B1-B8.log`, `C-followup.log`, `P-probes-*.log`); `.unref()` timer limit exposed -> `Q-IA-HANDLES` |
| R5 Design probes | All-intrinsics cost/noise (`B1`), `exports` resolution (`B2`), transitive (`B3`), window end (`B6`), scope (`B7`), `--log-function-events` (`B9`) | drop any mechanism that drifts across A/A runs or fails across majors | COMPLETE (`C-B1-B8.log`, `C-B9-fnevents.log`, `C-followup.log`); B9 `first-execution` killed by V8 13+ loss/drift |
| R6 Real code (C3) | 8 `@zakkster/*` `sideEffects: false` packages (untouched CLEAN + injected DIRTY + premise pre-run) | DIRTY on clean code not explained by B4 -> design item + Q-id; real package fault -> report, never edit | PASS 8/8 on `v26.8.2` + 8/8 on `v22.23.5` (`D-realcode.log`, frozen `D-realcode-expect.sha256`) |
| R7 Linux x64 (C5) | Same `probes/run-probes.sh` + `--self-test` green on Ubuntu x64 CI leg | hold 1.4.0 release if Linux x64 diverges | OPEN (UNCONFIRMED) |

### 1.2 LEDGER Law Mapping
- **Law 1 (timeout is a named failure):** `--timeout SEC` kills `-$SIG_PGID` and emits `NO-VERDICT -- timed out after Ns in run k` (rc 2). Unsettled bare TLA without a handle exits 13 immediately -> `NO-VERDICT -- driver exited 13 in run 1` (rc 2).
- **Law 3 (refuse before first spawn or write):** empty option values (`""` / `--opt=`), duplicate options, invalid `--runs`/`--timeout`, newline/CR in raw or resolved `--out` (`nl_dir`), `--out SYMLINK/` and `SYMLINK/.`, hard-linked `--out/report.txt`, input collision (`rep_refuse`), tool-owned `--v8-flags`, preload flags, and `V8FL_RE` log/prof/trace/print/dump/snapshot/file flags all exit 2 with **0 spawns** and unchanged disk.
- **Law 4 (allowlists, not denylists):** `lib/v8flags.sh` (`v8fl_read` / `v8fl_ok` / `v8fl_check`) embedded verbatim; `FD3_CHECK_AWK` allows only `B`, `G`, `H`, `R ok` lines and refuses any unknown fd-3 record.
- **Law 5 (resolve once):** `NODE_RES` resolved once to absolute path; `MOD_ABS` resolved once with `./-` guard for `-` directory; `-`-led `--out` normalized to `./$OUT`.
- **Law 6 (every gate fails on the old code):** 11 untimed + 6 live teeth checks all FAIL on frozen draft `a29197a9` and PASS on prototype `9cc77b5a` (`B-teeth-untimed.log`, `B-teeth-live.log`).
- **Law 7 (portable oracles):** pure `/bin/bash 3.2` + POSIX/BSD `awk` + `node`, zero Python, NUL sanitization `tr '\000' '?'` before `TRACE_AWK`, `set -f` around word splitting of `V8FLAGS`, `LC_ALL=C`. Linux CI leg OPEN.
- **Law 10 (no pkill by pattern, private scratch, never test on live tree):** `set -m` kills only `-$SIG_PGID`; each audit spawns inside private `$TMP_DIR/cwd.$k`; real-code packages extracted read-only via `git -C ... show <sha>:<file>` into `mktemp -d`.
- **S-5 (statistical claims are REPORTED only):** `--trace-gc` young GC counts (`Scavenge` / `Minor Mark-Sweep` in 1 MB semi-spaces) are printed as `(REPORTED, statistical, not gated)`, excluded from null-control `cmp -s`, and never change `CLEAN` to `DIRTY` (proven live on `alloc-import.mjs` and `LiteArena` `0,1` on `v22.23.5`).

---

## 2. Empirical 5-Node Probe Results (`darwin-arm64`, REPORTED)

### 2.1 Frozen Draft (`a29197a9`) Defect Reproduction (`A-draft-*.log`, 5/5 Nodes)

All 5 local Nodes (`v22.23.5`, `v24.22.3`, `v26.3.1`, `v26.8.2`, `v27-alpha`) reproduced all 5 defects identically (`A-draft-{v22.23.5,v24.22.3,v26.3.1,v26.8.2,v27-alpha}.log`, load1 2.74-2.98):

| Defect | Probe | Draft (`a29197a9`) on all 5 Nodes | Prototype (`9cc77b5a`) on all 5 Nodes |
| --- | --- | --- | --- |
| `R2-L1-1` (`A1`) | `Array.prototype.map` replaced with wrapper | `rc=0 CLEAN` (missed!) | `rc=1 DIRTY` (`G proto Array.map [changed] x1`) |
| `R2-L1-2` (`A2`) | `Array.prototype[Symbol.for('lite')] = 1` | `rc=0 CLEAN` (missed!) | `rc=1 DIRTY` (`G proto Array.Symbol(...) [added] x1`) |
| `R2-L1-3` (`A3`) | `--v8-flags --log-all` and `--prof` | `rc=0 CLEAN`, drops 2 `isolate-*-v8.log` beside `MODULE` | `rc=2 NO-VERDICT`, **0 spawns**, 0 files written |
| `R2-L1-4` (`A4`) | `NODE_REDIRECT_WARNINGS=w.txt` | leaked into child (`env-seen.txt = [w.txt]`) | stripped at startup + `PROBE_ENV` |
| `A5` | replace `globalThis.crypto` getter (same return value) | `rc=0 CLEAN` AND invoked getter (`getter_invoked_count=1`, `B-teeth-live.log`) | `rc=1 DIRTY` (`G changed crypto x1`), `getter_invoked_count=0` |

### 2.2 Prototype 5-Node Probe Matrix (`P-probes-*.log`, 235/235 PASS)

Frozen expectations: `.handoff/evidence/import-audit/CASES-EXPECT.tsv` + `CASES-SHA.txt` (rev 1 sha `1db82559`, frozen before first run; rev 2 updated with raw evidence from `D-diag-3discoveries.log` and first-run `P-probes-*.log` because (1) `unref-timer.mjs` is omitted by `process.getActiveResourcesInfo()` on all 5 Nodes, and (2) bare `await new Promise(() => {})` exits 13 immediately without hanging, so it was split into `unsettled-tla.mjs` (rc 2, `driver exited 13`) and `hang-tla.mjs` with a ref'd timer (rc 2, `timed out after 1s`)).

| Node | V8 | `load1` | Baseline `globals / protos / resources` | Lane 0 (anti-tautology) | Lane 1 (premise pre-runs) | Lane 2 (core/A1-A6/B2-B8) | Lane 3 (`C1` paths + `C2` A/A) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `v22.23.5` | `12.4.254.21-node.57` | `3.27` | `131 / 82 / 0` | `2/2` | `15/15` | `20/20` | `10/10` | `47/47 PASS` |
| `v24.22.3` | `13.6.233.17-node.63` | `3.31` | `138 / 82 / 0` | `2/2` | `15/15` | `20/20` | `10/10` | `47/47 PASS` |
| `v26.3.1` | `14.6.202.34-node.20` | `3.30` | `144 / 84 / 0` | `2/2` | `15/15` | `20/20` | `10/10` | `47/47 PASS` |
| `v26.8.2` | `14.6.202.34-node.28` | `3.27` | `143 / 84 / 0` | `2/2` | `15/15` | `20/20` | `10/10` | `47/47 PASS` |
| `v27-alpha` | `15.6.75.50-node.11` | `3.12` | `144 / 84 / 0` | `2/2` | `15/15` | `20/20` | `10/10` | `47/47 PASS` |

Note on `C1` tricky paths (all 5 Nodes, `P-probes-*.log`): `empty.mjs` copied into `sp dir`, `a,b`, `x [1]`, `q'dir`, `q"dir`, `c:dir`, `pct%20dir`, and `-` (with `OLDPWD=/nonexistent_ia_oldpwd`) all read `rc=0 CLEAN` with non-empty baseline; `add-global.mjs` in `pct%20dir` reads `rc=1 DIRTY` (`G added __ia_added x1`). `C2` short dir (`len=58`) vs >120-char nested dir (`len=164`) both read `rc=0 CLEAN` with identical baseline counts on all 5 Nodes.

### 2.3 Design Probes `B1`..`B9` (`C-B1-B8.log`, `C-B9-fnevents.log`, `C-followup.log`, `D-diag-3discoveries.log`)

#### B1: Intrinsic Prototype Reachability, Cost, and Empty-Import Noise (`C-B1-B8.log`, load1 2.69)
Walked every data-property constructor on `globalThis` having a `.prototype` object (descriptor-only, zero JS getter calls) plus 11 hidden `%...Prototype%` intrinsics (`%TypedArray%`, `%IteratorPrototype%`, `%AsyncIteratorPrototype%`, `%GeneratorFunction%`, `%AsyncGeneratorFunction%`, `%AsyncFunction%`, `%ArrayIterator%`, `%MapIterator%`, `%SetIterator%`, `%StringIterator%`, `%RegExpStringIterator%`):

| Node | 5-proto keys | 5-proto snap ms | All-intrinsics count | All-intrinsics keys | All snap0 ms | All snap1 ms | Empty-import diffs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `v22.23.5` | `82` | `0.034` | `107` | `937` | `0.431` | `0.106` | `0` |
| `v24.22.3` | `82` | `0.034` | `113` | `998` | `0.158` | `0.159` | `0` |
| `v26.3.1` | `84` | `0.047` | `116` | `1018` | `0.204` | `0.208` | `0` |
| `v26.8.2` | `84` | `0.037` | `116` | `1024` | `0.171` | `0.178` | `0` |
| `v27-alpha` | `84` | `0.172` | `116` | `1036` | `0.321` | `0.184` | `0` |

Watching ALL ~107-116 reachable intrinsics (~937-1036 keys) takes `< 0.5 ms` and produces **0 empty-import noise** on all 5 Nodes.

#### B2: `MODULE` Specifier Resolution (`C-B1-B8.log`, `P-probes-*.log`)
- File paths (`.mjs`, `.js`, `.cjs`) work cleanly on all 5 Nodes (`B2-cjs-clean` -> CLEAN, `B2-cjs-dirty` -> DIRTY `G added __ia_cjs_global x1`).
- `import.meta.resolve("ia-exp-pkg")` and `import.meta.resolve("ia-exp-pkg/sub")` resolve `package.json` `exports` (`"import"` condition -> `esm.mjs`, subpath -> `sub.mjs`, CJS -> `cjs.cjs`) identically on all 5 Nodes (`v22` through `v27-alpha`).
- Prototype currently refuses `file://` URLs with exit 2 (`MODULE not found (or not a readable file)`).

#### B3: Transitive Imports (`C-B1-B8.log`, `P-probes-*.log`)
- `transitive-parent.mjs` importing `transitive-dep.mjs` (`globalThis.__ia_transitive_global = "from-dep"`) reads `rc=1 DIRTY` (`G added __ia_transitive_global x1`) on all 5 Nodes. JS/V8 provides no built-in module-of-origin attribution for property writes without invasive Proxy/loader instrumentation.

#### B4: Baseline Noise Discovery & A/A Across File / Pipe / PTY (`D-diag-3discoveries.log`, `C-B1-B8.log`)
- **Critical discovery (`D-diag-3discoveries.log`):** Before the fixed-point fix, switching `globalThis` from `Object.getOwnPropertyNames` (draft) to `Reflect.ownKeys` + `Object.getOwnPropertyDescriptor` caused EVERY empty module to read **DIRTY** on all 5 Nodes (`G added Symbol(undici.globalDispatcher.1)` on `v22`; `.1` and `.2` on `v24`/`v26`/`v27`). Bisection (`d1_bisect.mjs`) proved that calling `Object.getOwnPropertyDescriptor(globalThis, "FormData")` triggers Node's C++ `SetLazyDataProperty` callback mid-loop, installing `Symbol(undici.globalDispatcher.*)` onto `globalThis` AFTER `Reflect.ownKeys(globalThis)` had already returned its key array.
- **Zero-allowlist fix:** Iterating `snapDesc(globalThis)` to a fixed point (`<= 4` passes, stabilizes in 2 passes) before `@@LITE-MARK start` eliminates the artifact completely without hiding genuine `undici` mutations (killed by mutant `M31`).
- **15/15 A/A matrix (`C-B1-B8.log`):** `empty.mjs` with stdout redirected to (a) regular file, (b) pipe (`| cat`), and (c) real macOS PTY (`script -q`, verified `stdout_isTTY=true`) reads **`rc=0 VERDICT CLEAN`** with non-empty baseline (`globals=131..144`, `protos=82..84`, `resources=0`, `r0=[]`, `r1=[]`) on all 5 Nodes. No node-owned noise record remained.

#### B5: Protector Cell Names Across V8 12.4 - 15.6 (`C-B1-B8.log`, `C-followup.log`)
Tested 16 distinct prototype/constructor patches across all 5 Nodes (`v22.23.5`, `v24.22.3`, `v26.3.1`, `v26.8.2`, `v27-alpha`). Every firing protector emitted the **exact same cell name** across all 4 V8 majors (`12.4` through `15.6`):

| Patch | Cell name on all 5 Nodes (`v22`/`v24`/`v26.3.1`/`v26.8.2`/`v27-alpha`) | Also caught by prototype snapshot? |
| --- | --- | --- |
| `Array.prototype[Symbol.iterator] = ...` | `ArrayIteratorLookupChain` | Yes (`Array.prototype`) |
| `Promise.prototype.then = ...` | `PromiseThenLookupChain` | Yes (`Promise.prototype`) |
| `Array.prototype.constructor = ...` | `ArraySpeciesLookupChain` | Yes (`Array.prototype`) |
| `Object.defineProperty(Array, Symbol.species, ...)` | `ArraySpeciesLookupChain` | **No** (constructor prop!) |
| `Object.defineProperty(RegExp, Symbol.species, ...)` | `RegExpSpeciesLookupChain` | **No** (constructor prop!) |
| `Object.defineProperty(Promise, Symbol.species, ...)` | `PromiseSpeciesLookupChain` | **No** (constructor prop!) |
| `Array.prototype[0] = 1` and `Object.prototype[0] = 1` | `NoElements` | Yes (`Array`/`Object.prototype`) |
| `Set.prototype[Symbol.iterator] = ...` | `SetIteratorLookupChain` | Yes (under B1 all-intrinsics) |
| `String.prototype[Symbol.iterator] = ...` | `StringIteratorLookupChain` | Yes (under B1 all-intrinsics) |
| `String.prototype[Symbol.toPrimitive] = ...` | `StringWrapperToPrimitive` | Yes (under B1 all-intrinsics) |
| `Array.prototype[Symbol.isConcatSpreadable] = false` | `IsConcatSpreadableLookupChain` | Yes (`Array.prototype`) |
| `Map.prototype[Symbol.iterator]`, `String.prototype[Symbol.match]`, `RegExp.prototype[Symbol.split]`, `String.prototype.length` | `NONE` (0 protector lines on all 5 Nodes) | Yes (prototype snapshot catches all 4!) |

Key finding: `--trace-protector-invalidation` catches constructor `Symbol.species` mutations missed by prototype-only snapshots, while prototype snapshots catch patches with no V8 protector cell (`Map.prototype[Symbol.iterator]`, `String.prototype[Symbol.match]`, etc.). Both are complementary.

#### B6: Handles and Window End (`D-diag-3discoveries.log`, `C-B1-B8.log`)
- **Ref'd vs `.unref()` vs closed handles (all 5 Nodes):**
  - `setInterval(..., 60000)` (ref'd): `getActiveResourcesInfo()` = `[Timeout]` (**DIRTY**), `async_hooks` = `[Timeout]`.
  - `setInterval(..., 60000).unref()`: `getActiveResourcesInfo()` delta = **`0`**, `process._getActiveHandles()` delta = **`0`** on ALL 5 Nodes (`B6_UNREF_API`); ONLY `async_hooks.createHook` sees `Timeout`.
  - `t = setTimeout(..., 60000); clearTimeout(t)` (closed before end): `getActiveResourcesInfo()` = `[]` (CLEAN, documented miss); `async_hooks` STILL reports `[Timeout]` because `destroy` is deferred past synchronous `clearTimeout` (`D-diag-3discoveries.log`).
- **Window end comparison (`C-B1-B8.log`, `v26.8.2`):**
  - `queueMicrotask(() => globalThis.__ia_microtask_late = 1)` and `Promise.resolve().then(() => globalThis.__ia_promise_late = 1)`: **ALREADY CAUGHT (`DIRTY`) at `immediate_end`** because `await import(modUrl)` settles after synchronous import microtasks drain.
  - `setImmediate(() => globalThis.__ia_immediate_late = 1)`: caught at `immediate_end` as `H Immediate x1` (`DIRTY`); under `mode=immediate` caught as `G added __ia_immediate_late` (handle already consumed).
  - `setTimeout(() => globalThis.__ia_timer0_late = 1, 0)`: caught as `H Timeout x1` (`DIRTY`) in all 3 modes.

#### B7: Scope Probes (`C-B1-B8.log`, `C-followup.log`)
Tested 7 side-effect classes on current prototype (`v26.8.2`):
- `Object.defineProperty(globalThis, "__ia_b7_acc", { get()... })`: **CAUGHT** (`rc=1 DIRTY`, `G added __ia_b7_acc x1`).
- **MISSED (`rc=0 CLEAN` today):**
  - `process.on("exit", ...)` and `process.on("uncaughtException", ...)` -- catchable by snapshotting `process.eventNames()` + `process.rawListeners(ev)`.
  - `process.env.IA_B7_LEAK = "1"` -- catchable by snapshotting `Object.entries(process.env)` (keys + values).
  - `Error.stackTraceLimit = 99` and `Error.prepareStackTrace = ...` -- constructor own properties on `Error` (catchable by snapshotting `Error` constructor descriptors or all intrinsic constructors).
  - `new Worker("setInterval(() => {}, 60000);", { eval: true })` -- **SURPRISING FINDING:** returned `rc=0 CLEAN` under `import-audit.prototype.sh` (where stdout is redirected to a file), whereas standalone `b7_w_probe.mjs` under piped stdout showed `r1_immediate=[PipeWrap,PipeWrap]` on all 5 Nodes (`C-followup.log`). A `Worker` also runs in a separate V8 isolate whose global/prototype changes are invisible to the main isolate.

#### B8: Import-Time Allocation (`C-B1-B8.log`, `P-probes-*.log`, `D-realcode.log`)
- `alloc-import.mjs` (40,000 4-field objects at import) reads **`rc=0 VERDICT CLEAN`** on all 5 Nodes while reporting `young GCs during import per run: 1,1` (`v22.23.5`) and `3,3` (`v24.22.3`, `v26.3.1`, `v26.8.2`, `v27-alpha`).
- Real-code validation of S-5: `LiteArena` on `v22.23.5` reported `young GCs during import per run: 0,1` across two identical runs and stayed `CLEAN` (`D-realcode.log`), proving GC counts fluctuate on clean real code and MUST remain REPORTED-only.
- Source: same `--trace-gc --min-semi-space-size=1 --max-semi-space-size=1` machinery as `allocation-diff`.

#### B9: `--log-function-events` `first-execution` Repeatability (`C-B9-fnevents.log`, `C-followup.log`, `K=10`)
Tested `K=10` A/A runs on `b9_empty.mjs` (defines `unusedHelper`, never called) and `b9_extra.mjs` (calls `extraImportCall(41)` at import) across 4 majors (`v22.23.5`, `v24.22.3`, `v26.8.2`, `v27-alpha`):

| Node | V8 | `all_first_exec` empty (10 runs) | `all_first_exec` extra (10 runs) | Window `first-execution` empty | Window `first-execution` extra | `extraImportCall` event types emitted |
| --- | --- | --- | --- | --- | --- | --- |
| `v22.23.5` | `12.4` | `337` (10/10) | `338` (10/10) | `3` (10/10 ident) | `4` (10/10 ident) | `preparse-resolution`, `full-parse`, `parse-function`, `interpreter`, `first-execution` |
| `v24.22.3` | `13.6` | `167` (10/10) | `167` (10/10) | **`0`** (10/10) | **`0`** (10/10) | `preparse-resolution`, `full-parse`, `parse-function`, `interpreter` (**NO `first-execution`!**) |
| `v26.8.2` | `14.6` | `173..174` (**drifts!**) | `173..174` (**drifts!**) | **`0`** (10/10) | **`0`** (10/10) | `preparse-resolution`, `full-parse`, `parse-function`, `interpreter` (**NO `first-execution`!**) |
| `v27-alpha` | `15.6` | `173..175` (**drifts!**) | `175` (10/10) | **`0`** (10/10) | **`0`** (10/10) | `preparse-resolution`, `full-parse`, `parse-function`, `interpreter` (**NO `first-execution`!**) |

**Kill-rule verdict on B9:** V8 13+ (`v24`, `v26`, `v27`) split `first-execution` into tier-specific events (`first-execution`, `first-execution-BASELINE`, `first-execution-BUILTIN`, `first-execution-MAGLEV`), **stopped emitting `function,first-execution` for cold once-called user ESM functions**, and drifts in total count on `v26.8.2` (`173..174`) and `v27-alpha` (`173..175`). `first-execution` fails both signal and repeatability on Node 24/26/27 and is **recommended to DROP** (`Q-IA-FNEV`).

### 2.4 Real-Code Rung `C3` (`D-realcode.log`, load1 2.93, 8 `@zakkster/*` Packages)

Frozen expectations written BEFORE first run: `.handoff/evidence/import-audit/D-realcode-expect.tsv` (sha256 `1d762f0191dc01f1b78e7cbcc1fd36c4f84c4bc1d7a35acf3dd347d87278c7dc`).
All 8 packages declare `"sideEffects": false` in `package.json`, read read-only via `git -C /Users/zakkster/Work/Portfolio/LiteLibrariesSuite/<Pkg> show <sha>:<file>` into a private `mktemp -d`. For `LiteUndo` (`peerDependencies: @zakkster/lite-signal`), `LiteSignal` (`683e2786`) was staged read-only into scratch `node_modules/@zakkster/lite-signal/`, also exercising a real multi-package transitive import.

| Package | Git sha8 | Entry (`file_sha8`) | Untouched `v26.8.2` (young GC) | Untouched `v22.23.5` (young GC) | Injected fault (separate premise rc=0) | Audited injected (`v26.8.2` & `v22.23.5`) |
| --- | --- | --- | --- | --- | --- | --- |
| `LiteSignal` | `683e2786` | `Signal.js` (`29ce87f7`) | `CLEAN` (`1,1`) | `CLEAN` (`2,2`) | `global_add` | `DIRTY` `G added __ia_inj_LiteSignal x1` |
| `LiteArena` | `4c7777df` | `Arena.js` (`0c9eaea6`) | `CLEAN` (`0,0`) | `CLEAN` (`0,1`) | `proto_replace` | `DIRTY` `G proto Array.map [changed] x1` |
| `LiteFastBit32` | `bdb8562a` | `FastBit32.js` (`3bbc2dd4`) | `CLEAN` (`0,0`) | `CLEAN` (`0,0`) | `open_timer` | `DIRTY` `H Timeout x1` |
| `LiteLogLogN` | `4839b33b` | `LogLogN.js` (`c435f38c`) | `CLEAN` (`0,0`) | `CLEAN` (`0,0`) | `global_add` | `DIRTY` `G added __ia_inj_LiteLogLogN x1` |
| `LiteYggdrasil` | `97a544c5` | `Yggdrasil.js` (`e0618227`) | `CLEAN` (`0,0`) | `CLEAN` (`0,0`) | `proto_symbol` | `DIRTY` `G proto Array.Symbol(ia.inj.LiteYggdrasil) [added] x1` |
| `LiteBinaryReader` | `d24fe0cb` | `Reader.js` (`57544fd1`) | `CLEAN` (`0,0`) | `CLEAN` (`0,0`) | `open_timer` | `DIRTY` `H Timeout x1` |
| `LiteStatsMath` | `23cddb41` | `StatsMath.js` (`f587a2cc`) | `CLEAN` (`0,0`) | `CLEAN` (`0,0`) | `global_accessor` | `DIRTY` `G changed crypto x1` |
| `LiteUndo` | `fd91ff50` | `Undo.js` (`196921fe`) | `CLEAN` (`1,1`) | `CLEAN` (`2,2`) | `proto_replace` | `DIRTY` `G proto Map.get [changed] x1` |

Result: **8/8 PASS on `v26.8.2`** and **8/8 PASS on `v22.23.5`** (0 unexpected DIRTY on real packages, 16/16 passing premise pre-runs, 16/16 exact injected catches).

---

## 3. Architecture, Reuse Map, Alternatives, Mutants, and C4 Mocks Inventory

### 3.1 Exit Table
| Exit | Verdict | Meaning |
| --- | --- | --- |
| `0` | `CLEAN` | Non-empty baseline (`globals >= 10 && protos >= 50`), `R ok`, exact markers, 0 deterministic findings (`G`/`H`/`P`), identical across all `--runs` (2..20) |
| `1` | `DIRTY` | `>= 1` deterministic finding (`G added/changed/deleted`, `G proto`, `H`, `P`), identical multiset across all `--runs` |
| `2` | `NO-VERDICT` | CLI/flag/`--out` refusal, driver throw/non-zero exit (incl. exit 13 unsettled TLA), timeout (`timed out after Ns`), missing/malformed markers or fd-3 baseline/`R ok`/unknown record, or null-control drift across runs |

### 3.2 Verified `lib/*.sh` Reuse Map (against live `lib/`, `HEAD 0e39528`)
| Fragment | Lines | Reuse in `src/import-audit.sh` | Notes |
| --- | --- | --- | --- |
| `lib/prologue.sh` | 46 | `# @include` (or extend `_sig` with `SIG_PGID` kill) | Current `lib/prologue.sh` kills `$SIG_PID $(jobs -pr)`; process-group kill (`kill -KILL -- -$SIG_PGID`) can be added locally via trap or extended if ruled |
| `lib/common.sh` | 157 | `# @include` verbatim (`die`, `say`, `sha8`, `multiset`, `nl_refuse`, `nl_dir`, `rep_refuse`) | **Verified:** `lib/common.sh` has **NO** env-strip helper today; all shipped tools (`src/ic-diff.sh:154`, `src/allocation-diff.sh:158`, `src/shape-diff.sh`) use top-level `unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS` (`Q-ENV`) -> see `Q-IA-ENVLIB` |
| `lib/args.sh` | 7 | `# @include` verbatim (`need`) | Exact match |
| `lib/v8flags.sh` | 54 | `# @include` verbatim (`V8FL_AWK`, `V8FL_RE`, `v8fl_read`, `v8fl_ok`, `v8fl_check`) | Embedded byte-identical in prototype |
| `lib/nullctl.sh` | 11 | **Not reused** (local single-target `cmp -s`) | `lib/nullctl.sh` hard-codes `for side in before after` -> see `Q-IA-NCTL` (same as `Q-CSD-NCTL`) |
| `lib/modes.sh`, `lib/stage.sh`, `lib/msdiff.sh`, `lib/tracked.sh`, `lib/v8probe.sh`, `lib/v8limits.sh` | 336 | Not used | Single-target import audit has no before/after diff staging or function-name filtering |

### 3.3 Alternatives That Lost
1. **Flag denylist (draft `a29197a9`) vs `lib/v8flags.sh` allowlist:** Lost (`R2-L1-3`). Denylist missed `--log-all`, `--prof`, string V8 flags (`--sparkplug-filter=hot`), and arbitrary node options (`--experimental-vm-modules`).
2. **`Object.getOwnPropertyNames` + `globalThis[k]` value reads (draft) vs `Reflect.ownKeys` + `Object.getOwnPropertyDescriptor`:** Lost (`A1`, `A2`, `A5`). Missed replaced methods, symbol keys, and wrapped getters, AND invoked pre-existing global getters during the audit.
3. **Allowlisting `Symbol(undici.globalDispatcher.*)` vs fixed-point `g0` baseline:** Lost (`B4`). Allowlisting would blind the audit to real `undici` dispatcher mutations; fixed-point `g0` closes Node's `FormData` `SetLazyDataProperty` cleanly in 2 passes with 0 ignored keys.
4. **`--log-function-events` `first-execution` (B9):** Lost (`C-B9-fnevents.log`, `C-followup.log`). Emits 0 user records on Node 24/26/27 (V8 13.6-15.6) and drifts on Node 26/27.
5. **Blind `for..of` / `("get" in d)` inside `audit.mjs`:** Lost (`M26`, `M30`). Modules patching `Array.prototype[Symbol.iterator]`, `Object.prototype.get`, or `Map.prototype.get` corrupt or blind non-hardened drivers (`M26` produced 136 false `G changed` lines!).

### 3.4 Mutant Kill Table (`B-mutants-bash.log` + `B-mutants-js.log`, prototype `9cc77b5a`)

All 31 mutants verified `matches=1` (count-checked single-match) on private copies, **31/31 KILLED (0 survived)**, unmodified revert control verified (`sha_match=yes`, `--self-test` 34/34 ok, JS oracle ok=1):

| ID | Layer | Decision branch mutated | Killer |
| --- | --- | --- | --- |
| `M01` | bash/awk | `TRACE_AWK` protector window guard `st == 1` -> `st >= 0` | `--self-test` `trace: protector and young GC inside window only` |
| `M02` | bash/awk | `TRACE_AWK` missing `end` marker guard | `--self-test` `trace: missing end marker -> M` |
| `M03` | bash/awk | `TRACE_AWK` `end` before `start` guard | `--self-test` `trace: end before start -> M` |
| `M04` | bash/awk | `TRACE_AWK` duplicate `start` guard | `--self-test` `trace: start twice -> M` |
| `M05` | bash/awk | `FD3_CHECK_AWK` `ok != 1` (`R ok`) check | `--self-test` `fd3: missing R ok refused` |
| `M06` | bash/awk | `FD3_CHECK_AWK` non-empty baseline (`g < 10 || p < 50`) | `--self-test` `fd3: empty baseline` + `zero-evidence` |
| `M07` | bash/awk | `FD3_CHECK_AWK` unknown fd-3 record (`bad > 0`) | `--self-test` `fd3: forged / unknown fd-3 record refused` |
| `M08` | bash | `v8fl_ok` string-type flag refusal | `--self-test` `A3 v8fl_ok` |
| `M09` | bash | `v8fl_ok` `V8FL_RE` refusal | `--self-test` `A3 v8fl_ok` |
| `M10` | bash | pre-spawn `V8FL_RE` refusal (`0 spawns`) | `--self-test` `A3: --log-all` + `--prof` (`spawns` 0 -> 2) |
| `M11` | bash | pre-spawn tool-owned flag refusal | `--self-test` `A3: tool-owned --trace-protector-invalidation` + `--min-semi-space-size=4` |
| `M12` | bash | `PROBE_ENV` `-u NODE_REDIRECT_WARNINGS -u NODE` | `--self-test` `A4: all 5 NODE* vars stripped` |
| `M13` | bash | `run_one_audit` `RUN_TIMED_OUT=1` watchdog flag | `--self-test` `A6: hanging run killed by process-group timeout` |
| `M14` | bash | null control `cmp -s "$FIRST" "$TMP_DIR/ms.$k"` | `--self-test` `nullctl: run 3 drift caught` |
| `M15` | bash | `--out` trailing `/` and `/.` strip loop | `--self-test` `C1/SD-neon-5: --out SYMLINK/` + `SYMLINK/.` |
| `M16` | bash | `--out/report.txt` hard-link refusal | `--self-test` `C1: --out/report.txt hard link refused` |
| `M17` | bash | `nl_dir "--out (resolved)" "$OUT"` | `--self-test` `C1/nl_dir: resolved --out newline refused` |
| `M18` | bash | `[[ "$MOD_DIR" != - ]] || MOD_DIR=./-` | `--self-test` `C1/SD-neon-6: module in '-' dir runs cleanly` |
| `M19` | bash | `[[ $SEEN_RUNS -eq 0 ]]` duplicate option guard | `--self-test` `C1: duplicate --runs refused` |
| `M20` | bash | `rep_refuse "$MOD"` input collision check | `--self-test` `C1/rep_refuse` |
| `M21` | bash | `hint()` did-you-mean suggestion | `--self-test` `C1/SD-neon-8: unknown --outt` |
| `M22` | bash | startup `unset ... NODE_REDIRECT_WARNINGS` (protects `v8fl_read`) | `--self-test` `A4: all 5 NODE* vars stripped` |
| `M23` | `DRIVER_JS` | `descEq` data `writable`/`Object.is(value)` -> `return true` | live `A1-replace-array-map` (`rc=1` -> `0 CLEAN`) |
| `M24` | `DRIVER_JS` | `Reflect.ownKeys` -> `Object.getOwnPropertyNames` | live `A2-symbol-array-proto` (`rc=1` -> `0 CLEAN`) |
| `M25` | `DRIVER_JS` | `descEq` accessor `Object.is(get/set)` -> `return true` | live `A5-replace-crypto` (`rc=1` -> `0 CLEAN`) |
| `M26` | `DRIVER_JS` | `_hasOwn(a, "get")` -> `("get" in a)` | live `tamper-primordials` (0 -> 136 false `G changed`) |
| `M27` | `DRIVER_JS` | `pathToFileURL` -> `"file://" +` | live `C1-pct20` (`rc=1` -> `2 NO-VERDICT`) |
| `M28` | `DRIVER_JS` | active-resource `H ` emit suppressed | live `open-timer` (`rc=1` -> `0 CLEAN`) |
| `M29` | `DRIVER_JS` | baseline `B globals=0 protos=0 resources=0` | live `empty` (`rc=0` -> `2 NO-VERDICT`) |
| `M30` | `DRIVER_JS` | bound `_mapGet` -> unguarded `m.get(k)` | live `tamper-primordials` (misses `G proto Map.get [changed]`) |
| `M31` | `DRIVER_JS` | `g0` fixed-point loop disabled (`false`) | live `empty` (`rc=0` -> `1 DIRTY` undici symbols) |

### 3.5 C4 Mocks Inventory for `mocks/import-audit/` (`.handoff/research/mocks/INVENTORY.md` shape)

Tool contract: `import-audit` (exit `0 CLEAN` / `1 DIRTY` / `2 NO-VERDICT`; single target `MODULE`; `--runs 2..20`, `--timeout 1..300`; deterministic verdict + REPORTED young GC). Every `C` case uses a separate premise pre-run (`node premise.mjs`) proving the side effect occurred in plain JS before the audited run.

| id | kind | class | smallest module | expected |
| --- | --- | --- | --- | --- |
| IA-C1 | C | global added | `globalThis.__ia_added = 42;` | DIRTY (`G added __ia_added x1`) |
| IA-C2 | C | global value changed | `globalThis.queueMicrotask = function(){};` | DIRTY (`G changed queueMicrotask x1`) |
| IA-C3 | C | global deleted | `delete globalThis.btoa;` | DIRTY (`G deleted btoa x1`) |
| IA-C4 | C | global accessor replaced (same return value, A5) | redefine `globalThis.crypto` getter returning `orig.get.call(this)` | DIRTY (`G changed crypto x1`, 0 getter calls) |
| IA-C5 | C | global accessor installed (must not invoke, A5) | `Object.defineProperty(globalThis, '__ia_trap', { get(){ throw 1; } })` | DIRTY (`G added __ia_trap x1`, 0 getter calls) |
| IA-C6 | C | watched prototype method replaced (A1) | `Array.prototype.map = function(){};` | DIRTY (`G proto Array.map [changed] x1`) |
| IA-C7 | C | watched prototype symbol key added (A2) | `Array.prototype[Symbol.for('lite.ia.sym')] = 1;` | DIRTY (`G proto Array.Symbol(lite.ia.sym) [added] x1`) |
| IA-C8 | C | watched prototype method deleted | `delete Array.prototype.at;` | DIRTY (`G proto Array.at [deleted] x1`) |
| IA-C9 | C | open ref'd handle (`Timeout` / `Immediate`) | `setInterval(() => {}, 60000);` (also `setImmediate(() => {});`) | DIRTY (`H Timeout x1` / `H Immediate x1`) |
| IA-C10 | C | V8 protector cell invalidated (prototype or constructor `Symbol.species`) | `Array.prototype[Symbol.iterator] = function*(){};` / `Object.defineProperty(Array, Symbol.species, ...)` | DIRTY (`P ArrayIteratorLookupChain x1` / `P ArraySpeciesLookupChain x1`) |
| IA-C11 | C | transitive dependency side effect + CJS dirty entry | `import './dep.mjs'` where dep sets global; `cjs-dirty.cjs` sets global | DIRTY (`G added ... x1`) |
| IA-C12 | C | primordial tamper resistance (`Array[Symbol.iterator]`, `Object.prototype.get`, `Map.prototype.get`) | patches all three at import | DIRTY (all 3 `G proto` records + `P ArrayIteratorLookupChain x1`, 0 false `G changed`) |
| IA-S1 | S | empty ESM module A/A (file, pipe, PTY) | `export const EMPTY_OK = 1;` | CLEAN (non-empty baseline `globals>=10 protos>=50`) |
| IA-S2 | S | clean CJS module | `module.exports = { cjsOk: 1 };` | CLEAN (non-empty baseline) |
| IA-S3 | S | A/A path length (C2) | same `empty.mjs` in short `s/` vs >120-char nested dir | CLEAN (identical baseline counts) |
| IA-S4 | S | tricky path characters (C1) | `empty.mjs` in `sp dir`, `a,b`, `x [1]`, `q'dir`, `q"dir`, `c:dir`, `pct%20dir`, `-` | CLEAN (non-empty baseline) |
| IA-S5 | S | heavy import-time allocation (S-5, B8) | loop allocating 40,000 objects -> young GCs >= 1 | CLEAN (`young GCs` >= 1 REPORTED only) |
| IA-L1 | L | global added then deleted during import | `globalThis.__t = 1; delete globalThis.__t;` | CLEAN (net-state snapshot limit) |
| IA-L2 | L | handle opened then closed before `end` (B6) | `const t = setTimeout(() => {}, 1000); clearTimeout(t);` | CLEAN (documented limit) |
| IA-L3 | L | `.unref()` timer left open (B6) | `setInterval(() => {}, 60000).unref();` | CLEAN today (per `Q-IA-HANDLES`) |
| IA-L4 | L | prototype outside watched set (under 5-proto list; closed if `Q-IA-PROTOS` (a)) | `String.prototype.__ia_x = 1;` | CLEAN under 5-proto; DIRTY under `Q-IA-PROTOS` (a) |
| IA-L5 | L | `process.on` listener / `process.env` write / `Error.stackTraceLimit` / `Error.prepareStackTrace` (B7) | `process.env.IA_LEAK = '1';` etc. | CLEAN today (per `Q-IA-SCOPE`) |
| IA-L6 | L | `new Worker(...)` spawned during import (B7) | `new Worker('setInterval(()=>{},60000)', { eval: true })` | CLEAN today under file stdout (per `Q-IA-SCOPE`) |
| IA-L7 | L | post-window timer callback mutation | `setTimeout(() => { globalThis.__late = 1; }, 0);` | DIRTY via `H Timeout x1` (late global itself is post-window) |
| IA-G1 | G | top-level await hanging with ref'd handle (A6) | `await new Promise(() => { setInterval(() => {}, 60000); });` with `--timeout 1` | NO-VERDICT (`timed out after 1s`) |
| IA-G2 | G | bare unsettled top-level await (no ref'd handle) | `await new Promise(() => {});` | NO-VERDICT (`driver exited 13`) |
| IA-G3 | G | import throws | `throw new Error('ia_err');` | NO-VERDICT (`missing or duplicate R ok`) |
| IA-G4 | G | nondeterministic import (null control) | `if (Math.random() < 0.5) globalThis.__r = 1;` (or stub drift) | NO-VERDICT (`null control: run k differs from run 1`) |
| IA-G5 | G | CLI / flag / `--out` refusals (A3, C1) | `--v8-flags --log-all`, `--prof`, `--inspect`, `--out ""`, `SYMLINK/`, hard-link, `nl_dir`, dup `--runs` | NO-VERDICT (rc 2, 0 spawns for pre-spawn refusals) |
| IA-G6 | G | zero-evidence / forged fd-3 / bad markers | stub emitting `B globals=0` or missing `R ok` or unknown line | NO-VERDICT (rc 2) |
| IA-R1 | R | real-code clean suite (`LiteSignal`, `LiteArena`, `LiteFastBit32`, `LiteLogLogN`, `LiteYggdrasil`, `LiteBinaryReader`, `LiteStatsMath`) | frozen published entry points (`D-realcode.log`) | CLEAN (non-empty baseline) |
| IA-R2 | R | real-code transitive peer-dep (`LiteUndo` -> `@zakkster/lite-signal`) | `Undo.js` with `@zakkster/lite-signal` peer staged | CLEAN (non-empty baseline) |
| IA-R3 | R | real-code injected faults (1 per package, 8 packages) | untouched + 1-line fault + separate premise pre-run | DIRTY (exact injected record) |

---

## 4. Maintainer Rulings (`Q-IA-*`, recommended option first)

**RULED 2026-11-27 (~18:30Z, maintainer, AskUserQuestion sitting in the ia-1.4.0 burst): all 17 ids (a)
Recommended.** Ruling text = the (a) option text; for the amended / new ids that is section 6.5, which supersedes
the same ids below. Quoted answers:
- Q-IA-INTAKE "(a) ia-r2 round (Recommended)"; Q-IA-TRUST "(a) Threat model + hardening (Recommended)";
  Q-IA-SCOPE "(a) 4 snapshots + limits (Recommended)"; Q-IA-HANDLES "(a) Init hook + H Timeout(unref)
  (Recommended)" -- all four as amended in 6.5.
- Q-IA-PROTSTATE "(a) Extensible + proto (Recommended)"; Q-IA-PLIVE "(a) Canary per audit (Recommended)" -- new, 6.5.
- Q-IA-PROTOS "(a) All reachable + 11 hidden (Recommended)"; Q-IA-SPEC "(a) File paths only (Recommended)";
  Q-IA-TRANS "(a) Record-only (Recommended)"; Q-IA-NOISE "(a) Fixed-point g0 (Recommended)" (with the 6.3
  convergence check); Q-IA-PROTKEY "(a) Exact P <CellName> (Recommended)"; Q-IA-WINDOW "(a) Right after import()
  (Recommended)"; Q-IA-ALLOC "(a) --trace-gc REPORTED (Recommended)"; Q-IA-FNEV "(a) Drop it (Recommended)";
  Q-IA-NCTL "(a) Local in the tool (Recommended)"; Q-IA-ENVLIB "(a) Local, as shipped tools (Recommended)";
  Q-IA-NODEFLOOR "(a) Node >= 22 + Linux CI (Recommended)".
- Sitting note: the Q-IA-PROTSTATE question said "premises hold" for all three cases; only the Object.prototype case
  (assert set) has a premise pre-run; the globalThis and Map.prototype rows (attack set) have none (6.4).

The option text below is the pre-assessment text, kept for the record.

- **`Q-IA-INTAKE`:** how to proceed into 1.4.0.
  - **(a) (Recommended)** Run one Ubuntu x64 CI capture of `research/import-audit/probes/run-probes.sh` and `import-audit.prototype.sh --self-test` (closing R7 / C5), run the assessment review on this drop, then adopt the ruled `Q-IA-*` answers into `PROPOSAL-import-audit.md` and brief the planner for 1.4.0. Evidence: 235/235 5-Node probe assertions (`P-probes-*.log`), 16/16 real-code runs (`D-realcode.log`), and 31/31 mutants (`B-mutants-*.log`) are already green on `darwin-arm64`; only Linux x64 is UNCONFIRMED.
  - (b) Go to the planner now; put the Linux x64 capture in G0 TASK 0.
  - (c) Hold 1.4.0 until `Q-IA-SCOPE` and `Q-IA-HANDLES` prototypes are also benchmarked on Linux x64.

- **`Q-IA-PROTOS` (B1):** which built-in prototypes/intrinsics `import-audit` snapshots by default.
  - **(a) (Recommended)** Snapshot ALL intrinsic `.prototype` objects reachable via descriptor-only walk of `globalThis` data-property constructors PLUS the 11 well-known hidden `%...Prototype%` intrinsics (`%TypedArray%`, `%IteratorPrototype%`, `%AsyncIteratorPrototype%`, `%GeneratorFunction%`, `%AsyncGeneratorFunction%`, `%AsyncFunction%`, `%ArrayIterator%`, `%MapIterator%`, `%SetIterator%`, `%StringIterator%`, `%RegExpStringIterator%`). Evidence: `.handoff/evidence/import-audit/C-B1-B8.log` shows 107-116 intrinsics (937-1036 own keys) across all 5 Nodes take only `0.158-0.431 ms` to snapshot and produce **0 empty-import diffs** on all 5 Nodes, while closing blind spots on `String.prototype`, `RegExp.prototype`, `Set.prototype`, `Error.prototype`, and typed arrays.
  - (b) Keep the fixed 5-prototype list (`Array`, `Object`, `Function`, `Promise`, `Map`: 82-84 keys, `0.034-0.172 ms`, `C-B1-B8.log`) and add an opt-in `--watch Name` flag. Evidence: minimal footprint, but silently misses `String.prototype`, `Set.prototype`, `RegExp.prototype`, `Uint8Array.prototype`, and `Error.prototype` by default.
  - (c) Fixed curated list of ~15 core JS prototypes (`Object`, `Array`, `Function`, `Promise`, `Map`, `Set`, `WeakMap`, `WeakSet`, `String`, `Number`, `RegExp`, `Date`, `Error`, `Symbol`, `%TypedArray%`) without walking host/WebAPI constructors. Evidence: avoids Node-version drift in WebAPI global count (`107` on v22 vs `116` on v26/v27), while still covering standard JS builtins; misses WebAPI prototypes (`URL.prototype`, `AbortController.prototype`, etc.).

- **`Q-IA-SPEC` (B2):** what `MODULE` inputs `import-audit` accepts.
  - **(a) (Recommended)** File paths only (`.mjs`, `.js`, `.cjs`) in 1.4.0, resolved once to an absolute path and converted via `pathToFileURL(MOD_ABS).href` inside the driver (accepting `file://` URLs refused exit 2 unless explicitly supported); defer package-specifier / `--conditions` resolution to a later minor. Evidence: `P-probes-*.log` (`B2-cjs-clean`, `B2-cjs-dirty`, `pct%20dir`, `-` dir) and `D-realcode.log` (all 8 `@zakkster/*` packages) prove file-path mode works identically across all 5 Nodes with zero ambiguity around `cwd` or `node_modules` lookup, and cleanly supports `sha256/8` fingerprinting and `rep_refuse` before spawning node.
  - (b) Accept BOTH file paths and bare package specifiers (resolved via `import.meta.resolve(spec)` from a `--from DIR` or `cwd` anchor, plus optional `--conditions`), and normalize `file://` URLs via `fileURLToPath`. Evidence: `C-B1-B8.log` B2 proves `import.meta.resolve` resolves `exports` conditions identically across all 5 Nodes (`v22`..`v27-alpha`), at the cost of requiring a node pre-spawn before `sha8` / `rep_refuse` validation.
  - (c) File paths plus `file://` URLs (converted to path in bash/node), no bare package specifiers.

- **`Q-IA-TRANS` (B3):** transitive dependency side effects and attribution.
  - **(a) (Recommended)** Record-only verdict (no per-module attribution): any side effect caused by a transitive import marks the entry `MODULE` `DIRTY` with the exact `G`/`H`/`P` record. Evidence: `C-B1-B8.log` B3 and `P-probes-*.log` (`B3-transitive-parent`) show `G added __ia_transitive_global x1` cleanly across all 5 Nodes; `D-realcode.log` (`LiteUndo` -> `@zakkster/lite-signal`) proves clean transitive imports read `CLEAN`. Attribution would require Proxy traps or custom ESM loader hooks that alter timing and introduce observer side effects.
  - (b) Add an opt-in `--blame` diagnostic mode using `module.registerHooks` / Proxy traps to identify which dependency wrote the global (REPORTED only, never affects verdict).

- **`Q-IA-NOISE` (B4):** how `import-audit` handles Node's `SetLazyDataProperty` (`FormData` -> `Symbol(undici.globalDispatcher.*)`) during baseline snapshotting.
  - **(a) (Recommended, implemented in prototype `9cc77b5a`)** Iterate `snapDesc(globalThis)` to a fixed point (`<= 4` passes; converges in 2 passes) before `@@LITE-MARK start`, with **zero** symbol allowlist. Evidence: `D-diag-3discoveries.log` proved `Object.getOwnPropertyDescriptor(globalThis, "FormData")` triggers Node's C++ lazy callback and installs `Symbol(undici.globalDispatcher.1/.2)` mid-loop on all 5 Nodes; `C-B1-B8.log` B4 proved the fixed-point baseline yields **15/15 `CLEAN`** across all 5 Nodes x {file, pipe, PTY} with non-empty baselines (`globals=131..144`), and mutant `M31` (`B-mutants-js.log`) proved removing the loop immediately breaks `empty.mjs`.
  - (b) Allowlist `Symbol(undici.globalDispatcher.*)` in the diff filter instead of fixed-point snapshotting. Evidence: fragile across Node/undici versions and would silently hide a module that genuinely calls `setGlobalDispatcher(...)`.
  - (c) Keep `Object.getOwnPropertyNames(globalThis)` (ignore all symbols on `globalThis`). Evidence: misses symbol-keyed global leaks (`globalThis[Symbol.for(...)] = ...`).

- **`Q-IA-PROTKEY` (B5):** how V8 protector cell invalidations are keyed in the verdict.
  - **(a) (Recommended, implemented)** Keep exact `P <CellName>` lines in the deterministic verdict multiset alongside prototype snapshots. Evidence: `C-B1-B8.log` B5 and `C-followup.log` B5F proved all 10 firing V8 protector names (`ArrayIteratorLookupChain`, `PromiseThenLookupChain`, `ArraySpeciesLookupChain`, `NoElements`, `RegExpSpeciesLookupChain`, `PromiseSpeciesLookupChain`, `SetIteratorLookupChain`, `StringIteratorLookupChain`, `StringWrapperToPrimitive`, `IsConcatSpreadableLookupChain`) are 100% identical across all 5 Nodes (`V8 12.4` through `15.6`), and `--trace-protector-invalidation` catches constructor `Symbol.species` mutations missed by prototype-only snapshots. Document in `-h`/README that protector names are V8-owned strings (so cross-major comparisons should key on verdict CLEAN/DIRTY, not exact protector name string).
  - (b) Normalize every `Invalidating protector cell <Name>` to a single version-free token `P <protector>` (verdict keys on "any protector flipped", exact name printed as REPORTED diagnostic). Evidence: insulates `mocks/` and cross-major fixtures if V8 ever renames a cell in V8 16+, at the cost of collapsing two distinct protector invalidations into one count.
  - (c) Drop `--trace-protector-invalidation` and rely purely on JS intrinsic + constructor snapshots. Evidence: loses V8-level verification of internal fast-path assumptions (`NoElements`, species chains).

- **`Q-IA-WINDOW` (B6 window end):** when the audit takes the post-import snapshot.
  - **(a) (Recommended, implemented)** Immediately after `await import(modUrl)` resolves (`immediate_end`), before any timer/I/O turn. Evidence: `C-B1-B8.log` B6 proved `queueMicrotask` and `Promise.resolve().then` mutations are **already drained and caught** at `immediate_end` (because `await import()` resolves on the microtask queue), `setImmediate` is caught as `H Immediate x1`, and `setTimeout(..., 0)` is caught as `H Timeout x1`. Waiting for `setImmediate` would execute user callbacks (introducing nondeterminism or hangs) and hide `H Immediate` behind callback side effects.
  - (b) Wait one `setImmediate` turn after `await import(modUrl)` before taking `g1`/`p1`/`r1`. Evidence: catches a `setImmediate` callback that mutates a global (`C-B1-B8.log` `B6_CMP`), but lets async callbacks run and can hang or turn deterministic handle findings into flaky timing findings.

- **`Q-IA-HANDLES` (B6 `.unref()` handles):** how open handles are detected.
  - **(a) (Recommended)** Use `process.getActiveResourcesInfo()` multiset diff (public Node API, zero runtime overhead, catches all ref'd `Timeout`, `Immediate`, `TCPSocketWrap`, etc.), and explicitly document `.unref()` timers and closed-before-end handles as known limits. Evidence: `D-diag-3discoveries.log` and `C-B1-B8.log` `B6_UNREF_API` proved on all 5 Nodes that BOTH `process.getActiveResourcesInfo()` and `process._getActiveHandles()` omit `.unref()` timers (`delta=0`), while `async_hooks.createHook` catches `.unref()` timers ONLY at the cost of false-positiving on synchronously closed handles (`clearTimeout(t)` still appears live in `async_hooks` because `destroy` is deferred!).
  - (b) Add `async_hooks.createHook({ init, destroy })` filtered to unref'd timers (or tracking `clearTimeout`/`clearInterval` wrappers) to catch `.unref()` timers too. Evidence: catches `unref-timer.mjs`, but requires monkey-patching `clearTimeout`/`clearInterval` or tolerating false DIRTY on closed-before-end timers (`D-diag-3discoveries.log`), and `async_hooks` degrades V8 promise/async performance.
  - (c) Report `async_hooks` `init` counts as REPORTED-only alongside the gated `getActiveResourcesInfo()` verdict.

- **`Q-IA-SCOPE` (B7):** whether to expand deterministic scope beyond `globalThis` + prototypes + active resources + protectors.
  - **(a) (Recommended)** Add three zero-cost, zero-noise deterministic checks in 1.4.0: (1) `process.env` own-key/value diff (`E added/changed/deleted <K>`), (2) `process.eventNames()` + `process.rawListeners(ev)` identity diff (`L process.<ev>`), and (3) `Error` constructor own-property descriptors (`Error.stackTraceLimit`, `Error.prepareStackTrace`, plus `Symbol.species` on core constructors if not already covered by protectors); keep `new Worker(...)` detection as a known limit unless a clean cross-stdio detector is proven (or track `Worker` via `async_hooks` `WORKER` / `MessagePort` if opted in). Evidence: `C-B1-B8.log` B7 showed all 6 non-accessor B7 probes (`process.on`, `process.env`, `Error.stackTraceLimit`, `Error.prepareStackTrace`, `Worker`) read false `CLEAN` today; the first three are pure synchronous snapshots with zero observer side effects.
  - (b) Keep 1.4.0 strictly at the current 4-channel scope (`globalThis`, watched prototypes, `getActiveResourcesInfo`, V8 protectors) and document `process.on`, `process.env`, `Error.*`, and `Worker` as known limits in `-h` / README. Evidence: smallest possible surface; already passes 8/8 real packages and 235/235 5-Node probe checks.
  - (c) Also hook `node:worker_threads` / `async_hooks` to refuse (`NO-VERDICT`) or flag `DIRTY` whenever an import constructs a `Worker` (even when stdout is a file). Evidence: `C-B1-B8.log` B7 + `C-followup.log` B7W showed `new Worker(...)` read `CLEAN` under file-redirected stdout (`import-audit`) while producing `[PipeWrap,PipeWrap]` under piped stdout.

- **`Q-IA-ALLOC` (B8):** import-time allocation reporting.
  - **(a) (Recommended, implemented)** Keep `--trace-gc --min-semi-space-size=1 --max-semi-space-size=1` (same source as `allocation-diff`) and print young GCs per run as **REPORTED only (S-5)**, excluded from null-control comparison and never altering `CLEAN`/`DIRTY`. Evidence: `C-B1-B8.log` B8 (`alloc-import.mjs`: `1,1` on v22, `3,3` on v24/v26/v27, all `CLEAN`) and `D-realcode.log` (`LiteArena` on `v22.23.5`: `0,1` young GCs across two identical runs, stayed `CLEAN`).
  - (b) Drop `--trace-gc` and the 1 MB semi-space flags completely so `import-audit` runs with default V8 heap sizing. Evidence: removes a reported signal users expect for spotting import-time allocation bursts, though saves `--trace-gc` stdout parsing.
  - (c) Make `--trace-gc` opt-in via `--report-alloc`.

- **`Q-IA-FNEV` (B9):** `--log-function-events` `first-execution` tracking.
  - **(a) (Recommended)** **DROP** `--log-function-events` `first-execution` completely for 1.4.0. Evidence: `C-B9-fnevents.log` and `C-followup.log` proved V8 13+ (`v24.22.3`, `v26.8.2`, `v27-alpha`) emits **0** `function,first-execution` records for cold once-called user ESM functions (`__ia_mark_start`, `extraImportCall`, `__ia_mark_end`) and drifts in total `first-execution` count across 10 identical A/A runs (`173..174` on `v26.8.2`, `173..175` on `v27-alpha`).
  - (b) Defer a separate opt-in diagnostic tracking `function,interpreter` (which did fire on `extraImportCall` across v22/v24/v26/v27 in `C-followup.log`) to a later minor, gated on proving K=10 repeatability and private `--logfile` isolation.

- **`Q-IA-NCTL`:** single-target null control placement.
  - **(a) (Recommended, implemented)** Keep the 5-line single-target `cmp -s "$FIRST" "$TMP_DIR/ms.$k"` null control local in `src/import-audit.sh` (0 changes to `lib/nullctl.sh`, preserving 1.0.0 root shas / S-11). Evidence: verified `lib/nullctl.sh` (11 lines) hard-codes `for side in before after`, identical to `Q-CSD-NCTL` (a).
  - (b) Generalize `lib/nullctl.sh` to accept a side list (alters 1.0.0 shipped root shas).

- **`Q-IA-ENVLIB` (A4):** env-strip placement.
  - **(a) (Recommended, implemented)** Keep top-level `unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS` plus per-spawn `PROBE_ENV=(env -u ... -u NODE)` local in `src/import-audit.sh`, matching `src/ic-diff.sh:154` / `src/allocation-diff.sh:158` (`Q-ENV`), with 0 changes to `lib/common.sh` (preserves 1.0.0 root shas). Evidence: verified `lib/common.sh` currently defines no env-strip helper; mutant `M12` + `M22` (`B-mutants-bash.log`) prove both the startup `unset` (protecting `v8fl_read`) and `PROBE_ENV` are covered.
  - (b) Extract an env-strip helper into `lib/common.sh` and rebuild all shipped tools (moves 1.0.0 root shas; S-11 drift).

- **`Q-IA-NODEFLOOR` (C5):** supported Node version floor for `import-audit` 1.4.0.
  - **(a) (Recommended)** Node `>= 22` (`v22`, `v24`, `v26`, and observed clean on `v27-alpha`) with Linux x64 CI capture required before shipping 1.4.0. Evidence: 47/47 probe checks PASS on all 5 local Nodes (`P-probes-*.log`), 15/15 B4 A/A PASS (`C-B1-B8.log`), 8/8 real-code packages PASS on both `v26.8.2` and `v22.23.5` (`D-realcode.log`). Linux x64 is UNCONFIRMED today.
  - (b) Node `>= 24` only (matches `B9` / newer V8); unnecessary because `v22.23.5` passed 100% of probes and real-code checks once B9 is dropped.

---

## 5. Open / PENDING

- **R7 Linux x64 CI capture (UNCONFIRMED):** run `research/import-audit/import-audit.prototype.sh --self-test` and `research/import-audit/probes/run-probes.sh` on Ubuntu x64 (bash 5, mawk/gawk, uutils) before freezing the 1.4.0 PROPOSAL.
- **`Q-IA-SCOPE` follow-up (if (a) or (c) is ruled):** verify `process.env`, `process.on`, `Error.*`, and `Worker` (under file-redirected stdout!) across all 5 Nodes with zero empty-import noise and mutant kills before planning.
- **`Q-IA-PROTOS` follow-up (if (a) is ruled):** wire the 107-116 intrinsic descriptor walk into `src/import-audit.sh` and verify primordial tamper resistance across all 116 prototypes on all 5 Nodes + real code.
- **No non-ASCII probe module needed yet:** if a non-ASCII global/path probe is added later, place it under `research/import-audit/probes/nonascii/` and list it explicitly.

---

## 6. Assessment review changes (ia-1.4.0, 2026-11-27; binding over sections 0-5)

Session: ia-1.4.0 research burst (orchestrator claude-opus-5-5, started by the main session). Reviewer: one Opus
`reviewer` (claude-opus-5-5, different model from the drop's author), read-only on a base / head overlay
(base = HEAD 0e39528, head = + this drop at prototype `9cc77b5a`). Hand-back saved to
`.handoff/evidence/import-audit/REVIEW-U2-ia.md`; attack modules, mutants and batch scripts in
`.handoff/evidence/import-audit/u2-review/`.

### 6.1 Unit verdicts
- U1 evidence check: PASS. 25/25 shas = hand-back; ASCII clean (perl scan, must-hit control caught); `bash -n` ok;
  `--self-test` re-run 34/34, rows identical to `B-selftest.log` (0 real node spawns); `D-realcode-expect.tsv`
  `1d762f01` frozen 09:27Z, before its log (09:44:46Z); CASES-SHA rev 1 09:22:46Z, rev 2 09:37:40Z with raw reasons
  in `D-diag-3discoveries.log` D2 / D3.
- U2 review: REJECTED (DESIGN) -- 4 DESIGN blockers (B1 forgeable record channel, B5 false HANDLES premise, B6 no
  protector-channel liveness, B7 scope gaps) + 3 LITERAL (B2 stdin, B3 surviving mutants, B4 NUL key). Unit stopped
  without a coder round.
- U3 assert: 12 new cases + 10 broken twins in `probes/assert/` (premises plain JS first; protector premises
  require the `Invalidating protector cell <Name>` trace line), expectations frozen 18:10:50Z before any run.
- U4 run: assert set and the 17-row reviewer-attack set `probes/attacks/` (frozen in `ATTACK-SHA.txt` before
  its run) on 5 nodes (6.4).
- U5 recheck: NOT RUN -- U2 ended in a DESIGN REJECT; the recheck belongs to the next prototype round.

### 6.2 Review changes to sections 0-5 (what the drop says that does not hold)
1. "Immune" to tampering (section 0) is overstated: binswap.mjs (fs.writeSync swap + `syncBuiltinESMExports()`)
   and exitrw.mjs ('exit' listener truncates fd 3 / fd 1 and writes a clean `B`, `R ok` and both markers) read
   CLEAN on v26.8.2; correct verdict DIRTY (B1). Bound primordials do resist Map / Reflect / iterator patches.
2. The B4 file / pipe / PTY A/A run through the tool is zero-evidence: the child's stdout and stderr are always
   files (prototype :399), so those rows could not differ. The real caller-dependent channel is stdin: stdin.mjs
   (`void process.stdin`) reads CLEAN with `</dev/null` and `<file`, DIRTY `H PipeWrap x1` with a piped stdin (B2).
3. Finding 6 (Worker verdict flips with stdout type) does not hold for the tool: worker cases read CLEAN with stdout
   to a file, a pipe and a PTY on all 5 nodes (U4 below). The B7W `[PipeWrap,PipeWrap]` came from a standalone
   probe's own `$(...)` pipe. A Worker left running is a scope gap, not a two-verdict bug.
4. Q-IA-HANDLES option (b) rests on a false premise: an init hook that keeps Timeout resources and checks
   `!res._destroyed` and `res.hasRef()` at window end excludes a cleared timer and catches an unref'd interval
   (unrefprobe.mjs: `init=3 live=2 liveUnref=1 liveRef=1` on v26.8.2 and v22.23.5). The drop also reverses the
   draft's "unref is DIRTY by design" without saying so (B5).
5. Mutant table 3.4: its 31 mutants die for real, but 4 of 6 independent reviewer mutants survive both
   `--self-test` and run-probes: MB2 (`--runs 1` accepted), MB3 (duplicate `R ok`), MJ1 (attribute check removed),
   MJ2 (Function / Promise dropped from PROTOS). The "attribute edits" and Function / Promise claims had no row (B3).
6. The protector channel has no liveness check: a V8 wording change makes every run report 0 protectors and read
   CLEAN; the probe premises check only the JS effect, never the cell (B6).
7. Scope list (-h "Not detected", Q-IA-SCOPE) omits classes observed CLEAN: unhandled rejection at import (a plain
   importer dies rc 1), node:fs export patch, `process.exitCode = 7`, an 'exit' listener; plus (U4)
   `Object.preventExtensions(Object.prototype)` and a running Worker (B7).
8. Record channel not binary-safe: a NUL in a global key makes BSD grep print "Binary file ... matches"
   (NO-VERDICT "null control: run 2 differs"); with GNU grep >= 3.5 the predicted result is CLEAN (UNVERIFIED, no
   GNU grep on this host) (B4).
9. Freeze disclosure: rev 2 also changed `run-probes.sh` (`e822d63c` -> `02a6720d`), `check-premises.mjs`
   (`c795b1e7` -> `98c32efc`) and `hang-tla.mjs` (`c38b8230` -> `86849b4d`); rev-1 matrix outputs were not kept (all
   `P-probes-*.log` are 09:39-09:40Z); the prototype sha was not pinned before the teeth / mutant runs (last mtime
   09:37:39Z, runs 09:37:43Z).
10. run-probes.sh: :173 / :176 accept any `"  P "` line (loose matcher); :187 token `__ia_getter_was_invoked` can
    never be printed (the getter's throw is the real check); :17 hard-codes `/opt/homebrew/bin/node`.

### 6.3 LITERAL fixes for the next prototype round (exact, from REVIEW-U2-ia.md)
- B2: prototype :399 `<&0` -> `</dev/null`; a run-probes row running stdin.mjs with stdin from a pipe and from
  /dev/null asserting equal verdicts; reword section 2.3 B4 and Q-IA-SCOPE (c).
- B3: self-test rows `--runs 1` and `--runs 21` refused (rc 2, 0 spawns, "--runs must be 2..20"); self-test row with
  `R ok` twice expecting `ERR missing or duplicate R ok (2)`; probe attr-global.mjs + premise + row
  `G changed btoa x1`; rows `G proto Function.__ia_fn [added] x1` and `G proto Promise.finally [changed] x1`;
  run-probes :173 / :176 require `"  P ArrayIteratorLookupChain x1"`.
- B4: DRIVER_JS after :208 `s = _strReplace(s, /\0/g, "\\0");`; :892 `grep -a -E '^(G |H )'`; a nul-key row.
- Non-blocking: g0 loop :236 -- if the key count still differs after 4 passes, `_processExit(3)` (NO-VERDICT);
  watchdog `sleep` :405-413 killed with its run; run-probes :187 token removed, :17 node from an argument.

### 6.4 U3 / U4 results (untimed verdict rows; REPORTED)
Assert set `probes/assert/run-assert.sh` (expectations `0d02df37`), prototype `9cc77b5a`, 2026-11-27T18:11Z-18:2xZ,
load1 1.60, provenance tagged UNLOCKED (ran with the lock FREE but not held; flagged by the main session).
5 nodes (v22.23.5, v24.22.3, v26.3.1, v26.8.2, v27.0.0-alpha.0.1.0) x 14 rows: 10 PASS / 4 MISMATCH on every node,
verdicts identical on all 5; premise failures 0 (all 10 positive premises hold, all 9 broken twins fail theirs);
the built-in CONTROL row mismatched as required. Logs `.handoff/evidence/import-audit/U4-assert-<node>.log`.
- PASS: freeze-array-proto (DIRTY via per-key `[changed]` records), setproto-array-proto (DIRTY via
  `P NoElements x1` only -- no G record), same-value-new-attrs, species-protector, promise-then-patch,
  no-elements-protector, lazy-globals-touch (CLEAN), add-then-remove (CLEAN), symbol-tostringtag-global,
  concat-spreadable-protector.
- MISMATCH (missed effects, correct verdict DIRTY): prevent-ext-object-proto CLEAN (WV-1); worker-handles CLEAN under
  stdout file / pipe / PTY (WV-2).

Attack set `probes/attacks/run-attacks.sh` (expectations `89a065e1`, 15 modules: 11 from the U2 reviewer + 4
orchestrator follow-ups), prototype `9cc77b5a`, 2026-11-27T18:25:55Z, under `quiet-lock.mjs run`, host QUIET
(load1 1.37 per the lock; the log's own load1 field is empty: `sysctl` is outside the runner's PATH). 5 nodes x 17
rows: 7 PASS / 10 MISMATCH on every node, verdicts identical on all 5; built-in CONTROL row mismatched as required.
No premise pre-run in this set (the effects are plain calls that throw on failure). Logs
`.handoff/evidence/import-audit/U4-attacks-<node>.log`.
- PASS: stdin `</dev/null` and `<file` CLEAN; attr `G changed btoa x1`; lazy1, lazy2 CLEAN; fn-proto-add
  `G proto Function.__ia_fn [added] x1`; promise-finally `G proto Promise.finally [changed] x1` (the MJ2 rows the
  drop lacked read correctly on the real tool).
- MISMATCH: binswap CLEAN and exitrw CLEAN (B1, now 5 / 5 nodes); stdin piped DIRTY `H PipeWrap x1` (B2, 5 / 5);
  nulkey NO-VERDICT on BSD grep (B4: fails closed here, GNU grep unverified); fspatch, unhandled, setexit, exitcode
  CLEAN (B7, 5 / 5); setproto-map-proto CLEAN and prevent-ext-globalthis CLEAN (WV-1 widened: no protector fallback
  for a non-Array prototype).

### 6.5 Amended and new Q-ids (full option text, recommended first; supersede the same ids in section 4)

- **`Q-IA-INTAKE` (amended):** how to proceed into 1.4.0.
  - **(a) (Recommended)** One more research round "ia-r2" in its own burst: a coder on this drop applies the 6.3
    LITERAL fixes and the ruled DESIGN items, adds rows for every U2 attack, U3 assert case and U4 attack (missed
    effects expected as ruled), re-runs everything on 5 nodes under the lock; one Opus recheck ->
    `.handoff/research/post-1.0/RECHECK-import-audit.md` (ADOPT needed); then the Linux x64 capture; then
    `PROPOSAL-import-audit.md` and the planner. Evidence: U2 REJECTED (DESIGN) with 3 LITERAL blockers; U4 two
    missed-effect classes on 5 / 5 nodes.
  - (b) Write the PROPOSAL now from the rulings and fold the LITERAL fixes and the recheck into the 1.4.0 planner's
    G0. Evidence: the core channels (globals, prototype keys, protectors) passed 10 / 12 assert cases on 5 nodes.
  - (c) Park import-audit until 1.2.1 / 1.3.0 ship, then rerun the round.

- **`Q-IA-TRUST` (new, B1):** what the audit promises about a hostile module.
  - **(a) (Recommended)** State the threat model: accidental side effects only; a hostile in-process module can
    always forge its own audit. Add the cheap hardening: capture `const _writeSync = writeSync` and
    `const _reallyExit = process.reallyExit` before `import()`, exit through `_reallyExit(0)`; make fd 3 and fd 1
    pipes read by the bash side (no in-place truncate / overwrite); FD3_CHECK_AWK refuses any line after `R ok`;
    binswap and exitrw become rows that must read DIRTY. Evidence: both attacks read CLEAN on v26.8.2 (U2).
  - (b) Authenticated channel: the driver reads a nonce from a private pipe fd and closes it before import;
    `R ok <nonce>` and the markers carry it; fstat-identity check on fd 3; plus everything in (a). Evidence: closes
    exitrw-style rewrites; a Worker or detached grandchild racing the exit can still defeat it.
  - (c) Observe from outside the process (inspector over a private channel). A redesign.

- **`Q-IA-PLIVE` (new, B6):** proving the protector channel still measures.
  - **(a) (Recommended)** One canary spawn per audit (same node and flags) of a module that sets
    `Array[Symbol.species]`; require `P ArraySpeciesLookupChain`, else NO-VERDICT. Evidence: TRACE_AWK :337 has no
    liveness check; species-protector reads `P ArraySpeciesLookupChain x1` on 5 / 5 nodes (U4).
  - (b) Keep the per-node probe row only; document that the protector clause is verified only on probed nodes.
  - (c) Drop P records from the verdict.

- **`Q-IA-PROTSTATE` (new, U4 WV-1):** object-level state of globalThis and the snapshotted prototypes.
  - **(a) (Recommended)** Also record `Object.isExtensible` and the `Object.getPrototypeOf` identity (bound
    primordials) of globalThis and every snapshotted prototype in g0 / g1; a difference emits
    `G proto <Name> [extensible]` / `G proto <Name> [prototype]` (`G extensible` / `G prototype` for globalThis).
    Evidence: prevent-ext-object-proto CLEAN on 5 / 5 nodes with its premise holding; setproto-array-proto DIRTY only
    through `P NoElements`; freeze-array-proto caught only through per-key attribute records.
  - (b) Document extensibility and `[[Prototype]]` edits as known limits.

- **`Q-IA-HANDLES` (rewritten, B5):** open-handle detection.
  - **(a) (Recommended)** An async_hooks init hook enabled only around `import()`; at window end keep Timeout
    resources with `!res._destroyed`; report live unref'd ones as `H Timeout(unref)` next to the
    `getActiveResourcesInfo()` multiset. Cost: `_destroyed` is an internal field, so it needs proving on 5 nodes
    plus mutants. Evidence: unrefprobe.mjs `init=3 live=2 liveUnref=1 liveRef=1` on v26.8.2 and v22.23.5 (cleared
    timer excluded).
  - (b) `getActiveResourcesInfo()` only, and state explicitly that the draft's "unref is DIRTY" design is dropped.
    Evidence: D2 unref `res=[]` on 5 / 5 nodes.
  - (c) Report the unref count as REPORTED only.

- **`Q-IA-SCOPE` (amended, B7 + U4 WV-2):** deterministic scope beyond globals, prototypes, resources, protectors.
  - **(a) (Recommended)** 1.4.0 adds zero-observer snapshots of `process.env` (own keys / values), process listeners
    (`eventNames()` + `rawListeners()` identity), `Error` constructor own descriptors, and builtin-module export
    descriptors (node:fs, node:module, ... with the same snapDesc); unhandled rejections at import,
    `process.exitCode` and a Worker left running are documented limits. Evidence: section 2.3 B7 (6 probes CLEAN);
    U2 fspatch / unhandled / setexit / exitcode CLEAN on v26.8.2 and v22.23.5; U4 worker-handles CLEAN on 5 nodes x
    3 stdout modes.
  - (b) (a) plus DIRTY records for a `process.exitCode` change and for a Worker alive at window end (to be proven
    in ia-r2, else NO-VERDICT). Evidence: same rows; detection of a live Worker is not yet shown on any node.
  - (c) Keep the 4-channel scope and document every class above as a limit.

Unchanged (section 4 text stands): `Q-IA-PROTOS`, `Q-IA-SPEC`, `Q-IA-TRANS`, `Q-IA-NOISE` (its (a) gains the 6.3
convergence check), `Q-IA-PROTKEY`, `Q-IA-WINDOW`, `Q-IA-ALLOC`, `Q-IA-FNEV`, `Q-IA-NCTL`, `Q-IA-ENVLIB` (A4
deviation verified true by U2: `lib/common.sh` has no env strip; the v8flags block equals `lib/v8flags.sh` except
comments), `Q-IA-NODEFLOOR`.

### 6.6 Open after this assessment
- GNU grep behaviour for B4 (Linux CI) unverified; the U2 unrefprobe was run on v26.8.2 and v22.23.5 only.
- U5 recheck (no ADOPT verdict exists yet): belongs to ia-r2 per Q-IA-INTAKE (a).
