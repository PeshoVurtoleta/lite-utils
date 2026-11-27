// mk overwrites o.x without deleting it; object stays in fast properties mode.
function mk(i) {
  const o = { x: i, y: 2 };
  o.x = 0;
  return o.y;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
