function scan(arr, i) { return arr[i]; }
const a = [1, 2, 3];
%PrepareFunctionForOptimization(scan);
scan(a, 0); scan(a, 1);
%OptimizeFunctionOnNextCall(scan);
scan(a, 2);
if (scan(a, 7) !== undefined) console.log("unreachable");
