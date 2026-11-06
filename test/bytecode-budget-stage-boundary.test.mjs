// test/bytecode-budget-stage-boundary.test.mjs -- QA boundary rows for ../bytecode-budget.sh ref + file staging
// (P2G2 group 2b, lib/stage.sh). Oracle: PLAN-phase2-g2b.md ASSERTIONS A1-A5 + ADDENDA A1-A4, not the code.
// Helpers copied from bytecode-budget-stage.test.mjs (this file does not import or edit it).
// Teeth: every row of NEW (group 2b) behaviour also runs on the pre-staging build (`git show 3b2209a:bytecode-budget.sh`,
// sha256/8 9173830d), where it must exit 2 "unknown option --before(-ref)" AND its own check must go red. Rows that
// pin a KNOWN GAP or a pre-existing behaviour say so, and each has a named one-edit mutant of a copy (exact-once
// string edit, abort otherwise) that the row must be red on. G-STAGE (PLAN-b42-gstage TASK 5 + A1 / A6) flipped rows 2 and 4
// and added sections 10-13; each of those rows is also run on the frozen 943bed4 root (revert log: evidence/b44-gstage-b3/).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, existsSync, lstatSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capSync } from './spawn-cap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'bytecode-budget.sh');
const FIX = join(HERE, 'fixtures', 'bytecode-budget', 'node-26.8.2');
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
const gv = spawnSync('git', ['--version'], { encoding: 'utf8' });
const haveGit = gv.status === 0;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : (haveGit ? false : 'git not available');
const GITC = ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false'];
const GITVER = haveGit ? (gv.stdout.match(/(\d+)\.(\d+)/) || []).slice(1).map(Number) : [];

function cleanEnv() {
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
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const S211 = sha8('211\n'), S212 = sha8('212\n'), S213 = sha8('213\n');

// ---- shared fixtures. REPO: src/mod.js r1 = 211, r2 = 212 (+ a tracked symlink src/link.js -> mod.js), tags r1 / r2,
// annotated tag ar1 (-> r1), branches at r1 / r2 with odd but legal names. AMB: as REPO plus a BRANCH r1 at r2.
// REP: as REPO with `git replace` of r1's mod.js blob (211) by a 213 blob.
const ROOT = mkdtempSync(join(tmpdir(), 'bbsb-root-'));
after(() => rmSync(ROOT, { recursive: true, force: true }));
const REPO = join(ROOT, 'repo'), AMB = join(ROOT, 'amb'), REP = join(ROOT, 'rep');
const DRV = join(ROOT, 'drv', 'driver.mjs');            // imports './mod.js'
const DRV_LINK = join(ROOT, 'drv', 'ld.mjs');           // imports './link.js'
const DRV_DASH = join(ROOT, 'drv', 'dm.mjs');           // imports './-mod.js'
const DRV_MY = join(ROOT, 'drv', 'mymod.js');           // file name CONTAINS mod.js, imports './mod.js'
const DRV_SUF = join(ROOT, 'drv', 'mod.js.driver.mjs'); // file name STARTS with mod.js, imports './mod.js'
const FROZEN = join(ROOT, 'frozen', 'mod.js');          // untracked, 211
const ODD_B = "a'b\"$c;d", ODD_A = 'x#y@z!%\u00fc';      // legal ref names with shell-active / non-ASCII bytes
const SHA = {};
// G-STAGE repos: EXE = REPO's history with src/mod.js of tree mode 100755; UNI = src/<non-ASCII>.js r1 211 / r2 212;
// LIT = a regular x.js (211 / 212) beside a tracked symlink ':x.js' -> other.js (':' leads pathspec magic in git)
const EXE = join(ROOT, 'exe'), UNI = join(ROOT, 'uni'), LIT = join(ROOT, 'lit');
// non-ASCII file names from \u escapes (the source stays ASCII): e-acute, E-acute, NFC m<e-acute>d, NFD m<e + U+0301>d
const U_E = '\u00e9.js', U_EU = '\u00c9.js', U_NFC = 'm\u00e9d.js', U_NFD = 'me\u0301d.js', U_DRV = 'd\u00e9.mjs';
let FOLDS = false;   // does this file system map U_E and U_EU to one entry (APFS / HFS+ default)? probed below
function probeFold(d) { mkdirSync(d); writeFileSync(join(d, U_E), 'a\n'); writeFileSync(join(d, U_EU), 'b\n'); return readdirSync(d).length === 1; }
function mkTwo(dir, paths, v1, v2) {   // r1 = v1 / r2 = v2 in each path (relative to dir), tags r1 r2
    git(dir, 'init', '-q');
    for (const p of paths) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), v1); }
    git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'r1'); git(dir, 'tag', 'r1');
    for (const p of paths) writeFileSync(join(dir, p), v2);
    git(dir, 'commit', '-q', '-a', '-m', 'r2'); git(dir, 'tag', 'r2');
}
function mkRepo(dir) {
    mkdirSync(join(dir, 'src'), { recursive: true });
    git(dir, 'init', '-q');
    writeFileSync(join(dir, 'src', 'mod.js'), '211\n'); symlinkSync('mod.js', join(dir, 'src', 'link.js'));
    git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'r1'); git(dir, 'tag', 'r1'); git(dir, 'tag', '-a', '-m', 'ann', 'ar1');
    writeFileSync(join(dir, 'src', 'mod.js'), '212\n'); git(dir, 'commit', '-q', '-a', '-m', 'r2'); git(dir, 'tag', 'r2');
}
if (!skip) try {
    for (const d of ['drv', 'frozen']) mkdirSync(join(ROOT, d));
    mkRepo(REPO); mkRepo(AMB); mkRepo(REP);
    SHA.r1 = git(REPO, 'rev-parse', 'r1^{commit}'); SHA.r2 = git(REPO, 'rev-parse', 'r2^{commit}'); SHA.ar1obj = git(REPO, 'rev-parse', 'ar1');
    git(REPO, 'branch', 'b1', 'r1'); git(REPO, 'branch', '--', ODD_B, 'r1'); git(REPO, 'branch', '--', ODD_A, 'r2');
    git(AMB, 'branch', 'r1', 'r2');                     // tag r1 (211) and branch r1 (212): ambiguous short name
    SHA.ambR1 = git(AMB, 'rev-parse', 'refs/tags/r1^{commit}');
    SHA.repR1 = git(REP, 'rev-parse', 'r1^{commit}');
    const blob = git(REP, 'rev-parse', 'r1:src/mod.js');
    const r = spawnSync('git', [...GITC, 'hash-object', '-w', '--stdin'], { cwd: REP, input: '213\n', encoding: 'utf8', env: cleanEnv() });
    git(REP, 'replace', blob, r.stdout.trim());
    for (const [p, imp] of [[DRV, 'mod.js'], [DRV_LINK, 'link.js'], [DRV_DASH, '-mod.js'], [DRV_MY, 'mod.js'], [DRV_SUF, 'mod.js']]) writeFileSync(p, `import './${imp}';\n`);
    writeFileSync(FROZEN, '211\n');
    mkdirSync(join(EXE, 'src'), { recursive: true }); git(EXE, 'init', '-q'); writeFileSync(join(EXE, 'src', 'mod.js'), '211\n'); chmodSync(join(EXE, 'src', 'mod.js'), 0o755);
    git(EXE, 'add', '.'); git(EXE, 'commit', '-q', '-m', 'r1'); git(EXE, 'tag', 'r1'); writeFileSync(join(EXE, 'src', 'mod.js'), '212\n'); git(EXE, 'commit', '-q', '-a', '-m', 'r2'); git(EXE, 'tag', 'r2');
    if (!git(EXE, 'ls-tree', 'r1', '--', 'src/mod.js').startsWith('100755 blob ')) throw new Error('EXE fixture: src/mod.js is not tree mode 100755 (core.fileMode off?)');
    mkdirSync(UNI); mkTwo(UNI, ['src/' + U_E, 'src/' + U_NFC], '211\n', '212\n');
    mkdirSync(LIT); symlinkSync('other.js', join(LIT, ':x.js')); mkTwo(LIT, ['x.js'], '211\n', '212\n');
    if (!git(LIT, '--literal-pathspecs', 'ls-tree', 'r1', '--', ':x.js').startsWith('120000 blob ')) throw new Error('LIT fixture: :x.js is not a tracked symlink');
    FOLDS = probeFold(join(ROOT, 'fold-probe'));
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

// ---- one case = one fresh dir. The fake node counts spawns and prints ./$FAKE_MOD (default mod.js) as the length;
// a non-numeric module (e.g. a staged symlink's target text) makes it exit 1 like a driver that fails to load.
function mkCase() {
    const dir = mkdtempSync(join(ROOT, 'c-'));
    const log = join(dir, 'argv.log');
    const node = join(dir, 'node');
    writeFileSync(node, `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) echo v26.8.2; exit 0 ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
len=$(tr -d ' \\n' < "./\${FAKE_MOD:-mod.js}")
case "$len" in ''|*[!0-9]*) echo "SyntaxError: cannot load module: $len" >&2; exit 1 ;; esac
printf '[generated bytecode for function: %s (0x1 <SharedFunctionInfo %s>)]\\nBytecode length: %s\\nParameter count 1\\n' "$fn" "$fn" "$len"
`);
    chmodSync(node, 0o755);
    const c = { dir, node, cwd: join(dir, 'cwd'), tmp: join(dir, 'tmp'), live: join(dir, 'live', 'mod.js'), out: join(dir, 'out') };
    mkdirSync(c.cwd); mkdirSync(c.tmp); mkdirSync(join(dir, 'live'));
    writeFileSync(c.live, '212\n');
    c.spawns = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    return c;
}
function runOn(script, cs) {
    const c = mkCase();
    if (cs.prep) cs.prep(c);
    const env = { ...cleanEnv(), TMPDIR: c.tmp, ...(cs.env ? cs.env(c) : {}) };
    let r;
    try { r = capSync('bash', [script, ...cs.args(c)], { encoding: 'utf8', cwd: c.cwd, env }, 120000, basename(script)); }
    finally { if (cs.post) cs.post(c); }   // e.g. a mode-000 OUT/stage back to 0755, so the checks and ROOT's rmSync can read it
    return { c, r };
}
function flat(o) { const a = []; for (const [k, v] of Object.entries(o)) if (v !== null) a.push(k, v); return a; }
const COMMON = (c, fn = 'mid') => ['--diff', '--node', c.node, '--fn', fn, '--runs', '2'];
// the staged option comes FIRST in argv, so the pre-staging build dies on it
const refO = (c, over = {}, fn) => [...flat({ '--before-ref': 'r1', '--after-ref': 'r2', '--module': 'src/mod.js', '--driver': DRV, '--repo': REPO, '--out': c.out, ...over }), ...COMMON(c, fn)];
const fileO = (c, over = {}, fn) => [...flat({ '--before': FROZEN, '--after': c.live, '--driver': DRV, '--out': c.out, ...over }), ...COMMON(c, fn)];
const msg = (r) => `rc=${r.status} sig=${r.signal}\n${r.stdout}${r.stderr}`;
function walk(d) { return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [join(d, e.name) + '/', ...walk(join(d, e.name))] : [join(d, e.name)])); }
const files = (d) => walk(d).filter((f) => !f.endsWith('/')).map((f) => f.slice(d.length + 1)).sort();
const snap = (d) => walk(d).sort().map((f) => (f.endsWith('/') ? f.slice(d.length) : `${f.slice(d.length)}=${readFileSync(f, 'utf8')}`)).join('|');

