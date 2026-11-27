// test/mocks-runner.test.mjs -- deterministic runner gate for mocks/run.mjs (Q-MK-SELFTEST (a), PLAN-mocks T3 / A2).
// Runs mocks/run.mjs --self-test (fake tool only, 0 real V8 invocations) and kills all 16 T3 mutants on private
// mktemp copies (each with a revert control). Every child uses capSync(..., { group: true }) from ./spawn-cap.mjs.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import {
    mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const RUNNER = join(ROOT, 'mocks', 'run.mjs');
const skip = process.platform === 'win32' ? 'fake bash self-test: POSIX hosts only' : false;

const ROW_CAP = 30000;
const FULL_CAP = 60000;

const BASE_ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'GIT_EDITOR', 'VISUAL', 'EDITOR']) {
    BASE_ENV[k] = undefined;
}
BASE_ENV.NODE_V8_COVERAGE = undefined;

let TOP = null;
let seq = 0;
function mkTop() {
    if (TOP === null) TOP = mkdtempSync(join(tmpdir(), 'mocks-runner-t-'));
    return TOP;
}
function mk(name) {
    const d = join(mkTop(), `${name}-${++seq}`);
    mkdirSync(d, { recursive: true });
    return d;
}
before(() => { mkTop(); });
after(() => {
    if (TOP !== null) rmSync(TOP, { recursive: true, force: true });
    TOP = null;
});

function stageCopy(tag, srcText) {
    const base = mk(tag);
    const repo = join(base, 'repo');
    const mocksDir = join(repo, 'mocks');
    const tmp = join(base, 'tmp');
    mkdirSync(mocksDir, { recursive: true });
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}\n');
    const copyPath = join(mocksDir, 'run.mjs');
    writeFileSync(copyPath, srcText);
    chmodSync(copyPath, 0o755);
    return { copyPath, tmp };
}

function runRunner(scriptPath, args, tmp, cap, what) {
    const env = { ...BASE_ENV, TMPDIR: tmp };
    return capSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', env, group: true }, cap, what);
}

function mutateOnce(src, target, replacement, label) {
    const parts = src.split(target);
    assert.equal(parts.length - 1, 1, `${label}: anchor must match exactly once, matched ${parts.length - 1}`);
    return parts.join(replacement);
}

