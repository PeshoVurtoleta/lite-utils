#!/usr/bin/env bash
# shape-diff.sh -- BEFORE vs AFTER V8 shape / elements-kind / field-generalization diff
#
# Usage:
#   shape-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER
#   shape-diff.sh --self-test
#   shape-diff.sh -h | --help
#
# Options:
#   --fn LIST              comma-separated short function names (supports --fn=LIST)
#   --include-transitions  also diff normal monomorphic Transition/InitialMap sites
#   --runs N               runs per side, 2..20 (default: 3)
#   --node BIN             node binary (default: $NODE or node); node >= 22: a --version that does not parse as
#                          v<major>.<minor>.<patch>, or a major below 22, exits 2 after the one --version spawn
#                          (before --v8-options and before any write)
#   --v8-flags STR         extra V8 tuning flags (validated against `node --v8-options` allowlist)
#   --out DIR              keep DIR/report.txt and DIR/raw/<side>/run.<k>.{log,out}
#   --self-test            canned + diff_fn + CLI + fake-node e2e checks, no real node (exit 0 / 1); takes no other argument
#   -h, --help             this text (exit 2)
#
# Verdict:
#   0 SAME        identical attributed shape-instability multisets AND identical unattributed /
#                 non-target instability multisets (known limit: a single cold call to
#                 Array.prototype.push(1.5) emits 0 trace lines on Node 22/24/26/27).
#   1 DIFF        attributed shape-instability multiset differs for >= 1 target fn.
#   2 NO-VERDICT  refusal, trace parse error, null-control failure, missing execution evidence,
#                 a target Transition whose from / to map has no map-details line (elements kind unknown),
#                 or unattributed/external instability (Reflect.deleteProperty, splice, non-target
#                 user helper, a node: or other non-file-path frame) changed while attributed sites looked SAME.

# Combines ALL THREE V8 shape streams in ONE run:
#   1. --log-maps --logfile=<abs>/run.log  (keeping map-details ON: separates
#        HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS from benign anonymous Symbol() transitions)
#   2. --trace-elements-transitions (regular-file stdout, NEVER a pipe)
#   3. --trace-generalization (regular-file stdout, NEVER a pipe)
#
# Key design decisions backed by 4-Node empirical probes (Node 22.23.5 / 24.22.3 / 26.8.2 / 27):
#   - WHY `--no-sparkplug` in TRACE_FLAGS (fixes RECHECK N3 Node 22 exit 133 SIGTRAP crash):
#       On Node 22 (V8 12.4), `--trace-generalization` inside a Sparkplug (CodeKind::BASELINE)
#       frame hits a fatal C++ assertion `Check failed: kind(isolate) != CodeKind::BASELINE`
#       in `AbstractCode::SourceStatementPosition` (`[^wrapConsole+121` under `--no-node-snapshot`).
#       Passing `--no-sparkplug` eliminates the crash (rc 0) while KEEPING `--no-node-snapshot`
#       so unresolved non-zero map pcs drop to 0 across ALL FOUR Node majors (22/24/26/27)!
#   - WHY drop no-op GEN lines AND fold dual reason-pairs (fixes RECHECK N4 + D6, Q-SD-GEN-INIT (a)):
#       Node 22 (V8 12.4) and Node 24 (V8 13.6) emit repeated no-op boilerplate checks
#       `a:s{Any;const}->s{Any;const} (uninitialized field)` where FROM == TO; and all 4 majors
#       print TWO lines per single in-place generalization (`(uninitialized field)` +
#       `(field type generalization)`). FROM / TO are parsed anchored at the line end (D-B): a
#       no-op is FROM starting `v{None;` or FROM == TO; a line that does not parse is never a no-op.
#   - WHY track non-target user JS + Builtin + NONE instability in UM/UE (fixes RECHECK N1 + D1):
#       `Reflect.deleteProperty` (Builtin:ReflectDeleteProperty), `splice` (<unknown>), and
#       non-inlined user helpers (`function del(o){ delete o.a; }`) all sit outside `--fn`.
#       Upgrading `SAME -> NO-VERDICT` whenever the whole-process unattributed/external
#       instability multiset differs prevents false `VERDICT SAME` at any call count. Stdout
#       frames outside file paths go to UE as node:<fn> / other:<fn> (D-A, Q-SD-OWNER (a)).
#   - WHY NO `--stable` gate: a single cold call to `a.push(1.5)` transitions PACKED_SMI ->
#       PACKED_DOUBLE with 0 lines across all 3 flags on Node 22/24/26/27 (200 calls emit 2 lines).

unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: once, before any spawn; no probe, allowlist read or trace run inherits them (the per-spawn strips stay)
unset CDPATH   # before the prologue: SELF, every cd and every "cd X && pwd" join resolve X itself, never a CDPATH entry
# @include lib/prologue.sh
TMP_DIR=""

# @include lib/msdiff.sh

# @include lib/common.sh
# @include lib/tracked.sh
# @include lib/v8flags.sh

