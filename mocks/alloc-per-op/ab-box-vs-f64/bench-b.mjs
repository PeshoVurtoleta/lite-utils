const sink = new Array(2);
export const lanes = { hot(i) { sink[i & 1] = { v: i, w: i + 1 }; } };
