// test/ext-audit-inl.test.mjs -- T-U1 (b52, task 12 / batch B3): the class-1 findings of audit 2026-11-04-inlining-budget-diff
// against the built root inlining-budget-diff.sh, ported from audit/.../reproduction.mjs with LOGGING fake nodes.
// Oracle: .handoff/PLAN-b52-ibd-u1.md ASSERTIONS 1, 2, 4, 5 + .handoff/evidence/b5x-ibd-triage.md rulings + the audit's
// reproduction.mjs (not a run of the implementation). Independent of the coder.
//   * Every run goes through a PRIVATE COPY of the root (never the live file), with a fake `node` that appends one line per
//     spawn to a log, so "0 spawns" / "exactly 2 spawns" are counted from the fake, never argued.
//   * The fake prints a V8 table (a bool + an int + the two limit flags + a float): after F2 the root reads `--v8-options`
//     fail-closed, and reproduction.mjs's NODE_A (empty --v8-options) would die there.
//   * Each row = exec(build) -> a plain observation, and check(observation) -> assertions. The live test runs check on the
//     root copy. The "[red on 96baf24 twin]" test runs the SAME check on `git show 96baf24:inlining-budget-diff.sh` (pinned
//     sha256/8 a9bf15d3) and requires it to THROW: the row is red on the old build. capSync is never inside assert.throws.
//     A history row skips locally with a name when the pin is unreachable and FAILS under CI=true (CI_STRICT, as
//     test/bytecode-budget-awk.test.mjs). Rows that cannot be red on the twin are named "regression pin".
//   * Refusals that the old build ALREADY made with rc 2 / 1 die line / 0 spawns (node, --before, --after, driver path with a
//     newline; `--node false`; `--repo` with a newline) are told apart by a die-TEXT match (/newline/, /not a file on PATH/), the old build's text
//     differs.
//   * NUL rows: test/nul-awk.mjs (BSD record semantics via the cut shim when the host awk is NUL-clean) + a mutant (tr -> cat)
//     of the private copy, one per tr site (run_trace, probe), which the row must kill.
//   * Oracle notes (triage): F4b uses a FRESH --out and matches only "no Watch.js beside" (a reused --out would let F4's
//     refusal mask it); every row that runs twice on one OUT expects the F4 "not empty" refusal, so a successful run is
//     never followed by a reuse except where the refusal is the thing under test. F9 `runs 9` and F14 `--fn read.set,
//     read.set` are U2 findings (todo removed once U2 landed; also covered in test/ibd-u2.test.mjs).
//   * F2 / F15 (A11): a refused --v8-flags run leaves nothing in OUT (the read-only preflight and the two node reads come
//     before the first write); the rows assert OUT is absent / empty. A refusal in file / ref mode after staging CAN leave
//     stage/ (Q-IBD-3): the leftover row asserts a rerun is refused "stage is not empty" with 0 spawns.
//   * Spawn caps: capSync, CAP below, killSignal SIGKILL (a hung foreground step is not bounded by SIGTERM). The CAP is sized
//     for the slowest CI leg (hosted macOS, LEDGER #40 / #73), not for this host. ALL-HANG BOUND: after the first run that
//     times out every later ibd run refuses at once (HUNG), so those add at most ONE hung run (<= CAP, 180 s). selfRun (the
//     --self-test rows) neither checks nor sets HUNG: each of its two runs (root + mutant) is bounded by SELFCAP (600 s) on its
//     own, so the real worst case is 180 s + 2 x 600 s plus the runs that finished, inside the 3600 s per-file limit.
//   * Env: GIT_* BASH_FUNC_* EDITOR VISUAL NODE_OPTIONS BASH_ENV ENV CDPATH SHELLOPTS BASHOPTS POSIXLY_CORRECT stripped,
//     NODE_V8_COVERAGE set to undefined (delete is not a strip). macOS bash is 3.2, CI bash may be 5.x: bash 3.2 drops an
//     inherited OLDPWD, 5.x keeps it; no row depends on OLDPWD.
//   * Every temp dir is a mkdtemp under one private root (nulTmpDir: removed on exit and on SIGINT / SIGTERM), each case
//     dir removed in finally; the LAST test counts what is left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capSync } from './spawn-cap.mjs';
import { probeAwk, buildNulCutAwk, nulTmpDir } from './nul-awk.mjs';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, rmSync, existsSync, lstatSync, symlinkSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOTSH = join(HERE, '..', 'inlining-budget-diff.sh');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const CAP = 180000, SELFCAP = 600000;

