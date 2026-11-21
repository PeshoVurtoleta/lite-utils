// test/alloc-per-op-lb.test.mjs -- G3 B3 (SPEC-alloc-per-op.md G3 TASK 9, ASSERTION 8, C-26): the LiteBisect shape row.
// LiteBisect's test/gates/alloc.test.mjs runs the BUILT root tool ROOT/alloc-per-op.mjs on its own bench and reads the
// --json line; this row pins the contract it reads, so a LiteUtils change that would break LiteBisect goes red here.
// LiteBisect facts relied on (read-only, /Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteBisect):
//   test/gates/alloc.test.mjs:188-189  args = [...flags, TOOL, '--n', N, '--windows', K, '--warm', WARM, ...extra,
//                                      ...lanes.flatMap((l) => ['--lane', l]), bench]  (extra, e.g. --json, BEFORE the lanes)
//   test/gates/alloc.test.mjs:199      JSON.parse(r.stdout.trim().split('\n').pop())  (the last stdout line)
//   test/gates/alloc.test.mjs:150-155  signal 'space-used-paired'; the --max 1 run exits 1 matching
//                                      /gate --max 1 \(peak B\/op\): FAIL/ (no --json on that run: alloc.test.mjs:298)
//   test/gates/alloc-bench.mjs:89-90   `export const lanes`, dotted names, 'harness.empty' = (i) => {}
// Oracle = SPEC ASSERTION 8, typed from the SPEC, never read from a run. A missing ROOT/alloc-per-op.mjs (or bench) FAILS
// every spawning row (LB 1-4) by name (null is not zero; never SKIP). Each spawn runs once, cwd = its own mkdtemp dir (C-26), clean env.
// Caps go only through capSync (spawn-cap.mjs; spawn-cap.test.mjs S5 census): a cap-kill throws "timed out after" first.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const TOOL = join(ROOT, 'alloc-per-op.mjs');
const BENCH = join(ROOT, 'test', 'fixtures', 'alloc-per-op-lb', 'lb-bench.mjs');
// .handoff/b82/evidence/g3-lb-cap.txt: cap = max(120000, 20 x max wall) ms per spawn (TASK 10; PRELIMINARY)
const LB_CAP_MS = 120000;

// ASSERTION 8, typed from the SPEC
const REQ = Object.freeze({ n: 1000000, windows: 6, warm: 5000000, signal: 'space-used-paired',
    lanes: Object.freeze(['box.frac', 'harness.empty']) });
const PRE = ['--expose-gc', '--no-concurrent-recompilation', TOOL, '--n', '1000000', '--windows', '6', '--warm', '5000000'];
const ARGS_JSON = [...PRE, '--json', '--lane', 'harness.empty', '--lane', 'box.frac', BENCH];
const ARGS_MAX = [...PRE, '--max', '1', '--lane', 'box.frac', BENCH];
const GATE_FAIL = /gate --max 1 \(peak B\/op\): FAIL/;

const show = (v) => (v === undefined ? 'undefined' : typeof v === 'number' ? 'number ' + String(v) : typeof v + ' ' + JSON.stringify(v));

/** Pure. json = the stdout text of the --json spawn, parsed as LiteBisect parses it (last line). req = REQ.
 *  Returns the problem list ([] = the shape LiteBisect reads). Nulls in windows are allowed and counted by lbNulls. */
export function lbShapeProblems(json, req) {
    if (typeof json !== 'string') return ['stdout is ' + show(json) + ', not text'];
    const last = json.trim().split('\n').pop();
    let j;
    try { j = JSON.parse(last); } catch (e) { return ['last stdout line is not JSON (' + e.message + '): ' + last.slice(0, 80)]; }
    if (j === null || typeof j !== 'object' || Array.isArray(j)) return ['--json line is ' + show(j) + ', not an object'];
    const p = [];
    for (const k of ['n', 'windows', 'warm']) {
        if (!(Object.hasOwn(j, k) && typeof j[k] === 'number' && j[k] === req[k])) p.push(k + ' is ' + show(j[k]) + ', expected number ' + req[k]);
    }
    if (!Object.hasOwn(j, 'signal')) p.push('signal absent');
    else if (j.signal !== req.signal) p.push('signal is ' + show(j.signal) + ', expected ' + JSON.stringify(req.signal));
    if (!Object.hasOwn(j, 'floor')) p.push('floor absent');
    else if (!(typeof j.floor === 'number' && Number.isFinite(j.floor))) p.push('floor is ' + show(j.floor) + ', not a finite number (null is not zero)');
    if (!Array.isArray(j.benches)) { p.push('benches is ' + show(j.benches) + ', not an array'); return p; }
    if (j.benches.length !== 1) p.push('benches.length ' + j.benches.length + ', expected 1');
    const b0 = j.benches[0];
    const rows = b0 !== null && typeof b0 === 'object' ? b0.rows : undefined;
    if (!Array.isArray(rows)) { p.push('benches[0].rows is ' + show(rows) + ', not an array'); return p; }
    const got = rows.map((r) => (r !== null && typeof r === 'object' && typeof r.lane === 'string' ? r.lane : show(r !== null && typeof r === 'object' ? r.lane : r))).sort();
    const want = [...req.lanes].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) p.push('lanes ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want));
    for (const r of rows) {
        const name = r !== null && typeof r === 'object' ? String(r.lane) : show(r);
        const w = r !== null && typeof r === 'object' ? r.windows : undefined;
        if (!Array.isArray(w) || w.length !== req.windows) { p.push('lane ' + name + ' windows ' + show(w) + ', expected an array of ' + req.windows); continue; }
        const bad = w.map((x, i) => [i, x]).filter(([, x]) => !(x === null || (typeof x === 'number' && Number.isFinite(x))));
        if (bad.length) p.push('lane ' + name + ' window(s) ' + bad.map(([i, x]) => i + '=' + show(x)).join(' ') + ' not a finite number or null');
    }
    return p;
}

