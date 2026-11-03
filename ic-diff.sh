#!/usr/bin/env bash
# ic-diff.sh -- the INLINE-CACHE states of NAMED functions, DRIVER_BEFORE vs DRIVER_AFTER, on one node binary:
# per fn, the multiset of its IC sites (kind, key, final state) compared across the two drivers.
#
#   ic-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     driver mode: two drivers, one verdict
#   ic-diff.sh -h | --help                                       this text
#
#   e.g. ic-diff.sh --fn get,get\ value before/driver.js after/driver.js
#
# Options
#   --fn LIST          function names, comma separated (required)
#   --runs N           node runs per side, 2..20 (default 3). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node)
#   --v8-flags STR     extra V8 flags for every trace run, split on spaces (flags only, each starting with --).
#                      Refused, with `_` read as `-`: any *log*, *prof*, *concurrent-recompilation*,
#                      *interpreted-frames-native-stack* or *snapshot* flag. --no-lazy-feedback-allocation is allowed.
#   --out DIR          keep DIR/report.txt and DIR/raw/<side>/run.<k>.log (the IC log of run k) and
#                      DIR/raw/<side>/run.<k>.out (the driver's stdout + stderr). DIR/raw must be absent or empty.
#                      Without --out the logs go to one private temp dir, removed on every exit.
#   --self-test        canned checks (not in this build: exits 2)
#   -h, --help         this text (exit 2)
#
# Spawns, every one under `env -u NODE_OPTIONS -u NODE_COMPILE_CACHE`: one `node --version`, one `node --v8-options`
#   (a failing probe exits 2 before anything is written), then 2 x runs trace runs
#   `node [v8 flags] --log-ic --no-concurrent-recompilation --no-node-snapshot --logfile=<abs dir>/run.log DRIVER`
#   with cwd = the driver's directory. V8 writes isolate-0x<addr>-<pid>-run.log there; exactly one such file per
#   run is renamed run.<k>.log. The header line `v8-opts sha256/8 <x>` is the sha256/8 of the --v8-options bytes
#   (env -u NODE_OPTIONS <node> --v8-options | shasum -a 256): REPORTED, never part of the verdict.
# Verdict, over every fn (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT.

set -euo pipefail
# Fail closed: an exit that is not a planned verdict (FINAL=1), a die / usage (2) or 0 becomes 2 NO-VERDICT,
# so a command that fails under set -e can never pose as exit 1 DIFF. Subshells do not inherit this trap.
FINAL=""
trap 'rc=$?; if [[ -z $FINAL && $rc -ne 0 && $rc -ne 2 ]]; then printf "ic-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
export LC_ALL=C   # byte-wise sort / awk: stable multisets, emoji stripped as bytes

# ---------------------------------------------------------------------------------------------
# awk programs (POSIX awk: mawk, gawk, BSD awk)
# ---------------------------------------------------------------------------------------------

# two `uniq -c` files -> lines whose counts differ: "before=N after=M  [unit] line"
# shellcheck disable=SC2016
MSDIFF_AWK='
function key(s) { sub(/^ *[0-9]+ /, "", s); return s }
function show(k,   u, l) { u = k; sub(/\t.*/, "", u); l = k; sub(/^[^\t]*\t/, "", l); return (u == "*") ? l : "[" u "] " l }
FILENAME == ARGV[1] { k = key($0); b[k] = $1 + 0; all[k] = 1; next }   # not FNR == NR: an empty first file breaks it
{ k = key($0); a[k] = $1 + 0; all[k] = 1 }
END { for (k in all) if (b[k] + 0 != a[k] + 0) printf "  before=%d after=%d  %s\n", b[k], a[k], show(k) }
'

