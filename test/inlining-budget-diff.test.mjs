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
const CHECKS = 89;   // every `check` call in self_test(); a new check moves this literal (b62 G5a: 54 -> 64, G5b: 64 -> 72 -> 77 -> 81 -> 84 -> 85, b65 G5c: 85 -> 89)
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

// The child env (deopt-diff-stage.test.mjs form): none of the 6 GIT_* location vars ref / file mode refuses, no editor vars,
// no NODE / NODE_* option vars, global / system git config off, so a run from inside a git hook does not turn rows red.
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
function cleanEnv(extra = {}) {
    const e = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    for (const k of [...GITVARS, 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL', 'NODE', 'NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'GIT_CONFIG_PARAMETERS']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // not a delete: node's child_process re-inserts a missing NODE_V8_COVERAGE key
    return { ...e, ...extra };
}
function selfTest(path, extra) {
    return capSync('bash', [path, '--self-test'], { encoding: 'utf8', env: cleanEnv(extra) }, 60000, 'inlining-budget-diff.sh --self-test');
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
// (equivalent: `\$v` is never parsed twice). Both leave every check green (re-run at 89 checks, b65 G5c).
// v8fl-check-after-mkdir moves v8fl_check below the mkdir; the Q-RL-TURBO 1 block between them is read from the root, so the
// anchor still pins v8fl_check, that block and the mkdir as one adjacent run
const IBD_ROOT_TEXT = readFileSync(SCRIPT, 'utf8');
const IBD_MKDIR = 'mkdir -p "$OUT"/raw "$OUT"/dec "$OUT"/bud "$OUT"/ms "$OUT"/stage';
const IBD_TL_BLOCK = IBD_ROOT_TEXT.slice(IBD_ROOT_TEXT.indexOf('# Turbolev on the command line (Q-RL-TURBO 1)'), IBD_ROOT_TEXT.indexOf(IBD_MKDIR));
const MUTANTS = [
    ['multiset-sort-u', 'multiset() { sort | uniq -c; }', 'multiset() { sort -u; }',
        'multiset keeps call-site multiplicity'],
    ['budget-double-compare', 'used + int((z + e) * scale) > L', 'used + (z + e) * scale > L',
        'reserve compare truncates like V8'],
    // (TurboFan keeps no frequency in its decision lines, so dropping that gsub is an equivalent mutant;
    // dropping the address gsub is not: the canned before / after runs differ in every address.)
    ['no-turbo-address-normalize', 'l = addr(l); gsub(/#[0-9]+/, "#N", l)', 'gsub(/#[0-9]+/, "#N", l)',
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
    ['v8fl-check-after-mkdir', 'v8fl_check "$NODE_BIN"\n' + IBD_TL_BLOCK + IBD_MKDIR, IBD_TL_BLOCK + IBD_MKDIR + '\nv8fl_check "$NODE_BIN"',
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
    ['glue-scan-swallowed', '    glue=$(tr \'\\000\' \'?\' <"$raw" | awk "$GLUE_AWK") || die "cannot scan $raw for driver output glued to a V8 compile line"\n' +
        '    [[ "$glue" != concurrent ]] || die "background compile (--no-concurrent-recompilation overridden by a V8 flag implication): a [compiling method .. ConcurrencyMode::kConcurrent] line in $raw (a compile off the main thread makes the inlining trace a race)"\n    [[ "$glue" == clean ]] || die "driver output glued to a V8 compile line ($raw): end driver writes with a newline"', '    if tr \'\\000\' \'?\' <"$raw" | awk "$GLUE_AWK" | grep -q glued; then die "driver output glued to a V8 compile line ($raw): end driver writes with a newline"; fi',
        'driver mode (fake node): a failing glue scan is refused (exit 2, named die), never read as no glue'],
    ['no-base10-limit', '    if [[ $2 == "<=" ]]; then ib=$((b <= 10#$3)); ia=$((a <= 10#$3)); else ib=$((b < 10#$3)); ia=$((a < 10#$3)); fi', '    if [[ $2 == "<=" ]]; then ib=$((b <= $3)); ia=$((a <= $3)); else ib=$((b < $3)); ia=$((a < $3)); fi',
        '--v8-flags: a leading-zero limit (=09) reads as base 10 in the bytecode report (SAME, no unexpected error)'],
    // b62 G5a (audit 2026-11-09 IBD-opus-2 / -3 / -5, IBD-fable-3, IBD-fable-2 tiers, Q-B62-FLAG): each drops one new refusal
    // (--self-test=x is a direct row below: a self-test row for it would recurse on its own mutant)
    ['no-onlyfn-novalue', '--only-fn) [[ $EQ -eq 0 ]] || die "$a takes no value"; ONLY=1 ;;', '--only-fn) ONLY=1 ;;',
        'options: a value on a boolean flag is refused'],
    ['no-concurrent-novalue', '--concurrent) [[ $EQ -eq 0 ]] || die "$a takes no value"; CONCURRENT=1 ;;', '--concurrent) CONCURRENT=1 ;;',
        'options: a value on a boolean flag is refused'],
    ['no-nobytecode-novalue', '--no-bytecode) [[ $EQ -eq 0 ]] || die "$a takes no value"; BYTECODE=0 ;;', '--no-bytecode) BYTECODE=0 ;;',
        'options: a value on a boolean flag is refused'],
    ['no-help-novalue', '-h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; exit 2 ;;', '-h|--help) usage; exit 2 ;;',
        'options: a value on a boolean flag is refused'],
    ['no-git-ceiling-term', '${GIT_COMMON_DIR+x}${GIT_CEILING_DIRECTORIES+x}"', '${GIT_COMMON_DIR+x}"',
        'file mode: a set GIT_DIR / GIT_CEILING_DIRECTORIES is refused by name'],
    ['no-git-dir-term', '[[ -z "${GIT_DIR+x}${GIT_WORK_TREE+x}', '[[ -z "${GIT_WORK_TREE+x}',
        'file mode: a set GIT_DIR / GIT_CEILING_DIRECTORIES is refused by name'],
    ['git-block-unconditional', 'if [[ -n "$BEFORE_REF$AFTER_REF$BEFORE_FILE$AFTER_FILE" ]]; then\n  [[ -z "${GIT_DIR+x}', 'if true; then\n  [[ -z "${GIT_DIR+x}',
        'driver mode: GIT_DIR set does not refuse'],
    ['no-ef-before', '  [[ "$DRV_B" -ef "${POS[0]}" ]] || die "DRIVER_BEFORE: cannot resolve the directory of ${POS[0]} (a symlink before \'..\'?)"\n', '',
        'driver mode: a symlink before \'..\' in a driver path is refused'],
    ['no-ef-after', '  [[ "$DRV_A" -ef "${POS[1]}" ]] || die "DRIVER_AFTER: cannot resolve the directory of ${POS[1]} (a symlink before \'..\'?)"\n', '',
        'driver mode: a symlink before \'..\' in a driver path is refused'],
    ['no-out-cwd-clause', '[[ "$OUT" != *\\\\* && ( "$OUT" == /* || "$PWD" != *\\\\* ) ]]', '[[ "$OUT" != *\\\\* ]]',
        '--out: a backslash in DIR, or in the cwd of a relative DIR, is refused'],
    ['no-out-abs-exempt', '( "$OUT" == /* || "$PWD" != *\\\\* )', '( "$PWD" != *\\\\* )',
        '--out: a backslash in DIR, or in the cwd of a relative DIR, is refused'],
    ['no-tiers-empty', '[[ ${#TIER_LIST[@]} -gt 0 ]] || die "--tiers is empty"\n', '',
        'options: an empty --tiers and an = in the resolved node path are refused'],
    ['no-node-eq', '[[ "$NODE_BIN" != *=* ]] || die "node binary: an = is not allowed', 'true || die "node binary: an = is not allowed',
        'options: an empty --tiers and an = in the resolved node path are refused'],
    ['no-sci-name-refusal', '    *stress-concurrent-inlining*)\n', '    *stress-concurrent-inlining-OFF*)\n',
        '--v8-flags: any *stress-concurrent-inlining* spelling is refused by name'],
    ['no-kconcurrent-check', '  if (substr(l, 1, 18) == "[compiling method " && index(l, "ConcurrencyMode::kConcurrent")) c = 1\n', '',
        'driver mode: a kConcurrent compile line without --concurrent is NO-VERDICT'],
    ['kconcurrent-any-line', 'if (substr(l, 1, 18) == "[compiling method " && index(l, "ConcurrencyMode::kConcurrent")) c = 1', 'if (index(l, "ConcurrencyMode::kConcurrent")) c = 1',
        'a kConcurrent [marking line, still give a verdict'],
    ['kconcurrent-with-concurrent', '  if [[ $TAG == 1 ]]; then\n    glue=', '  if true; then\n    glue=',
        'a kConcurrent compile line under --concurrent'],
    // the pre-b62 import check, verbatim (a regex over the whole file: a comment naming './Signal.js' passed)
    ['driver-import-grep', "    STAGE_IMP=./Signal.js awk '\n", "    grep -qE \"['\\\"]\\./Signal\\.js['\\\"]\" \"$DRIVER\" || die \"--driver must import './Signal.js'\"\n    : '\n",
        'file mode: a --driver that names ./Signal.js only in a comment is refused'],
    // b62 G5a review r1 (m1 / m2 / m5): block comments not stripped, any quoted mention accepted, a block comment never spans lines
    ['driver-import-no-block-strip', 'i = index(s, "/*"); j = index(s, "//")', 'i = 0; j = index(s, "//")',
        'file mode: a --driver that names ./Signal.js only in a comment is refused'],
    ['driver-import-any-mention', 'if (i && substr(o, 1, i - 1) ~ /(^|[^A-Za-z0-9_$.])(import|from|require)[ \\t]*\\(?[ \\t]*$/) found = 1', 'if (i) found = 1',
        'file mode: a --driver that names ./Signal.js only in a comment is refused'],
    ['driver-import-one-line-block', 'if (inb) { i = index(s, "*/"); if (!i) { s = ""; break }; s = substr(s, i + 2); inb = 0; continue }', 'if (inb) { inb = 0; continue }',
        'file mode: a --driver that names ./Signal.js only in a comment is refused'],
    // b62 G5a review r2 (alt5): a block comment that ends at its first inner line (a JSDoc import example passed)
    ['driver-import-block-ends-at-eol', 'if (!i) { s = ""; break }; s = substr(s, i + 2); inb = 0; continue }', 'if (!i) { s = ""; inb = 0; break }; s = substr(s, i + 2); inb = 0; continue }',
        'file mode: a --driver that names ./Signal.js only in a comment is refused'],
    // b62 G5b (audit 2026-11-09 IBD-opus-1 = R9; IBD-fable-1 = IBD-opus-6 = R15, Q-B57-COMPILE; review r1 B2, Q-B62-ADDR): addr()
    // collapses a 0x only at line start or after a space, { or ( (the class rule back, the always-collapse form, each
    // normalizer back to the old gsub, the two allowlist members the census sees: space and {); the guard counts only a D
    // row (a `[completed compiling` with the open unit key) of THIS tier. No row, equivalent: dropping the line-start member
    // (an emitted decision line starts with a word: turbo trims and matches ^Inlining 0x / ^Cannot ..., Maglev strips
    // [^A-Za-z=]+), and dropping ( (no ( before a 0x in the 22 census logs; allowlisted by the ruling); DONE_AWK
    // `index($2, fn t) == 1` back to `index($2, t)` ($3 == fn and $2 = fn "@" tier..., and --fn refuses @).
    ['turbo-norm-gsub', 'l = addr(l); gsub(/#[0-9]+/, "#N", l)', 'gsub(/0x[0-9a-fA-F]+/, "0x", l); gsub(/#[0-9]+/, "#N", l)',
        'm0 inlining h0x1 vs h0x2 is a DIFF (turbo)'],
    ['maglev-norm-gsub', 'l = addr(l); gsub(/frequency \\(', 'gsub(/0x[0-9a-fA-F]+/, "0x", l); gsub(/frequency \\(',
        'Maglev == Inlining h0x1 vs h0x2 is a DIFF'],
    ['addr-class-rule', '((c == "" || c == " " || c == "{" || c == "(") ? "0x" : substr(l, RSTART, RLENGTH))', '((c ~ /[A-Za-z0-9_$.]/) ? substr(l, RSTART, RLENGTH) : "0x")',
        'm0 inlining <e-acute>0x1 vs <e-acute>0x2 is a DIFF'],
    ['addr-always-collapse', '((c == "" || c == " " || c == "{" || c == "(") ? "0x" : substr(l, RSTART, RLENGTH))', '"0x"',
        'normalize: a 0x after a byte other than line start, space, { or ( stays in the name'],
    ['addr-no-space', 'c == "" || c == " " || c == "{"', 'c == "" || c == "{"',
        'normalize: a 0x after a byte other than line start, space, { or ( stays in the name'],
    ['addr-no-brace', 'c == " " || c == "{" || c == "("', 'c == " " || c == "("',
        'normalize: a 0x after a byte other than line start, space, { or ( stays in the name'],
    ['guard-no-done', '"$DONE_AWK" "$OUT/bud/', '\'BEGIN { exit 1 }\' "$OUT/bud/',
        'a completed TurboFan compile of m0 with no decision line naming it is evidence'],
    ['done-any-tier', '$1 == "D" && $3 == fn && index($2, fn t) == 1 {', '$1 == "D" && $3 == fn {',
        'only a Maglev compile of m0 is no turbo evidence'],
    ['done-reads-k', '$1 == "D" && $3 == fn', '$1 == "K" && $3 == fn',
        'an aborted TurboFan compile of m0 is no evidence'],
    ['done-accepts-aborted', 'if (substr(l, 1, 21) == "[completed compiling " && key', 'if ((substr(l, 1, 21) == "[completed compiling " || substr(l, 1, 9) == "[aborted ") && key',
        'an aborted TurboFan compile of m0 is no evidence'],
    ['done-no-key-compare', ' && key != "" && ukey(l) == key) ev("D', ') ev("D',
        'does not complete m0'],
    ['key-no-osr', 'return substr(s, 1, j) ((substr(s, j + 1, 4) == " OSR") ? " OSR" : "")', 'return substr(s, 1, j)',
        'does not complete m0'],
    // b62 G5b B2 (audit R2, Q-B57-PIPE, Q-B60-TMPFULL): the bytecode probe's regular temp file (redirect on the OUTER subshell,
    // ahead of the cd; rm last), the 64 KiB append, the step precedence awk > tr > append > node (each adjacent pair swapped;
    // append-first = append ahead of awk) and the caller's slot / die split. Equivalent, no row: moving the append statement
    // ahead of the read (the spaces carry no record; under ulimit the append still fails, so the slot is the same).
    ['probe-no-rm', '    rm -f "$tmp" || true\n', '',
        'bytecode probe: a relative TMPDIR names the caller-cwd temp file'],
    ['probe-redirect-in-cd', '"$b") >"$tmp" 2>&1 || nrc=$?', '"$b" >"$tmp" 2>&1) || nrc=$?',
        'bytecode probe: a relative TMPDIR names the caller-cwd temp file'],
    ['probe-drop-append', "    { printf '%65536s' '' >>\"$tmp\"; } 2>/dev/null || ar=$?\n", '',
        'bytecode probe: ulimit -f 32 (XFSZ ignored) fails the 64 KiB append'],
    ['bcrc-append-first', 'bc_rc() { if [[ $3 != 0 ]]', 'bc_rc() { if [[ $4 != 0 ]]; then BC_RC="append:$4"; elif [[ $3 != 0 ]]',
        'bytecode probe: step precedence awk > tr > append > node'],
    ['bcrc-tr-over-awk', 'bc_rc() { if [[ $3 != 0 ]]', 'bc_rc() { if [[ $2 != 0 ]]; then BC_RC="tr:$2"; elif [[ $3 != 0 ]]',
        'bytecode probe: step precedence awk > tr > append > node'],
    ['bcrc-append-over-tr', 'elif [[ $2 != 0 ]]; then BC_RC="tr:$2";', 'elif [[ $4 != 0 ]]; then BC_RC="append:$4"; elif [[ $2 != 0 ]]; then BC_RC="tr:$2";',
        'bytecode probe: step precedence awk > tr > append > node'],
    ['bcrc-node-over-append', 'elif [[ $4 != 0 ]]; then BC_RC="append:$4"; else', 'elif [[ $1 != 0 ]]; then BC_RC=$1; elif [[ $4 != 0 ]]; then BC_RC="append:$4"; else',
        'bytecode probe: step precedence awk > tr > append > node'],
    ['bcside-mktemp-dies', '      mktemp:*|append:*) BC_SIDE=', '      append:*) BC_SIDE=',
        'bytecode probe: a failed mktemp prints (mktemp exited N)'],
    ['bcside-node-slot', '      *) die "bytecode probe of $1: node exited $s" ;;', '      *) BC_SIDE="(node exited $s)" ;;',
        'bytecode probe: node failing --print-bytecode is a named die'],
    // b62 G5b B2b (Q-B62-TEAR, Q-B62-TEAR2): each drops one strict-shape rule of BYTECODE_AWK (lib/v8probe.sh) back to the
    // pre-ruling awk; tear-length-no-cr drops the trailing-CR allowance the old prefix match had (the CR control row);
    // anon-as-torn is the B2b empty-name rule the anonymous-header control row rejects
    ['tear-header-shape-off', 'if (pend || !/^\\[generated bytecode for function: .* \\(0x[0-9a-f]+ <SharedFunctionInfo( .*)?>\\)\\]\\r?$/) torn = 1', 'if (pend) torn = 1',
        'bytecode probe: a header split by a newline (not whole) -> ?'],
    ['tear-pending-header-off', 'if (pend || !/^', 'if (!/^',
        'bytecode probe: a header with no length before the next header -> ?'],
    ['tear-pending-eof-off', 'END { if (pend) torn = 1; out = "";', 'END { out = "";',
        'bytecode probe: a header with no length before EOF -> ?'],
    ['anon-as-torn', 'sub(/ \\(0x.*$/, "", s); want = (s == fn);', 'sub(/ \\(0x.*$/, "", s); if (s == "") torn = 1; want = (s == fn);',
        'bytecode probe: an anonymous function\'s header (empty name) is whole, not torn'],
    ['tear-length-line-off', '/^Bytecode length:/ && !/^Bytecode length: [0-9]+\\r?$/ { torn = 1 }\n', '',
        'bytecode probe: a length line split before its digits -> ?'],
    ['tear-length-prefix', '[0-9]+\\r?$/ { torn = 1 }', '[0-9]+/ { torn = 1 }',
        'bytecode probe: digits then junk on a length line -> ?'],
    ['tear-length-no-cr', '[0-9]+\\r?$/ { torn = 1 }', '[0-9]+$/ { torn = 1 }',
        'bytecode probe: a CR-terminated length line still reads'],
    // b65 G5c (Q-RL-TURBO 1-4): each drops one Turbolev mechanism; the budget regex goes back to its capital-G-only form
    ['tl-no-cmdline-arm', '    --turbolev|--turbolev=*|--turbolev-future|--turbolev-future=*)\n', '    --turbolev-OFF)\n',
        '--v8-flags: --turbolev and --turbolev_future are refused by name'],
    ['tl-no-default-on', '[[ $\'\\n\'"$LIMITS"$\'\\n\' != *$\'\\n\'turbolev=on$\'\\n\'* ]] || die "Turbolev is on by default', 'true || die "Turbolev is on by default',
        'Turbolev: a --v8-options default of --turbolev is NO-VERDICT for every tier'],
    ['tl-no-tf-unit-check', '    if [[ $ntf != 0 ]]; then\n', '    if false; then\n',
        'Turbolev (fake node): maglev decision lines in TurboFan-tier units'],
    ['budget-capital-g-only', 'else if (l ~ /^[Gg]enerated [0-9]+ nodes', 'else if (l ~ /^Generated [0-9]+ nodes',
        "maglev: V8 14.6's lowercase '> generated N nodes. regular_budget' line"],
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

// ---- b62 G5a direct rows ----
// --self-test=x: refused before the self-test runs (exit 2, the named die, empty stdout); the copy without the guard runs it.
test('inlining-budget-diff --self-test=x: exit 2, "--self-test takes no value" + NO-VERDICT, empty stdout; MUST FAIL with the guard dropped', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ibd-stv-'));
    try {
        const run = (p) => capSync('bash', [p, '--self-test=x'], { encoding: 'utf8', env: cleanEnv(), cwd: dir }, 60000, 'inlining-budget-diff.sh --self-test=x');
        const r = run(SCRIPT);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.equal(r.stdout, '');
        assert.equal(r.stderr, 'inlining-budget-diff: --self-test takes no value\nVERDICT NO-VERDICT\n');
        const m = run(variant(dir, 'no-selftest-novalue', '--self-test) [[ $EQ -eq 0 ]] || die "$a takes no value"; if self_test;', '--self-test) if self_test;'));
        assert.equal(m.status, 0, 'the mutant runs the self-test: ' + m.stdout + m.stderr);
        assert.match(m.stdout, /^self-test: all checks passed$/m);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --self-test under an inherited GIT_DIR (an index-only repo: init + add, never a commit): every check passes and the
// self-test writes nothing into that repo's index; with the self-test's GIT_* unset dropped, rows go red (pre-b62: 7 FAIL).
const haveGit = capSync('git', ['--version'], { encoding: 'utf8', env: cleanEnv() }, 30000, 'git --version').status === 0;
function lsFiles(repo) {
    const r = capSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', env: cleanEnv() }, 30000, 'git ls-files');
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.split('\n').filter(Boolean).length;
}
test('inlining-budget-diff --self-test under GIT_DIR=<index-only repo>: all checks ok, ls-files unchanged; MUST FAIL with the unset dropped', { skip: skip || (haveGit ? false : 'git not available') }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ibd-gd-'));
    try {
        const repo = join(dir, 'host');
        const g = (...a) => capSync('git', ['-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8', env: cleanEnv() }, 30000, 'git fixture');
        assert.equal(g('init', '-q', repo).status, 0);
        writeFileSync(join(repo, 'f.txt'), 'x\n');
        assert.equal(g('-C', repo, 'add', 'f.txt').status, 0);
        assert.equal(lsFiles(repo), 1);
        const env = { GIT_DIR: join(repo, '.git') };
        const r = selfTest(SCRIPT, env);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.equal(okCount(r.stdout), CHECKS);
        assert.equal(lsFiles(repo), 1, 'the self-test wrote into the GIT_DIR repo');
        const m = selfTest(variant(dir, 'nogit-noop', 'nogit() { (unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR GIT_CEILING_DIRECTORIES; "$@"); }', 'nogit() { ("$@"); }'), env);
        assert.equal(m.status, 1, m.stdout + m.stderr);
        assert.match(m.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inlining-budget-diff -h: the b62 G5a refusals are listed (GIT_* vars, no-value flags, --tiers, backslash, =, symlink before .., kConcurrent, stress flag, comment import)', { skip }, () => {
    const h = helpText(SCRIPT);
    assert.match(h, /Ref and file modes refuse a\nset GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES/);
    assert.match(h, /\("<flag> takes no value"\); an empty --tiers; a backslash in --out/);
    assert.match(h, /an = in the resolved node path; a DRIVER_BEFORE \/ DRIVER_AFTER/);
    assert.match(h, /\*stress-concurrent-inlining\* flag, every spelling/);
    assert.match(h, /a run whose trace has a line starting `\[compiling method ` with ConcurrencyMode::kConcurrent/);
    assert.match(h, /a mention in a comment is refused\./);
});

test('inlining-budget-diff -h: the guard counts a completed compile of <fn> by that tier, never an aborted one (b62 G5b)', { skip }, () => {
    const h = helpText(SCRIPT);
    assert.match(h, /Guard: a run with no decision line naming <fn> and no completed compile of <fn> by that tier \(a unit that\n {4}reached `\[completed compiling`; an aborted compile is no evidence\) is NO-VERDICT/);
    assert.match(h, /--concurrent attributes no compile, so there only a decision line counts\./);
    assert.equal(countOf(h, 'and no compile of <fn>'), 0, 'the pre-G5b guard sentence is gone');
});

test('inlining-budget-diff -h: the bytecode probe temp file, its 64 KiB append, the slot / die split and two Known limits (b62 G5b)', { skip }, () => {
    const h = helpText(SCRIPT);
    assert.match(h, /node's stdout and stderr go to one temp file per side, \$\{TMPDIR:-\/tmp\}\/inlining-budget-diff\.XXXXXX, never to a pipe\n/);
    assert.match(h, /then 64 KiB\n {4}of spaces are appended to it and it is removed\. A failed mktemp or append prints "\(<step> exited N\)" for that side\n/);
    assert.match(h, /\(not measured; the verdict is unmoved\); a failed node, tr or awk is a named die, exit 2 NO-VERDICT\n {4}\("bytecode probe of <fn>: <step> exited <rc>"\)\./);
    assert.match(h, /Bytecode probe temp file: a signal mid-probe can leave one inlining-budget-diff\.XXXXXX in\nTMPDIR; a TMPDIR that was full during the probe and freed before the 64 KiB append still passes that check/);
    assert.equal(countOf(knownLimitsParagraph(), 'Bytecode probe temp file:'), 1, 'the two probe limits sit in the Known limits paragraph');
});

test('inlining-budget-diff -h: the Turbolev refusals, header absent = off, the residual and the 14.6 budget line (b65 G5c)', { skip }, () => {
    const h = helpText(SCRIPT);
    assert.match(h, /every spelling \("--turbolev changes which tier --trace-maglev-inlining describes; unsupported"\);\n/);
    assert.match(h, /--no-turbolev, --no-turbolev-future and the other turbolev tuning flags \(--max-turbolev-inline-depth=N\) pass\.\n/);
    assert.match(h, /Also refused, exit 2: --turbolev or --turbolev-future in --v8-flags; a report\.txt under --out/);
    assert.match(h, /Turbolev: when this node's --v8-options shows --turbolev or\n--turbolev-future on by default, or a listed default reads as neither on nor off, every tier is NO-VERDICT, exit 2\n/);
    assert.match(h, /a refusal after the --out dir is\ncreated and before any driver spawn/);
    assert.match(h, /A V8 that lists neither flag reads as off \(ruling Q-B62-TL\)/);
    assert.match(h, /which --concurrent \(units carry no\ntag\) turns off\./);
    assert.match(h, /The lowercase\n"generated N nodes\. regular_budget \+= B ~~> T" line is V8 14\.6's own/);
    assert.equal(countOf(h, 'the SKIP / INLINE / budget-counter / colour / emoji formats'), 0, 'the pre-G5c canned-only sentence is gone');
    const k = knownLimitsParagraph();
    assert.equal(countOf(k, 'Turbolev:'), 1, 'the Turbolev limit sits in the Known limits paragraph');
    assert.equal(countOf(k, 'exit 0'), 0, 'no exit 0 wording in Known limits');
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
