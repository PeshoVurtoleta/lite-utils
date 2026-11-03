// test/ic-diff.test.mjs -- ../ic-diff.sh: --self-test (canned --log-ic text + a fake node), mutants, -h, A4 rows.
// ORACLE: .handoff/PLAN-phase5-g1.md TASK 6 + ASSERTIONS A1-A4 as amended by A2 / A6 / A7 / A9 / A10, and the B2
// mutant table (.handoff/evidence/p5g1/b2/mutants.py: anchors, descriptions and designed rows copied verbatim), never
// what the script printed. TIER: DETERMINISTIC (no V8 spawn: the self-test feeds canned text and its own fake node; the
// A4 / argv rows below run this file's OWN fake node, written in a temp dir). A real-node verdict is STATISTICAL and is
// never part of npm test.
// Mutants: each is ONE exact-once edit (an anchor that matches 0 or > 1 times fails the row) on a temp copy of the
// built root script; it must exit 1 with the FAILED summary and FAIL every designed row (found by label prefix, so a
// mutant that breaks only some other row is not a kill). Each revert row reruns the kill assertion on the UNMUTATED
// copy and requires it to throw. Not in the table: M-sigwin (B2: SURVIVES on bash 3.2, which runs a pending INT / TERM
// trap only after the $(mktemp) assignment completes -- a host-semantics survivor, not a kill row).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'ic-diff.sh');
const C = 64;   // self-test ok lines at 127d991 (src 75922772 / root 7fbb7e4a, plan A10); a new check moves this literal
const PAR = 6;  // mutant self-tests in flight at once
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
// the host environment never reaches the script (NODE_OPTIONS / NODE_COMPILE_CACHE would make the fake nodes exit 7;
// NODE would pick another node; editor vars are git's)
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];

// The 64 self-test rows in print order: a prefix of each "ok <label>" that names exactly that one row.
const ROW = [null,
    /*  1 */ 'A1 records: mono fn=get',
    /*  2 */ 'A1 records: the LAST',
    /*  3 */ 'A1 records: exact names',
    /*  4 */ 'A1 records: every pc,',
    /*  5 */ 'A1 join NEWEST-FIRST: a',
    /*  6 */ 'A1 code-move: get moved,',
    /*  7 */ 'A1 / D-b keyed',
    /*  8 */ "A2 D-d getter: fn='get",
    /*  9 */ 'S6 one-digit line /',
    /* 10 */ 'S6 a key equal',
    /* 11 */ "S6 'X,X' at a",
    /* 12 */ 'S6 / A2 an',
    /* 13 */ 'A2 an IC pc',
    /* 14 */ 'A2 a code-move from',
    /* 15 */ 'A2 a 10-field IC',
    /* 16 */ 'A2 an IC line',
    /* 17 */ 'A2 M15 a torn',
    /* 18 */ 'A2 KeyedHasIC -> X',
    /* 19 */ 'A2 code-creation JS,14 ->',
    /* 20 */ 'A9 hex width: an',
    /* 21 */ 'A9 hex width: a code-move',
    /* 22 */ 'judge: 3 identical runs',
    /* 23 */ 'judge A2: driver exit',
    /* 24 */ 'judge: a log reason',
    /* 25 */ 'judge A2: an X',
    /* 26 */ 'judge A2: run 2',
    /* 27 */ 'judge A2: no IC',
    /* 28 */ 'judge A2: every site',
    /* 29 */ 'D-b a Symbol key',
    /* 30 */ 'A3 diff_fn: {1,1} vs',
    /* 31 */ 'A9 basename collision: get',
    /* 32 */ 'A3 / A7 R-a',
    /* 33 */ 'A3 e2e: mono vs',
    /* 34 */ 'A7 R-b: --runs 2',
    /* 35 */ 'A7 R-c / K2:',
    /* 36 */ 'A7 R-d / K2:',
    /* 37 */ 'A7 R-e / K3:',
    /* 38 */ 'A7 K1: --version exit',
    /* 39 */ 'A7 R-f / K4:',
    /* 40 */ 'A7 R-g control: a',
    /* 41 */ 'A4 --out: exit 1',
    /* 42 */ 'A2 e2e: no isolate',
    /* 43 */ 'A2 / M16 e2e:',
    /* 44 */ 'A2 e2e: 2 v8-version',
    /* 45 */ 'A9 e2e: a NUL',
    /* 46 */ 'A2 e2e: no final',
    /* 47 */ 'A2 e2e: driver exit',
    /* 48 */ 'A2 e2e: an unresolved',
    /* 49 */ 'A2 e2e: run 2',
    /* 50 */ 'A2 e2e: --fn nosuch',
    /* 51 */ 'bug class: a driver',
    /* 52 */ 'A9 relative PATH (PATH=nm:...):',
    /* 53 */ 'A4 retention: 3 x',
    /* 54 */ 'A9 signal window: a',
    /* 55 */ 'refused before any spawn: repeated',
    /* 56 */ 'refused before any spawn: qualified',
    /* 57 */ 'refused before any spawn: --runs 1',
    /* 58 */ 'refused before any spawn: --runs 21',
    /* 59 */ 'refused before any spawn: one',
    /* 60 */ 'refused before any spawn: a log',
    /* 61 */ 'refused before any spawn: a snapshot',
    /* 62 */ 'refused before any spawn: a non-flag',
    /* 63 */ 'refused before any spawn: unknown',
    /* 64 */ 'refused before any spawn: a node',
];

function selfTest(path) {
    return spawnSync('bash', [path, '--self-test'], { encoding: 'utf8', timeout: 300000, env: ENV });
}
function okLines(out) { return out.split('\n').filter((l) => l.startsWith('ok ')); }
function rowLines(out) { return out.split('\n').filter((l) => l.startsWith('ok ') || l.startsWith('FAIL ')); }

// A copy of the script in DIR, with exact-once edits (each anchor must match exactly once, else the row is invalid).
function variant(dir, name, edits) {
    let src = readFileSync(SCRIPT, 'utf8');
    for (const [from, to] of edits) {
        const n = src.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
        src = src.replace(from, () => to);
    }
    const p = join(dir, `${name.replace(/[^A-Za-z0-9]/g, '_')}.sh`);
    writeFileSync(p, src);
    chmodSync(p, 0o755);
    return p;
}

