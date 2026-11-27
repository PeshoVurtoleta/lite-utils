const f = Promise.prototype.finally;
Promise.prototype.finally = function (...a) { return f.apply(this, a); };
export const ok = 1;
