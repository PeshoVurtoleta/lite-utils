// test/bytecode-budget-fillers.test.mjs -- audit-FILLERS bytecode-budget rows (b54 ASSERTIONS 1, 2, 3).
// ORACLE: PLAN-b54-audit-fillers ASSERTIONS 1-3, hand-derived; no value here is copied from a run.
//   A1 (B4b): probe()'s pipeline exits (node, tee, tr, awk) ride on a "@ ..." line. A tee / tr failure with a clean
//      driver reads "cannot read driver output in run 1 (tee|tr exited 1)", rc 2, NO-VERDICT. The old build reports
//      "driver exited 1 in run 1". Precedence: awk > tr > tee > driver, so a driver exit 9 alone is "driver exited 9",
//      and tee shim + driver 9 names tee. Mutant: the two judge arms swapped -> tee + 9 reads "driver exited 9".
//   A2 (B4a-2): only six limits are read by bb (small, small-with-heapnum, single, maglev small / single / eager). The
//      three it never reads (the two cumulative values, the scale factor) are filtered out of ASSUMED: a listing of just
//      the six -> 0 "^NOTE    limits" lines; the old build names exactly those 3 keys (defaults 920, 1.2, 920).
//      Control: the six minus max-inlined-bytecode-size-small -> the NOTE names only "=30" (node 26 default of small).
//      Mutant ASSUMED="" -> the control loses its NOTE.
//   A3 (N1 / B4a-3): lib/v8limits.sh strips NODE_OPTIONS and NODE_COMPILE_CACHE for its --v8-options spawn and dies with
//      "cannot run <bin> --v8-options" when that spawn fails. A shim that exits 7 if either var is set: sourced under
//      `set -euo pipefail` with a die stub, the new lib reaches TF_ONE=460, the old lib exits 7 with no die text.
//      bb with a second --v8-options exiting 1 -> rc 2 with one "cannot run" and 0 "unexpected error"; the old build
//      is the reverse (one "unexpected error", no "cannot run"). A bb copy minus its TOPLINE unset, shim exiting 7 at
//      --version only: the new `env -u ... --version` still passes, the old one dies (NODE_COMPILE_CACHE only; NODE_OPTIONS was already stripped, a regression pin) "cannot run ... --version".
// TIER: DETERMINISTIC (fake node, private mktemp dirs). Every row can fail: each names its twin or mutant.
// "before" = commit 96e7712 via `git show` (CI has no .handoff); unreachable -> SKIP by name, fatal under CI=true.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const BB = join(PKG, 'bytecode-budget.sh');
const LIB = join(PKG, 'lib', 'v8limits.sh');
const PROBE_LIB = join(PKG, 'lib', 'v8probe.sh');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

function cleanEnv(extra = {}) {
    const e = { ...process.env, ...extra };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['EDITOR', 'VISUAL', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'FAKE_RC']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;
    return e;
}
const ENV = cleanEnv();

const ROOT = skip ? null : realpathSync(mkdtempSync(join(tmpdir(), 'bbfill-')));
if (ROOT) after(() => rmSync(ROOT, { recursive: true, force: true }));
let nDir = 0;
function priv() { const d = join(ROOT, `d${++nDir}`); mkdirSync(d); return d; }

// ---- frozen "before": 96e7712, pinned by sha256/8 ----
const BEFORE = '96e7712';
const PINS = { 'bytecode-budget.sh': '73143a76', 'lib/v8limits.sh': 'f4491a41' };
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const histGate = (h) => { if (h !== true) assert.fail(`${h} (CI=true: a history row fails, never skips)`); };
let have = true;
const frozen = {};
if (!skip) {
    mkdirSync(join(ROOT, 'old'));
    for (const [name, sha] of Object.entries(PINS)) {
        const g = capSync('git', ['-C', PKG, 'show', `${BEFORE}:${name}`], { env: ENV, maxBuffer: 1 << 26 }, 30000, 'git show');
        if (g.status !== 0) { have = `git show ${BEFORE}:${name} failed (shallow clone or no git)`; break; }
        const got = createHash('sha256').update(g.stdout).digest('hex').slice(0, 8);
        if (got !== sha) { have = `${BEFORE}:${name} is ${got}, not the pinned ${sha}`; break; }
        frozen[name] = join(ROOT, 'old', name.replace('/', '-'));
        writeFileSync(frozen[name], g.stdout);
        chmodSync(frozen[name], 0o755);
    }
}
const hskip = skip || histSkip(have);

