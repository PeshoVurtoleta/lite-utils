function helper(x) { let r = x + 1; r = r * 2 + 3; r = r - 1; return r; }
function add(a, b) { return a + b; }
if (add(1, helper(2)) === -1) console.log(0);
