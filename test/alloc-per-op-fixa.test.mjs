// test/alloc-per-op-fixa.test.mjs -- b93 batch H (PLAN-A TASK 5): the fix-A rows of alloc-per-op (S-A52..S-A55).
// Oracle = .handoff/b93/PLAN-A.md ASSERTIONS A1-A5, never the code. TOOL = ROOT/src/alloc-per-op.mjs, or $APO_TOOL when set
// (so the same file runs against the frozen SNAP). Cells: C6 = --n 1000000 --windows 3; T = --n 100000 --windows 3 --warm 0.
// Benches are written into each row's own mkdtemp dir. Caps go only through capSync (spawn-cap S5 census); async throws
// in benches use setImmediate. Each row's title ends with SNAP-red or SNAP-green (the old code's verdict on it).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const TOOL = process.env.APO_TOOL ? process.env.APO_TOOL : join(ROOT, 'src', 'alloc-per-op.mjs');
const TOOL_URL = pathToFileURL(TOOL).href;
// cap model as the cli file (local max x 10, PRELIMINARY): the C6 rows run 3 windows of 1e6 ops (~3 s locally).
const CAP_MS = 31000;
const KEY_NAME = '@zakkster/lite-utils/alloc-per-op.direct';

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH', 'APO_SPY', 'APO_SPY_DROP', 'APO_SPY_CHILD', 'APO_SPY_SCMISS', 'APO_SPY_HIDE', 'ALLOC_PER_OP_CHILD']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // deleting is not enough: node re-adds it
    return { ...e, ...extra };
}

const DIRS = [];
function mkdir() { const d = mkdtempSync(join(tmpdir(), 'apo-fixa-')); DIRS.push(d); return d; }
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

const C6 = ['--n', '1000000', '--windows', '3'];
const T = ['--n', '100000', '--windows', '3', '--warm', '0'];
const why = (r) => `exit ${r.status} signal ${r.signal}\n--- stdout:\n${String(r.stdout).slice(0, 2000)}\n--- stderr:\n${String(r.stderr).slice(0, 2000)}`;
// b101 G-B (Q-B99-FIXA3 (a), Q-B100-GBSWEEP (a), Q-B100-GBLANE (a)): a live row whose point is not the measurement accepts
// "exit 0, or a sole selfCheck VOID". scVoidOnly(r): exit 2 by itself (no signal), exactly ONE stderr line holds
// `NO VERDICT`, and it is the run-mode selfCheck VOID text (src scRowMiss 'VOID in window ...' -> run() 'selfCheck: ' +
// reason + ' (no lane measured)' -> report() 'alloc-per-op: NO VERDICT: ' + r). The --self-test form (no suffix) and a
// lane VOID ('VOID: lane k, ...') are refused. Pinned by the no-spawn row after A3.
const SC_VOID_RE = /^alloc-per-op: NO VERDICT: selfCheck: (?:positive|negative): VOID in window \d+ \([1-9]\d* VOID window\(s\); C-11: a VOID anywhere is a miss\) \(no lane measured\)$/;
function scVoidOnly(r) {
    if (r.signal !== null || r.status !== 2) return false;
    const nv = String(r.stderr).split('\n').filter((l) => l.includes('NO VERDICT'));
    return nv.length === 1 && SC_VOID_RE.test(nv[0]);
}
const scVoidLine = (r) => String(r.stderr).split('\n').find((l) => l.includes('NO VERDICT'));

// bench(src) -> path of a fresh bench file in its own dir
function bench(src, name = 'bench.mjs') {
    const dir = mkdir();
    const p = join(dir, name);
    writeFileSync(p, src);
    return { dir, p };
}
function run(args, dir, o = {}) {
    assert.ok(existsSync(TOOL), `TOOL ${TOOL} does not exist (null is not zero: every row fails, none skips)`);
    const argv = [...(o.nodeFlags ?? []), TOOL, ...args];
    return capSync(process.execPath, argv, { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 1 << 26 }, o.cap ?? CAP_MS, `alloc-per-op-fixa ${args.join(' ').slice(0, 60)}`);
}
function lastJson(r) {
    const lines = String(r.stdout).split('\n').filter((l) => l.trim() !== '');
    assert.ok(lines.length >= 1, `stdout is empty, no JSON line\n${why(r)}`);
    try { return JSON.parse(lines[lines.length - 1]); } catch (e) { assert.fail(`last stdout line is not JSON (${e.message})\n${why(r)}`); }
}
const rowsOf = (r) => lastJson(r).benches[0].rows.map((x) => x.lane);

