// A7 bench B = { x, y, b1 }. Each lane logs its first call into a shared log (globalThis); one 'exit' hook (the first
// bench to load installs it) prints `ORDER <log>` on stderr, e.g. ORDER A:x,B:x,A:y,B:y.
const g = globalThis;
if (!g.__apoOrder) {
    g.__apoOrder = [];
    process.on('exit', () => { process.stderr.write('ORDER ' + g.__apoOrder.join(',') + '\n'); });
}
const buf = new Float64Array(2);
function mk(name) {
    let seen = false;
    return (i) => { if (!seen) { seen = true; g.__apoOrder.push('B:' + name); } buf[i & 1] = i + 0.5; };
}
export const lanes = { x: mk('x'), y: mk('y'), b1: mk('b1') };
