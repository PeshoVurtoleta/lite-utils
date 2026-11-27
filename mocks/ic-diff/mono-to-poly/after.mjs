function get(o) { return o.x; }
const a = { x: 1 };
const b = { x: 2, y: 3 };
let s = 0;
for (let i = 0; i < 20; i++) s += get(i & 1 ? b : a);
if (s === -1) console.log(s);
