// test/shape-diff.test.mjs -- ../shape-diff.sh: the --self-test count pin, golden parity against the frozen prototype,
// the TRACE_FLAGS / argv rows, the mutant table, the self-test signal row (1.2.0 G-E B3 = PLAN-SD-E TASK 7) and the
// real-capture identity row (1.2.0 G-E2 B2 = PLAN-SD-E2 TASKS 4-6), the A8 OUT_NAMES row family + its two twins (b107 G-E B4,
// ruling Q-B107-SDOUTNAMES (a); oracle: the ruling text and the CODER-GX-B2 probe, rc / refusal line from lib/common.sh rep_refuse).
// ORACLE: .handoff/b103/PLAN-SD-E.md ASSERTIONS A1 / A2 / A5 / A7 as amended by SPEC-1.2.0 A11 (M-ENV) and A12 (ii)
// (VER_RE) / (iii) (M10 + the signal row); .handoff/b103/PLAN-SD-E2.md ASSERTIONS A1 / A3 / A4 (SPEC A13);
// test/fixtures/shape-diff/canned/golden-proto (cut from the frozen prototype eb7c1b65 only);
// test/fixtures/shape-diff/real/<M>/excerpt/run.{log,out} + PROVENANCE.txt [excerpt] (the identity row's oracle); the
// row-to-mutant facts of the b105 G-E / b106 G-E2 hand-backs and reviews -- never what the script printed (the ROW labels
// 41-44 and 45-54 alone are copied by script from the built root's self-test output, as the G-E2 B2 / b113 E-B3 briefs order).
// TIER: DETERMINISTIC. No real node: the self-test feeds canned text and its own fake node; the e2e rows run
// test/fixtures/shape-diff/canned/fake-node.sh copied into a private temp dir. git: the A8 old twin only (`git show 9770f78:`,
// a history pin: skipped when the commit is absent, a failure under CI=true).
//
// Mutant table (46 = 35 + 11 E mutants, b113 E-B3; the A8 M-OUTNAMES twin is outside it): each is ONE exact-once edit, except the multi-site engine hunks E-M8 / E-M3 (3 edits) and E-M2a / E-M7 (2), every edit exact-once (the census pins each count) (an anchor matching 0 or > 1 times fails the row) on a private copy
// of the built root under os.tmpdir(); it must exit 1 with `self-test: <n> check(s) FAILED` and FAIL every named row
// (found by its exact label). Each revert row runs the kill assertion on the clean copy's output and requires it to
// throw. M10 is the exception: the self-test passes on it, and its killer is the SIGNAL row (A12 (iii)), not a
// self-test row; its revert row runs the signal-kill assertion on the clean signal run. M-CAPID is the other exception:
// the self-test passes on it (rows 41-44 replay the heredoc, not the fixture), and its killer is the IDENTITY row (PLAN-SD-E2
// A4); its revert row runs the identity-kill assertion on the clean root and requires it to throw.
// Label -> source (names collide in the sources, so every label here is unique):
//   P-M1 P-M2 P-M8 (row 4), P-M3 (row 2), P-M4 (row 7), P-M5 P-M9 (row 9), P-M5b (row 10): PLAN-SD-E A7 "kept from
//     the proto" = the proto reviewer's M1 / M2 / M3 / M4 / M5 / M5b / M8 / M9 (RECHECK2-shape-diff.md section 4).
//     No source gives their edit text; each edit below is DERIVED from the RECHECK2 description on the port's text.
//   M3b (18), M6 (25), M7 (40): PLAN-SD-E A7 "the 3 survivors"; edit text CODER-GE-B2-fix1 teeth table.
//   M-DA (16, 26), M-D5 (20, 21), M-VER (22), M-TMP (23): PLAN-SD-E A7; edit text CODER-GE-B2(-fix1) teeth table.
//   M-ENV (23): PLAN-SD-E A7 as redefined by SPEC A11 (the Q-ENV unset line deleted); CODER-GE-B2-fix1.
//   M-DA2 (16): PLAN-SD-E A7; REVIEW-GE-B2-r1 "ELEM ext route" (edit DERIVED: the ELEM ext_owner push deleted).
//   M-DB-from (17): PLAN-SD-E A7 / A4 "M-DB" (no edit text in any source; DERIVED: the proto's unanchored
//     `:v\{None;[^}]*\}->` test put back ahead of the anchored match, i.e. the D-B defect itself).
//   M-DB2 (17): PLAN-SD-E A7; REVIEW-GE-B2-r1 "no match -> no-op" (edit DERIVED: `return 0` -> `return 1`).
//   M-TR (19, 27): PLAN-SD-E A7 (`inc_trans+0==1` to `==2`); rows from CODER-GE-B2 extra table.
//   M-TR2 (27), M-D5j (21), M-NC (28), M-OUT-HL (34), M-REP (35), M-NLD (36): PLAN-SD-E A7 + CODER-GE-B2 extra table.
//   M-OUT-L (29): PLAN-SD-E A7 (edit DERIVED: the `[[ ! -L "$OUT" ]] || die` test -> `true || die`).
//   M-VERRE (22): SPEC A12 (ii) "M8" (VER_RE='^v( -> VER_RE='v('); renamed: P-M8 is the proto's M8.
//   M10 (SIGNAL row): SPEC A12 (iii); REVIEW-GE-B1-r1 B-3.
//   M-DB-end (17): REVIEW-GE-B2-r1 blocker 1 "M-DB" (the `$` end anchor dropped); renamed: M-DB-from is A7's M-DB.
//   X-V8ALL (40), M-V8DROP (40): REVIEW-GE-B2-r1 blocker 2; CODER-GE-B2-fix1 teeth table.
//   M-CAP (41-44), M-CAPS (41-44): PLAN-SD-E2 A3 (edit text there); rows from CODER-GE2-B1 / REVIEW-GE2-B1-r1.
//   M-CAPID (IDENTITY row): PLAN-SD-E2 A4; edit text CODER-GE2-B1 (the 24 v8-version line, 17 -> 18).
//   E-M1 (45), E-M2a (46), E-M2b (47), E-M3 (48), E-M4fold (47 49 50 53 54), E-M4sms (49), E-M4tier (50 54), E-M7 (51), E-M8 (52),
//     E-M12 (53), E-FOLDSAME (54): PLAN-FIX-E task 5 + SPEC A34 / A36; edit text and rows = the E-B2 coder's gates table (b112,
//     gates-r2: 45-M1 .. 54ii-swap), one mutant per engine hunk (M1 M2a M2b M3 M4 M7 M8 M12 + the E-B1b tier-up order); E-M4fold's
//     extra rows are the ones the coder measured; a mutant may FAIL more rows than listed (assertKilled is a subset check).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync, realpathSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';

beforeEach(() => new Promise((r) => setImmediate(r)));

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(PKG, 'shape-diff.sh');   // the root anchor (a revert check points a private copy of this file elsewhere)
const CANNED = join(PKG, 'test', 'fixtures', 'shape-diff', 'canned');
const C = 54;   // self-test ok lines (G-E2 B2: 40 -> 44, rows 41-44 = the real-capture replays; E-B2 b112: 44 -> 54, rows 45-54 = the 2026-11-26 audit-fix rows, SPEC A34 / C-29)
const BASH = '/bin/bash';
const ST_CAP = 180000;    // one --self-test (about 4 s locally)
const E2E_CAP = 60000;    // one fake-node e2e pair (8 fake spawns)
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
// the host environment never reaches the script: NODE_* would make the fake node exit 7 (a mutant would die of the host
// leak, not of its row), NODE would pick another node, FAKE_* would steer the fake, editor vars are git's
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE', 'GIT_EDITOR',
    'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL', 'FAKE_LOG', 'FAKE_VER', 'FAKE_VER_RC', 'BASH_ENV', 'CDPATH', 'BASHOPTS', 'SHELLOPTS',
    'POSIXLY_CORRECT', 'ENV']) delete ENV[k];
