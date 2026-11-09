// test/bytecode-budget.test.mjs -- ../bytecode-budget.sh: self-test, mutants, gate rows (fake node), live rows.
// Oracle: .handoff/PLAN-phase2.md ASSERTIONS A2-A5, not the implementation. Expected lengths come from the
// fixture README census (add 6, mid 211, big 628, read 6,5,6,6, dup 6,19, lazy none), not from a script run.
import { test, beforeEach, after } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, cpSync, existsSync, appendFileSync, realpathSync, lstatSync } from 'node:fs';
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
const DRIVER = join(FIX, 'driver.mjs');
const C = 68;         // self-test ok lines without --fixtures (F1: B2 686de5bf's 42 + the after null-control dj check; F1-r2: + the COUNT_AWK 1..9-digit cap check + the before null-control dj check; P2G2B B2: + 4 ref / file rows (needs git); ext-audit B-four bb: + 5 MD-36 / MD-37 / MD-39/40 / MD-42 / MD-44 rows (no git needed); MD-46 G3: + 3 --v8-flags allowlist rows (5 refusals, the 3 listed flags, TMPDIR / cwd); G-STAGE b44: + 2 D7 rows (D1, D6) + 1 Q-DD6a (i) row (need git); G-ENV b45: + 1 Q-ENV e2e row (no git needed); G-TRACKED b45: + 2 GT1 / GT2 rows (need git); G-FIFO b46: + 1 MD-FIFO row (no git needed); G-BBAWK b52: + 4 R-a..R-d rows (no git needed); with --fixtures C + 24 = 92)
const F = 24;         // fixtures-only checks (plan TASK 4: 13 + 9 + 1 + 1)
// G-ENV (PLAN-b42-genv TASK 1): the top line that unsets the 4 env vars a node reads at start, and its self-test row
const TOPLINE = 'unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: no node spawn sees one\n';
const QENV = 'Q-ENV e2e: NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS set in the environment reach no spawn';
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
// G-FIFO (Q-FIFO, b46): the --out pre-write clause ported from deopt-diff / ic-diff (the M-fifo-off anchor, exactly once)
const FIFO_CLAUSE = '[[ ( -f "$OUT/report.txt" && -w "$OUT/report.txt" ) || ( ! -e "$OUT/report.txt" && ( ! -e "$OUT" || -w "$OUT" ) ) ]]';

// opts may override encoding / env / cwd, never the cap: capSync refuses an opts.timeout (no caller passes one)
function run(path, args, opts = {}) {
    return capSync('bash', [path, ...args], { encoding: 'utf8', ...opts }, 120000, 'bytecode-budget.sh');
}
// a teeth row's expected red is an assertion, never a run its cap killed or a spawn that failed (capSync names both: fail closed)
const redNotTimeout = (e) => e instanceof assert.AssertionError && !/ timed out after \d+ ms \(| spawn error /.test(e.message);
function okCount(out) { return (out.match(/^ok {3}/gm) || []).length; }

// A copy of the script with ONE exact edit (anchor must match exactly once).
function variant(dir, name, from, to, root = SCRIPT) {   // U3 B2: root = the other root (ibd) for its mutants
    const src = readFileSync(root, 'utf8');
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src.replace(from, () => to));
    chmodSync(p, 0o755);
    return p;
}

// Same, but replaces EVERY occurrence (at least one); then each [from, to] of `extra` once (anchor exactly once).
function variantAll(dir, name, from, to, extra = [], first = []) {
    let src = readFileSync(SCRIPT, 'utf8');
    for (const [a, b] of first) {   // replace-alls that must run before `from` (a text that contains `from`)
        assert.ok(src.includes(a), `mutant ${name}: first-pass anchor not found`);
        src = src.split(a).join(b);
    }
    assert.ok(src.includes(from), `mutant ${name}: anchor not found`);
    for (const [a, b] of extra) {
        const n = src.split(a).length - 1;
        assert.equal(n, 1, `mutant ${name}: extra anchor must match exactly once, matched ${n}`);
        src = src.replace(a, () => b);
    }
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src.split(from).join(to));
    chmodSync(p, 0o755);
    return p;
}

// Env for the retention rows: the harness editor / node options stripped, TMPDIR pinned.
function cleanEnv(extra = {}) {
    const e = { ...process.env, ...extra };
    for (const k of ['GIT_EDITOR', 'EDITOR', 'VISUAL', 'NODE_OPTIONS']) delete e[k];
    return e;
}

// A logging mktemp shim first on PATH. macOS /usr/bin/mktemp ignores TMPDIR when called bare, so a private
// TMPDIR cannot see a leaked bare `mktemp -d`; the shim logs "args<TAB>created path" and execs the real one.
// The shim only sees a mktemp found through PATH (an absolute /usr/bin/mktemp or `command -p mktemp` call would bypass it).
function mktempShim(dir) {
    const real = spawnSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8' }).stdout.trim();
    assert.ok(real, 'no real mktemp on PATH');
    const bin = join(dir, 'shim-bin');
    mkdirSync(bin);
    const log = join(dir, 'mktemp.log');
    writeFileSync(log, '');
    writeFileSync(join(bin, 'mktemp'), `#!/bin/bash\np=$('${real}' "$@") || exit $?\nprintf '%s\\t%s\\n' "$*" "$p" >>'${log}'\nprintf '%s\\n' "$p"\n`);
    chmodSync(join(bin, 'mktemp'), 0o755);
    return { real, env: { PATH: bin + ':' + process.env.PATH }, paths: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[1]) };
}

// ---- A2: self-test ----
test('bytecode-budget --self-test: exactly C ok, none failed', { skip }, () => {
    const r = run(SCRIPT, ['--self-test']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^self-test: all checks passed$/m);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), C);
});

test('bytecode-budget --self-test --fixtures: exactly C+24 ok', { skip }, () => {
    const r = run(SCRIPT, ['--self-test', '--fixtures', FIX]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), C + F);
});

// b37 Q-H1 (maintainer ruling "Say 'at the latest'"): the shared MD-46 -h text (lib/v8flags.sh header), compared with
// every whitespace run collapsed to one space, plus the two wrapped lines that carry the new words
const V8FL_HELP = 'Accepted: V8 flags this node lists in --v8-options -- bool as --flag or --no-flag (never --noflag), numeric as ' +
    '--flag=N -- except log / trace / print / prof / perf / dump / snapshot / file flags. Refused, exit 2 at the latest ' +
    'after one --v8-options read and before any measured run: every node option (--run, --test, --watch, --check, ' +
    '--inspect, --cpu-prof, --snapshot-blob, ...), every string-valued V8 flag, and the tool\'s own flags above.';
test('bytecode-budget -h: exit 2, the shared MD-46 --v8-flags text exactly once, "exit 2 at the latest" (Q-H1)', { skip }, () => {
    const r = run(SCRIPT, ['-h']);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(r.stderr, '');
    assert.equal(r.stdout.replace(/\s+/g, ' ').split(V8FL_HELP).length - 1, 1, 'the shared MD-46 -h text exactly once (whitespace collapsed)');
    const lines = r.stdout.split('\n');
    for (const l of ['                         / file flags. Refused, exit 2 at the latest after one --v8-options read and before any',
        '                         measured run: every node option (--run, --test, --watch, --check, --inspect, --cpu-prof,']) {
        assert.ok(lines.includes(l), `-h lacks the line "${l}"`);
    }
});

test('bytecode-budget --self-test --fixtures: a copy without dup.txt exits 1', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-nodup-'));
    try {
        cpSync(FIX, dir, { recursive: true });
        rmSync(join(dir, 'dup.txt'));
        const r = run(SCRIPT, ['--self-test', '--fixtures', dir]);
        assert.equal(r.status, 1, r.stdout + r.stderr);
        assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes('fixture dup.txt')), r.stdout);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

