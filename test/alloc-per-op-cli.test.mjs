// test/alloc-per-op-cli.test.mjs -- b86 G2 H1 (SPEC-alloc-per-op.md 4.G2 TASK 8): the CLI rows A1-A9 of alloc-per-op.
// Oracle = SPEC section 0 CURRENT (C-14..C-24), 4.G2 ASSERTIONS A1-A8 and .handoff/b86/BRIEF-common.md (refusal table) --
// never the code. TOOL = ROOT/src/alloc-per-op.mjs, or $APO_TOOL when set (C-24; the prototype ROOT/alloc-per-op.mjs is
// never run). A missing TOOL FAILS every row (null is not zero; never SKIP).
// Zero-spawn mechanism: `node --import test/fixtures/alloc-per-op/spawn-spy.mjs TOOL ...`; the spy appends one JSON line per
// process to $APO_SPY; "0 spawns" = exactly 1 line, and a MISSING spy file fails by name.
// B1, B2 and B3 (usage text) have landed (b87): no row is red by design. b87 H1e adds the selfCheck-miss --self-test rows (APO_SPY_SCMISS).
// The body's A6 row 'box at --n 100000 --max 14 -> NO VERDICT (within band' is DELETED per C-23 (S-A1); the band refusal
// is covered by A9 / C-22 (the self-test 'refusal' row).
// Caps go only through capSync (spawn-cap.mjs); no raw cap in this file (spawn-cap.test.mjs S5 census).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const TOOL = process.env.APO_TOOL ? process.env.APO_TOOL : join(ROOT, 'src', 'alloc-per-op.mjs');
const FIX = join(dirname(HERE), 'fixtures', 'alloc-per-op');
const SPY_URL = pathToFileURL(join(FIX, 'spawn-spy.mjs')).href;
const fx = (name) => join(FIX, name + '.mjs');
// REFUSAL_CAP_MS was not censused (refusal / parse rows spawn one cheap node, ~0.1 s locally); MEASURED_CAP_MS is the b87 census below.
const REFUSAL_CAP_MS = 30000;
// MEASURED_CAP_MS: census .handoff/b87/b3/census-cli.txt (local max 3061.1 ms, row C-23, x10 = 30611, rounded up); C-10 model (local max x 10), PRELIMINARY; per-leg CI re-census is G3's (law 8)
const MEASURED_CAP_MS = 31000;

// ---- the module under test (in-process rows): a load failure FAILS the row, never skips ----
let M = null, LOAD_ERR = null;
try { M = await import(pathToFileURL(TOOL).href); } catch (e) { LOAD_ERR = e; }
function mod() {
    assert.ok(M !== null, `TOOL ${TOOL} failed to load (null is not zero): ${LOAD_ERR && LOAD_ERR.message}`);
    return M;
}
function need(name) {
    const f = mod()[name];
    assert.equal(typeof f, 'function', `${name} is not exported by ${basename(TOOL)} (G2 B1/B2 surface not landed)`);
    return f;
}

// ---- child plumbing (model: ref-cr-refuse.test.mjs cleanEnv; also drops the spy / child switches) ----
function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH', 'APO_SPY', 'APO_SPY_DROP', 'APO_SPY_CHILD', 'APO_SPY_SCMISS', 'ALLOC_PER_OP_CHILD']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // deleting is not enough: node re-adds it
    return { ...e, ...extra };
}

const DIRS = [];
function mkdir() { const d = mkdtempSync(join(tmpdir(), 'apo-cli-')); DIRS.push(d); return d; }
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

// run(args, o) -> { r, dir, spy }: node [nodeFlags] --import SPY TOOL args, in its own mkdtemp cwd
function run(args, o = {}) {
    assert.ok(existsSync(TOOL), `TOOL ${TOOL} does not exist (null is not zero: every row fails, none skips)`);
    const dir = o.dir ?? mkdir();
    const spy = join(dir, 'spy.jsonl');
    const env = cleanEnv({ APO_SPY: spy, ...(o.env ?? {}) });
    const argv = [...(o.nodeFlags ?? []), '--import', SPY_URL, TOOL, ...args];
    const cap = o.cap ?? REFUSAL_CAP_MS;
    const r = capSync(process.execPath, argv, { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 26 }, cap, `alloc-per-op ${args.join(' ').slice(0, 80)}`);
    return { r, dir, spy };
}
const measured = (args, o = {}) => run(args, { ...o, cap: MEASURED_CAP_MS });

