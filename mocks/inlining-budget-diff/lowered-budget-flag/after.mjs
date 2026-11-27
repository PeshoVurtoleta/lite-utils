function g(x) {
  let r = x | 0;
  if ((r & 1) === 0) r = (r + 4) | 0; else r = (r ^ 7) | 0;
  if ((r & 2) === 0) r = (r + 7) | 0; else r = (r ^ 12) | 0;
  if ((r & 3) === 0) r = (r + 10) | 0; else r = (r ^ 17) | 0;
  if ((r & 4) === 0) r = (r + 13) | 0; else r = (r ^ 22) | 0;
  if ((r & 5) === 0) r = (r + 16) | 0; else r = (r ^ 27) | 0;
  if ((r & 6) === 0) r = (r + 19) | 0; else r = (r ^ 32) | 0;
  if ((r & 7) === 0) r = (r + 22) | 0; else r = (r ^ 37) | 0;
  if ((r & 8) === 0) r = (r + 25) | 0; else r = (r ^ 42) | 0;
  return r;
}
function m0(x) { return (g(x) + g(x + 1)) | 0; }
let s = 0;
for (let i = 0; i < 300000; i++) s = (s + m0(i)) | 0;
if (s === -1) console.log(s);
