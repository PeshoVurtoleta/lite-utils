// test/deopt-diff-fillers.test.mjs -- audit-FILLERS deopt-diff rows (b54 ASSERTION 4): TIER_AWK's TURBOFAN compile match
// and the `--` on the two staged-driver dirname / basename lines.
// ORACLE: hand-derived from the TIER_AWK guards, never copied from a run. A compile line counts only when its tail after
// the function name has the frozen shape AND its FIRST `]` is the last byte, it holds no `[`, and it holds no CR. Each row
// breaks exactly one of the three. E9 = the canned compile of add; the trace is `op 1 / line / op 2` on each side:
//   real line        -> "after op 1, before op 2", rc 0, VERDICT SAME (the control: every guard passes)
//   E9 + "zz]"       -> first `]` is not the last byte -> "not compiled in run 1 (last marker op 2)" (T6 row 2, closed)
//   "... 0.003 [x]"  -> one `]` at the end, one `[`    -> only the `[` guard refuses
//   "... 0.003\r ms]"-> only the CR guard refuses (the host awk is probed: CR is a plain byte, index finds it, `.` matches it)
//   "... 0.003] ms]" -> only the `]` guard refuses
// The tier section is REPORTED: DEOPT_AWK has already read every malformed line as X on BOTH builds (rc 2, NO-VERDICT), so
// a tier change must leave the rc and the VERDICT line alone. The old build (96e7712) has none of the three guards: its
// regex accepts every malformed row, so each reads "after op 1, before op 2" there.
// TIER: DETERMINISTIC (no V8 spawn: a fake node in a private dir). Mutants: each guard dropped by an exact-once edit, on a
// copy of the root and on a copy of src/ + lib/ + build.sh built to a private OUT; each kills its own row(s) only.
// "before" = commit 96e7712 via `git show` (CI has no .handoff); unreachable -> SKIP with the reason, fatal under CI=true.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, cpSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const SCRIPT = join(PKG, 'deopt-diff.sh');
const SRC = join(PKG, 'src', 'deopt-diff.sh');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

