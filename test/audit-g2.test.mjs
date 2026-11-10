// test/audit-g2.test.mjs -- b61 unit G2, helper H1: the deopt-diff.sh rows of .handoff/PLAN-b61-g2.md ASSERTIONS A1-A11
// (+ ADDENDUM A1 items 1-3, ADDENDUM A2 items 3-5) and the rulings Q-B61-DD-TRAP / Q-B61-DD-GLUE (.handoff/RULINGS-b61-g2.md).
// Oracle: the PLAN text (refusal texts, X reasons, NO-VERDICT line shapes) and the audit reproductions, never what a root
// printed. Tool under test: the repo-root deopt-diff.sh, or the file named by DD_G2_ROOT (an absolute path; e.g. the frozen
// build .handoff/frozen/b59-g0/deopt-diff.sh, sha256/8 050e01e1). Every behaviour row must FAIL on that frozen build.
//   A1  driver output goes to a per-run regular file: 6 "file" / 0 "pipe" lines (with and without --out), 8 spawns; relative
//       TMPDIR; TMPDIR = a regular file -> "mktemp exited N", 2 spawns
//   A2  retention: 9 invocations x 6 mktemp calls, template $TMPDIR/deopt-diff.XXXXXX, 0 files left; mutant no run_side rm
//   A3  SIGTERM during the 3rd driver run: TMPDIR empty (MUTANT-CONTROLLED: the before build never makes the file, so the
//       row alone is green there; the mutant "no trap rm" leaves exactly 1 file); exactly one VERDICT NO-VERDICT and one
//       "unexpected error (exit N)" line: bash 3.2 says "(exit 143)" (the before build says "(exit 0)"); bash >= 4 says
//       "(exit 0)" and re-raises SIGTERM, so there the row asserts any N + the SIGTERM end (Q-B65-SIGTERM). bash 3.2 also
//       ends by SIGTERM here (measured, b65), so the signal check does not separate the bashes; the bash-3 branch keeps
//       today's assertions. Mutant: drop $old from the RUN_TMP trap line -> no "unexpected error (exit N)" line on any bash
//   A4  torn bailout head (T2.2): NO-VERDICT 'bailout: torn trace line'; controls (other fn, anonymous, '[bailout end.') SAME
//       (the controls are a regression pin); mutant: drop the '[bailout (kind: ' guard
//   A5  kConcurrent compile line (T2.3): NO-VERDICT; kSynchronous + [marking kConcurrent SAME; --v8-flags name refusal,
//       0 spawns; mutant: the whole condition widened (the guard-only and index-only mutants are verdict-equivalent and dropped)
//   A6  --node path with '=': exit 2, 0 spawns
//   A7  full TMPDIR (ulimit -f 32, XFSZ ignored): 'append exited N'; driver rc 3 -> append; tr shim -> 'tr exited 6';
//       mutants drop-append, drop guard, append before the precedence line
//   A8  real node, b57-rpipe drivers (inlined constants): never exit 0 / SAME, 3 attempts
//   A9  --help sentences (closes fd 1, nearest package.json above DIR, ...); the old 'Without --out nothing is written' is gone
//   A10 --self-test (>= 107 ok) and --self-test --fixtures (>= 124 ok), no FAIL line (the sha256 parity of the other roots
//       and the golden reports are the coder's TASK 0 / B1 gate, not this file)
//   A11 glued torn bailout head after driver text (Q-B61-DD-GLUE): NO-VERDICT 'bailout: torn trace line'; controls (glued
//       whole bailout of other -> SAME, of add -> 'trace text not at line start') are a regression pin; mutant: drop the rule
//   A12 greedy torn head (bare and glued) and A13 torn head glued after "[bailout end." (ADDENDUM A2 item 5): NO-VERDICT
//       'bailout: torn trace line'; mutants revert each half of the A2 item 1 fix
// Fixtures: private dirs under one mkdtemp top (removed in after()); no git fixtures. Every child is capSync'd: a timed-out
// child is a named failure before any other check. No timing assertions, no timed gate. Results: bash 3.2 macOS host (the A3 bash >= 4 branch runs on CI only).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn as spawnAsync } from 'node:child_process';
import { capSync, armCap, noTimeout } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync: yield once BEFORE each test so the previous report flushes (b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const TOOL = process.env.DD_G2_ROOT || join(PKG, 'deopt-diff.sh');
const FIXDIR = join(PKG, 'test', 'fixtures', 'deopt-diff', 'node-26.8.2');
// the b57-rpipe drivers, inlined byte-exactly (audit/ is gitignored, so a copy from there dies on CI; review r1 blocker 1).
// a/d.mjs deopts add with add('x','y'); b/d.mjs differs only at line 17 (add(7,8)).
const RPIPE_A = [
    "import { Worker, isMainThread, workerData } from 'node:worker_threads';",
    "import { writeSync } from 'node:fs';",
    "if (!isMainThread) {",
    "  const flag = new Int32Array(workerData);",
    "  const buf = Buffer.alloc(4096, 10);",
    "  while (Atomics.load(flag, 0) === 0) { try { writeSync(1, buf); } catch (e) { if (e.code !== 'EAGAIN') throw e; } }",
    "} else {",
    "  function add(a, b) { return a + b; }",
    "  %PrepareFunctionForOptimization(add); add(1, 2); add(3, 4);",
    "  %OptimizeFunctionOnNextCall(add); add(5, 6);",
    "  process.stdout.write('');",
    "  const sab = new SharedArrayBuffer(4); const flag = new Int32Array(sab);",
    "  const w = new Worker(new URL(import.meta.url), { workerData: sab });",
    "  await new Promise((r) => w.once('online', r));",
    "  const fill = Buffer.alloc(4096, 10);",
    "  for (let i = 0; i < 1024; i++) { try { writeSync(1, fill); } catch (e) { if (e.code !== 'EAGAIN') throw e; break; } }",
    "  add('x','y');",
    "  Atomics.store(flag, 0, 1);",
    "  await new Promise((r) => w.once('exit', r));",
    "}",
    "",
].join("\n");
const RPIPE_B = RPIPE_A.replace("  add('x','y');\n", '  add(7,8);\n');
const NODE_REAL = process.execPath;

// child env: no inherited steering of git / node / editors; V8 coverage undefined (a delete is not a strip)
function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'POSIXLY_CORRECT', 'SHELLOPTS', 'CDPATH']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
// one deopt-diff --self-test spawn (b68 CI-CAP, LEDGER #115; was 170000): deopt-diff.test.mjs SELF_CAP; >= 3x 103.3 s, the
// slowest CI dd self-test spawn (macOS node 22, run 42885917245; this file's A10 --fixtures row: 99.3 s)
const DD_SELF_CAP = 360000;
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-g2-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