const MUTANTS = [
    ['exact-name-to-prefix', 'want = (s == fn); n += want', 'want = (index(s, fn) == 1); n += want', 'count: exact name'],
    ['deduped-lengths', '{ good++; out = out (out == "" ? "" : ",") ($3 + 0) }',
        '{ good++; if (!(($3 + 0) in seen)) out = out (out == "" ? "" : ",") ($3 + 0); seen[$3 + 0] = 1 }',
        'same-name functions keep every length'],
    ['want-not-reset-at-foreign-header', 'want = (s == fn); n += want', 'if (s == fn) want = 1; n += (s == fn)', 'same-name functions keep every length'],
    ['bad-header-ignored', 'bad = n - good;', 'bad = 0;', 'not followed by'],
    ['gt-to-ge', '(( l > max ))', '(( l >= max ))', 'a length equal to the max is WITHIN'],
    ['version-check-off', 'if [[ -n "$WANT_VER" && "$GOT_VER" != "$WANT_VER" ]]; then', 'if false; then', 'node version mismatch'],
    ['null-control-off', 'if [[ "$line" != "$first" ]]; then JWHY="null control', 'if false; then JWHY="null control', 'null control: run 2 with a changed length'],
    ['fn-regex-allows-dot', "FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*(", "FN_RE='^[A-Za-z_$][A-Za-z0-9_$.]*(", 'fn names: '],
    ['worst-order-swapped', 'for a in NO-VERDICT OVER;', 'for a in OVER NO-VERDICT;', 'worst: NO-VERDICT > OVER > WITHIN'],
    // F1-r2: the COUNT_AWK length cap (1..9 digits) is seen by the shipped --self-test, not only by the node rows below
    ['cap-off', ' && length($3) <= 9 {', ' {', 'a length has 1..9 digits'],
    ['cap-8', 'length($3) <= 9', 'length($3) <= 8', 'a length has 1..9 digits'],
    ['cap-10', 'length($3) <= 9', 'length($3) <= 10', 'a length has 1..9 digits'],
    // ext-audit B-four bb (plan TASK 5 / A2): each kills exactly one of self-test checks 59 (M36), 60 (M37),
    // 62 (M40), 63 (M42), 64 (M44), in that order (61 is MD-FIFO, killed by M-fifo-off)
    ['M36-raw-symlink-off', '[[ ! -L "$OUT/raw" ]]', 'true', 'MD-36 refused before any spawn', true],
    ['M37-report-hardlink-off', '[[ ! -f "$OUT/report.txt" ]]', 'true', 'MD-37 refused before any spawn', true],
    // G-FIFO b46: the self-test row holds the FIFO open read-write, so this mutant fails the row (spawns, raw/) instead of hanging
    ['M-fifo-off', FIFO_CLAUSE, 'true', 'MD-FIFO refused before any spawn', true],
    ['M40-env-file-arm-off', '--env-file*|--experimental-config-file*|--experimental-default-config-file*)', '--never-x)', 'MD-39/40 refused before any spawn', true],
    ['M42-module-arm-off', '--require*|--import*|--loader*|--experimental-loader*)', '--never-x)', 'MD-42 refused before any spawn', true],
    ['M44-eval-arm-off', '--eval*|--print*)', '--never-x)', 'MD-44 refused before any spawn', true],
    // G-BBAWK b52 (R-a..R-d): the two COUNT_AWK rules, their hdr bookkeeping and the LIMITS_AWK reset line
    ['glued-off', 'index(substr($0, 2), "[generated bytecode for function: ") { n++; want = 0; hdr = 1; next }\n', '', 'a second header glued onto a column-1 header line', true],
    ['orphan-off', '!hdr && /^Bytecode length:/ { n++ }\n', '', 'a length line with no header line right above it', true],
    ['b4a-reset-off', '/^  --/ { k = "" }\n', '', "another flag's header ends a limit header", true],
    ['glued-hdr-off', 'want = 0; hdr = 1; next', 'want = 0; next', 'a header glued after column 1'],
    ['header-hdr-off', 'n += want; hdr = 1; next', 'n += want; next', 'count: one header -> count 1'],
];
for (const [name, from, to, failing, exact] of MUTANTS) {
    test(`bytecode-budget --self-test MUST FAIL on mutant ${name}`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), `bb-${name}-`));
        try {
            const r = run(variant(dir, name, from, to), ['--self-test', '--fixtures', FIX]);
            assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
            assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes(failing)),
                `mutant ${name}: expected a FAIL line naming "${failing}"\n${r.stdout}`);
            if (exact) {
                assert.match(r.stdout, /^self-test: 1 check\(s\) FAILED$/m, `mutant ${name}: must kill exactly one check\n${r.stdout}`);
                assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('FAIL ')).length, 1, `mutant ${name}: exactly one FAIL line\n${r.stdout}`);
            }
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// ---- G-FIFO (Q-FIFO, b46): --out DIR whose report.txt is a FIFO with no reader ----
// The 5e570f0 build passes every pre-write check, makes raw/ and blocks for ever opening the FIFO for the empty report.
// Row: exit 2, 0 node spawns (fake node), the die line once and no other tool line, OUT holds only report.txt, still a
// FIFO; bounded by FIFO_CAP. Twin: the same run on M-fifo-off (the clause -> true, the 5e570f0 path) must hit its own
// FIFO_TWIN_CAP; spawnSync then SIGKILLs only that child (blocked in open(2) in the main shell: no child of its own, no
// writer left behind) and the dir, FIFO included, is removed. The capSync error is captured, then asserted (not swallowed).
const FIFO_CAP = 30000;
const FIFO_TWIN_CAP = 5000;
function fifoRun(script, cap) {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fifo-'));
    try {
        const f = fakeNode(dir);
        const out = join(dir, 'o');
        mkdirSync(out);
        const mk = spawnSync('mkfifo', [join(out, 'report.txt')], { encoding: 'utf8' });
        assert.equal(mk.status, 0, `mkfifo failed: ${mk.stderr}`);
        let r = null;
        let err = null;
        try {
            r = capSync('bash', [script, '--node', f.path, '--fn', 'add', '--out', out, DRIVER], { encoding: 'utf8', env: cleanEnv(), killSignal: 'SIGKILL' }, cap, 'bytecode-budget.sh --out <FIFO report.txt>');
        } catch (e) { err = e; }
        return { r, err, out, ls: readdirSync(out).sort(), fifo: lstatSync(join(out, 'report.txt')).isFIFO(), spawns: f.spawns() };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
function fifoCheck(x) {
    if (x.err) throw x.err;
    const all = x.r.stdout + x.r.stderr;
    assert.equal(x.r.status, 2, all);
    assert.equal(x.spawns.length, 0, `0 node spawns, got:\n${x.spawns.join('\n')}`);
    const lines = all.split('\n');
    assert.equal(lines.filter((l) => l === `bytecode-budget: --out: cannot write ${x.out}/report.txt`).length, 1, `the die line once\n${all}`);
    assert.equal(lines.filter((l) => l.startsWith('bytecode-budget: ')).length, 1, `no other tool line\n${all}`);
    assert.deepEqual(x.ls, ['report.txt'], 'OUT holds only report.txt (no raw/)');
    assert.equal(x.fifo, true, 'report.txt is still a FIFO');
}
test('bytecode-budget G-FIFO (fake node): --out DIR whose report.txt is a FIFO -> exit 2, 0 spawns, "cannot write" once, no raw/, still a FIFO, within the cap', { skip }, () => {
    fifoCheck(fifoRun(SCRIPT, FIFO_CAP));
});
test('bytecode-budget G-FIFO teeth: M-fifo-off (the 5e570f0 path) blocks on the FIFO -> the row is red by its cap (SIGKILL), raw/ made, FIFO kept, 0 spawns', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fifo-off-'));
    try {
        const x = fifoRun(variant(dir, 'M-fifo-off', FIFO_CLAUSE, 'true'), FIFO_TWIN_CAP);
        assert.ok(x.err instanceof assert.AssertionError && x.err.message.includes(`timed out after ${FIFO_TWIN_CAP} ms (killed by SIGKILL)`), `expected the cap to kill the blocked run, got ${x.err ? x.err.message : 'exit ' + x.r.status}`);
        assert.throws(() => fifoCheck(x), /timed out after/);
        assert.deepEqual(x.ls, ['raw', 'report.txt'], 'past the pre-write block: raw/ made before the blocking open');
        assert.equal(x.fifo, true, 'report.txt still a FIFO');
        assert.equal(x.spawns.length, 0, x.spawns.join('\n'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- fake node ----
// Answers --version, --v8-options (fixture excerpt), and --print-bytecode calls (cats fixture <fn>.txt).
// Every call appends its argv (one line) to LOG; bytecode calls count per fn in COUNT.<fn>.
// opts: version, verRc (exit code for --version), rc (exit code for bytecode calls), run2 ({fn: 'from:to'} sed on call >= 2).
function fakeNode(dir, opts = {}) {
    const version = opts.version || 'v26.8.2';
    const rc = opts.rc || 0;
    const verRc = opts.verRc || 0;      // exit code of the --version call
    const log = join(dir, 'argv.log');
    const run2 = opts.run2 || {};
    const run2Lines = Object.entries(run2).map(([fn, ft]) => `[ "$fn" = ${JSON.stringify(fn)} ] && SED='s/Bytecode length: ${ft.split(':')[0]}$/Bytecode length: ${ft.split(':')[1]}/'`).join('\n');
    const sh = `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) [ -z "\${NODE_OPTIONS+x}" ] || exit 7; echo ${version}; exit ${verRc} ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
[ -z "\${NODE_OPTIONS+x}" ] || exit 7
pwd >> ${JSON.stringify(join(dir, 'pwd.log'))}
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
f=$(printf '%s' "$fn" | tr ' ' '-')
[ -f ${JSON.stringify(FIX)}/"$f.txt" ] || f=nosuchfn
cnt=${JSON.stringify(dir)}/COUNT."$f"
n=0; [ -f "$cnt" ] && n=$(cat "$cnt"); n=$((n+1)); echo $n > "$cnt"
SED=
if [ "$n" -ge 2 ]; then
:
${run2Lines}
fi
if [ -n "$SED" ]; then sed "$SED" ${JSON.stringify(FIX)}/"$f.txt"; else cat ${JSON.stringify(FIX)}/"$f.txt"; fi
exit ${rc}
`;
    const p = join(dir, 'node');
    writeFileSync(p, sh);
    chmodSync(p, 0o755);
    return { path: p, log, pwds: () => (existsSync(join(dir, 'pwd.log')) ? readFileSync(join(dir, 'pwd.log'), 'utf8').split('\n').filter(Boolean) : []), spawns: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

function gate(max, extra = [], fopts = {}, script = SCRIPT, ropts = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    try {
        const f = fakeNode(dir, fopts);
        const r = run(script, ['--node', f.path, '--max', max, ...extra, DRIVER], ropts);
        return { r, spawns: f.spawns(), pwds: f.pwds() };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
const NV = ['--node-version', 'v26.8.2'];

// ---- A3: gate rows (fake node) ----
const GATE_ROWS = [
    ['dup=19 within (both matches <= 19)', 'dup=19', NV, {}, 0, /VERDICT WITHIN/],
    ['dup=18 over (19 > 18, any match gates)', 'dup=18', NV, {}, 1, /VERDICT OVER/],
    ['lazy=100: zero matches is NO-VERDICT', 'lazy=100', NV, {}, 2, /VERDICT NO-VERDICT/],
    ['version v26.8.1 expectation with mid=1: NO-VERDICT, never OVER', 'mid=1', ['--node-version', 'v26.8.1'], {}, 2, /VERDICT NO-VERDICT/],
    ['fn Store.read is refused (qualified names never match)', 'Store.read=1', NV, {}, 2, /fn must be a short V8 function name/],
    // C4: exact version match; a prefix-matching check would pass v26.8.2-pre against v26.8.2
    ['node v26.8.2-pre vs expectation v26.8.2: NO-VERDICT (exact match, not prefix)', 'mid=211', NV, { version: 'v26.8.2-pre' }, 2, /mid: NO-VERDICT -- node version mismatch: /],
    ['missing --node-version in gate mode is usage', 'add=6', [], {}, 2, null],
    ['fake node exits 1: NO-VERDICT', 'add=6', NV, { rc: 1 }, 2, /VERDICT NO-VERDICT/],
    ['run 2 prints length 212 for mid: NO-VERDICT', 'mid=211', NV, { run2: { mid: '211:212' } }, 2, /VERDICT NO-VERDICT/],
];
for (const [name, max, extra, fopts, code, re] of GATE_ROWS) {
    test(`bytecode-budget gate (fake node): ${name}`, { skip }, () => {
        const { r } = gate(max, extra, fopts);
        assert.equal(r.status, code, r.stdout + r.stderr);
        if (re) assert.match(r.stdout + r.stderr, re);
    });
}

test('bytecode-budget report (fake node): read shows 4 match(es): 6,5,6,6', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'read', DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /read: 4 match\(es\): 6,5,6,6/);
        assert.match(r.stdout, /VERDICT REPORTED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// control: without FINAL=1 before the verdict the OVER row exits 2 (proves the 1 comes from FINAL)
test('bytecode-budget gate control: no FINAL=1 before the verdict turns OVER into exit 2', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-ctl-'));
    try {
        const p = variant(dir, 'no-final', 'FINAL=1\ncase "$VERDICT"', 'case "$VERDICT"');
        const { r } = gate('dup=18', NV, {}, p);
        assert.equal(r.status, 2, r.stdout + r.stderr);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// C3/C4 teeth: each mutant of the built script must be caught by the gate rows.
test('bytecode-budget teeth: a script that leaks NODE_OPTIONS to the probe is caught (fake node exits 7 -> exit 2)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-leak-'));
    try {
        const env = { ...process.env, NODE_OPTIONS: '--no-warnings' };
        const good = gate('add=6', NV, {}, SCRIPT, { env });
        assert.equal(good.r.status, 0, good.r.stdout + good.r.stderr);
        // G-ENV (PLAN-b42-genv A4): the top unset line strips NODE_OPTIONS for every spawn, so the mutant also deletes it.
        // FILLERS task 4: the two-`-u` form is collapsed FIRST. Deleting `env -u NODE_OPTIONS ` from it would leave a bare
        // `-u NODE_COMPILE_CACHE "$NODE_BIN"`, which dies on `-u: command not found` and passes this row for the wrong reason.
        const p = variantAll(dir, 'leak-node-options', 'env -u NODE_OPTIONS ', '', [[TOPLINE, '']],
            [['env -u NODE_OPTIONS -u NODE_COMPILE_CACHE ', 'env -u NODE_OPTIONS ']]);
        const bad = gate('add=6', NV, {}, p, { env });
        assert.equal(bad.r.status, 2, 'mutant survived: ' + bad.r.stdout + bad.r.stderr);
        // the fake node's --version arm exits 7 too, so the script dies at the version probe (the leak path, not a
        // broken `-u` command)
        assert.match(bad.r.stdout + bad.r.stderr, /cannot run .* --version$/m);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// G-ENV teeth (PLAN-b42-genv TASK 2, ASSERTION A1): the root minus the top unset line -> --self-test exit 1, exactly one
// FAIL, the Q-ENV e2e row (the fake node exits 7 at --version on the exported NODE_V8_COVERAGE). The host env loses the
// four names first (under --experimental-test-coverage NODE_V8_COVERAGE would trip every fake-node row of the mutant);
// NODE_V8_COVERAGE = undefined, not a delete: node's child_process re-inserts a missing NODE_V8_COVERAGE key.
function envNoNode() {
    const e = cleanEnv();
    for (const k of ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;
    return e;
}
test('bytecode-budget G-ENV teeth: the root minus the top unset line -> --self-test exit 1, exactly 1 FAIL, the Q-ENV e2e row', { skip }, () => {
    const good = run(SCRIPT, ['--self-test'], { env: envNoNode() });
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.equal(good.stdout.split('\n').filter((l) => l.startsWith('ok   ' + QENV)).length, 1, 'the Q-ENV e2e row passes exactly once');
    const dir = mkdtempSync(join(tmpdir(), 'bb-envoff-'));
    try {
        const r = run(variant(dir, 'M-env-off', TOPLINE, ''), ['--self-test'], { env: envNoNode() });
        const f = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
        assert.equal(r.status, 1, 'mutant M-env-off survived: ' + r.stdout + r.stderr);
        assert.equal(f.length, 1, f.join('\n'));
        assert.ok(f[0].startsWith('FAIL ' + QENV), f[0]);
        assert.match(r.stdout, /^ {5}got: {2}2\|VERDICT NO-VERDICT\|1\|0$/m, 'the fake exits 7 at --version after 1 spawn');
        assert.equal(okCount(r.stdout), C - 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bytecode-budget teeth: a prefix-matching version check lets v26.8.2-pre through (the exact check does not)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-vpre-'));
    try {
        const p = variant(dir, 'version-prefix', '"$GOT_VER" != "$WANT_VER" ]]', '"$GOT_VER" != "$WANT_VER"* ]]');
        const bad = gate('mid=211', NV, { version: 'v26.8.2-pre' }, p);
        assert.equal(bad.r.status, 0, 'expected the prefix mutant to pass wrongly: ' + bad.r.stdout + bad.r.stderr);
        const good = gate('mid=211', NV, { version: 'v26.8.2-pre' });
        assert.equal(good.r.status, 2, good.r.stdout + good.r.stderr);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- C1/C6/C8: refusals exit 2 with a message and ZERO node spawns ----
const REFUSALS = [
    ['repeated --max', ['--max', 'mid=1', '--max', 'add=6', ...NV], 'given twice (give one comma list)'],
    ['repeated --fn', ['--fn', 'a', '--fn', 'b'], 'given twice (give one comma list)'],
    ['repeated --max=v form', ['--max=mid=1', '--max=add=6', ...NV], 'given twice (give one comma list)'],
    ['repeated --fn=v then --fn', ['--fn=a', '--fn', 'b'], 'given twice (give one comma list)'],
    ['newline in --max', ['--max', 'add=6\nmid=1', ...NV], 'a newline is not allowed'],
    ['newline in --fn', ['--fn', 'add\nmid'], 'a newline is not allowed'],
    ['newline in --v8-flags', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size=5\n--x'], 'a newline is not allowed'],
    ['v8 budget flag =abc', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size=abc'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 budget flag without =N', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 budget flag with 10 digits', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size=1234567890'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 reserve flag =abc', ['--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=abc'], 'needs =X (a decimal number'],
    ['v8 reserve flag =.5', ['--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=.5'], 'needs =X (a decimal number'],
    // V8 negates a flag with "no" + optional - or _; the negated budget flags are refused (R2)
    ['v8 negated --no-max-inlined-bytecode-size=5', ['--fn', 'add', '--v8-flags', '--no-max-inlined-bytecode-size=5'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 negated --no_max_inlined_bytecode_size=5', ['--fn', 'add', '--v8-flags', '--no_max_inlined_bytecode_size=5'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 negated --nomax-inlined-bytecode-size=5', ['--fn', 'add', '--v8-flags', '--nomax-inlined-bytecode-size=5'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 negated --no-reserve-inline-budget-scale-factor=1.5', ['--fn', 'add', '--v8-flags', '--no-reserve-inline-budget-scale-factor=1.5'], 'needs =X (a decimal number'],
    ['v8 negated --noreserve-inline-budget-scale-factor=1.5', ['--fn', 'add', '--v8-flags', '--noreserve-inline-budget-scale-factor=1.5'], 'needs =X (a decimal number'],
    ['stray trailing comma in --max', ['--max', 'add=6,', ...NV], 'empty entry (stray comma)'],
    ['stray leading comma in --fn', ['--fn', ',add'], 'empty entry (stray comma)'],
    ['stray double comma in --fn', ['--fn', 'add,,mid'], 'empty entry (stray comma)'],
    ['--self-test --runs', ['--self-test', '--runs', '3'], '--self-test takes only --fixtures DIR'],
    ['--self-test --node', ['--self-test', '--node', 'X'], '--self-test takes only --fixtures DIR'],
    ['--self-test --v8-flags', ['--self-test', '--v8-flags', '--x'], '--self-test takes only --fixtures DIR'],
    // T-F1: an explicit empty separate value for any value option is refused, never read as "not given"
    ['empty --fixtures value', ['--self-test', '--fixtures', ''], 'needs a non-empty value'],
    ['empty --out value', ['--fn', 'add', '--out', ''], 'needs a non-empty value'],
    ['empty --fn value', ['--fn', ''], 'needs a non-empty value'],
    ['empty --max value', ['--max', '', ...NV], 'needs a non-empty value'],
    ['empty --node-version value', ['--fn', 'add', '--node-version', ''], 'needs a non-empty value'],
    ['empty --runs value', ['--fn', 'add', '--runs', ''], 'needs a non-empty value'],
    ['empty --node value', ['--fn', 'add', '--node', ''], 'needs a non-empty value', true],
    ['empty --v8-flags value', ['--fn', 'add', '--v8-flags', ''], 'needs a non-empty value'],
    // OPT-EQ F-a: an empty --opt= is an explicit empty value; it must not swallow the next argument
    ['empty --fn= value', ['--fn=', 'add'], 'needs a non-empty value'],
    ['empty --runs= value', ['--fn', 'add', '--runs=', '3'], 'needs a non-empty value'],
    ['empty --max= value', ['--max=', 'add=6', ...NV], 'needs a non-empty value'],
    // OPT-EQ F-b: a flag that takes no value refuses =value instead of dropping it
    ['--self-test=0', ['--self-test=0'], 'takes no value'],
    ['--help=x', ['--help=x'], 'takes no value'],
    ['blank --v8-flags value', ['--fn', 'add', '--v8-flags', ' '], 'needs at least one flag'],
    ['tab --v8-flags value', ['--fn', 'add', '--v8-flags', '\t'], 'needs at least one flag'],
    // T2: integer boundaries (2^30 is 10 digits; -0 is not digits; 2^64+2 wraps to 2)
    ['--max N = 2^30 (10 digits)', ['--max', 'add=1073741824', ...NV], 'N must be an integer of 1..9 digits'],
    ['--max N = -0', ['--max', 'add=-0', ...NV], 'N must be an integer of 1..9 digits'],
    // --runs 2^64+2: $((10#N)) wraps to 2; red on ^[0-9]{1,2}$ -> ^[0-9]+$ or {1,20}
    ['--runs 2^64+2 (wraps to 2)', ['--fn', 'add', '--runs', '18446744073709551618'], 'must be an integer in [2, 20]'],
];
for (const [name, args, msg, raw] of REFUSALS) {
    test(`bytecode-budget refusal: ${name} -> exit 2, "${msg}", 0 spawns`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-refuse-'));
        try {
            const f = fakeNode(dir);
            const st = args.some((a) => a.startsWith('--self-test'));
            const withDriver = st ? args : [...args, DRIVER];
            // fake node is both --node (non-self-test) and first on PATH (self-test), so any spawn is logged
            const pre = (st || raw) ? [] : ['--node', f.path];
            const r = run(SCRIPT, [...pre, ...withDriver], { env: { ...process.env, PATH: dir + ':' + process.env.PATH } });
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.ok((r.stdout + r.stderr).includes(msg), `expected "${msg}" in:\n${r.stdout}${r.stderr}`);
            assert.equal(f.spawns().length, 0, f.spawns().join('\n'));
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// MD-46 G3 A1: a --v8-flags token this node does not list as a V8 tuning flag is refused right after --version, by the
// ONE allowlist read: exit 2, stderr exactly the frozen lib/v8flags.sh die line + VERDICT NO-VERDICT, 0 stdout bytes,
// argv exactly [--version, --v8-options] (red on 4e364c6 a2449a09, which ran all 8 probes for --bogus-flag and
// accepted the node options). The fake node lists only test/fixtures/bytecode-budget/node-26.8.2/v8-options-excerpt.txt.
const V8FL_DIE = (t) => `bytecode-budget: --v8-flags must not set ${t}: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)\nVERDICT NO-VERDICT\n`;
function v8flRefused(r, f, t) {
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(r.stderr, V8FL_DIE(t));
    assert.equal(r.stdout, '');
    assert.deepEqual(f.spawns(), ['--version', '--v8-options']);
}
test('bytecode-budget: --v8-flags --bogus-flag (not a V8 flag of this node) -> exit 2 die line after [--version, --v8-options], 0 probes, 0 stdout', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rej-'));
    try {
        const f = fakeNode(dir, { rc: 9 });
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add,mid', '--runs', '3', '--v8-flags', '--bogus-flag', DRIVER]);
        v8flRefused(r, f, '--bogus-flag');
        assert.equal(f.spawns().filter((l) => l.includes('--print-bytecode-filter=')).length, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
// T1 (-h): a V8 flag this node LISTS but rejects at run time still runs every probe: 3 + 2 fns x 3 runs = 9, NO-VERDICT
test('bytecode-budget: a listed V8 flag node rejects (--max-inlined-bytecode-size=30, driver exit 9) runs every probe: 9 spawns, NO-VERDICT', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rej9-'));
    try {
        const f = fakeNode(dir, { rc: 9 });
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add,mid', '--runs', '3', '--v8-flags', '--max-inlined-bytecode-size=30', DRIVER]);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stdout, /^  add: NO-VERDICT -- driver exited 9 in run 1$/m);
        assert.match(r.stdout, /^  mid: NO-VERDICT -- driver exited 9 in run 1$/m);
        const sp = f.spawns();
        assert.equal(sp.length, 9, sp.join('\n'));
        assert.deepEqual(sp.slice(0, 3), ['--version', '--v8-options', '--v8-options']);
        assert.equal(sp.filter((l) => l.includes('--print-bytecode-filter=') && l.includes('--max-inlined-bytecode-size=30')).length, 6);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
for (const t of ['--snapshot-blob=F', '--build-snapshot', '--openssl-config=F', '--experimental-require-module', '--experimental-print-required-tla']) {
    test(`bytecode-budget: --v8-flags ${t} (a node option) -> exit 2 die line after [--version, --v8-options], 0 stdout`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-rej-'));
        try {
            const f = fakeNode(dir);
            v8flRefused(run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', t, DRIVER]), f, t);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
// A2: 25 accepted --v8-flags tokens still cost ONE allowlist read: 3 + 2 runs. The regex takes every `  --name (` line of the
// excerpt (every flag it lists, any type: 14 today, floor >= 13), each given as =N; it does not check a flag's type.
test('bytecode-budget: 25 accepted --v8-flags tokens -> exit 0 REPORTED, still 1 allowlist read (5 spawns: --version, 2 x --v8-options, 2 runs)', { skip }, () => {
    const names = [...readFileSync(join(FIX, 'v8-options-excerpt.txt'), 'utf8').matchAll(/^ {2}--([a-z0-9-]+) \(/gm)].map((m) => m[1]);
    assert.ok(names.length >= 13, String(names.length));
    const toks = Array.from({ length: 25 }, (_, i) => `--${names[i % names.length]}=${i + 2}`);
    const dir = mkdtempSync(join(tmpdir(), 'bb-25tok-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', toks.join(' '), DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /^VERDICT REPORTED$/m);
        const sp = f.spawns();
        assert.equal(sp.length, 5, sp.join('\n'));
        assert.deepEqual(sp.slice(0, 3), ['--version', '--v8-options', '--v8-options']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
// A4: under MD-57 as amended by Q-BB3 (G-ORDER) bb's --out block writes only `mkdir -p OUT/raw` and `: >OUT/report.txt`
// before the spawns; raw/before + raw/after (diff mode) and stage/ (ref / file mode) are made only after --version,
// the --v8-flags allowlist read and the version check. So a refusal leaves OUT = {raw/ (empty), report.txt (0 bytes)}
// in report mode AND diff mode, and 20 refuse + accept cycles leave a private TMPDIR and cwd empty with no mktemp call.
// Both modes pin the COMPLETE recursive OUT listing, so an extra or a missing entry is red in either mode.
test('bytecode-budget: a --v8-flags refusal with --out leaves OUT/raw empty and report.txt 0 bytes (report and diff mode)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rejout-'));
    try {
        const f = fakeNode(dir);
        const out = join(dir, 'o');
        v8flRefused(run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', '--bogus-flag', '--out', out, DRIVER]), f, '--bogus-flag');
        assert.deepEqual(readdirSync(out, { recursive: true }).sort(), ['raw', 'report.txt']);
        assert.deepEqual(readdirSync(join(out, 'raw')), []);
        assert.equal(readFileSync(join(out, 'report.txt'), 'utf8'), '');
        const s = diffSetup({ before: { add: [6] }, after: { add: [6] } });
        try {
            const dout = join(s.dir, 'o');
            const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', '--v8-flags', '--bogus-flag', '--out', dout, s.B, s.A]);
            v8flRefused(r, s, '--bogus-flag');
            assert.deepEqual(readdirSync(dout, { recursive: true }).sort(), ['raw', 'report.txt']);   // G-ORDER: no raw/before, raw/after before the spawns
            assert.deepEqual(readdirSync(join(dout, 'raw')), []);
            assert.equal(readFileSync(join(dout, 'report.txt'), 'utf8'), '');
        } finally { s.done(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('bytecode-budget: 20 cycles of a --v8-flags refusal + an accepted run leave a private TMPDIR and cwd empty and call no mktemp', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rejret-'));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-tmpdir-'));
    const cwd = mkdtempSync(join(tmpdir(), 'bb-cwd-'));
    try {
        const f = fakeNode(dir);
        const sh = mktempShim(dir);
        const env = cleanEnv({ TMPDIR: tmp, ...sh.env });
        for (let i = 0; i < 20; i++) {
            const x = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', '--build-snapshot', DRIVER], { env, cwd });
            assert.equal(x.status, 2, x.stdout + x.stderr);
            const y = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=1.5', DRIVER], { env, cwd });
            assert.equal(y.status, 0, y.stdout + y.stderr);
        }
        assert.equal(f.spawns().length, 20 * 2 + 20 * 5);   // refusal 2 (version + allowlist); accept 5 (+ limits + 2 runs)
        assert.equal(f.spawns().filter((l) => l === '--v8-options').length, 20 + 20 * 2);
        assert.deepEqual(readdirSync(tmp), []);
        assert.deepEqual(readdirSync(cwd), []);
        assert.deepEqual(sh.paths(), []);
    } finally { for (const d of [dir, tmp, cwd]) rmSync(d, { recursive: true, force: true }); }
});

// T3: a --node whose --version fails -> exit 2 after exactly that 1 spawn
test('bytecode-budget: a --node whose --version fails exits 2 "cannot run" after exactly 1 spawn', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-verfail-'));
    try {
        const f = fakeNode(dir, { verRc: 3 });
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', DRIVER]);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.ok((r.stdout + r.stderr).includes('cannot run'), r.stdout + r.stderr);
        assert.equal(f.spawns().length, 1, f.spawns().join('\n'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// OPT-EQ positive pin: the equals form works exactly like the separate form; a separate-form option
// follows it, so an EQ flag that is not reset per argument is red here
test('bytecode-budget: --fn=add (equals form) exits 0 REPORTED like --fn add', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-eq-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--fn=add', '--node', f.path, DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /VERDICT REPORTED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bytecode-budget: --v8-flags --reserve-inline-budget-scale-factor=1.5 (a decimal) runs', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-dec-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=1.5', DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /VERDICT REPORTED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bytecode-budget report mode: version mismatch says --node-version is <v>; gate mode says the maxima are for <v>', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rv-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--node-version', 'v26.8.1', DRIVER]);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stdout, /NO-VERDICT -- node version mismatch: .* --version is v26\.8\.2, --node-version is v26\.8\.1/);
        const g = gate('mid=1', ['--node-version', 'v26.8.1']);
        assert.match(g.r.stdout, /--version is v26\.8\.2, the maxima are for v26\.8\.1/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// cwd contract: every traced run starts with cwd = the driver's directory
test('bytecode-budget: the driver runs with cwd = the driver directory', { skip }, () => {
    const { r, pwds } = gate('add=6', NV);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(pwds.length >= 2, String(pwds.length));
    for (const d of pwds) assert.equal(realpathSync(d), realpathSync(dirname(DRIVER)));
});

// ---- A4: spawns / retention ----
test('bytecode-budget: 3 fns x 2 runs = exactly 9 node spawns (1 version + 1 allowlist + 1 limits + 6 traces)', { skip }, () => {
    // NODE_OPTIONS is set: the fake node exits 7 on a bytecode call if the script leaks it
    const { r, spawns } = gate('add=6,mid=211,dup=19', NV, {}, SCRIPT, { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(spawns.length, 9, spawns.join('\n'));
    assert.deepEqual(spawns.slice(0, 3), ['--version', '--v8-options', '--v8-options']);
    assert.equal(spawns.filter((l) => l.includes('--print-bytecode-filter=')).length, 6);
});

test('bytecode-budget: an invalid fn spawns nothing', { skip }, () => {
    const { r, spawns } = gate('add=6,bad.name=1', NV);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(spawns.length, 0, spawns.join('\n'));
});

// bytecode-budget.sh calls mktemp only in --self-test, so a gate run must log ZERO shim calls (retention proof).
test('bytecode-budget: 20 runs without --out leave a private TMPDIR empty and call no mktemp', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-tmpdir-'));
    try {
        const f = fakeNode(dir);
        const sh = mktempShim(dir);
        for (let i = 0; i < 20; i++) {
            const r = run(SCRIPT, ['--node', f.path, '--max', 'add=6', ...NV, DRIVER], { env: cleanEnv({ TMPDIR: tmp, ...sh.env }) });
            assert.equal(r.status, 0, r.stdout + r.stderr);
        }
        assert.deepEqual(readdirSync(tmp), []);
        assert.deepEqual(sh.paths(), []);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); }
});

// Teeth: a bare `mktemp -d` that is never removed. The shim sees it; (on macOS) the private TMPDIR does not.
test('bytecode-budget: mutant with a leaked bare mktemp -d is caught by the shim (TMPDIR is blind on macOS)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-tmpdir-'));
    let sh = { paths: () => [] };
    try {
        sh = mktempShim(dir);
        const f = fakeNode(dir);
        const p = variant(dir, 'leak-mktemp', "trap 'rc=$?; if [[ -z $FINAL", "mktemp -d >/dev/null\ntrap 'rc=$?; if [[ -z $FINAL");
        const r = run(p, ['--node', f.path, '--max', 'add=6', ...NV, DRIVER], { env: cleanEnv({ TMPDIR: tmp, ...sh.env }) });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(sh.paths().filter((x) => existsSync(x)).length >= 1, 'shim saw no leaked path');
        if (process.platform === 'darwin' && sh.real === '/usr/bin/mktemp') assert.deepEqual(readdirSync(tmp), []);
    } finally { for (const x of sh.paths()) rmSync(x, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); }
});

test('bytecode-budget --out DIR: report.txt + raw/ with exactly 6 files (3 fns x 2 runs)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const f = fakeNode(dir);
        // NODE_OPTIONS set: the fake node exits 7 if the script leaks it into a probe (teeth for `env -u` in the --out path)
        const r = run(SCRIPT, ['--node', f.path, '--max', 'add=6,mid=211,dup=19', ...NV, '--out', out, DRIVER], { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(existsSync(join(out, 'report.txt')));
        assert.equal(readdirSync(join(out, 'raw')).length, 6);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});

// ---- A5: live rows on the real node (read-only driver) ----
const LIVE = process.version === 'v26.8.2';
const liveSkip = skip || false;
test('bytecode-budget live: add=6,mid=211,dup=19 within on v26.8.2 (else NO-VERDICT 2)', { skip: liveSkip }, () => {
    const r = run(SCRIPT, ['--node', process.execPath, '--max', 'add=6,mid=211,dup=19', ...NV, DRIVER]);
    assert.equal(r.status, LIVE ? 0 : 2, r.stdout + r.stderr);
    if (!LIVE) assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
});
test('bytecode-budget live: mid=210 is OVER on v26.8.2 (else NO-VERDICT 2)', { skip: liveSkip }, () => {
    const r = run(SCRIPT, ['--node', process.execPath, '--max', 'add=6,mid=210,dup=19', ...NV, DRIVER]);
    assert.equal(r.status, LIVE ? 1 : 2, r.stdout + r.stderr);
    if (!LIVE) assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
});

// =====================================================================================================
// ---- P2G2 diff mode (--diff --fn LIST BEFORE AFTER). Oracle: .handoff/PLAN-phase2-g2.md A1 + ASSERTIONS A2-A5.
// The diff fake node answers --version / --v8-options like fakeNode, and serves a bytecode call from the
// capture "<fn with spaces -> ->.txt" in its CWD (the probe cds into the driver directory), so the
// BEFORE and AFTER driver directories can print different lengths. A fn with no capture file prints nothing
// (zero matches). Expected verdicts come from the plan, not from a run.
// =====================================================================================================
const BASE_COMMIT = '6bda2c8'; // its bytecode-budget.sh is a26e9f15, the last build without --diff
// CI=true (GitHub Actions): a history row whose commit is missing FAILS instead of skipping; locally it skips with
// the reason. One spelling for every history row of this file.
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (have) => { if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`); };
const baseSrc = spawnSync('git', ['-C', join(HERE, '..'), 'show', `${BASE_COMMIT}:bytecode-budget.sh`]);
const haveBase = baseSrc.status === 0 ? true : `git show ${BASE_COMMIT}:bytecode-budget.sh failed (shallow clone or no git)`;
let FROZEN_BASE = null;
if (haveBase === true) {
    assert.equal(createHash('sha256').update(baseSrc.stdout).digest('hex').slice(0, 8), 'a26e9f15', 'teeth base is not a26e9f15');
    const bd = mkdtempSync(join(tmpdir(), 'bb-base-'));
    FROZEN_BASE = join(bd, 'bytecode-budget.sh');
    writeFileSync(FROZEN_BASE, baseSrc.stdout); chmodSync(FROZEN_BASE, 0o755);
    after(() => rmSync(bd, { recursive: true, force: true }));
}

function capture(fn, lens) {
    return lens.map((n) => `[generated bytecode for function: ${fn} (0x1 <SharedFunctionInfo ${fn}>)]\nBytecode length: ${n}\nParameter count 1\n`).join('');
}
// spec: { before: { fn: [lens] }, after: { fn: [lens] } } -> dirs b/ and a/ each with driver.mjs + captures
function diffSetup(spec) {
    const dir = mkdtempSync(join(tmpdir(), 'bb-diff-'));
    const log = join(dir, 'argv.log');
    const sh = `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) [ -z "\${NODE_OPTIONS+x}" ] || exit 7; echo v26.8.2; exit 0 ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
[ -z "\${NODE_OPTIONS+x}" ] || exit 7
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
f=$(printf '%s' "$fn" | tr ' ' '-')
k=$(( $(cat "./.$f.k" 2>/dev/null || echo 0) + 1 )); echo "$k" > "./.$f.k"
if [ -f "./$f.$k.txt" ]; then cat "./$f.$k.txt"; elif [ -f "./$f.txt" ]; then cat "./$f.txt"; fi
exit 0
`;
    const node = join(dir, 'node');
    writeFileSync(node, sh); chmodSync(node, 0o755);
    for (const [side, key] of [['b', 'before'], ['a', 'after']]) {
        mkdirSync(join(dir, side));
        writeFileSync(join(dir, side, 'driver.mjs'), `// ${side} driver (fake node never runs it)\n`);
        for (const [fn, lens] of Object.entries(spec[key] || {})) writeFileSync(join(dir, side, `${fn.replace(/ /g, '-')}.txt`), capture(fn, lens));
        for (const [fn, lens] of Object.entries(spec[key + 'Run2'] || {})) writeFileSync(join(dir, side, `${fn.replace(/ /g, '-')}.2.txt`), capture(fn, lens));
    }
    return {
        dir, node, B: join(dir, 'b', 'driver.mjs'), A: join(dir, 'a', 'driver.mjs'),
        spawns: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
        done: () => rmSync(dir, { recursive: true, force: true }),
    };
}
function diffRun(spec, fns, script = SCRIPT, extra = [], ropts = {}) {
    const s = diffSetup(spec);
    try {
        const r = run(script, ['--diff', '--node', s.node, '--fn', fns, '--runs', '2', ...extra, s.B, s.A], ropts);
        return { r, spawns: s.spawns() };
    } finally { s.done(); }
}
const same = (fn, l) => ({ before: { [fn]: l }, after: { [fn]: l } });

// ---- A2 rows: [name, spec, fns, exit, regex, mutant-that-must-be-red] ----
const DIFF_ROWS = [
    ['mid 211|211 -> 0 SAME', { before: { mid: [211] }, after: { mid: [211] } }, 'mid', 0, /^VERDICT SAME$/m],
    ['mid 211|212 -> 1 DIFF with "before=1 after=0  211"', { before: { mid: [211] }, after: { mid: [212] } }, 'mid', 1, /^    before=1 after=0  211$/m],
    ['dup 6,19|19,6 -> 0 SAME (order-free; red on M1)', { before: { dup: [6, 19] }, after: { dup: [19, 6] } }, 'dup', 0, /dup: SAME/],
    ['6|6,6 -> 1 DIFF (multiplicity; red on M2)', { before: { dup: [6] }, after: { dup: [6, 6] } }, 'dup', 1, /dup: DIFF/],
    ['after count 0 -> 2 "after: no function named" (red on M3)', { before: { mid: [211] }, after: {} }, 'mid', 2, /mid: NO-VERDICT -- after: no function named/],
    ['before count 0 -> 2 "before: no function named"', { before: {}, after: { mid: [211] } }, 'mid', 2, /mid: NO-VERDICT -- before: no function named/],
    ['mid DIFF + lazy NO-VERDICT -> 2 (red on M4)', { before: { mid: [211] }, after: { mid: [212] } }, 'mid,lazy', 2, /VERDICT NO-VERDICT$/m],
    ['after run 2 differs -> 2 "after: null control" (red on M5)', { before: { mid: [211] }, after: { mid: [211] }, afterRun2: { mid: [212] } }, 'mid', 2, /^  mid: NO-VERDICT -- after: null control: run 2 /m],
    ['before run 2 differs -> 2 "before: null control" (red on M6)', { before: { mid: [211] }, after: { mid: [211] }, beforeRun2: { mid: [212] } }, 'mid', 2, /^  mid: NO-VERDICT -- before: null control: run 2 /m],
];
for (const [name, spec, fns, code, re] of DIFF_ROWS) {
    test(`bytecode-budget diff (fake node): ${name}`, { skip }, () => {
        const { r } = diffRun(spec, fns);
        assert.equal(r.status, code, r.stdout + r.stderr);
        assert.match(r.stdout, re);
    });
    test(`bytecode-budget diff teeth: [${name}] exits 2 "unknown option --diff" on the frozen a26e9f15 base`, { skip: skip || histSkip(haveBase) }, () => {
        histGate(haveBase);
        const { r } = diffRun(spec, fns, FROZEN_BASE);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.ok((r.stdout + r.stderr).includes('unknown option --diff'), r.stdout + r.stderr);
    });
}
test('bytecode-budget diff: header lines name before / after with sha256/8 and mode diff', { skip }, () => {
    const { r } = diffRun(same('mid', [211]), 'mid');
    assert.match(r.stdout, /^before  \S+\/b\/driver\.mjs  sha256\/8 [0-9a-f]{8}$/m);
    assert.match(r.stdout, /^after   \S+\/a\/driver\.mjs  sha256\/8 [0-9a-f]{8}$/m);
    assert.match(r.stdout, /^mode    diff  runs 2 /m);
    assert.match(r.stdout, /^  mid: before 1 match\(es\): 211$/m);
    assert.match(r.stdout, /^  mid: after  1 match\(es\): 211$/m);
});

// Regression pins (green on the frozen base too, not red by design): 2 DRIVERs without --diff, gate --out raw/ 6 files.
// ---- A2 mutants of the BUILT file (each anchor exactly once; variant() asserts that) ----
const DIFF_MUTANTS = [
    ['M1-order-sensitive', 'if [[ "$MSB" == "$MSA" ]]; then', 'if [[ "$LB" == "$LA" ]]; then', 'dup 6,19|19,6 -> 0 SAME (order-free; red on M1)', 0, 1],
    ['M2-sort-u', `awk '{ print "*\\t" $0 }' | multiset; }`, `awk '{ print "*\\t" $0 }' | sort -u; }`, '6|6,6 -> 1 DIFF (multiplicity; red on M2)', 1, 0],
    ['M3-after-not-judged', 'judge "$fn" "" "${RA[@]}"; VA=$JV; WA=$JWHY', 'VA=$VB; WA=$WB', 'after count 0 -> 2 "after: no function named" (red on M3)', 2, 1],
    ['M4-diff-before-noverdict', 'if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT', 'if [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF', 'mid DIFF + lazy NO-VERDICT -> 2 (red on M4)', 2, 1],
    ['M5-after-null-control-off', 'judge "$fn" "" "${RA[@]}"; VA=$JV', 'judge "$fn" "" "${RA[0]}"; VA=$JV', 'after run 2 differs -> 2 "after: null control" (red on M5)', 2, 0],
    ['M6-before-null-control-off', 'judge "$fn" "" "${RB[@]}"; VB=$JV', 'judge "$fn" "" "${RB[0]}"; VB=$JV', 'before run 2 differs -> 2 "before: null control" (red on M6)', 2, 0],
];
for (const [mname, from, to, rowName, good, want] of DIFF_MUTANTS) {
    test(`bytecode-budget diff MUTANT ${mname}: its row turns red`, { skip }, () => {
        const row = DIFF_ROWS.find((x) => x[0] === rowName);
        const dir = mkdtempSync(join(tmpdir(), `bb-${mname}-`));
        try {
            const p = variant(dir, mname, from, to);
            const ok = diffRun(row[1], row[2]);
            assert.equal(ok.r.status, good, 'unmutated row must pass first: ' + ok.r.stdout + ok.r.stderr);
            const bad = diffRun(row[1], row[2], p);
            assert.equal(bad.r.status, want, `mutant ${mname} must exit ${want}: ` + bad.r.stdout + bad.r.stderr);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
test('bytecode-budget diff control: a copy without the diff branch FINAL=1 turns the DIFF row into exit 2', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-nofinal-'));
    try {
        const p = variant(dir, 'diff-no-final', 'FINAL=1; case "$VERDICT" in SAME)', 'case "$VERDICT" in SAME)');
        const { r } = diffRun({ before: { mid: [211] }, after: { mid: [212] } }, 'mid', p);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.ok(r.stderr.includes('unexpected error (exit 1)'), r.stdout + r.stderr);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- A3: spawn budget + refusals (0 spawns) ----
test('bytecode-budget diff: --fn add,mid,dup x 2 runs = exactly 15 node spawns (1 version + 1 allowlist + 1 limits + 12 probes)', { skip }, () => {
    const spec = { before: { add: [6], mid: [211], dup: [6, 19] }, after: { add: [6], mid: [211], dup: [6, 19] } };
    // NODE_OPTIONS set: the fake exits 7 on any call if the script leaks it
    const { r, spawns } = diffRun(spec, 'add,mid,dup', SCRIPT, [], { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(spawns.length, 15, spawns.join('\n'));
    assert.deepEqual(spawns.slice(0, 3), ['--version', '--v8-options', '--v8-options']);
    assert.equal(spawns.filter((l) => l.includes('--print-bytecode-filter=')).length, 12);
});
const DIFF_REFUSALS = [
    ['--diff with --max', (s) => ['--diff', '--max', 'add=6', ...NV, s.B, s.A], 'exclusive'],
    ['--diff with 1 DRIVER', (s) => ['--diff', '--fn', 'add', s.B], 'exactly two DRIVER'],
    ['--diff with 3 DRIVERs', (s) => ['--diff', '--fn', 'add', s.B, s.A, s.A], 'exactly two DRIVER'],
    ['--diff=x', (s) => ['--diff=x', '--fn', 'add', s.B, s.A], 'takes no value'],
    ['--self-test --diff', () => ['--self-test', '--diff'], '--self-test takes only --fixtures DIR'],
    ['--diff --diff', (s) => ['--diff', '--diff', '--fn', 'add', s.B, s.A], 'given twice'],
    ['2 DRIVERs without --diff', (s) => ['--fn', 'add', s.B, s.A], 'need exactly one DRIVER'],
];
for (const [name, mk, msg] of DIFF_REFUSALS) {
    test(`bytecode-budget diff refusal: ${name} -> exit 2, "${msg}", 0 spawns`, { skip }, () => {
        const s = diffSetup({ before: {}, after: {} });
        try {
            const args = mk(s);
            const pre = args.includes('--self-test') ? [] : ['--node', s.node];
            const r = run(SCRIPT, [...pre, ...args], { env: { ...process.env, PATH: s.dir + ':' + process.env.PATH } });
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.ok((r.stdout + r.stderr).includes(msg), `expected "${msg}" in:\n${r.stdout}${r.stderr}`);
            assert.equal(s.spawns().length, 0, s.spawns().join('\n'));
        } finally { s.done(); }
    });
}
test('bytecode-budget diff MUTANT: deleting the --diff/--max exclusion check lets it spawn (its refusal row goes red)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-nomax-'));
    const s = diffSetup({ before: same('add', [6]).before, after: same('add', [6]).after });
    try {
        const p = variant(dir, 'diff-max-check-off', '[[ $DIFFMODE == 0 || -z "$MAXLIST" ]] ||', 'true ||');
        const r = run(p, ['--diff', '--node', s.node, '--max', 'add=6', ...NV, s.B, s.A]);
        assert.ok(s.spawns().length > 0, 'mutant still refused before any spawn: ' + r.stdout + r.stderr);
    } finally { s.done(); rmSync(dir, { recursive: true, force: true }); }
});

// ---- A4: retention ----
// The diff path never calls mktemp either (only --self-test does): the shim log must stay empty.
test('bytecode-budget diff: 20 runs without --out leave 0 new entries in a private TMPDIR and cwd, no mktemp', { skip }, () => {
    const s = diffSetup(same('add', [6]));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-dtmp-'));
    const cwd = mkdtempSync(join(tmpdir(), 'bb-dcwd-'));
    const shd = mkdtempSync(join(tmpdir(), 'bb-dshim-'));   // shim files live outside TMPDIR and cwd
    try {
        const sh = mktempShim(shd);
        for (let i = 0; i < 20; i++) {
            const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A], { env: cleanEnv({ TMPDIR: tmp, ...sh.env }), cwd });
            assert.equal(r.status, 0, r.stdout + r.stderr);
        }
        assert.deepEqual(readdirSync(tmp), []);
        assert.deepEqual(readdirSync(cwd), []);
        assert.deepEqual(sh.paths(), []);
    } finally { s.done(); rmSync(tmp, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true }); rmSync(shd, { recursive: true, force: true }); }
});
test('bytecode-budget diff: mutant with a leaked bare mktemp -d is caught by the shim (TMPDIR is blind on macOS)', { skip }, () => {
    const s = diffSetup(same('add', [6]));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-dtmp-'));
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    let sh = { paths: () => [] };
    try {
        sh = mktempShim(dir);
        const p = variant(dir, 'diff-leak-mktemp', "trap 'rc=$?; if [[ -z $FINAL", "mktemp -d >/dev/null\ntrap 'rc=$?; if [[ -z $FINAL");
        const r = run(p, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A], { env: cleanEnv({ TMPDIR: tmp, ...sh.env }) });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(sh.paths().filter((x) => existsSync(x)).length >= 1, 'shim saw no leaked path');
        if (process.platform === 'darwin' && sh.real === '/usr/bin/mktemp') assert.deepEqual(readdirSync(tmp), []);
    } finally { for (const x of sh.paths()) rmSync(x, { recursive: true, force: true }); s.done(); rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); }
});
test('bytecode-budget diff --out: report.txt + raw/before 6 files + raw/after 6 files (3 fns x 2 runs)', { skip }, () => {
    const l = { add: [6], mid: [211], dup: [6, 19] };
    const s = diffSetup({ before: l, after: l });
    const out = join(mkdtempSync(join(tmpdir(), 'bb-dout-')), 'o');
    try {
        const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add,mid,dup', '--runs', '2', '--out', out, s.B, s.A], { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(existsSync(join(out, 'report.txt')));
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['after', 'before']);
        assert.deepEqual(readdirSync(join(out, 'raw', 'before')).sort(), ['add.1.txt', 'add.2.txt', 'dup.1.txt', 'dup.2.txt', 'mid.1.txt', 'mid.2.txt']);
        assert.deepEqual(readdirSync(join(out, 'raw', 'after')).sort(), ['add.1.txt', 'add.2.txt', 'dup.1.txt', 'dup.2.txt', 'mid.1.txt', 'mid.2.txt']);
    } finally { s.done(); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget gate --out still writes exactly 6 files directly under raw/ (no before/after dirs)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--max', 'add=6,mid=211,dup=19', ...NV, '--out', out, DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['add.1.txt', 'add.2.txt', 'dup.1.txt', 'dup.2.txt', 'mid.1.txt', 'mid.2.txt']);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});

// ---- B1 reviewer FILLER: a fn with a space ("get value") -> raw name with "-" ----
test('bytecode-budget --out --fn "get value": report mode writes raw/get-value.1.txt', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const f = fakeNode(dir);   // maps a fn with a space to the fixture get-value.txt
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'get value', '--out', out, DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['get-value.1.txt', 'get-value.2.txt']);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget --out --fn "get value": diff mode writes raw/before|after/get-value.1.txt', { skip }, () => {
    const s = diffSetup(same('get value', [8]));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'get value', '--runs', '2', '--out', out, s.B, s.A]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(readdirSync(join(out, 'raw', 'before')).sort(), ['get-value.1.txt', 'get-value.2.txt']);
        assert.deepEqual(readdirSync(join(out, 'raw', 'after')).sort(), ['get-value.1.txt', 'get-value.2.txt']);
    } finally { s.done(); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget MUTANT raw name without the space->dash: report-mode "get value" row goes red', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-mraw-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    const fd = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    try {
        const p = variant(dir, 'raw-keeps-space', '"${fn// /-}.$k.txt"', '"${fn}.$k.txt"');
        const f = fakeNode(fd);
        run(p, ['--node', f.path, '--fn', 'get value', '--out', out, DRIVER]);
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['get value.1.txt', 'get value.2.txt']);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fd, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget MUTANT diff raw name without the space->dash: diff-mode "get value" row goes red', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-mraw-'));
    const s = diffSetup(same('get value', [8]));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const p = variant(dir, 'diff-raw-keeps-space', 'r="${fn// /-}"; RB=()', 'r="${fn}"; RB=()');
        run(p, ['--diff', '--node', s.node, '--fn', 'get value', '--runs', '2', '--out', out, s.B, s.A]);
        assert.deepEqual(readdirSync(join(out, 'raw', 'before')).sort(), ['get value.1.txt', 'get value.2.txt']);
    } finally { s.done(); rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});

// ---- A5: live diff rows on the real node (driver vs itself; vs a copy with one single-match edit) ----
test('bytecode-budget live diff: driver vs itself -> 0 SAME on v26.8.2 (else NO-VERDICT 2)', { skip: liveSkip }, () => {
    const r = run(SCRIPT, ['--diff', '--node', process.execPath, '--fn', 'add,mid,dup', ...NV, DRIVER, DRIVER]);
    assert.equal(r.status, LIVE ? 0 : 2, r.stdout + r.stderr);
    if (LIVE) assert.match(r.stdout, /^VERDICT SAME$/m); else assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
});
test('bytecode-budget live diff: driver vs a copy with mid made longer (k: s - n, j: s + n) -> 1 DIFF', { skip: liveSkip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-live-'));
    try {
        const src = readFileSync(DRIVER, 'utf8');
        const from = 'k: s - n', n = src.split(from).length - 1;
        assert.equal(n, 1, `edit anchor must match exactly once, matched ${n}`);
        const edited = join(dir, 'driver.mjs');
        writeFileSync(edited, src.replace(from, () => 'k: s - n, j: s + n'));
        const r = run(SCRIPT, ['--diff', '--node', process.execPath, '--fn', 'mid', ...NV, DRIVER, edited]);
        assert.equal(r.status, LIVE ? 1 : 2, r.stdout + r.stderr);
        if (LIVE) assert.match(r.stdout, /mid: DIFF/); else assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- B2: self-test diff checks (mutants of the built file; FAIL substrings from the B2 report) ----
const ST_MUTANTS = [
    ['st-M1', 'if [[ "$MSB" == "$MSA" ]]; then', 'if [[ "$LB" == "$LA" ]]; then', 'a length multiset is order-free'],
    ['st-M2', `awk '{ print "*\\t" $0 }' | multiset; }`, `awk '{ print "*\\t" $0 }' | sort -u; }`, 'a length multiset counts duplicates'],
    ['st-M3', 'judge "$fn" "" "${RA[@]}"; VA=$JV; WA=$JWHY', 'VA=$VB; WA=$WB', 'each side is judged'],
    ['st-M4', 'if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT', 'if [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF', 'worst() over fns'],
    ['st-F', 'FINAL=1; case "$VERDICT" in SAME)', 'case "$VERDICT" in SAME)', 'diff (fake node): mid 211 | 212 -> exit 1 DIFF'],
    // F1-b: the diff M5 mutant (after side judged on run 1 only) now turns --self-test red too
    ['st-M5', 'judge "$fn" "" "${RA[@]}"; VA=$JV', 'judge "$fn" "" "${RA[0]}"; VA=$JV', 'each side keeps its null control'],
    // F1-r2: the mirror M6 mutant (before side judged on run 1 only)
    ['st-M6', 'judge "$fn" "" "${RB[@]}"; VB=$JV', 'judge "$fn" "" "${RB[0]}"; VB=$JV', 'each side keeps its null control (before'],
];
for (const [name, from, to, failing] of ST_MUTANTS) {
    test(`bytecode-budget --self-test MUST FAIL on mutant ${name}`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), `bb-${name}-`));
        try {
            const r = run(variant(dir, name, from, to), ['--self-test']);
            assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
            assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes(failing)), `expected FAIL naming "${failing}"\n${r.stdout}`);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// ---- B2: an unreadable DRIVER is refused before any spawn (red on the B1 build, which spawned) ----
const rootUid = typeof process.getuid === 'function' && process.getuid() === 0;
test('bytecode-budget: an unreadable DRIVER (chmod 000) is refused, exit 2, 0 spawns (report and diff mode)', { skip: skip || (rootUid ? 'uid 0 ignores file modes' : false) }, () => {
    const s = diffSetup(same('add', [6]));
    try {
        chmodSync(s.B, 0o000);
        const rep = run(SCRIPT, ['--node', s.node, '--fn', 'add', s.B]);
        assert.equal(rep.status, 2, rep.stdout + rep.stderr);
        assert.ok((rep.stdout + rep.stderr).includes('DRIVER not found (or not a readable file)'), rep.stdout + rep.stderr);
        const bef = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A]);
        assert.equal(bef.status, 2, bef.stdout + bef.stderr);
        assert.ok((bef.stdout + bef.stderr).includes('DRIVER (before) not found (or not a readable file)'), bef.stdout + bef.stderr);
        chmodSync(s.B, 0o644); chmodSync(s.A, 0o000);
        const aft = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A]);
        assert.equal(aft.status, 2, aft.stdout + aft.stderr);
        assert.ok((aft.stdout + aft.stderr).includes('DRIVER (after) not found (or not a readable file)'), aft.stdout + aft.stderr);
        assert.equal(s.spawns().length, 0, s.spawns().join('\n'));
    } finally { try { chmodSync(s.B, 0o644); chmodSync(s.A, 0o644); } catch {} s.done(); }
});

// ---- F1-a: a Bytecode length of 10+ digits is an unknown format (NO-VERDICT), never a length. awk doubles lose
// precision past 2^53 and bash (( )) wraps past 2^63, so the 686de5bf build read 2^53 | 2^53+1 as SAME and gated
// 2^63 / 2^64+1 against max 6 as WITHIN. N has 1..9 digits (< 10^9: exact in awk doubles and bash (( )); real V8
// lengths are far smaller), so a longer N is NO-VERDICT: 9 digits (999999999) are still a length.
// Each row is red on 686de5bf (`git show 50a1879:bytecode-budget.sh`, the last build without the cap) and on the
// off-by-one mutants (<= 8 refuses 999999999, <= 10 accepts 1000000000).
// =====================================================================================================
const CAP_COMMIT = '50a1879';
const capSrc = spawnSync('git', ['-C', join(HERE, '..'), 'show', `${CAP_COMMIT}:bytecode-budget.sh`]);
const haveCap = capSrc.status === 0 ? true : `git show ${CAP_COMMIT}:bytecode-budget.sh failed (shallow clone or no git)`;
let CAP_BASE = null;
if (haveCap === true) {
    assert.equal(createHash('sha256').update(capSrc.stdout).digest('hex').slice(0, 8), '686de5bf', 'cap base is not 686de5bf');
    const cd = mkdtempSync(join(tmpdir(), 'bb-capbase-'));
    CAP_BASE = join(cd, 'bytecode-budget.sh');
    writeFileSync(CAP_BASE, capSrc.stdout); chmodSync(CAP_BASE, 0o755);
    after(() => rmSync(cd, { recursive: true, force: true }));
}
const UNKNOWN = (side) => new RegExp(`^  mid: NO-VERDICT -- ${side}1 of 1 matched header\\(s\\) not followed by 'Bytecode length: N' in run 1 \\(unknown format\\)$`, 'm');
// report / gate run the BEFORE driver of a diffSetup tree (the probe cds there, so the fake node serves its capture)
function capRun(script, mode, lens, extra = []) {
    const spec = mode === 'diff' ? { before: { mid: lens[0] }, after: { mid: lens[1] } } : { before: { mid: lens } };
    const s = diffSetup(spec);
    try {
        const args = mode === 'diff' ? ['--diff', '--fn', 'mid', s.B, s.A] : mode === 'gate' ? ['--max', extra[0], ...NV, s.B] : ['--fn', 'mid', s.B];
        return run(script, ['--node', s.node, ...args]);
    } finally { s.done(); }
}
const CAP_ROWS = [
    ['report: 999999999 -> 0 REPORTED; 1000000000 and 2^53+1 -> 2 NO-VERDICT unknown format', (script) => {
        let r = capRun(script, 'report', [999999999]);
        assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /^  mid: 1 match\(es\): 999999999$/m);
        for (const L of ['1000000000', '9007199254740993']) {
            r = capRun(script, 'report', [L]);
            assert.equal(r.status, 2, `L=${L}: ` + r.stdout + r.stderr); assert.match(r.stdout, UNKNOWN('')); assert.match(r.stdout, /^VERDICT NO-VERDICT$/m);
        }
    }],
    ['gate: 999999999 vs max 999999999 -> 0 WITHIN; 1000000000 vs 999999999, 2^63 and 2^64+1 vs 6 -> 2 NO-VERDICT unknown format', (script) => {
        let r = capRun(script, 'gate', [999999999], ['mid=999999999']);
        assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /^VERDICT WITHIN$/m);
        for (const [L, max] of [['1000000000', 'mid=999999999'], ['9223372036854775808', 'mid=6'], ['18446744073709551617', 'mid=6']]) {
            r = capRun(script, 'gate', [L], [max]);
            assert.equal(r.status, 2, `L=${L}: ` + r.stdout + r.stderr); assert.match(r.stdout, UNKNOWN('')); assert.match(r.stdout, /^VERDICT NO-VERDICT$/m);
        }
    }],
    ['diff: 999999998|999999999 -> 1 DIFF; 999999999|1000000000 -> 2 after only; 2^53|2^53+1 -> 2 both sides', (script) => {
        let r = capRun(script, 'diff', [[999999998], [999999999]]);
        assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^    before=0 after=1  999999999$/m);
        r = capRun(script, 'diff', [[999999999], ['1000000000']]);
        assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stdout, UNKNOWN('after: ')); assert.doesNotMatch(r.stdout, / -- before: /);
        r = capRun(script, 'diff', [['9007199254740992'], ['9007199254740993']]);
        assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stdout, UNKNOWN('before: ')); assert.match(r.stdout, UNKNOWN('after: '));
    }],
];
for (const [name, body] of CAP_ROWS) {
    test(`bytecode-budget length cap ${name}`, { skip }, () => body(SCRIPT));
    test(`bytecode-budget length cap teeth: [${name}] is red on the 686de5bf build (no cap)`, { skip: skip || histSkip(haveCap) }, () => {
        histGate(haveCap);
        assert.throws(() => body(CAP_BASE), redNotTimeout);
    });
    for (const [mname, to] of [['cap-8', 'length($3) <= 8'], ['cap-10', 'length($3) <= 10']]) {
        test(`bytecode-budget length cap MUTANT ${mname}: [${name}] goes red`, { skip }, () => {
            const dir = mkdtempSync(join(tmpdir(), `bb-${mname}-`));
            try { const p = variant(dir, mname, 'length($3) <= 9', to); assert.throws(() => body(p), redNotTimeout); }
            finally { rmSync(dir, { recursive: true, force: true }); }
        });
    }
}

// =====================================================================================================
// U3 B2 (b56; PLAN-b52-ibd-u3 task 4, ASSERTIONS 1 / 3 / 4 / 5): BYTECODE_AWK prints `?` on a glued header or an orphan
// length (R1-R3), the shared v8limits read strips NODE_OPTIONS and NODE_COMPILE_CACHE (R6), ibd e2e (R5). BYTECODE_AWK is
// read from BOTH roots and fed on stdin. Expected values come from the plan, never from a run of the new code:
// R1 / R2 / R3 / R1b -> `?`; R4 parity controls -> `285,500` / `285` / empty; the 96baf24 roots print `285` for R1-R3.
// DEVIATION (R1b): with the orphan rule, `H L285 'step 'H L500` is `?` even when the glued rule is absent (L500 is an
// orphan), so R1 alone cannot kill glued-off; R1b = `H L285 'step 'H` (no length after the glued header) does.
// =====================================================================================================
import { probeAwk, buildNulCutAwk, buildNulCleanAwk, nulTmpDir } from './nul-awk.mjs';
const IBD = join(HERE, '..', 'inlining-budget-diff.sh');
const U3_COMMIT = '96baf24';   // the build before U3 (96baf24 also predates U1 and U2); reachable: histSkip pattern, fatal under CI=true
const U3_POSTU1 = '1dcc146';   // post-U1, pre-B1 (on origin/main): its ibd root measures 9 spawns too
const U3_ROOTS = [['bb', SCRIPT, 'bytecode-budget.sh'], ['ibd', IBD, 'inlining-budget-diff.sh']];
const u3Old = {};
let haveU3 = true;
const u3Git = (file) => spawnSync('git', ['-C', join(HERE, '..'), 'show', `${U3_COMMIT}:${file}`]);
for (const [, , file] of U3_ROOTS) {
    if (u3Git(file).status !== 0) { haveU3 = `git show ${U3_COMMIT}:${file} failed (shallow clone or no git)`; break; }
}
if (haveU3 === true) {
    const od = mkdtempSync(join(tmpdir(), 'bbu3-old-'));
    for (const [nm, , file] of U3_ROOTS) { u3Old[nm] = join(od, file); writeFileSync(u3Old[nm], u3Git(file).stdout); chmodSync(u3Old[nm], 0o755); }
    after(() => rmSync(od, { recursive: true, force: true }));
}
// env for the U3 rows: harness editor / node vars dropped (also $NODE, which roots read), THEN `extra` applied
function u3Env(extra = {}) {
    const e = { ...process.env };
    for (const k of ['GIT_EDITOR', 'EDITOR', 'VISUAL', 'NODE_OPTIONS', 'NODE', 'NODE_COMPILE_CACHE']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // node re-adds a deleted NODE_V8_COVERAGE; undefined strips it
    return { ...e, ...extra };
}
// the host-awk NUL shims, built lazily (perl needed): BSD-cut and NUL-clean-emulated, each first on PATH
let u3Nul = null;
function nulEnvs() {
    if (u3Nul) return u3Nul;
    const base = u3Env({ LC_ALL: 'C' });
    const dd = nulTmpDir('bbu3-nul-');
    mkdirSync(join(dd, 'cut')); mkdirSync(join(dd, 'emu'));
    probeAwk(base);   // fail closed: throws on an unreadable host awk
    const emu = buildNulCleanAwk(join(dd, 'emu'), base);
    const emuEnv = { ...base, PATH: emu.dir + ':' + base.PATH };
    const cut = buildNulCutAwk(join(dd, 'cut'), base);
    u3Nul = { cut: { ...base, PATH: cut.dir + ':' + base.PATH }, emu: emuEnv };
    return u3Nul;
}
// BYTECODE_AWK program text of a root (between the BYTECODE_AWK=' line and the next line that is a lone quote)
function bytecodeAwk(root) {
    const m = /^BYTECODE_AWK='\n([\s\S]*?)\n'$/m.exec(readFileSync(root, 'utf8'));
    assert.ok(m, `${root}: no BYTECODE_AWK block`);
    return m[1];
}
const BC_H = '[generated bytecode for function: f (0x1 <SharedFunctionInfo f>)]';
const BC_L = (n) => `Bytecode length: ${n}`;
function awkOut(root, lines, env = u3Env()) {
    const r = capSync('awk', ['-v', 'fn=f', bytecodeAwk(root)], { input: lines.join('\n') + '\n', encoding: 'utf8', env }, 30000, 'BYTECODE_AWK');
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
}
const U3_ROWS = {
    R1: (root) => assert.equal(awkOut(root, [BC_H, BC_L(285), 'step ' + BC_H, BC_L(500)]), '?\n', 'R1: a header glued after text -> ?'),
    R1b: (root) => assert.equal(awkOut(root, [BC_H, BC_L(285), 'step ' + BC_H]), '?\n', 'R1b: a trailing glued header with no length -> ?'),
    R2: (root) => assert.equal(awkOut(root, [BC_H, BC_L(285), 'x', BC_L(500)]), '?\n', 'R2: an orphan length -> ?'),
    // R3: BSD awk (record cut at NUL) -> the glued header is lost and L500 is an orphan; NUL-clean -> glued. Both `?`.
    R3: (root) => {
        const lines = [BC_H, BC_L(285), 'x\0' + BC_H, BC_L(500)], n = nulEnvs();
        assert.equal(awkOut(root, lines), '?\n', 'R3: host awk');
        assert.equal(awkOut(root, lines, n.cut), '?\n', 'R3: BSD-cut awk shim (orphan)');
        assert.equal(awkOut(root, lines, n.emu), '?\n', 'R3: NUL-clean awk emulation (glued)');
    },
    R4: (root) => {   // parity controls: the same on the 96baf24 root and the new one
        assert.equal(awkOut(root, [BC_H, BC_L(285), BC_H, BC_L(500)]), '285,500\n', 'R4a: two clean functions');
        assert.equal(awkOut(root, [BC_H, 'Parameter count 1', BC_L(285)]), '285\n', 'R4b: a Parameter count line between header and length');
        assert.equal(awkOut(root, ['Parameter count 1']), '\n', 'R4c: no header -> empty');
    },
};
for (const [nm, root] of U3_ROOTS) {
    for (const id of Object.keys(U3_ROWS)) {
        test(`bytecode-budget U3 ${id} (${nm} root): BYTECODE_AWK ${id === 'R4' ? 'parity controls hold' : 'prints exactly ?'}`, { skip }, () => U3_ROWS[id](root));
    }
}
// old code (96baf24): R1 / R1b / R2 / R3 print 285 (red on the old build); R4 parity holds on both
for (const [nm] of U3_ROOTS) {
    test(`bytecode-budget U3 old ${nm} root (96baf24): R1 / R1b / R2 / R3 print 285 (the glued / orphan text is ignored), R4 parity holds`, { skip: skip || histSkip(haveU3) }, () => {
        histGate(haveU3);
        const n = nulEnvs(), o = u3Old[nm];
        assert.equal(awkOut(o, [BC_H, BC_L(285), 'step ' + BC_H, BC_L(500)]), '285\n');
        assert.equal(awkOut(o, [BC_H, BC_L(285), 'step ' + BC_H]), '285\n');
        assert.equal(awkOut(o, [BC_H, BC_L(285), 'x', BC_L(500)]), '285\n');
        for (const env of [u3Env(), n.cut, n.emu]) assert.equal(awkOut(o, [BC_H, BC_L(285), 'x\0' + BC_H, BC_L(500)], env), '285\n');
        U3_ROWS.R4(o);
        for (const id of ['R1', 'R1b', 'R2', 'R3']) assert.throws(() => U3_ROWS[id](o), redNotTimeout, `${id} must be red on the old ${nm} root`);
    });
}

// ---- R5 / R6: ibd end to end with a fake node ----
const U3_FIX = join(HERE, 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const U3_TRACE = ['[compiling method 0x1 <JSFunction f (sfi = 0x2)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]',
    'Inlining 0x3 {0x4 <SharedFunctionInfo helper>} into 0x1 {0x2 <SharedFunctionInfo f>}',
    '[completed compiling 0x1 <JSFunction f (sfi = 0x2)> (target TURBOFAN_JS) - took 0.1, 0.1, 0.1 ms]'];
// fake node: -p -> a version; --v8-options -> the v26.8.2 fixture, logging BOTH vars at THAT spawn only (v8.log), exit 9 on a
// leaked NODE_OPTIONS; any other spawn exits 9 on a leaked NODE_OPTIONS, else cats its last argument (the driver file)
function u3Fake(dir) {
    const all = join(dir, 'all.log'), v8 = join(dir, 'v8.log');
    writeFileSync(join(dir, 'node'), `#!/bin/sh
echo "$*" >> ${JSON.stringify(all)}
case "$1" in
  -p) echo "v0 (V8 0)"; exit 0 ;;
  --v8-options) printf 'NODE_OPTIONS=%s NODE_COMPILE_CACHE=%s\\n' "\${NODE_OPTIONS-<unset>}" "\${NODE_COMPILE_CACHE-<unset>}" >> ${JSON.stringify(v8)}
    [ -z "\${NODE_OPTIONS+x}" ] || exit 9
    cat ${JSON.stringify(U3_FIX)}; exit 0 ;;
esac
[ -z "\${NODE_OPTIONS+x}" ] || exit 9
for a; do last="$a"; done
cat "$last"
`);
    chmodSync(join(dir, 'node'), 0o755);
    const rd = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean) : []);
    return { path: join(dir, 'node'), spawns: () => rd(all), v8: () => rd(v8) };
}
function u3Ibd(root, bytecodeBefore, extraEnv = {}) {
    const d = mkdtempSync(join(tmpdir(), 'bbu3-ibd-'));
    try {
        const f = u3Fake(d);
        for (const side of ['b', 'a']) mkdirSync(join(d, side));
        writeFileSync(join(d, 'b', 'driver.js'), [...U3_TRACE, ...bytecodeBefore].join('\n') + '\n');
        writeFileSync(join(d, 'a', 'driver.js'), [...U3_TRACE, BC_H, BC_L(285)].join('\n') + '\n');
        const r = capSync('bash', [root, '--node', f.path, '--tiers', 'turbo', '--runs', '2', '--fn', 'f', '--out', join(d, 'out'),
            join(d, 'b', 'driver.js'), join(d, 'a', 'driver.js')],
        { encoding: 'utf8', cwd: d, env: u3Env({ NODE_COMPILE_CACHE: join(d, 'cc'), ...extraEnv }) }, 120000, 'inlining-budget-diff.sh');
        return { r, out: r.stdout + r.stderr, spawns: f.spawns(), v8: f.v8() };
    } finally { rmSync(d, { recursive: true, force: true }); }
}
const U3_GLUED = [BC_H, BC_L(285), 'step ' + BC_H, BC_L(500)];
const U3_CLEAN = [BC_H, BC_L(285)];
const lineCount = (s, re) => s.split('\n').filter((l) => re.test(l)).length;
// R5: before glued -> `  f: ? -> 285`, 0 CROSSES, exit = the clean twin's (identical traces: exit 0 SAME per the ibd header)
function bodyR5(root) {
    const g = u3Ibd(root, U3_GLUED), c = u3Ibd(root, U3_CLEAN);
    assert.equal(c.r.status, 0, 'R5: clean twin exits 0 (SAME)\n' + c.out);
    assert.equal(lineCount(c.out, /^ {2}f: 285 -> 285 bytes \(\+0\)$/), 1, 'R5: clean twin line\n' + c.out);
    assert.equal(lineCount(g.out, /^ {2}f: \? -> 285$/), 1, 'R5: exactly one "  f: ? -> 285" line\n' + g.out);
    assert.equal(lineCount(g.out, /CROSSES/), 0, 'R5: 0 CROSSES\n' + g.out);
    assert.equal(g.r.status, c.r.status, 'R5: exit equal to the clean twin\n' + g.out);
}
// R6: NODE_OPTIONS=--bogus + NODE_COMPILE_CACHE set -> exit 0; EVERY --v8-options spawn (2 after U1's v8fl_read: v8fl_check +
// the v8limits read; measured 2 on this build) logs both vars unset; the fake exits 9 on a leaked NODE_OPTIONS
function bodyR6(root) {
    const x = u3Ibd(root, U3_CLEAN, { NODE_OPTIONS: '--bogus' });
    assert.equal(x.v8.length, 2, 'R6: --v8-options spawns\n' + x.out);
    for (const l of x.v8) assert.equal(l, 'NODE_OPTIONS=<unset> NODE_COMPILE_CACHE=<unset>', 'R6: a --v8-options spawn saw a leaked var\n' + x.v8.join('\n'));
    assert.equal(x.r.status, 0, 'R6: exit 0\n' + x.out);
}
test('bytecode-budget U3 R5 (ibd, fake node): a glued before header prints "  f: ? -> 285", 0 CROSSES, exit = the clean twin\'s', { skip }, () => bodyR5(IBD));
test('bytecode-budget U3 R6 (ibd, fake node): NODE_OPTIONS=--bogus + NODE_COMPILE_CACHE reach no --v8-options spawn (2 spawns, both unset), exit 0', { skip }, () => bodyR6(IBD));
test('bytecode-budget U3 old ibd root (96baf24): R5 prints "285 -> 285 bytes (+0)"; R6 is red', { skip: skip || histSkip(haveU3) }, () => {
    histGate(haveU3);
    const g = u3Ibd(u3Old.ibd, U3_GLUED);
    assert.equal(lineCount(g.out, /^ {2}f: 285 -> 285 bytes \(\+0\)$/), 1, g.out);
    assert.throws(() => bodyR6(u3Old.ibd), redNotTimeout);
    const x = u3Ibd(u3Old.ibd, U3_CLEAN, { NODE_OPTIONS: '--bogus' });
    assert.equal(x.r.status, 2, x.out);       // ASSERTIONS 3: exit 2 "unexpected error"
    assert.match(x.out, /unexpected error/, x.out);
});
// budget: the new ibd root makes 9 spawns on a 1-fn turbo run: 1 -p + 2 --v8-options (v8fl_check + the v8limits read) + 4 trace
// runs (2 sides x 2 runs) + 2 bytecode probes. The 96baf24 root predates v8fl_check: 1 --v8-options read, so 8 (U1 added the 9th).
test('bytecode-budget U3 budget: the new ibd root makes 9 spawns (1 -p, 2 --v8-options, 4 traces, 2 probes); the 96baf24 root 8', { skip: skip || histSkip(haveU3) }, () => {
    histGate(haveU3);
    assert.equal(u3Ibd(IBD, U3_CLEAN).spawns.length, 9);
    assert.equal(u3Ibd(u3Old.ibd, U3_CLEAN).spawns.length, 8);
});
const u3PostSrc = spawnSync('git', ['-C', join(HERE, '..'), 'show', `${U3_POSTU1}:inlining-budget-diff.sh`]);
const haveU3Post = u3PostSrc.status === 0 ? true : `git show ${U3_POSTU1}:inlining-budget-diff.sh failed (shallow clone or no git)`;
test('bytecode-budget U3 budget: the post-U1 pre-B1 ibd root (1dcc146) makes 9 spawns too: B1 changed no spawn count', { skip: skip || histSkip(haveU3Post) }, () => {
    histGate(haveU3Post);
    const d = mkdtempSync(join(tmpdir(), 'bbu3-post-'));
    try {
        const p = join(d, 'inlining-budget-diff.sh'); writeFileSync(p, u3PostSrc.stdout); chmodSync(p, 0o755);
        assert.equal(u3Ibd(p, U3_CLEAN).spawns.length, 9);
    } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- mutants (exact-once anchors on root copies); each must be red on its NAMED row ----
const U3_AWK_MUT = [
    ['glued-off', 'index(substr($0, 2), "[generated bytecode for function: ") { torn = 1; next }\n', '', 'R1b'],   // R3 survives by the orphan rule
    ['orphan-off', '/^Bytecode length:/ { if (!pend) torn = 1; pend = 0 }\n', '/^Bytecode length:/ { pend = 0 }\n', 'R2'],
    ['torn-print-off', 'print (torn ? "?" : out)', 'print out', 'R1'],
];
for (const [mname, from, to, row] of U3_AWK_MUT) {
    for (const [nm, root] of U3_ROOTS) {
        test(`bytecode-budget U3 MUTANT ${mname} (${nm} root): row ${row} goes red`, { skip }, () => {
            const dir = mkdtempSync(join(tmpdir(), `bbu3-${mname}-`));
            try {
                const p = variant(dir, mname, from, to, root);
                assert.throws(() => U3_ROWS[row](p), (e) => redNotTimeout(e) && e.message.includes(`${row}:`));
            } finally { rmSync(dir, { recursive: true, force: true }); }
        });
    }
}
const U3_UNSET = 'unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: no node spawn sees one\n';
const U3_LIM = 'LIMITS=$(env -u NODE_OPTIONS -u NODE_COMPILE_CACHE "$NODE_BIN" --v8-options';
for (const [mname, to] of [['limits-env-off', 'LIMITS=$(env -u NODE_COMPILE_CACHE "$NODE_BIN" --v8-options'],
    ['limits-cc-off', 'LIMITS=$(env -u NODE_OPTIONS "$NODE_BIN" --v8-options']]) {
    test(`bytecode-budget U3 MUTANT ${mname} (ibd root): row R6 goes red`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), `bbu3-${mname}-`));
        try {
            // COMPOUND on purpose: the ruled top-of-file Q-ENV `unset` makes the v8limits `env -u` redundant, so a single edit is an
            // equivalent mutant; both edits (each anchored exact-once by variant) make the leak reachable. Do not simplify back.
            const p1 = variant(dir, mname + '-1', U3_LIM, to, IBD);
            const p = variant(dir, mname, U3_UNSET, '', p1);
            assert.throws(() => bodyR6(p), (e) => redNotTimeout(e) && e.message.includes('leaked var'));
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
