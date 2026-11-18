// N4: a bench whose setup() calls process.exit(0) (the run never settled: the tool must exit 2).
const a = new Float64Array(2);
export function setup() { process.exit(0); }
export const lanes = { ok: (i) => { a[i & 1] = i; } };
