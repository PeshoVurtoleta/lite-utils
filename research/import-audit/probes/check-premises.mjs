// Separate premise pre-run for a single probe module (REF-v8-mjsunit-mocks section 1).
// Usage: node check-premises.mjs <case_id> <module_abs_path>
// Runs in a FRESH node process BEFORE the audited run -- NEVER inside the audited run!
// Exits 0 iff the module genuinely produced its intended side effect in plain JS.
import { pathToFileURL } from "node:url";
import { createHook } from "node:async_hooks";

const [caseId, modPath] = process.argv.slice(2);
if (!caseId || !modPath) {
  console.error("usage: node check-premises.mjs <case_id> <module_abs_path>");
  process.exit(2);
}

const url = pathToFileURL(modPath).href;
const origMap = Array.prototype.map;
const origAt = Object.getOwnPropertyDescriptor(Array.prototype, "at");
const origIter = Array.prototype[Symbol.iterator];
const origMapGet = Map.prototype.get;
const origQMT = globalThis.queueMicrotask;
const origBtoa = Object.getOwnPropertyDescriptor(globalThis, "btoa");
const origCryptoDesc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const r0 = process.getActiveResourcesInfo().filter((t) => t === "Timeout").length;
let ahTimeouts = 0;
let hook = null;
if (caseId === "unref-timer") {
  hook = createHook({ init(_id, type) { if (type === "Timeout") ahTimeouts++; } });
  hook.enable();
}

let threw = null;
try {
  await import(url);
} catch (e) {
  threw = e;
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`PREMISE FAIL [${caseId}]: ${msg}`);
    process.exit(1);
  }
}

switch (caseId) {
  case "add-global":
    assert(threw === null, "unexpected throw");
    assert(Object.getOwnPropertyDescriptor(globalThis, "__ia_added")?.value === 42, "globalThis.__ia_added !== 42");
    break;
  case "change-global":
    assert(threw === null, "unexpected throw");
    assert(globalThis.queueMicrotask !== origQMT, "queueMicrotask unchanged");
    break;
  case "delete-global":
    assert(threw === null, "unexpected throw");
    assert(origBtoa !== undefined && !Object.hasOwn(globalThis, "btoa"), "btoa not deleted");
    break;
  case "replace-crypto-getter": {
    assert(threw === null, "unexpected throw");
    const d1 = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    assert(origCryptoDesc && typeof origCryptoDesc.get === "function", "baseline crypto not a getter");
    assert(d1 && typeof d1.get === "function" && d1.get !== origCryptoDesc.get, "crypto getter identity unchanged");
    assert(d1.get.call(globalThis) === origCryptoDesc.get.call(globalThis), "wrapped crypto getter changed return value");
    break;
  }
  case "accessor-global-add": {
    assert(threw === null, "unexpected throw");
    const d1 = Object.getOwnPropertyDescriptor(globalThis, "__ia_trap_getter");
    assert(d1 && typeof d1.get === "function", "__ia_trap_getter accessor not installed");
    let trapThrew = false;
    try { void globalThis.__ia_trap_getter; } catch { trapThrew = true; }
    assert(trapThrew && globalThis.__ia_getter_was_invoked === true, "trap getter did not fire when read");
    break;
  }
  case "replace-array-map":
    assert(threw === null, "unexpected throw");
    assert(Object.getOwnPropertyDescriptor(Array.prototype, "map")?.value !== origMap, "Array.prototype.map unchanged");
    break;
  case "symbol-array-proto":
    assert(threw === null, "unexpected throw");
    assert(Object.getOwnPropertyDescriptor(Array.prototype, Symbol.for("lite.ia.sym"))?.value === 1, "symbol key missing");
    break;
  case "delete-proto-prop":
    assert(threw === null, "unexpected throw");
    assert(origAt !== undefined && !Object.hasOwn(Array.prototype, "at"), "Array.prototype.at not deleted");
    break;
  case "tamper-primordials":
    assert(threw === null, "unexpected throw");
    assert(Array.prototype[Symbol.iterator] !== origIter, "Array.prototype[Symbol.iterator] unchanged");
    assert(Object.getOwnPropertyDescriptor(Object.prototype, "get")?.value === 1, "Object.prototype.get missing");
    assert(Map.prototype.get !== origMapGet, "Map.prototype.get unchanged");
    break;
  case "open-timer": {
    assert(threw === null, "unexpected throw");
    const r1 = process.getActiveResourcesInfo().filter((t) => t === "Timeout").length;
    assert(r1 === r0 + 1, `expected Timeout count ${r0 + 1}, got ${r1}`);
    break;
  }
  case "unref-timer": {
    if (hook) hook.disable();
    assert(threw === null, "unexpected throw");
    // Prove the unref'd timer really exists (async_hooks sees Timeout) AND getActiveResourcesInfo omits it
    const r1 = process.getActiveResourcesInfo().filter((t) => t === "Timeout").length;
    assert(ahTimeouts >= 1, `expected async_hooks Timeout >= 1, got ${ahTimeouts}`);
    assert(r1 === r0, `expected getActiveResourcesInfo to omit unref timer (${r0}), got ${r1}`);
    break;
  }
  case "protector-array-iter":
    assert(threw === null, "unexpected throw");
    assert(Array.prototype[Symbol.iterator] !== origIter, "Array.prototype[Symbol.iterator] unchanged");
    break;
  case "throws":
    assert(threw !== null && String(threw.message || threw).includes("ia_intentional_import_error"), "module did not throw");
    break;
  case "transitive-parent":
    assert(threw === null, "unexpected throw");
    assert(globalThis.__ia_transitive_global === "from-dep", "transitive global missing");
    break;
  case "cjs-dirty":
    assert(threw === null, "unexpected throw");
    assert(globalThis.__ia_cjs_global === 1, "cjs global missing");
    break;
  default:
    console.error(`PREMISE FAIL: unknown case_id ${caseId}`);
    process.exit(2);
}

console.log(`PREMISE OK [${caseId}]`);
process.exit(0);
