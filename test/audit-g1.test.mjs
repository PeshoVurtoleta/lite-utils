// test/audit-g1.test.mjs -- b60 unit G1, batch B4: the bytecode-budget.sh rows of .handoff/PLAN-b60-g1.md ASSERTIONS A1-A5 + RISK.
// Oracle: the PLAN assertions and the audit reproductions (audit/2026-11-09-bytecode-budget/*/), never what a root printed.
// Tool under test: the repo-root bytecode-budget.sh, or the file named by BB_G1_ROOT (an absolute path; e.g. the frozen build
// .handoff/frozen/b59-g0/bytecode-budget.sh). Old code = `git show ff6108b:bytecode-budget.sh` (sha256/8 0bd4de54), pinned below;
// a missing commit SKIPS locally and FAILS under CI=true (histGate rule of audit-g0).
//   A1  driver output goes to a per-probe regular file: 0 pipe lines (fake logs `[ -p /dev/stdout ]`); relative TMPDIR; TMPDIR = a file;
//       real BB-opus-1 (3 of 3 OVER) + its old-code twin; mutant redirect-inside-cd
//   A2  --no-flush-bytecode after every --v8-flags token and before --print-bytecode (3 of 3 argv lines + the mode line); real
//       --stress-flush-code row; DIFF contract (one mid vs two copies); mutants M-len and token-before-flags
//   A3  one baseline spawn per run (filter '*'): fake name hit, real BB-opus-2 (diff + gate), five shim rows, spawn counts, raw/ files
//   A4  pre-spawn refusals (newline, case-equal fn with --out, '=' in the node path, a prerelease --node-version) and the -h sentences
//   Q-B65-NODEPRE: every row that passes process.version as --node-version skips on a prerelease node (not vX.Y.Z)
//   A6  full TMPDIR (ulimit -f, XFSZ ignored): the 64 KiB append fails -> NO-VERDICT (append exited N); mutant drop-append
//   A5  parity against ff6108b on the fake matrix; retention (20 runs: no TMPDIR leftovers, 60 mktemp, 120 spawns)
// Fixtures: private dirs under one mkdtemp top (removed in after()); no git fixtures at all (nothing here needs a repo).
// Every child is capSync'd: a timed-out child is a named failure before any other check. No timing assertions, no timed gate.
// Results: bash 3.2 macOS host only (CI legs are not claimed here).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, lstatSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync: yield once BEFORE each test so the previous report flushes (b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const EXCERPT = join(PKG, 'test', 'fixtures', 'bytecode-budget', 'node-26.8.2', 'v8-options-excerpt.txt');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const TOOL = process.env.BB_G1_ROOT || join(PKG, 'bytecode-budget.sh');
const OLD_SHA = 'ff6108b', OLD_SHA8 = '0bd4de54';
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const NODE_REAL = process.execPath;
// Q-B65-NODEPRE (RULINGS-b65-ci.md): a row that passes process.version as --node-version skips on a prerelease node
// (setup-node `latest` = v27.0.0-alpha.0.0.0 in nightly 42817727624); the tool keeps refusing it (pinned in A4 below).
const NODEPRE = /^v\d+\.\d+\.\d+$/.test(process.version) ? false
    : `Q-B65-NODEPRE: node ${process.version} is a prerelease; bytecode-budget refuses a --node-version that is not vX.Y.Z`;

// child env: no inherited steering of git / node / editors; no global git config; V8 coverage undefined (a delete is not a strip)
function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'GREP_OPTIONS', 'NODE_TEST_CONTEXT', 'OUTDIR', 'TMPDIR', 'POSIXLY_CORRECT', 'SHELLOPTS']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-g1-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

const lines = (s) => s.split('\n');
const hasLine = (s, l) => lines(s).includes(l);
const squash = (s) => s.replace(/\s+/g, ' ');
const rd = (p) => readFileSync(p, 'utf8');
const wl = (p) => (existsSync(p) ? rd(p).split('\n').filter((l) => l !== '') : []);

// ---------------------------------------------------------------------------------------------------------------------
// The fake node. One file per case dir; logs argv per call (argv.log), `[ -p /dev/stdout ]` per bytecode call (pipe.log).
//   --version -> v26.8.2; --v8-options -> the fixture excerpt + three flags in real node's format.
//   filter '*' (the baseline): header(s) for FAKE_BASE (default __base; FAKE_BASE_NONE=1 prints none), exit FAKE_BASERC (default 0);
//     it also arms the shims ($D/armed).
//   filter <fn>: N records (N = the count of lines `//copy` in the last argv file, default 1; fn `lazy` prints none), each
//     `Bytecode length: 7` (8 from the 2nd call of that fn when FAKE_RUN2DIFF=1); exit FAKE_RC (default 0).
// ---------------------------------------------------------------------------------------------------------------------
function fakeText(D) {
    const q = JSON.stringify(D);
    return [
        '#!/bin/sh',
        `D=${q}`,
        'echo "$*" >> "$D/argv.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(EXCERPT)}; printf '%s\\n' '  --expose-gc (expose gc extension)' '        type: bool  default: --no-expose-gc' '  --stress-flush-code (stress code flushing)' '        type: bool  default: --no-stress-flush-code' '  --flush-bytecode (flush of bytecode when it has not been executed recently)' '        type: bool  default: --flush-bytecode'; exit 0 ;;`,
        'esac',
        'fn=; last=',
        'for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="${a#--print-bytecode-filter=}" ;; esac; last=$a; done',
        'if [ -p /dev/stdout ]; then echo pipe >> "$D/pipe.log"; else echo file >> "$D/pipe.log"; fi',
        'if [ "$fn" = "*" ]; then',
        '  : > "$D/armed"',
        '  if [ -z "${FAKE_BASE_NONE:-}" ]; then for b in ${FAKE_BASE:-__base}; do printf "[generated bytecode for function: %s (0x1 <SharedFunctionInfo %s>)]\\nBytecode length: 1\\nParameter count 1\\n" "$b" "$b"; done; fi',
        '  if [ -n "${FAKE_BASE_PAD:-}" ]; then head -c "$FAKE_BASE_PAD" /dev/zero | tr "\\000" " "; echo; fi',
        '  exit "${FAKE_BASERC:-0}"',
        'fi',
        'n=$(cat "$D/cnt.$fn" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$D/cnt.$fn"',
        'len=7; if [ -n "${FAKE_RUN2DIFF:-}" ] && [ "$n" -ge 2 ]; then len=8; fi',
        'c=$(grep -c "^//copy" "$last" 2>/dev/null); case "$c" in ""|0) c=1 ;; esac',
        '[ "$fn" = lazy ] && c=0',
        'i=0; while [ "$i" -lt "$c" ]; do',
        '  printf "[generated bytecode for function: %s (0x1 <SharedFunctionInfo %s>)]\\nBytecode length: %s\\nParameter count 1\\n" "$fn" "$fn" "$len"',
        '  i=$((i+1)); done',
        'exit "${FAKE_RC:-0}"',
        '',
    ].join('\n');
}
const REAL = (c) => spawn(BASH, ['-c', `command -v ${c}`], {}, `command -v ${c}`, 10000).stdout.trim();
const REAL_MKTEMP = REAL('mktemp'), REAL_TR = REAL('tr'), REAL_AWK = REAL('awk');

