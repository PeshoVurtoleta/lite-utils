// Adds one monomorphic Transition o.y = 2; detected with --include-transitions.
function mk(i) {
  const o = { x: i };
  o.y = 2;
  return o.x + o.y;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
