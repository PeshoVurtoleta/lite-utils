// test/audit-xs.test.mjs -- b67 group G-XS, helper batch B3: rows of .handoff/PLAN-b67-gxs.md ASSERTIONS 1-6 (findings X1-X5,
// X7, X8 of audit/2026-11-10-cross-script/FINDINGS.md). Oracle: the PLAN text (exit codes, exact stderr, spawn counts), never
// what a root printed. Live = the repo-root inlining-budget-diff.sh / bytecode-budget.sh. Old = `git show dc4a10c:<root>`
// (sha256/8 pinned below); a history row SKIPs locally when the commit is missing and FAILS when CI=true (like audit-g5).
// Every live row has an OLD twin that asserts the old (wrong) behaviour, so the live assertion has teeth: the old root fails it.
//   A1 X1  ibd: `--runs 3 --runs 3 a b`, `--fn a --fn b --only-fn`, `--tiers turbo --tiers maglev` -> exit 2, 0 spawns, stderr
//          exactly `inlining-budget-diff: --<opt> given twice (give one comma list)\nVERDICT NO-VERDICT\n`. Old: judged.
//   A2 X2/X3 ibd: `--run 3` -> did-you-mean; `--self-test --no-such-option` -> exit 2 "unknown option"; `--self-test --fn m0`
//          -> exit 2 "--self-test takes no other argument". Old: rc 0 (self-test ran).
//   A3 X5/X7 ibd: `--v8-flags '  '` -> exit 2, 0 spawns, "only blanks" (old 4 spawns); 300-byte --out component -> exit 2, exactly
//          2 spawns (LEDGER #76), `--out: cannot create`, no "unexpected error" (old: `unexpected error (exit 1)`).
//   A4 X8  bb: `--node-version v27.0.0-alpha.0.0.0` -> exit 2, 0 spawns, text `a release version: a prerelease or nightly node`.
//   A5 X4  control: a copy with `check() { :; }` injected right after check()'s definition: bb / ibd --self-test exit 1 and no
//          `check(s) ok` line; the old copy exits 0 "all checks passed". Live last line pins: ibd IBD_SELFTEST_N, bb BB_SELFTEST_N.
//   A6     spawn budget 0 on A1, A2, A4 and the A3 blanks row; TMPDIR (private) holds nothing afterwards (no inl-diff-* left).
// Where the PLAN gives no exact text (the did-you-mean beyond the quoted parenthesis, "unknown option") the row asserts the
// quoted substring only.
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
const IBD = join(PKG, 'inlining-budget-diff.sh');
const BB = join(PKG, 'bytecode-budget.sh');
const V8OPT = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = 'dc4a10c';
const OLD_SHA8 = { 'inlining-budget-diff.sh': 'e297d240', 'bytecode-budget.sh': 'f1070535' };
const IBD_SELFTEST_N = 92;   // PLAN ASSERTION 5: the live ibd self-test last line count (b70 NULLCTL: 89 -> 92)
const BB_SELFTEST_N = 69;    // BB_SELFTEST_N: filled from the frozen bb --self-test `^ok ` row count (PLAN: counts unchanged; b70 NULLCTL: 68 -> 69)
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);

// child env: no inherited steering of git / node / editors; V8 coverage undefined (a delete is not a strip)
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
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-xs-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

const rd = (p) => readFileSync(p, 'utf8');
const wl = (p) => (existsSync(p) ? rd(p).split('\n').filter((l) => l !== '') : []);
const sha8 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 8);
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const code = (r, want, what) => assert.equal(r.status, want, `${what}: exit\n${msg(r)}`);
const lastLine = (s) => { const l = s.split('\n').filter((x) => x !== ''); return l.length ? l[l.length - 1] : ''; };

// ---- old roots (git history, read only) ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || histSkip(haveOld);
const OLD = {};
function oldRoot(name) {
    if (haveOld !== true) assert.fail(`${haveOld} (CI=true: a history row fails, never skips)`);
    if (OLD[name]) return OLD[name];
    const g = spawn('git', ['show', `${OLD_SHA}:${name}`], { cwd: PKG, encoding: 'buffer' }, `git show ${name}`, 30000);
    assert.equal(g.status, 0, String(g.stderr));
    assert.equal(sha8(g.stdout), OLD_SHA8[name], `git show ${OLD_SHA}:${name} must hash to ${OLD_SHA8[name]}`);
    const p = join(mk('old'), name);
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD[name] = p);
}

