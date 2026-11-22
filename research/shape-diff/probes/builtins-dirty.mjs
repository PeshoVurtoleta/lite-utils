// Probe AFTER (builtins): performs shape mutations through V8 builtins:
//   - a.push(1.5): SILENT in V8 14.6 (0 lines in --log-maps, --trace-elements-transitions, --trace-generalization!)
//   - a.splice(0, 1, "str"): emits unattributed `in splice+0 at <unknown>:<unknown>`
//   - Reflect.deleteProperty(o, "y"): emits `map,NormalizeCached` with pc in `Builtin:ReflectDeleteProperty`
function mutBuiltins(n) {
  const a = [1, 2, 3];
  const o = { x: 1, y: 2 };
  if (n === 5) {
    a.push(1.5);
    a.splice(0, 1, 'str');
    Reflect.deleteProperty(o, 'y');
  }
  return a[0] + o.x + n;
}
let acc = 0;
for (let i = 0; i < 100; i++) acc += mutBuiltins(i);
if (acc === -1) console.log(acc);