test('A6 source hygiene: mocks/run.mjs is pure ASCII (0 CR, 0 NUL) and imports node: built-ins only', () => {
    const buf = readFileSync(RUNNER);
    for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        assert.ok(
            b === 0x09 || b === 0x0a || (b >= 0x20 && b <= 0x7e),
            `mocks/run.mjs: non-ASCII or control byte 0x${b.toString(16)} at offset ${i}`
        );
    }
    const text = buf.toString('utf8');
    const imports = [...text.matchAll(/^\s*import\s+[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.ok(imports.length > 0, 'mocks/run.mjs must have static node: imports');
    for (const spec of imports) {
        assert.ok(spec.startsWith('node:'), `mocks/run.mjs: non-node import ${JSON.stringify(spec)}`);
    }
});

test('A2 full --self-test: all 14 rows S1-S14 pass and leave 0 temp dirs', { skip }, () => {
    const tmp = mk('full-st-tmp');
    const r = runRunner(RUNNER, ['--self-test', '--node', process.execPath], tmp, FULL_CAP, 'mocks --self-test');
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /^self-test: 14 row\(s\) ok$/m);
    for (let i = 1; i <= 14; i++) {
        assert.match(r.stdout, new RegExp(`^ok S${i} `, 'm'), `missing ok S${i}`);
    }
    assert.deepEqual(readdirSync(tmp), [], 'self-test must leave 0 temp entries in TMPDIR');
});

test('A2 --self-test unknown row exits 2', { skip }, () => {
    const tmp = mk('bad-row-tmp');
    const r = runRunner(RUNNER, ['--self-test=S99', '--node', process.execPath], tmp, ROW_CAP, 'mocks --self-test=S99');
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
    assert.match(r.stderr, /unknown row/);
});

// 16 single-path mutants from PLAN-mocks T3 (R6, R15 M-APO2): each runs ONLY its killing row plus an unmutated revert control.
const MUTANTS = [
    {
        id: 'M-TEETH',
        row: 'S10',
        desc: 'teeth passes on TIMEOUT',
        target: 'const ok = !decoded.fatal && decoded.consistent && decoded.got === c.teethGot && decoded.got !== resolvedExp.verdict;',
        replacement: 'const ok = decoded.fatal || (decoded.consistent && decoded.got === c.teethGot && decoded.got !== resolvedExp.verdict);',
    },
    {
        id: 'M-ZERO',
        row: 'S11',
        desc: 'zero selected cases exits 0',
        target: "  if (cases.length === 0) {\n    process.stderr.write('mocks/run.mjs: no cases selected\\n');\n    process.exit(2);\n  }",
        replacement: "  if (cases.length === 0) {\n    process.exit(0);\n  }",
    },
    {
        id: 'M-VERDICT',
        row: 'S6',
        desc: 'missing VERDICT line skipped',
        target: "    if (found.length === 0) {\n      return { got: rcWord, fatal: false, consistent: false, reason: 'missing VERDICT line' };\n    }",
        replacement: "    if (found.length === 0) {\n      return { got: rcWord, fatal: false, consistent: true, reason: '' };\n    }",
    },
    {
        id: 'M-REASON',
        row: 'S3',
        desc: 'text checked across whole stdout instead of single line',
        target: 'const hit = lines.find((line) => matcher.all.every((tok) => line.includes(tok)));',
        replacement: 'const joined = lines.join("\\n"); const hit = matcher.all.every((tok) => joined.includes(tok)) ? joined : undefined;',
    },
    {
        id: 'M-STDERR',
        row: 'S4',
        desc: 'stderr matcher accepted on change DIFF case',
        target: 'if (item.stream === \'stderr\' && !allowStderr) {',
        replacement: 'if (false && item.stream === \'stderr\' && !allowStderr) {',
    },
    {
        id: 'M-FORBID',
        row: 'S5',
        desc: 'forbid check disabled',
        target: 'for (const bad of resolvedExp.forbid) {',
        replacement: 'for (const bad of []) {',
    },
    {
        id: 'M-GROUP',
        row: 'S8',
        desc: 'group kill replaced with child.kill',
        target: "process.kill(-child.pid, 'SIGKILL');",
        replacement: "child.kill('SIGKILL');",
    },
    {
        id: 'M-SYMLINK',
        row: 'S12',
        desc: 'lstatSync replaced by statSync (follows symlinks on --keep/--json)',
        target: 'selfLstat = fs.lstatSync(abs);',
        replacement: 'selfLstat = fs.statSync(abs);',
    },
    {
        id: 'M-OUTSIDE',
        row: 'S12',
        desc: 'inside-repo check disabled for --keep and --json',
        target: 'if (resolved === repoReal || resolved.startsWith(repoReal + path.sep)) {',
        replacement: 'if (false && (resolved === repoReal || resolved.startsWith(repoReal + path.sep))) {',
    },
    {
        id: 'M-ENV-COV',
        row: 'S13',
        desc: 'NODE_V8_COVERAGE deleted instead of set to undefined',
        target: '  for (const k of SCRUB_ENV_KEYS) {\n    env[k] = undefined;\n  }',
        replacement: '  for (const k of SCRUB_ENV_KEYS) {\n    delete env[k];\n  }',
    },
    {
        id: 'M-ENV-BASH',
        row: 'S13',
        desc: 'BASH_ENV omitted from scrub list',
        target: "  'BASH_ENV',\n",
        replacement: '',
    },
    {
        id: 'M-KNOWN',
        row: 'S9',
        desc: 'known swallows TIMEOUT as KNOWN',
        target: "    if (decoded.fatal || !decoded.consistent) {\n      return { status: 'MISMATCH', fail: true, detail: decoded.reason || decoded.got };\n    }",
        replacement: "    if (decoded.fatal || !decoded.consistent) {\n      return { status: 'KNOWN', fail: false, detail: decoded.got };\n    }",
    },
    {
        id: 'M-STRICTKNOWN',
        row: 'S9',
        desc: '--strict-known ignored (KNOWN-MATCH exits 0)',
        target: "      return {\n        status: 'KNOWN-MATCH',\n        fail: Boolean(strictKnown),\n        detail: `known=${c.known} now matches`,\n      };",
        replacement: "      return {\n        status: 'KNOWN-MATCH',\n        fail: false,\n        detail: `known=${c.known} now matches`,\n      };",
    },
    {
        id: 'M-SCHEMA',
        row: 'S11',
        desc: 'unknown top-level key in case.json accepted',
        target: '  for (const k of Object.keys(raw)) {\n    if (!TOP_KEYS.has(k)) {\n      throw new Error(`${id}: unknown key in case.json: ${JSON.stringify(k)}`);\n    }\n  }',
        replacement: '  for (const k of Object.keys(raw)) { void k; }',
    },
    {
        id: 'M-APO',
        row: 'S7',
        desc: 'alloc-per-op summary cross-check skipped',
        target: '  if (res.status === 0 || res.status === 1) {\n    if (summaryWords.length === 0) {',
        replacement: "  if (res.status === 0 || res.status === 1) {\n    return { got: rcWord, fatal: false, consistent: true, reason: '' };\n    if (summaryWords.length === 0) {",
    },
    {
        id: 'M-APO2',
        row: 'S7',
        desc: 'exit 2 with a PASS / FAIL summary accepted as NO-VERDICT (R15)',
        target: "    if (summaryWords.some((w) => w !== 'NO-VERDICT')) {",
        replacement: '    if (false) {',
    },
];

const ORIGINAL_SRC = readFileSync(RUNNER, 'utf8');

for (const m of MUTANTS) {
    test(`A2 mutant ${m.id} (${m.desc}) dies on ${m.row} and revert control passes`, { skip }, () => {
        const mutated = mutateOnce(ORIGINAL_SRC, m.target, m.replacement, m.id);
        // 1. Revert control: unmutated copy passes the killing row
        const ctrl = stageCopy(`ctrl-${m.id}`, ORIGINAL_SRC);
        const cr = runRunner(ctrl.copyPath, [`--self-test=${m.row}`, '--node', process.execPath], ctrl.tmp, ROW_CAP, `ctrl ${m.id}`);
        assert.equal(cr.status, 0, `${m.id} control failed (exit ${cr.status}):\n${cr.stdout}\n${cr.stderr}`);
        assert.match(cr.stdout, new RegExp(`^ok ${m.row} `, 'm'));

        // 2. Mutant: mutated copy MUST fail the killing row (exit 1)
        const mut = stageCopy(`mut-${m.id}`, mutated);
        const mr = runRunner(mut.copyPath, [`--self-test=${m.row}`, '--node', process.execPath], mut.tmp, ROW_CAP, `mut ${m.id}`);
        assert.equal(mr.status, 1, `${m.id} SURVIVED (expected exit 1, got ${mr.status}):\n${mr.stdout}\n${mr.stderr}`);
        assert.match(mr.stdout, new RegExp(`^FAIL ${m.row} `, 'm'));
    });
}

// R17 gates on a private repo copy (fake root tool, one case): exit discipline and refusal order.
function stageRepoCopy(tag) {
    const base = mk(tag);
    const repo = join(base, 'repo');
    const caseDir = join(repo, 'mocks', 'shape-diff', 'c1');
    const tmp = join(base, 'tmp');
    mkdirSync(caseDir, { recursive: true });
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}\n');
    const tool = join(repo, 'shape-diff.sh');
    writeFileSync(tool, '#!/usr/bin/env bash\necho "VERDICT SAME"\nexit 0\n');
    chmodSync(tool, 0o755);
    const copyPath = join(repo, 'mocks', 'run.mjs');
    writeFileSync(copyPath, ORIGINAL_SRC);
    chmodSync(copyPath, 0o755);
    writeFileSync(join(caseDir, 'driver.mjs'), '// c1\n');
    writeFileSync(join(caseDir, 'case.json'), JSON.stringify({
        tool: 'shape-diff.sh', class: 'c1', kind: 'same', claim: 'c1 claim',
        files: { a: 'driver.mjs' }, argv: ['{a}'],
        expect: { verdict: 'SAME' },
    }, null, 2) + '\n');
    return { base, repo, copyPath, tmp };
}

