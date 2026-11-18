// test/alloc-per-op-engine.test.mjs -- b84 G1 H1 (SPEC-alloc-per-op.md TASK 7): rows A1-A8 of the alloc-per-op measurement
// engine, ROOT/src/alloc-per-op.mjs. Oracle = SPEC section 0 CURRENT (C-7..C-13), section 4.G1 ASSERTIONS A1-A8 and
// .handoff/b84/G1-CONTRACT.md -- never the code. Every expected number below is the SPEC's, or is derived by hand in the comment
// next to it. A missing src file FAILS every row (null is not zero; never SKIP).
//   A1-A5  pure, in-process (the data-independent teeth, LEDGER #132): bandOf, gateVerdict, abVerdict, sandwich (scripted
//          bracket), summarize
//   A6     row 1 in-process (no --expose-gc); rows 2-4 inside ONE `node --expose-gc` child (C-8)
//   A7     live children (B1 part: measureLane on f64 / box; B2 part: selfCheck, fenceCheck, injected controls)
//   A8     live child: runSelfTestLanes() against the TASK 6 table
// B2 exports (fenceCheck, selfCheck, CONTROLS, SELF_TEST_LANES, runSelfTestLanes) may not exist yet: their rows FAIL BY NAME.
// Caps go only through capSync (spawn-cap.mjs); no raw cap anywhere in this file (spawn-cap.test.mjs S5 census).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const SRC = join(dirname(HERE), '..', 'src', 'alloc-per-op.mjs');
const SRC_URL = pathToFileURL(SRC).href;
// .handoff/b82/g1/caps.txt: C-10 census: 10x local max 808 ms (8080), rounded up; PRELIMINARY
const LIVE_CAP_MS = 9000;

// ---- the module under test: a load failure FAILS every row, never skips ----
let M = null, LOAD_ERR = null;
try { M = await import(SRC_URL); } catch (e) { LOAD_ERR = e; }
function mod() {
    assert.ok(M !== null, `src/alloc-per-op.mjs failed to load (null is not zero): ${LOAD_ERR && LOAD_ERR.message}`);
    return M;
}

// ---- child plumbing (model: ref-cr-refuse.test.mjs cleanEnv) ----
function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // deleting is not enough: node re-adds it
    return { ...e, ...extra };
}

const DIRS = [];
const LIVE = new Map();   // key -> { value } | { error }: one child per key, its own mkdtemp dir
function live(key, bodyLines) {
    if (!LIVE.has(key)) {
        try {
            const dir = mkdtempSync(join(tmpdir(), 'apo-eng-'));
            DIRS.push(dir);
            const probe = join(dir, 'probe.mjs');
            writeFileSync(probe, [`import * as M from ${JSON.stringify(SRC_URL)};`, ...bodyLines, ''].join('\n'));
            const r = capSync(process.execPath, ['--expose-gc', probe], { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 1 << 24 }, LIVE_CAP_MS, `alloc-per-op probe ${key}`);
            assert.equal(r.status, 0, `probe ${key} exit ${r.status} signal ${r.signal}\n--- stderr:\n${r.stderr}`);
            const lines = String(r.stdout).split('\n').filter((l) => l.trim() !== '');
            assert.ok(lines.length >= 1, `probe ${key} printed nothing`);
            LIVE.set(key, { value: JSON.parse(lines[lines.length - 1]) });
        } catch (e) {
            LIVE.set(key, { error: e });
        }
    }
    const ent = LIVE.get(key);
    if (ent.error) throw ent.error;
    return ent.value;
}

after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

// ================= A1 bandOf =================
test('A1 bandOf(1e6, 1e4) and bandOf(1e5, 1e3)', () => {
    const { bandOf } = mod();
    // SPEC A1 values. Must-fail mutant: lo = 32 / n (lo becomes 3.2e-5).
    assert.deepEqual(bandOf(1e6, 1e4), { lo: 32 / 1e4, hiFixed: 524288 / 1e6, hiRel: 0.001 });
    assert.equal(bandOf(1e5, 1e3).lo, 0.032);
});
test('A1 bandOf second point: hiFixed = 524288 / n, lo = 32 / sub (hand: 524288 / 1e5 = 5.24288)', () => {
    const { bandOf } = mod();
    // Must-fail mutant: hiFixed uses sub, or lo uses n.
    const b = bandOf(1e5, 1e3);
    assert.equal(b.hiFixed, 524288 / 1e5);
    assert.equal(b.hiRel, 0.001);
});

