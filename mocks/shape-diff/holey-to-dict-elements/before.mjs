// Small holey write stays in fast HOLEY_SMI_ELEMENTS.
function mk(i) {
  const a = [];
  a[10] = i | 0;
  return a[10];
}
let s = 0;
for (let i = 0; i < 2000; i++) s += mk(i);
if (s === -1) console.log(s);
