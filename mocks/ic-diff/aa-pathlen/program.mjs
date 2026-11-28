function get(o) { return o.x; }
const a = { x: 1 };
const b = { y: 2, x: 3 };
let s = 0;
for (let i = 0; i < 20; i++) s += get(i & 1 ? a : b);
if (s === -1) console.log(s);