// node re-adds NODE_V8_COVERAGE to a spawn env that lacks the KEY; an own key holding undefined is never passed on
ENV.NODE_V8_COVERAGE = undefined;
const BASE_PATH = '/usr/bin:/bin';
const REAL_AWK = ['/usr/bin/awk', '/bin/awk'].find((p) => existsSync(p));

// The 54 self-test rows in print order, exact labels (CODER-GE-B2 output, rows 17 / 40 per CODER-GE-B2-fix1, row 22 per
// SPEC A12 (ii), rows 41-44 copied by script from the built root's (edecd742) self-test output, G-E2 B2; rows 45-54 = the 2026-11-26 audit-fix rows (E-B2 b112),
// copied by script from the built root's (59c44fff) `--self-test` stdout lines 45-54, b113 E-B3).
const ROW = [null,
    /*  1 */ 'MAP_AWK: clean mono fn -> K+R+T; compiled-but-uncalled (~ and ^) -> K only (no R)',
    /*  2 */ 'MAP_AWK (N1 + N5 NONE-owner): Builtin:ReflectDeleteProperty + NONE + user:helperDel all -> UM',
    /*  3 */ 'MAP_AWK: HOLEY->DICTIONARY_ELEMENTS -> MAP_ELEM_DICT; benign Symbol() -> normal T',
    /*  4 */ 'SHAPE_STDOUT_AWK (N4+D6+N1): v{None} & Node22/24 s->s -> I; dual pair folded (hits=2); splice+1700 & user:otherElem -> UE',
    /*  5 */ 'SHAPE_STDOUT_AWK: malformed generalizing line -> X',
    /*  6 */ 'guard: clean fn with R in runs 1..2 -> OK',
    /*  7 */ 'D12 guard: run 1 R, run 2 K-only -> NO-VERDICT',
    /*  8 */ 'N5 diff_fn: clean vs clean (empty UNATTR_DIFF) -> SAME',
    /*  9 */ 'N5 headline fix: attributed SAME + UM Builtin:ReflectDeleteProperty delta -> NO-VERDICT',
    /* 10 */ 'N5 UE nullctl: run 1 != run 2 UE -> flagged',
    /* 11 */ 'D8 v8fl_ok allowlist: valid flags accepted; node opts, unknown, string, log refused',
    /* 12 */ "N6: --fn 'mk,' trailing comma refused exit 2",
    /* 13 */ 'D11: --fn= empty refused exit 2',
    /* 14 */ 'D11: --fn=mk and --runs=99 parsed cleanly via need()',
    /* 15 */ 'D9: newline in DRIVER path refused exit 2 with 0 forged lines',
    /* 16 */ 'D-A SHAPE_STDOUT_AWK: node: / evalmachine frames -> UE node:<fn> / other:<fn>, never dropped; a target name there is never E',
    /* 17 */ 'D-B SHAPE_STDOUT_AWK: anchored FROM / TO: crafted key k:v{None;const}-> and plain -> E; a real v{None} init -> I; no arrow -> E',
    /* 18 */ 'M3b SHAPE_STDOUT_AWK: a non-target user GEN -> UE GEN|user:<fn>; a non-target LHS==RHS no-op -> nothing',
    /* 19 */ 'Q-SD-TRANS MAP_AWK: normal Transition -> T only by default; --include-transitions (inc_trans=1) adds M MAP_TRANSITION',
    /* 20 */ 'D5 MAP_AWK: a Transition with no map-details line for its from / to map -> the target keeps T and gains N; non-target / NONE -> UM MAP_EK_UNKNOWN',
    /* 21 */ "D5 judge_side: an N record in run 2 -> NO-VERDICT 'elements kind unknown ... in run 2'; the same records without N -> OK",
    /* 22 */ 'version gate: v21.7.3, node-22, xv22.0.0 and an empty --version -> exit 2 after 1 spawn, 0 mktemp, the refusal once; v22.23.5 -> 8 spawns',
    /* 23 */ 'e2e: mono vs mono2 with NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS set -> exit 0 SAME, 8 spawns, 1 mktemp; TMPDIR keeps 0 entries',
    /* 24 */ 'e2e: mono vs addf (a y field generalization added in mk) -> exit 1 DIFF naming the record',
    /* 25 */ 'argv: fake node argv line 3 (the first trace run) begins with the 7 TRACE_FLAGS then --logfile=; so do all 6 trace runs',
    /* 26 */ 'D-A e2e: mono vs da (a node:events setMaxListeners GEN) -> exit 2 NO-VERDICT naming UNATTR node:setMaxListeners',
    /* 27 */ 'include-transitions e2e: tr1 vs tr2 (one more normal Transition in mk) -> exit 0 SAME (REPORTED before=1 after=2); --include-transitions -> exit 1 DIFF',
    /* 28 */ 'null control e2e: mono vs nc (AFTER run 2 adds a GEN) -> exit 2 NO-VERDICT, after: null control: run 2 differs from run 1',
    /* 29 */ '--out a symlink -> refused before any spawn or write',
    /* 30 */ '--out a regular file -> refused before any spawn or write',
    /* 31 */ '--out DIR/raw not empty -> refused before any spawn or write',
    /* 32 */ '--out DIR/raw a symlink -> refused before any spawn or write',
    /* 33 */ '--out DIR/report.txt a symlink -> refused before any spawn or write; its target keeps KEEP',
    /* 34 */ '--out DIR/report.txt with another hard link -> refused before any spawn or write; the other name keeps KEEP',
    /* 35 */ '--out DIR/report.txt is DRIVER_BEFORE -> refused before any spawn or write',
    /* 36 */ 'nl_dir: --out s36/../c where s36 links into a dir whose name holds a newline -> refused before any spawn or write',
    /* 37 */ 'a newline in --out -> refused before any spawn or write',
    /* 38 */ '--out F/o under a regular file F (uncreatable) -> refused before any spawn or write',
    /* 39 */ 'need(): --out with no value, --out= and --runs 3 --self-test -> exit 2, 0 spawns, 0 mktemp, the refusal once, the cwd stays empty',
    /* 40 */ 'sparkplug refusals: --v8-flags --always-sparkplug / --sparkplug / --no_concurrent_sparkplug -> exit 2, 0 spawns, 0 mktemp, the refusal once; --maglev control -> SAME, 6 trace runs',
    /* 41 */ 'real capture node 22 (v22.23.5): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME',
    /* 42 */ 'real capture node 24 (v24.22.3): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME',
    /* 43 */ 'real capture node 26 (v26.8.2): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME',
    /* 44 */ 'real capture node 27 (v27.0.0-alpha.0.1.0): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME',
    /* 45 */ 'M1 (C-21) MAP_AWK: a non-target MAP_REPLACE line (MapCreate, another reason, none) -> UM MAP_REPLACE, never dropped',
    /* 46 */ 'M2a (C-22) SHAPE_STDOUT_AWK: a FROM == TO generalization with (+N maps) is not a no-op (target -> E, non-target -> UE GEN); v{None;...} with (+N maps) stays a no-op (I)',
    /* 47 */ 'M2b (C-22) SHAPE_STDOUT_AWK: a target [reconfiguring] frame -> E RECONF (its optimized hit folds; {symbol 0x<hex>} -> {symbol 0xADDR}); non-target / node: / runtime / <unknown> -> UE RECONF; no trailing ], no frame bracket, a bad payload, a loc with no :N, a TAB -> X',
    /* 48 */ 'M3 (C-27) MAP_AWK + judge_side: a target fn defined at >1 location -> A; NO-VERDICT \'ambiguous target function\', A judged before N',
    /* 49 */ 'M4 fold + O (C-23) SHAPE_STDOUT_AWK: optimized-frame hits (+ / * with o / \') fold into the first interpreted site, else one <file>:opt site; one O per key; s_ms carries O (a per-run O-set change trips the null control)',
    /* 50 */ 'M4 tier-up (C-23) diff_fn: equal interpreted multisets, different optimized-frame key sets -> NO-VERDICT \'tier-up differs (optimized-frame key set)\'; a real DIFF stays DIFF',
    /* 51 */ 'M7 matrix (C-24) SHAPE_STDOUT_AWK: the rightmost ) [ (key k) [z+1 at w) and dirs app [v2] / a) [b / a ) [1] / x [y at z] / a) [b at c -> E at g.cjs:3; the rightmost for 0x<hex> < (dir x for 0x1 <y) -> E; no ) [ -> the old last [ rule; no < after for 0x -> X',
    /* 52 */ 'M8 (C-27 / C-29) MAP_AWK: code-disable-optimization is a known event; an empty-marker code-creation with a hex 8th field -> K; a non-hex 8th field -> X',
    /* 53 */ 'M12 (C-27) diff_fn: a DIFF with a differing unattributed multiset prints the REPORTED unattributed lines; the verdict stays DIFF',
    /* 54 */ 'E-B1b FOLDSAME (C-23) diff_fn: (a) key optimized-only before, interpreted after -> NO-VERDICT \'tier-up differs (interpreted key set)\'; (b) interpreted-only before, optimized-only after -> \'optimized-frame key set\' (checked first)',
];
const SIG = 'SIGNAL';   // M10's killer: the signal row below, not a self-test row

