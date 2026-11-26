// test/shape-diff-audit-live.test.mjs -- ../shape-diff.sh on REAL node spawns: the 1.2.0 audit-fix live fixtures
// (b116 E-B4; SPEC-1.2.0 section 0 CURRENT C-21, C-23 (A31), C-27 (M8), C-29, C-30 (live fixtures, P4d per Q-B115-P4D);
// PLAN-FIX-E TASK 6 + ASSERTIONS A2 / A3).
// ORACLE: the verdicts the SPEC and PLAN-FIX-E A2 / A3 state, never a fresh run of the tool. Every driver is a string
// constant below, written into one private mktemp dir at test time (no fixture files in the repo); each is the byte text
// of its evidence copy (.handoff/b110/evidence/probe-m4/drivers, probe-m8/drivers, .handoff/b116/xsig-src).
// Rows (each also checks exactly one `^VERDICT ` line):
//   A2   M1 class-per-call -> rc 2 `UNATTR  MAP_REPLACE  user:h`; M2b pair 2 -> rc 1 DIFF `RECONF  a: kData, attrs: [W_C]`;
//        M3 swap -> rc 2 `ambiguous target function 'hot' defined at >1 location in run 1` (A31: the swap A/A is NO-VERDICT);
//        M4 tier pair -> rc 2 `tier-up differs` (the row first checks the after side reaches an optimized frame, else it
//        SKIPS with the reason, never passes); M8 .ts A/A -> rc 0 SAME.
//   A2c  the same five pairs on the pre-audit root (git show 1aafd17:shape-diff.sh): M1 / M2b / M3 SAME rc 0, M4 DIFF rc 1,
//        M8 rc 2 NO-VERDICT (X: the .ts empty marker is unreadable there). A must-differ control: a row that ignores the root
//        goes red because new != old on every one of the five.
//   PL   path-length A/A (dir `a` vs 30 x `b`): PL-b, PL-t-a, PL-t-b, PL-pre-a, PL-pre-b -> SAME rc 0.
//   F    S1 SAME, X1 SAME, X2cls DIFF (rc 1), MM-b-sc (b.mjs A/A, --v8-flags --stress-compaction) SAME.
//   Fc   control on the pre-E-B5 root (git show 2893b00:shape-diff.sh): S1 DIFF rc 1 and X1 NO-VERDICT rc 2 (the F1 false
//        verdicts, .handoff/b113/xsig/RUNS.txt); MM-b-sc NO-VERDICT rc 2 (unknown event map-move, the F2 gap).
// History pins (audit-g0.test.mjs form): `git show <sha>:shape-diff.sh` into the mktemp. Locally an unreachable pin SKIPS
// with the reason; CI_STRICT (process.env.CI === 'true') makes it a FAILURE.
// OUT OF SCOPE, record only (no row): P3, P4d, PL-P6. Their drivers import ~155-220 KB LiteSignal Signal.js / Watch.js
// copies (.handoff/b116/xsig-src/pairs/P*); vendoring those into the repo is the maintainer's decision.
// TIER: strict rc + text on node majors 24 and 26 (the evidence nodes; A2 pairs also v27 alpha); other majors SKIP each
// row with that reason (never a pass without a measurement).
// Spawns: capSync only, 300000 ms per tool run, 60000 ms per git call (nominal; the timeout is named first). cwd and TMPDIR
// are private mktemp dirs, removed after. Child env drops NODE, NODE_OPTIONS, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS
// and the editor variables; NODE_V8_COVERAGE = undefined (node re-adds a deleted key). The quiet lock is never read here.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const ROOT = join(REPO, 'shape-diff.sh');
const NODE = process.execPath;
const MAJOR = Number(process.versions.node.split('.')[0]);
const TOOL_CAP = 300000;
const GIT_CAP = 60000;
const CI_STRICT = process.env.CI === 'true';
const OLD_A2 = '1aafd17';     // pre-audit root (A2 "before" column)
const OLD_F = '2893b00';      // pre-E-B5 root (F1 / F2 control)
const isPosix = process.platform !== 'win32';
const rowSkip = (majors) => (!isPosix ? 'bash script: POSIX hosts only'
    : majors.includes(MAJOR) ? false : `live audit rows are measured on node ${majors.join(' / ')} only (this is ${process.version})`);
