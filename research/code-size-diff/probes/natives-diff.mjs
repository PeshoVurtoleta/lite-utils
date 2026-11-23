// Probe: S-8 must-DIFF twin for natives-ctrl.mjs (larger body -> larger TurboFan native size).
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
