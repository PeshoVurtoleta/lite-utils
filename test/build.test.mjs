// test/build.test.mjs -- build.sh drift gate (A3), fail-closed aborts (A4), determinism / retention (A5).
// Oracle: the build.sh contract in .handoff/PLAN-phase1.md TASK 3, not the implementation. Every case builds
// into a temp dir; anything that mutates src/ or lib/ works on a copy of the repo, never the live tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync, statSync, symlinkSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    return spawnSync(shell, args, { cwd: dir, encoding: 'utf8', timeout: 60000 });
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
        const r = spawnSync('bash', [join(ROOT, 'build.sh'), out], { cwd: '/', encoding: 'utf8', timeout: 60000 });
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
        const r = spawnSync('bash', ['build.sh', out], {
            cwd: copy, encoding: 'utf8', timeout: 60000, env: { ...process.env, LC_ALL: 'en_US.UTF-8' },
        });
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
        const r = spawnSync('bash', ['build.sh', out], {
            cwd: copy, encoding: 'utf8', timeout: 60000, env: { ...process.env, PATH: fake + ':' + process.env.PATH },
        });
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stderr, /unexpected error/);
        assert.deepEqual(readdirSync(out), []);
    } finally { cleanup(); }
});
