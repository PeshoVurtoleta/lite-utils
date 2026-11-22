#!/usr/bin/env node
// alloc-per-op.mjs -- steady-state on-heap bytes per op of a synchronous lane (main isolate), LiteUtils.
// Engine (G1): paired S2 brackets (space_used_size of the four SPACES, plus the four XSPACES added into the old /
// large slots, around one drive), the band4 sandwich (twin z1, measured r, twin z2; accept iff z1 === z2 and no
// per-space delta < 0 or NaN; a GC VOIDs), PEAK = max of windows 1..K-1, and the Q-AP-BAND (a) refusal band.
// Importing this file has no side effects.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import v8 from 'node:v8';

// :CONSTANTS
// Numeric constants FROZEN by SPEC S-A36 (CI run 43691163080, 8/8 legs, ci-report VERDICT PASS). A change is a
// re-pin (SPEC C-5). Read set (XSPACES) and driver (S-A38 / S-A39) re-frozen by S-A51 (A4 CI run 44945969102, 8/8
// legs, ci-report VERDICT PASS); the numeric constants are unchanged.
export const BAND_LO_B = 32;
export const BAND_HI_FIXED_B = 524288;
export const BAND_HI_REL = 0.001;
export const RETRY_MAX = 3;
export const POS_MIN_BPO = 8;
export const ISOLATE = 'main';
export const SPACES = Object.freeze(['new_space', 'old_space', 'large_object_space', 'new_large_object_space']);
// XSPACES (S-A38): V8 also allocates lane objects outside SPACES (BytecodeArray, Code, RegExpData: code / trusted).
// bracketS2 reads each into its own slot and adds its growth into old_space (code_space, trusted_space) or
// large_object_space (their LO spaces). read_only_space and the shared_* spaces are not read.
export const XSPACES = Object.freeze(['code_space', 'trusted_space', 'code_large_object_space', 'trusted_large_object_space']);

// :needEnv
// Cold. Refuses an unverified host before any lane call: no gc, no fence, no S2 reader, or a SPACES or XSPACES name
// missing from the listing (all 8 are read; a missing space never reads 0). The refusal names every missing space,
// SPACES first. `listing` defaults to a fresh v8.getHeapSpaceStatistics().
function spacesMissing(list, names, missing) {
    for (let j = 0; j < names.length; j++) {
        let found = false;
        for (let k = 0; k < list.length; k++) {
            const sp = list[k];
            if (sp !== null && typeof sp === 'object' && sp.space_name === names[j]) { found = true; break; }
        }
        if (!found) missing.push(names[j]);
    }
}
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
    spacesMissing(list, SPACES, missing);
    spacesMissing(list, XSPACES, missing);
    if (missing.length !== 0) {
        throw new Error('alloc-per-op: heap space(s) missing: ' + missing.join(', ') +
            ' (refused; a missing space never reads 0)');
    }
}

// :makeDriver
// A driver with a UNIQUE source, so V8's eval cache cannot hand two lanes one feedback vector (monomorphic fn(i)).
// DRIVER_SEQ is a live ESM binding: +1 per driver built. The lane argument is z + i (S-A39), z = DRV_B[0].
export let DRIVER_SEQ = 0;
// DRV_B[0] is always 0. The driver adds it to i: a memory load the compiler cannot fold, so the peeled first
// iteration of the loop never sees the lane argument as the constant 0 (TurboFan loop peeling).
const DRV_B = new Int32Array(1);
export function makeDriver() {
    return new Function('B', 'return function (fn, n) { for (let i = 0, z = B[0]; i < n; i++) fn(z + i); };\n// alloc-per-op driver ' + (++DRIVER_SEQ))(DRV_B);
}

