// test/deopt-diff.test.mjs -- ../deopt-diff.sh --self-test (canned trace text) plus fake-node e2e rows.
// ORACLE: the expected rows come from the P3G1 plan ASSERTIONS A1-A4 (.handoff/PLAN-phase3-g1.md) and the script's
// documented NO-VERDICT reasons, never from copying what the script printed. TIER: DETERMINISTIC (no V8 spawn: every
// sub-run uses the self-test's canned text or a fake node written in a temp dir; the real before / after trace runs are
// STATISTICAL / REPORTED tier and never part of npm test). The must-fail rows prove the self-test has teeth: each mutant
// of the script (one exact-once edit on a copy) must turn it red on the DESIGNED row(s), found by label prefix, so a
// mutant that breaks the wrong row is not a kill. The revert rows rerun the same assertion on the UNMUTATED output and
// require it to throw (the row would be red if the mutant did nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeAwk, buildNulCutAwk, buildNulCleanAwk } from './nul-awk.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'deopt-diff.sh');
const CHECKS = 92;   // every `check` call in self_test(): 53 driver-mode rows + 18 ref/file rows (S1-S4, R1-R14) + 13 tier rows (T1-T13)
                     // + 5 B-four dd refusal rows (checks 85-89: MD-36, MD-37, MD-39, MD-42, MD-44) + 3 MD-46 --v8-flags
                     // allowlist rows (checks 90-92: MD-50 accepted, MD-50 refused after the read, MD-56 a failing read;
                     // PLAN-md46 G2 TASK 3); a new check moves this literal.
                     // The S-9 fixture rows F1-F17 (FIXTURE_ROWS below) run only under --self-test --fixtures DIR: not counted here
// P3G4 T4: the node v26.8.2 real-trace fixture set; --self-test --fixtures FIX adds FIXTURE_ROWS "ok fixture F<n> ..." rows
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'deopt-diff', 'node-26.8.2');
const FIXTURE_ROWS = 17;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
// the host environment never reaches the script (NODE_OPTIONS would make the fake node exit 7; editor vars are git's)
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];
// b37 ruling "NUL mutants": gawk / mawk (Linux) keep a NUL inside a record, so the tr '\000' '?' defense is unobservable
// there and T1 / Rf survive. NUL_MUTANTS (and their revert checks) run with the BSD-NUL shim first on PATH when the probe
// says the host awk is NUL-clean; on a truncating host (macOS) they run as before. The shim is built on every host: the
// control row runs the UNMUTATED self-test under it, and the pin rows below test it (test/nul-awk.mjs).
const NUL_MUTANTS = new Set(['T1-tr-replaced-by-cat', 'Rf-tr-after-awk']);
const NUL = skip ? null : probeAwk(ENV);
const NULDIR = skip ? null : mkdtempSync(join(tmpdir(), 'dd-nul-'));
if (NULDIR) process.on('exit', () => rmSync(NULDIR, { recursive: true, force: true }));
const NULSHIM = skip ? null : buildNulCutAwk(NULDIR, ENV);
const NULENV = skip ? null : { ...ENV, PATH: NULSHIM.dir + ':' + ENV.PATH };
const envFor = (name) => (NUL && NUL.nulClean && NUL_MUTANTS.has(name) ? NULENV : ENV);

function selfTest(path, extra = []) {
    return spawnSync('bash', [path, '--self-test', ...extra], { encoding: 'utf8', timeout: 120000, env: ENV });
}
function okCount(out) { return (out.match(/^ok /gm) || []).length; }

// A copy of the script in a temp dir, with exact-once edits (each must match exactly once, else the row is invalid).
function variant(dir, name, edits) {
    let src = readFileSync(SCRIPT, 'utf8');
    for (const [from, to] of edits) {
        const n = src.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
        src = src.replace(from, () => to);
    }
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src);
    chmodSync(p, 0o755);
    return p;
}

test('deopt-diff --self-test: every check passes', { skip }, () => {
    const r = selfTest(SCRIPT);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`^self-test: ${CHECKS} check\\(s\\) ok$`, 'm'));
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), CHECKS);
});

