// Helper module A: defines a small `hot` function (for ambiguous-name swap test).
export function runSmall(n) {
  function hot(x) { return (x * 3 + 1) | 0; }
  let s = 0;
  for (let i = 0; i < n; i++) s = (s + hot(i)) | 0;
  return s;
}
