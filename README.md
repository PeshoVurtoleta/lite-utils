# @zakkster/lite-utils

> Five standalone bash tools that compare two JS builds through V8's own traces -- bytecode length, deopts, inline
> caches, inlining decisions, young-GC counts -- with a fail-closed SAME / DIFF / NO-VERDICT verdict.

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-utils.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-utils)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

## The V8 diff kit the ecosystem was missing

You changed a hot function. Did its bytecode grow? Did it start to deopt? Did an inline cache go megamorphic? Did
TurboFan stop inlining a callee? Did it start to trigger young-generation GCs? Each of these is a question V8 will
answer in its own trace output, but reading two traces by eye does not scale and a flaky comparison is worse than none.

`lite-utils` is five self-contained bash scripts, one per question. Each one runs your driver file on ONE node binary,
under V8 trace flags, reduces the trace to a normalized multiset, compares it between two builds, and ends with a
`VERDICT` line and an exit code. Anything it cannot establish is `NO-VERDICT` (exit 2), never a guess.

Install (the package is not published yet: version 0.0.0, first release 1.0.0), three ways:

```bash
# 1. from the npm registry
npm i -D @zakkster/lite-utils

# 2. straight from the git repository (an instruction; it works once the repository is public)
npm i -D git+https://github.com/PeshoVurtoleta/lite-utils.git

# 3. copy one root script into your project and run it with bash (a root never sources anything at run time)
cp node_modules/@zakkster/lite-utils/bytecode-budget.sh tools/ && bash tools/bytecode-budget.sh -h
```

After an npm install the five commands are `allocation-diff`, `bytecode-budget`, `deopt-diff`, `ic-diff` and
`inlining-budget-diff`, run as `./node_modules/.bin/<name>` or `npx <name>`.

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
trace, compare the two builds as an order-free multiset, and repeat the runs so that any run-to-run change is
caught by a null control and reported as `NO-VERDICT` instead of a false `DIFF`. They are plain bash plus POSIX
awk, with no runtime dependency, so a script can be copied into any repository.

---

## What you get

| Tool | Question | Modes | Verdict words | Tier |
|------|----------|-------|---------------|------|
| `bytecode-budget` | How long is the bytecode of these functions? | report, gate (`--max`), `--diff` (driver, ref, file) | REPORTED / WITHIN / OVER; SAME / DIFF; NO-VERDICT | DETERMINISTIC |
| `deopt-diff` | Which deopts did these functions have, before vs after? | driver, ref, file, `--self-test` | SAME / DIFF / NO-VERDICT | STATISTICAL on a user driver |
| `ic-diff` | In which state did their inline-cache sites end? | driver | SAME / DIFF / NO-VERDICT | STATISTICAL on a user driver |
| `inlining-budget-diff` | Which inlining decisions did TurboFan and Maglev make? | driver (ref / file: lite-signal shaped) | SAME / DIFF / NO-VERDICT | STATISTICAL (budget report: REPORTED) |
| `allocation-diff` | How many young-generation GCs in a marked window? | diff, `--zero` gate | SAME / DIFF; ZERO / NONZERO; NO-VERDICT | script logic DETERMINISTIC; user verdict STATISTICAL |

The tiers are the suite's verification tiers. DETERMINISTIC: the result does not depend on timing and is gated in
`npm test`. STATISTICAL: the result follows tier-up and GC timing, so a comparison on your driver is never gated here
and should be run on a quiet host. REPORTED: a table the tool prints, a measurement and not a law.

