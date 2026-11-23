// test/alloc-per-op-fixb.test.mjs -- b93 batch B2 (PLAN-B TASK 6): the fix-B rows of alloc-per-op (S-A57..S-A60).
// Oracle = .handoff/b93/PLAN-B.md ASSERTIONS A-B1..A-B8 (+ Retention), never the code. TOOL = ROOT/src/alloc-per-op.mjs, or
// $APO_TOOL when set (so the same file runs against the frozen SNAP). Cells: CELL6 = --n 1000000 --windows 3;
// CELL5 = --n 100000 --windows 3 --warm 0. Benches are written into each row's own mkdtemp dir (apo-fixb-*); the fixtures
// fenceafter / scmiss / spawn-spy are reused read-only. Caps go only through capSync (spawn-cap S5 census).
// Each row's title ends with SNAP-red or SNAP-green (the old code's verdict on it). A-B1..A-B6 are SNAP-red and stay red on
// the live src until batch B1 lands; A-B7 / A-B8 are SNAP-green by design (test gap / doc pin).
// SNAP per row family: A-B1..A-B6 (incl. the A-B6 oneoff row) -> SNAP = the b93 pre-fix-B src, dc8e634 / 3fe6d649
// (.handoff/b93/frozen/alloc-per-op.src.dc8e634.3fe6d649.mjs); b95-E1 / b95-F1 / b95-F1 v2 -> SNAP = 65e500c (the b96 frozen copy).
// b95 / b96 U8 (PLAN-GB TASKS 4, 6, 7): the A-B6 oneoff verdict derives from the row's own peak (Q-B95-AB6F (a)), and a VOID
// row is NO VERDICT regardless of peak (Q-B96-AB6VOID (a)). b97 U8b (Q-B97-AB6M2 (a)): the oneoff knob adds a TRANSIENT 60000 B
// to old_space on the measured bracket's after-read of every sandwich attempt in the lane's window 1, so window 1 gains
// exactly subs x 60000 = 600000 B (6 B/op) however many attempts are rejected; a no-spawn pin proves it against the b96 knob.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const TOOL = process.env.APO_TOOL ? process.env.APO_TOOL : join(ROOT, 'src', 'alloc-per-op.mjs');
const FIX = join(dirname(HERE), 'fixtures', 'alloc-per-op');
const fx = (name) => join(FIX, name + '.mjs');
const SPY_URL = pathToFileURL(join(FIX, 'spawn-spy.mjs')).href;
// cap model as the cli / fixa files (local max x 10, PRELIMINARY): the CELL6 rows run 3 windows of 1e6 ops (~3 s locally).
// The --jitless self-test was timed 2 x via quiet-lock on 2026-11-22 (1.69 s, 1.68 s, PRELIMINARY: load1 about 4.6);
// 10 x 1.7 s = 17 s < 31 s, so the cap is max(31000, 17000) = 31000.
const CAP_MS = 31000;

let M = null, LOAD_ERR = null;
try { M = await import(pathToFileURL(TOOL).href); } catch (e) { LOAD_ERR = e; }
function parseArgs(argv) {
    assert.ok(M !== null, `TOOL ${TOOL} failed to load (null is not zero): ${LOAD_ERR && LOAD_ERR.message}`);
    assert.equal(typeof M.parseArgs, 'function', 'parseArgs is exported');
    return M.parseArgs(argv);
}

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH', 'APO_SPY', 'APO_SPY_DROP', 'APO_SPY_CHILD', 'APO_SPY_SCMISS', 'APO_SPY_HIDE', 'ALLOC_PER_OP_CHILD']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // deleting is not enough: node re-adds it
    return { ...e, ...extra };
}

const DIRS = [];
function mkdir() { const d = mkdtempSync(join(tmpdir(), 'apo-fixb-')); DIRS.push(d); return d; }
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

const CELL6 = ['--n', '1000000', '--windows', '3'];
const CELL5 = ['--n', '100000', '--windows', '3', '--warm', '0'];
const why = (r) => `exit ${r.status} signal ${r.signal}\n--- stdout:\n${String(r.stdout).slice(0, 2000)}\n--- stderr:\n${String(r.stderr).slice(0, 2000)}`;

function benchFile(dir, name, src) { const p = join(dir, name); writeFileSync(p, src); return p; }
// run(args, dir, o) -> r. o.spy: also preload the spawn spy (1 spy line = 0 spawns); o.nodeFlags before the tool.
function run(args, dir, o = {}) {
    assert.ok(existsSync(TOOL), `TOOL ${TOOL} does not exist (null is not zero: every row fails, none skips)`);
    const spy = join(dir, 'spy.jsonl');
    const argv = [...(o.nodeFlags ?? []), ...(o.spy ? ['--import', SPY_URL] : []), TOOL, ...args];
    const r = capSync(process.execPath, argv, { cwd: dir, env: cleanEnv(o.spy ? { APO_SPY: spy } : {}), encoding: 'utf8', maxBuffer: 1 << 26 }, o.cap ?? CAP_MS, `alloc-per-op-fixb ${args.join(' ').slice(0, 60)}`);
    return { r, spy };
}
function lastJson(r) {
    const lines = String(r.stdout).split('\n').filter((l) => l.trim() !== '');
    assert.ok(lines.length >= 1, `stdout is empty, no JSON line\n${why(r)}`);
    try { return JSON.parse(lines[lines.length - 1]); } catch (e) { assert.fail(`last stdout line is not JSON (${e.message})\n${why(r)}`); }
}
function spyCount(spy) {
    assert.ok(existsSync(spy), 'spy file is missing (null is not zero: the spy never ran or never wrote)');
    return readFileSync(spy, 'utf8').split('\n').filter((l) => l !== '').length;
}