// ================= A2 gateVerdict =================
// band = bandOf(1e6, 1e4): lo 0.0032, hiFixed 0.524288, hiRel 0.001; max 1. Hand check of each row:
//   0.99:  0.99 + 0.0032 = 0.9932 <= 1 PASS
//   0.997: 0.9992+... = 1.0002 > 1 (no PASS); 0.997 - (0.524288 + 0.000997) = 0.4717 <= 1 (no FAIL) -> NO VERDICT
//   1.6:   1.6 - (0.524288 + 0.0016) = 1.0741 > 1 FAIL
//   1.525: 1.525 - (0.524288 + 0.001525) = 0.99919 <= 1 -> NO VERDICT
test('A2 gateVerdict table (max 1)', () => {
    const { bandOf, gateVerdict } = mod();
    const band = bandOf(1e6, 1e4);
    // Must-fail mutants: drop lo (0.997 becomes PASS); drop hiRel (1.525 becomes FAIL); null treated as 0 (null becomes PASS).
    assert.equal(gateVerdict(0.99, 1, band), 'PASS');
    assert.equal(gateVerdict(0.997, 1, band), 'NO VERDICT');
    assert.equal(gateVerdict(1.6, 1, band), 'FAIL');
    assert.equal(gateVerdict(1.525, 1, band), 'NO VERDICT');
});
test('A2 gateVerdict: null, NaN, Infinity, a string, an undefined peak or max are NO VERDICT', () => {
    const { bandOf, gateVerdict } = mod();
    const band = bandOf(1e6, 1e4);
    // Must-fail mutant: null treated as 0 (null becomes PASS); !Number.isFinite replaced by a typeof check (NaN / Infinity leak).
    for (const bad of [null, NaN, Infinity, -Infinity, undefined, '0']) {
        assert.equal(gateVerdict(bad, 1, band), 'NO VERDICT', `peak ${String(bad)}`);
        assert.equal(gateVerdict(0, bad, band), 'NO VERDICT', `max ${String(bad)}`);
    }
});

// ================= A3 abVerdict =================
// band as A2. E = lo + hiFixed + hiRel x max(peakA, peakB) (hi at the LARGER peak). Hand check:
//   (16, 16, 1):      |0| + 0.5275 <= 1 SAME
//   (0, 16, 8):       16 - (0.0032 + 0.524288 + 0.016) = 15.46 > 8 DIFF
//   (16, 16.5, 1):    0.5 + 0.5276 = 1.0276 > 1 (no SAME); 0.5 - 0.5276 < 1 (no DIFF) -> NO VERDICT
//   (0, 400, 399.3):  E at larger peak = 0.0032 + 0.524288 + 0.4 = 0.927488; 400 - 0.927488 = 399.0725 <= 399.3 -> NO VERDICT
//                     (E at the smaller peak = 0.5275 gives 399.4725 > 399.3 = DIFF: the mutant)
test('A3 abVerdict table', () => {
    const { bandOf, abVerdict } = mod();
    const band = bandOf(1e6, 1e4);
    // Must-fail mutant: hi taken at the smaller peak makes (0, 400, 399.3) DIFF.
    assert.equal(abVerdict(16, 16, 1, band), 'SAME');
    assert.equal(abVerdict(0, 16, 8, band), 'DIFF');
    assert.equal(abVerdict(16, 16.5, 1, band), 'NO VERDICT');
    assert.equal(abVerdict(0, 400, 399.3, band), 'NO VERDICT');
});
test('A3 abVerdict: a null in either slot is NO VERDICT (C-7: (null, 0, 1) and (0, null, 1))', () => {
    const { bandOf, abVerdict } = mod();
    const band = bandOf(1e6, 1e4);
    // Must-fail mutant: null treated as 0 -- (null, 0, 1) and (0, null, 1) become SAME (delta 0, E 0.5274 <= 1).
    assert.equal(abVerdict(null, 0, 1, band), 'NO VERDICT');
    assert.equal(abVerdict(0, null, 1, band), 'NO VERDICT');
    assert.equal(abVerdict(NaN, 0, 1, band), 'NO VERDICT');
    assert.equal(abVerdict(0, Infinity, 1, band), 'NO VERDICT');
});