// one case: a fake node, a PATH shim dir (a logging mktemp; optionally a once-failing tr / awk), a private TMPDIR and cwd
function mkCase(opts = {}) {
    const dir = mk('c');
    const node = join(dir, 'node'), bin = join(dir, 'bin'), tmp = join(dir, 'tmp'), cwd = join(dir, 'cwd');
    for (const d of [bin, tmp, cwd]) mkdirSync(d);
    writeFileSync(node, fakeText(dir)); chmodSync(node, 0o755);
    const sh = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
    // mktemp: log every call; SHIM_MKTEMP_FAIL_FIRST=1 fails the FIRST call only (the baseline's: nothing calls mktemp before it)
    sh('mktemp', `printf '%s\\n' "$*" >> ${JSON.stringify(join(dir, 'mktemp.log'))}\nif [ -n "\${SHIM_MKTEMP_FAIL_FIRST:-}" ] && [ ! -e ${JSON.stringify(join(dir, 'mk.done'))} ]; then : > ${JSON.stringify(join(dir, 'mk.done'))}; exit 1; fi\nexec ${JSON.stringify(REAL_MKTEMP)} "$@"`);
    // tr / awk: fail ONCE, on the first call after the fake armed itself (= the baseline's own tr / awk), else run the real tool
    for (const [name, real] of [['tr', REAL_TR], ['awk', REAL_AWK]]) {
        if (opts[name]) sh(name, `if [ -e ${JSON.stringify(join(dir, 'armed'))} ]; then rm -f ${JSON.stringify(join(dir, 'armed'))}; exit 1; fi\nexec ${JSON.stringify(real)} "$@"`);
    }
    // trnul: a tr that fails only for the probe/baseline `tr '\\000' '?'` call (first arg is the 4-char text \\000)
    if (opts.trnul) sh('tr', `case "$1" in '\\000') exit 1 ;; esac\nexec ${JSON.stringify(REAL_TR)} "$@"`);
    const c = { dir, node, bin, tmp, cwd, out: join(dir, 'O') };
    c.argv = () => wl(join(dir, 'argv.log'));
    c.probes = () => c.argv().filter((l) => l.includes('--print-bytecode'));
    c.baselines = () => c.argv().filter((l) => l.includes("--print-bytecode-filter=*"));
    c.pipes = () => { const l = wl(join(dir, 'pipe.log')); return { pipe: l.filter((x) => x === 'pipe').length, file: l.filter((x) => x === 'file').length }; };
    c.mktemps = () => wl(join(dir, 'mktemp.log')).length;
    c.reset = () => {
        for (const e of readdirSync(dir)) if (/^(argv\.log|pipe\.log|armed|mk\.done|mktemp\.log|cnt\..*)$/.test(e)) rmSync(join(dir, e), { force: true });
        for (const e of readdirSync(tmp)) rmSync(join(tmp, e), { recursive: true, force: true });
    };
    return c;
}
function drv(c, name, text = '//d\n') { const d = join(c.dir, name); mkdirSync(d, { recursive: true }); const p = join(d, 'driver.mjs'); writeFileSync(p, text); return p; }
const TOOLNAME = 'bytecode-budget.sh';
function run(root, c, args, env = {}, cap = 60000) {
    return spawn(BASH, [root, ...args], { cwd: c.cwd, env: cleanEnv({ PATH: `${c.bin}:${process.env.PATH}`, TMPDIR: c.tmp, ...env }) }, `${TOOLNAME} (${args.slice(0, 4).join(' ')})`, cap);
}
const all = (r) => r.stdout + r.stderr;
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const NV = ['--node-version', 'v26.8.2'];
const rep = (c, d, extra = []) => ['--node', c.node, '--runs', '2', ...extra, '--fn', 'mid', d];

// ---- old root (git history, read only) ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || histSkip(haveOld);
let OLD = null;
function oldRoot() {
    if (haveOld !== true) assert.fail(`${haveOld} (CI=true: a history row fails, never skips)`);
    if (OLD !== null) return OLD;
    const g = spawn('git', ['show', `${OLD_SHA}:bytecode-budget.sh`], { cwd: PKG, encoding: 'buffer' }, 'git show bytecode-budget.sh', 30000);
    assert.equal(g.status, 0, String(g.stderr));
    assert.equal(sha8(g.stdout), OLD_SHA8, `git show ${OLD_SHA}:bytecode-budget.sh must hash to ${OLD_SHA8}`);
    const p = join(mk('old'), 'bytecode-budget.sh');
    writeFileSync(p, g.stdout);
    return (OLD = p);
}

// ---- mutants: a copy of the tool under test with ONE count-checked edit (a RegExp or a string anchor; must match exactly once) ----
const MUT = new Map();
function mutant(id, anchor, to, from = TOOL) {
    if (MUT.has(id)) return MUT.get(id);
    const t = rd(from);
    const re = typeof anchor === 'string' ? new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : new RegExp(anchor.source, 'g');
    const n = (t.match(re) || []).length;
    assert.equal(n, 1, `MUT ${id}: anchor ${re.source.slice(0, 120)} must match exactly once in ${TOOL}, matched ${n} (retarget the anchor to the final text)`);
    const p = join(mk(`mut-${id}`), 'bytecode-budget.sh');
    writeFileSync(p, t.replace(new RegExp(re.source), (...m) => (typeof to === 'function' ? to(...m) : to)));
    MUT.set(id, p);
    return p;
}

// =====================================================================================================================
// A1: driver output goes to a regular file, never a pipe
// =====================================================================================================================
// 0 pipe lines across every bytecode call (the baseline and the probes); `file` lines = baseline + probes (old: every probe is a pipe)
function pipeRow(args, want) {
    const c = mkCase(); const d = drv(c, 'a'), d2 = drv(c, 'b');
    const r = run(TOOL, c, args(c, d, d2));
    assert.notEqual(r.status, 2, msg(r));
    const p = c.pipes();
    assert.equal(p.pipe, 0, `pipe lines: ${p.pipe} (every probe must write to a regular file)\n${msg(r)}`);
    assert.equal(p.file, want, `regular-file lines: ${p.file}, want ${want} (1 baseline + the probes)`);
}
test('A1 report, no --out (fake `[ -p /dev/stdout ]`): 0 pipe lines, 3 regular-file lines (baseline + 2 probes)', { skip }, () => {
    pipeRow((c, d) => rep(c, d), 3);
});
test('A1 report --out: 0 pipe lines, 3 regular-file lines', { skip }, () => {
    pipeRow((c, d) => rep(c, d, ['--out', join(c.dir, 'O')]), 3);
});
test('A1 diff, no --out: 0 pipe lines, 5 regular-file lines (baseline + 2 runs x 2 sides)', { skip }, () => {
    pipeRow((c, d, d2) => ['--node', c.node, '--runs', '2', '--diff', '--fn', 'mid', d, d2], 5);
});
test('A1 diff --out: 0 pipe lines, 5 regular-file lines', { skip }, () => {
    pipeRow((c, d, d2) => ['--node', c.node, '--runs', '2', '--out', join(c.dir, 'O'), '--diff', '--fn', 'mid', d, d2], 5);
});

