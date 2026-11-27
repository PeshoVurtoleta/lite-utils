// Case 9 (must-pass): adds a global and a prototype method, then removes both. Honest: CLEAN.
globalThis.__ia_tmp_global = 7;
Array.prototype.__ia_tmp_method = function __ia_tmp_method() { return 1; };
export const sawGlobal = globalThis.__ia_tmp_global === 7;
export const sawProto = typeof Array.prototype.__ia_tmp_method === "function";
delete globalThis.__ia_tmp_global;
delete Array.prototype.__ia_tmp_method;
