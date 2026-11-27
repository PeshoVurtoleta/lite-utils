# `mocks/shape-diff/` -- shape-diff.sh (27 cases)

V8 hidden-class, elements-kind, and field-representation instability diff.

```bash
node mocks/run.mjs --node /opt/homebrew/bin/node --tool shape-diff
```

| Case | Kind | Class | Claim | Expect |
|---|---|---|---|---|
| `aa-pathlen` | `aa` | A/A same bytes in short vs long directory (SD-S2) | shape-diff ROADMAP: identical driver in short vs long path reads SAME with non-zero site evidence | `SAME` |
| `added-class-with-fields` | `limit` | added non-target class with fields reads NO-VERDICT (1.2.0 #146 T-2 / R10) | shape-diff README (#146 T-2): an added non-target class with fields adds a CopyAddDescriptor MAP_REPLACE line -> NO-VERDICT | `NO-VERDICT` |
| `added-fieldless-class` | `same` | added non-target field-less class stays SAME (1.2.0 C-21 / R10) | shape-diff README (#146 / C-21): an added non-target field-less class reads SAME via the MapCreate single-hit rule | `SAME` |
| `ambiguous-two-files` | `guard` | same-named target function across two modules (11.A A8 / SD-neon-3 / M3) | shape-diff README (M3): a --fn name defined at >1 location (same-named fn at another path) -> NO-VERDICT ambiguous | `NO-VERDICT` |
| `cjs-special-path` | `same` | CommonJS driver under a dash-named directory (11.A A8 / SD-neon-6 / C-B1 M9) | shape-diff README (C-B1): a driver under a directory named "-" resolves as ./-/... and runs normally -> SAME | `SAME` |
| `class-instance-fields` | `limit` | targeting --fn <Class> with instance fields reads NO-VERDICT (1.2.0 #146 T-1 / R10) | shape-diff README (#146 T-1): --fn <Class> on a class with instance or static fields reads NO-VERDICT ambiguous target function | `NO-VERDICT` |
| `comment-only` | `same` | comment-only edit shifts line numbers (SD-S1) | shape-diff -h: identical attributed shape-instability multiset despite shifted source lines -> SAME | `SAME` |
| `delete-in-target` | `change` | dictionary mode via delete of non-last property (SD-C2) | shape-diff -h: target map normalization (delete non-last prop -> MAP_NORMALIZE) -> DIFF | `DIFF` |
| `elements-smi-to-double` | `change` | elements kind PACKED_SMI -> PACKED_DOUBLE (SD-C3) | shape-diff -h: attributed elements-kind transition (ELEM) differs -> DIFF | `DIFF` |
| `f1-unrelated-literal` | `same` | MapCreate literal-map cache single-hit drop (SD-S4 / b112 F1) | shape-diff -h (C-21): a reason-MapCreate line with 1 hit in a run is not counted -> SAME | `SAME` |
| `field-add-default` | `same` | normal monomorphic field add ignored in default mode (SD-C7 default) | shape-diff README: normal monomorphic Transition / InitialMap counts are REPORTED by default -> SAME | `SAME` |
| `field-add-transitions` | `change` | normal monomorphic field add gated by --include-transitions (SD-C7 flag) | shape-diff -h: --include-transitions diffs normal monomorphic Transition/InitialMap sites (MAP_TRANSITION) -> DIFF | `DIFF` |
| `file-renamed` | `same` | identical driver under different filename (SD-S3) | shape-diff src/shape-diff.sh: owner tags strip paths so byte-identical renamed drivers read SAME | `SAME` |
| `guard-ambiguous-same-file` | `guard` | same-named target function defined twice in one file (SD-G2) | shape-diff README (M3): target --fn name defined at >1 location in a run -> NO-VERDICT ambiguous target function | `NO-VERDICT` |
| `guard-never-called` | `guard` | target function never called (SD-G1) | shape-diff -h: missing execution evidence for target function -> NO-VERDICT | `NO-VERDICT` |
| `guard-nondeterministic` | `guard` | null control catches run-to-run instability (SD-G3) | shape-diff -h: run 1 vs runs 2..N of the same side must match, else null-control NO-VERDICT | `NO-VERDICT` |
| `guard-worker` | `guard` | Worker thread creates second isolate map log (SD-G4) | shape-diff src/shape-diff.sh: a Worker writes a second isolate map log -> NO-VERDICT another isolate or process logged | `NO-VERDICT` |
| `heapobject-to-tagged` | `change` | field HeapObject -> Tagged generalization (SD-C6) | shape-diff -h: field representation HeapObject -> Tagged generalization (GEN) -> DIFF | `DIFF` |
| `holey-to-dict-elements` | `change` | HOLEY -> DICTIONARY_ELEMENTS sparse index store (SD-C4) | shape-diff -h: transition to DICTIONARY_ELEMENTS (MAP_ELEM_DICT) differs -> DIFF | `DIFF` |
| `limit-cold-push` | `limit` | single cold Array.prototype.push(1.5) blind spot (SD-L1) | shape-diff -h: known limit -- a single cold call to Array.prototype.push(1.5) emits 0 trace lines -> SAME | `SAME` |
| `map-deprecate-ctor` | `change` | constructor map deprecation across instances (SD-C5) | shape-diff -h: constructor field Smi -> Double across instances deprecates map / generalizes field -> DIFF | `DIFF` |
| `packed-to-holey` | `change` | elements kind PACKED_SMI -> HOLEY_SMI (11.A A8) | shape-diff -h: attributed elements-kind transition (PACKED_SMI -> HOLEY_SMI, ELEM) -> DIFF | `DIFF` |
| `reconfigure-attr` | `change` | attribute reconfigure via Object.defineProperty (11.A A8 / SD-neon-2 / M2b) | shape-diff -h (C-22): a target [reconfiguring] line is a RECONF verdict record -> DIFF | `DIFF` |
| `set-prototype-null` | `limit` | Object.setPrototypeOf(o, null) in target (11.A A8 / SD-neon-1) | shape-diff README (C-21 M1 + Owner): Object.setPrototypeOf runs in Builtin:ObjectSetPrototypeOf (MAP_REPLACE in UM), upgrading SAME to NO-VERDICT naming the builtin | `NO-VERDICT` |
| `smi-to-double` | `change` | field Smi -> Double generalization (SD-C1) | shape-diff -h: attributed field-representation generalization (GEN) differs -> DIFF | `DIFF` |
| `teeth-wrong-expect` | `teeth` | runner teeth: deliberately wrong expectation must trip DIFF | PROPOSAL section 5: runner teeth control verifies a real DIFF is caught when SAME is expected | `SAME (teeth_got=DIFF)` |
| `unattr-reflect-delete` | `limit` | external instability via Reflect.deleteProperty upgrades SAME to NO-VERDICT (SD-L2) | shape-diff -h: unattributed/external instability (Reflect.deleteProperty) changed while attributed sites SAME -> NO-VERDICT | `NO-VERDICT` |
