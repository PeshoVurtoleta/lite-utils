// test/allocation-diff.test.mjs -- ../allocation-diff.sh: --self-test (canned --trace-gc text + its own fake node),
// mutants, exit wiring (Y6), the self-test's temp-dir removal (Y7), -h, and the -h refusal claims no self-test row gates.
// ORACLE: .handoff/PLAN-phase4-g1.md TASK 6 + the addenda that add mutants (M11-M13 A6, M14-M17, M18-M20, "M10 in B3 = a
// 4-stage tr no-op"), the B2 mutant table (.handoff/evidence/p4g1/b2/mutants.py: anchors, descriptions and designed rows
// copied verbatim, rows mapped from its label prefixes) and the B2 reviews (evidence/p4g1/b2-review/REVIEW.txt: the
// ungated -h claims, Y6, Y7), never what the script printed. TIER: DETERMINISTIC (no V8 spawn: the self-test feeds canned
// text and its own fake node; the refusal rows below run this file's OWN logging fake node and mktemp shim).
// Mutants: each is ONE exact-once edit (an anchor that matches 0 or > 1 times fails the row) on a temp copy of the built
// root script; it must exit 1 with the FAILED summary and FAIL every designed row (found by label prefix, so a mutant
// that breaks only some other row is not a kill). Each revert row reruns the kill assertion on the UNMUTATED copy and
// requires it to throw. Every mutant self-test runs with TMPDIR = its own private dir, removed afterwards.
// MD-33 (PLAN A15 / A16): an unreadable --out DIR/raw (0300 / 0000 / 0600, a symlink to a 0300 dir) is refused before any
// spawn; the B2h mutant (that guard line removed from the root script) must turn the 0300 row red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeAwk, buildNulCutAwk, nulTmpDir } from './nul-awk.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'allocation-diff.sh');
const C = 78;   // self-test ok lines at b36 G5 B3 (src eb9de455 / root cd94100c, sha256; 76 at B2a 00ab0dac / 8e795263,
                // 78 since G5 B1 added checks 77 / 78); a new check moves this literal
const PAR = 6;  // mutant self-tests in flight at once
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const ROOTUSER = typeof process.getuid === 'function' && process.getuid() === 0;
// the host environment never reaches the script (NODE_OPTIONS / NODE_COMPILE_CACHE would reach a node; NODE would pick
// another node; editor vars are git's; BASH_ENV / ENV would be sourced by every bash the script starts; CDPATH makes
// `cd` print; SHELLOPTS / BASHOPTS / POSIXLY_CORRECT change every bash's options; BASH_FUNC_* are exported functions)
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE', 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'BASH_ENV', 'ENV', 'TMPDIR',
    'CDPATH', 'SHELLOPTS', 'BASHOPTS', 'POSIXLY_CORRECT']) delete ENV[k];
for (const k of Object.keys(ENV)) if (k.startsWith('BASH_FUNC_')) delete ENV[k];
// b37 ruling "NUL mutants": gawk / mawk (Linux) keep a NUL inside a record, so the tr '\000' '?' defense is unobservable
// there and M10 survives. NUL_MUTANTS (and their revert checks) run with the BSD-NUL shim first on PATH when the probe
// says the host awk is NUL-clean; on a truncating host (macOS) they run as before. The shim is built on every host: the
// control row runs the UNMUTATED self-test under it (test/nul-awk.mjs; its full pin rows are in deopt-diff.test.mjs).
const NUL_MUTANTS = new Set(['M10']);
const NUL = skip ? null : probeAwk(ENV);
// b39 NL: nulTmpDir removes it on exit AND on SIGINT / SIGTERM (then re-raises), so a killed run leaks no ad-nul-* dir
const NULDIR = skip ? null : nulTmpDir('ad-nul-');
const NULSHIM = skip ? null : buildNulCutAwk(NULDIR, ENV);
const nulFor = (name) => (NUL && NUL.nulClean && NUL_MUTANTS.has(name) ? NULSHIM.dir : null);
const SRC = readFileSync(SCRIPT, 'utf8');
function count(src, from) { return src.split(from).length - 1; }
// the MD-33 guard (B2h; root 8e795263 :845 / src 00ab0dac :775), one whole line: the B2h mutant deletes exactly it
const RAWGUARD = '  [[ ! -e "$OUT/raw" || ( -r "$OUT/raw" && -x "$OUT/raw" ) ]] || die "--out: $OUT/raw is not readable"\n';
// MD-50 / MD-56 (PLAN-md46 G5): the --version probe line, the v8fl_check call right after it, and the first disk write
// (gcn.cjs into the temp dir); whole lines, the V1-V3 mutants' anchors
const VERLINE = 'GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"\n';
const V8CALL = 'v8fl_check "$NODE_BIN"\n';
const GCNLINE = 'gcn_cjs >"$T/gcn.cjs" || die "cannot write $T/gcn.cjs"\n';

// The 78 self-test rows in print order: a prefix of each "ok <label>" that names exactly that one row.
const ROW = [null,
    /*  1 */ "A1' records: 2",
    /*  2 */ 'A1 records: every',
    /*  3 */ 'A1 / A3',
    /*  4 */ 'A3 records: Scavenge',
    /*  5 */ "A3 / A1'",
    /*  6 */ 'A1 M2 records:',
    /*  7 */ "A1'' records: N1",
    /*  8 */ "A1'' records: N5",
    /*  9 */ "A1'' records: U1",
    /* 10 */ 'A3 records: x',
    /* 11 */ "A3' records: gcn",
    /* 12 */ "A3' records: no",
    /* 13 */ 'A13 records: a',
    /* 14 */ "A5' records: 5,000",
    /* 15 */ 'A14 gcn_cjs() is',
    /* 16 */ 'A2 e2e: diff',
    /* 17 */ "A2 / A2'",
    /* 18 */ "A2' e2e: --zero",
    /* 19 */ 'A2 M9 e2e:',
    /* 20 */ "A3' e2e: markers",
    /* 21 */ "A3' M14 e2e:",
    /* 22 */ 'A3 M8 e2e:',
    /* 23 */ 'A3 e2e: a Mark-Compact',
    /* 24 */ 'A3 e2e: driver',
    /* 25 */ 'A3 M10 e2e:',
    /* 26 */ 'A3 e2e: an',
    /* 27 */ "A3' e2e: gcn",
    /* 28 */ "A3' M17 e2e:",
    /* 29 */ 'A9 M20 e2e:',
    /* 30 */ 'A12(d) e2e: 667',
    /* 31 */ 'A3 e2e: a driver',
    /* 32 */ 'e2e: --zero --out',
    /* 33 */ 'A14(e) e2e: spawn',
    /* 34 */ 'A14(e) e2e: a',
    /* 35 */ 'e2e: NODE_OPTIONS set',
    /* 36 */ 'e2e: a failing',
    /* 37 */ 'A10 MD-31 e2e:',
    /* 38 */ "A1'' e2e: N1-N7",
    /* 39 */ 'A13 e2e: in',
    /* 40 */ 'A13 e2e: tee',
    /* 41 */ 'A13 e2e: a CR',
    /* 42 */ 'A13 e2e: the record',
    /* 43 */ 'A6 e2e: G',
    /* 44 */ 'A6 e2e: count 7',
    /* 45 */ 'A6 e2e: count 5',
    /* 46 */ 'A6 e2e: fd',
    /* 47 */ 'A14(b) e2e: 16',
    /* 48 */ 'e2e: a count',
    /* 49 */ 'A13 e2e: a torn',
    /* 50 */ 'A13 e2e: a driver-written',
    /* 51 */ 'A6 judge order e2e: X',
    /* 52 */ 'A6 judge order e2e: Mark-Compact',
    /* 53 */ 'A6 e2e: R=3',
    /* 54 */ 'e2e: fd 3',
    /* 55 */ 'A13 e2e: the temp',
    /* 56 */ 'A14(a) e2e: --out',
    /* 57 */ 'e2e: --out ../od1',
    /* 58 */ 'A13 e2e relative',
    /* 59 */ '-h: exit 2,',
    /* 60 */ 'refused before any spawn: --zero',
    /* 61 */ 'refused before any spawn: diff',
    /* 62 */ 'refused before any spawn: --runs 1',
    /* 63 */ 'refused before any spawn: --runs 21',
    /* 64 */ 'refused before any spawn: --v8-flags --trace_gc_verbose',
    /* 65 */ 'refused before any spawn: --v8-flags --max-semi-space-size=4',
    /* 66 */ 'refused before any spawn: --v8-flags --predictable-gc-schedule',
    /* 67 */ 'refused before any spawn: --v8-flags --predictable_gc_schedule',
    /* 68 */ 'refused before any spawn: a non-flag',
    /* 69 */ 'refused before any spawn: unknown',
    /* 70 */ 'refused before any spawn: a newline',
    /* 71 */ 'A14(d) refused before',
    /* 72 */ 'A5 retention: 3',
    /* 73 */ 'MD-33 refused before',
    /* 74 */ 'MD-39 refused before',
    /* 75 */ 'MD-42 refused before',
    /* 76 */ 'MD-44 refused before',
    /* 77 */ 'MD-50 refused after',
    /* 78 */ 'MD-50 accepted:',
];

function okLines(out) { return out.split('\n').filter((l) => l.startsWith('ok ')); }
function rowLines(out) { return out.split('\n').filter((l) => l.startsWith('ok ') || l.startsWith('FAIL ')); }

// A copy of the script in DIR, with exact-once edits (each anchor must match exactly once, else the row is invalid).
function variant(dir, name, edits) {
    let src = SRC;
    for (const [from, to] of edits) {
        const n = count(src, from);
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
        src = src.replace(from, () => to);
    }
    const p = join(dir, `${name.replace(/[^A-Za-z0-9]/g, '_')}.sh`);
    writeFileSync(p, src);
    chmodSync(p, 0o755);
    return p;
}

