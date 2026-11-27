// Monomorphic object with one field.
function mk(i) {
  const o = { x: i };
  return o.x;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
