#!/usr/bin/env bash
# RESEARCH PROTOTYPE -- NOT A SHIPPED SCRIPT.
# Blueprint for LiteUtils 1.3.0: src/code-size-diff.sh (ROADMAP L4).
#
# code-size-diff.prototype.sh -- compiled native CODE SIZE of NAMED functions per V8 tier,
# from V8 `--log-code` CSV records:
#   - diff mode (default): BEFORE vs AFTER on one node binary, multiset of (fn, tier, size)
#   - report mode (--report): per-tier sizes for one driver (exit 0 OK, 2 NO-VERDICT)
#   - gate mode (--max fn=N[,fn=N] --node-version vX.Y.Z --platform-arch OS-ARCH):
#       max size in selected tiers <= N; version or platform-arch mismatch -> 2 NO-VERDICT
#   - self-test (--self-test): canned --log-code traces + CLI/refusal checks covering every
#       fix in RECHECK-code-size-diff.md (Defect 1 ambiguous fn, D1-D9, Q-CSD-KEY tripwire)
#
# Architectural note on promotion to src/code-size-diff.sh:
#   The [PROTOTYPE SHIM] sections below match LiteUtils's real lib/*.sh fragment boundaries
#   (`prologue.sh`, `msdiff.sh`, `common.sh`, `args.sh`, `v8flags.sh`), EXCEPT null control
#   (B2 / Q-CSD-NCTL): `lib/nullctl.sh` is a text macro hard-coding `for side in before after`,
#   so single-driver modes (`--report`, `--max`, side `one`) keep a local null control rather
#   than modifying any 1.0.0 lib file.

unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS
unset CDPATH

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/prologue.sh`
# =============================================================================================
set -euo pipefail
shopt -u nocasematch 2>/dev/null || true
[[ ! -o posix ]] || set +o posix
export LC_ALL=C

# Fail-closed EXIT trap (ROADMAP template item 5; LEDGER law 3):
# Every planned exit 0 or 1 sets FINAL=1 first. Unplanned exits (including bash 3.2 `set -u`
# exit 0) become exit 2 NO-VERDICT.
FINAL=""
DIED=""
SIG_PID=""
DRV_RC=0
TMP_DIR=""
REPORT=""
SELF="$(cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")"
trap 'rc=$?; if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf -- "$TMP_DIR"; fi; if [[ -z "$FINAL" ]]; then set +e; [[ -n "$DIED" ]] || printf "code-size-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT

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

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/msdiff.sh` (MSDIFF_AWK ONLY; multiset is in lib/common.sh)
# =============================================================================================
# shellcheck disable=SC2016
MSDIFF_AWK='
function key(s) { sub(/^ *[0-9]+ /, "", s); return s }
function show(k,   u, l) { u = k; sub(/\t.*/, "", u); l = k; sub(/^[^\t]*\t/, "", l); return (u == "*") ? l : "[" u "] " l }
FILENAME == ARGV[1] { k = key($0); b[k] = $1 + 0; all[k] = 1; next }
{ k = key($0); a[k] = $1 + 0; all[k] = 1 }
END { for (k in all) if (b[k] + 0 != a[k] + 0) printf "  before=%d after=%d  %s\n", b[k], a[k], show(k) }
'

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/common.sh` (verbatim signatures!)
# =============================================================================================
die() {
  DIED=1
  printf 'code-size-diff: %s\nVERDICT NO-VERDICT\n' "$*" >&2
  if [[ $BASH_SUBSHELL -eq 0 && -n "$REPORT" && -s "$REPORT" ]]; then
    { printf 'code-size-diff: %s\nVERDICT NO-VERDICT\n' "$*" >>"$REPORT"; } 2>/dev/null || true
  fi
  exit 2
}
say() {
  if [[ -n "$REPORT" ]]; then printf '%s\n' "$*" | tee -a "$REPORT"
  else printf '%s\n' "$*"
  fi
}
multiset() { LC_ALL=C sort | LC_ALL=C uniq -c; }   # lib/common.sh:28 (never sort -u)
worst() { # lib/common.sh:112 verbatim: SAME / DIFF / NO-VERDICT only
  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT
  elif [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF
  else echo SAME; fi
}
# WHY local vworst() instead of modifying lib/common.sh worst() (matches src/bytecode-budget.sh:304):
#   lib/common.sh worst() only knows SAME/DIFF/NO-VERDICT; report/gate modes use OK/WITHIN/OVER.
vworst() {
  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT
  elif [[ $1 == OVER || $2 == OVER ]]; then echo OVER
  elif [[ $1 == WITHIN || $2 == WITHIN ]]; then echo WITHIN
  else echo OK; fi
}
nl_refuse() { # lib/common.sh:117 verbatim (LEDGER law 3: refuse before spawn/write; never print value)
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
# [PROTOTYPE SHIM] -- replaced by `# @include lib/args.sh` (verbatim!)
# =============================================================================================
need() { # value from --opt=value (returns 0) or from next arg (returns 1: caller shifts)
  if [[ -n "$v" ]]; then return 0; fi
  [[ $# -ge 2 ]] || die "$a needs a value"
  v="$2"; return 1
}

# =============================================================================================
# [PROTOTYPE SHIM] -- replaced by `# @include lib/v8flags.sh` (100% VERBATIM -- zero local edits!)
# =============================================================================================
# WHY keep lib/v8flags.sh 100% verbatim (Q-CSD-TLLIB (a), RECHECK New Defect 2):
#   Touching lib/v8flags.sh would move the root sha256 of every 1.0.0 shipped script and break
#   LiteSignal's S-11 pin. Therefore v8fl_check stays unmodified, and the Turbolev exact-name
#   refusal + --v8-options default-on check live locally in code-size-diff right after v8fl_check.
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
# CORE PARSER: CODESIZE_AWK (single-pass POSIX awk over one V8 --log-code CSV file)
# =============================================================================================
# Input:  -v fns="fn1,fn2"
# Output:
#   C <fn><TAB><tier><TAB><base_tier><TAB><size><TAB><loc><TAB><ctx>
#   A <fn><TAB><n_locs><TAB><loc1><TAB><loc2>
#     - Emitted when a target `fn` compiled from > 1 distinct full definition location
#       (`<full_script>:<line>:<col>`). WHY (RECHECK Defect 1, Q-CSD-NAME (a)):
#       If a.mjs defines small `hot` and b.mjs defines big `hot`, and AFTER swaps them, a key
#       without file identity reads `hot: SAME` (exit 0) -- a WRONG VERDICT. Refusing any
#       ambiguous `--fn` to NO-VERDICT fails closed without breaking cross-side line-shift invariance.
#   X <why> at log line <n> [(+<m> more X line(s))]
#     - Includes the Q-CSD-KEY (a) version-free numeric tripwire: within ONE log, every base
#       tier (`ignition`, `sparkplug`, `maglev`, `turbo`) must map to exactly ONE numeric `$3`,
#       and distinct base tiers must map to DISTINCT numeric `$3` (verified on Node 22/24/26/27!).
# shellcheck disable=SC2016
CODESIZE_AWK='
BEGIN {
  FS = ","
  nf = split(fns, flist, ",")
  for (i = 1; i <= nf; i++) {
    f = flist[i]
    fn_len[i] = length(f)
    fn_pfx[i] = f " "
  }
  # Observed non-code-creation events across Node 22/24/26/27 + GC (`code-move`).
  # `sfi-move` and `code-deopt` kept defensively (matching ic-diff.sh allowlist).
  ok_ev["v8-version"] = 1
  ok_ev["v8-platform"] = 1
  ok_ev["new"] = 1
  ok_ev["delete"] = 1
  ok_ev["heap-available"] = 1
  ok_ev["heap-capacity"] = 1
  ok_ev["script-source"] = 1
  ok_ev["code-source-info"] = 1
  ok_ev["code-move"] = 1
  ok_ev["sfi-move"] = 1
  ok_ev["code-deopt"] = 1

  nonjs["Builtin"] = 1
  nonjs["BytecodeHandler"] = 1
  nonjs["RegExp"] = 1
  nonjs["Stub"] = 1
  nonjs["Handler"] = 1
  nonjs["Wasm"] = 1

  js_ty["JS"] = 1
  js_ty["Eval"] = 1
  js_ty["Script"] = 1

  # Closed map of V8 CodeKindToMarker() ($9) -> "<tier> <base_tier> <ctx>"
  # Verified live on Node 22/24/26/27: ~ ^ + +\047 o+ * *\047 o*  (o+\047 and o*\047 unobserved; defensive)
  mk["~"]      = "ignition ignition 0"
  mk["^"]      = "sparkplug sparkplug 0"
  mk["+"]      = "maglev maglev 0"
  mk["+\047"]  = "maglev maglev 1"
  mk["o+"]     = "maglev-osr maglev 0"
  mk["o+\047"] = "maglev-osr maglev 1"
  mk["*"]      = "turbo turbo 0"
  mk["*\047"]  = "turbo turbo 1"
  mk["o*"]     = "turbo-osr turbo 0"
  mk["o*\047"] = "turbo-osr turbo 1"

  NX = 0; XW = ""; XL = 0
}
function failx(why) {
  NX++
  if (NX == 1) { XW = why; XL = NR }
}
function loc_base(rest,   p, i, c) {
  p = 0
  for (i = length(rest); i >= 1; i--) {
    c = substr(rest, i, 1)
    if (c == "/") { p = i; break }
  }
  return (p > 0) ? substr(rest, p + 1) : rest
}
{
  if (index($0, "\t") > 0) {
    if ($1 == "code-creation") { failx("code-creation contains TAB"); next }
  }
  if ($1 != "code-creation") {
    if (!($1 in ok_ev)) failx("unknown event " $1)
    next
  }
  ty = $2
  if (ty in nonjs) {
    if (NF != 7) { failx("non-JS code-creation not 7 fields (" ty ", NF=" NF ")"); next }
    if ($3 !~ /^[0-9]+$/ || $5 !~ /^0x[0-9a-fA-F]+$/ || $6 !~ /^[0-9]+$/) {
      failx("non-JS code-creation does not parse (" ty ")")
    }
    next
  }
  if (!(ty in js_ty)) {
    failx("unknown code-creation type " ty)
    next
  }
  if (NF != 9) { failx("JS code-creation not 9 fields (" ty ", NF=" NF ")"); next }
  if ($3 !~ /^[0-9]+$/ || $5 !~ /^0x[0-9a-fA-F]+$/ || $6 !~ /^[0-9]+$/ || length($6) > 9 || $8 !~ /^0x[0-9a-fA-F]+$/) {
    failx("JS code-creation does not parse (" ty ")")
    next
  }
  if (!($9 in mk)) {
    failx("unknown code tier marker " $9)
    next
  }

  # Q-CSD-KEY (a) version-free numeric tripwire:
  # Every base tier maps to exactly ONE numeric $3 within a log, and each numeric $3 maps
  # to exactly ONE base tier. Catches any V8 schema change without a version-keyed enum table!
  split(mk[$9], mparts, " ")
  bt = mparts[2]
  knum = $3
  if ((bt in tier_to_k) && tier_to_k[bt] != knum) {
    failx("tier-marker/CodeKind conflict: " bt " seen with kinds " tier_to_k[bt] " and " knum)
    next
  }
  if ((knum in k_to_tier) && k_to_tier[knum] != bt) {
    failx("tier-marker/CodeKind conflict: kind " knum " seen for both " k_to_tier[knum] " and " bt)
    next
  }
  tier_to_k[bt] = knum
  k_to_tier[knum] = bt

  if (ty != "JS") next

  name_loc = $7
  for (i = 1; i <= nf; i++) {
    pfx = fn_pfx[i]
    pl = fn_len[i] + 1
    if (substr(name_loc, 1, pl) != pfx) continue
    rest = substr(name_loc, pl + 1)
    if (substr(rest, 1, 1) == "/" || substr(rest, 1, 8) == "file:///") {
      lb = loc_base(rest)
      f = flist[i]
      # Track distinct full definition locations per target fn (RECHECK Defect 1; M1b/M1c)
      dk = f SUBSEP rest
      if (!(dk in seen_def)) {
        seen_def[dk] = 1
        def_n[f]++
        if (def_n[f] == 1) { def_l1[f] = lb; def_r1[f] = rest }
        else if (def_n[f] == 2) {
          if (lb == def_l1[f]) { def_l1[f] = def_r1[f]; def_l2[f] = rest }
          else def_l2[f] = lb
        }
      }
      printf "C %s\t%s\t%s\t%d\t%s\t%s\n", f, mparts[1], bt, ($6 + 0), lb, mparts[3]
      break
    }
  }
}
END {
  for (i = 1; i <= nf; i++) {
    f = flist[i]
    if (def_n[f] + 0 > 1) {
      printf "A %s\t%d\t%s\t%s\n", f, def_n[f], def_l1[f], def_l2[f]
    }
  }
  if (NX > 0) {
    printf "X %s at log line %d%s\n", XW, XL, (NX > 1 ? " (+" (NX - 1) " more X line(s))" : "")
  }
}
'

# =============================================================================================
# LOCAL TURBOLEV DEFAULT-ON CHECK (LEDGER #107 G5c; Q-CSD-TLLIB (a))
# =============================================================================================
# shellcheck disable=SC2016
TURBOLEV_AWK='
{ sub(/\r$/, "") }
/^  --turbolev \(/        { cur = "tl"; next }
/^  --turbolev-future \(/ { cur = "tlf"; next }
/^  --/                   { cur = ""; next }
cur != "" && /default:/ {
  s = $0
  sub(/.*default:[ \t]*/, "", s)
  if (cur == "tl") {
    if (s == "--turbolev" || s == "true") tl = "on"
    else if (s == "--no-turbolev" || s == "false") tl = "off"
    else tl = "?"
  } else if (cur == "tlf") {
    if (s == "--turbolev-future" || s == "true") tlf = "on"
    else if (s == "--no-turbolev-future" || s == "false") tlf = "off"
    else tlf = "?"
  }
  cur = ""
}
END {
  if (tl == "") tl = "absent"
  if (tlf == "") tlf = "absent"
  print tl " " tlf
}
'

# =============================================================================================
# RECORD EXTRACTORS & VERDICT JUDGE (uses lib/nullctl.sh temp-file cmp -s pattern, D9!)
# =============================================================================================
# WHY space-formatted display keys in s_ms / v_ms (fixing D8 raw TABs in DIFF output):
#   MSDIFF_AWK strips only the leading "*\t" unit prefix. Formatting the payload with two
#   spaces (`fn  tier  sizeB`) prints clean, TAB-free DIFF lines: `before=0 after=1  hot  maglev  1144B`.
s_ms() { # records fn tiers (null control: keeps loc)
  printf '%s\n' "$1" | awk -v fn="$2" -v ts="$3" '
    BEGIN { FS = "\t"; p = "C " fn "\t"; n = split(ts, a, ","); for (i = 1; i <= n; i++) wt[a[i]] = 1 }
    substr($0, 1, length(p)) == p && ($3 in wt) { printf "*\t%s  %sB  %s\n", $2, $4, $5 }
  ' | multiset
}

v_ms() { # records fn tiers (cross-side diff: strips loc so comment/line edits never false-DIFF)
  printf '%s\n' "$1" | awk -v fn="$2" -v ts="$3" '
    BEGIN { FS = "\t"; p = "C " fn "\t"; n = split(ts, a, ","); for (i = 1; i <= n; i++) wt[a[i]] = 1 }
    substr($0, 1, length(p)) == p && ($3 in wt) { printf "*\t%s  %s  %sB\n", fn, $2, $4 }
  ' | multiset
}

count_fn() { # records fn tiers -> "<selected_compiles> <ignition_compiles> <max_selected_size>"
  printf '%s\n' "$1" | awk -v fn="$2" -v ts="$3" '
    BEGIN { FS = "\t"; p = "C " fn "\t"; n = split(ts, a, ","); for (i = 1; i <= n; i++) wt[a[i]] = 1; sel = 0; ign = 0; mx = 0 }
    substr($0, 1, length(p)) == p {
      sz = $4 + 0
      if ($3 == "ignition") ign++
      if ($3 in wt) { sel++; if (sz > mx) mx = sz }
    }
    END { print sel, ign, mx }
  '
}

reported_summary() {
  printf '%s\n' "$1" | awk -v fn="$2" '
    BEGIN {
      FS = "\t"; p = "C " fn "\t"
      ord[1] = "ignition"; ord[2] = "sparkplug"; ord[3] = "maglev"; ord[4] = "maglev-osr"; ord[5] = "turbo"; ord[6] = "turbo-osr"
    }
    substr($0, 1, length(p)) == p {
      t = $2; sz = $4
      list[t] = (t in list) ? (list[t] "," sz) : sz
    }
    END {
      out = ""
      for (i = 1; i <= 6; i++) {
        t = ord[i]
        if (t in list) out = out (out == "" ? "" : "  ") t "=" list[t] "B"
      }
      print (out == "" ? "(none)" : out)
    }
  '
}

# judge_side FN TIERS MS_DIR SIDE: inspects JRC[], JLOG[], JREC[] for one side.
# Writes run 1..N multiset files to MS_DIR and checks them with cmp -s + MSDIFF_AWK
# (matching lib/nullctl.sh's exact file-based null-control pattern, D9).
judge_side() {
  local fn="$1" tiers="$2" msdir="$3" side="$4" n i x amb counts sel ign f1 fk dl
  JV=NO-VERDICT; JWHY=""
  n=${#JRC[@]}
  for ((i = 0; i < n; i++)); do
    if [[ "${JRC[$i]}" != 0 ]]; then JWHY="driver exited ${JRC[$i]} in run $((i + 1))"; return 0; fi
    if [[ -n "${JLOG[$i]}" ]]; then JWHY="${JLOG[$i]} in run $((i + 1))"; return 0; fi
  done
  for ((i = 0; i < n; i++)); do
    x=$(printf '%s\n' "${JREC[$i]}" | awk '/^X / && !n++ { print substr($0, 3) }')
    if [[ -n "$x" ]]; then JWHY="unreadable code log in run $((i + 1)): $x"; return 0; fi
  done
  # Defect 1 (RECHECK): ambiguous function name (>1 distinct definition location -> NO-VERDICT)
  for ((i = 0; i < n; i++)); do
    amb=$(printf '%s\n' "${JREC[$i]}" | awk -v fn="$fn" 'BEGIN { FS = "\t"; p = "A " fn "\t" } substr($0, 1, length(p)) == p { printf "%s definition locations (%s, %s)", $2, $3, $4; exit }')
    if [[ -n "$amb" ]]; then JWHY="ambiguous function name '$fn' in run $((i + 1)): compiled at $amb"; return 0; fi
  done
  # [PROTOTYPE SHIM for `# @include lib/nullctl.sh`] -- cmp -s over run 1..N multiset files
  local safe_fn=${fn// /_}
  f1="$msdir/$safe_fn.$side.1.txt"
  s_ms "${JREC[0]}" "$fn" "$tiers" >"$f1"
  for ((i = 1; i < n; i++)); do
    fk="$msdir/$safe_fn.$side.$((i + 1)).txt"
    s_ms "${JREC[$i]}" "$fn" "$tiers" >"$fk"
    if ! cmp -s "$f1" "$fk"; then
      dl=$(awk "$MSDIFF_AWK" "$f1" "$fk" | sort -k3 \
        | awk -v k="$((i + 1))" '{ n++; if (n == 1) { l = $0; sub(/^  before=[0-9]+ after=[0-9]+  /, "", l); a = $1; b = $2
            sub(/^before=/, "", a); sub(/^after=/, "", b); f = "run 1 x" a " | run " k " x" b "  " l } }
          END { printf "%d record(s) differ, first: %s", n, f }')
      JWHY="null control: run $((i + 1)) differs from run 1 ($dl)"; return 0
    fi
  done
  counts=$(count_fn "${JREC[0]}" "$fn" "$tiers")
  sel=${counts%% *}
  ign=${counts#* }; ign=${ign%% *}
  if [[ "$sel" == 0 ]]; then
    if [[ "$ign" != 0 ]]; then
      JWHY="no compile of '$fn' in selected tiers ($tiers) in run 1 (saw ignition bytecode x$ign: warm up more, or include --tiers ignition)"
    else
      JWHY="no compile of '$fn' in run 1 (no such name or never called)"
    fi
    return 0
  fi
  JV=OK
}

# =============================================================================================
# SINGLE TRACE RUNNER
# =============================================================================================
# WHY `--no-concurrent-sparkplug` alongside `--no-concurrent-recompilation`:
#   V8's `--concurrent-sparkplug` is ON by default independently of `--no-concurrent-recompilation`.
#   Verified on Node 22/24/26/27: all four accept `--no-concurrent-sparkplug` cleanly (exit 0).
TRACE_FLAGS=(--log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot)
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)

RUN_RC=0; RUN_LOG=""; RUN_REC=""
run_side() { # side dir base k
  local rd="$RUNROOT/$1" out=/dev/null lf n rc=0 ar=0 rd_esc
  local -a LF
  if [[ -n "$OUT" ]]; then out="$rd/run.$4.out"; fi
  rd_esc=${rd//%/%%}
  ( cd -- "$2" && exec "${PROBE_ENV[@]}" "$NODE_RES" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "--logfile=$rd_esc/run.log" "./$3" ) \
    >"$out" 2>&1 <&0 &
  drv_wait; rc=$DRV_RC
  RUN_RC=$rc; RUN_LOG=""; RUN_REC=""
  shopt -s nullglob; LF=("$rd"/isolate-0x*-*-run.log); shopt -u nullglob
  if [[ ${#LF[@]} -eq 0 ]]; then RUN_LOG="no code log (no isolate-0x*-*-run.log written)"; return 0; fi
  if [[ ${#LF[@]} -gt 1 ]]; then RUN_LOG="another isolate or process logged (${#LF[@]} isolate-0x*-*-run.log files)"; return 0; fi
  lf="$rd/run.$4.log"
  mv -f "${LF[0]}" "$lf" || die "cannot rename ${LF[0]} to $lf"
  n=$(grep -a -c '^v8-version,' "$lf" || true)
  if [[ "$n" != 1 ]]; then RUN_LOG="the log holds $n v8-version line(s), want 1"; return 0; fi
  if ! tr -d '\000' <"$lf" | cmp -s - "$lf"; then RUN_LOG="a NUL byte in the log"; return 0; fi
  if [[ "$(tail -c 1 "$lf"; printf x)" != $'\nx' ]]; then RUN_LOG="the log has no final newline"; return 0; fi
  RUN_REC=$(awk -v fns="$FNLIST" "$CODESIZE_AWK" "$lf") || ar=$?
  if [[ $ar != 0 ]]; then RUN_LOG="cannot read the log (awk exited $ar)"; RUN_REC=""; fi
}

# =============================================================================================
# --self-test: canned traces + judge + TURBOLEV_AWK + v8fl_ok + CLI refusals (Defect 1, D1-D9)
# =============================================================================================
self_test() {
  local oks=0 fails=0 SQ="'" H B1 B2 OSR DEOPT BOTH_GET AMBIG BAD_MK BAD_NF BAD_EV BAD_K1 BAD_K2 GOT
  local ST_D msdir
  local -a JRC JLOG JREC
  local JV="" JWHY=""
  ST_D=$(mktemp -d "${TMPDIR:-/tmp}/csd-st.XXXXXX") || { echo "FAIL self-test: mktemp -d"; FINAL=1; exit 1; }
  TMP_DIR="$ST_D"
  msdir="$ST_D/ms"; mkdir "$msdir"
  check() {
    if [[ "$2" == "$3" ]]; then oks=$((oks + 1)); echo "ok $1"
    else fails=$((fails + 1)); echo "FAIL $1: got [$2] want [$3]"
    fi
  }
  rec() { printf '%s\n' "$2" | awk -v fns="$1" "$CODESIZE_AWK" | tr '\t\n' '|;'; }

  IFS= read -r -d '' H <<'EOF' || true
v8-version,14,6,202,34,-node.28,0
v8-platform,macos,macos
new,CodeRange,0x117bac000,0
code-creation,Builtin,3,3621,0x1065d4000,796,DeoptimizationEntry_Eager
code-creation,BytecodeHandler,0,9102,0x106762680,28,Wide
code-creation,Script,10,98050,0x3bcd762b4fc8,103, file:///w/drv.mjs:1:1,0x29a78805a8a0,~
code-creation,JS,10,98100,0x3bcd762b5000,20,hot node:internal/foo:1:1,0x29a78805a8b0,~
code-creation,JS,13,98110,0x114c09000,999,hot node:internal/foo:1:1,0x29a78805a8b0,*'
EOF
  H=${H%$'\n'}

  B1="$H"$'\n''code-creation,JS,10,98500,0x3bcd762b6900,38,hot file:///w/drv.mjs:2:13,0x29a78805a970,~'
  B1="$B1"$'\n''code-creation,JS,12,98600,0x114c09680,824,hot file:///w/drv.mjs:2:13,0x29a78805a970,+'$SQ
  B1="$B1"$'\n''code-creation,JS,13,98700,0x114c09b40,596,hot file:///w/drv.mjs:2:13,0x29a78805a970,*'$SQ

  # Node 22/24 CodeKind shift (9/11/12 instead of 10/12/13)
  B2=$(printf '%s\n' "$B1" | sed -e 's/,Script,10,/,Script,9,/g' -e 's/,JS,10,/,JS,9,/g' -e 's/,JS,12,/,JS,11,/g' -e 's/,JS,13,/,JS,12,/g')
  check "records: normal hot fn ignores node:internal and parses ~, +', *'" \
    "$(rec hot "$B1")" \
    "C hot|ignition|ignition|38|drv.mjs:2:13|0;C hot|maglev|maglev|824|drv.mjs:2:13|1;C hot|turbo|turbo|596|drv.mjs:2:13|1;"
  check "cross-Node: shifted numeric CodeKind (\$3: 9/11/12 vs 10/12/13) yields identical records" \
    "$(rec hot "$B2")" "$(rec hot "$B1")"

  # Q-CSD-KEY (a) tripwire: same base tier with two different $3, or same $3 with two different base tiers -> X
  BAD_K1="$B1"$'\n''code-creation,JS,14,98750,0x114c09c00,596,hot file:///w/drv.mjs:2:13,0x29a78805a970,*'
  BAD_K2="$H"$'\n''code-creation,JS,12,98600,0x114c09680,824,hot file:///w/drv.mjs:2:13,0x29a78805a970,+'
  BAD_K2="$BAD_K2"$'\n''code-creation,JS,12,98700,0x114c09b40,596,hot file:///w/drv.mjs:2:13,0x29a78805a970,^'
  check "tripwire Q-CSD-KEY(a): base tier with two numeric kinds -> X" \
    "$(printf '%s\n' "$BAD_K1" | awk -v fns=hot "$CODESIZE_AWK" | awk '/^X / { print }')" \
    "X tier-marker/CodeKind conflict: turbo seen with kinds 13 and 14 at log line 12"
  check "tripwire Q-CSD-KEY(a): one numeric kind for two base tiers -> X" \
    "$(printf '%s\n' "$BAD_K2" | awk -v fns=hot "$CODESIZE_AWK" | awk '/^X / { print }')" \
    "X tier-marker/CodeKind conflict: kind 12 seen for both maglev and sparkplug at log line 10"

  OSR="$H"$'\n''code-creation,JS,12,98800,0x114c0a100,780,loop file:///tmp/a\x2Cb/drv.mjs:5:1,0x29a78805aa10,o+'
  OSR="$OSR"$'\n''code-creation,JS,13,98900,0x114c0a500,552,loop file:///tmp/a\x2Cb/drv.mjs:5:1,0x29a78805aa10,o*'
  check "OSR markers + comma-escaped dir path" \
    "$(rec loop "$OSR")" \
    "C loop|maglev-osr|maglev|780|drv.mjs:5:1|0;C loop|turbo-osr|turbo|552|drv.mjs:5:1|0;"

  # D2: order-independent prefix matching for 'get,get value' vs 'get value,get'
  BOTH_GET="$H"$'\n''code-creation,JS,12,98940,0x114c0a600,340,get file:///w/g.mjs:6:13,0x29a78805ab00,+'$SQ
  BOTH_GET="$BOTH_GET"$'\n''code-creation,JS,13,98950,0x114c0a800,220,get value file:///w/g.mjs:4:12,0x29a78805ab10,*'$SQ
  check "D2 fn order: 'get,get value' matches BOTH" \
    "$(rec 'get,get value' "$BOTH_GET")" \
    "C get|maglev|maglev|340|g.mjs:6:13|1;C get value|turbo|turbo|220|g.mjs:4:12|1;"
  check "D2 fn order: 'get value,get' matches BOTH identically" \
    "$(rec 'get value,get' "$BOTH_GET")" \
    "C get|maglev|maglev|340|g.mjs:6:13|1;C get value|turbo|turbo|220|g.mjs:4:12|1;"
  check "D2 exact prefix: 'get' alone ignores 'get value'" \
    "$(rec get "$BOTH_GET")" \
    "C get|maglev|maglev|340|g.mjs:6:13|1;"

  # Defect 1 (RECHECK): two files defining `hot` -> A record -> judge_side NO-VERDICT (NEVER SAME!)
  AMBIG="$H"$'\n''code-creation,JS,12,98600,0x114c09680,824,hot file:///w/a.mjs:3:13,0x29a78805a970,+'$SQ
  AMBIG="$AMBIG"$'\n''code-creation,JS,12,98700,0x114c09b40,1144,hot file:///w/b.mjs:3:13,0x29a78805a990,+'$SQ
  local AMBIG_REC; AMBIG_REC=$(printf '%s\n' "$AMBIG" | awk -v fns=hot "$CODESIZE_AWK")
  JRC=(0 0); JLOG=("" ""); JREC=("$AMBIG_REC" "$AMBIG_REC")
  judge_side hot "turbo,maglev" "$msdir" ambig
  check "Defect 1: same-named fn in two files -> NO-VERDICT (ambiguous)" "$JV:$JWHY" \
    "NO-VERDICT:ambiguous function name 'hot' in run 1: compiled at 2 definition locations (a.mjs:3:13, b.mjs:3:13)"

  # D8: DIFF output has NO raw TAB characters + churn multiset retains both Maglev compiles
  DEOPT="$H"$'\n''code-creation,JS,12,99000,0x114c0b000,348,churn file:///w/d.mjs:1:1,0x29a78805ac00,+'
  DEOPT="$DEOPT"$'\n''code-creation,JS,13,99010,0x114c0b200,204,churn file:///w/d.mjs:1:1,0x29a78805ac00,*'
  DEOPT="$DEOPT"$'\n''code-creation,JS,12,99020,0x114c0b400,392,churn file:///w/d.mjs:1:1,0x29a78805ac00,+'
  local diff_out
  diff_out=$(awk "$MSDIFF_AWK" <(v_ms "$(printf '%s\n' "$B1" | awk -v fns=churn "$CODESIZE_AWK")" churn "turbo,maglev") \
    <(v_ms "$(printf '%s\n' "$DEOPT" | awk -v fns=churn "$CODESIZE_AWK")" churn "turbo,maglev") | sort -k3)
  local has_tab=0
  case "$diff_out" in *$'\t'*) has_tab=1 ;; esac
  check "D8 + churn multiset: space-formatted DIFF lines (0 raw TABs, both Maglev sizes kept)" \
    "$has_tab:$(printf '%s' "$diff_out" | tr '\n' ';')" \
    "0:  before=0 after=1  churn  maglev  348B;  before=0 after=1  churn  maglev  392B;  before=0 after=1  churn  turbo  204B"

  # D9: null-control catches run 1 != run 2 via file cmp -s
  local R1_REC R2_REC
  R1_REC=$(printf '%s\n' "$B1" | awk -v fns=hot "$CODESIZE_AWK")
  R2_REC=$(printf '%s\n' "$B1" | sed 's/,824,/,900,/' | awk -v fns=hot "$CODESIZE_AWK")
  JRC=(0 0); JLOG=("" ""); JREC=("$R1_REC" "$R2_REC")
  judge_side hot "turbo,maglev" "$msdir" nctl
  check "D9 nullctl: run 2 size drift -> NO-VERDICT" "$JV:${JWHY%% (*}" \
    "NO-VERDICT:null control: run 2 differs from run 1"

  # Sparkplug excluded from default turbo,maglev verdict
  local SP="$B1"$'\n''code-creation,JS,11,98650,0x114c09800,616,hot file:///w/drv.mjs:2:13,0x29a78805a970,^'
  check "Sparkplug excluded from default turbo,maglev verdict" \
    "$(v_ms "$(printf '%s\n' "$SP" | awk -v fns=hot "$CODESIZE_AWK")" hot "turbo,maglev")" \
    "$(v_ms "$(printf '%s\n' "$B1" | awk -v fns=hot "$CODESIZE_AWK")" hot "turbo,maglev")"

  BAD_MK="$H"$'\n''code-creation,JS,13,99100,0x114c0b600,100,hot file:///w/d.mjs:1:1,0x29a78805ac10,?'
  BAD_NF="$H"$'\n''code-creation,JS,13,99100,0x114c0b600,100,hot file:///w/d.mjs:1:1'
  BAD_EV="$H"$'\n''weird-event,1,2,3'
  check "fail-closed: unknown tier marker -> X" "$(rec hot "$BAD_MK")" "X unknown code tier marker ? at log line 9;"
  check "fail-closed: JS code-creation NF != 9 -> X" "$(rec hot "$BAD_NF")" "X JS code-creation not 9 fields (JS, NF=7) at log line 9;"
  check "fail-closed: unknown event -> X" "$(rec hot "$BAD_EV")" "X unknown event weird-event at log line 9;"

  JRC=(0 0); JLOG=("" "")
  local COLD="$H"$'\n''code-creation,JS,10,98500,0x3bcd762b6900,38,cold file:///w/drv.mjs:2:13,0x29a78805a970,~'
  local COLD_REC; COLD_REC=$(printf '%s\n' "$COLD" | awk -v fns="cold,ghost" "$CODESIZE_AWK")
  JREC=("$COLD_REC" "$COLD_REC")
  judge_side cold "turbo,maglev" "$msdir" guard1
  check "guard: ignition-only fn -> NO-VERDICT with warmup hint" "$JV:${JWHY%%:*}" \
    "NO-VERDICT:no compile of 'cold' in selected tiers (turbo,maglev) in run 1 (saw ignition bytecode x1"
  judge_side ghost "turbo,maglev" "$msdir" guard2
  check "guard: never-compiled fn -> NO-VERDICT missing hint" "$JV:$JWHY" \
    "NO-VERDICT:no compile of 'ghost' in run 1 (no such name or never called)"

  GOT=$(printf '  --turbolev (use maglev)\n        type: bool  default: --no-turbolev\n  --turbolev-future (exp)\n        type: bool  default: --no-turbolev-future\n' | awk "$TURBOLEV_AWK")
  check "turbolev check: both off" "$GOT" "off off"
  GOT=$(printf '  --turbolev (use maglev)\n        type: bool  default: --turbolev\n' | awk "$TURBOLEV_AWK")
  check "turbolev check: default on detected" "$GOT" "on absent"

  # D3: LEDGER law 4 verbatim v8fl_ok allowlist checks
  V8FL_TAB=$'\nmaglev bool\nmax-inlined-bytecode-size int\nsparkplug-filter string\nlog-code bool\nturbolev bool\n'
  local ok_m=0 ok_i=0 bad_ev=0 bad_ins=0 bad_unk=0 bad_str=0 bad_log=0 bad_neg=0
  v8fl_ok --no-maglev && ok_m=1
  v8fl_ok --max-inlined-bytecode-size=100 && ok_i=1
  v8fl_ok --eval || bad_ev=1
  v8fl_ok --inspect || bad_ins=1
  v8fl_ok --not-a-v8-flag || bad_unk=1
  v8fl_ok --sparkplug-filter=hot || bad_str=1
  v8fl_ok --log-code || bad_log=1
  v8fl_ok --no-max-inlined-bytecode-size=100 || bad_neg=1
  check "D3 v8fl_ok allowlist: valid bool/int accepted; node opts, unknown, string, log, neg-int refused" \
    "$ok_m$ok_i$bad_ev$bad_ins$bad_unk$bad_str$bad_log$bad_neg" "11111111"

  # CLI refusal checks (D4 mode conflict both orders, D5 empty/trailing-comma tiers & fn, D6 newline in driver path)
  local dummy="$ST_D/d.mjs"; printf '1;\n' >"$dummy"
  local rc=0 msg=""
  msg=$(/bin/bash "$SELF" --report --max hot=100 --node-version v26.8.2 --platform-arch darwin-arm64 "$dummy" 2>&1) || rc=$?
  check "D4: --report --max refused exit 2" "$rc:${msg%%$'\n'*}" "2:code-size-diff: --report and --max are mutually exclusive"
  rc=0; msg=$(/bin/bash "$SELF" --max hot=100 --report --node-version v26.8.2 --platform-arch darwin-arm64 "$dummy" 2>&1) || rc=$?
  check "D4: --max --report refused exit 2" "$rc:${msg%%$'\n'*}" "2:code-size-diff: --report and --max are mutually exclusive"
  rc=0; msg=$(/bin/bash "$SELF" --report --fn hot --tiers "" "$dummy" 2>&1) || rc=$?
  check "D5: --tiers '' refused cleanly (no set -u abort)" "$rc:${msg%%$'\n'*}" "2:code-size-diff: --tiers must not be empty"
  rc=0; msg=$(/bin/bash "$SELF" --report --fn hot --tiers "turbo," "$dummy" 2>&1) || rc=$?
  check "D5: --tiers 'turbo,' trailing comma refused" "$rc:${msg%%$'\n'*}" "2:code-size-diff: --tiers must not have an empty entry"
  rc=0; msg=$(/bin/bash "$SELF" --report --fn "hot," "$dummy" 2>&1) || rc=$?
  check "D5: --fn 'hot,' trailing comma refused" "$rc:${msg%%$'\n'*}" "2:code-size-diff: --fn must not have an empty entry"
  local nldir="$ST_D/x"$'\n'"VERDICT SAME"
  mkdir -p "$nldir"; printf '1;\n' >"$nldir/d.mjs"
  rc=0; msg=$(/bin/bash "$SELF" --report --fn hot "$nldir/d.mjs" 2>&1) || rc=$?
  local forged=0; case "$msg" in *"VERDICT SAME"*) forged=1 ;; esac
  check "D6: newline in existing DRIVER path refused exit 2 with 0 forged lines" "$rc:$forged" "2:0"
  rc=0; msg=$(/bin/bash "$SELF" --report --fn hot "$nldir/missing.mjs" 2>&1) || rc=$?
  forged=0; case "$msg" in *"VERDICT SAME"*) forged=1 ;; esac
  check "D6: newline in missing DRIVER path refused before readability error (0 forged lines)" "$rc:$forged" "2:0"

  # --- v4 self-test rows (A2, A3 M3b/M3c/M4b/M5, A4 M1b/M1c, A6 N7, A7, C1, C2, C5) ---
  # Stub node that logs each invocation to $STUB_COUNT and writes canned --log-code logs.
  local stub_dir="$ST_D/stub" stub_node="$ST_D/stub/node" stub_cnt="$ST_D/stub/spawns.log" stub_run="$ST_D/stub/run.idx"
  mkdir -p "$stub_dir"
  : >"$stub_cnt"
  cat >"$stub_node" <<'STUBEOF'
#!/usr/bin/env bash
printf 'spawn %s\n' "$*" >> "${CSD_STUB_LOG:?}"
if [[ "${1:-}" == "-p" ]]; then
  printf 'v26.8.2 darwin-arm64\n'
  exit 0
fi
if [[ "${1:-}" == "--v8-options" ]]; then
  printf '  --maglev (enable maglev)\n        type: bool  default: --maglev\n'
  printf '  --turbolev (enable turbolev)\n        type: bool  default: --no-turbolev\n'
  printf '  --turbolev-future (enable turbolev future)\n        type: bool  default: --no-turbolev-future\n'
  exit 0
fi
lf=""
for arg in "$@"; do
  case "$arg" in --logfile=*) lf="${arg#--logfile=}" ;; esac
done
if [[ -n "$lf" ]]; then
  d=$(dirname -- "$lf"); b=$(basename -- "$lf")
  idx=0
  if [[ -f "${CSD_STUB_RUN:-}" ]]; then idx=$(cat "$CSD_STUB_RUN"); fi
  idx=$((idx + 1))
  if [[ -n "${CSD_STUB_RUN:-}" ]]; then printf '%s\n' "$idx" > "$CSD_STUB_RUN"; fi
  sz=824
  if [[ "${CSD_STUB_DRIFT_RUN:-0}" == "$idx" ]]; then sz=999; fi
  {
    printf 'v8-version,14,6,202,34,-node.28,0\n'
    printf 'v8-platform,macos,macos\n'
    printf 'code-creation,Builtin,3,100,0x1000,64,StubA\n'
    printf 'code-creation,JS,10,200,0x2000,38,hot file:///w/d.mjs:2:13,0x3000,~\n'
    printf "code-creation,JS,12,300,0x2100,%s,hot file:///w/d.mjs:2:13,0x3000,+'" "$sz"; printf '\n'
    printf "code-creation,JS,13,400,0x2200,596,hot file:///w/d.mjs:2:13,0x3000,*'\n"
  } > "$d/isolate-0x7500000000-$$-$b"
fi
exit 0
STUBEOF
  chmod +x "$stub_node"
  stub_spawns() { wc -l < "$stub_cnt" | tr -d ' '; }

  # A2 (N2) + A3 (M3c): empty separate value AND empty --opt= refused with 0 spawns for EVERY value option
  local opt a2_bad=0 m3c_bad=0
  for opt in --fn --tiers --max --node-version --platform-arch --runs --node --v8-flags --out; do
    : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" "$opt" "" "$dummy" 2>&1) || rc=$?
    if [[ "$opt" == "--node" ]]; then
      : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "" --report --fn hot "$dummy" 2>&1) || rc=$?
    fi
    [[ "$rc:$(stub_spawns):${msg%%$'\n'*}" == "2:0:code-size-diff: $opt must not be empty" ]] || a2_bad=$((a2_bad + 1))
    : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" "${opt}=" "$dummy" 2>&1) || rc=$?
    if [[ "$opt" == "--node" ]]; then
      : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node= --report --fn hot "$dummy" 2>&1) || rc=$?
    fi
    [[ "$rc:$(stub_spawns):${msg%%$'\n'*}" == "2:0:code-size-diff: $opt must not be empty" ]] || m3c_bad=$((m3c_bad + 1))
  done
  check "A2/N2: empty separate '' refused (0 spawns) for all 9 value options" "$a2_bad" "0"
  check "A3/M3c: empty --opt= refused (0 spawns) for all 9 value options" "$m3c_bad" "0"

  # D5 gap (--max trailing comma, RECHECK2 s1)
  : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --max 'hot=100,' --node-version v26.8.2 --platform-arch darwin-arm64 "$dummy" 2>&1) || rc=$?
  check "D5: --max 'hot=100,' trailing comma refused (0 spawns)" "$rc:$(stub_spawns):${msg%%$'\n'*}" "2:0:code-size-diff: --max must not have an empty entry"

  # A3 M3b: duplicate --fn refused with 0 spawns
  : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --report --fn hot --fn hot "$dummy" 2>&1) || rc=$?
  check "A3/M3b: duplicate --fn refused exit 2 with 0 spawns" "$rc:$(stub_spawns):${msg%%$'\n'*}" "2:0:code-size-diff: --fn given more than once"

  # A3 M4b: resolved --out newline via symlink/.. walk refused BEFORE spawn and BEFORE mkdir (matches lib/common.sh nl_dir T5b)
  local nl_out_tgt="$ST_D/nl"$'\n'"out/a/b" nl_lnk="$ST_D/s36"
  mkdir -p "$nl_out_tgt"
  ln -s "$nl_out_tgt" "$nl_lnk"
  : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --report --fn hot --out "$nl_lnk/../c" "$dummy" 2>&1) || rc=$?
  local sub_made=0; [[ -e "$ST_D/nl"$'\n'"out/a/c" || -e "$ST_D/c" ]] && sub_made=1
  check "A3/M4b: resolved --out newline via symlink/.. refused before spawn/mkdir" "$rc:$(stub_spawns):$sub_made:${msg%%$'\n'*}" \
    "2:0:0:code-size-diff: --out (resolved): a newline or a CR is not allowed (it would forge report lines)"

  # A3 M5: default 3-run null control end-to-end (run 3 drifts while run 1 == run 2 -> NO-VERDICT)
  : >"$stub_cnt"; rm -f "$stub_run"; rc=0
  msg=$(CSD_STUB_LOG="$stub_cnt" CSD_STUB_RUN="$stub_run" CSD_STUB_DRIFT_RUN=3 /bin/bash "$SELF" --node "$stub_node" --report --fn hot "$dummy" 2>&1) || rc=$?
  local m5_hit=0; case "$msg" in *"null control: run 3 differs from run 1"*) m5_hit=1 ;; esac
  check "A3/M5: default 3-run null control catches run 3 drift end-to-end" "$rc:$m5_hit" "2:1"

  # A4 M1b: two index.mjs in different directories -> ambiguous NO-VERDICT (kills basename-only keying)
  local AMBIG_IDX AMBIG_IDX_REC
  AMBIG_IDX="$H"$'\n''code-creation,JS,12,98600,0x114c09680,824,hot file:///w/dir1/index.mjs:3:13,0x29a78805a970,+'$SQ
  AMBIG_IDX="$AMBIG_IDX"$'\n''code-creation,JS,12,98700,0x114c09b40,1144,hot file:///w/dir2/index.mjs:3:13,0x29a78805a990,+'$SQ
  AMBIG_IDX_REC=$(printf '%s\n' "$AMBIG_IDX" | awk -v fns=hot "$CODESIZE_AWK")
  JRC=(0 0); JLOG=("" ""); JREC=("$AMBIG_IDX_REC" "$AMBIG_IDX_REC")
  judge_side hot "turbo,maglev" "$msdir" ambig_idx
  check "A4/M1b: two index.mjs in different dirs -> NO-VERDICT (ambiguous)" "$JV:${JWHY%% (*}" \
    "NO-VERDICT:ambiguous function name 'hot' in run 1: compiled at 2 definition locations"

  # A4 M1c: two nested hot functions in one file -> ambiguous NO-VERDICT (kills :line:col stripping)
  local AMBIG_NEST AMBIG_NEST_REC
  AMBIG_NEST="$H"$'\n''code-creation,JS,12,98600,0x114c09680,824,hot file:///w/same.mjs:3:13,0x29a78805a970,+'$SQ
  AMBIG_NEST="$AMBIG_NEST"$'\n''code-creation,JS,12,98700,0x114c09b40,1144,hot file:///w/same.mjs:11:13,0x29a78805a990,+'$SQ
  AMBIG_NEST_REC=$(printf '%s\n' "$AMBIG_NEST" | awk -v fns=hot "$CODESIZE_AWK")
  JRC=(0 0); JLOG=("" ""); JREC=("$AMBIG_NEST_REC" "$AMBIG_NEST_REC")
  judge_side hot "turbo,maglev" "$msdir" ambig_nest
  check "A4/M1c: two nested hot in one file -> NO-VERDICT (ambiguous)" "$JV:${JWHY%% (*}" \
    "NO-VERDICT:ambiguous function name 'hot' in run 1: compiled at 2 definition locations"

  # A6 (N7): --turbolev exact-name refusal runs BEFORE node -p spawn (0 spawns, law 3)
  : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --v8-flags "--turbolev" --report --fn hot "$dummy" 2>&1) || rc=$?
  local tl_hit=0; case "$msg" in *"Turbolev logs identical"*) tl_hit=1 ;; esac
  check "A6/N7: --turbolev refused exit 2 BEFORE any node spawn (0 spawns)" "$rc:$(stub_spawns):$tl_hit" "2:0:1"

  # C1 (SD-neon-5): --out SYMLINK/ and --out SYMLINK/. refused exit 2 with 0 spawns
  local real_out="$ST_D/real_out" sym_out="$ST_D/sym_out" real_out2="$ST_D/real_out2" sym_out2="$ST_D/sym_out2"
  mkdir -p "$real_out" "$real_out2"
  ln -s "$real_out" "$sym_out"
  ln -s "$real_out2" "$sym_out2"
  : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --report --fn hot --out "$sym_out/" "$dummy" 2>&1) || rc=$?
  local sym_hit=0; case "$msg" in *"is a symlink (refused)"*) sym_hit=1 ;; esac
  check "C1/SD-neon-5: --out SYMLINK/ refused exit 2 with 0 spawns" "$rc:$(stub_spawns):$sym_hit" "2:0:1"
  : >"$stub_cnt"; rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --report --fn hot --out "$sym_out2/." "$dummy" 2>&1) || rc=$?
  sym_hit=0; case "$msg" in *"is a symlink (refused)"*) sym_hit=1 ;; esac
  check "C1/SD-neon-5: --out SYMLINK/. refused exit 2 with 0 spawns" "$rc:$(stub_spawns):$sym_hit" "2:0:1"

  # C2 (SD-neon-6): driver in a directory named '-' runs cleanly (no cd - OLDPWD trap)
  local dash_work="$ST_D/dash_work"
  mkdir -p "$dash_work/-"
  printf '1;\n' > "$dash_work/-/d.mjs"
  : >"$stub_cnt"; rm -f "$stub_run"; rc=0
  msg=$(cd "$dash_work" && OLDPWD=/nonexistent_csd_oldpwd CSD_STUB_LOG="$stub_cnt" CSD_STUB_RUN="$stub_run" /bin/bash "$SELF" --node "$stub_node" --runs 2 --report --fn hot -- -/d.mjs 2>&1) || rc=$?
  local dash_ok=0; case "$msg" in *"VERDICT OK"*) dash_ok=1 ;; esac
  check "C2/SD-neon-6: driver in '-' dir runs cleanly (VERDICT OK, rc 0)" "$rc:$dash_ok" "0:1"
  : >"$stub_cnt"; rm -f "$stub_run"; rc=0; msg=$(cd "$dash_work" && OLDPWD=/nonexistent_csd_oldpwd CSD_STUB_LOG="$stub_cnt" CSD_STUB_RUN="$stub_run" /bin/bash "$SELF" --node "$stub_node" --runs 2 --fn hot -- -/d.mjs -/d.mjs 2>&1) || rc=$?; dash_ok=0; case "$msg" in *"VERDICT SAME"*) dash_ok=1 ;; esac; check "C2/SD-neon-6: diff mode, both drivers in '-' dir -> SAME rc 0" "$rc:$dash_ok" "0:1"

  # C5 (SD-neon-8): unknown option did-you-mean hint + -h documents trace flags
  rc=0; msg=$(/bin/bash "$SELF" --outt /tmp/x "$dummy" 2>&1) || rc=$?
  local h1=0; case "$msg" in *"(did you mean --out?)"*) h1=1 ;; esac
  check "C5: unknown --outt prints did-you-mean --out hint" "$rc:$h1" "2:1"
  rc=0; msg=$(/bin/bash "$SELF" --zzz "$dummy" 2>&1) || rc=$?
  local h2=0; case "$msg" in *"did you mean"*) h2=1 ;; esac
  check "C5: unknown --zzz prints no hint" "$rc:$h2" "2:0"
  rc=0; msg=$(/bin/bash "$SELF" -h 2>&1) || rc=$?
  local hh=0
  case "$msg" in *"--log-code"*"--no-concurrent-sparkplug"*"--turbolev"*) hh=1 ;; esac
  check "C5: -h documents trace flags and Turbolev refusal (exit 2)" "$rc:$hh" "2:1"

  # A7: stub-node exit-2 checks assert reason lines (platform-arch mismatch, --inspect allowlist)
  rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --max hot=1000 --node-version v26.8.2 --platform-arch linux-x64 "$dummy" 2>&1) || rc=$?
  local pa_hit=0; case "$msg" in *"platform-arch mismatch: got darwin-arm64, want linux-x64"*) pa_hit=1 ;; esac
  check "A7: --platform-arch mismatch asserts reason text" "$rc:$pa_hit" "2:1"
  rc=0; msg=$(CSD_STUB_LOG="$stub_cnt" /bin/bash "$SELF" --node "$stub_node" --v8-flags "--inspect" --report --fn hot "$dummy" 2>&1) || rc=$?
  local ins_hit=0; case "$msg" in *"--v8-flags must not set --inspect:"*) ins_hit=1 ;; esac
  check "A7: --inspect refusal asserts reason text" "$rc:$ins_hit" "2:1"

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
# CLI PARSING & VALIDATION (uses lib/args.sh need(); refuses duplicates, conflicts, empty items, NL/CR)
# =============================================================================================
usage() {
  cat >&2 <<'EOF'
code-size-diff.prototype.sh -- V8 compiled machine-code size diff / report / gate (--log-code)

Usage:
  code-size-diff.prototype.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER
  code-size-diff.prototype.sh [opts] --report --fn LIST DRIVER
  code-size-diff.prototype.sh [opts] --max fn=N[,fn=N] --node-version vX.Y.Z --platform-arch OS-ARCH DRIVER
  code-size-diff.prototype.sh --self-test

Options:
  --fn LIST                comma-separated short function names (e.g. get,get\ value); empty/duplicate/trailing comma refused
  --tiers LIST             subset of turbo,maglev,sparkplug,ignition (default: turbo,maglev); empty/duplicate/trailing comma refused
  --report                 single-driver mode: print sizes and exit 0 OK / 2 NO-VERDICT (mutually exclusive with --max)
  --max fn=N[,fn=N]        gate mode: fail (exit 1 OVER) if max selected-tier size > N (mutually exclusive with --report/--fn)
  --node-version vX.Y.Z    required with --max (optional elsewhere); exact `node --version` match
  --platform-arch OS-ARCH  required with --max (optional elsewhere); exact `process.platform + "-" + process.arch`
                           match (e.g. darwin-arm64, linux-x64). Mismatch -> exit 2 NO-VERDICT.
  --runs N                 runs per side, 2..20 (default: 3); run 1 vs runs 2..N is the null control
  --node BIN               node binary (default: $NODE or node), resolved once to an absolute path
  --v8-flags STR           extra V8 tuning flags; traces run with --log-code --no-concurrent-recompilation
                           --no-concurrent-sparkplug --no-node-snapshot. Validated against `node --v8-options`
                           allowlist (bool --flag / --no-flag, numeric --flag=N; log/trace/print/prof/dump/
                           snapshot/file/string flags, node options, *concurrent-recompilation* / *concurrent-sparkplug* / *stress-concurrent-inlining*, and --turbolev /
                           --turbolev-future refused exit 2; --turbolev refused before any node spawn).
  --out DIR                keep DIR/report.txt and DIR/raw/<side>/run.<k>.{log,out}; symlinks (incl. trailing
                           / or /.), hard-linked report.txt, non-empty DIR/raw, input collisions, and NL/CR
                           paths (raw or resolved) are refused exit 2 before any spawn or write
  --self-test              run canned + stub-node + CLI refusal checks (exit 0 / 1); takes no other argument
  -h, --help               this text (exit 2)

Verdict:
  0 SAME / OK / WITHIN     identical code-size multiset in selected tiers (diff), or all targets OK / <= max
  1 DIFF / OVER            multiset differs for >= 1 target (diff), or max selected-tier size > N (gate)
  2 NO-VERDICT             refusal, unreadable/unknown log record (X), ambiguous target fn (>1 location, A),
                           null-control drift, missing compile evidence, version/arch mismatch, or default-on Turbolev
EOF
  DIED=1; exit 2
}