// ---- the fake node: logs argv to spawns.log beside itself; -p / --v8-options / --print-bytecode canned; else cats its LAST arg ----
const FAKE = [
    '#!/bin/sh',
    'h=$(dirname "$0")',
    'printf \'%s\\n\' "$*" >> "$h/spawns.log"',
    'case "$1" in',
    '  --version) echo v26.0.0; exit 0 ;;',
    '  --v8-options) cat "$h/v8-options.txt"; exit 0 ;;',
    '  -p) echo "v26.0.0 (V8 14.0)"; exit 0 ;;',
    'esac',
    'case " $* " in *" --print-bytecode "*) printf \'[generated bytecode for function: read.set (0x2 <SharedFunctionInfo read.set>)]\\nBytecode length: 285\\n\'; exit 0 ;; esac',
    'for a; do last="$a"; done',
    'cat "$last"',
    '',
].join('\n');
const TRACE = [
    '[compiling method 0x1d860 <JSFunction read.set (sfi = 0x1d861)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]',
    'Considering 0x1d862 {0x1d863 <SharedFunctionInfo markDownstream>} for inlining with 0x1d864 {0x1d865 <FeedbackVector[33]>}',
    'Inlining 0x1d862 {0x1d863 <SharedFunctionInfo markDownstream>} into 0x1d860 {0x1d861 <SharedFunctionInfo read.set>}',
    '[completed compiling 0x1d860 <JSFunction read.set (sfi = 0x1d861)> (target TURBOFAN_JS) - took 0.1, 2.0, 0.1 ms]',
].join('\n') + '\n';
// one case: private dir with bin/node (fake), tmp/ (TMPDIR), w/ (cwd) holding drivers a.mjs / b.mjs
function mkCase() {
    const dir = mk('c');
    const c = { dir, bin: join(dir, 'bin'), tmp: join(dir, 'tmp'), w: join(dir, 'w') };
    mkdirSync(c.bin); mkdirSync(c.tmp); mkdirSync(c.w);
    c.node = join(c.bin, 'node');
    writeFileSync(c.node, FAKE); chmodSync(c.node, 0o755);
    writeFileSync(join(c.bin, 'v8-options.txt'), rd(V8OPT));
    writeFileSync(join(c.w, 'a.mjs'), TRACE); writeFileSync(join(c.w, 'b.mjs'), TRACE);
    c.spawns = () => wl(join(c.bin, 'spawns.log'));
    c.tmpLeft = () => readdirSync(c.tmp);
    return c;
}
// a run whose argv has --self-test gets SELF_CAP by default (b68 CI-CAP, LEDGER #115: the ibd self-test cap, 3x 61.3 s;
// it also covers bb's 180000); every other run keeps 120000
const SELF_CAP = 210000;
const capFor = (args) => (args.some((a) => a.startsWith('--self-test')) ? SELF_CAP : 120000);
function run(root, c, args, what, cap = capFor(args)) {
    return spawn(BASH, [root, ...args], { cwd: c.w, env: cleanEnv({ TMPDIR: c.tmp }) }, `${what}`, cap);
}
// as run(), with NODE=<fake node> so a row whose argv must not carry --node still counts spawns
function runN(root, c, args, what, cap = capFor(args)) {
    return spawn(BASH, [root, ...args], { cwd: c.w, env: cleanEnv({ TMPDIR: c.tmp, NODE: c.node }) }, `${what}`, cap);
}
// ibd base argv for driver mode (every option here is given ONCE; a row adds its own extras)
const base = (c, drop = []) => [['--tiers', 'turbo'], ['--runs', '2'], ['--fn', 'read.set'], ['--no-bytecode'], ['--node', c.node], ['--out', join(c.dir, 'o')]]
    .filter((p) => !drop.includes(p[0])).flat();
const GT = (opt) => `inlining-budget-diff: ${opt} given twice (give one comma list)\nVERDICT NO-VERDICT\n`;