// :bracketS2
// HOT. Method copied from research r5-band.mjs sub() (NAMES -> SPACES + XSPACES): minor sync gc, GCProfiler fence,
// S2 read, drive, S2 read. Nothing but drive(fn, m) runs between the reads; no test branch (tests inject a whole
// bracket). Returns the fence's GC count (a Smi); per-space deltas go to D (Float64Array(4)).
// readS sets all 8 slots to NaN, then slot j = SPACES[j] and slot 4 + j = XSPACES[j]: a name absent from the listing
// stays NaN, never 0. After the second read each XSPACES delta is added into its own D slot (XSLOT: code_space and
// trusted_space -> old_space, their LO spaces -> large_object_space), per slot: a shrink, or a negative / NaN target,
// makes that slot NaN (sandwich counts NaN as negative and re-runs), so a shrink is never netted against growth (S-A38).
const S2_A = new Float64Array(8), S2_B = new Float64Array(8);
const XSLOT = Object.freeze([1, 1, 2, 2]);
function readS(dst) {
    dst[0] = dst[1] = dst[2] = dst[3] = dst[4] = dst[5] = dst[6] = dst[7] = NaN;
    for (const sp of v8.getHeapSpaceStatistics()) {
        let j = SPACES.indexOf(sp.space_name);
        if (j < 0) { j = XSPACES.indexOf(sp.space_name); if (j >= 0) j += 4; }
        if (j >= 0) dst[j] = sp.space_used_size;
    }
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
    for (let j = 4; j < 8; j++) {
        const t = XSLOT[j - 4];
        D[t] = (S2_B[j] >= S2_A[j] && D[t] >= 0) ? D[t] + (S2_B[j] - S2_A[j]) : NaN;
    }
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
// before any call); argument bounds; fn(0) once (a thenable is refused, its rejection handled; then any other value
// but undefined is refused, S-A40); then a fresh driver, `warm` ops, and per window gc() + windowOf. A VOID window
// is null, never 0. The lane must STORE what it allocates (into a sink it owns): an allocation the lane drops --
// returned, or discarded in its body (must-fail example `(i) => { add(A, B); }` reads 0 B/op) -- may be elided by
// V8 and is not measured. Only fn(0)'s return value is checked, so a value or thenable returned by a later call is
// not seen (APO-fable-6).
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
    if (r0 !== undefined) {
        throw new TypeError('alloc-per-op: the lane returned a value (' + typeof r0 + '); refused: the driver discards what a lane ' +
            'returns, so V8 may elide that allocation. Store the result in a sink and return undefined');
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
// The one source of the refusal band (SPEC C-4): lo = BAND_LO_B / sub, hiFixed = BAND_HI_FIXED_B / n (doubled below
// n = BAND_HI_N_MIN), hiRel.
// n and sub must be integers >= 1, else RangeError (S-A42: a negative, fractional, zero or non-number cell has no band).
// BAND_HI_N_MIN (S-A59, Q-CA-BAND (a)): below 1000000 ops per window (cells with no S-A36 CI evidence) the fixed part
// of hi is doubled: a window that short can hold more than one one-off heap step (APC-fable-10). The factor 2 is
// PRELIMINARY: not frozen until the 8-leg corner tally (SPEC C-30). Not exported; `:CONSTANTS` is unchanged.
const BAND_HI_N_MIN = 1000000;
export function bandOf(n, sub) {
    if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(sub) && sub >= 1)) throw new RangeError('alloc-per-op: bandOf: n and sub must be integers >= 1');
    return { lo: BAND_LO_B / sub, hiFixed: (n < BAND_HI_N_MIN ? 2 : 1) * BAND_HI_FIXED_B / n, hiRel: BAND_HI_REL };
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
// caller's cell; ignores --max / --tol. bandOf runs AFTER both measureLane calls, so measureLane's refusal (it names
// the argument) is the one reported. ok iff no VOID and every window finite in BOTH rows (window 0 included, C-11),
// box peak >= POS_MIN_BPO, empty peak in [-lo, hiFixed + hiRel x peak], fence recorded >= forced, and ctl.Profiler is
// the live v8.GCProfiler (the one bracketS2 uses; a caller that replaced v8.GCProfiler passes Profiler: v8.GCProfiler).
// A non-finite number anywhere is a miss (null is not zero). Each control is judged on its own (S-A43): misses =
// { positive, negative, fence }, each '' or that control's reason, which STARTS with its name; reason = the first
// non-empty miss in that order; ok iff reason === ''.
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
    const box = measureLane(ctl.positive, n, windows, warm, sub);
    const empty = measureLane(ctl.negative, n, windows, warm, sub);
    const band = bandOf(n, sub);
    const fence = fenceCheck(ctl.Profiler);
    let pos = scRowMiss(box);
    if (pos !== '') pos = 'positive: ' + pos;
    else if (!(box.peak >= POS_MIN_BPO)) {
        pos = 'positive: box peak ' + box.peak + ' B/op < POS_MIN_BPO ' + POS_MIN_BPO + ' (the harness does not see a box)';
    }
    let neg = scRowMiss(empty);
    if (neg !== '') neg = 'negative: ' + neg;
    else {
        const hi = band.hiFixed + band.hiRel * empty.peak;
        if (!(empty.peak >= -band.lo && empty.peak <= hi)) {
            neg = 'negative: empty peak ' + empty.peak + ' B/op outside [' + (-band.lo) + ', ' + hi + ']';
        }
    }
    let fen = '';
    const rec = fence === null || typeof fence !== 'object' ? undefined : fence.recorded;
    if (typeof rec !== 'number' || !Number.isFinite(rec) || !(rec >= fence.forced)) {
        fen = 'fence: recorded ' + rec + ' < forced ' + (fence && fence.forced) + ' (the GC fence does not see a forced GC)';
    } else if (ctl.Profiler !== v8.GCProfiler) {
        fen = 'fence: the checked Profiler is not the live v8.GCProfiler that bracketS2 uses (the fence that ran is not the fence used)';
    }
    const reason = pos !== '' ? pos : neg !== '' ? neg : fen;
    return { ok: reason === '', reason, misses: { positive: pos, negative: neg, fence: fen }, box, empty, fence, band };
}