// --- the self-test runner: async, PAR at a time; TMPDIR = a private empty dir whose entries are returned as `left` ---
let active = 0;
const waiting = [];
function gate() { return new Promise((res) => { const go = () => { active++; res(); }; if (active < PAR) go(); else waiting.push(go); }); }
function release() { active--; const w = waiting.shift(); if (w) w(); }
function runSelfTest(path, tmp, extra = {}) {
    return new Promise((res) => {
        const c = spawn('bash', [path, '--self-test'], { env: { ...ENV, TMPDIR: tmp, ...extra } });
        let out = ''; let err = '';
        // SIGTERM, not SIGKILL: the self-test's EXIT trap then removes its own mktemp dir
        const t = setTimeout(() => c.kill('SIGTERM'), 600000);
        c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
        c.on('close', (status) => { clearTimeout(t); res({ status, stdout: out, stderr: err, left: readdirSync(tmp) }); });
    });
}
// the temp dir is made inside the gate, so an interrupted run leaves at most PAR dirs. edits = null: the script itself.
// shim = true: a PATH-first logging mktemp (every path it creates, one per line, in dir/mk.paths); every logged path that
// still exists after the run is removed (exactly those: no other /tmp entry is read or touched) and the ones outside dir
// are returned as `leaked`, all logged paths as `logged`.
function realMktemp() {
    const real = spawnSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8', env: ENV }).stdout.trim();
    assert.ok(real.startsWith('/') && !real.includes("'"), `mktemp not found: "${real}"`);
    return real;
}
function launch(name, edits, shim = false, nulDir = null) {
    return (async () => {
        await gate();
        const dir = mkdtempSync(join(tmpdir(), 'ad-m-'));
        try {
            const tmp = join(dir, 'tmp'); mkdirSync(tmp);
            const p = edits ? variant(dir, name, edits) : SCRIPT;
            let extra = nulDir ? { PATH: nulDir + ':' + ENV.PATH } : {}; let pl = null;
            if (shim) {
                assert.ok(!dir.includes("'"), dir);
                const sd = join(dir, 'shim'); mkdirSync(sd); pl = join(dir, 'mk.paths'); writeFileSync(pl, '');
                writeFileSync(join(sd, 'mktemp'), ['#!/bin/bash', `o=$('${realMktemp()}' "$@") || exit $?`,
                    `printf '%s\\n' "$o" >>'${pl}'`, `printf '%s\\n' "$o"`, ''].join('\n'));
                chmodSync(join(sd, 'mktemp'), 0o755);
                extra = { PATH: sd + ':' + (extra.PATH || ENV.PATH) };
            }
            const r = await runSelfTest(p, tmp, extra);
            r.dir = dir;
            if (pl) {
                r.logged = readFileSync(pl, 'utf8').split('\n').filter(Boolean);
                r.leaked = r.logged.filter((q) => existsSync(q) && relative(dir, q).startsWith('..'));
                for (const q of r.logged) if (q.startsWith('/')) rmSync(q, { recursive: true, force: true });
            }
            return r;
        } finally { rmSync(dir, { recursive: true, force: true }); release(); }
    })();
}
function lazy(f) { let p = null; return () => { if (!p) { p = f(); p.catch(() => {}); } return p; }; }

// --- row 1: the in-repo script; row 2: an unmodified copy outside the repo (os.tmpdir), the mutants' baseline ---
const root = lazy(() => launch('root', null));
const base = lazy(() => launch('baseline', [['#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n']]));
// the unmutated copy under the NUL shim: the control row, and the revert baseline of NUL_MUTANTS on a NUL-clean host
const nbase = lazy(() => launch('baseline-nul', [['#!/usr/bin/env bash\n', '#!/usr/bin/env bash\n']], false, NULSHIM.dir));
function assertGreen(r) {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const m = /^self-test: (\d+) check\(s\) ok$/m.exec(r.stdout);
    assert.ok(m, `no "self-test: <n> check(s) ok" line\n${r.stdout}`);
    assert.equal(Number(m[1]), C, `the self-test counted ${m[1]} checks, want exactly ${C}`);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okLines(r.stdout).length, C);
    assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('self-test: ')).length, 1);
    assert.equal(r.stderr, '');
}
// Y7: the self-test's own mktemp dir (TMPDIR/allocation-diff-st.XXXXXX) is gone after it exits
function assertClean(r) { assert.deepEqual(r.left, [], `left in TMPDIR: ${r.left.join(' ')}`); }

test(`allocation-diff --self-test: exactly ${C} checks (the parsed summary count and the ok lines), 0 FAIL, exit 0`, { skip }, async () => {
    assertGreen(await root());
});

test('allocation-diff --self-test: an unmodified copy outside the repo (os.tmpdir) passes, the same ok labels in the same order', { skip }, async () => {
    const r = await base();
    assertGreen(r);
    assert.ok(relative(dirname(SCRIPT), r.dir).startsWith('..'), `the copy ${r.dir} is inside the repo`);
    assert.deepEqual(okLines(r.stdout), okLines((await root()).stdout));
});

test('allocation-diff --self-test: the ROW table names each printed row in order, each prefix exactly one row', { skip }, async () => {
    const rows = rowLines((await base()).stdout);
    assert.equal(rows.length, C);
    assert.equal(ROW.length, C + 1);
    for (let i = 1; i <= C; i++) {
        assert.ok(rows[i - 1].startsWith('ok ' + ROW[i]), `row ${i} is "${rows[i - 1]}", want prefix "${ROW[i]}"`);
        assert.equal(rows.filter((l) => l.startsWith('ok ' + ROW[i])).length, 1, `prefix "${ROW[i]}" must match exactly one row`);
    }
});

