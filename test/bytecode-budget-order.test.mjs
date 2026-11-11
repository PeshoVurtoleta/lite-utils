// test/bytecode-budget-order.test.mjs -- G-ORDER (Q-BB3) rows for ../bytecode-budget.sh: the cold-path order is
// [every spawn-free refusal, mkdir raw/, the report.txt truncation] -> [--version, --v8-options, the version-mismatch
// exit] -> [raw/before + raw/after (diff modes), stage/ (ref / file)] -> the run head -> the probes.
// Oracle: .handoff/PLAN-b42-gorder.md ASSERTIONS A1, A2, A4, A5 + addendum A2 (b), not the implementation.
// Expected values are hand-derived from the fixtures (before module 211, after module 212, fake node v26.8.2).
// Teeth: A1 / A2 / A2 (b) / A5 rows are red on the frozen pre-G-ORDER build (44e94b60); the A4 rows are REGRESSION
// PINS that pass on it by design. Each row has an in-file mutant twin: an exact-once, count-checked edit of a copy of
// the live src/bytecode-budget.sh, rebuilt by a copy of build.sh in a private temp dir (never written into the repo).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, existsSync, linkSync, symlinkSync, lstatSync, readlinkSync, realpathSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (afterEach runs before its own
// test's report, so it would lose the last pass; proven by test/death-signature.test.mjs teeth, b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const SCRIPT = join(PKG, 'bytecode-budget.sh');
const SRC = join(PKG, 'src', 'bytecode-budget.sh');
const EXCERPT = join(HERE, 'fixtures', 'bytecode-budget', 'node-26.8.2', 'v8-options-excerpt.txt');
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
const haveGit = spawnSync('git', ['--version']).status === 0;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const gitSkip = skip || (haveGit ? false : 'git not available (ref mode needs a repo)');
const GITC = ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false'];

function cleanEnv() {   // the child env: no GIT_* location var, no editor, no NODE_OPTIONS, no coverage dir; git config off
    const e = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    for (const k of [...GITVARS, 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'NODE_OPTIONS']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // node re-adds a deleted NODE_V8_COVERAGE to a child env; undefined strips it
    return e;
}
function git(cwd, ...a) {
    const r = spawnSync('git', [...GITC, ...a], { cwd, encoding: 'utf8', env: cleanEnv() });
    assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
}
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

// ---- shared read-only fixtures (realpath: the script prints logical paths, the rows compare them byte for byte) ----
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'bbo-root-')));
after(() => rmSync(ROOT, { recursive: true, force: true }));
const REPO = join(ROOT, 'repo');                       // src/mod.js: tag r1 = 211, tag r2 = 212
const SDRV = join(ROOT, 'sdrv', 'driver.mjs');         // the staged-mode driver (imports './mod.js')
const FROZEN = join(ROOT, 'frozen', 'mod.js');         // file mode --before, 211
const LIVE = join(ROOT, 'live', 'mod.js');             // file mode --after, 212 (only ever copied by the script)
const DB = join(ROOT, 'b', 'driver.mjs'), DA = join(ROOT, 'a', 'driver.mjs'), DG = join(ROOT, 'g', 'driver.mjs');
for (const [d, n] of [['sdrv', null], ['frozen', '211'], ['live', '212'], ['b', '211'], ['a', '212'], ['g', '211']]) {
    mkdirSync(join(ROOT, d));
    if (d !== 'frozen' && d !== 'live') writeFileSync(join(ROOT, d, 'driver.mjs'), "import './mod.js';\n");
    if (n) writeFileSync(join(ROOT, d, 'mod.js'), n + '\n');
}
if (haveGit) {
    mkdirSync(join(REPO, 'src'), { recursive: true });
    git(REPO, 'init', '-q');
    writeFileSync(join(REPO, 'src', 'mod.js'), '211\n'); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r1'); git(REPO, 'tag', 'r1');
    writeFileSync(join(REPO, 'src', 'mod.js'), '212\n'); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r2'); git(REPO, 'tag', 'r2');
}

