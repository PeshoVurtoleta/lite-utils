// A6: top-level await with a ref'd handle that never settles -> genuinely hangs -> killed by --timeout
await new Promise(() => { setInterval(() => {}, 60_000); });
export const ok = 1;
