// (e) a getter: its JSFunction name is "get value"; an out-of-bounds index on a second instance then deopts it.
class Box { constructor(a, i) { this.a = a; this.i = i; } get value() { return this.a[this.i] + 1; } }
const g = Object.getOwnPropertyDescriptor(Box.prototype, 'value').get;
const b = new Box([1, 2, 3], 0);
%PrepareFunctionForOptimization(g);
b.value; b.value;
%OptimizeFunctionOnNextCall(g);
b.value;
new Box([1, 2, 3], 7).value;
