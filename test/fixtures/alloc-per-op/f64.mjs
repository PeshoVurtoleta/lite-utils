// f64: a Float64Array store, 0 B/op.
const a = new Float64Array(2);
export const lanes = { f64: (i) => { a[i & 1] = i + 0.5; } };
