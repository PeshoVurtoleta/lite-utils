// test/deopt-diff-stage-boundary.test.mjs -- QA boundary rows for ../deopt-diff.sh ref + file staging (Phase 3 G2,
// lib/stage.sh) that test/deopt-diff-stage.test.mjs and the script's --self-test do not pin.
// ORACLE: .handoff/PLAN-phase3-g2.md ASSERTIONS A1-A5 + ADDENDA A1 (MD-15 / MD-16 / MD-17) and the `deopt-diff.sh -h`
// text where an assertion defers to it -- never what the script printed. Expected values are hand-derived from the
// fixture text below (fake node, R runs -> 2 + 2R spawns).
// TIER: DETERMINISTIC (no V8 spawn; the fake node is a /bin/sh script; no timed assertion).
// Teeth: every row of NEW (G2) behaviour also runs on the PRE-G2 build, resolved by CONTENT (the first commit of
// `git rev-list HEAD -- deopt-diff.sh` whose blob has sha256/8 221ff2ec; none -> those twins SKIP, never pass), where it
// must exit 2 "unknown option --before(-ref)" (or the row's own twin text) AND its own check must go red. Rows that pin
// a KNOWN GAP or a PRE-EXISTING behaviour say so, and each has a named exact-once mutant of a copy that turns it red.
// Harness: every git (fixtures and the script under test) runs without GIT_EDITOR / EDITOR / VISUAL and the six GIT_*
// location vars, with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 and -c hooks / signing / user pinned.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
    mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, existsSync, symlinkSync, realpathSync,
    lstatSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capSync, armCap, noTimeout } from './spawn-cap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const SCRIPT = join(PKG, 'deopt-diff.sh');
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
const haveGit = spawnSync('git', ['--version']).status === 0;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : (haveGit ? false : 'git not available');
const GITC = ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', 'user.name=t', '-c', 'user.email=t@t'];

function cleanEnv() {   // no editor vars, none of the six GIT_* location vars, global / system git config off
    const e = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    for (const k of [...GITVARS, 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'NODE_OPTIONS', 'GIT_CONFIG_PARAMETERS']) delete e[k];
    return e;
}
function git(cwd, ...a) {
    const r = capSync('git', [...GITC, ...a], { cwd, encoding: 'utf8', env: cleanEnv(), killSignal: 'SIGTERM' }, 30000, `git ${a[0]}`);
    assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
}
const sha8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

// ---- trace fixtures: E / D = add's optimized compile and eager deopt; ES = sub's compile (sub never deopts) ----
const E = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const D = '[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>, 0x140083075c49 <Code TURBOFAN_JS>, opt id 2, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f64]';
const ES = '[completed compiling 0x0a1 <JSFunction sub (sfi = 0x0b2)> (target MAGLEV) - took 0.1, 0.2, 0.3 ms]';
const T_R1 = `${E}\n${ES}\n`, T_R2 = `${E}\n${D}\n${ES}\n`;
const TRACE = '--trace-deopt-verbose --trace-opt --no-concurrent-recompilation';

// section 9's /bin/bash probe, run before ROOT exists (it reads nothing from ROOT): a load-time throw leaves no ddsb-root-*
// an absent /bin/bash stays the section 9 skip (a spawn ENOENT would throw in capSync); a hung one fails by name
const bv = existsSync('/bin/bash') ? capSync('/bin/bash', ['--version'], { encoding: 'utf8' }, 30000, '/bin/bash --version') : { status: null, stdout: '' };

// ---- shared read-only fixtures. REPO m/trace.txt: r1 = T_R1 (tag r1, annotated tag ar1, branch b1), r2 = T_R2 (tag r2,
// HEAD). FROZEN = an untracked r1 copy under ANOTHER file name (file mode stages it as --after's name) ----
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'ddsb-root-')));
after(() => { try { chmodTree(ROOT); } finally { rmSync(ROOT, { recursive: true, force: true }); } });
const REPO = join(ROOT, 'repo');
const DRV = join(ROOT, 'drv', 'driver.js');
const FROZEN = join(ROOT, 'frozen', 'r1-frozen.copy');
const SHA = {};
if (!skip) try {
    mkdirSync(join(REPO, 'm'), { recursive: true }); mkdirSync(join(ROOT, 'drv')); mkdirSync(join(ROOT, 'frozen'));
    git(REPO, 'init', '-q');
    writeFileSync(join(REPO, 'm', 'trace.txt'), T_R1); git(REPO, 'add', '.'); git(REPO, 'commit', '-q', '-m', 'r1');
    git(REPO, 'tag', 'r1'); git(REPO, 'tag', '-a', '-m', 'ann', 'ar1', 'r1'); git(REPO, 'branch', 'b1', 'r1');
    writeFileSync(join(REPO, 'm', 'trace.txt'), T_R2); git(REPO, 'commit', '-q', '-a', '-m', 'r2'); git(REPO, 'tag', 'r2');
    writeFileSync(DRV, "import './trace.txt';\n"); writeFileSync(FROZEN, T_R1);
    SHA.r1 = git(REPO, 'rev-parse', 'r1^{commit}'); SHA.r2 = git(REPO, 'rev-parse', 'r2^{commit}'); SHA.ar1obj = git(REPO, 'rev-parse', 'ar1');
    assert.notEqual(SHA.ar1obj, SHA.r1, 'ar1 must be an annotated tag object');
} catch (e) { rmSync(ROOT, { recursive: true, force: true }); throw e; }
const repoState = () => ({ head: git(REPO, 'rev-parse', 'HEAD'), refs: git(REPO, 'for-each-ref'), status: git(REPO, 'status', '--porcelain') });

