// band.mjs (a4-band) -- b89 U1 A4 prep (SPEC C-37; b88 plan-A1 section D), from r6-band.mjs (b83 G0 B1). The measured
// bracket and driver are src's (C-33 / C-34): bracketS2 (8-name read set, XSPACES folded, NaN = missing / shrink) and
// makeDriver (fn(z + i)), imported from ../../src/alloc-per-op.mjs (resolved from this file's own location); r6's own
// NAMES / readS / sub / driver are gone. The sandwich, FORCE_RETRY, st.cnt edges and output stay; every per-space
// test is fail closed: !(D[j] >= 0) (NaN = negative), and a NaN never reaches a sum. The fence suite runs through
// bracketS2 too (F1 = a bracket whose drive is a sync minor gc()).
//   node --expose-gc band.mjs MODE N SUB K WARM      (cwd = a private mktemp -d)  -> ONE JSON line
//   env FORCE_RETRY=k (lb only, integer 0..300): k extra re-runs in window 1 (an accepted triple is re-run, at most 3
//   per sub-window, so the 4th attempt is always free to accept).
// MODE band4      : r5's band lanes (empty, f64, box, box2, box15, boxc, obj, late) under the band4 sandwich.
//                   boxskip (Q-B89-LOTEETH (a)): one 16 B box per op except at i === 0 of each drive call (the src driver
//                   feeds z + i, z = 0), so a measured bracket of SUB calls skips exactly one box: truth 16, reads
//                   16 - 16 / SUB (err -lo / 2), the lo x 0.25 pooled data control; twins at m = 0 call nothing.
// MODE lb         : LiteBisect's cell -- late3 (16 B box from call 1 + WARM + 3N on, i.e. window 3), empty and box,
//                   each counting its own calls in st.cnt; K 6, WARM 5e6, SUB 1e4 required (N from argv, 1e6 there).
//                   A4 (plan D, P2) adds, after them: lateTier (fable helpers/late.mjs lane body, truth 0, deopt +
//                   re-JIT at call 1 + WARM + 3N), late3 (C2: makeLate3Lane's logic and START = 1 + WARM + 3N, but its
//                   counter lives in mk's st.cnt / st.start object fields, not src's closure let / const, so the
//                   switch-window code bytes are not proven equal to src C2's), throw (E5b's throwaway
//                   `sink = { v: i }`, truth null, not judged), box8 (E5b's lane8, truth 128).
// MODE ctl        : src SELF_TEST_LANES rows old and nlo (their make(), their cell N 1e5 SUB 1e4 K 5 WARM 2e5,
//                   required); each row carries max, peak (windows 1..K-1, any null = null) and verdict = any VOID
//                   window ? NO VERDICT : src gateVerdict(peak, max, bandOf(N, SUB)).
// MODE fresh      : no lanes; the fence suite only (fresh heap state).
// MODE state-1e8  : the r5 corners lanes (= band4's) at N 1e8 / SUB 1e4 (required), then the fence suite.
// MODE state-large: r5-shape large (empty, box, big, big2; ~300 KB flattened string per op; N 200, SUB 1, WARM 20
//                   required), then the fence suite.
// Every mode ends with the fence suite: F0 = r5's 64 MB sub-window (the old control, E25), F1 = a sync minor gc()
// inside a GCProfiler bracket, F2 = 2 x new_space.space_size bytes of 16 B boxes from a fresh new Function site (size
// read just before), Fnull = an empty bracket (its teeth: 0). Each records new_space.space_size and the used deltas.
// Sandwich per sub-window (r5 band4): twin z1, measured r, twin z2; accept only z1 === z2 AND no per-space delta < 0 in
// any of the three brackets; else re-run the triple (at most 3 re-runs); still rejected or any GC = VOID (null).
// NIT fix (S-A17 / SPEC TASK 1): a GC break on any attempt (r5: attempt >= 2 combined attempt t-1's z with attempt
// t's r) records z / r / d = null for that sub-window and adds nothing to sum; `retries` keeps r5's count (+1 per
// rejected attempt, so an exhausted sub-window counts 4 = the +1); `reruns` = attempts - 1 per sub-window (S-A20: an
// exhausted sub-window = 4 retries but 3 re-runs). Per window `calls` = the lane's own st.cnt read at the window
// edges, outside the brackets; null for a lane that does not count (null is not zero). Truth: rows carry `truth` (B/op
// from window `from` on, 0 before; null = unknown) -- r5's late (truth -1) is { truth: 16, from: T }.
// S-A49 (b90 U1): rows carry `sw` = the lane's switch window (its counter's switch call START = 1 + WARM + sw x N; late
// T, late3 T3 = their from, lateTier 3 with truth 0 on both sides); null = no switch. The report judges window sw - 1
// of late3 / lateTier with hi + 16 x SUB x R / N, R = the row's `reruns` over windows 0..sw-1.
// Census (P3): the record carries `census` = every space_name of v8.getHeapSpaceStatistics() in this child.
import v8 from 'node:v8';
import { bracketS2, makeDriver, gateVerdict, bandOf, SELF_TEST_LANES } from '../../src/alloc-per-op.mjs';