const TWIN = /^bytecode-budget: unknown option --before(-ref)? \(see --help\)\nVERDICT NO-VERDICT$/m;
function row(name, cs) {   // cs.skip: a host reason this row cannot run (e.g. root ignores mode 000)
    test(`stage boundary: ${name}`, { skip: skip || cs.skip }, () => { const { c, r } = runOn(SCRIPT, cs); cs.check(c, r); });
    test(`stage boundary teeth: [${name}] exits 2 'unknown option --before(-ref)' on 9173830d and its check goes red`, { skip: baseSkip || cs.skip }, () => {
        histGate(haveBase);
        const { c, r } = runOn(BASE, cs);
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stderr, TWIN);
        assert.throws(() => cs.check(c, r), assert.AssertionError, 'the row check must be red on the pre-staging build');
    });
    return cs;
}
function mutant(name, desc, edits, cs, observe) {
    test(`stage boundary MUTANT ${name} (${desc}): its row goes red`, { skip: skip || cs.skip }, (t) => {
        const { c, r } = runOn(variant(name, edits), cs);
        t.diagnostic(`${name}: rc=${r.status} stderr=${JSON.stringify(r.stderr.trim().slice(0, 200))}`);
        assert.throws(() => cs.check(c, r), assert.AssertionError, `${name}: the row still passes on the mutant`);
        if (observe) observe(c, r);
    });
}
// A3-style refusal: exit 2, the anchored die line, VERDICT NO-VERDICT, 0 node spawns, OUT not created
function refuses(lineFn) {
    return (c, r) => {
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stderr, new RegExp(`^bytecode-budget: ${lineFn(c)}\\nVERDICT NO-VERDICT$`, 'm'), msg(r));
        assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
        assert.ok(!existsSync(c.out), 'OUT was created');
    };
}
const verdict = (rc, v) => (r) => { assert.equal(r.status, rc, msg(r)); assert.match(r.stdout, new RegExp(`^VERDICT ${v}$`, 'm'), msg(r)); };
const descB = (ref, sha, s8) => new RegExp(`^before  ${reEsc(ref)} @ ${sha.slice(0, 12)}  src/mod\\.js  sha256/8 ${s8}$`, 'm');
const descA = (ref, sha, s8) => new RegExp(`^after   ${reEsc(ref)} @ ${sha.slice(0, 12)}  src/mod\\.js  sha256/8 ${s8}$`, 'm');
const CNT_B211 = '\n    before=1 after=0  211\n';

// =====================================================================================================
// 1. ref spellings: tag, branch, full 40-hex sha, abbreviated sha, annotated tag -> the same DIFF; DESC = commit sha/12
// =====================================================================================================
const spell = (label, ref) => row(`1 ref spelling: --before-ref ${label} -> exit 1 DIFF, before=1 after=0 211, DESC "<ref> @ <r1 commit sha/12>"`, {
    args: (c) => refO(c, { '--before-ref': ref() }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.ok(r.stdout.includes(CNT_B211), msg(r));
        assert.match(r.stdout, descB(ref(), SHA.r1, S211), msg(r));
        assert.match(r.stdout, descA('r2', SHA.r2, S212), msg(r));
        assert.equal(c.spawns().length, 7);   // --version, 2 x --v8-options (the --v8-flags allowlist, then the limits), 1 fn x 2 runs x 2 sides
    },
});
spell('tag r1', () => 'r1');
spell('branch b1', () => 'b1');
spell('full 40-hex sha', () => SHA.r1);
spell('abbreviated 7-hex sha', () => SHA.r1.slice(0, 7));
const CS_ANN = spell('annotated tag ar1 (DESC must carry the PEELED commit, not the tag object)', () => 'ar1');
mutant('M-no-peel', '"$ref^{commit}" -> "$ref"', [['"$ref^{commit}"', '"$ref"']], CS_ANN,
    (c, r) => { assert.match(r.stdout, new RegExp(`^before  ar1 @ ${SHA.ar1obj.slice(0, 12)} `, 'm'), msg(r)); });