// :CONTROLS
// selfCheck's default controls. Built cold at import (two lane functions and the box lane's 2-slot array); nothing
// is measured or driven here. positive: a 16 B HeapNumber box per op (a double stored into a PACKED_ELEMENTS array);
// negative: the empty lane. Profiler: v8.GCProfiler as at import; selfCheck misses the fence if v8.GCProfiler was
// replaced since (S-A42).
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
// G1 TASK 6 table + the S-A41 rows old / nlo, in order. Each row: its cell (n, sub, windows, warm), the gate threshold max, the accepted verdicts
// want, and make(cfg) -> a fresh lane built only when called (C1's 1e5-entry Map never exists at import). cfg is
// the row itself. Truths: f64 store 0 B/op, box 16 B/op (12 B pointer-compressed), C1 ~73.4 B/op peak window, C2 16.
// old and nlo are controls of the old_space and new_large_object_space reads (S-A41): each must read FAIL in at least
// 1 CI leg per cell (pooled, #132 (a)); old ~ one Symbol per op, nlo ~160 B/op nominal (800 KB / 5000 calls).
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
// old: one Symbol per op (V8 allocates a Symbol in old_space), held in the lane's sink.
function makeSymbolLane() {
    let s = null;
    return (i) => { s = Symbol(); };
}
// nlo: one new Array(100000) (800 KB, new_large_object_space) every 5000 calls, held in the lane's sink.
function makeBigArrayLane() {
    let s = null, c = 0;
    return (i) => { if (++c % 5000 === 0) s = new Array(100000); };
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
    stRow('old', 1e5, 4, ['FAIL', 'NO VERDICT'], makeSymbolLane),
    stRow('nlo', 1e5, 10, ['FAIL', 'NO VERDICT'], makeBigArrayLane),
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
// :parseArgs
// G2 CLI (cold; nothing below runs inside a window). Allowlist parse; every refusal throws an Error whose message is
// the refusal text (main prefixes 'alloc-per-op: '). Never touches the file system, never spawns.
import { spawnSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const OPTS = ['--n', '--windows', '--warm', '--sub', '--lane', '--max', '--tol', '--json', '--self-test', '--help'];
const VALUED = new Set(['--n', '--windows', '--warm', '--sub', '--lane', '--max', '--tol']);
const SELF_TEST_OK = new Set(['--self-test', '--json']);

function lev(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) d[i] = [i];
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return d[a.length][b.length];
}

function unknownOpt(name) {
    const probe = name.startsWith('--') ? name : '-' + name;
    let best = OPTS[0], bd = Infinity;
    for (const c of OPTS) { const d = lev(probe, c); if (d < bd) { bd = d; best = c; } }
    return 'unknown option ' + name + (bd <= 3 ? ' (did you mean ' + best + '?)' : '');
}

function intIn(name, s, lo, hi) {
    const v = /^[0-9]+$/.test(s) ? Number(s) : NaN;
    if (!(v >= lo) || !(v <= hi)) {
        throw new Error(name + ' must be an integer in [' + lo + ', ' + hi + '], got ' + JSON.stringify(s));
    }
    return v;
}

function numIn(name, s) {
    const v = /^[0-9]+(\.[0-9]+)?$/.test(s) ? Number(s) : NaN;
    if (!Number.isFinite(v)) throw new Error(name + ' must be a finite non-negative number, got ' + JSON.stringify(s));
    return v;
}

// `at` (optional array) receives the argv index of each BENCH, for the re-spawn's realpath substitution.
function parseCore(argv, at) {
    const o = { n: 1000000, windows: 5, warm: 200000, sub: 10000, lanes: [], max: null, tol: null, json: false,
        selfTest: false, help: false, benches: [] };
    const seen = new Set();
    for (let k = 0; k < argv.length; k++) {
        const a = argv[k];
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            const name = eq < 0 ? a : a.slice(0, eq);
            if (!OPTS.includes(name)) throw new Error(unknownOpt(name));
            if (name !== '--lane' && seen.has(name)) throw new Error(name + ' given twice');
            seen.add(name);
            let val = null;
            if (VALUED.has(name)) {
                if (eq >= 0) val = a.slice(eq + 1);
                else { if (k + 1 >= argv.length) throw new Error(name + ' needs a value'); val = argv[++k]; }
                if (val === '') throw new Error(name + ' value is empty');
            } else if (eq >= 0) throw new Error(name + ' takes no value');
            if (name === '--n') o.n = intIn('--n', val, 100000, 100000000);
            else if (name === '--windows') o.windows = intIn('--windows', val, 3, 50);
            else if (name === '--warm') o.warm = intIn('--warm', val, 0, 100000000);
            else if (name === '--sub') o.sub = intIn('--sub', val, 1000, 10000);
            else if (name === '--lane') o.lanes.push(val);
            else if (name === '--max') o.max = numIn('--max', val);
            else if (name === '--tol') o.tol = numIn('--tol', val);
            else if (name === '--json') o.json = true;
            else if (name === '--self-test') o.selfTest = true;
            else if (name === '--help') o.help = true;
        } else if (a === '-h') o.help = true;
        else if (a.startsWith('-') && a !== '-') throw new Error(unknownOpt(a));
        else { if (at) at.push(k); o.benches.push(a); }
    }
    if (o.help) return o;
    if (o.selfTest) {
        if (o.benches.length !== 0) throw new Error('--self-test takes only --json');
        for (const s of seen) if (!SELF_TEST_OK.has(s)) throw new Error('--self-test takes only --json');
        return o;
    }
    if (o.n % o.sub !== 0) throw new Error('--sub ' + o.sub + ' must divide --n ' + o.n);
    const q = o.n / o.sub;
    if (!(q <= 10000)) throw new Error('--n / --sub = ' + q + ' exceeds 10000');
    if (o.benches.length < 1 || o.benches.length > 2) throw new Error('give one BENCH, or two for A/B');
    if (o.max !== null && o.benches.length === 2) throw new Error('--max is for one BENCH; A/B uses --tol');
    if (o.tol !== null && o.benches.length !== 2) throw new Error('--tol is for A/B (two BENCH files)');
    if (o.tol === null && o.benches.length === 2) throw new Error('--tol is required in A/B mode');
    const band = bandOf(o.n, o.sub);
    if (o.max !== null && !(o.max >= band.lo)) {
        throw new Error('--max ' + o.max + ' is below the refusal band; the smallest accepted value is ' + band.lo +
            ' B/op at --n ' + o.n + ' --sub ' + o.sub);
    }
    if (o.tol !== null && !(o.tol >= band.lo + band.hiFixed)) {
        throw new Error('--tol ' + o.tol + ' is below the refusal band; the smallest accepted value is ' +
            (band.lo + band.hiFixed) + ' B/op at --n ' + o.n + ' --sub ' + o.sub);
    }
    return o;
}

/** Parse argv (without node and script). Throws an Error carrying the refusal text on any usage error. */
export function parseArgs(argv) {
    return parseCore(argv, null);
}

