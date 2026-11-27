// Unsettled top-level await with NO active handle -> Node exits immediately with code 13 -> NO-VERDICT
await new Promise(() => {});
export const ok = 1;
