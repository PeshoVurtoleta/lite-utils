// test/alloc-per-op-qa-b93.test.mjs -- b93 qa: boundary rows for the gaps left by fixa / fixb (PLAN-A / PLAN-B ASSERTIONS,
// RULINGS-cli-audit D + F). Oracle = the rulings and SPEC S-A52..S-A62 (C-14 as narrowed by Q-B93-C14 (a)), never the code.
// TOOL = ROOT/src/alloc-per-op.mjs, or $APO_TOOL when set (so the same file runs against the frozen SNAP or a mutant).
// Each row's title names its SNAP verdict and the mutant it kills. Benches are written into each row's own mkdtemp dir
// (apo-qa93-*); caps go only through capSync (spawn-cap S5 census). T = --n 100000 --windows 3 --warm 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, writeFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const TOOL = process.env.APO_TOOL ? process.env.APO_TOOL : join(ROOT, 'src', 'alloc-per-op.mjs');
// cap model as the cli / fixa / fixb files (local max x 10, PRELIMINARY); every spawn here is a T-cell run (< 1 s locally).
const CAP_MS = 31000;

let M = null, LOAD_ERR = null;
try { M = await import(pathToFileURL(TOOL).href); } catch (e) { LOAD_ERR = e; }
function mod() {
    assert.ok(M !== null, `TOOL ${TOOL} failed to load (null is not zero): ${LOAD_ERR && LOAD_ERR.message}`);
    return M;
}

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH', 'APO_SPY', 'APO_SPY_DROP', 'APO_SPY_CHILD', 'APO_SPY_SCMISS', 'APO_SPY_HIDE', 'ALLOC_PER_OP_CHILD']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // deleting is not enough: node re-adds it
    return { ...e, ...extra };
}

const DIRS = [];
function mkdir() { const d = mkdtempSync(join(tmpdir(), 'apo-qa93-')); DIRS.push(d); return d; }
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

const T = ['--n', '100000', '--windows', '3', '--warm', '0'];
const why = (r) => `exit ${r.status} signal ${r.signal}\n--- stdout:\n${String(r.stdout).slice(0, 2000)}\n--- stderr:\n${String(r.stderr).slice(0, 2000)}`;
function benchFile(dir, name, src) { const p = join(dir, name); writeFileSync(p, src); return p; }
// --expose-gc on the tool itself: no re-spawn, one process per row.
function run(args, dir) {
    assert.ok(existsSync(TOOL), `TOOL ${TOOL} does not exist (null is not zero: every row fails, none skips)`);
    return capSync(process.execPath, ['--expose-gc', TOOL, ...args], { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 1 << 26 }, CAP_MS, `alloc-per-op-qa-b93 ${args.join(' ').slice(0, 60)}`);
}
function lastJson(r) {
    const lines = String(r.stdout).split('\n').filter((l) => l.trim() !== '');
    assert.ok(lines.length >= 1, `stdout is empty, no JSON line\n${why(r)}`);
    try { return JSON.parse(lines[lines.length - 1]); } catch (e) { assert.fail(`last stdout line is not JSON (${e.message})\n${why(r)}`); }
}
const refusal = (argv) => { try { mod().parseArgs(argv); return null; } catch (e) { return String(e && e.message); } };

const F64 = 'const a = new Float64Array(2);\n';
// the fenceafter swap (test/fixtures/alloc-per-op/fenceafter.mjs), inlined so a second lane can sit next to it
const SWAP = "import v8 from 'node:v8';\nclass NoGc { start() {} stop() { return { statistics: [] }; } }\nlet armed = false;\n" +
    'const swap = (i) => { if (!armed) { armed = true; v8.GCProfiler = NoGc; } a[i & 1] = i; };\n';

// ================= U6 / S-A59: the BAND_HI_N_MIN threshold at N-1, N, N+1 and the top of --n =================
// True definition (RULINGS Q-CA-BAND (a), C-4): hiFixed = (n < 1000000 ? 2 : 1) x 524288 / n; the --tol floor = 32 / sub + hiFixed.
test('QA-B1 --tol floor at --n 999999 (N-1, --sub 1001) is doubled; at --n 1000000 (N) and 1000001 (N+1, --sub 9901) and 100000000 it is not (kills M-OFF threshold 999999, M-LE n <= 1e6, M-INV >=) [SNAP-red: N-1 accepts 0.8]', () => {
    const lo = 32 / 1001, floor = lo + 2 * 524288 / 999999;   // hand: 0.031968 + 1.048577 = 1.080545
    const m = refusal(['--n', '999999', '--sub', '1001', '--tol', '0.8', 'a.mjs', 'b.mjs']);
    assert.ok(m !== null, 'N-1: --tol 0.8 sits under the doubled floor and is refused');
    assert.ok(m.includes('smallest accepted value is ' + floor + ' B/op'), m);
    assert.equal(refusal(['--n', '999999', '--sub', '1001', '--tol', String(floor), 'a.mjs', 'b.mjs']), null, 'N-1: the named floor itself is accepted');
    assert.equal(refusal(['--n', '1000000', '--tol', '0.6', 'a.mjs', 'b.mjs']), null, 'N: 0.6 >= 0.0032 + 0.524288');
    assert.ok(String(refusal(['--n', '1000000', '--tol', '0.5', 'a.mjs', 'b.mjs'])).includes('smallest accepted value is ' + (0.0032 + 524288 / 1e6) + ' B/op'));
    assert.equal(refusal(['--n', '1000001', '--sub', '9901', '--tol', '0.6', 'a.mjs', 'b.mjs']), null, 'N+1: factor 1');
    assert.ok(String(refusal(['--n', '100000000', '--tol', '0.008', 'a.mjs', 'b.mjs'])).includes('smallest accepted value is ' + (0.0032 + 524288 / 1e8) + ' B/op'));
});
test('QA-B2 bandOf integer matrix: 999999 doubled; 1e6, 2^30, 2^31-1, 2^31, 2^32-1, 2^32, 2^53-1, 2^53 factor 1; -1, 0, -0, NaN, null, undefined, 1.5 throw (fail closed) (kills M-INV, M-OFF) [SNAP-red: 999999 not doubled]', () => {
    const { bandOf } = mod();
    assert.equal(bandOf(999999, 1000).hiFixed, 2 * 524288 / 999999);
    for (const n of [1e6, 2 ** 30, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1, 2 ** 32, 2 ** 53 - 1, 2 ** 53]) {
        assert.equal(bandOf(n, 1000).hiFixed, 524288 / n, `n ${n}`);
    }
    for (const n of [-1, 0, -0, NaN, null, undefined, 1.5]) assert.throws(() => bandOf(n, 1000), RangeError, `n ${String(n)}`);
});

