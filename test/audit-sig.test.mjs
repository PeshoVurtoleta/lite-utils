// test/audit-sig.test.mjs -- b70 unit G-SIG-1 (helper batch B3) + b71 unit G-SIG-2 (helper batch B3): black-box rows for the SIGINT /
// SIGTERM / SIGHUP handling of all five roots (bytecode-budget bb, deopt-diff dd, ic-diff ic, allocation-diff ad,
// inlining-budget-diff ibd), from .handoff/PLAN-b67-gsig.md + PLAN-b70-gsig2.md ASSERTIONS and rulings Q-B67-STDIN, Q-B70-ADPIPE,
// never from what a root printed. TWO old twins per tool: `git show 465881b:<root>` (G-SIG-1's parent, no signal trap) and
// `git show 085c54d:<root>` (G-SIG-2's parent: the G-SIG-1 roots as committed, bb / ibd probe and ad run still inside $( )); each
// SKIPs when its commit is unreachable and FAILs under CI_STRICT (CI === 'true'). Every row has an old twin or a mutant that
// turns it red (law 6), or says it is a regression pin.
// Own fake node (bash, shebang /bin/bash): logs one line per call, answers --version / -p / --v8-options (tracked fixture). A
// DRIVER call (argv holds one of -e [bb base_list], --trace-deopt-verbose [dd], --log-ic [ic], --trace-turbo-inlining [ibd trace
// run], --trace-gc [ad]) is held ONCE (the first, an atomic mkdir) when `hold` exists; a PROBE call (HOLD=probe / STDIN_ON=probe:
// bb --print-bytecode with a filter other than `*`; ibd --print-bytecode without --trace-turbo-inlining) is held once when
// `holdprobe` exists. A held call writes its pid to <case>/pid, then `exec sleep N`, so the pid IS the sleeper (30 s for every live
// A1 row). The tool's stdout / stderr go to files (no pipe a surviving sleeper could hold open); the signal goes to the TOOL pid
// only (never the group); a final SIGKILL of the own detached group + the pid read from the fake's file runs in `finally` (law 10).
// Signal rows use async spawn only (law 8); every async child gets armCap + noTimeout first (law 1).
//   ROW A1   (G-SIG-1) per tool x SIGTERM / SIGINT / SIGHUP, the driver run held 30 s: status 2, signal null; `<tool>: interrupted
//            (SIG<X>)` exactly once over stdout + stderr; 0 `unexpected error`; exactly 1 `^VERDICT \S+$` line over both streams; the
//            driver pid is dead (ESRCH) at tool exit; the tool exits within 10 s of the signal (overrun = named failure). ONE oracle
//            function (a1Problems): empty live, non-empty on the old twin.
//   ROW A1o  OLD twin 465881b per tool (dd ic bb ibd) x signal fails the A1 oracle (no signal trap). ad is not here: its wait is A1o2.
//   ROW A1 G-SIG-2   the same oracle, per scenario x signal: ad (diff mode, run held 30 s), bb first probe (diff mode AND file mode),
//            ibd first bytecode probe. REPLACES the old ad "sleep 3 + 5 s" rows (ad exits within 10 s now, like the others).
//   ROW A1o2 OLD twin 085c54d, the four scenarios, hold 15 s, SIGTERM: each overruns the 10 s bound (the assertion names OVERRUN)
//   ROW A2   (G-SIG-1) retention, 3 cycles x 3 signals per tool, private TMPDIR per run: 0 entries in TMPDIR for bb dd ic ad; ibd (no
//            --out, private cwd): exactly 1 `inl-diff-*` dir and 0 `inlining-budget-diff.*`.
//   ROW A2 G-SIG-2   the same in the probe phase (bb probe diff + file, ibd probe). Teeth: a mutant dropping `rm -f -- "$BB_TMP"` from
//            bb's EXIT trap leaves exactly 1 bytecode-budget.*; a mutant dropping ibd's IBD_TMP trap leaves exactly 1
//            inlining-budget-diff.*. A2 pin: the 085c54d twin leaves 0 (its $( ) finishes and runs rm).
//   ROW A2o  the 465881b bb leaves exactly 1 entry (G-SIG-1 tooth)
//   ROW RMFAIL (ruling Q-B71-TRAPS, review r1 blocker 1) bb probe diff + ibd bytecode probe: the fake's first probe call replaces
//            its temp file (<prefix>.??????) with a DIRECTORY holding one file (so the EXIT trap's rm -f fails), writes its pid,
//            then kill -TERM $PPID (the tool) and exec sleep 5: rc 2, signal null, `<tool>: interrupted (SIGTERM)` once, 1 VERDICT
//            line over both streams. Red on the pre-fix trap (rm before set +e: the failing rm ends the trap with rc 1 and the
//            prologue's fail-closed EXIT trap never runs).
//   ROW A3   --out DIR: report.txt ends exactly `<tool>: interrupted (SIGTERM)\nVERDICT NO-VERDICT\n`, exactly 1 VERDICT line, all 5
//            tools; OLD twin 465881b per tool fails it
//   ROW A4   (G-SIG-1) a copy of the root with `sh -c "exit 2"` after the ANCHOR: rc 2, stderr exactly `<tool>: unexpected error (exit
//            2)\nVERDICT NO-VERDICT\n`, all 5; the same injection into the 465881b root gives EMPTY stderr (red twin)
//   ROW A5   `FINAL=1; kill -TERM $$; exit 1` after the ANCHOR: rc 1, no signal, no `interrupted` text; the 465881b injection ends by
//            the signal, never rc 1 (red twin)
//   ROW STDIN ruling Q-B67-STDIN: the fake copies its stdin to a file (stdin.bin: the first driver call; stdin2.bin: the first probe
//            call); each tool is spawned with known stdin bytes. The first driver run of dd ic ad ibd (trace run) and the first PROBE of
//            bb and ibd see exactly those bytes; bb's base_list -e call keeps 0 bytes (documented /dev/null). Per-site mutant (the
//            site line's ` <&0 &` -> ` &`, count-checked on the line text; ibd has two sites, trace and probe) reads 0 bytes, all
//            sites. Pins: the 085c54d ad run, bb probe and ibd probe read the bytes too (inherited inside $( )).
//   ROW A4 G-SIG-2   ad append fail-closed (`ulimit -f 32; trap '' XFSZ`, --zero --runs 3, no --out): rc 2, stdout has `  NO-VERDICT
//            -- driver: cannot read driver output in run 1 (append exited 1)`, TMPDIR empty. Teeth: the 085c54d twin and a mutant
//            without ad's 64 KiB append line both avoid that line (the fake writes no marker, so run 1 reads `unparseable`, rc 2 on every build).
//   ROW H    `-h` and `--help` give rc 2 with EMPTY stderr on all 5 (pin: the 465881b root gives the same); a mutant that drops
//            `DIED=1` from the `usage; DIED=1; exit 2` line prints `unexpected error` (teeth)
//   ROW RET  the mkdtemp top is removed in after(); the live `git status --porcelain` `??` set is unchanged
// Per-child caps are explicit (capSync / armCap, 60 s, 45 s for the G-SIG-2 signal rows; no raw timeout key: spawn-cap.test.mjs S5).
// Private dirs under one mkdtemp top.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn as spawnAsync } from 'node:child_process';
import { capSync, armCap, noTimeout } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync, openSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const OPTS_FIX = join(PKG, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const OLD_SHA = '465881b';
const OLD2_SHA = '085c54d';   // G-SIG-2's parent: the G-SIG-1 roots as committed (probe / run still inside $( ))
const CI_STRICT = process.env.CI === 'true';
const SIGS = ['TERM', 'INT', 'HUP'];

function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'OUTDIR', 'ME', 'POSIXLY_CORRECT', 'SHELLOPTS', 'BASH_ENV', 'ENV', 'CDPATH', 'FINAL']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 60000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-sig-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
const untracked = () => spawn('git', ['status', '--porcelain'], { cwd: PKG }, 'git status --porcelain', 30000).stdout.split('\n').filter((l) => l.startsWith('?? ')).sort();
let GIT0 = null;
before(() => { mkTop(); GIT0 = untracked(); });
after(() => {
    const top = TOP;
    if (top !== null) rmSync(top, { recursive: true, force: true });
    TOP = null;
    assert.ok(top === null || !existsSync(top), `ROW RET: the mkdtemp top ${top} was not removed`);
    assert.deepEqual(untracked(), GIT0, 'ROW RET: the live repo gained / lost untracked entries');
});

