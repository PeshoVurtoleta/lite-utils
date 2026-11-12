// test/nonpath-cr-refuse.test.mjs -- b77 F-G (LEDGER #126, ruling Q-B75-NONPATH; Q-B76-FGPATH (a)): a newline or a CR in a RAW
// non-path value or in an option NAME is refused, exit 2, before any spawn or write and before any refusal prints it. Oracle =
// .handoff/PLAN-b76-fg.md section 3 ASSERTIONS A1-A6 (the shape of ref-cr-refuse ROW 12), not the code.
//   A1  93 rows on the live roots (ad = allocation-diff, bb = bytecode-budget, dd = deopt-diff, ic = ic-diff, ibd =
//       inlining-budget-diff); the label is the option name:
//       U   `unknown option`, every tool: U1 `--zz<CR>` the first argument, U2 `--zz<CR>=v` after `--runs 3`, U3 `--zz<LF>`;
//           U4 `-z<CR>` the first argument on ad, bb, dd, ic (ADDENDUM A1: ibd reads a single-dash arg as a DRIVER) (19)
//       F   `--fn`: F1 `x<CR>`, F2 `add,x<CR>` (ibd `m0,x<CR>`) on bb report, dd driver, ic, ibd; F1 on bb --diff, dd file mode (10)
//       R   `--runs`: R1 `3<CR>`, R2 `3<LF>` x 5 tools, R1 on ad --zero (11)
//       V   `--v8-flags`: V1 `<CR>x`, V2 a deny flag + CR (`--stress-concurrent-inlining<CR>`, bb `--eval<CR>`), V3 the
//           allowlist-only `--foo-bar<CR>`, V4 position 2 `--no-lazy-feedback-allocation <CR>x`, V6 `--stack-size=100<CR>x`
//           (the P5 shape) x 5 tools; V5 `--max-inlined-bytecode-size=1<CR>` on bb, ibd (27)
//       N   `--node`: N1 `nosuch<CR>`, N2 `<x>/no<CR>/node` (missing), N3 env NODE=`nosuch<CR>` with no --node x 5 tools;
//           N4 bb `<x>/a<LF>b/node` (missing) (16). No row demands a PATH-resolved name (Q-B76-FGPATH (a))
//       M   bb gate `--max` (with --node-version v26.8.2): M1 `a<CR>`, M2 `add=1<CR>`, M3 `add=1,b<CR>=1` (3)
//       W   bb gate `--node-version`: W1 `v26.8.2<CR>`, W2 `v26.8.2<LF>` (2)
//       X   `--fixtures` with --self-test: X1 bb `<x>/fx<CR>`, X2 bb `<x>/fx<LF>`, X3 dd `<x>/fx<CR>` (3)
//       T   ibd `--tiers`: T1 `turbo<CR>`, T2 `turbo,<CR>maglev` (2)
//       EVERY row: rc 2, 0 fake-node spawns, 0 stdout bytes, stderr EXACTLY `<tool>: <label>: a newline or a CR is not allowed
//       (it would forge report lines)\nVERDICT NO-VERDICT\n`, no CR on stderr, no --out dir (`--out <dir>/o` in every mode that
//       takes it; --self-test takes none), the case tree unchanged
//   A2  OLD twin per row: `git show 861f3d3:<root>` (the bytes of .handoff/frozen/b76-fg-before) fails the row AND its stderr
//       carries the raw value with its CR / LF byte (the echo); V3 also >= 2 fake-node spawns before the echo; V6 only fails the
//       row (P5 decides the wording). SKIP when 861f3d3 is unreachable, FAIL under CI=true
//   A4  (regression / parity pins, green on both roots by design) controls: per site family per tool the same shape without the CR / LF (`--zz`, `--fn 1x`, `--runs x`, `--runs 1`,
//       `--v8-flags x.js`, the deny flag, `--foo-bar`, `--node nosuch-g`, ...) plus the six G9 newline texts: rc 2, NOT the new
//       text, and rc + stdout + stderr + spawn count byte-identical to the 861f3d3 root in the same case (A3 parity of G1-G12)
//       budget: per tool one valid run (a logging shim that execs this node): no new text, the spawn argv log identical on live
//       and 861f3d3 (F-G adds 0 spawns), rc 0 / 1 (on node v26.8.2, the version the tools' grammars are recorded on; another
//       node: rc equal live / old)
//   A5  mutants of the live roots (count-checked, exactly one match or the test FAILS), each run on a copy under the mkdtemp top:
//       M1 the arm dropped (x5), M2 each new nl_refuse line dropped (24), M3 the block moved above `NODE_RES=$NODE_BIN` (x5),
//       M4 the first entry only (11: --fn x4, --v8-flags x5, --max, --tiers), M5 the arm matching the newline only (x5), M6 the arm narrowed
//       to `--*` (x4: ad, bb, dd, ic; ADDENDUM A1).
//       Killed = the row is red AND the mutated stderr carries the CR / LF (the echo). Revert check per mutant: on the
//       unmutated live root both halves of that kill assertion fail for every named row
//   A6  retention: the mkdtemp top is removed in after(); the live `git status --porcelain` `??` set is unchanged; 0 --out dirs
//       across the 93 live rows
//   A3  self-test counts: live AND 861f3d3 --self-test, rc 0 and `self-test: N check(s) ok`, N = ad 83, bb 69, dd 107, ic 83,
//       ibd 92 (the PLAN numbers: F-G adds no check); the 861f3d3 half SKIPs / CI=true FAILs as A2
// Own fake node (bash): logs one SPAWN line per call, answers --version / --v8-options (tracked fixture) / -p, else prints its
// last argument's file and exits 0; it is also first on PATH. Editor env stripped, NODE / NODE_V8_COVERAGE set undefined.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const OPTS_FIX = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = '861f3d3';   // b75 docs batch: the roots before F-G (the bytes of .handoff/frozen/b76-fg-before)
const CI_STRICT = process.env.CI === 'true';
const CR = '\r', NL = '\n';
const NEWTEXT = 'a newline or a CR is not allowed';

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) e[k] = undefined;
    for (const k of ['NODE', 'NODE_OPTIONS', 'NODE_V8_COVERAGE', 'EDITOR', 'VISUAL', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'NODE_COMPILE_CACHE',
        'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV',
        'ENV', 'CDPATH']) e[k] = undefined;   // undefined, never a bare delete: npm test exports NODE and the roots read $NODE
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'nonpath-cr-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
const untracked = () => spawn('git', ['status', '--porcelain'], { cwd: PKG }, 'git status --porcelain', 30000).stdout.split('\n').filter((l) => l.startsWith('?? ')).sort();

