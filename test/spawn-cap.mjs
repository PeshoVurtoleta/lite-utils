// test/spawn-cap.mjs -- the one capped-spawn helper of the test files (b40 TIMEOUT-NAMED, Q-TN1 = A, maintainer ruling
// 2026-11-05: "Shared spawn-cap.mjs (Recommended) -- new test/spawn-cap.mjs (capSync / armCap / noTimeout / timeoutMsg;
// refuses cap 0; exit-flag + setImmediate async cap)"). A child run its cap killed fails as
// "<what> timed out after <cap> ms (...)", never as a bare `null !== 0` or a missing ok row. FROZEN after its first
// approval: a later edit is a serialized unit + the full suite (nul-awk.mjs precedent). Holds no tests; its rows are
// test/spawn-cap.test.mjs S1-S4 and SE (EPIPE).
//
// capSync(cmd, args, opts, cap, what) -> r: spawnSync(cmd, args, { ...opts, timeout: cap }), tagged r.timedOut (true iff
//                             spawnSync reports ETIMEDOUT), r.cap = cap, r.what = what; then noTimeout(r, what), so a
//                             timed-out run or any other spawn error (ENOENT, ENOBUFS, ...) THROWS; otherwise returns r
//                             (status / signal / stdout / stderr untouched, a non-zero status is the caller's to assert).
//                             One exception (b40 CI-EPIPE, ruling Q-EP1): r.error EPIPE (the stdin write after the child closed
//                             it) is returned, not thrown, ONLY when !r.timedOut and r.status is a number (the child exited by
//                             itself); r.error stays on r. EPIPE with status null (a signal death) still throws "spawn error EPIPE".
//                             Refused BEFORE any spawn (throws, nothing runs): cap not an integer in [1, 2147483647]
//                             (spawnSync timeout 0 means NO timeout; a setTimeout delay past 2^31 - 1 fires at once), a
//                             string cap ('300'), opts not a plain object (undefined / null read as {}), an opts.timeout
//                             key (own or inherited: the cap is the only timeout), what not a non-empty string.
//                             opts.killSignal passes through (default SIGTERM, as spawnSync). Never call capSync inside
//                             assert.throws / assert.rejects or a swallowing catch: capture r first, assert after.
// armCap(child, cap, sig = 'SIGTERM') -> h { timedOut, cap, clear() }: the async cap of a spawn() child. After cap ms the
//                             timer waits ONE setImmediate and kills (child.kill(sig)) only a child whose 'exit' has not
//                             arrived. Why: a spawnSync elsewhere can block the loop past the cap; when the loop frees,
//                             the timers phase runs before the poll phase delivers the exit of a child that already
//                             ended, and the check phase (setImmediate) runs after poll. The flag is set on 'exit', NOT
//                             'close' ('close' comes later still, in the close-callbacks phase, after both stdio streams
//                             end: .handoff/evidence/b40-ta/phase-probe.out, "timer exit imm1 stderr-close imm2 close").
//                             h.timedOut turns true only when the kill was sent. 'exit' clears the timer; clear() clears
//                             it and drops the 'exit' listener (call it from the 'close' handler). A child that already
//                             exited when armed arms nothing. Same cap guard as capSync; sig must be a key of
//                             os.constants.signals ('SIGFOO' is refused here, not left to throw inside the timer);
//                             child must be an instanceof ChildProcess (a look-alike would read as already exited).
//                             Every guard throws before a listener or timer is set.
//                             The caller builds r = { status, signal, stdout, stderr, timedOut: h.timedOut, cap: h.cap }
//                             from 'close' and calls noTimeout(r, what) BEFORE any status assert.
// noTimeout(r, what = r.what) -> throws an AssertionError with timeoutMsg(r, what) when r.timedOut; else, when r.error is
//                             set, `${what} spawn error ${code}` (the error's message when it has no code); else returns.
// timeoutMsg(r, what = r.what) -> '' when !r.timedOut; else
//                             `${what} timed out after ${cap} ms (killed by ${signal})`, or
//                             `${what} timed out after ${cap} ms (exit status ${status}, no signal)` when r.signal is null
//                             (a child that traps the kill signal and exits: never an assumed SIGTERM, b39 CI-FIX NIT 2),
//                             then the last 8 stdout lines and the whole stderr, each under its own label line.
// Zero deps: node: built-ins only.
import { spawnSync, ChildProcess } from 'node:child_process';
import { constants } from 'node:os';
import assert from 'node:assert/strict';

