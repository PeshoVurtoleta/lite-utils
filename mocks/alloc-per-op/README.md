# `mocks/alloc-per-op/` -- alloc-per-op.mjs (10 cases)

Steady-state on-heap bytes per op gate (--max) and A/B (--tol).

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool alloc-per-op
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-box` | `aa` | A/A identical boxing lanes with non-zero peak B/op (11.A A7) | PROPOSAL 11.A A7: A/A twin compares two identical non-zero boxing lanes (never 0 \| 0) -> SAME | `SAME` |
| `ab-box-vs-f64` | `change` | A/B diff between boxing lane and zero-alloc lane (AP-C3) | alloc-per-op -h: A/B --tol when peak delta exceeds tolerance -> DIFF | `DIFF` |
| `ab-identical-f64` | `same` | A/B identical zero-alloc benches read SAME (AP-C4) | alloc-per-op -h: identical benches within --tol -> SAME | `SAME` |
| `ab-only-a` | `change` | A/B lane present only in bench A (AP-C5 / RISK-3) | alloc-per-op -h: lane present only in A prints ONLY-A row and exits 1 (top-level A/B summary DIFF) | `DIFF` |
| `box-over-max` | `change` | boxing lane exceeds --max gate (AP-C1) | alloc-per-op -h: peak B/op above --max + hi -> FAIL | `FAIL` |
| `f64-within-max` | `change` | zero-alloc Float64Array lane passes --max gate (AP-C2) | alloc-per-op -h: peak B/op + lo <= --max -> PASS | `PASS` |
| `guard-async-lane` | `guard` | async lane function is refused (AP-G2) | alloc-per-op -h: an async lane is refused because lanes must be plain synchronous functions -> NO-VERDICT | `NO-VERDICT` |
| `guard-return-value` | `guard` | lane returning a value is refused (AP-G1) | alloc-per-op -h: a lane that returns a value is refused -> NO-VERDICT | `NO-VERDICT` |
| `limit-elided-alloc` | `limit` | dropped non-escaping allocation elided by V8 reads PASS (AP-L1) | alloc-per-op -h: known limit -- a dropped allocation may be elided by V8 and read 0 B/op -> PASS | `PASS` |
| `limit-void-newspace` | `limit` | lane exceeding new space per sub-window triggers VOID NO-VERDICT (AP-L2) | alloc-per-op -h: a GC inside a sub-window VOIDs it -> NO VERDICT, never FAIL | `NO-VERDICT` |
