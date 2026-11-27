import fs from "node:fs";
const keep = [];
fs.writeSync(1, "@@LITE-MARK start\n");
for (let i = 0; i < 400; i++) keep.push(new Float64Array(65536));
fs.writeSync(1, "@@LITE-MARK end\n");
if (keep.length === -1) console.log(0);
