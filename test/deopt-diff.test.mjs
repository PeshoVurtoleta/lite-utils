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
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'deopt-diff.sh');
const CHECKS = 84;   // every `check` call in self_test(): 53 driver-mode rows + 18 ref/file rows (S1-S4, R1-R14) + 13 tier rows (T1-T13); a new check moves this literal
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
// the host environment never reaches the script (NODE_OPTIONS would make the fake node exit 7; editor vars are git's)
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];

function selfTest(path) {
    return spawnSync('bash', [path, '--self-test'], { encoding: 'utf8', timeout: 120000, env: ENV });
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
    ['Nb-version-probe-after-mkdir', [[
        'GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"\n' +
        'if [[ -n "$OUT" ]]; then\n' +
        '  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"\n' +
        '  # keep the logical OUT name when it is the same directory as the given OUT, else print the physical one\n' +
        '  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L\n' +
        '  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check\n' +
        'fi\n',
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
// Controls (must SURVIVE: W1 / W2 on the pre-r2 rec() body that swallowed an awk failure -- that is the gap W1 / W2 close)
const CONTROLS = [
    ['C1-W1-on-old-rec', [W1, [REC_NEW, REC_OLD]]],
    ['C2-W2-on-old-rec', [W2, [REC_NEW, REC_OLD]]],
];

// red = exit 1 and the summary line; every designed row is among the FAIL lines (by label prefix)
function assertKilled(name, r, rows) {
    assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    for (const row of rows) {
        assert.ok(fl.some((l) => l.startsWith('FAIL ' + row)),
            `mutant ${name}: expected a FAIL line starting "${row}"\n${fl.join('\n')}`);
    }
}

assert.equal(MUTANTS.length, 36, 'the mutant table holds the 29 + 7 rows of the plan');
assert.equal(TIER_MUTANTS.length, 16, 'the tier mutant table holds G1-G6, V1-V3, TW1-TW7 (P3G3 TASK 6 + A9 (4))');
// The mutant self-tests are independent, so they run in parallel (6 at a time) from module load; each test awaits its own.
let active = 0;
const waiting = [];
function gate() { return new Promise((res) => { const go = () => { active++; res(); }; if (active < 6) go(); else waiting.push(go); }); }
function release() { active--; const w = waiting.shift(); if (w) w(); }
function runOne(path) {
    return new Promise((res) => {
        const c = spawn('bash', [path, '--self-test'], { env: ENV });
        let out = ''; let err = '';
        // SIGTERM, not SIGKILL: the script's EXIT trap then removes its own mktemp dir
        const t = setTimeout(() => c.kill('SIGTERM'), 180000);
        c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
        c.on('close', (status) => { clearTimeout(t); res({ status, stdout: out, stderr: err }); });
    });
}
// the temp dir is made inside the gate, so an interrupted run leaves at most 6 dirs, never one per mutant
function launch(name, edits) {
    return (async () => {
        await gate();
        const dir = mkdtempSync(join(tmpdir(), `dd-${name.slice(0, 3)}-`));
        try { return await runOne(variant(dir, name.replace(/[^A-Za-z0-9]/g, '_'), edits)); }
        finally { rmSync(dir, { recursive: true, force: true }); release(); }
    })();
}
const KILLS = skip ? null : MUTANTS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
const TKILLS = skip ? null : TIER_MUTANTS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
const SURV = skip ? null : CONTROLS.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
function killRows(table, kills) { table.forEach(([name, , rows], i) => {
    test(`deopt-diff --self-test MUST FAIL on mutant ${name}`, { skip }, async () => {
        assertKilled(name, await kills[i], rows);
    });
    // revert check: the unmutated script must NOT satisfy the same assertion (one shared baseline run)
    test(`deopt-diff mutant ${name}: revert check (the unmutated run fails the same assertion)`, { skip }, () => {
        // each designed prefix names exactly ONE ok line of the baseline (a widened prefix such as 'e2e' would match many)
        const oks = base().stdout.split('\n').filter((l) => l.startsWith('ok '));
        for (const row of rows) {
            assert.equal(oks.filter((l) => l.startsWith('ok ' + row)).length, 1, `prefix "${row}" must match exactly one self-test row`);
        }
        assert.throws(() => assertKilled(name, base(), rows), assert.AssertionError, `mutant ${name}: the kill assertion passes with no mutation`);
    });
}); }
killRows(MUTANTS, KILLS);
killRows(TIER_MUTANTS, TKILLS);
CONTROLS.forEach(([name], i) => {
    test(`deopt-diff --self-test control ${name} must SURVIVE`, { skip }, async () => {
        const r = await SURV[i];
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.equal(okCount(r.stdout), CHECKS);
    });
});

test('deopt-diff -h: exit 2 and the usage header (reason list and precedence line)', { skip }, () => {
    const r = spawnSync('bash', [SCRIPT, '-h'], { encoding: 'utf8', timeout: 60000, env: ENV });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /^deopt-diff\.sh -- the DEOPTIMIZATIONS of NAMED functions/m);
    assert.match(r.stdout, /cannot read driver output in run <k> \(<tee\|tr\|awk> exited <rc>\)/);
    assert.match(r.stdout, /the first failure in the order awk > tr > tee > driver exit is named/);
});

// --- e2e rows from the B2-r2 review: fail-closed shapes no self-test row pins. A fake node (bash) answers --version
// with v26.8.2 and otherwise cats ./trace.txt of its cwd (the driver's dir); every spawn is logged.
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
            'case "$1" in --version) echo v26.8.2; exit 0 ;; esac', 'if [ -f ./trace.txt ]; then cat ./trace.txt; fi', 'exit 0', ''].join('\n'));
        chmodSync(join(fk, 'node'), 0o755);
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
// exit 2, one VERDICT line (NO-VERDICT, never SAME / DIFF), 7 spawns (R=3: 1 version + 3 + 3), the OWN reason line
function assertX(r, why) {
    assert.equal(r.status, 2, r.out);
    assert.deepEqual(r.lines.filter((l) => l.startsWith('VERDICT ')), ['VERDICT NO-VERDICT'], r.out);
    assert.equal(r.spawns, 7, r.out);
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
