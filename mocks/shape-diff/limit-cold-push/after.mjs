// Single cold push(1.5) transitions PACKED_SMI -> PACKED_DOUBLE with 0 V8 trace lines (documented limit).
function mk(i) {
  const a = [1, 2, 3];
  if (i === 19999) a.push(1.5);
  return a.length;
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
