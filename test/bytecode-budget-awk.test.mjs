// test/bytecode-budget-awk.test.mjs -- G-BBAWK (b50): bytecode-budget.sh COUNT_AWK (a header glued after column 1,
// an orphan "Bytecode length:" line), the NUL tr on both probe() branches, and LIMITS_AWK (a stale flag header)
// in BOTH built roots (bytecode-budget.sh, inlining-budget-diff.sh).
// Oracle: .handoff/PLAN-b50-bbawk.md ASSERTIONS 2, 3, 5 (not a run of the implementation). Hand-derived:
//   E1 add: "[hdr add] / Bytecode length: 6 / step [hdr add] / Bytecode length: 1083". The glued second header is a
//     header found after column 1 -> counts matched AND bad: n = 2, good = 1 -> "1 of 2 matched header(s) ...".
//     The old build never sees the glued header (not at ^), drops the 1083 line (want = 0) -> "1 0 6": WITHIN.
//   E2 orphan: "[hdr add] / Bytecode length: 6 / x / Bytecode length: 1083": no header for the 1083 -> "1 of 2".
//   E4 = E1 with "x" + NUL glued (tr turns the NUL into '?', the header is then after column 1). E3: "Bytecode
//     length: 6" + NUL + "junk" -> after tr the line no longer ends at the digits -> "1 of 1" (exit 2).
//   R-d (LIMITS_AWK): an unrelated "  --unrelated-flag" header between a limit header and its default must not lend
//     that default to the limit: only "max-inlined-bytecode-size=460" is printed.
// Every live-expected row is a live gate against the fixed roots (B1 landed). Rows marked as regression pins or
// frozen-build controls pass on bd0192f too, which proves the oracle sees the old behavior. Confirmed by B1: the
// reason text of E1 / E2 / E4 ("1 of 2 ...") and E3 ("1 of 1"), and the node spawn count 5 per 1-fn gate run.
// "before" = commit bd0192f via `git show` (CI has no .handoff); unreachable -> SKIP, fatal under CI=true.
import { test, beforeEach, after } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { probeAwk, buildNulCutAwk, nulTmpDir } from './nul-awk.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BB = join(ROOT, 'bytecode-budget.sh');
const IBD = join(ROOT, 'inlining-budget-diff.sh');
const FIX = join(HERE, 'fixtures', 'bytecode-budget', 'node-26.8.2');
const DRIVER = join(FIX, 'driver.mjs');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

// ---- env: the harness editor / node options / git vars stripped (a node re-adds a deleted NODE_V8_COVERAGE) ----
function cleanEnv(extra = {}) {
    const e = { ...process.env, ...extra };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['EDITOR', 'VISUAL', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS']) {
        delete e[k];
    }
    e.NODE_V8_COVERAGE = undefined;
    return e;
}
const ENV = cleanEnv();

// ---- frozen "before" build: bd0192f, pinned by sha256/8 ----
const BEFORE = 'bd0192f';
const PINS = { 'bytecode-budget.sh': 'c24c851b', 'inlining-budget-diff.sh': 'a9bf15d3' };
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (h) => { if (h !== true) assert.fail(`${h} (CI=true: a history row fails, never skips)`); };
let have = true;
const frozen = {};
const fdir = skip ? null : mkdtempSync(join(tmpdir(), 'bbawk-frozen-'));
if (fdir) after(() => rmSync(fdir, { recursive: true, force: true }));
if (!skip) {
    for (const [name, sha] of Object.entries(PINS)) {
        const g = capSync('git', ['-C', ROOT, 'show', `${BEFORE}:${name}`], { env: ENV, maxBuffer: 1 << 26 }, 30000, 'git show');
        if (g.status !== 0) { have = `git show ${BEFORE}:${name} failed (shallow clone or no git)`; break; }
        const got = createHash('sha256').update(g.stdout).digest('hex').slice(0, 8);
        if (got !== sha) { have = `${BEFORE}:${name} is ${got}, not the pinned ${sha}`; break; }
        frozen[name] = join(fdir, name);
        writeFileSync(frozen[name], g.stdout);
        chmodSync(frozen[name], 0o755);
    }
}
const hskip = skip || histSkip(have);

// ---- NUL cut shim (b37 ruling): BSD record semantics on any host, used only when the host awk is NUL-clean ----
const NUL = skip ? null : probeAwk(ENV);
const NULDIR = skip ? null : nulTmpDir('bbawk-nul-');
const NULSHIM = skip ? null : buildNulCutAwk(NULDIR, ENV);
const NULENV = skip ? null : cleanEnv({ PATH: NULSHIM.dir + ':' + ENV.PATH });
const mutEnv = () => (NUL.nulClean ? NULENV : ENV);

