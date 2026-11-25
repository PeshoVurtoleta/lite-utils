// test/alloc-per-op-qa.test.mjs -- b92 qa boundary rows for SPEC-alloc-per-op ASSERTIONS that had no gating row.
// Oracle: the ASSERTION text, not build.sh. Spawns go through spawn-cap.mjs (capSync) only (S5 census).
//
// QA1 (G3 ASSERTION 1, "the 5 .sh outputs ... mode 0755"): build.test.mjs's drift oracle compares only the exec bits
// (mode & 0o111) of a built file with the committed root, so a build that writes the .sh outputs 0775 (group-writable)
// passes all 57 build.test.mjs rows (b92 qa mutant SC2: build.sh `.sh` step `chmod +x "$tmp"` -> `chmod 0775 "$tmp"`,
// 57 / 57 green). This row pins the full permission bits, 0755, for every output under umask 022 (build.sh's
// `chmod +x` honours the umask; 022 is the umask the golden vectors were taken under -- assumed: the golden header
// does not record it). A missing build.sh, a
// failed build or a missing output FAILS by name, never SKIPs (except on win32: build.sh is POSIX-only).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capSync } from './spawn-cap.mjs';

// spawnSync buffers each report until the event loop turns: yield once before each test (as build.test.mjs does).
beforeEach(() => new Promise((r) => setImmediate(r)));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.platform === 'win32' ? 'bash script: POSIX hosts only' : false;

test('QA1 G3 A1: under umask 022 every build.sh output (6 .sh + alloc-per-op.mjs) is mode 0755, exactly 7 entries, 0 temps (kills: .sh step chmod 0775)', { skip }, () => {
    assert.ok(existsSync(join(ROOT, 'build.sh')), 'build.sh is missing: the row FAILS, never skips');
    const gen = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.sh')).sort();
    assert.equal(gen.length, 6, 'the src .sh roster: ' + JSON.stringify(gen));
    const out = mkdtempSync(join(tmpdir(), 'apo-qa-'));
    try {
        const r = capSync('bash', ['-c', 'umask 022 && exec bash build.sh "$1"', 'qa', out], { cwd: ROOT, encoding: 'utf8' }, 60000,
            'bash build.sh (umask 022)');
        assert.equal(r.status, 0, 'build.sh exit ' + r.status + ' signal ' + r.signal + '\n' + r.stdout + r.stderr);
        const got = readdirSync(out).sort();
        assert.deepEqual(got, [...gen, 'alloc-per-op.mjs'].sort(), 'OUTDIR = the 6 .sh + 1 .mjs, no temp left');
        const bad = got.map((f) => [f, statSync(join(out, f)).mode & 0o777]).filter(([, m]) => m !== 0o755)
            .map(([f, m]) => f + ' 0' + m.toString(8));
        assert.deepEqual(bad, [], 'outputs not 0755');
    } finally { rmSync(out, { recursive: true, force: true }); }
});
