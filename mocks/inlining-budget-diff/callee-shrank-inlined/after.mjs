function g(x) { return (x * 3 + 1) | 0; }
function m0(x) { return (g(x) + g(x + 1)) | 0; }
let s = 0;
for (let i = 0; i < 300000; i++) s = (s + m0(i)) | 0;
if (s === -1) console.log(s);