const SKIP_A2 = rowSkip([24, 26, 27]);
const SKIP_F = rowSkip([24, 26]);

const ENV = { ...process.env };
for (const k of ['NODE', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL']) delete ENV[k];
ENV.NODE_V8_COVERAGE = undefined;   // not a delete: node's child_process re-inserts a missing NODE_V8_COVERAGE key

// ---- drivers (string constants; byte text of the evidence copies) --------------------------------------------------
const DRV = {};
// M4 / M2b / M3 / A-A drivers: .handoff/b116/xsig-src/m4/ (= b110 probe-m4 drivers)
DRV['b.mjs'] = 'function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }\nlet s = 0; for (let i = 0; i < 3000; i++) s += mk(i);\n';
DRV['t-a.mjs'] = 'const src = "[1,2,3]";\nfunction mk(i) {\n  let t = 0; for (let k = 0; k < 400; k++) t += k & 1;\n  const a = JSON.parse(src);\n  a[0] = 1.5;\n  return a[0] + t;\n}\nlet s = 0; for (let i = 0; i < 300; i++) s += mk(i);\n';
DRV['t-b.mjs'] = 'const src = "[1,2,3]";\nfunction mk(i) {\n  let t = 0;\n  const a = JSON.parse(src);\n  a[0] = 1.5;\n  return a[0] + t;\n}\nlet s = 0; for (let i = 0; i < 300; i++) s += mk(i);\n';
const PRE = 'function shape() { const o = { a: 1, b: 2 }; o.a = 2; return o; }\nfunction warm() { const o = shape(); Object.defineProperty(o, "a", { enumerable: false }); return o; }\nwarm(); warm();\n';
const PRE_LOOP = 'let s = 0; for (let i = 0; i < 20000; i++) s += mk(i).a;\n';
DRV['pre-a.mjs'] = PRE + 'function mk(i) { const o = shape(); Object.defineProperty(o, "a", { enumerable: false }); return o; }\n' + PRE_LOOP;
DRV['pre-b.mjs'] = PRE + 'function mk(i) { const o = shape(); return o; }\n' + PRE_LOOP;
DRV['modA-dirty.mjs'] = 'export function hot(i) { const o = { a: i, b: 2 }; if (i === 50) delete o.b; return o.a; }\n';
DRV['modA-clean.mjs'] = 'export function hot(i) { const o = { a: i, b: 2 }; return o.a + o.b; }\n';
DRV['modB-clean.mjs'] = 'export function hot(i) { const o = { x: i, y: 2 }; return o.x + o.y; }\n';
DRV['modB-dirty.mjs'] = 'export function hot(i) { const o = { x: i, y: 2 }; if (i === 50) delete o.y; return o.x; }\n';
DRV['ambig-before.mjs'] = "import { hot as h1 } from './modA-dirty.mjs';\nimport { hot as h2 } from './modB-clean.mjs';\nlet s = 0; for (let i = 0; i < 3000; i++) s += h1(i) + h2(i);\nif (s === -1) console.log(s);\n";
DRV['ambig-after.mjs'] = "import { hot as h1 } from './modA-clean.mjs';\nimport { hot as h2 } from './modB-dirty.mjs';\nlet s = 0; for (let i = 0; i < 3000; i++) s += h1(i) + h2(i);\nif (s === -1) console.log(s);\n";
// M8: .handoff/b110/evidence/probe-m8/drivers/d.ts
DRV['d.ts'] = 'function mk(i: number) { const o: { a: number, c?: number } = { a: 1 }; o.c = i; return o; }\nlet s = 0; for (let i = 0; i < 20000; i++) s += mk(i).c!;\n';
// M1 class-per-call (no durable copy of the b110 driver exists; written here): mk is byte-identical on both sides, the AFTER
// side additionally calls h() 3000 times from the top level, and every h() call evaluates a class definition (one MapCreate
// ReplaceDescriptors line per call, >= 2 hits at one source site: kept by C-21 / Q-B113-F1). h is not the target.
const M1_BODY = (run) => 'function mk(i) { return { a: i, b: 2 }; }\n' +
    'function h(i) { class C { constructor(v) { this.v = v; } } return new C(i).v; }\n' +
    'const RUN_H = ' + run + ';\nlet s = 0;\nfor (let i = 0; i < 3000; i++) { s += mk(i).a; if (RUN_H) s += h(i); }\nif (s === -1) console.log(s);\n';
DRV['m1-b.mjs'] = M1_BODY('false');
DRV['m1-a.mjs'] = M1_BODY('true');
// F1 / F2 drivers: .handoff/b116/xsig-src/pairs/S1-mapcreate, x1, x2
const PROPS = (p, n, v) => Array.from({ length: n }, (_, k) => p + k + ': ' + v).join(', ');
const S1_BODY = (run) => '// S1 synthetic (b112): mk is byte-identical on both sides; only the AFTER side calls an unrelated helper once first.\n' +
    'function helper() { return { ' + PROPS('h', 18, '0') + ',  }; }\n' +
    'function mk(i) { return { ' + PROPS('a', 18, 'i') + ',  }; }\n' +
    'const RUN_HELPER = ' + run + ';' + (run === 'true' ? ' ' : '') + '\nlet s = 0;\nif (RUN_HELPER) s += helper().h0;\n' +
    'for (let i = 0; i < 20000; i++) s += mk(i).a17;\nif (s === -1) console.log(s);\n';
DRV['s1-b.mjs'] = S1_BODY('false');
DRV['s1-a.mjs'] = S1_BODY('true');
const X1_BODY = (n) => '// X1 (b113 X-SIG): mk byte-identical; only the literal SIZE in unrelated other() differs (before 2 props, after 41).\n' +
    'function other() { return { ' + PROPS('p', n, '0') + ' }; }\n' +
    'function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }\nlet s = other().p0; for (let i = 0; i < 3000; i++) s += mk(i);\nif (s === -1) console.log(s);\n';
DRV['x1-b.mjs'] = X1_BODY(2);
DRV['x1-a.mjs'] = X1_BODY(41);
DRV['x2-a.mjs'] = 'function h(i) { class C { constructor(v) { this.v = v; } } return new C(i); }\nfunction mk(i) { return h(i).v + 1; }\nlet s = 0; for (let i = 0; i < 3000; i++) s += mk(i);\nif (s === -1) console.log(s);\n';
DRV['x2-b.mjs'] = 'class C { constructor(v) { this.v = v; } }\nfunction h(i) { return new C(i); }\nfunction mk(i) { return h(i).v + 1; }\nlet s = 0; for (let i = 0; i < 3000; i++) s += mk(i);\nif (s === -1) console.log(s);\n';

// sha256 of each evidence copy (.handoff/b116/xsig-src/SHA256SUMS; d.ts: probe-m8/drivers/MANIFEST.sha256): a drifted
// constant is a red row. m1-a / m1-b have no durable copy (written here), so they carry no pin.
const DRV_SHA = {
    'b.mjs': '7ea5242baf027b698f2922a6bfa0051dcc3c54474c53240a635d6f84adb937eb',
    't-a.mjs': 'd485f2544d85cb6325c2704215499fd355e737df08cf5bcbdd136c6d24a221db',
    't-b.mjs': 'ce02841c697df127069578f66c0f51bbdd737b659a5da856b0165a6cd500bb93',
    'pre-a.mjs': '6555186da827f31c480060df10de8fa9fc1128ebf3119054ca59c79e0912c4a9',
    'pre-b.mjs': '95424c62d3143a51ca594679a189d67f5531a840edbc1ae499a4d3de88c99d5a',
    'modA-clean.mjs': '8f4f420db36877caaed9ec7c8b6ae5c728452dea23312e41ebee5d3a49efa338',
    'modA-dirty.mjs': '4f5794219e1fd9c442834abad7540bac45e65b57856a07405a24ef416c8a37a5',
    'modB-clean.mjs': '21e7262f69e723898e2c5d8b26b6dce1fb6acde56c9bff51b4058567c92db0c4',
    'modB-dirty.mjs': '7d1e6b2b34406ef98d128d7571323ecc3f0bff04935b1aba1104b134142520b9',
    'ambig-before.mjs': 'ac324706ae887e60b62313056001adc64950bc5e89c5b6e978fe969639938175',
    'ambig-after.mjs': '5af3cc5430bc8c559ec262c63384b5b1e40cf88548a0bf950977797ce278b3c2',
    'd.ts': '3c8799c19d0d19fb3f3b1efe1c4d5cd05c968ff49df5313d9b29266ae3892de0',
    's1-b.mjs': '664ed4ef6b851784f0e4442eb1493b3403fc701546375f84db5f2c7ea15703ab',
    's1-a.mjs': '4fb9d0a88dcea915213a6e59713e0d20704c71b9a5087970a08f5dedede82e78',
    'x1-b.mjs': 'e4e6edbe7555a0665dafd5492b95e04132b9abe711b548a122dbb6b7f333eac4',
    'x1-a.mjs': 'b5a04745a31233823f47b3f04653c36c86b6fced9457d8e7f45a8aa9cff90901',
    'x2-a.mjs': '04324179834503b8f98a7fc34210f77595e782e9decb27ce67245d452adfc1f9',
    'x2-b.mjs': 'bc84d984bb0af0949e414d7bbbb9a30ae23608151e41653d55af4c0be6b269f6',
};
test('drivers: every pinned driver constant equals its evidence copy (sha256)', () => {
    for (const [name, want] of Object.entries(DRV_SHA)) {
        assert.equal(createHash('sha256').update(DRV[name]).digest('hex'), want, `driver drift: ${name}`);
    }
});

// ---- one private mktemp dir for the whole file ---------------------------------------------------------------------
const D = mkdtempSync(join(tmpdir(), 'b116-EB4-'));
after(() => { rmSync(D, { recursive: true, force: true }); });
mkdirSync(join(D, 'drv'));
for (const [name, text] of Object.entries(DRV)) writeFileSync(join(D, 'drv', name), text);
const drv = (name) => join(D, 'drv', name);
// path-length A/A trees: dir `a` vs 30 x `b`, one x.mjs per driver (xsig-src/pl: b, t-a, t-b, pre-a, pre-b)
const PL_SHORT = 'a';
const PL_LONG = 'b'.repeat(30);
const PL = { b: 'b.mjs', 't-a': 't-a.mjs', 't-b': 't-b.mjs', 'pre-a': 'pre-a.mjs', 'pre-b': 'pre-b.mjs' };
for (const side of [PL_SHORT, PL_LONG]) {
    for (const [d, src] of Object.entries(PL)) {
        mkdirSync(join(D, 'pl', side, d), { recursive: true });
        writeFileSync(join(D, 'pl', side, d, 'x.mjs'), DRV[src]);
    }
}
const plPath = (side, d) => join(D, 'pl', side, d, 'x.mjs');

// ---- history pins ---------------------------------------------------------------------------------------------------
const histRoots = {};
function histRoot(sha) {
    if (sha in histRoots) return histRoots[sha];
    const cat = capSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: REPO, env: ENV }, GIT_CAP, `git cat-file ${sha}`);
    let res;
    if (cat.status !== 0) res = { why: `commit ${sha} not available (shallow clone?)` };
    else {
        const g = capSync('git', ['show', `${sha}:shape-diff.sh`], { cwd: REPO, env: ENV, maxBuffer: 1 << 26 }, GIT_CAP, `git show ${sha}:shape-diff.sh`);
        if (g.status !== 0) res = { why: `git show ${sha}:shape-diff.sh failed: ${g.stderr}` };
        else { const p = join(D, `shape-diff.${sha}.sh`); writeFileSync(p, g.stdout); res = { path: p }; }
    }
    histRoots[sha] = res;
    return res;
}
// a pin row: unreachable commit -> CI_STRICT fails, local skips with the reason
function pinRoot(t, sha) {
    const h = histRoot(sha);
    if (h.path) return h.path;
    if (CI_STRICT) assert.fail(`${h.why} (CI=true: a history pin fails, never skips)`);
    t.skip(h.why);
    return null;
}

