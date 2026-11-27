// Holder.v receives a HeapObject then a Smi -> generalizes HeapObject to Tagged.
function Holder(v) {
  this.v = v;
}
const obj = { k: 1 };
let s = 0;
for (let i = 0; i < 20000; i++) {
  const h = new Holder(i === 5000 ? 7 : obj);
  s += typeof h.v === "number" ? h.v : h.v.k;
}
if (s === -1) console.log(s);
