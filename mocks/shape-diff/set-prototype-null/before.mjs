// Target mk returns a plain object with unchanged prototype.
function mk(i) {
  const o = { a: i, b: 2 };
  return o.a + o.b;
}
let s = 0;
for (let i = 0; i < 5000; i++) s += mk(i);
if (s === -1) console.log(s);