// a private temp dir (realpath: the reports embed it, and macOS tmpdir() is a /var -> /private/var symlink)
function mkT(prefix) {
    const t = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    assert.ok(!t.includes("'") && !t.includes('\n'), `temp dir ${t} holds a quote or a newline`);
    return t;
}
function okLines(out) { return out.split('\n').filter((l) => l.startsWith('ok ')); }
function count(hay, needle) { return hay.split(needle).length - 1; }

// --- one --self-test under PATH=/usr/bin:/bin (no node), a private TMPDIR and cwd; returns r + the TMPDIR entries left
function selfTest(path, what) {
    const t = mkT('sdt-st-');
    try {
        mkdirSync(join(t, 'tmp')); mkdirSync(join(t, 'cwd'));
        const r = capSync(BASH, [path, '--self-test'], { cwd: join(t, 'cwd'), encoding: 'utf8', group: true,
            env: { ...ENV, PATH: BASE_PATH, TMPDIR: join(t, 'tmp') } }, ST_CAP, what);
        r.left = readdirSync(join(t, 'tmp')).length;
        return r;
    } finally { rmSync(t, { recursive: true, force: true }); }
}

// --- one e2e pair through canned/fake-node.sh, the golden-proto layout: --node @T@/fk/node, --out @T@/out/<case>,
// drivers @T@/e2e/<name>/driver.mjs, cwd @T@/cwd, TMPDIR=@T@/tmp, PATH = a mktemp-logging shim + /usr/bin:/bin, --fn mk
function e2e(path, c, b, a, extra, what) {
    const t = mkT('sdt-e2e-');
    try {
        for (const d of ['fk', 'mk', 'cwd', 'tmp', 'out']) mkdirSync(join(t, d));
        writeFileSync(join(t, 'fk', 'node'), readFileSync(join(CANNED, 'fake-node.sh')));
        chmodSync(join(t, 'fk', 'node'), 0o755);
        writeFileSync(join(t, 'mk', 'mktemp'), `#!/bin/bash\nprintf '%s\\n' "$*" >>'${t}/mk.log'\nexec /usr/bin/mktemp "$@"\n`);
        chmodSync(join(t, 'mk', 'mktemp'), 0o755);
        writeFileSync(join(t, 'fk.log'), ''); writeFileSync(join(t, 'mk.log'), '');
        cpSync(join(CANNED, 'e2e'), join(t, 'e2e'), { recursive: true });
        const r = capSync(BASH, [path, '--node', join(t, 'fk', 'node'), '--fn', 'mk', ...extra, '--out', join(t, 'out', c),
            join(t, 'e2e', b, 'driver.mjs'), join(t, 'e2e', a, 'driver.mjs')], { cwd: join(t, 'cwd'), encoding: 'utf8', group: true,
            env: { ...ENV, PATH: `${t}/mk:${BASE_PATH}`, TMPDIR: join(t, 'tmp'), FAKE_LOG: join(t, 'fk.log') } }, E2E_CAP, what);
        const norm = (s) => s.split(t).join('@T@');
        const rp = join(t, 'out', c, 'report.txt');
        const report = existsSync(rp) ? readFileSync(rp, 'utf8') : null;
        const argv = readFileSync(join(t, 'fk.log'), 'utf8');
        return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr,
            report: report === null ? null : norm(report), stdoutEqReport: report !== null && r.stdout === report,
            argv: norm(argv).split('\n').filter((l) => l !== ''),
            spawns: argv.split('\n').filter((l) => l !== '').length,
            mktemp: readFileSync(join(t, 'mk.log'), 'utf8').split('\n').filter((l) => l !== '').length,
            left: readdirSync(join(t, 'tmp')).length };
    } finally { rmSync(t, { recursive: true, force: true }); }
}

// --- the signal row (A12 (iii)): `/bin/bash -c 'echo $$ >PIDF; exec /bin/bash <root> --self-test'` with a PATH shim
// `awk` whose FIRST call sends TERM to PIDF's pid, then execs the real awk (the hold window holds no awk, so the first
// awk call comes after the self-test's re-arm). Want rc 2, `shape-diff: interrupted (SIGTERM)` once, TMPDIR 0 entries.
function sigRun(path, what) {
    const t = mkT('sdt-sig-');
    try {
        for (const d of ['sh', 'cwd', 'tmp']) mkdirSync(join(t, d));
        assert.ok(REAL_AWK, 'no awk at /usr/bin/awk or /bin/awk');
        writeFileSync(join(t, 'sh', 'awk'), `#!/bin/bash\nif mkdir '${t}/mark' 2>/dev/null; then kill -TERM "$(cat '${t}/cwd/PIDF')"; fi\nexec '${REAL_AWK}' "$@"\n`);
        chmodSync(join(t, 'sh', 'awk'), 0o755);
        const r = capSync(BASH, ['-c', 'echo $$ >PIDF; exec /bin/bash "$0" --self-test', path], { cwd: join(t, 'cwd'),
            encoding: 'utf8', group: true, env: { ...ENV, PATH: `${t}/sh:${BASE_PATH}`, TMPDIR: join(t, 'tmp') } }, ST_CAP, what);
        r.left = readdirSync(join(t, 'tmp')).length;
        r.fired = existsSync(join(t, 'mark'));
        return r;
    } finally { rmSync(t, { recursive: true, force: true }); }
}
function assertSig(r) {
    assert.ok(r.fired, 'the awk shim never ran (no TERM sent)');
    assert.equal(r.status, 2, `rc ${r.status} signal ${r.signal}\n${r.stdout}\n${r.stderr}`);
    assert.equal(r.stderr.split('\n').filter((l) => l === 'shape-diff: interrupted (SIGTERM)').length, 1, r.stderr);
    assert.equal(r.left, 0, 'TMPDIR entries left');
}

// --- static TRACE_FLAGS row: the 7-flag literal, one flag per line, the block opened exactly once
const TRACE_BLOCK = 'TRACE_FLAGS=(\n  --log-maps\n  --trace-elements-transitions\n  --trace-generalization\n  --no-sparkplug\n' +
    '  --no-concurrent-recompilation\n  --no-concurrent-sparkplug\n  --no-node-snapshot\n)\n';
