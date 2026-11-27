# `mocks/allocation-diff/` -- allocation-diff.sh (10 cases)

Young-generation GC event count diff and --zero gate.

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool allocation-diff
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-alloc` | `aa` | A/A identical allocating driver with non-zero Scavenges (AD-S1 + A7) | allocation-diff -h: byte-identical allocating drivers read SAME with matching non-zero young GCs | `SAME` |
| `guard-marker-order` | `guard` | end marker written before start marker refused | allocation-diff -h: @@LITE-MARK end before @@LITE-MARK start -> NO-VERDICT | `NO-VERDICT` |
| `guard-missing-end-marker` | `guard` | missing @@LITE-MARK end marker triggers guard (AD-G1) | allocation-diff -h: missing @@LITE-MARK end marker -> NO-VERDICT | `NO-VERDICT` |
| `guard-old-gc` | `guard` | old-generation GC inside window fails closed (AD-G3) | allocation-diff -h: old-generation GC in the window empties young space -> NO-VERDICT | `NO-VERDICT (v22:NO-VERDICT)` |
| `guard-worker-alloc` | `guard` | Worker thread GC lines missed by main-thread guard (AD-G2) | allocation-diff -h: Worker GC lines appear in trace but not guard count -> NO-VERDICT the guard did not count | `NO-VERDICT` |
| `limit-sub-megabyte` | `limit` | allocations below 1 MB semi-space stay invisible (AD-S2) | allocation-diff -h: ZERO / 0 young GC means < 1 semi-space (1 MB), not zero bytes -> SAME | `SAME` |
| `object-escapes` | `change` | escaping object allocation added in window (AD-C1) | allocation-diff -h: young-GC multiset in the marked window differs -> DIFF | `DIFF` |
| `volume-doubled` | `change` | young allocation volume doubled inside window (AD-C4) | allocation-diff -h: differing young-GC counts between before and after -> DIFF | `DIFF` |
| `zero-clean` | `change` | --zero gate passes clean Smi-only Int32Array window as ZERO (AD-C3) | allocation-diff -h: --zero with no young GC in the window in any run -> ZERO | `ZERO` |
| `zero-nonzero` | `change` | --zero gate flags allocating window as NONZERO (AD-C2) | allocation-diff -h: --zero with young GC in the window in every run -> NONZERO | `NONZERO` |
