#!/usr/bin/env bash
# deopt-diff.sh -- the DEOPTIMIZATIONS of NAMED functions, DRIVER_BEFORE vs DRIVER_AFTER, on one node binary:
# per fn, the multiset of its deopt records (code tier, kind, reason) compared across the two drivers.
#
#   deopt-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER
#
#   e.g. deopt-diff.sh --fn add,get\ value --v8-flags --allow-natives-syntax before/driver.js after/driver.js
#
# Options
#   --fn LIST          function names, comma separated (required)
#   --runs N           node runs per side, 2..20 (default 3). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node)
#   --v8-flags STR     extra V8 flags for every run, split on spaces (flags only, each starting with --; any
#                      *trace-deopt*, *trace-opt* or *concurrent-recompilation* flag is refused: the script sets them)
#   --out DIR          keep DIR/report.txt and DIR/raw/before/run.<k>.txt, DIR/raw/after/run.<k>.txt (the raw
#                      output of run k, addresses kept). DIR/raw must be absent or empty. Without --out nothing
#                      is written to disk.
#   --self-test        canned checks, then exit 0 (all ok) or 1 (a FAIL line per failed check)
#   -h, --help         this text (exit 2)
#   Each value option is given at most once and never empty; --fn / --v8-flags / --out take no newline and --fn
#   no empty entry (stray comma). --self-test takes no other argument. --self-test / --help take no =value.
#
# DRIVER: exactly two existing readable files, each run as
#   `node [v8 flags] --trace-deopt-verbose --trace-opt --no-concurrent-recompilation DRIVER`
#   with cwd = its directory, NODE_OPTIONS stripped, stderr merged into stdout. One run per side per k serves
#   every fn; runs alternate before / after for k = 1..N.
# fn: a short V8 name, ^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$ (e.g. add, get value). Never
#   qualified (Store.add). A repeated fn is refused. Matching is EXACT on the name between `<JSFunction ` and
#   ` (sfi = `: add never matches addX, ad or Store.add; node internals of other names are never counted.
# Records (only trace lines that start with `[`; addresses, sfi, opt id, bytecode offset, deopt exit, deltas,
#   pc, timings and paths are never part of a record):
#   E <fn>@<tier>[-OSR]              one per `[completed compiling ... <JSFunction fn ...> (target T)[ OSR] - took`
#   D <fn>@<tier><TAB><kind> (<reason>)   one per `[bailout (kind: K, reason: R): begin. deoptimizing ...
#                                    <JSFunction fn ...>, ... <Code T>, ...]`, K ~ ^deopt-[a-z]+$, T ~ ^[A-Z_]+$
#   X <why>                          a `[bailout` or `[completed compiling` line naming fn that does not parse
#                                    (or such text after other output on the same line, naming fn)
# Report lines (after "before  <abs path>  sha256/8 <x>" and "after   <abs path>  sha256/8 <x>"; run 1):
#   "  <fn>: before <e> optimized compile(s) [<unit> x<n>, ..], <d> deopt(s)" (the same for after; no [..] when e is 0)
#   "  <fn>: SAME -- identical deopt multiset (before <d> | after <d>)"
#   "  <fn>: DIFF -- deopt multiset differs (before <d> | after <d>)", then per record whose count differs:
#     "    before=<n> after=<m>  [<fn>@<tier>] <kind> (<reason>)"
#   "  <fn>: NO-VERDICT -- <before|after>: <reason>" (one line per side that has a reason below)
# NO-VERDICT reasons (per side, first that applies):
#   driver exited <rc> in run <k>
#   unparseable trace line naming '<fn>' in run <k>: <why>
#   null control: run <k> differs from run 1 (<n> record(s) differ, first: run 1 x<a> | run <k> x<b>  [<unit>] <line>)
#   no optimized compile of '<fn>' in run 1 (no E and no D record: never optimized, inlined only, or no such name)
# Verdict, over every fn (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT. Every refused argument
#   exits 2 before any node is spawned and before anything is written to disk. Spawns: one --version, then
#   2 x runs driver runs.
# Not detected: a deopt of an inlined function counts only for the JSFunction named on the bailout line (its
#   caller); a dependency invalidation of code that is not on the stack (`[marking dependent code ...]`, no
#   bailout line) is not a deopt record; a driver that itself prints `[bailout` / `[completed compiling` text.
# Tier: on a user driver the verdict is STATISTICAL (deopts follow tier-up timing; run it under the host quiet
#   lock); --self-test is DETERMINISTIC (canned text and a fake node).
# Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.

# @include lib/prologue.sh

# ---------------------------------------------------------------------------------------------
# awk programs (POSIX awk: mawk, gawk, BSD awk)
# ---------------------------------------------------------------------------------------------

