const sink = new Array(2);
export const lanes = {
  box(i) { sink[i & 1] = { v: i, w: i + 1 }; },
};
