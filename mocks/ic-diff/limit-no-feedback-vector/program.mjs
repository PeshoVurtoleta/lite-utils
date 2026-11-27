function get(o) { return o.x; }
const a = { x: 1 };
if (get(a) + get(a) === -1) console.log(0);