/** Pure: the number of null windows over all rows (counted, never coerced to 0). Call only on a shape-clean line. */
export function lbNulls(json) {
    const j = JSON.parse(json.trim().split('\n').pop());
    let k = 0;
    for (const r of j.benches[0].rows) for (const x of r.windows) if (x === null) k++;
    return k;
}

/** Pure: a spawn's exit contract (no signal, exit === want; a NO VERDICT exit 2 still prints its JSON). [] = ok. */
export function lbExitProblems(status, signal, want) {
    const p = [];
    if (signal !== null) p.push('killed by ' + signal);
    if (status !== want) p.push('exit ' + status + ', expected ' + want);
    return p;
}

/** Pure: the --max 1 spawn's contract (exit 1, no signal, the peak FAIL line on stdout). [] = ok. */
export function lbGateProblems(status, signal, stdout) {
    const p = lbExitProblems(status, signal, 1);
    if (!(typeof stdout === 'string' && GATE_FAIL.test(stdout))) p.push('stdout lacks ' + GATE_FAIL.source);
    return p;
}

// ---- child plumbing (model: alloc-per-op-engine.test.mjs cleanEnv) ----
function cleanEnv() {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // deleting is not enough: node re-adds it
    return e;
}
function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }

const DIRS = [];
const RUNS = new Map();   // key -> { value } | { error }: each spawn runs once per file
function spawnLb(key, args) {
    if (!RUNS.has(key)) {
        try {
            assert.ok(isFile(TOOL), 'ROOT/alloc-per-op.mjs is missing (run bash build.sh): the LiteBisect row FAILS, never skips');
            assert.ok(isFile(BENCH), 'test/fixtures/alloc-per-op-lb/lb-bench.mjs is missing');
            const cwd = mkdtempSync(join(tmpdir(), 'apo-lb-'));
            DIRS.push(cwd);
            const r = capSync(process.execPath, args, { cwd, env: cleanEnv(), encoding: 'utf8', maxBuffer: 1 << 24 }, LB_CAP_MS, `alloc-per-op LB ${key}`);
            RUNS.set(key, { value: r });
        } catch (e) {
            RUNS.set(key, { error: e });
        }
    }
    const ent = RUNS.get(key);
    if (ent.error) throw ent.error;
    return ent.value;
}
const cmdOf = (args) => 'node ' + args.join(' ');
function jsonRun() {
    const r = spawnLb('json', ARGS_JSON);
    assert.deepEqual(lbExitProblems(r.status, r.signal, 0), [], `${cmdOf(ARGS_JSON)}\n--- stderr:\n${r.stderr}`);
    return r.stdout;
}

after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

test('LB 1: the --json spawn (LiteBisect order, --json before the lanes) exits 0 with the shape LiteBisect reads', (t) => {
    const out = jsonRun();
    assert.deepEqual(lbShapeProblems(out, REQ), []);
    t.diagnostic('null windows (counted, never coerced): ' + lbNulls(out));
});

