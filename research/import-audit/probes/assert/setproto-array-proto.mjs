// Case 3: inserts a plain object between Array.prototype and Object.prototype. Honest: DIRTY.
const mid = Object.create(Object.prototype);
Object.setPrototypeOf(Array.prototype, mid);
export const ok = 1;
