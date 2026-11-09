// test/build.test.mjs -- build.sh drift gate (A3), fail-closed aborts (A4), determinism / retention (A5).
// Oracle: the build.sh contract in .handoff/PLAN-phase1.md TASK 3, not the implementation. Every case builds
// into a temp dir; anything that mutates src/ or lib/ works on a copy of the repo, never the live tree.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import {
    mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync, statSync, symlinkSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (afterEach runs before its own
// test's report, so it would lose the last pass; proven by test/death-signature.test.mjs teeth, b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const SHELLS = ['bash', '/bin/bash'];
const NAME = 'inlining-budget-diff.sh';
const GEN = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.sh')).sort();   // the build roster, read from src/

const tmps = [];
function mk(prefix) { const d = mkdtempSync(join(tmpdir(), prefix)); tmps.push(d); return d; }
function cleanup() { for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true }); }

// A copy of the repo's build inputs and generated outputs: build.sh, src/, lib/, root *.sh.
function repoCopy() {
    const d = mk('bld-copy-');
    cpSync(join(ROOT, 'build.sh'), join(d, 'build.sh'));
    cpSync(join(ROOT, 'src'), join(d, 'src'), { recursive: true });
    cpSync(join(ROOT, 'lib'), join(d, 'lib'), { recursive: true });
    for (const f of readdirSync(ROOT)) if (f.endsWith('.sh')) cpSync(join(ROOT, f), join(d, f));
    return d;
}
function build(dir, out, shell = 'bash') {
    const args = ['build.sh'];
    if (out !== undefined) args.push(out);
    return capSync(shell, args, { cwd: dir, encoding: 'utf8' }, 60000, `${shell} build.sh`);
}
function rootShFiles(dir) { return readdirSync(dir).filter((f) => f.endsWith('.sh') && f !== 'build.sh').sort(); }
function tmpLeft(dir) { return readdirSync(dir).filter((f) => /^\..*\.tmp\./.test(f)); }

// Drift report: every problem between a built dir and the committed root files of `repo`.
//   differs:<f>  built file not byte-equal to root file; missing-root:<f> built but not committed;
//   stray:<f>    root *.sh (minus build.sh) that the build does not produce.
function drift(builtDir, repo) {
    const built = readdirSync(builtDir).filter((f) => !f.startsWith('.')).sort();
    const probs = [];
    for (const f of built) {
        const rp = join(repo, f);
        if (!existsSync(rp)) probs.push('missing-root:' + f);
        else if (!readFileSync(join(builtDir, f)).equals(readFileSync(rp))) probs.push('differs:' + f);
        else if ((statSync(join(builtDir, f)).mode & 0o111) !== (statSync(rp).mode & 0o111)) probs.push('mode:' + f);
    }
    for (const f of rootShFiles(repo)) if (!built.includes(f)) probs.push('stray:' + f);
    return probs;
}
function editOnce(path, from, to) {
    const s = readFileSync(path, 'utf8');
    const n = s.split(from).length - 1;
    assert.equal(n, 1, `anchor ${JSON.stringify(from)} must match exactly once in ${path}, matched ${n}`);
    writeFileSync(path, s.replace(from, () => to));
}

// ---- A3: drift ----
for (const shell of SHELLS) {
    const skipShell = skip || (shell !== 'bash' && !existsSync(shell) ? `${shell} absent` : false);
    test(`A3 drift (${shell}): live build equals committed root scripts, same file set`, { skip: skipShell }, () => {
        try {
            const out = mk('bld-out-');
            const r = build(ROOT, out, shell);
            assert.equal(r.status, 0, r.stdout + r.stderr);
            assert.deepEqual(drift(out, ROOT), []);
            assert.ok(readdirSync(out).includes(NAME));
        } finally { cleanup(); }
    });
}

test('A3 drift: a stray root extra.sh fails the set check', { skip }, () => {
    try {
        const copy = repoCopy();
        writeFileSync(join(copy, 'extra.sh'), '#!/usr/bin/env bash\n');
        const out = mk('bld-out-');
        assert.equal(build(copy, out).status, 0);
        assert.deepEqual(drift(out, copy), ['stray:extra.sh']);
    } finally { cleanup(); }
});