let GIT0 = null;
before(() => { mkTop(); GIT0 = untracked(); });
after(() => {
    const top = TOP;
    if (top !== null) rmSync(top, { recursive: true, force: true });
    TOP = null;
    assert.ok(top === null || !existsSync(top), `A6: the mkdtemp top ${top} was not removed`);
    assert.deepEqual(untracked(), GIT0, 'A6: the live repo gained / lost untracked entries');
});

const rd = (p) => readFileSync(p, 'utf8');
const msg = (r) => `rc=${r.status}\n--- stdout\n${JSON.stringify(r.stdout)}\n--- stderr\n${JSON.stringify(r.stderr)}`;
const LIVE = (t) => join(PKG, `${t}.sh`);
function once(src, from, to, what) {   // an exact-once, count-checked edit
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `${what}: the anchor ${JSON.stringify(from)} matched ${n} times (want 1)`);
    return src.replace(from, () => to);
}

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

// ---- fake node, cases ----
function fakeText(dir) {
    return ['#!/bin/bash', `D=${JSON.stringify(dir)}`, 'printf "SPAWN\\n" >> "$D/spawn.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        '  -p) echo "v26.8.2 (V8 0)"; exit 0 ;;',
        'esac', 'for a; do last="$a"; done', 'cat -- "$last" 2>/dev/null', 'exit 0', ''].join('\n');
}
// a driver every tool reads a verdict from on a real node (ad's markers, an IC site in add, m0 inlines add)
const DRV = ["const fs = require('node:fs');", 'function add(o) { return o.x + 1; }',
    'function m0(n) { let s = 0; for (let i = 0; i < n; i++) s += add({ x: i }); return s; }',
    "fs.writeSync(1, '@@LITE-MARK start\\n');", 'let t = 0; for (let k = 0; k < 2000; k++) t += m0(500);',
    "fs.writeSync(1, '@@LITE-MARK end\\n');", 'if (t === -1) fs.writeSync(2, String(t));', ''].join('\n');
// one case: dir/{node, cwd, tmp, x/{drv.js, drv2.js, a/Mod.js, b/Mod.js}}; o = dir/o is never created by a refused run
function mkCase() {
    const dir = mk('c');
    const c = { dir, node: join(dir, 'node'), cwd: join(dir, 'cwd'), tmp: join(dir, 'tmp'), o: join(dir, 'o'), x: join(dir, 'x') };
    for (const d of [c.cwd, c.tmp, join(c.x, 'a'), join(c.x, 'b')]) mkdirSync(d, { recursive: true });
    writeFileSync(c.node, fakeText(dir)); chmodSync(c.node, 0o755);
    c.drv = join(c.x, 'drv.js'); writeFileSync(c.drv, DRV);
    c.drv2 = join(c.x, 'drv2.js'); writeFileSync(c.drv2, DRV);
    c.fb = join(c.x, 'b', 'Mod.js'); writeFileSync(c.fb, 'export const add = (a, b) => a + b;\n');
    c.fa = join(c.x, 'a', 'Mod.js'); writeFileSync(c.fa, 'export const add = (a, b) => b + a;\n');
    c.log = join(dir, 'spawn.log');
    c.spawns = () => (existsSync(c.log) ? rd(c.log).split('\n').filter((l) => l !== '').length : 0);
    return c;
}
// every entry under the case dir (recursive, sorted, with the file size): a refusal before any write leaves it as it was
const tree = (c) => readdirSync(c.dir, { recursive: true }).map(String).sort().map((p) => { const s = lstatSync(join(c.dir, p)); return `${p} ${s.isDirectory() ? 'd' : s.size}`; });