// ---- fixtures ----
const NAMES = {
    small: 'max-inlined-bytecode-size-small', hn: 'max-inlined-bytecode-size-small-with-heapnum-in-out',
    one: 'max-inlined-bytecode-size', mgs: 'max-maglev-inlined-bytecode-size-small',
    mg1: 'max-maglev-inlined-bytecode-size', mge: 'max-maglev-eager-inlined-bytecode-size',
};
const SIX = [['small', 30], ['hn', 75], ['one', 460], ['mgs', 27], ['mg1', 100], ['mge', 30]];
function listing(entries) {
    let s = '';
    for (const [k, v] of entries) s += `  --${NAMES[k]} (a limit)\n        type: int  default: --${NAMES[k]}=${v}\n`;
    return s;
}
const H = '[generated bytecode for function: add (0x1 <SharedFunctionInfo add>)]\nBytecode length: 6\n';
const REAL = (tool) => { // the real tool, resolved from the PATH that has no shim (law 7)
    const r = capSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8', env: ENV }, 10000, `command -v ${tool}`);
    assert.equal(r.status, 0, `command -v ${tool}`);
    return r.stdout.trim();
};

// A fake node. opts: v8 = the --v8-options listing; failSecond = the 2nd --v8-options exits 1; failVersionOnEnv = exit 7
// at --version when NODE_OPTIONS or NODE_COMPILE_CACHE is set; failV8OnEnv = same at --v8-options.
function fakeNode(dir, { v8 = listing(SIX), failSecond = false, failVersionOnEnv = false, failV8OnEnv = false, failV8 = false, pad = false } = {}) {
    writeFileSync(join(dir, 'v8.txt'), v8);
    // pad: > the 64 KB pipe buffer, so a tee writing to an already-exited tr certainly meets EPIPE / SIGPIPE
    writeFileSync(join(dir, 'trace.txt'), pad ? H + 'x\n'.repeat(200000) : H);
    const envbad = '[ -n "${NODE_OPTIONS+x}" ] || [ -n "${NODE_COMPILE_CACHE+x}" ]';
    const sh = `#!/bin/sh
case "$1" in
  --version) ${failVersionOnEnv ? `if ${envbad}; then exit 7; fi;` : ''} echo v26.8.2; exit 0 ;;
  --v8-options)
    ${failV8OnEnv ? `if ${envbad}; then exit 7; fi` : ''}
    ${failV8 ? 'exit 1' : ''}
    n=0; [ -f ${JSON.stringify(join(dir, 'cnt'))} ] && n=$(cat ${JSON.stringify(join(dir, 'cnt'))})
    n=$((n + 1)); echo $n > ${JSON.stringify(join(dir, 'cnt'))}
    ${failSecond ? 'if [ "$n" -ge 2 ]; then exit 1; fi' : ''}
    cat ${JSON.stringify(join(dir, 'v8.txt'))}; exit 0 ;;
esac
cat ${JSON.stringify(join(dir, 'trace.txt'))}
exit \${FAKE_RC:-0}
`;
    const p = join(dir, 'node');
    writeFileSync(p, sh);
    chmodSync(p, 0o755);
    return p;
}
function shim(dir, tool) { // tee / tr: copies through the real tool, then exits 1
    const sd = join(dir, 'shims');
    mkdirSync(sd, { recursive: true });
    const p = join(sd, tool);
    // tee is also bb's report writer (say -> tee report.txt): only the raw/ copy of a probe fails, the rest passes through
    if (tool === 'tr-now') { // exits at once without reading: the upstream tee gets SIGPIPE
        writeFileSync(join(sd, 'tr'), '#!/bin/sh\nexit 1\n'); chmodSync(join(sd, 'tr'), 0o755); return sd;
    }
    if (tool === 'awk-now') { // exits 4 at once, before reading: tr and tee meet SIGPIPE
        writeFileSync(join(sd, 'awk'), `#!/bin/sh\ncase "$2" in fn=*) exit 4 ;; esac\nexec ${JSON.stringify(REAL('awk'))} "$@"\n`);
        chmodSync(join(sd, 'awk'), 0o755); return sd;
    }
    if (tool === 'awk4') { // the probe's COUNT_AWK call (-v fn=...) exits 4; every other awk call is the real one
        writeFileSync(join(sd, 'awk'), `#!/bin/sh\ncase "$2" in fn=*) cat >/dev/null; exit 4 ;; esac\nexec ${JSON.stringify(REAL('awk'))} "$@"\n`);
        chmodSync(join(sd, 'awk'), 0o755); return sd;
    }
    const tail = tool === 'tee' ? 'case "$*" in */raw/*) exit 1 ;; esac\nexit $rc' : 'exit 1';
    writeFileSync(p, `#!/bin/sh\n${JSON.stringify(REAL(tool))} "$@"\nrc=$?\n${tail}\n`);
    chmodSync(p, 0o755);
    return sd;
}