Every run that reaches a verdict ends in a `VERDICT <v>` line on stdout. Exit codes: 0 = SAME / WITHIN / REPORTED /
ZERO, 1 = DIFF / OVER / NONZERO, 2 = NO-VERDICT or a refused argument.

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
  design, never a wrong verdict (LEDGER #83).

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

- **Exit.** 0 `SAME` / `ZERO`, 1 `DIFF` / `NONZERO`, 2 `NO-VERDICT`.
- **ZERO** means less than one semi-space (1 MB) of young allocation in the window, not zero bytes. The tool pins a
  1 MB semi-space for every run.
- **Driver contract.** The driver marks the window with `fs.writeSync(1, '@@LITE-MARK start\n')` and the matching `end`
  marker, written after warm-up; never use `console.log` or `process.stdout` in the driver, and never make stdout
  non-blocking. A cold window over-reports.
- **Tier.** The script logic is DETERMINISTIC (`--self-test`); a verdict on a user driver is STATISTICAL, and REPORTED
  only (this repository has no statistical host).
- **Not detected.** Young allocation under one semi-space in the window, large-object and old-space allocation, and an
  allocation TurboFan scalar-replaces (that is correctly not an allocation).

---

## CLI reference

Flags shared by the tools (each tool's section above shows its own usage lines; `bash <tool>.sh -h` prints the full
text):

| Flag | Meaning |
|------|---------|
| `--node BIN` | node binary (default `$NODE`, else `node`), resolved ONCE to an absolute path; refused before any spawn if it is not an executable file |
| `--v8-flags STR` | extra V8 flags for every run; a runtime allowlist (V8 flags the node lists in `--v8-options`, minus log / trace / print / prof / perf / dump / snapshot / file flags); node options and the tool's own flags are refused |
| `--out DIR` | keep the report and the raw per-run outputs in DIR |
| `--runs N` | runs per side; run 1 vs runs 2..N is the null control |
| `--self-test` | canned checks (a fake node or canned text) |
| `-h`, `--help` | print the header text and exit 2 |

`-h` exits 2 on all five tools. For `allocation-diff`, `bytecode-budget`, `deopt-diff` and `ic-diff`, `--self-test`
exits 0 when every check is ok and 1 when a check prints a `FAIL` line; that 1 is a failed check and not a `DIFF`.

Defaults and limits:

| Tool | `--runs` default | `--runs` range | Other defaults |
|------|------------------|----------------|----------------|
| `allocation-diff` | 5 | 2..20 | semi-space pinned to 1 MB |
| `bytecode-budget` | 2 | 2..20 | `--max` value N is 1..9 digits |
| `deopt-diff` | 3 | 2..20 | |
| `ic-diff` | 3 | 2..20 | |
| `inlining-budget-diff` | 3 | 2..50 | `--tiers turbo,maglev`; `--fn` `$ME`, else `m0`; `--out` `$OUTDIR`, else `$TMPDIR/inl-diff-<timestamp>` |

Every spawn runs with `NODE_OPTIONS`, `NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE` and `NODE_REDIRECT_WARNINGS` stripped.

Requirements:

- bash >= 3.2 (CI exercises macOS `/bin/bash`).
- A POSIX awk. CI runs the BSD awk of macOS and the awk of `ubuntu-latest`; no other awk is claimed.
- node >= 22 (`engines.node`), with the caveats above: `ic-diff` ends `NO-VERDICT` on node 22 and 24, and the
  maglev tier of `inlining-budget-diff` is `NO-VERDICT` on node 22.
- git, for ref and file modes.
- `sha256sum` or `shasum`.

---

## Composability

One CI job, all five tools. Only `bytecode-budget --max` is a gate: its exit 1 (OVER) or 2 (NO-VERDICT) fails the job.
The other four are statistical, so they report and do not gate: run them with `rc=0; ... || rc=$?`, keep `--out` as a
build artifact, and fail the job only when the `VERDICT` line is missing.

```bash
set -eu
B=./node_modules/.bin
mkdir -p artifacts

# the one gate: a maximum recorded on node v26.8.2; any other node ends NO-VERDICT (exit 2)
"$B/bytecode-budget" --max add=6 --node-version v26.8.2 bench/driver.mjs

# the statistical tools: report, keep the evidence, require a VERDICT line
for tool in deopt-diff ic-diff; do
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

Replace the `--max` value and the node version with values you recorded on that node version.

<details>
<summary>Design notes</summary>

- **Bash only, generated.** Each root script is generated by `build.sh` from `src/` and `lib/` fragments and committed;
  a test fails when a shipped script differs from a fresh build. A root never sources anything at run time, so copying
  one file is a complete install (ROADMAP S-2).
- **What each tool measures.** Bytecode length (`--print-bytecode`), deopt records (`--trace-deopt`), IC sites
  (`--log-ic`), inlining decisions (V8's TurboFan trace and `--trace-maglev-inlining`), young-GC events
  (`--trace-gc` inside a marked window).
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
  never `DIFF`: a comparison that does not reproduce itself says nothing.
- **Counts, not bytes.** `allocation-diff` counts young-GC events; it cannot tell you how many bytes a window
  allocated.
- **The frozen "before".** Ref and file modes refuse a `--before` that is the live, tracked file: comparing a build with
  itself would be a silent `SAME`. Keep the "before" build in a frozen copy or at a git ref.
- **No timing tool.** Timing is noisy and belongs in a statistical host; these tools compare what V8 decided, not how
  long it took.
- **Driver output is trusted.** The tools read V8's trace from the driver's own stdout, so a driver can forge it (see
  Known limits).

---

## Testing

`npm test` runs 3627 tests (node:test), 3613 pass / 0 fail / 14 skip in one local run (2026-11-12,
node v26.8.2, macOS arm64, /bin/bash 3.2.57, host quiet: load1 2.26 at start; a measurement, not a guarantee).

Scripts: `npm test`, `npm run build` (regenerate the five roots from `src/` and `lib/`).

The CI workflow is configured for a matrix of ubuntu-latest and macos-latest on node 22, 24 and 26, plus node 26.8.2
on both. Bash only: LiteUtils is exempt from the suite's `test/torture.mjs` law (ROADMAP S-12); its gates are each
tool's `--self-test` (with `--fixtures` where offered) and `npm test`.

---

## Known limits

- an inherited SHELLOPTS=noexec runs nothing and exits 0; callers must require the VERDICT line, not only the exit code
  (class 2; LEDGER #124).
- Some refusals of a non-path option value (an unknown option, a bad `--fn` / `--v8-flags` / `--runs` / `--max` /
  `--node-version` value, a node binary that is not found) print that raw value, so a CR or newline in it reaches
  stderr; exit 2, no verdict change (LEDGER #126).
- The `--v8-flags` allowlist checks a numeric value's FORM only: `--max-inlined-bytecode-size=NaN` passes, node
  then exits non-zero on every run and the tool ends `NO-VERDICT` (LEDGER #66).
- `ic-diff` ends `NO-VERDICT` on node 22 and 24, by design (LEDGER #83).
- A refusal can print a name that git or readlink resolved; a newline or CR in such a name, behind a symlink with a
  clean name, reaches stderr inside that one refusal (exit 2; the last line is still `VERDICT NO-VERDICT`)
  (LEDGER #122).
- `NODE_NO_WARNINGS` is not stripped by `allocation-diff`; a warning-heavy driver can shift the GC count (LEDGER #84).
- `inlining-budget-diff` leaves its `--out` directory behind after a refusal, and a rerun on a non-empty one is refused:
  use a fresh `--out` (LEDGER #76, #80).
- In `inlining-budget-diff` file and ref mode the null-control NOTE is decided on `Signal.js` alone; a differing
  `Watch.js` prints the NOTE and then `DIFF`. The verdict is right; the NOTE is wrong (LEDGER #123).
- Driver output is trusted: a driver that prints V8 trace text, or bare number lines, can forge a result; a Worker
  writing while V8 prints can tear a record, which ends `NO-VERDICT` (LEDGER #72, #92).
- a hard link to `--before` elsewhere in the repository (outside `--before`'s directory and below), or under a case-only
  sibling name on a case-sensitive file system, can stay undetected (LEDGER #71, #88, #89)
- These tools are not a security boundary: they run the driver you give them.

---

## What this is not

- Not a JavaScript API: there is nothing to import. These are command-line scripts.
- Not a benchmark or a timing tool: no wall-clock claim, no ops per second.
- Not a byte counter: `allocation-diff` reports young-GC event counts, never allocated bytes.
- Not a Windows tool: it needs bash and a POSIX userland.
- Not a security boundary: the driver runs with your privileges.

---

## Ecosystem

Part of the `@zakkster` micro-library suite. `inlining-budget-diff` is also vendored by lite-signal, whose
`Signal.js` / `Watch.js` shape its ref and file modes follow.

---

## License

MIT (c) Zahary Shinikchiev