// --- mutants: [id, designed rows, description, exact-once edits] ---
// B2 table (mutants.py, 72 rows): anchors / rows / descriptions verbatim (json-escaped); its "M10 tr removed" (a
// 3-stage pipeline: every e2e row dies on the PIPESTATUS read) is M10b here, M10 is the plan's 4-stage tr no-op. G6 / G7
// are built from the three judge loops exactly as mutants.py builds them (P0 = the p loop, C0 = the count loop, O0 = the
// O loop).
const P0 = "  for ((i = 0; i < n; i++)); do\n    if [[ ${jp[$i]} == 0 ]]; then JWHY=\"no GC line between @@LITE-MARK end and the tool's exit fence in run $((i + 1))\"; return 0; fi\n  done\n";
const C0 = "  for ((i = 0; i < n; i++)); do\n    c=${JCNT[$i]:-}\n    if [[ -z \"$c\" ]]; then JWHY=\"no guard count in run $((i + 1))\"; return 0; fi\n    g=$((10#${jg[$i]})); c=$((10#$c))\n    if ((g < c)); then\n      d=$((c - g)); w=lines; [[ $d != 1 ]] || w=line\n      JWHY=\"trace lost $d GC $w in run $((i + 1)) (guard count $c, trace $g)\"; return 0\n    fi\n    if ((g > c)); then\n      d=$((g - c)); w=lines; [[ $d != 1 ]] || w=line\n      JWHY=\"$d GC $w in run $((i + 1)) the guard did not count (guard count $c, trace $g)\"; return 0\n    fi\n  done\n";
const O0 = "  for ((i = 0; i < n; i++)); do\n    o=$(printf '%s\\n' \"${JREC[$i]}\" | awk '!f && /^O /{ print substr($0, 3); f = 1 }')\n    if [[ -n \"$o\" ]]; then JWHY=\"old-generation GC in the window in run $((i + 1)) ($o)\"; return 0; fi\n  done\n";
const B2 = [
    ["M1", [1, 14], "window ignored",
        [["  if (st == 1) {\n    if (yg)",
          "  if (1) {\n    if (yg)"]]],
    ["M2", [6], "started accepted",
        [["$0 == \"@@LITE-MARK start\" {",
          "index($0, \"@@LITE-MARK start\") == 1 {"]]],
    ["M3", [3], "Mark-Compact young",
        [["yg = (k == \"Scavenge\" || k == \"Minor Mark-Sweep\")",
          "yg = (k == \"Scavenge\" || k == \"Minor Mark-Sweep\" || k == \"Mark-Compact\")"]]],
    ["M4", [2], "ms kept in the Y record",
        [["    if (yg) print \"Y \" k\n",
          "    if (yg) print \"Y \" k \" \" $2\n"]]],
    ["M5", [16, 30], "sort -u verdict multiset (multiset() lives in lib/common.sh: the src-side y_ms is mutated)",
        [["y_ms() { printf '%s\\n' \"$1\" | awk '/^Y /{ print \"*\\t\" substr($0, 3) }' | multiset; }",
          "y_ms() { printf '%s\\n' \"$1\" | awk '/^Y /{ print \"*\\t\" substr($0, 3) }' | sort -u | multiset; }"]]],
    ["M6", [17], "SAME test inverted",
        [["if [[ \"$MSB\" == \"$MSA\" ]]; then",
          "if [[ \"$MSB\" != \"$MSA\" ]]; then"]]],
    ["M7", [20], "p guard removed",
        [["if [[ ${jp[$i]} == 0 ]]",
          "if [[ ${jp[$i]} == none ]]"]]],
    ["M8", [22], "null control skipped",
        [["for ((i = 1; i < n; i++)); do\n    nk=",
          "for ((i = n; i < n; i++)); do\n    nk="]]],
    ["M9", [19], "--zero tests > 1",
        [["if [[ $Y -eq 0 ]]",
          "if [[ $Y -le 1 ]]"]]],
    ["M9b", [18], "--zero tests == 1",
        [["if [[ $Y -eq 0 ]]",
          "if [[ $Y -eq 1 ]]"]]],
    ["M10b", [25], "tr removed",
        [["| tr '\\000' '?' | awk \"$GC_AWK\"",
          "| awk \"$GC_AWK\""]]],
    ["M12", [4], "(during sweeping) fold removed",
        [[" sub(/ \\(during sweeping\\)$/, \"\", k)",
          ""]]],
    ["M13", [5], "old list as prefix",
        [["od = (k == \"Mark-Compact\" ||",
          "od = (k ~ /^Mark-Compact/ ||"]]],
    ["M14", [21], "p check reads g",
        [["jp[$i]=${BASH_REMATCH[2]}",
          "jp[$i]=${BASH_REMATCH[1]}"]]],
    ["M15", [5], "kind by substring",
        [["yg = (k == \"Scavenge\" || k == \"Minor Mark-Sweep\")",
          "yg = (index(k, \"Scavenge\") > 0 || index(k, \"Minor Mark-Sweep\") > 0)"]]],
    ["M16", [7], "ERE $ dropped",
        [["; (GC in old space requested)?$/) {",
          "; (GC in old space requested)?/) {"]]],
    ["M17", [1, 28], "lines after gcn counted",
        [["st == 3 { if ($0 == \"@@LITE-MARK gcn\") x(\"@@LITE-MARK gcn given twice\"); next }",
          "st == 3 && /^\\[[0-9]+:0x/ { g++; p++; next }\nst == 3 { if ($0 == \"@@LITE-MARK gcn\") x(\"@@LITE-MARK gcn given twice\"); next }"]]],
    ["M18", [9], "collector group widened",
        [["; (GC in old space requested)?$/) {",
          "; ([A-Za-z][A-Za-z ]*)?$/) {"]]],
    ["M19", [8, 38], "pairing removed",
        [["if ((yg && $0 !~ /; $/) ||",
          "if (0 && (yg && $0 !~ /; $/) ||"]]],
    ["M20", [29], "null control run 2 only",
        [["for ((i = 1; i < n; i++)); do\n    nk=",
          "for ((i = 1; i < 2 && i < n; i++)); do\n    nk="]]],
    ["W1", [10], "not-at-line-start rule removed",
        [["st == 1 && /\\[[0-9]+:0x/ {",
          "0 && /\\[[0-9]+:0x/ {"]]],
    ["W2", [11, 50], "gcn twice not flagged",
        [["st == 3 { if ($0 == \"@@LITE-MARK gcn\") x(\"@@LITE-MARK gcn given twice\"); next }",
          "st == 3 { next }"]]],
    ["W3", [12], "no-start X dropped",
        [["if (!ss) x(\"no @@LITE-MARK start\"); else",
          "if (0) x(\"no @@LITE-MARK start\"); else"]]],
    ["W4", [13, 41], "CR stripped before matching",
        [["BEGIN { st = 0; ss = 0; se = 0; g = 0; p = 0 }",
          "BEGIN { st = 0; ss = 0; se = 0; g = 0; p = 0 }\n{ sub(/\\r$/, \"\") }"]]],
    ["W5", [27], "gcn-missing X only before end",
        [["  if (st < 3) {\n",
          "  if (st < 2) {\n"]]],
    ["S1", [15], "gcn.cjs text off by one byte",
        [["i < 131072; i++)",
          "i < 131071; i++)"]]],
    ["J1", [23], "O check removed",
        [["awk '!f && /^O /{ print substr($0, 3); f = 1 }'",
          "awk '!f && /^Q /{ print substr($0, 3); f = 1 }'"]]],
    ["J2", [24], "driver exit not checked",
        [["    *) JWHY=\"driver exited ${JRC[$i]} in run $((i + 1))\"; return 0 ;;",
          "    *) ;;"]]],
    ["J3", [26, 40], "driver exit named before awk",
        [["if [[ $a != 0 ]]; then RUN_RC=\"awk $a\"; elif",
          "if [[ $n != 0 ]]; then RUN_RC=$n; elif [[ $a != 0 ]]; then RUN_RC=\"awk $a\"; elif"]]],
    ["J4", [40], "tee named before tr",
        [["elif [[ $r != 0 ]]; then RUN_RC=\"tr $r\"; elif [[ $t != 0 ]]; then RUN_RC=\"tee $t\";",
          "elif [[ $t != 0 ]]; then RUN_RC=\"tee $t\"; elif [[ $r != 0 ]]; then RUN_RC=\"tr $r\";"]]],
    ["J5", [42], "no-G check removed",
        [["if [[ ! \"$last\" =~ $G_RE ]]; then JWHY=\"unparseable --trace-gc output in run $((i + 1)): no G record\"; return 0; fi",
          "[[ \"$last\" =~ $G_RE ]] || true"]]],
    ["K1", [39], "driver exit checked in run 1 only",
        [["  for ((i = 0; i < n; i++)); do\n    case \"${JRC[$i]}\" in",
          "  for ((i = 0; i < 1; i++)); do\n    case \"${JRC[$i]}\" in"]]],
    ["K2", [39], "p checked in run 1 only",
        [["  for ((i = 0; i < n; i++)); do\n    if [[ ${jp[$i]} == 0 ]]",
          "  for ((i = 0; i < 1; i++)); do\n    if [[ ${jp[$i]} == 0 ]]"]]],
    ["K3", [39], "X checked in run 1 only",
        [["if [[ -n \"$x\" ]]; then JWHY=\"unparseable",
          "if [[ -n \"$x\" && $i == 0 ]]; then JWHY=\"unparseable"]]],
    ["E1", [31], "stderr merged into stdout",
        [["\"./$2\" 2>\"$4\" 3>\"$5\")",
          "\"./$2\" 2>&1 3>\"$5\")"]]],
    ["E2", [32], "--zero side named before",
        [["  SIDES=(driver)\n",
          "  SIDES=(before)\n"]]],
    ["E3", [33], "trace flags before v8 extra",
        [["\"$NODE_BIN\" ${V8_EXTRA[@]+\"${V8_EXTRA[@]}\"} \"${TRACE_FLAGS[@]}\" \\\n",
          "\"$NODE_BIN\" \"${TRACE_FLAGS[@]}\" ${V8_EXTRA[@]+\"${V8_EXTRA[@]}\"} \\\n"]]],
    ["E4", [33, 34], "driver passed bare (no ./)",
        [["\"./$2\" 2>\"$4\" 3>\"$5\")",
          "\"$2\" 2>\"$4\" 3>\"$5\")"]]],
    ["E5", [35], "NODE_OPTIONS kept in the runs",
        [["tx=$( (cd \"$1\" && env -u NODE_OPTIONS \"$NODE_BIN\"",
          "tx=$( (cd \"$1\" && env \"$NODE_BIN\""]]],
    ["E6", [36], "failing --version ignored",
        [["2>/dev/null) || die \"cannot run $NODE_BIN --version\"",
          "2>/dev/null) || true"]]],
    ["E7", [37], "default --runs 3 (MD-31 reverted)",
        [["ZERO=0; RUNS=5;",
          "ZERO=0; RUNS=3;"]]],
    ["G1", [46], "missing count read as 0",
        [["c=${JCNT[$i]:-}",
          "c=${JCNT[$i]:-0}"]]],
    ["G2", [44, 49], "g < count branch removed",
        [["if ((g < c)); then",
          "if ((0)); then"]]],
    ["G3", [45], "g > count branch removed",
        [["if ((g > c)); then",
          "if ((0)); then"]]],
    ["G5", [48], "count checked in run 1 only",
        [["for ((i = 0; i < n; i++)); do\n    c=${JCNT",
          "for ((i = 0; i < 1; i++)); do\n    c=${JCNT"]]],
    ["G6", [52], "count after O",
        [[P0 + C0 + O0,
          P0 + O0 + C0]]],
    ["G7", [51], "count before p",
        [[P0 + C0,
          C0 + P0]]],
    ["G8", [47], "count regex unanchored",
        [["CNT_RE=$'^(0|[1-9][0-9]{0,8})\\n$'",
          "CNT_RE='([0-9]+)'"]]],
    ["G9", [47], "NUL length check dropped",
        [["[[ \"${#c}\" == \"$sz\" && \"$c\" =~ $CNT_RE ]]",
          "[[ \"$c\" =~ $CNT_RE ]]"]]],
    ["G12", [43, 53], "--require dropped",
        [["--require \"$T/gcn.cjs\" \"./$2\"",
          "\"./$2\""]]],
    ["R1", [54], "fd 3 open for the whole pipeline",
        [["tx=$( (cd \"$1\" &&",
          "tx=$(exec 3>\"$5\"; (cd \"$1\" &&"]]],
    ["R4", [56], "-ef check of the BEFORE driver only",
        [["  for ((i = 0; i < ${#POS[@]}; i++)); do   # -ef",
          "  for ((i = 0; i < 1; i++)); do   # -ef"]]],
    ["R8", [72, 55], "temp dir not removed",
        [["if [[ -n \\\"\\$T\\\" ]]; then rm -rf \\\"\\$T\\\"; fi; ",
          ""]]],
    // N1 (PLAN D1 (2)): row 56 only; row 57's od1 / od3 hard link now reaches MD-37 ("has another hard link") with the
    // -ef loop gone (C-25: the two back each other up), so row 57 belongs to the N1p pair mutant in NEW
    ["N1", [56], "--out report.txt == driver check removed",
        [["[[ ! \"$OUT/report.txt\" -ef \"${POS[$i]}\" ]] ||",
          "true ||"]]],
    ["N2", [33, 55], "bare mktemp -d",
        [["mktemp -d \"$TB/allocation-diff.XXXXXX\"",
          "mktemp -d"]]],
    ["N3", [55], "relative TMPDIR not made absolute",
        [["[[ \"$TB\" == /* ]] || TB=\"$PWD/$TB\"",
          "true"]]],
    ["P1", [58], "node not made absolute (A13 fix reverted)",
        [["NODE_BIN=\"${NODE_DIR%/}/$(basename -- \"$NODE_RES\")\"",
          "NODE_BIN=\"$NODE_RES\""]]],
    ["H1", [59], "-h states default 3",
        [["node runs per side, 2..20 (default 5)",
          "node runs per side, 2..20 (default 3)"]]],
    ["H2", [59], "-h exits 0",
        [["-h|--help) [[ $EQ -eq 0 ]] || die \"$a takes no value\"; usage; exit 2 ;;",
          "-h|--help) [[ $EQ -eq 0 ]] || die \"$a takes no value\"; usage; FINAL=1; exit 0 ;;"]]],
    ["F1", [60], "--zero takes 2 DRIVERs",
        [["[[ ${#POS[@]} -eq 1 ]] || die \"--zero takes",
          "[[ ${#POS[@]} -ge 1 ]] || die \"--zero takes"]]],
    ["F2", [61], "diff takes 1 DRIVER",
        [["[[ ${#POS[@]} -eq 2 ]] || die \"need exactly two",
          "[[ ${#POS[@]} -ge 1 ]] || die \"need exactly two"]]],
    ["F3", [62], "--runs 1 accepted",
        [["[[ $RUNS -ge 2 && $RUNS -le 20 ]]",
          "[[ $RUNS -ge 1 && $RUNS -le 20 ]]"]]],
    ["F4", [63], "--runs 21 accepted",
        [["[[ $RUNS -ge 2 && $RUNS -le 20 ]]",
          "[[ $RUNS -ge 2 && $RUNS -le 21 ]]"]]],
    ["F5", [64, 67], "_ not read as -",
        [["  g=\"${f//_/-}\"\n",
          "  g=\"$f\"\n"]]],
    ["F6", [65], "semi-space refusal removed",
        [["    *semi-space*)\n",
          "    *semi-spacex*)\n"]]],
    ["F7", [66], "predictable refusal removed",
        [["    *predictable-gc-schedule*)\n",
          "    *predictable-gc-schedulex*)\n"]]],
    ["F8", [68, 71], "non-flag accepted",
        [["[[ \"$f\" == --[A-Za-z]* ]] || die",
          "[[ \"$f\" == * ]] || die"]]],
    ["F9", [69], "no did-you-mean hint",
        [["die \"unknown option $a$(hint \"$a\") (see --help)\"",
          "die \"unknown option $a (see --help)\""]]],
    ["F10", [70], "newline in --out accepted",
        [["[[ \"$V8FLAGS$OUT$NODE_BIN\" != *",
          "[[ \"$V8FLAGS$NODE_BIN\" != *"]]],
    // D1-D3 re-pinned (PLAN D2-6 / MD-43): the one widened prefix arm; D3's old "prefix refusal" is now the design
    ["D1", [71, 75], "--require / --import accepted",
        [["    --require*|--import*|--loader*|--experimental-loader*)\n",
          "    --requirex)\n"]]],
    ["D2", [71, 75], "only the =FILE forms refused",
        [["    --require*|--import*|--loader*|--experimental-loader*)\n",
          "    --require=*|--import=*|--loader=*|--experimental-loader=*)\n"]]],
    ["D3", [75], "loader globs dropped",
        [["    --require*|--import*|--loader*|--experimental-loader*)\n",
          "    --require*|--import*)\n"]]],
];
// Plan mutants not in the B2 table: M10 (A13 addendum "M10 in B3 = a 4-stage tr no-op": NUL bytes reach the record awk,
// the pipeline keeps its 4 exits) and M11 (A6 "guard compare removed": the count loop deleted). Designed rows from the
// ASSERTIONS that name them (A3 M10 row; A6 count 7 / count 5 / absent).
const NEW = [
    ['M10', [25], '4-stage tr no-op (tr maps NUL to NUL, 4 pipeline exits kept)',
        [["| tr '\\000' '?' | awk \"$GC_AWK\"",
          "| tr '\\000' '\\000' | awk \"$GC_AWK\""]]],
    ['M11', [44, 45, 46], 'guard compare removed (the count loop deleted)',
        [[C0, '']]],
    // B2h (A15 TASK 3h / A16 (b)): the MD-33 guard line removed; at euid 0 row 73 expects the emptiness refusal, which
    // the guard never gives, so the mutant cannot be killed there (skipped at euid 0)
    ['B2h', [73], 'MD-33 unreadable-raw guard line removed',
        [[RAWGUARD, '']]],
    // D4 / D5 / D6 (PLAN D1 Other changes, D2-6, D3-1): the MD-39 env-file / config-file arm, the MD-42 module arm cut to
    // its exact forms, the MD-44 eval / print arm; each is the one check (74 / 75 / 76) that gates its arm
    ['D4', [74], 'env-file / config-file refusal removed',
        [["    --env-file*|--experimental-config-file*|--experimental-default-config-file*)\n",
          "    --env-filex)\n"]]],
    ['D5', [75], 'exact forms only (no prefix match)',
        [["    --require*|--import*|--loader*|--experimental-loader*)\n",
          "    --require|--require=*|--import|--import=*|--loader|--loader=*|--experimental-loader|--experimental-loader=*)\n"]]],
    ['D6', [76], 'eval / print refusal removed',
        [["    --eval*|--print*)\n",
          "    --evalx)\n"]]],
    // N1p (PLAN D1 (2)): the DRIVER -ef loop AND MD-37 (the hard-link refusal) both dropped. Each alone backs the other
    // up on row 57 (od1 / od3 share one inode), so only the pair kills it; each half alone surviving row 57 is logged
    // in the B2b evidence, not gated here.
    ['N1p', [57], '--out report.txt == driver check AND the hard-link check removed',
        [["[[ ! \"$OUT/report.txt\" -ef \"${POS[$i]}\" ]] ||",
          "true ||"],
         ["[[ ! -e \"$OUT/report.txt\" ]] || { RL=",
          "true || { RL="]]],
    // V1-V3 (PLAN-md46 G5 TASK 4, MD-50 / MD-56): the v8fl_check call (lib/v8flags.sh's --v8-options read + allowlist)
    // removed, moved above the --version probe, moved after the first disk write (gcn.cjs into the temp dir)
    ['V1', [16, 71, 77, 78], 'v8fl_check call removed (no --v8-options read, no allowlist)',
        [[V8CALL, '']]],
    ['V2', [36, 78], 'v8fl_check (the --v8-options read) moved above the --version probe',
        [[VERLINE + V8CALL, V8CALL + VERLINE]]],
    ['V3', [77], 'v8fl_check (the --v8-options read) moved after the gcn.cjs write into the temp dir',
        [[VERLINE + V8CALL, VERLINE],
         [GCNLINE, GCNLINE + V8CALL]]],
];
const MUTANTS = [...B2, ...NEW];
const NONROOT = new Set(['B2h']);