const rd = (p) => readFileSync(p, 'utf8');
const ls = (d) => readdirSync(d).sort();
const msg = (r) => `rc=${r.status} sig=${r.signal}\n--- stdout\n${JSON.stringify(r.stdout)}\n--- stderr\n${JSON.stringify(r.stderr)}`;
function once(src, from, to, what) {   // an exact-once, count-checked edit
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `${what}: anchor must match exactly once, matched ${n}`);
    return src.replace(from, () => to);
}

// ---- tools ----
const NAMES = ['bytecode-budget', 'deopt-diff', 'ic-diff', 'allocation-diff', 'inlining-budget-diff'];
const SHORT = { 'bytecode-budget': 'bb', 'deopt-diff': 'dd', 'ic-diff': 'ic', 'allocation-diff': 'ad', 'inlining-budget-diff': 'ibd' };
const HOLD = () => 30;   // the held driver run's sleep, seconds (G-SIG-2: ad is killed at once too, so 30 s for all five)
const LIVE = (t) => join(PKG, `${t}.sh`);
const toolArgs = (t, a, b) => {
    switch (t) {
        case 'bytecode-budget': return ['--diff', '--fn', 'add', a, b];
        case 'deopt-diff': return ['--fn', 'add', a, b];
        case 'ic-diff': return ['--fn', 'get', a, b];
        case 'allocation-diff': return [a, b];
        default: return ['--tiers', 'turbo', '--no-bytecode', '--fn', 'read.set', a, b];
    }
};
const ANCHOR = 'export LC_ALL=C   # byte-wise sort / awk: stable multisets, emoji stripped as bytes\n';

