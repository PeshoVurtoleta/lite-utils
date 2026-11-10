// test/deopt-diff-boundary.test.mjs -- ../deopt-diff.sh driver mode from the OUTSIDE: A5 retention, A3 boundary rows
// and A4 parity that test/deopt-diff.test.mjs and the script's own --self-test do not pin.
// ORACLE: .handoff/PLAN-phase3-g1.md ASSERTIONS A3-A5 (and the -h text where A3 defers to it), never what the script
// printed. TIER: DETERMINISTIC (a fake node written in a temp dir; no V8 spawn). Every row names its teeth: a mutant
// (one exact-once edit on a copy of the script) whose run must turn the same assertion red, checked in a sibling row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync, existsSync, symlinkSync, statSync,
    copyFileSync, realpathSync, rmdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capSync, armCap, noTimeout } from './spawn-cap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(ROOT, 'deopt-diff.sh');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const ENV = { ...process.env };
// FILLERS A6.4, as test/deopt-diff.test.mjs:36-37; NODE_V8_COVERAGE = undefined, not a delete (node re-inserts a missing key)
for (const k of ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];
ENV.NODE_V8_COVERAGE = undefined;
const TRACE = '--trace-deopt-verbose --trace-opt --no-concurrent-recompilation';

// Canned node v26.8.2 lines (p3-probe trace-deopt.txt, fn = add; the same two lines the self-test uses).
const E9 = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const D10 = '[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>, 0x140083075c49 <Code TURBOFAN_JS>, opt id 2, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f6425b4]';

function tmp(p) { return mkdtempSync(join(tmpdir(), p)); }
function rmAll(...ps) { for (const p of ps) if (p) rmSync(p, { recursive: true, force: true }); }

// A copy of the script with exact-once edits (an anchor that does not match exactly once invalidates the row).
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

// A logging mktemp shim first on PATH. macOS /usr/bin/mktemp ignores TMPDIR when called bare, so a private
// TMPDIR cannot see a leaked bare `mktemp -d`; the shim logs "args<TAB>created path" and execs the real one.
// The shim only sees a mktemp found through PATH (an absolute /usr/bin/mktemp or `command -p mktemp` call would bypass it).
function mktempShim(dir) {
    const real = capSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8' }, 30000, 'command -v mktemp').stdout.trim();
    assert.ok(real, 'no real mktemp on PATH');
    const bin = join(dir, 'shim-bin');
    mkdirSync(bin);
    const log = join(dir, 'mktemp.log');
    writeFileSync(log, '');
    writeFileSync(join(bin, 'mktemp'), `#!/bin/bash\np=$('${real}' "$@") || exit $?\nprintf '%s\\t%s\\n' "$*" "$p" >>'${log}'\nprintf '%s\\n' "$p"\n`);
    chmodSync(join(bin, 'mktemp'), 0o755);
    return { real, env: { PATH: bin + ':' + process.env.PATH }, paths: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[1]) };
}

// A fake node (bash): logs "<basename of its cwd>|<argv>" per spawn to its OWN dir (never cwd / TMPDIR), exits 7 if
// NODE_OPTIONS reached it, answers --version with v26.8.2 and --v8-options with two flag entries (--allow-natives-syntax
// bool, --max-inlined-bytecode-size int default 460), both exit 0; else cats ./trace.txt of its cwd (the driver's dir)
// and exits with ./rc (or 0). Driver dirs: name -> { trace, rc }.
function rig(dir, drivers) {
    const fk = join(dir, 'fk');
    mkdirSync(fk);
    writeFileSync(join(fk, 'node'), [`#!${process.env.BASH || '/bin/bash'}`, 'd=$(dirname "$0")',
        'printf "%s|%s\\n" "$(basename "$PWD")" "$*" >>"$d/log"',
        'if [ -n "${NODE_OPTIONS+x}" ]; then echo "NODE_OPTIONS leaked"; exit 7; fi',
        'case "$1" in --version) echo v26.8.2; exit 0 ;; --v8-options) echo "  --allow-natives-syntax (allow natives syntax)"; echo "        type: bool  default: --no-allow-natives-syntax"; echo "  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)"; echo "        type: int  default: --max-inlined-bytecode-size=460"; exit 0 ;; esac',
        'if [ -f ./trace.txt ]; then cat ./trace.txt; fi', 'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi', 'exit 0', ''].join('\n'));
    chmodSync(join(fk, 'node'), 0o755);
    writeFileSync(join(fk, 'log'), '');
    const drv = {};
    for (const [name, { trace, rc }] of Object.entries(drivers)) {
        mkdirSync(join(dir, name));
        writeFileSync(join(dir, name, 'driver.js'), '');
        writeFileSync(join(dir, name, 'trace.txt'), trace);
        if (rc !== undefined) writeFileSync(join(dir, name, 'rc'), String(rc));
        drv[name] = join(dir, name, 'driver.js');
    }
    const cwd = join(dir, 'cwd');
    mkdirSync(cwd);
    return {
        node: join(fk, 'node'), drv, cwd,
        run(script, args, env = {}) {
            writeFileSync(join(fk, 'log'), '');
            const r = capSync('bash', [script, '--node', join(fk, 'node'), ...args], { encoding: 'utf8', cwd, env: { ...ENV, ...env } }, 120000, basename(script));
            const out = r.stdout + r.stderr;
            const log = readFileSync(join(fk, 'log'), 'utf8').split('\n').filter(Boolean);
            return { status: r.status, out, lines: out.split('\n'), log, spawns: log.length, verdicts: out.split('\n').filter((l) => l.startsWith('VERDICT ')) };
        },
    };
}
const STD = {
    monoA: { trace: E9 + '\n' }, monoB: { trace: E9 + '\n' }, deop: { trace: E9 + '\n' + D10 + '\n' }, rc3: { trace: E9 + '\n', rc: 3 },
};

