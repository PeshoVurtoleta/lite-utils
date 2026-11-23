// Helper module B: defines a larger `hot` function (for ambiguous-name swap test).
function k1(x) { return (x * 3 + 1) ^ (x >>> 2); }
function k2(x) { return ((x + 7) * 5) ^ (x << 1); }
export function runBig(n) {
  function hot(x) { return (k1(x) + k2(x + 1) + k1(x + 2)) | 0; }
  let s = 0;
  for (let i = 0; i < n; i++) s = (s + hot(i)) | 0;
  return s;
}
