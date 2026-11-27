function read(x) { return x + 1; }
const box = { read(x) { return x + 2; } };
if (read(1) + box.read(1) === -1) console.log(0);
