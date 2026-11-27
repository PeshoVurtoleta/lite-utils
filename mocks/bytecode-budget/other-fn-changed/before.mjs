function helper(x) { return x + 1; }
function add(a, b) { return a + b; }
if (add(1, helper(2)) === -1) console.log(0);