// shared bench pieces: f64 reads 0 B/op, box allocates one object per op (>= 8 B/op)
const F64 = 'const a = new Float64Array(2);\nconst f64 = (i) => { a[i & 1] = i + 0.5; };\n';
const BOX = 'let keep = null;\nconst box = (i) => { keep = { v: i }; };\n';

// ================= A1: setup() runs (and is awaited) before `lanes` is read =================
test('A1(a) placeholder k + async setup that installs box: exit 1 FAIL (kills M3 old order, M4 AsyncFunction refused) [SNAP-red: exit 0]', () => {
    const { dir, p } = bench(BOX + 'export const lanes = { k: (i) => {} };\nexport async function setup() { await null; lanes.k = box; }\n');
    const r = run(['--json', ...C6, '--max', '4', p], dir);
    assert.equal(r.status, 1, why(r));
    assert.equal(lastJson(r).gate.verdict, 'FAIL');
});
test('A1(b) setup adds a box lane `added` to f64 k: rows [k, added], exit 1 [SNAP-red: rows [k], exit 0]', () => {
    const { dir, p } = bench(F64 + BOX + 'export const lanes = { k: f64 };\nexport function setup() { lanes.added = box; }\n');
    const r = run(['--json', ...C6, '--max', '4', p], dir);
    assert.equal(r.status, 1, why(r));
    assert.deepEqual(rowsOf(r), ['k', 'added']);
});
test('A1(c) `lanes = {}` filled by setup with f64, --max 1: exit 0 PASS, f64 reads under 1 B/op, or a sole selfCheck VOID with floor null [SNAP-red: exit 2 "is empty"]', (t) => {
    const { dir, p } = bench(F64 + 'export const lanes = {};\nexport function setup() { lanes.k = f64; }\n');
    const r = run(['--json', ...C6, '--max', '1', p], dir);
    // loadBench and selectLanes run before selfCheck: "is empty" is a different reason, so the VOID branch still kills SNAP
    if (scVoidOnly(r)) {
        t.diagnostic('selfCheck VOID NO VERDICT accepted (Q-B100-GBSWEEP (a)): ' + scVoidLine(r));
        assert.equal(lastJson(r).floor, null, why(r));
        return;
    }
    assert.equal(r.status, 0, why(r));
    const row = lastJson(r).benches[0].rows[0];
    assert.equal(row.lane, 'k');
    const ws = row.windows.filter((w) => typeof w === 'number');
    assert.ok(ws.length >= 1, 'at least one measured window');
    for (const w of ws) assert.ok(w < 1, `f64 window ${w} B/op < 1`);
});
test('A1(d) `export let lanes` rebound by setup to {k: box}, --max 4: exit 1, box reads at least 8 B/op (kills M1) [SNAP-red: exit 0]', () => {
    const { dir, p } = bench(F64 + BOX + 'export let lanes = { k: f64 };\nexport function setup() { lanes = { k: box }; }\n');
    const r = run(['--json', ...C6, '--max', '4', p], dir);
    assert.equal(r.status, 1, why(r));
    const ws = lastJson(r).benches[0].rows[0].windows.filter((w) => typeof w === 'number');
    assert.ok(ws.length >= 1);
    for (const w of ws) assert.ok(w >= 8, `box window ${w} B/op >= 8`);
});
test('A1(e) {keep: f64, gone: box}, setup deletes gone, --max 4: rows [keep], exit 0 (kills M2) [SNAP-red: exit 1]', () => {
    const { dir, p } = bench(F64 + BOX + 'export const lanes = { keep: f64, gone: box };\nexport function setup() { delete lanes.gone; }\n');
    const r = run(['--json', ...C6, '--max', '4', p], dir);
    assert.equal(r.status, 0, why(r));
    assert.deepEqual(rowsOf(r), ['keep']);
});
for (const [label, decl] of [['function*', 'export function* setup() {}'], ['async function*', 'export async function* setup() {}']]) {
    test(`A1(f) ${label} setup, --max 1: exit 2, stdout '', "plain or async function (got [object (Async)?GeneratorFunction])" (kills M5) [SNAP-red: exit 0]`, () => {
        const { dir, p } = bench(F64 + `export const lanes = { k: f64 };\n${decl}\n`);
        const r = run(['--json', ...C6, '--max', '1', p], dir);
        assert.equal(r.status, 2, why(r));
        assert.equal(String(r.stdout), '', why(r));
        assert.match(String(r.stderr), /plain or async function \(got \[object (Async)?GeneratorFunction\]\)/, why(r));
    });
}
test('A1(g) `export const setup = 1`: exit 2 naming "got [object Number]" [SNAP-red: old text]', () => {
    const { dir, p } = bench(F64 + 'export const lanes = { k: f64 };\nexport const setup = 1;\n');
    const r = run(['--json', ...C6, '--max', '1', p], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /got \[object Number\]/, why(r));
});

