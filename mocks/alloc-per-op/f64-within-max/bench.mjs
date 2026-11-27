const f = new Float64Array(8);
export const lanes = {
  f64(i) { f[i & 7] = i * 0.5; },
};
