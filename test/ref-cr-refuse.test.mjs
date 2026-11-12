// test/ref-cr-refuse.test.mjs -- b74 F-D (ruling Q-XF-CR (a); findings IBD-opus-b-2, DD-opus-a-2, lib-cross-fable-1): a newline or a
// CR in a ref / file value is refused, exit 2, before any spawn or write. bytecode-budget / deopt-diff (lib/stage.sh stage_check):
// --before-ref, --after-ref, --before, --after, --module, --driver, --repo. inlining-budget-diff (the G-X6 preflight): --before-ref,
// --after-ref, --driver, --repo. Oracle = the ruling + fixC's GATE (audit/2026-11-11-final/fable/cross/CROSSCHECK.md), not the code.
//   ROW 1  {bb, dd, ibd} x {--before-ref, --after-ref} x {LF, CR}: the bad ref RESOLVES (`<sha2>^{/second<LF>}` / `<sha2>^{/first<CR>}`,
//          commit-message search), so an old root that lets it through reaches node and --out
//   ROW 2  {bb, dd}: --module `a<CR>b/Mod.js`, a directory committed with a CR in its name (both refs have the file)
//   ROW 3  {bb, dd, ibd}: --repo = a git work tree named `re<CR>po`, refs that do not resolve there
//   ROW 4  {bb, dd, ibd}: a missing --driver `<x>/no<CR>such.js` (refs resolve)
//   ROW 4b ibd ref mode (b74 F-D r1): --driver `<x>/x<CR>`, a symlink to <o>/report.txt, --out <o> created with an empty report.txt:
//          the CR refusal fires before rep_refuse (whose text echoes the driver); oracle as below, but <o> exists before and its tree
//          (inside the case tree) is unchanged instead of "no --out dir"
//   ROW 5  {bb, dd} file mode: a missing --before `<x>/fr<CR>b/Mod.js` / a missing --after `<x>/fr<CR>a/Mod.js` (the other side exists)
//   EVERY row: rc 2, 0 fake-node spawns, 0 stdout bytes, stderr EXACTLY `<tool>: <label>: a newline or a CR is not allowed (it would
//          forge report lines)\nVERDICT NO-VERDICT\n` (label bb / dd: `--before-ref / --after-ref / --before / --after / --module /
//          --driver / --repo`; ibd: `--before-ref / --after-ref / --driver / --repo`), no CR on stderr, no --out dir created, and the
//          case tree (cwd, private TMPDIR, the driver dir) unchanged
//   ROW 6  OLD twin per row: the 035e939 root (b74 F-C, before F-D) FAILS the same oracle. SKIP when unreachable, FAIL under CI=true
//   ROW 7  must-fail controls: the clean ref shape (refs <sha1> <sha2>) is NOT refused by the new text and spawns node (>= 1)
//   ROW 8  mutants of the live root (count-checked, exact once): fixC (a) ibd checks "$BEFORE_REF" only, (b) the lib/stage.sh line
//          reverted to the newline-only loop, (c) lib/stage.sh checks "$MODULE" only, and "drop one value" for each of the seven
//          bb / dd values and the four ibd values: each turns its named rows red
//          (r1) the ibd line moved back below rep_refuse (now after the G-X6 block, b74 F-E): ROW 4b red
//   ROW 10 b74 F-E (rulings Q-B74-FCSEAM, Q-B74-FESCOPE; finding fd-rev-1): an input value with a CR that is also -ef <o>/report.txt
//          (or ibd's <o>/budget.turbo.tsv, an OUT_NAMES file): <x>/x<CR> a symlink to it, <o> created with it empty. ibd driver mode
//          (the DRIVER positional, to report.txt and to budget.turbo.tsv), ibd file mode (--before / --after), dd driver mode (the
//          before positional), ic (the after positional): the G-X6 refusal fires, never rep_refuse (whose text echoes the value).
//          Same oracle as ROW 4b; label `DRIVER (resolved)` (ibd file mode: `--before / --after / --driver (resolved)`; since b75 F-F
//          dd / ic / bb positional rows: `DRIVER`, the raw check of ROW 12 fires first; the bb pin's OLD run keeps `DRIVER (resolved)`)
//   ROW 10 OLD twin per row: the 768c388 root (b74 F-D, before F-E) fails the row WITH a CR on stderr. SKIP / CI=true as ROW 6
//   ROW 10 bb-clean pin: bb driver mode (x<CR> before positional) and file mode (--before x<CR>): GREEN on the live AND the
//          768c388 root (bb's G-X6 / stage_check already ran before its rep_refuse; pins that bb stays clean)
//   ROW 11 mutants (exact once): rep_refuse moved back above G-X6 per tool (ibd: below the ref-mode line; dd / ic: back into the
//          --out block; dd / ic since b75 F-F: + the raw DRIVER line dropped): each turns its tool's ROW 10 rows red with a CR on stderr
//   ROW 12 b75 F-F (rulings Q-B74-FERAW, Q-B75-FFSCOPE): a CR in a RAW DRIVER positional or in the RAW --out value is refused
//          before the first refusal that echoes it. DRIVER (dd, ic, ad, bb --diff): `<d>/d<CR>/../o/report.txt` (d<CR> a real dir,
//          the path -ef <o>/report.txt: rep_refuse / ad's -ef die echo it), a missing `<x>/x<CR>` (the not-found die) as the before
//          AND (r1) as the after positional, and
//          `<d>/l<CR>/../drv.js` with l<CR> a symlink to <x>/a (the cannot-resolve die, "a symlink before '..'"; ad has it too, at
//          its DRV_DIR loop); bb measure mode (the same three) and ad --zero (ef-report, missing). --out (ad, dd, ic, ibd): `f<CR>`
//          an existing file (not-a-directory / ibd cannot-create) and `o<CR>` a dir whose raw/ is a symlink; dd staged (file mode)
//          `s<CR>` with s<CR>/stage a file. Same oracle as ROW 4b (label `DRIVER` / `--out`; <o> may exist before: the case tree
//          covers it). bb (ruling Q-B75-FFBBSTAGE): staged file mode and ref mode `--out o<CR>` with o<CR>/stage a symlink (lib/stage.sh
//          stage_check echoed it); bb --out `f<CR>` (a file, bb --diff driver mode): label `--out` on the live root, and a pin that the
//          4dadb5d root was already clean there (label `--out (resolved)`: nl_dir ran before bb's driver-mode --out refusals)
//   ROW 12 OLD twin per row: the 4dadb5d root (b74 docs batch, before F-F; the bytes of .handoff/frozen/b75-ff-before) fails the
//          row WITH a CR on stderr. SKIP / CI=true as ROW 6. Control per row: the same shape without the CR exits 2 by its old
//          die, never by the new text
//   ROW 13 mutants of the live roots (exact once), per tool: the new DRIVER / --out line dropped, checking a newline only, and
//          moved below the first raw-echo die (ad / dd / ic / bb not-found, ad / ic not-a-directory, dd stage, ibd cannot-create, bb
//          --out below stage_check), and (r1) dd / bb checking "${POS[0]}" only (the after-missing row):
//          each turns its named ROW 12 rows red with a CR on stderr
//   ROW 9  retention: the mkdtemp top is removed in after(); the live `git status --porcelain` `??` set is unchanged
// Own fake node (bash): logs one SPAWN line per call, answers --version / --v8-options (tracked fixture) / -p, else prints its
// last argument's file and exits 0. No timing assertions. Git repos under one mkdtemp top, editor env stripped.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, readdirSync, lstatSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const OPTS_FIX = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = '035e939';
const OLD_FE = '768c388';   // b74 F-D: rep_refuse before G-X6 in ibd / dd / ic (ROW 10 old twins)
const CI_STRICT = process.env.CI === 'true';
const CR = '\r', NL = '\n';

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'OUT_NAMES', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'ref-cr-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
const untracked = () => spawn('git', ['status', '--porcelain'], { cwd: PKG }, 'git status --porcelain', 30000).stdout.split('\n').filter((l) => l.startsWith('?? ')).sort();