// --- row 1: the in-repo script; row 2: an unmodified copy outside the repo (os.tmpdir), the mutants' baseline ---
let ROOT = null;
function root() { if (!ROOT) ROOT = selfTest(SCRIPT); return ROOT; }
let BASE = null;
let BASE_DIR = null;
function base() {
    if (BASE) return BASE;
    const dir = mkdtempSync(join(tmpdir(), 'icd-base-'));
    BASE_DIR = dir;
    try { BASE = selfTest(variant(dir, 'baseline', [['#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n']])); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    return BASE;
}
function assertGreen(r) {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`^self-test: ${C} check\\(s\\) ok$`, 'm'));
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okLines(r.stdout).length, C);
    assert.equal(r.stderr, '');
}

test(`ic-diff --self-test: exactly ${C} ok lines, 0 FAIL, exit 0`, { skip }, () => {
    assertGreen(root());
});

test('ic-diff --self-test: an unmodified copy outside the repo (os.tmpdir) passes, the same ok labels in the same order', { skip }, () => {
    const r = base();
    assertGreen(r);
    assert.ok(relative(dirname(SCRIPT), BASE_DIR).startsWith('..'), `the copy ${BASE_DIR} is inside the repo`);
    assert.deepEqual(okLines(r.stdout), okLines(root().stdout));
});

test('ic-diff --self-test: the ROW table names each printed row in order, each prefix exactly one row', { skip }, () => {
    const rows = rowLines(base().stdout);
    assert.equal(rows.length, C);
    for (let i = 1; i <= C; i++) {
        assert.ok(rows[i - 1].startsWith('ok ' + ROW[i]), `row ${i} is "${rows[i - 1]}", want prefix "${ROW[i]}"`);
        assert.equal(rows.filter((l) => l.startsWith('ok ' + ROW[i])).length, 1, `prefix "${ROW[i]}" must match exactly one row`);
    }
});

