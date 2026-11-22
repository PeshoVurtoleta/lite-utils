#!/usr/bin/env bash
# RESEARCH PROTOTYPE -- NOT A SHIPPED SCRIPT.
# Blueprint for LiteUtils (ROADMAP L2, scheduled last): src/shape-diff.sh.
#
# shape-diff.prototype.sh -- BEFORE vs AFTER V8 shape / elements-kind / field-representation
# stability DIFF for NAMED functions, combining ALL THREE V8 shape streams in ONE run:
#   1. --log-maps --logfile=<abs>/run.log  (keeping map-details ON: separates
#        HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS from benign anonymous Symbol() transitions)
#   2. --trace-elements-transitions (regular-file stdout, NEVER a pipe)
#   3. --trace-generalization (regular-file stdout, NEVER a pipe)
#
# WHY NO `--stable` GATE MODE HERE (changed after live node v26.8.2 counterexample probes):
#   Empirically proven in `probes/push-silent.mjs` (`--allow-natives-syntax`): `a.push(1.5)`
#   transitions a JSArray from PACKED_SMI_ELEMENTS to PACKED_DOUBLE_ELEMENTS while emitting
#   ZERO lines across --log-maps, --trace-elements-transitions, and --trace-generalization!
#   Because V8 14.6's CSA/Torque Array.prototype.push path is completely silent to all three
#   flags, an unqualified single-driver `VERDICT STABLE` gate would issue false positives and
#   violate LiteUtils Q-AUDIT-RUBRIC ("Rubric by consequence").
#
# WHY AN UNATTRIBUTED-INSTABILITY DELTA GUARD IN `diff` MODE:
#   Empirically proven in `probes/builtins-dirty.mjs`: `Reflect.deleteProperty(o, 'y')` logs
#   `map,NormalizeCached` with pc in `Builtin:ReflectDeleteProperty` (line 0, col -1), and
#   `a.splice(0, 1, 'str')` logs `in splice+0 at <unknown>:<unknown>`. Both are invisible to
#   per-`--fn` attribution. Tracking the whole-process unattributed instability multiset lets
#   `diff` fail closed to `NO-VERDICT` whenever attributed `--fn` sites look SAME while
#   unattributed builtin instability changed between BEFORE and AFTER (preventing false SAME).
#
# Architectural note on promotion to src/shape-diff.sh:
#   The [PROTOTYPE SHIMS] sections below stand in for build-time `# @include lib/*.sh`
#   (prologue, msdiff, common, tracked, v8flags, args, stage) so this prototype runs standalone.

# =============================================================================================
# [PROTOTYPE SHIMS] -- replaced by `# @include lib/prologue.sh` in src/shape-diff.sh
# =============================================================================================
set -euo pipefail
shopt -u nocasematch 2>/dev/null || true
[[ ! -o posix ]] || set +o posix
export LC_ALL=C

FINAL=""
DIED=""
SIG_PID=""
DRV_RC=0
TMP_DIR=""
REPORT=""
trap 'rc=$?; if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf -- "$TMP_DIR"; fi; if [[ -z "$FINAL" ]]; then set +e; [[ -n "$DIED" ]] || printf "shape-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT

_sig() {
  [[ -z "$FINAL" ]] || return 0
  trap '' INT TERM HUP
  local p k=" " l="$SIG_PID $(jobs -pr)"
  for p in $l; do
    [[ $k == *" $p "* ]] || { k="$k$p "; kill -KILL "$p" 2>/dev/null || true; }
  done
  for p in $k; do wait "$p" 2>/dev/null || true; done
  die "interrupted (SIG$1)"
}
sig_arm() { trap '_sig INT' INT; trap '_sig TERM' TERM; trap '_sig HUP' HUP; }
drv_wait() { SIG_PID=$!; DRV_RC=0; wait "$SIG_PID" || DRV_RC=$?; SIG_PID=""; }
sig_arm

die() {
  DIED=1
  printf 'shape-diff: %s\nVERDICT NO-VERDICT\n' "$*" >&2
  if [[ $BASH_SUBSHELL -eq 0 && -n "$REPORT" && -s "$REPORT" ]]; then
    { printf 'shape-diff: %s\nVERDICT NO-VERDICT\n' "$*" >>"$REPORT"; } 2>/dev/null || true
  fi
  exit 2
}
say() {
  if [[ -n "$REPORT" ]]; then printf '%s\n' "$*" | tee -a "$REPORT"
  else printf '%s\n' "$*"
  fi
}

worst() {
  case "$1:$2" in
    *NO-VERDICT*) echo NO-VERDICT ;;
    *DIFF*) echo DIFF ;;
    *) echo "$2" ;;
  esac
}

# =============================================================================================
# [PROTOTYPE SHIMS] -- replaced by `# @include lib/msdiff.sh` in src/shape-diff.sh
# =============================================================================================
multiset() { LC_ALL=C sort | LC_ALL=C uniq -c; }

# shellcheck disable=SC2016
MSDIFF_AWK='
function key(s) { sub(/^ *[0-9]+ /, "", s); return s }
function show(k,   u, l) { u = k; sub(/\t.*/, "", u); l = k; sub(/^[^\t]*\t/, "", l); return (u == "*") ? l : "[" u "] " l }
FILENAME == ARGV[1] { k = key($0); b[k] = $1 + 0; all[k] = 1; next }
{ k = key($0); a[k] = $1 + 0; all[k] = 1 }
END { for (k in all) if (b[k] + 0 != a[k] + 0) printf "  before=%d after=%d  %s\n", b[k], a[k], show(k) }
'

