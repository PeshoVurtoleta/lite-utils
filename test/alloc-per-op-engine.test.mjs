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
// .handoff/b88/evidence/caps.txt: worst child a7b on v22.23.5 997.0 ms x 10 = 9970, rounded up; b88 local census, PRELIMINARY
const LIVE_CAP_MS = 10000;

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
    "const N8 = ['new_space', 'old_space', 'large_object_space', 'new_large_object_space', 'code_space', 'trusted_space', 'code_large_object_space', 'trusted_large_object_space'];",
    'try { M.needEnv(three); out.env3 = { threw: false }; } catch (e) { out.env3 = { threw: true, msg: msgOf(e) }; }',
    'try { M.needEnv(four); out.env4 = { threw: false }; } catch (e) { out.env4 = { threw: true, msg: msgOf(e) }; }',
    'try { M.needEnv(N8.map(sp)); out.env8 = { threw: false }; } catch (e) { out.env8 = { threw: true, msg: msgOf(e) }; }',
    'out.envRm = N8.map((nm) => { try { M.needEnv(N8.filter((x) => x !== nm).map(sp)); return { nm, threw: false }; } catch (e) { return { nm, threw: true, msg: msgOf(e) }; } });',
    'const lanesX = [[(i) => ({ v: i }), 1], [(i) => i + 0.5, 2], [(i) => null, 3]];',
    'out.x1 = {};',
    'for (const [ln, id] of lanesX) { let k = 0; const w = (i) => { k++; return ln(i); };',
    '  try { M.measureLane(w, 1e4, 3, 1e3, 1e2); out.x1[id] = { threw: false, count: k }; }',
    '  catch (e) { out.x1[id] = { threw: true, name: e && e.name, msg: msgOf(e), count: k }; } }',
    'let n4c = 0;',
    'try { M.measureLane((i) => { n4c++; }, 10001, 3, 0, 1, () => 0); out.n4a = { threw: false, count: n4c }; }',
    'catch (e) { out.n4a = { threw: true, name: e && e.name, msg: msgOf(e), count: n4c }; }',
    'let n4d = 0;',
    'try { M.measureLane((i) => { n4d++; }, 10000, 3, 0, 1, () => 0); out.n4b = { threw: false }; }',
    'catch (e) { out.n4b = { threw: true, name: e && e.name, msg: msgOf(e) }; }',
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
test('A6 row 4 (child): needEnv(listing) per C-8: the 8-name listing is accepted; each name of SPACES / XSPACES removed is refused naming it; the 4-name listing is refused naming code_space', () => {
    const o = live('a6', A6_BODY);
    // Must-fail mutant: the XSPACES presence check removed (the 4-name listing / a missing code or trusted name is accepted).
    // The 8-name control proves the refusals are the missing name, not something else reachable with valid input.
    assert.equal(o.env8.threw, false, `a complete 8-name listing was refused: ${o.env8.msg}`);
    assert.equal(o.envRm.length, 8);
    for (const r of o.envRm) {
        assert.equal(r.threw, true, `listing without ${r.nm} was not refused`);
        assert.match(r.msg, new RegExp(r.nm), `refusal does not name ${r.nm}: ${r.msg}`);
        assert.doesNotMatch(r.msg, /--expose-gc/);
    }
    assert.equal(o.env4.threw, true, 'the 4-SPACES listing (no XSPACES names) was accepted');
    assert.match(o.env4.msg, /code_space/);
    assert.equal(o.env3.threw, true, 'a 3-space listing was not refused');
    assert.match(o.env3.msg, /new_large_object_space/);
    assert.doesNotMatch(o.env3.msg, /--expose-gc/);
});

// E1 (S-A40): a lane whose fn(0) returns a value is refused; the lane has run exactly once. Red on 3641eba (no refusal).
for (const [id, label] of [[1, '{ v: i }'], [2, 'i + 0.5'], [3, 'null']]) {
    test(`A6 X1 row ${id} (child): a lane returning ${label} throws TypeError /returned a value/ with calls === 1`, () => {
        const o = live('a6', A6_BODY);
        // Must-fail mutants: typeof r0 === 'object' (turns the i + 0.5 row red); r0 != null (turns the null row red).
        const x = o.x1[id];
        assert.equal(x.threw, true, `a lane returning ${label} was not refused`);
        assert.equal(x.name, 'TypeError');
        assert.match(x.msg, /returned a value/);
        assert.doesNotMatch(x.msg, /thenable|AsyncFunction|--expose-gc/, 'refused by the wrong check');
        assert.equal(x.count, 1);
    });
}

