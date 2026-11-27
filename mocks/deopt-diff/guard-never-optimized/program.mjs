function add(a, b) { return a + b; }
let s = 0;
for (let i = 0; i < 10; i++) s += add(i, 1);
if (s === -1) console.log(s);