// ================= A4 sandwich (scripted bracket) =================
// A scripted bracket: step = [gc, d0, d1, d2, d3]; it writes D[0..3] and returns gc. A call past the script throws (a fourth
// attempt where none is allowed is a named failure, not a hang).
function scripted(steps) {
    const s = { calls: 0, bracket: null };
    s.bracket = (fn, drive, m, D) => {
        if (s.calls >= steps.length) throw new Error(`scripted bracket: call ${s.calls + 1} beyond the ${steps.length}-step script`);
        const st = steps[s.calls++];
        D[0] = st[1]; D[1] = st[2]; D[2] = st[3]; D[3] = st[4];
        return st[0];
    };
    return s;
}
const Z = (t) => [0, t, 0, 0, 0];
function runSandwich(steps, out0 = 100) {
    const { sandwich } = mod();
    const sc = scripted(steps);
    const D = new Float64Array(4), OUT = new Float64Array(1), ST = new Int32Array(1);
    OUT[0] = out0;
    const ret = sandwich(() => {}, () => {}, 10000, sc.bracket, D, OUT, ST);
    return { ret, calls: sc.calls, out: OUT[0], retries: ST[0] };
}
test('A4 sandwich: z 2424 / r 162424 accepts, OUT += 160000, retries 0, 3 calls', () => {
    // Must-fail mutants: OUT += r (not r - z1); a re-run when none is due (calls 6).
    const r = runSandwich([Z(2424), Z(162424), Z(2424)]);
    assert.equal(r.ret, 1);
    assert.equal(r.out, 100 + 160000);
    assert.equal(r.retries, 0);
    assert.equal(r.calls, 3);
});
test('A4 sandwich: z1 2424 vs z2 1784 rejects once, then a clean attempt (retries 1, 6 calls)', () => {
    // Must-fail mutants: accept on totals only is not this row (totals differ) -- 2 or 4 re-runs, no retry at all (OUT += r - z1 of attempt 1 = 160000
    // - 0: 160000 + ... differs from the clean attempt's value below).
    const r = runSandwich([Z(2424), Z(162424), Z(1784), Z(2424), Z(172424), Z(2424)]);
    assert.equal(r.ret, 1);
    assert.equal(r.retries, 1);
    assert.equal(r.calls, 6);
    assert.equal(r.out, 100 + (172424 - 2424));   // attempt 2 only: 170000; attempt 1's r never combined
});
test('A4 sandwich: equal totals but old -7760 / new +7760 inside r rejects (retries 1), then a clean attempt', () => {
    // Must-fail mutant: accept on totals only (the negative delta is not checked) -> retries 0, 3 calls.
    // r attempt 1: D = [-7760, 7760 + 162424, 0, 0] (sum 162424 = the clean total).
    const r = runSandwich([Z(2424), [0, -7760, 7760 + 162424, 0, 0], Z(2424), Z(2424), Z(162424), Z(2424)]);
    assert.equal(r.ret, 1);
    assert.equal(r.retries, 1);
    assert.equal(r.calls, 6);
    assert.equal(r.out, 100 + 160000);
});
test('A4 sandwich: a negative delta in a twin (z) bracket also rejects', () => {
    // Must-fail mutant: the negative check covers only the r bracket.
    const r = runSandwich([[0, -1000, 3424, 0, 0], Z(162424), Z(2424), Z(2424), Z(162424), Z(2424)]);
    assert.equal(r.ret, 1);
    assert.equal(r.retries, 1);
    assert.equal(r.calls, 6);
});
test('A4 sandwich: 4 rejected attempts are VOID (return 0, retries 4, 12 calls, OUT unchanged)', () => {
    // Must-fail mutants: 2 re-runs (calls 9), 4 re-runs (calls 15), OUT += on VOID.
    const bad = [Z(2424), Z(162424), Z(1784)];
    const r = runSandwich([...bad, ...bad, ...bad, ...bad]);
    assert.equal(r.ret, 0);
    assert.equal(r.retries, 4);
    assert.equal(r.calls, 12);
    assert.equal(r.out, 100);
});
test('A4 sandwich: reject, then a GC in attempt 2 r is VOID at once (retries 1, 6 calls, OUT unchanged)', () => {
    // Must-fail mutants: retry on GC (calls > 6), accept despite GC (return 1), OUT += on VOID.
    const r = runSandwich([Z(2424), Z(162424), Z(1784), Z(2424), [1, 162424, 0, 0, 0], Z(2424)]);
    assert.equal(r.ret, 0);
    assert.equal(r.retries, 1);
    assert.equal(r.calls, 6);
    assert.equal(r.out, 100);
});
test('A4 sandwich: a GC in the first attempt is VOID at once (retries 0, 3 calls, OUT unchanged)', () => {
    // Must-fail mutants: retry on GC; the GC counted as a rejected attempt (retries 1).
    const r = runSandwich([Z(2424), [2, 162424, 0, 0, 0], Z(2424)]);
    assert.equal(r.ret, 0);
    assert.equal(r.retries, 0);
    assert.equal(r.calls, 3);
    assert.equal(r.out, 100);
});

test('A4 sandwich: a NaN per-space delta in the measured bracket rejects (retries 1, 6 calls, OUT never NaN)', () => {
    // Must-fail mutant: the negative check written as D < 0 (NaN passes it): attempt 1 accepted, retries 0, 3 calls, OUT NaN.
    // Hand: attempt 1 r = [162424, NaN, 0, 0] is rejected; attempt 2 clean: OUT = 100 + (162424 - 2424) = 160100.
    const r = runSandwich([Z(2424), [0, 162424, NaN, 0, 0], Z(2424), Z(2424), Z(162424), Z(2424)]);
    assert.equal(r.ret, 1);
    assert.equal(r.retries, 1);
    assert.equal(r.calls, 6);
    assert.equal(r.out, 100 + 160000);
});
test('A4 windowOf: a VOID sub-window 0 still drives every sub-window (n / sub = 5 sandwiches, 15 bracket calls)', () => {
    // Must-fail mutant: windowOf stops at the first VOID (calls 3). Hand: n 10 / sub 2 = 5 sub-windows x 3 brackets = 15.
    const { windowOf } = mod();
    let calls = 0;
    const bracket = (fn, drive, m, D) => { const c = calls++; D[0] = m === 0 ? 0 : 16; D[1] = D[2] = D[3] = 0; return c < 3 ? 1 : 0; };
    const voids = windowOf(() => {}, () => {}, 10, 2, bracket);
    assert.equal(calls, 15);
    assert.equal(voids, 1);
});