// ---- env ----
function cleanEnv(extra = {}) {
    const e = { ...process.env, ...extra };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_') || k.startsWith('BASH_FUNC_')) delete e[k];
    for (const k of ['EDITOR', 'VISUAL', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'BASH_ENV', 'ENV', 'CDPATH',
        'SHELLOPTS', 'BASHOPTS', 'POSIXLY_CORRECT']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;
    delete e.NODE;   // npm exports NODE; the root's --node default is $NODE, so a leaked NODE would bypass the fake node
    return e;
}
const ENV = cleanEnv();

// ---- private root, builds ----
const PRIV = skip ? null : nulTmpDir('extinl-');
const CASES = PRIV ? join(PRIV, 'cases') : null;
const BUILDS = PRIV ? join(PRIV, 'builds') : null;
if (PRIV) { mkdirSync(CASES); mkdirSync(BUILDS); }
function putBuild(name, text) {
    const p = join(BUILDS, `${name}.sh`);
    writeFileSync(p, text);
    chmodSync(p, 0o755);
    return { name, path: p };
}
const sha8 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 8);
let ROOT_B = null, MUT_RT = null, MUT_PROBE = null, TWIN_B = null, MUT_NOX = null, MUT_NOD = null, MUT_NODOT = null, MUT_REPANY = null, MUT_PRE = null, MUT_LT = null, MUT_GLUE2 = null, MUT_NOTRAP = null;
let have = true, mutVoid = 'mutant build void';
const TWIN_COMMIT = '96baf24', TWIN_SHA = 'a9bf15d3';
const CI_STRICT = process.env.CI === 'true';
let hskipNow = skip;   // set below, after the git show
if (!skip) {
    const rootText = readFileSync(ROOTSH);
    ROOT_B = putBuild('root', rootText);
    const s = rootText.toString('latin1');
    // mutants: one tr -> cat per site, count-checked (exactly the expected number of matches, else the mutant is void)
    const rt = `tr '\\000' '?' <"$raw" |`, pr = `| tr '\\000' '?' |`;
    const nRt = s.split(rt).length - 1, nPr = s.split(pr).length - 1;
    if (nRt !== 2 || nPr !== 1) mutVoid = `root has ${nRt} run_trace tr sites (want 2) and ${nPr} probe tr sites (want 1): mutants void`;
    else {
        MUT_RT = putBuild('mut-rt', s.split(rt).join('cat "$raw" |'));
        MUT_PROBE = putBuild('mut-probe', s.split(pr).join('| cat |'));
    }
    // preflight mutants (U1 B1R2 pin): each edit must match exactly once, else void (mutVoid; a void mutant fails, never skips, in CI)
    const mutate = (name, from, to) => {
        const n = s.split(from).length - 1;
        if (n !== 1) { mutVoid = `mutant ${name}: anchor matched ${n} times (want 1)`; return null; }
        return putBuild(name, s.replace(from, () => to));
    };
    MUT_NOX = mutate('no-x', '-w "$OUT_UP" && -x "$OUT_UP" ]]', '-w "$OUT_UP" ]]');
    MUT_NOD = mutate('no-d', '[[ -d "$OUT_UP" && -w', '[[ -w');
    MUT_NODOT = mutate('no-dot', ' && "$OUT_UP" != . ]]; do', ' ]]; do');
    MUT_LT = mutate('lt-bare', 'else ib=$((b < 10#$3)); ia=$((a < 10#$3)); fi', 'else ib=$((b < $3)); ia=$((a < $3)); fi');
    MUT_GLUE2 = mutate('glue-no-completed', ' || index(substr(l, 2), "[completed compiling ")', '');
    MUT_NOTRAP = mutate('self-test-no-rm', '  rm -rf "$d"; echo\n', '  echo\n');
    MUT_REPANY = mutate('report-any', '[[ ! -e "$OUT/report.txt" || ( -f "$OUT/report.txt" && -w "$OUT/report.txt" ) ]]', '[[ ! -e "$OUT/report.txt" ]]');
    {
        const lines = s.split('\n');
        const keys = ['OUT_UP="$OUT"; while', '--out: cannot create $OUT ($OUT_UP', '--out: cannot write $OUT/report.txt'];
        const hit = keys.map((k) => lines.filter((l) => l.includes(k)).length);
        if (hit.every((n) => n === 1)) MUT_PRE = putBuild('no-preflight', lines.filter((l) => !keys.some((k) => l.includes(k))).join('\n'));
        else mutVoid = `no-preflight anchors matched ${hit.join('/')} lines (want 1/1/1)`;
    }
    const g = capSync('git', ['-C', join(HERE, '..'), 'show', `${TWIN_COMMIT}:inlining-budget-diff.sh`], { env: ENV, maxBuffer: 1 << 26 }, 30000, 'git show twin');
    if (g.status !== 0) { if (have === true) have = `git show ${TWIN_COMMIT}:inlining-budget-diff.sh failed (shallow clone or no git)`; }
    else if (sha8(g.stdout) !== TWIN_SHA) { if (have === true) have = `${TWIN_COMMIT}:inlining-budget-diff.sh is ${sha8(g.stdout)}, not the pinned ${TWIN_SHA}`; }
    else TWIN_B = putBuild('twin', g.stdout);
    hskipNow = have === true ? false : (CI_STRICT ? false : have);
}
const histGate = () => { if (have !== true) assert.fail(`${have} (CI=true: a history row fails, never skips)`); };

// ---- NUL shim (BSD record semantics on any host) ----
const NUL = skip ? null : probeAwk(ENV);
const NULDIR = skip ? null : nulTmpDir('extinl-nul-');
const NULSHIM = skip ? null : buildNulCutAwk(NULDIR, ENV);
const NULENV = skip ? null : cleanEnv({ PATH: NULSHIM.dir + ':' + ENV.PATH });

// ---- fixtures: canned node-26 trace (the script's own --self-test text, as reproduction.mjs) ----
const T1 = `[compiling method 0x1d8653c8 <JSFunction read.set (sfi = 0x11ec74af73f1)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]
Considering 0x1d866858 {0x11ec74af3511 <SharedFunctionInfo markDownstream>} for inlining with 0x1d8870a0 {0x11ec74af8929 <FeedbackVector[33]>}
Budget used: 0/920 -- 2 candidate(s) for inlining:
- candidate: JSCall node #268 with frequency 0.624484, has_heapnum_param:0, 1 target(s):
  - target: 0x1d866858 {0x11ec74af3511 <SharedFunctionInfo markDownstream>}, bytecode size: 194
- candidate: JSCall node #280 with frequency 0.125172, has_heapnum_param:0, 1 target(s):
  - target: 0x1d866930 {0x11ec74af3559 <SharedFunctionInfo flushEffects>}, bytecode size: 440, existing opt code's inlined bytecode size: 128
Inlining 0x1d866858 {0x11ec74af3511 <SharedFunctionInfo markDownstream>} into 0x1d8653c8 {0x11ec74af73f1 <SharedFunctionInfo read.set>}
Inlining small function(s) at call site #314:JSCall
Inlining 0x1d866580 {0x11ec74af3361 <SharedFunctionInfo runCleanup>} into 0x1d8653c8 {0x11ec74af73f1 <SharedFunctionInfo read.set>}
Cannot consider 0x9 {0x8 <SharedFunctionInfo refreshComputed>} for inlining (reason: exceeds bytecode limit)
[completed compiling 0x1d8653c8 <JSFunction read.set (sfi = 0x11ec74af73f1)> (target TURBOFAN_JS) - took 0.1, 2.0, 0.1 ms]
[generated bytecode for function: read.set (0x2 <SharedFunctionInfo read.set>)]
Bytecode length: 285
`;
const DROP = T1.split('\n').filter((l) => !l.startsWith('Inlining 0x1d866858')).join('\n');
const V8TABLE = [
    '  --turbofan (enable TurboFan)', '        type: bool  default: --turbofan',
    '  --stack-size (default size of stack region v8 is allowed to use)', '        type: int  default: --stack-size=984',
    '  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)',
    '        type: int  default: --max-inlined-bytecode-size=460',
    '  --max-maglev-inlined-bytecode-size (maximum size of bytecode for a single Maglev inlining)',
    '        type: int  default: --max-maglev-inlined-bytecode-size=100',
    '  --max-inlined-bytecode-size-small (maximum size of bytecode considered for small function inlining)',
    '        type: int  default: --max-inlined-bytecode-size-small=30',
    '  --reserve-inline-budget-scale-factor (scale factor of bytecode size used to calculate the inlining budget)',
    '        type: float  default: --reserve-inline-budget-scale-factor=1.2',
].join('\n');
const BASE = ['--tiers', 'turbo', '--no-bytecode', '--fn', 'read.set'];
const q = (s) => JSON.stringify(s);

