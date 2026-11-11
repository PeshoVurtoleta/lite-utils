// test/ibd-scope.test.mjs -- b73 F-B rows G1-G5 for the built root inlining-budget-diff.sh: the default scope is every
// decision line of the compile units that involve a named fn (finding ibd-fable-1, class 1; ruling Q-X-IBD-SCOPE (a)).
// ORACLE: audit/2026-11-11-final/fable/REVIEW.md "ibd-fable-1" GATE + audit/2026-11-11-final/opus/cross/CROSSCHECK.md
// sections 4-5 (G3, G4) and the ruling text in .handoff/RULINGS-final-review.md. No value is copied from a run.
//   * Every run goes through a PRIVATE COPY of the root, with a fake `node` that answers --version / --v8-options / -p and
//     otherwise cats its last argument: each driver IS the canned trace of its side (the --self-test fkr form).
//   * G1  extra decision lines in a unit that involves no fn ([normalizeString@ML]) on the after side -> SAME, exit 0.
//     G2  the same lines inside the unit that compiles m0 ([m0@ML]; no line of that unit names m0) -> DIFF, exit 1.
//     G3  the same lines inside a CALLER unit [caller@ML] that has a line naming m0 -> DIFF, exit 1.
//     G4a --concurrent (one unit "*"): extra lines naming no fn -> NO-VERDICT, exit 2, the new why text.
//     G4b --concurrent: an extra line naming m0 -> DIFF, exit 1.
//     G6  --fn m0,m1: the noise in the second fn's unit -> DIFF; G6c the same under --concurrent (a line naming m1).
//     G7 / G7s the noise in a caller unit whose only line naming m0 is newer V8's `INLINE m0` / `SKIP m0` -> DIFF.
//     G5  (opt-in, LITEUTILS_IBD_LIVE=1, real node >= 24) the reproduction: one driver in a short dir and in a dir
//         two 110-character names deep -> SAME, exit 0; a real-DIFF control (helper grown past the bytecode limit) -> DIFF.
//   * History rows: G1 and G4a run on `git show ef9cf7f:inlining-budget-diff.sh` and must be red there (it reads DIFF);
//     G2, G3, G4b, G6, G6c, G7 and G7s read DIFF there too (regression pins, named so). An unreachable pin skips locally with the reason and
//     FAILS under CI=true (CI_STRICT).
//   * Mutants of the root copy (anchor must match exactly once, else the row FAILS): each must turn its named rows red.
//   * Spawn caps: capSync only. Every temp dir is under one private mkdtemp root, removed on exit.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOTSH = join(HERE, '..', 'inlining-budget-diff.sh');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const CAP = 180000;   // one fake-node ibd run takes ~1-3 s; sized for the slowest CI leg, as test/ext-audit-inl.test.mjs
const CI_STRICT = process.env.CI === 'true';
const OLD = 'ef9cf7f';

function cleanEnv(extra = {}) {
    const e = { ...process.env, ...extra };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_') || k.startsWith('BASH_FUNC_')) delete e[k];
    for (const k of ['EDITOR', 'VISUAL', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'BASH_ENV', 'ENV', 'CDPATH',
        'SHELLOPTS', 'BASHOPTS', 'POSIXLY_CORRECT', 'OUTDIR']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // not a delete: node's child_process re-inserts a missing NODE_V8_COVERAGE key
    delete e.NODE;                    // npm exports NODE and the root defaults --node to it
    return e;
}
const ENV = cleanEnv();

const PRIV = skip ? null : realpathSync(mkdtempSync(join(tmpdir(), 'ibdscope-')));
if (PRIV) after(() => rmSync(PRIV, { recursive: true, force: true }));
let nB = 0;
function putBuild(name, text) {
    const p = join(PRIV, `${++nB}-${name}.sh`);
    writeFileSync(p, text, 'latin1'); chmodSync(p, 0o755);
    return { name, path: p };
}
const ROOT_TEXT = skip ? '' : readFileSync(ROOTSH, 'latin1');
const ROOT_B = skip ? null : putBuild('root', ROOT_TEXT);
function mutant(name, from, to) {
    const n = ROOT_TEXT.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor ${JSON.stringify(from)} matched ${n} times (want 1)`);
    return putBuild(name, ROOT_TEXT.replace(from, () => to));
}

// ---- fake node + canned maglev traces ----
const V8TABLE = [
    '  --turbofan (enable TurboFan)', '        type: bool  default: --turbofan',
    '  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)',
    '        type: int  default: --max-inlined-bytecode-size=460',
    '  --max-maglev-inlined-bytecode-size (maximum size of bytecode for a single Maglev inlining)',
    '        type: int  default: --max-maglev-inlined-bytecode-size=100',
    '  --max-inlined-bytecode-size-small (maximum size of bytecode considered for small function inlining)',
    '        type: int  default: --max-inlined-bytecode-size-small=30',
    '  --reserve-inline-budget-scale-factor (scale factor of bytecode size used to calculate the inlining budget)',
    '        type: float  default: --reserve-inline-budget-scale-factor=1.2',
].join('\n');
const FAKE = `#!/bin/sh
case "$1" in
  --version) echo v26.0.0; exit 0 ;;
  --v8-options) cat <<'EOT'
