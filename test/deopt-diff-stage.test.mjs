// test/deopt-diff-stage.test.mjs -- QA rows for ../deopt-diff.sh ref + file staging (Phase 3 G2, batch B3).
// ORACLE: PLAN-phase3-g2.md ASSERTIONS A1 (verdicts), A2 (refusals), A3 (no git on PATH), A4 (env), A5 (retention) plus
// ADDENDA A1 (MD-15 --out required, MD-16 byte-identical modules -> NO-VERDICT, MD-17 OUT/stage regular file), NOT the
// script's own --self-test. Expected values are hand-derived from the fixture contents below (fake node, R = 3 runs ->
// 2 + 3 x 2 = 8 spawns), never copied from a run.
// TIER: DETERMINISTIC (no V8 spawn; the fake node is a /bin/sh script). Every A1/A2 row also runs on the PRE-G2 build
// (resolved by CONTENT: first commit of `git rev-list HEAD -- deopt-diff.sh` whose blob has sha256/8 221ff2ec; none -> the
// twins are skipped, never passed), where it must exit 2 "unknown option --before(-ref)" (or the named option) AND its own
// check must be red. Mutants are exact-once edits of a temp copy of deopt-diff.sh, each red on its designed row.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, existsSync, linkSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const SCRIPT = join(PKG, 'deopt-diff.sh');
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
const haveGit = spawnSync('git', ['--version']).status === 0;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : (haveGit ? false : 'git not available');
const GITC = ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', 'user.name=t', '-c', 'user.email=t@t'];

function cleanEnv() {   // the child env: no editor vars, none of the 6 GIT_* location vars, global / system git config off
    const e = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    for (const k of [...GITVARS, 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'NODE_OPTIONS', 'GIT_CONFIG_PARAMETERS']) delete e[k];
    return e;
}
function git(cwd, ...a) {
    const r = spawnSync('git', [...GITC, ...a], { cwd, encoding: 'utf8', env: cleanEnv() });
    assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
}
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

// ---- trace fixtures (canned V8 lines, shapes per the script's header): E = an optimized compile of add, D = its eager deopt ----
const E = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const D = '[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>, 0x140083075c49 <Code TURBOFAN_JS>, opt id 2, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f64]';
const T_R1 = E + '\n', T_R2 = E + '\n' + D + '\n';

// ---- shared read-only fixtures: repo (m/trace.txt: tag r1 = T_R1, tag r2 = T_R2; HEAD = r2), drivers, a frozen copy ----
let ROOT;
try { ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'dds-root-'))); } catch (e) { throw e; }
after(() => rmSync(ROOT, { recursive: true, force: true }));
const REPO = join(ROOT, 'repo');
const TRACKED = join(REPO, 'm', 'trace.txt');           // tracked, content r2
const DRV = join(ROOT, 'drv', 'driver.js');            // imports './trace.txt'
const DRV_NOIMP = join(ROOT, 'drv', 'noimp.js');       // does not
const FROZEN = join(ROOT, 'frozen', 'trace.txt');      // untracked, r1
let TOP = '';
if (!skip) try {
    mkdirSync(join(REPO, 'm'), { recursive: true }); mkdirSync(join(ROOT, 'drv')); mkdirSync(join(ROOT, 'frozen'));
    git(REPO, 'init', '-q');
    writeFileSync(TRACKED, T_R1); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r1'); git(REPO, 'tag', 'r1');
    writeFileSync(TRACKED, T_R2); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r2'); git(REPO, 'tag', 'r2');
    writeFileSync(DRV, "import './trace.txt';\n"); writeFileSync(DRV_NOIMP, '// imports nothing\n');
    writeFileSync(FROZEN, T_R1);
    TOP = git(REPO, 'rev-parse', '--show-toplevel');
} catch (e) { rmSync(ROOT, { recursive: true, force: true }); throw e; }
const SHA12 = (ref) => git(REPO, 'rev-parse', ref).slice(0, 12);

