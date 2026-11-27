import fs from "node:fs";
const keep = new Array(1024);
function hot(i) { return { a: i, b: i + 1 }; }
for (let i = 0; i < 20000; i++) keep[i & 1023] = hot(i);
fs.writeSync(1, "@@LITE-MARK start\n");
for (let i = 0; i < 600000; i++) keep[i & 1023] = hot(i);
fs.writeSync(1, "@@LITE-MARK end\n");