// shared bench pieces. f64 reads 0 B/op; box allocates a heap number per op (12 or 16 B/op: pointer compression).
const K_F64 = 'const f64 = new Float64Array(2);\nexport const lanes = { k: (i) => { f64[i & 1] = i + 0.5; } };\n';
const K_BOX = 'const sink = [{}, {}];\nexport const lanes = { k: (i) => { sink[i & 1] = i + 0.5; } };\n';
const OK_F64 = 'const a = new Float64Array(2);\nexport const lanes = { ok: (i) => { a[i & 1] = i; } };\n';

// ================= A-B1 (opus-2): a lane that replaces v8.GCProfiler after selfCheck =================
test('A-B1 fencewrap: lane sets v8.GCProfiler = class extends v8.GCProfiler on its first call, --max 100: exit 2, stderr "fence (after): v8.GCProfiler was replaced during the run", gate and lanes[0] NO VERDICT (kills M-LIVE0, M-O2) [SNAP-red: exit 0 PASS]', () => {
    const dir = mkdir();
    const b = benchFile(dir, 'fencewrap.mjs', "import v8 from 'node:v8';\nconst a = new Float64Array(2);\nlet armed = false;\n" +
        'export const lanes = { ok: (i) => { if (!armed) { armed = true; v8.GCProfiler = class extends v8.GCProfiler {}; } a[i & 1] = i; } };\n');
    const { r } = run(['--json', ...CELL6, '--max', '100', b], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /fence \(after\): v8\.GCProfiler was replaced during the run/, why(r));
    const j = lastJson(r);
    assert.equal(j.gate.verdict, 'NO VERDICT', why(r));
    assert.equal(j.gate.lanes[0].verdict, 'NO VERDICT', why(r));
});

// ================= A-B2 (neon-4 gate): every lane verdict is NO VERDICT on a fence miss =================
test('A-B2 fenceafter --max 100: JSON lanes[0].verdict NO VERDICT; the text lane line matches /NO VERDICT \\(fence\\)/ (kills M-N4G, M-N4T) [SNAP-red: PASS]', () => {
    const dir = mkdir();
    const j1 = run(['--json', ...CELL6, '--max', '100', fx('fenceafter')], dir);
    assert.equal(j1.r.status, 2, why(j1.r));
    assert.equal(lastJson(j1.r).gate.lanes[0].verdict, 'NO VERDICT', why(j1.r));
    const t = run([...CELL6, '--max', '100', fx('fenceafter')], dir);
    assert.equal(t.r.status, 2, why(t.r));
    assert.match(String(t.r.stdout), /NO VERDICT \(fence\)/, why(t.r));
});

// ================= A-B3 (neon-4 A/B) =================
test('A-B3 A/B: an f64 `ok` lane vs fenceafter, --tol 100: exit 2, ab.lanes deep-equals [["ok","NO VERDICT"]] (kills M-N4AB) [SNAP-red: SAME]', () => {
    const dir = mkdir();
    const a = benchFile(dir, 'a.mjs', OK_F64);
    const { r } = run(['--json', ...CELL6, '--tol', '100', a, fx('fenceafter')], dir);
    assert.equal(r.status, 2, why(r));
    const j = lastJson(r);
    assert.deepEqual(j.ab.lanes.map((l) => [l.lane, l.verdict]), [['ok', 'NO VERDICT']], why(r));
});

// ================= A-B4: isFinite is reachable and kept =================
test('A-B4 fenceinf: a prototype-patched GCProfiler.stop returning length Infinity, --max 100: exit 2, stderr "fence (after): recorded Infinity < forced 1" (kills M-INF, the isFinite removal) [SNAP-red: no fence reason]', () => {
    const dir = mkdir();
    // the class is unchanged (the identity check passes); fenceCheck forces one GC, the patched stop reads Infinity for it.
    const b = benchFile(dir, 'fenceinf.mjs', "import v8 from 'node:v8';\nconst a = new Float64Array(2);\nlet armed = false;\n" +
        'export const lanes = { ok: (i) => { if (!armed) { armed = true; const real = v8.GCProfiler.prototype.stop;\n' +
        '  v8.GCProfiler.prototype.stop = function () { const r = real.call(this); return (r && r.statistics && r.statistics.length > 0) ? { statistics: { length: Infinity } } : r; }; }\n' +
        '  a[i & 1] = i; } };\n');
    const { r } = run(['--json', ...CELL6, '--max', '100', b], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /fence \(after\): recorded Infinity < forced 1/, why(r));
});

