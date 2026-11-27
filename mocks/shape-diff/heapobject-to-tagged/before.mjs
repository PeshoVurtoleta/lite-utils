// Holder.v always receives a HeapObject.
function Holder(v) {
  this.v = v;
}
const obj = { k: 1 };
let s = 0;
for (let i = 0; i < 20000; i++) s += new Holder(obj).v.k;
if (s === -1) console.log(s);