// ---- the old twins ----
const haveSha = (sha) => (spawn('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${sha} not available (shallow clone?)`);
const skipFor = (h) => skip || (h === true || CI_STRICT ? false : h);
const OLDSKIP = skipFor(haveSha(OLD_SHA));
const OLD2SKIP = skipFor(haveSha(OLD2_SHA));
const OLD = {};
function oldRoot(t, sha = OLD_SHA) {
    const key = `${sha}:${t}`;
    if (OLD[key]) return OLD[key];
    const g = spawn('git', ['show', `${sha}:${t}.sh`], { cwd: PKG, encoding: 'buffer' }, `git show ${t}.sh`, 30000);
    assert.equal(g.status, 0, `git show ${sha}:${t}.sh failed (CI_STRICT: an unreachable pin is a failure)`);
    const p = join(mk('old'), `${t}.sh`);
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD[key] = p);
}
const oldRoot2 = (t) => oldRoot(t, OLD2_SHA);
test(`the old twins are git show ${OLD_SHA}:<root> (5 roots)`, { skip: OLDSKIP }, () => { for (const t of NAMES) assert.ok(existsSync(oldRoot(t)), t); });
test(`the G-SIG-2 twins are git show ${OLD2_SHA}:<root> (5 roots)`, { skip: OLD2SKIP }, () => { for (const t of NAMES) assert.ok(existsSync(oldRoot2(t)), t); });

// a copy of a root text with edits (each count-checked once)
function mutant(t, base, key, edits) {
    let src = base === 'old' ? rd(oldRoot(t)) : base === 'old2' ? rd(oldRoot2(t)) : rd(LIVE(t));
    for (const [from, to] of edits) src = once(src, from, to, `${t} ${key}`);
    const p = join(mk('mut'), `${t}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return p;
}

// ---- fake node + case ----
function fakeText(dir) {
    // drv = a DRIVER call (first one: stdin copied when catstdin exists and is not "probe"; held when `hold` exists).
    // drv2 = a PROBE call (bb: --print-bytecode with a filter other than `*`; ibd: --print-bytecode without
    // --trace-turbo-inlining): the first one copies stdin to stdin2.bin (catstdin, any content) and is held when `holdprobe` exists.
    return ['#!/bin/bash', `D=${JSON.stringify(dir)}`, 'printf "%s\\n" "$*" >> "$D/log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        '  -p) echo "v0 (V8 0)"; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        'esac',
        'drv=0; drv2=0; pb=0; ti=0; star=0',
        'for a; do case "$a" in -e|--trace-deopt-verbose|--log-ic|--trace-turbo-inlining|--trace-gc) drv=1 ;; esac; done',
        'for a; do case "$a" in --print-bytecode) pb=1 ;; --trace-turbo-inlining) ti=1 ;; --print-bytecode-filter=\'*\') star=1 ;; esac; done',
        'if [ "$pb" = 1 ] && [ "$ti" = 0 ] && [ "$star" = 0 ]; then drv2=1; fi',
        'cs=""; [ -f "$D/catstdin" ] && cs=$(cat "$D/catstdin")',
        'if [ "$drv2" = 1 ] && mkdir "$D/first2" 2>/dev/null; then',
        '  if [ -f "$D/catstdin" ]; then cat > "$D/stdin2.bin"; fi',
        '  if [ -f "$D/rmfail" ]; then',
        '    for f in "$TMPDIR/$(cat "$D/rmfail")".??????; do [ -f "$f" ] || continue; rm -f -- "$f"; mkdir -- "$f"; : > "$f/keep"; done',
        '    echo $$ > "$D/pid.tmp"; mv "$D/pid.tmp" "$D/pid"',
        '    kill -TERM $PPID; exec sleep 5',
        '  fi',
        '  if [ -f "$D/holdprobe" ]; then',
        '    echo $$ > "$D/pid.tmp"; mv "$D/pid.tmp" "$D/pid"',
        '    exec sleep "$(cat "$D/holdprobe")"',
        '  fi',
        'fi',
        'if [ "$drv" = 1 ] && mkdir "$D/first" 2>/dev/null; then',
        '  if [ -f "$D/catstdin" ] && [ "$cs" != probe ]; then cat > "$D/stdin.bin"; fi',
        '  if [ -f "$D/hold" ]; then',
        '    echo $$ > "$D/pid.tmp"; mv "$D/pid.tmp" "$D/pid"',
        '    exec sleep "$(cat "$D/hold")"',
        '  fi',
        'fi',
        'echo "driver ran"', 'exit 0', ''].join('\n');
}
// one case: dir/{node, a/driver.js, b/driver.js, tmp, cwd, out(not created)}; hold = seconds the first driver run sleeps (0 = none)
function mkCase(t, { hold = 0, holdProbe = 0, catstdin = false } = {}) {   // catstdin: false | true (driver + probe copy stdin) | 'probe' (probe only)
    const dir = mk(`case-${SHORT[t]}`);
    const c = { dir, tmp: join(dir, 'tmp'), cwd: join(dir, 'cwd'), out: join(dir, 'out'), node: join(dir, 'node'),
        a: join(dir, 'a', 'driver.js'), b: join(dir, 'b', 'driver.js'), pidf: join(dir, 'pid'), so: join(dir, 'stdout.txt'), se: join(dir, 'stderr.txt') };
    for (const d of [c.tmp, c.cwd, dirname(c.a), dirname(c.b)]) mkdirSync(d, { recursive: true });
    writeFileSync(c.a, '// driver a\n'); writeFileSync(c.b, '// driver b (differs)\n');
    writeFileSync(c.node, fakeText(dir)); chmodSync(c.node, 0o755);
    writeFileSync(join(dir, 'log'), '');
    if (hold > 0) writeFileSync(join(dir, 'hold'), `${hold}\n`);
    if (holdProbe > 0) writeFileSync(join(dir, 'holdprobe'), `${holdProbe}\n`);
    if (catstdin) writeFileSync(join(dir, 'catstdin'), catstdin === 'probe' ? 'probe' : '');
    c.args = (extra = []) => ['--node', c.node, ...extra, ...toolArgs(t, c.a, c.b)];
    return c;
}
function isDead(pid) { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }

// async tool run: wait for the held driver run to start, send `sig` to the TOOL pid, wait for the tool's exit
async function runTool({ root, t, c, args, sig, what, cap = 60000 }) {
    const so = openSync(c.so, 'w'), se = openSync(c.se, 'w');
    let child;
    try { child = spawnAsync(BASH, [root, ...args], { cwd: c.cwd, env: cleanEnv({ TMPDIR: c.tmp }), detached: true, stdio: ['ignore', so, se] }); }
    finally { closeSync(so); closeSync(se); }
    const h = armCap(child, cap, 'SIGKILL');
    let ex = null;
    const exited = new Promise((res) => {
        child.once('exit', (status, signal) => { ex = { status, signal, t: Date.now() }; res(ex); });
        child.once('error', (error) => { ex = { status: null, signal: null, error, t: Date.now() }; res(ex); });
    });
    let driverPid = null;
    try {
        const t0 = Date.now();
        while (ex === null && !existsSync(c.pidf) && Date.now() - t0 < 30000) await sleep(20);
        if (existsSync(c.pidf)) driverPid = Number(rd(c.pidf).trim());
        let tSig = null;
        if (ex === null && driverPid !== null) { tSig = Date.now(); process.kill(child.pid, `SIG${sig}`); }
        else if (ex === null) { process.kill(child.pid, 'SIGKILL'); }
        await exited;
        h.clear();
        const dead = driverPid !== null ? isDead(driverPid) : null;
        const r = { status: ex.status, signal: ex.signal, stdout: rd(c.so), stderr: rd(c.se), timedOut: h.timedOut, cap: h.cap, error: ex.error };
        noTimeout(r, what);
        assert.ok(driverPid !== null && tSig !== null, `${what}: the held driver run never started (tool ended first or 30 s passed)\n${msg(r)}`);
        return { ...r, driverPid, driverDead: dead, ms: ex.t - tSig, c };
    } finally {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group gone */ }
        if (driverPid !== null && !isDead(driverPid)) { try { process.kill(driverPid, 'SIGKILL'); } catch { /* gone */ } }   // a pid this run started
    }
}

// ---- the A1 oracle (one function) ----
function a1Problems(t, sig, r) {
    const p = [];
    const limit = 10000;   // G-SIG-2 A1: every tool, ad included, exits within 10 s of the signal
    const both = r.stdout + r.stderr;
    const line = `${t}: interrupted (SIG${sig})`;
    const n = both.split(line).length - 1;
    const nv = (both.match(/^VERDICT \S+$/gm) || []).length;
    if (r.status !== 2) p.push(`status ${r.status}, want 2`);
    if (r.signal !== null) p.push(`ended by signal ${r.signal}, want none`);
    if (n !== 1) p.push(`"${line}" appears ${n} times, want 1`);
    if (/unexpected error/.test(both)) p.push('"unexpected error" is present, want 0');
    if (nv !== 1) p.push(`${nv} VERDICT lines over both streams, want 1`);
    if (r.driverDead !== true) p.push('the driver pid is still alive at tool exit');
    if (r.ms > limit) p.push(`OVERRUN: the tool exited ${r.ms} ms after the signal, limit ${limit} ms`);
    return p;
}
const holdCase = (t) => mkCase(t, { hold: HOLD(t) });
const oldHoldCase = (t) => mkCase(t, { hold: t === 'allocation-diff' ? 3 : 12 });   // > the 10 s bound: an old root that waits the driver out still overruns (ad: A3 / A2 only; its A1 twin is the 085c54d one)

// ======================================================= A1 =======================================================
for (const t of NAMES) for (const sig of SIGS) {
    test(`A1 ${SHORT[t]} SIG${sig} during the driver run: rc 2 no signal, interrupted once, 1 VERDICT, driver dead, exit in time`, { skip }, async () => {
        const c = holdCase(t);
        const r = await runTool({ root: LIVE(t), t, c, args: c.args(), sig, what: `${t} SIG${sig}` });
        assert.deepEqual(a1Problems(t, sig, r), [], msg(r));
    });
}
for (const t of NAMES) if (t !== 'allocation-diff') for (const sig of SIGS) {   // ad: its wait is the 085c54d twin below (A1o2)
    test(`A1o OLD twin ${SHORT[t]} SIG${sig}: the ${OLD_SHA} root fails the A1 oracle (no signal trap)`, { skip: OLDSKIP }, async () => {
        const c = oldHoldCase(t);
        const r = await runTool({ root: oldRoot(t), t, c, args: c.args(), sig, what: `old ${t} SIG${sig}` });
        const p = a1Problems(t, sig, r);
        assert.ok(p.length > 0, `the old root passed the A1 oracle (a vacuous row)\n${msg(r)}`);
        assert.ok(p.some((x) => /interrupted|status|signal|OVERRUN/.test(x)), `old failed for an unexpected reason: ${p.join('; ')}`);
    });
}


// ---- G-SIG-2 scenarios: the driver run that is held (ad: its run; bb: the first probe, diff and file mode; ibd: the first bytecode probe) ----
function fileModeArgs(c) {   // bb ref/file mode: --driver F --before F --after F --out DIR (three plain files in the case dir)
    const drv = join(c.dir, 'fdriver.mjs'), bf = join(c.dir, 'fbefore.mjs'), af = join(c.dir, 'fafter.mjs');
    writeFileSync(drv, "import './fafter.mjs';\n"); writeFileSync(bf, '// before module\n'); writeFileSync(af, '// after module (differs)\n');
    return ['--node', c.node, '--diff', '--fn', 'add', '--out', c.out, '--driver', drv, '--before', bf, '--after', af];
}
const SCEN = [
    { id: 'ad diff run', t: 'allocation-diff', mk: (hold) => mkCase('allocation-diff', { hold }), args: (c) => c.args() },
    { id: 'bb probe diff', t: 'bytecode-budget', mk: (hold) => mkCase('bytecode-budget', { holdProbe: hold }), args: (c) => c.args() },
    { id: 'bb probe file', t: 'bytecode-budget', mk: (hold) => mkCase('bytecode-budget', { holdProbe: hold }), args: (c) => fileModeArgs(c) },
    { id: 'ibd probe', t: 'inlining-budget-diff', mk: (hold) => mkCase('inlining-budget-diff', { holdProbe: hold }),
        args: (c) => ['--node', c.node, '--tiers', 'turbo', '--fn', 'read.set', c.a, c.b] },   // no --no-bytecode: the bytecode probe runs
];
const runScen = (sc, root, sig, hold, what, cap = 60000) => { const c = sc.mk(hold); return runTool({ root, t: sc.t, c, args: sc.args(c), sig, what: `${sc.id} ${what}`, cap }); };

// ======================================================= A1 (G-SIG-2: the probe / run phase) =======================================================
for (const sc of SCEN) for (const sig of SIGS) {
    test(`A1 G-SIG-2 ${sc.id} SIG${sig}: rc 2 no signal, interrupted once, 1 VERDICT, held pid dead, exit within 10 s`, { skip }, async () => {
        const r = await runScen(sc, LIVE(sc.t), sig, 30, `SIG${sig}`, 45000);
        assert.deepEqual(a1Problems(sc.t, sig, r), [], msg(r));
    });
}
// twin: the 085c54d roots keep the held run inside $( ): the tool exits only after the 15 s hold, so it fails the 10 s bound
// (ms = exit - signal; the signal lands right after the hold starts, so ms > 10 s with 15 s of hold). One shared run per scenario (A1o2 + A2 pin).
let TW2 = null;
const twin2 = () => (TW2 ??= Promise.all(SCEN.map((sc) => runScen(sc, oldRoot2(sc.t), 'TERM', 15, 'twin 085c54d SIGTERM', 45000))));
test(`A1o2 OLD twin ${OLD2_SHA}: the held run (ad run, bb probe diff + file, ibd probe) outlives the 10 s bound after SIGTERM`, { skip: OLD2SKIP }, async () => {
    const runs = await twin2();
    for (const [i, r] of runs.entries()) {
        const p = a1Problems(SCEN[i].t, 'TERM', r);
        assert.ok(p.some((x) => /OVERRUN/.test(x)), `${SCEN[i].id}: the old root did not overrun the 10 s bound: ${p.join('; ') || 'no problems'}\n${msg(r)}`);
        assert.ok(r.ms >= 10000, `${SCEN[i].id}: exit ${r.ms} ms after the signal, want > 10000 (hold 15 s)`);
    }
});

// ======================================================= A2 =======================================================
async function retentionCycle(t, root) {
    const runs = await Promise.all(SIGS.map((sig) => { const c = holdCase(t); return runTool({ root, t, c, args: c.args(), sig, what: `${t} SIG${sig} retention` }); }));
    return runs;
}
for (const t of NAMES) {
    test(`A2 retention ${SHORT[t]}: 3 cycles x 3 signals, ${t === 'inlining-budget-diff' ? 'exactly 1 inl-diff-* dir, 0 inlining-budget-diff.* in TMPDIR' : '0 entries in TMPDIR'}`, { skip }, async () => {
        for (let cycle = 1; cycle <= 3; cycle++) {
            const runs = await retentionCycle(t, LIVE(t));
            for (const [i, r] of runs.entries()) {
                const w = `cycle ${cycle} SIG${SIGS[i]}\n${msg(r)}\nTMPDIR: ${JSON.stringify(ls(r.c.tmp))} cwd: ${JSON.stringify(ls(r.c.cwd))}`;
                if (t === 'inlining-budget-diff') {
                    // the default OUT is $TMPDIR/inl-diff-<timestamp> ("always kept", usage text of the tool)
                    const inl = ls(r.c.tmp).filter((n) => n.startsWith('inl-diff-'));
                    assert.equal(inl.length, 1, w);
                    assert.ok(statSync(join(r.c.tmp, inl[0])).isDirectory(), w);
                    assert.deepEqual(ls(r.c.tmp).filter((n) => n.startsWith('inlining-budget-diff.')), [], w);
                } else {
                    assert.deepEqual(ls(r.c.tmp), [], w);
                }
            }
        }
    });
}
// G-SIG-2: retention in the probe / run phase (bb probe diff + file, ibd bytecode probe; ad is the A2 row above, its run is held now)
const a2Entries = (t, r) => `\nTMPDIR: ${JSON.stringify(ls(r.c.tmp))}`;
function a2Check(t, r, w) {
    if (t === 'inlining-budget-diff') {
        const inl = ls(r.c.tmp).filter((n) => n.startsWith('inl-diff-'));
        assert.equal(inl.length, 1, w);
        assert.deepEqual(ls(r.c.tmp).filter((n) => n.startsWith('inlining-budget-diff.')), [], w);
    } else {
        assert.deepEqual(ls(r.c.tmp), [], w);
    }
}
for (const sc of SCEN.filter((x) => x.t !== 'allocation-diff')) {
    test(`A2 G-SIG-2 retention ${sc.id}: 3 cycles x 3 signals in the probe phase, ${sc.t === 'inlining-budget-diff' ? 'exactly 1 inl-diff-*, 0 inlining-budget-diff.*' : '0 entries'} in TMPDIR`, { skip }, async () => {
        for (let cycle = 1; cycle <= 3; cycle++) {
            const runs = await Promise.all(SIGS.map((sig) => runScen(sc, LIVE(sc.t), sig, 30, `SIG${sig} retention`, 45000)));
            for (const [i, r] of runs.entries()) a2Check(sc.t, r, `cycle ${cycle} SIG${SIGS[i]}\n${msg(r)}${a2Entries(sc.t, r)}`);
        }
    });
}
test(`A2 pin ${OLD2_SHA} twin: the old probe / run phase leaves 0 temp entries (its $( ) finishes and runs rm; a regression pin, not a tooth)`, { skip: OLD2SKIP }, async () => {
    const runs = await twin2();
    for (const [i, r] of runs.entries()) a2Check(SCEN[i].t, r, `${SCEN[i].id}\n${msg(r)}${a2Entries(SCEN[i].t, r)}`);
});
// teeth: one fix reverted in a private copy of the live root
test('A2 tooth bb: a mutant dropping `rm -f -- "$BB_TMP"` from the EXIT trap leaves exactly 1 bytecode-budget.* after SIGTERM in the probe', { skip }, async () => {
    const t = 'bytecode-budget';
    const m = mutant(t, 'live', 'no BB_TMP rm in trap', [['[[ -z \\$BB_TMP ]] || rm -f -- \\"\\$BB_TMP\\"; ', '']]);
    const r = await runScen(SCEN[1], m, 'TERM', 30, 'bb trap mutant');
    assert.equal(ls(r.c.tmp).filter((n) => n.startsWith('bytecode-budget.')).length, 1, `TMPDIR: ${JSON.stringify(ls(r.c.tmp))}\n${msg(r)}`);
});
test('A2 tooth ibd: a mutant dropping the IBD_TMP trap leaves exactly 1 inlining-budget-diff.* after SIGTERM in the probe', { skip }, async () => {
    const t = 'inlining-budget-diff';
    const m = mutant(t, 'live', 'no IBD_TMP rm in trap', [['[[ -z \\$IBD_TMP ]] || rm -f -- \\"\\$IBD_TMP\\"; ', '']]);
    const r = await runScen(SCEN[3], m, 'TERM', 30, 'ibd trap mutant');
    assert.equal(ls(r.c.tmp).filter((n) => n.startsWith('inlining-budget-diff.')).length, 1, `TMPDIR: ${JSON.stringify(ls(r.c.tmp))}\n${msg(r)}`);
});

// ======================================================= RMFAIL =======================================================
// the fake sends the SIGTERM itself (kill -TERM $PPID from the probe call), so this runner sends none: it waits for the tool's
// exit (armCap + noTimeout, law 1 / 8), then SIGKILLs its own detached group and the pid the fake wrote (law 10)
async function runSelfSig(root, t, c, args, what, cap = 45000) {
    const so = openSync(c.so, 'w'), se = openSync(c.se, 'w');
    let child;
    try { child = spawnAsync(BASH, [root, ...args], { cwd: c.cwd, env: cleanEnv({ TMPDIR: c.tmp }), detached: true, stdio: ['ignore', so, se] }); }
    finally { closeSync(so); closeSync(se); }
    const h = armCap(child, cap, 'SIGKILL');
    try {
        const ex = await new Promise((res) => {
            child.once('exit', (status, signal) => res({ status, signal }));
            child.once('error', (error) => res({ status: null, signal: null, error }));
        });
        h.clear();
        const r = { status: ex.status, signal: ex.signal, stdout: rd(c.so), stderr: rd(c.se), timedOut: h.timedOut, cap: h.cap, error: ex.error };
        noTimeout(r, what);
        return r;
    } finally {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group gone */ }
        const pid = existsSync(c.pidf) ? Number(rd(c.pidf).trim()) : null;
        if (pid !== null && !isDead(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }   // the fake this run started
    }
}
for (const sc of [SCEN[1], SCEN[3]]) {
    const pre = `${sc.t}.`;
    test(`RMFAIL ${sc.id}: the probe's temp file replaced by a non-empty DIRECTORY (rm -f fails in the EXIT trap) + SIGTERM -> rc 2, interrupted once, 1 VERDICT`, { skip }, async () => {
        const c = sc.mk(0);
        writeFileSync(join(c.dir, 'rmfail'), sc.t);
        const r = await runSelfSig(LIVE(sc.t), sc.t, c, sc.args(c), `${sc.id} rmfail SIGTERM`);
        const both = r.stdout + r.stderr;
        const w = `${msg(r)}\nTMPDIR: ${JSON.stringify(ls(c.tmp))}`;
        const dirs = ls(c.tmp).filter((n) => n.startsWith(pre));
        assert.equal(dirs.length, 1, `the fake did not plant the directory (vacuous row)\n${w}`);
        assert.ok(statSync(join(c.tmp, dirs[0])).isDirectory(), w);
        assert.equal(r.status, 2, w);
        assert.equal(r.signal, null, w);
        assert.equal(both.split(`${sc.t}: interrupted (SIGTERM)`).length - 1, 1, w);
        assert.equal((both.match(/^VERDICT \S+$/gm) || []).length, 1, w);
    });
}
test(`A2o OLD twin bb: the ${OLD_SHA} bytecode-budget leaves exactly 1 entry in TMPDIR after SIGTERM`, { skip: OLDSKIP }, async () => {
    const t = 'bytecode-budget';
    const c = oldHoldCase(t);
    const r = await runTool({ root: oldRoot(t), t, c, args: c.args(), sig: 'TERM', what: 'old bb SIGTERM retention' });
    assert.equal(ls(c.tmp).length, 1, `TMPDIR: ${JSON.stringify(ls(c.tmp))}\n${msg(r)}`);
});
// no sig_arm-dropped mutant for A2: a killed bash still runs its EXIT trap (bash 3.2 measured: the trap cleans TMPDIR), so such a mutant
// does not leak; the bb old twin above is the only retention tooth the spec names (the other four are regression pins here).