const rd = (p) => readFileSync(p, 'utf8');
const wl = (p) => (existsSync(p) ? rd(p).split('\n').filter((l) => l !== '') : []);
const squash = (s) => s.replace(/\s+/g, ' ');
const all = (r) => r.stdout + r.stderr;
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const hasLine = (s, l) => s.split('\n').includes(l);
const ls = (d) => readdirSync(d);

// ---- trace texts (hand-written from the PLAN; the E / D shapes are real node 26 lines) ----
const E = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const TAILD = ', 0x140083075c49 <Code TURBOFAN_JS>, opt id 2, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f64]';
const D = `[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>${TAILD}`;
const DOTHER = D.replace('<JSFunction add ', '<JSFunction other ');
const DANON = `[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x1 <JSFunction (sfi = 0x1)>${TAILD}`;
const HEAD = '[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing w';
const TAILJ = `<JSFunction add (sfi = 0xf7e008dc999)>${TAILD}`;
const MARK = '[marking 0x1b92d2fb5b79 <JSFunction add (sfi = 0x24fc8dde7821)> for optimization to MAGLEV, ConcurrencyMode::kConcurrent, reason: hot and stable]';
const COMP = (m, f = 'add') => `[compiling method 0x1b92d2fb5b79 <JSFunction ${f} (sfi = 0x24fc8dde7821)> (target MAGLEV), mode: ConcurrencyMode::${m}]`;
const DONE = '[completed compiling 0x1b92d2fb5b79 <JSFunction add (sfi = 0x24fc8dde7821)> (target MAGLEV) - took 0.000, 0.036, 0.001 ms]';
const T = (...l) => `${l.join('\n')}\n`;
const MONO = T(E), DEOP = T(E, D);
const R_TORN = "  add: NO-VERDICT -- before: unparseable trace line naming 'add' in run 1: bailout: torn trace line";
const R_BG = 'background compile (--no-concurrent-recompilation overridden by a V8 flag implication)';

// ---------------------------------------------------------------------------------------------------------------------
// The fake node: one file per case dir. Logs argv per call (argv.log) and `[ -p /dev/stdout ]` per driver run (pipe.log), each
// driver run to runs.log; --version -> v26.8.2, --v8-options -> a small canned list. A driver run cats ./trace.txt from its
// cwd, then exits with ./rc (else 0). FAKE_SLEEP_AT=n: the n-th driver run (counted over both sides) writes $D/third and
// sleeps 30 s.
// ---------------------------------------------------------------------------------------------------------------------
function fakeText(D_) {
    const q = JSON.stringify(D_);
    return [
        '#!/bin/sh',
        `D=${q}`,
        'echo "$*" >> "$D/argv.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        "  --v8-options) printf '%s\\n' '  --allow-natives-syntax (allow natives syntax)' '        type: bool  default: --no-allow-natives-syntax' '  --lazy-feedback-allocation (Allocate feedback vectors lazily)' '        type: bool  default: --lazy-feedback-allocation'; exit 0 ;;",
        'esac',
        'if [ -p /dev/stdout ]; then echo pipe >> "$D/pipe.log"; else echo file >> "$D/pipe.log"; fi',
        'echo run >> "$D/runs.log"',
        'n=$(wc -l < "$D/runs.log" | tr -d " ")',
        'if [ -n "${FAKE_SLEEP_AT:-}" ] && [ "$n" -eq "$FAKE_SLEEP_AT" ]; then : > "$D/third"; sleep 30; fi',
        'if [ -f ./trace.txt ]; then cat ./trace.txt; fi',
        'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi',
        'exit 0',
        '',
    ].join('\n');
}
const REAL = (c) => spawn(BASH, ['-c', `command -v ${c}`], {}, `command -v ${c}`, 10000).stdout.trim();
const REAL_MKTEMP = REAL('mktemp'), REAL_TR = REAL('tr');