test('G-B1 R17: a plain run and an --explain run leave 0 entries in TMPDIR (stage removed via finally)', { skip }, () => {
    const s = stageRepoCopy('g-b1');
    const r = runRunner(s.copyPath, ['--node', process.execPath], s.tmp, ROW_CAP, 'G-B1 run');
    assert.equal(r.status, 0, `run: expected exit 0, got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /^summary: 1\/1 as expected /m);
    assert.deepEqual(readdirSync(s.tmp), [], 'plain run left its stage dir in TMPDIR');
    const e = runRunner(s.copyPath, ['--node', process.execPath, '--explain', 'shape-diff/c1'], s.tmp, ROW_CAP, 'G-B1 explain');
    assert.equal(e.status, 0, `explain: expected exit 0, got ${e.status}\nstdout:\n${e.stdout}\nstderr:\n${e.stderr}`);
    assert.match(e.stdout, /^result: OK /m);
    assert.deepEqual(readdirSync(s.tmp), [], '--explain left its stage dir in TMPDIR');
});

test('G-B2 R17: --keep inside the repo is refused before the --node probe spawns', { skip }, () => {
    const s = stageRepoCopy('g-b2');
    const marker = join(s.base, 'probe-ran.marker');
    const fakeNode = join(s.base, 'fake-node');
    writeFileSync(fakeNode, `#!/bin/sh\n/usr/bin/touch '${marker}'\necho v99.0.0\nexit 0\n`);
    chmodSync(fakeNode, 0o755);
    const r = runRunner(s.copyPath, ['--node', fakeNode, '--keep', join(s.repo, 'x')], s.tmp, ROW_CAP, 'G-B2 run');
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /--keep: must resolve outside repository/);
    assert.equal(readdirSync(s.base).includes('probe-ran.marker'), false, '--node probe spawned before the --keep refusal');
    assert.equal(readdirSync(s.repo).includes('x'), false, '--keep dir created inside the repo');
});

const rootSkip = skip || (typeof process.getuid === 'function' && process.getuid() === 0 ? 'root ignores directory modes' : false);
test('G-B3 R17: a --keep directory that cannot be created exits 2 with a mocks/run.mjs: message (no uncaught throw)', { skip: rootSkip }, () => {
    const s = stageRepoCopy('g-b3');
    const ro = join(s.base, 'ro');
    mkdirSync(ro);
    chmodSync(ro, 0o555);
    try {
        const r = runRunner(s.copyPath, ['--node', process.execPath, '--keep', join(ro, 'sub')], s.tmp, ROW_CAP, 'G-B3 run');
        assert.equal(r.status, 2, `expected exit 2, got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
        assert.match(r.stderr, /^mocks\/run\.mjs: --keep: cannot create directory /m);
        assert.deepEqual(readdirSync(s.tmp), [], 'refused --keep run left entries in TMPDIR');
    } finally {
        chmodSync(ro, 0o755);
    }
});
