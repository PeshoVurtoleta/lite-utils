// S-8 live control, lane MG, must-SAME side (from research/code-size-diff/probes/natives-ctrl.mjs).
// Run with --allow-natives-syntax and --tiers maglev. Target: natFn at Maglev (marker +) on node >= 24.
function natFn(x) { return (x * 3 + 1) | 0; }
%PrepareFunctionForOptimization(natFn);
natFn(1);
natFn(2);
%OptimizeMaglevOnNextCall(natFn);
const r = natFn(3);
if (r === -1) console.log(r);
const MAJOR = Number(process.versions.node.split('.')[0]);
if (MAJOR >= 24 && !%ActiveTierIsMaglev(natFn)) console.log('PREMISE: natFn is not at Maglev after %OptimizeMaglevOnNextCall');
console.log('done');
