import { arg } from "./mod.mjs";
function add(a, b) { return a + b; }
%PrepareFunctionForOptimization(add);
add(1, 2); add(3, 4);
%OptimizeFunctionOnNextCall(add);
add(5, 6);
add(arg(), 8);
