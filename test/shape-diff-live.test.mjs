// test/shape-diff-live.test.mjs -- ../shape-diff.sh on REAL node spawns (1.2.0 G-L B1, PLAN-SD-L tasks 1, L1, L2).
// ORACLE: the 27 assertions of research/shape-diff/probes/run-probes.sh (the BEFORE the prototype was proven on), one
// test per run-probes section S1..S9, each assertion named by its run-probes label; never a fresh run of the tool.
// S1 differs from run-probes on purpose (PLAN-SD-L task 1): it runs the ROOT with --out and reads raw/before/run.1.{log,out};
// the unresolved non-zero map pc count is computed here in JS (an oracle independent of the tool's awk).
// Drivers (Q-B103-DRIVERS (a)): research/shape-diff/probes/*.mjs read in place, sha256-pinned in DRIVER_SHA; a drifted
// driver is a named red assertion inside every row that uses it. research/ is the maintainer's: never written.
// TIER (Q-B103-LIVETIER (a), MD-21 form, #139): EXACT = process.version is a version captured in
// fixtures/shape-diff/real/*/PROVENANCE.txt `node=` (v22.23.5, v24.22.3, v26.8.2, v27.0.0-alpha.0.1.0; the v26.8.2 CI legs).
// There: strict exit codes and every run-probes line. Any other node accepts only the row's non-fail-open codes:
// must-differ {1, 2}; NO-VERDICT {1, 2}, a 2 naming the owner; SAME {0}, or {2} whose every NO-VERDICT reason is the
// warm-up guard; never the fail-open code. Tool-format facts (0 TABs, --out files, CLI refusals, S1's log facts) are
// strict on every node.
// L1: TRACE_FLAGS parsed from the built root (`TRACE_FLAGS=(` one flag per line): exactly 7, incl. --no-sparkplug and
// --no-node-snapshot (0 found is red; synthetic 6-flag / no-block controls are red in-row). L2: every
// real/<major>/PROVENANCE.txt `flags=` equals L1's list, majors 22 / 24 / 26 / 27.
// Spawns: capSync only, 300000 ms per tool run, 60000 ms per direct node spawn (nominal; the timeout is named first, law 1).
// cwd and TMPDIR are private mktemp dirs, removed after. Child env drops NODE, NODE_OPTIONS, NODE_COMPILE_CACHE,
// NODE_REDIRECT_WARNINGS and the editor variables; NODE_V8_COVERAGE = undefined (node re-adds a deleted key).
// The quiet lock is never read here (Q-B103-LIVELOCK (a): the runner checks `quiet-lock.mjs status`; CI has no lock).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'shape-diff.sh');
const PROBES = join(HERE, '..', 'research', 'shape-diff', 'probes');
const REAL = join(HERE, 'fixtures', 'shape-diff', 'real');
const NODE = process.execPath;
const TOOL_CAP = 300000;
const NODE_CAP = 60000;
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

