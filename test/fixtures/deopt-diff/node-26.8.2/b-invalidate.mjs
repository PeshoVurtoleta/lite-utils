// (b) dependency invalidation with offFn OFF the stack: the field write happens at top level, between calls.
const holder = { v: 1 };
function offFn() { return holder.v + 1; }
%PrepareFunctionForOptimization(offFn);
offFn(); offFn();
%OptimizeFunctionOnNextCall(offFn);
offFn();
holder.v = 2.5;
offFn();
