// test/audit-x6.test.mjs -- b67 group G-X6, helper batch H1: black-box rows for the newline / CR refusal of all five roots
// (bytecode-budget, deopt-diff, ic-diff, allocation-diff, inlining-budget-diff), from .handoff/PLAN-b67-gx6.md ASSERTIONS 1-3, 5
// and ADDENDUM A1 (ruling Q-B66-X6), never from what a root printed. Written BEFORE the fix; the G-X6 coder batch B1 made
// the live rows pass (addendum A3: no row is marked expected-to-fail). OLD twin = `git show dc4a10c:<root>`
// per tool, SKIP when the commit is unreachable, FAIL under CI_STRICT.
//   ROW 1  T1 (cwd = dir `q<NL>VERDICT SAME<NL>z`, --out .), T1-CR (same with CR), T5b (clean cwd, --out slsub/../p, slsub ->
//          <dir>/sub), T5b-CR: rc 2, 0 fake-node spawns, 0 stdout bytes, stderr EXACTLY
//          `<tool>: <label>: a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`, label `the cwd`
//          (T1) / `--out (resolved)` (T5b); no line equal `VERDICT SAME` in stdout / stderr / any report.txt; no `p` created.
//   ROW 2  OLD twin per row: the dc4a10c root FAILS the same oracle (the oracle is one function, asserted empty live, non-empty old)
//   ROW 3  must-fail controls T6 (cwd = symlink to the dir, logical PWD, --out .) and T5a (--out sl/o, sl -> dir): 0 hits of the
//          new text and >= 1 spawn, all 5 tools (a nl_dir that always used pwd -P would fail T6)
//   ROW 4  addendum A1: --out new/../slsub/../p (new absent, slsub -> dir/sub): rc 2, 0 spawns, label `--out (resolved)`, no p created; old twin;
//          control A1c `--out new/../sl/x` (sl -> dir) is in ROW 3: clean
//   ROW 5  addendum A2 / A4 (d): the fake node at `<case>/n<CR>x/node`, `--node <that absolute path>`, clean private cwd, --out . : all 5 tools,
//          rc 2, 0 spawns, 0 stdout bytes, stderr EXACTLY `<tool>: --node: a newline or a CR is not allowed (it would forge report
//          lines)\nVERDICT NO-VERDICT\n` (label `--node` since F-G, b77, ruling Q-B75-NONPATH: the raw --node value is refused
//          before it resolves), nothing forged; OLD twin per tool (the dc4a10c root fails the same oracle)
//   ROW 5p F-G (b77): the ROW 5 fake found by a PATH lookup (no --node, PATH = its dir first): the same oracle with the label
//          `--node (resolved)` (the resolved-path refusal a raw --node value can no longer reach); OLD twin per tool
//   ROW 6  retention: the mkdtemp top is removed in after() (asserted there); the live `git status --porcelain` `??` set is unchanged
//   ROW 7  T7 (census: HEAD dc4a10c forges on all 5 tools): the DRIVER arg(s) `slsub/../q/<f>.js` (slsub -> <NL dir>/sub, q only under the
//          NL dir, so the physical path runs through the dir `q<NL>VERDICT SAME<NL>z`), x LF / CR: rc 2, 0 spawns, 0 stdout bytes, stderr
//          EXACTLY `<tool>: DRIVER (resolved): a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`, nothing forged
//   ROW 8  T8 (census: HEAD forges on bytecode-budget and deopt-diff only): file mode `--diff ... --before slsub/../q/mod.js`, x LF / CR; same
//          oracle, label `--before / --after / --driver (resolved)` (the plan's label for that path; lib/stage.sh stage_check)
//          ROW 7 / ROW 8 each have an OLD twin: the dc4a10c root FAILS the same oracle
//   ROW 9  ruling Q-B68-IBDCR: inlining-budget-diff FILE mode (`--before F --after F`, two Signal.js files): a CR in the --before path / in the
//          --after path (dir `fr<CR>x`): rc 2, 0 spawns, 0 stdout bytes, stderr EXACTLY `inlining-budget-diff: --before / --after / --driver
//          (resolved): a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`; OLD twin per row (dc4a10c fails it);
//          control: the same shape with clean dir names is NOT refused by that text (>= 1 spawn)
//   ROW 10 ruling Q-B68-STAGECWD (A4 (b)): ref (staged) mode of bytecode-budget / deopt-diff, cwd = a git repo (one commit) named
//          `q<NL>VERDICT SAME<NL>z` (x LF / CR), `--before-ref nosuch --after-ref HEAD --module Signal.js`: rc 2, 0 spawns, 0 stdout bytes,
//          stderr EXACTLY `<tool>: the cwd: a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`, no
//          `VERDICT SAME` line anywhere; OLD twin per case; must-fail control: a clean-named git cwd is NOT refused by that text
//          (stage_check's own refusal fires instead)
//   ROW 11 inlining-budget-diff driver mode, a CR in a driver BASENAME (`a<CR>VERDICT SAME<CR>z.js`, in a clean dir; nl_dir cannot see it):
//          rc 2, 0 spawns, no --out dir created, stderr EXACTLY the `DRIVER (resolved)` die line + VERDICT NO-VERDICT; OLD twin. CR only: an LF
//          in the basename dies earlier (src :842) with a different message.
// Own fake node (bash): logs one SPAWN line per call, answers --version / --v8-options (tracked fixture), else exits 0.
// No timing assertions. Private dirs under one mkdtemp top.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const OPTS_FIX = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = 'dc4a10c';
const CI_STRICT = process.env.CI === 'true';

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-x6-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
const untracked = () => spawn('git', ['status', '--porcelain'], { cwd: PKG }, 'git status --porcelain', 30000).stdout.split('\n').filter((l) => l.startsWith('?? ')).sort();
let GIT0 = null;
before(() => { mkTop(); GIT0 = untracked(); });
after(() => {
    const top = TOP;
    if (top !== null) rmSync(top, { recursive: true, force: true });
    TOP = null;
    assert.ok(top === null || !existsSync(top), `ROW 6: the mkdtemp top ${top} was not removed`);
    assert.deepEqual(untracked(), GIT0, 'ROW 6: the live repo gained / lost untracked entries');
});