// --- mutants: [id, designed rows, description, exact-once edits] ---
// B2 table (mutants.py, 62 rows minus M-sigwin): anchors / rows / descriptions verbatim (json-escaped).
const B2 = [
    ["M-own-rest", [1], "owner: any rest accepted (node's own `get node:...` counted)",
        [["if (substr(r, 1, 1) == \"/\" || substr(r, 1, 8) == \"file:///\") {",
          "if (1) {"]]],
    ["M6", [2], "first IC line per site kept, not the last",
        [["FIN[k] = $7; MOD[k] = $10;",
          "if (!(k in FIN)) FIN[k] = $7; MOD[k] = $10;"]]],
    ["M9", [3], "fn matched as a bare prefix of the code name",
        [["if (substr(nm, 1, length(f) + 1) != f \" \") continue\n    r = substr(nm, length(f) + 2)",
          "if (index(nm, f) != 1) continue\n    r = substr(nm, index(nm, \" \") + 1)"]]],
    ["M-pc-label", [4], "the pc leaks into the record",
        [["SS[NS] = cb[h] \":\" $4 \":\" $5;",
          "SS[NS] = cb[h] \":\" $4 \":\" $5 \"@\" $2;"]]],
    ["M2", [5], "join oldest-first",
        [["for (i = n; i >= 1; i--) if (lv[i] && p >= cs[i] && p < ce[i])",
          "for (i = 1; i <= n; i++) if (lv[i] && p >= cs[i] && p < ce[i])"]]],
    ["M5", [6], "code-move ignored",
        [["lv[h] = 0; add(hex($3), ce[h] - cs[h], ck[h], cf[h], cb[h], cp[h]); next",
          "next"]]],
    ["M14", [7, 29], "raw keyed key in the record",
        [["key = (substr($1, 1, 5) == \"Keyed\" || $1 == \"StoreInArrayLiteralIC\") ? \"[]\" : $9",
          "key = $9"]]],
    ["M13", [8], "fn split at the first space",
        [["if (substr(nm, 1, length(f) + 1) != f \" \") continue\n    r = substr(nm, length(f) + 2)",
          "if (substr(nm, 1, index(nm, \" \") - 1) != f) continue\n    r = substr(nm, index(nm, \" \") + 1)"]]],
    ["M17", [9], "state read by regex, not field 7",
        [["FIN[k] = $7; MOD[k] = $10;",
          "FIN[k] = substr($0, match($0, /,[X01P^NDG],[X01P^NDG],/) + 3, 1); MOD[k] = $10;"]]],
    ["M18", [10], "a line whose key is fn kept outside fn's code",
        [["if (cf[h] == \"\") next",
          "if (cf[h] == \"\" && $9 != FNS[1]) next"]]],
    ["M19", [11], "state class without X",
        [["split(\"X 0 1 P ^ N D G\", t, \" \")",
          "split(\"0 1 P ^ N D G\", t, \" \")"]]],
    ["M4", [12], "unresolved pc dropped",
        [["if (!h) { x(\"unresolved pc (no code-creation holds it: compile cache or user snapshot code?)\"); next }",
          "if (!h) next"]]],
    ["M11", [13], "optimized-code IC kept",
        [["if (ck[h] == \"12\" || ck[h] == \"13\") {",
          "if (0) {"]]],
    ["M-move-unknown", [14], "code-move from an unknown start ignored",
        [["if (!h) { x(\"code-move from an unknown start\"); next }",
          "if (!h) next"]]],
    ["M-nf11", [15], "IC field count unchecked",
        [["if (NF != 11) { x(\"IC line not 11 fields\"); next }",
          ""]]],
    ["M-tab", [16], "TAB in an IC line accepted",
        [[" || index($0, \"\\t\") > 0) { x(\"IC line does not parse\")",
          ") { x(\"IC line does not parse\")"]]],
    ["M15", [17], "unknown non-IC events skipped (event allowlist removed)",
        [["{ if ($1 ~ /IC$/) x(\"unknown IC kind \" safe($1)); else x(\"unknown event \" safe($1)) }",
          "{ if ($1 ~ /IC$/) x(\"unknown IC kind \" safe($1)) }"]]],
    ["M-ickind", [18], "KeyedHasIC in the IC allowlist",
        [["split(\"KeyedLoadIC KeyedStoreIC",
          "split(\"KeyedHasIC KeyedLoadIC KeyedStoreIC"]]],
    ["M-cckind", [19], "JS,14 in the code-kind allowlist",
        [["split(\"Eval,10 JS,10 JS,11 JS,12 JS,13 Script,10\"",
          "split(\"Eval,10 JS,10 JS,11 JS,12 JS,13 JS,14 Script,10\""]]],
    ["M-w-ic", [20], "IC pc width check removed",
        [["$2 !~ /^0x[0-9a-fA-F]+$/ || length($2) > 15 || $4",
          "$2 !~ /^0x[0-9a-fA-F]+$/ || $4"]]],
    ["M-w-cc", [20], "code-creation start width check removed",
        [[" || length($5) > 15 || $6",
          " || $6"]]],
    ["M-w-move", [21], "code-move width check removed",
        [[" || length($2) > 15 || length($3) > 15) { x(\"code-move",
          ") { x(\"code-move"]]],
    ["M-sites", [22, 28], "non-X site count inverted",
        [["if ($5 != \"X\") m++",
          "if ($5 == \"X\") m++"]]],
    ["M-rc", [23], "driver exit ignored by judge",
        [["if [[ \"${JRC[$i]}\" != 0 ]]; then",
          "if [[ \"${JRC[$i]}\" == x ]]; then"]]],
    ["M-order", [24], "all driver exits before any log reason (not run by run)",
        [["    if [[ \"${JRC[$i]}\" != 0 ]]; then JWHY=\"driver exited ${JRC[$i]} in run $((i + 1))\"; return 0; fi\n    if [[ -n \"${JLOG[$i]}\" ]]",
          "    if [[ \"${JRC[$i]}\" != 0 ]]; then JWHY=\"driver exited ${JRC[$i]} in run $((i + 1))\"; return 0; fi\n  done\n  for ((i = 0; i < n; i++)); do\n    if [[ -n \"${JLOG[$i]}\" ]]"]]],
    ["M-xrec", [25, 48], "X records not checked",
        [["if [[ -n \"$x\" ]]; then JWHY=\"unreadable IC log",
          "if false; then JWHY=\"unreadable IC log"]]],
    ["M8", [26, 49], "null control skipped",
        [["if [[ \"$nk\" != \"$first\" ]]; then",
          "if false; then"]]],
    ["M7", [27, 50], "empty guard removed",
        [["if [[ \"${c% *}\" == 0 ]]; then",
          "if false; then"]]],
    ["M7b", [28], "all-X guard removed",
        [["if [[ \"${c#* }\" == 0 ]]; then",
          "if false; then"]]],
    ["M3", [30], "multiset via sort -u",
        [["multiset() { sort | uniq -c; }",
          "multiset() { sort -u | uniq -c; }"]]],
    ["M-basename", [31], "site key by basename",
        [["k = cf[h] SUBSEP $1 SUBSEP cp[h] SUBSEP",
          "k = cf[h] SUBSEP $1 SUBSEP cb[h] SUBSEP"]]],
    ["M10", [32], "no FINAL=1 before the verdict exit",
        [["FINAL=1; case \"$VERDICT\" in",
          "case \"$VERDICT\" in"]]],
    ["M-trap-rm", [33, 53], "the EXIT trap's rm removed",
        [["if [[ -n \\$IC_TMP ]]; then rm -rf \\\"\\$IC_TMP\\\"; fi; ",
          ""]]],
    ["M21", [32, 34], "a --version probe per trace run",
        [["  if [[ -n \"$OUT\" ]]; then out=\"$rd/run.$4.out\"; fi\n",
          "  if [[ -n \"$OUT\" ]]; then out=\"$rd/run.$4.out\"; fi\n  \"${PROBE_ENV[@]}\" \"$NODE_RES\" --version >/dev/null 2>&1\n"]]],
    ["M23", [35], "--no-node-snapshot on the --version probe",
        [["GOT_VER=$(\"${PROBE_ENV[@]}\" \"$NODE_RES\" --version 2>/dev/null)",
          "GOT_VER=$(\"${PROBE_ENV[@]}\" \"$NODE_RES\" --version --no-node-snapshot 2>/dev/null)"]]],
    ["M22", [36], "env strip dropped from the --version probe",
        [["GOT_VER=$(\"${PROBE_ENV[@]}\" \"$NODE_RES\" --version 2>/dev/null)",
          "GOT_VER=$(\"$NODE_RES\" --version 2>/dev/null)"]]],
    ["M24", [37], "--v8-options exit ignored",
        [["[[ \"$V8O_RC\" == 0 ]] || die \"cannot run $NODE_RES --v8-options\"",
          "true"]]],
    ["M25", [37], "empty --v8-options output accepted",
        [["[[ \"$V8O_N\" =~ ^[0-9]+$ && \"$V8O_N\" != 0 ]] || die \"$NODE_RES --v8-options printed nothing\"",
          "true"]]],
    ["M-ver", [38], "--version exit ignored",
        [["|| die \"cannot run $NODE_RES --version\"",
          "|| true"]]],
    ["M26", [39], "--v8-options hashed from a $(...) value",
        [["V8O=$(exec 4>&1; { \"${PROBE_ENV[@]}\" \"$NODE_RES\" --v8-options 2>/dev/null | tee /dev/fd/3 | sha8 - >&4\n  printf 'rc %s\\n' \"${PIPESTATUS[0]}\" >&4; } 3>&1 | wc -c | sed 's/^ */bytes /') || true",
          "V8O_T=$(\"${PROBE_ENV[@]}\" \"$NODE_RES\" --v8-options 2>/dev/null) && V8O_R=0 || V8O_R=$?\nV8O=$(printf '%s\\n' \"rc $V8O_R\" \"bytes ${#V8O_T}\" \"$(printf '%s\\n' \"$V8O_T\" | sha8 -)\")"]]],
    ["M-optverdict", [40], "the v8-opts hash moves the verdict",
        [["\nVERDICT=SAME\n",
          "\nVERDICT=SAME; [[ $V8O_SHA == 3d098cd0 ]] || VERDICT=DIFF\n"]]],
    ["M-nomv", [41], "isolate file copied, not renamed",
        [["mv -f \"${LF[0]}\" \"$lf\" ||",
          "cp \"${LF[0]}\" \"$lf\" ||"]]],
    ["M-nolog", [42], "missing isolate log not checked",
        [["if [[ ${#LF[@]} -eq 0 ]]; then",
          "if false; then"]]],
    ["M16", [43], "isolate file count not checked",
        [["if [[ ${#LF[@]} -gt 1 ]]; then",
          "if false; then"]]],
    ["M-v8ver", [44], "v8-version line count not checked",
        [["if [[ \"$n\" != 1 ]]; then RUN_LOG=",
          "if false; then RUN_LOG="]]],
    ["M-nul", [45], "NUL check removed",
        [["if ! tr -d '\\000' <\"$lf\" | cmp -s - \"$lf\"; then",
          "if false; then"]]],
    ["M-nl", [46], "final newline check removed",
        [["if [[ \"$(tail -c 1 \"$lf\"; printf x)\" != $'\\nx' ]]; then",
          "if false; then"]]],
    ["M-rc0", [47], "run_side drops the driver exit",
        [["RUN_RC=$rc; RUN_LOG=\"\"",
          "RUN_RC=0; RUN_LOG=\"\""]]],
    ["M-dash", [51], "driver passed as its bare name",
        [["\"--logfile=$rd/run.log\" \"./$3\" )",
          "\"--logfile=$rd/run.log\" \"$3\" )"]]],
    ["M-relpath", [52], "trace runs spawn the unresolved NODE_BIN",
        [["exec \"${PROBE_ENV[@]}\" \"$NODE_RES\" ${V8_EXTRA",
          "exec \"${PROBE_ENV[@]}\" \"$NODE_BIN\" ${V8_EXTRA"]]],
    ["M-sigflag", [54], "a signal noted during mktemp never re-raised",
        [["  [[ $IC_SIG == 0 ]] || die \"interrupted\"\n",
          ""]]],
    ["M-r-repeat", [55], "repeated fn accepted",
        [["[[ \"$SEEN\" != *\"|$t|\"* ]] || die",
          "true || die"]]],
    ["M-r-qual", [56], "FN_RE not applied",
        [["[[ \"$t\" =~ $FN_RE ]] || die",
          "true || die"]]],
    ["M-r-runs1", [57], "--runs 1 accepted",
        [["[[ $RUNS -ge 2 && $RUNS -le 20 ]]",
          "[[ $RUNS -ge 1 && $RUNS -le 20 ]]"]]],
    ["M-r-runs21", [58], "--runs 21 accepted",
        [["[[ $RUNS -ge 2 && $RUNS -le 20 ]]",
          "[[ $RUNS -ge 2 && $RUNS -le 21 ]]"]]],
    ["M-r-pos", [59], "one DRIVER accepted",
        [["[[ ${#POS[@]} -eq 2 ]] || die",
          "[[ ${#POS[@]} -ge 1 ]] || die"]]],
    ["M-r-log", [60], "*log* flags accepted",
        [["    *log*|*prof*|",
          "    *prof*|"]]],
    ["M-r-snap", [61], "*snapshot* flags accepted",
        [["|*interpreted-frames-native-stack*|*snapshot*)",
          "|*interpreted-frames-native-stack*)"]]],
    ["M-r-flag", [62], "non-flag in --v8-flags accepted",
        [["[[ \"$f\" == --* ]] || die",
          "true || die"]]],
    ["M-r-unknown", [63], "unknown option ignored",
        [["    -*) die \"unknown option $a$(hint \"$a\") (see --help)\" ;;",
          "    -*) ;;"]]],
    ["M-r-node", [64], "unresolvable --node accepted as given",
        [["NODE_RES=$(command -v \"$NODE_BIN\" 2>/dev/null) || die \"node binary not found: $NODE_BIN\"",
          "NODE_RES=$(command -v \"$NODE_BIN\" 2>/dev/null) || NODE_RES=$NODE_BIN"]]],
];
// Plan M1-M26 not in the B2 table (A1: M1; A2 addendum: M12; A6 S6: M20 = the guess half of "guess / skip", M4 is the
// skip half). Designed rows from the ASSERTIONS that name them.
const NEW = [
    ['M1', [1, 5], 'join filtered to fn: only fn-owned code-creation entries kept (A1)',
        [['  add(hex($5), $6 + 0, $3, f, BASE, SCR); next',
          '  if (f != "") add(hex($5), $6 + 0, $3, f, BASE, SCR); next']]],
    ['M12', [35], '--no-node-snapshot dropped from the trace flags (A2 / K2)',
        [['TRACE_FLAGS=(--log-ic --no-concurrent-recompilation --no-node-snapshot)',
          'TRACE_FLAGS=(--log-ic --no-concurrent-recompilation)']]],
    ['M20', [12], 'an unresolved pc guessed as the newest code entry, never X (S6)',
        [['if (!h) { x("unresolved pc (no code-creation holds it: compile cache or user snapshot code?)"); next }',
          'if (!h) h = n']]],
];
const MUTANTS = [...B2, ...NEW];
assert.equal(B2.length, 61, 'the B2 table holds mutants.py\'s 62 rows minus M-sigwin');
assert.equal(new Set(MUTANTS.map((m) => m[0])).size, MUTANTS.length, 'mutant ids are unique');
// plan TASK 6 (A2 / A6 / A7): M1-M26 all present (M7 also as M7b)
for (let i = 1; i <= 26; i++) assert.ok(MUTANTS.some((m) => m[0] === `M${i}`), `M${i} is in the table`);