function assertTraceBlock(src) {
    assert.equal(count(src, 'TRACE_FLAGS=('), 1, 'TRACE_FLAGS=( opened exactly once');
    const i = src.indexOf('\nTRACE_FLAGS=(\n');
    assert.ok(i >= 0, 'TRACE_FLAGS=( at a line start');
    const j = src.indexOf('\n)\n', i + 1);
    assert.ok(j > i, 'TRACE_FLAGS block closed by a ) line');
    assert.equal(src.slice(i + 1, j + 3), TRACE_BLOCK);
}
// --- argv row: every trace argv (each fake call whose argv holds --logfile=) holds --no-sparkplug exactly once
function assertArgv(e) {
    const tr = e.argv.filter((l) => l.split(' ').some((w) => w.startsWith('--logfile=')));
    assert.equal(tr.length, 6, `6 trace runs, got ${tr.length}:\n${e.argv.join('\n')}`);
    for (const l of tr) assert.equal(l.split(' ').filter((w) => w === '--no-sparkplug').length, 1, l);
}

// --- A4 identity row (PLAN-SD-E2 A4): a script holds exactly 8 quoted heredocs SD_CAP{22,24,26,27}_{LOG,OUT}, opened as
// `<<'SD_CAP<M>_<K>' || true` at a line end and closed by a line holding only the delimiter; each body (with its last
// newline) is byte-identical to real/<M>/excerpt/run.{log,out}, whose sha256 and line count equal PROVENANCE [excerpt]
const REAL = join(PKG, 'test', 'fixtures', 'shape-diff', 'real');
const SRC = join(PKG, 'src', 'shape-diff.sh');
const IDENT = 'IDENTITY';   // M-CAPID's killer: the identity row, not a self-test row
const CAP_NAMES = ['22', '24', '26', '27'].flatMap((m) => [`SD_CAP${m}_LOG`, `SD_CAP${m}_OUT`]);
const capFile = (name) => join(REAL, name.slice(6, 8), 'excerpt', `run.${name.endsWith('_LOG') ? 'log' : 'out'}`);
function capBody(src, name) {
    const open = `<<'${name}' || true\n`;
    assert.equal(count(src, open), 1, `${name}: opened exactly once`);
    const close = `\n${name}\n`;
    assert.equal(count(src, close), 1, `${name}: closed exactly once`);
    const i = src.indexOf(open) + open.length;
    const j = src.indexOf(close);
    assert.ok(j >= i, `${name}: the close line comes after the open line`);
    return src.slice(i, j + 1);
}
function assertCapIdentity(src) {
    const opens = src.split('\n').filter((l) => l.includes("<<'SD_CAP")).map((l) => (l.match(/<<'(SD_CAP[0-9]+_[A-Z]+)' \|\| true$/) || [null, l])[1]);
    assert.deepEqual(opens.slice().sort(), CAP_NAMES.slice().sort(), `want exactly the 8 SD_CAP heredocs, found ${opens.length}`);
    for (const name of CAP_NAMES) assert.ok(capBody(src, name) === readFileSync(capFile(name), 'latin1'), `${name}: body != ${capFile(name)}`);
}

