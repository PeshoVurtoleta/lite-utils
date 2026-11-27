// Broken twin of setproto-array-proto: effect removed. Premise must FAIL.
const mid = Object.create(Object.prototype);
export const ok = mid ? 1 : 0;
