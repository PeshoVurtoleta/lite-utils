// S-8 live control, lane MG, must-DIFF side (from research/code-size-diff/probes/natives-diff.mjs).
// Run with --allow-natives-syntax and --tiers maglev. Target: natFn at Maglev (marker +), a larger body than mg-ctrl.mjs.
function natFn(x) {
  const a = (x * 3 + 1) | 0;
  const b = ((a ^ (x >>> 2)) * 5 + 7) | 0;
  const c = ((b + a) ^ (x << 1)) | 0;
  return (a + b + c) | 0;
}
%PrepareFunctionForOptimization(natFn);
natFn(1);
natFn(2);
%OptimizeMaglevOnNextCall(natFn);
const r = natFn(3);
if (r === -1) console.log(r);
const MAJOR = Number(process.versions.node.split('.')[0]);
if (MAJOR >= 24 && !%ActiveTierIsMaglev(natFn)) console.log('PREMISE: natFn is not at Maglev after %OptimizeMaglevOnNextCall');
console.log('done');
