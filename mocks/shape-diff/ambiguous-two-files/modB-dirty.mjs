export function hot(i) { const o = { x: i, y: 2 }; if (i === 50) delete o.y; return o.x; }