// ---- the pre-G2 build (teeth), resolved by content ----
let BASE = null;
if (!skip) {
    const revs = spawnSync('git', ['-C', PKG, 'rev-list', 'HEAD', '--', 'deopt-diff.sh'], { encoding: 'utf8', env: cleanEnv() });
    if (revs.status === 0) {
        for (const c of revs.stdout.split('\n').filter(Boolean)) {
            const s = spawnSync('git', ['-C', PKG, 'show', `${c}:deopt-diff.sh`], { env: cleanEnv(), maxBuffer: 64 << 20 });
            if (s.status === 0 && sha8(s.stdout) === '221ff2ec') {
                BASE = join(ROOT, 'base-221ff2ec.sh'); writeFileSync(BASE, s.stdout); chmodSync(BASE, 0o755); break;
            }
        }
    }
}
const haveBase = BASE ? true : 'no commit of deopt-diff.sh with sha256/8 221ff2ec in the history (shallow clone?)';
// CI=true (GitHub Actions): a history row whose commit is missing FAILS instead of skipping; locally it skips with
// the reason. One spelling for every history row of this file.
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (have) => { if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`); };
const baseSkip = skip || histSkip(haveBase);

// ---- mutants: exact-once edits of a temp copy of the built script ----
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

// ---- one case = one fresh dir: fake node, tmp, cwd, live file, OUT path; removed in finally ----
// Fake node (/bin/sh): logs every call; --version exits FAKE_VER_RC or prints v26.8.2; --v8-options prints two flag
// entries (--allow-natives-syntax bool, --max-inlined-bytecode-size int default 460) and exits 0; neither probe bumps
// ./calls, so it counts driver spawns only (2R). Else cats ./trace.txt (cwd = OUT/stage/<side>),
// at call FAKE_AT rewrites FAKE_LIVE from FAKE_LIVE_SRC (after reading), and on the after side also cats FAKE_AFTER_EXTRA / exits FAKE_AFTER_RC.
function mkCase() {
    const dir = mkdtempSync(join(ROOT, 'c-'));
    const log = join(dir, 'argv.log'), calls = join(dir, 'calls'), node = join(dir, 'node');
    writeFileSync(node, `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in --version) if [ -n "\${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; echo v26.8.2; exit 0 ;; --v8-options) echo "  --allow-natives-syntax (allow natives syntax)"; echo "        type: bool  default: --no-allow-natives-syntax"; echo "  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)"; echo "        type: int  default: --max-inlined-bytecode-size=460"; exit 0 ;; esac
n=$(( $(cat ${JSON.stringify(calls)} 2>/dev/null || echo 0) + 1 )); echo "$n" > ${JSON.stringify(calls)}
if [ -f ./trace.txt ]; then cat ./trace.txt; fi
if [ -n "\${FAKE_LIVE:-}" ] && [ "$n" = "\${FAKE_AT:-0}" ]; then cp "$FAKE_LIVE_SRC" "$FAKE_LIVE"; fi
case "$PWD" in */after)
  if [ -n "\${FAKE_AFTER_EXTRA:-}" ]; then cat "$FAKE_AFTER_EXTRA"; fi
  if [ -n "\${FAKE_AFTER_RC:-}" ]; then exit "$FAKE_AFTER_RC"; fi ;; esac
