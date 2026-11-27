function get(o) { return o.x; }
const shapes = [{ x: 1 }, { x: 1, a: 2 }];
let s = 0;
for (let i = 0; i < 20; i++) s += get(shapes[i % shapes.length]);
if (s === -1) console.log(s);
