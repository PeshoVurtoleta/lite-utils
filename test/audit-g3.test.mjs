// test/audit-g3.test.mjs -- b63 lane g3, helper H: the allocation-diff.sh rows of .handoff/lanes/g3/PLAN-b63-g3.md ASSERTIONS
// A1-A10 (ADDENDUM A4: tool selected by AD_G3_ROOT, no in-test git history; ADDENDUM A5: the mutant twin of A1 is the coder's,
// in test/allocation-diff.test.mjs). Oracle: the PLAN text (refusal die texts of TASK 1 / TASK 4, NO-VERDICT shapes, exit
// codes, -h phrases, self-test count 85, the heredoc +1 line), never what a root printed. Tool under test: the repo-root
// allocation-diff.sh, or the file named by AD_G3_ROOT (an absolute path; e.g. the frozen build
// .handoff/frozen/b63-g3/allocation-diff.sh, sha256/8 e0b55101). Every behaviour row (A1 A4 A5 A6 A7 A8 A10) must FAIL on
// that frozen build; the controls (A2 A3 A9) must pass on it.
//   A1  D-LIT --zero --runs 3: exit 1 or 2, no VERDICT ZERO, run 1 young >= 1, head ends with the pretenuring pin
//   A2  D-F64 --zero --runs 3: exit 0 VERDICT ZERO, or the accepted guard NO-VERDICT exit 2 ('trace lost 1 GC line', Q-B98-L2TWINS (a)); young 0 in every run, old 0 (control);
//       run with --out under mk(): one BASEDIAG t.diagnostic per invocation (Q-B100-BASEDIAG (a)), canned-pinned on the 45133611956 dump
//   A3  retention: 3 invocations, TMPDIR a fresh dir: 0 entries left; the driver dir holds only driver.js (control)
//   A4  --v8-flags refusals (pretenuring x3 spellings, stress-concurrent-inlining x3): exit 2, exactly one die line, 0 spawns
//   A5  --node <d>/a=b/node: exit 2, the R26 die text, 0 spawns
//   A6  a grep shim that exits 2 on -c, first on PATH, D-YOUNG --zero --runs 2: exit 1 NONZERO, old 0 in the window
//   A7  darwin only: the same with GREP_OPTIONS=-P and the real grep
//   A8  D-WORKER --zero --runs 2: exit 2, NO-VERDICT "the guard did not count", never "@@LITE-MARK gcn"
//   A9  D-FORK --zero --runs 2: exit 2, "@@LITE-MARK gcn given twice" (control)
//   A10 the gcn heredoc = the old 1989-byte heredoc + one line before `const v8`; -h phrases; --self-test 85 ok
// Drivers are inlined (.handoff/ and audit/ are gitignored and absent on CI). Fixtures: private dirs under one mkdtemp top
// (removed in after()). Every child is capSync'd. No timing assertions. Counts (GC events) only: DETERMINISTIC tier.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = fileURLToPath(import.meta.url);
const PKG = join(dirname(HERE), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const TOOL = process.env.AD_G3_ROOT || join(PKG, 'allocation-diff.sh');
const NODE_REAL = process.execPath;

// the B0 driver texts, inlined byte-exactly
const D_LIT = [
    "'use strict';",
    "const fs = require('fs');",
    'function make(i) { return { a: i, b: i + 1, c: null }; }',
    'const keep = [];',
    'for (let i = 0; i < 50000; i++) keep.push(make(i));',
    'const ring = new Array(1024).fill(null);',
    'let rk = 0;',
    'function hot(n) {',
    '  for (let i = 0; i < n; i++) {',
    '    const o = make(i);',
    '    if ((i & 1023) === 0) { ring[rk] = o; rk = (rk + 1) & 1023; }',
    '  }',
    '}',
    'hot(20000);',
    'hot(20000);',
    "fs.writeSync(1, '@@LITE-MARK start\\n');",
    'hot(400000);',
    "fs.writeSync(1, '@@LITE-MARK end\\n');",
    'globalThis.sink = keep.length + ring.length;',
    '',
].join('\n');
const D_F64 = [
    "'use strict';",
    "const fs = require('fs');",
    'function make(i) { return { a: i, b: i + 1, c: null }; }',
    'const keep = [];',
    'for (let i = 0; i < 50000; i++) keep.push(make(i));',
    'const f64 = new Float64Array(1024);',
    'function fill(n) {',
    '  for (let i = 0; i < n; i++) f64[i & 1023] = i * 0.5;',
    '}',
    'for (let k = 0; k < 10; k++) fill(100000);',
    "fs.writeSync(1, '@@LITE-MARK start\\n');",
    'fill(4000000);',
    "fs.writeSync(1, '@@LITE-MARK end\\n');",
    'globalThis.sink = keep.length + f64[7];',
    '',
].join('\n');
const D_YOUNG = [
    "const fs = require('fs');",
    'const keep = new Array(1024);',
    'function hot(i) { return { a: i, b: i + 1 }; }',
    'for (let i = 0; i < 20000; i++) keep[i & 1023] = hot(i);',
    "fs.writeSync(1, '@@LITE-MARK start\\n');",
    'for (let i = 0; i < 300000; i++) keep[i & 1023] = hot(i);',
    "fs.writeSync(1, '@@LITE-MARK end\\n');",
    '',
].join('\n');
const D_WORKER = [
    "'use strict';",
    "const fs = require('fs');",
    "const { Worker } = require('worker_threads');",
    "fs.writeSync(1, '@@LITE-MARK start\\n');",
    'const w = new Worker(',
    "  'const ring = new Array(1024).fill(null);\\n' +",
    "  'for (let i = 0; i < 400000; i++) ring[i & 1023] = { a: i, b: i + 1 };\\n' +",
    "  'globalThis.sink = ring;\\n',",
    '  { eval: true });',
    "w.on('exit', () => { fs.writeSync(1, '@@LITE-MARK end\\n'); });",
    '',
].join('\n');
const D_FORK = [
    "'use strict';",
    "const fs = require('fs');",
    "if (process.argv[2] !== 'child') {",
    "  fs.writeSync(1, '@@LITE-MARK start\\n');",
    "  fs.writeSync(1, '@@LITE-MARK end\\n');",
    "  require('child_process').fork(__filename, ['child'], { stdio: 'inherit' });",
    '}',
    '',
].join('\n');

// the OLD gcn heredoc (7c91d1c, 1989 bytes, sha256 279a5f87...), inlined; A10 re-checks its sha256 before using it
const OLD_GCN_LINES = [
    "'use strict';",
    "// allocation-diff.sh guard preload (TASK 0d = 0c's gcn-id.cjs + the A6 exit fence). Counts the run's GCs",
    "// with v8.GCProfiler; its 'exit' listener is registered here, before any driver listener, and on exit:",
    "// (1) fence: 2^17 {a,b} into a 1024-slot ring (> 2 semi-spaces of 1 MB -> >= 1 young GC after `end`);",
    "// (2) writes `@@LITE-MARK gcn` to fd 1; (3) reads the count; (4) writes it to fd 3. GCs caused by the read",
    "// or by later 'exit' listeners land after gcn. The first 'beforeExit' starts a 2nd profiler and stops the",
    "// 1st (its statistics array is the big allocation) with one more loop turn, so the GCs that causes are",
    "// counted. Counted gcTypes: Scavenge, MinorMarkSweep, MarkSweepCompact (IncrementalMarking prints no",
    "// --trace-gc line; an unknown type is not counted, so the count reads low and the judge fails closed).",
    "const v8 = require('v8');",
    "const fs = require('fs');",
    "const gcnBuf = Buffer.alloc(24);",
    "let gcnP = new v8.GCProfiler();",
    "let gcnQ = null;",
    "let gcnN = 0;",
    "gcnP.start();",
    "function gcnCount(st) {",
    "  let n = 0;",
    "  for (let i = 0; i < st.length; i++) {",
    "    const t = st[i].gcType;",
    "    if (t === 'Scavenge' || t === 'MinorMarkSweep' || t === 'MarkSweepCompact') n++;",
    "  }",
    "  return n;",
    "}",
    "function gcnNoop() {}",
    "process.on('beforeExit', () => {",
    "  if (gcnQ !== null) return;",
    "  gcnQ = new v8.GCProfiler();",
    "  gcnQ.start();",
    "  gcnN = gcnCount(gcnP.stop().statistics);",
    "  gcnP = null;",
    "  setImmediate(gcnNoop);",
    "});",
    "process.on('exit', () => {",
    "  const ring = new Array(1024).fill(null);",
    "  for (let i = 0; i < 131072; i++) ring[i & 1023] = { a: i, b: i };",
    "  fs.writeSync(1, '@@LITE-MARK gcn\\n');",
    "  let n = gcnN;",
    "  if (gcnP !== null) n += gcnCount(gcnP.stop().statistics);",
    "  if (gcnQ !== null) n += gcnCount(gcnQ.stop().statistics);",
    "  let e = gcnBuf.length - 1;",
    "  gcnBuf[e] = 10;",
    "  do { gcnBuf[--e] = 48 + (n % 10); n = (n / 10) | 0; } while (n > 0);",
    "  try { fs.writeSync(3, gcnBuf, e, gcnBuf.length - e); } catch (x) { /* fd 3 absent: no count (fails closed) */ }",
    "});",
];
const OLD_GCN = OLD_GCN_LINES.join('\n') + '\n';
const WORKER_LINE = "if (!require('worker_threads').isMainThread) return;";
const PIN_TAIL = '--no-concurrent-recompilation --no-allocation-site-pretenuring';

// child env: no inherited steering of git / node / editors; V8 coverage undefined (a delete is not a strip)
function cleanEnv(extra = {}) {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'NODE_TEST_CONTEXT', 'TMPDIR', 'POSIXLY_CORRECT', 'SHELLOPTS', 'CDPATH', 'GREP_OPTIONS']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return { ...e, ...extra };
}
const spawn = (cmd, args, opts, what, cap = 120000) => capSync(cmd, args, { encoding: 'utf8', env: cleanEnv(), maxBuffer: 1 << 26, ...opts }, cap, what);