// R8 drops the script's own trap rm: the self-test row 55 run with TMPDIR unset then leaves /tmp/allocation-diff.XXXXXX
// behind (two such dirs from the B2 mutant runs were found in /tmp). R8 therefore runs ALONE, after every other
// self-test of this file has settled, under the PATH-first logging mktemp shim (launch shim = true): exactly the paths
// its mktemp calls created are removed, never another run's /tmp entry (B3 review r1 nit: the cross-run race).
const EXCL = new Set(['R8']);

// red = exit 1, the FAILED summary, every designed row among the FAIL lines (by label prefix)
function assertKilled(name, r, rows) {
    assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^self-test: \d+ check\(s\) FAILED$/m);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    for (const n of rows) {
        assert.ok(fl.some((l) => l.startsWith('FAIL ' + ROW[n])), `mutant ${name}: expected row ${n} "${ROW[n]}" to FAIL\n${fl.join('\n')}`);
    }
}

// --- exit wiring (Y6, B2 review): a self-test whose row FAILs must exit non-zero. EW1 flips ONE canned expectation (row
// 59's -h grep count 1 -> 9); EWa (Y6: the self-test's return code dropped) and EWb (the summary ignoring fails) break
// the wiring on top of EW1 and must make the row's assertion throw.
const EW1 = ['"2|allocation-diff.sh --|1|1"', '"2|allocation-diff.sh --|1|9"'];
const EW = [
    ['EW1-one-expectation-flipped', [EW1]],
    ['EWa-Y6-self-test-rc-dropped', [EW1, ['if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi', 'self_test || true; FINAL=1; exit 0']]],
    ['EWb-summary-ignores-fails', [EW1, ['if [[ $fails -eq 0 && $oks -gt 0 ]]; then', 'if [[ $oks -gt 0 ]]; then']]],
];
// Y7 (B2 review): the self-test's EXIT trap no longer removes its own temp dir (the self-test itself stays green)
const Y7 = ['Y7-self-test-trap-rm-dropped', [['rm -rf \\"\\$ST_D\\"; ', '']]];
function assertWired(r) {
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const fl = r.stdout.split('\n').filter((l) => l.startsWith('FAIL '));
    assert.equal(fl.length, 1, fl.join('\n'));
    assert.ok(fl[0].startsWith('FAIL ' + ROW[59]), fl[0]);
    assert.equal(okLines(r.stdout).length, C - 1);
    assert.match(r.stdout, /^self-test: 1 check\(s\) FAILED$/m);
    assert.doesNotMatch(r.stdout, /^self-test: \d+ check\(s\) ok$/m);
}

