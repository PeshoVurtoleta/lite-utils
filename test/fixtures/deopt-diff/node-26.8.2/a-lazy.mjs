// (a) lazy deopt: lazyFn is optimized, then a never-optimized callee invalidates a dependency while lazyFn is on the stack.
const holder = { v: 1 };
function poke(flag) { if (flag) holder.v = 2.5; }
%NeverOptimizeFunction(poke);
function lazyFn(flag) { const a = holder.v; poke(flag); return a + holder.v; }
%PrepareFunctionForOptimization(lazyFn);
lazyFn(false); lazyFn(false);
%OptimizeFunctionOnNextCall(lazyFn);
lazyFn(false);
lazyFn(true);
