// A5: adds a getter on globalThis that throws/mutates if invoked -- audit must NOT call it
Object.defineProperty(globalThis, "__ia_trap_getter", {
  configurable: true,
  enumerable: true,
  get() {
    globalThis.__ia_getter_was_invoked = true;
    throw new Error("audit invoked getter!");
  },
});
export const ok = 1;