// ================= A5 summarize =================
test('A5 summarize [9, 1, 3]: peak 3, mean 2, voidAt -1 (window 0 excluded)', () => {
    const { summarize } = mod();
    // Must-fail mutants: include window 0 (peak 9); use min (peak 1). Hand: peak = max(1, 3) = 3, mean = (1 + 3) / 2 = 2.
    const s = summarize([9, 1, 3]);
    assert.equal(s.peak, 3);
    assert.equal(s.mean, 2);
    assert.equal(s.voidAt, -1);
    assert.equal(s.voids, 0);
});
test('A5 summarize [0, 0, 0]: peak 0, not null', () => {
    const { summarize } = mod();
    // Must-fail mutant: a falsy peak reads as null.
    const s = summarize([0, 0, 0]);
    assert.equal(s.peak, 0);
    assert.equal(s.mean, 0);
    assert.equal(s.voidAt, -1);
});
test('A5 summarize [9, 1, null, 3]: peak null, mean null, voids 1, voidAt 2', () => {
    const { summarize } = mod();
    // Must-fail mutant: null treated as 0 (peak 3).
    const s = summarize([9, 1, null, 3]);
    assert.equal(s.peak, null);
    assert.equal(s.mean, null);
    assert.equal(s.voids, 1);
    assert.equal(s.voidAt, 2);
});
test('A5 summarize [null, 1, 3]: peak 3, voidAt 0 (window 0 VOID still counts in voids, C-11)', () => {
    const { summarize } = mod();
    // Must-fail mutants: a null in window 0 nulls the peak; voids counted over 1..K-1 only (voids 0).
    const s = summarize([null, 1, 3]);
    assert.equal(s.peak, 3);
    assert.equal(s.mean, 2);
    assert.equal(s.voidAt, 0);
    assert.equal(s.voids, 1);
});

// ================= A6 refusals =================
test('A6 row 1 (in-process, no --expose-gc): measureLane throws naming --expose-gc and the lane ran 0 times', () => {
    const { measureLane, needEnv } = mod();
    assert.equal(typeof globalThis.gc, 'undefined', 'precondition: this test process must run without --expose-gc');
    let c = 0;
    const lane = () => { c++; };
    // Must-fail mutant: the env check moved after fn(0) (counter 1).
    assert.throws(() => measureLane(lane, 1e4, 3, 1e3, 1e2), /--expose-gc/);
    assert.equal(c, 0);
    assert.throws(() => needEnv(), /--expose-gc/);
});

const A6_BODY = [
    'const out = {};',
    'const msgOf = (e) => String(e && e.message);',
    'let ac = 0;',
    'const asyncLane = async (i) => { ac++; };',
    'try { M.measureLane(asyncLane, 1e4, 3, 1e3, 1e2); out.asyncLane = { threw: false, count: ac }; }',
    'catch (e) { out.asyncLane = { threw: true, msg: msgOf(e), count: ac }; }',
    'let unh = 0, rc = 0;',
    "process.on('unhandledRejection', () => { unh++; });",
    "const rejLane = (i) => { rc++; return Promise.reject(new Error('lane-rejected')); };",
    'try { M.measureLane(rejLane, 1e4, 3, 1e3, 1e2); out.rejLane = { threw: false, count: rc }; }',
    'catch (e) { out.rejLane = { threw: true, msg: msgOf(e), count: rc }; }',
    'await new Promise((r) => setImmediate(r));',
    'await new Promise((r) => setImmediate(r));',
    'out.unhandled = unh;',
    "const sp = (n) => ({ space_name: n, space_used_size: 0, space_size: 0, space_available_size: 0, physical_space_size: 0 });",
    "const three = ['new_space', 'old_space', 'large_object_space'].map(sp);",
    "const four = ['new_space', 'old_space', 'large_object_space', 'new_large_object_space'].map(sp);",
    'try { M.needEnv(three); out.env3 = { threw: false }; } catch (e) { out.env3 = { threw: true, msg: msgOf(e) }; }',
    'try { M.needEnv(four); out.env4 = { threw: false }; } catch (e) { out.env4 = { threw: true, msg: msgOf(e) }; }',
    'let sc = 0;',
    'try { M.measureLane((i) => { sc++; }, 2e8, 3, 0, 1e4); out.subsCap = { threw: false, count: sc }; }',
    'catch (e) { out.subsCap = { threw: true, name: e && e.name, msg: msgOf(e), count: sc }; }',
    'console.log(JSON.stringify(out));',
];
test('A6 row 2 (child, --expose-gc): an async lane throws and its body counter stays 0', () => {
    const o = live('a6', A6_BODY);
    // Must-fail mutant: the Object.prototype.toString allowlist removed (the async body runs, counter >= 1, or no throw).
    assert.equal(o.asyncLane.threw, true, 'async lane was not refused');
    // C-8 "each matching its own message": /AsyncFunction/ is in the kind check's message only; the thenable message has no
    // "AsyncFunction" (and this row's message has no "thenable"), so neither regex matches the other row's message.
    assert.match(o.asyncLane.msg, /AsyncFunction/);
    assert.doesNotMatch(o.asyncLane.msg, /thenable/, 'async lane refused by the thenable check (wrong check)');
    assert.doesNotMatch(o.asyncLane.msg, /--expose-gc/, 'refused for the wrong reason (env)');
    assert.equal(o.asyncLane.count, 0);
});
test('A6 row 3 (child): a lane returning Promise.reject() throws, 0 unhandledRejection after 2 setImmediate turns', () => {
    const o = live('a6', A6_BODY);
    // Must-fail mutants: the .then guard removed (unhandled 1); the thenable not refused (threw false).
    assert.equal(o.rejLane.threw, true, 'a Promise-returning lane was not refused');
    assert.match(o.rejLane.msg, /thenable/);
    assert.doesNotMatch(o.rejLane.msg, /AsyncFunction/, 'Promise lane refused by the kind check (wrong check)');
    assert.equal(o.rejLane.count, 1, 'the Promise-returning lane must run exactly once (fn(0)) before the thenable refusal');
    assert.doesNotMatch(o.rejLane.msg, /--expose-gc/, 'refused for the wrong reason (env)');
    assert.equal(o.unhandled, 0);
});
test('A6 row 4 (child): needEnv(listing) with 3 spaces throws naming new_large_object_space; the 4-space listing is accepted', () => {
    const o = live('a6', A6_BODY);
    // Must-fail mutant: the SPACES presence check removed (row 4 does not throw). The 4-space control proves the
    // refusal is the missing space, not something else reachable with valid input.
    assert.equal(o.env4.threw, false, `a complete listing was refused: ${o.env4.msg}`);
    assert.equal(o.env3.threw, true, 'a 3-space listing was not refused');
    assert.match(o.env3.msg, /new_large_object_space/);
    assert.doesNotMatch(o.env3.msg, /--expose-gc/);
});

