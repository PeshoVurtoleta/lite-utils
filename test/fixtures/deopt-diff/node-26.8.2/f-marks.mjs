// (f) MD-18 input (Phase 3 G3 TASK 0d): do `@@LITE-MARK op <n>` markers keep their order against V8's
// --trace-opt lines on a pipe? add is forced to TURBOFAN_JS at op 50; a marker after every 10th op.
// node --allow-natives-syntax --trace-deopt-verbose --trace-opt --no-concurrent-recompilation drv-f-marks.js <log|write|sync>
import { writeSync } from 'node:fs';
const W = process.argv[2];
let mark;
if (W === 'log') mark = (n) => console.log('@@LITE-MARK op ' + n);
else if (W === 'write') mark = (n) => process.stdout.write('@@LITE-MARK op ' + n + '\n');
else if (W === 'sync') mark = (n) => writeSync(1, '@@LITE-MARK op ' + n + '\n');
else { process.stderr.write('usage: drv-f-marks.js log|write|sync\n'); process.exit(2); }
function add(a, b) { return a + b; }
%PrepareFunctionForOptimization(add);
let s = 0;
for (let op = 0; op < 100; op++) {
  if (op === 50) %OptimizeFunctionOnNextCall(add);
  s = add(s, op) | 0;
  if ((op + 1) % 10 === 0) mark(op + 1);
}
if (s !== 4950) process.exitCode = 3;
