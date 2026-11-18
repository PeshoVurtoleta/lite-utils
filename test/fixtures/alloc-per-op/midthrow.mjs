// C-19: a lane that works for 50000 calls, then throws (inside a measured window at --n 100000 --warm 0).
let c = 0;
const a = new Float64Array(2);
export const lanes = { midthrow: (i) => { if (++c === 50000) throw new Error('boom-mid'); a[i & 1] = i; } };
