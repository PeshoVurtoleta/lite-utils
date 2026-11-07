// test/shlib.test.mjs -- G-SHLIB (b48, plan .handoff/PLAN-b48-shlib.md: TASK 11, ASSERTIONS 3 (last mutant), 4, 5, ADDENDA).
// Oracle: the PLAN assertions and argon's A1a / A1b / A2 shapes (audit/2026-11-07-deopt-diff/argon_reproduction.mjs), never a
// copy of what the new code prints. Rows:
//   D1-D4  drift gate (ASSERTION 4) + its must-fail twins (5e570f0 pre-G-SHLIB common.sh, a one-byte-mutated copy)
//   I*     inlining-budget-diff.sh (shared lib via refuse_live): A1b + A2 refuse (exit 2, 0 node spawns); the same two rows do NOT
//          refuse on the 5e570f0 (git history) ibd; A1a stays OPEN (known gap, D-4a) and is pinned as such
//   M      resolve_links mutant (relative arm back to a logical join) kills the ibd A1b row; the unmutated build passes
//   S      ASSERTION 5: refuse_live git spawns (dd, all outside a repo) == 6; 20 back-to-back R5 runs leave 0 entries / 0 OUT dirs
//   N      nested retention: 2 nested runs of this file leave their private mkdtemp root empty
// Independent expected value for S1 (6): refuse_live = is_tracked(f) + is_tracked(p) (1 rev-parse each, outside a repo) + live_tops
// top_of for ".", dirname(--after), dirname(f), dirname(p) (REPO is unset in file mode) = 2 + 4 = 6 git spawns.
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
// null iff the script refuses the A1b row the specified way (exit 2, "git-tracked" die, 0 node spawns)
function a1bVerdict(script) {
    const f = a1bFixture(); const r = runScript(script, f.d, f.args);
    if (r.rc !== 2 || r.spawns !== 0 || !/--before is a git-tracked working-tree file \(/.test(r.out)) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}
function a2Verdict(script) {
    const f = a2Fixture(true); const r = runScript(script, f.d, f.args);
    if (r.rc !== 2 || r.spawns !== 0 || !/--before: git failed while checking whether /.test(r.out)) return `exit ${r.rc}, spawns ${r.spawns}: ${r.out.slice(-400)}`;
    return null;
}

// ---------------------------------------------------------------- I: inlining-budget-diff via the shared lib
test('I1 ibd A1b (relative link inside a symlinked dir -> a tracked file): exit 2 "git-tracked", 0 node spawns', { skip }, () => {
    assert.equal(a1bVerdict(IBD), null);
});
test('I2 ibd A2 (`[broken` .git/config around --after, hard-linked --before): exit 2 "git failed while checking whether", 0 node spawns', { skip }, () => {
    assert.equal(a2Verdict(IBD), null);
});
test('I3 ibd A2 control: healthy repo around --after -> the hard link is refused ("is the same file as the live"), 0 spawns', { skip }, () => {
    const f = a2Fixture(false); const r = runScript(IBD, f.d, f.args);
    assert.equal(r.rc, 2, r.out); assert.equal(r.spawns, 0); assert.match(r.out, /is the same file as the live/);
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
test('I6 ibd A1a stays OPEN (known gap, D-4a): --before ext/L/../trace.txt (L -> repo/m/sub) is NOT refused today -- PIN, flips when the ibd group lands', { skip }, () => {
    // argon A1a: ibd keeps its old LOGICAL is_tracked (lib/common.sh, untouched by G-SHLIB), so it inspects ext/ (decoy) instead of
    // repo/m (tracked). This row pins the current behaviour; it asserts NO refusal and must be inverted by the D-4a ibd unit.
    const d = mk('a1a');
    for (const p of ['repo/m/sub', 'ext', 'after']) mkdirSync(join(d, p), { recursive: true });
    writeFileSync(join(d, 'repo', 'm', 'trace.txt'), `${E9}\n`);
    writeFileSync(join(d, 'after', 'trace.txt'), `${E9}\n`);
    git(join(d, 'repo'), ['init', '-q']);
    git(join(d, 'repo'), ['add', 'm/trace.txt']);
    symlinkSync(join(d, 'repo', 'm', 'sub'), join(d, 'ext', 'L'));
    const r = runScript(IBD, d, ['--node', fakeNode(), '--fn', 'm0', '--out', join(d, 'out'), '--before', `${d}/ext/L/../trace.txt`, '--after', join(d, 'after', 'trace.txt')]);
    assert.doesNotMatch(r.out, REFUSALS, `A1a unexpectedly refused (good news: flip this row): ${r.out.slice(-300)}`);
    assert.ok(r.spawns >= 1, `exit ${r.rc}: ${r.out.slice(-300)}`);
});

// ---------------------------------------------------------------- M: resolve_links mutant (ASSERTION 3, last)
test('M resolve_links relative arm back to `p="$(dirname "$p")/$l"` kills the ibd A1b row; the unmutated build passes it', { skip: skip || (NESTED ? 'nested retention run: mutant skipped (time)' : false) }, () => {
    const d = mk('mut');
    cpSync(join(ROOT, 'build.sh'), join(d, 'build.sh'));
    cpSync(join(ROOT, 'src'), join(d, 'src'), { recursive: true });
    cpSync(join(ROOT, 'lib'), join(d, 'lib'), { recursive: true });
    const p = join(d, 'lib', 'common.sh');
    const t = readFileSync(p, 'utf8');
    const m = t.match(/\*\) d=\$\(CDPATH= cd -P -- "\$\(dirname -- "\$p"\)" 2>\/dev\/null && pwd -P\) \|\| die "[^"\n]*"; p="\$d\/\$l" ;;/g);
    assert.equal(m && m.length, 1, `relative-arm anchor must match exactly once in lib/common.sh, matched ${m && m.length}`);
    writeFileSync(p, t.replace(m[0], () => '*) p="$(dirname "$p")/$l" ;;'));
    const out = mk('mut-out');
    const b = capSync('bash', ['build.sh', out], { cwd: d, encoding: 'utf8', env: ENV }, 60000, 'bash build.sh (mutant resolve_links)');
    assert.equal(b.status, 0, b.stdout + b.stderr);
    assert.equal(a1bVerdict(IBD), null, 'unmutated build must pass the A1b row');
    assert.notEqual(a1bVerdict(join(out, 'inlining-budget-diff.sh')), null, 'mutant survived: A1b row still refused');
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
test('S1 ASSERTION 5: refuse_live git spawns == 6 (dd; cwd, --before, --after all outside any repo), run exits 0 SAME', { skip }, () => {
    const f = ddFixture(false);
    const shim = mk('shim');
    const real = capSync(BASH, ['-c', 'command -v git'], { encoding: 'utf8', env: ENV }, 10000, 'command -v git').stdout.trim();
    const glog = join(shim, 'git.log');
    writeFileSync(join(shim, 'git'), `#!${BASH}\nprintf '%s\\n' "$*" >>"$SHIM_LOG"\nexec '${real}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    const r = runScript(DD, f.d, f.args(join(f.d, 'out')), { PATH: `${shim}:${ENV.PATH}`, SHIM_LOG: glog });
    assert.equal(r.rc, 0, r.out.slice(-500));
    assert.match(r.out, /^VERDICT SAME$/m);
    const lines = readFileSync(glog, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 6, lines.join('\n'));
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