function run(script, args, env = ENV, what = 'bytecode-budget.sh') {
    return capSync('bash', [script, ...args], { encoding: 'utf8', env }, 120000, what);
}

// ---- scenario traces (bytes) ----
const H = (a) => `[generated bytecode for function: add (0x${a} <SharedFunctionInfo add>)]\n`;
const L = (n) => `Bytecode length: ${n}\n`;
const SC = {
    E1: H(1) + L(6) + 'step ' + H(2) + L(1083),
    CTL: H(1) + L(6) + H(2) + L(1083),
    E2: H(1) + L(6) + 'x\n' + L(1083),
    E4: H(1) + L(6) + 'x\0' + H(2) + L(1083),
    E3: H(1) + 'Bytecode length: 6\0junk\n',
};

// A fake node (sh): --version, --v8-options (fixture excerpt), else cats the trace file. Every call logs its argv.
function fakeNode(dir, trace) {
    writeFileSync(join(dir, 'trace.bin'), Buffer.from(trace, 'latin1'));
    const log = join(dir, 'argv.log');
    const sh = `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) echo v26.8.2; exit 0 ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
cat ${JSON.stringify(join(dir, 'trace.bin'))}
exit 0
`;
    const p = join(dir, 'node');
    writeFileSync(p, sh);
    chmodSync(p, 0o755);
    const spawns = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    return { path: p, spawns };
}

// One gate run (--max add=10, default --runs): { r, text, spawns, out: { names, raw: { file: nulCount } } | null }
function gate(script, sc, { withOut = false, env = ENV } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'bbawk-'));
    try {
        const f = fakeNode(dir, SC[sc]);
        const out = join(dir, 'o');
        const args = ['--node', f.path, '--max', 'add=10', '--node-version', 'v26.8.2'];
        if (withOut) args.push('--out', out);
        args.push(DRIVER);
        const r = run(script, args, env);
        let o = null;
        if (withOut) {
            o = { names: existsSync(out) ? readdirSync(out).sort() : [], raw: {} };
            const rd = join(out, 'raw');
            if (existsSync(rd)) {
                for (const n of readdirSync(rd).sort()) {
                    o.raw[n] = readFileSync(join(rd, n)).filter((b) => b === 0).length;
                }
            }
        }
        return { r, text: r.stdout + r.stderr, spawns: f.spawns(), out: o };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

// A copy of a root with ONE exact edit (anchor exactly once); `dir` is the caller's private dir.
function variant(dir, src, name, from, to) {
    const text = readFileSync(src, 'utf8');
    const n = text.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, text.replace(from, () => to));
    chmodSync(p, 0o755);
    return p;
}

const REASON = (b, n) =>
    new RegExp(`${b} of ${n} matched header\\(s\\) not followed by 'Bytecode length: N' in run 1`);

// ---- assertion 2: E1 / E2 / E4 / E3 (live expected exit 2; frozen exit 0) ----
const ROWS = [
    ['E1 a header glued after column 1 ("step " + header): exit 2, "1 of 2 matched..."', 'E1', REASON(1, 2)],
    ['E2 an orphan "Bytecode length:" line: exit 2, "1 of 2 matched header(s)..."', 'E2', REASON(1, 2)],
    ['E4 "x" NUL glued to a header: exit 2 on every host (tr makes it a column > 1 header)', 'E4', REASON(1, 2)],
];
for (const [name, sc, re] of ROWS) {
    test(`bytecode-budget-awk live ${name}`, { skip }, () => {
        const g = gate(BB, sc);
        assert.equal(g.r.status, 2, g.text);
        assert.match(g.text, re);
        assert.match(g.text, /VERDICT NO-VERDICT/);
    });
    test(`bytecode-budget-awk frozen ${BEFORE} control (${sc}): exit 0 WITHIN, the old awk misses it`,
        { skip: hskip }, () => {
        histGate(have);
        const g = gate(frozen['bytecode-budget.sh'], sc);
        assert.equal(g.r.status, 0, g.text);
        assert.match(g.text, /VERDICT WITHIN/);
    });
}

