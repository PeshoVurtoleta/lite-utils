// G-DDAWK T2 (assertion 3): the "X why" judge line must survive a huge JREC element under pipefail.
// `awk '/^X /{...; exit}'` exits at the first line; printf then gets SIGPIPE on a big record, and under
// `set -o pipefail` the substitution fails. Expected output ('why') is the spec's, not a run's.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

beforeEach(() => new Promise((r) => setImmediate(r)));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
const CI_STRICT = process.env.CI === 'true';
const NEEDLE = `x=$(printf '%s\\n' "\${JREC[$i]}" | awk`;
const ROOTS = ['deopt-diff.sh', 'ic-diff.sh'];
const PIN = 'bd0192f'; // last commit before the fix: the teeth build

// child env: no git steering, no editor, no V8 coverage dir (node re-adds a deleted one)
const ENV = { ...process.env };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR']) delete ENV[k];
ENV.GIT_CONFIG_GLOBAL = '/dev/null';
ENV.GIT_CONFIG_NOSYSTEM = '1';
ENV.NODE_V8_COVERAGE = undefined;

const TMP = mkdtempSync(join(tmpdir(), 'jdrain-'));
after(() => rmSync(TMP, { recursive: true, force: true }));

const big = join(TMP, 'big.rec');
writeFileSync(big, 'X why\n' + 'E a\n'.repeat(200000));
const small = join(TMP, 'small.rec');
writeFileSync(small, 'X why\nE a\n');

function lineOf(src, name) {
  const hits = src.split('\n').filter((l) => l.includes(NEEDLE));
  assert.equal(hits.length, 1, name + ': exactly one judge line, got ' + hits.length);
  return hits[0];
}

function run(line, recFile) {
  // element read from a file (no 3 MB argv); read -d '' returns 1 at EOF, hence || true
  const script = "set -euo pipefail; i=0; IFS= read -r -d '' e < \"$REC\" || true; JREC=(\"$e\"); " +
    line + '; printf %s "$x"';
  return spawnSync(BASH, ['-c', script], { env: { ...ENV, REC: recFile }, encoding: 'utf8' });
}

for (const f of ROOTS) {
  const line = lineOf(readFileSync(join(ROOT, f), 'utf8'), f);

  test(f + ': control, 2-line record yields why', () => {
    const r = run(line, small);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'why');
  });

  // red on the pre-fix (bd0192f) roots: G-DDAWK makes it pass
  test(f + ': 200000-line record, 20 cycles, exit 0 and why', () => {
    for (let c = 0; c < 20; c++) {
      const r = run(line, big);
      assert.equal(r.status, 0, 'cycle ' + c + ' status=' + r.status + ' signal=' + r.signal + ' ' + r.stderr);
      assert.equal(r.stdout, 'why', 'cycle ' + c);
    }
  });

  const old = spawnSync('git', ['show', PIN + ':' + f],
    { cwd: ROOT, env: ENV, encoding: 'utf8', maxBuffer: 1 << 26 });
  const have = old.status === 0;
  test(f + ': teeth, ' + PIN + ' build fails the big record (SIGPIPE under pipefail)',
    { skip: have || CI_STRICT ? false : PIN + ' unreachable (set CI=true to make this fatal)' }, () => {
      assert.equal(old.status, 0, 'git show ' + PIN + ':' + f + ' failed: ' + old.stderr);
      const oline = lineOf(old.stdout, PIN + ':' + f);
      assert.equal(run(oline, small).status, 0, 'old build still fine on a small record');
      let bad = 0;
      for (let c = 0; c < 20; c++) if (run(oline, big).status !== 0) bad++;
      assert.ok(bad >= 1, 'old build must fail at least once in 20 cycles, failed ' + bad);
    });
}