const AD = 'allocation-diff', BB = 'bytecode-budget', DD = 'deopt-diff', IC = 'ic-diff', IBD = 'inlining-budget-diff';
const TOOLS = [['ad', AD], ['bb', BB], ['dd', DD], ['ic', IC], ['ibd', IBD]];
const TOOL = { ad: AD, 'ad-zero': AD, bb: BB, 'bb-diff': BB, 'bb-gate': BB, dd: DD, 'dd-file': DD, ic: IC, ibd: IBD, 'bb-st': BB, 'dd-st': DD };
// the valid context of each mode: [[opt, value]...], flags, positionals. A row overrides one option (null drops it)
const BASE = {
    ad: (c) => [[], [], [c.drv, c.drv2]],
    'ad-zero': (c) => [[], ['--zero'], [c.drv]],
    bb: (c) => [[['--fn', 'add']], [], [c.drv]],
    'bb-diff': (c) => [[['--fn', 'add']], ['--diff'], [c.drv, c.drv2]],
    'bb-gate': (c) => [[['--max', 'add=1'], ['--node-version', 'v26.8.2']], [], [c.drv]],
    dd: (c) => [[['--fn', 'add']], [], [c.drv, c.drv2]],
    'dd-file': (c) => [[['--fn', 'add'], ['--driver', c.drv], ['--before', c.fb], ['--after', c.fa]], [], []],
    ic: (c) => [[['--fn', 'add']], [], [c.drv, c.drv2]],
    ibd: (c) => [[['--fn', 'm0'], ['--tiers', 'turbo'], ['--runs', '2']], ['--no-bytecode'], [c.drv, c.drv2]],
};
// a row / control spec: { mode, over: { opt: value | null }, lead: [...], env: {...}, noNode, st: (c) => argv (--self-test) }
function argvOf(S, c) {
    if (S.st) return S.st(c);
    const [opts, flags, pos] = BASE[S.mode](c);
    const over = S.over ? S.over(c) : {};
    const o = opts.filter(([k]) => !(k in over)).concat(Object.entries(over).filter(([, v]) => v !== null));
    const node = S.noNode || '--node' in over ? [] : ['--node', c.node];
    return [...(S.lead || []), ...o.flat(), ...flags, ...pos, ...node, '--out', c.o];
}
function run(root, c, S, what) {
    const env = cleanEnv({ PWD: c.cwd, TMPDIR: c.tmp, PATH: `${c.dir}:${process.env.PATH}`, ...(S.env || {}) });
    return spawn(BASH, [root, ...argvOf(S, c)], { cwd: c.cwd, env }, what, 90000);
}