// relative TMPDIR: the redirect must resolve from the CALLER's cwd, not the driver's (regression pin on old code: old has no temp file;
// the teeth are the redirect-inside-cd mutant below)
function a1rel(root) {
    const c = mkCase(); const d = drv(c, 'a');
    mkdirSync(join(c.cwd, 'rel'));
    const r = run(root, c, rep(c, d), { TMPDIR: 'rel' });
    return { c, r, left: readdirSync(join(c.cwd, 'rel')) };
}
function a1relWhy(x) {
    if (x.r.status !== 0) return `exit ${x.r.status}, want 0: ${all(x.r).slice(0, 300)}`;
    if (!hasLine(x.r.stdout, 'VERDICT REPORTED')) return `no VERDICT REPORTED: ${x.r.stdout.slice(-200)}`;
    if (x.left.length !== 0) return `rel/ holds ${x.left.length} entries: ${x.left.join(' ')}`;
    return null;
}
test('A1 relative TMPDIR (a driver in another directory): exit 0 REPORTED, rel/ empty afterwards (regression pin; mutant below)', { skip }, () => {
    assert.equal(a1relWhy(a1rel(TOOL)), null);
});
test('MUT A1 redirect-inside-cd (`>"$BB_TMP"` moved into the cd subshell) -> the relative-TMPDIR row goes red for ITS OWN reason (the probes lose their output), not via the baseline', { skip }, () => {
    // b71 G-SIG-2: the probe run is a drv_wait job, `( cd "$3" && exec env .. "./$4" ) >"$BB_TMP" 2>&1 <&0 &`
    const m = mutant('redir-in-cd', /("\.\/\$4") \) >"\$BB_TMP" 2>&1 <&0 &/, (_, a) => `${a} >"$BB_TMP" 2>&1 ) <&0 &`);
    const x = a1rel(m);
    const why = a1relWhy(x);
    assert.notEqual(why, null, 'mutant survived');
    const o = all(x.r);
    assert.ok(!o.includes('node compiles itself'), `the baseline must not be the reason: ${o.slice(0, 300)}`);
    assert.ok(/driver exited|cannot read driver output/.test(o), `expected a probe failure line: ${o.slice(0, 300)}`);
    assert.ok(x.c.baselines().length >= 1, 'the baseline spawn ran (the failure is in the probes)');
});

// TMPDIR is a regular file: mktemp fails in every probe; no node probe runs
test('A1 TMPDIR = a regular file: exit 2, each fn "cannot read driver output in run 1 (mktemp exited N)", 0 `driver exited`, exactly 3 spawns', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const f = join(c.dir, 'notadir'); writeFileSync(f, 'x');
    const r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--fn', 'mid,add', d], { TMPDIR: f });
    assert.equal(r.status, 2, msg(r));
    const o = r.stdout;
    for (const fn of ['mid', 'add']) assert.match(o, new RegExp(`^  ${fn}: NO-VERDICT -- cannot read driver output in run 1 \\(mktemp exited [1-9][0-9]*\\)$`, 'm'), msg(r));
    assert.equal(lines(all(r)).filter((l) => l.includes('driver exited')).length, 0, msg(r));
    assert.equal(c.argv().length, 3, `spawns: ${c.argv().join(' | ')}`);
});

// real BB-opus-1 (audit/2026-11-09-bytecode-budget/cross-fable/cross-repro.mjs): the driver holds its own stdout pipe full from a worker
// while V8 prints the second `f`. Truth through a regular file: f lengths 3 and 50, so `--max f=10` is OVER.
const HOLD_DRIVER = [
    "import { Worker, isMainThread, workerData } from 'node:worker_threads';",
    "import { writeSync } from 'node:fs';",
    'if (!isMainThread) {',
    '  const flag = new Int32Array(workerData);',
    '  const buf = Buffer.alloc(4096, 10);',
    "  while (Atomics.load(flag, 0) === 0) { try { writeSync(1, buf); } catch (e) { if (e.code !== 'EAGAIN') throw e; } }",
    '} else {',
    '  function f(a) { return a; }',
    '  f(1);',
    "  process.stdout.write('');",
    '  const sab = new SharedArrayBuffer(4); const flag = new Int32Array(sab);',
    '  const w = new Worker(new URL(import.meta.url), { workerData: sab });',
    "  await new Promise((r) => w.once('online', r));",
    '  const fill = Buffer.alloc(4096, 10);',
    "  for (let i = 0; i < 1024; i++) { try { writeSync(1, fill); } catch (e) { if (e.code !== 'EAGAIN') throw e; break; } }",
    '  const o = { f(x) { let s = 0; for (let i = 0; i < x; i++) { s += i * 3; if (s > 9) s -= 2; } return s; } };',
    '  o.f(3);',
    '  Atomics.store(flag, 0, 1);',
    "  await new Promise((r) => w.once('exit', r));",
    '}',
    '',
].join('\n');
let HOLD = null;
function holdFix() {
    if (HOLD !== null) return HOLD;
    const d = mk('hold'); writeFileSync(join(d, 'd.mjs'), HOLD_DRIVER);
    const fd = openSync(join(d, 'truth.txt'), 'w');
    let t;
    try { t = capSync(NODE_REAL, ['--print-bytecode', '--print-bytecode-filter=f', './d.mjs'], { cwd: d, env: cleanEnv(), stdio: ['ignore', fd, fd] }, 60000, 'BB-opus-1 truth run'); } finally { closeSync(fd); }
    const lens = lines(rd(join(d, 'truth.txt'))).filter((l) => l.startsWith('Bytecode length: ')).map((l) => l.slice(17)).join(',');
    return (HOLD = { d, ok: t.status === 0 && lens === '3,50', lens, status: t.status });
}
const holdSkip = () => { const h = holdFix(); return h.ok ? false : `BB-opus-1 truth through a regular file is not 3,50 (got "${h.lens}", exit ${h.status}) on this node`; };
function holdRuns(root) {   // 3 attempts: [{status, over, within}]
    const h = holdFix(); const t = mk('holdtmp');
    const out = [];
    for (let i = 0; i < 3; i++) {
        const r = spawn(BASH, [root, '--node', NODE_REAL, '--max', 'f=10', '--node-version', process.version, 'd.mjs'], { cwd: h.d, env: cleanEnv({ TMPDIR: t }) }, 'BB-opus-1 attempt', 120000);
        out.push({ status: r.status, over: hasLine(r.stdout, 'VERDICT OVER'), within: hasLine(r.stdout, 'VERDICT WITHIN'), r });
    }
    return out;
}
// OVER, or NO-VERDICT from a torn record: the worker thread's newlines can land between V8's header and length lines on
// the regular file too, which the bad / orphan rules and the null control refuse (seen under a full-suite load). Never WITHIN.
const HOLD_TORN = /null control: run \d+ differs from run 1|matched header\(s\) not followed by/;
test('A1 real BB-opus-1 (a held-full stdout pipe): 3 of 3 attempts are exit 1 `VERDICT OVER` or a torn-record NO-VERDICT, never WITHIN (truth: f = 3,50 > 10)', { skip: skip || NODEPRE || holdSkip() }, () => {
    const x = holdRuns(TOOL);
    x.forEach((a, i) => {
        assert.ok(!a.within && a.status !== 0, `attempt ${i + 1} lost the record: ${msg(a.r)}`);
        assert.ok(a.over ? a.status === 1 : (a.status === 2 && HOLD_TORN.test(a.r.stdout)), `attempt ${i + 1}: ${msg(a.r)}`);
    });
});
test(`A1 real BB-opus-1 twin: the ${OLD_SHA} root says WITHIN exit 0 in at least 1 of 3 attempts (local only; red-on-old pin of the row above)`, { skip: skip || OLDSKIP || NODEPRE || (CI_STRICT ? 'local only: the old root pipe drop depends on the host' : false) || holdSkip() }, () => {
    const x = holdRuns(oldRoot());
    assert.ok(x.some((a) => a.status === 0 && a.within), `old root never lost the record in 3 attempts: ${x.map((a) => a.status).join(',')}`);
});