// the host environment never reaches the script (test/deopt-diff.test.mjs): NODE_V8_COVERAGE = undefined, not a delete
const ENV = { ...process.env };
for (const k of Object.keys(ENV)) if (k.startsWith('GIT_')) delete ENV[k];
for (const k of ['NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'EDITOR', 'VISUAL']) delete ENV[k];
ENV.NODE_V8_COVERAGE = undefined;

const RUN_CAP = 60000, BUILD_CAP = 60000, GIT_CAP = 30000, AWK_CAP = 30000;   // capSync: a timed-out child throws by name
const ROOT = skip ? null : realpathSync(mkdtempSync(join(tmpdir(), 'ddf-')));
if (ROOT) after(() => rmSync(ROOT, { recursive: true, force: true }));

// ---- frozen "before" builds: 96e7712, pinned by sha256/8 ----
const BEFORE = '96e7712';
const PINS = { 'deopt-diff.sh': '298e4cdf', 'src/deopt-diff.sh': '633dc248' };
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (h) => { if (h !== true) assert.fail(`${h} (CI=true: a history row fails, never skips)`); };
let have = true;
const frozen = {};
if (!skip) {
    mkdirSync(join(ROOT, 'old'));
    for (const [name, sha] of Object.entries(PINS)) {
        const g = capSync('git', ['-C', PKG, 'show', `${BEFORE}:${name}`], { env: ENV, maxBuffer: 1 << 26 }, GIT_CAP, 'git show');
        if (g.status !== 0) { have = `git show ${BEFORE}:${name} failed (shallow clone or no git)`; break; }
        const got = createHash('sha256').update(g.stdout).digest('hex').slice(0, 8);
        if (got !== sha) { have = `${BEFORE}:${name} is ${got}, not the pinned ${sha}`; break; }
        frozen[name] = join(ROOT, 'old', name.replace('/', '-'));
        writeFileSync(frozen[name], g.stdout);
        chmodSync(frozen[name], 0o755);
    }
}
const hskip = skip || histSkip(have);

// ---- the rows ----
const E9 = '[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]';
const WINDOW = 'after op 1, before op 2';
const NOT_COMPILED = 'not compiled in run 1 (last marker op 2)';
function tail(to) {   // E9 with its " ms]" end replaced, or the row is invalid
    assert.equal(E9.split(' ms]').length - 1, 1, 'E9 fixture: " ms]" exactly once');
    return E9.replace(' ms]', () => to);
}
const ROWS = {
    'real-line': { line: E9, after: WINDOW, rc: 0, verdict: 'VERDICT SAME' },
    't6-row2': { line: E9 + 'zz]', after: NOT_COMPILED, rc: 2, verdict: 'VERDICT NO-VERDICT' },
    'open-bracket': { line: tail(' [x]'), after: NOT_COMPILED, rc: 2, verdict: 'VERDICT NO-VERDICT' },
    'cr': { line: tail('\r ms]'), after: NOT_COMPILED, rc: 2, verdict: 'VERDICT NO-VERDICT' },
    'mid-close': { line: tail('] ms]'), after: NOT_COMPILED, rc: 2, verdict: 'VERDICT NO-VERDICT' },
};
const MALFORMED = Object.keys(ROWS).filter((id) => id !== 'real-line');

const GUARDS = [
    { name: 'no-close', kills: ['t6-row2', 'mid-close'], from: 'index(s, "]") == length(s) && ', to: '' },
    { name: 'no-open', kills: ['open-bracket'], from: 'index(s, "[") == 0 && ', to: '' },
    { name: 'no-cr', kills: ['cr'], from: ' && index(s, "\\r") == 0) { TF = 1', to: ') { TF = 1' },
];

const msg = (r) => `rc=${r.status} signal=${r.signal}\n--- stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`;

// One run: a fresh private dir, a fake node (answers --version / --v8-options, else cats ./trace.txt from its cwd),
// `before` always the real line, `after` the row's line.
let caseN = 0;
function run(script, line, label) {
    const dir = join(ROOT, `c${++caseN}`), fk = join(dir, 'fk');
    mkdirSync(fk, { recursive: true });
    try {
        const v8o = join(fk, 'v8o.txt'), node = join(fk, 'node'), tmp = join(dir, 'tmp');
        mkdirSync(tmp);
        writeFileSync(v8o, '  --allow-natives-syntax (allow natives syntax)\n        type: bool  default: --no-allow-natives-syntax\n');
        writeFileSync(node, `#!/bin/sh
case "$1" in --version) echo v26.8.2; exit 0 ;; --v8-options) cat ${JSON.stringify(v8o)}; exit 0 ;; esac
if [ -f ./trace.txt ]; then cat ./trace.txt; fi
exit 0
`);
        chmodSync(node, 0o755);
        for (const [side, text] of [['before', E9], ['after', line]]) {
            mkdirSync(join(dir, side));
            writeFileSync(join(dir, side, 'driver.js'), '');
            writeFileSync(join(dir, side, 'trace.txt'), `@@LITE-MARK op 1\n${text}\n@@LITE-MARK op 2\n`);
        }
        const r = capSync('bash', [script, '--node', node, '--fn', 'add', join(dir, 'before', 'driver.js'), join(dir, 'after', 'driver.js')],
            { encoding: 'utf8', cwd: dir, env: { ...ENV, TMPDIR: tmp } }, RUN_CAP, `deopt-diff.sh fillers run (${label})`);
        return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, lines: r.stdout.split('\n') };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
function tierOf(r, side) {
    const pre = `tier    add  ${side}  ops until TURBOFAN_JS: `;
    const hit = r.lines.filter((l) => l.startsWith(pre));
    assert.equal(hit.length, 1, `exactly one ${side} tier ops line\n${msg(r)}`);
    return hit[0].slice(pre.length);
}
function verdictOf(r) {
    const hit = r.lines.filter((l) => l.startsWith('VERDICT'));
    assert.equal(hit.length, 1, `exactly one VERDICT line\n${msg(r)}`);
    return hit[0];
}
// the verdict half: a mutant or the old build must leave it alone
function checkVerdict(row, r) {
    assert.equal(r.signal, null, msg(r));
    assert.equal(r.status, row.rc, msg(r));
    assert.equal(verdictOf(r), row.verdict, msg(r));
}
function checkRow(row, r) {
    checkVerdict(row, r);
    assert.equal(tierOf(r, 'before'), WINDOW, msg(r));
    assert.equal(tierOf(r, 'after'), row.after, msg(r));
}
// the observed shape of a row whose guard is absent: the compile is counted again, the verdict does not move, the row is red
function assertGuardGone(row, r, what) {
    checkVerdict(row, r);
    assert.equal(tierOf(r, 'before'), WINDOW, `${what}\n${msg(r)}`);
    assert.equal(tierOf(r, 'after'), WINDOW, `${what}: the compile must be counted again\n${msg(r)}`);
    assert.throws(() => checkRow(row, r), assert.AssertionError, `${what}: the row still passes`);
}
// the probe the CR rows stand on: the host awk keeps CR in $0 as a plain byte
function awkCrProbe() {
    const r = capSync('awk', ['{ print index($0, "\\r"), (($0 ~ /^a.*\\]$/) ? 1 : 0), length($0) }'],
        { input: 'a\rb]\n', encoding: 'utf8', env: ENV }, AWK_CAP, 'awk CR probe');
    return r.status === 0 ? r.stdout.trim() : `awk exited ${r.status}: ${r.stderr}`;
}
function assertCrByte(t, id) {
    if (id !== 'cr') return;
    const got = awkCrProbe();
    t.diagnostic(`host awk CR probe (want "2 1 4"): ${got}`);
    assert.equal(got, '2 1 4', 'the host awk does not keep CR as a plain byte (index finds it, `.` matches it): this row has no meaning here');
}

// ---- new build ----
for (const id of Object.keys(ROWS)) {
    const row = ROWS[id];
    test(`deopt-diff fillers ${id}: shipped root -> tier "${row.after}", rc ${row.rc}, ${row.verdict}`, { skip }, (t) => {
        assertCrByte(t, id);
        const r = run(SCRIPT, row.line, `${id} new`);
        checkRow(row, r);
    });
}

// ---- old build ("must fail on the old code"): a malformed row is red there, for the designed reason only ----
for (const id of MALFORMED) {
    const row = ROWS[id];
    test(`deopt-diff fillers ${id}: the old build (${BEFORE}) counts the compile -> the row is red, rc and VERDICT unchanged`, { skip: hskip }, (t) => {
        histGate(have);
        assertCrByte(t, id);
        const r = run(frozen['deopt-diff.sh'], row.line, `${id} old`);
        t.diagnostic(`old ${id}: rc=${r.status} ${verdictOf(r)} tier=${tierOf(r, 'after')}`);
        assertGuardGone(row, r, `old build ${id}`);
    });
}
test(`deopt-diff fillers real-line control: the old build (${BEFORE}) reads the same as the new one`, { skip: hskip }, () => {
    histGate(have);
    const row = ROWS['real-line'];
    checkRow(row, run(frozen['deopt-diff.sh'], row.line, 'real-line old'));
});

// ---- mutants: one guard dropped; its own row(s) go red, every other row keeps its new-build outcome ----
function mutate(text, name, from, to) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`mutant ${name}: anchor must match exactly once, matched ${n}: ${from}`);
    return text.replace(from, () => to);
}
function rootMutant(g) {
    const p = join(ROOT, `root-${g.name}.sh`);
    writeFileSync(p, mutate(readFileSync(SCRIPT, 'utf8'), g.name, g.from, g.to));
    chmodSync(p, 0o755);
    return p;
}
function srcMutant(g) {   // a private copy of build.sh + src + lib, src edited exactly once, built to a private OUT
    const d = join(ROOT, `src-${g.name}`);
    mkdirSync(d);
    cpSync(join(PKG, 'build.sh'), join(d, 'build.sh'));
    cpSync(join(PKG, 'src'), join(d, 'src'), { recursive: true });
    cpSync(join(PKG, 'lib'), join(d, 'lib'), { recursive: true });
    const p = join(d, 'src', 'deopt-diff.sh');
    writeFileSync(p, mutate(readFileSync(p, 'utf8'), g.name, g.from, g.to));
    const out = join(d, 'out');
    mkdirSync(out);
    const r = capSync('bash', ['build.sh', out], { cwd: d, encoding: 'utf8', env: ENV }, BUILD_CAP, `bash build.sh (mutant ${g.name})`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return join(out, 'deopt-diff.sh');
}
for (const [carrier, build] of [['root', rootMutant], ['src', srcMutant]]) {
    for (const g of GUARDS) {
        test(`deopt-diff fillers MUTANT ${carrier} ${g.name}: kills ${g.kills.join(' + ')}, no other row moves`, { skip }, (t) => {
            const p = build(g);
            for (const id of Object.keys(ROWS)) {
                const row = ROWS[id];
                assertCrByte(t, id);
                const r = run(p, row.line, `${id} on ${carrier} ${g.name}`);
                t.diagnostic(`${carrier} ${g.name} on ${id}: rc=${r.status} ${verdictOf(r)} tier=${tierOf(r, 'after')}`);
                if (g.kills.includes(id)) assertGuardGone(row, r, `${carrier} ${g.name} on ${id}`);
                else checkRow(row, r);
            }
        });
    }
}

// ---- lexical: the two staged-driver lines of src/deopt-diff.sh carry `--` ----
const DRV_LINES = [
    '  DRV_B_DIR=$(dirname -- "$DRV_B"); DRV_B_BASE=$(basename -- "$DRV_B")',
    '  DRV_A_DIR=$(dirname -- "$DRV_A"); DRV_A_BASE=$(basename -- "$DRV_A")',
];
function assertDashDash(text) {
    const lines = text.split('\n');
    for (const want of DRV_LINES) assert.equal(lines.filter((l) => l === want).length, 1, `exactly once: ${want}`);
    assert.deepEqual(lines.filter((l) => /\b(dirname|basename) +"\$DRV_/.test(l)), [], 'a staged-driver dirname / basename without --');
}
test('deopt-diff fillers lexical: src/deopt-diff.sh staged-driver dirname / basename lines carry --', { skip }, () => {
    assertDashDash(readFileSync(SRC, 'utf8'));
});
test('deopt-diff fillers lexical must-fail control: a copy with any one -- removed is red', { skip }, () => {
    const text = readFileSync(SRC, 'utf8');
    for (const [tool, v] of [['dirname', 'B'], ['basename', 'B'], ['dirname', 'A'], ['basename', 'A']]) {
        const copy = mutate(text, `no-dashdash-${tool}-${v}`, `$(${tool} -- "$DRV_${v}")`, `$(${tool} "$DRV_${v}")`);
        assert.throws(() => assertDashDash(copy), assert.AssertionError, `${tool} ${v}: the row still passes without --`);
    }
});
test(`deopt-diff fillers lexical: the old build (${BEFORE}) has no -- on those lines -> red`, { skip: hskip }, () => {
    histGate(have);
    assert.throws(() => assertDashDash(readFileSync(frozen['src/deopt-diff.sh'], 'utf8')), assert.AssertionError, 'the old src passes the lexical row');
});