// ======================================================= A3 =======================================================
function a3Problems(t, c) {
    const f = join(c.out, 'report.txt');
    if (!existsSync(f)) return [`${f} does not exist`];
    const rep = rd(f);
    const p = [];
    const want = `${t}: interrupted (SIGTERM)\nVERDICT NO-VERDICT\n`;
    if (!rep.endsWith(want)) p.push(`report.txt does not end with ${JSON.stringify(want)}: tail ${JSON.stringify(rep.slice(-120))}`);
    const nv = (rep.match(/^VERDICT \S+$/gm) || []).length;
    if (nv !== 1) p.push(`${nv} VERDICT lines in report.txt, want 1`);
    return p;
}
for (const t of NAMES) {
    test(`A3 ${SHORT[t]} --out: SIGTERM leaves report.txt ending "interrupted (SIGTERM)" + VERDICT NO-VERDICT, 1 VERDICT line`, { skip }, async () => {
        const c = holdCase(t);
        const r = await runTool({ root: LIVE(t), t, c, args: c.args(['--out', c.out]), sig: 'TERM', what: `${t} --out SIGTERM` });
        assert.deepEqual(a3Problems(t, c), [], msg(r));
    });
    test(`A3 OLD twin ${SHORT[t]}: the ${OLD_SHA} root's report.txt lacks the interrupted ending`, { skip: OLDSKIP }, async () => {
        const c = oldHoldCase(t);
        const r = await runTool({ root: oldRoot(t), t, c, args: c.args(['--out', c.out]), sig: 'TERM', what: `old ${t} --out SIGTERM` });
        assert.ok(a3Problems(t, c).length > 0, `the old root passed the A3 oracle\n${msg(r)}`);
    });
}

