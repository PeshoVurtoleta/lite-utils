#!/usr/bin/env bash
# RESEARCH PROTOTYPE -- NOT A SHIPPED SCRIPT.
# Blueprint for LiteUtils 1.4.0: src/import-audit.sh (ROADMAP L1).
#
# import-audit.prototype.sh -- what importing MODULE does to everyone else:
#   - globals added / changed / deleted on globalThis (by Reflect.ownKeys + full property descriptors;
#     never invokes getters, catches replaced getters/setters and attribute changes; A5)
#   - built-in prototype own-property additions / changes / deletions (by Reflect.ownKeys + full
#     property descriptors; catches replaced methods and symbol keys; A1, A2)
#   - open libuv handles / active resources left after import (process.getActiveResourcesInfo multiset)
#   - V8 protector cells invalidated between @@LITE-MARK start and end (--trace-protector-invalidation)
#   - young GCs during the import (--trace-gc, 1 MB semi-spaces): STATISTICAL, REPORTED only (S-5)
#
# Architectural note on promotion to src/import-audit.sh:
#   The [PROTOTYPE SHIM] sections below match LiteUtils's real lib/*.sh fragment boundaries
#   (`prologue.sh`, `common.sh`, `args.sh`, `v8flags.sh`). Single-target null control stays local
#   (same reason as code-size-diff Q-CSD-NCTL: lib/nullctl.sh hard-codes `for side in before after`).
#   Env strip uses `unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS`
#   at startup (matching src/ic-diff.sh:154 / src/allocation-diff.sh:158 Q-ENV; lib/common.sh has
#   no env-strip helper today).

unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS
unset CDPATH

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/prologue.sh`
# =============================================================================================
set -euo pipefail
shopt -u nocasematch 2>/dev/null || true
[[ ! -o posix ]] || set +o posix
export LC_ALL=C

FINAL=""
DIED=""
SIG_PID=""
SIG_PGID=""
DRV_RC=0
TMP_DIR=""
REPORT=""
SELF="$(cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")"
trap 'rc=$?; if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf -- "$TMP_DIR"; fi; if [[ -z "$FINAL" ]]; then set +e; [[ -n "$DIED" ]] || printf "import-audit: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT

_sig() {
  [[ -z "$FINAL" ]] || return 0
  trap '' INT TERM HUP
  if [[ -n "$SIG_PGID" ]]; then
    kill -KILL -- -"$SIG_PGID" 2>/dev/null || true
  fi
  local p k=" " l="$SIG_PID $(jobs -pr)"
  for p in $l; do
    [[ $k == *" $p "* ]] || { k="$k$p "; kill -KILL "$p" 2>/dev/null || true; }
  done
  for p in $k; do wait "$p" 2>/dev/null || true; done
  die "interrupted (SIG$1)"
}
sig_arm() { trap '_sig INT' INT; trap '_sig TERM' TERM; trap '_sig HUP' HUP; }
sig_arm

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/common.sh` (verbatim signatures)
# =============================================================================================
die() {
  DIED=1
  printf 'import-audit: %s\nVERDICT NO-VERDICT\n' "$*" >&2
  if [[ $BASH_SUBSHELL -eq 0 && -n "$REPORT" && -s "$REPORT" ]]; then
    { printf 'import-audit: %s\nVERDICT NO-VERDICT\n' "$*" >>"$REPORT"; } 2>/dev/null || true
  fi
  exit 2
}
say() {
  if [[ -n "$REPORT" ]]; then printf '%s\n' "$*" | tee -a "$REPORT"
  else printf '%s\n' "$*"
  fi
}
sha8() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | tr -d '\\' | cut -c1-8; }
multiset() { LC_ALL=C sort | LC_ALL=C uniq -c; }
nl_refuse() {
  local l="$1" s
  shift
  for s in "$@"; do
    case "$s" in *$'\n'*|*$'\r'*) die "$l: a newline or a CR is not allowed (it would forge report lines)" ;; esac
  done
}
nl_dir() { # lib/common.sh:125 verbatim
  local x e t c cur new p="" lg=""
  nl_refuse "$1" "$2"
  t="$2"; [[ $t == /* ]] || t="$PWD/$t"
  while [[ -n $t ]]; do
    c=${t%%/*}; if [[ $t == */* ]]; then t=${t#*/}; else t=""; fi
    case "$c" in ""|.) ;; ..) lg=${lg%/*} ;; *) lg="$lg/$c" ;; esac
  done
  for x in "$2" "${lg:-/}"; do
    [[ $x != -* ]] || x="./$x"
    e=$x; while [[ ! -e "$e" && ! -L "$e" && "$e" != . ]]; do e=$(dirname -- "$e"); done
    if [[ $e == . ]]; then t=$x; else t=${x#"$e"}; fi
    cur=$(CDPATH= cd -P -- "$e" 2>/dev/null && pwd -P) || break
    new=""
    while [[ -n $t ]]; do
      c=${t%%/*}; if [[ $t == */* ]]; then t=${t#*/}; else t=""; fi
      case "$c" in
        ""|.) ;;
        ..) if [[ -n $new ]]; then new=${new%/*}; else cur=${cur%/*}; fi ;;
        *) if [[ -z $new && ( -e "$cur/$c" || -L "$cur/$c" ) ]]; then cur=$(CDPATH= cd -P -- "$cur/$c" 2>/dev/null && pwd -P) || break 2
           else new="$new/$c"; fi ;;
      esac
    done
    cur="${cur%/}$new"; [[ -n $cur ]] || cur=/
    if [[ -z $p ]]; then p=$cur; elif [[ $cur == "$p" ]]; then p=${lg:-/}; fi
  done
  [[ -z $p ]] || nl_refuse "$1" "$p"
}
rep_refuse() { # lib/common.sh:103 verbatim
  local x n
  for n in report.txt ${OUT_NAMES-}; do
    for x in "$@"; do
      [[ -z "$x" || ! "$OUT/$n" -ef "$x" ]] || die "--out: $OUT/$n is an input file of this run ($x): the run would overwrite it"
    done
  done
}

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/args.sh` (verbatim)
# =============================================================================================
need() {
  if [[ -n "$v" ]]; then return 0; fi
  [[ $# -ge 2 ]] || die "$a needs a value"
  v="$2"; return 1
}

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/v8flags.sh` (100% VERBATIM -- zero local edits!)
# =============================================================================================
# shellcheck disable=SC2016
V8FL_AWK='
p != "" { if (match($0, /^ +type: [a-z0-9_]+/)) { t = substr($0, RSTART, RLENGTH); sub(/^ +type: /, "", t); print p " " t }; p = "" }
/^  --[a-z0-9_-]+ \(/ { p = $1; sub(/^--/, "", p); gsub(/_/, "-", p) }
'
V8FL_RE='-(log|logfile|prof|profile|profiling|profiler|trace|print|perf|redirect|dump|stats|verbose|snapshot|gdbjit|counters|help|abort|fuzzing|file|logger)-'
V8FL_TAB=""
v8fl_read() {
  local raw rows rc=0
  raw=$(env -u NODE_OPTIONS -u NODE_COMPILE_CACHE "$1" --v8-options 2>/dev/null) || rc=$?
  [[ $rc -eq 0 ]] || die "cannot run $1 --v8-options"
  [[ -n "$raw" ]] || die "$1 --v8-options printed nothing"
  rows=$(printf '%s\n' "$raw" | LC_ALL=C awk "$V8FL_AWK") || rows=""
  [[ -n "$rows" ]] || die "$1 --v8-options lists no V8 flag"
  V8FL_TAB=$'\n'"$rows"$'\n'
}
v8fl_ok() {
  local nl=$'\n' g b t re v=0 neg=0
  g=${1//_/-}
  [[ "$g" == --* ]] || return 1
  b=${g#--}
  if [[ "$b" == *=* ]]; then v=1; [[ -n "${b#*=}" ]] || return 1; b=${b%%=*}; fi
  if [[ "$b" == no-* && "$V8FL_TAB" != *"$nl$b "* ]]; then b=${b#no-}; neg=1; fi
  case "$b" in ''|*[!abcdefghijklmnopqrstuvwxyz0123456789-]*) return 1 ;; esac
  re="$nl$b ([a-z0-9_]+)$nl"
  [[ "$V8FL_TAB" =~ $re ]] || return 1
  t=${BASH_REMATCH[1]}
  [[ "$t" != string ]] || return 1
  if [[ "-$b-" =~ $V8FL_RE ]]; then return 1; fi
  if [[ $neg -eq 1 && "$t" != bool && "$t" != maybe_bool ]]; then return 1; fi
  case "$t" in bool|maybe_bool) [[ $v -eq 0 ]] ;; *) [[ $v -eq 1 ]] ;; esac
}
v8fl_check() {
  local f
  v8fl_read "$1"
  for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
    v8fl_ok "$f" || die "--v8-flags must not set $f: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)"
  done
}

# =============================================================================================
# GENERATED DRIVER: audit.mjs (fixes A1, A2, A5; non-empty baseline evidence; safe fd-3 escaping)
# =============================================================================================
DRIVER_JS='import { writeSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Capture primordials BEFORE import() so prototype tampering cannot blind or crash the audit
const _uncurry = Function.prototype.bind.bind(Function.prototype.call);
const _ReflectOwnKeys = Reflect.ownKeys;
const _getOwnPropDesc = Object.getOwnPropertyDescriptor;
const _ObjectIs = Object.is;
const _hasOwn = Object.hasOwn;
const _Map = Map;
const _mapSet = _uncurry(Map.prototype.set);
const _mapGet = _uncurry(Map.prototype.get);
const _mapHas = _uncurry(Map.prototype.has);
const _strReplace = _uncurry(String.prototype.replace);
const _symToString = _uncurry(Symbol.prototype.toString);
const _String = String;
const _getActiveResourcesInfo = process.getActiveResourcesInfo;
const _processExit = process.exit;

const PROTOS = [
  ["Array", Array.prototype],
  ["Object", Object.prototype],
  ["Function", Function.prototype],
  ["Promise", Promise.prototype],
  ["Map", Map.prototype],
];

function fmtKey(k) {
  let s = typeof k === "symbol" ? _symToString(k) : _String(k);
  s = _strReplace(s, /\\/g, "\\\\");
  s = _strReplace(s, /\n/g, "\\n");
  s = _strReplace(s, /\r/g, "\\r");
  s = _strReplace(s, /\t/g, "\\t");
  return s;
}

function snapDesc(obj) {
  const map = new _Map();
  const keys = _ReflectOwnKeys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    _mapSet(map, k, _getOwnPropDesc(obj, k));
  }
  return { map, keys };
}

function descEq(a, b) {
  if (!a || !b) return a === b;
  if (a.enumerable !== b.enumerable || a.configurable !== b.configurable) return false;
  const aAcc = _hasOwn(a, "get") || _hasOwn(a, "set");
  const bAcc = _hasOwn(b, "get") || _hasOwn(b, "set");
  if (aAcc !== bAcc) return false;
  if (aAcc) return _ObjectIs(a.get, b.get) && _ObjectIs(a.set, b.set);
  return a.writable === b.writable && _ObjectIs(a.value, b.value);
}

// Baseline snapshots BEFORE import(): descriptors only (never invokes JS getters; A5).
// Iterate to fixed point (<= 4 passes) because Node C++ SetLazyDataProperty (e.g. FormData ->
// Symbol(undici.globalDispatcher.*)) materializes onto globalThis during the first descriptor walk.
let g0 = snapDesc(globalThis);
for (let pass = 0; pass < 4 && _ReflectOwnKeys(globalThis).length !== g0.keys.length; pass++) {
  g0 = snapDesc(globalThis);
}
const p0 = [];
let protoKeyTotal = 0;
for (let i = 0; i < PROTOS.length; i++) {
  const snap = snapDesc(PROTOS[i][1]);
  p0[i] = snap;
  protoKeyTotal += snap.keys.length;
}
const r0Raw = _getActiveResourcesInfo();
const r0Counts = new _Map();
for (let i = 0; i < r0Raw.length; i++) {
  const t = r0Raw[i];
  _mapSet(r0Counts, t, (_mapGet(r0Counts, t) || 0) + 1);
}

const modUrl = process.env.IA_MODULE_PATH
  ? pathToFileURL(process.env.IA_MODULE_PATH).href
  : process.env.IA_MODULE_URL;

let out = "B globals=" + g0.keys.length + " protos=" + protoKeyTotal + " resources=" + r0Raw.length + "\n";

writeSync(1, "@@LITE-MARK start\n");
let ok = false;
try {
  await import(modUrl);
  ok = true;
} catch (e) {
  writeSync(2, "import threw: " + (e && e.stack ? e.stack : _String(e)) + "\n");
}
writeSync(1, "@@LITE-MARK end\n");

if (ok) {
  // Diff globalThis by Reflect.ownKeys + full property descriptors (A5)
  const g1 = snapDesc(globalThis);
  for (let i = 0; i < g1.keys.length; i++) {
    const k = g1.keys[i];
    const d1 = _mapGet(g1.map, k);
    if (!_mapHas(g0.map, k)) {
      out += "G added " + fmtKey(k) + "\n";
    } else if (!descEq(_mapGet(g0.map, k), d1)) {
      out += "G changed " + fmtKey(k) + "\n";
    }
  }
  for (let i = 0; i < g0.keys.length; i++) {
    const k = g0.keys[i];
    if (!_mapHas(g1.map, k)) out += "G deleted " + fmtKey(k) + "\n";
  }

  // Diff watched prototypes by Reflect.ownKeys + full property descriptors (A1 + A2)
  for (let pi = 0; pi < PROTOS.length; pi++) {
    const n = PROTOS[pi][0];
    const s0 = p0[pi];
    const s1 = snapDesc(PROTOS[pi][1]);
    for (let i = 0; i < s1.keys.length; i++) {
      const k = s1.keys[i];
      const d1 = _mapGet(s1.map, k);
      if (!_mapHas(s0.map, k)) {
        out += "G proto " + n + "." + fmtKey(k) + " [added]\n";
      } else if (!descEq(_mapGet(s0.map, k), d1)) {
        out += "G proto " + n + "." + fmtKey(k) + " [changed]\n";
      }
    }
    for (let i = 0; i < s0.keys.length; i++) {
      const k = s0.keys[i];
      if (!_mapHas(s1.map, k)) out += "G proto " + n + "." + fmtKey(k) + " [deleted]\n";
    }
  }

  // Diff active handles / resources as a multiset
  const r1Raw = _getActiveResourcesInfo();
  for (let i = 0; i < r1Raw.length; i++) {
    const t = r1Raw[i];
    const c = _mapGet(r0Counts, t) || 0;
    if (c > 0) _mapSet(r0Counts, t, c - 1);
    else out += "H " + fmtKey(t) + "\n";
  }
  out += "R ok\n";
}
try { writeSync(3, out); } catch {}
_processExit(0);
'

# =============================================================================================
# STDOUT TRACE PARSER: TRACE_AWK (protector cells + young GC count inside @@LITE-MARK window)
# =============================================================================================
# shellcheck disable=SC2016
TRACE_AWK='
BEGIN { st = 0; m = ""; y = 0 }
{ sub(/\r$/, "") }
$0 == "@@LITE-MARK start" {
  if (st != 0) { if (m == "") m = "start twice" }
  else st = 1
  next
}
$0 == "@@LITE-MARK end" {
  if (st != 1) { if (m == "") m = "end before start" }
  else st = 2
  next
}
st == 1 && /^Invalidating protector cell / {
  print "P " $4
  next
}
st == 1 && /^\[[0-9]+:0x[0-9a-fA-F]+\] +[0-9]+(\.[0-9]+)? ms: (Scavenge|Minor Mark-Sweep)/ {
  y++
  next
}
END {
  if (st != 2 && m == "") m = (st == 0 ? "no @@LITE-MARK start" : "no @@LITE-MARK end")
  if (m != "") print "M " m
  print "Y " y + 0
}
'

# Parse & validate fd-3 output: requires `R ok` AND non-empty baseline `B globals>=10 protos>=50`
# shellcheck disable=SC2016
FD3_CHECK_AWK='
BEGIN { ok = 0; b_ok = 0; g = 0; p = 0; r = 0; bad = 0 }
{ sub(/\r$/, "") }
$0 == "R ok" { ok++; next }
/^B globals=[0-9]+ protos=[0-9]+ resources=[0-9]+$/ {
  b_ok++
  split($0, a, " ")
  sub(/^globals=/, "", a[2]); g = a[2] + 0
  sub(/^protos=/, "", a[3]); p = a[3] + 0
  sub(/^resources=/, "", a[4]); r = a[4] + 0
  next
}
/^G (added|changed|deleted|proto) / { next }
/^H / { next }
/^$/ { next }
{ bad++ }
END {
  if (ok != 1) { print "ERR missing or duplicate R ok (" ok ")"; exit 0 }
  if (b_ok != 1 || g < 10 || p < 50) { print "ERR empty or malformed baseline snapshot (b=" b_ok " g=" g " p=" p ")"; exit 0 }
  if (bad > 0) { print "ERR unexpected fd-3 record (" bad " line(s))"; exit 0 }
  print "OK globals=" g " protos=" p " resources=" r
}
'

# =============================================================================================
# SINGLE RUN EXECUTION WITH PROCESS-GROUP TIMEOUT (A6, LEDGER law 1, law 10)
# =============================================================================================
TRACE_FLAGS=(--trace-protector-invalidation --trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation)
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS -u NODE)

RUN_RC=0
RUN_TIMED_OUT=0
run_one_audit() { # k raw_dir driver_js_path mod_abs
  local k="$1" raw="$2" drv="$3" mabs="$4"
  local tflag="$TMP_DIR/timeout.$k" rcwd="$TMP_DIR/cwd.$k" wpid=""
  rm -f "$tflag"
  mkdir -p "$rcwd"
  RUN_RC=0; RUN_TIMED_OUT=0

  # Start node in its own process group (`set -m`) inside private cwd so timeout kills the entire
  # process group (never pkill!) and nothing node/V8 writes can land beside MODULE
  set -m
  (
    cd -- "$rcwd" && exec "${PROBE_ENV[@]}" IA_MODULE_PATH="$mabs" "$NODE_RES" \
      ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "$drv"
  ) >"$raw/run.$k.out" 2>"$raw/run.$k.err" 3>"$raw/run.$k.fd3" <&0 &
  SIG_PID=$!
  SIG_PGID=$SIG_PID
  set +m

  # Watchdog kills -$SIG_PGID if child does not exit within $TIMEOUT seconds
  (
    sleep "$TIMEOUT"
    printf '1\n' > "$tflag"
    kill -KILL -- -"$SIG_PGID" 2>/dev/null || true
  ) >/dev/null 2>&1 &
  wpid=$!

  wait "$SIG_PID" 2>/dev/null || RUN_RC=$?
  kill -KILL "$wpid" 2>/dev/null || true
  wait "$wpid" 2>/dev/null || true
  SIG_PID=""; SIG_PGID=""

  if [[ -f "$tflag" ]]; then
    RUN_TIMED_OUT=1
  fi
}

# =============================================================================================
# --self-test: canned traces + fd-3 checks + stub-node CLI / timeout / env / nullctl checks
#              (0 real Node spawns; runs cleanly without quiet-lock)
# =============================================================================================
self_test() {
  local oks=0 fails=0 ST_D rc msg
  ST_D=$(mktemp -d "${TMPDIR:-/tmp}/ia-st.XXXXXX") || { echo "FAIL self-test: mktemp -d"; FINAL=1; exit 1; }
  TMP_DIR="$ST_D"
  check() {
    if [[ "$2" == "$3" ]]; then oks=$((oks + 1)); echo "ok $1"
    else fails=$((fails + 1)); echo "FAIL $1: got [$2] want [$3]"
    fi
  }

  local GC='[1:0x1]      10 ms: Scavenge 4.0 (5.0) -> 3.0 (5.0) MB, pooled: 0 MB, 0.5 / 0.0 ms  (average mu = 1.000, current mu = 1.000) allocation failure; '
  check "trace: protector and young GC inside window only" \
    "$(printf '%s\n' 'Invalidating protector cell Before' "$GC" '@@LITE-MARK start' 'Invalidating protector cell ArrayIteratorLookupChain' "$GC" "$GC" '@@LITE-MARK end' "$GC" | awk "$TRACE_AWK" | tr '\n' ';')" \
    "P ArrayIteratorLookupChain;Y 2;"
  check "trace: missing end marker -> M" \
    "$(printf '%s\n' '@@LITE-MARK start' "$GC" | awk "$TRACE_AWK" | tr '\n' ';')" \
    "M no @@LITE-MARK end;Y 1;"
  check "trace: end before start -> M" \
    "$(printf '%s\n' '@@LITE-MARK end' '@@LITE-MARK start' '@@LITE-MARK end' | awk "$TRACE_AWK" | tr '\n' ';')" \
    "M end before start;Y 0;"
  check "trace: start twice -> M" \
    "$(printf '%s\n' '@@LITE-MARK start' '@@LITE-MARK start' '@@LITE-MARK end' | awk "$TRACE_AWK" | tr '\n' ';')" \
    "M start twice;Y 0;"

  check "fd3: valid baseline + findings + R ok -> OK" \
    "$(printf '%s\n' 'B globals=60 protos=120 resources=2' 'G proto Array.map [changed]' 'G proto Array.Symbol(lite) [added]' 'G changed crypto' 'H Timeout' 'R ok' | awk "$FD3_CHECK_AWK")" \
    "OK globals=60 protos=120 resources=2"
  check "fd3: empty baseline snapshot (globals=0) refused" \
    "$(printf '%s\n' 'B globals=0 protos=0 resources=0' 'R ok' | awk "$FD3_CHECK_AWK")" \
    "ERR empty or malformed baseline snapshot (b=1 g=0 p=0)"
  check "fd3: missing R ok refused" \
    "$(printf '%s\n' 'B globals=60 protos=120 resources=2' | awk "$FD3_CHECK_AWK")" \
    "ERR missing or duplicate R ok (0)"
  check "fd3: forged / unknown fd-3 record refused" \
    "$(printf '%s\n' 'B globals=60 protos=120 resources=2' 'WEIRD forged' 'R ok' | awk "$FD3_CHECK_AWK")" \
    "ERR unexpected fd-3 record (1 line(s))"

  # Verbatim lib/v8flags.sh v8fl_ok unit check (A3)
  V8FL_TAB=$'\nallow-natives-syntax bool\nmax-inlined-bytecode-size int\nlog-all bool\nprof bool\nsparkplug-filter string\n'
  local v1=0 v2=0 v3=0 v4=0 v5=0 v6=0
  v8fl_ok --allow-natives-syntax && v1=1
  v8fl_ok --max-inlined-bytecode-size=100 && v2=1
  v8fl_ok --log-all || v3=1
  v8fl_ok --prof || v4=1
  v8fl_ok --inspect || v5=1
  v8fl_ok --sparkplug-filter=hot || v6=1
  check "A3 v8fl_ok: accepts tuning bool/int; refuses --log-all, --prof, --inspect, string flags" "$v1$v2$v3$v4$v5$v6" "111111"

  # Build stub node (logs spawns, verifies env strip, supports canned fd3/stdout/sleep/drift)
  local stub="$ST_D/stub/node" scnt="$ST_D/stub/spawns.log" srun="$ST_D/stub/run.idx" dummy="$ST_D/mod.mjs"
  mkdir -p "$ST_D/stub"
  printf 'export const n = 1;\n' > "$dummy"
  cat > "$stub" <<'STUBEOF'
#!/usr/bin/env bash
printf 'spawn %s\n' "$*" >> "${IA_STUB_LOG:?}"
if [[ -n "${NODE_OPTIONS+x}${NODE_V8_COVERAGE+x}${NODE_COMPILE_CACHE+x}${NODE_REDIRECT_WARNINGS+x}" ]]; then
  printf 'ENV_LEAKED\n' >&2
  exit 7
fi
if [[ "${1:-}" == "--version" ]]; then printf 'v26.8.2\n'; exit 0; fi
if [[ "${1:-}" == "--v8-options" ]]; then
  printf '  --allow-natives-syntax (allow natives)\n        type: bool  default: --no-allow-natives-syntax\n'
  printf '  --log-all (log all)\n        type: bool  default: --no-log-all\n'
  printf '  --prof (prof)\n        type: bool  default: --no-prof\n'
  exit 0
fi
if [[ -n "${NODE+x}" ]]; then
  printf 'ENV_LEAKED_NODE\n' >&2
  exit 7
fi
if [[ "${IA_STUB_SLEEP:-0}" != "0" ]]; then
  sleep "${IA_STUB_SLEEP}"
  exit 0
fi
idx=0
if [[ -f "${IA_STUB_RUN:-}" ]]; then idx=$(cat "$IA_STUB_RUN"); fi
idx=$((idx + 1))
if [[ -n "${IA_STUB_RUN:-}" ]]; then printf '%s\n' "$idx" > "$IA_STUB_RUN"; fi
printf '@@LITE-MARK start\n'
printf '@@LITE-MARK end\n'
{
  if [[ "${IA_STUB_BAD_BASE:-0}" == "1" ]]; then
    printf 'B globals=0 protos=0 resources=0\n'
  else
    printf 'B globals=62 protos=145 resources=2\n'
  fi
  if [[ -n "${IA_STUB_RECORD:-}" ]]; then printf '%s\n' "$IA_STUB_RECORD"; fi
  if [[ "${IA_STUB_DRIFT_RUN:-0}" == "$idx" ]]; then printf 'G added __drift\n'; fi
  printf 'R ok\n'
} >&3
exit 0
STUBEOF
  chmod +x "$stub"
  spawns() { wc -l < "$scnt" | tr -d ' '; }

  # A1/A2/A5 canned fd3 through full tool -> DIRTY rc 1
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" IA_STUB_RECORD="G proto Array.map [changed]" /bin/bash "$SELF" --node "$stub" --runs 2 "$dummy" 2>&1) || rc=$?
  local h=0; case "$msg" in *"G proto Array.map [changed] x1"*"VERDICT DIRTY"*) h=1 ;; esac
  check "A1: replaced prototype method record -> DIRTY (rc 1)" "$rc:$h" "1:1"

  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" IA_STUB_RECORD="G proto Array.Symbol(lite) [added]" /bin/bash "$SELF" --node "$stub" --runs 2 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"G proto Array.Symbol(lite) [added] x1"*"VERDICT DIRTY"*) h=1 ;; esac
  check "A2: symbol-keyed prototype record -> DIRTY (rc 1)" "$rc:$h" "1:1"

  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" IA_STUB_RECORD="G changed crypto" /bin/bash "$SELF" --node "$stub" --runs 2 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"G changed crypto x1"*"VERDICT DIRTY"*) h=1 ;; esac
  check "A5: replaced global accessor descriptor -> DIRTY (rc 1)" "$rc:$h" "1:1"

  # A3: --log-all and --prof refused BEFORE ANY SPAWN (0 spawns, law 3!)
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --v8-flags "--log-all" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"--v8-flags must not set --log-all"*) h=1 ;; esac
  check "A3: --v8-flags --log-all refused exit 2 with 0 spawns" "$rc:$(spawns):$h" "2:0:1"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --v8-flags "--prof" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"--v8-flags must not set --prof"*) h=1 ;; esac
  check "A3: --v8-flags --prof refused exit 2 with 0 spawns" "$rc:$(spawns):$h" "2:0:1"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --v8-flags "--trace-protector-invalidation" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"conflicts with tool-owned trace flags"*) h=1 ;; esac
  check "A3: tool-owned --trace-protector-invalidation refused with 0 spawns" "$rc:$(spawns):$h" "2:0:1"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --v8-flags "--min-semi-space-size=4" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"conflicts with tool-owned trace flags"*) h=1 ;; esac
  check "A3: tool-owned --min-semi-space-size=4 refused with 0 spawns" "$rc:$(spawns):$h" "2:0:1"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --v8-flags "--inspect" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"--v8-flags must not set --inspect"*) h=1 ;; esac
  check "A3: --v8-flags --inspect refused exit 2" "$rc:$h" "2:1"
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" /bin/bash "$SELF" --node "$stub" --v8-flags "--allow-natives-syntax" --runs 2 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"VERDICT CLEAN"*) h=1 ;; esac
  check "A3: --v8-flags --allow-natives-syntax accepted by allowlist (rc 0 CLEAN)" "$rc:$h" "0:1"

  # Zero-evidence baseline refusal end-to-end
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" IA_STUB_BAD_BASE=1 /bin/bash "$SELF" --node "$stub" --runs 2 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"empty or malformed baseline snapshot"*"VERDICT NO-VERDICT"*) h=1 ;; esac
  check "zero-evidence: empty baseline snapshot refused end-to-end (rc 2)" "$rc:$h" "2:1"

  # A4: NODE_REDIRECT_WARNINGS (and all 5 NODE* vars) stripped from every spawn (incl. --v8-options)!
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(NODE="$stub" NODE_OPTIONS=--x NODE_V8_COVERAGE="$ST_D/c" NODE_COMPILE_CACHE="$ST_D/cc" NODE_REDIRECT_WARNINGS="$ST_D/w.txt" IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" /bin/bash "$SELF" --v8-flags "--allow-natives-syntax" --runs 2 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"NODE_REDIRECT_WARNINGS stripped"*"VERDICT CLEAN"*) h=1 ;; esac
  check "A4: all 5 NODE* vars (incl. NODE_REDIRECT_WARNINGS + NODE) stripped from spawns" "$rc:$h" "0:1"

  # A6: per-run timeout kills process group -> NO-VERDICT 'timed out after 1s' (rc 2)
  : >"$scnt"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_SLEEP=10 /bin/bash "$SELF" --node "$stub" --timeout 1 --runs 2 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"timed out after 1s"*"VERDICT NO-VERDICT"*) h=1 ;; esac
  check "A6: hanging run killed by process-group timeout -> NO-VERDICT (rc 2)" "$rc:$h" "2:1"

  # Null control: 3-run drift on run 3 caught -> NO-VERDICT
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" IA_STUB_DRIFT_RUN=3 /bin/bash "$SELF" --node "$stub" --runs 3 "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"null control: run 3 differs from run 1"*"VERDICT NO-VERDICT"*) h=1 ;; esac
  check "nullctl: run 3 drift caught -> NO-VERDICT (rc 2)" "$rc:$h" "2:1"

  # C1 (SD-neon-4): empty value refused (0 spawns) for EVERY value option (both '' and =)
  local opt a2_bad=0 eq_bad=0
  for opt in --node --runs --timeout --v8-flags --out; do
    : >"$scnt"; rc=0
    if [[ "$opt" == "--node" ]]; then msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "" "$dummy" 2>&1) || rc=$?
    else msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" "$opt" "" "$dummy" 2>&1) || rc=$?
    fi
    [[ "$rc:$(spawns):${msg%%$'\n'*}" == "2:0:import-audit: $opt must not be empty" ]] || a2_bad=$((a2_bad + 1))
    : >"$scnt"; rc=0
    if [[ "$opt" == "--node" ]]; then msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node= "$dummy" 2>&1) || rc=$?
    else msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" "${opt}=" "$dummy" 2>&1) || rc=$?
    fi
    [[ "$rc:$(spawns):${msg%%$'\n'*}" == "2:0:import-audit: $opt must not be empty" ]] || eq_bad=$((eq_bad + 1))
  done
  check "C1/SD-neon-4: empty separate '' refused (0 spawns) for all 5 value options" "$a2_bad" "0"
  check "C1/SD-neon-4: empty --opt= refused (0 spawns) for all 5 value options" "$eq_bad" "0"

  # C1: duplicate option refused with 0 spawns
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --runs 2 --runs 3 "$dummy" 2>&1) || rc=$?
  check "C1: duplicate --runs refused (0 spawns)" "$rc:$(spawns):${msg%%$'\n'*}" "2:0:import-audit: --runs given more than once"

  # C1/SD-neon-5: --out SYMLINK/ and SYMLINK/. refused with 0 spawns
  local real_out="$ST_D/real_out" sym_out="$ST_D/sym_out"
  mkdir -p "$real_out"; ln -s "$real_out" "$sym_out"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --out "$sym_out/" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"is a symlink (refused)"*) h=1 ;; esac
  check "C1/SD-neon-5: --out SYMLINK/ refused (0 spawns)" "$rc:$(spawns):$h" "2:0:1"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --out "$sym_out/." "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"is a symlink (refused)"*) h=1 ;; esac
  check "C1/SD-neon-5: --out SYMLINK/. refused (0 spawns)" "$rc:$(spawns):$h" "2:0:1"

  # C1: nl_dir resolved --out newline via symlink/.. refused BEFORE spawn and mkdir
  local nl_tgt="$ST_D/nl"$'\n'"out/a/b" nl_lnk="$ST_D/s36"
  mkdir -p "$nl_tgt"; ln -s "$nl_tgt" "$nl_lnk"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --out "$nl_lnk/../c" "$dummy" 2>&1) || rc=$?
  local made=0; [[ -e "$ST_D/nl"$'\n'"out/a/c" || -e "$ST_D/c" ]] && made=1
  check "C1/nl_dir: resolved --out newline refused before spawn/mkdir" "$rc:$(spawns):$made:${msg%%$'\n'*}" \
    "2:0:0:import-audit: --out (resolved): a newline or a CR is not allowed (it would forge report lines)"

  # C1: report.txt hard-link refused with 0 spawns + rep_refuse collision + happy --out write
  local hl_dir="$ST_D/hl_out"; mkdir -p "$hl_dir"
  printf 'x\n' > "$hl_dir/report.txt"; ln "$hl_dir/report.txt" "$ST_D/other_link"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --out "$hl_dir" "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"has another hard link (refused)"*) h=1 ;; esac
  check "C1: --out/report.txt hard link refused (0 spawns)" "$rc:$(spawns):$h" "2:0:1"

  local col_dir="$ST_D/col_out"; mkdir -p "$col_dir"; printf 'export const c = 1;\n' > "$col_dir/report.txt"
  : >"$scnt"; rc=0; msg=$(IA_STUB_LOG="$scnt" /bin/bash "$SELF" --node "$stub" --out "$col_dir" "$col_dir/report.txt" 2>&1) || rc=$?
  h=0; case "$msg" in *"is an input file of this run"*) h=1 ;; esac
  check "C1/rep_refuse: --out/report.txt colliding with MODULE refused (0 spawns)" "$rc:$(spawns):$h" "2:0:1"

  local ok_out="$ST_D/good_out"
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" IA_STUB_RECORD="G added foo" /bin/bash "$SELF" --node "$stub" --runs 2 --out "$ok_out" "$dummy" 2>&1) || rc=$?
  local okf=0; [[ -s "$ok_out/report.txt" && -s "$ok_out/raw/run.1.fd3" && -s "$ok_out/raw/run.2.fd3" ]] && okf=1
  check "C1: --out fresh dir writes report.txt + raw/run.{1,2}.fd3 on DIRTY" "$rc:$okf" "1:1"

  # C1/SD-neon-6: module in directory named '-' runs cleanly (no cd - OLDPWD trap)
  local dw="$ST_D/dash_work"; mkdir -p "$dw/-"; printf 'export const x = 1;\n' > "$dw/-/m.mjs"
  : >"$scnt"; rm -f "$srun"; rc=0
  msg=$(cd "$dw" && OLDPWD=/nonexistent_ia_oldpwd IA_STUB_LOG="$scnt" IA_STUB_RUN="$srun" /bin/bash "$SELF" --node "$stub" --runs 2 -- -/m.mjs 2>&1) || rc=$?
  h=0; case "$msg" in *"VERDICT CLEAN"*) h=1 ;; esac
  check "C1/SD-neon-6: module in '-' dir runs cleanly (rc 0 CLEAN)" "$rc:$h" "0:1"

  # C1/SD-neon-8: did-you-mean hint + -h lists refusals & trace flags & never cites RESEARCH.md
  rc=0; msg=$(/bin/bash "$SELF" --outt /tmp/x "$dummy" 2>&1) || rc=$?
  h=0; case "$msg" in *"(did you mean --out?)"*) h=1 ;; esac
  check "C1/SD-neon-8: unknown --outt prints did-you-mean --out" "$rc:$h" "2:1"
  rc=0; msg=$(/bin/bash "$SELF" -h 2>&1) || rc=$?
  h=0; case "$msg" in *"--timeout"*"--v8-flags"*"--trace-protector-invalidation"*) h=1 ;; esac
  local has_res=0; case "$msg" in *"RESEARCH.md"*) has_res=1 ;; esac
  check "C1/SD-neon-8: -h documents flags/refusals and never cites RESEARCH.md" "$rc:$h:$has_res" "2:1:0"

  echo ""
  if [[ $fails -eq 0 ]]; then
    echo "self-test: $oks check(s) ok"
    FINAL=1; exit 0
  else
    echo "self-test: $fails check(s) FAILED ($oks ok)"
    FINAL=1; exit 1
  fi
}

# =============================================================================================
# CLI PARSING & VALIDATION (refuses before first spawn or write; LEDGER law 3)
# =============================================================================================
usage() {
  cat >&2 <<'EOF'
import-audit.prototype.sh -- audit sideEffects:false on ESM/CJS module import

Usage:
  import-audit.prototype.sh [opts] MODULE
  import-audit.prototype.sh --self-test
  import-audit.prototype.sh -h | --help

Options:
  --node BIN       node binary (default: $NODE or node), resolved once to an absolute path
  --runs N         runs per audit, 2..20 (default: 2); run 1 vs runs 2..N is the null control
  --timeout SEC    per-run timeout in seconds, 1..300 (default: 15); kills process group -> NO-VERDICT
  --v8-flags STR   extra V8 tuning flags; traces run with --trace-protector-invalidation --trace-gc
                   --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation.
                   Validated against `node --v8-options` allowlist (bool --flag / --no-flag, numeric
                   --flag=N; log/trace/print/prof/dump/snapshot/file/string flags, node preload/eval/
                   print/inspect options, and tool-owned flags are refused exit 2; log/prof/tool-owned
                   flags refused before any node spawn).
  --out DIR        keep DIR/report.txt and DIR/raw/run.<k>.{out,err,fd3}; symlinks (incl. trailing
                   / or /.), hard-linked report.txt, non-empty DIR/raw, input collisions, and NL/CR
                   paths (raw or resolved) are refused exit 2 before any spawn or write.
  --self-test      run canned + stub-node + CLI refusal checks (exit 0 / 1); takes no other argument
  -h, --help       this text (exit 2)

Verdict (DETERMINISTIC):
  0 CLEAN          non-empty baseline snapshot; 0 globals added/changed/deleted (by descriptor),
                   0 watched prototype own-key mutations (by descriptor, incl. symbols), 0 handles left,
                   0 V8 protector cells invalidated, identical across all runs
  1 DIRTY          >= 1 deterministic finding (printed as `  <record> x<n>`), identical across runs
  2 NO-VERDICT     refusal, driver throw/exit, timeout, missing/malformed markers or fd-3 baseline,
                   or null-control drift across runs

Reported only (STATISTICAL, never changes verdict):
  young GCs during import per run (Scavenge / Minor Mark-Sweep in 1 MB semi-spaces)

Not detected (known limits):
  a global added then restored during import; a handle closed before end; prototypes outside the
  watched set; worker threads; post-window microtasks / timers scheduled after end.
EOF
  DIED=1; exit 2
}

OPTS="--node --runs --timeout --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }

SEEN_NODE=0; SEEN_RUNS=0; SEEN_TO=0; SEEN_V8=0; SEEN_OUT=0
NODE_BIN="${NODE:-node}"
RUNS=2
TIMEOUT=15
V8FLAGS=""
OUT=""
POS=()

while [[ $# -gt 0 ]]; do
  a="$1"; v=""
  if [[ "$a" == --*=* ]]; then
    v=${a#*=}; a=${a%%=*}
    case "$a" in
      --help|--self-test) die "$a takes no =value" ;;
      *) [[ -n "$v" ]] || die "$a must not be empty" ;;
    esac
  fi
  nl_refuse "option name" "$a"
  case "$a" in
    -h|--help) usage ;;
    --self-test) [[ $# -eq 1 && ${#POS[@]} -eq 0 && $SEEN_NODE$SEEN_RUNS$SEEN_TO$SEEN_V8$SEEN_OUT == 00000 ]] || die "--self-test takes no other argument"; self_test ;;
    --node) [[ $SEEN_NODE -eq 0 ]] || die "--node given more than once"; SEEN_NODE=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; NODE_BIN="$v"; shift ;;
    --runs) [[ $SEEN_RUNS -eq 0 ]] || die "--runs given more than once"; SEEN_RUNS=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; RUNS="$v"; shift ;;
    --timeout) [[ $SEEN_TO -eq 0 ]] || die "--timeout given more than once"; SEEN_TO=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; TIMEOUT="$v"; shift ;;
    --v8-flags) [[ $SEEN_V8 -eq 0 ]] || die "--v8-flags given more than once"; SEEN_V8=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; V8FLAGS="$v"; shift ;;
    --out) [[ $SEEN_OUT -eq 0 ]] || die "--out given more than once"; SEEN_OUT=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; OUT="$v"; shift ;;
    --) shift; while [[ $# -gt 0 ]]; do POS+=("$1"); shift; done ;;
    -*) die "unknown option: $a$(hint "$a") (see --help)" ;;
    *) POS+=("$1"); shift ;;
  esac
done

# Newline/CR refusal BEFORE any spawn or write (LEDGER law 3)
nl_refuse "the cwd" "$PWD"
nl_refuse "--node" "$NODE_BIN"
nl_refuse "--runs" "$RUNS"
nl_refuse "--timeout" "$TIMEOUT"
nl_refuse "--v8-flags" "$V8FLAGS"
nl_refuse "MODULE" ${POS[@]+"${POS[@]}"}
[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"

[[ ${#POS[@]} -eq 1 ]] || die "expected exactly 1 MODULE file, got ${#POS[@]} (see --help)"
MOD="${POS[0]}"
[[ -f "$MOD" && -r "$MOD" ]] || die "MODULE not found (or not a readable file): $MOD"

RE_INT='^[0-9]+$'
[[ "$RUNS" =~ $RE_INT && "$RUNS" -ge 2 && "$RUNS" -le 20 ]] || die "--runs must be 2..20, got '$RUNS'"
[[ "$TIMEOUT" =~ $RE_INT && "$TIMEOUT" -ge 1 && "$TIMEOUT" -le 300 ]] || die "--timeout must be 1..300, got '$TIMEOUT'"

# Pre-spawn --v8-flags syntax, tool-owned, preload, AND MD-53 log/prof family checks (0 spawns!)
V8_EXTRA=()
if [[ $SEEN_V8 -eq 1 ]]; then
  set -f
  # shellcheck disable=SC2206
  V8_EXTRA=($V8FLAGS)
  set +f
  [[ ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
  for f in "${V8_EXTRA[@]}"; do
    [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
    g=${f//_/-}
    case "$g" in
      *trace-gc*|*semi-space*|*protector*|*concurrent-recompilation*|*log-function-events*)
        die "--v8-flags must not set $f: conflicts with tool-owned trace flags" ;;
      --require*|--import*|--loader*|--experimental-loader*|--env-file*|--experimental-config-file*|--experimental-default-config-file*|--eval*|--print*)
        die "--v8-flags must not set $f: node preload/eval/print flag is refused" ;;
    esac
    b=${g#--}; b=${b%%=*}
    if [[ "-$b-" =~ $V8FL_RE ]]; then
      die "--v8-flags must not set $f: log/trace/print/prof/dump/snapshot/file flags are refused before spawn"
    fi
  done
fi

# --out validation BEFORE any spawn or write (C1 SD-neon-5 trailing / and /., hard link, nl_dir, rep_refuse)
if [[ -n "$OUT" ]]; then
  while :; do case "$OUT" in ?*/) OUT=${OUT%/} ;; ?*/.) OUT=${OUT%/.} ;; *) break ;; esac; done
  [[ "$OUT" != -* ]] || OUT="./$OUT"
  [[ ! -L "$OUT" ]] || die "--out: $OUT is a symlink (refused)"
  [[ ! -e "$OUT" || -d "$OUT" ]] || die "--out: $OUT exists and is not a directory"
  [[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die "--out: $OUT/raw exists and is not a directory"
  [[ ! -e "$OUT/raw" || ( -r "$OUT/raw" && -x "$OUT/raw" ) ]] || die "--out: $OUT/raw is not readable"
  [[ ! -L "$OUT/raw" ]] || die "--out: $OUT/raw is a symlink (refused)"
  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
  [[ ! -L "$OUT/report.txt" ]] || die "--out: $OUT/report.txt is a symlink (refused)"
  [[ ( -f "$OUT/report.txt" && -w "$OUT/report.txt" ) || ( ! -e "$OUT/report.txt" && ( ! -e "$OUT" || -w "$OUT" ) ) ]] || die "--out: cannot write $OUT/report.txt"
  if [[ -e "$OUT/report.txt" ]]; then
    RL=$(find "$OUT/report.txt" -links +1 2>/dev/null || true)
    [[ -z "$RL" ]] || die "--out: $OUT/report.txt has another hard link (refused)"
  fi
  OUT_UP="$OUT/raw"
  while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw ($OUT_UP is not a writable directory)"
  nl_dir "--out (resolved)" "$OUT"
  rep_refuse "$MOD"
fi

# Resolve node binary ONCE (LEDGER law 5) and MODULE path (C1 SD-neon-6 '-' dir guard)
NODE_RES=$NODE_BIN
if [[ "$NODE_RES" != */* ]]; then
  NODE_RES=$(command -v -- "$NODE_RES" 2>/dev/null) || die "node binary not found: $NODE_BIN"
fi
[[ "$NODE_RES" == */* && -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not executable: $NODE_RES"
NODE_DIR=$(dirname -- "$NODE_RES"); [[ "$NODE_DIR" != - ]] || NODE_DIR=./-
NODE_DIR=$(cd -- "$NODE_DIR" 2>/dev/null && pwd) || die "node binary: cannot resolve directory of $NODE_RES"
NODE_C="${NODE_DIR%/}/$(basename -- "$NODE_RES")"
[[ "$NODE_C" -ef "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
NODE_RES=$NODE_C
nl_refuse "--node (resolved)" "$NODE_RES"

MOD_DIR=$(dirname -- "$MOD"); [[ "$MOD_DIR" != - ]] || MOD_DIR=./-
MOD_DIR=$(cd -- "$MOD_DIR" 2>/dev/null && pwd) || die "MODULE: cannot resolve directory of $MOD"
MOD_BASE=$(basename -- "$MOD")
MOD_ABS="${MOD_DIR%/}/$MOD_BASE"
[[ "$MOD_ABS" -ef "$MOD" ]] || die "MODULE: cannot resolve directory of $MOD"
nl_refuse "MODULE (resolved)" "$MOD_ABS"

# --- Spawns start here ---
GOT_VER=$("${PROBE_ENV[@]}" "$NODE_RES" --version 2>/dev/null) || die "cannot probe $NODE_RES --version"
[[ -n "$GOT_VER" ]] || die "cannot read version from $NODE_RES"

# Verbatim lib/v8flags.sh runtime allowlist (LEDGER law 4, A3)
if [[ ${#V8_EXTRA[@]} -gt 0 ]]; then
  v8fl_check "$NODE_RES"
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/import-audit.XXXXXX") || die "cannot create temp dir"
TMP_DIR=$(cd -- "$TMP_DIR" && pwd)
if [[ -n "$OUT" ]]; then
  mkdir -p -- "$OUT/raw" || die "--out: cannot create $OUT/raw"
  OUT=$(cd -- "$OUT" && pwd)
  nl_refuse "--out (resolved)" "$OUT"
  REPORT="$OUT/report.txt"
  { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"
  RAW="$OUT/raw"
else
  RAW="$TMP_DIR/raw"; mkdir "$RAW"
fi

printf '%s' "$DRIVER_JS" > "$TMP_DIR/audit.mjs"
SHA=$(sha8 "$MOD_ABS")

say "import-audit (prototype)  node $GOT_VER  $NODE_RES  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
say "module  $MOD_ABS  sha256/8 $SHA"
say "mode    runs $RUNS  timeout ${TIMEOUT}s  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
say ""

VERDICT=CLEAN
FIRST=""
YL=""
BASE_INFO=""
for k in $(seq 1 "$RUNS"); do
  run_one_audit "$k" "$RAW" "$TMP_DIR/audit.mjs" "$MOD_ABS"
  why=""
  if [[ $RUN_TIMED_OUT -eq 1 ]]; then
    why="timed out after ${TIMEOUT}s in run $k"
  elif [[ $RUN_RC -ne 0 ]]; then
    why="driver exited $RUN_RC in run $k"
  fi
  if [[ -z "$why" ]]; then
    fd3_st=$(awk "$FD3_CHECK_AWK" "$RAW/run.$k.fd3" 2>/dev/null || echo "ERR unreadable fd-3")
    case "$fd3_st" in
      OK\ *) [[ -n "$BASE_INFO" ]] || BASE_INFO=${fd3_st#OK } ;;
      *) why="fd-3 check failed in run $k: ${fd3_st#ERR }" ;;
    esac
  fi
  tr '\000' '?' < "$RAW/run.$k.out" | awk "$TRACE_AWK" > "$TMP_DIR/t.$k"
  m=$(sed -n 's/^M //p' "$TMP_DIR/t.$k" | head -n 1)
  y=$(sed -n 's/^Y //p' "$TMP_DIR/t.$k" | head -n 1)
  YL="${YL:+$YL,}${y:-0}"
  if [[ -z "$why" && -n "$m" ]]; then
    why="markers: $m in run $k"
  fi
  if [[ -n "$why" ]]; then
    say "  NO-VERDICT -- $why"
    VERDICT=NO-VERDICT
    break
  fi
  { grep -E '^(G |H )' "$RAW/run.$k.fd3" || true; grep '^P ' "$TMP_DIR/t.$k" || true; } | multiset > "$TMP_DIR/ms.$k"
  if [[ $k -eq 1 ]]; then
    FIRST="$TMP_DIR/ms.1"
  elif ! cmp -s "$FIRST" "$TMP_DIR/ms.$k"; then
    say "  NO-VERDICT -- null control: run $k differs from run 1"
    VERDICT=NO-VERDICT
    break
  fi
done

if [[ "$VERDICT" != "NO-VERDICT" ]]; then
  say "  baseline snapshot: $BASE_INFO (REPORTED)"
  say "  young GCs during import per run: $YL (REPORTED, statistical, not gated)"
  if [[ -s "$FIRST" ]]; then
    VERDICT=DIRTY
    say "  DIRTY -- the import leaves behind (every run equal to run 1):"
    if [[ -n "$REPORT" ]]; then
      awk '{ n = $1; sub(/^ *[0-9]+ /, ""); printf "  %s x%d\n", $0, n }' "$FIRST" | tee -a "$REPORT"
    else
      awk '{ n = $1; sub(/^ *[0-9]+ /, ""); printf "  %s x%d\n", $0, n }' "$FIRST"
    fi
  else
    say "  CLEAN -- 0 global descriptor changes, 0 watched prototype changes, 0 open handles, 0 protectors invalidated (every run equal to run 1)"
  fi
fi
say ""
say "VERDICT $VERDICT"
FINAL=1
case "$VERDICT" in CLEAN) exit 0 ;; DIRTY) exit 1 ;; *) exit 2 ;; esac