function spyLines(spy) {
    assert.ok(existsSync(spy), 'spy file is missing (null is not zero: the spy never ran or never wrote)');
    return readFileSync(spy, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
}
const why = (r) => `exit ${r.status} signal ${r.signal}\n--- stdout:\n${String(r.stdout).slice(0, 2000)}\n--- stderr:\n${String(r.stderr).slice(0, 2000)}`;
function lastJson(r) {
    const lines = String(r.stdout).split('\n').filter((l) => l.trim() !== '');
    assert.ok(lines.length >= 1, `stdout is empty, no JSON line\n${why(r)}`);
    try { return JSON.parse(lines[lines.length - 1]); } catch (e) { assert.fail(`last stdout line is not JSON (${e.message})\n${why(r)}`); }
}

// a refusal: exit 2, stdout '', stderr names ITS check, exactly 1 spy line (0 spawns)
function refusal(r, spy, re) {
    assert.equal(r.status, 2, `expected refusal exit 2\n${why(r)}`);
    assert.match(String(r.stderr), re, `stderr must name this check\n${why(r)}`);
    assert.match(String(r.stderr), /^alloc-per-op: /, `stderr starts with the tool prefix\n${why(r)}`);
    assert.equal(String(r.stdout), '', 'a refusal prints nothing on stdout');
    assert.equal(spyLines(spy).length, 1, 'a refusal spawns nothing (1 spy line)');
}

const BIG = '9'.repeat(350);   // numeric text that parses to Infinity (AUD-2)
const A = fx('f64'), B = fx('box');

// ================= A1 -h / --help =================
for (const flag of ['-h', '--help']) {
    test(`A1 ${flag}: exit 2, usage on STDOUT, stderr '', content, 1 spy line (kills: usage on stderr; no off-heap / Worker / E22 / E24 / E27 text)`, () => {
        const { r, spy } = run([flag]);
        assert.equal(r.status, 2, why(r));
        assert.equal(String(r.stderr), '', 'help leaves stderr empty');
        const out = String(r.stdout);
        assert.ok(out.split('\n')[0].startsWith('alloc-per-op.mjs -- '), `line 1: ${out.split('\n')[0]}`);
        for (const s of ['new_large_object_space', 'Worker', 'off-heap', 'calls the lane again', '1000', 'below 1000']) assert.ok(out.includes(s), `usage names ${s}`);
        assert.equal(spyLines(spy).length, 1);
    });
}
test('A1 -h still scans the whole argv first: `-h --bogus` is refused (unknown option), 1 spy line', () => {
    const { r, spy } = run(['-h', '--bogus']);
    refusal(r, spy, /unknown option --bogus/);
});

// ================= A2 refusals (C-17: 25 rows + the 3 S-A1 rows) =================
// each: [title, argv(dir), stderr regex]. Every A/B row passes --tol 1 except the rows that test --tol itself.
const REFUSALS = [
    ['--n 99999 (kills: range lo)', () => ['--n', '99999', A], /--n must be/],
    ['--n 100000001 (kills: range hi)', () => ['--n', '100000001', A], /--n must be/],
    ['--n 1e6 (not an integer text)', () => ['--n', '1e6', A], /--n must be/],
    ['--windows 2', () => ['--windows', '2', A], /--windows must be/],
    ['--windows 51', () => ['--windows', '51', A], /--windows must be/],
    ['--warm 100000001', () => ['--warm', '100000001', A], /--warm must be/],
    ['--sub 999', () => ['--sub', '999', A], /--sub must be/],
    ['--sub 10001', () => ['--sub', '10001', A], /--sub must be/],
    ['--n 1000000 --sub 3000 (N % sub)', () => ['--n', '1000000', '--sub', '3000', A], /must divide --n/],
    ['--n 20000000 --sub 1000 (N / sub = 20000 > 10000)', () => ['--n', '20000000', '--sub', '1000', A], /exceeds 10000/],
    ["--max '9'.repeat(350) (kills: no isFinite)", () => ['--max', BIG, A], /--max must be a finite/],
    ["--tol '9'.repeat(350) (kills: no isFinite; two distinct BENCH)", () => ['--tol', BIG, A, B], /--tol must be a finite/],
    ['--max=-1', () => ['--max=-1', A], /--max must be a finite/],
    ['--bogus', () => ['--bogus', A], /unknown option --bogus/],
    ['--json=1', () => ['--json=1', A], /--json takes no value/],
    ['--n twice', () => ['--n', '200000', '--n', '200000', A], /--n given twice/],
    ['0 BENCH', () => ['--json'], /give one BENCH, or two for A\/B/],
    ['3 BENCH', () => [A, B, fx('mixed')], /give one BENCH, or two for A\/B/],
    ['A/B --max', () => ['--max', '1', '--tol', '1', A, B], /--max is for one BENCH/],
    ['one-bench --tol', () => ['--tol', '1', A], /--tol is for A\/B/],
    ['--self-test x (C-20)', () => ['--self-test', 'x'], /--self-test takes only --json/],
    ['missing path', (d) => [join(d, 'nope.mjs')], /cannot be resolved/],
    ['a directory', (d) => [d], /is not a regular file/],
    ['same path twice (C-18)', () => ['--tol', '1', A, A], /resolve to one file/],
    ['--max 0', () => ['--max', '0', A], /below the refusal band/],
    // S-A1 rows (C-17)
    ['A/B without --tol (C-16, S-A1)', () => [A, B], /--tol is required in A\/B/],
    ['--n 1000000 --max 0.003 (lo 0.0032: kills the removed threshold refusal)', () => ['--n', '1000000', '--max', '0.003', A], /smallest accepted value is 0\.0032 /],
    ['A/B --n 1000000 --tol 0.5 (lo + hiFixed 0.527488: kills the removed threshold refusal)', () => ['--n', '1000000', '--tol', '0.5', A, B], /smallest accepted value is 0\.527488 /],
];
test('A2 the refusal table holds 28 rows (25 + the three S-A1 rows)', () => { assert.equal(REFUSALS.length, 28); });
for (const [title, argv, re] of REFUSALS) {
    test(`A2 refusal: ${title}`, () => {
        const dir = mkdir();
        const { r, spy } = run(argv(dir), { dir });
        refusal(r, spy, re);
    });
}
test('C-18 two paths that resolve to ONE file (a symlink) are refused before the spawn: 1 spy line, /resolve to one file/', () => {
    const dir = mkdir();
    const link = join(dir, 'link.mjs');
    symlinkSync(A, link);
    const { r, spy } = run(['--tol', '1', A, link], { dir });
    refusal(r, spy, /resolve to one file/);
});
// edges are pure parseArgs calls (no spawn): C-17
test('A2 parseArgs accepts the edges: --n 100000, --n 100000000, --n 10000000 --sub 1000 (exactly 10000), --max 0.0032, --tol 0.527488', () => {
    const parseArgs = need('parseArgs');
    assert.equal(parseArgs(['--n', '100000', 'a.mjs']).n, 100000);
    assert.equal(parseArgs(['--n', '100000000', 'a.mjs']).n, 100000000);
    const p = parseArgs(['--n', '10000000', '--sub', '1000', 'a.mjs']);
    assert.equal(p.n, 10000000); assert.equal(p.sub, 1000);   // 10000000 / 1000 = 10000 exactly: `<=`, not `<`
    assert.equal(parseArgs(['--n', '1000000', '--max', '0.0032', 'a.mjs']).max, 0.0032);   // lo = 32 / 1e4 = 0.0032
    assert.equal(parseArgs(['--n', '1000000', '--tol', '0.527488', 'a.mjs', 'b.mjs']).tol, 0.527488);   // 0.0032 + 524288 / 1e6
});
test('A2 parseArgs defaults and shape (n 1e6, windows 5, warm 2e5, sub 1e4, max null, tol null: C-16)', () => {
    const parseArgs = need('parseArgs');
    assert.deepEqual(parseArgs(['a.mjs']), { n: 1000000, windows: 5, warm: 200000, sub: 10000, lanes: [], max: null, tol: null, json: false, selfTest: false, help: false, benches: ['a.mjs'] });
    const q = parseArgs(['--lane', 'x', '--lane', 'y', '--json', 'a.mjs', 'b.mjs', '--tol', '1']);
    assert.deepEqual(q.lanes, ['x', 'y']); assert.equal(q.json, true); assert.deepEqual(q.benches, ['a.mjs', 'b.mjs']); assert.equal(q.tol, 1);
});
test('A2 parseArgs throws the bare table text (no tool prefix; main adds it); the threshold message names the smallest accepted value', () => {
    const parseArgs = need('parseArgs');
    assert.throws(() => parseArgs(['--n', '99999', 'a.mjs']), (e) => e instanceof Error && /^--n must be/.test(e.message));
    assert.throws(() => parseArgs(['--n', '1000000', '--max', '0.003', 'a.mjs']), (e) => /smallest accepted value is 0\.0032 /.test(e.message) && !e.message.startsWith('alloc-per-op'));
    assert.throws(() => parseArgs(['--n', '1000000', '--tol', '0.5', 'a.mjs', 'b.mjs']), (e) => /smallest accepted value is 0\.527488 /.test(e.message));
});
test('A2 parseArgs -h returns early (help true) only after the whole argv is scanned', () => {
    const parseArgs = need('parseArgs');
    assert.equal(parseArgs(['-h']).help, true);
    assert.equal(parseArgs(['--help']).help, true);
    assert.throws(() => parseArgs(['-h', '--bogus']), /unknown option --bogus/);
});
test('C-20 parseArgs accepts `--self-test` and `--self-test --json`; `--self-test x` and `--self-test --n 1000000` are refused', () => {
    const parseArgs = need('parseArgs');
    const s = parseArgs(['--self-test', '--json']);
    assert.equal(s.selfTest, true); assert.equal(s.json, true);
    assert.equal(parseArgs(['--self-test']).selfTest, true);
    assert.throws(() => parseArgs(['--self-test', 'x']), /--self-test takes only --json/);
    assert.throws(() => parseArgs(['--self-test', '--n', '1000000']), /--self-test takes only --json/);
});

// ================= A3 one re-spawn, execArgv passed on =================
test('A3 valid f64 run: exit 0, exactly 2 spy lines; line 2 child "1", ppid = line 1 pid, execArgv holds the spy import and --expose-gc, not --no-concurrent-recompilation (kills: execArgv dropped, flag forced)', () => {
    const { r, spy } = measured(['--n', '100000', '--windows', '3', '--warm', '0', A]);
    assert.equal(r.status, 0, why(r));
    const L = spyLines(spy);
    assert.equal(L.length, 2, 'parent + one re-spawned child (the control: the spy sees real children)');
    assert.equal(L[0].child, null);
    assert.equal(L[1].child, '1');
    assert.equal(L[1].ppid, L[0].pid);
    assert.ok(L[1].execArgv.includes(SPY_URL), `execArgv ${JSON.stringify(L[1].execArgv)} keeps --import <spy>`);
    assert.ok(L[1].execArgv.includes('--expose-gc'), 'the child is started with --expose-gc');
    assert.ok(!L[1].execArgv.includes('--no-concurrent-recompilation'), 'the flag is never forced');
});
test('A3 caller passes --expose-gc: no re-spawn, exactly 1 spy line, exit 0', () => {
    const { r, spy } = measured(['--n', '100000', '--windows', '3', '--warm', '0', A], { nodeFlags: ['--expose-gc'] });
    assert.equal(r.status, 0, why(r));
    assert.ok(String(r.stdout).includes('f64'), `the run printed its report (an exit 0 with no output is no run)\n${why(r)}`);
    assert.equal(spyLines(spy).length, 1);
});
test('TASK 3 child without gc: ALLOC_PER_OP_CHILD=1 and no --expose-gc -> exit 2 /gc() still missing/, no further spawn (1 spy line)', () => {
    const { r, spy } = run(['--n', '100000', '--windows', '3', '--warm', '0', A], { env: { ALLOC_PER_OP_CHILD: '1' } });
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /gc\(\) still missing/);
    assert.equal(String(r.stdout), '');
    assert.equal(spyLines(spy).length, 1);
});
test('C-18 a hand-set ALLOC_PER_OP_CHILD=1 never skips a check: a bad --n is still refused (1 spy line)', () => {
    const { r, spy } = run(['--n', '99999', A], { env: { ALLOC_PER_OP_CHILD: '1' } });
    refusal(r, spy, /--n must be/);
});

