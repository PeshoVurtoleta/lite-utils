#!/usr/bin/env node
// alloc-per-op.mjs -- steady-state on-heap bytes per op of a synchronous lane (main isolate), LiteUtils.
// Engine (G1): paired S2 brackets (space_used_size of the four SPACES around one drive), the band4 sandwich
// (twin z1, measured r, twin z2; accept iff z1 === z2 and no per-space delta < 0; a GC VOIDs), PEAK = max of
// windows 1..K-1, and the Q-AP-BAND (a) refusal band. Importing this file has no side effects.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import v8 from 'node:v8';

// :CONSTANTS
// FROZEN by SPEC S-A36 (CI run 43691163080, 8/8 legs, ci-report VERDICT PASS). A change is a re-pin (SPEC C-5).
export const BAND_LO_B = 32;
export const BAND_HI_FIXED_B = 524288;
export const BAND_HI_REL = 0.001;
export const RETRY_MAX = 3;
export const POS_MIN_BPO = 8;
export const ISOLATE = 'main';
export const SPACES = Object.freeze(['new_space', 'old_space', 'large_object_space', 'new_large_object_space']);

// :needEnv
// Cold. Refuses an unverified host before any lane call: no gc, no fence, no S2 reader, or a SPACES name missing
// from the listing (a missing space never reads 0). `listing` defaults to a fresh v8.getHeapSpaceStatistics().
export function needEnv(listing) {
    if (typeof globalThis.gc !== 'function') {
        throw new Error('alloc-per-op: globalThis.gc is missing; run node with --expose-gc');
    }
    if (typeof v8.GCProfiler !== 'function') {
        throw new Error('alloc-per-op: v8.GCProfiler is missing; the GC fence cannot be verified on this node');
    }
    if (typeof v8.getHeapSpaceStatistics !== 'function') {
        throw new Error('alloc-per-op: v8.getHeapSpaceStatistics is missing; the S2 signal cannot be read on this node');
    }
    const list = listing === undefined ? v8.getHeapSpaceStatistics() : listing;
    if (!Array.isArray(list)) throw new TypeError('alloc-per-op: heap space listing is not an array');
    const missing = [];
    for (let j = 0; j < SPACES.length; j++) {
        let found = false;
        for (let k = 0; k < list.length; k++) {
            const sp = list[k];
            if (sp !== null && typeof sp === 'object' && sp.space_name === SPACES[j]) { found = true; break; }
        }
        if (!found) missing.push(SPACES[j]);
    }
    if (missing.length !== 0) {
        throw new Error('alloc-per-op: heap space(s) missing: ' + missing.join(', ') +
            ' (refused; a missing space never reads 0)');
    }
}

// :makeDriver
// A driver with a UNIQUE source, so V8's eval cache cannot hand two lanes one feedback vector (monomorphic fn(i)).
// DRIVER_SEQ is a live ESM binding: +1 per driver built.
export let DRIVER_SEQ = 0;
export function makeDriver() {
    return new Function('fn', 'n', 'for (let i = 0; i < n; i++) fn(i);\n// alloc-per-op driver ' + (++DRIVER_SEQ));
}

// :bracketS2
// HOT. Method copied from research r5-band.mjs sub() (NAMES -> SPACES): minor sync gc, GCProfiler fence, S2 read,
// drive, S2 read. Nothing but drive(fn, m) runs between the reads; no test branch (tests inject a whole bracket).
// Returns the fence's GC count (a Smi); per-space deltas go to D (Float64Array(4)).
const S2_A = new Float64Array(4), S2_B = new Float64Array(4);
function readS(dst) {
    dst[0] = dst[1] = dst[2] = dst[3] = 0;
    for (const sp of v8.getHeapSpaceStatistics()) { const j = SPACES.indexOf(sp.space_name); if (j >= 0) dst[j] = sp.space_used_size; }
}
export function bracketS2(fn, drive, m, D) {
    gc({ type: 'minor', execution: 'sync' });
    const p = new v8.GCProfiler();
    p.start();
    readS(S2_A);
    drive(fn, m);
    readS(S2_B);
    const g = p.stop().statistics.length;
    for (let j = 0; j < 4; j++) D[j] = S2_B[j] - S2_A[j];
    return g;
}