// =====================================================================================================================
// A2: --no-flush-bytecode
// =====================================================================================================================
const TOK = '--no-flush-bytecode';
// null | why: every bytecode argv line (baseline + 2 probes = 3 of 3) has TOK after every --v8-flags token and before --print-bytecode
function a2order(root) {
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(root, c, rep(c, d, ['--v8-flags', '--expose-gc --flush-bytecode']));
    if (r.status !== 0) return `exit ${r.status}: ${all(r).slice(0, 300)}`;
    const ps = c.probes();
    if (ps.length !== 3) return `bytecode argv lines: ${ps.length}, want 3 (baseline + 2 probes): ${ps.join(' | ')}`;
    let bad = 0; const why = [];
    for (const l of ps) {
        const a = l.split(' ');
        const t = a.indexOf(TOK), g = a.indexOf('--expose-gc'), f = a.indexOf('--flush-bytecode'), p = a.indexOf('--print-bytecode');
        if (t < 0) { bad++; why.push(`no ${TOK}`); } else if (!(g >= 0 && f >= 0 && p >= 0 && g < t && f < t && t < p)) { bad++; why.push(`order wrong: ${l}`); }
    }
    if (bad !== 0) return `${bad} of 3 lines wrong: ${why[0]}`;
    const mode = `mode    report  runs 2  v8 flags --expose-gc --flush-bytecode ${TOK} --print-bytecode --print-bytecode-filter=<fn>`;
    if (!hasLine(r.stdout, mode)) return `mode line missing: want ${JSON.stringify(mode)}; got ${JSON.stringify(lines(r.stdout).find((l) => l.startsWith('mode')))}`;
    return null;
}
test('A2 fake argv: 3 of 3 bytecode calls (baseline + 2 probes) carry --no-flush-bytecode after every --v8-flags token and before --print-bytecode; exact mode line', { skip }, () => {
    assert.equal(a2order(TOOL), null);
});
test('MUT A2 token-before-flags (the token moved ahead of ${V8_EXTRA[@]} in the probe) -> the argv-order row goes red for its own reason (order wrong)', { skip }, () => {
    const m = mutant('tok-first', /(\$\{V8_EXTRA\[@\]\+"\$\{V8_EXTRA\[@\]\}"\}) --no-flush-bytecode( --print-bytecode \\?\s*--print-bytecode-filter="\$1")/, (_, a, b) => `--no-flush-bytecode ${a}${b}`);
    const why = a2order(m);
    assert.notEqual(why, null, 'mutant survived');
    assert.match(why, /order wrong|lines wrong/, why);
});

// real node: V8 flushes bytecode on the 2nd gc() under --stress-flush-code, so the 2nd call recompiles and prints a 2nd record; the
// pinned --no-flush-bytecode must give exactly 1 match
const FLUSH_DRIVER = 'function mid(a, b) { return a + b; }\nglobalThis.r = mid(1, 2);\ngc(); gc();\nglobalThis.r += mid(3, 4);\n';
let FLUSHFIX = null;
function flushFix() {
    if (FLUSHFIX !== null) return FLUSHFIX;
    const d = mk('flush'); writeFileSync(join(d, 'driver.mjs'), FLUSH_DRIVER);
    const count = (extra) => {
        const fd = openSync(join(d, 'o.txt'), 'w');
        try { capSync(NODE_REAL, ['--expose-gc', '--stress-flush-code', ...extra, '--print-bytecode', '--print-bytecode-filter=mid', './driver.mjs'], { cwd: d, env: cleanEnv(), stdio: ['ignore', fd, fd] }, 60000, 'flush truth run'); } finally { closeSync(fd); }
        return lines(rd(join(d, 'o.txt'))).filter((l) => l.startsWith('[generated bytecode for function: mid (')).length;
    };
    const flushed = count([]), pinned = count([TOK]);
    return (FLUSHFIX = { d, flushed, pinned, ok: flushed === 2 && pinned === 1 });
}
const flushSkip = () => { const f = flushFix(); return f.ok ? false : `this node does not show the flush (direct run: ${f.flushed} records, want 2; with ${TOK}: ${f.pinned}, want 1)`; };
test('A2 real node, `mid` under --expose-gc --stress-flush-code: `mid: 1 match(es)` (old: 2 match(es): 6,6)', { skip: skip || NODEPRE || flushSkip() }, () => {
    const f = flushFix(); const t = mk('flushtmp');
    const r = spawn(BASH, [TOOL, '--node', NODE_REAL, '--node-version', process.version, '--runs', '2', '--v8-flags', '--expose-gc --stress-flush-code', '--fn', 'mid', 'driver.mjs'], { cwd: f.d, env: cleanEnv({ TMPDIR: t }) }, 'A2 real flush', 120000);
    assert.equal(r.status, 0, msg(r));
    assert.match(r.stdout, /^  mid: 1 match\(es\): \d+$/m, msg(r));
});

// the DIFF contract: one mid vs two copies of mid (equal lengths) -> exit 1 DIFF, "after  2 match(es)" (regression pin on old code;
// the teeth are the M-len mutant: a deduping multiset reads 7 vs 7,7 as SAME)
function a2contract(root) {
    const c = mkCase(); const d1 = drv(c, 'one'), d2 = drv(c, 'two', '//copy\n//copy\n');
    const r = run(root, c, ['--node', c.node, '--runs', '2', '--diff', '--fn', 'mid', d1, d2]);
    return { r, why: (r.status === 1 && hasLine(r.stdout, 'VERDICT DIFF') && /^  mid: after\s+2 match\(es\): 7,7$/m.test(r.stdout)) ? null : `exit ${r.status}\n${r.stdout.slice(-400)}` };
}
test('A2 contract: one `mid` vs two copies of it -> exit 1 VERDICT DIFF, "mid: after 2 match(es): 7,7" (regression pin; mutant below)', { skip }, () => {
    assert.equal(a2contract(TOOL).why, null);
});
test('MUT A2 M-len (`multiset() { sort | uniq -c; }` deduped with sort -u) -> the contract row reads SAME exit 0, for its own reason', { skip }, () => {
    const m = mutant('m-len', 'multiset() { sort | uniq -c; }', 'multiset() { sort -u | uniq -c; }');
    const x = a2contract(m);
    assert.notEqual(x.why, null, 'mutant survived');
    assert.equal(x.r.status, 0, msg(x.r));
    assert.ok(hasLine(x.r.stdout, 'VERDICT SAME'), msg(x.r));
    assert.ok(!all(x.r).includes('node compiles itself'), 'not a baseline failure');
});

