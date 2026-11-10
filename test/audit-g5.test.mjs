// test/audit-g5.test.mjs -- b62 unit G5, batch 5a, helper B3: the inlining-budget-diff.sh rows of .handoff/PLAN-b62-g5a.md
// ASSERTIONS A1-A6 + ADDENDUM A1 (A7, ruling Q-B62-FLAG). Oracle: the PLAN text (refusal texts, exit codes, VERDICT lines, spawn
// counts), never what a root printed. Tool under test: the repo-root inlining-budget-diff.sh, or the file named by IBD_G5_ROOT
// (an absolute path). "Old" = `git show 7c91d1c:inlining-budget-diff.sh` (sha256/8 dc5927cc), pinned below and gated on
// CI_STRICT like audit-g1 (a history row FAILS on CI when the commit is missing, never skips; locally it skips).
//   A1  R12: `<flag>=x` on the five no-value flags (-h|--help, --self-test, --only-fn, --concurrent, --no-bytecode): exit 2,
//       `<flag> takes no value`, empty stdout, 0 spawns. Old twin: --only-fn=0 -> exit 0 SAME; --help=x prints usage.
//       Mutants: drop one guard each (5).
//   A2  R10: tracked --before under each of the six GIT_* names: exit 2, the six-name die (not "git-tracked"), 2 spawns; ref
//       twin; driver-mode control; --self-test under GIT_DIR (exit 0, no new index entries). Old twins. Mutant: drop the
//       GIT_CEILING_DIRECTORIES name.
//   A3  R11: `lnk/../drv.mjs` through a symlinked dir: exit 2 `DRIVER_AFTER: cannot resolve the directory of`, 2 spawns; mirror
//       DRIVER_BEFORE. Old twin: 3a exit 1 DIFF, 3b exit 0 SAME. Mutants: delete either -ef line.
//   A4  R16/R18/R26: backslash in --out / cwd, empty --tiers, `=` in the node path: exit 2, NO-VERDICT, 0 spawns, OUT absent.
//   A5  Q-B57-TIERS CI row (root copy minus the tiers line). CI + linux needs /bin/bash >= 4.4 or FAILS; locally < 4.4 skips.
//   A6  budget / retention: 20 cycles of the A2 refusal on one OUT; 20 cycles of each A4 refusal add 0 entries; the
//       `grep -c 'exit 0'` census stays 15. (The golden byte-identity of the PLAN is the coder's gold.sh gate, not this file.)
//   A7  Q-B62-FLAG: --v8-flags naming stress-concurrent-inlining refused (0 spawns); a kConcurrent COMPILE line without
//       --concurrent -> exit 2 NO-VERDICT, named; controls: with --concurrent, and a `[marking ... kConcurrent` line.
// Where the spec gives no exact die text (the A2 block beyond the six names + its closing phrase, A3 mirror, A7 names) the row
// asserts a stable substring and says so. Mutants whose anchor the PLAN does not give (unconditional GIT block, self-test
// unset, A7 mutants, the `"$OUT" == /* ||` clause) are NOT written here; 5b / the reviewer owns them.
// Fixtures: private dirs under one mkdtemp top (removed in after()); git fixtures are index-only (init + add, no history verb).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const TOOL = process.env.IBD_G5_ROOT || join(PKG, 'inlining-budget-diff.sh');
const V8OPT = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = '7c91d1c', OLD_SHA8 = 'dc5927cc';
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
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-g5-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

const rd = (p) => readFileSync(p, 'utf8');
const wl = (p) => (existsSync(p) ? rd(p).split('\n').filter((l) => l !== '') : []);
const ls = (d) => readdirSync(d).sort();
const sha8 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 8);
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const verdict = (r) => (/^VERDICT (\S+)$/m.exec(r.stdout + r.stderr) || [, 'NONE'])[1];
const code = (r, want, what) => assert.equal(r.status, want, `${what}: exit\n${msg(r)}`);
const nv = (r, flagText, what) => { // NO-VERDICT refusal: exit 2, the die text, VERDICT line, empty stdout
    code(r, 2, what);
    assert.ok(r.stderr.includes(flagText), `${what}: stderr lacks ${JSON.stringify(flagText)}\n${msg(r)}`);
    assert.ok(/^VERDICT NO-VERDICT$/m.test(r.stderr), `${what}: no VERDICT NO-VERDICT line\n${msg(r)}`);
    assert.equal(r.stdout, '', `${what}: stdout must be empty\n${msg(r)}`);
};

// ---- old root (git history, read only) ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || histSkip(haveOld);
let OLD = null;
function oldRoot() {
    if (haveOld !== true) assert.fail(`${haveOld} (CI=true: a history row fails, never skips)`);
    if (OLD !== null) return OLD;
    const g = spawn('git', ['show', `${OLD_SHA}:inlining-budget-diff.sh`], { cwd: PKG, encoding: 'buffer' }, 'git show inlining-budget-diff.sh', 30000);
    assert.equal(g.status, 0, String(g.stderr));
    assert.equal(sha8(g.stdout), OLD_SHA8, `git show ${OLD_SHA}:inlining-budget-diff.sh must hash to ${OLD_SHA8}`);
    const p = join(mk('old'), 'inlining-budget-diff.sh');
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD = p);
}

// ---- trace texts (hand-written; the compile / Inlining shapes are the real node 26 lines of the b62 gold.sh) ----
const U = (fn, cand, id) => [
    `[compiling method 0x${id}0 <JSFunction ${fn} (sfi = 0x${id}1)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]`,
    `Considering 0x${id}2 {0x${id}3 <SharedFunctionInfo ${cand}>} for inlining with 0x${id}4 {0x${id}5 <FeedbackVector[33]>}`,
    'Budget used: 0/920 -- 2 candidate(s) for inlining:',
    `- candidate: JSCall node #268 with frequency 0.624484, has_heapnum_param:0, 1 target(s):`,
    `  - target: 0x${id}2 {0x${id}3 <SharedFunctionInfo ${cand}>}, bytecode size: 194`,
    `Inlining 0x${id}2 {0x${id}3 <SharedFunctionInfo ${cand}>} into 0x${id}0 {0x${id}1 <SharedFunctionInfo ${fn}>}`,
    `[completed compiling 0x${id}0 <JSFunction ${fn} (sfi = 0x${id}1)> (target TURBOFAN_JS) - took 0.1, 2.0, 0.1 ms]`,
].join('\n') + '\n';
const T_RS = U('read.set', 'markDownstream', '1d86');           // the one fn the rows ask about
const T_RS_B = U('read.set', 'markUpstream', '1d86');
const T_G = U('g', 'helperA', '2d86'), T_H_A = U('h', 'helperA', '3d86'), T_H_B = U('h', 'helperB', '3d86');
const KC = (fn) => `[compiling method 0x4d86 <JSFunction ${fn} (sfi = 0x4d87)> (target TURBOFAN_JS), mode: ConcurrencyMode::kConcurrent]\n[completed compiling 0x4d86 <JSFunction ${fn} (sfi = 0x4d87)> (target TURBOFAN_JS) - took 0.1, 2.0, 0.1 ms]\n`;
const KM = '[marking 0x4d86 <JSFunction other (sfi = 0x4d87)> for optimization to TURBOFAN_JS, ConcurrencyMode::kConcurrent, reason: hot and stable]\n';

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
function fakeNodeIn(dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'node'), FAKE); chmodSync(join(dir, 'node'), 0o755);
    writeFileSync(join(dir, 'v8-options.txt'), rd(V8OPT));
    return join(dir, 'node');
}
// one case: private dir with bin/node, tmp/ (TMPDIR), w/ (cwd) holding drivers a.mjs / a2.mjs (identical) / b.mjs
function mkCase(traceA = T_RS, traceB = T_RS_B) {
    const dir = mk('c');
    const c = { dir, bin: join(dir, 'bin'), tmp: join(dir, 'tmp'), w: join(dir, 'w') };
    c.node = fakeNodeIn(c.bin);
    mkdirSync(c.tmp); mkdirSync(c.w);
    writeFileSync(join(c.w, 'a.mjs'), traceA); writeFileSync(join(c.w, 'a2.mjs'), traceA); writeFileSync(join(c.w, 'b.mjs'), traceB);
    c.spawns = () => wl(join(c.bin, 'spawns.log'));
    return c;
}
function run(root, c, args, o = {}) {
    const env = cleanEnv({ TMPDIR: c.tmp, ...(o.env || {}) });
    return spawn(BASH, [root, ...args], { cwd: o.cwd || c.w, env }, `inlining-budget-diff.sh (${args.slice(0, 4).join(' ')})`, o.cap || 90000);
}
// base argv for driver mode: tiny, one fn, one tier
const B = (c, out, extra = []) => ['--tiers', 'turbo', '--runs', '2', '--fn', 'read.set', '--no-bytecode', '--node', c.node, ...extra, '--out', out];