row('1 odd-byte ref names (quote, $, ;, #, @, !, %, non-ASCII) reach git verbatim: DESC carries each name and its sha', {
    args: (c) => refO(c, { '--before-ref': ODD_B, '--after-ref': ODD_A }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.match(r.stdout, descB(ODD_B, SHA.r1, S211), msg(r));
        assert.match(r.stdout, descA(ODD_A, SHA.r2, S212), msg(r));
    },
});
row('1 a rev expression r2^{/r1} (message search) is a commit -> stages r1, DESC keeps the expression', {
    args: (c) => refO(c, { '--before-ref': 'r2^{/r1}' }),
    check: (c, r) => { verdict(1, 'DIFF')(r); assert.match(r.stdout, descB('r2^{/r1}', SHA.r1, S211), msg(r)); },
});
// adversarial: a short name that is BOTH a tag (r1 -> 211) and a branch (r1 -> 212). git resolves the tag first.
row('1 adversarial: r1 is a tag AND a branch -> the tag wins (refs/tags before refs/heads); DESC shows which commit', {
    args: (c) => refO(c, { '--repo': AMB }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.ok(r.stdout.includes(CNT_B211), msg(r));
        assert.match(r.stdout, descB('r1', SHA.ambR1, S211), msg(r));
    },
});
for (const bad of ['r*', 'r?', 'r[12]', 'sp ace', 'r2^{/no such message}']) {
    row(`1 glob / space ref '${bad}' -> exit 2 "--before-ref: '${bad}' is not a commit in <repo> (git fetch?)", 0 spawns, no OUT`, {
        args: (c) => refO(c, { '--before-ref': bad }),
        check: refuses(() => `${reEsc(`--before-ref: '${bad}' is not a commit in ${realpathSync(REPO)} (git fetch?)`)}`),   // --repo is reported as its toplevel (symlinks resolved)
    });
}

// =====================================================================================================
// 2. G-STAGE B4 (was a KNOWN GAP): a TRACKED SYMLINK --module is a blob of mode 120000, and its staged text would be the
// link target's path ("mod.js"). ls-tree's mode must be 100644 or 100755: refused, exit 2, 0 spawns, no OUT. The frozen
// 943bed4 root stages "mod.js" and runs (NO-VERDICT after 7 spawns): red there and on M-lstree-off.
// =====================================================================================================
const LSTREE_RX = (p, ref, mode) => reEsc(`--before-ref: ${p} at ${ref} is not a regular file in git (mode ${mode}): its staged text would not be the module`);
const CS_LINKMOD = row('2 tracked symlink --module src/link.js -> exit 2 "--before-ref: src/link.js at r1 is not a regular file in git (mode 120000)", 0 spawns, no OUT', {
    args: (c) => refO(c, { '--module': 'src/link.js', '--driver': DRV_LINK }),
    env: () => ({ FAKE_MOD: 'link.js' }),
    check: refuses(() => LSTREE_RX('src/link.js', 'r1', '120000')),
});
mutant('M-lstree-off', 'the ls-tree mode refusal -> true', [['[[ "$m" == ok ]] || { m=', 'true || { m=']], CS_LINKMOD, (c, r) => {
    assert.match(r.stdout, /^ {2}mid: NO-VERDICT -- before: driver exited 1 in run 1$/m, msg(r));
    assert.equal(c.spawns().length, 7, c.spawns().join('\n'));
    assert.equal(readFileSync(join(c.out, 'stage', 'before', 'link.js'), 'utf8'), 'mod.js');   // the old gap: the link text staged
});
// control: an executable module (tree mode 100755) is a regular file -> a clean run
const CS_EXE = row('2 control: --module src/mod.js of tree mode 100755 -> not refused, exit 1 DIFF, 7 spawns, empty stderr', {
    args: (c) => refO(c, { '--repo': EXE }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.equal(r.stderr, '', msg(r));
        assert.ok(r.stdout.includes(CNT_B211), msg(r));
        assert.equal(c.spawns().length, 7, c.spawns().join('\n'));
    },
});
mutant('M-lstree-644-only', 'the mode test accepts 100644 only', [['"100644 blob "*|"100755 blob "*) m=ok', '"100644 blob "*) m=ok']], CS_EXE,
    (c, r) => { assert.equal(r.status, 2, msg(r)); assert.match(r.stderr, /mode 100755/, msg(r)); });

// =====================================================================================================
// 3. KNOWN GAP (deferred: --no-replace-objects): refs/replace swaps the staged blob. r1's 211 blob replaced by 213.
// =====================================================================================================
const CS_REPL = row('3 KNOWN GAP git replace of r1:src/mod.js (211 -> 213): the 213 blob is staged, before=1 after=0 213, DESC sha256/8 of "213"', {
    args: (c) => refO(c, { '--repo': REP }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.ok(r.stdout.includes('\n    before=1 after=0  213\n'), msg(r));
        assert.match(r.stdout, descB('r1', SHA.repR1, S213), msg(r));
        assert.equal(readFileSync(join(c.out, 'stage', 'before', 'mod.js'), 'utf8'), '213\n');
    },
});
mutant('M-no-replace', 'cat-file blob gets --no-replace-objects (the deferred fix)',
    [['git -C "$REPO" cat-file blob "$x:$MODULE"', 'git --no-replace-objects -C "$REPO" cat-file blob "$x:$MODULE"']], CS_REPL,
    (c, r) => { assert.equal(readFileSync(join(c.out, 'stage', 'before', 'mod.js'), 'utf8'), '211\n'); });

