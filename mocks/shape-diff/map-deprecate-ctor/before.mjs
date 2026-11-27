// Every Point instance initializes this.x as a Smi.
function Point(x) {
  this.x = x;
  this.y = 1;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += new Point(i | 0).x;
if (s === -1) console.log(s);
