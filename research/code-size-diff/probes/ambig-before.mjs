// Probe BEFORE (ambiguous name): two modules both define `hot`.
// code-size-diff MUST return NO-VERDICT (exit 2), NEVER SAME when sizes swap across files.
import { runSmall } from './ambig-small.mjs';
import { runBig } from './ambig-big.mjs';
let acc = 0;
for (let i = 0; i < 4000; i++) acc ^= runSmall(30) ^ runBig(30);
if (acc === 999999999) console.log(acc);
