// D-A probe (RECHECK2 section 5): target mk() builds an EventEmitter and calls setMaxListeners(), whose
// node:events frame generalizes the field _maxListeners of the user's object, printed as
//   [generalizing]_maxListeners:h{Any;const}->... [~setMaxListeners+N at node:events:L]
// The frozen prototype skips every ELEM / GEN line whose frame location is not a file path, so this
// instability is invisible to it (a false SAME against the same driver without the setMaxListeners line).
import { EventEmitter } from 'node:events';
function mk(i) {
  const e = new EventEmitter();
  e.setMaxListeners(i + 1);
  return e.getMaxListeners();
}
let s = 0;
for (let i = 0; i < 20000; i++) s += mk(i);
if (s === -1) console.log(s);
