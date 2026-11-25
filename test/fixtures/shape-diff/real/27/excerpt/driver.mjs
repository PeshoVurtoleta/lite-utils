// Probe: triggers all three V8 shape instability streams in one driver:
//   - Point: Smi -> Double deprecating field generalization (--log-maps Deprecate + --trace-generalization)
//   - Holder: Class(0xADDR) -> Any in-place field generalization (--trace-generalization ONLY)
//   - fieldGen: const -> mutable + HeapObject -> Tagged in-place generalizations (--trace-generalization ONLY)
//   - work: inline PACKED_SMI -> PACKED_DOUBLE (--trace-elements-transitions),
//           HOLEY -> DICTIONARY_ELEMENTS (--log-maps + map-details ONLY),
//           delete p.y (--log-maps Normalize / NormalizeCached)
//   - litDirty: { a: ... } Smi -> Double after boilerplate v{None} init

class A {}
class B {}

class Point {
  constructor(x, y) { this.x = x; this.y = y; }
}

class Holder {
  constructor(c) { this.child = c; }
}

function fieldGen() {
  const o = { x: 1.5, y: { k: 1 } };
  o.x = 2.5;   // const -> mutable
  o.y = 42;    // HeapObject -> Tagged
  return o;
}

function litDirty(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const o = { a: i === 10 ? 1.5 : i, b: 2 };
    s += o.a + o.b;
  }
  return s;
}

function work(n) {
  let s = 0;
  const arr = [1, 2, 3];
  for (let i = 0; i < n; i++) {
    const p = new Point(i === 50 ? 1.5 : i, i + 1);
    if (i === 10) arr[0] = 1.5;
    if (i === 20) arr[100000] = 'dict';
    if (i === 30) delete p.y;
    s += p.x;
  }
  return s;
}

const h1 = new Holder(new A());
const h2 = new Holder(new B());
const fg = fieldGen();
const out = work(500) + litDirty(50) + (h1 === h2 ? 1 : 0) + fg.x;
if (out === -1) console.log(out);
