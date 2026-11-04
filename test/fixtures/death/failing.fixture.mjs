// test/fixtures/death/failing.fixture.mjs -- fixture for test/death-signature.test.mjs (NOT a *.test.mjs: npm test's glob never runs it).
// An ordinary failing subtest in a file that ends normally: the reporter must stay silent.
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import { test, beforeEach } from 'node:test';
import { spawnSync } from 'node:child_process';

// the T3 hook (same line as test/ext-audit.test.mjs): yield once before each test so the previous test's report flushes
beforeEach(() => new Promise((r) => setImmediate(r)));

test('one-sync-pass', () => { spawnSync(process.execPath, ['-e', '0']); });
test('two-sync-pass', () => { spawnSync(process.execPath, ['-e', '0']); });
test('x-fails', () => { throw new Error('ordinary failure'); });
test('three-sync-pass', () => { spawnSync(process.execPath, ['-e', '0']); });
test('four-ends', () => {});