// One unmutated run outside the repo, shared as the baseline for every revert check below.
let BASE = null;
function base() {
    if (BASE) return BASE;
    const dir = mkdtempSync(join(tmpdir(), 'dd-base-'));
    try { BASE = selfTest(variant(dir, 'baseline', [['#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n']])); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    return BASE;
}

test('deopt-diff --self-test: an unmodified copy outside the repo passes (baseline for the mutants)', { skip }, () => {
    const r = base();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(okCount(r.stdout), CHECKS);
});

// designed-row label prefixes (the "FAIL <label>: <got>" lines of the self-test)
const R = {
    tee: 'e2e --out: a tee failure on a driver exiting 3', awk: 'e2e --out: an awk + tr + tee failure',
    tr: 'e2e --out: a tr + tee failure', nul: 'e2e --out: driver text, a NUL', nul0: 'e2e: a NUL, then a bailout',
    ge: "e2e: '[completed compilingX' glued", r304: 'records: exact names -- fn=ad and fn=addX',
    r305: 'records: exact names -- fn=add on an addX trace',
};
const PREC = 'if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else RUN_RC=$n; fi';
const RS = '| tee "${3:-/dev/null}" | tr \'\\000\' \'?\' | awk "$KEEP_AWK";';
const KEEP = 'KEEP_AWK=\'/^\\[/ || index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0\'';
const AWK0 = "DEOPT_AWK='\nfunction names(";
const REC_NEW = 'rec() { printf \'%s\\n\' "$2" | { awk -v fn="$1" "$DEOPT_AWK" || echo "!awk exited $?"; } | tr \'\\t\\n\' \'|;\'; }';
const REC_OLD = 'rec() { printf \'%s\\n\' "$2" | awk -v fn="$1" "$DEOPT_AWK" | tr \'\\t\\n\' \'|;\'; }';
const W1 = [AWK0, "DEOPT_AWK='\nBEGIN { if (fn == \"ad\") exit 3 }\nfunction names("];
const W2 = [AWK0, "DEOPT_AWK='\nBEGIN { if (fn == \"value\") exit 3 }\nfunction names("];
const GE_X = 'else if (index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0) x(';
const RUNSIDE = (x) => `RUN_RC="${x}"`;
// MD-46 (PLAN-md46 G2 TASK 1): the one v8fl_check call line, right after GOT_VER, before the --out mkdir block
const V8FL_CALL = 'v8fl_check "$NODE_BIN"   # lib/v8flags.sh: ONE --v8-options read, then the --v8-flags allowlist (MD-50..58)\n';
const OUT_BLOCK = 'if [[ -n "$OUT" ]]; then\n' +
    '  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"\n' +
    '  # keep the logical OUT name when it is the same directory as the given OUT, else print the physical one\n' +
    '  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L\n' +
    '  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check\n' +
    'fi\n';

// [name, edits, designed row prefixes]. Coder mutants M1-M7, S1-S4, Na-Ne; reviewer K1-K4, K7, T1-T6, W1-W2 (round 2);
// reviewer Ra-Rf, Rn (designed rows reasoned from the precedence line awk > tr > tee > driver exit and the NUL rows).
const MUTANTS = [
    ['M1-offset-kept-in-D', [['  print "D " fn "@" t "\\t" k " (" r ")"; next',
        '  o = $0; sub(/.*bytecode offset /, "", o); sub(/,.*/, "", o); print "D " fn "@" t "\\t" k " (" r ") @" o; next']],
        ['records: a copy with every 0x']],
    ['M2-evidence-from-JSFunction-line', [['  next\n}\nsubstr($0, 1, 8) == "[bailout" {',
        '}\nsubstr($0, 1, 8) == "[bailout" || index($0, "<JSFunction " fn " ") {']],
        ['records: the frame dump']],
    ['M3-prefix-name-match', [['    if (s == "" || c == ">" || substr(s, 1, 8) == " (sfi = ") return 1', '    return 1']],
        ['records: exact names -- fn=ad and fn=addX']],
    ['M4-sort-u', [['multiset() { sort | uniq -c; }', 'multiset() { sort -u | uniq -c; }']],
        ['diff_fn: 1 deopt vs 2 identical deopts']],
    ['M5-final-dropped', [['FINAL=1; case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;;',
        'case "$VERDICT" in SAME) FINAL=1; exit 0 ;; DIFF) exit 1 ;;']],
        ['e2e: 1 deopt vs 2 identical deopts (R=3)']],
    ['M6-guard-removed', [['  if [[ -z "$first" ]]; then JWHY="no optimized compile', '  if false; then JWHY="no optimized compile']],
        ['judge: no E and no D in run 1 -> the guard']],
    ['M7-null-control-skipped', [['  for ((i = 1; i < n; i++)); do\n    nk=$(nc_ms', '  for ((i = n; i < n; i++)); do\n    nk=$(nc_ms']],
        ['judge: run 3 with DIFFERENT D records']],
    ['S1-no-OSR-suffix', [['  if (r ~ /^ OSR - took .*\\]$/) t = t "-OSR"', '  if (r ~ /^ OSR - took .*\\]$/) t = t']],
        ['records: an OSR compile']],
    ['S2-multisets-from-run-2', [['MSB=$(d_ms "${RECB[0]}"); MSA=$(d_ms "${RECA[0]}")', 'MSB=$(d_ms "${RECB[1]}"); MSA=$(d_ms "${RECA[1]}")']],
        ['diff_fn: the verdict multisets are read from run 1']],
    ['S3-worst-returns-2nd', [['worst() { # NO-VERDICT > DIFF > SAME', 'worst() { echo "$2"; return 0; }\nworst_orig() { # NO-VERDICT > DIFF > SAME']],
        ['worst: NO-VERDICT > DIFF > SAME, both argument orders']],
    ['S4-glue-filter-reverted', [[KEEP, 'KEEP_AWK=\'/^\\[/\'']],
        ['e2e: a bailout glued after driver output']],
    ['Na-empty-reason-label', [['x("bailout: empty reason or a tab")', 'x("bailout: empty reason")']],
        ['records: a bailout with an empty reason or a tab']],
    // MD-46: the v8fl_check call sits between GOT_VER and the --out block; Nb moves only the --version probe below the block
    ['Nb-version-probe-after-mkdir', [[
        'GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"\n' +
        V8FL_CALL +
        'if [[ -n "$OUT" ]]; then\n' +
        '  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"\n' +
        '  # keep the logical OUT name when it is the same directory as the given OUT, else print the physical one\n' +
        '  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L\n' +
        '  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check\n' +
        'fi\n',
        V8FL_CALL +
        'if [[ -n "$OUT" ]]; then\n' +
        '  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"\n' +
        '  # keep the logical OUT name when it is the same directory as the given OUT, else print the physical one\n' +
        '  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L\n' +
        '  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check\n' +
        'fi\n' +
        'GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"\n']],
        ['e2e --out: a failing node --version']],
    ['Nc-tee-failure-as-driver-exit', [['RUN_RC="tee $t"', 'RUN_RC=$t']],
        ['e2e --out: a tee failure']],
    ['Nd-trace-file-names-accepted', [['    *trace-file-names*)\n', '    *trace-file-names-OFF*)\n']],
        ['refused before any spawn: a trace-file-names flag in --v8-flags']],
    ['Ne-completed-compilingX-dropped', [[
        '  if (substr($0, 1, 20) == "[completed compiling") x("completed compiling: no space after the prefix")\n' +
        '  else if (index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0) x("trace text not at line start")\n',
        '  if (index($0, "[bailout") > 0 || index($0, "[completed compiling ") > 0) x("trace text not at line start")\n']],
        ["records: a line starting '[completed compilingX'"]],
    ['K1-node-named-first', [['if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif',
        'if [[ $n != 0 ]]; then RUN_RC=$n; elif [[ $a != 0 ]]; then RUN_RC="awk $a"; elif']],
        [R.tee, R.awk, R.tr]],
    ['K2-awk-failure-ignored', [['if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif', 'if false; then RUN_RC="awk $a"; elif']], [R.awk]],
    ['K3-completed-clause-dropped', [[KEEP, 'KEEP_AWK=\'/^\\[/ || index($0, "[bailout") > 0\'']], [R.ge]],
    ['K4-trailing-space-restored', [[KEEP, 'KEEP_AWK=\'/^\\[/ || index($0, "[bailout") > 0 || index($0, "[completed compiling ") > 0\'']], [R.ge]],
    ['K7-tee-before-awk', [[PREC, 'if [[ $t != 0 ]]; then RUN_RC="tee $t"; elif [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; else RUN_RC=$n; fi']],
        [R.awk]],
    ['T1-tr-replaced-by-cat', [[RS, '| tee "${3:-/dev/null}" | cat | awk "$KEEP_AWK";']], [R.nul, R.nul0]],
    ['T2-tr-maps-NUL-to-newline', [[RS, '| tee "${3:-/dev/null}" | tr \'\\000\' \'\\n\' | awk "$KEEP_AWK";']], [R.nul, R.nul0]],
    ['T3-tr-failure-ignored', [['elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif', 'elif false; then RUN_RC="tr $r"; elif']], [R.tr]],
    ['T4-tr-before-awk', [[PREC, 'if [[ $r != 0 ]]; then RUN_RC="tr $r"; elif [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else RUN_RC=$n; fi']],
        [R.awk]],
    ['T5-tee-before-tr', [[PREC, 'if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; else RUN_RC=$n; fi']],
        [R.tr]],
    ['T6-tr-before-tee', [[RS, '| tr \'\\000\' \'?\' | tee "${3:-/dev/null}" | awk "$KEEP_AWK";']], [R.nul]],
    ['W1-awk-exits-3-for-ad', [W1], [R.r304]],
    ['W2-awk-exits-3-for-value', [W2], [R.r305]],
    ['Ra-node-between-awk-and-tr', [['elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif',
        'elif [[ $n != 0 ]]; then RUN_RC=$n; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif']], [R.tee, R.tr]],
    ['Rb-node-between-tr-and-tee', [['elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else',
        'elif [[ $n != 0 ]]; then RUN_RC=$n; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else']], [R.tee]],
    ['Rc-r-read-from-field-2', [['r=${BASH_REMATCH[3]}', 'r=${BASH_REMATCH[2]}']], [R.tr]],
    ['Rd-a-read-from-field-3', [['a=${BASH_REMATCH[4]}', 'a=${BASH_REMATCH[3]}']], [R.awk]],
    ['Re-tr-deletes-NUL', [[RS, '| tee "${3:-/dev/null}" | tr -d \'\\000\' | awk "$KEEP_AWK";']], [R.nul0]],
    ['Rf-tr-after-awk', [[RS, '| tee "${3:-/dev/null}" | awk "$KEEP_AWK" | tr \'\\000\' \'?\';']], [R.nul0]],
    ['Rn-glued-E-clause-dropped', [[GE_X, 'else if (index($0, "[bailout") > 0) x(']], [R.ge]],
];
// The REPORTED tier section's mutant table (P3G3 PLAN TASK 6 + A9 (4)): G1-G6, V1-V3 of ASSERTIONS A1-A3, TW1-TW7 =
// A9's W1-W7 (renamed: this file's old table already holds W1 / W2). Designed row = the self-test's `T<n> ` row the
// plan names (A1: G1-G3; A2: G4, G5; A3: G6, V1, V2 -> T7; V3 -> T8 + T11; A9 (4): W1-W7), confirmed red in
// .handoff/evidence/p3g3/b2/muts.log, b2-review/rmuts.log, b3/. The prefix ends in a space, so `T1 ` never names T10-T13.
const TR = (n) => `T${n} `;
const OKL = '  if [[ $ok == 1 ]]; then say "$out"; else say "tier    $1  $2  unreadable (awk exited $rc)"; fi';
const L0 = 'tier_fn "$fn" before "${RCB[0]}" "${TXB[0]}"; tier_fn "$fn" after "${RCA[0]}" "${TXA[0]}"';
const HDR = 'say "tier    REPORTED: run 1 of each side, never part of the verdict"';
const FORFN = 'for fn in "${TARGETS[@]}"; do';
const TIER_MUTANTS = [
    ['G1-every-D-a-cycle', [['    if (EV[i] == "deopt") p++; else { c += p; p = 0 }', '    if (EV[i] == "deopt") c++; else p = 0']], [TR(1)]],
    ['G2-pairing-across-a-bracket-line', [['  if (substr($0, 1, 1) == "[") {\n    PD = 0\n', '  if (substr($0, 1, 1) == "[") {\n']], [TR(3)]],
    ['G3-path-not-basenamed', [['b = substr(g, 1, RSTART - 1); sub(/.*\\//, "", b)', 'b = substr(g, 1, RSTART - 1)']], [TR(2)]],
    ['G4-marker-order-le', [['else if (NM > 0 && n + 0 <= LM + 0)', 'else if (NM > 0 && n + 0 < LM + 0)']], [TR(5)]],
    ['G5-no-last-marker-before-TF', [['{ TF = 1; TA = LM }', '{ TF = 1 }']], [TR(4)]],
    ['G6-KEEP-clause-removed', [["KEEP_AWK+=' || index($0, \";;; deoptimize at \") > 0 || index($0, \"@@LITE-MARK\") > 0'", "KEEP_AWK+=' || 0'"]], [TR(7)]],
    ['V1-unreadable-markers-fold-NO-VERDICT', [[OKL, OKL + '; [[ "$out" != *"markers unreadable"* ]] || VERDICT=NO-VERDICT']], [TR(7)]],
    ['V2-tier-line-printed-as-fn-line', [['  if [[ $ok == 1 ]]; then say "$out";', '  if [[ $ok == 1 ]]; then say "${out//tier    /  }";']], [TR(7)]],
    // V3 (A3 / A9 N6): a TIER_AWK exit != 0 folds NO-VERDICT into VERDICT, so the exit code moves 1 -> 2 (cut after the
    // MD-20 print, the one place tier_fn holds TIER_AWK's rc; DEOPT_AWK's rec pass and the "not reported" path untouched)
    ['V3-tier-awk-failure-moves-exit', [[OKL, OKL + '; [[ $rc == 0 ]] || VERDICT=NO-VERDICT']], [TR(8), TR(11)]],
    ['TW1-after-side-reads-before-rc', [['tier_fn "$fn" after "${RCA[0]}"', 'tier_fn "$fn" after "${RCB[0]}"']], [TR(13)]],
    ['TW2-tier-from-run-2', [[L0, 'tier_fn "$fn" before "${RCB[1]}" "${TXB[1]}"; tier_fn "$fn" after "${RCA[1]}" "${TXA[1]}"']], [TR(10)]],
    ['TW3-first-fn-only', [[FORFN + '\n  ' + L0, 'for fn in "${TARGETS[0]}"; do\n  ' + L0]], [TR(9)]],
    ['TW4-header-in-the-fn-loop', [[HDR + '   # A5: in every report that reaches VERDICT\n' + FORFN + '\n', FORFN + '\n' + HDR + '\n']], [TR(9)]],
    ['TW5-after-before-swapped', [[L0, 'tier_fn "$fn" after "${RCA[0]}" "${TXA[0]}"; tier_fn "$fn" before "${RCB[0]}" "${TXB[0]}"']], [TR(9)]],
    ['TW6-awk-rc-not-tested', [['if [[ $rc == 0 && -n "$out" ]]; then', 'if [[ -n "$out" ]]; then']], [TR(11)]],
    ['TW7-first-line-test-only', [['[[ "$rest" == *$\'\\n\'* ]] || break;', 'break;']], [TR(12)]],
];
// The B-four dd refusal mutant table (.handoff/PLAN-ext-audit-gB-four-dd.md TASK 5, ASSERTION A2): each of M36, M37, M40,
// M42, M44 turns the self-test red on EXACTLY its one check (85-89), never another; the edit sites are those of the
// approved B1 mutants (.handoff/evidence/ext-audit-b4/dd/a2/). M36 / M37 neutralize the MD-36 / MD-37 test; M40 / M42 /
// M44 delete the env-file / module / eval-print arm of the --v8-flags case.
const MD39 = '    --env-file*|--experimental-config-file*|--experimental-default-config-file*)\n      die "--v8-flags must not set $f: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process" ;;\n';
const MD42 = '    --require*|--import*|--loader*|--experimental-loader*)\n      die "--v8-flags must not set $f: it loads a module of yours into the measured process (a preload or a module loader)" ;;\n';
const MD44 = '    --eval*|--print*)\n      die "--v8-flags must not set $f: it runs code of yours in the measured process instead of the driver (--eval / --print: node evaluates it and the driver becomes argv), or prints V8 internals into the measured run (V8\'s --print-* flags)" ;;\n';
const OUT_MUTANTS = [
    ['M36-raw-symlink-test-off', [['  [[ ! -L "$OUT/raw" ]] || die "--out: $OUT/raw is a symlink', '  true || die "--out: $OUT/raw is a symlink']],
        ['refused before any spawn: MD-36 --out DIR whose raw/ is a symlink']],
    ['M37-report-hard-link-test-off', [['[[ ! -e "$OUT/report.txt" ]] || { RL=$(find "$OUT/report.txt" -links +1 2>/dev/null) && [[ -z "$RL" ]]; } || die', 'true || die']],
        ['refused before any spawn: MD-37 --out DIR whose report.txt has a second hard link']],
    ['M40-env-file-arm-deleted', [[MD39, '']], ['MD-39 refused before any spawn: --v8-flags --env-file=F']],
    ['M42-module-arm-deleted', [[MD42, '']], ['MD-42 refused before any spawn: --v8-flags --loader=F']],
    ['M44-eval-print-arm-deleted', [[MD44, '']], ['MD-44 refused before any spawn: --v8-flags --eval=F']],
];
// The MD-46 G2 mutant table (PLAN-md46 G2 TASK 4, ASSERTIONS A1 / A2): M-v8fl-off deletes the call (no --v8-options read:
// the refused token runs, FAKE_V8O_RC is never seen, every spawn pin reads 7); M-v8fl-late moves it below the --out mkdir
// block (the refusals still exit 2 after 2 spawns, but OUT now exists). Designed rows = checks 91 (b) and 92 (c).
const V8B = 'MD-50 refused after the --v8-options read';
const V8C = 'MD-56 a failing node --v8-options';
const V8FL_MUTANTS = [
    ['M-v8fl-off', [[V8FL_CALL, '']], [V8B, V8C]],
    ['M-v8fl-late', [[V8FL_CALL + OUT_BLOCK, OUT_BLOCK + V8FL_CALL]], [V8B, V8C]],
];
// Controls (must SURVIVE: W1 / W2 on the pre-r2 rec() body that swallowed an awk failure -- that is the gap W1 / W2 close)
const CONTROLS = [
    ['C1-W1-on-old-rec', [W1, [REC_NEW, REC_OLD]]],
    ['C2-W2-on-old-rec', [W2, [REC_NEW, REC_OLD]]],
];

// red = exit 1 and the summary line; every designed row is among the FAIL lines (by label prefix). exact: the FAIL
// lines are the designed rows and nothing else ("<rows> check(s) FAILED")
function assertKilled(name, r, rows, exact = false) {
    assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    if (exact) {
        assert.match(r.stdout, new RegExp(`^self-test: ${rows.length} check\\(s\\) FAILED$`, 'm'), `mutant ${name}: not exactly its row(s)\n${fl.join('\n')}`);
        assert.equal(fl.length, rows.length, `mutant ${name}: ${fl.length} FAIL line(s), designed ${rows.length}\n${fl.join('\n')}`);
    }
    for (const row of rows) {
        assert.ok(fl.some((l) => l.startsWith('FAIL ' + row)),
            `mutant ${name}: expected a FAIL line starting "${row}"\n${fl.join('\n')}`);
    }
}

assert.equal(MUTANTS.length, 36, 'the mutant table holds the 29 + 7 rows of the plan');
assert.equal(OUT_MUTANTS.length, 5, 'the B-four dd mutant table holds M36, M37, M40, M42, M44 (TASK 5)');
assert.equal(TIER_MUTANTS.length, 16, 'the tier mutant table holds G1-G6, V1-V3, TW1-TW7 (P3G3 TASK 6 + A9 (4))');
assert.equal(V8FL_MUTANTS.length, 2, 'the MD-46 G2 mutant table holds M-v8fl-off and M-v8fl-late (PLAN-md46 G2 TASK 4)');
// The mutant self-tests are independent, so they run in parallel (6 at a time) from module load; each test awaits its own.
let active = 0;
const waiting = [];
function gate() { return new Promise((res) => { const go = () => { active++; res(); }; if (active < 6) go(); else waiting.push(go); }); }
function release() { active--; const w = waiting.shift(); if (w) w(); }
function runOne(path, extra = [], env = ENV) {
    return new Promise((res) => {
        const c = spawn('bash', [path, '--self-test', ...extra], { env });
        let out = ''; let err = '';
        // SIGTERM, not SIGKILL: the script's EXIT trap then removes its own mktemp dir
        const t = setTimeout(() => c.kill('SIGTERM'), 180000);
        c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
        c.on('close', (status) => { clearTimeout(t); res({ status, stdout: out, stderr: err }); });
    });
}
// the temp dir is made inside the gate, so an interrupted run leaves at most 6 dirs, never one per mutant
function launch(name, edits, extra = [], env = ENV) {
    return (async () => {
        await gate();
        const dir = mkdtempSync(join(tmpdir(), `dd-${name.slice(0, 3)}-`));
        try { return await runOne(variant(dir, name.replace(/[^A-Za-z0-9]/g, '_'), edits), extra, env); }
        finally { rmSync(dir, { recursive: true, force: true }); release(); }
    })();
}
const KILLS = skip ? null : MUTANTS.map(([name, edits]) => { const p = launch(name, edits, [], envFor(name)); p.catch(() => {}); return p; });
// the unmutated copy under the NUL shim: the control row, and the revert baseline of NUL_MUTANTS on a NUL-clean host
const NBASE = skip ? null : launch('baseline-nul', [['#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n']], [], NULENV);
if (NBASE) NBASE.catch(() => {});
const TKILLS = skip ? null : TIER_MUTANTS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
const OKILLS = skip ? null : OUT_MUTANTS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
const VKILLS = skip ? null : V8FL_MUTANTS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
const SURV = skip ? null : CONTROLS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
function killRows(table, kills, exact = false) { table.forEach(([name, , rows], i) => {
    test(`deopt-diff --self-test MUST FAIL on mutant ${name}${exact ? ' (exactly its designed row)' : ''}`, { skip }, async () => {
        assertKilled(name, await kills[i], rows, exact);
    });
    // revert check: the unmutated script must NOT satisfy the same assertion (one shared baseline run)
    test(`deopt-diff mutant ${name}: revert check (the unmutated run fails the same assertion)`, { skip }, async () => {
        // a NUL mutant run under the shim is reverted against the unmutated run under the same shim
        const b = envFor(name) === ENV ? base() : await NBASE;
        // each designed prefix names exactly ONE ok line of the baseline (a widened prefix such as 'e2e' would match many)
        const oks = b.stdout.split('\n').filter((l) => l.startsWith('ok '));
        for (const row of rows) {
            assert.equal(oks.filter((l) => l.startsWith('ok ' + row)).length, 1, `prefix "${row}" must match exactly one self-test row`);
        }
        assert.throws(() => assertKilled(name, b, rows, exact), assert.AssertionError, `mutant ${name}: the kill assertion passes with no mutation`);
    });
}); }
killRows(MUTANTS, KILLS);
killRows(TIER_MUTANTS, TKILLS);
killRows(OUT_MUTANTS, OKILLS, true);
killRows(V8FL_MUTANTS, VKILLS);
CONTROLS.forEach(([name], i) => {
    test(`deopt-diff --self-test control ${name} must SURVIVE`, { skip }, async () => {
        const r = await SURV[i];
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.equal(okCount(r.stdout), CHECKS);
    });
});

// --- b37 "NUL mutants": the probe + shim pinned (their own rows). ORACLE: the ruling's BSD record semantics (a record
// is cut at its first NUL) and the real awk run directly on the same input, never the shim's own output.
function awkRun(bin, args, input, env = ENV) {
    const r = spawnSync(bin, args, { input: input === undefined ? undefined : Buffer.from(input, 'latin1'), env, timeout: 30000 });
    return { status: r.status, out: r.stdout ? r.stdout.toString('latin1') : '', err: r.stderr ? r.stderr.toString('latin1') : '' };
}
test('nul-awk probe: the host awk reads a<NUL>b as length 3 (NUL-clean) or 1 (truncating); the NUL mutants take the shim iff NUL-clean', { skip }, (t) => {
    t.diagnostic(`host awk ${NUL.awk}: length(a<NUL>b) = ${NUL.len} -> ${NUL.nulClean ? 'NUL-clean: T1 / Rf run under the shim' : 'truncating: T1 / Rf run as is'}`);
    assert.ok(NUL.len === 1 || NUL.len === 3, String(NUL.len));
    assert.equal(NUL.nulClean, NUL.len === 3);
    for (const n of NUL_MUTANTS) assert.ok(MUTANTS.some(([m]) => m === n), `${n} is in MUTANTS`);
    for (const [name] of [...MUTANTS, ...TIER_MUTANTS, ...OUT_MUTANTS, ...V8FL_MUTANTS]) {
        assert.equal(envFor(name), NUL.nulClean && NUL_MUTANTS.has(name) ? NULENV : ENV, name);
    }
});
test('nul-awk shim: first on PATH, execs the real awk (never itself), cuts a<NUL>b to a, NUL-free input and argv byte-identical, exit status kept', { skip }, () => {
    const { awk, real, dir } = NULSHIM;
    assert.ok(real.startsWith('/') && !realpathSync(real).startsWith(dir + '/') && realpathSync(real) !== awk, real);
    assert.equal(readFileSync(awk, 'utf8').split(`my $real = '${real}';`).length - 1, 1, 'the real awk path is baked in, once');
    assert.equal(probeAwk(NULENV).awk, awk, 'the shim is the first awk on the NUL PATH');
    assert.deepEqual(probeAwk(NULENV), { awk, len: 1, nulClean: false });
    assert.equal(awkRun(awk, ['{ print }'], 'a\0b\n').out, 'a\n');
    assert.equal(awkRun(awk, ['{ print NR ":" $0 }'], 'x\0y\nab\n\0zz\nq').out, '1:x\n2:ab\n3:\n4:q\n');
    // a final NUL-led record with no trailing newline stays a record (empty), as on BSD awk (the oracle, when present)
    const LASTNUL = [['{ print NR ":" $0 } END { print NR }'], 'x\n\0y'];
    assert.equal(awkRun(awk, ...LASTNUL).out, '1:x\n2:\n2\n');
    if (process.platform === 'darwin') assert.equal(awkRun('/usr/bin/awk', ...LASTNUL).out, '1:x\n2:\n2\n', 'BSD awk oracle');
    // a NUL line longer than one 65536-byte read: the cut carries across the shim's sysread chunks
    assert.equal(awkRun(awk, ['{ print NR ":" length($0) ":" substr($0, 1, 3) }'], 'a\0' + 'z'.repeat(70000) + '\nb\n').out, '1:1:a\n2:1:b\n');
    const dd = mkdtempSync(join(tmpdir(), 'dd-nulpin-'));
    try {
        writeFileSync(join(dd, 'f1'), 'u:v\nw:z\n');
        const cases = [
            [['-F', ':', '-v', 'k=K', '{ print k, NF, $2, (FILENAME == ARGV[1]) }', join(dd, 'f1')], '', 0, 'K 2 v 1\nK 2 z 1\n'],
            [['{ print length($0) ":" $0 }'], 'p q\tr\n\nlast \x7f~', 0, '5:p q\tr\n0:\n7:last \x7f~\n'],
            [['BEGIN { exit 3 }'], 'x\n', 3, ''],
            [['{ exit 4 }'], 'x\n', 4, ''],
            [['{'], 'x\n', -1, ''],
        ];
        for (const [args, input, rc, text] of cases) {
            const want = awkRun(real, args, input); const got = awkRun(awk, args, input);
            // the oracle: the real awk itself gives the status / text this case was written for (-1: any non-zero)
            assert.deepEqual([rc < 0 ? want.status !== 0 : want.status === rc, want.out], [true, text], `real awk: ${args.join(' ')}`);
            assert.deepEqual({ status: got.status, out: got.out }, { status: want.status, out: want.out }, args.join(' '));
        }
        assert.deepEqual([awkRun(awk, ['BEGIN { exit 3 }'], '').status, awkRun(awk, ['{ exit 4 }'], 'x\n').status], [3, 4]);
        assert.notEqual(awkRun(awk, ['{'], 'x\n').status, 0, 'a syntax error stays non-zero');
        // never itself: a second shim written into a dir that already holds one, that dir first on PATH, still execs the real awk
        const sd = join(dd, 'again'); mkdirSync(sd);
        const s1 = buildNulCutAwk(sd, ENV);
        const s2 = buildNulCutAwk(sd, { ...ENV, PATH: s1.dir + ':' + ENV.PATH });
        assert.deepEqual([s2.awk, realpathSync(s2.real)], [s1.awk, realpathSync(real)]);
        assert.equal(awkRun(s2.awk, ['{ print }'], 'q\0r\n').out, 'q\n');
        // stdin that never reaches EOF (a FIFO held open read-write): an awk that never reads stdin still exits
        const r = spawnSync('bash', ['-c', 'mkfifo "$1/ff" && exec 3<>"$1/ff" && exec "$2" "BEGIN { print 7 }" <&3', 'pin', dd, awk],
            { encoding: 'utf8', env: ENV, timeout: 20000 });
        assert.deepEqual([r.status, r.stdout], [0, '7\n'], r.stderr);
    } finally { rmSync(dd, { recursive: true, force: true }); }
});
test('nul-awk shim on an EMULATED NUL-clean awk (the Linux case on any host): the probe reads 3 under it, 1 with the shim first', { skip }, () => {
    const dd = mkdtempSync(join(tmpdir(), 'dd-nulemu-'));
    try {
        mkdirSync(join(dd, 'emu')); mkdirSync(join(dd, 'cut'));
        const emu = buildNulCleanAwk(join(dd, 'emu'), ENV);
        const envE = { ...ENV, LC_ALL: 'C', PATH: emu.dir + ':' + ENV.PATH };   // C locale: 0xFF is one byte = one char
        assert.deepEqual(probeAwk(envE), { awk: emu.awk, len: 3, nulClean: true });
        assert.equal(awkRun(emu.awk, ['{ print }'], 'a\0b\n').out, 'a\0b\n', 'the emulator keeps the NUL in and out');
        const cut = buildNulCutAwk(join(dd, 'cut'), envE);
        assert.equal(cut.real, emu.awk, 'the shim execs the next awk on PATH (the emulator), not itself');
        const envC = { ...envE, PATH: cut.dir + ':' + envE.PATH };
        assert.deepEqual(probeAwk(envC), { awk: cut.awk, len: 1, nulClean: false });
        assert.equal(awkRun(cut.awk, ['{ print }'], 'a\0b\nc\n').out, 'a\nc\n');
    } finally { rmSync(dd, { recursive: true, force: true }); }
});
test(`deopt-diff --self-test under the NUL shim (control): the UNMUTATED copy passes all ${CHECKS} checks, the NUL rows included`, { skip }, async () => {
    const r = await NBASE;
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(okCount(r.stdout), CHECKS);
    const oks = r.stdout.split('\n').filter((l) => l.startsWith('ok '));
    for (const row of [R.nul, R.nul0]) assert.equal(oks.filter((l) => l.startsWith('ok ' + row)).length, 1, row);
});

// =====================================================================================================================
// P3G4 T4: --self-test --fixtures FIX (the S-9 real-trace rows F1-F17). ORACLE: the P3G4 G4 plan (C + F ok rows and the
// summary line computed from the constants; one `FAIL fixture <driver>.txt` line per missing file; the DESIGNED F rows
// of the M1 / M3 / S1 mutants from .handoff/evidence/p3g4/gv-mutants/MANIFEST.txt), never what the script printed.
// =====================================================================================================================
const FIXN = CHECKS + FIXTURE_ROWS;
const FX = (n) => `fixture F${n} `;   // ends in a space: `fixture F1 ` never names F10-F17
function assertFixturesOk(r) {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), FIXN, `want ${CHECKS} + ${FIXTURE_ROWS} ok rows`);
    const fx = r.stdout.split('\n').filter((l) => l.startsWith('ok fixture '));
    assert.equal(fx.length, FIXTURE_ROWS, `want ${FIXTURE_ROWS} 'ok fixture ' rows`);
    for (let n = 1; n <= FIXTURE_ROWS; n++) assert.equal(fx.filter((l) => l.startsWith('ok ' + FX(n))).length, 1, `one ok row for F${n}`);
    const lines = r.stdout.split('\n').filter((l) => l !== '');
    assert.equal(lines[lines.length - 1], `self-test: ${FIXN} check(s) ok`);
}
// a copy of FIX without deopt.txt: exit 1, the summary FAILED line, exactly one missing-file line and it names deopt.txt
const MISSING = (x) => `FAIL fixture ${x}.txt: missing or not a readable file`;
function assertMissingDeopt(r) {
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
    const lines = r.stdout.split('\n');
    assert.ok(lines.includes(MISSING('deopt')), `missing "${MISSING('deopt')}"\n${r.stdout}`);
    assert.deepEqual(lines.filter((l) => /^FAIL fixture \S+\.txt: missing or not a readable file$/.test(l)), [MISSING('deopt')]);
}
// ifalse: the fixture block never runs, so the run is green with C rows and no fixture row -- red on the C + F count only
function assertCountKill(r) {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(okCount(r.stdout), CHECKS);
    assert.doesNotMatch(r.stdout, /^ok fixture /m);
    assert.throws(() => assertFixturesOk(r), new RegExp(`want ${CHECKS} \\+ ${FIXTURE_ROWS} ok rows`));
}
const MUT_EDITS = (n) => MUTANTS.find(([m]) => m === n)[1];   // the same exact-once edits as the canned-trace table
const FIX_MUTANTS = [
    ['M1-offset-kept-in-D', MUT_EDITS('M1-offset-kept-in-D'), [1, 3, 5, 7, 12, 15, 16].map(FX)],
    ['M3-prefix-name-match', MUT_EDITS('M3-prefix-name-match'), [8, 10].map(FX)],
    ['S1-OSR-dropped', MUT_EDITS('S1-no-OSR-suffix'), [6, 17].map(FX)],
];
const IFALSE = [['  if [[ -n "$FIXTURES" ]]; then\n    local FXD', '  if false; then\n    local FXD']];
const FXARGS = ['--fixtures', FIX];
const FBASE = skip ? null : launch('baseline-fix', [['#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n']], FXARGS);
const FKILLS = skip ? null : FIX_MUTANTS.map(([name, edits]) => launch(name, edits, FXARGS));
const IKILL = skip ? null : launch('ifalse', IFALSE, FXARGS);
for (const p of [FBASE, IKILL, ...(FKILLS || [])]) if (p) p.catch(() => {});

