// test/spawn-cap.test.mjs -- rows S1-S4 / SE of test/spawn-cap.mjs and census row S5 (b40-b41 TIMEOUT-NAMED, PLAN-timeout-named.md
// ASSERTIONS 1-5).
// ORACLE: fake children whose behaviour the row fixes (a hang, a SIGTERM trap that exits 3, a marker write, an instant
// exit) and the caps given here, never a tool script. Every fake pid is recorded and must be gone (ESRCH) by the last
// row; every temp dir is `scap-*` under os.tmpdir() and removed. S5 (b41 B5) reads the test/*.mjs texts: no raw cap is left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('cleanup: every scap- dir this file made is removed, every fake pid is gone', async () => {
    for (const d of DIRS) assert.equal(existsSync(d), false, `left ${d}`);
    const left = [];
    for (const pid of PIDS) if (!(await gone(pid))) left.push(pid);
    assert.deepEqual(left, [], 'fake pids still alive');
    const foreign = readdirSync(tmpdir()).filter((n) => n.startsWith('scap-'));
    if (foreign.length) console.log(`# note: scap- entries not made by this run (another run of this file?): ${foreign.join(' ')}`);
});
