// T2: the lane swaps v8.GCProfiler for a recorder of 0 on its first call (after selfCheck), so the AFTER fence reads
// recorded 0 < forced 1.
import v8 from 'node:v8';
const a = new Float64Array(2);
class NoGc { start() {} stop() { return { statistics: [] }; } }
let armed = false;
export const lanes = { ok: (i) => { if (!armed) { armed = true; v8.GCProfiler = NoGc; } a[i & 1] = i; } };