// ---- tool runs -----------------------------------------------------------------------------------------------------
function priv(tag) { return mkdtempSync(join(tmpdir(), `sdal-${tag}-`)); }
// One tool run: private cwd + TMPDIR; returns { status, out (stdout + stderr), outdir }.
function tool(root, args, what, { runs = 5, outDir = null } = {}) {
    const cwd = priv('cwd');
    const tmp = priv('tmp');
    try {
        const extra = outDir ? ['--out', outDir] : [];
        const r = capSync('bash', [root, '--node', NODE, '--runs', String(runs), ...extra, ...args],
            { encoding: 'utf8', cwd, env: { ...ENV, TMPDIR: tmp }, maxBuffer: 64 * 1024 * 1024 }, TOOL_CAP, `shape-diff.sh ${what} (live)`);
        return { status: r.status, out: r.stdout + r.stderr };
    } finally {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(tmp, { recursive: true, force: true });
    }
}
function verdictOf(r) {
    const v = r.out.split('\n').filter((l) => l.startsWith('VERDICT '));
    assert.equal(v.length, 1, `exactly one ^VERDICT line, got ${v.length}\n${r.out}`);
    return v[0].slice('VERDICT '.length);
}
// check(r, label, { rc, verdict, has: [...], not: [...] }); a die ("shape-diff: " prefix) is never a verdict
function check(r, label, { rc, verdict, has = [], not = [] }) {
    assert.equal(r.status, rc, `${label}: exit ${rc}\n${r.out}`);
    assert.equal(verdictOf(r), verdict, `${label}: VERDICT ${verdict}\n${r.out}`);
    assert.ok(!r.out.split('\n').some((l) => l.startsWith('shape-diff: ')), `${label}: no shape-diff: die line\n${r.out}`);
    for (const s of has) assert.ok(r.out.includes(s), `${label}: missing [${s}]\n${r.out}`);
    for (const s of not) assert.ok(!r.out.includes(s), `${label}: unexpected [${s}]\n${r.out}`);
}
const SAME = { rc: 0, verdict: 'SAME' };

