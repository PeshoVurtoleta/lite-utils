// bytecode-budget probe driver (node 26.8.2). Verbatim fixture: do not edit without recapturing.
// add: tiny; mid: 75..460 bytes; big: > 460 bytes; read + Store.read + obj.read + getter;
// dup: two distinct functions named dup; lazy: defined, never called; inner: closure.

function add(a, b) { return a + b; }

function mid(a, n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const v = a[i];
    if (v > 10) s += v * 2;
    else if (v < -10) s -= v * 3;
    else s += v;
    if ((i & 3) === 0) s ^= i;
    if (s > 1000000) s = s % 9973;
  }
  const o = { s, n, k: s - n };
  return o.s + o.k + (n > 4 ? a[0] + a[1] + a[2] + a[3] : 0);
}

function big(a, n) {
  let s = 0;
  let t = 1;
  for (let i = 0; i < n; i++) {
    const v = a[i];
    if (v > 10) s += v * 2; else if (v < -10) s -= v * 3; else s += v;
    if (v > 20) t += v * 5; else if (v < -20) t -= v * 7; else t += v;
    if ((i & 3) === 0) s ^= i;
    if ((i & 7) === 1) t ^= i;
    if (s > 1000000) s = s % 9973;
    if (t > 1000000) t = t % 9967;
    const o = { s, t, i, v };
    s += o.s & 1; t += o.t & 1;
    s += a[(i + 1) % n] | 0; t += a[(i + 2) % n] | 0;
    s += a[(i + 3) % n] | 0; t += a[(i + 4) % n] | 0;
    s += a[(i + 5) % n] | 0; t += a[(i + 6) % n] | 0;
    s += a[(i + 7) % n] | 0; t += a[(i + 8) % n] | 0;
  }
  for (let j = 0; j < n; j++) {
    const w = a[j];
    switch (w & 7) {
      case 0: s += 1; break;
      case 1: s += 2; break;
      case 2: t += 3; break;
      case 3: t += 4; break;
      case 4: s -= 5; break;
      case 5: t -= 6; break;
      case 6: s ^= 7; break;
      default: t ^= 8;
    }
  }
  return s + t;
}

function read(x) { return x + 1; }

class Store {
  constructor() { this.v = 7; }
  read() { return this.v; }
  get value() { return this.v * 2; }
  static make() { return new Store(); }
}

const objA = { read(x) { return x * 2; } };
const objB = { read: function (x) { return x * 3; } };

const dupA = (function () { function dup(x) { return x + 1; } return dup; })();
const dupB = (function () { function dup(x) { let y = x; y = y * 2; y = y + 3; return y - x; } return dup; })();

function lazy(x) { return x + 42; }

function outer(n) {
  function inner(k) { return k * n; }
  return inner(n) + 1;
}

const arr = [1, 25, -30, 4, 11, -12, 7, 8, 9, 10];
let acc = 0;
for (let r = 0; r < 3; r++) {
  acc += add(r, 1);
  acc += mid(arr, arr.length);
  acc += big(arr, arr.length);
  acc += read(r);
  const st = Store.make();
  acc += st.read() + st.value;
  acc += objA.read(r) + objB.read(r);
  acc += dupA(r) + dupB(r);
  acc += outer(r);
}
if (acc === -1) console.log(lazy(acc));