// ================================================= A4 / A5 (injection) =================================================
const INJ_A4 = 'sh -c "exit 2"\n';
const INJ_A5 = 'FINAL=1; kill -TERM $$; exit 1\n';
function injected(t, base, inj) { return mutant(t, base, `inject ${inj.trim()}`, [[ANCHOR, ANCHOR + inj]]); }
function runInjected(root, t) {
    const c = mkCase(t);
    return spawn(BASH, [root], { cwd: c.cwd, env: cleanEnv({ TMPDIR: c.tmp }), stdio: ['ignore', 'pipe', 'pipe'] }, `${t} injected`, 60000);
}
for (const t of NAMES) {
    const want = `${t}: unexpected error (exit 2)\nVERDICT NO-VERDICT\n`;
    test(`A4 ${SHORT[t]}: an rc-2 abort that is not a die -> rc 2, stderr exactly the unexpected-error line + VERDICT NO-VERDICT`, { skip }, () => {
        const r = runInjected(injected(t, 'live', INJ_A4), t);
        assert.equal(r.status, 2, msg(r));
        assert.equal(r.stderr, want, msg(r));
    });
    test(`A4 OLD twin ${SHORT[t]}: the same injection into the ${OLD_SHA} root gives EMPTY stderr`, { skip: OLDSKIP }, () => {
        const r = runInjected(injected(t, 'old', INJ_A4), t);
        assert.equal(r.status, 2, msg(r));
        assert.equal(r.stderr, '', msg(r));
        assert.notEqual(r.stderr, want);
    });
    test(`A5 ${SHORT[t]}: a signal after FINAL=1 -> rc 1, no interrupted text`, { skip }, () => {
        const r = runInjected(injected(t, 'live', INJ_A5), t);
        assert.equal(r.status, 1, msg(r));
        assert.equal(r.signal, null, msg(r));
        assert.doesNotMatch(r.stdout + r.stderr, /interrupted/, msg(r));
    });
    test(`A5 OLD twin ${SHORT[t]}: the same injection into the ${OLD_SHA} root ends by the signal (SIGTERM or 143), never rc 1`, { skip: OLDSKIP }, () => {
        const r = runInjected(injected(t, 'old', INJ_A5), t);
        assert.ok(r.signal === 'SIGTERM' || r.status === 143, msg(r));
        assert.notEqual(r.status, 1, msg(r));
    });
}

