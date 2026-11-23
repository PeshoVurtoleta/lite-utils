// Probe: both `get` and getter `get value` in the same file (tests --fn 'get,get value' vs 'get value,get').
class Box {
  constructor(v) { this._v = v; }
  get value() {
    let s = this._v;
    for (let i = 0; i < 4; i++) s = (s * 3 + 1) | 0;
    return s;
  }
}
function get(b) {
  let s = 0;
  for (let i = 0; i < 4; i++) s = (s + b.value + i) | 0;
  return s;
}

const box = new Box(7);
let acc = 0;
for (let i = 0; i < 20000; i++) acc = (acc + box.value) | 0;
for (let i = 0; i < 20000; i++) acc = (acc + get(box)) | 0;
if (acc === -1) console.log(acc);
