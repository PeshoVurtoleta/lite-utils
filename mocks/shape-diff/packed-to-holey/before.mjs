// In-bounds write keeps array PACKED_SMI_ELEMENTS.
function mk(i) {
  const a = [1, 2, 3];
  a[2] = i | 0;
  return a[2];
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