const MODE = process.argv[2];
const [N, SUB, K, WARM] = process.argv.slice(3, 7).map(Number);
const fail = (m) => { console.log(JSON.stringify({ error: m })); process.exit(2); };
if (typeof globalThis.gc !== 'function') fail('no gc');
if (typeof v8.GCProfiler !== 'function' || typeof v8.getHeapSpaceStatistics !== 'function') fail('no S2 / fence');
if (!['band4', 'lb', 'ctl', 'fresh', 'state-1e8', 'state-large'].includes(MODE)) fail('mode');
if (!(N > 0) || !(SUB > 0) || N % SUB !== 0 || !(K >= 3) || !(WARM >= 0)) fail('usage');
if (!Number.isInteger(N) || !Number.isInteger(SUB) || !Number.isInteger(K) || !Number.isInteger(WARM)) fail('usage');
if (MODE === 'lb' && !(SUB === 1e4 && K === 6 && WARM === 5e6)) fail('lb needs SUB 1e4, K 6, WARM 5e6');
if (MODE === 'state-1e8' && !(N === 1e8 && SUB === 1e4)) fail('state-1e8 needs N 1e8, SUB 1e4');
if (MODE === 'state-large' && !(N === 200 && SUB === 1 && WARM === 20)) fail('state-large needs N 200, SUB 1, WARM 20');
const CTL = ['old', 'nlo'].map((name) => SELF_TEST_LANES.find((L) => L.name === name));
if (CTL.some((L) => L === undefined)) fail('src SELF_TEST_LANES lacks old / nlo');
if (MODE === 'ctl' && !CTL.every((L) => L.n === N && L.sub === SUB && L.windows === K && L.warm === WARM)) fail('ctl needs the SELF_TEST_LANES cell (N 1e5, SUB 1e4, K 5, WARM 2e5)');
const FRS = process.env.FORCE_RETRY;
if (FRS !== undefined && !/^(0|[1-9][0-9]{0,2})$/.test(FRS)) fail('FORCE_RETRY must be an integer 0..300');
const FR = FRS === undefined ? 0 : Number(FRS);
if (!(FR <= 300)) fail('FORCE_RETRY must be an integer 0..300');
if (FR !== 0 && MODE !== 'lb') fail('FORCE_RETRY only in lb');
const SUBS = N / SUB;
const T = 2; // late lane's first boxing window
const T3 = 3; // late3 lane's first boxing window
const D = new Float64Array(4); // src bracketS2's per-space deltas (C-33: XSPACES folded into slots 1 / 2; NaN = missing / shrink)
const sub = (fn, drive, m) => bracketS2(fn, drive, m, D);
const driver = makeDriver;
// lanes: distinct functions from new Function so twins never share feedback
const mk = (body, tag, start) => {
    const st = { cnt: 0, start };
    return [new Function('objs', 'f64', 'st', 'return (i) => { ' + body + ' }; // ' + tag)([{}, {}], new Float64Array(2), st), st];
};
// A4 lanes (P2): a lane body that needs its own closure state, byte-equal to its source; st.cnt reads the closure
// counter (a getter, read only at the window edges, outside every bracket); START is the late tier's switch call.
const mkV = (pre, body, tag, start, counts) => new Function('START', pre + '\nconst lane = (i) => { ' + body + ' };\nreturn [lane, { get cnt() { return ' +
    (counts ? 'cnt' : '0') + '; }, start: START }]; // ' + tag)(start);