// ================= A2: every error print is total (exit 0/1/2, never 7) =================
for (const [label, expr, re] of [['Symbol', "Symbol('boom')", /NO VERDICT: uncaught: Symbol\(boom\)/], ['null-prototype object', 'Object.create(null)', /NO VERDICT: uncaught: \(unprintable object\)/]]) {
    test(`A2 setImmediate throws a ${label}, --expose-gc, T: exit 2, "NO VERDICT: uncaught: ..." (kills M7) [SNAP-red: exit 7]`, () => {
        const { dir, p } = bench(F64 + `export const lanes = { k: f64 };\nexport function setup() { setImmediate(() => { throw ${expr}; }); }\n`);
        const r = run([...T, p], dir, { nodeFlags: ['--expose-gc'] });
        assert.equal(r.status, 2, why(r));
        assert.match(String(r.stderr) + String(r.stdout), re, why(r));
    });
}
test('A2 sync `throw Object.create(null)` in setup, T: "NO VERDICT: BENCH ... setup() threw: (unprintable object)" (kills M6) [SNAP-red: no match]', () => {
    const { dir, p } = bench(F64 + 'export const lanes = { k: f64 };\nexport function setup() { throw Object.create(null); }\n');
    const r = run([...T, p], dir, { nodeFlags: ['--expose-gc'] });
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr) + String(r.stdout), /NO VERDICT: BENCH .*setup\(\) threw: \(unprintable object\)/, why(r));
});

test('P1b setup throws an object whose `message` getter returns "a" then 42, T: exit 2, stderr "NO VERDICT: BENCH ... setup() threw: a" (one read of message, total print) [SNAP-red]', () => {
    const { dir, p } = bench(F64 + "let n = 0;\nconst H = { get message() { return ++n === 1 ? 'a' : 42; } };\nexport const lanes = { k: f64 };\nexport function setup() { throw H; }\n");
    const r = run([...T, p], dir, { nodeFlags: ['--expose-gc'] });
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /NO VERDICT: BENCH .*setup\(\) threw: a$/m, why(r));
});

