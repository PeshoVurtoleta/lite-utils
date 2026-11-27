// Same mk, but after calls unrelated helper() once first to pre-fill the 18-prop MapCreate cache.
function helper() { return { h0: 0, h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0, h7: 0, h8: 0, h9: 0, h10: 0, h11: 0, h12: 0, h13: 0, h14: 0, h15: 0, h16: 0, h17: 0 }; }
function mk(i) { return { a0: i, a1: i, a2: i, a3: i, a4: i, a5: i, a6: i, a7: i, a8: i, a9: i, a10: i, a11: i, a12: i, a13: i, a14: i, a15: i, a16: i, a17: i }; }
const RUN_HELPER = true;
let s = 0;
if (RUN_HELPER) s += helper().h0;
for (let i = 0; i < 20000; i++) s += mk(i).a17;
if (s === -1) console.log(s);
