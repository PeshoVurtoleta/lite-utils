import { writeSync } from 'node:fs';
function add(a, b) { return a + b; }
%PrepareFunctionForOptimization(add);
add(1, 2); add(3, 4);
writeSync(1, '@@LITE-MARK op 2\n');
%OptimizeFunctionOnNextCall(add);
add(5, 6);
writeSync(1, '@@LITE-MARK op 3\n');
add('x', 'y');
writeSync(1, '@@LITE-MARK op 4\n');
