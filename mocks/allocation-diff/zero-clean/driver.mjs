import fs from "node:fs";
const keep = new Int32Array(1024);
function hot(i) { return (i + 1) | 0; }
for (let i = 0; i < 20000; i++) keep[i & 1023] = hot(i);
fs.writeSync(1, "@@LITE-MARK start\n");
for (let i = 0; i < 300000; i++) keep[i & 1023] = hot(i);
fs.writeSync(1, "@@LITE-MARK end\n");
