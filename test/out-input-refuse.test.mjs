// test/out-input-refuse.test.mjs -- b74 F-C (findings dd-fable-1 / DD-opus-a-1 + ibd-cross-opus-1): a file the run writes in
// place in --out is one of its own inputs, or (inlining-budget-diff) a symlink / extra hard link at such a name. Four roots:
// bytecode-budget, deopt-diff, ic-diff, inlining-budget-diff (allocation-diff keeps its own pinned refusal, not tested here).
// Fix: lib/common.sh rep_refuse (report.txt + OUT_NAMES, -ef) called before the first spawn or write; ibd fills OUT_NAMES =
// budget.<tier>.tsv all.<tier>.diff.txt <fn>.<tier>.diff.txt per tier and refuses a symlink / hard link at each of them.
//   ROW 1  driver mode, a DRIVER that IS D/report.txt (before; after too for the two-driver tools), --out D: rc 2, 0 fake-node
//          spawns, 0 stdout bytes, stderr has `--out: <D>/report.txt is an input file of this run` and VERDICT NO-VERDICT, the
//          driver's sha256 unchanged
//   ROW 2  driver mode, the DRIVER is a symlink elsewhere whose target is D/report.txt (-ef: the same file under any name): same oracle
//   ROW 3  file mode (bytecode-budget --diff, deopt-diff, inlining-budget-diff): --driver D/report.txt: same oracle
//   ROW 3b / 3a  file mode, --before D/report.txt / --after D/report.txt (bb / dd: the after row's driver imports './report.txt'
//          and --before is X/b/report.txt; ibd: --before / --after Signal.js beside it): same oracle (b74 F-C r1 B2)
//   EVERY oracle row also asserts the --out tree (recursive listing) is unchanged: the refusal precedes every write (r1 B3)
//   ROW 4  inlining-budget-diff (`--fn read.set --tiers turbo`, every driver a trace text the fake node prints back):
//          D/budget.turbo.tsv a symlink to a file outside D -> rc 2, `budget.turbo.tsv is a symlink`, the target unchanged, 0 spawns;
//          D/all.turbo.diff.txt a hard link of a file outside D -> `has another hard link`, that file unchanged; D/all.turbo.diff.txt
//          as the after DRIVER, D/budget.turbo.tsv as the before DRIVER, D/read.set.turbo.diff.txt as the before DRIVER (--only-fn)
//          -> `is an input file of this run`, the driver unchanged
//   ROW 5  OLD twin per row: the c1618a5 root (b74 before) FAILS the same oracle (one oracle function, empty live, non-empty old)
//          AND changes the input's sha256 (the destroyed driver / symlink target / hard-link twin; ibd rows: after VERDICT SAME)
//   ROW 6  must-fail controls: a DRIVER named report.txt OUTSIDE --out is not refused by the new text and spawns node (>= 1)
//   ROW 8  env OUT_NAMES ('*' with cwd = D, 'drv.js') never joins the bb / dd / ic refusal list (r1 B1)
//   ROW 7  retention: the mkdtemp top is removed in after(); the live `git status --porcelain` `??` set is unchanged
// Own fake node (bash): logs one SPAWN line per call, answers --version / --v8-options (tracked fixture), else exits 0.
// No timing assertions. Private dirs (and a private TMPDIR per case) under one mkdtemp top.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, symlinkSync, linkSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const OPTS_FIX = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = 'c1618a5';
const CI_STRICT = process.env.CI === 'true';

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'out-input-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
const untracked = () => spawn('git', ['status', '--porcelain'], { cwd: PKG }, 'git status --porcelain', 30000).stdout.split('\n').filter((l) => l.startsWith('?? ')).sort();
let GIT0 = null;
before(() => { mkTop(); GIT0 = untracked(); });
after(() => {
    const top = TOP;
    if (top !== null) rmSync(top, { recursive: true, force: true });
    TOP = null;
    assert.ok(top === null || !existsSync(top), `ROW 7: the mkdtemp top ${top} was not removed`);
    assert.deepEqual(untracked(), GIT0, 'ROW 7: the live repo gained / lost untracked entries');
});