// :sandwich
// One sub-window: per attempt ALWAYS three brackets (twin z1 at m = 0, measured r at m = sub, twin z2 at m = 0).
// Any GC in the attempt -> VOID at once (return 0; OUT untouched; the attempt is not counted). z1 === z2 and no
// per-space delta < 0 (NaN counts as negative: fail closed) -> OUT[0] += r - z1, return 1. Otherwise ST[0] += 1 and
// re-run (a retry calls the lane again), at most RETRY_MAX re-runs; all rejected -> VOID (ST +4, 12 brackets).
// z1 / r / z2 live in a module Float64Array, the GC count and the negative flag are Smis.
const SW_Z = new Float64Array(3);
export function sandwich(fn, drive, sub, bracket, D, OUT, ST) {
    for (let t = 0; t <= RETRY_MAX; t++) {
        let g = bracket(fn, drive, 0, D);
        SW_Z[0] = D[0] + D[1] + D[2] + D[3];
        let neg = (D[0] >= 0 && D[1] >= 0 && D[2] >= 0 && D[3] >= 0) ? 0 : 1;
        g += bracket(fn, drive, sub, D);
        SW_Z[1] = D[0] + D[1] + D[2] + D[3];
        if (!(D[0] >= 0 && D[1] >= 0 && D[2] >= 0 && D[3] >= 0)) neg = 1;
        g += bracket(fn, drive, 0, D);
        SW_Z[2] = D[0] + D[1] + D[2] + D[3];
        if (!(D[0] >= 0 && D[1] >= 0 && D[2] >= 0 && D[3] >= 0)) neg = 1;
        if (g !== 0) return 0;
        if (SW_Z[0] === SW_Z[2] && neg === 0) {
            OUT[0] += SW_Z[1] - SW_Z[0];
            return 1;
        }
        ST[0] += 1;
    }
    return 0;
}

// :windowOf
// One window of n ops: n / sub sandwiches, ALL of them even after a VOID (the lane runs the planned number of times
// plus retries). Returns the VOID sub-window count (Smi); the window sum is WIN_OUT[0], its retries WIN_ST[0].
const WIN_D = new Float64Array(4), WIN_OUT = new Float64Array(1), WIN_ST = new Int32Array(1);
export function windowOf(fn, drive, n, sub, bracket) {
    WIN_OUT[0] = 0;
    WIN_ST[0] = 0;
    const subs = n / sub;
    let voids = 0;
    for (let s = 0; s < subs; s++) voids += 1 - sandwich(fn, drive, sub, bracket, WIN_D, WIN_OUT, WIN_ST);
    return voids;
}

// :measureLane
// Cold driver of one lane. Order: needEnv; allowlist a plain function (AsyncFunction / generator kinds refused
// before any call); argument bounds; fn(0) once (a thenable is refused, its rejection handled); then a fresh
// driver, `warm` ops, and per window gc() + windowOf. A VOID window is null, never 0.
const SMI_SAFE = 0x3FFFFFFF;
// n / sub <= SUBS_MAX: G2's bound (SPEC G2 TASK 1); keeps a window's retry count (WIN_ST, Int32Array) far from 2^31.
const SUBS_MAX = 10000;
function argText(x) { return typeof x === 'number' ? String(x) : '(' + typeof x + ')'; }
// Returns '' when every argument is in range, else the failing argument(s), each named with its value.
function laneArgsOk(n, windows, warm, sub) {
    const bad = [];
    const nOk = Number.isInteger(n) && n >= 1 && n <= SMI_SAFE;
    const subOk = Number.isInteger(sub) && sub >= 1 && sub <= SMI_SAFE;
    if (!nOk) bad.push('n = ' + argText(n) + ' is not an integer in [1, ' + SMI_SAFE + ']');
    if (!subOk) bad.push('sub = ' + argText(sub) + ' is not an integer in [1, ' + SMI_SAFE + ']');
    if (nOk && subOk) {
        if (n % sub !== 0) bad.push('n % sub = ' + (n % sub) + ' (n must be a multiple of sub)');
        else if (!(n / sub <= SUBS_MAX)) bad.push('n / sub = ' + (n / sub) + ' > ' + SUBS_MAX);
    }
    if (!(Number.isInteger(windows) && windows >= 3 && windows <= SMI_SAFE)) {
        bad.push('windows = ' + argText(windows) + ' is not an integer in [3, ' + SMI_SAFE + ']');
    }
    if (!(Number.isInteger(warm) && warm >= 0 && warm <= SMI_SAFE)) {
        bad.push('warm = ' + argText(warm) + ' is not an integer in [0, ' + SMI_SAFE + ']');
    }
    return bad.join('; ');
}
function isThenable(x) {
    return ((typeof x === 'object' && x !== null) || typeof x === 'function') && typeof x.then === 'function';
}
export function measureLane(fn, n, windows, warm, sub, bracket = bracketS2) {
    needEnv();
    const kind = Object.prototype.toString.call(fn);
    if (kind !== '[object Function]') {
        throw new TypeError('alloc-per-op: a lane must be a plain synchronous function (got ' + kind +
            '); async and generator functions are refused');
    }
    if (typeof bracket !== 'function') throw new TypeError('alloc-per-op: bracket is not a function');
    const argsBad = laneArgsOk(n, windows, warm, sub);
    if (argsBad !== '') throw new RangeError('alloc-per-op: measureLane: ' + argsBad);
    const r0 = fn(0);
    if (isThenable(r0)) {
        try { r0.then(null, () => {}); } catch { /* the refusal below is the answer */ }
        throw new TypeError('alloc-per-op: the lane returned a thenable (an async lane); refused, a lane must be synchronous');
    }
    const drive = makeDriver();
    drive(fn, warm);
    const out = [];
    let retries = 0;
    for (let w = 0; w < windows; w++) {
        gc();
        const v = windowOf(fn, drive, n, sub, bracket);
        out.push(v !== 0 ? null : WIN_OUT[0] / n);
        retries += WIN_ST[0];
    }
    const s = summarize(out);
    return { windows: out, peak: s.peak, mean: s.mean, retries, voids: s.voids, voidAt: s.voidAt };
}

