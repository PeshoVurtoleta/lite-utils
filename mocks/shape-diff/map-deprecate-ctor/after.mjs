// Mid-loop a Double instance deprecates the Smi Point map and generalizes x.
function Point(x) {
  this.x = x;
  this.y = 1;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += new Point(i === 5000 ? 1.5 : (i | 0)).x;
if (s === -1) console.log(s);
