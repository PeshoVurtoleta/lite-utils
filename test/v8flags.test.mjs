// test/v8flags.test.mjs -- ../lib/v8flags.sh (MD-46 G1): the --v8-flags allowlist fragment.
// ORACLE: .handoff/PLAN-md46.md "G1 -- SPEC" .. "G1 -- RISK" (ASSERTIONS A1-A5, TASKS 4-7) + RULINGS MD-57 / MD-58, and the
// p6 V8ONLY oracle (.handoff/research/v8flags-policy/p6-policy-sim.mjs) plus the value-form rule. Written from the
// ASSERTIONS before / independent of the fragment: every expected number (964 / 646 / 52 / 19-of-25 / the refused list) is
// the plan's, re-derived below by a SEPARATE JS parser of the fixture (row "oracle self-check"), never read off the fragment.
// TIER: DETERMINISTIC (fake node + fixture; the live lane spawns process.execPath --v8-options only, no timing).
// Fragment API (frozen): V8FL_AWK, V8FL_RE, V8FL_TAB, `v8fl_read NODE`, `v8fl_ok TOKEN` (rc 0 = accepted), `v8fl_check NODE`
// (reads once, then loops ${V8_EXTRA[@]}).
// Mutants M1-M4 (in-test, editOnce on a temp copy of the fragment) and M5 (fragment absent) are the teeth.
// The fixture is node v26.8.2 --v8-options verbatim (sha 5ab84606): its line 737 holds one non-ASCII char (U+2248, node's own
// --turbolev help text), kept so the sha matches; no ASCII gate scans test/fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAG = join(ROOT, 'lib', 'v8flags.sh');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const SHELLS = ['bash', '/bin/bash'];
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];