// :summarize
// peak = max, mean = average over windows 1..K-1 (any null or non-finite there makes BOTH null; fewer than 2
// windows gives null); voids = null count over ALL windows (window 0 included); voidAt = first null index, else -1.
export function summarize(w) {
    if (!Array.isArray(w)) throw new TypeError('alloc-per-op: summarize needs an array of windows');
    let voids = 0, voidAt = -1;
    for (let k = 0; k < w.length; k++) {
        if (w[k] === null) { voids++; if (voidAt < 0) voidAt = k; }
    }
    let peak = null, mean = null;
    if (w.length >= 2) {
        let max = -Infinity, sum = 0, ok = true;
        for (let k = 1; k < w.length; k++) {
            const x = w[k];
            if (typeof x !== 'number' || !Number.isFinite(x)) { ok = false; break; }
            if (x > max) max = x;
            sum += x;
        }
        if (ok) { peak = max; mean = sum / (w.length - 1); }
    }
    return { peak, mean, voids, voidAt };
}

// :measureFloor
// The empty lane's row; a fresh lane function per call (its own feedback).
let FLOOR_SEQ = 0;
export function measureFloor(n, windows, warm, sub) {
    const empty = new Function('return (i) => { }; // alloc-per-op floor lane ' + (++FLOOR_SEQ))();
    return measureLane(empty, n, windows, warm, sub);
}

// :bandOf
// The one source of the refusal band (SPEC C-4): lo = BAND_LO_B / sub, hiFixed = BAND_HI_FIXED_B / n, hiRel.
export function bandOf(n, sub) {
    return { lo: BAND_LO_B / sub, hiFixed: BAND_HI_FIXED_B / n, hiRel: BAND_HI_REL };
}

// :gateVerdict
// Q-AP-BAND (a): hi = hiFixed + hiRel x peak; PASS iff peak + lo <= max; FAIL iff peak - hi > max; else NO VERDICT.
// A non-finite peak or max (null, NaN, Infinity, non-number) is NO VERDICT, never 0.
export function gateVerdict(peak, max, band) {
    if (!Number.isFinite(peak) || !Number.isFinite(max)) return 'NO VERDICT';
    const hi = band.hiFixed + band.hiRel * peak;
    if (peak + band.lo <= max) return 'PASS';
    if (peak - hi > max) return 'FAIL';
    return 'NO VERDICT';
}

// :abVerdict
// Q-AP-BAND (a): delta = peakB - peakA; E = lo + hiFixed + hiRel x max(peakA, peakB) (hi at the LARGER peak);
// SAME iff |delta| + E <= tol; DIFF iff |delta| - E > tol; else NO VERDICT. Non-finite input is NO VERDICT.
export function abVerdict(peakA, peakB, tol, band) {
    if (!Number.isFinite(peakA) || !Number.isFinite(peakB) || !Number.isFinite(tol)) return 'NO VERDICT';
    const d = Math.abs(peakB - peakA);
    const e = band.lo + band.hiFixed + band.hiRel * Math.max(peakA, peakB);
    if (d + e <= tol) return 'SAME';
    if (d - e > tol) return 'DIFF';
    return 'NO VERDICT';
}