OPTS="--fn --tiers --report --max --node-version --platform-arch --runs --node --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }

MODE="diff"
SEEN_REPORT=0; SEEN_MAX=0; SEEN_FN=0; SEEN_TIERS=0; SEEN_VER=0; SEEN_PA=0
SEEN_RUNS=0; SEEN_NODE=0; SEEN_V8=0; SEEN_OUT=0
FNLIST=""
TIERS="turbo,maglev"
MAXSPEC=""
WANT_VER=""
WANT_PA=""
RUNS=3
NODE_BIN="${NODE:-node}"
V8FLAGS=""
OUT=""
POS=()

while [[ $# -gt 0 ]]; do
  a="$1"; v=""
  if [[ "$a" == --*=* ]]; then
    v=${a#*=}; a=${a%%=*}
    case "$a" in
      --help|--self-test|--report) die "$a takes no =value" ;;
      *) [[ -n "$v" ]] || die "$a must not be empty" ;;
    esac
  fi
  nl_refuse "option name" "$a"
  case "$a" in
    -h|--help) usage ;;
    --self-test) [[ $# -eq 1 && ${#POS[@]} -eq 0 && $SEEN_REPORT$SEEN_MAX$SEEN_FN$SEEN_TIERS$SEEN_VER$SEEN_PA$SEEN_RUNS$SEEN_NODE$SEEN_V8$SEEN_OUT == 0000000000 ]] || die "--self-test takes no other argument"; self_test ;;
    --report) [[ $SEEN_REPORT -eq 0 ]] || die "--report given more than once"; SEEN_REPORT=1; shift ;;
    --fn) [[ $SEEN_FN -eq 0 ]] || die "--fn given more than once"; SEEN_FN=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; FNLIST="$v"; shift ;;
    --tiers) [[ $SEEN_TIERS -eq 0 ]] || die "--tiers given more than once"; SEEN_TIERS=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; TIERS="$v"; shift ;;
    --max) [[ $SEEN_MAX -eq 0 ]] || die "--max given more than once"; SEEN_MAX=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; MAXSPEC="$v"; shift ;;
    --node-version) [[ $SEEN_VER -eq 0 ]] || die "--node-version given more than once"; SEEN_VER=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; WANT_VER="$v"; shift ;;
    --platform-arch) [[ $SEEN_PA -eq 0 ]] || die "--platform-arch given more than once"; SEEN_PA=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; WANT_PA="$v"; shift ;;
    --runs) [[ $SEEN_RUNS -eq 0 ]] || die "--runs given more than once"; SEEN_RUNS=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; RUNS="$v"; shift ;;
    --node) [[ $SEEN_NODE -eq 0 ]] || die "--node given more than once"; SEEN_NODE=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; NODE_BIN="$v"; shift ;;
    --v8-flags) [[ $SEEN_V8 -eq 0 ]] || die "--v8-flags given more than once"; SEEN_V8=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; V8FLAGS="$v"; shift ;;
    --out) [[ $SEEN_OUT -eq 0 ]] || die "--out given more than once"; SEEN_OUT=1; need "$@" || shift; [[ -n "$v" ]] || die "$a must not be empty"; OUT="$v"; shift ;;
    --) shift; while [[ $# -gt 0 ]]; do POS+=("$1"); shift; done ;;
    -*) die "unknown option: $a$(hint "$a") (see --help)" ;;
    *) POS+=("$1"); shift ;;
  esac
