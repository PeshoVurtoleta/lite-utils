// test/death-signature.test.mjs -- gate for test/death-reporter.mjs (the `FILE DIED` line) and the beforeEach flush
// hook (test/ext-audit.test.mjs). Runs `node --test` with the EXACT reporter flags of package.json "test" on the
// fixtures in test/fixtures/death/ (outside the test/*.test.mjs glob). It reproduces a dead file's SIGNATURE, not
// the unknown cause (.handoff/evidence/b27/u2-file-death-investigation.md). TIER: DETERMINISTIC.
// Oracle: the node child's real fate (the fixture kills / exits itself), never what the reporter printed elsewhere.
// Control: spec-only flags print no `FILE DIED` line, so the reporter is what adds it.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { capSync } from './spawn-cap.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// this file is all spawnSync too: yield before each test so a death here names the last test that passed
beforeEach(() => new Promise((r) => setImmediate(r)));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = 'test/fixtures/death/';
const SCRIPT = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.test;
const GLOB = "'test/*.test.mjs'";
const DEATH = '--test-reporter=./test/death-reporter.mjs --test-reporter-destination=stderr';
const SPEC_ONLY = ['--test', '--test-reporter=spec'];
const PASS = '\u2714 '; // spec's pass mark
// node < 24 stamps no data.entryFile on a file child's events (probed on v22.23.4, .handoff/evidence/b35-ci/
// entryfile-probe.log): the reporter cannot see a death that node hid after a failed subtest, so that row skips there.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const HIDDEN_SKIP = NODE_MAJOR < 24 ? 'node < 24 stamps no data.entryFile: a hidden death is not detectable (reporter: node >= 24 only)' : false;

// package.json "test" minus `node` and the glob: the gate runs what npm test runs
function npmTestFlags() {
  const t = SCRIPT.split(' ');
  assert.equal(t[0], 'node', 'test script starts with node');
  assert.equal(t[t.length - 1], GLOB, 'test script keeps the glob last');
  return t.slice(1, -1);
}

function run(flags, fixture) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // inherited from our own runner it would make the nested run a file child
  // runner.js FORCE_COLOR: node's runner sets FORCE_COLOR=1 in file children when a built-in reporter destination is a
  // color TTY; copied into the nested run it colors spec's lines and passed() stops matching. Pin plain text.
  delete env.FORCE_COLOR; env.NO_COLOR = '1';
  const r = capSync(process.execPath, [...flags, FIX + fixture], { cwd: ROOT, env, encoding: 'utf8' }, 60000, `nested node --test ${fixture}`);
  assert.equal(r.error, undefined, 'nested node --test spawned and finished');   // backstop: capSync already throws on r.error
  return { status: r.status, out: r.stdout, err: r.stderr, died: (r.stdout + r.stderr).split('\n').filter((l) => l.startsWith('FILE DIED ')) };
}

function passed(out, name) {
  return out.split('\n').some((l) => l.trimStart().startsWith(PASS + name + ' ('));
}

test('T2: package.json "test" keeps spec on stdout, adds the death reporter on stderr, keeps the glob', () => {
  assert.ok(SCRIPT.includes('--test-reporter=spec --test-reporter-destination=stdout'), SCRIPT);
  assert.ok(SCRIPT.includes(DEATH), SCRIPT);
  npmTestFlags();
});

test('SIGTERM row: exactly one FILE DIED line with signal=SIGTERM, on stderr; spec names the third test as passed', () => {
  const r = run(npmTestFlags(), 'sigterm.fixture.mjs');
  assert.equal(r.status, 1, 'the run fails');
  assert.equal(r.died.length, 1, 'one FILE DIED line:\n' + r.err);
  assert.match(r.died[0], /^FILE DIED test\/fixtures\/death\/sigterm\.fixture\.mjs exitCode=null signal=SIGTERM after=\d+ms$/);
  assert.ok(r.err.includes(r.died[0]), 'the line is on stderr');
  assert.ok(!r.out.includes('FILE DIED'), 'stdout (spec) has no FILE DIED line');
  assert.ok(passed(r.out, 'three-sync-pass'), 'third test reported passed before the death:\n' + r.out);
});

test('exit-code row: process.exit(3) -> exactly one FILE DIED line with exitCode=3 signal=null', () => {
  const r = run(npmTestFlags(), 'exit3.fixture.mjs');
  assert.equal(r.status, 1, 'the run fails');
  assert.equal(r.died.length, 1, 'one FILE DIED line:\n' + r.err);
  assert.match(r.died[0], /^FILE DIED test\/fixtures\/death\/exit3\.fixture\.mjs exitCode=3 signal=null after=\d+ms$/);
  assert.ok(passed(r.out, 'three-sync-pass'), 'third test reported passed before the exit:\n' + r.out);
});

test('hidden-status row: a death after a failed subtest (node drops its file event) -> one FILE DIED line, status unknown', { skip: HIDDEN_SKIP }, () => {
  const r = run(npmTestFlags(), 'fail-then-term.fixture.mjs');
  assert.equal(r.status, 1, 'the run fails');
  assert.equal(r.died.length, 1, 'one FILE DIED line:\n' + r.err);
  assert.match(r.died[0], /^FILE DIED test\/fixtures\/death\/fail-then-term\.fixture\.mjs exitCode=unknown signal=unknown after=unknown /);
});

test('silent row: an ordinary failing subtest in a file that ends normally prints no FILE DIED line', () => {
  const r = run(npmTestFlags(), 'failing.fixture.mjs');
  assert.equal(r.status, 1, 'the run fails (x-fails)');
  assert.ok(r.out.includes('x-fails'), 'the failure is reported by spec');
  assert.ok(passed(r.out, 'four-ends'), 'the file ran to its end');
  assert.deepEqual(r.died, [], 'no FILE DIED line');
});

test('must-fail control: the same SIGTERM run with spec-only flags has no FILE DIED line', () => {
  const r = run(SPEC_ONLY, 'sigterm.fixture.mjs');
  assert.equal(r.status, 1, 'the run fails');
  assert.ok(r.out.includes("'test failed'"), 'spec prints only test failed');
  assert.deepEqual(r.died, [], 'spec alone cannot name the signal');
  assert.ok(!r.out.includes('SIGTERM') && !r.err.includes('SIGTERM'), 'nor does it mention it');
});

// B2: the flush hook must be in every await-free spawnSync file, and in every fixture (one exact line, imported)
const HOOK = 'beforeEach(() => new Promise((r) => setImmediate(r)));';
const SYNC_FILES = ['ext-audit.test.mjs', 'build.test.mjs', 'bytecode-budget.test.mjs', 'bytecode-budget-stage.test.mjs',
  'bytecode-budget-diff-boundary.test.mjs', 'inlining-budget-diff.test.mjs', 'death-signature.test.mjs',
  'ext-audit-alloc.test.mjs', 'deopt-diff-live.test.mjs', 'bytecode-budget-order.test.mjs'];

test('hook row: every all-sync test file and every death fixture has the beforeEach flush hook exactly once', () => {
  const files = SYNC_FILES.map((f) => 'test/' + f).concat(readdirSync(join(ROOT, FIX)).sort().map((f) => FIX + f));
  assert.ok(files.length >= SYNC_FILES.length + 4, 'fixtures listed: ' + files.join(' '));
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.equal(src.split('\n').filter((l) => l === HOOK).length, 1, f + ': the hook line exactly once');
    assert.match(src, /^import \{ [^}]*\bbeforeEach\b[^}]* \} from 'node:test';$/m, f + ': beforeEach imported from node:test');
  }
});