// ---- A1 rows ----
const ROWS = {};
const row = (id, label, echo, S) => { ROWS[id] = { id, label, echo, tool: TOOL[S.mode], ...S }; };
const MODE = { ad: 'ad', bb: 'bb', dd: 'dd', ic: 'ic', ibd: 'ibd' };
for (const [k] of TOOLS) {
    row(`U1 ${k}`, 'unknown option', `--zz${CR}`, { mode: MODE[k], lead: [`--zz${CR}`] });
    row(`U2 ${k}`, 'unknown option', `--zz${CR}`, { mode: MODE[k], lead: ['--runs', '3', `--zz${CR}=v`], over: () => ({ '--runs': null }) });
    row(`U3 ${k}`, 'unknown option', `--zz${NL}`, { mode: MODE[k], lead: [`--zz${NL}`] });
    // U4 (ADDENDUM A1): a single-dash option name; ibd reads a single-dash arg as a DRIVER (the F-F rows cover it)
    if (k !== 'ibd') row(`U4 ${k}`, 'unknown option', `-z${CR}`, { mode: MODE[k], lead: [`-z${CR}`] });
}
for (const m of ['bb', 'dd', 'ic', 'ibd']) {
    row(`F1 ${m}`, '--fn', `x${CR}`, { mode: m, over: () => ({ '--fn': `x${CR}` }) });
    const f2 = m === 'ibd' ? `m0,x${CR}` : `add,x${CR}`;
    row(`F2 ${m}`, '--fn', `x${CR}`, { mode: m, over: () => ({ '--fn': f2 }) });
}
row('F1 bb-diff', '--fn', `x${CR}`, { mode: 'bb-diff', over: () => ({ '--fn': `x${CR}` }) });
row('F1 dd-file', '--fn', `x${CR}`, { mode: 'dd-file', over: () => ({ '--fn': `x${CR}` }) });
for (const [k] of TOOLS) {
    row(`R1 ${k}`, '--runs', `3${CR}`, { mode: k, over: () => ({ '--runs': `3${CR}` }) });
    row(`R2 ${k}`, '--runs', `3${NL}`, { mode: k, over: () => ({ '--runs': `3${NL}` }) });
}
row('R1 ad-zero', '--runs', `3${CR}`, { mode: 'ad-zero', over: () => ({ '--runs': `3${CR}` }) });
const DENY = { ad: '--stress-concurrent-inlining', bb: '--eval', dd: '--stress-concurrent-inlining', ic: '--stress-concurrent-inlining', ibd: '--stress-concurrent-inlining' };
for (const [k] of TOOLS) {
    const v8 = (id, val, echo, extra = {}) => row(`${id} ${k}`, '--v8-flags', echo, { mode: k, over: () => ({ '--v8-flags': val }), ...extra });
    v8('V1', `${CR}x`, `${CR}x`);
    v8('V2', `${DENY[k]}${CR}`, `${DENY[k]}${CR}`);
    v8('V3', `--foo-bar${CR}`, `--foo-bar${CR}`, { v3: true });
    v8('V4', `--no-lazy-feedback-allocation ${CR}x`, `${CR}x`);
    if (k === 'bb' || k === 'ibd') v8('V5', `--max-inlined-bytecode-size=1${CR}`, `--max-inlined-bytecode-size=1${CR}`);
    v8('V6', `--stack-size=100${CR}x`, null, { v6: true });
}
for (const [k] of TOOLS) {
    row(`N1 ${k}`, '--node', `nosuch${CR}`, { mode: k, over: () => ({ '--node': `nosuch${CR}` }) });
    row(`N2 ${k}`, '--node', `no${CR}/node`, { mode: k, over: (c) => ({ '--node': `${c.x}/no${CR}/node` }) });
    row(`N3 ${k}`, '--node', `nosuch${CR}`, { mode: k, noNode: true, env: { NODE: `nosuch${CR}` } });
}
row('N4 bb', '--node', `a${NL}b/node`, { mode: 'bb', over: (c) => ({ '--node': `${c.x}/a${NL}b/node` }) });
row('M1 bb-gate', '--max', `a${CR}`, { mode: 'bb-gate', over: () => ({ '--max': `a${CR}` }) });
row('M2 bb-gate', '--max', `1${CR}`, { mode: 'bb-gate', over: () => ({ '--max': `add=1${CR}` }) });
row('M3 bb-gate', '--max', `b${CR}`, { mode: 'bb-gate', over: () => ({ '--max': `add=1,b${CR}=1` }) });
row('W1 bb-gate', '--node-version', `v26.8.2${CR}`, { mode: 'bb-gate', over: () => ({ '--node-version': `v26.8.2${CR}` }) });
row('W2 bb-gate', '--node-version', `v26.8.2${NL}`, { mode: 'bb-gate', over: () => ({ '--node-version': `v26.8.2${NL}` }) });
row('X1 bb', '--fixtures', `fx${CR}`, { mode: 'bb-st', st: (c) => ['--self-test', '--fixtures', `${c.x}/fx${CR}`] });
row('X2 bb', '--fixtures', `fx${NL}`, { mode: 'bb-st', st: (c) => ['--self-test', '--fixtures', `${c.x}/fx${NL}`] });
row('X3 dd', '--fixtures', `fx${CR}`, { mode: 'dd-st', st: (c) => ['--self-test', '--fixtures', `${c.x}/fx${CR}`] });
row('T1 ibd', '--tiers', `turbo${CR}`, { mode: 'ibd', over: () => ({ '--tiers': `turbo${CR}` }) });
row('T2 ibd', '--tiers', `${CR}maglev`, { mode: 'ibd', over: () => ({ '--tiers': `turbo,${CR}maglev` }) });
const FAM = { U: 19, F: 10, R: 11, V: 27, N: 16, M: 3, W: 2, X: 3, T: 2 };

const want = (tool, label) => `${tool}: ${label}: a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`;
// the ONE oracle: the list of failed expectations (empty = the fixed behaviour)
function problems(r, c, R, tree0) {
    const bad = [];
    if (r.status !== 2) bad.push(`rc ${r.status} != 2`);
    if (c.spawns() !== 0) bad.push(`${c.spawns()} fake-node spawns != 0`);
    if (r.stdout !== '') bad.push(`${r.stdout.length} stdout bytes != 0`);
    if (r.stderr !== want(R.tool, R.label)) bad.push(`stderr is not exactly ${JSON.stringify(want(R.tool, R.label))}`);
    if (r.stderr.includes(CR)) bad.push('a CR on stderr');
    if (existsSync(c.o)) bad.push('--out dir created');
    const t = tree(c);
    if (JSON.stringify(t) !== JSON.stringify(tree0)) bad.push(`the case tree changed: ${JSON.stringify(tree0)} -> ${JSON.stringify(t)}`);
    return bad;
}
function runRow(root, R, what) {
    const c = mkCase(); const tree0 = tree(c);
    const r = run(root, c, R, what);
    return { r, c, bad: problems(r, c, R, tree0), outMade: existsSync(c.o) };
}
const killed = (x, R) => x.bad.length > 0 && R.echo !== null && x.r.stderr.includes(R.echo);   // red AND the raw echo on stderr
const LIVE_RES = {};
let OUT_MADE = 0;
function liveRow(id) {
    if (!LIVE_RES[id]) { LIVE_RES[id] = runRow(LIVE(ROWS[id].tool), ROWS[id], id); if (LIVE_RES[id].outMade) OUT_MADE++; }
    return LIVE_RES[id];
}

