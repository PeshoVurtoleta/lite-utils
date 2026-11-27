// Case 12: Array.prototype[Symbol.isConcatSpreadable] = false (IsConcatSpreadableLookupChain). Honest: DIRTY.
Array.prototype[Symbol.isConcatSpreadable] = false;
export const ok = 1;