// =====================================================================================================================
// A1 X1: a value option given twice (ASSERTIONS 1)
// =====================================================================================================================
const A1 = [
    ['--runs', ['--runs', '3', '--runs', '3'], ['--runs', '--only-fn']],
    ['--fn', ['--fn', 'a', '--fn', 'b', '--only-fn'], ['--fn']],
    ['--tiers', ['--tiers', 'turbo', '--tiers', 'maglev'], ['--tiers']],
];
for (const [opt, extra, drop] of A1) {
    const argv = (c) => [...extra, ...base(c, drop.filter((d) => d !== '--only-fn')).filter((x) => x !== '--only-fn'), 'a.mjs', 'b.mjs'];
    test(`A1 X1: ibd ${extra.join(' ')} -> exit 2, 0 spawns, exact "${opt} given twice" stderr`, { skip }, () => {
        const c = mkCase();
        const r = run(IBD, c, argv(c), `ibd ${opt} twice`);
        code(r, 2, opt);
        assert.equal(r.stderr, GT(opt), `${opt}: stderr\n${msg(r)}`);
        assert.deepEqual(c.spawns(), [], `${opt}: 0 spawns`);
        assert.deepEqual(c.tmpLeft(), [], `${opt}: TMPDIR must stay empty`);
    });
    test(`A1 X1 old twin: the old ibd does not refuse ${opt} twice (no "given twice")${opt === '--fn' ? ', judges it (> 0 spawns)' : ''}`, { skip: OLDSKIP }, () => {
        const c = mkCase();
        const r = run(oldRoot('inlining-budget-diff.sh'), c, argv(c), `old ibd ${opt} twice`);
        assert.equal(r.stderr.includes('given twice'), false, msg(r));
        if (opt === '--fn') assert.ok(c.spawns().length > 0, `old --fn a --fn b --only-fn is judged: spawns=${c.spawns().length}\n${msg(r)}`);
    });
}

// =====================================================================================================================
// A2 X2 / X3: unknown option hint, --self-test strictness (ASSERTIONS 2)
// =====================================================================================================================
test('A2 X2: ibd --run 3 -> exit 2, "(did you mean --runs?)", 0 spawns', { skip }, () => {
    const c = mkCase();
    const r = run(IBD, c, ['--run', '3', ...base(c, ['--runs']), 'a.mjs', 'b.mjs'], 'ibd --run');
    code(r, 2, '--run 3');
    assert.ok(r.stderr.includes('(did you mean --runs?)'), msg(r));
    assert.deepEqual(c.spawns(), []);
    assert.deepEqual(c.tmpLeft(), []);
});
test('A2 X2 old twin: the old ibd says "unknown option --run" with NO did-you-mean', { skip: OLDSKIP }, () => {
    const c = mkCase();
    const r = run(oldRoot('inlining-budget-diff.sh'), c, ['--run', '3', ...base(c, ['--runs']), 'a.mjs', 'b.mjs'], 'old ibd --run');
    assert.ok(r.stderr.includes('unknown option --run'), msg(r));
    assert.equal(r.stderr.includes('did you mean'), false, msg(r));
});
test('A2 X3: ibd --self-test --no-such-option -> exit 2 "unknown option", 0 spawns', { skip }, () => {
    const c = mkCase();
    const r = runN(IBD, c, ['--self-test', '--no-such-option'], 'ibd --self-test --no-such-option');
    code(r, 2, '--self-test --no-such-option');
    assert.ok(r.stderr.includes('unknown option'), msg(r));
    assert.equal(r.stdout.includes('self-test'), false, 'the self-test must not run');
    assert.deepEqual(c.spawns(), []);
    assert.deepEqual(c.tmpLeft(), []);
});
test('A2 X3: ibd --self-test --fn m0 -> exit 2 "--self-test takes no other argument", 0 spawns', { skip }, () => {
    const c = mkCase();
    const r = runN(IBD, c, ['--self-test', '--fn', 'm0'], 'ibd --self-test --fn m0');
    code(r, 2, '--self-test --fn m0');
    assert.ok(r.stderr.includes('--self-test takes no other argument'), msg(r));
    assert.deepEqual(c.spawns(), []);
    assert.deepEqual(c.tmpLeft(), []);
});
// X3 post-loop clauses: a flag option (GOTOPT stays empty) or a driver path after --self-test reaches the
// ${#POS[@]} -eq 0 / $ONLY$CONCURRENT$BYTECODE == 001 clauses; NODE=<fake> (not --node) keeps GOTOPT empty
const X3POST = [['--only-fn'], ['--concurrent'], ['--no-bytecode'], ['a.mjs']];
for (const extra of X3POST) {
    test(`A2 X3: ibd --self-test ${extra.join(' ')} -> exit 2 "--self-test takes no other argument", 0 spawns, no self-test`, { skip }, () => {
        const c = mkCase();
        const r = runN(IBD, c, ['--self-test', ...extra], `ibd --self-test ${extra.join(' ')}`);
        code(r, 2, `--self-test ${extra.join(' ')}`);
        assert.ok(r.stderr.includes('--self-test takes no other argument'), msg(r));
        assert.equal(r.stdout.includes('self-test:'), false, `the self-test must not run\n${msg(r)}`);
        assert.deepEqual(c.spawns(), []);
        assert.deepEqual(c.tmpLeft(), []);
    });
}
for (const extra of [['--no-such-option'], ['--fn', 'm0'], ...X3POST]) {
    test(`A2 X3 old twin: the old ibd --self-test ${extra.join(' ')} runs the self-test and exits 0`, { skip: OLDSKIP }, () => {
        const c = mkCase();
        const r = run(oldRoot('inlining-budget-diff.sh'), c, ['--self-test', ...extra], 'old ibd --self-test + extra');
        code(r, 0, `old --self-test ${extra.join(' ')}`);
        assert.equal(lastLine(r.stdout), 'self-test: all checks passed', msg(r));
    });
}