// E10 / N4: the n / sub cap boundary pair. Regression pin on 3641eba (the cap exists there); the mutant is SubsCap.
test('A6 N4 (child): n / sub = 10001 > 10000 throws RangeError with the lane called 0 times; n / sub = 10000 is accepted', () => {
    const o = live('a6', A6_BODY);
    assert.equal(o.n4a.threw, true, 'n 10001 / sub 1 was not refused');
    assert.equal(o.n4a.name, 'RangeError');
    assert.match(o.n4a.msg, /n \/ sub = 10001 > 10000/);
    assert.equal(o.n4a.count, 0);
    assert.equal(o.n4b.threw, false, `n 10000 / sub 1 was refused: ${o.n4b.msg}`);
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
    'const brief = (sc) => ({ ok: sc.ok, reason: sc.reason, fenceRecorded: sc.fence && sc.fence.recorded, fenceForced: sc.fence && sc.fence.forced, boxPeak: sc.box && sc.box.peak, emptyPeak: sc.empty && sc.empty.peak, misses: sc.misses ? { keys: Object.keys(sc.misses), positive: sc.misses.positive, negative: sc.misses.negative, fence: sc.misses.fence } : null });',
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
// (the old reason-keyed negative-control and 0-recording-Profiler rows were replaced by E7b / E7c below: they were the CI flake, run 44252735142)
test('A7 live (B2): positive / negative swapped gives ok false and names a control', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: a swap that still passes (no direction check). Both controls are wrong, so either name is accepted.
    assert.ok(o.have.selfCheck && o.have.CONTROLS, 'selfCheck / CONTROLS not exported (G1 B2)');
    assert.equal(o.swap.ok, false);
    assert.match(String(o.swap.reason), /^(positive|negative)/);
});

// E7 (S-A43): selfCheck judges each control on its own: misses { positive, negative, fence }, each '' or that control's prefixed reason;
// reason = the first non-empty miss in the order positive, negative, fence; ok = reason === ''. Red on 3641eba (no misses).
test('A7 E7a: misses has exactly the 3 own string keys; reason is the first non-empty miss (positive, negative, fence); ok iff reason is empty', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: a key missing / extra, or reason built in another order.
    for (const k of ['sc', 'swap', 'posBad', 'negBad', 'fenceBad']) {
        const r = o[k];
        assert.ok(r && r.misses, `${k}: selfCheck returned no misses (S-A43)`);
        assert.deepEqual([...r.misses.keys].sort(), ['fence', 'negative', 'positive'], `${k}: misses own keys`);
        for (const c of ['positive', 'negative', 'fence']) assert.equal(typeof r.misses[c], 'string', `${k}.misses.${c} not a string`);
        const first = ['positive', 'negative', 'fence'].map((c) => r.misses[c]).find((m) => m !== '') || '';
        assert.equal(r.reason, first, `${k}: reason is not the first non-empty miss`);
        assert.equal(r.ok, r.reason === '', `${k}: ok !== (reason === '')`);
    }
});
test('A7 E7b: negative control wrong (this is the old :458 row, now reached on every leg): misses.negative /^negative/', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: the negative check skipped, or its text not prefixed with the control name.
    assert.ok(o.negBad.misses, 'no misses (S-A43)');
    assert.match(String(o.negBad.misses.negative), /^negative/);
    // only the claimed control's miss is judged: a noisy-leg GC may VOID the positive window (#132)
});
test('A7 E7c: a 0-recording Profiler stub (the old :465 row): misses.fence /^fence: recorded 0 < forced 1/', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: the fence miss dropped from misses.
    assert.ok(o.fenceBad.misses, 'no misses (S-A43)');
    assert.match(String(o.fenceBad.misses.fence), /^fence: recorded 0 < forced 1/);
});
test('A7 E7d: positive / negative swapped sets BOTH misses.positive and misses.negative (no skipping the negative check after a positive miss)', () => {
    const o = live('a7b', A7B_BODY);
    // Must-fail mutant: "skip negative after a positive miss".
    assert.ok(o.swap.misses, 'no misses (S-A43)');
    assert.match(String(o.swap.misses.positive), /^positive/);
    assert.match(String(o.swap.misses.negative), /^negative/);
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
    'const brief = (sc) => ({ ok: sc.ok, reason: sc.reason, boxPeak: sc.box && sc.box.peak, emptyW: sc.empty && sc.empty.windows, emptyPeak: sc.empty && sc.empty.peak, emptyVoids: sc.empty && sc.empty.voids, misses: sc.misses ? { negative: sc.misses.negative } : null });',
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
    // E7e (S-A43): keyed on misses.negative, so no box precondition: the negative check is judged on its own, on every leg.
    assert.ok(o.vneg0.misses, 'no misses (S-A43)');
    assert.equal(o.vneg0.ok, false);
    assert.match(String(o.vneg0.misses.negative), /^negative/);
    assert.match(String(o.vneg0.misses.negative), /window 0/);
    assert.equal(o.vneg0.emptyW[0], null);
});
test('A7 live (B2): a null negative peak (a VOID in every measured bracket) is ok false, /^negative/, empty.peak null', () => {
    const o = live('a7d', A7D_BODY);
    // Must-fail mutants: null treated as 0 in the negative band check; ScVoid / PrefixRow as above.
    assert.ok(o.vnull.misses, 'no misses (S-A43)');
    assert.equal(o.vnull.ok, false);
    assert.match(String(o.vnull.misses.negative), /^negative/);
    assert.equal(o.vnull.emptyPeak, null);
});

