// Invalidates the ArrayIteratorLookupChain V8 protector cell
Array.prototype[Symbol.iterator] = function* __ia_iter() {};
export const ok = 1;
