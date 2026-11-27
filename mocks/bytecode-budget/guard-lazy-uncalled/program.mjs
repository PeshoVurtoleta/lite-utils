// add is defined lazily and never invoked.
function add(a, b) { return a + b; }
if (typeof add === "number") console.log(0);