// ---- A2 pairs: the NEW root (HEAD) ---------------------------------------------------------------------------------
test(`A2 M1 class-per-call (h evaluates a class per call, non-target): rc 2, UNATTR  MAP_REPLACE  user:h (node ${process.version})`, { skip: SKIP_A2 }, () => {
    const r = tool(ROOT, ['--fn', 'mk', drv('m1-b.mjs'), drv('m1-a.mjs')], '--fn mk M1 class-per-call', { runs: 3 });
    check(r, 'M1 class-per-call', { rc: 2, verdict: 'NO-VERDICT', has: ['UNATTR  MAP_REPLACE  user:h'] });
});

test(`A2 M2b pair 2 (defineProperty enumerable:false, before 1 | after 0): rc 1 DIFF, RECONF  a: kData, attrs: [W_C] (node ${process.version})`, { skip: SKIP_A2 }, () => {
    const r = tool(ROOT, ['--fn', 'mk', drv('pre-a.mjs'), drv('pre-b.mjs')], '--fn mk M2b pre-a vs pre-b', { runs: 3 });
    check(r, 'M2b pair 2', { rc: 1, verdict: 'DIFF', has: ['RECONF  a: kData, attrs: [W_C]'] });
});

test(`A2 M3 swap (hot defined in two modules): rc 2, ambiguous target function 'hot' defined at >1 location in run 1 (A31: the swap A/A is NO-VERDICT) (node ${process.version})`, { skip: SKIP_A2 }, () => {
    const r = tool(ROOT, ['--fn', 'hot', drv('ambig-before.mjs'), drv('ambig-after.mjs')], '--fn hot M3 swap');
    check(r, 'M3 swap', { rc: 2, verdict: 'NO-VERDICT', has: ["ambiguous target function 'hot' defined at >1 location in run 1"] });
});