# one whole --log-ic log -> S records of the functions in -v fns (comma list), then at most one global X line.
# Every code-creation entry is kept; an IC line's pc is joined NEWEST-FIRST to the live entry whose
# [start, start+size) holds it (addresses only ever compared as numbers, never printed); code-move re-adds the newest
# live entry starting at `from` at `to`; sfi-move is ignored. An entry belongs to fn when its name is fn + " " + a
# rest starting with `/` or `file:///` (prefix test, never a split at the first space). One S record per site
# (fn, kind, base:line:col, key; key `[]` at keyed kinds), from the LAST IC line at that site:
#   S fn<TAB>kind<TAB>base:line:col<TAB>key<TAB>final<TAB>mod<TAB>slow
# X <why> at log line <n>[ (+<m> more X line(s))]: the first line that cannot be read; X is global (every fn).
# fn is only ever compared with ==, never used as a regex.
# shellcheck disable=SC2016
IC_AWK='
function hex(s,   i, v) {
  v = 0; s = tolower(substr(s, 3))
  for (i = 1; i <= length(s); i++) v = v * 16 + index("0123456789abcdef", substr(s, i, 1)) - 1
  return v
}
function x(why) { if (!NX++) { XW = why; XL = NR } }
function safe(s) { gsub(/[^ -~]/, "?", s); return (length(s) > 40 ? substr(s, 1, 40) ".." : s) }
function owner(nm,   i, f, r) {                     # the fn that owns a code entry named nm, or ""
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
function add(s, z, k, f, b, p) { n++; cs[n] = s; ce[n] = s + z; ck[n] = k; cf[n] = f; cb[n] = b; cp[n] = p; lv[n] = 1 }
BEGIN {
  FS = ","; NF_N = split(fns, FNS, ",")
  split("code-creation code-source-info delete heap-available heap-capacity new script-source v8-platform v8-version code-move sfi-move", t, " ")
  for (i in t) EV[t[i]] = 1
  split("KeyedLoadIC KeyedStoreIC LoadGlobalIC LoadIC StoreIC StoreInArrayLiteralIC StoreGlobalIC", t, " ")
  for (i in t) IC[t[i]] = 1
  split("X 0 1 P ^ N D G", t, " ")
  for (i in t) ST[t[i]] = 1
  split("Builtin,3 BytecodeHandler,0 RegExp,4", t, " ")
  for (i in t) C7[t[i]] = 1
  split("Eval,10 JS,10 JS,11 JS,12 JS,13 Script,10", t, " ")
  for (i in t) C9[t[i]] = 1
}
$1 in IC {
  if (NF != 11) { x("IC line not 11 fields"); next }
  if ($2 !~ /^0x[0-9a-fA-F]+$/ || $4 !~ /^[0-9]+$/ || $5 !~ /^[0-9]+$/ || index($0, "\t") > 0) { x("IC line does not parse"); next }
  if (!($6 in ST) || !($7 in ST)) { x("IC state outside X01P^NDG"); next }
  p = hex($2); h = 0
  for (i = n; i >= 1; i--) if (lv[i] && p >= cs[i] && p < ce[i]) { h = i; break }
  if (!h) { x("unresolved pc (no code-creation holds it: compile cache or user snapshot code?)"); next }
  if (ck[h] == "12" || ck[h] == "13") { x("IC pc in optimized code (Maglev / Turbofan, kind " ck[h] ")"); next }
  if (cf[h] == "") next
  key = (substr($1, 1, 5) == "Keyed" || $1 == "StoreInArrayLiteralIC") ? "[]" : $9
  k = cf[h] SUBSEP $1 SUBSEP cp[h] SUBSEP $4 ":" $5 SUBSEP key
  if (!(k in FIN)) { ORD[++NS] = k; SF[NS] = cf[h]; SK[NS] = $1; SS[NS] = cb[h] ":" $4 ":" $5; SY[NS] = key }
  FIN[k] = $7; MOD[k] = $10; SLW[k] = $11; next
}
$1 == "code-creation" {
  if ((NF != 7 && NF != 9) || $5 !~ /^0x[0-9a-fA-F]+$/ || $6 !~ /^[0-9]+$/) { x("code-creation does not parse"); next }
  ty = $2 "," $3; ok = 0
  if (NF == 7) { if (ty in C7) ok = 1 } else if (ty in C9) ok = 1
  if (!ok) { x("code kind outside the allowlist: " safe(ty)); next }
  BASE = ""; SCR = ""; f = (NF == 9 ? owner($7) : "")
  add(hex($5), $6 + 0, $3, f, BASE, SCR); next
}
$1 == "code-move" {
  if (NF != 3 || $2 !~ /^0x[0-9a-fA-F]+$/ || $3 !~ /^0x[0-9a-fA-F]+$/) { x("code-move does not parse"); next }
  p = hex($2); h = 0
  for (i = n; i >= 1; i--) if (lv[i] && cs[i] == p) { h = i; break }
  if (!h) { x("code-move from an unknown start"); next }
  lv[h] = 0; add(hex($3), ce[h] - cs[h], ck[h], cf[h], cb[h], cp[h]); next
}
$1 in EV { next }
{ if ($1 ~ /IC$/) x("unknown IC kind " safe($1)); else x("unknown event " safe($1)) }
END {
  for (i = 1; i <= NS; i++) { k = ORD[i]; print "S " SF[i] "\t" SK[i] "\t" SS[i] "\t" SY[i] "\t" FIN[k] "\t" MOD[k] "\t" SLW[k] }
  if (NX) print "X " XW " at log line " XL (NX > 1 ? " (+" (NX - 1) " more X line(s))" : "")
}
'

# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
die() { printf 'ic-diff: %s\nVERDICT NO-VERDICT\n' "$*" >&2; exit 2; }
say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
sha8() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-8; }
usage() { sed -n '2,/^$/{s/^# \{0,1\}//;p;}' "$0"; }
multiset() { sort | uniq -c; }   # the ONE multiset: judge() and --self-test both use it (never sort -u)
devino() { # device:inode, following symlinks (GNU stat, else BSD / macOS stat)
  if stat -L -c '%d:%i' "$1" >/dev/null 2>&1; then stat -L -c '%d:%i' "$1"; else stat -L -f '%d:%i' "$1"; fi
}
live_tops() { # dirs...: repo toplevels around cwd, --after, --repo and each given dir
  { git rev-parse --show-toplevel 2>/dev/null || true
    [[ -n "$AFTER_FILE" ]] && git -C "$(dirname "$AFTER_FILE")" rev-parse --show-toplevel 2>/dev/null || true
    [[ -n "$REPO" ]] && git -C "$REPO" rev-parse --show-toplevel 2>/dev/null || true
    for x in "$@"; do git -C "$x" rev-parse --show-toplevel 2>/dev/null || true; done; } | sort -u
}
resolve_links() { # path: follow a symlink chain (at most 40 hops) and print its end
  local p="$1" l n=0
  while [[ -L "$p" ]]; do
    n=$((n + 1)); [[ $n -le 40 ]] || die "symlink chain too long (or a loop) at $1"
    l=$(readlink "$p")
    case "$l" in /*) p="$l" ;; *) p="$(dirname "$p")/$l" ;; esac
  done
  printf '%s\n' "$p"
}
is_tracked() { # path: 0 iff git tracks it in the work tree around it
  local d b
  d=$(cd "$(dirname "$1")" 2>/dev/null && pwd) || return 1
  b=$(basename "$1")
  git -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1 && git -C "$d" ls-files --error-unmatch -- "$b" >/dev/null 2>&1
}
refuse_live() { # file label: die unless file is a FROZEN copy (not tracked, not an alias of a tracked file)
  local f="$1" what="$2" p me top t
  p=$(resolve_links "$f")
  for t in "$f" "$p"; do
    if is_tracked "$t"; then die "$what is a git-tracked working-tree file ($t): use a FROZEN copy (untracked) or --before-ref"; fi
  done
  me=$(devino "$f")
  while IFS= read -r top; do
    [[ -n "$top" ]] || continue
    for t in "$top/Signal.js" "$top/$(basename "$f")" "$top/$(basename "$p")"; do
      if [[ -e "$t" ]] && [[ "$(devino "$t")" == "$me" ]] && is_tracked "$t"; then
        die "$what is the same file as the live $t (hard link / symlink): use a FROZEN copy or --before-ref"
      fi
    done
  done < <(live_tops "$(dirname "$f")" "$(dirname "$p")")
}
worst() { # NO-VERDICT > DIFF > SAME
  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT
  elif [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF
  else echo SAME; fi
}

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
TRACE_FLAGS=(--log-ic --no-concurrent-recompilation --no-node-snapshot)
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_COMPILE_CACHE)

# records -> fn's S records as a multiset ("*<TAB>" + the record minus "S fn<TAB>"): the null-control input
s_ms() { printf '%s\n' "$1" | awk -v fn="$2" 'BEGIN { p = "S " fn "\t" } substr($0, 1, length(p)) == p { print "*\t" substr($0, length(p) + 1) }' | multiset; }
# records -> fn's V multiset: "*<TAB>fn<TAB>kind<TAB>key<TAB>final[ mod]", MSDIFF_AWK input
v_ms() {
  printf '%s\n' "$1" | awk -v fn="$2" 'BEGIN { FS = "\t"; p = "S " fn "\t" }
    substr($0, 1, length(p)) == p { print "*\t" fn "\t" $2 "\t" $4 "\t" $5 ($6 != "" ? " " $6 : "") }' | multiset
}
# records -> "<sites> <non-X sites>" of fn
sites() { printf '%s\n' "$1" | awk -v fn="$2" 'BEGIN { FS = "\t"; p = "S " fn "\t" } substr($0, 1, length(p)) == p { n++; if ($5 != "X") m++ } END { print n + 0, m + 0 }'; }

# judge FN: one side. JRC[k-1] = the driver exit of run k, JLOG[k-1] = run k's log reason ("" = readable), JREC[k-1]
# = run k's IC_AWK records. Sets JV (OK NO-VERDICT) and JWHY. Order: driver exit / log run by run, X record, null
# control (S records), guard (0 sites, or every site X).
judge() {
  local fn="$1" n i x first nk dl c
  JV=NO-VERDICT; JWHY=""
  n=${#JRC[@]}
  for ((i = 0; i < n; i++)); do
    if [[ "${JRC[$i]}" != 0 ]]; then JWHY="driver exited ${JRC[$i]} in run $((i + 1))"; return 0; fi
    if [[ -n "${JLOG[$i]}" ]]; then JWHY="${JLOG[$i]} in run $((i + 1))"; return 0; fi
  done
  for ((i = 0; i < n; i++)); do
    x=$(printf '%s\n' "${JREC[$i]}" | awk '/^X /{ print substr($0, 3); exit }')
    if [[ -n "$x" ]]; then JWHY="unreadable IC log in run $((i + 1)): $x"; return 0; fi
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
  c=$(sites "${JREC[0]}" "$fn")
  if [[ "${c% *}" == 0 ]]; then
    JWHY="no IC site of '$fn' in run 1 (no such name, never called, or no feedback vector yet: try --v8-flags=--no-lazy-feedback-allocation)"; return 0
  fi
  if [[ "${c#* }" == 0 ]]; then
    JWHY="every IC site of '$fn' is X (no feedback) in run 1: try --v8-flags=--no-lazy-feedback-allocation"; return 0
  fi
  JV=OK
}

# diff_fn FN: judge() each side from RCB/RCA, LGB/LGA, REB/REA, then compare the run-1 V multisets. Prints the fn's
# lines, sets FV and folds it into VERDICT.
diff_fn() {
  local fn="$1" VB VA WB WA MSB MSA NB NA l
  JRC=("${RCB[@]}"); JLOG=("${LGB[@]}"); JREC=("${REB[@]}"); judge "$fn"; VB=$JV; WB=$JWHY
  JRC=("${RCA[@]}"); JLOG=("${LGA[@]}"); JREC=("${REA[@]}"); judge "$fn"; VA=$JV; WA=$JWHY
  if [[ $VB == NO-VERDICT || $VA == NO-VERDICT ]]; then
    FV=NO-VERDICT
    if [[ $VB == NO-VERDICT ]]; then say "  $fn: NO-VERDICT -- before: $WB"; fi
    if [[ $VA == NO-VERDICT ]]; then say "  $fn: NO-VERDICT -- after: $WA"; fi
  else
    NB=$(sites "${REB[0]}" "$fn"); NA=$(sites "${REA[0]}" "$fn")
    MSB=$(v_ms "${REB[0]}" "$fn"); MSA=$(v_ms "${REA[0]}" "$fn")
    if [[ "$MSB" == "$MSA" ]]; then
      FV=SAME; say "  $fn: SAME -- identical IC multiset (before ${NB% *} | after ${NA% *} site(s))"
    else
      FV=DIFF; say "  $fn: DIFF -- IC multiset differs (before ${NB% *} | after ${NA% *} site(s))"
      while IFS= read -r l; do say "$l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$MSB") <(printf '%s\n' "$MSA") | sort -k3)
    fi
  fi
  VERDICT=$(worst "$VERDICT" "$FV")
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write)
# ---------------------------------------------------------------------------------------------
FNLIST=""; RUNS=3; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; POS=(); GOTOPT=" "; REPORT=/dev/null
IC_TMP=""
OPTS="--fn --runs --node --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
need() { # value from --opt=value (returns 0) or from the next argument (returns 1: caller shifts)
  if [[ -n "$v" ]]; then return 0; fi
  [[ $# -ge 2 ]] || die "$a needs a value"
  v="$2"; return 1
}
while [[ $# -gt 0 ]]; do
  a="$1"; v=""; EQ=0
  case "$a" in --*=*) v="${a#*=}"; a="${a%%=*}"; EQ=1 ;; esac
  case "$a" in
    -h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; exit 2 ;;
    --self-test) [[ $EQ -eq 0 ]] || die "$a takes no value"; SELFTEST=1 ;;
    --fn|--runs|--node|--v8-flags|--out)
      [[ "$GOTOPT" != *" $a "* ]] || die "$a given twice (give one comma list)"
      GOTOPT="$GOTOPT $a "
      if [[ $EQ -eq 0 ]] && ! need "$@"; then shift; fi
      [[ -n "$v" ]] || die "$a needs a non-empty value"
      case "$a" in
        --fn) FNLIST="$v" ;; --runs) RUNS="$v" ;; --node) NODE_BIN="$v" ;; --v8-flags) V8FLAGS="$v" ;; --out) OUT="$v" ;;
      esac ;;
    -*) die "unknown option $a$(hint "$a") (see --help)" ;;
    *) POS+=("$a") ;;
  esac
  shift
done

if [[ $SELFTEST == 1 ]]; then
  [[ -z "${GOTOPT// /}" && ${#POS[@]} -eq 0 ]] || die "--self-test takes no other argument"
  die "--self-test is not in this build"
fi
[[ "$FNLIST$V8FLAGS$OUT$NODE_BIN" != *$'\n'* ]] || die "--fn / --v8-flags / --out / --node: a newline is not allowed"
[[ -n "$FNLIST" ]] || die "need --fn LIST (see --help)"
[[ "$FNLIST" != ,* && "$FNLIST" != *, && "$FNLIST" != *,,* ]] || die "--fn: empty entry (stray comma)"
IFS=, read -r -a TARGETS <<<"$FNLIST"
SEEN="|"
for t in "${TARGETS[@]}"; do
  [[ "$t" =~ $FN_RE ]] || die "fn must be a short V8 function name (e.g. get, get value; never Store.get), got '$t'"
  [[ "$SEEN" != *"|$t|"* ]] || die "fn '$t' is given twice"
  SEEN="$SEEN$t|"
done
[[ "$RUNS" =~ ^[0-9]{1,2}$ ]] && RUNS=$((10#$RUNS)) && [[ $RUNS -ge 2 && $RUNS -le 20 ]] \
  || die "--runs must be an integer in [2, 20] (null control), got '$RUNS'"
read -r -a V8_EXTRA <<<"$V8FLAGS" || true
[[ -z "$V8FLAGS" || ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
  [[ "$f" == --* ]] || die "--v8-flags takes flags only (each starts with --), got '$f'"
  g="${f//_/-}"
  case "$g" in
    *log*|*prof*|*concurrent-recompilation*|*interpreted-frames-native-stack*|*snapshot*)
      die "--v8-flags must not set $f: the script sets ${TRACE_FLAGS[*]} --logfile itself (no *log*, *prof*, *concurrent-recompilation*, *interpreted-frames-native-stack* or *snapshot* flag)" ;;
  esac
done
[[ ${#POS[@]} -eq 2 ]] || die "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]} (see --help)"
[[ "${POS[0]}${POS[1]}" != *$'\n'* ]] || die "DRIVER: a newline is not allowed in a path"
[[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER (before) not found (or not a readable file): ${POS[0]}"
[[ -f "${POS[1]}" && -r "${POS[1]}" ]] || die "DRIVER (after) not found (or not a readable file): ${POS[1]}"
if [[ -n "$OUT" ]]; then
  [[ ! -e "$OUT" || -d "$OUT" ]] || die "--out: $OUT exists and is not a directory"
  [[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die "--out: $OUT/raw exists and is not a directory"
  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
fi
# resolve the binary ONCE, from the caller's cwd: every spawn (probes and trace runs, each trace run in its driver dir)
# runs this absolute path, so a relative PATH entry can never pick a different node per cwd
NODE_RES=$(command -v "$NODE_BIN" 2>/dev/null) || die "node binary not found: $NODE_BIN"
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH (a function, alias or builtin?): $NODE_BIN -> $NODE_RES"
NODE_RES="$(cd "$(dirname "$NODE_RES")" && pwd)/$(basename "$NODE_RES")"
DRV_B_DIR=$(cd "$(dirname "${POS[0]}")" && pwd); DRV_B_BASE=$(basename "${POS[0]}")
DRV_A_DIR=$(cd "$(dirname "${POS[1]}")" && pwd); DRV_A_BASE=$(basename "${POS[1]}")
DESC_B="$DRV_B_DIR/$DRV_B_BASE  sha256/8 $(sha8 "$DRV_B_DIR/$DRV_B_BASE")"
DESC_A="$DRV_A_DIR/$DRV_A_BASE  sha256/8 $(sha8 "$DRV_A_DIR/$DRV_A_BASE")"

# --- every refusal is above this line; spawns start here: --version, --v8-options, then mktemp / OUT mkdir, the runs ---
GOT_VER=$("${PROBE_ENV[@]}" "$NODE_RES" --version 2>/dev/null) || die "cannot run $NODE_RES --version"
# the --v8-options BYTE STREAM is hashed through a pipe (never a $(...) value: that strips trailing newlines); tee
# copies the same bytes to fd 3 = the wc pipe. fd 4 = the capture. Lines: the 8-hex hash, "rc <node exit>" (node's
# exit from PIPESTATUS), "bytes <n>" (no process substitution: its output could land in the hashed pipe)
V8O=$(exec 4>&1; { "${PROBE_ENV[@]}" "$NODE_RES" --v8-options 2>/dev/null | tee /dev/fd/3 | sha8 - >&4
  printf 'rc %s\n' "${PIPESTATUS[0]}" >&4; } 3>&1 | wc -c | sed 's/^ */bytes /') || true
V8O_RC=$(printf '%s\n' "$V8O" | sed -n 's/^rc //p'); V8O_N=$(printf '%s\n' "$V8O" | sed -n 's/^bytes //p')
V8O_SHA=$(printf '%s\n' "$V8O" | grep -E '^[0-9a-f]{8}$' || true)
[[ "$V8O_RC" == 0 ]] || die "cannot run $NODE_RES --v8-options"
[[ "$V8O_N" =~ ^[0-9]+$ && "$V8O_N" != 0 ]] || die "$NODE_RES --v8-options printed nothing"
[[ "$V8O_SHA" =~ ^[0-9a-f]{8}$ ]] || die "cannot hash the $NODE_RES --v8-options output"

trap 'die "interrupted"' INT TERM
if [[ -n "$OUT" ]]; then
  mkdir -p "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"
  OUT=$(cd "$OUT" && pwd)
  REPORT="$OUT/report.txt"; : >"$REPORT"
  RUNROOT="$OUT/raw"
else
  # the private log dir goes on every exit path: this trap runs the script's own EXIT trap after it (with $?
  # restored; set +e so restoring a non-zero $? cannot cut the trap short)
  eval "set -- $(trap -p EXIT)"; IC_OLD=${3:-}
  # shellcheck disable=SC2064
  trap "ic_rc=\$?; if [[ -n \$IC_TMP ]]; then rm -rf \"\$IC_TMP\"; fi; set +e; (exit \$ic_rc); $IC_OLD" EXIT
  IC_TMP=$(mktemp -d "${TMPDIR:-/tmp}/ic-diff.XXXXXX") || die "cannot create a private log dir (mktemp -d)"
  mkdir "$IC_TMP/before" "$IC_TMP/after" || die "cannot create the private log dirs in $IC_TMP"
  RUNROOT="$IC_TMP"
fi
say "ic-diff  node $GOT_VER  $NODE_RES  (NODE_OPTIONS, NODE_COMPILE_CACHE stripped)"
say "v8-opts sha256/8 $V8O_SHA"
say "before  $DESC_B"
say "after   $DESC_A"
say "mode    diff  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]} --logfile=<run dir>/run.log"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
say ""

# ---------------------------------------------------------------------------------------------
# runs: k = 1..R, before then after; each keeps its driver exit, its log reason and its IC_AWK records (never the log)
# ---------------------------------------------------------------------------------------------
RUN_RC=0; RUN_LOG=""; RUN_REC=""
run_side() { # side dir base k: one node run; sets RUN_RC (driver exit) RUN_LOG ("" or why) RUN_REC (records)
  local rd="$RUNROOT/$1" out=/dev/null lf n rc=0 ar=0
  local -a LF
  if [[ -n "$OUT" ]]; then out="$rd/run.$4.out"; fi
  ( cd "$2" && exec "${PROBE_ENV[@]}" "$NODE_RES" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "--logfile=$rd/run.log" "$3" ) \
    >"$out" 2>&1 || rc=$?
  RUN_RC=$rc; RUN_LOG=""; RUN_REC=""
  shopt -s nullglob; LF=("$rd"/isolate-0x*-*-run.log); shopt -u nullglob
  if [[ ${#LF[@]} -eq 0 ]]; then RUN_LOG="no IC log (no isolate-0x*-*-run.log written)"; return 0; fi
  if [[ ${#LF[@]} -gt 1 ]]; then RUN_LOG="another isolate or process logged (${#LF[@]} isolate-0x*-*-run.log files)"; return 0; fi
  lf="$rd/run.$4.log"
  mv -f "${LF[0]}" "$lf" || die "cannot rename ${LF[0]} to $lf"
  n=$(grep -a -c '^v8-version,' "$lf" || true)
  if [[ "$n" != 1 ]]; then RUN_LOG="the log holds $n v8-version line(s), want 1"; return 0; fi
  if ! tr -d '\000' <"$lf" | cmp -s - "$lf"; then RUN_LOG="a NUL byte in the log"; return 0; fi
  if [[ "$(tail -c 1 "$lf"; printf x)" != $'\nx' ]]; then RUN_LOG="the log has no final newline"; return 0; fi
  RUN_REC=$(awk -v fns="$FNLIST" "$IC_AWK" "$lf") || ar=$?
  if [[ $ar != 0 ]]; then RUN_LOG="cannot read the log (awk exited $ar)"; RUN_REC=""; fi
}
RCB=(); RCA=(); LGB=(); LGA=(); REB=(); REA=()
for k in $(seq 1 "$RUNS"); do
  run_side before "$DRV_B_DIR" "$DRV_B_BASE" "$k"; RCB+=("$RUN_RC"); LGB+=("$RUN_LOG"); REB+=("$RUN_REC")
  run_side after "$DRV_A_DIR" "$DRV_A_BASE" "$k"; RCA+=("$RUN_RC"); LGA+=("$RUN_LOG"); REA+=("$RUN_REC")
done

VERDICT=SAME
for fn in "${TARGETS[@]}"; do diff_fn "$fn"; done
say ""
say "VERDICT $VERDICT"
FINAL=1; case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