# @include lib/msdiff.sh

# trace lines starting with `[` -> E / D / X records of the functions named EXACTLY fn (see the header).
# fn is only ever compared with == or found with index(), never used as a regex.
# shellcheck disable=SC2016
DEOPT_AWK='
function names(s,   t, p, c) {                    # 1 iff s has <JSFunction fn followed by " (sfi = ", ">" or EOL
  t = "<JSFunction " fn
  while ((p = index(s, t)) > 0) {
    s = substr(s, p + length(t)); c = substr(s, 1, 1)
    if (s == "" || c == ">" || substr(s, 1, 8) == " (sfi = ") return 1
  }
  return 0
}
function head(r,   p) {                           # r = text after "<JSFunction ": sets NM and REST; 0 if malformed
  p = index(r, " (sfi = "); if (p < 2) return 0
  NM = substr(r, 1, p - 1); r = substr(r, p)
  if (!match(r, /^ \(sfi = 0x[0-9a-fA-F]+\)>/)) return 0
  REST = substr(r, RLENGTH + 1); return 1
}
function x(why) { print "X " why }
substr($0, 1, 21) != "[completed compiling " && substr($0, 1, 8) != "[bailout" {
  if ((index($0, "[bailout") > 0 || index($0, "[completed compiling ") > 0) && names($0)) x("trace text not at line start")
  next
}
substr($0, 1, 21) == "[completed compiling " {
  if (!names($0)) next
  s = substr($0, 22)
  if (!match(s, /^0x[0-9a-fA-F]+ <JSFunction /) || !head(substr(s, RLENGTH + 1))) { x("completed compiling: malformed function"); next }
  if (NM != fn) { x("completed compiling: function name"); next }
  if (!match(REST, /^ \(target [A-Z_]+\)/)) { x("completed compiling: target"); next }
  t = substr(REST, 10, RLENGTH - 10); r = substr(REST, RLENGTH + 1)
  if (r ~ /^ OSR - took .*\]$/) t = t "-OSR"
  else if (r !~ /^ - took .*\]$/) { x("completed compiling: after target"); next }
  print "E " fn "@" t; next
}
substr($0, 1, 8) == "[bailout" {
  if (!names($0)) next
  s = $0
  if (substr(s, 1, 16) != "[bailout (kind: ") { x("bailout: no (kind: prefix"); next }
  s = substr(s, 17); p = index(s, ", reason: ")
  if (p == 0) { x("bailout: no reason"); next }
  k = substr(s, 1, p - 1); s = substr(s, p + 10); p = index(s, "): begin. deoptimizing ")
  if (p == 0) { x("bailout: no begin. deoptimizing"); next }
  r = substr(s, 1, p - 1); s = substr(s, p + 23)
  if (k !~ /^deopt-[a-z]+$/) { x("bailout: kind \047" k "\047"); next }
  if (r == "" || index(r, "\t") > 0) { x("bailout: empty reason"); next }
  if (!match(s, /^0x[0-9a-fA-F]+ <JSFunction /) || !head(substr(s, RLENGTH + 1))) { x("bailout: malformed function"); next }
  if (NM != fn) { x("bailout: function name"); next }
  if (!match(REST, /^, 0x[0-9a-fA-F]+ <Code /)) { x("bailout: no code object"); next }
  s = substr(REST, RLENGTH + 1); p = index(s, ">"); t = substr(s, 1, p - 1)
  if (p == 0 || t !~ /^[A-Z_]+$/) { x("bailout: code tier"); next }
  if (substr(s, p, 3) != ">, " || s !~ /\]$/) { x("bailout: after code tier"); next }
  print "D " fn "@" t "\t" k " (" r ")"; next
}
'

# @include lib/common.sh

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
TRACE_FLAGS=(--trace-deopt-verbose --trace-opt --no-concurrent-recompilation)

# records -> the null-control multiset (E as "<unit><TAB>compiled", D as "<unit><TAB><kind> (<reason>)")
nc_ms() { printf '%s\n' "$1" | awk '/^E /{ print substr($0, 3) "\tcompiled"; next } /^D /{ print substr($0, 3) }' | multiset; }
# records -> the verdict multiset (D only), MSDIFF_AWK input
d_ms() { printf '%s\n' "$1" | awk '/^D /{ print substr($0, 3) }' | multiset; }
# records -> "<e> optimized compile(s) [<unit> x<n>, ..], <d> deopt(s)"
counts() {
  local e d u
  e=$(printf '%s\n' "$1" | grep -c '^E ' || true); d=$(printf '%s\n' "$1" | grep -c '^D ' || true)
  u=$(printf '%s\n' "$1" | awk '/^E /{ print substr($0, 3) }' | multiset | awk '{ n = $1; sub(/^ *[0-9]+ /, ""); printf "%s%s x%d", (NR > 1 ? ", " : ""), $0, n }')
  printf '%s optimized compile(s)%s, %s deopt(s)' "$e" "${u:+ [$u]}" "$d"
}

