// test/spawn-cap.test.mjs -- rows S1-S4 / SE of test/spawn-cap.mjs and census row S5 (b40-b41 TIMEOUT-NAMED, PLAN-timeout-named.md
// ASSERTIONS 1-5).
// ORACLE: fake children whose behaviour the row fixes (a hang, a SIGTERM trap that exits 3, a marker write, an instant
// exit) and the caps given here, never a tool script. Every fake pid is recorded and must be gone (ESRCH) by the last
// row; every temp dir is `scap-*` under os.tmpdir() and removed. S5 (b41 B5) reads the test/*.mjs texts: no raw cap is left.
// G1-G4 (b72 CI-HANG, PLAN-b72-cihang.md ASSERTIONS 1-3): the group-aware forms armGroup / capSync group:true / psGroup; every
// process group they make is recorded and must answer kill(-pgid, 0) ESRCH, in its row and again in the cleanup row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capSync, armCap, armGroup, psGroup, noTimeout, timeoutMsg } from './spawn-cap.mjs';

const DIRS = [];    // every scap- dir this file made
const PIDS = [];    // every fake child pid this file started
function scapDir() { const d = mkdtempSync(join(tmpdir(), 'scap-')); DIRS.push(d); return d; }
function rmDir(d) { rmSync(d, { recursive: true, force: true }); }
function alive(pid) {
    try { process.kill(pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; }
}
// a pid we killed may sit as a zombie (kill -0 answers for it) until its reaper runs: poll until it is gone
async function gone(pid, tries = 250) {
    for (let i = 0; i < tries && alive(pid); i++) await new Promise((r) => setTimeout(r, 20));
    return !alive(pid);
}
function caught(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}
// the async result shape a caller builds from 'close' (spawn-cap.mjs header)
function runArmed(cmd, args, opts, cap, sig) {
    const c = spawn(cmd, args, opts);
    PIDS.push(c.pid);
    const h = sig === undefined ? armCap(c, cap) : armCap(c, cap, sig);
    let out = ''; let err = '';
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t0 = Date.now();
    const done = new Promise((res) => c.on('close', (status, signal) => {
        h.clear();
        res({ status, signal, stdout: out, stderr: err, timedOut: h.timedOut, cap: h.cap, ms: Date.now() - t0, pid: c.pid });
    }));
    return { c, h, done };
}

// S1 (ASSERTION 1): a hang under a 300 ms cap throws "<what> timed out after 300 ms (killed by SIGTERM)" well inside
// 10 s, and the killed child is reaped (spawnSync waits for it): kill(pid, 0) -> ESRCH. Must-fail: capSync without its
// noTimeout call returns status null and throws nothing.
test('S1 capSync: a hang under a 300 ms cap throws "hang-fake timed out after 300 ms (killed by SIGTERM)" in < 10000 ms; the fake pid is gone', () => {
    const d = scapDir();
    try {
        const P = join(d, 'pid');
        const t0 = Date.now();
        // $0 = d, and exec -a keeps it as the sleep's argv[0]: from spawn to death the fake's command line holds d
        const e = caught(() => capSync('bash', ['-c', 'echo $$ >"$P.tmp" && mv "$P.tmp" "$P"; exec -a "$0" sleep 30', d], { encoding: 'utf8', env: { ...process.env, P } }, 300, 'hang-fake'));
        const ms = Date.now() - t0;
        assert.ok(e, 'capSync must throw on a run its cap killed');
        assert.match(e.message, /^hang-fake timed out after 300 ms \(killed by SIGTERM\)/);
        assert.ok(e instanceof assert.AssertionError, `an assertion failure, got ${e.name}`);
        assert.ok(ms < 10000, `capSync returned after ${ms} ms`);
        // a bash slower than the cap never wrote P (written via .tmp + mv: never seen half-written); when it did, that pid
        // is gone (and the cleanup row checks it again)
        if (existsSync(P)) {
            const pid = Number(readFileSync(P, 'utf8').trim());
            assert.ok(Number.isInteger(pid) && pid > 1, `pid ${pid}`);
            PIDS.push(pid);
            assert.equal(alive(pid), false, `the fake ${pid} (exec sleep 30) must be reaped by spawnSync`);
        }
        // b41 B5 (b40 B0 review NIT: "the fake pid is gone" was checked only when P existed): UNCONDITIONAL -- no process on
        // the host shows d in its command line any more (bash before its exec, or the sleep after it; P written or not).
        // The probe is ps itself under argv[0] = d/ps-probe: its own row must be listed and be the ONLY d row (the teeth:
        // ps prints full command lines, -ww, and shows an exec -a name).
        // b41 B5 r2 (review B4): a cap that fires while bash runs its foreground `mv` orphans that mv, which still shows d
        // until it exits: re-probe up to 50 x 100 ms until only the probe holds d, then assert on the last probe (a surviving
        // `sleep 30` outlives the 5 s and stays red).
        const nap = new Int32Array(new SharedArrayBuffer(4));
        let ps = null; let rows = null;
        for (let i = 0; i < 50; i++) {
            if (i > 0) Atomics.wait(nap, 0, 0, 100);
            ps = capSync('bash', ['-c', 'exec -a "$0" ps -A -ww -o pid=,args=', join(d, 'ps-probe')], { encoding: 'utf8' }, 30000, 'ps probe');
            assert.equal(ps.status, 0, `ps -A -ww -o pid=,args= exit ${ps.status}: ${ps.stderr}`);
            rows = ps.stdout.split('\n').filter((l) => l.includes(d));
            if (rows.length === 1 && Number(rows[0].trim().split(/\s+/)[0]) === ps.pid) break;
        }
        assert.deepEqual(rows.map((l) => Number(l.trim().split(/\s+/)[0])), [ps.pid], `only the ps probe may show ${d}:\n${rows.join('\n')}`);
    } finally { rmDir(d); }
});
// S1b (b40 TN B0 r2, review NIT): opts.killSignal passes through to spawnSync -- the same hang under opts
// { killSignal: 'SIGKILL' } is killed by SIGKILL and says so. Must-fail: capSync building its options from named keys
// (encoding / env / maxBuffer) instead of the spread (mutant X2) -> killed by the default SIGTERM.
test('S1b capSync: a hang under a 300 ms cap with opts { killSignal: "SIGKILL" } throws "hang-kill timed out after 300 ms (killed by SIGKILL)"', () => {
    const d = scapDir();
    try {
        const P = join(d, 'pid');
        const e = caught(() => capSync('bash', ['-c', 'echo $$ >"$P.tmp" && mv "$P.tmp" "$P"; exec sleep 30'], { encoding: 'utf8', env: { ...process.env, P }, killSignal: 'SIGKILL' }, 300, 'hang-kill'));
        assert.ok(e, 'capSync must throw on a run its cap killed');
        assert.match(e.message, /^hang-kill timed out after 300 ms \(killed by SIGKILL\)\n/);
        if (existsSync(P)) {
            const pid = Number(readFileSync(P, 'utf8').trim());
            assert.ok(Number.isInteger(pid) && pid > 1, `pid ${pid}`);
            PIDS.push(pid);
            assert.equal(alive(pid), false, `the fake ${pid} must be reaped by spawnSync`);
        }
    } finally { rmDir(d); }
});

// S2 (ASSERTION 2): a child that traps SIGTERM and exits 3 under a 300 ms cap: the message prints its real exit status,
// never an assumed SIGTERM. Must-fail: a timeoutMsg with `r.signal || 'SIGTERM'`.
test('S2 capSync: a SIGTERM-trapping fake (exit 3) under a 300 ms cap -> "(exit status 3, no signal)", no "SIGTERM"; timeoutMsg pure cases', async () => {
    const d = scapDir();
    try {
        const M = join(d, 'trap-set'); const Q = join(d, 'bg');
        const src = `trap 'kill $! 2>/dev/null; exit 3' TERM; : >"$M"; sleep 30 >/dev/null 2>&1 & echo $! >"$Q"; wait`;
        const e = caught(() => capSync('bash', ['-c', src], { encoding: 'utf8', env: { ...process.env, M, Q } }, 300, 'trap-fake'));
        assert.ok(existsSync(M), 'the fake set its TERM trap before the cap (host too slow to start bash in 300 ms?)');
        assert.ok(e, 'capSync must throw on a run its cap fired on');
        const head = e.message.split('\n')[0];
        assert.equal(head, 'trap-fake timed out after 300 ms (exit status 3, no signal)');
        assert.doesNotMatch(e.message, /SIGTERM/);
        if (existsSync(Q)) {
            const bg = Number(readFileSync(Q, 'utf8').trim());
            PIDS.push(bg);
            assert.ok(await gone(bg), `the fake's background sleep ${bg} must be gone`);
        }
    } finally { rmDir(d); }
    // pure: the null-signal form, the tail (last 8 stdout lines + stderr), the non-timeout '' and the default what
    const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const m = timeoutMsg({ timedOut: true, cap: 300, signal: null, status: 1, stdout: lines, stderr: 'boom\n', what: 'w' });
    assert.equal(m, 'w timed out after 300 ms (exit status 1, no signal)\n--- stdout (last 8 lines):\n'
        + 'line 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11\nline 12\n--- stderr:\nboom\n');
    assert.equal(timeoutMsg({ timedOut: true, cap: 7, signal: 'SIGKILL', status: null, stdout: null, stderr: null }, 'x').split('\n')[0],
        'x timed out after 7 ms (killed by SIGKILL)');
    assert.equal(timeoutMsg({ timedOut: false, cap: 300, signal: null, status: 1, stdout: '' }, 'w'), '');
    assert.equal(caught(() => noTimeout({ timedOut: false, error: Object.assign(new Error('nope'), { code: 'ENOENT' }) }, 'raw')).message, 'raw spawn error ENOENT');
    const enoent = caught(() => capSync('/nonexistent/scap-no-such-cmd', [], {}, 60000, 'missing'));
    assert.equal(enoent && enoent.message, 'missing spawn error ENOENT');
    noTimeout({ timedOut: false, status: 1 }, 'ok-run');   // a plain non-zero status is the caller's to assert
});

// S3 (ASSERTION 3): a bad cap or an opts.timeout is refused BEFORE any spawn (the marker the child would write stays
// absent). Control: raw spawnSync with timeout 0 means NO timeout (sleep 0.3 exits 0, no ETIMEDOUT) -- why 0 is refused.
test('S3 capSync: caps 0, -1, 1.5, "300", NaN, undefined, 2^31 and opts {timeout: 5} throw before spawning; raw timeout 0 = no timeout', () => {
    const d = scapDir();
    try {
        const M = join(d, 'ran');
        const env = { ...process.env, M };
        const run = (opts, cap, what = 'refuse-fake') => () => capSync('bash', ['-c', ': >"$M"'], opts, cap, what);
        for (const cap of [0, -1, 1.5, '300', NaN, undefined, Infinity, 2147483648]) {
            assert.throws(run({ env }, cap), (e) => e instanceof TypeError && /^spawn-cap: refuse-fake: cap must be an integer ms/.test(e.message), `cap ${String(cap)}`);
            assert.equal(existsSync(M), false, `cap ${String(cap)}: nothing may spawn`);
        }
        assert.throws(run({ env, timeout: 5 }, 300), /^TypeError: spawn-cap: refuse-fake: opts\.timeout is refused/);
        assert.throws(run(Object.assign(Object.create({ timeout: 5 }), { env }), 300), /opts\.timeout is refused|plain object/);
        assert.throws(run([], 300), /opts must be a plain object/);
        assert.throws(run({ env }, 300, ''), /what must be a non-empty string/);
        assert.equal(existsSync(M), false, 'a refused opts / what spawns nothing');
        // teeth for "marker absent": a valid cap does spawn and the marker appears
        const ok = capSync('bash', ['-c', ': >"$M"'], { env }, 60000, 'refuse-fake');
        assert.deepEqual([ok.status, ok.signal, ok.timedOut, ok.cap, ok.what], [0, null, false, 60000, 'refuse-fake']);
        assert.equal(existsSync(M), true, 'a valid cap spawns');
    } finally { rmDir(d); }
    const raw = spawnSync('sleep', ['0.3'], { timeout: 0 });
    assert.equal(raw.error, undefined, `timeout 0: ${raw.error && raw.error.code}`);
    assert.deepEqual([raw.status, raw.signal], [0, null]);
});

// S4 (ASSERTION 4): armCap. (a) a child that EXITED while a spawnSync blocked the loop past its cap is no timeout:
// timedOut false, status 0. The blocker returns only after the child's marker exists (its last act), then ps shows the
// child gone or a zombie, then a further cap + 0.3 s = 0.35 s -- no fixed wait races the child (b40 TA pattern). Must-fail: no
// setImmediate (timer kills at once) or the flag on 'close' -> timedOut true. (b) a `sleep 30` child under armCap 200 ->
// noTimeout throws "timed out after 200 ms (killed by SIGTERM)"; under armCap(.., 'SIGKILL') -> "(killed by SIGKILL)".
test('S4 armCap: a child that exited while a spawnSync blocked the loop past its 50 ms cap -> timedOut false, status 0', async () => {
    const d = scapDir();
    try {
        const mark = join(d, 'pid');
        const fast = join(d, 'fast.sh');
        writeFileSync(fast, `#!/usr/bin/env bash\necho "ok fast"\necho $$ > '${mark}.tmp' && mv '${mark}.tmp' '${mark}'\nexit 0\n`);
        chmodSync(fast, 0o755);
        const blk = join(d, 'block.sh');
        writeFileSync(blk, ['#!/usr/bin/env bash', '[ -n "$(ps -o stat= -p $$ 2>/dev/null | tr -d \' \')" ] || exit 5',
            'i=0; while [ ! -s "$1" ] && [ $i -lt 600 ]; do sleep 0.1; i=$((i + 1)); done; [ -s "$1" ] || exit 3', 'pid=$(cat "$1")',
            'i=0; while [ $i -lt 600 ]; do st=$(ps -o stat= -p "$pid" 2>/dev/null | tr -d \' \'); case $st in "" | Z*) break ;; esac; sleep 0.1; i=$((i + 1)); done',
            'case $st in "" | Z*) ;; *) exit 4 ;; esac', 'sleep "$2"', ''].join('\n'));
        chmodSync(blk, 0o755);
        const cap = 50; const t0 = Date.now();
        const { done } = runArmed('bash', [fast], {}, cap);
        const b = spawnSync('bash', [blk, mark, '0.35'], { encoding: 'utf8', timeout: 120000 });
        assert.equal(b.status, 0, `blocker: 5 = ps -o stat= -p $$ does not work here, 3 = no marker in 60 s, 4 = the fake still runs (${b.signal} ${b.error && b.error.code}) ${b.stderr}`);
        assert.ok(Date.now() - t0 >= cap + 300, 'the loop was blocked past the cap');
        const r = await done;
        assert.deepEqual([r.timedOut, r.status, r.signal, r.stdout], [false, 0, null, 'ok fast\n'], `${timeoutMsg(r, 'fast-fake')} ${r.stderr}`);
        assert.ok(r.ms >= cap, `the run saw ${r.ms} ms, its cap ${cap} ms was due`);
        noTimeout(r, 'fast-fake');
        assert.ok(await gone(r.pid), `fast fake ${r.pid} gone`);
    } finally { rmDir(d); }
});
test('S4 armCap: a sleep 30 child under armCap 200 -> noTimeout throws "timed out after 200 ms (killed by SIGTERM)"; sig SIGKILL -> "(killed by SIGKILL)"', async () => {
    for (const sig of [undefined, 'SIGKILL']) {
        const want = sig || 'SIGTERM';
        const { done } = runArmed('bash', ['-c', 'echo "started"; exec sleep 30'], { stdio: ['ignore', 'pipe', 'pipe'] }, 200, sig);
        const r = await done;
        assert.deepEqual([r.timedOut, r.cap, r.status, r.signal], [true, 200, null, want], r.stderr);
        assert.ok(r.ms < 10000, `killed after ${r.ms} ms`);
        assert.throws(() => noTimeout(r, 'sleep-fake'), (e) => e instanceof assert.AssertionError
            && e.message.startsWith(`sleep-fake timed out after 200 ms (killed by ${want})\n--- stdout (last 8 lines):\nstarted\n`));
        assert.ok(await gone(r.pid), `sleep fake ${r.pid} gone`);
    }
    // the guards: cap 0 / bad sig / not a child refused before anything is armed
    const c = spawn('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
    PIDS.push(c.pid);
    const closed = new Promise((res) => c.on('close', res));
    assert.throws(() => armCap(c, 0), /cap must be an integer ms/);
    assert.throws(() => armCap(c, 100, 'TERM'), /sig must be a signal name of os\.constants\.signals/);
    assert.throws(() => armCap({}, 100), /child must be a ChildProcess/);
    // b40 TN B0 r2 (review B1): a look-alike with kill / once is no ChildProcess (its exitCode undefined read as "exited")
    assert.throws(() => armCap({ kill() {}, once() {} }, 100), /child must be a ChildProcess/);
    await closed;
    const late = armCap(c, 1);   // armed after the exit: arms nothing, never kills
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(late.timedOut, false);
    late.clear();
});

// b40 TN B0 r2 (review B2): an unknown signal name is refused at arm time, before any listener or timer -- never left to
// throw ERR_UNKNOWN_SIGNAL inside the timer with the child still running. The child is killed here, by its own pid.
test('S4 armCap: sig "SIGFOO" on a live child throws before arming (no exit listener, no timer); the child is killed by pid', async () => {
    const c = spawn('bash', ['-c', 'exec sleep 30'], { stdio: 'ignore' });
    PIDS.push(c.pid);
    const closed = new Promise((res) => c.on('close', (status, signal) => res({ status, signal })));
    try {
        const before = c.listenerCount('exit');
        assert.throws(() => armCap(c, 100, 'SIGFOO'), (e) => e instanceof TypeError && /^spawn-cap: armCap: sig must be a signal name of os\.constants\.signals, got SIGFOO$/.test(e.message));
        assert.equal(c.listenerCount('exit'), before, 'a refused armCap adds no exit listener');
    } finally {
        try { process.kill(c.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
    assert.deepEqual(await closed, { status: null, signal: 'SIGTERM' }, 'killed by this row, not by a cap');
    assert.ok(await gone(c.pid), `sleep fake ${c.pid} gone`);
});

// SE (b40 CI-EPIPE, ruling Q-EP1): a child that exits before reading its stdin makes spawnSync's stdin write hit EPIPE; 1 MiB
// (past any pipe buffer) makes that deterministic (.handoff/evidence/b40-epipe/probe.out). capSync returns such a run when the child
// exited by itself (a numeric status), r.error kept; a signal death (status null) still throws by name. Real children on both
// paths (the predicate stays internal: other lanes import spawn-cap.mjs, its exports do not change). Must-fail: capSync calling
// noTimeout on every r.error (the b40 TN form) -> the exit-1 row throws "spawn error EPIPE"; a predicate without the status test
// -> the SIGKILL row returns instead of throwing.
const MIB = 'x'.repeat(1 << 20);
test('SE capSync: exit 1 at once on 1 MiB of input -> returned (status 1, r.error EPIPE kept); a self-SIGKILL on 1 MiB -> throws "sk-fake spawn error EPIPE"', () => {
    const r = capSync('bash', ['-c', 'exit 1'], { encoding: 'utf8', input: MIB }, 60000, 'ex-fake');
    assert.deepEqual([r.status, r.signal, r.timedOut, r.error && r.error.code, r.stdout, r.stderr], [1, null, false, 'EPIPE', '', '']);
    const z = capSync('bash', ['-c', 'exit 0'], { encoding: 'utf8', input: MIB }, 60000, 'ex0-fake');
    assert.deepEqual([z.status, z.error && z.error.code], [0, 'EPIPE']);
    const e = caught(() => capSync('bash', ['-c', 'kill -KILL $$'], { encoding: 'utf8', input: MIB }, 60000, 'sk-fake'));
    assert.ok(e instanceof assert.AssertionError, `a signal death with EPIPE must throw an assertion, got ${e && e.name}`);
    assert.equal(e.message, 'sk-fake spawn error EPIPE');
    assert.equal(caught(() => capSync('bash', ['-c', "trap 'exit 3' TERM; printf '%04096d' 0; while :; do :; done"], { encoding: 'utf8', maxBuffer: 16 }, 60000, 'nb-fake')).message, 'nb-fake spawn error ENOBUFS');
    // the raw shape the SIGKILL row rests on (if the platform ever reported it otherwise, the row above says why)
    const raw = spawnSync('bash', ['-c', 'kill -KILL $$'], { encoding: 'utf8', input: MIB, timeout: 60000 });
    assert.deepEqual([raw.status, raw.signal, raw.error && raw.error.code], [null, 'SIGKILL', 'EPIPE']);
    // noTimeout's own contract is unchanged: any r.error throws there (the EPIPE rule is capSync's)
    assert.equal(caught(() => noTimeout({ timedOut: false, status: 1, signal: null, error: Object.assign(new Error('e'), { code: 'EPIPE' }) }, 'nt')).message, 'nt spawn error EPIPE');
});

// S5 (ASSERTION 5, b41 B5): the census. After b41 every capped spawn of test/*.mjs goes through spawn-cap.mjs, so the
// PENDING list and the allowlist are EMPTY: any raw cap in a test/*.mjs outside EXEMPT is a finding (file:line + pattern).
// The whole text is read, comments included (prose that trips a pattern is reworded, never exempted).
//   RE1  /\btimeout\s*:\s*\d/ and RE2 /setTimeout\(\s*\(\)\s*=>\s*\w+\.kill\(/ -- ASSERTION 5 verbatim.
//   RE1W (N0 MISS a, fail closed) any `timeout` KEY: line start / `{` / `,` then timeout (bare or quoted) then `:` `,` or
//        `}` (a literal, an identifier cap `timeout: cap`, a shorthand `{ timeout }`), a computed key `['timeout']:`, or
//        an assignment `.timeout =` / `['timeout'] =` (also `??=` `||=` `&&=`). capSync refuses opts.timeout, so no spawn options object may carry one. It also counts node:test
//        option objects (`{ timeout: N }` passed to test() / describe()): there are NONE in test/*.mjs (b41 grep), so
//        none may appear -- a per-test timeout would need its own entry here, with its reason.
//   TIMER (N0 MISS b) every setTimeout( / setInterval( whose call text holds kill( / group( / SIG<NAME>, or whose callback is
//        an identifier other than the resolver of its own `new Promise((r) => setTimeout(r, ms))` sleep (opaque: it could
//        kill; a 1-param arrow that forwards its argument to setTimeout is NOT a sleep).
//        Allowed only by TIMER_OK (file, exact count, a text each of them holds): the two escalation timers named by their
//        `escalated` flag and the deopt-diff-boundary mid-run SIGTERM poll (a kill under test, not a cap). A new one in any
//        file is red; so is an allowed one that loses its text, and a count that moves either way.
// Out of scope (N0 MISS c): a polling-loop bound with no timer (deopt-diff-stage-boundary's 1500 x 20 ms wait for its ready
// marker): no pattern tells a bound from a loop. Only top-level test/*.mjs is read (test/fixtures/ holds inputs, not tests).
// Also not seen (b41 B5 r2 review NIT): `setTimeout(c.kill.bind(c), ms)` with no SIG argument; AbortSignal.timeout(ms) passed
// as a spawn `signal`; a node:timers/promises sleep followed by a kill; a key preceded by a /* */ comment
// (`{ /* c */ timeout: 5 }`). Each is a known blind spot, not a pass.
// Must-fail controls (in the row): synthetic sources with one raw site per pattern count exactly 1; one live file with one
// raw `timeout: 5` re-added is red naming file + line. The texts at S5_PIN (before the b41 conversions) count exactly
// S5_PIN_N in their own history row (S5 teeth): CI=true FAILS it when S5_PIN is missing, locally it skips with the reason.
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TEST_DIR);
const EXEMPT = new Map([
    ['spawn-cap.mjs', 'the helper itself: capSync hands its cap to spawnSync as the timeout, armCap owns the kill timer'],
    ['spawn-cap.test.mjs', 'its rows run raw spawnSync controls on purpose (S3 timeout 0, the S4 blocker, the SE raw shape)'],
]);
const TIMER_OK = new Map([
    ['bytecode-budget-stage-boundary.test.mjs', [1, 'escalated = true', 'sigintRun: SIGKILL to the group 30 s after its SIGINT']],
    ['deopt-diff-stage-boundary.test.mjs', [1, 'escalated = true', 'row 12: SIGKILL to the group 30 s after its SIGTERM']],
    ['deopt-diff-boundary.test.mjs', [1, 'clearInterval(poll)', 'a setInterval poll that SIGTERMs the run mid-way: the kill under test']],
]);
const S5_RE1 = /\btimeout\s*:\s*\d/g;
const S5_RE2 = /setTimeout\(\s*\(\)\s*=>\s*\w+\.kill\(/g;
const S5_RE1W = /(?:^|[{,])\s*(?:timeout|'timeout'|"timeout")\s*[:,}]|\[\s*['"]timeout['"]\s*\]\s*:|\.timeout\s*(?:\?\?|\|\||&&)?=(?!=)|\[\s*['"]timeout['"]\s*\]\s*(?:\?\?|\|\||&&)?=(?!=)/gm;
const S5_TIMER = /\bset(?:Timeout|Interval)\s*\(/g;
const S5_KILLY = /\bkill\s*\(|\bgroup\s*\(|\bSIG[A-Z]+/;
const S5_PIN = 'aecb40f';
const S5_PIN_N = { RE1: 14, RE2: 2, RE1W: 18, TIMER: 5 };
const lineAt = (src, i) => src.slice(0, i).split('\n').length;
// a call's text from its '(' to the matching ')'; parens in strings are not special: an unbalanced call runs to the end of
// the file, which can only add findings
function callText(src, open) {
    let depth = 0;
    for (let k = open; k < src.length; k++) {
        if (src[k] === '(') depth++;
        else if (src[k] === ')' && --depth === 0) return src.slice(open, k + 1);
    }
    return src.slice(open);
}
function censusOf(name, src) {
    const raw = [];
    const n = { RE1: 0, RE2: 0, RE1W: 0, TIMER: 0 };
    for (const [tag, re] of [['RE1', S5_RE1], ['RE2', S5_RE2], ['RE1W', S5_RE1W]]) {
        for (const m of src.matchAll(re)) {
            n[tag]++;
            raw.push(`${name}:${lineAt(src, m.index + Math.max(0, m[0].search(/timeout|setTimeout/)))} ${tag}`);
        }
    }
    const timers = [];
    for (const m of src.matchAll(S5_TIMER)) {
        const call = callText(src, m.index + m[0].length - 1);
        const id = /^\(\s*([A-Za-z_$][\w$]*)\s*,/.exec(call);
        // b41 B5 r2 (review B2): only the resolver of a `new Promise((r) => setTimeout(r, ms))` sleep is exempt
        const rid = id && id[1].replace(/\$/g, '\\$');
        const sleep = id && new RegExp(`new\\s+Promise\\(\\s*(?:\\(\\s*${rid}\\s*\\)|\\b${rid})\\s*=>\\s*$`).test(src.slice(Math.max(0, m.index - 60), m.index));
        if (id ? !sleep : S5_KILLY.test(call)) timers.push({ line: lineAt(src, m.index), kind: id ? 'opaque' : 'kill', call });
    }
    const ok = TIMER_OK.get(name);
    const allowed = ok !== undefined && timers.length === ok[0] && timers.every((t) => t.call.includes(ok[1]));
    if (!allowed) {
        for (const t of timers) { n.TIMER++; raw.push(`${name}:${t.line} TIMER(${t.kind})`); }
        if (ok !== undefined) raw.push(`${name} TIMER_OK wants ${ok[0]} timer(s) holding "${ok[1]}", found ${timers.length}`);
    }
    return { raw, n };
}
test('S5 census: no raw cap (timeout key, kill timer) is left in test/*.mjs outside spawn-cap.mjs / spawn-cap.test.mjs; synthetic and re-added controls are red', () => {
    // synthetic must-fail controls: one site per pattern -> exactly 1; look-alike prose / sleeps / test options -> 0
    const syn = (src) => censusOf('syn.mjs', src).n;
    assert.deepEqual(syn("spawnSync('x', [], { timeout: 5 });\n"), { RE1: 1, RE2: 0, RE1W: 1, TIMER: 0 });
    assert.deepEqual(syn("const t = setTimeout(() => c.kill('SIGKILL'), 100);\n"), { RE1: 0, RE2: 1, RE1W: 0, TIMER: 1 });
    assert.deepEqual(syn("spawnSync('x', [], {\n    env,\n    timeout: CAP,\n});\n"), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 });
    assert.deepEqual(syn("spawnSync('x', [], { env, timeout });\n"), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 });
    assert.deepEqual(syn("o.timeout = cap;\n"), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 });
    for (const op of ['??=', '||=', '&&=']) {
        assert.deepEqual(syn(`opts.timeout ${op} cap;\n`), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 }, `.timeout ${op}`);
        assert.deepEqual(syn(`opts['timeout'] ${op} cap;\n`), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 }, `['timeout'] ${op}`);
    }
    assert.deepEqual(syn("spawnSync('x', [], { ['timeout']: 5 });\n"), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 });
    assert.deepEqual(syn("spawnSync('x', [], { [\"timeout\"]: cap });\n"), { RE1: 0, RE2: 0, RE1W: 1, TIMER: 0 });
    assert.deepEqual(syn("const later = (fn) => setTimeout(fn, 30000);\nconst l2 = fn => setTimeout(fn, 30000);\n"), { RE1: 0, RE2: 0, RE1W: 0, TIMER: 2 });
    assert.deepEqual(syn("test('t', { timeout: 5000 }, () => {});\n"), { RE1: 1, RE2: 0, RE1W: 1, TIMER: 0 });
    assert.deepEqual(syn("h = setTimeout(() => { escalated = true; try { process.kill(-ch.pid, 'SIGKILL'); } catch { /* gone */ } }, 30000);\n"), { RE1: 0, RE2: 0, RE1W: 0, TIMER: 1 });
    assert.deepEqual(syn("hard = setTimeout(() => group('SIGKILL'), 30000);\n"), { RE1: 0, RE2: 0, RE1W: 0, TIMER: 1 });
    assert.deepEqual(syn("const t = setTimeout(stop, 30000);\n"), { RE1: 0, RE2: 0, RE1W: 0, TIMER: 1 });
    assert.deepEqual(syn("p = setInterval(() => { c.kill('SIGTERM'); }, 20);\n"), { RE1: 0, RE2: 0, RE1W: 0, TIMER: 1 });
    assert.deepEqual(syn("// the timeout: an exact predicate\nawait new Promise((r) => setTimeout(r, 20));\nawait new Promise(res => setTimeout(res, 5));\n"
        + "const m = `no timeout / spawn error`;\ntest('t', { skip }, () => {});\nif (opts.timeout === 5) x();\nif (opts.timeout >= 5 || opts.timeout !== 1) x();\n"), { RE1: 0, RE2: 0, RE1W: 0, TIMER: 0 });
    // TIMER_OK has teeth: the allowed escalation passes only with its flag, only at its exact count
    const esc = "h = setTimeout(() => { escalated = true; process.kill(-ch.pid, 'SIGKILL'); }, 30000);\n";
    assert.deepEqual(censusOf('deopt-diff-stage-boundary.test.mjs', esc).raw, []);
    assert.deepEqual(censusOf('deopt-diff-stage-boundary.test.mjs', esc.replace('escalated = true; ', '')).raw,
        ['deopt-diff-stage-boundary.test.mjs:1 TIMER(kill)', 'deopt-diff-stage-boundary.test.mjs TIMER_OK wants 1 timer(s) holding "escalated = true", found 1']);
    assert.equal(censusOf('deopt-diff-stage-boundary.test.mjs', esc + esc).n.TIMER, 2);
    assert.equal(censusOf('build.test.mjs', esc).n.TIMER, 1, 'an escalation timer in a file TIMER_OK does not name is raw');

    // the live files
    for (const n of EXEMPT.keys()) assert.ok(existsSync(join(TEST_DIR, n)), `EXEMPT ${n} is a live file (a stale exemption is a finding)`);
    const live = readdirSync(TEST_DIR).filter((n) => n.endsWith('.mjs') && !EXEMPT.has(n)).sort();
    assert.ok(live.length >= 19 && live.includes('nul-awk.mjs') && live.includes('build.test.mjs'), `test/*.mjs read: ${live.join(' ')}`);
    for (const n of TIMER_OK.keys()) assert.ok(live.includes(n), `TIMER_OK ${n} is a live file`);
    const texts = new Map(live.map((n) => [n, readFileSync(join(TEST_DIR, n), 'utf8')]));
    const raw = live.flatMap((n) => censusOf(n, texts.get(n)).raw);
    assert.deepEqual(raw, [], `raw caps outside spawn-cap.mjs (convert them to capSync / armCap):\n${raw.join('\n')}`);
    // must-fail: one live file with one raw `timeout: 5` re-added at line 2 is red, by file and line
    const b = texts.get('build.test.mjs').split('\n');
    b.splice(1, 0, "const r = spawnSync('bash', ['-c', 'exit 0'], { timeout: 5 });");
    assert.deepEqual(censusOf('build.test.mjs', b.join('\n')).raw, ['build.test.mjs:2 RE1', 'build.test.mjs:2 RE1W']);
});

// S5 teeth (history row, b41 B5 r2 review B5): the texts at S5_PIN (deopt-diff / v8flags local helpers, the four PENDING
// files, ext-audit unconverted) count exactly S5_PIN_N. CI=true: a missing S5_PIN FAILS this row (one spelling with the
// other history rows); locally it skips with the reason. ls-tree --full-tree: ROOT may be a subdir of the repo (an overlay).
const S5_ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete S5_ENV[k];
const hasPin = capSync('git', ['-C', ROOT, 'cat-file', '-e', `${S5_PIN}^{commit}`], { env: S5_ENV }, 30000, 'git cat-file').status === 0
    ? true : `no git history with ${S5_PIN}: not checked, never passed`;
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (have) => { if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`); };
test(`S5 teeth: the test/*.mjs texts at ${S5_PIN} count exactly RE1 ${S5_PIN_N.RE1} / RE2 ${S5_PIN_N.RE2} / RE1W ${S5_PIN_N.RE1W} / TIMER ${S5_PIN_N.TIMER} (git history row)`,
    { skip: histSkip(hasPin) }, () => {
    histGate(hasPin);
    const env = S5_ENV;
    const ls = capSync('git', ['-C', ROOT, 'ls-tree', '--full-tree', '--name-only', `${S5_PIN}:test`], { env, encoding: 'utf8' }, 30000, 'git ls-tree');
    assert.equal(ls.status, 0, ls.stderr);
    const pinned = ls.stdout.split('\n').filter((n) => n.endsWith('.mjs') && !EXEMPT.has(n));
    assert.equal(pinned.length, 19, `${S5_PIN} test/*.mjs: ${pinned.join(' ')}`);
    const tot = { RE1: 0, RE2: 0, RE1W: 0, TIMER: 0 };
    for (const n of pinned) {
        const r = capSync('git', ['-C', ROOT, 'show', `${S5_PIN}:test/${n}`], { env, encoding: 'utf8', maxBuffer: 1 << 26 }, 30000, 'git show');
        assert.equal(r.status, 0, r.stderr);
        const c = censusOf(n, r.stdout).n;
        for (const k of Object.keys(tot)) tot[k] += c[k];
    }
    assert.deepEqual(tot, S5_PIN_N, `${S5_PIN} census`);
});

// ---- G rows (b72 CI-HANG, ruling Q-B72-REPRO "CI only + ps dump"; PLAN-b72-cihang.md ASSERTIONS 1-3) ----------------------
// ORACLE: fake bash children in their own process group (detached) whose hang the row fixes -- a group that ignores INT / TERM /
// HUP, a background sleep that holds the stdout / stderr pipes after its parent exited, a SIGTERM-ignoring foreground --
// and the caps given here. The must-fail controls run IN the row, on the pre-b72 forms (armCap, capSync without group),
// concurrently with the row where they are async; each control's group is SIGKILLed by the row afterwards.
const GROUPS = [];  // every pgid a G row made
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
// only ESRCH is "gone": macOS answers EPERM for a group whose last member is a zombie not yet reaped by launchd (seen under
// load after the orphan's SIGKILL), so EPERM reads as still there and is polled again
function groupAlive(pgid) {
    try { process.kill(-pgid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; if (e.code === 'EPERM') return true; throw e; }
}
async function groupGone(pgid, tries = 250) {
    for (let i = 0; i < tries && groupAlive(pgid); i++) await nap(20);
    return !groupAlive(pgid);
}
function killGroup(pgid) {
    try { process.kill(-pgid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
}
// a detached `bash -c src` under armGroup (how 'group') or the pre-b72 armCap (how 'cap'); r as the spawn-cap.mjs header says
function runGroup(src, cap, how, env) {
    const c = spawn('bash', ['-c', src], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    PIDS.push(c.pid); GROUPS.push(c.pid);
    const h = how === 'group' ? armGroup(c, cap) : armCap(c, cap);
    let out = ''; let err = ''; let closed = false;
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t0 = Date.now();
    const done = new Promise((res) => c.on('close', (status, signal) => {
        closed = true;
        h.clear();
        res({ status, signal, stdout: out, stderr: err, timedOut: h.timedOut, cap: h.cap, ps: h.ps, pgid: h.pgid, ms: Date.now() - t0, pid: c.pid });
    }));
    return { c, h, done, t0, closed: () => closed };
}
// the ps rows of a dump section whose pgid column is pgid and whose args end in `want`
function psHits(msg, pgid, want) {
    const at = msg.indexOf(`\n--- ps (pgid ${pgid}):\n`);
    if (at < 0) return [];
    return msg.slice(at).split('\n').slice(2).filter((l) => { const f = l.trim().split(/\s+/); return f[2] === String(pgid) && l.trimEnd().endsWith(want); });
}
// a must-fail control on armCap: at `at` ms after its spawn the run must still be open; then its group is killed and gone
async function capControl(ctl, at, t) {
    await nap(Math.max(0, at - (Date.now() - ctl.t0)));
    const seen = { closed: ctl.closed(), alive: alive(ctl.c.pid), timedOut: ctl.h.timedOut, ms: Date.now() - ctl.t0 };
    killGroup(ctl.c.pid);
    const r = await ctl.done;
    t.diagnostic(`control armCap pid ${ctl.c.pid}: at ${seen.ms} ms closed=${seen.closed} alive=${seen.alive} timedOut=${seen.timedOut}; closed by the row's SIGKILL at ${r.ms} ms`);
    return { seen, r, gone: await groupGone(ctl.c.pid) };
}

// G1 (ASSERTION 1): a group that ignores INT / TERM / HUP (bash waiting on a `sleep 30` that inherits the ignore) under
// armGroup cap 2000: SIGTERM to the group at 2000 ms does nothing, the SIGKILL at + grace 5000 ends it -> 'close' within
// 10000 ms; noTimeout throws "stuck-fake timed out after 2000 ms (killed by SIGKILL)" with a `--- ps (pgid N):` section
// holding the `sleep 30` row of group N; afterwards kill(-N, 0) -> ESRCH. Must-fail (run here): armCap(c, 2000) on the same
// fixture -> the child is alive and no 'close' came at 9000 ms (its SIGTERM is ignored and nothing escalates).
test('G1 armGroup: an INT/TERM/HUP-ignoring group under cap 2000 closes < 10000 ms with a ps dump naming sleep 30; armCap control still open at 9000 ms', async (t) => {
    const d = scapDir();
    try {
        const M = join(d, 'trap-set');
        const src = `trap '' INT TERM HUP; : >"$M"; sleep 30 & wait`;
        const run = runGroup(src, 2000, 'group', { M });
        const ctl = runGroup(src, 2000, 'cap', { M: M + '.ctl' });
        const [r, cr] = await Promise.all([run.done, capControl(ctl, 9000, t)]);
        t.diagnostic(`armGroup pid ${r.pid}: closed at ${r.ms} ms timedOut=${r.timedOut} signal=${r.signal}`);
        assert.ok(existsSync(M), 'the fake set its traps before the cap (host too slow to start bash in 2000 ms?)');
        assert.deepEqual([r.timedOut, r.cap, r.status, r.signal, r.pgid], [true, 2000, null, 'SIGKILL', r.pid]);
        assert.ok(r.ms >= 2000 && r.ms < 10000, `closed after ${r.ms} ms`);
        const e = caught(() => noTimeout(r, 'stuck-fake'));
        assert.ok(e instanceof assert.AssertionError, 'noTimeout must throw an assertion on the capped group');
        assert.equal(e.message.split('\n')[0], 'stuck-fake timed out after 2000 ms (killed by SIGKILL)');
        assert.match(e.message, /timed out after 2000 ms/);
        assert.match(e.message, /\n--- ps \(pgid \d+\):\n {0,8}PID +PPID +PGID /);
        assert.equal(psHits(e.message, r.pid, 'sleep 30').length, 1, `one sleep 30 row of group ${r.pid}:\n${e.message}`);
        assert.ok(await groupGone(r.pid), `group ${r.pid} gone (kill(-pgid, 0) ESRCH)`);
        // the control: alive and open at 9000 ms (red on the pre-b72 cap)
        assert.deepEqual([cr.seen.closed, cr.seen.alive], [false, true], `armCap control at ${cr.seen.ms} ms`);
        assert.ok(cr.seen.ms >= 9000, `control looked at ${cr.seen.ms} ms`);
        assert.ok(cr.gone, `control group ${ctl.c.pid} gone after the row's SIGKILL`);
    } finally { rmDir(d); }
});

// G2 (ASSERTION 2): the pipe-held gap -- `sleep 30 & exit 0`: bash exits at once, its background sleep keeps the pipes, so
// 'close' never comes. armGroup cap 1000 -> timedOut (exit was more than grace ago at the re-check), the dump names the
// `sleep 30`, SIGTERM to the group ends it -> 'close' within 9000 ms, the message says "(exit status 0, no signal)".
// Must-fail (run here): armCap cap 1000 -> timedOut false (it saw 'exit') and no 'close' at 8000 ms.
test('G2 armGroup: a background sleep holding the pipes after exit 0 -> timedOut, dump names sleep 30, close < 9000 ms; armCap control timedOut false, open at 8000 ms', async (t) => {
    const src = 'sleep 30 & exit 0';
    const run = runGroup(src, 1000, 'group');
    const ctl = runGroup(src, 1000, 'cap');
    const [r, cr] = await Promise.all([run.done, capControl(ctl, 8000, t)]);
    t.diagnostic(`armGroup pid ${r.pid}: closed at ${r.ms} ms timedOut=${r.timedOut} status=${r.status}`);
    assert.deepEqual([r.timedOut, r.status, r.signal], [true, 0, null]);
    assert.ok(r.ms >= 1000 && r.ms < 9000, `closed after ${r.ms} ms`);
    const e = caught(() => noTimeout(r, 'held-fake'));
    assert.ok(e instanceof assert.AssertionError);
    assert.equal(e.message.split('\n')[0], 'held-fake timed out after 1000 ms (exit status 0, no signal)');
    assert.equal(psHits(e.message, r.pid, 'sleep 30').length, 1, `one sleep 30 row of group ${r.pid}:\n${e.message}`);
    assert.ok(await groupGone(r.pid), `group ${r.pid} gone`);
    assert.deepEqual([cr.seen.timedOut, cr.seen.closed], [false, false], `armCap control at ${cr.seen.ms} ms`);
    assert.ok(cr.seen.ms >= 8000, `control looked at ${cr.seen.ms} ms`);
    assert.ok(cr.gone, `control group ${ctl.c.pid} gone`);
});

// G2 law 8: a detached child that EXITED while a 1500 ms blocking spawnSync held the loop past its 50 ms armGroup cap is no
// timeout: when the loop frees, the cap timer runs first, its setImmediate sees 'exit' (not yet 'close') and re-checks at exit +
// grace; 'close' comes a phase later and drops the timer. The blocker returns only after the child's marker exists and ps shows
// it gone or a zombie (S4 pattern), then sleeps 1.5 s. Must-fail (mutant, run once in a scratch copy): armGroup firing on any
// run not closed at the setImmediate (no exit + grace re-check) -> timedOut true.
test('G2 armGroup law 8: a child that exited during a 1500 ms blocking spawnSync past its 50 ms cap -> timedOut false, status 0', async (t) => {
    const d = scapDir();
    try {
        const mark = join(d, 'pid');
        const fast = join(d, 'fast.sh');
        writeFileSync(fast, `#!/usr/bin/env bash\necho "ok fast"\necho $$ > '${mark}.tmp' && mv '${mark}.tmp' '${mark}'\nexit 0\n`);
        chmodSync(fast, 0o755);
        const blk = join(d, 'block.sh');
        writeFileSync(blk, ['#!/usr/bin/env bash', '[ -n "$(ps -o stat= -p $$ 2>/dev/null | tr -d \' \')" ] || exit 5',
            'i=0; while [ ! -s "$1" ] && [ $i -lt 600 ]; do sleep 0.1; i=$((i + 1)); done; [ -s "$1" ] || exit 3', 'pid=$(cat "$1")',
            'i=0; while [ $i -lt 600 ]; do st=$(ps -o stat= -p "$pid" 2>/dev/null | tr -d \' \'); case $st in "" | Z*) break ;; esac; sleep 0.1; i=$((i + 1)); done',
            'case $st in "" | Z*) ;; *) exit 4 ;; esac', 'sleep "$2"', ''].join('\n'));
        chmodSync(blk, 0o755);
        const cap = 50;
        const c = spawn('bash', [fast], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        PIDS.push(c.pid); GROUPS.push(c.pid);
        const h = armGroup(c, cap);
        let out = '';
        c.stdout.setEncoding('utf8'); c.stdout.on('data', (x) => { out += x; }); c.stderr.resume();
        const t0 = Date.now();
        const done = new Promise((res) => c.on('close', (status, signal) => { h.clear(); res({ status, signal, timedOut: h.timedOut, ps: h.ps, ms: Date.now() - t0 }); }));
        const b = capSync('bash', [blk, mark, '1.5'], { encoding: 'utf8' }, 120000, 'blocker');
        const blocked = Date.now() - t0;
        assert.equal(b.status, 0, `blocker: 5 = ps -o stat= -p $$ does not work here, 3 = no marker in 60 s, 4 = the fake still runs ${b.stderr}`);
        assert.ok(blocked >= 1500, `the loop was blocked ${blocked} ms (>= 1500), far past the ${cap} ms cap`);
        const r = await done;
        t.diagnostic(`law 8: loop blocked ${blocked} ms, closed at ${r.ms} ms timedOut=${r.timedOut}`);
        assert.deepEqual([r.timedOut, r.status, r.signal, r.ps, out], [false, 0, null, null, 'ok fast\n']);
        assert.ok(await groupGone(c.pid), `group ${c.pid} gone`);
    } finally { rmDir(d); }
});

// G3 (ASSERTION 3): capSync group:true on a SIGTERM-ignoring bash with a foreground `sleep 6`: at 1000 ms node SIGKILLs the
// pid and closes the pipes; the orphaned sleep is dumped and its group SIGKILLed -> throws "g timed out after 1000 ms (killed
// by SIGKILL)" + a ps section naming `sleep 6`, < 4000 ms; the group is gone. Must-fail (run here): the same run without group
// takes >= 5500 ms (SIGTERM ignored, spawnSync waits for the exit) and has no ps section. The fixture is the plan's
// `trap '' TERM; sleep 6` plus a trailing `; :`: bash 5.3 execs a LAST simple command of a -c list even under a trap, so
// `sleep 6` would be the pid itself (SIGKILLed and reaped by spawnSync, no orphan to dump: red on bash 5.3.20, green on 3.2).
test('G3 capSync group:true: a TERM-ignoring sleep 6 under cap 1000 throws "(killed by SIGKILL)" + ps section < 4000 ms; without group >= 5500 ms', async (t) => {
    const args = ['-c', "trap '' TERM; sleep 6; :"];
    let t0 = Date.now();
    const e = caught(() => capSync('bash', args, { group: true }, 1000, 'g'));
    const ms = Date.now() - t0;
    t.diagnostic(`group:true threw after ${ms} ms`);
    assert.ok(e instanceof assert.AssertionError, `an assertion failure, got ${e && e.name}`);
    assert.match(e.message, /^g timed out after 1000 ms \(killed by SIGKILL\)\n/);
    const m = /\n--- ps \(pgid (\d+)\):\n/.exec(e.message);
    assert.ok(m, `a ps section:\n${e.message}`);
    const pgid = Number(m[1]);
    PIDS.push(pgid); GROUPS.push(pgid);
    assert.equal(psHits(e.message, pgid, 'sleep 6').length, 1, `one sleep 6 row of group ${pgid}:\n${e.message}`);
    assert.ok(ms < 4000, `capSync group returned after ${ms} ms`);
    assert.ok(await groupGone(pgid, 50), `group ${pgid} gone`);   // 50 x 20 ms: well before the fixture's own sleep 6 ends
    // the control: no group -> SIGTERM ignored, the full 6 s
    t0 = Date.now();
    const ec = caught(() => capSync('bash', args, {}, 1000, 'g'));
    const cms = Date.now() - t0;
    t.diagnostic(`control without group threw after ${cms} ms: ${ec && ec.message.split('\n')[0]}`);
    assert.ok(ec && cms >= 5500, `the control took ${cms} ms`);
    assert.doesNotMatch(ec.message, /--- ps \(pgid/);
});

// G4 (law 2: every failure form by name): the guards of capSync group / armGroup / psGroup, each refused BEFORE a spawn or a
// listener; group:false = the default (not detached); group:true without a timeout = a group leader, no r.ps; armGroup on a
// child that is not detached -> ESRCH on -pid -> the pid is SIGKILLed and h.ps says "no group"; psGroup's own failures;
// timeoutMsg's ps section label (r.pgid, else r.pid).
test('G4 group guards: bad group / killSignal / detached / grace refused before spawning; not-detached armGroup -> "no group"; psGroup failures by name', async () => {
    const d = scapDir();
    try {
        const M = join(d, 'ran');
        const env = { ...process.env, M };
        const run = (opts) => () => capSync('bash', ['-c', ': >"$M"'], { env, ...opts }, 60000, 'grp');
        assert.throws(run({ group: 'yes' }), /^TypeError: spawn-cap: grp: opts\.group must be a boolean, got string yes$/);
        assert.throws(run({ group: undefined }), /opts\.group must be a boolean, got undefined/);
        assert.throws(run({ group: true, killSignal: 'SIGTERM' }), /^TypeError: spawn-cap: grp: opts\.group runs under killSignal SIGKILL, got SIGTERM$/);
        assert.throws(run({ group: true, killSignal: 9 }), /runs under killSignal SIGKILL, got 9/);
        assert.throws(run({ group: true, detached: false }), /^TypeError: spawn-cap: grp: opts\.group sets detached: true, got false$/);
        assert.equal(existsSync(M), false, 'a refused group opts spawns nothing');
        const pg = ['-c', 'echo $$ $(ps -o pgid= -p $$)'];
        const off = capSync('bash', pg, { group: false, encoding: 'utf8' }, 60000, 'grp-off');
        const [p0, g0] = off.stdout.trim().split(/\s+/).map(Number);
        assert.ok(p0 === off.pid && g0 !== p0, `group:false stays in node's group: ${off.stdout}`);
        const on = capSync('bash', pg, { group: true, encoding: 'utf8' }, 60000, 'grp-on');
        const [p1, g1] = on.stdout.trim().split(/\s+/).map(Number);
        assert.deepEqual([p1, g1, on.status, on.ps, on.timedOut], [on.pid, on.pid, 0, undefined, false], 'group:true leads its own group; no timeout, no dump');
        GROUPS.push(on.pid);
        assert.equal(capSync('bash', ['-c', ': >"$M"'], { env, group: true, killSignal: 'SIGKILL', detached: true }, 60000, 'grp-ok').status, 0);
        assert.equal(existsSync(M), true, 'group:true with killSignal SIGKILL / detached true spawns');
    } finally { rmDir(d); }
    // armGroup guards, before any listener
    const c = spawn('bash', ['-c', 'exec sleep 30'], { detached: true, stdio: 'ignore' });
    PIDS.push(c.pid); GROUPS.push(c.pid);
    const closed = new Promise((res) => c.on('close', (status, signal) => res({ status, signal })));
    const before = [c.listenerCount('exit'), c.listenerCount('close')];
    assert.throws(() => armGroup(c, 0), /^TypeError: spawn-cap: armGroup: cap must be an integer ms/);
    assert.throws(() => armGroup(c, 100, 'TERM'), /^TypeError: spawn-cap: armGroup: sig must be a signal name of os\.constants\.signals, got TERM$/);
    for (const g of [0, 1.5, '5000', null]) assert.throws(() => armGroup(c, 100, 'SIGTERM', g), /^TypeError: spawn-cap: armGroup: grace must be an integer ms in \[1, 2147483647\]/, `grace ${String(g)}`);
    assert.throws(() => armGroup({ kill() {}, once() {}, pid: 5 }, 100), /^TypeError: spawn-cap: armGroup: child must be a ChildProcess$/);
    assert.deepEqual([c.listenerCount('exit'), c.listenerCount('close')], before, 'a refused armGroup adds no listener');
    // psGroup: the live group, then each failure by name
    const dump = psGroup(c.pid);
    const rows = dump.split('\n');
    assert.match(rows[0], /^ *PID +PPID +PGID +STAT +%CPU +WCHAN +(ARGS|COMMAND)$/, dump);
    assert.equal(rows.length, 2, `header + the one member:\n${dump}`);
    assert.deepEqual(rows[1].trim().split(/\s+/).slice(0, 3).map(Number), [c.pid, process.pid, c.pid]);
    assert.match(rows[1], /sleep 30$/);
    for (const bad of [0, 1, -c.pid, 1.5, String(c.pid), null]) assert.equal(psGroup(bad), `ps failed: bad pgid ${String(bad)}`);
    const path = process.env.PATH;
    try { process.env.PATH = join(tmpdir(), 'scap-no-such-dir'); assert.equal(psGroup(c.pid), 'ps failed: ENOENT'); } finally { process.env.PATH = path; }
    // a clear()ed armGroup never fires: cap 1 and grace 1, cleared at once, then the child is killed by this row
    const hc = armGroup(c, 1, 'SIGKILL', 1);
    assert.deepEqual([c.listenerCount('exit'), c.listenerCount('close')], [before[0] + 1, before[1] + 1]);
    hc.clear();
    assert.deepEqual([c.listenerCount('exit'), c.listenerCount('close')], before, 'clear() drops both listeners');
    await nap(50);
    assert.deepEqual([hc.timedOut, hc.ps, alive(c.pid)], [false, null, true]);
    killGroup(c.pid);
    assert.deepEqual(await closed, { status: null, signal: 'SIGKILL' });
    assert.ok(await groupGone(c.pid), `group ${c.pid} gone`);
    const late = armGroup(c, 1);   // armed after the exit: arms nothing
    await nap(30);
    assert.deepEqual([late.timedOut, late.ps], [false, null]);
    late.clear();
    // not detached: kill(-pid) answers ESRCH -> the pid is SIGKILLed, h.ps says so
    const nd = spawn('bash', ['-c', 'exec sleep 30'], { stdio: 'ignore' });
    PIDS.push(nd.pid);
    const ndh = armGroup(nd, 200, 'SIGTERM', 1000);
    const ndr = await new Promise((res) => nd.on('close', (status, signal) => { ndh.clear(); res({ status, signal }); }));
    assert.deepEqual([ndr.signal, ndh.timedOut], ['SIGKILL', true]);
    assert.match(ndh.ps, new RegExp(`^ *PID +PPID +PGID [^\\n]*\\n\\(no group: kill\\(-${nd.pid}, SIGTERM\\) ESRCH -- not spawned detached\\? killed pid ${nd.pid} by SIGKILL\\)$`), ndh.ps);
    assert.ok(await gone(nd.pid), `not-detached fake ${nd.pid} gone`);
    // timeoutMsg: the ps section, labelled by r.pgid, else r.pid; none without r.ps
    const base = { timedOut: true, cap: 9, signal: 'SIGKILL', status: null, stdout: 'o\n', stderr: 'e\n' };
    assert.equal(timeoutMsg({ ...base, ps: 'HDR\nROW', pgid: 42, pid: 7 }, 'w'), 'w timed out after 9 ms (killed by SIGKILL)\n--- stdout (last 8 lines):\no\n--- stderr:\ne\n--- ps (pgid 42):\nHDR\nROW');
    assert.equal(timeoutMsg({ ...base, stderr: 'e', ps: 'H', pid: 7 }, 'w'), 'w timed out after 9 ms (killed by SIGKILL)\n--- stdout (last 8 lines):\no\n--- stderr:\ne\n--- ps (pgid 7):\nH');
    assert.equal(timeoutMsg({ ...base, ps: null, pid: 7 }, 'w'), 'w timed out after 9 ms (killed by SIGKILL)\n--- stdout (last 8 lines):\no\n--- stderr:\ne\n');
});

// ---- S6 (b72 CI-HANG, PLAN-b72-cihang.md TASK 6): census of the five converted signal / self-test runners --------------------
// Each runner is found by its header (exactly ONE match in its file); its body is cut by brace matching from the first `{` after
// the parameter list, and the closing `}` must start a line at the header's own indentation (a header that moved, doubled or
// vanished, or a body the brace count misreads, is a finding by name, never a pass). The body carries its b72 form:
//   audit-g2 sigtermRun                     spawns detached (it already did at aed6684), arms armGroup(child, cap ..), no armCap
//   deopt-diff-stage-boundary sigterm       its ONE `escalated = true` timer sets psDump = psGroup(ch.pid) BEFORE its
//   bytecode-budget-stage-boundary sigintRun  SIGKILL, and psDump is in the assert.fail message
//   ic-diff.test selfTest / runOne          capSync(.. group: true ..) / detached spawn + armGroup(c, ..), no armCap
//   ext-audit run                           capSync(.. group: true ..)
// and imports the helper it uses from ./spawn-cap.mjs. Teeth: S6 teeth (history row) -- every runner is red at S6_PIN (aed6684,
// the b72 before build: the same texts as .handoff/frozen/b72-cihang-before/test/); in-row controls: a header removed or doubled,
// a body whose brace count misreads, and one live runner put back to its pre-b72 form are red by name.
const S6_PIN = 'aed6684';
const s6Imports = (src, name) => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'\\./spawn-cap\\.mjs'`).test(src);
function s6Body(src, header) {
    const hits = [...src.matchAll(new RegExp(header.source, 'gm'))];
    if (hits.length !== 1) return { err: `header /${header.source}/ found ${hits.length} time(s), want 1` };
    const m = hits[0];
    const paren = m.index + m[0].length - 1;
    const open = src.indexOf('{', paren + callText(src, paren).length);
    let depth = 0;
    for (let k = open; open >= 0 && k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}' && --depth === 0) {
            if (src.slice(src.lastIndexOf('\n', k - 1) + 1, k) !== m[1]) return { err: `body closes at line ${lineAt(src, k)}, not at the header's indentation` };
            return { body: src.slice(m.index, k + 1) };
        }
    }
    return { err: 'body never closes' };
}
const s6Calls = (body, re) => [...body.matchAll(re)].map((m) => callText(body, m.index + m[0].length - 1));
function s6Escalation(body, kill) {
    const t = s6Calls(body, /\bsetTimeout\s*\(/g).filter((c) => c.includes('escalated = true'));
    if (t.length !== 1) return [[false, `${t.length} escalation timer(s) holding "escalated = true", want 1`]];
    const p = t[0].search(/\bpsDump\s*=\s*psGroup\(\s*ch\.pid\s*\)/), k = t[0].indexOf(kill);
    return [[k >= 0, `escalation timer lost its ${kill}`],
        [p >= 0 && p < k, 'escalation timer: no psDump = psGroup(ch.pid) before its SIGKILL'],
        [/\bassert\.fail\([^;]*\bpsDump\b/.test(body), 'psDump is not in the assert.fail message']];
}
function s6Group(body) {
    const c = s6Calls(body, /\bcapSync\s*\(/g);
    return [[c.length === 1 && /\bgroup\s*:\s*true\b/.test(c[0]), `capSync without group: true (${c.length} capSync call(s), want 1)`]];
}
const S6_SPEC = [
    ['audit-g2.test.mjs', 'sigtermRun', /^([ \t]*)async function sigtermRun\s*\(/, 'armGroup', (b) => [
        [/\bdetached\s*:\s*true\b/.test(b), 'spawn without detached: true'],
        [/\barmGroup\(\s*child\s*,\s*cap\b/.test(b), 'no armGroup(child, cap ..)'],
        [!/\barmCap\s*\(/.test(b), 'armCap still arms it']]],
    ['deopt-diff-stage-boundary.test.mjs', 'sigterm', /^([ \t]*)async function sigterm\s*\(/, 'psGroup',
        (b) => s6Escalation(b, "process.kill(-ch.pid, 'SIGKILL')")],
    ['bytecode-budget-stage-boundary.test.mjs', 'sigintRun', /^([ \t]*)function sigintRun\s*\(/, 'psGroup',
        (b) => s6Escalation(b, "group('SIGKILL')")],
    ['ic-diff.test.mjs', 'selfTest', /^([ \t]*)function selfTest\s*\(/, 'capSync', s6Group],
    ['ic-diff.test.mjs', 'runOne', /^([ \t]*)function runOne\s*\(/, 'armGroup', (b) => [
        [/\bdetached\s*:\s*true\b/.test(b), 'spawn without detached: true'],
        [/\barmGroup\(\s*c\s*,/.test(b), 'no armGroup(c, ..)'],
        [!/\barmCap\s*\(/.test(b), 'armCap still arms it']]],
    ['ext-audit.test.mjs', 'run', /^([ \t]*)function run\s*\(/, 'capSync', s6Group],
];
const S6_FILES = [...new Set(S6_SPEC.map((s) => s[0]))];
// the findings of every S6 runner in `file` whose text is `src`; [] = carries its b72 form
function s6Census(file, src) {
    const out = [];
    for (const [f, name, header, helper, checks] of S6_SPEC) {
        if (f !== file) continue;
        const { body, err } = s6Body(src, header);
        if (err) { out.push(`${f} ${name}: ${err}`); continue; }
        if (!s6Imports(src, helper)) out.push(`${f} ${name}: ${helper} not imported from ./spawn-cap.mjs`);
        for (const [ok, msg] of checks(body)) if (!ok) out.push(`${f} ${name}: ${msg}`);
    }
    return out;
}
test('S6 census: the five b72 runners carry armGroup / capSync group:true / psGroup-before-SIGKILL; lost anchors and a put-back are red', () => {
    const texts = new Map(S6_FILES.map((f) => [f, readFileSync(join(TEST_DIR, f), 'utf8')]));
    const raw = S6_FILES.flatMap((f) => s6Census(f, texts.get(f)));
    assert.deepEqual(raw, [], `runners without their b72 group-aware form:\n${raw.join('\n')}`);
    // in-row controls on the live text: a header removed / doubled, a body closing at the wrong indentation, a put-back
    const g2 = texts.get('audit-g2.test.mjs');
    const hdr = 'async function sigtermRun(';
    assert.equal(g2.split(hdr).length, 2, 'audit-g2 sigtermRun header: one match');
    assert.deepEqual(s6Census('audit-g2.test.mjs', g2.replace(hdr, 'async function sigtermRun2(')),
        ['audit-g2.test.mjs sigtermRun: header /^([ \\t]*)async function sigtermRun\\s*\\(/ found 0 time(s), want 1']);
    assert.deepEqual(s6Census('audit-g2.test.mjs', `${g2}\n${hdr}) {}\n`),
        ['audit-g2.test.mjs sigtermRun: header /^([ \\t]*)async function sigtermRun\\s*\\(/ found 2 time(s), want 1']);
    assert.match(s6Census('audit-g2.test.mjs', g2.replace(hdr, `    ${hdr}`)).join('\n'), /^audit-g2\.test\.mjs sigtermRun: body closes at line \d+, not at the header's indentation$/);
    const put = g2.replace(/\barmGroup\(\s*child\s*,\s*cap\s*,\s*'SIGTERM'\s*\)/, 'armCap(child, 60000)');
    assert.notEqual(put, g2, 'the put-back edit applied');
    assert.deepEqual(s6Census('audit-g2.test.mjs', put), ['audit-g2.test.mjs sigtermRun: no armGroup(child, cap ..)', 'audit-g2.test.mjs sigtermRun: armCap still arms it']);
    const ext = texts.get('ext-audit.test.mjs');
    assert.deepEqual(s6Census('ext-audit.test.mjs', ext.replace(/, group: true \}, 300000, `ext-audit /, ' }, 300000, `ext-audit ')),
        ['ext-audit.test.mjs run: capSync without group: true (1 capSync call(s), want 1)']);
});
// S6 teeth (history row): at S6_PIN every runner is red by its own finding (the census is not green on the old code).
const hasS6Pin = capSync('git', ['-C', ROOT, 'cat-file', '-e', `${S6_PIN}^{commit}`], { env: S5_ENV }, 30000, 'git cat-file').status === 0
    ? true : `no git history with ${S6_PIN}: not checked, never passed`;
test(`S6 teeth: the five runners at ${S6_PIN} (before the b72 conversions) are red, each by its expected finding (git history row)`,
    { skip: histSkip(hasS6Pin) }, () => {
    histGate(hasS6Pin);
    const raw = S6_FILES.flatMap((f) => {
        const r = capSync('git', ['-C', ROOT, 'show', `${S6_PIN}:test/${f}`], { env: S5_ENV, encoding: 'utf8', maxBuffer: 1 << 26 }, 30000, 'git show');
        assert.equal(r.status, 0, r.stderr);
        return s6Census(f, r.stdout);
    });
    assert.deepEqual(raw, [
        'audit-g2.test.mjs sigtermRun: armGroup not imported from ./spawn-cap.mjs',
        'audit-g2.test.mjs sigtermRun: no armGroup(child, cap ..)',
        'audit-g2.test.mjs sigtermRun: armCap still arms it',
        'deopt-diff-stage-boundary.test.mjs sigterm: psGroup not imported from ./spawn-cap.mjs',
        'deopt-diff-stage-boundary.test.mjs sigterm: escalation timer: no psDump = psGroup(ch.pid) before its SIGKILL',
        'deopt-diff-stage-boundary.test.mjs sigterm: psDump is not in the assert.fail message',
        'bytecode-budget-stage-boundary.test.mjs sigintRun: psGroup not imported from ./spawn-cap.mjs',
        'bytecode-budget-stage-boundary.test.mjs sigintRun: escalation timer: no psDump = psGroup(ch.pid) before its SIGKILL',
        'bytecode-budget-stage-boundary.test.mjs sigintRun: psDump is not in the assert.fail message',
        'ic-diff.test.mjs selfTest: capSync without group: true (1 capSync call(s), want 1)',
        'ic-diff.test.mjs runOne: armGroup not imported from ./spawn-cap.mjs',
        'ic-diff.test.mjs runOne: spawn without detached: true',
        'ic-diff.test.mjs runOne: no armGroup(c, ..)',
        'ic-diff.test.mjs runOne: armCap still arms it',
        'ext-audit.test.mjs run: capSync without group: true (1 capSync call(s), want 1)',
    ], `${S6_PIN} S6 census`);
});

test('cleanup: every scap- dir this file made is removed, every fake pid is gone', async () => {
    for (const d of DIRS) assert.equal(existsSync(d), false, `left ${d}`);
    const left = [];
    for (const pid of PIDS) if (!(await gone(pid))) left.push(pid);
    assert.deepEqual(left, [], 'fake pids still alive');
    const groups = [];
    for (const g of GROUPS) if (!(await groupGone(g))) groups.push(g);
    assert.deepEqual(groups, [], 'process groups still alive (kill(-pgid, 0) not ESRCH)');
    const foreign = readdirSync(tmpdir()).filter((n) => n.startsWith('scap-'));
    if (foreign.length) console.log(`# note: scap- entries not made by this run (another run of this file?): ${foreign.join(' ')}`);
});
