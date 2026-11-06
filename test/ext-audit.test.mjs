// test/ext-audit.test.mjs -- bytecode-budget.sh, deopt-diff.sh and (the ic block at the end) ic-diff.sh from the OUTSIDE: the external-audit classes
// B1 (node resolved once), B1b (node must be an executable file), B2 (exported CDPATH), B3 (dash-led names),
// B4B (--v8-flags shape), M1 (unwritable report.txt), M2 (printed path joins), M1b/gA2 (raw/ guard, report.txt symlink, dd walk), plus A4 retention.
// ORACLE: .handoff/PLAN-ext-audit.md ASSERTIONS A1 + A4 and SPEC (never what a script printed). TIER: DETERMINISTIC
// (fake nodes written into a per-row temp dir; no V8 spawn, except the two --self-test rows which use the script's
// own canned checks). Every row has its own mkdtemp sandbox, removed afterwards.
// Root: EXT_AUDIT_ROOT, else the repo root (this file lives in test/). Tools: <root>/bytecode-budget.sh,
// <root>/deopt-diff.sh and <root>/ic-diff.sh. Rows: A1 = 72 (bb 35, dd 37) + 1 retention row per tool (A4) = 74 tests; + gA2 N20-N33 (28 rows, 14 per tool) = 102 tests; + A8 N34-N36 (6 rows, 3 per tool; bb rows are controls) = 108 tests; + A9 N37 (2 rows; dd red until gA2 B4 r2) = 110 tests; + gB B-ic B3 (the ic block at the end of this file, 44 rows: 32 red on the frozen ic (plain red), 12 controls) = 154 tests; + gB B-four dd B3 (14 dd-only rows after N37: MD36a/b/n, MD37a/c, MD38, ENV, MOD(-r/-ok), EVAL(-ep/-ok), RET) = 168 tests; + gB B-four bb B3 (the same 14 rows for bb, plus MD38n for both tools = 16 rows) = 184 tests; + gB B-four ic B3 (ic block 44 -> 65: F2 re-pinned as N29, +7 walk rows, +13 class rows, +1 RET) = 205 tests; + MD-46 G2 rung 1 (dd: MOD-ok / EVAL-ok -> MD51-MOD / MD51-EVAL, + F15-blob / F15-build / F15-ossl / V8-ok / RETv8) = 210 tests; + MD-46 G3 rung 2 (bb: the same flip and the same 5 new rows, V8-ok / RETv8 keyed per tool) = 215 tests; + MD-46 G4 rung 3 (ic: N15 8 -> 9, MOD-ok / EVAL-ok -> MD51-MOD / MD51-EVAL, + F15a / F15b / F15c, 4 V8R, V8OK, V8RET = 9 new rows) = 224 tests.
// A8 rows N34-N36 (dd walk guards "!= .", "-x", "-d"; their mutants survived the first 52 dd rows): dd N34 hangs on a mutant without "!= ." (the 10 s cap = red, by name: "dd N34 run timed out after 10000 ms"); N34 / N35 skip at euid 0 (modes ignored), N36 runs everywhere.
// B4 PROMOTION: this file is the promotion of the reviewed oracle .handoff/evidence/ext-audit/b3/ext-audit.test.mjs (sha256/8
// 2bf8d3fe) plus the B1e review FILLERS (bb N19a exact line, bare block removed, N19c ref-mode rows). EXT_AUDIT_ROOT still overrides the root.
// FROZEN EXPECTATION (b17-head: bb 99790884, dd db89aba0; PLAN A4): of the 15 rows added by B3b (N12-N18), 12 red and the 3
// controls (N15, N18 x2) green. PRE-FIX (live bb 38a058ab + parked dd f898eeb8): exactly 8 of the 15 red (bb N13 N16a-c N17;
// dd N16b-c N17), plus the N9 re-pin rows (they pin the post-fix `-ef` counts). After B2S / B1d: all green.
// B2S fix round adds dd N19a/b (`--out -o` fail-open): red on a dd whose guard is only `[[ "$OUT" != - ]] || OUT=./-`.
// B1e adds the same rows for bb (N19a/b); bb N19a is a CONTROL / regression pin (bb resolves OUT to an absolute path first; green before and after), bb N19b is the red row on 2a653648.
// N19c (both tools) adds the ref-mode twin of N19b: `--out -o` with ./-o/stage/x present in --before-ref / --after-ref mode.
// FROZEN EXPECTATION (b22-head: bb 02e44a7d, dd aab8ae9f; PLAN-ext-audit-gA2 A1): of the 28 gA2 rows (N20-N33) exactly 20 red (bb N20-N26 N28 N29;
// dd N20-N26 N29-N32) and 8 controls green (bb N27 N30 N31 N32 N33; dd N27 N28 N33); the 74 older rows green. The extended A4 retention rows
// (N20 / N24 / N29 / N31 inputs added) may go red there: the old code overwrites the victim / target and creates S/elsewhere/nowhere. Live after the fix: all green.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, readdirSync, existsSync, statSync, copyFileSync, realpathSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capSync } from './spawn-cap.mjs';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (afterEach runs before its own
// test's report, so it would lose the last pass; proven by test/death-signature.test.mjs teeth, b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.EXT_AUDIT_ROOT || join(HERE, '..'));
const skip = process.platform === 'win32' ? 'bash scripts: POSIX hosts only' : false;
const BASH = '/bin/bash';
// Node v26.8.2 `--v8-options` capture: the v8fl tools (MD-50..58) read it (dd once per run: the allowlist; bb twice: the allowlist,
// then the limits); the fake node cats it when T.v8fl. Its default: fields equal bb's node 26 fallbacks, so bb's limits line is
// unchanged and only the ASSUMED NOTE goes (G3 RISK, decided in rung 2: bb V8-ok pins both).
const V8O = join(HERE, 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
if (!existsSync(V8O)) throw new Error(`missing fixture ${V8O}`);

// Canned dd trace line (the same compile line the dd self-test uses; fn = add).
const E9 = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';

const TOOLS = [
    { key: 'bb', file: 'bytecode-budget.sh', label: 'bytecode-budget', dd: false, v8fl: true },
    { key: 'dd', file: 'deopt-diff.sh', label: 'deopt-diff', dd: true, v8fl: true },
];
for (const T of TOOLS) T.script = join(ROOT, T.file);

function sandbox() { return realpathSync(mkdtempSync(join(tmpdir(), 'ext-audit-'))); }
function rmAll(p) { if (p) rmSync(p, { recursive: true, force: true }); }

// Fake node (sh): appends "id|$PWD|$*" to LOG; answers --version / --v8-options; exits 9 when the LAST arg starts
// with '-'; else prints the tool's canned probe output and exits rc. 'len' = bb Bytecode length. 'bad' = exit 3 on probes.
function mkNode(path, id, log, T, { len = 6, bad = false } = {}) {
    mkdirSync(dirname(path), { recursive: true });
    const out = bad ? 'exit 3'
        : T.dd ? `printf '%s\\n' '${E9}'`
            : `printf '[generated bytecode for function: add (0x1 <SharedFunctionInfo add>)]\\nBytecode length: ${len}\\n'`;
    writeFileSync(path, [
        '#!/bin/sh',
        `printf '%s|%s|%s\\n' '${id}' "$PWD" "$*" >>'${log}'`,
        `case "$1" in --version) echo v26.8.2; exit 0 ;; --v8-options) ${T.v8fl ? `cat '${V8O}'; ` : ''}exit 0 ;; esac`,
        'for a in "$@"; do last=$a; done',
        'case "$last" in -*) exit 9 ;; esac',
        out, 'exit 0', ''].join('\n'));
    chmodSync(path, 0o755);
}
function readLog(log) { return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []; }
const isProbe = (l) => !/\|--(version|v8-options)$/.test(l);

function baseEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of ['NODE_OPTIONS', 'NODE', 'CDPATH', 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS']) delete e[k];
    for (const k of Object.keys(e)) if (k.startsWith('BASH_FUNC_')) delete e[k];
    return { ...e, ...extra };
}
function run(script, args, { cwd, env }) {
    const r = capSync(BASH, [script, ...args], { encoding: 'utf8', cwd, env }, 300000, `ext-audit ${basename(script)} run`);
    const out = (r.stdout || '') + (r.stderr || '');
    return { status: r.status, out, lines: out.split('\n'), stdout: r.stdout };
}

// A standard row rig: sandbox S with S/cwd, S/bin/node (a guard fake on PATH, id 'path'), S/fk/node (id 'fk'), one log.
function rig(T, opts = {}) {
    const S = sandbox();
    const log = join(S, 'log');
    writeFileSync(log, '');
    mkdirSync(join(S, 'cwd'));
    mkNode(join(S, 'bin', 'node'), 'path', log, T, opts);
    mkNode(join(S, 'fk', 'node'), 'fk', log, T, opts);
    const env = baseEnv({ PATH: `${join(S, 'bin')}:/usr/bin:/bin` });
    const drv = (name) => { mkdirSync(dirname(join(S, 'cwd', name)), { recursive: true }); writeFileSync(join(S, 'cwd', name), ''); return join(S, 'cwd', name); };
    return { S, log, env, cwd: join(S, 'cwd'), fk: join(S, 'fk', 'node'), drv, spawns: () => readLog(log), probes: () => readLog(log).filter(isProbe) };
}
// DRIVER args: bb takes one, dd takes two (the same path twice is fine for the rows that do not inspect the side).
const drvArgs = (T, a, b = a) => (T.dd ? [a, b] : [a]);

for (const T of TOOLS) {
    const k = T.key;
    const P = `${T.label}:`; // the die prefix

    // ---------------------------------------------------------------------------------------------------------------
    // B1: ONE resolved absolute node for every spawn. PATH has a RELATIVE entry 'mybin' (cwd holds mybin/node) before an
    // absolute sysbin; the driver lives elsewhere, so a per-cwd PATH lookup would pick sysbin for the probes.
    // Red on frozen: the version check runs mybin, the probes run sysbin.  [mutant: delete the canonical-path line]
    // ---------------------------------------------------------------------------------------------------------------
    test(`${k} B1 relative PATH entry: every spawn runs the one node resolved from the launch cwd`, { skip }, () => {
        const S = sandbox();
        try {
            const myLog = join(S, 'my.log'), sysLog = join(S, 'sys.log');
            writeFileSync(myLog, ''); writeFileSync(sysLog, '');
            mkdirSync(join(S, 'cwd'));
            mkNode(join(S, 'cwd', 'mybin', 'node'), 'my', myLog, T, { len: 6 });
            mkNode(join(S, 'sysbin', 'node'), 'sys', sysLog, T, T.dd ? { bad: true } : { len: 999 });
            mkdirSync(join(S, 'drv'));
            const d1 = join(S, 'drv', 'driver.mjs'); writeFileSync(d1, '');
            const env = baseEnv({ PATH: `mybin:${join(S, 'sysbin')}:/usr/bin:/bin` });
            const opts = T.dd ? ['--fn', 'add'] : ['--max', 'add=6', '--node-version', 'v26.8.2'];
            const r = run(T.script, [...opts, ...drvArgs(T, d1)], { cwd: join(S, 'cwd'), env });
            assert.equal(readLog(sysLog).length, 0, `sysbin must never run:\n${readLog(sysLog).join('\n')}\n${r.out}`);
            assert.ok(readLog(myLog).length >= 2, `mybin spawns >= 2, got ${readLog(myLog).length}\n${r.out}`);
            assert.equal(r.status, 0, r.out);
            assert.ok(r.lines.includes(T.dd ? 'VERDICT SAME' : 'VERDICT WITHIN'), r.out);
        } finally { rmAll(S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // B1b: a builtin name or a directory is not a node binary. exit 2, exactly one 'node binary is not' line, 0 spawns.
    // Red on frozen: `command -v true` passes (builtin) / the directory path is only absolutized.
    // [mutant: drop the */* or -f check]
    // ---------------------------------------------------------------------------------------------------------------
    for (const [label, mk] of [['--node true', () => 'true'], ['--node <dir>', (R) => { mkdirSync(join(R.S, 'nodedir')); return join(R.S, 'nodedir'); }]]) {
        test(`${k} B1b ${label} -> exit 2, one "node binary is not" line, 0 spawns`, { skip }, () => {
            const R = rig(T);
            try {
                const node = mk(R);
                const r = run(T.script, ['--fn', 'add', '--node', node, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                assert.equal(r.status, 2, r.out);
                assert.equal(r.lines.filter((l) => l.includes('node binary is not')).length, 1, r.out);
                assert.equal(R.spawns().length, 0, `0 spawns, got:\n${R.spawns().join('\n')}\n${r.out}`);
            } finally { rmAll(R.S); }
        });
    }

    // ---------------------------------------------------------------------------------------------------------------
    // B2: an exported CDPATH must not make `cd` print. Header path on ONE line.  [mutant: unset after the include ->
    // only the self-test row red]
    // ---------------------------------------------------------------------------------------------------------------
    for (const withOut of [false, true]) {
        test(`${k} B2 CDPATH=. relative driver sub/driver.mjs ${withOut ? 'with --out rel_out' : 'without --out'}`, { skip }, () => {
            const R = rig(T);
            try {
                const rel = T.dd ? ['sub/driver.mjs', 'sub/driver.mjs'] : ['sub/driver.mjs'];
                R.drv('sub/driver.mjs');
                const args = ['--fn', 'add', '--node', R.fk, ...(withOut ? ['--out', 'rel_out'] : []), ...rel];
                const r = run(T.script, args, { cwd: R.cwd, env: { ...R.env, CDPATH: '.' } });
                assert.equal(r.status, 0, r.out);
                const path = `${R.cwd}/sub/driver.mjs`;
                if (T.dd) {
                    const want = [/^before {2}(.+) {2}sha256\/8 [0-9a-f]{8}$/, /^after {3}(.+) {2}sha256\/8 [0-9a-f]{8}$/];
                    for (const re of want) {
                        const ls = r.lines.filter((l) => re.test(l));
                        assert.equal(ls.length, 1, `one header line ${re}\n${r.out}`);
                        assert.equal(ls[0].match(re)[1], path, r.out);
                    }
                } else {
                    assert.ok(r.lines.includes(`driver  ${path}`), `header "driver  ${path}" on one line\n${r.out}`);
                }
                if (withOut) {
                    assert.ok(r.lines.includes(`out     ${R.cwd}/rel_out`), `out line on one line\n${r.out}`);
                    assert.ok(statSync(join(R.cwd, 'rel_out', 'report.txt')).isFile());
                }
            } finally { rmAll(R.S); }
        });
    }
    test(`${k} B2 CDPATH=. bash sub/${T.file} --self-test exits 0`, { skip }, () => {
        const S = sandbox();
        try {
            mkdirSync(join(S, 'sub'));
            copyFileSync(T.script, join(S, 'sub', T.file));
            const r = run(`sub/${T.file}`, ['--self-test'], { cwd: S, env: baseEnv({ CDPATH: '.' }) });
            assert.equal(r.status, 0, r.out.split('\n').slice(-25).join('\n'));
        } finally { rmAll(S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // B3: dash-led names reach node / mkdir / cd as data.  [mutant: "$4" instead of "./$4"; drop -- on mkdir]
    // ---------------------------------------------------------------------------------------------------------------
    test(`${k} B3 driver ./-driver.mjs reaches node as ./-driver.mjs (exit 0)`, { skip }, () => {
        const R = rig(T);
        try {
            R.drv('-driver.mjs');
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, ...drvArgs(T, './-driver.mjs')], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const pr = R.probes();
            assert.ok(pr.length >= 2, `probe spawns >= 2, got ${pr.length}`);
            for (const l of pr) assert.ok(l.endsWith(' ./-driver.mjs'), `last argv must be ./-driver.mjs: ${l}`);
        } finally { rmAll(R.S); }
    });
    test(`${k} B3 --out -out writes -out/report.txt (exit 0)`, { skip }, () => {
        const R = rig(T);
        try {
            const d = R.drv('driver.mjs');
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', '-out', ...drvArgs(T, d)], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            assert.ok(existsSync(join(R.cwd, '-out', 'report.txt')), `-out/report.txt must exist\n${r.out}`);
        } finally { rmAll(R.S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // B4B: --v8-flags shape is --[A-Za-z]*. Four malformed flags -> exit 2, 0 spawns; the control flag -> exit 0,
    // >= 2 spawns (the control is green on frozen by design).  [mutant: revert to --*]
    // ---------------------------------------------------------------------------------------------------------------
    for (const f of ['---max-inlined-bytecode-size=30', '---no-max-inlined-bytecode-size', '--=1', '--1x']) {
        test(`${k} B4B --v8-flags ${f} refused: exit 2, 0 spawns`, { skip }, () => {
            const R = rig(T);
            try {
                const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--v8-flags', f, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                assert.equal(r.status, 2, r.out);
                assert.ok(r.lines.some((l) => l.startsWith(P)), `a ${P} refusal line\n${r.out}`);
                assert.equal(R.spawns().length, 0, `0 spawns, got:\n${R.spawns().join('\n')}`);
            } finally { rmAll(R.S); }
        });
    }
    test(`${k} B4B control --v8-flags --max-inlined-bytecode-size=30 accepted: exit 0, >= 2 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--v8-flags', '--max-inlined-bytecode-size=30', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            assert.ok(R.spawns().length >= 2, `spawns >= 2, got ${R.spawns().length}\n${r.out}`);
        } finally { rmAll(R.S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // M1: an unwritable report.txt (a directory) is a clean refusal. For bb (since b47 Q-FIFO) and dd the pre-write
    // clause refuses it; the `: >"$REPORT" || die` line is a race backstop only, so "drop || die" kills nothing here.
    // ---------------------------------------------------------------------------------------------------------------
    test(`${k} M1 --out DIR whose report.txt is a directory -> exit 2, "--out: cannot write", no "unexpected error"`, { skip }, () => {
        const R = rig(T);
        try {
            mkdirSync(join(R.S, 'm1', 'report.txt'), { recursive: true });
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', join(R.S, 'm1'), ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            assert.ok(r.lines.some((l) => l.includes('--out: cannot write')), r.out);
            assert.equal(r.lines.filter((l) => l.includes('unexpected error')).length, 0, r.out);
            assert.equal(R.spawns().length, 0, `A3: 0 spawns, got:\n${R.spawns().join('\n')}`);
        } finally { rmAll(R.S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // M2 (static): the root script prints no bare "$DRV_*DIR/" join (a driver in / would print //x). Printed joins =
    // `say` lines and DESC_ assignments, with the sha8 "<path>" argument stripped (it is a read, not printed).
    // Frozen: bb 3, dd 2.
    // ---------------------------------------------------------------------------------------------------------------
    test(`${k} M2 static: 0 printed "$DRV_*DIR/" joins in ${T.file}`, { skip }, () => {
        const src = readFileSync(T.script, 'utf8').split('\n');
        const hits = [];
        src.forEach((l, i) => {
            const s = l.replace(/sha8 "[^"]*"/g, 'sha8 X');
            if (/(^|[^A-Za-z_])(say |DESC_[A-Z]=)/.test(s)) {
                const m = s.match(/\$DRV_[A-Z_]*DIR\//g);
                if (m) hits.push(`${i + 1}: x${m.length} ${l.trim()}`);
            }
        });
        assert.equal(hits.length, 0, hits.join('\n'));
    });


    // ---------------------------------------------------------------------------------------------------------------
    // R rows (review additions, ids N1..N10): dash-led directory names and node-path edge cases. Each fake node logs its
    // OWN path as the id, so "which binary ran" is asserted exactly.
    // ---------------------------------------------------------------------------------------------------------------
    const nodeRow = (name, dirName, mkArg) => test(`${k} ${name}`, { skip }, () => {
        const R = rig(T);
        try {
            const want = join(R.cwd, dirName, 'node');
            mkNode(want, want, R.log, T);
            const d = R.drv('driver.mjs');
            const r = run(T.script, ['--fn', 'add', ...mkArg(), ...drvArgs(T, d)], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const ls = R.spawns();
            assert.ok(ls.length >= 2, `spawns >= 2, got ${ls.length}\n${r.out}`);
            for (const l of ls) assert.equal(l.split('|')[0], want, `every spawn runs ${want}: ${l}`);
        } finally { rmAll(R.S); }
    });
    nodeRow('N5 --node -/node (dir named -): every spawn is <cwd>/-/node', '-', () => ['--node', '-/node']);
    nodeRow('N6 --node=-x/node (dir -x): every spawn is <cwd>/-x/node', '-x', () => ['--node=-x/node']);

    test(`${k} N7 --out - writes ./-/report.txt (exit 0, no unexpected error)`, { skip }, () => {
        const R = rig(T);
        try {
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', '-', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            assert.ok(existsSync(join(R.cwd, '-', 'report.txt')), `./-/report.txt must exist\n${r.out}`);
            assert.equal(r.lines.filter((l) => l.includes('unexpected error')).length, 0, r.out);
        } finally { rmAll(R.S); }
    });

    test(`${k} N1 --node ./non-exec (plain non-executable file) -> exit 2, one "node binary is not" line, 0 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            writeFileSync(join(R.cwd, 'non-exec'), '#!/bin/sh\nexit 0\n'); chmodSync(join(R.cwd, 'non-exec'), 0o644);
            const r = run(T.script, ['--fn', 'add', '--node', './non-exec', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes('node binary is not')).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    // CHOICE (documented in TABLE.md): PLAN TASK 1 says a bare name is resolved by `command -v --` (a PATH lookup) and
    // builtins are refused; "." is not on PATH, so a cwd file named `true` is neither used nor does the builtin run:
    // exit 2, one "node binary is not" line, 0 spawns (the cwd file's log line would count as a spawn).
    test(`${k} N2 cwd file named true + --node true -> builtin refused, cwd file not run: exit 2, 0 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            mkNode(join(R.cwd, 'true'), 'cwdtrue', R.log, T);
            const r = run(T.script, ['--fn', 'add', '--node', 'true', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes('node binary is not')).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    test(`${k} N3 driver ./-sub/driver.mjs: node runs in <cwd>/-sub with last argv ./driver.mjs`, { skip }, () => {
        const R = rig(T);
        try {
            R.drv('-sub/driver.mjs');
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, ...drvArgs(T, './-sub/driver.mjs')], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const pr = R.probes();
            assert.ok(pr.length >= 2, `probe spawns >= 2, got ${pr.length}`);
            for (const l of pr) {
                assert.equal(l.split('|')[1], join(R.cwd, '-sub'), l);
                assert.ok(l.endsWith(' ./driver.mjs'), `last argv ./driver.mjs: ${l}`);
            }
        } finally { rmAll(R.S); }
    });

    test(`${k} N4 two-driver form with before driver in a -b/ dir: before runs in <cwd>/-b, after in <cwd>/a`, { skip }, () => {
        const R = rig(T);
        try {
            R.drv('-b/driver.mjs'); R.drv('a/driver.mjs');
            const args = T.dd ? ['./-b/driver.mjs', 'a/driver.mjs'] : ['--diff', './-b/driver.mjs', 'a/driver.mjs'];
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, ...args], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const pr = R.probes();
            const dirs = new Set(pr.map((l) => l.split('|')[1]));
            assert.deepEqual([...dirs].sort(), [join(R.cwd, '-b'), join(R.cwd, 'a')].sort(), pr.join('\n'));
            for (const l of pr) assert.ok(l.endsWith(' ./driver.mjs'), `last argv ./driver.mjs: ${l}`);
        } finally { rmAll(R.S); }
    });

    // N8: a driver in a directory literally named '-' (given as ./-/d.mjs; a bare -/d.mjs is an option) must not mean OLDPWD.
    test(`${k} N8 driver ./-/d.mjs (dir named -): exit 0, node runs in <cwd>/-`, { skip }, () => {
        const R = rig(T);
        try {
            R.drv('-/d.mjs');
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, ...drvArgs(T, './-/d.mjs')], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const pr = R.probes();
            assert.ok(pr.length >= 2, `probe spawns >= 2, got ${pr.length}`);
            for (const l of pr) assert.equal(l.split('|')[1], join(R.cwd, '-'), l);
        } finally { rmAll(R.S); }
    });

    // N9 (static, re-pinned by PLAN ext-audit A4): exactly 1 `-ef "$NODE_RES"` line, DRV `-ef` lines bb 3 / dd 2 (4S.1 / 4S.4:
    // before, after, and bb's single driver), exactly 1 `-ef "$OUT"` line (4S.2). The frozen build has 0 / 0 / 0.
    test(`${k} N9 static: 1 -ef "$NODE_RES" line, ${T.dd ? 2 : 3} DRV -ef lines, 1 -ef "$OUT" line in ${T.file}`, { skip }, () => {
        const src = readFileSync(T.script, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)); // non-comment lines only
        const node = src.filter((l) => /-ef "\$NODE_RES"/.test(l));
        const drv = src.filter((l) => /-ef/.test(l) && /DRV_[A-Z_]*DIR/.test(l));
        assert.equal(node.length, 1, node.join('\n'));
        const out = src.filter((l) => /-ef "\$OUT"/.test(l));
        assert.equal(drv.length, T.dd ? 2 : 3, drv.join('\n'));
        assert.equal(out.length, 1, out.join('\n'));
    });

    // N11: --node whose last char is a newline (real entry "node\n" = fake A beside "node" = fake B). $(basename) strips the
    // newline, so without the -ef check B would run. bb: "node binary is not an executable file" once; dd refuses a newline
    // in --node earlier ("a newline is not allowed"). Either way exit 2 and 0 spawns from either fake.
    test(`${k} N11 --node "nl/node<newline>": exit 2, one refusal line, 0 spawns from either fake`, { skip }, () => {
        const R = rig(T);
        try {
            mkNode(join(R.cwd, 'nl', 'node\n'), 'A', R.log, T);
            mkNode(join(R.cwd, 'nl', 'node'), 'B', R.log, T);
            const r = run(T.script, ['--fn', 'add', '--node', 'nl/node\n', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            const want = T.dd ? 'a newline is not allowed' : 'node binary is not an executable file';
            assert.equal(r.lines.filter((l) => l.includes(want)).length, 1, `exactly one "${want}" line\n${r.out}`);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    {
        // N10 (bb + dd since b47 Q-FIFO): an existing OUT that is not writable and has no raw/ is refused before any spawn,
        // with the pre-write clause's line "--out: cannot write <OUT>/report.txt" (bb was "cannot create <OUT>/raw").
        // Gates the clause's `-w "$OUT"` arm [mutant E: `( ! -e "$OUT" || -w "$OUT" )` -> true].
        test(`${k} N10 existing OUT mode 555, no raw/: exit 2, "cannot write", 0 spawns`, { skip: skip || (process.getuid && process.getuid() === 0 ? 'root ignores mode 555' : false) }, () => {
            const R = rig(T);
            try {
                const o = join(R.S, 'ro'); mkdirSync(o); chmodSync(o, 0o555);
                const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', o, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                chmodSync(o, 0o755);
                assert.equal(r.status, 2, r.out);
                assert.ok(r.lines.some((l) => l.includes('cannot write')), r.out);
                assert.equal(r.lines.filter((l) => l.includes(`--out: cannot write ${o}/report.txt`)).length, 1, `the exact refusal line once\n${r.out}`);
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
                assert.equal(existsSync(join(o, 'raw')), false, 'raw/ must not be created');
            } finally { try { chmodSync(join(R.S, 'ro'), 0o755); } catch {} rmAll(R.S); }
        });
    }
    // ---------------------------------------------------------------------------------------------------------------
    // B3b rows (PLAN ext-audit A4 TASK 5, ids N12-N18): symlink-before-`..` paths and the unwritable-report.txt refusal.
    // L = <cwd>/link -> <S>/elsewhere/sub, so `link/..` is <S>/elsewhere physically and <cwd> logically.
    // ---------------------------------------------------------------------------------------------------------------
    const linkRig = () => {
        const R = rig(T);
        mkdirSync(join(R.S, 'elsewhere', 'sub'), { recursive: true });
        symlinkSync(join(R.S, 'elsewhere', 'sub'), join(R.cwd, 'link'));
        return R;
    };
    const ls = (d) => readdirSync(d).sort().join(',');
    const noGit = (env) => { const e = { ...env }; for (const n of Object.keys(e)) if (n.startsWith('GIT_')) delete e[n]; return e; };

    {
        // N12 [mutant X9: report.txt check missing; bb since b47 Q-FIFO: mutant D, drop `&& -w "$OUT/report.txt"`]: existing OUT,
        // report.txt mode 444, no raw/ -> refused before any spawn, the exact clause line once, no raw/ left behind.
        test(`${k} N12 existing OUT with report.txt mode 444, no raw/: exit 2, "cannot write", 0 spawns, no raw/`, { skip: skip || (process.getuid && process.getuid() === 0 ? 'root ignores mode 444' : false) }, () => {
            const R = rig(T);
            try {
                const o = join(R.S, 'o12'); mkdirSync(o);
                writeFileSync(join(o, 'report.txt'), 'old\n'); chmodSync(join(o, 'report.txt'), 0o444);
                const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', o, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                assert.equal(r.status, 2, r.out);
                assert.ok(r.lines.some((l) => l.includes('cannot write')), r.out);
                assert.equal(r.lines.filter((l) => l.includes(`--out: cannot write ${o}/report.txt`)).length, 1, `the exact refusal line once\n${r.out}`);
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
                assert.equal(existsSync(join(o, 'raw')), false, 'raw/ must not be created');
            } finally { rmAll(R.S); }
        });
    }
    if (T.dd) {
        // N15 control [mutant: over-refusing `( ! -e "$OUT" )`]: an existing EMPTY OUT is fine.
        test(`dd N15 control: existing empty OUT -> exit 0, report.txt + raw/before + raw/after`, { skip }, () => {
            const R = rig(T);
            try {
                const o = join(R.S, 'o15'); mkdirSync(o);
                const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', o, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                assert.equal(r.status, 0, r.out);
                assert.ok(statSync(join(o, 'report.txt')).isFile(), 'report.txt');
                assert.ok(existsSync(join(o, 'raw', 'before')), 'raw/before exists');
                assert.ok(existsSync(join(o, 'raw', 'after')), 'raw/after exists');
            } finally { rmAll(R.S); }
        });
    }

    // N13 [mutant X3: the `-` guard after stage_check]: file mode, `--out -`, ./-/stage/x present -> the stage refusal names
    // ./-/stage (a bare `ls -A -/stage` is an option error, so the old order skipped the refusal). GIT_* stripped.
    test(`${k} N13 file mode --out - with ./-/stage/x present: exit 2, one "./-/stage is not empty" line, 0 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            assert.equal(spawnSync('/bin/sh', ['-c', 'command -v git'], { env: R.env }).status, 0, 'git must resolve on the pinned PATH (the tools need git in file mode)');
            mkdirSync(join(R.cwd, '-', 'stage'), { recursive: true }); writeFileSync(join(R.cwd, '-', 'stage', 'x'), '');
            mkdirSync(join(R.S, 'mods', 'before'), { recursive: true });
            writeFileSync(join(R.S, 'mods', 'before', 'Mod.js'), 'export const a = 1;\n');
            writeFileSync(join(R.S, 'mods', 'Mod.js'), 'export const a = 2;\n');
            writeFileSync(join(R.cwd, 'drv.mjs'), "import './Mod.js';\n");
            const args = [...(T.dd ? [] : ['--diff']), '--fn', 'add', '--node', R.fk, '--out', '-', '--driver', 'drv.mjs',
                '--before', join(R.S, 'mods', 'before', 'Mod.js'), '--after', join(R.S, 'mods', 'Mod.js')];
            const r = run(T.script, args, { cwd: R.cwd, env: noGit(R.env) });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes('./-/stage is not empty')).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    // N19a/b [mutant: the bb/dd guard `[[ "$OUT" != - ]] || OUT=./-` only handles exactly `-`]: `--out -o` is another dash-led
    // OUT; ls/stage checks must see ./-o, not an option, so a non-empty raw/ (driver mode) or stage/ (file mode) is refused.
    test(`${k} N19a${T.dd ? '' : ' (control)'} driver mode --out -o with ./-o/raw/x present: exit 2, one ${T.dd ? '"./-o/raw is not empty"' : 'exact "--out: <cwd>/-o/raw is not empty (give a new or empty DIR)"'} line, 0 spawns, x unchanged`, { skip }, () => {
        const R = rig(T);
        try {
            mkdirSync(join(R.cwd, '-o', 'raw'), { recursive: true }); writeFileSync(join(R.cwd, '-o', 'raw', 'x'), 'keep\n');
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', '-o', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            // dd names ./-o/raw; bb names the absolute path: `--out: <abs cwd>/-o/raw is not empty (give a new or empty DIR)`.
            const hit = T.dd
                ? (l) => l.includes('./-o/raw is not empty')
                : (l) => l === `${P} --out: ${R.cwd}/-o/raw is not empty (give a new or empty DIR)`; // R.cwd is realpath'd (sandbox), so no /var vs /private/var skew
            assert.equal(r.lines.filter(hit).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            assert.equal(readFileSync(join(R.cwd, '-o', 'raw', 'x'), 'utf8'), 'keep\n');
        } finally { rmAll(R.S); }
    });
    test(`${k} N19b file mode --out -o with ./-o/stage/x present: exit 2, one "./-o/stage is not empty" line, 0 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            assert.equal(spawnSync('/bin/sh', ['-c', 'command -v git'], { env: R.env }).status, 0, 'git must resolve on the pinned PATH (the tools need git in file mode)');
            mkdirSync(join(R.cwd, '-o', 'stage'), { recursive: true }); writeFileSync(join(R.cwd, '-o', 'stage', 'x'), '');
            mkdirSync(join(R.S, 'mods', 'before'), { recursive: true });
            writeFileSync(join(R.S, 'mods', 'before', 'Mod.js'), 'export const a = 1;\n');
            writeFileSync(join(R.S, 'mods', 'Mod.js'), 'export const a = 2;\n');
            writeFileSync(join(R.cwd, 'drv.mjs'), "import './Mod.js';\n");
            const args = [...(T.dd ? [] : ['--diff']), '--fn', 'add', '--node', R.fk, '--out', '-o', '--driver', 'drv.mjs',
                '--before', join(R.S, 'mods', 'before', 'Mod.js'), '--after', join(R.S, 'mods', 'Mod.js')];
            const r = run(T.script, args, { cwd: R.cwd, env: noGit(R.env) });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes('./-o/stage is not empty')).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    // N19c [mutant: guard handles only exactly `-`]: ref mode (two-commit git repo; --before-ref r1 --after-ref r2 --module),
    // `--out -o`, ./-o/stage/x present -> stage refusal names ./-o/stage, 0 spawns, x unchanged. GIT_* stripped as N13.
    test(`${k} N19c ref mode --out -o with ./-o/stage/x present: exit 2, one "./-o/stage is not empty" line, 0 spawns, x unchanged`, { skip }, () => {
        const R = rig(T);
        try {
            assert.equal(spawnSync('/bin/sh', ['-c', 'command -v git'], { env: R.env }).status, 0, 'git must resolve on the pinned PATH (the tools need git in ref mode)');
            const genv = noGit(R.env);
            const repo = join(R.S, 'repo'); mkdirSync(join(repo, 'm'), { recursive: true });
            const git = (...a) => assert.equal(spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, env: genv, encoding: 'utf8' }).status, 0, a.join(' '));
            git('init', '-q');
            writeFileSync(join(repo, 'm', 'mod.txt'), '1\n'); git('add', '.'); git('commit', '-q', '-m', 'r1'); git('tag', 'r1');
            writeFileSync(join(repo, 'm', 'mod.txt'), '2\n'); git('add', '.'); git('commit', '-q', '-m', 'r2'); git('tag', 'r2');
            mkdirSync(join(R.cwd, '-o', 'stage'), { recursive: true }); writeFileSync(join(R.cwd, '-o', 'stage', 'x'), 'keep\n');
            writeFileSync(join(R.cwd, 'drv.mjs'), "import './mod.txt';\n");
            const args = [...(T.dd ? [] : ['--diff']), '--fn', 'add', '--node', R.fk, '--out', '-o', '--driver', 'drv.mjs',
                '--before-ref', 'r1', '--after-ref', 'r2', '--module', 'm/mod.txt', '--repo', repo];
            const r = run(T.script, args, { cwd: R.cwd, env: genv });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes('./-o/stage is not empty')).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            assert.equal(readFileSync(join(R.cwd, '-o', 'stage', 'x'), 'utf8'), 'keep\n');
        } finally { rmAll(R.S); }
    });

    // N14 [mutant X11: no -ef on the resolved node]: the real fake is S/elsewhere/node, a decoy sits at cwd/node; the logical
    // path link/../node names the decoy. Neither fake may run.
    test(`${k} N14 --node link/../node (real node elsewhere, decoy in cwd): exit 2, one "node binary is not an executable file" line, 0 spawns`, { skip }, () => {
        const R = linkRig();
        try {
            mkNode(join(R.S, 'elsewhere', 'node'), 'real', R.log, T);
            mkNode(join(R.cwd, 'node'), 'decoy', R.log, T);
            const r = run(T.script, ['--fn', 'add', '--node', 'link/../node', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes('node binary is not an executable file')).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    // N16 [mutants D0 / D1 / D2: the DRIVER -ef check of the single / before / after driver]: the real driver is
    // S/elsewhere/d.mjs, a decoy with other bytes is cwd/d.mjs, and `link/../d.mjs` names the decoy logically.
    const n16 = (id, tag, mk) => test(`${k} ${id} ${tag} driver link/../d.mjs: exit 2, one "cannot resolve the directory of" line, 0 spawns, cwd unchanged`, { skip }, () => {
        const R = linkRig();
        try {
            writeFileSync(join(R.S, 'elsewhere', 'd.mjs'), '// real\n');
            writeFileSync(join(R.cwd, 'd.mjs'), '// decoy, different bytes\n');
            const ok = R.drv('ok.mjs');
            const before = ls(R.cwd);
            const bad = 'link/../d.mjs';
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, ...mk(bad, ok)], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            assert.equal(r.lines.filter((l) => l.includes(`cannot resolve the directory of ${bad}`)).length, 1, r.out);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            assert.equal(ls(R.cwd), before, 'cwd listing unchanged');
        } finally { rmAll(R.S); }
    });
    if (!T.dd) n16('N16a', 'single', (bad) => [bad]);
    n16('N16b', 'before', (bad, ok) => (T.dd ? [bad, ok] : ['--diff', bad, ok]));
    n16('N16c', 'after', (bad, ok) => (T.dd ? [ok, bad] : ['--diff', ok, bad]));

    // N17 [mutant O1: drop the physical fallback]: cwd/o exists (empty), S/elsewhere/o does not; `--out link/../o` makes the
    // physical dir (elsewhere/o) and every write must land THERE, with the header naming it.
    test(`${k} N17 --out link/../o: writes S/elsewhere/o (physical), cwd/o stays empty, header names the physical path`, { skip }, () => {
        const R = linkRig();
        try {
            mkdirSync(join(R.cwd, 'o'));
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', 'link/../o', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            const phys = join(R.S, 'elsewhere', 'o');
            assert.equal(r.status, 0, r.out);
            assert.ok(statSync(join(phys, 'report.txt')).size > 0, 'elsewhere/o/report.txt non-empty');
            const rawFiles = readdirSync(join(phys, 'raw'), { recursive: true }).filter((e) => statSync(join(phys, 'raw', e)).isFile());
            assert.ok(rawFiles.length >= 2, `elsewhere/o/raw has >= 2 files, got ${rawFiles.length}`);
            assert.equal(readdirSync(join(R.cwd, 'o')).length, 0, 'cwd/o has 0 entries');
            assert.ok(r.lines.includes(`out     ${phys}`), `header "out     ${phys}"\n${r.out}`);
        } finally { rmAll(R.S); }
    });

    // N18 control [mutant O2: always `cd -P`]: a symlinked directory that is reached WITHOUT `..` keeps its logical name.
    test(`${k} N18 control: driver lnk/d.mjs and --out lnk/o via a symlinked dir keep the logical names (exit 0)`, { skip }, () => {
        const R = rig(T);
        try {
            mkdirSync(join(R.S, 'real'));
            writeFileSync(join(R.S, 'real', 'd.mjs'), '');
            symlinkSync(join(R.S, 'real'), join(R.cwd, 'lnk'));
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', 'lnk/o', ...drvArgs(T, 'lnk/d.mjs')], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const path = `${R.cwd}/lnk/d.mjs`;
            if (T.dd) {
                for (const re of [/^before {2}(.+) {2}sha256\/8 [0-9a-f]{8}$/, /^after {3}(.+) {2}sha256\/8 [0-9a-f]{8}$/]) {
                    const m = r.lines.filter((l) => re.test(l));
                    assert.equal(m.length, 1, `one header line ${re}\n${r.out}`);
                    assert.equal(m[0].match(re)[1], path, r.out);
                }
            } else {
                assert.ok(r.lines.includes(`driver  ${path}`), `header "driver  ${path}"\n${r.out}`);
            }
            assert.ok(r.lines.includes(`out     ${R.cwd}/lnk/o`), `header "out     ${R.cwd}/lnk/o"\n${r.out}`);
        } finally { rmAll(R.S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // gA2 rows N20-N33 (ORACLE: .handoff/PLAN-ext-audit-gA2.md SPEC / TASK 1-3 / A1 + A3, and MD-34): the --out raw/ guard
    // (unreadable / unwritable raw/), the report.txt symlink refusal (EVERY symlink, even one pointing inside OUT), dd's
    // writable-ancestor walk, and the bb --node newline dir. A refused row: exit 2, the exact die line once, 0 spawns, the
    // victim untouched. Every expected text is the plan's TASK 1 / 2 text (OUT is always absolute and realpath'd here).
    // Mutants (A1): drop -L -> N24-N26; -L moved after the mkdir -> N24-N26; drop the readable line -> N20-N23; `-r` only
    // -> N22; drop -w -> N29 (bb); drop `2>/dev/null` -> N28 (bb); `-L` -> `-e` -> N25-N27, N32, M1 (+ bb / dd N12); dd: no walk -> N29-N32, immediate
    // parent only -> N33, drop `! -L` in the walk -> N31.
    // ---------------------------------------------------------------------------------------------------------------
    const asRoot = !!(process.getuid && process.getuid() === 0);
    const rootSkip = skip || (asRoot ? 'root ignores file modes' : false);
    const RD = (o) => `--out: ${o}/raw is not readable`;
    const WRB = (o) => `--out: ${o}/raw is not writable`;
    const SYM = (o) => `--out: ${o}/report.txt is a symlink (refused: the write would follow it)`;
    const WALK = (o, x) => `--out: cannot create ${o}/raw/before and ${o}/raw/after (${x} is not a writable directory)`;
    // setup(R, lock) -> { out, text, check?(R) }; lock(p, mode) chmods p AFTER its contents exist and registers the restore.
    const refusedRow = (id, desc, root, setup) => test(`${k} ${id} ${desc}`, { skip: root ? rootSkip : skip }, () => {
        const R = rig(T); const locked = [];
        const lock = (p, mode) => { chmodSync(p, mode); locked.push(p); };
        const restore = () => { for (const p of locked) { try { chmodSync(p, 0o755); } catch {} } };
        try {
            const c = setup(R, lock);
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', c.out, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            restore();
            assert.equal(r.status, 2, r.out);
            const want = `${P} ${c.text}`;
            assert.equal(r.lines.filter((l) => l === want).length, 1, `exactly one line "${want}"\n${r.out}`);
            assert.equal(R.spawns().length, 0, `0 spawns, got:\n${R.spawns().join('\n')}\n${r.out}`);
            if (c.check) c.check(R);
        } finally { restore(); rmAll(R.S); }
    });
    const keep = (p, want, what) => assert.equal(readFileSync(p, 'utf8'), want, `${what} bytes unchanged`);

    // N20: raw/ 0300 (write+exec, no read) holding a file. Frozen bb: the emptiness test sees nothing and tee overwrites it.
    refusedRow('N20', 'raw/ mode 0300 holding add.1.txt: exit 2, "raw is not readable", 0 spawns, file bytes unchanged', true, (R, lock) => {
        const o = join(R.S, 'o20'); mkdirSync(join(o, 'raw'), { recursive: true });
        writeFileSync(join(o, 'raw', 'add.1.txt'), 'VICTIM\n'); lock(join(o, 'raw'), 0o300);
        return { out: o, text: RD(o), check: () => keep(join(o, 'raw', 'add.1.txt'), 'VICTIM\n', 'raw/add.1.txt') };
    });
    refusedRow('N21', 'raw/ mode 0000 (empty): exit 2, "raw is not readable", 0 spawns', true, (R, lock) => {
        const o = join(R.S, 'o21'); mkdirSync(join(o, 'raw'), { recursive: true }); lock(join(o, 'raw'), 0o000);
        return { out: o, text: RD(o) };
    });
    refusedRow('N22', 'raw/ mode 0600 (empty, no x): exit 2, "raw is not readable", 0 spawns', true, (R, lock) => {
        const o = join(R.S, 'o22'); mkdirSync(join(o, 'raw'), { recursive: true }); lock(join(o, 'raw'), 0o600);
        return { out: o, text: RD(o) };
    });
    refusedRow('N23', 'raw -> symlink to a 0300 dir holding a file: exit 2, "raw is not readable", 0 spawns, file bytes unchanged', true, (R, lock) => {
        const o = join(R.S, 'o23'); mkdirSync(o);
        const tgt = join(R.S, 'locked23'); mkdirSync(tgt); writeFileSync(join(tgt, 'add.1.txt'), 'VICTIM\n'); lock(tgt, 0o300);
        symlinkSync(tgt, join(o, 'raw'));
        return { out: o, text: RD(o), check: () => keep(join(tgt, 'add.1.txt'), 'VICTIM\n', 'locked/add.1.txt') };
    });
    // N24-N26 (MD-34): report.txt is a symlink, live or dangling; refused, the target untouched / not created, no OUT/raw.
    refusedRow('N24', 'report.txt a live symlink to S/target ("KEEP"): exit 2, "is a symlink", 0 spawns, target stays "KEEP", no raw/', false, (R) => {
        const o = join(R.S, 'o24'); mkdirSync(o);
        writeFileSync(join(R.S, 'target'), 'KEEP\n'); symlinkSync(join(R.S, 'target'), join(o, 'report.txt'));
        return { out: o, text: SYM(o), check: () => { keep(join(R.S, 'target'), 'KEEP\n', 'target'); assert.equal(existsSync(join(o, 'raw')), false, 'no OUT/raw'); } };
    });
    refusedRow('N25', 'report.txt a dangling relative symlink inside OUT (MD-34): exit 2, "is a symlink", 0 spawns, target not created, no raw/', false, (R) => {
        const o = join(R.S, 'o25'); mkdirSync(o); symlinkSync('newfile', join(o, 'report.txt'));
        return { out: o, text: SYM(o), check: () => { assert.equal(existsSync(join(o, 'newfile')), false, 'target not created'); assert.deepEqual(readdirSync(o), ['report.txt']); } };
    });
    refusedRow('N26', 'report.txt a dangling symlink into a missing dir: exit 2, "is a symlink", 0 spawns, no raw/, dir not created', false, (R) => {
        const o = join(R.S, 'o26'); mkdirSync(o);
        symlinkSync(join(R.S, 'missing', 'x'), join(o, 'report.txt'));
        return { out: o, text: SYM(o), check: () => { assert.equal(existsSync(join(R.S, 'missing')), false, 'missing dir not created'); assert.equal(existsSync(join(o, 'raw')), false, 'no OUT/raw'); } };
    });

    // N27 control [mutant `-L` -> `-e`]: a REGULAR existing report.txt and no raw/ is fine.
    test(`${k} N27 control: regular report.txt, no raw/ -> exit 0, report rewritten, raw/ created`, { skip }, () => {
        const R = rig(T);
        try {
            const o = join(R.S, 'o27'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n');
            const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', o, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 0, r.out);
            const rep = readFileSync(join(o, 'report.txt'), 'utf8');
            assert.ok(rep.length > 0 && rep !== 'old\n', `report.txt rewritten, got ${JSON.stringify(rep)}`);
            assert.ok(statSync(join(o, 'raw')).isDirectory(), 'raw/ exists');
            assert.ok(R.spawns().length >= 2, `spawns >= 2, got ${R.spawns().length}`);
        } finally { rmAll(R.S); }
    });

    // N28 [bb mutant: drop `2>/dev/null` on the node-dir cd; dd: control, it refuses a newline in --node earlier]: the real fake
    // sits in <S>/"nl<newline>"/node; $(dirname) strips the newline, so the cd names <S>/nl, which does not exist.
    test(`${k} N28${T.dd ? ' (control)' : ''} --node "<S>/nl<newline>/node": exit 2, one ${T.dd ? '"a newline is not allowed"' : '"cannot resolve the directory of"'} line, no raw "cd:" line, 0 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            const nd = `${R.S}/nl\n/node`;
            mkNode(nd, 'nl', R.log, T);
            const r = run(T.script, ['--fn', 'add', '--node', nd, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
            assert.equal(r.status, 2, r.out);
            const want = T.dd ? 'a newline is not allowed' : 'cannot resolve the directory of';
            assert.equal(r.lines.filter((l) => l.startsWith(P) && l.includes(want)).length, 1, `exactly one "${want}" line\n${r.out}`);
            assert.equal(r.lines.filter((l) => /(^|[ :])cd: /.test(l)).length, 0, `no raw "cd:" line\n${r.out}`);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    // N29 [bb mutant: drop -w; dd mutant: no walk]: raw/ 0500 (r-x, empty) cannot take before/after or the raw files.
    refusedRow('N29', 'raw/ mode 0500 (empty): exit 2, ' + (T.dd ? '"cannot create ... (<OUT>/raw is not a writable directory)"' : '"raw is not writable"') + ', 0 spawns', true, (R, lock) => {
        const o = join(R.S, 'o29'); mkdirSync(join(o, 'raw'), { recursive: true }); lock(join(o, 'raw'), 0o500);
        return { out: o, text: T.dd ? WALK(o, `${o}/raw`) : WRB(o) };
    });
    // N30-N32: bb controls (its own mkdir -p refuses with "cannot create <OUT>/raw" before any spawn); dd refuses by the walk.
    refusedRow('N30', (T.dd ? '' : '(control) ') + 'absent OUT under a 0555 parent: exit 2, ' + (T.dd ? '"cannot create ... (<parent> is not a writable directory)"' : '"cannot create <OUT>/raw"') + ', 0 spawns, OUT not created', true, (R, lock) => {
        const ro = join(R.S, 'ro30'); mkdirSync(ro); lock(ro, 0o555);
        const o = join(ro, 'new');
        return { out: o, text: T.dd ? WALK(o, ro) : `--out: cannot create ${o}/raw`, check: () => assert.equal(existsSync(o), false, 'OUT not created') };
    });
    refusedRow('N31', (T.dd ? '' : '(control) ') + 'OUT a dangling symlink: exit 2, ' + (T.dd ? '"cannot create ... (<OUT> is not a writable directory)"' : '"cannot create <OUT>/raw"') + ', 0 spawns, link target not created', false, (R) => {
        const o = join(R.S, 'dang31'); symlinkSync(join(R.S, 'nowhere31'), o);
        return { out: o, text: T.dd ? WALK(o, o) : `--out: cannot create ${o}/raw`, check: () => assert.equal(existsSync(join(R.S, 'nowhere31')), false, 'link target not created') };
    });
    refusedRow('N32', (T.dd ? '' : '(control) ') + 'OUT mode 0555 with a writable report.txt, no raw/: exit 2, ' + (T.dd ? '"cannot create ... (<OUT> is not a writable directory)"' : '"cannot create <OUT>/raw"') + ', 0 spawns, no raw/', true, (R, lock) => {
        const o = join(R.S, 'o32'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n'); lock(o, 0o555);
        return { out: o, text: T.dd ? WALK(o, o) : `--out: cannot create ${o}/raw`, check: () => { assert.equal(existsSync(join(o, 'raw')), false, 'no raw/'); keep(join(o, 'report.txt'), 'old\n', 'report.txt'); } };
    });

    // N33 control [dd mutant: immediate parent only]: an absent NESTED OUT (S/new/a/b) and a bare relative `--out o` both succeed.
    test(`${k} N33 control: absent nested OUT S/new/a/b and bare relative --out o -> exit 0, report.txt + raw/ written`, { skip }, () => {
        const R = rig(T);
        try {
            const nested = join(R.S, 'new', 'a', 'b');
            for (const [out, dir] of [[nested, nested], ['o', join(R.cwd, 'o')]]) {
                const r = run(T.script, ['--fn', 'add', '--node', R.fk, '--out', out, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                assert.equal(r.status, 0, `--out ${out}\n${r.out}`);
                assert.ok(statSync(join(dir, 'report.txt')).size > 0, `${dir}/report.txt non-empty`);
                assert.ok(statSync(join(dir, 'raw')).isDirectory(), `${dir}/raw exists`);
                if (T.dd) { assert.ok(existsSync(join(dir, 'raw', 'before')) && existsSync(join(dir, 'raw', 'after')), 'raw/before + raw/after'); }
            }
        } finally { rmAll(R.S); }
    });

    // N34-N36 (A8; engine review b3-review r1 NITS): the dd walk's three guards, each with a mutant that used to survive.
    // dd walk: `while [[ ! -e U && ! -L U && U != . ]]` then `[[ -d U && -w U && -x U ]] || die`. bb has no walk: its mkdir -p
    // refuses with "cannot create <OUT>/raw" (the N30 control text), so each bb row is a CONTROL pinning that existing refusal
    // (exit 2, that one line, 0 spawns), verified against the live bb root before writing; it asserts nothing the walk adds.
    // N34 [dd mutant: drop `&& U != .` -> infinite loop -> the 10 s cap fails the row by name, "dd N34 run timed out after 10000 ms"]: cwd mode 0000 + relative `--out o`.
    // The cwd is locked from INSIDE the spawn (`cd D && chmod 000 .`), because spawnSync cannot chdir into a 0000 dir.
    test(`${k} N34${T.dd ? '' : ' (control)'} cwd mode 0000 + relative --out o: exit 2, ${T.dd ? '"(. is not a writable directory)"' : '"cannot create o/raw"'}, 0 spawns, no hang`, { skip: rootSkip }, () => {
        const R = rig(T);
        try {
            const dv = join(R.S, 'driver.mjs'); writeFileSync(dv, ''); // the driver lives OUTSIDE the locked cwd
            const args = ['--fn', 'add', '--node', R.fk, '--out', 'o', ...drvArgs(T, dv)];
            // capSync throws by name on the 10 s cap (the N34 mutant's hang); the finally unlocks the cwd before that throw propagates
            let r0;
            try { r0 = capSync(BASH, ['-c', 'cd "$1" && chmod 000 . && shift && exec "$@"', 'x', R.cwd, BASH, T.script, ...args], { encoding: 'utf8', env: R.env }, 10000, `${k} N34 run`); } finally { try { chmodSync(R.cwd, 0o755); } catch {} }
            assert.equal(r0.error, undefined, `no timeout / spawn error: ${r0.error}`);
            const out = (r0.stdout || '') + (r0.stderr || '');
            const want = T.dd ? `${P} ${WALK('o', '.')}` : `${P} --out: cannot create o/raw`;
            assert.equal(r0.status, 2, out);
            assert.equal(out.split('\n').filter((l) => l === want).length, 1, `exactly one line "${want}"\n${out}`);
            assert.equal(R.spawns().length, 0, `0 spawns, got:\n${R.spawns().join('\n')}\n${out}`);
        } finally { try { chmodSync(R.cwd, 0o755); } catch {} rmAll(R.S); }
    });
    // N35 [dd mutant: drop `-x U`]: OUT an existing dir of mode 0600 (r/w, no search).
    refusedRow('N35', (T.dd ? '' : '(control) ') + 'OUT an existing dir of mode 0600: exit 2, ' + (T.dd ? '"cannot create ... (<OUT> is not a writable directory)"' : '"cannot create <OUT>/raw"') + ', 0 spawns', true, (R, lock) => {
        const o = join(R.S, 'o35'); mkdirSync(o); lock(o, 0o600);
        return { out: o, text: T.dd ? WALK(o, o) : `--out: cannot create ${o}/raw` };
    });
    // N36 [dd mutant: drop `-d U`]: `--out <S>/fx/o` where fx is a regular 0755 file (the first existing ancestor is not a directory).
    refusedRow('N36', (T.dd ? '' : '(control) ') + '--out S/fx/o, fx a regular 0755 file: exit 2, ' + (T.dd ? '"cannot create ... (<S>/fx is not a writable directory)"' : '"cannot create <OUT>/raw"') + ', 0 spawns', false, (R) => {
        const fx = join(R.S, 'fx'); writeFileSync(fx, 'x\n'); chmodSync(fx, 0o755);
        const o = join(fx, 'o');
        return { out: o, text: T.dd ? WALK(o, fx) : `--out: cannot create ${o}/raw`, check: () => keep(fx, 'x\n', 'fx') };
    });

    // N37 (A9; engine review b4-review r1): no --node, NODE unset, PATH = "<S>/p/x<newline>:<fake dir>:/usr/bin:/bin". `command -v node`
    // finds "<S>/p/x<newline>/node" (executable fake); $(dirname) strips the newline, so the node-dir cd names <S>/p/x, which does not
    // exist. Post-fix contract for BOTH tools: exit 2, 0 spawns, ONE "node binary: cannot resolve the directory of <S>/p/x<newline>/node"
    // die (the printed path keeps its newline), NO raw "cd:" line. bb: control (2>/dev/null since B2). dd: red on 457687ec (raw cd: line)
    // until gA2 B4 r2 adds `2>/dev/null` to dd's node-dir cd.
    test(`${k} N37${T.dd ? '' : ' (control)'} PATH entry "<S>/p/x<newline>" holds node, no --node / NODE: exit 2, one "cannot resolve the directory of" die, no raw "cd:" line, 0 spawns`, { skip }, () => {
        const R = rig(T);
        try {
            const nd = `${R.S}/p/x\n/node`;
            mkNode(nd, 'nl', R.log, T);
            const env = baseEnv({ PATH: `${R.S}/p/x\n:${dirname(R.fk)}:/usr/bin:/bin` });
            const r = run(T.script, ['--fn', 'add', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env });
            assert.equal(r.status, 2, r.out);
            const want = `${P} node binary: cannot resolve the directory of ${nd}\n`;
            assert.equal(r.out.split(want).length - 1, 1, `exactly one die "${want}"\n${r.out}`);
            assert.equal(r.out.split('cannot resolve the directory of').length - 1, 1, `no other "cannot resolve" line\n${r.out}`);
            assert.equal(r.lines.filter((l) => /(^|[ :])cd: /.test(l)).length, 0, `no raw "cd:" line\n${r.out}`);
            assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
        } finally { rmAll(R.S); }
    });

    // ---------------------------------------------------------------------------------------------------------------
    // gB B-four dd B3 + bb B3 (PLAN-ext-audit-gB-four-dd.md TASK 7 + D1, PLAN-ext-audit-gB-four-bb.md TASK 6; MD-47, MD-48). Both tools:
    // the alloc-style refusals ported to deopt-diff and bytecode-budget. Expected texts are the reference allocation-diff.sh arms
    // (MD-36 / MD-37 / MD-38 and the v8-flags arms), prefixed with the tool's own "<label>:" (bb without alloc's "; a --require one ..." clause).
    // MD-46 G2 rung 1: dd (T.v8fl) MOD-ok / EVAL-ok become MD51-MOD / MD51-EVAL refusals (+2 flipped) and gains F15-blob / F15-build / F15-ossl / V8-ok / RETv8 (+5 new): 7 dd rows red on the frozen b35-g2 dd root.
    // MD-46 G3 rung 2: bb (T.v8fl) gets the same MD51-MOD / MD51-EVAL flip and F15-blob / F15-build / F15-ossl / V8-ok / RETv8 (V8-ok / RETv8 keyed per
    // tool: bb reads --v8-options twice and has no SAME verdict): 7 bb rows red on the frozen b35-g3 bb root
    // (4e364c6 / a2449a09: MD51-MOD MD51-EVAL F15-blob F15-build F15-ossl V8-ok RETv8); bb's other 67 rows green there.
    // Red on the frozen dd (HEAD 716daa9): MD36a MD36b MD36n MD37a MD38 ENV MOD EVAL RET. Controls (green on frozen): MD37c MOD-r MOD-ok EVAL-ep EVAL-ok.
    // Red on the frozen bb (HEAD 716daa9 / bb c3dc7772): the same set plus MD38n. MD38n for dd is a control (dd's own --node newline gate).
    // bb MD-37 carries the MD-48 `-f` guard: a directory report.txt still reads "cannot write" (row M1), not "has another hard link".
    // bb EVAL uses --print-opt-code (EVALS has no --print-bytecode: bb's own *print-bytecode* refusal fires first).
    // RET decision (D1-2): RED on frozen (all A4 classes, 0 spawns per refused input), not restricted to already-refused inputs.
    // ---------------------------------------------------------------------------------------------------------------
    {
        const dieOnce = (r, want, what) => {
            assert.equal(r.status, 2, `${what}: exit 2\n${r.out}`);
            assert.equal(r.lines.filter((l) => l === want).length, 1, `${what}: exactly one line "${want}"\n${r.out}`);
        };
        const SYM = (o) => `${P} --out: ${o}/raw is a symlink (refused: the writes would follow it)`;
        const HARD = (o) => `${P} --out: ${o}/report.txt has another hard link (refused: the write would change that file too)`;
        const MODT = (f) => `${P} --v8-flags must not set ${f}: it loads a module of yours into the measured process (a preload or a module loader)`;
        const ENVT = (f) => `${P} --v8-flags must not set ${f}: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process`;
        const EVALT = (f) => `${P} --v8-flags must not set ${f}: it runs code of yours in the measured process instead of the driver (--eval / --print: node evaluates it and the driver becomes argv), or prints V8 internals into the measured run (V8's --print-* flags)`;
        const MODS = ['--require=F', '--require', '--import=F', '--import', '--loader=F', '--experimental-loader=F', '--experimental_loader=F'];
        const ENVS = ['--env-file=F', '--env-file', '--env_file=F', '--experimental-config-file=F', '--experimental-default-config-file'];
        const EVALS = ['--eval=1', '--eval', '--print=1', '--print', '--print-opt-code', '--print_opt_code'];
        const flagArgs = (R, f, d) => ['--fn', 'add', '--node', R.fk, '--v8-flags', f, ...drvArgs(T, d)];
        const flagRow = (id, desc, flags, textOf) => test(`${k} ${id} ${desc}`, { skip }, () => {
            const R = rig(T);
            try {
                const d = R.drv('driver.mjs');
                for (const f of flags) {
                    const r = run(T.script, flagArgs(R, f, d), { cwd: R.cwd, env: R.env });
                    dieOnce(r, textOf(f), f);
                    assert.equal(R.spawns().length, 0, `${f}: 0 spawns, got:\n${R.spawns().join('\n')}\n${r.out}`);
                }
            } finally { rmAll(R.S); }
        });
        // Setup shared by the MD-36 / MD-37 rows and RET: returns the OUT dir `o` (under dir `at`) prepared for the class.
        const mkSym = (R, at) => { const o = join(at, 'o'); mkdirSync(join(R.S, 'ext'), { recursive: true }); mkdirSync(o, { recursive: true }); symlinkSync(join(R.S, 'ext'), join(o, 'raw')); return o; };
        const mkDangling = (R, at) => { const o = join(at, 'o'); mkdirSync(o, { recursive: true }); symlinkSync(join(R.S, 'nowhere'), join(o, 'raw')); return o; };
        const mkHard = (R, at) => { const o = join(at, 'o'); mkdirSync(o, { recursive: true }); writeFileSync(join(R.S, 'h'), 'KEEP\n'); linkSync(join(R.S, 'h'), join(o, 'report.txt')); return o; };
        const outArgs = (R, o, d) => ['--fn', 'add', '--node', R.fk, '--out', o, ...drvArgs(T, d)];

        test(`${k} MD36a raw/ is a symlink to an EMPTY dir: exit 2, "raw is a symlink", 0 spawns, target stays empty`, { skip }, () => {
            const R = rig(T);
            try {
                const o = mkSym(R, R.S);
                const r = run(T.script, outArgs(R, o, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                dieOnce(r, SYM(o), 'MD36a');
                assert.deepEqual(readdirSync(join(R.S, 'ext')), [], 'S/ext stays empty');
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            } finally { rmAll(R.S); }
        });
        test(`${k} MD36b raw/ is a DANGLING symlink: exit 2, "raw is a symlink", 0 spawns, target not created`, { skip }, () => {
            const R = rig(T);
            try {
                const o = mkDangling(R, R.S);
                const r = run(T.script, outArgs(R, o, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                dieOnce(r, SYM(o), 'MD36b');
                assert.equal(existsSync(join(R.S, 'nowhere')), false, 'S/nowhere not created');
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            } finally { rmAll(R.S); }
        });
        // D1-1: a symlink to a NON-empty dir must read "is a symlink" (not "is not empty"): kills a mutant that moves MD-36 after `ls -A` (P36).
        test(`${k} MD36n raw/ is a symlink to a NON-empty dir: exit 2, "raw is a symlink" (not "is not empty"), 0 spawns, file unchanged`, { skip }, () => {
            const R = rig(T);
            try {
                const o = mkSym(R, R.S);
                writeFileSync(join(R.S, 'ext', 'x'), 'VICTIM\n');
                const r = run(T.script, outArgs(R, o, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                dieOnce(r, SYM(o), 'MD36n');
                assert.equal(readFileSync(join(R.S, 'ext', 'x'), 'utf8'), 'VICTIM\n', 'S/ext/x bytes unchanged');
                assert.deepEqual(readdirSync(join(R.S, 'ext')), ['x'], 'S/ext holds only x');
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            } finally { rmAll(R.S); }
        });
        test(`${k} MD37a report.txt has a second hard link S/h ("KEEP"): exit 2, "has another hard link", 0 spawns, S/h unchanged`, { skip }, () => {
            const R = rig(T);
            try {
                const o = mkHard(R, R.S);
                const r = run(T.script, outArgs(R, o, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                dieOnce(r, HARD(o), 'MD37a');
                assert.equal(readFileSync(join(R.S, 'h'), 'utf8'), 'KEEP\n', 'S/h bytes unchanged');
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            } finally { rmAll(R.S); }
        });
        test(`${k} MD37c (control) report.txt with a single link is accepted: exit 0, >= 2 spawns, no "hard link" line`, { skip }, () => {
            const R = rig(T);
            try {
                const o = join(R.S, 'o'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n');
                const r = run(T.script, outArgs(R, o, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                assert.equal(r.status, 0, r.out);
                assert.ok(!r.out.includes('hard link'), r.out);
                assert.ok(R.spawns().length >= 2, `spawns >= 2, got ${R.spawns().length}\n${r.out}`);
            } finally { rmAll(R.S); }
        });
        // MD38: no --node / NODE; the only node is on PATH in "<S>/p/a<NL>b" (--node cannot reach this check: the "--fn / --v8-flags / --out / --node" newline gate refuses it first).
        test(`${k} MD38 PATH entry "<S>/p/a<newline>b" holds the node: exit 2, "a newline is not allowed in the resolved path", 0 spawns`, { skip }, () => {
            const R = rig(T);
            try {
                mkNode(`${R.S}/p/a\nb/node`, 'nl', R.log, T);
                const env = baseEnv({ PATH: `${R.S}/p/a\nb:/usr/bin:/bin` });
                const r = run(T.script, ['--fn', 'add', ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env });
                dieOnce(r, `${P} node binary: a newline is not allowed in the resolved path`, 'MD38');
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            } finally { rmAll(R.S); }
        });
        // MD38n: --node "<S>/a<NL>b/node" (an existing fake). bb: MD-38 line (red on the frozen bb). dd: control, dd's own --node newline gate.
        test(`${k} MD38n --node "<S>/a<newline>b/node": exit 2, ${T.dd ? '(control) the --fn / --v8-flags / --out / --node newline refusal' : '"a newline is not allowed in the resolved path"'}, 0 spawns`, { skip }, () => {
            const R = rig(T);
            try {
                const nd = `${R.S}/a\nb/node`;
                mkNode(nd, 'nl', R.log, T);
                const r = run(T.script, ['--fn', 'add', '--node', nd, ...drvArgs(T, R.drv('driver.mjs'))], { cwd: R.cwd, env: R.env });
                dieOnce(r, T.dd ? `${P} --fn / --v8-flags / --out / --node: a newline is not allowed` : `${P} node binary: a newline is not allowed in the resolved path`, 'MD38n');
                assert.equal(R.spawns().length, 0, R.spawns().join('\n'));
            } finally { rmAll(R.S); }
        });
        flagRow('ENV', '--v8-flags env-file / config-file forms: exit 2, the "loads environment variables" die, 0 spawns', ENVS, ENVT,);
        flagRow('MOD', '--v8-flags --require / --import / --loader / --experimental-loader forms (also underscore): exit 2, the "loads a module of yours" die, 0 spawns', MODS, MODT,);
        // MOD-r / EVAL-ep: the letter gate ("each starts with -- and a letter") already refuses the short forms (no new arm).
        flagRow('MOD-r', '(control) --v8-flags -r: refused by the letter gate, 0 spawns', ['-r'], (f) => `${P} --v8-flags takes flags only (each starts with -- and a letter), got '${f}'`);
        // MD-51 (every tool in TOOLS; a future v8fl:false tool gets red rows = fails closed): a node option is not a V8 flag of this node's --v8-options list -> refused after --version + one --v8-options read.
        // bb only (PLAN-md46 G3 ASSERTION A1): the line VERDICT NO-VERDICT once (in stdout + stderr joined) and 0 stdout bytes are pinned too.
        // stderr is NOT pinned exactly (A1 says "stderr exactly the die line + `VERDICT NO-VERDICT`"; run() joins stdout + stderr, so an
        // extra stderr line passes). dd: G2 A2 and dd -h state neither, so dd rows pin only the die / spawns / probes.
        const V8DIE = (f) => `${P} --v8-flags must not set ${f}: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)`;
        const V8SPAWNS = (R) => [`fk|${R.cwd}|--version`, `fk|${R.cwd}|--v8-options`];
        const v8Refused = (id, desc, f) => test(`${k} ${id} ${desc}: exit 2, the allowlist die once${T.dd ? '' : ', VERDICT NO-VERDICT once, 0 stdout bytes'}, spawns == [--version, --v8-options], 0 probes`, { skip }, () => {
            const R = rig(T);
            try {
                const r = run(T.script, flagArgs(R, f, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                dieOnce(r, V8DIE(f), f);
                if (!T.dd) {
                    assert.equal(r.lines.filter((l) => l === 'VERDICT NO-VERDICT').length, 1, `exactly one "VERDICT NO-VERDICT"\n${r.out}`);
                    assert.equal(r.stdout, '', `0 stdout bytes\n${r.out}`);
                }
                assert.deepEqual(R.spawns(), V8SPAWNS(R), r.out);
                assert.equal(R.probes().length, 0, R.probes().join('\n'));
            } finally { rmAll(R.S); }
        });
        v8Refused('MD51-MOD', '--v8-flags --experimental-require-module', '--experimental-require-module');
        flagRow('EVAL', '--v8-flags --eval / --print / --print-* forms (also underscore): exit 2, the MD-47 "runs code of yours" die, 0 spawns', EVALS, EVALT,);
        flagRow('EVAL-ep', '(control) --v8-flags -e / -p: refused by the letter gate, 0 spawns', ['-e', '-p'], (f) => `${P} --v8-flags takes flags only (each starts with -- and a letter), got '${f}'`);
        v8Refused('MD51-EVAL', '--v8-flags --experimental-print-required-tla', '--experimental-print-required-tla');
        if (T.v8fl) {
            // MD-52..58 (F15): file / snapshot / ssl node options are refused by the allowlist (none is a V8 flag of this node).
            v8Refused('F15-blob', '--v8-flags --snapshot-blob=F', '--snapshot-blob=F');
            v8Refused('F15-build', '--v8-flags --build-snapshot', '--build-snapshot');
            v8Refused('F15-ossl', '--v8-flags --openssl-config=F', '--openssl-config=F');
            // V8-ok control. dd: three V8 tuning flags listed by this node's --v8-options -> accepted, VERDICT SAME, exactly one
            // --v8-options read. bb: --expose-gc (a listed bool) -> accepted, VERDICT REPORTED, spawns start [--version, --v8-options
            // (allowlist), --v8-options (limits)], >= 1 probe; the limits line from the fixture's node 26 defaults, no ASSUMED NOTE.
            const V8OK = T.dd ? '--allow-natives-syntax --no-lazy-feedback-allocation --max-inlined-bytecode-size=30' : '--expose-gc';
            const BBLIM = 'limits  TurboFan small<=30 (<=75 if a HeapNumber may cross) single<=460 | Maglev eager (greedy small)<30 small<=27 single<100';
            test(`${k} V8-ok (control) ${T.dd ? 'three listed V8 tuning flags: exit 0, VERDICT SAME, exactly 1 --v8-options spawn' : '--expose-gc: exit 0, VERDICT REPORTED, spawns [--version, --v8-options, --v8-options, probes...], >= 1 probe, fixture limits line, no NOTE'}`, { skip }, () => {
                const R = rig(T);
                try {
                    const r = run(T.script, flagArgs(R, V8OK, R.drv('driver.mjs')), { cwd: R.cwd, env: R.env });
                    assert.equal(r.status, 0, r.out);
                    if (T.dd) {
                        assert.ok(r.lines.includes('VERDICT SAME'), r.out);
                        assert.equal(R.spawns().filter((l) => l.endsWith('|--v8-options')).length, 1, R.spawns().join('\n'));
                    } else {
                        assert.ok(r.lines.includes('VERDICT REPORTED'), r.out);
                        assert.deepEqual(R.spawns().slice(0, 3), [...V8SPAWNS(R), `fk|${R.cwd}|--v8-options`], R.spawns().join('\n'));
                        assert.equal(R.spawns().filter((l) => l.endsWith('|--v8-options')).length, 2, R.spawns().join('\n'));
                        assert.ok(R.probes().length >= 1, `probes >= 1, got ${R.probes().length}\n${r.out}`);
                        assert.equal(r.lines.filter((l) => l === BBLIM).length, 1, `exactly one "${BBLIM}"\n${r.out}`);
                        assert.ok(!r.out.includes('ASSUMED'), r.out);
                    }
                } finally { rmAll(R.S); }
            });
            // RETv8: refusal and accept paths leak no TMPDIR entry over 20 cycles (regression pin). It sees only TMPDIR-honouring
            // leaks: a bare macOS `mktemp -d` ignores TMPDIR and would survive unseen (the A4 retention row below says the same).
            test(`${k} RETv8 20 cycles of V8-ok${T.dd ? '' : ' (--expose-gc)'} + F15-blob leave TMPDIR empty`, { skip }, () => {
                const R = rig(T);
                try {
                    const tmp = join(R.S, 'tmp'); mkdirSync(tmp);
                    const env = { ...R.env, TMPDIR: tmp };
                    const d = R.drv('driver.mjs');
                    for (let c = 0; c < 20; c++) {
                        assert.equal(run(T.script, flagArgs(R, V8OK, d), { cwd: R.cwd, env }).status, 0, `cycle ${c}: V8-ok exit 0`);
                        assert.equal(run(T.script, flagArgs(R, '--snapshot-blob=F', d), { cwd: R.cwd, env }).status, 2, `cycle ${c}: F15-blob exit 2`);
                        assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
                    }
                } finally { rmAll(R.S); }
            });
        }

        // RET (A4 retention, D1-2: red on frozen). 20 cycles of the MD36a / MD36b / MD37a / ENV / MOD / EVAL inputs with TMPDIR=<S>/tmp:
        // 0 TMPDIR entries after every cycle, S/ext empty, S/h = "KEEP", S/nowhere absent, and 0 spawns in total.
        test(`${k} RET 20 cycles of the MD36a / MD36b / MD37a / ENV / MOD / EVAL inputs leave TMPDIR empty, S/ext empty, S/h = KEEP, 0 spawns`, { skip }, () => {
            const R = rig(T);
            try {
                const tmp = join(R.S, 'tmp'); mkdirSync(tmp);
                const env = { ...R.env, TMPDIR: tmp };
                const d = R.drv('driver.mjs');
                for (let c = 0; c < 20; c++) {
                    const sub = (n) => { const p = join(R.S, `c${c}-${n}`); mkdirSync(p); return p; };
                    const inputs = [
                        outArgs(R, mkSym(R, sub('a')), d),
                        outArgs(R, mkDangling(R, sub('b')), d),
                        outArgs(R, mkHard(R, sub('c')), d),
                        flagArgs(R, '--env-file=F', d), flagArgs(R, '--require=F', d), flagArgs(R, '--eval=1', d),
                    ];
                    for (const a of inputs) assert.equal(run(T.script, a, { cwd: R.cwd, env }).status, 2, `cycle ${c}: exit 2 for ${a.join(' ')}`);
                    assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
                    assert.deepEqual(readdirSync(join(R.S, 'ext')), [], `cycle ${c}: S/ext not empty`);
                    assert.equal(readFileSync(join(R.S, 'h'), 'utf8'), 'KEEP\n', `cycle ${c}: S/h changed`);
                    assert.equal(existsSync(join(R.S, 'nowhere')), false, `cycle ${c}: S/nowhere created`);
                    assert.equal(R.spawns().length, 0, `cycle ${c}: 0 spawns, got:\n${R.spawns().join('\n')}`);
                }
            } finally { rmAll(R.S); }
        });
    }

    // ---------------------------------------------------------------------------------------------------------------
    // A4 retention: 20 cycles of the B1b (x2) / B4B (x4) / M1 / N16 (+ dd N12) + gA2 N20 / N24 / N29 / N31 inputs with TMPDIR=<S>/tmp leave 0 entries after each
    // cycle. Regression pin (a refusal path must not leak a mktemp dir); a bare macOS `mktemp -d` ignores TMPDIR, so
    // this pins TMPDIR-honouring leaks only.
    // ---------------------------------------------------------------------------------------------------------------
    test(`${k} A4 retention: 20 cycles of B1b / B4B / M1 / N16${T.dd ? ' / N12' : ''} / N20 / N24 / N29 / N31 leave TMPDIR empty and cwd + elsewhere/ unchanged`, { skip }, () => {
        const R = rig(T);
        try {
            const tmp = join(R.S, 'tmp'); mkdirSync(tmp);
            const d = R.drv('driver.mjs');
            const env = { ...R.env, TMPDIR: tmp };
            writeFileSync(join(R.cwd, 'plain'), '#!/bin/sh\n'); chmodSync(join(R.cwd, 'plain'), 0o644);
            mkdirSync(join(R.S, 'nodedir'));
            // B3b additions (PLAN A4): the N16 inputs (real driver elsewhere, decoy in cwd) and, for dd, the N12 input.
            mkdirSync(join(R.S, 'elsewhere', 'sub'), { recursive: true });
            symlinkSync(join(R.S, 'elsewhere', 'sub'), join(R.cwd, 'link'));
            writeFileSync(join(R.S, 'elsewhere', 'd.mjs'), '// real\n');
            writeFileSync(join(R.cwd, 'd.mjs'), '// decoy, different bytes\n');
            // gA2 (A4): per-cycle inputs N20 (raw 0300 + victim), N24 (report.txt symlink to elsewhere/target), N29 (raw 0500), N31 (OUT dangling
            // symlink into elsewhere/nowhere). Locked dirs are chmod'ed back after every cycle (and in finally), so none is left at 0300 / 0500.
            const asRoot = !!(process.getuid && process.getuid() === 0);
            writeFileSync(join(R.S, 'elsewhere', 'target'), 'KEEP\n');
            const locked = [];
            const cwdLs = readdirSync(R.cwd).sort().join(','), elseLs = readdirSync(join(R.S, 'elsewhere'), { recursive: true }).sort().join(',');
            for (let c = 0; c < 20; c++) {
                const inputs = [
                    ['--node', 'true'], ['--node', join(R.S, 'nodedir')], ['--node', './plain'],
                    ...['---max-inlined-bytecode-size=30', '---no-max-inlined-bytecode-size', '--=1', '--1x'].map((f) => ['--node', R.fk, '--v8-flags', f]),
                ].map((x) => ['--fn', 'add', ...x, ...drvArgs(T, d)]);
                const m1 = join(R.S, `m1-${c}`);
                mkdirSync(join(m1, 'report.txt'), { recursive: true });
                inputs.push(['--fn', 'add', '--node', R.fk, '--out', m1, ...drvArgs(T, d)]);
                if (T.dd && !(process.getuid && process.getuid() === 0)) {
                    const ro = join(R.S, `ro-${c}`); mkdirSync(ro); chmodSync(ro, 0o555);
                    inputs.push(['--fn', 'add', '--node', R.fk, '--out', ro, ...drvArgs(T, d)]);
                }
                const bad = 'link/../d.mjs';
                inputs.push(['--fn', 'add', '--node', R.fk, ...(T.dd ? [bad, d] : [bad])]);                   // N16a (bb) / N16b (dd)
                inputs.push(['--fn', 'add', '--node', R.fk, ...(T.dd ? [d, bad] : ['--diff', d, bad])]);       // N16c
                if (!T.dd) inputs.push(['--fn', 'add', '--node', R.fk, '--diff', bad, d]);                      // N16b (bb)
                if (T.dd && !(process.getuid && process.getuid() === 0)) {
                    const n12 = join(R.S, `n12-${c}`); mkdirSync(n12);
                    writeFileSync(join(n12, 'report.txt'), 'old\n'); chmodSync(join(n12, 'report.txt'), 0o444);
                    inputs.push(['--fn', 'add', '--node', R.fk, '--out', n12, ...drvArgs(T, d)]);
                }
                const g = join(R.S, `ga2-${c}`); mkdirSync(g);
                const o20 = join(g, 'o20'), o24 = join(g, 'o24'), o29 = join(g, 'o29'), o31 = join(g, 'o31');
                mkdirSync(o24); symlinkSync(join(R.S, 'elsewhere', 'target'), join(o24, 'report.txt'));
                symlinkSync(join(R.S, 'elsewhere', 'nowhere'), o31);
                inputs.push(['--fn', 'add', '--node', R.fk, '--out', o24, ...drvArgs(T, d)], ['--fn', 'add', '--node', R.fk, '--out', o31, ...drvArgs(T, d)]);
                if (!asRoot) {
                    mkdirSync(join(o20, 'raw'), { recursive: true }); writeFileSync(join(o20, 'raw', 'add.1.txt'), 'VICTIM\n'); chmodSync(join(o20, 'raw'), 0o300); locked.push(join(o20, 'raw'));
                    mkdirSync(join(o29, 'raw'), { recursive: true }); chmodSync(join(o29, 'raw'), 0o500); locked.push(join(o29, 'raw'));
                    inputs.push(['--fn', 'add', '--node', R.fk, '--out', o20, ...drvArgs(T, d)], ['--fn', 'add', '--node', R.fk, '--out', o29, ...drvArgs(T, d)]);
                }
                for (const a of inputs) run(T.script, a, { cwd: R.cwd, env });
                for (const p of locked) chmodSync(p, 0o755); // back first: nothing may be left at 0300 / 0500, and the reads below need it
                if (!asRoot) assert.equal(readFileSync(join(o20, 'raw', 'add.1.txt'), 'utf8'), 'VICTIM\n', `cycle ${c}: N20 victim bytes changed`);
                assert.equal(readFileSync(join(R.S, 'elsewhere', 'target'), 'utf8'), 'KEEP\n', `cycle ${c}: N24 target changed`);
                assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
                assert.equal(readdirSync(R.cwd).sort().join(','), cwdLs, `cycle ${c}: cwd listing changed`);
                assert.equal(readdirSync(join(R.S, 'elsewhere'), { recursive: true }).sort().join(','), elseLs, `cycle ${c}: elsewhere/ listing changed`);
            }
            assert.equal(readdirSync(R.cwd).sort().join(','), cwdLs, 'cwd unchanged');
        } finally { for (const e of readdirSync(R.S)) if (e.startsWith('ro-')) chmodSync(join(R.S, e), 0o755); for (const e of readdirSync(R.S)) if (e.startsWith('ga2-')) for (const x of ['o20', 'o29']) for (const y of [join(R.S, e, x), join(R.S, e, x, 'raw')]) { try { chmodSync(y, 0o755); } catch {} } rmAll(R.S); }
    });
}

// =====================================================================================================================
// ic block (gB B-ic B3; ORACLE: .handoff/PLAN-ext-audit-gB.md SPEC / TASKS 1-6 / TASK 9 / A1 A3 A4, addenda A7 (MD-34) / A8 / A9):
// ic-diff.sh from the OUTSIDE, the same classes as the bb / dd rows above (same row ids where the class is the same): dd's driver-mode
// rows (not N13 / N19b / N19c: ic has no file / ref mode), plus MD33 (raw/ 0300
// holding keep/, raw/ 0600, raw/ a symlink to a 0300 dir; skip at euid 0), SYM (report.txt symlink: live, dangling relative INSIDE
// OUT (MD-34 "even inside DIR"), dangling into an existing dir), ALIAS (BASH_ENV `alias node='<abs fake>'`), N37 (A9: no raw `cd:` line)
// and one A4 retention row. Die texts are the dd / bb texts the plan pastes verbatim into ic (prefix "ic-diff:").
// FAKE NODE = the fake node that rig() writes in test/ic-diff.test.mjs (its A4 block, `writeFileSync(join(fk, 'node'), [`#!${bash}`,
// 'd=$(dirname "$0")', ...`), line for line except the fixed #!/bin/bash and the --v8-options arm (here: cat V8O), plus ONE added line
// that also logs "$PWD" to "$d/pwd" (rows N3 / N4 / N8 assert the run directory). It logs argv to <its dir>/log; a trace run exits 0 and copies ./ic.log (a mono IC log of get) beside
// the --logfile, so an accepted run is VERDICT SAME, exit 0. Each fake logs into its OWN directory: "which binary ran" = which log.
// Spawn counts are the sum of every fake's log lines (probes + trace runs; accepted --runs 3 = 2 + 6 = 8, PLAN A3).
// gB B-four ic B3 (PLAN-ext-audit-gB-four-ic.md TASK 6 / A4 / A5; MD-47, MD-49): F2 is CLOSED in ic -- the old F2 pin is re-pinned as N29 (F2 closed), plus the dd walk rows N30-N32, N34-N36 (+ N33 control)
// and the alloc-style class rows MD36a/b/n, MD37a/c, MD38, ENV, MOD(-r/-ok), EVAL(-ep/-ok) and one RET row (44 -> 65 ic rows); MD-46 G4 rung 3 adds 9 rows (65 -> 74). No DRIVER -ef port in ic (MD-49): no N1p analog, no DRV1 row.
// FROZEN EXPECTATION (HEAD 5e1f7a8 ic; PLAN-ext-audit-gB-four-ic.md A4): exactly 16 red (N29/F2, N30-N32, N34-N36, MD36a/b/n, MD37a, MD38, ENV, MOD, EVAL, RET) and 49 green (controls incl. N33, MD37c, MOD-r, MOD-ok, EVAL-ep, EVAL-ok). Fixed build: 65 green.
// FROZEN EXPECTATION (MD-46 G4, frozen 151985d ic root b35-g4, ic-diff.sh sha256/8 bed42c6e; PLAN-md46 G4 A5): exactly 7 planned groups = 10 of the 74 rows red (N15, MD51-MOD, MD51-EVAL, F15c, the 4 V8R rows, V8OK, V8RET), F15a / F15b green (controls), the other 64 green. New build: 74 green. mkIcNode serves the G1 fixture as --v8-options.
// =====================================================================================================================
const IC = join(ROOT, 'ic-diff.sh');
const ICP = 'ic-diff:';
const IC_MONO = ['v8-version,14,6,202,34,-node.28,0', 'code-creation,JS,10,98536,0x3bcd762b6930,5,get file:///w/drv.js:2:13,0x29a78805a970,~',
    'LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,', ''].join('\n');
function mkIcNode(path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, ['#!/bin/bash', 'd=$(dirname "$0")', 'printf "%s\\n" "$*" >>"$d/log"', 'printf "%s\\n" "$PWD" >>"$d/pwd"',
        'if [ -n "${NODE_OPTIONS+x}" ] || [ -n "${NODE_COMPILE_CACHE+x}" ]; then echo "env leaked"; exit 7; fi',
        `case "$1" in --version) echo v26.8.2; exit 0 ;; --v8-options) cat '${V8O}'; exit 0 ;; esac`,
        'lf=""; for a; do case "$a" in --logfile=*) lf="${a#--logfile=}" ;; esac; done; last="${!#}"',
        'case "$last" in -*) echo "bad option: $last" >&2; exit 9 ;; esac',
        '[ -f "$last" ] || { echo "no driver: $last" >&2; exit 9; }',
        'if [ -n "$lf" ] && [ -f ./ic.log ]; then cp ./ic.log "$(dirname "$lf")/isolate-0x1000-$$-$(basename "$lf")"; fi',
        'if [ -f ./term ]; then kill -TERM "$PPID"; fi',
        'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi', 'exit 0', ''].join('\n'));
    chmodSync(path, 0o755);
}
function icDriver(path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ''); writeFileSync(join(dirname(path), 'ic.log'), IC_MONO); return path; }
function icRig() {
    const S = sandbox();
    mkdirSync(join(S, 'cwd'));
    mkdirSync(join(S, 'mk'));
    const dirs = new Set();
    const node = (p) => { mkIcNode(p); dirs.add(dirname(p)); return p; };
    const fk = node(join(S, 'fk', 'node')); node(join(S, 'bin', 'node')); // bin/node: a guard fake on PATH, it must never run
    const env = baseEnv({ PATH: `${join(S, 'bin')}:/usr/bin:/bin` });
    const drv = (name) => icDriver(join(S, 'cwd', name));
    const logLines = (d) => readLog(join(d, 'log'));
    const spawns = () => [...dirs].flatMap(logLines);
    const traces = () => { const a = logLines(dirname(fk)), p = readLog(join(dirname(fk), 'pwd')); return a.map((l, i) => ({ argv: l, pwd: p[i] })).filter((t) => t.argv !== '--version' && t.argv !== '--v8-options'); };
    return { S, env, cwd: join(S, 'cwd'), fk, node, drv, logLines, spawns, traces };
}
function icRows() {
    const asRoot = !!(process.getuid && process.getuid() === 0);
    const rootSkip = skip || (asRoot ? 'root ignores file modes' : false);
    // Rows red on the frozen ic stay plain red until the fix (suite convention); see the header for the 16 red of the B-four ic batch.
    const icTest = (name, fn, root = false) => test(`ic ${name}`, { skip: root ? rootSkip : skip }, () => { const R = icRig(); try { fn(R); } finally { rmAll(R.S); } });
    const A = (R, args, o = {}) => run(IC, ['--fn', 'get', ...args], { cwd: o.cwd || R.cwd, env: { ...(o.env || R.env), TMPDIR: join(R.S, 'mk') } });
    const D = (a, b = a) => [a, b];
    const ls = (d) => readdirSync(d).sort().join(',');
    const noNL = (r, want, n = 1) => assert.equal(r.lines.filter((l) => l.includes(want)).length, n, `${n} x "${want}"\n${r.out}`);
    const zero = (R, r) => { assert.equal(R.spawns().length, 0, `0 spawns, got:\n${R.spawns().join('\n')}\n${r.out}`); assert.deepEqual(readdirSync(join(R.S, 'mk')), [], '0 mktemp'); };
    const keep = (p, want, what) => assert.equal(readFileSync(p, 'utf8'), want, `${what} bytes unchanged`);
    const HDR = [/^before {2}(.+) {2}sha256\/8 [0-9a-f]{8}$/, /^after {3}(.+) {2}sha256\/8 [0-9a-f]{8}$/];
    const hdr = (r, path) => { for (const re of HDR) { const m = r.lines.filter((l) => re.test(l)); assert.equal(m.length, 1, `one header line ${re}\n${r.out}`); assert.equal(m[0].match(re)[1], path, r.out); } };
    const RD = (o) => `--out: ${o}/raw is not readable`;
    const SYM = (o) => `--out: ${o}/report.txt is a symlink (refused: the write would follow it)`;
    // a refused --out row: exit 2, the exact die line once, 0 spawns, then check()
    const refused = (id, desc, root, setup) => icTest(`${id} ${desc}`, (R) => {
        const locked = []; const lock = (p, mode) => { chmodSync(p, mode); locked.push(p); };
        const restore = () => { for (const p of locked) { try { chmodSync(p, 0o755); } catch {} } };
        try {
            const c = setup(R, lock);
            const lsOut = () => { try { return readdirSync(c.out).sort().join(','); } catch (e) { return `<${e.code}>`; } }; // OUT may be absent / a dangling link / under a file (walk rows)
            const outLs = lsOut();
            const r = A(R, ['--node', R.fk, '--out', c.out, ...D(R.drv('driver.mjs'))]);
            restore();
            assert.equal(r.status, 2, r.out);
            const want = `${ICP} ${c.text}`;
            assert.equal(r.lines.filter((l) => l === want).length, 1, `exactly one line "${want}"\n${r.out}`);
            zero(R, r);
            assert.equal(lsOut(), outLs, 'OUT listing unchanged (0 bytes written)');
            if (c.check) c.check();
        } finally { restore(); }
    }, root);

    // B1: ONE resolved absolute node for every spawn (PATH has a RELATIVE entry mybin before an absolute sysbin; cwd = driver dir differs).
    icTest('B1 relative PATH entry: every spawn runs the one node resolved from the launch cwd', (R) => {
        mkIcNode(join(R.cwd, 'mybin', 'node')); mkIcNode(join(R.S, 'sysbin', 'node'));
        const d1 = icDriver(join(R.S, 'drv', 'driver.mjs'));
        const env = baseEnv({ PATH: `mybin:${join(R.S, 'sysbin')}:/usr/bin:/bin` });
        const r = A(R, [...D(d1)], { env });
        assert.equal(R.logLines(join(R.S, 'sysbin')).length, 0, `sysbin must never run\n${r.out}`);
        assert.ok(R.logLines(join(R.cwd, 'mybin')).length >= 2, `mybin spawns >= 2\n${r.out}`);
        assert.equal(r.status, 0, r.out);
        assert.ok(r.lines.includes('VERDICT SAME'), r.out);
    }, false);
    // B1b: a builtin name or a directory is not a node binary: exit 2, one "node binary is not" line, 0 spawns.
    for (const [label, mk] of [['--node true', () => 'true'], ['--node <dir>', (R) => { mkdirSync(join(R.S, 'nodedir')); return join(R.S, 'nodedir'); }]]) {
        icTest(`B1b ${label} -> exit 2, one "node binary is not" line, 0 spawns${label === '--node true' ? ' (control)' : ''}`, (R) => {
            const r = A(R, ['--node', mk(R), ...D(R.drv('driver.mjs'))]);
            assert.equal(r.status, 2, r.out); noNL(r, 'node binary is not'); zero(R, r);
        }, false);
    }
    // B2: an exported CDPATH must not make `cd` print; header path on ONE line, out line absolute.
    for (const withOut of [false, true]) {
        icTest(`B2 CDPATH=. relative driver sub/driver.mjs ${withOut ? 'with --out rel_out' : 'without --out'}`, (R) => {
            R.drv('sub/driver.mjs');
            const r = A(R, ['--node', R.fk, ...(withOut ? ['--out', 'rel_out'] : []), 'sub/driver.mjs', 'sub/driver.mjs'], { env: { ...R.env, CDPATH: '.' } });
            assert.equal(r.status, 0, r.out);
            hdr(r, `${R.cwd}/sub/driver.mjs`);
            if (withOut) { assert.ok(r.lines.includes(`out     ${R.cwd}/rel_out`), `out line on one line\n${r.out}`); assert.ok(statSync(join(R.cwd, 'rel_out', 'report.txt')).isFile()); }
        });
    }
    test('ic B2 CDPATH=. bash sub/ic-diff.sh --self-test exits 0', { skip }, () => {
        const S = sandbox();
        try {
            mkdirSync(join(S, 'sub')); copyFileSync(IC, join(S, 'sub', 'ic-diff.sh'));
            const r = run('sub/ic-diff.sh', ['--self-test'], { cwd: S, env: baseEnv({ CDPATH: '.' }) });
            assert.equal(r.status, 0, r.out.split('\n').slice(-25).join('\n'));
        } finally { rmAll(S); }
    });
    // B3: dash-led names reach node / mkdir / cd as data.
    icTest('B3 driver ./-driver.mjs reaches node as ./-driver.mjs (exit 0)', (R) => {
        R.drv('-driver.mjs');
        const r = A(R, ['--node', R.fk, ...D('./-driver.mjs')]);
        assert.equal(r.status, 0, r.out);
        const t = R.traces(); assert.ok(t.length >= 2, `trace spawns >= 2, got ${t.length}`);
        for (const x of t) assert.ok(x.argv.endsWith(' ./-driver.mjs'), `last argv must be ./-driver.mjs: ${x.argv}`);
    }, false);
    icTest('B3 --out -out writes -out/report.txt (exit 0)', (R) => {
        const r = A(R, ['--node', R.fk, '--out', '-out', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 0, r.out);
        assert.ok(existsSync(join(R.cwd, '-out', 'report.txt')), `-out/report.txt must exist\n${r.out}`);
    });
    // B4B: --v8-flags shape is --[A-Za-z]*: four malformed flags -> exit 2, 0 spawns; the control flag is accepted.
    for (const f of ['---max-inlined-bytecode-size=30', '---no-max-inlined-bytecode-size', '--=1', '--1x']) {
        icTest(`B4B --v8-flags ${f} refused: exit 2, 0 spawns`, (R) => {
            const r = A(R, ['--node', R.fk, '--v8-flags', f, ...D(R.drv('driver.mjs'))]);
            assert.equal(r.status, 2, r.out);
            assert.ok(r.lines.some((l) => l.startsWith(ICP)), `an ${ICP} refusal line\n${r.out}`); zero(R, r);
        });
    }
    icTest('B4B control --v8-flags --max-inlined-bytecode-size=30 accepted: exit 0, >= 2 spawns', (R) => {
        const r = A(R, ['--node', R.fk, '--v8-flags', '--max-inlined-bytecode-size=30', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 0, r.out); assert.ok(R.spawns().length >= 2, `spawns >= 2\n${r.out}`);
    }, false);
    // M1: an unwritable report.txt (a directory) is a clean refusal.
    icTest('M1 --out DIR whose report.txt is a directory -> exit 2, "--out: cannot write", no "unexpected error", 0 spawns', (R) => {
        mkdirSync(join(R.S, 'm1', 'report.txt'), { recursive: true });
        const r = A(R, ['--node', R.fk, '--out', join(R.S, 'm1'), ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, '--out: cannot write'); noNL(r, 'unexpected error', 0); zero(R, r);
    });
    // M2 (static): the root script prints no bare "$DRV_*DIR/" join (a driver in / would print //x). Frozen: DESC_B / DESC_A lines.
    icTest('M2 static: 0 printed "$DRV_*DIR/" joins in ic-diff.sh', () => {
        const hits = [];
        readFileSync(IC, 'utf8').split('\n').forEach((l, i) => {
            const s = l.replace(/sha8 "[^"]*"/g, 'sha8 X');
            if (/(^|[^A-Za-z_])(say |DESC_[A-Z]=)/.test(s)) { const m = s.match(/\$DRV_[A-Z_]*DIR\//g); if (m) hits.push(`${i + 1}: x${m.length} ${l.trim()}`); }
        });
        assert.equal(hits.length, 0, hits.join('\n'));
    });
    // N5 / N6: dash-led node directory names; every spawn is the named fake (its own log).
    for (const [name, dirName, arg] of [['N5 --node -/node (dir named -)', '-', ['--node', '-/node']], ['N6 --node=-x/node (dir -x)', '-x', ['--node=-x/node']]]) {
        icTest(`${name}: every spawn is <cwd>/${dirName}/node`, (R) => {
            R.node(join(R.cwd, dirName, 'node'));
            const r = A(R, [...arg, ...D(R.drv('driver.mjs'))]);
            assert.equal(r.status, 0, r.out);
            assert.ok(R.logLines(join(R.cwd, dirName)).length >= 2, `spawns >= 2\n${r.out}`);
            assert.equal(R.spawns().length, R.logLines(join(R.cwd, dirName)).length, 'no other fake ran');
        });
    }
    icTest('N7 --out - writes ./-/report.txt (exit 0, no unexpected error)', (R) => {
        const r = A(R, ['--node', R.fk, '--out', '-', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 0, r.out); assert.ok(existsSync(join(R.cwd, '-', 'report.txt')), `./-/report.txt must exist\n${r.out}`); noNL(r, 'unexpected error', 0);
    });
    icTest('N1 --node ./non-exec (plain non-executable file) -> exit 2, one "node binary is not" line, 0 spawns', (R) => {
        writeFileSync(join(R.cwd, 'non-exec'), '#!/bin/sh\nexit 0\n'); chmodSync(join(R.cwd, 'non-exec'), 0o644);
        const r = A(R, ['--node', './non-exec', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, 'node binary is not'); zero(R, r);
    });
    // N2 control: a cwd file named true + --node true -> builtin refused, the cwd file not run (PLAN TASK 4: bare name via command -v).
    icTest('N2 control: cwd file named true + --node true -> builtin refused, cwd file not run: exit 2, 0 spawns', (R) => {
        R.node(join(R.cwd, 'true'));
        const r = A(R, ['--node', 'true', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, 'node binary is not'); zero(R, r);
    }, false);
    icTest('N3 driver ./-sub/driver.mjs: node runs in <cwd>/-sub with last argv ./driver.mjs', (R) => {
        R.drv('-sub/driver.mjs');
        const r = A(R, ['--node', R.fk, ...D('./-sub/driver.mjs')]);
        assert.equal(r.status, 0, r.out);
        const t = R.traces(); assert.ok(t.length >= 2, `trace spawns >= 2, got ${t.length}`);
        for (const x of t) { assert.equal(x.pwd, join(R.cwd, '-sub'), x.argv); assert.ok(x.argv.endsWith(' ./driver.mjs'), `last argv ./driver.mjs: ${x.argv}`); }
    }, false);
    icTest('N4 two drivers, before in a -b/ dir: before runs in <cwd>/-b, after in <cwd>/a', (R) => {
        R.drv('-b/driver.mjs'); R.drv('a/driver.mjs');
        const r = A(R, ['--node', R.fk, './-b/driver.mjs', 'a/driver.mjs']);
        assert.equal(r.status, 0, r.out);
        const t = R.traces();
        assert.deepEqual([...new Set(t.map((x) => x.pwd))].sort(), [join(R.cwd, '-b'), join(R.cwd, 'a')].sort(), t.map((x) => x.pwd).join('\n'));
        for (const x of t) assert.ok(x.argv.endsWith(' ./driver.mjs'), `last argv ./driver.mjs: ${x.argv}`);
    }, false);
    // N8 control: a driver in a directory literally named '-' (./-/d.mjs) must not mean OLDPWD.
    icTest('N8 control: driver ./-/d.mjs (dir named -): exit 0, node runs in <cwd>/-', (R) => {
        R.drv('-/d.mjs');
        const r = A(R, ['--node', R.fk, ...D('./-/d.mjs')]);
        assert.equal(r.status, 0, r.out);
        const t = R.traces(); assert.ok(t.length >= 2, `trace spawns >= 2, got ${t.length}`);
        for (const x of t) assert.equal(x.pwd, join(R.cwd, '-'), x.argv);
    }, false);
    // N9 (static, PLAN A1): exactly 1 `-ef "$NODE_RES"`, 2 DRV `-ef`, 1 `-ef "$OUT"` non-comment lines (frozen 0 / 0 / 0).
    icTest('N9 static: 1 -ef "$NODE_RES" line, 2 DRV -ef lines, 1 -ef "$OUT" line in ic-diff.sh', () => {
        const src = readFileSync(IC, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l));
        const node = src.filter((l) => /-ef "\$NODE_RES"/.test(l)), drv = src.filter((l) => /-ef/.test(l) && /DRV_[A-Z_]*DIR/.test(l)), out = src.filter((l) => /-ef "\$OUT"/.test(l));
        assert.equal(node.length, 1, node.join('\n')); assert.equal(drv.length, 2, drv.join('\n')); assert.equal(out.length, 1, out.join('\n'));
    });
    // N11: --node whose last char is a newline (fake A = "node\n" beside fake B = "node"): exit 2, one "a newline is not allowed" line, 0 spawns.
    icTest('N11 --node "nl/node<newline>": exit 2, one "a newline is not allowed" line, 0 spawns from either fake', (R) => {
        R.node(join(R.cwd, 'nl', 'node\n')); R.node(join(R.cwd, 'nl', 'node'));
        const r = A(R, ['--node', 'nl/node\n', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, 'a newline is not allowed'); zero(R, r);
    }, false);
    // N10: an existing OUT that is not writable and has no raw/ is refused before any spawn.
    icTest('N10 existing OUT mode 555, no raw/: exit 2, "cannot write", 0 spawns', (R) => {
        const o = join(R.S, 'ro'); mkdirSync(o); chmodSync(o, 0o555);
        try {
            const r = A(R, ['--node', R.fk, '--out', o, ...D(R.drv('driver.mjs'))]);
            chmodSync(o, 0o755);
            assert.equal(r.status, 2, r.out); noNL(r, 'cannot write'); zero(R, r);
        } finally { try { chmodSync(o, 0o755); } catch {} }
    }, true);
    // N12: existing OUT, report.txt mode 444, no raw/ -> refused before any spawn, no raw/.
    icTest('N12 existing OUT with report.txt mode 444, no raw/: exit 2, "cannot write", 0 spawns, no raw/', (R) => {
        const o = join(R.S, 'o12'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n'); chmodSync(join(o, 'report.txt'), 0o444);
        const r = A(R, ['--node', R.fk, '--out', o, ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, 'cannot write'); zero(R, r);
        assert.equal(existsSync(join(o, 'raw')), false, 'raw/ must not be created');
    }, true);
    // N15 control: an existing EMPTY OUT is fine; accepted --runs 3 = exactly 9 spawns (--version, 2 x --v8-options, 6 traces; MD-46 G4 A1: old code 8 = red).
    icTest('N15 control: existing empty OUT -> exit 0, report.txt + raw/before + raw/after, exactly 9 spawns', (R) => {
        const o = join(R.S, 'o15'); mkdirSync(o);
        const r = A(R, ['--node', R.fk, '--out', o, ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 0, r.out);
        assert.ok(statSync(join(o, 'report.txt')).isFile(), 'report.txt');
        assert.ok(existsSync(join(o, 'raw', 'before')) && existsSync(join(o, 'raw', 'after')), 'raw/before + raw/after');
        assert.equal(R.spawns().length, 9, R.spawns().join('\n'));
    }, false);
    // N29 (F2 closed; PLAN gB-four-ic TASK 6): the former F2 pin. raw/ 0500 (empty) under a writable OUT is now refused by the C-11 walk BEFORE any spawn.
    // Expected from the spec (dd walk text pasted into ic): exit 2, one WALK(o, o/raw) die, 0 spawns, raw/ empty, no report.txt. Old code: 2 spawns + "cannot create ... raw/before and ... raw/after" without the parenthesis = red.
    const WALK = (o, x) => `--out: cannot create ${o}/raw/before and ${o}/raw/after (${x} is not a writable directory)`;
    refused('N29 (F2 closed)', 'raw/ mode 0500 (empty) under a writable OUT: exit 2, "cannot create ... (<OUT>/raw is not a writable directory)", 0 spawns, raw/ empty, no report.txt', true, (R, lock) => {
        const o = join(R.S, 'of2'); mkdirSync(join(o, 'raw'), { recursive: true }); lock(join(o, 'raw'), 0o500);
        return { out: o, text: WALK(o, `${o}/raw`), check: () => { assert.deepEqual(readdirSync(join(o, 'raw')), [], 'raw/ still empty'); assert.equal(existsSync(join(o, 'report.txt')), false, 'no report.txt'); } };
    });
    // N30-N32, N35, N36 (the dd walk rows, same ids): the walk refuses before any spawn. Mutant notes as in the dd block.
    refused('N30', 'absent OUT under a 0555 parent: exit 2, "cannot create ... (<parent> is not a writable directory)", 0 spawns, OUT not created', true, (R, lock) => {
        const ro = join(R.S, 'ro30'); mkdirSync(ro); lock(ro, 0o555);
        const o = join(ro, 'new');
        return { out: o, text: WALK(o, ro), check: () => assert.equal(existsSync(o), false, 'OUT not created') };
    });
    refused('N31', 'OUT a dangling symlink: exit 2, "cannot create ... (<OUT> is not a writable directory)", 0 spawns, link target not created', false, (R) => {
        const o = join(R.S, 'dang31'); symlinkSync(join(R.S, 'nowhere31'), o);
        return { out: o, text: WALK(o, o), check: () => assert.equal(existsSync(join(R.S, 'nowhere31')), false, 'link target not created') };
    });
    refused('N32', 'OUT mode 0555 with a writable report.txt, no raw/: exit 2, "cannot create ... (<OUT> is not a writable directory)", 0 spawns, no raw/', true, (R, lock) => {
        const o = join(R.S, 'o32'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n'); lock(o, 0o555);
        return { out: o, text: WALK(o, o), check: () => { assert.equal(existsSync(join(o, 'raw')), false, 'no raw/'); keep(join(o, 'report.txt'), 'old\n', 'report.txt'); } };
    });
    // N33 control [mutant: immediate parent only]: an absent NESTED OUT (S/new/a/b) and a bare relative `--out o` both succeed.
    icTest('N33 control: absent nested OUT S/new/a/b and bare relative --out o -> exit 0, report.txt + raw/before + raw/after written', (R) => {
        const nested = join(R.S, 'new', 'a', 'b');
        for (const [out, dir] of [[nested, nested], ['o', join(R.cwd, 'o')]]) {
            const r = A(R, ['--node', R.fk, '--out', out, ...D(R.drv('driver.mjs'))]);
            assert.equal(r.status, 0, `--out ${out}\n${r.out}`);
            assert.ok(statSync(join(dir, 'report.txt')).size > 0, `${dir}/report.txt non-empty`);
            assert.ok(existsSync(join(dir, 'raw', 'before')) && existsSync(join(dir, 'raw', 'after')), `${dir}/raw/before + raw/after`);
        }
    });
    // N34 [mutant: drop `&& U != .` -> infinite loop -> the 10 s cap fails the row by name, "ic N34 run timed out after 10000 ms"]: cwd mode 0000 + relative `--out o`, locked from INSIDE the spawn (spawnSync cannot chdir into 0000).
    icTest('N34 cwd mode 0000 + relative --out o: exit 2, "(. is not a writable directory)", 0 spawns, no hang', (R) => {
        const dv = icDriver(join(R.S, 'drvx', 'driver.mjs'));
        const args = ['--fn', 'get', '--node', R.fk, '--out', 'o', dv, dv];
        // capSync throws by name on the 10 s cap (the N34 mutant's hang); the finally unlocks the cwd before that throw propagates (icTest's rmAll cannot read a 0000 dir)
        let r0;
        try { r0 = capSync(BASH, ['-c', 'cd "$1" && chmod 000 . && shift && exec "$@"', 'x', R.cwd, BASH, IC, ...args], { encoding: 'utf8', env: { ...R.env, TMPDIR: join(R.S, 'mk') } }, 10000, 'ic N34 run'); } finally { try { chmodSync(R.cwd, 0o755); } catch {} }
        assert.equal(r0.error, undefined, `no timeout / spawn error: ${r0.error}`);
        const out = (r0.stdout || '') + (r0.stderr || '');
        const want = `${ICP} ${WALK('o', '.')}`;
        assert.equal(r0.status, 2, out);
        assert.equal(out.split('\n').filter((l) => l === want).length, 1, `exactly one line "${want}"\n${out}`);
        zero(R, { out });
    }, true);
    // N35 [mutant: drop `-x U`]: OUT an existing dir of mode 0600 (r/w, no search).
    refused('N35', 'OUT an existing dir of mode 0600: exit 2, "cannot create ... (<OUT> is not a writable directory)", 0 spawns', true, (R, lock) => {
        const o = join(R.S, 'o35'); mkdirSync(o); lock(o, 0o600);
        return { out: o, text: WALK(o, o) };
    });
    // N36 [mutant: drop `-d U`]: `--out <S>/fx/o` where fx is a regular 0755 file (the first existing ancestor is not a directory).
    refused('N36', '--out S/fx/o, fx a regular 0755 file: exit 2, "cannot create ... (<S>/fx is not a writable directory)", 0 spawns', false, (R) => {
        const fx = join(R.S, 'fx'); writeFileSync(fx, 'x\n'); chmodSync(fx, 0o755);
        const o = join(fx, 'o');
        return { out: o, text: WALK(o, fx), check: () => keep(fx, 'x\n', 'fx') };
    });
    // N19a: `--out -o` is a dash-led OUT: a non-empty ./-o/raw is refused (ls must see ./-o, not an option), x unchanged.
    icTest('N19a driver mode --out -o with ./-o/raw/x present: exit 2, one "./-o/raw is not empty" line, 0 spawns, x unchanged', (R) => {
        mkdirSync(join(R.cwd, '-o', 'raw'), { recursive: true }); writeFileSync(join(R.cwd, '-o', 'raw', 'x'), 'keep\n');
        const r = A(R, ['--node', R.fk, '--out', '-o', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, './-o/raw is not empty'); zero(R, r); keep(join(R.cwd, '-o', 'raw', 'x'), 'keep\n', '-o/raw/x');
        assert.deepEqual(readdirSync(join(R.cwd, '-o')), ['raw'], 'no -o/report.txt');
    });
    // B3b rows: L = <cwd>/link -> <S>/elsewhere/sub, so `link/..` is <S>/elsewhere physically and <cwd> logically.
    const linkRig = (R) => { mkdirSync(join(R.S, 'elsewhere', 'sub'), { recursive: true }); symlinkSync(join(R.S, 'elsewhere', 'sub'), join(R.cwd, 'link')); };
    icTest('N14 --node link/../node (real node elsewhere, decoy in cwd): exit 2, one "node binary is not an executable file" line, 0 spawns', (R) => {
        linkRig(R); R.node(join(R.S, 'elsewhere', 'node')); R.node(join(R.cwd, 'node'));
        const r = A(R, ['--node', 'link/../node', ...D(R.drv('driver.mjs'))]);
        assert.equal(r.status, 2, r.out); noNL(r, 'node binary is not an executable file'); zero(R, r);
    });
    const n16 = (id, tag, mk) => icTest(`${id} ${tag} driver link/../d.mjs: exit 2, one "cannot resolve the directory of" line, 0 spawns, cwd unchanged`, (R) => {
        linkRig(R);
        writeFileSync(join(R.S, 'elsewhere', 'd.mjs'), '// real\n'); writeFileSync(join(R.cwd, 'd.mjs'), '// decoy, different bytes\n');
        const ok = R.drv('ok.mjs'); const before = ls(R.cwd); const bad = 'link/../d.mjs';
        const r = A(R, ['--node', R.fk, ...mk(bad, ok)]);
        assert.equal(r.status, 2, r.out); noNL(r, `cannot resolve the directory of ${bad}`); zero(R, r);
        assert.equal(ls(R.cwd), before, 'cwd listing unchanged');
    });
    n16('N16b', 'before', (bad, ok) => [bad, ok]);
    n16('N16c', 'after', (bad, ok) => [ok, bad]);
    icTest('N17 --out link/../o: writes S/elsewhere/o (physical), cwd/o stays empty, header names the physical path', (R) => {
        linkRig(R); mkdirSync(join(R.cwd, 'o'));
        const r = A(R, ['--node', R.fk, '--out', 'link/../o', ...D(R.drv('driver.mjs'))]);
        const phys = join(R.S, 'elsewhere', 'o');
        assert.equal(r.status, 0, r.out);
        assert.ok(statSync(join(phys, 'report.txt')).size > 0, 'elsewhere/o/report.txt non-empty');
        const rawFiles = readdirSync(join(phys, 'raw'), { recursive: true }).filter((e) => statSync(join(phys, 'raw', e)).isFile());
        assert.ok(rawFiles.length >= 2, `elsewhere/o/raw has >= 2 files, got ${rawFiles.length}`);
        assert.equal(readdirSync(join(R.cwd, 'o')).length, 0, 'cwd/o has 0 entries');
        assert.ok(r.lines.includes(`out     ${phys}`), `header "out     ${phys}"\n${r.out}`);
    });
    // N18 control: a symlinked directory reached WITHOUT `..` keeps its logical name.
    icTest('N18 control: driver lnk/d.mjs and --out lnk/o via a symlinked dir keep the logical names (exit 0)', (R) => {
        icDriver(join(R.S, 'real', 'd.mjs')); symlinkSync(join(R.S, 'real'), join(R.cwd, 'lnk'));
        const r = A(R, ['--node', R.fk, '--out', 'lnk/o', ...D('lnk/d.mjs')]);
        assert.equal(r.status, 0, r.out);
        hdr(r, `${R.cwd}/lnk/d.mjs`);
        assert.ok(r.lines.includes(`out     ${R.cwd}/lnk/o`), `header "out     ${R.cwd}/lnk/o"\n${r.out}`);
    }, false);

    // ALIAS: BASH_ENV defines `alias node='<abs fake>'`, no --node / NODE. `command -v node` prints "alias node='/abs/..'" (it contains a
    // slash): it must be refused as not an executable file, never run through a "cannot run" path; 0 spawns of the fake or the PATH guard.
    icTest('ALIAS BASH_ENV alias node=<abs fake>, no --node: exit 2, one "node binary is not an executable file" line, 0 spawns', (R) => {
        const rc = join(R.S, 'alias.rc'); writeFileSync(rc, `shopt -s expand_aliases\nalias node='${R.fk}'\n`); // non-interactive bash needs expand_aliases before `command -v` sees an alias
        const r = A(R, [...D(R.drv('driver.mjs'))], { env: { ...R.env, BASH_ENV: rc } });
        assert.equal(r.status, 2, r.out); noNL(r, 'node binary is not an executable file'); zero(R, r);
    });

    // MD33: the raw/ guard (ic: dd :987 / alloc :732 texts). Refused: the exact line once, 0 spawns, victim bytes unchanged. skip at euid 0.
    refused('MD33a', 'raw/ mode 0300 holding keep/f: exit 2, "raw is not readable", 0 spawns, file bytes unchanged', true, (R, lock) => {
        const o = join(R.S, 'o33a'); mkdirSync(join(o, 'raw', 'keep'), { recursive: true });
        writeFileSync(join(o, 'raw', 'keep', 'f'), 'VICTIM\n'); lock(join(o, 'raw'), 0o300);
        return { out: o, text: RD(o), check: () => keep(join(o, 'raw', 'keep', 'f'), 'VICTIM\n', 'raw/keep/f') };
    });
    refused('MD33b', 'raw/ mode 0600 (empty, no x): exit 2, "raw is not readable", 0 spawns', true, (R, lock) => {
        const o = join(R.S, 'o33b'); mkdirSync(join(o, 'raw'), { recursive: true }); lock(join(o, 'raw'), 0o600);
        return { out: o, text: RD(o) };
    });
    refused('MD33c', 'raw -> symlink to a 0300 dir holding keep/f: exit 2, "raw is not readable", 0 spawns, file bytes unchanged', true, (R, lock) => {
        const o = join(R.S, 'o33c'); mkdirSync(o);
        const tgt = join(R.S, 'locked33'); mkdirSync(join(tgt, 'keep'), { recursive: true }); writeFileSync(join(tgt, 'keep', 'f'), 'VICTIM\n'); lock(tgt, 0o300);
        symlinkSync(tgt, join(o, 'raw'));
        return { out: o, text: RD(o), check: () => keep(join(tgt, 'keep', 'f'), 'VICTIM\n', 'locked/keep/f') };
    });
    // SYM (MD-34): report.txt is a symlink: live, dangling relative INSIDE OUT, dangling into an existing dir. Refused, target untouched / not created, no raw/.
    refused('N24', 'report.txt a live symlink to S/target ("KEEP"): exit 2, "is a symlink", 0 spawns, target stays "KEEP", no raw/', false, (R) => {
        const o = join(R.S, 'o24'); mkdirSync(o);
        writeFileSync(join(R.S, 'target'), 'KEEP\n'); symlinkSync(join(R.S, 'target'), join(o, 'report.txt'));
        return { out: o, text: SYM(o), check: () => { keep(join(R.S, 'target'), 'KEEP\n', 'target'); assert.equal(existsSync(join(o, 'raw')), false, 'no OUT/raw'); } };
    });
    refused('N25', 'report.txt a dangling RELATIVE symlink inside OUT (MD-34 "even inside DIR"): exit 2, "is a symlink", 0 spawns, target not created, no raw/', false, (R) => {
        const o = join(R.S, 'o25'); mkdirSync(o); symlinkSync('newfile', join(o, 'report.txt'));
        return { out: o, text: SYM(o), check: () => { assert.equal(existsSync(join(o, 'newfile')), false, 'target not created'); assert.deepEqual(readdirSync(o), ['report.txt']); } };
    });
    refused('N26', 'report.txt a dangling symlink into an EXISTING dir: exit 2, "is a symlink", 0 spawns, target not created, no raw/', false, (R) => {
        const o = join(R.S, 'o26'); mkdirSync(o); mkdirSync(join(R.S, 'exdir'));
        symlinkSync(join(R.S, 'exdir', 'x'), join(o, 'report.txt'));
        return { out: o, text: SYM(o), check: () => { assert.equal(existsSync(join(R.S, 'exdir', 'x')), false, 'target not created'); assert.deepEqual(readdirSync(join(R.S, 'exdir')), []); assert.equal(existsSync(join(o, 'raw')), false, 'no OUT/raw'); } };
    });

    // N37 (A9): no --node / NODE, PATH = "<S>/p/x<newline>:...": `command -v node` finds "<S>/p/x<newline>/node"; $(dirname) strips the newline so the
    // node-dir cd names <S>/p/x (absent). Contract (dd, pasted into ic by TASK 4): exit 2, 0 spawns, ONE "node binary: cannot resolve the directory of <path>" die
    // (the printed path keeps its newline), NO raw "cd:" line.
    icTest('N37 PATH entry "<S>/p/x<newline>" holds node, no --node / NODE: exit 2, one "cannot resolve the directory of" die, no raw "cd:" line, 0 spawns', (R) => {
        const nd = `${R.S}/p/x\n/node`; R.node(nd);
        const env = baseEnv({ PATH: `${R.S}/p/x\n:${dirname(R.fk)}:/usr/bin:/bin` });
        const r = A(R, [...D(R.drv('driver.mjs'))], { env });
        assert.equal(r.status, 2, r.out);
        const want = `${ICP} node binary: cannot resolve the directory of ${nd}\n`;
        assert.equal(r.out.split(want).length - 1, 1, `exactly one die "${want}"\n${r.out}`);
        assert.equal(r.out.split('cannot resolve the directory of').length - 1, 1, `no other "cannot resolve" line\n${r.out}`);
        assert.equal(r.lines.filter((l) => /(^|[ :])cd: /.test(l)).length, 0, `no raw "cd:" line\n${r.out}`);
        zero(R, r);
    });

    // A4 retention (PLAN A4): 20 cycles of B1b (x3) / B4B (x4) / M1 / N16b-c / N10 / N12 / MD33 (a, b) / SYM (N24, N25) with TMPDIR=<S>/tmp leave 0 entries after each
    // cycle, cwd + elsewhere/ unchanged, the MD33 victim and the SYM target unchanged. Regression pin (a refusal must not leak a mktemp dir; a bare macOS
    // `mktemp -d` ignores TMPDIR, so this pins TMPDIR-honouring leaks only).
    icTest('A4 retention: 20 cycles of B1b / B4B / M1 / N16 / N10 / N12 / MD33 / SYM leave TMPDIR empty and cwd + elsewhere/ unchanged', (R) => {
        const tmp = join(R.S, 'tmp'); mkdirSync(tmp);
        const d = R.drv('driver.mjs'); const env = { ...R.env, TMPDIR: tmp };
        writeFileSync(join(R.cwd, 'plain'), '#!/bin/sh\n'); chmodSync(join(R.cwd, 'plain'), 0o644);
        mkdirSync(join(R.S, 'nodedir'));
        linkRig(R); writeFileSync(join(R.S, 'elsewhere', 'd.mjs'), '// real\n'); writeFileSync(join(R.cwd, 'd.mjs'), '// decoy, different bytes\n');
        writeFileSync(join(R.S, 'elsewhere', 'target'), 'KEEP\n');
        const locked = [];
        const cwdLs = ls(R.cwd), elseLs = readdirSync(join(R.S, 'elsewhere'), { recursive: true }).sort().join(',');
        try {
            for (let c = 0; c < 20; c++) {
                const inputs = [['--node', 'true'], ['--node', join(R.S, 'nodedir')], ['--node', './plain'],
                    ...['---max-inlined-bytecode-size=30', '---no-max-inlined-bytecode-size', '--=1', '--1x'].map((f) => ['--node', R.fk, '--v8-flags', f])].map((x) => [...x, d, d]);
                const m1 = join(R.S, `m1-${c}`); mkdirSync(join(m1, 'report.txt'), { recursive: true });
                inputs.push(['--node', R.fk, '--out', m1, d, d]);
                const bad = 'link/../d.mjs';
                inputs.push(['--node', R.fk, bad, d], ['--node', R.fk, d, bad]);
                const g = join(R.S, `g-${c}`); mkdirSync(g);
                const o24 = join(g, 'o24'), o25 = join(g, 'o25'), o33a = join(g, 'o33a'), o33b = join(g, 'o33b');
                mkdirSync(o24); symlinkSync(join(R.S, 'elsewhere', 'target'), join(o24, 'report.txt'));
                mkdirSync(o25); symlinkSync('newfile', join(o25, 'report.txt'));
                inputs.push(['--node', R.fk, '--out', o24, d, d], ['--node', R.fk, '--out', o25, d, d]);
                if (!asRoot) {
                    const ro = join(g, 'ro'); mkdirSync(ro); chmodSync(ro, 0o555); locked.push(ro);
                    const n12 = join(g, 'n12'); mkdirSync(n12); writeFileSync(join(n12, 'report.txt'), 'old\n'); chmodSync(join(n12, 'report.txt'), 0o444);
                    mkdirSync(join(o33a, 'raw', 'keep'), { recursive: true }); writeFileSync(join(o33a, 'raw', 'keep', 'f'), 'VICTIM\n'); chmodSync(join(o33a, 'raw'), 0o300); locked.push(join(o33a, 'raw'));
                    mkdirSync(join(o33b, 'raw'), { recursive: true }); chmodSync(join(o33b, 'raw'), 0o600); locked.push(join(o33b, 'raw'));
                    inputs.push(['--node', R.fk, '--out', ro, d, d], ['--node', R.fk, '--out', n12, d, d], ['--node', R.fk, '--out', o33a, d, d], ['--node', R.fk, '--out', o33b, d, d]);
                }
                for (const a of inputs) run(IC, ['--fn', 'get', ...a], { cwd: R.cwd, env });
                for (const p of locked.splice(0)) chmodSync(p, 0o755); // back first: nothing is left at 0300 / 0600 / 0555, and the reads below need it
                if (!asRoot) keep(join(o33a, 'raw', 'keep', 'f'), 'VICTIM\n', `cycle ${c}: MD33 victim`);
                keep(join(R.S, 'elsewhere', 'target'), 'KEEP\n', `cycle ${c}: SYM target`);
                assert.equal(existsSync(join(o25, 'newfile')), false, `cycle ${c}: SYM-inside target created`);
                assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
                assert.equal(ls(R.cwd), cwdLs, `cycle ${c}: cwd listing changed`);
                assert.equal(readdirSync(join(R.S, 'elsewhere'), { recursive: true }).sort().join(','), elseLs, `cycle ${c}: elsewhere/ listing changed`);
            }
        } finally { for (const p of locked) { try { chmodSync(p, 0o755); } catch {} } for (const e of readdirSync(R.S)) if (e.startsWith('g-')) for (const x of [join(R.S, e, 'ro'), join(R.S, e, 'o33a', 'raw'), join(R.S, e, 'o33b', 'raw')]) { try { chmodSync(x, 0o755); } catch {} } }
    });

    // gB B-four ic B3 (PLAN-ext-audit-gB-four-ic.md TASK 6, A4, A5; MD-47, MD-49): the alloc-style refusals ported to ic-diff, same ids as the dd / bb block.
    // Expected texts = the reference allocation-diff.sh arms with the "ic-diff:" prefix (no DRIVER -ef port in ic: MD-49, so no N1p / DRV1 row).
    const dieOnce = (r, want, what) => {
        assert.equal(r.status, 2, `${what}: exit 2\n${r.out}`);
        assert.equal(r.lines.filter((l) => l === want).length, 1, `${what}: exactly one line "${want}"\n${r.out}`);
    };
    const SYML = (o) => `${ICP} --out: ${o}/raw is a symlink (refused: the writes would follow it)`;
    const HARD = (o) => `${ICP} --out: ${o}/report.txt has another hard link (refused: the write would change that file too)`;
    const MODT = (f) => `${ICP} --v8-flags must not set ${f}: it loads a module of yours into the measured process (a preload or a module loader)`;
    const ENVT = (f) => `${ICP} --v8-flags must not set ${f}: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process`;
    const EVALT = (f) => `${ICP} --v8-flags must not set ${f}: it runs code of yours in the measured process instead of the driver (--eval / --print: node evaluates it and the driver becomes argv), or prints V8 internals into the measured run (V8's --print-* flags)`;
    const MODS = ['--require=F', '--require', '--import=F', '--import', '--loader=F', '--experimental-loader=F', '--experimental_loader=F', '--require-module'];  // --require-module: the arm is a prefix match (ic self-test check 71); kills the exact-forms mutant M42x
    const ENVS = ['--env-file=F', '--env-file', '--env_file=F', '--experimental-config-file=F', '--experimental-default-config-file'];
    const EVALS = ['--eval=1', '--eval', '--print=1', '--print', '--print-opt-code', '--print_opt_code'];
    const flagArgs = (R, f, d) => ['--node', R.fk, '--v8-flags', f, d, d];
    const flagRow = (id, desc, flags, textOf) => icTest(`${id} ${desc}`, (R) => {
        const d = R.drv('driver.mjs');
        for (const f of flags) {
            const r = A(R, flagArgs(R, f, d));
            dieOnce(r, textOf(f), f); zero(R, r);
        }
    });
    const mkSym = (R, at) => { const o = join(at, 'o'); mkdirSync(join(R.S, 'ext'), { recursive: true }); mkdirSync(o, { recursive: true }); symlinkSync(join(R.S, 'ext'), join(o, 'raw')); return o; };
    const mkDangling = (R, at) => { const o = join(at, 'o'); mkdirSync(o, { recursive: true }); symlinkSync(join(R.S, 'nowhere'), join(o, 'raw')); return o; };
    const mkHard = (R, at) => { const o = join(at, 'o'); mkdirSync(o, { recursive: true }); writeFileSync(join(R.S, 'h'), 'KEEP\n'); linkSync(join(R.S, 'h'), join(o, 'report.txt')); return o; };
    const outArgs = (R, o, d) => ['--node', R.fk, '--out', o, d, d];
    // MD-51 (MD-46 G4): a node option / non-V8 flag is refused by the allowlist (v8fl_check) right after --version: exit 2, the G1 die once,
    // exactly 2 spawns [--version, --v8-options], 0 traces, 0 mktemp (ic hashes a SECOND --v8-options only after the allowlist passes).
    // ic -h: "Refusals and die lines go to stderr as `ic-diff: <why>` + `VERDICT NO-VERDICT`" (PLAN-md46 G4 ASSERTION A2: VERDICT NO-VERDICT) -> pinned:
    // the line VERDICT NO-VERDICT once (in stdout + stderr joined) and 0 stdout bytes. stderr is NOT pinned exactly (run() joins stdout +
    // stderr, so an extra stderr line passes).
    const V8DIE = (f) => `${ICP} --v8-flags must not set ${f}: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)`;
    const V8SP = ['--version', '--v8-options'];
    const v8Refused = (id, desc, f, out = false) => icTest(`${id} ${desc}: exit 2, the allowlist die once, VERDICT NO-VERDICT once, 0 stdout bytes, spawns == [--version, --v8-options], 0 traces, 0 mktemp${out ? ', no OUT dir' : ''}`, (R) => {
        const o = join(R.S, 'ov8');
        const fa = flagArgs(R, f, R.drv('driver.mjs'));
        const r = A(R, [...fa.slice(0, 4), ...(out ? ['--out', o] : []), ...fa.slice(4)]);
        dieOnce(r, V8DIE(f), f);
        assert.equal(r.lines.filter((l) => l === 'VERDICT NO-VERDICT').length, 1, `exactly one "VERDICT NO-VERDICT"\n${r.out}`);
        assert.equal(r.stdout, '', `0 stdout bytes\n${r.out}`);
        assert.deepEqual(R.spawns(), V8SP, r.out);
        assert.equal(R.traces().length, 0, 'no trace run');
        assert.deepEqual(readdirSync(join(R.S, 'mk')), [], '0 mktemp');
        if (out) assert.equal(existsSync(o), false, 'OUT not created');
    });

    icTest('MD36a raw/ is a symlink to an EMPTY dir: exit 2, "raw is a symlink", 0 spawns, target stays empty', (R) => {
        const o = mkSym(R, R.S);
        const r = A(R, outArgs(R, o, R.drv('driver.mjs')));
        dieOnce(r, SYML(o), 'MD36a'); zero(R, r);
        assert.deepEqual(readdirSync(join(R.S, 'ext')), [], 'S/ext stays empty');
    });
    icTest('MD36b raw/ is a DANGLING symlink: exit 2, "raw is a symlink", 0 spawns, target not created', (R) => {
        const o = mkDangling(R, R.S);
        const r = A(R, outArgs(R, o, R.drv('driver.mjs')));
        dieOnce(r, SYML(o), 'MD36b'); zero(R, r);
        assert.equal(existsSync(join(R.S, 'nowhere')), false, 'S/nowhere not created');
    });
    // a symlink to a NON-empty dir must read "is a symlink" (not "is not empty"): kills a mutant that moves MD-36 after `ls -A` (P36).
    icTest('MD36n raw/ is a symlink to a NON-empty dir: exit 2, "raw is a symlink" (not "is not empty"), 0 spawns, file unchanged', (R) => {
        const o = mkSym(R, R.S);
        writeFileSync(join(R.S, 'ext', 'x'), 'VICTIM\n');
        const r = A(R, outArgs(R, o, R.drv('driver.mjs')));
        dieOnce(r, SYML(o), 'MD36n'); zero(R, r);
        keep(join(R.S, 'ext', 'x'), 'VICTIM\n', 'S/ext/x');
        assert.deepEqual(readdirSync(join(R.S, 'ext')), ['x'], 'S/ext holds only x');
    });
    icTest('MD37a report.txt has a second hard link S/h ("KEEP"): exit 2, "has another hard link", 0 spawns, S/h unchanged', (R) => {
        const o = mkHard(R, R.S);
        const r = A(R, outArgs(R, o, R.drv('driver.mjs')));
        dieOnce(r, HARD(o), 'MD37a'); zero(R, r);
        keep(join(R.S, 'h'), 'KEEP\n', 'S/h');
    });
    icTest('MD37c (control) report.txt with a single link is accepted: exit 0, >= 2 spawns, no "hard link" line', (R) => {
        const o = join(R.S, 'o'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n');
        const r = A(R, outArgs(R, o, R.drv('driver.mjs')));
        assert.equal(r.status, 0, r.out);
        assert.ok(!r.out.includes('hard link'), r.out);
        assert.ok(R.spawns().length >= 2, `spawns >= 2, got ${R.spawns().length}\n${r.out}`);
    });
    // MD38: no --node / NODE; the only node is on PATH in "<S>/p/a<NL>b".
    icTest('MD38 PATH entry "<S>/p/a<newline>b" holds the node: exit 2, "a newline is not allowed in the resolved path", 0 spawns', (R) => {
        R.node(`${R.S}/p/a\nb/node`);
        const env = baseEnv({ PATH: `${R.S}/p/a\nb:/usr/bin:/bin` });
        const r = A(R, [...D(R.drv('driver.mjs'))], { env });
        dieOnce(r, `${ICP} node binary: a newline is not allowed in the resolved path`, 'MD38'); zero(R, r);
    });
    flagRow('ENV', '--v8-flags env-file / config-file forms: exit 2, the "loads environment variables" die, 0 spawns', ENVS, ENVT);
    flagRow('MOD', '--v8-flags --require / --import / --loader / --experimental-loader forms (also underscore): exit 2, the "loads a module of yours" die, 0 spawns', MODS, MODT);
    // MOD-r / EVAL-ep: the letter gate already refuses the short forms (no new arm).
    flagRow('MOD-r', '(control) --v8-flags -r: refused by the letter gate, 0 spawns', ['-r'], (f) => `${ICP} --v8-flags takes flags only (each starts with -- and a letter), got '${f}'`);
    v8Refused('MD51-MOD', '--v8-flags --experimental-require-module (a node option, not a V8 flag)', '--experimental-require-module');
    flagRow('EVAL', '--v8-flags --eval / --print / --print-* forms (also underscore): exit 2, the MD-47 "runs code of yours" die, 0 spawns', EVALS, EVALT);
    flagRow('EVAL-ep', '(control) --v8-flags -e / -p: refused by the letter gate, 0 spawns', ['-e', '-p'], (f) => `${ICP} --v8-flags takes flags only (each starts with -- and a letter), got '${f}'`);
    v8Refused('MD51-EVAL', '--v8-flags --experimental-print-required-tla (a node option, not a V8 flag)', '--experimental-print-required-tla');

    // MD-46 G4 (F15 in ic): --snapshot-blob=F / --build-snapshot are refused by ic's own `*snapshot*` arm with 0 spawns (controls: green on the frozen
    // root too); --openssl-config=F reaches the allowlist (not a V8 flag of this node): 2 spawns (red on frozen: accepted).
    icTest('F15a (control) --v8-flags --snapshot-blob=F: exit 2, a die naming the flag once, 0 spawns, 0 mktemp', (R) => {
        const r = A(R, flagArgs(R, '--snapshot-blob=F', R.drv('driver.mjs')));
        assert.equal(r.status, 2, r.out); noNL(r, 'must not set --snapshot-blob=F: the script sets'); zero(R, r);
    });
    icTest('F15b (control) --v8-flags --build-snapshot: exit 2, a die naming the flag once, 0 spawns, 0 mktemp', (R) => {
        const r = A(R, flagArgs(R, '--build-snapshot', R.drv('driver.mjs')));
        assert.equal(r.status, 2, r.out); noNL(r, 'must not set --build-snapshot: the script sets'); zero(R, r);
    });
    v8Refused('F15c', '--v8-flags --openssl-config=F (a node file option)', '--openssl-config=F', true);
    // V8R: V8-looking flags the allowlist still refuses (MD-53 trace family, MD-52 string-typed, MD-51 "=" on a bool, numeric without "=N").
    for (const [id, f, why] of [['V8R-trace', '--trace-osr', 'MD-53 trace family'], ['V8R-string', '--turbo-filter=x', 'string-typed flag'],
        ['V8R-boolval', '--allow-natives-syntax=1', 'bool with a value'], ['V8R-bare', '--stack-size', 'numeric flag without =N']]) v8Refused(id, `${f} (${why})`, f);
    // V8OK: --allow-natives-syntax (a listed bool, named in the fixture) -> exit 0, VERDICT SAME, 9 spawns (--version, 2 x --v8-options, 6 traces),
    // the flag exactly once in each of the 6 trace argvs and in no probe argv. Old code accepts with 8 spawns = red.
    icTest('V8OK --v8-flags --allow-natives-syntax: exit 0, VERDICT SAME, 9 spawns (--version, 2 x --v8-options, 6 traces), the flag once in each of the 6 trace argvs', (R) => {
        const r = A(R, flagArgs(R, '--allow-natives-syntax', R.drv('driver.mjs')));
        assert.equal(r.status, 0, r.out);
        assert.ok(r.lines.includes('VERDICT SAME'), r.out);
        const sp = R.spawns();
        assert.equal(sp.length, 9, sp.join('\n'));
        assert.deepEqual(sp.slice(0, 3), ['--version', '--v8-options', '--v8-options'], sp.join('\n'));
        const tr = R.traces();
        assert.equal(tr.length, 6, sp.join('\n'));
        for (const t of tr) assert.equal(t.argv.split(' ').filter((a) => a === '--allow-natives-syntax').length, 1, `flag once in: ${t.argv}`);
    });
    // V8RET: 20 cycles of (--openssl-config=F with --out, refused) + (--trace-osr without --out, refused): TMPDIR 0 after every cycle, 0 OUT dirs,
    // exactly 80 spawns (20 x 2 x [--version, --v8-options]). It sees only TMPDIR-honouring leaks: a bare macOS `mktemp -d` ignores TMPDIR and would
    // survive unseen (the A4 retention rows say the same). Old code accepts both = red.
    icTest('V8RET 20 cycles of F15c (with --out) + V8R-trace leave TMPDIR empty, no OUT dir, exactly 80 spawns', (R) => {
        const tmp = join(R.S, 'tmp'); mkdirSync(tmp);
        const env = { ...R.env, TMPDIR: tmp };
        const d = R.drv('driver.mjs');
        for (let c = 0; c < 20; c++) {
            const o = join(R.S, `o${c}`);
            assert.equal(run(IC, ['--fn', 'get', '--node', R.fk, '--v8-flags', '--openssl-config=F', '--out', o, d, d], { cwd: R.cwd, env }).status, 2, `cycle ${c}: F15c exit 2`);
            assert.equal(run(IC, ['--fn', 'get', ...flagArgs(R, '--trace-osr', d)], { cwd: R.cwd, env }).status, 2, `cycle ${c}: V8R-trace exit 2`);
            assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
            assert.equal(existsSync(o), false, `cycle ${c}: OUT dir created`);
        }
        assert.equal(R.spawns().length, 80, R.spawns().length + ' spawns');
        assert.deepEqual(readdirSync(R.S).filter((e) => /^o\d+$/.test(e)), [], 'no OUT dirs');
    });

    // RET (PLAN A5; red on frozen): 20 cycles of the N31, N36, MD36a, MD36b, MD37a, ENV, MOD, EVAL inputs (+ N29, N30 when not root) with TMPDIR=<S>/tmp:
    // after every cycle TMPDIR has 0 entries, 0 spawns in total, S/h = "KEEP", S/ext empty, S/nowhere and the N31 / N36 targets absent / unchanged.
    icTest('RET 20 cycles of the N31 / N36 / MD36a / MD36b / MD37a / ENV / MOD / EVAL (+ N29 / N30 when not root) inputs leave TMPDIR empty, S/ext empty, S/h = KEEP, 0 spawns', (R) => {
        const tmp = join(R.S, 'tmp'); mkdirSync(tmp);
        const env = { ...R.env, TMPDIR: tmp };
        const d = R.drv('driver.mjs');
        const fx = join(R.S, 'fx'); writeFileSync(fx, 'x\n'); chmodSync(fx, 0o755);
        const locked = [];
        try {
            for (let c = 0; c < 20; c++) {
                const sub = (n) => { const p = join(R.S, `c${c}-${n}`); mkdirSync(p); return p; };
                const dang = join(sub('n31'), 'dang'); symlinkSync(join(R.S, 'nowhere31'), dang);
                const inputs = [
                    outArgs(R, dang, d), outArgs(R, join(fx, `o${c}`), d),
                    outArgs(R, mkSym(R, sub('a')), d), outArgs(R, mkDangling(R, sub('b')), d), outArgs(R, mkHard(R, sub('c')), d),
                    flagArgs(R, '--env-file=F', d), flagArgs(R, '--require=F', d), flagArgs(R, '--eval=1', d),
                ];
                if (!asRoot) {
                    const o29 = join(sub('n29'), 'o'); mkdirSync(join(o29, 'raw'), { recursive: true }); chmodSync(join(o29, 'raw'), 0o500); locked.push(join(o29, 'raw'));
                    const ro = sub('n30'); chmodSync(ro, 0o555); locked.push(ro);
                    inputs.push(outArgs(R, o29, d), outArgs(R, join(ro, 'new'), d));
                }
                for (const a of inputs) assert.equal(run(IC, ['--fn', 'get', ...a], { cwd: R.cwd, env }).status, 2, `cycle ${c}: exit 2 for ${a.join(' ')}`);
                for (const p of locked.splice(0)) chmodSync(p, 0o755);
                assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
                assert.deepEqual(readdirSync(join(R.S, 'ext')), [], `cycle ${c}: S/ext not empty`);
                keep(join(R.S, 'h'), 'KEEP\n', `cycle ${c}: S/h`);
                keep(fx, 'x\n', `cycle ${c}: fx`);
                assert.equal(existsSync(join(R.S, 'nowhere')) || existsSync(join(R.S, 'nowhere31')), false, `cycle ${c}: symlink target created`);
                assert.equal(R.spawns().length, 0, `cycle ${c}: 0 spawns, got:\n${R.spawns().join('\n')}`);
            }
        } finally { for (const p of locked) { try { chmodSync(p, 0o755); } catch {} } for (const e of readdirSync(R.S)) if (/^c\d+-n(29|30)$/.test(e)) for (const x of [join(R.S, e), join(R.S, e, 'o', 'raw')]) { try { chmodSync(x, 0o755); } catch {} } }
    });
}
icRows();