// =====================================================================================================
// 4. G-STAGE G1 (was a deferred refusal): a --before / --after / --driver value with a leading '-' is read as ./<value>,
// so a dash-led file name is a clean run. The frozen 943bed4 root gave exit 2 "unexpected error (exit 1)" (dirname /
// basename / stat read the name as an option, set -e exits 1, the EXIT trap maps it): red there and on M-dash-revert.
// The oracle below still names that old failure (the M-dash-revert observation).
// =====================================================================================================
// The option-error oracle: BSD ("dirname: illegal option -- b"), GNU ("dirname: invalid option -- 'b'") or uutils
// ("error: unexpected argument '-b' found" ... "Usage: dirname [OPTION] NAME..."), tied to dirname / basename / stat.
const DASH_BSD_GNU = /^(dirname|basename|stat)(: illegal option| ?: (invalid|unrecognized) option)/m;
const DASH_UUTILS = /^error: unexpected argument '-[^']*' found$(?:\n(?!error: ).*)*\n^Usage: (dirname|basename|stat) /m;
const dashToolErr = (s) => DASH_BSD_GNU.test(s) || DASH_UUTILS.test(s);
test('stage boundary: 4 the leading-dash option-error oracle accepts BSD / GNU / uutils wording and rejects unrelated errors (pure JS)', () => {
    const uu = (usage) => `error: unexpected argument '-b' found\n\n  tip: to pass '-b' as a value, use '-- -b'\n\nUsage: ${usage}\n\nFor more information, try '--help'.\n`;
    assert.ok(dashToolErr('dirname: illegal option -- b\nusage: dirname string [...]\n'));
    assert.ok(dashToolErr("dirname: invalid option -- 'b'\nTry 'dirname --help' for more information.\n"));
    assert.ok(dashToolErr(uu('dirname [OPTION] NAME...')));
    assert.ok(dashToolErr(uu('basename [-z] NAME [SUFFIX]')));
    assert.ok(dashToolErr(uu('stat [OPTION]... FILE...')));
    assert.ok(!dashToolErr(uu('cp [OPTION]... SOURCE DEST')), 'Usage line names another tool');
    assert.ok(!dashToolErr("error: unexpected argument '-b' found\n\n  tip: to pass '-b' as a value, use '-- -b'\n"), 'no Usage line');
    assert.ok(!dashToolErr(uu('cp [OPTION]... SOURCE DEST') + "error: the following required arguments were not provided:\n  <NAME>\n\nUsage: dirname [OPTION] NAME...\n"), 'cp error block, then a dirname missing-operand block');
    assert.ok(!dashToolErr('Usage: dirname [OPTION] NAME...\nerror: something else\n'), 'Usage without the unexpected-argument line');
    assert.ok(!dashToolErr('cp: illegal option -- b\n'), 'BSD wording for another tool');
    assert.ok(!dashToolErr(''));
});
const dashOld = (c, r) => {   // the pre-G1 failure: exit 2 via the EXIT trap, a tool's option error, 0 spawns, no OUT
    assert.equal(r.status, 2, msg(r));
    assert.match(r.stderr, /^bytecode-budget: unexpected error \(exit 1\)\nVERDICT NO-VERDICT$/m, msg(r));
    assert.ok(dashToolErr(r.stderr), msg(r));
    assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
    assert.ok(!existsSync(c.out), 'OUT was created');
};
const dashRun = (side, text) => (c, r) => {
    verdict(1, 'DIFF')(r);
    assert.equal(r.stderr, '', msg(r));
    assert.equal(c.spawns().length, 7, c.spawns().join('\n'));   // --version, 2 x --v8-options, 1 fn x 2 runs x 2 sides
    assert.equal(readFileSync(join(c.out, 'stage', side, side === 'before' ? 'mod.js' : '-mod.js'), 'utf8'), text);
};
const CS_DASH_B = row('4 --before -b.js (a readable file in cwd) -> read as ./-b.js: exit 1 DIFF, 7 spawns, empty stderr, stage/before/mod.js = 211', {
    prep: (c) => writeFileSync(join(c.cwd, '-b.js'), '211\n'),
    args: (c) => fileO(c, { '--before': '-b.js' }),
    check: dashRun('before', '211\n'),
});
row('4 --after -mod.js (driver imports ./-mod.js) -> read as ./-mod.js: exit 1 DIFF, 7 spawns, empty stderr, stage/after/-mod.js = 212', {
    prep: (c) => writeFileSync(join(c.cwd, '-mod.js'), '212\n'),
    args: (c) => fileO(c, { '--after': '-mod.js', '--driver': DRV_DASH }),
    env: () => ({ FAKE_MOD: '-mod.js' }),
    check: dashRun('after', '212\n'),
});
const G1_LINE = '[[ "$BEFORE_FILE" != -* ]] || BEFORE_FILE="./$BEFORE_FILE"; [[ "$AFTER_FILE" != -* ]] || AFTER_FILE="./$AFTER_FILE"; [[ "$DRIVER" != -* ]] || DRIVER="./$DRIVER"';
mutant('M-dash-revert', 'the G1 ./ rewrite line removed', [[G1_LINE, ':']], CS_DASH_B, dashOld);
// re-carried (PLAN A5 (2): M-trap-off was HOLLOW once G1 made row 4 a clean run): G1 removed AND the EXIT trap off -> rc 1 escapes
mutant('M-trap-off', 'G1 line removed + EXIT trap condition -> false (rc 1 escapes)', [[G1_LINE, ':'], ['[[ -z $FINAL ]]', 'false']], CS_DASH_B,
    (c, r) => { assert.equal(r.status, 1, `exit 1 (= DIFF) escapes without the trap: ${msg(r)}`); assert.equal(c.spawns().length, 0, c.spawns().join('\n')); });
// ext-audit (B1e): a dash-led --out is a supported DIR name (read as ./-o9, never as an option), so this is a clean run
row('4 adversarial: --out -o9 (leading dash) in ref mode -> exit 1 DIFF, 7 spawns, report.txt + raw/ + stage/ under cwd/-o9, out line <cwd>/-o9', {
    args: (c) => refO(c, { '--out': '-o9' }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.equal(r.stderr, '', msg(r));
        assert.ok(r.stdout.includes(CNT_B211), msg(r));
        assert.match(r.stdout, descB('r1', SHA.r1, S211), msg(r));
        assert.match(r.stdout, descA('r2', SHA.r2, S212), msg(r));
        assert.match(r.stdout, new RegExp(`^out {5}${reEsc(realpathSync(c.cwd))}/-o9$`, 'm'), msg(r));
        assert.equal(c.spawns().length, 7, c.spawns().join('\n'));
        assert.deepEqual(readdirSync(c.cwd), ['-o9']);
        const o9 = join(c.cwd, '-o9');
        assert.deepEqual(readdirSync(o9).sort(), ['raw', 'report.txt', 'stage']);
        assert.deepEqual(files(join(o9, 'raw')), ['after/mid.1.txt', 'after/mid.2.txt', 'before/mid.1.txt', 'before/mid.2.txt']);
        assert.equal(readFileSync(join(o9, 'report.txt'), 'utf8'), r.stdout);
        assert.ok(!existsSync(c.out), 'the default OUT was created');
    },
});

// =====================================================================================================
// 5. a driver whose file name CONTAINS the module name is not "the same file name"
// =====================================================================================================
const nameRow = (label, drv) => row(`5 driver ${label} with module mod.js -> not refused, exit 1 DIFF, driver line names it`, {
    args: (c) => refO(c, { '--driver': drv }),
    check: (c, r) => {
        verdict(1, 'DIFF')(r);
        assert.doesNotMatch(r.stderr, /same file name/);
        assert.match(r.stdout, new RegExp(`^driver  ${reEsc(drv)}  sha256/8 ${sha8(readFileSync(drv))}$`, 'm'), msg(r));
    },
});
const CS_MY = nameRow('mymod.js', DRV_MY);
const CS_SUF = nameRow('mod.js.driver.mjs', DRV_SUF);
const M_SUBSTR = [['[[ "$STAGE_NAME" != "$b" ]]', '[[ "$b" != *"$STAGE_NAME"* ]]']];   // b = basename -- "$DRIVER"
mutant('M-substr-mymod', 'same-name rule widened to a substring match', M_SUBSTR, CS_MY, (c, r) => assert.match(r.stderr, /same file name/));
mutant('M-substr-suffix', 'same-name rule widened to a substring match', M_SUBSTR, CS_SUF, (c, r) => assert.match(r.stderr, /same file name/));