test('A3 drift: lib mutant differs in exactly the src files that include lib/common.sh, revert is 0', { skip }, () => {
    try {
        const copy = repoCopy();
        // expected set derived from the build inputs (exact marker line), not hardcoded
        const users = readdirSync(join(copy, 'src')).filter((f) => f.endsWith('.sh') &&
            readFileSync(join(copy, 'src', f), 'utf8').split('\n').includes('# @include lib/common.sh')).sort();
        assert.ok(users.length >= 2, 'expected >= 2 src files including lib/common.sh: ' + users);
        const lib = join(copy, 'lib', 'common.sh');
        const orig = readFileSync(lib);
        editOnce(lib, 'echo DIFF', 'echo SAME');          // root file deliberately NOT rebuilt
        const out1 = mk('bld-out-');
        assert.equal(build(copy, out1).status, 0);
        assert.deepEqual(drift(out1, copy), users.map((f) => 'differs:' + f));
        writeFileSync(lib, orig);                          // revert
        const out2 = mk('bld-out-');
        assert.equal(build(copy, out2).status, 0);
        assert.deepEqual(drift(out2, copy), []);
    } finally { cleanup(); }
});

test('A3 drift: a hand-edited root file is exactly 1 mismatch', { skip }, () => {
    try {
        const copy = repoCopy();
        const p = join(copy, NAME);
        writeFileSync(p, readFileSync(p, 'utf8') + '# hand edit\n');
        const out = mk('bld-out-');
        assert.equal(build(copy, out).status, 0);
        assert.deepEqual(drift(out, copy), ['differs:' + NAME]);
    } finally { cleanup(); }
});

// ---- A4: fail closed ----
// [label, mutate(copy), basename the stderr must name]
const appendTo = (rel, text) => (c) => writeFileSync(join(c, rel), readFileSync(join(c, rel), 'utf8') + text);
const CASES = [
    ['missing include', appendTo(`src/${NAME}`, '# @include lib/nope.sh\n'), 'nope.sh'],
    ['lib includes itself', appendTo('lib/common.sh', '# @include lib/common.sh\n'), 'common.sh'],
    ['lib includes another lib', appendTo('lib/args.sh', '# @include lib/common.sh\n'), 'args.sh'],
    ['lib near-miss: case-insensitive @Include', appendTo('lib/args.sh', '# @Include lib/common.sh\n'), 'lib/args.sh'],
    ['near-miss: two spaces after #', appendTo(`src/${NAME}`, '#  @include lib/common.sh\n'), NAME],
    ['near-miss: trailing space', appendTo(`src/${NAME}`, '# @include lib/common.sh \n'), NAME],
    ['lib without final newline', (c) => {
        const p = join(c, 'lib', 'args.sh');
        const b = readFileSync(p);
        assert.equal(b[b.length - 1], 0x0a);
        writeFileSync(p, b.subarray(0, b.length - 1));
    }, 'args.sh'],
    ['src/build.sh', (c) => writeFileSync(join(c, 'src', 'build.sh'), '#!/usr/bin/env bash\n'), 'src/build.sh'],
    ['near-miss: case-insensitive @Include', appendTo(`src/${NAME}`, '# @Include lib/common.sh\n'), 'malformed @include marker'],
    ['off-grammar marker at a real file (lib/./common.sh)', appendTo(`src/${NAME}`, '# @include lib/./common.sh\n'), NAME],
    ['NUL byte in src', appendTo(`src/${NAME}`, 'x=1\0y=2\n'), `NUL byte`],
    ['NUL byte in src names the file', appendTo(`src/${NAME}`, 'x=1\0y=2\n'), `src/${NAME}`],
    ['NUL byte in lib', appendTo('lib/args.sh', 'x=1\0y=2\n'), 'NUL byte'],
    ['NUL byte in lib names the file', appendTo('lib/args.sh', 'x=1\0y=2\n'), 'lib/args.sh'],
    ['lib with only #: lines', (c) => writeFileSync(join(c, 'lib', 'args.sh'), '#: nothing\n'), 'lib/args.sh'],
    ['generated output fails bash -n', appendTo(`src/${NAME}`, 'if then\n'), `src/${NAME}`],
];

