// test/audit-g0.test.mjs -- b58 unit G0 (.handoff/PLAN-b58-g0.md ASSERTIONS G-T2 .. G-T5 + the Mutants; G-T1 is in
// tracked.test.mjs, G-T3b in shlib.test.mjs).
// Oracle: the PLAN assertions, never what a root printed. Old code = the 57b93d1 roots (git history; a missing commit
// SKIPS locally and FAILS under CI=true). Hashes are node's own. Every row is a check(root) -> null | why function, so the same
// check is the live row (must be null), the old-root twin (must-fail rows: non-null) and the mutant row (non-null).
//   G-T2a ibd real node, after-driver process.exit(3): the report ends with the die line + one VERDICT NO-VERDICT (twin: old has 0)
//   G-T2b ibd wrong driver count: the report stays 0 bytes (parity old / live)
//   G-T2c die fragment: subshell guard, REPORT=/dev/null, REPORT unset, an unwritable report
//   G-T3a allocation-diff, a backslash in the driver dir: head sha256/8 == node's slice (twin only where the host tool escapes)
//   G-T4  five tools x {POSIXLY_CORRECT=1, POSIXLY_CORRECT=, SHELLOPTS=posix}: -h; one real allocation-diff --zero row
//         (the twin and the `set +o posix` mutant exist on bash major < 4 only)
//   G-T5  bytecode-budget / deopt-diff --driver import check: comments refused, real imports accepted, known limits pinned
// Results: bash 3.2 macOS host only (CI legs bash 5 / uutils / other nodes are not claimed here).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync, chmodSync, realpathSync, statSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync: yield once BEFORE each test so the previous report flushes (b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const OLD_SHA = '57b93d1';
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const IBD = 'inlining-budget-diff.sh', ALLOC = 'allocation-diff.sh', BB = 'bytecode-budget.sh', DD = 'deopt-diff.sh', IC = 'ic-diff.sh';
const FIVE = [BB, DD, IC, ALLOC, IBD];

// child env: no inherited steering of git / node / bash / editors; no global git config; V8 coverage undefined (a delete is not a strip)
function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'POSIXLY_CORRECT', 'SHELLOPTS', 'GREP_OPTIONS', 'NODE_TEST_CONTEXT', 'OUTDIR']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const ENV = cleanEnv();

let TOP = null;
let seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-g0-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

function git(cwd, args) {
    const r = capSync('git', args, { cwd, encoding: 'utf8', env: ENV }, 30000, `git ${args[0]}`);
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: ENV, ...opts }, cap, what);
const nodeSha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

// host facts
const BASH_MAJOR = Number(spawn(BASH, ['-c', 'echo ${BASH_VERSINFO[0]}'], {}, 'bash major').stdout.trim());
assert.ok(BASH_MAJOR >= 3, `bash major ${BASH_MAJOR}`);
const OLD_BASH = BASH_MAJOR < 4;           // old-code posix failures exist only on bash < 4 (macOS leg)
const posixSkip = OLD_BASH ? false : `bash major ${BASH_MAJOR} >= 4: branch B passes on old code by design (runs on bash < 4 only: the macOS /bin/bash leg)`;
let FOLD = null;
function folds() {
    if (FOLD === null) { const d = mk('fold'); writeFileSync(join(d, 'Thing.js'), 'x\n'); FOLD = existsSync(join(d, 'thing.js')); }
    return FOLD;
}

// ---- old roots (git history) ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: ROOT }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || histSkip(haveOld);
let OLD = null;
function oldRoots() {
    if (haveOld !== true) assert.fail(`${haveOld} (CI=true: a history row fails, never skips)`);
    if (OLD !== null) return OLD;
    const d = mk('old');
    for (const f of FIVE) {
        const g = spawn('git', ['show', `${OLD_SHA}:${f}`], { cwd: ROOT, maxBuffer: 1 << 26 }, `git show ${f}`, 30000);
        assert.equal(g.status, 0, g.stderr);
        writeFileSync(join(d, f), g.stdout);
    }
    return (OLD = d);
}