// one case: fake node, a PATH shim dir (a logging mktemp; optionally a tr that fails on the NUL map), private TMPDIR / cwd,
// two driver dirs b/ (before) and a/ (after)
function mkCase(opts = {}) {
    const dir = mk('c');
    const node = join(dir, 'node'), bin = join(dir, 'bin'), tmp = join(dir, 'tmp'), cwd = join(dir, 'cwd');
    for (const d of [bin, tmp, cwd, join(dir, 'b'), join(dir, 'a')]) mkdirSync(d);
    writeFileSync(node, fakeText(dir)); chmodSync(node, 0o755);
    const sh = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
    sh('mktemp', `printf '%s\\n' "$*" >> ${JSON.stringify(join(dir, 'mktemp.log'))}\nexec ${JSON.stringify(REAL_MKTEMP)} "$@"`);
    if (opts.trfail) sh('tr', `case "$1" in '\\000') cat >/dev/null; exit 6 ;; esac\nexec ${JSON.stringify(REAL_TR)} "$@"`);
    const c = { dir, node, bin, tmp, cwd, b: join(dir, 'b', 'driver.js'), a: join(dir, 'a', 'driver.js') };
    c.side = (s, text, rc) => {
        const d = join(dir, s);
        writeFileSync(join(d, 'driver.js'), '// driver\n'); writeFileSync(join(d, 'trace.txt'), text);
        if (rc === undefined) rmSync(join(d, 'rc'), { force: true }); else writeFileSync(join(d, 'rc'), `${rc}\n`);
    };
    c.side('b', MONO); c.side('a', MONO);
    c.argv = () => wl(join(dir, 'argv.log'));
    c.pipes = () => { const l = wl(join(dir, 'pipe.log')); return { pipe: l.filter((x) => x === 'pipe').length, file: l.filter((x) => x === 'file').length }; };
    c.mktemps = () => wl(join(dir, 'mktemp.log'));
    return c;
}
// the base argv: --node FAKE --fn add [extra] BEFORE AFTER
const base = (c, extra = []) => ['--node', c.node, '--fn', 'add', ...extra, c.b, c.a];
// run ROOT in case c. wrap = run under `ulimit -f 32` with XFSZ ignored (the limit applies to the tool only).
function run(root, c, args, o = {}) {
    const env = cleanEnv({ PATH: `${c.bin}:${process.env.PATH}`, TMPDIR: c.tmp, ...(o.env || {}) });
    const [cmd, argv] = o.wrap
        ? [BASH, ['-c', 'trap "" XFSZ; ulimit -f 32; exec "$BASH" "$0" "$@"', root, ...args]]
        : [BASH, [root, ...args]];
    return spawn(cmd, argv, { cwd: c.cwd, env }, `deopt-diff.sh (${args.slice(0, 4).join(' ')})`, o.cap || 90000);
}
const code = (r, want, what) => assert.equal(r.status, want, `${what}: exit\n${msg(r)}`);
const verdict = (r) => (/^VERDICT (\S+)$/m.exec(r.stdout) || [, 'NONE'])[1];

