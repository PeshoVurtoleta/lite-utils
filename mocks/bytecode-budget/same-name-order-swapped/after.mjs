const b = { read(x) { const t = x * 3 + 7; return t - 2; } };
const a = { read(x) { return x + 1; } };
if (b.read(1) + a.read(1) === -1) console.log(0);
