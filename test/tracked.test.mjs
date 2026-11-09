// test/tracked.test.mjs -- G-TRACKED (b45, plan .handoff/PLAN-b42-gtracked.md ASSERTIONS A1, A3 mutants, A5);
// b50 G-SHL3 N1 (.handoff/PLAN-b50-shl3.md ASSERTION 3) adds ibd as the fifth root.
// Oracle: the PLAN assertions, not the implementation. The LAST `is_tracked()` defined in each of the bb / dd / ic /
// alloc / ibd roots (bash keeps the last definition, so that is the one refuse_live calls) is run under a `die`
// stub
// with what=--before. Expected values come from the spec: its 5 git error states plus gitdir (GIT_DIR to a missing
// dir, b48) -> exit 2 + a line starting "--before: git failed while checking whether"; the controls (tracked 0,
// untracked in the repo 1, outside a repo 1, inside .git/ 1, git off PATH 1) pass on the old and the new code.
// Since
// b50 ibd includes lib/tracked.sh like the other four (the old single definition returned nonzero, no die, on all 6
// errors: the D-4a gap). The fixtures need no commit: `git add` alone makes a file tracked.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import {
    mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync, symlinkSync, chmodSync, truncateSync, linkSync,
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
const FIVE = ['bytecode-budget.sh', 'deopt-diff.sh', 'ic-diff.sh', 'allocation-diff.sh', 'inlining-budget-diff.sh'];
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
    // M7 fixture (R3): tracked a.js and c.js; the UNTRACKED file "[ab].js" is a hard link of c.js. Live: ":(literal)[ab].js" matches nothing ->
    // inode sweep -> same inode as c.js -> tracked (rc 0). Without :(literal) the glob [ab].js matches a.js (rc 0, no exact-name / inode hit) -> rc 1.
    const L2 = join(top, 'lit2');
    mkdirSync(L2);
    git(L2, ['init', '-q']);
    for (const n of ['a.js', 'c.js']) writeFileSync(join(L2, n), 'x\n');
    git(L2, ['--literal-pathspecs', 'add', '--', 'a.js', 'c.js'], 'add');
    linkSync(join(L2, 'c.js'), join(L2, '[ab].js'));
    f.lit2 = L2;
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
const ERR_CASES = ['gitfile', 'missing', 'config', 'index', 'dubious', 'gitdir'];
function cases() {
    const f = fx();
    return {
        gitfile: { kind: 'err', path: join(f.gitfile, 't.txt'), env: {} },
        missing: { kind: 'err', path: join(f.missing, 't.txt'), env: {} },
        config: { kind: 'err', path: join(f.config, 't.txt'), env: {} },
        index: { kind: 'err', path: join(f.index, 't.txt'), env: {} },
        dubious: { kind: 'err', path: join(f.R, 't.txt'), env: { GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' }, skip: DUBIOUS_SKIP },
        // GIT_DIR to a missing dir: git's setup_explicit_git_dir prints "fatal: not a git repository: '<dir>'" (rc 128) on every git
        gitdir: { kind: 'err', path: join(f.R, 't.txt'), env: { GIT_DIR: '/nonexistent/trk-gt-nowhere' } },
        tracked: { kind: 'rc', rc: 0, path: join(f.R, 't.txt'), env: {} },
        untracked: { kind: 'rc', rc: 1, path: join(f.R, 'u.txt'), env: {} },
        outside: { kind: 'rc', rc: 1, path: join(f.out, 'f.txt'), env: {} },
        dotgit: { kind: 'rc', rc: 1, path: join(f.R, '.git', 'HEAD'), env: {} },
        nogit: { kind: 'rc', rc: 1, path: join(f.R, 't.txt'), env: { PATH: f.nogitBin } },
    };
}
// measured rc + first output line of the rev-parse is_tracked runs for case c (stdout+stderr, as its `2>&1` sees it)
function firstLine(c) {
    const r = capSync('git', ['-C', dirname(c.path), 'rev-parse', '--is-inside-work-tree'],
        { encoding: 'utf8', env: { ...ENV, GIT_CEILING_DIRECTORIES: fx().top, LC_ALL: 'C', ...c.env } }, 30000, 'git rev-parse (firstLine)');
    return { rc: r.status, line: ((r.stdout || '') + (r.stderr || '')).split('\n')[0] };
}
// M3 kills a case iff git failed and its first line starts "fatal: not a git repository" without "(or any " (host text, measured)
function m3Kills(fl) {
    return fl.rc !== 0 && fl.line.startsWith('fatal: not a git repository') && !fl.line.startsWith('fatal: not a git repository (or any ');
}
function litVerdict(rootsDir, file) { // null, or why not: ":x.js" tracked -> 0; untracked "*" beside tracked files -> 1; untracked "[ab].js" hard link of tracked c.js -> 0
    const f = fx();
    // ':x.js' and '*' are parity controls since R3 (the inode sweep makes them verdict-equivalent under M7); '[ab].js' (hard link of tracked c.js) has the M7 teeth
    for (const [n, rc, dir] of [[':x.js', 0, f.lit], ['*', 1, f.lit], ['[ab].js', 0, f.lit2]]) {
        const c = { kind: 'rc', rc, path: join(dir, n), env: {} };
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
function verdict(c, r) {
    if (c.kind === 'err') {
        if (r.status !== 2) return `exit ${r.status}, want 2 (stdout ${JSON.stringify(r.stdout)})`;
        if (!r.stderr.split('\n').some((l) => l.startsWith('--before: git failed while checking whether'))) return `no "--before: git failed while checking whether" line: ${r.stderr}`;
        if (!r.stderr.includes(`whether ${c.path} is tracked (`)) return `die line must name the path and git's line: ${r.stderr}`;
        return null;
    }
    const want = c.kind === 'err' ? 1 : c.rc;
    if (r.status !== 0 || r.stdout !== `rc=${want}\n`) return `want rc=${want}, got exit ${r.status} stdout ${JSON.stringify(r.stdout)} stderr ${JSON.stringify(r.stderr)}`;
    return null;
}

// ---- A1: the effective definition in each of the five roots ----
for (const file of FIVE) {
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

for (const file of FIVE) {
    test(`A1 literal-pathspecs ${file}: tracked ":x.js" -> 0, untracked "*" beside a tracked file -> 1, untracked "[ab].js" (hard link of tracked c.js) -> 0`, { skip }, () => {
        assert.equal(litVerdict(ROOT, file), null);
    });
}

// ---- b50 N1 must-fail twin: the bd0192f ibd (git history; one old is_tracked, rev-parse && ls-files, all output
// hidden) ----
// Its single definition reads every git error as "not tracked" (nonzero rc from git's own 1 / 128 / 127, no die):
// the six
// ERR rows are red there. A history row whose commit is missing FAILS under CI=true and skips locally.
const OLD_SHA = 'bd0192f', IBD = 'inlining-budget-diff.sh';
const oldHave = capSync('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: ROOT, encoding: 'utf8',
    env: ENV }, 30000, 'git cat-file')
    .status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const histSkip = (have) => (have === true || process.env.CI === 'true' ? false : have);
test(`A1 ${IBD} twin: the ${OLD_SHA} ibd has 1 is_tracked() and all 6 git errors read nonzero with no die (red)`,
    { skip: skip || histSkip(oldHave) }, () => {
        if (oldHave !== true) assert.fail(`${oldHave} (CI=true: a history row fails, never skips)`);
        const g = capSync('git', ['show', `${OLD_SHA}:${IBD}`], { cwd: ROOT, encoding: 'utf8', env: ENV,
            maxBuffer: 1 << 26 },
            30000, 'git show ibd');
        assert.equal(g.status, 0, g.stderr);
        const dir = mk('hist-old');
        writeFileSync(join(dir, IBD), g.stdout);
        assert.equal(defCount(g.stdout), 1);
        const cs = cases();
        for (const name of ERR_CASES) {
            if (name === 'dubious' && DUBIOUS_SKIP) continue;
            const r = run(dir, IBD, cs[name]);
            const m = /^rc=(\d+)\n$/.exec(r.stdout);
            assert.ok(r.status === 0 && m !== null && Number(m[1]) !== 0 && r.stderr === '',
                `${name}: ${r.status} ${r.stdout} ${r.stderr}`);
            assert.notEqual(verdict(cs[name], r), null, `${name}: the A1 row must be red on the old ibd`);
        }
    });

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
for (const file of FIVE) {
    test(`A5 ${file}: git spawns per call (3 for a name with no literal match, 2 when it matched, 1 outside a work tree) and 0 temp files per call`, { skip }, () => {
        const cs = cases();
        for (const [name, want] of [['tracked', 2], ['untracked', 3], ['outside', 1]]) {
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

// build the 5 roots from a private copy of build.sh + src/ + lib/ whose lib/tracked.sh is mutated once
function mutantRoots(m) {
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
    { id: 'M1', from: '    if [[ "$rc" == 1 ]]; then case "$out" in *"did not match"*) return 1 ;; esac; fi\n', to: '    return 1\n', exact: ['index'], kills: ['index'] },
    // M2: any rev-parse failure returns 1 -> broken gitfile, bad config, dubious ownership, GIT_DIR to a missing dir (and a .git file to a missing dir) are no longer refused
    { id: 'M2', from: '    case "$l" in "fatal: not a git repository (or any "*) return 1 ;; esac\n', to: '    return 1\n', exact: ['gitfile', 'missing', 'config', 'dubious', 'gitdir'], kills: ['gitfile', 'config', 'dubious', 'gitdir'] },
    // M3: the "(or any " part of the no-repo match dropped -> "fatal: not a git repository: '<path>'" (GIT_DIR to a missing dir) reads as no repo.
    // exact is computed per host from the measured first lines (git's text for a .git file to a missing dir differs by host); see the M3 row
    { id: 'M3', from: '"fatal: not a git repository (or any "*)', to: '"fatal: not a git repository"*)', exact: null, kills: ['gitdir'] },
    // M4: the `false` arm removed -> inside .git/ is no longer "not tracked"
    { id: 'M4', from: '  elif [[ "$out" == false ]]; then\n    return 1\n', to: '', exact: ['dotgit'], kills: ['dotgit'] },
    // M5: the `command -v` guard removed -> git off PATH is no longer "not tracked"
    { id: 'M5', from: ANCHOR_GUARD, to: '', exact: ['nogit'], kills: ['nogit'] },
    // M6: always die -> the untracked controls die
    // M7: `:(literal)` removed from the ls-files pathspec -> the glob "[ab].js" (an untracked hard link of tracked c.js) matches a.js: rc 1 instead of 0.
    // (R3: ":x.js" and "*" no longer tell M7 from live, the inode sweep reads them the same; they stay in the lit row as controls)
    { id: 'M7', from: '-- ":(literal)$b"', to: '-- "$b"', exact: ['lit'], kills: ['lit'] },
    { id: 'M6', from: '  local d b out rc=0 l\n', to: '  local d b out rc=0 l\n  die "${what:-is_tracked}: git failed while checking whether $1 is tracked (m6): always"\n', exact: ['tracked', 'untracked', 'outside', 'dotgit', 'nogit', 'lit'], kills: ['untracked', 'outside', 'dotgit', 'nogit'] },
];
for (const m of MUTANTS) {
    test(`A3 mutant ${m.id}: kills ${m.kills.join(' + ')} on every one of the 5 roots; the unmutated build ` +
        `kills none`, { skip: skip || (NESTED ? 'nested retention run: mutants skipped (time)' : false) }, (t) => {
        const cs = cases();
        const names = [...ERR_CASES, ...CTL_CASES].filter((n) => !(n === 'dubious' && DUBIOUS_SKIP));
        const out = mutantRoots(m);
        const killed = new Map();       // "file:case" -> message
        for (const file of FIVE) for (const n of names) {
            const msg = verdict(cs[n], run(out, file, cs[n]));
            if (msg !== null) killed.set(`${file}:${n}`, msg);
        }
        for (const file of FIVE) { const msg = litVerdict(out, file); if (msg !== null) killed.set(`${file}:lit`,
            msg); }
        t.diagnostic(`${m.id} killed rows: ${[...killed.keys()].join(', ') || 'none'}`);
        const measured = new Map();
        for (const n of ERR_CASES) if (!(n === 'dubious' && DUBIOUS_SKIP)) { const fl = firstLine(cs[n]); measured.set(n, fl); t.diagnostic(`first line ${n}: rc=${fl.rc} ${JSON.stringify(fl.line)}`); }
        const exact = m.exact !== null ? m.exact : [...measured.keys()].filter((n) => m3Kills(measured.get(n)));
        if (m.exact === null) {
            t.diagnostic(`${m.id} measured target set: ${exact.join(', ') || 'none'}`);
            assert.ok(exact.includes('gitdir'), `${m.id}: teeth floor: the gitdir case must be a target on this host, measured ${JSON.stringify(measured.get('gitdir'))}`);
        }
        // the unmutated live roots pass every one of these rows (so each kill below is the mutation's, not the fixtures')
        for (const file of FIVE) for (const n of names) assert.equal(verdict(cs[n], run(ROOT, file, cs[n])), null,
            `${file}:${n} on the unmutated root`);
        const want = [];
        for (const file of FIVE) for (const n of exact) if (!(n === 'dubious'
            && DUBIOUS_SKIP)) want.push(`${file}:${n}`);
        assert.deepEqual([...killed.keys()].sort(), want.sort(), `${m.id}: killed rows must be exactly the mutant's targets`);
    });
}

// ---- b58 G0 / G-T1 (.handoff/PLAN-b58-g0.md ASSERTIONS): the case-folding, :(literal) is_tracked of lib/tracked.sh on all FIVE roots ----
// Old code = the 57b93d1 roots (git history; a missing commit skips locally, FAILS under CI=true). Every expected rc is the
// spec's (tracked 0, untracked / nosuch 1, a git error dies), not what a root printed. Results: bash 3.2 macOS host only.
const G0_SHA = '57b93d1';
const g0Have = capSync('git', ['cat-file', '-e', `${G0_SHA}^{commit}`], { cwd: ROOT, encoding: 'utf8', env: ENV }, 30000, 'git cat-file g0')
    .status === 0 ? true : `commit ${G0_SHA} not available (shallow clone?)`;
let G0_OLD = null;
function g0Old() {
    if (g0Have !== true) assert.fail(`${g0Have} (CI=true: a history row fails, never skips)`);
    if (G0_OLD !== null) return G0_OLD;
    const dir = mk('g0-old');
    for (const f of FIVE) {
        const g = capSync('git', ['show', `${G0_SHA}:${f}`], { cwd: ROOT, encoding: 'utf8', env: ENV, maxBuffer: 1 << 26 }, 30000, `git show ${f}`);
        assert.equal(g.status, 0, g.stderr);
        writeFileSync(join(dir, f), g.stdout);
    }
    return (G0_OLD = dir);
}
// a repo under TOP with the given tracked files (git add only) and untracked files
function g0Repo(name, tracked, untracked = []) {
    const d = mk(name);
    git(d, ['init', '-q']);
    for (const n of [...tracked, ...untracked]) writeFileSync(join(d, n), 'x\n');
    git(d, ['--literal-pathspecs', 'add', '--', ...tracked], 'add');
    return d;
}
// host facts: does `thing.js` open the file stored as `Thing.js` (case-folding host)?
let FOLD = null;
function g0Fold() {
    if (FOLD === null) {
        const d = mk('g0-fold');
        writeFileSync(join(d, 'Thing.js'), 'x\n');
        FOLD = existsSync(join(d, 'thing.js'));
    }
    return FOLD;
}
const g0rc = (r) => (r.status === 0 ? r.stdout : `exit ${r.status} ${r.stdout} ${r.stderr}`);
for (const file of FIVE) {
    test(`G-T1a ${file}: tracked Thing.js, is_tracked <dir>/thing.js -> rc 0 (case-folding hosts only; macOS leg)`, { skip }, (t) => {
        if (!g0Fold()) return t.skip('G-T1a: case-sensitive host (runs on case-folding hosts only: macOS APFS default)');
        const d = g0Repo(`g1a-${file}`, ['Thing.js']);
        const c = { kind: 'rc', rc: 0, path: join(d, 'thing.js'), env: {} };
        assert.equal(g0rc(run(ROOT, file, c)), 'rc=0\n');
    });
    test(`G-T1a twin ${file}: the ${G0_SHA} root returns 1 on tracked Thing.js via thing.js (red on old; case-folding hosts only)`, { skip: skip || histSkip(g0Have) }, (t) => {
        if (!g0Fold()) return t.skip('G-T1a twin: case-sensitive host (runs on case-folding hosts only: macOS APFS default)');
        const d = g0Repo(`g1at-${file}`, ['Thing.js']);
        const c = { kind: 'rc', rc: 0, path: join(d, 'thing.js'), env: {} };
        assert.equal(g0rc(run(g0Old(), file, c)), 'rc=1\n', 'the old root must read the case-different name as untracked');
    });
    test(`G-T1b ${file}: tracked Thing.js beside a distinct untracked thing.js -> rc 1 (case-sensitive hosts only; Linux CI leg)`, { skip }, (t) => {
        if (g0Fold()) return t.skip('G-T1b: case-folding host (runs on case-sensitive hosts only: Linux CI leg)');
        const d = g0Repo(`g1b-${file}`, ['Thing.js'], ['thing.js']);
        const c = { kind: 'rc', rc: 1, path: join(d, 'thing.js'), env: {} };
        assert.equal(g0rc(run(ROOT, file, c)), 'rc=1\n');
    });
}
// parity rows: spec rc on the live root AND the pinned old root (same rc on both)
function g1cCases() {
    const f = fx();
    const q = g0Repo('g1c-quote', ['q"b.js', 'k.js']);
    const u = g0Repo('g1c-untr', ['k.js'], ['u.js', '*']);
    return [
        ['untracked file', 1, join(u, 'u.js')],
        [':x.js tracked (pathspec magic name)', 0, join(f.lit, ':x.js')],
        ['* untracked beside tracked files', 1, join(u, '*')],
        ['q"b.js tracked', 0, join(q, 'q"b.js')],
        ['nosuch.js (absent)', 1, join(q, 'nosuch.js')],
    ];
}
for (const file of FIVE) {
    test(`G-T1c ${file}: live and ${G0_SHA} agree with the spec rc (untracked 1, :x.js 0, * 1, q"b.js 0, nosuch 1) and a truncated index dies on both`,
        { skip: skip || histSkip(g0Have) }, () => {
            for (const [name, rc, path] of g1cCases()) {
                const c = { kind: 'rc', rc, path, env: {} };
                assert.equal(g0rc(run(ROOT, file, c)), `rc=${rc}\n`, `live: ${name}`);
                assert.equal(g0rc(run(g0Old(), file, c)), `rc=${rc}\n`, `old: ${name}`);
            }
            const ci = cases().index;
            assert.equal(verdict(ci, run(ROOT, file, ci)), null, 'live: truncated index');
            assert.equal(verdict(ci, run(g0Old(), file, ci)), null, 'old: truncated index');
        });
    test(`G-T1d ${file}: an inherited GIT_LITERAL_PATHSPECS=1 on a tracked file dies (exit 2 + the die line), never rc 1`, { skip }, () => {
        const c = { kind: 'err', path: join(fx().R, 't.txt'), env: {} };
        const r = run(ROOT, file, c, { GIT_LITERAL_PATHSPECS: '1' });
        assert.equal(verdict(c, r), null, g0rc(r));
        assert.ok(!r.stdout.includes('rc='), `must not print an rc: ${r.stdout}`);
    });
}

// ---- b58 G0 round 2 (.handoff/PLAN-b58-g0.md ADDENDUM R2): G-T1e .. G-T1i. Expected rcs are the spec's; old = the 57b93d1 roots
// (measured on this host, bash 3.2 macOS: NFC-tracked name asked in NFD reads rc 0 on old, so that row is a PARITY row). ----
const U = (s) => Buffer.from(s, 'latin1').toString('utf8');      // bytes -> string: \xc3\x89 = U+00C9 etc.
const NAME_E_UP = U('\xc3\x89a.js'), NAME_E_LO = U('\xc3\xa9a.js');   // "E-acute a.js (U+00C9)" / "e-acute a.js (U+00E9)"
const NFC_E = U('\xc3\xa9.js'), NFD_E = U('e\xcc\x81.js');            // "e-acute.js" precomposed / decomposed
const FOLD_SKIP = 'case-folding / Unicode-normalizing host only (macOS APFS leg; a case-sensitive host cannot open the other spelling)';
const lc = { LC_ALL: 'C' };
function g1cRc(root, file, path, extra = {}) { return g0rc(run(root, file, { kind: 'rc', path, env: {} }, { ...lc, ...extra })); }
function opens(a, b) { return existsSync(a) && existsSync(b); }
for (const file of FIVE) {
    test(`G-T1e ${file}: a core.fsmonitor hook printing to stderr on a successful ls-files -> rc 0 on live AND on ${G0_SHA} (parity); the r1 merged-stderr form is the mutant in audit-g0`, { skip: skip || histSkip(g0Have) }, () => {
        const d = g0Repo(`g1e-${file}`, ['a.js']);
        const hook = join(mk(`g1e-hook-${file}`), 'hook.sh');
        writeFileSync(hook, '#!/bin/sh\necho NOISE-FROM-HOOK >&2\nexit 0\n'); chmodSync(hook, 0o755);
        git(d, ['config', 'core.fsmonitor', hook]);
        assert.equal(g1cRc(ROOT, file, join(d, 'a.js')), 'rc=0\n', 'live');
        assert.equal(g1cRc(g0Old(), file, join(d, 'a.js')), 'rc=0\n', 'old');
    });
    test(`G-T1f ${file}: tracked "E-acute a.js (U+00C9)" asked as "e-acute a.js (U+00E9)" -> rc 0 (Unicode case; ${FOLD_SKIP})`, { skip }, (t) => {
        const d = g0Repo(`g1f1-${file}`, [NAME_E_UP]);
        if (!opens(join(d, NAME_E_UP), join(d, NAME_E_LO))) return t.skip(`G-T1f: ${FOLD_SKIP}`);
        assert.equal(g1cRc(ROOT, file, join(d, NAME_E_LO)), 'rc=0\n');
    });
    test(`G-T1f twin ${file}: the ${G0_SHA} root returns rc 1 on tracked "E-acute a.js (U+00C9)" asked as "e-acute a.js (U+00E9)" (red on old; ${FOLD_SKIP})`, { skip: skip || histSkip(g0Have) }, (t) => {
        const d = g0Repo(`g1f1t-${file}`, [NAME_E_UP]);
        if (!opens(join(d, NAME_E_UP), join(d, NAME_E_LO))) return t.skip(`G-T1f twin: ${FOLD_SKIP}`);
        assert.equal(g1cRc(g0Old(), file, join(d, NAME_E_LO)), 'rc=1\n');
    });
    test(`G-T1f parity ${file}: tracked NFC "e-acute.js" asked in NFD -> rc 0 on live AND on ${G0_SHA} (parity row: old already reads 0 here; ${FOLD_SKIP})`, { skip: skip || histSkip(g0Have) }, (t) => {
        const d = g0Repo(`g1f2-${file}`, [NFC_E]);
        if (!opens(join(d, NFC_E), join(d, NFD_E))) return t.skip(`G-T1f parity: ${FOLD_SKIP}`);
        assert.equal(g1cRc(ROOT, file, join(d, NFD_E)), 'rc=0\n', 'live');
        assert.equal(g1cRc(g0Old(), file, join(d, NFD_E)), 'rc=0\n', 'old');
    });
    // B3 (R3): Unicode case folds the sweep reaches by inode (no ASCII icase): Kelvin sign U+212A vs k, sharp s U+00DF vs ss. Host-gated by opens().
    const NAME_KELVIN = U('\xe2\x84\xaak.js'), NAME_KK = 'kk.js', NAME_SHARP = U('stra\xc3\x9fe.js'), NAME_STRASSE = 'strasse.js';
    for (const [lab, tr, ask] of [['Kelvin sign U+212A + "k.js"', NAME_KELVIN, NAME_KK], ['sharp s "stra" U+00DF "e.js"', NAME_SHARP, NAME_STRASSE]]) {
        test(`G-T1f ${file}: tracked ${lab} asked as "${ask}" -> rc 0 (${FOLD_SKIP})`, { skip }, (t) => {
            const d = g0Repo(`g1fu-${file}-${ask}`, [tr]);
            if (!opens(join(d, tr), join(d, ask))) return t.skip(`G-T1f ${ask}: ${FOLD_SKIP}`);
            assert.equal(g1cRc(ROOT, file, join(d, ask)), 'rc=0\n');
        });
        test(`G-T1f twin ${file}: the ${G0_SHA} root returns rc 1 on tracked ${lab} asked as "${ask}" (red on old; ${FOLD_SKIP})`, { skip: skip || histSkip(g0Have) }, (t) => {
            const d = g0Repo(`g1fut-${file}-${ask}`, [tr]);
            if (!opens(join(d, tr), join(d, ask))) return t.skip(`G-T1f twin ${ask}: ${FOLD_SKIP}`);
            assert.equal(g1cRc(g0Old(), file, join(d, ask)), 'rc=1\n');
        });
    }
    function nfdRepo(name) {   // index really holds the NFD spelling (core.precomposeunicode=false before add)
        const d = mk(name);
        git(d, ['init', '-q']); git(d, ['config', 'core.precomposeunicode', 'false']);
        writeFileSync(join(d, NFD_E), 'x\n');
        git(d, ['--literal-pathspecs', 'add', '--', NFD_E], 'add');
        return d;
    }
    test(`G-T1f ${file}: tracked NFD name (index holds NFD) asked in NFC -> rc 0 (${FOLD_SKIP})`, { skip }, (t) => {
        const d = nfdRepo(`g1f3-${file}`);
        if (!opens(join(d, NFD_E), join(d, NFC_E))) return t.skip(`G-T1f NFD: ${FOLD_SKIP}`);
        assert.equal(g1cRc(ROOT, file, join(d, NFC_E)), 'rc=0\n');
    });
    test(`G-T1f twin ${file}: the ${G0_SHA} root returns rc 1 on a tracked NFD name asked in NFC (red on old; ${FOLD_SKIP})`, { skip: skip || histSkip(g0Have) }, (t) => {
        const d = nfdRepo(`g1f3t-${file}`);
        if (!opens(join(d, NFD_E), join(d, NFC_E))) return t.skip(`G-T1f NFD twin: ${FOLD_SKIP}`);
        assert.equal(g1cRc(g0Old(), file, join(d, NFC_E)), 'rc=1\n');
    });
    for (const [label, name] of [['ASCII', 'u.js'], ['non-ASCII', U('\xc3\xb1.js')]]) {
        // G-T1g twins (spec: a git answer that is neither a clean list nor the "did not match" of the pathspec dies, never rc 1)
        test(`G-T1g twin (i) ${file}: untracked ${label} name, the sweep (plain ls-files -z) exits 1 saying "did not match" -> dies (exit 2) naming git's line, never rc 1`, { skip }, () => {
            const d = g0Repo(`g1gi-${file}-${label}`, ['k.js'], [name]);
            const c = { kind: 'err', path: join(d, name), env: { PATH: g1gShim('plain1') } };
            const r = run(ROOT, file, c, lc);
            assert.equal(verdict(c, r), null, g0rc(r));
            assert.ok(r.stderr.includes('(error: shim plain did not match)'), r.stderr);
        });
        test(`G-T1g twin (ii) ${file}: untracked ${label} name, --error-unmatch exits 1 with "fatal: shim other rc1" -> dies (exit 2) naming that line, never rc 1`, { skip }, () => {
            const d = g0Repo(`g1gii-${file}-${label}`, ['k.js'], [name]);
            const c = { kind: 'err', path: join(d, name), env: { PATH: g1gShim('unmatch1') } };
            const r = run(ROOT, file, c, lc);
            assert.equal(verdict(c, r), null, g0rc(r));
            assert.ok(r.stderr.includes('(fatal: shim other rc1)'), r.stderr);
        });
        test(`G-T1g twin (iii) ${file}: untracked ${label} name, --error-unmatch exits 128 with "fatal: shim other did not match" -> dies (exit 2) naming that line, never rc 1`, { skip }, () => {
            const d = g0Repo(`g1giii-${file}-${label}`, ['k.js'], [name]);
            const c = { kind: 'err', path: join(d, name), env: { PATH: g1gShim('unmatch128') } };
            const r = run(ROOT, file, c, lc);
            assert.equal(verdict(c, r), null, g0rc(r));
            assert.ok(r.stderr.includes('(fatal: shim other did not match)'), r.stderr);
        });
    }
    test(`G-T1g ${file}: the non-ASCII sweep (plain ls-files -z) failing with exit 128 dies (exit 2) naming git's line, never rc 1`, { skip }, () => {
        const d = g0Repo(`g1g-${file}`, ['k.js'], [NAME_E_LO]);
        const c = { kind: 'err', path: join(d, NAME_E_LO), env: { PATH: g1gShim('plain128') } };
        const r = run(ROOT, file, c, lc);
        assert.equal(verdict(c, r), null, g0rc(r));
        assert.ok(r.stderr.includes('(fatal: shim sweep failure)'), r.stderr);
    });
    test(`G-T1h ${file}: git spawns -- every name with no literal match 3 (untracked ASCII, untracked non-ASCII), a name that matched 2 (tracked ASCII, tracked non-ASCII), 0 temp files left`, { skip }, () => {
        const d = g0Repo(`g1h-${file}`, [NAME_E_LO, 'k.js'], [U('\xc3\xb1.js'), 'u.js']);
        for (const [name, want] of [['u.js', 3], [U('\xc3\xb1.js'), 3], ['k.js', 2], [NAME_E_LO, 2]]) {
            const { n, left } = shimCalls(file, { kind: 'rc', rc: 0, path: join(d, name), env: lc });
            assert.equal(n, want, `${JSON.stringify(name)}: git spawns`);
            assert.deepEqual(left, [], 'temp files left in TMPDIR');
        }
    });
    test(`G-T1i ${file}: a tracked file deleted from disk only -> rc 0; an untracked file named b@rc=0.js -> rc 1`, { skip }, () => {
        const d = g0Repo(`g1i-${file}`, ['gone.js', 'k.js'], ['b@rc=0.js']);
        rmSync(join(d, 'gone.js'));
        assert.equal(g1cRc(ROOT, file, join(d, 'gone.js')), 'rc=0\n', 'deleted tracked');
        assert.equal(g1cRc(ROOT, file, join(d, 'b@rc=0.js')), 'rc=1\n', 'untracked b@rc=0.js');
    });
}
// a PATH dir whose git fails one call and passes everything else to real git. mode 'plain128': the plain `ls-files -z` (no --error-unmatch)
// exits 128 "fatal: shim sweep failure"; 'plain1': the same call exits 1 "error: shim plain did not match"; 'unmatch1': the --error-unmatch
// ls-files exits 1 "fatal: shim other rc1"
const G1G = new Map();
function g1gShim(mode) {
    if (G1G.has(mode)) return G1G.get(mode);
    const dir = mk(`g1g-shim-${mode}`);
    for (const c of ['dirname', 'basename']) symlinkSync(which(c), join(dir, c));
    const bad = { plain128: "if [[ $plain == 1 ]]; then echo 'fatal: shim sweep failure' >&2; exit 128; fi",
        plain1: "if [[ $plain == 1 ]]; then echo 'error: shim plain did not match' >&2; exit 1; fi",
        unmatch1: "if [[ $plain == 2 ]]; then echo 'fatal: shim other rc1' >&2; exit 1; fi",
        unmatch128: "if [[ $plain == 2 ]]; then echo 'fatal: shim other did not match' >&2; exit 128; fi" }[mode];
    assert.ok(bad !== undefined, mode);
    writeFileSync(join(dir, 'git'), `#!${BASH}\nplain=0; for a in "$@"; do case "$a" in ls-files) plain=1 ;; --error-unmatch) plain=2 ;; esac; done\n` +
        `${bad}\nexec '${which('git')}' "$@"\n`);
    chmodSync(join(dir, 'git'), 0o755);
    G1G.set(mode, dir);
    return dir;
}