// =====================================================================================================================
// A5 retention: 3 cycles of SAME, DIFF and NO-VERDICT without --out; cwd and a private TMPDIR hold 0 entries afterwards,
// the driver dirs are unchanged, every run spawns 2 + 2 x 3 = 8 times. run_side's driver output goes to ONE temp file per
// run (b61 G2 T2.1): the mktemp shim logs exactly 9 x 6 = 54 paths, each $TMPDIR/deopt-diff.XXXXXX, and none is live.
// =====================================================================================================================
const CYCLE = [
    // [label, before, after, exit, VERDICT, own line]
    ['SAME', 'monoA', 'monoB', 0, 'VERDICT SAME', '  add: SAME -- identical deopt multiset (before 0 | after 0)'],
    ['DIFF', 'monoA', 'deop', 1, 'VERDICT DIFF', '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)'],
    ['NO-VERDICT', 'rc3', 'monoB', 2, 'VERDICT NO-VERDICT', '  add: NO-VERDICT -- before: driver exited 3 in run 1'],
];
function cycles(script) {
    const dir = tmp('dd-a5-');
    const td = tmp('dd-a5-tmpdir-');
    const sh = mktempShim(dir);
    const runs = [];
    try {
        const g = rig(dir, STD);
        const snap = () => Object.keys(STD).map((n) => n + ':' + readdirSync(join(dir, n)).sort().join(',')).join(' ');
        const before = snap();
        for (let c = 0; c < 3; c++) {
            for (const [label, b, a] of CYCLE) {
                const r = g.run(script, ['--fn', 'add', g.drv[b], g.drv[a]], { TMPDIR: td, ...sh.env });
                runs.push({ label, ...r });
            }
        }
        const paths = sh.paths();
        return {
            runs, cwd: readdirSync(g.cwd), tmpdir: readdirSync(td), td, shim: paths, live: paths.filter((p) => existsSync(p)),
            drvSame: snap() === before, real: sh.real,
        };
    } finally { for (const p of sh.paths()) rmAll(p); rmAll(dir, td); }
}
function assertCycles(c) {
    assert.equal(c.runs.length, 9);
    c.runs.forEach((r, i) => {
        const [label, , , exit, vline, own] = CYCLE[i % 3];
        assert.equal(r.status, exit, `${label} run ${i}: ${r.out}`);
        assert.deepEqual(r.verdicts, [vline], r.out);
        assert.ok(r.lines.includes(own), `${label} run ${i}: missing "${own}"\n${r.out}`);
        assert.equal(r.spawns, 8, `${label} run ${i}: --version + --v8-options + 2 x 3 runs\n${r.log.join('\n')}`);
    });
    assert.deepEqual(c.cwd, [], 'cwd holds entries after 9 runs without --out');
    assert.deepEqual(c.tmpdir, [], 'the private TMPDIR holds entries');
    // the live leg first: a leaked path (any mktemp, run temp file or not) reds the row by name
    assert.deepEqual(c.live, [], `a logged mktemp path survived: ${c.live.join(' ')}`);
    assert.equal(c.shim.length, 54, `driver mode: 9 runs x 2 sides x 3 driver runs = 54 run temp files\n${c.shim.join('\n')}`);
    const tre = new RegExp('^' + c.td.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/deopt-diff\\.[A-Za-z0-9]{6}$');
    for (const p of c.shim) assert.match(p, tre, 'a run temp file outside $TMPDIR/deopt-diff.XXXXXX');
    assert.ok(c.drvSame, 'a driver dir changed');
}
test('A5: 3 cycles x SAME / DIFF / NO-VERDICT without --out -> exits 0/1/2, 8 spawns each; cwd and TMPDIR empty, 54 logged run temp files, none live', { skip }, () => {
    assertCycles(cycles(SCRIPT));
});
// teeth 1: tee keeps the raw output in cwd when --out is absent (no raw file outlives a run without --out)
test('A5 teeth: mutant tee-default-to-cwd turns the cycle row red (cwd holds run.<k>.txt; verdicts unchanged)', { skip }, () => {
    const dir = tmp('dd-a5m-');
    try {
        const c = cycles(variant(dir, 'tee_cwd', [['tee "${3:-/dev/null}" |', 'tee "${3:-run.$k.txt}" |']]));
        assert.throws(() => assertCycles(c), /cwd holds entries/);
        assert.deepEqual(c.cwd.sort(), ['run.1.txt', 'run.2.txt', 'run.3.txt']);
        c.runs.forEach((r, i) => assert.equal(r.status, CYCLE[i % 3][3]));   // red for retention only
    } finally { rmAll(dir); }
});
// teeth 2: a bare `mktemp -d` in driver mode that is never removed; the shim logs it and it is still live (macOS: the
// TMPDIR does not see it). The 54 run temp files are logged too, but removed: only the 9 leaked dirs are live.
test('A5 teeth: mutant bare-mktemp-leak turns the cycle row red through a live logged path (and, where mktemp honours TMPDIR, the TMPDIR)', { skip }, () => {
    const dir = tmp('dd-a5m-');
    try {
        const c = cycles(variant(dir, 'mktemp_leak', [['RUN_RC=0; RUN_TX=""\n', 'mktemp -d >/dev/null\nRUN_RC=0; RUN_TX=""\n']]));
        // probe: does the resolved real mktemp honour TMPDIR for a bare `mktemp -d`? (GNU / uutils yes, BSD no)
        const pd = tmp('dd-a5-probe-');
        let honours, got = '';
        try {
            const pr = capSync(c.real, ['-d'], { encoding: 'utf8', env: { ...ENV, TMPDIR: pd } }, 30000, 'mktemp -d probe');
            got = pr.status === 0 ? pr.stdout.trim() : '';
            honours = got !== '' && (got.startsWith(pd + '/') || got.startsWith(realpathSync(pd) + '/'));
        } finally { rmAll(pd); if (got && !honours) rmdirSync(got); }   // a TMPDIR-ignoring mktemp (BSD) made its dir elsewhere
        if (honours) {
            // the TMPDIR check in assertCycles fires first: exactly the 9 leaked dirs, named as the shim logged them
            assert.throws(() => assertCycles(c), /the private TMPDIR holds entries/);
            assert.equal(c.tmpdir.length, 9);
            assert.deepEqual(c.tmpdir.slice().sort(), c.live.map((p) => basename(p)).sort(), 'the TMPDIR entries are the leaked dirs');
            assert.throws(() => assertCycles({ ...c, tmpdir: [] }), /a logged mktemp path survived/, 'the live leg is red on its own');
        } else {
            assert.throws(() => assertCycles(c), /a logged mktemp path survived/);
            assert.deepEqual(c.tmpdir, [], 'a mktemp that ignores TMPDIR (macOS BSD) leaves the TMPDIR empty');
        }
        assert.equal(c.shim.length, 54 + 9, '54 run temp files + the 9 leaked dirs');
        assert.equal(c.live.length, 9, 'every leaked dir was still on disk when the row read it');
        for (const p of c.live) assert.doesNotMatch(basename(p), /^deopt-diff\./, 'only the bare mktemp -d dirs are live');
    } finally { rmAll(dir); }
});

// A5 self-test: run under the shim with a private TMPDIR and cwd; >= 1 logged dir (else the row is blind), every
// logged path gone afterwards. Optional SIGTERM once the first dir is logged (the EXIT-trap path).
function selfTestRun(script, { term = false } = {}) {
    const dir = tmp('dd-st-');
    const td = tmp('dd-st-tmpdir-');
    const cwd = join(dir, 'cwd');
    mkdirSync(cwd);
    const sh = mktempShim(dir);
    return new Promise((res, rej) => {
        const c = spawn('bash', [script, '--self-test'], { cwd, env: { ...ENV, TMPDIR: td, ...sh.env } });
        let out = '';
        c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
        // cap 240000 (was 120000): CI run 42056284029, job 127345428628 (macOS node 22): a row of this runner took 67.8 s
        const h = armCap(c, 240000, 'SIGKILL');
        let poll = null;
        if (term) {
            // SIGTERM once the shim logged the self-test's dir and the self-test printed >= 5 check lines (so it is
            // mid-run); bash runs the EXIT trap after the foreground child ends
            poll = setInterval(() => { if (sh.paths().length > 0 && (out.match(/^ok /gm) || []).length >= 5) { clearInterval(poll); c.kill('SIGTERM'); } }, 20);
        }
        c.on('close', (status, signal) => {
            h.clear(); if (poll) clearInterval(poll);
            const paths = sh.paths();
            const r = { status, signal, out, shim: paths, live: paths.filter((p) => existsSync(p)), cwd: readdirSync(cwd), tmpdir: readdirSync(td) };
            for (const p of paths) rmAll(p);
            rmAll(dir, td);
            // a run the cap killed rejects by name before any caller reads its status
            try { noTimeout({ status, signal, stdout: out, stderr: '', timedOut: h.timedOut, cap: h.cap }, `${basename(script)} --self-test`); } catch (e) { rej(e); return; }
            res(r);
        });
        c.on('error', (e) => { h.clear(); rej(e); });
    });
}
function assertNoDirs(r) {
    assert.ok(r.shim.length >= 1, 'the shim logged no mktemp: the row is blind');
    assert.deepEqual(r.live, [], `a logged mktemp path survived: ${r.live.join(' ')}`);
    assert.deepEqual(r.cwd, [], 'cwd holds entries');
    assert.deepEqual(r.tmpdir, [], 'TMPDIR holds entries');
}
test('A5: --self-test under a logging mktemp shim -> all checks ok, every logged dir gone, cwd and TMPDIR empty', { skip }, async () => {
    const r = await selfTestRun(SCRIPT);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^self-test: \d+ check\(s\) ok$/m);
    assertNoDirs(r);
});
test('A5 teeth: mutant final-rm-dropped -> the self-test still passes (every check ok) but its logged dir survives (red)', { skip }, async () => {
    const dir = tmp('dd-stm-');
    try {
        const r = await selfTestRun(variant(dir, 'no_final_rm', [['  rm -rf "$d"\n  if [[ -n "$old" ]]; then trap', '  if [[ -n "$old" ]]; then trap']]));
        assert.equal(r.status, 0, r.out);
        assert.match(r.out, /^self-test: \d+ check\(s\) ok$/m);   // no check sees it: only the retention row does
        assert.throws(() => assertNoDirs(r), /a logged mktemp path survived/);
    } finally { rmAll(dir); }
});
test('A5: --self-test killed by SIGTERM mid-run -> its EXIT trap removes every logged dir', { skip }, async () => {
    const r = await selfTestRun(SCRIPT, { term: true });
    assert.doesNotMatch(r.out, /^self-test: /m, 'the self-test finished before the SIGTERM');
    assert.equal(r.signal === 'SIGTERM' || r.status === 143 || r.status === 2, true, `status ${r.status} signal ${r.signal}`);
    assertNoDirs(r);
});
test('A5 teeth: mutant trap-without-rm -> a SIGTERM mid self-test leaves the logged dir (red)', { skip }, async () => {
    const dir = tmp('dd-stm-');
    try {
        const r = await selfTestRun(variant(dir, 'trap_no_rm', [['trap "st_rc=\\$?; rm -rf \\"\\$ST_D\\"; set +e;', 'trap "st_rc=\\$?; set +e;']]), { term: true });
        assert.doesNotMatch(r.out, /^self-test: /m, 'the self-test finished before the SIGTERM');
        assert.throws(() => assertNoDirs(r), /a logged mktemp path survived/);
    } finally { rmAll(dir); }
});

