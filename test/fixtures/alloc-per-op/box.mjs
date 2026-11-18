// box: one 12 or 16 B object per op (>= 8 B/op on any build).
let keep = null;
export const lanes = { box: (i) => { keep = { v: i }; } };
