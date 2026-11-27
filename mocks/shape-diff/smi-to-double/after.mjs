// mk stores a floating-point number into o.x -> Smi -> Double field generalization.
function mk(i) {
  const o = { x: i | 0 };
  o.x = i + 0.5;
  return o.x;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
