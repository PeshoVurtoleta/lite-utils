// Case 8 (must-pass, A/A class): only READS lazy globals, writes nothing. Honest: CLEAN.
export const reads = [];
const names = ["navigator", "fetch", "WebSocket", "FormData", "structuredClone",
  "crypto", "performance", "Headers", "Blob"];
let sink = null;
for (let i = 0; i < names.length; i++) {
  sink = globalThis[names[i]];
  reads.push(names[i]);
}
let sub = null;
if (globalThis.crypto) sub = globalThis.crypto.subtle;
reads.push("crypto.subtle");
export const done = sink === undefined && sub === undefined ? 0 : 1;
