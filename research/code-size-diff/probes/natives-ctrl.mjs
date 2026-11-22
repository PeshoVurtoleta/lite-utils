// Probe: S-8 deterministic live control using --allow-natives-syntax.
function natFn(x) { return (x * 3 + 1) | 0; }
%PrepareFunctionForOptimization(natFn);
natFn(1);
natFn(2);
%OptimizeFunctionOnNextCall(natFn);
const r = natFn(3);
if (r === -1) console.log(r);