# =============================================================================================
# [PROTOTYPE SHIMS] -- replaced by `# @include lib/v8flags.sh` in src/shape-diff.sh
# =============================================================================================
# WHY runtime `--v8-options` ALLOWLIST (LEDGER law 4 / MD-50..58), NEVER a denylist alone:
#   Refuses node CLI options (--run, --test, --eval, --inspect, --cpu-prof), unknown flags,
#   string-valued V8 flags, and log/trace/print/prof/dump/snapshot/file flags automatically.
# shellcheck disable=SC2016
V8FL_AWK='
p != "" { if (match($0, /^ +type: [a-z0-9_]+/)) { t = substr($0, RSTART, RLENGTH); sub(/^ +type: /, "", t); print p " " t }; p = "" }
/^  --[a-z0-9_-]+ \(/ { p = $1; sub(/^--/, "", p); gsub(/_/, "-", p) }
'
V8FL_RE='-(log|logfile|prof|profile|profiling|profiler|trace|print|perf|redirect|dump|stats|verbose|snapshot|gdbjit|counters|help|abort|fuzzing|file|logger)-'
V8FL_TAB=""
v8fl_read() {
  local raw rows rc=0
  raw=$(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS "$1" --v8-options 2>/dev/null) || rc=$?
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
    v8fl_ok "$f" || die "--v8-flags must not set $f: only V8 tuning flags of this node binary are accepted (node options, unknown flags, string flags, and log/trace/print/prof/dump/snapshot/file flags are refused)"
  done
}

# =============================================================================================
# PARSER 1: MAP_AWK (single-pass POSIX awk over --log-maps CSV with map-details ON)
# =============================================================================================
# Input:  -v fns="fn1,fn2"  -v inc_trans=0|1
# Output:
#   K <fn>                 fn had code-creation (~ or ^); compiled, NOT yet proof of execution!
#   R <fn>                 fn had REAL execution evidence in --log-maps:
#                            (a) optimizing-tier compile (+, +', o+, *, *', o*) OR
#                            (b) >= 1 attributed `map` event (Transition/InitialMap/Normalize/...)
#                          WHY separate K vs R (fixing compiled-but-uncalled guard bug):
#                            Empirically proven in `probes/uncalled.mjs`: `(function f(){})`
#                            emits Ignition `~` without ever running; `--no-lazy --always-sparkplug`
#                            emits BOTH `~` AND `^` without ever running! Requiring R (or
#                            stdout E/I execution evidence) prevents uncalled functions from
#                            falsely passing the guard.
#   M <fn><TAB><class><TAB><base:line:col><TAB><detail><TAB><hits>
#                          Deduplicated per-site attributed instability record.
#   T <fn><TAB><count>     REPORTED normal monomorphic Transition/InitialMap site count.
#   UM <class><TAB><owner><TAB><detail>
#                          Unattributed (Builtin:* or NONE/pc=0) instability event (one line
#                          per event so multiset catches both 0->1 ReflectDeleteProperty and
#                          4->5 ObjectSetPrototypeOf!). Used for the fail-closed unattributed
#                          delta guard in diff mode.
#   X <why> at log line <n> [(+<m> more X line(s))]
#
# WHY parse map-details (and NOT pass --no-log-maps-details):
#   Empirically proven in `probes/unstable-all.mjs` + `probes/clean-and-literal.mjs`:
#   V8 emits BOTH `a[100000] = "dict"` (HOLEY -> DICTIONARY_ELEMENTS) AND benign
#   `o[Symbol()] = 1` as `map,Transition,...,symbol(hash HEX)`. Reading `elements kind:`
#   from `map-details` (`map_ek[$4] != map_ek[$5]`) separates them with zero hardcoded hashes.
# shellcheck disable=SC2016
MAP_AWK='
function hex(s,   i, v) {
  v = 0; s = tolower(substr(s, 3))
  for (i = 1; i <= length(s); i++) v = v * 16 + index("0123456789abcdef", substr(s, i, 1)) - 1
  return v
}
function failx(why) { if (!NX++) { XW = why; XL = NR } }
function safe(s) { gsub(/[^ -~]/, "?", s); return (length(s) > 40 ? substr(s, 1, 40) ".." : s) }
function owner(nm,   i, f, r) {
  for (i = 1; i <= NF_N; i++) {
    f = FNS[i]
    if (substr(nm, 1, length(f) + 1) != f " ") continue
    r = substr(nm, length(f) + 2)
    if (substr(r, 1, 1) == "/" || substr(r, 1, 8) == "file:///") {
      sub(/:[0-9]+:[0-9]+$/, "", r); SCR = r; sub(/.*\//, "", r); BASE = r; return f
    }
  }
  return ""
}
function norm_key(k) {
  if (substr(k, 1, 7) == "symbol(") gsub(/hash [0-9a-fA-F]+/, "hash *", k)
  return k
}
function add_code(s, z, f, b, p, tag) {
  nc++; cs[nc] = s; ce[nc] = s + z; cf[nc] = f; cb[nc] = b; cp[nc] = p; ctag[nc] = tag; lv[nc] = 1
  gen++
}
BEGIN {
  FS = ","
  NF_N = split(fns, FNS, ",")
  nc = 0; gen = 0; NX = 0; NM = 0; NUM = 0

  split("v8-version v8-platform new delete heap-available heap-capacity script-source code-source-info sfi-move code-deopt map-create", t, " ")
  for (i in t) EV[t[i]] = 1

  split("Builtin BytecodeHandler RegExp Stub Handler Wasm", t, " ")
  for (i in t) NONJS[t[i]] = 1

  split("JS Eval Script", t, " ")
  for (i in t) JSTY[t[i]] = 1

  # All allowed $9 markers; OPT_MK marks tiers that require actual execution (excludes ~ and ^).
  mk["~"] = 1; mk["^"] = 1
  mk["+"] = 1; mk["+\047"] = 1; mk["o+"] = 1; mk["o+\047"] = 1
  mk["*"] = 1; mk["*\047"] = 1; mk["o*"] = 1; mk["o*\047"] = 1
  opt_mk["+"] = 1; opt_mk["+\047"] = 1; opt_mk["o+"] = 1; opt_mk["o+\047"] = 1
  opt_mk["*"] = 1; opt_mk["*\047"] = 1; opt_mk["o*"] = 1; opt_mk["o*\047"] = 1

  split("Transition Deprecate Normalize NormalizeCached SlowToFast ReplaceDescriptors InitialMap", t, " ")
  for (i in t) MT[t[i]] = 1
}
$1 == "map-details" {
  if (NF >= 4 && $3 ~ /^0x[0-9a-fA-F]+$/) {
    if (match($0, /elements kind: [A-Z0-9_]+/)) {
      map_ek[$3] = substr($0, RSTART + 15, RLENGTH - 15)
    }
  }
  next
}
$1 == "code-creation" {
  if (index($0, "\t") > 0) { failx("code-creation contains TAB"); next }
  if ($2 in NONJS) {
    if (NF != 7 || $5 !~ /^0x[0-9a-fA-F]+$/ || length($5) > 15 || $6 !~ /^[0-9]+$/) {
      failx("non-JS code-creation does not parse (" safe($2) ")")
      next
    }
    bname = $7; sub(/ .*/, "", bname)
    add_code(hex($5), $6 + 0, "", "", "", $2 ":" bname)
    next
  }
  if (!($2 in JSTY)) { failx("unknown code-creation type " safe($2)); next }
  if (NF != 9 || $5 !~ /^0x[0-9a-fA-F]+$/ || length($5) > 15 || $6 !~ /^[0-9]+$/ || !($9 in mk)) {
    failx("JS code-creation does not parse (" safe($2) ")")
    next
  }
  BASE = ""; SCR = ""
  f = ($2 == "JS" ? owner($7) : "")
  if (f != "") {
    COMP[f] = 1
    if ($9 in opt_mk) EXEC[f] = 1
  }
  add_code(hex($5), $6 + 0, f, BASE, SCR, "JS")
  next
}
$1 == "code-move" {
  if (NF != 3 || $2 !~ /^0x[0-9a-fA-F]+$/ || $3 !~ /^0x[0-9a-fA-F]+$/ || length($2) > 15 || length($3) > 15) {
    failx("code-move does not parse"); next
  }
  p = hex($2); h = 0
  for (i = nc; i >= 1; i--) if (lv[i] && cs[i] == p) { h = i; break }
  if (!h) { failx("code-move from an unknown start"); next }
  lv[h] = 0
  add_code(hex($3), ce[h] - cs[h], cf[h], cb[h], cp[h], ctag[h])
  next
}
$1 == "map" {
  if (NF != 10) { failx("map line not 10 fields (NF=" NF ")"); next }
  if (index($0, "\t") > 0) { failx("map line contains TAB"); next }
  mtype = $2
  if (!(mtype in MT)) { failx("unknown map event type " safe(mtype)); next }
  if ($6 !~ /^0x[0-9a-fA-F]+$/ || length($6) > 15 || $7 !~ /^-?[0-9]+$/ || $8 !~ /^-?[0-9]+$/) {
    failx("map line does not parse"); next
  }
  p = hex($6)
  h = 0
  if (p != 0) {
    if ((p in pc_gen) && pc_gen[p] == gen) {
      h = pc_hit[p]
    } else {
      for (i = nc; i >= 1; i--) if (lv[i] && p >= cs[i] && p < ce[i]) { h = i; break }
      pc_gen[p] = gen; pc_hit[p] = h
    }
  }

  nkey = norm_key($10)
  reason = $9
  cls = ""
  if (mtype == "Deprecate") {
    cls = "MAP_DEPRECATE"
  } else if (mtype == "Normalize" || mtype == "NormalizeCached") {
    cls = "MAP_NORMALIZE"
  } else if (mtype == "SlowToFast") {
    cls = "MAP_SLOW2FAST"
  } else if (mtype == "ReplaceDescriptors") {
    cls = "MAP_REPLACE"
  } else if (mtype == "Transition" && ($4 in map_ek) && ($5 in map_ek) && map_ek[$4] != map_ek[$5]) {
    cls = "MAP_ELEM_DICT"
    reason = map_ek[$4] " -> " map_ek[$5]
    nkey = ""
  }

  # Unattributed builtin / C++ runtime frame (e.g. Builtin:ReflectDeleteProperty or pc == 0):
  # WHY record UM for Builtin:* and NONE (excluding normal Transition/InitialMap/ReplaceDescriptors):
  #   Catches Reflect.deleteProperty(o, "y") and Object.setPrototypeOf() so diff mode fails
  #   closed to NO-VERDICT instead of silently returning SAME.
  if (!h || cf[h] == "") {
    ow = (h ? ctag[h] : "NONE")
    if ((ow == "NONE" || substr(ow, 1, 8) == "Builtin:") && (cls == "MAP_DEPRECATE" || cls == "MAP_NORMALIZE" || cls == "MAP_SLOW2FAST" || cls == "MAP_ELEM_DICT")) {
      if (reason != "" && nkey != "") det = reason ":" nkey
      else if (reason != "") det = reason
      else if (nkey != "") det = nkey
      else det = "-"
      UM_LIST[++NUM] = cls "\t" ow "\t" det
    }
    next
  }

  fn = cf[h]
  EXEC[fn] = 1
  if (cls == "") {
    tk = fn SUBSEP cp[h] SUBSEP $7 ":" $8 SUBSEP mtype SUBSEP nkey
    if (!(tk in TSEEN)) { TSEEN[tk] = 1; TCNT[fn]++ }
    if (inc_trans + 0 == 1) cls = "MAP_" toupper(mtype)
    else next
  }

  if (reason != "" && nkey != "") detail = reason ":" nkey
  else if (reason != "") detail = reason
  else if (nkey != "") detail = nkey
  else detail = "-"

  sk = fn SUBSEP cls SUBSEP cp[h] SUBSEP $7 ":" $8 SUBSEP detail
  if (!(sk in MCNT)) {
    MORD[++NM] = sk
    MFN[NM] = fn; MCLS[NM] = cls; MLOC[NM] = cb[h] ":" $7 ":" $8; MDET[NM] = detail
  }
  MCNT[sk]++
  next
}
$1 in EV { next }
{ failx("unknown event " safe($1)) }
END {
  for (i = 1; i <= NF_N; i++) {
    f = FNS[i]
    if (f in COMP) print "K " f
    if (f in EXEC) print "R " f
    if (f in TCNT) printf "T %s\t%d\n", f, TCNT[f]
  }
  for (i = 1; i <= NM; i++) {
    sk = MORD[i]
    printf "M %s\t%s\t%s\t%s\t%d\n", MFN[i], MCLS[i], MLOC[i], MDET[i], MCNT[sk]
  }
  for (i = 1; i <= NUM; i++) {
    print "UM " UM_LIST[i]
  }
  if (NX > 0) {
    printf "X %s at log line %d%s\n", XW, XL, (NX > 1 ? " (+" (NX - 1) " more X line(s))" : "")
  }
}
'

# =============================================================================================
# PARSER 2: SHAPE_STDOUT_AWK (single-pass POSIX awk over regular-file stdout trace)
# =============================================================================================
# Input:  -v fns="fn1,fn2"   (file = run.<k>.out, regular file, NEVER a pipe!)
# Output:
#   E <fn><TAB>ELEM<TAB><base:line><TAB><FROM -> TO><TAB><hits>
#   E <fn><TAB>GEN<TAB><base:line><TAB><norm_detail><TAB><hits>
#   I <fn><TAB><boilerplate_init_sites>
#     - REPORTED count of monomorphic object-literal initializations (`:v{None;...}->`).
#     - WHY exclude `:v{None;...}->` from instability `E`:
#       Empirically proven in `probes/clean-and-literal.mjs`: a completely monomorphic
#       `{ a: i, b: 2 }` emits `a:v{None;const}->s{Any;const}` once on first creation as V8
#       populates the uninitialized literal boilerplate slot. That is normal one-time setup,
#       NOT shape instability (and it still proves `fn` executed via `I <fn>`!).
#     - WHY check `:v{None;...}->` instead of `(uninitialized field)`:
#       Empirically proven in `probes/unstable-all.mjs`: V8 14.6 prints `(uninitialized field)`
#       on real `x:d{Any;const}->d{Any;mutable}` and `y:h{Class(...);const}->t{Any;mutable}`
#       generalizations too! Checking `v{None;` specifically targets only uninitialized slots.
#   UE <ELEM|GEN><TAB><builtin_or_empty><TAB><norm_detail>
#     - Unattributed (<unknown>:<unknown> or []) stdout instability line (e.g. `splice+0`).
#       Used for the fail-closed unattributed delta guard in diff mode!
#   X <why> at out line <n> [(+<m> more X line(s))]
# shellcheck disable=SC2016
SHAPE_STDOUT_AWK='
function failx(why) { if (!NX++) { XW = why; XL = NR } }
function strip_frame(fr,   s) {
  if (fr !~ /\+[0-9]+$/) return ""
  s = fr
  sub(/\+[0-9]+$/, "", s)
  sub(/^new /, "", s)
  sub(/^o/, "", s)
  sub(/^[~^+*]/, "", s)
  sub(/^\047/, "", s)
  return s
}
function norm_gen(p) {
  # Normalize per-run heap pointers in Class(0x...) and {symbol 0x...} (both observed on node v26.8.2)
  gsub(/Class\(0x[0-9a-fA-F]+\)/, "Class(0xADDR)", p)
  gsub(/\{symbol 0x[0-9a-fA-F]+\}/, "{symbol 0xADDR}", p)
  return p
}
function is_target(fn,   i) {
  for (i = 1; i <= NF_N; i++) if (FNS[i] == fn) return 1
  return 0
}
function loc_base(loc,   r) {
  r = loc
  sub(/.*\//, "", r)
  return r
}
function record_e(fn, kind, full_loc, detail,   sk) {
  sk = fn SUBSEP kind SUBSEP full_loc SUBSEP detail
  if (!(sk in ECNT)) {
    EORD[++NE] = sk
    EFN[NE] = fn; EKIND[NE] = kind; ELOC[NE] = loc_base(full_loc); EDET[NE] = detail
  }
  ECNT[sk]++
}
BEGIN {
  NF_N = split(fns, FNS, ",")
  NX = 0; NE = 0; NUE = 0
}
{ sub(/\r$/, "") }
/^elements transition / {
  if (index($0, "\t") > 0) { failx("elements transition line contains TAB"); next }
  line = $0
  lb = index(line, "[")
  rb = index(line, "] in ")
  if (lb != 21 || rb <= lb) { failx("malformed elements transition header"); next }
  kinds = substr(line, lb + 1, rb - lb - 1)
  if (kinds !~ /^[A-Z0-9_]+ -> [A-Z0-9_]+$/) { failx("malformed elements transition kinds"); next }

  rest = substr(line, rb + 5)
  forp = index(rest, " for 0x")
  if (forp <= 1) { failx("malformed elements transition (missing for 0x)"); next }
  fr_loc = substr(rest, 1, forp - 1)

  atp = index(fr_loc, " at ")
  if (atp <= 1) { failx("malformed elements transition (missing at)"); next }
  fr = substr(fr_loc, 1, atp - 1)
  loc = substr(fr_loc, atp + 4)

  if (loc == "<unknown>:<unknown>" || loc == "<unknown>") {
    bfr = strip_frame(fr)
    if (bfr == "") bfr = fr
    UE_LIST[++NUE] = "ELEM\t" bfr "\t" kinds
    next
  }
  if (substr(loc, 1, 1) != "/" && substr(loc, 1, 8) != "file:///") next
  if (loc !~ /:[0-9]+$/) { failx("malformed elements transition loc"); next }

  fn = strip_frame(fr)
  if (fn == "") { failx("malformed elements transition frame"); next }
  if (is_target(fn)) record_e(fn, "ELEM", loc, kinds)
  next
}
/^\[generalizing\]/ {
  if (index($0, "\t") > 0) { failx("generalizing line contains TAB"); next }
  line = $0
  if (substr(line, length(line), 1) != "]") { failx("malformed generalizing line (no trailing ])"); next }
  pos = 0
  for (i = length(line) - 1; i >= 15; i--) {
    if (substr(line, i, 2) == " [") { pos = i; break }
  }
  if (pos == 0) { failx("malformed generalizing line (missing frame bracket)"); next }
  payload = substr(line, 15, pos - 15)
  sub(/^ +/, "", payload)
  bracket = substr(line, pos + 2, length(line) - pos - 2)
  if (payload == "") { failx("malformed generalizing line (empty payload)"); next }

  npayload = norm_gen(payload)
  is_vnone = (npayload ~ /:v\{None;[^}]*\}->/)

  if (bracket == "") {
    if (!is_vnone) UE_LIST[++NUE] = "GEN\t<runtime>\t" npayload
    next
  }
  atp = index(bracket, " at ")
  if (atp <= 1) { failx("malformed generalizing frame (missing at)"); next }
  fr = substr(bracket, 1, atp - 1)
  loc = substr(bracket, atp + 4)

  if (loc == "<unknown>:<unknown>" || loc == "<unknown>") {
    if (!is_vnone) {
      bfr = strip_frame(fr)
      if (bfr == "") bfr = fr
      UE_LIST[++NUE] = "GEN\t" bfr "\t" npayload
    }
    next
  }
  if (substr(loc, 1, 1) != "/" && substr(loc, 1, 8) != "file:///") next
  if (loc !~ /:[0-9]+$/) { failx("malformed generalizing loc"); next }

  fn = strip_frame(fr)
  if (fn == "") { failx("malformed generalizing frame"); next }

  if (is_target(fn)) {
    if (is_vnone) {
      ik = fn SUBSEP loc SUBSEP npayload
      if (!(ik in ISEEN)) { ISEEN[ik] = 1; ICNT[fn]++ }
    } else {
      record_e(fn, "GEN", loc, npayload)
    }
  }
  next
}
END {
  for (i = 1; i <= NF_N; i++) {
    f = FNS[i]
    if (f in ICNT) printf "I %s\t%d\n", f, ICNT[f]
  }
  for (i = 1; i <= NE; i++) {
    sk = EORD[i]
    printf "E %s\t%s\t%s\t%s\t%d\n", EFN[i], EKIND[i], ELOC[i], EDET[i], ECNT[sk]
  }
  for (i = 1; i <= NUE; i++) {
    print "UE " UE_LIST[i]
  }
  if (NX > 0) {
    printf "X %s at out line %d%s\n", XW, XL, (NX > 1 ? " (+" (NX - 1) " more X line(s))" : "")
  }
}
'

# =============================================================================================
# RECORD EXTRACTORS & VERDICT JUDGE
# =============================================================================================
s_ms() { # combined_recs fn (null control: keeps loc)
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pm = "M " fn "\t"; pe = "E " fn "\t" }
    substr($0, 1, length(pm)) == pm { print "*\t" $2 "\t" $3 "\t" $4 }
    substr($0, 1, length(pe)) == pe { print "*\t" $2 "\t" $3 "\t" $4 }
  ' | multiset
}

v_ms() { # combined_recs fn (cross-side diff: strips loc)
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pm = "M " fn "\t"; pe = "E " fn "\t" }
    substr($0, 1, length(pm)) == pm { print "*\t" fn "\t" $2 "\t" $4 }
    substr($0, 1, length(pe)) == pe { print "*\t" fn "\t" $2 "\t" $4 }
  ' | multiset
}

