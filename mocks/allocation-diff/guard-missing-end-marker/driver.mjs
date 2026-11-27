import fs from "node:fs";
fs.writeSync(1, "@@LITE-MARK start\n");
const a = [1, 2, 3];
if (a.length === -1) console.log(0);
