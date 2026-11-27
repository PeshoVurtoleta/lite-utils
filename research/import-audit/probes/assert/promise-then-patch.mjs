// Case 6: replaces Promise.prototype.then with a wrapper that calls the original. Honest: DIRTY.
const origThen = Promise.prototype.then;
Promise.prototype.then = function __ia_then(a, b) {
  return origThen.call(this, a, b);
};
export const ok = 1;
