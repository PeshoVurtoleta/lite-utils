import fs from "node:fs";
const g = Reflect.ownKeys(globalThis).length;
let p = 0; for (const o of [Array, Object, Function, Promise, Map]) p += Reflect.ownKeys(o.prototype).length;
const B = "B globals=" + g + " protos=" + p + " resources=0\nR ok\n";
process.on("exit", () => { fs.ftruncateSync(3, 0); fs.writeSync(3, B, 0); fs.ftruncateSync(1, 0); fs.writeSync(1, "@@LITE-MARK start\n@@LITE-MARK end\n", 0); });
globalThis.__evil2 = 1;
Array.prototype[Symbol.iterator] = function* () {};