exit 0
`);
    chmodSync(node, 0o755);
    const c = { dir, node, tmp: join(dir, 'tmp'), cwd: join(dir, 'cwd'), live: join(dir, 'live', 'trace.txt'), out: join(dir, 'out'), r2: join(dir, 'r2.txt'), extra: join(dir, 'extra.txt') };
    mkdirSync(c.tmp); mkdirSync(c.cwd); mkdirSync(join(dir, 'live'));
    writeFileSync(c.live, T_R2); writeFileSync(c.r2, T_R2); writeFileSync(c.extra, D + '\n');
    c.spawns = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    return c;
}
function withCase(script, cs, body) {
    let c;
    try {
        c = mkCase();
        if (cs.prep) cs.prep(c);
        const env = { ...cleanEnv(), TMPDIR: c.tmp, ...(cs.env ? cs.env(c) : {}) };
        const r = spawnSync('bash', [script, ...cs.args(c)], { encoding: 'utf8', timeout: 120000, cwd: c.cwd, env });
        return body(c, r);
    } finally { if (c) rmSync(c.dir, { recursive: true, force: true }); }
}
// ordered option sets (key order is argv order: the staged option comes first, so the pre-G2 build dies on it)
function flat(o) { const a = []; for (const [k, v] of Object.entries(o)) if (v !== null) a.push(k, v); return a; }
const TAIL = (c) => ['--fn', 'add', '--node', c.node];
const refO = (c, over = {}) => [...flat({ '--before-ref': 'r1', '--after-ref': 'r2', '--module': 'm/trace.txt', '--driver': DRV, '--repo': REPO, '--out': c.out, ...over }), ...TAIL(c)];
const fileO = (c, over = {}) => [...flat({ '--before': FROZEN, '--after': c.live, '--driver': DRV, '--out': c.out, ...over }), ...TAIL(c)];

// ---- a row = a case + a check; registered on the final build AND (teeth) on the pre-G2 build ----
const TWIN = /unknown option --before(-ref)?\b/;
function row(name, cs) {
    test(`deopt-diff stage: ${name}`, { skip }, () => withCase(SCRIPT, cs, (c, r) => cs.check(c, r)));
    test(`deopt-diff stage teeth: [${name}] exits 2 'unknown option' on the pre-G2 build (221ff2ec) and its check is red`, { skip: baseSkip }, () => {
        histGate(haveBase);
        return withCase(BASE, cs, (c, r) => {
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.match(r.stderr, cs.twin || TWIN);
            assert.throws(() => cs.check(c, r), assert.AssertionError, 'the row check must be red on the pre-G2 build');
        });
    });
}
const msg = (r) => `rc=${r.status}\n${r.stdout}${r.stderr}`;
const lines = (s) => s.split('\n');
const has = (r, line) => lines(r.stdout).filter((l) => l === line).length;

// =====================================================================================================
// A1 verdicts (fake node, R = 3 -> 8 spawns)
// =====================================================================================================
const L_DIFF = '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)';
const NOTE = 'NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)';
const L_ADD_DIFF = '  add: DIFF -- deopt multiset differs (before 0 | after 1)';
const L_MD16 = '  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise';
const R_DIFF = { args: (c) => refO(c), check: (c, r) => {
    assert.equal(r.status, 1, msg(r));                                        // red on M-sha (before staged from r2 -> exit 0), M-cwd
    assert.equal(c.spawns().length, 8, c.spawns().join('\n'));                // --version + --v8-options + 3 runs x 2 sides
    assert.equal(has(r, L_DIFF), 1, msg(r));
    assert.equal(has(r, 'mode    diff (ref)  runs 3  v8 flags --trace-deopt-verbose --trace-opt --no-concurrent-recompilation'), 1, msg(r));   // red on M-mode
    assert.equal(lines(r.stdout).filter((l) => l.startsWith('NOTE ')).length, 0, msg(r));      // red on M-note
    assert.equal(has(r, 'VERDICT DIFF'), 1, msg(r));
} };
row('A1 ref r1 | r2 -> exit 1, 8 spawns, the before=0 after=1 line, "mode    diff (ref)  runs 3", no NOTE', R_DIFF);
row('A1 ref r1 | r2 -> head line "before  r1 @ <sha12>  m/trace.txt  sha256/8 <x>" (sha12 from the repo, x from the staged file)', {
    args: (c) => refO(c), check: (c, r) => {
        assert.equal(r.status, 1, msg(r));
        const x = sha8(readFileSync(join(c.out, 'stage', 'before', 'trace.txt')));
        assert.equal(x, sha8(Buffer.from(T_R1)), 'the staged before file is not r1');   // independent: the fixture text
        assert.equal(has(r, `before  r1 @ ${SHA12('r1')}  m/trace.txt  sha256/8 ${x}`), 1, msg(r));
        assert.equal(has(r, `after   r2 @ ${SHA12('r2')}  m/trace.txt  sha256/8 ${sha8(Buffer.from(T_R2))}`), 1, msg(r));
        assert.equal(has(r, `driver  ${DRV}  sha256/8 ${sha8(readFileSync(DRV))}`), 1, msg(r));
    } });
const R_SAME = { args: (c) => refO(c, { '--after-ref': 'r1' }), check: (c, r) => {
    assert.equal(r.status, 0, msg(r));
    assert.equal(c.spawns().length, 8);
    assert.equal(has(r, NOTE), 1, msg(r));
    assert.equal(has(r, 'VERDICT SAME'), 1, msg(r));
} };
row('A1 ref r1 | r1 -> exit 0 SAME plus the exact null-control NOTE', R_SAME);
row('A1 file frozen r1 | live r2 -> exit 1 DIFF, mode "diff (file)"; OUT holds exactly 11 files (report.txt, raw 3 + 3, stage 2 + 2)', {
    args: (c) => fileO(c), check: (c, r) => {
        assert.equal(r.status, 1, msg(r));
        assert.equal(has(r, L_DIFF), 1, msg(r));
        assert.match(r.stdout, /^mode {4}diff \(file\) {2}runs 3 /m);
        const files = walk(c.out).map((f) => f.slice(c.out.length + 1)).sort();
        assert.equal(files.length, 11, files.join(' '));
        assert.deepEqual(files.filter((f) => f.startsWith('stage/')), ['stage/after/driver.js', 'stage/after/trace.txt', 'stage/before/driver.js', 'stage/before/trace.txt']);
        assert.equal(files.filter((f) => f.startsWith('raw/before/')).length, 3);
        assert.equal(files.filter((f) => f.startsWith('raw/after/')).length, 3);
    } });
const F_LIVE = {
    args: (c) => fileO(c, { '--after': c.live }),
    prep: (c) => { writeFileSync(c.live, T_R1); },                           // frozen r1 | live r1 (byte-identical), live rewritten to r2 at driver call 3 (node spawn 5: before run 2, after the --version + --v8-options probes and runs 1 before / after)
    env: (c) => ({ FAKE_LIVE: c.live, FAKE_LIVE_SRC: c.r2, FAKE_AT: '3' }),
    check: (c, r) => {
        assert.equal(readFileSync(c.live, 'utf8'), T_R2, 'the fake did not rewrite the live --after at driver call 3');
        assert.equal(r.status, 0, msg(r));                                   // red on M-cp-ln (cp -> ln -s): after runs 2-3 read r2 -> null control, exit 2
        assert.equal(has(r, 'VERDICT SAME'), 1, msg(r));
        assert.equal(readFileSync(join(c.out, 'stage', 'after', 'trace.txt'), 'utf8'), T_R1);
        // the counter counts driver spawns only (--version / --v8-options exit before it): R = 3 (default --runs) -> 2R = 6.
        // Red when a probe is counted (FAKE_AT=3 would then land on driver call 2 or 1, and this row would still exit 0).
        assert.equal(readFileSync(join(c.dir, 'calls'), 'utf8'), '6\n', 'fake node driver-call counter != 2R (6)');
    },
};
row('A1 file: the live --after rewritten at driver call 3 -> exit 0 (the staged copy protects it)', F_LIVE);
const MD16 = { args: (c) => refO(c, { '--after-ref': 'r1' }), env: (c) => ({ FAKE_AFTER_EXTRA: c.extra }), check: (c, r) => {
    assert.equal(r.status, 2, msg(r));                                       // red on M-noise-off (exit 1)
    assert.equal(c.spawns().length, 8);
    assert.equal(has(r, L_ADD_DIFF), 1, msg(r));
    assert.equal(has(r, L_MD16), 1, msg(r));
    assert.ok(lines(r.stdout).indexOf(L_ADD_DIFF) < lines(r.stdout).indexOf(L_MD16), 'the DIFF line must come before the NO-VERDICT line');   // (ii) order
    assert.equal(has(r, 'VERDICT NO-VERDICT'), 1, msg(r));
} };
row('A1 ref r1 | r1 with an after-only deopt -> exit 2: the fn DIFF line, THEN the byte-identical NO-VERDICT line (MD-16)', MD16);
const MD16_PERFN = { args: (c) => refO(c, { '--after-ref': 'r1' }), env: () => ({ FAKE_AFTER_RC: '3' }), check: (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.spawns().length, 8);
    assert.equal(has(r, '  add: NO-VERDICT -- after: driver exited 3 in run 1'), 1, msg(r));   // its OWN reason
    assert.equal(has(r, L_MD16), 0, msg(r));                                 // (i) red on `$VERDICT == DIFF` -> `$VERDICT != SAME`
    assert.equal(lines(r.stdout).filter((l) => l.includes('byte-identical') && !l.startsWith('NOTE ')).length, 0, msg(r));
    assert.equal(has(r, 'VERDICT NO-VERDICT'), 1, msg(r));
} };
row('A1 ref r1 | r1 with an after driver exiting 3 (per-fn NO-VERDICT) -> exit 2 for its own reason, the MD-16 line ABSENT', MD16_PERFN);

// =====================================================================================================
// A2 refusals: exit 2, 0 spawns, its OWN die line exactly once, no OUT created (R13 / R14 leave OUT byte-unchanged)
// =====================================================================================================
function walk(d) { return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])); }
function snap(d) {   // listing (dirs and files) plus every file's contents
    const all = (p) => readdirSync(p, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [join(p, e.name) + '/', ...all(join(p, e.name))] : [join(p, e.name)]));
    return all(d).sort().map((f) => (f.endsWith('/') ? f : `${f}\n${readFileSync(f, 'utf8')}`)).join('\n--\n');
}
function refuses(text, how = 'noout') {
    return (c, r) => {
        const die = lines(r.stderr).filter((l) => l.startsWith('deopt-diff: '));
        assert.equal(r.status, 2, msg(r));
        assert.deepEqual(die, ['deopt-diff: ' + (typeof text === 'function' ? text(c) : text)], msg(r));   // its own die line, exactly once
        assert.equal(lines(r.stderr).filter((l) => l === 'VERDICT NO-VERDICT').length, 1, msg(r));
        assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
        if (how === 'noout') assert.ok(!existsSync(c.out), 'OUT was created');
        else if (how === 'nowrite') assert.deepEqual(readdirSync(c.cwd), [], 'cwd holds entries');
        else assert.equal(snap(c.out), c.snap, 'OUT changed');
    };
}
function refusal(name, args, text, extra = {}) {
    const cs = { args, check: refuses(text, extra.how), ...extra };
    row(`A2 refusal ${name}`, cs);
    return cs;
}
const GO_ONLY = '--driver / --module / --repo go only with --before-ref/--after-ref or --before/--after';
const CS_R1 = refusal('R1: --before-ref alone', (c) => refO(c, { '--after-ref': null }), '--before-ref and --after-ref go together');
refusal('R2: --before alone', (c) => fileO(c, { '--after': null }), '--before and --after go together');
refusal('R3: ref pair and file pair together', (c) => refO(c, { '--before': FROZEN, '--after': c.live }),
    '--before-ref/--after-ref (ref mode) and --before/--after (file mode) are exclusive: give one pair');
refusal('R4: a positional DRIVER', (c) => [...refO(c), DRV], 'ref mode takes no DRIVER paths (give --driver FILE), got 1');
refusal('R5: no --out (nothing written)', (c) => refO(c, { '--out': null }), 'ref mode needs --out DIR (the staged copies are written to DIR/stage)', { how: 'nowrite' });
const CS_R6 = refusal('R6: --driver in driver mode', (c) => ['--driver', DRV, '--fn', 'add', '--node', c.node, '--out', c.out, DRV, DRV], GO_ONLY, { twin: /unknown option --driver/ });
refusal("R7: no './trace.txt' import", (c) => refO(c, { '--driver': DRV_NOIMP }), `--driver must import './trace.txt' (the staged module beside it): ${DRV_NOIMP}`);
refusal('R8: a bad ref', (c) => refO(c, { '--before-ref': 'nosuch' }), `--before-ref: 'nosuch' is not a commit in ${TOP} (git fetch?)`);
refusal("R9: a '..' --module", (c) => refO(c, { '--module': 'm/../m/trace.txt' }), "--module must not have an empty, '.' or '..' segment, got 'm/../m/trace.txt'");
refusal('R10: a tracked --before', (c) => fileO(c, { '--before': TRACKED }),
    `--before is a git-tracked working-tree file (${TRACKED}): use a FROZEN copy (untracked) or --before-ref`);
refusal('R11: a hard link of --after', (c) => fileO(c, { '--before': join(c.dir, 'x', 'y', 'other.txt') }),
    '--before and --after are the same file (hard link / symlink): --before must be a FROZEN copy',
    { prep: (c) => { mkdirSync(join(c.dir, 'x', 'y'), { recursive: true }); linkSync(c.live, join(c.dir, 'x', 'y', 'other.txt')); } });
refusal('R12: GIT_DIR set', (c) => refO(c),
    'GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES is set: unset it (ref mode finds each repo from its path)',
    { env: () => ({ GIT_DIR: join(ROOT, 'no-such.git') }) });
refusal('R13: a non-empty OUT/stage (OUT left byte-unchanged)', (c) => refO(c), (c) => `--out: ${c.out}/stage is not empty (give a new or empty DIR)`,
    { how: 'snap', prep: (c) => { mkdirSync(join(c.out, 'stage', 'x'), { recursive: true }); writeFileSync(join(c.out, 'stage', 'x', 'junk'), 'j\n'); writeFileSync(join(c.out, 'report.txt'), 'old\n'); c.snap = snap(c.out); } });
const CS_R14 = refusal('R14: OUT/stage is a file (exists and is not a directory)', (c) => refO(c), (c) => `--out: ${c.out}/stage exists and is not a directory`,
    { how: 'snap', prep: (c) => { mkdirSync(c.out); writeFileSync(join(c.out, 'stage'), 'x\n'); c.snap = snap(c.out); } });
const CS_VER = { args: (c) => refO(c), env: () => ({ FAKE_VER_RC: '1' }), check: (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.equal(c.spawns().length, 1, c.spawns().join('\n'));                // only the --version spawn
    assert.equal(lines(r.stderr).filter((l) => /^deopt-diff: cannot run .*\/node --version$/.test(l)).length, 1, msg(r));
    assert.ok(!existsSync(c.out), 'OUT was created before the --version spawn');   // red on M-order
} };
row('A2 staged mode with a failing node --version -> exit 2 after 1 spawn, no OUT', CS_VER);

// =====================================================================================================
// mutants: each must be red on its designed row (the observed rc / output goes to the test diagnostics)
// =====================================================================================================
function mutant(name, anchorDesc, edits, cs, observe) {
    test(`deopt-diff stage MUTANT ${name} (${anchorDesc}): its row goes red`, { skip }, (t) => {
        const p = variant(name, edits);
        withCase(p, cs, (c, r) => {
            t.diagnostic(`${name}: rc=${r.status} stdout=${JSON.stringify(r.stdout.split('\n').filter((l) => /VERDICT|NOTE|before=|NO-VERDICT|^mode/.test(l)))} stderr=${JSON.stringify(r.stderr.trim().slice(0, 160))}`);
            assert.throws(() => cs.check(c, r), assert.AssertionError, `${name}: the row still passes on the mutant`);
            observe(c, r);
        });
    });
}
mutant('M-sha', 'x="$STAGE_SHA_B" -> x="$STAGE_SHA_A"', [['x="$STAGE_SHA_B"', 'x="$STAGE_SHA_A"']], R_DIFF, (c, r) => assert.equal(r.status, 0, msg(r)));
mutant('M-cwd', 'dirname "$DRV_A" -> "$DRV_B"', [['DRV_A_DIR=$(dirname "$DRV_A")', 'DRV_A_DIR=$(dirname "$DRV_B")']], R_DIFF, (c, r) => assert.equal(r.status, 0, msg(r)));
mutant('M-cp-ln', 'cp "$x" -> ln -s "$x"', [['cp "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"', 'ln -s "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"']], F_LIVE, (c, r) => assert.equal(r.status, 2, msg(r)));
mutant('M-note', 'else STAGE_SAME=0 -> else STAGE_SAME=1', [['else STAGE_SAME=0; fi', 'else STAGE_SAME=1; fi']], R_DIFF, (c, r) => { assert.equal(r.status, 2, msg(r)); assert.equal(has(r, NOTE), 1, msg(r)); });
mutant('M-mode', 'MODE="diff ($STAGE_MODE)" -> MODE="diff"', [['MODE="diff ($STAGE_MODE)"', 'MODE="diff"']], R_DIFF, (c, r) => { assert.equal(r.status, 1, msg(r)); assert.match(r.stdout, /^mode {4}diff {2}runs 3 /m); });
const MD16_GATE = '[[ $STAGED == 1 && $STAGE_SAME == 1 && $VERDICT == DIFF ]]';
mutant('M-noise-off', 'MD-16 block never fires', [[MD16_GATE, '[[ $STAGED == 1 && $STAGE_SAME == 1 && $VERDICT == NEVER ]]']], MD16, (c, r) => { assert.equal(r.status, 1, msg(r)); assert.equal(has(r, L_MD16), 0, msg(r)); });
mutant('M-md16-ne', '$VERDICT == DIFF -> $VERDICT != SAME', [[MD16_GATE, '[[ $STAGED == 1 && $STAGE_SAME == 1 && $VERDICT != SAME ]]']], MD16_PERFN, (c, r) => { assert.equal(r.status, 2, msg(r)); assert.equal(has(r, L_MD16), 1, msg(r)); });
mutant('M-nocheck', 'stage_check -> :', [['  stage_check   # lib/stage.sh', '  :   # lib/stage.sh']], CS_R1, (c, r) => { assert.doesNotMatch(r.stderr, /go together/, msg(r)); });
mutant('M-goonly', 'the "go only with" refusal -> true', [['[[ $STAGED == 1 || -z "$DRIVER$MODULE$REPO" ]] || die', 'true || die']], CS_R6, (c, r) => { assert.doesNotMatch(r.stderr, /go only with/, msg(r)); });
mutant('M-stagefile', 'the MD-17 line -> :', [['-d $OUT/stage ]] || die "--out: $OUT/stage exists and is not a directory"', '-d $OUT/stage ]] || : #']], CS_R14, (c, r) => { assert.equal(r.status, 2, msg(r)); assert.match(r.stderr, /is not empty/, msg(r)); assert.doesNotMatch(r.stderr, /is not a directory/); });
mutant('M-order', 'stage_write before the --version spawn',
    [['GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die', 'if [[ $STAGED == 1 ]]; then stage_write; fi\nGOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die']], CS_VER,
    (c, r) => { assert.equal(r.status, 2, msg(r)); assert.ok(existsSync(join(c.out, 'stage')), 'stage not written before --version'); });

// =====================================================================================================
// A5 retention: 20 staged ref runs, each into a new --out. The budget is spawns and files (no GC in bash, S-12).
// =====================================================================================================
const repoState = () => ({ head: git(REPO, 'rev-parse', 'HEAD'), refs: git(REPO, 'for-each-ref'), status: git(REPO, 'status', '--porcelain') });
function realMktemp() { for (const d of (process.env.PATH || '').split(':')) { if (d && existsSync(join(d, 'mktemp'))) return join(d, 'mktemp'); } return '/usr/bin/mktemp'; }
test('deopt-diff stage A5 retention: 20 ref runs give exactly 160 spawns and 11 files per OUT; TMPDIR, cwd and mktemp stay untouched; the repo is unchanged', { skip }, () => {
    let c;
    try {
        c = mkCase();
        const shim = join(c.dir, 'shim'), mlog = join(c.dir, 'mktemp.log');
        mkdirSync(shim);
        writeFileSync(join(shim, 'mktemp'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(mlog)}\nexec ${JSON.stringify(realMktemp())} "$@"\n`); chmodSync(join(shim, 'mktemp'), 0o755);
        const before = repoState();
        assert.equal(before.status, '');
        for (let i = 0; i < 20; i++) {
            const out = join(c.dir, 'outs', `o${i}`);
            const r = spawnSync('bash', [SCRIPT, ...refO({ ...c, out })], { encoding: 'utf8', timeout: 120000, cwd: c.cwd, env: { ...cleanEnv(), TMPDIR: c.tmp, PATH: `${shim}:${process.env.PATH}` } });
            assert.equal(r.status, 1, `run ${i}: ${msg(r)}`);
            const files = walk(out).map((f) => f.slice(out.length + 1)).sort();
            assert.equal(files.length, 11, `run ${i}: ${files.join(' ')}`);   // report.txt + raw 3 + 3 + stage 2 + 2
        }
        assert.equal(c.spawns().length, 20 * 8, 'node spawns over 20 runs');
        assert.equal(existsSync(mlog) ? readFileSync(mlog, 'utf8') : '', '', 'the staged run called mktemp');
        assert.deepEqual(readdirSync(c.tmp), [], 'TMPDIR kept entries');
        assert.deepEqual(readdirSync(c.cwd), [], 'cwd kept entries');
        assert.deepEqual(repoState(), before, 'the repo changed (status / HEAD / refs)');
    } finally { if (c) rmSync(c.dir, { recursive: true, force: true }); }
});
test('deopt-diff stage A5 control: OUT/stage -> $TMPDIR/stage leaves >= 4 files in TMPDIR (the retention row can see a leak)', { skip }, (t) => {
    withCase(SCRIPT, {
        args: (c) => refO(c),
        prep: (c) => { mkdirSync(join(c.tmp, 'stage')); mkdirSync(c.out); symlinkSync(join(c.tmp, 'stage'), join(c.out, 'stage')); },
    }, (c, r) => {
        assert.equal(r.status, 1, msg(r));
        const left = walk(c.tmp).length;
        t.diagnostic(`A5 control: ${left} files left in TMPDIR`);
        assert.ok(left >= 4, `only ${left} files in TMPDIR`);   // 2 sides x (trace.txt + driver.js)
    });
});

