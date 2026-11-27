import { hot as h1 } from "./modA.mjs";
import { hot as h2 } from "./modB.mjs";
let s = 0;
for (let i = 0; i < 3000; i++) s += h1(i) + h2(i);
if (s === -1) console.log(s);