for (const [label, mutate, named] of CASES) {
    test(`A4 fail closed: ${label}`, { skip }, () => {
        try {
            const copy = repoCopy();
            const before = readFileSync(join(copy, NAME));
            mutate(copy);
            const r = build(copy);                       // default OUTDIR = copy root
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.match(r.stderr, /^build\.sh: /m);
            assert.ok(r.stderr.includes(named), `stderr must name ${named}: ${r.stderr}`);
            assert.ok(readFileSync(join(copy, NAME)).equals(before), 'root script changed by an aborted build');
            assert.deepEqual(tmpLeft(copy), []);
        } finally { cleanup(); }
    });
}

// ---- A5: determinism / retention ----
test('A5: 5 builds into one OUTDIR are byte-identical; aborts leave exactly 1 file and no temps', { skip }, () => {
    try {
        const out = mk('bld-out-');
        let first = null;
        for (let i = 0; i < 5; i++) {
            const r = build(ROOT, out);
            assert.equal(r.status, 0, r.stdout + r.stderr);
            const cur = readFileSync(join(out, NAME));
            if (first === null) first = cur; else assert.ok(cur.equals(first), `build ${i} differs`);
        }
        assert.deepEqual(readdirSync(out).sort(), GEN);
        for (const [label, mutate] of CASES) {
            const copy = repoCopy();
            mutate(copy);
            const r = build(copy, out);
            assert.equal(r.status, 2, `${label}: ${r.stdout}${r.stderr}`);
        }
        assert.deepEqual(readdirSync(out).sort(), GEN);  // exactly the built set => 0 .tmp leftovers
        assert.ok(readFileSync(join(out, NAME)).equals(first));
        assert.deepEqual(tmpLeft(out), []);
    } finally { cleanup(); }
});

test('A4 fail closed: an abort on a later src publishes no earlier output', { skip }, () => {
    try {
        const copy = repoCopy();
        writeFileSync(join(copy, 'src', 'a-ok.sh'), '#!/bin/bash\necho ok\n');
        appendTo(`src/${NAME}`, '#  @include lib/common.sh\n')(copy);
        const r = build(copy);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.equal(existsSync(join(copy, 'a-ok.sh')), false, 'a-ok.sh published by an aborted build');
        assert.deepEqual(tmpLeft(copy), []);
    } finally { cleanup(); }
});

test('A5: build from cwd / by absolute path into a new nested OUTDIR equals the committed scripts', { skip }, () => {
    try {
        const out = join(mk('bld-out-'), 'new', 'dir');
        const r = capSync('bash', [join(ROOT, 'build.sh'), out], { cwd: '/', encoding: 'utf8' }, 60000, 'bash build.sh (cwd /)');
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(drift(out, ROOT), []);
    } finally { cleanup(); }
});

// ---- N1: OUTDIR must not be src/ or lib/ ----
function hashTree(dir) {
    const out = {};
    for (const d of ['src', 'lib']) for (const f of readdirSync(join(dir, d)).sort()) out[`${d}/${f}`] = readFileSync(join(dir, d, f)).toString('base64');
    return out;
}
for (const kind of ['src', 'symlink to lib']) {
    test(`N1: OUTDIR = ${kind} is refused, src/ and lib/ unchanged`, { skip }, () => {
        try {
            const copy = repoCopy();
            const before = hashTree(copy);
            let out = 'src';
            if (kind !== 'src') { out = join(mk('bld-link-'), 'l'); symlinkSync(join(copy, 'lib'), out); }
            const r = build(copy, out);
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.ok(r.stderr.includes('must not be src/ or lib/'), r.stderr);
            assert.deepEqual(hashTree(copy), before);
            assert.deepEqual(tmpLeft(copy), []);
        } finally { cleanup(); }
    });
}

// ---- N2 extras: root script unchanged is covered by the CASES loop (NUL rows) ----

