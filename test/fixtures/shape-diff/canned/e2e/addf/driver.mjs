// canned shape-diff e2e driver (addf): never executed -- fake-node.sh replays ./map.log and ./out.txt
function mk(i) { const o = { x: i | 0, y: 1 }; o.x = i + 0.5; o.y = 0.25; return o; }
for (let i = 0; i < 200; i++) mk(i);
console.log('done');