// ================= A-B5: floor is null after a selfCheck miss =================
test('A-B5 scmiss at the corner cell: JSON floor === null; the text report shows "= null B/op" (kills M-FLOOR) [SNAP-red: a number]', () => {
    const dir = mkdir();
    const args = [...CELL5, '--max', '4', fx('scmiss')];
    const j = run(['--json', ...args], dir);
    assert.equal(j.r.status, 2, why(j.r));
    assert.equal(lastJson(j.r).floor, null, why(j.r));
    const t = run(args, dir);
    assert.equal(t.r.status, 2, why(t.r));
    assert.ok(String(t.r.stdout).includes('= null B/op'), why(t.r));
});

// ================= A-B6: the corner band is doubled below N = 1e6 (hand: 2 x 524288 / 1e5 = 10.48576; lo = 32 / 1e4 = 0.0032) =================
test('A-B6 refusal: --n 100000 --tol 6 A B is refused before any spawn (1 spy line), "smallest accepted value is 10.4889" (kills M-BAND; M-LE / M-OFF are killed by the engine A1 rows) [SNAP-red: accepted, spawns]', () => {
    const dir = mkdir();
    const A = benchFile(dir, 'a.mjs', K_F64), B = benchFile(dir, 'b.mjs', K_BOX);
    const { r, spy } = run(['--n', '100000', '--tol', '6', A, B], dir, { spy: true });
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /smallest accepted value is 10\.4889/, why(r));
    assert.equal(String(r.stdout), '', 'a refusal prints nothing on stdout');
    assert.equal(spyCount(spy), 1, 'a refusal spawns nothing (1 spy line)');
});
test('A-B6 parseArgs at --n 100000: --tol 10.489 is accepted (>= 10.48896), --tol 10.488 is refused [SNAP-red: 10.488 accepted]', () => {
    assert.equal(parseArgs(['--n', '100000', '--tol', '10.489', 'a.mjs', 'b.mjs']).tol, 10.489);
    assert.throws(() => parseArgs(['--n', '100000', '--tol', '10.488', 'a.mjs', 'b.mjs']), (e) => e instanceof Error && /smallest accepted value is 10\.4889/.test(e.message));
});
// The oneoff knob (b97 U8b, Q-B97-AB6M2 (a)). oneoffKnob is the ONE source: the spawn row serializes it (toString) into
// oneoff.mjs, loaded with --import in the parent and in the --expose-gc child (the tool re-spawns itself keeping execArgv);
// the no-spawn pin calls the same function on a scripted v8 / global. It patches v8.getHeapSpaceStatistics and, where a gc
// exists, wraps gc (the tool resolves `gc` at call time, and needEnv checks only typeof). K[0] counts the no-arg gc() calls
// made after the lane's first op (SIG[0] !== 0; the selfCheck lanes never touch SIG): measureLane makes one per window, so
// K[0] === 2 is the lane's window 1; gc({...}) inside every bracket is passed through with its one argument. A read fires
// iff K[0] === 2 and SIG[0] changed since the previous read: a z-bracket drives 0 ops, the measured bracket drives `sub` ops
// between its two reads, so exactly the measured bracket's after-read fires, on every attempt. The 60000 B is added to that
// read's returned value only (transient: the next read carries none), so a rejected attempt loses only its own copy and the
// re-run fires again: window 1 gains exactly subs x 60000 B (600000 B = 6 B/op at --n 100000, sub 10000), window 2 gains 0.
// No op-count threshold: retries cannot shift where it fires. State lives in Int32Array slots (no closure number cells), and
// both patched functions are branch-free on the knob state (as the b96 knob was): every read runs the same loop, adding 0
// when it does not fire (a fire branch first taken in window 1 cost 2-3 retries in each of 20 local runs on 2026-11-23,
// PRELIMINARY host; branch-free: 0 in 19 of 20, 1 in one).
function oneoffKnob(v8, g) {
    const real = v8.getHeapSpaceStatistics;
    const SIG = new Int32Array(1);
    const K = new Int32Array(2);
    g.APC_SIG = SIG;
    v8.getHeapSpaceStatistics = function () {
        const a = real.call(v8);
        const add = ((K[0] === 2) & (SIG[0] !== K[1])) * 60000;
        K[1] = SIG[0];
        for (let i = 0; i < a.length; i++) if (a[i].space_name === 'old_space') a[i].space_used_size = a[i].space_used_size + add;
        return a;
    };
    if (typeof g.gc === 'function') {
        const realGc = g.gc;
        g.gc = function () {
            if (arguments.length !== 0) return realGc(arguments[0]);
            K[0] = K[0] + (SIG[0] !== 0);
            return realGc();
        };
    }
}
const ONEOFF = "import v8 from 'node:v8';\n(" + oneoffKnob.toString() + ')(v8, globalThis);\n';
// The b96 knob, verbatim from the frozen fixb :152-155 (.handoff/b97/frozen/GB/test/alloc-per-op-fixb.test.mjs, 64698177):
// a PERSISTENT 600000 B old_space offset from the first heap read after the lane's call 150000. That read is the measured
// bracket's after-read; when that attempt is rejected, the step cancels in every later delta (CI run 45091044522, ubuntu
// node v26.13.1: windows [0.16416, 0, 0], peak 0, retries 2). Fixture only: the pin's must-fail control.
const ONEOFF_B96 = "import v8 from 'node:v8';\nconst real = v8.getHeapSpaceStatistics;\nconst SIG = new Int32Array(1);\nconst ST = new Int32Array(2);\n" +
    'globalThis.APC_SIG = SIG;\nv8.getHeapSpaceStatistics = function () {\n    const a = real.call(v8);\n' +
    '    const fire = ((SIG[0] > 150000) | 0) & (1 - ST[1]);\n    ST[0] = ST[0] + fire * 600000;\n    ST[1] = ST[1] | fire;\n' +
    "    for (let i = 0; i < a.length; i++) if (a[i].space_name === 'old_space') a[i].space_used_size = a[i].space_used_size + ST[0];\n    return a;\n};\n";