# =============================================================================================
# PARSER 1: MAP_AWK (single-pass POSIX awk over --log-maps CSV with map-details ON)
# =============================================================================================
# Input:  -v fns="fn1,fn2"  -v inc_trans=0|1
# Output:
#   K <fn>                 fn compiled (~ or ^); NOT execution proof alone.
#   R <fn>                 fn has execution evidence (+/* optimizing compile OR >=1 attributed map event).
#   M <fn><TAB><class><TAB><base:line:col><TAB><detail><TAB><hits>
#   T <fn><TAB><count>     REPORTED normal monomorphic Transition/InitialMap site count.
#   N <fn>                 fn owns a Transition whose from or to map has no map-details line (elements
#                          kind unknown, Q-B103-SD-D5 (a)): judge_side reads NO-VERDICT for fn.
#   UM <class><TAB><owner><TAB><detail>
#     - Non-target instability event from ANY non-target owner (NONE, Builtin:*, user:<fn>,
#       or node:<fn>). WHY include non-target user JS and node:* (Q-SD-OWNER (a), fixes RECHECK N1):
#       When target `mk` calls non-target `function del(o){ delete o.a; }`, at 200 calls `del` is
#       not inlined so `pc` resolves to `user:del` (at 20000 calls `del` inlines into `mk`).
#       Recording `user:del` in UM turns false `SAME` into `NO-VERDICT` at 200 calls!
#     - WHY owner tag uses `user:<fn>` (or `user:<anon>` for top-level Script, NEVER full path):
#       An A/A comparison of two byte-identical drivers with different filenames (`a.mjs` vs
#       `a-copy.mjs`) keeps identical `UM` tags and still reads `SAME`.
#     - A non-target Transition whose from or to map has no map-details line is
#       `UM MAP_EK_UNKNOWN<TAB><owner><TAB>-` (no address in the key; Q-B103-SD-D5 (a)).
#   X <why> at log line <n> [(+<m> more X line(s))]
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
function js_owner_tag(ty, nm,   p, fn_part, loc_part) {
  if (ty == "Script") return "user:<script>"
  if (ty == "Eval") return "user:<eval>"
  # Split `<fn> <loc>` where <loc> starts with file:///, /, or node:
  if (match(nm, / (file:\/\/\/|\/|node:)/)) {
    fn_part = substr(nm, 1, RSTART - 1)
    loc_part = substr(nm, RSTART + 1)
    if (substr(loc_part, 1, 5) == "node:") return "node:" (fn_part != "" ? fn_part : "<anon>")
    return "user:" (fn_part != "" ? fn_part : "<anon>")
  }
  return "user:<anon>"
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

  split("v8-version v8-platform new delete heap-available heap-capacity script-source code-source-info sfi-move code-deopt map-create code-disable-optimization", t, " ")
  for (i in t) EV[t[i]] = 1

  split("Builtin BytecodeHandler RegExp Stub Handler Wasm", t, " ")
  for (i in t) NONJS[t[i]] = 1

  split("JS Eval Script", t, " ")
  for (i in t) JSTY[t[i]] = 1

  mk["~"] = 1; mk["^"] = 1
  mk[""] = 1   # V8 logs no marker for Liftoff wasm code and for an interpreted function whose optimization is disabled; never an optimizing marker
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
  if (NF != 9 || $5 !~ /^0x[0-9a-fA-F]+$/ || length($5) > 15 || $6 !~ /^[0-9]+$/ || !($9 in mk) || ($9 == "" && $8 !~ /^0x[0-9a-fA-F]+$/)) {
    failx("JS code-creation does not parse (" safe($2) ")")
    next
  }
  BASE = ""; SCR = ""
  f = ($2 == "JS" ? owner($7) : "")
  if (f != "") {
    COMP[f] = 1
    if ($9 in opt_mk) EXEC[f] = 1
    floc = substr($7, length(f) + 2)
    if (!(f in FDEF)) FDEF[f] = floc
    else if (FDEF[f] != floc) AMBIG[f] = 1
  }
  add_code(hex($5), $6 + 0, f, BASE, SCR, js_owner_tag($2, $7))
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
  # Q-B103-SD-D5 (a): a Transition whose from or to map has no map-details line: its elements kind is unknown (an
  # elements change would hide as a normal T). Additive: the target keeps its T / MAP_TRANSITION record and gains N.
  ekx = (mtype == "Transition" && (!($4 in map_ek) || !($5 in map_ek)))

  # Any non-target instability (NONE, Builtin:*, non-target user:<fn>, or node:<fn>) -> UM (Q-SD-OWNER (a))
  if (!h || cf[h] == "") {
    if (ekx) {
      UM_LIST[++NUM] = "MAP_EK_UNKNOWN\t" (h ? ctag[h] : "NONE") "\t-"
    } else if (cls == "MAP_DEPRECATE" || cls == "MAP_NORMALIZE" || cls == "MAP_SLOW2FAST" || cls == "MAP_ELEM_DICT" || cls == "MAP_REPLACE") {
      ow = (h ? ctag[h] : "NONE")
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
  if (ekx) NEK[fn] = 1
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
    if (f in NEK) print "N " f
    if (f in AMBIG) print "A " f
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
# Fixes RECHECK N4 (Node 22/24 no-op LHS == RHS GEN), D6 (fold dual reason-pair), N1 (non-target
# user JS ELEM/GEN tracked in UE so unattributed/external delta guard prevents false SAME).
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
  gsub(/Class\(0x[0-9a-fA-F]+\)/, "Class(0xADDR)", p)
  gsub(/\{symbol 0x[0-9a-fA-F]+\}/, "{symbol 0xADDR}", p)
  # Fold V8 dual reason-pair into one canonical core record (Q-SD-GEN-INIT (a), fixes D6):
  # preserves ` (+N maps)` deprecation counts while stripping redundant `(uninitialized field)`
  # and `(field type generalization)` suffixes printed on consecutive lines for 1 event.
  sub(/ \((uninitialized field|field type generalization)\)$/, "", p)
  return p
}
function is_noop_or_vnone(core,   m, from, to, pm) {
  # core shape: "<prop>:<FROM>-><TO>[ (+N maps)]". FROM / TO are parsed ANCHORED AT THE LINE END (D-B, Q-SD-GEN-INIT
  # (a)): V8 prints the property name raw, so a key such as `k:v{None;const}->` must never decide the test. No match
  # = never a no-op. A no-op is:
  # 1. the initial uninitialized literal boilerplate slot: FROM starts `v{None;` (Node 22/24/26/27)
  # 2. the Node 22 & Node 24 no-op boilerplate verification: FROM == TO (e.g. a:s{Any;const}->s{Any;const})
  if (!match(core, /:(c|[a-z]\{[^{}]*\})->[a-z]\{[^{}]*\}( \(\+[0-9]+ maps\))?$/)) return 0
  m = substr(core, RSTART + 1, RLENGTH - 1)
  pm = (m ~ / \(\+[0-9]+ maps\)$/)   # V8 built N new maps (MapUpdater::ConstructNewMap): a real change, even with FROM == TO
  sub(/ \(\+[0-9]+ maps\)$/, "", m)
  if (substr(m, 1, 3) == "c->") from = "c"
  else from = substr(m, 1, index(m, "}"))
  to = substr(m, length(from) + 3)
  if (substr(from, 1, 7) == "v{None;") return 1
  if (pm) return 0
  return (from == to)
}
function ext_owner(fr, loc,   b) {
  # a frame whose location is neither a file path nor <unknown> (D-A, Q-SD-OWNER (a)): node:<fn> for a node: location,
  # other:<fn> for every other one (evalmachine.<anonymous>, vm, data:); fn = the stripped frame, else the raw frame
  b = strip_frame(fr)
  if (b == "") b = fr
  return (substr(loc, 1, 5) == "node:" ? "node:" : "other:") b
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
function frame_pos(line, sep, lo,   i, n, c, a) {
  # the frame bracket of a trailing "...<sep>[<frame>]": the rightmost sep (lo = lowest start) whose bracket is empty or
  # whose text before the first " at " ends in +N; returns the index of the space before "[" (i + 1), 0 when none
  n = length(sep)
  for (i = length(line) - n; i >= lo; i--) {
    if (substr(line, i, n) != sep) continue
    c = substr(line, i + n, length(line) - i - n)
    if (c == "") return i + 1
    a = index(c, " at ")
    if (a > 1 && substr(c, 1, a - 1) ~ /\+[0-9]+$/) return i + 1
  }
  return 0
}
function is_opt(fr) { return (fr ~ /^(new )?o?[+*]/) }
function record_e(fn, kind, full_loc, detail, fr,   sk, ok, b) {
  # an optimized frame (marker + or *, with o / \047) prints offset 0 and line 1 of the script, not the site: its hits are
  # folded in END into the first interpreted site of the same fn / kind / detail; with none it is ONE site "<file>:opt"
  ok = fn SUBSEP kind SUBSEP detail
  if (is_opt(fr)) {
    if (!(ok in OCNT)) { OORD[++NO] = ok; OFN[NO] = fn; OKIND[NO] = kind; ODET[NO] = detail; b = loc_base(full_loc); sub(/:[0-9]+$/, ":opt", b); OLOC[NO] = b }
    OCNT[ok]++
    return
  }
  sk = fn SUBSEP kind SUBSEP full_loc SUBSEP detail
  if (!(sk in ECNT)) {
    EORD[++NE] = sk
    EFN[NE] = fn; EKIND[NE] = kind; ELOC[NE] = loc_base(full_loc); EDET[NE] = detail
    if (!(ok in EFIRST)) EFIRST[ok] = sk
  }
  ECNT[sk]++
}
BEGIN {
  NF_N = split(fns, FNS, ",")
  NX = 0; NE = 0; NUE = 0; NO = 0
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
  forp = 0
  for (i = length(rest) - 7; i >= 2; i--) {
    if (substr(rest, i, 7) == " for 0x" && substr(rest, i + 7) ~ /^[0-9a-fA-F]+ </) { forp = i; break }
  }
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
  if (substr(loc, 1, 1) != "/" && substr(loc, 1, 8) != "file:///") {
    UE_LIST[++NUE] = "ELEM\t" ext_owner(fr, loc) "\t" kinds
    next
  }
  if (loc !~ /:[0-9]+$/) { failx("malformed elements transition loc"); next }

  if (fr !~ /\+[0-9]+$/) { failx("malformed elements transition frame"); next }
  fn = strip_frame(fr)
  if (fn == "") fn = "<anon>"
  if (is_target(fn)) record_e(fn, "ELEM", loc, kinds, fr)
  else UE_LIST[++NUE] = "ELEM\tuser:" fn "\t" kinds
  next
}
/^\[generalizing\]/ {
  if (index($0, "\t") > 0) { failx("generalizing line contains TAB"); next }
  line = $0
  if (substr(line, length(line), 1) != "]") { failx("malformed generalizing line (no trailing ])"); next }
  pos = frame_pos(line, ") [", 15)
  if (pos == 0) for (i = length(line) - 1; i >= 15; i--) {
    if (substr(line, i, 2) == " [") { pos = i; break }
  }
  if (pos == 0) { failx("malformed generalizing line (missing frame bracket)"); next }
  payload = substr(line, 15, pos - 15)
  sub(/^ +/, "", payload)
  bracket = substr(line, pos + 2, length(line) - pos - 2)
  if (payload == "") { failx("malformed generalizing line (empty payload)"); next }

  core = norm_gen(payload)
  noop = is_noop_or_vnone(core)

  if (bracket == "") {
    if (!noop) UE_LIST[++NUE] = "GEN\t<runtime>\t" core
    next
  }
  atp = index(bracket, " at ")
  if (atp <= 1) { failx("malformed generalizing frame (missing at)"); next }
  fr = substr(bracket, 1, atp - 1)
  loc = substr(bracket, atp + 4)

  if (loc == "<unknown>:<unknown>" || loc == "<unknown>") {
    if (!noop) {
      bfr = strip_frame(fr)
      if (bfr == "") bfr = fr
      UE_LIST[++NUE] = "GEN\t" bfr "\t" core
    }
    next
  }
  if (substr(loc, 1, 1) != "/" && substr(loc, 1, 8) != "file:///") {
    if (!noop) UE_LIST[++NUE] = "GEN\t" ext_owner(fr, loc) "\t" core
    next
  }
  if (loc !~ /:[0-9]+$/) { failx("malformed generalizing loc"); next }

  if (fr !~ /\+[0-9]+$/) { failx("malformed generalizing frame"); next }
  fn = strip_frame(fr)
  if (fn == "") fn = "<anon>"

  if (is_target(fn)) {
    if (noop) {
      ik = fn SUBSEP loc SUBSEP core
      if (!(ik in ISEEN)) { ISEEN[ik] = 1; ICNT[fn]++ }
    } else {
      record_e(fn, "GEN", loc, core, fr)
    }
  } else if (!noop) {
    UE_LIST[++NUE] = "GEN\tuser:" fn "\t" core
  }
  next
}
/^\[reconfiguring\]/ {
  # "[reconfiguring]<name>: <kData|ACCESSORS>, attrs: [<attrs>] [<frame>]" (Map::PrintReconfiguration); the frame bracket
  # is found by the [generalizing] frame rule (frame_pos on "] ["), with no fallback: none = X
  if (index($0, "\t") > 0) { failx("reconfiguring line contains TAB"); next }
  line = $0
  if (substr(line, length(line), 1) != "]") { failx("malformed reconfiguring line (no trailing ])"); next }
  pos = frame_pos(line, "] [", 16)
  if (pos == 0) { failx("malformed reconfiguring line (missing frame bracket)"); next }
  core = substr(line, 16, pos - 16)
  gsub(/\{symbol 0x[0-9a-fA-F]+\}/, "{symbol 0xADDR}", core)
  if (core !~ /: (kData|ACCESSORS), attrs: \[[A-Z_]*\]$/) { failx("malformed reconfiguring line (payload)"); next }
  bracket = substr(line, pos + 2, length(line) - pos - 2)
  if (bracket == "") { UE_LIST[++NUE] = "RECONF\t<runtime>\t" core; next }
  atp = index(bracket, " at ")
  if (atp <= 1) { failx("malformed reconfiguring frame (missing at)"); next }
  fr = substr(bracket, 1, atp - 1)
  loc = substr(bracket, atp + 4)
  if (loc == "<unknown>:<unknown>" || loc == "<unknown>") {
    bfr = strip_frame(fr)
    if (bfr == "") bfr = fr
    UE_LIST[++NUE] = "RECONF\t" bfr "\t" core
    next
  }
  if (substr(loc, 1, 1) != "/" && substr(loc, 1, 8) != "file:///") { UE_LIST[++NUE] = "RECONF\t" ext_owner(fr, loc) "\t" core; next }
  if (loc !~ /:[0-9]+$/) { failx("malformed reconfiguring loc"); next }
  if (fr !~ /\+[0-9]+$/) { failx("malformed reconfiguring frame"); next }
  fn = strip_frame(fr)
  if (fn == "") fn = "<anon>"
  if (is_target(fn)) record_e(fn, "RECONF", loc, core, fr)
  else UE_LIST[++NUE] = "RECONF\tuser:" fn "\t" core
  next
}
END {
  for (i = 1; i <= NF_N; i++) {
    f = FNS[i]
    if (f in ICNT) printf "I %s\t%d\n", f, ICNT[f]
  }
  for (i = 1; i <= NO; i++) if (OORD[i] in EFIRST) ECNT[EFIRST[OORD[i]]] += OCNT[OORD[i]]
  for (i = 1; i <= NE; i++) {
    sk = EORD[i]
    printf "E %s\t%s\t%s\t%s\t%d\n", EFN[i], EKIND[i], ELOC[i], EDET[i], ECNT[sk]
  }
  for (i = 1; i <= NO; i++) if (!(OORD[i] in EFIRST)) printf "E %s\t%s\t%s\t%s\t%d\n", OFN[i], OKIND[i], OLOC[i], ODET[i], OCNT[OORD[i]]
  for (i = 1; i <= NO; i++) printf "O %s\t%s\t%s\n", OFN[i], OKIND[i], ODET[i]   # presence of an optimized-frame hit per key, not count
  for (i = 1; i <= NUE; i++) {
    print "UE " UE_LIST[i]
  }
  if (NX > 0) {
    printf "X %s at out line %d%s\n", XW, XL, (NX > 1 ? " (+" (NX - 1) " more X line(s))" : "")
  }
}
'

# =============================================================================================
# RECORD EXTRACTORS, JUDGE, AND DIFF_FN (space-formatted, 0 raw TABs, lib/nullctl.sh pattern)
# =============================================================================================
s_ms() { # combined_recs fn (null control: keeps loc; also the optimized-frame key set)
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pm = "M " fn "\t"; pe = "E " fn "\t"; po = "O " fn "\t" }
    substr($0, 1, length(pm)) == pm { printf "*\t%s  %s  %s\n", $2, $3, $4 }
    substr($0, 1, length(pe)) == pe { printf "*\t%s  %s  %s\n", $2, $3, $4 }
    substr($0, 1, length(po)) == po { printf "*\t%s  optimized-frame  %s\n", $2, $3 }
  ' | multiset
}

o_ms() { # combined_recs fn (the SET of fn / kind / detail keys with optimized-frame hits)
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; po = "O " fn "\t" }
    substr($0, 1, length(po)) == po { printf "*\t%s  %s  %s  optimized-frame\n", fn, $2, $3 }
  ' | multiset
}

v_ms() { # combined_recs fn (cross-side diff: strips loc, 0 raw TABs in display key)
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pm = "M " fn "\t"; pe = "E " fn "\t" }
    substr($0, 1, length(pm)) == pm { printf "*\t%s  %s  %s\n", fn, $2, $4 }
    substr($0, 1, length(pe)) == pe { printf "*\t%s  %s  %s\n", fn, $2, $4 }
  ' | multiset
}

u_ms() { # combined_recs (whole-process unattributed / non-target instability multiset, 0 raw TABs)
  printf '%s\n' "$1" | awk '
    BEGIN { FS = "\t" }
    /^UM / { printf "*\tUNATTR  %s  %s  %s\n", substr($1, 4), $2, $3 }
    /^UE / { printf "*\tUNATTR  %s  %s  %s\n", substr($1, 4), $2, $3 }
  ' | multiset
}

exec_state() { # combined_recs fn -> "<compiled_flag> <executed_flag>"
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; wk = "K " fn; wr = "R " fn; pe = "E " fn "\t"; pi = "I " fn "\t"; c = 0; e = 0 }
    $0 == wk { c = 1 }
    $0 == wr { e = 1 }
    substr($0, 1, length(pe)) == pe { e = 1 }
    substr($0, 1, length(pi)) == pi { e = 1 }
    END { print c, e }
  '
}

count_instab() {
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pm = "M " fn "\t"; pe = "E " fn "\t" }
    substr($0, 1, length(pm)) == pm || substr($0, 1, length(pe)) == pe { n++ }
    END { print n + 0 }
  '
}

reported_fn_meta() {
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN { FS = "\t"; pt = "T " fn "\t"; pi = "I " fn "\t"; tr = 0; li = 0 }
    substr($0, 1, length(pt)) == pt { tr = $2 + 0 }
    substr($0, 1, length(pi)) == pi { li = $2 + 0 }
    END { print tr, li }
  '
}

# judge_side FN MSDIR SIDE: checks driver rc, log integrity, global X, lib/nullctl.sh file cmp -s,
# AND execution guard on EVERY run 1..N (fixes RECHECK D12 where guard checked run 1 only!).
judge_side() {
  local fn="$1" msdir="$2" side="$3" n i x f1 fk dl st comp ran safe_fn
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
  # Q-B103-SD-D5 (a): a Transition of fn whose from or to map has no map-details line (MAP_AWK's N record) hides its
  # elements kind: per run, pure bash (no spawn)
  for ((i = 0; i < n; i++)); do
    case $'\n'"${JREC[$i]}"$'\n' in
      *$'\n'"A $fn"$'\n'*) JWHY="ambiguous target function '$fn' defined at >1 location in run $((i + 1))"; return 0 ;;
      *$'\n'"N $fn"$'\n'*) JWHY="elements kind unknown for a Transition in '$fn' (no map-details line) in run $((i + 1))"; return 0 ;;
    esac
  done
  safe_fn=${fn// /_}
  f1="$msdir/$safe_fn.$side.1.txt"
  s_ms "${JREC[0]}" "$fn" >"$f1"
  for ((i = 1; i < n; i++)); do
    fk="$msdir/$safe_fn.$side.$((i + 1)).txt"
    s_ms "${JREC[$i]}" "$fn" >"$fk"
    if ! cmp -s "$f1" "$fk"; then
      dl=$(awk "$MSDIFF_AWK" "$f1" "$fk" | sort -k3 \
        | awk -v k="$((i + 1))" '{ n++; if (n == 1) { l = $0; sub(/^  before=[0-9]+ after=[0-9]+  /, "", l); a = $1; b = $2
            sub(/^before=/, "", a); sub(/^after=/, "", b); f = "run 1 x" a " | run " k " x" b "  " l } }
          END { printf "%d record(s) differ, first: %s", n, f }')
      JWHY="null control: run $((i + 1)) differs from run 1 ($dl)"; return 0
    fi
  done
  # D12 fix: verify execution evidence on EVERY run 1..N, not just run 1!
  for ((i = 0; i < n; i++)); do
    st=$(exec_state "${JREC[$i]}" "$fn")
    comp=${st%% *}; ran=${st#* }
    if [[ "$ran" != 1 ]]; then
      if [[ "$comp" == 1 ]]; then
        JWHY="compiled (~ or ^) only with 0 attributed map/shape events and 0 optimizing compiles for '$fn' in run $((i + 1)) (warm up more until optimizing compile, or function was never called)"
      else
        JWHY="no execution evidence for '$fn' in run $((i + 1)) (no such name or never called)"
      fi
      return 0
    fi
  done
  JV=OK
}