// ================= TASK 3 re-spawn plumbing (T1): the child acts at preload via APO_SPY_CHILD, before the tool loads =================
// BENCH is the f64 fixture through a symlink in the row dir: the child must receive the realpath (TASK 3).
function respawnRow(act) {
    const dir = mkdir();
    const link = join(dir, 'bench-link.mjs');
    symlinkSync(A, link);
    const out = run(['--n', '100000', '--windows', '3', '--warm', '0', link], { dir, env: { APO_SPY_CHILD: act } });
    return out;
}
test('TASK 3 re-spawn: child sees execArgv (spy import + --expose-gc, no forced --no-concurrent-recompilation), ppid, child "1", the BENCH realpath (APO_SPY_CHILD=0; kills: execArgv dropped, BENCH not resolved)', () => {
    const { r, spy } = respawnRow('0');
    assert.equal(r.status, 0, why(r));
    const L = spyLines(spy);
    assert.equal(L.length, 2, 'parent + exactly one re-spawned child');
    assert.equal(L[1].child, '1');
    assert.equal(L[1].ppid, L[0].pid);
    assert.ok(L[1].execArgv.includes(SPY_URL), `execArgv ${JSON.stringify(L[1].execArgv)} keeps --import <spy>`);
    assert.ok(L[1].execArgv.includes('--expose-gc'));
    assert.ok(!L[1].execArgv.includes('--no-concurrent-recompilation'));
    assert.equal(L[1].argv[L[1].argv.length - 1], realpathSync(A), 'the child gets the absolute realpath of BENCH');
});
test('TASK 3 re-spawn: a child ended by SIGKILL -> exit 2, /child ended by SIGKILL/, stdout "", 2 spy lines (kills: status null passed through)', () => {
    const { r, spy } = respawnRow('SIGKILL');
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /child ended by SIGKILL/);
    assert.equal(String(r.stdout), '');
    assert.equal(spyLines(spy).length, 2);
});
test('TASK 3 re-spawn: a child exit status 7 (outside {0,1,2}) -> exit 2, /child exited with status 7/, stdout "", 2 spy lines (kills: mapping disabled)', () => {
    const { r, spy } = respawnRow('7');
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /child exited with status 7/);
    assert.equal(String(r.stdout), '');
    assert.equal(spyLines(spy).length, 2);
});