// =====================================================================================================
// 6. --out with spaces: 17 files (report + raw 6 + 6 + stage 2 + 2), the out line verbatim
// =====================================================================================================
row('6 --out "o u t/x y" (spaces) with --fn add,mid,dup -> exit 1, exactly 17 files, out line verbatim', {
    args: (c) => refO({ ...c, out: join(c.dir, 'o u t', 'x y') }, {}, 'add,mid,dup'),
    check: (c, r) => {
        const out = join(c.dir, 'o u t', 'x y');
        verdict(1, 'DIFF')(r);
        assert.match(r.stdout, new RegExp(`^out     ${reEsc(out)}$`, 'm'), msg(r));
        const f = files(out);
        assert.equal(f.length, 17, f.join(' '));
        assert.deepEqual(f.filter((x) => x.startsWith('stage/')), ['stage/after/driver.mjs', 'stage/after/mod.js', 'stage/before/driver.mjs', 'stage/before/mod.js']);
        assert.equal(readFileSync(join(out, 'stage', 'before', 'mod.js'), 'utf8'), '211\n');
    },
});

// =====================================================================================================
// 7. OUT/stage: absent OR empty is allowed (addendum A3); one file, or a regular FILE named stage, is refused, OUT unchanged
// =====================================================================================================
const CS_EMPTY = row('7 OUT/stage present but EMPTY -> allowed: exit 1 DIFF, 9 files (report + raw 2 + 2 + stage 2 + 2)', {
    prep: (c) => mkdirSync(join(c.out, 'stage'), { recursive: true }),
    args: (c) => refO(c),
    check: (c, r) => { verdict(1, 'DIFF')(r); assert.equal(files(c.out).length, 9, files(c.out).join(' ')); },
});
mutant('M-stage-absent-only', 'stage rule tightened to "absent only"', [['[[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]', '[[ ! -e "$OUT/stage" ]]']], CS_EMPTY,
    (c, r) => assert.equal(r.status, 2, msg(r)));
const stageRefused = (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.match(r.stderr, new RegExp(`^bytecode-budget: --out: ${reEsc(c.out)}/stage is not empty \\(give a new or empty DIR\\)\\nVERDICT NO-VERDICT$`, 'm'), msg(r));
    assert.equal(c.spawns().length, 0);
    assert.equal(snap(c.out), c.before, 'OUT changed');
};
const STAGE_TEST = '{ [[ ! -e "$OUT/stage" ]] || { [[ -r "$OUT/stage" && -w "$OUT/stage" && -x "$OUT/stage" ]] && [[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]; }; }';
const STAGE_CHK = STAGE_TEST + ' || die "--out: $OUT/stage is not empty (give a new or empty DIR)"';   // G-STAGE G3 (A1) form
const CS_ONE = row('7 OUT/stage holding ONE file -> exit 2 "--out: <OUT>/stage is not empty", 0 spawns, OUT byte-for-byte unchanged (no raw/, no report.txt)', {
    prep: (c) => { mkdirSync(join(c.out, 'stage'), { recursive: true }); writeFileSync(join(c.out, 'stage', 'f'), 'x\n'); c.before = snap(c.out); },
    args: (c) => refO(c),
    check: stageRefused,
});
mutant('M-stage-chk-off', 'the stage-not-empty refusal deleted', [[STAGE_CHK, ':']], CS_ONE, (c, r) => assert.notEqual(r.status, 2, msg(r)));
// adversarial, KNOWN GAP (code FILLER): a FILE named stage is refused with the wrong reason 'is not empty' (ls -A of a file).
const CS_SFILE = row('7 KNOWN GAP adversarial: OUT/stage is a regular FILE -> exit 2 with the "is not empty" line (pinned wording), OUT unchanged', {
    prep: (c) => { mkdirSync(c.out); writeFileSync(join(c.out, 'stage'), 'x\n'); c.before = snap(c.out); },
    args: (c) => refO(c),
    check: stageRefused,
});
mutant('M-stage-chk-off-file', 'the stage-not-empty refusal deleted', [[STAGE_CHK, ':']], CS_SFILE,
    (c, r) => { assert.equal(r.status, 2, msg(r)); assert.ok(existsSync(join(c.out, 'raw')), 'raw/ was not created first'); });

const onceIn = (s, needle) => s.split(needle).length - 1;
const emptyDirs = (c) => { assert.deepEqual(readdirSync(c.tmp), [], 'TMPDIR kept entries'); assert.deepEqual(readdirSync(c.cwd), [], 'cwd kept entries'); };
// =====================================================================================================
// 10. G-STAGE G2: OUT/stage is a symlink -> refused before any spawn or write (the writes would follow it). The frozen
// 943bed4 root runs the empty-dir link (exit 1 DIFF, the 4 staged files land in elsewhere/) and dies on the dangling one
// only after writing OUT/raw: red there and on M-stage-link-off.
// =====================================================================================================
const linkRefused = (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.match(r.stderr, new RegExp(`^bytecode-budget: ${reEsc(`--out: ${c.out}/stage is a symlink (refused: the writes would follow it)`)}\\nVERDICT NO-VERDICT$`, 'm'), msg(r));
    assert.equal(onceIn(r.stderr, 'is a symlink'), 1, msg(r));
    assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
    assert.deepEqual(readdirSync(c.out), ['stage'], 'OUT gained entries');
    assert.ok(lstatSync(join(c.out, 'stage')).isSymbolicLink());
    emptyDirs(c);
};
const CS_SLINK = row('10 OUT/stage a symlink to an EMPTY dir -> exit 2 "--out: <OUT>/stage is a symlink" once, 0 spawns, the target still empty, OUT holds only the link', {
    prep: (c) => { mkdirSync(join(c.dir, 'elsewhere')); mkdirSync(c.out); symlinkSync(join(c.dir, 'elsewhere'), join(c.out, 'stage')); },
    args: (c) => refO(c),
    check: (c, r) => { linkRefused(c, r); assert.deepEqual(readdirSync(join(c.dir, 'elsewhere')), [], 'the link target gained entries'); },
});
const CS_SDANG = row('10 OUT/stage a DANGLING symlink -> exit 2 "is a symlink" once, 0 spawns, nothing created at the target, OUT holds only the link', {
    prep: (c) => { mkdirSync(c.out); symlinkSync(join(c.dir, 'nowhere'), join(c.out, 'stage')); },
    args: (c) => refO(c),
    check: (c, r) => { linkRefused(c, r); assert.ok(!existsSync(join(c.dir, 'nowhere')), 'the dangling target was created'); },
});
const M_LINK_OFF = [['[[ ! -L "$OUT/stage" ]] || die "--out: $OUT/stage is a symlink', 'true || die "--out: $OUT/stage is a symlink']];
mutant('M-stage-link-off', 'the G2 symlink refusal -> true', M_LINK_OFF, CS_SLINK, (c, r) => {
    assert.equal(r.status, 1, msg(r));
    assert.deepEqual(files(join(c.dir, 'elsewhere')), ['after/driver.mjs', 'after/mod.js', 'before/driver.mjs', 'before/mod.js']);
});
mutant('M-stage-link-off-dangling', 'the G2 symlink refusal -> true', M_LINK_OFF, CS_SDANG, (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.doesNotMatch(r.stderr, /is a symlink/, msg(r));
    assert.ok(existsSync(join(c.out, 'raw')), 'raw/ was not written before the late failure');
});

