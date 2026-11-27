# `mocks/deopt-diff/` -- deopt-diff.sh (12 cases)

V8 deoptimization multiset diff (natives-forced determinism).

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool deopt-diff
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-deopt` | `aa` | A/A identical deopting driver with non-zero deopt evidence (DD-S1) | deopt-diff -h: identical deopting drivers read SAME with matching non-zero deopt count | `SAME` |
| `aa-mono` | `same` | clean monomorphic optimized pair reads SAME | deopt-diff -h: optimized target with 0 deopts on both sides -> SAME | `SAME` |
| `deopt-removed` | `change` | existing eager deopt removed (DD-C2) | deopt-diff -h: removing a deopt record in after -> DIFF naming reason | `DIFF` |
| `file-mode-deopt` | `change` | frozen-file mode (--before/--after --driver) new deopt (11.A A8) | deopt-diff -h: file mode stages frozen --before and --after modules beside --driver -> DIFF | `DIFF` |
| `getter-deopt` | `change` | two-word getter name (--fn "get value") deopt detected | deopt-diff -h: supports two-word accessor names like "get value" -> DIFF | `DIFF` |
| `guard-never-optimized` | `guard` | target never optimized triggers guard (DD-G1) | deopt-diff -h: function never compiled by Maglev or TurboFan -> NO-VERDICT | `NO-VERDICT` |
| `inlined-callee-deopt` | `change` | deopt inside inlined callee charged to caller (DD-C5) | deopt-diff -h: a deopt of an inlined callee counts for the caller named on the bailout line -> DIFF | `DIFF` |
| `lazy-deopt` | `change` | lazy deopt triggered while optimized caller is on stack (DD-C6) | deopt-diff -h: lazy deopt record differs between before and after -> DIFF | `DIFF` |
| `new-deopt` | `change` | new eager deopt introduced (DD-C1) | deopt-diff -h: a new deopt record in after only -> DIFF naming reason | `DIFF` |
| `off-stack-invalidation` | `limit` | dependency invalidation while function is off-stack is not a deopt record (DD-S3) | deopt-diff -h: dependency invalidation off-stack ([marking dependent code], no bailout line) is not a deopt record -> SAME | `SAME` |
| `reason-changed` | `change` | deopt reason changes from Smi check to out-of-bounds (DD-C3) | deopt-diff -h: deopt reason is part of the multiset key -> DIFF | `DIFF` |
| `tier-section-markers-only` | `same` | REPORTED tier-section op marker spacing differs -> SAME (DD-S2) | deopt-diff -h: tier section is REPORTED only and never moves the verdict -> SAME | `SAME` |
