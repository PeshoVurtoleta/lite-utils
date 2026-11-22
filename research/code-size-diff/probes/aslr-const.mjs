// Probe: ASLR heap-pointer stability check across repeated runs.
// Embeds module-level object constants directly into the hot loop.
const SENTINEL = { tag: 1 };
const MAP_A = { v: 11 };
const MAP_B = { v: 29 };

function aslrHot(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const obj = (i & 1) ? MAP_A : MAP_B;
    if (obj !== SENTINEL) s = (s + obj.v) | 0;
  }
  return s;
}

let acc = 0;
for (let i = 0; i < 4000; i++) acc ^= aslrHot(50);
if (acc === 999999999) console.log(acc);
