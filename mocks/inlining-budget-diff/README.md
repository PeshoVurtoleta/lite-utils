# `mocks/inlining-budget-diff/` -- inlining-budget-diff.sh (10 cases)

TurboFan and Maglev inlining decision diff.

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool inlining-budget-diff
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-pathlen` | `aa` | A/A identical driver in short vs long directory (IB-S1) | inlining-budget-diff -h: byte-identical drivers across different path lengths read SAME with guard evidence | `SAME (v22:NO-VERDICT)` |
| `callee-grew-not-inlined` | `change` | callee grew past max-inlined bytecode limit (IB-C1) | inlining-budget-diff -h: callee no longer inlined when it crosses max-inlined-bytecode-size -> DIFF | `DIFF (v22:NO-VERDICT)` |
| `callee-shrank-inlined` | `change` | callee shrank under max-inlined bytecode limit (IB-C2) | inlining-budget-diff -h: callee newly inlined after shrinking below limit -> DIFF | `DIFF (v22:NO-VERDICT)` |
| `file-mode-grew` | `change` | frozen-file mode (--before/--after --driver importing ./Signal.js) (11.A A8) | inlining-budget-diff -h: file mode stages frozen --before/--after beside --driver importing ./Signal.js -> DIFF | `DIFF` |
| `limit-node22-maglev` | `limit` | Node 22 default tiers lack Maglev inlining trace (IB-L1) | inlining-budget-diff README: default tiers on node 22 read NO-VERDICT for maglev; use --tiers turbo on 22 | `SAME (v22:NO-VERDICT)` |
| `lowered-budget-flag` | `change` | --v8-flags lowered max-inlined-bytecode-size separates tiny vs medium callee (IB-C4) | inlining-budget-diff -h: --v8-flags tuning applies to both sides and gates inlining decisions -> DIFF | `DIFF` |
| `only-fn-ignores-sibling` | `same` | --only-fn narrows verdict to target compile unit | inlining-budget-diff -h: --only-fn narrows verdict to lines naming --fn or made while compiling --fn -> SAME | `SAME` |
| `turbo-only-tier` | `change` | --tiers turbo compares TurboFan inlining across Node 22-27 | inlining-budget-diff -h: --tiers turbo diffs TurboFan inlining decisions on node >= 22 -> DIFF | `DIFF` |
| `two-sites-to-one` | `change` | callee inlined at 2 sites -> 1 site multiset diff (IB-C3) | inlining-budget-diff -h: compared as a multiset, inlined at 2 sites -> 1 site is DIFF | `DIFF (v22:NO-VERDICT)` |
| `unrelated-fn-edit` | `same` | comment and unrelated helper change ignored (IB-S2) | inlining-budget-diff -h: compile units involving no named --fn never enter the verdict -> SAME | `SAME (v22:NO-VERDICT)` |