// :fenceCheck
// FROZEN body (SPEC C-13, S-A36): one forced minor sync gc inside one Profiler start / stop. The contract is
// recorded >= forced (C-12); a Profiler that records nothing is a fence miss, never a pass.
export function fenceCheck(Profiler = v8.GCProfiler) {
    const p = new Profiler();
    p.start();
    gc({ type: 'minor', execution: 'sync' });
    const recorded = p.stop().statistics.length;
    return { forced: 1, recorded };
}

// :selfCheck
// Cold. Measures the positive control (a 16 B box lane), the negative control (the empty lane), then the fence, at the
// caller's cell; ignores --max / --tol. ok iff no VOID and every window finite in BOTH rows (window 0 included, C-11),
// box peak >= POS_MIN_BPO, empty peak in [-lo, hiFixed + hiRel x peak], fence recorded >= forced. A non-finite
// number anywhere is a miss (null is not zero). On a miss the reason STARTS with 'positive', 'negative' or 'fence'.
const SC_KEYS = Object.freeze(['positive', 'negative', 'Profiler']);
function scCheckCtl(ctl) {
    if (ctl === null || typeof ctl !== 'object' || Array.isArray(ctl) ||
        (Object.getPrototypeOf(ctl) !== Object.prototype && Object.getPrototypeOf(ctl) !== null)) {
        throw new TypeError('alloc-per-op: selfCheck controls must be a plain object { positive, negative, Profiler }');
    }
    if (Object.getOwnPropertySymbols(ctl).length !== 0) throw new TypeError('alloc-per-op: selfCheck controls: Symbol keys are refused');
    for (const k of Object.keys(ctl)) {
        if (!SC_KEYS.includes(k)) {
            let hint = '';
            for (const a of SC_KEYS) if (a.toLowerCase().slice(0, 3) === k.toLowerCase().slice(0, 3)) hint = ' (did you mean ' + a + '?)';
            throw new TypeError('alloc-per-op: selfCheck controls: unknown key ' + JSON.stringify(k) + hint +
                '; allowed: ' + SC_KEYS.join(', '));
        }
    }
    for (const k of SC_KEYS) {
        if (!Object.hasOwn(ctl, k) || typeof ctl[k] !== 'function') throw new TypeError('alloc-per-op: selfCheck controls: ' + k + ' is not a function');
    }
}
function scRowMiss(row) {
    if (row === null || typeof row !== 'object' || !Array.isArray(row.windows)) return 'no lane row';
    if (row.voids !== 0) return 'VOID in window ' + row.voidAt + ' (' + row.voids + ' VOID window(s); C-11: a VOID anywhere is a miss)';
    for (let w = 0; w < row.windows.length; w++) {
        const x = row.windows[w];
        if (typeof x !== 'number' || !Number.isFinite(x)) return 'window ' + w + ' is ' + x + ' (not a finite number)';
    }
    if (typeof row.peak !== 'number' || !Number.isFinite(row.peak)) return 'peak is ' + row.peak + ' (not a finite number)';
    return '';
}
export function selfCheck(n, windows, warm, sub, ctl = CONTROLS) {
    needEnv();
    scCheckCtl(ctl);
    const band = bandOf(n, sub);
    const box = measureLane(ctl.positive, n, windows, warm, sub);
    const empty = measureLane(ctl.negative, n, windows, warm, sub);
    const fence = fenceCheck(ctl.Profiler);
    let reason = '';
    let m = scRowMiss(box);
    if (m !== '') reason = 'positive: ' + m;
    else if (!(box.peak >= POS_MIN_BPO)) {
        reason = 'positive: box peak ' + box.peak + ' B/op < POS_MIN_BPO ' + POS_MIN_BPO + ' (the harness does not see a box)';
    }
    if (reason === '') {
        m = scRowMiss(empty);
        if (m !== '') reason = 'negative: ' + m;
        else {
            const hi = band.hiFixed + band.hiRel * empty.peak;
            if (!(empty.peak >= -band.lo && empty.peak <= hi)) {
                reason = 'negative: empty peak ' + empty.peak + ' B/op outside [' + (-band.lo) + ', ' + hi + ']';
            }
        }
    }
    if (reason === '') {
        const rec = fence === null || typeof fence !== 'object' ? undefined : fence.recorded;
        if (typeof rec !== 'number' || !Number.isFinite(rec) || !(rec >= fence.forced)) {
            reason = 'fence: recorded ' + rec + ' < forced ' + (fence && fence.forced) + ' (the GC fence does not see a forced GC)';
        }
    }
    return { ok: reason === '', reason, box, empty, fence, band };
}