// E7f / K1 (S-A44): a VOID in the POSITIVE row window 0 only. The positive lane is a box lane (so the rest of the row reads > POS_MIN_BPO)
// that takes one minor GC at call 2 + WM (fn(0), WM warm calls, then the first measured call: window 0, sub-window 0, bracket r).
// Kills mutant A7-PrefixPosRow (the row-miss prefix 'pos: ' instead of 'positive: ').
const A7K_BODY = [
    'const out = {};',
    'const N = 1e5, K = 3, WM = 1e4, S = 1e3;',
    'const C = M.CONTROLS;',
    "const g = () => gc({ type: 'minor', execution: 'sync' });",
    'let c = 0, sink = null;',
    'const vpos0 = (i) => { sink = { v: i }; if (++c === 2 + WM) g(); };',
    'const sc = M.selfCheck(N, K, WM, S, { positive: vpos0, negative: C.negative, Profiler: C.Profiler });',
    'out.k1 = { ok: sc.ok, reason: sc.reason, pos: sc.misses ? sc.misses.positive : null, w0: sc.box && sc.box.windows ? sc.box.windows[0] : undefined };',
    'console.log(JSON.stringify(out));',
];
test('A7 E7f K1: a VOID only in the positive row window 0 is ok false, reason /^positive/ naming window 0, box.windows[0] === null', () => {
    const o = live('a7k', A7K_BODY).k1;
    // Must-fail mutant: A7-PrefixPosRow ('pos: ' prefix on a positive row-miss). Red on 3641eba (no misses).
    assert.equal(o.w0, null, 'the injected GC did not VOID window 0 of the positive row');
    assert.equal(o.ok, false);
    assert.match(String(o.reason), /^positive/);
    assert.match(String(o.reason), /window 0/);
    assert.ok(o.pos !== null, 'no misses (S-A43)');
    assert.match(String(o.pos), /^positive/);
    assert.match(String(o.pos), /window 0/);
});

// E7g (S-A42): a v8.GCProfiler wrapper installed AFTER import: ctl.Profiler is no longer the live export -> a fence miss naming it.
// The wrapper passes through; only misses.fence is judged (a noisy-leg GC could set another miss first). Red on 3641eba (ok true).
const A7G_BODY = [
    "import v8 from 'node:v8';",
    'const Orig = v8.GCProfiler;',
    'v8.GCProfiler = class extends Orig { };',
    'const sc = M.selfCheck(1e5, 3, 1e4, 1e3);',
    'console.log(JSON.stringify({ ok: sc.ok, reason: sc.reason, misses: sc.misses || null }));',
];
test('A7 E7g: a v8.GCProfiler wrapper installed after import gives ok false and misses.fence /live v8\\.GCProfiler/', () => {
    const o = live('a7g', A7G_BODY);
    assert.equal(o.ok, false, 'a replaced v8.GCProfiler was not fenced');
    assert.ok(o.misses, 'no misses (S-A43)');
    assert.match(String(o.misses.fence), /live v8\.GCProfiler/);
});