const rd = (p) => readFileSync(p, 'utf8');
const sha = (p) => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 8) : 'absent');
const msg = (r) => `rc=${r.status}\n--- stdout\n${JSON.stringify(r.stdout)}\n--- stderr\n${JSON.stringify(r.stderr)}`;
const LIVE = (t) => join(PKG, `${t}.sh`);

// ---- the old twins ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || (haveOld === true || CI_STRICT ? false : haveOld);
const OLD = {};
function oldRoot(t) {
    if (OLD[t]) return OLD[t];
    const g = spawn('git', ['show', `${OLD_SHA}:${t}.sh`], { cwd: PKG, encoding: 'buffer' }, `git show ${t}.sh`, 30000);
    assert.equal(g.status, 0, `git show ${OLD_SHA}:${t}.sh failed (CI_STRICT: an unreachable pin is a failure)`);
    const p = join(mk('old'), `${t}.sh`);
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD[t] = p);
}

// ---- fake node ----
// answers --version / --v8-options / -p; any other call prints its LAST argument's file (the ibd self-test's fake node:
// the "driver" is the trace text), so an inlining-budget-diff run on a trace driver reaches a real verdict and its writes
function fakeText(dir) {
    return ['#!/bin/bash', `D=${JSON.stringify(dir)}`, 'printf "SPAWN\\n" >> "$D/spawn.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        '  -p) echo "v26.8.2 (V8 0)"; exit 0 ;;',
        'esac', 'for a; do last="$a"; done', 'cat -- "$last" 2>/dev/null', 'exit 0', ''].join('\n');
}
// one TurboFan compile unit of read.set inlining helper (the ibd self-test's mm.trace): old roots run to VERDICT SAME, exit 0
const TRACE = ['[compiling method 0x1 <JSFunction read.set (sfi = 0x2)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]',
    'Budget used: 500/920 -- 1 candidate(s) for inlining:',
    '  - target: 0x3 {0x4 <SharedFunctionInfo helper>}, bytecode size: 100',
    'Inlining 0x3 {0x4 <SharedFunctionInfo helper>} into 0x1 {0x2 <SharedFunctionInfo read.set>}',
    '[completed compiling 0x1 <JSFunction read.set (sfi = 0x2)> (target TURBOFAN_JS) - took 0.1, 0.1, 0.1 ms]', ''].join('\n');
const IBDA = ['--fn', 'read.set', '--tiers', 'turbo', '--runs', '2', '--no-bytecode'];
const DRV = 'function add(a, b) { return a + b; }\nlet s = 0;\nfor (let i = 0; i < 2000; i++) s += add(i, 1);\n';
const FDRV = "import { add } from './Signal.js';\nlet s = 0;\nfor (let i = 0; i < 2000; i++) s += add(i, 1);\n";
// one case: dir/{node, cwd, tmp, o (the --out dir), x (outside --out), fm/{b,a}/Signal.js}
function mkCase() {
    const dir = mk('c');
    const c = { dir, node: join(dir, 'node'), cwd: join(dir, 'cwd'), tmp: join(dir, 'tmp'), o: join(dir, 'o'), x: join(dir, 'x') };
    for (const d of [c.cwd, c.tmp, c.o, c.x, join(dir, 'fm', 'b'), join(dir, 'fm', 'a')]) mkdirSync(d, { recursive: true });
    writeFileSync(c.node, fakeText(dir)); chmodSync(c.node, 0o755);
    c.fb = join(dir, 'fm', 'b', 'Signal.js'); c.fa = join(dir, 'fm', 'a', 'Signal.js');
    writeFileSync(c.fb, 'export const add = (a, b) => a + b;\n');
    writeFileSync(c.fa, 'export const add = (a, b) => b + a;\n');
    c.spawns = () => (existsSync(join(dir, 'spawn.log')) ? rd(join(dir, 'spawn.log')).split('\n').filter((l) => l !== '').length : 0);
    return c;
}
function run(root, c, argv, what, extra = {}, cwd = c.cwd) {
    return spawn(BASH, [root, '--node', c.node, '--out', c.o, ...argv], { cwd, env: cleanEnv({ PWD: cwd, TMPDIR: c.tmp, ...extra }) }, what, 90000);
}
// every entry under --out (recursive, sorted): a refusal before any write leaves this list as it was
const tree = (c) => readdirSync(c.o, { recursive: true }).map(String).sort();
// driver mode argv for a before / after pair (bytecode-budget takes ONE driver: the before)
const DRIVERS = (tool, b, a) => (tool === 'bytecode-budget' ? ['--fn', 'add', b] : tool === 'inlining-budget-diff' ? [...IBDA, b, a] : ['--fn', 'add', b, a]);

