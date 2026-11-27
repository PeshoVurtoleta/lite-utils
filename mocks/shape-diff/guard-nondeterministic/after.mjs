// Deterministic null-control trip: run 1 is clean, run 2+ sees TMPDIR marker and deletes o.x.
import fs from "node:fs";
import path from "node:path";
const mark = path.join(process.env.TMPDIR, "sd-nc-flip.flag");
const flip = fs.existsSync(mark);
if (!flip) fs.writeFileSync(mark, "1\n");
function mk(i) {
  const o = { x: i, y: 2 };
  if (flip && i === 100) delete o.x;
  return o.y;
}
let s = 0;
for (let i = 0; i < 5000; i++) s += mk(i);
if (s === -1) console.log(s);