// (every teeth row builds its mutant OUTSIDE assert.throws: an anchor that does not match exactly once is an error of the
// row, never a kill)
// =====================================================================================================================
// A3 boundary: --runs edges (spawns 2 + 2R, sides alternating before / after per k, argv and cwd per run)
// =====================================================================================================================
function runsRow(script, runs) {
    const dir = tmp('dd-runs-');
    try {
        const g = rig(dir, STD);
        const r = g.run(script, ['--runs', runs, '--v8-flags', '--allow-natives-syntax', '--fn', 'add', g.drv.monoA, g.drv.deop]);
        return r;
    } finally { rmAll(dir); }
}
function assertRuns(r, R) {
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(r.verdicts, ['VERDICT DIFF'], r.out);
    assert.equal(r.spawns, 2 + 2 * R, r.log.join('\n'));
    const want = ['cwd|--version', 'cwd|--v8-options'];
    for (let k = 0; k < R; k++) want.push(`monoA|--allow-natives-syntax ${TRACE} ./driver.js`, `deop|--allow-natives-syntax ${TRACE} ./driver.js`);
    assert.deepEqual(r.log, want);
    assert.ok(r.lines.includes(`mode    diff  runs ${R}  v8 flags --allow-natives-syntax ${TRACE}`), r.out);
}
// [value, R, teeth mutant edits, flip(r): the field the mutant flips] -- each mutant must turn its row red (sibling row)
const REFUSED = (v) => (r) => { assert.equal(r.status, 2, r.out); assert.equal(r.spawns, 0); assert.ok(r.out.includes(`deopt-diff: --runs must be an integer in [2, 20] (null control), got '${v}'`), r.out); };
// bash 3.2: the $((08)) error abandons the whole `[[ ]] && RUNS=... || die` list (die included) and the script goes on with
// RUNS=08 (seq reads it as 8): exit and spawns stay right, only the mode line shows the unnormalized value
const UNNORMALIZED = (v, R) => (r) => {
    assert.equal(r.status, 1, r.out); assert.equal(r.spawns, 2 + 2 * R);
    assert.ok(r.lines.includes(`mode    diff  runs ${v}  v8 flags --allow-natives-syntax ${TRACE}`), r.out);
};
const RUNS_OK = [
    ['2', 2, [['[[ $RUNS -ge 2 && $RUNS -le 20 ]]', '[[ $RUNS -ge 3 && $RUNS -le 20 ]]']], REFUSED('2')],
    ['20', 20, [['[[ $RUNS -ge 2 && $RUNS -le 20 ]]', '[[ $RUNS -ge 2 && $RUNS -le 19 ]]']], REFUSED('20')],
    // adversarial: a leading zero with 8 / 9 is not octal (bash $((08)) is an error without the 10# base)
    ['08', 8, [['RUNS=$((10#$RUNS))', 'RUNS=$(($RUNS))']], UNNORMALIZED('08', 8)],
    ['09', 9, [['RUNS=$((10#$RUNS))', 'RUNS=$(($RUNS))']], UNNORMALIZED('09', 9)],
];
for (const [v, R, teeth, flip] of RUNS_OK) {
    test(`A3: --runs ${v} accepted -> exit 1 DIFF, ${2 + 2 * R} spawns, before / after alternating, exact argv`, { skip }, () => {
        assertRuns(runsRow(SCRIPT, v), R);
    });
    test(`A3 teeth: --runs ${v} row is red on a boundary mutant`, { skip }, () => {
        const dir = tmp('dd-runsm-');
        try {
            const r = runsRow(variant(dir, 'm', teeth), v);
            flip(r);   // the designed field flipped
            assert.throws(() => assertRuns(r, R), assert.AssertionError);
        } finally { rmAll(dir); }
    });
}
test('A3 teeth: the alternation row is red on a mutant that runs AFTER before BEFORE in each k', { skip }, () => {
    const dir = tmp('dd-runsm-');
    try {
        const p = variant(dir, 'swap', [[
            '  run_side "$DRV_B_DIR" "$DRV_B_BASE" "${OUT:+$OUT/raw/before/run.$k.txt}"; RCB+=("$RUN_RC"); TXB+=("$RUN_TX")\n' +
            '  run_side "$DRV_A_DIR" "$DRV_A_BASE" "${OUT:+$OUT/raw/after/run.$k.txt}"; RCA+=("$RUN_RC"); TXA+=("$RUN_TX")\n',
            '  run_side "$DRV_A_DIR" "$DRV_A_BASE" "${OUT:+$OUT/raw/after/run.$k.txt}"; RCA+=("$RUN_RC"); TXA+=("$RUN_TX")\n' +
            '  run_side "$DRV_B_DIR" "$DRV_B_BASE" "${OUT:+$OUT/raw/before/run.$k.txt}"; RCB+=("$RUN_RC"); TXB+=("$RUN_TX")\n']]);
        const r = runsRow(p, '2');
        assert.equal(r.status, 1);   // same verdict and spawn count: only the order row sees it
        assert.equal(r.spawns, 6);
        assert.throws(() => assertRuns(r, 2), assert.AssertionError);
    } finally { rmAll(dir); }
});

