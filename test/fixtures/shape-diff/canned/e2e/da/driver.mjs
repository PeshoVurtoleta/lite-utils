// canned shape-diff e2e driver (da): never executed -- fake-node.sh replays ./map.log and ./out.txt
function mk(i) { const o = { x: i | 0 }; o.x = i + 0.5; return o; }
for (let i = 0; i < 200; i++) mk(i);
import { EventEmitter } from 'node:events'; new EventEmitter().setMaxListeners(20);
console.log('done');
