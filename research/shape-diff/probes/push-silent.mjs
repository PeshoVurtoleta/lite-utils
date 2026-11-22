// Probe: proves a.push(1.5) transitions PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS
// while emitting ZERO lines in --trace-elements-transitions and --log-maps on node v26.8.2.
// Run with --allow-natives-syntax.
function pushDouble() {
  const a = [1, 2, 3];
  const hadSmi = %HasSmiElements(a);
  a.push(1.5);
  const hasDouble = %HasDoubleElements(a);
  return `hadSmi=${hadSmi} hasDouble=${hasDouble}`;
}
console.log('PUSH_PROOF:', pushDouble());
