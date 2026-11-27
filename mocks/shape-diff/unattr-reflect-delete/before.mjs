// Target mk is clean; no external delete.
function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