// :preflight
// Parent, before any spawn (the child repeats it): the v8 APIs through the default `v8` object, the 8 SPACES +
// XSPACES names (law 3; S-A46): new_space, old_space, large_object_space, new_large_object_space first, then
// code_space, trusted_space, code_large_object_space, trusted_large_object_space; the first missing name is refused
// (needEnv stays the refusal for module-API callers). Then each BENCH resolved ONCE to an absolute realpath that must be a regular file; two BENCH on one
// realpath are refused (C-18). Returns the realpaths in BENCH order; throws the refusal text otherwise.
function preflight(benches) {
    if (typeof v8.getHeapSpaceStatistics !== 'function') {
        throw new Error('NO VERDICT: v8.getHeapSpaceStatistics is missing on this node');
    }
    if (typeof v8.GCProfiler !== 'function') throw new Error('NO VERDICT: v8.GCProfiler is missing on this node');
    const list = v8.getHeapSpaceStatistics();
    for (let j = 0; j < SPACES.length; j++) {
        let found = false;
        if (Array.isArray(list)) {
            for (let k = 0; k < list.length; k++) {
                const sp = list[k];
                if (sp !== null && typeof sp === 'object' && sp.space_name === SPACES[j]) { found = true; break; }
            }
        }
        if (!found) throw new Error('NO VERDICT: heap space ' + SPACES[j] + ' is missing on this node');
    }
    for (let j = 0; j < XSPACES.length; j++) {
        let found = false;
        if (Array.isArray(list)) {
            for (let k = 0; k < list.length; k++) {
                const sp = list[k];
                if (sp !== null && typeof sp === 'object' && sp.space_name === XSPACES[j]) { found = true; break; }
            }
        }
        if (!found) throw new Error('NO VERDICT: heap space ' + XSPACES[j] + ' is missing on this node');
    }
    const reals = [];
    for (let k = 0; k < benches.length; k++) {
        const p = benches[k];
        let real;
        try { real = realpathSync(p); } catch { throw new Error('BENCH ' + p + ' cannot be resolved'); }
        let file = false;
        try { file = statSync(real).isFile(); } catch { throw new Error('BENCH ' + p + ' cannot be resolved'); }
        if (!file) throw new Error('BENCH ' + p + ' is not a regular file');
        if (!isAbsolute(real)) throw new Error('BENCH ' + p + ' cannot be resolved');
        reals.push(real);
    }
    if (reals.length === 2 && reals[0] === reals[1]) {
        throw new Error('both BENCH resolve to one file (' + reals[0] + '); an A/A check needs a copied bench');
    }
    return reals;
}

// :respawn
// Re-run SELF once with --expose-gc, keeping the caller's node flags, each BENCH replaced by its realpath. Only
// 0 / 1 / 2 pass back; a signal, a spawn error or any other status is NO VERDICT (exit 2).
function respawn(argv, at, reals) {
    const args = argv.slice();
    for (let k = 0; k < at.length; k++) args[at[k]] = reals[k];
    const r = spawnSync(process.execPath, [...process.execArgv, '--expose-gc', SELF, ...args],
        { stdio: 'inherit', env: { ...process.env, ALLOC_PER_OP_CHILD: '1' } });
    if (r.error) {
        process.stderr.write('alloc-per-op: NO VERDICT: child ended by ' + (r.error.message || r.error) + '\n');
        return 2;
    }
    if (r.status === null) {
        process.stderr.write('alloc-per-op: NO VERDICT: child ended by ' + (r.signal || 'an unknown cause') + '\n');
        return 2;
    }
    if (r.status !== 0 && r.status !== 1 && r.status !== 2) {
        process.stderr.write('alloc-per-op: NO VERDICT: child exited with status ' + r.status + '\n');
        return 2;
    }
    return r.status;
}