const KNOB_IMPORT = "import v8 from 'node:v8';\n";
function installB96(v8, g) {
    assert.ok(ONEOFF_B96.startsWith(KNOB_IMPORT), 'the b96 fixture starts with its v8 import');
    new Function('v8', 'globalThis', ONEOFF_B96.slice(KNOB_IMPORT.length))(v8, g);
}
// scriptedLane(install, rejectRead): measureLane at --n 100000 --windows 3 --warm 0 (sub 10000) minus gc / GCProfiler, on the
// tool's exported M.sandwich: fn(0), then per window g.gc() + 10 sandwiches (windowOf's loop). The heap is scripted: fixed
// space sizes, plus a persistent +8 B new_space background from read index rejectRead on (-1: never). Returns per-window sums,
// retries and VOID counts.
const SP4 = ['new_space', 'old_space', 'large_object_space', 'new_large_object_space'];
function scriptedLane(install, rejectRead) {
    assert.ok(M !== null && typeof M.sandwich === 'function', `TOOL ${TOOL} exports sandwich (null is not zero): ${LOAD_ERR && LOAD_ERR.message}`);
    const H = new Int32Array(2);   // H[0] read index, H[1] background bytes
    const fakeV8 = { getHeapSpaceStatistics() {
        if (H[0]++ === rejectRead) H[1] = 8;
        return SP4.map((name, j) => ({ space_name: name, space_used_size: 1048576 * (j + 1) + (j === 0 ? H[1] : 0) }));
    } };
    const g = { gc() {} };
    install(fakeV8, g);
    const SIG = g.APC_SIG;
    const fn = () => { SIG[0] = SIG[0] + 1; };
    const drive = (f, m) => { for (let i = 0; i < m; i++) f(i); };
    const bracket = (f, dr, m, D) => {
        const a = fakeV8.getHeapSpaceStatistics();
        dr(f, m);
        const b = fakeV8.getHeapSpaceStatistics();
        for (let j = 0; j < 4; j++) D[j] = b[j].space_used_size - a[j].space_used_size;
        return 0;
    };
    fn(0);
    const sums = [], retries = [], voids = [];
    const D = new Float64Array(4), OUT = new Float64Array(1), ST = new Int32Array(1);
    for (let w = 0; w < 3; w++) {
        g.gc();
        OUT[0] = 0; ST[0] = 0;
        let v = 0;
        for (let s = 0; s < 10; s++) v += 1 - M.sandwich(fn, drive, 10000, bracket, D, OUT, ST);
        sums.push(OUT[0]); retries.push(ST[0]); voids.push(v);
    }
    return { sums, retries, voids };
}
// read index of window 1, sub-window 4, attempt 1, z2's after-read: 2 reads per bracket, 3 brackets per attempt, window 0 =
// 10 clean sub-windows -> (3 x 10 + 3 x 4 + 2) x 2 + 1 = 89. The b96 knob fires at read 87 (r's after-read, SIG 150001).
const REJ_READ = 89;
const rejRead = (sw) => (3 * 10 + 3 * sw + 2) * 2 + 1;   // z2 after-read of window 1, sub-window sw, attempt 1
test('A-B6 oneoff knob pin (no spawn): on M.sandwich with a scripted heap whose first measured attempt of window 1 sub-window 4 is rejected (z1 0 !== z2 8), the b96 knob loses the step (window 1 sum 0, the CI mode) while the b97 knob still sums exactly 600000 B (windows [0, 600000, 0]); with no reject both knobs sum 600000; the b97 knob keeps exactly 600000 with the reject moved to attempt 1 of each window-1 sub-window 0..9 (kills a fire-once knob, transient or persistent) [must-fail control: the b96 knob]', () => {
    const b96c = scriptedLane(installB96, -1);
    assert.deepEqual(b96c, { sums: [0, 600000, 0], retries: [0, 0, 0], voids: [0, 0, 0] }, 'control: the b96 knob counts its step when nothing rejects');
    const b96r = scriptedLane(installB96, REJ_READ);
    assert.deepEqual(b96r, { sums: [0, 0, 0], retries: [0, 1, 0], voids: [0, 0, 0] }, 'the b96 knob: the rejected attempt held the persistent step, so it cancels (CI run 45091044522 mode)');
    const nowc = scriptedLane(oneoffKnob, -1);
    assert.deepEqual(nowc, { sums: [0, 600000, 0], retries: [0, 0, 0], voids: [0, 0, 0] }, 'the b97 knob, no reject');
    const nowr = scriptedLane(oneoffKnob, REJ_READ);
    assert.deepEqual(nowr, { sums: [0, 600000, 0], retries: [0, 1, 0], voids: [0, 0, 0] }, 'the b97 knob: the re-run attempt fires again, window 1 keeps exactly 600000 B');
    assert.equal(rejRead(4), REJ_READ);
    for (let sw = 0; sw < 10; sw++) {
        assert.deepEqual(scriptedLane(oneoffKnob, rejRead(sw)), { sums: [0, 600000, 0], retries: [0, 1, 0], voids: [0, 0, 0] }, `the b97 knob, reject in window 1 sub-window ${sw}`);
    }
});
// Q-B95-AB6F (a): band.hiFixed is asserted first (the M-BAND / SNAP-red teeth, independent of the background). The expected
// verdict comes from the row's own peak with hand constants (hiFixed 2 x 524288 / 1e5 = 10.48576, hiRel 0.001; PASS is
// impossible above --max 0.05 because peak > 5.9): FAIL iff peak - (10.48576 + 0.001 x peak) > 0.05, else NO VERDICT. A
// background one-off of up to about 4.5 B/op on top of the step lands on either side of that edge.
// Q-B96-AB6VOID (a): a VOID row (any VOID window) is NO VERDICT exit 2 regardless of peak.
const hand = (peak) => (peak - (10.48576 + 0.001 * peak) > 0.05 ? 'FAIL' : 'NO VERDICT');
const expected = (row) => (row.voids !== 0 ? 'NO VERDICT' : hand(row.peak));
test('A-B6 oneoff hand pin (no spawn): hand(10.54872) === FAIL (10.54872 - 10.49630872 = 0.0524 > 0.05) [regression pin]', () => {
    assert.equal(hand(10.54872), 'FAIL');
});
test('A-B6 oneoff VOID pin (no spawn): expected({ voids: 1, peak: 11 }) === NO VERDICT (a VOID row above the 10.5463 band edge), twin expected({ voids: 0, peak: 11 }) === FAIL (Q-B96-AB6VOID (a)) [regression pin]', () => {
    assert.equal(expected({ voids: 1, peak: 11 }), 'NO VERDICT');
    assert.equal(expected({ voids: 0, peak: 11 }), 'FAIL');
});
test('A-B6 oneoff: a 600000 B window-1 step (60000 B on each of its 10 accepted measured brackets) in a clean lane at --n 100000 --max 0.05: band.hiFixed === 2 x 524288 / 1e5 first; a VOID row is NO VERDICT exit 2; else knob peak > 5.9, then the lane verdict and exit match hand(peak) (NO VERDICT exit 2, or FAIL exit 1 above the band edge) (kills M-BAND; M-LE / M-OFF are killed by the engine A1 rows) [SNAP-red (b93 dc8e634 / 3fe6d649): hiFixed 5.24288]', (t) => {
    const dir = mkdir();
    const hook = benchFile(dir, 'oneoff.mjs', ONEOFF);
    const b = benchFile(dir, 'stepped.mjs', 'const f64 = new Float64Array(2);\nconst SIG = globalThis.APC_SIG;\n' +
        'export const lanes = { k: (i) => { f64[i & 1] = i + 0.5; SIG[0] = SIG[0] + 1; } };\n');
    const { r } = run(['--json', ...CELL5, '--max', '0.05', b], dir, { nodeFlags: ['--import', pathToFileURL(hook).href] });
    const j = lastJson(r);
    assert.equal(j.band.hiFixed, 2 * 524288 / 1e5, why(r));
    assert.equal(j.sub, 10000, `the knob's 10 x 60000 B assumes sub 10000\n${why(r)}`);
    const row = j.benches[0].rows[0];
    assert.ok(row, `a lane row exists\n${why(r)}`);
    assert.ok(Number.isInteger(row.voids) && row.voids >= 0, `row.voids is a VOID count (null / undefined is not zero): ${JSON.stringify(row)}\n${why(r)}`);
    if (row.voids === 0) assert.ok(row.peak > 5.9, `the knob: the stand-in step is seen (${JSON.stringify(row)})\n${why(r)}`);
    const want = expected(row);
    if (row.voids !== 0) t.diagnostic(`A-B6 oneoff VOID branch: ${JSON.stringify(row)}`);
    else if (want === 'FAIL') t.diagnostic(`A-B6 oneoff FAIL branch: peak ${row.peak} is above the band edge (step + background one-off > 10.5463 B/op)`);
    else t.diagnostic(`A-B6 oneoff NO VERDICT branch: peak ${row.peak} retries ${row.retries}`);
    assert.deepEqual(j.gate.lanes.map((g) => g.verdict), [want], why(r));
    assert.equal(r.status, want === 'FAIL' ? 1 : 2, why(r));
});