// =====================================================================================================
// 11. G-STAGE G3 (PLAN A1, the bb mirror of dd row 10b): an unreadable / unsearchable OUT/stage reads as empty to ls -A, and
// an unwritable one fails only in stage_write after OUT/raw is written. Both are refused up front with the "is not empty"
// line (A5 (3): that wording stays), 0 spawns, OUT unchanged. The frozen 943bed4 root writes raw/ + report.txt first.
// =====================================================================================================
const uid0 = typeof process.getuid === 'function' && process.getuid() === 0;
const permRefused = (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.match(r.stderr, new RegExp(`^bytecode-budget: --out: ${reEsc(c.out)}/stage is not empty \\(give a new or empty DIR\\)\\nVERDICT NO-VERDICT$`, 'm'), msg(r));
    assert.equal(onceIn(r.stderr, 'is not empty'), 1, msg(r));
    assert.equal(c.spawns().length, 0, c.spawns().join('\n'));
    assert.equal(snap(c.out), c.before, 'OUT changed (raw/ or report.txt written?)');
    emptyDirs(c);
};
const permRow = (label, mode, withFile) => row(`11 OUT/stage ${label} -> exit 2 "--out: <OUT>/stage is not empty" once, 0 spawns, OUT unchanged (no raw/, no report.txt)`, {
    skip: uid0 ? `root ignores mode ${mode.toString(8)}` : false,
    prep: (c) => {
        mkdirSync(join(c.out, 'stage'), { recursive: true }); if (withFile) writeFileSync(join(c.out, 'stage', 'f'), 'x\n');
        c.before = snap(c.out); chmodSync(join(c.out, 'stage'), mode);
    },
    post: (c) => chmodSync(join(c.out, 'stage'), 0o755),
    args: (c) => refO(c),
    check: permRefused,
});
const CS_000 = permRow('mode 000 holding a file', 0o000, true);
const CS_555 = permRow('EMPTY, mode 555 (readable, not writable)', 0o555, false);
const lateCreate = (c, r) => {
    assert.equal(r.status, 2, msg(r));
    assert.match(r.stderr, /cannot create .*stage\/before and .*stage\/after/, msg(r));
    assert.ok(existsSync(join(c.out, 'raw')) && existsSync(join(c.out, 'report.txt')), 'raw/ + report.txt were not written first');
};
mutant('M-stage-readable-off', 'the G3 form back to the HEAD emptiness test', [[STAGE_TEST, '[[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]']], CS_000, lateCreate);
mutant('M-stage-w-off', '-w dropped from the G3 clause', [['[[ -r "$OUT/stage" && -w "$OUT/stage" && -x "$OUT/stage" ]]', '[[ -r "$OUT/stage" && -x "$OUT/stage" ]]']], CS_555, lateCreate);

// =====================================================================================================
// 12. G-STAGE Q-DD6a (i): a module or --driver file name with a byte outside printable ASCII is refused in stage_check (APFS
// folds Unicode case and NFC / NFD, so such a pair could stage as ONE file): exit 2, the die line once, 0 spawns, TMPDIR
// empty, OUT absent. The frozen 943bed4 root stages and runs every one of them: red there and on M-ascii-off.
// =====================================================================================================
const uRefused = (m, d) => (c, r) => {
    refuses(() => reEsc(`the module or --driver file name has a non-ASCII byte (${m} / ${d}): rename it`))(c, r);
    assert.equal(onceIn(r.stderr, 'non-ASCII byte'), 1, msg(r));
    emptyDirs(c);
};
const uDrv = (c, d, m) => { mkdirSync(join(c.dir, 'ud')); writeFileSync(join(c.dir, 'ud', d), `import './${m}';\n`); return join(c.dir, 'ud', d); };
const uFile = (m, d, extraEnv = {}) => ({
    prep: (c) => { for (const x of ['uf', 'ua']) mkdirSync(join(c.dir, x)); writeFileSync(join(c.dir, 'uf', m), '211\n'); writeFileSync(join(c.dir, 'ua', m), '212\n'); c.drv = uDrv(c, d, m); },
    args: (c) => fileO(c, { '--before': join(c.dir, 'uf', m), '--after': join(c.dir, 'ua', m), '--driver': c.drv }),
    env: () => ({ FAKE_MOD: m, ...extraEnv }),
    check: uRefused(m, d),
});
const uRef = (m, d) => ({
    prep: (c) => { c.drv = uDrv(c, d, m); },
    args: (c) => refO(c, { '--module': 'src/' + m, '--repo': UNI, '--driver': c.drv }),
    env: () => ({ FAKE_MOD: m }),
    check: uRefused(m, d),
});
const CS_U1F = row('12 U1 file mode: module <e-acute>.js, --driver <E-acute>.js (Unicode case pair) -> exit 2 "has a non-ASCII byte" once, 0 spawns, TMPDIR empty, no OUT', uFile(U_E, U_EU));
row('12 U1 ref mode: --module src/<e-acute>.js, --driver <E-acute>.js -> the same refusal', uRef(U_E, U_EU));
row('12 U2 file mode: module m<NFC e-acute>d.js, --driver m<NFD e + U+0301>d.js -> the same refusal', uFile(U_NFC, U_NFD));
const CS_U2R = row('12 U2 ref mode: --module src/m<NFC e-acute>d.js, --driver m<NFD>d.js -> the same refusal', uRef(U_NFC, U_NFD));
const CS_U3 = row('12 U3 file mode: non-ASCII module <e-acute>.js + ASCII --driver driver.mjs -> the same refusal', uFile(U_E, 'driver.mjs'));
row('12 U4 file mode: ASCII module mod.js + non-ASCII --driver d<e-acute>.mjs -> the same refusal', uFile('mod.js', U_DRV));
const CS_U1UTF = row('12 U1 file mode with LANG / LC_ALL=en_US.UTF-8 in the env -> the same refusal (the root pins LC_ALL=C)', uFile(U_E, U_EU, { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }));
row('12 ASCII control: file mode module med.js, --driver drv.js -> not refused, exit 1 DIFF, 7 spawns, empty stderr', {
    ...uFile('med.js', 'drv.js'),
    check: (c, r) => { verdict(1, 'DIFF')(r); assert.equal(r.stderr, '', msg(r)); assert.equal(c.spawns().length, 7, c.spawns().join('\n')); emptyDirs(c); },
});
const I_LINE = '[[ "$STAGE_NAME$b" != *[![:print:]]* ]] || die "the module or --driver file name has a non-ASCII byte ($STAGE_NAME / $b): rename it"';
const II_LINE = '[[ ! "$dir/$STAGE_NAME" -ef "$dir/$b" ]] || die "the staged module and driver are the same file on this file system (case / Unicode fold: $STAGE_NAME / $b): rename the driver"';
const noAscii = (c, r) => assert.doesNotMatch(r.stderr, /non-ASCII byte/, msg(r));
mutant('M-ascii-off', 'the Q-DD6a (i) refusal removed', [[I_LINE, ':']], CS_U3, (c, r) => { noAscii(c, r); assert.equal(r.status, 1, msg(r)); assert.equal(c.spawns().length, 7); });
mutant('M-ascii-off-ref', 'the Q-DD6a (i) refusal removed', [[I_LINE, ':']], CS_U2R, noAscii);
mutant('M-ascii-off-utf8', 'the Q-DD6a (i) refusal removed', [[I_LINE, ':']], CS_U1UTF, noAscii);
// the (ii) belt: on a carrier root without (i), U1 file mode reaches stage_write; a folding FS maps both names to one file.
// stage_write runs after --version and the --v8-flags allowlist read (G-ORDER), so the belt exits after those 2 spawns.
const foldSkip = skip || (FOLDS ? false : `this file system keeps ${JSON.stringify(U_E)} and ${JSON.stringify(U_EU)} apart (no Unicode case fold): the (ii) belt row is not checked, never passed`);
const CS_BELT = {
    ...uFile(U_E, U_EU),
    check: (c, r) => {
        assert.equal(r.status, 2, msg(r));
        assert.match(r.stderr, new RegExp(`^bytecode-budget: ${reEsc(`the staged module and driver are the same file on this file system (case / Unicode fold: ${U_E} / ${U_EU}): rename the driver`)}\\nVERDICT NO-VERDICT$`, 'm'), msg(r));
        assert.equal(onceIn(r.stderr, 'the same file on this file system'), 1, msg(r));
        assert.deepEqual(c.spawns(), ['--version', '--v8-options']);   // G-ORDER: the belt runs in stage_write, after the version check
        assert.deepEqual(readdirSync(join(c.out, 'stage', 'after')), [], 'the belt let the after side be staged');
        emptyDirs(c);
    },
};
test('stage boundary: 12 (ii) belt on a carrier root without (i): U1 file mode -> exit 2 with the belt line once after [--version, --v8-options], stage/after empty', { skip: foldSkip }, () => {
    const { c, r } = runOn(variant('belt-carrier', [[I_LINE, ':']]), CS_BELT);
    CS_BELT.check(c, r);
});
test('stage boundary MUTANT M-ef-belt-off ((i) and (ii) removed): the belt row goes red (one staged file holds the driver text)', { skip: foldSkip }, (t) => {
    const { c, r } = runOn(variant('M-ef-belt-off', [[I_LINE, ':'], [II_LINE, ':']]), CS_BELT);
    t.diagnostic(`M-ef-belt-off: rc=${r.status} spawns=${c.spawns().length} stderr=${JSON.stringify(r.stderr.trim().slice(0, 200))}`);
    assert.throws(() => CS_BELT.check(c, r), assert.AssertionError, 'M-ef-belt-off: the belt row still passes');
    assert.doesNotMatch(r.stderr, /same file on this file system/, msg(r));
    assert.equal(c.spawns().length, 7, c.spawns().join('\n'));
    assert.deepEqual(readdirSync(join(c.out, 'stage', 'before')), [U_E], 'the fold did not leave ONE staged file');
    assert.equal(readFileSync(join(c.out, 'stage', 'before', U_E), 'utf8'), `import './${U_E}';\n`);
});