// red = exit 1, the FAILED summary, every designed row among the FAIL lines (by label prefix)
function assertKilled(name, r, rows) {
    assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    for (const n of rows) {
        assert.ok(fl.some((l) => l.startsWith('FAIL ' + ROW[n])), `mutant ${name}: expected row ${n} "${ROW[n]}" to FAIL\n${fl.join('\n')}`);
    }
}

// The mutant self-tests are independent: they run PAR at a time from module load; each test awaits its own.
let active = 0;
const waiting = [];
function gate() { return new Promise((res) => { const go = () => { active++; res(); }; if (active < PAR) go(); else waiting.push(go); }); }
function release() { active--; const w = waiting.shift(); if (w) w(); }
function runOne(path) {
    return new Promise((res) => {
        const c = spawn('bash', [path, '--self-test'], { env: ENV });
        let out = ''; let err = '';
        // SIGTERM, not SIGKILL: the self-test's EXIT trap then removes its own mktemp dir
        const t = setTimeout(() => c.kill('SIGTERM'), 300000);
        c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
        c.on('close', (status) => { clearTimeout(t); res({ status, stdout: out, stderr: err }); });
    });
}
// the temp dir is made inside the gate, so an interrupted run leaves at most PAR dirs
function launch(name, edits) {
    return (async () => {
        await gate();
        const dir = mkdtempSync(join(tmpdir(), 'icd-m-'));
        try { return await runOne(variant(dir, name, edits)); }
        finally { rmSync(dir, { recursive: true, force: true }); release(); }
    })();
}