// ---- the git repos: R (two commits: Signal.js, src/Mod.js, `a<CR>b/Mod.js`; messages `first<CR>x` / `second<LF>x`), RC (`re<CR>po`) ----
const G = { R: null, RC: null, S1: null, S2: null };
function git(cwd, args, what) {
    const r = spawn('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd }, what, 30000);
    assert.equal(r.status, 0, `${what}: ${r.stderr}`);
    return r.stdout.trim();
}
function mkRepos() {
    const R = join(mk('repo'), 'r'); mkdirSync(join(R, 'src'), { recursive: true }); mkdirSync(join(R, `a${CR}b`));
    git(R, ['init', '-q'], 'git init R');
    const put = (v) => {
        writeFileSync(join(R, 'Signal.js'), `export const add = (a, b) => ${v};\n`);
        writeFileSync(join(R, 'src', 'Mod.js'), `export const add = (a, b) => ${v};\n`);
        writeFileSync(join(R, `a${CR}b`, 'Mod.js'), `export const add = (a, b) => ${v};\n`);
        git(R, ['add', '-A'], 'git add');
    };
    put('a + b'); git(R, ['commit', '-q', '-m', `first${CR}x`], 'commit 1'); G.S1 = git(R, ['rev-parse', 'HEAD'], 'rev-parse 1');
    put('b + a'); git(R, ['commit', '-q', '-m', `second${NL}x`], 'commit 2'); G.S2 = git(R, ['rev-parse', 'HEAD'], 'rev-parse 2');
    const RC = join(dirname(R), `re${CR}po`); mkdirSync(RC);
    git(RC, ['init', '-q'], 'git init RC');
    writeFileSync(join(RC, 'Signal.js'), 'export const add = (a, b) => a + b;\n');
    git(RC, ['add', '-A'], 'git add RC'); git(RC, ['commit', '-q', '-m', 'one'], 'commit RC');
    G.R = R; G.RC = RC;
    // the bad refs resolve (commit-message search): an old root that lets them through reaches node
    for (const [ref, want] of [[`${G.S2}^{/first${CR}}`, G.S1], [`${G.S2}^{/second${NL}}`, G.S2]]) {
        assert.equal(git(R, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], 'rev-parse bad ref'), want, `fixture: ${JSON.stringify(ref)} does not resolve`);
    }
}

let GIT0 = null;
before(() => { mkTop(); GIT0 = untracked(); if (!skip) mkRepos(); });
after(() => {
    const top = TOP;
    if (top !== null) rmSync(top, { recursive: true, force: true });
    TOP = null;
    assert.ok(top === null || !existsSync(top), `ROW 9: the mkdtemp top ${top} was not removed`);
    assert.deepEqual(untracked(), GIT0, 'ROW 9: the live repo gained / lost untracked entries');
});

const rd = (p) => readFileSync(p, 'utf8');
const msg = (r) => `rc=${r.status}\n--- stdout\n${JSON.stringify(r.stdout)}\n--- stderr\n${JSON.stringify(r.stderr)}`;
const LIVE = (t) => join(PKG, `${t}.sh`);
function once(src, from, to, what) {   // an exact-once, count-checked edit
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `${what}: the anchor matched ${n} times (want 1)`);
    return src.replace(from, () => to);
}

