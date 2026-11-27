import { m0 } from "./Signal.js";
let s = 0;
for (let i = 0; i < 300000; i++) s = (s + m0(i)) | 0;
if (s === -1) console.log(s);