// ================= A4 preflight API (before the spawn) =================
for (const api of ['GCProfiler', 'getHeapSpaceStatistics']) {
    test(`A4 APO_SPY_DROP=${api}: exit 2, stderr names v8.${api}, no /v\\d+\\.\\d+/ (#128), stdout '', 1 spy line (kills: check after the re-spawn -> 2 lines)`, () => {
        const { r, spy } = run(['--n', '100000', '--windows', '3', '--warm', '0', A], { env: { APO_SPY_DROP: api } });
        assert.equal(r.status, 2, why(r));
        assert.match(String(r.stderr), new RegExp(`NO VERDICT: v8\\.${api} is missing`), `stderr names v8.${api}\n${why(r)}`);
        assert.doesNotMatch(String(r.stderr), /v\d+\.\d+/, 'a refusal never prints a version string');
        assert.equal(String(r.stdout), '');
        assert.equal(spyLines(spy).length, 1);
    });
}

// ================= A5 JSON =================
const KEYS17 = ['arch', 'band', 'benches', 'floor', 'gate', 'isolate', 'n', 'node', 'platform', 'pointer_compression', 'scope', 'signal', 'span', 'sub', 'v8', 'warm', 'windows'];
const A5_ARGS = ['--json', '--n', '1000000', '--windows', '3', '--warm', '200000', '--lane', 'f64', '--lane', 'box', '--max', '4', fx('mixed')];
test('A5 --json gate run: exit 1, the 17 sorted keys (gate, no ab), signal / sub / span / band, rows f64 + box (kills: old shape, `|| null`, steady / net)', () => {
    const { r } = measured(A5_ARGS);
    assert.equal(r.status, 1, why(r));
    const j = lastJson(r);
    assert.deepEqual(Object.keys(j).sort(), KEYS17);
    assert.equal(j.signal, 'space-used-paired');
    assert.ok(typeof j.floor === 'number' && Math.abs(j.floor) < 1, 'floor = the empty lane peak, not the box (C-12)');
    assert.equal(j.sub, 10000);
    assert.equal(j.span, 2000000);   // (K - 1) x N = 2 x 1e6
    assert.deepEqual(j.band, { lo: 0.0032, hiFixed: 0.524288, hiRel: 0.001 });   // bandOf(1e6, 1e4): 32/1e4, 524288/1e6
    assert.equal(j.gate.max, 4);
    assert.equal(j.gate.verdict, 'FAIL');
    assert.equal(j.benches.length, 1);
    const rows = j.benches[0].rows;
    assert.deepEqual(rows.map((x) => x.lane), ['f64', 'box']);
    for (const x of rows) {
        assert.equal(x.windows.length, 3);
        for (const w of x.windows) assert.ok(w === null || typeof w === 'number', `window ${w}`);
        assert.ok(Number.isInteger(x.voids) && x.voids >= 0);
        assert.ok(Number.isInteger(x.retries) && x.retries >= 0);
        assert.ok(!('steady' in x) && !('net' in x), 'no steady / net');
    }
});
test('A5 buildInfo: {} -> null, {v8_enable_pointer_compression: 0} -> 0 (kills `|| null`, `?? 0`), 1 -> 1, a non-object -> null (C-19)', () => {
    const buildInfo = need('buildInfo');
    assert.equal(buildInfo({}), null);
    assert.equal(buildInfo({ v8_enable_pointer_compression: 0 }), 0);
    assert.equal(buildInfo({ v8_enable_pointer_compression: 1 }), 1);
    assert.equal(buildInfo(null), null);
    assert.equal(buildInfo('x'), null);
});

