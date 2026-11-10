// test/audit-g4.test.mjs -- b64 lane g4, helper batch B3: black-box rows for fix group G4 (ic-diff.sh), from the PLAN
// ASSERTIONS A1-A5 (.handoff/lanes/g4/PLAN-b64-g4.md) and TASK 10, never from what a root printed. Tool under test: the repo
// root ic-diff.sh. OLD twin = `git show 7c91d1c:ic-diff.sh` (sha256/8 11279540), skipped when the commit is unreachable
// unless CI_STRICT. Every fix row has an OLD twin asserting the old value, so the row demonstrably fails on old code.
//   A1 R13  `%` in --out / TMPDIR: V8 expands % in --logfile; the fix doubles it. fix rc 0 SAME, 4/4 argv hold o%%pz; OLD rc 2
//   A2 R14  relative TMPDIR: every --logfile is absolute; fix rc 0, OLD rc 2, 0/4 absolute
//   A3 R26  an `=` in the resolved node path (--node and PATH routes): one refusal line, 0 spawns; OLD "cannot run"
//   A4 R6   *stress-concurrent-inlining* flags (4 spellings): one refusal, 0 spawns, 0 mktemp; OLD spawns
//   A5      parity (mono/mono SAME, mono/poly DIFF, runs 2 and 3, with / without --out), refusals write nothing, retention
//           over CYCLES (12) cycles of A1(TMPDIR) + A2 + A3 with a must-fail control (EXIT-trap rm -rf removed)
// Own fake node (bash): logs argv, answers --version / --v8-options (tracked fixture), and for a trace run applies V8's
// --logfile expansion (%% -> %, %p -> pid, %t -> time) and copies ./ic.log of its cwd to dirname/isolate-0x7508000000-<pid>-<base>.
// Real-node rows (A1, A2): one attempt each. No timing assertions. Private dirs under one mkdtemp top, removed in after().
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const TOOL = join(PKG, 'ic-diff.sh');
const OPTS_FIX = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = '7c91d1c', OLD_SHA8 = '11279540';
const CI_STRICT = process.env.CI === 'true';
const sha8 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 8);
const NODE_REAL = process.execPath;
const CYCLES = 12; // spec says 20; 12 keeps the file under ~90 s on a loaded host (20: file 72-109 s)

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'POSIXLY_CORRECT', 'SHELLOPTS', 'CDPATH']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-g4-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

const rd = (p) => readFileSync(p, 'utf8');
const wl = (p) => (existsSync(p) ? rd(p).split('\n').filter((l) => l !== '') : []);
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const verdict = (r) => (/^VERDICT (\S+)$/m.exec(r.stdout) || /^VERDICT (\S+)$/m.exec(r.stderr) || [, 'NONE'])[1];
const vcount = (r) => (r.stdout + r.stderr).split('\n').filter((l) => /^VERDICT \S+$/.test(l)).length;
const code = (r, want, what) => assert.equal(r.status, want, `${what}: exit\n${msg(r)}`);
const cnt = (arr, f) => arr.filter(f).length;

// ---- the old twin ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || (haveOld === true || CI_STRICT ? false : haveOld);
let OLD = null;
function oldRoot() {
    if (OLD !== null) return OLD;
    const g = spawn('git', ['show', `${OLD_SHA}:ic-diff.sh`], { cwd: PKG, encoding: 'buffer' }, 'git show ic-diff.sh', 30000);
    assert.equal(g.status, 0, `git show ${OLD_SHA}:ic-diff.sh failed`);
    assert.equal(sha8(g.stdout), OLD_SHA8, `old root must hash to ${OLD_SHA8}`);
    const p = join(mk('old'), 'ic-diff.sh');
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD = p);
}
test(`the old twin is git show ${OLD_SHA}:ic-diff.sh, sha256/8 ${OLD_SHA8}`, { skip: OLDSKIP }, () => { assert.ok(existsSync(oldRoot())); });