done

# D4: explicit mode conflict checks (order-independent!)
if [[ $SEEN_REPORT -eq 1 && $SEEN_MAX -eq 1 ]]; then
  die "--report and --max are mutually exclusive"
fi
if [[ $SEEN_REPORT -eq 1 ]]; then MODE="report"
elif [[ $SEEN_MAX -eq 1 ]]; then MODE="gate"
fi

# D6: newline / CR refusals on every option value and PWD BEFORE any spawn or write (LEDGER law 3)
nl_refuse "the cwd" "$PWD"
nl_refuse "--fn" "$FNLIST"
nl_refuse "--tiers" "$TIERS"
nl_refuse "--max" "$MAXSPEC"
nl_refuse "--node-version" "$WANT_VER"
nl_refuse "--platform-arch" "$WANT_PA"
nl_refuse "--runs" "$RUNS"
nl_refuse "--node" "$NODE_BIN"
nl_refuse "--v8-flags" "$V8FLAGS"
nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}
[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"

RE_INT='^[0-9]+$'
[[ "$RUNS" =~ $RE_INT && "$RUNS" -ge 2 && "$RUNS" -le 20 ]] || die "--runs must be 2..20, got '$RUNS'"

# D5: non-empty + no leading/trailing/double comma on --tiers
[[ -n "$TIERS" ]] || die "--tiers must not be empty"
case ",$TIERS," in *,,*) die "--tiers must not have an empty entry" ;; esac
IFS=',' read -r -a TIER_ARR <<< "$TIERS"
SEEN_T=","
for t in "${TIER_ARR[@]}"; do
  case "$t" in
    turbo|maglev|sparkplug|ignition) ;;
    *) die "--tiers accepts only turbo,maglev,sparkplug,ignition (got '$t')" ;;
  esac
  [[ "$SEEN_T" != *",$t,"* ]] || die "--tiers has duplicate '$t'"
  SEEN_T="${SEEN_T}${t},"