// ================= A3: self-import key (S-A54), --lane dash =================
test('A3 a bench that imports TOOL?again=1 during a run: exit 2, stdout \'\', "import threw: the tool file was imported again" (kills M8) [SNAP-red: exit 1, 2 JSON lines]', () => {
    const { dir, p } = bench(BOX + `await import(${JSON.stringify(TOOL_URL + '?again=1')});\nexport const lanes = { k: box };\n`);
    const r = run(['--json', ...C6, '--max', '4', p], dir);
    assert.equal(r.status, 2, why(r));
    assert.equal(String(r.stdout), '', why(r));
    assert.match(String(r.stderr), /import threw: the tool file was imported again/, why(r));
});
test('A3 the direct run sets the key: setup prints it, stderr has "APO-KEY true"; exit 0 or a sole selfCheck VOID (kills M10) [SNAP-red: undefined]', (t) => {
    const { dir, p } = bench(F64 + `export const lanes = { k: f64 };\nexport function setup() { process.stderr.write('APO-KEY ' + globalThis[Symbol.for(${JSON.stringify(KEY_NAME)})] + '\\n'); }\n`);
    const r = run([...T, p], dir, { nodeFlags: ['--expose-gc'] });
    // setup runs before selfCheck (CI log b98 :4931), so the key line is checked on both branches (M10 is killed on both)
    assert.match(String(r.stderr), /^APO-KEY true$/m, why(r));
    if (scVoidOnly(r)) t.diagnostic('selfCheck VOID NO VERDICT accepted (Q-B99-FIXA3 (a)): ' + scVoidLine(r));
    else assert.equal(r.status, 0, why(r));
});
test('A3 in-process import of TOOL and TOOL?twice=1: both resolve, the key stays undefined (kills M9) [SNAP-green by design]', () => {
    const dir = mkdir();
    const s = join(dir, 'imp.mjs');
    writeFileSync(s, `const k = Symbol.for(${JSON.stringify(KEY_NAME)});\nawait import(${JSON.stringify(TOOL_URL)});\nawait import(${JSON.stringify(TOOL_URL + '?twice=1')});\nconsole.log('KEY ' + globalThis[k]);\n`);
    const r = capSync(process.execPath, [s], { cwd: dir, env: cleanEnv(), encoding: 'utf8' }, CAP_MS, 'alloc-per-op-fixa in-process import');
    assert.equal(r.status, 0, why(r));
    assert.match(String(r.stdout), /^KEY undefined$/m, why(r));
});
test('A3 `--lane -x` on a lane named -x, T: exit 0, rows [-x], or a sole selfCheck VOID with floor null (kills M-LD) [SNAP-green by design]', (t) => {
    const { dir, p } = bench(F64 + "export const lanes = { '-x': f64 };\n");
    const r = run(['--json', ...T, '--lane', '-x', p], dir, { nodeFlags: ['--expose-gc'] });
    // parseArgs / selectLanes run before selfCheck: a refused `-x` is a different reason, so the VOID branch still kills M-LD
    if (scVoidOnly(r)) {
        t.diagnostic('selfCheck VOID NO VERDICT accepted (Q-B100-GBSWEEP (a)): ' + scVoidLine(r));
        assert.equal(lastJson(r).floor, null, why(r));
        return;
    }
    assert.equal(r.status, 0, why(r));
    assert.deepEqual(rowsOf(r), ['-x']);
});