// :usage
// G2 TASK 7. Usage goes to STDOUT; main exits 2 after it. The ranges and defaults mirror parseCore.
const USAGE = [
    'alloc-per-op.mjs -- steady-state on-heap bytes per op of a synchronous lane (main isolate only)',
    'usage: node alloc-per-op.mjs [options] [--max B] BENCH          one bench: table, or a gate with --max',
    '       node alloc-per-op.mjs [options] --tol B BENCH_A BENCH_B  A/B: two BENCH files',
    '       node alloc-per-op.mjs --self-test [--json]               selfCheck + the self-test lanes',
    '       node alloc-per-op.mjs -h | --help                        this text (exit 2)',
    'BENCH: an ES module exporting `lanes`, a plain object of synchronous functions lane(i); an optional',
    '  exported setup(), a plain or async function, is awaited once, before `lanes` is read.',
    'lane(i): i runs 0 .. S-1 in every sub-window (0 .. W-1 in the warm-up) and then restarts; it is not an',
    '  op index. An allocation keyed on i is read for those calls: one that needs i >= S never happens, and',
    '  one at i = 0 happens once per sub-window. Count calls inside the lane instead.',
    'options (integers in plain digits; option checks run before any spawn, except that a --lane NAME is',
    '  checked after the bench loads, so setup() has run; a dash-led NAME is a name):',
    '  --n N        ops per window, 100000..100000000 (default 1000000)',
    '  --windows K  windows per lane, 3..50 (default 5); PEAK = max of windows 1..K-1',
    '  --warm W     warm-up ops before window 0, 0..100000000 (default 200000)',
    '  --sub S      ops per sub-window, 1000..10000 (default 10000); N % S == 0 and N / S <= 10000.',
    '               --sub below 1000 under-reads on node v22, hence the floor of 1000.',
    '               A GC inside a sub-window VOIDs it: a lane that allocates more than new space holds per',
    '               sub-window (on the order of 100 B/op at the default S; it depends on the new-space size)',
    '               is NO VERDICT, never FAIL; lower --sub.',
    '  --lane NAME  measure only this lane; repeatable (default: every lane)',
    '  --max B      one BENCH only: gate on peak B/op, PASS / FAIL / NO VERDICT',
    '  --tol B      A/B only, and REQUIRED there (no default): SAME / DIFF / NO VERDICT on peak B/op',
    '  --json       one JSON line, the last line the tool writes to stdout. Keep bench output off stdout:',
    '               what a bench prints later follows that line, and an unfinished line before it shares it.',
    'Refusal band (lo = 32 / S, hi = hiFixed + 0.001 x peak, hiFixed = 524288 / N): a --max below lo, or a',
    '  --tol below lo + hiFixed, is refused before any spawn, naming the smallest accepted value. Below',
    '  --n 1000000 hiFixed is doubled (PRELIMINARY), in hi and in the --tol floor.',
    'A/B: the same path twice (after realpath) is refused; a hard link or a case variant counts as a copy; an',
    '  A/A check needs a copied bench.',
    'Scope: on-heap bytes of the main isolate only: the four SPACES new_space, old_space, large_object_space',
    '  and new_large_object_space; code_space and trusted_space are counted into old_space, and',
    '  code_large_object_space and trusted_large_object_space into large_object_space. read_only_space and',
    '  the shared spaces are not read; off-heap ArrayBuffer memory and Worker threads are not counted.',
    'The lane must STORE what it allocates: a dropped allocation (returned, or discarded in its body,',
    '  e.g. `(i) => { add(A, B); }`) may be elided by V8 and then reads 0 B/op. A lane that returns a',
    "  value is refused, but only lane(0)'s return value is checked.",
    'A rejected sub-window is retried: a retried sub-window calls the lane again, so a lane with side',
    '  effects sees extra calls.',
    'A threshold holds only for the build it was measured on (pointer compression, arch, node / v8).',
    'Exit: 0 PASS / SAME / table; 1 FAIL / DIFF / ONLY-A / ONLY-B; 2 NO VERDICT or refused (a child',
    '  status outside 0 / 1 / 2 becomes 2). --self-test: 0 all rows ok, 1 a row miss, 2 a selfCheck miss.',
    'Exit guard: best effort; process.reallyExit or a later \'exit\' listener in a bench can override the code.',
    'The tool exits when the event loop drains: a bench that leaves a timer, socket or Worker open keeps it',
    '  (and the re-spawning parent) running after the verdict line. Close or unref them.',
    'A signal sent to the tool alone does not reach the --expose-gc child it re-spawns: signal the process',
    '  group, or run `node --expose-gc alloc-per-op.mjs ...` (no re-spawn).',
].join('\n') + '\n';
function usage() {
    process.stdout.write(USAGE);
}

// :loadBench
// Child, cold. Import one BENCH (an absolute realpath from the parent); it may export setup(), a plain or async function
// (Object.prototype.toString allowlist: a generator would never run its body), awaited once FIRST; it must export
// `lanes`, a plain object of functions (empty / non-function refused), read only AFTER setup() settled, so a lane that
// setup() adds, replaces or removes is the lane measured (S-A52). setup() therefore runs before `lanes` is read or
// validated: the refusal order moved (a bad `lanes` is refused after setup() ran; exit 2 either way). Every failure
// throws an Error naming the path (and the lane or setup), which main maps to NO VERDICT exit 2 (C-19).
import { pathToFileURL } from 'node:url';

// Every error print is total (S-A53): a thrown Symbol, a null-prototype object or a throwing getter prints as text and
// the exit stays 0 / 1 / 2, never node's 7 (a throw inside an 'uncaughtException' handler).
function safeStr(e) {
    try { return String(e); } catch { return '(unprintable ' + typeof e + ')'; }
}
function fmtErr(e) {
    try { return String((e && e.stack) || e); } catch { return safeStr(e); }
}
function errText(e) {
    let m;
    try { const msg = e !== null && typeof e === 'object' ? e.message : undefined; m = typeof msg === 'string' ? msg : safeStr(e); }
    catch { m = safeStr(e); }
    return m.startsWith('alloc-per-op: ') ? m.slice(14) : m;
}

async function loadBench(p) {
    let mod;
    try { mod = await import(pathToFileURL(p).href); } catch (e) { throw new Error('BENCH ' + p + ': import threw: ' + errText(e)); }
    const setup = mod.setup;
    if (setup !== undefined) {
        let sk;
        try { sk = Object.prototype.toString.call(setup); } catch (e) { throw new Error('BENCH ' + p + ': reading `setup` threw: ' + errText(e)); }
        if (sk !== '[object Function]' && sk !== '[object AsyncFunction]') {
            throw new Error('BENCH ' + p + ': `setup` must be a plain or async function (got ' + sk + ')');
        }
        try { await setup(); } catch (e) { throw new Error('BENCH ' + p + ': setup() threw: ' + errText(e)); }
    }
    const fns = new Map();
    try {
        const lanes = mod.lanes;
        const proto = lanes !== null && typeof lanes === 'object' ? Object.getPrototypeOf(lanes) : undefined;
        if (lanes === null || typeof lanes !== 'object' || Array.isArray(lanes) ||
            (proto !== Object.prototype && proto !== null)) {
            throw new Error('BENCH ' + p + ': must export `lanes`, a plain object of functions');
        }
        const names = Object.keys(lanes);
        if (names.length === 0) throw new Error('BENCH ' + p + ': `lanes` is empty');
        for (const k of names) {
            const f = lanes[k];
            if (typeof f !== 'function') throw new Error('BENCH ' + p + ': lane ' + k + ' is not a function');
            fns.set(k, f);
        }
    } catch (e) {
        throw new Error(errText(e).startsWith('BENCH ') ? errText(e) : 'BENCH ' + p + ': reading `lanes` threw: ' + errText(e));
    }
    return { path: p, fns };
}

