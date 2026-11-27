// Target mk is clean, but top-level Reflect.deleteProperty normalizes an object -> unattributed delta.
function mk(i) { const o = { a: i, b: 2 }; return o.a + o.b; }
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
const ext = { x: 1, y: 2 };
Reflect.deleteProperty(ext, "x");
if (s === -1) console.log(s, ext.y);