// --- exit wiring (TASK 6 / A10): a self-test whose row FAILs must exit non-zero. EW1 flips ONE canned expectation
// (row 32's spawn count 8 -> 9); EWa / EWb break the wiring on top of EW1 and must make the row's assertion throw.
const EW1 = ['"1|VERDICT DIFF|8|1|1|--version+--v8-options|1"', '"1|VERDICT DIFF|9|1|1|--version+--v8-options|1"'];
const EW = [
    ['EW1-one-expectation-flipped', [EW1]],
    ['EWa-self-test-rc-dropped', [EW1, ['if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi', 'self_test || true; FINAL=1; exit 0']]],
    ['EWb-summary-ignores-fails', [EW1, ['if [[ $fails -eq 0 && $oks -gt 0 ]]; then', 'if [[ $oks -gt 0 ]]; then']]],
];
function assertWired(r) {
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    assert.equal(fl.length, 1, fl.join('\n'));
    assert.ok(fl[0].startsWith('FAIL ' + ROW[32]), fl[0]);
    assert.equal(okLines(r.stdout).length, C - 1);
    assert.match(r.stdout, /^self-test: 1 check\(s\) FAILED$/m);
    assert.doesNotMatch(r.stdout, /^self-test: \d+ check\(s\) ok$/m);
}

// launched together by the FIRST test that needs one (so a --test-name-pattern run that selects none spawns none)
let KILLS = null; let WIRES = null;
function kills() {
    if (!KILLS) {
        KILLS = MUTANTS.map(([name, , , edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
        WIRES = EW.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); return p; });
    }
    return KILLS;
}
function wires() { kills(); return WIRES; }

MUTANTS.forEach(([name, rows, desc], i) => {
    test(`ic-diff --self-test MUST FAIL on mutant ${name} (${desc}) at row(s) ${rows.join(',')}`, { skip }, async () => {
        assertKilled(name, await kills()[i], rows);
    });
    test(`ic-diff mutant ${name}: revert check (the unmutated copy fails the same kill assertion)`, { skip }, () => {
        assert.throws(() => assertKilled(name, base(), rows), assert.AssertionError, `mutant ${name}: the kill assertion passes with no mutation`);
    });
});

test('ic-diff --self-test exit wiring: one flipped canned expectation -> exit 1, exactly 1 FAIL (row 32), 63 ok, the FAILED summary', { skip }, async () => {
    assertWired(await wires()[0]);
});
test('ic-diff --self-test exit wiring: revert checks (unmutated copy, rc dropped, summary ignoring fails) each fail the assertion', { skip }, async () => {
    assert.throws(() => assertWired(base()), assert.AssertionError);
    for (const i of [1, 2]) {
        const r = await wires()[i];
        assert.equal(r.status, 0, `${EW[i][0]}: the wiring mutant must exit 0 (else it does not test the wiring)\n${r.stdout}`);
        assert.throws(() => assertWired(r), assert.AssertionError, EW[i][0]);
    }
});

// --- -h (TASK 5 / 6): exit 2, the usage text on stdout (nothing on stderr), --help the same ---
const HELP_LINES = [
    'ic-diff.sh -- the INLINE-CACHE states of NAMED functions, DRIVER_BEFORE vs DRIVER_AFTER, on one node binary:',
    '  ic-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     driver mode: two drivers, one verdict',
    '  ic-diff.sh --self-test                                       canned checks, a fake node (no real node)',
    '  -h, --help         this text (exit 2)',
    '                     "self-test: <n> check(s) FAILED" (exit 1)',
    'Spawns, every one under `env -u NODE_OPTIONS -u NODE_COMPILE_CACHE`: one --version, one --v8-options, then',
    '  2 x runs trace runs (runs 3: 8 spawns); a failing probe exits 2 before anything is written. Probe die lines:',
    '  With --out: no mktemp; DIR holds report.txt and raw/<side>/run.<k>.{log,out} (4 x runs + 1 files; 13 for runs 3).',
    '  `mktemp -d "${TMPDIR:-/tmp}/ic-diff.XXXXXX"` after both probes, removed on every exit; an INT / TERM ->',
    '  S fn<TAB>kind<TAB>base:line:col<TAB>key<TAB>final<TAB>mod<TAB>slow',
    'Verdict, over every fn (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT.',
    'Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.',
];
// every X reason and every NO-VERDICT reason the plan names (A2, A5 D-c, A9 coder extras), as -h words them
const HELP_HAS = [
    'unresolved pc (no code-creation holds it: compile cache or user snapshot code?)',
    'IC pc in optimized code (Maglev / Turbofan, kind <12|13>)', 'code-move from an unknown start', 'code-move does not parse',
    'IC line not 11 fields', 'IC line does not parse', 'IC state outside X01P^NDG', 'code-creation does not parse',
    'code kind outside the allowlist: <type,kind>', 'unknown IC kind <$1>', 'unknown event <$1>',
    'driver exited <rc> in run <k>', 'no IC log (no isolate-0x*-*-run.log written) in run <k>',
    'another isolate or process logged (<n> isolate-0x*-*-run.log files) in run <k>',
    'the log holds <n> v8-version line(s), want 1 in run <k>', 'a NUL byte in the log in run <k>',
    'the log has no final newline in run <k>', 'cannot read the log (awk exited <rc>) in run <k>',
    'unreadable IC log in run <k>: <X why>', 'null control: run <k> differs from run 1',
    "no IC site of '<fn>' in run 1", "every IC site of '<fn>' is X (no feedback) in run 1",
    '`v8-opts sha256/8 <x>`', 'env -u NODE_OPTIONS <node> --v8-options | shasum -a 256',
    '--no-node-snapshot --logfile=<abs run dir>/run.log ./<driver file name>',
    'Tier: on a user driver the verdict is STATISTICAL', '--self-test is DETERMINISTIC',
    'Not detected: two sites of fn that swap states',
];
function assertHelp(script) {
    const h = spawnSync('bash', [script, '-h'], { encoding: 'utf8', timeout: 60000, env: ENV });
    const hh = spawnSync('bash', [script, '--help'], { encoding: 'utf8', timeout: 60000, env: ENV });
    assert.equal(h.status, 2, h.stdout + h.stderr);
    assert.equal(hh.status, 2, hh.stdout + hh.stderr);
    assert.equal(h.stderr, '');
    assert.equal(hh.stdout, h.stdout);
    const lines = h.stdout.split('\n');
    assert.equal(lines[0], HELP_LINES[0]);
    for (const l of HELP_LINES) assert.ok(lines.includes(l), `-h lacks the line "${l}"`);
    for (const s of HELP_HAS) assert.ok(h.stdout.includes(s), `-h lacks "${s}"`);
    assert.doesNotMatch(h.stdout, /^VERDICT /m);
}
test('ic-diff -h / --help: exit 2, the usage on stdout (stderr empty), key lines, every X and NO-VERDICT reason', { skip }, () => {
    assertHelp(SCRIPT);
});
test('ic-diff -h: revert checks (usage exiting 0, usage on stderr) fail the row', { skip }, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'icd-h-'));
    try {
        for (const [n, to] of [['h-exit0', 'usage; exit 0 ;;'], ['h-stderr', 'usage >&2; exit 2 ;;']]) {
            const p = variant(dir, n, [['usage; exit 2 ;;', to]]);   // outside throws: a bad anchor is a row error, never a kill
            assert.throws(() => assertHelp(p), (e) => { t.diagnostic(`teeth ${n}: ${e.message.split('\n')[0]}`); return e instanceof assert.AssertionError; }, n);
        }
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- A4 (+ A7 K1 / K2) on this file's OWN fake node and mktemp shim (independent of the self-test's fake). The fake
// node logs its argv per spawn, exits 7 when NODE_OPTIONS or NODE_COMPILE_CACHE reaches it (every run below sets
// both), answers --version / --v8-options, else is a trace run: exit 9 unless its last argument is an existing file
// whose name does not start with '-' as node would read it, copy ./ic.log to isolate-0x1000-<pid>-<basename of
// --logfile> beside the --logfile path, ./term -> SIGTERM to its parent (the script), exit ./rc or 0. Canned log:
// node v26.8.2 lines (recheck2 mono capture, path shortened), get's LoadIC site final 1 (mono) or 1 then P (poly).
const V8V = 'v8-version,14,6,202,34,-node.28,0';
const CC_GET = 'code-creation,JS,10,98536,0x3bcd762b6930,5,get file:///w/drv.js:2:13,0x29a78805a970,~';
const L01 = 'LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,';
const L1P = 'LoadIC,0x3bcd762b6932,98560,3,12,1,P,0x29a78805c261,x,,';
const MONO = [V8V, CC_GET, L01, ''].join('\n');
const POLY = [V8V, CC_GET, L01, L1P, ''].join('\n');
const TB = '\t';
// a KeyedStoreIC site of get, final 1, with no mod (ks0) or mod .GROW (ksg): the mod field reaches the V record
const KS0 = 'KeyedStoreIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,0,,';
const KSG = 'KeyedStoreIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,0,.GROW,';

