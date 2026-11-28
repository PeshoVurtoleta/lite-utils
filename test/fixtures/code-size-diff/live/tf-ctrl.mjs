// S-8 live control, lane TF, must-SAME side (from research/code-size-diff/probes/natives-ctrl.mjs).
// Run with --allow-natives-syntax. Target: natFn at TurboFan (marker *).
function natFn(x) { return (x * 3 + 1) | 0; }
%PrepareFunctionForOptimization(natFn);
natFn(1);
natFn(2);
%OptimizeFunctionOnNextCall(natFn);
const r = natFn(3);
if (r === -1) console.log(r);
if (!%ActiveTierIsTurbofan(natFn)) console.log('PREMISE: natFn is not at TurboFan after %OptimizeFunctionOnNextCall');
console.log('done');