// :selectLanes
// The union of both benches' lanes in union order (A's order, then B's lanes A lacks: AUD-4); --lane filters it and
// keeps union order. A --lane in neither bench throws, listing the union.
function selectLanes(benches, wanted) {
    const union = [];
    for (const b of benches) for (const k of b.fns.keys()) if (!union.includes(k)) union.push(k);
    if (wanted.length === 0) return union;
    for (const w of wanted) {
        if (!union.includes(w)) {
            throw new Error('no lane named ' + w + ' in ' + (benches.length === 2 ? 'either BENCH' : 'BENCH') +
                ' (lanes: ' + union.join(', ') + ')');
        }
    }
    return union.filter((k) => wanted.includes(k));
}

// :run
// Child, cold (C-12 / C-14 / C-15): load the benches, select the lanes, selfCheck at the caller's cell (floor =
// selfCheck().empty.peak when ok, else null), measure A then B per lane, fenceCheck after the last lane (a miss, or a
// v8.GCProfiler that is no longer CONTROLS.Profiler, makes every lane verdict NO VERDICT), settle, print. Returns the exit
// code; a lane / setup / import throw propagates (main maps it to exit 2). No code here runs inside a window.
const SIGNAL = 'space-used-paired';
const SCOPE = 'on-heap allocation of the main isolate (new, old and large-object spaces); off-heap ArrayBuffer ' +
    'backing stores and Worker isolates are not counted (for external memory see lite-perf-gate\'s arrayBuffers signal)';
const settle = () => new Promise((r) => setTimeout(r, 100));

function laneVerdictNV(row) { return row.voids !== 0 || !Number.isFinite(row.peak); }

async function run(o, reals) {
    const benches = [];
    for (const p of reals) benches.push(await loadBench(p));
    const sel = selectLanes(benches, o.lanes);
    const band = bandOf(o.n, o.sub);
    const sc = selfCheck(o.n, o.windows, o.warm, o.sub);
    const out = { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
        pointer_compression: buildInfo(process.config && process.config.variables), isolate: ISOLATE, signal: SIGNAL,
        scope: SCOPE, n: o.n, windows: o.windows, warm: o.warm, sub: o.sub, span: (o.windows - 1) * o.n, band,
        floor: sc.ok && sc.empty ? sc.empty.peak : null, benches: benches.map((b) => ({ path: b.path, rows: [] })) };
    const reasons = [];
    if (!sc.ok) {
        reasons.push('selfCheck: ' + sc.reason + ' (no lane measured)');
        if (benches.length === 1 && o.max !== null) out.gate = { max: o.max, verdict: 'NO VERDICT', lanes: [] };
        if (benches.length === 2) out.ab = { tol: o.tol, verdict: 'NO VERDICT', lanes: [] };
        await settle();
        report(o, out, reasons, false);
        return 2;
    }
    const rowOf = [new Map(), new Map()];
    for (const name of sel) {
        for (let b = 0; b < benches.length; b++) {
            const fn = benches[b].fns.get(name);
            if (fn === undefined) continue;
            let m;
            try { m = measureLane(fn, o.n, o.windows, o.warm, o.sub); } catch (e) {
                throw new Error('BENCH ' + benches[b].path + ': lane ' + name + ' failed: ' + errText(e));
            }
            const row = { lane: name, windows: m.windows, peak: m.peak, mean: m.mean, voids: m.voids, retries: m.retries };
            out.benches[b].rows.push(row);
            rowOf[b].set(name, row);
            if (m.voids !== 0) {
                reasons.push('VOID: lane ' + name + (benches.length === 2 ? (b === 0 ? ' (A)' : ' (B)') : '') +
                    ', ' + m.voids + ' VOID window(s), first window ' + m.voidAt);
            }
        }
    }
    const fence = fenceCheck();
    const fenceRecOk = typeof fence.recorded === 'number' && Number.isFinite(fence.recorded) && fence.recorded >= fence.forced;
    const fenceLiveOk = v8.GCProfiler === CONTROLS.Profiler;
    const fenceOk = fenceRecOk && fenceLiveOk;
    if (!fenceRecOk) reasons.push('fence (after): recorded ' + fence.recorded + ' < forced ' + fence.forced);
    else if (!fenceLiveOk) reasons.push('fence (after): v8.GCProfiler was replaced during the run');
    let nv = !fenceOk || sel.length === 0 || reasons.length !== 0;
    if (sel.length === 0) reasons.push('zero lanes selected');
    let bad = false;
    if (benches.length === 1 && o.max !== null) {
        const lanes = [];
        for (const row of out.benches[0].rows) {
            const hi = Number.isFinite(row.peak) ? band.hiFixed + band.hiRel * row.peak : null;
            const verdict = !fenceOk || laneVerdictNV(row) ? 'NO VERDICT' : gateVerdict(row.peak, o.max, band);
            lanes.push({ lane: row.lane, peak: row.peak, lo: band.lo, hi, verdict });
            if (verdict === 'NO VERDICT') nv = true;
            if (verdict === 'FAIL') bad = true;
        }
        out.gate = { max: o.max, verdict: nv ? 'NO VERDICT' : bad ? 'FAIL' : 'PASS', lanes };
    }
    if (benches.length === 2) {
        const lanes = [];
        for (const name of sel) {
            const ra = rowOf[0].get(name), rb = rowOf[1].get(name);
            if (ra === undefined || rb === undefined) {
                const one = ra === undefined ? rb : ra;
                lanes.push({ lane: name, a: ra === undefined ? null : ra.peak, b: rb === undefined ? null : rb.peak,
                    delta: null, E: null, verdict: ra === undefined ? 'ONLY-B' : 'ONLY-A' });
                if (laneVerdictNV(one)) nv = true;
                bad = true;
                continue;
            }
            const fin = Number.isFinite(ra.peak) && Number.isFinite(rb.peak);
            const verdict = !fenceOk || laneVerdictNV(ra) || laneVerdictNV(rb) ? 'NO VERDICT' : abVerdict(ra.peak, rb.peak, o.tol, band);
            lanes.push({ lane: name, a: ra.peak, b: rb.peak, delta: fin ? rb.peak - ra.peak : null,
                E: fin ? band.lo + band.hiFixed + band.hiRel * Math.max(ra.peak, rb.peak) : null, verdict });
            if (verdict === 'NO VERDICT') nv = true;
            if (verdict === 'DIFF') bad = true;
        }
        out.ab = { tol: o.tol, verdict: nv ? 'NO VERDICT' : bad ? 'DIFF' : 'SAME', lanes };
    }
    // Settle before printing (d4386d85): an async error from a lane or setup then exits 2 before any verdict prints.
    await settle();
    report(o, out, reasons, true);
    return nv ? 2 : bad ? 1 : 0;
}

