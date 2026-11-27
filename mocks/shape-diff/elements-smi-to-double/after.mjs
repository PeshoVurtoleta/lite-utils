// Writing 1.5 transitions the array from PACKED_SMI_ELEMENTS to PACKED_DOUBLE_ELEMENTS.
function mk(i) {
  const a = [1, 2, 3];
  a[0] = i + 0.5;
  return a[0];
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