test('A1 census: 93 rows, per family U 19 / F 10 / R 11 / V 27 / N 16 / M 3 / W 2 / X 3 / T 2', () => {
    const got = {};
    for (const id of Object.keys(ROWS)) got[id[0]] = (got[id[0]] || 0) + 1;
    assert.deepEqual(got, FAM);
    assert.equal(Object.keys(ROWS).length, 93);
});
for (const [id, R] of Object.entries(ROWS)) {
    test(`A1 ${id} (${R.tool}, label ${R.label}): rc 2, 0 spawns, the exact G-X6 refusal, no CR on stderr, no --out, the case tree unchanged`, { skip }, () => {
        const x = liveRow(id);
        assert.deepEqual(x.bad, [], msg(x.r));
    });
    test(`A2 OLD twin ${id}: the ${OLD_SHA} root fails the row${R.v6 ? '' : ' and echoes the raw value'}${R.v3 ? ' after >= 2 spawns' : ''}`, { skip: OLDSKIP }, () => {
        const x = runRow(oldRoot(R.tool), R, `${id} (old)`);
        assert.ok(x.bad.length > 0, `old root already meets the row (the row has no teeth)\n${msg(x.r)}`);
        if (!R.v6) assert.ok(x.r.stderr.includes(R.echo), `old stderr does not carry ${JSON.stringify(R.echo)}\n${msg(x.r)}`);
        if (R.v3) assert.ok(x.c.spawns() >= 2, `V3: ${x.c.spawns()} old spawns before the echo (want >= 2)\n${msg(x.r)}`);
    });
}

