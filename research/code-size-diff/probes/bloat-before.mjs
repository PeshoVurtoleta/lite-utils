// Probe BEFORE: small leaf inlined into hot().
function leaf(x) { return (x * 3 + 1) | 0; }
function hot(n) {
  let s = 0;
  for (let i = 0; i < n; i++) s = (s + leaf(i)) | 0;
  return s;
}
let acc = 0;
for (let i = 0; i < 4000; i++) acc ^= hot(50);
if (acc === 123456789) console.log(acc);
