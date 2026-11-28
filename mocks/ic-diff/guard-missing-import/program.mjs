import { get } from "./dep.mjs";
const a = { x: 1 };
let s = 0;
for (let i = 0; i < 20; i++) s += get(a);
if (s === -1) console.log(s);
