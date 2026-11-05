// test/ext-audit-alloc.test.mjs -- allocation-diff.sh from the OUTSIDE: the external-audit classes B1 / B1b (node resolved once,
// must be an executable file), B2 (exported CDPATH), B3 (dash-led names), B4B (--v8-flags shape), ENV (--env-file* /
// --experimental-*config-file* refused), M1 / M1b (unwritable report.txt), M2 (printed path joins), SYM (report.txt symlink),
// MD36 (raw/ symlink), MD37 (hard-linked report.txt), MD38 (newline in the resolved node path), MOD (--v8-flags module loaders), EVAL (--v8-flags eval / print), the dd walk rows N29-N36, N37,
// N9 (static -ef counts), N14 / N16 / N17 / N18 (logical vs physical paths), ALIAS, plus one A4 retention row.
// Purpose: gate the allocation-diff half of the external audit (PLAN-ext-audit-gB-alloc.md TASKS 1-4) so that the rows fail on the
// frozen script and pass on the fixed one. MD-41: these rows live in this NEW file so test/ext-audit.test.mjs stays with B-four.
// ORACLE: .handoff/PLAN-ext-audit-gB-alloc.md SPEC / TASKS 1-4 / TASK 7 / ASSERTIONS A3 A4 A5, and the CURRENT section of
// .handoff/PLAN-ext-audit.md (C-3, C-6..C-12, C-26..C-29); die texts are the already-fixed deopt-diff / ic-diff texts the plan pastes
// verbatim into allocation-diff (prefix "allocation-diff:"), never what allocation-diff.sh printed. TIER: DETERMINISTIC (fake node
// in a per-row temp dir, a mktemp shim; no V8 spawn, except the one --self-test row which uses the script's own canned checks).
// Root: EXT_AUDIT_ALLOC_ROOT (a directory holding allocation-diff.sh), else the repo root (this file lives in test/).
// FAKE NODE: bash; logs argv to <its dir>/log and $PWD to <its dir>/pwd, exits 7 if NODE_OPTIONS reached it, answers --version
// (v26.8.2), exits 9 on a driver argument that starts with '-' (as node would), else echoes ./trace.txt with a read loop (no fork; a rig failure exits 4 / 5, which no row reads as a guard count) (3 Scavenge lines in the
// marked window + 1 exit-fence line) and writes the number of GC lines before the gcn marker to fd 3. So an accepted run is
// VERDICT SAME, exit 0. It also answers --v8-options with the G1 fixture (test/fixtures/v8flags/v8-options.v26.8.2.txt, read loop, no fork). Accepted diff --runs 3 = --version + --v8-options + 6 = 8 spawns and 1 mktemp (PLAN-md46 G5 A2). Each refused row: exit 2, stdout empty,
// stderr exactly the die line + VERDICT NO-VERDICT, 0 spawns, 0 mktemp, 0 new entries anywhere under the row's directory.
// FROZEN EXPECTATION (b27-head, allocation-diff.sh a84f1607; PLAN A5): every row red except the 8 controls B4B-ok, MD37c, N33, N18,
// B1, DRV1, MOD-node, EVAL-node (named MOD-ok / EVAL-ok at b27). More than one OTHER row green on the frozen script is a planner DELTA, not a reason to change an expectation here.
// MD-46 G5 (ASSERTIONS A3): on the b35 before build (HEAD 4e364c6) the red set is exactly B4B-ok, B3 -/node, B3 -n/node, B3 -nd, MD37c, N33, B1, MOD-node, EVAL-node, F15 x3, V8-ok, V8R; every other row green. After the B1 build (TASKS 1-4) and G5: all rows green. Rows that need file modes (M1, M1b, N29, N30, N32, N35, N34, and those parts of the A4
// row) skip at euid 0. N34 hangs on a walk without "!= ." (10 s spawn timeout = red).
// Mutants this file is designed to kill (PLAN TASK 7): unset CDPATH after the include (B2 self-test), `--*` gate (B4B), no env arm
// (ENV), no dash guard (B3 -o), no MD-36 (MD36a/b), no SYM (SYM), no write check (M1/M1b), no MD-37 / MD-37 fail-open (MD37a/b), no
// walk (N29-N32), walk without `!= .` / `-x` / `-d` / `! -L` (N34 / N35 / N36 / N31), no -f/-x (B1b, ALIAS), no node -ef (N14), no `-`
// NODE_DIR guard (B3 --node -/node), no `--` on dirname (B3 --node -n/node), no DRV -ef (N16), no OUT_L fallback (N17), always cd -P
// (N18), no MD-38 (MD38), no `%/` (M2), loader globs dropped / exact forms only (MOD), a `*require*|*import*|*loader*` arm (MOD-node), `--eval*|--print*` narrowed / exact-only / unanchored `*eval*|*print*` (EVAL / EVAL-node), no `--` on command -v (B3 --node -nd). The race-only backstop (`: >"$REPORT"` after mkdir) is an accepted survivor.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, readdirSync, existsSync, statSync,
    copyFileSync, realpathSync, symlinkSync, linkSync, unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (names the last passed row).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.EXT_AUDIT_ALLOC_ROOT || join(HERE, '..'));
const SCRIPT = join(ROOT, 'allocation-diff.sh');
const skip = process.platform === 'win32' ? 'bash scripts: POSIX hosts only' : false;
const asRoot = !!(process.getuid && process.getuid() === 0);
const rootSkip = skip || (asRoot ? 'root ignores file modes' : false);
const BASH = '/bin/bash';
const P = 'allocation-diff:';

// the host environment never reaches the script (same strip list as test/allocation-diff.test.mjs)
const ENV = { ...process.env };
for (const k of ['NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE', 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'BASH_ENV', 'ENV', 'TMPDIR',
    'CDPATH', 'SHELLOPTS', 'BASHOPTS', 'POSIXLY_CORRECT']) delete ENV[k];
for (const k of Object.keys(ENV)) if (k.startsWith('BASH_FUNC_')) delete ENV[k];

// A Scavenge line as --trace-gc prints it (ends with "; "); 3 in the window + 1 after `end` (the exit fence).
const LS = '[30520:0x7966000000]       39 ms: Scavenge 5.0 (6.1) -> 4.3 (6.6) MB, pooled: 0.0 MB, 0.48 / 0.00 ms (average mu = 1.000, current mu = 1.000) allocation failure; ';
const TRACE = ['@@LITE-MARK start', LS, LS, LS, '@@LITE-MARK end', LS, '@@LITE-MARK gcn', ''].join('\n');
const V8O = join(HERE, 'fixtures', 'v8flags', 'v8-options.v26.8.2.txt'); // the G1 fixture: `node --v8-options` of v26.8.2
const MKTEMP = (spawnSync(BASH, ['-c', 'command -v mktemp'], { encoding: 'utf8', env: ENV }).stdout || '').trim();

