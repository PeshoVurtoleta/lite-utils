// A2 (R2-L1-2): adds a Symbol-keyed property to a watched prototype
Array.prototype[Symbol.for("lite.ia.sym")] = 1;
export const ok = 1;