// [pre, body, truth, from, counts, switch window (START = 1 + WARM + sw x N; null = none)]
const VLANE = {
    // fable cross helpers/late.mjs (lines 7-10): f64 stores until START, then int / charCode stores (0 B/op), deopt + re-JIT
    lateTier: ['const f64 = new Float64Array(2), i32 = new Int32Array(2), u8 = new Uint8Array(2);\nlet cnt = 0, acc = 0;\n' +
        "const helperA = (x) => x + 0.5, helperB = (x) => (x | 0) ^ 3, helperC = (x) => String.prototype.charCodeAt.call('abc', x & 1);",
        'cnt++; if (cnt > START) { i32[cnt & 1] = helperB(cnt); u8[cnt & 1] = helperC(cnt); acc = (acc + i32[0]) | 0; } else f64[cnt & 1] = helperA(cnt);',
        0, 0, true, 3],
    // E5b (test/alloc-per-op-engine.test.mjs E5_BODY): the throwaway lane (not judged), then lane8 (8 HeapNumbers x 16 B)
    throw: ['let sink = null;', 'sink = { v: i };', null, 0, false, null],
    box8: ['const a = [null, null, null, null, null, null, null, null];',
        'a[0] = i + 0.5; a[1] = i + 1.5; a[2] = i + 2.5; a[3] = i + 3.5; a[4] = i + 4.5; a[5] = i + 5.5; a[6] = i + 6.5; a[7] = i + 7.5;',
        128, 0, false, null],
};
const BIG = 'x'.repeat(300000);
const mkL = (body, tag, start) => { // r5-shape's lane factory (state-large only)
    const st = { cnt: 0, start };
    return [new Function('objs', 'f64', 'st', 'BIG', 'function P(i) { this.x = i; }\nclass C { x = 0; constructor(i) { this.x = i; } }\nreturn (i) => { ' + body + ' }; // ' + tag)(
        [{}, {}], new Float64Array(2), st, BIG), st];
};
// [body, truth (B/op), from (first window with that truth; 0 before), counts (st.cnt per call)]
const LANE = {
    empty: [' ', 0, 0, false], f64: ['f64[i & 1] = i + 0.5;', 0, 0, false], box: ['objs[i & 1] = i + 0.5;', 16, 0, false],
    obj: ['objs[i & 1] = { i };', 32, 0, false],
    box15: ['objs[i & 1] = i + 1.5;', 16, 0, false], boxskip: ['if (i !== 0) objs[i & 1] = i + 0.5;', 16, 0, false], boxc: ['st.cnt++; objs[st.cnt & 1] = st.cnt + 0.5;', 16, 0, true],
    late: ['st.cnt++; if (st.cnt > st.start) objs[st.cnt & 1] = st.cnt + 0.5; else f64[st.cnt & 1] = st.cnt + 0.5;', 16, T, true],
    // lb (LiteBisect cell): every lane counts its calls
    late3: ['st.cnt++; if (st.cnt > st.start) objs[st.cnt & 1] = st.cnt + 0.5; else f64[st.cnt & 1] = st.cnt + 0.5;', 16, T3, true],
    emptyc: ['st.cnt++;', 0, 0, true], boxi: ['st.cnt++; objs[i & 1] = i + 0.5;', 16, 0, true],
    // state-large (r5-shape large)
    big: ['const t = BIG + (i & 7); objs[i & 1] = t; t.charCodeAt(7);', null, 0, false],
};
const zd = new Float64Array(SUBS), rd = new Float64Array(SUBS), dd = new Float64Array(SUBS);
function stats(arr) { // r5 stats over the non-null (non-NaN) sub-windows; `nulls` = GC-broken sub-windows
    const s = Float64Array.from(arr).filter((x) => x === x).sort();
    const nulls = arr.length - s.length;
    if (s.length === 0) return { mode: null, off: null, min: null, iMin: null, max: null, iMax: null, nulls };
    let mode = s[0], best = 0, run = 0;
    for (let i = 0; i < s.length; i++) { run = (i && s[i] === s[i - 1]) ? run + 1 : 1; if (run > best) { best = run; mode = s[i]; } }
    let off = 0, iMin = -1, iMax = -1;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== arr[i]) continue;
        if (arr[i] !== mode) off++;
        if (iMin < 0 || arr[i] < arr[iMin]) iMin = i;
        if (iMax < 0 || arr[i] > arr[iMax]) iMax = i;
    }
    return { mode, off, min: arr[iMin], iMin, max: arr[iMax], iMax, nulls };
}
function measure(fn, st, counts) {
    fn(0);
    const drive = driver();
    drive(fn, WARM);
    const out = [];
    for (let w = 0; w < K; w++) {
        gc();
        const c0 = st.cnt; // window edge, outside every bracket
        let sum = 0, v = 0, retries = 0, reruns = 0, forced = 0, gcBreaks = 0, force = w === 1 ? FR : 0;
        const rs = [0, 0, 0, 0], zs = [0, 0, 0, 0];
        let negR = 0, uneqR = 0;
        for (let s = 0; s < SUBS; s++) {
            // SANDWICH (r5 band4): twin z1, measured r, twin z2; accept only z1 === z2 AND no PER-SPACE delta < 0 in any
            // of the three brackets (used size cannot shrink without a GC; a NaN slot -- missing name or XSPACES shrink --
            // counts as negative); else re-run the triple (up to 3 re-runs); still rejected or any GC = VOID (null, never 0).
            let z = 0, r = 0, ok = false, g = 0, att = 0;
            const rr = [0, 0, 0, 0], zz = [0, 0, 0, 0];
            for (let t = 0; t < 4; t++) {
                att = t + 1;
                let neg = false;
                g = sub(fn, drive, 0); const z1 = D[0] + D[1] + D[2] + D[3]; for (let j = 0; j < 4; j++) { zz[j] = D[j]; if (!(D[j] >= 0)) neg = true; }
                g += sub(fn, drive, SUB); r = D[0] + D[1] + D[2] + D[3]; for (let j = 0; j < 4; j++) { rr[j] = D[j]; if (!(D[j] >= 0)) neg = true; }
                g += sub(fn, drive, 0); const z2 = D[0] + D[1] + D[2] + D[3]; for (let j = 0; j < 4; j++) if (!(D[j] >= 0)) neg = true;
                if (g !== 0) { z = NaN; r = NaN; gcBreaks++; break; } // NIT fix: never combine attempt t-1's z with t's r
                z = z1;
                if (z1 === z2 && !neg) {
                    if (force > 0 && t < 3) { force--; forced++; retries++; continue; } // FORCE_RETRY (lb, window 1)
                    ok = true; for (let j = 0; j < 4; j++) { rs[j] += rr[j]; zs[j] += zz[j]; } break;
                }
                if (neg) negR++; if (z1 !== z2) uneqR++;
                retries++;
            }
            reruns += att - 1;
            if (!ok) v++;
            zd[s] = z; rd[s] = r; dd[s] = r - z; if (z === z && r === r) sum += r - z; // a NaN (GC break or NaN slot) never reaches sum
        }
        const c1 = st.cnt; // window edge, outside every bracket
        out.push({ bpo: v ? null : sum / N, sum, voids: v, retries, reruns, forced, gcBreaks, negR, uneqR, calls: counts ? c1 - c0 : null,
            space: rs.map((x, j) => x - zs[j]), z: stats(zd), r: stats(rd), d: stats(dd) });
    }
    return out;
}
function newSize() {
    for (const sp of v8.getHeapSpaceStatistics()) if (sp.space_name === 'new_space') return sp.space_size;
    return null;
}
const fenceRec = (gcs, spaceSize, extra) => Object.assign({ gcs, spaceSize, used: Array.from(D), usedTotal: D[0] + D[1] + D[2] + D[3] }, extra);
function fenceSuite() {
    const out = {};
    { // F0: r5's fixed 64 MB sub-window (old control; E25: not universal once the heap has grown)
        const [big] = mk(LANE.box[0], 'fence'); const drive = driver();
        const sz = newSize();
        out.F0 = fenceRec(sub(big, drive, 4000000), sz, { ops: 4000000, bytes: 64000000 });
    }
    { // Fnull: an empty bracket (minor gc, then a GCProfiler bracket around nothing) -- must record 0
        const [e] = mk(LANE.empty[0], 'fence-null'); const drive = driver();
        const sz = newSize();
        out.Fnull = fenceRec(sub(e, drive, 0), sz, { ops: 0, bytes: 0 });
    }
    { // F1: a sync minor gc() inside a GCProfiler bracket -- must record >= 1
        const sz = newSize();
        out.F1 = fenceRec(sub(null, () => { gc({ type: 'minor', execution: 'sync' }); }, 0), sz, { ops: 0, bytes: 0 });
    }
    { // F2: 2 x new_space.space_size bytes of 16 B boxes from a fresh site (size read just before) -- must record >= 1
        const sz = newSize();
        if (sz === null) { out.F2 = null; } else {
            const ops = Math.ceil((2 * sz) / 16);
            const [b] = mk(LANE.box[0], 'fence-F2-' + Date.now()); const drive = driver();
            out.F2 = fenceRec(sub(b, drive, ops), sz, { ops, bytes: ops * 16 });
        }
    }
    return out;
}
const rows = [];
const lanesOf = { band4: ['empty', 'f64', 'box', 'box2', 'box15', 'boxskip', 'boxc', 'obj', 'late', 'lateTier', 'late3', 'throw', 'box8'],
    'state-1e8': ['empty', 'f64', 'box', 'box2', 'box15', 'boxc', 'obj', 'late'], lb: ['empty', 'box', 'late3'], 'state-large': ['empty', 'box', 'big', 'big2'], ctl: [], fresh: [] };