unattr_nullctl() { # msdir side (reads JREC[])
  local msdir="$1" side="$2" n=${#JREC[@]} i f1 fk
  f1="$msdir/_unattr.$side.1.txt"
  u_ms "${JREC[0]}" >"$f1"
  for ((i = 1; i < n; i++)); do
    fk="$msdir/_unattr.$side.$((i + 1)).txt"
    u_ms "${JREC[$i]}" >"$fk"
    if ! cmp -s "$f1" "$fk"; then
      echo "unattributed/external instability varied between run 1 and run $((i + 1))"
      return 0
    fi
  done
  echo ""
}

compute_unattr_diff() { # msdir (reads REB[], REA[]; sets UNATTR_DIFF)
  local msdir="$1" ucb uca
  JREC=("${REB[@]}"); ucb=$(unattr_nullctl "$msdir" before)
  JREC=("${REA[@]}"); uca=$(unattr_nullctl "$msdir" after)
  UNATTR_DIFF=""
  if [[ -n "$ucb" ]]; then
    UNATTR_DIFF="before: $ucb"
  elif [[ -n "$uca" ]]; then
    UNATTR_DIFF="after: $uca"
  else
    u_ms "${REB[0]}" >"$msdir/_unattr.b1.txt"
    u_ms "${REA[0]}" >"$msdir/_unattr.a1.txt"
    if ! cmp -s "$msdir/_unattr.b1.txt" "$msdir/_unattr.a1.txt"; then
      UNATTR_DIFF=$(awk "$MSDIFF_AWK" "$msdir/_unattr.b1.txt" "$msdir/_unattr.a1.txt" | sort -k3)
    fi
  fi
}

# diff_fn FN MSDIR: judges both sides, compares V multisets, enforces unattributed-delta guard
# on SAME (sets FV and folds into VERDICT). Extracted so --self-test tests it directly (N5 fix!).
diff_fn() {
  local fn="$1" msdir="$2" VB VA WB WA NB NA MSB MSA MB MA l OSB="" OSA=""
  JRC=("${RCB[@]}"); JLOG=("${LGB[@]}"); JREC=("${REB[@]}"); judge_side "$fn" "$msdir" before; VB=$JV; WB=$JWHY
  JRC=("${RCA[@]}"); JLOG=("${LGA[@]}"); JREC=("${REA[@]}"); judge_side "$fn" "$msdir" after;  VA=$JV; WA=$JWHY
  if [[ "$VB" == NO-VERDICT || "$VA" == NO-VERDICT ]]; then
    FV=NO-VERDICT
    [[ "$VB" != NO-VERDICT ]] || say "  $fn: NO-VERDICT -- before: $WB"
    [[ "$VA" != NO-VERDICT ]] || say "  $fn: NO-VERDICT -- after: $WA"
  else
    NB=$(count_instab "${REB[0]}" "$fn"); NA=$(count_instab "${REA[0]}" "$fn")
    MSB=$(v_ms "${REB[0]}" "$fn"); MSA=$(v_ms "${REA[0]}" "$fn")
    # C-23 tier-up guard, ONLY on a would-be SAME (interpreted multisets equal), before the unattributed guard
    [[ "$MSB" != "$MSA" ]] || { OSB=$(o_ms "${REB[0]}" "$fn"); OSA=$(o_ms "${REA[0]}" "$fn"); }
    if [[ "$MSB" == "$MSA" && "$OSB" != "$OSA" ]]; then
      FV=NO-VERDICT
      say "  $fn: NO-VERDICT -- tier-up differs (optimized-frame key set):"
      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$OSB") <(printf '%s\n' "$OSA") | sort -k3)
    elif [[ "$MSB" == "$MSA" ]]; then
      if [[ -n "$UNATTR_DIFF" ]]; then
        FV=NO-VERDICT
        say "  $fn: NO-VERDICT -- attributed sites identical (before $NB | after $NA), but unattributed/external shape instability differs:"
        while IFS= read -r l; do say "    $l"; done <<< "$UNATTR_DIFF"
      else
        FV=SAME
        say "  $fn: SAME -- identical shape-instability multiset (before $NB | after $NA site(s))"
      fi
    else
      FV=DIFF
      say "  $fn: DIFF -- shape-instability multiset differs (before $NB | after $NA site(s))"
      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$MSB") <(printf '%s\n' "$MSA") | sort -k3)
      if [[ "$UNATTR_DIFF" != "" ]]; then   # (not the -n spelling of the SAME branch: its line stays unique)
        say "    REPORTED unattributed/external shape instability also differs (not in the verdict; an instability may have moved to or from a non-target owner):"
        while IFS= read -r l; do say "    $l"; done <<< "$UNATTR_DIFF"
      fi
    fi
    MB=$(reported_fn_meta "${REB[0]}" "$fn"); MA=$(reported_fn_meta "${REA[0]}" "$fn")
    say "    REPORTED normal-transitions: before=${MB%% *} after=${MA%% *}  boilerplate-noop-inits: before=${MB#* } after=${MA#* }"
  fi
  VERDICT=$(worst "$VERDICT" "$FV")
}

# =============================================================================================
# SINGLE TRACE RUNNER
# =============================================================================================
# WHY `--no-sparkplug` (fixes Node 22.23.5 exit 133 SIGTRAP crash while keeping `--no-node-snapshot`!):
#   On Node 22 (V8 12.4), `--trace-generalization` inside a Sparkplug (CodeKind::BASELINE) frame
#   hits `Check failed: kind(isolate) != CodeKind::BASELINE` in AbstractCode::SourceStatementPosition.
#   Adding `--no-sparkplug` achieves rc=0 AND 0 unresolved non-zero map pcs across Node 22/24/26/27.
TRACE_FLAGS=(
  --log-maps
  --trace-elements-transitions
  --trace-generalization
  --no-sparkplug
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
# --self-test: canned traces + diff_fn + unattr guard + N1/N4/N5/N6/D8/D9/D11/D12 + D-A / D-B / D5 / version gate checks,
# and fake-node end-to-end rows (e2e, argv, --out and need() refusals, sparkplug refusals; rows 41-44 replay a real
# node 22 / 24 / 26 / 27 capture excerpt)
# =============================================================================================
self_test() {
  local oks=0 fails=0 H L1 L2 L3 L4 OUT1 OUT2 old msdir
  local -a JRC JLOG JREC RCB RCA LGB LGA REB REA
  local JV="" JWHY="" FV="" VERDICT="" UNATTR_DIFF="" REPORT=/dev/null
  # an INT / TERM / HUP while mktemp runs and until the EXIT trap below is chained is only NOTED, so the new dir is
  # always named and covered by that trap before a die can run (Q-B105-MKSIG); then the shared trap (lib/prologue.sh)
  # is armed again and a noted signal dies here through it; the EXIT trap removes the dir
  SD_ST_SIG=""; trap 'SD_ST_SIG=INT' INT; trap 'SD_ST_SIG=TERM' TERM; trap 'SD_ST_SIG=HUP' HUP
  ST_D=$(mktemp -d "${TMPDIR:-/tmp}/sd-st.XXXXXX") || ST_D=""
  if [[ -z "$ST_D" ]]; then sig_arm; [[ -z $SD_ST_SIG ]] || _sig "$SD_ST_SIG"; echo "FAIL self-test: mktemp -d"; return 1; fi
  # the temp dir goes on every exit path: this trap saves $?, turns set -e off FIRST (so neither a failing rm nor restoring
  # a non-zero $? can cut the trap short), removes the dir, then runs the script's own EXIT trap with $? restored
  eval "set -- $(trap -p EXIT)"; old=${3:-}
  # shellcheck disable=SC2064
  trap "st_rc=\$?; set +e; rm -rf \"\$ST_D\"; (exit \$st_rc); $old" EXIT
  sig_arm; [[ -z $SD_ST_SIG ]] || _sig "$SD_ST_SIG"
  msdir="$ST_D/ms"; mkdir "$msdir"
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
code-creation,JS,10,450,0x200003000,64,helperDel file:///w/d.mjs:30:1,0x300000004,~
EOF
  H=${H%$'\n'}

  # Test 1: clean fn -> K+R+T; compiled-but-uncalled (~ and ^) -> K only (no R)
  # (SPEC-1.2.0 A7, Q-B104-L1D5: maps 0x101 / 0x102 get map-details lines of the same elements kind, so the Transition
  # is a normal T and not a D5 N record; canned/unit/L1.log keeps the prototype's input without them)
  L1="$H"$'\n''map-details,218,0x101,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  L1="$L1"$'\n''map-details,219,0x102,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  L1="$L1"$'\n''map,Transition,220,0x101,0x102,0x200000010,2,5,,x'
  check "MAP_AWK: clean mono fn -> K+R+T; compiled-but-uncalled (~ and ^) -> K only (no R)" \
    "$(mrec 'clean,uncalled' "$L1")" "K clean;R clean;T clean|1;K uncalled;"

  # Test 2: TurboFan pc allowed + Normalize collapse + Builtin:ReflectDeleteProperty + NONE pc=0 + N1 non-target user:helperDel -> UM!
  L2="$H"$'\n''map,Normalize,310,0x201,0x202,0x200001040,12,3,DeletingProperty,'
  L2="$L2"$'\n''map,NormalizeCached,320,0x201,0x202,0x200001040,12,3,DeletingProperty,'
  L2="$L2"$'\n''map,NormalizeCached,330,0x201,0x202,0x100000040,0,-1,DeletingProperty,'
  L2="$L2"$'\n''map,Normalize,340,0x201,0x202,0x000000000000,-1,-1,DeletingProperty,'
  L2="$L2"$'\n''map,Normalize,350,0x201,0x202,0x200003010,30,10,DeletingProperty,'
  check "MAP_AWK (N1 + N5 NONE-owner): Builtin:ReflectDeleteProperty + NONE + user:helperDel all -> UM" \
    "$(mrec optDel "$L2")" \
    "K optDel;R optDel;M optDel|MAP_NORMALIZE|d.mjs:12:3|DeletingProperty|2;UM MAP_NORMALIZE|Builtin:ReflectDeleteProperty|DeletingProperty;UM MAP_NORMALIZE|NONE|DeletingProperty;UM MAP_NORMALIZE|user:helperDel|DeletingProperty;"

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

  # Test 4: N4 + D6 + N1 in SHAPE_STDOUT_AWK:
  #   - Node 26 v{None} -> I (not E)
  #   - Node 22/24 no-op a:s{Any;const}->s{Any;const} -> I (not E)
  #   - Dual reason-pair for fieldGen folds into ONE E site (hits=2)!
  #   - Class(0xADDR) + {symbol 0xADDR} normalized
  #   - splice+1700 (Node 22 offset) -> UE ELEM|splice
  #   - non-target user fn `otherElem` -> UE ELEM|user:otherElem (N1)
  IFS= read -r -d '' OUT1 <<'EOF' || true
[generalizing]a:v{None;const}->s{Any;const} (uninitialized field) [~makeLit+18 at file:///w/s.mjs:4]
[generalizing]a:v{None;const}->s{Any;const} (field type generalization) [~makeLit+18 at file:///w/s.mjs:4]
[generalizing]a:s{Any;const}->s{Any;const} (uninitialized field) [~makeLit+11 at file:///w/s.mjs:4]
[generalizing]x:d{Any;const}->d{Any;mutable} (uninitialized field) [~fieldGen+7 at file:///w/s.mjs:9]
[generalizing]x:d{Any;const}->d{Any;mutable} (field type generalization) [~fieldGen+7 at file:///w/s.mjs:9]
[generalizing]child:h{Class(0x20f29521bc09);const}->h{Any;const} (field type generalization) [new ~Holder+2 at file:///w/s.mjs:18]
[generalizing]{symbol 0x3c473b527679}:h{Any;const}->h{Any;mutable} (field type generalization) [~fieldGen+15 at file:///w/s.mjs:10]
elements transition [PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS] in splice+1700 at <unknown>:<unknown> for 0x1111 <JSArray[4]> from 0x2222 <FixedDoubleArray[22]> to 0x3333 <FixedArray[22]>
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~otherElem+9 at file:///w/s.mjs:50 for 0x4444 <JSArray[3]> from 0x5555 <FixedArray[3]> to 0x6666 <FixedDoubleArray[3]>
EOF
  OUT1=${OUT1%$'\n'}
  check "SHAPE_STDOUT_AWK (N4+D6+N1): v{None} & Node22/24 s->s -> I; dual pair folded (hits=2); splice+1700 & user:otherElem -> UE" \
    "$(srec "makeLit,fieldGen,Holder" "$OUT1")" \
    "I makeLit|2;E fieldGen|GEN|s.mjs:9|x:d{Any;const}->d{Any;mutable}|2;E Holder|GEN|s.mjs:18|child:h{Class(0xADDR);const}->h{Any;const}|1;E fieldGen|GEN|s.mjs:10|{symbol 0xADDR}:h{Any;const}->h{Any;mutable}|1;UE ELEM|splice|PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS;UE ELEM|user:otherElem|PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS;"

  # Test 5: malformed stdout generalizing line -> X
  OUT2='[generalizing]broken line without bracket'
  check "SHAPE_STDOUT_AWK: malformed generalizing line -> X" \
    "$(srec Point "$OUT2")" "X malformed generalizing line (no trailing ]) at out line 1;"

  # Test 6: D12 guard checks EVERY run (run 1 has R, run 2 has K only -> NO-VERDICT!)
  local REC_R REC_K
  REC_R=$(printf '%s\n' "$L1" | awk -v fns="clean" -v inc_trans=0 "$MAP_AWK")
  REC_K="K clean"
  JRC=(0 0); JLOG=("" ""); JREC=("$REC_R" "$REC_R")
  judge_side clean "$msdir" g_ok
  check "guard: clean fn with R in runs 1..2 -> OK" "$JV" "OK"
  JRC=(0 0); JLOG=("" ""); JREC=("$REC_R" "$REC_K")
  judge_side clean "$msdir" g_r2
  check "D12 guard: run 1 R, run 2 K-only -> NO-VERDICT" "$JV:${JWHY% (*}" \
    "NO-VERDICT:compiled (~ or ^) only with 0 attributed map/shape events and 0 optimizing compiles for 'clean' in run 2"

  # Test 7: N5 headline fix! diff_fn upgrades SAME -> NO-VERDICT when UNATTR_DIFF non-empty (and stays SAME when empty)
  local REC_CLEAN="$REC_R"
  local REC_WITH_UM="$REC_R"$'\n'"UM MAP_NORMALIZE"$'\t'"Builtin:ReflectDeleteProperty"$'\t'"DeletingProperty"
  RCB=(0 0); RCA=(0 0); LGB=("" ""); LGA=("" "")
  REB=("$REC_CLEAN" "$REC_CLEAN"); REA=("$REC_CLEAN" "$REC_CLEAN")
  compute_unattr_diff "$msdir"
  VERDICT=SAME; diff_fn clean "$msdir" >/dev/null
  check "N5 diff_fn: clean vs clean (empty UNATTR_DIFF) -> SAME" "$VERDICT" "SAME"

  REB=("$REC_CLEAN" "$REC_CLEAN"); REA=("$REC_WITH_UM" "$REC_WITH_UM")
  compute_unattr_diff "$msdir"
  VERDICT=SAME; diff_fn clean "$msdir" >/dev/null
  check "N5 headline fix: attributed SAME + UM Builtin:ReflectDeleteProperty delta -> NO-VERDICT" "$VERDICT" "NO-VERDICT"

  # Test 8: N5 UE null-control check (run 1 UE != run 2 UE -> non-empty unattr_nullctl reason!)
  local REC_UE1="$REC_R"$'\n'"UE ELEM"$'\t'"splice"$'\t'"PACKED_DOUBLE_ELEMENTS -> PACKED_ELEMENTS"
  JREC=("$REC_CLEAN" "$REC_UE1")
  check "N5 UE nullctl: run 1 != run 2 UE -> flagged" "$(unattr_nullctl "$msdir" uetest)" \
    "unattributed/external instability varied between run 1 and run 2"

  # Test 9: D8 verbatim v8fl_ok allowlist checks
  V8FL_TAB=$'\nmaglev bool\nno-lazy bool\nlazy bool\nmax-inlined-bytecode-size int\nsparkplug-filter string\nlog-maps bool\n'
  local ok1=0 ok2=0 b1=0 b2=0 b3=0 b4=0 b5=0
  v8fl_ok --no-maglev && ok1=1
  v8fl_ok --max-inlined-bytecode-size=100 && ok2=1
  v8fl_ok --eval || b1=1
  v8fl_ok --inspect || b2=1
  v8fl_ok --unknown-flag || b3=1
  v8fl_ok --sparkplug-filter=x || b4=1
  v8fl_ok --log-maps || b5=1
  check "D8 v8fl_ok allowlist: valid flags accepted; node opts, unknown, string, log refused" \
    "$ok1$ok2$b1$b2$b3$b4$b5" "1111111"

  # Test 10: CLI refusals (N6 --fn 'mk,', D11 --fn=mk, D9 newline in driver path)
  local dummy="$ST_D/d.mjs"; printf '1;\n' >"$dummy"
  local rc=0 msg=""
  rc=0; msg=$(/bin/bash "$SELF" --fn "mk," "$dummy" "$dummy" 2>&1) || rc=$?
  check "N6: --fn 'mk,' trailing comma refused exit 2" "$rc:${msg%%$'\n'*}" "2:shape-diff: --fn must not have an empty entry"
  rc=0; msg=$(/bin/bash "$SELF" --fn= "$dummy" "$dummy" 2>&1) || rc=$?
  check "D11: --fn= empty refused exit 2" "$rc:${msg%%$'\n'*}" "2:shape-diff: --fn must not be empty"
  rc=0; msg=$(/bin/bash "$SELF" --fn=mk --runs=99 "$dummy" "$dummy" 2>&1) || rc=$?
  check "D11: --fn=mk and --runs=99 parsed cleanly via need()" "$rc:${msg%%$'\n'*}" "2:shape-diff: --runs must be 2..20, got '99'"
  local nldir="$ST_D/x"$'\n'"VERDICT SAME"
  mkdir -p "$nldir"; printf '1;\n' >"$nldir/d.mjs"
  rc=0; msg=$(/bin/bash "$SELF" --fn mk "$nldir/d.mjs" "$dummy" 2>&1) || rc=$?
  local forged=0; case "$msg" in *"VERDICT SAME"*) forged=1 ;; esac
  check "D9: newline in DRIVER path refused exit 2 with 0 forged lines" "$rc:$forged" "2:0"

  # Test 16: D-A (PLAN-SD-E A3): a stdout frame whose location is neither a file path nor <unknown> goes to UE as
  # node:<fn> / other:<fn>, never dropped; a target name (setMaxListeners) in such a frame is never E
  local DA DB1 DB2 DB3 DB4 DB5 M3B1 M3B2 D5 REC_D5 REC_D5C j21 nl=$'\n'
  IFS= read -r -d '' DA <<'EOF' || true
[generalizing]_maxListeners:h{Any;const}->t{Any;mutable} (field type generalization) [~setMaxListeners+20 at node:events:330]
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~helper+9 at node:internal/util:50 for 0x4444 <JSArray[3]> from 0x5555 <FixedArray[3]> to 0x6666 <FixedDoubleArray[3]>
[generalizing]p:s{Any;const}->d{Any;const} (field type generalization) [~vmFn+3 at evalmachine.<anonymous>:2]
EOF
  DA=${DA%$'\n'}
  check "D-A SHAPE_STDOUT_AWK: node: / evalmachine frames -> UE node:<fn> / other:<fn>, never dropped; a target name there is never E" \
    "$(srec 'mk,setMaxListeners' "$DA")" \
    "UE GEN|node:setMaxListeners|_maxListeners:h{Any;const}->t{Any;mutable};UE ELEM|node:helper|PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS;UE GEN|other:vmFn|p:s{Any;const}->d{Any;const};"

  # Test 17: D-B (PLAN-SD-E A4): FROM / TO are parsed anchored at the line end, one line per case
  DB1='[generalizing]k:v{None;const}->:d{Any;const}->d{Any;mutable} (field type generalization) [~mk+5 at file:///w/s.mjs:3]'
  DB2='[generalizing]plain:d{Any;const}->d{Any;mutable} (field type generalization) [~mk+5 at file:///w/s.mjs:3]'
  DB3='[generalizing]w:v{None;const}->s{Any;const} (uninitialized field) [~mk+5 at file:///w/s.mjs:3]'
  DB4='[generalizing]weird payload [~mk+5 at file:///w/s.mjs:3]'
  DB5='[generalizing]k:v{None;const}->d{Any;const}:d{Any;const}->d{Any;mutable} (field type generalization) [~mk+5 at file:///w/s.mjs:3]'
  check "D-B SHAPE_STDOUT_AWK: anchored FROM / TO: crafted key k:v{None;const}-> and plain -> E; a real v{None} init -> I; no arrow -> E" \
    "$(srec mk "$DB1")#$(srec mk "$DB2")#$(srec mk "$DB3")#$(srec mk "$DB4")#$(srec mk "$DB5")" \
    "E mk|GEN|s.mjs:3|k:v{None;const}->:d{Any;const}->d{Any;mutable}|1;#E mk|GEN|s.mjs:3|plain:d{Any;const}->d{Any;mutable}|1;#I mk|1;#E mk|GEN|s.mjs:3|weird payload|1;#E mk|GEN|s.mjs:3|k:v{None;const}->d{Any;const}:d{Any;const}->d{Any;mutable}|1;"

  # Test 18: M3b (PLAN-SD-E A5): the stdout non-target user GEN route
  M3B1='[generalizing]y:s{Any;const}->d{Any;const} (field type generalization) [~helperGen+4 at file:///w/s.mjs:40]'
  M3B2='[generalizing]z:s{Any;const}->s{Any;const} (uninitialized field) [~helperGen+4 at file:///w/s.mjs:41]'
  check "M3b SHAPE_STDOUT_AWK: a non-target user GEN -> UE GEN|user:<fn>; a non-target LHS==RHS no-op -> nothing" \
    "$(srec mk "$M3B1")#$(srec mk "$M3B2")" "UE GEN|user:helperGen|y:s{Any;const}->d{Any;const};#"

  # Test 19: Q-SD-TRANS (a): a normal Transition is a REPORTED T count by default; inc_trans=1 (--include-transitions) adds
  # an M MAP_TRANSITION record (the verdict reads it)
  check "Q-SD-TRANS MAP_AWK: normal Transition -> T only by default; --include-transitions (inc_trans=1) adds M MAP_TRANSITION" \
    "$(mrec 'clean,uncalled' "$L1")#$(mrec 'clean,uncalled' "$L1" 1)" \
    "K clean;R clean;T clean|1;K uncalled;#K clean;R clean;T clean|1;K uncalled;M clean|MAP_TRANSITION|d.mjs:2:5|x|1;"

  # Test 20: D5 (Q-B103-SD-D5 (a), Q-B105-D5ADD (a) additive; canned/unit/d5.log): a Transition in target dictArr whose TO
  # map has no map-details line, one in helperDel whose FROM map has none, one with NONE owner (pc 0) where neither has
  # one, and a control Transition in dictArr whose maps both have one (same kind)
  D5="$H"$'\n''map-details,405,0x501,type: JS_ARRAY_TYPE\n - elements kind: PACKED_SMI_ELEMENTS\n'
  D5="$D5"$'\n''map,Transition,410,0x501,0x502,0x200002010,22,7,,y'
  D5="$D5"$'\n''map,Transition,420,0x503,0x501,0x200003010,30,10,,z'
  D5="$D5"$'\n''map,Transition,430,0x504,0x505,0x000000000000,-1,-1,,w'
  D5="$D5"$'\n''map-details,440,0x506,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  D5="$D5"$'\n''map-details,441,0x507,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n'
  D5="$D5"$'\n''map,Transition,450,0x506,0x507,0x200002020,23,3,,v'
  check "D5 MAP_AWK: a Transition with no map-details line for its from / to map -> the target keeps T and gains N; non-target / NONE -> UM MAP_EK_UNKNOWN" \
    "$(mrec dictArr "$D5")#$(mrec 'dictArr,helperDel' "$D5")" \
    "K dictArr;R dictArr;T dictArr|2;N dictArr;UM MAP_EK_UNKNOWN|user:helperDel|-;UM MAP_EK_UNKNOWN|NONE|-;#K dictArr;R dictArr;T dictArr|2;N dictArr;K helperDel;R helperDel;T helperDel|1;N helperDel;UM MAP_EK_UNKNOWN|NONE|-;"

  # Test 21: D5 judge: an N record in run 2 -> NO-VERDICT naming fn and run; the same records without N -> OK
  REC_D5=$(printf '%s\n' "$D5" | awk -v fns="dictArr" -v inc_trans=0 "$MAP_AWK")
  REC_D5C=${REC_D5//${nl}N dictArr/}
  JRC=(0 0); JLOG=("" ""); JREC=("$REC_D5C" "$REC_D5")
  judge_side dictArr "$msdir" g_d5; j21="$JV:$JWHY"
  JRC=(0 0); JLOG=("" ""); JREC=("$REC_D5C" "$REC_D5C")
  judge_side dictArr "$msdir" g_d5c
  check "D5 judge_side: an N record in run 2 -> NO-VERDICT 'elements kind unknown ... in run 2'; the same records without N -> OK" \
    "$j21#$JV" "NO-VERDICT:elements kind unknown for a Transition in 'dictArr' (no map-details line) in run 2#OK"

  # --- Tests 22-40: this script end to end on an embedded fake node (0 real node spawns; the ic-diff pattern). The fake
  # node appends its argv to $FAKE_LOG; exits 7 ("env leaked") if NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE or
  # NODE_REDIRECT_WARNINGS reached it; --version prints $FAKE_VER (default v26.8.2), or with FAKE_VER_RC set prints nothing
  # and exits $FAKE_VER_RC; --v8-options prints a synopsis, name / type pairs (maglev, sparkplug / always-sparkplug /
  # concurrent-sparkplug bool, sparkplug-filter string, max-inlined-bytecode-size int) and an empty line; else a
  # trace run in the driver's dir: exit 9 unless the last argument is a driver and --logfile is absolute; n = the number of
  # run.*.out files beside the --logfile path (run k counts k); copies ./map.<n>.log (else ./map.log) to
  # isolate-0x7508000000-<pid>-run.log beside it (the --logfile value expanded as V8 does: %% -> %, %p -> pid) and cats
  # ./out.<n>.txt (else ./out.txt); exit 8 when either is missing. A mktemp shim first on PATH logs each call ---
  local sd fk mk e o v NO DM DM2 TF
  sd=$(cd -- "$ST_D" && pwd); fk="$sd/fk"; mk="$sd/mk"; e="$sd/e2e"; o="$sd/o"
  mkdir -p "$fk" "$mk" "$e" "$o" "$sd/cwd" "$sd/tmp"
  { printf '#!%s\n' "$BASH"; cat <<'FAKE_EOF'
[ -z "${FAKE_LOG:-}" ] || printf '%s\n' "$*" >>"$FAKE_LOG"
if [ -n "${NODE_OPTIONS+x}${NODE_V8_COVERAGE+x}${NODE_COMPILE_CACHE+x}${NODE_REDIRECT_WARNINGS+x}" ]; then echo "env leaked"; exit 7; fi
case "${1:-}" in
  --version) if [ -n "${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; printf '%s\n' "${FAKE_VER:-v26.8.2}"; exit 0 ;;
  --v8-options)
    printf '%s\n' 'Synopsis:' '  fake v8 options' \
      '  --maglev (enable the maglev optimizing compiler)' '        type: bool  default: --maglev' \
      '  --sparkplug (enable Sparkplug baseline compiler)' '        type: bool  default: --sparkplug' \
      '  --always-sparkplug (directly tier up to Sparkplug code)' '        type: bool  default: --no-always-sparkplug' \
      '  --concurrent-sparkplug (compile Sparkplug code in a background thread)' '        type: bool  default: --concurrent-sparkplug' \
      '  --sparkplug-filter (filter for Sparkplug baseline compiler)' '        type: string  default: --sparkplug-filter="*"' \
      '  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)' '        type: int  default: --max-inlined-bytecode-size=460' ''
    exit 0 ;;
esac
lf=""; drv=""
for a in "$@"; do case "$a" in --logfile=*) lf="${a#--logfile=}" ;; esac; drv="$a"; done
case "$drv" in ""|-*) echo "fake node: bad option: $drv" >&2; exit 9 ;; esac
case "$lf" in /*) ;; *) echo "fake node: no absolute --logfile" >&2; exit 9 ;; esac
lf="${lf//%%/@P@}"; lf="${lf//%p/$$}"; lf="${lf//@P@/%}"
n=0; for f in "$(dirname "$lf")"/run.*.out; do [ ! -e "$f" ] || n=$((n + 1)); done; [ "$n" -ge 1 ] || n=1
m=./map.log; [ ! -f "./map.$n.log" ] || m="./map.$n.log"
t=./out.txt; [ ! -f "./out.$n.txt" ] || t="./out.$n.txt"
if [ ! -f "$m" ] || [ ! -f "$t" ]; then echo "fake node: no $m or $t in $PWD" >&2; exit 8; fi
cp "$m" "$(dirname "$lf")/isolate-0x7508000000-$$-$(basename "$lf")" || exit 8
cat "$t"
FAKE_EOF
  } >"$fk/node"
  { printf '#!%s\n' "$BASH"; printf 'printf "%%s\\n" "$*" >>%q\n' "$sd/mk.log"; printf 'exec %q "$@"\n' "$(command -v mktemp)"; } >"$mk/mktemp"
  chmod +x "$fk/node" "$mk/mktemp"
  # driver dirs (canned/e2e/ shapes; target mk): the x dual pair in mk on both sides; mono2 moves every address, the file
  # and the line; addf adds a y GEN in mk; da adds a node:events setMaxListeners GEN; nc's run 2 adds the y GEN; tr2 adds
  # one normal Transition in mk
  st_map() { # name addr-prefix line [extra map line ...]
    local nm="$1" a="$2" l="$3"; shift 3
    mkdir -p "$e/$nm"; printf '1;\n' >"$e/$nm/driver.mjs"
    printf '%s\n' 'v8-version,14,6,202,34,-node.28,0' 'v8-platform,macos,macos' \
      "code-creation,JS,10,200,${a}00000100,64,mk file:///w/$nm/driver.mjs:$l:1,0x300000001,~" \
      "code-creation,JS,13,300,${a}00001000,256,mk file:///w/$nm/driver.mjs:$l:1,0x300000001,*" \
      'map-details,305,0x101,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n' \
      'map-details,306,0x102,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n' \
      "map,Transition,310,0x101,0x102,${a}00001010,$l,20,,x" ${1+"$@"} >"$e/$nm/map.log"
  }
  st_out() { # name file line [extra stdout line ...]
    local nm="$1" f="$2" l="$3"; shift 3
    printf '%s\n' "[generalizing]x:d{Any;const}->d{Any;mutable} (uninitialized field) [~mk+7 at file:///w/$nm/driver.mjs:$l]" \
      "[generalizing]x:d{Any;const}->d{Any;mutable} (field type generalization) [~mk+7 at file:///w/$nm/driver.mjs:$l]" \
      ${1+"$@"} done >"$e/$nm/$f"
  }
  st_map mono 0x2 2; st_out mono out.txt 2
  st_map mono2 0x3bcd 3; st_out mono2 out.txt 3
  st_map addf 0x2 2; st_out addf out.txt 2 '[generalizing]y:s{Any;const}->d{Any;const} (field type generalization) [~mk+12 at file:///w/addf/driver.mjs:2]'
  st_map da 0x2 2; st_out da out.txt 2 '[generalizing]_maxListeners:h{Any;const}->t{Any;mutable} (field type generalization) [~setMaxListeners+20 at node:events:330]'
  st_map nc 0x2 2; st_out nc out.txt 2; st_out nc out.2.txt 2 '[generalizing]y:s{Any;const}->d{Any;const} (field type generalization) [~mk+12 at file:///w/nc/driver.mjs:2]'
  st_map tr1 0x2 2; printf 'done\n' >"$e/tr1/out.txt"
  st_map tr2 0x2 2 'map-details,315,0x103,type: JS_OBJECT_TYPE\n - elements kind: HOLEY_ELEMENTS\n' 'map,Transition,320,0x102,0x103,0x200001020,2,30,,y'
  printf 'done\n' >"$e/tr2/out.txt"
  NO="--node=$fk/node"; DM="$e/mono/driver.mjs"; DM2="$e/mono2/driver.mjs"
  spawn() { # [VAR=value ...] -- args... -> "rc|node spawns|mktemp calls"; output in $sd/sp.out. NODE, the 4 NODE_* and the
    local -a ev=()   # editor env never reach the script (rows that need one set it); cwd $sd/cwd, TMPDIR $sd/tmp
    local r
    while [[ "$1" != -- ]]; do ev+=("$1"); shift; done; shift
    : >"$sd/fk.log"; : >"$sd/mk.log"
    (cd "$sd/cwd" && env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS -u NODE \
      -u GIT_EDITOR -u GIT_SEQUENCE_EDITOR -u EDITOR -u VISUAL PATH="$mk:$PATH" TMPDIR="$sd/tmp" FAKE_LOG="$sd/fk.log" \
      ${ev[@]+"${ev[@]}"} "$BASH" "$SELF" "$@") >"$sd/sp.out" 2>&1 && r=0 || r=$?
    printf '%s|%s|%s' "$r" "$(wc -l <"$sd/fk.log" | tr -d ' ')" "$(wc -l <"$sd/mk.log" | tr -d ' ')"
  }
  has() { grep -c -F -x -e "$1" "$sd/sp.out" || true; }
  endc() { awk -v s="$1" 'length($0) >= length(s) && substr($0, length($0) - length(s) + 1) == s { n++ } END { print n + 0 }' "$sd/sp.out"; }
  ents() { ls -A "$1" | wc -l | tr -d ' '; }
  refuse() { # MSG PATH [VAR=value ...] -- args... -> "rc|spawns|mktemp|times the die line MSG is printed|PATH exists"
    local msg="$1" p="$2" r; shift 2
    r=$(spawn "$@")
    printf '%s|%s|%s' "$r" "$(has "shape-diff: $msg")" "$(if [[ -e "$p" || -L "$p" ]]; then echo 1; else echo 0; fi)"
  }

  # Test 22: Q-B103-SD-VERGATE (a): refused after the one --version spawn, before --v8-options and any write
  check "version gate: v21.7.3, node-22, xv22.0.0 and an empty --version -> exit 2 after 1 spawn, 0 mktemp, the refusal once; v22.23.5 -> 8 spawns" \
    "$(spawn FAKE_VER=v21.7.3 -- "$NO" --fn mk "$DM" "$DM2")|$(has "shape-diff: node v21.7.3 is not supported: shape-diff needs node >= 22 ($fk/node)")#$(spawn FAKE_VER=node-22 -- "$NO" --fn mk "$DM" "$DM2")|$(has "shape-diff: cannot parse the version of $fk/node (want v<major>.<minor>.<patch>, node >= 22)")#$(spawn FAKE_VER=xv22.0.0 -- "$NO" --fn mk "$DM" "$DM2")|$(has "shape-diff: cannot parse the version of $fk/node (want v<major>.<minor>.<patch>, node >= 22)")#$(spawn FAKE_VER_RC=0 -- "$NO" --fn mk "$DM" "$DM2")|$(has "shape-diff: cannot parse the version of $fk/node (want v<major>.<minor>.<patch>, node >= 22)")#$(spawn FAKE_VER=v22.23.5 -- "$NO" --fn mk "$DM" "$DM2")|$(has 'VERDICT SAME')" \
    "2|1|0|1#2|1|0|1#2|1|0|1#2|1|0|1#0|8|1|1"

  # Test 23: Q-ENV + the temp dir: all 4 NODE_* set reach no node spawn; TMPDIR keeps no entry
  check "e2e: mono vs mono2 with NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS set -> exit 0 SAME, 8 spawns, 1 mktemp; TMPDIR keeps 0 entries" \
    "$(spawn NODE_OPTIONS=--no-warnings NODE_V8_COVERAGE="$sd/cov" NODE_COMPILE_CACHE="$sd/cc" NODE_REDIRECT_WARNINGS="$sd/rw" -- "$NO" --fn mk "$DM" "$DM2")|$(has 'VERDICT SAME')|$(has '  mk: SAME -- identical shape-instability multiset (before 1 | after 1 site(s))')|$(ents "$sd/tmp")" \
    "0|8|1|1|1|0"

  # Test 24
  check "e2e: mono vs addf (a y field generalization added in mk) -> exit 1 DIFF naming the record" \
    "$(spawn -- "$NO" --fn mk "$DM" "$e/addf/driver.mjs")|$(has 'VERDICT DIFF')|$(has '  mk: DIFF -- shape-instability multiset differs (before 1 | after 2 site(s))')|$(endc 'before=0 after=1  mk  GEN  y:s{Any;const}->d{Any;const}')" \
    "1|8|1|1|1|1"

  # Test 25: the trace argv (kills M6): every trace run passes the 7 TRACE_FLAGS in order, then --logfile=
  TF='--log-maps --trace-elements-transitions --trace-generalization --no-sparkplug --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot --logfile='
  v=$(spawn -- "$NO" --fn mk "$DM" "$DM2")
  check "argv: fake node argv line 3 (the first trace run) begins with the 7 TRACE_FLAGS then --logfile=; so do all 6 trace runs" \
    "$v|$(sed -n 3p "$sd/fk.log" | awk -v p="$TF" 'substr($0, 1, length(p)) == p { n++ } END { print n + 0 }')|$(awk -v p="$TF" 'substr($0, 1, length(p)) == p { n++ } END { print n + 0 }' "$sd/fk.log")" \
    "0|8|1|1|6"

  # Test 26: D-A end to end
  check "D-A e2e: mono vs da (a node:events setMaxListeners GEN) -> exit 2 NO-VERDICT naming UNATTR node:setMaxListeners" \
    "$(spawn -- "$NO" --fn mk "$DM" "$e/da/driver.mjs")|$(has 'VERDICT NO-VERDICT')|$(endc 'before=0 after=1  UNATTR  GEN  node:setMaxListeners  _maxListeners:h{Any;const}->t{Any;mutable}')" \
    "2|8|1|1|1"

  # Test 27: Q-SD-TRANS (a) end to end
  check "include-transitions e2e: tr1 vs tr2 (one more normal Transition in mk) -> exit 0 SAME (REPORTED before=1 after=2); --include-transitions -> exit 1 DIFF" \
    "$(spawn -- "$NO" --fn mk "$e/tr1/driver.mjs" "$e/tr2/driver.mjs")|$(has '    REPORTED normal-transitions: before=1 after=2  boilerplate-noop-inits: before=0 after=0')#$(spawn -- "$NO" --include-transitions --fn mk "$e/tr1/driver.mjs" "$e/tr2/driver.mjs")|$(has 'VERDICT DIFF')" \
    "0|8|1|1#1|8|1|1"

  # Test 28: the null control end to end
  check "null control e2e: mono vs nc (AFTER run 2 adds a GEN) -> exit 2 NO-VERDICT, after: null control: run 2 differs from run 1" \
    "$(spawn -- "$NO" --fn mk "$DM" "$e/nc/driver.mjs")|$(has 'VERDICT NO-VERDICT')|$(has '  mk: NO-VERDICT -- after: null control: run 2 differs from run 1 (1 record(s) differ, first: run 1 x0 | run 2 x1  GEN  driver.mjs:2  y:s{Any;const}->d{Any;const})')" \
    "2|8|1|1|1"

  # Tests 29-39: --out and need() refusals (LEDGER law 3): exit 2, 0 spawns, 0 mktemp, the die line exactly once, no raw/
  mkdir "$o/t29"; ln -s "$o/t29" "$o/l29"
  check "--out a symlink -> refused before any spawn or write" \
    "$(refuse "--out: $o/l29 is a symlink (refused)" "$o/t29/raw" -- "$NO" --out "$o/l29" --fn mk "$DM" "$DM2")" "2|0|0|1|0"
  printf 'KEEP\n' >"$o/f30"
  check "--out a regular file -> refused before any spawn or write" \
    "$(refuse "--out: $o/f30 exists and is not a directory" "$o/f30/raw" -- "$NO" --out "$o/f30" --fn mk "$DM" "$DM2")|$(cat "$o/f30")" "2|0|0|1|0|KEEP"
  mkdir -p "$o/o31/raw"; : >"$o/o31/raw/x"
  check "--out DIR/raw not empty -> refused before any spawn or write" \
    "$(refuse "--out: $o/o31/raw is not empty (give a new or empty DIR)" "$o/o31/raw/before" -- "$NO" --out "$o/o31" --fn mk "$DM" "$DM2")" "2|0|0|1|0"
  mkdir -p "$o/o32" "$o/t32"; ln -s "$o/t32" "$o/o32/raw"
  check "--out DIR/raw a symlink -> refused before any spawn or write" \
    "$(refuse "--out: $o/o32/raw is a symlink (refused)" "$o/t32/before" -- "$NO" --out "$o/o32" --fn mk "$DM" "$DM2")" "2|0|0|1|0"
  mkdir "$o/o33"; printf 'KEEP\n' >"$o/t33"; ln -s "$o/t33" "$o/o33/report.txt"
  check "--out DIR/report.txt a symlink -> refused before any spawn or write; its target keeps KEEP" \
    "$(refuse "--out: $o/o33/report.txt is a symlink (refused)" "$o/o33/raw" -- "$NO" --out "$o/o33" --fn mk "$DM" "$DM2")|$(cat "$o/t33")" "2|0|0|1|0|KEEP"
  mkdir "$o/o34"; printf 'KEEP\n' >"$o/o34/report.txt"; ln "$o/o34/report.txt" "$o/h34"
  check "--out DIR/report.txt with another hard link -> refused before any spawn or write; the other name keeps KEEP" \
    "$(refuse "--out: $o/o34/report.txt has another hard link (refused)" "$o/o34/raw" -- "$NO" --out "$o/o34" --fn mk "$DM" "$DM2")|$(cat "$o/h34")" "2|0|0|1|0|KEEP"
  mkdir "$o/o35"; printf '1;\n' >"$o/o35/report.txt"
  check "--out DIR/report.txt is DRIVER_BEFORE -> refused before any spawn or write" \
    "$(refuse "--out: $o/o35/report.txt is an input file of this run ($o/o35/report.txt): the run would overwrite it" "$o/o35/raw" -- "$NO" --out "$o/o35" --fn mk "$o/o35/report.txt" "$DM2")|$(cat "$o/o35/report.txt")" "2|0|0|1|0|1;"
  # s36 -> n<NL>l/a/b: --out s36/../c names c beside the physical parent of b, so mkdir -p would make n<NL>l/a/c
  mkdir -p "$o/n${nl}l/a/b"; ln -s "$o/n${nl}l/a/b" "$o/s36"
  check "nl_dir: --out s36/../c where s36 links into a dir whose name holds a newline -> refused before any spawn or write" \
    "$(refuse "--out (resolved): a newline or a CR is not allowed (it would forge report lines)" "$o/n${nl}l/a/c" -- "$NO" --out "$o/s36/../c" --fn mk "$DM" "$DM2")" "2|0|0|1|0"
  check "a newline in --out -> refused before any spawn or write" \
    "$(refuse "--out: a newline or a CR is not allowed (it would forge report lines)" "$o/o${nl}x" -- "$NO" --out "$o/o${nl}x" --fn mk "$DM" "$DM2")" "2|0|0|1|0"
  printf 'KEEP\n' >"$o/F"
  check "--out F/o under a regular file F (uncreatable) -> refused before any spawn or write" \
    "$(refuse "--out: cannot create $o/F/o/raw/{before,after} ($o/F is not a writable directory)" "$o/F/o" -- "$NO" --out "$o/F/o" --fn mk "$DM" "$DM2")|$(cat "$o/F")" "2|0|0|1|0|KEEP"
  # (--runs 3 --self-test runs with TMPDIR missing: a build that ran the self-test anyway fails at its mktemp, never recurses)
  check "need(): --out with no value, --out= and --runs 3 --self-test -> exit 2, 0 spawns, 0 mktemp, the refusal once, the cwd stays empty" \
    "$(refuse '--out needs a value' "$sd/cwd/raw" -- "$NO" --fn mk "$DM" "$DM2" --out)|$(ents "$sd/cwd")#$(refuse '--out must not be empty' "$sd/cwd/raw" -- "$NO" --out= --fn mk "$DM" "$DM2")|$(ents "$sd/cwd")#$(refuse '--self-test takes no other argument' "$sd/cwd/raw" TMPDIR="$sd/none" -- --runs 3 --self-test)|$(ents "$sd/cwd")" \
    "2|0|0|1|0|0#2|0|0|1|0|0#2|0|0|1|0|0"

  # Test 40: the *sparkplug* refusal (kills M7): TRACE_FLAGS pins Sparkplug off; the fake lists all three as bool flags.
  # Each refusal names its flag as given; the --maglev control runs end to end with the flag ahead of TRACE_FLAGS
  check "sparkplug refusals: --v8-flags --always-sparkplug / --sparkplug / --no_concurrent_sparkplug -> exit 2, 0 spawns, 0 mktemp, the refusal once; --maglev control -> SAME, 6 trace runs" \
    "$(spawn -- "$NO" --v8-flags --always-sparkplug --fn mk "$DM" "$DM2")|$(has "shape-diff: --v8-flags must not set --always-sparkplug: conflicts with script's synchronous --no-sparkplug / --no-concurrent-recompilation flags")#$(spawn -- "$NO" --v8-flags --sparkplug --fn mk "$DM" "$DM2")|$(has "shape-diff: --v8-flags must not set --sparkplug: conflicts with script's synchronous --no-sparkplug / --no-concurrent-recompilation flags")#$(spawn -- "$NO" --v8-flags --no_concurrent_sparkplug --fn mk "$DM" "$DM2")|$(has "shape-diff: --v8-flags must not set --no_concurrent_sparkplug: conflicts with script's synchronous --no-sparkplug / --no-concurrent-recompilation flags")#$(spawn -- "$NO" --v8-flags --maglev --fn mk "$DM" "$DM2")|$(has 'VERDICT SAME')|$(awk 'substr($0, 1, 20) == "--maglev --log-maps " { n++ } END { print n + 0 }' "$sd/fk.log")" \
    "2|0|0|1#2|0|0|1#2|0|0|1#0|8|1|1|6"

  # --- Tests 41-44: a real node 22 / 24 / 26 / 27 capture replayed (27 is an alpha build: a re-cut changes its two heredocs
  # and its FAKE_VER together). Each SD_CAP<M>_{LOG,OUT} heredoc is test/fixtures/shape-diff/real/<M>/excerpt/run.{log,out}
  # byte for byte. A row checks the MAP records of the log and the SHAPE records of the stdout trace against the golden
  # strings (the SHAPE record is the only part that sees a lost ` (+N maps)` payload), then runs ONE A/B on the fake node:
  # BEFORE = the excerpt, AFTER = the excerpt minus its one map,Normalize line, --runs 2 --fn Point,work ---
  local CAP22L CAP22O CAP24L CAP24O CAP26L CAP26O CAP27L CAP27O CAPM CAPS
  IFS= read -r -d '' CAP22L <<'SD_CAP22_LOG' || true
v8-version,12,4,254,21,-node.57,0
v8-platform,macos,macos
map-details,16166,0x0a5fc595ecc1,0xa5fc595ecc1: [Map] in OldSpace\n - map: 0x0a5fc5951b49 <MetaMap (0x0a5fc5951bd9 <NativeContext[287]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: HOLEY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x0a5fc595ec49 <Map[32](PACKED_ELEMENTS)>\n - prototype_validity cell: 0x13b80bdc1249 <Cell value= 1>\n - instance descriptors (own) #1: 0x0a5fc595ea81 <Other heap object (STRONG_DESCRIPTOR_ARRAY_TYPE)>\n - prototype: 0x0a5fc595de61 <JSArray[0]>\n - constructor: 0x0a5fc595d869 <JSFunction Array (sfi = 0x13b80bdfbb99)>\n - dependent code: 0x13b80bdc0c51 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0x13b80bdc17f9: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x13b80bdf1b99 <AccessorInfo name= 0x13b80bdc17f9 <String[6]: #length>\x2C data= 0x13b80bdc0069 <undefined>>\n
code-creation,JS,9,597333,0x1092db5c9ee8,118,work file:///w/unstable-all.mjs:37:14,0x3b6cb813458,~
code-creation,JS,9,597333,0x1092db5ca008,14,Point file:///w/unstable-all.mjs:14:14,0x3b6cb813560,~
map-details,597500,0x03b6cb819ce1,0x3b6cb819ce1: [Map] in OldSpace\n - map: 0x0a5fc5951b49 <MetaMap (0x0a5fc5951bd9 <NativeContext[287]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: DICTIONARY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x0a5fc595ecc1 <Map[32](HOLEY_ELEMENTS)>\n - prototype_validity cell: 0x13b80bdc1249 <Cell value= 1>\n - instance descriptors (own) #1: 0x0a5fc595ea81 <DescriptorArray[1]>\n - prototype: 0x0a5fc595de61 <JSArray[0]>\n - constructor: 0x0a5fc595d869 <JSFunction Array (sfi = 0x13b80bdfbb99)>\n - dependent code: 0x13b80bdc0c51 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0x13b80bdc17f9: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x13b80bdf1b99 <AccessorInfo name= 0x13b80bdc17f9 <String[6]: #length>\x2C data= 0x13b80bdc0069 <undefined>>\n
map,Transition,597541,0x0a5fc595ecc1,0x03b6cb819ce1,0x1092db5c9f38,43,31,,symbol(hash 28443365)
map,Normalize,597583,0x03b6cb819b61,0x03b6cb819d71,0x1092db5c9f45,44,19,DeletingProperty,
map,Deprecate,597583,0x03b6cb819b61,0x000000000000,0x1092db5ca00a,14,30,,
map,Deprecate,597583,0x03b6cb819b09,0x000000000000,0x1092db5ca00a,14,30,,
SD_CAP22_LOG
  CAP22L=${CAP22L%$'\n'}
  IFS= read -r -d '' CAP22O <<'SD_CAP22_OUT' || true
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+60 at file:///w/unstable-all.mjs:42 for 0x2edc9f0a7de1 <JSArray[3]> from 0x03b6cb819981 <FixedArray[3]> to 0x2edc9f0a81f1 <FixedDoubleArray[3]>
[generalizing]x:s{Any;const}->d{Any;const} (+1 maps) [new ~Point+2 at file:///w/unstable-all.mjs:14]
SD_CAP22_OUT
  CAP22O=${CAP22O%$'\n'}
  IFS= read -r -d '' CAP24L <<'SD_CAP24_LOG' || true
v8-version,13,6,233,17,-node.63,0
v8-platform,macos,macos
map-details,17292,0x2e0bca4a11e1,0x2e0bca4a11e1: [Map]\n - map: 0x2e0bca4937a1 <MetaMap (0x2e0bca493831 <NativeContext[302]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: HOLEY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x2e0bca4a1161 <Map[32](PACKED_ELEMENTS)>\n - prototype_validity cell: 0x15a43ff012c9 <Cell value= 1>\n - instance descriptors (own) #1: 0x2e0bca4a0f79 <Other heap object (STRONG_DESCRIPTOR_ARRAY_TYPE)>\n - prototype: 0x2e0bca4a0359 <JSArray[0]>\n - constructor: 0x2e0bca49fd29 <JSFunction Array (sfi = 0x39c3326cf229)>\n - dependent code: 0x15a43ff00d19 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0x15a43ff094c1: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x15a43ff11791 <AccessorInfo name= 0x15a43ff094c1 <String[6]: #length>\x2C data= 0x15a43ff00011 <undefined>>\n
code-creation,JS,9,485250,0x10896bd1f1b8,118,work file:///w/unstable-all.mjs:37:14,0xd4b9f49fdb0,~
code-creation,JS,9,485250,0x10896bd1f2d8,14,Point file:///w/unstable-all.mjs:14:14,0xd4b9f49fe88,~
map-details,485417,0x0d4b9f4a2649,0xd4b9f4a2649: [Map]\n - map: 0x2e0bca4937a1 <MetaMap (0x2e0bca493831 <NativeContext[302]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: DICTIONARY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x2e0bca4a11e1 <Map[32](HOLEY_ELEMENTS)>\n - prototype_validity cell: 0x15a43ff012c9 <Cell value= 1>\n - instance descriptors (own) #1: 0x2e0bca4a0f79 <DescriptorArray[1]>\n - prototype: 0x2e0bca4a0359 <JSArray[0]>\n - constructor: 0x2e0bca49fd29 <JSFunction Array (sfi = 0x39c3326cf229)>\n - dependent code: 0x15a43ff00d19 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0x15a43ff094c1: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x15a43ff11791 <AccessorInfo name= 0x15a43ff094c1 <String[6]: #length>\x2C data= 0x15a43ff00011 <undefined>>\n
map,Transition,485417,0x2e0bca4a11e1,0x0d4b9f4a2649,0x10896bd1f208,43,31,,symbol(hash 28443365)
map,Normalize,485458,0x0d4b9f4a24d9,0x0d4b9f4a26e1,0x10896bd1f215,44,19,DeletingProperty,
map,Deprecate,485458,0x0d4b9f4a24d9,0x000000000000,0x10896bd1f2da,14,30,,
map,Deprecate,485458,0x0d4b9f4a2481,0x000000000000,0x10896bd1f2da,14,30,,
SD_CAP24_LOG
  CAP24L=${CAP24L%$'\n'}
  IFS= read -r -d '' CAP24O <<'SD_CAP24_OUT' || true
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+60 at file:///w/unstable-all.mjs:42 for 0x3250142cc111 <JSArray[3]> from 0x0d4b9f4a2309 <FixedArray[3]> to 0x3250142cc521 <FixedDoubleArray[3]>
[generalizing]x:s{Any;const}->d{Any;const} (+1 maps) [new ~Point+2 at file:///w/unstable-all.mjs:14]
SD_CAP24_OUT
  CAP24O=${CAP24O%$'\n'}
  IFS= read -r -d '' CAP26L <<'SD_CAP26_LOG' || true
v8-version,14,6,202,34,-node.28,0
v8-platform,macos,macos
map-details,13220,0x0cac66122429,0xcac66122429: [Map] in OldSpace\n - map: 0x0cac661187c9 <MetaMap (0x0cac66118859 <NativeContext[306]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: HOLEY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x0cac661223a9 <Map[32](PACKED_ELEMENTS)>\n - prototype_validity_cell: 0x1d76def81351 <Cell value= [cleared]>\n - instance descriptors (own) #1: 0x0cac661221b9 <Other heap object (STRONG_DESCRIPTOR_ARRAY_TYPE)>\n - prototype: 0x0cac66121591 <JSArray[0]>\n - constructor: 0x0cac661213e9 <JSFunction Array (sfi = 0x2a00ff784de9)>\n - dependent code: 0x1d76def80df1 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0x1d76def818f1: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x0116726c8049 <AccessorInfo name= 0x1d76def818f1 <String[6]: #length>\x2C data= 0x1d76def80011 <undefined>>\n
code-creation,JS,10,469829,0xd29acfdd3f0,123,work file:///w/unstable-all.mjs:37:14,0xf3cc8599c20,~
code-creation,JS,10,469845,0xd29acfdd518,14,Point file:///w/unstable-all.mjs:14:14,0xf3cc8599cf8,~
map-details,469994,0x0f3cc859c749,0xf3cc859c749: [Map] in OldSpace\n - map: 0x0cac661187c9 <MetaMap (0x0cac66118859 <NativeContext[306]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: DICTIONARY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x0cac66122429 <Map[32](HOLEY_ELEMENTS)>\n - prototype_validity_cell: 0x1d76def81351 <Cell value= [cleared]>\n - instance descriptors (own) #1: 0x0cac661221b9 <DescriptorArray[1]>\n - prototype: 0x0cac66121591 <JSArray[0]>\n - constructor: 0x0cac661213e9 <JSFunction Array (sfi = 0x2a00ff784de9)>\n - dependent code: 0x1d76def80df1 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0x1d76def818f1: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x0116726c8049 <AccessorInfo name= 0x1d76def818f1 <String[6]: #length>\x2C data= 0x1d76def80011 <undefined>>\n
map,Transition,470018,0x0cac66122429,0x0f3cc859c749,0x0d29acfdd444,43,31,,symbol(hash 28443365)
map,Normalize,470049,0x0f3cc859c601,0x0f3cc859c7e1,0x0d29acfdd452,44,19,DeletingProperty,
map,Deprecate,470056,0x0f3cc859c601,0x000000000000,0x0d29acfdd51a,14,30,,
map,Deprecate,470059,0x0f3cc859c5a9,0x000000000000,0x0d29acfdd51a,14,30,,
SD_CAP26_LOG
  CAP26L=${CAP26L%$'\n'}
  IFS= read -r -d '' CAP26O <<'SD_CAP26_OUT' || true
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+63 at file:///w/unstable-all.mjs:42 for 0x3f7d1a25da79 <JSArray[3]> from 0x0f3cc859c411 <FixedArray[3]> to 0x3f7d1a25de99 <FixedDoubleArray[3]>
[generalizing]x:s{Any;const}->d{Any;const} (+1 maps) [new ~Point+2 at file:///w/unstable-all.mjs:14]
SD_CAP26_OUT
  CAP26O=${CAP26O%$'\n'}
  IFS= read -r -d '' CAP27L <<'SD_CAP27_LOG' || true
v8-version,15,6,75,50,-node.11,0
v8-platform,macos,macos
map-details,13825,0x2eafbb663c79,0x2eafbb663c79: [Map] in OldSpace\n - map: 0x2eafbb659de9 <MetaMap (0x2eafbb659e79 <NativeContext[308]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: HOLEY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x2eafbb663bf9 <Map[32](PACKED_ELEMENTS)>\n - prototype_validity_cell: 0x0e6276bc13d1 <Cell value= [cleared]>\n - instance descriptors (own) #1: 0x2eafbb663a11 <DescriptorArray[1]>\n - prototype: 0x2eafbb662df1 <JSArray[0]>\n - constructor: 0x2eafbb662c49 <JSFunction Array (sfi = 0x1e5228fac689)>\n - dependent code: 0x0e6276bc0e39 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0xe6276bc1969: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x30ef15ca8609 <AccessorInfo name= 0x0e6276bc1969 <String[6]: #length>\x2C data= 0x0e6276bc0011 <undefined>>\n
code-creation,JS,10,486071,0x3ee2319dc760,118,work file:///w/unstable-all.mjs:37:14,0x38978df6aa0,~
code-creation,JS,10,486086,0x3ee2319dc880,14,Point file:///w/unstable-all.mjs:14:14,0x38978df6b78,~
map-details,486248,0x038978df91a1,0x38978df91a1: [Map] in OldSpace\n - map: 0x2eafbb659de9 <MetaMap (0x2eafbb659e79 <NativeContext[308]>)>\n - type: JS_ARRAY_TYPE\n - instance size: 32\n - inobject properties: 0\n - unused property fields: 0\n - elements kind: DICTIONARY_ELEMENTS\n - enum length: invalid\n - stable_map\n - back pointer: 0x2eafbb663c79 <Map[32](HOLEY_ELEMENTS)>\n - prototype_validity_cell: 0x0e6276bc13d1 <Cell value= [cleared]>\n - instance descriptors (own) #1: 0x2eafbb663a11 <DescriptorArray[1]>\n - prototype: 0x2eafbb662df1 <JSArray[0]>\n - constructor: 0x2eafbb662c49 <JSFunction Array (sfi = 0x1e5228fac689)>\n - dependent code: 0x0e6276bc0e39 <Other heap object (WEAK_ARRAY_LIST_TYPE)>\n - construction counter: 0\n\n  [0]: 0xe6276bc1969: [String] in ReadOnlySpace: #length (const accessor descriptor\x2C p: 0\x2C attrs: [W__]) @ 0x30ef15ca8609 <AccessorInfo name= 0x0e6276bc1969 <String[6]: #length>\x2C data= 0x0e6276bc0011 <undefined>>\n
map,Transition,486274,0x2eafbb663c79,0x038978df91a1,0x3ee2319dc7b0,43,31,,symbol(hash 28443365)
map,Normalize,486315,0x038978df9069,0x038978df9239,0x3ee2319dc7bd,44,19,DeletingProperty,
map,Deprecate,486323,0x038978df9069,0x000000000000,0x3ee2319dc882,14,30,,
map,Deprecate,486326,0x038978df9011,0x000000000000,0x3ee2319dc882,14,30,,
SD_CAP27_LOG
  CAP27L=${CAP27L%$'\n'}
  IFS= read -r -d '' CAP27O <<'SD_CAP27_OUT' || true
elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+60 at file:///w/unstable-all.mjs:42 for 0x1c4da424c2a9 <JSArray[3]> from 0x038978df8e81 <FixedArray[3]> to 0x1c4da424c6b9 <FixedDoubleArray[3]>
[generalizing]x:s{Any;const}->d{Any;const} (+1 maps) [new ~Point+2 at file:///w/unstable-all.mjs:14]
SD_CAP27_OUT
  CAP27O=${CAP27O%$'\n'}
  CAPM='K Point;R Point;K work;R work;M work|MAP_ELEM_DICT|unstable-all.mjs:43:31|HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS|1;M work|MAP_NORMALIZE|unstable-all.mjs:44:19|DeletingProperty|1;M Point|MAP_DEPRECATE|unstable-all.mjs:14:30|-|2;'
  CAPS='E work|ELEM|unstable-all.mjs:42|PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS|1;E Point|GEN|unstable-all.mjs:14|x:s{Any;const}->d{Any;const} (+1 maps)|1;'
  st_cap() { # M VER -> "MAP records#SHAPE records#rc|node spawns|mktemp|VERDICT DIFF|work DIFF|Point SAME|removed record"
    local lg="CAP$1L" ou="CAP$1O" d="$e/cap$1"
    mkdir -p "$d/b" "$d/a"
    printf '%s\n' "${!lg}" >"$d/b/map.log"; printf '%s\n' "${!ou}" >"$d/b/out.txt"; printf '1;\n' >"$d/b/driver.mjs"
    grep -v '^map,Normalize,' "$d/b/map.log" >"$d/a/map.log" || true
    cp "$d/b/out.txt" "$d/a/out.txt"; printf '1;\n' >"$d/a/driver.mjs"
    printf '%s#%s#%s|%s|%s|%s|%s' "$(mrec Point,work "${!lg}")" "$(srec Point,work "${!ou}")" \
      "$(spawn FAKE_VER="$2" -- "$NO" --runs 2 --fn Point,work "$d/b/driver.mjs" "$d/a/driver.mjs")" "$(has 'VERDICT DIFF')" \
      "$(has '  work: DIFF -- shape-instability multiset differs (before 3 | after 2 site(s))')" \
      "$(has '  Point: SAME -- identical shape-instability multiset (before 2 | after 2 site(s))')" \
      "$(endc '  before=1 after=0  work  MAP_NORMALIZE  DeletingProperty')"
  }

  # Test 41
  check "real capture node 22 (v22.23.5): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME" \
    "$(st_cap 22 v22.23.5)" "$CAPM#$CAPS#1|6|1|1|1|1|1"

  # Test 42
  check "real capture node 24 (v24.22.3): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME" \
    "$(st_cap 24 v24.22.3)" "$CAPM#$CAPS#1|6|1|1|1|1|1"

  # Test 43
  check "real capture node 26 (v26.8.2): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME" \
    "$(st_cap 26 v26.8.2)" "$CAPM#$CAPS#1|6|1|1|1|1|1"

  # Test 44
  check "real capture node 27 (v27.0.0-alpha.0.1.0): MAP + SHAPE records equal the golden; the excerpt vs the excerpt minus its map,Normalize line -> exit 1 DIFF, work DIFF naming the removed MAP_NORMALIZE record, Point SAME" \
    "$(st_cap 27 v27.0.0-alpha.0.1.0)" "$CAPM#$CAPS#1|6|1|1|1|1|1"

  echo
  if [[ $fails -eq 0 ]]; then
    echo "self-test: $oks check(s) ok"
    return 0
  else
    echo "self-test: $fails check(s) FAILED ($oks ok)"
    return 1
  fi
}

# =============================================================================================
# CLI PARSING & VALIDATION (uses lib/args.sh need(), nl_refuse, --out symlink check)
# =============================================================================================
SEEN_FN=0; SEEN_INC=0; SEEN_RUNS=0; SEEN_NODE=0; SEEN_V8=0; SEEN_OUT=0
FNLIST=""
INC_TRANS=0
RUNS=3
NODE_BIN="${NODE:-node}"
V8FLAGS=""
OUT=""
POS=()
REPORT=/dev/null   # say tees here until --out names DIR/report.txt (lib/common.sh say)
OUT_NAMES=""       # rep_refuse checks report.txt only; an inherited env OUT_NAMES never joins it

# @include lib/args.sh

while [[ $# -gt 0 ]]; do
  a="$1"; v=""
  if [[ "$a" == --*=* ]]; then
    v=${a#*=}; a=${a%%=*}
    case "$a" in
      --help|--self-test|--include-transitions) die "$a takes no =value" ;;
      *) [[ -n "$v" ]] || die "$a must not be empty" ;;
    esac
  fi
  nl_refuse "option name" "$a"
  case "$a" in
    -h|--help) usage; DIED=1; exit 2 ;;
    --self-test)
      [[ $# -eq 1 && ${#POS[@]} -eq 0 && $SEEN_FN$SEEN_INC$SEEN_RUNS$SEEN_NODE$SEEN_V8$SEEN_OUT == 000000 ]] || die "--self-test takes no other argument"
      if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi ;;
    --include-transitions) [[ $SEEN_INC -eq 0 ]] || die "--include-transitions given more than once"; SEEN_INC=1; INC_TRANS=1; shift ;;
    --fn) [[ $SEEN_FN -eq 0 ]] || die "--fn given more than once"; SEEN_FN=1; need "$@" || shift; FNLIST="$v"; shift ;;
    --runs) [[ $SEEN_RUNS -eq 0 ]] || die "--runs given more than once"; SEEN_RUNS=1; need "$@" || shift; RUNS="$v"; shift ;;
    --node) [[ $SEEN_NODE -eq 0 ]] || die "--node given more than once"; SEEN_NODE=1; need "$@" || shift; NODE_BIN="$v"; shift ;;
    --v8-flags) [[ $SEEN_V8 -eq 0 ]] || die "--v8-flags given more than once"; SEEN_V8=1; need "$@" || shift; V8FLAGS="$v"; shift ;;
    --out) [[ $SEEN_OUT -eq 0 ]] || die "--out given more than once"; SEEN_OUT=1; need "$@" || shift; OUT="$v"; shift ;;
    --) shift; while [[ $# -gt 0 ]]; do POS+=("$1"); shift; done ;;
    -*) die "unknown option: $a (see --help)" ;;
    *) POS+=("$1"); shift ;;
  esac
done

nl_refuse "the cwd" "$PWD"
nl_refuse "--fn" "$FNLIST"
nl_refuse "--runs" "$RUNS"
nl_refuse "--node" "$NODE_BIN"
nl_refuse "--v8-flags" "$V8FLAGS"
nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}
[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"

RE_INT='^[0-9]+$'
[[ "$RUNS" =~ $RE_INT && "$RUNS" -ge 2 && "$RUNS" -le 20 ]] || die "--runs must be 2..20, got '$RUNS'"
[[ -n "$FNLIST" ]] || die "--fn LIST is required"
case ",$FNLIST," in *,,*) die "--fn must not have an empty entry" ;; esac

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
IFS=',' read -r -a TARGETS <<< "$FNLIST"
SEEN_F=","
for fn in "${TARGETS[@]}"; do
  [[ "$fn" =~ $FN_RE ]] || die "invalid function name in --fn: '$fn'"
  [[ "$SEEN_F" != *",$fn,"* ]] || die "duplicate function name in --fn: '$fn'"
  SEEN_F="${SEEN_F}${fn},"
done

[[ ${#POS[@]} -eq 2 ]] || die "requires exactly 2 drivers (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]}"
[[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER_BEFORE not readable: ${POS[0]}"
[[ -f "${POS[1]}" && -r "${POS[1]}" ]] || die "DRIVER_AFTER not readable: ${POS[1]}"

# Split --v8-flags with noglob (`set -f`, D8)
V8_EXTRA=()
if [[ $SEEN_V8 -eq 1 ]]; then
  [[ -n "$V8FLAGS" ]] || die "--v8-flags must not be empty"
  set -f
  # shellcheck disable=SC2206
  V8_EXTRA=($V8FLAGS)
  set +f
  [[ ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
  for f in "${V8_EXTRA[@]}"; do
    [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
    g=${f//_/-}
    case "$g" in
      *stress-concurrent-inlining*|*concurrent-recompilation*|*sparkplug*)
        die "--v8-flags must not set $f: conflicts with script's synchronous --no-sparkplug / --no-concurrent-recompilation flags" ;;
      --require*|--import*|--loader*|--experimental-loader*|--env-file*|--experimental-config-file*|--experimental-default-config-file*|--eval*|--print*)
        die "--v8-flags must not set $f: node preload/eval/print flag is refused" ;;
    esac
  done
fi

# --out validation BEFORE any spawn or write (D9: includes symlink check on --out itself + nl_dir!)
if [[ -n "$OUT" ]]; then
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
  OUT_UP="$OUT/raw/before"
  while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw/{before,after} ($OUT_UP is not a writable directory)"
  nl_dir "--out (resolved)" "$OUT"
  rep_refuse "${POS[@]}"
fi

NODE_RES=$NODE_BIN
if [[ "$NODE_RES" != */* ]]; then
  NODE_RES=$(command -v -- "$NODE_RES" 2>/dev/null) || die "node binary not found: $NODE_BIN"
fi
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH: $NODE_BIN -> $NODE_RES"
[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not executable: $NODE_RES"
NODE_DIR=$(dirname -- "$NODE_RES"); [[ "$NODE_DIR" != - ]] || NODE_DIR=./-
NODE_DIR=$(cd -- "$NODE_DIR" 2>/dev/null && pwd) || die "node binary: cannot resolve directory of $NODE_RES"
NODE_C="${NODE_DIR%/}/$(basename -- "$NODE_RES")"
[[ "$NODE_C" -ef "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
NODE_RES=$NODE_C
nl_refuse "--node (resolved)" "$NODE_RES"
[[ "$NODE_RES" != *=* ]] || die "node binary: an = is not allowed in the resolved path: $NODE_RES"

DRV_B_DIR=$(cd -- "$(dirname -- "${POS[0]}")" && pwd); DRV_B_BASE=$(basename -- "${POS[0]}")
DRV_A_DIR=$(cd -- "$(dirname -- "${POS[1]}")" && pwd); DRV_A_BASE=$(basename -- "${POS[1]}")
[[ "$DRV_B_DIR/$DRV_B_BASE" -ef "${POS[0]}" ]] || die "DRIVER_BEFORE: cannot resolve directory of ${POS[0]}"
[[ "$DRV_A_DIR/$DRV_A_BASE" -ef "${POS[1]}" ]] || die "DRIVER_AFTER: cannot resolve directory of ${POS[1]}"
nl_refuse "DRIVER (resolved)" "$DRV_B_DIR/$DRV_B_BASE" "$DRV_A_DIR/$DRV_A_BASE"

GOT_VER=$("${PROBE_ENV[@]}" "$NODE_RES" --version 2>/dev/null) || die "cannot run $NODE_RES --version"
# version gate (Q-B103-SD-VERGATE (a), Q-SD-NODE (a) node >= 22): after the one --version spawn, before --v8-options and
# before any write. An unparsable answer is never printed (it could hold a newline or a CR)
VER_RE='^v([0-9]{1,4})\.[0-9]{1,6}\.[0-9]{1,6}(-[0-9A-Za-z.-]{1,64})?$'
[[ "$GOT_VER" =~ $VER_RE ]] || die "cannot parse the version of $NODE_RES (want v<major>.<minor>.<patch>, node >= 22)"
[[ $((10#${BASH_REMATCH[1]})) -ge 22 ]] || die "node $GOT_VER is not supported: shape-diff needs node >= 22 ($NODE_RES)"
v8fl_check "$NODE_RES"

# the temp dir goes on every exit path: this trap saves $?, turns set -e off FIRST (so neither a failing rm nor restoring
# a non-zero $? can cut the trap short), removes the dir, then runs the script's own EXIT trap with $? restored.
# An INT / TERM / HUP from here until the mktemp of either branch below has named the dir is only NOTED
# (Q-B105-MKSIG, the ic-diff pattern); then the shared trap (lib/prologue.sh) is armed again and a noted signal dies
# through it; the EXIT trap removes the dir
SD_SIG=""; trap 'SD_SIG=INT' INT; trap 'SD_SIG=TERM' TERM; trap 'SD_SIG=HUP' HUP
eval "set -- $(trap -p EXIT)"; SD_OLD=${3:-}
# shellcheck disable=SC2064
trap "sd_rc=\$?; set +e; if [[ -n \$TMP_DIR && -d \$TMP_DIR ]]; then rm -rf -- \"\$TMP_DIR\"; fi; (exit \$sd_rc); $SD_OLD" EXIT

if [[ -n "$OUT" ]]; then
  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" || die "--out: cannot create $OUT/raw/{before,after}"
  OUT=$(cd -- "$OUT" && pwd)
  nl_refuse "--out (resolved)" "$OUT"
  REPORT="$OUT/report.txt"
  { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"
  RUNROOT="$OUT/raw"
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/shape-diff-ms.XXXXXX") || TMP_DIR=""
  sig_arm; [[ -z $SD_SIG ]] || _sig "$SD_SIG"
  [[ -n "$TMP_DIR" ]] || die "cannot create temp ms dir"
  MSDIR="$TMP_DIR"
else
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/shape-diff.XXXXXX") || TMP_DIR=""
  sig_arm; [[ -z $SD_SIG ]] || _sig "$SD_SIG"
  [[ -n "$TMP_DIR" ]] || die "cannot create temp dir"
  SD_ABS=$(cd -- "$TMP_DIR" && pwd) || die "cannot resolve the temp dir $TMP_DIR"; TMP_DIR=$SD_ABS
  mkdir "$TMP_DIR/before" "$TMP_DIR/after" "$TMP_DIR/ms"
  RUNROOT="$TMP_DIR"
  MSDIR="$TMP_DIR/ms"
fi

say "shape-diff  node $GOT_VER  $NODE_RES  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
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

compute_unattr_diff "$MSDIR"

VERDICT=SAME
for fn in "${TARGETS[@]}"; do diff_fn "$fn" "$MSDIR"; done

say ""
say "NOTE: a single cold call to Array.prototype.push(1.5) emits 0 trace lines on Node 22/24/26/27 (200 calls emit unattributed push+0); see RESEARCH.md."
say ""
say "VERDICT $VERDICT"
FINAL=1
case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
