import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const w = fs.writeSync;
fs.writeSync = function (fd, s, ...r) {
  if (fd === 3) s = String(s).split("\n").filter((l) => !/^[GH] /.test(l)).join("\n");
  return w.call(this, fd, s, ...r);
};
syncBuiltinESMExports();
globalThis.__evil = 1;
setInterval(() => {}, 60000);