test('A6 row 5 (child): n / sub = 2e8 / 1e4 = 20000 > 10000 throws RangeError naming the bound, lane called 0 times', () => {
    const o = live('a6', A6_BODY);
    // Must-fail mutant (SubsCap): the E1 n / sub cap removed (no throw, or the lane runs). Hand: 2e8 / 1e4 = 2e4; cap 1e4 (G2 bound).
    assert.equal(o.subsCap.threw, true, 'n / sub 20000 was not refused');
    assert.equal(o.subsCap.name, 'RangeError');
    assert.match(o.subsCap.msg, /n \/ sub = 20000 > 10000/);
    assert.equal(o.subsCap.count, 0);
});

// ================= A7 live: B1 part (measureLane, DRIVER_SEQ) =================
const A7_BODY = [
    'const out = {};',
    'const f64 = new Float64Array(1);',
    'const lf64 = (i) => { f64[0] = i; };',
    'let sink = null;',
    'const lbox = (i) => { sink = { v: i }; };',
    'const seq0 = M.DRIVER_SEQ;',
    'const rf = M.measureLane(lf64, 1e6, 5, 2e5, 1e4);',
    'const rb = M.measureLane(lbox, 1e6, 5, 2e5, 1e4);',
    'out.seqAdded = M.DRIVER_SEQ - seq0;',
    'const row = (r) => ({ len: r.windows.length, peak: r.peak, mean: r.mean, voids: r.voids, voidAt: r.voidAt, retries: r.retries, nulls: r.windows.filter((x) => x === null).length, retriesInt: Number.isInteger(r.retries), voidsInt: Number.isInteger(r.voids) });',
    'out.f64 = row(rf);',
    'out.box = row(rb);',
    'console.log(JSON.stringify(out));',
];
test('A7 live (B1): f64 lane at N 1e6 sub 1e4 K 5 warm 2e5: 5 windows, voids === null count, retries integer, peak < 1', () => {
    const o = live('a7a', A7_BODY);
    // Must-fail mutants: windows.length K-1; voids counted over 1..K-1 only; peak = min (can read < 1 on a box lane, see box row).
    const f = o.f64;
    assert.equal(f.len, 5);
    assert.equal(f.voids, f.nulls);
    assert.ok(f.voidsInt && f.retriesInt, 'voids / retries must be integers');
    assert.equal(typeof f.peak, 'number', `f64 peak is ${f.peak} (a VOID window 1..K-1 nulls it)`);
    assert.ok(f.peak < 1, `f64 peak ${f.peak} not < 1`);
});
test('A7 live (B1): box lane ({v:i}, about 32 B per op) peak >= 8 and < 64, windows 5, retries integer', () => {
    const o = live('a7a', A7_BODY);
    // Must-fail mutants: the lane not driven (peak 0); per-window sum not divided by n (peak huge is caught by the f64 row; a
    // /sub divisor gives 1600 -- here the floor only bounds from below, so also assert the box is below the 64 B/op ceiling).
    const b = o.box;
    assert.equal(b.len, 5);
    assert.equal(b.voids, b.nulls);
    assert.ok(b.voidsInt && b.retriesInt);
    assert.equal(typeof b.peak, 'number', `box peak is ${b.peak}`);
    assert.ok(b.peak >= 8, `box peak ${b.peak} not >= 8`);
    assert.ok(b.peak < 64, `box peak ${b.peak} is not near 16 B/op (a wrong divisor)`);
});
test('A7 live (B1): two measureLane calls add exactly 2 to DRIVER_SEQ', () => {
    const o = live('a7a', A7_BODY);
    // Must-fail mutant: the driver cached across calls (adds 1), or built per window (adds 10).
    assert.equal(o.seqAdded, 2);
});