// ================= A-B7 (U7): fable's rows (audit fable/fixes.diff, cross-opus-a); SNAP-green by design (test gap) =================
// Each kills exactly its mutant M7a-e / M8. A f64 lane in a row also reads under 1 B/op (|a|, |b| < 1: no new bytes in a window).
function boxSize(dir) {   // the box lane's peak, rounded (16, or 12 on a pointer-compressed build), from a table run
    const { r } = run(['--json', ...CELL6, benchFile(dir, 'size.mjs', K_BOX)], dir);
    assert.equal(r.status, 0, why(r));
    const p = Math.round(lastJson(r).benches[0].rows[0].peak);
    assert.ok(p >= 8 && p <= 32, `box peak ${p}`);
    return p;
}
const peakOf = (j, bi) => j.benches[bi].rows[0].peak;
test('A-B7 gate: a box lane at --max (box - 0.25) is inside the band -> exit 2, gate and lane NO VERDICT, "(within band" (kills M7a: a within-band gate lane not counted) [SNAP-green by design]', () => {
    const dir = mkdir();
    const max = String(boxSize(dir) - 0.25);   // box + lo > max, and box - hi (0.524288 + 0.001 x box) <= max
    const { r } = run(['--json', ...CELL6, '--max', max, benchFile(dir, 'box.mjs', K_BOX)], dir);
    assert.equal(r.status, 2, why(r));
    const j = lastJson(r);
    assert.equal(j.gate.verdict, 'NO VERDICT');
    assert.deepEqual(j.gate.lanes.map((g) => g.verdict), ['NO VERDICT']);
    assert.equal(j.benches[0].rows[0].voids, 0, 'the lane is inside the band, not VOID');
    const t = run([...CELL6, '--max', max, benchFile(dir, 'box2.mjs', K_BOX)], dir);
    assert.equal(t.r.status, 2, why(t.r));
    assert.ok(String(t.r.stdout).includes('gate --max ' + max + ' (peak B/op): NO VERDICT (within band'), why(t.r));
});
test('A-B7 A/B f64 vs box --tol 6: exit 1, ab DIFF, lane DIFF; the f64 side reads under 1 B/op (kills M7c, M7d: DIFF not counted / DIFF -> SAME) [SNAP-green by design]', () => {
    const dir = mkdir();
    const { r } = run(['--json', ...CELL6, '--tol', '6', benchFile(dir, 'a.mjs', K_F64), benchFile(dir, 'b.mjs', K_BOX)], dir);
    assert.equal(r.status, 1, why(r));
    const j = lastJson(r);
    assert.equal(j.ab.verdict, 'DIFF');
    assert.deepEqual(j.ab.lanes.map((l) => [l.lane, l.verdict]), [['k', 'DIFF']]);
    assert.ok(Math.abs(peakOf(j, 0)) < 1, `|a| ${peakOf(j, 0)} < 1`);
});
test('A-B7 A/B f64 vs a copied f64 --tol 100: exit 0, ab SAME, lane SAME; both sides under 1 B/op (kills M7d: SAME exits 1) [SNAP-green by design]', () => {
    const dir = mkdir();
    const { r } = run(['--json', ...CELL6, '--tol', '100', benchFile(dir, 'a.mjs', K_F64), benchFile(dir, 'b.mjs', K_F64)], dir);
    assert.equal(r.status, 0, why(r));
    const j = lastJson(r);
    assert.equal(j.ab.verdict, 'SAME');
    assert.deepEqual(j.ab.lanes.map((l) => [l.lane, l.verdict]), [['k', 'SAME']]);
    assert.ok(Math.abs(peakOf(j, 0)) < 1 && Math.abs(peakOf(j, 1)) < 1, `|a| ${peakOf(j, 0)} and |b| ${peakOf(j, 1)} < 1`);
});
test('A-B7 A/B f64 vs box --tol (box) is inside the band: exit 2, ab NO VERDICT (kills M7b: a within-band A/B lane not counted) [SNAP-green by design]', () => {
    const dir = mkdir();
    const tol = String(boxSize(dir));   // |delta| - E <= tol < |delta| + E, E about 0.54
    const { r } = run(['--json', ...CELL6, '--tol', tol, benchFile(dir, 'a.mjs', K_F64), benchFile(dir, 'b.mjs', K_BOX)], dir);
    assert.equal(r.status, 2, why(r));
    const j = lastJson(r);
    assert.equal(j.ab.verdict, 'NO VERDICT');
    assert.deepEqual(j.ab.lanes.map((l) => [l.lane, l.verdict]), [['k', 'NO VERDICT']]);
    assert.ok(Math.abs(peakOf(j, 0)) < 1, `|a| ${peakOf(j, 0)} < 1`);
});
test('A-B7 a rejection a lane leaves behind (not from lane(0)) ends exit 2 /uncaught/ before any verdict prints: stdout "" (kills M7e: the settle before the report removed) [SNAP-green by design]', () => {
    const dir = mkdir();
    const b = benchFile(dir, 'rej.mjs', 'let n = 0;\nexport const lanes = { k: (i) => { if (++n === 5) Promise.reject(new Error("lane-async-boom")); } };\n');
    const { r } = run([...CELL6, '--max', '1', b], dir);
    assert.equal(r.status, 2, why(r));
    // holds for both die() prints: "uncaught: Error: lane-async-boom" (String) and the stack form (starts with "Error: lane-async-boom")
    assert.match(String(r.stderr), /uncaught: (Error: )?lane-async-boom/, why(r));
    assert.equal(String(r.stdout), '', 'no report and no verdict line before the async error is seen');
});
test('A-B7 --jitless --self-test --json: selfCheck ok, the clean row misses (FAIL, want PASS) -> exit 1 (kills M8: a row miss exits 0) [SNAP-green by design]', () => {
    // under --jitless the interpreter boxes the f64 lane's double, so `clean` reads a box while selfCheck stays ok (audit cross-opus-a, APC-fable-8)
    const dir = mkdir();
    const { r } = run(['--self-test', '--json'], dir, { nodeFlags: ['--jitless'] });
    const j = lastJson(r);
    assert.equal(j.selfCheck.ok, true, why(r));
    const clean = j.rows.find((x) => x.name === 'clean');
    assert.ok(clean, 'a clean row exists');
    assert.equal(clean.ok, false, `the knob: under --jitless the clean row must miss (${JSON.stringify(clean)})`);
    assert.equal(r.status, 1, why(r));
});