// :CONTROLS
// selfCheck's default controls. Built cold at import (two lane functions and the box lane's 2-slot array); nothing
// is measured or driven here. positive: a 16 B HeapNumber box per op (a double stored into a PACKED_ELEMENTS array);
// negative: the empty lane.
function makeBoxLane() {
    const objs = [null, null];
    return (i) => { objs[i & 1] = i + 0.5; };
}
export const CONTROLS = Object.freeze({
    positive: makeBoxLane(),
    negative: (i) => { },
    Profiler: v8.GCProfiler,
});

// :SELF_TEST_LANES
// G1 TASK 6 table, in order. Each row: its cell (n, sub, windows, warm), the gate threshold max, the accepted verdicts
// want, and make(cfg) -> a fresh lane built only when called (C1's 1e5-entry Map never exists at import). cfg is
// the row itself. Truths: f64 store 0 B/op, box 16 B/op (12 B pointer-compressed), C1 ~73.4 B/op peak window, C2 16.
function makeF64Lane() {
    const f64 = new Float64Array(2);
    return (i) => { f64[i & 1] = i + 0.5; };
}
// C1 = research r2-bench/c1-mapchurn.mjs (sha256/8 c648e08d): raw Map churn at C = 1e5, delete the oldest key,
// insert a new one; one table rehash every ~162k ops.
function makeMapChurnLane() {
    const C = 100000;
    const m = new Map();
    for (let k = 0; k < C; k++) m.set(k, k);
    let next = C, oldest = 0;
    return (i) => { m.delete(oldest++); m.set(next++, i); };
}
// C2 = research r2-bench/c2-late3.mjs (sha256/8 0e2dc6b4): f64 stores until call START = 1 + warm + 3n, then one
// 16 B box per op. The counter counts every call (fn(0) once, warm, and the lane calls of retried attempts).
function makeLate3Lane(cfg) {
    const START = 1 + cfg.warm + 3 * cfg.n;
    const objs = [{}, {}];
    const f64 = new Float64Array(2);
    let cnt = 0;
    return (i) => { cnt++; if (cnt > START) objs[cnt & 1] = cnt + 0.5; else f64[cnt & 1] = cnt + 0.5; };
}
function stRow(name, n, max, want, make) {
    return Object.freeze({ name, n, sub: 1e4, windows: 5, warm: 2e5, max, want: Object.freeze(want), make });
}
export const SELF_TEST_LANES = Object.freeze([
    stRow('clean', 1e6, 1, ['PASS'], makeF64Lane),
    stRow('box', 1e6, 4, ['FAIL'], makeBoxLane),
    stRow('C1', 1e5, 10, ['FAIL', 'NO VERDICT'], makeMapChurnLane),
    stRow('C2', 1e6, 1, ['FAIL', 'NO VERDICT'], makeLate3Lane),
    stRow('refusal', 1e6, 0, ['NO VERDICT'], makeF64Lane),
]);

// :runSelfTestLanes
// Cold. Measures every SELF_TEST_LANES row in order; verdict = gateVerdict(peak, max, bandOf(n, sub)), except a row
// with any VOID window (window 0 included) is NO VERDICT (C-11, fail closed). ok = want.includes(verdict). It does
// not call selfCheck (G2's --self-test does, first: C-20).
export function runSelfTestLanes() {
    const rows = [];
    for (let k = 0; k < SELF_TEST_LANES.length; k++) {
        const L = SELF_TEST_LANES[k];
        const r = measureLane(L.make(L), L.n, L.windows, L.warm, L.sub);
        const verdict = r.voids !== 0 ? 'NO VERDICT' : gateVerdict(r.peak, L.max, bandOf(L.n, L.sub));
        rows.push({ name: L.name, verdict, want: L.want.slice(), ok: L.want.includes(verdict),
            peak: r.peak, retries: r.retries, voids: r.voids });
    }
    return rows;
}