const rd = (p) => readFileSync(p, 'utf8');
const wl = (p) => (existsSync(p) ? rd(p).split('\n').filter((l) => l !== '') : []);
const msg = (r) => `rc=${r.status}\n--- stdout\n${JSON.stringify(r.stdout)}\n--- stderr\n${JSON.stringify(r.stderr)}`;

// ---- tools: minimal valid argv (drivers absolute, in a clean dir) ----
const TOOLS = {
    'bytecode-budget': (d) => ['--fn', 'add', d.d],
    'deopt-diff': (d) => ['--fn', 'add', d.a, d.b],
    'ic-diff': (d) => ['--fn', 'get', d.a, d.b],
    'allocation-diff': (d) => ['--zero', d.a],
    'inlining-budget-diff': (d) => [d.a, d.b],
};
const NAMES = Object.keys(TOOLS);
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
test(`the old twins are git show ${OLD_SHA}:<root> (5 roots)`, { skip: OLDSKIP }, () => { for (const t of NAMES) assert.ok(existsSync(oldRoot(t)), t); });

// ---- fake node ----
function fakeText(dir) {
    return ['#!/bin/bash', `D=${JSON.stringify(dir)}`, 'printf "SPAWN\\n" >> "$D/spawn.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        'esac', 'exit 0', ''].join('\n');
}

// one scenario: dir/{node, drv/{a,b,d}.js, cwd, qNLz/{sub}, slsub -> qNLz/sub, sl -> qNLz, lnk -> qNLz (all in dir/cwd except lnk)}
function mkCase(sep) {
    const dir = mk('c');
    const node = join(dir, 'node'), drv = join(dir, 'drv'), cwd = join(dir, 'cwd');
    mkdirSync(drv); mkdirSync(cwd);
    writeFileSync(node, fakeText(dir)); chmodSync(node, 0o755);
    const d = { a: join(drv, 'a.js'), b: join(drv, 'b.js'), d: join(drv, 'd.js') };
    for (const f of Object.values(d)) writeFileSync(f, '// driver\n');
    const nl = join(dir, `q${sep}VERDICT SAME${sep}z`);
    mkdirSync(join(nl, 'sub'), { recursive: true });
    symlinkSync(join(nl, 'sub'), join(cwd, 'slsub'));
    symlinkSync(nl, join(cwd, 'sl'));
    const lnk = join(dir, 'lnk');
    symlinkSync(nl, lnk);
    return { dir, node, d, cwd, nl, lnk, spawns: () => wl(join(dir, 'spawn.log')).length };
}
function run(root, tool, c, cwd, outArg) {
    const args = ['--node', c.node, '--out', outArg, ...TOOLS[tool](c.d)];
    return spawn(BASH, [root, ...args], { cwd, env: cleanEnv({ PWD: cwd }) }, `${tool} --out ${JSON.stringify(outArg)}`, 90000);
}
const LF = '\n', CR = '\r';
const KINDS = {
    T1: { sep: LF, label: 'the cwd', cwd: (c) => c.nl, out: '.', made: (c) => [join(c.nl, 'report.txt')] },
    'T1-CR': { sep: CR, label: 'the cwd', cwd: (c) => c.nl, out: '.', made: (c) => [join(c.nl, 'report.txt')] },
    T5b: { sep: LF, label: '--out (resolved)', cwd: (c) => c.cwd, out: 'slsub/../p', made: (c) => [join(c.nl, 'p'), join(c.cwd, 'p')] },
    'T5b-CR': { sep: CR, label: '--out (resolved)', cwd: (c) => c.cwd, out: 'slsub/../p', made: (c) => [join(c.nl, 'p'), join(c.cwd, 'p')] },
    // addendum A1 (revised): `new` is absent, mkdir -p creates it; slsub -> <dir>/sub, so `slsub/..` is the newline dir and p lands there
    A1: { sep: LF, label: '--out (resolved)', cwd: (c) => c.cwd, out: 'new/../slsub/../p', made: (c) => [join(c.nl, 'p'), join(c.cwd, 'p')] },
};
// the ONE oracle: returns the list of failed expectations (empty = the fixed behaviour)
function problems(r, c, tool, kind) {
    const k = KINDS[kind] || KINDS2[kind], bad = [];
    const want = `${tool}: ${k.label}: a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`;
    if (r.status !== 2) bad.push(`rc ${r.status} != 2`);
    if (c.spawns() !== 0) bad.push(`${c.spawns()} fake-node spawns != 0`);
    if (r.stdout !== '') bad.push(`${r.stdout.length} stdout bytes != 0`);
    if (r.stderr !== want) bad.push('stderr is not exactly the die line + VERDICT NO-VERDICT');
    const texts = [r.stdout, r.stderr];
    for (const p of [join(c.nl, 'report.txt'), join(c.cwd, 'report.txt'), ...(k.reports ? k.reports(c) : [])]) if (existsSync(p)) texts.push(rd(p));
    const forged = texts.join('\n').split(/\r\n|\n|\r/).filter((l) => l === 'VERDICT SAME').length;
    if (forged !== 0) bad.push(`${forged} lines equal VERDICT SAME`);
    for (const p of k.made(c)) if (existsSync(p)) bad.push(`created ${p.replace(c.dir, '<case>')}`);
    return bad;
}
// ROW 7 / ROW 8 kinds: own argv (no --out slsub trick: --out is an absolute path under the private dir, never created by a refusal)
const OUTD = (c) => join(c.dir, 'o');
const RELQ = 'slsub/../q/';
const KINDS2 = {};
for (const [n, sep] of [['', LF], ['-CR', CR]]) {
    KINDS2[`T7${n}`] = { sep, label: 'DRIVER (resolved)', cwd: (c) => c.cwd, made: (c) => [OUTD(c)], reports: (c) => [join(OUTD(c), 'report.txt')],
        argv: (c, tool) => { const m = { d: RELQ + 'd.js', a: RELQ + 'a.js', b: RELQ + 'b.js' }; return ['--node', c.node, '--out', OUTD(c), ...TOOLS[tool](m)]; } };
    KINDS2[`T8${n}`] = { sep, label: '--before / --after / --driver (resolved)', cwd: (c) => c.cwd, made: () => [], reports: (c) => [join(OUTD(c), 'report.txt')],
        argv: (c, tool) => ['--node', c.node, ...(tool === 'bytecode-budget' ? ['--diff'] : []), '--fn', 'add', '--out', OUTD(c), '--driver', c.d.d, '--before', RELQ + 'mod.js', '--after', join(c.dir, 'drv', 'mod.js')] };
}
// ROW 9: file mode of inlining-budget-diff; the dir of the --before (T9B) or --after (T9A) Signal.js holds a CR
function mkCase9(badSide) {
    const c = mkCase(LF);
    c.f = {};
    for (const side of ['before', 'after']) {
        const d = join(c.dir, side === badSide ? `fr${CR}x` : `ok-${side}`);
        mkdirSync(d);
        c.f[side] = join(d, 'Signal.js');
        writeFileSync(c.f[side], `export const side = ${JSON.stringify(side)};\n`);
    }
    return c;
}
const run9 = (root, c) => spawn(BASH, [root, '--node', c.node, '--out', OUTD(c), '--before', c.f.before, '--after', c.f.after], { cwd: c.cwd, env: cleanEnv({ PWD: c.cwd }) }, 'inlining-budget-diff file mode', 90000);
for (const kind of ['T9B-CR', 'T9A-CR']) {
    KINDS2[kind] = { sep: LF, label: '--before / --after / --driver (resolved)', cwd: (c) => c.cwd, made: () => [], reports: (c) => [join(OUTD(c), 'report.txt')] };
}
function mkCase2(sep) {
    const c = mkCase(sep);
    mkdirSync(join(c.nl, 'q'));
    for (const f of ['a.js', 'b.js', 'd.js', 'mod.js']) writeFileSync(join(c.nl, 'q', f), '// frozen\n');
    writeFileSync(join(c.dir, 'drv', 'mod.js'), 'export const add = (a, b) => a + b;\n');
    writeFileSync(c.d.d, "import { add } from './mod.js';\nexport default add;\n"); // the staged-driver import check
    return c;
}
function run2(root, tool, c, kind) {
    const k = KINDS2[kind];
    return spawn(BASH, [root, ...k.argv(c, tool)], { cwd: k.cwd(c), env: cleanEnv({ PWD: k.cwd(c) }) }, `${tool} ${kind}`, 90000);
}
const NEWTEXT = /a newline or a CR is not allowed/;

// ROW 1 / 4 live and ROW 2 old twin
for (const kind of Object.keys(KINDS)) {
    for (const tool of NAMES) {
        const name = `${kind} ${tool}`;
        test(`ROW ${kind === 'A1' ? 4 : 1} ${name}: rc 2, 0 spawns, 0 stdout bytes, exact die line + VERDICT NO-VERDICT, nothing forged / created`, { skip }, () => {
            const c = mkCase(KINDS[kind].sep);
            const r = run(LIVE(tool), tool, c, KINDS[kind].cwd(c), KINDS[kind].out);
            const bad = problems(r, c, tool, kind);
            assert.deepEqual(bad, [], msg(r));
        });
        test(`ROW 2 OLD twin ${name}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
            const c = mkCase(KINDS[kind].sep);
            const r = run(oldRoot(tool), tool, c, KINDS[kind].cwd(c), KINDS[kind].out);
            const bad = problems(r, c, tool, kind);
            assert.ok(bad.length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
        });
    }
}

// ROW 3 must-fail controls: a legitimate path through a symlink is NOT refused (>= 1 spawn, no new text)
const CONTROLS = {
    T6: { cwd: (c) => c.lnk, out: '.' },           // cwd = symlink to the newline dir, logical PWD
    T5a: { cwd: (c) => c.cwd, out: 'sl/o' },       // --out through a symlink to the newline dir
    A1c: { cwd: (c) => c.cwd, out: 'new/../sl/x' }, // addendum A1 (b): the head prints the logical sl/x, clean
};
for (const ctl of Object.keys(CONTROLS)) {
    for (const tool of NAMES) {
        test(`ROW 3 control ${ctl} ${tool}: 0 hits of the new die text, >= 1 spawn`, { skip }, () => {
            const c = mkCase(LF);
            const r = run(LIVE(tool), tool, c, CONTROLS[ctl].cwd(c), CONTROLS[ctl].out);
            assert.ok(!NEWTEXT.test(r.stdout + r.stderr), `the new text fired on a clean logical path\n${msg(r)}`);
            assert.ok(c.spawns() >= 1, `0 fake-node spawns: the run never got past its checks\n${msg(r)}`);
        });
    }
}

// ROW 7 / ROW 8 live and OLD twins
for (const [kind, tools] of [['T7', NAMES], ['T7-CR', NAMES], ['T8', ['bytecode-budget', 'deopt-diff']], ['T8-CR', ['bytecode-budget', 'deopt-diff']]]) {
    for (const tool of tools) {
        const name = `${kind} ${tool}`, row = kind.startsWith('T7') ? 7 : 8;
        test(`ROW ${row} ${name}: rc 2, 0 spawns, 0 stdout bytes, exact die line + VERDICT NO-VERDICT, nothing forged`, { skip }, () => {
            const c = mkCase2(KINDS2[kind].sep);
            const r = run2(LIVE(tool), tool, c, kind);
            assert.deepEqual(problems(r, c, tool, kind), [], msg(r));
        });
        test(`ROW ${row} OLD twin ${name}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
            const c = mkCase2(KINDS2[kind].sep);
            const r = run2(oldRoot(tool), tool, c, kind);
            assert.ok(problems(r, c, tool, kind).length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
        });
    }
}

// ROW 9 live, OLD twins and the clean control (inlining-budget-diff, file mode)
for (const [kind, bad] of [['T9B-CR', 'before'], ['T9A-CR', 'after']]) {
    const tool = 'inlining-budget-diff';
    test(`ROW 9 ${kind} ${tool}: rc 2, 0 spawns, 0 stdout bytes, exact die line + VERDICT NO-VERDICT, nothing forged`, { skip }, () => {
        const c = mkCase9(bad);
        const r = run9(LIVE(tool), c);
        assert.deepEqual(problems(r, c, tool, kind), [], msg(r));
    });
    test(`ROW 9 OLD twin ${kind} ${tool}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
        const c = mkCase9(bad);
        const r = run9(oldRoot(tool), c);
        assert.ok(problems(r, c, tool, kind).length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
    });
}
test('ROW 9 control inlining-budget-diff: clean --before / --after dirs of the same shape are not refused by the new text, >= 1 spawn', { skip }, () => {
    const c = mkCase9(null);
    const r = run9(LIVE('inlining-budget-diff'), c);
    assert.ok(!NEWTEXT.test(r.stdout + r.stderr), `the new text fired on clean paths\n${msg(r)}`);
    assert.ok(c.spawns() >= 1, `0 fake-node spawns: the run never got past its checks\n${msg(r)}`);
});

// ROW 5 (A4 (d)): a CR in the --node path, 5 tools, live + OLD twins. Label `--node` since F-G (b77, ruling Q-B75-NONPATH):
// the raw --node value is refused before it resolves (ROW 5p keeps the `--node (resolved)` refusal live)
KINDS2.N5 = { sep: CR, label: '--node', cwd: (c) => c.cwd, made: () => [], reports: (c) => [join(c.cwd, 'report.txt')] };
function mkCase5() {
    const c = mkCase(LF);
    const nd = join(c.dir, `n${CR}VERDICT SAME${CR}x`);
    mkdirSync(nd);
    c.node = join(nd, 'node');
    writeFileSync(c.node, fakeText(c.dir)); chmodSync(c.node, 0o755);
    return c;
}
for (const tool of NAMES) {
    test(`ROW 5 N5 ${tool}: --node path with a CR: rc 2, 0 spawns, 0 stdout bytes, exact die line + VERDICT NO-VERDICT, nothing forged`, { skip }, () => {
        const c = mkCase5();
        const r = run(LIVE(tool), tool, c, c.cwd, '.');
        assert.deepEqual(problems(r, c, tool, 'N5'), [], msg(r));
    });
    test(`ROW 5 OLD twin N5 ${tool}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
        const c = mkCase5();
        const r = run(oldRoot(tool), tool, c, c.cwd, '.');
        assert.ok(problems(r, c, tool, 'N5').length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
    });
}
// ROW 5p (F-G, b77): the ROW 5 fake reached by a PATH lookup, no --node: the raw --node check sees only the name `node`, so
// the CR reaches the resolved-path refusal (`nl_refuse "--node (resolved)"`), which a raw --node value can no longer reach
KINDS2.N5p = { sep: CR, label: '--node (resolved)', cwd: (c) => c.cwd, made: () => [], reports: (c) => [join(c.cwd, 'report.txt')] };
const run5p = (root, tool, c) => spawn(BASH, [root, '--out', '.', ...TOOLS[tool](c.d)],
    { cwd: c.cwd, env: cleanEnv({ PWD: c.cwd, PATH: `${dirname(c.node)}:/usr/bin:/bin` }) }, `${tool} N5p PATH lookup`, 90000);
for (const tool of NAMES) {
    test(`ROW 5p N5p ${tool}: the node found on PATH in a dir with a CR: rc 2, 0 spawns, 0 stdout bytes, exact --node (resolved) die line + VERDICT NO-VERDICT, nothing forged`, { skip }, () => {
        const c = mkCase5();
        const r = run5p(LIVE(tool), tool, c);
        assert.deepEqual(problems(r, c, tool, 'N5p'), [], msg(r));
    });
    test(`ROW 5p OLD twin N5p ${tool}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
        const c = mkCase5();
        const r = run5p(oldRoot(tool), tool, c);
        assert.ok(problems(r, c, tool, 'N5p').length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
    });
}

// ROW 10 (Q-B68-STAGECWD): ref mode, newline / CR cwd (a git repo)
const GITOPTS = ['-c', 'user.name=x', '-c', 'user.email=x@x', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
function gitEnv(c) {
    mkdirSync(join(c.dir, 'home'), { recursive: true });
    return cleanEnv({ HOME: join(c.dir, 'home'), GIT_CONFIG_NOSYSTEM: '1', GIT_EDITOR: 'true' });
}
function gitRepo(c, d) {
    mkdirSync(d, { recursive: true });
    const env = gitEnv(c);
    writeFileSync(join(d, 'Signal.js'), 'export const add = (a, b) => a + b;\n');
    for (const a of [['init', '-q'], ['add', 'Signal.js'], [...GITOPTS, 'commit', '-q', '-m', 'one']]) {
        const g = spawn('git', a, { cwd: d, env }, `git ${a[0]}`, 30000);
        assert.equal(g.status, 0, `git ${a.join(' ')} failed: ${g.stderr}`);
    }
}
KINDS2.R10 = { sep: LF, label: 'the cwd', cwd: (c) => c.nl, made: (c) => [OUTD(c)], reports: (c) => [join(OUTD(c), 'report.txt'), join(c.nl, 'report.txt')] };
KINDS2['R10-CR'] = { ...KINDS2.R10, sep: CR };
function run10(root, tool, c, cwd) {
    const args = ['--node', c.node, ...(tool === 'bytecode-budget' ? ['--diff'] : []), '--fn', 'add', '--out', OUTD(c), '--driver', c.d.d,
        '--before-ref', 'nosuch', '--after-ref', 'HEAD', '--module', 'Signal.js'];
    return spawn(BASH, [root, ...args], { cwd, env: { ...gitEnv(c), PWD: cwd } }, `${tool} ref mode`, 90000);
}
for (const [kind, sep] of [['R10', LF], ['R10-CR', CR]]) {
    for (const tool of ['bytecode-budget', 'deopt-diff']) {
        test(`ROW 10 ${kind} ${tool}: ref mode, nl cwd: rc 2, 0 spawns, 0 stdout bytes, exact die line + VERDICT NO-VERDICT, nothing forged`, { skip }, () => {
            const c = mkCase(sep); gitRepo(c, c.nl);
            const r = run10(LIVE(tool), tool, c, c.nl);
            assert.deepEqual(problems(r, c, tool, kind), [], msg(r));
        });
        test(`ROW 10 OLD twin ${kind} ${tool}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
            const c = mkCase(sep); gitRepo(c, c.nl);
            const r = run10(oldRoot(tool), tool, c, c.nl);
            assert.ok(problems(r, c, tool, kind).length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
        });
    }
}
for (const tool of ['bytecode-budget', 'deopt-diff']) {
    test(`ROW 10 control ${tool}: the same args from a clean-named git cwd are not refused by the cwd text (stage_check refuses: nosuch)`, { skip }, () => {
        const c = mkCase(LF); const g = join(c.dir, 'gclean'); gitRepo(c, g);
        const r = run10(LIVE(tool), tool, c, g);
        assert.ok(!NEWTEXT.test(r.stdout + r.stderr), `the new text fired on a clean cwd\n${msg(r)}`);
        assert.equal(r.status, 2, msg(r));
        assert.ok(/nosuch/.test(r.stderr), `stage_check's own refusal (naming the bad ref) did not fire\n${msg(r)}`);
    });
}

