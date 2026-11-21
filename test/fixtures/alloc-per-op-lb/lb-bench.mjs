// lb-bench: the LiteBisect shape row's BENCH (SPEC-alloc-per-op.md G3 TASK 8, C-26 path), read by
// test/alloc-per-op-lb.test.mjs. Lane names are dotted as LiteBisect's test/gates/alloc-bench.mjs names them.
//   harness.empty  (i) => {} -- LiteBisect's empty harness lane, 0 B/op
//   box.frac       a fractional double stored into an object-elements array: one HeapNumber per op (16 B on Node,
//                  12 B pointer-compressed), so a --max 1 gate FAILS
//   clean.smi      a Smi into a Smi array, 0 B/op; never selected by the row (the --lane filter keeps it out)
const objs = [{}, {}];
const smis = [0, 0];
export const lanes = {
    'harness.empty': (i) => {},
    'box.frac': (i) => { objs[i & 1] = i + 0.5; },
    'clean.smi': (i) => { smis[i & 1] = i; },
};
