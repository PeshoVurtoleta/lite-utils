const arr = [1, 2, 3];
function hot(a, i) { return arr[i] + a; }
%PrepareFunctionForOptimization(hot);
hot(1, 0); hot(2, 1);
%OptimizeFunctionOnNextCall(hot);
hot(3, 0);
hot("s", 0);
