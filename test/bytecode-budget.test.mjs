// test/bytecode-budget.test.mjs -- ../bytecode-budget.sh: self-test, mutants, gate rows (fake node), live rows.
// Oracle: .handoff/PLAN-phase2.md ASSERTIONS A2-A5, not the implementation. Expected lengths come from the
// fixture README census (add 6, mid 211, big 628, read 6,5,6,6, dup 6,19, lazy none), not from a script run.
import { test, after } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync, mkdirSync, cpSync, existsSync, appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'bytecode-budget.sh');
const FIX = join(HERE, 'fixtures', 'bytecode-budget', 'node-26.8.2');
const DRIVER = join(FIX, 'driver.mjs');
const C = 42;         // self-test ok lines without --fixtures (B2 final 686de5bf; with --fixtures C + 24 = 66)
const F = 24;         // fixtures-only checks (plan TASK 4: 13 + 9 + 1 + 1)
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

function run(path, args, opts = {}) {
    return spawnSync('bash', [path, ...args], { encoding: 'utf8', timeout: 120000, ...opts });
}
function okCount(out) { return (out.match(/^ok {3}/gm) || []).length; }

// A copy of the script with ONE exact edit (anchor must match exactly once).
function variant(dir, name, from, to) {
    const src = readFileSync(SCRIPT, 'utf8');
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `mutant ${name}: anchor must match exactly once, matched ${n}`);
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src.replace(from, () => to));
    chmodSync(p, 0o755);
    return p;
}

// Same, but replaces EVERY occurrence (at least one).
function variantAll(dir, name, from, to) {
    const src = readFileSync(SCRIPT, 'utf8');
    assert.ok(src.includes(from), `mutant ${name}: anchor not found`);
    const p = join(dir, `${name}.sh`);
    writeFileSync(p, src.split(from).join(to));
    chmodSync(p, 0o755);
    return p;
}

// ---- A2: self-test ----
test('bytecode-budget --self-test: exactly C ok, none failed', { skip }, () => {
    const r = run(SCRIPT, ['--self-test']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^self-test: all checks passed$/m);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), C);
});

test('bytecode-budget --self-test --fixtures: exactly C+24 ok', { skip }, () => {
    const r = run(SCRIPT, ['--self-test', '--fixtures', FIX]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /^FAIL /m);
    assert.equal(okCount(r.stdout), C + F);
});

test('bytecode-budget --self-test --fixtures: a copy without dup.txt exits 1', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-nodup-'));
    try {
        cpSync(FIX, dir, { recursive: true });
        rmSync(join(dir, 'dup.txt'));
        const r = run(SCRIPT, ['--self-test', '--fixtures', dir]);
        assert.equal(r.status, 1, r.stdout + r.stderr);
        assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes('fixture dup.txt')), r.stdout);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

const MUTANTS = [
    ['exact-name-to-prefix', 'want = (s == fn); n += want', 'want = (index(s, fn) == 1); n += want', 'count: exact name'],
    ['deduped-lengths', '{ good++; out = out (out == "" ? "" : ",") ($3 + 0) }',
        '{ good++; if (!(($3 + 0) in seen)) out = out (out == "" ? "" : ",") ($3 + 0); seen[$3 + 0] = 1 }',
        'same-name functions keep every length'],
    ['want-not-reset-at-foreign-header', 'want = (s == fn); n += want', 'if (s == fn) want = 1; n += (s == fn)', 'same-name functions keep every length'],
    ['bad-header-ignored', 'bad = n - good;', 'bad = 0;', 'not followed by'],
    ['gt-to-ge', '(( l > max ))', '(( l >= max ))', 'a length equal to the max is WITHIN'],
    ['version-check-off', 'if [[ -n "$WANT_VER" && "$GOT_VER" != "$WANT_VER" ]]; then', 'if false; then', 'node version mismatch'],
    ['null-control-off', 'if [[ "$line" != "$first" ]]; then JWHY="null control', 'if false; then JWHY="null control', 'null control: run 2 with a changed length'],
    ['fn-regex-allows-dot', "FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*(", "FN_RE='^[A-Za-z_$][A-Za-z0-9_$.]*(", 'fn names: '],
    ['worst-order-swapped', 'for a in NO-VERDICT OVER;', 'for a in OVER NO-VERDICT;', 'worst: NO-VERDICT > OVER > WITHIN'],
];
for (const [name, from, to, failing] of MUTANTS) {
    test(`bytecode-budget --self-test MUST FAIL on mutant ${name}`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), `bb-${name}-`));
        try {
            const r = run(variant(dir, name, from, to), ['--self-test', '--fixtures', FIX]);
            assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
            assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes(failing)),
                `mutant ${name}: expected a FAIL line naming "${failing}"\n${r.stdout}`);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// ---- fake node ----
