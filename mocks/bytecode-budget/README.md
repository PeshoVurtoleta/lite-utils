# `mocks/bytecode-budget/` -- bytecode-budget.sh (14 cases)

Ignition bytecode length diff and --max gate.

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool bytecode-budget
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-copy` | `aa` | A/A identical bytes with non-zero bytecode length | bytecode-budget -h: byte-identical drivers read SAME with identical non-zero length multiset | `SAME` |
| `file-mode-grew` | `change` | frozen-file mode (--before/--after --driver) function grew (11.A A8) | bytecode-budget -h: file mode stages frozen --before and --after modules beside --driver -> DIFF | `DIFF` |
| `gate-over` | `change` | gate --max exceeded (BB-C4 / A1 wide limit) | bytecode-budget -h: length > max -> OVER (prerelease node refused with exit 2) | `OVER (v27:NO-VERDICT)` |
| `gate-within` | `change` | gate --max satisfied (BB-C5 / A1 wide limit) | bytecode-budget -h: every length <= max -> WITHIN (prerelease node refused with exit 2) | `WITHIN (v27:NO-VERDICT)` |
| `grew` | `change` | function bytecode grew (BB-C1) | bytecode-budget -h: length multiset differs when function grows -> DIFF | `DIFF` |
| `guard-lazy-uncalled` | `guard` | lazy uncalled function never compiled (BB-G1) | bytecode-budget -h: a function never compiled (lazy) reads NO-VERDICT | `NO-VERDICT` |
| `guard-node-internal-name` | `guard` | target name collides with node-internal compiled function (BB-G2) | bytecode-budget -h: function name compiled by node itself cannot be distinguished -> NO-VERDICT | `NO-VERDICT` |
| `guard-qualified-name` | `guard` | qualified dotted name refused in --fn (BB-G3) | bytecode-budget -h: qualified function name (Store.read) refused with exit 2 | `NO-VERDICT` |
| `limit-prerelease-gate` | `limit` | prerelease --node-version refused in gate mode (BB-L1) | bytecode-budget -h: release versions only; a prerelease --node-version is refused with exit 2 | `NO-VERDICT` |
| `multiset-count` | `change` | same-name function count changed (BB-C3) | bytecode-budget -h: compared as a multiset, one read -> two read is DIFF | `DIFF` |
| `other-fn-changed` | `same` | unrelated helper grows while target unchanged (BB-S2) | bytecode-budget -h: only named --fn functions enter the verdict -> SAME | `SAME` |
| `rename-local` | `same` | rename local variable and add comments (BB-S1) | bytecode-budget -h: identical bytecode lengths after renaming local / comments -> SAME | `SAME` |
| `same-name-order-swapped` | `same` | order of two same-name functions swapped (BB-S3) | bytecode-budget -h: lengths are compared as an order-free multiset -> SAME | `SAME` |
| `shrank` | `change` | function bytecode shrank (BB-C2) | bytecode-budget -h: length multiset differs when function shrinks -> DIFF | `DIFF` |
