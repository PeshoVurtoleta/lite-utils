// mk deletes non-last property o.x -> object transitions to dictionary mode (Normalize).
function mk(i) {
  const o = { x: i, y: 2 };
  delete o.x;
  return o.y;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
