// A/A control with a real GEN event on both sides (non-zero evidence).
function mk(i) {
  const o = { x: i | 0 };
  o.x = i + 0.5;
  return o.x;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
