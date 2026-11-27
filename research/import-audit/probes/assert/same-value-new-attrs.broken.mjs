// Broken twin of same-value-new-attrs: redefines with the SAME attributes (writable stays true). Premise must FAIL.
Object.defineProperty(globalThis, "parseInt", { writable: true });
export const ok = 1;
