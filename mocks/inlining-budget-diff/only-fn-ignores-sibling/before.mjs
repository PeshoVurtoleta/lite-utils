function g(x) { return (x * 3 + 1) | 0; }
function h(x) { return (x + 5) | 0; }
function m0(x) { return g(x); }
function other(x) { return h(x); }
let s = 0;
for (let i = 0; i < 300000; i++) s = (s + m0(i) + other(i)) | 0;
if (s === -1) console.log(s);
