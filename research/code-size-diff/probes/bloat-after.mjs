// Probe AFTER: three helpers inlined into hot(), inflating Maglev and TurboFan code size.
function h1(x) { return (x * 3 + 1) ^ (x >>> 2); }
function h2(x) { return ((x + 7) * 5) ^ (x << 1); }
function h3(x) { return (x & 1) ? h1(x) : h2(x); }
function hot(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + h3(i) + h1(i + 1) + h2(i + 2)) | 0;
  }
  return s;
}
let acc = 0;
for (let i = 0; i < 4000; i++) acc ^= hot(50);
if (acc === 123456789) console.log(acc);