// launched together by the FIRST test that needs one (so a --test-name-pattern run that selects none spawns none)
let KILLS = null; let WIRES = null; let Y7R = null;
function kills() {
    if (KILLS) return KILLS;
    const others = [root(), base(), nbase()];   // nbase too: R8 still runs alone after every other self-test
    KILLS = MUTANTS.map(([name, , , edits]) => {
        if (EXCL.has(name)) return null;
        const p = launch(name, edits, false, nulFor(name)); p.catch(() => {}); others.push(p); return p;
    });
    WIRES = EW.map(([name, edits]) => { const p = launch(name, edits); p.catch(() => {}); others.push(p); return p; });
    Y7R = launch(Y7[0], Y7[1]); Y7R.catch(() => {}); others.push(Y7R);
    const settled = Promise.allSettled(others);
    MUTANTS.forEach(([name, , , edits], i) => {
        if (!EXCL.has(name)) return;
        KILLS[i] = (async () => {
            await settled;
            const r = await launch(name, edits, true);
            assert.ok(r.logged.length > 0, `${name}: the logging mktemp shim saw no call (not on PATH?)`);
            return r;
        })();
        KILLS[i].catch(() => {});
    });
    return KILLS;
}
function wires() { kills(); return WIRES; }
function y7r() { kills(); return Y7R; }

test('allocation-diff mutant table: B2 holds mutants.py\'s 72 rows, ids unique, M1-M20 present, every self-test row designed by >= 1 mutant', () => {
    assert.equal(B2.length, 72);
    assert.equal(new Set(MUTANTS.map((m) => m[0])).size, MUTANTS.length, 'mutant ids are unique');
    for (let i = 1; i <= 20; i++) assert.ok(MUTANTS.some((m) => m[0] === `M${i}`), `M${i} is in the table`);
    const designed = new Set();
    for (const [name, rows] of MUTANTS) {
        assert.ok(rows.length > 0, `${name} designs no row`);
        for (const n of rows) { assert.ok(Number.isInteger(n) && n >= 1 && n <= C, `${name}: row ${n}`); designed.add(n); }
    }
    for (let n = 1; n <= C; n++) assert.ok(designed.has(n), `row ${n} "${ROW[n]}" is no mutant's designed row`);
});

MUTANTS.forEach(([name, rows, desc], i) => {
    const sk = skip || (NONROOT.has(name) && ROOTUSER ? 'euid 0 reads a 0300 dir: the guard never fires' : false);
    test(`allocation-diff --self-test MUST FAIL on mutant ${name} (${desc}) at row(s) ${rows.join(',')}`, { skip: sk }, async (t) => {
        const r = await kills()[i];
        if (r.logged) t.diagnostic(`${name}: removed the ${r.logged.length} logged mktemp path(s), ${r.leaked.length} left outside its dir: ${r.leaked.join(' ')}`);
        assertKilled(name, r, rows);
    });
    test(`allocation-diff mutant ${name}: revert check (the unmutated copy fails the same kill assertion)`, { skip }, async () => {
        const r = await (nulFor(name) ? nbase() : base());   // a NUL mutant under the shim reverts against the shimmed copy
        assert.throws(() => assertKilled(name, r, rows), assert.AssertionError, `mutant ${name}: the kill assertion passes with no mutation`);
    });
});

test(`allocation-diff --self-test exit wiring (Y6): one flipped canned expectation -> exit 1, exactly 1 FAIL (row 59), ${C - 1} ok, "self-test: 1 check(s) FAILED"`, { skip }, async () => {
    assertWired(await wires()[0]);
});
test('allocation-diff --self-test exit wiring (Y6): revert checks (unmutated copy, rc dropped, summary ignoring fails) each fail the assertion', { skip }, async () => {
    const b = await base();
    assert.throws(() => assertWired(b), assert.AssertionError);
    for (const i of [1, 2]) {
        const r = await wires()[i];
        assert.equal(r.status, 0, `${EW[i][0]}: the wiring mutant must exit 0 (else it does not test the wiring)\n${r.stdout}`);
        assert.throws(() => assertWired(r), assert.AssertionError, EW[i][0]);
    }
});

test('allocation-diff --self-test temp dir (Y7): TMPDIR is empty after the green runs (in-repo, copy) and the red run (EW1)', { skip }, async () => {
    assertClean(await root());
    assertClean(await base());
    const red = await wires()[0];
    assert.equal(red.status, 1);
    assertClean(red);
});
test('allocation-diff --self-test temp dir (Y7): revert check (the trap rm dropped: still green, the assertion throws)', { skip }, async () => {
    const r = await y7r();
    assertGreen(r);   // Y7 survives the self-test: only this row sees it
    assert.throws(() => assertClean(r), assert.AssertionError);
    assert.equal(r.left.length, 1, r.left.join(' '));
    assert.match(r.left[0], /^allocation-diff-st\.[A-Za-z0-9]{6}$/);
});

// --- b37 "NUL mutants": probe + shim (their own rows; the full shim pin is in deopt-diff.test.mjs)
test('nul-awk probe: the host awk reads a<NUL>b as length 3 (NUL-clean) or 1 (truncating); M10 takes the shim iff NUL-clean', { skip }, (t) => {
    t.diagnostic(`host awk ${NUL.awk}: length(a<NUL>b) = ${NUL.len} -> ${NUL.nulClean ? 'NUL-clean: M10 runs under the shim' : 'truncating: M10 runs as is'}`);
    assert.ok(NUL.len === 1 || NUL.len === 3, String(NUL.len));
    assert.equal(NUL.nulClean, NUL.len === 3);
    for (const [name] of MUTANTS) assert.equal(nulFor(name), NUL.nulClean && NUL_MUTANTS.has(name) ? NULSHIM.dir : null, name);
    assert.ok(MUTANTS.some(([m]) => m === 'M10'));
    // the shim: first on its PATH, a truncating awk whatever the host awk is, never itself
    assert.deepEqual(probeAwk({ ...ENV, PATH: NULSHIM.dir + ':' + ENV.PATH }), { awk: NULSHIM.awk, len: 1, nulClean: false });
    assert.ok(NULSHIM.real.startsWith('/') && NULSHIM.real !== NULSHIM.awk && !NULSHIM.real.startsWith(NULSHIM.dir + '/'), NULSHIM.real);
    const r = spawnSync(NULSHIM.awk, ['{ print NR ":" $0 }'], { input: Buffer.from('a\0b\nc\n', 'latin1'), env: ENV });
    assert.deepEqual([r.status, r.stdout.toString('latin1')], [0, '1:a\n2:c\n']);
});
test(`allocation-diff --self-test under the NUL shim (control): the UNMUTATED copy passes all ${C} checks, row 25 (A3 M10) included`, { skip }, async () => {
    const r = await nbase();
    assertGreen(r);
    assert.equal(okLines(r.stdout).filter((l) => l.startsWith('ok ' + ROW[25])).length, 1);
});