// ---- N3: only LEADING #: lines are stripped from a lib ----
test('N3: a trailing "#: kept" line in a lib survives exactly once', { skip }, () => {
    try {
        const copy = repoCopy();
        appendTo('lib/args.sh', '#: kept\n')(copy);
        const out = mk('bld-out-');
        const r = build(copy, out);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const text = readFileSync(join(out, NAME), 'utf8');
        assert.equal(text.split('\n#: kept\n').length - 1, 1);
    } finally { cleanup(); }
});

// ---- N5: a read-only OUTDIR aborts with "cannot write", not the generic trap message ----
test('N5: a read-only OUTDIR aborts with status 2, "cannot write", and no output', { skip: skip || process.getuid?.() === 0 }, () => {
    const o = mk('bld-ro-');
    try {
        const copy = repoCopy();
        chmodSync(o, 0o555);
        let r;
        try { r = build(copy, o); } finally { chmodSync(o, 0o755); }   // restore before any assert so cleanup works
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stderr, /cannot write/);
        assert.deepEqual(readdirSync(o), []);
    } finally { cleanup(); }
});

// ---- N6: a non-UTF-8 byte under a UTF-8 locale builds byte-exact ----
// Teeth on BSD/macOS tr only (GNU tr is byte-oriented, so on Linux this passes even without LC_ALL=C).
test('N6: a 0xff byte in a lib under LC_ALL=en_US.UTF-8 builds byte-exact', { skip }, () => {
    try {
        const copy = repoCopy();
        const p = join(copy, 'lib', 'args.sh');
        const probe = Buffer.from('# \xff\n', 'latin1');
        writeFileSync(p, Buffer.concat([readFileSync(p), probe]));
        const out = mk('bld-out-');
        const r = capSync('bash', ['build.sh', out], {
            cwd: copy, encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' },
        }, 60000, 'bash build.sh (LC_ALL UTF-8)');
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(readFileSync(join(out, NAME)).includes(probe), 'output lost the 0xff byte');
    } finally { cleanup(); }
});

// ---- N4: an unexpected command failure aborts closed via the EXIT trap ----
test('N4: a failing chmod aborts with status 2 and "unexpected error"', { skip }, () => {
    try {
        const copy = repoCopy();
        const fake = mk('bld-fake-');
        writeFileSync(join(fake, 'chmod'), '#!/bin/sh\nexit 1\n');
        chmodSync(join(fake, 'chmod'), 0o755);
        const out = mk('bld-out-');
        const r = capSync('bash', ['build.sh', out], {
            cwd: copy, encoding: 'utf8', env: { ...process.env, PATH: fake + ':' + process.env.PATH },
        }, 60000, 'bash build.sh (failing chmod)');
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stderr, /unexpected error/);
        assert.deepEqual(readdirSync(out), []);
    } finally { cleanup(); }
});

// ---- MD-46 G1 TASK 7 / G4 TASK 7: the roster of src files that include lib/v8flags.sh ----
// ORACLE: .handoff/PLAN-md46.md G1 TASK 7 (subset) as tightened by G4 TASK 7 (equality, after G5 B1 landed): the set
// must EQUAL {deopt-diff, bytecode-budget, ic-diff, allocation-diff, inlining-budget-diff} (ibd joined under MD-54, U1
// b55). Marker grammar: build.sh header (the WHOLE line). The controls prove the predicate has teeth both ways: a
// fictitious x.sh holding the marker (an extra member) and an ic src copy with the marker removed (a missing member)
// each fail it.
const V8FL_MARKER = '# @include lib/v8flags.sh';
const V8FL_ALLOWED = new Set(['deopt-diff', 'bytecode-budget', 'ic-diff', 'allocation-diff', 'inlining-budget-diff']);
function includesV8fl(text) { return text.split('\n').includes(V8FL_MARKER); }
function v8flRoster(srcTexts) { // Map<file, text> -> sorted names (no .sh) of the files that include the fragment
    return [...srcTexts].filter(([, t]) => includesV8fl(t)).map(([f]) => f.replace(/\.sh$/, '')).sort();
}
function v8flRosterOk(srcTexts) {
    const set = v8flRoster(srcTexts);
    return set.length === V8FL_ALLOWED.size && set.every((n) => V8FL_ALLOWED.has(n));
}
const liveSrc = () => new Map(GEN.map((f) => [f, readFileSync(join(ROOT, 'src', f), 'utf8')]));

