// test/pack.test.mjs -- the publish shape of @zakkster/lite-utils (b76 Phase 6, PLAN-b76-p6.md ASSERTIONS A1-A6; rulings
// Q-P6-BIN, Q-P6-REPO, Q-P6-PRIVATE, Q-P6-KEYWORDS (a)). Oracle: the plan's lists, not the package.json under test.
//   A1 `npm pack --dry-run --json` in a private decoy copy lists exactly the 11 shipped paths (SPEC-alloc-per-op G3
//      TASK 6: the root alloc-per-op.mjs ships, src/ never does).
//      Its json: npm <= 11 an array of one, npm 12 an object keyed by the package name (npm/cli PR 9247; Q-B78-PACK).
//   A2 package.json fields (no "private", bin, repository / homepage / bugs, engines, license, author, keywords) and
//      `npm pkg fix` leaves it byte-identical.
//   A3 an offline tarball install gives six node_modules/.bin commands; each `-h` exits 2 and its stdout line 1 starts
//      with its bin target and ` -- ` (e.g. `alloc-per-op.mjs -- `).
//   A4 README.md, llms.txt, CHANGELOG.md: ASCII except U+00D7 / U+00B5, no tool-call tag substring.
//   A5 README.md and llms.txt each hold the LEDGER #124 sentence verbatim, exactly once.
//   A6 no shipped bash root holds an @include marker or a source / `.` of a lib/ file (a root never sources at run time).
//   A6b every shipped .mjs root: line 1 `#!/usr/bin/env node`, the A4 byte / tag rules, every literal module specifier
//      (static import, export-from, literal `import('...')`) starts `node:`, and no `createRequire` token (zero deps).
//   A7 ci.yml and nightly.yml each hold exactly one `<interp> <target> --self-test` step per WANT_BIN target, named
//      `<bin> --self-test`, the interpreter set by the extension (.sh bash, .mjs node). Pure regex, no spawn.
// Must-fail controls: A1 / A2 / A3 run the 861f3d3 package.json (private, no files[], no bin) and must see the old shape
// (history rows: SKIP locally when the commit is unreachable, FAIL under CI=true, law 9). A2 also plants a "./" bin path
// that npm pkg fix rewrites. A4 / A5 / A6 run their checker on planted copies (U+2014, a tag, a doubled or missing
// sentence, an include line, a source line) that must be flagged. A6b plants 8 defects (1 finding each) plus 2 clean
// controls; A7 reads the 694800e ci.yml (no alloc-per-op step; a history row as above) and plants a `bash` interpreter
// for the .mjs, a duplicated step, a renamed step, a removed step, a run line with no name line, a key after run:
// and a job-level if:.
// npm runs as `process.execPath <npm-cli.js>`, never through PATH; no npm-cli.js = SKIP locally, FAIL under CI=true.
// The child env drops every npm_* key and NODE, sets NODE_V8_COVERAGE undefined (a delete is not a strip), strips the git /
// editor steering keys, and points npm at a private cache, an empty userconfig and a dead registry (offline only).
// Every temp dir is `pack-*` under os.tmpdir(), removed in after(). Every spawn goes through capSync (S5 census).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: yield once BEFORE each test
// so the previous test's report flushes (build.test.mjs:17, b27 u2-instr).
beforeEach(() => new Promise((r) => setImmediate(r)));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;
const OLD_SHA = '861f3d3';
const CI_STRICT = process.env.CI === 'true';
const histSkip = (have) => (have === true || CI_STRICT ? false : have);
const NPM_CAP = 90000;   // TASK 0e: pack 0.16-0.31 s, install 0.16 s wall (evidence/b76-p6); cap <= 120 s
const H_CAP = 30000;     // TASK 0e: each -h 0.18-0.29 s wall

const ROOTS = ['allocation-diff.sh', 'bytecode-budget.sh', 'deopt-diff.sh', 'ic-diff.sh', 'inlining-budget-diff.sh'];
const MJS_ROOTS = ['alloc-per-op.mjs'];   // G3 TASK 6: the node roots build.sh copies verbatim from src/ (build.test MJS)
const DOCS = ['README.md', 'LICENSE', 'CHANGELOG.md', 'llms.txt'];
const WANT_FILES = ['CHANGELOG.md', 'LICENSE', 'README.md', 'alloc-per-op.mjs', 'allocation-diff.sh', 'bytecode-budget.sh',
    'deopt-diff.sh', 'ic-diff.sh', 'inlining-budget-diff.sh', 'llms.txt', 'package.json'];
const DECOYS = ['stray.sh', '.handoff/x', 'audit/x', 'src/x.sh', 'lib/x.sh', 'test/x.mjs', 'build.sh', 'LEDGER.md', 'ROADMAP.md',
    'src/alloc-per-op.mjs', 'stray.mjs', 'research/alloc-probe/x.mjs'];