// ---- mutant builds: a private copy of build.sh + src + lib, one lib file edited once (anchor must match exactly once) ----
const MUT = new Map();
function mutant(id, lib, from, to) {
    if (MUT.has(id)) return MUT.get(id);
    const d = mk(`mut-${id}`);
    cpSync(join(ROOT, 'build.sh'), join(d, 'build.sh'));
    cpSync(join(ROOT, 'src'), join(d, 'src'), { recursive: true });
    cpSync(join(ROOT, 'lib'), join(d, 'lib'), { recursive: true });
    const p = join(d, 'lib', lib);
    const t = readFileSync(p, 'utf8');
    const n = t.split(from).length - 1;
    assert.equal(n, 1, `${id}: anchor ${JSON.stringify(from)} must match exactly once in lib/${lib}, matched ${n}`);
    writeFileSync(p, t.replace(from, () => to));
    const out = mk(`mut-out-${id}`);
    const r = spawn('bash', ['build.sh', out], { cwd: d }, `bash build.sh (mutant ${id})`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const res = { out, lib: join(d, 'lib') };
    MUT.set(id, res);
    return res;
}
const live = { out: ROOT, lib: join(ROOT, 'lib') };
const NOMUT = process.env.AUDIT_G0_NESTED === '1' ? 'nested run' : false;

// ================================================================= G-T2: the report gets the die line only with a head
const D1 = 'function m0(a) { return a + 1; }\nfunction outer(x) { return m0(x) + m0(x); }\nlet s = 0;\nfor (let i = 0; i < 200000; i++) s += outer(i);\nif (s === 1) console.log(s);\n';
let G2 = null;
function g2fix() {
    if (G2 !== null) return G2;
    const d = mk('g2'); const a = join(d, 'd1.mjs'), b = join(d, 'd2.mjs');
    writeFileSync(a, D1); writeFileSync(b, D1 + 'process.exit(3);\n');
    return (G2 = { d, a, b });
}
const lines = (s) => s.split('\n');
const verdictLines = (s) => lines(s).filter((l) => l.includes('VERDICT'));
function ibdRun(root, args) {
    const g = g2fix(); const o = mk('g2out');
    const r = spawn(BASH, [join(root, IBD), '--runs', '2', '--out', o, '--node', process.execPath, ...args], { cwd: g.d }, `ibd ${args.length} driver(s)`, 120000);
    return { r, report: readFileSync(join(o, 'report.txt'), 'utf8') };
}
// G-T2a: null when the report holds the die reason line, ends with exactly one `VERDICT NO-VERDICT`, and the run exit was 2
function g2a(root) {
    const g = g2fix();
    const { r, report } = ibdRun(root, [g.a, g.b]);
    if (r.status !== 2) return `exit ${r.status}, want 2: ${r.stderr.slice(-300)}`;
    const reason = lines(r.stderr).find((l) => l.startsWith('inlining-budget-diff: driver exited non-zero:'));
    if (reason === undefined) return `no die reason line on stderr: ${r.stderr.slice(-300)}`;
    const nonEmpty = lines(report).filter((l) => l !== '');
    if (nonEmpty[nonEmpty.length - 1] !== 'VERDICT NO-VERDICT') return `report's last non-empty line is ${JSON.stringify(nonEmpty[nonEmpty.length - 1])}, want "VERDICT NO-VERDICT"`;
    const nv = verdictLines(report).length;
    if (nv !== 1) return `report holds ${nv} VERDICT lines, want exactly 1`;
    if (!lines(report).includes(reason)) return `the die reason line is not in the report: ${JSON.stringify(reason)}`;
    return null;
}
// G-T2b: a die before the head (one DRIVER: wrong driver count, after mkdir) leaves the report at 0 bytes; stderr has the one die line
function g2b(root) {
    const g = g2fix();
    const { r, report } = ibdRun(root, [g.a]);
    if (r.status !== 2) return `exit ${r.status}, want 2`;
    if (!r.stderr.includes('inlining-budget-diff: need DRIVER_BEFORE DRIVER_AFTER')) return `no wrong-driver-count die on stderr: ${r.stderr.slice(-300)}`;
    if (report !== '') return `report is ${report.length} bytes, want 0: ${JSON.stringify(report.slice(0, 200))}`;
    return null;
}
test('G-T2a ibd real node, after-driver process.exit(3): exit 2, die reason in the report, it ends with ONE `VERDICT NO-VERDICT`', { skip }, () => {
    assert.equal(g2a(live.out), null);
});
test(`G-T2a twin: the ${OLD_SHA} ibd report has 0 VERDICT lines in the same run (red on old: no die line reaches the report)`, { skip: OLDSKIP }, () => {
    const g = g2fix();
    const { r, report } = ibdRun(oldRoots(), [g.a, g.b]);
    assert.equal(r.status, 2, r.stderr.slice(-300));
    assert.equal(verdictLines(report).length, 0, `old report: ${report.slice(-300)}`);
    assert.notEqual(g2a(oldRoots()), null, 'the G-T2a check must be red on the old root');
});
test('G-T2b ibd die before the head (one DRIVER): the report stays 0 bytes', { skip }, () => {
    assert.equal(g2b(live.out), null);
});
test(`G-T2b parity: the ${OLD_SHA} ibd also leaves a 0-byte report (pin)`, { skip: OLDSKIP }, () => {
    assert.equal(g2b(oldRoots()), null);
});

// G-T2c: the die fragment of a lib/common.sh, in a shell of its own
function dieText(libDir) {
    const t = readFileSync(join(libDir, 'common.sh'), 'utf8').split('\n');
    const s = t.findIndex((l) => l.startsWith('die() {'));
    assert.ok(s >= 0, 'no die() in lib/common.sh');
    const e = t.findIndex((l, i) => i > s && l === '}');
    assert.ok(e > s, 'die() has no closing }');
    return t.slice(s, e + 1).join('\n').replaceAll('@SCRIPT@', 'tool');
}
const DIE_ERR = 'tool: boom\nVERDICT NO-VERDICT\n';
function dieRun(libDir, body, report, extra = {}) {
    const p = join(mk('die'), 'h.sh');
    writeFileSync(p, `${dieText(libDir)}\n${body}\n`);
    return spawn(BASH, [p, report], { env: cleanEnv(extra) }, 'die fragment', 30000);
}
function g2c(libDir) {
    const rep = (name, content) => { const f = join(mk('rep'), name); writeFileSync(f, content); return f; };
    // subshell: a command substitution calling die leaves a non-empty report unchanged (the guard), the shell survives
    let f = rep('r1.txt', 'HEAD\n');
    let r = dieRun(libDir, 'REPORT="$1"\nx=$(die boom) || true\necho survived', f);
    if (r.stdout !== 'survived\n') return `subshell die: the main shell did not survive: ${JSON.stringify(r.stdout)} ${r.stderr}`;
    if (readFileSync(f, 'utf8') !== 'HEAD\n') return `subshell die changed the report: ${JSON.stringify(readFileSync(f, 'utf8'))}`;
    // the main shell: appends the exact two lines once, exit 2, same two lines on stderr
    f = rep('r2.txt', 'HEAD\n');
    r = dieRun(libDir, 'REPORT="$1"\ndie boom', f);
    if (r.status !== 2 || r.stderr !== DIE_ERR) return `main-shell die: exit ${r.status} stderr ${JSON.stringify(r.stderr)}`;
    if (readFileSync(f, 'utf8') !== `HEAD\n${DIE_ERR}`) return `main-shell die: report ${JSON.stringify(readFileSync(f, 'utf8'))}`;
    // a 0-byte report stays 0 bytes
    f = rep('r3.txt', '');
    r = dieRun(libDir, 'REPORT="$1"\ndie boom', f);
    if (r.status !== 2 || r.stderr !== DIE_ERR || statSync(f).size !== 0) return `0-byte report: exit ${r.status} size ${statSync(f).size} stderr ${JSON.stringify(r.stderr)}`;
    // REPORT=/dev/null and REPORT unset (also under set -u): no extra error, exit 2
    for (const body of ['REPORT=/dev/null\ndie boom', 'unset REPORT\ndie boom', 'set -u\nunset REPORT\ndie boom']) {
        r = dieRun(libDir, body, '/dev/null');
        if (r.status !== 2 || r.stderr !== DIE_ERR || r.stdout !== '') return `${JSON.stringify(body)}: exit ${r.status} stderr ${JSON.stringify(r.stderr)}`;
    }
    return null;
}
function g2cUnwritable(libDir) {
    const f = join(mk('rep'), 'ro.txt'); writeFileSync(f, 'HEAD\n'); chmodSync(f, 0o444);
    const r = dieRun(libDir, 'REPORT="$1"\ndie boom', f);
    if (r.status !== 2 || r.stderr !== DIE_ERR) return `unwritable report: exit ${r.status} stderr ${JSON.stringify(r.stderr)}`;
    if (readFileSync(f, 'utf8') !== 'HEAD\n') return 'unwritable report changed';
    return null;
}
test('G-T2c die fragment: subshell leaves a non-empty report unchanged; main shell appends once; 0 bytes stays 0; /dev/null and unset REPORT exit 2 quietly', { skip }, () => {
    assert.equal(g2c(live.lib), null);
});
test('G-T2c die fragment: an unwritable report still exits 2 with the reason on stderr (non-root hosts)', { skip: skip || (process.getuid && process.getuid() === 0 ? 'root can write a 0444 file (runs as non-root only)' : false) }, () => {
    assert.equal(g2cUnwritable(live.lib), null);
});

// ================================================================= G-T3a: sha8 of a driver in a dir with a backslash
const ZERO_DRV = "const fs = require('fs');\nif (process.env.PC_OUT) fs.writeFileSync(process.env.PC_OUT, String(process.env.POSIXLY_CORRECT));\nlet s = 0;\n" +
    "fs.writeSync(1, '@@LITE-MARK start\\n');\nfor (let i = 0; i < 300000; i++) s = (s + i) | 0;\nfs.writeSync(1, '@@LITE-MARK end\\n');\nglobalThis.sink = s;\n";
let G3 = null;
function g3fix() {
    if (G3 !== null) return G3;
    const d = join(mk('g3'), 'a\\b'); mkdirSync(d);
    const f = join(d, 'driver.js'); writeFileSync(f, ZERO_DRV);
    return (G3 = { d, f, want: nodeSha8(readFileSync(f)) });
}
function g3run(root) {
    const g = g3fix();
    const r = spawn(BASH, [join(root, ALLOC), '--node', process.execPath, '--runs', '2', '--zero', g.f], { cwd: g.d, env: cleanEnv({ PATH: '/usr/bin:/bin' }) }, 'allocation-diff (backslash dir)', 120000);
    const m = /^driver  .*  sha256\/8 (\S+)$/m.exec(r.stdout);
    return { r, head: m === null ? null : m[1] };
}
function g3a(root) {
    const g = g3fix();
    const { r, head } = g3run(root);
    if (head !== g.want) return `head sha256/8 ${JSON.stringify(head)}, want ${g.want} (node): ${(r.stdout + r.stderr).slice(0, 300)}`;
    return null;
}
// does this host's sha tool escape the name (so the old head is wrong)? decided by running the OLD root
function hostEscapes() { return g3a(oldRoots()) !== null; }
test('G-T3a allocation-diff, driver dir with a backslash, PATH=/usr/bin:/bin: head sha256/8 == node\'s sha256 slice of the driver', { skip }, () => {
    assert.equal(g3a(live.out), null);
});
test(`G-T3a twin: the ${OLD_SHA} root's head differs from node's slice (red on old; only where the host sha tool escapes)`, { skip: OLDSKIP }, (t) => {
    if (!hostEscapes()) return t.skip('G-T3a twin: this host\'s sha tool does not escape a backslash name (runs where it does: macOS shasum)');
    const { head } = g3run(oldRoots());
    assert.notEqual(head, g3fix().want);
});

// ================================================================= G-T4: inherited posix mode
const TOOLS = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.sh')).sort();
test('G-T4 the tools of src/*.sh are exactly the five roots', { skip }, () => {
    assert.deepEqual(TOOLS, [ALLOC, BB, DD, IC, IBD].sort());
});
const T4ENV = [['POSIXLY_CORRECT=1', { POSIXLY_CORRECT: '1' }], ['POSIXLY_CORRECT= (empty)', { POSIXLY_CORRECT: '' }], ['SHELLOPTS=posix', { SHELLOPTS: 'posix' }]];
function t4h(root, tool, env) {
    const r = spawn(BASH, [join(root, tool), '-h'], { env: cleanEnv(env) }, `${tool} -h`, 30000);
    return r;
}
// null when `-h` exits 2, stdout starts "<tool> -- " and stderr is empty
function t4hCheck(root, tool, env) {
    const r = t4h(root, tool, env);
    if (r.status !== 2) return `exit ${r.status}, want 2: ${r.stderr.slice(0, 200)}`;
    if (!r.stdout.startsWith(`${tool} -- `)) return `stdout starts ${JSON.stringify(r.stdout.slice(0, 40))}, want "${tool} -- "`;
    if (r.stderr !== '') return `stderr not empty: ${JSON.stringify(r.stderr.slice(0, 200))}`;
    return null;
}
for (const tool of TOOLS) for (const [name, env] of T4ENV) {
    test(`G-T4 ${tool} -h under ${name}: exit 2, stdout starts "${tool} -- ", stderr empty`, { skip }, () => {
        assert.equal(t4hCheck(live.out, tool, env), null);
    });
}
test(`G-T4 twin: the ${OLD_SHA} roots exit 2 with "syntax error" on every -h under each posix env (red on old; bash < 4 only)`, { skip: skip || posixSkip || OLDSKIP }, () => {
    for (const tool of TOOLS) for (const [name, env] of T4ENV) {
        const r = t4h(oldRoots(), tool, env);
        assert.equal(r.status, 2, `${tool} ${name}`);
        assert.match(r.stderr, /syntax error/, `${tool} ${name}: ${r.stderr.slice(0, 200)}`);
        assert.notEqual(t4hCheck(oldRoots(), tool, env), null, `${tool} ${name}: the G-T4 check must be red on old`);
    }
});
// the real row: allocation-diff --runs 2 --zero under POSIXLY_CORRECT=1 -> VERDICT ZERO, and the driver saw no POSIXLY_CORRECT
function t4real(root) {
    const d = mk('t4real'); const f = join(d, 'driver.js'); writeFileSync(f, ZERO_DRV);
    const pc = join(d, 'pc.txt');
    const r = spawn(BASH, [join(root, ALLOC), '--node', process.execPath, '--runs', '2', '--zero', f], { cwd: d, env: cleanEnv({ POSIXLY_CORRECT: '1', PC_OUT: pc }) }, 'allocation-diff --zero (posix)', 120000);
    return { r, pc: existsSync(pc) ? readFileSync(pc, 'utf8') : null };
}
test('G-T4 real: allocation-diff --runs 2 --zero under POSIXLY_CORRECT=1 -> VERDICT ZERO (exit 0) and the driver sees process.env.POSIXLY_CORRECT === undefined', { skip }, () => {
    const { r, pc } = t4real(live.out);
    assert.equal(r.status, 0, r.stdout.slice(-300) + r.stderr.slice(-300));
    assert.ok(lines(r.stdout).includes('VERDICT ZERO'), r.stdout.slice(-300));
    assert.equal(pc, 'undefined');
});
test(`G-T4 real twin: the ${OLD_SHA} allocation-diff exits 2 with "syntax error" under POSIXLY_CORRECT=1 (red on old; bash < 4 only)`, { skip: skip || posixSkip || OLDSKIP }, () => {
    const { r, pc } = t4real(oldRoots());
    assert.equal(r.status, 2, r.stdout.slice(-300));
    assert.match(r.stderr, /syntax error/);
    assert.equal(pc, null, 'the driver must not have run');
});

// ================================================================= G-T5: the --driver import check (bytecode-budget, deopt-diff)
let G5 = null;
function g5fix() {
    if (G5 !== null) return G5;
    const top = mk('g5');
    const before_ = join(top, 'frozen'), after_ = join(top, 'live'), drv = join(top, 'drv');
    for (const d of [before_, after_, drv]) mkdirSync(d);
    writeFileSync(join(before_, 'mod.js'), 'export const a = 1;\n');
    writeFileSync(join(after_, 'mod.js'), 'export const a = 2;\n');
    const log = join(top, 'node.log');
    const node = join(top, 'fakenode');
    writeFileSync(node, `#!/bin/sh\n: >>'${log}'\nexit 1\n`); chmodSync(node, 0o755);
    return (G5 = { top, before_, after_, drv, log, node, n: 0 });
}
const G5ARGS = { [BB]: ['--diff', '--fn', 'mid', '--runs', '2'], [DD]: ['--fn', 'add'] };
// runs one tool in file mode on a driver text; reached = the fake node was spawned (stage_check passed); refused = the import refusal text
function g5run(root, tool, text) {
    const g = g5fix(); const n = ++g.n;
    const drv = join(g.drv, `d${n}.mjs`); writeFileSync(drv, text);
    rmSync(g.log, { force: true });
    const out = join(g.top, `out${n}`);
    const r = spawn(BASH, [join(root, tool), '--before', join(g.before_, 'mod.js'), '--after', join(g.after_, 'mod.js'), '--driver', drv, '--out', out, '--node', g.node, ...G5ARGS[tool]], { cwd: g.top }, `${tool} import check`, 60000);
    return { r, reached: existsSync(g.log), refused: r.stderr.includes("--driver must import './mod.js'") };
}
// null when the driver text is refused exactly as the spec says (exit 2, the refusal text, nothing spawned)
function g5refused(root, tool, text) {
    const x = g5run(root, tool, text);
    if (x.r.status !== 2 || !x.refused) return `not refused: exit ${x.r.status} stderr ${x.r.stderr.slice(0, 300)}`;
    if (x.reached) return 'refused but the node was spawned';
    return null;
}
// null when the import check passed (the run reached the node spawn; no import refusal)
function g5accepted(root, tool, text) {
    const x = g5run(root, tool, text);
    if (x.refused) return `refused: ${x.r.stderr.slice(0, 300)}`;
    if (!x.reached) return `neither refused nor reached the node: exit ${x.r.status} ${x.r.stderr.slice(0, 300)}`;
    return null;
}
const G5_COMMENT = ["// import { mid } from './mod.js';\n", "/* import { mid }\n   from './mod.js'; */\n"];
const G5_MENTION = "const x = './mod.js';\n";
// R2 additions (refused): not an import, a member call, a longer identifier, an import of another file then a plain mention
const G5_R2 = ["const p = Array.from('./mod.js');\n", "x.import('./mod.js');\n", "myfrom('./mod.js');\n", "import './other.js'; const x = './mod.js';\n"];
const G5_BLOCK_THEN_IMPORT = "/* c */ import './mod.js';\n";
const G5_OK = [["import {} from './mod.js';\n", 'import {} from single-quoted'], ['import {} from "./mod.js";\n', 'double-quoted'],
    ["await import('./mod.js');\n", 'await import()'], ['require("./mod.js");\n', 'require()'], ["export {a} from './mod.js';\n", 'export {a} from']];
for (const tool of [BB, DD]) {
    test(`G-T5a ${tool}: a // comment and a two-line block comment holding the import, and a plain mention (const x = './mod.js'), are refused: exit 2, "--driver must import"`, { skip }, () => {
        for (const t of [...G5_COMMENT, G5_MENTION, ...G5_R2]) assert.equal(g5refused(live.out, tool, t), null, JSON.stringify(t));
    });
    test(`G-T5a twin ${tool}: the ${OLD_SHA} root accepts both comments (reaches the node spawn, no refusal) -- red on old`, { skip: OLDSKIP }, () => {
        for (const t of G5_COMMENT) {
            assert.equal(g5accepted(oldRoots(), tool, t), null, JSON.stringify(t));
            assert.notEqual(g5refused(oldRoots(), tool, t), null, 'the G-T5a check must be red on old');
        }
    });
    test(`G-T5b ${tool}: accepted forms pass the import check (import {} / double quotes / await import() / require() / export {a} from)`, { skip }, () => {
        for (const [t, why] of G5_OK) assert.equal(g5accepted(live.out, tool, t), null, why);
        assert.equal(g5accepted(live.out, tool, G5_BLOCK_THEN_IMPORT), null, 'a one-line block comment before the import');
    });
    test(`G-T5c ${tool}: known limits pinned: a plain string "import './mod.js'" passes; an import split over two lines (name on the second) is refused`, { skip }, () => {
        assert.equal(g5accepted(live.out, tool, `const s = "import './mod.js'";\n`), null);
        assert.equal(g5refused(live.out, tool, "import {a} from\n  './mod.js';\n"), null);
    });
}

// ================================================================= Mutants (one-match anchors in the live lib/*.sh; each flips ONLY its row)
test('MUT drop `-s "${REPORT:-/dev/null}"` from die -> G-T2b red (a die before the head writes a line into the 0-byte report)', { skip: skip || NOMUT }, () => {
    const m = mutant('m-s', 'common.sh', ' && -s "${REPORT:-/dev/null}"', '');
    assert.equal(g2b(live.out), null, 'live G-T2b must be green');
    const why = g2b(m.out);
    assert.notEqual(why, null, 'mutant survived');
    assert.match(why, /report is \d+ bytes, want 0/);
});
test('MUT drop `$BASH_SUBSHELL -eq 0 && ` from die -> G-T2c red (a subshell die writes into the report)', { skip: skip || NOMUT }, () => {
    const m = mutant('m-sub', 'common.sh', '$BASH_SUBSHELL -eq 0 && ', '');
    const why = g2c(m.lib);
    assert.notEqual(why, null, 'mutant survived');
    assert.match(why, /subshell die changed the report/);
});
test('MUT drop `| tr -d \'\\\\\'` from sha8 -> G-T3a red (only where the host sha tool escapes)', { skip: skip || NOMUT }, (t) => {
    if (!hostEscapes()) return t.skip('MUT tr: this host\'s sha tool does not escape a backslash name (runs where it does: macOS shasum)');
    const m = mutant('m-tr', 'common.sh', " | tr -d '\\\\'", '');
    assert.equal(g3a(live.out), null, 'live G-T3a must be green');
    const why = g3a(m.out);
    assert.notEqual(why, null, 'mutant survived');
    t.diagnostic(`tr mutant: ${why.slice(0, 120)}`);
});
test('MUT delete the `set +o posix` line of lib/prologue.sh -> G-T4 red under POSIXLY_CORRECT=1 (bash < 4 only)', { skip: skip || NOMUT || posixSkip }, (t) => {
    const m = mutant('m-posix', 'prologue.sh', 'set +o posix   # inherited', ': # inherited');
    let red = 0;
    for (const tool of TOOLS) {
        assert.equal(t4hCheck(live.out, tool, T4ENV[0][1]), null, `live ${tool}`);
        const why = t4hCheck(m.out, tool, T4ENV[0][1]);
        if (why !== null) { red++; t.diagnostic(`posix mutant ${tool}: ${why.slice(0, 100)}`); }
    }
    assert.equal(red, TOOLS.length, 'every tool must go red on the mutant');
});
const LCC = { LC_ALL: 'C' };
// G-T1a check on a root: tracked Thing.js, is_tracked <dir>/thing.js (own copy of the tracked.test.mjs harness: that file is not importable)
function lastDef(text) {
    const L = text.split('\n'); let s = -1;
    for (let i = 0; i < L.length; i++) if (/^is_tracked\(\)/.test(L[i])) s = i;
    assert.ok(s >= 0, 'no is_tracked()');
    for (let i = s; i < L.length; i++) if (L[i] === '}') return L.slice(s, i + 1).join('\n') + '\n';
    return assert.fail('is_tracked() not closed');
}
function trackedRc(root, file, repo, name, extra = {}) {
    const p = join(mk('trk'), 'h.sh');
    writeFileSync(p, ['what=--before', 'die() { printf \'%s\\n\' "$*" >&2; exit 2; }', lastDef(readFileSync(join(root, file), 'utf8')) + 'is_tracked "$1"', 'printf \'rc=%s\\n\' "$?"', ''].join('\n'));
    const r = spawn(BASH, [p, join(repo, name)], { env: cleanEnv({ GIT_CEILING_DIRECTORIES: TOP, ...extra }) }, `is_tracked ${file}`, 30000);
    return r.status === 0 ? r.stdout : `exit ${r.status} ${r.stdout}${r.stderr}`;
}
function trackedRepo(tracked, untracked = []) {
    const d = mk('trkrepo');
    git(d, ['init', '-q']);
    for (const n of [...tracked, ...untracked]) writeFileSync(join(d, n), 'x\n');
    git(d, ['--literal-pathspecs', 'add', '--', ...tracked]);
    return d;
}
// a PATH dir whose git logs one line per call ($SHIM_LOG) and runs the real git; mode 'plain1' / 'unmatch1' / '' make one ls-files call exit 1
// ('plain1': the plain `ls-files -z`, 'error: shim plain did not match'; 'unmatch1': the --error-unmatch one, 'fatal: shim other rc1')
const SHIMS = new Map();
function gitShim(mode) {
    if (SHIMS.has(mode)) return SHIMS.get(mode);
    const dir = mk(`gshim-${mode || 'count'}`);
    for (const c of ['dirname', 'basename']) symlinkSync(spawn(BASH, ['-c', `command -v ${c}`], {}, 'command -v', 10000).stdout.trim(), join(dir, c));
    const real = spawn(BASH, ['-c', 'command -v git'], {}, 'command -v git', 10000).stdout.trim();
    const bad = { '': ':', plain1: "if [[ $plain == 1 ]]; then echo 'error: shim plain did not match' >&2; exit 1; fi",
        unmatch1: "if [[ $plain == 2 ]]; then echo 'fatal: shim other rc1' >&2; exit 1; fi",
        unmatch128: "if [[ $plain == 2 ]]; then echo 'fatal: shim other did not match' >&2; exit 128; fi" }[mode];
    assert.ok(bad !== undefined, mode);
    writeFileSync(join(dir, 'git'), `#!${BASH}\nprintf '%s\\n' "$*" >>"$SHIM_LOG"\nplain=0; for a in "$@"; do case "$a" in ls-files) plain=1 ;; --error-unmatch) plain=2 ;; esac; done\n${bad}\nexec '${real}' "$@"\n`);
    chmodSync(join(dir, 'git'), 0o755);
    SHIMS.set(mode, dir);
    return dir;
}
function gitSpawns(root, file, repo, name) {   // number of git spawns one is_tracked call makes
    const log = join(mk('slog'), 'git.log');
    const out = trackedRc(root, file, repo, name, { ...LCC, PATH: gitShim(''), SHIM_LOG: log });
    assert.equal(out, 'rc=0\n', `${file} ${name}: ${out}`);
    return readFileSync(log, 'utf8').split('\n').filter((l) => l !== '').length;
}
test('MUT drop `--icase-pathspecs ` from is_tracked -> the spawn-count pin red on every root (case-folding hosts only): tracked Thing.js asked as thing.js costs 2 git live, 3 on the mutant (R3: the sweep keeps the verdict rc 0, the spawn count is the pin)', { skip: skip || NOMUT }, (t) => {
    if (!folds()) return t.skip('MUT icase: case-sensitive host (runs on case-folding hosts only: macOS APFS default)');
    const m = mutant('m-icase', 'tracked.sh', '--icase-pathspecs ', '');
    for (const f of FIVE) {
        assert.equal(gitSpawns(live.out, f, trackedRepo(['Thing.js']), 'thing.js'), 2, `live ${f}`);
        assert.equal(gitSpawns(m.out, f, trackedRepo(['Thing.js']), 'thing.js'), 3, `mutant ${f}: the case-different name no longer matches literally, so the sweep spawns once more`);
    }
});
test('MUT replace the exact-name / -ef condition with `true` -> G-T1b red on every root (case-sensitive hosts only)', { skip: skip || NOMUT }, (t) => {
    if (folds()) return t.skip('MUT hit-condition: case-folding host (runs on case-sensitive hosts only: Linux CI leg)');
    const m = mutant('m-hit', 'tracked.sh', 'if [[ "$e" == "$b" || "$d/$e" -ef "$1" ]]; then', 'if true; then');
    for (const f of FIVE) {
        assert.equal(trackedRc(live.out, f, trackedRepo(['Thing.js'], ['thing.js']), 'thing.js'), 'rc=1\n', `live ${f}`);
        assert.equal(trackedRc(m.out, f, trackedRepo(['Thing.js'], ['thing.js']), 'thing.js'), 'rc=0\n', `mutant ${f} must read thing.js as tracked`);
    }
});
test('MUT awk reads the raw line instead of the comment-stripped one -> G-T5a red (comment-only drivers pass) on bytecode-budget and deopt-diff', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-awk', 'stage.sh', 'i = index(o, q[k]); if (i && substr(o, 1, i - 1) ~', 'i = index($0, q[k]); if (i && substr($0, 1, i - 1) ~');
    for (const tool of [BB, DD]) {
        assert.equal(g5refused(live.out, tool, G5_COMMENT[0]), null, `live ${tool}`);
        const why = g5refused(m.out, tool, G5_COMMENT[0]);
        assert.notEqual(why, null, `${tool}: mutant survived the // comment row`);
        t.diagnostic(`awk mutant ${tool}: ${why.slice(0, 100)}`);
    }
});
test('MUT the import / from / require requirement replaced by always-true -> G-T5a plain-mention row (const x = \'./mod.js\') red on bytecode-budget and deopt-diff', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-re', 'stage.sh', 'substr(o, 1, i - 1) ~ /(^|[^A-Za-z0-9_$.])(import|from|require)[ \\t]*\\(?[ \\t]*$/', '1');
    for (const tool of [BB, DD]) {
        assert.equal(g5refused(live.out, tool, G5_MENTION), null, `live ${tool}`);
        const why = g5refused(m.out, tool, G5_MENTION);
        assert.notEqual(why, null, `${tool}: mutant survived the plain-mention row`);
        t.diagnostic(`regex mutant ${tool}: ${why.slice(0, 100)}`);
    }
});

// ---- round 2 mutants (ADDENDUM R2) ----
test('MUT restore the r1 merged-stderr ls-files form -> G-T1e red (a fsmonitor hook noise on stderr makes a tracked file read rc 1) on every root', { skip: skip || NOMUT }, (t) => {
    const from = 'x=$(LC_ALL=C git --icase-pathspecs -C "$d" ls-files -z --error-unmatch -- ":(literal)$b" 2>&1 >&3) || rc=$?';
    const m = mutant('m-r1form', 'tracked.sh', from, 'LC_ALL=C git --icase-pathspecs -C "$d" ls-files -z --error-unmatch -- ":(literal)$b" 2>&1 || rc=$?');
    const d = trackedRepo(['a.js']);
    const hook = join(mk('hook'), 'hook.sh'); writeFileSync(hook, '#!/bin/sh\necho NOISE-FROM-HOOK >&2\nexit 0\n'); chmodSync(hook, 0o755);
    git(d, ['config', 'core.fsmonitor', hook]);
    for (const f of FIVE) {
        assert.equal(trackedRc(live.out, f, d, 'a.js', LCC), 'rc=0\n', `live ${f}`);
        const got = trackedRc(m.out, f, d, 'a.js', LCC);
        assert.equal(got, 'rc=1\n', `mutant ${f} must read the tracked file as rc 1`);
    }
    t.diagnostic('r1-form mutant: tracked a.js with a noisy fsmonitor hook reads rc=1 on all 5 roots (live rc=0)');
});
test('MUT `[[ "$rc" != 0 ]] || return 1` -> `return 1` -> G-T1g red (a failing sweep reads rc 1 instead of dying) on every root', { skip: skip || NOMUT }, () => {
    const m = mutant('m-sweep', 'tracked.sh', '[[ "$rc" != 0 ]] || return 1', 'return 1');
    const shim = mk('shim'); const real = spawn(BASH, ['-c', 'command -v git'], {}, 'command -v git', 10000).stdout.trim();
    for (const c of ['dirname', 'basename']) writeFileSync(join(shim, c), `#!${BASH}\nexec '${spawn(BASH, ['-c', `command -v ${c}`], {}, 'command -v', 10000).stdout.trim()}' "$@"\n`), chmodSync(join(shim, c), 0o755);
    writeFileSync(join(shim, 'git'), `#!${BASH}\nplain=0; for a in "$@"; do case "$a" in ls-files) plain=1 ;; --error-unmatch) plain=2 ;; esac; done\n` +
        `if [[ $plain == 1 ]]; then echo 'fatal: shim sweep failure' >&2; exit 128; fi\nexec '${real}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    const name = Buffer.from('\xc3\xb1.js', 'latin1').toString('utf8');
    const d = trackedRepo(['k.js'], [name]);
    for (const f of FIVE) {
        const l = trackedRc(live.out, f, d, name, { ...LCC, PATH: shim });
        assert.match(l, /^exit 2 .*\(fatal: shim sweep failure\)/s, `live ${f} must die: ${l}`);
        assert.equal(trackedRc(m.out, f, d, name, { ...LCC, PATH: shim }), 'rc=1\n', `mutant ${f}`);
    }
});
test('MUT drop `(^|[^A-Za-z0-9_$.])` from the stage.sh regex -> G-T5a red on `myfrom(\'./mod.js\')` and `x.import(...)` (bb, dd)', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-pre', 'stage.sh', '(^|[^A-Za-z0-9_$.])', '');
    for (const tool of [BB, DD]) {
        for (const txt of ["myfrom('./mod.js');\n", "x.import('./mod.js');\n"]) {
            assert.equal(g5refused(live.out, tool, txt), null, `live ${tool}`);
            const why = g5refused(m.out, tool, txt);
            assert.notEqual(why, null, `${tool} ${txt}: mutant survived`);
        }
        t.diagnostic(`prefix mutant ${tool}: myfrom / x.import accepted`);
    }
});
test('MUT drop the regex trailing `$` -> G-T5a red on `import \'./other.js\'; const x = \'./mod.js\';` (bb, dd)', { skip: skip || NOMUT }, () => {
    const m = mutant('m-dollar', 'stage.sh', '\\(?[ \\t]*$/', '\\(?[ \\t]*/');
    const txt = "import './other.js'; const x = './mod.js';\n";
    for (const tool of [BB, DD]) {
        assert.equal(g5refused(live.out, tool, txt), null, `live ${tool}`);
        assert.notEqual(g5refused(m.out, tool, txt), null, `${tool}: mutant survived`);
    }
});
test('MUT drop `inb = 0` from the stage.sh comment stripper -> G-T5b red: `/* c */ import \'./mod.js\';` is refused (bb, dd)', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-inb', 'stage.sh', 'inb = 0; ', '');
    for (const tool of [BB, DD]) {
        assert.equal(g5accepted(live.out, tool, G5_BLOCK_THEN_IMPORT), null, `live ${tool}`);
        const why = g5accepted(m.out, tool, G5_BLOCK_THEN_IMPORT);
        assert.notEqual(why, null, `${tool}: mutant survived`);
        t.diagnostic(`inb mutant ${tool}: ${why.slice(0, 90)}`);
    }
});

// ================================================================= round 3 (b59 G0 r3): REPORT, hard links, G-T5 limits, MUT A / E / B
// B1: an inherited REPORT=<file> must never be a report file: a usage die before the tool assigns REPORT leaves the bytes alone
const KEEP = 'KEEPKEEP\n';   // 9 bytes
function reportRow(root, tool) {
    const f = join(mk('rep3'), 'inherited.txt'); writeFileSync(f, KEEP);
    const r = spawn(BASH, [join(root, tool), '--no-such-flag-xyz'], { cwd: mk('rep3cwd'), env: cleanEnv({ REPORT: f }) }, `${tool} --no-such-flag-xyz`, 30000);
    if (r.status !== 2) return `exit ${r.status}, want 2: ${r.stderr.slice(0, 200)}`;
    if (!readFileSync(f).equals(Buffer.from(KEEP))) return `the inherited REPORT file changed: ${JSON.stringify(readFileSync(f, 'utf8'))}`;
    return null;
}
for (const tool of FIVE) {
    test(`B1 ${tool}: REPORT=<9-byte file> in the environment + --no-such-flag-xyz -> exit 2, the file's bytes unchanged`, { skip }, () => {
        assert.equal(reportRow(live.out, tool), null);
    });
}
test('MUT delete the `REPORT=""` line of lib/prologue.sh -> B1 red on bytecode-budget and inlining-budget-diff (they never assign REPORT themselves); green on allocation-diff, deopt-diff, ic-diff', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-report', 'prologue.sh', 'REPORT=""   # die reads it', ': # die reads it');
    const red = [];
    for (const tool of FIVE) {
        assert.equal(reportRow(live.out, tool), null, `live ${tool}`);
        const why = reportRow(m.out, tool);
        if (why !== null) { red.push(tool); t.diagnostic(`report mutant ${tool}: ${why.slice(0, 100)}`); }
    }
    assert.deepEqual(red.sort(), [BB, IBD].sort(), 'the mutant must flip exactly bytecode-budget and inlining-budget-diff');
});

// B5: a hard link of a TRACKED file in --before's directory or below it is refused "git-tracked"; one whose tracked twin lies above its
// directory stays passing the check (the R8 residual: the sweep lists --before's directory and below only). Callers: bytecode-budget, deopt-diff.
let HL = null;
function hlFix() {
    if (HL !== null) return HL;
    const top = mk('hl'), repo = join(top, 'repo');
    mkdirSync(join(repo, 'sub'), { recursive: true }); mkdirSync(join(repo, 'sub2'));
    git(repo, ['init', '-q']);
    writeFileSync(join(repo, 'orig.js'), 'export const a = 1;\n'); writeFileSync(join(repo, 'sub', 'deep.js'), 'export const a = 3;\n');
    git(repo, ['add', 'orig.js', 'sub/deep.js']);
    linkSync(join(repo, 'orig.js'), join(repo, 'ln1.js'));               // same directory as its tracked twin
    linkSync(join(repo, 'sub', 'deep.js'), join(repo, 'ln2.js'));        // twin tracked BELOW --before's directory
    linkSync(join(repo, 'orig.js'), join(repo, 'sub2', 'ln3.js'));       // twin tracked ABOVE --before's directory (outside the sweep)
    return (HL = { repo });
}
function hlRun(root, tool, rel) {
    const g = g5fix(); const n = ++g.n;
    const drv = join(g.drv, `h${n}.mjs`); writeFileSync(drv, "import './mod.js';\n");
    rmSync(g.log, { force: true });
    const r = spawn(BASH, [join(root, tool), '--before', join(hlFix().repo, rel), '--after', join(g.after_, 'mod.js'), '--driver', drv, '--out', join(g.top, `hout${n}`), '--node', g.node, ...G5ARGS[tool]], { cwd: g.top }, `${tool} hard link ${rel}`, 60000);
    return { r, reached: existsSync(g.log), tracked: r.stderr.includes('git-tracked') };
}
const hlRefused = (root, tool, rel) => { const x = hlRun(root, tool, rel); return (x.r.status === 2 && x.tracked && !x.reached) ? null : `not refused as git-tracked: exit ${x.r.status} reached ${x.reached}: ${x.r.stderr.slice(0, 300)}`; };
const hlPasses = (root, tool, rel) => { const x = hlRun(root, tool, rel); return (!x.tracked && x.reached) ? null : `refused or not reached: exit ${x.r.status} reached ${x.reached}: ${x.r.stderr.slice(0, 300)}`; };
for (const tool of [BB, DD]) {
    test(`B5 ${tool}: --before an untracked hard link of a tracked file in the same directory (ln1.js) and of one in a subdirectory below (ln2.js) -> exit 2 "git-tracked", nothing spawned`, { skip }, () => {
        assert.equal(hlRefused(live.out, tool, 'ln1.js'), null, 'same directory');
        assert.equal(hlRefused(live.out, tool, 'ln2.js'), null, 'tracked twin below');
    });
    test(`B5 ${tool}: --before a hard link whose tracked twin lies above its directory (sub2/ln3.js) still passes the check (R8 residual pin)`, { skip }, () => {
        assert.equal(hlPasses(live.out, tool, 'sub2/ln3.js'), null);
    });
    test(`B5 twin ${tool}: the ${OLD_SHA} root does not refuse ln1.js / ln2.js (gets to the node spawn, no "git-tracked") -- red on old`, { skip: OLDSKIP }, () => {
        for (const rel of ['ln1.js', 'ln2.js']) {
            assert.equal(hlPasses(oldRoots(), tool, rel), null, rel);
            assert.notEqual(hlRefused(oldRoots(), tool, rel), null, `${rel}: the B5 check must be red on old`);
        }
    });
}

// B6: G-T5 comment / quote limits
const G5_R3_REFUSED = ["// a /* b */ import './mod.js';\n", "const x = './mod.js'; import './mod.js';\n"];   // second: only the FIRST quoted occurrence of a quote style is judged
const G5_R3_OK = ["/* a // b */ import './mod.js';\n", "const x = './mod.js'; import \"./mod.js\";\n"];   // second: the double-quote style has its own index()
for (const tool of [BB, DD]) {
    test(`G-T5a ${tool} R3: \`// a /* b */ import './mod.js';\` (the // comes first) and \`const x = './mod.js'; import './mod.js';\` (first quoted occurrence is a plain mention) are refused`, { skip }, () => {
        for (const t of G5_R3_REFUSED) assert.equal(g5refused(live.out, tool, t), null, JSON.stringify(t));
    });
    test(`G-T5b ${tool} R3: \`/* a // b */ import './mod.js';\` and \`const x = './mod.js'; import "./mod.js";\` are accepted`, { skip }, () => {
        for (const t of G5_R3_OK) assert.equal(g5accepted(live.out, tool, t), null, JSON.stringify(t));
    });
}

// B7 mutants A / E / B
function untrackedDies(root, file, name, mode, want) {   // want: the git line the die must name (exit 2), never rc 1
    const d = trackedRepo(['k.js'], [name]);
    const out = trackedRc(root, file, d, name, { ...LCC, PATH: gitShim(mode), SHIM_LOG: join(mk('slog'), 'git.log') });
    return new RegExp(`^exit 2 .*\\(${want}\\)`, 's').test(out) ? null : out;
}
const B2_NAMES = ['u.js', Buffer.from('\xc3\xb1.js', 'latin1').toString('utf8')];
test('MUT A delete `out=""` in lib/tracked.sh -> G-T1g twin (i) red on every root (a sweep that exits 1 "did not match" reads rc 1 instead of dying)', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-out', 'tracked.sh', '      out=""\n', '');
    for (const f of FIVE) for (const name of B2_NAMES) {
        assert.equal(untrackedDies(live.out, f, name, 'plain1', 'error: shim plain did not match'), null, `live ${f}`);
        const got = trackedRc(m.out, f, trackedRepo(['k.js'], [name]), name, { ...LCC, PATH: gitShim('plain1'), SHIM_LOG: join(mk('slog'), 'git.log') });
        assert.equal(got, 'rc=1\n', `mutant ${f} ${JSON.stringify(name)} must read rc 1`);
    }
    t.diagnostic('MUT A: twin (i) reads rc=1 on all 5 roots, ASCII and non-ASCII (live dies exit 2)');
});
test('MUT E drop `&& "$out" == *"did not match"*` from the sweep guard -> G-T1g twin (ii) red on every root (any rc 1 enters the sweep and reads rc 1 instead of dying)', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-guard', 'tracked.sh', ' && "$out" == *"did not match"*', '')   // the guard reads `[[ "$rc" == 1 && "$out" == *"did not match"* ]]`;
    for (const f of FIVE) for (const name of B2_NAMES) {
        assert.equal(untrackedDies(live.out, f, name, 'unmatch1', 'fatal: shim other rc1'), null, `live ${f}`);
        const got = trackedRc(m.out, f, trackedRepo(['k.js'], [name]), name, { ...LCC, PATH: gitShim('unmatch1'), SHIM_LOG: join(mk('slog'), 'git.log') });
        assert.equal(got, 'rc=1\n', `mutant ${f} ${JSON.stringify(name)} must read rc 1`);
    }
    t.diagnostic('MUT E: twin (ii) reads rc=1 on all 5 roots, ASCII and non-ASCII (live dies exit 2)');
});
test('MUT B `j < i` -> `j > i` in lib/stage.sh -> the B6 rows `// a /* b */ import` (G-T5a: now accepted) and `/* a // b */ import` (G-T5b: now refused) go red on bytecode-budget and deopt-diff', { skip: skip || NOMUT }, () => {
    const m = mutant('m-ji', 'stage.sh', 'j < i', 'j > i');
    for (const tool of [BB, DD]) {
        assert.equal(g5refused(live.out, tool, G5_R3_REFUSED[0]), null, `live ${tool} refused row`);
        assert.equal(g5accepted(live.out, tool, G5_R3_OK[0]), null, `live ${tool} accepted row`);
        assert.match(String(g5refused(m.out, tool, G5_R3_REFUSED[0])), /^not refused/, `${tool}: mutant survived the G-T5a // a /* b */ row`);
        assert.match(String(g5accepted(m.out, tool, G5_R3_OK[0])), /^refused:/, `${tool}: mutant survived the G-T5b /* a // b */ row`);
    }
});
test('MUT F drop `"$rc" == 1 && ` from the sweep guard -> G-T1g twin (iii) red on every root (an --error-unmatch exit 128 saying "did not match" reads rc 1 instead of dying)', { skip: skip || NOMUT }, (t) => {
    const m = mutant('m-rc1', 'tracked.sh', 'if [[ "$rc" == 1 && "$out" == *"did not match"* ]]; then   # icase', 'if [[ "$out" == *"did not match"* ]]; then   # icase');
    for (const f of FIVE) for (const name of B2_NAMES) {
        assert.equal(untrackedDies(live.out, f, name, 'unmatch128', 'fatal: shim other did not match'), null, `live ${f}`);
        const got = trackedRc(m.out, f, trackedRepo(['k.js'], [name]), name, { ...LCC, PATH: gitShim('unmatch128'), SHIM_LOG: join(mk('slog'), 'git.log') });
        assert.equal(got, 'rc=1\n', `mutant ${f} ${JSON.stringify(name)} must read rc 1`);
    }
    t.diagnostic('MUT F: twin (iii) reads rc=1 on all 5 roots, ASCII and non-ASCII (live dies exit 2)');
});
