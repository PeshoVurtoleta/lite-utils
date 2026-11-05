// test/deopt-diff-live.test.mjs -- ../deopt-diff.sh driver mode on REAL node spawns (S-8 natives pair), no --out.
// ORACLE: the expected lines come from the B0'/D2 evidence (.handoff/evidence/p3g4/b1-0/logs/A.1.out and B.1.out) and
// PLAN-phase3-g4 A3 / A4, never from a fresh run. Fragility rules (A3): the absolute-path `before` / `after` header
// lines are never asserted, MAGLEV and separator lines are never counted or indexed, lines are picked by fn name.
// TIER: DETERMINISTIC (A3 / A4 D2: 20/20 + 20/20 runs, one stdout sha per pair on node v26.8.2). MD-21 = (a): exit codes
// are asserted on EVERY node; the exact lines only when process.version === 'v26.8.2' (else codes only, see the
// diagnostic row). The must-fail rows run mutants (one exact-once edit on a copy of the live script) that must go red.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'deopt-diff.sh');
const FIX = join(HERE, 'fixtures', 'deopt-diff', 'node-26.8.2');
const DEOPT = join(FIX, 'deopt.mjs');
const MONO = join(FIX, 'mono.mjs');
const EXACT = process.version === 'v26.8.2';
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'GIT_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];

// A copy of the script in a temp dir, with exact-once edits (each must match exactly once, else the row is invalid).
function variant(dir, name, edits) {
    let src = readFileSync(SCRIPT, 'utf8');
    for (const [from, to] of edits) {
        const n = src.split(from).length - 1;
        assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
        src = src.replace(from, () => to);
    }
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src);
    chmodSync(p, 0o755);
    return p;
}

// One live run: cwd and TMPDIR are private dirs; --node is a logging wrapper that counts the spawns.
function live(script, before, after) {
    const cwd = mkdtempSync(join(tmpdir(), 'ddl-cwd-'));
    const tmp = mkdtempSync(join(tmpdir(), 'ddl-tmp-'));
    try {
        const log = join(tmp, 'spawns.log');
        const wrap = join(tmp, 'node-wrap.sh');
        writeFileSync(wrap, `#!/bin/sh\necho x >> '${log}'\nexec '${process.execPath}' "$@"\n`);
        chmodSync(wrap, 0o755);
        const r = capSync('bash', [script, '--fn', 'add', '--node', wrap, '--v8-flags', '--allow-natives-syntax',
            before, after], { encoding: 'utf8', cwd, env: { ...ENV, TMPDIR: tmp } }, 120000, 'deopt-diff.sh --fn add (live)');
        let spawns = 0;
        try { spawns = readFileSync(log, 'utf8').split('\n').filter(Boolean).length; } catch { /* none */ }
        return { status: r.status, out: r.stdout, err: r.stderr, spawns };
    } finally {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(tmp, { recursive: true, force: true });
    }
}
function lastLine(out) { const l = out.split('\n').filter((x) => x.trim() !== ''); return l[l.length - 1]; }

const L1_LINES = [
    '  add: DIFF -- deopt multiset differs (before 1 | after 0)',
    '    before=1 after=0  [add@TURBOFAN_JS] deopt-eager (not a Smi)',
    'tier    add  before  ops until TURBOFAN_JS: after op 2, before op 3',
];
const L2_LINES = ['  add: SAME -- identical deopt multiset (before 1 | after 1)'];

function checkL1(r) {
    assert.equal(r.status, 1, r.out + r.err);
    if (!EXACT) return;
    const lines = r.out.split('\n');
    for (const l of L1_LINES) assert.ok(lines.includes(l), 'missing line: ' + l + '\n' + r.out);
    assert.equal(lastLine(r.out), 'VERDICT DIFF');
}
function checkL2(r) {
    assert.equal(r.status, 0, r.out + r.err);
    if (!EXACT) return;
    const lines = r.out.split('\n');
    for (const l of L2_LINES) assert.ok(lines.includes(l), 'missing line: ' + l + '\n' + r.out);
    assert.equal(lastLine(r.out), 'VERDICT SAME');
}
function withCopy(fn) {
    const d = mkdtempSync(join(tmpdir(), 'ddl-copy-'));
    try { const c = join(d, 'deopt.mjs'); copyFileSync(DEOPT, c); return fn(c, d); }
    finally { rmSync(d, { recursive: true, force: true }); }
}

