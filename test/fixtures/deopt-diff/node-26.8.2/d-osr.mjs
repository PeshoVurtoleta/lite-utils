// (d) OSR: loopFn is compiled on-stack from inside its loop.
function loopFn(n) {
  let s = 0;
  for (let i = 0; i < n; i++) { s = (s + i) | 0; if (i === 5) %OptimizeOsr(); }
  return s;
}
%PrepareFunctionForOptimization(loopFn);
loopFn(10);