${V8TABLE}
EOT
    exit 0 ;;
  -p) echo "v26.0.0 (V8 14.0)"; exit 0 ;;
esac
for a; do last=$a; done
cat "$last"
`;
const unitOf = (name, a, lines) => [
    `[compiling method ${a} <JSFunction ${name} (sfi = ${a}0)> (target MAGLEV), mode: ConcurrencyMode::kSynchronous]`,
    ...lines,
    `[completed compiling ${a} <JSFunction ${name} (sfi = ${a}0)> (target MAGLEV) - took 0.1, 0.1, 0.1 ms]`,
];
const HELPER = '== Inlining 0x3 <SharedFunctionInfo helper>';
const NAMES_M0 = '== Inlining 0x4 <SharedFunctionInfo m0>';
const NAMES_M1 = '== Inlining 0x4 <SharedFunctionInfo m1>';
const NOISE = ['== Inlining 0x5 <SharedFunctionInfo isPosixPathSeparator>',
    'greedy inlining 0x5 {0x6 <SharedFunctionInfo isPosixPathSeparator>}: small function, skipping max-depth'];
const M0 = (extra = []) => unitOf('m0', '0x1', [HELPER, ...extra]);
const CALLER = (extra = []) => unitOf('caller', '0x7', [NAMES_M0, ...extra]);
const NS = unitOf('normalizeString', '0x9', NOISE);
const FIX = {
    G1: { before: M0(), after: [...M0(), ...NS] },
    G2: { before: M0(), after: M0(NOISE) },
    G3: { before: [...M0(), ...CALLER()], after: [...M0(), ...CALLER(NOISE)] },
    G4a: { before: unitOf('m0', '0x1', [NAMES_M0, HELPER]), after: [...unitOf('m0', '0x1', [NAMES_M0, HELPER]), ...NS], conc: true },
    G4b: { before: unitOf('m0', '0x1', [NAMES_M0, HELPER]), after: unitOf('m0', '0x1', [NAMES_M0, HELPER, NAMES_M0]), conc: true },
    G6: { fn: 'm0,m1', before: [...M0(), ...unitOf('m1', '0x2', [HELPER])], after: [...M0(), ...unitOf('m1', '0x2', [HELPER, ...NOISE])] },
    G6c: { fn: 'm0,m1', conc: true, before: unitOf('m0', '0x1', [NAMES_M0, NAMES_M1]), after: unitOf('m0', '0x1', [NAMES_M0, NAMES_M1, NAMES_M1]) },
    G7: { before: [...M0(), ...unitOf('caller', '0x7', ['INLINE m0 size (12)'])], after: [...M0(), ...unitOf('caller', '0x7', ['INLINE m0 size (12)', ...NOISE])] },
    G7s: { before: [...M0(), ...unitOf('caller', '0x7', ['SKIP m0 (too big)'])], after: [...M0(), ...unitOf('caller', '0x7', ['SKIP m0 (too big)', ...NOISE])] },
};

function runFix(build, key) {
    const fx = FIX[key];
    const dir = mkdtempSync(join(PRIV, `c-${key}-`));
    try {
        const tmp = join(dir, 'tmp'); mkdirSync(tmp);
        const node = join(dir, 'node'); writeFileSync(node, FAKE); chmodSync(node, 0o755);
        writeFileSync(join(dir, 'b.trace'), fx.before.join('\n') + '\n');
        writeFileSync(join(dir, 'a.trace'), fx.after.join('\n') + '\n');
        const args = [build.path, '--node', node, '--fn', fx.fn || 'm0', '--tiers', 'maglev', '--runs', '2', '--no-bytecode',
            ...(fx.conc ? ['--concurrent'] : []), '--out', join(dir, 'out'), 'b.trace', 'a.trace'];
        const r = capSync('bash', args, { cwd: dir, env: { ...ENV, TMPDIR: tmp }, encoding: 'utf8', killSignal: 'SIGKILL', maxBuffer: 1 << 26 }, CAP, `${build.name} ${key}`);
        const out = (r.stdout || '') + (r.stderr || '');
        return { rc: r.status, out, verdicts: out.split('\n').filter((l) => /^VERDICT /.test(l)), tier: out.split('\n').filter((l) => /^ {2}all decision lines: /.test(l)) };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
const WHY4 = "--concurrent attributes no compile, and no line that differs names a fn (node's own functions compile or not with the driver's path length)";
const CHECK = {
    G1: (o) => { assert.equal(o.rc, 0, o.out); assert.deepEqual(o.verdicts, ['VERDICT SAME'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: SAME -- identical multiset  (lines before/after run 1: 1/1)'], o.out); },
    G2: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 2 line(s) differ  (lines before/after run 1: 1/3)'], o.out); },
    G3: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 2 line(s) differ  (lines before/after run 1: 2/4)'], o.out); },
    G4a: (o) => { assert.equal(o.rc, 2, o.out); assert.deepEqual(o.verdicts, ['VERDICT NO-VERDICT'], o.out);
        assert.deepEqual(o.tier, [`  all decision lines: NO-VERDICT -- ${WHY4}  (lines before/after run 1: 2/4)`], o.out); },
    G4b: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 1 line(s) differ  (lines before/after run 1: 2/3)'], o.out); },
    G6: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 2 line(s) differ  (lines before/after run 1: 2/4)'], o.out); },
    G6c: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 1 line(s) differ  (lines before/after run 1: 2/3)'], o.out); },
    G7: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 2 line(s) differ  (lines before/after run 1: 2/4)'], o.out); },
    G7s: (o) => { assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
        assert.deepEqual(o.tier, ['  all decision lines: DIFF -- 2 line(s) differ  (lines before/after run 1: 2/4)'], o.out); },
};
const NAME = {
    G1: 'G1 extra decision lines in a unit that involves no fn ([normalizeString@ML]) -> SAME exit 0',
    G2: 'G2 the same lines in the unit compiling m0 ([m0@ML], no line names m0) -> DIFF exit 1',
    G3: 'G3 the same lines in a caller unit with a line naming m0 ([caller@ML]) -> DIFF exit 1',
    G4a: 'G4a --concurrent (unit "*"): extra lines naming no fn -> NO-VERDICT exit 2 (why: no differing line names a fn)',
    G4b: 'G4b --concurrent (unit "*"): an extra line naming m0 -> DIFF exit 1',
    G6: 'G6 --fn m0,m1: the noise in [m1@ML], the second fn\'s unit -> DIFF exit 1',
    G6c: 'G6c --fn m0,m1 --concurrent: an extra line naming m1, the second fn -> DIFF exit 1',
    G7: 'G7 the noise in a caller unit whose only m0 line is "INLINE m0" (newer V8) -> DIFF exit 1',
    G7s: 'G7s the noise in a caller unit whose only m0 line is "SKIP m0" (newer V8) -> DIFF exit 1',
};
function red(check, obs, msg) {
    try { check(obs); } catch (e) {
        if (!(e instanceof assert.AssertionError)) throw e;
        return;
    }
    assert.fail(`${msg}\n${obs.out}`);
}

for (const k of Object.keys(FIX)) test(NAME[k], { skip }, () => { CHECK[k](runFix(ROOT_B, k)); });

// ---- mutants: each must turn its named rows red ----
const MUTANTS = [
    ['only == 2 prints every line', '  for (i = 1; i <= nt; i++) if (hit(T[i])) { print; next }', '  print; next', ['G4a']],
    ['the --concurrent NO-VERDICT block without $CONCURRENT == 1', 'if [[ $v == DIFF && -z $fn && $CONCURRENT == 1 ]]', 'if [[ $v == DIFF && -z $fn ]]', ['G3']],   // not G2: hit() has u == g, so every line of [m0@ML] names a fn for only == 2
    ['pass 1 marks a unit by u == g only', 'pass == 1 { for (i = 1; i <= nt; i++) if (hit(T[i])) inv[U] = 1; next }',
        'pass == 1 { for (i = 1; i <= nt; i++) if (u == T[i]) inv[U] = 1; next }', ['G3']],
    ['hit() without u == g (a unit compiling fn is not marked)', ' || u == g || ', ' || ', ['G2']],
    ['the default scope is the whole trace again', 'pass == 1 { for (i = 1; i <= nt; i++) if (hit(T[i])) inv[U] = 1; next }',
        'pass == 1 { print; next }', ['G1']],
    ['pass 1 reads only the first fn', 'pass == 1 { for (i = 1; i <= nt; i++)', 'pass == 1 { for (i = 1; i <= 1; i++)', ['G6']],
    ['the default scope gets the comma-joined --fn', 'else awk -v fns="${TARGETS[*]}"', 'else awk -v fns="$FNS"', ['G6', 'G6c']],
    ['hit() without the SKIP / INLINE clause', ' || ((f[1] == "SKIP" || f[1] ~ /^INLINE/) && f[2] == g) }', ' }', ['G7', 'G7s']],
    ['hit() without SKIP', '(f[1] == "SKIP" || f[1] ~ /^INLINE/) && f[2] == g)', '(f[1] ~ /^INLINE/) && f[2] == g)', ['G7s']],
];
for (const [mn, from, to, rows] of MUTANTS) {
    for (const k of rows) {
        test(`${NAME[k]} [mutant: ${mn} -> red]`, { skip }, () => {
            red(CHECK[k], runFix(mutant(mn.replace(/[^a-z0-9]+/gi, '-'), from, to), k), `the mutant "${mn}" passes ${k}: the row has no teeth`);
        });
    }
}

// ---- history rows: git show ef9cf7f:inlining-budget-diff.sh ----
const have = skip ? 'skip' : (capSync('git', ['cat-file', '-e', `${OLD}^{commit}`], { cwd: HERE, env: ENV, encoding: 'utf8' }, 30000, 'git cat-file ibd-scope old').status === 0
    ? true : `commit ${OLD} not available (shallow clone or no .git)`);
const OLDSKIP = skip || (have === true || CI_STRICT ? false : have);
let OLD_B = null;
function oldBuild() {
    if (OLD_B) return OLD_B;
    const r = capSync('git', ['show', `${OLD}:inlining-budget-diff.sh`], { cwd: HERE, env: ENV, encoding: 'latin1', maxBuffer: 1 << 26 }, 30000, 'git show ibd-scope old');
    assert.equal(r.status, 0, `git show ${OLD}:inlining-budget-diff.sh failed (CI_STRICT: an unreachable pin is a failure)`);
    OLD_B = putBuild(`old-${OLD}`, r.stdout);
    return OLD_B;
}
test(`${NAME.G1} [red on ${OLD}: DIFF exit 1, the two [normalizeString@ML] lines]`, { skip: OLDSKIP }, () => {
    const o = runFix(oldBuild(), 'G1');
    assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
    assert.match(o.out, /^\s*before=0 after=1\s+\[normalizeString@ML\] == Inlining 0x <SharedFunctionInfo isPosixPathSeparator>$/m, o.out);
    red(CHECK.G1, o, `${OLD} passes G1`);
});
test(`${NAME.G4a} [red on ${OLD}: DIFF exit 1]`, { skip: OLDSKIP }, () => {
    const o = runFix(oldBuild(), 'G4a');
    assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
    red(CHECK.G4a, o, `${OLD} passes G4a`);
});
for (const k of ['G2', 'G3', 'G4b', 'G6', 'G6c', 'G7', 'G7s']) {
    test(`${NAME[k]} [regression pin: ${OLD} reads the same]`, { skip: OLDSKIP }, () => { CHECK[k](runFix(oldBuild(), k)); });
}

// ---- G5: the real reproduction (opt-in: real node, Maglev by default from node 24) ----
const MAJOR = Number(process.versions.node.split('.')[0]);
const LIVE = process.env.LITEUTILS_IBD_LIVE === '1';
const G5SKIP = skip || (!LIVE ? 'real node runs are opt-in (LITEUTILS_IBD_LIVE=1): which node functions reach Maglev depends on the node build'
    : MAJOR < 24 ? `node ${process.versions.node} does not run Maglev by default` : false);
const DRV = (helperBody) => ['function helper(x) { ' + helperBody + ' }', 'function m0(x) { return helper(x) + 1; }', 'let acc = 0;',
    'for (let i = 0; i < 300000; i++) acc = (acc + m0(i)) | 0;', "if (acc === 7) console.log('');", ''].join('\n');
const SMALL = 'return x + 1;';
const BIG = 'let y = x | 0; ' + Array.from({ length: 120 }, (_, i) => `y = (y * 31 + ${i}) | 0;`).join(' ') + ' return y;';
// the short side lives in its own mkdtemp under /tmp (21 characters on macOS): os.tmpdir() can already be past the threshold
function runLive(build, before, after) {
    const dir = realpathSync(mkdtempSync('/tmp/lu'));
    try {
        const tmp = join(dir, 'tmp'); mkdirSync(tmp);
        const s = join(dir, 's'), l = join(dir, '0'.repeat(110), '0'.repeat(110));
        mkdirSync(s); mkdirSync(l, { recursive: true });
        writeFileSync(join(s, 'd.mjs'), before); writeFileSync(join(l, 'd.mjs'), after);
        const args = [build.path, '--node', process.execPath, '--fn', 'm0', '--tiers', 'maglev', '--runs', '2', '--no-bytecode',
            '--out', join(dir, 'out'), join(s, 'd.mjs'), join(l, 'd.mjs')];
        const r = capSync('bash', args, { cwd: dir, env: { ...ENV, TMPDIR: tmp }, encoding: 'utf8', killSignal: 'SIGKILL', maxBuffer: 1 << 26 }, CAP, `${build.name} G5`);
        const out = (r.stdout || '') + (r.stderr || '');
        return { rc: r.status, out, verdicts: out.split('\n').filter((x) => /^VERDICT /.test(x)) };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('G5 real node: one driver in a short dir and two 110-character names deep -> SAME exit 0; helper grown past the limit -> DIFF exit 1', { skip: G5SKIP }, () => {
    const o = runLive(ROOT_B, DRV(SMALL), DRV(SMALL));
    assert.equal(o.rc, 0, o.out); assert.deepEqual(o.verdicts, ['VERDICT SAME'], o.out);
    const d = runLive(ROOT_B, DRV(SMALL), DRV(BIG));
    assert.equal(d.rc, 1, d.out); assert.deepEqual(d.verdicts, ['VERDICT DIFF'], d.out);
});
test(`G5 real node [red on ${OLD} where this node build straddles the threshold]`, { skip: G5SKIP || OLDSKIP }, (t) => {
    const o = runLive(oldBuild(), DRV(SMALL), DRV(SMALL));
    if (o.rc === 0) { t.skip(`${OLD} reads SAME here: this node build does not straddle the normalizeString threshold at these lengths`); return; }
    assert.equal(o.rc, 1, o.out); assert.deepEqual(o.verdicts, ['VERDICT DIFF'], o.out);
    assert.match(o.out, /\[normalizeString@ML\]/, o.out);
});
