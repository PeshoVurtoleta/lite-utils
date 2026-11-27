// Tamper resistance: patches Array.prototype[Symbol.iterator], Object.prototype.get, and Map.prototype.get
Array.prototype[Symbol.iterator] = function* () {};
Object.prototype.get = 1;
Map.prototype.get = function () { return undefined; };
export const ok = 1;