// ======================================================= STDIN =======================================================
const STDIN_BYTES = 'b70-stdin: line one\nline two 0123456789\n';
// catstdin: true = the first driver call AND the first probe call copy stdin (bb, ad, dd, ic); 'probe' = only the first probe call (ibd:
// its trace run would otherwise eat the pipe); where = 'first' (stdin.bin) or 'second' (stdin2.bin, the probe)
function stdinRun(root, t, { args = null, catstdin = true, where = 'first' } = {}) {
    const c = mkCase(t, { catstdin });
    const r = capSync(BASH, [root, ...(args ? args(c) : c.args())], { encoding: 'utf8', env: cleanEnv({ TMPDIR: c.tmp }), cwd: c.cwd, input: STDIN_BYTES, maxBuffer: 1 << 26 }, 60000, `${t} stdin`);
    const f = join(c.dir, where === 'first' ? 'stdin.bin' : 'stdin2.bin');
    assert.ok(existsSync(f), `the ${where} copy never happened (no ${f})\n${msg(r)}\nlog: ${rd(join(c.dir, 'log'))}`);
    const f1 = join(c.dir, 'stdin.bin'), f2 = join(c.dir, 'stdin2.bin');
    return { r, got: existsSync(f1) ? readFileSync(f1, 'utf8') : null, got2: existsSync(f2) ? readFileSync(f2, 'utf8') : null };
}
const IBD_PROBE_ARGS = (c) => ['--node', c.node, '--tiers', 'turbo', '--fn', 'read.set', c.a, c.b];   // no --no-bytecode: the probe runs
// the run / probe site text, per tool (a count-checked LINE fragment; ibd has two `<&0 &` sites, bb and ad one)
const SITE = {
    'deopt-diff': ' <&0 &', 'ic-diff': ' <&0 &',
    'allocation-diff': '>"$T/run.out" <&0 &',
    'bytecode-budget': '>"$BB_TMP" 2>&1 <&0 &',
    'inlining-budget-diff.trace': '>"$raw" 2>&1 <&0 &',
    'inlining-budget-diff.probe': '>"$IBD_TMP" 2>&1 <&0 &',
};
const unsite = (from) => [from, from.replace(' <&0 &', ' &')];
for (const t of NAMES) {
    const ad = t === 'allocation-diff', bb = t === 'bytecode-budget', ibd = t === 'inlining-budget-diff';
    test(`STDIN ${SHORT[t]}: the first ${bb ? 'probe' : 'driver'} run sees exactly the caller's stdin bytes${bb ? ' (the base_list -e call keeps its documented /dev/null)' : ''}`, { skip }, () => {
        const { r, got, got2 } = stdinRun(LIVE(t), t);
        if (bb) {
            assert.equal(got, '', `bb base_list (-e call) stdin is /dev/null (usage text: "stdin /dev/null")\n${msg(r)}`);
            assert.equal(got2, STDIN_BYTES, `bb first probe run\n${msg(r)}`);
        } else {
            assert.equal(got, STDIN_BYTES, msg(r));
        }
    });
    const site = ibd ? SITE['inlining-budget-diff.trace'] : SITE[t];
    test(`STDIN mutant ${SHORT[t]} (the ${bb ? 'probe' : 'run'} site's " <&0 &" -> " &"): ${bb ? 'the first probe' : 'the first driver run'} sees 0 bytes`, { skip }, () => {
        const m = mutant(t, 'live', 'no <&0', [unsite(site)]);
        const { r, got, got2 } = stdinRun(m, t);
        assert.equal(bb ? got2 : got, '', msg(r));
    });
    if (ad || bb) {
        test(`STDIN pin ${SHORT[t]}: the ${OLD2_SHA} root (run / probe still inside $( ), stdin inherited) reads the caller's bytes`, { skip: OLD2SKIP }, () => {
            const { r, got, got2 } = stdinRun(oldRoot2(t), t);
            assert.equal(bb ? got2 : got, STDIN_BYTES, `a regression pin: the old twin already read them\n${msg(r)}`);
        });
    }
}
// ibd's bytecode probe (G-SIG-2): the trace run does not copy stdin (STDIN_ON=probe), so the FIRST probe call is the reader
test('STDIN ibd probe: the first bytecode probe run sees exactly the caller\'s stdin bytes', { skip }, () => {
    const { r, got2 } = stdinRun(LIVE('inlining-budget-diff'), 'inlining-budget-diff', { args: IBD_PROBE_ARGS, catstdin: 'probe', where: 'second' });
    assert.equal(got2, STDIN_BYTES, msg(r));
});
test('STDIN mutant ibd probe (the probe site\'s " <&0 &" -> " &"; the trace site stays): the first bytecode probe sees 0 bytes', { skip }, () => {
    const m = mutant('inlining-budget-diff', 'live', 'no <&0 on probe', [unsite(SITE['inlining-budget-diff.probe'])]);
    const { r, got2 } = stdinRun(m, 'inlining-budget-diff', { args: IBD_PROBE_ARGS, catstdin: 'probe', where: 'second' });
    assert.equal(got2, '', msg(r));
});
test(`STDIN pin ibd probe: the ${OLD2_SHA} root's first bytecode probe (inside $( ), stdin inherited) reads the caller's bytes`, { skip: OLD2SKIP }, () => {
    const { r, got2 } = stdinRun(oldRoot2('inlining-budget-diff'), 'inlining-budget-diff', { args: IBD_PROBE_ARGS, catstdin: 'probe', where: 'second' });
    assert.equal(got2, STDIN_BYTES, `a regression pin\n${msg(r)}`);
});