# Whole-process unattributed builtin instability multiset (UM + UE)
u_ms() { # combined_recs
  printf '%s\n' "$1" | awk '
    /^UM / { print "*\tUNATTR\t" substr($0, 4) }
    /^UE / { print "*\tUNATTR\t" substr($0, 4) }
  ' | multiset
}

# Execution guard check -> "<compiled_flag> <executed_flag>"
# WHY: compiled (K) alone is NOT execution proof; executed requires R (opt compile or map event)
# OR any attributed E (ELEM/GEN) or I (v{None} literal init) event.
exec_state() { # combined_recs fn
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; wk = "K " fn; wr = "R " fn; pe = "E " fn "\t"; pi = "I " fn "\t"; c = 0; e = 0 }
    $0 == wk { c = 1 }
    $0 == wr { e = 1 }
    substr($0, 1, length(pe)) == pe { e = 1 }
    substr($0, 1, length(pi)) == pi { e = 1 }
    END { print c, e }
  '
}

count_instab() { # combined_recs fn
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pm = "M " fn "\t"; pe = "E " fn "\t" }
    substr($0, 1, length(pm)) == pm || substr($0, 1, length(pe)) == pe { n++ }
    END { print n + 0 }
  '
}

reported_fn_meta() { # combined_recs fn -> "<normal_trans> <lit_vnone_inits>"
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pt = "T " fn "\t"; pi = "I " fn "\t"; tr = 0; li = 0 }
    substr($0, 1, length(pt)) == pt { tr = $2 + 0 }
    substr($0, 1, length(pi)) == pi { li = $2 + 0 }
    END { print tr, li }
  '
}

