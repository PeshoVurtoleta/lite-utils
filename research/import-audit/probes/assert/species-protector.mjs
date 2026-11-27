// Case 5: redefines Array[Symbol.species] (a constructor property, not on Array.prototype).
// Invalidates the ArraySpeciesLookupChain protector (RESEARCH.md B5). Honest: DIRTY.
Object.defineProperty(Array, Symbol.species, {
  configurable: true,
  get: function __ia_species() { return this; },
});
export const ok = 1;
