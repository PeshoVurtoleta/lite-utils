// Case 2: Object.preventExtensions(Object.prototype) only; no descriptor changes. Honest: DIRTY.
Object.preventExtensions(Object.prototype);
export const ok = 1;
