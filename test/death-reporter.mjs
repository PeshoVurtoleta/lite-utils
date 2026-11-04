// test/death-reporter.mjs -- node:test custom reporter: one `FILE DIED` line per test-file child that died
// (signal, non-zero exit, or vanished without its per-file summary). Silent for ordinary passing / failing subtests.
// Used by `npm test` next to spec (spec -> stdout, this -> stderr). Gate: test/death-signature.test.mjs.
// Evidence: .handoff/evidence/b27/u2-file-death-investigation.md (spec prints only 'test failed' for a dead file).
// MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
import { relative } from 'node:path';
//
// Node v26.8.2 facts (probed; runner.js FileTest):
// - A dead file child is a nesting-0 `test:fail` emitted by the PARENT, details.error = ERR_TEST_FAILURE
//   'test failed' with OWN keys exitCode and signal: SIGTERM -> exitCode null signal 'SIGTERM'; SIGKILL ->
//   null / 'SIGKILL'; process.exit(3) -> 3 / null; a top-level throw -> 7 / null. failureType 'testCodeFailure'.
// - In process isolation a file's own subtests are ALSO nesting 0 and also 'testCodeFailure', but their error
//   has no exitCode / signal keys -- that key test is what separates a file death from a failing test.
// - When the file already failed a subtest, node marks the death 'subtestsFailed' and DROPS the file-level
//   event (FileTest #skipReporting). Such a death is caught by its missing per-file `test:summary`: every child
//   that ends normally emits one; the parent stamps data.entryFile on it and on every other item the child forwards.
export default async function* deathReporter(source) {
  const seen = new Set(); // entry files that reported at least one test event (process isolation only)
  const summarized = new Set(); // entry files whose child emitted its own test:summary
  const died = new Set(); // entry files already printed
  for await (const ev of source) {
    const type = ev.type;
    const d = ev.data;
    if (d === undefined || d === null) continue;
    if (type === 'test:fail' && d.nesting === 0) {
      const e = d.details && d.details.error;
      if (e && e.failureType === 'testCodeFailure' && (Object.hasOwn(e, 'exitCode') || Object.hasOwn(e, 'signal'))) {
        const key = d.entryFile || d.file || d.name;
        died.add(key);
        const ms = d.details.duration_ms;
        yield 'FILE DIED ' + (d.name || key) + ' exitCode=' + e.exitCode + ' signal=' + e.signal +
          ' after=' + (typeof ms === 'number' ? Math.round(ms) : 'unknown') + 'ms\n';
        continue;
      }
    }
    if ((type === 'test:pass' || type === 'test:fail') && typeof d.entryFile === 'string' && d.entryFile !== '') {
      seen.add(d.entryFile);
    } else if (type === 'test:summary') {
      if (typeof d.entryFile === 'string' && d.entryFile !== '') {
        summarized.add(d.entryFile); // the parent stamps entryFile on every item a file child forwards (runner.js)
      } else {
        // root summary (no entryFile): every file that reported events but never its own summary vanished
        for (const f of seen) {
          if (!summarized.has(f) && !died.has(f)) {
            died.add(f);
            yield 'FILE DIED ' + relative(process.cwd(), f) + ' exitCode=unknown signal=unknown after=unknown' +
              ' (no per-file summary: died after a failed subtest, which hides its status, or exited 0 mid-run)\n';
          }
        }
      }
    }
  }
}
