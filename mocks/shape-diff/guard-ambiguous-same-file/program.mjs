// Two distinct functions named mk compiled in one run.
function wrapA() {
  function mk(i) { const o = { a: i }; return o.a; }
  let s = 0;
  for (let i = 0; i < 3000; i++) s += mk(i);
  return s;
}
function wrapB() {
  function mk(i) { const o = { b: i }; return o.b; }
  let s = 0;
  for (let i = 0; i < 3000; i++) s += mk(i);
  return s;
}
if (wrapA() + wrapB() === -1) console.log(0);
