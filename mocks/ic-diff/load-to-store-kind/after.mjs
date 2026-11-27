function touch(o) { o.x = 1; return 1; }
const a = { x: 1 };
let s = 0;
for (let i = 0; i < 20; i++) s += touch(a);
if (s === -1) console.log(s);