// Answers --version, --v8-options (fixture excerpt), and --print-bytecode calls (cats fixture <fn>.txt).
// Every call appends its argv (one line) to LOG; bytecode calls count per fn in COUNT.<fn>.
// opts: version, verRc (exit code for --version), rc (exit code for bytecode calls), run2 ({fn: 'from:to'} sed on call >= 2).
function fakeNode(dir, opts = {}) {
    const version = opts.version || 'v26.8.2';
    const rc = opts.rc || 0;
    const verRc = opts.verRc || 0;      // exit code of the --version call
    const log = join(dir, 'argv.log');
    const run2 = opts.run2 || {};
    const run2Lines = Object.entries(run2).map(([fn, ft]) => `[ "$fn" = ${JSON.stringify(fn)} ] && SED='s/Bytecode length: ${ft.split(':')[0]}$/Bytecode length: ${ft.split(':')[1]}/'`).join('\n');
    const sh = `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) [ -z "\${NODE_OPTIONS+x}" ] || exit 7; echo ${version}; exit ${verRc} ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
[ -z "\${NODE_OPTIONS+x}" ] || exit 7
pwd >> ${JSON.stringify(join(dir, 'pwd.log'))}
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
f=$(printf '%s' "$fn" | tr ' ' '-')
[ -f ${JSON.stringify(FIX)}/"$f.txt" ] || f=nosuchfn
cnt=${JSON.stringify(dir)}/COUNT."$f"
n=0; [ -f "$cnt" ] && n=$(cat "$cnt"); n=$((n+1)); echo $n > "$cnt"
SED=
if [ "$n" -ge 2 ]; then
:
${run2Lines}
fi
if [ -n "$SED" ]; then sed "$SED" ${JSON.stringify(FIX)}/"$f.txt"; else cat ${JSON.stringify(FIX)}/"$f.txt"; fi
exit ${rc}
`;
    const p = join(dir, 'node');
    writeFileSync(p, sh);
    chmodSync(p, 0o755);
    return { path: p, log, pwds: () => (existsSync(join(dir, 'pwd.log')) ? readFileSync(join(dir, 'pwd.log'), 'utf8').split('\n').filter(Boolean) : []), spawns: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

function gate(max, extra = [], fopts = {}, script = SCRIPT, ropts = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    try {
        const f = fakeNode(dir, fopts);
        const r = run(script, ['--node', f.path, '--max', max, ...extra, DRIVER], ropts);
        return { r, spawns: f.spawns(), pwds: f.pwds() };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
const NV = ['--node-version', 'v26.8.2'];

// ---- A3: gate rows (fake node) ----
const GATE_ROWS = [
    ['dup=19 within (both matches <= 19)', 'dup=19', NV, {}, 0, /VERDICT WITHIN/],
    ['dup=18 over (19 > 18, any match gates)', 'dup=18', NV, {}, 1, /VERDICT OVER/],
    ['lazy=100: zero matches is NO-VERDICT', 'lazy=100', NV, {}, 2, /VERDICT NO-VERDICT/],
    ['version v26.8.1 expectation with mid=1: NO-VERDICT, never OVER', 'mid=1', ['--node-version', 'v26.8.1'], {}, 2, /VERDICT NO-VERDICT/],
    ['fn Store.read is refused (qualified names never match)', 'Store.read=1', NV, {}, 2, /fn must be a short V8 function name/],
    // C4: exact version match; a prefix-matching check would pass v26.8.2-pre against v26.8.2
    ['node v26.8.2-pre vs expectation v26.8.2: NO-VERDICT (exact match, not prefix)', 'mid=211', NV, { version: 'v26.8.2-pre' }, 2, /mid: NO-VERDICT -- node version mismatch: /],
    ['missing --node-version in gate mode is usage', 'add=6', [], {}, 2, null],
    ['fake node exits 1: NO-VERDICT', 'add=6', NV, { rc: 1 }, 2, /VERDICT NO-VERDICT/],
    ['run 2 prints length 212 for mid: NO-VERDICT', 'mid=211', NV, { run2: { mid: '211:212' } }, 2, /VERDICT NO-VERDICT/],
];
for (const [name, max, extra, fopts, code, re] of GATE_ROWS) {
    test(`bytecode-budget gate (fake node): ${name}`, { skip }, () => {
        const { r } = gate(max, extra, fopts);
        assert.equal(r.status, code, r.stdout + r.stderr);
        if (re) assert.match(r.stdout + r.stderr, re);
    });
}

test('bytecode-budget report (fake node): read shows 4 match(es): 6,5,6,6', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'read', DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /read: 4 match\(es\): 6,5,6,6/);
        assert.match(r.stdout, /VERDICT REPORTED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// control: without FINAL=1 before the verdict the OVER row exits 2 (proves the 1 comes from FINAL)
test('bytecode-budget gate control: no FINAL=1 before the verdict turns OVER into exit 2', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-ctl-'));
    try {
        const p = variant(dir, 'no-final', 'FINAL=1\ncase "$VERDICT"', 'case "$VERDICT"');
        const { r } = gate('dup=18', NV, {}, p);
        assert.equal(r.status, 2, r.stdout + r.stderr);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// C3/C4 teeth: each mutant of the built script must be caught by the gate rows.
test('bytecode-budget teeth: a script that leaks NODE_OPTIONS to the probe is caught (fake node exits 7 -> exit 2)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-leak-'));
    try {
        const env = { ...process.env, NODE_OPTIONS: '--no-warnings' };
        const good = gate('add=6', NV, {}, SCRIPT, { env });
        assert.equal(good.r.status, 0, good.r.stdout + good.r.stderr);
        const p = variantAll(dir, 'leak-node-options', 'env -u NODE_OPTIONS ', '');
        const bad = gate('add=6', NV, {}, p, { env });
        assert.equal(bad.r.status, 2, 'mutant survived: ' + bad.r.stdout + bad.r.stderr);
        // the fake node's --version arm exits 7 too, so the script dies at the version probe
        assert.match(bad.r.stdout + bad.r.stderr, /cannot run .* --version|VERDICT NO-VERDICT/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bytecode-budget teeth: a prefix-matching version check lets v26.8.2-pre through (the exact check does not)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-vpre-'));
    try {
        const p = variant(dir, 'version-prefix', '"$GOT_VER" != "$WANT_VER" ]]', '"$GOT_VER" != "$WANT_VER"* ]]');
        const bad = gate('mid=211', NV, { version: 'v26.8.2-pre' }, p);
        assert.equal(bad.r.status, 0, 'expected the prefix mutant to pass wrongly: ' + bad.r.stdout + bad.r.stderr);
        const good = gate('mid=211', NV, { version: 'v26.8.2-pre' });
        assert.equal(good.r.status, 2, good.r.stdout + good.r.stderr);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- C1/C6/C8: refusals exit 2 with a message and ZERO node spawns ----
const REFUSALS = [
    ['repeated --max', ['--max', 'mid=1', '--max', 'add=6', ...NV], 'given twice (give one comma list)'],
    ['repeated --fn', ['--fn', 'a', '--fn', 'b'], 'given twice (give one comma list)'],
    ['repeated --max=v form', ['--max=mid=1', '--max=add=6', ...NV], 'given twice (give one comma list)'],
    ['repeated --fn=v then --fn', ['--fn=a', '--fn', 'b'], 'given twice (give one comma list)'],
    ['newline in --max', ['--max', 'add=6\nmid=1', ...NV], 'a newline is not allowed'],
    ['newline in --fn', ['--fn', 'add\nmid'], 'a newline is not allowed'],
    ['newline in --v8-flags', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size=5\n--x'], 'a newline is not allowed'],
    ['v8 budget flag =abc', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size=abc'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 budget flag without =N', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 budget flag with 10 digits', ['--fn', 'add', '--v8-flags', '--max-inlined-bytecode-size=1234567890'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 reserve flag =abc', ['--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=abc'], 'needs =X (a decimal number'],
    ['v8 reserve flag =.5', ['--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=.5'], 'needs =X (a decimal number'],
    // V8 negates a flag with "no" + optional - or _; the negated budget flags are refused (R2)
    ['v8 negated --no-max-inlined-bytecode-size=5', ['--fn', 'add', '--v8-flags', '--no-max-inlined-bytecode-size=5'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 negated --no_max_inlined_bytecode_size=5', ['--fn', 'add', '--v8-flags', '--no_max_inlined_bytecode_size=5'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 negated --nomax-inlined-bytecode-size=5', ['--fn', 'add', '--v8-flags', '--nomax-inlined-bytecode-size=5'], 'needs =N (an integer of 1..9 digits)'],
    ['v8 negated --no-reserve-inline-budget-scale-factor=1.5', ['--fn', 'add', '--v8-flags', '--no-reserve-inline-budget-scale-factor=1.5'], 'needs =X (a decimal number'],
    ['v8 negated --noreserve-inline-budget-scale-factor=1.5', ['--fn', 'add', '--v8-flags', '--noreserve-inline-budget-scale-factor=1.5'], 'needs =X (a decimal number'],
    ['stray trailing comma in --max', ['--max', 'add=6,', ...NV], 'empty entry (stray comma)'],
    ['stray leading comma in --fn', ['--fn', ',add'], 'empty entry (stray comma)'],
    ['stray double comma in --fn', ['--fn', 'add,,mid'], 'empty entry (stray comma)'],
    ['--self-test --runs', ['--self-test', '--runs', '3'], '--self-test takes only --fixtures DIR'],
    ['--self-test --node', ['--self-test', '--node', 'X'], '--self-test takes only --fixtures DIR'],
    ['--self-test --v8-flags', ['--self-test', '--v8-flags', '--x'], '--self-test takes only --fixtures DIR'],
    // T-F1: an explicit empty separate value for any value option is refused, never read as "not given"
    ['empty --fixtures value', ['--self-test', '--fixtures', ''], 'needs a non-empty value'],
    ['empty --out value', ['--fn', 'add', '--out', ''], 'needs a non-empty value'],
    ['empty --fn value', ['--fn', ''], 'needs a non-empty value'],
    ['empty --max value', ['--max', '', ...NV], 'needs a non-empty value'],
    ['empty --node-version value', ['--fn', 'add', '--node-version', ''], 'needs a non-empty value'],
    ['empty --runs value', ['--fn', 'add', '--runs', ''], 'needs a non-empty value'],
    ['empty --node value', ['--fn', 'add', '--node', ''], 'needs a non-empty value', true],
    ['empty --v8-flags value', ['--fn', 'add', '--v8-flags', ''], 'needs a non-empty value'],
    // OPT-EQ F-a: an empty --opt= is an explicit empty value; it must not swallow the next argument
    ['empty --fn= value', ['--fn=', 'add'], 'needs a non-empty value'],
    ['empty --runs= value', ['--fn', 'add', '--runs=', '3'], 'needs a non-empty value'],
    ['empty --max= value', ['--max=', 'add=6', ...NV], 'needs a non-empty value'],
    // OPT-EQ F-b: a flag that takes no value refuses =value instead of dropping it
    ['--self-test=0', ['--self-test=0'], 'takes no value'],
    ['--help=x', ['--help=x'], 'takes no value'],
    ['blank --v8-flags value', ['--fn', 'add', '--v8-flags', ' '], 'needs at least one flag'],
    ['tab --v8-flags value', ['--fn', 'add', '--v8-flags', '\t'], 'needs at least one flag'],
    // T2: integer boundaries (2^30 is 10 digits; -0 is not digits; 2^64+2 wraps to 2)
    ['--max N = 2^30 (10 digits)', ['--max', 'add=1073741824', ...NV], 'N must be an integer of 1..9 digits'],
    ['--max N = -0', ['--max', 'add=-0', ...NV], 'N must be an integer of 1..9 digits'],
    // --runs 2^64+2: $((10#N)) wraps to 2; red on ^[0-9]{1,2}$ -> ^[0-9]+$ or {1,20}
    ['--runs 2^64+2 (wraps to 2)', ['--fn', 'add', '--runs', '18446744073709551618'], 'must be an integer in [2, 20]'],
];
for (const [name, args, msg, raw] of REFUSALS) {
    test(`bytecode-budget refusal: ${name} -> exit 2, "${msg}", 0 spawns`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-refuse-'));
        try {
            const f = fakeNode(dir);
            const st = args.some((a) => a.startsWith('--self-test'));
            const withDriver = st ? args : [...args, DRIVER];
            // fake node is both --node (non-self-test) and first on PATH (self-test), so any spawn is logged
            const pre = (st || raw) ? [] : ['--node', f.path];
            const r = run(SCRIPT, [...pre, ...withDriver], { env: { ...process.env, PATH: dir + ':' + process.env.PATH } });
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.ok((r.stdout + r.stderr).includes(msg), `expected "${msg}" in:\n${r.stdout}${r.stderr}`);
            assert.equal(f.spawns().length, 0, f.spawns().join('\n'));
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// T1: a V8 flag node rejects: every probe still runs (1 version + 1 limits + 2 fns x 3 runs = 8), NO-VERDICT exit 2
test('bytecode-budget: a V8 flag node rejects runs every probe: 2 + fns x runs spawns, NO-VERDICT', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rej-'));
    try {
        const f = fakeNode(dir, { rc: 9 });
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add,mid', '--runs', '3', '--v8-flags', '--bogus-flag', DRIVER]);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stdout, /^  add: NO-VERDICT -- driver exited 9 in run 1$/m);
        assert.equal(f.spawns().length, 8, f.spawns().join('\n'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// T3: a --node whose --version fails -> exit 2 after exactly that 1 spawn
test('bytecode-budget: a --node whose --version fails exits 2 "cannot run" after exactly 1 spawn', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-verfail-'));
    try {
        const f = fakeNode(dir, { verRc: 3 });
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', DRIVER]);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.ok((r.stdout + r.stderr).includes('cannot run'), r.stdout + r.stderr);
        assert.equal(f.spawns().length, 1, f.spawns().join('\n'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// OPT-EQ positive pin: the equals form works exactly like the separate form; a separate-form option
// follows it, so an EQ flag that is not reset per argument is red here
test('bytecode-budget: --fn=add (equals form) exits 0 REPORTED like --fn add', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-eq-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--fn=add', '--node', f.path, DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /VERDICT REPORTED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bytecode-budget: --v8-flags --reserve-inline-budget-scale-factor=1.5 (a decimal) runs', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-dec-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--v8-flags', '--reserve-inline-budget-scale-factor=1.5', DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /VERDICT REPORTED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bytecode-budget report mode: version mismatch says --node-version is <v>; gate mode says the maxima are for <v>', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-rv-'));
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'add', '--node-version', 'v26.8.1', DRIVER]);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.match(r.stdout, /NO-VERDICT -- node version mismatch: .* --version is v26\.8\.2, --node-version is v26\.8\.1/);
        const g = gate('mid=1', ['--node-version', 'v26.8.1']);
        assert.match(g.r.stdout, /--version is v26\.8\.2, the maxima are for v26\.8\.1/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// cwd contract: every traced run starts with cwd = the driver's directory
test('bytecode-budget: the driver runs with cwd = the driver directory', { skip }, () => {
    const { r, pwds } = gate('add=6', NV);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(pwds.length >= 2, String(pwds.length));
    for (const d of pwds) assert.equal(realpathSync(d), realpathSync(dirname(DRIVER)));
});

// ---- A4: spawns / retention ----
test('bytecode-budget: 3 fns x 2 runs = exactly 8 node spawns (1 version + 1 limits + 6 traces)', { skip }, () => {
    // NODE_OPTIONS is set: the fake node exits 7 on a bytecode call if the script leaks it
    const { r, spawns } = gate('add=6,mid=211,dup=19', NV, {}, SCRIPT, { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(spawns.length, 8, spawns.join('\n'));
    assert.equal(spawns.filter((l) => l.includes('--print-bytecode-filter=')).length, 6);
});

test('bytecode-budget: an invalid fn spawns nothing', { skip }, () => {
    const { r, spawns } = gate('add=6,bad.name=1', NV);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(spawns.length, 0, spawns.join('\n'));
});

test('bytecode-budget: 20 runs without --out leave a private TMPDIR empty', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-tmpdir-'));
    try {
        const f = fakeNode(dir);
        for (let i = 0; i < 20; i++) {
            const r = run(SCRIPT, ['--node', f.path, '--max', 'add=6', ...NV, DRIVER], { env: { ...process.env, TMPDIR: tmp } });
            assert.equal(r.status, 0, r.stdout + r.stderr);
        }
        assert.deepEqual(readdirSync(tmp), []);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); }
});

test('bytecode-budget --out DIR: report.txt + raw/ with exactly 6 files (3 fns x 2 runs)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const f = fakeNode(dir);
        // NODE_OPTIONS set: the fake node exits 7 if the script leaks it into a probe (teeth for `env -u` in the --out path)
        const r = run(SCRIPT, ['--node', f.path, '--max', 'add=6,mid=211,dup=19', ...NV, '--out', out, DRIVER], { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(existsSync(join(out, 'report.txt')));
        assert.equal(readdirSync(join(out, 'raw')).length, 6);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});

// ---- A5: live rows on the real node (read-only driver) ----
const LIVE = process.version === 'v26.8.2';
const liveSkip = skip || false;
test('bytecode-budget live: add=6,mid=211,dup=19 within on v26.8.2 (else NO-VERDICT 2)', { skip: liveSkip }, () => {
    const r = run(SCRIPT, ['--node', process.execPath, '--max', 'add=6,mid=211,dup=19', ...NV, DRIVER]);
    assert.equal(r.status, LIVE ? 0 : 2, r.stdout + r.stderr);
    if (!LIVE) assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
});
test('bytecode-budget live: mid=210 is OVER on v26.8.2 (else NO-VERDICT 2)', { skip: liveSkip }, () => {
    const r = run(SCRIPT, ['--node', process.execPath, '--max', 'add=6,mid=210,dup=19', ...NV, DRIVER]);
    assert.equal(r.status, LIVE ? 1 : 2, r.stdout + r.stderr);
    if (!LIVE) assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
});

// =====================================================================================================
// ---- P2G2 diff mode (--diff --fn LIST BEFORE AFTER). Oracle: .handoff/PLAN-phase2-g2.md A1 + ASSERTIONS A2-A5.
// The diff fake node answers --version / --v8-options like fakeNode, and serves a bytecode call from the
// capture "<fn with spaces -> ->.txt" in its CWD (the probe cds into the driver directory), so the
// BEFORE and AFTER driver directories can print different lengths. A fn with no capture file prints nothing
// (zero matches). Expected verdicts come from the plan, not from a run.
// =====================================================================================================
const BASE_COMMIT = 'b376a5a'; // its bytecode-budget.sh is a26e9f15, the last build without --diff
const baseSrc = spawnSync('git', ['-C', join(HERE, '..'), 'show', `${BASE_COMMIT}:bytecode-budget.sh`]);
const haveBase = baseSrc.status === 0 ? true : `git show ${BASE_COMMIT}:bytecode-budget.sh failed (shallow clone or no git)`;
let FROZEN_BASE = null;
if (haveBase === true) {
    assert.equal(createHash('sha256').update(baseSrc.stdout).digest('hex').slice(0, 8), 'a26e9f15', 'teeth base is not a26e9f15');
    const bd = mkdtempSync(join(tmpdir(), 'bb-base-'));
    FROZEN_BASE = join(bd, 'bytecode-budget.sh');
    writeFileSync(FROZEN_BASE, baseSrc.stdout); chmodSync(FROZEN_BASE, 0o755);
    after(() => rmSync(bd, { recursive: true, force: true }));
}

function capture(fn, lens) {
    return lens.map((n) => `[generated bytecode for function: ${fn} (0x1 <SharedFunctionInfo ${fn}>)]\nBytecode length: ${n}\nParameter count 1\n`).join('');
}
// spec: { before: { fn: [lens] }, after: { fn: [lens] } } -> dirs b/ and a/ each with driver.mjs + captures
function diffSetup(spec) {
    const dir = mkdtempSync(join(tmpdir(), 'bb-diff-'));
    const log = join(dir, 'argv.log');
    const sh = `#!/bin/sh
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  --version) [ -z "\${NODE_OPTIONS+x}" ] || exit 7; echo v26.8.2; exit 0 ;;
  --v8-options) cat ${JSON.stringify(join(FIX, 'v8-options-excerpt.txt'))}; exit 0 ;;
esac
[ -z "\${NODE_OPTIONS+x}" ] || exit 7
fn=
for a in "$@"; do case "$a" in --print-bytecode-filter=*) fn="\${a#--print-bytecode-filter=}" ;; esac; done
f=$(printf '%s' "$fn" | tr ' ' '-')
k=$(( $(cat "./.$f.k" 2>/dev/null || echo 0) + 1 )); echo "$k" > "./.$f.k"
if [ -f "./$f.$k.txt" ]; then cat "./$f.$k.txt"; elif [ -f "./$f.txt" ]; then cat "./$f.txt"; fi
exit 0
`;
    const node = join(dir, 'node');
    writeFileSync(node, sh); chmodSync(node, 0o755);
    for (const [side, key] of [['b', 'before'], ['a', 'after']]) {
        mkdirSync(join(dir, side));
        writeFileSync(join(dir, side, 'driver.mjs'), `// ${side} driver (fake node never runs it)\n`);
        for (const [fn, lens] of Object.entries(spec[key] || {})) writeFileSync(join(dir, side, `${fn.replace(/ /g, '-')}.txt`), capture(fn, lens));
        for (const [fn, lens] of Object.entries(spec[key + 'Run2'] || {})) writeFileSync(join(dir, side, `${fn.replace(/ /g, '-')}.2.txt`), capture(fn, lens));
    }
    return {
        dir, node, B: join(dir, 'b', 'driver.mjs'), A: join(dir, 'a', 'driver.mjs'),
        spawns: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
        done: () => rmSync(dir, { recursive: true, force: true }),
    };
}
function diffRun(spec, fns, script = SCRIPT, extra = [], ropts = {}) {
    const s = diffSetup(spec);
    try {
        const r = run(script, ['--diff', '--node', s.node, '--fn', fns, '--runs', '2', ...extra, s.B, s.A], ropts);
        return { r, spawns: s.spawns() };
    } finally { s.done(); }
}
const same = (fn, l) => ({ before: { [fn]: l }, after: { [fn]: l } });

// ---- A2 rows: [name, spec, fns, exit, regex, mutant-that-must-be-red] ----
const DIFF_ROWS = [
    ['mid 211|211 -> 0 SAME', { before: { mid: [211] }, after: { mid: [211] } }, 'mid', 0, /^VERDICT SAME$/m],
    ['mid 211|212 -> 1 DIFF with "before=1 after=0  211"', { before: { mid: [211] }, after: { mid: [212] } }, 'mid', 1, /^    before=1 after=0  211$/m],
    ['dup 6,19|19,6 -> 0 SAME (order-free; red on M1)', { before: { dup: [6, 19] }, after: { dup: [19, 6] } }, 'dup', 0, /dup: SAME/],
    ['6|6,6 -> 1 DIFF (multiplicity; red on M2)', { before: { dup: [6] }, after: { dup: [6, 6] } }, 'dup', 1, /dup: DIFF/],
    ['after count 0 -> 2 "after: no function named" (red on M3)', { before: { mid: [211] }, after: {} }, 'mid', 2, /mid: NO-VERDICT -- after: no function named/],
    ['before count 0 -> 2 "before: no function named"', { before: {}, after: { mid: [211] } }, 'mid', 2, /mid: NO-VERDICT -- before: no function named/],
    ['mid DIFF + lazy NO-VERDICT -> 2 (red on M4)', { before: { mid: [211] }, after: { mid: [212] } }, 'mid,lazy', 2, /VERDICT NO-VERDICT$/m],
    ['after run 2 differs -> 2 "after: null control" (red on M5)', { before: { mid: [211] }, after: { mid: [211] }, afterRun2: { mid: [212] } }, 'mid', 2, /^  mid: NO-VERDICT -- after: null control: run 2 /m],
    ['before run 2 differs -> 2 "before: null control" (red on M6)', { before: { mid: [211] }, after: { mid: [211] }, beforeRun2: { mid: [212] } }, 'mid', 2, /^  mid: NO-VERDICT -- before: null control: run 2 /m],
];
for (const [name, spec, fns, code, re] of DIFF_ROWS) {
    test(`bytecode-budget diff (fake node): ${name}`, { skip }, () => {
        const { r } = diffRun(spec, fns);
        assert.equal(r.status, code, r.stdout + r.stderr);
        assert.match(r.stdout, re);
    });
    test(`bytecode-budget diff teeth: [${name}] exits 2 "unknown option --diff" on the frozen a26e9f15 base`, { skip: skip || (haveBase === true ? false : haveBase) }, () => {
        const { r } = diffRun(spec, fns, FROZEN_BASE);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.ok((r.stdout + r.stderr).includes('unknown option --diff'), r.stdout + r.stderr);
    });
}
test('bytecode-budget diff: header lines name before / after with sha256/8 and mode diff', { skip }, () => {
    const { r } = diffRun(same('mid', [211]), 'mid');
    assert.match(r.stdout, /^before  \S+\/b\/driver\.mjs  sha256\/8 [0-9a-f]{8}$/m);
    assert.match(r.stdout, /^after   \S+\/a\/driver\.mjs  sha256\/8 [0-9a-f]{8}$/m);
    assert.match(r.stdout, /^mode    diff  runs 2 /m);
    assert.match(r.stdout, /^  mid: before 1 match\(es\): 211$/m);
    assert.match(r.stdout, /^  mid: after  1 match\(es\): 211$/m);
});

// Regression pins (green on the frozen base too, not red by design): 2 DRIVERs without --diff, gate --out raw/ 6 files.
// ---- A2 mutants of the BUILT file (each anchor exactly once; variant() asserts that) ----
const DIFF_MUTANTS = [
    ['M1-order-sensitive', 'if [[ "$MSB" == "$MSA" ]]; then', 'if [[ "$LB" == "$LA" ]]; then', 'dup 6,19|19,6 -> 0 SAME (order-free; red on M1)', 0, 1],
    ['M2-sort-u', `awk '{ print "*\\t" $0 }' | multiset; }`, `awk '{ print "*\\t" $0 }' | sort -u; }`, '6|6,6 -> 1 DIFF (multiplicity; red on M2)', 1, 0],
    ['M3-after-not-judged', 'judge "$fn" "" "${RA[@]}"; VA=$JV; WA=$JWHY', 'VA=$VB; WA=$WB', 'after count 0 -> 2 "after: no function named" (red on M3)', 2, 1],
    ['M4-diff-before-noverdict', 'if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT', 'if [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF', 'mid DIFF + lazy NO-VERDICT -> 2 (red on M4)', 2, 1],
    ['M5-after-null-control-off', 'judge "$fn" "" "${RA[@]}"; VA=$JV', 'judge "$fn" "" "${RA[0]}"; VA=$JV', 'after run 2 differs -> 2 "after: null control" (red on M5)', 2, 0],
    ['M6-before-null-control-off', 'judge "$fn" "" "${RB[@]}"; VB=$JV', 'judge "$fn" "" "${RB[0]}"; VB=$JV', 'before run 2 differs -> 2 "before: null control" (red on M6)', 2, 0],
];
for (const [mname, from, to, rowName, good, want] of DIFF_MUTANTS) {
    test(`bytecode-budget diff MUTANT ${mname}: its row turns red`, { skip }, () => {
        const row = DIFF_ROWS.find((x) => x[0] === rowName);
        const dir = mkdtempSync(join(tmpdir(), `bb-${mname}-`));
        try {
            const p = variant(dir, mname, from, to);
            const ok = diffRun(row[1], row[2]);
            assert.equal(ok.r.status, good, 'unmutated row must pass first: ' + ok.r.stdout + ok.r.stderr);
            const bad = diffRun(row[1], row[2], p);
            assert.equal(bad.r.status, want, `mutant ${mname} must exit ${want}: ` + bad.r.stdout + bad.r.stderr);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}
test('bytecode-budget diff control: a copy without the diff branch FINAL=1 turns the DIFF row into exit 2', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-nofinal-'));
    try {
        const p = variant(dir, 'diff-no-final', 'FINAL=1; case "$VERDICT" in SAME)', 'case "$VERDICT" in SAME)');
        const { r } = diffRun({ before: { mid: [211] }, after: { mid: [212] } }, 'mid', p);
        assert.equal(r.status, 2, r.stdout + r.stderr);
        assert.ok(r.stderr.includes('unexpected error (exit 1)'), r.stdout + r.stderr);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- A3: spawn budget + refusals (0 spawns) ----
test('bytecode-budget diff: --fn add,mid,dup x 2 runs = exactly 14 node spawns (1 version + 1 limits + 12 probes)', { skip }, () => {
    const spec = { before: { add: [6], mid: [211], dup: [6, 19] }, after: { add: [6], mid: [211], dup: [6, 19] } };
    // NODE_OPTIONS set: the fake exits 7 on any call if the script leaks it
    const { r, spawns } = diffRun(spec, 'add,mid,dup', SCRIPT, [], { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(spawns.length, 14, spawns.join('\n'));
    assert.equal(spawns.filter((l) => l.includes('--print-bytecode-filter=')).length, 12);
});
const DIFF_REFUSALS = [
    ['--diff with --max', (s) => ['--diff', '--max', 'add=6', ...NV, s.B, s.A], 'exclusive'],
    ['--diff with 1 DRIVER', (s) => ['--diff', '--fn', 'add', s.B], 'exactly two DRIVER'],
    ['--diff with 3 DRIVERs', (s) => ['--diff', '--fn', 'add', s.B, s.A, s.A], 'exactly two DRIVER'],
    ['--diff=x', (s) => ['--diff=x', '--fn', 'add', s.B, s.A], 'takes no value'],
    ['--self-test --diff', () => ['--self-test', '--diff'], '--self-test takes only --fixtures DIR'],
    ['--diff --diff', (s) => ['--diff', '--diff', '--fn', 'add', s.B, s.A], 'given twice'],
    ['2 DRIVERs without --diff', (s) => ['--fn', 'add', s.B, s.A], 'need exactly one DRIVER'],
];
for (const [name, mk, msg] of DIFF_REFUSALS) {
    test(`bytecode-budget diff refusal: ${name} -> exit 2, "${msg}", 0 spawns`, { skip }, () => {
        const s = diffSetup({ before: {}, after: {} });
        try {
            const args = mk(s);
            const pre = args.includes('--self-test') ? [] : ['--node', s.node];
            const r = run(SCRIPT, [...pre, ...args], { env: { ...process.env, PATH: s.dir + ':' + process.env.PATH } });
            assert.equal(r.status, 2, r.stdout + r.stderr);
            assert.ok((r.stdout + r.stderr).includes(msg), `expected "${msg}" in:\n${r.stdout}${r.stderr}`);
            assert.equal(s.spawns().length, 0, s.spawns().join('\n'));
        } finally { s.done(); }
    });
}
test('bytecode-budget diff MUTANT: deleting the --diff/--max exclusion check lets it spawn (its refusal row goes red)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-nomax-'));
    const s = diffSetup({ before: same('add', [6]).before, after: same('add', [6]).after });
    try {
        const p = variant(dir, 'diff-max-check-off', '[[ $DIFFMODE == 0 || -z "$MAXLIST" ]] ||', 'true ||');
        const r = run(p, ['--diff', '--node', s.node, '--max', 'add=6', ...NV, s.B, s.A]);
        assert.ok(s.spawns().length > 0, 'mutant still refused before any spawn: ' + r.stdout + r.stderr);
    } finally { s.done(); rmSync(dir, { recursive: true, force: true }); }
});

// ---- A4: retention ----
test('bytecode-budget diff: 20 runs without --out leave 0 new entries in a private TMPDIR and cwd', { skip }, () => {
    const s = diffSetup(same('add', [6]));
    const tmp = mkdtempSync(join(tmpdir(), 'bb-dtmp-'));
    const cwd = mkdtempSync(join(tmpdir(), 'bb-dcwd-'));
    try {
        for (let i = 0; i < 20; i++) {
            const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A], { env: { ...process.env, TMPDIR: tmp }, cwd });
            assert.equal(r.status, 0, r.stdout + r.stderr);
        }
        assert.deepEqual(readdirSync(tmp), []);
        assert.deepEqual(readdirSync(cwd), []);
    } finally { s.done(); rmSync(tmp, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true }); }
});
test('bytecode-budget diff --out: report.txt + raw/before 6 files + raw/after 6 files (3 fns x 2 runs)', { skip }, () => {
    const l = { add: [6], mid: [211], dup: [6, 19] };
    const s = diffSetup({ before: l, after: l });
    const out = join(mkdtempSync(join(tmpdir(), 'bb-dout-')), 'o');
    try {
        const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add,mid,dup', '--runs', '2', '--out', out, s.B, s.A], { env: { ...process.env, NODE_OPTIONS: '--no-warnings' } });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(existsSync(join(out, 'report.txt')));
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['after', 'before']);
        assert.deepEqual(readdirSync(join(out, 'raw', 'before')).sort(), ['add.1.txt', 'add.2.txt', 'dup.1.txt', 'dup.2.txt', 'mid.1.txt', 'mid.2.txt']);
        assert.deepEqual(readdirSync(join(out, 'raw', 'after')).sort(), ['add.1.txt', 'add.2.txt', 'dup.1.txt', 'dup.2.txt', 'mid.1.txt', 'mid.2.txt']);
    } finally { s.done(); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget gate --out still writes exactly 6 files directly under raw/ (no before/after dirs)', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const f = fakeNode(dir);
        const r = run(SCRIPT, ['--node', f.path, '--max', 'add=6,mid=211,dup=19', ...NV, '--out', out, DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['add.1.txt', 'add.2.txt', 'dup.1.txt', 'dup.2.txt', 'mid.1.txt', 'mid.2.txt']);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});

// ---- B1 reviewer FILLER: a fn with a space ("get value") -> raw name with "-" ----
test('bytecode-budget --out --fn "get value": report mode writes raw/get-value.1.txt', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const f = fakeNode(dir);   // maps a fn with a space to the fixture get-value.txt
        const r = run(SCRIPT, ['--node', f.path, '--fn', 'get value', '--out', out, DRIVER]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['get-value.1.txt', 'get-value.2.txt']);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget --out --fn "get value": diff mode writes raw/before|after/get-value.1.txt', { skip }, () => {
    const s = diffSetup(same('get value', [8]));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const r = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'get value', '--runs', '2', '--out', out, s.B, s.A]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.deepEqual(readdirSync(join(out, 'raw', 'before')).sort(), ['get-value.1.txt', 'get-value.2.txt']);
        assert.deepEqual(readdirSync(join(out, 'raw', 'after')).sort(), ['get-value.1.txt', 'get-value.2.txt']);
    } finally { s.done(); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget MUTANT raw name without the space->dash: report-mode "get value" row goes red', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-mraw-'));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    const fd = mkdtempSync(join(tmpdir(), 'bb-fake-'));
    try {
        const p = variant(dir, 'raw-keeps-space', '"${fn// /-}.$k.txt"', '"${fn}.$k.txt"');
        const f = fakeNode(fd);
        run(p, ['--node', f.path, '--fn', 'get value', '--out', out, DRIVER]);
        assert.deepEqual(readdirSync(join(out, 'raw')).sort(), ['get value.1.txt', 'get value.2.txt']);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(fd, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});
test('bytecode-budget MUTANT diff raw name without the space->dash: diff-mode "get value" row goes red', { skip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-mraw-'));
    const s = diffSetup(same('get value', [8]));
    const out = join(mkdtempSync(join(tmpdir(), 'bb-out-')), 'o');
    try {
        const p = variant(dir, 'diff-raw-keeps-space', 'r="${fn// /-}"; RB=()', 'r="${fn}"; RB=()');
        run(p, ['--diff', '--node', s.node, '--fn', 'get value', '--runs', '2', '--out', out, s.B, s.A]);
        assert.deepEqual(readdirSync(join(out, 'raw', 'before')).sort(), ['get value.1.txt', 'get value.2.txt']);
    } finally { s.done(); rmSync(dir, { recursive: true, force: true }); rmSync(dirname(out), { recursive: true, force: true }); }
});

// ---- A5: live diff rows on the real node (driver vs itself; vs a copy with one single-match edit) ----
test('bytecode-budget live diff: driver vs itself -> 0 SAME on v26.8.2 (else NO-VERDICT 2)', { skip: liveSkip }, () => {
    const r = run(SCRIPT, ['--diff', '--node', process.execPath, '--fn', 'add,mid,dup', ...NV, DRIVER, DRIVER]);
    assert.equal(r.status, LIVE ? 0 : 2, r.stdout + r.stderr);
    if (LIVE) assert.match(r.stdout, /^VERDICT SAME$/m); else assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
});
test('bytecode-budget live diff: driver vs a copy with mid made longer (k: s - n, j: s + n) -> 1 DIFF', { skip: liveSkip }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-live-'));
    try {
        const src = readFileSync(DRIVER, 'utf8');
        const from = 'k: s - n', n = src.split(from).length - 1;
        assert.equal(n, 1, `edit anchor must match exactly once, matched ${n}`);
        const edited = join(dir, 'driver.mjs');
        writeFileSync(edited, src.replace(from, () => 'k: s - n, j: s + n'));
        const r = run(SCRIPT, ['--diff', '--node', process.execPath, '--fn', 'mid', ...NV, DRIVER, edited]);
        assert.equal(r.status, LIVE ? 1 : 2, r.stdout + r.stderr);
        if (LIVE) assert.match(r.stdout, /mid: DIFF/); else assert.match(r.stdout, /NO-VERDICT -- node version mismatch: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- B2: self-test diff checks (mutants of the built file; FAIL substrings from the B2 report) ----
const ST_MUTANTS = [
    ['st-M1', 'if [[ "$MSB" == "$MSA" ]]; then', 'if [[ "$LB" == "$LA" ]]; then', 'a length multiset is order-free'],
    ['st-M2', `awk '{ print "*\\t" $0 }' | multiset; }`, `awk '{ print "*\\t" $0 }' | sort -u; }`, 'a length multiset counts duplicates'],
    ['st-M3', 'judge "$fn" "" "${RA[@]}"; VA=$JV; WA=$JWHY', 'VA=$VB; WA=$WB', 'each side is judged'],
    ['st-M4', 'if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT', 'if [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF', 'worst() over fns'],
    ['st-F', 'FINAL=1; case "$VERDICT" in SAME)', 'case "$VERDICT" in SAME)', 'diff (fake node): mid 211 | 212 -> exit 1 DIFF'],
];
for (const [name, from, to, failing] of ST_MUTANTS) {
    test(`bytecode-budget --self-test MUST FAIL on mutant ${name}`, { skip }, () => {
        const dir = mkdtempSync(join(tmpdir(), `bb-${name}-`));
        try {
            const r = run(variant(dir, name, from, to), ['--self-test']);
            assert.equal(r.status, 1, `mutant ${name} survived: ${r.stdout}${r.stderr}`);
            assert.ok(r.stdout.split('\n').some((l) => l.startsWith('FAIL ') && l.includes(failing)), `expected FAIL naming "${failing}"\n${r.stdout}`);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
}

// ---- B2: an unreadable DRIVER is refused before any spawn (red on the B1 build, which spawned) ----
const rootUid = typeof process.getuid === 'function' && process.getuid() === 0;
test('bytecode-budget: an unreadable DRIVER (chmod 000) is refused, exit 2, 0 spawns (report and diff mode)', { skip: skip || (rootUid ? 'uid 0 ignores file modes' : false) }, () => {
    const s = diffSetup(same('add', [6]));
    try {
        chmodSync(s.B, 0o000);
        const rep = run(SCRIPT, ['--node', s.node, '--fn', 'add', s.B]);
        assert.equal(rep.status, 2, rep.stdout + rep.stderr);
        assert.ok((rep.stdout + rep.stderr).includes('DRIVER not found (or not a readable file)'), rep.stdout + rep.stderr);
        const bef = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A]);
        assert.equal(bef.status, 2, bef.stdout + bef.stderr);
        assert.ok((bef.stdout + bef.stderr).includes('DRIVER (before) not found (or not a readable file)'), bef.stdout + bef.stderr);
        chmodSync(s.B, 0o644); chmodSync(s.A, 0o000);
        const aft = run(SCRIPT, ['--diff', '--node', s.node, '--fn', 'add', s.B, s.A]);
        assert.equal(aft.status, 2, aft.stdout + aft.stderr);
        assert.ok((aft.stdout + aft.stderr).includes('DRIVER (after) not found (or not a readable file)'), aft.stdout + aft.stderr);
        assert.equal(s.spawns().length, 0, s.spawns().join('\n'));
    } finally { try { chmodSync(s.B, 0o644); chmodSync(s.A, 0o644); } catch {} s.done(); }
});