// =====================================================================================================================
// A3: one baseline spawn per run (--print-bytecode-filter='*' on node itself)
// =====================================================================================================================
const BASE_MSG = 'node itself compiles';
test('A3 fake baseline lists `get`; --max get=9: exit 2 NO-VERDICT, the "node itself compiles" refusal (old: WITHIN)', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--max', 'get=9', ...NV, d], { FAKE_BASE: 'get' });
    assert.equal(r.status, 2, msg(r));
    assert.ok(hasLine(r.stdout, 'VERDICT NO-VERDICT'), msg(r));
    assert.ok(all(r).includes(BASE_MSG), `no "${BASE_MSG}" text\n${msg(r)}`);
});
// real BB-opus-2 (audit reviewer-opus / cross-fable): the driver's get is never called, node's own functions named get fill the multiset
let GETFIX = null;
function getFix() {
    if (GETFIX !== null) return GETFIX;
    const d = mk('get');
    for (const [s, t] of [['a', "export class C { get(k) { return k; } }\nconsole.log('hello');\n"],
        ['b', "export class C { get(k) { let s = 0; for (let i = 0; i < k; i++) { s += i * 2; if (s > 100) s -= 3; } return s; } }\nconsole.log('hello');\n"],
        ['c', "console.log('x');\n"]]) { mkdirSync(join(d, s)); writeFileSync(join(d, s, 'driver.mjs'), t); }
    // truth: node's own baseline (no driver) lists a function named `get` on THIS node
    const fd = openSync(join(d, 'base.txt'), 'w');
    try { capSync(NODE_REAL, ['--print-bytecode', "--print-bytecode-filter=get", '-e', "console.log('')"], { cwd: d, env: cleanEnv(), stdio: ['ignore', fd, fd] }, 60000, 'baseline truth run'); } finally { closeSync(fd); }
    const has = lines(rd(join(d, 'base.txt'))).some((l) => l.startsWith('[generated bytecode for function: get ('));
    return (GETFIX = { d, has });
}
const getSkip = () => (getFix().has ? false : 'this node does not list a function `get` of its own (truth run: -e "console.log(\'\')" with filter get)');
test('A3 real BB-opus-2 (diff half): a never-called driver `get`, two different bodies -> exit 2 NO-VERDICT (old: SAME exit 0)', { skip: skip || getSkip() }, () => {
    const g = getFix(); const t = mk('gettmp');
    const r = spawn(BASH, [TOOL, '--node', NODE_REAL, '--diff', '--fn', 'get', 'a/driver.mjs', 'b/driver.mjs'], { cwd: g.d, env: cleanEnv({ TMPDIR: t }) }, 'BB-opus-2 diff', 120000);
    assert.equal(r.status, 2, msg(r));
    assert.ok(hasLine(r.stdout, 'VERDICT NO-VERDICT'), msg(r));
    assert.ok(!hasLine(r.stdout, 'VERDICT SAME'), msg(r));
    assert.ok(all(r).includes(BASE_MSG), msg(r));
});
test('A3 real BB-opus-2 (gate half): a driver with no `get`, --max get=1 -> exit 2 NO-VERDICT (old: OVER exit 1)', { skip: skip || NODEPRE || getSkip() }, () => {
    const g = getFix(); const t = mk('gettmp');
    const r = spawn(BASH, [TOOL, '--node', NODE_REAL, '--max', 'get=1', '--node-version', process.version, 'c/driver.mjs'], { cwd: g.d, env: cleanEnv({ TMPDIR: t }) }, 'BB-opus-2 gate', 120000);
    assert.equal(r.status, 2, msg(r));
    assert.ok(hasLine(r.stdout, 'VERDICT NO-VERDICT'), msg(r));
    assert.ok(!hasLine(r.stdout, 'VERDICT OVER'), msg(r));
    assert.ok(all(r).includes(BASE_MSG), msg(r));
});

// five baseline failures (only the baseline call fails): exit 2, "node compiles itself", 0 `driver exited` (old: a verdict, exit 0)
const SHIMROWS = [
    ['node exits 3 on the baseline call (headers printed)', {}, { FAKE_BASERC: '3' }, 'node exited 3'],
    ['node prints zero headers on the baseline call (exit 0)', {}, { FAKE_BASE_NONE: '1' }, 'it listed no function'],
    ['tr fails on the baseline call', { tr: true }, {}, null],
    ['awk fails on the baseline call', { awk: true }, {}, null],
    ['mktemp fails on the baseline call', {}, { SHIM_MKTEMP_FAIL_FIRST: '1' }, 'mktemp exited 1'],
];
for (const [name, opts, env, frag] of SHIMROWS) {
    test(`A3 baseline failure: ${name} -> exit 2, "node compiles itself", 0 \`driver exited\``, { skip }, () => {
        const c = mkCase(opts); const d = drv(c, 'a');
        const r = run(TOOL, c, rep(c, d), env);
        assert.equal(r.status, 2, msg(r));
        assert.ok(hasLine(r.stdout, 'VERDICT NO-VERDICT'), msg(r));
        assert.match(all(r), /node compiles itself/, msg(r));
        if (frag !== null) assert.ok(all(r).includes(`cannot list the functions node compiles itself (${frag})`), `want the fragment "(${frag})"\n${msg(r)}`);
        assert.equal(lines(all(r)).filter((l) => l.includes('driver exited')).length, 0, msg(r));
    });
}
test('A3 spawns, report: 3 fns x 2 runs -> exactly 10 (--version, 2 x --v8-options, 1 baseline, 6 probes)', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--fn', 'mid,add,get2', d]);
    assert.equal(r.status, 0, msg(r));
    assert.equal(c.argv().length, 10, c.argv().join('\n'));
    assert.equal(c.baselines().length, 1, 'one baseline');
});
test('A3 spawns, diff: 1 fn x 2 runs -> exactly 8 (3 + 1 baseline + 4 probes)', { skip }, () => {
    const c = mkCase(); const d1 = drv(c, 'a'), d2 = drv(c, 'b');
    const r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--diff', '--fn', 'mid', d1, d2]);
    assert.equal(r.status, 0, msg(r));
    assert.equal(c.argv().length, 8, c.argv().join('\n'));
    assert.equal(c.baselines().length, 1, 'one baseline');
});
test('A3 version mismatch: exactly 2 spawns (--version, one --v8-options), no baseline spawn', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(TOOL, c, rep(c, d, ['--node-version', 'v1.0.0']));
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.argv().length, 2, c.argv().join('\n'));
    assert.equal(c.baselines().length, 0);
});
test('A3 raw/: nothing from the baseline reaches DIR/raw (report: fn x runs files; diff: fn x runs per side); OUT holds raw/ and report.txt only', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a'), d2 = drv(c, 'b');
    let r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--out', c.out, '--fn', 'mid,add,get2', d]);
    assert.equal(r.status, 0, msg(r));
    assert.deepEqual(readdirSync(join(c.out, 'raw')).sort(), ['add.1.txt', 'add.2.txt', 'get2.1.txt', 'get2.2.txt', 'mid.1.txt', 'mid.2.txt']);
    assert.deepEqual(readdirSync(c.out).sort(), ['raw', 'report.txt']);
    const o2 = join(c.dir, 'O2');
    r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--out', o2, '--diff', '--fn', 'mid', d, d2]);
    assert.equal(r.status, 0, msg(r));
    assert.deepEqual(readdirSync(join(o2, 'raw')).sort(), ['after', 'before']);
    assert.deepEqual(readdirSync(join(o2, 'raw', 'before')).sort(), ['mid.1.txt', 'mid.2.txt']);
    assert.deepEqual(readdirSync(join(o2, 'raw', 'after')).sort(), ['mid.1.txt', 'mid.2.txt']);
    assert.deepEqual(readdirSync(o2).sort(), ['raw', 'report.txt']);
});