function assertV8flRoster(m) {
    assert.ok(m.has(NAME), 'ibd src must be in the roster read from src/');
    const set = v8flRoster(m);
    for (const n of set) assert.ok(V8FL_ALLOWED.has(n), `${n} may not include lib/v8flags.sh`);
    assert.deepEqual(set, [...V8FL_ALLOWED].sort(), 'the lib/v8flags.sh roster must equal {dd, bb, ic, alloc, ibd}');
    assert.equal(v8flRosterOk(m), true);
}
test('G4 T7 roster: src files including lib/v8flags.sh are exactly {dd, bb, ic, alloc, ibd} (MD-54)', { skip }, () => {
    assertV8flRoster(liveSrc());
});

test('G1 / G4 T7 controls: a fictitious x.sh with the marker, an ic src copy with it removed, each fail the roster row (must-fail controls)', { skip }, () => {
    const m = liveSrc();
    m.set('x.sh', V8FL_MARKER + '\n');
    assert.equal(v8flRoster(m).includes('x'), true);
    assert.equal(v8flRosterOk(m), false);
    assert.throws(() => assertV8flRoster(m), assert.AssertionError);
    // G4 T7: an ic src copy (private temp dir) with the marker line removed -> the roster lacks ic -> the row fails
    try {
        const d = mk('bld-v8fl-');
        const ic = m.get('ic-diff.sh');
        assert.equal(ic.split('\n').filter((l) => l === V8FL_MARKER).length, 1, 'ic src holds the marker line exactly once');
        writeFileSync(join(d, 'ic-diff.sh'), ic.split('\n').filter((l) => l !== V8FL_MARKER).join('\n'));
        const m4 = liveSrc();
        m4.set('ic-diff.sh', readFileSync(join(d, 'ic-diff.sh'), 'utf8'));
        assert.equal(includesV8fl(m4.get('ic-diff.sh')), false);
        assert.equal(v8flRoster(m4).includes('ic-diff'), false);
        assert.equal(v8flRosterOk(m4), false);
        assert.throws(() => assertV8flRoster(m4), assert.AssertionError);
    } finally { cleanup(); }
    // and an allowed tool does not fail it (the predicate is not a blanket refusal)
    const m2 = liveSrc();
    m2.set('ic-diff.sh', m2.get('ic-diff.sh') + '\n' + V8FL_MARKER + '\n');
    assert.equal(v8flRosterOk(m2), true);
    // a near-miss (trailing space) is not a marker: build.sh would abort it, the roster does not count it. The ibd src
    // holds the real marker since MD-54, so the near-miss goes on a NAME copy with that line removed.
    const m3 = liveSrc();
    const nearLines = m3.get(NAME).split('\n');
    assert.equal(nearLines.filter((l) => l === V8FL_MARKER).length, 1, 'ibd src holds the marker line exactly once');
    m3.set(NAME, nearLines.filter((l) => l !== V8FL_MARKER).join('\n') + '\n' + V8FL_MARKER + ' \n');
    assert.equal(v8flRoster(m3).includes('inlining-budget-diff'), false);
});