// ---- the old twins ----
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || (haveOld === true || CI_STRICT ? false : haveOld);
const haveOldFe = spawn('git', ['cat-file', '-e', `${OLD_FE}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_FE} not available (shallow clone?)`;
const OLDFESKIP = skip || (haveOldFe === true || CI_STRICT ? false : haveOldFe);
const OLD = {};
function oldRoot(t, sha = OLD_SHA) {
    const k = `${sha}:${t}`;
    if (OLD[k]) return OLD[k];
    const g = spawn('git', ['show', `${sha}:${t}.sh`], { cwd: PKG, encoding: 'buffer' }, `git show ${t}.sh`, 30000);
    assert.equal(g.status, 0, `git show ${sha}:${t}.sh failed (CI_STRICT: an unreachable pin is a failure)`);
    const p = join(mk('old'), `${t}.sh`);
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD[k] = p);
}

// ---- fake node ----
function fakeText(dir) {
    return ['#!/bin/bash', `D=${JSON.stringify(dir)}`, 'printf "SPAWN\\n" >> "$D/spawn.log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        '  -p) echo "v26.8.2 (V8 0)"; exit 0 ;;',
        'esac', 'for a; do last="$a"; done', 'cat -- "$last" 2>/dev/null', 'exit 0', ''].join('\n');
}
const DRV = "import { add } from './Mod.js';\nlet s = 0;\nfor (let i = 0; i < 2000; i++) s += add(i, 1);\n";
// one case: dir/{node, cwd, tmp, x/{drv.js, a/Mod.js, b/Mod.js}}; o = dir/o is never created by a refused run
function mkCase() {
    const dir = mk('c');
    const c = { dir, node: join(dir, 'node'), cwd: join(dir, 'cwd'), tmp: join(dir, 'tmp'), o: join(dir, 'o'), x: join(dir, 'x') };
    for (const d of [c.cwd, c.tmp, join(c.x, 'a'), join(c.x, 'b')]) mkdirSync(d, { recursive: true });
    writeFileSync(c.node, fakeText(dir)); chmodSync(c.node, 0o755);
    c.drv = join(c.x, 'drv.js'); writeFileSync(c.drv, DRV);
    c.fb = join(c.x, 'b', 'Mod.js'); writeFileSync(c.fb, 'export const add = (a, b) => a + b;\n');
    c.fa = join(c.x, 'a', 'Mod.js'); writeFileSync(c.fa, 'export const add = (a, b) => b + a;\n');
    c.spawns = () => (existsSync(join(dir, 'spawn.log')) ? rd(join(dir, 'spawn.log')).split('\n').filter((l) => l !== '').length : 0);
    return c;
}
function run(root, c, argv, what) {
    return spawn(BASH, [root, '--node', c.node, '--out', c.o, ...argv], { cwd: c.cwd, env: cleanEnv({ PWD: c.cwd, TMPDIR: c.tmp }) }, what, 90000);
}
// every entry under the case dir (recursive, sorted, with the file size): a refusal before any write leaves it as it was
const tree = (c) => readdirSync(c.dir, { recursive: true }).map(String).sort().map((p) => { const s = lstatSync(join(c.dir, p)); return `${p} ${s.isDirectory() ? 'd' : s.size}`; });

const BB = 'bytecode-budget', DD = 'deopt-diff', IBD = 'inlining-budget-diff';
const HEAD = { [BB]: ['--diff', '--fn', 'add'], [DD]: ['--fn', 'add'], [IBD]: ['--tiers', 'turbo', '--runs', '2', '--no-bytecode'] };
const LABEL = {
    [BB]: '--before-ref / --after-ref / --before / --after / --module / --driver / --repo',
    [DD]: '--before-ref / --after-ref / --before / --after / --module / --driver / --repo',
    [IBD]: '--before-ref / --after-ref / --driver / --repo',
};
const want = (tool, label = LABEL[tool]) => `${tool}: ${label}: a newline or a CR is not allowed (it would forge report lines)\nVERDICT NO-VERDICT\n`;
// ref-mode argv: bb / dd need --module and --driver; ibd stages Signal.js and writes its default driver
const refArgs = (tool, c, b, a, { repo = G.R, module = 'src/Mod.js', driver = c.drv } = {}) => (tool === IBD
    ? [...HEAD[tool], '--before-ref', b, '--after-ref', a, '--repo', repo, ...(driver === c.drv ? [] : ['--driver', driver])]
    : [...HEAD[tool], '--before-ref', b, '--after-ref', a, '--repo', repo, '--module', module, '--driver', driver]);
const BADREF = { LF: () => `${G.S2}^{/second${NL}}`, CR: () => `${G.S2}^{/first${CR}}` };

// ROWS: name -> { tool, row, argv(c) }
const ROWS = {};
for (const tool of [BB, DD, IBD]) {
    const k = tool === BB ? 'bb' : tool === DD ? 'dd' : 'ibd';
    for (const x of ['LF', 'CR']) {
        ROWS[`${k} before-ref ${x}`] = { tool, row: 1, argv: (c) => refArgs(tool, c, BADREF[x](), G.S2) };
        ROWS[`${k} after-ref ${x}`] = { tool, row: 1, argv: (c) => refArgs(tool, c, G.S1, BADREF[x]()) };
    }
    if (tool !== IBD) ROWS[`${k} module CR`] = { tool, row: 2, argv: (c) => refArgs(tool, c, G.S1, G.S2, { module: `a${CR}b/Mod.js` }) };
    ROWS[`${k} repo CR`] = { tool, row: 3, argv: (c) => refArgs(tool, c, 'nosuch1', 'nosuch2', { repo: G.RC }) };
    ROWS[`${k} driver CR`] = { tool, row: 4, argv: (c) => refArgs(tool, c, G.S1, G.S2, { driver: join(c.x, `no${CR}such.js`) }) };
    if (tool === IBD) {
        ROWS[`${k} driver CR report-link`] = { tool, row: '4b', outPre: true, argv: (c) => {
            mkdirSync(c.o); writeFileSync(join(c.o, 'report.txt'), '');
            const l = join(c.x, `x${CR}`); symlinkSync(join(c.o, 'report.txt'), l);
            return refArgs(tool, c, G.S1, G.S2, { driver: l });
        } };
    } else {
        ROWS[`${k} file-before CR`] = { tool, row: 5, argv: (c) => [...HEAD[tool], '--driver', c.drv, '--before', join(c.x, `fr${CR}b`, 'Mod.js'), '--after', c.fa] };
        ROWS[`${k} file-after CR`] = { tool, row: 5, argv: (c) => [...HEAD[tool], '--driver', c.drv, '--before', c.fb, '--after', join(c.x, `fr${CR}a`, 'Mod.js')] };
    }
}