done

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
PA_RE='^[a-z0-9]+-[a-z0-9_]+$'
TARGETS=()
MAX_VALS=()
SEEN_F=","
if [[ "$MODE" == "gate" ]]; then
  [[ $SEEN_FN -eq 0 ]] || die "--max and --fn are mutually exclusive"
  [[ -n "$MAXSPEC" ]] || die "--max must not be empty"
  case ",$MAXSPEC," in *,,*) die "--max must not have an empty entry" ;; esac
  [[ -n "$WANT_VER" ]] || die "--max requires --node-version vX.Y.Z"
  [[ -n "$WANT_PA" ]] || die "--max requires --platform-arch OS-ARCH (e.g. darwin-arm64, linux-x64)"
  IFS=',' read -r -a PAIR_ARR <<< "$MAXSPEC"
  for pair in "${PAIR_ARR[@]}"; do
    [[ "$pair" == *=* ]] || die "--max entry must be fn=N, got '$pair'"
    fn=${pair%%=*}; lim=${pair#*=}
    [[ "$fn" =~ $FN_RE ]] || die "invalid function name in --max: '$fn'"
    [[ "$SEEN_F" != *",$fn,"* ]] || die "duplicate function name in --max: '$fn'"
    SEEN_F="${SEEN_F}${fn},"
    [[ "$lim" =~ $RE_INT && ${#lim} -le 9 ]] || die "invalid max byte limit for '$fn': '$lim' (want 1..9 digits)"
    TARGETS+=("$fn"); MAX_VALS+=("$lim")
    FNLIST="${FNLIST:+$FNLIST,}$fn"
  done
else
  [[ -n "$FNLIST" ]] || die "--fn LIST is required"
  case ",$FNLIST," in *,,*) die "--fn must not have an empty entry" ;; esac
  IFS=',' read -r -a TARGETS <<< "$FNLIST"
  for fn in "${TARGETS[@]}"; do
    [[ "$fn" =~ $FN_RE ]] || die "invalid function name in --fn: '$fn'"
    [[ "$SEEN_F" != *",$fn,"* ]] || die "duplicate function name in --fn: '$fn'"
    SEEN_F="${SEEN_F}${fn},"
  done
fi
if [[ -n "$WANT_PA" ]]; then
  [[ "$WANT_PA" =~ $PA_RE ]] || die "invalid --platform-arch: '$WANT_PA' (want e.g. darwin-arm64, linux-x64)"
fi

if [[ "$MODE" == "diff" ]]; then
  [[ ${#POS[@]} -eq 2 ]] || die "diff mode requires exactly 2 drivers (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]}"
  [[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER_BEFORE not readable: ${POS[0]}"
  [[ -f "${POS[1]}" && -r "${POS[1]}" ]] || die "DRIVER_AFTER not readable: ${POS[1]}"
else
  [[ ${#POS[@]} -eq 1 ]] || die "$MODE mode requires exactly 1 driver, got ${#POS[@]}"
  [[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER not readable: ${POS[0]}"
fi

# Split --v8-flags with noglob (`set -f`) so wildcards never expand against cwd (RECHECK New Defect 5)
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
      *stress-concurrent-inlining*|*concurrent-recompilation*|*concurrent-sparkplug*)
        die "--v8-flags must not set $f: conflicts with synchronous compilation flags" ;;
      --require*|--import*|--loader*|--experimental-loader*|--env-file*|--experimental-config-file*|--experimental-default-config-file*|--eval*|--print*)
        die "--v8-flags must not set $f: node preload/eval/print flag is refused" ;;
      --turbolev|--turbolev=*|--turbolev-future|--turbolev-future=*)
        die "--v8-flags must not set $f: Turbolev logs identical *' markers to TurboFan in --log-code" ;;
    esac
  done
fi

# --out validation BEFORE any spawn or write (LEDGER law 3; C1 SD-neon-5 trailing / and /. strip)
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
  OUT_UP="$OUT/raw/before"
  while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw ($OUT_UP is not a writable directory)"
  nl_dir "--out (resolved)" "$OUT"
  rep_refuse "${POS[@]}"
fi

# Resolve node binary ONCE to an absolute path (LEDGER law 5)
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

# Resolve driver paths & refuse resolved newline/CR BEFORE first spawn (LEDGER law 3; C2 SD-neon-6 '-' dir)
if [[ "$MODE" == "diff" ]]; then
  DRV_B_DIR=$(dirname -- "${POS[0]}"); [[ "$DRV_B_DIR" != - ]] || DRV_B_DIR=./-
  DRV_B_DIR=$(cd -- "$DRV_B_DIR" 2>/dev/null && pwd) || die "DRIVER_BEFORE: cannot resolve directory of ${POS[0]}"; DRV_B_BASE=$(basename -- "${POS[0]}")
  DRV_A_DIR=$(dirname -- "${POS[1]}"); [[ "$DRV_A_DIR" != - ]] || DRV_A_DIR=./-
  DRV_A_DIR=$(cd -- "$DRV_A_DIR" 2>/dev/null && pwd) || die "DRIVER_AFTER: cannot resolve directory of ${POS[1]}"; DRV_A_BASE=$(basename -- "${POS[1]}")
  [[ "$DRV_B_DIR/$DRV_B_BASE" -ef "${POS[0]}" ]] || die "DRIVER_BEFORE: cannot resolve directory of ${POS[0]}"
  [[ "$DRV_A_DIR/$DRV_A_BASE" -ef "${POS[1]}" ]] || die "DRIVER_AFTER: cannot resolve directory of ${POS[1]}"
  nl_refuse "DRIVER (resolved)" "$DRV_B_DIR/$DRV_B_BASE" "$DRV_A_DIR/$DRV_A_BASE"
else
  DRV_DIR=$(dirname -- "${POS[0]}"); [[ "$DRV_DIR" != - ]] || DRV_DIR=./-
  DRV_DIR=$(cd -- "$DRV_DIR" 2>/dev/null && pwd) || die "DRIVER: cannot resolve directory of ${POS[0]}"; DRV_BASE=$(basename -- "${POS[0]}")
  [[ "$DRV_DIR/$DRV_BASE" -ef "${POS[0]}" ]] || die "DRIVER: cannot resolve directory of ${POS[0]}"
  nl_refuse "DRIVER (resolved)" "$DRV_DIR/$DRV_BASE"
fi

# --- Spawns start here ---
INFO=$("${PROBE_ENV[@]}" "$NODE_RES" -p 'process.version + " " + process.platform + "-" + process.arch' 2>/dev/null) || die "cannot probe $NODE_RES"
GOT_VER=${INFO%% *}
GOT_PA=${INFO#* }
[[ -n "$GOT_VER" && -n "$GOT_PA" ]] || die "cannot read version / platform-arch from $NODE_RES"
if [[ -n "$WANT_VER" && "$GOT_VER" != "$WANT_VER" ]]; then
  die "node version mismatch: got $GOT_VER, want $WANT_VER"
fi
if [[ -n "$WANT_PA" && "$GOT_PA" != "$WANT_PA" ]]; then
  die "platform-arch mismatch: got $GOT_PA, want $WANT_PA"
fi

# Verbatim lib/v8flags.sh runtime allowlist (LEDGER law 4)
v8fl_check "$NODE_RES"

# Local Turbolev default-on check (Q-CSD-TLLIB (a); LEDGER #107 G5c; exact-name refusal already ran pre-spawn per A6/N7)
TL_RAW=$("${PROBE_ENV[@]}" "$NODE_RES" --v8-options 2>/dev/null) || die "cannot run $NODE_RES --v8-options"
TL_STATE=$(printf '%s\n' "$TL_RAW" | awk "$TURBOLEV_AWK")
case "$TL_STATE" in
  on\ *|*\ on) die "Turbolev is on by default in this V8 ($TL_STATE); --log-code cannot distinguish Turbolev from TurboFan" ;;
  \?*|*\ \?)   die "cannot read the --turbolev default from $NODE_RES --v8-options" ;;
esac

# Create --out dirs OR private temp dir (with ms/ subdir for lib/nullctl.sh file cmp -s, D9)
if [[ -n "$OUT" ]]; then
  if [[ "$MODE" == "diff" ]]; then
    mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" || die "--out: cannot create $OUT/raw/{before,after}"
  else
    mkdir -p -- "$OUT/raw/one" || die "--out: cannot create $OUT/raw/one"
  fi
  OUT=$(cd -- "$OUT" && pwd)
  nl_refuse "--out (resolved)" "$OUT"
  REPORT="$OUT/report.txt"
  { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"
  RUNROOT="$OUT/raw"
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/code-size-diff-ms.XXXXXX") || die "cannot create temp ms dir"
  MSDIR="$TMP_DIR"
else
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/code-size-diff.XXXXXX") || die "cannot create temp dir"
  TMP_DIR=$(cd -- "$TMP_DIR" && pwd)
  if [[ "$MODE" == "diff" ]]; then mkdir "$TMP_DIR/before" "$TMP_DIR/after" "$TMP_DIR/ms"
  else mkdir "$TMP_DIR/one" "$TMP_DIR/ms"
  fi
  RUNROOT="$TMP_DIR"
  MSDIR="$TMP_DIR/ms"
fi

say "code-size-diff (prototype)  node $GOT_VER  target $GOT_PA  $NODE_RES  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
say "mode    $MODE  runs $RUNS  tiers $TIERS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi

# =============================================================================================
# EXECUTION & VERDICT
# =============================================================================================
if [[ "$MODE" == "diff" ]]; then
  say "before  ${DRV_B_DIR%/}/$DRV_B_BASE"
  say "after   ${DRV_A_DIR%/}/$DRV_A_BASE"
  say ""

  RCB=(); RCA=(); LGB=(); LGA=(); REB=(); REA=()
  for k in $(seq 1 "$RUNS"); do
    run_side before "$DRV_B_DIR" "$DRV_B_BASE" "$k"; RCB+=("$RUN_RC"); LGB+=("$RUN_LOG"); REB+=("$RUN_REC")
    run_side after  "$DRV_A_DIR" "$DRV_A_BASE" "$k"; RCA+=("$RUN_RC"); LGA+=("$RUN_LOG"); REA+=("$RUN_REC")
  done

  VERDICT=SAME
  for fn in "${TARGETS[@]}"; do
    JRC=("${RCB[@]}"); JLOG=("${LGB[@]}"); JREC=("${REB[@]}"); judge_side "$fn" "$TIERS" "$MSDIR" before; VB=$JV; WB=$JWHY
    JRC=("${RCA[@]}"); JLOG=("${LGA[@]}"); JREC=("${REA[@]}"); judge_side "$fn" "$TIERS" "$MSDIR" after;  VA=$JV; WA=$JWHY
    if [[ "$VB" == NO-VERDICT || "$VA" == NO-VERDICT ]]; then
      FV=NO-VERDICT
      [[ "$VB" != NO-VERDICT ]] || say "  $fn: NO-VERDICT -- before: $WB"
      [[ "$VA" != NO-VERDICT ]] || say "  $fn: NO-VERDICT -- after: $WA"
    else
      MSB=$(v_ms "${REB[0]}" "$fn" "$TIERS")
      MSA=$(v_ms "${REA[0]}" "$fn" "$TIERS")
      RB=$(reported_summary "${REB[0]}" "$fn")
      RA=$(reported_summary "${REA[0]}" "$fn")
      if [[ "$MSB" == "$MSA" ]]; then
        FV=SAME
        say "  $fn: SAME -- identical code-size multiset in [$TIERS]"
      else
        FV=DIFF
        say "  $fn: DIFF -- code-size multiset differs in [$TIERS]"
        while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$MSB") <(printf '%s\n' "$MSA") | sort -k3)
      fi
      say "    REPORTED before: $RB"
      say "    REPORTED after:  $RA"
    fi
    VERDICT=$(worst "$VERDICT" "$FV")
  done
  say ""
  say "VERDICT $VERDICT"
  FINAL=1
  case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
else
  say "driver  ${DRV_DIR%/}/$DRV_BASE"
  say ""

  RCO=(); LGO=(); REO=()
  for k in $(seq 1 "$RUNS"); do
    run_side one "$DRV_DIR" "$DRV_BASE" "$k"; RCO+=("$RUN_RC"); LGO+=("$RUN_LOG"); REO+=("$RUN_REC")
  done

  VERDICT=$([[ "$MODE" == "gate" ]] && echo WITHIN || echo OK)
  for idx in "${!TARGETS[@]}"; do
    fn="${TARGETS[$idx]}"
    JRC=("${RCO[@]}"); JLOG=("${LGO[@]}"); JREC=("${REO[@]}"); judge_side "$fn" "$TIERS" "$MSDIR" one
    if [[ "$JV" == NO-VERDICT ]]; then
      FV=NO-VERDICT
      say "  $fn: NO-VERDICT -- $JWHY"
    else
      RONE=$(reported_summary "${REO[0]}" "$fn")
      counts=$(count_fn "${REO[0]}" "$fn" "$TIERS")
      mx=${counts##* }
      if [[ "$MODE" == "gate" ]]; then
        lim="${MAX_VALS[$idx]}"
        if [[ "$mx" -le "$lim" ]]; then
          FV=WITHIN
          say "  $fn: WITHIN -- max($TIERS)=${mx}B <= ${lim}B"
        else
          FV=OVER
          say "  $fn: OVER -- max($TIERS)=${mx}B > ${lim}B"
        fi
      else
        FV=OK
        say "  $fn: OK -- max($TIERS)=${mx}B"
      fi
      say "    REPORTED all tiers: $RONE"
    fi
    VERDICT=$(vworst "$VERDICT" "$FV")
  done
  say ""
  say "VERDICT $VERDICT"
  FINAL=1
  case "$VERDICT" in OK|WITHIN) exit 0 ;; OVER) exit 1 ;; *) exit 2 ;; esac
fi