// measureLane with an injected bracket: n 4, sub 2, K 3, warm 0 = 2 sandwiches x 3 brackets per window, 18 calls. Calls 6-8
// (window 1's first sandwich) report a GC. Hand: a clean sandwich adds 16 (z 0, r 16), a window sums 32, 32 / 4 = 8.
const A7C_BODY = [
    'let calls = 0;',
    'const bracket = (fn, drive, m, D) => { const c = calls++; D[0] = m === 0 ? 0 : 16; D[1] = D[2] = D[3] = 0; return (c >= 6 && c <= 8) ? 1 : 0; };',
    'const r = M.measureLane((i) => {}, 4, 3, 0, 2, bracket);',
    'console.log(JSON.stringify({ windows: r.windows, peak: r.peak, mean: r.mean, voids: r.voids, voidAt: r.voidAt, retries: r.retries, calls }));',
];
test('A7 live (B1): measureLane writes a VOID window as null, never a number (voids 1, voidAt 1, peak null)', () => {
    const o = live('a7c', A7C_BODY);
    // Must-fail mutant: measureLane writes a VOID window as a number (windows[1] 4).
    assert.deepEqual(o.windows, [8, null, 8]);
    assert.equal(o.voids, 1);
    assert.equal(o.voidAt, 1);
    assert.equal(o.peak, null);
    assert.equal(o.mean, null);
    assert.equal(o.retries, 0);
    assert.equal(o.calls, 18);
});

// ================= A7 live: B2 part (selfCheck, fenceCheck, injected controls) =================
const A7B_BODY = [
    'const out = { have: { selfCheck: typeof M.selfCheck === "function", fenceCheck: typeof M.fenceCheck === "function", CONTROLS: typeof M.CONTROLS === "object" && M.CONTROLS !== null } };',
    'const N = 1e6, K = 5, W = 2e5, S = 1e4;',
    'const brief = (sc) => ({ ok: sc.ok, reason: sc.reason, fenceRecorded: sc.fence && sc.fence.recorded, fenceForced: sc.fence && sc.fence.forced, boxPeak: sc.box && sc.box.peak, emptyPeak: sc.empty && sc.empty.peak });',
    'if (out.have.selfCheck && out.have.CONTROLS) {',
    '  const C = M.CONTROLS;',
    '  out.sc = brief(M.selfCheck(N, K, W, S));',
    '  out.swap = brief(M.selfCheck(N, K, W, S, { positive: C.negative, negative: C.positive, Profiler: C.Profiler }));',
    '  out.posBad = brief(M.selfCheck(N, K, W, S, { positive: C.negative, negative: C.negative, Profiler: C.Profiler }));',
    '  out.negBad = brief(M.selfCheck(N, K, W, S, { positive: C.positive, negative: C.positive, Profiler: C.Profiler }));',
    '  class Stub { start() {} stop() { return { statistics: [] }; } }',
    '  out.fenceBad = brief(M.selfCheck(N, K, W, S, { positive: C.positive, negative: C.negative, Profiler: Stub }));',
    '}',
    'if (out.have.fenceCheck) {',
    '  class Stub2 { start() {} stop() { return { statistics: [] }; } }',
    '  out.fence = M.fenceCheck();',
    '  out.fenceStub = M.fenceCheck(Stub2);',
    '}',
    'console.log(JSON.stringify(out));',
];
test('A7 live (B2): selfCheck passes with fence.recorded >= 1 (and the box / empty controls are what the contract says)', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: selfCheck not exported (red by name), or ok forced false / true (see the injected rows).
    assert.ok(o.have.selfCheck, 'selfCheck not exported (G1 B2)');
    assert.ok(o.have.CONTROLS, 'CONTROLS not exported (G1 B2)');
    assert.equal(o.sc.ok, true, `selfCheck not ok: ${o.sc.reason}`);
    assert.ok(o.sc.fenceRecorded >= 1, `fence.recorded ${o.sc.fenceRecorded} not >= 1`);
    assert.ok(o.sc.boxPeak >= 8, `box peak ${o.sc.boxPeak} not >= 8 (POS_MIN_BPO)`);
});
test('A7 live (B2): fenceCheck() forces one GC and records >= 1; a 0-recording Profiler stub records 0', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutants: forced reported as the recorded count (stub row recorded 1); no forced GC (recorded 0 on the real Profiler).
    assert.ok(o.have.fenceCheck, 'fenceCheck not exported (G1 B2)');
    assert.equal(o.fence.forced, 1);
    assert.ok(o.fence.recorded >= 1, `real fence recorded ${o.fence.recorded}`);
    assert.equal(o.fenceStub.forced, 1);
    assert.equal(o.fenceStub.recorded, 0);
});
test('A7 live (B2): positive control wrong (f64 as the positive) gives ok false, reason /^positive/', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: the positive check dropped (ok stays true) or the reason prefix not the control name.
    assert.ok(o.have.selfCheck && o.have.CONTROLS, 'selfCheck / CONTROLS not exported (G1 B2)');
    assert.equal(o.posBad.ok, false);
    assert.match(String(o.posBad.reason), /^positive/);
});
test('A7 live (B2): negative control wrong (box as the negative) gives ok false, reason /^negative/', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: the negative band check dropped.
    assert.ok(o.have.selfCheck && o.have.CONTROLS, 'selfCheck / CONTROLS not exported (G1 B2)');
    assert.equal(o.negBad.ok, false);
    assert.match(String(o.negBad.reason), /^negative/);
});
test('A7 live (B2): a 0-recording Profiler stub gives ok false, reason /^fence/ (every other control valid)', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: the fence not part of ok.
    assert.ok(o.have.selfCheck && o.have.CONTROLS, 'selfCheck / CONTROLS not exported (G1 B2)');
    assert.equal(o.fenceBad.ok, false);
    assert.match(String(o.fenceBad.reason), /^fence/);
});
test('A7 live (B2): positive / negative swapped gives ok false and names a control', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: a swap that still passes (no direction check). Both controls are wrong, so either name is accepted.
    assert.ok(o.have.selfCheck && o.have.CONTROLS, 'selfCheck / CONTROLS not exported (G1 B2)');
    assert.equal(o.swap.ok, false);
    assert.match(String(o.swap.reason), /^(positive|negative)/);
});