// =====================================================================================================
// A3 / A4 self-test rows: the 18 staged checks present exactly once, in every env the hook / agent harness can leak
// (counts are RELATIVE: the pre-G2 build's ok count + the 18 listed names; no count is copied from another file).
// Runs go through a pool of 3 started at load (a self-test takes ~9 s alone).
// =====================================================================================================
const ST_NAMES = ['S1 ', 'S2 ', 'S3 ', 'S4 ', ...Array.from({ length: 14 }, (_, i) => `staged refusal R${i + 1}: `)];
const okLines = (o) => o.split('\n').filter((l) => l.startsWith('ok '));
const failLines = (o) => o.split('\n').filter((l) => l.startsWith('FAIL '));
const countOf = (o, name) => okLines(o).filter((l) => l.startsWith('ok ' + name)).length;
let active = 0; const waiting = [];
function pooled(fn) {
    return new Promise((res, rej) => {
        const go = () => { active++; fn().then(res, rej).finally(() => { active--; const n = waiting.shift(); if (n) n(); }); };
        if (active < 3) go(); else waiting.push(go);
    });
}
function selfRun(script, env) {
    return pooled(() => new Promise((res, rej) => {
        const c = spawn('bash', [script, '--self-test'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
        const kill = setTimeout(() => c.kill('SIGTERM'), 240000);
        c.on('error', (e) => { clearTimeout(kill); rej(e); });
        c.on('close', (status) => { clearTimeout(kill); res({ status, out, err }); });
    }));
}
const ST = {};
if (!skip) {
    const guard = (p) => { p.catch(() => {}); return p; };
    const missing = { ...cleanEnv() }; for (const k of GITVARS) missing[k] = join(ROOT, 'no-such-' + k);
    const nogit = join(ROOT, 'nogit-bin'); mkdirSync(nogit);
    const dirs = ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'];
    for (const tool of ['bash', 'sh', 'tr', 'cat', 'awk', 'sed', 'sort', 'uniq', 'grep', 'env', 'seq', 'stat', 'cmp', 'cp', 'mkdir', 'rm', 'dirname', 'basename', 'readlink', 'wc', 'ls', 'find', 'mktemp',
        'paste', 'head', 'tail', 'cut', 'expr', 'date', 'sleep', 'tee', 'id', 'uname', 'ln', 'chmod', 'mv', 'touch', 'od', 'xargs', 'diff', 'shasum', 'sha256sum', 'openssl', 'perl', 'printf', 'sync', 'true', 'false', 'test']) {
        const d = dirs.find((x) => existsSync(join(x, tool))); if (d && !existsSync(join(nogit, tool))) symlinkSync(join(d, tool), join(nogit, tool));
    }
    ST.base = guard(selfRun(SCRIPT, cleanEnv()));
    ST.editor = guard(selfRun(SCRIPT, { ...cleanEnv(), GIT_EDITOR: 'true', EDITOR: 'true', VISUAL: 'true' }));
    ST.missing = guard(selfRun(SCRIPT, missing));
    ST.params = guard(selfRun(SCRIPT, { ...cleanEnv(), GIT_CONFIG_PARAMETERS: "'tag.gpgsign'='true'" }));
    ST.nogit = guard(selfRun(SCRIPT, { ...cleanEnv(), PATH: nogit }));
    ST.msha = guard(selfRun(variant('ST-M-sha', [['x="$STAGE_SHA_B"', 'x="$STAGE_SHA_A"']]), cleanEnv()));
    ST.notag = guard(selfRun(variant('ST-M-tag', [['-c tag.gpgSign=false', '']]), { ...cleanEnv(), GIT_CONFIG_PARAMETERS: "'tag.gpgsign'='true'" }));
    if (BASE) ST.pre = guard(selfRun(BASE, cleanEnv()));
}
test('deopt-diff stage A3/A4: --self-test (host env) exits 0, no FAIL, each of the 18 staged checks exactly once', { skip }, async () => {
    const r = await ST.base;
    assert.equal(r.status, 0, r.out + r.err);
    assert.deepEqual(failLines(r.out), []);
    for (const n of ST_NAMES) assert.equal(countOf(r.out, n), 1, `check "${n}"`);
    assert.equal(ST_NAMES.length, 18);
});
test('deopt-diff stage A3 teeth: the pre-G2 build (221ff2ec) has none of the 18 staged checks; host-env ok count = pre-G2 count + 39 (18 staged + 13 G3 B2 + 5 B-four dd + 3 MD-50..56 G2)', { skip: baseSkip }, async () => {
    histGate(haveBase);
    const r = await ST.pre;
    assert.equal(r.status, 0, r.out + r.err);
    for (const n of ST_NAMES) assert.equal(countOf(r.out, n), 0, n);
    assert.equal(okLines((await ST.base).out).length, okLines(r.out).length + ST_NAMES.length + 13 + 5 + 3); // 92 = 53 + 39 = 53 + 18 + 13 + 5 + 3 (spec: CHECKS 89 -> 92)
});
for (const [label, key] of [['GIT_EDITOR / EDITOR / VISUAL = true', 'editor'], ['the six GIT_* vars set to missing paths', 'missing'], ["GIT_CONFIG_PARAMETERS=\"'tag.gpgsign'='true'\"", 'params']]) {
    test(`deopt-diff stage A4 env: --self-test with ${label} -> exit 0, same ok count as the host-env run, all 18 staged checks once`, { skip }, async () => {
        const r = await ST[key], b = await ST.base;
        assert.equal(r.status, 0, r.out + r.err);
        assert.deepEqual(failLines(r.out), []);
        assert.equal(okLines(r.out).length, okLines(b.out).length);
        for (const n of ST_NAMES) assert.equal(countOf(r.out, n), 1, n);
    });
}
test('deopt-diff stage A3: a PATH without git -> exit 1, exactly one FAIL (the git line), the 18 staged checks absent, ok count = base - 18', { skip }, async () => {
    const r = await ST.nogit, b = await ST.base;
    const f = failLines(r.out);
    assert.equal(r.status, 1, r.out + r.err);
    assert.equal(f.length, 1, f.join('\n'));
    assert.ok(f[0].startsWith('FAIL ref / file modes: git on PATH'), f[0]);
    assert.equal(okLines(r.out).length, okLines(b.out).length - ST_NAMES.length);
    for (const n of ST_NAMES) assert.equal(countOf(r.out, n), 0, n);
});
test('deopt-diff stage A3 control MUTANT (before staged from AFTER_REF): --self-test exits 1 with a FAIL naming S1', { skip }, async () => {
    const r = await ST.msha, f = failLines(r.out);
    assert.equal(r.status, 1, r.out + r.err);
    assert.ok(f.some((l) => l.startsWith('FAIL S1 ')), f.join('\n'));
});
test("deopt-diff stage A4 teeth MUTANT (tg without -c tag.gpgSign=false) + GIT_CONFIG_PARAMETERS tag.gpgsign=true -> exit 1, one FAIL on the repo set-up", { skip }, async () => {
    const r = await ST.notag, f = failLines(r.out);
    assert.equal(r.status, 1, r.out + r.err);
    assert.equal(f.length, 1, f.join('\n'));
    assert.ok(f[0].startsWith('FAIL ref / file modes: temp git repo set up'), f[0]);
});
