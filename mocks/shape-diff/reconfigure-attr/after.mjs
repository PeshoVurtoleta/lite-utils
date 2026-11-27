// mk reconfigures attribute enumerable:false -> target RECONF record.
function shape() { const o = { a: 1, b: 2 }; o.a = 2; return o; }
function warm() { const o = shape(); Object.defineProperty(o, "a", { enumerable: false }); return o; }
warm(); warm();
function mk(i) { const o = shape(); Object.defineProperty(o, "a", { enumerable: false }); return o; }
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i).a;
if (s === -1) console.log(s);