// ================= A6 text report, verdicts, VOID =================
test('A6 text gate run: exit 1, "gate --max 4 (peak B/op): FAIL" and span 2000000 (kills: "(steady B/op)")', () => {
    const { r } = measured(A5_ARGS.filter((x) => x !== '--json'));
    assert.equal(r.status, 1, why(r));
    assert.ok(String(r.stdout).includes('gate --max 4 (peak B/op): FAIL'), why(r));
    assert.ok(String(r.stdout).includes('2000000'), 'span printed');
});
test('A6 f64 at --max 1 (n 1e6): exit 0 and PASS', () => {
    const { r } = measured(['--n', '1000000', '--windows', '3', '--warm', '200000', '--max', '1', '--lane', 'f64', fx('mixed')]);
    assert.equal(r.status, 0, why(r));
    assert.match(String(r.stdout), /gate --max 1 \(peak B\/op\): PASS/);
});
test('A6 gc() on every 1000th call (--n 100000 --sub 1000 --warm 0 --json): exit 2, voids >= 1, a null window (kills: VOID ignored)', () => {
    const { r } = measured(['--n', '100000', '--sub', '1000', '--warm', '0', '--json', fx('gc')]);
    assert.equal(r.status, 2, why(r));
    const j = lastJson(r);
    const row = j.benches[0].rows.find((x) => x.lane === 'gcl');
    assert.ok(row, 'row gcl present');
    assert.ok(row.voids >= 1, `voids ${row.voids}`);
    assert.ok(row.windows.includes(null), 'a VOID window is null, never 0');
});
test('C-23 one FAIL lane (box) + one VOID lane (gcl) at --max 4 -> exit 2 (kills: "FAIL wins" -> 1)', () => {
    const { r } = measured(['--n', '1000000', '--windows', '3', '--warm', '200000', '--max', '4', '--lane', 'box', '--lane', 'gcl', fx('boxgc')]);
    assert.equal(r.status, 2, why(r));
    // the report is still printed (C-14): a placeholder exit 2 with no report is not this row
    assert.ok(String(r.stdout).includes('box') && String(r.stdout).includes('gcl'), `report lists both lanes\n${why(r)}`);
});

