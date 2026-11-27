function inner(a, b) { return a + b; }
function outer(a, b) { return inner(a, b) * 1; }
%PrepareFunctionForOptimization(inner);
%PrepareFunctionForOptimization(outer);
outer(1, 2); outer(3, 4);
%OptimizeFunctionOnNextCall(outer);
outer(5, 6);
outer(7, 8);
