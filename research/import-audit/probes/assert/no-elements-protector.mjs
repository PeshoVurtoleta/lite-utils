// Case 7: indexed property on Array.prototype (NoElements protector). Honest: DIRTY.
Array.prototype[0] = 1;
export const ok = 1;