// ---- one case = one fresh dir: an argv-logging fake node (the length = ./mod.js of the probe's cwd minus import
// lines), a private TMPDIR and cwd, a logging mktemp shim first on PATH, and the OUT path c.out (not created) ----
const REAL_MKTEMP = spawnSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8' }).stdout.trim();
function mkCase() {
    const dir = mkdtempSync(join(ROOT, 'c-'));
    const log = join(dir, 'argv.log'), mlog = join(dir, 'mktemp.log');
    const node = join(dir, 'node');
    writeFileSync(node, `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) if [ -n "\${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; echo v26.8.2; exit 0 ;;
  --v8-options) cat ${JSON.stringify(EXCERPT)}; exit 0 ;;
esac
case "$*" in *"--print-bytecode-filter=*"*) printf '[generated bytecode for function: __base (0x1 <SharedFunctionInfo __base>)]\\nBytecode length: 1\\n'; exit 0 ;; esac
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
len=$(grep -v '^import' ./mod.js | tr -d ' \\n')
printf '[generated bytecode for function: %s (0x1 <SharedFunctionInfo %s>)]\\nBytecode length: %s\\nParameter count 1\\n' "$fn" "$fn" "$len"
`);
    chmodSync(node, 0o755);
    const bin = join(dir, 'shim-bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'mktemp'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(mlog)}\nexec ${JSON.stringify(REAL_MKTEMP)} "$@"\n`);
    chmodSync(join(bin, 'mktemp'), 0o755);
    const c = { dir, node, bin, tmp: join(dir, 'tmp'), cwd: join(dir, 'cwd'), out: join(dir, 'O') };
    mkdirSync(c.tmp); mkdirSync(c.cwd);
    c.spawns = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    c.resetSpawns = () => { if (existsSync(log)) writeFileSync(log, ''); };
    c.mktemps = () => (existsSync(mlog) ? readFileSync(mlog, 'utf8').split('\n').filter(Boolean).length : 0);
    return c;
}
const RUN = 'bytecode-budget.sh (order row)';
// a capped-run timeout / spawn error is never a mutant kill: noTimeout raises it as an AssertionError, so a twin rethrows it
function capErr(e) { return e instanceof Error && (e.message.startsWith(`${RUN} timed out after `) || e.message.startsWith(`${RUN} spawn error `)); }
const red = (e) => { if (capErr(e)) throw e; return e instanceof assert.AssertionError; };
function exec(script, c, args, env = {}) {
    return capSync('bash', [script, ...args], { encoding: 'utf8', cwd: c.cwd, env: { ...cleanEnv(), PATH: c.bin + ':' + process.env.PATH, TMPDIR: c.tmp, ...env } }, 120000, RUN);
}
const MODES = {   // argv per mode; --node-version is appended by each row
    gate: (c) => ['--node', c.node, '--runs', '2', '--out', c.out, '--max', 'mid=300', DG],
    report: (c) => ['--node', c.node, '--runs', '2', '--out', c.out, '--fn', 'mid', DG],
    diff: (c) => ['--node', c.node, '--runs', '2', '--out', c.out, '--diff', '--fn', 'mid', DB, DA],
    ref: (c) => ['--node', c.node, '--runs', '2', '--out', c.out, '--diff', '--fn', 'mid', '--before-ref', 'r1', '--after-ref', 'r2', '--module', 'src/mod.js', '--driver', SDRV, '--repo', REPO],
    file: (c) => ['--node', c.node, '--runs', '2', '--out', c.out, '--diff', '--fn', 'mid', '--before', FROZEN, '--after', LIVE, '--driver', SDRV],
};
const modeSkip = (m) => (m === 'ref' ? gitSkip : skip);
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
// the recursive OUT listing, symlinks not followed: dirs end in '/'
function list(p, pre = '') {
    return readdirSync(p).sort().flatMap((e) => {
        const q = join(p, e), st = lstatSync(q);
        return st.isDirectory() && !st.isSymbolicLink() ? [pre + e + '/', ...list(q, pre + e + '/')] : [pre + e];
    });
}
// a byte snapshot of a whole tree (type, link target, content sha, link count), symlinks not followed
function snap(p, pre = '') {
    return readdirSync(p).sort().flatMap((e) => {
        const q = join(p, e), st = lstatSync(q), r = pre + e;
        if (st.isSymbolicLink()) return [`${r} l ${readlinkSync(q)}`];
        if (st.isDirectory()) return [`${r}/ d`, ...snap(q, r + '/')];
        return [`${r} f ${sha8(readFileSync(q))} ${st.size} n${st.nlink}`];
    });
}
const HEADRX = /^(before |after  |driver |NOTE )/m;
const TWO = ['--version', '--v8-options'];

// ---- mutants: exact-once, count-checked edits of the live src, rebuilt by a copy of build.sh in a private dir ----
const MUT = new Map();
function buildRoot(name, edits) {
    if (MUT.has(name)) return MUT.get(name);
    let s = readFileSync(SRC, 'utf8');
    for (const [from, to] of edits) {
        const n = s.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}: ${from.slice(0, 90)}`);
        s = s.replace(from, () => to);
    }
    const d = mkdtempSync(join(ROOT, `b-${name}-`));
    mkdirSync(join(d, 'src'));
    cpSync(join(PKG, 'lib'), join(d, 'lib'), { recursive: true });
    cpSync(join(PKG, 'build.sh'), join(d, 'build.sh'));
    writeFileSync(join(d, 'src', 'bytecode-budget.sh'), s);
    const r = spawnSync('bash', [join(d, 'build.sh')], { encoding: 'utf8', env: cleanEnv() });
    assert.equal(r.status, 0, `build.sh for ${name}: ${r.stderr}`);
    const p = join(d, 'bytecode-budget.sh');
    MUT.set(name, p);
    return p;
}
const RAW = 'if [[ -n "$OUT" && $DIFFMODE == 1 ]]; then mkdir "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"; fi\n';
const REP = '  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"\n';
const STW = 'if [[ $STAGED == 1 ]]; then\n  stage_write   # lib/stage.sh: OUT/stage/before and OUT/stage/after, each the module + the driver\n' +
    '  DRV_B_DIR=$(dirname "$DRV_B"); DRV_B_BASE=$(basename "$DRV_B")\n  DRV_A_DIR=$(dirname "$DRV_A"); DRV_A_BASE=$(basename "$DRV_A")\nfi\n';
const HEADDEF = 'bb_head() { # 1 = the run head after stage_write;';
const SPAWN = 'GOT_VER=$(env -u NODE_OPTIONS -u NODE_COMPILE_CACHE "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"\nv8fl_check "$NODE_BIN"\n';
const OUTIF = '\nif [[ -n "$OUT" ]]; then\n  # refuse before any write:';
const STCHK = 'if [[ $DIFFMODE == 1 && $STAGED == 1 ]]; then\n';   // G-X6 r2: the early cwd check now sits above stage_check
const MUTANTS = {
    // the raw/before + raw/after mkdir back in the --out block, before the spawns (its pre-G-ORDER place)
    'M-raw-early': [[RAW, ''], [REP, REP.replace('  REPORT=', '  if [[ $DIFFMODE == 1 ]]; then mkdir "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"; fi\n  REPORT=')]],
    // the same, in every mode (the gate / report REGRESSION PIN's twin)
    'M-raw-all-modes': [[RAW, ''], [REP, REP.replace('  REPORT=', '  mkdir "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"\n  REPORT=')]],
    // stage_write back above the spawns
    'M-stage-early': [[STW, ''], [HEADDEF, STW + HEADDEF]],
    // the mismatch exit prints the staged head lines (values defaulted so it does not trip set -u)
    'M-head-staged': [['  bb_head 0\n', '  DESC_B=${DESC_B-x}; DESC_A=${DESC_A-x}; DESC_D=${DESC_D-x}; STAGE_SAME=${STAGE_SAME-0}; bb_head 1\n']],
    // bb_head's staged-line guard dropped: the staged mismatch reads an unset DESC_B (set -u)
    'M-head-guard-off': [['    if [[ $STAGED != 1 || $1 == 1 ]]; then\n', '    if true; then\n']],
    // --version + v8fl_check hoisted above the --out block
    'M-hoist-above-out': [[SPAWN, ''], [OUTIF, '\n' + SPAWN + 'if [[ -n "$OUT" ]]; then\n  # refuse before any write:']],
    // the same two spawns hoisted above stage_check (the OUT/stage refusal lives there, above the --out block)
    'M-hoist-above-stage': [[SPAWN, ''], [STCHK, SPAWN + STCHK]],
};

// a row: the check on the live root, and one twin per named mutant (the same check must go red there)
function row(name, m, cs, mutants) {
    test(`bytecode-budget order: ${name}`, { skip: modeSkip(m) }, () => {
        const c = mkCase();
        cs.check(c, SCRIPT);
    });
    for (const mu of mutants) {
        test(`bytecode-budget order MUTANT ${mu}: [${name}] goes red`, { skip: modeSkip(m) }, (t) => {
            const p = buildRoot(mu, MUTANTS[mu]);
            const c = mkCase();
            assert.throws(() => cs.check(c, p, t), red, `${mu}: the row still passes`);
        });
    }
}

// =====================================================================================================
// pipeline control: the unedited src rebuilt through the mutant pipeline IS the root under test (else a twin tests
// some other script)
// =====================================================================================================
test('bytecode-budget order: the mutant pipeline rebuilds the unedited src byte-identical to ../bytecode-budget.sh', { skip }, () => {
    assert.equal(sha8(readFileSync(buildRoot('control', [])).toString()), sha8(readFileSync(SCRIPT)));
});

// =====================================================================================================
// A1: --node-version v26.8.1 against a v26.8.2 node, with --out O, in diff / ref / file mode: exit 2 after exactly
// [--version, --v8-options]; O = {raw/ (empty), report.txt (= stdout)}; ref / file print no staged head line. Then a
// v26.8.2 rerun into the SAME O is accepted: exit 1 DIFF (211 | 212), 8 spawns (--version, 2 x --v8-options, the baseline, 2 x 2).
// =====================================================================================================
function a1(m) {
    return { check: (c, script, t) => {
        const r = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.1']);
        t?.diagnostic(`mismatch rc=${r.status} spawns=${c.spawns().length} O=${existsSync(c.out) ? JSON.stringify(list(c.out)) : 'absent'}`);
        assert.equal(r.status, 2, msg(r));
        assert.equal(r.stderr, '', msg(r));
        assert.match(r.stdout, /\n {2}mid: NO-VERDICT -- node version mismatch: [^\n]* --version is v26\.8\.2, --node-version is v26\.8\.1\nVERDICT NO-VERDICT\n$/, msg(r));
        assert.deepEqual(c.spawns(), TWO);
        assert.deepEqual(list(c.out), ['raw/', 'report.txt']);
        assert.equal(readFileSync(join(c.out, 'report.txt'), 'utf8'), r.stdout);
        if (m !== 'diff') assert.doesNotMatch(r.stdout, HEADRX, msg(r));
        c.resetSpawns();
        const r2 = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.2']);
        t?.diagnostic(`rerun rc=${r2.status} spawns=${c.spawns().length} stderr=${JSON.stringify(r2.stderr.slice(0, 160))}`);
        assert.equal(r2.status, 1, msg(r2));
        assert.match(r2.stdout, /^VERDICT DIFF$/m, msg(r2));
        assert.equal(c.spawns().length, 8, c.spawns().join('\n'));
    } };
}
row('A1 diff: --node-version mismatch with --out -> exit 2 after [--version, --v8-options], O = {raw/ empty, report.txt = stdout}; a v26.8.2 rerun into the same O -> exit 1 DIFF, 8 spawns', 'diff', a1('diff'), ['M-raw-early']);
for (const m of ['ref', 'file']) {
    row(`A1 ${m}: --node-version mismatch with --out -> exit 2 after [--version, --v8-options], O = {raw/ empty, report.txt = stdout}, no before / after / driver / NOTE line; a v26.8.2 rerun into the same O -> exit 1 DIFF, 8 spawns`, m, a1(m), ['M-raw-early', 'M-stage-early', 'M-head-staged']);
}

// =====================================================================================================
// A2 (b): the staged-mismatch stdout, pinned whole (head, mode, out, the NO-VERDICT lines), empty stderr, exit 2.
// Twin M-head-guard-off: without bb_head's staged-line guard the mismatch reads an unset DESC_B; under bash 3.2 that
// unbound variable exits 2 via the G-FINAL trap (Q-F2a; "unexpected error" on stderr) -- the row goes red on its stdout / stderr pins.
// =====================================================================================================
for (const m of ['ref', 'file']) {
    row(`A2 (b) ${m}: the staged mismatch prints exactly head / mode / out + the NO-VERDICT lines, empty stderr, exit 2`, m, { check: (c, script, t) => {
        const r = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.1']);
        t?.diagnostic(`rc=${r.status} stdout-lines=${r.stdout.split('\n').length - 1} stderr=${JSON.stringify(r.stderr.slice(0, 160))}`);
        assert.equal(r.status, 2, msg(r));
        assert.equal(r.stdout, [
            `bytecode-budget  node v26.8.2  ${c.node}  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)`,
            `mode    diff (${m})  runs 2  v8 flags --no-flush-bytecode --print-bytecode --print-bytecode-filter=<fn>`,
            `out     ${c.out}`,
            `  mid: NO-VERDICT -- node version mismatch: ${c.node} --version is v26.8.2, --node-version is v26.8.1`,
            'VERDICT NO-VERDICT', ''].join('\n'));
        assert.equal(r.stderr, '');
    } }, ['M-head-guard-off', 'M-head-staged']);
}

// =====================================================================================================
// A2: a --v8-flags refusal (--bogus-flag) and a failing --version (fake rc 1), in diff / ref / file mode: exit 2,
// the frozen die line on stderr, 0 stdout; [--version, --v8-options] resp. [--version]; O = {raw/ empty, report.txt 0 B}.
// =====================================================================================================
const BOGUS = "bytecode-budget: --v8-flags must not set --bogus-flag: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)\nVERDICT NO-VERDICT\n";
function a2(m, kind) {
    return { check: (c, script, t) => {
        const r = kind === 'bogus'
            ? exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.2', '--v8-flags', '--bogus-flag'])
            : exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.2'], { FAKE_VER_RC: '1' });
        t?.diagnostic(`rc=${r.status} spawns=${c.spawns().length} O=${existsSync(c.out) ? JSON.stringify(list(c.out)) : 'absent'}`);
        assert.equal(r.status, 2, msg(r));
        assert.equal(r.stderr, kind === 'bogus' ? BOGUS : `bytecode-budget: cannot run ${c.node} --version\nVERDICT NO-VERDICT\n`);
        assert.equal(r.stdout, '');
        assert.deepEqual(c.spawns(), kind === 'bogus' ? TWO : ['--version']);
        assert.deepEqual(list(c.out), ['raw/', 'report.txt']);
        assert.equal(readFileSync(join(c.out, 'report.txt'), 'utf8'), '');
    } };
}
for (const m of ['diff', 'ref', 'file']) {
    const tw = m === 'diff' ? ['M-raw-early'] : ['M-stage-early'];
    row(`A2 ${m}: --v8-flags --bogus-flag -> exit 2 die line after [--version, --v8-options], O = {raw/ empty, report.txt 0 B}`, m, a2(m, 'bogus'), tw);
    row(`A2 ${m}: node --version exits 1 -> exit 2 "cannot run" after [--version], O = {raw/ empty, report.txt 0 B}`, m, a2(m, 'verrc1'), tw);
}

// =====================================================================================================
// A4 REGRESSION PINS (pass on the pre-G-ORDER build by design, R2 G-B2). (i) Each spawn-free --out refusal combined
// with --node-version v26.8.1: exit 2, the refusal line, 0 spawns, the whole case dir byte-unchanged (O, the link
// target, the hard-link partner). Twin M-hoist-above-out (the spawns above the --out block); the stage/ refusal is in
// stage_check, above the --out block, so its twin is M-hoist-above-stage. (ii) A gate / report
// mismatch leaves O = {raw/ empty, report.txt}. Twin M-raw-all-modes.
// =====================================================================================================
const V12 = {
    rawfile: { prep: (c) => { mkdirSync(join(c.out, 'raw'), { recursive: true }); writeFileSync(join(c.out, 'raw', 'f'), 'keep\n'); }, rx: (c) => `--out: ${c.out}/raw is not empty (give a new or empty DIR)` },
    rawlink: { prep: (c) => { mkdirSync(c.out); mkdirSync(join(c.dir, 'x')); symlinkSync(join(c.dir, 'x'), join(c.out, 'raw')); }, rx: (c) => `--out: ${c.out}/raw is a symlink (refused: the writes would follow it)` },
    rephard: { prep: (c) => { mkdirSync(c.out); writeFileSync(join(c.dir, 'h'), 'KEEP\n'); linkSync(join(c.dir, 'h'), join(c.out, 'report.txt')); }, rx: (c) => `--out: ${c.out}/report.txt has another hard link (refused: the write would change that file too)` },
    stagefile: { prep: (c) => { mkdirSync(join(c.out, 'stage'), { recursive: true }); writeFileSync(join(c.out, 'stage', 'f'), 'keep\n'); }, rx: (c) => `--out: ${c.out}/stage is not empty (give a new or empty DIR)` },
};
for (const m of ['gate', 'diff', 'ref', 'file']) {
    for (const k of ['rawfile', 'rawlink', 'rephard', ...(m === 'ref' || m === 'file' ? ['stagefile'] : [])]) {
        row(`A4 REGRESSION PIN ${m} + ${k} + --node-version v26.8.1 -> exit 2 refusal, 0 spawns, the case dir byte-unchanged`, m, { check: (c, script, t) => {
            V12[k].prep(c);
            const s0 = snap(c.dir);
            const r = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.1']);
            t?.diagnostic(`rc=${r.status} spawns=${c.spawns().length}`);
            assert.equal(r.status, 2, msg(r));
            assert.equal(r.stderr, `bytecode-budget: ${V12[k].rx(c)}\nVERDICT NO-VERDICT\n`);
            assert.equal(r.stdout, '');
            assert.deepEqual(c.spawns(), []);
            assert.deepEqual(snap(c.dir), s0);
        } }, [k === 'stagefile' ? 'M-hoist-above-stage' : 'M-hoist-above-out']);
    }
}
for (const m of ['gate', 'report']) {
    row(`A4 REGRESSION PIN ${m}: --node-version mismatch with --out -> exit 2 after [--version, --v8-options], O = {raw/ empty, report.txt = stdout}`, m, { check: (c, script, t) => {
        const r = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.1']);
        t?.diagnostic(`rc=${r.status} O=${existsSync(c.out) ? JSON.stringify(list(c.out)) : 'absent'}`);
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stdout, /\nVERDICT NO-VERDICT\n$/, msg(r));
        assert.deepEqual(c.spawns(), TWO);
        assert.deepEqual(list(c.out), ['raw/', 'report.txt']);
        assert.equal(readFileSync(join(c.out, 'report.txt'), 'utf8'), r.stdout);
    } }, ['M-raw-all-modes']);
}

// =====================================================================================================
// A5 budget + retention: N cycles (20 on the live root) of a mismatch then an accepted rerun into the same O, each
// cycle a fresh O, one private TMPDIR + cwd for all: spawns exactly 2 then 8 per cycle, exactly 2 O entries after each
// mismatch, 5 mktemp calls per cycle (the accepted run: the baseline + 2 x 2 probes; the mismatch makes none), each
// file removed: TMPDIR / cwd entry delta 0. (GC budget N/A: torture-exempt package.)
// =====================================================================================================
function a5(m, cycles) {
    return { check: (c, script, t) => {
        const t0 = readdirSync(c.tmp).length + readdirSync(c.cwd).length;
        const bad = [];
        for (let i = 0; i < cycles; i++) {
            rmSync(c.out, { recursive: true, force: true });
            c.resetSpawns();
            const r1 = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.1']);
            const a = c.spawns().length, e = list(c.out).length;
            c.resetSpawns();
            const r2 = exec(script, c, [...MODES[m](c), '--node-version', 'v26.8.2']);
            const b = c.spawns().length;
            if (!(r1.status === 2 && a === 2 && e === 2 && r2.status === 1 && b === 8)) bad.push(`cycle ${i}: rc ${r1.status}/${r2.status} spawns ${a}+${b} O-entries ${e}`);
        }
        const t1 = readdirSync(c.tmp).length + readdirSync(c.cwd).length;
        t?.diagnostic(`bad=${bad.length} mktemp=${c.mktemps()} TMPDIR+cwd ${t0}->${t1} ${bad.slice(0, 2).join('; ')}`);
        assert.deepEqual(bad, []);
        assert.equal(c.mktemps(), 5 * cycles, 'mktemp calls');
        assert.equal(t1 - t0, 0, 'TMPDIR / cwd entry delta');
    } };
}
for (const m of ['diff', 'ref', 'file']) {
    const cs = a5(m, 20);
    test(`bytecode-budget order: A5 ${m}: 20 cycles of mismatch + accepted rerun -> spawns 2 + 8 per cycle, 2 O entries after each mismatch, 100 mktemp (5 per accepted run), TMPDIR / cwd delta 0`, { skip: modeSkip(m) }, () => {
        cs.check(mkCase(), SCRIPT);
    });
    const mu = m === 'diff' ? 'M-raw-early' : 'M-stage-early';
    test(`bytecode-budget order MUTANT ${mu}: [A5 ${m}, 2 cycles] goes red`, { skip: modeSkip(m) }, (t) => {
        const p = buildRoot(mu, MUTANTS[mu]);
        assert.throws(() => a5(m, 2).check(mkCase(), p, t), red, `${mu}: the A5 row still passes`);
    });
}