// ---- mutants: count-checked edits of a copy of the live root ----
const ROOT_TEXT = rd(TOOL);
function mutantText(name, edit) {
    const p = join(mk('mut'), `${name}.sh`);
    writeFileSync(p, edit(ROOT_TEXT)); chmodSync(p, 0o755);
    return p;
}
function replaceOnce(src, from, to, name) {
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor matched ${n} times (want exactly 1): ${from}`);
    return src.replace(from, () => to);
}
// delete exactly one LINE: the unique line containing every needle
function dropLine(src, needles, name) {
    const lines = src.split('\n');
    const hit = lines.map((l, i) => (needles.every((n) => l.includes(n)) ? i : -1)).filter((i) => i >= 0);
    assert.equal(hit.length, 1, `mutant ${name}: ${hit.length} lines contain ${JSON.stringify(needles)} (want exactly 1)`);
    lines.splice(hit[0], 1);
    return lines.join('\n');
}
const NOVAL = '[[ $EQ -eq 0 ]] || die "$a takes no value"; ';

// =====================================================================================================================
// A1 R12: a value on a no-value flag
// =====================================================================================================================
const A1_FLAGS = [['--help', '--help=x'], ['--self-test', '--self-test=x'], ['--only-fn', '--only-fn=0'], ['--concurrent', '--concurrent=no'], ['--no-bytecode', '--no-bytecode=x']];
for (const [flag, arg] of A1_FLAGS) {
    test(`A1 R12: ${arg} -> exit 2, "${flag} takes no value", NO-VERDICT, empty stdout, 0 spawns`, { skip }, () => {
        const c = mkCase();
        const r = run(TOOL, c, [arg, '--tiers', 'turbo', '--fn', 'read.set', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'a2.mjs']);
        nv(r, `inlining-budget-diff: ${flag} takes no value\nVERDICT NO-VERDICT\n`, arg);
        assert.deepEqual(c.spawns(), [], `${arg}: 0 spawns`);
        assert.equal(existsSync(join(c.dir, 'o')), false, `${arg}: --out must not be created`);
    });
}
test('A1 R12 old twin: --fn g --only-fn=0 on the DIFF fixture exits 0 SAME on the old root; the fixed root refuses', { skip: OLDSKIP }, () => {
    // fixture: g is identical on both sides, h differs. Truth without --only-fn = DIFF; --only-fn scopes to g = SAME.
    const mkc = () => { const c = mkCase(T_G + T_H_A, T_G + T_H_B); return c; };
    const args = (c) => ['--tiers', 'turbo', '--runs', '2', '--fn', 'g', '--no-bytecode', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'b.mjs'];
    const c0 = mkc();
    const ctl = run(oldRoot(), c0, args(c0)); // control: no --only-fn -> the h difference is a DIFF
    code(ctl, 1, 'old root, no --only-fn (control: the fixture really is DIFF)');
    const c1 = mkc();
    const old = run(oldRoot(), c1, [...args(c1), '--only-fn=0']);
    code(old, 0, 'old root, --only-fn=0'); assert.equal(verdict(old), 'SAME', msg(old));
    const c2 = mkc();
    nv(run(TOOL, c2, [...args(c2), '--only-fn=0']), 'inlining-budget-diff: --only-fn takes no value\n', 'fixed root --only-fn=0');
    assert.deepEqual(c2.spawns(), []);
});
test('A1 R12 old twin: --help=x prints usage and exits 2 on the old root (no "takes no value"); the fixed root has empty stdout', { skip: OLDSKIP }, () => {
    const c = mkCase();
    const old = run(oldRoot(), c, ['--help=x']);
    assert.equal(old.stdout.length > 100, true, `old --help=x prints usage:\n${msg(old)}`);
    assert.equal(old.stderr.includes('takes no value'), false);
    const cur = run(TOOL, c, ['--help=x']);
    nv(cur, '--help takes no value', 'fixed --help=x');
});
for (const [i, [flag]] of A1_FLAGS.entries()) {
    test(`A1 R12 mutant ${i + 1}/5: dropping the guard of ${flag} turns its row red`, { skip }, () => {
        const labels = { '--help': '-h|--help)', '--self-test': '--self-test)', '--only-fn': '--only-fn)', '--concurrent': '--concurrent)', '--no-bytecode': '--no-bytecode)' };
        assert.equal(ROOT_TEXT.split(NOVAL).length - 1, 5, `the live root carries the bb:786 guard ${JSON.stringify(NOVAL)} exactly 5 times (one per no-value flag)`);
        const lines = ROOT_TEXT.split('\n');
        const idx = lines.findIndex((l) => l.includes(labels[flag]) && l.includes(NOVAL));
        assert.ok(idx >= 0, `no case line with ${labels[flag]} and the guard`);
        lines[idx] = lines[idx].replace(NOVAL, '');
        const p = join(mk('mut'), `a1-${i}-b.sh`); writeFileSync(p, lines.join('\n')); chmodSync(p, 0o755);
        const c = mkCase();
        const arg = A1_FLAGS[i][1];
        const r = run(p, c, [arg, '--tiers', 'turbo', '--fn', 'read.set', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'a2.mjs']);
        assert.equal(r.stderr.includes(`${flag} takes no value`), false, `mutant must lose the refusal:\n${msg(r)}`);
    });
}

// =====================================================================================================================
// A2 R10: the six GIT_* steering names
// =====================================================================================================================
function gitIn(dir, args) { return spawn('git', args, { cwd: dir }, `git ${args[0]}`, 30000); }
function mkGit(c) { // repo/ with sub/Signal.js tracked (index-only: init + add), other/ = an empty repo, after/Signal.js untracked
    const repo = join(c.dir, 'repo'), other = join(c.dir, 'other'), after = join(c.dir, 'after');
    for (const d of [repo, join(repo, 'sub'), other, after]) mkdirSync(d, { recursive: true });
    writeFileSync(join(repo, 'sub', 'Signal.js'), 'export const x = 1;\n');
    writeFileSync(join(after, 'Signal.js'), 'export const x = 2;\n');
    writeFileSync(join(c.dir, 'drv.mjs'), `// driver for './Signal.js'\n${T_RS}`);
    for (const d of [repo, other]) code(gitIn(d, ['init', '-q']), 0, 'git init');
    code(gitIn(repo, ['add', 'sub/Signal.js']), 0, 'git add');
    return { repo, other, after };
}
const A2_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
const a2env = (v, c, g) => ({
    GIT_DIR: { GIT_DIR: join(g.other, '.git') },
    GIT_WORK_TREE: { GIT_WORK_TREE: g.other },
    GIT_INDEX_FILE: { GIT_INDEX_FILE: join(c.dir, 'absent-index') },
    GIT_OBJECT_DIRECTORY: { GIT_OBJECT_DIRECTORY: join(c.dir, 'absent-objects') },
    GIT_COMMON_DIR: { GIT_COMMON_DIR: join(g.repo, '.git') },
    GIT_CEILING_DIRECTORIES: { GIT_CEILING_DIRECTORIES: g.repo },
}[v]);
const fileArgs = (c, g, out) => ['--tiers', 'turbo', '--runs', '2', '--fn', 'read.set', '--no-bytecode', '--node', c.node, '--out', out,
    '--driver', join(c.dir, 'drv.mjs'), '--before', join(g.repo, 'sub', 'Signal.js'), '--after', join(g.after, 'Signal.js')];