test(`deopt-diff --self-test --fixtures FIX: exit 0, ${CHECKS} + ${FIXTURE_ROWS} ok rows, ${FIXTURE_ROWS} 'ok fixture ' rows, last line 'self-test: ${FIXN} check(s) ok'`, { skip }, () => {
    assertFixturesOk(selfTest(SCRIPT, FXARGS));
});
test('deopt-diff --self-test --fixtures FIX: an unmodified copy outside the repo passes (baseline for the fixture mutants)', { skip }, async () => {
    assertFixturesOk(await FBASE);
});
test('deopt-diff --self-test --fixtures COPY (FIX without deopt.txt) -> exit 1 and a FAIL fixture deopt.txt line', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'dd-fx-'));
    try {
        const cp = join(dir, 'fx');
        mkdirSync(cp);
        for (const n of readdirSync(FIX)) if (n !== 'deopt.txt') copyFileSync(join(FIX, n), join(cp, n));
        assertMissingDeopt(selfTest(SCRIPT, ['--fixtures', cp]));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('deopt-diff --fixtures missing-file row: revert check (the full FIX run fails the same assertion)', { skip }, async () => {
    const b = await FBASE;
    assert.throws(() => assertMissingDeopt(b), assert.AssertionError);
});
test(`deopt-diff --self-test --fixtures MUST FAIL the C + F count on mutant ifalse (the fixture block never runs)`, { skip }, async () => {
    assertCountKill(await IKILL);
});
test('deopt-diff mutant ifalse: revert check (the unmutated --fixtures run fails the same assertion)', { skip }, async () => {
    const b = await FBASE;
    assert.throws(() => assertCountKill(b), assert.AssertionError);
});
FIX_MUTANTS.forEach(([name, , rows], i) => {
    test(`deopt-diff --self-test --fixtures MUST FAIL on mutant ${name} (its designed fixture rows)`, { skip }, async () => {
        assertKilled(name, await FKILLS[i], rows);
    });
    test(`deopt-diff mutant ${name} --fixtures: revert check (the unmutated run fails the same assertion)`, { skip }, async () => {
        const b = await FBASE;
        const oks = b.stdout.split('\n').filter((l) => l.startsWith('ok '));
        for (const row of rows) assert.equal(oks.filter((l) => l.startsWith('ok ' + row)).length, 1, `prefix "${row}" must match exactly one self-test row`);
        assert.throws(() => assertKilled(name, b, rows), assert.AssertionError, `mutant ${name}: the kill assertion passes with no mutation`);
    });
});

// PLAN-md46 G1 "Shared -h text for G2-G5, verbatim" (MD-46), compared with all whitespace runs collapsed to one space
const V8FL_HELP = 'Accepted: V8 flags this node lists in --v8-options -- bool as --flag or --no-flag (never --noflag), numeric as ' +
    '--flag=N -- except log / trace / print / prof / perf / dump / snapshot / file flags. Refused, exit 2 after one ' +
    '--v8-options read and before any measured run: every node option (--run, --test, --watch, --check, --inspect, ' +
    '--cpu-prof, --snapshot-blob, ...), every string-valued V8 flag, and the tool\'s own flags above.';
function assertHelp(r) {
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /^deopt-diff\.sh -- the DEOPTIMIZATIONS of NAMED functions/m);
    assert.match(r.stdout, /cannot read driver output in run <k> \(<tee\|tr\|awk> exited <rc>\)/);
    assert.match(r.stdout, /the first failure in the order awk > tr > tee > driver exit is named/);
    const flat = r.stdout.replace(/\s+/g, ' ');
    assert.equal(flat.split(V8FL_HELP).length - 1, 1, 'the shared MD-46 -h text exactly once (whitespace collapsed)');
    assert.ok(flat.includes('-r / -e / -p are refused as non-flags. ' + V8FL_HELP), 'the shared text follows the -r / -e / -p sentence');
}
test('deopt-diff -h: exit 2, the usage header (reason list and precedence line) and the shared MD-46 --v8-flags text', { skip }, () => {
    assertHelp(spawnSync('bash', [SCRIPT, '-h'], { encoding: 'utf8', timeout: 60000, env: ENV }));
});