// ================= U2 / S-A52: the setup allowlist on values the planner did not list =================
test('QA-S1 `export const setup = null`: exit 2, stdout "", "plain or async function (got [object Null])" (kills M-NULLSKIP: null treated as absent) [SNAP-red: "must be a function"]', () => {
    const dir = mkdir();
    const p = benchFile(dir, 'b.mjs', F64 + 'export const lanes = { k: (i) => { a[i & 1] = i + 0.5; } };\nexport const setup = null;\n');
    const r = run(['--json', ...T, p], dir);
    assert.equal(r.status, 2, why(r));
    assert.equal(String(r.stdout), '', why(r));
    assert.match(String(r.stderr), /`setup` must be a plain or async function \(got \[object Null\]\)/, why(r));
});
test('QA-S2 adversarial: a revoked Proxy as setup: exit 2, stdout "", "BENCH <p>: reading `setup` threw: ..." (kills M-SK: the toString read outside its try) [SNAP-red: "setup() threw"]', () => {
    const dir = mkdir();
    const p = benchFile(dir, 'b.mjs', F64 + 'export const lanes = { k: (i) => { a[i & 1] = i + 0.5; } };\n' +
        'const { proxy, revoke } = Proxy.revocable(function () {}, {});\nrevoke();\nexport const setup = proxy;\n');
    const r = run(['--json', ...T, p], dir);
    assert.equal(r.status, 2, why(r));
    assert.equal(String(r.stdout), '', why(r));
    // b95 (PLAN-GB TASK 5): the bench path is matched literally (the tool prints it realpath'd: macOS /var -> /private/var),
    // so a TMPDIR with a space still matches; the tail is non-empty
    const err = String(r.stderr), head = 'NO VERDICT: BENCH ' + realpathSync(p) + ': reading `setup` threw: ';
    const at = err.indexOf(head);
    assert.ok(at >= 0, `stderr names the bench path and "reading \`setup\` threw: "\n${why(r)}`);
    assert.ok(err.slice(at + head.length).split('\n')[0].trim() !== '', `the thrown text after "threw: " is non-empty\n${why(r)}`);
});

// ================= U3 / S-A57 + Q-B93-C14 (a): the fence label on text lines =================
test('QA-F1 gate text: a VOID lane next to a fence-swapping lane, --max 100: "v ... NO VERDICT (VOID)" and "swap ... NO VERDICT (fence)" (VOID wins; kills M-PREC: fence checked before VOID) [SNAP-red: swap PASS]', () => {
    const dir = mkdir();
    // v allocates a 64-slot array per op (far above new space per sub-window): every window VOIDs; it runs before the swap.
    const p = benchFile(dir, 'b.mjs', F64 + SWAP + 'let keep = null;\nexport const lanes = { v: (i) => { keep = new Array(64); }, swap };\n');
    const r = run([...T, '--max', '100', p], dir);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stdout), /^ {2}v +\S+ +NO VERDICT \(VOID\)$/m, why(r));
    assert.match(String(r.stdout), /^ {2}swap +\S+ +NO VERDICT \(fence\)$/m, why(r));
    assert.match(String(r.stderr), /fence \(after\): recorded 0 < forced 1/, why(r));
});
test('QA-F2 A/B on a fence miss, --tol 100: ab.lanes [[ok, NO VERDICT], [onlyA, ONLY-A]]; the text A/B lane line ends "NO VERDICT" with no label (kills M-ONLY: ONLY-A turned NO VERDICT, M-ABL: a (fence) label on A/B lines) [SNAP-red: ok SAME]', () => {
    const dir = mkdir();
    const A = benchFile(dir, 'a.mjs', F64 + 'export const lanes = { ok: (i) => { a[i & 1] = i; }, onlyA: (i) => { a[i & 1] = i; } };\n');
    const B = benchFile(dir, 'b.mjs', F64 + SWAP + 'export const lanes = { ok: swap };\n');
    const j = run(['--json', ...T, '--tol', '100', A, B], dir);
    assert.equal(j.status, 2, why(j));
    assert.deepEqual(lastJson(j).ab.lanes.map((l) => [l.lane, l.verdict]), [['ok', 'NO VERDICT'], ['onlyA', 'ONLY-A']], why(j));
    const t = run([...T, '--tol', '100', A, B], dir);
    assert.equal(t.status, 2, why(t));
    const ab = String(t.stdout).slice(String(t.stdout).indexOf('A/B --tol'));
    assert.match(ab, /^ {2}ok +(\S+ +){4}NO VERDICT$/m, why(t));
    assert.match(ab, /^ {2}onlyA +(\S+ +){4}ONLY-A$/m, why(t));
    assert.ok(!ab.includes('(fence)'), `A/B text lines carry no label (C-14 as narrowed by Q-B93-C14 (a))\n${why(t)}`);
});