// ---- A4 controls (and A3 parity of G1-G12, G9): the same shapes without the CR / LF, live == 861f3d3 in one case ----
const CTL = {};
const ctl = (id, S) => { CTL[id] = { id, tool: TOOL[S.mode], ...S }; };
for (const [k] of TOOLS) {
    ctl(`unknown --zz ${k}`, { mode: k, lead: ['--zz'] });
    ctl(`G1 unknown --nod x ${k}`, { mode: k, lead: ['--nod', 'x'] });
    ctl(`G3 --runs x ${k}`, { mode: k, over: () => ({ '--runs': 'x' }) });
    ctl(`G2 --runs 1 ${k}`, { mode: k, over: () => ({ '--runs': '1' }) });
    ctl(`G5 --v8-flags x.js ${k}`, { mode: k, over: () => ({ '--v8-flags': 'x.js' }) });
    ctl(`G6 --v8-flags ${DENY[k]} ${k}`, { mode: k, over: () => ({ '--v8-flags': DENY[k] }) });
    ctl(`--v8-flags --foo-bar (allowlist, 2 spawns) ${k}`, { mode: k, over: () => ({ '--v8-flags': '--foo-bar' }) });
    ctl(`--v8-flags --no-lazy-feedback-allocation x ${k}`, { mode: k, over: () => ({ '--v8-flags': '--no-lazy-feedback-allocation x' }) });
    ctl(`G7 --node nosuchnode-g ${k}`, { mode: k, over: () => ({ '--node': 'nosuchnode-g' }) });
    ctl(`G8 --node /nonexistent-g/node ${k}`, { mode: k, over: () => ({ '--node': '/nonexistent-g/node' }) });
    ctl(`env NODE=nosuchnode-g ${k}`, { mode: k, noNode: true, env: { NODE: 'nosuchnode-g' } });
    if (k !== 'ad') ctl(`G4 --fn 1add ${k}`, { mode: k, over: () => ({ '--fn': '1add' }) });
    if (k !== 'ad') ctl(`--fn ${k === 'ibd' ? 'm0' : 'add'},1x ${k}`, { mode: k, over: () => ({ '--fn': `${k === 'ibd' ? 'm0' : 'add'},1x` }) });
    if (k === 'bb' || k === 'ibd') ctl(`--v8-flags --max-inlined-bytecode-size=x ${k}`, { mode: k, over: () => ({ '--v8-flags': '--max-inlined-bytecode-size=x' }) });
}
ctl('--runs x ad-zero', { mode: 'ad-zero', over: () => ({ '--runs': 'x' }) });
ctl('--fn 1x bb-diff', { mode: 'bb-diff', over: () => ({ '--fn': '1x' }) });
ctl('--fn 1x dd-file', { mode: 'dd-file', over: () => ({ '--fn': '1x' }) });
ctl('--node <x>/no/node bb', { mode: 'bb', over: (c) => ({ '--node': `${c.x}/no/node` }) });
ctl('G10 --max a bb-gate', { mode: 'bb-gate', over: () => ({ '--max': 'a' }) });
ctl('G10 --max a=x bb-gate', { mode: 'bb-gate', over: () => ({ '--max': 'a=x' }) });
ctl('--max add=1,b@=1 bb-gate', { mode: 'bb-gate', over: () => ({ '--max': 'add=1,b@=1' }) });
ctl('G10 --node-version 26.8.2 bb-gate', { mode: 'bb-gate', over: () => ({ '--node-version': '26.8.2' }) });
ctl('G11 --self-test --fixtures /nonexistent-g bb', { mode: 'bb-st', st: () => ['--self-test', '--fixtures', '/nonexistent-g'] });
ctl('G11 --self-test --fixtures /nonexistent-g dd', { mode: 'dd-st', st: () => ['--self-test', '--fixtures', '/nonexistent-g'] });
ctl('G12 --tiers foo ibd', { mode: 'ibd', over: () => ({ '--tiers': 'foo' }) });
ctl('--tiers turbo,foo ibd', { mode: 'ibd', over: () => ({ '--tiers': 'turbo,foo' }) });
// G9: the existing newline refusal texts stay byte-identical
for (const k of ['ic', 'dd', 'bb', 'ibd']) ctl(`G9 --fn a<LF>b ${k}`, { mode: k, over: () => ({ '--fn': `a${NL}b` }), g9: true });
ctl('G9 --v8-flags a<LF>b ad', { mode: 'ad', over: () => ({ '--v8-flags': `a${NL}b` }), g9: true });
ctl('G9 --self-test --fixtures a<LF>b dd', { mode: 'dd-st', st: () => ['--self-test', '--fixtures', `a${NL}b`], g9: true });
for (const [id, S] of Object.entries(CTL)) {
    test(`A4 control ${id}: rc 2, not the new text, rc / stdout / stderr / spawns identical to the ${OLD_SHA} root`, { skip: OLDSKIP }, () => {
        const c = mkCase();
        const r = run(LIVE(S.tool), c, S, `${id} (control live)`); const n = c.spawns();
        const o = run(oldRoot(S.tool), c, S, `${id} (control old)`); const n2 = c.spawns() - n;
        assert.equal(r.status, 2, msg(r));
        assert.ok(r.stderr !== '' && (S.g9 || !r.stderr.includes(NEWTEXT)), msg(r));
        assert.deepEqual([r.status, r.stdout, r.stderr, n], [o.status, o.stdout, o.stderr, n2], `live vs old\n${msg(r)}\n--- old\n${msg(o)}`);
    });
}

// A4 budget: one valid run per tool on this node (a shim logs argv, then execs it); the argv log is identical live / old
const BUDGET = {
    [AD]: (c) => ['--runs', '2', c.drv, c.drv2],
    [BB]: (c) => ['--fn', 'add', c.drv],
    [DD]: (c) => ['--fn', 'add', '--runs', '2', c.drv, c.drv2],
    [IC]: (c) => ['--fn', 'add', '--runs', '2', c.drv, c.drv2],
    [IBD]: (c) => ['--fn', 'm0', '--tiers', 'turbo', '--runs', '2', '--no-bytecode', c.drv, c.drv2],
};
function budgetRun(root, tool, what) {
    const c = mkCase();
    writeFileSync(c.node, ['#!/bin/bash', `printf 'SPAWN %s\\n' "$*" >> ${JSON.stringify(c.log)}`, `exec ${JSON.stringify(process.execPath)} "$@"`, ''].join('\n'));
    const r = spawn(BASH, [root, ...BUDGET[tool](c), '--node', c.node, '--out', c.o], { cwd: c.cwd, env: cleanEnv({ PWD: c.cwd, TMPDIR: c.tmp }) }, what, 600000);
    // the case dir and the tools' mktemp suffixes differ per run: masked
    const log = existsSync(c.log) ? rd(c.log).split(c.dir).join('<C>').replace(/\.[A-Za-z0-9]{6}(?=[/\s]|$)/gm, '.XXXXXX').split('\n').filter((l) => l !== '') : [];
    return { r, log };
}
for (const [k, tool] of TOOLS) {
    test(`A4 budget ${k}: a valid run, no new text, the spawn argv log identical on live and ${OLD_SHA} (F-G adds 0 spawns)`, { skip: OLDSKIP }, () => {
        const L = budgetRun(LIVE(tool), tool, `${k} budget live`);
        const O = budgetRun(oldRoot(tool), tool, `${k} budget old`);
        assert.ok(!L.r.stderr.includes(NEWTEXT) && !L.r.stdout.includes(NEWTEXT), msg(L.r));
        if (process.version === 'v26.8.2') assert.ok(L.r.status === 0 || L.r.status === 1, `live rc ${L.r.status}\n${msg(L.r)}`);
        assert.equal(L.r.status, O.r.status, `live rc vs old rc\n${msg(L.r)}\n--- old\n${msg(O.r)}`);
        assert.ok(L.log.length >= 1, 'the valid run spawned no node');
        assert.deepEqual(L.log, O.log);
    });
}

