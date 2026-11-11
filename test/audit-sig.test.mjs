// test/audit-sig.test.mjs -- b70 unit G-SIG-1, helper batch B3: black-box rows for the SIGINT / SIGTERM / SIGHUP handling of
// all five roots (bytecode-budget bb, deopt-diff dd, ic-diff ic, allocation-diff ad, inlining-budget-diff ibd), from
// .handoff/PLAN-b67-gsig.md ASSERTIONS A1-A5 + addenda A1-A3 and ruling Q-B67-STDIN (RULINGS-b67.md), never from what a root
// printed. OLD twin = `git show 465881b:<root>` per tool (parent of this unit), SKIP when the commit is unreachable, FAIL
// under CI_STRICT (CI === 'true'). Every row has an old twin or a mutant that turns it red (law 6).
// Own fake node (bash, shebang /bin/bash): logs one line per call, answers --version / -p / --v8-options (tracked fixture); a
// DRIVER call (argv holds one of -e [bb base_list], --trace-deopt-verbose [dd], --log-ic [ic], --trace-turbo-inlining [ibd],
// --trace-gc [ad]) is held ONCE (the first, an atomic mkdir): it writes its pid to <case>/pid, then `exec sleep N`, so the
// pid IS the sleeper (30 s for dd ic bb ibd, 3 s for ad). The tool's stdout / stderr go to files (no pipe a surviving
// sleeper could hold open); the signal goes to the TOOL pid only (never the group); a final SIGKILL of the own detached
// group + the pid read from the fake's file runs in `finally` (law 10). Signal rows use async spawn only (law 8); every
// async child gets armCap + noTimeout first (law 1). No timing assertion other than the spec's own exit bounds.
//   ROW A1   per tool x SIGTERM / SIGINT / SIGHUP, sent once the driver run has started: status 2, signal null; `<tool>:
//            interrupted (SIG<X>)` exactly once over stdout + stderr; 0 `unexpected error`; exactly 1 `^VERDICT \S+$` line over
//            both streams; the driver pid is dead (ESRCH) at tool exit; the tool exits within 10 s of the signal (overrun =
//            named failure). ad: the run is inside $( ) (G-SIG-2), the driver is `sleep 3`: it finishes, the tool exits within
//            sleep + 5 s, same oracle. ONE oracle function: asserted empty live, non-empty on the old twin.
//   ROW A1o  OLD twin per tool x signal: the 465881b root FAILS the A1 oracle (it has no signal trap: bash dies by the signal,
//            or never prints the `interrupted` line; the failing items are named in the assertion message)
//   ROW A2   retention, 3 cycles x 3 signals per tool, each run in a private TMPDIR (the 3 signals of a cycle run together): 0
//            entries in TMPDIR after each run for bb dd ic ad; ibd (no --out, private cwd): exactly 1 `inl-diff-*` dir (the default
//            OUT lives in TMPDIR, tool usage text) and 0 `inlining-budget-diff.*` in TMPDIR.
//   ROW A2o  tooth: the old bb leaves exactly 1 entry (the A2 spec). The other four A2 rows are regression pins (a sig_arm-dropped mutant
//            does not leak: a killed bash still runs its EXIT trap, so it is no tooth)
//   ROW A3   --out DIR: report.txt ends exactly `<tool>: interrupted (SIGTERM)\nVERDICT NO-VERDICT\n` and has exactly 1 VERDICT line,
//            all 5 tools; OLD twin per tool fails it
//   ROW A4   a copy of the root with `sh -c "exit 2"` inserted after the ANCHOR (the `export LC_ALL=C ...` line, matched exactly
//            once): rc 2, stderr EXACTLY `<tool>: unexpected error (exit 2)\nVERDICT NO-VERDICT\n`, all 5; the same injection into
//            the 465881b root gives EMPTY stderr (red twin)
//   ROW A5   `FINAL=1; kill -TERM $$; exit 1` after the ANCHOR: rc 1, no signal, no `interrupted` text; the 465881b injection ends by
//            the signal (SIGTERM or status 143), never rc 1 (red twin)
//   ROW STDIN ruling Q-B67-STDIN: the fake driver copies its stdin to a file; each tool is spawned with known stdin bytes
//            (written, then the pipe ended); the FIRST driver run of dd ic bb ibd sees exactly those bytes; a mutant root with the
//            run site's ` <&0 &` -> ` &` (count-checked single match) sees 0 bytes (teeth); ad is a regression row (same bytes,
//            no mutant: its run is inside $( ), where stdin is inherited today). bb: its base_list `-e` call has always had stdin
//            /dev/null (documented, old source :1440) and has no <&0 site in G-SIG-1, so that call is pinned at 0 bytes and the FIRST
//            PROBE run (inside $( ), inherits) is pinned at the caller's bytes; no mutant for bb (no <&0 site to remove)
//   ROW H    addendum A1: `-h` and `--help` give rc 2 with EMPTY stderr on all 5 (regression pin: the 465881b root gives the same);
//            a mutant that drops `DIED=1` from the `usage; DIED=1; exit 2` line prints `unexpected error` (teeth)
//   ROW RET  the mkdtemp top is removed in after(); the live `git status --porcelain` `??` set is unchanged
// Per-child caps are explicit (capSync / armCap, 60 s; no raw timeout key: spawn-cap.test.mjs S5). Private dirs under one mkdtemp top.
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
const HOLD = (t) => (t === 'allocation-diff' ? 3 : 30);   // the driver's sleep, seconds
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
const haveOld = spawn('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: PKG }, 'git cat-file').status === 0 ? true : `commit ${OLD_SHA} not available (shallow clone?)`;
const OLDSKIP = skip || (haveOld === true || CI_STRICT ? false : haveOld);
const OLD = {};
function oldRoot(t) {
    if (OLD[t]) return OLD[t];
    const g = spawn('git', ['show', `${OLD_SHA}:${t}.sh`], { cwd: PKG, encoding: 'buffer' }, `git show ${t}.sh`, 30000);
    assert.equal(g.status, 0, `git show ${OLD_SHA}:${t}.sh failed (CI_STRICT: an unreachable pin is a failure)`);
    const p = join(mk('old'), `${t}.sh`);
    writeFileSync(p, g.stdout); chmodSync(p, 0o755);
    return (OLD[t] = p);
}
test(`the old twins are git show ${OLD_SHA}:<root> (5 roots)`, { skip: OLDSKIP }, () => { for (const t of NAMES) assert.ok(existsSync(oldRoot(t)), t); });

// a copy of a root text with edits (each count-checked once)
function mutant(t, base, key, edits) {
    let src = base === 'old' ? rd(oldRoot(t)) : rd(LIVE(t));
    for (const [from, to] of edits) src = once(src, from, to, `${t} ${key}`);
    const p = join(mk('mut'), `${t}.sh`);
    writeFileSync(p, src); chmodSync(p, 0o755);
    return p;
}

// ---- fake node + case ----
function fakeText(dir) {
    return ['#!/bin/bash', `D=${JSON.stringify(dir)}`, 'printf "%s\\n" "$*" >> "$D/log"',
        'case "$1" in',
        '  --version) echo v26.8.2; exit 0 ;;',
        '  -p) echo "v0 (V8 0)"; exit 0 ;;',
        `  --v8-options) cat ${JSON.stringify(OPTS_FIX)}; exit 0 ;;`,
        'esac',
        'drv=0; drv2=0',
        'for a; do case "$a" in -e|--trace-deopt-verbose|--log-ic|--trace-turbo-inlining|--trace-gc) drv=1 ;; esac; done',
        'for a; do case "$a" in --print-bytecode-filter=*) [ "$a" = \'--print-bytecode-filter=*\' ] || drv2=1 ;; esac; done',
        'if [ "$drv2" = 1 ] && [ -f "$D/catstdin" ] && mkdir "$D/first2" 2>/dev/null; then cat > "$D/stdin2.bin"; fi',
        'if [ "$drv" = 1 ] && mkdir "$D/first" 2>/dev/null; then',
        '  if [ -f "$D/catstdin" ]; then cat > "$D/stdin.bin"; fi',
        '  if [ -f "$D/hold" ]; then',
        '    echo $$ > "$D/pid.tmp"; mv "$D/pid.tmp" "$D/pid"',
        '    exec sleep "$(cat "$D/hold")"',
        '  fi',
        'fi',
        'echo "driver ran"', 'exit 0', ''].join('\n');
}
// one case: dir/{node, a/driver.js, b/driver.js, tmp, cwd, out(not created)}; hold = seconds the first driver run sleeps (0 = none)
function mkCase(t, { hold = 0, catstdin = false } = {}) {
    const dir = mk(`case-${SHORT[t]}`);
    const c = { dir, tmp: join(dir, 'tmp'), cwd: join(dir, 'cwd'), out: join(dir, 'out'), node: join(dir, 'node'),
        a: join(dir, 'a', 'driver.js'), b: join(dir, 'b', 'driver.js'), pidf: join(dir, 'pid'), so: join(dir, 'stdout.txt'), se: join(dir, 'stderr.txt') };
    for (const d of [c.tmp, c.cwd, dirname(c.a), dirname(c.b)]) mkdirSync(d, { recursive: true });
    writeFileSync(c.a, '// driver a\n'); writeFileSync(c.b, '// driver b (differs)\n');
    writeFileSync(c.node, fakeText(dir)); chmodSync(c.node, 0o755);
    writeFileSync(join(dir, 'log'), '');
    if (hold > 0) writeFileSync(join(dir, 'hold'), `${hold}\n`);
    if (catstdin) writeFileSync(join(dir, 'catstdin'), '');
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
    const limit = t === 'allocation-diff' ? (HOLD(t) + 5) * 1000 : 10000;
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
const oldHoldCase = (t) => mkCase(t, { hold: t === 'allocation-diff' ? 3 : 12 });   // > the 10 s bound: an old root that waits the driver out still overruns

// ======================================================= A1 =======================================================
for (const t of NAMES) for (const sig of SIGS) {
    test(`A1 ${SHORT[t]} SIG${sig} during the driver run: rc 2 no signal, interrupted once, 1 VERDICT, driver dead, exit in time`, { skip }, async () => {
        const c = holdCase(t);
        const r = await runTool({ root: LIVE(t), t, c, args: c.args(), sig, what: `${t} SIG${sig}` });
        assert.deepEqual(a1Problems(t, sig, r), [], msg(r));
    });
}
for (const t of NAMES) for (const sig of SIGS) {
    test(`A1o OLD twin ${SHORT[t]} SIG${sig}: the ${OLD_SHA} root fails the A1 oracle (no signal trap)`, { skip: OLDSKIP }, async () => {
        const c = oldHoldCase(t);
        const r = await runTool({ root: oldRoot(t), t, c, args: c.args(), sig, what: `old ${t} SIG${sig}` });
        const p = a1Problems(t, sig, r);
        assert.ok(p.length > 0, `the old root passed the A1 oracle (a vacuous row)\n${msg(r)}`);
        assert.ok(p.some((x) => /interrupted|status|signal/.test(x)), `old failed for an unexpected reason: ${p.join('; ')}`);
    });
}

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
function stdinRun(root, t) {
    const c = mkCase(t, { catstdin: true });
    const r = capSync(BASH, [root, ...c.args()], { encoding: 'utf8', env: cleanEnv({ TMPDIR: c.tmp }), cwd: c.cwd, input: STDIN_BYTES, maxBuffer: 1 << 26 }, 60000, `${t} stdin`);
    const f = join(c.dir, 'stdin.bin');
    assert.ok(existsSync(f), `the first driver run never happened (no stdin.bin)\n${msg(r)}\nlog: ${rd(join(c.dir, 'log'))}`);
    const f2 = join(c.dir, 'stdin2.bin');
    return { r, got: readFileSync(f, 'utf8'), got2: existsSync(f2) ? readFileSync(f2, 'utf8') : null };
}
for (const t of NAMES) {
    const ad = t === 'allocation-diff', bb = t === 'bytecode-budget';
    test(`STDIN ${SHORT[t]}: the first driver run sees exactly the caller's stdin bytes${ad ? ' (regression row, no mutant)' : ''}${bb ? ' (probe run; the base_list -e call keeps its documented /dev/null)' : ''}`, { skip }, () => {
        const { r, got, got2 } = stdinRun(LIVE(t), t);
        if (bb) {
            assert.equal(got, '', `bb base_list (-e call) stdin is /dev/null (usage text / old source: "stdin /dev/null")\n${msg(r)}`);
            assert.equal(got2, STDIN_BYTES, `bb first probe run\n${msg(r)}`);
        } else {
            assert.equal(got, STDIN_BYTES, msg(r));
        }
    });
    if (!ad && !bb) {   // bb has no <&0 run site in G-SIG-1 (base_list keeps </dev/null; its probe sits in $( ): G-SIG-2)
        test(`STDIN mutant ${SHORT[t]} (the run site's " <&0 &" -> " &"): the first driver run sees 0 bytes`, { skip }, () => {
            const m = mutant(t, 'live', 'no <&0', [[' <&0 &', ' &']]);
            const { r, got } = stdinRun(m, t);
            assert.equal(got, '', msg(r));
        });
    }
}

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
