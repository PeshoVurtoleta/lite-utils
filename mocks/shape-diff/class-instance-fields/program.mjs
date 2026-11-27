// Documented 1.2.0 #146 T-1 limit: V8 logs the field initializer under Box at a second location.
class Box {
  x = 0;
  constructor(v) { this.x = v; }
}
let s = 0;
for (let i = 0; i < 5000; i++) s += new Box(i).x;
if (s === -1) console.log(s);