function mkFakeNode(path) {
    assert.ok(existsSync(V8O), `the G1 fixture is missing: ${V8O}`);   // the --v8-options arm replays it
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, [`#!${BASH}`, 'd=${0%/*}', 'printf "%s\\n" "$*" >>"$d/log"', 'printf "%s\\n" "$PWD" >>"$d/pwd"',
        'if [ -n "${NODE_OPTIONS+x}" ]; then echo "NODE_OPTIONS leaked"; exit 7; fi',
        'case "$1" in --version) echo v26.8.2; exit 0 ;; esac',
        // --v8-options: the fixture, replayed with a read loop (no fork), before any driver handling
        `case "$1" in --v8-options) { while IFS= read -r l || [ -n "$l" ]; do printf "%s\\n" "$l"; done; } <${JSON.stringify(V8O)} || exit 4; exit 0 ;; esac`,
        'last=; for a; do last=$a; done',
        'case "$last" in -*) echo "bad option: $last" >&2; exit 9 ;; esac',
        // no fork past the spawn itself (no cat / awk / dirname): cat / awk forks under load, with awk stderr swallowed, could make the guard count vanish silently (suspected cause of the B4B-ok flake,
        // "no guard count in run 2"). A rig failure now exits 4 / 5, which no row reads as a guard count.
        '[ -r ./trace.txt ] || exit 5',
        '{ while IFS= read -r l || [ -n "$l" ]; do printf "%s\\n" "$l"; done; true; } <./trace.txt || exit 4',
        String.raw`if [ -e /dev/fd/3 ]; then c=0; re='^\[[0-9]+:0x'; while IFS= read -r l || [ -n "$l" ]; do [ "$l" = "@@LITE-MARK gcn" ] && break; [[ $l =~ $re ]] && c=$((c + 1)); done <./trace.txt || exit 4; printf "%d\n" "$c" >&3 || exit 4; fi`,
        'exit 0', ''].join('\n'));
    chmodSync(path, 0o755);
}
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);

// A row's world: d/{mk,dr,tmp,cwd,fk,bin}. fk/node = the fake that must run; bin/node = a guard fake on PATH (must never run);
// mk/mktemp = a logging shim. Drivers: g.drv('a/d.js') lives under d/dr (outside cwd); g.cdrv('sub/d.js') under cwd. Each driver dir holds trace.txt.
function rig() {
    const d = realpathSync(mkdtempSync(join(tmpdir(), 'ea-alloc-')));
    for (const x of ['mk', 'dr', 'tmp', 'cwd']) mkdirSync(join(d, x));
    const fakes = new Set();
    const fake = (p) => { mkFakeNode(p); fakes.add(dirname(p)); return p; };
    const node = fake(join(d, 'fk', 'node'));
    fake(join(d, 'bin', 'node'));
    const mkl = join(d, 'mk.log');
    writeFileSync(join(d, 'mk', 'mktemp'), [`#!${BASH}`, `printf '%s\\n' "$*" >>'${mkl}'`, `exec '${MKTEMP}' "$@"`, ''].join('\n'));
    chmodSync(join(d, 'mk', 'mktemp'), 0o755);
    const mkdrv = (p) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, ''); writeFileSync(join(dirname(p), 'trace.txt'), TRACE); return p; };
    const a = mkdrv(join(d, 'dr', 'a', 'd.js')), b = mkdrv(join(d, 'dr', 'b', 'd.js'));
    const modes = [];
    const resetLogs = () => {
        writeFileSync(mkl, '');
        for (const fd of fakes) if (existsSync(fd)) for (const e of readdirSync(fd)) if (e === 'log' || e === 'pwd' || e.endsWith('.n')) rmSync(join(fd, e), { force: true });
    };
    const pathOf = (...front) => [...front, join(d, 'mk'), join(d, 'bin'), process.env.PATH].join(':');
    const run = (args, o = {}) => {
        resetLogs();
        const r = spawnSync(BASH, [o.script || SCRIPT, ...args], {
            encoding: 'utf8', timeout: 120000, cwd: o.cwd || join(d, 'cwd'),
            env: { ...ENV, PATH: pathOf(), TMPDIR: join(d, 'tmp'), ...(o.env || {}) },
        });
        const argv = [...fakes].flatMap((fd) => lines(join(fd, 'log')));
        return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || ''), lines: ((r.stdout || '') + (r.stderr || '')).split('\n'), argv, mk: lines(mkl), error: r.error };
    };
    // every entry under d (relative), the two kinds of log excepted: a refusal writes nothing anywhere
    const ents = () => {
        const acc = [];
        const walk = (p) => {
            for (const e of readdirSync(p, { withFileTypes: true })) {
                const q = join(p, e.name);
                if (q === mkl || (e.name === 'log' || e.name === 'pwd' || e.name.endsWith('.n')) && fakes.has(p)) continue;
                acc.push(relative(d, q) + (e.isFile() ? ` (${statSync(q).size} B)` : ''));
                if (e.isDirectory() && !e.isSymbolicLink()) { try { walk(q); } catch { acc.push(relative(d, q) + '/<unreadable>'); } }
            }
        };
        walk(d);
        return acc.sort();
    };
    return {
        d, node, a, b, cwd: join(d, 'cwd'), fake, run, ents, pathOf, mkdrv,
        drv: (rel) => mkdrv(join(d, 'dr', rel)),
        cdrv: (rel) => mkdrv(join(d, 'cwd', rel)),
        lock: (p, m) => { chmodSync(p, m); modes.push(p); },
        done: () => {
            const fix = (p) => { try { chmodSync(p, 0o755); } catch { /* gone */ } };
            const all = (p) => { fix(p); let st; try { st = readdirSync(p, { withFileTypes: true }); } catch { return; } for (const e of st) if (e.isDirectory() && !e.isSymbolicLink()) all(join(p, e.name)); };
            for (const p of modes) fix(p);
            all(d);
            rmSync(d, { recursive: true, force: true });
        },
    };
}
const row = (name, fn, { root = false } = {}) => test(name, { skip: root ? rootSkip : skip }, () => { const g = rig(); try { fn(g); } finally { g.done(); } });

