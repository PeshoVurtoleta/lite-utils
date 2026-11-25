// canned shape-diff e2e driver (umd): never executed -- fake-node.sh replays ./map.log and ./out.txt
function mk(i) { const o = { x: i | 0, z: 1 }; o.x = i + 0.5; return o; }
for (let i = 0; i < 200; i++) mk(i);
Reflect.deleteProperty(mk(1), 'z');
console.log('done');
