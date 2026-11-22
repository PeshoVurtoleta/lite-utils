// Probe: distinguishing "compiled" from "ran" in V8 logs.
// neverCalledParenFn is eagerly compiled to Ignition bytecode (~) even under default lazy mode.
// neverCalledTop / neverCalledArrow compile to ~ under --no-lazy, and even to Sparkplug (^) under --always-sparkplug.
const uncalledParen = (function neverCalledParenFn(x) { return x.a; });
function neverCalledTop(x) { return x.a; }
const neverCalledArrow = (x) => x.a;
function calledOnce(x) { return x.a; }

if (calledOnce({ a: 1 }) === -1 && uncalledParen === null && neverCalledTop === null && neverCalledArrow === null) {
  console.log(0);
}
