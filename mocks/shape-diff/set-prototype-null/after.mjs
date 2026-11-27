// Target mk mutates object prototype to null -> ForceSetPrototype ReplaceDescriptors.
function mk(i) {
  const o = { a: i, b: 2 };
  if (i === 100) Object.setPrototypeOf(o, null);
  return o.a + o.b;
}
let s = 0;
for (let i = 0; i < 5000; i++) s += mk(i);
if (s === -1) console.log(s);
