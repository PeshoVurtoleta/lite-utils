function touch(o) { return o.x; }
const a = { x: 1 };
let s = 0;
for (let i = 0; i < 20; i++) s += touch(a);
if (s === -1) console.log(s);
