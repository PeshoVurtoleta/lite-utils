// Case 11: starts a worker thread that stays alive ~1.5 s and is never terminated. Honest: DIRTY (open handle).
import { Worker } from "node:worker_threads";
export const w = new Worker("setTimeout(function () {}, 1500);", { eval: true });
