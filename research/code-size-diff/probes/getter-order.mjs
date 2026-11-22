// Probe: both `get` and getter `get value` in the same file (tests --fn 'get,get value' vs 'get value,get').
class Box {
  constructor(v) { this._v = v; }
  get value() { return (this._v * 3 + 1) | 0; }
}
function get(b) { return b.value; }

const box = new Box(7);
let acc = 0;
for (let i = 0; i < 20000; i++) acc = (acc + get(box)) | 0;
if (acc === -1) console.log(acc);
