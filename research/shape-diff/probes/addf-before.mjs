// Probe BEFORE (add-field D7 / Node 22 & 24 N4): clean 2-field object literal.
function mk(i) { return { a: i, b: 2 }; }
let s = 0;
for (let i = 0; i < 200; i++) s += mk(i).a;
if (s === -1) console.log(s);
