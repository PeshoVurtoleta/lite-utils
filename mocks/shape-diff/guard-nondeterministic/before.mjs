// Clean deterministic before side.
function mk(i) { const o = { x: i, y: 2 }; return o.x + o.y; }
let s = 0;
for (let i = 0; i < 5000; i++) s += mk(i);
if (s === -1) console.log(s);