test('diagnostic: exact-line assertions run only on node v26.8.2 (this node: ' + process.version + ')', { skip }, () => {
    assert.ok(true, EXACT ? 'exact lines + exit codes' : 'exit codes only on ' + process.version);
});

test('L1 deopt vs mono: exit 1, DIFF lines (exact on v26.8.2), 8 node spawns (--version, --v8-options, 3 + 3 runs)', { skip }, () => {
    const r = live(SCRIPT, DEOPT, MONO);
    checkL1(r);
    assert.equal(r.spawns, 8, 'node spawns (A4 budget + the MD-46 --v8-options read)');
});

test('L2 deopt vs a byte-identical copy: exit 0, SAME lines (exact on v26.8.2), 8 node spawns (--version, --v8-options, 3 + 3 runs)', { skip }, () => {
    withCopy((copy) => {
        const r = live(SCRIPT, DEOPT, copy);
        checkL2(r);
        assert.equal(r.spawns, 8, 'node spawns (A4 budget + the MD-46 --v8-options read)');
    });
});

// Z1 anchor: the D record print `print "D " fn "@"` in DEOPT_AWK (exactly once; line 707 is a different string).
// Without the record, the deopt multisets are both empty: L1 exits 0 instead of 1.
test('Z1 mutant: D (deopt) record print removed -> L1 exits 0 (red)', { skip }, () => {
    const d = mkdtempSync(join(tmpdir(), 'ddl-mut-'));
    try {
        const z1 = variant(d, 'z1', [['  print "D " fn "@" t "\\t" k " (" r ")"; next\n', '  next\n']]);
        const r = live(z1, DEOPT, MONO);
        assert.equal(r.status, 0, 'mutant should wrongly pass: ' + r.out + r.err);
        if (EXACT) assert.ok(r.out.split('\n').includes('  add: SAME -- identical deopt multiset (before 0 | after 0)'), 'Z1 SAME line\n' + r.out);
        assert.throws(() => checkL1(r), 'L1 assertion is red on the mutant');
        assert.doesNotThrow(() => checkL1(live(SCRIPT, DEOPT, MONO)), 'revert: clean run satisfies L1');
    } finally { rmSync(d, { recursive: true, force: true }); }
});

// Z2 anchor: same print line; the D record keeps its "D " prefix but its key is the whole raw trace line (addresses vary per run),
// so the 3 runs per side disagree, the null control gives NO-VERDICT: exit 2 on both runs.
test('Z2 mutant: D record is the whole trace line -> L1 and L2 exit 2 (red)', { skip }, () => {
    const d = mkdtempSync(join(tmpdir(), 'ddl-mut-'));
    try {
        const z2 = variant(d, 'z2', [['  print "D " fn "@" t "\\t" k " (" r ")"; next\n', '  print "D " $0; next\n']]);
        const r1 = live(z2, DEOPT, MONO);
        assert.equal(r1.status, 2, r1.out + r1.err);
        if (EXACT) assert.ok(r1.out.split('\n').some((l) => l.startsWith('  add: NO-VERDICT -- before: null control: run 2 differs from run 1 ')), 'Z2 L1 NO-VERDICT line\n' + r1.out);
        assert.throws(() => checkL1(r1), 'L1 red on the mutant');
        withCopy((copy) => {
            const r2 = live(z2, DEOPT, copy);
            assert.equal(r2.status, 2, r2.out + r2.err);
            if (EXACT) assert.ok(r2.out.split('\n').some((l) => l.startsWith('  add: NO-VERDICT -- before: null control: run 2 differs from run 1 ')), 'Z2 L2 NO-VERDICT line\n' + r2.out);
            assert.throws(() => checkL2(r2), 'L2 red on the mutant');
            assert.doesNotThrow(() => checkL2(live(SCRIPT, DEOPT, copy)), 'revert: clean L2');
        });
        assert.doesNotThrow(() => checkL1(live(SCRIPT, DEOPT, MONO)), 'revert: clean L1');
    } finally { rmSync(d, { recursive: true, force: true }); }
});