// =====================================================================================================
// 13. G-STAGE B4 literal pathspec (PLAN A6 blocker 2): ':x.js' is pathspec magic for x.js unless --literal-pathspecs. A
// tracked symlink ':x.js' beside a regular x.js: --module ':x.js' must read ITS mode (120000) -> refused. Frozen 943bed4
// stages the link text "other.js" and runs; M-literal-off reads x.js's mode (100644) and stages it too: red on both.
// =====================================================================================================
const CS_LIT = row('13 tracked symlink :x.js -> other.js beside a regular x.js, --module :x.js -> exit 2 "--before-ref: :x.js at r1 is not a regular file in git (mode 120000)" once, 0 spawns, no OUT', {
    prep: (c) => { mkdirSync(join(c.dir, 'xd')); c.drv = join(c.dir, 'xd', 'driver.mjs'); writeFileSync(c.drv, "import './:x.js';\n"); },
    args: (c) => refO(c, { '--module': ':x.js', '--repo': LIT, '--driver': c.drv }),
    env: () => ({ FAKE_MOD: ':x.js' }),
    check: (c, r) => { refuses(() => LSTREE_RX(':x.js', 'r1', '120000'))(c, r); assert.equal(onceIn(r.stderr, 'is not a regular file in git'), 1, msg(r)); emptyDirs(c); },
});
mutant('M-literal-off', 'git --literal-pathspecs -C -> git -C', [['git --literal-pathspecs -C "$REPO" ls-tree', 'git -C "$REPO" ls-tree']], CS_LIT, (c, r) => {
    assert.doesNotMatch(r.stderr, /not a regular file in git/, msg(r));
    assert.equal(readFileSync(join(c.out, 'stage', 'before', ':x.js'), 'utf8'), 'other.js');
});

// PLAN A5 retention: 20 cycles of the new refusal rows, each into a fresh case: every cycle leaves TMPDIR and cwd empty
// (each row's own check also asserts its OUT / link-target state).
test('stage boundary: A5 retention -- 20 cycles of 8 G-STAGE refusal rows (B4 x2, G2 x2, G3, Q-DD6a U1 file / U2 ref / UTF-8) keep 0 TMPDIR / cwd entries', { skip }, () => {
    const set = [CS_LINKMOD, CS_LIT, CS_SLINK, CS_SDANG, CS_U1F, CS_U2R, CS_U1UTF, ...(uid0 ? [] : [CS_000])];
    for (let i = 0; i < 20; i++) for (const cs of set) { const { c, r } = runOn(SCRIPT, cs); cs.check(c, r); emptyDirs(c); }
});

// =====================================================================================================
// 8. git < 2.32 ignores GIT_CONFIG_GLOBAL (the self-test's isolation of the user's ~/.gitconfig)
// =====================================================================================================
const ge232 = GITVER.length === 2 && (GITVER[0] > 2 || (GITVER[0] === 2 && GITVER[1] >= 32));
const skip232 = skip || (GITVER.length !== 2 ? `git --version did not parse: ${JSON.stringify(gv.stdout.trim())}`
    : (ge232 ? `git ${GITVER.join('.')} >= 2.32 here: the real < 2.32 path is not reachable on this host` : false));
test('stage boundary: 8 real git < 2.32 on this host (isolated empty HOME)', { skip: skip232 }, () => {
    const home = mkdtempSync(join(ROOT, 'home-'));
    const r = stRun(SCRIPT, { ...cleanEnv(), HOME: home });
    assert.equal(r.status, 0, r.stdout + r.stderr);
});
// KNOWN GAP (code FILLER: tg() lacks -c tag.gpgSign=false; PLAN RISK 'the -c flags still cover hooks and signing' is false
// for tags). EMULATED: a git shim that unsets GIT_CONFIG_GLOBAL (as git < 2.32 ignores it) + a HOME/.gitconfig with
// tag.gpgSign=true and a failing gpg.program: the self-test fails CLOSED. GIT_EDITOR=true is pinned so the signed tag's
// missing message is 'no tag message?' on every host (unset, git would ask for -m / -F instead).
function stRun(script, env) { return capSync('bash', [script, '--self-test'], { encoding: 'utf8', env }, 240000, `${basename(script)} --self-test`); }
function emuEnv() {
    const d = mkdtempSync(join(ROOT, 'g232-'));
    mkdirSync(join(d, 'bin')); mkdirSync(join(d, 'home'));
    const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(join(d, 'bin', 'git'), `#!/bin/sh\nunset GIT_CONFIG_GLOBAL\nexec ${JSON.stringify(real)} "$@"\n`); chmodSync(join(d, 'bin', 'git'), 0o755);
    writeFileSync(join(d, 'home', '.gitconfig'), '[tag]\n\tgpgSign = true\n[gpg]\n\tprogram = /usr/bin/false\n');
    return { ...cleanEnv(), GIT_EDITOR: 'true', HOME: join(d, 'home'), PATH: `${join(d, 'bin')}:${process.env.PATH}` };
}
const EMU_FAIL = 'FAIL ref / file modes: temp git repo set up (init, commits r1 r2, tags)';
const emuCheck = (r) => {
    const fails = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.deepEqual(fails, [EMU_FAIL]);
    assert.match(r.stdout, /^ {5}got: {2}git exited 128: fatal: no tag message\?$/m);
    assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('ok   ')).length, 55);   // 64 - the 9 staged rows (repo setup failed)
};
test('stage boundary: 8 KNOWN GAP EMULATED git < 2.32 + ~/.gitconfig tag.gpgSign=true -> --self-test exit 1, ONE FAIL (repo setup: "no tag message?"), 55 ok', { skip }, () => {
    emuCheck(stRun(SCRIPT, emuEnv()));
});
test('stage boundary teeth: [8 KNOWN GAP EMULATED] the 9173830d build has no staged rows (exit 0) -> the row is red', { skip: baseSkip }, () => {
    histGate(haveBase);
    const r = stRun(BASE, emuEnv());
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.throws(() => emuCheck(r), assert.AssertionError);
});
test('stage boundary MUTANT M-tag-gpgsign-off (tg gains -c tag.gpgSign=false): the row goes red (exit 0)', { skip }, () => {
    const r = stRun(variant('M-tag-gpgsign-off', [['-c commit.gpgsign=false "$@"); }', '-c commit.gpgsign=false -c tag.gpgSign=false "$@"); }']]), emuEnv());
    assert.throws(() => emuCheck(r), assert.AssertionError);
    assert.equal(r.status, 0, r.stdout);
});

