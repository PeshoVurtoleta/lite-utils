// canned shape-diff e2e driver (mono2): never executed -- fake-node.sh replays ./map.log and ./out.txt
// (one more line: mk sits on line 3, its sites move, the cross-side diff strips locations)
function mk(i) { const o = { x: i | 0 }; o.x = i + 0.5; return o; }
for (let i = 0; i < 200; i++) mk(i);
console.log('done');