// ---- A5 mutants of the live roots (exact once, run on copies under the mkdtemp top) ----
const ARM = (k) => (k === 'ibd'
    ? "    --*$'\\n'*|--*$'\\r'*) nl_refuse \"unknown option\" \"$a\" ;;   # G-X6 (ruling Q-B75-NONPATH): never echo the option name\n"
    : "    -*$'\\n'*|-*$'\\r'*) nl_refuse \"unknown option\" \"$a\" ;;   # G-X6 (ruling Q-B75-NONPATH): never echo the option name\n");
const ARM_PAT = (k) => (k === 'ibd' ? "--*$'\\n'*|--*$'\\r'*)" : "-*$'\\n'*|-*$'\\r'*)");
const ARM_LF = (k) => (k === 'ibd' ? "--*$'\\n'*)" : "-*$'\\n'*)");
// the new value lines per tool, in block order: [option, variable]
const LINES = {
    ad: [['--runs', 'RUNS'], ['--v8-flags', 'V8FLAGS'], ['--node', 'NODE_BIN']],
    bb: [['--fn', 'FNLIST'], ['--max', 'MAXLIST'], ['--node-version', 'WANT_VER'], ['--runs', 'RUNS'], ['--v8-flags', 'V8FLAGS'], ['--node', 'NODE_BIN']],
    dd: [['--fn', 'FNLIST'], ['--runs', 'RUNS'], ['--v8-flags', 'V8FLAGS'], ['--node', 'NODE_BIN']],
    ic: [['--fn', 'FNLIST'], ['--runs', 'RUNS'], ['--v8-flags', 'V8FLAGS'], ['--node', 'NODE_BIN']],
    ibd: [['--fn', 'FNS'], ['--runs', 'RUNS'], ['--tiers', 'TIERS'], ['--v8-flags', 'V8FLAGS'], ['--node', 'NODE_BIN']],
};
const NLR = (o, v) => `nl_refuse "${o}" "$${v}"`;
const C1 = '# G-X6 (ruling Q-B75-NONPATH): the raw non-path values, before any refusal prints them (a CR in each; a newline in --runs)\n';
const BLOCK_C = { ad: C1, dd: C1, ic: C1, ibd: C1,
    bb: '# G-X6 (ruling Q-B75-NONPATH): the raw non-path values, before any refusal prints them (a CR in each; a newline in\n# --node-version, --runs and --node)\n' };
