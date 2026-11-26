// test/shape-diff-live.test.mjs -- ../shape-diff.sh on REAL node spawns (1.2.0 G-L B1 + B2, PLAN-SD-L tasks 1, 2: S1..S9, L1..L7, C1).
// ORACLE: the 27 assertions of research/shape-diff/probes/run-probes.sh (the BEFORE the prototype was proven on), one
// test per run-probes section S1..S9, each assertion named by its run-probes label; never a fresh run of the tool.
// S1 differs from run-probes on purpose (PLAN-SD-L task 1): it runs the ROOT with --out and reads raw/before/run.1.{log,out};
// the unresolved non-zero map pc count is computed here in JS (an oracle independent of the tool's awk).
// Drivers (Q-B103-DRIVERS (a)): research/shape-diff/probes/*.mjs read in place, sha256-pinned in DRIVER_SHA; a drifted
// driver is a named red assertion inside every row that uses it. research/ is the maintainer's: never written.
// TIER (Q-B103-LIVETIER (a), MD-21 form, #139): EXACT = process.version is a version captured in
// fixtures/shape-diff/real/*/PROVENANCE.txt `node=` (v22.23.5, v24.22.3, v26.8.2, v27.0.0-alpha.0.1.0; the v26.8.2 CI legs).
// There: strict exit codes and every run-probes line. Any other node accepts only the row's non-fail-open codes:
// must-differ {1, 2}, a 2 with no `shape-diff: ` die and no usage text (Q-B107-DIFF2 (a)) and >= 1 `<fn>: NO-VERDICT -- `
// line, every one the UE-diff reason or the warm-up guard (Q-B107-DIFF3 (a), an allowlist: a crashed, unreadable,
// D5, null-control or never-run child is no verdict; nor is the UE `varied between run 1 and run N` noise, FILLERS 71
// (a)); NO-VERDICT {1, 2} (S7 A/A: {2} only), a 2 with no die or usage text naming the owner (S7: `<fn>: NO-VERDICT --
// before|after: no execution evidence` / `compiled`); SAME {0}, or {2} whose every NO-VERDICT reason is the warm-up guard;
// never the fail-open code. Every tier: exactly one `VERDICT <want>` line anywhere in the output (M13).
// Tool-format facts (0 TABs, --out files, CLI refusals, S1's log facts) are strict on every node.
// L1: TRACE_FLAGS parsed from the built root (`TRACE_FLAGS=(` one flag per line): exactly 7, incl. --no-sparkplug and
// --no-node-snapshot (0 found is red; synthetic 6-flag / no-block controls are red in-row). L2: every
// real/<major>/PROVENANCE.txt `flags=` equals L1's list, majors 22 / 24 / 26 / 27.
// B2 rows (G-L B2, b107). Drivers new to B2 are string constants written into the row's mktemp dir (Q-B103-DRIVERS (a)).
// L3: N1@20000 (helper-clean / helper-del, `i < 200` -> `i < 20000` exact-once in memory) -> DIFF, rc 1 (the helper
// inlines into mk; the B0c reach saw rc 1 on 22 / 24 / 27 with the prototype too: a reach row, not a revert row).
// L4: D-A (EventEmitter setMaxListeners, 20000 calls) -> NO-VERDICT naming UNATTR GEN node:setMaxListeners; the frozen
// prototype skips every GEN / ELEM line whose frame location is not a file path, so it prints a false SAME (rc 0).
// L5: D-B crafted key k:v{None;const}-> -> DIFF like the control key plain; the prototype read the crafted key as a
// v{None} no-op (unanchored FROM / TO parse) and printed SAME (rc 0) while the control stayed DIFF.
// L6: M6 (the `  --no-sparkplug` TRACE_FLAGS line removed, exact-once, private root copy) makes S1 red by name (major 22:
// the driver dies on CodeKind::BASELINE, tool rc 2; major >= 24: >= 1 ^ code-creation line) and L1 red (6 flags).
// L7: M7 (`|*sparkplug*)` -> `)` in the --v8-flags case arm, exact-once) lets --always-sparkplug through: no refusal
// line and the logging --node wrapper sees spawns carrying the flag (SPEC A14 (ii)); the root refuses with 0 spawns.
// C1 (spawn-free, REVIEW-GL-B1-r1 NIT 3): the codes-only tier checkers (what CI's latest-per-major legs run) throw on
// synthetic fail-open results and pass the good ones.
// Spawns: capSync only, 300000 ms per tool run, 60000 ms per direct node spawn (nominal; the timeout is named first, law 1).
// cwd and TMPDIR are private mktemp dirs, removed after. Child env drops NODE, NODE_OPTIONS, NODE_COMPILE_CACHE,
// NODE_REDIRECT_WARNINGS and the editor variables; NODE_V8_COVERAGE = undefined (node re-adds a deleted key).
// The quiet lock is never read here (Q-B103-LIVELOCK (a): the runner checks `quiet-lock.mjs status`; CI has no lock).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, statSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
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
const MAJOR = Number(process.versions.node.split('.')[0]);
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
function tool(args, what, root = ROOT, node = NODE) {
    const cwd = priv('cwd');
    const tmp = priv('tmp');
    try {
        const r = capSync('bash', [root, '--node', node, '--runs', '2', ...args],
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
// M13 / FILLERS 71 (b116 C-B3): exactly ONE `VERDICT ` line anywhere in the output (not the last line only: a stderr line
// glued after stdout breaks a last-line check benignly), and it names the wanted verdict.
function assertVerdict(r, want, label) {
    const v = r.out.split('\n').filter((l) => l.startsWith('VERDICT '));
    assert.deepEqual(v, [`VERDICT ${want}`], `${label}: expected exactly one VERDICT ${want} line\n${r.out}`);
}
function sameCode(r, label, exact = EXACT) {
    if (exact) { assert.equal(r.status, 0, `${label}: exit (exact tier)\n${r.out}`); assertVerdict(r, 'SAME', label); return; }
    if (r.status === 0) { assertVerdict(r, 'SAME', label); return; }
    assert.equal(r.status, 2, `${label}: SAME row accepts {0} or {2 warm-up only} on ${process.version}\n${r.out}`);
    const nv = r.out.split('\n').filter((l) => l.includes(': NO-VERDICT -- '));
    assert.ok(nv.length >= 1 && nv.every((l) => l.includes(WARMUP)), `${label}: exit 2 with a reason other than the warm-up guard\n${r.out}`);
    assert.ok(!r.out.includes('unattributed/external') && !r.out.includes('shape-diff: '), `${label}: exit 2 not from the warm-up guard\n${r.out}`);
    assert.ok(!r.out.includes(': DIFF -- '), `${label}: a DIFF hidden under a warm-up exit 2\n${r.out}`);
    assertVerdict(r, 'NO-VERDICT', label);
}
function differCode(r, want, label, exact = EXACT) {
    if (exact) { assert.equal(r.status, want, `${label}: exit (exact tier)\n${r.out}`); assertVerdict(r, want === 1 ? 'DIFF' : 'NO-VERDICT', label); return; }
    assert.ok(r.status === 1 || r.status === 2, `${label}: must-differ row accepts {1, 2} on ${process.version}, got ${r.status}\n${r.out}`);
    if (r.status === 1) { assertVerdict(r, 'DIFF', label); return; }
    // Q-B107-DIFF2 (a): a die or usage exit 2 is a refusal, not a verdict (includes, as sameCode: a stderr line glued to
    // stdout's last line still counts)
    assert.ok(!r.out.includes('shape-diff: '), `${label}: a shape-diff: die is not a must-differ verdict on ${process.version}\n${r.out}`);
    assert.ok(!r.out.includes('shape-diff.sh -- '), `${label}: usage text is not a must-differ verdict on ${process.version}\n${r.out}`);
    // Q-B107-DIFF3 (a), allowlist (law 4): an exit 2 counts only when every per-fn NO-VERDICT reason is the UE diff or the
    // warm-up guard; driver exited / unreadable shape trace / elements kind unknown / null control / no execution
    // evidence (judge_side) are a child that did not measure, never a must-differ verdict
    // FILLERS 71 (a) / Q-B110-F71: the UE-diff line whose detail is `unattributed/external instability varied between run 1 and
    // run N` is run-to-run noise, not a measured difference
    assert.ok(!r.out.includes('instability varied between run'), `${label}: UE run-to-run noise (varied between run 1 and run N) is not a must-differ verdict on ${process.version}\n${r.out}`);
    const nv = r.out.split('\n').filter((l) => l.includes(': NO-VERDICT -- '));
    assert.ok(nv.length >= 1, `${label}: exit 2 on a must-differ row needs >= 1 <fn>: NO-VERDICT line on ${process.version}\n${r.out}`);
    const bad = nv.filter((l) => !DIFF_NV_OK.some((re) => re.test(l)));
    assert.deepEqual(bad, [], `${label}: exit 2 on a must-differ row allows only the UE-diff or warm-up reason on ${process.version}\n${r.out}`);
    assertVerdict(r, 'NO-VERDICT', label);
}
const DIFF_NV_OK = [
    /^  \S.*: NO-VERDICT -- attributed sites identical \(before [0-9]+ \| after [0-9]+\), but unattributed\/external shape instability differs:$/,
    /^  \S.*: NO-VERDICT -- (before|after): compiled \(~ or \^\) only with 0 attributed map\/shape events and 0 optimizing compiles for '.*' in run [0-9]+ \(warm up more until optimizing compile, or function was never called\)$/,
];
// S7 owners (Q-B107-DIFF2 (a)): the judge's execution-evidence reasons, never a bare `<fn>: NO-VERDICT` (a null-control
// line for the same fn carries that prefix too).
function d2Owners(fn) {
    return ['before', 'after'].flatMap((side) => [`${fn}: NO-VERDICT -- ${side}: no execution evidence`, `${fn}: NO-VERDICT -- ${side}: compiled`]);
}
// allowDiff=false (S7, C1 d2): an A/A row has no DIFF to accept, exit 2 only.
function noVerdictCode(r, owners, label, exact = EXACT, allowDiff = true) {
    if (exact) { assert.equal(r.status, 2, `${label}: exit (exact tier)\n${r.out}`); assertDieFree(r, label); assertVerdict(r, 'NO-VERDICT', label); return; }
    if (allowDiff) assert.ok(r.status === 1 || r.status === 2, `${label}: NO-VERDICT row accepts {1, 2} on ${process.version}, got ${r.status}\n${r.out}`);
    else assert.equal(r.status, 2, `${label}: strict NO-VERDICT row accepts {2} only on ${process.version}, got ${r.status}\n${r.out}`);
    if (r.status === 1) { assertVerdict(r, 'DIFF', label); return; }
    assertDieFree(r, label);
    assert.ok(owners.some((o) => r.out.includes(o)), `${label}: NO-VERDICT names none of ${owners.join(' / ')}\n${r.out}`);
    assertVerdict(r, 'NO-VERDICT', label);
}
function assertDieFree(r, label) {
    assert.ok(!r.out.includes('shape-diff: '), `${label}: a shape-diff: die is not a NO-VERDICT measurement on ${process.version}\n${r.out}`);
    assert.ok(!r.out.includes('shape-diff.sh -- '), `${label}: usage text is not a NO-VERDICT measurement on ${process.version}\n${r.out}`);
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

// S1 run through `root` (the built root, or L6's mutant copy): the tool result plus raw/before/run.1.{log,out}
// (null when --out did not write them; s1Check reads a null as red).
function s1Run(root) {
    const ua = driver('unstable-all.mjs');
    const d = priv('s1');
    try {
        const out = join(d, 'o');
        const r = tool(['--out', out, '--fn', 'work', ua, ua], '--out --fn work unstable-all A/A', root);
        const raw = (n) => { try { return readFileSync(join(out, 'raw', 'before', n), 'latin1'); } catch { return null; } };
        return { r, log: raw('run.1.log'), txt: raw('run.1.out') };
    } finally { rmSync(d, { recursive: true, force: true }); }
}
function s1Check({ r, log, txt }) {
    sameCode(r, '3-stream run with --no-sparkplug exits 0 (fixes Node 22 SIGTRAP)');
    assert.ok(log !== null && txt !== null, '--out wrote raw/before/run.1.log and raw/before/run.1.out');
    assert.ok(log.split('\n').some((l) => l.startsWith('code-creation,')), 'raw/before/run.1.log holds code-creation lines (oracle input not empty)');
    assert.ok(log.split('\n').some((l) => l.startsWith('map,')), 'raw/before/run.1.log holds map lines (oracle input not empty)');
    const up = unresolvedPcs(log); assert.ok(up.nz >= 1, 'raw/before/run.1.log holds non-zero map pcs (oracle measured)'); assert.equal(up.u, 0, '0 unresolved non-zero map pcs (snapshot kept off)');
    assert.equal(caretLines(log), 0, '0 ^ (Sparkplug) code-creation lines (--no-sparkplug in effect)');
    const elem = countSub(txt, 'elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+');
    assert.ok(elem >= 1, `inline elements transition traced on ${process.version} (${elem} line)`);
}

test(`S1 raw 3-stream run through the root with --out: exit, 0 unresolved non-zero map pcs, 0 ^ code-creation, inline ELEM (${TIER})`, { skip }, () => {
    s1Check(s1Run(ROOT));
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
    noVerdictCode(r1, d2Owners('neverCalledParenFn'), 'D2 neverCalledParenFn (default lazy) -> NO-VERDICT (rc 2)', EXACT, false);
    const r2 = tool(['--v8-flags', '--no-lazy', '--fn', 'neverCalledTop', u, u], '--v8-flags --no-lazy --fn neverCalledTop uncalled A/A');
    noVerdictCode(r2, d2Owners('neverCalledTop'), 'D2 neverCalledTop (--no-lazy) -> NO-VERDICT (rc 2)', EXACT, false);
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

// ---- B2 rows (G-L B2, b107; PLAN-SD-L task 2) ------------------------------------------------------------------------
function edit1(text, from, to, what) {
    const parts = text.split(from);
    assert.equal(parts.length, 2, `${what}: anchor [${from.trim()}] matches exactly once`);
    return parts.join(to);
}
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }

test(`L3 N1@20000: helper-clean vs helper-del at 20000 calls -> DIFF (the helper inlines into mk) (${TIER})`, { skip }, () => {
    const c = edit1(readFileSync(driver('helper-clean.mjs'), 'utf8'), 'i < 200', 'i < 20000', 'N1@20000 helper-clean');
    const h = edit1(readFileSync(driver('helper-del.mjs'), 'utf8'), 'i < 200', 'i < 20000', 'N1@20000 helper-del');
    const d = priv('l3');
    try {
        writeFileSync(join(d, 'helper-clean.mjs'), c);
        writeFileSync(join(d, 'helper-del.mjs'), h);
        const r = tool(['--fn', 'mk', join(d, 'helper-clean.mjs'), join(d, 'helper-del.mjs')], '--fn mk N1@20000 helper-clean vs helper-del');
        differCode(r, 1, 'N1@20000 helper del() inlined into mk -> DIFF (rc 1)');
        contains(r, '  mk: DIFF -- shape-instability multiset differs (before 0 | after 1 site(s))', 'N1@20000 mk DIFF line');
        contains(r, 'VERDICT DIFF', 'N1@20000 VERDICT DIFF');
    } finally { rmSync(d, { recursive: true, force: true }); }
});

// The D-A driver: test/fixtures/shape-diff/real/_src/d-a-events.mjs byte for byte (the B0c reach driver), as constants.
const DA_AFTER = [
    '// D-A probe (RECHECK2 section 5): target mk() builds an EventEmitter and calls setMaxListeners(), whose',
    '// node:events frame generalizes the field _maxListeners of the user\'s object, printed as',
    '//   [generalizing]_maxListeners:h{Any;const}->... [~setMaxListeners+N at node:events:L]',
    '// The frozen prototype skips every ELEM / GEN line whose frame location is not a file path, so this',
    '// instability is invisible to it (a false SAME against the same driver without the setMaxListeners line).',
    'import { EventEmitter } from \'node:events\';',
    'function mk(i) {',
    '  const e = new EventEmitter();',
    '  e.setMaxListeners(i + 1);',
    '  return e.getMaxListeners();',
    '}',
    'let s = 0;',
    'for (let i = 0; i < 20000; i++) s += mk(i);',
    'if (s === -1) console.log(s);',
    '',
].join('\n');
const DA_SHA = '264d4965a077b8a8b1479731938d818c3e10093d9e3ae310a5ee176725e9ee62';

test(`L4 D-A: a node:events setMaxListeners GEN -> NO-VERDICT naming UNATTR GEN node:setMaxListeners (prototype: false SAME) (${TIER})`, { skip }, () => {
    assert.equal(sha256(DA_AFTER), DA_SHA, 'D-A driver constant sha256 = the B0c reach driver');
    assert.equal(readFileSync(join(REAL, '_src', 'd-a-events.mjs'), 'utf8'), DA_AFTER, 'D-A driver constant = real/_src/d-a-events.mjs');
    const before = edit1(DA_AFTER, '  e.setMaxListeners(i + 1);\n', '', 'D-A before');
    const d = priv('l4');
    try {
        writeFileSync(join(d, 'da-before.mjs'), before);
        writeFileSync(join(d, 'da-after.mjs'), DA_AFTER);
        const r = tool(['--fn', 'mk', join(d, 'da-before.mjs'), join(d, 'da-after.mjs')], '--fn mk D-A da-before vs da-after');
        // the frozen prototype drops the node:events frame (not a file path) and exits 0 SAME: red here by this exit check
        noVerdictCode(r, ['node:setMaxListeners'], 'D-A setMaxListeners in a node:events frame -> NO-VERDICT (rc 2, NOT the false SAME)');
        contains(r, '  mk: NO-VERDICT -- attributed sites identical (before 0 | after 0), but unattributed/external shape instability differs:', 'D-A mk NO-VERDICT on the UE diff');
        contains(r, '  UNATTR  GEN  node:setMaxListeners  _maxListeners:h{Any;const}->t{Any;mutable}', 'D-A names UNATTR GEN node:setMaxListeners');
        contains(r, 'VERDICT NO-VERDICT', 'D-A VERDICT NO-VERDICT');
    } finally { rmSync(d, { recursive: true, force: true }); }
});

// D-B drivers: o[key] stored once more as a double (const -> mutable) in AFTER only; key crafted or plain.
function dbDriver(key, store) {
    const k = JSON.stringify(key);
    return '// D-B driver (b107 L5): key ' + k + (store ? ' with' : ' without') + ' the const->mutable store\n' +
        'function mk(i) {\n  const o = { ' + k + ': 1.5, b: 2 };\n' + (store ? '  o[' + k + '] = 2.5;\n' : '') +
        '  return o[' + k + '] + o.b + i;\n}\nlet s = 0;\nfor (let i = 0; i < 20000; i++) s += mk(i);\nif (s === -1) console.log(s);\n';
}

test(`L5 D-B: crafted key k:v{None;const}-> -> DIFF like the control key plain (prototype: crafted SAME) (${TIER})`, { skip }, () => {
    const d = priv('l5');
    try {
        const res = {};
        for (const [tag, key] of [['crafted', 'k:v{None;const}->'], ['control', 'plain']]) {
            writeFileSync(join(d, tag + '-before.mjs'), dbDriver(key, false));
            writeFileSync(join(d, tag + '-after.mjs'), dbDriver(key, true));
            res[tag] = tool(['--fn', 'mk', join(d, tag + '-before.mjs'), join(d, tag + '-after.mjs')], `--fn mk D-B ${tag} key`);
        }
        differCode(res.control, 1, 'D-B control key plain: const -> mutable store -> DIFF (rc 1; the pair reaches the GEN)');
        contains(res.control, '  mk: DIFF -- shape-instability multiset differs (before 0 | after 1 site(s))', 'D-B control mk DIFF line');
        // the frozen prototype read `k:v{None;const}->:d...` as a v{None} no-op (unanchored FROM / TO) and exits 0 SAME: red here
        differCode(res.crafted, 1, 'D-B crafted key k:v{None;const}-> is no longer a no-op -> DIFF (rc 1, NOT the false SAME)');
        contains(res.crafted, '  mk: DIFF -- shape-instability multiset differs (before 0 | after 1 site(s))', 'D-B crafted mk DIFF line');
        if (EXACT) assert.equal(res.crafted.status, res.control.status, 'D-B crafted key exits like the control key');
    } finally { rmSync(d, { recursive: true, force: true }); }
});

test(`L6 M6 (--no-sparkplug removed from a root copy) turns S1 red by name and L1 red with 6 flags (${TIER})`, { skip }, () => {
    const src = readFileSync(ROOT, 'utf8');
    const m6 = edit1(src, '\n  --no-sparkplug\n', '\n', 'M6');
    assert.throws(() => checkFlags(traceFlags(m6)), /exactly 7 TRACE_FLAGS, got 6/, 'M6: L1 is red with 6 flags');
    const d = priv('l6');
    try {
        const root = join(d, 'shape-diff.sh');
        writeFileSync(root, m6);
        const m = s1Run(root);
        // crash form (major 22): the driver dies on CodeKind::BASELINE, the tool exits 2, S1 fails its exit check
        const crash = () => {
            assert.equal(m.r.status, 2, `M6 on ${process.version}: tool exit 2 (driver crash)\n${m.r.out}`);
            assert.ok(m.txt !== null && m.txt.includes('CodeKind::BASELINE'), `M6 on ${process.version}: CodeKind::BASELINE in raw/before/run.1.out`);
            assert.throws(() => s1Check(m), /3-stream run with --no-sparkplug exits 0 \(fixes Node 22 SIGTRAP\)/, 'M6: S1 red on its exit check');
        };
        // caret form (major >= 24): Sparkplug code-creation lines appear, S1 fails its ^ count
        const caret = () => {
            assert.ok(m.log !== null && caretLines(m.log) >= 1, `M6 on ${process.version}: >= 1 ^ code-creation line in raw/before/run.1.log`);
            assert.throws(() => s1Check(m), /0 \^ \(Sparkplug\) code-creation lines/, 'M6: S1 red on its ^ count');
        };
        if (EXACT) (MAJOR === 22 ? crash : caret)();
        else {
            let ok = 0;
            for (const f of [crash, caret]) { try { f(); ok++; } catch { /* the other named form */ } }
            assert.ok(ok >= 1, `M6 on ${process.version} (codes only): S1 red by neither named form (crash rc 2 + CodeKind::BASELINE, or >= 1 ^ line)\n${m.r.out}`);
        }
    } finally { rmSync(d, { recursive: true, force: true }); }
});

// A logging --node wrapper: one line per spawn (argv), then exec the real node.
const WRAP = '#!/bin/bash\nprintf \'%s\\n\' "$*" >> \'@LOG@\'\nexec \'@NODE@\' "$@"\n';
function spawnLog(p) { try { return readFileSync(p, 'utf8').split('\n').filter(Boolean); } catch { return []; } }

test('L7 M7 (the *sparkplug* case arm removed from a root copy): --always-sparkplug is not refused and reaches node; the root refuses with 0 spawns (every node)', { skip }, () => {
    const src = readFileSync(ROOT, 'utf8');
    const m7 = edit1(src, '|*sparkplug*)', ')', 'M7');
    const b = driver('addf-before.mjs');
    const REFUSAL = 'shape-diff: --v8-flags must not set --always-sparkplug: conflicts with script\'s synchronous --no-sparkplug / --no-concurrent-recompilation flags';
    const d = priv('l7');
    try {
        assert.ok(!d.includes('\'') && !NODE.includes('\''), 'wrapper paths hold no single quote');
        const root7 = join(d, 'shape-diff.sh');
        writeFileSync(root7, m7);
        const run = (root, tag) => {
            const wrap = join(d, 'node-' + tag);
            const log = join(d, 'spawns-' + tag + '.log');
            writeFileSync(wrap, WRAP.split('@LOG@').join(log).split('@NODE@').join(NODE));
            chmodSync(wrap, 0o755);
            const r = tool(['--v8-flags', '--always-sparkplug', '--fn', 'mk', b, b], `--v8-flags --always-sparkplug (${tag})`, root, wrap);
            return { r, spawns: spawnLog(log) };
        };
        const base = run(ROOT, 'root');
        assert.equal(base.r.status, 2, 'root: --always-sparkplug refused (rc 2)\n' + base.r.out);
        assert.equal(base.r.out.split('\n').filter((l) => l === REFUSAL).length, 1, 'root: the refusal line exactly once\n' + base.r.out);
        assert.equal(base.spawns.length, 0, 'root: 0 node spawns before the refusal (law 3)');
        const mut = run(root7, 'm7');
        assert.equal(mut.r.out.split('\n').filter((l) => l.includes('must not set --always-sparkplug')).length, 0, 'M7: no refusal line\n' + mut.r.out);
        assert.ok(mut.spawns.length > 0, 'M7: the wrapper node is spawned (spawns > 0)');
        assert.ok(mut.spawns.some((l) => l.split(' ').includes('--always-sparkplug')), 'M7: a node spawn carries --always-sparkplug\n' + mut.spawns.join('\n'));
    } finally { rmSync(d, { recursive: true, force: true }); }
});

test('C1 codes-only tier checkers: synthetic fail-open results throw, good results pass (spawn-free; REVIEW-GL-B1-r1 NIT 3)', () => {
    const R = (status, out) => ({ status, out });
    const DIE = 'shape-diff: --fn must not be empty\nVERDICT NO-VERDICT\n';
    const USAGE = 'shape-diff.sh -- BEFORE vs AFTER V8 shape / elements-kind / field-generalization diff\n\nUsage:\n';
    const NULLC = '  mk: NO-VERDICT -- after: null control: run 2 differs from run 1 (1 record(s) differ, first: run 1 x0 | run 2 x1  GEN  driver.mjs:2  y:s{Any;const}->d{Any;const})\nVERDICT NO-VERDICT\n';
    const WARM = '  mk: NO-VERDICT -- before: compiled (~ or ^) only with 0 attributed map/shape events and 0 optimizing compiles for \'mk\' in run 1 (warm up more until optimizing compile, or function was never called)\nVERDICT NO-VERDICT\n';
    const UE = '  mk: NO-VERDICT -- attributed sites identical (before 0 | after 0), but unattributed/external shape instability differs:\n      before=0 after=1  UNATTR  GEN  user:del  x:s{Any;const}->d{Any;const}\nVERDICT NO-VERDICT\n';
    const same = (r) => sameCode(r, 'C1 SAME', false);
    const differ = (r) => differCode(r, 1, 'C1 DIFF', false);
    const nv = (r) => noVerdictCode(r, ['user:del'], 'C1 NO-VERDICT', false);
    const d2 = (r) => noVerdictCode(r, d2Owners('neverCalledTop'), 'C1 S7 NO-VERDICT', false, false);
    // good results pass
    same(R(0, '  mk: SAME -- identical\nVERDICT SAME\n'));
    same(R(2, WARM));
    differ(R(1, 'VERDICT DIFF\n'));
    differ(R(2, UE));
    differ(R(2, WARM));
    differ(R(2, UE.split('VERDICT NO-VERDICT\n').join('') + WARM.split('mk').join('work')));
    nv(R(2, UE));
    nv(R(1, 'VERDICT DIFF\n'));
    d2(R(2, "  neverCalledTop: NO-VERDICT -- before: no execution evidence for 'neverCalledTop' in run 1 (no such name or never called)\nVERDICT NO-VERDICT\n"));
    d2(R(2, "  neverCalledTop: NO-VERDICT -- after: compiled (~ or ^) only with 0 attributed map/shape events and 0 optimizing compiles for 'neverCalledTop' in run 1 (warm up more until optimizing compile, or function was never called)\nVERDICT NO-VERDICT\n"));
    // fail-open forms throw, each by its named check
    assert.throws(() => differ(R(0, 'VERDICT SAME\n')), /must-differ row accepts \{1, 2\}/, 'exit 0 on a must-differ row');
    assert.throws(() => nv(R(0, 'VERDICT SAME\n')), /NO-VERDICT row accepts \{1, 2\}/, 'exit 0 on a NO-VERDICT row');
    assert.throws(() => same(R(2, DIE)), /exit 2 with a reason other than the warm-up guard/, 'a shape-diff: die on a SAME row');
    assert.throws(() => nv(R(2, DIE)), /a shape-diff: die is not a NO-VERDICT measurement/, 'a shape-diff: die on a NO-VERDICT row');
    assert.throws(() => nv(R(2, 'shape-diff: DRIVER_BEFORE not readable: /tmp/user:del/x.mjs\nVERDICT NO-VERDICT\n')), /a shape-diff: die is not a NO-VERDICT measurement/, 'a shape-diff: die naming the owner on a NO-VERDICT row');
    assert.throws(() => same(R(2, USAGE)), /exit 2 with a reason other than the warm-up guard/, 'a usage exit on a SAME row');
    assert.throws(() => nv(R(2, USAGE)), /usage text is not a NO-VERDICT measurement/, 'a usage exit on a NO-VERDICT row');
    assert.throws(() => same(R(2, WARM.split('VERDICT NO-VERDICT\n').join(''))), /expected exactly one VERDICT NO-VERDICT/, 'missing VERDICT on a warm-up exit 2 SAME row');
    assert.throws(() => sameCode(R(0, ''), 'C1 SAME exact', true), /expected exactly one VERDICT SAME/, 'exact tier: empty output on exit 0 SAME');
    assert.throws(() => differCode(R(1, ''), 1, 'C1 DIFF exact', true), /expected exactly one VERDICT DIFF/, 'exact tier: empty output on exit 1 DIFF');
    assert.throws(() => noVerdictCode(R(2, DIE), ['user:del'], 'C1 NO-VERDICT exact', true), /a shape-diff: die is not a NO-VERDICT measurement/, 'exact tier: a die on a NO-VERDICT row');
    assert.throws(() => noVerdictCode(R(2, USAGE), ['user:del'], 'C1 NO-VERDICT exact', true), /usage text is not a NO-VERDICT measurement/, 'exact tier: a usage exit on a NO-VERDICT row');
    assert.throws(() => noVerdictCode(R(2, UE.split('VERDICT NO-VERDICT\n').join('')), ['user:del'], 'C1 NO-VERDICT exact', true), /expected exactly one VERDICT NO-VERDICT/, 'exact tier: missing VERDICT on a NO-VERDICT row');
    // M13 / FILLERS 71 (b116 C-B3): VERDICT-line checks (any line, exactly one) and the two named teeth
    assert.throws(() => same(R(0, '')), /expected exactly one VERDICT SAME/, 'empty output on exit 0 SAME');
    assert.throws(() => same(R(0, 'VERDICT DIFF\n')), /expected exactly one VERDICT SAME/, 'wrong verdict word on exit 0 SAME');
    assert.throws(() => same(R(0, 'VERDICT SAME\nVERDICT SAME\n')), /expected exactly one VERDICT SAME/, 'two VERDICT lines on exit 0 SAME');
    assert.throws(() => same(R(0, 'VERDICT SAME\nstray\nVERDICT DIFF\n')), /expected exactly one VERDICT SAME/, 'a VERDICT line that is not last-only on SAME');
    assert.throws(() => differ(R(1, '')), /expected exactly one VERDICT DIFF/, 'empty output on exit 1 DIFF');
    assert.throws(() => nv(R(1, '')), /expected exactly one VERDICT DIFF/, 'empty output on exit 1 NO-VERDICT row');
    assert.throws(() => nv(R(2, UE.split('VERDICT NO-VERDICT\n').join(''))), /expected exactly one VERDICT NO-VERDICT/, 'missing VERDICT on exit 2');
    assert.throws(() => nv(R(2, UE + 'VERDICT NO-VERDICT\n')), /expected exactly one VERDICT NO-VERDICT/, 'two VERDICT lines on exit 2');
    assert.throws(() => differ(R(2, UE.split('VERDICT NO-VERDICT\n').join('VERDICT DIFF\n'))), /expected exactly one VERDICT NO-VERDICT/, 'VERDICT DIFF on a must-differ exit 2');
    assert.throws(() => d2(R(1, 'VERDICT DIFF\n')), /strict NO-VERDICT row accepts \{2\} only/, 'S7 A/A rejects exit 1 DIFF');
    // FILLERS 71 (a): the UE-diff line with the run-to-run-noise detail is not a must-differ verdict
    assert.throws(() => differ(R(2, UE.split('\nVERDICT').join('\n    before: unattributed/external instability varied between run 1 and run 2\nVERDICT'))), /UE run-to-run noise/, 'UE varied between run 1 and run N on a must-differ row');
    assert.throws(() => differ(R(2, UE.split('\nVERDICT').join('\n    after: unattributed/external instability varied between run 1 and run 3\nVERDICT'))), /UE run-to-run noise/, 'UE varied (after, run 3) on a must-differ row');
    // F71(b) / CM13: the UE regex start anchor (`^  \S.*`); an unindented or one-space line ending in the UE text is no UE reason
    assert.throws(() => differ(R(2, UE.split('  mk: NO-VERDICT').join('mk: NO-VERDICT'))), /allows only the UE-diff or warm-up reason/, 'CM13: unindented UE-text reason line');
    assert.throws(() => differ(R(2, UE.split('  mk: NO-VERDICT').join(' mk: NO-VERDICT'))), /allows only the UE-diff or warm-up reason/, 'CM13: one-space UE-text reason line');
    assert.throws(() => differ(R(2, "  mk: NO-VERDICT -- before: driver exited 133 in run 1\n" + UE.split('  mk: NO-VERDICT').join('x: NO-VERDICT'))), /allows only the UE-diff or warm-up reason/, 'CM13: a non-UE reason beside an unanchored UE-text line');
    assert.throws(() => same(R(2, NULLC)), /exit 2 with a reason other than the warm-up guard/, 'a null-control reason on a SAME row');
    assert.throws(() => nv(R(2, NULLC)), /NO-VERDICT names none of user:del/, 'a null-control reason on a NO-VERDICT row');
    assert.throws(() => differ(R(2, DIE)), /a shape-diff: die is not a must-differ verdict/, 'a shape-diff: die on a must-differ row');
    assert.throws(() => differ(R(2, USAGE)), /usage text is not a must-differ verdict/, 'a usage exit on a must-differ row');
    assert.throws(() => differ(R(2, UE.split('\nVERDICT NO-VERDICT\n').join('') + DIE)), /a shape-diff: die is not a must-differ verdict/, 'a die glued to stdout\'s last line on a must-differ row');
    assert.throws(() => differ(R(2, 'VERDICT NO-VERDICT\n')), /needs >= 1 <fn>: NO-VERDICT line/, 'an exit 2 with no per-fn line on a must-differ row');
    // Q-B107-DIFF3 (a): each judge_side reason that is not a measurement (shape-diff.sh judge_side), one row each
    for (const [form, why] of [
        ['driver exited', 'before: driver exited 133 in run 1'],
        ['unreadable shape trace', 'after: unreadable shape trace in run 2: map line 7'],
        ['elements kind unknown', "after: elements kind unknown for a Transition in 'mk' (no map-details line) in run 1"],
        ['null control', 'after: null control: run 2 differs from run 1 (1 record(s) differ, first: run 1 x0 | run 2 x1  GEN  driver.mjs:2  y:s{Any;const}->d{Any;const})'],
        ['no execution evidence', "before: no execution evidence for 'mk' in run 1 (no such name or never called)"],
    ]) {
        assert.throws(() => differ(R(2, '  mk: NO-VERDICT -- ' + why + '\nVERDICT NO-VERDICT\n')), /allows only the UE-diff or warm-up reason/, `a ${form} exit 2 on a must-differ row`);
        assert.throws(() => differ(R(2, UE + '  work: NO-VERDICT -- ' + why + '\nVERDICT NO-VERDICT\n')), /allows only the UE-diff or warm-up reason/, `a ${form} line beside a UE line on a must-differ row`);
    }
    assert.throws(() => d2(R(2, NULLC.split('mk:').join('neverCalledTop:'))), /NO-VERDICT names none of neverCalledTop: NO-VERDICT -- before: no execution evidence/, 'an S7 fn null-control reason on the S7 row');
    assert.throws(() => same(R(2, WARM + DIE)), /exit 2 not from the warm-up guard/, 'a die beside a warm-up reason on a SAME row');
    assert.throws(() => same(R(2, WARM + '  work: DIFF -- shape-instability multiset differs\n')), /a DIFF hidden under a warm-up exit 2/, 'a DIFF hidden under a warm-up exit 2');
    for (const st of [null, 3, 133]) {
        assert.throws(() => same(R(st, '')), /SAME row accepts \{0\} or \{2 warm-up only\}/, `SAME row rejects exit ${st}`);
        assert.throws(() => differ(R(st, '')), /must-differ row accepts \{1, 2\}/, `must-differ row rejects exit ${st}`);
        assert.throws(() => nv(R(st, '')), /NO-VERDICT row accepts \{1, 2\}/, `NO-VERDICT row rejects exit ${st}`);
    }
});