# judge FN: one side. JRC[k-1] = the driver exit of run k, JREC[k-1] = FN's DEOPT_AWK records of run k.
# Sets JV (OK NO-VERDICT) and JWHY (the reason). Order: driver exit, X record, null control (E+D), guard.
judge() {
  local fn="$1" n i x first nk dl
  JV=NO-VERDICT; JWHY=""
  n=${#JRC[@]}
  for ((i = 0; i < n; i++)); do
    if [[ "${JRC[$i]}" != 0 ]]; then JWHY="driver exited ${JRC[$i]} in run $((i + 1))"; return 0; fi
  done
  for ((i = 0; i < n; i++)); do
    x=$(printf '%s\n' "${JREC[$i]}" | awk '/^X /{ print substr($0, 3); exit }')
    if [[ -n "$x" ]]; then JWHY="unparseable trace line naming '$fn' in run $((i + 1)): $x"; return 0; fi
  done
  first=$(nc_ms "${JREC[0]}")
  for ((i = 1; i < n; i++)); do
    nk=$(nc_ms "${JREC[$i]}")
    if [[ "$nk" != "$first" ]]; then
      dl=$(awk "$MSDIFF_AWK" <(printf '%s\n' "$first") <(printf '%s\n' "$nk") | sort -k3 \
        | awk -v k="$((i + 1))" '{ n++; if (n == 1) { l = $0; sub(/^  before=[0-9]+ after=[0-9]+  /, "", l); a = $1; b = $2
            sub(/^before=/, "", a); sub(/^after=/, "", b); f = "run 1 x" a " | run " k " x" b "  " l } }
          END { printf "%d record(s) differ, first: %s", n, f }')
      JWHY="null control: run $((i + 1)) differs from run 1 ($dl)"; return 0
    fi
  done
  if [[ -z "$first" ]]; then JWHY="no optimized compile of '$fn' in run 1 (no E and no D record: never optimized, inlined only, or no such name)"; return 0; fi
  JV=OK
}