// =====================================================================================================================
// A3 X5 / X7: blank --v8-flags, --out the mkdir cannot create (ASSERTIONS 3)
// =====================================================================================================================
test('A3 X5: ibd --v8-flags "  " a b -> exit 2, "only blanks", 0 spawns', { skip }, () => {
    const c = mkCase();
    const r = run(IBD, c, ['--v8-flags', '  ', ...base(c), 'a.mjs', 'b.mjs'], 'ibd blank --v8-flags');
    code(r, 2, 'blank --v8-flags');
    assert.ok(r.stderr.includes('only blanks'), msg(r));
    assert.deepEqual(c.spawns(), []);
    assert.deepEqual(c.tmpLeft(), []);
});
test('A3 X5 old twin: the old ibd accepts blank --v8-flags and spawns 4 times', { skip: OLDSKIP }, () => {
    const c = mkCase();
    const r = run(oldRoot('inlining-budget-diff.sh'), c, ['--v8-flags', '  ', ...base(c), 'a.mjs', 'b.mjs'], 'old ibd blank --v8-flags');
    assert.equal(r.stderr.includes('only blanks'), false, msg(r));
    // PLAN "old 4 spawns" = the 4 driver spawns (2 runs x 2 sides, --trace-opt argv); the -p / --v8-options probes come on top
    const drv = c.spawns().filter((l) => l.includes('--trace-opt'));
    assert.equal(drv.length, 4, `old driver spawns (PLAN: 4)\n${c.spawns().join('\n')}\n${msg(r)}`);
});
const LONG = 'x'.repeat(300); // a 300-byte new component: ENAMETOOLONG on every mainstream filesystem (NAME_MAX 255)
test('A3 X7: ibd --out with a 300-byte component -> exit 2, exactly 2 spawns (#76), "--out: cannot create", no "unexpected error"', { skip }, () => {
    const c = mkCase();
    const r = run(IBD, c, [...base(c, ['--out']), '--out', join(c.dir, LONG), 'a.mjs', 'b.mjs'], 'ibd long --out');
    code(r, 2, 'long --out');
    assert.ok(r.stderr.includes('--out: cannot create'), msg(r));
    assert.equal(r.stderr.includes('unexpected error'), false, msg(r));
    assert.equal(c.spawns().length, 2, `spawns (#76: 2)\n${c.spawns().join('\n')}`);
});
test('A3 X7 old twin: the old ibd ends "unexpected error (exit 1)" with no named --out die', { skip: OLDSKIP }, () => {
    const c = mkCase();
    const r = run(oldRoot('inlining-budget-diff.sh'), c, [...base(c, ['--out']), '--out', join(c.dir, LONG), 'a.mjs', 'b.mjs'], 'old ibd long --out');
    assert.ok(r.stderr.includes('unexpected error (exit 1)'), msg(r));
    assert.equal(r.stderr.includes('--out: cannot create'), false, msg(r));
});

