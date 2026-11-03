# deopt-diff real-trace fixtures (node v26.8.2)

Verbatim captures (S-9). Nothing in the `.txt` files was edited or truncated.

- Node: v26.8.2 (`node --version`), the node on PATH (Homebrew, `/opt/homebrew/bin/node`)
- Host: Darwin arm64 (`uname -sm`)
- Date: 2026-11-03
- Capture dir: `/private/tmp/dd-fx/node-26.8.2/`, a neutral copy of this directory's `.mjs` files, so no
  home path enters a trace. The verbose `;;; deoptimize at <file:///private/tmp/dd-fx/node-26.8.2/X.mjs:L:C>`
  lines carry that path; a capture from any other dir differs there (and in nothing a record reads).
- Drivers (ESM; `.mjs` so the module type is unambiguous):
  - `deopt.mjs` / `mono.mjs`: `.handoff/evidence/p3-probe/drv-deopt.js` plus MD-18 markers written with
    `fs.writeSync(1, ...)`: `@@LITE-MARK op 2` after the 2 warm calls, `op 3` after `add(5, 6)`, `op 4` at the
    end. `mono.mjs` differs in one line: `add(7, 8)` instead of `add('x', 'y')`. The added
    `import { writeSync } from 'node:fs';` line moves `add` to line 2 (deopt at `deopt.mjs:2:31`).
  - `a-lazy.mjs`, `b-invalidate.mjs`, `c-inlined.mjs`, `d-osr.mjs`, `e-getter.mjs`, `f-marks.mjs`: the p3-probe
    `drv-<name>.js` copied verbatim (cmp-equal). No change was needed: the package is `"type": "module"`, so the
    `.js` originals already ran as ESM; `f-marks` is the only one with an `import`.

## Capture commands (run with cwd = the capture dir)

    env -u NODE_OPTIONS node --allow-natives-syntax --trace-deopt-verbose --trace-opt --no-concurrent-recompilation X.mjs > X.txt 2>&1

for X = deopt, mono, a-lazy, b-invalidate, c-inlined, d-osr, e-getter; `f-marks.mjs sync` (argv `sync`: the
markers go through `fs.writeSync(1, ...)`). Every run exited 0.

## Census (grep only)

Counted with `grep -c` on line-start patterns: MAGLEV = `^\[completed compiling .*(target MAGLEV) - took`,
TURBOFAN_JS = `^\[completed compiling .*(target TURBOFAN_JS) - took`, OSR = `^\[completed compiling .*) OSR - took`,
bailout = `^\[bailout (` (the `[bailout end.` lines are not counted), deopt-at = `;;; deoptimize at` (indented),
marks = `^@@LITE-MARK op`, dep = `^\[marking dependent code`.

| file | bytes | lines | MAGLEV | TURBOFAN_JS | OSR | bailout | deopt-at | marks | dep |
|---|---|---|---|---|---|---|---|---|---|
| deopt.txt | 3112 | 34 | 1 | 1 | 0 | 1 | 1 | 3 | 0 |
| mono.txt | 895 | 9 | 1 | 1 | 0 | 0 | 0 | 3 | 0 |
| a-lazy.txt | 3495 | 37 | 1 | 1 | 0 | 1 | 0 | 0 | 1 |
| b-invalidate.txt | 1026 | 7 | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| c-inlined.txt | 5012 | 55 | 1 | 1 | 0 | 1 | 1 | 0 | 0 |
| d-osr.txt | 709 | 5 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| e-getter.txt | 2969 | 30 | 1 | 1 | 0 | 1 | 1 | 0 | 0 |
| f-marks.txt | 1022 | 16 | 1 | 1 | 0 | 0 | 0 | 10 | 0 |

The functions those lines name:

| file | MAGLEV | TURBOFAN_JS / OSR | bailout (fn@code kind (reason)) | deopt-at / dep | marks (line) |
|---|---|---|---|---|---|
| deopt.txt | isPosixPathSeparator | add | add@TURBOFAN_JS deopt-eager (not a Smi) | deopt.mjs:2:31 | op 2 (4), op 3 (8), op 4 (34) |
| mono.txt | isPosixPathSeparator | add | - | - | op 2 (4), op 3 (8), op 4 (9) |
| a-lazy.txt | isPosixPathSeparator | lazyFn | lazyFn@TURBOFAN_JS deopt-lazy ((unknown)) | dep: SFI lazyFn, dependent prototype chain changed | - |
| b-invalidate.txt | isPosixPathSeparator | offFn | - | dep: SFI offFn, dependent prototype chain changed | - |
| c-inlined.txt | isPosixPathSeparator | outer | outer@TURBOFAN_JS deopt-eager (not a Smi) | c-inlined.mjs:2:33 inlined at c-inlined.mjs:3:31 | - |
| d-osr.txt | isPosixPathSeparator | loopFn (target MAGLEV) OSR | - | - | - |
| e-getter.txt | isPosixPathSeparator | get value | get value@TURBOFAN_JS deopt-eager (out of bounds) | e-getter.mjs:2:86 | - |
| f-marks.txt | isPosixPathSeparator | add | - | - | op 10..50 (4-8), op 60..100 (12-16) |

Placement: in deopt.txt / mono.txt the `add` TURBOFAN_JS triple (marking, compiling, completed) sits between
`op 2` and `op 3`, and deopt.txt's bailout block between `op 3` and `op 4`. In f-marks.txt the `add` triple is
lines 9-11, between `op 50` and `op 60`. Every fixture's only MAGLEV compile is node's internal
`isPosixPathSeparator` (the p3-probe captures, from a longer path, also compiled `normalizeString`): the
node-internal set is not fixed, so a reader selects by the named function, never by counting lines.

## Stability

3 further captures per driver in the same capture dir, whole output masked with
`sed -E 's/0x[0-9a-fA-F]+/A/g; s/took [0-9.]+(, [0-9.]+)* ms/took T ms/'` (p3-probe README), sha256/8: every
capture equals the masked fixture (3/3 each). Masked sha256/8: deopt becee554, mono 0d9f9623, a-lazy 34370ea8,
b-invalidate 8e24dfd6, c-inlined f42f14e7, d-osr 3caaef62, e-getter 7a40e430, f-marks b38b64da.
Log: `.handoff/evidence/p3g4/` (run.sh, run.log, PROVENANCE.txt).
