// test/shlib.test.mjs -- G-SHLIB (b48, plan .handoff/PLAN-b48-shlib.md: TASK 11, ASSERTIONS 3 (last mutant), 4, 5,
// ADDENDA) + G-SHL3 (b50, plan .handoff/PLAN-b50-shl3.md: ASSERTIONS 1, 2, 3, 5; tasks 6 and 8).
// Oracle: the PLAN assertions and argon's A1a / A1b / A2 shapes
// (audit/2026-11-07-deopt-diff/argon_reproduction.mjs),
// never a copy of what the new code prints. Rows:
//   D1-D4  drift gate (ASSERTION 4) + its must-fail twins (5e570f0 pre-G-SHLIB common.sh, a one-byte-mutated copy)
//   I1-I5  inlining-budget-diff.sh (shared lib via refuse_live): A1b + A2 refuse (exit 2, IBD_PRE node spawns); the same
//          two rows do NOT refuse on the 5e570f0 (git history) ibd
//   I6     (b50 N1) A1a is refused on ibd (it includes lib/tracked.sh); I6t twin: the bd0192f ibd does not refuse
//   I6f    fallback build: ibd built WITHOUT its tracked.sh include still refuses A1a (common.sh's is_tracked is
//          physical); the same copy with the bd0192f lib/common.sh does not
//   I7*    (b50 B2b) --after a symlink into the repo: refused; twin on bd0192f; unlinked control; mutant (line deleted)
//   I8*    (b50 B2c) --after named like a tracked repo file hard-linked to --before: refused; twin; residual
//          "accepted by design" (a link to repo/src/F); mutant (token dropped)
//   M      (b50, retargeted) the logical-`cd` mutant of common.sh's is_tracked, in the fallback build, lets A1a through.
//          The old M (resolve_links relative arm back to a logical join) is RETIRED: with N1 every consumer of its
//          path (cd -P, git -C, stat -L, [[ -L ]]) resolves a `..` physically, so the mutant is equivalent on every root
//   S      ASSERTION 5: refuse_live git spawns (dd, files outside any repo) == 6 with cwd outside a repo, 7 with cwd
//          inside one (S1 / S1i / S1t); the B2b guard without -L makes 7 / 8 (S1m); 20 back-to-back R5 runs, and 20
//          R9 runs (unwritable OUT), leave 0 entries in TMPDIR / 0 OUT dirs created
//   L K C D  (b51, G-SHL3 r2, PLAN ADDENDA A2 / A3): L1 `-/`-led symlinked --after (one VERDICT; twin = r1
//          text put back: two), L1d bb / dd unaffected, K1 the new "cannot resolve its symlink chain" die via a
//          shimmed readlink, C1 ibd under CDPATH, D1 / D2 `-`-led tracked --before (mutants: the `./` prefix deleted
//          at each of the three sites, readlink `--` removed). Every twin is an in-file mutant build, none reads .handoff/.
//          U2: F16 rewrites a `-`-led path before any of this, so L1 is a clean run and the `-`-led twins are built on NOF16
//          (the F16 lines deleted). K2 a readlink that exits 1; X1 / X1h the `--` sites on NOF16 (clean `-b.js`).
//   N      nested retention: 2 nested runs of this file leave their private mkdtemp root empty
// Independent expected value for S1 (6): refuse_live = is_tracked(f) + is_tracked(p) (1 rev-parse each, outside a
// repo) + live_tops top_of for ".", dirname(--after), dirname(f), dirname(p) (REPO is unset in file mode) = 2 + 4 = 6 git
// spawns; the B2b line is skipped by its -L guard (--after is no symlink). Unguarded it is one more top_of outside a
// repo = 1 more rev-parse = 7 (a top_of inside a work tree spawns 2: rev-parse x2).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import {
    mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync, symlinkSync, linkSync, chmodSync, realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Every row is synchronous spawnSync: yield once BEFORE each test so the previous report flushes (b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const NESTED =process.env.SHLIB_NESTED !== undefined && process.env.SHLIB_NESTED === process.env.TMPDIR;
const BEFORE_SHA = '5e570f0';   // the before build: on origin/main; its lib/common.sh and inlining-budget-diff.sh are byte-identical to the b48 pre-G-SHLIB build
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const PREFIX = 'shlib-';

const ENV = { ...process.env };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR',
    'GIT_CEILING_DIRECTORIES', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'NODE', 'OUTDIR', 'NODE_OPTIONS', 'SHLIB_NESTED']) delete ENV[k];
ENV.GIT_CONFIG_GLOBAL = '/dev/null';
ENV.GIT_CONFIG_NOSYSTEM = '1';
ENV.NODE_V8_COVERAGE = undefined;
delete ENV.NODE_TEST_CONTEXT;      // a nested `node file` run must print TAP text, not the parent's v8-serialized events

let TOP = null;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), PREFIX))); return TOP; }
let seq = 0;
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => {
    mkTop();
    if (NESTED) assert.ok(TOP.startsWith(realpathSync(process.env.TMPDIR)), `nested mkdtemp root ${TOP} must be under ${process.env.TMPDIR}`);
});
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

function git(cwd, args) {
    const r = capSync('git', args, { cwd, encoding: 'utf8', env: ENV }, 30000, `git ${args[0]}`);
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}
// the before-build texts come from git history (not the gitignored .handoff), written under the mkdtemp root
let HAVE = null, HIST = null;
function haveHist() {
    if (HAVE === null) {
        const r = capSync('git', ['cat-file', '-e', `${BEFORE_SHA}^{commit}`], { cwd: ROOT, encoding: 'utf8', env: ENV }, 30000, 'git cat-file');
        HAVE = r.status === 0 ? true : `commit ${BEFORE_SHA} not available (shallow clone?)`;
    }
    return HAVE;
}
function hist() {
    const have = haveHist();
    if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`);
    if (HIST === null) {
        const d = mk('hist'); chmodSync(d, 0o755);
        HIST = {};
        for (const [k, f] of [['common', 'lib/common.sh'], ['ibd', 'inlining-budget-diff.sh']]) {
            const r = capSync('git', ['show', `${BEFORE_SHA}:${f}`], { cwd: ROOT, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 }, 30000, `git show ${f}`);
            assert.equal(r.status, 0, r.stderr);
            HIST[k] = join(d, k === 'ibd' ? 'inlining-budget-diff.sh' : 'common.sh');
            writeFileSync(HIST[k], r.stdout);
            chmodSync(HIST[k], 0o755);
        }
    }
    return HIST;
}
function sha8(p) { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 8); }

// ---------------------------------------------------------------- D: drift gate (ASSERTION 4)
const CLASSIFIER = '    case "$l" in "fatal: not a git repository (or any "*) return 1 ;; esac';
function lineCount(text, line) { return text.split('\n').filter((l) => l === line).length; }
// problems of a (common.sh, tracked.sh) pair per ASSERTION 4; [] = the gate holds
function drift(common, tracked) {
    const p = [];
    const c = lineCount(common, CLASSIFIER), t = lineCount(tracked, CLASSIFIER);
    if (c !== 1) p.push(`classifier line in common.sh: ${c}x, want 1`);
    if (t !== 1) p.push(`classifier line in tracked.sh: ${t}x, want 1`);
    const swallow = common.split('\n').filter((l) => /\bgit\b.*2>\/dev\/null \|\| true/.test(l)).length;
    if (swallow !== 0) p.push(`git calls followed by "2>/dev/null || true" in common.sh: ${swallow}, want 0`);
    return p;
}
const LIB = (r, f) => readFileSync(join(r, 'lib', f), 'utf8');
const HSKIP = () => skip || histSkip(haveHist());

// the b50 frozen BEFORE build (bd0192f, git history, never the gitignored .handoff): its ibd root and lib/common.sh
const SHL3_SHA = 'bd0192f';
let HAVE3 = null, HIST3 = null;
function haveHist3() {
    if (HAVE3 === null) {
        const r = capSync('git', ['cat-file', '-e', `${SHL3_SHA}^{commit}`],
            { cwd: ROOT, encoding: 'utf8', env: ENV }, 30000, 'git cat-file');
        HAVE3 = r.status === 0 ? true : `commit ${SHL3_SHA} not available (shallow clone?)`;
    }
    return HAVE3;
}
function hist3() {
    const have = haveHist3();
    if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`);
    if (HIST3 === null) {
        const d = mk('hist3'); chmodSync(d, 0o755);
        HIST3 = {};
        for (const [k, f, n] of [['common', 'lib/common.sh', 'common.sh'], ['ibd', 'inlining-budget-diff.sh',
            'ibd.sh']]) {
            const r = capSync('git', ['show', `${SHL3_SHA}:${f}`],
                { cwd: ROOT, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 }, 30000, `git show ${f}`);
            assert.equal(r.status, 0, r.stderr);
            HIST3[k] = join(d, n);
            writeFileSync(HIST3[k], r.stdout);
            chmodSync(HIST3[k], 0o755);
        }
    }
    return HIST3;
}
const HSKIP3 = () => skip || histSkip(haveHist3());
// a private copy of build.sh + src + lib, built; edits: [kind 'src' | 'lib', file, from, to]; from === null replaces
// the whole file; every anchor must match exactly once. Returns the out dir (the roots are named as in the repo root).
function privBuild(name, edits) {
    const d = mk(`pb-${name}`);
    cpSync(join(ROOT, 'build.sh'), join(d, 'build.sh'));
    cpSync(join(ROOT, 'src'), join(d, 'src'), { recursive: true });
    cpSync(join(ROOT, 'lib'), join(d, 'lib'), { recursive: true });
    for (const [kind, f, from, to] of edits) {
        const p = join(d, kind, f), t = readFileSync(p, 'utf8');
        if (from === null) { writeFileSync(p, to); continue; }
        const n = t.split(from).length - 1;
        assert.equal(n, 1, `${name}: anchor must match exactly once in ${kind}/${f}, matched ${n}: ${from}`);
        writeFileSync(p, t.replace(from, () => to));
    }
    const out = mk(`pb-out-${name}`);
    const b = capSync('bash', ['build.sh', out], { cwd: d, encoding: 'utf8', env: ENV }, 60000,
        `bash build.sh (${name})`);
    assert.equal(b.status, 0, b.stdout + b.stderr);
    return out;
}

