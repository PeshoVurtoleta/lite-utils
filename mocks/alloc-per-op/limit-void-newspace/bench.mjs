const sink = new Array(2);
export const lanes = {
  big(i) { sink[i & 1] = new Array(64).fill(i); },
};