// ---- harness ----
let HUNG = false;
function withCase(fn) {
    const dir = mkdtempSync(join(CASES, 'c-'));
    const c = { dir, meta: join(dir, '.meta'), w: join(dir, 'w'), log: join(dir, '.meta', 'spawns.log') };
    mkdirSync(c.meta); mkdirSync(c.w);
    try { return fn(c); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function fakeNode(path, tag, c, o = {}) { // logs "TAG argv" per spawn; --v8-options prints a V8 table; else prints the last argument (the trace)
    mkdirSync(dirname(path), { recursive: true });
    const bc = o.bc ? join(c.meta, `bc-${tag}.bin`) : null;
    if (bc) writeFileSync(bc, Buffer.from(o.bc, 'latin1'));
    writeFileSync(path, `#!/bin/sh
printf '%s\\n' "${tag} $*" >> ${q(c.log)}
case "$1" in
  --version) echo v26.0.0; exit 0 ;;
  --v8-options) cat <<'EOT'
${V8TABLE}
EOT
    exit 0 ;;
  -p) echo "v${tag} (V8 ${tag})"; exit 0 ;;
esac
for a; do last="$a"; done
${bc ? `case " $* " in *" --print-bytecode "*) cat ${q(bc)}; exit 0 ;; esac` : ''}
${o.drop ? `grep -v '^Inlining 0x1d866858' "$last"` : 'cat "$last"'}
`);
    chmodSync(path, 0o755);
    return path;
}
function tree(dir) {
    const out = [];
    (function walk(d, rel) {
        for (const n of readdirSync(d).sort()) {
            const p = join(d, n), st = lstatSync(p), r = rel ? `${rel}/${n}` : n;
            out.push(`${r} ${st.isSymbolicLink() ? 'l' : st.isDirectory() ? 'd' : 'f'} ${st.isFile() ? st.size : 0}`);
            if (st.isDirectory()) walk(p, r);
        }
    })(dir, '');
    return out;
}
function drivers(c, before = T1, after = T1) {
    writeFileSync(join(c.w, 'a.mjs'), Buffer.from(before, 'latin1'));
    writeFileSync(join(c.w, 'b.mjs'), Buffer.from(after, 'latin1'));
}
function runIbd(build, c, args, o = {}) {
    if (HUNG) throw new Error('an earlier run hung: later runs refuse at once (all-hang bound)');
    rmSync(c.log, { force: true });
    const env = o.nul && NUL.nulClean ? { ...NULENV } : { ...ENV };
    if (o.path !== undefined) env.PATH = o.path;
    const before = o.noTree ? [] : tree(c.w);
    let r;
    // cwd000: the child enters DIR, chmods it 000, then exec bash (a spawn cwd of mode 000 would not start at all)
    const cmd = o.cwd000 ? ['sh', ['-c', 'cd "$1" && chmod 000 . && shift && exec bash "$@"', 'sh', o.cwd000, build.path, ...args]] : ['bash', [build.path, ...args]];
    try {
        r = capSync(cmd[0], cmd[1], { cwd: o.cwd || c.w, env, encoding: 'utf8', killSignal: 'SIGKILL', maxBuffer: 1 << 26 },
            o.cap || CAP, `${build.name} ${o.what || 'ibd'}`);
    } catch (e) {
        const to = /timed out after/.test(String(e && e.message));
        if (to && o.hangOk) r = { status: 'timeout (hung)', stdout: '', stderr: '' };   // a hang is a plain observation: refused() then fails on rc
        else { if (to) HUNG = true; throw e; }
    }
    const out = (r.stdout || '') + (r.stderr || '');
    return {
        rc: r.status, out, before, after: o.noTree ? [] : tree(c.w),
        dies: out.split('\n').filter((l) => /^inlining-budget-diff: /.test(l)),
        verdict: (out.match(/^VERDICT .*$/m) || [''])[0],
        spawns: existsSync(c.log) ? readFileSync(c.log, 'utf8').split('\n').filter(Boolean) : [],
    };
}
const nodeA = (c) => fakeNode(join(c.meta, 'node'), 'A', c);
function refused(o, text, spawns = 0) {
    assert.equal(o.rc, 2, `exit: ${o.out}`);
    assert.equal(o.dies.length, 1, `die lines: ${o.out}`);
    assert.equal(o.spawns.length, spawns, `spawns: ${o.spawns.join(' | ')}`);
    if (text) assert.match(o.dies[0], text);
}
const noDriver = (o) => assert.equal(o.spawns.filter((l) => /driver\.mjs|\b[ab]\.mjs\b/.test(l)).length, 0, `a spawn carried the driver: ${o.spawns.join(' | ')}`);
const unchanged = (o) => assert.deepEqual(o.after, o.before, 'the run changed the tree');
const isSame = (o) => { assert.equal(o.rc, 0, o.out); assert.match(o.verdict, /^VERDICT SAME\b/); };

// red(): check(obs) must throw an AssertionError (any other error is a bug and propagates); EXTINL_WHY=1 prints the first line
function red(check, obs, name, msg) {
    try { check(obs); } catch (e) {
        if (!(e instanceof assert.AssertionError)) throw e;
        if (process.env.EXTINL_WHY) console.log(`WHY ${name.slice(0, 50)} :: ${String(e.message).split('\n')[0].slice(0, 110)}`);
        return;
    }
    assert.fail(msg);
}
// row(): live test on the root copy + "[red on twin]" test (+ mutants). exec(build) -> obs; check(obs) throws on a bad obs.
function row(name, exec, check, opt = {}) {
    test(name, { skip }, () => { const obs = exec(ROOT_B); check(obs); });
    if (opt.twin !== false) {
        test(`${name} [red on ${TWIN_COMMIT} twin]`, { skip: hskipNow }, () => {
            histGate();
            const obs = exec(TWIN_B);
            red(check, obs, name, 'the row passes on the old build: it has no teeth');
        });
    }
    for (const [mname, mb] of Object.entries(opt.mutants || {})) {
        test(`${name} [mutant ${mname} killed]`, { skip: skip || (CI_STRICT || mb() ? false : mutVoid) }, () => {
            if (!mb()) assert.fail(`${mutVoid} (a void mutant fails, never skips, under CI=true)`);
            const obs = exec(mb());
            red(check, obs, name, 'the mutant survives');
        });
    }
}

// ---- F1: node resolved once, before any cd (identical drivers must be SAME; the B node must never run) ----
function f1(dirs, nodeArg, path) {
    return (b) => withCase((c) => {
        for (const s of ['cwd', 'before', 'after']) mkdirSync(join(c.w, s, ...dirs), { recursive: true });
        fakeNode(join(c.w, 'cwd', ...dirs, 'node'), 'A', c);
        fakeNode(join(c.w, 'before', ...dirs, 'node'), 'B', c, { drop: true });
        fakeNode(join(c.w, 'after', ...dirs, 'node'), 'A', c);
        writeFileSync(join(c.w, 'before', 'driver.mjs'), T1); writeFileSync(join(c.w, 'after', 'driver.mjs'), T1);   // byte-identical
        const o = runIbd(b, c, [...BASE, ...nodeArg, '--out', join(c.w, 'out'), '../before/driver.mjs', '../after/driver.mjs'],
            { cwd: join(c.w, 'cwd'), path: path ? `bin:${ENV.PATH}` : undefined });
        o.b = o.spawns.filter((l) => l.startsWith('B ')).length;
        return o;
    });
}
test('env: NODE never reaches a child (npm exports it; the root defaults --node to $NODE) (regression pin)', { skip }, () => {
    assert.equal(ENV.NODE, undefined); if (NULENV) assert.equal(NULENV.NODE, undefined);
    assert.equal(cleanEnv({ PATH: '/x' }).NODE, undefined);
});
const ckF1 = (o) => { assert.equal(o.b, 0, `the node of the driver directory ran: ${o.spawns.join(' | ')}`); assert.ok(o.spawns.length > 0); isSame(o); };
row('F1 --node ./node resolves once (cwd), identical drivers -> SAME, 0 spawns of the per-driver node', f1([], ['--node', './node'], false), ckF1);
row('F1 PATH=bin: (relative PATH entry) resolves once, identical drivers -> SAME', f1(['bin'], [], true), ckF1);

// ---- F2 / F15: --v8-flags allowlist, fail closed after exactly one -p and one --v8-options ----
function v8run(flags) {
    return (b) => flags.map((f) => withCase((c) => {
        drivers(c);
        const o = runIbd(b, c, [...BASE, '--node', nodeA(c), `--v8-flags=${f}`, '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']);
        o.flag = f; o.out_ = join(c.w, 'out');
        o.outTree = existsSync(o.out_) ? tree(o.out_) : [];
        return o;
    }));
}
function ckV8(os) {
    for (const o of os) {
        const w = `flag ${o.flag}`;
        assert.equal(o.rc, 2, `${w}: ${o.out}`);
        assert.equal(o.dies.length, 1, `${w} die lines: ${o.out}`);
        assert.equal(o.spawns.length, 2, `${w} spawns: ${o.spawns.join(' | ')}`);
        assert.equal(o.spawns.filter((l) => /^A -p\b/.test(l)).length, 1, `${w}: one -p`);
        assert.equal(o.spawns.filter((l) => /^A --v8-options\b/.test(l)).length, 1, `${w}: one --v8-options`);
        assert.equal(o.spawns.filter((l) => /\b[ab]\.mjs\b/.test(l)).length, 0, `${w}: a spawn carried the driver`);
        assert.deepEqual(o.outTree, [], `${w}: nothing in OUT`);
    }
}
row('F2 --v8-flags node options (--require=, --run=) refused: rc 2, 1 die, exactly 2 spawns (-p, --v8-options), nothing in OUT', v8run(['--require=./p.cjs', '--run=x']), ckV8);
row('F15 --v8-flags snapshot flags (--snapshot-blob=, --build-snapshot) refused: rc 2, 1 die, exactly 2 spawns, nothing in OUT', v8run(['--snapshot-blob=./s', '--build-snapshot']), ckV8);
row('F2 3 refused cycles on one OUT leave it absent (A5): each rc 2, 1 die, exactly 2 spawns', (b) => withCase((c) => {
    drivers(c);
    const out = join(c.w, 'out'), node = nodeA(c), cycles = [];
    for (let i = 0; i < 3; i++) { const o = runIbd(b, c, [...BASE, '--node', node, '--v8-flags=--require=./p.cjs', '--out', out, 'a.mjs', 'b.mjs'], { what: `F2 cycle ${i + 1}` }); o.gone = !existsSync(out); cycles.push(o); }
    return cycles;
}), (os) => { for (const o of os) { refused(o, undefined, 2); noDriver(o); assert.ok(o.gone, 'OUT was created'); } });
row('F2 control: a listed int V8 flag (--max-inlined-bytecode-size-small=40) is accepted: SAME (regression pin)', (b) => withCase((c) => {
    drivers(c);
    return runIbd(b, c, [...BASE, '--node', nodeA(c), '--v8-flags=--max-inlined-bytecode-size-small=40', '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']);
}), isSame, { twin: false });

// ---- shape tokens, F3, F11, F12: refused before any spawn, tree unchanged ----
const shapeRow = (flags) => (b) => flags.map((f) => withCase((c) => {
    drivers(c);
    const o = runIbd(b, c, [...BASE, '--node', nodeA(c), `--v8-flags=${f}`, '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']);
    o.flag = f; return o;
}));
row('shape tokens x.js / -e / ---x / --=1 in --v8-flags: rc 2, 1 die, 0 spawns, tree unchanged', shapeRow(['x.js', '-e', '---x', '--=1']),
    (os) => { for (const o of os) { refused(o); unchanged(o); } });

const NL = /newline/i;
const F3 = {
    '--fn': (c, n) => ['--tiers', 'turbo', '--no-bytecode', '--fn', 'read.set\nmarkDownstream', '--node', n, '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'],
    '--tiers': (c, n) => ['--tiers', 'turbo\nmaglev', '--no-bytecode', '--fn', 'read.set', '--node', n, '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'],
    '--v8-flags': (c, n) => [...BASE, '--node', n, '--v8-flags', '--max-inlined-bytecode-size-small=40\n--max-inlined-bytecode-size-small=41', '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'],
    '--out': (c, n) => [...BASE, '--node', n, '--out', join(c.w, 'o\nx'), 'a.mjs', 'b.mjs'],
    '--node': (c, n) => [...BASE, '--node', `${n}\nx`, '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'],
    'driver path': (c, n) => [...BASE, '--node', n, '--out', join(c.w, 'out'), 'a.mjs', 'b\n.mjs'],
    '--before': (c, n) => [...BASE, '--node', n, '--before', 'a\nb.js', '--after', 'c.js', '--out', join(c.w, 'out')],
    '--after': (c, n) => [...BASE, '--node', n, '--before', 'a.js', '--after', 'c\nd.js', '--out', join(c.w, 'out')],
    '--driver': (c, n) => [...BASE, '--node', n, '--driver', 'd\nx.mjs', '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'],
    '--repo': (c, n) => [...BASE, '--node', n, '--repo', 'r\nr', '--before-ref', 'main', '--after-ref', 'main', '--out', join(c.w, 'out')],
};
for (const [k, mk] of Object.entries(F3)) {
    row(`F3 a newline in ${k}: rc 2, 1 die naming the newline, 0 spawns, tree unchanged`, (b) => withCase((c) => { drivers(c); return runIbd(b, c, mk(c, nodeA(c))); }),
        (o) => { refused(o, NL); unchanged(o); });
}
row('F11 --node false (a shell builtin) is refused up front: rc 2, 1 die "not a file on PATH", 0 spawns', (b) => withCase((c) => {
    drivers(c); return runIbd(b, c, [...BASE, '--node', 'false', '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']);
}), (o) => { refused(o, /not a file on PATH/); unchanged(o); });
row('F12 a non-numeric limit (--max-inlined-bytecode-size-small=abc / --reserve-inline-budget-scale-factor=abc): rc 2, 1 die, 0 spawns', (b) =>
    ['--max-inlined-bytecode-size-small=abc', '--reserve-inline-budget-scale-factor=abc'].map((f) => withCase((c) => {
        drivers(c);
        const o = runIbd(b, c, ['--tiers', 'turbo', '--fn', 'read.set', '--node', nodeA(c), '--v8-flags', f, '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']);
        o.flag = f; return o;
    })), (os) => { for (const o of os) { refused(o); unchanged(o); } });

// ---- F4: a reused --out is refused; an empty diff file on SAME ----
row('F4 a --out reused after a successful run is refused ("not empty"): rc 2, 1 die, 0 spawns, OUT unchanged', (b) => withCase((c) => {
    drivers(c, T1, DROP);
    const out = join(c.w, 'out'), node = nodeA(c);
    const r1 = runIbd(b, c, [...BASE, '--node', node, '--runs', '4', '--out', out, 'a.mjs', 'b.mjs'], { what: 'run 1' });
    const o = runIbd(b, c, [...BASE, '--node', node, '--runs', '2', '--out', out, 'a.mjs', 'a.mjs'], { what: 'run 2 (reused OUT)' });
    o.r1 = r1; return o;
}), (o) => {
    assert.equal(o.r1.rc, 1, `run 1 (T1 vs DROP) must be a DIFF: ${o.r1.out}`);
    refused(o, /not empty/); unchanged(o);
});
row('F4 a symlinked raw/ in --out is refused, nothing written through it', (b) => withCase((c) => {
    drivers(c);
    const out = join(c.w, 'out'), el = join(c.w, 'elsewhere');
    mkdirSync(out); mkdirSync(el); symlinkSync(el, join(out, 'raw'));
    const o = runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', out, 'a.mjs', 'b.mjs']);
    o.through = readdirSync(el).length; return o;
}), (o) => { refused(o); assert.equal(o.through, 0, 'written through the symlink'); unchanged(o); });
row('F4 a SAME run leaves all.turbo.diff.txt present at 0 bytes (always written)', (b) => withCase((c) => {
    drivers(c);
    const out = join(c.w, 'out');
    const o = runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', out, 'a.mjs', 'b.mjs']);
    const f = join(out, 'all.turbo.diff.txt');
    o.diffSize = existsSync(f) ? lstatSync(f).size : -1; return o;
}), (o) => { isSame(o); assert.equal(o.diffSize, 0, 'all.turbo.diff.txt: -1 = absent'); });

// ---- F4b: a single-quoted ./Watch.js re-export with no Watch.js beside --before (FRESH --out, only that text) ----
function f4b(quote, withWatch) {
    return (b) => withCase((c) => {
        const e = join(c.w, 'f'), af = join(c.w, 'after');
        mkdirSync(e); mkdirSync(af); mkdirSync(join(c.w, 'd'));
        writeFileSync(join(e, 'Signal.js'), `export * from ${quote}./Watch.js${quote};\nexport const x = 2;\n`);
        if (withWatch) writeFileSync(join(e, 'Watch.js'), 'export const w = 1;\n');
        writeFileSync(join(af, 'Signal.js'), 'export const x = 3;\n');
        return runIbd(b, c, [...BASE, '--node', fakeNode(join(c.meta, 'node'), 'A', c), '--before', join(e, 'Signal.js'), '--after', join(af, 'Signal.js'),
            '--out', join(c.w, 'fresh-out')], { cwd: join(c.w, 'd') });
    });
}
row("F4b single-quoted import of ./Watch.js, no Watch.js beside --before: refused 'no Watch.js beside' (fresh --out)", f4b("'", false),
    (o) => { refused(o, /no Watch\.js beside/, 2); noDriver(o); });
row('F4b control: double-quoted import, no Watch.js beside: refused the same way (regression pin)', f4b('"', false),
    (o) => { refused(o, /no Watch\.js beside/, 2); noDriver(o); }, { twin: false });
row("F4b control: single-quoted import WITH a Watch.js beside is not refused (regression pin)", f4b("'", true),
    (o) => { assert.ok(o.spawns.length > 2, `an early exit: ${o.out}`); assert.ok(!o.dies.some((d) => /no Watch\.js beside/.test(d)), o.out); }, { twin: false });

// ---- N2: driver output glued to a V8 compile line ----
const N2 = (after, extra = [], nul = false) => (b) => withCase((c) => {
    drivers(c, T1, after);
    return runIbd(b, c, [...BASE, ...extra, '--node', nodeA(c), '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'], { nul });
});
row('N2 an after-trace with "step " glued before the compile header: rc 2, 1 die (old: DIFF exit 1)', N2('step ' + T1), (o) => { assert.equal(o.rc, 2, o.out); assert.equal(o.dies.length, 1, o.out); });
row('N2 control: "[ML:7] [compiling method" is not refused: SAME (regression pin)', N2('[ML:7] ' + T1), (o) => { assert.equal(o.dies.length, 0, o.out); isSame(o); }, { twin: false });
row('N2 control: a --concurrent run with a glued trace is not refused (interleaving is legal there)', N2('step ' + T1, ['--concurrent']),
    (o) => { assert.equal(o.dies.length, 0, o.out); assert.notEqual(o.rc, 2, o.out); }, { twin: false });
row('N2 a NUL-glued header ("x" NUL header) is refused: rc 2, 1 die (tr maps the NUL to ? so the glue is visible)', N2('x\0' + T1, [], true),
    (o) => { assert.equal(o.rc, 2, o.out); assert.equal(o.dies.length, 1, o.out); }, { mutants: { 'run_trace tr->cat': () => MUT_RT } });

const DONE = '[completed compiling ';
row('N2 an after-trace with "step " glued before the LAST (completed compiling) line: rc 2, 1 die "glued"', N2(T1.replace(DONE, 'step ' + DONE)),
    (o) => { assert.equal(o.rc, 2, o.out); assert.equal(o.dies.length, 1, o.out); assert.match(o.dies[0], /glued/); }, { mutants: { 'no completed-compiling index': () => MUT_GLUE2 } });
row('N2 control: "[ML:7] " before the completed-compiling line is not refused: SAME (regression pin)', N2(T1.replace(DONE, '[ML:7] ' + DONE)),
    (o) => { assert.equal(o.dies.length, 0, o.out); isSame(o); }, { twin: false });

// ---- N1 tr: a NUL in a bytecode header name must not read as the clean name ----
row('N1 a bytecode header "read.set" NUL ... is NOT counted as read.set (tr in probe()); the clean header is (control)', (b) => {
    const mk = (bc) => withCase((c) => {
        drivers(c);
        return runIbd(b, c, ['--tiers', 'turbo', '--fn', 'read.set', '--node', fakeNode(join(c.meta, 'node'), 'A', c, { bc }), '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'], { nul: true });
    });
    const hdr = (nm) => `[generated bytecode for function: ${nm} (0x2 <SharedFunctionInfo read.set>)]\nBytecode length: 777\n`;
    return { ctl: mk(hdr('read.set')), nul: mk(hdr('read.set\0')) };
}, (o) => {
    assert.match(o.ctl.out, /777/, `control: the clean header is reported: ${o.ctl.out}`);
    assert.doesNotMatch(o.nul.out, /777/, 'the NUL-named function was reported as read.set');
    isSame(o.nul);   // the run itself completed (an early exit would also lack 777)
}, { mutants: { 'probe tr->cat': () => MUT_PROBE } });

// ---- U2 findings ----
test('F9 --runs 09 prints no bash arithmetic error and runs 9 (U2)', { skip }, () => {
    const o = withCase((c) => { drivers(c); return runIbd(ROOT_B, c, [...BASE, '--node', nodeA(c), '--runs', '09', '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']); });
    assert.doesNotMatch(o.out, /value too great for base/);
    assert.match(o.out, /\bruns 9\b/);
});
test('F14 --fn read.set,read.set is refused ("given twice"): rc 2, 1 die, 0 spawns (U2)', { skip }, () => {
    const o = withCase((c) => { drivers(c); return runIbd(ROOT_B, c, ['--tiers', 'turbo', '--no-bytecode', '--fn', 'read.set,read.set', '--only-fn', '--node', nodeA(c), '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']); });
    refused(o, /given twice/);
});

// ---- U1 B1R2 (A11): tr / ls shims, =09 on -small, Q-IBD-3 file-mode leftover ----
function shimDir(c, name, body) {
    const d = join(c.meta, 'shim'); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, name), `#!/bin/sh\n${body}\n`); chmodSync(join(d, name), 0o755);
    return `${d}:${ENV.PATH}`;
}
row('N2 a failing glue scan (tr exits 2 on the NUL-map stage) is refused "cannot scan": rc 2, 1 die, never read as no glue', (b) => withCase((c) => {
    drivers(c);
    // the shim fails only the `tr '\000' '?'` stage; the first such call in a run is the glue scan
    const path = shimDir(c, 'tr', "case \"$*\" in '\\000 ?') exit 2 ;; esac\nexec /usr/bin/tr \"$@\"");
    return runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs'], { path });
}), (o) => { refused(o, /cannot scan/, 4); });   // 4 = the 3 node reads (-p, --v8-options x2) + the one run whose trace is scanned
row('F12 --v8-flags =09 (small, single, Maglev single) read as base 10: SAME, the report shows single<=09 / single<09 and read.set: 285 -> 285 bytes (regression pin)', (b) => withCase((c) => {
    drivers(c);
    const bc = '[generated bytecode for function: read.set (0x2 <SharedFunctionInfo read.set>)]\nBytecode length: 285\n';
    return runIbd(b, c, ['--tiers', 'turbo', '--fn', 'read.set', '--node', fakeNode(join(c.meta, 'node'), 'A', c, { bc }),
        '--v8-flags=--max-inlined-bytecode-size-small=09 --max-inlined-bytecode-size=09 --max-maglev-inlined-bytecode-size=09', '--out', join(c.w, 'out'), 'a.mjs', 'b.mjs']);
}), (o) => {
    isSame(o); assert.doesNotMatch(o.out, /value too great for base|unexpected/);
    // oracle: the report text. 285 is the fixture's own bytecode length (same both sides); 09 must read as 9, not octal-fail or default
    assert.match(o.out, /single<=09\b/); assert.match(o.out, /single<09\b/); assert.match(o.out, /read\.set: 285 -> 285 bytes/);
}, { twin: false, mutants: { 'Maglev < leg bare $3': () => MUT_LT } });
row('Q-IBD-3 a file-mode refusal after staging leaves stage/; a rerun on that OUT is refused "stage is not empty": rc 2, 1 die, 0 spawns', (b) => withCase((c) => {
    const e = join(c.w, 'f'), af = join(c.w, 'after'), out = join(c.w, 'out');
    mkdirSync(e); mkdirSync(af);
    writeFileSync(join(e, 'Signal.js'), 'export * from "./Watch.js";\nexport const x = 2;\n');   // no Watch.js beside: refused after staging
    writeFileSync(join(af, 'Signal.js'), 'export const x = 3;\n');
    const node = nodeA(c), args = [...BASE, '--node', node, '--before', join(e, 'Signal.js'), '--after', join(af, 'Signal.js'), '--out', out];
    const r1 = runIbd(b, c, args, { what: 'run 1' });
    const mid = tree(out);
    const o = runIbd(b, c, args, { what: 'rerun' });
    o.r1 = r1; o.mid = mid; o.end = tree(out); return o;
}), (o) => {
    refused(o.r1, /no Watch\.js beside/, 2); noDriver(o.r1);
    assert.ok(o.mid.some((x) => /^stage\/before\b/.test(x)), `stage/ left behind: ${o.mid.join(' | ')}`);
    refused(o, /stage is not empty/);
    assert.deepEqual(o.end, o.mid, 'the refused rerun changed OUT');
});
row('N1b an ls that fails on "ls -A" (the emptiness read of an existing OUT subdir) is refused "cannot list": rc 2, 1 die, 0 spawns', (b) => withCase((c) => {
    drivers(c);
    const out = join(c.w, 'out'); mkdirSync(join(out, 'raw'), { recursive: true });
    const path = shimDir(c, 'ls', 'case "$1" in -A) exit 2 ;; esac\nexec /bin/ls "$@"');
    return runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', out, 'a.mjs', 'b.mjs'], { path });
}), (o) => { refused(o, /cannot list/); });