// One gate run: --max add=10 against the fake. o: { shimTool, withOut, fakeRc, node opts, env }
function gate(script, o = {}) {
    const dir = priv();
    const node = fakeNode(dir, o);
    const env = Object.assign(cleanEnv(), o.env || {});   // cleanEnv strips NODE_OPTIONS: add the row's vars after
    if (o.fakeRc !== undefined) env.FAKE_RC = String(o.fakeRc);
    if (o.shimTool) env.PATH = shim(dir, o.shimTool) + ':' + env.PATH;
    const args = ['--node', node, '--max', 'add=10', '--node-version', 'v26.8.2'];
    if (o.withOut) args.push('--out', join(dir, 'o'));
    args.push(join(HERE, 'fixtures', 'bytecode-budget', 'node-26.8.2', 'driver.mjs'));
    const r = capSync('bash', [script, ...args], { encoding: 'utf8', env, cwd: dir }, 60000, 'bytecode-budget.sh fillers run');
    return { r, text: r.stdout + r.stderr, dir };
}
const lines = (t, re) => t.split('\n').filter((l) => re.test(l));

function variant(name, from, to, src = BB) { // a copy of a root with ONE exact edit
    const text = readFileSync(src, 'utf8');
    const n = text.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
    const p = join(priv(), name.replace(/[^a-z0-9.-]/gi, '_') + '.sh');
    writeFileSync(p, text.replace(from, () => to));
    chmodSync(p, 0o755);
    return p;
}

// ---- assertion 1 ----
const R1 = (t) => new RegExp(`^ *add: NO-VERDICT -- cannot read driver output in run 1 \\(${t} exited 1\\)$`, 'm');
for (const withOut of [true, false]) {
    const tool = withOut ? 'tee' : 'tr';
    test(`bb-fillers A1 live ${tool} shim (driver 0${withOut ? ', --out' : ''}): rc 2, "cannot read driver output ... (${tool} exited 1)"`, { skip }, () => {
        const g = gate(BB, { shimTool: tool, withOut });
        assert.equal(g.r.status, 2, g.text);
        assert.equal(lines(g.text, R1(tool)).length, 1, g.text);
        assert.match(g.text, /VERDICT NO-VERDICT/);
    });
    test(`bb-fillers A1 twin ${BEFORE} ${tool} shim: "driver exited 1 in run 1", not the tool's name`, { skip: hskip }, () => {
        histGate(have);
        const g = gate(frozen['bytecode-budget.sh'], { shimTool: tool, withOut });
        assert.match(g.text, /^ *add: NO-VERDICT -- driver exited 1 in run 1$/m, g.text);
        assert.doesNotMatch(g.text, /cannot read driver output/);
    });
}
test('bb-fillers A1 control FAKE_RC=9 alone: "driver exited 9" on live and on the old build', { skip: hskip }, () => {
    histGate(have);
    for (const root of [BB, frozen['bytecode-budget.sh']]) {
        const g = gate(root, { fakeRc: 9 });
        assert.equal(g.r.status, 2, g.text);
        assert.match(g.text, /^ *add: NO-VERDICT -- driver exited 9 in run 1$/m, g.text);
        assert.doesNotMatch(g.text, /cannot read driver output/);
    }
});
const ARMS = 'if [[ "$rc" == *:* ]]; then JWHY="cannot read driver output in run $k (${rc%%:*} exited ${rc#*:})"; return 0; fi\n'
    + '    if [[ "$rc" != 0 ]]; then JWHY="driver exited $rc in run $k"; return 0; fi\n';
