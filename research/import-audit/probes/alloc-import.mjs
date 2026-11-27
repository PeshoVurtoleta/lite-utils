// B8: allocates > 2 MB of short-lived objects during import (young GC > 0, still CLEAN!)
let sink = 0;
for (let i = 0; i < 40000; i++) {
  const o = { a: i, b: i + 1, c: i + 2, d: i + 3 };
  sink += o.a;
}
export const allocSink = sink;
