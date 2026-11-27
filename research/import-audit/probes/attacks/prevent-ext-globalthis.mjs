// globalThis made non-extensible: every later global add by anyone now fails.
Object.preventExtensions(globalThis);
export const ok = 1;