// --self-test (C-20 / C-21): selfCheck at the G1 TASK 6 default cell; a miss stops before runSelfTestLanes. The last
// stdout line is {"selfCheck":{"ok","reason"},"rows":[...]}. Exit 0 iff ok and every row ok, 1 on a row miss, 2 on a miss.
async function runSelfTest(o) {
    const sc = selfCheck(1000000, 5, 200000, 10000);
    const rows = sc.ok ? runSelfTestLanes() : [];
    await settle();
    if (!sc.ok) process.stderr.write('alloc-per-op: NO VERDICT: selfCheck: ' + sc.reason + '\n');
    if (!o.json) {
        const L = ['alloc-per-op --self-test | node ' + process.version + ' | v8 ' + process.versions.v8 + ' | ' +
            process.platform + '-' + process.arch,
            'selfCheck (--n 1000000 --sub 10000 --windows 5 --warm 200000): ' + (sc.ok ? 'ok' : 'MISS: ' + sc.reason)];
        for (const r of rows) {
            L.push('  ' + r.name.padEnd(10) + ' peak ' + num(r.peak).padStart(10) + '  ' + r.verdict.padEnd(10) +
                ' want ' + r.want.join(' | ') + '  ' + (r.ok ? 'ok' : 'MISS'));
        }
        process.stdout.write(L.join('\n') + '\n');
    }
    process.stdout.write(JSON.stringify({ selfCheck: { ok: sc.ok, reason: sc.reason }, rows }) + '\n');
    if (!sc.ok) return 2;
    for (const r of rows) if (r.ok !== true) return 1;
    return 0;
}

// :report
// Cold. The reasons go to stderr; with --json only the JSON line (exactly the BRIEF key set) is printed, else the text
// report. `verdicts` false (a selfCheck miss, C-15) prints no verdict line.
function num(x) { return typeof x === 'number' && Number.isFinite(x) ? x.toFixed(4) : 'null'; }
function short(x) { return typeof x === 'number' && Number.isFinite(x) ? String(Number(x.toPrecision(6))) : 'null'; }

function report(o, out, reasons, verdicts) {
    for (const r of reasons) process.stderr.write('alloc-per-op: NO VERDICT: ' + r + '\n');
    if (o.json) { process.stdout.write(JSON.stringify(out) + '\n'); return; }
    const pc = out.pointer_compression;
    const L = ['alloc-per-op | node ' + out.node + ' | v8 ' + out.v8 + ' | ' + out.platform + '-' + out.arch +
        ' | pointer_compression ' + (pc === 1 || pc === true ? '1' : pc === 0 || pc === false ? '0' : 'unknown') +
        ' | isolate ' + out.isolate + ' | signal ' + out.signal,
        'n=' + out.n + ' windows=' + out.windows + ' warm=' + out.warm + ' sub=' + out.sub +
        ' | span (K-1) x N = ' + out.span + ' ops',
        'scope: ' + out.scope,
        'band: lo ' + out.band.lo + ' B/op, hi ' + out.band.hiFixed + ' + ' + out.band.hiRel +
        ' x peak B/op (at --n ' + out.n + ' --sub ' + out.sub + '); a statistic within the band is NO VERDICT',
        'floor (empty lane peak, printed, never subtracted) = ' + num(out.floor) + ' B/op'];
    for (const b of out.benches) {
        L.push('', b.path);
        L.push('  ' + 'lane'.padEnd(24) + 'peak'.padStart(12) + 'mean'.padStart(12) + 'voids'.padStart(7) +
            'retries'.padStart(9) + '   windows 0..' + (out.windows - 1) + ' (B/op; VOID = null)');
        for (const r of b.rows) {
            L.push('  ' + r.lane.padEnd(24) + num(r.peak).padStart(12) + num(r.mean).padStart(12) +
                String(r.voids).padStart(7) + String(r.retries).padStart(9) + '   ' + r.windows.map(num).join(' '));
        }
        if (b.rows.length === 0) L.push('  (no lane measured)');
    }
    for (const r of reasons) L.push('NO VERDICT: ' + r);
    if (verdicts && out.gate) {
        let why = '';
        for (const g of out.gate.lanes) {
            const row = out.benches[0].rows.find((x) => x.lane === g.lane);
            if (g.verdict === 'NO VERDICT' && why === '' && g.hi !== null && row && row.voids === 0) {
                why = ' (within band -' + short(g.lo) + '/+' + short(g.hi) + ': lane ' + g.lane + ')';
            }
        }
        if (out.gate.verdict !== 'NO VERDICT') why = '';
        else if (reasons.length !== 0) why = ' (' + reasons[0] + ')';
        L.push('', 'gate --max ' + out.gate.max + ' (peak B/op): ' + out.gate.verdict + why);
        const fenceMiss = reasons.some((r) => r.startsWith('fence '));
        for (const g of out.gate.lanes) {
            const row = out.benches[0].rows.find((x) => x.lane === g.lane);
            const band = g.verdict !== 'NO VERDICT' ? '' : row && row.voids !== 0 ? ' (VOID)' : fenceMiss ? ' (fence)' :
                g.hi === null ? '' : ' (within band -' + short(g.lo) + '/+' + short(g.hi) + ')';
            L.push('  ' + g.lane.padEnd(24) + num(g.peak).padStart(12) + '  ' + g.verdict + band);
        }
    }
    if (verdicts && out.ab) {
        L.push('', 'A/B --tol ' + out.ab.tol + ' (peak B/op): ' + out.ab.verdict);
        L.push('  ' + 'lane'.padEnd(24) + 'A'.padStart(12) + 'B'.padStart(12) + 'delta'.padStart(12) + 'E'.padStart(12));
        for (const c of out.ab.lanes) {
            L.push('  ' + c.lane.padEnd(24) + num(c.a).padStart(12) + num(c.b).padStart(12) + num(c.delta).padStart(12) +
                num(c.E).padStart(12) + '  ' + c.verdict);
        }
    }
    process.stdout.write(L.join('\n') + '\n');
}

