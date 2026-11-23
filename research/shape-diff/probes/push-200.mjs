// Probe: 200 calls of a.push(1.5) (contrasts with push-silent.mjs 1 cold call).
// On Node 22/24/26/27: 1 cold call emits 0 lines, while 200 calls emit 2x `in push+0 at <unknown>:<unknown>`.
function pushMany() {
  const a = [1, 2, 3];
  a.push(1.5);
  return a.length;
}
let s = 0;
for (let i = 0; i < 200; i++) s += pushMany();
if (s === -1) console.log(s);