const BLOCK = (k) => BLOCK_C[k] + LINES[k].map(([o, v]) => `${NLR(o, v)}\n`).join('');
const NODE_RES = 'NODE_RES=$NODE_BIN\n';
const rowsOf = (k, pred) => Object.values(ROWS).filter((R) => R.tool === TOOL[k] && pred(R)).map((R) => R.id);
const MUTANTS = [];
for (const [k, tool] of TOOLS) {
    MUTANTS.push({ id: `M1 ${k} arm dropped`, tool, edits: [[ARM(k), '']], rows: rowsOf(k, (R) => R.id[0] === 'U') });
    MUTANTS.push({ id: `M5 ${k} arm matches the newline only`, tool, edits: [[ARM(k), ARM(k).replace(ARM_PAT(k), () => ARM_LF(k))]], rows: [`U1 ${k}`, `U2 ${k}`] });
    if (k !== 'ibd') MUTANTS.push({ id: `M6 ${k} arm narrowed to --*`, tool, edits: [[ARM(k), ARM(k).replace(ARM_PAT(k), () => ARM_PAT('ibd'))]], rows: [`U4 ${k}`] });
    const lines = LINES[k].concat(k === 'bb' || k === 'dd' ? [['--fixtures', 'FIXTURES']] : []);
    for (const [o, v] of lines) {
        // V6 is outside the kill set: its echo is the report-head forge of P5, not a stderr echo
        MUTANTS.push({ id: `M2 ${k} ${o} line dropped`, tool, edits: [[NLR(o, v), ':']], rows: rowsOf(k, (R) => R.label === o && !R.v6) });
    }
    // moved below the value checks: every row of a value those checks echo goes red; --node (checked at NODE_RES), the arm,
    // --fixtures (its own line) and V3 / V6 (the allowlist runs after NODE_RES) stay green by design
    MUTANTS.push({ id: `M3 ${k} block moved above NODE_RES=$NODE_BIN`, tool, edits: [[BLOCK(k), ''], [NODE_RES, BLOCK(k) + NODE_RES]],
        rows: rowsOf(k, (R) => !['unknown option', '--node', '--fixtures'].includes(R.label) && !R.v3 && !R.v6) });
    MUTANTS.push({ id: `M4 ${k} --v8-flags first entry only`, tool, edits: [[NLR('--v8-flags', 'V8FLAGS'), 'nl_refuse "--v8-flags" "${V8FLAGS%% *}"']], rows: [`V4 ${k}`] });
    if (k !== 'ad') {
        const v = k === 'ibd' ? 'FNS' : 'FNLIST', cut = k === 'ibd' ? '%%[, ]*' : '%%,*';
        MUTANTS.push({ id: `M4 ${k} --fn first entry only`, tool, edits: [[NLR('--fn', v), `nl_refuse "--fn" "\${${v}${cut}}"`]], rows: [`F2 ${k}`] });
    }
}
MUTANTS.push({ id: 'M4 bb --max first entry only', tool: BB, edits: [[NLR('--max', 'MAXLIST'), 'nl_refuse "--max" "${MAXLIST%%,*}"']], rows: ['M3 bb-gate'] });
MUTANTS.push({ id: 'M4 ibd --tiers first entry only', tool: IBD, edits: [[NLR('--tiers', 'TIERS'), 'nl_refuse "--tiers" "${TIERS%%[, ]*}"']], rows: ['T2 ibd'] });
const MUT = {};
function mutRoot(m) {
    if (MUT[m.id]) return MUT[m.id];
    const live = rd(LIVE(m.tool));
    let src = live;
    for (const [from, to] of m.edits) { assert.notEqual(from, to, `${m.id}: a no-op edit`); src = once(src, from, to, m.id); }
    assert.notEqual(src, live, `${m.id}: the mutant equals the live root`);
    const p = join(mk('mut'), `${m.tool}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return (MUT[m.id] = p);
}
test('A5 census: 54 mutants (M1 5, M2 24, M3 5, M4 11, M5 5, M6 4), each naming >= 1 row', () => {
    const got = {};
    for (const m of MUTANTS) { got[m.id.slice(0, 2)] = (got[m.id.slice(0, 2)] || 0) + 1; assert.ok(m.rows.length > 0, `${m.id} names no row`); }
    assert.deepEqual(got, { M1: 5, M2: 24, M3: 5, M4: 11, M5: 5, M6: 4 });
});
for (const m of MUTANTS) {
    test(`A5 mutant ${m.id}: rows ${m.rows.join(', ')} go red with the raw value on stderr`, { skip }, () => {
        const p = mutRoot(m);
        for (const id of m.rows) {
            assert.ok(ROWS[id], `mutant ${m.id} names an unknown row ${id}`);
            const x = runRow(p, ROWS[id], `${id} (${m.id})`);
            assert.ok(killed(x, ROWS[id]), `mutant ${m.id} survives row ${id}: ${JSON.stringify(x.bad)}\n${msg(x.r)}`);
        }
    });
    test(`A5 mutant ${m.id}: revert check (the unmutated live root fails both halves of the kill assertion)`, { skip }, () => {
        for (const id of m.rows) {
            const x = liveRow(id);
            assert.deepEqual(x.bad, [], `revert: row ${id} is red on the live root\n${msg(x.r)}`);
            assert.ok(!x.r.stderr.includes(ROWS[id].echo), `revert: the live stderr carries ${JSON.stringify(ROWS[id].echo)}`);
        }
    });
}

test('A6: 0 --out dirs created across the 93 live rows', { skip }, () => {
    for (const id of Object.keys(ROWS)) liveRow(id);
    assert.equal(Object.keys(LIVE_RES).length, 93);
    assert.equal(OUT_MADE, 0);
});


// ---- A3 self-test counts (PLAN section 2: "Self-test counts do not change") ----
const COUNT = { [AD]: 83, [BB]: 69, [DD]: 107, [IC]: 83, [IBD]: 92 };
function selfTest(root, what) {
    const d = mk('st'); const cwd = join(d, 'cwd'), tmp = join(d, 'tmp'); mkdirSync(cwd); mkdirSync(tmp);
    return spawn(BASH, [root, '--self-test'], { cwd, env: cleanEnv({ PWD: cwd, TMPDIR: tmp }) }, what, 900000);
}
for (const [tool, n] of Object.entries(COUNT)) {
    const line = `self-test: ${n} check(s) ok`;
    for (const [side, sk, root] of [['live', skip, () => LIVE(tool)], [OLD_SHA, OLDSKIP, () => oldRoot(tool)]]) {
        test(`A3 ${tool} --self-test (${side}): rc 0, "${line}"`, { skip: sk }, () => {
            const r = selfTest(root(), `${tool} --self-test (${side})`);
            assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-2000));
            assert.ok(r.stdout.split('\n').includes(line), r.stdout.slice(-2000));
        });
    }
}