// selfCheck with a VOID / null in the NEGATIVE row (positive control is the default box lane, so the negative check is reached,
// LEDGER #132). N 1e5, K 3, WM 1e4, S 1e3. vneg0: ONE minor GC inside window 0's first measured bracket (call count
// 1 + WM + 1 = 2 + WM: fn(0), warm, then the first r call) -> window 0 VOID only. vnull: a GC at i === 0, the first
// call of every measured (r) bracket (the twin brackets run m = 0 ops) -> every window VOID, peak null.
const A7D_BODY = [
    'const out = {};',
    'const N = 1e5, K = 3, WM = 1e4, S = 1e3;',
    'const C = M.CONTROLS;',
    "const g = () => gc({ type: 'minor', execution: 'sync' });",
    'const brief = (sc) => ({ ok: sc.ok, reason: sc.reason, boxPeak: sc.box && sc.box.peak, emptyW: sc.empty && sc.empty.windows, emptyPeak: sc.empty && sc.empty.peak, emptyVoids: sc.empty && sc.empty.voids });',
    'let c = 0;',
    'const vneg0 = (i) => { if (++c === 2 + WM) g(); };',
    'const vnull = (i) => { if (i === 0) g(); };',
    'out.vneg0 = brief(M.selfCheck(N, K, WM, S, { positive: C.positive, negative: vneg0, Profiler: C.Profiler }));',
    'out.vnull = brief(M.selfCheck(N, K, WM, S, { positive: C.positive, negative: vnull, Profiler: C.Profiler }));',
    'console.log(JSON.stringify(out));',
];
test('A7 live (B2): a VOID only in the negative row window 0 is ok false, /^negative/ naming window 0 (C-11)', () => {
    const o = live('a7d', A7D_BODY);
    // Must-fail mutants: ScVoid (row-miss returns '' on a VOID), ScVoidOnly (voids check + window loop dropped), PrefixRow ('neg: ' prefix).
    assert.ok(o.vneg0.boxPeak >= 8, `positive control must pass first (box peak ${o.vneg0.boxPeak}), else the negative check is never reached`);
    assert.equal(o.vneg0.ok, false);
    assert.match(String(o.vneg0.reason), /^negative/);
    assert.match(String(o.vneg0.reason), /window 0/);
    assert.equal(o.vneg0.emptyW[0], null);
});
test('A7 live (B2): a null negative peak (a VOID in every measured bracket) is ok false, /^negative/, empty.peak null', () => {
    const o = live('a7d', A7D_BODY);
    // Must-fail mutants: null treated as 0 in the negative band check; ScVoid / PrefixRow as above.
    assert.ok(o.vnull.boxPeak >= 8, `positive control must pass first (box peak ${o.vnull.boxPeak})`);
    assert.equal(o.vnull.ok, false);
    assert.match(String(o.vnull.reason), /^negative/);
    assert.equal(o.vnull.emptyPeak, null);
});

