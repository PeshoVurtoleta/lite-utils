// Adds an unrelated top-level field-less class (1 MapCreate hit, dropped by C-21).
class Extra { constructor(v) { this.v = v; } }
function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }
let s = new Extra(1).v;
for (let i = 0; i < 5000; i++) s += mk(i);
if (s === -1) console.log(s);
