// Probe BEFORE (builtins): clean function with no builtin shape mutations.
function mutBuiltins(n) {
  const a = [1, 2, 3];
  const o = { x: 1, y: 2 };
  return a[0] + o.x + n;
}
let acc = 0;
for (let i = 0; i < 100; i++) acc += mutBuiltins(i);
if (acc === -1) console.log(acc);
