// Probe: attempt to trigger all V8 --log-code $9 symbolic tier markers on node.
// Default run targets: ~ ^ + +' o+ * *'
// Run with --no-maglev targets: o*
// osrCaptures tests whether OSR ever emits context-specialized o+' or o*'.

let capturedFactor = 3;

function modHot(n) {
  let s = 0;
  for (let i = 0; i < n; i++) s = (s + i * 3) | 0;
  return s;
}

function modOsr() {
  let s = 0;
  for (let i = 0; i < 200000; i++) s = (s + (i ^ 7)) | 0;
  return s;
}

function osrCaptures() {
  let s = 0;
  for (let i = 0; i < 300000; i++) s = (s + i * capturedFactor) | 0;
  return s;
}

function makeAdder(k) {
  return function multiCtx(x) {
    let s = k;
    for (let i = 0; i < 40; i++) s = (s + x + i) | 0;
    return s;
  };
}

function makeOsr(k) {
  return function multiOsr(n) {
    let s = k;
    for (let i = 0; i < n; i++) s = (s + (i ^ k)) | 0;
    return s;
  };
}

function medSpark(x) {
  let a = x + 1, b = x + 2, c = x + 3, d = x + 4;
  return ((a ^ b) + (c ^ d) + (a * b) - (c * d)) | 0;
}

const f1 = makeAdder(1), f2 = makeAdder(2), f3 = makeAdder(3);
const o1 = makeOsr(1), o2 = makeOsr(2);

let acc = 0;
for (let i = 0; i < 6000; i++) {
  acc ^= modHot(40);
  acc ^= f1(i) ^ f2(i) ^ f3(i);
  acc ^= medSpark(i);
}
acc ^= modOsr();
acc ^= osrCaptures();
acc ^= o1(250000) ^ o2(250000);
if (acc === 999999999) console.log(acc);