const ENV = { ...process.env };
for (const k of ['NODE', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];
ENV.NODE_V8_COVERAGE = undefined;   // not a delete: node's child_process re-inserts a missing NODE_V8_COVERAGE key

// sha256 of research/shape-diff/probes/<name> at HEAD 897e3f3 (the bytes run-probes.sh was proven with)
const DRIVER_SHA = {
    'addf-after.mjs': 'bfdcfce2fc133c092559e1c8793c79761a4f79a1213fdb43d8103643df9cb055',
    'addf-before.mjs': 'f823bc8ca9b7377b6e371654aaa182b613642678c7103f9a5500e10b459f214e',
    'builtins-clean.mjs': '71446446c80581477d857375764d8ffcc39544c45c6d5142259172967fefa046',
    'builtins-dirty.mjs': 'e673f1ce30d54172cf464828bacdb65008c9ac78f35a00715c909a30447e0ca0',
    'clean-and-literal.mjs': '388b27fee68be7e28d0c0c96e2f3acaddc7b4e145ab0e32b77fab79030fd6e1b',
    'helper-clean.mjs': 'b25809419b52cda632fbec3f2af0982396d931f4c396e506483c9702be6767c8',
    'helper-del.mjs': '8867e1f78978d10a03c0f27825b34f62fc833477655b29d7b9f8744a94de3bd6',
    'push-200.mjs': '3e5cb0522e94c272617202a9422b5f71c1eb197d8ffb419dee14cd6296f3feb2',
    'push-silent.mjs': '33ec62e86960520a74dcd278af8c07327523e540a904d4048d546a5847e5f6c4',
    'uncalled.mjs': 'c2266416ebc7753e27ac64372acf26f07be145f587bec4d0438b6890051d892d',
    'unstable-all.mjs': 'b154148bc0650efb0a461e475e6800c01d1d432fe34a09e02cadcb39eec7d779',
};
function driver(name) {
    const p = join(PROBES, name);
    const got = createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(got, DRIVER_SHA[name], `driver drift: research/shape-diff/probes/${name} sha256 differs from its pin`);
    return p;
}

// Exact-line versions: every real/<major>/PROVENANCE.txt `node=` (an `(ALPHA)` suffix is a label, not part of the version).
function provenance() {
    const out = [];
    for (const d of readdirSync(REAL).filter((x) => /^[0-9]+$/.test(x)).sort()) {
        out.push({ major: d, text: readFileSync(join(REAL, d, 'PROVENANCE.txt'), 'utf8') });
    }
    return out;
}
function provField(text, key) {
    return text.split('\n').filter((l) => l.startsWith(key + '=')).map((l) => l.slice(key.length + 1));
}
const EXACT_VERSIONS = provenance().map((p) => (provField(p.text, 'node')[0] || '').split(' ')[0]).filter(Boolean);
const EXACT = EXACT_VERSIONS.includes(process.version);
const TIER = EXACT ? `exact on ${process.version}` : `codes only on ${process.version}`;

function priv(tag) { return mkdtempSync(join(tmpdir(), `sdl-${tag}-`)); }

// One tool run: private cwd + TMPDIR; returns { status, out (stdout + stderr) }.
function tool(args, what) {
    const cwd = priv('cwd');
    const tmp = priv('tmp');
    try {
        const r = capSync('bash', [ROOT, '--node', NODE, '--runs', '2', ...args],
            { encoding: 'utf8', cwd, env: { ...ENV, TMPDIR: tmp }, maxBuffer: 64 * 1024 * 1024 }, TOOL_CAP, `shape-diff.sh ${what} (live)`);
        return { status: r.status, out: r.stdout + r.stderr };
    } finally {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(tmp, { recursive: true, force: true });
    }
}
// One direct node spawn (run-probes S8): stdout + stderr, as its 2>&1.
function nodeRun(args, what) {
    const cwd = priv('ncwd');
    try {
        const r = capSync(NODE, args, { encoding: 'utf8', cwd, env: { ...ENV, TMPDIR: cwd }, maxBuffer: 64 * 1024 * 1024 }, NODE_CAP, `node ${what} (live)`);
        return { status: r.status, out: r.stdout + r.stderr };
    } finally { rmSync(cwd, { recursive: true, force: true }); }
}
function countSub(text, sub) { return text.split('\n').filter((l) => l.includes(sub)).length; }

// Tier checks (Q-B103-LIVETIER (a)).
const WARMUP = 'warm up more until optimizing compile';
function sameCode(r, label) {
    if (EXACT) { assert.equal(r.status, 0, `${label}: exit (exact tier)\n${r.out}`); return; }
    if (r.status === 0) return;
    assert.equal(r.status, 2, `${label}: SAME row accepts {0} or {2 warm-up only} on ${process.version}\n${r.out}`);
    const nv = r.out.split('\n').filter((l) => l.includes(': NO-VERDICT -- '));
    assert.ok(nv.length >= 1 && nv.every((l) => l.includes(WARMUP)), `${label}: exit 2 with a reason other than the warm-up guard\n${r.out}`);
    assert.ok(!r.out.includes('unattributed/external') && !r.out.includes('shape-diff: '), `${label}: exit 2 not from the warm-up guard\n${r.out}`);
    assert.ok(!r.out.includes(': DIFF -- '), `${label}: a DIFF hidden under a warm-up exit 2\n${r.out}`);
}
function differCode(r, want, label) {
    if (EXACT) { assert.equal(r.status, want, `${label}: exit (exact tier)\n${r.out}`); return; }
    assert.ok(r.status === 1 || r.status === 2, `${label}: must-differ row accepts {1, 2} on ${process.version}, got ${r.status}\n${r.out}`);
}
function noVerdictCode(r, owners, label) {
    if (EXACT) { assert.equal(r.status, 2, `${label}: exit (exact tier)\n${r.out}`); return; }
    assert.ok(r.status === 1 || r.status === 2, `${label}: NO-VERDICT row accepts {1, 2} on ${process.version}, got ${r.status}\n${r.out}`);
    if (r.status === 2) assert.ok(owners.some((o) => r.out.includes(o)), `${label}: NO-VERDICT names none of ${owners.join(' / ')}\n${r.out}`);
}
function contains(r, sub, label) {
    if (!EXACT) return;
    assert.ok(r.out.includes(sub), `${label}: missing [${sub}]\n${r.out}`);
}

// S1 oracle: run-probes' awk, in JS. A map pc is resolved when a code-creation seen BEFORE it covers it
// ([start, start + size)); a pc that does not parse counts as unresolved (fail closed).
function hexNum(s) { return /^0x[0-9a-fA-F]+$/.test(s) ? Number.parseInt(s.slice(2), 16) : NaN; }
function unresolvedPcs(log) {
    const cs = [];
    const ce = [];
    let u = 0;
    let nz = 0;
    for (const line of log.split('\n')) {
        if (line.startsWith('code-creation,')) {
            const f = line.split(',');
            const s = hexNum(f[4]);
            cs.push(s);
            ce.push(s + Number(f[5]));
        } else if (line.startsWith('map,')) {
            const f = line.split(',');
            const p = hexNum(f[5]);
            if (p === 0) continue;
            nz++;
            let hit = false;
            if (p === p) for (let i = cs.length - 1; i >= 0; i--) if (p >= cs[i] && p < ce[i]) { hit = true; break; }
            if (!hit) u++;
        }
    }
    return { u, nz };
}
// code-creation lines whose last field (the tier marker) is `^` (Sparkplug / CodeKind::BASELINE)
function caretLines(log) {
    let n = 0;
    for (const line of log.split('\n')) {
        if (!line.startsWith('code-creation,')) continue;
        const f = line.split(',');
        if (f[f.length - 1] === '^' && /^0x[0-9a-fA-F]+$/.test(f[f.length - 2])) n++;
    }
    return n;
}

test(`S1 raw 3-stream run through the root with --out: exit, 0 unresolved non-zero map pcs, 0 ^ code-creation, inline ELEM (${TIER})`, { skip }, () => {
    const ua = driver('unstable-all.mjs');
    const d = priv('s1');
    try {
        const out = join(d, 'o');
        const r = tool(['--out', out, '--fn', 'work', ua, ua], '--out --fn work unstable-all A/A');
        sameCode(r, '3-stream run with --no-sparkplug exits 0 (fixes Node 22 SIGTRAP)');
        const log = readFileSync(join(out, 'raw', 'before', 'run.1.log'), 'latin1');
        const txt = readFileSync(join(out, 'raw', 'before', 'run.1.out'), 'latin1');
        assert.ok(log.split('\n').some((l) => l.startsWith('code-creation,')), 'raw/before/run.1.log holds code-creation lines (oracle input not empty)');
        assert.ok(log.split('\n').some((l) => l.startsWith('map,')), 'raw/before/run.1.log holds map lines (oracle input not empty)');
        const up = unresolvedPcs(log); assert.ok(up.nz >= 1, 'raw/before/run.1.log holds non-zero map pcs (oracle measured)'); assert.equal(up.u, 0, '0 unresolved non-zero map pcs (snapshot kept off)');
        assert.equal(caretLines(log), 0, '0 ^ (Sparkplug) code-creation lines (--no-sparkplug in effect)');
        const elem = countSub(txt, 'elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+');
        assert.ok(elem >= 1, `inline elements transition traced on ${process.version} (${elem} line)`);
    } finally { rmSync(d, { recursive: true, force: true }); }
});

test(`S2 N4 + clean A/A: clean-and-literal vs itself -> SAME, makeLit 0 instability sites (${TIER})`, { skip }, () => {
    const cl = driver('clean-and-literal.mjs');
    const r = tool(['--fn=Point,makeLit,work', cl, cl], '--fn=Point,makeLit,work clean-and-literal A/A');
    sameCode(r, 'A/A clean-and-literal (incl. {a:i,b:2} + anon Symbol()) -> SAME (rc 0)');
    contains(r, 'makeLit: SAME -- identical shape-instability multiset (before 0 | after 0 site(s))', 'makeLit has 0 instability sites (N4 no-op s->s + v{None} filtered)');
});

test(`S3 D7 + N4 add-field: {a:i,b:2} vs {a:i,b:2,c:3} -> SAME, normal transitions 2 -> 3 (${TIER})`, { skip }, () => {
    const b = driver('addf-before.mjs');
    const a = driver('addf-after.mjs');
    const r = tool(['--fn', 'mk', b, a], '--fn mk addf-before vs addf-after');
    sameCode(r, 'add-field addf-before vs addf-after -> SAME (rc 0)');
    contains(r, 'normal-transitions: before=2 after=3', 'add-field normal transitions 2 -> 3');
});

test(`S4 must-fail DIFF clean vs unstable-all: exit, 5 DIFF lines, 0 raw TABs, --out artifacts (${TIER})`, { skip }, () => {
    const cl = driver('clean-and-literal.mjs');
    const ua = driver('unstable-all.mjs');
    const d = priv('s4');
    try {
        const out = join(d, 'sd-out');
        const r = tool(['--out', out, '--fn', 'Point,work', cl, ua], '--out --fn Point,work clean vs unstable-all');
        differCode(r, 1, 'clean vs unstable-all -> DIFF (rc 1)');
        contains(r, 'Point  GEN  x:s{Any;const}->d{Any;const}', 'DIFF catches GEN x:s->d');
        contains(r, 'Point  MAP_DEPRECATE', 'DIFF catches MAP_DEPRECATE');
        contains(r, 'work  ELEM  PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS', 'DIFF catches ELEM PACKED_SMI -> PACKED_DOUBLE');
        contains(r, 'work  MAP_ELEM_DICT  HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS', 'DIFF catches MAP_ELEM_DICT HOLEY -> DICTIONARY');
        contains(r, 'work  MAP_NORMALIZE  DeletingProperty', 'DIFF catches MAP_NORMALIZE DeletingProperty');
        assert.equal(r.out.includes('\t'), false, 'DIFF output contains 0 raw TABs');
        const sz = (p) => { try { return statSync(p).size; } catch { return 0; } };
        const has = sz(join(out, 'report.txt')) > 0 && sz(join(out, 'raw', 'before', 'run.1.log')) > 0 && sz(join(out, 'raw', 'after', 'run.2.out')) > 0;
        assert.equal(has, true, '--out wrote report.txt + raw/{before,after}/run.{1,2}.{log,out}');
    } finally { rmSync(d, { recursive: true, force: true }); }
});

test(`S5 N1 non-target helper (200 calls): helper-clean vs helper-del -> NO-VERDICT naming user:del (${TIER})`, { skip }, () => {
    const c = driver('helper-clean.mjs');
    const h = driver('helper-del.mjs');
    const r = tool(['--fn', 'mk', c, h], '--fn mk helper-clean vs helper-del');
    noVerdictCode(r, ['user:del'], 'N1 non-target helper del() at 200 calls -> NO-VERDICT (rc 2, NOT false SAME)');
    contains(r, 'user:del', 'N1 names user:del in unattributed/external diff');
});

test(`S6 D1 builtin mutations: builtins-clean vs builtins-dirty -> NO-VERDICT naming the builtins (${TIER})`, { skip }, () => {
    const c = driver('builtins-clean.mjs');
    const dd = driver('builtins-dirty.mjs');
    const r = tool(['--fn', 'mutBuiltins', c, dd], '--fn mutBuiltins builtins-clean vs builtins-dirty');
    noVerdictCode(r, ['Builtin:ReflectDeleteProperty', 'UNATTR  ELEM  splice'], 'D1 Reflect.deleteProperty + splice -> NO-VERDICT (rc 2, NOT false SAME)');
    contains(r, 'Builtin:ReflectDeleteProperty', 'D1 names Builtin:ReflectDeleteProperty');
    contains(r, 'UNATTR  ELEM  splice', 'D1 names splice ELEM');
});

test(`S7 D2 compiled-but-uncalled -> NO-VERDICT (default lazy and --no-lazy) (${TIER})`, { skip }, () => {
    const u = driver('uncalled.mjs');
    const r1 = tool(['--fn', 'neverCalledParenFn', u, u], '--fn neverCalledParenFn uncalled A/A');
    noVerdictCode(r1, ['neverCalledParenFn: NO-VERDICT'], 'D2 neverCalledParenFn (default lazy) -> NO-VERDICT (rc 2)');
    const r2 = tool(['--v8-flags', '--no-lazy', '--fn', 'neverCalledTop', u, u], '--v8-flags --no-lazy --fn neverCalledTop uncalled A/A');
    noVerdictCode(r2, ['neverCalledTop: NO-VERDICT'], 'D2 neverCalledTop (--no-lazy) -> NO-VERDICT (rc 2)');
});

test(`S8 Array.prototype.push(1.5): 1 cold call = 0 lines vs 200 calls = 2 lines (${TIER})`, { skip }, () => {
    const ps = driver('push-silent.mjs');
    const p2 = driver('push-200.mjs');
    const r1 = nodeRun(['--allow-natives-syntax', '--no-sparkplug', '--trace-elements-transitions', ps], 'push-silent.mjs');
    assert.equal(r1.status, 0, 'push-silent.mjs exits 0\n' + r1.out);
    assert.ok(r1.out.includes('PUSH_PROOF: hadSmi=true hasDouble=true'), 'push-silent.mjs proves hadSmi=true hasDouble=true\n' + r1.out);
    const r2 = nodeRun(['--no-sparkplug', '--trace-elements-transitions', p2], 'push-200.mjs');
    const c1 = countSub(r1.out, 'in push+');
    const c200 = countSub(r2.out, 'in push+');
    if (EXACT) assert.equal(`${c1}:${c200}`, '0:2', 'push(1 cold call) prints 0 lines; push(200 calls) prints 2 lines');
    else assert.ok(c200 >= 1, `push(200 calls) is traced on ${process.version} (codes-only tier; got ${c1}:${c200})`);
});

test('S9 D8 / D9 / N6 CLI refusals: --inspect, --always-sparkplug, a symlink --out dir -> exit 2 (every node)', { skip }, () => {
    const b = driver('addf-before.mjs');
    const r1 = tool(['--v8-flags', '--inspect', '--fn', 'mk', b, b], '--v8-flags --inspect');
    assert.equal(r1.status, 2, 'D8 allowlist refuses --inspect (rc 2)\n' + r1.out);
    const r2 = tool(['--v8-flags', '--always-sparkplug', '--fn', 'mk', b, b], '--v8-flags --always-sparkplug');
    assert.equal(r2.status, 2, 'refuses --always-sparkplug conflict (rc 2)\n' + r2.out);
    const d = priv('s9');
    try {
        mkdirSync(join(d, 'raw'));
        symlinkSync(join(d, 'raw'), join(d, 'sym-out'));
        const r3 = tool(['--out', join(d, 'sym-out'), '--fn', 'mk', b, b], '--out <symlink>');
        assert.equal(r3.status, 2, 'D9 refuses symlink --out dir itself (rc 2)\n' + r3.out);
        assert.deepEqual(readdirSync(join(d, 'raw')), [], 'D9: nothing written through the symlink');
    } finally { rmSync(d, { recursive: true, force: true }); }
});

// L1 parser: the lines between `TRACE_FLAGS=(` and the next `)` line, one flag per line.
function traceFlags(src) {
    const lines = src.split('\n');
    const starts = lines.reduce((a, l, i) => (l === 'TRACE_FLAGS=(' ? [...a, i] : a), []);
    if (starts.length !== 1) return { blocks: starts.length, flags: [] };
    const flags = [];
    for (let i = starts[0] + 1; i < lines.length && lines[i] !== ')'; i++) flags.push(lines[i].trim());
    return { blocks: 1, flags };
}
function checkFlags(tf) {
    assert.equal(tf.blocks, 1, 'exactly one `TRACE_FLAGS=(` block');
    assert.equal(tf.flags.length, 7, `exactly 7 TRACE_FLAGS, got ${tf.flags.length} (0 found is red)`);
    for (const f of tf.flags) assert.match(f, /^--[a-z0-9][a-z0-9-]*$/, `one flag per line: [${f}]`);
    assert.ok(tf.flags.includes('--no-sparkplug'), 'TRACE_FLAGS holds --no-sparkplug');
    assert.ok(tf.flags.includes('--no-node-snapshot'), 'TRACE_FLAGS holds --no-node-snapshot');
    assert.equal(new Set(tf.flags).size, 7, 'no duplicate flag');
}

test('L1 TRACE_FLAGS parsed from the built root: exactly 7, incl. --no-sparkplug and --no-node-snapshot; 6-flag and no-block controls red', () => {
    const src = readFileSync(ROOT, 'utf8');
    checkFlags(traceFlags(src));
    const six = src.split('\n  --no-sparkplug\n');
    assert.equal(six.length, 2, 'control anchor `  --no-sparkplug` matches exactly once');
    assert.throws(() => checkFlags(traceFlags(six.join('\n'))), 'control: a 6-flag block is red');
    assert.throws(() => checkFlags(traceFlags(src.split('TRACE_FLAGS=(').join('TRACE_FLAGS_X=('))), 'control: no block (0 found) is red');
});

test('L2 every real/<major>/PROVENANCE.txt flags= equals L1 (majors 22 / 24 / 26 / 27)', () => {
    const tf = traceFlags(readFileSync(ROOT, 'utf8'));
    checkFlags(tf);
    const want = tf.flags.join(' ');
    const prov = provenance();
    assert.deepEqual(prov.map((p) => p.major), ['22', '24', '26', '27'], 'captured majors');
    for (const p of prov) {
        const f = provField(p.text, 'flags');
        assert.equal(f.length, 1, `real/${p.major}/PROVENANCE.txt has exactly one flags= line`);
        assert.equal(f[0], want, `real/${p.major}/PROVENANCE.txt flags= equals the root's TRACE_FLAGS`);
        const nv = provField(p.text, 'node'); assert.equal(nv.length, 1, `real/${p.major}/PROVENANCE.txt has exactly one node= line`); assert.match(nv[0], /^v[0-9]+\.[0-9]+\.[0-9]+/, `real/${p.major} node= is a version`);
    }
    assert.equal(EXACT_VERSIONS.length, prov.length, 'one exact-tier version per capture'); assert.ok(EXACT_VERSIONS.includes('v26.8.2'), 'the v26.8.2 CI legs run the exact tier (Q-B103-LIVETIER (a))');
});