const SWAPPED = 'if [[ "$rc" != 0 ]]; then JWHY="driver exited $rc in run $k"; return 0; fi\n'
    + '    if [[ "$rc" == *:* ]]; then JWHY="cannot read driver output in run $k (${rc%%:*} exited ${rc#*:})"; return 0; fi\n';
test('bb-fillers A1 tee shim + FAKE_RC=9 names tee; the swapped-arm mutant says "driver exited" and dies', { skip }, () => {
    const g = gate(BB, { shimTool: 'tee', withOut: true, fakeRc: 9 });
    assert.equal(g.r.status, 2, g.text);
    assert.equal(lines(g.text, R1('tee')).length, 1, g.text);
    const m = gate(variant('A1-swapped-arms', ARMS, SWAPPED), { shimTool: 'tee', withOut: true, fakeRc: 9 });
    assert.equal(lines(m.text, R1('tee')).length, 0, 'the mutant must NOT name tee (else the row has no teeth)\n' + m.text);
    assert.match(m.text, /driver exited tee:1 in run 1/, m.text);
});

// precedence awk > tr > tee: a tr that exits at once (tee then dies of SIGPIPE, 141) must name tr, never tee
const PREC = 'elif [[ $r != 0 ]]; then rc="tr:$r"; elif [[ -n $t && $t != 0 ]]; then rc="tee:$t"; else';
const PREC_SWAP = 'elif [[ -n $t && $t != 0 ]]; then rc="tee:$t"; elif [[ $r != 0 ]]; then rc="tr:$r"; else';
test('bb-fillers A1 precedence: tr exits at once with --out (tee gets SIGPIPE) -> names tr; the tee-before-tr mutant names tee and dies', { skip }, () => {
    const g = gate(BB, { shimTool: 'tr-now', withOut: true, pad: true });
    assert.equal(g.r.status, 2, g.text);
    assert.equal(lines(g.text, R1('tr')).length, 1, g.text);
    const m = gate(variant('A1-tee-before-tr', PREC, PREC_SWAP), { shimTool: 'tr-now', withOut: true, pad: true });
    assert.equal(lines(m.text, R1('tr')).length, 0, 'mutant must not name tr\n' + m.text);
    assert.match(m.text, /cannot read driver output in run 1 \(tee exited \d+\)/, m.text);
});
test('bb-fillers A1 awk shim exits 4 -> rc 2 "(awk exited 4)"; control driver rc 9 alone -> "driver exited 9"', { skip }, () => {
    const g = gate(BB, { shimTool: 'awk4' });
    assert.equal(g.r.status, 2, g.text);
    assert.match(g.text, /^ *add: NO-VERDICT -- cannot read driver output in run 1 \(awk exited 4\)$/m, g.text);
    const c = gate(BB, { fakeRc: 9 });
    assert.match(c.text, /^ *add: NO-VERDICT -- driver exited 9 in run 1$/m, c.text);
});
// precedence awk > tr: awk exits at once, so tr dies of SIGPIPE too; the order must name awk
const PREC2 = 'if [[ $a != 0 ]]; then rc="awk:$a"; elif [[ $r != 0 ]]; then rc="tr:$r"; elif';
const PREC2_SWAP = 'if [[ $r != 0 ]]; then rc="tr:$r"; elif [[ $a != 0 ]]; then rc="awk:$a"; elif';
test('bb-fillers A1 precedence: awk exits at once (tr gets SIGPIPE) -> names awk; the tr-before-awk mutant names tr and dies', { skip }, () => {
    const g = gate(BB, { shimTool: 'awk-now', pad: true });
    assert.equal(g.r.status, 2, g.text);
    assert.match(g.text, /^ *add: NO-VERDICT -- cannot read driver output in run 1 \(awk exited 4\)$/m, g.text);
    const m = gate(variant('A1-tr-before-awk', PREC2, PREC2_SWAP), { shimTool: 'awk-now', pad: true });
    assert.doesNotMatch(m.text, /\(awk exited/, m.text);
    assert.match(m.text, /\(tr exited [0-9]+\)/, m.text);
});
// m1: the `*:*` judge arm removed -> the tee row sees "driver exited tee:1" (a row above); pinned here by name
test('bb-fillers A1 mutant m1 (the *:* judge arm removed) dies at the tee row', { skip }, () => {
    const m = gate(variant('m1-no-colon-arm', ARMS.split('\n')[0] + '\n    ', ''), { shimTool: 'tee', withOut: true });
    assert.equal(lines(m.text, R1('tee')).length, 0, m.text);
    assert.match(m.text, /driver exited tee:1 in run 1/, m.text);
});

// ---- assertion 2 ----
const NOTE = /^NOTE {4}limits/;
const noteKeys = (t) => {
    const l = lines(t, NOTE);
    assert.equal(l.length, 1, `exactly one NOTE limits line\n${t}`);
    return l[0].slice(l[0].lastIndexOf('):') + 2).trim().split(/\s+/).sort();
};
test('bb-fillers A2 live: a listing of just the six -> 0 "NOTE    limits" lines', { skip }, () => {
    const g = gate(BB, { v8: listing(SIX) });
    assert.equal(g.r.status, 0, g.text);
    assert.equal(lines(g.text, NOTE).length, 0, g.text);
});
test(`bb-fillers A2 twin ${BEFORE}: the same listing names exactly the 3 unused keys`, { skip: hskip }, () => {
    histGate(have);
    const g = gate(frozen['bytecode-budget.sh'], { v8: listing(SIX) });
    assert.deepEqual(noteKeys(g.text), [
        'max-inlined-bytecode-size-cumulative=920', 'max-maglev-inlined-bytecode-size-cumulative=920',
        'reserve-inline-budget-scale-factor=1.2']);
});
const MINUS_SMALL = SIX.filter(([k]) => k !== 'small');
test('bb-fillers A2 control: missing max-inlined-bytecode-size-small -> NOTE names only =30; mutant ASSUMED="" dies', { skip }, () => {
    const g = gate(BB, { v8: listing(MINUS_SMALL) });
    assert.deepEqual(noteKeys(g.text), ['max-inlined-bytecode-size-small=30'], g.text);
    const m = gate(variant('A2-assumed-empty', 'ASSUMED=$a', 'ASSUMED=""'), { v8: listing(MINUS_SMALL) });
    assert.equal(m.r.status, 0, m.text);
    assert.equal(lines(m.text, NOTE).length, 0, 'the mutant drops the real NOTE: the control must see it gone\n' + m.text);
    // m6: the filter case widened to a prefix (max-inlined-bytecode-size*) also swallows the similar key ...-small=30
    const w = gate(variant('m6-prefix-filter', 'max-inlined-bytecode-size-cumulative=*|', 'max-inlined-bytecode-size*|'), { v8: listing(MINUS_SMALL) });
    assert.equal(w.r.status, 0, w.text);
    assert.equal(lines(w.text, NOTE).length, 0, 'm6 must lose the =30 NOTE (so the control kills it)\n' + w.text);
});

// ---- assertion 3 ----
// lib/v8limits.sh under `set -euo pipefail` (bb's own mode), a die stub, the shim exits 7 on either env var.
function sourceLib(lib, nodeOpts, env) {
    const dir = priv();
    const node = fakeNode(dir, nodeOpts);
    const script = `set -euo pipefail\ndie() { echo "DIE: $*"; exit 3; }\nNODE_BIN=${JSON.stringify(node)}; V8_EXTRA=()\n`
        + `source ${JSON.stringify(PROBE_LIB)}\nsource ${JSON.stringify(lib)}\necho "TF_ONE=$TF_ONE"\n`;
    return capSync('bash', ['-c', script], { encoding: 'utf8', env: Object.assign(cleanEnv(), env), cwd: dir }, 30000, 'v8limits source');
}
for (const [label, env] of [['NODE_OPTIONS', { NODE_OPTIONS: '--no-warnings' }], ['NODE_COMPILE_CACHE', { NODE_COMPILE_CACHE: '/nonexistent-cc' }]]) {
    test(`bb-fillers A3 lib live: ${label} set, shim exits 7 on it -> stripped, TF_ONE=460`, { skip }, () => {
        const r = sourceLib(LIB, { failV8OnEnv: true }, env);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /^TF_ONE=460$/m);
    });
    test(`bb-fillers A3 lib twin ${BEFORE}: ${label} set -> exits 7 with no die text, no TF_ONE`, { skip: hskip }, () => {
        histGate(have);
        const r = sourceLib(frozen['lib/v8limits.sh'], { failV8OnEnv: true }, env);
        assert.equal(r.status, 7, r.stdout + r.stderr);
        assert.doesNotMatch(r.stdout + r.stderr, /DIE:/);
        assert.doesNotMatch(r.stdout, /TF_ONE/);
    });
    test(`bb-fillers A3 lib mutant: the ${label} strip dropped -> exit 7 / the die stub fires, never TF_ONE=460`, { skip }, () => {
        const from = `-u ${label} `;
        const text = readFileSync(LIB, 'utf8');
        assert.equal(text.split(from).length - 1, 1, 'anchor once');
        const p = join(priv(), 'v8limits-mut.sh');
        writeFileSync(p, text.replace(from, () => ''));
        const r = sourceLib(p, { failV8OnEnv: true }, env);
        assert.doesNotMatch(r.stdout, /TF_ONE=460/, r.stdout + r.stderr);
        assert.equal(r.status, 3, r.stdout + r.stderr); assert.match(r.stdout, /^DIE: cannot run /m);
    });
}
test('bb-fillers A3 lib live: --v8-options exiting 1 -> the die stub says "cannot run <bin> --v8-options"', { skip }, () => {
    const r = sourceLib(LIB, { failV8: true }, {});
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout, /^DIE: cannot run .*\/node --v8-options$/m);
    // m9: the `|| die` removed -> a silent pipefail exit, no die text
    const from = ' || die "cannot run $NODE_BIN --v8-options"';
    const text = readFileSync(LIB, 'utf8');
    assert.equal(text.split(from).length - 1, 1, 'anchor once');
    const p = join(priv(), 'v8limits-m9.sh');
    writeFileSync(p, text.replace(from, () => ''));
    const m = sourceLib(p, { failV8: true }, {});
    assert.doesNotMatch(m.stdout, /DIE:/, m.stdout + m.stderr);
    assert.equal(m.status, 1, m.stdout + m.stderr);
});
test('bb-fillers A3 bb live: the second --v8-options exits 1 -> rc 2, one "cannot run", 0 "unexpected error"', { skip }, () => {
    const g = gate(BB, { failSecond: true });
    assert.equal(g.r.status, 2, g.text);
    assert.equal(lines(g.text, /cannot run .* --v8-options/).length, 1, g.text);
    assert.equal(lines(g.text, /unexpected error/).length, 0, g.text);
    // m9 on the built root: `|| die` removed -> "unexpected error", no "cannot run"
    const m = gate(variant('m9-bb-no-die', ' || die "cannot run $NODE_BIN --v8-options"', ''), { failSecond: true });
    assert.equal(lines(m.text, /cannot run/).length, 0, m.text);
    assert.equal(lines(m.text, /unexpected error/).length, 1, m.text);
});
test(`bb-fillers A3 bb twin ${BEFORE}: the same shim -> one "unexpected error", 0 "cannot run" (the reverse)`, { skip: hskip }, () => {
    histGate(have);
    const g = gate(frozen['bytecode-budget.sh'], { failSecond: true });
    assert.equal(lines(g.text, /unexpected error/).length, 1, g.text);
    assert.equal(lines(g.text, /cannot run/).length, 0, g.text);
});
const TOPLINE = 'unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: no node spawn sees one\n';
for (const [label, env] of [['NODE_OPTIONS', { NODE_OPTIONS: '--no-warnings' }], ['NODE_COMPILE_CACHE', { NODE_COMPILE_CACHE: '/nonexistent-cc' }]]) {
    test(`bb-fillers A3 bb live minus TOPLINE: ${label} set, shim exits 7 at --version only -> the --version read is stripped, rc 0`, { skip }, () => {
        const g = gate(variant('A3-minus-topline', TOPLINE, ''), { failVersionOnEnv: true, env });
        assert.equal(g.r.status, 0, g.text);
        assert.doesNotMatch(g.text, /cannot run/);
    });
    // the old --version read already stripped NODE_OPTIONS (only NODE_COMPILE_CACHE is new): its twin is the cache row
    if (label === 'NODE_COMPILE_CACHE') test(`bb-fillers A3 bb twin ${BEFORE} minus TOPLINE: ${label} set -> dies "cannot run ... --version"`, { skip: hskip }, () => {
        histGate(have);
        const old = variant('A3-old-minus-topline', TOPLINE, '', frozen['bytecode-budget.sh']);
        const g = gate(old, { failVersionOnEnv: true, env });
        assert.match(g.text, /cannot run .* --version/, g.text);
        assert.notEqual(g.r.status, 0);
    });
}