// =====================================================================================================================
// A4: refusals before any spawn; -h
// =====================================================================================================================
test('A4 a newline in a DRIVER name: exit 2, 0 spawns, no forged `VERDICT SAME` line on stdout (old: a forged line)', { skip }, () => {
    const c = mkCase();
    const name = 'a\nVERDICT SAME\nb.mjs';
    writeFileSync(join(c.cwd, name), '//d\n');
    const r = run(TOOL, c, ['--node', c.node, '--diff', '--fn', 'nosuch', name, name]);
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.argv().length, 0, `spawns: ${c.argv().join(' | ')}`);
    assert.ok(!hasLine(r.stdout, 'VERDICT SAME'), msg(r));
});
test('A4 a newline in --out: exit 2, 0 spawns, no `VERDICT SAME` line on stdout', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(TOOL, c, rep(c, d, ['--out', `${c.out}\nVERDICT SAME\nx`]));
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.argv().length, 0, `spawns: ${c.argv().join(' | ')}`);
    assert.ok(!hasLine(r.stdout, 'VERDICT SAME'), msg(r));
});
test('A4 a newline in the CWD (relative DRIVERs a.mjs b.mjs): exit 2, 0 spawns, 0 column-1 `VERDICT SAME` lines on stdout, the die line names the cwd (old: exit 2, 7 spawns, forged lines)', { skip }, () => {
    const c = mkCase();
    const p = join(c.dir, 'nl\nVERDICT SAME\nx'); mkdirSync(p);
    writeFileSync(join(p, 'a.mjs'), '//d\n'); writeFileSync(join(p, 'b.mjs'), '//d\n');
    c.cwd = p;
    const r = run(TOOL, c, ['--node', c.node, '--diff', '--fn', 'nosuch', 'a.mjs', 'b.mjs']);
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.argv().length, 0, `spawns: ${c.argv().join(' | ')}`);
    assert.equal(lines(r.stdout).filter((l) => l === 'VERDICT SAME').length, 0, msg(r));
    assert.match(r.stderr, /cwd/, msg(r));
});
test('A4 --fn foo,FOO with --out: exit 2, 0 spawns (old: exit 0); without --out no refusal (exit 0 REPORTED)', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    let r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--out', c.out, '--fn', 'foo,FOO', d]);
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.argv().length, 0, `spawns: ${c.argv().join(' | ')}`);
    r = run(TOOL, c, ['--node', c.node, '--runs', '2', '--fn', 'foo,FOO', d]);
    assert.equal(r.status, 0, msg(r));
    assert.ok(hasLine(r.stdout, 'VERDICT REPORTED'), msg(r));
});
// `=` in the node path: env would read it as an assignment. The refusal is a "node binary: ... =" line (old: "cannot run ... --version", no
// "node binary:" prefix, 0 fake spawns by accident), exit 2, 0 spawns.
const EQ = /^bytecode-budget: node binary: [^\n]*=/m;
function eqRow(how) {
    const c = mkCase(); const d = drv(c, 'a');
    let args, env = {};
    const put = (dir) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'node'), fakeText(c.dir)); chmodSync(join(dir, 'node'), 0o755); return join(dir, 'node'); };
    if (how === 'abs') { args = ['--node', put(join(c.dir, 'a=b'))]; }
    else if (how === 'cwd') { const p = join(c.dir, 'x=y'); put(p); c.cwd = p; args = ['--node', './node']; }
    else { const p = join(c.dir, 'p=q'); put(p); args = ['--node', 'node']; env = { PATH: `${p}:${c.bin}:${process.env.PATH}` }; }
    const r = run(TOOL, c, [...args, '--runs', '2', '--fn', 'mid', d], env);
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.argv().length, 0, `spawns: ${c.argv().join(' | ')}`);
    assert.match(r.stderr, EQ, msg(r));
}
test('A4 `=` in an absolute --node path: exit 2 "node binary: ... =", 0 spawns', { skip }, () => { eqRow('abs'); });
test('A4 `=` from the cwd (`--node ./node` in an a=b directory): exit 2 "node binary: ... =", 0 spawns', { skip }, () => { eqRow('cwd'); });
test('A4 `=` from PATH (`--node node` found in a dir with `=`): exit 2 "node binary: ... =", 0 spawns', { skip }, () => { eqRow('path'); });
// Q-B65-NODEPRE "keep refusal": a prerelease --node-version (setup-node `latest` printed v27.0.0-alpha.0.0.0) is refused
// before any spawn, fail closed; the NODEPRE skips above rely on it
test('A4 --node-version v27.0.0-alpha.0.0.0 (a prerelease, Q-B65-NODEPRE): exit 2, "--node-version must be vX.Y.Z", VERDICT NO-VERDICT, 0 spawns', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(TOOL, c, ['--node', c.node, '--max', 'f=1', '--node-version', 'v27.0.0-alpha.0.0.0', d]);
    assert.equal(r.status, 2, msg(r));
    assert.ok(all(r).includes('--node-version must be vX.Y.Z'), msg(r));
    assert.match(all(r), /^VERDICT NO-VERDICT$/m, msg(r));
    assert.equal(c.argv().length, 0, `spawns: ${c.argv().join(' | ')}`);
});
test('A4 -h (exit 2) holds "nearest package.json above DIR", the raw path DIR/raw/<side>/<fn>.<k>.txt and the flush token (whitespace collapsed: the text wraps)', { skip }, () => {
    const r = spawn(BASH, [TOOL, '-h'], { cwd: mk('h') }, `${TOOLNAME} -h`, 30000);
    assert.equal(r.status, 2, msg(r));
    const t = squash(r.stdout);
    for (const frag of ['nearest package.json above DIR', 'DIR/raw/<side>/<fn>.<k>.txt', TOK]) assert.ok(t.includes(frag), `-h lacks "${frag}"`);
});

// =====================================================================================================================
// A5: parity against ff6108b on the fake matrix; retention
// =====================================================================================================================
test(`A5 the old side is \`git show ${OLD_SHA}:bytecode-budget.sh\`, sha256/8 ${OLD_SHA8}`, { skip: OLDSKIP }, () => {
    assert.ok(existsSync(oldRoot()));
});
const MODELINE = '--print-bytecode --print-bytecode-filter=<fn>';
const normOld = (s) => s.split(MODELINE).join(`${TOK} ${MODELINE}`);   // the one delta: the mode-line token
function treeOf(p, norm) {
    if (!existsSync(p)) return null;
    const walk = (q, pre) => readdirSync(q).sort().flatMap((e) => {
        const f = join(q, e), st = lstatSync(f), rel = pre + e;
        if (st.isDirectory()) return [`${rel}/`, ...walk(f, `${rel}/`)];
        const t = readFileSync(f, 'utf8');
        return [`${rel} ${sha8(norm ? normOld(t) : t)}`];
    });
    return walk(p, '');
}
function shot(root, c, args, env, norm) {
    c.reset(); rmSync(c.out, { recursive: true, force: true });
    const r = run(root, c, args, env);
    const n = (s) => (norm ? normOld(s) : s);
    return { rc: r.status, so: n(r.stdout), se: n(r.stderr), spawns: c.argv().length, tree: treeOf(c.out, norm), tmp: readdirSync(c.tmp).length };
}
const OUTD = (c) => join(c.dir, 'O');
const MATRIX = [
    ['report 2 fns', 1, (c, a) => ['--node', c.node, '--runs', '2', '--fn', 'mid,add', a], {}],
    ['report --out', 1, (c, a) => ['--node', c.node, '--runs', '3', '--out', OUTD(c), '--fn', 'mid,add', a], {}],
    ['gate within', 1, (c, a) => ['--node', c.node, '--runs', '2', '--max', 'mid=300,add=300', ...NV, a], {}],
    ['gate OVER', 1, (c, a) => ['--node', c.node, '--runs', '2', '--max', 'mid=5', ...NV, a], {}],
    ['diff SAME', 1, (c, a, b) => ['--node', c.node, '--runs', '2', '--diff', '--fn', 'mid', a, b], {}],
    ['diff DIFF --out (two copies)', 1, (c, a, b, e) => ['--node', c.node, '--runs', '2', '--out', OUTD(c), '--diff', '--fn', 'mid', a, e], {}],
    ['NO-VERDICT: a fn that never compiles', 1, (c, a) => ['--node', c.node, '--runs', '2', '--fn', 'lazy', a], {}],
    ['driver exits 1', 1, (c, a) => ['--node', c.node, '--runs', '2', '--out', OUTD(c), '--fn', 'mid', a], { FAKE_RC: '1' }],
    ['null control: run 2 differs', 1, (c, a) => ['--node', c.node, '--runs', '2', '--fn', 'mid', a], { FAKE_RUN2DIFF: '1' }],
    ['version mismatch (--out)', 0, (c, a) => ['--node', c.node, '--runs', '2', '--out', OUTD(c), '--fn', 'mid', '--node-version', 'v1.0.0', a], {}],
    ['refusal: --runs 1', 0, (c, a) => ['--node', c.node, '--runs', '1', '--fn', 'mid', a], {}],
    ['refusal: qualified fn name', 0, (c, a) => ['--node', c.node, '--fn', 'Store.read', a], {}],
    ['refusal: --diff with --max', 0, (c, a, b) => ['--node', c.node, '--diff', '--max', 'mid=9', ...NV, a, b], {}],
    ['allowlist refusal: --v8-flags --bogus-flag (after the 2 --v8-options reads, before any probe)', 0, (c, a) => ['--node', c.node, '--v8-flags', '--bogus-flag', '--fn', 'mid', a], {}],
];
for (const [name, delta, args, env] of MATRIX) {
    test(`A5 parity vs ${OLD_SHA}: ${name}: rc, stdout, stderr, OUT tree identical after the mode-line token; spawns +${delta}`, { skip: OLDSKIP }, () => {
        const o = oldRoot();
        const c = mkCase(); const a = drv(c, 'a'), b = drv(c, 'b'), e = drv(c, 'e', '//copy\n//copy\n');
        const A = args(c, a, b, e);
        const old = shot(o, c, A, env, true);
        const cur = shot(TOOL, c, A, env, false);
        assert.equal(cur.rc, old.rc, `rc\nnew: ${cur.so}${cur.se}`);
        assert.equal(cur.so, old.so, 'stdout');
        assert.equal(cur.se, old.se, 'stderr');
        assert.deepEqual(cur.tree, old.tree, 'OUT tree');
        assert.equal(cur.tmp, 0, 'TMPDIR leftovers (new)');
        assert.equal(cur.spawns, old.spawns + delta, `spawns: old ${old.spawns}, new ${cur.spawns}, want +${delta}`);
    });
}
test('A5 retention: 20 E1 runs (report, 1 fn x 2 runs): TMPDIR holds 0 entries, 60 mktemp calls, 120 spawns', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    for (let i = 0; i < 20; i++) {
        const r = run(TOOL, c, rep(c, d));
        assert.equal(r.status, 0, `run ${i + 1}: ${msg(r)}`);
    }
    assert.equal(readdirSync(c.tmp).length, 0, `TMPDIR leftovers: ${readdirSync(c.tmp).join(' ')}`);
    assert.equal(c.mktemps(), 60, 'mktemp calls (3 per run: baseline + 2 probes)');
    assert.equal(c.argv().length, 120, 'spawns (6 per run)');
});