// --runs refusals: exit 2, 0 spawns, the die line with the value echoed. Integers at the 2^30 / 2^31 / 2^32 / 2^53
// edges, signs, -0, NaN, decimals, blanks, a trailing newline, a non-ASCII digit.
const RUNS_BAD = ['0', '1', '-1', '00', '01', '21', '99', '020', '100', '1073741824', '2147483647', '2147483648',
    '4294967295', '4294967296', '9007199254740991', '9007199254740992', 'NaN', '-0', '+3', '3.0', '3e0', '0x3', ' 3', '3 ',
    '3\n', '\u0663'];
function runsBad(script, v) {
    const dir = tmp('dd-rb-');
    try { return rig(dir, STD).run(script, ['--runs=' + v, '--fn', 'add', join(dir, 'monoA', 'driver.js'), join(dir, 'monoB', 'driver.js')]); }
    finally { rmAll(dir); }
}
function assertRefused(r, line) {
    assert.equal(r.status, 2, r.out);
    assert.equal(r.spawns, 0, r.log.join('\n'));
    assert.ok(r.out.includes(line), `missing "${line}"\n${r.out}`);
    assert.doesNotMatch(r.out, /^VERDICT (SAME|DIFF)$/m);
}
// 00 / 01 pass the 2-digit regex and are echoed AFTER the 10# normalization (got '0' / '1': a QA finding, cosmetic), so
// they pin the reason only; every other value (020 included: the regex refuses it first) pins the value as given
const runsLine = (v) => (/^0[0-9]$/.test(v) ? "deopt-diff: --runs must be an integer in [2, 20] (null control), got '"
    : `deopt-diff: --runs must be an integer in [2, 20] (null control), got '${v}'`);