// ======================================================= A4 (ad append fail-closed, G-SIG-2) =======================================================
// `ulimit -f 32` (a 32 KiB file-size limit; bash counts 1024-byte blocks, POSIX mode 512: 16 / 32 KiB, both under the 64 KiB append) with
// SIGXFSZ ignored makes the append fail with EFBIG, as a full TMPDIR does. The tool runs under a bash -c wrapper (limits are inherited).
function a4Run(root) {
    const t = 'allocation-diff';
    const c = mkCase(t);
    const r = spawn(BASH, ['-c', "ulimit -f 32; trap '' XFSZ; exec \"$0\" \"$@\"", BASH, root, '--node', c.node, '--zero', '--runs', '3', c.a], { cwd: c.cwd, env: cleanEnv({ TMPDIR: c.tmp }), stdio: ['ignore', 'pipe', 'pipe'] }, 'ad append fail', 60000);
    return { r, c };
}
const A4_LINE = '  NO-VERDICT -- driver: cannot read driver output in run 1 (append exited 1)';
test('A4 ad: a failing 64 KiB append -> rc 2, the NO-VERDICT append line in run 1, TMPDIR empty', { skip }, () => {
    const { r, c } = a4Run(LIVE('allocation-diff'));
    assert.equal(r.status, 2, msg(r));
    assert.ok(r.stdout.split('\n').includes(A4_LINE), `want the line ${JSON.stringify(A4_LINE)}\n${msg(r)}`);
    assert.deepEqual(ls(c.tmp), [], msg(r));
});
test(`A4 OLD twin ${OLD2_SHA} ad: the same limits do not give the append NO-VERDICT (run 1 is the unparseable reason)`, { skip: OLD2SKIP }, () => {
    const { r } = a4Run(oldRoot2('allocation-diff'));
    // the fake driver writes no @@LITE-MARK, so rc is 2 on every build here; the tooth is the run-1 reason: the append line is absent
    assert.ok(r.stdout.includes('driver: unparseable --trace-gc output in run 1'), `want the unparseable reason\n${msg(r)}`);
    assert.ok(!r.stdout.includes(A4_LINE) && !/append exited/.test(r.stdout), msg(r));
});
test('A4 tooth ad: a mutant dropping the 64 KiB append line gives no append NO-VERDICT (run 1 is the unparseable reason)', { skip }, () => {
    const m = mutant('allocation-diff', 'live', 'no append', [['  { printf \'%65536s\' \'\' >>"$T/run.out"; } 2>/dev/null || ar=$?\n', '']]);
    const { r } = a4Run(m);
    // the fake driver writes no @@LITE-MARK, so rc is 2 on every build here; the tooth is the run-1 reason: the append line is absent
    assert.ok(r.stdout.includes('driver: unparseable --trace-gc output in run 1'), `want the unparseable reason\n${msg(r)}`);
    assert.ok(!r.stdout.includes(A4_LINE) && !/append exited/.test(r.stdout), msg(r));
});