// =====================================================================================================================
// A6: a full TMPDIR is seen (ruling Q-B60-TMPFULL): after the read, 64 KiB of spaces are appended to the temp file; a failed append is
// "append exited N". The limit is `ulimit -f` in KiB (1024-byte blocks), XFSZ ignored (else the shell dies by signal, proving nothing).
// =====================================================================================================================
function runLimited(root, c, args, kib, env = {}) {
    return spawn(BASH, ['-c', `trap '' XFSZ; ulimit -f ${kib}; exec ${BASH} "$@"`, 'wrap', root, ...args], { cwd: c.cwd, env: cleanEnv({ PATH: `${c.bin}:${process.env.PATH}`, TMPDIR: c.tmp, ...env }) }, `${TOOLNAME} under ulimit -f ${kib}`);
}
const WRITEERR = /write error|File too large|File size limit|No space left|printf:/i;
function a6probe(root, kib) {   // report, 2 fns, short fake output, optionally under the limit; returns { r, c, raw }
    const c = mkCase(); const d = drv(c, 'a');
    const args = ['--node', c.node, '--runs', '2', '--out', c.out, '--fn', 'mid,add', d];
    const r = kib === null ? run(root, c, args) : runLimited(root, c, args, kib);
    const raw = treeOf(join(c.out, 'raw'), false);
    return { r, c, raw };
}
test('A6 probe row: ulimit -f 8, short fake output -> exit 2, each fn "cannot read driver output in run 1 (append exited 1)", 0 `driver exited`, no write-error text; raw/ bytes equal the no-limit run\'s; TMPDIR empty', { skip }, () => {
    const x = a6probe(TOOL, 8), y = a6probe(TOOL, null);
    assert.equal(x.r.status, 2, msg(x.r));
    for (const fn of ['mid', 'add']) assert.match(x.r.stdout, new RegExp(`^  ${fn}: NO-VERDICT -- cannot read driver output in run 1 \\(append exited 1\\)$`, 'm'), msg(x.r));
    assert.equal(lines(all(x.r)).filter((l) => l.includes('driver exited')).length, 0, msg(x.r));
    assert.doesNotMatch(x.r.stderr, WRITEERR, msg(x.r));
    assert.ok(x.raw !== null && x.raw.length === 4, `raw/ listing: ${JSON.stringify(x.raw)}`);
    assert.deepEqual(x.raw, y.raw, 'raw/ bytes differ from the no-limit run (the padding must never reach raw/)');
    assert.equal(readdirSync(x.c.tmp).length, 0, 'TMPDIR leftovers');
});
test('A6 baseline-only row: ulimit -f 100, ~80000-byte baseline output, short probes -> exit 2, "cannot list the functions node compiles itself (append exited 1)"', { skip }, () => {
    const c = mkCase(); const d = drv(c, 'a');
    const r = runLimited(TOOL, c, rep(c, d), 100, { FAKE_BASE_PAD: '80000' });
    assert.equal(r.status, 2, msg(r));
    assert.ok(all(r).includes('cannot list the functions node compiles itself (append exited 1)'), msg(r));
    assert.equal(lines(all(r)).filter((l) => l.includes('driver exited')).length, 0, msg(r));
    assert.equal(readdirSync(c.tmp).length, 0, 'TMPDIR leftovers');
});
test('A6 no-limit twin: the same fakes without ulimit -> exit 0 REPORTED (rows 1 and 2 are caused by the limit); TMPDIR empty', { skip }, () => {
    const x = a6probe(TOOL, null);
    assert.equal(x.r.status, 0, msg(x.r));
    assert.ok(hasLine(x.r.stdout, 'VERDICT REPORTED'), msg(x.r));
    const c = mkCase(); const d = drv(c, 'a');
    const r = run(TOOL, c, rep(c, d), { FAKE_BASE_PAD: '80000' });
    assert.equal(r.status, 0, msg(r));
    assert.equal(readdirSync(c.tmp).length, 0);
    assert.equal(readdirSync(x.c.tmp).length, 0);
});
test('MUT A6 drop-append (BOTH 64 KiB appends removed) -> the probe-row setup reads exit 0 REPORTED (the full TMPDIR goes unseen), never baseline text', { skip }, () => {
    // b71 G-SIG-2: the probe appends to BB_TMP too; its line ends at `ar=$?` (base_list's carries a comment), so `\n` picks it
    const m1 = mutant('noapp-probe', `{ printf '%65536s' '' >>"$BB_TMP"; } 2>/dev/null || ar=$?\n`, ':\n');
    // b70 G-SIG-1: base_list appends to the global BB_TMP (its EXIT trap removes it on any exit), no longer a local $base
    const m = mutant('noapp-base', `{ printf '%65536s' '' >>"$BB_TMP"; } 2>/dev/null || ar=$?`, ':', m1);
    const x = a6probe(m, 8);
    assert.equal(x.r.status, 0, msg(x.r));
    assert.ok(hasLine(x.r.stdout, 'VERDICT REPORTED'), msg(x.r));
    assert.ok(!all(x.r).includes('append exited'), msg(x.r));
    assert.ok(!all(x.r).includes('node compiles itself'), 'not via BASE_BAD');
    assert.equal(readdirSync(x.c.tmp).length, 0, 'TMPDIR leftovers');
});