// Options bag read through the prototype chain (fail-open): Object.prototype carries the three control names.
const A7P_BODY = [
    'const out = {};',
    'let pc = 0, nc = 0, prc = 0;',
    'Object.prototype.positive = (i) => { pc++; };',
    'Object.prototype.negative = (i) => { nc++; };',
    'function P() { prc++; }',
    'P.prototype.start = () => {};',
    'P.prototype.stop = () => ({ statistics: [0] });',
    'Object.prototype.Profiler = P;',
    'try { M.selfCheck(1e5, 3, 1e3, 1e3, {}); out.r = { threw: false }; }',
    'catch (e) { out.r = { threw: true, name: e && e.name, msg: String(e && e.message) }; }',
    'delete Object.prototype.positive; delete Object.prototype.negative; delete Object.prototype.Profiler;',
    'out.pc = pc; out.nc = nc; out.prc = prc;',
    'console.log(JSON.stringify(out));',
];
test('A7 live (B2): selfCheck(..., {}) with controls only on Object.prototype throws TypeError before any lane call', () => {
    const o = live('a7p', A7P_BODY);
    // Must-fail mutant: the controls bag read through the prototype chain (no own-key check): {} passes, the prototype lanes run.
    assert.equal(o.r.threw, true, 'a bag with no own controls was accepted via the prototype chain');
    assert.equal(o.r.name, 'TypeError');
    assert.match(o.r.msg, /positive/);
    assert.equal(o.pc, 0);
    assert.equal(o.nc, 0);
    assert.equal(o.prc, 0);
});

// ================= A8 live: runSelfTestLanes =================
const A8_BODY = [
    'const out = { have: typeof M.runSelfTestLanes === "function", lanes: typeof M.SELF_TEST_LANES };',
    'if (out.have) out.rows = M.runSelfTestLanes().map((r) => ({ name: r.name, verdict: r.verdict, want: r.want, ok: r.ok, peak: r.peak, retries: r.retries, voids: r.voids }));',
    'console.log(JSON.stringify(out));',
];
// TASK 6 table (SPEC): accepted verdicts per row
const A8_WANT = { clean: ['PASS'], box: ['FAIL'], C1: ['FAIL', 'NO VERDICT'], C2: ['FAIL', 'NO VERDICT'], refusal: ['NO VERDICT'] };
test('A8 live: runSelfTestLanes rows are exactly clean / box / C1 / C2 / refusal', () => {
    const o = live('a8', A8_BODY);
    // Must-fail mutant: a row dropped or renamed.
    assert.ok(o.have, 'runSelfTestLanes not exported (G1 B2)');
    assert.equal(o.lanes, 'object', 'SELF_TEST_LANES not exported (G1 B2)');
    assert.equal(o.rows.length, 5, 'rows.length');
    assert.deepEqual(o.rows.map((r) => r.name), ['clean', 'box', 'C1', 'C2', 'refusal']);
});
// C-11 in the verdict: stop #2 of the wrapped GCProfiler is the clean row's window 0, sub-window 0, measured bracket -> a GC.
const A8V_BODY = [
    "import v8 from 'node:v8';",
    'const Orig = v8.GCProfiler;',
    'let stops = 0;',
    'v8.GCProfiler = class extends Orig { stop() { const r = super.stop(); stops++; return stops === 2 ? { statistics: [0] } : r; } };',
    'const c = M.runSelfTestLanes()[0];',
    'console.log(JSON.stringify({ name: c.name, voids: c.voids, verdict: c.verdict, ok: c.ok, stops }));',
];
test('A8 live: a VOID in the clean row window 0 makes the row NO VERDICT and ok false (C-11)', () => {
    const o = live('a8v', A8V_BODY);
    // Must-fail mutant (StVoid): the verdict not forced to NO VERDICT on a VOID (peak from windows 1..K-1 would read PASS).
    assert.equal(o.name, 'clean');
    assert.ok(o.voids >= 1, `voids ${o.voids}: the injected GC did not VOID window 0`);
    assert.equal(o.verdict, 'NO VERDICT');
    assert.equal(o.ok, false);
});
test('A8 live: every row verdict is in its TASK 6 accepted set and its ok is true', () => {
    const o = live('a8', A8_BODY);
    // Must-fail mutant: peak = min (d4386d85 STEADY) makes C1 and C2 PASS (E5), outside {FAIL, NO VERDICT}.
    assert.ok(o.have, 'runSelfTestLanes not exported (G1 B2)');
    assert.equal(o.rows.length, 5, 'rows.length (a missing row must fail by name, never vacuously)');
    for (const r of o.rows) {
        const want = A8_WANT[r.name];
        assert.deepEqual(r.want, want, `${r.name}: row want differs from the TASK 6 table`);
        assert.ok(want, `unexpected row ${r.name}`);
        assert.ok(want.includes(r.verdict), `${r.name}: verdict ${r.verdict} not in [${want.join(', ')}]`);
        assert.equal(r.ok, true, `${r.name}: ok false`);
        assert.ok(Array.isArray(r.want) && r.want.includes(r.verdict), `${r.name}: want ${JSON.stringify(r.want)} does not hold the verdict`);
        assert.ok(Number.isInteger(r.retries) && Number.isInteger(r.voids), `${r.name}: retries / voids not integers`);
    }
});