// ---- mutants: exact-once edits of a copy of ROOT (the PLAN / ADDENDUM strings are the anchors) ----
const ROOT_TEXT = rd(TOOL);
function mutant(name, edits) {
    let src = ROOT_TEXT;
    for (const [from, to] of edits) {
        const n = src.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor matched ${n} times (want exactly 1): ${from}`);
        src = src.replace(from, () => to);
    }
    const p = join(mk('mut'), `${name}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return p;
}
const A_RM = 'rm -f -- "$RUN_TMP" || true; RUN_TMP=""';
const A_TRAPRM = 'rm -f -- \\"\\$RUN_TMP\\"';
const A_APPEND = "{ printf '%65536s' '' >>\"$RUN_TMP\"; } 2>/dev/null || ar=$?";
const A_GUARD = "[[ $ar != 0 && $RUN_RC != *' '* ]]";
const A_APPLINE = `if ${A_GUARD}; then RUN_RC="append $ar"; fi`;
const A_PREC = 'if [[ $a != 0 ]]; then RUN_RC="awk $a";';
const A_BGUARD = 'substr($0, 1, 16) == "[bailout (kind: " &&';
// the real too-wide rule: the whole condition replaced (each half alone is verdict-equivalent: the [marking line has no "mode: ")
const A_CONC = 'substr($0, 1, 18) == "[compiling method " && index($0, ", mode: ConcurrencyMode::kConcurrent") > 0';
const A_WIDE = 'index($0, "ConcurrencyMode::kConcurrent") > 0';
const A_GLUE = 'index($0, "[bailout (kind: ")';

// ======================================================= A1 =======================================================
test('A1 driver output goes to a regular file per run: 6 file / 0 pipe, 8 spawns, with and without --out', { skip }, () => {
    for (const withOut of [false, true]) {
        const c = mkCase();
        const extra = withOut ? ['--out', join(c.dir, 'O')] : [];
        const r = run(TOOL, c, base(c, extra));
        code(r, 0, `withOut=${withOut}`); assert.equal(verdict(r), 'SAME', msg(r));
        assert.deepEqual(c.pipes(), { pipe: 0, file: 6 }, `withOut=${withOut} (a pipe is the old shape)`);
        assert.equal(c.argv().length, 8, `withOut=${withOut}: node spawns`);
    }
});

test('A1 relative TMPDIR: same verdict, the relative dir is empty afterwards', { skip }, () => {
    const c = mkCase();
    mkdirSync(join(c.cwd, 'rel'));
    const r = run(TOOL, c, base(c), { env: { TMPDIR: 'rel' } });
    code(r, 0, 'rel'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.deepEqual(c.pipes(), { pipe: 0, file: 6 });
    assert.deepEqual(ls(join(c.cwd, 'rel')), [], 'rel left files');
    assert.equal(c.mktemps().length, 6, 'the run files are made under rel (6 mktemp calls)');
});

test('A1 TMPDIR = a regular file: exit 2, "mktemp exited N", 2 spawns', { skip }, () => {
    const c = mkCase();
    const f = join(c.dir, 'tmpfile'); writeFileSync(f, 'x');
    const r = run(TOOL, c, base(c), { env: { TMPDIR: f } });
    code(r, 2, 'TMPDIR file');
    assert.match(r.stdout, /^  add: NO-VERDICT -- before: cannot read driver output in run 1 \(mktemp exited [1-9][0-9]*\)$/m, msg(r));
    assert.equal(c.argv().length, 2, 'node spawns (--version and --v8-options only)');
});

// ======================================================= A2 =======================================================
// 3 cycles x {SAME, DIFF, NO-VERDICT (driver exited 3)}: per invocation 6 mktemp calls, 8 spawns; afterwards 0 files left.
function cycle(root) {
    const c = mkCase();
    const tpl = `${c.tmp}/deopt-diff.XXXXXX`;
    const kinds = [['SAME', MONO, MONO, undefined, 0, 'SAME'], ['DIFF', MONO, DEOP, undefined, 1, 'DIFF'], ['NV', MONO, MONO, 3, 2, 'NO-VERDICT']];
    let calls = 0, spawns = 0;
    for (let i = 0; i < 3; i++) for (const [name, tb, ta, rc, want, vd] of kinds) {
        c.side('b', tb, rc); c.side('a', ta);
        const r = run(root, c, base(c));
        code(r, want, `cycle ${i} ${name}`); assert.equal(verdict(r), vd, msg(r));
        assert.equal(c.mktemps().length - calls, 6, `cycle ${i} ${name}: mktemp calls`); calls += 6;
        assert.equal(c.argv().length - spawns, 8, `cycle ${i} ${name}: node spawns`); spawns += 8;
    }
    return { c, tpl, calls };
}
test('A2 retention: 9 invocations -> 6 mktemp calls each (template $TMPDIR/deopt-diff.XXXXXX), 54 logged, 0 files left', { skip }, () => {
    const { c, tpl } = cycle(TOOL);
    const log = c.mktemps();
    assert.equal(log.length, 54);
    assert.ok(log.every((l) => l === tpl), `template: ${log.find((l) => l !== tpl)}`);
    assert.deepEqual(ls(c.tmp), [], 'TMPDIR left files');
    assert.deepEqual(ls(c.cwd), [], 'cwd left files');
});
test('A2 mutant (no run_side rm -f): the same cycle leaves 54 files in TMPDIR', { skip }, () => {
    const m = mutant('a2-norm', [[A_RM, 'RUN_TMP=""']]);
    const { c } = cycle(m);
    assert.equal(ls(c.tmp).length, 54);
});

// ======================================================= A3 =======================================================
// SIGTERM the tool's process group once the 3rd driver run has started; the EXIT trap must remove the live temp file.
async function sigtermRun(root) {
    const c = mkCase();
    const env = cleanEnv({ PATH: `${c.bin}:${process.env.PATH}`, TMPDIR: c.tmp, FAKE_SLEEP_AT: '3' });
    const child = spawnAsync(BASH, [root, ...base(c)], { cwd: c.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const h = armCap(child, 60000);
    let so = '', se = '';
    child.stdout.on('data', (d) => { so += d; }); child.stderr.on('data', (d) => { se += d; });
    const done = new Promise((res) => child.on('close', (status, signal) => res({ status, signal })));
    let r;
    try {
        const t0 = Date.now();
        while (!existsSync(join(c.dir, 'third')) && Date.now() - t0 < 30000) await new Promise((res) => setTimeout(res, 25));
        assert.ok(existsSync(join(c.dir, 'third')), `the 3rd driver run never started\n${so}${se}`);
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* group gone */ }
        r = await done;
        h.clear();
        noTimeout({ ...r, stdout: so, stderr: se, timedOut: h.timedOut, cap: h.cap }, 'deopt-diff.sh SIGTERM');
    } finally {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group gone */ }
    }
    return { c, ...r, stdout: so, stderr: se };
}
// the chained trap (A1 item 1 / review r1 blocker 3): the script's fail-closed EXIT trap (root :278) still runs after the
// RUN_TMP trap, so SIGTERM is reported on STDERR (the :278 printf goes >&2) as an unexpected error with exactly one
// VERDICT NO-VERDICT line. bash 3.2 runs that trap with $? = 143 (128 + 15): "(exit 143)". bash >= 4 runs it with $? = 0
// (SIGTERM lands while bash waits for the driver) and then re-raises SIGTERM, so the process ends by the signal (status
// null) and stderr says "(exit 0)" -- an open limit (Q-B65-SIGTERM, RULINGS-b65-ci.md; LEDGER #105 (b65)), the verdict
// stays fail-closed. bash 3.2 also ends by SIGTERM (status null) on this mac (measured, b65), so the signal check does not
// separate the bashes; the bash-3 branch keeps today's assertions ("(exit 143)"). The before build has no RUN_TMP trap and
// reports `(exit 0)` there (seen on bash 3.2).
const VNV = /^VERDICT NO-VERDICT$/gm;
const nVerdicts = (s) => (s.match(/^VERDICT \S+$/gm) || []).length;
const UNEXP_ANY = /^deopt-diff: unexpected error \(exit \d+\)$/m;
let BASH_MAJOR = null;   // the major of the BASH binary every row spawns, read once (fail closed on an unreadable answer)
function bashMajor() {
    if (BASH_MAJOR !== null) return BASH_MAJOR;
    const r = capSync(BASH, ['-c', 'echo "${BASH_VERSINFO[0]}"'], { encoding: 'utf8', env: cleanEnv() }, 10000, 'bash major');
    const n = Number(String(r.stdout).trim());
    assert.ok(r.status === 0 && Number.isInteger(n) && n >= 3, `cannot read the bash major of ${BASH}: rc=${r.status} stdout=${JSON.stringify(r.stdout)}`);
    return (BASH_MAJOR = n);
}
test('A3 SIGTERM during the 3rd driver run: TMPDIR has 0 entries, exactly one VERDICT NO-VERDICT; bash 3: stderr "unexpected error (exit 143)"; bash >= 4: "unexpected error (exit N)" + ended by SIGTERM (Q-B65-SIGTERM)', { skip }, async () => {
    const major = bashMajor();
    const r = await sigtermRun(TOOL);
    const m = `bash ${major} rc=${r.status} sig=${r.signal}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
    assert.deepEqual(ls(r.c.tmp), [], 'TMPDIR left files');
    if (major === 3) {
        assert.match(r.stderr, /^deopt-diff: unexpected error \(exit 143\)$/m, m);
    } else {
        assert.match(r.stderr, UNEXP_ANY, m);
        assert.equal(r.signal, 'SIGTERM', `bash >= 4 re-raises SIGTERM after the EXIT trap\n${m}`);
    }
    assert.equal((r.stderr.match(VNV) || []).length, 1, `stderr VERDICT NO-VERDICT lines\n${m}`);
    assert.equal(nVerdicts(r.stdout) + nVerdicts(r.stderr), 1, `VERDICT lines over both streams\n${m}`);
});
test('A3 mutant (no trap rm): SIGTERM during the 3rd run leaves exactly 1 file', { skip }, async () => {
    const m = mutant('a3-notraprm', [[A_TRAPRM, ': \\"\\$RUN_TMP\\"']]);
    const r = await sigtermRun(m);
    assert.equal(ls(r.c.tmp).length, 1);
});
// must-fail: drop `$old` from the main-shell trap line (the self-test trap has the same `(exit \$st_rc); $old" EXIT` tail,
// so the anchor includes the RUN_TMP rm unique to the main-shell line): no chain -> no unexpected-error line, no VERDICT.
// The check is ANY "(exit N)": "(exit 143)" alone is vacuous on bash >= 4, where the live line says "(exit 0)" (Q-B65-SIGTERM).
const A_TRAPOLD = '|| rm -f -- \\"\\$RUN_TMP\\"; set +e; (exit \\$st_rc); $old" EXIT';
test('A3 mutant (drop $old from the RUN_TMP trap): SIGTERM loses every "unexpected error (exit N)" line and the VERDICT line (any bash)', { skip }, async () => {
    const mp = mutant('a3-noold', [[A_TRAPOLD, '|| rm -f -- \\"\\$RUN_TMP\\"; set +e; (exit \\$st_rc)" EXIT']]);
    const r = await sigtermRun(mp);
    const m = `rc=${r.status} sig=${r.signal}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
    assert.doesNotMatch(r.stderr, UNEXP_ANY, m);
    assert.equal((r.stderr.match(VNV) || []).length, 0, m);
});

// ======================================================= A4 =======================================================
test('A4 torn bailout head (E + head / w / w / tail) vs mono: exit 2, "bailout: torn trace line"', { skip }, () => {
    const c = mkCase(); c.side('b', T(E, HEAD, 'w', 'w', TAILJ)); c.side('a', MONO);
    const r = run(TOOL, c, base(c));
    code(r, 2, 'A4'); assert.ok(hasLine(r.stdout, R_TORN), msg(r));
});
// regression pin: these three lines are whole / unrelated and stay SAME (old and new code)
test('A4 controls (regression pin): whole bailout of other, anonymous <JSFunction (sfi = 0x1)>, "[bailout end. w" -> SAME exit 0', { skip }, () => {
    for (const [name, line] of [['other', DOTHER], ['anon', DANON], ['end', '[bailout end. w']]) {
        const c = mkCase(); c.side('b', MONO); c.side('a', T(E, line));
        const r = run(TOOL, c, base(c));
        code(r, 0, `control ${name}`); assert.equal(verdict(r), 'SAME', `control ${name}\n${msg(r)}`);
    }
});
test('A4 mutant (drop the "[bailout (kind: " guard): "[bailout end. w" turns NO-VERDICT', { skip }, () => {
    const m = mutant('a4-noguard', [[A_BGUARD, '']]);
    const c = mkCase(); c.side('b', MONO); c.side('a', T(E, '[bailout end. w'));
    const r = run(m, c, base(c));
    code(r, 2, 'mutant'); assert.match(r.stdout, /torn trace line/, msg(r));
});

// ======================================================= A5 =======================================================
test('A5 R2 (kConcurrent compile line): exit 2, the background-compile reason', { skip }, () => {
    const c = mkCase(); const t = T(MARK, COMP('kConcurrent'), DONE); c.side('b', t); c.side('a', t);
    const r = run(TOOL, c, base(c));
    code(r, 2, 'R2'); assert.match(r.stdout, /^  add: NO-VERDICT -- before: .*background compile \(--no-concurrent-recompilation overridden by a V8 flag implication\)/m, msg(r));
    assert.ok(r.stdout.includes(R_BG), msg(r));
});
test('A5 a kConcurrent compile line naming other: add is still NO-VERDICT (every fn sees it)', { skip }, () => {
    const c = mkCase(); const t = T(E, COMP('kConcurrent', 'other')); c.side('b', t); c.side('a', t);
    const r = run(TOOL, c, base(c));
    code(r, 2, 'other'); assert.match(r.stdout, /^  add: NO-VERDICT -- /m, msg(r)); assert.ok(r.stdout.includes(R_BG), msg(r));
});
test('A5 R3 (kSynchronous compile + [marking .. kConcurrent): SAME exit 0', { skip }, () => {
    const c = mkCase(); const t = T(MARK, COMP('kSynchronous'), DONE); c.side('b', t); c.side('a', t);
    const r = run(TOOL, c, base(c));
    code(r, 0, 'R3'); assert.equal(verdict(r), 'SAME', msg(r));
});
test('A5 name refusal: --v8-flags --stress-concurrent-inlining / --stress_concurrent_inlining_attach_code / --no-stress-concurrent-inlining -> exit 2, 0 spawns', { skip }, () => {
    for (const f of ['--stress-concurrent-inlining', '--stress_concurrent_inlining_attach_code', '--no-stress-concurrent-inlining']) {
        const c = mkCase();
        const r = run(TOOL, c, base(c, ['--v8-flags', f]));
        code(r, 2, f);
        const esc = f.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&');
        assert.match(r.stderr, new RegExp(`^deopt-diff: --v8-flags must not set ${esc}:`, 'm'), `${f}\n${msg(r)}`);
        assert.equal(c.argv().length, 0, `${f}: node spawns`);
    }
});
test('A5 mutant (the whole condition widened to index($0, "ConcurrencyMode::kConcurrent") > 0): R3 turns NO-VERDICT', { skip }, () => {
    const m = mutant('a5-widen', [[A_CONC, A_WIDE]]);
    const c = mkCase(); const t = T(MARK, COMP('kSynchronous'), DONE); c.side('b', t); c.side('a', t);
    const r = run(m, c, base(c));
    code(r, 2, 'widened'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
});
test('A5 mutant (whole condition widened): the canned --self-test rows go red', { skip }, () => {
    const m = mutant('a5-widen-st', [[A_CONC, A_WIDE]]);
    const r = spawn(BASH, [m, '--self-test', '--fixtures', FIXDIR], { cwd: mk('st') }, 'mutant --self-test', DD_SELF_CAP);
    assert.notEqual(r.status, 0, 'the widened mutant must fail its own self-test');
    assert.match(r.stdout, /^FAIL /m);
});

// ======================================================= A6 =======================================================
test('A6 --node <d>/a=b/node: exit 2, "an = is not allowed in the resolved path", 0 spawns', { skip }, () => {
    const c = mkCase();
    const nd = join(c.dir, 'a=b'); mkdirSync(nd);
    const n = join(nd, 'node'); writeFileSync(n, fakeText(c.dir)); chmodSync(n, 0o755);
    const r = run(TOOL, c, ['--node', n, '--fn', 'add', c.b, c.a]);
    code(r, 2, 'a=b'); assert.ok(r.stderr.includes('node binary: an = is not allowed in the resolved path'), msg(r));
    assert.equal(c.argv().length, 0, 'node spawns');
});

// ======================================================= A7 =======================================================
// ulimit -f 32 (KiB) with XFSZ ignored: the fake trace (~1 KiB) fits, the 64 KiB append fails.
const W = { wrap: true };
test('A7 full TMPDIR (mono vs deop, --out): exit 2, "append exited N", no "driver exited", raw/before/run.1.txt = the fake trace', { skip }, () => {
    const c = mkCase(); c.side('b', MONO); c.side('a', DEOP);
    const O = join(c.dir, 'O');
    const r = run(TOOL, c, base(c, ['--out', O]), W);
    code(r, 2, 'A7');
    assert.match(r.stdout, /^  add: NO-VERDICT -- before: cannot read driver output in run 1 \(append exited [1-9][0-9]*\)$/m, msg(r));
    assert.ok(!/driver exited/.test(r.stdout), msg(r));
    assert.equal(rd(join(O, 'raw', 'before', 'run.1.txt')), MONO);
});
test('A7 driver rc 3 + full TMPDIR: "append exited N", not "driver exited 3"', { skip }, () => {
    const c = mkCase(); c.side('b', MONO, 3); c.side('a', MONO);
    const r = run(TOOL, c, base(c), W);
    code(r, 2, 'rc3'); assert.match(r.stdout, /\(append exited [1-9][0-9]*\)/, msg(r)); assert.ok(!/driver exited 3/.test(r.stdout), msg(r));
});
test('A7 a failing tr (exit 6) + full TMPDIR: "tr exited 6", not append', { skip }, () => {
    const c = mkCase({ trfail: true });
    const r = run(TOOL, c, base(c), W);
    code(r, 2, 'tr'); assert.match(r.stdout, /\(tr exited 6\)/, msg(r)); assert.ok(!/append exited/.test(r.stdout), msg(r));
});
test('A7 mutant (drop the append): the full-TMPDIR row is SAME exit 0', { skip }, () => {
    const m = mutant('a7-noappend', [[A_APPEND, ':']]);
    const c = mkCase(); c.side('b', MONO); c.side('a', DEOP);
    const r = run(m, c, base(c, ['--out', join(c.dir, 'O')]), W);
    // MONO vs DEOP would be DIFF (exit 1) with the append dropped; the contract of this row: it is NOT the append NO-VERDICT
    assert.ok(!/append exited/.test(r.stdout), msg(r)); assert.equal(r.status, 1, msg(r));
    const c2 = mkCase(); c2.side('b', MONO); c2.side('a', MONO);
    const r2 = run(m, c2, base(c2), W);
    code(r2, 0, 'mono vs mono'); assert.equal(verdict(r2), 'SAME', msg(r2));
});
test('A7 mutant (drop the "!= *\' \'*" guard): the tr row loses "tr exited 6"', { skip }, () => {
    const m = mutant('a7-noguard', [[A_GUARD, '[[ $ar != 0 ]]']]);
    const c = mkCase({ trfail: true });
    const r = run(m, c, base(c), W);
    assert.ok(!/\(tr exited 6\)/.test(r.stdout), `tr token survived the dropped guard\n${msg(r)}`);
});
test('A7 mutant (append statement before the precedence line): the rc-3 row says "driver exited 3"', { skip }, () => {
    const m = mutant('a7-early', [[A_APPLINE, ':'], [A_PREC, `${A_APPLINE}\n  ${A_PREC}`]]);
    const c = mkCase(); c.side('b', MONO, 3); c.side('a', MONO);
    const r = run(m, c, base(c), W);
    code(r, 2, 'early'); assert.match(r.stdout, /driver exited 3/, msg(r));
});

// ======================================================= A8 =======================================================
// real node, the b57-rpipe drivers (a worker floods fd 1 while the main thread deopts add): never the wrong verdict.
// Q-B62-A8: a real-node race row is a demonstration, never part of npm test (inside the full suite an attempt can pass its
// 150 s cap). Opt in with LITEUTILS_REAL_HOLD=1 and run this file alone; each G-unit stop gate records that run in evidence.
const A8_OPTIN = process.env.LITEUTILS_REAL_HOLD === '1' ? false : 'opt-in real-node race row (Q-B62-A8): set LITEUTILS_REAL_HOLD=1 and run test/audit-g2.test.mjs alone';
test('A8 real node, b57-rpipe drivers: 3 attempts, each exit 1 DIFF or exit 2 NO-VERDICT, never exit 0 / SAME', { skip: skip || A8_OPTIN }, () => {
    const d = mk('rpipe');
    assert.notEqual(RPIPE_B, RPIPE_A, 'the b driver must differ from a at line 17');
    for (const [s, t] of [['a', RPIPE_A], ['b', RPIPE_B]]) { mkdirSync(join(d, s)); writeFileSync(join(d, s, 'd.mjs'), t); }
    const tmp = join(d, 'tmp'); mkdirSync(tmp);
    for (let i = 1; i <= 3; i++) {
        const r = spawn(BASH, [TOOL, '--node', NODE_REAL, '--fn', 'add', '--v8-flags', '--allow-natives-syntax', join(d, 'a', 'd.mjs'), join(d, 'b', 'd.mjs')],
            { cwd: d, env: cleanEnv({ TMPDIR: tmp }) }, `deopt-diff.sh real node attempt ${i}`, 150000);
        const v = verdict(r);
        assert.ok((r.status === 1 && v === 'DIFF') || (r.status === 2 && v === 'NO-VERDICT'), `attempt ${i}: the wrong verdict (rc ${r.status} ${v})\n${msg(r)}`);
    }
    assert.deepEqual(ls(tmp), [], 'TMPDIR left files');
});

// ======================================================= A9 =======================================================
test('A9 --help: the new sentences are there, the old "Without --out nothing is written to disk" is gone', { skip }, () => {
    const r = spawn(BASH, [TOOL, '--help'], { cwd: mk('help') }, 'deopt-diff.sh --help', 30000);
    code(r, 2, '--help');
    const h = squash(r.stdout);   // whitespace-normalised: a sentence may wrap across -h lines
    for (const s of ['closes fd 1', 'nearest package.json above DIR', 'DIR/raw/<side>/run.1.txt', 'torn trace line', 'background compile',
        '*stress-concurrent-inlining*', 'an = is not allowed in the resolved path']) assert.ok(h.includes(s), `-h lacks: ${s}`);
    assert.ok(!h.includes('Without --out nothing is written to disk'), '-h keeps the stale sentence');
});

// ======================================================= A10 =======================================================
test('A10 --self-test: all checks ok (>= 107), no FAIL line', { skip }, () => {
    const r = spawn(BASH, [TOOL, '--self-test'], { cwd: mk('st') }, 'deopt-diff.sh --self-test', DD_SELF_CAP);
    code(r, 0, '--self-test'); assert.ok(!/^FAIL /m.test(r.stdout), msg(r));
    const m = /^self-test: (\d+) check\(s\) ok$/m.exec(r.stdout);
    assert.ok(m, msg(r)); assert.ok(Number(m[1]) >= 107, `only ${m[1]} checks (want >= 107)`);
});
test('A10 --self-test --fixtures: all checks ok (>= 124), no FAIL line', { skip }, () => {
    const r = spawn(BASH, [TOOL, '--self-test', '--fixtures', FIXDIR], { cwd: mk('st') }, 'deopt-diff.sh --self-test --fixtures', DD_SELF_CAP);
    code(r, 0, '--self-test --fixtures'); assert.ok(!/^FAIL /m.test(r.stdout), msg(r));
    const m = /^self-test: (\d+) check\(s\) ok$/m.exec(r.stdout);
    assert.ok(m, msg(r)); assert.ok(Number(m[1]) >= 124, `only ${m[1]} checks (want >= 124)`);
});

// ======================================================= A11 =======================================================
test('A11 glued torn bailout head after driver text (E + w[head / w / tail) vs mono: exit 2, "bailout: torn trace line"', { skip }, () => {
    const c = mkCase(); c.side('b', T(E, `w${HEAD}`, 'w', TAILJ)); c.side('a', MONO);
    const r = run(TOOL, c, base(c));
    code(r, 2, 'A11'); assert.ok(hasLine(r.stdout, R_TORN), msg(r));
});
// regression pin: a glued WHOLE bailout keeps today's path (other fn -> dropped, add -> trace text not at line start)
test('A11 controls (regression pin): glued whole bailout of other -> SAME; glued whole bailout of add -> "trace text not at line start"', { skip }, () => {
    const c = mkCase(); c.side('b', MONO); c.side('a', T(E, `driver text${DOTHER}`));
    const r = run(TOOL, c, base(c));
    code(r, 0, 'glued other'); assert.equal(verdict(r), 'SAME', msg(r));
    const c2 = mkCase(); c2.side('b', MONO); c2.side('a', T(E, `driver text${D}`));
    const r2 = run(TOOL, c2, base(c2));
    code(r2, 2, 'glued add'); assert.match(r2.stdout, /trace text not at line start/, msg(r2));
});
test('A11 mutant (drop the glue rule): the glued torn head is SAME exit 0', { skip }, () => {
    const m = mutant('a11-noglue', [[A_GLUE, 'index($0, "[bailout (kind: \\001")']]);
    const c = mkCase(); c.side('b', T(E, `w${HEAD}`, 'w', TAILJ)); c.side('a', MONO);
    const r = run(m, c, base(c));
    code(r, 0, 'mutant'); assert.equal(verdict(r), 'SAME', msg(r));
});

// ======================================================= A12 / A13 =======================================================
// ADDENDUM A2 item 5 (review r1 blocker 2): two torn forms the r1 rules missed (r1 head 114324af and the before build: exit 0
// SAME, the wrong verdict). Oracle: the reviewer's repro lines; each before = E(add) + the torn line + the add tail line.
// (a) greedy: a torn add head runs straight into a whole bailout of other, so `.*` lets the line pass the full-shape regex.
const OTHER_TAIL = '0x7 <JSFunction other (sfi = 0x8)>, 0x9 <Code TURBOFAN_JS>, opt id 3, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f64]';
const GREEDY = `[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing [bailout (kind: deopt-soft, reason: Insufficient type feedback for call): begin. deoptimizing ${OTHER_TAIL}`;
// (b) a torn head glued after a real node 26.8.2 `[bailout end.` prefix (the line ends in "deoptimizing ", trailing space)
const ENDGLUE = '[bailout end. code_invalidation: invalid[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing ';
const ADDTAIL = `0x1b92d2fb5b79 <JSFunction add (sfi = 0xf7e008dc999)>${TAILD}`;
// the two halves of the ADDENDUM A2 item 1 fix, and the r1 glue conjunct it removed
const A_T22HALF = ' || index(substr($0, 17), "[bailout (kind: ") > 0';
const A_GLUEHALF = ' || index(substr($0, p + 16), "[bailout (kind: ") > 0';
const A_GLUEHEAD = '(p = index($0, "[bailout (kind: ")) > 1 && (';
const tornRow = (root, line, pre = '') => { const c = mkCase(); c.side('b', T(E, `${pre}${line}`, ADDTAIL)); c.side('a', MONO); return run(root, c, base(c)); };
test('A12 greedy torn head (E + head-into-whole-other + add tail) vs mono: exit 2, "bailout: torn trace line"', { skip }, () => {
    const r = tornRow(TOOL, GREEDY);
    code(r, 2, 'A12'); assert.ok(hasLine(r.stdout, R_TORN), msg(r));
});
test('A12 mutant (drop the T2.2 second-head term): the greedy row is SAME exit 0', { skip }, () => {
    const m = mutant('a12-not22', [[A_T22HALF, '']]);
    const r = tornRow(m, GREEDY);
    code(r, 0, 'mutant'); assert.equal(verdict(r), 'SAME', msg(r));
});
test('A12 glued greedy (w + head-into-whole-other + add tail) vs mono: exit 2, "bailout: torn trace line"', { skip }, () => {
    const r = tornRow(TOOL, GREEDY, 'w');
    code(r, 2, 'A12 glued'); assert.ok(hasLine(r.stdout, R_TORN), msg(r));
});
test('A12 mutant (drop the glue rule second-head term): the glued greedy row is SAME exit 0', { skip }, () => {
    const m = mutant('a12-noglue2', [[A_GLUEHALF, '']]);
    const r = tornRow(m, GREEDY, 'w');
    code(r, 0, 'mutant'); assert.equal(verdict(r), 'SAME', msg(r));
});
test('A13 torn head glued after "[bailout end. code_invalidation: invalid" + add tail vs mono: exit 2, "bailout: torn trace line"', { skip }, () => {
    const r = tornRow(TOOL, ENDGLUE);
    code(r, 2, 'A13'); assert.ok(hasLine(r.stdout, R_TORN), msg(r));
});
test('A13 mutant (restore the r1 conjunct substr($0, 1, 8) != "[bailout"): the row is SAME exit 0', { skip }, () => {
    const m = mutant('a13-r1head', [[A_GLUEHEAD, `substr($0, 1, 8) != "[bailout" && ${A_GLUEHEAD}`]]);
    const r = tornRow(m, ENDGLUE);
    code(r, 0, 'mutant'); assert.equal(verdict(r), 'SAME', msg(r));
});