function rig() {
    const d = mkdtempSync(join(tmpdir(), 'icd-a4-'));
    const fk = join(d, 'fk'); const mk = join(d, 'mk'); const dr = join(d, 'dr');
    for (const x of [fk, mk, dr, join(d, 'tmp'), join(d, 'cwd'), join(d, 'cc')]) mkdirSync(x);
    const bash = process.env.BASH && process.env.BASH.startsWith('/') ? process.env.BASH : '/bin/bash';
    writeFileSync(join(fk, 'node'), [`#!${bash}`, 'd=$(dirname "$0")', 'printf "%s\\n" "$*" >>"$d/log"',
        'if [ -n "${NODE_OPTIONS+x}" ] || [ -n "${NODE_COMPILE_CACHE+x}" ]; then echo "env leaked"; exit 7; fi',
        'case "$1" in --version) echo v26.8.2; exit 0 ;; --v8-options) printf "Synopsis:\\n  a4 fake\\n"; exit 0 ;; esac',
        'lf=""; for a; do case "$a" in --logfile=*) lf="${a#--logfile=}" ;; esac; done; last="${!#}"',
        'case "$last" in -*) echo "bad option: $last" >&2; exit 9 ;; esac',
        '[ -f "$last" ] || { echo "no driver: $last" >&2; exit 9; }',
        'if [ -n "$lf" ] && [ -f ./ic.log ]; then cp ./ic.log "$(dirname "$lf")/isolate-0x1000-$$-$(basename "$lf")"; fi',
        'if [ -f ./term ]; then kill -TERM "$PPID"; fi',
        'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi', 'exit 0', ''].join('\n'));
    chmodSync(join(fk, 'node'), 0o755);
    const real = spawnSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8', env: ENV }).stdout.trim();
    assert.ok(real.startsWith('/'), `mktemp not found: "${real}"`);
    writeFileSync(join(mk, 'mktemp'), [`#!${bash}`, `printf '%s\\n' "$*" >>'${join(d, 'mk.log')}'`, `exec '${real}' "$@"`, ''].join('\n'));
    chmodSync(join(mk, 'mktemp'), 0o755);
    const drv = (name, file, log, extra = {}) => {
        mkdirSync(join(dr, name));
        writeFileSync(join(dr, name, file), '');
        writeFileSync(join(dr, name, 'ic.log'), log);
        for (const [k, v] of Object.entries(extra)) writeFileSync(join(dr, name, k), v);
        return join(dr, name, file);
    };
    const D = {
        mono: drv('mono', 'driver.js', MONO), poly: drv('poly', 'driver.js', POLY),
        rc3: drv('rc3', 'driver.js', MONO, { rc: '3\n' }), term: drv('term', 'driver.js', MONO, { term: '' }),
        dashb: drv('dashb', '-x.js', MONO), dasha: drv('dasha', '-y.js', MONO),
        ks0: drv('ks0', 'driver.js', [V8V, CC_GET, KS0, ''].join('\n')), ksg: drv('ksg', 'driver.js', [V8V, CC_GET, KSG, ''].join('\n')),
    };
    // one run of SCRIPT with NODE_OPTIONS + NODE_COMPILE_CACHE set, PATH = shim first, TMPDIR = d/tmp, cwd = d/cwd
    const run = (script, args) => {
        writeFileSync(join(fk, 'log'), ''); writeFileSync(join(d, 'mk.log'), '');
        const r = spawnSync('bash', [script, '--node', join(fk, 'node'), ...args], {
            encoding: 'utf8', timeout: 120000, cwd: join(d, 'cwd'),
            env: { ...ENV, PATH: mk + ':' + process.env.PATH, TMPDIR: join(d, 'tmp'), NODE_OPTIONS: '--st-probe', NODE_COMPILE_CACHE: join(d, 'cc') },
        });
        const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean);
        return { status: r.status, out: r.stdout + r.stderr, stdout: r.stdout, argv: lines(join(fk, 'log')), mk: lines(join(d, 'mk.log')) };
    };
    // every entry (recursive) under TMPDIR, cwd and the driver dirs
    const ents = () => {
        const acc = [];
        const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); acc.push(relative(d, q)); if (e.isDirectory()) walk(q); } };
        for (const p of [join(d, 'tmp'), join(d, 'cwd'), dr]) walk(p);
        return acc.sort();
    };
    return { d, D, run, ents, tmp: join(d, 'tmp'), done: () => rmSync(d, { recursive: true, force: true }) };
}
function verdicts(out) { return out.split('\n').filter((l) => l.startsWith('VERDICT ')); }

