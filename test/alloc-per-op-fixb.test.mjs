// test/alloc-per-op-fixb.test.mjs -- b93 batch B2 (PLAN-B TASK 6): the fix-B rows of alloc-per-op (S-A57..S-A60).
// Oracle = .handoff/b93/PLAN-B.md ASSERTIONS A-B1..A-B8 (+ Retention), never the code. TOOL = ROOT/src/alloc-per-op.mjs, or
// $APO_TOOL when set (so the same file runs against the frozen SNAP). Cells: CELL6 = --n 1000000 --windows 3;
// CELL5 = --n 100000 --windows 3 --warm 0. Benches are written into each row's own mkdtemp dir (apo-fixb-*); the fixtures
// fenceafter / scmiss / spawn-spy are reused read-only. Caps go only through capSync (spawn-cap S5 census).
// Each row's title ends with SNAP-red or SNAP-green (the old code's verdict on it). A-B1..A-B6 are SNAP-red and stay red on
// the live src until batch B1 lands; A-B7 / A-B8 are SNAP-green by design (test gap / doc pin).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
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
// the oneoff hook (from audit fable/fixes.diff test/fixtures/alloc-per-op/oneoff.mjs, written into the row's dir): a 600000 B
// old_space step at the first heap read after the lane's call 150000, i.e. inside window 1. 600000 / 1e5 = 6 B/op.
const ONEOFF = "import v8 from 'node:v8';\nconst real = v8.getHeapSpaceStatistics;\nconst SIG = new Int32Array(1);\nconst ST = new Int32Array(2);\n" +
    'globalThis.APC_SIG = SIG;\nv8.getHeapSpaceStatistics = function () {\n    const a = real.call(v8);\n' +
    '    const fire = ((SIG[0] > 150000) | 0) & (1 - ST[1]);\n    ST[0] = ST[0] + fire * 600000;\n    ST[1] = ST[1] | fire;\n' +
    "    for (let i = 0; i < a.length; i++) if (a[i].space_name === 'old_space') a[i].space_used_size = a[i].space_used_size + ST[0];\n    return a;\n};\n";
test('A-B6 oneoff: a 600000 B step in window 1 of a clean lane at --n 100000 --max 0.05: knob 5.9 < peak < 10, then lane NO VERDICT, exit 2, band.hiFixed === 2 x 524288 / 1e5 (kills M-BAND; M-LE / M-OFF are killed by the engine A1 rows) [SNAP-red: FAIL, exit 1]', () => {
    const dir = mkdir();
    const hook = benchFile(dir, 'oneoff.mjs', ONEOFF);
    const b = benchFile(dir, 'stepped.mjs', 'const f64 = new Float64Array(2);\nconst SIG = globalThis.APC_SIG;\n' +
        'export const lanes = { k: (i) => { f64[i & 1] = i + 0.5; SIG[0] = SIG[0] + 1; } };\n');
    const { r } = run(['--json', ...CELL5, '--max', '0.05', b], dir, { nodeFlags: ['--import', pathToFileURL(hook).href] });
    const j = lastJson(r);
    const row = j.benches[0].rows[0];
    assert.ok(row && row.peak > 5.9 && row.peak < 10, `the knob: the stand-in step is seen (${JSON.stringify(row)})\n${why(r)}`);
    assert.deepEqual(j.gate.lanes.map((g) => g.verdict), ['NO VERDICT'], why(r));
    assert.equal(r.status, 2, why(r));
    assert.equal(j.band.hiFixed, 2 * 524288 / 1e5, why(r));
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

// ================= Retention =================
test('Retention: after the rows, every apo-fixb dir of this file is removable and no child of this pid remains [regression pin]', () => {
    for (const d of DIRS) rmSync(d, { recursive: true, force: true });
    const left = readdirSync(tmpdir()).filter((n) => n.startsWith('apo-fixb-') && DIRS.some((d) => d.endsWith(n)));
    assert.deepEqual(left, [], 'no apo-fixb dir of this file remains');
    const r = capSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', env: cleanEnv() }, 10000, 'ps children');
    const kids = String(r.stdout).split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => Number(c[1]) === process.pid && Number(c[0]) !== r.pid);
    assert.deepEqual(kids, [], 'no child of the test pid remains');
});