for (const v of RUNS_BAD) {
    test(`A3: --runs=${JSON.stringify(v)} refused -> exit 2, 0 spawns, its own reason`, { skip }, () => {
        // the rig's driver dirs exist (monoA / monoB): only --runs can refuse
        assertRefused(runsBad(SCRIPT, v), runsLine(v));
    });
}
// teeth: a 3-digit regex lets 020 through; a refusal turned into a silent default (RUNS=2, bounded: never a 2^31-run
// loop) lets every row through
test('A3 teeth: --runs refusal rows are red on mutants (3-digit regex: 020; refusal -> silent RUNS=2: every value)', { skip }, () => {
    const dir = tmp('dd-rbm-');
    try {
        const m3 = variant(dir, 'm3', [['[[ "$RUNS" =~ ^[0-9]{1,2}$ ]]', '[[ "$RUNS" =~ ^[0-9]{1,3}$ ]]']]);
        for (const v of ['020']) { const r = runsBad(m3, v); assert.throws(() => assertRefused(r, runsLine(v)), assert.AssertionError); }
        const off = variant(dir, 'off', [['  || die "--runs must be an integer in [2, 20] (null control), got \'$RUNS\'"', '  || RUNS=2']]);
        for (const v of RUNS_BAD) { const r = runsBad(off, v); assert.throws(() => assertRefused(r, runsLine(v)), assert.AssertionError, `--runs=${JSON.stringify(v)} survived the disabled check`); }
    } finally { rmAll(dir); }
});

// Other refusals no self-test row pins: an option given twice, an empty / missing value, --fn edges. 0 spawns each.
const MORE_BAD = [
    // [label, args (D1 / D2 are placeholders), own die line, teeth mutant edits]
    ['--runs given twice', ['--runs', '3', '--runs', '3', '--fn', 'add', 'D1', 'D2'], '--runs given twice (give one comma list)',
        [['[[ "$GOTOPT" != *" $a "* ]] || die', 'true || die']]],
    ['--fn given twice', ['--fn', 'add', '--fn', 'get', 'D1', 'D2'], '--fn given twice (give one comma list)',
        [['[[ "$GOTOPT" != *" $a "* ]] || die', 'true || die']]],
    ['--runs= (empty)', ['--runs=', '--fn', 'add', 'D1', 'D2'], '--runs needs a non-empty value',
        [['[[ -n "$v" ]] || die "$a needs a non-empty value"', 'true']]],
    ['--fn= (empty)', ['--fn=', 'D1', 'D2'], '--fn needs a non-empty value', [['[[ -n "$v" ]] || die "$a needs a non-empty value"', 'true']]],
    ['--fn ,add (stray comma)', ['--fn', ',add', 'D1', 'D2'], '--fn: empty entry (stray comma)',
        [['[[ "$FNLIST" != ,* && ', '[[ ']]],
    ["--fn 'add ' (trailing blank)", ['--fn', 'add ', 'D1', 'D2'], "got 'add '",
        [["FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'", "FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$]*)?$'"]]],
    ["--fn 'get value x' (three words)", ['--fn', 'get value x', 'D1', 'D2'], "got 'get value x'",
        [["FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'", "FN_RE='^[A-Za-z_$][A-Za-z0-9_$ ]*$'"]]],
    ['--fn 1add (leading digit)', ['--fn', '1add', 'D1', 'D2'], "got '1add'",
        [["FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*(", "FN_RE='^[A-Za-z0-9_$][A-Za-z0-9_$]*("]]],
    ['--fn with a newline', ['--fn', 'add\nadd', 'D1', 'D2'], '--fn / --v8-flags / --out / --node: a newline is not allowed',
        [['[[ "$FNLIST$V8FLAGS$OUT$NODE_BIN" != *$\'\\n\'* ]] || die', 'true || die']]],
    ['--v8-flags of blanks only', ['--fn', 'add', '--v8-flags', '   ', 'D1', 'D2'], '--v8-flags needs at least one flag, got only blanks',
        [['[[ -z "$V8FLAGS" || ${#V8_EXTRA[@]} -gt 0 ]] || die', 'true || die']]],
    ['--v8-flags --no_concurrent_recompilation (underscores)', ['--fn', 'add', '--v8-flags', '--no_concurrent_recompilation', 'D1', 'D2'],
        '--v8-flags must not set --no_concurrent_recompilation: the script sets', [['  g="${f//_/-}"', '  g="$f"']]],
];
function moreBad(script, args) {
    const dir = tmp('dd-mb-');
    try {
        const g = rig(dir, STD);
        return g.run(script, args.map((a) => (a === 'D1' ? g.drv.monoA : a === 'D2' ? g.drv.monoB : a)));
    } finally { rmAll(dir); }
}
for (const [label, args, line, teeth] of MORE_BAD) {
    test(`A3: ${label} refused -> exit 2, 0 spawns, '${line}'`, { skip }, () => {
        assertRefused(moreBad(SCRIPT, args), line);
    });
    test(`A3 teeth: ${label} row is red on its mutant`, { skip }, () => {
        const dir = tmp('dd-mbm-');
        try { const p = variant(dir, 'm', teeth); const r = moreBad(p, args); assert.throws(() => assertRefused(r, line), assert.AssertionError); } finally { rmAll(dir); }
    });
}

