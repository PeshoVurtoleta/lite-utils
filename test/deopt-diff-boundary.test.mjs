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
for (const k of ['NODE_OPTIONS', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];
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
// A5 retention: 3 cycles of SAME, DIFF and NO-VERDICT without --out; cwd, a private TMPDIR and the mktemp shim log
// hold 0 entries afterwards, the driver dirs are unchanged, every run spawns 2 + 2 x 3 = 8 times.
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
            runs, cwd: readdirSync(g.cwd), tmpdir: readdirSync(td), shim: paths, live: paths.filter((p) => existsSync(p)),
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
    assert.deepEqual(c.shim, [], 'driver mode called mktemp');
    assert.ok(c.drvSame, 'a driver dir changed');
}
test('A5: 3 cycles x SAME / DIFF / NO-VERDICT without --out -> exits 0/1/2, 8 spawns each; cwd, TMPDIR, mktemp log empty', { skip }, () => {
    assertCycles(cycles(SCRIPT));
});
// teeth 1: tee keeps the raw output in cwd when --out is absent (the "nothing is written without --out" claim)
test('A5 teeth: mutant tee-default-to-cwd turns the cycle row red (cwd holds run.<k>.txt; verdicts unchanged)', { skip }, () => {
    const dir = tmp('dd-a5m-');
    try {
        const c = cycles(variant(dir, 'tee_cwd', [['| tee "${3:-/dev/null}" |', '| tee "${3:-run.$k.txt}" |']]));
        assert.throws(() => assertCycles(c), /cwd holds entries/);
        assert.deepEqual(c.cwd.sort(), ['run.1.txt', 'run.2.txt', 'run.3.txt']);
        c.runs.forEach((r, i) => assert.equal(r.status, CYCLE[i % 3][3]));   // red for retention only
    } finally { rmAll(dir); }
});
// teeth 2: a bare `mktemp -d` in driver mode that is never removed; the shim sees it (macOS: the TMPDIR does not)
test('A5 teeth: mutant bare-mktemp-leak turns the cycle row red through the shim log (and, where mktemp honours TMPDIR, the TMPDIR)', { skip }, () => {
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
            assert.deepEqual(c.tmpdir.slice().sort(), c.shim.map((p) => basename(p)).sort(), 'the TMPDIR entries are the leaked dirs');
            assert.throws(() => assertCycles({ ...c, tmpdir: [] }), /driver mode called mktemp/, 'the shim leg is red on its own');
        } else {
            assert.throws(() => assertCycles(c), /driver mode called mktemp/);
            assert.deepEqual(c.tmpdir, [], 'a mktemp that ignores TMPDIR (macOS BSD) leaves the TMPDIR empty');
        }
        assert.equal(c.shim.length, 9);
        assert.equal(c.live.length, 9, 'every leaked dir was still on disk when the row read it');
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
        // cap 240000 (was 120000): CI run 42056284029, job 127345428176 (macOS node 26.8.2): row R-only-pos took 73.1 s
        const r = capSync('bash', [script, ...args.map((a) => (Object.hasOwn(map, a) ? map[a] : a))], { encoding: 'utf8', cwd: g.cwd, env }, 240000, basename(script));
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
// A4 parity: the Phase 2 scripts in PARITY equal their frozen p3g1 copies and `git show bd1f283:<file>` (sha256/8 pinned),
// hunk-scoped since G-FINAL (Q-F2a, b45): the live root with its G-FINAL prologue block put back to the pre-G-FINAL
// block (an exact-once, count-checked swap) must equal both references byte for byte. Since G-SHLIB (b48, PLAN-b48-shlib
// ADDENDA A2) each G-SHLIB hunk of lib/common.sh is put back the same way; since G-SHL3 (b50, PLAN-b50-shl3
// task 7) each G-SHL3 hunk (lib/common.sh + the lib/tracked.sh body) too, BEFORE the G-SHLIB hunks: the lib
// stages undo the newest change first (G-SHL3's live_tops lines split G-SHLIB hunk 2; r2 (A2) adds the unset
// CDPATH, live_tops local r / current-shell resolve and readlink -- hunks to G-SHL3); since G-BBAWK (b52, PLAN-b50-bbawk
// task 6) the lib/v8probe.sh LIMITS_AWK reset line too, BEFORE the G-SHL3 hunks. The pin stays 740da13b
// (no re-pin, precedent b48 A2)
// =====================================================================================================================
const sha8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const FROZEN = join(ROOT, '.handoff', 'frozen', 'p3g1');
// bytecode-budget.sh left the Phase 2 freeze in ext-audit (MD-32 (a)); its regression oracle is test/ext-audit.test.mjs
const PARITY = [['inlining-budget-diff.sh', '740da13b']];
// the prologue block of the inlining-budget-diff.sh root: G-FINAL (live) and pre-G-FINAL (bd1f283 / p3g1)
const GF_LIVE = '# Fail closed: an exit without FINAL=1 (a planned verdict) becomes 2 NO-VERDICT, rc 0 included (a bash 3.2\n' +
    '# set -u abort exits 0); a die / usage 2 stays silent; set +e keeps 2 with stderr closed. Subshells do not inherit this trap.\n' +
    'FINAL=""\n' +
    String.raw`trap 'rc=$?; if [[ -z $FINAL ]]; then set +e; [[ $rc -eq 2 ]] || printf "inlining-budget-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT` + '\n';
const GF_OLD = '# Fail closed: an exit that is not a planned verdict (FINAL=1), a die / usage (2) or 0 becomes 2 NO-VERDICT,\n' +
    '# so a command that fails under set -e can never pose as exit 1 DIFF. Subshells do not inherit this trap.\n' +
    'FINAL=""\n' +
    String.raw`trap 'rc=$?; if [[ -z $FINAL && $rc -ne 0 && $rc -ne 2 ]]; then printf "inlining-budget-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT` + '\n';
// the G-SHLIB hunks (lib/common.sh: top_of, live_tops, resolve_links, refuse_live) of the root: [live lines, pre-G-SHLIB
// lines] per hunk, in file order (git diff -U0 HEAD at 5993514)
const GS_HUNKS = [
    [[
        "top_of() { # dir file: 0 and TOP_OF = the toplevel of the work tree around dir; 1 outside a work tree (or no git); dies",
        "  # on any other git answer, naming file. The classifier is is_tracked's (lib/tracked.sh), copied word for word.",
        "  local d=\"$1\" out rc=0 l",
        "  TOP_OF=\"\"",
        "  command -v git >/dev/null 2>&1 || return 1",
        "  out=$(LC_ALL=C git -C \"$d\" rev-parse --is-inside-work-tree 2>&1) || rc=$?",
        "  l=${out%%$'\\n'*}",
        "  if [[ $rc -ne 0 ]]; then",
        "    case \"$l\" in \"fatal: not a git repository (or any \"*) return 1 ;; esac",
        "  elif [[ \"$out\" == false ]]; then",
        "    return 1",
        "  elif [[ \"$out\" == true ]]; then",
        "    rc=0",
        "    out=$(LC_ALL=C git -C \"$d\" rev-parse --show-toplevel 2>&1) || rc=$?",
        "    l=${out%%$'\\n'*}",
        "    [[ $rc -ne 0 ]] || { TOP_OF=\"$out\"; return 0; }",
        "  fi",
        "  die \"${what:-top_of}: git failed while checking whether $2 is tracked (${l:-no output, exit $rc}): fix it (e.g. git config --global --add safe.directory DIR) or use --before-ref\"",
    ],
     [
        "live_tops() { # dirs...: repo toplevels around cwd, --after, --repo and each given dir",
        "  { git rev-parse --show-toplevel 2>/dev/null || true",
        "    [[ -n \"$AFTER_FILE\" ]] && git -C \"$(dirname \"$AFTER_FILE\")\" rev-parse --show-toplevel 2>/dev/null || true",
        "    [[ -n \"$REPO\" ]] && git -C \"$REPO\" rev-parse --show-toplevel 2>/dev/null || true",
        "    for x in \"$@\"; do git -C \"$x\" rev-parse --show-toplevel 2>/dev/null || true; done; } | sort -u",
    ]],
    [[
        "live_tops() { # file dirs...: LIVE_TOPS = the repo toplevels around cwd, --after, --repo and each given dir (sort -u, one",
        "  # per line); a git error dies naming file (top_of). CURRENT shell only: never in $( ), <( ) or a pipe",
        "  local f=\"$1\" x t=\"\" TOP_OF=\"\"",
        "  shift",
        "  LIVE_TOPS=\"\"",
        "  if top_of . \"$f\"; then t=\"$t$TOP_OF\"$'\\n'; fi",
        "  if [[ -n \"$AFTER_FILE\" ]] && top_of \"$(dirname -- \"$AFTER_FILE\")\" \"$f\"; then t=\"$t$TOP_OF\"$'\\n'; fi",
        "  if [[ -n \"$REPO\" ]] && top_of \"$REPO\" \"$f\"; then t=\"$t$TOP_OF\"$'\\n'; fi",
        "  for x in \"$@\"; do if top_of \"$x\" \"$f\"; then t=\"$t$TOP_OF\"$'\\n'; fi; done",
        "  [[ -z \"$t\" ]] || LIVE_TOPS=$(printf '%s' \"$t\" | sort -u)",
        "}",
        "resolve_links() { # path: follow a symlink chain (at most 40 hops) and print its end. A relative link joins onto the",
        "  # PHYSICAL directory of the link (a logical join collapses a symlinked dir's '..' onto the wrong parent); dies if",
        "  # that directory cannot be entered",
        "  local p=\"$1\" l n=0 d",
    ],
     [
        "resolve_links() { # path: follow a symlink chain (at most 40 hops) and print its end",
        "  local p=\"$1\" l n=0",
    ]],
    [[
        "    case \"$l\" in /*) p=\"$l\" ;; *) d=$(CDPATH= cd -P -- \"$(dirname -- \"$p\")\" 2>/dev/null && pwd -P) || die \"cannot resolve the directory of $p (a link in the symlink chain of $1)\"; p=\"$d/$l\" ;; esac",
    ],
     [
        "    case \"$l\" in /*) p=\"$l\" ;; *) p=\"$(dirname \"$p\")/$l\" ;; esac",
    ]],
    [[
        "  local f=\"$1\" what=\"$2\" p me top t LIVE_TOPS=\"\"",
    ],
     [
        "  local f=\"$1\" what=\"$2\" p me top t",
    ]],
    [[
        "  live_tops \"$f\" \"$(dirname \"$f\")\" \"$(dirname \"$p\")\"",
    ],
     []],
    [[
        "  done < <(printf '%s\\n' \"$LIVE_TOPS\")",
    ],
     [
        "  done < <(live_tops \"$(dirname \"$f\")\" \"$(dirname \"$p\")\")",
    ]],
].map(([a, b]) => [a.map((l) => l + '\n').join(''), b.map((l) => l + '\n').join('')]);
// the G-SHL3 hunks of the root (src/inlining-budget-diff.sh unset CDPATH (r2, A2 blocker 1); lib/common.sh
// live_tops B2b (r2: local r + the current-shell resolve, Q-SHL3-RL), resolve_links' readlink -- (r2) and its
// "./" for a `-`-led dirname (r2, A3; also in both is_tracked copies below), fallback
// is_tracked N1, refuse_live cand list B2c; the lib/tracked.sh body N1): [live lines, pre-G-SHL3 lines] per hunk,
// in file order (overlay b50-shl3 base -> r2 head). The fallback is_tracked hunk carries its header + local line:
// its bare `b=` line also sits in the tracked.sh body, and the tracked.sh body repeats top_of's classifier lines
// (G-SHLIB hunk 1); every anchor is counted exactly once
const SHL3_HUNKS = [
    [[
        "unset CDPATH   # before the prologue: SELF, every cd and every \"cd X && pwd\" join resolve X itself, " +
            "never a CDPATH entry",
    ],
     []],
    [[
        "  local f=\"$1\" x r t=\"\" TOP_OF=\"\"",
    ],
     [
        "  local f=\"$1\" x t=\"\" TOP_OF=\"\"",
    ]],
    [[
        "  if [[ -L \"$AFTER_FILE\" && -e \"$AFTER_FILE\" ]]; then",
        "    r=$(resolve_links \"$AFTER_FILE\" 2>/dev/null) || " +
            "die \"--after: cannot resolve its symlink chain: $AFTER_FILE\"",
        "    if top_of \"$(dirname -- \"$r\")\" \"$f\"; then t=\"$t$TOP_OF\"$'\\n'; fi",
        "  fi",
    ],
     []],
    [[
        "    l=$(readlink -- \"$p\")",
    ],
     [
        "    l=$(readlink \"$p\")",
    ]],
    [[
        "    case \"$l\" in /*) p=\"$l\" ;; *) d=$(dirname -- \"$p\"); [[ $d != -* ]] || d=\"./$d\"",
        "      d=$(CDPATH= cd -P -- \"$d\" 2>/dev/null && pwd -P) || die \"cannot resolve the directory of $p " +
            "(a link in the symlink chain of $1)\"; p=\"$d/$l\" ;; esac",
    ],
     [
        "    case \"$l\" in /*) p=\"$l\" ;; *) d=$(CDPATH= cd -P -- \"$(dirname -- \"$p\")\" 2>/dev/null && pwd -P) " +
            "|| die \"cannot resolve the directory of $p (a link in the symlink chain of $1)\"; p=\"$d/$l\" ;; esac",
    ]],
    [[
        "is_tracked() { # path: 0 iff git tracks it in the work tree around it",
        "  local d b",
        "  d=$(dirname -- \"$1\"); [[ $d != -* ]] || d=\"./$d\"",
        "  d=$(CDPATH= cd -P -- \"$d\" 2>/dev/null && pwd -P) || return 1",
        "  b=$(basename -- \"$1\")",
    ],
     [
        "is_tracked() { # path: 0 iff git tracks it in the work tree around it",
        "  local d b",
        "  d=$(cd \"$(dirname \"$1\")\" 2>/dev/null && pwd) || return 1",
        "  b=$(basename \"$1\")",
    ]],
    [[
        "    for t in \"$top/Signal.js\" \"$top/$(basename \"$f\")\" \"$top/$(basename \"$p\")\" \\",
        "      ${AFTER_FILE:+\"$top/$(basename -- \"$AFTER_FILE\")\"}; do",
    ],
     [
        "    for t in \"$top/Signal.js\" \"$top/$(basename \"$f\")\" \"$top/$(basename \"$p\")\"; do",
    ]],
    [[
        "is_tracked() { # path: 0 iff git tracks it in the work tree around it; a git error dies",
        "  local d b out rc=0 l",
        "  command -v git >/dev/null 2>&1 || return 1",
        "  d=$(dirname -- \"$1\"); [[ $d != -* ]] || d=\"./$d\"",
        "  d=$(cd -P -- \"$d\" 2>/dev/null && pwd -P) || return 1",
        "  b=$(basename -- \"$1\")",
        "  out=$(LC_ALL=C git -C \"$d\" rev-parse --is-inside-work-tree 2>&1) || rc=$?",
        "  l=${out%%$'\\n'*}",
        "  if [[ $rc -ne 0 ]]; then",
        "    case \"$l\" in \"fatal: not a git repository (or any \"*) return 1 ;; esac",
        "  elif [[ \"$out\" == false ]]; then",
        "    return 1",
        "  elif [[ \"$out\" == true ]]; then",
        "    rc=0",
        "    out=$(LC_ALL=C git --literal-pathspecs -C \"$d\" ls-files --error-unmatch -- \"$b\" 2>&1) || rc=$?",
        "    l=${out%%$'\\n'*}",
        "    [[ $rc -ne 0 ]] || return 0",
        "    if [[ $rc -eq 1 ]]; then case \"$out\" in *\"did not match\"*) return 1 ;; esac; fi",
        "  fi",
        "  die \"${what:-is_tracked}: git failed while checking whether $1 is tracked " +
            "(${l:-no output, exit $rc}): fix it (e.g. git config --global --add safe.directory DIR) " +
            "or use --before-ref\"",
        "}",
    ],
     []],
].map(([a, b]) => [a.map((l) => l + '\n').join(''), b.map((l) => l + '\n').join('')]);
// the G-BBAWK line of the root's LIMITS_AWK (lib/v8probe.sh, right after its first rule)
const BB_RESET = '/^  --/ { k = "" }\n';
// [from, to, what, stage] in put-back order: G-FINAL, then the lib stages newest first
const PB_SWAPS = [
    [GF_LIVE, GF_OLD, 'the G-FINAL prologue block', 'G-FINAL'],
    [BB_RESET, '', 'the G-BBAWK reset line', 'G-BBAWK'],   // lib/v8probe.sh, before G-SHL3 (newest lib change first)
    ...SHL3_HUNKS.map(([a, b], i) => [a, b, `G-SHL3 hunk ${i + 1}`, 'G-SHL3']),
    ...GS_HUNKS.map(([a, b], i) => [a, b, `G-SHLIB hunk ${i + 1}`, 'G-SHLIB']),
];
const count = (s, a) => s.split(a).length - 1;
function swapBack(s, swaps) {   // latin1 string -> string: each swap's `from` (exactly once) replaced by its `to`
    for (const [from, to, what] of swaps) {
        const n = count(s, from);
        assert.equal(n, 1, `${what} must match exactly once, matched ${n}`);
        s = s.replace(from, () => to);
    }
    return s;
}
function putBack(live) {   // Buffer -> Buffer: the G-FINAL block, each G-SHL3 and each G-SHLIB hunk swapped back
    return Buffer.from(swapBack(live.toString('latin1'), PB_SWAPS), 'latin1');
}
// the swaps before / from the first swap of a stage; an AssertionError naming one swap (what)
const pbBefore = (stage) => PB_SWAPS.slice(0, PB_SWAPS.findIndex((w) => w[3] === stage));
const pbFrom = (stage) => PB_SWAPS.slice(PB_SWAPS.findIndex((w) => w[3] === stage));
const names = (what) => (e) => e instanceof assert.AssertionError
    && e.message.startsWith(`${what} must match exactly once`);
const flip1 = (s, j) => s.slice(0, j) + String.fromCharCode(s.charCodeAt(j) ^ 1) + s.slice(j + 1);
function gitShow(rev, file) {
    const r = capSync('git', ['-C', ROOT, 'show', `${rev}:${file}`], { env: ENV, maxBuffer: 1 << 26 }, 30000, 'git show');
    return r.status === 0 ? r.stdout : null;
}
const hasGit = capSync('git', ['-C', ROOT, 'cat-file', '-e', 'bd1f283^{commit}'], { env: ENV }, 30000, 'git cat-file').status === 0
    ? true : 'no git history with bd1f283: not checked, never passed';
// CI=true (GitHub Actions): a history row whose commit is missing FAILS instead of skipping; locally it skips with
// the reason. One spelling for every history row of this file.
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (have) => { if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`); };
function assertParity(live, ref, want) {
    assert.equal(sha8(live), want, 'live sha256/8');
    assert.ok(Buffer.compare(live, ref) === 0, 'live differs from the reference copy');
}
for (const [file, want] of PARITY) {
    const frozen = join(FROZEN, file);
    test(`A4: ${file} sha256/8 ${want} and cmp-equal to .handoff/frozen/p3g1/${file}`,
        { skip: skip || (existsSync(frozen) ? false : 'frozen copy absent (.handoff/ is gitignored): not checked, never passed') }, () => {
            assertParity(putBack(readFileSync(join(ROOT, file))), readFileSync(frozen), want);
        });
    test(`A4: ${file} cmp-equal to git show bd1f283:${file}`,
        { skip: skip || histSkip(hasGit) }, () => {
            histGate(hasGit);
            const ref = gitShow('bd1f283', file);
            assert.ok(ref, 'git show failed');
            assertParity(putBack(readFileSync(join(ROOT, file))), ref, want);
        });
    test(`A4 teeth: ${file} parity is red on a one-byte edit of the live bytes`, { skip }, () => {
        const live = putBack(readFileSync(join(ROOT, file)));
        assertParity(live, live, want);   // control: the unedited bytes pass
        const m = Buffer.from(live); m[m.length - 2] ^= 1;
        assert.throws(() => assertParity(m, live, want), assert.AssertionError);
    });
    test(`A4 teeth: ${file} hunk-scoped parity is red on a one-byte edit inside the G-FINAL block`, { skip }, () => {
        const live = readFileSync(join(ROOT, file));
        assert.equal(count(live.toString('latin1'), 'set +e;'), 1, 'the G-FINAL edit anchor matches exactly once');
        const m = Buffer.from(live); m[live.indexOf('set +e;')] ^= 1;
        assert.throws(() => putBack(m), names('the G-FINAL prologue block'));
    });
    test(`A4 teeth: ${file} hunk-scoped parity is red on a one-byte edit inside the G-BBAWK reset line`, { skip }, () => {
        const live = readFileSync(join(ROOT, file));
        assert.equal(sha8(putBack(live)), want, 'control: the unedited live root puts back to the pin');
        assert.equal(count(live.toString('latin1'), BB_RESET), 1, 'the G-BBAWK reset line matches exactly once');
        const m = Buffer.from(live); m[live.indexOf(BB_RESET) + (BB_RESET.length >> 1)] ^= 1;
        assert.throws(() => putBack(m), names('the G-BBAWK reset line'));
    });
    // a lib stage's hunks are looked up in the root as it stands when that stage runs (every earlier stage put
    // back): G-SHL3's live_tops lines sit inside G-SHLIB hunk 2, so that hunk exists only after the G-SHL3 put-back
    for (const [stage, hunks] of [['G-SHL3', SHL3_HUNKS], ['G-SHLIB', GS_HUNKS]]) {
        const t = `A4 teeth: ${file} hunk-scoped parity is red on a one-byte edit inside each ${stage} hunk`;
        test(t, { skip }, () => {
            const live = readFileSync(join(ROOT, file));
            assert.equal(sha8(putBack(live)), want, 'control: the unedited live root puts back to the pin');
            const at = swapBack(live.toString('latin1'), pbBefore(stage));
            for (const [i, [a]] of hunks.entries()) {
                const what = `${stage} hunk ${i + 1}`;
                assert.equal(count(at, a), 1, `${what}: its anchor matches exactly once when ${stage} runs`);
                const m = flip1(at, at.indexOf(a) + (a.length >> 1));
                assert.throws(() => swapBack(m, pbFrom(stage)), names(what),
                    `${what}: a one-byte edit inside it is red`);
            }
        });
    }
    test(`A4 teeth: ${file} G-SHLIB hunk 2 is red unless the G-SHL3 hunks are put back first`, { skip }, () => {
        const live = readFileSync(join(ROOT, file)).toString('latin1');
        const noShl3 = PB_SWAPS.filter((w) => w[3] !== 'G-SHL3');
        assert.throws(() => swapBack(live, noShl3), names('G-SHLIB hunk 2'));
        assert.equal(sha8(Buffer.from(swapBack(live, PB_SWAPS), 'latin1')), want,
            'control: with G-SHL3 it puts back');
    });
}