// =====================================================================================================
// 9. PRE-EXISTING (not group 2b; addendum A4 deferred nit): --self-test has no INT/TERM trap, so a Ctrl-C (SIGINT to
// the process group) leaves its mktemp -d dir behind. macOS mktemp ignores TMPDIR, so a PATH shim logs the dir.
// The SIGINT must land while the self-test is PROVABLY running (b38: sending it on the first ok line raced the
// self-test's exit on CI, code=0). An awk PATH shim passes every call through EXCEPT the self-test's own second
// check: its "names" fixture is written only after the first ok line is echoed, so an awk call on <mktemp dir>/names
// (with <dir>/add beside it) proves "one ok line out, self-test still running". That call writes `ready` and blocks
// (exec sleep); the test waits for `ready` AND the ok line, THEN signals the group. A SIGKILL timer bounds a hang.
function sigintRun(script) {
    return new Promise((resolve, reject) => {
        const d = mkdtempSync(join(ROOT, 'sig-'));
        const which = (c) => spawnSync('sh', ['-c', `command -v ${c}`], { encoding: 'utf8' }).stdout.trim();
        const real = which('mktemp'), realAwk = which('awk');
        const log = join(d, 'mktemp.log'), ready = join(d, 'ready');
        mkdirSync(join(d, 'bin'));
        writeFileSync(join(d, 'bin', 'mktemp'), `#!/bin/sh\nx=$(${JSON.stringify(real)} "$@") || exit $?\necho "$x" >> ${JSON.stringify(log)}\necho "$x"\n`);
        chmodSync(join(d, 'bin', 'mktemp'), 0o755);
        writeFileSync(join(d, 'bin', 'awk'), `#!/bin/sh
for a in "$@"; do
  case "$a" in */names)
    if [ ! -e ${JSON.stringify(ready)} ] && [ -f "\${a%/names}/add" ] && grep -q -x -F -e "\${a%/names}" ${JSON.stringify(log)} 2>/dev/null; then
      : > ${JSON.stringify(ready)}; exec sleep 300
    fi ;;
  esac
done
exec ${JSON.stringify(realAwk)} "$@"
`);
        chmodSync(join(d, 'bin', 'awk'), 0o755);
        const ch = spawn('bash', [script, '--self-test'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...cleanEnv(), PATH: `${join(d, 'bin')}:${process.env.PATH}` } });
        let out = '', killed = false, exited = false, ok = false, wasReady = false, waitedOut = false, escalated = false;
        const group = (sig) => { try { process.kill(-ch.pid, sig); } catch { /* group gone */ } };
        ch.stdout.on('data', (b) => { out += b; ok = ok || /^ok {3}/m.test(out); });
        ch.stderr.on('data', () => {});
        ch.on('exit', () => { exited = true; });
        let hard = null;
        (async () => {
            for (let i = 0; i < 3000 && !exited && !(ok && existsSync(ready)); i++) await new Promise((r) => setTimeout(r, 20));
            wasReady = existsSync(ready);
            if (!exited && ok && wasReady) { killed = true; group('SIGINT'); hard = setTimeout(() => { escalated = true; group('SIGKILL'); }, 30000); }
            else { waitedOut = !exited; group('SIGKILL'); }   // never ready (or exited first): no SIGINT, no 300 s sleep left behind
        })();
        ch.on('close', (code, signal) => {
            if (hard) clearTimeout(hard);
            wasReady = wasReady || existsSync(ready);   // the waiter may not have run since the exit
            group('SIGKILL');
            const dirs = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
            const left = dirs.filter((x) => existsSync(x));
            const hasAdd = left.some((x) => existsSync(join(x, 'add')));
            for (const x of left) rmSync(x, { recursive: true, force: true });   // the test cleans what the script left
            // outside sigCheck: a teeth / mutant assert.throws can never swallow it
            if (escalated) { try { assert.fail('bytecode-budget.sh --self-test SIGINT run timed out after 30000 ms (killed by SIGKILL)'); } catch (e) { reject(e); return; } }
            resolve({ code, signal, killed, wasReady, waitedOut, ok, dirs, left, hasAdd, out });
        });
    });
}
// sigintRun sends the SIGINT only once `ready` exists (killed implies wasReady), so the killed assert runs FIRST and names
// the most specific of the three no-SIGINT paths; the wasReady assert after it only guards that runner invariant.
const sigCheck = (s) => {
    assert.ok(s.killed, s.waitedOut
        ? `the wait (3000 polls x 20 ms, ~60 s) ran out (ok line seen: ${s.ok}, awk shim blocked on "names" (ready file): ${s.wasReady}); the group was SIGKILLed, no SIGINT sent`
        : s.wasReady
            ? `the self-test exited (code=${s.code} sig=${s.signal}) AFTER its awk call on the "names" fixture blocked, and no SIGINT was sent (ok line seen: ${s.ok}): the blocking sleep or the bash ended early (an outside signal, or the sleep failed)`
            : `the self-test exited (code=${s.code} sig=${s.signal}) without the awk shim blocking on its "names" call (no ready file: the self-test ended before that call, or the shim guard did not match it; ok line seen: ${s.ok}); no SIGINT sent`);
    assert.ok(s.wasReady, 'runner invariant broken: the SIGINT was sent but the awk "names" ready file was never seen');
    assert.ok(s.signal === 'SIGINT' || s.code === 130, `not terminated by SIGINT: code=${s.code} sig=${s.signal}`);
    assert.ok(s.dirs.length >= 1, 'mktemp -d not seen');
    assert.equal(s.left.length, 1, `left behind: ${s.left.join(' ')}`);
    assert.ok(s.hasAdd, 'the left dir is the self-test dir (holds its "add" fixture)');
    assert.doesNotMatch(s.out, /^self-test: all checks passed$/m);
};
test('stage boundary: 9 PRE-EXISTING --self-test SIGINT after the first ok line -> killed by SIGINT, its temp dir LEFT BEHIND (no INT/TERM trap)', { skip }, async () => {
    sigCheck(await sigintRun(SCRIPT));
});
test('stage boundary: 9 PRE-EXISTING same on the 9173830d build (not new in group 2b)', { skip: baseSkip }, async () => {
    histGate(haveBase);
    sigCheck(await sigintRun(BASE));
});
test('stage boundary MUTANT M-int-trap (self_test gains an INT/TERM cleanup trap): the row goes red (dir removed)', { skip }, async () => {
    const p = variant('M-int-trap', [['local d; d=$(mktemp -d)', 'local d; d=$(mktemp -d); trap \'rm -rf "$d"; exit 130\' INT TERM']]);
    const s = await sigintRun(p);
    assert.throws(() => sigCheck(s), assert.AssertionError);
    assert.equal(s.left.length, 0);
});