let TOP = null, seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'audit-g3-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

const all = (r) => r.stdout + r.stderr;
const msg = (r) => `rc=${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const count = (s, sub) => s.split(sub).length - 1;
const sha = (s) => createHash('sha256').update(s).digest('hex');

// is process.execPath usable as the measured node? (a named skip reason, never a soft pass)
const probe = skip ? null : capSync(NODE_REAL, ['--version'], { encoding: 'utf8' }, 30000, 'node --version');
const nodeSkip = skip || (probe.status === 0 && /^v\d+\./.test(probe.stdout) ? false : `process.execPath is not a usable node (rc=${probe && probe.status})`);

// a driver in its own dir; run the tool on it with the real node (or `node` override), cwd = the driver dir
function driverDir(text) { const d = mk('drv'); writeFileSync(join(d, 'driver.js'), text); return d; }
function run(d, args, env = {}, node = NODE_REAL) {
    return spawn(BASH, [TOOL, '--node', node, ...args, join(d, 'driver.js')], { cwd: d, env: cleanEnv({ TMPDIR: mk('tmp'), ...env }) }, `allocation-diff ${args.join(' ')}`);
}
// a logging --node wrapper: appends its argv to a log, then execs the real node
function wrapper(dirName = 'w', exact = false) {
    let d = mk(dirName);
    if (exact) { d = join(d, dirName); mkdirSync(d); }
    const log = join(d, 'argv.log');
    const p = join(d, 'node');
    writeFileSync(p, `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\nexec ${JSON.stringify(NODE_REAL)} "$@"\n`);
    chmodSync(p, 0o755);
    return { p, log, lines: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l !== '').length : 0) };
}
// exactly one stderr line starts with `pre`, it equals `want`, and no other `allocation-diff:` line is there
function oneDie(r, pre, want) {
    const ls = r.stderr.split('\n');
    assert.equal(ls.filter((l) => l.startsWith(pre)).length, 1, msg(r));
    assert.equal(ls.find((l) => l.startsWith(pre)), want.replace(/\n$/, ''), msg(r));
    assert.equal(ls.filter((l) => l.startsWith('allocation-diff:')).length, 1, msg(r));
}
const youngOf = (out, k) => { const m = new RegExp(`^ {2}driver: run ${k} young (\\d+)`, 'm').exec(out); return m === null ? null : Number(m[1]); };

// ---------------------------------------------------------------------------------------------------------------------
test('A1 D-LIT --zero --runs 3: young GCs in run 1, never ZERO, head names the pretenuring pin', { skip: nodeSkip }, () => {
    const r = run(driverDir(D_LIT), ['--zero', '--runs', '3']);
    const o = all(r);
    assert.ok([1, 2].includes(r.status), msg(r));
    assert.ok(!o.includes('VERDICT ZERO'), msg(r));
    assert.match(o, /^ {2}driver: run 1 young [1-9]/m, msg(r));
    assert.ok(o.split('\n').some((l) => l.startsWith('mode ') && l.endsWith(PIN_TAIL)), `the mode line must end with the pin\n${msg(r)}`);
});

// A2 verdict predicate (Q-B98-L2TWINS (a) / Q-B97-L2ROW (a)): 'zero' (exit 0, VERDICT ZERO) or 'guard1' (exit 2 whose
// ONLY NO-VERDICT reason is "trace lost 1 GC line in run k (guard count c, trace c-1)"); the counts line must read
// young 0 in run 1, old 0, young per run 0,0,0 in both. Anything else throws AssertionError.
const A2_COUNTS = /^ {2}driver: run 1 young 0, old 0 in the window; .*; young per run 0,0,0$/m;
const A2_REASON = /^ {2}NO-VERDICT -- driver: trace lost 1 GC line in run ([1-3]) \(guard count (\d+), trace (\d+)\)$/;
function a2Ok(r) {
    const ls = r.stdout.split('\n');
    assert.equal(youngOf(r.stdout, 1), 0, msg(r));
    assert.match(r.stdout, A2_COUNTS, msg(r));
    const verdicts = ls.filter((l) => l.startsWith('VERDICT'));
    if (r.status === 0) {
        assert.match(r.stdout, /VERDICT ZERO/, msg(r));
        return 'zero';
    }
    assert.equal(r.status, 2, msg(r));
    assert.deepEqual(verdicts, ['VERDICT NO-VERDICT'], msg(r));
    const nv = ls.filter((l) => l.startsWith('  NO-VERDICT -- '));
    assert.equal(nv.length, 1, msg(r));
    const m = A2_REASON.exec(nv[0]);
    assert.ok(m !== null, `not the ruled guard reason\n${msg(r)}`);
    assert.equal(Number(m[3]), Number(m[2]) - 1, msg(r));
    return 'guard1';
}
const a2Lines = (r) => { const ls = r.stdout.split('\n'); return `${ls.find((l) => l.startsWith('  NO-VERDICT -- '))} | ${ls.find((l) => /^ {2}driver: run 1 young/.test(l))}`; };

// BASEDIAG (Q-B100-BASEDIAG (a)): ONE line per tool invocation, built from <out>/raw/driver/run.<k>.txt, so every CI leg
// records its D-F64 baseline with no download: `D-F64 baseline (<ver> <plat>/<arch>): run k a/b/c/d count C; ...` where
// a/b/c/d = GC lines before @@LITE-MARK start / start..end / end..gcn / after gcn (the guardDump stretch counter of
// test/allocation-diff.test.mjs, a local copy). C = the guard NO-VERDICT's guard count for its run (`none` for "no guard
// count"), g = a+b+c for the runs judge's guard loop passed, `?` after the guard NO-VERDICT run and on every other
// outcome (a non-guard NO-VERDICT, or no VERDICT ZERO / NONZERO line). An unreadable raw file reads `run k raw missing`;
// a raw text missing a mark reads `run k no @@LITE-MARK <mark>` (no number). Never throws.
const BD_GC = /^\[\d+:0x[0-9a-f]+\]/;
const BD_MARKS = ['@@LITE-MARK start', '@@LITE-MARK end', '@@LITE-MARK gcn'];
const BD_NV = /^ {2}NO-VERDICT -- driver: (.*)$/;
const BD_GUARD = [/^trace lost \d+ GC lines? in run (\d+) \(guard count (\d+), trace \d+\)$/, /^\d+ GC lines? in run (\d+) the guard did not count \(guard count (\d+), trace \d+\)$/, /^no guard count in run (\d+)()$/];
function bdStretch(txt) {
    const L = String(txt).split('\n');
    if (L.length && L[L.length - 1] === '') L.pop();
    const n = [0, 0, 0, 0];
    let seg = 0;
    for (let i = 0; i < L.length; i++) {
        if (seg < 3 && L[i] === BD_MARKS[seg]) { seg++; continue; }
        if (BD_GC.test(L[i])) n[seg]++;
    }
    return { n, seg };
}
// readRun(k) -> the raw text of run k, or throws; runs = the --runs value
function baseDiag(stdout, readRun, runs) {
    const head = `D-F64 baseline (${process.version} ${process.platform}/${process.arch}): `;
    try {
        let nvK = 0, nvC = '?', pre = false;   // nvK 0: judge's guard loop passed every run
        const nvL = String(stdout).split('\n').map((l) => BD_NV.exec(l)).find((m) => m) || null;
        if (nvL !== null) {
            const g = BD_GUARD.map((re) => re.exec(nvL[1])).find((m) => m) || null;
            if (g !== null) { nvK = Number(g[1]); nvC = g[2] === '' ? 'none' : g[2]; }
            else pre = true;
        } else if (!/^VERDICT (ZERO|NONZERO)$/m.test(String(stdout))) pre = true;
        const parts = [];
        for (let k = 1; k <= runs; k++) {
            let txt;
            try { txt = readRun(k); } catch { parts.push(`run ${k} raw missing`); continue; }
            if (typeof txt !== 'string') { parts.push(`run ${k} raw missing`); continue; }
            const { n, seg } = bdStretch(txt);
            if (seg < 3) { parts.push(`run ${k} no ${BD_MARKS[seg]}`); continue; }
            const c = pre ? '?' : nvK === 0 || k < nvK ? String(n[0] + n[1] + n[2]) : k === nvK ? nvC : '?';
            parts.push(`run ${k} ${n.join('/')} count ${c}`);
        }
        return head + parts.join('; ');
    } catch (e) {
        return head + 'not read (' + String(e && e.message ? e.message : e).split('\n')[0] + ')';
    }
}
const bdRead = (out) => (k) => readFileSync(join(out, 'raw', 'driver', `run.${k}.txt`), 'latin1');

test('A2 D-F64 --zero --runs 3: ZERO or the ruled guard NO-VERDICT (trace lost 1 GC line), young 0 in each run, old 0 (control, same on old)', { skip: nodeSkip }, (t) => {
    const out = join(mk('a2out'), 'out');   // made by the tool; the raw traces feed the BASEDIAG line
    const r = run(driverDir(D_F64), ['--zero', '--runs', '3', '--out', out]);
    t.diagnostic(baseDiag(r.stdout, bdRead(out), 3));
    const how = a2Ok(r);
    if (how === 'guard1') t.diagnostic('A2 accepted guard NO-VERDICT (Q-B98-L2TWINS (a) / Q-B97-L2ROW (a)): ' + a2Lines(r));
});

// A2 canned pin (no spawn). Fixtures: the CI sighting (b96-ci 137420421262 ubuntu-node26) and variants; expected values
// come from the ruling text, not from running the tool.
const A2_MODE = `mode    zero  runs 3  v8 flags --trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --${PIN_TAIL.slice(2)}`;
const a2Fix = ({ status = 2, young = '0,0,0', reason = 'trace lost 1 GC line in run 1 (guard count 13, trace 12)', verdict = 'NO-VERDICT', mode = A2_MODE, nv = 1 } = {}) => ({
    status,
    stderr: '',
    stdout: ['driver  /tmp/x/drv/driver.js  sha256/8 157c4dc3', mode, '',
        `  driver: run 1 young 0, old 0 in the window; 12 GC line(s) before the fence, 6 after end; young per run ${young}`,
        ...(reason === null ? [] : Array(nv).fill(`  NO-VERDICT -- driver: ${reason}`)), '', `VERDICT ${verdict}`, ''].join('\n'),
});
const a2Strict = (r) => { // the HEAD (ccd531f) A2 body
    const o = all(r);
    assert.equal(r.status, 0, msg(r));
    assert.match(o, /VERDICT ZERO/, msg(r));
    assert.equal(youngOf(o, 1), 0, msg(r));
    assert.match(o, /young per run 0,0,0\b/, msg(r));
    assert.match(o, /old 0/, msg(r));
};
test('A2 canned pin: guard1 sightings pass, everything else fails (no spawn)', (t) => {
    const zero = a2Fix({ status: 0, reason: null, verdict: 'ZERO' });
    assert.equal(a2Ok(a2Fix()), 'guard1');
    assert.equal(a2Ok(a2Fix({ reason: 'trace lost 1 GC line in run 3 (guard count 14, trace 13)' })), 'guard1');
    assert.equal(a2Ok(zero), 'zero');
    const bad = {
        'old-gen reason': a2Fix({ reason: 'old-generation GC in the window in run 1 (1 old GC line)' }),
        'no guard count': a2Fix({ reason: 'no guard count in run 1' }),
        'lost 2 lines': a2Fix({ reason: 'trace lost 2 GC lines in run 1 (guard count 14, trace 12)' }),
        'young 1,0,0': a2Fix({ young: '1,0,0' }),
        'young 0,1,0': a2Fix({ young: '0,1,0' }),
        'young 0,0,1': a2Fix({ young: '0,0,1' }),
        'extra line in trace': a2Fix({ reason: '1 GC line in run 1 the guard did not count (guard count 12, trace 13)' }),
        'trace 11': a2Fix({ reason: 'trace lost 1 GC line in run 1 (guard count 13, trace 11)' }),
        'status 1': a2Fix({ status: 1 }),
        'status 2 + VERDICT ZERO': a2Fix({ verdict: 'ZERO' }),
        'old 1 in the window': { ...a2Fix(), stdout: a2Fix().stdout.replace('old 0 in the window', 'old 1 in the window') },
        'status 0 but VERDICT NO-VERDICT': a2Fix({ status: 0, reason: null, verdict: 'NO-VERDICT' }),
        'status 0 but VERDICT NONZERO': a2Fix({ status: 0, reason: null, verdict: 'NONZERO' }),
        'two NO-VERDICT lines': a2Fix({ nv: 2 }),
    };
    for (const [name, r] of Object.entries(bad)) {
        t.diagnostic(`A2 pin must reject: ${name}`);
        assert.throws(() => a2Ok(r), assert.AssertionError, name);
    }
    // parity: the HEAD body refuses the CI sighting and accepts a ZERO run
    assert.throws(() => a2Strict(a2Fix()), assert.AssertionError);
    a2Strict(zero);
});

// BASEDIAG canned pin (no spawn). Fixture: raw/driver/run.1.txt of CI run 45133611956 (ubuntu-latest node v26.13.1, the
// L2 guard dump: marks at line start 7 end 8 gcn 15 of 16; lines 5-16 verbatim from the dump, lines 1-4 = the 4 GC lines
// the dump cut, rebuilt in the same grammar). Expected values come from the dump's counts line (before start 6,
// start..end 0, end..gcn 6, after gcn 1; guard count 13), not from running the helper.
const BD_L = (ms, a, b, c, d, t) => `[3171108:0x2f326000]       ${ms} ms: Scavenge ${a} (${b}) -> ${c} (${d}) MB, pooled: 0.0 MB, ${t} / 0.00 ms (average mu = 1.000, current mu = 1.000) allocation failure; `;
const BD_DUP = BD_L(73, '8.2', '10.3', '7.3', '10.3', '0.23');
const BD_CI = [BD_L(41, '1.0', '1.8', '0.9', '2.8', '0.61'), BD_L(44, '2.0', '2.8', '1.9', '3.8', '0.55'), BD_L(47, '3.9', '5.8', '3.8', '6.0', '1.10'),
    BD_L(50, '6.1', '7.8', '6.0', '8.8', '1.75'), BD_L(52, '7.1', '8.8', '7.1', '9.0', '1.92'), BD_L(54, '7.5', '9.0', '7.2', '9.8', '1.48'),
    '@@LITE-MARK start', '@@LITE-MARK end',
    BD_L(63, '8.1', '10.3', '7.3', '10.3', '0.48'), BD_L(65, '8.2', '10.3', '7.3', '10.3', '0.28'), BD_L(67, '8.2', '10.3', '7.3', '10.3', '0.20'),
    BD_L(69, '8.2', '10.3', '7.3', '10.3', '0.19'), BD_L(71, '8.2', '10.3', '7.3', '10.3', '0.18'), BD_DUP,
    '@@LITE-MARK gcn', BD_DUP, ''].join('\n');
const BD_CLEAN = BD_CI.split(`@@LITE-MARK gcn\n${BD_DUP}\n`).join('@@LITE-MARK gcn\n');   // 6/0/6/0: the run judge passed
const BD_HEAD = `D-F64 baseline (${process.version} ${process.platform}/${process.arch}): `;
const bdFrom = (m) => (k) => { if (!(k in m)) throw new Error(`ENOENT run.${k}.txt`); return m[k]; };
test('A2 BASEDIAG canned pin (no spawn): the 45133611956 dump reads "run 1 6/0/6/1 count 13"; one line; no gcn mark prints no number; never throws', () => {
    assert.equal(bdStretch(BD_CI).n.join('/'), '6/0/6/1');
    assert.equal(BD_CI.split('\n').length - 1, 16, 'the dump fixture holds 16 lines');
    // the CI sighting: run 1 is the NO-VERDICT run (its guard count), runs 2..3 come after it
    const ci = baseDiag(a2Fix().stdout, bdFrom({ 1: BD_CI, 2: BD_CLEAN, 3: BD_CLEAN }), 3);
    assert.equal(ci, BD_HEAD + 'run 1 6/0/6/1 count 13; run 2 6/0/6/0 count ?; run 3 6/0/6/0 count ?');
    // a NO-VERDICT in run 2: run 1 passed the guard loop (g = a+b+c), run 3 is `?`
    const r2 = a2Fix({ reason: 'trace lost 1 GC line in run 2 (guard count 13, trace 12)' }).stdout;
    assert.equal(baseDiag(r2, bdFrom({ 1: BD_CLEAN, 2: BD_CI, 3: BD_CLEAN }), 3), BD_HEAD + 'run 1 6/0/6/0 count 12; run 2 6/0/6/1 count 13; run 3 6/0/6/0 count ?');
    // ZERO: every run passed; a missing raw file reads "raw missing"
    const zero = a2Fix({ status: 0, reason: null, verdict: 'ZERO' }).stdout;
    assert.equal(baseDiag(zero, bdFrom({ 1: BD_CLEAN, 3: BD_CLEAN }), 3), BD_HEAD + 'run 1 6/0/6/0 count 12; run 2 raw missing; run 3 6/0/6/0 count 12');
    // "no guard count": its run reads `none`; a NO-VERDICT that precedes the guard loop leaves every count `?`
    assert.equal(baseDiag(a2Fix({ reason: 'no guard count in run 1' }).stdout, bdFrom({ 1: BD_CLEAN }), 1), BD_HEAD + 'run 1 6/0/6/0 count none');
    assert.equal(baseDiag(a2Fix({ reason: 'driver exited 1 in run 2' }).stdout, bdFrom({ 1: BD_CLEAN, 2: BD_CLEAN }), 2), BD_HEAD + 'run 1 6/0/6/0 count ?; run 2 6/0/6/0 count ?');
    assert.equal(baseDiag(a2Fix({ reason: 'old-generation GC in the window in run 2 (Mark-Compact)' }).stdout, bdFrom({ 1: BD_CLEAN, 2: BD_CLEAN, 3: BD_CLEAN }), 3), BD_HEAD + 'run 1 6/0/6/0 count ?; run 2 6/0/6/0 count ?; run 3 6/0/6/0 count ?');
    assert.equal(baseDiag('', bdFrom({ 1: BD_CLEAN }), 1), BD_HEAD + 'run 1 6/0/6/0 count ?');
    // fail-closed control: a raw text with no gcn mark (or no end / start mark) prints no number for that run
    const noGcn = BD_CI.split('@@LITE-MARK gcn\n').join('');
    for (const [txt, mark] of [[noGcn, 'gcn'], [BD_CI.split('@@LITE-MARK end\n').join(''), 'end'], ['', 'start']]) {
        const d = baseDiag(a2Fix().stdout, bdFrom({ 1: txt }), 1);
        assert.equal(d, BD_HEAD + `run 1 no @@LITE-MARK ${mark}`);
        assert.ok(!/\d/.test(d.slice(BD_HEAD.length + 'run 1'.length)), `a number after "run 1": ${d}`);
    }
    // exactly one line; never throws (a throwing reader, a non-string read, a null stdout)
    for (const d of [ci, baseDiag(null, () => { throw new Error('x'); }, 3), baseDiag(undefined, () => 7, 2)]) {
        assert.equal(d.split('\n').length, 1, d);
        assert.ok(d.startsWith(BD_HEAD), d);
    }
    assert.equal(baseDiag(undefined, () => 7, 2), BD_HEAD + 'run 1 raw missing; run 2 raw missing');
});

test('A3 retention: 3 runs of the tool leave TMPDIR empty and the driver dir with only driver.js (control)', { skip: nodeSkip }, () => {
    const d = driverDir(D_LIT);
    for (let i = 0; i < 3; i++) {
        const t = mk('ret');
        const r = spawn(BASH, [TOOL, '--node', NODE_REAL, '--zero', '--runs', '3', join(d, 'driver.js')], { cwd: d, env: cleanEnv({ TMPDIR: t }) }, 'allocation-diff retention');
        assert.ok([0, 1, 2].includes(r.status), msg(r));
        assert.deepEqual(readdirSync(t), [], `TMPDIR entries left after invocation ${i + 1}`);
        assert.deepEqual(readdirSync(d), ['driver.js'], `driver dir after invocation ${i + 1}`);
    }
});

// A4: every refusal exits 2 with exactly one die line (the TASK 1 text), before any node spawn
const PRETEN_TXT = (f) => `allocation-diff: --v8-flags must not set ${f}: the script pins --no-allocation-site-pretenuring (a pretenured literal site allocates straight into old space: no young GC, a wrong ZERO)\n`;
const STRESS_TXT = (f) => `allocation-diff: --v8-flags must not set ${f}: --stress-concurrent-inlining implies --concurrent-recompilation in V8, which overrides the script's --no-concurrent-recompilation (every spelling of the flag is refused)\n`;
const A4_CASES = [
    ...['--allocation-site-pretenuring', '--allocation_site_pretenuring', '--no-allocation-site-pretenuring'].map((f) => [f, PRETEN_TXT(f)]),
    ...['--stress-concurrent-inlining', '--stress_concurrent_inlining_attach_code', '--no-stress-concurrent-inlining'].map((f) => [f, STRESS_TXT(f)]),
];
for (const [f, want] of A4_CASES) {
    test(`A4 --v8-flags=${f}: exit 2, one die line, the wrapper node is never run`, { skip: nodeSkip }, () => {
        const w = wrapper();
        const r = run(driverDir(D_YOUNG), ['--zero', '--runs', '2', `--v8-flags=${f}`], {}, w.p);
        assert.equal(r.status, 2, msg(r));
        oneDie(r, 'allocation-diff: --v8-flags must not set ', want);
        assert.equal(w.lines(), 0, `wrapper log: ${existsSync(w.log) ? readFileSync(w.log, 'utf8') : ''}`);
        assert.ok(!/^allocation-diff {2}node/m.test(all(r)), msg(r));
    });
}

