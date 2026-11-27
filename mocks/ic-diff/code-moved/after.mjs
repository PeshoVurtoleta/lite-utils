// line 1
// line 2
// line 3
// line 4
// line 5
function get(o) { return o.x; }
const a = { x: 1 };
let s = 0;
for (let i = 0; i < 20; i++) s += get(a);
if (s === -1) console.log(s);
