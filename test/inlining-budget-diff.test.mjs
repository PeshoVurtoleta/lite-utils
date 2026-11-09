// test/inlining-budget-diff.test.mjs -- ../inlining-budget-diff.sh --self-test (canned trace text).
// No V8 spawn here (every self-test sub-run passes a fake node, or --node false, which is refused before any spawn): the real before / after trace runs are STATISTICAL / REPORTED tier and never part of
// npm test. The self-test runs the script's own awk programs and refusal paths; the must-fail rows prove
// that it has teeth (each mutant of the script must turn the self-test red).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (afterEach runs before its own
// test's report, so it would lose the last pass; proven by test/death-signature.test.mjs teeth, b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'inlining-budget-diff.sh');
const CHECKS = 54;   // every `check` call in self_test(); a new check moves this literal
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

function selfTest(path) {
    return capSync('bash', [path, '--self-test'], { encoding: 'utf8' }, 60000, 'inlining-budget-diff.sh --self-test');
}
function okCount(out) { return (out.match(/^ok {3}/gm) || []).length; }

// A copy of the script in a temp dir, with ONE exact edit (must match exactly once, else the row is invalid).
function variant(dir, name, from, to) {
    const src = readFileSync(SCRIPT, 'utf8');
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src.replace(from, () => to));
    chmodSync(p, 0o755);
    return p;
}

test('inlining-budget-diff --self-test: every check passes', { skip }, () => {
    const r = selfTest(SCRIPT);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^self-test: all checks passed$/m);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), CHECKS);
});

