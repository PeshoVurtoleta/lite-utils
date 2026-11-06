// test/tracked.test.mjs -- G-TRACKED (b45, plan .handoff/PLAN-b42-gtracked.md ASSERTIONS A1, A3 mutants, A5).
// Oracle: the PLAN assertions, not the implementation. The LAST `is_tracked()` defined in each of the bb / dd / ic /
// alloc roots (bash keeps the last definition, so that is the one refuse_live calls) is run under a `die` stub with
// what=--before. Expected values come from the spec: 5 git error states -> exit 2 + a line starting
// "--before: git failed while checking whether"; the controls (tracked 0, untracked in the repo 1, outside a repo 1,
// inside .git/ 1, git off PATH 1) pass on the old and the new code. ibd keeps its single old definition: it returns 1 on
// all 5 errors (a KNOWN GAP, logged for D-4a). The fixtures need no commit: `git add` alone makes a file tracked.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import {
    mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync, symlinkSync, chmodSync, truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync: yield once BEFORE each test so the previous report flushes (b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
// a nested run is marked by TRACKED_NESTED equal to its own TMPDIR (an inherited bare '1' marks nothing)
const NESTED = process.env.TRACKED_NESTED !== undefined && process.env.TRACKED_NESTED === process.env.TMPDIR;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const FOUR = ['bytecode-budget.sh', 'deopt-diff.sh', 'ic-diff.sh', 'allocation-diff.sh'];
const IBD = 'inlining-budget-diff.sh';
const PREFIX = 'trk-gt-';

// child env: no inherited git steering, no global / system config, no editor, no V8 coverage dir (node re-adds a deleted one)
const ENV = { ...process.env };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR']) delete ENV[k];
ENV.GIT_CONFIG_GLOBAL = '/dev/null';
ENV.GIT_CONFIG_NOSYSTEM = '1';
ENV.NODE_V8_COVERAGE = undefined;
delete ENV.TRACKED_NESTED;
delete ENV.NODE_TEST_CONTEXT;      // a nested `node file` run must print TAP text, not the parent's v8-serialized events

let TOP = null;                        // the mkdtemp root of this file; removed in after()
const mkdirs = [];
function mkTop() { if (TOP === null) TOP = mkdtempSync(join(tmpdir(), PREFIX)); return TOP; }
function mk(name) { const d = join(mkTop(), name); mkdirSync(d, { recursive: true }); return d; }
before(() => {
    mkTop();
    if (NESTED) assert.ok(TOP.startsWith(process.env.TMPDIR), `nested mkdtemp root ${TOP} must be under ${process.env.TMPDIR}`);
});
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

function git(cwd, args, what = args[0]) {
    const r = capSync('git', args, { cwd, encoding: 'utf8', env: ENV }, 30000, `git ${what}`);
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r;
}
function which(cmd) {
    const r = capSync(BASH, ['-c', `command -v ${cmd}`], { encoding: 'utf8', env: ENV }, 10000, `command -v ${cmd}`);
    assert.equal(r.status, 0, `${cmd} not found`);
    return r.stdout.trim();
}
const gvr = capSync('git', ['--version'], { encoding: 'utf8', env: ENV }, 10000, 'git --version');
assert.equal(gvr.status, 0, gvr.stderr);
const gv = gvr.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
assert.ok(gv !== null, 'unparseable git --version: ' + gvr.stdout);
const GITV = [Number(gv[1]), Number(gv[2]), Number(gv[3])];
function gitAtLeast(a, b, c) { for (const [x, y] of [[GITV[0], a], [GITV[1], b], [GITV[2], c]]) { if (x !== y) return x > y; } return true; }
const DUBIOUS_SKIP = gitAtLeast(2, 35, 2) ? false : `git ${GITV.join('.')} < 2.35.2: no dubious-ownership check`;

// ---- fixtures: built once, read-only for every row ----
let FX = null;
function fx() {
    if (FX !== null) return FX;
    const top = mkTop();
    const f = { top };
    const R = join(top, 'repo');
    mkdirSync(R);
    git(R, ['init', '-q']);
    writeFileSync(join(R, 't.txt'), 'tracked\n');
    writeFileSync(join(R, 'u.txt'), 'untracked\n');
    git(R, ['add', 't.txt']);
    f.R = R;
    // literal-pathspecs fixture: tracked ":x.js" (pathspec magic syntax) and a tracked "a.js"; an UNTRACKED file named "*"
    const L = join(top, 'lit');
    mkdirSync(L);
    git(L, ['init', '-q']);
    for (const n of [':x.js', 'a.js', '*']) writeFileSync(join(L, n), 'x\n');
    git(L, ['--literal-pathspecs', 'add', '--', ':x.js', 'a.js'], 'add');
    f.lit = L;
    function clone(name, breakIt) {
        const d = join(top, name);
        cpSync(R, d, { recursive: true });
        breakIt(d);
        return d;
    }
    f.gitfile = clone('c-gitfile', (d) => { rmSync(join(d, '.git'), { recursive: true }); writeFileSync(join(d, '.git'), 'this is not a gitfile\n'); });
    f.missing = clone('c-missing', (d) => { rmSync(join(d, '.git'), { recursive: true }); writeFileSync(join(d, '.git'), 'gitdir: /nonexistent/trk-gt-nowhere\n'); });
    f.config = clone('c-config', (d) => { writeFileSync(join(d, '.git', 'config'), '[core\n\tbare = false\n'); });
    f.index = clone('c-index', (d) => { truncateSync(join(d, '.git', 'index'), 10); });
    const out = join(top, 'nogit'); mkdirSync(out); writeFileSync(join(out, 'f.txt'), 'x\n');
    f.out = out;
    // PATH without git: symlinks to the few tools a fragment may use, none of them git
    const bin = join(top, 'nogit-bin'); mkdirSync(bin);
    for (const c of ['dirname', 'basename']) symlinkSync(which(c), join(bin, c));
    f.nogitBin = bin;
    // a counting shim: logs one line per git spawn, then runs the real git
    const shim = join(top, 'shim-bin'); mkdirSync(shim);
    for (const c of ['dirname', 'basename']) symlinkSync(which(c), join(shim, c));
    writeFileSync(join(shim, 'git'), `#!${BASH}\nprintf '%s\\n' "$*" >>"$SHIM_LOG"\nexec '${which('git')}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    f.shim = shim;
    FX = f;
    return f;
}

// case table: path + env + expectation ('err' = exit 2 + die line; a number = harness prints rc=<n>)
const ERR_CASES = ['gitfile', 'missing', 'config', 'index', 'dubious'];
function cases() {
    const f = fx();
    return {
        gitfile: { kind: 'err', path: join(f.gitfile, 't.txt'), env: {} },
        missing: { kind: 'err', path: join(f.missing, 't.txt'), env: {} },
        config: { kind: 'err', path: join(f.config, 't.txt'), env: {} },
        index: { kind: 'err', path: join(f.index, 't.txt'), env: {} },
        dubious: { kind: 'err', path: join(f.R, 't.txt'), env: { GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' }, skip: DUBIOUS_SKIP },
        tracked: { kind: 'rc', rc: 0, path: join(f.R, 't.txt'), env: {} },
        untracked: { kind: 'rc', rc: 1, path: join(f.R, 'u.txt'), env: {} },
        outside: { kind: 'rc', rc: 1, path: join(f.out, 'f.txt'), env: {} },
        dotgit: { kind: 'rc', rc: 1, path: join(f.R, '.git', 'HEAD'), env: {} },
        nogit: { kind: 'rc', rc: 1, path: join(f.R, 't.txt'), env: { PATH: f.nogitBin } },
    };
}
function litVerdict(rootsDir, file) { // null, or why not: ":x.js" tracked -> 0; untracked "*" beside tracked files -> 1
    const f = fx();
    for (const [n, rc] of [[':x.js', 0], ['*', 1]]) {
        const c = { kind: 'rc', rc, path: join(f.lit, n), env: {} };
        const m = verdict(c, run(rootsDir, file, c));
        if (m !== null) return `${n}: ${m}`;
    }
    return null;
}
const CTL_CASES = ['tracked', 'untracked', 'outside', 'dotgit', 'nogit'];

// the text of the LAST `is_tracked()` definition of a root, from its line to the first line that is exactly "}"
function lastDef(text) {
    const lines = text.split('\n');
    let s = -1;
    for (let i = 0; i < lines.length; i++) if (/^is_tracked\(\)/.test(lines[i])) s = i;
    assert.ok(s >= 0, 'no is_tracked() definition');
    for (let i = s; i < lines.length; i++) if (lines[i] === '}') return lines.slice(s, i + 1).join('\n') + '\n';
    assert.fail('is_tracked() has no closing line "}"');
}
function defCount(text) { return text.split('\n').filter((l) => /^is_tracked\(\)/.test(l)).length; }

const harnessCache = new Map();
function harness(rootsDir, file) {
    const key = rootsDir + '|' + file;
    if (harnessCache.has(key)) return harnessCache.get(key);
    const fn = lastDef(readFileSync(join(rootsDir, file), 'utf8'));
    const p = join(mkTop(), `h-${harnessCache.size}-${file}`);
    writeFileSync(p, ['what=--before', 'die() { printf \'%s\\n\' "$*" >&2; exit 2; }', fn + 'is_tracked "$1"', 'printf \'rc=%s\\n\' "$?"', ''].join('\n'));
    harnessCache.set(key, p);
    return p;
}
function run(rootsDir, file, c, extraEnv = {}) {
    return capSync(BASH, [harness(rootsDir, file), c.path], { encoding: 'utf8', env: { ...ENV, GIT_CEILING_DIRECTORIES: fx().top, ...c.env, ...extraEnv } },
        30000, `is_tracked ${file}`);
}
// null when the result matches the spec for this case, else a message (the mutant rows count non-null results as kills)
function verdict(c, r, ibd = false) {
    if (c.kind === 'err' && !ibd) {
        if (r.status !== 2) return `exit ${r.status}, want 2 (stdout ${JSON.stringify(r.stdout)})`;
        if (!r.stderr.split('\n').some((l) => l.startsWith('--before: git failed while checking whether'))) return `no "--before: git failed while checking whether" line: ${r.stderr}`;
        if (!r.stderr.includes(`whether ${c.path} is tracked (`)) return `die line must name the path and git's line: ${r.stderr}`;
        return null;
    }
    if (ibd && !(c.kind === 'rc' && c.rc === 0)) {
        // ibd's old definition is `rev-parse && ls-files` with all output discarded: every non-tracked state reads as
        // "not tracked" (nonzero; git's own 1 / 128 / 127 passes through) and nothing dies. For the 5 errors that is the
        // KNOWN GAP (D-4a). The spec said "returns 1"; the exact value is git's, so only "nonzero, no die" is asserted.
        const m = /^rc=(\d+)\n$/.exec(r.stdout);
        if (r.status !== 0 || m === null || Number(m[1]) === 0 || r.stderr !== '') return `want a nonzero rc and no die, got exit ${r.status} stdout ${JSON.stringify(r.stdout)} stderr ${JSON.stringify(r.stderr)}`;
        return null;
    }
    const want = c.kind === 'err' ? 1 : c.rc;
    if (r.status !== 0 || r.stdout !== `rc=${want}\n`) return `want rc=${want}, got exit ${r.status} stdout ${JSON.stringify(r.stdout)} stderr ${JSON.stringify(r.stderr)}`;
    return null;
}

// ---- A1: the effective definition in each of the four roots ----
for (const file of FOUR) {
    test(`A1 ${file}: exactly 2 is_tracked() definitions (common.sh's, then the fragment's)`, { skip }, () => {
        assert.equal(defCount(readFileSync(join(ROOT, file), 'utf8')), 2);
    });
    for (const name of ERR_CASES) {
        test(`A1 ${file}: git error "${name}" -> exit 2 + "--before: git failed while checking whether"`, { skip: skip || (name === 'dubious' && DUBIOUS_SKIP) }, () => {
            const c = cases()[name];
            assert.equal(verdict(c, run(ROOT, file, c)), null);
        });
    }
    for (const name of CTL_CASES) {
        test(`A1 ${file}: control "${name}" returns ${name === 'tracked' ? 0 : 1}`, { skip }, () => {
            const c = cases()[name];
            assert.equal(verdict(c, run(ROOT, file, c)), null);
        });
    }
}

for (const file of FOUR) {
    test(`A1 literal-pathspecs ${file}: tracked ":x.js" -> 0, untracked "*" beside a tracked file -> 1`, { skip }, () => {
        assert.equal(litVerdict(ROOT, file), null);
    });
}

// ---- A1: ibd keeps exactly one definition; it still returns 1 on all 5 errors (KNOWN GAP, logged for D-4a) ----
test(`A1 ${IBD}: exactly 1 is_tracked() definition`, { skip }, () => {
    assert.equal(defCount(readFileSync(join(ROOT, IBD), 'utf8')), 1);
});
for (const name of ERR_CASES) {
    test(`A1 ${IBD}: known gap D-4a -- git error "${name}" stays nonzero, no die`, { skip: skip || (name === 'dubious' && DUBIOUS_SKIP) }, () => {
        const c = cases()[name];
        assert.equal(verdict(c, run(ROOT, IBD, c), true), null);
    });
}
for (const name of ['tracked', 'untracked']) {
    test(`A1 ${IBD}: control "${name}"`, { skip }, () => {
        const c = cases()[name];
        assert.equal(verdict(c, run(ROOT, IBD, c), true), null);
    });
}

// ---- A5: budget and retention ----
function shimCalls(file, c) {
    const f = fx();
    const log = join(mkTop(), `shim-${file}-${Math.random().toString(36).slice(2)}.log`);
    const tmpd = mk(`tmp-${file}-${Math.random().toString(36).slice(2)}`);
    const r = run(ROOT, file, c, { PATH: f.shim, SHIM_LOG: log, TMPDIR: tmpd });
    assert.equal(r.status, 0, r.stderr);     // the spawn count is this row's subject; the return value is the A1 rows'
    const n = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l !== '').length : 0;
    return { n, left: readdirSync(tmpd) };
}
for (const file of FOUR) {
    test(`A5 ${file}: git spawns per call (2 inside a work tree, 1 outside) and 0 temp files per call`, { skip }, () => {
        const cs = cases();
        for (const [name, want] of [['tracked', 2], ['untracked', 2], ['outside', 1]]) {
            const { n, left } = shimCalls(file, cs[name]);
            assert.equal(n, want, `${name}: git spawns`);
            assert.deepEqual(left, [], `${name}: temp files left in TMPDIR`);
        }
    });
}

test('A5: after 5 runs of this file, 0 entries are left under its mkdtemp root', { skip: skip || NESTED }, () => {
    const P = mk('nested-tmp');
    for (let i = 0; i < 5; i++) {
        const t = join(P, `run-${i}`); mkdirSync(t);
        const r = capSync(process.execPath, [HERE], { encoding: 'utf8', env: { ...ENV, TMPDIR: t, TRACKED_NESTED: t } }, 240000, `tracked.test nested run ${i}`);
        assert.equal(r.status, 0, `run ${i}: ${r.stdout.slice(-2000)}${r.stderr.slice(-500)}`);
        assert.deepEqual(readdirSync(t), [], `run ${i}: entries left under the mkdtemp root`);
    }
});

// ---- A3: mutants M1-M6 of lib/tracked.sh; each is built (build.sh) into a private out dir and must fail >= 1 named row ----

function mutantRoots(m) { // build the 4 roots (and ibd) from a private copy of build.sh + src/ + lib/ whose lib/tracked.sh is mutated once
    const d = mk(`mut-${m.id}`);
    cpSync(join(ROOT, 'build.sh'), join(d, 'build.sh'));
    cpSync(join(ROOT, 'src'), join(d, 'src'), { recursive: true });
    cpSync(join(ROOT, 'lib'), join(d, 'lib'), { recursive: true });
    const p = join(d, 'lib', 'tracked.sh');
    const t = readFileSync(p, 'utf8');
    const n = t.split(m.from).length - 1;
    assert.equal(n, 1, `${m.id}: anchor ${JSON.stringify(m.from)} must match exactly once in lib/tracked.sh, matched ${n}`);
    writeFileSync(p, t.replace(m.from, () => m.to));
    const out = mk(`mut-out-${m.id}`);
    const r = capSync('bash', ['build.sh', out], { cwd: d, encoding: 'utf8', env: ENV }, 60000, `bash build.sh (mutant ${m.id})`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return out;
}
const ANCHOR_GUARD = '  command -v git >/dev/null 2>&1 || return 1\n';
const MUTANTS = [
    // M1: ls-files back to a plain exit test (any failure reads as untracked) -> the truncated-index row dies
    { id: 'M1', from: '    [[ $rc -ne 0 ]] || return 0\n', to: '    [[ $rc -ne 0 ]] || return 0\n    return 1\n', exact: ['index'], kills: ['index'] },
    // M2: any rev-parse failure returns 1 -> broken gitfile, bad config, dubious ownership (and missing dir) are no longer refused
    { id: 'M2', from: '    case "$l" in "fatal: not a git repository (or any "*) return 1 ;; esac\n', to: '    return 1\n', exact: ['gitfile', 'missing', 'config', 'dubious'], kills: ['gitfile', 'config', 'dubious'] },
    // M3: the "(or any " part of the no-repo match dropped -> "fatal: not a git repository: <path>" (gitfile to a missing dir) reads as no repo
    { id: 'M3', from: '"fatal: not a git repository (or any "*)', to: '"fatal: not a git repository"*)', exact: ['missing'], kills: ['missing'] },
    // M4: the `false` arm removed -> inside .git/ is no longer "not tracked"
    { id: 'M4', from: '  elif [[ "$out" == false ]]; then\n    return 1\n', to: '', exact: ['dotgit'], kills: ['dotgit'] },
    // M5: the `command -v` guard removed -> git off PATH is no longer "not tracked"
    { id: 'M5', from: ANCHOR_GUARD, to: '', exact: ['nogit'], kills: ['nogit'] },
    // M6: always die -> the untracked controls die
    // M7: `--literal-pathspecs ` removed from the ls-files call -> pathspec magic: ":x.js" dies, "*" matches a tracked file
    { id: 'M7', from: 'git --literal-pathspecs -C', to: 'git -C', exact: ['lit'], kills: ['lit'] },
    { id: 'M6', from: '  local d b out rc=0 l\n', to: '  local d b out rc=0 l\n  die "${what:-is_tracked}: git failed while checking whether $1 is tracked (m6): always"\n', exact: ['tracked', 'untracked', 'outside', 'dotgit', 'nogit', 'lit'], kills: ['untracked', 'outside', 'dotgit', 'nogit'] },
];
for (const m of MUTANTS) {
    test(`A3 mutant ${m.id}: kills ${m.kills.join(' + ')} on every one of the 4 roots; the unmutated build kills none`, { skip: skip || (NESTED ? 'nested retention run: mutants skipped (time)' : false) }, (t) => {
        const cs = cases();
        const names = [...ERR_CASES, ...CTL_CASES].filter((n) => !(n === 'dubious' && DUBIOUS_SKIP));
        const out = mutantRoots(m);
        const killed = new Map();       // "file:case" -> message
        for (const file of FOUR) for (const n of names) {
            const msg = verdict(cs[n], run(out, file, cs[n]));
            if (msg !== null) killed.set(`${file}:${n}`, msg);
        }
        for (const file of FOUR) { const msg = litVerdict(out, file); if (msg !== null) killed.set(`${file}:lit`, msg); }
        t.diagnostic(`${m.id} killed rows: ${[...killed.keys()].join(', ') || 'none'}`);
        const want = [];
        for (const file of FOUR) for (const n of m.exact) if (!(n === 'dubious' && DUBIOUS_SKIP)) want.push(`${file}:${n}`);
        assert.deepEqual([...killed.keys()].sort(), want.sort(), `${m.id}: killed rows must be exactly the mutant's targets`);
        // the unmutated live roots pass every one of these rows (so each kill above is the mutation's, not the fixtures')
        for (const file of FOUR) for (const n of names) assert.equal(verdict(cs[n], run(ROOT, file, cs[n])), null, `${file}:${n} on the unmutated root`);
    });
}