// ================= A7 A/B =================
const AB = [fx('ab-a'), fx('ab-b')];
test('A7 A/B --tol 2 --lane a1: exit 1, ab.lanes = [{a1, ONLY-A}] (kills: d4386d85 pick)', () => {
    const { r } = measured(['--json', '--tol', '2', '--lane', 'a1', ...AB]);
    assert.equal(r.status, 1, why(r));
    const j = lastJson(r);
    assert.deepEqual(j.ab.lanes.map((l) => [l.lane, l.verdict]), [['a1', 'ONLY-A']]);
});
test('A7 A/B --tol 2 --lane b1: exit 1, ab.lanes = [{b1, ONLY-B}] (kills: --lane picks from A only)', () => {
    const { r } = measured(['--json', '--tol', '2', '--lane', 'b1', ...AB]);
    assert.equal(r.status, 1, why(r));
    const j = lastJson(r);
    assert.deepEqual(j.ab.lanes.map((l) => [l.lane, l.verdict]), [['b1', 'ONLY-B']]);
});
test('A7 A/B --lane zz (in neither bench): exit 2 naming zz', () => {
    const { r } = measured(['--tol', '2', '--lane', 'zz', ...AB]);
    assert.equal(r.status, 2, why(r));
    assert.ok(String(r.stderr).includes('zz'), why(r));
});
test('A7 A/B order is A then B per lane, in union order: ORDER A:x,B:x,A:y,B:y (kills: all-of-A-first)', () => {
    const { r } = measured(['--tol', '2', '--lane', 'x', '--lane', 'y', ...AB]);
    assert.ok(r.status === 0 || r.status === 1, why(r));
    const m = /^ORDER (.*)$/m.exec(String(r.stderr));
    assert.ok(m, `no ORDER line on stderr\n${why(r)}`);
    assert.equal(m[1], 'A:x,B:x,A:y,B:y');
});

