import fs from "node:fs";
import { Worker } from "node:worker_threads";
fs.writeSync(1, "@@LITE-MARK start\n");
await new Promise((res, rej) => {
  const w = new Worker("const k = new Array(1024); for (let i = 0; i < 400000; i++) k[i & 1023] = { a: i, b: i + 1 };", { eval: true });
  w.on("exit", res);
  w.on("error", rej);
});
fs.writeSync(1, "@@LITE-MARK end\n");