test('A5 --node <d>/a=b/node: exit 2, the R26 die text, 0 wrapper runs', { skip: nodeSkip }, () => {
    const w = wrapper('a=b', true);
    assert.ok(w.p.includes('/a=b/node'), w.p);
    const r = run(driverDir(D_YOUNG), ['--zero', '--runs', '2'], {}, w.p);
    assert.equal(r.status, 2, msg(r));
    oneDie(r, 'allocation-diff: node binary: an = ', `allocation-diff: node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): ${w.p}`);
    assert.equal(w.lines(), 0);
});

test('A5b --node ./node with cwd <d>/a=b: the R26 refusal is on the RESOLVED path (exit 2, one die line, 0 wrapper runs)', { skip: nodeSkip }, () => {
    const w = wrapper('a=b', true);
    const dd = dirname(w.p);
    const drv = driverDir(D_YOUNG);
    const r = spawn(BASH, [TOOL, '--node', './node', '--zero', '--runs', '2', join(drv, 'driver.js')], { cwd: dd, env: cleanEnv({ TMPDIR: mk('tmp') }) }, 'allocation-diff ./node');
    assert.equal(r.status, 2, msg(r));
    oneDie(r, 'allocation-diff: node binary: an = ', `allocation-diff: node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): ${dd}/node`);
    assert.equal(w.lines(), 0);
});