// ROW 11: a CR in an ibd driver BASENAME (gate for the `nl_refuse "DRIVER (resolved)" POS...` line)
KINDS2.D11 = { sep: CR, label: 'DRIVER (resolved)', cwd: (c) => c.cwd, made: (c) => [OUTD(c)], reports: (c) => [join(OUTD(c), 'report.txt')] };
function run11(root, c) {
    const p0 = join(c.dir, 'drv', `a${CR}VERDICT SAME${CR}z.js`);
    writeFileSync(p0, '// driver\n');
    return spawn(BASH, [root, '--node', c.node, '--out', OUTD(c), p0, c.d.b], { cwd: c.cwd, env: cleanEnv({ PWD: c.cwd }) }, 'inlining-budget-diff ROW 11', 90000);
}
test('ROW 11 D11 inlining-budget-diff: CR in a driver basename: rc 2, 0 spawns, o not created, exact die line + VERDICT NO-VERDICT', { skip }, () => {
    const c = mkCase(CR);
    const r = run11(LIVE('inlining-budget-diff'), c);
    assert.deepEqual(problems(r, c, 'inlining-budget-diff', 'D11'), [], msg(r));
});
test(`ROW 11 OLD twin D11 inlining-budget-diff: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
    const c = mkCase(CR);
    const r = run11(oldRoot('inlining-budget-diff'), c);
    assert.ok(problems(r, c, 'inlining-budget-diff', 'D11').length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
});