// --- mutants: [label, rows (or SIG), exact-once edits [from, to]]; label -> source in the header
const ENV_TOP = 'unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: once, before any spawn; no probe, allowlist read or trace run inherits them (the per-spawn strips stay)\n';
const DB_END = '( \\(\\+[0-9]+ maps\\))?$/)) return 0';
const MUT = [
    ['P-M1', [4], [['  return (from == to)\n', '  return 0\n']]],
    ['P-M2', [4], [['  sub(/ \\((uninitialized field|field type generalization)\\)$/, "", p)\n', '']]],
    ['P-M8', [4], [['  else UE_LIST[++NUE] = "ELEM\\tuser:" fn "\\t" kinds\n', '  else NUE = NUE + 0\n']]],
    ['P-M3', [2], [['      ow = (h ? ctag[h] : "NONE")\n', '      ow = (h ? ctag[h] : "NONE"); if (ow ~ /^(user|node):/) next\n']]],
    ['P-M4', [7], [['  for ((i = 0; i < n; i++)); do\n    st=$(exec_state', '  for ((i = 0; i < 1; i++)); do\n    st=$(exec_state']]],
    ['P-M5', [9], [['      if [[ -n "$UNATTR_DIFF" ]]; then\n', '      if false; then\n']]],
    ['P-M9', [9], [['    u_ms "${REB[0]}" >"$msdir/_unattr.b1.txt"', '    u_ms "${REA[0]}" >"$msdir/_unattr.b1.txt"']]],
    ['P-M5b', [10], [['    if ! cmp -s "$f1" "$fk"; then\n      echo "unattributed', '    if false; then\n      echo "unattributed']]],
    ['M3b', [18], [['    UE_LIST[++NUE] = "GEN\\tuser:" fn "\\t" core\n', '    NUE = NUE + 0\n']]],
    ['M6', [25], [['\n  --no-sparkplug\n', '\n']]],
    ['M7', [40], [['|*sparkplug*)', ')']]],
    ['M-DA', [16, 26], [['    if (!noop) UE_LIST[++NUE] = "GEN\\t" ext_owner(fr, loc) "\\t" core', '    if (0) UE_LIST[++NUE] = "GEN\\t" ext_owner(fr, loc) "\\t" core']]],
    ['M-DA2', [16], [['    UE_LIST[++NUE] = "ELEM\\t" ext_owner(fr, loc) "\\t" kinds\n', '']]],
    ['M-DB-from', [17], [['  if (!match(core, /:(c|', '  if (core ~ /:v\\{None;[^}]*\\}->/) return 1\n  if (!match(core, /:(c|']]],
    ['M-DB2', [17], [[DB_END, '( \\(\\+[0-9]+ maps\\))?$/)) return 1']]],
    ['M-TR', [19, 27], [['if (inc_trans + 0 == 1) cls', 'if (inc_trans + 0 == 2) cls']]],
    ['M-TR2', [27], [['  rec1=$(awk -v fns="$FNLIST" -v inc_trans="$INC_TRANS" "$MAP_AWK" "$lf")', '  rec1=$(awk -v fns="$FNLIST" "$MAP_AWK" "$lf")']]],
    ['M-D5', [20, 21], [['  ekx = (mtype == "Transition" && (!($4 in map_ek) || !($5 in map_ek)))\n', '  ekx = 0\n']]],
    ['M-D5j', [21], [["*$'\\n'\"N $fn\"$'\\n'*)", "*$'\\n'\"Nx $fn\"$'\\n'*)"]]],
    ['M-VER', [22], [['-ge 22 ]] || die "node', '-ge 21 ]] || die "node']]],
    ['M-TMP', [23], [['then rm -rf -- \\"\\$TMP_DIR\\"; fi', 'then :; fi']]],
    ['M-ENV', [23], [[ENV_TOP, '']]],
    ['M-NC', [28], [['    if ! cmp -s "$f1" "$fk"; then\n      dl=$(', '    if ! true; then\n      dl=$(']]],
    ['M-OUT-L', [29], [['  [[ ! -L "$OUT" ]] || die "--out: $OUT is a symlink (refused)"', '  true || die "--out: $OUT is a symlink (refused)"']]],
    ['M-OUT-HL', [34], [['    [[ -z "$RL" ]] || die', '    true || die']]],
    ['M-REP', [35], [['  rep_refuse "${POS[@]}"\n', '  :\n']]],
    ['M-NLD', [36], [['  nl_dir "--out (resolved)" "$OUT"\n', '  :\n']]],
    ['M-VERRE', [22], [["VER_RE='^v(", "VER_RE='v("]]],
    ['M10', SIG, [['  sig_arm; [[ -z $SD_ST_SIG ]]', '  : ; [[ -z $SD_ST_SIG ]]']]],
    ['M-DB-end', [17], [[DB_END, '( \\(\\+[0-9]+ maps\\))?/)) return 0']]],
    ['X-V8ALL', [40], [['[[ "$f" == --[A-Za-z]* ]] || die', '[[ "$f" == ---[A-Za-z]* ]] || die']]],
    ['M-V8DROP', [40], [[' ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}"', ' "${TRACE_FLAGS[@]}"']]],
    ['M-CAP', [41, 42, 43, 44], [['if (mtype == "Deprecate") {', 'if (mtype == "Deprecated") {']]],
    ['M-CAPS', [41, 42, 43, 44], [['field type generalization)\\)$/', 'field type generalization|\\+[0-9]+ maps)\\)$/']]],
    ['M-CAPID', IDENT, [['v8-version,13,6,233,17,-node.63,0', 'v8-version,13,6,233,18,-node.63,0']]],
    // E mutants (b112 E-B2, one per engine hunk; edit text + rows: the E-B2 gates table, anchors re-checked exact-once on the built root)
    ['E-M8', [52], [['map-create code-disable-optimization"', 'map-create"'], ['  mk[""] = 1   # V8 logs no marker for Liftoff wasm code and for an interpreted function whose optimization is disabled; never an optimizing marker\n', ''], [' || ($9 == "" && $8 !~ /^0x[0-9a-fA-F]+$/)', '']]],
    ['E-M1', [45], [[' || cls == "MAP_REPLACE") {', ') {']]],
    ['E-M3', [48], [['    floc = substr($7, length(f) + 2)\n    if (!(f in FDEF)) FDEF[f] = floc\n    else if (FDEF[f] != floc) AMBIG[f] = 1\n', ''], ['    if (f in AMBIG) print "A " f\n', ''], ['      *$\'\\n\'"A $fn"$\'\\n\'*) JWHY="ambiguous target function \'$fn\' defined at >1 location in run $((i + 1))"; return 0 ;;\n', '']]],
    ['E-M2a', [46], [['  pm = (m ~ / \\(\\+[0-9]+ maps\\)$/)   # V8 built N new maps (MapUpdater::ConstructNewMap): a real change, even with FROM == TO\n', ''], ['  if (pm) return 0\n', '']]],
    ['E-M7', [51], [['  forp = 0\n  for (i = length(rest) - 7; i >= 2; i--) {\n    if (substr(rest, i, 7) == " for 0x" && substr(rest, i + 7) ~ /^[0-9a-fA-F]+ </) { forp = i; break }\n  }\n', '  forp = index(rest, " for 0x")\n'], ['  pos = frame_pos(line, ") [", 15)\n  if (pos == 0) for (i = length(line) - 1; i >= 15; i--) {\n', '  pos = 0\n  for (i = length(line) - 1; i >= 15; i--) {\n']]],
    ['E-M4fold', [47, 49, 50, 53, 54], [['  if (is_opt(fr)) {\n    if (!(ok in OCNT)) { OORD[++NO] = ok; OFN[NO] = fn; OKIND[NO] = kind; ODET[NO] = detail; b = loc_base(full_loc); sub(/:[0-9]+$/, ":opt", b); OLOC[NO] = b }\n    OCNT[ok]++\n    return\n  }\n', '']]],
    ['E-M2b', [47], [['/^\\[reconfiguring\\]/ {\n  # "[reconfiguring]<name>: <kData|ACCESSORS>, attrs: [<attrs>] [<frame>]" (Map::PrintReconfiguration); the frame bracket\n  # is found by the [generalizing] frame rule (frame_pos on "] ["), with no fallback: none = X\n  if (index($0, "\\t") > 0) { failx("reconfiguring line contains TAB"); next }\n  line = $0\n  if (substr(line, length(line), 1) != "]") { failx("malformed reconfiguring line (no trailing ])"); next }\n  pos = frame_pos(line, "] [", 16)\n  if (pos == 0) { failx("malformed reconfiguring line (missing frame bracket)"); next }\n  core = substr(line, 16, pos - 16)\n  gsub(/\\{symbol 0x[0-9a-fA-F]+\\}/, "{symbol 0xADDR}", core)\n  if (core !~ /: (kData|ACCESSORS), attrs: \\[[A-Z_]*\\]$/) { failx("malformed reconfiguring line (payload)"); next }\n  bracket = substr(line, pos + 2, length(line) - pos - 2)\n  if (bracket == "") { UE_LIST[++NUE] = "RECONF\\t<runtime>\\t" core; next }\n  atp = index(bracket, " at ")\n  if (atp <= 1) { failx("malformed reconfiguring frame (missing at)"); next }\n  fr = substr(bracket, 1, atp - 1)\n  loc = substr(bracket, atp + 4)\n  if (loc == "<unknown>:<unknown>" || loc == "<unknown>") {\n    bfr = strip_frame(fr)\n    if (bfr == "") bfr = fr\n    UE_LIST[++NUE] = "RECONF\\t" bfr "\\t" core\n    next\n  }\n  if (substr(loc, 1, 1) != "/" && substr(loc, 1, 8) != "file:///") { UE_LIST[++NUE] = "RECONF\\t" ext_owner(fr, loc) "\\t" core; next }\n  if (loc !~ /:[0-9]+$/) { failx("malformed reconfiguring loc"); next }\n  if (fr !~ /\\+[0-9]+$/) { failx("malformed reconfiguring frame"); next }\n  fn = strip_frame(fr)\n  if (fn == "") fn = "<anon>"\n  if (is_target(fn)) record_e(fn, "RECONF", loc, core, fr)\n  else UE_LIST[++NUE] = "RECONF\\tuser:" fn "\\t" core\n  next\n}\n', '']]],
    ['E-M4sms', [49], [['    substr($0, 1, length(po)) == po { printf "*\\t%s  optimized-frame  %s\\n", $2, $3 }\n', '']]],
    ['E-M4tier', [50, 54], [['    if [[ "$MSB" == "$MSA" && "$OSB" != "$OSA" ]]; then\n      FV=NO-VERDICT\n      say "  $fn: NO-VERDICT -- tier-up differs (optimized-frame key set):"\n      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf \'%s\\n\' "$OSB") <(printf \'%s\\n\' "$OSA") | sort -k3)\n    elif [[ "$MSB" == "$MSA" && "$ISB" != "$ISA" ]]; then\n', '    if [[ "$MSB" == "$MSA" && "$ISB" != "$ISA" ]]; then\n']]],
    ['E-M12', [53], [['      if [[ "$UNATTR_DIFF" != "" ]]; then   # (not the -n spelling of the SAME branch: its line stays unique)\n        say "    REPORTED unattributed/external shape instability also differs (not in the verdict; an instability may have moved to or from a non-target owner):"\n        while IFS= read -r l; do say "    $l"; done <<< "$UNATTR_DIFF"\n      fi\n', '']]],
    ['E-FOLDSAME', [54], [['    if [[ "$MSB" == "$MSA" && "$OSB" != "$OSA" ]]; then\n      FV=NO-VERDICT\n      say "  $fn: NO-VERDICT -- tier-up differs (optimized-frame key set):"\n      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf \'%s\\n\' "$OSB") <(printf \'%s\\n\' "$OSA") | sort -k3)\n    elif [[ "$MSB" == "$MSA" && "$ISB" != "$ISA" ]]; then\n      FV=NO-VERDICT\n      say "  $fn: NO-VERDICT -- tier-up differs (interpreted key set):"\n      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf \'%s\\n\' "$ISB") <(printf \'%s\\n\' "$ISA") | sort -k3)\n', '    if [[ "$MSB" == "$MSA" && "$ISB" != "$ISA" ]]; then\n      FV=NO-VERDICT\n      say "  $fn: NO-VERDICT -- tier-up differs (interpreted key set):"\n      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf \'%s\\n\' "$ISB") <(printf \'%s\\n\' "$ISA") | sort -k3)\n    elif [[ "$MSB" == "$MSA" && "$OSB" != "$OSA" ]]; then\n      FV=NO-VERDICT\n      say "  $fn: NO-VERDICT -- tier-up differs (optimized-frame key set):"\n      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf \'%s\\n\' "$OSB") <(printf \'%s\\n\' "$OSA") | sort -k3)\n']]],
];