// ---- G-TRACKED (b45, plan .handoff/PLAN-b42-gtracked.md A4): the roster of src files that include lib/tracked.sh ----
// ORACLE: A4, as amended by b50 G-SHL3 N1 (.handoff/PLAN-b50-shl3.md ASSERTION 3). The srcs that include
// lib/tracked.sh
// are exactly {dd, bb, ic, alloc, ibd}. Each of those five roots holds 2 `is_tracked()` definition lines
// (common.sh's,
// then the fragment's). The tracked.sh marker line comes AFTER the common.sh marker line (bash keeps the last
// definition). Must-fail controls: ibd with the marker removed, ic with it removed, bb with it moved above
// common.sh.
const TRK_MARKER = '# @include lib/tracked.sh';
const COM_MARKER = '# @include lib/common.sh';
const TRK_ALLOWED = ['allocation-diff', 'bytecode-budget', 'deopt-diff', 'ic-diff', 'inlining-budget-diff'];
const TRK_FILES = TRK_ALLOWED.map((n) => n + '.sh');
const trkLines = (t) => t.split('\n');
function trkRoster(m) { return [...m].filter(([, t]) => trkLines(t).includes(TRK_MARKER)).map(([f]) => f.replace(/\.sh$/, '')).sort(); }
function trkOrderProblems(m) { // names whose tracked.sh marker is not strictly after exactly one common.sh marker
    const bad = [];
    for (const [f, t] of m) {
        const L = trkLines(t);
        if (!L.includes(TRK_MARKER)) continue;
        const c = L.indexOf(COM_MARKER);
        if (L.filter((l) => l === COM_MARKER).length !== 1 || L.filter((l) => l === TRK_MARKER).length !== 1 || !(L.indexOf(TRK_MARKER) > c) || c < 0) bad.push(f);
    }
    return bad;
}
function assertTrkRoster(m) {
    assert.ok(m.has(NAME), 'ibd src must be in the roster read from src/');
    assert.deepEqual(trkRoster(m), TRK_ALLOWED, 'the lib/tracked.sh roster must equal {dd, bb, ic, alloc, ibd}');
    assert.deepEqual(trkOrderProblems(m), [], 'the lib/tracked.sh marker must come after the lib/common.sh marker');
}
const defLines = (t) => t.split('\n').filter((l) => /^is_tracked\(\)/.test(l)).length;

test('G-TRACKED A4 roster: src files including lib/tracked.sh are exactly {dd, bb, ic, alloc, ibd}', { skip },
    () => {
    assertTrkRoster(liveSrc());
});
test('G-TRACKED A4 order: in each of the five srcs the lib/tracked.sh marker is after the lib/common.sh marker',
    { skip }, () => {
    const m = liveSrc();
    for (const f of TRK_FILES) {
        const L = trkLines(m.get(f));
        assert.ok(L.indexOf(COM_MARKER) >= 0 && L.indexOf(TRK_MARKER) > L.indexOf(COM_MARKER), `${f}: tracked.sh marker (${L.indexOf(TRK_MARKER)}) must follow common.sh (${L.indexOf(COM_MARKER)})`);
    }
});
test('G-TRACKED A4 roots: each of the five built roots has 2 is_tracked() lines', { skip }, () => {
    for (const f of TRK_FILES) assert.equal(defLines(readFileSync(join(ROOT, f), 'utf8')), 2, f);
});
test('G-TRACKED A4 controls: ibd with the marker removed, ic with it removed, bb with it moved above ' +
    'common.sh each fail (must-fail controls)', { skip }, () => {
    const m = liveSrc();
    assert.equal(trkLines(m.get(NAME)).filter((l) => l === TRK_MARKER).length, 1,
        'ibd src holds the marker exactly once');
    m.set(NAME, trkLines(m.get(NAME)).filter((l) => l !== TRK_MARKER).join('\n'));
    assert.equal(trkRoster(m).includes('inlining-budget-diff'), false);
    assert.throws(() => assertTrkRoster(m), assert.AssertionError);
    const m2 = liveSrc();
    assert.equal(trkLines(m2.get('ic-diff.sh')).filter((l) => l === TRK_MARKER).length, 1, 'ic src holds the marker exactly once');
    m2.set('ic-diff.sh', trkLines(m2.get('ic-diff.sh')).filter((l) => l !== TRK_MARKER).join('\n'));
    assert.equal(trkRoster(m2).includes('ic-diff'), false);
    assert.throws(() => assertTrkRoster(m2), assert.AssertionError);
    const m3 = liveSrc();
    const L = trkLines(m3.get('bytecode-budget.sh')).filter((l) => l !== TRK_MARKER);
    L.splice(L.indexOf(COM_MARKER), 0, TRK_MARKER);                 // tracked.sh marker directly above common.sh's
    m3.set('bytecode-budget.sh', L.join('\n'));
    assert.deepEqual(trkOrderProblems(m3), ['bytecode-budget.sh']);
    assert.throws(() => assertTrkRoster(m3), assert.AssertionError);
    assertTrkRoster(liveSrc());                                      // the live tree is not a blanket failure
});