// ======================================================= H (-h) =======================================================
for (const t of NAMES) {
    const run = (root, flag) => { const c = mkCase(t); return spawn(BASH, [root, flag], { cwd: c.cwd, env: cleanEnv({ TMPDIR: c.tmp }) }, `${t} ${flag}`, 60000); };
    test(`H ${SHORT[t]}: -h and --help give rc 2 with EMPTY stderr`, { skip }, () => {
        for (const flag of ['-h', '--help']) {
            const r = run(LIVE(t), flag);
            assert.equal(r.status, 2, `${flag}\n${msg(r)}`);
            assert.equal(r.stderr, '', `${flag}\n${msg(r)}`);
            assert.ok(r.stdout.length > 0, `${flag}: usage text on stdout`);
        }
    });
    test(`H regression pin ${SHORT[t]}: the ${OLD_SHA} root also gives rc 2 with EMPTY stderr on -h / --help`, { skip: OLDSKIP }, () => {
        for (const flag of ['-h', '--help']) {
            const r = run(oldRoot(t), flag);
            assert.equal(r.status, 2, `${flag}\n${msg(r)}`);
            assert.equal(r.stderr, '', `${flag}\n${msg(r)}`);
        }
    });
    test(`H mutant ${SHORT[t]} (DIED=1 dropped from the -h line): -h prints "unexpected error"`, { skip }, () => {
        const m = mutant(t, 'live', 'no DIED on -h', [['usage; DIED=1; exit 2', 'usage; exit 2']]);
        const r = run(m, '-h');
        assert.equal(r.stderr, `${t}: unexpected error (exit 2)\nVERDICT NO-VERDICT\n`, msg(r));
    });
}
