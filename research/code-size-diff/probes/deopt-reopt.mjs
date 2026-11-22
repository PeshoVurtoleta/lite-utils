// Probe: deopt + recompile churn (Maglev -> TurboFan -> deopt -> recompile) and --turbolev size delta.
function deoptReopt(x) {
  return x + 1;
}
let acc = 0;
for (let i = 0; i < 50000; i++) acc += deoptReopt(i);
// Trigger Smi -> Double deopt then re-warm
for (let i = 0; i < 50000; i++) acc += deoptReopt(i + 0.5);
if (acc === -1) console.log(acc);
