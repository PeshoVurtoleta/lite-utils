// Probe: clean monomorphic patterns that MUST NOT trigger false instability:
//   1. Monomorphic class Point (2 normal property Transitions)
//   2. Plain object literal { a: i, b: 2 } (triggers v{None;const}->s{Any;const} one-time boilerplate init!)
//   3. Benign anonymous Symbol() property (keeps HOLEY_ELEMENTS -> HOLEY_ELEMENTS in map-details)

const anonSym = Symbol();

class Point {
  constructor(x, y) { this.x = x; this.y = y; }
}

function makeLit(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const o = { a: i, b: 2 };
    s += o.a + o.b;
  }
  return s;
}

function work(n) {
  let s = 0;
  const arr = [1, 2, 3];
  const box = {};
  box[anonSym] = 42;
  for (let i = 0; i < n; i++) {
    const p = new Point(i, i + 1);
    arr[0] = i;
    s += p.x + p.y + arr[0] + box[anonSym];
  }
  return s;
}

const out = work(500) + makeLit(500);
if (out === -1) console.log(out);