// ================= A8 / C-19 error paths =================
const THROWS = [
    ['async throw', 'asyncthrow', 'asyncthrow'],
    ['thenable reject', 'thenable', 'thenablerej'],
    ['sync throw', 'syncthrow', 'syncthrow'],
    ['mid-window throw (C-19; exit 2, not 1)', 'midthrow', 'midthrow'],
];
for (const [title, file, lane] of THROWS) {
    test(`A8 ${title}: exit 2, stderr names the lane ${lane}, no "uncaught" (kills: d4386d85 AUD-1)`, () => {
        const { r } = measured(['--n', '100000', '--windows', '3', '--warm', '0', fx(file)]);
        assert.equal(r.status, 2, why(r));
        assert.ok(String(r.stderr).includes(lane), `stderr names ${lane}\n${why(r)}`);
        assert.doesNotMatch(String(r.stderr), /uncaught/i);
    });
}
test('A8 a bench with no `lanes`: exit 2, stderr names the path, no "uncaught"', () => {
    const { r } = measured(['--n', '100000', '--windows', '3', '--warm', '0', fx('nolanes')]);
    assert.equal(r.status, 2, why(r));
    assert.ok(String(r.stderr).includes('nolanes.mjs'), why(r));
    assert.doesNotMatch(String(r.stderr), /uncaught/i);
});
test('A8 a SIGKILL lane: exit 2, stderr /child ended by SIGKILL/, stdout "" (kills: `return r.status` with no null check -> exit 0)', () => {
    const { r } = measured(['--n', '100000', '--windows', '3', '--warm', '0', fx('sigkill')]);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /child ended by SIGKILL/);
    assert.equal(String(r.stdout), '');
});

// ================= N4 (review r1) / B2 TASK 7: process.exit(0) before the run settled is never a pass =================
for (const [title, file] of [['a lane that calls process.exit(0)', 'exit0'], ['a setup() that calls process.exit(0)', 'setupexit0']]) {
    test(`N4 ${title}: exit 2 (not 0), stderr /exited before the run settled/, no PASS line (kills: a child exit 0 passed through)`, () => {
        const { r } = measured(['--n', '100000', '--windows', '3', '--warm', '0', '--max', '4', fx(file)]);
        assert.equal(r.status, 2, why(r));
        assert.match(String(r.stderr), /exited before the run settled/, why(r));
        assert.doesNotMatch(String(r.stdout), /PASS/, 'no PASS line');
    });
}

test('B2 R2 exit guard: a beforeExit hook that calls process.exit(0) after the report replaces the run exit 1 -> exit 2 (not 0, not 1), stderr /replaced the run\'s exit 1 after the run settled/ (kills: the exit guard disabled)', () => {
    const { r } = measured(['--n', '100000', '--windows', '3', '--warm', '0', '--max', '4', fx('lateexit')]);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /replaced the run's exit 1 after the run settled/, why(r));
});

// ================= C-15 selfCheck miss / fence (after) =================
const CELL = ['--n', '100000', '--windows', '3', '--warm', '0', '--max', '4'];
test('C-15 selfCheck miss, --json: exit 2, "NO VERDICT: selfCheck: positive" on stderr, the lane never ran, the 17 keys, rows [], gate {4, NO VERDICT, []} (kills: miss ignored, extra JSON key)', () => {
    const { r } = measured(['--json', ...CELL, fx('scmiss')]);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /NO VERDICT: selfCheck: positive/, why(r));
    assert.doesNotMatch(String(r.stderr), /LANE-RAN/, 'no user lane is measured on an unverified harness');
    const j = lastJson(r);
    assert.deepEqual(Object.keys(j).sort(), KEYS17);
    assert.deepEqual(j.benches[0].rows, []);
    assert.deepEqual(j.gate, { max: 4, verdict: 'NO VERDICT', lanes: [] });
});
test('C-15 selfCheck miss, text: exit 2, stdout has "NO VERDICT: selfCheck: positive", no gate line (kills: verdict line printed on a miss)', () => {
    const { r } = measured([...CELL, fx('scmiss')]);
    assert.equal(r.status, 2, why(r));
    assert.ok(String(r.stdout).includes('NO VERDICT: selfCheck: positive'), why(r));
    assert.doesNotMatch(String(r.stdout), /^gate --max/m);
});
test('C-14 fence (after) miss: exit 2, stderr /NO VERDICT: fence \\(after\\): recorded 0 < forced 1/, one row, gate NO VERDICT (kills: fence result ignored)', () => {
    const { r } = measured(['--json', ...CELL, fx('fenceafter')]);
    assert.equal(r.status, 2, why(r));
    assert.match(String(r.stderr), /NO VERDICT: fence \(after\): recorded 0 < forced 1/, why(r));
    const j = lastJson(r);
    assert.equal(j.benches[0].rows.length, 1);
    assert.equal(j.gate.verdict, 'NO VERDICT');
});

