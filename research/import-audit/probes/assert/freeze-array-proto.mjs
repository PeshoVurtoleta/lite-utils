// Case 1: freezes Array.prototype for everyone (attributes + extensibility change). Honest: DIRTY.
Object.freeze(Array.prototype);
export const ok = 1;
