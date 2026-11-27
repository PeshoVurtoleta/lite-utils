// Documented 1.2.0 #146 T-2 limit: class field declaration adds non-target CopyAddDescriptor MAP_REPLACE.
class Extra {
  x = 1;
}
function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }
let s = new Extra().x;
for (let i = 0; i < 5000; i++) s += mk(i);
if (s === -1) console.log(s);