// ================= A-B8 (Q-CA-TABLEJSON a): a table run's NO VERDICT is exit 2 plus the stderr line; SNAP-green by design (doc pin) =================
test('A-B8 --json CELL6 on fenceafter (no --max / --tol): exit 2, stderr "NO VERDICT: fence (after)", 16 keys (KEYS17 minus gate), no ab (teeth M-TJ: fence skipped without a gate) [SNAP-green by design]', () => {
    const KEYS16 = ['arch', 'band', 'benches', 'floor', 'isolate', 'n', 'node', 'platform', 'pointer_compression', 'scope', 'signal', 'span', 'sub', 'v8', 'warm', 'windows'];
    const dir = mkdir();
    const { r } = run(['--json', ...CELL6, fx('fenceafter')], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /NO VERDICT: fence \(after\)/, why(r));
    const j = lastJson(r);
    assert.deepEqual(Object.keys(j).sort(), KEYS16, why(r));
    assert.ok(!('ab' in j) && !('gate' in j), 'no ab, no gate key');
});

// ================= b95 (PLAN-GB TASKS 6-7; U5 review NITs 1-2): one read of a value a bench can make change =================
// a bench whose `lanes` read throws an object whose message getter returns a new string on each read
const E1_SEQ = 'let k = 0;\nconst err = { get message() { return "m" + (++k); } };\nexport const lanes = new Proxy({}, { getPrototypeOf() { throw err; } });\n';
const E1_SPOOF = 'let k = 0;\nconst err = { get message() { return ++k === 1 ? "BENCH spoof" : "m" + k; } };\nexport const lanes = new Proxy({}, { getPrototypeOf() { throw err; } });\n';
test('b95-E1 a `lanes` Proxy whose getPrototypeOf throws an object with a changing message getter: errText is read once -- m1/m2/m3: exit 2, stdout "", "reading `lanes` threw: m1", no "m2"; "BENCH spoof" then "m2": "NO VERDICT: BENCH spoof", no "m2" (kills the partial mutant `t.startsWith(...) ? errText(e) : ... + t`) [SNAP-red: m2]', () => {
    const dir = mkdir();
    const a = benchFile(dir, 'seq.mjs', E1_SEQ);
    const ra = run([...CELL5, a], dir).r;
    assert.equal(ra.status, 2, why(ra));
    assert.equal(String(ra.stdout), '', why(ra));
    assert.ok(String(ra.stderr).includes('BENCH ' + realpathSync(a) + ': reading `lanes` threw: m1'), why(ra));   // the tool prints the realpath
    assert.ok(!String(ra.stderr).split(realpathSync(a)).join('').includes('m2'), `the message getter is read once\n${why(ra)}`);
    const rb = run([...CELL5, benchFile(dir, 'spoof.mjs', E1_SPOOF)], dir).r;
    assert.equal(rb.status, 2, why(rb));
    assert.equal(String(rb.stdout), '', why(rb));
    assert.ok(String(rb.stderr).includes('NO VERDICT: BENCH spoof'), why(rb));
    assert.ok(!String(rb.stderr).includes('m2'), `the message getter is read once\n${why(rb)}`);
});
// F1: on its first call the lane patches GCProfiler.prototype.stop to report 0 records under fenceCheck and installs a getter on
// v8.GCProfiler that hands a Fake (stop reports 1 record) to a read under fenceCheck, else the real class. run() reads
// v8.GCProfiler once (P) outside fenceCheck: the real class -> recorded 0. Old code: fenceCheck() re-reads through its default
// parameter (the Fake, recorded 1) and the identity check reads the real class -> PASS on a fence that recorded nothing.
const F1_FC = "import v8 from 'node:v8';\nconst a = new Float64Array(2);\nlet armed = false;\nconst under = () => /fenceCheck/.test(String(new Error().stack));\n" +
    'export const lanes = { ok: (i) => { if (!armed) { armed = true; const Real = v8.GCProfiler; const realStop = Real.prototype.stop;\n' +
    '  Real.prototype.stop = function () { const r = realStop.call(this); return under() ? { statistics: { length: 0 } } : r; };\n' +
    '  class Fake { start() {} stop() { return { statistics: { length: 1 } }; } }\n' +
    "  Object.defineProperty(v8, 'GCProfiler', { configurable: true, enumerable: true, get: () => (under() ? Fake : Real) }); }\n" +
    '  a[i & 1] = i; } };\n';
