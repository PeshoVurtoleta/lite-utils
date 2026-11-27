const a = { read(x) { return x + 1; } };
const b = { read(x) { const t = x * 3 + 7; return t - 2; } };
if (a.read(1) + b.read(1) === -1) console.log(0);
