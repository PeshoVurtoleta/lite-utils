// Case 4: same value, new attributes: parseInt becomes non-writable. Honest: DIRTY (G changed parseInt).
Object.defineProperty(globalThis, "parseInt", { writable: false });
export const ok = 1;