const WANT_BIN = {
    'alloc-per-op': 'alloc-per-op.mjs', 'allocation-diff': 'allocation-diff.sh', 'bytecode-budget': 'bytecode-budget.sh',
    'deopt-diff': 'deopt-diff.sh', 'ic-diff': 'ic-diff.sh', 'inlining-budget-diff': 'inlining-budget-diff.sh',
};
const A7_SHA = '694800e';   // the last commit whose ci.yml has no alloc-per-op step (A7 history must-fail)
const REPO = 'git+https://github.com/PeshoVurtoleta/lite-utils.git';
const HOME = 'https://github.com/PeshoVurtoleta/lite-utils#readme';
const BUGS = 'https://github.com/PeshoVurtoleta/lite-utils/issues';
const S124 = 'an inherited SHELLOPTS=noexec runs nothing and exits 0; callers must require the VERDICT line, not only the exit code';
// tool-call tag substrings, built from parts so this file never holds one
const TAGS = ['<' + 'function_calls', '</' + 'function_calls', '<' + 'invoke', '</' + 'invoke', '<' + 'parameter name=',
    '</' + 'parameter>', 'antml' + ':'];

// ---- npm-cli.js: $npm_execpath under npm, else the npm bundled beside this node (official layout, then Homebrew's) ----
function findNpm() {
    const cands = [];
    const ep = process.env.npm_execpath;
    if (ep && basename(ep) === 'npm-cli.js') cands.push(ep);
    const nd = dirname(realpathSync(process.execPath));
    cands.push(join(nd, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    cands.push(join(nd, '..', 'libexec', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    return cands.find((p) => existsSync(p)) || null;
}
const NPM = findNpm();
const NPMSKIP = skip || (NPM !== null || CI_STRICT ? false : 'npm-cli.js not found beside this node (and no $npm_execpath)');

let TOP = null;
let seq = 0;
function mkTop() { if (TOP === null) TOP = realpathSync(mkdtempSync(join(tmpdir(), 'pack-'))); return TOP; }
function mk(name) { const d = join(mkTop(), `${name}-${++seq}`); mkdirSync(d, { recursive: true }); return d; }
before(() => { mkTop(); });
after(() => { if (TOP !== null) rmSync(TOP, { recursive: true, force: true }); TOP = null; });

// git child env: no inherited git steering, no global config, no editor
function gitEnv() {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'EDITOR', 'VISUAL']) delete e[k];
    e.GIT_CONFIG_GLOBAL = '/dev/null';
    e.GIT_CONFIG_NOSYSTEM = '1';
    e.NODE_V8_COVERAGE = undefined;
    return e;
}
// npm child env (TASK 0a): every npm_* key and NODE dropped (npm exports NODE to its children), coverage undefined,
// editors stripped, a private cache, an empty userconfig, no update notifier, a dead registry
function npmEnv() {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (/^npm_/i.test(k)) delete e[k];
    for (const k of ['NODE', 'NODE_OPTIONS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;
    const d = mk('npmhome');
    writeFileSync(join(d, 'npmrc'), '');
    e.npm_config_cache = join(d, 'cache');
    e.npm_config_userconfig = join(d, 'npmrc');
    e.npm_config_update_notifier = 'false';
    e.npm_config_registry = 'http://127.0.0.1:9';
    return e;
}
function npm(args, cwd, what) {
    return capSync(process.execPath, [NPM, ...args], { cwd, encoding: 'utf8', env: npmEnv(), maxBuffer: 1 << 26 }, NPM_CAP, what);
}

// ---- the 861f3d3 package.json (history pin) ----
const haveOld = skip ? skip : (capSync('git', ['cat-file', '-e', `${OLD_SHA}^{commit}`], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }, 30000, 'git cat-file').status === 0
    ? true : `commit ${OLD_SHA} not available (shallow clone?)`);
const OLDSKIP = skip || histSkip(haveOld);
let OLD_PKG = null;
function oldPkg() {
    if (OLD_PKG === null) {
        const g = capSync('git', ['show', `${OLD_SHA}:package.json`], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }, 30000, 'git show');
        assert.equal(g.status, 0, `git show ${OLD_SHA}:package.json failed (CI_STRICT: an unreachable pin is a failure): ${g.stderr}`);
        OLD_PKG = g.stdout;
    }
    return OLD_PKG;
}

// a private copy holding only what pack needs plus the decoys; never test/fixtures, never .gitignore (files[] alone must
// keep .handoff/ and audit/ out)
function decoyCopy(pkgText) {
    const d = mk('copy');
    for (const f of [...ROOTS, ...MJS_ROOTS, ...DOCS]) {
        assert.ok(existsSync(join(ROOT, f)), `live ${f} is missing: it ships`);
        cpSync(join(ROOT, f), join(d, f));
    }
    for (const f of DECOYS) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), 'decoy\n'); }
    writeFileSync(join(d, 'package.json'), pkgText);
    return d;
}
// pure (Q-B78-PACK): the sorted path list of a `npm pack --json` result in exactly one of two shapes: (i) an array of
// exactly one entry whose name is `name` (npm <= 11); (ii) a plain object with exactly one own key, equal to `name`
// (the package.json under test, never the json), whose value's name is `name` too (npm 12). Either entry holds a
// files array of { path: string }.
// Anything else fails with a message naming the shape.
function packEntry(j, name, what) {
    assert.ok(typeof name === 'string' && name !== '', `${what}: expected package name ${JSON.stringify(name)}`);
    let e, shape;
    if (Array.isArray(j)) {
        shape = 'array shape (npm <= 11)';
        assert.ok(j.length === 1, `${what}: ${shape} must hold exactly one package, got ${j.length}`);
        e = j[0];
        assert.ok(e !== null && typeof e === 'object' && e.name === name, `${what}: ${shape}: the entry's name must be ${JSON.stringify(name)}, got ${JSON.stringify(e && e.name)}`);
    } else if (j !== null && typeof j === 'object' && Object.getPrototypeOf(j) === Object.prototype) {
        shape = 'keyed shape (npm 12)';
        const keys = Reflect.ownKeys(j).map(String);
        assert.ok(keys.length === 1 && keys[0] === name, `${what}: ${shape} must hold exactly one key ${JSON.stringify(name)}, got ${JSON.stringify(keys)}`);
        e = j[name];
        assert.ok(e !== null && typeof e === 'object' && e.name === name, `${what}: ${shape}: the entry's name must be ${JSON.stringify(name)}, got ${JSON.stringify(e && e.name)}`);
    } else {
        assert.fail(`${what}: neither the array shape (npm <= 11) nor the keyed shape (npm 12): ${j === null ? 'null' : typeof j}`);
    }
    assert.ok(e !== null && typeof e === 'object' && Array.isArray(e.files), `${what}: ${shape}: the entry has no files array`);
    for (const x of e.files) {
        assert.ok(x !== null && typeof x === 'object' && typeof x.path === 'string', `${what}: ${shape}: a files element without a string path: ${JSON.stringify(x)}`);
    }
    return e.files.map((x) => x.path).sort();
}
function dryRun(dir, what) {
    const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name;   // the text decoyCopy wrote
    const r = npm(['pack', '--dry-run', '--json', '--ignore-scripts', '--offline'], dir, what);
    assert.equal(r.status, 0, `${what}: exit ${r.status}\n${r.stderr}`);
    return packEntry(JSON.parse(r.stdout), name, what);
}
// pack to a tgz, install it offline into a fresh dir; returns that dir's node_modules/.bin
function installTgz(dir, what) {
    const dest = mk('tgz');
    const p = npm(['pack', '--ignore-scripts', '--offline', '--pack-destination', dest], dir, `${what} npm pack`);
    assert.equal(p.status, 0, `${what} npm pack: exit ${p.status}\n${p.stderr}`);
    const tgz = readdirSync(dest).filter((f) => f.endsWith('.tgz'));
    assert.equal(tgz.length, 1, `${what}: one tarball, got ${tgz.join(' ')}`);
    const inst = mk('inst');
    const i = npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(dest, tgz[0])], inst, `${what} npm install`);
    assert.equal(i.status, 0, `${what} npm install: exit ${i.status}\n${i.stderr}`);
    return join(inst, 'node_modules', '.bin');
}

