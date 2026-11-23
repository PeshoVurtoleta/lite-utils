// Probe AFTER (add-field D7 / Node 22 & 24 N4): clean 3-field object literal (still monomorphic!).
// Must read SAME (0 instability sites) on ALL 4 Node majors (22, 24, 26, 27).
function mk(i) { return { a: i, b: 2, c: 3 }; }
let s = 0;
for (let i = 0; i < 200; i++) s += mk(i).a;
if (s === -1) console.log(s);