# diff_fn FN: one fn, from RCB/RCA (driver exits) and TXB/TXA (the `[` lines of run k at index k-1): records per
# run, judge() each side, then compare the run-1 D multisets. Prints the fn's lines, sets FV and folds it into VERDICT.
diff_fn() {
  local fn="$1" VB VA WB WA MSB MSA DB DA l i
  local -a RECB RECA
  for ((i = 0; i < ${#TXB[@]}; i++)); do
    RECB[$i]=$(printf '%s\n' "${TXB[$i]}" | awk -v fn="$fn" "$DEOPT_AWK")
    RECA[$i]=$(printf '%s\n' "${TXA[$i]}" | awk -v fn="$fn" "$DEOPT_AWK")
  done
  JRC=("${RCB[@]}"); JREC=("${RECB[@]}"); judge "$fn"; VB=$JV; WB=$JWHY
  JRC=("${RCA[@]}"); JREC=("${RECA[@]}"); judge "$fn"; VA=$JV; WA=$JWHY
  DB=$(printf '%s\n' "${RECB[0]}" | grep -c '^D ' || true); DA=$(printf '%s\n' "${RECA[0]}" | grep -c '^D ' || true)
  if [[ "${RCB[0]}" == 0 ]]; then say "  $fn: before $(counts "${RECB[0]}")"; fi
  if [[ "${RCA[0]}" == 0 ]]; then say "  $fn: after  $(counts "${RECA[0]}")"; fi
  if [[ $VB == NO-VERDICT || $VA == NO-VERDICT ]]; then
    FV=NO-VERDICT
    if [[ $VB == NO-VERDICT ]]; then say "  $fn: NO-VERDICT -- before: $WB"; fi
    if [[ $VA == NO-VERDICT ]]; then say "  $fn: NO-VERDICT -- after: $WA"; fi
  else
    MSB=$(d_ms "${RECB[0]}"); MSA=$(d_ms "${RECA[0]}")
    if [[ "$MSB" == "$MSA" ]]; then
      FV=SAME; say "  $fn: SAME -- identical deopt multiset (before $DB | after $DA)"
    else
      FV=DIFF; say "  $fn: DIFF -- deopt multiset differs (before $DB | after $DA)"
      while IFS= read -r l; do say "  $l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$MSB") <(printf '%s\n' "$MSA") | sort -k3)
    fi
  fi
  VERDICT=$(worst "$VERDICT" "$FV")
}

# ---------------------------------------------------------------------------------------------
# --self-test (Phase 3 G1 TASK 4: canned p3-probe rows, then this script with a fake node)
# ---------------------------------------------------------------------------------------------
self_test() {
  echo "FAIL self-test: not implemented yet (Phase 3 G1 TASK 4)"
  echo
  echo "self-test: 1 check(s) FAILED"
  return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write)
# ---------------------------------------------------------------------------------------------
FNLIST=""; RUNS=3; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; POS=(); GOTOPT=" "; REPORT=/dev/null
OPTS="--fn --runs --node --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
# @include lib/args.sh
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
  if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi
fi
[[ "$FNLIST$V8FLAGS$OUT$NODE_BIN" != *$'\n'* ]] || die "--fn / --v8-flags / --out / --node: a newline is not allowed"
[[ -n "$FNLIST" ]] || die "need --fn LIST (see --help)"
[[ "$FNLIST" != ,* && "$FNLIST" != *, && "$FNLIST" != *,,* ]] || die "--fn: empty entry (stray comma)"
IFS=, read -r -a TARGETS <<<"$FNLIST"
SEEN="|"
for t in "${TARGETS[@]}"; do
  [[ "$t" =~ $FN_RE ]] || die "fn must be a short V8 function name (e.g. add, get value; never Store.add), got '$t'"
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
    *trace-deopt*|*trace-opt*|*concurrent-recompilation*)
      die "--v8-flags must not set $f: the script sets --trace-deopt-verbose --trace-opt --no-concurrent-recompilation itself" ;;
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
command -v "$NODE_BIN" >/dev/null 2>&1 || die "node binary not found: $NODE_BIN"
if [[ "$NODE_BIN" == */* ]]; then NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"; fi
DRV_B_DIR=$(cd "$(dirname "${POS[0]}")" && pwd); DRV_B_BASE=$(basename "${POS[0]}")
DRV_A_DIR=$(cd "$(dirname "${POS[1]}")" && pwd); DRV_A_BASE=$(basename "${POS[1]}")
DESC_B="$DRV_B_DIR/$DRV_B_BASE  sha256/8 $(sha8 "$DRV_B_DIR/$DRV_B_BASE")"
DESC_A="$DRV_A_DIR/$DRV_A_BASE  sha256/8 $(sha8 "$DRV_A_DIR/$DRV_A_BASE")"

# --- every refusal is above this line; disk writes (--out only) and spawns start here ---
if [[ -n "$OUT" ]]; then
  mkdir -p "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"
  OUT=$(cd "$OUT" && pwd)
  REPORT="$OUT/report.txt"; : >"$REPORT"
fi

GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"
say "deopt-diff  node $GOT_VER  $NODE_BIN  (NODE_OPTIONS stripped)"
say "before  $DESC_B"
say "after   $DESC_A"
say "mode    diff  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
say ""

# ---------------------------------------------------------------------------------------------
# runs: k = 1..R, before then after; each keeps its driver exit and its `[` lines (raw output to --out only)
# ---------------------------------------------------------------------------------------------
RUN_RC=0; RUN_TX=""
run_side() { # dir base rawfile: one node run of dir/base; sets RUN_RC RUN_TX
  local rc=0 tx
  if [[ -n "$OUT" ]]; then
    tx=$( (cd "$1" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "$2" 2>&1) \
      | tee "$3" | awk '/^\[/ || index($0, "[bailout") > 0 || index($0, "[completed compiling ") > 0') || rc=$?
  else
    tx=$( (cd "$1" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "$2" 2>&1) \
      | awk '/^\[/ || index($0, "[bailout") > 0 || index($0, "[completed compiling ") > 0') || rc=$?
  fi
  RUN_RC=$rc; RUN_TX="$tx"
}
RCB=(); RCA=(); TXB=(); TXA=()
for k in $(seq 1 "$RUNS"); do
  run_side "$DRV_B_DIR" "$DRV_B_BASE" "${OUT:+$OUT/raw/before/run.$k.txt}"; RCB+=("$RUN_RC"); TXB+=("$RUN_TX")
  run_side "$DRV_A_DIR" "$DRV_A_BASE" "${OUT:+$OUT/raw/after/run.$k.txt}"; RCA+=("$RUN_RC"); TXA+=("$RUN_TX")
done

VERDICT=SAME
for fn in "${TARGETS[@]}"; do diff_fn "$fn"; done
say ""
say "VERDICT $VERDICT"
FINAL=1; case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
