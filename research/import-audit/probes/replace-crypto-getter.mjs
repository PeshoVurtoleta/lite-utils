// A5: replaces an existing globalThis getter with a wrapper returning the SAME value
const orig = Object.getOwnPropertyDescriptor(globalThis, "crypto");
Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  enumerable: orig.enumerable,
  get() { return orig.get.call(this); },
});
export const ok = 1;