test('inlining-budget-diff --self-test: an unmodified copy outside the repo passes (baseline for the mutants)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ibd-base-'));
    try {
        const r = selfTest(variant(dir, 'baseline', '#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n'));
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.equal(okCount(r.stdout), CHECKS);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Mutants that survive the current self-test (no row, recorded in .handoff/NEXT.md): removing the
// `cn = ""` reset on `Budget used:` (killable by a canned multi-round check: a target with no candidate
// line after a new round) and turning lim()'s `printf -v "$1" '%s' "$v"` back into `eval "$1=\$v"`
// (equivalent: `\$v` is never parsed twice). Both leave all 54 checks green.
const MUTANTS = [
    ['multiset-sort-u', 'multiset() { sort | uniq -c; }', 'multiset() { sort -u; }',
        'multiset keeps call-site multiplicity'],
    ['budget-double-compare', 'used + int((z + e) * scale) > L', 'used + (z + e) * scale > L',
        'reserve compare truncates like V8'],
    // (TurboFan keeps no frequency in its decision lines, so dropping that gsub is an equivalent mutant;
    // dropping the address gsub is not: the canned before / after runs differ in every address.)
    ['no-turbo-address-normalize', 'gsub(/0x[0-9a-fA-F]+/, "0x", l); gsub(/#[0-9]+/, "#N", l)', 'gsub(/#[0-9]+/, "#N", l)',
        'turbo: addresses / ids / frequencies'],
    // (the tracked --before row stays green here: the tracked Watch.js beside it is refused instead)
    ['no-live-refusal', '  refuse_live "$BEFORE_FILE" "--before"\n', '',
        'a hard link to the live tracked file is refused (cwd in the repo)'],
    // no-exit-trap RETIRED (FILLERS task 4, as U2 task 5 retired M-trap-off): lib/v8limits.sh's `|| die` removed the only
    // self-test row that reached the EXIT trap, so this mutant cannot die here. test/final-trap.test.mjs carries ibd's trap
    // (A0 / A1 / A2 / A1 stderr-closed / A5: 10 rows red on a copy of the root with the trap deleted).
    ['no-watch-refusal', 'if [[ -f "$(dirname "$BEFORE_FILE")/Watch.js" ]]; then refuse_live', 'if false; then refuse_live',
        'a symlinked Watch.js beside --before is refused'],
    ['trap-ignores-final', '[[ -z $FINAL ]]', 'true',
        'a real DIFF exits 1'],
    ['no-final-before-verdict', 'FINAL=1\ncase "$VERDICT"', 'case "$VERDICT"',
        'a real DIFF exits 1'],
    ['no-after-top', '  if [[ -n "$AFTER_FILE" ]] && top_of "$(dirname -- "$AFTER_FILE")" "$f"; then t="$t$TOP_OF"$\'\\n\'; fi\n', '',
        'a hard link found through the --after repo is refused'],
    ['rel-link-unresolved', '; p="$d/$l" ;;', '; p="$l" ;;', 'a symlink to the live tracked file is refused'],
    ['ok-label', 'if (used + 0 == peak[sd, u] + 0) chk = "ok"', 'if (used + 0 == peak[sd, u] + 0) chk = "okX"',
        'budget model: equal -> ok'],
    ['no-mismatch-note', 'if grep -q \'MISMATCH\' "$OUT/budget.$tier.tsv"; then', 'if false; then',
        'a budget-model MISMATCH prints a NOTE'],
    // U1 B2a (b55): the pre-spawn refusals, F4, the glue scan and the base-10 limit; anchors verbatim from
    // .handoff/evidence/u1/b2a-mutants.md (root 4debe12c)
    ['no-node-path-check', '[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH (a function, alias or builtin?): $NODE_BIN -> $NODE_RES"', 'true',
        'options: --node resolving to a builtin (false) is refused (exit 2, named die)'],
    ['no-newline-refusal', '[[ "$FNS$TIERS$V8FLAGS$OUT$NODE_BIN$DRIVER$BEFORE_FILE$AFTER_FILE$REPO${POS[*]-}" != *$\'\\n\'* ]] \\', '[[ x == x ]] \\',
        'options: a newline in an input (--fn) is refused (exit 2, named die)'],
    ['no-flag-shape-check', '      [[ "$f" =~ ^--[^=]+=[0-9]{1,9}$ && "${f:2:2}" != no ]] || die "--v8-flags: $f needs =N (an integer of 1..9 digits)" ;;', '      : ;;',
        'options: a --v8-flags shape token and a non-numeric limit value are refused (exit 2, named dies)'],
    ['v8fl-check-after-mkdir', 'v8fl_check "$NODE_BIN"\nmkdir -p "$OUT"/raw "$OUT"/dec "$OUT"/bud "$OUT"/ms "$OUT"/stage', 'mkdir -p "$OUT"/raw "$OUT"/dec "$OUT"/bud "$OUT"/ms "$OUT"/stage\nv8fl_check "$NODE_BIN"',
        '--v8-flags: a refused node option (--snapshot-blob) exits 2 with a named die and OUT not created'],
    ['no-out-reuse-refusal', '    [[ -z "$n" ]] || die "--out: $OUT/$sub is not empty (give a new or empty DIR)"', '    true',
        '--out: a reused non-empty subdir is refused (exit 2, named die)'],
    ['no-diff-truncate', '  : >"$OUT/$key.$tier.diff.txt"', '  true',
        'driver mode (fake node): a SAME run leaves all.turbo.diff.txt at 0 bytes'],
    ['watch-regex-dq-only', 'grep -qE "[\'\\"]\\./Watch\\.js[\'\\"]"', 'grep -qE "\\"\\./Watch\\.js\\""',
        'file mode: a single-quoted ./Watch.js re-export with no Watch.js beside --before is refused (exit 2)'],
    ['no-glue-refusal', '    [[ "$glue" == clean ]] || die "driver output glued to a V8 compile line ($raw): end driver writes with a newline"', '    true',
        'driver mode (fake node): driver output glued to a compile line is refused (exit 2, named die, not DIFF)'],
    ['no-compile-id-strip', '  sub(/^\\[(ML|TLV):[0-9]+\\] */, "", l)\n  if (index(substr(l, 2)', '  if (index(substr(l, 2)',
        'driver mode (fake node): a legal [ML:7] compilation-id prefix is not read as glue'],
    ['glue-scan-swallowed', '    glue=$(tr \'\\000\' \'?\' <"$raw" | awk "$GLUE_AWK") || die "cannot scan $raw for driver output glued to a V8 compile line"\n    [[ "$glue" == clean ]] || die "driver output glued to a V8 compile line ($raw): end driver writes with a newline"', '    if tr \'\\000\' \'?\' <"$raw" | awk "$GLUE_AWK" | grep -q glued; then die "driver output glued to a V8 compile line ($raw): end driver writes with a newline"; fi',
        'driver mode (fake node): a failing glue scan is refused (exit 2, named die), never read as no glue'],
    ['no-base10-limit', '    if [[ $2 == "<=" ]]; then ib=$((b <= 10#$3)); ia=$((a <= 10#$3)); else ib=$((b < 10#$3)); ia=$((a < 10#$3)); fi', '    if [[ $2 == "<=" ]]; then ib=$((b <= $3)); ia=$((a <= $3)); else ib=$((b < $3)); ia=$((a < $3)); fi',
        '--v8-flags: a leading-zero limit (=09) reads as base 10 in the bytecode report (SAME, no unexpected error)'],
];

// ---- Q-IBD-ENV (U3 B3): the top-of-file unset, seen from every node spawn ----
// A fake node logs the four vars at each spawn and exits 7 on a leak. The env below drops what the host (or npm / the test
// runner) would add, so the only var a row sees is the one it sets; NODE_V8_COVERAGE takes `undefined` because node re-adds a
// deleted one to every child.
const ENV_VARS = ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS'];
const UNSET_LINE = 'unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: no node spawn sees one\n';
const IBD_TRACE = '[compiling method 0x1 <JSFunction read.set (sfi = 0x2)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]\n' +
    'Inlining 0x3 {0x4 <SharedFunctionInfo mark>} into 0x1 {0x2 <SharedFunctionInfo read.set>}\n' +
    '[completed compiling 0x1 <JSFunction read.set (sfi = 0x2)> (target TURBOFAN_JS) - took 0.1, 2.0, 0.1 ms]\n';
const V8_OPTIONS = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
function envFakeNode(dir, log) {
    writeFileSync(join(dir, 'trace.txt'), IBD_TRACE);
    const p = join(dir, 'fake-node');
    writeFileSync(p, `#!/bin/sh
printf '%s\\n' "OPT=\${NODE_OPTIONS-<unset>} COV=\${NODE_V8_COVERAGE-<unset>} CC=\${NODE_COMPILE_CACHE-<unset>} RW=\${NODE_REDIRECT_WARNINGS-<unset>} ARGS=$*" >> '${log}'
if [ -n "\${NODE_OPTIONS+x}\${NODE_V8_COVERAGE+x}\${NODE_COMPILE_CACHE+x}\${NODE_REDIRECT_WARNINGS+x}" ]; then exit 7; fi
case "$1" in
  -p) echo 'v26.0.0 (V8 14.0)'; exit 0 ;;
  --v8-options) cat '${V8_OPTIONS}'; exit 0 ;;
esac
case " $* " in *" --print-bytecode "*) printf '[generated bytecode for function: read.set (0x2 <SharedFunctionInfo read.set>)]\\nBytecode length: 285\\n'; exit 0 ;; esac
cat '${join(dir, 'trace.txt')}'
`);
    chmodSync(p, 0o755);
    return p;
}
function envRun(script, dir, env) {
    const log = join(dir, 'spawns.log');
    const base = { ...process.env, TMPDIR: dir };
    for (const k of Object.keys(base)) if (k.startsWith('GIT_') || k.startsWith('BASH_FUNC_')) delete base[k];
    for (const k of [...ENV_VARS, 'NODE', 'EDITOR', 'VISUAL', 'BASH_ENV', 'ENV', 'CDPATH', 'SHELLOPTS', 'BASHOPTS', 'POSIXLY_CORRECT', 'OUTDIR']) delete base[k];
    base.NODE_V8_COVERAGE = undefined;
    writeFileSync(join(dir, 'a.mjs'), ''); writeFileSync(join(dir, 'b.mjs'), '');
    const r = capSync('bash', [script, '--tiers', 'turbo', '--fn', 'read.set', '--runs', '2', '--node', envFakeNode(dir, log), '--out', join(dir, 'out'), 'a.mjs', 'b.mjs'],
        { cwd: dir, env: { ...base, ...env }, encoding: 'utf8', killSignal: 'SIGKILL', maxBuffer: 1 << 26 }, 60000, 'inlining-budget-diff.sh Q-ENV row');
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), spawns: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [] };
}
const ENV_CLEAN = 'OPT=<unset> COV=<unset> CC=<unset> RW=<unset> ARGS=';
const ENV_SPAWNS = 9;   // -p, 2 x --v8-options, 2 runs x 2 sides of the driver, 2 --print-bytecode