// ---- regression pin (U1 B1R2 / b55): a bad --out is refused by the read-only preflight, 0 spawns ----
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0 ? 'running as root: read-only shapes do not bite' : false;
const pinSkip = skip || asRoot;
const modes = (list) => { for (const [p, m] of list) { try { chmodSync(p, m); } catch { /* gone */ } } };
// shape: (c) -> { out, undo: [[path, mode]...] }
const SHAPES = {
    'OUT is a regular file': (c) => { const f = join(c.w, 'f'); writeFileSync(f, ''); return { out: f, undo: [] }; },
    'OUT in a read-only parent': (c) => { const p = join(c.w, 'ro'); mkdirSync(p); chmodSync(p, 0o555); return { out: join(p, 'new'), undo: [[p, 0o755]] }; },
    'OUT is a read-only dir': (c) => { const p = join(c.w, 'ro'); mkdirSync(p); chmodSync(p, 0o555); return { out: p, undo: [[p, 0o755]] }; },
    'OUT is a dangling symlink': (c) => { const l = join(c.w, 'link'); symlinkSync(join(c.w, 'nowhere'), l); return { out: l, undo: [] }; },
    'OUT under a regular file': (c) => { const f = join(c.w, 'f'); writeFileSync(f, ''); return { out: join(f, 'sub'), undo: [] }; },
    'report.txt is a directory': (c) => { const o = join(c.w, 'o'); mkdirSync(join(o, 'report.txt'), { recursive: true }); return { out: o, undo: [] }; },
    'report.txt is read-only': (c) => { const o = join(c.w, 'o'), r = join(o, 'report.txt'); mkdirSync(o); writeFileSync(r, ''); chmodSync(r, 0o444); return { out: o, undo: [[r, 0o644]] }; },
    'OUT in a 0600 parent (no x)': (c) => { const p = join(c.w, 'p'); mkdirSync(p); chmodSync(p, 0o600); return { out: join(p, 'new'), undo: [[p, 0o755]] }; },
    'OUT is a 0755 regular file': (c) => { const f = join(c.w, 'f'); writeFileSync(f, ''); chmodSync(f, 0o755); return { out: f, undo: [] }; },
};
function badOut(shape) {
    return (b) => withCase((c) => {
        drivers(c);
        const s = SHAPES[shape](c);
        try { return runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', s.out, 'a.mjs', 'b.mjs'], { noTree: true }); }
        finally { modes(s.undo); }
    });
}
const ckBad = (o) => refused(o);
for (const shape of Object.keys(SHAPES)) {
    test(`pin: ${shape}: rc 2, 1 die, 0 spawns (regression pin)`, { skip: pinSkip }, () => ckBad(badOut(shape)(ROOT_B)));
}
for (const [k, mk, shape] of [['dropping -x', () => MUT_NOX, 'OUT in a 0600 parent (no x)'], ['dropping -d', () => MUT_NOD, 'OUT is a 0755 regular file']]) {
    test(`pin: mutant ${k} killed by "${shape}"`, { skip: pinSkip || (CI_STRICT || mk() ? false : mutVoid) }, () => {
        if (!mk()) assert.fail(`${mutVoid} (a void mutant fails, never skips, under CI=true)`);
        red(ckBad, badOut(shape)(mk()), shape, 'the mutant survives');
    });
}
// chmod 000 cwd, relative OUT: the preflight must refuse (a dropped `!= .` loops forever; hangOk turns the hang into a failing observation)
const cwd000 = (b, cap) => withCase((c) => {   // cap: ONLY the mutant row passes one (it hangs on purpose); the live row keeps CAP
    drivers(c);
    const d = join(c.w, 'cwd0'); mkdirSync(d);
    try {
        return runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', 'rel/out', join(c.w, 'a.mjs'), join(c.w, 'b.mjs')], { cwd000: d, noTree: true, hangOk: true, cap, what: 'cwd000' });
    } finally { modes([[d, 0o755]]); }
});
test('pin: chmod 000 cwd with a relative OUT: rc 2, 1 die, 0 spawns (regression pin)', { skip: pinSkip }, () => ckBad(cwd000(ROOT_B, undefined)));
test('pin: mutant dropping "!= ." killed by the chmod 000 cwd row (the mutant hangs; the spawn cap turns that into a failure)', { skip: pinSkip || (CI_STRICT || MUT_NODOT ? false : mutVoid) }, () => {
    if (!MUT_NODOT) assert.fail(`${mutVoid} (a void mutant fails, never skips, under CI=true)`);
    red(ckBad, cwd000(MUT_NODOT, 15000), 'cwd000', 'the mutant survives');
});
// an existing WRITABLE report.txt is not a refusal: the run goes on (more than the two node reads)
const repOk = (b) => withCase((c) => {
    drivers(c);
    const o = join(c.w, 'o'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), '');
    return runIbd(b, c, [...BASE, '--node', nodeA(c), '--out', o, 'a.mjs', 'b.mjs'], { noTree: true });
});
const ckRepOk = (o) => { assert.ok(o.spawns.length > 2, `a writable existing report.txt was refused: ${o.out}`); assert.ok(!o.dies.some((d) => /cannot write/.test(d)), o.out); };
test('pin: an existing writable report.txt still reaches the runs: spawns > 2 (regression pin)', { skip: pinSkip }, () => ckRepOk(repOk(ROOT_B)));
test('pin: mutant report.txt refuse-any-existing killed by the writable-report.txt row', { skip: pinSkip || (CI_STRICT || MUT_REPANY ? false : mutVoid) }, () => {
    if (!MUT_REPANY) assert.fail(`${mutVoid} (a void mutant fails, never skips, under CI=true)`);
    red(ckRepOk, repOk(MUT_REPANY), 'report-any', 'the mutant survives');
});
// must-fail control: with the three preflight lines deleted, the seven bad shapes reach the two node reads (>= 2 spawns)
test('pin teeth: on a copy with the three preflight lines deleted the seven bad --out shapes spawn (>= 2 each)', { skip: pinSkip || (CI_STRICT || MUT_PRE ? false : mutVoid) }, () => {
    if (!MUT_PRE) assert.fail(`${mutVoid} (a void mutant fails, never skips, under CI=true)`);
    for (const shape of Object.keys(SHAPES).slice(0, 7)) {
        const o = badOut(shape)(MUT_PRE);
        assert.ok(o.spawns.length >= 2, `${shape}: the mutant still refused with ${o.spawns.length} spawns: ${o.out}`);
    }
});