// =====================================================================================================================
// A3 --out (-h, C-13): DIR/raw must be absent or an empty, readable and writable directory that is not a symlink;
// DIR/report.txt must not be a symlink or a file with another hard link. A refusal spawns nothing and writes nothing
// (the OUT tree is unchanged)
// =====================================================================================================================
function tree(p) {
    if (!existsSync(p)) return 'absent';
    const s = statSync(p);
    if (!s.isDirectory()) return 'file:' + readFileSync(p, 'utf8');
    return '{' + readdirSync(p).sort().map((n) => n + '=' + tree(join(p, n))).join(',') + '}';
}
const OUT_BAD = [
    // [label, setup(out), own die line, teeth edits]
    ['raw/ holds a file', (o) => { mkdirSync(join(o, 'raw'), { recursive: true }); writeFileSync(join(o, 'raw', 'old.txt'), 'x'); },
        'is not empty (give a new or empty DIR)', [['[[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die', 'true || die']]],
    ['raw/ holds only a dotfile', (o) => { mkdirSync(join(o, 'raw'), { recursive: true }); writeFileSync(join(o, 'raw', '.keep'), ''); },
        'is not empty (give a new or empty DIR)', [['[[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]]', '[[ -z "$(ls "$OUT/raw" 2>/dev/null)" ]]']]],
    ['raw/ holds an empty raw/before/', (o) => { mkdirSync(join(o, 'raw', 'before'), { recursive: true }); },
        'is not empty (give a new or empty DIR)', [['[[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die', 'true || die']]],
    ['raw is a symlink to a non-empty dir', (o) => {
        mkdirSync(o, { recursive: true }); mkdirSync(join(o, 'elsewhere')); writeFileSync(join(o, 'elsewhere', 'f'), 'y'); symlinkSync('elsewhere', join(o, 'raw'));
    }, 'is a symlink (refused: the writes would follow it)', [['[[ ! -L "$OUT/raw" ]] || die', 'true || die']]],
    // adversarial: a DANGLING raw symlink passes `! -e` (it follows the link). On macOS `ls -A` on a dangling symlink
    // lists the link name, so without MD-36 a dangling raw/ reads "is not empty"; MD-36, placed before the `ls -A`
    // test, is what makes it "is a symlink"
    ['raw is a dangling symlink', (o) => { mkdirSync(o, { recursive: true }); symlinkSync('nowhere', join(o, 'raw')); },
        'is a symlink (refused: the writes would follow it)', [['[[ ! -L "$OUT/raw" ]] || die', 'true || die']],
        // flip: the MD-36-less mutant still refuses before any spawn, with the old "is not empty" line
        (r) => { assert.equal(r.spawns, 0, r.log.join('\n')); assert.ok(r.out.includes('is not empty (give a new or empty DIR)'), r.out); }],
    ['OUT is a regular file', (o) => { writeFileSync(o, 'keep'); }, 'exists and is not a directory',
        [['[[ ! -e "$OUT" || -d "$OUT" ]] || die', 'true || die']]],
    ['OUT/raw is a regular file', (o) => { mkdirSync(o, { recursive: true }); writeFileSync(join(o, 'raw'), 'keep'); }, '/raw exists and is not a directory',
        [['[[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die', 'true || die']]],
];
function outRow(script, setup) {
    const dir = tmp('dd-out-');
    try {
        const g = rig(dir, STD);
        const o = join(dir, 'o');
        setup(o);
        const t0 = tree(o);
        const r = g.run(script, ['--out', o, '--fn', 'add', g.drv.monoA, g.drv.deop]);
        return { ...r, same: tree(o) === t0, t0, t1: tree(o) };
    } finally { rmAll(dir); }
}
function assertOutRefused(r, line) {
    assertRefused(r, line);
    assert.ok(r.same, `the OUT tree changed: ${r.t0} -> ${r.t1}`);
}
for (const [label, setup, line, teeth, flip] of OUT_BAD) {
    test(`A3: --out where ${label} -> refused, exit 2, 0 spawns, OUT unchanged, '${line}'`, { skip }, () => {
        assertOutRefused(outRow(SCRIPT, setup), line);
    });
    test(`A3 teeth: --out where ${label} is red on its mutant`, { skip }, () => {
        const dir = tmp('dd-outm-');
        try {
            const r = outRow(variant(dir, 'm', teeth), setup);
            if (flip) flip(r);   // the designed field flipped (rows without one: any red)
            assert.throws(() => assertOutRefused(r, line), assert.AssertionError);
        } finally { rmAll(dir); }
    });
}
// accepted edge: an existing EMPTY raw/ ("absent or empty") -> report.txt + 3 + 3 raw files
const outEmptyRaw = (o) => { mkdirSync(join(o, 'raw'), { recursive: true }); };
function assertOutAccepted(r) {
    assert.equal(r.status, 1, r.out);
    assert.equal(r.spawns, 8);
    assert.match(r.t1, /^\{raw=\{after=\{run\.1\.txt=file:.*run\.3\.txt=file:[^}]*\},before=\{run\.1\.txt=file:.*run\.3\.txt=file:[^}]*\}\},report\.txt=file:/s);
    assert.match(r.t1, /report\.txt=file:[^]*VERDICT DIFF\n\}$/);
}
test('A3: --out with an existing EMPTY raw/ is accepted -> exit 1, 8 spawns, 3 + 3 raw files and report.txt ending VERDICT DIFF', { skip }, () => {
    assertOutAccepted(outRow(SCRIPT, outEmptyRaw));
});
test('A3 teeth: the empty-raw/ row is red on a mutant that refuses any existing raw/', { skip }, () => {
    const dir = tmp('dd-outm-');
    try {
        const p = variant(dir, 'm', [['[[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die', '[[ ! -e "$OUT/raw" ]] || die']]);
        const r = outRow(p, outEmptyRaw);
        assert.throws(() => assertOutAccepted(r), assert.AssertionError);
    } finally { rmAll(dir); }
});
// =====================================================================================================================
// P3G4 D9: --self-test / --fixtures refusals (-h; P3G4 G4 plan D9). ORACLE: the plan's refusal texts, never the
// script's print. Each row: exit 2, the exact die line, 0 spawns -- the fake --node logs nothing and a PATH `node` shim
// (logs, exits 97) logs nothing. Each row has its own teeth mutant (built outside assert.throws) whose designed field
// flips, and a revert check: on the unmutated run BOTH halves of the kill assertion must throw (the designed field is
// not flipped, and the row is green), so neither half alone can carry the kill.
// =====================================================================================================================
const FIX = join(HERE, 'fixtures', 'deopt-diff', 'node-26.8.2');
const euid0 = typeof process.geteuid === 'function' && process.geteuid() === 0;
// args placeholders: FIX, FAKE (the rig's logging node), D1 / D2 (rig drivers), DIR (from setup(dir) -> { DIR, undo })
function fxRow(script, args, setup) {
    const dir = tmp('dd-fx-');
    let undo = null;
    try {
        const g = rig(dir, STD);
        const pb = join(dir, 'path-bin');
        const plog = join(dir, 'path-node.log');
        mkdirSync(pb);
        writeFileSync(plog, '');
        writeFileSync(join(pb, 'node'), `#!/bin/bash\nprintf '%s\\n' "$*" >>'${plog}'\nexit 97\n`);
        chmodSync(join(pb, 'node'), 0o755);
        const map = { FIX, FAKE: g.node, D1: g.drv.monoA, D2: g.drv.monoB };
        if (setup) { const s = setup(dir); map.DIR = s.DIR; undo = s.undo || null; }
        const env = { ...ENV, PATH: pb + ':' + process.env.PATH };
        delete env.NODE;
        writeFileSync(join(g.node, '..', 'log'), '');
        // cap 240000 (was 120000): CI run 42056284029, job 127345428176 (macOS node 26.8.2): row R-only-pos took 73.1 s.
        // A --self-test row gets 330000 (b68 CI-CAP, LEDGER #115): 3x 102.2 s (K2-gotopt-substring, macOS node 22, run
        // 42885917245), rounded up to 30000 ms; every other row keeps 240000.
        const cap = args.includes('--self-test') ? 330000 : 240000;
        const r = capSync('bash', [script, ...args.map((a) => (Object.hasOwn(map, a) ? map[a] : a))], { encoding: 'utf8', cwd: g.cwd, env }, cap, basename(script));
        const out = r.stdout + r.stderr;
        const fake = readFileSync(join(g.node, '..', 'log'), 'utf8').split('\n').filter(Boolean).length;
        const pnode = readFileSync(plog, 'utf8').split('\n').filter(Boolean).length;
        return { status: r.status, out, lines: out.split('\n'), fake, pnode, DIR: map.DIR };
    } finally { if (undo) undo(); rmAll(dir); }
}
function assertFx(r, line) {
    assert.equal(r.status, 2, r.out);
    assert.equal(r.fake, 0, 'the fake --node was spawned');
    assert.equal(r.pnode, 0, 'a PATH node was spawned');
    assert.ok(r.lines.includes('deopt-diff: ' + line), `missing "deopt-diff: ${line}"\n${r.out}`);
    assert.doesNotMatch(r.out, /^VERDICT (SAME|DIFF)$/m);
    assert.doesNotMatch(r.out, /^self-test: /m);
}
const GOES = () => '--fixtures goes with --self-test';
const ONLY = () => '--self-test takes only --fixtures DIR';
const NOTDIR = (r) => `--fixtures: not a readable directory: ${r.DIR}`;
const M_GOES = [['[[ -z "$FIXTURES" ]] || die "--fixtures goes with --self-test"', 'true || die "--fixtures goes with --self-test"']];
const M_ONLY_GOTOPT = [['[[ ( -z "${GOTOPT// /}" || "$GOTOPT" == "  --fixtures " ) && ', '[[ ']];
const M_ONLY_POS = [[' && ${#POS[@]} -eq 0 ]] || die "--self-test takes only --fixtures DIR"', ' ]] || die "--self-test takes only --fixtures DIR"']];
const M_DIR = [['[[ -d "$FIXTURES" && -r "$FIXTURES" && -x "$FIXTURES" ]] || die', 'true || die']];
const M_NEWLINE = [['[[ "$FIXTURES" != *$\'\\n\'* ]] || die "--fixtures: a newline', 'true || die "--fixtures: a newline']];
const M_K2 = [['"$GOTOPT" == "  --fixtures " )', '"$GOTOPT" == *"--fixtures"* )']];   // a substring GOTOPT match
const M_NO_X = [['-r "$FIXTURES" && -x "$FIXTURES" ]]', '-r "$FIXTURES" ]]']];
const SELF_OK = (r) => { assert.equal(r.status, 0, r.out); assert.match(r.out, /^self-test: \d+ check\(s\) ok$/m); };
const FX_FAILS = (r) => { assert.equal(r.status, 1, r.out); assert.match(r.out, /^FAIL fixture deopt\.txt: missing or not a readable file$/m); };
const FX_ROWS = [
    // [label, args, line(r), setup, teeth name, teeth edits, flip(r): the designed field the mutant flips, skip]
    ['--fixtures FIX in driver mode (--node FAKE --fn add D1 D2)', ['--fixtures', 'FIX', '--node', 'FAKE', '--fn', 'add', 'D1', 'D2'], GOES, null,
        'R-goes-with', M_GOES, (r) => assert.equal(r.fake, 8, r.out)],
    ['--fixtures FIX alone', ['--fixtures', 'FIX'], GOES, null,
        'R-goes-with', M_GOES, (r) => assert.ok(r.lines.includes('deopt-diff: need --fn LIST (see --help)'), r.out)],
    ['--self-test --fn add', ['--self-test', '--fn', 'add'], ONLY, null, 'R-only-gotopt', M_ONLY_GOTOPT, SELF_OK],
    ['--self-test D1', ['--self-test', 'D1'], ONLY, null, 'R-only-pos', M_ONLY_POS, SELF_OK],
    ['--self-test --fixtures <a missing dir>', ['--self-test', '--fixtures', 'DIR'], NOTDIR, (d) => ({ DIR: join(d, 'no-such') }),
        'R-dir', M_DIR, FX_FAILS],
    ['--self-test --fixtures <a regular file>', ['--self-test', '--fixtures', 'DIR'], NOTDIR,
        (d) => { writeFileSync(join(d, 'afile'), 'x'); return { DIR: join(d, 'afile') }; }, 'R-dir', M_DIR, FX_FAILS],
    ['--self-test --fixtures <a DIR with a newline>', ['--self-test', '--fixtures', 'DIR'], () => '--fixtures: a newline is not allowed',
        (d) => ({ DIR: join(d, 'a\nb') }), 'R-newline', M_NEWLINE,
        (r) => assert.ok(r.out.includes('deopt-diff: --fixtures: not a readable directory: '), r.out)],
    // reviewer rows: --fixtures plus another option (kills K2, a substring GOTOPT match), and a mode-0644 dir (r, no x)
    ['--self-test --fixtures FIX --fn add', ['--self-test', '--fixtures', 'FIX', '--fn', 'add'], ONLY, null, 'K2-gotopt-substring', M_K2, SELF_OK],
    ['--self-test --fixtures <a mode-0644 copy of FIX>', ['--self-test', '--fixtures', 'DIR'], NOTDIR, (d) => {
        const c = join(d, 'fx0644');
        mkdirSync(c);
        for (const n of readdirSync(FIX)) copyFileSync(join(FIX, n), join(c, n));
        chmodSync(c, 0o644);
        return { DIR: c, undo: () => chmodSync(c, 0o755) };
    }, 'R-no-x', M_NO_X, (r) => { assert.equal(r.status, 1, r.out); assert.match(r.out, /^FAIL fixture [a-z-]+\.txt: missing or not a readable file$/m); },
        euid0 ? 'euid 0: root reads and searches a mode-0644 directory, the row cannot refuse' : false],
];
for (const [label, args, line, setup, tname, teeth, flip, rskip] of FX_ROWS) {
    const o = { skip: skip || rskip || false };
    test(`D9: ${label} -> exit 2, 0 spawns, '${line({ DIR: '<DIR>' })}'`, o, () => {
        const r = fxRow(SCRIPT, args, setup);
        assertFx(r, line(r));
    });
    // kill = the designed field flipped AND the row's assertion red
    const kill = (r) => { flip(r); assert.throws(() => assertFx(r, line(r)), assert.AssertionError); };
    test(`D9 teeth: ${label} row is red on mutant ${tname}`, o, () => {
        const dir = tmp('dd-fxm-');
        try { const p = variant(dir, 'm', teeth); kill(fxRow(p, args, setup)); } finally { rmAll(dir); }
    });
    test(`D9 teeth ${tname} (${label}): revert check (the unmutated run fails both halves of the kill assertion)`, o, () => {
        const r = fxRow(SCRIPT, args, setup);
        assert.throws(() => kill(r), assert.AssertionError);
        assert.throws(() => flip(r), assert.AssertionError, 'the designed field is flipped with no mutation');
        assert.throws(() => assert.throws(() => assertFx(r, line(r)), assert.AssertionError), assert.AssertionError, 'the row is red with no mutation');
    });
}