// :buildInfo
// The build's pointer-compression flag as recorded (null when absent or vars is not an object: null is not zero).
export function buildInfo(vars) {
    if (vars === null || typeof vars !== 'object') return null;
    return Object.hasOwn(vars, 'v8_enable_pointer_compression') ? vars.v8_enable_pointer_compression : null;
}

// :main
// parseArgs -> -h -> preflight -> (no gc: re-spawn once, or exit 2 in a child) -> the run. Returns the exit code.
const RUN_STATE = { settled: false, code: 2 };
function exitGuard(code) {
    if (!RUN_STATE.settled) {
        process.stderr.write('alloc-per-op: NO VERDICT: the process exited before the run settled (exit code ' + code + ')\n');
        process.exitCode = 2;
    } else if (code !== RUN_STATE.code) {
        process.stderr.write('alloc-per-op: NO VERDICT: exit code ' + code + ' replaced the run\'s exit ' + RUN_STATE.code +
            ' after the run settled\n');
        process.exitCode = 2;
    }
}
async function main(argv) {
    const at = [];
    let o, reals;
    try { o = parseCore(argv, at); } catch (e) { process.stderr.write('alloc-per-op: ' + e.message + '\n'); return 2; }
    if (o.help) { usage(); return 2; }
    try { reals = preflight(o.benches); } catch (e) { process.stderr.write('alloc-per-op: ' + e.message + '\n'); return 2; }
    if (typeof globalThis.gc !== 'function') {
        if (process.env.ALLOC_PER_OP_CHILD === '1') {
            process.stderr.write('alloc-per-op: NO VERDICT: gc() still missing after --expose-gc\n');
            return 2;
        }
        return respawn(argv, at, reals);
    }
    // The run (C-12, C-14, C-15, C-19, C-20). The exit guard (TASK 7): any exit before the run settled -- a lane or
    // setup() calling process.exit(0) included -- ends with 2, and so does an exit code that differs from the run's.
    process.on('exit', exitGuard);
    let code;
    try { code = o.selfTest ? await runSelfTest(o) : await run(o, reals); } catch (e) {
        process.stderr.write('alloc-per-op: NO VERDICT: ' + errText(e) + '\n');
        code = 2;
    }
    RUN_STATE.settled = true;
    RUN_STATE.code = code;
    return code;
}

// :direct
// Run only when executed directly, so importing this file has no side effects. An async error escaping a lane or
// setup must not turn into exit 1 (= FAIL / DIFF): it is NO VERDICT, exit 2 (C-19).
let direct = false;
try { direct = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(SELF); } catch { direct = false; }
// A second instance of this file in one process (a bench importing it under another URL: a ?query, or a symlink
// under --preserve-symlinks) would start a second run inside the first: refused at import, which loadBench reports
// as NO VERDICT exit 2 (APC-fable-9). Set only when run directly, so importing this file still has no side effects.
const DIRECT_KEY = Symbol.for('@zakkster/lite-utils/alloc-per-op.direct');
if (direct) {
    if (globalThis[DIRECT_KEY] === true) throw new Error('alloc-per-op: the tool file was imported again inside its own run (a bench must not import alloc-per-op.mjs)');
    globalThis[DIRECT_KEY] = true;
}
if (direct) {
    const die = (e) => { process.stderr.write('alloc-per-op: NO VERDICT: uncaught: ' + fmtErr(e) + '\n'); process.exit(2); };
    process.on('uncaughtException', die);
    process.on('unhandledRejection', die);
}
if (direct) main(process.argv.slice(2)).then((c) => { process.exitCode = c; },
    (e) => { process.stderr.write('alloc-per-op: NO VERDICT: ' + fmtErr(e) + '\n'); process.exitCode = 2; });
