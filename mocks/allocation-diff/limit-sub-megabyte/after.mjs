import fs from "node:fs";
const keep = new Array(256);
for (let i = 0; i < 2000; i++) keep[i & 255] = { a: i };
fs.writeSync(1, "@@LITE-MARK start\n");
for (let i = 0; i < 200; i++) keep[i & 255] = { a: i };
fs.writeSync(1, "@@LITE-MARK end\n");
