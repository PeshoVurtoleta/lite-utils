function mk(i) { const o = { x: i | 0 }; o.x = i | 0; return o.x; }
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
