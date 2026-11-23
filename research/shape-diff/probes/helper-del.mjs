// Probe AFTER (N1 non-target helper): mk() calls non-target helper del() which deletes o.a.
// At 200 calls del() is NOT inlined into mk(); shape-diff MUST NOT return SAME (must return NO-VERDICT via UM).
function del(o) { delete o.a; return o.b; }
function mk(i) {
  const o = { a: i, b: 2 };
  return del(o);
}
let s = 0;
for (let i = 0; i < 200; i++) s += mk(i);
if (s === -1) console.log(s);