// refused: exit 2, stdout empty, stderr exactly the die line + VERDICT NO-VERDICT, 0 node spawns, 0 mktemp, 0 new entries
function refused(g, args, msg, o = {}) {
    const b0 = g.ents();
    const r = g.run(args, o);
    const what = JSON.stringify(args);
    assert.equal(r.error, undefined, `${what}: spawn error ${r.error}`);
    assert.equal(r.status, 2, `${what}\n${r.out}`);
    assert.equal(r.stdout, '', `${what}: stdout`);
    assert.equal(r.stderr, `${P} ${msg}\nVERDICT NO-VERDICT\n`, what);
    assert.deepEqual(r.argv, [], `${what}: node spawned`);
    assert.deepEqual(r.mk, [], `${what}: mktemp called`);
    assert.deepEqual(readdirSync(join(g.d, 'tmp')), [], `${what}: TMPDIR entries`);
    assert.deepEqual(g.ents(), b0, `${what}: entries written`);
    return r;
}
// MD-50 (lib/v8flags.sh die line, prefixed): the allowlist refusal comes AFTER the --version and --v8-options reads.
const V8MSG = (f) => `--v8-flags must not set ${f}: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)`;
// refusedRead: exit 2, stdout empty, stderr exactly the die line + VERDICT NO-VERDICT, node spawned exactly [--version, --v8-options], 0 mktemp, nothing written
function refusedRead(g, args, msg, o = {}) {
    const b0 = g.ents();
    const r = g.run(args, o);
    const what = JSON.stringify(args);
    assert.equal(r.error, undefined, `${what}: spawn error ${r.error}`);
    assert.equal(r.status, 2, `${what}\n${r.out}`);
    assert.equal(r.stdout, '', `${what}: stdout`);
    assert.equal(r.stderr, `${P} ${msg}\nVERDICT NO-VERDICT\n`, what);
    assert.deepEqual(r.argv, ['--version', '--v8-options'], `${what}: spawns`);
    assert.deepEqual(r.mk, [], `${what}: mktemp called`);
    assert.deepEqual(readdirSync(join(g.d, 'tmp')), [], `${what}: TMPDIR entries`);
    assert.deepEqual(g.ents(), b0, `${what}: entries written`);
    return r;
}
const keep = (p, want, what) => assert.equal(readFileSync(p, 'utf8'), want, `${what} bytes unchanged`);
const D = (g) => [g.a, g.b];
const N = (g, ...rest) => ['--node', g.node, ...rest];
const HDR = [/^before {2}(.+) {2}sha256\/8 [0-9a-f]{8}$/, /^after {3}(.+) {2}sha256\/8 [0-9a-f]{8}$/];
function hdr(r, path) {
    for (const re of HDR) {
        const m = r.lines.filter((l) => re.test(l));
        assert.equal(m.length, 1, `one header line ${re}\n${r.out}`);
        assert.equal(m[0].match(re)[1], path, r.out);
    }
}
function accepted(r, what = '') { assert.equal(r.error, undefined, `${what} ${r.error}`); assert.equal(r.status, 0, `${what}\n${r.out}`); assert.ok(r.lines.includes('VERDICT SAME'), `${what}\n${r.out}`); }

// the die texts (PLAN TASK 1-3 / C-3, C-8, C-10, C-11, C-26, C-27, C-28, C-29)
const SYM = (o) => `--out: ${o}/report.txt is a symlink (refused: the write would follow it)`;
const RAWSYM = (o) => `--out: ${o}/raw is a symlink (refused: the writes would follow it)`;
const HL = (o) => `--out: ${o}/report.txt has another hard link (refused: the write would change that file too)`;
const CW = (o) => `--out: cannot write ${o}/report.txt`;
const WALK = (o, x) => `--out: cannot create ${o}/raw/before and ${o}/raw/after (${x} is not a writable directory)`;
const NOEXE = (p) => `node binary is not an executable file: ${p}`;
const ENVMSG = (f) => `--v8-flags must not set ${f}: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process`;