// --- the refusal rig: this file's OWN logging fake node and mktemp shim. The fake node logs its argv per spawn and
// answers --version (anything else, --v8-options too: exit 0, no output -- so v8fl_check dies "--v8-options printed
// nothing" after 2 spawns; only the B2h mutant row gets that far). PATH = mktemp shim, fake node dir, host PATH; TMPDIR =
// d/tmp; cwd = d/cwd. `ents` lists every entry under d (the two logs excepted): a refusal writes nothing anywhere.
function rig() {
    const d = mkdtempSync(join(tmpdir(), 'ad-rf-'));
    const fk = join(d, 'fk'); const mk = join(d, 'mk'); const dr = join(d, 'dr');
    for (const x of [fk, mk, dr, join(d, 'tmp'), join(d, 'cwd')]) mkdirSync(x);
    const bash = process.env.BASH && process.env.BASH.startsWith('/') ? process.env.BASH : '/bin/bash';
    const log = join(d, 'node.log'); const mkl = join(d, 'mk.log');
    writeFileSync(join(fk, 'node'), [`#!${bash}`, `printf '%s\\n' "$*" >>'${log}'`,
        'case "$1" in --version) echo v26.8.2 ;; esac', 'exit 0', ''].join('\n'));
    chmodSync(join(fk, 'node'), 0o755);
    const real = spawnSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8', env: ENV }).stdout.trim();
    assert.ok(real.startsWith('/'), `mktemp not found: "${real}"`);
    writeFileSync(join(mk, 'mktemp'), [`#!${bash}`, `printf '%s\\n' "$*" >>'${mkl}'`, `exec '${real}' "$@"`, ''].join('\n'));
    chmodSync(join(mk, 'mktemp'), 0o755);
    for (const f of ['a.js', 'b.js', 'z.js']) writeFileSync(join(dr, f), '');
    const run = (script, args, o = {}) => {
        writeFileSync(log, ''); writeFileSync(mkl, '');
        const r = spawnSync('bash', [script, ...args], {
            encoding: 'utf8', timeout: 120000, cwd: o.cwd || join(d, 'cwd'),
            env: { ...ENV, PATH: mk + ':' + fk + ':' + process.env.PATH, TMPDIR: o.tmpdir || join(d, 'tmp'), ...(o.env || {}) },
        });
        const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean);
        return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr, argv: lines(log), mk: lines(mkl) };
    };
    const ents = () => {
        const acc = [];
        const walk = (p) => {
            for (const e of readdirSync(p, { withFileTypes: true })) {
                const q = join(p, e.name);
                if (q === log || q === mkl) continue;
                acc.push(relative(d, q));
                if (e.isDirectory() && !e.isSymbolicLink()) { try { walk(q); } catch { acc.push(relative(d, q) + '/<unreadable>'); } }
            }
        };
        walk(d);
        return acc.sort();
    };
    const modes = [];   // [path, mode] restored before removal
    return {
        d, dr, node: join(fk, 'node'), a: join(dr, 'a.js'), b: join(dr, 'b.js'), z: join(dr, 'z.js'), run, ents,
        chmod: (p, m) => { modes.push(p); chmodSync(p, m); },
        done: () => { for (const p of modes) { try { chmodSync(p, 0o755); } catch { /* gone */ } } rmSync(d, { recursive: true, force: true }); },
    };
}
function withRig(fn) { const g = rig(); try { fn(g); } finally { g.done(); } }
// refused: exit 2, stdout empty, stderr exactly the die line + VERDICT NO-VERDICT, 0 node spawns, 0 mktemp, 0 new entries
function refused(g, script, args, msg, o = {}) {
    const b0 = g.ents();
    const r = g.run(script, args, o);
    const what = JSON.stringify(args);
    assert.equal(r.status, 2, `${what}\n${r.out}`);
    assert.equal(r.stdout, '', `${what}: stdout`);
    assert.equal(r.stderr, `allocation-diff: ${msg}\nVERDICT NO-VERDICT\n`, what);
    assert.deepEqual(r.argv, [], `${what}: node spawned`);
    assert.deepEqual(r.mk, [], `${what}: mktemp called`);
    assert.deepEqual(g.ents(), b0, `${what}: entries written`);
}
// the env key bash exports a function named node under (BASH_FUNC_node%% on bash 3.2 / 5.x), taken from bash itself
const FUNC_KEY = (() => {
    const r = spawnSync('bash', ['-c', 'node() { :; }; export -f node; env'], { encoding: 'utf8', env: ENV });
    const l = (r.stdout || '').split('\n').find((x) => /^[^=]*node[^=]*=\(\) \{/.test(x));
    return l ? l.slice(0, l.indexOf('=')) : null;
})();
const NOTFILE = 'node binary is not a file on PATH (a function, alias or builtin?): ';

// --- -h (TASK 6: exit 2): the usage text = the header comment from line 2 through the first blank line, "# " stripped,
// on stdout (stderr empty), --help the same, 0 spawns, 0 mktemp, nothing written ---
const USAGE = (() => {
    const L = SRC.split('\n');
    const e = L.indexOf('', 1);
    return L.slice(1, e + 1).map((l) => l.replace(/^# ?/, '')).join('\n') + '\n';
})();
const HELP_LINES = [
    'allocation-diff.sh -- young-generation GC EVENT COUNTS inside a marked window of a driver, DRIVER_BEFORE vs',
    '  -h, --help         this text (exit 2)',
    '                     absolute path: a bare name through PATH (`command -v`; a function, alias or builtin is',
    '                     DIR/raw must be absent, or an empty, readable (and searchable) directory that is not a symlink;',
    '                     node options from a file into the measured process), and every --eval* / --print* flag, a',
    '  Each value option is given at most once and never empty; --v8-flags / --out / --node and DRIVER paths take no',
    '  newline. --self-test takes no other argument. --zero / --self-test / --help take no =value. An unknown option',
    '  exits 2 with a did-you-mean hint.',
    '                     non-flags). Accepted: V8 flags this node lists in --v8-options -- bool as --flag or --no-flag',
    // b37 Q-H1 (maintainer ruling "Say 'at the latest'"): the shared MD-46 refusal sentence, as wrapped in this -h
    '                     snapshot / file flags. Refused, exit 2 at the latest after one --v8-options read and before any',
    '                     measured run: every node option (--run, --test, --watch, --check, --inspect, --cpu-prof,',
    '  exits 2 before any node is spawned and before anything is written, except a --v8-flags flag outside the allowlist',
];
function assertHelp(script) {
    withRig((g) => {
        const b0 = g.ents();
        const h = g.run(script, ['-h']);
        assert.equal(h.status, 2, h.out);
        assert.equal(h.stderr, '');
        assert.equal(h.stdout, USAGE);
        const lines = h.stdout.split('\n');
        assert.equal(lines[0], HELP_LINES[0]);
        for (const l of HELP_LINES) assert.ok(lines.includes(l), `-h lacks the line "${l}"`);
        assert.doesNotMatch(h.stdout, /^VERDICT /m);
        assert.deepEqual([h.argv, h.mk], [[], []]);
        const hh = g.run(script, ['--help']);
        assert.equal(hh.status, 2, hh.out);
        assert.equal(hh.stderr, '');
        assert.equal(hh.stdout, h.stdout);
        assert.deepEqual([hh.argv, hh.mk], [[], []]);
        assert.deepEqual(g.ents(), b0);
    });
}
const HELP_TEETH = [
    ['h-exit0', [['usage; exit 2 ;;', 'usage; exit 0 ;;']]],
    ['h-stderr', [['usage; exit 2 ;;', 'usage >&2; exit 2 ;;']]],
    ['h-from-line-3', [["sed -n '2,/^$/{s/^# \\{0,1\\}//;p;}'", "sed -n '3,/^$/{s/^# \\{0,1\\}//;p;}'"]]],
];
test('allocation-diff -h / --help: exit 2, the header usage on stdout (stderr empty), key claim lines, 0 spawns, 0 mktemp', { skip }, () => {
    assertHelp(SCRIPT);
});
test(`allocation-diff -h: revert checks (${HELP_TEETH.map((x) => x[0]).join(', ')}) fail the row`, { skip }, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'ad-h-'));
    try {
        for (const [n, edits] of HELP_TEETH) {
            const p = variant(dir, n, edits);   // outside throws: a bad anchor is a row error, never a kill
            assert.throws(() => assertHelp(p), (e) => { t.diagnostic(`teeth ${n}: ${e.message.split('\n')[0]}`); return e instanceof assert.AssertionError; }, n);
        }
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- refusal rows: one per -h claim the self-test does not gate (B2 review: "Ungated -h claims"). Each form: exit 2,
// the exact die line, 0 node spawns (a logging fake node wherever a spawn could happen), 0 mktemp, 0 entries written.
// [label, fn(script), teeth: [name, edits, needs a non-root user?]]. A row marked CLAIM-MISMATCH asserts the ACTUAL
// behaviour where it differs from the -h claim (a finding; the script is not changed here). None is left at B2b: the
// two former ones (an alias holding a /, a dangling --out symlink) are refusal rows with teeth.
const NL = '\n';
const RAWMSG = (o) => (ROOTUSER ? `--out: ${o}/raw is not empty (give a new or empty DIR)` : `--out: ${o}/raw is not readable`);
// raw/ mode 0300 holding driver/run.1.txt ("OLD-RESULT"): the B3 review r1 blocker case
function setup0300(g) {
    const o = join(g.d, 'o5');
    mkdirSync(join(o, 'raw', 'driver'), { recursive: true }); writeFileSync(join(o, 'raw', 'driver', 'run.1.txt'), 'OLD-RESULT\n');
    g.chmod(join(o, 'raw'), 0o300);
    return o;
}
function raw0300(g, script) {
    const o = setup0300(g);
    refused(g, script, ['--node', g.node, '--runs', '2', '--out', o, '--zero', g.z], RAWMSG(o));
    refused(g, script, ['--node', g.node, '--runs', '2', '--out', o, g.a, g.b], RAWMSG(o));
    chmodSync(join(o, 'raw'), 0o700);
    assert.deepEqual(readdirSync(o), ['raw']);
    assert.deepEqual([readdirSync(join(o, 'raw')), readdirSync(join(o, 'raw', 'driver'))], [['driver'], ['run.1.txt']]);
    assert.equal(readFileSync(join(o, 'raw', 'driver', 'run.1.txt'), 'utf8'), 'OLD-RESULT\n');
}
const RF = [
    ['node is a builtin (--node echo, NODE=printf), an exported function named node, an alias (BASH_ENV + expand_aliases) -> refused, not a file on PATH',
        (script) => withRig((g) => {
            refused(g, script, ['--node', 'echo', '--zero', g.z], NOTFILE + 'echo -> echo');
            refused(g, script, ['--zero', g.z], NOTFILE + 'printf -> printf', { env: { NODE: 'printf' } });
            assert.ok(FUNC_KEY, 'cannot tell how bash exports a function named node');
            refused(g, script, ['--zero', g.z], NOTFILE + 'node -> node', { env: { [FUNC_KEY]: `() { printf 'func %s\\n' "$*" >>'${join(g.d, 'node.log')}'; }` } });
            // the one row that sets BASH_ENV: it defines the alias inside the script's own bash
            writeFileSync(join(g.d, 'benv'), 'shopt -s expand_aliases\nalias node=nodex\n');
            refused(g, script, ['--zero', g.z], NOTFILE + "node -> alias node='nodex'", { env: { BASH_ENV: join(g.d, 'benv') } });
        }),
        [['node-path-check-removed', [['[[ "$NODE_RES" == */* ]] || die', 'true || die']]]]],
    // An alias whose value holds a `/` passes the `*/*` check (`command -v` prints "alias node='<path>'"); the
    // executable-file check (B2a --node entry) refuses it before any spawn (was CLAIM-MISMATCH: "cannot run /node'
    // --version" after the cd failed).
    ['an alias holding a / (alias node=<abs fake node>) -> refused before any spawn, "not an executable file: alias node=\'<path>\'"',
        (script) => withRig((g) => {
            writeFileSync(join(g.d, 'benv'), `shopt -s expand_aliases\nalias node='${g.node}'\n`);
            refused(g, script, ['--zero', g.z], `node binary is not an executable file: alias node='${g.node}'`, { env: { BASH_ENV: join(g.d, 'benv') } });
        }),
        [['node-exec-check-removed', [['[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die', 'true || die']]]]],
    ['--out DIR whose raw is not empty (a file, an empty subdir, a dotfile) or is not a directory -> refused',
        (script) => withRig((g) => {
            const o = (n) => join(g.d, n);
            mkdirSync(join(o('o1'), 'raw'), { recursive: true }); writeFileSync(join(o('o1'), 'raw', 'keep'), 'K\n');
            mkdirSync(join(o('o2'), 'raw', 'sub'), { recursive: true });
            mkdirSync(join(o('o3'), 'raw'), { recursive: true }); writeFileSync(join(o('o3'), 'raw', '.hidden'), '');
            mkdirSync(o('o4')); writeFileSync(join(o('o4'), 'raw'), 'R\n');
            for (const n of ['o1', 'o2', 'o3']) {
                refused(g, script, ['--node', g.node, '--runs', '2', '--out', o(n), '--zero', g.z], `--out: ${o(n)}/raw is not empty (give a new or empty DIR)`);
                refused(g, script, ['--node', g.node, '--runs', '2', '--out', o(n), g.a, g.b], `--out: ${o(n)}/raw is not empty (give a new or empty DIR)`);
            }
            refused(g, script, ['--node', g.node, '--out', o('o4'), '--zero', g.z], `--out: ${o('o4')}/raw exists and is not a directory`);
            assert.equal(readFileSync(join(o('o1'), 'raw', 'keep'), 'utf8'), 'K\n');
            assert.equal(readFileSync(join(o('o4'), 'raw'), 'utf8'), 'R\n');
        }),
        [['raw-empty-check-removed', [['[[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die', 'true || die']]],
         ['raw-dir-check-removed', [['[[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die', 'true || die']]]]],
    // MD-33 (A15 / A16 (a) (c)): an unreadable raw/ is refused before any spawn (the B2h guard), never read as empty by
    // `ls -A ... 2>/dev/null` (the fail-open the B3 review r1 found: raw/ 0300 ran and blanked run.1.txt). Each form: exit
    // 2, `--out: <DIR>/raw is not readable`, 0 spawns, 0 mktemp, raw/ contents unchanged. At euid 0 (which reads and
    // searches any dir) every form holds an entry and is refused as non-empty instead, as self-test row 73 expects;
    // there o8 (a raw/ symlink) reads 'is a symlink' (MD-36, checked right after the readable check, PLAN D2-2).
    ['--out DIR whose raw/ is mode 0300 holding driver/run.1.txt (--zero, diff) -> refused before any spawn, "is not readable", run.1.txt bytes unchanged',
        (script) => withRig((g) => raw0300(g, script)),
        [['raw-readable-check-removed', [[RAWGUARD, '']], true]]],
    ['--out DIR whose raw/ is mode 0000 (holding a file), 0600 (fails -x, holding a file) or a symlink to a mode 0300 dir (holding a file) -> refused before any spawn, "is not readable", contents unchanged',
        (script) => withRig((g) => {
            const o6 = join(g.d, 'o6'); const o7 = join(g.d, 'o7'); const o8 = join(g.d, 'o8'); const t8 = join(g.d, 't8');
            for (const [o, m] of [[o6, 0o000], [o7, 0o600]]) {
                mkdirSync(join(o, 'raw'), { recursive: true }); writeFileSync(join(o, 'raw', 'f'), 'F\n'); g.chmod(join(o, 'raw'), m);
            }
            mkdirSync(t8); writeFileSync(join(t8, 'f'), 'F8\n'); mkdirSync(o8); symlinkSync(t8, join(o8, 'raw')); g.chmod(t8, 0o300);
            for (const o of [o6, o7, o8]) {
                refused(g, script, ['--node', g.node, '--runs', '2', '--out', o, '--zero', g.z], (ROOTUSER && o === o8 ? `--out: ${o8}/raw is a symlink (refused: the writes would follow it)` : RAWMSG(o)));
                refused(g, script, ['--node', g.node, '--runs', '2', '--out', o, g.a, g.b], (ROOTUSER && o === o8 ? `--out: ${o8}/raw is a symlink (refused: the writes would follow it)` : RAWMSG(o)));
            }
            for (const p of [join(o6, 'raw'), join(o7, 'raw'), t8]) chmodSync(p, 0o700);
            assert.deepEqual([readdirSync(join(o6, 'raw')), readdirSync(join(o7, 'raw')), readdirSync(t8)], [['f'], ['f'], ['f']]);
            assert.deepEqual([readFileSync(join(o6, 'raw', 'f'), 'utf8'), readFileSync(join(o7, 'raw', 'f'), 'utf8'), readFileSync(join(t8, 'f'), 'utf8')], ['F\n', 'F\n', 'F8\n']);
            assert.deepEqual([readdirSync(o6), readdirSync(o7), readdirSync(o8)], [['raw'], ['raw'], ['raw']]);
        }),
        [['raw-readable-check-removed', [[RAWGUARD, '']], true],
         ['raw-readable-no-x', [['( -r "$OUT/raw" && -x "$OUT/raw" )', '( -r "$OUT/raw" )']], true],
         ['raw-readable-no-r', [['( -r "$OUT/raw" && -x "$OUT/raw" )', '( -x "$OUT/raw" )']], true]]],
    // A dangling --out symlink: the A8 walk (C-11) stops at the link itself (not a directory) and refuses before any
    // spawn (was CLAIM-MISMATCH: refused only after the --version spawn and the mktemp).
    ['--out DIR a dangling symlink -> refused before any spawn, "cannot create <od>/raw/driver (<od> is not a writable directory)", nothing written',
        (script) => withRig((g) => {
            const od = join(g.d, 'od');
            symlinkSync(join(g.d, 'nowhere', 'x'), od);
            refused(g, script, ['--node', g.node, '--runs', '2', '--out', od, '--zero', g.z], `--out: cannot create ${od}/raw/driver (${od} is not a writable directory)`);
            assert.equal(existsSync(join(g.d, 'nowhere')), false);
        }),
        [['out-walk-check-removed', [['[[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die', 'true || die']]]]],
    ['--out DIR that exists and is not a directory (a file, a symlink to a file) -> refused, the file intact',
        (script) => withRig((g) => {
            const f = join(g.d, 'of'); writeFileSync(f, 'OF\n');
            const l = join(g.d, 'ol'); symlinkSync(f, l);
            refused(g, script, ['--node', g.node, '--out', f, '--zero', g.z], `--out: ${f} exists and is not a directory`);
            refused(g, script, ['--node', g.node, '--out', l, g.a, g.b], `--out: ${l} exists and is not a directory`);
            assert.equal(readFileSync(f, 'utf8'), 'OF\n');
        }),
        [['out-dir-check-removed', [['[[ ! -e "$OUT" || -d "$OUT" ]] || die', 'true || die']]]]],
    ['a value option given twice (--runs, --runs= then --runs, --node, --v8-flags, --out) -> refused',
        (script) => withRig((g) => {
            const od = join(g.d, 'od');
            refused(g, script, ['--node', g.node, '--runs', '3', '--runs', '3', '--zero', g.z], '--runs given twice');
            refused(g, script, ['--node', g.node, '--runs=3', '--runs', '4', g.a, g.b], '--runs given twice');
            refused(g, script, ['--node', g.node, '--node', g.node, '--zero', g.z], '--node given twice');
            refused(g, script, ['--node', g.node, '--v8-flags', '--expose-gc', '--v8-flags=--expose-gc', '--zero', g.z], '--v8-flags given twice');
            refused(g, script, ['--node', g.node, '--out', od, '--out', od, '--zero', g.z], '--out given twice');
            assert.equal(existsSync(od), false);
        }),
        [['twice-check-removed', [['[[ "$GOTOPT" != *" $a "* ]] || die', 'true || die']]]]],
    ['a value option given empty (--runs \'\', --runs=, --node \'\', --v8-flags=, --out \'\') or with no value -> refused',
        (script) => withRig((g) => {
            refused(g, script, ['--node', g.node, '--runs', '', '--zero', g.z], '--runs needs a non-empty value');
            refused(g, script, ['--node', g.node, '--runs=', '--zero', g.z], '--runs needs a non-empty value');
            refused(g, script, ['--node', '', '--zero', g.z], '--node needs a non-empty value');
            refused(g, script, ['--node', g.node, '--v8-flags=', g.a, g.b], '--v8-flags needs a non-empty value');
            refused(g, script, ['--node', g.node, '--out', '', '--zero', g.z], '--out needs a non-empty value');
            refused(g, script, ['--node', g.node, '--zero', g.z, '--runs'], '--runs needs a value');
        }),
        [['empty-check-removed', [['[[ -n "$v" ]] || die "$a needs a non-empty value"', 'true || die "$a needs a non-empty value"']]]]],
    // TMPDIR = a path that does not exist: a self-test started by mistake dies at its first (logged) mktemp
    ['=value on --zero / --self-test / --help (=1 and empty =) -> refused, "takes no value"',
        (script) => withRig((g) => {
            const o = { tmpdir: join(g.d, 'none') };
            for (const v of ['=1', '=']) {
                refused(g, script, ['--node', g.node, `--zero${v}`, g.z], '--zero takes no value', o);
                refused(g, script, [`--self-test${v}`], '--self-test takes no value', o);
                refused(g, script, ['--node', g.node, `--help${v}`, g.a, g.b], '--help takes no value', o);
            }
        }),
        [['eq-help-check-removed', [['-h|--help) [[ $EQ -eq 0 ]] || die', '-h|--help) true || die']]],
         ['eq-self-test-check-removed', [['--self-test) [[ $EQ -eq 0 ]] || die', '--self-test) true || die']]],
         ['eq-zero-check-removed', [['--zero) [[ $EQ -eq 0 ]] || die', '--zero) true || die']]]]],
    ['--self-test with another argument (a DRIVER before / after, --runs, --zero before / after, --out, --node, --v8-flags) -> refused',
        (script) => withRig((g) => {
            const o = { tmpdir: join(g.d, 'none') };
            const M = '--self-test takes no other argument';
            refused(g, script, ['--self-test', g.z], M, o);
            refused(g, script, [g.z, '--self-test'], M, o);
            refused(g, script, ['--self-test', '--runs', '3'], M, o);
            refused(g, script, ['--self-test', '--zero'], M, o);
            refused(g, script, ['--zero', '--self-test'], M, o);
            refused(g, script, ['--self-test', '--out', join(g.d, 'od')], M, o);
            refused(g, script, ['--self-test', '--node', g.node], M, o);
            refused(g, script, ['--self-test', '--v8-flags', '--expose-gc'], M, o);
        }),
        [['self-test-args-check-removed', [['[[ -z "${GOTOPT// /}" && ${#POS[@]} -eq 0 && $ZERO == 0 ]] || die', 'true || die']]],
         ['self-test-args-no-option-check', [['[[ -z "${GOTOPT// /}" && ${#POS[@]}', '[[ ${#POS[@]}']]],
         ['self-test-args-no-driver-check', [['&& ${#POS[@]} -eq 0 && $ZERO == 0 ]]', '&& $ZERO == 0 ]]']]],
         ['self-test-args-no-zero-check', [['-eq 0 && $ZERO == 0 ]] || die "--self-test', '-eq 0 ]] || die "--self-test']]]]],
    ['a newline in a DRIVER path (an existing file, before / after / --zero, a missing one), in --node, in --v8-flags -> refused',
        (script) => withRig((g) => {
            const nl = join(g.dr, `a${NL}b.js`); writeFileSync(nl, '');
            refused(g, script, ['--node', g.node, '--zero', nl], 'DRIVER: a newline is not allowed in a path');
            refused(g, script, ['--node', g.node, nl, g.b], 'DRIVER: a newline is not allowed in a path');
            refused(g, script, ['--node', g.node, g.a, nl], 'DRIVER: a newline is not allowed in a path');
            refused(g, script, ['--node', g.node, g.a, join(g.dr, `no${NL}such.js`)], 'DRIVER: a newline is not allowed in a path');
            refused(g, script, ['--node', `${g.node}${NL}x`, '--zero', g.z], '--v8-flags / --out / --node: a newline is not allowed');
            refused(g, script, ['--node', g.node, '--v8-flags', `--expose-gc${NL}--expose-gc`, '--zero', g.z], '--v8-flags / --out / --node: a newline is not allowed');
        }),
        [['driver-newline-check-removed', [["[[ \"${POS[$i]}\" != *$'\\n'* ]] || die", 'true || die']]],
         ['option-newline-check-out-only', [['[[ "$V8FLAGS$OUT$NODE_BIN" != *', '[[ "$OUT" != *']]]]],
    ['blank --v8-flags (a space, spaces, space-tab-space, --v8-flags= + space) -> refused, "got only blanks"',
        (script) => withRig((g) => {
            for (const v of [' ', '   ', ' \t ']) {
                refused(g, script, ['--node', g.node, '--v8-flags', v, '--zero', g.z], '--v8-flags needs at least one flag, got only blanks');
            }
            refused(g, script, ['--node', g.node, '--v8-flags= ', g.a, g.b], '--v8-flags needs at least one flag, got only blanks');
        }),
        [['blank-check-removed', [['[[ -z "$V8FLAGS" || ${#V8_EXTRA[@]} -gt 0 ]] || die', 'true || die']]]]],
    ['DRIVER not found or not a readable file (before / after / --zero missing, a directory, a dangling symlink, mode 000) -> refused',
        (script) => withRig((g) => {
            const miss = join(g.dr, 'missing.js'); const dang = join(g.dr, 'dang.js'); symlinkSync(join(g.dr, 'nowhere.js'), dang);
            const M = (side, p) => `DRIVER (${side}) not found (or not a readable file): ${p}`;
            refused(g, script, ['--node', g.node, miss, g.b], M('before', miss));
            refused(g, script, ['--node', g.node, g.a, miss], M('after', miss));
            refused(g, script, ['--node', g.node, '--zero', miss], M('driver', miss));
            refused(g, script, ['--node', g.node, '--zero', g.dr], M('driver', g.dr));
            refused(g, script, ['--node', g.node, g.a, dang], M('after', dang));
            if (!ROOTUSER) {
                const u = join(g.dr, 'u.js'); writeFileSync(u, ''); g.chmod(u, 0o000);
                refused(g, script, ['--node', g.node, u, g.b], M('before', u));
            }
        }),
        [['driver-check-removed', [['[[ -f "${POS[$i]}" && -r "${POS[$i]}" ]] || die', 'true || die']]],
         ['driver-check-no-f', [['[[ -f "${POS[$i]}" && -r "${POS[$i]}" ]] ||', '[[ -r "${POS[$i]}" ]] ||']]],
         ['driver-check-no-r', [['[[ -f "${POS[$i]}" && -r "${POS[$i]}" ]] ||', '[[ -f "${POS[$i]}" ]] ||']], true]]],
    ['node not found (--node <abs missing>: not an executable file; --node <bare missing>, NODE=<bare missing>: not found) -> refused',
        (script) => withRig((g) => {
            const nope = join(g.d, 'nope', 'node');
            refused(g, script, ['--node', nope, '--zero', g.z], `node binary is not an executable file: ${nope}`);
            refused(g, script, ['--node', 'nosuchnode-ad', g.a, g.b], 'node binary not found: nosuchnode-ad');
            refused(g, script, ['--zero', g.z], 'node binary not found: nosuchnode-ad', { env: { NODE: 'nosuchnode-ad' } });
        }),
        [['node-not-found-fallback', [['NODE_RES=$(command -v -- "$NODE_BIN" 2>/dev/null) || die "node binary not found: $NODE_BIN"',
            'NODE_RES=$(command -v -- "$NODE_BIN" 2>/dev/null) || NODE_RES=$NODE_BIN']]]]],
];
for (const [label, fn, teeth] of RF) {
    test(`allocation-diff refused: ${label}`, { skip }, () => { fn(SCRIPT); });
    if (teeth.length === 0) continue;
    test(`allocation-diff refused: ${label}: revert checks (${teeth.map((x) => x[0]).join(', ')}) each fail the row`, { skip }, (t) => {
        const dir = mkdtempSync(join(tmpdir(), 'ad-t-'));
        try {
            for (const [n, edits, nonRoot] of teeth) {
                if (nonRoot && ROOTUSER) { t.diagnostic(`teeth ${n}: skipped (root reads a mode 000 file)`); continue; }
                const p = variant(dir, n, edits);   // outside throws: a bad anchor is a row error, never a kill
                assert.throws(() => fn(p), (e) => { t.diagnostic(`teeth ${n}: ${e.message.split('\n')[0]}`); return e instanceof assert.AssertionError; }, `teeth ${n}`);
            }
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// --- B2h mutant (A15 TASK 3h): the root script with the MD-33 guard line deleted (one line fewer) must turn the 0300
// row red: it gets past the refusal and spawns node (A15, before MD-50: exit 2 after the runs, run.1.txt blanked; since
// G5 B1 the rig's fake prints no --v8-options list, so it exits 2 after the --version and --v8-options spawns). Non-root
// only.
test('allocation-diff B2h mutant: the root script minus the MD-33 guard line (line count -1) turns the raw/ 0300 row red (spawns > 0, no "is not readable")', { skip: skip || (ROOTUSER ? 'euid 0 reads a 0300 dir: the guard never fires' : false) }, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'ad-b2h-'));
    try {
        const p = variant(dir, 'B2h-guard-removed', [[RAWGUARD, '']]);
        const mt = readFileSync(p, 'utf8');
        assert.equal(SRC.split('\n').length - mt.split('\n').length, 1, 'the B2h mutant removes exactly one line');
        assert.equal(count(mt, 'is not readable"'), 0);
        assert.throws(() => withRig((g) => raw0300(g, p)), (e) => { t.diagnostic(`B2h: ${e.message.split('\n')[0]}`); return e instanceof assert.AssertionError; });
        withRig((g) => {
            const o = setup0300(g);
            const r = g.run(p, ['--node', g.node, '--runs', '2', '--out', o, '--zero', g.z]);
            t.diagnostic(`B2h direct: exit ${r.status}, ${r.argv.length} spawn(s), ${r.mk.length} mktemp`);
            assert.ok(r.argv.length > 0, `B2h: no node spawn\n${r.out}`);
            assert.doesNotMatch(r.stderr, /is not readable/);
            assert.ok(r.status !== 2 || r.stderr !== `allocation-diff: ${RAWMSG(o)}\nVERDICT NO-VERDICT\n`, r.out);
        });
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- anchors: every edit this file makes (mutants, wiring, Y7, -h and refusal teeth) matches EXACTLY once in the script
test('allocation-diff anchors: every mutant / wiring / Y7 / teeth anchor matches exactly once in allocation-diff.sh', () => {
    const all = [...MUTANTS.map((m) => [m[0], m[3]]), ...EW, Y7, ...HELP_TEETH, ...RF.flatMap((r) => r[2])];
    assert.ok(all.length >= MUTANTS.length + 20);
    for (const [name, edits] of all) {
        for (const [from, to] of edits) {
            assert.notEqual(from, to, `${name}: a no-op edit`);
            const n = count(SRC, from);
            assert.equal(n, 1, `${name}: anchor matched ${n} times: ${JSON.stringify(from).slice(0, 120)}`);
        }
    }
});