// --- e2e rows from the B2-r2 review: fail-closed shapes no self-test row pins. A fake node (bash) answers --version
// with v26.8.2, --v8-options with a canned list (MD-46: test/fixtures/v8flags/v8-options.v26.8.2.txt lines 1551-1552,
// verbatim) and otherwise cats ./trace.txt of its cwd (the driver's dir); every spawn is logged, both answers included.
// Canned V8 node v26.8.2 lines (copied from the self-test's canned trace; fn = add).
const E9 = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const D10 = '[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>, 0x140083075c49 <Code TURBOFAN_JS>, opt id 2, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f6425b4]';
const REASON = (why) => `  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: ${why}`;

// run SCRIPTPATH: before = the mono trace (E only), after = AFTER (raw bytes); -> { status, lines, spawns, out }
function e2e(script, after) {
    const dir = mkdtempSync(join(tmpdir(), 'dd-e2e-'));
    try {
        const fk = join(dir, 'fk');
        mkdirSync(fk);
        writeFileSync(join(fk, 'node'), [`#!${process.env.BASH || '/bin/bash'}`, 'd=$(dirname "$0")', 'echo x >>"$d/log"',
            'case "$1" in --version) echo v26.8.2; exit 0 ;; esac', 'case "$1" in --v8-options) cat "$d/v8o.txt"; exit 0 ;; esac',
            'if [ -f ./trace.txt ]; then cat ./trace.txt; fi', 'exit 0', ''].join('\n'));
        chmodSync(join(fk, 'node'), 0o755);
        writeFileSync(join(fk, 'v8o.txt'), '  --allow-natives-syntax (allow natives syntax)\n        type: bool  default: --no-allow-natives-syntax\n');
        for (const [n, text] of [['before', E9 + '\n'], ['after', after]]) {
            mkdirSync(join(dir, n));
            writeFileSync(join(dir, n, 'driver.js'), '');
            writeFileSync(join(dir, n, 'trace.txt'), text);
        }
        writeFileSync(join(fk, 'log'), '');
        const r = spawnSync('bash', [script, '--node', join(fk, 'node'), '--fn', 'add', join(dir, 'before', 'driver.js'), join(dir, 'after', 'driver.js')],
            { encoding: 'utf8', timeout: 60000, env: ENV, cwd: dir });
        const out = r.stdout + r.stderr;
        return { status: r.status, out, lines: out.split('\n'), spawns: readFileSync(join(fk, 'log'), 'utf8').split('\n').filter(Boolean).length };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
// exit 2, one VERDICT line (NO-VERDICT, never SAME / DIFF), 8 spawns (R=3: 1 version + 1 --v8-options + 3 + 3), the OWN reason line
function assertX(r, why) {
    assert.equal(r.status, 2, r.out);
    assert.deepEqual(r.lines.filter((l) => l.startsWith('VERDICT ')), ['VERDICT NO-VERDICT'], r.out);
    assert.equal(r.spawns, 8, r.out);
    assert.ok(r.lines.includes(REASON(why)), `missing reason line "${REASON(why)}"\n${r.out}`);
}
const E_ROWS = [
    // E1: the real V8 glue -- a non-bracket glue token (so KEEP_AWK keeps it only through its clause), then the E line WITH its space after "compiling", then a D line
    ['E1 glued ....[completed compiling (with the space) then a D line', `....${E9}\n${D10}\n`, 'trace text not at line start',
        // teeth: without the glued-E clause the E vanishes, the D alone counts: after has 1 deopt vs 0 -> DIFF exit 1
        [[GE_X, 'else if (index($0, "[bailout") > 0) x(']]],
    // E2: CR glue -- "abc" CR then the bailout on one physical line
    ['E2 CR glue: abc CR [bailout ...] on one line', `${E9}\nabc\r${D10}\n`, 'trace text not at line start',
        // teeth: without the bailout clause the line is silently dropped -> after = 1 E, 0 D -> SAME exit 0
        [['else if (index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0) x(', 'else if (index($0, "[completed compiling") > 0) x(']]],
    // E3: a CRLF-terminated bailout: the CR stays on the line, so the record fails its own parse (never SAME / DIFF)
    ['E3 CRLF bailout', `${E9}\n${D10}\r\n`, 'bailout: after code tier',
        // teeth: a record awk that strips the trailing CR parses the bailout and counts a deopt (after 0 -> 1) -> DIFF exit 1, not 2
        [[AWK0, "DEOPT_AWK='\n{ sub(/\\r$/, \"\") }\nfunction names("]]],
];
for (const [label, after, why, teeth] of E_ROWS) {
    test(`deopt-diff e2e ${label} -> exit 2, NO-VERDICT, '${why}'`, { skip }, () => {
        assertX(e2e(SCRIPT, after), why);
    });
    test(`deopt-diff e2e ${label}: revert check (a script lacking the guard fails the row)`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), 'dd-et-'));
        try {
            const p = variant(dir, 'teeth', teeth);
            assert.throws(() => assertX(e2e(p, after), why), assert.AssertionError);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
