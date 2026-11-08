// test/bytecode-budget-stage.test.mjs -- QA rows for ../bytecode-budget.sh ref + file staging (P2G2 group 2b, batch B3).
// Oracle: PLAN-phase2-g2b.md ASSERTIONS A2 (verdicts), A3 (refusals, incl. addendum A3), A4 (retention), not the code.
// Every A2/A3 row also runs on the pre-staging build (`git show 3b2209a:bytecode-budget.sh`, sha256/8 9173830d), where
// it must exit 2 "unknown option --before(-ref)"; the mutant rows M7..M13, M-stage-order, M-git-env,
// M-relimport-sibling-staged, M-relimport-sibling-staged-file are exact-once
// string edits of a copy of the built script, each red for the reason named in its row.
// The fake node prints the staged ./mod.js minus its import lines as the bytecode length (exit 1 ERR_MODULE_NOT_FOUND
// if an `import './X'` sibling is absent from its cwd), so the module BYTES decide the verdict:
// expected values are hand-derived from the fixture contents (r1 = 211, r2 = 212), not from running the script.
// A5 (self-test counts) rows are at the end of this file (they use the B2 check names).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, existsSync, linkSync, statSync, symlinkSync, realpathSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (afterEach runs before its own
// test's report, so it would lose the last pass; proven by test/death-signature.test.mjs teeth, b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'bytecode-budget.sh');
const FIX = join(HERE, 'fixtures', 'bytecode-budget', 'node-26.8.2');
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
const haveGit = spawnSync('git', ['--version']).status === 0;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : (haveGit ? false : 'git not available');
const GITC = ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false'];

