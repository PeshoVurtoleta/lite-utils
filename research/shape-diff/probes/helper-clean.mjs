// Probe BEFORE (N1 non-target helper): mk() calls clean helper noop() (200 calls).
function noop(o) { return o.a; }
function mk(i) {
  const o = { a: i, b: 2 };
  return noop(o) + o.b;
}
let s = 0;
for (let i = 0; i < 200; i++) s += mk(i);
if (s === -1) console.log(s);