for (const L of MODE === 'ctl' ? CTL : []) { // src's own lane (L.make(L)); no st.cnt (calls null)
    const windows = measure(L.make(L), { cnt: 0 }, false);
    let peak = null, voids = 0;
    for (let w = 0; w < K; w++) if (windows[w].bpo === null) voids++;
    for (let w = 1; w < K; w++) { const b = windows[w].bpo; if (b === null) { peak = null; break; } if (peak === null || b > peak) peak = b; }
    rows.push({ lane: L.name, truth: null, from: 0, counts: false, sw: null, max: L.max, peak, voids, verdict: voids !== 0 ? 'NO VERDICT' : gateVerdict(peak, L.max, bandOf(N, SUB)), windows });
}
for (const name of lanesOf[MODE]) {
    if (Object.hasOwn(VLANE, name)) {
        const [pre, body, truth, from, counts, sw] = VLANE[name];
        const [fn, st] = mkV(pre, body, name, sw === null ? 0 : 1 + WARM + sw * N, counts);
        rows.push({ lane: name, truth, from, counts, sw, windows: measure(fn, st, counts) });
        continue;
    }
    const base = MODE === 'lb' ? ({ empty: 'emptyc', box: 'boxi', late3: 'late3' })[name] : name.replace(/2$/, '');
    const [body, truth, from, counts] = LANE[base];
    const start = 1 + WARM + (base === 'late3' ? T3 : T) * N;
    const [fn, st] = MODE === 'state-large' ? mkL(body, name, start) : mk(body, name, start);
    rows.push({ lane: name, truth, from, counts, sw: from === 0 ? null : from, windows: measure(fn, st, counts) }); // LANE switches: late T, late3 T3 = from
}
const fence = fenceSuite();
const census = v8.getHeapSpaceStatistics().map((sp) => sp.space_name);
console.log(JSON.stringify({ probe: 'a4-band', node: process.version, v8: process.versions.v8, execArgv: process.execArgv, mode: MODE, n: N, sub: SUB, k: K, warm: WARM, T,
    forceRetry: FR, fenceGcs: fence.F0.gcs, census, fence, rows }));
