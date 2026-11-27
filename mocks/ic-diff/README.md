# `mocks/ic-diff/` -- ic-diff.sh (10 cases)

Inline-cache final state multiset diff (Node >= 26).

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool ic-diff
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-mono` | `aa` | A/A identical monomorphic driver with non-zero IC evidence | ic-diff -h: byte-identical drivers read SAME with matching non-zero IC site count | `SAME (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `code-moved` | `same` | comments and shifted line numbers normalized (IC-S1) | ic-diff -h: line:col is not part of the verdict key so shifted code reads SAME | `SAME (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `guard-never-called` | `guard` | target function never called has no IC site (IC-G2) | ic-diff -h: no IC site of fn -> NO-VERDICT | `NO-VERDICT (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `keyed-store-grow` | `change` | KeyedStoreIC in-bounds store vs growing past end (IC-C4) | ic-diff -h: KeyedStoreIC growing store differs from in-bounds store -> DIFF | `DIFF (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `limit-no-feedback-vector` | `limit` | too few calls without --no-lazy-feedback-allocation logs no LoadIC (IC-L2) | ic-diff -h: a LoadIC site in a fn with no feedback vector logs no line -> NO-VERDICT | `NO-VERDICT (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `limit-swapped-sites` | `limit` | two same-key IC sites swapping mono/poly states reads SAME (IC-L1) | ic-diff -h: not detected -- two sites of fn that swap states (key has no line:col) read SAME | `SAME (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `load-to-store-kind` | `change` | IC kind changed from LoadIC to StoreIC (IC-C5) | ic-diff -h: IC kind (LoadIC vs StoreIC) is part of the verdict key -> DIFF | `DIFF (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `mono-to-poly` | `change` | LoadIC monomorphic -> polymorphic (IC-C1) | ic-diff -h: per-fn multiset of final IC states; 1 -> P is DIFF | `DIFF (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `new-ic-site` | `change` | additional LoadIC property access site added (IC-C3) | ic-diff -h: adding a new IC site changes the multiset -> DIFF | `DIFF (v22:NO-VERDICT, v24:NO-VERDICT)` |
| `poly-to-mega` | `change` | LoadIC polymorphic -> megamorphic (IC-C2) | ic-diff -h: polymorphic (P) -> megamorphic (N) is DIFF | `DIFF (v22:NO-VERDICT, v24:NO-VERDICT, v27:NO-VERDICT)` |