// b101 G-B pin (no spawn): scVoidOnly against canned results. PASS = the b98 CI vector (macos node 24, run 137526351987,
// log :4931-4932, prefixes cut: .handoff/b100/evidence/gb-void-vector.txt) and a negative-VOID variant; FAIL = 13 vectors
// that must stay red. Plus the TOOL-text pin: the three fragments that build the accepted line are present in TOOL.
const SC_VOID_CI = 'alloc-per-op: NO VERDICT: selfCheck: positive: VOID in window 0 (1 VOID window(s); C-11: a VOID anywhere is a miss) (no lane measured)';
const SC_VOID_NEG = 'alloc-per-op: NO VERDICT: selfCheck: negative: VOID in window 2 (2 VOID window(s); C-11: a VOID anywhere is a miss) (no lane measured)';
const SC_PASS = [
    ['b98 CI vector (positive VOID)', { status: 2, signal: null, stderr: 'APO-KEY true\n' + SC_VOID_CI + '\n' }],
    ['negative VOID', { status: 2, signal: null, stderr: 'APO-KEY true\n' + SC_VOID_NEG + '\n' }],
];
const SC_FAIL = [
    ['VOID line + an uncaught line', { status: 2, signal: null, stderr: SC_VOID_CI + '\nalloc-per-op: NO VERDICT: uncaught: Error: x\n' }],
    ['positive box-peak miss', { status: 2, signal: null, stderr: 'alloc-per-op: NO VERDICT: selfCheck: positive: box peak 3 B/op < POS_MIN_BPO 8 (the harness does not see a box) (no lane measured)\n' }],
    ['positive window-null miss', { status: 2, signal: null, stderr: 'alloc-per-op: NO VERDICT: selfCheck: positive: window 1 is null (not a finite number) (no lane measured)\n' }],
    ['negative band miss', { status: 2, signal: null, stderr: 'alloc-per-op: NO VERDICT: selfCheck: negative: empty peak 9 B/op outside [-1, 2] (no lane measured)\n' }],
    ['fence miss', { status: 2, signal: null, stderr: 'alloc-per-op: NO VERDICT: selfCheck: fence: recorded 0 < forced 1 (the GC fence does not see a forced GC) (no lane measured)\n' }],
    ['exit 1 with the VOID line', { status: 1, signal: null, stderr: SC_VOID_CI + '\n' }],
    ['exit 2, empty stderr', { status: 2, signal: null, stderr: '' }],
    ['exit 2, only APO-KEY true', { status: 2, signal: null, stderr: 'APO-KEY true\n' }],
    ['status null / SIGKILL with the VOID line', { status: null, signal: 'SIGKILL', stderr: SC_VOID_CI + '\n' }],
    ['the --self-test form (no suffix)', { status: 2, signal: null, stderr: 'alloc-per-op: NO VERDICT: selfCheck: positive: VOID in window 0 (1 VOID window(s); C-11: a VOID anywhere is a miss)\n' }],
    ['a lane VOID', { status: 2, signal: null, stderr: 'alloc-per-op: NO VERDICT: VOID: lane k, 1 VOID window(s), first window 0\n' }],
    ['prefixed VOID line', { status: 2, signal: null, stderr: 'x ' + SC_VOID_CI + '\n' }],
    ['suffixed VOID line', { status: 2, signal: null, stderr: SC_VOID_CI + ' x\n' }],
];
test('G-B pin: scVoidOnly accepts 2/2 canned selfCheck VOID results and refuses 13/13 others; TOOL holds the 3 producer fragments (no spawn)', () => {
    for (const [name, r] of SC_PASS) assert.equal(scVoidOnly(r), true, `PASS vector "${name}" must be accepted`);
    for (const [name, r] of SC_FAIL) assert.equal(scVoidOnly(r), false, `FAIL vector "${name}" must be refused`);
    assert.equal(SC_PASS.length, 2);
    assert.equal(SC_FAIL.length, 13);
    assert.ok(existsSync(TOOL), `TOOL ${TOOL} does not exist (null is not zero)`);
    const text = readFileSync(TOOL, 'utf8');
    for (const frag of [
        "return 'VOID in window ' + row.voidAt + ' (' + row.voids + ' VOID window(s); C-11: a VOID anywhere is a miss)';",
        "reasons.push('selfCheck: ' + sc.reason + ' (no lane measured)');",
        "for (const r of reasons) process.stderr.write('alloc-per-op: NO VERDICT: ' + r + '\\n');",
    ]) assert.ok(text.includes(frag), `TOOL ${TOOL} lacks the producer fragment: ${frag}`);
});

// ================= A4: -h text (stays red until batch A2 lands) =================
test('A4 -h carries the S-A52..S-A55 lines and lacks "the same file twice" [SNAP-red; stays red until A2]', () => {
    const { dir } = bench('export const lanes = {};\n');
    const r = run(['-h'], dir);
    assert.equal(r.status, 2, why(r));
    const out = String(r.stdout);
    for (const s of ['before `lanes` is read', 'a plain or async function', 'needs i >= S never happens', 'on the order of 100 B/op', 'the last line the tool writes to stdout', 'after realpath', 'counts as a copy', 'exits when the event loop drains', 'does not reach the --expose-gc child', 'checked after the bench loads', 'is doubled (PRELIMINARY)']) {
        assert.ok(out.includes(s), `-h names: ${s}`);
    }
    assert.ok(!out.includes('the same file twice'), '-h lacks "the same file twice"');
});

// ================= A5: retention =================
// The dir half of retention is not checked here: the dirs live until `after` removes them, so a check inside a row would be
// tautological. Only the child half is gated (after removal in `after`, nothing of ours remains by construction).
test('A5 retention: no child of this pid remains after the rows [regression pin]', () => {
    const r = capSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', env: cleanEnv() }, 10000, 'ps children');
    const kids = String(r.stdout).split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => Number(c[1]) === process.pid && Number(c[0]) !== r.pid);
    assert.deepEqual(kids, [], 'no child of the test pid remains');
});