// =====================================================================================================================
// A4 X8: bb prerelease --node-version (ASSERTIONS 4)
// =====================================================================================================================
const A4_TEXT = 'a release version: a prerelease or nightly node';
const bbArgs = (c) => ['--max', 'add=1', '--node-version', 'v27.0.0-alpha.0.0.0', '--node', c.node, 'a.mjs'];
test('A4 X8: bb --node-version v27.0.0-alpha.0.0.0 -> exit 2, 0 spawns, the release-version text', { skip }, () => {
    const c = mkCase();
    const r = run(BB, c, bbArgs(c), 'bb prerelease --node-version');
    code(r, 2, 'prerelease --node-version');
    assert.ok(r.stderr.includes(A4_TEXT), msg(r));
    assert.ok(/^VERDICT NO-VERDICT$/m.test(r.stderr), msg(r));
    assert.deepEqual(c.spawns(), []);
    assert.deepEqual(c.tmpLeft(), []);
});
test('A4 X8 old twin: the old bb refuses (exit 2, 0 spawns) with the old text, which lacks the release-version wording', { skip: OLDSKIP }, () => {
    const c = mkCase();
    const r = run(oldRoot('bytecode-budget.sh'), c, bbArgs(c), 'old bb prerelease --node-version');
    code(r, 2, 'old prerelease --node-version');
    assert.ok(r.stderr.includes('--node-version must be vX.Y.Z'), msg(r));
    assert.equal(r.stderr.includes(A4_TEXT), false, msg(r));
    assert.deepEqual(c.spawns(), []);
});

// =====================================================================================================================
// A5 X4: a self-test whose every check is skipped must not pass (ASSERTIONS 5)
// =====================================================================================================================
const ANCHOR = '  check() { if [[ "$2" == "$3" ]]';
function injected(srcPath, name) { // copy with `check() { :; }` on the line right after check()'s one-line definition
    const lines = rd(srcPath).split('\n');
    const hit = lines.map((l, i) => (l.startsWith(ANCHOR) ? i : -1)).filter((i) => i >= 0);
    assert.equal(hit.length, 1, `${name}: check() anchor matched ${hit.length} lines (want exactly 1): abort`);
    assert.ok(lines[hit[0]].trimEnd().endsWith('}'), `${name}: the check() definition is not a one-line function`);
    lines.splice(hit[0] + 1, 0, '  check() { :; }');
    const p = join(mk('inj'), name);
    writeFileSync(p, lines.join('\n')); chmodSync(p, 0o755);
    return p;
}
for (const [name, live, n] of [['inlining-budget-diff.sh', IBD, IBD_SELFTEST_N], ['bytecode-budget.sh', BB, BB_SELFTEST_N]]) {
    test(`A5 X4: ${name} copy with check() stubbed to a no-op: --self-test exit 1, no "check(s) ok" line`, { skip }, () => {
        const c = mkCase();
        const r = run(injected(live, name), c, ['--self-test'], `${name} stubbed --self-test`);
        code(r, 1, `${name} stubbed`);
        assert.equal(/check\(s\) ok/.test(r.stdout + r.stderr), false, msg(r));
        assert.equal(/all checks passed/.test(r.stdout + r.stderr), false, msg(r));
    });
    test(`A5 X4 old twin: the old ${name} with check() stubbed exits 0 "all checks passed"`, { skip: OLDSKIP }, () => {
        const c = mkCase();
        const r = run(injected(oldRoot(name), name), c, ['--self-test'], `old ${name} stubbed --self-test`);
        code(r, 0, `old ${name} stubbed`);
        assert.equal(lastLine(r.stdout), 'self-test: all checks passed', msg(r));
    });
    test(`A5 X4 pin: live ${name} --self-test exits 0, last line "self-test: ${n} check(s) ok"`, { skip }, () => {
        const c = mkCase();
        const r = run(live, c, ['--self-test'], `${name} --self-test`);
        code(r, 0, `${name} --self-test`);
        assert.equal(lastLine(r.stdout), `self-test: ${n} check(s) ok`, msg(r));
        assert.deepEqual(c.tmpLeft(), [], 'the self-test leaves TMPDIR empty');
    });
}
test('A5 X4 old twin: the old --self-test last lines are "self-test: all checks passed" (the unified line is new)', { skip: OLDSKIP }, () => {
    for (const name of Object.keys(OLD_SHA8)) {
        const r = run(oldRoot(name), mkCase(), ['--self-test'], `old ${name} --self-test`);
        code(r, 0, `old ${name}`);
        assert.equal(lastLine(r.stdout), 'self-test: all checks passed', `${name}\n${msg(r)}`);
    }
});
