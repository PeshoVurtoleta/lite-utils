// test/pack.test.mjs -- the publish shape of @zakkster/lite-utils (b76 Phase 6, PLAN-b76-p6.md ASSERTIONS A1-A6; rulings
// Q-P6-BIN, Q-P6-REPO, Q-P6-PRIVATE, Q-P6-KEYWORDS (a)). Oracle: the plan's lists, not the package.json under test.
//   A1 `npm pack --dry-run --json` in a private decoy copy lists exactly the 10 shipped paths.
//   A2 package.json fields (no "private", bin, repository / homepage / bugs, engines, license, author, keywords) and
//      `npm pkg fix` leaves it byte-identical.
//   A3 an offline tarball install gives five node_modules/.bin commands; each `-h` exits 2 with its own first line.
//   A4 README.md, llms.txt, CHANGELOG.md: ASCII except U+00D7 / U+00B5, no tool-call tag substring.
//   A5 README.md and llms.txt each hold the LEDGER #124 sentence verbatim, exactly once.
//   A6 no shipped root holds an @include marker or a source / `.` of a lib/ file (a root never sources at run time).
// Must-fail controls: A1 / A2 / A3 run the 861f3d3 package.json (private, no files[], no bin) and must see the old shape
// (history rows: SKIP locally when the commit is unreachable, FAIL under CI=true, law 9). A2 also plants a "./" bin path
// that npm pkg fix rewrites. A4 / A5 / A6 run their checker on planted copies (U+2014, a tag, a doubled or missing
// sentence, an include line, a source line) that must be flagged.
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
const DOCS = ['README.md', 'LICENSE', 'CHANGELOG.md', 'llms.txt'];
const WANT_FILES = ['CHANGELOG.md', 'LICENSE', 'README.md', 'allocation-diff.sh', 'bytecode-budget.sh', 'deopt-diff.sh',
    'ic-diff.sh', 'inlining-budget-diff.sh', 'llms.txt', 'package.json'];
const DECOYS = ['stray.sh', '.handoff/x', 'audit/x', 'src/x.sh', 'lib/x.sh', 'test/x.mjs', 'build.sh', 'LEDGER.md', 'ROADMAP.md'];
const WANT_BIN = {
    'allocation-diff': 'allocation-diff.sh', 'bytecode-budget': 'bytecode-budget.sh', 'deopt-diff': 'deopt-diff.sh',
    'ic-diff': 'ic-diff.sh', 'inlining-budget-diff': 'inlining-budget-diff.sh',
};
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
    for (const f of [...ROOTS, ...DOCS]) {
        assert.ok(existsSync(join(ROOT, f)), `live ${f} is missing: it ships`);
        cpSync(join(ROOT, f), join(d, f));
    }
    for (const f of DECOYS) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), 'decoy\n'); }
    writeFileSync(join(d, 'package.json'), pkgText);
    return d;
}
function dryRun(dir, what) {
    const r = npm(['pack', '--dry-run', '--json', '--ignore-scripts', '--offline'], dir, what);
    assert.equal(r.status, 0, `${what}: exit ${r.status}\n${r.stderr}`);
    const j = JSON.parse(r.stdout);
    assert.ok(Array.isArray(j) && j.length === 1, `${what}: one package in the json`);
    return j[0].files.map((f) => f.path).sort();
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
    if (o.version !== '0.0.0') p.push('version: ' + JSON.stringify(o.version) + ' (HOLD-RELEASE D-3 keeps 0.0.0)');
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
const LIVE_PKG = () => readFileSync(join(ROOT, 'package.json'), 'utf8');

// ---- A1 ----
test('A1 npm pack --dry-run --json lists exactly the 10 shipped paths; no decoy, src/, lib/, test/, build.sh, LEDGER, ROADMAP, audit/, .handoff/', { skip: NPMSKIP }, () => {
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
test('A3 offline tarball install: node_modules/.bin/<name> -h exits 2 for all 5, stdout line 1 starts "<name>.sh -- "', { skip: NPMSKIP }, () => {
    const bin = installTgz(decoyCopy(LIVE_PKG()), 'A3');
    assert.deepEqual(readdirSync(bin).sort(), Object.keys(WANT_BIN).sort());
    const env = gitEnv();
    for (const name of Object.keys(WANT_BIN)) {
        const r = capSync(join(bin, name), ['-h'], { cwd: dirname(dirname(bin)), encoding: 'utf8', env }, H_CAP, `.bin/${name} -h`);
        assert.equal(r.status, 2, `${name} -h exit ${r.status} signal ${r.signal}\n${r.stderr}`);
        assert.ok(r.stdout.split('\n')[0].startsWith(`${name}.sh -- `), `${name} -h line 1: ${r.stdout.split('\n')[0]}`);
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
