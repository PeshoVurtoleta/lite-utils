// test/spawn-cap.test.mjs -- rows S1-S4 of test/spawn-cap.mjs (b40 TIMEOUT-NAMED, PLAN-timeout-named.md ASSERTIONS 1-4).
// ORACLE: fake children whose behaviour the row fixes (a hang, a SIGTERM trap that exits 3, a marker write, an instant
// exit) and the caps given here, never a tool script. Every fake pid is recorded and must be gone (ESRCH) by the last
// row; every temp dir is `scap-*` under os.tmpdir() and removed. S5 (the census) lands later (B5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capSync, armCap, noTimeout, timeoutMsg } from './spawn-cap.mjs';

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
        const e = caught(() => capSync('bash', ['-c', 'echo $$ >"$P.tmp" && mv "$P.tmp" "$P"; exec sleep 30'], { encoding: 'utf8', env: { ...process.env, P } }, 300, 'hang-fake'));
        const ms = Date.now() - t0;
        assert.ok(e, 'capSync must throw on a run its cap killed');
        assert.match(e.message, /^hang-fake timed out after 300 ms \(killed by SIGTERM\)/);
        assert.ok(e instanceof assert.AssertionError, `an assertion failure, got ${e.name}`);
        assert.ok(ms < 10000, `capSync returned after ${ms} ms`);
        // a bash slower than the cap never wrote P (written via .tmp + mv: never seen half-written): the row then rests on
        // the named-timeout assertions above only
        if (existsSync(P)) {
            const pid = Number(readFileSync(P, 'utf8').trim());
            assert.ok(Number.isInteger(pid) && pid > 1, `pid ${pid}`);
            PIDS.push(pid);
            assert.equal(alive(pid), false, `the fake ${pid} (exec sleep 30) must be reaped by spawnSync`);
        }
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

test('cleanup: every scap- dir this file made is removed, every fake pid is gone', async () => {
    for (const d of DIRS) assert.equal(existsSync(d), false, `left ${d}`);
    const left = [];
    for (const pid of PIDS) if (!(await gone(pid))) left.push(pid);
    assert.deepEqual(left, [], 'fake pids still alive');
    const foreign = readdirSync(tmpdir()).filter((n) => n.startsWith('scap-'));
    if (foreign.length) console.log(`# note: scap- entries not made by this run (another run of this file?): ${foreign.join(' ')}`);
});