test(`A2 M4 tier pair (t-b vs t-a): rc 2, tier-up differs, once the after side reaches an optimized frame (node ${process.version})`, { skip: SKIP_A2 }, (t) => {
    const od = join(D, 'out-m4-tier');
    const r = tool(ROOT, ['--fn', 'mk', drv('t-b.mjs'), drv('t-a.mjs')], '--fn mk M4 tier t-b vs t-a', { runs: 3, outDir: od });
    // precondition: the after side logged an elements transition inside an OPTIMIZED mk frame in some run. V8 frame markers:
    // `~` interpreted, `^` baseline, `+` Maglev, `*` TurboFan, an optional `'` after it = OSR (e.g. `in +'mk+0`); `~mk+59`
    // is the interpreted frame and does not count.
    verdictOf(r);
    assert.ok(!r.out.split('\n').some((l) => l.startsWith('shape-diff: ')), `M4 tier pair: no shape-diff: die line\n${r.out}`);
    let opt = 0;
    for (let k = 1; k <= 3; k++) {
        const txt = readFileSync(join(od, 'raw', 'after', `run.${k}.out`), 'latin1');
        opt += txt.split('\n').filter((l) => /^elements transition .* in (new )?o?[*+]'?mk\+[0-9]+ at /.test(l)).length;
    }
    if (opt === 0) { t.skip(`tier-up precondition: the after side logged no optimized-frame (in [*+]mk+N) transition on ${process.version}`); return; }
    check(r, 'M4 tier pair', { rc: 2, verdict: 'NO-VERDICT', has: ['tier-up differs'] });
});

test(`A2 M8 .ts A/A (d.ts vs d.ts): rc 0 SAME (node ${process.version})`, { skip: SKIP_A2 }, () => {
    const r = tool(ROOT, ['--fn', 'mk', drv('d.ts'), drv('d.ts')], '--fn mk M8 .ts A/A');
    check(r, 'M8 .ts A/A', SAME);
});

// ---- A2 controls: the pre-audit root 1aafd17 (the "before" column) -------------------------------------------------
test(`A2 controls on ${OLD_A2}: M1 SAME, M2b SAME, M3 SAME, M4 DIFF rc 1, M8 rc 2 NO-VERDICT (node ${process.version})`, { skip: SKIP_A2 }, (t) => {
    const old = pinRoot(t, OLD_A2);
    if (!old) return;
    check(tool(old, ['--fn', 'mk', drv('m1-b.mjs'), drv('m1-a.mjs')], 'old M1', { runs: 3 }), `${OLD_A2} M1`, { ...SAME, not: ['UNATTR  MAP_REPLACE  user:h'] });
    check(tool(old, ['--fn', 'mk', drv('pre-a.mjs'), drv('pre-b.mjs')], 'old M2b', { runs: 3 }), `${OLD_A2} M2b`, { ...SAME, not: ['RECONF  a: kData'] });
    check(tool(old, ['--fn', 'hot', drv('ambig-before.mjs'), drv('ambig-after.mjs')], 'old M3'), `${OLD_A2} M3`, { ...SAME, not: ['ambiguous target function'] });
    check(tool(old, ['--fn', 'mk', drv('t-b.mjs'), drv('t-a.mjs')], 'old M4 tier', { runs: 3 }), `${OLD_A2} M4 tier`, { rc: 1, verdict: 'DIFF', not: ['tier-up differs'] });
    // M8 (X): the .ts empty marker is not readable on the old root -> an unreadable-trace NO-VERDICT, rc 2 (no die)
    check(tool(old, ['--fn', 'mk', drv('d.ts'), drv('d.ts')], 'old M8 .ts A/A'), `${OLD_A2} M8 .ts`, { rc: 2, verdict: 'NO-VERDICT' });
});

// ---- path-length A/A (SPEC A37: the X-SIG path-length A/A control, no finding; PLAN-FIX-E A3 A/A rule): dir `a` vs 30 x `b` -> SAME --------------------------------
for (const d of Object.keys(PL)) {
    test(`PL-${d} path-length A/A (.../a/${d}/x.mjs vs .../${PL_LONG}/${d}/x.mjs): rc 0 SAME (node ${process.version})`, { skip: SKIP_F }, () => {
        const r = tool(ROOT, ['--fn', 'mk', plPath(PL_SHORT, d), plPath(PL_LONG, d)], `--fn mk PL-${d}`);
        check(r, `PL-${d}`, SAME);
    });
}

// ---- F1 / F2 live (C-30; P3 / P4d / PL-P6 out of scope, see the header) -------------------------------------------
test(`F1 S1 (helper called once on the after side only; mk byte-identical): SAME (node ${process.version})`, { skip: SKIP_F }, () => {
    check(tool(ROOT, ['--fn', 'mk', drv('s1-b.mjs'), drv('s1-a.mjs')], 'S1'), 'S1', SAME);
});

test(`F1 X1 (literal size in unrelated other() differs; mk byte-identical): SAME (node ${process.version})`, { skip: SKIP_F }, () => {
    check(tool(ROOT, ['--fn', 'mk', drv('x1-b.mjs'), drv('x1-a.mjs')], 'X1'), 'X1', SAME);
});

test(`F1 X2cls (class per call vs top-level class, target mk): DIFF rc 1 (node ${process.version})`, { skip: SKIP_F }, () => {
    const r = tool(ROOT, ['--fn', 'mk', drv('x2-b.mjs'), drv('x2-a.mjs')], 'X2cls', { runs: 3 });
    check(r, 'X2cls', { rc: 1, verdict: 'DIFF' });
});

test(`F2 MM-b-sc (b.mjs A/A, --v8-flags --stress-compaction): SAME, map-move is read (node ${process.version})`, { skip: SKIP_F }, () => {
    const r = tool(ROOT, ['--v8-flags', '--stress-compaction', '--fn', 'mk', drv('b.mjs'), drv('b.mjs')], 'MM-b-sc');
    check(r, 'MM-b-sc', { ...SAME, not: ['unknown event map-move'] });
});

// ---- F controls: the pre-E-B5 root 2893b00 -------------------------------------------------------------------------
test(`Fc controls on ${OLD_F}: S1 DIFF rc 1 and X1 NO-VERDICT rc 2 (the F1 false verdicts); MM-b-sc NO-VERDICT rc 2, unknown event map-move (node ${process.version})`, { skip: SKIP_F }, (t) => {
    const old = pinRoot(t, OLD_F);
    if (!old) return;
    check(tool(old, ['--fn', 'mk', drv('s1-b.mjs'), drv('s1-a.mjs')], 'old S1', { runs: 3 }), `${OLD_F} S1`, { rc: 1, verdict: 'DIFF' });
    check(tool(old, ['--fn', 'mk', drv('x1-b.mjs'), drv('x1-a.mjs')], 'old X1', { runs: 3 }), `${OLD_F} X1`, { rc: 2, verdict: 'NO-VERDICT', has: ['unattributed/external shape instability differs'] });
    check(tool(old, ['--v8-flags', '--stress-compaction', '--fn', 'mk', drv('b.mjs'), drv('b.mjs')], 'old MM-b-sc', { runs: 3 }), `${OLD_F} MM-b-sc`, { rc: 2, verdict: 'NO-VERDICT', has: ['unknown event map-move'] });
});