// E7h (coder survivor reason-order-fence-first, reason = fence || positive || negative): a positive-control miss AND a 0-recording
// Profiler together: reason is the FIRST non-empty miss in the order positive, negative, fence, so it names the positive control, while
// misses.fence is still set. Only these two are asserted (nothing about negative: #132).
const A7H_BODY = [
    'const C = M.CONTROLS;',
    'class Stub { start() {} stop() { return { statistics: [] }; } }',
    'const sc = M.selfCheck(1e6, 5, 2e5, 1e4, { positive: C.negative, negative: C.negative, Profiler: Stub });',
    'console.log(JSON.stringify({ ok: sc.ok, reason: sc.reason, fence: sc.misses ? sc.misses.fence : null }));',
];
test('A7 E7h: a positive-control miss plus a 0-recording Profiler: reason /^positive/ (order positive, negative, fence), misses.fence non-empty', () => {
    const o = live('a7h', A7H_BODY);
    assert.match(String(o.reason), /^positive/);
    assert.equal(typeof o.fence, 'string', 'no misses.fence (S-A43)');
    assert.notEqual(o.fence, '');
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
    "out.laneNames = Array.isArray(M.SELF_TEST_LANES) ? M.SELF_TEST_LANES.map((r) => r.name) : null;",
    'console.log(JSON.stringify(out));',
];
// TASK 6 table (SPEC): accepted verdicts per row
const A8_WANT = { clean: ['PASS'], box: ['FAIL'], C1: ['FAIL', 'NO VERDICT'], C2: ['FAIL', 'NO VERDICT'], refusal: ['NO VERDICT'], old: ['FAIL', 'NO VERDICT'], nlo: ['FAIL', 'NO VERDICT'] };
test('A8 live: runSelfTestLanes rows are exactly clean / box / C1 / C2 / refusal / old / nlo, in the SELF_TEST_LANES order (S-A41, N5)', () => {
    const o = live('a8', A8_BODY);
    // Must-fail mutant: a row dropped or renamed.
    assert.ok(o.have, 'runSelfTestLanes not exported (G1 B2)');
    assert.equal(o.lanes, 'object', 'SELF_TEST_LANES not exported (G1 B2)');
    assert.equal(o.rows.length, 7, 'rows.length');
    assert.deepEqual(o.rows.map((r) => r.name), ['clean', 'box', 'C1', 'C2', 'refusal', 'old', 'nlo']);
    assert.deepEqual(o.laneNames, ['clean', 'box', 'C1', 'C2', 'refusal', 'old', 'nlo'], 'N5: SELF_TEST_LANES order');
});
for (const [nm, what] of [['old', 'Symbol() per op, max 4'], ['nlo', 'a 100000-slot array every 5000 calls, max 10']]) {
    test(`A8 live: the ${nm} row (${what}) is present, ok, and its verdict is in its own want set [FAIL, NO VERDICT] (S-A41)`, () => {
        const o = live('a8', A8_BODY);
        // Must-fail mutants: readS skips slot 1 (old reads PASS) / slot 3 (nlo reads PASS). The set is not FAIL-only: a VOID gives NO VERDICT,
        // and a Symbol's size differs across pointer-compression builds, so no peak is pinned (flake-proof).
        const r = (o.rows || []).find((x) => x.name === nm);
        assert.ok(r, `no ${nm} row (S-A41)`);
        assert.deepEqual(r.want, ['FAIL', 'NO VERDICT']);
        assert.ok(['FAIL', 'NO VERDICT'].includes(r.verdict), `${nm}: verdict ${r.verdict} (PASS = a space is not read)`);
        assert.equal(r.ok, true);
    });
}
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
    assert.equal(o.rows.length, 7, 'rows.length (a missing row must fail by name, never vacuously)');
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

// ================= b88 H1b: E2 (read set), E3, E5, E8, E9, E11 =================
// E2: a scripted v8.getHeapSpaceStatistics (8 names) and a GCProfiler stub that records 0 GCs, so every row is deterministic.
// Each step is one bracket: the listing B minus the listing A (new_space, old_space, code_space, trusted_space, code_large, trusted_large).
// Slots (S-A38): new_space 0, old_space 1, large_object_space 2, new_large_object_space 3; code_space + trusted_space -> 1; code_large + trusted_large -> 2.
const E2_BODY = [
    "import v8 from 'node:v8';",
    "v8.GCProfiler = class { start() {} stop() { return { statistics: [] }; } };",
    "const N8 = ['new_space', 'old_space', 'large_object_space', 'new_large_object_space', 'code_space', 'trusted_space', 'code_large_object_space', 'trusted_large_object_space'];",
    'const REAL = v8.getHeapSpaceStatistics;',
    // script(steps, dropName): steps[b] = { name: delta } per bracket; read 2b is A, read 2b + 1 is B; a call past the script throws
    'function script(steps, drop) {',
    '  const used = {}; for (const n of N8) used[n] = 1e7;',
    '  let calls = 0;',
    '  v8.getHeapSpaceStatistics = () => {',
    '    const b = calls >> 1;',
    "    if (b >= steps.length) throw new Error('scripted listing: past the script');",
    '    if (calls & 1) for (const k of Object.keys(steps[b])) used[k] += steps[b][k];',
    '    calls++;',
    '    return N8.filter((n) => n !== drop).map((n) => ({ space_name: n, space_size: 0, space_used_size: used[n], space_available_size: 0, physical_space_size: 0 }));',
    '  };',
    '  return () => calls >> 1;',
    '}',
    'function replay(steps, drop) {',
    '  const brackets = script(steps, drop);',
    '  const D = new Float64Array(4), OUT = new Float64Array(1), ST = new Int32Array(1);',
    '  OUT[0] = 100;',
    '  let ret, err = null;',
    '  try { ret = M.sandwich(() => {}, () => {}, 1e4, M.bracketS2, D, OUT, ST); } catch (e) { err = String(e && e.message); } finally { v8.getHeapSpaceStatistics = REAL; }',
    '  return { ret, out: OUT[0] - 100, retries: ST[0], brackets: brackets(), err };',
    '}',
    'const out = {};',
    // (a) one bracket per XSPACES name, +6400 each
    'out.a = {};',
    "for (const nm of ['code_space', 'trusted_space', 'code_large_object_space', 'trusted_large_object_space']) {",
    '  script([{ [nm]: 6400 }]);',
    '  const D = new Float64Array(4); let g, err = null;',
    '  try { g = M.bracketS2(() => {}, () => {}, 0, D); } catch (e) { err = String(e && e.message); } finally { v8.getHeapSpaceStatistics = REAL; }',
    '  out.a[nm] = { D: Array.from(D), g, err };',
    '}',
    'const TWIN = { new_space: 2424 };',
    // (b) FIX-opus-1/fold replay: old_space +600000 with a code / trusted SHRINK (2 spaces) in attempt 1; attempt 2 clean
    'out.b = replay([TWIN, { new_space: 2424, old_space: 600000, code_space: -233216, trusted_space: -229200 }, TWIN, TWIN, { new_space: 2424, old_space: 600000 }, TWIN]);',
    // (c) APO-cross-fable-1 replay: attempt 1 under-reads old_space by 33384 and shrinks code / trusted
    'out.c = replay([TWIN, { new_space: 2424, old_space: 240016 - 33384, code_space: -233216, trusted_space: -229200 }, TWIN, TWIN, { new_space: 2424, old_space: 240016 }, TWIN]);',
    // (d) no netting: code -200000 and trusted +200000 (sum 0) must still reject attempt 1
    'out.d = replay([TWIN, { new_space: 2424, old_space: 600000, code_space: -200000, trusted_space: 200000 }, TWIN, TWIN, { new_space: 2424, old_space: 600000 }, TWIN]);',
    // (e) a listing without trusted_space: every attempt rejected (NaN), 4 attempts x 3 brackets, OUT unchanged
    'const R = { new_space: 2424, old_space: 1000 };',
    'out.e = replay([TWIN, R, TWIN, TWIN, R, TWIN, TWIN, R, TWIN, TWIN, R, TWIN], "trusted_space");',
    // (f) no netting across slots: old_space SHRINKS 50000 while code_space grows 100000 (the fold must reject, not net to +50000)
    "out.f = replay([TWIN, { new_space: 2424, old_space: -50000, code_space: 100000 }, TWIN, TWIN, { new_space: 2424, old_space: 600000 }, TWIN]);",
    // (g) a listing without old_space (a SPACES slot): reads NaN, never 0, like the absent XSPACES name in (e)
    'out.g = replay([TWIN, R, TWIN, TWIN, R, TWIN, TWIN, R, TWIN, TWIN, R, TWIN], "old_space");',
    'console.log(JSON.stringify(out));',
];
test('E2a: each XSPACES name +6400 in one bracketS2 lands in its slot: code / trusted -> D[1], code_large / trusted_large -> D[2], the rest 0', () => {
    const o = live('e2', E2_BODY).a;
    // Must-fail mutants: a name dropped; a large-object name mapped to slot 1. Red on 3641eba (XSPACES not read: D all 0).
    assert.deepEqual(o.code_space.D, [0, 6400, 0, 0]);
    assert.deepEqual(o.trusted_space.D, [0, 6400, 0, 0]);
    assert.deepEqual(o.code_large_object_space.D, [0, 0, 6400, 0]);
    assert.deepEqual(o.trusted_large_object_space.D, [0, 0, 6400, 0]);
    for (const k of Object.keys(o)) assert.equal(o[k].err, null, `${k}: ${o[k].err}`);
});
test('E2b: FIX-opus-1/fold replay: old_space +600000 with a code / trusted shrink: attempt 1 rejected, then ret 1, OUT 600000, retries 1, 6 brackets', () => {
    const r = live('e2', E2_BODY).b;
    // Red on 3641eba (the spaces are not read: accepted at once, retries 0) and on a netting fold (OUT 137584 = 600000 - 233216 - 229200).
    assert.equal(r.err, null);
    assert.equal(r.ret, 1);
    assert.equal(r.out, 600000);
    assert.equal(r.retries, 1);
    assert.equal(r.brackets, 6);
});
test('E2c: APO-cross-fable-1 replay: a 33384 B under-read hidden by a code / trusted shrink: ret 1, OUT 240016, retries 1', () => {
    const r = live('e2', E2_BODY).c;
    // Red on 3641eba (accepts 206632 = 240016 - 33384 after 0 retries).
    assert.equal(r.err, null);
    assert.equal(r.ret, 1);
    assert.equal(r.out, 240016);
    assert.equal(r.retries, 1);
});
test('E2d: no netting: code_space -200000 with trusted_space +200000 (sum 0) is rejected: retries 1, OUT 600000', () => {
    const r = live('e2', E2_BODY).d;
    // Must-fail mutant: the cross-opus fix-2 single summed slot (nets the two; retries 0). Red on 3641eba (retries 0).
    assert.equal(r.err, null);
    assert.equal(r.ret, 1);
    assert.equal(r.out, 600000);
    assert.equal(r.retries, 1);
});
test('E2e: a listing without trusted_space reads NaN, never 0: ret 0, retries 4, 12 brackets, OUT unchanged', () => {
    const r = live('e2', E2_BODY).e;
    // Must-fail mutant: slot 0-init (the absent name reads 0 and the sandwich is accepted). Red on 3641eba (accepted, ret 1).
    assert.equal(r.err, null);
    assert.equal(r.ret, 0);
    assert.equal(r.retries, 4);
    assert.equal(r.brackets, 12);
    assert.equal(r.out, 0);
});

test('E2f: no netting across slots: old_space -50000 with code_space +100000 is rejected: ret 1, retries 1, OUT 600000, 6 brackets', () => {
    const r = live('e2', E2_BODY).f;
    // Must-fail mutant: `&& D[t] >= 0` dropped from the per-slot fold (nets to +50000: OUT 50000, retries 0, 3 brackets).
    // Green on 3641eba (the old_space shrink is rejected there too, by the per-space negative check).
    assert.equal(r.err, null);
    assert.equal(r.ret, 1);
    assert.equal(r.out, 600000);
    assert.equal(r.retries, 1);
    assert.equal(r.brackets, 6);
});
test('E2g: a listing without old_space reads NaN, never 0: ret 0, retries 4, 12 brackets, OUT unchanged', () => {
    const r = live('e2', E2_BODY).g;
    // Must-fail mutant spaces-zero-init (slots 0..3 set to 0 before the read: ret 1, retries 0, 3 brackets). C-33: every slot NaN first.
    assert.equal(r.err, null);
    assert.equal(r.ret, 0);
    assert.equal(r.retries, 4);
    assert.equal(r.brackets, 12);
    assert.equal(r.out, 0);
});

// E3 (verbatim from the b88 cross-opus gate rows X2a / X2b): bytes in code_space / outside SPACES must never gate PASS at max 1.
// STAND_IN: every lane call adds to a pending count applied to code_space at the next listing read.
const STAND_IN = [
    "import v8 from 'node:v8';",
    'const orig = v8.getHeapSpaceStatistics;',
    'let pend = 0, extra = 0;',
    "v8.getHeapSpaceStatistics = () => { extra += pend; pend = 0; const l = orig(); for (const s of l) if (s.space_name === 'code_space') s.space_used_size += extra; return l; };",
];
const X2A_BODY = [...STAND_IN,
    'const r = M.measureLane((i) => { pend += 64; }, 1e5, 4, 1e4, 1e3);',
    'console.log(JSON.stringify({ peak: r.peak, voids: r.voids, v: r.voids ? "NO VERDICT" : M.gateVerdict(r.peak, 1, M.bandOf(1e5, 1e3)) }));',
];
const X2B_BODY = [...STAND_IN,
    'let c = 0, big = null;',
    'const r = M.measureLane((i) => { if (++c % 5000 === 0) { pend += 800000; big = new Array(100000); } }, 1e5, 4, 2e4, 1e3);',
    'console.log(JSON.stringify({ peak: r.peak, voids: r.voids, retries: r.retries, v: r.voids ? "NO VERDICT" : M.gateVerdict(r.peak, 1, M.bandOf(1e5, 1e3)) }));',
];
test('E3 X2a: 64 B/op outside the old SPACES (stand-in in code_space) never gates PASS at max 1', () => {
    const o = live('x2a', X2A_BODY);
    // Must-fail control: red on 3641eba (code_space unread: PASS).
    assert.notEqual(o.v, 'PASS', 'unmeasured-space bytes gated PASS (peak ' + o.peak + ')');
});
test('E3 X2b: a PERIODIC outside-SPACES move (with a real 800 KB array) never gates PASS at max 1', () => {
    const o = live('x2b', X2B_BODY);
    // Must-fail control: red on mutant minec (helpers/mkminec.mjs), run by B2's mutant battery; the plan does not claim red on 3641eba.
    assert.notEqual(o.v, 'PASS', 'periodic lane gated PASS (peak ' + o.peak + ', retries ' + o.retries + ')');
});

// E5 (S-A39): the driver passes z + i with z read from an Int32Array (always 0).
test('E5a: makeDriver()(fn, 3) feeds the indices 0, 1, 2', () => {
    const { makeDriver } = mod();
    // Regression pin on 3641eba (same indices there); the plan names the mutant fn(z + i + 1), which reads [1, 2, 3].
    const seen = [];
    makeDriver()((i) => seen.push(i), 3);
    assert.deepEqual(seen, [0, 1, 2]);
});
// The 8-box lane: eight doubles derived from the index i, boxed into a PACKED_ELEMENTS array = 8 HeapNumbers x 16 B = 128 B/op on Node.
// If the driver peels / constant-folds its first iteration of each drive call, the box of that iteration is elided and the window reads
// under 128 (budget: min(judged) + lo 0.0032 >= 128). It runs after a heavier throwaway lane (the first lane of a fresh process VOIDs windows).
const E5_BODY = [
    'const out = {};',
    'let sink = null;',
    'M.measureLane((i) => { sink = { v: i }; }, 1e6, 5, 2e5, 1e4);   // the throwaway lane: grows the young space (measured: without it the 128 B/op lane VOIDs every window)',
    'const a = [null, null, null, null, null, null, null, null];',
    'const lane8 = (i) => { a[0] = i + 0.5; a[1] = i + 1.5; a[2] = i + 2.5; a[3] = i + 3.5; a[4] = i + 4.5; a[5] = i + 5.5; a[6] = i + 6.5; a[7] = i + 7.5; };',
    'const r = M.measureLane(lane8, 1e6, 5, 2e5, 1e4);',
    'out.windows = r.windows; out.peak = r.peak;',
    'console.log(JSON.stringify(out));',
];
test('E5b (child drv): the 8-box index-fed lane reads >= 128 B/op (min of the judged windows + lo 0.0032 >= 128), at least 1 judged window', () => {
    const o = live('e5', E5_BODY);
    // Must-fail: red on 3641eba (reads 127.9872 per the plan: the old driver's peeled / folded iteration drops a box).
    const judged = o.windows.slice(1).filter((x) => x !== null);
    assert.ok(judged.length >= 1, `no judged window: ${JSON.stringify(o.windows)}`);
    assert.ok(Math.min(...judged) + 0.0032 >= 128, `min judged ${Math.min(...judged)} + 0.0032 < 128 B/op`);
});

// E8 (S-A42, fix4 / mine4): bandOf refuses a cell measureLane would refuse; selfCheck reports measureLane's refusal.
test('E8 bandOf: RangeError /bandOf/ unless n and sub are integers >= 1; (1e6, 1e4) gives { lo 0.0032, hiFixed 0.524288, hiRel 0.001 }', () => {
    const { bandOf } = mod();
    // Must-fail mutant: the guard removed. Red on 3641eba (bandOf(1e6, -1e4) returns a band).
    for (const [n, sub] of [[1e6, -1e4], [1e6, 1.5], [0, 1e4], [1e6, '1e4'], [NaN, 1], [1e6, 0]]) {
        assert.throws(() => bandOf(n, sub), (e) => e instanceof RangeError && /bandOf/.test(e.message), `bandOf(${String(n)}, ${String(sub)})`);
    }
    assert.deepEqual(bandOf(1e6, 1e4), { lo: 0.0032, hiFixed: 0.524288, hiRel: 0.001 });
});
const E8_BODY = [
    'let msg = "(no throw)", name = "";',
    'try { M.selfCheck(1e6, 5, 2e5, -1e4); } catch (e) { msg = String(e && e.message); name = e && e.name; }',
    'console.log(JSON.stringify({ msg, name }));',
];
test('E8 selfCheck(1e6, 5, 2e5, -1e4) throws measureLane\'s refusal /measureLane: sub = -10000/, not bandOf\'s', () => {
    const o = live('e8', E8_BODY);
    // Must-fail mutant: bandOf called first in selfCheck (its message names bandOf, not the argument report).
    assert.match(o.msg, /measureLane: sub = -10000/);
    assert.doesNotMatch(o.msg, /bandOf/);
});

// E9 (verbatim from the b88 cross-opus gate rows X4 / X5a / X5b / X5c).
test('E9 X4: abVerdict(16, 0, 8) DIFF; (400, 0, 399.3) and (16.5, 16, 1) NO VERDICT', () => {
    const { abVerdict, bandOf } = mod();
    // Must-fail mutants m4 (the A/B refusal weakened).
    const band = bandOf(1e6, 1e4);
    assert.equal(abVerdict(16, 0, 8, band), 'DIFF');
    assert.equal(abVerdict(400, 0, 399.3, band), 'NO VERDICT');
    assert.equal(abVerdict(16.5, 16, 1, band), 'NO VERDICT');
});
test('E9 X5a: a closing twin with a negative per-space delta rejects (retries 1, 6 calls, OUT 160100)', () => {
    const { sandwich } = mod();
    // Must-fail mutant m5a (the z2 negative check dropped).
    const steps = [[0, 2424, 0, 0, 0], [0, 162424, 0, 0, 0], [0, -1000, 3424, 0, 0], [0, 2424, 0, 0, 0], [0, 162424, 0, 0, 0], [0, 2424, 0, 0, 0]];
    let k = 0;
    const br = (fn, dr, m, D) => { const s = steps[k++]; D[0] = s[1]; D[1] = s[2]; D[2] = s[3]; D[3] = s[4]; return s[0]; };
    const D = new Float64Array(4), O = new Float64Array(1), ST = new Int32Array(1);
    O[0] = 100;
    assert.equal(sandwich(() => {}, () => {}, 10000, br, D, O, ST), 1);
    assert.equal(ST[0], 1);
    assert.equal(k, 6);
    assert.equal(O[0], 160100);
});
const X5B_BODY = [
    'let c = 0;',
    'try { M.measureLane((i) => { c++; }, 15000, 3, 0, 10000); console.log(JSON.stringify({ threw: false, c })); }',
    'catch (e) { console.log(JSON.stringify({ threw: true, name: e.name, msg: e.message, c })); }',
];
test('E9 X5b: n 15000 / sub 10000 throws RangeError /n % sub = 5000/, lane called 0 times', () => {
    const o = live('x5b', X5B_BODY);
    // Must-fail mutant m5b (the n % sub check dropped).
    assert.equal(o.threw, true);
    assert.equal(o.name, 'RangeError');
    assert.match(o.msg, /n % sub = 5000/);
    assert.equal(o.c, 0);
});
const X5C_BODY = [
    "import v8 from 'node:v8';",
    'const orig = v8.getHeapSpaceStatistics;',
    'let ran = false;',
    "v8.getHeapSpaceStatistics = () => { const l = orig(); for (const s of l) if (ran && s.space_name === 'new_space') s.space_used_size -= 1024; ran = false; return l; };",
    'const C = M.CONTROLS;',
    'const sc = M.selfCheck(1e5, 3, 1e4, 1e3, { positive: C.positive, negative: (i) => { ran = true; }, Profiler: C.Profiler });',
    'console.log(JSON.stringify({ ok: sc.ok, neg: sc.misses ? sc.misses.negative : null, emptyPeak: sc.empty.peak, voids: sc.empty.voids, lo: sc.band.lo }));',
];
test('E9 X5c: a negative row below -lo makes selfCheck ok false with misses.negative /^negative: empty peak/', () => {
    const o = live('x5c', X5C_BODY);
    // Must-fail mutant m5c. Keyed on misses.negative, not reason / box (S-A43, #132): a noisy-leg positive VOID must not move this row.
    assert.equal(o.voids, 0);
    assert.ok(o.emptyPeak < -o.lo, 'stand-in did not bite: ' + o.emptyPeak);
    assert.equal(o.ok, false);
    assert.ok(o.neg !== null, 'no misses (S-A43)');
    assert.match(o.neg, /^negative: empty peak/);
});

// E11 (S-A39 / fable retention): measureLane keeps no reference to the lane (mutant: LAST = fn).
const E11_BODY = [
    'const refs = [];',
    'function cycle() {',
    '  const f64 = new Float64Array(1);',
    '  const lane = (i) => { f64[0] = i; };',
    '  refs.push(new WeakRef(lane));',
    '  M.measureLane(lane, 1e5, 3, 1e4, 1e4);',
    '}',
    'const alive = [];',
    'for (let k = 0; k < 3; k++) {',
    '  cycle();',
    '  gc();',
    '  await new Promise((r) => setImmediate(r));',
    '  gc();',
    '  alive.push(refs.filter((w) => w.deref() !== undefined).length);',
    '}',
    'console.log(JSON.stringify({ alive }));',
];
test('E11 (child ret): after 3 measureLane cycles on fresh lanes held only by a WeakRef, the alive count is 0 after every cycle', () => {
    const o = live('ret', E11_BODY);
    // Must-fail mutant: LAST = fn (a module-level reference to the last lane). Regression pin: the plan does not claim red on 3641eba.
    assert.deepEqual(o.alive, [0, 0, 0]);
});
