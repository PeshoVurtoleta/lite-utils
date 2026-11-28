# code-size-diff S-8 live drivers

Each lane is a must-SAME pair (ctrl vs ctrl) plus a must-DIFF pair (ctrl vs diff); a test stages the two sides
as `a/drv.mjs` and `b/drv.mjs`. Every driver prints `done` as its last stdout line and exits 0; a run without
that `done` line is VOID. The tf-* and mg-* drivers end with one read-only PREMISE check (`%ActiveTierIs*` only).

## Drivers and the probe each was designed from (sha256 at 382bbad)

| driver | target | designed from | probe sha256 at 382bbad |
|---|---|---|---|
| tf-ctrl.mjs | natFn | research/code-size-diff/probes/natives-ctrl.mjs | f6ae127f239af6ee5a489aab542566df271b1e15259d64adb1c99903c0dec2c0 |
| tf-diff.mjs | natFn | research/code-size-diff/probes/natives-diff.mjs | 6b6a0c54bc24364341a14fe0ef1290970cab74d594dd4e293e79b4acc5c0b1d0 |
| mg-ctrl.mjs | natFn | research/code-size-diff/probes/natives-ctrl.mjs | f6ae127f239af6ee5a489aab542566df271b1e15259d64adb1c99903c0dec2c0 |
| mg-diff.mjs | natFn | research/code-size-diff/probes/natives-diff.mjs | 6b6a0c54bc24364341a14fe0ef1290970cab74d594dd4e293e79b4acc5c0b1d0 |
| sp-ctrl.mjs | medFn | research/code-size-diff/probes/sparkplug-10x.mjs | 4a939dd4c57611fbe6d5fddaee727c048b6b6d2568847f411d71ba7a78d8da46 |
| sp-diff.mjs | medFn | research/code-size-diff/probes/sparkplug-10x.mjs | 4a939dd4c57611fbe6d5fddaee727c048b6b6d2568847f411d71ba7a78d8da46 |

Changes from the probes: a header comment and the `done` line; tf-* and mg-* add the PREMISE line; mg-* call
`%OptimizeMaglevOnNextCall` instead of `%OptimizeFunctionOnNextCall` (Q-CSD130-S8NAT (a)); *-diff carry a larger
target body. sp-ctrl.mjs is sparkplug-10x.mjs with only those changes.

No shipped driver calls `%NeverOptimizeFunction` (Q-CSD130-NEVEROPT (a), engine strict, lanes adapt): a
never-optimize function's log carries a `code-disable-optimization` event and an unmarked (empty `$9`) bytecode
record, which the tool reads as NO-VERDICT. The sp drivers therefore carry no PREMISE line: medFn tiers on past
Sparkplug (Maglev / TurboFan records follow), so `%ActiveTierIsSparkplug` would be false at the end; the lane's
teeth are the `^` marker in every run log.

## PREMISE lines (printed only when the premise FAILS; a `PREMISE:` line is a case bug, never a verdict)

- tf-ctrl, tf-diff: `PREMISE: natFn is not at TurboFan after %OptimizeFunctionOnNextCall`
- mg-ctrl, mg-diff (only when node major >= 24): `PREMISE: natFn is not at Maglev after %OptimizeMaglevOnNextCall`

## Lane flags (the tool adds `--log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot`)

| lane | pairs | tool argv |
|---|---|---|
| TF | tf-ctrl / tf-ctrl, tf-ctrl / tf-diff | `--fn natFn --v8-flags --allow-natives-syntax` (default tiers) |
| MG | mg-ctrl / mg-ctrl, mg-ctrl / mg-diff | `--fn natFn --tiers maglev --v8-flags --allow-natives-syntax` |
| SP | sp-ctrl / sp-ctrl, sp-ctrl / sp-diff | `--fn medFn --tiers sparkplug --v8-flags "--allow-natives-syntax --no-baseline-batch-compilation"` |

## Marker table (`$9` of `code-creation,JS`, from run-probes section 1) and lane markers

| major | markers |
|---|---|
| 22 | `* ^ ~` |
| 24 | `* *' + +' ^ ~` |
| 26 | `* *' + +' ^ o* o+ ~` |

Lane markers (checked with `'` stripped): TF `*`, MG `+`, SP `^`. On v24 / v26 the TF and MG records read `*'` /
`+'`. On v22.23.5 `%OptimizeMaglevOnNextCall` exists but prints `Maglev is not enabled.` and no `+` record is
written: the MG lane there is the expected NO-VERDICT naming maglev.

## TASK 0 table (20 direct runs per cell, 2026-11-28, darwin-arm64; repro.txt is the machine form)

Target signature = `name:$9:$6` of every target record of `./drv.mjs`. same = runs equal to the modal
signature; marker = runs with the lane marker. 0 VOID and 0 PREMISE lines in every cell. The SP rows are the
sp pair above, run with the lane flags `--allow-natives-syntax --no-baseline-batch-compilation`.

| cell | v22.23.5 | v24.22.3 | v26.8.2 |
|---|---|---|---|
| TF ctrl | 20/20, `*` 20/20: `natFn:~:12 natFn:*:244` | 20/20, `*` 20/20: `natFn:~:12 natFn:*':220` | 20/20, `*` 20/20: `natFn:~:12 natFn:*':220` |
| TF diff | 20/20, `*` 20/20: `natFn:~:63 natFn:*:276` | 20/20, `*` 20/20: `natFn:~:63 natFn:*':244` | 20/20, `*` 20/20: `natFn:~:63 natFn:*':244` |
| MG ctrl | 20/20, `+` 0/20: `natFn:~:12` | 20/20, `+` 20/20: `natFn:~:12 natFn:+':392` | 20/20, `+` 20/20: `natFn:~:12 natFn:+':392` |
| MG diff | 20/20, `+` 0/20: `natFn:~:63` | 20/20, `+` 20/20: `natFn:~:63 natFn:+':464` | 20/20, `+` 20/20: `natFn:~:63 natFn:+':456` |
| SP ctrl | 20/20, `^` 20/20: `medFn:~:68 medFn:^:568 medFn:*:480` | 20/20, `^` 20/20: `medFn:~:68 medFn:^:576 medFn:+':908 medFn:*':448` | 20/20, `^` 20/20: `medFn:~:69 medFn:^:576 medFn:+':900 medFn:*':720` |
| SP diff | 20/20, `^` 20/20: `medFn:~:87 medFn:^:664 medFn:*:508` | 20/20, `^` 20/20: `medFn:~:87 medFn:^:664 medFn:+':1000 medFn:*':476` | 20/20, `^` 20/20: `medFn:~:88 medFn:^:664 medFn:+':976 medFn:*':476` |

Verdict by the frozen rule: every TF and SP cell and the MG cells on 24 / 26 are EXACT (DETERMINISTIC); MG on
v22.23.5 is STATISTICAL (0/20 `+`), recorded as the expected NO-VERDICT. Note: the Sparkplug driver of the first
design (with `%NeverOptimizeFunction`) also showed `^` in 20/20 on all three nodes WITHOUT
`--no-baseline-batch-compilation`, so no flag-off must-fail cell exists on these nodes; the marker teeth are the
synthetic controls of the live test.