// ---- retention (ASSERTION 5) ----
row('retention: 3 refused cycles on one OUT leave its entry count unchanged', (b) => withCase((c) => {
    drivers(c, T1, DROP);
    const out = join(c.w, 'out'), node = nodeA(c);
    const r1 = runIbd(b, c, [...BASE, '--node', node, '--out', out, 'a.mjs', 'b.mjs'], { what: 'run 1' });
    const base = tree(out);
    const cycles = [];
    for (let i = 0; i < 3; i++) cycles.push(runIbd(b, c, [...BASE, '--node', node, '--out', out, 'a.mjs', 'b.mjs'], { what: `refused cycle ${i + 1}` }));
    return { r1, base, cycles, end: tree(out) };
}), (o) => {
    assert.equal(o.r1.rc, 1, o.r1.out);
    for (const x of o.cycles) { assert.equal(x.rc, 2, x.out); assert.equal(x.spawns.length, 0, 'a refused cycle spawned'); }
    assert.deepEqual(o.end, o.base, 'OUT entries changed across the refused cycles');
});
// a PATH shim mktemp forces every `mktemp -d` into the case's private dir and records each dir it returns (TMPDIR alone is not
// honoured by every mktemp: a host returned /var/folders); the oracle is "every recorded dir is gone after the run"
const REAL_MKTEMP = ['/usr/bin/mktemp', '/bin/mktemp'].find((p) => existsSync(p));
const selfRun = (b) => withCase((c) => {
    const priv = join(c.w, 'tmp'); mkdirSync(priv);
    const rec = join(c.meta, 'mktemp.log');
    const sd = join(c.meta, 'shim'); mkdirSync(sd);
    writeFileSync(join(sd, 'mktemp'), `#!/bin/sh\nd=$(${REAL_MKTEMP} -d ${q(priv)}/st.XXXXXX) || exit 1\nprintf '%s\\n' "$d" >> ${q(rec)}\nprintf '%s\\n' "$d"\n`);
    chmodSync(join(sd, 'mktemp'), 0o755);
    const r = capSync('bash', [b.path, '--self-test'], { cwd: c.w, env: { ...ENV, PATH: sd + ':' + ENV.PATH, TMPDIR: priv }, encoding: 'utf8', killSignal: 'SIGKILL', maxBuffer: 1 << 26 }, SELFCAP, `${b.name} --self-test`);
    const dirs = existsSync(rec) ? readFileSync(rec, 'utf8').split('\n').filter(Boolean) : [];
    return { rc: r.status, out: `${r.stdout}${r.stderr}`.slice(-600), dirs, left: dirs.filter((d) => existsSync(d)), priv: readdirSync(priv) };
});
row('retention: --self-test exits 0 and removes every temp dir its mktemp made (at least one was made)', selfRun, (o) => {
    assert.equal(o.rc, 0, o.out);
    assert.ok(o.dirs.length >= 1, 'the mktemp shim saw no call: the oracle is blind');
    assert.deepEqual(o.left, [], 'temp dirs left behind');
    assert.deepEqual(o.priv, [], 'private TMPDIR not empty');
}, { twin: false, mutants: { 'self_test without its rm -rf': () => MUT_NOTRAP } });
test('retention: no case dir of this file is left under the private root (runs last)', { skip }, () => {
    assert.deepEqual(readdirSync(CASES), []);
});