// the source with exact-once edits (split / join, never String.replace: bash text holds `$'`)
function mutate(src, name, edits) {
    for (const [from, to] of edits) {
        const n = count(src, from);
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
        src = src.split(from).join(to);
    }
    return src;
}
function variantFile(dir, name, src) {
    const p = join(dir, `${name.replace(/[^A-Za-z0-9]/g, '_')}.sh`);
    writeFileSync(p, src);
    chmodSync(p, 0o755);
    return p;
}
function withVariant(name, edits, fn) {
    const src = mutate(readFileSync(SCRIPT, 'utf8'), name, edits);
    const d = mkT('sdt-m-');
    try { return fn(variantFile(d, name, src)); } finally { rmSync(d, { recursive: true, force: true }); }
}

// red = exit 1, the FAILED summary, every named row among the FAIL lines (exact label)
function assertKilled(name, r, rows) {
    assert.equal(r.status, 1, `mutant ${name} survived: rc ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED \(\d+ ok\)$/m);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    for (const n of rows) {
        assert.ok(fl.some((l) => l.startsWith(`FAIL ${ROW[n]}: got [`)), `mutant ${name}: expected row ${n} "${ROW[n]}" to FAIL\n${fl.join('\n')}`);
    }
}
function assertSigKilled(name, r) {
    assert.throws(() => assertSig(r), undefined, `mutant ${name}: the signal row passed`);
    assert.ok(r.fired, `mutant ${name}: the awk shim never ran (no TERM sent)`);
    assert.equal(r.status, 0, `mutant ${name}: want rc 0 (the TERM swallowed), got ${r.status}`);
    assert.equal(r.stdout.replace(/\n+$/, '').split('\n').pop(), `self-test: ${C} check(s) ok`);
}
// M-CAPID: the identity row fails on the variant's text, while its self-test passes with all C rows (only this row sees it)
function assertIdKilled(name, src, r) {
    assert.throws(() => assertCapIdentity(src), undefined, `mutant ${name}: the identity row passed`);
    assert.equal(r.status, 0, `mutant ${name}: want rc 0 (the self-test blind to it), got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.equal(okLines(r.stdout).length, C);
    assert.equal(r.stdout.replace(/\n+$/, '').split('\n').pop(), `self-test: ${C} check(s) ok`);
}

// cached runs: the in-repo root, a clean copy outside the repo (the revert rows' baseline), the clean signal run
let ROOT = null; let BASE = null; let SIGR = null;
const root = () => (ROOT ??= selfTest(SCRIPT, `shape-diff --self-test (${SCRIPT})`));
const base = () => (BASE ??= withVariant('baseline', [], (p) => selfTest(p, 'shape-diff --self-test (clean copy)')));
const sigClean = () => (SIGR ??= sigRun(SCRIPT, 'shape-diff signal row (root)'));
const E2E = new Map();
function pair(c, b, a, extra = []) {
    if (!E2E.has(c)) E2E.set(c, e2e(SCRIPT, c, b, a, extra, `shape-diff e2e ${c}`));
    return E2E.get(c);
}
function golden(c, f) { return readFileSync(join(CANNED, 'golden-proto', 'e2e', c, f), 'utf8'); }
// b114 C-25: the NOTE line now ends `see README, Known limits.`; the frozen prototype golden still says `see RESEARCH.md.`
function goldenReport(c) {
    const g = golden(c, 'report.txt');
    assert.equal(count(g, '; see RESEARCH.md.\n'), 1, `golden ${c}: the RESEARCH.md pointer exactly once`);
    return g.replace('; see RESEARCH.md.\n', '; see README, Known limits.\n');
}

// ---------------------------------------------------------------------------------------------------------------
test(`A1 C pin: --self-test (no node on PATH) exits 0 with exactly ${C} ok lines, last line "self-test: ${C} check(s) ok", 0 TMPDIR entries`, { skip }, () => {
    for (const d of BASE_PATH.split(':')) assert.ok(!existsSync(join(d, 'node')), `a node at ${d}/node: the run PATH must hold none`);
    const r = root();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(okLines(r.stdout).length, C);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(r.stdout.replace(/\n+$/, '').split('\n').pop(), `self-test: ${C} check(s) ok`);
    assert.equal(r.left, 0, 'TMPDIR entries left');
});

test(`A1 the ROW table: the clean copy outside the repo prints the ${C} labels in order, the same as the root`, { skip }, () => {
    assert.equal(ROW.length - 1, C);
    const want = ROW.slice(1).map((l) => 'ok ' + l);
    assert.deepEqual(okLines(base().stdout), want);
    assert.deepEqual(okLines(root().stdout), want);
    assert.equal(base().left, 0);
});

const PARITY = [['mono-mono2', 'mono', 'mono2', 0], ['mono-addf', 'mono', 'addf', 1], ['mono-nc', 'mono', 'nc', 2], ['mono-umd', 'mono', 'umd', 2]];
for (const [c, b, a, rc] of PARITY) {
    test(`A2 parity ${b}/${a}: rc ${rc}, report.txt == golden-proto after the line-1 rename; 8 spawns, 1 mktemp, 0 left`, { skip }, () => {
        const g = goldenReport(c);
        const nl = g.indexOf('\n');
        const g1 = g.slice(0, nl);
        assert.equal(count(g1, 'shape-diff (prototype)  node'), 1, 'golden line 1');
        assert.ok(g1.startsWith('shape-diff (prototype)  node'), 'golden line 1 starts with the proto header');
        const want = 'shape-diff  node' + g1.slice('shape-diff (prototype)  node'.length) + g.slice(nl);
        assert.match(golden(c, 'meta.txt'), new RegExp(` rc=${rc} node_spawns=8 mktemp=1 tmpdir_left=0 stdout_eq_report=yes\\n$`));
        const e = pair(c, b, a);
        assert.equal(e.status, rc, e.stdout + e.stderr);
        assert.equal(e.report, want);
        assert.equal(e.spawns, 8); assert.equal(e.mktemp, 1); assert.equal(e.left, 0);
        assert.ok(e.stdoutEqReport, 'stdout == report.txt');
    });
}

test('A2 parity da: the proto (golden) gives 0|VERDICT SAME; the port gives 2|VERDICT NO-VERDICT + the UNATTR node:setMaxListeners line; 8 spawns, 1 mktemp', { skip }, () => {
    const g = goldenReport('mono-da');
    assert.match(golden('mono-da', 'meta.txt'), / rc=0 node_spawns=8 mktemp=1 tmpdir_left=0 /);
    assert.equal(g.replace(/\n+$/, '').split('\n').pop(), 'VERDICT SAME');
    const e = pair('mono-da', 'mono', 'da');
    const lines = e.report.replace(/\n+$/, '').split('\n');
    assert.equal(`${e.status}|${lines[lines.length - 1]}`, '2|VERDICT NO-VERDICT', e.report);
    assert.equal(lines.filter((l) => l.endsWith('before=0 after=1  UNATTR  GEN  node:setMaxListeners  _maxListeners:h{Any;const}->t{Any;mutable}')).length, 1, e.report);
    assert.equal(e.spawns, 8); assert.equal(e.mktemp, 1); assert.equal(e.left, 0);
    assert.ok(e.stdoutEqReport, 'stdout == report.txt');
});

// --- OUT_NAMES row (b107 G-E B4, ruling Q-B107-SDOUTNAMES (a)): the tool assigns OUT_NAMES="" at init, so an inherited env
// OUT_NAMES never joins the rep_refuse list. Fake node, mono vs mono: the before DRIVER is D/drv.js inside --out D (D also
// holds the fake node's map.log / out.txt), cwd = D, env OUT_NAMES = '*' (the glob names drv.js in D) or 'drv.js'.
// Want rc 0, 8 fake-node spawns, no `is an input file` line, stdout ending VERDICT SAME. Two twins must give the NAMED
// refusal (rc 2, 0 spawns, `shape-diff: --out: <D>/drv.js is an input file of this run (<D>/drv.js): the run would
// overwrite it`): the built root of 9770f78 (sha256/8 edecd742, the b107 frozen-pre copy; a reachable history pin, skipped
// off CI when the commit is absent, a failure under CI=true) and a private copy of the live root with the one
// OUT_NAMES="" line dropped (exact-once, count-checked).
const OUTNAMES_LINE = 'OUT_NAMES=""       # rep_refuse checks report.txt only; an inherited env OUT_NAMES never joins it\n';
const ON_VALS = ['*', 'drv.js'];
const OLD_SD_SHA = '9770f78'; const OLD_SD_SHA8 = 'edecd742';
const CI_STRICT = process.env.CI === 'true';
const GIT_ENV = Object.fromEntries(Object.entries(ENV).filter(([k]) => !k.startsWith('GIT_')));
GIT_ENV.GIT_CONFIG_GLOBAL = '/dev/null'; GIT_ENV.GIT_CONFIG_NOSYSTEM = '1';
const haveOldSd = skip ? false : (capSync('git', ['cat-file', '-e', `${OLD_SD_SHA}^{commit}`], { cwd: PKG, encoding: 'utf8', env: GIT_ENV },
    30000, 'git cat-file').status === 0 ? true : `commit ${OLD_SD_SHA} not available (shallow clone?)`);
const OLDSDSKIP = skip || (haveOldSd === true || CI_STRICT ? false : haveOldSd);
function outNamesRun(path, val, what) {
    const t = mkT('sdt-on-');
    try {
        const d = join(t, 'out');
        for (const x of ['fk', 'tmp', 'out', 'x']) mkdirSync(join(t, x));
        writeFileSync(join(t, 'fk', 'node'), readFileSync(join(CANNED, 'fake-node.sh')));
        chmodSync(join(t, 'fk', 'node'), 0o755);
        writeFileSync(join(t, 'fk.log'), '');
        cpSync(join(CANNED, 'e2e', 'mono'), join(t, 'x', 'a'), { recursive: true });
        for (const f of ['map.log', 'out.txt']) cpSync(join(CANNED, 'e2e', 'mono', f), join(d, f));
        cpSync(join(CANNED, 'e2e', 'mono', 'driver.mjs'), join(d, 'drv.js'));
        const r = capSync(BASH, [path, '--node', join(t, 'fk', 'node'), '--fn', 'mk', '--out', d, join(d, 'drv.js'),
            join(t, 'x', 'a', 'driver.mjs')], { cwd: d, encoding: 'utf8', group: true,
            env: { ...ENV, PATH: BASE_PATH, TMPDIR: join(t, 'tmp'), FAKE_LOG: join(t, 'fk.log'), OUT_NAMES: val } }, E2E_CAP, what);
        const argv = readFileSync(join(t, 'fk.log'), 'utf8');
        return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, d,
            spawns: argv.split('\n').filter((l) => l !== '').length };
    } finally { rmSync(t, { recursive: true, force: true }); }
}
// the ONE oracle: the failed expectations (empty = the fixed behaviour)
function outNamesProblems(e) {
    const bad = [];
    if (e.status !== 0) bad.push(`rc ${e.status} != 0`);
    if (e.spawns !== 8) bad.push(`${e.spawns} fake-node spawns != 8`);
    if (/is an input file of this run/.test(e.stderr)) bad.push('stderr has an `is an input file of this run` line');
    if (e.stdout.replace(/\n+$/, '').split('\n').pop() !== 'VERDICT SAME') bad.push('stdout does not end with VERDICT SAME');
    return bad;
}
const onMsg = (e) => `rc=${e.status} signal=${e.signal} spawns=${e.spawns}\n--- stdout\n${e.stdout}--- stderr\n${e.stderr}`;
// a twin is killed by the NAMED refusal only: rc 2, 0 spawns, the exact refusal line once (a crashed child is not a kill)
function assertOnRefused(name, e) {
    const want = `shape-diff: --out: ${e.d}/drv.js is an input file of this run (${e.d}/drv.js): the run would overwrite it`;
    assert.ok(outNamesProblems(e).includes('stderr has an `is an input file of this run` line'), `${name}: the oracle saw no refusal\n${onMsg(e)}`);
    assert.equal(e.status, 2, `${name}: rc\n${onMsg(e)}`);
    assert.equal(e.spawns, 0, `${name}: the refusal must precede every spawn\n${onMsg(e)}`);
    assert.equal(e.stderr.split('\n').filter((l) => l === want).length, 1, `${name}: the named refusal line once\n${onMsg(e)}`);
}
let OLDSD = null;
function oldSdRoot(dir) {
    if (OLDSD === null) {
        const g = capSync('git', ['show', `${OLD_SD_SHA}:shape-diff.sh`], { cwd: PKG, encoding: 'buffer', env: GIT_ENV }, 30000, 'git show shape-diff.sh');
        assert.equal(g.status, 0, `git show ${OLD_SD_SHA}:shape-diff.sh failed (CI=true: an unreachable pin is a failure)`);
        assert.equal(createHash('sha256').update(g.stdout).digest('hex').slice(0, 8), OLD_SD_SHA8, 'the old twin is not edecd742');
        OLDSD = g.stdout;
    }
    const p = join(dir, 'shape-diff.old.sh');
    writeFileSync(p, OLDSD); chmodSync(p, 0o755);
    return p;
}
const ONLIVE = new Map();
const onLive = (val) => { if (!ONLIVE.has(val)) ONLIVE.set(val, outNamesRun(SCRIPT, val, `shape-diff OUT_NAMES=${val}`)); return ONLIVE.get(val); };
for (const val of ON_VALS) {
    test(`A8 OUT_NAMES row: env OUT_NAMES=${JSON.stringify(val)}, cwd = D, the DRIVER D/drv.js inside --out D -> not refused, rc 0, 8 spawns, VERDICT SAME`, { skip }, () => {
        const e = onLive(val);
        assert.deepEqual(outNamesProblems(e), [], onMsg(e));
    });
    test(`A8 OUT_NAMES revert: the twin kill assertion throws on the live run (env OUT_NAMES=${JSON.stringify(val)})`, { skip }, () => {
        assert.throws(() => assertOnRefused("live", onLive(val)));
    });
    test(`A8 OUT_NAMES old twin ${OLD_SD_SHA} (${OLD_SD_SHA8}): env OUT_NAMES=${JSON.stringify(val)} -> the named refusal, rc 2, 0 spawns`, { skip: OLDSDSKIP }, () => {
        const d = mkT('sdt-old-');
        try { assertOnRefused(`old ${OLD_SD_SHA}`, outNamesRun(oldSdRoot(d), val, `shape-diff OUT_NAMES=${val} (old)`)); }
        finally { rmSync(d, { recursive: true, force: true }); }
    });
    test(`A8 OUT_NAMES mutant twin (the OUT_NAMES="" line dropped): env OUT_NAMES=${JSON.stringify(val)} -> the named refusal, rc 2, 0 spawns`, { skip }, () => {
        const e = withVariant('M-OUTNAMES', [[OUTNAMES_LINE, '']], (p) => outNamesRun(p, val, `shape-diff OUT_NAMES=${val} (mutant)`));
        assertOnRefused('M-OUTNAMES', e);
    });
}

test('A5 static TRACE_FLAGS row: the built root holds the 7-flag literal, one flag per line', { skip }, () => {
    assertTraceBlock(readFileSync(SCRIPT, 'utf8'));
});
test('A5 static TRACE_FLAGS row teeth: the M6 text (--no-sparkplug line removed) fails it', { skip }, () => {
    const m6 = MUT.find((m) => m[0] === 'M6');
    const src = mutate(readFileSync(SCRIPT, 'utf8'), 'M6', m6[2]);
    assert.throws(() => assertTraceBlock(src));
});

test('A4 identity row: the fixtures match PROVENANCE [excerpt] (sha256, lines 10 / 2) for 22 / 24 / 26 / 27', () => {
    for (const name of CAP_NAMES) {
        const k = name.endsWith('_LOG') ? 'log' : 'out';
        const prov = readFileSync(join(REAL, name.slice(6, 8), 'PROVENANCE.txt'), 'utf8');
        const m = prov.match(new RegExp(`^  excerpt/run\\.${k} lines=([0-9]+) sha256=([0-9a-f]{64})$`, 'gm'));
        assert.equal(m && m.length, 1, `${name}: one excerpt/run.${k} line in PROVENANCE`);
        const [, lines, sha] = m[0].match(/lines=([0-9]+) sha256=([0-9a-f]{64})$/);
        const buf = readFileSync(capFile(name));
        assert.equal(createHash('sha256').update(buf).digest('hex'), sha, `${name}: sha256`);
        assert.equal(count(buf.toString('latin1'), '\n'), Number(lines), `${name}: lines`);
        assert.equal(Number(lines), k === 'log' ? 10 : 2, `${name}: PROVENANCE lines`);
    }
});
test('A4 identity row: src/shape-diff.sh and the built root each hold exactly the 8 SD_CAP heredocs, each body == its fixture', () => {
    assertCapIdentity(readFileSync(SRC, 'latin1'));
    assertCapIdentity(readFileSync(SCRIPT, 'latin1'));
});
test('A4 identity row controls: one byte changed, an extra blank last line or a trailing space in any of the 8 bodies fails it; any one heredoc missing fails it; a 9th SD_CAP heredoc fails it', () => {
    const src = readFileSync(SCRIPT, 'latin1');
    assert.doesNotThrow(() => assertCapIdentity(src));
    for (const name of CAP_NAMES) {
        const open = `<<'${name}' || true\n`;
        const close = `\n${name}\n`;
        const i = src.indexOf(open) + open.length;
        const j = src.indexOf(close);
        const at = i + ((j - i) >> 1);
        const flip = src.slice(0, at) + String.fromCharCode(src.charCodeAt(at) ^ 1) + src.slice(at + 1);
        assert.equal(flip.length, src.length);
        assert.throws(() => assertCapIdentity(flip), undefined, `${name}: one byte changed passed`);
        const ls = src.lastIndexOf('\n', src.indexOf(open)) + 1;
        const gone = src.slice(0, ls) + src.slice(j + close.length);
        assert.equal(count(gone, open), 0);
        assert.throws(() => assertCapIdentity(gone), undefined, `${name}: missing heredoc passed`);
        assert.throws(() => assertCapIdentity(src.slice(0, j + 1) + '\n' + src.slice(j + 1)), undefined, `${name}: an extra blank last line passed`);
        assert.throws(() => assertCapIdentity(src.slice(0, j) + ' ' + src.slice(j)), undefined, `${name}: a trailing space passed`);
    }
    assert.throws(() => assertCapIdentity(src + "  IFS= read -r -d '' CAP28L <<'SD_CAP28_LOG' || true\nx\nSD_CAP28_LOG\n"), undefined, 'a 9th SD_CAP heredoc passed');
});

test('A5 argv row: in the mono/mono2 e2e every trace argv holds --no-sparkplug exactly once', { skip }, () => {
    assertArgv(pair('mono-mono2', 'mono', 'mono2'));
});
test('A5 argv row teeth: on M6 (--no-sparkplug removed from TRACE_FLAGS) the argv row fails', { skip }, () => {
    const m6 = MUT.find((m) => m[0] === 'M6');
    const e = withVariant('M6', m6[2], (p) => e2e(p, 'mono-mono2', 'mono', 'mono2', [], 'shape-diff e2e mono-mono2 (M6)'));
    assert.equal(e.status, 0, e.stdout + e.stderr);
    const tr = e.argv.filter((l) => l.split(' ').some((w) => w.startsWith('--logfile=')));
    assert.equal(tr.length, 6, e.argv.join('\n'));
    for (const l of tr) assert.equal(l.split(' ').filter((w) => w === '--no-sparkplug').length, 0, l);
    assert.throws(() => assertArgv(e));
});

test('A12 (iii) signal row: TERM at the first awk of --self-test -> rc 2, "shape-diff: interrupted (SIGTERM)" once, 0 TMPDIR entries', { skip }, () => {
    assertSig(sigClean());
});

test('A7 kill-assertion control (pure JS): a synthetic FAIL on row 5 throws for want [4], passes for want [5]', () => {
    const syn = { status: 1, stdout: 'FAIL ' + ROW[5] + ': got [x] want [y]\nself-test: 1 check(s) FAILED (43 ok)\n', stderr: '' };
    assert.throws(() => assertKilled('synthetic', syn, [4]));
    assert.doesNotThrow(() => assertKilled('synthetic', syn, [5]));
});
test('A7 identity-kill assertion control (pure JS): the M-CAPID text with a synthetic FAILED self-test (rc 1) throws', () => {
    const mcapid = MUT.find((m) => m[0] === 'M-CAPID');
    const src = mutate(readFileSync(SCRIPT, 'latin1'), 'M-CAPID', mcapid[2]);
    assert.throws(() => assertIdKilled('M-CAPID', src, { status: 1, stdout: 'self-test: 1 check(s) FAILED (43 ok)\n', stderr: '' }));
});

test('A7 mutant census: 46 mutants, unique labels, every named row a self-test row (M10: the signal row; M-CAPID: the identity row)', { skip }, () => {
    assert.equal(MUT.length, 46);
    assert.equal(new Set(MUT.map((m) => m[0])).size, MUT.length, 'labels are unique');
    assert.equal(new Set(MUT.map((m) => JSON.stringify(m[2]))).size, MUT.length, 'edits are distinct');
    const MULTI_EDIT = new Map([['E-M8', 3], ['E-M3', 3], ['E-M2a', 2], ['E-M7', 2]]);   // one engine hunk spanning several exact-once sites
    for (const [name, rows, edits] of MUT) {
        assert.equal(edits.length, MULTI_EDIT.get(name) ?? 1, `${name}: edit count (one per hunk; MULTI_EDIT lists the multi-site hunks)`);
        if (rows === SIG) { assert.equal(name, 'M10'); continue; }
        if (rows === IDENT) { assert.equal(name, 'M-CAPID'); continue; }
        for (const n of rows) assert.ok(Number.isInteger(n) && n >= 1 && n <= C, `${name}: row ${n}`);
    }
    for (const k of MULTI_EDIT.keys()) assert.ok(MUT.some((m) => m[0] === k), `MULTI_EDIT ${k}: no such mutant`);
});

for (const [name, rows, edits] of MUT) {
    if (rows === SIG) {
        test(`A7 mutant ${name}: the signal row fails (its killer; the self-test passes on it)`, { skip }, () => {
            const r = withVariant(name, edits, (p) => sigRun(p, `shape-diff signal row (${name})`));
            assertSigKilled(name, r);
        });
        test(`A7 revert ${name}: the kill assertion throws on the clean signal run`, { skip }, () => {
            assert.throws(() => assertSigKilled(name, sigClean()));
        });
        continue;
    }
    if (rows === IDENT) {
        test(`A7 mutant ${name}: the identity row fails (its killer; the self-test passes on it with ${C} ok)`, { skip }, () => {
            const v = withVariant(name, edits, (p) => ({ src: readFileSync(p, 'latin1'), r: selfTest(p, `shape-diff --self-test (${name})`) }));
            assertIdKilled(name, v.src, v.r);
        });
        test(`A7 revert ${name}: the kill assertion throws on the clean root`, { skip }, () => {
            assert.throws(() => assertIdKilled(name, readFileSync(SCRIPT, 'latin1'), base()));
        });
        continue;
    }
    test(`A7 mutant ${name}: self-test FAILED, row(s) ${rows.join(', ')} FAIL`, { skip }, () => {
        const r = withVariant(name, edits, (p) => selfTest(p, `shape-diff --self-test (${name})`));
        assertKilled(name, r, rows);
    });
    test(`A7 revert ${name}: the kill assertion throws on the clean copy`, { skip }, () => {
        assert.throws(() => assertKilled(name, base(), rows));
    });
}