function cleanEnv() {   // the child env: none of the 6 GIT_* location vars nor an editor, global/system git config off
    const e = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    for (const k of [...GITVARS, 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete e[k];
    return e;
}
function git(cwd, ...a) {
    const r = spawnSync('git', [...GITC, ...a], { cwd, encoding: 'utf8', env: cleanEnv() });
    assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
}
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

// ---- shared read-only fixtures: repo (tags r1 = 211, r2 = 212; HEAD = r2), another repo, drivers, a frozen copy ----
const ROOT = mkdtempSync(join(tmpdir(), 'bbs-root-'));
after(() => rmSync(ROOT, { recursive: true, force: true }));
const REPO = join(ROOT, 'repo'), OTHER = join(ROOT, 'other');
const TRACKED = join(REPO, 'src', 'mod.js');          // tracked in REPO, content 212 (HEAD = r2)
const DRV = join(ROOT, 'drv', 'driver.mjs');          // imports './mod.js'
const DRV_NOIMP = join(ROOT, 'drv', 'noimport.mjs');  // does not
const DRV_SAMENAME = join(ROOT, 'drv2', 'mod.js');    // same file name as the module
const FROZEN = join(ROOT, 'frozen', 'mod.js');        // untracked, 211
let REPO_OK = false;
if (!skip) try {
    mkdirSync(join(REPO, 'src'), { recursive: true }); mkdirSync(OTHER); mkdirSync(join(ROOT, 'drv')); mkdirSync(join(ROOT, 'drv2')); mkdirSync(join(ROOT, 'frozen'));
    git(REPO, 'init', '-q');
    writeFileSync(TRACKED, '211\n'); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r1'); git(REPO, 'tag', 'r1');
    writeFileSync(TRACKED, '212\n'); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r2'); git(REPO, 'tag', 'r2');
    git(OTHER, 'init', '-q'); writeFileSync(join(OTHER, 'x.txt'), 'x\n'); git(OTHER, 'add', '.'); git(OTHER, 'commit', '-q', '-m', 'o');
    writeFileSync(DRV, "import './mod.js';\n"); writeFileSync(DRV_NOIMP, "import './other.js';\n"); writeFileSync(DRV_SAMENAME, "import './mod.js';\n");
    writeFileSync(FROZEN, '211\n');
    REPO_OK = true;
} catch (e) { rmSync(ROOT, { recursive: true, force: true }); throw e; }

// ---- the pre-staging build (teeth) ----
const baseSrc = spawnSync('git', ['-C', join(HERE, '..'), 'show', '3b2209a:bytecode-budget.sh'], { env: cleanEnv() });
const haveBase = baseSrc.status === 0 ? true : 'git show 3b2209a:bytecode-budget.sh failed (shallow clone or no git history)';
let BASE = null;
if (haveBase === true) {
    if (sha8(baseSrc.stdout) !== '9173830d') { rmSync(ROOT, { recursive: true, force: true }); assert.fail('pre-staging base is not 9173830d'); }
    BASE = join(ROOT, 'base-9173830d.sh');
    writeFileSync(BASE, baseSrc.stdout); chmodSync(BASE, 0o755);
}
// CI=true (GitHub Actions): a history row whose commit is missing FAILS instead of skipping; locally it skips with
// the reason. One spelling for every history row of this file.
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (have) => { if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`); };
const baseSkip = skip || histSkip(haveBase);

// ---- mutants: exact-once edits of a copy of the built script ----
function variant(name, edits) {
    let src = readFileSync(SCRIPT, 'utf8');
    for (const [from, to] of edits) {
        const n = src.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}: ${from}`);
        src = src.replace(from, () => to);
    }
    const p = join(ROOT, `${name}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return p;
}

// ---- one case = one fresh dir: fake node (counts spawns, prints ./mod.js minus its import lines as the length, exits 1 on a missing import sibling), tmp, cwd, live file, OUT path ----
function mkCase() {
    const dir = mkdtempSync(join(ROOT, 'c-'));
    const log = join(dir, 'argv.log'), calls = join(dir, 'calls');
    const node = join(dir, 'node');
    writeFileSync(node, `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) echo v26.8.2; exit 0 ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
n=$(( $(cat ${JSON.stringify(calls)} 2>/dev/null || echo 0) + 1 )); echo "$n" > ${JSON.stringify(calls)}
# matches only a column-0, single-quoted import './X'; line (not import x from './a.js') of ./mod.js; a sibling absent from cwd (the staged dir) exits 1 like real node
for imp in $(sed -n "s/^import '\\.\\/\\([^']*\\)';.*/\\1/p" ./mod.js); do
  [ -e "./$imp" ] || { echo "Error [ERR_MODULE_NOT_FOUND]: Cannot find module './$imp'" >&2; exit 1; }
done
len=$(grep -v '^import' ./mod.js | tr -d ' \\n')
if [ -n "\${FAKE_LIVE:-}" ] && [ "$n" = "\${FAKE_AT:-0}" ]; then printf '212\\n' > "$FAKE_LIVE"; fi
printf '[generated bytecode for function: %s (0x1 <SharedFunctionInfo %s>)]\\nBytecode length: %s\\nParameter count 1\\n' "$fn" "$fn" "$len"
`);
    chmodSync(node, 0o755);
    const c = { dir, node, tmp: join(dir, 'tmp'), cwd: join(dir, 'cwd'), live: join(dir, 'live', 'mod.js'), out: join(dir, 'out') };
    mkdirSync(c.tmp); mkdirSync(c.cwd); mkdirSync(join(dir, 'live'));
    writeFileSync(c.live, '211\n');
    c.spawns = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    return c;
}
function runOn(script, cs) {
    const c = mkCase();
    try {
        if (cs.prep) cs.prep(c);
        const env = { ...cleanEnv(), TMPDIR: c.tmp, ...(cs.env ? cs.env(c) : {}) };
        const r = capSync('bash', [script, ...cs.args(c)], { encoding: 'utf8', cwd: c.cwd, env }, 120000,
            'bytecode-budget.sh (stage row)');
        return { c, r };
    } finally { try { chmodSync(c.out,
        0o755); } catch { /* G-SHL3 R9: an OUT locked to 0555 must stay removable */ } }
}
// ordered option sets (key order is argv order, so the staged option comes first: the pre-staging build dies on it)
function flat(o) { const a = []; for (const [k, v] of Object.entries(o)) if (v !== null) a.push(k, v); return a; }
const COMMON = (c, fn = 'mid') => ['--diff', '--node', c.node, '--fn', fn, '--runs', '2'];
const refO = (c, over = {}, fn) => [...flat({ '--before-ref': 'r1', '--after-ref': 'r2', '--module': 'src/mod.js', '--driver': DRV, '--repo': REPO, '--out': c.out, ...over }), ...COMMON(c, fn)];
const fileO = (c, over = {}, fn) => [...flat({ '--before': FROZEN, '--after': c.live, '--driver': DRV, '--out': c.out, ...over }), ...COMMON(c, fn)];

// ---- a row = cases + a check; registered on the final build AND (teeth) on the pre-staging build ----
const TWIN = /unknown option --before(-ref)?\b/;
function row(name, cs) {
    test(`bytecode-budget stage: ${name}`, { skip }, () => {
        const { c, r } = runOn(SCRIPT, cs);
        cs.check(c, r);
    });
    test(`bytecode-budget stage teeth: [${name}] exits 2 'unknown option --before(-ref)' on the 9173830d build`, { skip: baseSkip }, () => {
        histGate(haveBase);
        const { c, r } = runOn(BASE, cs);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stderr, cs.twin || TWIN);
        assert.throws(() => cs.check(c, r), assert.AssertionError, 'the row check must be red on the pre-staging build');
    });
}
const msg = (r) => `rc=${r.status}\n${r.stdout}${r.stderr}`;
function refuses(rx) {   // A3: exit 2, the reason, 0 node spawns, OUT not created
    return (c, r) => {
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stderr, rx, msg(r));
        assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
        assert.ok(!existsSync(c.out), 'OUT was created');
    };
}
function refusal(name, args, rx, extra = {}) {
    const cs = { args, check: refuses(rx), ...extra };
    row(`A3 refusal: ${name}`, cs);
    return cs;
}

// =====================================================================================================
// A2 verdicts (fake node, --runs 2)
// =====================================================================================================
const CNT_B = '\n    before=1 after=0  211\n', CNT_A = '\n    before=0 after=1  212\n';
const R_DIFF = { args: (c) => refO(c), check: (c, r) => {
    assert.equal(r.status, 1, msg(r));                                   // red on M7: before staged from AFTER_REF -> 0
    assert.ok(r.stdout.includes(CNT_B) && r.stdout.includes(CNT_A), msg(r));
    assert.match(r.stdout, /^VERDICT DIFF$/m);
    assert.doesNotMatch(r.stdout, /^NOTE .*byte-identical/m, msg(r));
    assert.match(r.stdout, /^mode    diff \(ref\) /m, msg(r));
    assert.equal(c.spawns().length, 7);                                  // --version, 2 x --v8-options (the --v8-flags allowlist, then the limits), 1 fn x 2 runs x 2 sides
} };
row('A2 ref r1(211) | r2(212) -> exit 1 DIFF with "    before=1 after=0  211"', R_DIFF);
const R_SAME = { args: (c) => refO(c, { '--after-ref': 'r1' }), check: (c, r) => {
    assert.equal(r.status, 0, msg(r));
    assert.match(r.stdout, /^VERDICT SAME$/m);
    assert.match(r.stdout, /^NOTE .*byte-identical.*null control/m, msg(r));
} };
row('A2 ref r1 | r1 -> exit 0 SAME plus the null-control NOTE', R_SAME);
const F_LIVE = {
    args: (c) => fileO(c), env: (c) => ({ FAKE_LIVE: c.live, FAKE_AT: '3' }),
    check: (c, r) => {
        assert.equal(readFileSync(c.live, 'utf8'), '212\n', 'the fake did not rewrite the live --after at call 3');
        assert.equal(r.status, 0, msg(r));                               // red on M8 (cp -> ln -s): exit 2, after: null control
        assert.match(r.stdout, /^VERDICT SAME$/m);
        assert.match(r.stdout, /^mode    diff \(file\) /m, msg(r));
        assert.equal(readFileSync(join(c.out, 'stage', 'after', 'mod.js'), 'utf8'), '211\n');
    },
};
row('A2 file frozen 211 | live 211, the live --after rewritten to 212 at bytecode call 3 -> exit 0 (the staged copy protects it)', F_LIVE);
row('A2 staged --fn add,mid,dup -> exactly 15 node spawns (3 + 3 fns x 2 runs x 2 sides)', {
    args: (c) => refO(c, {}, 'add,mid,dup'),
    check: (c, r) => { assert.equal(r.status, 1, msg(r)); assert.equal(c.spawns().length, 15, c.spawns().join('\n')); },
});

// =====================================================================================================
// A4 (MD-46 G3, ruling MD-57 as amended by Q-BB3 / G-ORDER): before the spawns bb's --out block writes only an empty
// raw/ and a 0-byte report.txt; stage/ and raw/before + raw/after are made only after --version, the --v8-flags
// allowlist read and the version check. So a refusal in ref or file mode leaves OUT = {raw/ (empty), report.txt
// (0 bytes)}, no stage/, after exactly [--version, --v8-options]: exit 2, the frozen lib/v8flags.sh die line, 0 stdout bytes.
for (const mode of ['ref', 'file']) {
    row(`A4 ${mode} mode --v8-flags --bogus-flag -> exit 2 die after [--version, --v8-options]; OUT = empty raw/ + 0-byte report.txt (no stage/, no raw/before, raw/after)`, {
        args: (c) => [...(mode === 'ref' ? refO(c) : fileO(c)), '--v8-flags', '--bogus-flag'],
        check: (c, r) => {
            assert.equal(r.status, 2, msg(r));
            assert.equal(r.stderr, "bytecode-budget: --v8-flags must not set --bogus-flag: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)\nVERDICT NO-VERDICT\n");
            assert.equal(r.stdout, '');
            assert.deepEqual(c.spawns(), ['--version', '--v8-options']);
            assert.deepEqual(walk(c.out).map((x) => x.slice(c.out.length + 1)).sort(), ['report.txt']);
            assert.deepEqual(readdirSync(c.out).sort(), ['raw', 'report.txt']);   // G-ORDER: no stage/ before the spawns
            assert.deepEqual(readdirSync(join(c.out, 'raw')), []);
            assert.equal(readFileSync(join(c.out, 'report.txt'), 'utf8'), '');
        },
    });
}

// A3 refusals: exit 2, 0 spawns, OUT not created -- the stage_check / options cases (tasks 1-2)
// =====================================================================================================
refusal('--before-ref without --after-ref', (c) => refO(c, { '--after-ref': null }), /go together/);
refusal('--after-ref without --before-ref (put first)', (c) => refO(c, { '--before-ref': null, '--after-ref': 'r2' }), /go together/, { twin: /unknown option --after-ref/ });
refusal('--before without --after', (c) => fileO(c, { '--after': null }), /go together/);
refusal('ref and file options together', (c) => refO(c, { '--before': FROZEN, '--after': c.live }), /exclusive/);
refusal('a positional DRIVER path in staged mode', (c) => [...refO(c), DRV], /takes no DRIVER/);
refusal('an empty --out', (c) => refO(c, { '--out': '' }), /--out/);
const CS_NODRV = refusal('no --driver (ref)', (c) => refO(c, { '--driver': null }), /mode needs --driver/);
refusal('--driver is not a readable file', (c) => refO(c, { '--driver': join(ROOT, 'drv', 'nosuch.mjs') }), /--driver not found/);
refusal('GIT_DIR set', (c) => refO(c), /GIT_DIR/, { env: () => ({ GIT_DIR: join(OTHER, '.git') }) });
refusal('GIT_WORK_TREE set', (c) => refO(c), /GIT_WORK_TREE/, { env: () => ({ GIT_WORK_TREE: OTHER }) });
const CS_NOMOD = refusal('ref mode: no --module', (c) => refO(c, { '--module': null }), /needs --module/);
const CS_ABSMOD = refusal('ref mode: absolute --module', (c) => refO(c, { '--module': TRACKED }), /must be relative/);
refusal('ref mode: --module with a .. segment', (c) => refO(c, { '--module': 'src/../src/mod.js' }), /--module/);
refusal('ref mode: --module with a . segment', (c) => refO(c, { '--module': 'src/./mod.js' }), /--module/);
refusal('ref mode: --module with an empty segment', (c) => refO(c, { '--module': 'src//mod.js' }), /--module/);
refusal('ref mode: --repo is not a repo', (c) => refO(c, { '--repo': ROOT }), /--repo/);
refusal('ref mode: --before-ref is not a commit', (c) => refO(c, { '--before-ref': 'nosuchref' }), /nosuchref|not a commit/);
refusal('ref mode: --after-ref is not a commit', (c) => refO(c, { '--after-ref': 'nosuchref' }), /nosuchref|not a commit/);
refusal('ref mode: --module absent at the ref', (c) => refO(c, { '--module': 'src/nope.js' }), /no file|nope/);
refusal('ref mode: --module is a directory (tree), not a blob', (c) => refO(c, { '--module': 'src' }), /has no file src/);
refusal('file mode: --module given', (c) => fileO(c, { '--module': 'src/mod.js' }), /--module/);
refusal('file mode: --before is not a readable file', (c) => fileO(c, { '--before': join(ROOT, 'frozen', 'nosuch.js') }), /--before not found/);
refusal('file mode: --after is not a readable file', (c) => fileO(c, { '--after': join(ROOT, 'live-nosuch', 'mod.js') }), /--after/);
refusal('module and driver have the same file name', (c) => refO(c, { '--driver': DRV_SAMENAME }), /same file name/);
refusal('staged options without --diff', (c) => refO(c).filter((a) => a !== '--diff'), /--diff/);
refusal('--driver without a staged mode', (c) => ['--driver', DRV, ...COMMON(c), DRV, DRV], /go only with/, { twin: /unknown option --driver/ });
refusal('--repo without a staged mode', (c) => ['--repo', REPO, ...COMMON(c), DRV, DRV], /go only with/, { twin: /unknown option --repo/ });
const CS_MODONLY = refusal('--module without a staged mode', (c) => ['--module', 'src/mod.js', ...COMMON(c), DRV, DRV], /go only with/, { twin: /unknown option --module/ });
const CS_DASHREF = refusal('ref mode: --before-ref starting with -', (c) => refO(c, { '--before-ref': '-r1' }), /must not start with/);
const CS_NOOUT = refusal('no --out says "needs --out" (red on M13)', (c) => refO(c, { '--out': null }), /needs --out/);
const CS_NOIMP = refusal('a driver without the import of ./mod.js (red on M9)', (c) => refO(c, { '--driver': DRV_NOIMP }), /--driver must import/);
const CS_TRACKED = refusal('a tracked --before (red on M10, refuse_live deleted)', (c) => fileO(c, { '--before': TRACKED }), /git-tracked/);
const CS_HLINK = refusal('a renamed nested hard link to --after (red on M11, the -ef check deleted)',
    (c) => fileO(c, { '--before': join(c.dir, 'x', 'y', 'other.js') }), /are the same file/,
    { prep: (c) => { mkdirSync(join(c.dir, 'x', 'y'), { recursive: true }); linkSync(c.live, join(c.dir, 'x', 'y', 'other.js')); } });
const CS_GITDIR = refusal('GIT_DIR set to another repo + a tracked --before (red on M12)', (c) => fileO(c, { '--before': TRACKED }), /GIT_DIR/,
    { env: () => ({ GIT_DIR: join(OTHER, '.git') }) });
// addendum A3 (b): each location var set to a MISSING path (or the ceiling at the repo top), + a tracked --before
const CS_ENV = [
    ['GIT_INDEX_FILE', () => ({ GIT_INDEX_FILE: join(ROOT, 'no-such-index') })],
    ['GIT_OBJECT_DIRECTORY', () => ({ GIT_OBJECT_DIRECTORY: join(ROOT, 'no-such-objects') })],
    ['GIT_COMMON_DIR', () => ({ GIT_COMMON_DIR: join(ROOT, 'no-such-common') })],
    ['GIT_CEILING_DIRECTORIES', () => ({ GIT_CEILING_DIRECTORIES: REPO })],   // --before is in the subdirectory src/
].map(([v, env]) => [v, refusal(`${v} set + a tracked --before (red when the env refusal is cut back to GIT_DIR/GIT_WORK_TREE)`, (c) => fileO(c, { '--before': TRACKED }), new RegExp(v), { env })]);
// addendum A3 (a): the stage-not-empty refusal fires before any disk write
const CS_STAGE = {
    args: (c) => refO(c),
    prep: (c) => { mkdirSync(join(c.out, 'stage'), { recursive: true }); writeFileSync(join(c.out, 'stage', 'junk'), 'j\n'); writeFileSync(join(c.out, 'report.txt'), 'old\n'); },
    check: (c, r) => {
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stderr, /not empty/, msg(r));
        assert.equal(c.spawns().length, 0);
        assert.equal(statSync(join(c.out, 'report.txt')).size, 4, 'old report.txt was truncated');
        assert.ok(!existsSync(join(c.out, 'raw')), 'raw/ was created');
        assert.equal(readFileSync(join(c.out, 'stage', 'junk'), 'utf8'), 'j\n');
    },
};
row('A3 refusal: OUT holding stage/junk and a 4-byte report.txt -> exit 2, 0 spawns, report.txt still 4 bytes, no raw/', CS_STAGE);

// G-STAGE (PLAN-b42-gstage A1). D1: --driver DIR/L/../driver.mjs with L -> DIR/real/sub. The kernel reads DIR/real/driver.mjs
// (it imports ./mod.js); bash's logical cd would stage the decoy DIR/driver.mjs. Refused in both modes; the frozen 943bed4
// root stages the decoy and runs (exit 1 DIFF), so the row is red there (revert log: evidence/b44-gstage-b3/).
const DECOY = "import './mod.js';\n// decoy\n";
const d1Prep = (c) => {
    mkdirSync(join(c.dir, 'real', 'sub'), { recursive: true }); symlinkSync(join(c.dir, 'real', 'sub'), join(c.dir, 'L'));
    writeFileSync(join(c.dir, 'real', 'driver.mjs'), "import './mod.js';\n"); writeFileSync(join(c.dir, 'driver.mjs'), DECOY);
};
const d1Drv = (c) => join(c.dir, 'L') + '/../driver.mjs';   // path.join would resolve the '..' lexically
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const onceIn = (s, needle) => s.split(needle).length - 1;
function refusesOnce(rx, needle) {   // refuses(rx) + the die line exactly once + TMPDIR left empty
    const base = refuses(rx);
    return (c, r) => { base(c, r); assert.equal(onceIn(r.stderr, needle), 1, msg(r)); assert.deepEqual(readdirSync(c.tmp), [], 'TMPDIR kept entries'); };
}
const D1_RX = (c) => new RegExp(`^bytecode-budget: --driver: cannot resolve the directory of ${reEsc(d1Drv(c))} \\(a symlink before '\\.\\.'\\?\\)$`, 'm');
const d1Row = (mode) => ({ prep: d1Prep, args: (c) => (mode === 'ref' ? refO(c, { '--driver': d1Drv(c) }) : fileO(c, { '--driver': d1Drv(c) })),
    check: (c, r) => refusesOnce(D1_RX(c), 'cannot resolve the directory')(c, r) });
const CS_D1_REF = d1Row('ref'), CS_D1_FILE = d1Row('file');
row('A3 refusal: G-STAGE D1 ref mode --driver DIR/L/../driver.mjs (L a symlink to DIR/real/sub; decoy DIR/driver.mjs) -> exit 2 "cannot resolve the directory" once, 0 spawns, no OUT, TMPDIR empty', CS_D1_REF);
row('A3 refusal: G-STAGE D1 file mode, same decoy layout -> exit 2 "cannot resolve the directory" once, 0 spawns, no OUT, TMPDIR empty', CS_D1_FILE);
// D6: a module and a driver equal up to ASCII case (one file on a case-insensitive FS) are refused on every host
const D6_RX = (m, d) => new RegExp(`^bytecode-budget: the module and --driver have the same file name up to case \\(${reEsc(m)} / ${reEsc(d)}\\): rename the driver$`, 'm');
const CS_D6_REF = { prep: (c) => { mkdirSync(join(c.dir, 'dk')); writeFileSync(join(c.dir, 'dk', 'Mod.js'), "import './mod.js';\n"); },
    args: (c) => refO(c, { '--driver': join(c.dir, 'dk', 'Mod.js') }), check: (c, r) => refusesOnce(D6_RX('mod.js', 'Mod.js'), 'up to case')(c, r) };
const CS_D6_FILE = {
    prep: (c) => {
        for (const d of ['fz', 'up', 'dl']) mkdirSync(join(c.dir, d));
        writeFileSync(join(c.dir, 'fz', 'MID.TXT'), '211\n'); writeFileSync(join(c.dir, 'up', 'MID.TXT'), '212\n'); writeFileSync(join(c.dir, 'dl', 'mid.txt'), "import './MID.TXT';\n");
    },
    args: (c) => fileO(c, { '--before': join(c.dir, 'fz', 'MID.TXT'), '--after': join(c.dir, 'up', 'MID.TXT'), '--driver': join(c.dir, 'dl', 'mid.txt') }),
    check: (c, r) => refusesOnce(D6_RX('MID.TXT', 'mid.txt'), 'up to case')(c, r),
};
row('A3 refusal: G-STAGE D6 ref mode module mod.js with --driver Mod.js -> exit 2 "same file name up to case (mod.js / Mod.js)" once, 0 spawns, no OUT', CS_D6_REF);
row('A3 refusal: G-STAGE D6 file mode --after MID.TXT with --driver mid.txt -> exit 2 "same file name up to case (MID.TXT / mid.txt)" once, 0 spawns, no OUT', CS_D6_FILE);

// the -h / CHANGELOG claim "a module with relative imports of its own fails closed (its driver exits non-zero: NO-VERDICT)".
// The fake node emulates module resolution against its cwd (the staged dir), so a sibling that was not staged is ERR_MODULE_NOT_FOUND.
const IMP_MOD = "import './helper.js';\n211\n";
const relImp = (mode) => ({
    args: (c) => (mode === 'ref' ? refO(c, { '--driver': join(c.dir, 'drvr', 'driver.mjs'), '--repo': join(c.dir, 'repo') }) : fileO(c, { '--before': join(c.dir, 'frozen', 'mod.js'), '--driver': join(c.dir, 'drvr', 'driver.mjs') })),
    prep: (c) => {
        mkdirSync(join(c.dir, 'drvr')); writeFileSync(join(c.dir, 'drvr', 'driver.mjs'), "import './mod.js';\n"); writeFileSync(join(c.dir, 'drvr', 'helper.js'), 'export {};\n');
        if (mode === 'ref') {
            const repo = join(c.dir, 'repo'); mkdirSync(join(repo, 'src'), { recursive: true }); git(repo, 'init', '-q');
            writeFileSync(join(repo, 'src', 'mod.js'), IMP_MOD); writeFileSync(join(repo, 'src', 'helper.js'), 'export {};\n');
            git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'r1'); git(repo, 'tag', 'r1'); git(repo, 'tag', 'r2');
        } else {
            mkdirSync(join(c.dir, 'frozen')); writeFileSync(join(c.dir, 'frozen', 'mod.js'), IMP_MOD); writeFileSync(c.live, IMP_MOD);
            writeFileSync(join(c.dir, 'frozen', 'helper.js'), 'export {};\n'); writeFileSync(join(c.dir, 'live', 'helper.js'), 'export {};\n');
        }
    },
    check: (c, r) => {
        assert.equal(r.status, 2, msg(r));                                              // NO-VERDICT
        assert.match(r.stdout, /^VERDICT NO-VERDICT$/m, msg(r));
        assert.match(r.stdout, /^ {2}mid: NO-VERDICT -- before: driver exited 1 in run 1$/m, msg(r));
        assert.match(r.stdout, /^ {2}mid: NO-VERDICT -- after: driver exited 1 in run 1$/m, msg(r));
        assert.equal(c.spawns().length, 7, c.spawns().join('\n'));                      // diff-mode spawn count: --version, 2 x --v8-options (allowlist, limits), 1 fn x 2 runs x 2 sides
        assert.ok(!existsSync(join(c.out, 'stage', 'before', 'helper.js')), 'the sibling was staged');
    },
});
const CS_RELIMP_REF = relImp('ref'), CS_RELIMP_FILE = relImp('file');
row('a module with a relative import fails closed (ref mode): exit 2, NO-VERDICT, the sibling is not staged', CS_RELIMP_REF);
row('a module with a relative import fails closed (file mode): exit 2, NO-VERDICT, the sibling is not staged', CS_RELIMP_FILE);

// =====================================================================================================
// mutants: each must be red for the stated reason (the observed rc / output goes to the test diagnostics)
// =====================================================================================================
function mutant(name, anchorDesc, edits, cs, observe) {
    test(`bytecode-budget stage MUTANT ${name} (${anchorDesc}): its row goes red`, { skip: skip || (name === 'M13' && process.getuid && process.getuid() === 0 ? 'M13 would write /stage as root' : false) }, (t) => {
        const p = variant(name, edits);
        const { c, r } = runOn(p, cs);
        t.diagnostic(`${name}: rc=${r.status} stdout=${JSON.stringify(r.stdout.split('\n').filter((l) => /VERDICT|NOTE|before=|null control|NO-VERDICT/.test(l)))} stderr=${JSON.stringify(r.stderr.trim().slice(0, 160))}`);
        assert.throws(() => cs.check(c, r), assert.AssertionError, `${name}: the row still passes on the mutant`);
        observe(c, r);
    });
}
mutant('M7', 'before staged from AFTER_REF: x="$STAGE_SHA_B" -> x="$STAGE_SHA_A"', [['x="$STAGE_SHA_B"', 'x="$STAGE_SHA_A"']], R_DIFF,
    (c, r) => { assert.equal(r.status, 0, msg(r)); assert.ok(!r.stdout.includes(CNT_B), msg(r)); });
mutant('M8', 'staged copy is a symlink: cp -- "$x" -> ln -s -- "$x"', [['cp -- "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"', 'ln -s -- "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"']], F_LIVE,
    (c, r) => { assert.equal(r.status, 2, msg(r)); assert.match(r.stdout, /after: null control/, msg(r)); });
mutant('M9', 'driver import check turned into a comment', [['|| die "--driver must import', '|| : #']], CS_NOIMP,
    (c, r) => { assert.notEqual(r.status, 2, msg(r)); assert.doesNotMatch(r.stderr, /--driver must import/); });
mutant('M10', 'refuse_live "$BEFORE_FILE" --before deleted', [['refuse_live "$BEFORE_FILE" --before', ':']], CS_TRACKED,
    (c, r) => { assert.equal(r.status, 1, msg(r)); assert.doesNotMatch(r.stderr, /git-tracked/); });
mutant('M11', 'the -ef same-file check deleted', [['[[ ! "$BEFORE_FILE" -ef "$AFTER_FILE" ]] || die "--before and --after are the same file', ': || die "--before and --after are the same file']], CS_HLINK,
    (c, r) => { assert.equal(r.status, 0, msg(r)); assert.doesNotMatch(r.stderr, /same file/); });
// G-STAGE A1 mutants: M-ef-off (the D1 -ef refusal off: the decoy driver is staged), M-nocase (the D6 fold refusal off)
const M_EF_OFF = [['[[ "$STAGE_DRIVER" -ef "$DRIVER" ]] || die "--driver: cannot resolve', 'true || die "--driver: cannot resolve']];
mutant('M-ef-off', 'the D1 -ef refusal -> true', M_EF_OFF, CS_D1_REF,
    (c, r) => { assert.doesNotMatch(r.stderr, /cannot resolve/, msg(r)); assert.equal(readFileSync(join(c.out, 'stage', 'before', 'driver.mjs'), 'utf8'), DECOY, 'the decoy was not staged'); });
mutant('M-ef-off-file', 'the D1 -ef refusal -> true', M_EF_OFF, CS_D1_FILE,
    (c, r) => { assert.doesNotMatch(r.stderr, /cannot resolve/, msg(r)); assert.equal(readFileSync(join(c.out, 'stage', 'after', 'driver.mjs'), 'utf8'), DECOY, 'the decoy was not staged'); });
const M_NOCASE = [['|| die "the module and --driver have the same file name up to case', '|| : "the module and --driver have the same file name up to case']];
// on a case-folding FS the (ii) belt in stage_write still stops the pair (exit 2, its own line); elsewhere the run goes on
mutant('M-nocase', 'the D6 case-fold refusal -> a no-op', M_NOCASE, CS_D6_REF, (c, r) => { assert.doesNotMatch(r.stderr, /up to case/, msg(r)); });
mutant('M-nocase-file', 'the D6 case-fold refusal -> a no-op', M_NOCASE, CS_D6_FILE, (c, r) => { assert.doesNotMatch(r.stderr, /up to case/, msg(r)); });
mutant('M-relimport-sibling-staged', 'stage_write also copies helper.js from the driver dir', [['cp -- "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"', 'cp -- "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"; cp "$(dirname "$STAGE_DRIVER")/helper.js" "$dir/" 2>/dev/null || true']], CS_RELIMP_REF,
    (c, r) => { assert.notEqual(r.status, 2, msg(r)); assert.ok(existsSync(join(c.out, 'stage', 'before', 'helper.js'))); });
mutant('M-relimport-sibling-staged-file', 'same edit, file mode', [['cp -- "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"', 'cp -- "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"; cp "$(dirname "$STAGE_DRIVER")/helper.js" "$dir/" 2>/dev/null || true']], CS_RELIMP_FILE,
    (c, r) => { assert.notEqual(r.status, 2, msg(r)); assert.ok(existsSync(join(c.out, 'stage', 'before', 'helper.js'))); });
const ENV_ALL = '[[ -z "${GIT_DIR+x}${GIT_WORK_TREE+x}${GIT_INDEX_FILE+x}${GIT_OBJECT_DIRECTORY+x}${GIT_COMMON_DIR+x}${GIT_CEILING_DIRECTORIES+x}" ]] ||';
mutant('M12', 'the whole GIT_* env refusal deleted', [[ENV_ALL, 'true ||']], CS_GITDIR,
    (c, r) => { assert.equal(r.status, 1, msg(r)); assert.doesNotMatch(r.stderr, /GIT_DIR/); });   // tracked before read as untracked
mutant('M13', 'the "needs --out" refusal deleted', [['[[ -n "$OUT" ]] || die "$STAGE_MODE mode needs --out DIR', 'true || die "$STAGE_MODE mode needs --out DIR']], CS_NOOUT,
    (c, r) => { assert.doesNotMatch(r.stderr, /needs --out/, msg(r)); });
// G-STAGE G3 (A1): the stage check also refuses an unreadable / unwritable / unsearchable OUT/stage (one line, lib/stage.sh)
const STAGE_CHK = '{ [[ ! -e "$OUT/stage" ]] || { [[ -r "$OUT/stage" && -w "$OUT/stage" && -x "$OUT/stage" ]] && [[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]; }; } || die "--out: $OUT/stage is not empty (give a new or empty DIR)"';
mutant('M-stage-order', 'the stage-not-empty check moved back after the --out block', [
    [STAGE_CHK, ':'],
    ['if [[ $STAGED == 1 ]]; then\n  stage_write', `if [[ $STAGED == 1 ]]; then\n  ${STAGE_CHK}\n  stage_write`],
], CS_STAGE, (c, r) => {
    assert.equal(r.status, 2, msg(r));   // still refused, but only after the --out block touched OUT
    assert.ok(statSync(join(c.out, 'report.txt')).size !== 4 || existsSync(join(c.out, 'raw')), 'neither truncated report.txt nor raw/');
});

// reviewer round: own-reason messages, the -h claims (--module outside staged mode, a ref starting with -, MODE text, NOTE only when identical)
mutant('G2-needs-driver', 'message "mode needs --driver" reworded', [['mode needs --driver FILE', 'mode wants a driver FILE']], CS_NODRV, (c, r) => { assert.equal(r.status, 2, msg(r)); assert.doesNotMatch(r.stderr, /mode needs --driver/); });
mutant('G2-needs-module', 'message "needs --module" reworded', [['ref mode needs --module REL', 'ref mode wants a module REL']], CS_NOMOD, (c, r) => { assert.equal(r.status, 2, msg(r)); assert.doesNotMatch(r.stderr, /needs --module/); });
mutant('G2-must-be-relative', 'message "must be relative" reworded', [['--module must be relative to the repo root', '--module is not under the repo root']], CS_ABSMOD, (c, r) => { assert.equal(r.status, 2, msg(r)); assert.doesNotMatch(r.stderr, /must be relative/); });
mutant('U1', 'MODULE dropped from -z "$DRIVER$MODULE$REPO"', [['-z "$DRIVER$MODULE$REPO"', '-z "$DRIVER$REPO"']], CS_MODONLY, (c, r) => { assert.doesNotMatch(r.stderr, /go only with/, msg(r)); });
mutant('U2', '[[ "$ref" != -* ]] || die -> true || die', [['[[ "$ref" != -* ]] || die', 'true || die']], CS_DASHREF, (c, r) => { assert.doesNotMatch(r.stderr, /must not start with/, msg(r)); });
mutant('U3', 'MODE="diff ($STAGE_MODE)" -> MODE="diff"', [['MODE="diff ($STAGE_MODE)"', 'MODE="diff"']], R_DIFF, (c, r) => { assert.equal(r.status, 1, msg(r)); assert.doesNotMatch(r.stdout, /^mode    diff \(ref\)/m); });
mutant('STAGE_SAME-forced-1', 'else STAGE_SAME=0 -> else STAGE_SAME=1', [['else STAGE_SAME=0; fi', 'else STAGE_SAME=1; fi']], R_DIFF, (c, r) => { assert.equal(r.status, 1, msg(r)); assert.match(r.stdout, /^NOTE .*byte-identical/m); });
for (const [v, cs] of CS_ENV) {
    mutant(`M-git-env-${v}`, 'env refusal cut back to GIT_DIR / GIT_WORK_TREE',
        [['${GIT_INDEX_FILE+x}${GIT_OBJECT_DIRECTORY+x}${GIT_COMMON_DIR+x}${GIT_CEILING_DIRECTORIES+x}', '']], cs,
        (c, r) => { assert.doesNotMatch(r.stderr, new RegExp(`${v}.*is set`), msg(r)); assert.notEqual(r.status, 2, `${v} + tracked --before still refused (fail-closed by another check): ${msg(r)}`); });
}

// =====================================================================================================
// A4 retention: 20 ref runs, each into a new --out. The budget is spawns and files (no GC in bash, S-12).
// =====================================================================================================
function walk(d) { return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])); }
const repoState = () => ({ head: git(REPO, 'rev-parse', 'HEAD'), refs: git(REPO, 'for-each-ref'), status: git(REPO, 'status', '--porcelain') });
test('bytecode-budget stage A4 retention: 20 ref runs keep 0 entries in TMPDIR and cwd, leave the repo untouched, and write exactly 17 files per OUT', { skip }, () => {
    const c = mkCase();
    const before = repoState();
    assert.equal(before.status, '');
    let spawns = 0;
    for (let i = 0; i < 20; i++) {
        const out = join(c.dir, 'outs', `o${i}`);
        const r = capSync('bash', [SCRIPT, ...refO({ ...c, out }, {}, 'add,mid,dup')], { encoding: 'utf8', cwd: c.cwd, env: { ...cleanEnv(), TMPDIR: c.tmp } }, 120000, `bytecode-budget.sh (ref run ${i})`);
        assert.equal(r.status, 1, `run ${i}: ${msg(r)}`);
        const files = walk(out).map((f) => f.slice(out.length + 1)).sort();
        // report.txt + raw/before 6 (3 fns x 2 runs) + raw/after 6 + stage/before 2 (mod.js, driver.mjs) + stage/after 2
        assert.equal(files.length, 17, `run ${i}: ${files.join(' ')}`);
        assert.equal(files.filter((f) => f.startsWith('raw/before/')).length, 6);
        assert.equal(files.filter((f) => f.startsWith('raw/after/')).length, 6);
        assert.deepEqual(files.filter((f) => f.startsWith('stage/')), ['stage/after/driver.mjs', 'stage/after/mod.js', 'stage/before/driver.mjs', 'stage/before/mod.js']);
        assert.ok(files.includes('report.txt'));
    }
    spawns = c.spawns().length;
    assert.equal(spawns, 20 * 15, 'node spawns over 20 runs');
    // macOS mktemp ignores TMPDIR, so this checks the script's own paths (it has no mktemp without a leak to name)
    assert.deepEqual(readdirSync(c.tmp), [], 'TMPDIR kept entries');
    assert.deepEqual(readdirSync(c.cwd), [], 'cwd kept entries');
    assert.deepEqual(repoState(), before, 'the repo changed (status / HEAD / refs)');
});
test('bytecode-budget stage A4 control MUTANT A4-stage-in-tmpdir (stage root $TMPDIR/stage): one run leaves >= 4 entries in TMPDIR', { skip }, (t) => {
    const src = readFileSync(SCRIPT, 'utf8');
    const n = src.split('$OUT/stage').length - 1;
    assert.ok(n >= 4, `anchor $OUT/stage occurs ${n} times`);
    const p = join(ROOT, 'A4-stage-in-tmpdir.sh');
    writeFileSync(p, src.split('$OUT/stage').join('$TMPDIR/stage')); chmodSync(p, 0o755);
    const { c, r } = runOn(p, { args: (cc) => refO(cc) });
    assert.equal(r.status, 1, msg(r));
    const left = walk(c.tmp).length;
    t.diagnostic(`A4 control: ${left} files left in TMPDIR`);
    assert.ok(left >= 4, `only ${left} files in TMPDIR`);
});

// =====================================================================================================
// A5 self-test (B2: N = 4 new checks; --self-test = 49 ok, --fixtures 73; ext-audit B-four bb + 5: 54 / 78; MD-46 G3 + 3: 57 / 81;
// G-STAGE b44 + 3 (D7 D1, D7 D6, D7 Q-DD6a i): 60 / 84; G-ENV b45 + 1 (Q-ENV e2e, no git): 61 / 85; G-TRACKED b45 + 2
// (GT1, GT2, need git): 63 / 87; G-FIFO b46 + 1 (MD-FIFO, no git): 64 / 88; the totals are also asserted in bytecode-budget.test.mjs C).
// The nine staged check names below are the contract (all need git).
// =====================================================================================================
const ST_NAMES = [
    'ref mode (fake node, temp git repo): --before-ref r1 --after-ref r2, m/mid.txt 211 | 212 -> exit 1 DIFF, 7 spawns, before=1 after=0  211',
    'ref mode: --before-ref r1 --after-ref r1 (byte-identical modules) -> exit 0 SAME plus the null-control NOTE',
    'file mode: --before a FROZEN copy (r1, 211) --after the live tracked m/mid.txt (212) -> exit 1 DIFF; OUT holds 9 files (report.txt, raw 2 + 2, stage 2 + 2)',
    'ref / file refusals before any spawn (exit 2, 0 spawns, no OUT dir): ',
    'D7 (D1) ref mode refused before any spawn: ',
    'D7 (D6) file mode refused before any spawn: ',
    'D7 (Q-DD6a i) file mode refused before any spawn: ',
    'GT1 file mode refused before any spawn: ',
    'GT2 file mode: ',
];
const NOGIT_NAME = 'ref / file modes: git on PATH (their rows need git; MD-7: no git fails closed)';
const okLines = (o) => o.split('\n').filter((l) => l.startsWith('ok   '));
const failLines = (o) => o.split('\n').filter((l) => l.startsWith('FAIL '));
const stRun = (script, env = cleanEnv()) => capSync('bash', [script, '--self-test'], { encoding: 'utf8', env }, 240000, 'bytecode-budget.sh --self-test');
const countOf = (o, name) => okLines(o).filter((l) => l.startsWith('ok   ' + name)).length;

test('bytecode-budget stage A5 (a): --self-test exits 0, no FAIL, each of the 9 staged checks present exactly once, 68 ok', { skip }, () => {
    const r = stRun(SCRIPT);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(failLines(r.stdout), []);
    for (const n of ST_NAMES) assert.equal(countOf(r.stdout, n), 1, `check "${n}"`);
    assert.equal(okLines(r.stdout).length, 68);   // 45 + N (N = 4) + 5 (ext-audit B-four bb MD-36..MD-44) + 3 (MD-46 G3 allowlist) + 3 (G-STAGE D7 D1 / D6 / Q-DD6a i) + 1 (G-ENV Q-ENV e2e) + 2 (G-TRACKED GT1 / GT2) + 1 (G-FIFO MD-FIFO) + 4 (G-BBAWK R-a..R-d); also pinned by bytecode-budget.test.mjs C
});
test('bytecode-budget stage A5 teeth (a): the 9173830d build has none of the 9 staged checks (and 45 ok)', { skip: baseSkip }, () => {
    histGate(haveBase);
    const r = stRun(BASE);
    for (const n of ST_NAMES) assert.equal(countOf(r.stdout, n), 0, n);
    assert.equal(okLines(r.stdout).length, 45);
});
function stMutant(name, edits, target, t) {
    const r = stRun(variant(name, edits));
    const f = failLines(r.stdout);
    t.diagnostic(`${name}: rc=${r.status} FAIL lines=${JSON.stringify(f.map((l) => l.slice(0, 110)))}`);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(f.some((l) => l.startsWith('FAIL ' + target)), `no FAIL naming "${target}": ${f.join('\n')}`);
    return f;
}
test('bytecode-budget stage A5 (b) MUTANT M7 (before staged from AFTER_REF): --self-test exits 1 with a FAIL naming check 1', { skip }, (t) => {
    stMutant('A5-M7', [['x="$STAGE_SHA_B"', 'x="$STAGE_SHA_A"']], ST_NAMES[0], t);
});
test('bytecode-budget stage A5 (c) MUTANT M10 (refuse_live deleted): --self-test exits 1 with a FAIL naming check 4', { skip }, (t) => {
    stMutant('A5-M10', [['refuse_live "$BEFORE_FILE" --before', ':']], ST_NAMES[3], t);
});
test('bytecode-budget stage A5 (d): a PATH without git -> exit 1, exactly one FAIL, the git line', { skip }, (t) => {
    const shim = join(ROOT, 'nogit-bin'); mkdirSync(shim);
    const dirs = ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'];
    for (const tool of ['bash', 'sh', 'tr', 'cat', 'awk', 'sed', 'sort', 'uniq', 'grep', 'env', 'seq', 'stat', 'cmp', 'cp', 'mkdir', 'rm', 'dirname', 'basename', 'readlink',
        'wc', 'ls', 'find', 'mktemp', 'paste', 'head', 'tail', 'cut', 'expr', 'date', 'sleep', 'tee', 'id', 'uname', 'ln', 'chmod', 'mv', 'touch', 'od', 'xargs', 'diff', 'shasum', 'sha256sum', 'openssl', 'perl', 'mkfifo']) {
        const d = dirs.find((x) => existsSync(join(x, tool)));
        if (d) symlinkSync(join(d, tool), join(shim, tool));
    }
    assert.ok(!existsSync(join(shim, 'git')));
    const r = stRun(SCRIPT, { ...cleanEnv(), PATH: shim });
    const f = failLines(r.stdout);
    t.diagnostic(`no-git: rc=${r.status} FAIL lines=${JSON.stringify(f)} ok=${okLines(r.stdout).length}`);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(f.length, 1, f.join('\n'));
    assert.equal(okLines(r.stdout).length, 59);   // 68 - the 9 staged rows (they need git); the 5 B-four bb rows, the 3 MD-46 G3 rows, the Q-ENV row and the MD-FIFO row (mkfifo, on the shim) need none
    assert.ok(f[0].startsWith('FAIL ' + NOGIT_NAME), f[0]);
    for (const n of ST_NAMES) assert.equal(countOf(r.stdout, n), 0, n);   // the staged rows do not run without git
});
test('bytecode-budget stage A5 (e): all six GIT_* vars set (missing paths) -> --self-test still 68 ok, exit 0 (hook safety)', { skip }, () => {
    const env = { ...cleanEnv() };
    for (const k of GITVARS) env[k] = join(ROOT, 'no-such-' + k);
    const r = stRun(SCRIPT, env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(failLines(r.stdout), []);
    assert.equal(okLines(r.stdout).length, 68);
    for (const n of ST_NAMES) assert.equal(countOf(r.stdout, n), 1, n);
});

// =====================================================================================================
// G-SHLIB (PLAN-b48-shlib ASSERTIONS 2-3, written from the ASSERTIONS, not from lib/): file mode, fake node.
// R1 --before ext/L/../F physically tracked; R2 / R3 --before / --after DIR/L2/../F with an untracked decoy DIR/F;
// R4 argon A1b (rel symlink inside a symlinked dir); R5 / R6 a bad .git/config around --after / cwd with a tracked
// hard-linked --before. Every R row: exit 2, the stderr prefix (git's own text is never matched), 0 node spawns,
// OUT absent. Each R row has a must-fail twin on the frozen b48 BEFORE root (exit 0 VERDICT SAME, row check red).
// All module bodies are identical, so a root that does not refuse ends in exit 0 SAME.
// =====================================================================================================
const SH_NAME = 'mod.js', SH_BODY = '212\n', SH_PFX = 'bytecode-budget', SH_SPAWNS = 7;
// the b48 BEFORE root = HEAD 5e570f0 (on origin/main; its refuse_live text is the pre-G-SHLIB text), read from git history
const SH_HAVE = spawnSync('git', ['-C', join(HERE, '..'), 'cat-file', '-e', '5e570f0^{commit}'], { env: cleanEnv() }).status === 0 ? true : 'commit 5e570f0 missing (shallow clone?)';
let SH_BEFORE_ROOT = null;
if (!skip && SH_HAVE === true) {
    const s = spawnSync('git', ['-C', join(HERE, '..'), 'show', '5e570f0:bytecode-budget.sh'], { env: cleanEnv(), maxBuffer: 64 << 20 });
    if (s.status === 0) { SH_BEFORE_ROOT = join(ROOT, 'b48-before-5e570f0-bytecode-budget.sh'); writeFileSync(SH_BEFORE_ROOT, s.stdout); chmodSync(SH_BEFORE_ROOT, 0o755); }
}
const shBeforeSkip = skip || histSkip(SH_BEFORE_ROOT ? true : (SH_HAVE === true ? 'git show 5e570f0:bytecode-budget.sh failed' : SH_HAVE));
const shEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shRun = (script, cs, body) => { const { c, r } = runOn(script, cs); return body(c, r); };
const shPut = (p, body = SH_BODY) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
const shD = (c) => { c.d = join(realpathSync(c.dir), 's'); mkdirSync(c.d, { recursive: true }); return c.d; };
function shRepo(dir, files) { mkdirSync(dir, { recursive: true }); git(dir, 'init', '-q'); for (const f of files) shPut(join(dir, f)); git(dir, 'add', ...files); }
const shO = (c) => fileO(c, { '--before': c.before, '--after': c.after });
const shPrefix = (text) => (c) => new RegExp('^' + SH_PFX + ': ' + shEsc(typeof text === 'function' ? text(c) : text), 'm');
function shRefuses(rxOf) {
    return (c, r) => {
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stderr, rxOf(c), msg(r));
        assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
        assert.ok(!existsSync(c.out), 'OUT was created');
    };
}
// R1 (argon A1a before): ext/L -> repo/m/sub, so ext/L/../F is repo/m/F (tracked); the decoy ext/F is what bash's logical join names
const shPrepR1 = (c) => {
    const d = shD(c); shRepo(join(d, 'repo'), ['m/' + SH_NAME]); mkdirSync(join(d, 'repo', 'm', 'sub')); mkdirSync(join(d, 'ext'));
    symlinkSync(join(d, 'repo', 'm', 'sub'), join(d, 'ext', 'L')); shPut(join(d, 'ext', SH_NAME)); shPut(join(d, 'after', SH_NAME));
    c.before = `${d}/ext/L/../${SH_NAME}`; c.after = join(d, 'after', SH_NAME);
};
// R2: ext/L2 -> real/sub, so ext/L2/../F is real/F (untracked, outside any repo); decoy ext/F. R3: the same shape on --after
const shPrepR2 = (c) => {
    const d = shD(c); mkdirSync(join(d, 'real', 'sub'), { recursive: true }); mkdirSync(join(d, 'ext')); shPut(join(d, 'real', SH_NAME));
    symlinkSync(join(d, 'real', 'sub'), join(d, 'ext', 'L2')); shPut(join(d, 'ext', SH_NAME)); shPut(join(d, 'after', SH_NAME));
    c.before = `${d}/ext/L2/../${SH_NAME}`; c.after = join(d, 'after', SH_NAME);
};
const shPrepR3 = (c) => {
    const d = shD(c); mkdirSync(join(d, 'real', 'sub'), { recursive: true }); mkdirSync(join(d, 'ext')); shPut(join(d, 'real', SH_NAME));
    symlinkSync(join(d, 'real', 'sub'), join(d, 'ext', 'L2')); shPut(join(d, 'ext', SH_NAME)); shPut(join(d, 'frz', SH_NAME));
    c.before = join(d, 'frz', SH_NAME); c.after = `${d}/ext/L2/../${SH_NAME}`;
};
// R4 (argon A1b): a/b/F -> ../m/F (tracked a/m/F), frz -> a/b, decoy d/m/F outside the repo; --before frz/F
const shPrepR4 = (c) => {
    const d = shD(c); shRepo(join(d, 'a'), ['m/' + SH_NAME]); mkdirSync(join(d, 'a', 'b')); shPut(join(d, 'm', SH_NAME));
    symlinkSync('../m/' + SH_NAME, join(d, 'a', 'b', SH_NAME)); symlinkSync(join(d, 'a', 'b'), join(d, 'frz')); shPut(join(d, 'after', SH_NAME));
    c.before = join(d, 'frz', SH_NAME); c.after = join(d, 'after', SH_NAME);
};
// R5 (argon A2): frz/F is a hard link to the tracked repo/F; --after repo/after/F; the repo's .git/config is `[broken`
const shPrepR5 = (broken) => (c) => {
    const d = shD(c); shRepo(join(d, 'repo'), [SH_NAME]); shPut(join(d, 'repo', 'after', SH_NAME)); mkdirSync(join(d, 'frz'));
    linkSync(join(d, 'repo', SH_NAME), join(d, 'frz', SH_NAME));
    c.before = join(d, 'frz', SH_NAME); c.after = join(d, 'repo', 'after', SH_NAME);
    if (broken) writeFileSync(join(d, 'repo', '.git', 'config'), '[broken\n');
};
// R6: the same around cwd: cwd is the repo holding the tracked F, --after is outside any repo
const shPrepR6 = (broken) => (c) => {
    const d = shD(c); shRepo(c.cwd, [SH_NAME]); mkdirSync(join(d, 'frz')); linkSync(join(c.cwd, SH_NAME), join(d, 'frz', SH_NAME));
    c.before = join(d, 'frz', SH_NAME); c.after = shPut(join(d, 'after', SH_NAME)) || join(d, 'after', SH_NAME);
    if (broken) writeFileSync(join(c.cwd, '.git', 'config'), '[broken\n');
};
const SH_TRACKED = 'before is a git-tracked working-tree file ('.replace('before', '--before');
const SH_GITFAIL = (c) => `--before: git failed while checking whether ${c.before} is tracked (`;
const SH_R = [
    ['R1 --before ext/L/../F (physically tracked repo/m/F)', { prep: shPrepR1, args: shO, check: shRefuses(shPrefix(SH_TRACKED)) }],
    ['R2 --before ext/L2/../F (untracked, decoy ext/F) -> cannot resolve', { prep: shPrepR2, args: shO, check: shRefuses(shPrefix('--before: cannot resolve the directory of')) }],
    ['R3 --after ext/L2/../F (decoy ext/F) -> cannot resolve', { prep: shPrepR3, args: shO, check: shRefuses(shPrefix('--after: cannot resolve the directory of')) }],
    ['R4 argon A1b: --before frz/F, frz -> a/b, a/b/F -> ../m/F (tracked)', { prep: shPrepR4, args: shO, check: shRefuses(shPrefix(SH_TRACKED)) }],
    ['R5 bad .git/config of the repo around --after + hard-linked tracked --before', { prep: shPrepR5(true), args: shO, check: shRefuses(shPrefix(SH_GITFAIL)) }],
    ['R6 bad .git/config of the repo around cwd + hard-linked tracked --before', { prep: shPrepR6(true), args: shO, check: shRefuses(shPrefix(SH_GITFAIL)) }],
];
const shCs = {}; for (const [n, cs] of SH_R) shCs[n.split(' ')[0]] = cs;
for (const [name, cs] of SH_R) {
    test(`bytecode-budget G-SHLIB ${name}: exit 2, prefix, 0 spawns, no OUT`, { skip }, () => shRun(SCRIPT, cs, (c, r) => cs.check(c, r)));
    test(`bytecode-budget G-SHLIB twin [${name.split(' ')[0]}]: the b48 before root does NOT refuse (exit 0 SAME) and the row check is red there`, { skip: shBeforeSkip }, () => { histGate(SH_BEFORE_ROOT ? true : SH_HAVE); return shRun(SH_BEFORE_ROOT, cs, (c, r) => {
        assert.equal(r.status, 0, msg(r));
        assert.match(r.stdout, /^VERDICT SAME$/m, msg(r));
        assert.throws(() => cs.check(c, r), assert.AssertionError, 'the row check must be red on the b48 before root');
    }); });
}
// controls: (a) the same hard link in a healthy repo is refused (R5 and R6 shapes); (b) everything outside any repo -> exit 0 SAME
const shHardRx = shPrefix('--before is the same file as the live ');
const SH_CTL_A = [{ prep: shPrepR5(false), args: shO, check: shRefuses(shHardRx) }, { prep: shPrepR6(false), args: shO, check: shRefuses(shHardRx) }];
const SH_CTL_B = { prep: (c) => { const d = shD(c); shPut(join(d, 'frz', SH_NAME)); shPut(join(d, 'after', SH_NAME)); c.before = join(d, 'frz', SH_NAME); c.after = join(d, 'after', SH_NAME); }, args: shO, check: (c, r) => {
    assert.equal(r.status, 0, msg(r));
    assert.match(r.stdout, /^VERDICT SAME$/m, msg(r));
    assert.equal(c.spawns().length, SH_SPAWNS, c.spawns().join('\n'));
} };
for (const [lbl, root, sk] of [['new root', SCRIPT, skip], ['b48 before root', SH_BEFORE_ROOT, shBeforeSkip]]) {
    test(`bytecode-budget G-SHLIB control (a) healthy repo: the hard-linked tracked --before is refused ("is the same file as the live"), 0 spawns [${lbl}]`, { skip: sk }, () => {
        if (root !== SCRIPT) histGate(SH_BEFORE_ROOT ? true : SH_HAVE);
        for (const cs of SH_CTL_A) shRun(root, cs, (c, r) => cs.check(c, r));
    });
    test(`bytecode-budget G-SHLIB control (b) all outside any repo: exit 0 SAME, ${SH_SPAWNS} node spawns [${lbl}]`, { skip: sk }, () => { if (root !== SCRIPT) histGate(SH_BEFORE_ROOT ? true : SH_HAVE); return shRun(root, SH_CTL_B, (c, r) => SH_CTL_B.check(c, r)); });
}

// mutants: a private copy of build.sh + src + lib, one lib file edited exactly once, built; the named rows must go red
function shBuild(name, edits) {   // edits: [lib file, from, to]
    const d = mkdtempSync(join(ROOT, `shm-${name}-`)), top = join(HERE, '..');
    cpSync(join(top, 'build.sh'), join(d, 'build.sh')); cpSync(join(top, 'src'), join(d, 'src'), { recursive: true }); cpSync(join(top, 'lib'), join(d, 'lib'), { recursive: true });
    for (const [f, from, to] of edits) {
        const p = join(d, 'lib', f), t = readFileSync(p, 'utf8'), n = t.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once in lib/${f}, matched ${n}: ${from}`);
        writeFileSync(p, t.replace(from, () => to));
    }
    const out = join(d, 'out'); mkdirSync(out);
    const r = capSync('bash', ['build.sh', out], { cwd: d, encoding: 'utf8', env: cleanEnv() }, 60000, `bash build.sh (mutant ${name})`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return join(out, 'bytecode-budget.sh');
}
function shMutant(name, edits, kills, exit0) {
    test(`bytecode-budget G-SHLIB MUTANT ${name}: kills ${kills.join(' + ')}`, { skip }, (t) => {
        const p = shBuild(name, edits);
        for (const k of kills) {
            const cs = shCs[k];
            shRun(p, cs, (c, r) => {
                t.diagnostic(`${name} ${k}: rc=${r.status} spawns=${c.spawns().length} stderr=${JSON.stringify(r.stderr.trim().slice(0, 120))}`);
                assert.throws(() => cs.check(c, r), assert.AssertionError, `${name}: ${k} still passes on the mutant`);
                if (exit0 && /^R[578]/.test(k)) { assert.equal(r.status, 0,
                    'the mutant must fail OPEN (exit 0), not die ' +
                        'elsewhere: ' + msg(r)); assert.ok(c.spawns().length > 0); }
            });
        }
    });
}
const SH_ISP = 'd=$(cd -P -- "$d" 2>/dev/null && pwd -P) || return 1';
const SH_ISP_NOP = 'd=$(cd -- "$d" 2>/dev/null && pwd) || return 1';
const SH_RL = 'd=$(CDPATH= cd -P -- "$d" 2>/dev/null && pwd -P) || die "cannot resolve the directory of $p';
const SH_RL_NOP = 'd=$(CDPATH= cd -- "$d" 2>/dev/null && pwd) || die "cannot resolve the directory of $p';
shMutant('drop-P-is_tracked', [['tracked.sh', SH_ISP, SH_ISP_NOP]], ['R1']);
shMutant('drop-P-is_tracked-and-resolve_links', [['tracked.sh', SH_ISP, SH_ISP_NOP], ['common.sh', SH_RL, SH_RL_NOP]], ['R4']);
shMutant('drop-before-ef', [['stage.sh', '[[ "$STAGE_ABS_B" -ef "$BEFORE_FILE" ]] || die', 'true || die']], ['R2']);
shMutant('drop-after-ef', [['stage.sh', '[[ "$STAGE_ABS_A" -ef "$AFTER_FILE" ]] || die', 'true || die']], ['R3']);
shMutant('top_of-die-to-return-1', [['common.sh', '  die "${what:-top_of}: git failed', '  return 1 # die "${what:-top_of}: git failed']], ['R5', 'R6'], true);
shMutant('live_tops-in-subshell', [['common.sh', '  live_tops "$f" "$(dirname "$f")" "$(dirname "$p")"\n', '  ( live_tops "$f" "$(dirname "$f")" "$(dirname "$p")" ) || :\n']], ['R5'], true);

// =====================================================================================================
// G-SHL3 (b50, PLAN-b50-shl3 ASSERTIONS 1, 2, 4; written from the ASSERTIONS, not from lib/): file mode, fake node.
// R7 (B2b) --after is a symlink into the repo; R8 (B2c) --after is the repo's own file; R9 (B3) an unwritable
// --out.
// R7 / R8: exit 2 "is the same file as the live <repo>/F", 0 node spawns, OUT absent. Every row has a must-fail
// twin on the frozen bd0192f root (git history, not the gitignored .handoff): R7 / R8 exit 0 SAME, R9 truncates
// report.txt. Mutants: the B2b line deleted / the B2c token dropped -> exit 0 SAME; the B3 pre-check deleted -> the
// run goes on (report.txt 0 bytes) and the 2>/dev/null hides its mkdir text.
// =====================================================================================================
const S3_SHA = 'bd0192f';
const S3_GIT = ['-C', join(HERE, '..')];
const S3_HAVE = spawnSync('git', [...S3_GIT, 'cat-file', '-e', `${S3_SHA}^{commit}`],
    { env: cleanEnv() }).status === 0
    ? true : `commit ${S3_SHA} missing (shallow clone?)`;
let S3_ROOT = null;
if (!skip && S3_HAVE === true) {
    const s = spawnSync('git', [...S3_GIT, 'show', `${S3_SHA}:bytecode-budget.sh`], { env: cleanEnv(),
        maxBuffer: 64 << 20 });
    if (s.status === 0) {
        S3_ROOT = join(ROOT, `b50-before-${S3_SHA}-bytecode-budget.sh`);
        writeFileSync(S3_ROOT, s.stdout); chmodSync(S3_ROOT, 0o755);
    }
}
const s3Skip = skip || histSkip(
    S3_ROOT ? true : (S3_HAVE === true ? `git show ${S3_SHA}:bytecode-budget.sh failed` : S3_HAVE));
const s3Gate = () => histGate(S3_ROOT ? true : S3_HAVE);
const s3Same = (c) => new RegExp(
    '^' + SH_PFX + ': --before is the same file as the live ' + shEsc(join(c.d, 'repo', SH_NAME)) + ' ', 'm');
const s3Same0 = (c, r) => { assert.equal(r.status, 0, msg(r)); assert.match(r.stdout, /^VERDICT SAME$/m, msg(r)); };
// R7: repo tracks F and sub/F; frz/F is a hard link of repo/F; work/F -> ../repo/sub/F; cwd (c.cwd) is outside the
// repo
const s3PrepR7 = (c) => {
    const d = shD(c);
    shRepo(join(d, 'repo'), [SH_NAME, 'sub/' + SH_NAME]); mkdirSync(join(d, 'frz')); mkdirSync(join(d, 'work'));
    linkSync(join(d, 'repo', SH_NAME), join(d, 'frz', SH_NAME));
    symlinkSync('../repo/sub/' + SH_NAME, join(d, 'work', SH_NAME));
    c.before = join(d, 'frz', SH_NAME); c.after = join(d, 'work', SH_NAME);
};
// R8: repo tracks F and sub/F; frz/before.js is a hard link of repo/<src>; --after repo/sub/F (only its NAME links
// them)
const s3PrepR8 = (src) => (c) => {
    const d = shD(c);
    shRepo(join(d, 'repo'), [src, 'sub/' + SH_NAME]); mkdirSync(join(d, 'frz'));
    linkSync(join(d, 'repo', src), join(d, 'frz', 'before.js'));
    c.before = join(d, 'frz', 'before.js'); c.after = join(d, 'repo', 'sub', SH_NAME);
};
const S3_R = [
    ['R7 B2b --after work/F -> repo/sub/F, --before frz/F hard link of tracked repo/F',
        { prep: s3PrepR7, args: shO, check: shRefuses(s3Same) }],
    ['R8 B2c --after repo/sub/F, --before frz/before.js hard link of tracked repo/F',
        { prep: s3PrepR8(SH_NAME), args: shO, check: shRefuses(s3Same) }],
];
for (const [name, cs] of S3_R) {
    const id = name.split(' ')[0];
    shCs[id] = cs;
    test(`bytecode-budget G-SHL3 ${name}: exit 2, "same file as the live repo/F", 0 spawns, no OUT`, { skip },
        () => {
        shRun(SCRIPT, cs, (c, r) => cs.check(c, r));
    });
    test(`bytecode-budget G-SHL3 twin [${id}]: the frozen ${S3_SHA} root does NOT refuse (exit 0 SAME), row ` +
        `check red`,
        { skip: s3Skip }, () => {
            s3Gate();
            shRun(S3_ROOT, cs, (c, r) => {
                s3Same0(c, r);
                assert.throws(() => cs.check(c, r), assert.AssertionError);
            });
        });
}
// R8 residual, "accepted by design": a hard link to repo/src/F (not repo/F) stays exit 0 on the new and the frozen
// root
const S3_RES = { prep: s3PrepR8('src/' + SH_NAME), args: shO, check: s3Same0 };
for (const [lbl, root, sk] of [['new root', SCRIPT, skip], [`frozen ${S3_SHA} root`, S3_ROOT, s3Skip]]) {
    test(`bytecode-budget G-SHL3 R8 residual (accepted by design): hard link to repo/src/F -> exit 0 SAME [${lbl}]`,
        { skip: sk }, () => {
            if (root !== SCRIPT) s3Gate();
            shRun(root, S3_RES, (c, r) => S3_RES.check(c, r));
        });
}
const S3_B2B = '  if [[ -L "$AFTER_FILE" && -e "$AFTER_FILE" ]]; then\n'
    + '    r=$(resolve_links "$AFTER_FILE" 2>/dev/null) || die "--after: cannot resolve its symlink chain: $AFTER_FILE"\n'
    + '    if top_of "$(dirname -- "$r")" "$f"; then t="$t$TOP_OF"$\'\\n\'; fi\n  fi\n';
const S3_B2C = ' \\\n      ${AFTER_FILE:+"$top/$(basename -- "$AFTER_FILE")"}; do';
shMutant('b50-B2b-line-deleted', [['common.sh', S3_B2B, '']], ['R7'], true);
shMutant('b50-B2c-token-dropped', [['common.sh', S3_B2C, '; do']], ['R8'], true);

// R9 (B3, ASSERTION 4): OUT 0555 with raw/ (0755, empty) and report.txt "KEEP\n"; skipped under uid 0 (chmod binds
// nothing)
const s3Uid0 = typeof process.getuid === 'function' && process.getuid() === 0
    ? 'uid 0: a 0555 dir binds nothing' : false;
const s3PrepR9 = (c) => {
    mkdirSync(c.out); mkdirSync(join(c.out, 'raw')); chmodSync(join(c.out, 'raw'), 0o755);
    writeFileSync(join(c.out, 'report.txt'), 'KEEP\n');
    chmodSync(c.out, 0o555);                 // the row runner restores 0755 in a finally, also when a check throws
};
const s3Mkdirs = (r) => r.stderr.split('\n').filter((l) => l.startsWith('mkdir:')).length;
const S3_DIE = new RegExp('^' + SH_PFX + ': --out: cannot create .*/stage \\(.* is not writable\\)$');
const s3R9Live = (c, r) => {
    assert.equal(r.status, 2, msg(r));
    const el = r.stderr.split('\n').filter(Boolean);
    assert.equal(el.length, 2, msg(r));
    assert.match(el[0], S3_DIE, msg(r));
    assert.equal(el[1], 'VERDICT NO-VERDICT', msg(r));
    assert.equal(s3Mkdirs(r), 0, msg(r));
    assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
    assert.equal(statSync(join(c.out, 'report.txt')).size, 5, 'report.txt must keep its 5 bytes');
    assert.deepEqual(readdirSync(join(c.out, 'raw')), [], 'raw/ must stay empty');
};
// the run went on: report.txt truncated, raw/before + raw/after made, 2 node spawns, `mkdirs` mkdir: lines on
// stderr
const s3R9Went = (mkdirs) => (c, r) => {
    assert.equal(statSync(join(c.out, 'report.txt')).size, 0, 'report.txt truncated');
    assert.deepEqual(readdirSync(join(c.out, 'raw')).sort(), ['after', 'before']);
    assert.equal(c.spawns().length, 2, c.spawns().join('\n'));
    assert.equal(s3Mkdirs(r), mkdirs, msg(r));
    assert.throws(() => s3R9Live(c, r), assert.AssertionError, 'the live row check must be red here');
};
const S3_PRECHECK = '  [[ -e "$OUT/stage" || ! -e "$OUT" || ( -w "$OUT" && -x "$OUT" ) ]] \\\n'
    + '    || die "--out: cannot create $OUT/stage ($OUT is not writable)"\n';
for (const [mode, args] of [['file', (c) => fileO(c)], ['ref', (c) => refO(c)]]) {
    const cs = { prep: s3PrepR9, args, check: s3R9Live };
    test(`bytecode-budget G-SHL3 R9 B3 ${mode} mode: unwritable OUT -> exit 2, 2 stderr lines, 0 spawns, OUT kept`,
        { skip: skip || s3Uid0 }, () => {
            shRun(SCRIPT, cs, (c, r) => cs.check(c, r));
        });
    test(`bytecode-budget G-SHL3 twin [R9 ${mode}]: frozen ${S3_SHA} truncates report.txt, makes raw/before + ` +
        `raw/after`,
        { skip: s3Skip || s3Uid0 }, () => {
            s3Gate();
            shRun(S3_ROOT, cs, s3R9Went(1));
        });
    test(`bytecode-budget G-SHL3 R9 ${mode} MUTANT B3-pre-check-deleted: the run goes on, 0 mkdir: lines ` +
        `(2>/dev/null)`,
        { skip: skip || s3Uid0 }, () => {
            const p = shBuild(`b50-B3-pre-check-${mode}`, [['stage.sh', S3_PRECHECK, '']]);
            shRun(p, cs, s3R9Went(0));
        });
}