test('D1 drift gate: classifier line 1x in lib/tracked.sh and 1x in lib/common.sh; 0 swallowed git calls in common.sh', { skip }, () => {
    assert.deepEqual(drift(LIB(ROOT, 'common.sh'), LIB(ROOT, 'tracked.sh')), []);
});
test('D2 drift gate MUST FAIL on the 5e570f0 (git history) common.sh (4 swallowed git calls, no classifier)', { skip: HSKIP() }, () => {
    const p = drift(readFileSync(hist().common, 'utf8'), LIB(ROOT, 'tracked.sh'));
    assert.ok(p.some((m) => m.includes('"2>/dev/null || true" in common.sh: 4, want 0')), p.join('; '));
});
test('D3 drift gate MUST FAIL on a common.sh copy with one byte changed in its classifier line', { skip }, () => {
    const c = LIB(ROOT, 'common.sh');
    assert.equal(c.split(CLASSIFIER).length - 1, 1, 'mutation anchor must match once');
    const p = drift(c.replace(CLASSIFIER, () => CLASSIFIER.replace('(or any ', '(or any')), LIB(ROOT, 'tracked.sh'));
    assert.deepEqual(p, ['classifier line in common.sh: 0x, want 1']);
});
test('D4 drift gate MUST FAIL when the swallow returns (a git call + "2>/dev/null || true" appended to common.sh)', { skip }, () => {
    const p = drift(LIB(ROOT, 'common.sh') + 'x() { git rev-parse --show-toplevel 2>/dev/null || true; }\n', LIB(ROOT, 'tracked.sh'));
    assert.equal(p.length, 1, p.join('; '));
});

// ---------------------------------------------------------------- fixtures (argon's shapes)
const E9 = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const V8_OPTS = ['  --turbofan (enable TurboFan)', '        type: bool  default: --turbofan', '  --maglev (enable Maglev)',
    '        type: bool  default: --maglev', '  --trace-opt (trace compilation)', '        type: bool  default: --no-trace-opt',
    '  --trace-deopt-verbose (trace verbose deoptimization)', '        type: bool  default: --no-trace-deopt-verbose',
    '  --concurrent-recompilation (concurrent compilation)', '        type: bool  default: --concurrent-recompilation', ''].join('\n');
