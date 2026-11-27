// mk is defined but never called -> no execution evidence.
function mk(i) { return i + 1; }
if (typeof mk === "number") console.log(mk(0));
