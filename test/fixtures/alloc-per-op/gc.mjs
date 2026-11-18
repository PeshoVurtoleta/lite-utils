// A6 gc lane: calls gc() on every 1000th call, so a GC lands inside a window (a VOID).
let c = 0;
export const lanes = { gcl: () => { if (++c % 1000 === 0) globalThis.gc(); } };