// =====================================================================================================================
// A4 parity, re-pinned in U1 (Q-IBD-4 (a), MD-54): U1 is the MD-54 ibd hardening unit, so the root moved on purpose and
// the old 740da13b pin, its bd1f283 history row and the hunk-scoped put-back of every later change are retired. FILLERS
// B1, U2, G5 (b62) and G-XS (b67) moved the root again. The live
// root must equal its .handoff/frozen/fillers-final/ copy byte for byte, sha256/8 pinned. A rung that moves the root bumps
// the literal and the frozen copy together.
// =====================================================================================================================
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const FROZEN = join(ROOT, '.handoff', 'frozen', 'fillers-final');
// bytecode-budget.sh left the Phase 2 freeze in ext-audit (MD-32 (a)); its regression oracle is test/ext-audit.test.mjs
const PARITY = [['inlining-budget-diff.sh', 'cf9d27de']];
function assertParity(live, ref, want) {
    assert.equal(sha8(live), want, 'live sha256/8');
    assert.ok(Buffer.compare(live, ref) === 0, 'live differs from the reference copy');
}
for (const [file, want] of PARITY) {
    const frozen = join(FROZEN, file);
    test(`A4: ${file} sha256/8 ${want} and cmp-equal to .handoff/frozen/fillers-final/${file}`,
        { skip: skip || (existsSync(frozen) ? false : 'frozen copy absent (.handoff/ is gitignored): not checked, never passed') }, () => {
            assertParity(readFileSync(join(ROOT, file)), readFileSync(frozen), want);
        });
    test(`A4 teeth: ${file} parity is red on a one-byte edit of the live bytes`, { skip }, () => {
        const live = readFileSync(join(ROOT, file));
        assertParity(live, live, want);   // control: the unedited bytes pass
        const m = Buffer.from(live); m[m.length - 2] ^= 1;
        assert.throws(() => assertParity(m, live, want), assert.AssertionError);
    });
}
