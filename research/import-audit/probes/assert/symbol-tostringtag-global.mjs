// Case 10: defines globalThis[Symbol.toStringTag]. Honest: DIRTY (added, or changed if node already has one).
Object.defineProperty(globalThis, Symbol.toStringTag, {
  value: "ia-fake-tag",
  configurable: true,
});
export const ok = 1;