// A6 / A7: a grep that fails on -c must not read as "no young GC"
const REAL_GREP = ['/usr/bin/grep', '/bin/grep'].find((p) => existsSync(p));
const grepSkip = nodeSkip || (REAL_GREP ? false : 'no /usr/bin/grep or /bin/grep');
test('A6 grep shim exiting 2 on -c, first on PATH, D-YOUNG --zero --runs 2: NONZERO, old 0 in the window', { skip: grepSkip }, () => {
    const s = mk('shim');
    writeFileSync(join(s, 'grep'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = -c ] && exit 2; done\nexec ${REAL_GREP} "$@"\n`);
    chmodSync(join(s, 'grep'), 0o755);
    const r = run(driverDir(D_YOUNG), ['--zero', '--runs', '2'], { PATH: `${s}:${process.env.PATH}` });
    assert.equal(r.status, 1, msg(r));
    assert.match(all(r), /VERDICT NONZERO/, msg(r));
    assert.match(all(r), /old 0 in the window/, msg(r));
});

const gp = process.platform === 'darwin' && !skip ? capSync('/usr/bin/grep', ['-c', 'x'], { encoding: 'utf8', input: '', env: cleanEnv({ GREP_OPTIONS: '-P' }) }, 30000, 'grep probe') : null;
const a7Skip = nodeSkip || (process.platform !== 'darwin' ? 'darwin only (BSD grep + GREP_OPTIONS=-P)' : gp.status === 2 ? false : `this host's /usr/bin/grep does not exit 2 on GREP_OPTIONS=-P -c (rc=${gp.status})`);
test('A7 darwin GREP_OPTIONS=-P (real grep exits 2 on -c), D-YOUNG --zero --runs 2: NONZERO', { skip: a7Skip }, () => {
    const r = run(driverDir(D_YOUNG), ['--zero', '--runs', '2'], { GREP_OPTIONS: '-P' });
    assert.equal(r.status, 1, msg(r));
    assert.match(all(r), /VERDICT NONZERO/, msg(r));
});

test('A8 D-WORKER --zero --runs 2: exit 2, NO-VERDICT says "the guard did not count", never "@@LITE-MARK gcn"', { skip: nodeSkip }, () => {
    const r = run(driverDir(D_WORKER), ['--zero', '--runs', '2']);
    const nv = all(r).split('\n').filter((l) => l.startsWith('  NO-VERDICT -- '));
    assert.equal(r.status, 2, msg(r));
    assert.ok(nv.length >= 1, msg(r));
    assert.ok(nv.some((l) => l.includes('the guard did not count')), msg(r));
    assert.ok(!nv.some((l) => l.includes('@@LITE-MARK gcn')), msg(r));
});

test('A9 D-FORK --zero --runs 2: exit 2, "@@LITE-MARK gcn given twice" (control, same on old)', { skip: nodeSkip }, () => {
    const r = run(driverDir(D_FORK), ['--zero', '--runs', '2']);
    assert.equal(r.status, 2, msg(r));
    assert.match(all(r), /@@LITE-MARK gcn given twice/, msg(r));
});

// A10: the heredoc is the old one plus exactly one line; -h phrases; the self-test count
function heredocOf(path) {
    const ls = readFileSync(path, 'utf8').split('\n');
    const a = ls.indexOf("cat <<'GCN_CJS'");
    const b = ls.indexOf('GCN_CJS', a + 1);
    assert.ok(a >= 0 && b > a, 'GCN_CJS heredoc not found');
    return ls.slice(a + 1, b).join('\n') + '\n';
}
test('A10 gcn heredoc = the old 1989-byte heredoc + exactly one isMainThread line before `const v8` (2042 bytes)', { skip }, () => {
    assert.equal(Buffer.byteLength(OLD_GCN), 1989, 'inlined old heredoc size');
    assert.equal(sha(OLD_GCN), '279a5f8742cfd3e8504c2221b0908359e20f566592c996845d7eafb6bd9f0a1e', 'inlined old heredoc sha256');
    const want = OLD_GCN.replace("const v8 = require('v8');\n", `${WORKER_LINE}\nconst v8 = require('v8');\n`);
    assert.equal(count(want, WORKER_LINE), 1);
    assert.equal(Buffer.byteLength(want), 2042);
    const got = heredocOf(TOOL);
    assert.equal(got, want);
});

test('A10 -h: exit 2; each new phrase exactly once, the old workers phrase never', { skip }, () => {
    const r = spawn(BASH, [TOOL, '-h'], {}, 'allocation-diff -h', 30000);
    const o = all(r);
    assert.equal(r.status, 2, msg(r));
    for (const p of ['*allocation-site-pretenuring*', '*stress-concurrent-inlining*', 'an = is not allowed in the resolved path', 'a Worker that triggers no GC', 'child_process.fork()']) {
        assert.equal(count(o, p), 1, `${p}: ${count(o, p)} times`);
    }
    assert.equal(count(o, 'allocation in workers or other isolates'), 0);
});

test('A10 --self-test: exit 0, last line "self-test: 85 check(s) ok", no FAIL line', { skip }, () => {
    const r = spawn(BASH, [TOOL, '--self-test'], { cwd: mk('st'), env: cleanEnv({ TMPDIR: mk('sttmp') }) }, 'allocation-diff --self-test', 600000);
    const ls = r.stdout.split('\n').filter((l) => l !== '');
    assert.equal(r.status, 0, msg(r).slice(-1500));
    assert.equal(ls[ls.length - 1], 'self-test: 85 check(s) ok');
    assert.ok(!ls.some((l) => l.startsWith('FAIL ')), 'a FAIL line');
});
