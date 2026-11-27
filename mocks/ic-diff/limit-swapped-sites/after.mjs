function get(a, b) { return a.x + b.x; }
const s1 = { x: 1 };
const s2 = { x: 2, y: 3 };
let r = 0;
for (let i = 0; i < 20; i++) r += get(i & 1 ? s2 : s1, s1);
if (r === -1) console.log(r);
