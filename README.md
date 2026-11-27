# @zakkster/lite-utils

> Seven standalone CLIs for V8 diagnostics: six bash tools that compare two JS builds through V8's own traces --
> bytecode length, deopts, inline caches, inlining decisions, young-GC counts, object shapes -- and one node tool that measures
> steady-state on-heap bytes per op. Every verdict fails closed.

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-utils.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-utils)
[![sponsor](https://img.shields.io/badge/sponsor-PeshoVurtoleta-ea4aaa.svg?logo=github)](https://github.com/sponsors/PeshoVurtoleta)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@zakkster/lite-utils?style=for-the-badge)](https://bundlephobia.com/result?p=@zakkster/lite-utils)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-utils?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-utils)
[![npm total downloads](https://img.shields.io/npm/dt/@zakkster/lite-utils?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-utils)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

## The V8 diff kit the ecosystem was missing

You changed a hot function. Did its bytecode grow? Did it start to deopt? Did an inline cache go megamorphic? Did
TurboFan stop inlining a callee? Did it start to trigger young-generation GCs? Did an object's shape or elements kind start to change? Each of these is a question V8 will
answer in its own trace output, but reading two traces by eye does not scale and a flaky comparison is worse than none.

`lite-utils` is seven self-contained command-line tools, one per question: six bash scripts and one node script
(`alloc-per-op`, described in its own section). Each bash tool runs your driver file on ONE node binary, under V8 trace
flags, reduces the trace to a normalized multiset, compares it between two builds, and ends with a `VERDICT` line and
an exit code. Anything it cannot establish is `NO-VERDICT` (exit 2), never a guess.

Install (version 1.1.2), three ways:

```bash
# 1. from the npm registry
npm i -D @zakkster/lite-utils

# 2. straight from the git repository (an instruction; it works once the repository is public)
npm i -D git+https://github.com/PeshoVurtoleta/lite-utils.git

# 3. copy one root script into your project and run it with bash (a root never sources anything at run time)
cp node_modules/@zakkster/lite-utils/bytecode-budget.sh tools/ && bash tools/bytecode-budget.sh -h
```

After an npm install the seven commands are `allocation-diff`, `alloc-per-op`, `bytecode-budget`, `deopt-diff`, `ic-diff`,
`inlining-budget-diff` and `shape-diff`, run as `./node_modules/.bin/<name>` or `npx <name>`.

Quick-start: report the bytecode length of one function. Save this as `driver.mjs`:

```js
function add(a, b) { return a + b; }
let s = 0;
for (let i = 0; i < 1000; i++) s = add(s, i);
```

```bash
./node_modules/.bin/bytecode-budget --fn add driver.mjs
```

Output (one run of the root script on node v26.8.2, bash 3.2.57, macOS arm64, 2026-11-12; the paths are that
host's, and the byte count is a node v26.8.2 value, not a constant):

```text
bytecode-budget  node v26.8.2  /opt/homebrew/bin/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)
driver  /tmp/b76p6-coder.ALDGJ6/qs/driver.mjs
mode    report  runs 2  v8 flags --no-flush-bytecode --print-bytecode --print-bytecode-filter=<fn>
limits  TurboFan small<=30 (<=75 if a HeapNumber may cross) single<=460 | Maglev eager (greedy small)<30 small<=27 single<100

  add: 1 match(es): 6
    6 bytes: within every limit
  add: REPORTED -- 1 match(es), not gated

VERDICT REPORTED
```

Report mode ends `VERDICT REPORTED` (exit 0) when it could read the length, `VERDICT NO-VERDICT` (exit 2) otherwise.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [bytecode-budget](#bytecode-budget)
- [deopt-diff](#deopt-diff)
- [ic-diff](#ic-diff)
- [inlining-budget-diff](#inlining-budget-diff)
- [allocation-diff](#allocation-diff)
- [shape-diff](#shape-diff)
- [alloc-per-op](#alloc-per-op)
- [CLI reference](#cli-reference)
- [Composability](#composability)
- [Design notes](#design-notes)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Testing](#testing)
- [Known limits](#known-limits)
- [What this is not](#what-this-is-not)
- [Ecosystem](#ecosystem)
- [License](#license)

---

## Why this exists

A performance regression in a hot function rarely shows up as a failing test. It shows up as a function that got a few
bytes of bytecode longer and fell out of the inlining budget, a call site that went polymorphic, an optimization that
now bails out, or a loop that now allocates enough to trigger young-generation GCs. V8 reports every one of these, but
only through trace flags whose output is noisy (addresses, ids, timing) and changes between node versions.

These tools do the unglamorous part: they run the driver under the right flags on one pinned node binary, normalize the
trace, compare the two builds as an order-free multiset, and repeat the runs so that any run-to-run change in the answer is
caught by a null control and reported as `NO-VERDICT` instead of a false `DIFF`. They are plain bash plus POSIX
awk (alloc-per-op: plain node), with no runtime dependency, so a script can be copied into any repository.

---

## What you get

| Tool | Question | Modes | Verdict words | Tier |
|------|----------|-------|---------------|------|
| `bytecode-budget` | How long is the bytecode of these functions? | report, gate (`--max`), `--diff` (driver, ref, file) | REPORTED / WITHIN / OVER; SAME / DIFF; NO-VERDICT | DETERMINISTIC |
| `deopt-diff` | Which deopts did these functions have, before vs after? | driver, ref, file, `--self-test` | SAME / DIFF / NO-VERDICT | STATISTICAL on a user driver |
| `ic-diff` | In which state did their inline-cache sites end? | driver | SAME / DIFF / NO-VERDICT | STATISTICAL on a user driver |
| `inlining-budget-diff` | Which inlining decisions did TurboFan and Maglev make? | driver (ref / file: lite-signal shaped) | SAME / DIFF / NO-VERDICT | STATISTICAL (budget report: REPORTED) |
| `allocation-diff` | How many young-generation GCs in a marked window? | diff, `--zero` gate | SAME / DIFF; ZERO / NONZERO; NO-VERDICT | script logic DETERMINISTIC; user verdict STATISTICAL |
| `shape-diff` | Did the shapes, elements kinds or field representations of these functions' objects change, before vs after? | driver, `--self-test` | SAME / DIFF / NO-VERDICT | `--self-test` DETERMINISTIC; a verdict on a user driver STATISTICAL, REPORTED only |
| `alloc-per-op` | How many on-heap bytes does one op of this lane allocate, steady state? | table, gate (`--max`), A/B (`--tol`), `--self-test` | PASS / FAIL; SAME / DIFF; NO VERDICT | `--self-test` DETERMINISTIC; a verdict on a user lane STATISTICAL |

The tiers are the suite's verification tiers. DETERMINISTIC: the result does not depend on timing and is gated in
`npm test`. STATISTICAL: the result follows tier-up and GC timing, so a comparison on your driver is never gated here
and should be run on a quiet host. REPORTED: a table the tool prints, a measurement and not a law.

Every run of the six bash tools that reaches a verdict ends in a `VERDICT <v>` line on stdout. Exit codes: 0 = SAME /
WITHIN / REPORTED / ZERO, 1 = DIFF / OVER / NONZERO, 2 = NO-VERDICT or a refused argument. `alloc-per-op` has its own
verdict words and exit codes (its section below).

---

## bytecode-budget

The bytecode LENGTH of named functions on one node binary: a report, a gate against per-function maxima, or a diff of
two drivers (or of one module at two git refs, or of a frozen copy and the live file).

```bash
bytecode-budget.sh [opts] --fn LIST DRIVER                                   # report
bytecode-budget.sh [opts] --max fn=N[,fn=N] --node-version vX.Y.Z DRIVER     # gate
bytecode-budget.sh [opts] --diff --fn LIST DRIVER_BEFORE DRIVER_AFTER          # diff
bytecode-budget.sh [opts] --diff --fn LIST --out DIR --driver FILE --before-ref REF --after-ref REF --module REL
bytecode-budget.sh [opts] --diff --fn LIST --out DIR --driver FILE --before FILE --after FILE
```

- **Gate.** Every function named in `--max` must have a length `<=` its maximum. The maxima record the node version they
  were taken on (`--node-version`, required); a different `node --version` is `NO-VERDICT` before any probe, never a
  failure. Exit 0 `WITHIN`, 1 `OVER`, 2 `NO-VERDICT`.
- **Report.** Exit 0 `REPORTED`, or 2 `NO-VERDICT`. The limit values it prints are this binary's, a measurement of that
  binary.
- **Diff.** The length multisets of each function in the two builds are compared; exit 0 `SAME`, 1 `DIFF`, 2
  `NO-VERDICT`. Ref mode reads `--module` at two git refs; file mode takes a frozen copy as `--before` and the live
  file as `--after`.
- **Matching** is exact and counts every function with that name (same-name functions, class and object methods); each
  one is gated. `read` never matches `reader`.
- **Tier: DETERMINISTIC.** Bytecode length does not depend on tier-up timing; any run-to-run change is `NO-VERDICT`.
  The gate is pinned to one node version, so a stored maximum is only meaningful for the node version it names.

---

## deopt-diff

The deoptimizations of named functions, before vs after, on one node binary: per function, the multiset of its deopt
records (code tier, kind, reason).

```bash
deopt-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     # driver mode: two drivers, one verdict
deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before-ref REF --after-ref REF --module REL   # ref mode
deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before FILE --after FILE                     # file mode
deopt-diff.sh --self-test [--fixtures DIR]
```

- **Verdict.** Exit 0 `SAME`, 1 `DIFF`, 2 `NO-VERDICT` (NO-VERDICT > DIFF > SAME over every function).
- **Tier.** On a user driver the verdict is STATISTICAL (deopts follow tier-up timing; run it on a quiet host).
  `--self-test` and `--self-test --fixtures DIR` (recorded traces) are DETERMINISTIC. The tier section it prints is
  REPORTED and never moves the exit code.
- **Controls.** The repository carries a must-DIFF and a must-SAME driver pair that force tier-up with
  `--allow-natives-syntax`, so the control runs deterministically in `npm test` (ROADMAP S-8).

---

## ic-diff

The inline-cache states of named functions, before vs after, on one node binary: per function, the multiset of its IC
sites (kind, key, final state).

```bash
ic-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     # driver mode: two drivers, one verdict
ic-diff.sh --self-test
```

- **Driver mode only.** There is no ref or file mode.
- **Verdict.** Exit 0 `SAME`, 1 `DIFF`, 2 `NO-VERDICT`.
- **Tier.** On a user driver the verdict is STATISTICAL (IC states follow warm-up, GC and tier-up timing);
  `--self-test` is DETERMINISTIC.
- **Node 22 and 24.** The tool always ends `NO-VERDICT` there (a code-kind numbering table that is V8 14.x only), by
  design, never a wrong verdict (LEDGER #83). V8 15.6 (node 27 alpha) shares the V8 14.x code-kind numbering (the
  CODE_KIND_LIST of V8 `src/objects/code-kind.h` is identical at 14.6.202.34 and 15.6.75.25), so the tool gives
  verdicts there; only the nightly exercises prerelease nodes, the CI matrix does not (LEDGER #128).

---

## inlining-budget-diff

The TurboFan and Maglev inlining DECISIONS for named functions, before vs after, plus a budget report. Decision lines
are normalized, tagged with the compile unit they were made in, and compared per tier as a multiset.

```bash
ME=m0 inlining-budget-diff.sh [opts] DRIVER_BEFORE DRIVER_AFTER      # driver mode (any project)
inlining-budget-diff.sh [opts] --before-ref REF --after-ref REF       # lite-signal: builds from git refs
inlining-budget-diff.sh [opts] --before FILE --after FILE             # lite-signal: two Signal.js files
```

- **Driver mode** works on any project; name the functions with `--fn LIST` (default: `$ME`, else `m0`). The ref and
  file modes are lite-signal shaped: the driver imports `./Signal.js` and the tool stages `Signal.js` and `Watch.js`.
- **Tiers.** `--tiers LIST` takes `turbo,maglev` (default both). On node 22 Maglev does not run by default, so the
  maglev tier is `NO-VERDICT`; use `--tiers turbo`.
- **Verdict (per tier).** Exit 0 `SAME`, 1 `DIFF`, 2 `NO-VERDICT`. A run with no decision line naming the function and
  no completed compile of it is `NO-VERDICT`, never "identical".
- **Tier.** The verdict is STATISTICAL (inlining follows tier-up timing); the budget report is REPORTED and is never
  part of the verdict. A real comparison is never part of `npm test`; only `--self-test` is gated, and there is no live
  control for this tool.
- **Artifacts.** `--out DIR` is always kept (default `$OUTDIR`, else `$TMPDIR/inl-diff-<timestamp>`); a rerun after a
  refusal needs a fresh `--out` (LEDGER #76, #80).

---

## allocation-diff

Young-generation GC EVENT COUNTS inside a marked window of a driver, one driver against another (diff) or one driver
against none (`--zero`), on one node binary. Counts, never bytes.

```bash
allocation-diff.sh [opts] DRIVER_BEFORE DRIVER_AFTER     # diff mode: SAME / DIFF
allocation-diff.sh [opts] --zero DRIVER                  # gate mode: ZERO / NONZERO
allocation-diff.sh --self-test
```

- **Exit.** 0 `SAME` / `ZERO`, 1 `DIFF` / `NONZERO`, 2 `NO-VERDICT` (with `--zero`, a young GC in every run is `NONZERO`
  even when the counts or kinds differ from run to run; a young GC in some runs only is `NO-VERDICT`). A GC that the V8 stack guard runs at the guard's
  hand-over can read `trace lost 1 GC line in run k (guard count c, trace c-1)`: that is `NO-VERDICT` (exit 2, fail
  closed), rare (0 natural hits locally; CI sightings: LEDGER #138), window unaffected.
- **ZERO** means less than one semi-space (1 MB) of young allocation in the window, not zero bytes. The tool pins a
  1 MB semi-space for every run. `--zero` prints `NONZERO -- young GC(s) in the window in every run (young per run
  <y1>,<y2>,..)` when every run has a young GC but the runs' young multisets differ (exit 1).
- **Driver contract.** The driver marks the window with `fs.writeSync(1, '@@LITE-MARK start\n')` and the matching `end`
  marker, written after warm-up; never use `console.log` or `process.stdout` in the driver, and never make stdout
  non-blocking. A cold window over-reports.
- **Tier.** The script logic is DETERMINISTIC (`--self-test`); a verdict on a user driver is STATISTICAL, and REPORTED
  only (this repository has no statistical host).
- **Not detected.** Young allocation under one semi-space in the window, large-object and old-space allocation, and an
  allocation TurboFan scalar-replaces (that is correctly not an allocation).

---

## shape-diff

The object shapes of named functions, before vs after, on one node binary: per function, the multiset of its
shape-instability events (map deprecation / reconfiguration, elements-kind transitions, field-representation
generalization), each attributed to the function that owns it.

```bash
shape-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     # driver mode: two drivers, one verdict
shape-diff.sh --self-test
```

Installed, the same call is `./node_modules/.bin/shape-diff --fn mk before.mjs after.mjs`; each driver defines and calls
the function `mk` (name the functions to compare with `--fn`).

- **Driver mode only, no `--stable` mode.** There is no ref or file mode (Q-SD-KEEP (a)); it is a standalone bash
  tool that diffs two runs of two drivers. `--fn LIST` (comma-separated short names; `--fn=LIST` also works) is
  required. An empty value for any value option (`--fn`, `--runs`, `--node`, `--v8-flags`, `--out`) is refused at its
  argv position (`<opt> must not be empty`). `--runs N` is 1-2 decimal digits, 2..20 (default 3): `09` is 9 and `024`
  is refused in your spelling. Run 1 vs runs 2..N of the same side is the null control, as in the other diff tools. An
  unknown option gets a did-you-mean hint (`--outt` -> `(did you mean --out?)`; `--zz` gets none).
- **A blind spot: a single cold call to `Array.prototype.push(1.5)` emits no trace line.** V8 prints nothing for it, so a
  driver whose only difference is one such call reads `SAME` (REPORTED: 0 trace lines on darwin arm64, node v22.23.5 /
  v24.22.3 / v26.8.2 / v27.0.0-alpha.0.1.0; `-h` states the same limit). Call the function enough times for V8 to
  generalize in a place it does print (see the warm-up bullet) before trusting a `SAME`.
- **Exit.** 0 `SAME`, 1 `DIFF` (the attributed shape-instability multiset differs for at least one `--fn` function),
  2 `NO-VERDICT` (a refusal, a trace parse error, a null-control failure, missing execution evidence, a target
  Transition whose map has no map-details line, `tier-up differs (optimized-frame key set)` or `tier-up differs
  (interpreted key set)` while the interpreted multisets are equal, or unattributed instability that changed while the
  attributed sites looked `SAME`). Precedence over every function: `NO-VERDICT` > `DIFF` > `SAME`. Every run that
  reaches a verdict ends in a `VERDICT <v>` line, like the other bash tools.
- **Owner.** Each event is keyed to an owner: `user:<fn>`, `node:<fn>`, `Builtin:*`, `other:<fn>` or `NONE`. A delta
  that no `--fn` function owns (a node-internal frame, a non-target helper, `Reflect.deleteProperty`, `splice`) never
  produces a `DIFF`: if the attributed sites look `SAME` it turns the verdict into `NO-VERDICT` naming the owner
  (Q-SD-OWNER (a), Q-SD-UNATTR (a)).
- **Classes.** A `ReplaceDescriptors` map line is `MAP_REPLACE` for every reason, target and non-target, except a
  reason-`MapCreate` line whose (owner, source site) has exactly 1 hit in a run: it is not counted (the literal-map
  cache fill; execution evidence is kept); >= 2 hits count (C-21, Q-B113-F1). A target `[reconfiguring]` line is a
  `RECONF` verdict record, so a changed one reads `DIFF`; a non-target one is unattributed (C-22). `map-move` lines (GC
  compaction) are followed, not refused: a map keeps its elements kind at its new address, a malformed one is
  `NO-VERDICT` `map-move does not parse`, and `--stress-compaction` runs are readable (C-30, Q-B113-F2). A `--fn` name
  defined at more than one location in a run (a same-named function at another path) reads `NO-VERDICT` `ambiguous
  target function '<fn>' defined at >1 location in run 1` (M3). Optimized-frame hits fold into the first interpreted
  site of the same function / kind / detail (C-23). A `DIFF` report also prints a differing unattributed delta
  (REPORTED; the verdict stays `DIFF`).
- **Transitions.** Normal monomorphic Transition / InitialMap counts are REPORTED by default; `--include-transitions`
  puts them in the verdict (Q-SD-TRANS (a)). A constructor field add, or a `push` that moves the elements kind, can
  read `SAME` or `NO-VERDICT` in default mode: check a field-added commit with `--include-transitions`.
- **Guard and warm-up.** A function with no evidence (an optimizing compile of it, or an attributed map / shape event)
  reads `NO-VERDICT`, not `SAME`: a clean array or arithmetic function run too few times shows nothing. Warm it up,
  e.g. 20000 calls (nominal; one research run on v26.8.2, not reproduced here).
- **The traced tier.** The tool runs the driver with `--no-sparkplug --no-node-snapshot` added to its trace flags (not
  node's default tier config), and `--v8-flags` refuses any `*sparkplug*` flag. A default-tier A/B of the research prototype (not the shipped root) on node 24.22.3 /
  26.8.2 (darwin arm64, 2026-11-24, QUIET host) gave the same verdicts (REPORTED); no user function ran in a Sparkplug frame in
  that default-tier arm, so verdicts with user code in baseline frames are not covered. The call count at which a helper
  gets inlined can still differ from a default run.
- **Node.** node >= 22 (`engines.node`): a `--version` that does not parse as `v<major>.<minor>.<patch>`, or a major
  below 22, exits 2 after the one `--version` spawn, before `--v8-options` and before any write. The record formats
  were captured on node 22, 24, 26 and 27 (v22.23.5 / v24.22.3 / v26.8.2 / v27.0.0-alpha.0.1.0) and the self-test
  replays them without a real node. A hosted probe of the research prototype (run-probes.sh, 27 assertions; not the shipped
  root) ran 27 / 27 ok on ubuntu node 22 / 24 / 26 x default GNU Awk 5.3.2 / gawk / mawk 1.3.4 and on macOS node 26 x
  BSD awk / gawk (REPORTED, one dispatch, run 45521613713).
- **Tier.** On a user driver the verdict is STATISTICAL (shape events follow warm-up and tier-up timing) and REPORTED
  only, never gated here (S-5); `--self-test` is DETERMINISTIC: 58 rows with a fake node. Rows 41-44 replay real
  captures of node 22, 24, 26 and 27 (the golden MAP and SHAPE records, the excerpt vs the excerpt minus its
  `map,Normalize` line -> exit 1 DIFF naming the removed MAP_NORMALIZE record, `Point` SAME). Rows 45-53 are the
  audit-fix rows (M1 MAP_REPLACE, M2a, M2b RECONF, M3, M4 fold and tier-up, M7, M8, M12), row 54 the interpreted key
  set, rows 55-58 the MapCreate single-hit rule and `map-move`.
- **`--out DIR`** keeps `DIR/report.txt` and `DIR/raw/<side>/run.<k>.{log,out}`. A trailing `/` or `/.` is stripped
  before the symlink check, so `lnk/` and `lnk/.` are refused like `lnk`; a deeper form such as `lnk/sub/..` is not
  checked (`--out` is not a security boundary). A driver under a directory named `-` resolves as `./-/...` and never
  runs `cd -`. Refused with exit 2: a symlink `--out`
  DIR, a symlink or hard-linked `DIR/report.txt`, a non-empty `DIR/raw`, a CR or LF in an option name (the label is
  `option name`; the other bash tools say
  `unknown option`), and a driver inside `--out D` that is `D/report.txt`.
- **Not detected.** A single cold `push(1.5)` (above), a shape change with no trace line, and anything that happens
  only outside the traced tier. See Known limits.

---

## alloc-per-op

Steady-state ON-HEAP BYTES per op of a synchronous lane, in the main isolate, for one bench file (a table, or a gate)
or for two (an A/B). It is a node script (`alloc-per-op.mjs`), not bash, and needs no driver markers: the bench file
exports the lanes and the tool times nothing.

```bash
alloc-per-op [options] [--max B] BENCH           # table, or a gate: PASS / FAIL / NO VERDICT
alloc-per-op [options] --tol B BENCH_A BENCH_B   # A/B: SAME / DIFF / NO VERDICT
alloc-per-op --self-test [--json]                # the engine controls and the self-test lanes
```

- **Bench file.** An ES module exporting `lanes`, a plain object of synchronous functions `lane(i)`; an optional
  exported `setup()`, a plain or async function (a generator is refused, exit 2), is awaited once, BEFORE `lanes` is
  read, so setup may build or replace lanes. A lane that returns a value is refused, but only `lane(0)`'s return
  value is checked. A bench that imports the tool file again inside its run is refused (exit 2).
- **`lane(i)`.** `i` runs 0 .. S-1 in every sub-window (0 .. W-1 in the warm-up) and then restarts; it is not an op
  index. An allocation keyed on `i` is read for those calls: one that needs i >= S never happens, and one at
  `i = 0` happens once per sub-window. Count calls inside the lane instead.
- **Options.** `--n` (ops per window, 100000..100000000, default 1000000), `--windows K` (3..50, default 5; PEAK is the
  max of windows 1..K-1), `--warm W` (warm-up ops, default 200000), `--sub S` (ops per sub-window, 1000..10000,
  default 10000; `N % S == 0` and `N / S <= 10000`), `--lane NAME` (repeatable), `--max B`, `--tol B` (required in A/B,
  no default), `--json` (one JSON line, the last line the tool writes to stdout; keep bench output off stdout: what a bench
  prints later follows that line, and an unfinished line before it shares it). Option checks run before any spawn,
  except that a `--lane NAME` is checked after the bench loads (so `setup()` has run); a dash-led NAME is a name.
- **Exit.** 0 `PASS` / `SAME` / a table; 1 `FAIL` / `DIFF` / `ONLY-A` / `ONLY-B`; 2 `NO VERDICT` or a refused
  argument. `--self-test`: 0 when every row is ok, 1 when a row misses, 2 when the selfCheck misses. A statistic inside
  the refusal band is `NO VERDICT`, never a guess. It prints a `gate --max B (peak B/op): <verdict>` or
  `A/B --tol B (peak B/op): <verdict>` line, not a `VERDICT <v>` line: take the exit code (or `--json`). A table
  run has no verdict field in `--json`; its NO VERDICT (for example a fence miss) is exit 2 plus the stderr line.
  A GC inside a sub-window VOIDs it: a lane that allocates more than new space holds per sub-window (on the order
  of 100 B/op at the default S; it depends on the new-space size) is NO VERDICT, never FAIL; lower `--sub`.
  The tool exits when the event loop drains: a bench that leaves a timer, socket or Worker open keeps it (and the
  re-spawning parent) running after the verdict line; close or unref them. A signal sent to the tool alone does
  not reach the `--expose-gc` child it re-spawns: signal the process group, or run `node --expose-gc
  alloc-per-op.mjs ...` (no re-spawn).
- **Refusal band.** `lo = 32 / S` and `hi = hiFixed + 0.001 x peak` with `hiFixed = 524288 / N`. A `--max` below `lo`,
  or a `--tol` below `lo + hiFixed`, is refused before any spawn and the refusal names the smallest accepted value.
  Below `--n 1000000` `hiFixed` is doubled (`2 x 524288 / N`; PRELIMINARY until the 8-leg corner tally), in `hi` and
  in the `--tol` floor: at `--n 100000 --sub 10000` the corner `--tol` floor is 10.48896 (was 5.24608). The floor (the
  empty-lane reading) is reported and never subtracted, and is null (`null` in text) after a selfCheck miss. A rejected sub-window is retried (at most 3 re-runs); a retried
  sub-window calls the lane again, so a lane with side effects sees extra calls.
- **A/B.** The same path twice (after realpath) is refused; a hard link or a case variant counts as a copy; an A/A
  check needs a copied bench.
- **Scope.** On-heap bytes of the main isolate only. The tool reads the four spaces `new_space`, `old_space`,
  `large_object_space` and `new_large_object_space`; `code_space` and `trusted_space` are counted into `old_space`, and
  `code_large_object_space` and `trusted_large_object_space` into `large_object_space`. `read_only_space` and the shared
  spaces are not read. Off-heap `ArrayBuffer` memory and Worker threads are not counted (there is no Worker detector); for
  external memory use lite-perf-gate's `arrayBuffers` signal.
- **Tier.** The `--self-test` verdict rows are DETERMINISTIC (gated in `npm test` and in CI, untimed). A verdict on your
  lane is STATISTICAL: it follows tier-up and GC timing, so run it on a quiet host; `--no-concurrent-recompilation`
  lowers the noise and is not forced. The constants (`32`, `524288`, `0.001`, `RETRY_MAX 3`) are FROZEN by S-A36 (CI run
  43691163080, at --n 1e6 / 1e7 x --sub 1e3 / 1e4; the --n 1e5 / 1e8 corners rest on local PRELIMINARY data only); the
  read set and the driver are re-frozen by S-A51 (CI run 44945969102, 8/8 legs, ci-report VERDICT PASS); both REPORTED
  tier (hosted CI, one run each). A threshold holds only for the build it was measured on (pointer compression, arch,
  node / v8).
- **Not detected.** An allocation the lane does not STORE (see Known limits), an allocation that does not recur
  inside the measured span, off-heap memory.

---

## CLI reference

Flags shared by the six bash tools (each tool's section above shows its own usage lines; `bash <tool>.sh -h` prints the
full text; `alloc-per-op` has its own flags, in its section above and in `alloc-per-op -h`):

| Flag | Meaning |
|------|---------|
| `--node BIN` | node binary (default `$NODE`, else `node`), resolved ONCE to an absolute path; refused before any spawn if it is not an executable file |
| `--v8-flags STR` | extra V8 flags for every run; a runtime allowlist (V8 flags the node lists in `--v8-options`, minus log / trace / print / prof / perf / dump / snapshot / file flags); node options and the tool's own flags are refused |
| `--out DIR` | keep the report and the raw per-run outputs in DIR |
| `--runs N` | runs per side; run 1 vs runs 2..N is the null control (with `--zero`: young 0 vs young >= 1 per run) |
| `--self-test` | canned checks (a fake node or canned text) |
| `-h`, `--help` | print the header text and exit 2 |

`-h` exits 2 on all seven tools. For `allocation-diff`, `bytecode-budget`, `deopt-diff`, `ic-diff` and `shape-diff`, `--self-test`
exits 0 when every check is ok and 1 when a check prints a `FAIL` line; that 1 is a failed check and not a `DIFF`.
`alloc-per-op --self-test` exits 0 when every row is ok, 1 when a row misses and 2 when its selfCheck misses.

Defaults and limits:

| Tool | `--runs` default | `--runs` range | Other defaults |
|------|------------------|----------------|----------------|
| `allocation-diff` | 5 | 2..20 | semi-space pinned to 1 MB |
| `bytecode-budget` | 2 | 2..20 | `--max` value N is 1..9 digits |
| `deopt-diff` | 3 | 2..20 | |
| `ic-diff` | 3 | 2..20 | |
| `shape-diff` | 3 | 2..20 | `--fn LIST` is required; transitions REPORTED only unless `--include-transitions`; `--v8-flags` also refuses any `*sparkplug*` flag |
| `inlining-budget-diff` | 3 | 2..50 | `--tiers turbo,maglev`; `--fn` `$ME`, else `m0`; `--out` `$OUTDIR`, else `$TMPDIR/inl-diff-<timestamp>` |

`alloc-per-op` has `--windows` (default 5, 3..50), `--n` (default 1000000), `--warm` (default 200000) and `--sub`
(default 10000) instead of `--runs`; see its section.

Every bash-tool spawn runs with `NODE_OPTIONS`, `NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE` and `NODE_REDIRECT_WARNINGS` stripped.

Requirements:

- bash >= 3.2 for the six bash tools (CI exercises macOS `/bin/bash`); `alloc-per-op` needs only node.
- A POSIX awk. CI runs the BSD awk of macOS and the awk of `ubuntu-latest`; no other awk is claimed.
- node >= 22 (`engines.node`), with the caveats above: `ic-diff` ends `NO-VERDICT` on node 22 and 24, and the
  maglev tier of `inlining-budget-diff` is `NO-VERDICT` on node 22.
- git, for ref and file modes.
- `sha256sum` or `shasum`.

---

## Composability

One CI job, all seven tools (six bash + one node tool; CI runs `node alloc-per-op.mjs --self-test`, untimed; installed,
the `--max` run below (a report here) is `./node_modules/.bin/alloc-per-op --max B bench.mjs`). Only
`bytecode-budget --max` is a gate here: its exit 1 (OVER) or 2 (NO-VERDICT) fails the job. The five other bash tools are
statistical, so they report and do not gate: run them with `rc=0; ... || rc=$?`, keep `--out` as a build artifact, and
fail the job only when the `VERDICT` line is missing.

```bash
set -eu
B=./node_modules/.bin
mkdir -p artifacts

# the one gate: a maximum recorded on node v26.8.2; any other node ends NO-VERDICT (exit 2)
"$B/bytecode-budget" --max add=6 --node-version v26.8.2 bench/driver.mjs

# the statistical tools: report, keep the evidence, require a VERDICT line
for tool in deopt-diff ic-diff shape-diff; do
  rc=0
  "$B/$tool" --fn add --out "artifacts/$tool" bench/before.mjs bench/after.mjs \
    > "artifacts/$tool.txt" 2>&1 || rc=$?
  grep -q '^VERDICT ' "artifacts/$tool.txt" || { echo "$tool: no VERDICT line"; exit 1; }
  echo "$tool: exit $rc"
done

rc=0
"$B/allocation-diff" --out artifacts/allocation-diff bench/alloc-before.mjs bench/alloc-after.mjs \
  > artifacts/allocation-diff.txt 2>&1 || rc=$?
grep -q '^VERDICT ' artifacts/allocation-diff.txt || { echo "allocation-diff: no VERDICT line"; exit 1; }

rc=0
ME=add "$B/inlining-budget-diff" --out artifacts/inlining bench/before.mjs bench/after.mjs \
  > artifacts/inlining.txt 2>&1 || rc=$?
grep -q '^VERDICT ' artifacts/inlining.txt || { echo "inlining-budget-diff: no VERDICT line"; exit 1; }
```

`alloc-per-op` takes a bench file instead of a driver. Save this as `bench/alloc.mjs` (the lane STORES what it
allocates):

```js
const sink = [{}, {}];
export const lanes = {
  'box.frac': (i) => { sink[i & 1] = i + 0.5; },
};
```

```bash
rc=0
"$B/alloc-per-op" --max 1 bench/alloc.mjs > artifacts/alloc-per-op.txt 2>&1 || rc=$?
echo "alloc-per-op: exit $rc"   # 0 PASS, 1 FAIL, 2 NO VERDICT or refused (this lane boxes a number per op, so 1)
```

Replace the `--max` value and the node version with values you recorded on that node version. An `alloc-per-op` threshold
holds only for the build it was measured on.

<details>
<summary>Design notes</summary>

- **Generated roots.** Each bash root script is generated by `build.sh` from `src/` and `lib/` fragments and committed;
  `alloc-per-op.mjs` is copied byte for byte from `src/alloc-per-op.mjs` (no expansion, no substitution; `build.sh`
  refuses an unlisted `src/*.mjs`, a missing, non-regular or symlinked source, a NUL byte, no final newline, a line 1
  other than `#!/usr/bin/env node`, or a failing `node --check`, exit 2). A test fails when a shipped file differs from a
  fresh build. A root never sources or imports a package file at run time (its `import`s are `node:` only), so copying
  one file is a complete install (ROADMAP S-2).
- **What each tool measures.** Bytecode length (`--print-bytecode`), deopt records (`--trace-deopt`), IC sites
  (`--log-ic`), inlining decisions (V8's TurboFan trace and `--trace-maglev-inlining`), young-GC events
  (`--trace-gc` inside a marked window), object shapes (`--log-maps --trace-elements-transitions --trace-generalization`).
- **Fail closed.** An EXIT trap maps any unplanned exit to exit 2 `NO-VERDICT`, never 1. Signals (SIGINT, SIGTERM,
  SIGHUP) end exit 2 `NO-VERDICT` after killing the running child.
- **Refuse before spawn.** An invalid argument exits 2 before any node is spawned or any file is written. Named
  exceptions: a `--v8-flags` value outside the allowlist is refused after one `--v8-options` read, and some
  `inlining-budget-diff` ref / file refusals come after node spawns (LEDGER #76).
- **Allowlist, not denylist.** A V8 flag is accepted only if the node binary lists it, and never if it writes logs,
  traces, profiles or files, or would load code into the measured process.
- **One node binary.** The `--node` file is resolved once; the version probe and every run use that one file.

</details>

---

## Design decisions worth knowing

- **Multiset compare.** Traces are compared as order-free multisets with duplicates kept: inlined at 2 sites then 1
  site is a `DIFF`; `6,19` equals `19,6`.
- **Null control.** Run 1 of each side is compared with runs 2..N of the same side. Any difference is `NO-VERDICT`,
  never `DIFF`: a comparison that does not reproduce itself says nothing. The law is applied per question: in `--zero`
  the question is young 0 vs young >= 1, so only a run with young 0 against a run with young >= 1 is `NO-VERDICT`
  (`null control: run k differs from run 1 (--zero: run 1 young a | run k young b)`); young in every run with differing
  counts or kinds is `NONZERO`.
- **Counts, not bytes.** `allocation-diff` counts young-GC events; it cannot tell you how many bytes a window
  allocated. `alloc-per-op` is the bytes tool, for on-heap bytes per op of a synchronous lane.
- **The frozen "before".** Ref and file modes refuse a `--before` that is the live, tracked file: comparing a build with
  itself would be a silent `SAME`. Keep the "before" build in a frozen copy or at a git ref.
- **No timing tool.** Timing is noisy and belongs in a statistical host; these tools compare what V8 decided, not how
  long it took.
- **Driver output is trusted.** The tools read V8's trace from the driver's own stdout, so a driver can forge it (see
  Known limits).

---

## Testing

`npm test` runs 4344 tests (node:test), 4329 pass / 0 fail / 15 skip in one local run (2026-11-24, node v26.8.2,
macOS arm64, /bin/bash 3.2.57, 1687 s, host QUIET at start (load1 1.38 vs baseline 2.21); the 1.1.2 release gate,
tree 52f3f2b + the 1.1.2 docs + the version bump; a measurement, not a guarantee).

Scripts: `npm test`, `npm run build` (regenerate the six bash roots from `src/` and `lib/`, and copy `alloc-per-op.mjs` from `src/`).

The CI workflow is configured for a matrix of ubuntu-latest and macos-latest on node 22, 24 and 26, plus node 26.8.2
on both. LiteUtils is exempt from the suite's `test/torture.mjs` law (ROADMAP S-12; `alloc-per-op.mjs` included); its gates are each
tool's `--self-test` (with `--fixtures` where offered) and `npm test`.

---

## Known limits

- `alloc-per-op`: the lane must STORE what it allocates. A dropped allocation (returned, or discarded in the lane body,
  e.g. `(i) => { add(A, B); }`) may be elided by V8 and then reads 0 B/op. A lane that returns a value is refused, but
  only `lane(0)`'s return value is checked, so a value or a thenable from a later call is not seen.
- `alloc-per-op` reads the four spaces plus code_space, trusted_space and their large-object spaces (folded into
  old_space / large_object_space); `read_only_space` and the shared spaces are not read, and off-heap `ArrayBuffer` memory
  and Worker threads are not counted (no Worker detector; lite-perf-gate's `arrayBuffers` signal covers external memory).
- `alloc-per-op`: an allocation that does not recur inside the measured span ((K-1) x N ops) is seen only if an
  occurrence falls inside it, by every rule. The default `--warm` covers constructor, class-field and literal shapes.
  `--sub` below 1000 under-reads on node v22, hence the floor of 1000. A retried sub-window calls the lane again, so a
  lane with side effects sees extra calls; the floor is reported and never subtracted.
- `alloc-per-op`: a bench that replaces `v8.GCProfiler` gets a fence miss, exit 2: replaced at import or in `setup()`,
  selfCheck misses (`selfCheck: fence: ...`, no lane measured, floor null); replaced by a lane during the run, every
  lane verdict is NO VERDICT and stderr says `fence (after): v8.GCProfiler was replaced during the run`. A prototype
  patch of `v8.GCProfiler` / `v8.getHeapSpaceStatistics`, or a swap restored before the run ends, is not detected. On a
  fence miss a non-VOID gate lane line in the text output ends ` (fence)`; A/B text lane lines carry no label, and every
  lane verdict in `--json` is NO VERDICT. (Code that imports alloc-per-op.mjs's exports (unsupported, no contract) and
  replaced `v8.GCProfiler` passes `Profiler: v8.GCProfiler`). `--no-concurrent-recompilation` lowers noise and is not
  forced. The numeric constants are FROZEN by S-A36 (CI run 43691163080, at --n 1e6 / 1e7 x --sub 1e3 / 1e4; the --n 1e5
  / 1e8 corners rest on local PRELIMINARY data only); the read set and the driver are re-frozen by S-A51 (CI run
  44945969102); both REPORTED tier (hosted CI, one run each).
- an inherited SHELLOPTS=noexec runs nothing and exits 0; callers must require the VERDICT line, not only the exit code
  (class 2; LEDGER #124).
- The `--v8-flags` allowlist checks a numeric value's FORM only: `--max-inlined-bytecode-size=NaN` passes, node
  then exits non-zero on every run and the tool ends `NO-VERDICT` (LEDGER #66).
- `ic-diff` ends `NO-VERDICT` on node 22 and 24, by design (LEDGER #83).
- A refusal can print a name that git, readlink or a PATH lookup resolved; a newline or CR in such a name, behind a
  symlink with a clean name (or in a PATH directory), reaches stderr inside that one refusal (exit 2; the last line is
  still `VERDICT NO-VERDICT`) (LEDGER #122).
- `NODE_NO_WARNINGS` is not stripped by `allocation-diff`; a warning-heavy driver can shift the GC count (LEDGER #84).
- `inlining-budget-diff` leaves its `--out` directory behind after a refusal, and a rerun on a non-empty one is refused:
  use a fresh `--out` (LEDGER #76, #80).
- In `inlining-budget-diff` file and ref mode the null-control NOTE is decided on `Signal.js` alone; a differing
  `Watch.js` prints the NOTE and then `DIFF`. The verdict is right; the NOTE is wrong (LEDGER #123).
- Driver output is trusted: a driver that prints V8 trace text, or bare number lines, can forge a result; a Worker
  writing while V8 prints can tear a record, which ends `NO-VERDICT` (LEDGER #72, #92).
- a hard link to `--before` elsewhere in the repository (outside `--before`'s directory and below), or under a case-only
  sibling name on a case-sensitive file system, can stay undetected (LEDGER #71, #88, #89)
- `shape-diff` limits (LEDGER #146): a single cold `push(1.5)` emits no trace line and reads `SAME` (REPORTED: darwin arm64, node v22.23.5 /
  v24.22.3 / v26.8.2 / v27.0.0-alpha.0.1.0); the owner key is
  path-stripped, so two `del` helpers in different files share one key and an instability that moves between them reads
  `SAME` (not probed); a node whose log format renames or drops a trace prefix is not covered until captured; a function
  with no warm-up evidence ends `NO-VERDICT`; and the traced tier is not node's default (see the section).
- `shape-diff` real-code limits (LEDGER #146, #153; a pass over LiteSignal, LiteArena, LiteFastBit32, LiteLogLogN and
  LiteYggdrasil on node v26.8.2 and v26.3.1, REPORTED; all fail closed or are named here):
  - `--fn <Class>` on a class with instance or static fields (private fields and `static {}` included) reads
    `NO-VERDICT` `ambiguous target function`: V8 logs each field initializer under the class name at the field line. A
    class expression escapes (its initializer is unnamed). Target the methods, not the class.
  - An added or removed NON-target class with fields reads `NO-VERDICT`: each field declaration adds a 1-hit top-level
    `CopyAddDescriptor` `MAP_REPLACE` line per run, counted as non-target instability. A field-less class reads `SAME`
    (the MapCreate single-hit rule).
  - Two same-name functions (e.g. a registry method and a module wrapper) read `ambiguous target function` once both
    compile. An arrow assigned as `read.set = (value) => ...` gets the inferred name `read.set`, which `--fn` refuses,
    so such code is only ever unattributed. The `UNATTR GEN` counts are trace lines (one event is 2 lines); attributed
    sites dedupe; verdicts are unaffected.
  - node v26.8.2 sometimes drops elements-transition lines (a LiteSignal null control read `NO-VERDICT` in 3 of 10
    runs; fail-closed).
  - A constructor field add, or a `push` that moves the elements kind, reads `SAME` / `NO-VERDICT` in default mode:
    use `--include-transitions`. A deopt loop with no shape event reads `SAME` (shape-diff sees shapes, not deopts: use
    `deopt-diff`).
  - The generalization key includes the `(+N maps)` count, so a changed count alone reads `DIFF`.
  - A source directory whose name looks like a frame bracket (e.g. `a) [x+1 at y/`) can still be mis-split by the
    frame reader (documented, not fixed).
- `shape-diff` LEAD (LEDGER #147): the filter that dropped a `(+N maps)` generalization with identical representations
  is closed by M2a (such a line is no longer a no-op) and a target `[reconfiguring]` line is a `RECONF` verdict record.
  A back-pointer-less attribute reconfigure normalizes (`MAP_NORMALIZE`, `NO-VERDICT`, fail-closed); that path stays
  UNVERIFIED.
- These tools are not a security boundary: they run the driver you give them.

---

## What this is not

- Not a JavaScript API: the supported surface is the seven commands; `alloc-per-op.mjs`'s ES exports serve its own tests
  and carry no API contract. These are command-line scripts (six bash, one node).
- Not a benchmark or a timing tool: no wall-clock claim, no ops per second.
- Not a byte counter in `allocation-diff`: it reports young-GC event counts, never allocated bytes. `alloc-per-op` counts
  on-heap bytes of one synchronous lane in the main isolate, and nothing off-heap.
- Not a Windows tool: six of the seven need bash and a POSIX userland (`alloc-per-op` needs node >= 22 only; CI does not run Windows).
- Not a security boundary: the driver runs with your privileges.

---

## Ecosystem

Part of the `@zakkster` micro-library suite. `inlining-budget-diff` is also vendored by lite-signal, whose
`Signal.js` / `Watch.js` shape its ref and file modes follow.

---

## License

MIT (c) Zahary Shinikchiev
