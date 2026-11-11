// test/spawn-cap.mjs -- the one capped-spawn helper of the test files (b40 TIMEOUT-NAMED, Q-TN1 = A, maintainer ruling
// 2026-11-05: "Shared spawn-cap.mjs (Recommended) -- new test/spawn-cap.mjs (capSync / armCap / noTimeout / timeoutMsg;
// refuses cap 0; exit-flag + setImmediate async cap)"). A child run its cap killed fails as
// "<what> timed out after <cap> ms (...)", never as a bare `null !== 0` or a missing ok row. FROZEN after its first
// approval: a later edit is a serialized unit + the full suite (nul-awk.mjs precedent). Holds no tests; its rows are
// test/spawn-cap.test.mjs S1-S4 and SE (EPIPE); the b72 group-aware forms (CI-HANG, ruling Q-B72-REPRO "CI only + ps
// dump") are rows G1-G3 there.
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
//                             opts.group (b72): true runs the child as the leader of its own process group (detached: true)
//                             under killSignal SIGKILL; the key is stripped before spawnSync. On a timeout node SIGKILLs the
//                             pid and closes its pipes (it does not wait for a background holder of them: PROBES-B1.md), so
//                             capSync then sets r.ps = psGroup(r.pid) -- what is left of the group after that kill; the loop
//                             was blocked during spawnSync -- and SIGKILLs the group (kill(-r.pid)) only when the dump listed
//                             a member. Refused before any spawn: group not a boolean, group:true with a killSignal other
//                             than 'SIGKILL' or with detached other than true. group false / absent: the default path,
//                             byte-for-byte the pre-b72 behaviour.
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
// armGroup(child, cap, sig = 'SIGTERM', grace = 5000) -> h { timedOut, cap, ps, pgid, clear() } (b72): the async cap of a
//                             spawn(.., { detached: true }) child, i.e. of its whole process group. It tracks 'close', not
//                             'exit': a background process that keeps the child's stdout / stderr open (`sleep 30 & exit 0`)
//                             holds 'close' back, and armCap -- satisfied by 'exit' -- never fires on it. After cap ms it
//                             waits ONE setImmediate (as armCap); 'close' arrived -> nothing. 'exit' arrived less than grace
//                             ms ago -> re-check at exit + grace (law 8: a child that ended while a spawnSync blocked the loop
//                             delivers 'exit' first and 'close' a phase later, never a timeout). Else: h.timedOut = true,
//                             h.ps = psGroup(child.pid) (the group BEFORE the kill), kill(-pid, sig); still no 'close'
//                             grace ms later (one setImmediate again) -> kill(-pid, 'SIGKILL'). A kill(-pid) answering ESRCH
//                             (the child was not spawned detached: no group of that id) -> child.kill('SIGKILL') and h.ps
//                             notes "no group"; any other kill error is noted in h.ps, never thrown from the timer. 'close'
//                             drops every timer and listener by itself; clear() does the same (call it from the 'close'
//                             handler). A child that already exited when armed, or has no pid (spawn failed), arms nothing.
//                             Guards as armCap, plus grace an integer in [1, 2147483647]; all throw before any listener or
//                             timer is set. h.pgid = child.pid. The caller builds r as for armCap plus ps: h.ps,
//                             pgid: h.pgid.
// psGroup(pgid) -> string: `ps -A -ww -o pid,ppid,pgid,stat,%cpu,wchan,args` (its own spawnSync, 10000 ms, SIGKILL) cut to
//                             the header line + the rows whose 3rd column is pgid (columns 1-3 only: wchan and args vary
//                             per ps; `ps -g` means another thing on procps and on macOS). Never throws: a failed ps (error,
//                             non-zero exit, signal, a bad pgid) returns `ps failed: <code>`.
// noTimeout(r, what = r.what) -> throws an AssertionError with timeoutMsg(r, what) when r.timedOut; else, when r.error is
//                             set, `${what} spawn error ${code}` (the error's message when it has no code); else returns.
// timeoutMsg(r, what = r.what) -> '' when !r.timedOut; else
//                             `${what} timed out after ${cap} ms (killed by ${signal})`, or
//                             `${what} timed out after ${cap} ms (exit status ${status}, no signal)` when r.signal is null
//                             (a child that traps the kill signal and exits: never an assumed SIGTERM, b39 CI-FIX NIT 2),
//                             then the last 8 stdout lines and the whole stderr, each under its own label line, and (b72)
//                             when r.ps is set, `--- ps (pgid N):` (N = r.pgid, else r.pid) and r.ps.
// Zero deps: node: built-ins only.
import { spawnSync, ChildProcess } from 'node:child_process';
import { constants } from 'node:os';
import assert from 'node:assert/strict';

const CAP_MAX = 2147483647;   // setTimeout's ceiling (2^31 - 1 ms); past it node fires the timer after 1 ms
const TAIL = 8;
const PS_CAP = 10000;
const PS_ARGS = ['-A', '-ww', '-o', 'pid,ppid,pgid,stat,%cpu,wchan,args'];

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
    const head = `${what} timed out after ${r.cap} ms (${how})\n--- stdout (last ${TAIL} lines):\n${out}\n--- stderr:\n${String(r.stderr || '')}`;
    if (r.ps === undefined || r.ps === null) return head;
    const n = r.pgid !== undefined && r.pgid !== null ? r.pgid : r.pid;
    return `${head}${head.endsWith('\n') ? '' : '\n'}--- ps (pgid ${n}):\n${r.ps}`;
}

export function noTimeout(r, what = r && r.what) {
    if (r.timedOut) assert.fail(timeoutMsg(r, what));
    if (r.error) assert.fail(`${what} spawn error ${r.error.code || r.error.message}`);
}