// ---- checkers (pure; the must-fail controls feed them planted inputs) ----
function pkgProblems(text) {
    const p = [];
    let o;
    try { o = JSON.parse(text); } catch (e) { return ['json: ' + e.message]; }
    if (text !== JSON.stringify(o, null, 2) + '\n') p.push('format: not 2-space JSON with one trailing newline');
    if (/[^\x00-\x7f]/.test(text)) p.push('ascii: a non-ASCII byte');
    if (Object.hasOwn(o, 'private')) p.push('private: present');
    try { assert.deepEqual(o.bin, WANT_BIN); } catch { p.push('bin: ' + JSON.stringify(o.bin)); }
    if (!(o.repository && o.repository.type === 'git' && o.repository.url === REPO)) p.push('repository: ' + JSON.stringify(o.repository));
    if (o.homepage !== HOME) p.push('homepage: ' + JSON.stringify(o.homepage));
    if (!(o.bugs && o.bugs.url === BUGS)) p.push('bugs: ' + JSON.stringify(o.bugs));
    if (!(o.engines && o.engines.node === '>=22')) p.push('engines.node: ' + JSON.stringify(o.engines));
    if (o.license !== 'MIT') p.push('license: ' + JSON.stringify(o.license));
    if (!(typeof o.author === 'string' && o.author.startsWith('Zahary Shinikchiev'))) p.push('author: ' + JSON.stringify(o.author));
    if (!(Array.isArray(o.keywords) && o.keywords.length > 0)) p.push('keywords: ' + JSON.stringify(o.keywords));
    if (o.version !== '1.0.0') p.push('version: ' + JSON.stringify(o.version) + ' (the 1.0.0 release, Q-B78-VERSION)');
    return p;
}
// bytes > 0x7F other than U+00D7 (C3 97) / U+00B5 (C2 B5), one finding per UTF-8 sequence; and tool-call tag substrings
function docProblems(name, buf) {
    const p = [];
    for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b < 0x80) continue;
        if ((b === 0xc3 && buf[i + 1] === 0x97) || (b === 0xc2 && buf[i + 1] === 0xb5)) { i++; continue; }
        p.push(`${name}: byte 0x${b.toString(16)} at offset ${i} (line ${buf.subarray(0, i).toString('latin1').split('\n').length})`);
        if (p.length >= 5) break;
        if (b >= 0xc0) while (i + 1 < buf.length && (buf[i + 1] & 0xc0) === 0x80) i++;   // one finding per UTF-8 sequence
    }
    const s = buf.toString('latin1');
    for (const t of TAGS) if (s.includes(t)) p.push(`${name}: tool-call tag substring ${JSON.stringify(t.replace('<', 'LT '))}`);
    return p;
}
function count124(text) { return text.split(S124).length - 1; }
const INC_RE = /@include/i;
const SRC_RE = /(?:^|[;&|({]|\bthen|\bdo|\belse)\s*(?:source|\.)\s+.*\blib\/[\w.-]+\.sh/;
function rootProblems(name, text) {
    const p = [];
    text.split('\n').forEach((l, i) => {
        if (INC_RE.test(l)) p.push(`${name}:${i + 1} include marker: ${l.slice(0, 80)}`);
        if (SRC_RE.test(l)) p.push(`${name}:${i + 1} sources a lib file: ${l.slice(0, 80)}`);
    });
    return p;
}
// A6b (pure): a shipped .mjs root imports only node: builtins. Literal specifiers only: `from '...'` (static import and
// export-from), a bare `import '...'`, and the first quoted literal argument of `import(` (whatever follows it);
// `import(p)` is not literal and is not judged. A matching literal in a comment or string is judged too (fail closed: reword it).
const MJS_SHEBANG = '#!/usr/bin/env node';
const SPEC_RES = [
    ['from', /\bfrom\s*(['"])([^'"\n]*)\1/g],
    ['import', /\bimport\s*(['"])([^'"\n]*)\1/g],
    ['import()', /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*(['"`])([^'"`\n]*)\1/g],
];
const lineAt = (s, i) => s.slice(0, i).split('\n').length;
function mjsProblems(name, buf) {
    const p = [];
    const s = buf.toString('utf8');
    const l1 = s.split('\n')[0];
    if (l1 !== MJS_SHEBANG) p.push(`${name}:1 line 1 is not ${MJS_SHEBANG}: ${l1.slice(0, 80)}`);
    p.push(...docProblems(name, buf));
    for (const [kind, re] of SPEC_RES) {
        for (const m of s.matchAll(re)) if (!m[2].startsWith('node:')) p.push(`${name}:${lineAt(s, m.index)} ${kind} specifier ${JSON.stringify(m[2])} is not node:`);
    }
    for (const m of s.matchAll(/\bcreateRequire\b/g)) p.push(`${name}:${lineAt(s, m.index)} createRequire token`);
    return p;
}
// A7 (pure regex, no spawn): every `run: <interp> <target> --self-test` line (exactly that, so the --fixtures steps are
// not self-test steps) with the `- name:` line right above it.
const STEP_RE = /^( *)- name: ([^\n]*)\n\1 {2}run: (\S+) (\S+) --self-test[ \t]*$/gm;
const RUN_RE = /^ +run: (\S+) (\S+) --self-test[ \t]*$/gm;
function selfTestSteps(yaml) {
    return [...yaml.matchAll(STEP_RE)].map((m) => ({ name: m[2], interp: m[3], target: m[4], line: lineAt(yaml, m.index) + 1 }));
}
function selfTestProblems(file, yaml) {
    const p = [];
    const steps = selfTestSteps(yaml);
    const runs = [...yaml.matchAll(RUN_RE)].length;
    if (runs !== steps.length) p.push(`${file}: ${runs} self-test run lines, ${steps.length} with a "- name:" line right above`);
    for (const m of yaml.matchAll(/^( *)run: \S+ \S+ --self-test[ \t]*\n(?:[ \t]*(?:#[^\n]*)?\n)*\1(?!run:|#)\S/gm)) p.push(`${file}:${lineAt(yaml, m.index)} a self-test step has a key after run:`);
    for (const m of yaml.matchAll(/^ {4}(?:if|continue-on-error):/gm)) p.push(`${file}:${lineAt(yaml, m.index)} a job-level ${m[0].trim()}`);
    for (const [bin, target] of Object.entries(WANT_BIN)) {
        const mine = steps.filter((s) => s.target === target);
        if (mine.length !== 1) { p.push(`${file}: ${target}: ${mine.length} self-test steps, want 1`); continue; }
        const want = target.endsWith('.mjs') ? 'node' : target.endsWith('.sh') ? 'bash' : '?';
        if (mine[0].interp !== want) p.push(`${file}:${mine[0].line} ${target}: interpreter ${mine[0].interp}, want ${want}`);
        if (mine[0].name !== `${bin} --self-test`) p.push(`${file}:${mine[0].line} ${target}: step name ${JSON.stringify(mine[0].name)}, want "${bin} --self-test"`);
    }
    const known = new Set(Object.values(WANT_BIN));
    for (const s of steps) if (!known.has(s.target)) p.push(`${file}:${s.line} self-test step for ${s.target}, not a WANT_BIN target`);
    return p;
}
const LIVE_PKG = () => readFileSync(join(ROOT, 'package.json'), 'utf8');

// ---- A1 ----
// packEntry canned rows (no npm spawn, so outside NPMSKIP; Q-B78-PACK). The keyed entry is a trimmed npm 12.2.2 sample.
const PN = '@zakkster/lite-utils';
const cFiles = () => [{ path: 'llms.txt', size: 11309, mode: 420 }, { path: 'LICENSE', size: 1099, mode: 420 }];
const cKeyed = () => ({ [PN]: { id: `${PN}@0.0.0`, name: PN, version: '0.0.0', size: 263302, unpackedSize: 834368,
    shasum: 'cbcc6e9d194b00855d0c5bf9123abb9a652d6d60', filename: 'zakkster-lite-utils-0.0.0.tgz', files: cFiles(), entryCount: 2, bundled: [] } });
const cArr = () => [{ id: `${PN}@0.0.0`, name: PN, version: '0.0.0', files: cFiles(), entryCount: 2, bundled: [] }];
test('packEntry canned: an array of one (npm <= 11) -> its sorted paths', () => {
    assert.deepEqual(packEntry(cArr(), PN, 'canned'), ['LICENSE', 'llms.txt']);
});
test('packEntry canned: an object keyed by the package name (npm 12) -> its sorted paths', () => {
    assert.deepEqual(packEntry(cKeyed(), PN, 'canned'), ['LICENSE', 'llms.txt']);
});
const keyedWith = (patch) => { const o = cKeyed(); patch(o[PN]); return o; };
for (const [label, json, re] of [
    ['an array of two', () => [...cArr(), ...cArr()], /array shape \(npm <= 11\) must hold exactly one package, got 2/],
    ['an empty array', () => [], /array shape \(npm <= 11\) must hold exactly one package, got 0/],
    ['an object with two keys', () => ({ ...cKeyed(), other: cKeyed()[PN] }), /keyed shape \(npm 12\) must hold exactly one key/],
    ['an object keyed by another name', () => ({ '@zakkster/lite-other': { ...cKeyed()[PN] } }), /keyed shape \(npm 12\) must hold exactly one key/],
    ['an array of one whose name differs', () => [{ ...cArr()[0], name: '@zakkster/lite-other' }], /array shape \(npm <= 11\): the entry's name must be/],
    ['a keyed value whose name differs', () => keyedWith((e) => { e.name = '@zakkster/lite-other'; }), /keyed shape \(npm 12\): the entry's name must be/],
    ['an entry with no files', () => keyedWith((e) => { delete e.files; }), /keyed shape \(npm 12\): the entry has no files array/],
    ['files not an array', () => [{ ...cArr()[0], files: { path: 'LICENSE' } }], /array shape \(npm <= 11\): the entry has no files array/],
    ['a file without a string path', () => keyedWith((e) => { e.files.push({ size: 1, mode: 420 }); }), /keyed shape \(npm 12\): a files element without a string path/],
    ['null', () => null, /neither the array shape \(npm <= 11\) nor the keyed shape \(npm 12\): null/],
    ['a string', () => 'x', /neither the array shape \(npm <= 11\) nor the keyed shape \(npm 12\): string/],
]) {
    test(`packEntry canned must-fail: ${label}`, () => {
        assert.throws(() => packEntry(json(), PN, 'canned'), re);
    });
}
test('A1 npm pack --dry-run --json lists exactly the 11 shipped paths; no decoy, src/, lib/, test/, research/, build.sh, LEDGER, ROADMAP, audit/, .handoff/', { skip: NPMSKIP }, () => {
    const files = dryRun(decoyCopy(LIVE_PKG()), 'A1 pack --dry-run');
    assert.deepEqual(files, WANT_FILES);
    for (const f of DECOYS) assert.ok(!files.includes(f), `decoy ${f} packed`);
});
test(`A1 RED (history): the ${OLD_SHA} package.json in the same decoy copy packs src/ and test/ entries`, { skip: NPMSKIP || OLDSKIP }, () => {
    const files = dryRun(decoyCopy(oldPkg()), 'A1 RED pack --dry-run');
    assert.notDeepEqual(files, WANT_FILES);
    assert.ok(files.includes('src/x.sh') && files.includes('test/x.mjs'), `old pack list: ${files.join(' ')}`);
});

// ---- A2 ----
test('A2 package.json: no private; bin, repository, homepage, bugs, engines, license, author, keywords as ruled; npm pkg fix leaves it byte-identical', { skip: NPMSKIP }, () => {
    const text = LIVE_PKG();
    assert.deepEqual(pkgProblems(text), []);
    const d = mk('fix');
    writeFileSync(join(d, 'package.json'), text);
    const r = npm(['pkg', 'fix'], d, 'A2 npm pkg fix');
    assert.equal(r.status, 0, `npm pkg fix: exit ${r.status}\n${r.stderr}`);
    assert.equal(readFileSync(join(d, 'package.json'), 'utf8'), text, 'npm pkg fix rewrote package.json');
});
test('A2 controls: a planted "./" bin path is rewritten by npm pkg fix; a planted private key and a dropped bin are flagged', { skip: NPMSKIP }, () => {
    const o = JSON.parse(LIVE_PKG());
    o.bin['ic-diff'] = './ic-diff.sh';
    const planted = JSON.stringify(o, null, 2) + '\n';
    const d = mk('fixc');
    writeFileSync(join(d, 'package.json'), planted);
    const r = npm(['pkg', 'fix'], d, 'A2 control npm pkg fix');
    assert.equal(r.status, 0, `npm pkg fix: exit ${r.status}\n${r.stderr}`);
    assert.notEqual(readFileSync(join(d, 'package.json'), 'utf8'), planted, 'npm pkg fix left a "./" bin path alone: the byte-identical check has no teeth');
    const p = JSON.parse(LIVE_PKG());
    p.private = true;
    delete p.repository;
    assert.deepEqual(pkgProblems(JSON.stringify(p, null, 2) + '\n'), ['private: present', 'repository: undefined']);
    assert.deepEqual(pkgProblems(LIVE_PKG().replace(/\n$/, '')), ['format: not 2-space JSON with one trailing newline']);
});
test(`A2 RED (history): the ${OLD_SHA} package.json is flagged (private true, no bin)`, { skip: OLDSKIP }, () => {
    const p = pkgProblems(oldPkg());
    assert.ok(p.includes('private: present'), p.join('\n'));
    assert.ok(p.includes('bin: undefined'), p.join('\n'));
});

// ---- A3 ----
test('A3 offline tarball install: node_modules/.bin/<name> -h exits 2 for all 6, stdout line 1 starts "<bin target> -- "', { skip: NPMSKIP }, () => {
    const bin = installTgz(decoyCopy(LIVE_PKG()), 'A3');
    assert.deepEqual(readdirSync(bin).sort(), Object.keys(WANT_BIN).sort());
    const env = gitEnv();
    for (const name of Object.keys(WANT_BIN)) {
        const r = capSync(join(bin, name), ['-h'], { cwd: dirname(dirname(bin)), encoding: 'utf8', env }, H_CAP, `.bin/${name} -h`);
        assert.equal(r.status, 2, `${name} -h exit ${r.status} signal ${r.signal}\n${r.stderr}`);
        assert.ok(r.stdout.split('\n')[0].startsWith(`${WANT_BIN[name]} -- `), `${name} -h line 1: ${r.stdout.split('\n')[0]}`);
    }
});
test(`A3 RED (history): the ${OLD_SHA} package.json installs no .bin entry`, { skip: NPMSKIP || OLDSKIP }, () => {
    const bin = installTgz(decoyCopy(oldPkg()), 'A3 RED');
    const have = existsSync(bin) ? readdirSync(bin) : [];
    for (const name of Object.keys(WANT_BIN)) assert.ok(!have.includes(name), `old package installs .bin/${name}`);
});

// ---- A4 ----
// red until the README / llms.txt helpers land clean text (expected during b76 B2 / B3)
test('A4 README.md, llms.txt, CHANGELOG.md: no byte > 0x7F but U+00D7 / U+00B5, no tool-call tag substring', { skip }, () => {
    const p = [];
    for (const f of ['README.md', 'llms.txt', 'CHANGELOG.md']) {
        assert.ok(existsSync(join(ROOT, f)), `${f} is missing`);
        p.push(...docProblems(f, readFileSync(join(ROOT, f))));
    }
    assert.deepEqual(p, []);
});
test('A4 controls: a planted U+2014 copy and a planted tag are flagged; U+00D7 / U+00B5 pass', { skip }, () => {
    const d = mk('a4');
    const f = join(d, 'README.md');
    writeFileSync(f, readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8') + 'a \u2014 b\n');
    const p = docProblems('README.md', readFileSync(f));
    assert.ok(p.length >= 1 && p.some((x) => x.includes('byte 0xe2')), p.join('\n'));
    assert.deepEqual(docProblems('x', Buffer.from('n \u00d7 2, 5 \u00b5s\n', 'utf8')), []);
    assert.equal(docProblems('x', Buffer.from('a ' + TAGS[2] + ' b\n')).length, 1);
    assert.equal(docProblems('x', Buffer.from('\u00e9', 'utf8')).length, 1);
});

// ---- A5 ----
// red until the README / llms.txt helpers land the #124 sentence (expected during b76 B2 / B3)
test('A5 README.md and llms.txt each hold the LEDGER #124 sentence verbatim, exactly once', { skip }, () => {
    for (const f of ['README.md', 'llms.txt']) {
        assert.ok(existsSync(join(ROOT, f)), `${f} is missing`);
        assert.equal(count124(readFileSync(join(ROOT, f), 'utf8')), 1, `${f}: #124 sentence count`);
    }
});
test('A5 controls: a doubled sentence, a missing one and a one-word edit are not 1', { skip }, () => {
    assert.equal(count124(`x ${S124}.\ny ${S124}.\n`), 2);
    assert.equal(count124('nothing here\n'), 0);
    assert.equal(count124(S124.replace('not only', 'not just')), 0);
    assert.equal(count124(`- ${S124} (LEDGER #124).\n`), 1);
});

// ---- A6 ----
test('A6 no shipped root holds an @include marker or a source / . of a lib/ file', { skip }, () => {
    const p = [];
    for (const f of ROOTS) p.push(...rootProblems(f, readFileSync(join(ROOT, f), 'utf8')));
    assert.deepEqual(p, []);
});
test('A6 controls: a root copy with a planted include line, or a planted source / . of lib/, is flagged', { skip }, () => {
    const d = mk('a6');
    const live = readFileSync(join(ROOT, 'bytecode-budget.sh'), 'utf8');
    const lines = live.split('\n');
    for (const plant of ['# @include lib/common.sh', 'source "$(dirname "$0")/lib/common.sh"', '. ./lib/prologue.sh',
        '  [[ -r lib/args.sh ]] && . lib/args.sh']) {
        const f = join(d, 'bytecode-budget.sh');
        writeFileSync(f, [...lines.slice(0, 2), plant, ...lines.slice(2)].join('\n'));
        const p = rootProblems('bytecode-budget.sh', readFileSync(f, 'utf8'));
        assert.equal(p.length, 1, `plant ${plant}: ${p.join('\n')}`);
        assert.ok(p[0].startsWith('bytecode-budget.sh:3 '), p[0]);
    }
});

// ---- A6b ----
test('A6b every shipped .mjs root: node shebang, ASCII / no tag, only node: specifiers, no createRequire', { skip }, () => {
    const p = [];
    for (const f of MJS_ROOTS) {
        assert.ok(existsSync(join(ROOT, f)), `live ${f} is missing: it ships (run build.sh)`);
        p.push(...mjsProblems(f, readFileSync(join(ROOT, f))));
    }
    assert.deepEqual(p, []);
});
test('A6b controls: 8 plants give exactly 1 finding each; import \'node:fs\' and import(p) give 0', { skip }, () => {
    const lines = readFileSync(join(ROOT, MJS_ROOTS[0]), 'utf8').split('\n');
    const plantAt3 = (l) => Buffer.from([...lines.slice(0, 2), l, ...lines.slice(2)].join('\n'), 'utf8');
    const cases = [
        ['shebang', Buffer.from(['#!/usr/bin/env bash', ...lines.slice(1)].join('\n'), 'utf8'), /:1 line 1 is not/],
        ['U+2014', plantAt3('// a \u2014 b'), /byte 0xe2 at offset \d+ \(line 3\)/],
        ['from lite-leak', plantAt3("import { createLeakTracker } from 'lite-leak';"), /:3 from specifier "lite-leak" is not node:/],
        ['from nodemailer', plantAt3("import x from 'nodemailer';"), /:3 from specifier "nodemailer" is not node:/],
        ['export-from', plantAt3("export {a} from './x.mjs';"), /:3 from specifier "\.\/x\.mjs" is not node:/],
        ['import(fs)', plantAt3("const fsm = await import('fs');"), /:3 import\(\) specifier "fs" is not node:/],
        ['import() 2-arg', plantAt3("const pkg = await import('./package.json', { with: { type: 'json' } });"), /:3 import\(\) specifier "\.\/package\.json" is not node:/],
        ['createRequire', plantAt3('const req = createRequire(import.meta.url);'), /:3 createRequire token/],
    ];
    for (const [label, buf, re] of cases) {
        const p = mjsProblems(MJS_ROOTS[0], buf);
        assert.equal(p.length, 1, `plant ${label}: ${p.join('\n')}`);
        assert.match(p[0], re, `plant ${label}`);
    }
    assert.deepEqual(mjsProblems('x.mjs', plantAt3("import 'node:fs';")), []);
    assert.deepEqual(mjsProblems('x.mjs', plantAt3('const m = await import(p);')), []);
});

// ---- A7 ----
const WF = ['.github/workflows/ci.yml', '.github/workflows/nightly.yml'];
test('A7 ci.yml and nightly.yml: exactly one self-test step per WANT_BIN target (6), named "<bin> --self-test", interpreter by extension', () => {
    for (const f of WF) {
        const y = readFileSync(join(ROOT, f), 'utf8');
        assert.deepEqual(selfTestProblems(f, y), []);
        assert.equal(selfTestSteps(y).length, Object.keys(WANT_BIN).length, `${f}: self-test step count`);
    }
});
test('A7 controls: a planted `bash alloc-per-op.mjs`, a duplicated step, a renamed step, a removed step, a step with no name line, a key after run: and a job-level if: are each flagged once', () => {
    const y = readFileSync(join(ROOT, WF[0]), 'utf8');
    const STEP = '      - name: alloc-per-op --self-test\n        run: node alloc-per-op.mjs --self-test\n';
    assert.equal(y.split(STEP).length - 1, 1, 'live ci.yml: the alloc-per-op step text (control anchor)');
    const cases = [
        ['bash interpreter', y.replace(STEP, STEP.replace('run: node ', 'run: bash ')), /alloc-per-op\.mjs: interpreter bash, want node/],
        ['duplicated step', y.replace(STEP, STEP + STEP), /alloc-per-op\.mjs: 2 self-test steps, want 1/],
        ['renamed step', y.replace(STEP, STEP.replace('name: alloc-per-op ', 'name: alloc ')), /step name "alloc --self-test", want "alloc-per-op --self-test"/],
        ['removed step', y.replace(STEP, ''), /alloc-per-op\.mjs: 0 self-test steps, want 1/],
        ['no name line', y.replace(STEP, STEP + '        run: node alloc-per-op.mjs --self-test\n'), /7 self-test run lines, 6 with a "- name:" line right above/],
        ['if: false after run', y.replace(STEP, STEP + '        if: false\n'), /:\d+ a self-test step has a key after run:/],
        ['job-level if', y.replace('    runs-on: ${{ matrix.os }}\n', '    runs-on: ${{ matrix.os }}\n    if: false\n'), /:\d+ a job-level if:/],
        ['comment then if: false after run', y.replace(STEP, STEP + '        # off for now\n        if: false\n'), /:\d+ a self-test step has a key after run:/],
    ];
    for (const [label, text, re] of cases) {
        const p = selfTestProblems(WF[0], text);
        assert.equal(p.length, 1, `${label}: ${p.join('\n')}`);
        assert.match(p[0], re, label);
    }
});
const haveA7 = capSync('git', ['cat-file', '-e', `${A7_SHA}^{commit}`], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }, 30000, 'git cat-file A7').status === 0
    ? true : `commit ${A7_SHA} not available (shallow clone?)`;
test(`A7 RED (history): the ${A7_SHA} ci.yml has no alloc-per-op step and is flagged exactly once`, { skip: histSkip(haveA7) }, () => {
    const g = capSync('git', ['show', `${A7_SHA}:${WF[0]}`], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }, 30000, 'git show A7');
    assert.equal(g.status, 0, `git show ${A7_SHA}:${WF[0]} failed (CI_STRICT: an unreachable pin is a failure): ${g.stderr}`);
    assert.deepEqual(selfTestProblems(WF[0], g.stdout), [`${WF[0]}: alloc-per-op.mjs: 0 self-test steps, want 1`]);
});