// ---- blocker-2 rows (REVIEW-b60-g1-r1): precedence and anchoring contracts of the append / baseline reasons, each with its mutant ----
function a6a(root) {   // (a) the driver exit must not hide the append: FAKE_RC=3 under ulimit -f 8
    const c = mkCase(); const d = drv(c, 'a');
    const r = runLimited(root, c, rep(c, d), 8, { FAKE_RC: '3' });
    return { r, c };
}
function a6aWhy(x) {
    if (x.r.status !== 2) return `exit ${x.r.status}`;
    if (!/mid: NO-VERDICT -- cannot read driver output in run 1 \(append exited 1\)/.test(x.r.stdout)) return 'no "append exited 1"';
    if (all(x.r).includes('driver exited')) return 'the driver exit shows: "driver exited"';
    return null;
}
test('A6 (a) append beats the driver exit: ulimit -f 8, FAKE_RC=3 -> "append exited 1", no "driver exited"', { skip }, () => { assert.equal(a6aWhy(a6a(TOOL)), null); });
test('MUT A6 (a) `$rc != *:*` -> `$rc == 0` (a driver exit hides the append) -> "driver exited 3" shows, "append exited" gone', { skip }, () => {
    const m = mutant('a6a', '$ar != 0 && $rc != *:*', '$ar != 0 && $rc == 0');
    const x = a6a(m);
    assert.notEqual(a6aWhy(x), null, 'mutant survived');
    assert.ok(all(x.r).includes('driver exited 3 in run 1'), msg(x.r));
    assert.ok(!all(x.r).includes('append exited'), msg(x.r));
});
function a6b(root) {   // (b) a tool failure must not be hidden by the append: the nul tr fails, the append fails too
    const c = mkCase({ trnul: true }); const d = drv(c, 'a');
    return { r: runLimited(root, c, rep(c, d), 8), c };
}
test('A6 (b) a tool failure beats the append: tr fails, ulimit -f 8 -> "tr exited 1", no "append exited"', { skip }, () => {
    const x = a6b(TOOL);
    assert.equal(x.r.status, 2, msg(x.r));
    assert.match(x.r.stdout, /mid: NO-VERDICT -- cannot read driver output in run 1 \(tr exited 1\)/, msg(x.r));
    assert.ok(!all(x.r).includes('append exited'), msg(x.r));
});
test('MUT A6 (b) `&& $rc != *:*` dropped (the append overwrites a tool failure) -> "append exited 1" shows where "tr exited 1" belongs', { skip }, () => {
    const m = mutant('a6b', ' && $rc != *:* ]]; then rc="append:$ar"', ' ]]; then rc="append:$ar"');
    const x = a6b(m);
    assert.ok(/mid: NO-VERDICT -- cannot read driver output in run 1 \(append exited 1\)/.test(x.r.stdout), msg(x.r));
    assert.ok(!all(x.r).includes('tr exited'), msg(x.r));
});
function a6c(root) {   // (c) baseline: the append beats the node exit
    const c = mkCase(); const d = drv(c, 'a');
    return { r: runLimited(root, c, rep(c, d), 100, { FAKE_BASE_PAD: '80000', FAKE_BASERC: '3' }), c };
}
test('A6 (c) baseline: append beats the node exit: ulimit -f 100, 80000-byte baseline, exit 3 -> "(append exited 1)", not "(node exited 3)"', { skip }, () => {
    const x = a6c(TOOL);
    assert.equal(x.r.status, 2, msg(x.r));
    assert.ok(all(x.r).includes('cannot list the functions node compiles itself (append exited 1)'), msg(x.r));
    assert.ok(!all(x.r).includes('node exited 3'), msg(x.r));
});
test('MUT A6 (c) append / node order swapped in base_list -> "(node exited 3)" shows where "(append exited 1)" belongs', { skip }, () => {
    const m = mutant('a6c', '  elif [[ $ar != 0 ]]; then BASE_BAD="append exited $ar"\n  elif [[ $brc != 0 ]]; then BASE_BAD="node exited $brc"',
        '  elif [[ $brc != 0 ]]; then BASE_BAD="node exited $brc"\n  elif [[ $ar != 0 ]]; then BASE_BAD="append exited $ar"');
    const x = a6c(m);
    assert.ok(all(x.r).includes('cannot list the functions node compiles itself (node exited 3)'), msg(x.r));
    assert.ok(!all(x.r).includes('append exited'), msg(x.r));
});
function a6d(root) {   // (d) "no function named" comes before the baseline reasons
    const c = mkCase(); const d = drv(c, 'a');
    return { r: run(root, c, ['--node', c.node, '--runs', '2', '--fn', 'lazy', d], { FAKE_BASERC: '3' }), c };
}
test('A6 (d) --fn lazy with a failing baseline (exit 3) -> "no function named \'lazy\'", not the baseline reason', { skip }, () => {
    const x = a6d(TOOL);
    assert.equal(x.r.status, 2, msg(x.r));
    assert.ok(all(x.r).includes("no function named 'lazy'"), msg(x.r));
    assert.ok(!all(x.r).includes('node compiles itself'), msg(x.r));
});
test('MUT A6 (d) the two baseline checks moved above `n == 0` -> the baseline reason shows where "no function named" belongs', { skip }, () => {
    const L = '[^\\n]*\\n';
    const m = mutant('a6d', new RegExp(`(  if \\[\\[ "\\$n" == 0 \\]\\]${L})(  if \\[\\[ "\\$bad" != 0 \\]\\]${L})(  if \\[\\[ -n "\\$BASE_BAD" \\]\\]${L})(  if \\[\\[ "\\$BASE_NAMES" ==${L})`), (_, a, b, c3, d4) => c3 + d4 + a + b);
    const x = a6d(m);
    assert.ok(all(x.r).includes('node compiles itself'), msg(x.r));
    assert.ok(!all(x.r).includes("no function named 'lazy'"), msg(x.r));
});
function a6e(root) {   // (e) the name test is anchored: getter / valueget are not get
    const c = mkCase(); const d = drv(c, 'a');
    return { r: run(root, c, ['--node', c.node, '--runs', '2', '--fn', 'get', d], { FAKE_BASE: 'getter valueget' }), c };
}
test('A6 (e) baseline names getter / valueget, --fn get -> exit 0 REPORTED, no "node itself compiles"', { skip }, () => {
    const x = a6e(TOOL);
    assert.equal(x.r.status, 0, msg(x.r));
    assert.ok(hasLine(x.r.stdout, 'VERDICT REPORTED'), msg(x.r));
    assert.ok(!all(x.r).includes('node itself compiles'), msg(x.r));
});
test('MUT A6 (e) `*$\'\\n\'"$fn"$\'\\n\'*` unanchored to `*"$fn"*` -> a false refusal ("node itself compiles", exit 2)', { skip }, () => {
    const m = mutant('a6e', `[[ "$BASE_NAMES" == *$'\\n'"$fn"$'\\n'* ]]`, '[[ "$BASE_NAMES" == *"$fn"* ]]');
    const x = a6e(m);
    assert.equal(x.r.status, 2, msg(x.r));
    assert.ok(all(x.r).includes('node itself compiles'), msg(x.r));
});