// A4 / K1 spawns + mktemp: R=3 SAME -> 8 spawns (--version, --v8-options, 6 trace runs), mktemp -d exactly once
function a4Spawns(script) {
    const g = rig();
    try {
        let r = g.run(script, ['--fn', 'get', g.D.mono, g.D.mono]);
        assert.equal(r.status, 0, r.out);
        assert.deepEqual(verdicts(r.out), ['VERDICT SAME'], r.out);
        assert.equal(r.argv.length, 8, r.argv.join('\n'));
        assert.equal(r.argv[0], '--version'); assert.equal(r.argv[1], '--v8-options');
        for (const a of r.argv.slice(2)) {
            assert.equal(a.split(' ').filter((w) => w === '--no-node-snapshot').length, 1, a);
            assert.match(a, /(^| )--log-ic( |$)/);
            assert.match(a, / \.\/driver\.js$/);
        }
        assert.deepEqual(r.mk, [`-d ${g.tmp}/ic-diff.XXXXXX`]);
        r = g.run(script, ['--runs', '2', '--fn', 'get', g.D.mono, g.D.poly]);
        assert.equal(r.status, 1, r.out);
        assert.equal(r.argv.length, 6, r.argv.join('\n'));
        assert.equal(r.mk.length, 1);
        assert.ok(r.out.split('\n').includes(`  before=0 after=1  get${TB}LoadIC${TB}x${TB}P`), r.out);
        r = g.run(script, ['--runs', '20', '--fn', 'get', g.D.mono, g.D.mono]);
        assert.equal(r.status, 0, r.out);
        assert.equal(r.argv.length, 42);
        assert.equal(r.mk.length, 1);
        assert.deepEqual(readdirSync(g.tmp), []);
    } finally { g.done(); }
}
// A4 --out: 0 mktemp, exactly 13 files: report.txt + raw/{before,after}/run.{1,2,3}.{log,out}; no isolate file
function a4Out(script) {
    const g = rig();
    try {
        const o = join(g.d, 'o');
        const r = g.run(script, ['--out', o, '--fn', 'get', g.D.mono, g.D.poly]);
        assert.equal(r.status, 1, r.out);
        assert.equal(r.argv.length, 8);
        assert.equal(r.mk.length, 0, r.mk.join('\n'));
        const files = [];
        const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); if (e.isDirectory()) walk(q); else files.push(relative(o, q)); } };
        walk(o);
        const want = ['report.txt'];
        for (const s of ['after', 'before']) for (const k of [1, 2, 3]) for (const x of ['log', 'out']) want.push(`raw/${s}/run.${k}.${x}`);
        assert.deepEqual(files.sort(), want.sort());
        assert.equal(files.length, 13);
        assert.ok(readFileSync(join(o, 'report.txt'), 'utf8').split('\n').includes('VERDICT DIFF'));
        assert.equal(readFileSync(join(o, 'raw', 'after', 'run.2.log'), 'utf8'), POLY);
        assert.deepEqual(readdirSync(g.tmp), []);
    } finally { g.done(); }
}
// A4 retention: 3 cycles of SAME / DIFF / NO-VERDICT + 1 SIGTERM mid-run (in run 1) -> 1 mktemp each, 0 new entries
// in TMPDIR, cwd and the driver dirs
function a4Retention(script) {
    const g = rig();
    try {
        const b0 = g.ents();
        for (let i = 0; i < 3; i++) {
            for (const [a, b, rc, v] of [[g.D.mono, g.D.mono, 0, 'SAME'], [g.D.mono, g.D.poly, 1, 'DIFF'], [g.D.rc3, g.D.mono, 2, 'NO-VERDICT']]) {
                const r = g.run(script, ['--fn', 'get', a, b]);
                assert.equal(r.status, rc, r.out);
                assert.deepEqual(verdicts(r.out), [`VERDICT ${v}`], r.out);
                assert.equal(r.argv.length, 8);
                assert.equal(r.mk.length, 1);
                assert.deepEqual(g.ents(), b0, `cycle ${i + 1} ${v}`);
            }
        }
        const r = g.run(script, ['--fn', 'get', g.D.term, g.D.mono]);
        assert.equal(r.status, 2, r.out);
        assert.ok(r.out.split('\n').includes('ic-diff: interrupted'), r.out);
        assert.equal(r.mk.length, 1);
        assert.equal(r.argv.length, 3, r.argv.join('\n'));
        assert.deepEqual(g.ents(), b0, 'after the SIGTERM');
    } finally { g.done(); }
}
// shipped hardening (A10): the driver argv is ./<name>, so a driver named -x.js runs as a file (B2 real-node check:
// b/-x.js vs a/-y.js -> DIFF); here -x.js vs -y.js -> SAME, every trace argv ends in ./-x.js or ./-y.js
function argvDash(script) {
    const g = rig();
    try {
        const r = g.run(script, ['--fn', 'get', g.D.dashb, g.D.dasha]);
        assert.equal(r.status, 0, r.out);
        assert.deepEqual(verdicts(r.out), ['VERDICT SAME'], r.out);
        assert.equal(r.argv.length, 8);
        assert.deepEqual(r.argv.slice(2).map((a) => a.slice(a.lastIndexOf(' ') + 1)), ['./-x.js', './-y.js', './-x.js', './-y.js', './-x.js', './-y.js']);
    } finally { g.done(); }
}

