// Huge sparse index forces DICTIONARY_ELEMENTS.
function mk(i) {
  const a = [];
  a[100000] = i | 0;
  return a[100000];
}
let s = 0;
for (let i = 0; i < 2000; i++) s += mk(i);
if (s === -1) console.log(s);
