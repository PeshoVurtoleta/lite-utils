// Probe AFTER (ambiguous name): same two `hot` definitions imported in swapped order.
import { runBig } from './ambig-big.mjs';
import { runSmall } from './ambig-small.mjs';
let acc = 0;
for (let i = 0; i < 4000; i++) acc ^= runBig(30) ^ runSmall(30);
if (acc === 999999999) console.log(acc);