judge_side() { # fn: sets JV (OK|NO-VERDICT) and JWHY from JRC[], JLOG[], JREC[]
  local fn="$1" n i x first nk dl st comp ran
  JV=NO-VERDICT; JWHY=""
  n=${#JRC[@]}
  for ((i = 0; i < n; i++)); do
    if [[ "${JRC[$i]}" != 0 ]]; then JWHY="driver exited ${JRC[$i]} in run $((i + 1))"; return 0; fi
    if [[ -n "${JLOG[$i]}" ]]; then JWHY="${JLOG[$i]} in run $((i + 1))"; return 0; fi
  done
  for ((i = 0; i < n; i++)); do
    x=$(printf '%s\n' "${JREC[$i]}" | awk '/^X / && !n++ { print substr($0, 3) }')
    if [[ -n "$x" ]]; then JWHY="unreadable shape trace in run $((i + 1)): $x"; return 0; fi
  done
  first=$(s_ms "${JREC[0]}" "$fn")
  for ((i = 1; i < n; i++)); do
    nk=$(s_ms "${JREC[$i]}" "$fn")
    if [[ "$nk" != "$first" ]]; then
      dl=$(awk "$MSDIFF_AWK" <(printf '%s\n' "$first") <(printf '%s\n' "$nk") | sort -k3 \
        | awk -v k="$((i + 1))" '{ n++; if (n == 1) { l = $0; sub(/^  before=[0-9]+ after=[0-9]+  /, "", l); a = $1; b = $2
            sub(/^before=/, "", a); sub(/^after=/, "", b); f = "run 1 x" a " | run " k " x" b "  " l } }
          END { printf "%d record(s) differ, first: %s", n, f }')
      JWHY="null control: run $((i + 1)) differs from run 1 ($dl)"; return 0
    fi
  done
  st=$(exec_state "${JREC[0]}" "$fn")
  comp=${st%% *}; ran=${st#* }
  if [[ "$ran" != 1 ]]; then
    if [[ "$comp" == 1 ]]; then
      JWHY="compiled (~ or ^) only with 0 attributed map/shape events and 0 optimizing compiles for '$fn' in run 1 (cannot distinguish compiled-but-uncalled from cold non-object execution)"
    else
      JWHY="no execution evidence for '$fn' in run 1 (no such name or never called)"
    fi
    return 0
  fi
  JV=OK
}

# Check null control on unattributed builtin instability for one side -> "" if stable, else reason
unattr_nullctl() { # uses JREC[]
  local n=${#JREC[@]} i first nk
  first=$(u_ms "${JREC[0]}")
  for ((i = 1; i < n; i++)); do
    nk=$(u_ms "${JREC[$i]}")
    if [[ "$nk" != "$first" ]]; then
      echo "unattributed builtin instability varied between run 1 and run $((i + 1))"
      return 0
    fi
  done
  echo ""
}

# =============================================================================================
# SINGLE TRACE RUNNER
# =============================================================================================
TRACE_FLAGS=(
  --log-maps
  --trace-elements-transitions
  --trace-generalization
  --no-concurrent-recompilation
  --no-concurrent-sparkplug
  --no-node-snapshot
)
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)

RUN_RC=0; RUN_LOG=""; RUN_REC=""
run_side() { # side dir base k
  local rd="$RUNROOT/$1" lf outf n rc=0 ar1=0 ar2=0 rd_esc rec1="" rec2=""
  local -a LF
  outf="$rd/run.$4.out"
  rd_esc=${rd//%/%%}
  # Regular file redirection (`>"$outf" 2>&1`), NEVER a pipe!
  ( cd "$2" && exec "${PROBE_ENV[@]}" "$NODE_RES" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "--logfile=$rd_esc/run.log" "./$3" ) \
    >"$outf" 2>&1 <&0 &
  drv_wait; rc=$DRV_RC
  RUN_RC=$rc; RUN_LOG=""; RUN_REC=""
  shopt -s nullglob; LF=("$rd"/isolate-0x*-*-run.log); shopt -u nullglob
  if [[ ${#LF[@]} -eq 0 ]]; then RUN_LOG="no map log (no isolate-0x*-*-run.log written)"; return 0; fi
  if [[ ${#LF[@]} -gt 1 ]]; then RUN_LOG="another isolate or process logged (${#LF[@]} isolate-0x*-*-run.log files)"; return 0; fi
  lf="$rd/run.$4.log"
  mv -f "${LF[0]}" "$lf" || die "cannot rename ${LF[0]} to $lf"
  n=$(grep -a -c '^v8-version,' "$lf" || true)
  if [[ "$n" != 1 ]]; then RUN_LOG="the map log holds $n v8-version line(s), want 1"; return 0; fi
  if ! tr -d '\000' <"$lf" | cmp -s - "$lf"; then RUN_LOG="a NUL byte in the map log"; return 0; fi
  if [[ "$(tail -c 1 "$lf"; printf x)" != $'\nx' ]]; then RUN_LOG="the map log has no final newline"; return 0; fi
  if ! tr -d '\000' <"$outf" | cmp -s - "$outf"; then RUN_LOG="a NUL byte in stdout trace"; return 0; fi

  rec1=$(awk -v fns="$FNLIST" -v inc_trans="$INC_TRANS" "$MAP_AWK" "$lf") || ar1=$?
  if [[ $ar1 != 0 ]]; then RUN_LOG="MAP_AWK exited $ar1"; return 0; fi
  rec2=$(awk -v fns="$FNLIST" "$SHAPE_STDOUT_AWK" "$outf") || ar2=$?
  if [[ $ar2 != 0 ]]; then RUN_LOG="SHAPE_STDOUT_AWK exited $ar2"; return 0; fi
  RUN_REC="$rec1"$'\n'"$rec2"
}

# =============================================================================================
# --self-test: canned traces through MAP_AWK + SHAPE_STDOUT_AWK + judge + v8fl_ok allowlist
# =============================================================================================
self_test() {
  local oks=0 fails=0 H L1 L2 L3 L4 OUT1 OUT2
  local -a JRC JLOG JREC
  local JV="" JWHY=""
  check() {
    if [[ "$2" == "$3" ]]; then oks=$((oks + 1)); echo "ok $1"
    else fails=$((fails + 1)); echo "FAIL $1: got [$2] want [$3]"
    fi
  }
  mrec() { printf '%s\n' "$2" | awk -v fns="$1" -v inc_trans="${3:-0}" "$MAP_AWK" | tr '\t\n' '|;'; }
  srec() { printf '%s\n' "$2" | awk -v fns="$1" "$SHAPE_STDOUT_AWK" | tr '\t\n' '|;'; }

  IFS= read -r -d '' H <<'EOF' || true
v8-version,14,6,202,34,-node.28,0
v8-platform,macos,macos
code-creation,Builtin,3,100,0x100000000,512,ReflectDeleteProperty
code-creation,JS,10,200,0x200000000,64,clean file:///w/d.mjs:1:1,0x300000001,~
code-creation,JS,10,210,0x200000500,64,uncalled file:///w/d.mjs:5:1,0x300000005,~
code-creation,JS,11,215,0x200000600,88,uncalled file:///w/d.mjs:5:1,0x300000005,^
code-creation,JS,13,300,0x200001000,256,optDel file:///w/d.mjs:10:1,0x300000002,*
code-creation,JS,10,400,0x200002000,64,dictArr file:///w/d.mjs:20:1,0x300000003,~
EOF
  H=${H%$'\n'}

  # Test 1: clean fn with map Transition has K+R+T, 0 instability; uncalled (~ and ^ only) has K ONLY (no R!)
  L1="$H"$'\n''map,Transition,220,0x101,0x102,0x200000010,2,5,,x'
  check "MAP_AWK: clean mono fn -> K+R+T; compiled-but-uncalled (~ and ^) -> K only (no R)" \
    "$(mrec 'clean,uncalled' "$L1")" "K clean;R clean;T clean|1;K uncalled;"

  # Test 2: TurboFan pc allowed + Normalize/NormalizeCached collapse; ReflectDeleteProperty goes to UM
  L2="$H"$'\n''map,Normalize,310,0x201,0x202,0x200001040,12,3,DeletingProperty,'
  L2="$L2"$'\n''map,NormalizeCached,320,0x201,0x202,0x200001040,12,3,DeletingProperty,'
  L2="$L2"$'\n''map,NormalizeCached,330,0x201,0x202,0x100000040,0,-1,DeletingProperty,'
  check "MAP_AWK: TurboFan pc allowed + Normalize collapse + Builtin:ReflectDeleteProperty -> UM" \
    "$(mrec optDel "$L2")" \
    "K optDel;R optDel;M optDel|MAP_NORMALIZE|d.mjs:12:3|DeletingProperty|2;UM MAP_NORMALIZE|Builtin:ReflectDeleteProperty|DeletingProperty;"

  # Test 3: HOLEY -> DICTIONARY_ELEMENTS detected via map-details; benign Symbol() stays normal T
  L3="$H"
  L3="$L3"$'\n''map-details,405,0x301,type: JS_ARRAY_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  L3="$L3"$'\n''map-details,406,0x302,type: JS_ARRAY_TYPE\n - elements kind: DICTIONARY_ELEMENTS\n'
  L3="$L3"$'\n''map,Transition,410,0x301,0x302,0x200002010,22,7,,symbol(hash 28443365)'
  L4="$H"
  L4="$L4"$'\n''map-details,405,0x401,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  L4="$L4"$'\n''map-details,406,0x402,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  L4="$L4"$'\n''map,Transition,410,0x401,0x402,0x200002010,22,7,,symbol(hash 31e214e3)'
  check "MAP_AWK: HOLEY->DICTIONARY_ELEMENTS -> MAP_ELEM_DICT; benign Symbol() -> normal T" \
    "$(mrec dictArr "$L3")#$(mrec dictArr "$L4")" \
    "K dictArr;R dictArr;M dictArr|MAP_ELEM_DICT|d.mjs:22:7|HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS|1;#K dictArr;R dictArr;T dictArr|1;"

  # Test 4: SHAPE_STDOUT_AWK -- {a: i, b: 2} v{None} excluded to I (NOT E!); real d->d;mutable kept;
  # Class(0xADDR) + {symbol 0xADDR} normalized; splice -> UE
  IFS= read -r -d '' OUT1 <<'EOF' || true
[generalizing]a:v{None;const}->s{Any;const} (uninitialized field) [~makeLit+19 at file:///w/s.mjs:4]
[generalizing]a:v{None;const}->s{Any;const} (field type generalization) [~makeLit+19 at file:///w/s.mjs:4]
[generalizing]x:d{Any;const}->d{Any;mutable} (uninitialized field) [~fieldGen+7 at file:///w/s.mjs:9]
[generalizing]child:h{Class(0x20f29521bc09);const}->h{Any;const} (field type generalization) [new ~Holder+2 at file:///w/s.mjs:18]
[generalizing]{symbol 0x3c473b527679}:h{Any;const}->h{Any;mutable} (field type generalization) [~fieldGen+15 at file:///w/s.mjs:10]
elements transition [PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS] in splice+0 at <unknown>:<unknown> for 0x1111 <JSArray[4]> from 0x2222 <FixedDoubleArray[22]> to 0x3333 <FixedArray[22]>
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+63 at file:///w/s.mjs:42 for 0x4444 <JSArray[3]> from 0x5555 <FixedArray[3]> to 0x6666 <FixedDoubleArray[3]>
EOF
  OUT1=${OUT1%$'\n'}
  check "SHAPE_STDOUT_AWK: v{None}->I (not E), real GEN kept, Class+{symbol} normalized, splice->UE" \
    "$(srec "makeLit,fieldGen,Holder,work" "$OUT1")" \
    "I makeLit|2;E fieldGen|GEN|s.mjs:9|x:d{Any;const}->d{Any;mutable} (uninitialized field)|1;E Holder|GEN|s.mjs:18|child:h{Class(0xADDR);const}->h{Any;const} (field type generalization)|1;E fieldGen|GEN|s.mjs:10|{symbol 0xADDR}:h{Any;const}->h{Any;mutable} (field type generalization)|1;E work|ELEM|s.mjs:42|PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS|1;UE ELEM|splice|PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS;"

  # Test 5: malformed stdout generalizing line -> X
  OUT2='[generalizing]broken line without bracket'
  check "SHAPE_STDOUT_AWK: malformed generalizing line -> X" \
    "$(srec Point "$OUT2")" "X malformed generalizing line (no trailing ]) at out line 1;"

  # Test 6: judge_side rejects compiled-but-uncalled (~ and ^ only!) as NO-VERDICT, passes clean
  local REC_MIX; REC_MIX=$(printf '%s\n' "$L1" | awk -v fns="clean,uncalled,typo" -v inc_trans=0 "$MAP_AWK")
  JRC=(0 0); JLOG=("" ""); JREC=("$REC_MIX" "$REC_MIX")
  judge_side clean
  check "guard: clean fn with R execution evidence -> OK" "$JV" "OK"
  judge_side uncalled
  check "guard: compiled-but-uncalled (~ and ^ only) -> NO-VERDICT" "$JV:${JWHY%%:*}" \
    "NO-VERDICT:compiled (~ or ^) only with 0 attributed map/shape events and 0 optimizing compiles for 'uncalled' in run 1 (cannot distinguish compiled-but-uncalled from cold non-object execution)"
  judge_side typo
  check "guard: missing fn -> NO-VERDICT" "$JV:$JWHY" \
    "NO-VERDICT:no execution evidence for 'typo' in run 1 (no such name or never called)"

  # Test 7: LEDGER law 4 v8fl_ok allowlist checks
  V8FL_TAB=$'\nmaglev bool\nno-lazy bool\nlazy bool\nmax-inlined-bytecode-size int\nsparkplug-filter string\nlog-maps bool\n'
  local ok1=0 ok2=0 b1=0 b2=0 b3=0 b4=0 b5=0
  v8fl_ok --no-maglev && ok1=1
  v8fl_ok --max-inlined-bytecode-size=100 && ok2=1
  v8fl_ok --eval || b1=1
  v8fl_ok --inspect || b2=1
  v8fl_ok --unknown-flag || b3=1
  v8fl_ok --sparkplug-filter=x || b4=1
  v8fl_ok --log-maps || b5=1
  check "v8fl_ok allowlist: valid flags accepted; node opts, unknown, string, log refused" \
    "$ok1$ok2$b1$b2$b3$b4$b5" "1111111"

  echo
  if [[ $fails -eq 0 ]]; then
    echo "self-test: $oks check(s) ok"
    FINAL=1; exit 0
  else
    echo "self-test: $fails check(s) FAILED ($oks ok)"
    FINAL=1; exit 1
  fi
}

# =============================================================================================
# CLI PARSING & VALIDATION
# =============================================================================================
usage() {
  cat >&2 <<'EOF'
shape-diff.prototype.sh -- BEFORE vs AFTER V8 shape / elements-kind / field-generalization diff

Usage:
  shape-diff.prototype.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER
  shape-diff.prototype.sh --self-test

Options:
  --fn LIST              comma-separated short function names (e.g. Point,work,makeLit)
  --include-transitions  also diff normal monomorphic Transition/InitialMap sites
  --runs N               runs per side, 2..20 (default: 3)
  --node BIN             node binary (default: $NODE or node)
  --v8-flags STR         extra V8 tuning flags (validated against `node --v8-options` allowlist)
  --out DIR              keep DIR/report.txt and DIR/raw/<side>/run.<k>.{log,out}
  --self-test            run canned checks on MAP_AWK, SHAPE_STDOUT_AWK, judge_side, v8fl_ok
  -h, --help             this text (exit 2)

Verdict:
  0 SAME        identical attributed shape-instability multisets AND identical unattributed
                builtin instability multisets (known V8 limit: CSA Array.prototype.push is
                silent in V8 14.6 -- see RESEARCH.md).
  1 DIFF        attributed shape-instability multiset differs for >= 1 target fn.
  2 NO-VERDICT  refusal, trace parse error, null-control failure, missing execution evidence,
                or unattributed builtin instability (e.g. Reflect.deleteProperty, splice)
                changed while attributed sites looked SAME.
EOF
  DIED=1; exit 2
}

FNLIST=""
INC_TRANS=0
RUNS=3
NODE_BIN="${NODE:-node}"
V8FLAGS=""
OUT=""
POS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --self-test) self_test ;;
    --include-transitions) INC_TRANS=1; shift ;;
    --fn) [[ $# -ge 2 ]] || die "--fn needs a value"; FNLIST="$2"; shift 2 ;;
    --runs) [[ $# -ge 2 ]] || die "--runs needs a value"; RUNS="$2"; shift 2 ;;
    --node) [[ $# -ge 2 ]] || die "--node needs a value"; NODE_BIN="$2"; shift 2 ;;
    --v8-flags) [[ $# -ge 2 ]] || die "--v8-flags needs a value"; V8FLAGS="$2"; shift 2 ;;
    --out) [[ $# -ge 2 ]] || die "--out needs a value"; OUT="$2"; shift 2 ;;
    --) shift; while [[ $# -gt 0 ]]; do POS+=("$1"); shift; done ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *) POS+=("$1"); shift ;;
  esac
done

RE_INT='^[0-9]+$'
[[ "$RUNS" =~ $RE_INT && "$RUNS" -ge 2 && "$RUNS" -le 20 ]] || die "--runs must be 2..20, got '$RUNS'"
[[ -n "$FNLIST" ]] || die "--fn LIST is required"

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
IFS=',' read -r -a TARGETS <<< "$FNLIST"
for fn in "${TARGETS[@]}"; do
  [[ "$fn" =~ $FN_RE ]] || die "invalid function name in --fn: '$fn'"
done

[[ ${#POS[@]} -eq 2 ]] || die "requires exactly 2 drivers (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]}"
[[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER_BEFORE not readable: ${POS[0]}"
[[ -f "${POS[1]}" && -r "${POS[1]}" ]] || die "DRIVER_AFTER not readable: ${POS[1]}"

# Early syntactic/conflict refusals BEFORE spawn; full allowlist runs via v8fl_check
V8_EXTRA=()
if [[ -n "$V8FLAGS" ]]; then
  # shellcheck disable=SC2206
  V8_EXTRA=($V8FLAGS)
  [[ ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
  for f in "${V8_EXTRA[@]}"; do
    [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
    g=${f//_/-}
    case "$g" in
      *stress-concurrent-inlining*|*concurrent-recompilation*|*concurrent-sparkplug*)
        die "--v8-flags must not set $f: conflicts with synchronous compilation flags" ;;
      --require*|--import*|--loader*|--experimental-loader*|--env-file*|--experimental-config-file*|--experimental-default-config-file*|--eval*|--print*)
        die "--v8-flags must not set $f: node preload/eval/print flag is refused" ;;
    esac
  done
fi

# --out validation BEFORE any spawn or write (mirrors src/ic-diff.sh)
if [[ -n "$OUT" ]]; then
  [[ "$OUT" != -* ]] || OUT="./$OUT"
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
    for inp in "${POS[@]}"; do
      [[ ! "$OUT/report.txt" -ef "$inp" ]] || die "--out: $OUT/report.txt is an input file of this run"
    done
  fi
  OUT_UP="$OUT/raw/before"
  while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw/{before,after} ($OUT_UP is not a writable directory)"
fi

NODE_RES=$NODE_BIN
if [[ "$NODE_RES" != */* ]]; then
  NODE_RES=$(command -v -- "$NODE_RES" 2>/dev/null) || die "node binary not found: $NODE_BIN"
fi
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH: $NODE_BIN -> $NODE_RES"
[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not executable: $NODE_RES"
NODE_DIR=$(cd -- "$(dirname -- "$NODE_RES")" && pwd)
NODE_RES="${NODE_DIR%/}/$(basename -- "$NODE_RES")"

GOT_VER=$("${PROBE_ENV[@]}" "$NODE_RES" --version 2>/dev/null) || die "cannot run $NODE_RES --version"
v8fl_check "$NODE_RES"

if [[ -n "$OUT" ]]; then
  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" || die "--out: cannot create $OUT/raw/{before,after}"
  OUT=$(cd -- "$OUT" && pwd)
  REPORT="$OUT/report.txt"
  { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"
  RUNROOT="$OUT/raw"
else
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/shape-diff.XXXXXX") || die "cannot create temp dir"
  TMP_DIR=$(cd -- "$TMP_DIR" && pwd)
  mkdir "$TMP_DIR/before" "$TMP_DIR/after"
  RUNROOT="$TMP_DIR"
fi

DRV_B_DIR=$(cd -- "$(dirname -- "${POS[0]}")" && pwd); DRV_B_BASE=$(basename -- "${POS[0]}")
DRV_A_DIR=$(cd -- "$(dirname -- "${POS[1]}")" && pwd); DRV_A_BASE=$(basename -- "${POS[1]}")

say "shape-diff (prototype)  node $GOT_VER  $NODE_RES  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
say "mode    diff  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
say "before  ${DRV_B_DIR%/}/$DRV_B_BASE"
say "after   ${DRV_A_DIR%/}/$DRV_A_BASE"
say ""

# =============================================================================================
# EXECUTION & VERDICT
# =============================================================================================
RCB=(); RCA=(); LGB=(); LGA=(); REB=(); REA=()
for k in $(seq 1 "$RUNS"); do
  run_side before "$DRV_B_DIR" "$DRV_B_BASE" "$k"; RCB+=("$RUN_RC"); LGB+=("$RUN_LOG"); REB+=("$RUN_REC")
  run_side after  "$DRV_A_DIR" "$DRV_A_BASE" "$k"; RCA+=("$RUN_RC"); LGA+=("$RUN_LOG"); REA+=("$RUN_REC")
done

# Pre-compute whole-process unattributed instability null control and delta (for fail-closed guard on SAME)
JREC=("${REB[@]}"); UNCTL_B=$(unattr_nullctl)
JREC=("${REA[@]}"); UNCTL_A=$(unattr_nullctl)
UMSB=$(u_ms "${REB[0]}")
UMSA=$(u_ms "${REA[0]}")
UNATTR_DIFF=""
if [[ -n "$UNCTL_B" ]]; then
  UNATTR_DIFF="before: $UNCTL_B"
elif [[ -n "$UNCTL_A" ]]; then
  UNATTR_DIFF="after: $UNCTL_A"
elif [[ "$UMSB" != "$UMSA" ]]; then
  UNATTR_DIFF=$(awk "$MSDIFF_AWK" <(printf '%s\n' "$UMSB") <(printf '%s\n' "$UMSA") | sort -k3)
fi

VERDICT=SAME
for fn in "${TARGETS[@]}"; do
  JRC=("${RCB[@]}"); JLOG=("${LGB[@]}"); JREC=("${REB[@]}"); judge_side "$fn"; VB=$JV; WB=$JWHY
  JRC=("${RCA[@]}"); JLOG=("${LGA[@]}"); JREC=("${REA[@]}"); judge_side "$fn"; VA=$JV; WA=$JWHY
  if [[ "$VB" == NO-VERDICT || "$VA" == NO-VERDICT ]]; then
    FV=NO-VERDICT
    [[ "$VB" != NO-VERDICT ]] || say "  $fn: NO-VERDICT -- before: $WB"
    [[ "$VA" != NO-VERDICT ]] || say "  $fn: NO-VERDICT -- after: $WA"
  else
    NB=$(count_instab "${REB[0]}" "$fn"); NA=$(count_instab "${REA[0]}" "$fn")
    MSB=$(v_ms "${REB[0]}" "$fn"); MSA=$(v_ms "${REA[0]}" "$fn")
    if [[ "$MSB" == "$MSA" ]]; then
      if [[ -n "$UNATTR_DIFF" ]]; then
        # WHY fail closed from SAME -> NO-VERDICT when unattributed builtin instability changed:
        #   Reflect.deleteProperty() and Array.prototype.splice() emit unattributed builtin
        #   instability lines. Returning SAME when those changed would be a false negative.
        FV=NO-VERDICT
        say "  $fn: NO-VERDICT -- attributed sites identical (before $NB | after $NA), but unattributed builtin shape instability differs:"
        while IFS= read -r l; do say "    $l"; done <<< "$UNATTR_DIFF"
      else
        FV=SAME
        say "  $fn: SAME -- identical shape-instability multiset (before $NB | after $NA site(s))"
      fi
    else
      FV=DIFF
      say "  $fn: DIFF -- shape-instability multiset differs (before $NB | after $NA site(s))"
      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$MSB") <(printf '%s\n' "$MSA") | sort -k3)
    fi
    MB=$(reported_fn_meta "${REB[0]}" "$fn"); MA=$(reported_fn_meta "${REA[0]}" "$fn")
    say "    REPORTED normal-transitions: before=${MB%% *} after=${MA%% *}  boilerplate-vNone-inits: before=${MB#* } after=${MA#* }"
  fi
  VERDICT=$(worst "$VERDICT" "$FV")
done

say ""
say "NOTE: CSA Array.prototype.push transitions are silent in V8 14.6 (0 lines in all 3 flags); see RESEARCH.md."
say ""
say "VERDICT $VERDICT"
FINAL=1
case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