const tmps = [];
function mk(prefix) { const d = mkdtempSync(join(tmpdir(), prefix)); tmps.push(d); return d; }
function cleanup() { for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true }); }
function editOnce(path, from, to) { // exact single-match replace on a temp copy; abort unless the anchor count is 1
    const s = readFileSync(path, 'utf8');
    const n = s.split(from).length - 1;
    assert.equal(n, 1, `anchor ${JSON.stringify(from)} must match exactly once in ${path}, matched ${n}`);
    writeFileSync(path, s.replace(from, () => to));
}
function editLineOnce(path, pred, fn, what) { // the ONE non-comment line satisfying pred is rewritten by fn
    const L = readFileSync(path, 'utf8').split('\n');
    const hit = [];
    L.forEach((l, i) => { if (!/^\s*#/.test(l) && pred(l)) hit.push(i); });
    assert.equal(hit.length, 1, `${what}: expected exactly 1 matching code line in ${path}, matched ${hit.length}`);
    L[hit[0]] = fn(L[hit[0]]);
    writeFileSync(path, L.join('\n'));
}

// ---- the independent JS oracle (p6 V8ONLY + the value-form rule, MD-58) ----
function parseOptions(text) { // Map name(with _ -> -) -> type; a name line is /^  --[a-z0-9_-]+ \(/, the NEXT line must give the type
    const L = text.split('\n'), m = new Map();
    for (let i = 0; i < L.length; i++) {
        const a = /^  --([a-z0-9_-]+) \(/.exec(L[i]);
        if (!a) continue;
        const t = /^ +type: ([a-z0-9_]+)/.exec(L[i + 1] || '');
        if (t) m.set(a[1].replace(/_/g, '-'), t[1]);
    }
    return m;
}
// the MD-53 deny family (p6 V8_DENY_FAMILY); V8FL_RE = '-(log|logfile|...|logger)-' matches the same names
const FAMILY = /(^|-)(log|logfile|prof|profile|profiling|profiler|trace|print|perf|redirect|dump|stats|verbose|snapshot|gdbjit|counters|help|abort|fuzzing|file|logger)(-|$)/;
function oracle(tab, tok) {
    const g = tok.replace(/_/g, '-');
    if (!g.startsWith('--')) return false;
    let b = g.replace(/^--/, '');
    const eq = b.includes('=');
    if (eq && b.slice(b.indexOf('=') + 1) === '') return false;
    b = b.split('=')[0];
    let neg = false;
    if (b.startsWith('no-') && !tab.has(b)) { b = b.slice(3); neg = true; }
    if (!tab.has(b)) return false;
    const t = tab.get(b);
    if (t === 'string' || FAMILY.test(b)) return false;
    const boolish = t === 'bool' || t === 'maybe_bool';
    if (neg && (!boolish || eq)) return false;
    if (boolish && eq) return false;
    if (!boolish && !eq) return false;
    return true;
}
const typeForm = (tab, n) => (/^(bool|maybe_bool)$/.test(tab.get(n)) ? '--' + n : '--' + n + '=1');

const HARM = ['--run=x', '--test', '--watch', '--watch-path=.', '--watch_path=.', '--check', '--interactive', '--v8-options', '--help',
    '--version', '--completion-bash', '--prof-process', '--build-snapshot', '--snapshot-blob=x', '--experimental-sea-config=s',
    '--entry-url', '--inspect', '--inspect-brk', '--inspect-wait', '--permission', '--cpu-prof', '--cpu_prof', '--heap-prof',
    '--redirect-warnings=w', '--trace-events-enabled', '--trace_events_enabled', '--diagnostic-dir=d', '--report-on-signal',
    '--prof', '--log', '--logfile=v', '--log-ic', '--log-all', '--log_ic', '--trace-turbo', '--trace_turbo', '--trace-turbo-path=t',
    '--redirect-code-traces', '--redirect-code-traces-to=f', '--perf-prof', '--perf-basic-prof', '--perf-basic-prof-path=.',
    '--map-counters=f', '--heap-snapshot-on-gc=1', '--heap-snapshot-on-oom', '--trace-osr', '--trace-deopt', '--abort-on-uncaught-exception',
    '--experimental-vfs', '--experimental-package-map=f', '--experimental-import-text', '--allow-openssl-store'];
const WANT = ['--no-opt', '--max-inlined-bytecode-size=100', '--max-maglev-inlined-bytecode-size=120', '--allow-natives-syntax', '--expose-gc',
    '--jitless', '--stack-size=2000', '--no-maglev', '--no-turbo-inlining', '--max-old-space-size=64', '--no-lazy-feedback-allocation',
    '--invocation-count-for-turbofan=10', '--single-threaded', '--predictable', '--random-seed=1', '--no-use-osr', '--always-osr',
    '--reserve-inline-budget-scale-factor=1.2', '--max_inlined_bytecode_size=100',
    '--no-warnings', '--experimental-strip-types', '--conditions=x', '--stack-trace-limit=50', '--experimental-require-module', '--no-deprecation'];
const WANT_REFUSED = ['--no-warnings', '--experimental-strip-types', '--conditions=x', '--stack-trace-limit=50', '--experimental-require-module', '--no-deprecation'];
// A1 named single tokens (plan A1): token -> accepted?
const NAMED = [
    ['--snapshot-blob=F', false], ['--build-snapshot', false], ['--openssl-config=F', false], ['--noopt', false], ['--stack-size', false],
    ['--expose-gc=1', false], ['--no-stack-size', false], ['--testing-bool-flag-A', false],
    ['--expose_gc', true], ['--no-lazy-feedback-allocation', true],
    // regression-pin rows named by A5 (M1-M4 designed tokens) and the TASK-0 string flag
    ['--trace-osr', false], ['--turbo-filter=x', false], ['--no-opt', true], ['--stack-size=2000', true],
    // b35 review r1 (LITERAL): empty value fails open (V8 reads it as 0); prefix / alphabet guards (mutants X1 / X2)
    ['--max-inlined-bytecode-size=', false], ['--stack-size=', false],
    ['expose-gc', false], ['-expose-gc', false], ['--', false], ['--=1', false], ['--no-', false], ['--EXPOSE-GC', false],
    ['--expose.gc', false], ['--log|opt=1', false],
];

const FIX_TEXT = readFileSync(FIXTURE, 'utf8');
const FIX = parseOptions(FIX_TEXT);

// ---- the driver, the fake node ----
const WORK = mkdtempSync(join(tmpdir(), 'v8fl-'));
process.on('exit', () => rmSync(WORK, { recursive: true, force: true }));
const DRIVER = join(WORK, 'driver.sh');
writeFileSync(DRIVER, `set -euo pipefail
# stub die: the way lib/common.sh die prints (one line on stderr, then the verdict line), exit 2
die() { printf 'stub: %s\\nVERDICT NO-VERDICT\\n' "$*" >&2; exit 2; }
FRAG=$1; NODE=$2; MODE=$3; shift 3
source "$FRAG"
sweep() { local t; while IFS= read -r t; do if v8fl_ok "$t"; then echo 1; else echo 0; fi; done; }
case $MODE in
  table) v8fl_read "$NODE"; printf '%s\\n' "$V8FL_TAB" ;;
  tokens) v8fl_read "$NODE"; sweep ;;
  pure) v8fl_read "$NODE"; PATH=/nonexistent-v8fl-path; sweep ;;
  check) V8_EXTRA=("$@"); v8fl_check "$NODE"; echo ok ;;
  *) echo "bad mode" >&2; exit 64 ;;
esac
`);
const FAKE = join(WORK, 'fakenode');
writeFileSync(FAKE, `#!/bin/sh
printf '%s|%s|%s\\n' "$*" "\${NODE_OPTIONS-unset}" "\${NODE_COMPILE_CACHE-unset}" >> "$FAKE_LOG"
cat "$FAKE_OUT"
exit "\${FAKE_RC:-0}"
`);
chmodSync(FAKE, 0o755);
const HANG = join(WORK, 'hangnode'); // a node that hangs 3 s holding none of the driver's pipes (the run() cap self-test and the live cap row)
writeFileSync(HANG, '#!/bin/sh\nexec sleep 3 </dev/null >/dev/null 2>&1\n');
chmodSync(HANG, 0o755);

function rig(content, rc = 0) { // a fresh log + canned --v8-options output for the fake node
    const d = mk('v8fl-rig-');
    const out = join(d, 'out.txt'), log = join(d, 'log.txt');
    writeFileSync(out, content); writeFileSync(log, '');
    return { out, log, rc, spawns: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}
// cap 420000 (was 120000): CI run 42056284029, row A5 M4 (2 sweep spawns) took 127.1 s on macOS node 26.8.2 (A5 M3 115.2 s; node 22 max 104.7 s)
const RUN_CAP = 420000;
// A4 per-spawn cap 60000 (was RUN_CAP; 40 sequential spawns x 420 s = 280 min > the 120-min CI job cap, and node --test-timeout cannot
// fire inside spawnSync): CI run 42056284029, on the 2 logged macOS legs the WHOLE A4 row (40 spawns) took at most 7.7 s (job 127345428176 macOS node 26.8.2:
// bash 7728.9 ms, /bin/bash 4382.1 ms; job 127345428628 macOS node 22: 4520.3 / 3006.4 ms; the other 6 legs' logs were not kept), ~193 ms per spawn. Even one spawn taking
// the whole row's 7.7 s is < 1/3 of 60000 (the cap-rule floor: >= 3x, a multiple of 60000). All-hang worst case: 40 x 60 s = 40 min per A4 row.
const A4_CAP = 60000;
const LIVE_CAP = 120000; // the A5 live-lane `node --v8-options` spawn
// spawnDriver: one driver spawn, raw (timedOut / cap recorded). run() = spawnDriver + spawnOk: every driver result goes through the check,
// so a run its cap killed (status null, SIGTERM, ETIMEDOUT) fails as "timed out after <cap> ms", never reads as a plain `null !== 0`.
function spawnDriver(shell, frag, node, mode, args = [], o = {}) {
    const env = { ...ENV, ...(o.env || {}) };
    if (o.rig) Object.assign(env, { FAKE_LOG: o.rig.log, FAKE_OUT: o.rig.out, FAKE_RC: String(o.rig.rc) });
    const cap = o.cap === undefined ? RUN_CAP : o.cap;
    assert.ok(Number.isInteger(cap) && cap > 0, `driver cap must be a positive integer ms, got ${cap}`); // 0 would mean "no timeout"
    return capped(spawnSync(shell, [DRIVER, frag, node, mode, ...args], { encoding: 'utf8', timeout: cap, env, cwd: o.cwd, input: o.input }), cap);
}
function capped(r, cap) { r.timedOut = !!(r.error && r.error.code === 'ETIMEDOUT'); r.cap = cap; return r; }
// a timed-out or failed-to-spawn result is an unverified state: fail closed with the cap (or the spawn error) named.
// b40 CI-EPIPE (ruling Q-EP1): EPIPE on the stdin write is benign ONLY when the child exited by itself with a status. spawnSync
// keeps its own error (ETIMEDOUT, ENOBUFS) over a pipe error, so EPIPE never hides our cap; an exit status is a number only on a
// normal exit, and a signal death (status null) cannot be told from an outside kill: it still fails. r.error stays on r
// (.handoff/evidence/b40-epipe/probe.out: exit 1 at once on 1 MiB -> status 1, signal null, EPIPE; self-SIGKILL -> null, SIGKILL, EPIPE).
function benignEpipe(r) { return !!r.error && r.error.code === 'EPIPE' && !r.timedOut && typeof r.status === 'number'; }
function spawnOk(r, what) {
    const tail = `\n${String(r.stdout || '').split('\n').slice(-8).join('\n')}${r.stderr || ''}`;
    assert.ok(!r.timedOut, `${what} timed out after ${r.cap} ms (killed by ${r.signal || 'SIGTERM'})${tail}`);
    assert.ok(!r.error || benignEpipe(r), `${what} spawn error ${r.error && (r.error.code || r.error.message)}${tail}`);
    return r;
}
function run(shell, frag, node, mode, args = [], o = {}) { return spawnOk(spawnDriver(shell, frag, node, mode, args, o), `driver (${shell} ${mode})`); }
// the A5 live-lane `node --v8-options` spawn (b40 V8N): one helper for the live lane AND the cap row, so a hang fails BY NAME
function liveV8Options(node = process.execPath, cap = LIVE_CAP) {
    assert.ok(Number.isInteger(cap) && cap > 0, `live cap must be a positive integer ms, got ${cap}`); // 0 would mean "no timeout"
    return spawnOk(capped(spawnSync(node, ['--v8-options'], { encoding: 'utf8', env: ENV, maxBuffer: 1 << 26, timeout: cap }), cap), 'live node --v8-options');
}
function bits(r) { assert.equal(r.status, 0, `driver status ${r.status}: ${r.stderr}`); assert.equal(r.stderr, ''); return r.stdout.split('\n').filter(Boolean).map((x) => x === '1'); }
function probe(shell, frag, tokens, node = FAKE, rg = rig(FIX_TEXT)) { return bits(run(shell, frag, node, 'tokens', [], { rig: rg, input: tokens.join('\n') + '\n' })); }
const names = [...FIX.keys()];
const SWEEP = names.map((n) => typeForm(FIX, n));
const ALLTOK = names.flatMap((n) => ['--' + n, '--' + n + '=1', '--no-' + n, '--no-' + n + '=1']);
const shellSkip = (sh) => skip || (sh !== 'bash' && !existsSync(sh) ? `${sh} absent` : false);

// ---- the oracle, checked against the plan's numbers (independent of the fragment) ----
test('oracle self-check: 964 rows, type-form sweep 646/964, HARM 0/52, WANT 19/25 with the exact refused list', () => {
    assert.equal(FIX.size, 964);
    assert.equal(SWEEP.filter((t) => oracle(FIX, t)).length, 646);
    assert.equal(HARM.length, 52);
    assert.deepEqual(HARM.filter((t) => oracle(FIX, t)), []);
    assert.equal(WANT.length, 25);
    assert.equal(WANT.filter((t) => oracle(FIX, t)).length, 19);
    assert.deepEqual(WANT.filter((t) => !oracle(FIX, t)).sort(), [...WANT_REFUSED].sort());
    for (const [t, ok] of NAMED) if (!t.startsWith('--no-opt')) assert.equal(oracle(FIX, t), ok, t);
    assert.equal(oracle(FIX, '--no-opt'), true);
});

for (const sh of SHELLS) {
    const sk = shellSkip(sh);
    // ---- A1 ----
    test(`A1 (${sh}): fixture table has 964 rows and the same name->type set as the JS parser`, { skip: sk }, () => {
        try {
            const r = run(sh, FRAG, FAKE, 'table', [], { rig: rig(FIX_TEXT) });
            assert.equal(r.status, 0, r.stderr);
            const rows = r.stdout.split('\n').filter((l) => l !== '');
            assert.equal(rows.length, 964);
            const got = new Map(rows.map((l) => l.split(/\s+/)));
            assert.deepEqual([...got].sort(), [...FIX].sort());
        } finally { cleanup(); }
    });
    test(`A1 (${sh}): type-form sweep admits exactly 646/964, 0 mismatches vs the oracle`, { skip: sk }, () => {
        try {
            const got = probe(sh, FRAG, SWEEP);
            const bad = SWEEP.filter((t, i) => got[i] !== oracle(FIX, t));
            assert.deepEqual(bad, []);
            assert.equal(got.filter(Boolean).length, 646);
        } finally { cleanup(); }
    });
    test(`A1 (${sh}): all four forms of every name (--n, --n=1, --no-n, --no-n=1) equal the oracle`, { skip: sk }, () => {
        try {
            const got = probe(sh, FRAG, ALLTOK);
            assert.deepEqual(ALLTOK.filter((t, i) => got[i] !== oracle(FIX, t)), []);
        } finally { cleanup(); }
    });
    test(`A1 (${sh}): HARM 0/52 admitted; WANT 19/25 with exactly the six refused`, { skip: sk }, () => {
        try {
            const h = probe(sh, FRAG, HARM);
            assert.equal(h.length, HARM.length);
            assert.deepEqual(HARM.filter((t, i) => h[i]), []);
            const w = probe(sh, FRAG, WANT);
            assert.equal(w.filter(Boolean).length, 19);
            assert.deepEqual(WANT.filter((t, i) => !w[i]).sort(), [...WANT_REFUSED].sort());
        } finally { cleanup(); }
    });
    test(`A1 (${sh}): named single tokens (${NAMED.length}) accepted / refused as the plan lists`, { skip: sk }, () => {
        try {
            const got = probe(sh, FRAG, NAMED.map((x) => x[0]));
            assert.deepEqual(NAMED.map(([t], i) => [t, got[i]]), NAMED.map(([t, ok]) => [t, ok]));
        } finally { cleanup(); }
    });
    test(`A1 (${sh}): v8fl_check refusal text is the frozen die text, exit 2, 1 spawn, 0 stdout`, { skip: sk }, () => {
        try {
            const rg = rig(FIX_TEXT);
            const r = run(sh, FRAG, FAKE, 'check', ['--no-opt', '--trace-osr', '--stack-size'], { rig: rg });
            assert.equal(r.status, 2);
            assert.equal(r.stdout, '');
            assert.equal(r.stderr, "stub: --v8-flags must not set --trace-osr: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)\nVERDICT NO-VERDICT\n");
            assert.equal(rg.spawns().length, 1);
        } finally { cleanup(); }
    });

    // ---- A2: fail closed ----
    const icOpts = 'Synopsis:\n  fake v8 options\n\n'; // what ic-diff.sh writes as ./v8opts.txt (src/ic-diff.sh:482)
    const synopsis = FIX_TEXT.split('\n').slice(0, 6).join('\n') + '\n'; // the 4 syntax lines (+ "--" line) alone, no option rows
    const A2 = [
        ['rc 1 (a valid table, then exit 1)', FAKE, () => rig(FIX_TEXT, 1), (n) => `cannot run ${n} --v8-options`],
        ['missing node', join(WORK, 'no-such-node'), () => rig(FIX_TEXT), (n) => `cannot run ${n} --v8-options`],
        ['0 bytes', FAKE, () => rig(''), (n) => `${n} --v8-options printed nothing`],
        ["ic's current v8opts.txt", FAKE, () => rig(icOpts), (n) => `${n} --v8-options lists no V8 flag`],
        ['the 4 synopsis lines alone', FAKE, () => rig(synopsis), (n) => `${n} --v8-options lists no V8 flag`],
    ];
    for (const [label, node, mkRig, text] of A2) {
        for (const extra of [[], ['--no-opt']]) {
            test(`A2 (${sh}): ${label}, V8_EXTRA ${extra.length ? 'set' : 'empty'}: exit 2, 1 die line + VERDICT NO-VERDICT, 0 stdout bytes`, { skip: sk }, () => {
                try {
                    const r = run(sh, FRAG, node, 'check', extra, { rig: mkRig() });
                    assert.equal(r.status, 2, r.stdout + r.stderr);
                    assert.equal(r.stdout, '');
                    assert.equal(r.stderr, `stub: ${text(node)}\nVERDICT NO-VERDICT\n`);
                } finally { cleanup(); }
            });
        }
    }

    // ---- A3: spawn budget ----
    const ACC25 = SWEEP.filter((t) => oracle(FIX, t)).slice(0, 25);
    for (const n of [0, 1, 25]) {
        test(`A3 (${sh}): v8fl_check with ${n} tokens makes exactly 1 node spawn (--v8-options), NODE_OPTIONS / NODE_COMPILE_CACHE unset there`, { skip: sk }, () => {
            try {
                const rg = rig(FIX_TEXT);
                const r = run(sh, FRAG, FAKE, 'check', ACC25.slice(0, n), { rig: rg, env: { NODE_OPTIONS: '--max-old-space-size=64', NODE_COMPILE_CACHE: '/nonexistent-cc' } });
                assert.equal(r.status, 0, r.stderr);
                assert.equal(r.stdout, 'ok\n');
                assert.deepEqual(rg.spawns(), ['--v8-options|unset|unset']);
            } finally { cleanup(); }
        });
    }
    test(`A3 (${sh}): 0 node spawns across 964 v8fl_ok calls (log stays at the 1 read), and 0 external commands (PATH gone) with identical results`, { skip: sk }, () => {
        try {
            const rg = rig(FIX_TEXT);
            const a = bits(run(sh, FRAG, FAKE, 'tokens', [], { rig: rg, input: SWEEP.join('\n') + '\n' }));
            assert.equal(a.length, 964);
            assert.equal(rg.spawns().length, 1);
            const rg2 = rig(FIX_TEXT);
            const b = bits(run(sh, FRAG, FAKE, 'pure', [], { rig: rg2, input: SWEEP.join('\n') + '\n' }));
            assert.deepEqual(b, a);
            assert.equal(rg2.spawns().length, 1);
        } finally { cleanup(); }
    });

    // ---- A4: retention ----
    test(`A4 (${sh}): 20 cycles of (accept + refuse) leave TMPDIR and cwd entry delta 0`, { skip: sk }, () => {
        try {
            const td = mk('v8fl-tmpdir-'), cw = mk('v8fl-cwd-'), rg = rig(FIX_TEXT);
            for (let i = 0; i < 20; i++) {
                const a = run(sh, FRAG, FAKE, 'check', ['--no-opt', '--stack-size=2000'], { rig: rg, cwd: cw, env: { TMPDIR: td }, cap: A4_CAP });
                assert.equal(a.status, 0, a.stderr);
                const b = run(sh, FRAG, FAKE, 'check', ['--no-opt', '--trace-osr'], { rig: rg, cwd: cw, env: { TMPDIR: td }, cap: A4_CAP });
                assert.equal(b.status, 2);
            }
            assert.deepEqual(readdirSync(td), []);
            assert.deepEqual(readdirSync(cw), []);
            assert.equal(rg.spawns().length, 40);
        } finally { cleanup(); }
    });

    // ---- A5: live lane (process.execPath) ----
    test(`A5 live (${sh}): oracle == bash for every live name (4 forms), HARM 0/52 live, live table == JS parse`, { skip: sk }, () => {
        try {
            const lr = liveV8Options();
            assert.equal(lr.status, 0);
            const live = parseOptions(lr.stdout);
            assert.ok(live.size > 500, `live name count ${live.size}`);
            const t = run(sh, FRAG, process.execPath, 'table');
            assert.equal(t.status, 0, t.stderr);
            const got = new Map(t.stdout.split('\n').filter((l) => l !== '').map((l) => l.split(/\s+/)));
            assert.deepEqual([...got].sort(), [...live].sort());
            const toks = [...live.keys()].flatMap((n) => ['--' + n, '--' + n + '=1', '--no-' + n, '--no-' + n + '=1']);
            const bitsLive = bits(run(sh, FRAG, process.execPath, 'tokens', [], { input: toks.join('\n') + '\n' }));
            assert.deepEqual(toks.filter((x, i) => bitsLive[i] !== oracle(live, x)), []);
            const h = bits(run(sh, FRAG, process.execPath, 'tokens', [], { input: HARM.join('\n') + '\n' }));
            assert.equal(h.length, HARM.length);
            assert.deepEqual(HARM.filter((x, i) => h[i]), []);
        } finally { cleanup(); }
    });
}

// ---- A5 teeth: mutants M1-M4 (kill = the designed token flips AND the sweep differs from the oracle), M5 ----
function mutated(name, edit) {
    const d = mk('v8fl-mut-'); const p = join(d, 'v8flags.sh');
    writeFileSync(p, readFileSync(FRAG, 'utf8'));
    edit(p);
    return p;
}
function killRow(label, edit, token, mutantAccepts) {
    test(`A5 ${label}: mutant flips ${token} to ${mutantAccepts ? 'accepted' : 'refused'}, sweep leaves the oracle; the unmutated fragment does not`, { skip }, () => {
        try {
            const m = mutated(label, edit);
            const sweepM = probe('bash', m, [token, ...ALLTOK]);
            assert.equal(sweepM[0], mutantAccepts, `${label} not killed`);
            assert.ok(ALLTOK.some((t, i) => sweepM[i + 1] !== oracle(FIX, t)), `${label}: sweep still equals the oracle`);
            const clean = probe('bash', FRAG, [token, ...ALLTOK]); // revert check: the unmutated fragment
            assert.equal(clean[0], !mutantAccepts);
            assert.deepEqual(ALLTOK.filter((t, i) => clean[i + 1] !== oracle(FIX, t)), []);
        } finally { cleanup(); }
    });
}
// ANCHORS verified vs lib/v8flags.sh (lines 20, 42, 37, 45): each matches exactly once (editOnce / editLineOnce abort otherwise)
killRow('M1 (V8FL_RE neutered)', (p) => editLineOnce(p, (l) => /^V8FL_RE=/.test(l), () => "V8FL_RE='-(zzznomatchzzz)-'", 'V8FL_RE= line'), '--trace-osr', true);
killRow('M2 (string type test dead)', (p) => editLineOnce(p, (l) => /\bstring\b/.test(l), (l) => l.replace(/\bstring\b/, 'string_never_matches'), 'the string type test'), '--turbo-filter=x', true);
killRow('M3 (no- not stripped)', (p) => editOnce(p, 'b=${b#no-}', 'b=${b}'), '--no-opt', false);
// M4: the value-form test: the non-bool arm `*) [[ $v -eq 1 ]] ;;` (a non-bool token must carry =value); the mutant accepts any
// non-bool token, so bare --stack-size is let through. (Anchor adjusted to lib/v8flags.sh line 45.)
killRow('M4 (value-form test dead)', (p) => editOnce(p, '*) [[ $v -eq 1 ]] ;;', '*) : ;;'), '--stack-size', true);

test('A5 M5 (fragment absent = old code): every driver mode fails, no row can pass without lib/v8flags.sh', { skip }, () => {
    try {
        const absent = join(mk('v8fl-absent-'), 'v8flags.sh'); // does not exist
        const rg = rig(FIX_TEXT);
        for (const mode of ['table', 'tokens', 'check']) {
            const r = run('bash', absent, FAKE, mode, ['--no-opt'], { rig: rg, input: '--no-opt\n' });
            assert.notEqual(r.status, 0, `${mode} must fail without the fragment`);
            assert.notEqual(r.stdout, mode === 'check' ? 'ok\n' : '1\n');
        }
        assert.equal(rg.spawns().length, 0);
    } finally { cleanup(); }
});

// ---- the run() cap check itself (b39): without it a hang reads as a pass in A5 M5 (status null passes notEqual(status, 0)) ----
test('run() cap: a hanging node under a 300 ms cap -> timedOut, status null, run() throws "timed out after 300 ms"; under 60000 ms -> exit 2 die, no timeout; a missing shell -> "spawn error ENOENT"', { skip }, () => {
    try {
        const r = spawnDriver('bash', FRAG, HANG, 'check', ['--no-opt'], { cap: 300 });
        assert.deepEqual([r.timedOut, r.status, r.cap], [true, null, 300], `signal ${r.signal} error ${r.error && r.error.code}`);
        assert.throws(() => spawnOk(r, 'x'), /x timed out after 300 ms/);
        assert.throws(() => run('bash', FRAG, HANG, 'check', ['--no-opt'], { cap: 300 }), /driver \(bash check\) timed out after 300 ms/);
        assert.throws(() => spawnDriver('bash', FRAG, HANG, 'check', [], { cap: 0 }), /positive integer/);
        // not a timeout, still not a status. Exact text built from the real path (b40 V8N): WORK is mkdtemp under os.tmpdir() (= $TMPDIR
        // on POSIX), so a TMPDIR with a space made the old /\S+no-such-shell/ pattern a false red
        const noShell = join(WORK, 'no-such-shell');
        assert.throws(() => run(noShell, FRAG, FAKE, 'check', []), (e) => { assert.equal(e.message, `driver (${noShell} check) spawn error ENOENT\n`); return true; });
        const c = run('bash', FRAG, HANG, 'check', ['--no-opt'], { cap: 60000 }); // the inverse control: a cap above the 3 s hang
        assert.deepEqual([c.timedOut, c.status, c.stdout, c.stderr], [false, 2, '', `stub: ${HANG} --v8-options printed nothing\nVERDICT NO-VERDICT\n`]);
    } finally { cleanup(); }
});

// ---- b40 CI-EPIPE (ruling Q-EP1): the CI-red A5 M5 mechanism made deterministic. The driver dies at its `source` line before
// reading stdin; 1 MiB of input (past any pipe buffer) makes the stdin write hit EPIPE on every host (probe.out: 3/3 on macOS).
// Must-fail: spawnOk failing on any r.error (b39 V8) -> "spawn error EPIPE"; a predicate that drops the status test -> the
// synthetic status-null rows pass without a throw.
const MIB = 'x'.repeat(1 << 20);
test('EPIPE: a driver that exits 1 at once on 1 MiB of input -> run() keeps status 1 and r.error EPIPE, no throw; EPIPE with status null (synthetic, and a real self-SIGKILL) -> "spawn error EPIPE"', { skip }, () => {
    try {
        const absent = join(mk('v8fl-epipe-'), 'v8flags.sh'); // does not exist: the driver's set -e source fails, exit 1
        const rg = rig(FIX_TEXT);
        const r = run('bash', absent, FAKE, 'tokens', [], { rig: rg, input: MIB });
        assert.deepEqual([r.status, r.signal, r.timedOut, r.error && r.error.code, r.stdout], [1, null, false, 'EPIPE', '']);
        assert.match(r.stderr, /v8flags\.sh: No such file or directory\n$/);
        assert.equal(rg.spawns().length, 0);
        const epipe = () => Object.assign(new Error('spawnSync bash EPIPE'), { code: 'EPIPE' });
        for (const signal of [null, 'SIGKILL']) {
            const syn = { status: null, signal, error: epipe(), stdout: '', stderr: '', timedOut: false, cap: 300 };
            assert.throws(() => spawnOk(syn, 'syn'), (e) => { assert.equal(e.message, 'syn spawn error EPIPE\n'); return true; }, `signal ${signal}`);
        }
        // a status-0 EPIPE passes (the child exited by itself); a timed-out result names the cap, never EPIPE
        assert.equal(spawnOk({ status: 0, signal: null, error: epipe(), stdout: '', stderr: '', timedOut: false, cap: 300 }, 'syn').status, 0);
        assert.throws(() => spawnOk({ status: 0, signal: null, error: epipe(), stdout: '', stderr: '', timedOut: true, cap: 300 }, 'syn'), (e) => e.message.startsWith('syn timed out after 300 ms ('));
        assert.throws(() => spawnOk({ status: 0, signal: null, error: Object.assign(new Error('e'), { code: 'ENOBUFS' }), stdout: '', stderr: '', timedOut: false, cap: 300 }, 'syn'), (e) => { assert.equal(e.message, 'syn spawn error ENOBUFS\n'); return true; });
        // the real signal path: a shell that SIGKILLs itself before reading 1 MiB -> status null, SIGKILL, EPIPE -> throws by name
        const k = join(WORK, 'selfkill-shell');
        writeFileSync(k, '#!/bin/sh\nkill -KILL $$\n');
        chmodSync(k, 0o755);
        const kr = spawnDriver(k, absent, FAKE, 'tokens', [], { rig: rg, input: MIB });
        assert.deepEqual([kr.status, kr.signal, kr.error && kr.error.code], [null, 'SIGKILL', 'EPIPE']);
        assert.throws(() => run(k, absent, FAKE, 'tokens', [], { rig: rg, input: MIB }), (e) => { assert.equal(e.message, `driver (${k} tokens) spawn error EPIPE\n`); return true; });
    } finally { cleanup(); }
});

// ---- the live lane's cap (b40 V8N): a hanging node on the A5 live path fails BY NAME, never as a bare status ----
test('live cap: liveV8Options on a hanging node under a 300 ms cap throws exactly "live node --v8-options timed out after 300 ms (killed by SIGTERM)" + newline; cap 0 is refused; its default cap is LIVE_CAP (120000)', { skip }, () => {
    assert.throws(() => liveV8Options(HANG, 300), (e) => { assert.equal(e.message, 'live node --v8-options timed out after 300 ms (killed by SIGTERM)\n'); return true; });
    assert.equal(LIVE_CAP, 120000);
    const d = liveV8Options(); // the live lane's call form (process.execPath, default cap): the recorded cap IS LIVE_CAP
    assert.deepEqual([d.cap, d.timedOut, d.status, d.error], [LIVE_CAP, false, 0, undefined]);
    assert.throws(() => liveV8Options(HANG, 0), /positive integer/); // spawnSync timeout 0 = no timeout: refused before any spawn
});