// ROWS: name -> { tools, setup(c) -> { argv, victim, want } }. victim = the file whose sha256 must not move; want = a stderr fragment.
const ROWS = {};
const inputMsg = (c, n) => `--out: ${c.o}/${n} is an input file of this run`;
for (const tool of ['bytecode-budget', 'deopt-diff', 'ic-diff', 'inlining-budget-diff']) {
    ROWS[`R1-before ${tool}`] = { row: 1, tool, setup: (c) => {
        const v = join(c.o, 'report.txt'); writeFileSync(v, DRV); writeFileSync(join(c.x, 'after.js'), DRV);
        return { argv: DRIVERS(tool, v, join(c.x, 'after.js')), victim: v, want: inputMsg(c, 'report.txt') };
    } };
    if (tool !== 'bytecode-budget') {
        ROWS[`R1-after ${tool}`] = { row: 1, tool, setup: (c) => {
            const v = join(c.o, 'report.txt'); writeFileSync(v, DRV); writeFileSync(join(c.x, 'before.js'), DRV);
            return { argv: DRIVERS(tool, join(c.x, 'before.js'), v), victim: v, want: inputMsg(c, 'report.txt') };
        } };
    }
    ROWS[`R2-symlink ${tool}`] = { row: 2, tool, setup: (c) => {
        const v = join(c.o, 'report.txt'); writeFileSync(v, DRV); symlinkSync(v, join(c.x, 'drv.js')); writeFileSync(join(c.x, 'after.js'), DRV);
        return { argv: DRIVERS(tool, join(c.x, 'drv.js'), join(c.x, 'after.js')), victim: v, want: inputMsg(c, 'report.txt') };
    } };
}
for (const tool of ['bytecode-budget', 'deopt-diff', 'inlining-budget-diff']) {
    ROWS[`R3-file ${tool}`] = { row: 3, tool, setup: (c) => {
        const v = join(c.o, 'report.txt'); writeFileSync(v, FDRV);
        const head = tool === 'bytecode-budget' ? ['--diff', '--fn', 'add'] : tool === 'deopt-diff' ? ['--fn', 'add'] : ['--tiers', 'turbo', '--runs', '2', '--no-bytecode'];
        return { argv: [...head, '--driver', v, '--before', c.fb, '--after', c.fa], victim: v, want: inputMsg(c, 'report.txt') };
    } };
}
// ROW 3b / 3a: file mode, --before / --after at D/report.txt (the module side; bb / dd: the driver imports './report.txt' for the after row)
const FHEAD = (tool) => (tool === 'bytecode-budget' ? ['--diff', '--fn', 'add'] : tool === 'deopt-diff' ? ['--fn', 'add'] : ['--tiers', 'turbo', '--runs', '2', '--no-bytecode']);
const MOD = 'export const add = (a, b) => a + b;\n';
for (const tool of ['bytecode-budget', 'deopt-diff', 'inlining-budget-diff']) {
    ROWS[`R3-before ${tool}`] = { row: 3, tool, setup: (c) => {
        const v = join(c.o, 'report.txt'); writeFileSync(v, MOD);
        const drv = join(c.x, 'drv.js'); writeFileSync(drv, FDRV);
        return { argv: [...FHEAD(tool), '--driver', drv, '--before', v, '--after', c.fa], victim: v, want: inputMsg(c, 'report.txt') };
    } };
    ROWS[`R3-after ${tool}`] = { row: 3, tool, setup: (c) => {
        const v = join(c.o, 'report.txt'); writeFileSync(v, MOD);
        const drv = join(c.x, 'drv.js');
        if (tool === 'inlining-budget-diff') {
            writeFileSync(drv, FDRV);
            return { argv: [...FHEAD(tool), '--driver', drv, '--before', c.fb, '--after', v], victim: v, want: inputMsg(c, 'report.txt') };
        }
        const b = join(c.x, 'b', 'report.txt'); mkdirSync(dirname(b)); writeFileSync(b, 'export const add = (a, b) => b + a;\n');
        writeFileSync(drv, FDRV.replace('./Signal.js', './report.txt'));
        return { argv: [...FHEAD(tool), '--driver', drv, '--before', b, '--after', v], victim: v, want: inputMsg(c, 'report.txt') };
    } };
}
const IBD = 'inlining-budget-diff';
// ROW 4: every driver is the TRACE text (the fake node prints it), so the old root reaches its in-place writes
ROWS['R4-budget-symlink ibd'] = { row: 4, tool: IBD, setup: (c) => {
    const v = join(c.x, 'victim.txt'); writeFileSync(v, 'precious\n'); symlinkSync(v, join(c.o, 'budget.turbo.tsv'));
    writeFileSync(join(c.x, 'b.js'), TRACE); writeFileSync(join(c.x, 'a.js'), TRACE);
    return { argv: [...IBDA, join(c.x, 'b.js'), join(c.x, 'a.js')], victim: v, want: `--out: ${c.o}/budget.turbo.tsv is a symlink` };
} };
ROWS['R4-diff-hardlink ibd'] = { row: 4, tool: IBD, setup: (c) => {
    const v = join(c.x, 'victim.txt'); writeFileSync(v, 'precious\n'); linkSync(v, join(c.o, 'all.turbo.diff.txt'));
    writeFileSync(join(c.x, 'b.js'), TRACE); writeFileSync(join(c.x, 'a.js'), TRACE);
    return { argv: [...IBDA, join(c.x, 'b.js'), join(c.x, 'a.js')], victim: v, want: `--out: ${c.o}/all.turbo.diff.txt has another hard link` };
} };
ROWS['R4-diff-after-driver ibd'] = { row: 4, tool: IBD, setup: (c) => {
    const v = join(c.o, 'all.turbo.diff.txt'); writeFileSync(v, TRACE); writeFileSync(join(c.x, 'b.js'), TRACE);
    return { argv: [...IBDA, join(c.x, 'b.js'), v], victim: v, want: inputMsg(c, 'all.turbo.diff.txt') };
} };
ROWS['R4-budget-before-driver ibd'] = { row: 4, tool: IBD, setup: (c) => {
    const v = join(c.o, 'budget.turbo.tsv'); writeFileSync(v, TRACE); writeFileSync(join(c.x, 'a.js'), TRACE);
    return { argv: [...IBDA, v, join(c.x, 'a.js')], victim: v, want: inputMsg(c, 'budget.turbo.tsv') };
} };
ROWS['R4-fn-diff-before-driver ibd'] = { row: 4, tool: IBD, setup: (c) => {
    const v = join(c.o, 'read.set.turbo.diff.txt'); writeFileSync(v, TRACE); writeFileSync(join(c.x, 'a.js'), TRACE);
    return { argv: ['--only-fn', ...IBDA, v, join(c.x, 'a.js')], victim: v, want: inputMsg(c, 'read.set.turbo.diff.txt') };
} };