// ---- the pre-G2 build (teeth), resolved by content ----
let BASE = null;
if (!skip) try {
    const revs = capSync('git', ['-C', PKG, 'rev-list', 'HEAD', '--', 'deopt-diff.sh'], { encoding: 'utf8', env: cleanEnv() }, 30000, 'git rev-list');
    if (revs.status === 0) {
        for (const c of revs.stdout.split('\n').filter(Boolean)) {
            const s = capSync('git', ['-C', PKG, 'show', `${c}:deopt-diff.sh`], { env: cleanEnv(), maxBuffer: 64 << 20 }, 30000, 'git show');
            if (s.status === 0 && sha8(s.stdout) === '221ff2ec') {
                BASE = join(ROOT, 'base-221ff2ec.sh'); writeFileSync(BASE, s.stdout); chmodSync(BASE, 0o755); break;
            }
        }
    }
} catch (e) { rmSync(ROOT, { recursive: true, force: true }); throw e; }
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

// ---- helpers ----
function chmodTree(d) {   // give back rwx to every dir under d (the mode-000 row), so rmSync can remove it
    let st; try { st = lstatSync(d); } catch { return; }
    if (!st.isDirectory()) return;
    try { chmodSync(d, 0o755); } catch { /* not ours */ }
    for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) chmodTree(join(d, e.name));
}
function walkL(d, pre = d) {   // [rel path, kind] for every non-dir entry (symlinks NOT followed: kind 'l')
    return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = join(d, e.name);
        if (e.isDirectory()) return walkL(p, pre);
        return [[p.slice(pre.length + 1), e.isSymbolicLink() ? 'l' : 'f']];
    });
}
const files = (d) => walkL(d).filter(([, k]) => k === 'f').map(([p]) => p).sort();
const msg = (r) => `rc=${r.status} sig=${r.signal}\n${r.stdout}${r.stderr}`;
const lines = (s) => s.split('\n');
const has = (r, line) => lines(r.stdout).filter((l) => l === line).length;
const verdict = (r, rc, v) => { assert.equal(r.status, rc, msg(r)); assert.equal(has(r, `VERDICT ${v}`), 1, msg(r)); };
function shimDir(dir) {   // a logging mktemp first on PATH (macOS mktemp ignores TMPDIR; a bare `mktemp -d` lands in the real temp dir)
    const real = capSync('sh', ['-c', 'command -v mktemp'], { encoding: 'utf8' }, 30000, 'command -v mktemp').stdout.trim();
    assert.ok(real, 'no real mktemp on PATH');
    const bin = join(dir, 'shim'), log = join(dir, 'mktemp.log');
    mkdirSync(bin); writeFileSync(log, '');
    writeFileSync(join(bin, 'mktemp'), `#!/bin/sh\np=$(${JSON.stringify(real)} "$@") || exit $?\necho "$p" >> ${JSON.stringify(log)}\necho "$p"\n`);
    chmodSync(join(bin, 'mktemp'), 0o755);
    return { bin, made: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

// ---- one case = one fresh dir: fake node (logs "$PWD|argv"), tmp, cwd, live file, OUT path; removed in finally ----
// Fake node: --version prints v26.8.2; --v8-options prints two flag entries (--allow-natives-syntax bool,
// --max-inlined-bytecode-size int default 460) and exits 0; neither probe bumps ./calls. Else cats ./trace.txt
// (cwd = OUT/stage/<side>), on the after side also cats
// $FAKE_AFTER_EXTRA; at driver call $FAKE_HANG_AT it touches $FAKE_READY and sleeps (the SIGTERM row).
function mkCase() {
    const dir = mkdtempSync(join(ROOT, 'c-'));
    const log = join(dir, 'argv.log'), calls = join(dir, 'calls'), node = join(dir, 'node');
    writeFileSync(node, `#!/bin/sh
echo "$PWD|$*" >> ${JSON.stringify(log)}
case "$1" in --version) echo v26.8.2; exit 0 ;; --v8-options) echo "  --allow-natives-syntax (allow natives syntax)"; echo "        type: bool  default: --no-allow-natives-syntax"; echo "  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)"; echo "        type: int  default: --max-inlined-bytecode-size=460"; exit 0 ;; esac
n=$(( $(cat ${JSON.stringify(calls)} 2>/dev/null || echo 0) + 1 )); echo "$n" > ${JSON.stringify(calls)}
if [ -n "\${FAKE_HANG_AT:-}" ] && [ "$n" = "$FAKE_HANG_AT" ]; then : > "$FAKE_READY"; sleep 60; fi
if [ -f ./trace.txt ]; then cat ./trace.txt; fi
case "$PWD" in */after) if [ -n "\${FAKE_AFTER_EXTRA:-}" ]; then cat "$FAKE_AFTER_EXTRA"; fi ;; esac
exit 0
`);
    chmodSync(node, 0o755);
    const c = { dir, node, tmp: join(dir, 'tmp'), cwd: join(dir, 'cwd'), live: join(dir, 'live', 'trace.txt'), out: join(dir, 'out'), extra: join(dir, 'extra.txt') };
    mkdirSync(c.tmp); mkdirSync(c.cwd); mkdirSync(join(dir, 'live'));
    writeFileSync(c.live, T_R2); writeFileSync(c.extra, D + '\n');
    c.log = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    c.spawns = () => c.log().length;
    c.drivers = () => c.log().filter((l) => !l.endsWith('|--version') && !l.endsWith('|--v8-options')).map((l) => l.split('|'));
    return c;
}
function runAsync(cmd, args, opts) {
    return new Promise((resolve, reject) => {
        const ch = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        ch.stdout.setEncoding('utf8'); ch.stderr.setEncoding('utf8');
        ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { err += d; });
        const h = armCap(ch, 90000, 'SIGTERM');
        ch.on('error', (e) => { h.clear(); reject(e); });
        ch.on('close', (status, signal) => {
            h.clear();
            const r = { status, signal, stdout: out, stderr: err };
            // a run the cap killed rejects by name before any caller reads its status
            try { noTimeout({ ...r, timedOut: h.timedOut, cap: h.cap }, [cmd, ...args.slice(0, 1)].join(' ')); } catch (e) { reject(e); return; }
            resolve(r);
        });
    });
}
async function withCase(script, cs, body) {
    let c;
    try {
        c = mkCase();
        if (cs.prep) cs.prep(c);
        const env = { ...cleanEnv(), TMPDIR: c.tmp, ...(cs.env ? cs.env(c) : {}) };
        const r = await runAsync(cs.bash || 'bash', [script, ...cs.args(c)], { cwd: cs.cwd ? cs.cwd(c) : c.cwd, env });
        return body(c, r);
    } finally { if (c) { chmodTree(c.dir); rmSync(c.dir, { recursive: true, force: true }); } }
}
function flat(o) { const a = []; for (const [k, v] of Object.entries(o)) if (v !== null) a.push(k, v); return a; }
const TAIL = (c, fn = 'add') => ['--fn', fn, '--node', c.node];
// the staged option comes FIRST in argv, so the pre-G2 build dies on it
const refO = (c, over = {}, fn) => [...flat({ '--before-ref': 'r1', '--after-ref': 'r2', '--module': 'm/trace.txt', '--driver': DRV, '--repo': REPO, '--out': c.out, ...over }), ...TAIL(c, fn)];
const fileO = (c, over = {}, fn) => [...flat({ '--before': FROZEN, '--after': c.live, '--driver': DRV, '--out': c.out, ...over }), ...TAIL(c, fn)];

const TWIN = /^deopt-diff: unknown option --before(-ref)? \(see --help\)$/m;
const twinDefault = (r) => { assert.equal(r.status, 2, msg(r)); assert.match(r.stderr, TWIN, msg(r)); };
const ROWS = [];   // registered inside one describe (bounded concurrency 4)
function row(name, cs) { ROWS.push({ kind: 'row', name, cs }); return cs; }
function parityRow(name, cs) { ROWS.push({ kind: 'parity', name, cs }); return cs; }
function mutant(name, desc, edits, cs, observe) { ROWS.push({ kind: 'mutant', name, desc, edits, cs, observe }); }

// =====================================================================================================
// 1. --runs at its bounds in staged mode: 2 and 20 (N and N of the [2, 20] range) -> 2 + 2R spawns, sides
//    alternating before / after, cwd = OUT/stage/<side> for EVERY driver spawn; 1 and 21 refused before any spawn
// =====================================================================================================
const runsRow = (R) => row(`1 ref r1 | r2 --runs ${R} -> exit 1 DIFF, ${2 + 2 * R} spawns (--version, --v8-options first), sides alternate, cwd OUT/stage/<side> each`, {
    args: (c) => refO(c, { '--runs': String(R) }),
    check: (c, r) => {
        verdict(r, 1, 'DIFF');
        const log = c.log();
        assert.equal(log.length, 2 + 2 * R, log.join('\n'));
        assert.ok(log[0].endsWith('|--version'), log[0]);
        assert.ok(log[1].endsWith('|--v8-options'), log[1]);
        const want = Array.from({ length: 2 * R }, (_, i) => [`${c.out}/stage/${i % 2 ? 'after' : 'before'}`, `${TRACE} ./driver.js`]);
        assert.deepEqual(c.drivers(), want);
        assert.equal(files(join(c.out, 'raw', 'before')).length, R);
        assert.equal(files(join(c.out, 'raw', 'after')).length, R);
        assert.match(r.stdout, new RegExp(`^mode {4}diff \\(ref\\) {2}runs ${R} `, 'm'), msg(r));
    },
});
runsRow(2); runsRow(20);
const refuses = (text) => (c, r) => {
    const die = lines(r.stderr).filter((l) => l.startsWith('deopt-diff: '));
    assert.equal(r.status, 2, msg(r));
    assert.deepEqual(die, ['deopt-diff: ' + (typeof text === 'function' ? text(c) : text)], msg(r));
    assert.equal(lines(r.stderr).filter((l) => l === 'VERDICT NO-VERDICT').length, 1, msg(r));
    assert.equal(c.spawns(), 0, c.log().join('\n'));
    assert.ok(!existsSync(c.out), 'OUT was created');
};
const CS_RUNS1 = row('1 PRE-EXISTING check in staged argv: --runs 1 (N-1) -> exit 2 its own die line, 0 spawns, no OUT', {
    args: (c) => refO(c, { '--runs': '1' }), check: refuses("--runs must be an integer in [2, 20] (null control), got '1'") });
const CS_RUNS21 = row('1 PRE-EXISTING check in staged argv: --runs 21 (N+1) -> exit 2 its own die line, 0 spawns, no OUT', {
    args: (c) => refO(c, { '--runs': '21' }), check: refuses("--runs must be an integer in [2, 20] (null control), got '21'") });
const M_RANGE = [['[[ $RUNS -ge 2 && $RUNS -le 20 ]]', '[[ $RUNS -ge 1 && $RUNS -le 21 ]]']];
mutant('M-runs-range-1', 'runs range widened to [1, 21]', M_RANGE, CS_RUNS1, (c, r) => assert.notEqual(r.status, 2, msg(r)));
mutant('M-runs-range-21', 'runs range widened to [1, 21]', M_RANGE, CS_RUNS21, (c, r) => assert.notEqual(r.status, 2, msg(r)));

// =====================================================================================================
// 2. several fns in staged mode: the verdict is the worst over fns (NO-VERDICT > DIFF > SAME)
// =====================================================================================================
row('2 ref r1 | r2 --fn sub,add -> sub SAME (0 | 0), add DIFF (0 | 1): exit 1 DIFF', {
    args: (c) => refO(c, {}, 'sub,add'),
    check: (c, r) => {
        verdict(r, 1, 'DIFF');
        assert.equal(has(r, '  sub: SAME -- identical deopt multiset (before 0 | after 0)'), 1, msg(r));
        assert.equal(has(r, '  add: DIFF -- deopt multiset differs (before 0 | after 1)'), 1, msg(r));
        assert.equal(c.spawns(), 8);
    },
});
row("2 ref r1 | r2 --fn add,nosuch -> add DIFF, nosuch NO-VERDICT (guard, both sides): exit 2 NO-VERDICT", {
    args: (c) => refO(c, {}, 'add,nosuch'),
    check: (c, r) => {
        verdict(r, 2, 'NO-VERDICT');
        assert.equal(has(r, '  add: DIFF -- deopt multiset differs (before 0 | after 1)'), 1, msg(r));
        assert.equal(lines(r.stdout).filter((l) => /^ {2}nosuch: NO-VERDICT -- (before|after): no optimized compile of 'nosuch' in run 1 \(/.test(l)).length, 2, msg(r));
    },
});
row('2 adversarial: ref r1 | r1 --fn sub,add with an after-only deopt -> the worst-over-fns DIFF hits MD-16: exit 2, the MD-16 line once', {
    args: (c) => refO(c, { '--after-ref': 'r1' }, 'sub,add'),
    env: (c) => ({ FAKE_AFTER_EXTRA: c.extra }),
    check: (c, r) => {
        verdict(r, 2, 'NO-VERDICT');
        assert.equal(has(r, '  sub: SAME -- identical deopt multiset (before 0 | after 0)'), 1, msg(r));
        assert.equal(has(r, '  add: DIFF -- deopt multiset differs (before 0 | after 1)'), 1, msg(r));
        assert.equal(has(r, '  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise'), 1, msg(r));
    },
});

// =====================================================================================================
// 3. file mode with byte-identical copies (the frozen copy has ANOTHER file name: it is staged as --after's name)
// =====================================================================================================
const NOTE = 'NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)';
const L_MD16 = '  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise';
row('3 file frozen r1 (other name) | live r1 -> exit 0 SAME, the NOTE line, mode "diff (file)", head lines name each FILE + the staged sha256/8', {
    prep: (c) => writeFileSync(c.live, T_R1),
    args: (c) => fileO(c),
    check: (c, r) => {
        verdict(r, 0, 'SAME');
        assert.equal(has(r, NOTE), 1, msg(r));
        assert.match(r.stdout, /^mode {4}diff \(file\) {2}runs 3 /m, msg(r));
        assert.equal(has(r, `before  ${FROZEN}  sha256/8 ${sha8(T_R1)}`), 1, msg(r));
        assert.equal(has(r, `after   ${c.live}  sha256/8 ${sha8(T_R1)}`), 1, msg(r));
        assert.equal(readFileSync(join(c.out, 'stage', 'before', 'trace.txt'), 'utf8'), T_R1);
        assert.equal(c.spawns(), 8);
    },
});
row('3 file mode MD-16: frozen r1 | live r1 with an after-only deopt -> exit 2, the DIFF line then the MD-16 line', {
    prep: (c) => writeFileSync(c.live, T_R1),
    args: (c) => fileO(c),
    env: (c) => ({ FAKE_AFTER_EXTRA: c.extra }),
    check: (c, r) => {
        verdict(r, 2, 'NO-VERDICT');
        assert.equal(has(r, NOTE), 1, msg(r));
        const L = lines(r.stdout), a = L.indexOf('  add: DIFF -- deopt multiset differs (before 0 | after 1)'), b = L.indexOf(L_MD16);
        assert.ok(a >= 0 && b > a, msg(r));
    },
});

// =====================================================================================================
// 4. ref spellings: annotated tag, branch, HEAD~1, full sha -> the same DIFF; head line "<REF> @ <commit sha 12>"
// =====================================================================================================
const spell = (label, ref) => row(`4 ref spelling: --before-ref ${label} -> exit 1 DIFF, head "before  <ref> @ <r1 commit sha/12>  m/trace.txt  sha256/8 <r1>"`, {
    args: (c) => refO(c, { '--before-ref': ref() }),
    check: (c, r) => {
        verdict(r, 1, 'DIFF');
        assert.equal(has(r, '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)'), 1, msg(r));
        assert.equal(has(r, `before  ${ref()} @ ${SHA.r1.slice(0, 12)}  m/trace.txt  sha256/8 ${sha8(T_R1)}`), 1, msg(r));
        assert.equal(has(r, `after   r2 @ ${SHA.r2.slice(0, 12)}  m/trace.txt  sha256/8 ${sha8(T_R2)}`), 1, msg(r));
    },
});
const CS_ANN = spell('ar1 (annotated tag: the PEELED commit, not the tag object)', () => 'ar1');
spell('b1 (branch)', () => 'b1');
spell('HEAD~1', () => 'HEAD~1');
spell('<full 40-hex sha>', () => SHA.r1);
mutant('M-no-peel', '"$ref^{commit}" -> "$ref"', [['"$ref^{commit}"', '"$ref"']], CS_ANN,
    (c, r) => assert.ok(r.stdout.includes(`before  ar1 @ ${SHA.ar1obj.slice(0, 12)} `), msg(r)));
row("4 adversarial: --before-ref -x (a value starting with '-') -> exit 2 \"--before-ref must not start with '-', got '-x'\", 0 spawns, no OUT", {
    args: (c) => refO(c, { '--before-ref': '-x' }), check: refuses("--before-ref must not start with '-', got '-x'"), twin: /^deopt-diff: unknown option --before-ref/m,
});

// =====================================================================================================
// 5. --repo: relative from a cwd outside the repo; absent from a cwd outside (refused) and inside (the repo around cwd)
// =====================================================================================================
row('5 --repo RELATIVE, cwd outside the repo -> exit 1 DIFF, head shas from that repo; the repo unchanged', {
    args: (c) => refO(c, { '--repo': relative(c.cwd, REPO) }),
    check: (c, r) => {
        assert.ok(!relative(c.cwd, REPO).startsWith('/'));
        verdict(r, 1, 'DIFF');
        assert.equal(has(r, `before  r1 @ ${SHA.r1.slice(0, 12)}  m/trace.txt  sha256/8 ${sha8(T_R1)}`), 1, msg(r));
    },
});
row('5 no --repo, cwd outside any git work tree -> exit 2 "ref mode: the cwd is not inside a git work tree (give --repo DIR)", 0 spawns', {
    // the precondition spawn runs in prep (withCase, before the run), never inside the teeth row's assert.throws
    prep: (c) => { c.topStatus = capSync('git', ['rev-parse', '--show-toplevel'], { cwd: c.cwd, env: cleanEnv() }, 30000, 'git rev-parse').status; },
    args: (c) => refO(c, { '--repo': null }),
    check: (c, r) => {
        assert.notEqual(c.topStatus, 0, 'precondition: cwd is inside a repo');
        refuses('ref mode: the cwd is not inside a git work tree (give --repo DIR)')(c, r);
    },
});
row('5 no --repo, cwd = <repo>/m (inside) -> the repo around cwd: exit 1 DIFF; HEAD, refs and status unchanged', {
    args: (c) => refO(c, { '--repo': null }),
    cwd: () => join(REPO, 'm'),
    prep: (c) => { c.pre = repoState(); },
    check: (c, r) => {
        verdict(r, 1, 'DIFF');
        assert.equal(has(r, `after   r2 @ ${SHA.r2.slice(0, 12)}  m/trace.txt  sha256/8 ${sha8(T_R2)}`), 1, msg(r));
        // repoState() spawns (capSync): inside the teeth assert.throws it is unreachable today (the twin pins status 2, verdict(r, 1) throws first)
        assert.deepEqual(repoState(), c.pre);
    },
});

// =====================================================================================================
// 6. OUT spellings: a path with spaces and glob chars; --out=DIR; every staged option in --opt=value form
// =====================================================================================================
const outFiles = ['raw/after/run.1.txt', 'raw/after/run.2.txt', 'raw/after/run.3.txt', 'raw/before/run.1.txt', 'raw/before/run.2.txt', 'raw/before/run.3.txt',
    'report.txt', 'stage/after/driver.js', 'stage/after/trace.txt', 'stage/before/driver.js', 'stage/before/trace.txt'];
const odd = (c) => join(c.dir, 'o u*t?[1]', 'x y');
row('6 --out "o u*t?[1]/x y" (spaces + glob chars) -> exit 1 DIFF, exactly the 11 files, out line verbatim, cwd = that path', {
    prep: (c) => { mkdirSync(join(c.dir, 'o uAtB1', 'x y'), { recursive: true }); mkdirSync(join(c.dir, 'o uXtY1', 'x y'), { recursive: true }); },   // decoys a glob would match
    args: (c) => refO(c, { '--out': odd(c) }),
    check: (c, r) => {
        verdict(r, 1, 'DIFF');
        assert.equal(has(r, `out     ${odd(c)}`), 1, msg(r));
        assert.deepEqual(files(odd(c)), outFiles);
        assert.deepEqual(readdirSync(join(c.dir, 'o uAtB1', 'x y')), []); assert.deepEqual(readdirSync(join(c.dir, 'o uXtY1', 'x y')), []);
        assert.equal(c.drivers()[0][0], `${odd(c)}/stage/before`);
    },
});
row('6 --out=DIR form in ref mode -> exit 1 DIFF, exactly the 11 files', {
    args: (c) => ['--before-ref', 'r1', '--after-ref', 'r2', '--module', 'm/trace.txt', '--driver', DRV, '--repo', REPO, `--out=${c.out}`, ...TAIL(c)],
    check: (c, r) => { verdict(r, 1, 'DIFF'); assert.deepEqual(files(c.out), outFiles); },
});
row('6 adversarial: every option in --opt=value form (file mode) -> exit 1 DIFF, mode "diff (file)"', {
    args: (c) => [`--before=${FROZEN}`, `--after=${c.live}`, `--driver=${DRV}`, `--repo=${REPO}`, `--out=${c.out}`, '--fn=add', `--node=${c.node}`, '--runs=2'],
    check: (c, r) => { verdict(r, 1, 'DIFF'); assert.match(r.stdout, /^mode {4}diff \(file\) {2}runs 2 /m, msg(r)); assert.equal(c.spawns(), 6); },
});
row('6 --before-ref given twice -> exit 2 "--before-ref given twice (give one comma list)", 0 spawns, no OUT', {
    args: (c) => [...refO(c), '--before-ref', 'r2'], check: refuses('--before-ref given twice (give one comma list)'),
});
row('6 empty value --module= -> exit 2 "--module needs a non-empty value", 0 spawns, no OUT', {
    args: (c) => refO(c, { '--module': null }).concat(['--module=']), check: refuses('--module needs a non-empty value'),
});

// =====================================================================================================
// 7. the six GIT_* vars, one row each (any one can make a tracked --before read as untracked); set-but-EMPTY counts
// =====================================================================================================
const gitDie = (mode) => `GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES is set: unset it (${mode} mode finds each repo from its path)`;
for (const v of GITVARS) {
    row(`7 ${v} set (ref mode) -> exit 2, its die line once, 0 spawns, no OUT`, {
        args: (c) => refO(c), env: () => ({ [v]: join(ROOT, 'no-such-' + v) }), check: refuses(gitDie('ref')),
    });
}
row('7 adversarial: GIT_DIR set but EMPTY (ref mode) -> refused all the same', { args: (c) => refO(c), env: () => ({ GIT_DIR: '' }), check: refuses(gitDie('ref')) });
row('7 GIT_WORK_TREE set (file mode) -> the file-mode die line', { args: (c) => fileO(c), env: () => ({ GIT_WORK_TREE: ROOT }), check: refuses(gitDie('file')) });

// =====================================================================================================
// 8. -h and hint(): the 7 staged options and both staged usage lines; did-you-mean for the staged prefixes
// =====================================================================================================
const USAGE = [
    '  deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before-ref REF --after-ref REF --module REL   ref mode',
    '  deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before FILE --after FILE                     file mode',
];
const OPT7 = ['--before-ref REF', '--after-ref REF', '--module REL', '--before FILE', '--after FILE', '--driver FILE', '--repo DIR'];
row('8 -h -> exit 2; stdout holds both staged usage lines once and each of the 7 staged options once as an option line', {
    args: () => ['-h'],
    twin: (r) => assert.equal(r.status, 2, msg(r)),
    check: (c, r) => {
        assert.equal(r.status, 2, msg(r));
        for (const u of USAGE) assert.equal(has(r, u), 1, u);
        for (const o of OPT7) assert.equal(lines(r.stdout).filter((l) => l.startsWith(`  ${o} `)).length, 1, o);
        assert.equal(c.spawns(), 0);
    },
});
for (const [p, o] of [['--bef', '--before-ref'], ['--aft', '--after-ref'], ['--mod', '--module'], ['--dri', '--driver'], ['--rep', '--repo']]) {
    row(`8 hint: ${p} -> "unknown option ${p} (did you mean ${o}?) (see --help)", 0 spawns`, {
        args: (c) => [p, 'x', ...TAIL(c)],
        twin: (r) => { assert.equal(r.status, 2, msg(r)); assert.match(r.stderr, new RegExp(`^deopt-diff: unknown option ${p} \\(see --help\\)$`, 'm'), msg(r)); },
        check: refuses(`unknown option ${p} (did you mean ${o}?) (see --help)`),
    });
}
const CS_HINT_R = parityRow('8 PRE-EXISTING (parity with 221ff2ec): --r still hints --runs (the staged options sit at the END of OPTS)', {
    args: (c) => ['--r', 'x', ...TAIL(c)], check: refuses('unknown option --r (did you mean --runs?) (see --help)'),
});
mutant('M-opts-front', 'staged options moved to the FRONT of OPTS',
    [['OPTS="--fn --runs --node --v8-flags --out --self-test --help --before-ref --after-ref --before --after --module --driver --repo"',
        'OPTS="--before-ref --after-ref --before --after --module --driver --repo --fn --runs --node --v8-flags --out --self-test --help"']], CS_HINT_R,
    (c, r) => assert.match(r.stderr, /did you mean --repo\?/, msg(r)));

// =====================================================================================================
// 9. /bin/bash 3.2 (macOS system bash) runs a staged ref verdict
// =====================================================================================================
const skip32 = skip || (bv.status === 0 && /version 3\.2\./.test(bv.stdout) ? false : '/bin/bash is not bash 3.2 on this host');
row('9 /bin/bash 3.2 runs ref r1 | r2 -> exit 1 DIFF, 8 spawns, the before=0 after=1 line', {
    bash: '/bin/bash', rowSkip: skip32,
    args: (c) => refO(c),
    check: (c, r) => { verdict(r, 1, 'DIFF'); assert.equal(c.spawns(), 8); assert.equal(has(r, '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)'), 1, msg(r)); },
});

// =====================================================================================================
// 10. OUT/stage edge cases (lib/stage.sh + MD-17). a (dangling symlink) is FIXED: MD-17 refuses it; b and c are KNOWN
// GAPs in the -h "Not detected" list
// =====================================================================================================
const snapL = (d) => walkL(d).sort().map(([p, k]) => `${k} ${p}`).join('|');
const MD17 = '[[ -z $OUT || ( ! -e $OUT/stage && ! -L $OUT/stage ) || -d $OUT/stage ]]';   // the built MD-17 test (dangling-aware)
const MD17_OLD = '[[ -z $OUT || ! -e $OUT/stage || -d $OUT/stage ]]';
const CS_DANG = row("10a OUT/stage a DANGLING symlink -> exit 2 with MD-17's 'exists and is not a directory' line (once), 0 spawns, OUT unchanged", {
    prep: (c) => { mkdirSync(c.out); symlinkSync(join(c.dir, 'nowhere'), join(c.out, 'stage')); c.snap = snapL(c.out); },
    args: (c) => refO(c),
    check: (c, r) => {
        const die = lines(r.stderr).filter((l) => l.startsWith('deopt-diff: '));
        assert.equal(r.status, 2, msg(r));
        assert.deepEqual(die, [`deopt-diff: --out: ${c.out}/stage exists and is not a directory`], msg(r));
        assert.equal(c.spawns(), 0);
        assert.equal(snapL(c.out), c.snap, 'OUT changed');
    },
});
mutant('M-dangling-revert', 'MD-17 reverted to the pre-fix test (no ! -L): the lib answers instead', [[MD17, MD17_OLD]], CS_DANG,
    (c, r) => { assert.equal(r.status, 2, msg(r)); assert.match(r.stderr, /stage is not empty \(give a new or empty DIR\)/, msg(r)); });
const uid0 = typeof process.getuid === 'function' && process.getuid() === 0;
const CS_000 = row('10b KNOWN GAP (-h): OUT/stage mode 000 holding a file -> 2 spawns (--version, --v8-options), OUT/raw/before + raw/after + an empty report.txt written, then "cannot create"', {
    rowSkip: skip || (uid0 ? 'root ignores mode 000' : false),
    prep: (c) => { mkdirSync(join(c.out, 'stage'), { recursive: true }); writeFileSync(join(c.out, 'stage', 'f'), 'x\n'); chmodSync(join(c.out, 'stage'), 0o000); },
    args: (c) => refO(c),
    check: (c, r) => {
        const die = lines(r.stderr).filter((l) => l.startsWith('deopt-diff: '));
        assert.equal(r.status, 2, msg(r));
        assert.deepEqual(die, [`deopt-diff: --out: cannot create ${c.out}/stage/before and ${c.out}/stage/after`], msg(r));
        assert.deepEqual(c.log().map((l) => l.split('|')[1]), ['--version', '--v8-options']);
        assert.ok(statSync(join(c.out, 'raw', 'before')).isDirectory() && statSync(join(c.out, 'raw', 'after')).isDirectory());
        assert.equal(statSync(join(c.out, 'report.txt')).size, 0);
    },
});
const STAGE_CHK = '[[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]] || die "--out: $OUT/stage is not empty (give a new or empty DIR)"';
mutant('M-stage-readable', 'the emptiness test also needs a readable + searchable OUT/stage', [[STAGE_CHK,
    '{ [[ ! -e "$OUT/stage" ]] || { [[ -r "$OUT/stage" && -x "$OUT/stage" ]] && [[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]; }; } || die "--out: $OUT/stage is not empty (give a new or empty DIR)"']],
CS_000, (c, r) => { assert.equal(c.spawns(), 0); assert.match(r.stderr, /stage is not empty/, msg(r)); });
const CS_LINK = row('10c KNOWN GAP (-h): OUT/stage a symlink to an EMPTY dir -> exit 1 DIFF; the 4 staged files land in the link target, outside OUT', {
    prep: (c) => { mkdirSync(join(c.dir, 'elsewhere')); mkdirSync(c.out); symlinkSync(join(c.dir, 'elsewhere'), join(c.out, 'stage')); },
    args: (c) => refO(c),
    check: (c, r) => {
        verdict(r, 1, 'DIFF');
        assert.deepEqual(files(join(c.dir, 'elsewhere')), ['after/driver.js', 'after/trace.txt', 'before/driver.js', 'before/trace.txt']);
        assert.ok(lstatSync(join(c.out, 'stage')).isSymbolicLink());
        assert.deepEqual(files(c.out), outFiles.filter((f) => !f.startsWith('stage/')));
    },
});
mutant('M-stage-link-md17', 'MD-17 refuses any symlinked OUT/stage', [[MD17, '[[ -z $OUT || ( ! -e $OUT/stage && ! -L $OUT/stage ) || ( -d $OUT/stage && ! -L $OUT/stage ) ]]']], CS_LINK,
    (c, r) => { assert.equal(r.status, 2, msg(r)); assert.deepEqual(readdirSync(join(c.dir, 'elsewhere')), []); });

// =====================================================================================================
// register: rows (+ twins on 221ff2ec), parity rows (pass on both builds), mutants -- bounded concurrency 4
// =====================================================================================================
describe('deopt-diff stage boundary rows', { concurrency: 4 }, () => {
    for (const x of ROWS) {
        const sk = x.cs.rowSkip !== undefined ? x.cs.rowSkip : skip;
        if (x.kind === 'row') {
            test(`stage boundary: ${x.name}`, { skip: sk }, () => withCase(SCRIPT, x.cs, (c, r) => x.cs.check(c, r)));
            test(`stage boundary teeth: [${x.name}] on the pre-G2 build (221ff2ec): exits 2 at its own option and the check is red`, { skip: sk || baseSkip }, () => {
                histGate(haveBase);
                return withCase(BASE, x.cs, (c, r) => {
                    (x.cs.twin instanceof RegExp ? (q) => { assert.equal(q.status, 2, msg(q)); assert.match(q.stderr, x.cs.twin, msg(q)); } : (x.cs.twin || twinDefault))(r);
                    assert.throws(() => x.cs.check(c, r), assert.AssertionError, 'the row check must be red on the pre-G2 build');
                });
            });
        } else if (x.kind === 'parity') {
            test(`stage boundary: ${x.name}`, { skip: sk }, () => withCase(SCRIPT, x.cs, (c, r) => x.cs.check(c, r)));
            test(`stage boundary parity: [${x.name}] the same check passes on the pre-G2 build (221ff2ec)`, { skip: sk || baseSkip }, () => {
                histGate(haveBase);
                return withCase(BASE, x.cs, (c, r) => x.cs.check(c, r));
            });
        } else {
            test(`stage boundary MUTANT ${x.name} (${x.desc}): its row goes red`, { skip: sk }, (t) => withCase(variant(x.name, x.edits), x.cs, (c, r) => {
                t.diagnostic(`${x.name}: rc=${r.status} stderr=${JSON.stringify(r.stderr.trim().slice(0, 200))}`);
                assert.throws(() => x.cs.check(c, r), assert.AssertionError, `${x.name}: the row still passes on the mutant`);
                if (x.observe) x.observe(c, r);
            }));
        }
    }

    // =================================================================================================
    // 11. retention (A5 extension): 3 cycles each of SAME / DIFF / NO-VERDICT / a refusal in staged mode leave cwd,
    // TMPDIR and the real temp dir (logging mktemp shim) untouched and the repo's HEAD / refs / status unchanged.
    // Control: M-mktemp (a bare `mktemp -d` before the --version spawn, never removed) must turn it red.
    // =================================================================================================
    const CYC = [
        ['SAME', 0, (c, o) => refO({ ...c, out: o }, { '--after-ref': 'r1' })],
        ['DIFF', 1, (c, o) => refO({ ...c, out: o })],
        ['NO-VERDICT', 2, (c, o) => refO({ ...c, out: o }, {}, 'nosuch')],
        ['refusal', 2, (c, o) => refO({ ...c, out: o }, { '--after-ref': null })],
    ];
    async function retention(script) {
        let c;
        try {
            c = mkCase();
            const sh = shimDir(c.dir);
            const env = { ...cleanEnv(), TMPDIR: c.tmp, PATH: `${sh.bin}:${process.env.PATH}` };
            const ctl = capSync('bash', ['-c', 'd=$(mktemp -d) && rmdir "$d"'], { env }, 30000, 'mktemp control');
            const shimLive = ctl.status === 0 && sh.made().length === 1;
            writeFileSync(join(c.dir, 'mktemp.log'), '');
            const pre = repoState(), res = [];
            for (let k = 0; k < 3; k++) {
                for (const [name, , args] of CYC) {
                    const o = join(c.dir, 'outs', `${name}-${k}`);
                    const r = await runAsync('bash', [script, ...args(c, o)], { cwd: c.cwd, env });
                    res.push({ name, status: r.status, n: existsSync(o) ? files(o).length : -1 });
                }
            }
            const made = sh.made();
            const leaked = made.filter((p) => existsSync(p));
            for (const p of leaked) rmSync(p, { recursive: true, force: true });   // the test removes what a mutant leaked
            return { shimLive, res, spawns: c.spawns(), made, leaked, tmp: readdirSync(c.tmp), cwd: readdirSync(c.cwd), repoSame: JSON.stringify(repoState()) === JSON.stringify(pre) };
        } finally { if (c) rmSync(c.dir, { recursive: true, force: true }); }
    }
    const retCheck = (x) => {
        assert.ok(x.shimLive, 'the mktemp shim did not log a control mktemp -d');
        assert.deepEqual(x.res.map((q) => `${q.name}:${q.status}:${q.n}`), [0, 1, 2].flatMap(() => CYC.map(([n, rc]) => `${n}:${rc}:${n === 'refusal' ? -1 : 11}`)));
        assert.equal(x.spawns, 3 * 3 * 8, 'node spawns over 9 verdict runs + 3 refusals');
        assert.deepEqual(x.made, [], 'mktemp was called (a dir in the real temp dir)');
        assert.deepEqual(x.leaked, []);
        assert.deepEqual(x.tmp, [], 'TMPDIR kept entries');
        assert.deepEqual(x.cwd, [], 'cwd kept entries');
        assert.ok(x.repoSame, 'the repo HEAD / refs / status changed');
    };
    const M_MKTEMP = [['# --- every refusal but the --v8-flags allowlist is above this line; spawns start here', 'LEAK_D=$(mktemp -d)   # mutant']];
    test('stage boundary: 11 retention: 3 x SAME / DIFF / NO-VERDICT / refusal (staged) -> 72 spawns, 11 files per verdict OUT, 0 mktemp, cwd + TMPDIR empty, repo unchanged', { skip }, async () => {
        retCheck(await retention(SCRIPT));
    });
    test('stage boundary teeth: [11 retention] on the pre-G2 build (221ff2ec) every run exits 2 -> red', { skip: baseSkip }, async () => {
        histGate(haveBase);
        const x = await retention(BASE);
        assert.ok(x.res.every((q) => q.status === 2), JSON.stringify(x.res));
        assert.throws(() => retCheck(x), assert.AssertionError);
    });
    test('stage boundary MUTANT M-mktemp (a bare mktemp -d before the --version spawn, never removed): 11 retention goes red', { skip }, async () => {
        const x = await retention(variant('M-mktemp', M_MKTEMP));
        assert.throws(() => retCheck(x), assert.AssertionError);
        assert.equal(x.made.length, 9, 'one leaked dir per run past the refusals');
    });

    // =================================================================================================
    // 12. SIGTERM to the process group while driver run 3 (before, k = 2) is in flight leaves no temp dir
    // =================================================================================================
    async function sigterm(script) {
        let c, ch;
        try {
            c = mkCase();
            const sh = shimDir(c.dir), ready = join(c.dir, 'ready');
            const env = { ...cleanEnv(), TMPDIR: c.tmp, PATH: `${sh.bin}:${process.env.PATH}`, FAKE_HANG_AT: '3', FAKE_READY: ready };
            ch = spawn('bash', [script, ...refO(c)], { cwd: c.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
            let out = '';
            ch.stdout.setEncoding('utf8'); ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', () => {});
            const done = new Promise((res) => ch.on('close', (code, signal) => res({ code, signal })));
            let exitedEarly = false, escalated = false;
            ch.on('exit', () => { exitedEarly = !existsSync(ready); });
            for (let i = 0; i < 1500 && !existsSync(ready) && ch.exitCode === null && ch.signalCode === null; i++) await new Promise((r) => setTimeout(r, 20));
            const wasReady = existsSync(ready);
            if (wasReady) process.kill(-ch.pid, 'SIGTERM');
            const kill = setTimeout(() => { escalated = true; try { process.kill(-ch.pid, 'SIGKILL'); } catch { /* gone */ } }, 30000);
            const st = await done; clearTimeout(kill);
            const made = sh.made(), leaked = made.filter((p) => existsSync(p));
            for (const p of leaked) rmSync(p, { recursive: true, force: true });
            // outside sigCheck: a teeth / mutant assert.throws can never swallow it
            if (escalated) assert.fail('deopt-diff.sh SIGTERM run timed out after 30000 ms (killed by SIGKILL)');
            return { wasReady, exitedEarly, st, out, made, leaked, tmp: readdirSync(c.tmp), cwd: readdirSync(c.cwd), spawns: c.spawns() };
        } finally {
            if (ch) { try { process.kill(-ch.pid, 'SIGKILL'); } catch { /* gone */ } }
            if (c) rmSync(c.dir, { recursive: true, force: true });
        }
    }
    const sigCheck = (x) => {
        assert.ok(x.wasReady && !x.exitedEarly, 'the run never reached driver run 3');
        assert.equal(x.spawns, 5, '--version + --v8-options + 3 driver spawns at the kill');
        assert.ok(x.st.signal === 'SIGTERM' || (x.st.signal === null && x.st.code !== 0), JSON.stringify(x.st));
        assert.doesNotMatch(x.out, /^VERDICT /m);
        assert.deepEqual(x.made, [], 'mktemp was called');
        assert.deepEqual(x.leaked, []);
        assert.deepEqual(x.tmp, [], 'TMPDIR kept entries');
        assert.deepEqual(x.cwd, [], 'cwd kept entries');
    };
    test('stage boundary: 12 SIGTERM (process group) during driver run 3 of a staged ref verdict -> killed, no VERDICT, 0 mktemp, TMPDIR + cwd empty', { skip }, async () => {
        sigCheck(await sigterm(SCRIPT));
    });
    test('stage boundary teeth: [12 SIGTERM] on the pre-G2 build (221ff2ec) the run exits before any driver spawn -> red', { skip: baseSkip }, async () => {
        histGate(haveBase);
        const x = await sigterm(BASE);
        assert.equal(x.wasReady, false);
        assert.throws(() => sigCheck(x), assert.AssertionError);
    });
    test('stage boundary MUTANT M-mktemp on 12 SIGTERM: the leaked dir turns the row red', { skip }, async () => {
        const x = await sigterm(variant('M-mktemp-sig', M_MKTEMP));
        assert.throws(() => sigCheck(x), assert.AssertionError);
        assert.equal(x.made.length, 1);
    });
});
