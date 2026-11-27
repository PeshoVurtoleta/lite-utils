export function hot(i) { const o = { a: i, b: 2 }; if (i === 50) delete o.b; return o.a; }