// regression pin: a header on its own line is read as ever -> 1083 > 10 is OVER, exit 1, on live and frozen
test('bytecode-budget-awk newline control (header on its own line): exit 1 VERDICT OVER (regression pin)',
    { skip: hskip }, () => {
    histGate(have);
    for (const root of [BB, frozen['bytecode-budget.sh']]) {
        const g = gate(root, 'CTL');
        assert.equal(g.r.status, 1, g.text);
        assert.match(g.text, /VERDICT OVER/);
    }
});

// E3: "Bytecode length: 6" NUL "junk" -> exit 2 with and without --out; each raw run file keeps its 1 NUL
for (const withOut of [false, true]) {
    test(`bytecode-budget-awk live E3 length + NUL + junk ${withOut ? 'with' : 'without'} --out: exit 2`,
        { skip }, () => {
        const g = gate(BB, 'E3', { withOut });
        assert.equal(g.r.status, 2, g.text);
        assert.match(g.text, REASON(1, 1));
        if (withOut) {
            assert.deepEqual(Object.keys(g.out.raw), ['add.1.txt', 'add.2.txt']);
            assert.deepEqual(Object.values(g.out.raw), [1, 1], 'raw/ keeps the NUL (tee runs before tr)');
        }
    });
}

// mutants of the live root: each must change the E3 outcome (the anchors exist after the fix only)
const TEE = '| tee "$OUT/raw/$5" | tr \'\\000\' \'?\'';
test('bytecode-budget-awk mutant: tr dropped on the --out branch -> E3 --out exits 0 (NUL cut)',
    { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bbawk-m1-'));
    try {
        const p = variant(dir, BB, 'tr-out-off', TEE, '| tee "$OUT/raw/$5"');
        const g = gate(p, 'E3', { withOut: true, env: mutEnv() });
        assert.equal(g.r.status, 0, g.text);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('bytecode-budget-awk mutant: tr dropped on the no-out branch -> E3 exits 0 (NUL cut), the live row is red',
    { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bbawk-m2-'));
    try {
        const p = variant(dir, BB, 'tr-plain-off', '2>&1) | tr \'\\000\' \'?\' | awk', '2>&1) | awk');
        const g = gate(p, 'E3', { env: mutEnv() });
        assert.equal(g.r.status, 0, g.text);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('bytecode-budget-awk mutant: tr before tee -> raw/ files hold 0 NUL instead of 1',
    { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bbawk-m3-'));
    try {
        const p = variant(dir, BB, 'tr-before-tee', TEE, '| tr \'\\000\' \'?\' | tee "$OUT/raw/$5"');
        const g = gate(p, 'E3', { withOut: true });
        assert.deepEqual(Object.values(g.out.raw), [0, 0]);
        const live = gate(BB, 'E3', { withOut: true });
        assert.deepEqual(Object.values(live.out.raw), [1, 1], 'the live root keeps the NUL in raw/');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- assertion 3: LIMITS_AWK of both roots ----
function limitsAwk(path) {
    const t = readFileSync(path, 'utf8');
    const a = t.indexOf("\nLIMITS_AWK='\n");
    assert.ok(a >= 0, `${path}: no LIMITS_AWK`);
    const s = a + "\nLIMITS_AWK='\n".length;
    const e = t.indexOf("\n'\n", s);
    assert.ok(e > s, `${path}: LIMITS_AWK unterminated`);
    return t.slice(s, e + 1);
}
function runAwk(prog, input) {
    const r = capSync('awk', [prog], { input, encoding: 'utf8', env: ENV }, 30000, 'awk LIMITS_AWK');
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
}
// R-d, the old "default: value" format: the small limit's header has no default, an unrelated flag's header comes
// next with default 999, then the real limit with default 460
const RD = [
    '  --max-inlined-bytecode-size-small (maximum bytecode size to be considered for small function inlining)',
    '        type: int',
    '  --unrelated-flag (x)',
    '        type: int  default: 999',
    '  --max-inlined-bytecode-size (maximum bytecode size to be considered for inlining)',
    '        type: int  default: 460',
    '',
].join('\n');
const LIM = { bb: BB, ibd: IBD };
for (const [tag, path] of Object.entries(LIM)) {
    test(`bytecode-budget-awk ${tag} root: LIMITS_AWK on the R-d text prints exactly max-inlined-bytecode-size=460`,
        { skip }, () => {
        assert.equal(runAwk(limitsAwk(path), RD), 'max-inlined-bytecode-size=460\n');
    });
    test(`bytecode-budget-awk ${tag} root: reset line deleted -> small=999 first (mutant)`,
        { skip }, () => {
        const line = '/^  --/ { k = "" }\n';
        const prog = limitsAwk(path);
        assert.equal(prog.split(line).length - 1, 1, 'the reset line, exactly once');
        const mut = prog.replace(line, '');
        assert.equal(runAwk(mut, RD), 'max-inlined-bytecode-size-small=999\nmax-inlined-bytecode-size=460\n');
    });
    test(`bytecode-budget-awk ${tag} root: LIMITS_AWK on the 26.8.2 excerpt equals limits.txt (pin)`,
        { skip }, () => {
        const got = runAwk(limitsAwk(path), readFileSync(join(FIX, 'v8-options-excerpt.txt')));
        assert.equal(got, readFileSync(join(FIX, 'limits.txt'), 'utf8'));
    });
    test(`bytecode-budget-awk frozen ${BEFORE} ${tag} control: R-d prints small=999 first, then 460`,
        { skip: hskip }, () => {
        histGate(have);
        const name = path.slice(ROOT.length + 1);
        const want = 'max-inlined-bytecode-size-small=999\nmax-inlined-bytecode-size=460\n';
        assert.equal(runAwk(limitsAwk(frozen[name]), RD), want);
    });
}
test('bytecode-budget-awk: LIMITS_AWK is byte-identical in the bb and ibd roots (regression pin)', { skip }, () => {
    assert.equal(limitsAwk(BB), limitsAwk(IBD));
});

// ---- assertion 5: spawns / retention (regression pins on E1, no verdict asserted) ----
test('bytecode-budget-awk: an E1 gate run spawns node 5 times (version, 2 x v8-options, 2 traces)',
    { skip }, () => {
    const g = gate(BB, 'E1');
    assert.equal(g.spawns.length, 5, g.spawns.join('\n'));
    assert.deepEqual(g.spawns.slice(0, 3), ['--version', '--v8-options', '--v8-options']);
    assert.equal(g.spawns.filter((l) => l.includes('--print-bytecode-filter=add')).length, 2);
});
test('bytecode-budget-awk: 20 back-to-back E1 runs leave a private TMPDIR empty and call no mktemp',
    { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bbawk-ret-'));
    const tmp = mkdtempSync(join(tmpdir(), 'bbawk-tmp-'));
    try {
        const real = capSync('bash', ['-c', 'command -v mktemp'], { encoding: 'utf8', env: ENV }, 30000, 'command -v mktemp').stdout.trim();
        assert.ok(real, 'no real mktemp on PATH');
        const bin = join(dir, 'shim-bin');
        mkdirSync(bin);
        const log = join(dir, 'mktemp.log');
        writeFileSync(log, '');
        const shim = `#!/bin/bash\np=$('${real}' "$@") || exit $?\n` +
            `printf '%s\\n' "$p" >>'${log}'\nprintf '%s\\n' "$p"\n`;
        writeFileSync(join(bin, 'mktemp'), shim);
        chmodSync(join(bin, 'mktemp'), 0o755);
        const f = fakeNode(dir, SC.E1);
        const env = cleanEnv({ TMPDIR: tmp, PATH: bin + ':' + process.env.PATH });
        for (let i = 0; i < 20; i++) {
            const r = run(BB, ['--node', f.path, '--max', 'add=10', '--node-version', 'v26.8.2', DRIVER], env);
            assert.equal(r.status, 2, r.stdout + r.stderr);
        }
        assert.equal(f.spawns().length, 100, 'node spawns');   // 5 x 20
        assert.deepEqual(readdirSync(tmp), []);
        assert.equal(readFileSync(log, 'utf8'), '', 'no mktemp call');
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); }
});
test('bytecode-budget-awk: E1 with --out leaves OUT = { raw, report.txt } and raw/ with exactly 2 files',
    { skip }, () => {
    const g = gate(BB, 'E1', { withOut: true });
    assert.deepEqual(g.out.names, ['raw', 'report.txt']);
    assert.deepEqual(Object.keys(g.out.raw), ['add.1.txt', 'add.2.txt']);
});

// the shim row: the mutant rows above rely on the cut shim being first on PATH when the host awk is NUL-clean
test('bytecode-budget-awk: the NUL mutant rows take the cut shim iff the host awk is NUL-clean', { skip }, (t) => {
    t.diagnostic(`host awk ${NUL.awk}: length(a<NUL>b) = ${NUL.len}`);
    assert.equal(NUL.nulClean, NUL.len === 3);
    assert.equal(probeAwk(NULENV).awk, NULSHIM.awk);
    assert.equal(probeAwk(NULENV).nulClean, false);
});
