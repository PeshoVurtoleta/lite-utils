// Premise pre-run for the assert cases (REF-v8-mjsunit-mocks section 1). NOT part of the audited run.
// Usage: node premises.mjs <case>        (case may end in .broken: the premise must then FAIL, exit 1)
// Exit 0: the claimed effect really happened (plain JS descriptor / reflection checks; protector
// cases also run a child node with --trace-protector-invalidation and require the cell line).
// Exit 1: a "PREMISE:" line on stderr says which check failed. Exit 2: usage error.
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const self = fileURLToPath(import.meta.url);

// Inner mode: just import the module between two stdout markers (used under the trace flag).
if (process.argv[2] === "--inner") {
  writeSync(1, "@@PREM start\n");
  await import(pathToFileURL(process.argv[3]).href);
  writeSync(1, "@@PREM end\n");
  process.exit(0);
}

const arg = process.argv[2];
if (!arg) {
  process.stderr.write("usage: node premises.mjs <case>\n");
  process.exit(2);
}
const base = arg.replace(/\.broken$/, "");
const file = join(here, arg + ".mjs");

function fail(msg) {
  process.stderr.write("PREMISE: [" + arg + "] " + msg + "\n");
  process.exit(1);
}
function need(cond, msg) { if (!cond) fail(msg); }

function traceCell(cell) {
  const r = spawnSync(process.execPath, ["--trace-protector-invalidation", self, "--inner", file],
    { encoding: "utf8", env: process.env });
  if (r.status !== 0) fail("trace child exited " + r.status + ": " + String(r.stderr).slice(0, 200));
  const out = String(r.stdout).replace(/\r/g, "");
  const a = out.indexOf("@@PREM start");
  const b = out.indexOf("@@PREM end");
  if (a < 0 || b < a) fail("trace child markers missing");
  const win = out.slice(a, b).split("\n");
  let n = 0;
  for (let i = 0; i < win.length; i++) {
    if (win[i].indexOf("Invalidating protector cell " + cell) === 0) n++;
  }
  need(n >= 1, "no 'Invalidating protector cell " + cell + "' line between markers");
}

// Captured BEFORE the import.
const origSpecies = Object.getOwnPropertyDescriptor(Array, Symbol.species);
const origThen = Promise.prototype.then;
const origParseInt = Number.parseInt;
const origToStringTag = Object.getOwnPropertyDescriptor(globalThis, Symbol.toStringTag);

// Fixed-point baseline of globalThis keys (lazy node data properties materialize on descriptor reads).
function settle() {
  let n = -1;
  for (let pass = 0; pass < 5; pass++) {
    const ks = Reflect.ownKeys(globalThis);
    for (let i = 0; i < ks.length; i++) Object.getOwnPropertyDescriptor(globalThis, ks[i]);
    if (ks.length === n) break;
    n = ks.length;
  }
  return Reflect.ownKeys(globalThis);
}
const keys0 = base === "lazy-globals-touch" ? settle() : null;

let ns = null;
try {
  ns = await import(pathToFileURL(file).href);
} catch (e) {
  fail("import threw: " + (e && e.message));
}

switch (base) {
  case "freeze-array-proto":
    need(Object.isFrozen(Array.prototype), "Array.prototype is not frozen");
    need(!Object.isExtensible(Array.prototype), "Array.prototype is still extensible");
    break;
  case "prevent-ext-object-proto":
    need(!Object.isExtensible(Object.prototype), "Object.prototype is still extensible");
    break;
  case "setproto-array-proto": {
    const p = Object.getPrototypeOf(Array.prototype);
    need(p !== Object.prototype, "Array.prototype proto is still Object.prototype");
    need(Object.getPrototypeOf(p) === Object.prototype, "intermediate object does not chain to Object.prototype");
    break;
  }
  case "same-value-new-attrs": {
    const d = Object.getOwnPropertyDescriptor(globalThis, "parseInt");
    need(d && d.value === origParseInt, "parseInt value is not the original function");
    need(d.writable === false, "parseInt is still writable");
    break;
  }
  case "species-protector": {
    const d = Object.getOwnPropertyDescriptor(Array, Symbol.species);
    need(d && typeof d.get === "function" && d.get !== origSpecies.get, "Array[Symbol.species] getter unchanged");
    traceCell("ArraySpeciesLookupChain");
    break;
  }
  case "promise-then-patch": {
    need(Promise.prototype.then !== origThen, "Promise.prototype.then unchanged");
    const v = await Promise.resolve(5).then((x) => x);
    need(v === 5, "wrapper does not delegate to the original then");
    traceCell("PromiseThenLookupChain");
    break;
  }
  case "no-elements-protector":
    need(Object.getOwnPropertyDescriptor(Array.prototype, "0")?.value === 1, "Array.prototype[0] is not 1");
    traceCell("NoElements");
    break;
  case "lazy-globals-touch": {
    const want = ["navigator", "fetch", "WebSocket", "FormData", "structuredClone",
      "crypto", "performance", "Headers", "Blob", "crypto.subtle"];
    need(ns.reads.length > 0, "no reads counted");
    for (let i = 0; i < want.length; i++) need(ns.reads.indexOf(want[i]) >= 0, "name not read: " + want[i]);
    const keys1 = Reflect.ownKeys(globalThis);
    need(keys1.length === keys0.length, "globalThis key count changed: " + keys0.length + " -> " + keys1.length);
    for (let i = 0; i < keys0.length; i++) need(keys1.indexOf(keys0[i]) >= 0, "global key vanished");
    break;
  }
  case "add-then-remove":
    need(ns.sawGlobal === true, "global was never present");
    need(ns.sawProto === true, "prototype method was never present");
    need(!Object.hasOwn(globalThis, "__ia_tmp_global"), "global still present after import");
    need(!Object.hasOwn(Array.prototype, "__ia_tmp_method"), "prototype method still present after import");
    break;
  case "symbol-tostringtag-global": {
    const d = Object.getOwnPropertyDescriptor(globalThis, Symbol.toStringTag);
    need(d && d.value === "ia-fake-tag", "globalThis[Symbol.toStringTag] is not ia-fake-tag");
    need(!origToStringTag || origToStringTag.value !== "ia-fake-tag", "baseline already had the fake tag");
    break;
  }
  case "worker-handles":
    need(ns.w && typeof ns.w.threadId === "number" && ns.w.threadId > 0, "no live worker (threadId missing)");
    break;
  case "concat-spreadable-protector":
    need(Object.getOwnPropertyDescriptor(Array.prototype, Symbol.isConcatSpreadable)?.value === false,
      "Array.prototype[Symbol.isConcatSpreadable] is not false");
    traceCell("IsConcatSpreadableLookupChain");
    break;
  default:
    process.stderr.write("premises.mjs: unknown case " + arg + "\n");
    process.exit(2);
}
process.stdout.write("PREMISE OK [" + arg + "]\n");
process.exit(0);