test('LB 2: the --max 1 spawn on box.frac exits 1 with the peak FAIL gate line', () => {
    const r = spawnLb('max1', ARGS_MAX);
    assert.deepEqual(lbGateProblems(r.status, r.signal, r.stdout), [], `${cmdOf(ARGS_MAX)}\n--- stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
});

// ASSERTION 8 must-fail: 8 planted mutations of the REAL --json line, each flagged exactly once, by its own problem.
const MUTANTS = [
    ['signal deleted', (j) => { delete j.signal; }, /^signal absent$/],
    ['signal "space-used"', (j) => { j.signal = 'space-used'; }, /^signal is string "space-used"/],
    ['windows 5', (j) => { j.windows = 5; }, /^windows is number 5,/],
    ['n as a string', (j) => { j.n = String(j.n); }, /^n is string "1000000",/],
    ['2 benches', (j) => { j.benches.push(structuredClone(j.benches[0])); }, /^benches\.length 2, expected 1$/],
    ['floor null', (j) => { j.floor = null; }, /^floor is object null, not a finite number/],
    ['a trailing text line', null, /^last stdout line is not JSON/],
    ['a renamed lane', (j) => { j.benches[0].rows.find((r) => r.lane === 'box.frac').lane = 'box.fracx'; }, /^lanes \["box\.fracx","harness\.empty"\]/],
];
// Extra controls (each guard's fail-open side, LEDGER #135): not in ASSERTION 8's list of 8.
const EXTRA = [
    ['floor absent', (j) => { delete j.floor; }, /^floor absent$/],
    ['a row with 5 windows', (j) => { j.benches[0].rows[0].windows.pop(); }, /windows .*expected an array of 6$/],
    ['a window Infinity (1e999)', 'inf', /window\(s\) 1=number Infinity not a finite number or null$/],
    ['a window as a string', (j) => { j.benches[0].rows[0].windows[2] = '0.5'; }, /window\(s\) 2=string "0\.5" not a finite number or null$/],
    ['a duplicated lane row', (j) => { j.benches[0].rows.push(structuredClone(j.benches[0].rows[0])); }, /^lanes \[/],
    ['warm 200000', (j) => { j.warm = 200000; }, /^warm is number 200000,/],
    ['a lane as an array', (j) => { const r = j.benches[0].rows[0]; r.lane = [r.lane]; }, /^lanes \[/],
];
function planted(out, mut) {
    const lines = out.trim().split('\n');
    const j = JSON.parse(lines.pop());
    if (mut === null) return out.trim() + '\ndone\n';
    if (mut === 'inf') return [...lines, JSON.stringify(j).replace(/("windows":\[[^,\]]+,)[^,\]]+/, '$11e999')].join('\n') + '\n';
    mut(j);
    return [...lines, JSON.stringify(j)].join('\n') + '\n';
}
test('LB 3 (must-fail): 8 planted mutations of the real --json line, each flagged exactly once', () => {
    const out = jsonRun();
    assert.deepEqual(lbShapeProblems(out, REQ), [], 'the unmutated line must be clean first (else the mutants prove nothing)');
    for (const [name, mut, re] of MUTANTS) {
        const p = lbShapeProblems(planted(out, mut), REQ);
        assert.equal(p.length, 1, `${name}: expected exactly 1 problem, got ${JSON.stringify(p)}`);
        assert.match(p[0], re, name);
    }
});
test('LB 4 (must-fail, extra): floor absent, short / non-finite / string windows, a duplicated row, warm', () => {
    const out = jsonRun();
    for (const [name, mut, re] of EXTRA) {
        const p = lbShapeProblems(planted(out, mut), REQ);
        assert.equal(p.length, 1, `${name}: expected exactly 1 problem, got ${JSON.stringify(p)}`);
        assert.match(p[0], re, name);
    }
});
test('LB 5 (must-fail): the gate contract refuses the old STEADY tool, exit 2, a signal, and a missing line', () => {
    const line = 'gate --max 1 (peak B/op): FAIL\n';
    assert.deepEqual(lbGateProblems(1, null, 'x\n' + line), []);
    assert.deepEqual(lbGateProblems(0, null, 'gate --max 1 (steady B/op): PASS\n'), ['exit 0, expected 1', 'stdout lacks ' + GATE_FAIL.source]);
    assert.deepEqual(lbGateProblems(2, null, line), ['exit 2, expected 1']);
    assert.deepEqual(lbGateProblems(null, 'SIGKILL', line), ['killed by SIGKILL', 'exit null, expected 1']);
    assert.deepEqual(lbGateProblems(1, null, 'gate --max 1 (peak B/op): NO VERDICT\n'), ['stdout lacks ' + GATE_FAIL.source]);
});
test('LB 6 (must-fail): the --json spawn exit contract refuses exit 2 (NO VERDICT prints its JSON too), exit 1, a signal', () => {
    assert.deepEqual(lbExitProblems(0, null, 0), []);
    assert.deepEqual(lbExitProblems(2, null, 0), ['exit 2, expected 0']);
    assert.deepEqual(lbExitProblems(1, null, 0), ['exit 1, expected 0']);
    assert.deepEqual(lbExitProblems(null, 'SIGTERM', 0), ['killed by SIGTERM', 'exit null, expected 0']);
});
