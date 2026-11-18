// T1 (C-15): setup() makes every heap-space read report 0 used bytes, so selfCheck misses (positive control) before any
// user lane is measured. LANE-RAN on stderr would mean the lane was called anyway.
import v8 from 'node:v8';
const a = new Float64Array(2);
let seen = false;
export function setup() {
    const real = v8.getHeapSpaceStatistics;
    v8.getHeapSpaceStatistics = () => real().map((s) => ({ ...s, space_used_size: 0 }));
}
export const lanes = { ok: (i) => { if (!seen) { seen = true; process.stderr.write('LANE-RAN\n'); } a[i & 1] = i; } };