test('inlining-budget-diff Q-ENV: all four NODE_* vars set reach no node spawn (exit 0, SAME, 9 spawns, each logged unset; the head names all four)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ibd-env-'));
    try {
        const o = envRun(SCRIPT, dir, { NODE_OPTIONS: '--bogus', NODE_V8_COVERAGE: join(dir, 'cov'), NODE_COMPILE_CACHE: join(dir, 'cc'), NODE_REDIRECT_WARNINGS: join(dir, 'w.txt') });
        assert.equal(o.status, 0, o.out);
        assert.match(o.out, /^VERDICT SAME$/m);
        assert.equal(o.spawns.length, ENV_SPAWNS, o.spawns.join('\n'));
        for (const l of o.spawns) assert.ok(l.startsWith(ENV_CLEAN), `a spawn saw a leaked var: ${l}`);
        assert.match(o.out, /\(same binary both sides, NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped\)$/m);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Must-fail control. NODE_OPTIONS is absent from this list on purpose: the per-spawn `env -u NODE_OPTIONS` belts still cover it
// with the unset line gone, so only the other three reach a spawn. The -p probe is the first spawn, and the fake's exit 7 there
// is a "cannot run <node> -p" refusal: exit 2 after exactly 1 spawn.
for (const [name, tag] of [['NODE_V8_COVERAGE', 'COV'], ['NODE_COMPILE_CACHE', 'CC'], ['NODE_REDIRECT_WARNINGS', 'RW']]) {
    test(`inlining-budget-diff Q-ENV MUST FAIL with the unset line removed: ${name} reaches the first spawn (exit 2, 1 spawn, logged)`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), 'ibd-envm-'));
        try {
            const v = join(dir, 'probe-value');
            const o = envRun(variant(dir, 'no-env-unset', UNSET_LINE, ''), dir, { [name]: v });
            assert.equal(o.status, 2, o.out);
            assert.equal(o.spawns.length, 1, o.spawns.join('\n'));
            assert.ok(o.spawns[0].includes(`${tag}=${v} `), `the leak is not logged: ${o.spawns[0]}`);
            assert.match(o.out, /cannot run .* -p$/m);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// -h stops at the first blank line (usage()), so the paragraph must sit above it. The control is a copy of the root with the
// paragraph cut (the frozen pre-B3 root is under the gitignored .handoff/, not visible to CI).
function helpText(path) {
    const r = capSync('bash', [path, '-h'], { encoding: 'utf8' }, 60000, 'inlining-budget-diff.sh -h');
    assert.equal(r.status, 2, r.stdout + r.stderr);   // -h exits 2 (usage(); exit 2), old and new
    return r.stdout;
}
const countOf = (s, t) => s.split(t).length - 1;
function knownLimitsParagraph() {
    const src = readFileSync(SCRIPT, 'utf8');
    const i = src.indexOf('# Known limits:');
    const j = src.indexOf('\n\nunset NODE_OPTIONS', i);
    assert.ok(i > 0 && j > i, 'the Known limits paragraph sits between the header and the blank line above the unset');
    return src.slice(i, j + 1);
}

test('inlining-budget-diff -h: Known limits 1x, with the L3 and glue claims; the torn-stream clause on the bytecode line', { skip }, () => {
    const h = helpText(SCRIPT);
    assert.equal(countOf(h, 'Known limits'), 1, h);
    assert.match(h, /a 0-byte report\.txt there, and a rerun on that OUT is accepted/);
    assert.match(h, /glued TurboFan header is UNVERIFIED/);
    assert.match(h, /observed on node v26\.8\.2 in front of a Maglev OSR compile/);
    assert.match(h, /from --print-bytecode; a torn stream prints \?\)/);
    assert.equal(countOf(h, 'NODE_OPTIONS NODE_V8_COVERAGE'), 0, 'the unset line is below the blank line and stays out of -h');
});

test('inlining-budget-diff -h control: a root copy with the paragraph removed carries Known limits 0x', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ibd-h-'));
    try {
        const p = variant(dir, 'no-known-limits', knownLimitsParagraph(), '');
        const h = helpText(p);
        assert.equal(countOf(h, 'Known limits'), 0, h);
        assert.match(h, /exits 2 NO-VERDICT, never 1\.$/m);   // the copy's -h still ends at the line above the paragraph
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const [name, from, to, failing] of MUTANTS) {
    test(`inlining-budget-diff --self-test MUST FAIL on mutant ${name}`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), `ibd-${name}-`));
        try {
            let anchor = from;
            if (from instanceof RegExp) {
                const m = readFileSync(SCRIPT, 'utf8').match(new RegExp(from.source, 'gm'));
                assert.equal(m && m.length, 1, `mutant ${name}: regex anchor must match exactly once`);
                anchor = m[0];
            }
            const r = selfTest(variant(dir, name, anchor, to));
            // red = exit 1, or 2 when the mutant breaks the planned-exit path itself (trap-ignores-final)
            assert.ok(r.status === 1 || r.status === 2, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
            assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
            assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes(failing)),
                `mutant ${name}: expected a FAIL line naming "${failing}"\n${r.stdout}`);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