// ---------------------------------------------------------------------------------------------------------------------
// B2: an exported CDPATH must not make `cd` print: the head path stays on ONE line, the out line is absolute.
// Red on frozen: `cd sub` under CDPATH=. prints the directory into $(...). [mutant: unset CDPATH after the include -> the self-test row only]
// ---------------------------------------------------------------------------------------------------------------------
for (const withOut of [false, true]) {
    row(`B2 CDPATH=. relative driver sub/driver.js ${withOut ? 'with --out rel_out' : 'without --out'}`, (g) => {
        g.cdrv('sub/driver.js');
        const r = g.run(N(g, '--runs', '2', ...(withOut ? ['--out', 'rel_out'] : []), 'sub/driver.js', 'sub/driver.js'), { env: { CDPATH: '.' } });
        accepted(r);
        hdr(r, `${g.cwd}/sub/driver.js`);
        if (withOut) {
            assert.ok(r.lines.includes(`out     ${g.cwd}/rel_out`), `out line on one line\n${r.out}`);
            assert.ok(statSync(join(g.cwd, 'rel_out', 'report.txt')).isFile());
        }
    });
}
row('B2 CDPATH=. bash sub/allocation-diff.sh --self-test exits 0', () => {
    const S = realpathSync(mkdtempSync(join(tmpdir(), 'ea-alloc-st-')));
    try {
        mkdirSync(join(S, 'sub')); copyFileSync(SCRIPT, join(S, 'sub', 'allocation-diff.sh'));
        // cap 480000 (was 300000): CI run 42056284029, this one spawn took 153.8 s (macOS node 26.8.2) / 131.5 s (macOS node 22)
        const r = spawnSync(BASH, ['sub/allocation-diff.sh', '--self-test'], { encoding: 'utf8', timeout: 480000, cwd: S, env: { ...ENV, CDPATH: '.', TMPDIR: S } });
        const out = (r.stdout || '') + (r.stderr || '');
        assert.equal(r.status, 0, out.split('\n').slice(-25).join('\n'));
    } finally { rmSync(S, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------------------------------
// B4B: --v8-flags shape is --[A-Za-z]* (C-9: "each starts with -- and a letter"). Three malformed flags refused, 0 spawns; the control is accepted.
// ---------------------------------------------------------------------------------------------------------------------
for (const f of ['---x', '--1', '--=x']) {
    row(`B4B --v8-flags ${f} refused: exit 2, one "(each starts with -- and a letter)" line, 0 spawns`, (g) => {
        refused(g, N(g, '--v8-flags', f, ...D(g)), `--v8-flags takes flags only (each starts with -- and a letter), got '${f}'`);
    });
}
row('B4B-ok control --v8-flags --expose-gc accepted: exit 0, --runs 3 = 8 spawns + 1 mktemp, every run carries the flag', (g) => {
    const r = g.run(N(g, '--runs', '3', '--v8-flags', '--expose-gc', ...D(g)));
    accepted(r);
    assert.equal(r.argv.length, 8, r.argv.join('\n'));
    assert.deepEqual(r.argv.slice(0, 2), ['--version', '--v8-options'], r.argv.join('\n'));
    assert.equal(r.mk.length, 1, r.mk.join('\n'));
    assert.equal(r.argv.filter((l) => l.startsWith('--expose-gc ')).length, 6, r.argv.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------------
// ENV (C-29, MD-39): --v8-flags must not load a file of environment variables / node options into the measured process. The arm
// reads `_` as `-`. [mutant: no env arm]
// ---------------------------------------------------------------------------------------------------------------------
row('ENV --v8-flags --env-file / --env_file / --env-file-if-exists / --experimental-config-file / --experimental-default-config-file refused', (g) => {
    for (const f of ['--env-file=F', '--env_file=F', '--env-file-if-exists=F', '--experimental-config-file=F', '--experimental-default-config-file=F',
        '--env-file', '--experimental-default-config-file']) {
        refused(g, N(g, '--v8-flags', f, ...D(g)), ENVMSG(f));
    }
});

// ---------------------------------------------------------------------------------------------------------------------
// B3: dash-led names reach node / ls / cd as data (C-6, C-8, C-9).
// ---------------------------------------------------------------------------------------------------------------------
row('B3 --out -o with ./-o/raw/x present: exit 2, one "./-o/raw is not empty" line, 0 spawns, x unchanged', (g) => {
    mkdirSync(join(g.cwd, '-o', 'raw'), { recursive: true }); writeFileSync(join(g.cwd, '-o', 'raw', 'x'), 'keep\n');
    refused(g, N(g, '--out', '-o', ...D(g)), '--out: ./-o/raw is not empty (give a new or empty DIR)');
    keep(join(g.cwd, '-o', 'raw', 'x'), 'keep\n', '-o/raw/x');
    assert.deepEqual(readdirSync(join(g.cwd, '-o')), ['raw'], 'no -o/report.txt');
});
for (const [name, dirName, arg] of [['--node -/node (dir named -)', '-', '-/node'], ['--node -n/node (dir named -n)', '-n', '-n/node']]) {
    row(`B3 ${name}: exit 0, every spawn is <cwd>/${dirName}/node and the head names it`, (g) => {
        g.fake(join(g.cwd, dirName, 'node'));
        const r = g.run(['--node', arg, '--runs', '2', ...D(g)]);
        accepted(r, arg);
        assert.equal(r.argv.length, 6, `2 + 2 x 2 spawns, got:\n${r.argv.join('\n')}`);
        assert.equal(lines(join(g.cwd, dirName, 'log')).length, 6, 'every spawn is the named fake');
        assert.equal(lines(join(g.d, 'fk', 'log')).length, 0, 'no other fake ran');
        assert.ok(r.lines.includes(`allocation-diff  node v26.8.2  ${g.cwd}/${dirName}/node  (NODE_OPTIONS stripped)`), r.out);
    });
}

const MODMSG = (f) => `--v8-flags must not set ${f}: it loads a module of yours into the measured process (a preload or a module loader; a --require one runs ahead of the guard's own --require <tmp>/gcn.cjs)`;

// MOD (D2-8, MD-42): a --v8-flags flag that loads a module of yours is refused (prefix glob, MD-43); -r dies at the letter gate; the accept control
// --experimental-require-module is NOT a --require* match (the arm is an anchored prefix, not *require*).
row('MOD --v8-flags --loader=F / --loader / --experimental-loader=F / --experimental_loader=F / --import=F / --import / --require=F / --require / --require-module refused', (g) => {
    for (const f of ['--loader=F', '--loader', '--experimental-loader=F', '--experimental_loader=F', '--import=F', '--import', '--require=F', '--require', '--require-module']) {
        refused(g, N(g, '--v8-flags', f, ...D(g)), MODMSG(f));
    }
});
row('MOD-r --v8-flags "-r ./p.js" refused at the letter gate: exit 2, "got \'-r\'", 0 spawns', (g) => {
    refused(g, N(g, '--v8-flags', '-r ./p.js', ...D(g)), "--v8-flags takes flags only (each starts with -- and a letter), got '-r'");
});
row('MOD-node --v8-flags --experimental-require-module (a node option, not a V8 flag) refused after the --v8-options read: exit 2, argv exactly [--version, --v8-options], 0 mktemp', (g) => {
    refusedRead(g, N(g, '--runs', '3', '--v8-flags', '--experimental-require-module', ...D(g)), V8MSG('--experimental-require-module'));
});

const EVALMSG = (f) => `--v8-flags must not set ${f}: it runs code of yours in the measured process instead of the driver (node evaluates it; the driver becomes argv and never runs)`;

// EVAL (D3-1, MD-44): a --v8-flags flag that makes node evaluate code is refused (anchored prefix glob --eval* / --print*); -e / -p die at the
// letter gate; the controls are accepted flags that merely contain "print" (--experimental-print-required-tla is NOT a --print* match).
row('EVAL --v8-flags --eval=F / --eval / --print=F / --print / --print-bytecode / --print_opt_code refused', (g) => {
    for (const f of ['--eval=F', '--eval', '--print=F', '--print', '--print-bytecode', '--print_opt_code']) {
        refused(g, N(g, '--v8-flags', f, ...D(g)), EVALMSG(f));
    }
});
row('EVAL-ep --v8-flags "-e 1" / "-p 1" refused at the letter gate: exit 2, "got \'-e\'" / "got \'-p\'", 0 spawns', (g) => {
    refused(g, N(g, '--v8-flags', '-e 1', ...D(g)), "--v8-flags takes flags only (each starts with -- and a letter), got '-e'");
    refused(g, N(g, '--v8-flags', '-p 1', ...D(g)), "--v8-flags takes flags only (each starts with -- and a letter), got '-p'");
});
row('EVAL-node --v8-flags --experimental-print-required-tla (a node option, not a V8 flag) refused after the --v8-options read: exit 2, argv exactly [--version, --v8-options], 0 mktemp', (g) => {
    refusedRead(g, N(g, '--runs', '3', '--v8-flags', '--experimental-print-required-tla', ...D(g)), V8MSG('--experimental-print-required-tla'));
});

// F15 (MD-50): node options that no earlier arm names are refused by the allowlist after the read (2 spawns, nothing written).
for (const f of ['--snapshot-blob=F', '--build-snapshot', '--openssl-config=F']) {
    row(`F15 --v8-flags ${f} refused after the --v8-options read: exit 2, argv exactly [--version, --v8-options], 0 mktemp`, (g) => {
        refusedRead(g, N(g, '--v8-flags', f, ...D(g)), V8MSG(f));
    });
}
// V8-ok: V8 tuning flags listed by the node (bool negated, int with =N) are accepted: --runs 3 = 8 spawns, 1 mktemp, the 6 runs carry both flags first.
row('V8-ok --v8-flags "--no-lazy-feedback-allocation --max-inlined-bytecode-size=30" accepted: exit 0, --runs 3 = 8 spawns + 1 mktemp, every run carries both flags', (g) => {
    const r = g.run(N(g, '--runs', '3', '--v8-flags', '--no-lazy-feedback-allocation --max-inlined-bytecode-size=30', ...D(g)));
    accepted(r);
    assert.equal(r.argv.length, 8, r.argv.join('\n'));
    assert.deepEqual(r.argv.slice(0, 2), ['--version', '--v8-options'], r.argv.join('\n'));
    assert.equal(r.mk.length, 1, r.mk.join('\n'));
    assert.equal(r.argv.filter((l) => l.startsWith('--no-lazy-feedback-allocation --max-inlined-bytecode-size=30 ')).length, 6, r.argv.join('\n'));
});
// V8R retention (PLAN A4): 20 cycles of an allowlist refusal (--snapshot-blob=F) + an accepted V8 run leave TMPDIR empty; cwd and the driver dirs unchanged.
row('V8R retention: 20 cycles of --snapshot-blob=F refusal (2 spawns) + V8-ok accept (--runs 2 = 6 spawns) leave TMPDIR, cwd and the driver dirs unchanged', (g) => {
    const lsr = (p) => readdirSync(p, { recursive: true }).sort().join(',');
    const cwdLs = lsr(g.cwd), drLs = lsr(join(g.d, 'dr'));
    for (let c = 0; c < 20; c++) {
        const bad = g.run(N(g, '--v8-flags', '--snapshot-blob=F', ...D(g)));
        assert.equal(bad.status, 2, `cycle ${c} refusal\n${bad.out}`);
        assert.deepEqual(bad.argv, ['--version', '--v8-options'], `cycle ${c} refusal spawns`);
        assert.deepEqual(readdirSync(join(g.d, 'tmp')), [], `cycle ${c}: TMPDIR after refusal`);
        const ok = g.run(N(g, '--runs', '2', '--v8-flags', '--no-lazy-feedback-allocation --max-inlined-bytecode-size=30', ...D(g)));
        accepted(ok, `cycle ${c} accept`);
        assert.equal(ok.argv.length, 6, `cycle ${c} accept spawns\n${ok.argv.join('\n')}`);
        assert.deepEqual(readdirSync(join(g.d, 'tmp')), [], `cycle ${c}: TMPDIR after accept`);
        assert.equal(lsr(g.cwd), cwdLs, `cycle ${c}: cwd listing changed`);
        assert.equal(lsr(join(g.d, 'dr')), drLs, `cycle ${c}: driver dirs changed`);
    }
});

// D2-9: a node named -nd found on PATH (a dash-led bare name) is data, not an option. Red on frozen (no `--` on command -v).
row('B3 --node -nd (an executable -nd on PATH): exit 0, every spawn is <S>/pn/-nd and the head names it', (g) => {
    const f = g.fake(join(g.d, 'pn', '-nd'));
    const r = g.run(['--node', '-nd', '--runs', '2', ...D(g)], { env: { PATH: g.pathOf(join(g.d, 'pn')) } });
    accepted(r, '-nd');
    assert.deepEqual([r.argv.length, lines(join(g.d, 'pn', 'log')).length], [6, 6], r.argv.join('\n'));
    assert.ok(r.lines.includes(`allocation-diff  node v26.8.2  ${f}  (NODE_OPTIONS stripped)`), r.out);
});

// B1b: a directory is not a node binary. exit 2, the "not an executable file" line naming it, 0 spawns. [mutant: drop the -f / -x check]
row('B1b --node <dir> -> exit 2, one "node binary is not an executable file: <dir>" line, 0 spawns', (g) => {
    mkdirSync(join(g.d, 'nodedir'));
    refused(g, ['--node', join(g.d, 'nodedir'), ...D(g)], NOEXE(join(g.d, 'nodedir')));
});

// ---------------------------------------------------------------------------------------------------------------------
// M1 / M1b (C-10): an unwritable report.txt is a clean refusal before any spawn and before raw/ is made.
// ---------------------------------------------------------------------------------------------------------------------
row('M1 existing OUT with report.txt mode 0444, no raw/: exit 2, "cannot write", 0 spawns, no raw/, bytes unchanged', (g) => {
    const o = join(g.d, 'o1'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n'); g.lock(join(o, 'report.txt'), 0o444);
    refused(g, N(g, '--out', o, ...D(g)), CW(o));
    assert.equal(existsSync(join(o, 'raw')), false, 'raw/ must not be created');
    keep(join(o, 'report.txt'), 'old\n', 'report.txt');
}, { root: true });
row('M1b existing OUT mode 0555 with no report.txt: exit 2, "cannot write", 0 spawns, no raw/', (g) => {
    const o = join(g.d, 'o1b'); mkdirSync(o); g.lock(o, 0o555);
    refused(g, N(g, '--out', o, ...D(g)), CW(o));
    assert.equal(existsSync(join(o, 'raw')), false, 'raw/ must not be created');
}, { root: true });

// ---------------------------------------------------------------------------------------------------------------------
// M2 (static): the root script prints no bare "${DRV_DIR[$i]}/" join (a driver in / would print //x). Printed joins = `say` lines and
// DESC assignments, with the sha8 "<path>" argument stripped (it is a read, not printed). Frozen: 1 (the DESC[$i] line).
// ---------------------------------------------------------------------------------------------------------------------
row('M2 static: 0 printed "${DRV_DIR[$i]}/" joins in allocation-diff.sh', () => {
    const hits = [];
    readFileSync(SCRIPT, 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*#/.test(l)) return;
        const s = l.replace(/sha8 "[^"]*"/g, 'sha8 X');
        if (/(^|[^A-Za-z_])(say |DESC(\[[^\]]*\])?=)/.test(s)) {
            const m = s.match(/\$\{?DRV_[A-Z_]*DIR(\[[^\]]*\])?\}?\//g);
            if (m) hits.push(`${i + 1}: x${m.length} ${l.trim()}`);
        }
    });
    assert.equal(hits.length, 0, hits.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------------
// SYM (C-3, MD-34): EVERY report.txt that is a symlink is refused, even one pointing inside OUT; the target is untouched / not created, no raw/.
// ---------------------------------------------------------------------------------------------------------------------
row('SYM report.txt a live symlink to S/target ("KEEP"): exit 2, "is a symlink", 0 spawns, target stays "KEEP", no raw/', (g) => {
    const o = join(g.d, 'osym'); mkdirSync(o);
    writeFileSync(join(g.d, 'target'), 'KEEP\n'); symlinkSync(join(g.d, 'target'), join(o, 'report.txt'));
    refused(g, N(g, '--out', o, ...D(g)), SYM(o));
    keep(join(g.d, 'target'), 'KEEP\n', 'target');
    assert.equal(existsSync(join(o, 'raw')), false, 'no OUT/raw');
});
row('SYM report.txt a dangling RELATIVE symlink inside OUT (MD-34 "even inside DIR"): exit 2, 0 spawns, target not created, no raw/', (g) => {
    const o = join(g.d, 'osym2'); mkdirSync(o); symlinkSync('newfile', join(o, 'report.txt'));
    refused(g, N(g, '--out', o, ...D(g)), SYM(o));
    assert.equal(existsSync(join(o, 'newfile')), false, 'target not created');
    assert.deepEqual(readdirSync(o), ['report.txt']);
});

// ---------------------------------------------------------------------------------------------------------------------
// MD36 (C-26): a raw/ that is a symlink is refused (was: written through, even to a dir outside OUT).
// ---------------------------------------------------------------------------------------------------------------------
row('MD36a raw -> symlink to an empty writable dir outside OUT: exit 2, "raw is a symlink", 0 spawns, the target dir stays empty', (g) => {
    const o = join(g.d, 'o36a'); mkdirSync(o);
    const ext = join(g.d, 'ext36'); mkdirSync(ext);
    symlinkSync(ext, join(o, 'raw'));
    refused(g, N(g, '--out', o, ...D(g)), RAWSYM(o));
    assert.deepEqual(readdirSync(ext), [], 'target dir still empty');
    assert.deepEqual(readdirSync(o), ['raw']);
});
row('MD36b raw -> dangling symlink: exit 2, "raw is a symlink", 0 spawns, link target not created', (g) => {
    const o = join(g.d, 'o36b'); mkdirSync(o);
    symlinkSync(join(g.d, 'gone36', 'x'), join(o, 'raw'));
    refused(g, N(g, '--out', o, ...D(g)), RAWSYM(o));
    assert.equal(existsSync(join(g.d, 'gone36')), false, 'link target not created');
});

// ---------------------------------------------------------------------------------------------------------------------
// MD37 (C-27): a report.txt with another hard link is refused (portable `find -links +1`); a find that fails refuses too (fail closed).
// ---------------------------------------------------------------------------------------------------------------------
row('MD37a report.txt hard-linked to an unrelated file: exit 2, "has another hard link", 0 spawns, the other file keeps its bytes', (g) => {
    const o = join(g.d, 'o37a'); mkdirSync(o);
    writeFileSync(join(g.d, 'victim'), 'VICTIM\n'); linkSync(join(g.d, 'victim'), join(o, 'report.txt'));
    refused(g, N(g, '--out', o, ...D(g)), HL(o));
    keep(join(g.d, 'victim'), 'VICTIM\n', 'victim'); keep(join(o, 'report.txt'), 'VICTIM\n', 'report.txt');
    assert.equal(existsSync(join(o, 'raw')), false, 'no OUT/raw');
});
row('MD37b a `find` that exits 1 (single-link report.txt): fail closed, exit 2, "has another hard link", 0 spawns', (g) => {
    const o = join(g.d, 'o37b'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n');
    mkdirSync(join(g.d, 'shim')); writeFileSync(join(g.d, 'shim', 'find'), '#!/bin/sh\nexit 1\n'); chmodSync(join(g.d, 'shim', 'find'), 0o755);
    refused(g, N(g, '--out', o, ...D(g)), HL(o), { env: { PATH: g.pathOf(join(g.d, 'shim')) } });
    keep(join(o, 'report.txt'), 'old\n', 'report.txt');
});
// DRV1 (regression pin, green on frozen; PLAN D1 (2)): a report.txt that IS the DRIVER (same inode, single link) is refused by the DRIVER -ef loop, not MD-37.
// [mutant: no DRIVER -ef loop]
row('DRV1 --out D with DRIVER D/report.txt (single-link file): exit 2, one "report.txt is the DRIVER (before)" line, 0 spawns, driver bytes unchanged', (g) => {
    const o = join(g.d, 'odrv'); mkdirSync(o); const dv = join(o, 'report.txt'); writeFileSync(dv, '// driver\n');
    refused(g, N(g, '--out', o, dv, g.b), `--out: ${o}/report.txt is the DRIVER (before) ${dv}`);
    keep(dv, '// driver\n', 'driver');
    assert.deepEqual(readdirSync(o), ['report.txt']);
});
row('MD37c control: existing single-link report.txt, no raw/ -> exit 0, report rewritten, --runs 3 = 8 spawns + 1 mktemp', (g) => {
    const o = join(g.d, 'o37c'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n');
    const r = g.run(N(g, '--runs', '3', '--out', o, ...D(g)));
    accepted(r);
    const rep = readFileSync(join(o, 'report.txt'), 'utf8');
    assert.ok(rep.length > 0 && rep !== 'old\n', `report.txt rewritten, got ${JSON.stringify(rep)}`);
    assert.ok(statSync(join(o, 'raw', 'before')).isDirectory() && statSync(join(o, 'raw', 'after')).isDirectory(), 'raw/before + raw/after');
    assert.equal(r.argv.length, 8, r.argv.join('\n'));
    assert.equal(r.mk.length, 1, r.mk.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------------
// MD38 (C-28): a resolved node path with a newline anywhere is refused before any spawn. cwd = <S>/a<NL>b, --node ./node.
// ---------------------------------------------------------------------------------------------------------------------
row('MD38 cwd "<S>/a<newline>b" + --node ./node: exit 2, "a newline is not allowed in the resolved path", 0 spawns', (g) => {
    const nl = join(g.d, 'a\nb'); g.fake(join(nl, 'node'));
    refused(g, ['--node', './node', ...D(g)], 'node binary: a newline is not allowed in the resolved path', { cwd: nl });
});

// ---------------------------------------------------------------------------------------------------------------------
// N29-N36 (C-11): the writable-ancestor walk. All refuse with the walk's line naming the first existing ancestor, 0 spawns.
// ---------------------------------------------------------------------------------------------------------------------
row('N29 raw/ mode 0500 (empty): exit 2, "cannot create ... (<OUT>/raw is not a writable directory)", 0 spawns', (g) => {
    const o = join(g.d, 'o29'); mkdirSync(join(o, 'raw'), { recursive: true }); g.lock(join(o, 'raw'), 0o500);
    refused(g, N(g, '--out', o, ...D(g)), WALK(o, `${o}/raw`));
}, { root: true });
row('N30 absent OUT under a 0555 parent: exit 2, "(<parent> is not a writable directory)", 0 spawns, OUT not created', (g) => {
    const ro = join(g.d, 'ro30'); mkdirSync(ro); g.lock(ro, 0o555);
    const o = join(ro, 'new');
    refused(g, N(g, '--out', o, ...D(g)), WALK(o, ro));
    assert.equal(existsSync(o), false, 'OUT not created');
}, { root: true });
row('N31 OUT a dangling symlink: exit 2, "(<OUT> is not a writable directory)", 0 spawns, link target not created', (g) => {
    const o = join(g.d, 'dang31'); symlinkSync(join(g.d, 'nowhere31'), o);
    refused(g, N(g, '--out', o, ...D(g)), WALK(o, o));
    assert.equal(existsSync(join(g.d, 'nowhere31')), false, 'link target not created');
});
row('N31z --zero mode, OUT a dangling symlink: exit 2, "cannot create <OUT>/raw/driver (<OUT> is not a writable directory)", 0 spawns', (g) => {
    const o = join(g.d, 'dang31z'); symlinkSync(join(g.d, 'nowhere31z'), o);
    refused(g, N(g, '--out', o, '--zero', g.a), `--out: cannot create ${o}/raw/driver (${o} is not a writable directory)`);
    assert.equal(existsSync(join(g.d, 'nowhere31z')), false, 'link target not created');
});
row('N32 OUT mode 0555 with a writable report.txt, no raw/: exit 2, "(<OUT> is not a writable directory)", 0 spawns, no raw/', (g) => {
    const o = join(g.d, 'o32'); mkdirSync(o); writeFileSync(join(o, 'report.txt'), 'old\n'); g.lock(o, 0o555);
    refused(g, N(g, '--out', o, ...D(g)), WALK(o, o));
    assert.equal(existsSync(join(o, 'raw')), false, 'no raw/'); keep(join(o, 'report.txt'), 'old\n', 'report.txt');
}, { root: true });
// N33 control: an absent NESTED OUT (S/new/a/b) and a bare relative `--out o` both succeed (a walk over the immediate parent only is red).
row('N33 control: absent nested OUT S/new/a/b and bare relative --out o -> exit 0, report.txt + raw/before + raw/after, 8 spawns + 1 mktemp each', (g) => {
    const nested = join(g.d, 'new', 'a', 'b');
    for (const [out, dir] of [[nested, nested], ['o', join(g.cwd, 'o')]]) {
        const r = g.run(N(g, '--runs', '3', '--out', out, ...D(g)));
        accepted(r, `--out ${out}`);
        assert.ok(statSync(join(dir, 'report.txt')).size > 0, `${dir}/report.txt non-empty`);
        assert.ok(statSync(join(dir, 'raw', 'before')).isDirectory() && statSync(join(dir, 'raw', 'after')).isDirectory(), `${dir}/raw/before + after`);
        assert.equal(r.argv.length, 8, r.argv.join('\n'));
        assert.equal(r.mk.length, 1, r.mk.join('\n'));
    }
});
// N34 [mutant: walk without `!= .` -> infinite loop -> the 10 s spawn timeout reads as red]: cwd mode 0000 + relative `--out o`. The cwd is locked
// from INSIDE the spawn (`cd D && chmod 000 .`), because spawnSync cannot chdir into a 0000 dir.
row('N34 cwd mode 0000 + relative --out o: exit 2, "(. is not a writable directory)", 0 spawns, no hang', (g) => {
    const args = N(g, '--out', 'o', ...D(g));
    const b0 = g.ents();
    const r0 = spawnSync(BASH, ['-c', 'cd "$1" && chmod 000 . && shift && exec "$@"', 'x', g.cwd, BASH, SCRIPT, ...args],
        { encoding: 'utf8', timeout: 10000, env: { ...ENV, PATH: g.pathOf(), TMPDIR: join(g.d, 'tmp') } });
    try { chmodSync(g.cwd, 0o755); } catch { /* restore */ }
    assert.equal(r0.error, undefined, `no timeout / spawn error: ${r0.error}`);
    const out = (r0.stdout || '') + (r0.stderr || '');
    assert.equal(r0.status, 2, out);
    const want = `${P} ${WALK('o', '.')}`;
    assert.equal(out.split('\n').filter((l) => l === want).length, 1, `exactly one line "${want}"\n${out}`);
    assert.equal(['fk', 'bin'].flatMap((x) => lines(join(g.d, x, 'log'))).length, 0, '0 spawns');
    assert.deepEqual(lines(join(g.d, 'mk.log')), [], '0 mktemp');
    assert.equal(r0.stdout, '', 'stdout');
    assert.deepEqual(readdirSync(join(g.d, 'tmp')), [], 'TMPDIR entries');
    assert.deepEqual(g.ents(), b0, 'entries written');
}, { root: true });
// N35 [mutant: walk without `-x`]: OUT an existing dir of mode 0600 (r/w, no search).
row('N35 OUT an existing dir of mode 0600: exit 2, "(<OUT> is not a writable directory)", 0 spawns', (g) => {
    const o = join(g.d, 'o35'); mkdirSync(o); g.lock(o, 0o600);
    refused(g, N(g, '--out', o, ...D(g)), WALK(o, o));
}, { root: true });
// N36 [mutant: walk without `-d`]: `--out <S>/fx/o`, fx a regular 0755 file (the first existing ancestor is not a directory).
row('N36 --out S/fx/o, fx a regular 0755 file: exit 2, "(<S>/fx is not a writable directory)", 0 spawns, fx unchanged', (g) => {
    const fx = join(g.d, 'fx'); writeFileSync(fx, 'x\n'); chmodSync(fx, 0o755);
    const o = join(fx, 'o');
    refused(g, N(g, '--out', o, ...D(g)), WALK(o, fx));
    keep(fx, 'x\n', 'fx');
});

// ---------------------------------------------------------------------------------------------------------------------
// N37 (C-12): no --node / NODE, PATH = "<S>/p/x<newline>:...": `command -v node` finds "<S>/p/x<newline>/node"; $(dirname) strips the newline so the
// node-dir cd names <S>/p/x (absent): exit 2, 0 spawns, ONE "node binary: cannot resolve the directory of <path>" die (the printed path keeps
// its newline), NO raw "cd:" line.
// ---------------------------------------------------------------------------------------------------------------------
row('N37 PATH entry "<S>/p/x<newline>" holds node, no --node / NODE: exit 2, one "cannot resolve the directory of" die, no raw "cd:" line, 0 spawns', (g) => {
    const nd = `${g.d}/p/x\n/node`; g.fake(nd);
    const r = refused(g, D(g), `node binary: cannot resolve the directory of ${nd}`, { env: { PATH: g.pathOf(`${g.d}/p/x\n`) } });
    assert.equal(r.out.split('cannot resolve the directory of').length - 1, 1, `no other "cannot resolve" line\n${r.out}`);
    assert.equal(r.lines.filter((l) => /(^|[ :])cd: /.test(l)).length, 0, `no raw "cd:" line\n${r.out}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// N9 (static, C-6): exactly 1 non-comment `-ef "$NODE_RES"` line, 1 DRV `-ef` line (the loop over the DRIVERs), 1 `-ef "$OUT"` line. Frozen 0 / 0 / 0.
// ---------------------------------------------------------------------------------------------------------------------
row('N9 static: 1 -ef "$NODE_RES" line, 1 DRV -ef line, 1 -ef "$OUT" line in allocation-diff.sh', () => {
    const src = readFileSync(SCRIPT, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l));
    const node = src.filter((l) => /-ef "\$NODE_RES"/.test(l)), drv = src.filter((l) => /-ef/.test(l) && /DRV_[A-Z_]*DIR/.test(l)), out = src.filter((l) => /-ef "\$OUT"/.test(l));
    assert.equal(node.length, 1, node.join('\n')); assert.equal(drv.length, 1, drv.join('\n')); assert.equal(out.length, 1, out.join('\n'));
});

// ---------------------------------------------------------------------------------------------------------------------
// N14 / N16 / N17 / N18: logical vs physical names. L = <cwd>/link -> <S>/elsewhere/sub, so `link/..` is <S>/elsewhere physically and <cwd> logically.
// ---------------------------------------------------------------------------------------------------------------------
const linkRig = (g) => { mkdirSync(join(g.d, 'elsewhere', 'sub'), { recursive: true }); symlinkSync(join(g.d, 'elsewhere', 'sub'), join(g.cwd, 'link')); };
row('N14 --node link/../node (real node elsewhere, decoy in cwd): exit 2, one "node binary is not an executable file" line, 0 spawns', (g) => {
    linkRig(g); g.fake(join(g.d, 'elsewhere', 'node')); g.fake(join(g.cwd, 'node'));
    refused(g, ['--node', 'link/../node', ...D(g)], NOEXE('link/../node'));
});
for (const [id, tag, mk] of [['N16b', 'before', (bad, ok) => [bad, ok]], ['N16c', 'after', (bad, ok) => [ok, bad]]]) {
    row(`${id} ${tag} driver link/../d.js: exit 2, one "cannot resolve the directory of" line, 0 spawns, cwd unchanged`, (g) => {
        linkRig(g);
        writeFileSync(join(g.d, 'elsewhere', 'd.js'), '// real\n'); writeFileSync(join(g.cwd, 'd.js'), '// decoy, different bytes\n');
        const ok = g.cdrv('ok.js'); const bad = 'link/../d.js';
        refused(g, N(g, ...mk(bad, ok)), `DRIVER (${tag}): cannot resolve the directory of ${bad} (a symlink before '..'?)`);
    });
}
row('N17 --out link/../o: writes S/elsewhere/o (physical), cwd/o stays empty, the head names the physical path', (g) => {
    linkRig(g); mkdirSync(join(g.cwd, 'o'));
    const r = g.run(N(g, '--runs', '2', '--out', 'link/../o', ...D(g)));
    const phys = join(g.d, 'elsewhere', 'o');
    accepted(r);
    assert.ok(statSync(join(phys, 'report.txt')).size > 0, 'elsewhere/o/report.txt non-empty');
    assert.ok(statSync(join(phys, 'raw', 'before')).isDirectory() && statSync(join(phys, 'raw', 'after')).isDirectory(), 'elsewhere/o/raw/before + after');
    assert.equal(readdirSync(join(g.cwd, 'o')).length, 0, 'cwd/o has 0 entries');
    assert.ok(r.lines.includes(`out     ${phys}`), `head "out     ${phys}"\n${r.out}`);
});
// N18 control [mutant: always cd -P]: a symlinked directory reached WITHOUT `..` keeps its logical name.
row('N18 control: driver lnk/d.js and --out lnk/o via a symlinked dir keep the logical names (exit 0)', (g) => {
    const real = join(g.d, 'real'); g.mkdrv(join(real, 'd.js')); symlinkSync(real, join(g.cwd, 'lnk'));
    const r = g.run(N(g, '--runs', '2', '--out', 'lnk/o', 'lnk/d.js', 'lnk/d.js'));
    accepted(r);
    hdr(r, `${g.cwd}/lnk/d.js`);
    assert.ok(r.lines.includes(`out     ${g.cwd}/lnk/o`), `head "out     ${g.cwd}/lnk/o"\n${r.out}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// ALIAS (C-6): BASH_ENV defines `alias node='<abs fake>'`, no --node / NODE. `command -v node` prints "alias node='/abs/..'" (it contains a slash):
// refused as not an executable file, 0 spawns of the fake or of the PATH guard, 0 mktemp.
// ---------------------------------------------------------------------------------------------------------------------
row('ALIAS BASH_ENV alias node=<abs fake>, no --node: exit 2, "node binary is not an executable file: alias node=\'<fake>\'", 0 spawns, 0 mktemp', (g) => {
    const rc = join(g.d, 'alias.rc'); writeFileSync(rc, `shopt -s expand_aliases\nalias node='${g.node}'\n`);
    refused(g, D(g), NOEXE(`alias node='${g.node}'`), { env: { BASH_ENV: rc } });
});

// B1 control [mutant: no resolve-once]: PATH has a RELATIVE entry mybin (cwd holds mybin/node) before an absolute sysbin; the drivers live elsewhere,
// so a per-cwd PATH lookup would pick sysbin for the runs. Every spawn is mybin's fake; sysbin's never runs.
row('B1 control: relative PATH entry, every spawn runs the one node resolved from the launch cwd (exit 0)', (g) => {
    g.fake(join(g.cwd, 'mybin', 'node')); g.fake(join(g.d, 'sysbin', 'node'));
    const r = g.run(['--runs', '2', ...D(g)], { env: { PATH: `mybin:${join(g.d, 'sysbin')}:${join(g.d, 'mk')}:${process.env.PATH}` } });
    accepted(r);
    assert.equal(lines(join(g.d, 'sysbin', 'log')).length, 0, `sysbin must never run\n${r.out}`);
    assert.equal(lines(join(g.cwd, 'mybin', 'log')).length, 6, `mybin spawns: 2 + 2 x 2\n${r.out}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// A4 retention (PLAN A4): 20 cycles of MD36a / MD36b / MD37a / SYM / N30 / N31 / N35 / MD38 / ALIAS with TMPDIR=<S>/tmp leave 0 entries after each cycle;
// cwd, elsewhere/ and the MD37a victim stay unchanged. Every input must exit 2 (else the row proves nothing). Regression pin (a refusal must not leak a
// mktemp dir; a bare macOS `mktemp -d` ignores TMPDIR, so this pins TMPDIR-honouring leaks only).
// ---------------------------------------------------------------------------------------------------------------------
row('A4 retention: 20 cycles of MD36 / MD37a / SYM / N30 / N31 / N35 / MD38 / ALIAS leave TMPDIR empty; cwd, elsewhere/ and the MD37a victim unchanged', (g) => {
    const tmp = join(g.d, 'tmp');
    const els = join(g.d, 'elsewhere'); mkdirSync(join(els, 'ext'), { recursive: true });
    writeFileSync(join(els, 'victim'), 'VICTIM\n'); writeFileSync(join(els, 'target'), 'KEEP\n');
    const nl = join(g.d, 'a\nb'); g.fake(join(nl, 'node'));
    const rc = join(g.d, 'alias.rc'); writeFileSync(rc, `shopt -s expand_aliases\nalias node='${g.node}'\n`);
    const lsr = (p) => readdirSync(p, { recursive: true }).sort().join(',');
    const cwdLs = lsr(g.cwd), elsLs = lsr(els);
    for (let c = 0; c < 20; c++) {
        const w = join(g.d, `g-${c}`); mkdirSync(w);
        const o36a = join(w, 'o36a'), o36b = join(w, 'o36b'), o37 = join(w, 'o37'), osym = join(w, 'osym'), o31 = join(w, 'o31');
        mkdirSync(o36a); symlinkSync(join(els, 'ext'), join(o36a, 'raw'));
        mkdirSync(o36b); symlinkSync(join(w, 'gone'), join(o36b, 'raw'));
        mkdirSync(o37); linkSync(join(els, 'victim'), join(o37, 'report.txt'));
        mkdirSync(osym); symlinkSync(join(els, 'target'), join(osym, 'report.txt'));
        symlinkSync(join(w, 'nowhere'), o31);
        const jobs = [[N(g, '--out', o36a, ...D(g))], [N(g, '--out', o36b, ...D(g))], [N(g, '--out', o37, ...D(g))], [N(g, '--out', osym, ...D(g))],
            [N(g, '--out', o31, ...D(g))], [['--node', './node', ...D(g)], { cwd: nl }], [D(g), { env: { BASH_ENV: rc } }]];
        if (!asRoot) {
            const ro = join(w, 'ro'); mkdirSync(ro); g.lock(ro, 0o555);
            const o35 = join(w, 'o35'); mkdirSync(o35); g.lock(o35, 0o600);
            jobs.push([N(g, '--out', join(ro, 'new'), ...D(g))], [N(g, '--out', o35, ...D(g))]);
        }
        for (const [args, o] of jobs) {
            const r = g.run(args, o);
            assert.equal(r.status, 2, `cycle ${c} ${JSON.stringify(args)}\n${r.out}`);
            assert.deepEqual(r.argv, [], `cycle ${c}: node spawned for ${JSON.stringify(args)}`);
        }
        for (const p of [join(w, 'ro'), join(w, 'o35')]) { try { chmodSync(p, 0o755); } catch { /* absent at root */ } }
        assert.deepEqual(readdirSync(tmp), [], `cycle ${c}: TMPDIR holds entries`);
        keep(join(els, 'victim'), 'VICTIM\n', `cycle ${c}: MD37a victim`); keep(join(els, 'target'), 'KEEP\n', `cycle ${c}: SYM target`);
        assert.equal(lsr(g.cwd), cwdLs, `cycle ${c}: cwd listing changed`);
        assert.equal(lsr(els), elsLs, `cycle ${c}: elsewhere/ listing changed`);
        assert.deepEqual(readdirSync(join(els, 'ext')), [], `cycle ${c}: MD36a target dir written`);
        assert.equal(existsSync(join(w, 'gone')) || existsSync(join(w, 'nowhere')), false, `cycle ${c}: a dangling link target was created`);
        unlinkSync(join(o37, 'report.txt'));
    }
});