// the ONE oracle: the list of failed expectations (empty = the fixed behaviour)
function problems(r, c, tool, tree0, outPre = false, label = LABEL[tool]) {
    const bad = [];
    if (r.status !== 2) bad.push(`rc ${r.status} != 2`);
    if (c.spawns() !== 0) bad.push(`${c.spawns()} fake-node spawns != 0`);
    if (r.stdout !== '') bad.push(`${r.stdout.length} stdout bytes != 0`);
    if (r.stderr !== want(tool, label)) bad.push(`stderr is not exactly ${JSON.stringify(want(tool, label))}`);
    if (r.stderr.includes(CR)) bad.push('a CR on stderr');
    if (!outPre && existsSync(c.o)) bad.push('--out dir created');   // ROW 4b: <o> exists before; the case-tree check covers it
    const t = tree(c);
    if (JSON.stringify(t) !== JSON.stringify(tree0)) bad.push(`the case tree changed: ${JSON.stringify(tree0)} -> ${JSON.stringify(t)}`);
    return bad;
}
function runRow(root, name, R) {
    const c = mkCase(); const argv = R.argv(c); const tree0 = tree(c);
    const r = run(root, c, argv, name);
    return { r, bad: problems(r, c, R.tool, tree0, R.outPre === true, R.label) };
}

for (const [name, R] of Object.entries(ROWS)) {
    test(`ROW ${R.row} ${name}: rc 2, 0 spawns, the exact G-X6 refusal, no CR on stderr, no --out, the case tree unchanged`, { skip }, () => {
        const { r, bad } = runRow(LIVE(R.tool), name, R);
        assert.deepEqual(bad, [], msg(r));
    });
    test(`ROW 6 OLD twin ${name}: the ${OLD_SHA} root fails the row`, { skip: OLDSKIP }, () => {
        const { r, bad } = runRow(oldRoot(R.tool), `${name} (old)`, R);
        assert.ok(bad.length > 0, `old root already meets the row (the row has no teeth)\n${msg(r)}`);
    });
}

// ROW 7 must-fail controls: clean refs are not refused by the new text and reach node
for (const tool of [BB, DD, IBD]) {
    test(`ROW 7 control ${tool}: refs <sha1> <sha2> are not refused by the new text, >= 1 spawn`, { skip }, () => {
        const c = mkCase();
        const r = run(LIVE(tool), c, refArgs(tool, c, G.S1, G.S2), `${tool} control`);
        assert.ok(!r.stderr.includes('a newline or a CR is not allowed'), msg(r));
        assert.ok(c.spawns() >= 1, `0 spawns: the control was refused before node\n${msg(r)}`);
    });
}

// ROW 8 mutants: each is an exact-once edit of the LIVE root; every named row must go red on it
const ST_C = '  # the head prints the refs and --module, and the refusals below print every one of the seven: a newline or a CR would forge lines (G-X6)\n';
const ST_ARGS = '"$BEFORE_REF" "$AFTER_REF" "$BEFORE_FILE" "$AFTER_FILE" "$MODULE" "$DRIVER" "$REPO"';
const ST_LINE = `  nl_refuse "${LABEL[BB]}" ${ST_ARGS}\n`;
const ST_OLD = `  for x in ${ST_ARGS}; do\n    [[ "$x" != *$'\\n'* ]] || die "${LABEL[BB]}: a newline is not allowed"\n  done\n`;
const IBD_ARGS = '"$BEFORE_REF" "$AFTER_REF" "$DRIVER" "$REPO"';
const IBD_LINE = `nl_refuse "${LABEL[IBD]}" ${IBD_ARGS}`;
const ROWOF = { BEFORE_REF: ['before-ref CR', 'before-ref LF'], AFTER_REF: ['after-ref CR', 'after-ref LF'], BEFORE_FILE: ['file-before CR'],
    AFTER_FILE: ['file-after CR'], MODULE: ['module CR'], DRIVER: ['driver CR'], REPO: ['repo CR'] };
const MUTANTS = [];
for (const k of ['bb', 'dd']) {
    const tool = k === 'bb' ? BB : DD;
    const allCr = Object.keys(ROWS).filter((n) => n.startsWith(`${k} `) && n.endsWith(' CR'));
    MUTANTS.push({ id: `(b) ${k} stage.sh line reverted to the newline-only loop`, tool, edit: [ST_C + ST_LINE, ST_OLD], rows: allCr });
    MUTANTS.push({ id: `(c) ${k} stage.sh checks "$MODULE" only`, tool, edit: [ST_LINE, `  nl_refuse "${LABEL[BB]}" "$MODULE"\n`],
        rows: allCr.filter((n) => n !== `${k} module CR`).concat([`${k} before-ref LF`, `${k} after-ref LF`]) });
    for (const v of Object.keys(ROWOF)) {
        MUTANTS.push({ id: `drop ${v} (${k}, lib/stage.sh)`, tool, edit: [ST_LINE, ST_LINE.replace(` "$${v}"`, '')], rows: ROWOF[v].map((n) => `${k} ${n}`) });
    }
}
MUTANTS.push({ id: '(a) ibd checks "$BEFORE_REF" only', tool: IBD, edit: [IBD_LINE, `nl_refuse "${LABEL[IBD]}" "$BEFORE_REF"`],
    rows: ['ibd after-ref CR', 'ibd after-ref LF', 'ibd repo CR', 'ibd driver CR', 'ibd driver CR report-link'] });
