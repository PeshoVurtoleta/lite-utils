// test/fixtures/death/fail-then-term.fixture.mjs -- fixture for test/death-signature.test.mjs (NOT a *.test.mjs: npm test's glob never runs it).
// One test FAILS, then the file child gets SIGTERM: node drops this file-level event (subtestsFailed).
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import { test, beforeEach } from 'node:test';
import { spawnSync } from 'node:child_process';

// the T3 hook (same line as test/ext-audit.test.mjs): yield once before each test so the previous test's report flushes
beforeEach(() => new Promise((r) => setImmediate(r)));

test('one-sync-pass', () => { spawnSync(process.execPath, ['-e', '0']); });
test('two-sync-pass', () => { spawnSync(process.execPath, ['-e', '0']); });
test('x-fails', () => { throw new Error('ordinary failure'); });
test('three-sync-pass', () => { spawnSync(process.execPath, ['-e', '0']); });
test('four-dies', () => { process.kill(process.pid, 'SIGTERM'); });