let FAKE = null, LOG = null;
function fakeNode() {   // logs one line per spawn; answers --version / --v8-options; else prints ./Signal.js or ./trace.txt
    if (FAKE !== null) return FAKE;
    const bin = mk('bin'); LOG = join(bin, 'node-spawns.log'); FAKE = join(bin, 'node');
    writeFileSync(FAKE, `#!${BASH}\necho "$*" >>"${LOG}"\nfor a in "$@"; do\n  case "$a" in\n    --version) echo v26.8.2; exit 0 ;;\n    --v8-options)\n      cat <<'V8EOF'\n${V8_OPTS}V8EOF\n      exit 0 ;;\n  esac\ndone\nif [[ -f ./Signal.js ]]; then cat ./Signal.js; else cat ./trace.txt 2>/dev/null; fi\nexit 0\n`);
    chmodSync(FAKE, 0o755);
    return FAKE;
}
function runScript(script, cwd, args, env = {}) {
    fakeNode();
    rmSync(LOG, { force: true });
    const r = capSync(BASH, [script, ...args], { cwd, encoding: 'utf8', env: { ...ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }, 120000, `${script} run`);
    const out = (r.stdout || '') + (r.stderr || '');
    return { rc: r.status, out, spawns: existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length : 0 };
}
const REFUSALS = /git-tracked working-tree file|git failed while checking whether|is the same file as the live|cannot resolve the directory of/;

function a1bFixture() {  // argon A1b: tracked a/m/trace.txt; a/b/trace.txt -> ../m/trace.txt; frz -> a/b; untracked decoy d/m/trace.txt
    const d = mk('a1b');
    for (const p of ['a/m', 'a/b', 'm', 'after']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'a', 'm', 'trace.txt'), `${E9}\n`);
    writeFileSync(join(d, 'm', 'trace.txt'), `${E9}\n`);
    writeFileSync(join(d, 'after', 'trace.txt'), `${E9}\n`);
    git(join(d, 'a'), ['init', '-q']);
    git(join(d, 'a'), ['add', 'm/trace.txt']);
    symlinkSync('../m/trace.txt', join(d, 'a', 'b', 'trace.txt'));
    symlinkSync(join(d, 'a', 'b'), join(d, 'frz'));
    return { d, args: ['--node', fakeNode(), '--fn', 'm0', '--out', join(d, 'out'), '--before', join(d, 'frz', 'trace.txt'), '--after', join(d, 'after', 'trace.txt')] };
}
function a2Fixture(broken) {  // argon A2: Signal.js tracked in repo/, hard link frz/Signal.js, --after repo/after/Signal.js; `[broken` config
    const d = mk(broken ? 'a2' : 'a2h');
    mkdirSync(join(d, 'repo', 'after'), { recursive: true });
    mkdirSync(join(d, 'frz'), { recursive: true });
    writeFileSync(join(d, 'repo', 'Signal.js'), `${E9}\n`);
    writeFileSync(join(d, 'repo', 'after', 'Signal.js'), `${E9}\n`);
    git(join(d, 'repo'), ['init', '-q']);
    git(join(d, 'repo'), ['add', 'Signal.js']);
    linkSync(join(d, 'repo', 'Signal.js'), join(d, 'frz', 'Signal.js'));
    if (broken) writeFileSync(join(d, 'repo', '.git', 'config'), '[broken\n');
    return { d, args: ['--node', fakeNode(), '--fn', 'm0', '--out', join(d, 'out'), '--before', join(d, 'frz', 'Signal.js'), '--after', join(d, 'repo', 'after', 'Signal.js')] };
}
const IBD = join(ROOT, 'inlining-budget-diff.sh');
// Q-IBD-7: every lib/modes.sh refusal of ibd now comes after the hoisted checks, 2 node spawns (-p, one --v8-options)
const IBD_PRE = 2;
// null iff the script refuses the A1b row the specified way (exit 2, "git-tracked" die, IBD_PRE node spawns)
function a1bVerdict(script) {
    const f = a1bFixture(); const r = runScript(script, f.d, f.args);
    if (r.rc !== 2 || r.spawns !== IBD_PRE || !/--before is a git-tracked working-tree file \(/.test(r.out)) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}
function a2Verdict(script) {
    const f = a2Fixture(true); const r = runScript(script, f.d, f.args);
    if (r.rc !== 2 || r.spawns !== IBD_PRE || !/--before: git failed while checking whether /.test(r.out)) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}

// ---------------------------------------------------------------- I: inlining-budget-diff via the shared lib
test('I1 ibd A1b (relative link inside a symlinked dir -> a tracked file): exit 2 "git-tracked", IBD_PRE node spawns', { skip }, () => {
    assert.equal(a1bVerdict(IBD), null);
});
test('I2 ibd A2 (`[broken` .git/config around --after, hard-linked --before): exit 2 "git failed while checking whether", IBD_PRE node spawns', { skip }, () => {
    assert.equal(a2Verdict(IBD), null);
});
test('I3 ibd A2 control: healthy repo around --after -> the hard link is refused ("is the same file as the live"), IBD_PRE spawns', { skip }, () => {
    const f = a2Fixture(false); const r = runScript(IBD, f.d, f.args);
    assert.equal(r.rc, 2, r.out); assert.equal(r.spawns, IBD_PRE); assert.match(r.out, /is the same file as the live/);
});
test('I4 twin: the 5e570f0 (git history) ibd does NOT refuse the A1b row (gets past refuse_live: node spawned, no refusal text)', { skip: HSKIP() }, () => {
    const f = a1bFixture(); const r = runScript(hist().ibd, f.d, f.args);
    assert.doesNotMatch(r.out, REFUSALS, r.out.slice(-400));
    assert.ok(r.spawns >= 1, `5e570f0 ibd never reached node: exit ${r.rc}: ${r.out.slice(-300)}`);
    assert.notEqual(a1bVerdict(hist().ibd), null);
});
test('I5 twin: the 5e570f0 (git history) ibd does NOT refuse the A2 row', { skip: HSKIP() }, () => {
    const f = a2Fixture(true); const r = runScript(hist().ibd, f.d, f.args);
    assert.doesNotMatch(r.out, REFUSALS, r.out.slice(-400));
    assert.ok(r.spawns >= 1, `5e570f0 ibd never reached node: exit ${r.rc}: ${r.out.slice(-300)}`);
    assert.notEqual(a2Verdict(hist().ibd), null);
});
// argon A1a: tracked repo/m/trace.txt; ext/L -> repo/m/sub; --before ext/L/../trace.txt (decoy ext/trace.txt)
function a1aFixture() {
    const d = mk('a1a');
    for (const p of ['repo/m/sub', 'ext', 'after']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'repo', 'm', 'trace.txt'), `${E9}\n`);
    writeFileSync(join(d, 'after', 'trace.txt'), `${E9}\n`);
    git(join(d, 'repo'), ['init', '-q']);
    git(join(d, 'repo'), ['add', 'm/trace.txt']);
    symlinkSync(join(d, 'repo', 'm', 'sub'), join(d, 'ext', 'L'));
    return { d, args: ['--node', fakeNode(), '--fn', 'm0', '--out', join(d, 'out'), '--before',
        `${d}/ext/L/../trace.txt`,
        '--after', join(d, 'after', 'trace.txt')] };
}
// null iff the script refuses the A1a row (exit 2, "git-tracked" die, IBD_PRE node spawns)
function a1aVerdict(script) {
    const f = a1aFixture(); const r = runScript(script, f.d, f.args);
    if (r.rc !== 2 || r.spawns !== IBD_PRE || !/--before is a git-tracked working-tree file \(/.test(r.out)) {
        return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    }
    return null;
}
// the script gets past refuse_live: no refusal text, node spawned
function passes(r, floor = 1) {
    assert.doesNotMatch(r.out, REFUSALS, r.out.slice(-400));
    assert.ok(r.spawns >= floor, `never reached node (spawns ${r.spawns}, floor ${floor}): exit ${r.rc}: ${r.out.slice(-300)}`);
}
// an ibd row: the IBD_PRE reads (Q-IBD-7) do not count as reaching node, so the run must spawn past them
const passesIbd = (r) => passes(r, IBD_PRE + 1);
test('I6 ibd A1a (N1): --before ext/L/../trace.txt (L -> repo/m/sub) is refused: exit 2, "git-tracked", IBD_PRE ' +
    'node spawns', { skip }, () => {
    // ASSERTION 3: ibd includes lib/tracked.sh, whose is_tracked resolves the directory physically (cd -P), so it
    // inspects repo/m (tracked), not the decoy ext/. On the bd0192f ibd (I6t) this row is not refused.
    assert.equal(a1aVerdict(IBD), null);
});
test('I6t twin: the bd0192f (git history) ibd does NOT refuse the A1a row (node spawned, no refusal text)',
    { skip: HSKIP3() }, () => {
    const f = a1aFixture(); const r = runScript(hist3().ibd, f.d, f.args);
    passesIbd(r);
    assert.notEqual(a1aVerdict(hist3().ibd), null);
});
test('I6f fallback: ibd built WITHOUT its tracked.sh include still refuses A1a; the same copy with the ' +
    'bd0192f common.sh does not', { skip: skip || HSKIP3() }, () => {
    const noInc = ['src', 'inlining-budget-diff.sh', '# @include lib/tracked.sh\n', ''];
    const fb = privBuild('fb', [noInc]);
    assert.equal(a1aVerdict(join(fb, 'inlining-budget-diff.sh')), null,
        'fallback is_tracked (common.sh) must refuse A1a');
    const old = privBuild('fb-old', [noInc, ['lib', 'common.sh', null, readFileSync(hist3().common, 'utf8')]]);
    assert.notEqual(a1aVerdict(join(old, 'inlining-budget-diff.sh')), null,
        'the bd0192f common.sh must not refuse A1a');
    const f = a1aFixture(); passesIbd(runScript(join(old, 'inlining-budget-diff.sh'), f.d, f.args));
});

// ---------------------------------------------------------------- I7 / I8: B2b and B2c on ibd (ASSERTIONS 1, 2)
// ibd creates OUT before refusing (modes.sh runs after its mkdir -p), so no row asserts "OUT absent" here.
function b2bFixture(linked) {  // repo tracks Signal.js + sub/Signal.js; frz/Signal.js hard link of repo/Signal.js;
    // work/Signal.js -> ../repo/sub/Signal.js; cwd (d) outside the repo. linked=false: frz/Signal.js is an independent
    // copy
    const d = mk(linked ? 'b2b' : 'b2b-ctl');
    for (const p of ['repo/sub', 'frz', 'work']) mkdirSync(join(d, p), { recursive: true });
    for (const p of ['repo/Signal.js', 'repo/sub/Signal.js']) writeFileSync(join(d, p), `${E9}\n`);
    git(join(d, 'repo'), ['init', '-q']);
    git(join(d, 'repo'), ['add', 'Signal.js', 'sub/Signal.js']);
    if (linked) linkSync(join(d, 'repo', 'Signal.js'), join(d, 'frz', 'Signal.js'));
    else writeFileSync(join(d, 'frz', 'Signal.js'), `${E9}\n`);
    symlinkSync('../repo/sub/Signal.js', join(d, 'work', 'Signal.js'));
    return { d, live: join(d, 'repo', 'Signal.js'), args: ['--node', fakeNode(), '--fn', 'm0', '--out', join(d,
        'out'),
        '--before', join(d, 'frz', 'Signal.js'), '--after', join(d, 'work', 'Signal.js')] };
}
// repo tracks <src> + sub/Store.js; frz/before.js hard link of repo/<src>; --after repo/sub/Store.js
function b2cFixture(src) {
    const d = mk(`b2c-${src.replace('/', '_')}`);
    for (const p of ['repo/sub', 'repo/src', 'frz']) mkdirSync(join(d, p), { recursive: true });
    for (const p of [src, 'sub/Store.js']) writeFileSync(join(d, 'repo', p), `${E9}\n`);
    git(join(d, 'repo'), ['init', '-q']);
    git(join(d, 'repo'), ['add', src, 'sub/Store.js']);
    linkSync(join(d, 'repo', src), join(d, 'frz', 'before.js'));
    return { d, live: join(d, 'repo', 'Store.js'), args: ['--node', fakeNode(), '--fn', 'm0', '--out', join(d,
        'out'),
        '--before', join(d, 'frz', 'before.js'), '--after', join(d, 'repo', 'sub', 'Store.js')] };
}
function refusesSame(script, f) {   // null iff exit 2, IBD_PRE spawns, "--before is the same file as the live <f.live> ("
    const r = runScript(script, f.d, f.args);
    const rx = new RegExp(`--before is the same file as the live ${f.live.replace(/[.*+?^${}()|[\]\\]/g,
        '\\$&')} \\(`);
    if (r.rc !== 2 || r.spawns !== IBD_PRE
        || !rx.test(r.out)) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}
const B2B_LINE = '  if [[ -L "$AFTER_FILE" && -e "$AFTER_FILE" ]]; then\n'
    + '    r=$(resolve_links "$AFTER_FILE" 2>/dev/null) || die "--after: cannot resolve its symlink chain: $AFTER_FILE"\n'
    + '    if top_of "$(dirname -- "$r")" "$f"; then t="$t$TOP_OF"$\'\\n\'; fi\n  fi\n';
const B2C_TOKEN = ' \\\n      ${AFTER_FILE:+"$top/$(basename -- "$AFTER_FILE")"}; do';
test('I7 ibd B2b (--after work/F -> repo/sub/F, --before hard link of tracked repo/F, cwd outside): exit 2 ' +
    '"same file as the live repo/F", IBD_PRE spawns', { skip }, () => {
    assert.equal(refusesSame(IBD, b2bFixture(true)), null);
});
test('I7t twin: the bd0192f ibd does NOT refuse the B2b row', { skip: HSKIP3() }, () => {
    const f = b2bFixture(true); passesIbd(runScript(hist3().ibd, f.d, f.args));
    assert.notEqual(refusesSame(hist3().ibd, f), null);
});
test('I7c control: the same shape with an independent copy as --before (clean frozen copy) is not refused',
    { skip }, () => {
    const f = b2bFixture(false); passesIbd(runScript(IBD, f.d, f.args));
});
test('I7m MUTANT B2b line deleted: the B2b row is not refused (exit 0 path: node spawned), the unmutated ' +
    'build refuses it', { skip: skip || (NESTED ? 'nested retention run: mutant skipped (time)' : false) }, () => {
    const out = privBuild('b2b-del', [['lib', 'common.sh', B2B_LINE, '']]);
    const f = b2bFixture(true); passesIbd(runScript(join(out, 'inlining-budget-diff.sh'), f.d, f.args));
    // a fresh fixture: the mutant run left raw/ non-empty under f's --out, which F4 refuses before the row under test
    assert.equal(refusesSame(IBD, b2bFixture(true)), null);
});
test('I8 ibd B2c (--after repo/sub/Store.js, --before frz/before.js hard link of tracked repo/Store.js): exit ' +
    '2 "same file as the live repo/Store.js", IBD_PRE spawns', { skip }, () => {
    assert.equal(refusesSame(IBD, b2cFixture('Store.js')), null);
});
test('I8t twin: the bd0192f ibd does NOT refuse the B2c row', { skip: HSKIP3() }, () => {
    const f = b2cFixture('Store.js'); passesIbd(runScript(hist3().ibd, f.d, f.args));
    assert.notEqual(refusesSame(hist3().ibd, f), null);
});
test('I8r residual (accepted by design): a hard link to repo/src/Store.js is NOT refused, on the new and the ' +
    'bd0192f ibd', { skip: HSKIP3() }, () => {
    for (const root of [IBD, hist3().ibd]) { const f = b2cFixture('src/Store.js'); passesIbd(runScript(root, f.d,
        f.args)); }
});
test('I8m MUTANT B2c token dropped: the B2c row is not refused (node spawned), the unmutated build refuses it',
    { skip: skip || (NESTED ? 'nested retention run: mutant skipped (time)' : false) }, () => {
    const out = privBuild('b2c-drop', [['lib', 'common.sh', B2C_TOKEN, '; do']]);
    const f = b2cFixture('Store.js'); passesIbd(runScript(join(out, 'inlining-budget-diff.sh'), f.d, f.args));
    assert.equal(refusesSame(IBD, b2cFixture('Store.js')), null);   // a fresh fixture, as I7m (F4)
});

// I7e (b52 reviewer gap): a DANGLING --after symlink. Expected from the modes.sh contract, not from a run: the run ends at
// the "--after not found" die (exit 2, IBD_PRE node spawns), since U2 (L2) before refuse_live. The B2b guard (`-L && -e`)
// must still not trip over it, so the mutant deletes L2 too: without `-e` it resolves the dead chain in live_tops and dies
// elsewhere (a git failure): same exit 2, other text.
function danglingFixture() {
    const d = mk('b2b-dangling');
    mkdirSync(join(d, 'frz')); mkdirSync(join(d, 'work'));
    writeFileSync(join(d, 'frz', 'Signal.js'), `${E9}\n`);
    symlinkSync('../nodir/Signal.js', join(d, 'work', 'Signal.js'));
    return { d, args: ['--node', fakeNode(), '--fn', 'm0', '--out', join(d, 'out'),
        '--before', join(d, 'frz', 'Signal.js'), '--after', join(d, 'work', 'Signal.js')] };
}
function danglingVerdict(script) {   // null iff exit 2, IBD_PRE spawns, "--after not found: <path>", no symlink-chain die
    const f = danglingFixture(), r = runScript(script, f.d, f.args);
    if (r.rc !== 2 || r.spawns !== IBD_PRE || !/--after not found: /.test(r.out) || /symlink chain|git failed/.test(r.out)) {
        return `exit ${r.rc}, spawns ${r.spawns}: ${r.out}`;
    }
    return null;
}
test('I7e ibd dangling --after symlink: exit 2 "--after not found", IBD_PRE spawns (B2b guard has -e)', { skip }, () => {
    assert.equal(danglingVerdict(IBD), null);
});
test('I7em MUTANT B2b guard without -e: the dangling --after dies elsewhere, the row is red; the live build is green',
    { skip: skip || (NESTED ? 'nested retention run: mutant skipped (time)' : false) }, () => {
    const out = privBuild('b2b-no-e', [['lib', 'common.sh', 'if [[ -L "$AFTER_FILE" && -e "$AFTER_FILE" ]]; then',
        'if [[ -L "$AFTER_FILE" ]]; then'], ['lib', 'modes.sh', '  [[ -f "$AFTER_FILE" ]] || die "--after not found: $AFTER_FILE"\n', '']]);
    const v = danglingVerdict(join(out, 'inlining-budget-diff.sh'));
    assert.notEqual(v, null, 'mutant survived: -e not needed');
    assert.match(v, /git failed while checking/, 'the mutant must die at the tracked check, not elsewhere');
    assert.equal(danglingVerdict(IBD), null);
});

// ---------------------------------------------------------------- M: N1 mutant (ASSERTION 3, last)
test('M common.sh is_tracked back to a logical `cd` (N1 line 1 mutated), in the ibd fallback build: A1a is ' +
    'not refused; the unmutated fallback refuses', { skip: skip
        || (NESTED ? 'nested retention run: mutant skipped (time)' : false) }, () => {
    const noInc = ['src', 'inlining-budget-diff.sh', '# @include lib/tracked.sh\n', ''];
    const ISP = 'd=$(CDPATH= cd -P -- "$d" 2>/dev/null && pwd -P) || return 1';
    const ISP_NOP = 'd=$(cd -- "$d" 2>/dev/null && pwd) || return 1';
    const ok = privBuild('m-ok', [noInc]);
    assert.equal(a1aVerdict(join(ok, 'inlining-budget-diff.sh')), null, 'unmutated fallback must refuse A1a');
    const mut = privBuild('m-mut', [noInc, ['lib', 'common.sh', ISP, ISP_NOP]]);
    assert.notEqual(a1aVerdict(join(mut, 'inlining-budget-diff.sh')), null, 'mutant survived: A1a still refused');
});

// ---------------------------------------------------------------- S: ASSERTION 5 (dd spawn count + retention)
const DD = join(ROOT, 'deopt-diff.sh');
function ddFixture(brokenAfter) {
    const d = mk(brokenAfter ? 'dd-r5' : 'dd-out');
    for (const p of ['frz', 'after', 'drv']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'frz', 'trace.txt'), `${E9}\n`);
    writeFileSync(join(d, 'drv', 'driver.js'), "import './trace.txt';\n");
    let aft = join(d, 'after', 'trace.txt');
    if (brokenAfter) {
        mkdirSync(join(d, 'repo', 'after'), { recursive: true });
        git(join(d, 'repo'), ['init', '-q']);
        writeFileSync(join(d, 'repo', '.git', 'config'), '[broken\n');
        aft = join(d, 'repo', 'after', 'trace.txt');
    }
    writeFileSync(aft, `${E9}\n`);
    return { d, aft, args: (out) => ['--node', fakeNode(), '--runs', '2', '--fn', 'add', '--out', out, '--before', join(d, 'frz', 'trace.txt'),
        '--after', aft, '--driver', join(d, 'drv', 'driver.js')] };
}
// refuse_live's git spawns for the S1 fixture (a PATH shim logs one line per git call); asserts the run exits 0
// SAME. inside=true runs with cwd inside a (fresh, empty) work tree: the first top_of then spawns 2 git (rev-parse x2)
// instead of 1.
function ddGitSpawns(script, inside = false) {
    const f = ddFixture(false);
    const shim = mk('shim');
    const real = capSync(BASH, ['-c', 'command -v git'], { encoding: 'utf8', env: ENV }, 10000, 'command -v git').stdout.trim();
    const glog = join(shim, 'git.log');
    writeFileSync(join(shim, 'git'), `#!${BASH}\nprintf '%s\\n' "$*" >>"$SHIM_LOG"\nexec '${real}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    let cwd = f.d;
    if (inside) { cwd = mk('s1-cwdrepo'); git(cwd, ['init', '-q']); }
    const r = runScript(script, cwd, f.args(join(f.d, 'out')), { PATH: `${shim}:${ENV.PATH}`, SHIM_LOG: glog });
    assert.equal(r.rc, 0, r.out.slice(-500));
    assert.match(r.out, /^VERDICT SAME$/m);
    return readFileSync(glog, 'utf8').split('\n').filter(Boolean);
}
// Independent expected values (counted by hand from refuse_live / live_tops, see the header): cwd outside a repo 6;
// cwd inside a work tree +1 (its top_of spawns 2, not 1) = 7; the -L-less mutant adds one top_of (+1 outside, +1 inside).
function hist3dd() {
    const r = capSync('git', ['show', `${SHL3_SHA}:deopt-diff.sh`], { cwd: ROOT, encoding: 'utf8', env: ENV,
        maxBuffer: 1 << 26 }, 30000, 'git show dd');
    assert.equal(r.status, 0, r.stderr);
    const p = join(mk('hist3-dd'), 'deopt-diff.sh'); writeFileSync(p, r.stdout); chmodSync(p, 0o755);
    return p;
}
test('S1 ASSERTION 5: refuse_live git spawns == 6 (dd; cwd, --before, --after all outside any repo), ' +
    'run exits 0 SAME', { skip }, () => {
    const lines = ddGitSpawns(DD);
    assert.equal(lines.length, 6, lines.join('\n'));
});
test('S1i ASSERTION 5: refuse_live git spawns == 7 (dd; cwd inside a work tree, files outside any repo)',
    { skip }, () => {
    const lines = ddGitSpawns(DD, true);
    assert.equal(lines.length, 7, lines.join('\n'));
});
test('S1t twin: the bd0192f dd has the same spawns, 6 outside / 7 inside (the B2b block costs 0 for a --after ' +
    'that is no symlink)', { skip: HSKIP3() }, () => {
    const p = hist3dd();
    assert.equal(ddGitSpawns(p).length, 6);
    assert.equal(ddGitSpawns(p, true).length, 7);
});
test('S1m MUTANT B2b guard without -L: one more top_of = 7 git spawns outside a repo, 8 inside',
    { skip: skip || (NESTED ? 'nested retention run: mutant skipped (time)' : false) }, () => {
    const NOL = '  if [[ -L "$AFTER_FILE" && -e "$AFTER_FILE" ]]; then\n';
    assert.equal(B2B_LINE.split(NOL).length - 1, 1);
    const out = privBuild('b2b-noL', [['lib', 'common.sh', B2B_LINE, B2B_LINE.replace(NOL,
        '  if [[ -e "$AFTER_FILE" ]]; then\n')]]);
    assert.equal(ddGitSpawns(join(out, 'deopt-diff.sh')).length, 7);
    assert.equal(ddGitSpawns(join(out, 'deopt-diff.sh'), true).length, 8);
});
test('S2 ASSERTION 5: 20 back-to-back R5 runs (dd, `[broken` config around --after) exit 2, leave private TMPDIR with 0 entries, create 0 OUT dirs', { skip: skip || (NESTED ? 'nested retention run: loop skipped (time)' : false) }, () => {
    const f = ddFixture(true);
    const tmpd = mk('r5-tmp');
    const outs = mk('r5-outs');
    for (let i = 0; i < 20; i++) {
        const out = join(outs, `out-${i}`);
        const r = runScript(DD, f.d, f.args(out), { TMPDIR: tmpd });
        assert.equal(r.rc, 2, `run ${i}: ${r.out.slice(-400)}`);
        assert.match(r.out, /--before: git failed while checking whether /, `run ${i}`);
        assert.equal(r.spawns, 0, `run ${i}: node spawns`);
        assert.equal(existsSync(out), false, `run ${i}: OUT created`);
    }
    assert.deepEqual(readdirSync(tmpd), [], 'TMPDIR entries left');
    assert.deepEqual(readdirSync(outs), [], 'OUT dirs created');
});

test('S3 ASSERTION 5: 20 back-to-back R9 runs (dd, OUT 0555 with raw/ + report.txt "KEEP") exit 2, 0 TMPDIR ' +
    'entries, OUT untouched', { skip: skip || (process.getuid
        && process.getuid() === 0 ? 'uid 0: a 0555 dir binds nothing' : false) || (NESTED ? 'nested retention ' +
            'run: loop skipped (time)' : false) }, () => {
    const f = ddFixture(false);
    const tmpd = mk('r9-tmp');
    const outs = mk('r9-outs');
    const made = [];
    try {
        for (let i = 0; i < 20; i++) {
            const out = join(outs, `out-${i}`);
            mkdirSync(join(out, 'raw'), { recursive: true }); writeFileSync(join(out, 'report.txt'), 'KEEP\n');
            chmodSync(out, 0o555); made.push(out);
            const r = runScript(DD, f.d, f.args(out), { TMPDIR: tmpd });
            assert.equal(r.rc, 2, `run ${i}: ${r.out.slice(-400)}`);
            assert.match(r.out, /--out: cannot create .*\/stage \(.* is not writable\)/, `run ${i}`);
            assert.equal(r.spawns, 0, `run ${i}: node spawns`);
            assert.deepEqual(readdirSync(out).sort(), ['raw', 'report.txt'], `run ${i}: OUT entries changed`);
            assert.equal(readFileSync(join(out, 'report.txt'), 'utf8'), 'KEEP\n', `run ${i}: report.txt changed`);
        }
        assert.deepEqual(readdirSync(tmpd), [], 'TMPDIR entries left');
    } finally { for (const o of made) chmodSync(o, 0o755); }
});

// ---------------------------------------------------------------- L / K / C / D: G-SHL3 r2 (ADDENDA A2, A3)
// Oracle: the PLAN addenda. Twins are in-file MUTANT builds that put the r1 / r2-before text back (one exact
// replacement each; privBuild checks every anchor matches once), so they run anywhere, never from .handoff/.
const mskip = skip || (NESTED ? 'nested retention run: mutant skipped (time)' : false);
const R1_B2B = '  if [[ -L "$AFTER_FILE" && -e "$AFTER_FILE" ]] && top_of "$(dirname -- "$(resolve_links "$AFTER_FILE")")" "$f"\n'
    + '  then t="$t$TOP_OF"$\'\\n\'; fi\n';
const RL_PFX = 'd=$(dirname -- "$p"); [[ $d != -* ]] || d="./$d"';
const ITT_PFX = '  command -v git >/dev/null 2>&1 || return 1\n  d=$(dirname -- "$1"); [[ $d != -* ]] || d="./$d"\n';
const ITC_PFX = '  local d b\n  d=$(dirname -- "$1"); [[ $d != -* ]] || d="./$d"\n';
const RLK = 'l=$(readlink -- "$p") || die "cannot read the symlink $p (in the chain of $1)"';
const RLK_NODIE = 'l=$(readlink -- "$p")';
// NOF16 = the F16 lines deleted: F16 rewrites a `-`-led path up front, so the `-`-led twins and the `--` sites below are only
// reachable from the CLI on this build
const NOF16 = ['src', 'inlining-budget-diff.sh', '# a value that starts with - must never reach a tool as an option; the ./ form names the same file (--out and the path options, then POS)\n'
    + 'for x in BEFORE_FILE AFTER_FILE DRIVER REPO OUT; do [[ ${!x} != -* ]] || printf -v "$x" \'./%s\' "${!x}"; done\n'
    + 'for ((i = 0; i < ${#POS[@]}; i++)); do [[ ${POS[$i]} != -* ]] || POS[$i]="./${POS[$i]}"; done\n', ''];
const UNSET_CDPATH = 'unset CDPATH   # before the prologue: SELF, every cd and every "cd X && pwd" join resolve X itself, never a CDPATH entry\n';
const NOINC = ['src', 'inlining-budget-diff.sh', '# @include lib/tracked.sh\n', ''];
const BUILT = {};
function pb(name, edits) { if (!(name in BUILT)) BUILT[name] = privBuild(name, edits); return BUILT[name]; }
const mNOF = () => pb('nof16', [NOF16]);
const mR1 = () => pb('r1', [NOF16, ['lib', 'common.sh', B2B_LINE, R1_B2B], ['lib', 'common.sh', RL_PFX, 'd=$(dirname -- "$p")'],
    ['lib', 'common.sh', RLK, 'l=$(readlink "$p")']]);
const mRL = () => pb('rl', [NOF16, ['lib', 'common.sh', RL_PFX, 'd=$(dirname -- "$p")']]);
const mRLK = () => pb('rlk', [NOF16, ['lib', 'common.sh', RLK, 'l=$(readlink "$p")']]);
const mRLD = () => pb('rld', [['lib', 'common.sh', RLK, RLK_NODIE]]);
const mITT = () => pb('itt', [NOF16, ['lib', 'tracked.sh', ITT_PFX, '  command -v git >/dev/null 2>&1 || return 1\n  d=$(dirname -- "$1")\n']]);
const mFB = () => pb('fbl', [NOF16, NOINC]);
const mFBC = () => pb('fbc', [NOF16, NOINC, ['lib', 'common.sh', ITC_PFX, '  local d b\n  d=$(dirname -- "$1")\n']]);
const mCD = () => pb('cd', [['src', 'inlining-budget-diff.sh', UNSET_CDPATH, '']]);
const nverd = (r) => (r.out.match(/^VERDICT /gm) || []).length;
const ibdArgs = (d, before, after) => ['--node', fakeNode(), '--fn', 'm0', '--out', join(d, 'out'), '--before', before, '--after', after];
let DECOY = null;   // OLDPWD target: an untracked dir holding a Signal.js (what `cd -` would wrongly pick)
function decoy() { if (DECOY === null) { DECOY = mk('decoy'); writeFileSync(join(DECOY, 'Signal.js'), `${E9}\n`); } return DECOY; }
const TOOLS = { bb: ['bytecode-budget.sh', 'Signal.js'], dd: ['deopt-diff.sh', 'trace.txt'], ibd: ['inlining-budget-diff.sh', 'Signal.js'] };
function toolArgs(t, d, before, after) {
    const a = ['--node', fakeNode(), '--fn', t === 'dd' ? 'add' : 'm0', '--out', join(d, 'out'), '--before', before, '--after', after];
    if (t !== 'ibd') a.push('--driver', join(d, 'drv', 'driver.js'));
    if (t === 'dd') a.push('--runs', '2');
    if (t === 'bb') a.push('--diff');
    return a;
}
// cwd d (no repo); clean frozen --before; --after -/F -> ../t/F (kind rel) or -> the absolute t/F (kind abs)
function dashAfter(t, kind) {
    const nm = TOOLS[t][1], d = mk(`dash-${t}-${kind}`);
    for (const p of ['frz', 't', '-', 'drv']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'frz', nm), `${E9}\n`); writeFileSync(join(d, 't', nm), `${E9}\n`);
    writeFileSync(join(d, 'drv', 'driver.js'), `import './${nm}';\n`);
    symlinkSync(kind === 'rel' ? `../t/${nm}` : join(d, 't', nm), join(d, '-', nm));
    return { d, args: toolArgs(t, d, join(d, 'frz', nm), `-/${nm}`) };
}
const SYMCHAIN = /--after: cannot resolve its symlink chain/;

test('L1 A2/A3 + U2 F16 ibd: a `-/`-led symlinked --after (relative and absolute target) is read as ./-/F: gets past ' +
    'refuse_live (node spawned past the IBD_PRE reads), exactly ONE VERDICT, no refusal text', { skip }, () => {
    for (const kind of ['rel', 'abs']) {
        const f = dashAfter('ibd', kind); const r = runScript(IBD, f.d, f.args, { OLDPWD: decoy() });
        passesIbd(r);
        assert.equal(nverd(r), 1, `${kind}: ${r.out.slice(-400)}`);
        assert.doesNotMatch(r.out, /symlink chain|cannot resolve the directory of|git failed while checking/, kind);
    }
});
test('L1t twin: the r1 build on NOF16 (B2b line in $( ), no `./` prefix and no readlink `--` in resolve_links) is red on the same ' +
    'rows: bash 3.2 prints a stray die and then TWO VERDICT lines, bash >= 4.4 (OLDPWD kept) a git "cannot change to" decoy ' +
    'die (or the same two lines)', { skip: mskip }, () => {
    const root = join(mR1(), TOOLS.ibd[0]);
    for (const kind of ['rel', 'abs']) {
        const f = dashAfter('ibd', kind); const r = runScript(root, f.d, f.args, { OLDPWD: decoy() });
        assert.ok(nverd(r) === 2 || /cannot change to '[^'\n]*\/decoy-/.test(r.out), `${kind}: ${r.out.slice(-500)}`);
        if (nverd(r) === 2 && kind === 'rel') assert.match(r.out, /cannot resolve the directory of -\/Signal\.js/, kind);
    }
});
test('L1d bb / dd: the `-/`-led symlinked --after is NOT refused (lib/stage.sh prefixes `./`): dd exit 0 SAME, bb ' +
    'reaches node, neither prints a refusal', { skip }, () => {
    for (const kind of ['rel', 'abs']) {
        const f = dashAfter('dd', kind); const r = runScript(join(ROOT, TOOLS.dd[0]), f.d, f.args, { OLDPWD: decoy() });
        assert.equal(r.rc, 0, `dd ${kind}: ${r.out.slice(-400)}`); assert.match(r.out, /^VERDICT SAME$/m);
        passes(r);
        const g = dashAfter('bb', kind); const q = runScript(join(ROOT, TOOLS.bb[0]), g.d, g.args, { OLDPWD: decoy() });
        passes(q);
        assert.doesNotMatch(q.out, SYMCHAIN);
    }
});

// K: the new die. -e passed means the kernel followed the chain, so it is unreachable on a real fs; a PATH-shimmed
// readlink that always answers "a" (lnk/a's own name) loops resolve_links past 40 hops.
function chainFixture(t, shimBody = 'echo a') {
    const nm = TOOLS[t][1], d = mk(`chain-${t}`);
    for (const p of ['frz', 't', 'lnk', 'drv', 'shim']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'frz', nm), `${E9}\n`); writeFileSync(join(d, 't', nm), `${E9}\n`);
    writeFileSync(join(d, 'drv', 'driver.js'), `import './${nm}';\n`);
    symlinkSync(`../t/${nm}`, join(d, 'lnk', 'a'));
    const real = capSync(BASH, ['-c', 'command -v readlink'], { encoding: 'utf8', env: ENV }, 10000, 'command -v readlink').stdout.trim();
    writeFileSync(join(d, 'shim', 'readlink'), `#!${BASH}\ncase "\${@: -1}" in */lnk/a|lnk/a) ${shimBody} ;; *) exec '${real}' "$@" ;; esac\n`);
    chmodSync(join(d, 'shim', 'readlink'), 0o755);
    return { d, args: toolArgs(t, d, join(d, 'frz', nm), 'lnk/a'), env: { PATH: `${join(d, 'shim')}:${ENV.PATH}` } };
}
test('K1 A2 new die: a symlinked --after whose chain resolve_links cannot finish (shimmed readlink loops it) -> ' +
    'exit 2, IBD_PRE node spawns on ibd (0 on bb / dd), "--after: cannot resolve its symlink chain: lnk/a", exactly one VERDICT, on all three roots',
    { skip }, () => {
    for (const t of Object.keys(TOOLS)) {
        const f = chainFixture(t); const r = runScript(join(ROOT, TOOLS[t][0]), f.d, f.args, f.env);
        assert.equal(r.rc, 2, `${t}: ${r.out.slice(-400)}`);
        assert.equal(r.spawns, t === 'ibd' ? IBD_PRE : 0, t);
        assert.match(r.out, /--after: cannot resolve its symlink chain: lnk\/a/, t);
        assert.equal(nverd(r), 1, `${t}: ${r.out.slice(-400)}`);
    }
});
test('K1t twin: the r1 build (resolve_links in $( )) prints the "symlink chain too long" die from its subshell and the run ' +
    'CONTINUES (a second VERDICT or a node spawn), never the new die', { skip: mskip }, () => {
    for (const t of Object.keys(TOOLS)) {
        const f = chainFixture(t); const r = runScript(join(mR1(), TOOLS[t][0]), f.d, f.args, f.env);
        assert.match(r.out, /symlink chain too long \(or a loop\) at lnk\/a/, t);
        assert.doesNotMatch(r.out, SYMCHAIN, t);
        assert.ok(r.spawns > (t === 'ibd' ? IBD_PRE : 0) || nverd(r) > 1, `${t}: the run must go on: spawns ${r.spawns}, ${r.out.slice(-400)}`);
    }
});

// K2 (U2): a readlink that EXITS 1 on a symlinked --after. resolve_links' `|| die` fails the $( ) the B2b guard reads; the
// twin without it has l="" and runs on with the link's directory.
test('K2 U2: a symlinked --after whose readlink exits 1 -> exit 2, IBD_PRE node spawns on ibd (0 on bb / dd), ' +
    '"--after: cannot resolve its symlink chain: lnk/a", exactly one VERDICT, on all three roots', { skip }, () => {
    for (const t of Object.keys(TOOLS)) {
        const f = chainFixture(t, 'exit 1'); const r = runScript(join(ROOT, TOOLS[t][0]), f.d, f.args, f.env);
        assert.equal(r.rc, 2, `${t}: ${r.out.slice(-400)}`);
        assert.equal(r.spawns, t === 'ibd' ? IBD_PRE : 0, t);
        assert.match(r.out, /--after: cannot resolve its symlink chain: lnk\/a/, t);
        assert.equal(nverd(r), 1, `${t}: ${r.out.slice(-400)}`);
    }
});
test('K2t twin: the readlink `|| die` removed: the same row CONTINUES on ibd (no chain die, node spawned past the pre reads; ' +
    'bb / dd share the lib text, but their fixture stops at the staged module name check)', { skip: mskip }, () => {
    const f = chainFixture('ibd', 'exit 1'); const r = runScript(join(mRLD(), TOOLS.ibd[0]), f.d, f.args, f.env);
    assert.doesNotMatch(r.out, SYMCHAIN);
    assert.ok(r.spawns > IBD_PRE, `the run must go on: spawns ${r.spawns}, ${r.out.slice(-400)}`);
});

// C: ibd unsets CDPATH (A2 blocker 1): a CDPATH entry must not turn a relative --before's `cd` join into two lines.
function cdFixture() {
    const d = mk('cdp');
    for (const p of ['frz', 'after', 'cdbase/frz']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'frz', 'Signal.js'), `${E9}\n`); writeFileSync(join(d, 'after', 'Signal.js'), `${E9}\n`);
    return { d, args: ibdArgs(d, 'frz/Signal.js', 'after/Signal.js'), cdbase: join(d, 'cdbase') };
}
test('C1 A2 ibd: CDPATH=. and CDPATH=<dir holding frz/> with a clean frozen relative --before, cwd outside a repo: ' +
    'refuse_live passes (node spawned, no "git failed while checking")', { skip }, () => {
    for (const mode of ['dot', 'base']) {
        const f = cdFixture(); const r = runScript(IBD, f.d, f.args, { CDPATH: mode === 'dot' ? '.' : f.cdbase });
        passesIbd(r); assert.doesNotMatch(r.out, /git failed while checking/, mode);
    }
});
test('C1t twin: ibd without its `unset CDPATH` line (the r1 root) exits 2, IBD_PRE spawns, "git failed while checking ' +
    'whether frz/Signal.js is tracked"', { skip: mskip }, () => {
    for (const mode of ['dot', 'base']) {
        const f = cdFixture(); const r = runScript(join(mCD(), TOOLS.ibd[0]), f.d, f.args, { CDPATH: mode === 'dot' ? '.' : f.cdbase });
        assert.equal(r.rc, 2, `${mode}: ${r.out.slice(-400)}`); assert.equal(r.spawns, IBD_PRE, mode);
        assert.match(r.out, /git failed while checking whether frz\/Signal\.js is tracked/, mode);
    }
});

// D: A3. The three `cd -P --` joins on refuse_live's path give a `-`-led dirname a "./" (bash reads `cd -- -` as OLDPWD).
function fxBeforeLink() {   // cwd d (no repo); repo tracks Signal.js; --before -/Signal.js -> ../repo/Signal.js
    const d = mk('bl');
    for (const p of ['repo', '-', 'after']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'repo', 'Signal.js'), `${E9}\n`); writeFileSync(join(d, 'after', 'Signal.js'), `${E9}\n`);
    git(join(d, 'repo'), ['init', '-q']); git(join(d, 'repo'), ['add', 'Signal.js']);
    symlinkSync('../repo/Signal.js', join(d, '-', 'Signal.js'));
    return { d, args: ibdArgs(d, '-/Signal.js', 'after/Signal.js') };
}
function fxBeforeTracked() {   // cwd = the repo root, which tracks the plain file -/Signal.js; --before -/Signal.js
    const d = mk('bt'), r = join(d, 'repo');
    for (const p of ['repo/-', 'after']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(r, '-', 'Signal.js'), `${E9}\n`); writeFileSync(join(d, 'after', 'Signal.js'), `${E9}\n`);
    git(r, ['init', '-q']); git(r, ['add', '--', '-/Signal.js']);
    return { d: r, args: ibdArgs(d, '-/Signal.js', join(d, 'after', 'Signal.js')) };
}
const GITTRACKED = /--before is a git-tracked working-tree file \(/;
function trackedDie(root, fx) {   // null iff exit 2, IBD_PRE spawns, the git-tracked die (OLDPWD set to a decoy `cd -` would pick)
    const f = fx(); const r = runScript(root, f.d, f.args, { OLDPWD: decoy() });
    if (r.rc !== 2 || r.spawns !== IBD_PRE || !GITTRACKED.test(r.out)) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}
test('D1 A3 ibd before-link: --before -/Signal.js -> ../repo/Signal.js (tracked), cwd outside: "git-tracked" die, ' +
    'IBD_PRE spawns', { skip }, () => {
    assert.equal(trackedDie(IBD, fxBeforeLink), null);
});
test('D1t twin (on NOF16): resolve_links without its `./` prefix (the r2-before build) dies "cannot resolve the directory of" on ' +
    'bash 3.2 and "git failed while checking whether -/Signal.js is tracked (fatal: cannot change to" on bash >= 4.4; a readlink ' +
    'without `--` (A2) is also killed by this row; the NOF16 control still dies "git-tracked"', { skip: mskip }, () => {
    assert.equal(trackedDie(join(mNOF(), TOOLS.ibd[0]), fxBeforeLink), null, 'NOF16 control must still die git-tracked');
    const f = fxBeforeLink(); const r = runScript(join(mRL(), TOOLS.ibd[0]), f.d, f.args, { OLDPWD: decoy() });
    // Both bash behaviours: bash 3.2 drops an inherited OLDPWD (`cd -` fails: "cannot resolve the directory of"); bash >= 4.4
    // keeps it when it names a dir (`cd -` echoes it, so the join holds two lines and the next `git -C` cannot change to it).
    assert.match(r.out, /cannot resolve the directory of -\/Signal\.js|git failed while checking whether -\/Signal\.js is tracked \(fatal: cannot change to/); assert.doesNotMatch(r.out, GITTRACKED);
    assert.notEqual(trackedDie(join(mRL(), TOOLS.ibd[0]), fxBeforeLink), null);
    assert.notEqual(trackedDie(join(mRLK(), TOOLS.ibd[0]), fxBeforeLink), null, 'readlink `--` mutant survived');
});
test('D2 A3 ibd before-tracked: cwd = repo root tracking -/Signal.js, --before -/Signal.js: "git-tracked" die, IBD_PRE spawns',
    { skip }, () => {
    assert.equal(trackedDie(IBD, fxBeforeTracked), null);
});
test('D2m MUTANTS the `./` prefix deleted from lib/tracked.sh is_tracked (default build) and from lib/common.sh ' +
    'is_tracked (fallback build, src marker removed): D2 is not refused; the unmutated fallback refuses',
    { skip: mskip }, () => {
    assert.equal(trackedDie(join(mNOF(), TOOLS.ibd[0]), fxBeforeTracked), null, 'NOF16 control must still die git-tracked');
    assert.equal(trackedDie(join(mFB(), TOOLS.ibd[0]), fxBeforeTracked), null, 'unmutated fallback must refuse');
    assert.notEqual(trackedDie(join(mITT(), TOOLS.ibd[0]), fxBeforeTracked), null, 'tracked.sh mutant survived');
    assert.notEqual(trackedDie(join(mFBC(), TOOLS.ibd[0]), fxBeforeTracked), null, 'common.sh is_tracked mutant survived');
});

// ---------------------------------------------------------------- X: the U2 `--` sites (ASSERTION 2), reachable on NOF16 only
function fxCleanDash() {   // cwd d = a repo with nothing tracked; a clean frozen -b.js in it
    const d = mk('x1');
    mkdirSync(join(d, 'after'));
    writeFileSync(join(d, '-b.js'), `${E9}\n`); writeFileSync(join(d, 'after', 'Signal.js'), `${E9}\n`);
    git(d, ['init', '-q']);
    return { d, args: ibdArgs(d, '-b.js', join(d, 'after', 'Signal.js')) };
}
function fxDashHardlink() {   // cwd frz holds -b.js, a hard link of the tracked repo/-b.js; --after inside repo puts repo in live_tops
    const d = mk('x1h'), repo = join(d, 'repo'), frz = join(d, 'frz');
    mkdirSync(join(repo, 'after'), { recursive: true }); mkdirSync(frz);
    writeFileSync(join(repo, '-b.js'), `${E9}\n`); writeFileSync(join(repo, 'after', 'Signal.js'), `${E9}\n`);
    git(repo, ['init', '-q']); git(repo, ['add', '--', '-b.js']);
    linkSync(join(repo, '-b.js'), join(frz, '-b.js'));
    return { d: frz, live: join(repo, '-b.js'), args: ibdArgs(d, '-b.js', join(repo, 'after', 'Signal.js')) };
}
function fxDashDirHardlink() {   // cwd d (no repo); the repo -d tracks Signal.js; --before -d/x.js is its hard link: only dirname(--before) finds -d
    const d = mk('x1d'), repo = join(d, '-d');
    mkdirSync(repo); mkdirSync(join(d, 'after'));
    writeFileSync(join(repo, 'Signal.js'), `${E9}\n`); writeFileSync(join(d, 'after', 'Signal.js'), `${E9}\n`);
    git(repo, ['init', '-q']); git(repo, ['add', 'Signal.js']);
    linkSync(join(repo, 'Signal.js'), join(repo, 'x.js'));
    return { d, live: join(repo, 'Signal.js'), args: ibdArgs(d, '-d/x.js', join(d, 'after', 'Signal.js')) };
}
function fxDashWatch() { const d = mk('x1w'), dd = join(d, '-d'); mkdirSync(dd); mkdirSync(join(d, 'after')); writeFileSync(join(dd, 'x.js'), `${E9}\n`); writeFileSync(join(dd, 'Watch.js'), `${E9}\n`); writeFileSync(join(d, 'after', 'Signal.js'), `${E9}\n`); return { d, args: ibdArgs(d, '-d/x.js', join(d, 'after', 'Signal.js')) }; }
function cleanVerdict(root) {   // null iff the run reaches node past the IBD_PRE reads, one VERDICT, no refusal
    const f = fxCleanDash(); const r = runScript(root, f.d, f.args);
    if (REFUSALS.test(r.out) || r.spawns <= IBD_PRE || nverd(r) !== 1) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}
const DEVINO_LINE = '  if stat -L -c \'%d:%i\' -- "$1" >/dev/null 2>&1; then stat -L -c \'%d:%i\' -- "$1"; else stat -L -f \'%d:%i\' -- "$1"; fi\n';
test('X1 U2 NOF16 control, cwd in a repo, clean -b.js: reaches node, one VERDICT, no refusal', { skip: mskip }, () => {
    assert.equal(cleanVerdict(join(mNOF(), TOOLS.ibd[0])), null);
});
for (const [name, edit] of [
    ['devino', ['lib', 'common.sh', DEVINO_LINE, DEVINO_LINE.replaceAll(' -- "$1"', ' "$1"')]],
    ['cp', ['lib', 'modes.sh', 'cp -- "$f" "$dir/Signal.js"', 'cp "$f" "$dir/Signal.js"']],
]) {
    test(`X1m MUTANT ${name} without \`--\` (on NOF16): the clean -b.js row goes red`, { skip: mskip }, () => {
        assert.notEqual(cleanVerdict(join(pb(`x1-${name}`, [NOF16, edit]), TOOLS.ibd[0])), null, `${name} mutant survived`);
    });
}
test('X1w U2 NOF16, --before -d/x.js (dash-led dir, no repo): reaches node, one VERDICT; MUTANT cp of Watch.js without `--` goes red', { skip: mskip }, () => {
    const run = (root) => { const f = fxDashWatch(); const r = runScript(root, f.d, f.args); return (!REFUSALS.test(r.out) && r.spawns > IBD_PRE && nverd(r) === 1) ? null : `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`; };
    assert.equal(run(join(mNOF(), TOOLS.ibd[0])), null);
    assert.notEqual(run(join(pb('x1-cpw', [NOF16, ['lib', 'modes.sh', 'cp -- "$w" "$dir/Watch.js"', 'cp "$w" "$dir/Watch.js"']]), TOOLS.ibd[0])), null, 'cp Watch.js mutant survived');
});
// dirname without `--` on a clean -b.js only adds stderr noise (top_of "" = git -C "" = cwd, already in live_tops), so its
// teeth are the -d/ repo reached through dirname(--before) alone.
test('X1d U2 NOF16, -d/x.js a hard link of the tracked -d/Signal.js: "same file as the live" refusal; MUTANT dirname without `--` loses it', { skip: mskip }, () => {
    assert.equal(refusesSame(join(mNOF(), TOOLS.ibd[0]), fxDashDirHardlink()), null);
    const out = pb('x1-dirname', [NOF16, ['lib', 'common.sh', 'live_tops "$f" "$(dirname -- "$f")" "$(dirname -- "$p")"', 'live_tops "$f" "$(dirname "$f")" "$(dirname "$p")"']]);
    assert.notEqual(refusesSame(join(out, TOOLS.ibd[0]), fxDashDirHardlink()), null, 'dirname mutant survived');
});
test('X1h U2 NOF16, -b.js a hard link of the tracked repo/-b.js: "same file as the live" refusal; MUTANT basename without `--` loses it', { skip: mskip }, () => {
    assert.equal(refusesSame(join(mNOF(), TOOLS.ibd[0]), fxDashHardlink()), null);
    const out = pb('x1-basename', [NOF16, ['lib', 'common.sh', '"$top/$(basename -- "$f")" "$top/$(basename -- "$p")"', '"$top/$(basename "$f")" "$top/$(basename "$p")"']]);
    assert.notEqual(refusesSame(join(out, TOOLS.ibd[0]), fxDashHardlink()), null, 'basename mutant survived');
});

// ---------------------------------------------------------------- N: nested retention
test('N after 2 nested runs of this file, 0 entries are left under each private mkdtemp root', { skip: skip || NESTED }, () => {
    const P = mk('nested-tmp');
    for (let i = 0; i < 2; i++) {
        const t = join(P, `run-${i}`); mkdirSync(t);
        const r = capSync(process.execPath, [HERE], { encoding: 'utf8', env: { ...ENV, TMPDIR: t, SHLIB_NESTED: t } }, 400000, `shlib.test nested run ${i}`);
        assert.equal(r.status, 0, `run ${i}: ${r.stdout.slice(-2000)}${r.stderr.slice(-500)}`);
        assert.deepEqual(readdirSync(t), [], `run ${i}: entries left under the mkdtemp root`);
    }
});