// stable substrings: the six names, and the closing phrase the PLAN quotes; the rest of the die text is the coder's wording
const SIX_END = '(ref / file mode finds each repo from its path)';
for (const v of A2_VARS) {
    test(`A2 R10: tracked --before under ${v} -> exit 2, the six-name die (not "git-tracked"), exactly 2 spawns`, { skip }, () => {
        const c = mkCase(), g = mkGit(c);
        const r = run(TOOL, c, fileArgs(c, g, join(c.dir, 'o')), { cwd: c.dir, env: a2env(v, c, g) });
        code(r, 2, v);
        for (const n of A2_VARS) assert.ok(r.stderr.includes(n), `${v}: the die names ${n}\n${msg(r)}`);
        assert.ok(r.stderr.includes(SIX_END), `${v}: die ends with ${SIX_END}\n${msg(r)}`);
        assert.equal(r.stderr.includes('git-tracked'), false, `${v}: must not be the "git-tracked" die\n${msg(r)}`);
        assert.ok(/^VERDICT NO-VERDICT$/m.test(r.stderr), msg(r));
        assert.equal(c.spawns().length, 2, `${v}: 2 spawns (-p, --v8-options): ${JSON.stringify(c.spawns())}`);
    });
}
test('A2 R10 ref twin: --before-ref / --after-ref / --repo with GIT_DIR set -> the same six-name die, 2 spawns', { skip }, () => {
    const c = mkCase(), g = mkGit(c);
    const r = run(TOOL, c, ['--tiers', 'turbo', '--runs', '2', '--fn', 'read.set', '--no-bytecode', '--node', c.node, '--out', join(c.dir, 'o'),
        '--repo', g.repo, '--before-ref', 'HEAD~1', '--after-ref', 'HEAD'], { cwd: c.dir, env: a2env('GIT_DIR', c, g) });
    code(r, 2, 'ref twin');
    for (const n of A2_VARS) assert.ok(r.stderr.includes(n), `ref twin names ${n}\n${msg(r)}`);
    assert.ok(r.stderr.includes(SIX_END), msg(r));
    assert.equal(c.spawns().length, 2, 'ref twin: 2 spawns');
});
test('A2 R10 control: driver mode with GIT_DIR set still prints a verdict (SAME, exit 0)', { skip }, () => {
    const c = mkCase(), g = mkGit(c);
    const r = run(TOOL, c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs'], { env: a2env('GIT_DIR', c, g) });
    code(r, 0, 'driver mode under GIT_DIR'); assert.equal(verdict(r), 'SAME', msg(r));
});
const lsCount = (repo) => gitIn(repo, ['ls-files']).stdout.split('\n').filter((l) => l !== '').length;
test('A2 R10: --self-test under GIT_DIR=<index-only repo>/.git -> exit 0, 89 ok, no FAIL, that repo\'s ls-files count unchanged', { skip }, () => {
    const c = mkCase(), g = mkGit(c);
    const before = lsCount(g.repo);
    assert.equal(before, 1, 'fixture: 1 tracked file');
    const r = run(TOOL, c, ['--self-test'], { cwd: c.dir, env: { GIT_DIR: join(g.repo, '.git') } });
    code(r, 0, 'self-test under GIT_DIR');
    assert.equal(/^FAIL/m.test(r.stdout + r.stderr), false, msg(r));
    assert.equal((r.stdout.match(/^ok /gm) || []).length, 89, `89 ok rows (b62 5a 64 + 5b TASK 4 + B2 probe self-test rows + B2b 7 tear rows + r1 fix e-acute row + b65 5c 4 Turbolev rows: the coder's count, re-pin if it moves)\n${msg(r)}`);
    assert.equal(lsCount(g.repo), before, 'the self-test wrote entries into the caller repo index');
});
test('A2 R10 old twin: GIT_DIR / WORK_TREE / INDEX_FILE / OBJECT_DIRECTORY / CEILING -> exit 0 SAME; COMMON_DIR -> "git-tracked"; self-test under GIT_DIR FAILs', { skip: OLDSKIP }, () => {
    for (const v of A2_VARS) {
        const c = mkCase(), g = mkGit(c);
        const r = run(oldRoot(), c, fileArgs(c, g, join(c.dir, 'o')), { cwd: c.dir, env: a2env(v, c, g) });
        if (v === 'GIT_COMMON_DIR') { code(r, 2, `old ${v}`); assert.ok(r.stderr.includes('git-tracked'), `old ${v} says git-tracked\n${msg(r)}`); }
        else { code(r, 0, `old ${v}`); assert.equal(verdict(r), 'SAME', `old ${v}\n${msg(r)}`); }
    }
    const c = mkCase(), g = mkGit(c);
    const r = run(oldRoot(), c, ['--self-test'], { cwd: c.dir, env: { GIT_DIR: join(g.repo, '.git') } });
    assert.ok(r.status !== 0 && /FAIL/.test(r.stdout + r.stderr), `old self-test under GIT_DIR FAILs\n${msg(r)}`);
});
test('A2 R10 mutant: dropping the GIT_CEILING_DIRECTORIES name from the block turns its row red', { skip }, () => {
    const lines = ROOT_TEXT.split('\n');
    const idx = lines.map((l, i) => (l.includes('${GIT_CEILING_DIRECTORIES+x}') ? i : -1)).filter((i) => i >= 0);
    assert.equal(idx.length, 1, `exactly one line tests \${GIT_CEILING_DIRECTORIES+x}: ${idx.length}`);
    lines[idx[0]] = lines[idx[0]].replace('${GIT_CEILING_DIRECTORIES+x}', '');
    const p = join(mk('mut'), 'a2-ceil.sh'); writeFileSync(p, lines.join('\n')); chmodSync(p, 0o755);
    const c = mkCase(), g = mkGit(c);
    const r = run(p, c, fileArgs(c, g, join(c.dir, 'o')), { cwd: c.dir, env: a2env('GIT_CEILING_DIRECTORIES', c, g) });
    assert.equal(r.stderr.includes(SIX_END), false, `mutant must not refuse on CEILING:\n${msg(r)}`);
});

// =====================================================================================================================
// A3 R11: lnk/../drv.mjs through a symlinked directory
// =====================================================================================================================
// x/lnk -> real/a/b. `lnk/../drv.mjs` is, to the kernel, real/a/drv.mjs; to a logical `cd lnk/..` it is x/drv.mjs.
function mkLnk(c, firstIsTrue) {
    const x = join(c.dir, 'x'), real = join(c.dir, 'real'), ab = join(real, 'a', 'b'), other = join(c.dir, 'other');
    for (const d of [x, ab, other]) mkdirSync(d, { recursive: true });
    symlinkSync(ab, join(x, 'lnk'));
    if (firstIsTrue) { // 3a: the true target equals arg 1 (truth SAME); the wrong file x/drv.mjs differs (old: DIFF)
        writeFileSync(join(real, 'a', 'drv.mjs'), T_RS); writeFileSync(join(x, 'drv.mjs'), T_RS_B);
        return { x, first: join(real, 'a', 'drv.mjs') };
    }
    // 3b: the true target differs from arg 1 (truth DIFF); the wrong file x/drv.mjs equals arg 1 (old: SAME)
    writeFileSync(join(real, 'a', 'drv.mjs'), T_RS_B); writeFileSync(join(other, 'drv.mjs'), T_RS); writeFileSync(join(x, 'drv.mjs'), T_RS);
    return { x, first: join(other, 'drv.mjs') };
}
const A3_ROWS = [['3a', true, false], ['3b', false, false], ['3a mirror', true, true], ['3b mirror', false, true]];
for (const [name, firstTrue, mirror] of A3_ROWS) {
    const side = mirror ? 'DRIVER_BEFORE' : 'DRIVER_AFTER';
    test(`A3 R11 ${name}: ${mirror ? 'lnk/../drv.mjs first' : 'lnk/../drv.mjs second'} -> exit 2, "${side}: cannot resolve the directory of", 2 spawns`, { skip }, () => {
        const c = mkCase(), f = mkLnk(c, firstTrue);
        const pos = mirror ? ['lnk/../drv.mjs', f.first] : [f.first, 'lnk/../drv.mjs'];
        const r = run(TOOL, c, [...B(c, join(c.dir, 'o')), ...pos], { cwd: f.x });
        code(r, 2, name);
        // the PLAN names the prefix ("DRIVER_AFTER: cannot resolve the directory of"); the mirror prefix is assumed by symmetry (stable substring)
        assert.ok(r.stderr.includes(`${side}: cannot resolve the directory of`), `${name}: stderr\n${msg(r)}`);
        assert.ok(/^VERDICT NO-VERDICT$/m.test(r.stderr), msg(r));
        assert.equal(c.spawns().length, 2, `${name}: 2 spawns: ${JSON.stringify(c.spawns())}`);
    });
}
test('A3 R11 old twin: 3a exits 1 DIFF and 3b exits 0 SAME on the old root (the wrong file x/drv.mjs is read)', { skip: OLDSKIP }, () => {
    for (const [first, want, v] of [[true, 1, 'DIFF'], [false, 0, 'SAME']]) {
        const c = mkCase(), f = mkLnk(c, first);
        const r = run(oldRoot(), c, [...B(c, join(c.dir, 'o')), f.first, 'lnk/../drv.mjs'], { cwd: f.x });
        code(r, want, `old ${first ? '3a' : '3b'}`); assert.equal(verdict(r), v, msg(r));
    }
});
for (const side of ['DRIVER_AFTER', 'DRIVER_BEFORE']) {
    test(`A3 R11 mutant: deleting the ${side} -ef line turns its row red`, { skip }, () => {
        const p = mutantText(`a3-${side}`, (s) => dropLine(s, [`${side}: cannot resolve the directory of`, '-ef'], `a3-${side}`));
        const c = mkCase(), f = mkLnk(c, true);
        const pos = side === 'DRIVER_AFTER' ? [f.first, 'lnk/../drv.mjs'] : ['lnk/../drv.mjs', f.first];
        const r = run(p, c, [...B(c, join(c.dir, 'o')), ...pos], { cwd: f.x });
        assert.equal(r.stderr.includes(`${side}: cannot resolve the directory of`), false, msg(r));
    });
}

// =====================================================================================================================
// A4 R16 / R18 / R26: backslash, empty --tiers, '=' in the node path
// =====================================================================================================================
function mkBsCwd(c) { const d = join(c.dir, 'we\\ird'); mkdirSync(d); writeFileSync(join(d, 'a.mjs'), T_RS); writeFileSync(join(d, 'a2.mjs'), T_RS); return d; }
// each A4 refusal: [id, builder(c) -> { args, cwd, absentOut }, die substring]
const A4 = [
    ['cwd backslash + --out rel', (c) => { const d = mkBsCwd(c); return { cwd: d, args: [...B(c, 'rel'), 'a.mjs', 'a2.mjs'], out: join(d, 'rel') }; }, '--out: a backslash'],
    ['--out o/x\\ty', (c) => ({ cwd: c.w, args: [...B(c, 'o/x\\ty'), 'a.mjs', 'a2.mjs'], out: join(c.w, 'o') }), '--out: a backslash'],
    ['--tiers " "', (c) => ({ cwd: c.w, args: ['--tiers', ' ', '--runs', '2', '--fn', 'read.set', '--no-bytecode', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'a2.mjs'], out: join(c.dir, 'o') }), '--tiers is empty'],
    ['--tiers=   ', (c) => ({ cwd: c.w, args: ['--tiers=   ', '--runs', '2', '--fn', 'read.set', '--no-bytecode', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'a2.mjs'], out: join(c.dir, 'o') }), '--tiers is empty'],
    ['--node with =', (c) => { const eq = fakeNodeIn(join(c.dir, 'a=b')); return { cwd: c.w, args: ['--tiers', 'turbo', '--runs', '2', '--fn', 'read.set', '--no-bytecode', '--node', eq, '--out', join(c.dir, 'o'), 'a.mjs', 'a2.mjs'], out: join(c.dir, 'o'), noSpawnLog: join(c.dir, 'a=b', 'spawns.log') }; }, 'an = is not allowed in the resolved path'],
];
for (const [id, build, die] of A4) {
    test(`A4: ${id} -> exit 2, NO-VERDICT, "${die}", 0 spawns, --out absent`, { skip }, () => {
        const c = mkCase(), b = build(c);
        const r = run(TOOL, c, b.args, { cwd: b.cwd });
        nv(r, die, id);
        assert.deepEqual(c.spawns(), [], `${id}: 0 spawns`);
        if (b.noSpawnLog) assert.equal(existsSync(b.noSpawnLog), false, `${id}: the = node was never run`);
        assert.equal(existsSync(b.out), false, `${id}: OUT must be absent`);
    });
}
test('A4 control: a backslash in the cwd with an ABSOLUTE clean --out exits 0 SAME (the cwd clause is for a relative OUT only)', { skip }, () => {
    const c = mkCase(), d = mkBsCwd(c);
    const r = run(TOOL, c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs'], { cwd: d });
    code(r, 0, 'abs OUT under a backslash cwd'); assert.equal(verdict(r), 'SAME', msg(r));
});

// =====================================================================================================================
// A5 Q-B57-TIERS CI row (root copy minus the tiers line)
// =====================================================================================================================
const bashVer = spawn(BASH, ['-c', 'echo "${BASH_VERSINFO[0]} ${BASH_VERSINFO[1]}"'], {}, 'bash version', 10000).stdout.trim().split(' ').map(Number);
const bashOk = bashVer[0] > 4 || (bashVer[0] === 4 && bashVer[1] >= 4);
const CI_LINUX = !!process.env.CI && process.platform === 'linux';
const TIERS_LINE = '[[ ${#TIER_LIST[@]} -gt 0 ]] || die "--tiers is empty"';
test('A5 Q-B57-TIERS: without the --tiers-is-empty line, --tiers " " is a vacuous SAME (CI class row); the fixed root refuses', { skip: skip || (!CI_LINUX && !bashOk ? `local bash ${bashVer.join('.')} < 4.4: the empty-array path differs (this row runs on CI: linux, /bin/bash >= 4.4)` : false) }, () => {
    if (CI_LINUX) assert.ok(existsSync('/bin/bash') && bashOk, `CI linux needs /bin/bash with BASH_VERSINFO >= 4.4 (got ${bashVer.join('.')}): the row FAILS here, never skips`);
    // the copy: one-match anchor, differs from the live root by that line only
    const lines = ROOT_TEXT.split('\n');
    const hit = lines.map((l, i) => (l.includes(TIERS_LINE) ? i : -1)).filter((i) => i >= 0);
    assert.equal(hit.length, 1, `exactly one line carries ${TIERS_LINE}: ${hit.length}`);
    const kept = lines.filter((_, i) => i !== hit[0]);
    assert.equal(kept.length, lines.length - 1);
    assert.deepEqual([...kept.slice(0, hit[0]), lines[hit[0]], ...kept.slice(hit[0])], lines, 'the copy differs by that line only');
    const copy = join(mk('a5'), 'inlining-budget-diff.sh'); writeFileSync(copy, kept.join('\n')); chmodSync(copy, 0o755);
    const args = (c, o) => ['--tiers', ' ', '--fn', 'nosuchfn', '--runs', '2', '--no-bytecode', '--node', c.node, '--out', o, 'a.mjs', 'a2.mjs'];
    const c = mkCase(), O = join(c.dir, 'O');
    const r = run(copy, c, args(c, O), { cwd: c.w });
    code(r, 0, 'tiers-line-less copy');
    const last = r.stdout.split('\n').filter((l) => l !== '').pop();
    assert.equal(last, 'VERDICT SAME', msg(r));
    assert.deepEqual(ls(join(O, 'raw')), [], 'O/raw empty'); assert.deepEqual(ls(join(O, 'dec')), [], 'O/dec empty');
    for (const l of c.spawns()) assert.ok(/^(-p|--v8-options)( |$)/.test(l), `only -p / --v8-options spawned: ${l}`);
    const c2 = mkCase(), O2 = join(c2.dir, 'O');
    nv(run(TOOL, c2, args(c2, O2), { cwd: c2.w }), '--tiers is empty', 'fixed root, same command');
    assert.deepEqual(c2.spawns(), []);
});

// =====================================================================================================================
// A6 budget / retention / census
// =====================================================================================================================
test('A6: 20 cycles of the A2 refusal on one OUT leave exactly raw dec bud ms stage + a 0-byte report.txt', { skip }, () => {
    const c = mkCase(), g = mkGit(c), O = join(c.dir, 'O');
    for (let i = 0; i < 20; i++) {
        const r = run(TOOL, c, fileArgs(c, g, O), { cwd: c.dir, env: a2env('GIT_DIR', c, g) });
        assert.equal(r.status, 2, `cycle ${i}\n${msg(r)}`);
    }
    assert.deepEqual(ls(O), ['bud', 'dec', 'ms', 'raw', 'report.txt', 'stage']);
    assert.equal(statSync(join(O, 'report.txt')).size, 0, 'report.txt stays 0 bytes');
    assert.equal(c.spawns().length, 40, '20 cycles x 2 spawns');
});
for (const [id, build, die] of A4) {
    test(`A6: 20 cycles of the A4 refusal (${id}) add 0 entries to TMPDIR or cwd`, { skip }, () => {
        const c = mkCase(), b = build(c);
        const snap = () => [ls(c.tmp), ls(b.cwd)];
        const s0 = snap();
        for (let i = 0; i < 20; i++) { const r = run(TOOL, c, b.args, { cwd: b.cwd }); assert.equal(r.status, 2, `cycle ${i}\n${msg(r)}`); assert.ok(r.stderr.includes(die)); }
        assert.deepEqual(snap(), s0, 'TMPDIR / cwd unchanged');
        assert.deepEqual(c.spawns(), [], '0 spawns');
    });
}
test('A6 census: the count of lines with \'exit 0\' on the ibd root equals the old root\'s (regression pin: no new "exit 0" text, no new final-trap exit)', { skip: OLDSKIP }, () => {
    // PLAN says `grep -c 'exit 0'` = 15; that is the bytecode-budget.sh count. The ibd root (dc5927cc) has 5, so the pin is "unchanged vs the old root".
    const n = (t) => t.split('\n').filter((l) => l.includes('exit 0')).length;
    assert.equal(n(ROOT_TEXT), n(rd(oldRoot())));
});

// =====================================================================================================================
// A7 Q-B62-FLAG
// =====================================================================================================================
for (const f of ['--v8-flags=--stress-concurrent-inlining', '--v8-flags=--no-stress-concurrent-inlining']) {
    test(`A7 Q-B62-FLAG: ${f} -> exit 2, named, NO-VERDICT, 0 spawns`, { skip }, () => {
        const c = mkCase();
        const r = run(TOOL, c, [...B(c, join(c.dir, 'o'), [f]), 'a.mjs', 'a2.mjs']);
        // the die text is the coder's (deopt-diff form); assert the flag name, a stable substring
        nv(r, 'stress-concurrent-inlining', f);
        assert.deepEqual(c.spawns(), [], `${f}: 0 spawns`);
    });
}
test('A7 Q-B62-FLAG old twin: both --v8-flags forms run on the old root (spawns, no refusal)', { skip: OLDSKIP }, () => {
    for (const f of ['--v8-flags=--stress-concurrent-inlining', '--v8-flags=--no-stress-concurrent-inlining']) {
        const c = mkCase();
        const r = run(oldRoot(), c, [...B(c, join(c.dir, 'o'), [f]), 'a.mjs', 'a2.mjs']);
        assert.ok(c.spawns().length > 0, `old ${f}: ran\n${msg(r)}`);
    }
});
const KCASE = (extraA, extraB) => mkCase(T_RS + extraA, T_RS + extraB);
test('A7 Q-B62-FLAG: a kConcurrent COMPILE line without --concurrent -> exit 2 NO-VERDICT, named', { skip }, () => {
    const c = KCASE(KC('other'), KC('other'));
    const r = run(TOOL, c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs']);
    code(r, 2, 'kConcurrent compile line');
    assert.ok(/^VERDICT NO-VERDICT$/m.test(r.stdout + r.stderr), msg(r));
    // named: stable substring (the PLAN says "deopt-diff's message form", no exact text)
    assert.ok(/kConcurrent|concurrent/i.test(r.stdout + r.stderr), `names the concurrent compile\n${msg(r)}`);
});
test('A7 Q-B62-FLAG old twin: the same trace gives a verdict on the old root', { skip: OLDSKIP }, () => {
    const c = KCASE(KC('other'), KC('other'));
    const r = run(oldRoot(), c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs']);
    assert.ok(r.status === 0 || r.status === 1, msg(r)); assert.ok(['SAME', 'DIFF'].includes(verdict(r)), msg(r));
});
test('A7 Q-B62-FLAG control: the same kConcurrent compile line WITH --concurrent -> a verdict (check off)', { skip }, () => {
    const c = KCASE(KC('other'), KC('other'));
    const r = run(TOOL, c, [...B(c, join(c.dir, 'o'), ['--concurrent']), 'a.mjs', 'a2.mjs']);
    assert.ok(r.status === 0 || r.status === 1, msg(r)); assert.ok(['SAME', 'DIFF'].includes(verdict(r)), msg(r));
});
test('A7 Q-B62-FLAG control: a trace whose only kConcurrent text is a [marking line -> a verdict (compile lines only)', { skip }, () => {
    const c = KCASE(KM, KM);
    const r = run(TOOL, c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs']);
    assert.ok(r.status === 0 || r.status === 1, msg(r)); assert.ok(['SAME', 'DIFF'].includes(verdict(r)), msg(r));
});

// --- 5b ---
//
// b62 G5 batch 5b (helper B4): rows of .handoff/PLAN-b62-g5b.md ASSERTIONS A1-A5 + ADDENDUM A1. Oracle: the PLAN text; every
// expected line is derived from it (collapse rule, D rule, `(<step> exited N)` slot, 3,50 truth), never from a root's output.
// Fixtures copy the real node 26.8.2 shapes of the b62 G5b census (compile / completed / aborted / `== Inlining` lines).
// Rows red on the old root (7c91d1c) had { todo } markers until the fix landed in the live root; they are lifted.
// Mutant rows whose anchor the PLAN does not give (class-member drops, always-collapse, norm_maglev gsub, index($2,t), "D"->"K",
// key compare, no-rm, redirect-in-cd, drop-append, append-first) are NOT written here: the coder's MUTANTS table owns them.
// A3 "ENV_SPAWNS stays 9" is a count of test/inlining-budget-diff.test.mjs, not asserted here.
import { openSync, closeSync } from 'node:fs';

const TD = { skip };
const hasLine = (s, l) => s.split('\n').includes(l);
const NAME = 'a_0x1$0x2.0x3h0x4k90x5'; // every class member before a 0x: letter, digit, _, $, .

// ---- fixture builders (real line shapes) ----
const TFC = (fn, id, tail = ', mode: ConcurrencyMode::kSynchronous]', tgt = 'TURBOFAN_JS') => `[compiling method 0x${id}0 <JSFunction ${fn} (sfi = 0x${id}1)> (target ${tgt})${tail}`;
const TFD = (fn, id, tgt = 'TURBOFAN_JS', osr = '') => `[completed compiling 0x${id}0 <JSFunction ${fn} (sfi = 0x${id}1)> (target ${tgt})${osr} - took 0.010, 0.281, 0.003 ms]`;
const TFA = (fn, id) => `[aborted optimizing 0x${id}0 <JSFunction ${fn} (sfi = 0x${id}1)> (target TURBOFAN_JS) because: Function is too big to be optimized - took 0.006, 0.000, 0.000 ms]`;
const nl = (...a) => a.join('\n') + '\n';
// Maglev unit: one `== Inlining` line naming `cand` (+ the greedy line), closed by a Maglev completion
const MU = (fn, cand, id) => nl(TFC(fn, id, ', mode: ConcurrencyMode::kSynchronous]', 'MAGLEV'),
    `  greedy inlining 0x76a8ce2038 {0x2a8c1dc1afb1 <SharedFunctionInfo ${cand}>}: small function, skipping max-depth`,
    `== Inlining 0x2a8c1dc1afb1 <SharedFunctionInfo ${cand}>`, TFD(fn, id, 'MAGLEV'));
const argsM0 = (c, out, tiers = 'turbo') => ['--tiers', tiers, '--runs', '2', '--fn', 'm0', '--no-bytecode', '--node', c.node, '--out', out, 'a.mjs', 'b.mjs'];

// =====================================================================================================================
// A1 R9: an addr() collapse keeps a 0x that follows [A-Za-z0-9_$.]
// =====================================================================================================================
test('A1 R9 1a: m0 deciding on h0x1 vs h0x2 (turbo) -> exit 1 VERDICT DIFF; old root 0 SAME', { ...TD }, () => {
    const c = mkCase(U('m0', 'h0x1', '1d86'), U('m0', 'h0x2', '1d86'));
    const r = run(TOOL, c, argsM0(c, join(c.dir, 'o')));
    code(r, 1, 'h0x1 vs h0x2'); assert.equal(verdict(r), 'DIFF', msg(r));
});
test('A1 R9 1a old twin: the old root collapses h0x1 / h0x2 to h and says exit 0 SAME', { skip: OLDSKIP }, () => {
    const c = mkCase(U('m0', 'h0x1', '1d86'), U('m0', 'h0x2', '1d86'));
    const r = run(oldRoot(), c, argsM0(c, join(c.dir, 'o')));
    code(r, 0, 'old h0x1 vs h0x2'); assert.equal(verdict(r), 'SAME', msg(r));
});
test('A1 R9 1b: h0x1 self-pair with --fn h0x1 -> exit 0 SAME, `guard ok: h0x1`; old root exit 2', { ...TD }, () => {
    const mk1 = () => mkCase(U('m0', 'h0x1', '1d86'), U('m0', 'h0x1', '1d86')); // no h0x1 compile line: only a decision names it
    const c = mk1();
    const r = run(TOOL, c, ['--tiers', 'turbo', '--runs', '2', '--fn', 'h0x1', '--no-bytecode', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'b.mjs']);
    code(r, 0, 'h0x1 self-pair'); assert.equal(verdict(r), 'SAME', msg(r));
    assert.ok(r.stdout.includes('guard ok: h0x1'), `guard ok: h0x1\n${msg(r)}`);
    if (OLDSKIP === false) {
        const c2 = mk1();
        const o = run(oldRoot(), c2, ['--tiers', 'turbo', '--runs', '2', '--fn', 'h0x1', '--no-bytecode', '--node', c2.node, '--out', join(c2.dir, 'o'), 'a.mjs', 'b.mjs']);
        code(o, 2, 'old h0x1 self-pair');
    }
});
test('A1 R9 maglev: a `== Inlining` pair naming h0x1 vs h0x2 -> exit 1 DIFF (old root SAME)', { ...TD }, () => {
    const c = mkCase(MU('m0', 'h0x1', '1d86'), MU('m0', 'h0x2', '1d86'));
    const r = run(TOOL, c, argsM0(c, join(c.dir, 'o'), 'maglev'));
    code(r, 1, 'maglev h0x1 vs h0x2'); assert.equal(verdict(r), 'DIFF', msg(r));
});
test('A1 R9 exact dec line: the name `a_0x1$0x2.0x3h0x4k90x5` keeps every 0x; `{0x` is collapsed (turbo dec file)', { ...TD }, () => {
    const c = mkCase(U('m0', NAME, '1d86'), U('m0', NAME, '1d86'));
    const O = join(c.dir, 'o');
    const r = run(TOOL, c, argsM0(c, O));
    code(r, 0, 'name fixture');
    const dec = wl(join(O, 'dec', 'turbo.before.1.tsv'));
    const named = dec.filter((l) => l.includes(`<SharedFunctionInfo ${NAME}>`));
    assert.ok(named.length >= 1, `decision lines keep the full name verbatim (got ${named.length} of ${dec.length})\n${dec.join('\n')}`);
    assert.equal(named.filter((l) => /\{0x[0-9a-fA-F]/.test(l)).length, 0, `the address after { must be collapsed:\n${named.join('\n')}`);
});

// =====================================================================================================================
// A2 R15: the guard accepts a completed compile of the fn (this tier), not an aborted / other-tier / other-fn one
// =====================================================================================================================
const G_UNIT = U('g', 'helperA', '2d86'); // the one unrelated decision line set (a tier with no decisions at all is NO-VERDICT)
const A2_CASES = {
    a: nl(TFC('m0', '5d86'), TFD('m0', '5d86')) + G_UNIT,
    b: nl(TFC('m0', '5d86', undefined, 'MAGLEV'), TFD('m0', '5d86', 'MAGLEV')) + G_UNIT,
    c: nl(TFC('m0', '5d86'), TFA('m0', '5d86')) + G_UNIT,
    d: nl(TFC('m0', '5d86'), TFD('other', '6d86')) + G_UNIT,
    osr: nl(TFC('m0', '5d86'), TFD('m0', '5d86', 'TURBOFAN_JS', ' OSR')) + G_UNIT, // ADDENDUM A1: ` OSR` completion never closes a non-OSR unit
};
const a2run = (root, k) => { const c = mkCase(A2_CASES[k], A2_CASES[k]); const O = join(c.dir, 'o'); const r = run(root, c, argsM0(c, O)); return { c, O, r }; };
test('A2 R15 (a): TF compile + completed, no line names m0 -> exit 0 SAME; old root exit 2 "no trace of m0"', { ...TD }, () => {
    const x = a2run(TOOL, 'a');
    code(x.r, 0, '(a)'); assert.equal(verdict(x.r), 'SAME', msg(x.r));
});
test('A2 R15 (a) old twin: the old root says exit 2 "no trace of m0"', { skip: OLDSKIP }, () => {
    const x = a2run(oldRoot(), 'a');
    code(x.r, 2, 'old (a)'); assert.ok(x.r.stdout.includes('no trace of m0'), msg(x.r));
});
for (const [k, what] of [['b', 'm0 compiled only as (target MAGLEV) in a turbo run'], ['c', 'TF compile + `[aborted optimizing` (same key, no completion)'], ['d', 'TF compile, then another function\'s completion'], ['osr', 'non-OSR TF compile closed by an OSR completion (key differs by ` OSR`)']]) {
    // (b)(c)(d)(osr): regression pins on the old root (it refuses too, for want of any evidence); red only on the mutants the coder owns
    test(`A2 R15 (${k}): ${what} -> exit 2 NO-VERDICT, "no completed turbo compile of it"`, { skip }, () => {
        const x = a2run(TOOL, k);
        code(x.r, 2, `(${k})`); assert.equal(verdict(x.r), 'NO-VERDICT', msg(x.r));
        assert.ok(x.r.stdout.includes('no completed turbo compile of it'), `(${k}) message\n${msg(x.r)}`);
    });
}
test('A2 R15: budget.turbo.tsv is byte-identical to the old root on all five fixtures (the D row adds nothing to the budget)', { skip: OLDSKIP }, () => {
    for (const k of Object.keys(A2_CASES)) {
        const n = a2run(TOOL, k), o = a2run(oldRoot(), k);
        assert.equal(rd(join(n.O, 'budget.turbo.tsv')), rd(join(o.O, 'budget.turbo.tsv')), `fixture ${k}: budget.turbo.tsv differs from the old root`);
    }
});

// =====================================================================================================================
// A3 R2: the bytecode probe reads a regular file, not a pipe
// =====================================================================================================================
const FAKE_PIPE = replaceOnce(FAKE, '*" --print-bytecode "*) printf', '*" --print-bytecode "*) if [ -p /dev/stdout ]; then k=pipe; else k=file; fi; echo $k >> "$h/pipe.log"; printf', 'fake-pipe');
const BC = (c, out) => ['--tiers', 'turbo', '--runs', '2', '--fn', 'read.set', '--node', c.node, '--out', out, 'a.mjs', 'a2.mjs'];
function mkPipeCase() { const c = mkCase(); writeFileSync(c.node, FAKE_PIPE); chmodSync(c.node, 0o755); c.pipes = () => wl(join(c.bin, 'pipe.log')); return c; }
test('A3 R2: the probe\'s node stdout is a regular file: 2 file / 0 pipe for --fn read.set', { ...TD }, () => {
    const c = mkPipeCase();
    const r = run(TOOL, c, BC(c, join(c.dir, 'o')));
    code(r, 0, 'bytecode run'); assert.ok(r.stdout.includes('read.set: 285 -> 285 bytes (+0)'), msg(r));
    assert.deepEqual(c.pipes(), ['file', 'file'], 'before + after probe: both regular files');
});
test('A3 R2 old twin: the old root probes through a pipe (2 pipe)', { skip: OLDSKIP }, () => {
    const c = mkPipeCase();
    code(run(oldRoot(), c, BC(c, join(c.dir, 'o'))), 0, 'old bytecode run');
    assert.deepEqual(c.pipes(), ['pipe', 'pipe']);
});
function shimDir(c, name, body) {
    const d = join(c.dir, 'shim'); mkdirSync(d, { recursive: true });
    const real = spawn('sh', ['-c', `command -v ${name}`], {}, `command -v ${name}`, 10000).stdout.trim();
    assert.ok(real.startsWith('/'), `real ${name} found: ${real}`);
    writeFileSync(join(d, name), `#!/bin/sh\n${body.replaceAll('REAL', real)}\n`); chmodSync(join(d, name), 0o755);
    return d;
}
test('A3 R2: 9 runs through a logging mktemp shim log 18 calls (2 per run) and leave 0 inlining-budget-diff.* files', { ...TD }, () => {
    const c = mkCase(), log = join(c.dir, 'mktemp.log');
    const d = shimDir(c, 'mktemp', `printf 'x\\n' >> '${log}'\nexec REAL "$@"`);
    for (let i = 0; i < 9; i++) code(run(TOOL, c, BC(c, join(c.dir, `o${i}`)), { env: { PATH: `${d}:${process.env.PATH}` } }), 0, `run ${i}`);
    assert.equal(wl(log).length, 18, 'one mktemp per probe, 2 probes per run');
    assert.deepEqual(ls(c.tmp).filter((n) => n.startsWith('inlining-budget-diff.')), [], 'every probe file removed');
});

// =====================================================================================================================
// A4 R2 failure paths
// =====================================================================================================================
const ULIM = (root, c, args, o = {}) => spawn(BASH, ['-c', 'trap "" XFSZ; ulimit -f 32; exec "$0" "$@"', BASH, root, ...args], { cwd: o.cwd || c.w, env: cleanEnv({ TMPDIR: c.tmp, ...(o.env || {}) }) }, 'ibd under ulimit -f 32', 90000);
test('A4 R2 relative TMPDIR: the temp file is made against the caller cwd, not the driver dir -> `  read.set: 285 -> 285 bytes (+0)` (regression pin: red on the redirect-in-cd mutant)', { skip }, () => {
    const c = mkCase(); mkdirSync(join(c.w, 'd')); mkdirSync(join(c.w, 'rel'));
    for (const f of ['a.mjs', 'a2.mjs']) writeFileSync(join(c.w, 'd', f), T_RS);
    const r = run(TOOL, c, ['--tiers', 'turbo', '--runs', '2', '--fn', 'read.set', '--node', c.node, '--out', join(c.dir, 'o'), 'd/a.mjs', 'd/a2.mjs'], { env: { TMPDIR: 'rel' } });
    code(r, 0, 'relative TMPDIR'); assert.ok(hasLine(r.stdout, '  read.set: 285 -> 285 bytes (+0)'), msg(r));
    assert.deepEqual(ls(join(c.w, 'rel')), [], 'no probe file left');
});
test('A4 R2: TMPDIR a regular file (with --out) -> each side `(mktemp exited N)`, 0 `driver exited`, the same VERDICT as the control', { ...TD }, () => {
    const c = mkCase(), O = join(c.dir, 'o'), f = join(c.dir, 'notadir'); writeFileSync(f, 'x');
    const ctl = run(TOOL, c, BC(c, join(c.dir, 'octl')));
    const r = run(TOOL, c, BC(c, O), { env: { TMPDIR: f } });
    assert.match(r.stdout, /^  read\.set: \(mktemp exited [1-9][0-9]*\) -> \(mktemp exited [1-9][0-9]*\)$/m, msg(r));
    assert.equal((r.stdout + r.stderr).includes('driver exited'), false, msg(r));
    assert.equal(verdict(r), verdict(ctl), `verdict unmoved\n${msg(r)}`); assert.equal(r.status, ctl.status);
});
test('A4 R2: `ulimit -f 32` with XFSZ ignored -> each side `(append exited N)`, 0 `driver exited`, verdict unmoved', { ...TD }, () => {
    const c = mkCase();
    const ctl = run(TOOL, c, BC(c, join(c.dir, 'octl')));
    const r = ULIM(TOOL, c, BC(c, join(c.dir, 'o')));
    assert.match(r.stdout, /^  read\.set: \(append exited [1-9][0-9]*\) -> \(append exited [1-9][0-9]*\)$/m, msg(r));
    assert.equal((r.stdout + r.stderr).includes('driver exited'), false, msg(r));
    assert.equal(verdict(r), verdict(ctl), msg(r)); assert.equal(r.status, ctl.status);
});
for (const lim of [false, true]) {
    test(`A4 R2: an awk shim failing the BYTECODE_AWK program${lim ? ' under ulimit -f 32 (precedence awk > append)' : ''} -> exit 2, "awk exited 7", exactly one VERDICT line (NO-VERDICT)`, { ...TD }, () => {
        const c = mkCase();
        const d = shimDir(c, 'awk', 'case "$*" in *"Bytecode length"*) exit 7 ;; esac\nexec REAL "$@"');
        const env = { PATH: `${d}:${process.env.PATH}` };
        const r = lim ? ULIM(TOOL, c, BC(c, join(c.dir, 'o')), { env }) : run(TOOL, c, BC(c, join(c.dir, 'o')), { env });
        code(r, 2, 'awk failure');
        const all = r.stdout + r.stderr;
        assert.ok(all.includes('awk exited 7'), `names the step and its rc\n${msg(r)}`);
        assert.equal(all.includes('append exited'), false, msg(r));
        assert.equal((all.match(/^VERDICT /gm) || []).length, 1, `exactly one VERDICT line\n${msg(r)}`);
        assert.ok(/^VERDICT NO-VERDICT$/m.test(all), msg(r));
    });
}

// =====================================================================================================================
// A5 real node, a held-full stdout pipe (model: audit-g1 BB-opus-1)
// =====================================================================================================================
const HOLD_DRIVER5 = [
    "import { Worker, isMainThread, workerData } from 'node:worker_threads';",
    "import { writeSync, fstatSync } from 'node:fs';",
    'if (!isMainThread) {',
    '  const flag = new Int32Array(workerData);',
    '  const buf = Buffer.alloc(4096, 10);',
    '  const fifo = fstatSync(1).isFIFO(); let left = 8 * 1024 * 1024;',
    "  while (Atomics.load(flag, 0) === 0 && (fifo || left > 0)) { try { left -= writeSync(1, buf); } catch (e) { if (e.code !== 'EAGAIN') throw e; } }",
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
let HOLD5 = null;
function hold5() {
    if (HOLD5 !== null) return HOLD5;
    const d = mk('hold5'); writeFileSync(join(d, 'd.mjs'), HOLD_DRIVER5);
    const fd = openSync(join(d, 'truth.txt'), 'w');
    let t;
    try { t = capSync(process.execPath, ['--print-bytecode', '--print-bytecode-filter=f', './d.mjs'], { cwd: d, env: cleanEnv(), stdio: ['ignore', fd, fd] }, 60000, 'A5 truth run'); } finally { closeSync(fd); }
    const lens = wl(join(d, 'truth.txt')).filter((l) => l.startsWith('Bytecode length: ')).map((l) => l.slice(17)).join(',');
    return (HOLD5 = { d, ok: t.status === 0 && lens === '3,50', lens, status: t.status });
}
// Q-B62-A5: a real-node race row is a demonstration, never part of npm test (inside the full suite an attempt can pass its
// 180 s cap). Opt in with LITEUTILS_REAL_HOLD=1 and run this file alone; each G-unit stop gate records that run in evidence.
const HOLD5_OPTIN = process.env.LITEUTILS_REAL_HOLD === '1';
const hold5Skip = () => {
    if (!HOLD5_OPTIN) return 'opt-in real-node race row (Q-B62-A5): set LITEUTILS_REAL_HOLD=1 and run test/audit-g5.test.mjs alone';
    const h = hold5(); return h.ok ? false : `A5 truth through a regular file is not 3,50 (got "${h.lens}", exit ${h.status}) on this node`;
};
function hold5Runs(root) {
    const h = hold5(), t = mk('hold5tmp'), out = [];
    for (let i = 0; i < 3; i++) {
        out.push(spawn(BASH, [root, '--node', process.execPath, '--tiers', 'turbo', '--runs', '2', '--fn', 'f', '--out', join(t, `o${i}`), 'd.mjs', 'd.mjs'], { cwd: h.d, env: cleanEnv({ TMPDIR: t }) }, 'A5 attempt', 180000));
    }
    return out;
}
const f5 = (r) => (/^  f: (\S*) -> (\S*)$/m.exec(r.stdout) || [null, null, null]).slice(1);
// ADDENDUM A3 + A4 (Q-B62-TEAR, Q-B62-FLAG): an attempt is either a report (`  f: A -> B`, each side exactly 3,50 or holding a ?) or the glue-check / kConcurrent-check
// die (exit 2, no f line, stderr names the glue). Either way exactly one VERDICT line over stdout + stderr. A side that lost 50
// without a ? (`3`, `3,`, `50`) FAILS.
test('A5 real held pipe: each of 3 attempts prints `  f: 3,50 -> 3,50`, a `?` on a side, or dies on the glue check / kConcurrent check (NO-VERDICT, no f line); exactly 1 VERDICT line; never a list missing 50 without ?', { skip: skip || hold5Skip() }, () => {
    for (const [i, r] of hold5Runs(TOOL).entries()) {
        const sides = f5(r), all = r.stdout + r.stderr;
        assert.equal((all.match(/^VERDICT /gm) || []).length, 1, `attempt ${i + 1}: exactly 1 VERDICT line\n${msg(r)}`);
        if (sides[0] === null) {
            assert.equal(r.status, 2, `attempt ${i + 1}: no \`  f: A -> B\` line and not exit 2\n${msg(r)}`);
            // glue-check die, or the Q-B62-FLAG kConcurrent compile-line die (A4: ruled, fail closed)
            assert.ok(/^VERDICT NO-VERDICT$/m.test(all) && (r.stderr.includes('driver output glued to a V8 compile line') || r.stderr.includes('background compile (--no-concurrent-recompilation overridden')),
                `attempt ${i + 1}: no \`  f: A -> B\` line and not the glue-check / kConcurrent NO-VERDICT\n${msg(r)}`);
            continue;
        }
        for (const s of sides) assert.ok(s === '3,50' || s.includes('?'), `attempt ${i + 1}: side "${s}" lost 50 without a ?\n${msg(r)}`);
    }
});
test('A5 real held pipe twin: the 7c91d1c root drops 50 in at least 1 of 3 attempts (local only; red-on-old pin of the row above)', { skip: skip || OLDSKIP || (CI_STRICT ? 'local only: the old root pipe drop depends on the host' : false) || hold5Skip() }, () => {
    const x = hold5Runs(oldRoot());
    assert.ok(x.some((r) => { const s = f5(r); return s[0] === null || s.some((v) => !v.includes('50')); }), `old root never lost 50 in 3 attempts: ${x.map((r) => f5(r).join('/')).join(' | ')}`);
});

// --- 5c ---
//
// b62 G5 batch 5c (helper B3): rows of .handoff/PLAN-b62-g5c.md ASSERTIONS A1-A5 + ADDENDUM A1 (Q-B62-TL: header absent = off).
// Oracle: the PLAN text (refusal key phrases, exit codes, spawn counts, the B-row shape); the coder's exact wording is matched
// only where the plan quotes it. Old = 7c91d1c: each gate row is paired with an old twin showing the gate red on the old root.
// Mutants: drop-arm is in the coder's MUTANTS table; glob, prefix match, `?` as off and the @TF anchor mutants are killed
// by the A1 controls, the A3 controls, the :738-deleted row and the A2 OSR / TF-named rows (reviewer b65, measured).
// Real-node twin (old root through real node) is opt-in with LITEUTILS_REAL_HOLD=1 (Q-B62-A5 style: host dependent).

const TL_OPT = { skip };
const ML2 = (fn, cand, id) => nl(TFC(fn, id, ', mode: ConcurrencyMode::kSynchronous]', 'MAGLEV'),
    `== Inlining 0x2a8c1dc1afb1 <SharedFunctionInfo ${cand}>`, `== Inlining 0x2a8c1dc1afb2 <SharedFunctionInfo ${cand}>`, TFD(fn, id, 'MAGLEV'));
const M5 = (c, out, extra = [], pos = ['a.mjs', 'b.mjs']) => ['--tiers', 'maglev', '--runs', '2', '--fn', 'm0', '--no-bytecode', '--node', c.node, ...extra, '--out', out, ...pos];
const snap2 = (c, cwd) => [ls(c.tmp), ls(cwd)];

// ---- A1 (gate b): --turbolev / --turbolev-future in --v8-flags ----
for (const f of ['--turbolev', '--turbolev-future']) {
    test(`5c A1 (b): --tiers maglev --v8-flags=${f} -> exit 2, named, NO-VERDICT, empty stdout, exactly 2 spawns, OUT not created`, TL_OPT, () => {
        const c = mkCase(ML2('m0', 'l1', '1d86'), ML2('m0', 'l1', '1d86')), O = join(c.dir, 'o');
        const r = run(TOOL, c, M5(c, O, [`--v8-flags=${f}`]));
        nv(r, '--v8-flags must not set', `${f}`);
        assert.ok(r.stderr.includes('--turbolev changes which tier --trace-maglev-inlining describes'), `${f}: the reason\n${msg(r)}`);
        assert.equal(c.spawns().length, 2, `${f}: 2 spawns (-p, --v8-options): ${JSON.stringify(c.spawns())}`);
        assert.equal(existsSync(O), false, `${f}: OUT must not be created`);
    });
    test(`5c A1 (b) old twin: 7c91d1c with --v8-flags=${f} reaches exit 0 SAME`, { skip: OLDSKIP }, () => {
        const c = mkCase(ML2('m0', 'l1', '1d86'), ML2('m0', 'l1', '1d86'));
        const r = run(oldRoot(), c, M5(c, join(c.dir, 'o'), [`--v8-flags=${f}`]));
        code(r, 0, `old ${f}`); assert.equal(verdict(r), 'SAME', msg(r));
    });
}
for (const f of ['--no-turbolev', '--no-turbolev-future', '--max-turbolev-inline-depth=40']) {
    test(`5c A1 control: --v8-flags=${f} passes the refusal -> exit 0 SAME`, TL_OPT, () => {
        const c = mkCase(ML2('m0', 'l1', '1d86'), ML2('m0', 'l1', '1d86'));
        const r = run(TOOL, c, M5(c, join(c.dir, 'o'), [`--v8-flags=${f}`]));
        code(r, 0, f); assert.equal(verdict(r), 'SAME', msg(r));
    });
}
// real node: a null pair (l1; m0 = 3x l1; hot = 2x m0; 200k iterations; byte-identical copies). The refusal fires before any run.
const REAL_DRV = [
    'function l1(x) { return x + 1; }',
    'function m0(x) { return l1(x) + l1(x) + l1(x); }',
    'function hot(x) { return m0(x) + m0(x); }',
    'let s = 0;',
    'for (let i = 0; i < 200000; i++) s += hot(i);',
    'if (s === -1) console.log(s);',
    '',
].join('\n');
const realListsTurbolev = spawn(process.execPath, ['--v8-options'], {}, 'real node --v8-options', 30000).stdout.includes('\n  --turbolev (');
function realCase() {
    const c = mkCase(); writeFileSync(join(c.w, 'a.mjs'), REAL_DRV); writeFileSync(join(c.w, 'b.mjs'), REAL_DRV);
    return c;
}
const realArgs = (c, out, extra) => ['--node', process.execPath, '--tiers', 'maglev', '--runs', '2', '--no-bytecode', ...extra, '--out', out, 'a.mjs', 'b.mjs'];
test('5c A1 real node: null pair with --v8-flags=--turbolev -> exit 2 named NO-VERDICT, raw/ absent (skip unless this node lists --turbolev)', { skip: skip || (realListsTurbolev ? false : 'this node --v8-options does not list `  --turbolev (`') }, () => {
    const c = realCase(), O = join(c.dir, 'o');
    const r = run(TOOL, c, realArgs(c, O, ['--v8-flags=--turbolev']), { env: { ME: 'm0' } });
    nv(r, '--v8-flags must not set', 'real --turbolev');
    assert.equal(existsSync(join(O, 'raw')), false, 'raw/ absent');
});
test('5c A1 real node old twin (opt-in LITEUTILS_REAL_HOLD=1): 7c91d1c on the same null pair with --turbolev -> exit 0 SAME', { skip: skip || OLDSKIP || (!HOLD5_OPTIN ? 'opt-in real-node row: set LITEUTILS_REAL_HOLD=1' : false) || (realListsTurbolev ? false : 'node lacks --turbolev') }, () => {
    const c = realCase();
    const r = run(oldRoot(), c, realArgs(c, join(c.dir, 'o'), ['--v8-flags=--turbolev']), { env: { ME: 'm0' }, cap: 170000 });
    code(r, 0, 'old real --turbolev'); assert.equal(verdict(r), 'SAME', msg(r));
});

// ---- A2 (gate a): @TF unit in a maglev-tier dec file ----
const HOTL = '== Inlining 0x3a1 <SharedFunctionInfo q>';
const TFU = (n, extra = [], osr = false) => nl(TFC('hot', '7d86', osr ? ' OSR, mode: ConcurrencyMode::kSynchronous]' : undefined), ...Array(n).fill(HOTL), ...extra, TFD('hot', '7d86', 'TURBOFAN_JS', osr ? ' OSR' : ''));
const A2_BEFORE = (osr) => ML2('m0', 'l1', '1d86') + TFU(7, [], osr);
const A2_AFTER = (osr) => ML2('m0', 'l1', '1d86') + TFU(6, ['Main budget exhausted (978 > 920)'], osr);
for (const [what, osr] of [['TF unit hot 7 vs 6 `== Inlining` q', false], ['TF unit only as `(target TURBOFAN_JS) OSR`', true]]) {
    test(`5c A2 (a): maglev dec with @ML lines equal and ${what} -> exit 2 "=== maglev: NO-VERDICT" naming @TF, no "all decision lines:"`, TL_OPT, () => {
        const c = mkCase(A2_BEFORE(osr), A2_AFTER(osr));
        const r = run(TOOL, c, M5(c, join(c.dir, 'o')));
        code(r, 2, 'A2'); assert.equal(verdict(r), 'NO-VERDICT', msg(r));
        assert.ok(r.stdout.includes('=== maglev: NO-VERDICT'), msg(r));
        assert.ok(r.stdout.includes('@TF'), `names @TF\n${msg(r)}`);
        assert.equal(r.stdout.includes('all decision lines:'), false, msg(r));
    });
}
test('5c A2 (a) old twin: the same pair is `maglev DIFF` exit 1 on 7c91d1c', { skip: OLDSKIP }, () => {
    const c = mkCase(A2_BEFORE(false), A2_AFTER(false));
    const r = run(oldRoot(), c, M5(c, join(c.dir, 'o')));
    code(r, 1, 'old A2'); assert.equal(verdict(r), 'DIFF', msg(r));
});
test('5c A2 control: an @ML-only pair for a function named `TF` -> exit 0 SAME (the @TF anchor needs the tag, not the name)', TL_OPT, () => {
    const c = mkCase(ML2('TF', 'l1', '1d86'), ML2('TF', 'l1', '1d86'));
    const r = run(TOOL, c, ['--tiers', 'maglev', '--runs', '2', '--fn', 'TF', '--no-bytecode', '--node', c.node, '--out', join(c.dir, 'o'), 'a.mjs', 'b.mjs']);
    code(r, 0, 'TF-named fn'); assert.equal(verdict(r), 'SAME', msg(r));
});

// ---- A3 (gate c): Turbolev on by default in --v8-options ----
const V8TXT = rd(V8OPT).split('\n');
const L_ON = '        type: bool  default: --no-turbolev';
const L_ONF = '        type: bool  default: --no-turbolev-future';
function withOpts(c, lines) { writeFileSync(join(c.bin, 'v8-options.txt'), lines.join('\n')); return c; }
function modOpts(edit) { const l = V8TXT.slice(); edit(l); return l; }
test('5c A3 fixture anchors: v8-options.v26.8.2.txt :737-744 are the --turbolev / --turbolev-future headers and defaults', { skip }, () => {
    assert.ok(V8TXT[736].startsWith('  --turbolev ('), V8TXT[736]); assert.equal(V8TXT[737], L_ON);
    assert.ok(V8TXT[742].startsWith('  --turbolev-future ('), V8TXT[742]); assert.equal(V8TXT[743], L_ONF);
});
const A3_ON = [
    ['--turbolev default on (:738)', (l) => { l[737] = '        type: bool  default: --turbolev'; }, 'Turbolev is on by default'],
    ['--turbolev-future default on (:744)', (l) => { l[743] = '        type: bool  default: --turbolev-future'; }, 'Turbolev is on by default'],
    ['--turbolev default line deleted (:738)', (l) => { l.splice(737, 1); }, 'cannot read the --turbolev default'],
];
for (const [what, edit, die] of A3_ON) {
    test(`5c A3 (c): ${what} -> exit 2 "${die}", exactly 3 spawns (-p, --v8-options x2), raw/ and dec/ empty`, TL_OPT, () => {
        const c = withOpts(mkCase(), modOpts(edit)), O = join(c.dir, 'o');
        const r = run(TOOL, c, B(c, O, []).concat(['a.mjs', 'a2.mjs']));
        nv(r, die, what);
        assert.equal(c.spawns().length, 3, `${what}: 3 spawns: ${JSON.stringify(c.spawns())}`);
        assert.deepEqual(ls(join(O, 'raw')), [], 'raw/ empty'); assert.deepEqual(ls(join(O, 'dec')), [], 'dec/ empty');
    });
}
const A3_CTL = [['unmodified fixture', (l) => {}], ['fixture minus :737-744 (header absent = off, Q-B62-TL)', (l) => { l.splice(736, 8); }]];
for (const [what, edit] of A3_CTL) {
    test(`5c A3 control: ${what} -> a verdict (exit 0 SAME)`, TL_OPT, () => {
        const c = withOpts(mkCase(), modOpts(edit));
        const r = run(TOOL, c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs']);
        code(r, 0, what); assert.equal(verdict(r), 'SAME', msg(r));
    });
}
test('5c A3 (c) old twin: all five fixtures reach a verdict (exit 0 SAME) on 7c91d1c', { skip: OLDSKIP }, () => {
    for (const [what, edit] of [...A3_ON.map(([w, e]) => [w, e]), ...A3_CTL]) {
        const c = withOpts(mkCase(), modOpts(edit));
        const r = run(oldRoot(), c, [...B(c, join(c.dir, 'o')), 'a.mjs', 'a2.mjs']);
        code(r, 0, `old ${what}`); assert.equal(verdict(r), 'SAME', `old ${what}\n${msg(r)}`);
    }
});

// ---- A4 (gate d, REPORTED): the real lowercase budget line ----
const BUDL = ['> generated 13 nodes. regular_budget += 54 ~~> 54', '> generated 13 nodes. small_budget += 67 ~~> 67'];
const MUB = (withB) => nl(TFC('m0', '1d86', ', mode: ConcurrencyMode::kSynchronous]', 'MAGLEV'), ...(withB ? BUDL : []),
    '== Inlining 0x2a8c1dc1afb1 <SharedFunctionInfo l1>', TFD('m0', '1d86', 'MAGLEV'));
const A4_NOTE = 'no Maglev budget counter in run 1';
test('5c A4 (d): `generated N nodes. regular_budget / small_budget` lines -> two exact B rows, no NOTE, same VERDICT as without them', TL_OPT, () => {
    const c = mkCase(MUB(true), MUB(true)), O = join(c.dir, 'o');
    const r = run(TOOL, c, M5(c, O));
    const c0 = mkCase(MUB(false), MUB(false));
    const r0 = run(TOOL, c0, M5(c0, join(c0.dir, 'o')));
    assert.equal(verdict(r), verdict(r0), msg(r)); assert.equal(r.status, r0.status);
    assert.deepEqual(wl(join(O, 'bud', 'maglev.before.1.tsv')).filter((l) => l.startsWith('B\t')), ['B\tm0@ML\tregular\t54\t54', 'B\tm0@ML\tsmall\t67\t67']);
    assert.equal(r.stdout.includes(A4_NOTE), false, `no budget-counter NOTE\n${msg(r)}`);
});
test('5c A4 (d) old twin: 7c91d1c emits 0 B rows and prints the "prints no Maglev budget counters" NOTE', { skip: OLDSKIP }, () => {
    const c = mkCase(MUB(true), MUB(true)), O = join(c.dir, 'o');
    const r = run(oldRoot(), c, M5(c, O));
    assert.deepEqual(wl(join(O, 'bud', 'maglev.before.1.tsv')).filter((l) => l.startsWith('B\t')), []);
    assert.ok(r.stdout.includes('prints no Maglev budget counters'), msg(r));
});

// ---- A5: spawns and retention ----
test('5c A5: a normal run spawns exactly as many times as on 7c91d1c (regression pin: the gates add 0 spawns)', { skip: skip || OLDSKIP }, () => {
    const c = mkCase(ML2('m0', 'l1', '1d86'), ML2('m0', 'l1', '1d86')), c2 = mkCase(ML2('m0', 'l1', '1d86'), ML2('m0', 'l1', '1d86'));
    code(run(TOOL, c, M5(c, join(c.dir, 'o'))), 0, 'live'); code(run(oldRoot(), c2, M5(c2, join(c2.dir, 'o'))), 0, 'old');
    assert.equal(c.spawns().length, c2.spawns().length, `live ${JSON.stringify(c.spawns())} vs old ${JSON.stringify(c2.spawns())}`);
});
test('5c A5: 20 cycles of the A1 refusal add 0 entries to TMPDIR or cwd (OUT never created)', TL_OPT, () => {
    const c = mkCase(), O = join(c.dir, 'o');
    const s0 = snap2(c, c.w);
    for (let i = 0; i < 20; i++) {
        const r = run(TOOL, c, M5(c, O, ['--v8-flags=--turbolev']));
        assert.equal(r.status, 2, `cycle ${i}\n${msg(r)}`); assert.ok(r.stderr.includes('--v8-flags must not set'));
    }
    assert.deepEqual(snap2(c, c.w), s0, 'TMPDIR / cwd unchanged'); assert.equal(existsSync(O), false);
    assert.equal(c.spawns().length, 40, '20 cycles x 2 spawns');
});
test('5c A5: 20 cycles of the A3 refusal on one OUT leave exactly raw dec bud ms stage + a 0-byte report.txt', TL_OPT, () => {
    const c = withOpts(mkCase(), modOpts(A3_ON[0][1])), O = join(c.dir, 'o');
    for (let i = 0; i < 20; i++) {
        const r = run(TOOL, c, [...B(c, O), 'a.mjs', 'a2.mjs']);
        assert.equal(r.status, 2, `cycle ${i}\n${msg(r)}`);
    }
    assert.deepEqual(ls(O), ['bud', 'dec', 'ms', 'raw', 'report.txt', 'stage']);
    assert.equal(statSync(join(O, 'report.txt')).size, 0, 'report.txt stays 0 bytes');
});