test('b95-F1 a v8.GCProfiler getter that hands fenceCheck a Fake, real stop() reporting 0 under fenceCheck, --max 100: exit 2, "fence (after): recorded 0 < forced 1", gate NO VERDICT (kills M-FC: fenceCheck() re-reads v8.GCProfiler via its default parameter) [SNAP-red: exit 0 PASS]', () => {
    const dir = mkdir();
    const { r } = run(['--json', ...CELL6, '--max', '100', benchFile(dir, 'fc.mjs', F1_FC)], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /fence \(after\): recorded 0 < forced 1/, why(r));
    assert.equal(lastJson(r).gate.verdict, 'NO VERDICT', why(r));
});
// F1 v2 (U5 review NIT 1): real stop() always reports 0; the getter returns the real class under bracketS2, else a Fake on the
// first read after the lane armed it and the real class after. One read: P = Fake, the fence passes (recorded 1), and the
// live check P === CONTROLS.Profiler fails -> "replaced". A second read for the live check sees the real class -> PASS.
const F1_ID = "import v8 from 'node:v8';\nconst a = new Float64Array(2);\nlet armed = false, n = 0;\nconst inBracket = () => /bracketS2/.test(String(new Error().stack));\n" +
    'export const lanes = { ok: (i) => { if (!armed) { armed = true; const Real = v8.GCProfiler; const realStop = Real.prototype.stop;\n' +
    '  Real.prototype.stop = function () { realStop.call(this); return { statistics: { length: 0 } }; };\n' +
    '  class Fake { start() {} stop() { return { statistics: { length: 1 } }; } }\n' +
    "  Object.defineProperty(v8, 'GCProfiler', { configurable: true, enumerable: true, get: () => (inBracket() ? Real : (++n === 1 ? Fake : Real)) }); }\n" +
    '  a[i & 1] = i; } };\n';