// ================= A9 --self-test --json (C-20, C-22) =================
test('A9 --self-test --json: exit 0; selfCheck.ok and rows.length === SELF_TEST_LANES.length FIRST, then rows[refusal] NO VERDICT (kills: `rows: []`, exact compare Q-AP-BAND (b))', () => {
    const { r } = measured(['--self-test', '--json']);
    assert.equal(r.status, 0, why(r));
    const j = lastJson(r);
    const lanes = mod().SELF_TEST_LANES;
    assert.ok(Array.isArray(lanes) && lanes.length >= 5, 'SELF_TEST_LANES exported by TOOL');
    assert.equal(j.selfCheck && j.selfCheck.ok, true, `selfCheck ${JSON.stringify(j.selfCheck)}`);
    assert.equal(j.rows.length, lanes.length, 'every self-test lane has a row (a miss gives rows: [])');
    const row = j.rows.find((x) => x.name === 'refusal');
    assert.ok(row, 'a refusal row exists');
    assert.equal(row.verdict, 'NO VERDICT');
    for (const x of j.rows) assert.equal(x.ok, true, `row ${x.name} ${x.verdict}`);
});

// b87 H1e (Unit 2 review N3, C-20): the selfCheck-miss half of --self-test. APO_SPY_SCMISS=1 zeroes space_used_size in the child
// only, so selfCheck's positive control misses; the row must carry selfCheck's OWN text ("positive: ...", not a preflight / gc refusal; #132).
// M15 (a --self-test ROW miss -> exit 0) stays UNSEAMED: no src hook to force a row miss (recorded b86 r1 N3 / b87).
test('b87 A9 --self-test --json selfCheck miss (APO_SPY_SCMISS=1): exit 2; last stdout line exactly {selfCheck:{ok:false,reason:"positive: ..."},rows:[]}; reason also on stderr; child ran (2 spy lines) (kills: miss -> run the lanes anyway, miss -> exit 0/1, extra key)', () => {
    const { r, spy } = measured(['--self-test', '--json'], { env: { APO_SPY_SCMISS: '1' } });
    assert.equal(r.status, 2, why(r));
    const j = lastJson(r);
    assert.deepEqual(Object.keys(j).sort(), ['rows', 'selfCheck']);
    assert.deepEqual(Object.keys(j.selfCheck).sort(), ['ok', 'reason']);
    assert.equal(j.selfCheck.ok, false, why(r));
    assert.equal(typeof j.selfCheck.reason, 'string');
    assert.match(j.selfCheck.reason, /^positive: /, 'selfCheck own miss text, not a preflight / gc refusal: ' + j.selfCheck.reason);
    assert.deepEqual(j.rows, []);
    assert.ok(String(r.stderr).includes('NO VERDICT: selfCheck: ' + j.selfCheck.reason), why(r));
    assert.doesNotMatch(String(r.stderr), /gc\(\) still missing|is missing on this node/, 'not a preflight refusal');
    assert.equal(spyLines(spy).length, 2, 'the re-spawned child ran (it reached selfCheck)');
});
test('b87 A9 knob-off control: the same --self-test --json without the knob -> exit 0, selfCheck.ok true, rows non-empty (the miss row above is the knob, not the harness)', () => {
    const { r } = measured(['--self-test', '--json']);
    assert.equal(r.status, 0, why(r));
    const j = lastJson(r);
    assert.equal(j.selfCheck.ok, true, why(r));
    assert.ok(j.rows.length >= 5);
});
test('b87 spy knob APO_SPY_SCMISS=2 is refused by the spy (exit 3), never ignored', () => {
    const { r } = run(['--self-test', '--json'], { env: { APO_SPY_SCMISS: '2' } });
    assert.equal(r.status, 3, why(r));
    assert.match(String(r.stderr), /APO_SPY_SCMISS must be 1/);
});