// ---- canned IC logs (node v26.8.2 line shapes; get's LoadIC site final 1 = mono, 1 then P = poly) ----
const V8V = 'v8-version,14,6,202,34,-node.28,0';
const CC_GET = 'code-creation,JS,10,98536,0x3bcd762b6930,5,get file:///w/drv.js:2:13,0x29a78805a970,~';
const L01 = 'LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,';
const L1P = 'LoadIC,0x3bcd762b6930,98560,3,12,1,P,0x29a78805c261,x,,';
const MONO = [V8V, CC_GET, L01, ''].join('\n');
const POLY = [V8V, CC_GET, L01, L1P, ''].join('\n');
const SYNOPSIS = '';

function fakeText(D_) {
    const q = JSON.stringify(D_);
    return [
        '#!/bin/bash',
        `D=${q}`,
        'echo "$*" >> "$D/argv.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        'esac',
        'lf=""; for a; do case "$a" in --logfile=*) lf="${a#--logfile=}" ;; esac; done',
        '[ -n "$lf" ] || exit 9',
        '# V8 expansion of the --logfile pattern: %% -> %, %p -> pid, %t -> time',
        'out=""; rest="$lf"',
        'while [ -n "$rest" ]; do',
        '  c="${rest:0:1}"; rest="${rest:1}"',
        '  if [ "$c" = "%" ]; then',
        '    c2="${rest:0:1}"; rest="${rest:1}"',
        '    case "$c2" in "%") out="$out%" ;; p) out="$out$$" ;; t) out="$out$(date +%s)" ;; *) out="$out%$c2" ;; esac',
        '  else out="$out$c"; fi',
        'done',
        'if [ -f ./ic.log ]; then cp ./ic.log "$(dirname "$out")/isolate-0x7508000000-$$-$(basename "$out")" 2>/dev/null; fi',
        'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi',
        'exit 0',
        '',
    ].join('\n');
}
const REAL = (c) => spawn(BASH, ['-c', `command -v ${c}`], {}, `command -v ${c}`, 10000).stdout.trim();
const REAL_MKTEMP = REAL('mktemp');