const CAP_MAX = 2147483647;   // setTimeout's ceiling (2^31 - 1 ms); past it node fires the timer after 1 ms
const TAIL = 8;

function checkCap(cap, what) {
    if (!(Number.isInteger(cap) && cap >= 1 && cap <= CAP_MAX)) {
        throw new TypeError(`spawn-cap: ${what}: cap must be an integer ms in [1, ${CAP_MAX}] (0 = no timeout), got ${typeof cap} ${String(cap)}`);
    }
}
function checkWhat(what) {
    if (typeof what !== 'string' || what === '') throw new TypeError(`spawn-cap: what must be a non-empty string, got ${typeof what} ${String(what)}`);
}
function plainOpts(opts, what) {
    if (opts === undefined || opts === null) return {};
    const proto = typeof opts === 'object' ? Object.getPrototypeOf(opts) : undefined;
    if (proto !== Object.prototype && proto !== null) throw new TypeError(`spawn-cap: ${what}: opts must be a plain object, got ${Array.isArray(opts) ? 'array' : typeof opts}`);
    if ('timeout' in opts) throw new TypeError(`spawn-cap: ${what}: opts.timeout is refused, the cap argument is the only timeout`);
    return opts;
}

export function timeoutMsg(r, what = r && r.what) {
    if (!r || !r.timedOut) return '';
    const how = r.signal ? `killed by ${r.signal}` : `exit status ${r.status}, no signal`;
    const out = String(r.stdout || '').replace(/\n$/, '').split('\n').slice(-TAIL).join('\n');
    return `${what} timed out after ${r.cap} ms (${how})\n--- stdout (last ${TAIL} lines):\n${out}\n--- stderr:\n${String(r.stderr || '')}`;
}

export function noTimeout(r, what = r && r.what) {
    if (r.timedOut) assert.fail(timeoutMsg(r, what));
    if (r.error) assert.fail(`${what} spawn error ${r.error.code || r.error.message}`);
}

// spawnSync keeps its own error (ETIMEDOUT, ENOBUFS) over a pipe error, so an EPIPE never hides the cap; a status is a number
// only on a normal exit (.handoff/evidence/b40-epipe/probe.out)
function benignEpipe(r) { return !!r.error && r.error.code === 'EPIPE' && !r.timedOut && typeof r.status === 'number'; }

export function capSync(cmd, args, opts, cap, what) {
    checkWhat(what);
    checkCap(cap, what);
    const o = plainOpts(opts, what);
    const r = spawnSync(cmd, args, { ...o, timeout: cap });
    r.timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
    r.cap = cap;
    r.what = what;
    if (!benignEpipe(r)) noTimeout(r, what);
    return r;
}

export function armCap(child, cap, sig = 'SIGTERM') {
    checkCap(cap, 'armCap');
    if (typeof sig !== 'string' || !Object.hasOwn(constants.signals, sig)) throw new TypeError(`spawn-cap: armCap: sig must be a signal name of os.constants.signals, got ${String(sig)}`);
    if (!(child instanceof ChildProcess)) throw new TypeError('spawn-cap: armCap: child must be a ChildProcess');
    const h = { timedOut: false, cap, clear: null };
    let exited = child.exitCode !== null || child.signalCode !== null;
    let t = null;
    const onExit = () => { exited = true; if (t !== null) { clearTimeout(t); t = null; } };
    h.clear = () => { exited = true; if (t !== null) { clearTimeout(t); t = null; } child.removeListener('exit', onExit); };
    if (exited) return h;
    child.once('exit', onExit);
    t = setTimeout(() => {
        t = null;
        setImmediate(() => { if (exited) return; h.timedOut = true; child.kill(sig); });
    }, cap);
    return h;
}