// verdict fold over fns (plan A3 / -h "NO-VERDICT > DIFF > SAME"): get DIFF + nosuch NO-VERDICT -> NO-VERDICT, exit 2,
// in both --fn orders, and every fn reported: get's DIFF line once, nosuch's NO-VERDICT once per side (review r1)
function foldNV(script) {
    const g = rig();
    try {
        for (const fl of ['get,nosuch', 'nosuch,get']) {
            const r = g.run(script, ['--fn', fl, g.D.mono, g.D.poly]);
            assert.equal(r.status, 2, r.out);
            assert.deepEqual(verdicts(r.out), ['VERDICT NO-VERDICT'], r.out);
            const L = r.out.split('\n');
            assert.equal(L.filter((l) => l.startsWith('  get: DIFF -- ')).length, 1, r.out);
            // nosuch is NO-VERDICT on BOTH sides: one line per side (self-test row 50, -h `<before|after>: <reason>`)
            assert.deepEqual(L.filter((l) => l.startsWith('  nosuch: NO-VERDICT -- ')).map((l) => l.slice('  nosuch: NO-VERDICT -- '.length).split(':')[0]), ['before', 'after'], r.out);
        }
    } finally { g.done(); }
}
// the mod field is part of V (MD-26: final[ mod]): 1 vs 1 .GROW at one KeyedStoreIC site -> DIFF (review r1)
function modRow(script) {
    const g = rig();
    try {
        const r = g.run(script, ['--fn', 'get', g.D.ks0, g.D.ksg]);
        assert.equal(r.status, 1, r.out);
        assert.deepEqual(verdicts(r.out), ['VERDICT DIFF'], r.out);
        const L = r.out.split('\n');
        assert.ok(L.includes('  before=1 after=0  get' + TB + 'KeyedStoreIC' + TB + '[]' + TB + '1'), r.out);
        assert.ok(L.includes('  before=0 after=1  get' + TB + 'KeyedStoreIC' + TB + '[]' + TB + '1 .GROW'), r.out);
    } finally { g.done(); }
}

const A4 = [
    ['A4 / K1: R=3 -> 8 spawns (probes first, --no-node-snapshot once per trace argv), mktemp -d once; R=2 -> 6; R=20 -> 42', a4Spawns,
        // teeth: a --version probe per trace run (B2 M21); the env strip dropped from the trace spawns (fake exits 7);
        // --no-node-snapshot dropped (M12); the mktemp moved into run_side (one per run)
        [['M21', [['  if [[ -n "$OUT" ]]; then out="$rd/run.$4.out"; fi\n', '  if [[ -n "$OUT" ]]; then out="$rd/run.$4.out"; fi\n  "${PROBE_ENV[@]}" "$NODE_RES" --version >/dev/null 2>&1\n']]],
         ['trace-env', [['exec "${PROBE_ENV[@]}" "$NODE_RES" ${V8_EXTRA', 'exec "$NODE_RES" ${V8_EXTRA']]],
         ['M12', [['TRACE_FLAGS=(--log-ic --no-concurrent-recompilation --no-node-snapshot)', 'TRACE_FLAGS=(--log-ic --no-concurrent-recompilation)']]],
         ['mktemp-per-run', [['  local -a LF\n', '  local -a LF\n  if [[ -z "$OUT" ]]; then rmdir "$(mktemp -d "${TMPDIR:-/tmp}/ic-diff.XXXXXX")"; fi\n']]]]],
    ['A4 --out: 0 mktemp, exactly 13 files (report.txt + raw/<side>/run.<k>.{log,out}), report holds the verdict', a4Out,
        [['out-mktemp', [['if [[ -n "$OUT" ]]; then\n  mkdir -p "$OUT/raw/before"', 'if [[ -n "$OUT" ]]; then\n  rmdir "$(mktemp -d "${TMPDIR:-/tmp}/ic-diff.XXXXXX")"\n  mkdir -p "$OUT/raw/before"']]],
         ['M-nomv', [['mv -f "${LF[0]}" "$lf" ||', 'cp "${LF[0]}" "$lf" ||']]]]],
    ['A4 retention: 3 x (SAME / DIFF / NO-VERDICT) + 1 SIGTERM mid-run -> 1 mktemp each, 0 new entries in TMPDIR, cwd, driver dirs', a4Retention,
        // teeth (plan A4): red when the trap's rm is removed
        [['M-trap-rm', [['if [[ -n \\$IC_TMP ]]; then rm -rf \\"\\$IC_TMP\\"; fi; ', '']]],
         ['no-int-term-trap', [["trap 'die \"interrupted\"' INT TERM\nif [[ -n \"$OUT\" ]]; then", "if [[ -n \"$OUT\" ]]; then"],
            ["  trap 'die \"interrupted\"' INT TERM\n  [[ $IC_SIG == 0 ]]", "  trap - INT TERM\n  [[ $IC_SIG == 0 ]]"]]]]],
    ['shipped ./$3: drivers named -x.js / -y.js run as files (every trace argv ends ./<name>), SAME', argvDash,
        [['M-dash', [['"--logfile=$rd/run.log" "./$3" )', '"--logfile=$rd/run.log" "$3" )']]]]],
    ['verdict fold: get DIFF + nosuch NO-VERDICT (both --fn orders) -> exit 2, VERDICT NO-VERDICT, one line per fn', foldNV,
        // teeth: worst() ranks DIFF over NO-VERDICT (X1); only the first fn is judged (X16)
        [['X1', [['  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT\n  elif [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF',
            '  if [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF\n  elif [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT']]],
         ['X16', [['for fn in "${TARGETS[@]}"; do diff_fn "$fn"; done', 'diff_fn "${TARGETS[0]}"']]]]],
    ['mod in V: KeyedStoreIC final 1 vs 1 .GROW -> exit 1 DIFF, the before=1 after=0 and before=0 after=1 lines', modRow,
        // teeth: v_ms drops the mod (X13); IC_AWK never keeps it (X13b)
        [['X13', [['"\\t" $5 ($6 != "" ? " " $6 : "") }', '"\\t" $5 }']]],
         ['X13b', [['MOD[k] = $10;', 'MOD[k] = "";']]]]],
];
for (const [label, fn, teeth] of A4) {
    test(`ic-diff ${label}`, { skip }, () => { fn(SCRIPT); });
    test(`ic-diff ${label}: revert checks (${teeth.map((x) => x[0]).join(', ')}) each fail the row`, { skip }, (t) => {
        const dir = mkdtempSync(join(tmpdir(), 'icd-t-'));
        try {
            for (const [n, edits] of teeth) {
                const p = variant(dir, n, edits);   // outside throws: a bad anchor is a row error, never a kill
                assert.throws(() => fn(p), (e) => { t.diagnostic(`teeth ${n}: ${e.message.split('\n')[0]}`); return e instanceof assert.AssertionError; }, `teeth ${n}`);
            }
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
