const sink = new Array(1);
export const lanes = {
  elided(i) { const o = { v: i }; if (o.v === -1) sink[0] = o; },
};