for (const v of ['BEFORE_REF', 'AFTER_REF', 'DRIVER', 'REPO']) {
    MUTANTS.push({ id: `drop ${v} (ibd)`, tool: IBD, edit: [IBD_LINE, IBD_LINE.replace(` "$${v}"`, '')], rows: ROWOF[v].map((n) => `ibd ${n}`).concat(v === 'DRIVER' ? ['ibd driver CR report-link'] : []) });
}
// (r1) the b74 F-D r1 seam: the ibd line back below rep_refuse (b74 F-E: rep_refuse now sits after the G-X6 file-mode line)
const IBD_FULL = `${IBD_LINE}   # ref mode prints the refs in the head; the refusals of lib/modes.sh print --driver and --repo (Q-XF-CR)\n`;
const IBD_FM = '[[ -z "$BEFORE_FILE$AFTER_FILE" ]] || nl_refuse "--before / --after / --driver (resolved)" "$BEFORE_FILE" "$AFTER_FILE"   # file mode prints them (Q-B68-IBDCR)\n';
const REP_ARGS = 'rep_refuse ${POS[@]+"${POS[@]}"} "$DRIVER" "$BEFORE_FILE" "$AFTER_FILE"\n';
const REP_C = '# rep_refuse prints the input value: it runs after the G-X6 newline / CR refusals above, before the first spawn or write (finding fd-rev-1, ruling Q-B74-FCSEAM)\n';
MUTANTS.push({ id: '(r1) ibd line moved back below rep_refuse', tool: IBD, edits: [[IBD_FULL, ''], [IBD_FM + REP_C + REP_ARGS, IBD_FM + REP_C + REP_ARGS + IBD_FULL]], rows: ['ibd driver CR report-link'] });
const MUT = {};
function mutRoot(m) {
    if (MUT[m.id]) return MUT[m.id];
    let src = rd(LIVE(m.tool));
    for (const [from, to] of m.edits || [m.edit]) { assert.notEqual(from, to, `${m.id}: a no-op edit`); src = once(src, from, to, m.id); }
    const p = join(mk('mut'), `${m.tool}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return (MUT[m.id] = p);
}
for (const m of MUTANTS) {
    test(`ROW 8 mutant ${m.id}: rows ${m.rows.join(', ')} go red`, { skip }, () => {
        const p = mutRoot(m);
        for (const n of m.rows) {
            assert.ok(ROWS[n], `mutant ${m.id} names an unknown row ${n}`);
            const { r, bad } = runRow(p, `${n} (${m.id})`, ROWS[n]);
            assert.ok(bad.length > 0, `mutant ${m.id} survives row ${n}\n${msg(r)}`);
        }
    });
}

// ---- ROW 10 / 11: b74 F-E (rulings Q-B74-FCSEAM, Q-B74-FESCOPE; finding fd-rev-1) ----
const IC = 'ic-diff';
HEAD[IC] = ['--fn', 'add'];
const RES = 'DRIVER (resolved)', FMODE = '--before / --after / --driver (resolved)';
// <o> made with an empty report.txt (and, for ibd's OUT_NAMES row, the named file); <x>/x<CR> a symlink to <o>/<name>
function crLink(c, name = 'report.txt') {
    mkdirSync(c.o); writeFileSync(join(c.o, 'report.txt'), '');
    if (name !== 'report.txt') writeFileSync(join(c.o, name), '');
    const l = join(c.x, `x${CR}`); symlinkSync(join(c.o, name), l);
    return l;
}
function sig(c) { const p = join(c.x, 's', 'Signal.js'); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, 'export const add = (a, b) => a + b;\n'); return p; }
const FE = {
    'ibd driver-pos CR report-link': { tool: IBD, label: RES, argv: (c) => [...HEAD[IBD], crLink(c)] },
    'ibd driver-pos CR budget-link': { tool: IBD, label: RES, argv: (c) => [...HEAD[IBD], crLink(c, 'budget.turbo.tsv')] },
    'ibd file-before CR report-link': { tool: IBD, label: FMODE, argv: (c) => { const l = crLink(c); return [...HEAD[IBD], '--before', l, '--after', sig(c)]; } },
    'ibd file-after CR report-link': { tool: IBD, label: FMODE, argv: (c) => { const l = crLink(c); return [...HEAD[IBD], '--before', sig(c), '--after', l]; } },
    'dd driver-pos CR report-link': { tool: DD, label: 'DRIVER', argv: (c) => [...HEAD[DD], crLink(c), c.drv] },
    'ic driver-pos CR report-link': { tool: IC, label: 'DRIVER', argv: (c) => [...HEAD[IC], c.drv, crLink(c)] },
    'bb driver-pos CR report-link (bb-clean pin)': { tool: BB, label: 'DRIVER', oldLabel: RES, pin: true, argv: (c) => [...HEAD[BB], crLink(c), c.drv] },
    'bb file-before CR report-link (bb-clean pin)': { tool: BB, label: LABEL[BB], pin: true, argv: (c) => [...HEAD[BB], '--driver', c.drv, '--before', crLink(c), '--after', c.fa] },
};
for (const R of Object.values(FE)) { R.row = 10; R.outPre = true; }
for (const [name, R] of Object.entries(FE)) {
    test(`ROW 10 ${name}: rc 2, 0 spawns, the exact G-X6 refusal (not rep_refuse), no CR on stderr, the case tree (incl. <o>) unchanged`, { skip }, () => {
        const { r, bad } = runRow(LIVE(R.tool), name, R);
        assert.deepEqual(bad, [], msg(r));
    });
    if (R.pin) {
        test(`ROW 10 bb-clean pin OLD ${name}: the ${OLD_FE} root ALREADY meets the row (bb was never in the seam)`, { skip: OLDFESKIP }, () => {
            const { r, bad } = runRow(oldRoot(R.tool, OLD_FE), `${name} (old)`, { ...R, label: R.oldLabel ?? R.label });
            assert.deepEqual(bad, [], msg(r));
        });
    } else {
        test(`ROW 10 OLD twin ${name}: the ${OLD_FE} root fails the row with a CR on stderr`, { skip: OLDFESKIP }, () => {
            const { r, bad } = runRow(oldRoot(R.tool, OLD_FE), `${name} (old)`, R);
            assert.ok(bad.includes('a CR on stderr'), `old root has no CR on stderr (the row has no teeth): ${JSON.stringify(bad)}\n${msg(r)}`);
        });
    }
}
// ROW 11 mutants: rep_refuse back at its 768c388 place, per tool
const DD_REP = '[[ -z "$OUT" ]] || ' + REP_ARGS, IC_REP = '[[ -z "$OUT" ]] || rep_refuse "${POS[@]}"\n';
const RAW_LS = '  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"\n';
// b75 F-F: the raw DRIVER line (dd / ic) fires before rep_refuse and G-X6; the dd / ic ROW 11 mutants also drop it, so they still
// test the F-E seam
const FF_POS = 'nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}   # the raw DRIVER values, before any refusal prints them (G-X6, ruling Q-B75-FFSCOPE)\n';
const FE_MUT = [
    { id: 'ibd rep_refuse back above G-X6', tool: IBD, edits: [[REP_C + REP_ARGS, ''], [IBD_FULL, IBD_FULL + REP_ARGS]], rows: Object.keys(FE).filter((n) => n.startsWith('ibd ')) },
    { id: 'dd rep_refuse back above G-X6 (+ the F-F DRIVER line dropped)', tool: DD, edits: [[FF_POS, ''], [REP_C + DD_REP, ''], [RAW_LS, RAW_LS + '  ' + REP_ARGS]], rows: ['dd driver-pos CR report-link'] },
    { id: 'ic rep_refuse back above G-X6 (+ the F-F DRIVER line dropped)', tool: IC, edits: [[FF_POS, ''], [REP_C + IC_REP, ''], [RAW_LS, RAW_LS + '  rep_refuse "${POS[@]}"\n']], rows: ['ic driver-pos CR report-link'] },
];
for (const m of FE_MUT) {
    test(`ROW 11 mutant ${m.id}: rows ${m.rows.join(', ')} go red with a CR on stderr`, { skip }, () => {
        const p = mutRoot(m);
        for (const n of m.rows) {
            assert.ok(FE[n], `mutant ${m.id} names an unknown row ${n}`);
            const { r, bad } = runRow(p, `${n} (${m.id})`, FE[n]);
            assert.ok(bad.includes('a CR on stderr'), `mutant ${m.id} survives row ${n}: ${JSON.stringify(bad)}\n${msg(r)}`);
        }
    });
}

// ---- ROW 12 / 13: b75 F-F (rulings Q-B74-FERAW, Q-B75-FFSCOPE): the RAW DRIVER positionals (dd, ic, ad, bb --diff and measure
// mode) and the RAW --out value (ad, dd, ic, ibd) are refused before the first refusal that echoes them ----
const AD = 'allocation-diff';
HEAD[AD] = [];
const OLD_FF = '4dadb5d';   // b74 docs batch: the roots before F-F (the same bytes as .handoff/frozen/b75-ff-before)
const haveOldFf = spawn('git', ['cat-file', '-e', `${OLD_FF}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_FF} not available (shallow clone?)`;
const OLDFFSKIP = skip || (haveOldFf === true || CI_STRICT ? false : haveOldFf);
// the shapes: ch = CR (the row) or '' (the must-fail control: the same shape, no CR). Paths are built by string, never join():
// join() would fold the `..`
const efRep = (c, ch) => { mkdirSync(c.o); writeFileSync(join(c.o, 'report.txt'), ''); mkdirSync(join(c.dir, `d${ch}`)); return `${c.dir}/d${ch}/../o/report.txt`; };
const miss = (c, ch) => `${c.x}/x${ch}`;
const dotdot = (c, ch) => { symlinkSync(join(c.x, 'a'), join(c.dir, `l${ch}`)); return `${c.dir}/l${ch}/../drv.js`; };   // physical: x/drv.js; logical: <dir>/drv.js (absent)
const outFile = (c, ch) => { c.o = join(c.dir, `f${ch}`); writeFileSync(c.o, ''); };
const outRawLink = (c, ch) => { c.o = join(c.dir, `o${ch}`); mkdirSync(c.o); symlinkSync(c.x, join(c.o, 'raw')); };
const outStage = (c, ch) => { c.o = join(c.dir, `s${ch}`); mkdirSync(c.o); writeFileSync(join(c.o, 'stage'), ''); };
const BBM = 'bb-measure', HEAD_BBM = ['--fn', 'add'];
const FF = {};
for (const [k, tool] of [['dd', DD], ['ic', IC], ['ad', AD], ['bb', BB]]) {
    const pos = (p, c) => (tool === IC ? [...HEAD[tool], c.drv, p] : [...HEAD[tool], p, c.drv]);   // ic: the after positional
    FF[`${k} pos ef-report CR`] = { tool, label: 'DRIVER', argv: (c, ch) => pos(efRep(c, ch), c) };
    FF[`${k} pos missing CR`] = { tool, label: 'DRIVER', argv: (c, ch) => [...HEAD[tool], miss(c, ch), c.drv] };   // the before positional
    FF[`${k} pos after-missing CR`] = { tool, label: 'DRIVER', argv: (c, ch) => [...HEAD[tool], c.drv, miss(c, ch)] };   // the after positional (r1)
    FF[`${k} pos dotdot CR`] = { tool, label: 'DRIVER', argv: (c, ch) => [...HEAD[tool], dotdot(c, ch), c.drv] };
}
FF[`${BBM} pos ef-report CR`] = { tool: BB, label: 'DRIVER', argv: (c, ch) => [...HEAD_BBM, efRep(c, ch)] };
FF[`${BBM} pos missing CR`] = { tool: BB, label: 'DRIVER', argv: (c, ch) => [...HEAD_BBM, miss(c, ch)] };
FF[`${BBM} pos dotdot CR`] = { tool: BB, label: 'DRIVER', argv: (c, ch) => [...HEAD_BBM, dotdot(c, ch)] };
FF['ad-zero pos ef-report CR'] = { tool: AD, label: 'DRIVER', argv: (c, ch) => ['--zero', efRep(c, ch)] };
FF['ad-zero pos missing CR'] = { tool: AD, label: 'DRIVER', argv: (c, ch) => ['--zero', miss(c, ch)] };
for (const [k, tool] of [['ad', AD], ['dd', DD], ['ic', IC], ['ibd', IBD]]) {
    const drv = (c) => (tool === IBD ? [...HEAD[tool], c.drv] : [...HEAD[tool], c.drv, c.fa]);
    FF[`${k} out file CR`] = { tool, label: '--out', argv: (c, ch) => { outFile(c, ch); return drv(c); } };
    FF[`${k} out raw-link CR`] = { tool, label: '--out', argv: (c, ch) => { outRawLink(c, ch); return drv(c); } };
}
FF['dd staged out stage-file CR'] = { tool: DD, label: '--out', argv: (c, ch) => { outStage(c, ch); return [...HEAD[DD], '--driver', c.drv, '--before', c.fb, '--after', c.fa]; } };
// Q-B75-FFBBSTAGE: bb's raw --out line now fires first in driver mode too (live label `--out`); the OLD run keeps `--out (resolved)`:
// a pin that the 4dadb5d root was already clean in driver mode (nl_dir ran before bb's driver-mode --out refusals)
const outStageLink = (c, ch) => { c.o = join(c.dir, `o${ch}`); mkdirSync(c.o); symlinkSync(c.x, join(c.o, 'stage')); };
FF['bb staged out stage-link CR'] = { tool: BB, label: '--out', argv: (c, ch) => { outStageLink(c, ch); return [...HEAD[BB], '--driver', c.drv, '--before', c.fb, '--after', c.fa]; } };
FF['bb ref out stage-link CR'] = { tool: BB, label: '--out', argv: (c, ch) => { outStageLink(c, ch); return refArgs(BB, c, G.S1, G.S2); } };
FF['bb out file CR (bb-clean pin)'] = { tool: BB, label: '--out', oldLabel: '--out (resolved)', pin: true, argv: (c, ch) => { outFile(c, ch); return [...HEAD[BB], c.drv, c.fa]; } };
function runFF(root, name, R, ch = CR) {
    const c = mkCase(); const argv = R.argv(c, ch); const pre = existsSync(c.o); const tree0 = tree(c);
    const r = run(root, c, argv, name);
    return { r, bad: problems(r, c, R.tool, tree0, pre, R.label) };
}
for (const [name, R] of Object.entries(FF)) {
    test(`ROW 12 ${name}: rc 2, 0 spawns, the exact G-X6 refusal (label ${R.label}), no CR on stderr, the case tree unchanged`, { skip }, () => {
        const { r, bad } = runFF(LIVE(R.tool), name, R);
        assert.deepEqual(bad, [], msg(r));
    });
    if (R.pin) {
        test(`ROW 12 bb-clean --out pin OLD ${name}: the ${OLD_FF} root ALREADY meets the row (nl_dir runs before bb's --out refusals)`, { skip: OLDFFSKIP }, () => {
            const { r, bad } = runFF(oldRoot(R.tool, OLD_FF), `${name} (old)`, { ...R, label: R.oldLabel ?? R.label });
            assert.deepEqual(bad, [], msg(r));
        });
        continue;
    }
    test(`ROW 12 OLD twin ${name}: the ${OLD_FF} root fails the row with a CR on stderr`, { skip: OLDFFSKIP }, () => {
        const { r, bad } = runFF(oldRoot(R.tool, OLD_FF), `${name} (old)`, R);
        assert.ok(bad.includes('a CR on stderr'), `old root has no CR on stderr (the row has no teeth): ${JSON.stringify(bad)}\n${msg(r)}`);
    });
    test(`ROW 12 control ${name}: the same shape without the CR is refused (rc 2) but NOT by the new text`, { skip }, () => {
        const c = mkCase(); const argv = R.argv(c, '');
        const r = run(LIVE(R.tool), c, argv, `${name} (control)`);
        assert.equal(r.status, 2, msg(r));
        assert.ok(r.stderr !== '' && !r.stderr.includes('a newline or a CR is not allowed'), msg(r));
    });
}
// ROW 13 mutants of the live roots (exact once): drop the new line, move it below the first raw-echo die, check a newline only
const FF_OUT = '[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"   # the raw --out value, before any refusal prints it (G-X6, ruling Q-B75-FFSCOPE)\n';
const LF_POS = ['nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}', 'for p in ${POS[@]+"${POS[@]}"}; do [[ "$p" != *$\'\\n\'* ]] || die "DRIVER: a newline or a CR is not allowed (it would forge report lines)"; done'];
const LF_OUT = ['nl_refuse "--out" "$OUT"', '[[ "$OUT" != *$\'\\n\'* ]] || die "--out: a newline or a CR is not allowed (it would forge report lines)"'];
const NF_B = '|| die "DRIVER (before) not found (or not a readable file): ${POS[0]}"\n';
const AD_NF = '|| die "DRIVER (${SIDES[$i]}) not found (or not a readable file): ${POS[$i]}"\ndone\n';
const OUT_NOTDIR = '|| die "--out: $OUT exists and is not a directory"\n';
const FFR = (pre, lab) => Object.keys(FF).filter((n) => n.startsWith(pre) && FF[n].label === lab && !FF[n].pin);
const FF_MUT = [];
for (const [k, tool] of [['dd', DD], ['ic', IC], ['ad', AD], ['bb', BB]]) {
    const rows = FFR(`${k}`, 'DRIVER');   // dd / ic / ad / ad-zero / bb / bb-measure
    FF_MUT.push({ id: `${k} DRIVER line dropped`, tool, edit: [FF_POS, ''], rows });
    FF_MUT.push({ id: `${k} DRIVER line checks a newline only`, tool, edit: LF_POS, rows });
}
for (const [k, tool] of [['dd', DD], ['bb', BB]]) {   // r1: a check of the before positional only must not pass
    FF_MUT.push({ id: k + ' DRIVER line checks ${POS[0]} only', tool, edit: ['nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}', 'nl_refuse "DRIVER" "${POS[0]}"'], rows: [k + ' pos after-missing CR'] });
}
FF_MUT.push({ id: 'ad DRIVER line moved below the not-found die', tool: AD, edits: [[FF_POS, ''], [AD_NF, AD_NF + FF_POS]], rows: ['ad pos missing CR', 'ad-zero pos missing CR'] });
FF_MUT.push({ id: 'dd DRIVER line moved below the not-found die', tool: DD, edits: [[FF_POS, ''], [NF_B, NF_B + FF_POS]], rows: ['dd pos missing CR'] });
FF_MUT.push({ id: 'ic DRIVER line moved below the not-found die', tool: IC, edits: [[FF_POS, ''], [NF_B, NF_B + FF_POS]], rows: ['ic pos missing CR'] });
FF_MUT.push({ id: 'bb DRIVER line moved below the --diff not-found die', tool: BB, edits: [[FF_POS, ''], [NF_B, NF_B + FF_POS]], rows: ['bb pos missing CR', `${BBM} pos missing CR`] });
for (const [k, tool] of [['ad', AD], ['dd', DD], ['ic', IC], ['ibd', IBD]]) {
    const rows = FFR(`${k} `, '--out');
    FF_MUT.push({ id: `${k} --out line dropped`, tool, edit: [FF_OUT, ''], rows });
    FF_MUT.push({ id: `${k} --out line checks a newline only`, tool, edit: LF_OUT, rows });
}
const BB_OUT = '[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"   # the raw --out value, before any refusal prints it (G-X6, rulings Q-B75-FFSCOPE, Q-B75-FFBBSTAGE)\n';
const BB_STAGE = '  stage_check   # lib/stage.sh: every ref / file refusal, before any disk write\n';
const BB_OUTROWS = ['bb staged out stage-link CR', 'bb ref out stage-link CR'];
FF_MUT.push({ id: 'bb --out line dropped', tool: BB, edit: [BB_OUT, ''], rows: BB_OUTROWS });
FF_MUT.push({ id: 'bb --out line checks a newline only', tool: BB, edit: LF_OUT, rows: BB_OUTROWS });
FF_MUT.push({ id: 'bb --out line moved below stage_check', tool: BB, edits: [[BB_OUT, ''], [BB_STAGE, BB_STAGE + '  ' + BB_OUT]], rows: BB_OUTROWS });
FF_MUT.push({ id: 'ad --out line moved below the not-a-directory die', tool: AD, edits: [[FF_OUT, ''], [OUT_NOTDIR, OUT_NOTDIR + FF_OUT]], rows: ['ad out file CR'] });
FF_MUT.push({ id: 'dd --out line moved below the stage die', tool: DD, edits: [[FF_OUT, ''], ['|| die "--out: $OUT/stage exists and is not a directory"\n', '|| die "--out: $OUT/stage exists and is not a directory"\n' + FF_OUT]], rows: ['dd staged out stage-file CR'] });
FF_MUT.push({ id: 'ic --out line moved below the not-a-directory die', tool: IC, edits: [[FF_OUT, ''], [OUT_NOTDIR, OUT_NOTDIR + FF_OUT]], rows: ['ic out file CR'] });
FF_MUT.push({ id: 'ibd --out line moved below the cannot-create die', tool: IBD, edits: [[FF_OUT, ''], ['|| die "--out: cannot create $OUT ($OUT_UP is not a writable directory)"\n', '|| die "--out: cannot create $OUT ($OUT_UP is not a writable directory)"\n' + FF_OUT]], rows: ['ibd out file CR', 'ibd out raw-link CR'] });
for (const m of FF_MUT) {
    test(`ROW 13 mutant ${m.id}: rows ${m.rows.join(', ')} go red with a CR on stderr`, { skip }, () => {
        assert.ok(m.rows.length > 0, `mutant ${m.id} names no row`);
        const p = mutRoot(m);
        for (const n of m.rows) {
            assert.ok(FF[n], `mutant ${m.id} names an unknown row ${n}`);
            const { r, bad } = runFF(p, `${n} (${m.id})`, FF[n]);
            assert.ok(bad.includes('a CR on stderr'), `mutant ${m.id} survives row ${n}: ${JSON.stringify(bad)}\n${msg(r)}`);
        }
    });
}
