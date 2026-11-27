// A1 (R2-L1-1): replaces an existing watched prototype method (same key set, new function)
const origMap = Array.prototype.map;
Array.prototype.map = function __ia_map(fn, thisArg) {
  return origMap.call(this, fn, thisArg);
};
export const ok = 1;