// the ONE oracle: the list of failed expectations (empty = the fixed behaviour)
function problems(r, c, s, sha0, tree0) {
    const bad = [];
    if (r.status !== 2) bad.push(`rc ${r.status} != 2`);
    if (c.spawns() !== 0) bad.push(`${c.spawns()} fake-node spawns != 0`);
    if (r.stdout !== '') bad.push(`${r.stdout.length} stdout bytes != 0`);
    if (!r.stderr.includes(s.want)) bad.push(`stderr lacks ${JSON.stringify(s.want)}`);
    if (!/\nVERDICT NO-VERDICT\n$/.test(r.stderr)) bad.push('stderr does not end with VERDICT NO-VERDICT');
    if (sha(s.victim) !== sha0) bad.push(`input sha256 changed: ${sha0} -> ${sha(s.victim)}`);
    const t = tree(c);
    if (JSON.stringify(t) !== JSON.stringify(tree0)) bad.push(`--out changed: ${JSON.stringify(tree0)} -> ${JSON.stringify(t)}`);
    return bad;
}

for (const [name, R] of Object.entries(ROWS)) {
    test(`ROW ${R.row} ${name}: rc 2, 0 spawns, 0 stdout bytes, the refusal text, the input unchanged`, { skip }, () => {
        const c = mkCase(); const s = R.setup(c); const sha0 = sha(s.victim); const tree0 = tree(c);
        const r = run(LIVE(R.tool), c, s.argv, name);
        assert.deepEqual(problems(r, c, s, sha0, tree0), [], msg(r));
    });
    test(`ROW 5 OLD twin ${name}: the ${OLD_SHA} root fails the row and changes the input`, { skip: OLDSKIP }, () => {
        const c = mkCase(); const s = R.setup(c); const sha0 = sha(s.victim); const tree0 = tree(c);
        const r = run(oldRoot(R.tool), c, s.argv, `${name} (old)`);
        const bad = problems(r, c, s, sha0, tree0);
        assert.ok(bad.length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
        assert.notEqual(sha(s.victim), sha0, `old root left the input unchanged (the row does not reproduce the defect)\n${msg(r)}`);
    });
}

// ROW 6 must-fail controls: a driver named report.txt OUTSIDE --out (and an --out with no report.txt) is not refused by the new text
for (const tool of ['bytecode-budget', 'deopt-diff', 'ic-diff', 'inlining-budget-diff']) {
    test(`ROW 6 control ${tool}: a DRIVER named report.txt outside --out is not refused by the new text, >= 1 spawn`, { skip }, () => {
        const c = mkCase();
        const v = join(c.x, 'report.txt'); writeFileSync(v, DRV); writeFileSync(join(c.x, 'after.js'), DRV);
        const r = run(LIVE(tool), c, DRIVERS(tool, v, join(c.x, 'after.js')), `${tool} control`);
        assert.ok(!/is an input file of this run|is a symlink|has another hard link/.test(r.stderr), msg(r));
        assert.ok(c.spawns() >= 1, `0 spawns: the control was refused before node\n${msg(r)}`);
        assert.equal(sha(v), createHash('sha256').update(DRV).digest('hex').slice(0, 8), 'the control driver changed');
    });
}

// ROW 8 (b74 F-C r1 B1): bytecode-budget / deopt-diff / ic-diff assign OUT_NAMES="" themselves, so an inherited OUT_NAMES never joins
// the refusal list: a DRIVER D/drv.js inside --out D, env OUT_NAMES = '*' (cwd = D, so the glob names drv.js) or 'drv.js', is not
// refused by the new text and spawns node. Red on a build that reads the inherited value (b74 F-C before r1).
for (const tool of ['bytecode-budget', 'deopt-diff', 'ic-diff']) {
    for (const val of ['*', 'drv.js']) {
        test(`ROW 8 ${tool}: env OUT_NAMES=${JSON.stringify(val)}, a DRIVER D/drv.js inside --out D is not refused, >= 1 spawn`, { skip }, () => {
            const c = mkCase();
            const v = join(c.o, 'drv.js'); writeFileSync(v, DRV); writeFileSync(join(c.x, 'after.js'), DRV);
            const r = run(LIVE(tool), c, DRIVERS(tool, v, join(c.x, 'after.js')), `${tool} OUT_NAMES`, { OUT_NAMES: val }, c.o);
            assert.ok(!/is an input file of this run/.test(r.stderr), msg(r));
            assert.ok(c.spawns() >= 1, `0 spawns: refused before node\n${msg(r)}`);
        });
    }
}
