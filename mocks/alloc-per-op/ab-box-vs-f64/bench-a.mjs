const f = new Float64Array(8);
export const lanes = { hot(i) { f[i & 7] = i * 0.5; } };
