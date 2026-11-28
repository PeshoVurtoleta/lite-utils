// S-8 live control, lane TF, must-DIFF side (from research/code-size-diff/probes/natives-diff.mjs).
// Run with --allow-natives-syntax. Target: natFn at TurboFan (marker *), a larger body than tf-ctrl.mjs.
function natFn(x) {
  const a = (x * 3 + 1) | 0;
  const b = ((a ^ (x >>> 2)) * 5 + 7) | 0;
  const c = ((b + a) ^ (x << 1)) | 0;
  return (a + b + c) | 0;
}
%PrepareFunctionForOptimization(natFn);
natFn(1);
natFn(2);
%OptimizeFunctionOnNextCall(natFn);
const r = natFn(3);
if (r === -1) console.log(r);
if (!%ActiveTierIsTurbofan(natFn)) console.log('PREMISE: natFn is not at TurboFan after %OptimizeFunctionOnNextCall');
console.log('done');
