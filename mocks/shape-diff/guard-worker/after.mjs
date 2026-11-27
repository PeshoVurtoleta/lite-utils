// Spawns a Worker thread which writes a second isolate-0x*-run.log.
import { Worker } from "node:worker_threads";
function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }
let s = 0;
for (let i = 0; i < 5000; i++) s += mk(i);
await new Promise((res, rej) => {
  const w = new Worker("let x = 1 + 2;", { eval: true });
  w.on("exit", res);
  w.on("error", rej);
});
if (s === -1) console.log(s);
