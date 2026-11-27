import fs from "node:fs";
const r = fs.readFileSync;
fs.readFileSync = function (...a) { return r.apply(this, a); };
export const ok = 1;
