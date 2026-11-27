// Single cold push of an integer on the last iteration.
function mk(i) {
  const a = [1, 2, 3];
  if (i === 19999) a.push(4);
  return a.length;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