// spawnSync keeps its own error (ETIMEDOUT, ENOBUFS) over a pipe error, so an EPIPE never hides the cap; a status is a number
// only on a normal exit (.handoff/evidence/b40-epipe/probe.out)
function benignEpipe(r) { return !!r.error && r.error.code === 'EPIPE' && !r.timedOut && typeof r.status === 'number'; }

// psRows(pgid) -> { text, n }: n = the number of member rows (0 on any failure); psGroup returns the text
function psRows(pgid) {
    if (!(Number.isInteger(pgid) && pgid > 1)) return { text: `ps failed: bad pgid ${String(pgid)}`, n: 0 };
    try {
        const r = spawnSync('ps', PS_ARGS, { encoding: 'utf8', timeout: PS_CAP, killSignal: 'SIGKILL', maxBuffer: 1 << 26 });
        if (r.error) return { text: `ps failed: ${r.error.code || r.error.message}`, n: 0 };
        if (r.status !== 0) return { text: `ps failed: ${r.signal ? r.signal : `exit ${r.status}`} ${String(r.stderr).trim()}`.trimEnd(), n: 0 };
        const lines = r.stdout.replace(/\n$/, '').split('\n');
        const want = String(pgid);
        const rows = lines.slice(1).filter((l) => l.trim().split(/\s+/)[2] === want);
        return { text: [lines[0], ...rows].join('\n'), n: rows.length };
    } catch (e) {
        return { text: `ps failed: ${e && (e.code || e.message)}`, n: 0 };
    }
}
export function psGroup(pgid) { return psRows(pgid).text; }

// groupOpts(o, what) -> [spawnSync options, group?]: opts.group stripped (an object without it is passed on as it is)
function groupOpts(o, what) {
    if (!('group' in o)) return [o, false];
    const { group, ...rest } = o;
    if (group !== true && group !== false) throw new TypeError(`spawn-cap: ${what}: opts.group must be a boolean, got ${typeof group} ${String(group)}`);
    if (!group) return [rest, false];
    if (rest.killSignal !== undefined && rest.killSignal !== 'SIGKILL') throw new TypeError(`spawn-cap: ${what}: opts.group runs under killSignal SIGKILL, got ${String(rest.killSignal)}`);
    if (rest.detached !== undefined && rest.detached !== true) throw new TypeError(`spawn-cap: ${what}: opts.group sets detached: true, got ${String(rest.detached)}`);
    return [{ ...rest, detached: true, killSignal: 'SIGKILL' }, true];
}

export function capSync(cmd, args, opts, cap, what) {
    checkWhat(what);
    checkCap(cap, what);
    const [o, group] = groupOpts(plainOpts(opts, what), what);
    const r = spawnSync(cmd, args, { ...o, timeout: cap });
    r.timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
    r.cap = cap;
    r.what = what;
    if (group && r.timedOut) {
        const p = psRows(r.pid);
        r.ps = p.text;
        r.pgid = r.pid;
        if (p.n > 0) { try { process.kill(-r.pid, 'SIGKILL'); } catch (e) { r.ps += `\n(kill -KILL -${r.pid}: ${e.code || e.message})`; } }
    }
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

export function armGroup(child, cap, sig = 'SIGTERM', grace = 5000) {
    checkCap(cap, 'armGroup');
    if (typeof sig !== 'string' || !Object.hasOwn(constants.signals, sig)) throw new TypeError(`spawn-cap: armGroup: sig must be a signal name of os.constants.signals, got ${String(sig)}`);
    if (!(Number.isInteger(grace) && grace >= 1 && grace <= CAP_MAX)) throw new TypeError(`spawn-cap: armGroup: grace must be an integer ms in [1, ${CAP_MAX}], got ${typeof grace} ${String(grace)}`);
    if (!(child instanceof ChildProcess)) throw new TypeError('spawn-cap: armGroup: child must be a ChildProcess');
    const pid = child.pid;
    const h = { timedOut: false, cap, ps: null, pgid: pid, clear: null };
    // pid > 1: kill(-1) would signal every process of the user, never a group
    let done = child.exitCode !== null || child.signalCode !== null || !(Number.isInteger(pid) && pid > 1);
    let exitedAt = -1;
    let t = null;
    const onExit = () => { exitedAt = Date.now(); };
    const drop = () => {
        done = true;
        if (t !== null) { clearTimeout(t); t = null; }
        child.removeListener('exit', onExit);
        child.removeListener('close', drop);
    };
    h.clear = drop;
    if (done) return h;
    const note = (s) => { h.ps = h.ps === null ? s : `${h.ps}\n${s}`; };
    const killGroup = (s) => {
        try { process.kill(-pid, s); } catch (e) {
            if (e.code === 'ESRCH') {
                note(`(no group: kill(-${pid}, ${s}) ESRCH -- not spawned detached? killed pid ${pid} by SIGKILL)`);
                try { child.kill('SIGKILL'); } catch (e2) { note(`(kill pid ${pid}: ${e2.code || e2.message})`); }
            } else note(`(kill(-${pid}, ${s}): ${e.code || e.message})`);
        }
    };
    const escalate = () => { t = null; setImmediate(() => { if (!done) killGroup('SIGKILL'); }); };
    const decide = () => {
        if (done) return;
        if (exitedAt >= 0) {
            const due = exitedAt + grace - Date.now();
            if (due > 0) { t = setTimeout(check, due); return; }
        }
        h.timedOut = true;
        h.ps = psGroup(pid);
        killGroup(sig);
        if (!done) t = setTimeout(escalate, grace);
    };
    const check = () => { t = null; setImmediate(decide); };
    child.once('exit', onExit);
    child.once('close', drop);
    t = setTimeout(check, cap);
    return h;
}