test('b95-F1 v2 a v8.GCProfiler getter that returns a Fake on the first read after the lane and the real class after, --max 100: exit 2, "fence (after): v8.GCProfiler was replaced during the run", gate NO VERDICT (kills M-ID: `fenceLiveOk = v8.GCProfiler === CONTROLS.Profiler`, a second read) [SNAP-red: exit 0 PASS]', () => {
    const dir = mkdir();
    const { r } = run(['--json', ...CELL6, '--max', '100', benchFile(dir, 'id.mjs', F1_ID)], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /fence \(after\): v8\.GCProfiler was replaced during the run/, why(r));
    assert.equal(lastJson(r).gate.verdict, 'NO VERDICT', why(r));
});

// ================= Retention =================
test('Retention: after the rows, every apo-fixb dir of this file is removable and no child of this pid remains [regression pin]', () => {
    for (const d of DIRS) rmSync(d, { recursive: true, force: true });
    const left = readdirSync(tmpdir()).filter((n) => n.startsWith('apo-fixb-') && DIRS.some((d) => d.endsWith(n)));
    assert.deepEqual(left, [], 'no apo-fixb dir of this file remains');
    const r = capSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', env: cleanEnv() }, 10000, 'ps children');
    const kids = String(r.stdout).split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => Number(c[1]) === process.pid && Number(c[0]) !== r.pid);
    assert.deepEqual(kids, [], 'no child of the test pid remains');
});