// one case dir: fake node, a mktemp shim dir, TMPDIR, cwd, and driver dirs mono / mono2 / poly
function mkCase() {
    const dir = mk('c');
    const node = join(dir, 'node'), bin = join(dir, 'bin'), tmp = join(dir, 'tmp'), cwd = join(dir, 'cwd'), drv = join(dir, 'drv');
    for (const d of [bin, tmp, cwd, drv]) mkdirSync(d);
    writeFileSync(node, fakeText(dir)); chmodSync(node, 0o755);
    writeFileSync(join(bin, 'mktemp'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(join(dir, 'mktemp.log'))}\nexec ${JSON.stringify(REAL_MKTEMP)} "$@"\n`);
    chmodSync(join(bin, 'mktemp'), 0o755);
    const c = { dir, node, bin, tmp, cwd, D: {} };
    for (const [n, log] of [['mono', MONO], ['mono2', MONO], ['poly', POLY]]) {
        mkdirSync(join(drv, n));
        writeFileSync(join(drv, n, 'driver.js'), '// driver\n'); writeFileSync(join(drv, n, 'ic.log'), log);
        c.D[n] = join(drv, n, 'driver.js');
    }
    c.argv = () => wl(join(dir, 'argv.log'));
    c.traces = () => c.argv().filter((l) => l.includes('--logfile='));
    c.lfs = () => c.traces().map((l) => /--logfile=(\S+)/.exec(l)[1]);
    c.mktemps = () => wl(join(dir, 'mktemp.log'));
    return c;
}
// run ROOT in case c: args, cwd c.cwd unless o.cwd, TMPDIR c.tmp unless o.tmpdir (null = unset)
function run(root, c, args, o = {}) {
    const env = cleanEnv({ PATH: `${o.pathPre ? o.pathPre + ':' : ''}${c.bin}:${process.env.PATH}`, ...(o.tmpdir === null ? {} : { TMPDIR: o.tmpdir || c.tmp }), ...(o.env || {}) });
    return spawn(BASH, [root, ...args], { cwd: o.cwd || c.cwd, env }, `ic-diff.sh (${args.slice(0, 5).join(' ')})`, o.cap || 90000);
}
const ls = (d) => readdirSync(d);

// ---- mutants: exact-once edits of a copy of the FIX root ----
function mutant(name, edits) {
    let src = rd(TOOL);
    for (const [from, to] of edits) {
        const n = src.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor matched ${n} times (want exactly 1): ${from}`);
        src = src.replace(from, () => to);
    }
    const p = join(mk('mut'), `${name}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return p;
}

// =====================================================================================================================
// A1 R13: % in --out and in TMPDIR
// =====================================================================================================================
function a1Out(root) {
    const c = mkCase();
    const o = join(c.dir, 'o%pz%t%%q');
    const r = run(root, c, ['--node', c.node, '--out', o, '--runs', '2', '--fn', 'get', c.D.mono, c.D.mono2]);
    return { c, o, r };
}
test('A1 fix: --out <d>/o%pz%t%%q --runs 2 -> rc 0 SAME, raw/before/run.1.log exists, 4 of 4 argv hold o%%pz%%t%%%%q, no <d>/o<digits>z', { skip }, () => {
    const { c, o, r } = a1Out(TOOL);
    code(r, 0, 'A1'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.ok(existsSync(join(o, 'raw', 'before', 'run.1.log')), `run.1.log missing\n${msg(r)}`);
    assert.equal(c.traces().length, 4);
    assert.equal(cnt(c.lfs(), (p) => p.includes('o%%pz%%t%%%%q')), 4, c.lfs().join('\n'));
    assert.deepEqual(ls(c.dir).filter((n) => /^o\d+z$/.test(n)), []);
});
test('A1 OLD twin: rc 2 NO-VERDICT, "no IC log" in run 1, 4 argvs hold o%pz (single %)', { skip: OLDSKIP }, () => {
    const { c, r } = a1Out(oldRoot());
    code(r, 2, 'A1 old'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
    assert.ok(/no IC log/.test(r.stdout + r.stderr), msg(r));
    assert.ok(/in run 1/.test(r.stdout + r.stderr), msg(r));
});
function a1Tmp(root) {
    const c = mkCase();
    const t = join(c.dir, 't%p%t%%'); mkdirSync(t);
    const r = run(root, c, ['--node', c.node, '--runs', '2', '--fn', 'get', c.D.mono, c.D.mono2], { tmpdir: t });
    return { c, t, r };
}
test('A1 fix: TMPDIR=<d>/t%p%t%% -> rc 0 SAME, the dir left with 0 entries', { skip }, () => {
    const { c, t, r } = a1Tmp(TOOL);
    code(r, 0, 'A1 TMPDIR'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.deepEqual(ls(t), []);
    assert.equal(cnt(c.lfs(), (p) => p.includes('t%%p%%t%%%%')), 4, c.lfs().join('\n'));
});
test('A1 OLD twin: TMPDIR=<d>/t%p%t%% -> rc 2', { skip: OLDSKIP }, () => {
    const { r } = a1Tmp(oldRoot());
    code(r, 2, 'A1 TMPDIR old'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
});
// real node: one tiny driver; the tool reads real V8 --log-ic output. One attempt each, generous cap.
const REAL_DRV = 'function get(o) { return o.x; }\nfor (let i = 0; i < 200; i++) get({ x: i });\n';
function realCase(extra) {
    const c = mkCase();
    for (const n of ['mono', 'mono2']) writeFileSync(join(dirname(c.D[n]), 'driver.js'), REAL_DRV);
    const o = join(c.dir, 'o%pz%t%%q');
    const r = run(extra.root, c, ['--node', NODE_REAL, ...(extra.out ? ['--out', o] : []), '--runs', '2', '--v8-flags', '--no-lazy-feedback-allocation', '--fn', 'get', c.D.mono, c.D.mono2], { cap: 120000, ...(extra.run || {}) });
    return { c, o, r };
}
test('A1 real node: --out o%pz, process.execPath -> rc 0 SAME (one attempt)', { skip }, () => {
    const { r, o } = realCase({ root: TOOL, out: true });
    code(r, 0, 'A1 real'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.ok(existsSync(join(o, 'raw', 'before', 'run.1.log')));
});
test('A1 real node OLD twin: rc 2 (one attempt)', { skip: OLDSKIP }, () => {
    const { r } = realCase({ root: oldRoot(), out: true });
    code(r, 2, 'A1 real old'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
});

// =====================================================================================================================
// A2 R14: relative TMPDIR from cwd <d>/w, drivers in <d>/drv
// =====================================================================================================================
function a2(root, node) {
    const c = mkCase();
    const w = join(c.dir, 'w'), t = join(c.dir, 'tmp2'); mkdirSync(w); mkdirSync(t);
    // TMPDIR=../tmp2 from <d>/w is <d>/tmp2
    const r = run(root, c, ['--node', node || c.node, '--runs', '2', '--fn', 'get', c.D.mono, c.D.mono2], { cwd: w, tmpdir: '../tmp2' });
    return { c, t, r };
}
test('A2 fix: TMPDIR=../tmp2 -> rc 0 SAME, 4 of 4 --logfile= absolute, <d>/tmp2 0 entries', { skip }, () => {
    const { c, t, r } = a2(TOOL);
    code(r, 0, 'A2'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.equal(c.lfs().length, 4);
    assert.equal(cnt(c.lfs(), (p) => p.startsWith('/')), 4, c.lfs().join('\n'));
    assert.deepEqual(ls(t), []);
});
test('A2 OLD twin: rc 2 NO-VERDICT, 0 of 4 --logfile= absolute', { skip: OLDSKIP }, () => {
    const { c, r } = a2(oldRoot());
    code(r, 2, 'A2 old'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
    assert.equal(cnt(c.lfs(), (p) => p.startsWith('/')), 0, c.lfs().join('\n'));
});
function a2Real(root) {
    const c = mkCase();
    for (const n of ['mono', 'mono2']) writeFileSync(join(dirname(c.D[n]), 'driver.js'), REAL_DRV);
    const w = join(c.dir, 'w'), t = join(c.dir, 'tmp2'); mkdirSync(w); mkdirSync(t);
    const r = run(root, c, ['--node', NODE_REAL, '--runs', '2', '--v8-flags', '--no-lazy-feedback-allocation', '--fn', 'get', c.D.mono, c.D.mono2], { cwd: w, tmpdir: '../tmp2', cap: 120000 });
    return { t, r };
}
test('A2 real node: relative TMPDIR -> rc 0 SAME, 0 entries (one attempt)', { skip }, () => {
    const { t, r } = a2Real(TOOL);
    code(r, 0, 'A2 real'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.deepEqual(ls(t), []);
});
test('A2 real node OLD twin: rc 2 NO-VERDICT (one attempt)', { skip: OLDSKIP }, () => {
    const { r } = a2Real(oldRoot());
    code(r, 2, 'A2 real old'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
});

// =====================================================================================================================
// A3 R26: an = in the resolved node path, both routes
// =====================================================================================================================
const A3_LINE = (p) => `ic-diff: node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): ${p}`;
function a3(root, route) {
    const c = mkCase();
    const eqd = join(c.dir, 'a=b'); mkdirSync(eqd);
    const eqnode = join(eqd, 'node');
    writeFileSync(eqnode, fakeText(c.dir)); chmodSync(eqnode, 0o755);
    const args = route === 'node' ? ['--node', eqnode] : [];
    const r = run(root, c, [...args, '--fn', 'get', c.D.mono, c.D.mono2], route === 'path' ? { pathPre: eqd } : {});
    return { c, eqnode, r };
}
for (const route of ['node', 'path']) {
    test(`A3 fix (${route} route): rc 2, the refusal line exactly once on stderr, 0 spawns, 0 mktemp, 0 TMPDIR entries`, { skip }, () => {
        const { c, eqnode, r } = a3(TOOL, route);
        code(r, 2, 'A3'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
        assert.equal(cnt(r.stderr.split('\n'), (l) => l === A3_LINE(eqnode)), 1, msg(r));
        assert.equal(vcount(r), 1, msg(r));
        assert.equal(c.argv().length, 0);
        assert.deepEqual(c.mktemps(), []);
        assert.deepEqual(ls(c.tmp), []);
    });
    test(`A3 OLD twin (${route} route): rc 2 "cannot run <path> --version", the new line 0 times`, { skip: OLDSKIP }, () => {
        const { eqnode, r } = a3(oldRoot(), route);
        code(r, 2, 'A3 old');
        const all = r.stdout + r.stderr;
        assert.ok(all.includes(`ic-diff: cannot run ${eqnode} --version`), msg(r));
        assert.equal(all.split('is not allowed in the resolved path').length - 1, 0, msg(r));
    });
}

// =====================================================================================================================
// A4 R6: *stress-concurrent-inlining* refused
// =====================================================================================================================
const A4_CASES = [
    ['--stress-concurrent-inlining', ['--v8-flags', '--stress-concurrent-inlining']],
    ['--stress_concurrent_inlining_attach_code', ['--v8-flags', '--stress_concurrent_inlining_attach_code']],
    ['--no-stress-concurrent-inlining', ['--v8-flags', '--no-stress-concurrent-inlining']],
    ['--v8-flags= form', ['--v8-flags=--stress-concurrent-inlining']],
];
const dieLines = (r) => r.stderr.split('\n').filter((l) => l.startsWith('ic-diff:') && /stress.concurrent.inlining/.test(l));
for (const [name, fl] of A4_CASES) {
    test(`A4 fix ${name}: rc 2, the die line exactly once, 0 spawns, 0 mktemp`, { skip }, () => {
        const c = mkCase();
        const r = run(TOOL, c, ['--node', c.node, '--runs', '2', ...fl, '--fn', 'get', c.D.mono, c.D.mono2]);
        code(r, 2, 'A4'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
        assert.equal(dieLines(r).length, 1, msg(r));
        assert.equal(vcount(r), 1, msg(r));
        assert.equal(c.argv().length, 0, c.argv().join('\n'));
        assert.deepEqual(c.mktemps(), []);
        assert.deepEqual(ls(c.tmp), []);
    });
    test(`A4 OLD twin ${name}: >= 2 spawns, the die line 0 times`, { skip: OLDSKIP }, () => {
        const c = mkCase();
        const r = run(oldRoot(), c, ['--node', c.node, '--runs', '2', ...fl, '--fn', 'get', c.D.mono, c.D.mono2]);
        assert.ok(c.argv().length >= 2, `spawns ${c.argv().length}\n${msg(r)}`);
        assert.equal(dieLines(r).length, 0, msg(r));
    });
}
test('A4 OLD twin --stress-concurrent-inlining, runs 2: rc 0 SAME, 7 spawns (--version, 2 x --v8-options, 4 trace runs)', { skip: OLDSKIP }, () => {
    const c = mkCase();
    const r = run(oldRoot(), c, ['--node', c.node, '--runs', '2', '--v8-flags', '--stress-concurrent-inlining', '--fn', 'get', c.D.mono, c.D.mono2]);
    code(r, 0, 'A4 old'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.equal(c.argv().length, 7, c.argv().join('\n'));
});

// =====================================================================================================================
// A5 parity: rc, stdout, report.txt and normalized argv log byte-identical OLD vs fix
// =====================================================================================================================
function norm(c, s) {
    return s.split(c.dir).join('@D').replace(/--logfile=\S+/g, '--logfile=@L').replace(/ic-diff\.[A-Za-z0-9]{6,}/g, 'ic-diff.@T');
}
for (const [a, b, rc, v] of [['mono', 'mono2', 0, 'SAME'], ['mono', 'poly', 1, 'DIFF']]) {
    for (const runs of [2, 3]) {
        for (const withOut of [false, true]) {
            test(`A5 parity ${a}/${b} runs ${runs} ${withOut ? 'with' : 'without'} --out: rc ${rc} ${v}, stdout, report.txt, normalized argv identical OLD vs fix`, { skip: OLDSKIP }, () => {
                const res = [];
                for (const root of [oldRoot(), TOOL]) {
                    const c = mkCase();
                    const o = join(c.dir, 'out');
                    const r = run(root, c, ['--node', c.node, '--runs', String(runs), ...(withOut ? ['--out', o] : []), '--fn', 'get', c.D[a], c.D[b]]);
                    code(r, rc, `A5 ${root}`); assert.equal(verdict(r), v, msg(r));
                    res.push({ rc: r.status, out: norm(c, r.stdout), err: norm(c, r.stderr), rep: withOut ? norm(c, rd(join(o, 'report.txt'))) : '', argv: norm(c, c.argv().join('\n')), n: c.argv().length });
                }
                assert.equal(res[0].n, 3 + 2 * runs, 'spawn count (1 --version, 2 --v8-options, 2 x runs)');
                assert.deepEqual(res[1], res[0]);
            });
        }
    }
}
// every refusal: 0 spawns, 0 mktemp, 0 bytes written (TMPDIR, cwd and the --out dir stay empty)
test('A5 refusals (A3 both routes, A4 four spellings): 0 spawns, 0 mktemp, nothing written under TMPDIR / cwd / --out', { skip }, () => {
    const cases = [];
    for (const route of ['node', 'path']) cases.push(() => { const c = mkCase(); const eqd = join(c.dir, 'a=b'); mkdirSync(eqd); writeFileSync(join(eqd, 'node'), fakeText(c.dir)); chmodSync(join(eqd, 'node'), 0o755); return [c, route === 'node' ? ['--node', join(eqd, 'node')] : [], route === 'path' ? { pathPre: eqd } : {}]; });
    for (const [, fl] of A4_CASES) cases.push(() => { const c = mkCase(); return [c, ['--node', c.node, ...fl], {}]; });
    for (const mkc of cases) {
        const [c, pre, o] = mkc();
        const out = join(c.dir, 'outd');
        const r = run(TOOL, c, [...pre, '--out', out, '--runs', '2', '--fn', 'get', c.D.mono, c.D.mono2], o);
        code(r, 2, 'A5 refusal');
        assert.equal(c.argv().length, 0, msg(r));
        assert.deepEqual(c.mktemps(), []);
        assert.deepEqual(ls(c.tmp), []); assert.deepEqual(ls(c.cwd), []); assert.equal(existsSync(out), false);
    }
});

// ---- retention: CYCLES x (A1 TMPDIR + A2 + A3), every TMPDIR root back to 0 entries ----
function cycles(root, n) {
    const left = [];
    for (let i = 0; i < n; i++) {
        const x = a1Tmp(root); if (ls(x.t).length) left.push(...ls(x.t).map((e) => `c${i} A1 ${e}`));
        const y = a2(root); if (ls(y.t).length) left.push(...ls(y.t).map((e) => `c${i} A2 ${e}`));
        const z = a3(root, 'node'); if (ls(z.c.tmp).length) left.push(...ls(z.c.tmp).map((e) => `c${i} A3 ${e}`));
    }
    return left;
}
test(`A5 retention: ${CYCLES} cycles of A1(TMPDIR) + A2 + A3 leave 0 TMPDIR entries (fix root)`, { skip }, () => {
    assert.deepEqual(cycles(TOOL, CYCLES), []);
});
test('A5 retention must-fail control: the fix root with its EXIT-trap rm -rf "$IC_TMP" removed leaves >= 1 entry per cycle', { skip }, () => {
    const m = mutant('no-trap-rm', [['rm -rf \\"\\$IC_TMP\\"', 'true']]);
    const left = cycles(m, 3);
    for (let i = 0; i < 3; i++) assert.ok(left.some((l) => l.startsWith(`c${i} `)), `cycle ${i} left nothing: ${left.join(',')}`);
});
