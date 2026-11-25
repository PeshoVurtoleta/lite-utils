// canned shape-diff e2e driver (tr2): never executed -- fake-node.sh replays ./map.log and ./out.txt
function mk(i) { const o = { x: 1 }; o.y = 2; return o; }
for (let i = 0; i < 200; i++) mk(i);
console.log('done');
