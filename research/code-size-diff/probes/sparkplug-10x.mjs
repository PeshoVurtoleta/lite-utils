// Probe: Sparkplug (^) 10-run determinism check under --no-concurrent-recompilation.
function smallFn(x) { return (x * 3 + 1) | 0; }
function medFn(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = (s + ((i * 3 + 1) ^ (i >>> 2)) + (((i + 7) * 5) ^ (i << 1))) | 0;
  }
  return s;
}
function noLoop(x) {
  let a = x + 1, b = x + 2, c = x + 3;
  return (a * b + c) | 0;
}
let acc = 0;
for (let i = 0; i < 4000; i++) acc ^= smallFn(i) ^ medFn(40) ^ noLoop(i);
if (acc === 999999999) console.log(acc);
