#!/usr/bin/env bash
# bytecode-budget.sh -- the bytecode LENGTH of NAMED functions on one node binary: a REPORT, or a GATE
# against per-function maxima recorded on a known node version.
#
#   bytecode-budget.sh [opts] --fn LIST DRIVER                                   # report
#   bytecode-budget.sh [opts] --max fn=N[,fn=N] --node-version vX.Y.Z DRIVER     # gate
#
#   e.g. bytecode-budget.sh --max add=6,mid=211 --node-version v26.8.2 test/fixtures/bytecode-budget/node-26.8.2/driver.mjs
#
# Options
#   --fn LIST              report mode: function names, comma separated
#   --max fn=N[,fn=N]      gate mode: every function named fn must have a bytecode length <= N (1..9 digits)
#   --node-version vX.Y.Z  gate mode (required): the node version the maxima were taken on; report mode
#                          (optional): the node version expected. Must equal `<node> --version` exactly, else
#                          NO-VERDICT before any probe.
#   --runs N               probes per function, 2..20 (default 2). Run 1 vs runs 2..N is the null control.
#   --node BIN             node binary (default: $NODE, else node)
#   --v8-flags STR         extra V8 flags for every probe, split on spaces (flags only; any *print-bytecode* flag
#                          is refused; a max*inlined*bytecode* flag must be --name=N, N an integer of 1..9 digits;
#                          a reserve*inline*budget* flag must be --name=X, X = N or N.M, N and M of 1..9 digits (e.g. 1.2))
#   --out DIR              keep DIR/report.txt and DIR/raw/<fn>.<k>.txt (raw output of run k, 0x addresses kept;
#                          a space in fn becomes -). DIR/raw must be absent or empty. Without --out nothing is
#                          written to disk.
#   --self-test            canned checks, then exit 0 (all ok) or 1 (a FAIL line per failed check)
#   --fixtures DIR         with --self-test: also check the real-trace captures in DIR (the node-26.8.2 set)
#   -h, --help             this text (exit 2)
#   Each value option is given at most once (one comma list) and never empty (--v8-flags never only blanks);
#   --fn / --max / --v8-flags take no newline and --fn / --max no empty entry (stray comma). --self-test takes
#   only --fixtures. --self-test / --help take no =value; an explicit empty --opt= is refused, never filled
#   from the next argument.
#
# DRIVER: exactly one existing file, run as `node [v8 flags] --print-bytecode --print-bytecode-filter=<fn> DRIVER`
#   with cwd = its directory and NODE_OPTIONS stripped. V8 prints a function only once it is compiled.
# fn: a short V8 name, ^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$ (e.g. read, get value). Never
#   qualified: Store.read prints nothing on node 26, so it is refused. A repeated fn is refused.
#   Matching is EXACT and counts EVERY function with that name (same-name functions, class and object
#   methods); each one is gated. read never matches reader or read.set.
# Per fn and run, the probe output is reduced to "<count> <bad> <lengths>": matched headers, matched headers
#   not followed by "Bytecode length: N", and every length in input order (duplicates kept; "-" if none).
#   No address reaches that line, so run k must equal run 1 as text (null control).
# Report lines (run 1):
#   "  <fn>: <count> match(es): <l1,l2,..>"
#   "    <len> bytes: over <limit> (<op><value>)[, ...]" or "    <len> bytes: within every limit" (each distinct length)
#   "  <fn>: <WITHIN|OVER|REPORTED|NO-VERDICT> -- <reason>"
#   Limits are this binary's (one `--v8-options` read, then --v8-flags overrides; a NOTE lists any node 26
#   default ASSUMED), with inlining-budget-diff's operators: TurboFan small <=, small where a HeapNumber may
#   cross the call <=, single-inline <=; Maglev eager (greedy small) <, small <=, single-inline <.
# NO-VERDICT reasons, one line per fn ("  <fn>: NO-VERDICT -- <reason>"):
#   node version mismatch: <bin> --version is <v>, the maxima are for <v>     (gate mode)
#   node version mismatch: <bin> --version is <v>, --node-version is <v>      (report mode)
#   driver exited <rc> in run <k>
#   null control: run <k> differs from run 1 (run <k>: <line> | run 1: <line>)
#   no function named '<fn>' in run 1 (not compiled: never called / lazy, or no such name)
#   <b> of <n> matched header(s) not followed by 'Bytecode length: N' in run 1 (unknown format)
# Verdict, over every fn (NO-VERDICT > OVER > WITHIN): exit 0 WITHIN, 1 OVER, 2 NO-VERDICT. Report mode:
#   exit 0 REPORTED, or 2 NO-VERDICT. A refused argument (Options, DRIVER, fn) exits 2 before any node is
#   spawned; a --node BIN whose --version fails, or a V8 flag node rejects (NO-VERDICT: driver exited <rc>),
#   exits 2 after its spawn(s) (a rejected V8 flag still runs every probe). Spawns: one --version, one
#   --v8-options, then fn x runs probes.
# Tier: DETERMINISTIC (gated in npm test): the gate verdict -- the lengths come from one node binary and
#   one driver, the gate is pinned to that node version (--node-version) and any run-to-run change is
#   NO-VERDICT, never OVER -- and --self-test (canned text; with --fixtures, the recorded node v26.8.2
#   captures). REPORTED: the limit values both modes print are this binary's (its --v8-options, then
#   --v8-flags), a measurement of that binary, not a law.
# Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.

# @include lib/prologue.sh

# ---------------------------------------------------------------------------------------------
# awk programs (POSIX awk: mawk, gawk, BSD awk)
# ---------------------------------------------------------------------------------------------

# @include lib/v8probe.sh

# --print-bytecode output -> "<count> <bad> <lengths>" for the functions named EXACTLY fn (see the header).
# shellcheck disable=SC2016
COUNT_AWK='
/^\[generated bytecode for function: / {
  s = $0; sub(/^\[generated bytecode for function: /, "", s); sub(/ \(0x.*$/, "", s)
  want = (s == fn); n += want; next
}
want && /^Bytecode length: [0-9]+$/ { good++; out = out (out == "" ? "" : ",") ($3 + 0) }
{ want = 0 }
END { bad = n - good; print n + 0, bad + 0, (out == "" ? "-" : out) }
'

# @include lib/common.sh

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
LINE_RE='^0 [0-9]+ [0-9]+ (-|[0-9]+(,[0-9]+)*)$'   # a probe line "<driver exit> <count> <bad> <lengths>" of a clean run

vworst() { local a; for a in NO-VERDICT OVER; do if [[ $1 == "$a" || $2 == "$a" ]]; then echo "$a"; return 0; fi; done; echo "$1"; }

distinct() { printf '%s\n' "$1" | tr ',' '\n' | awk '!seen[$0]++'; }   # "l1,l2,.." -> distinct values, first-seen order

# judge FN MAX LINE1 .. LINER: LINEk = "<driver exit> <count> <bad> <lengths>" of run k; MAX empty = report mode.
# Sets JV (WITHIN OVER REPORTED NO-VERDICT) and JWHY (the reason).
judge() {
  local fn="$1" max="$2" first="$3" line k rc n bad lens l over=""
  local -a lens_a
  shift 2
  JV=NO-VERDICT; JWHY=""
  k=0
  for line in "$@"; do
    k=$((k + 1)); rc="${line%% *}"
    if [[ "$rc" != 0 ]]; then JWHY="driver exited $rc in run $k"; return 0; fi
  done
  k=0
  for line in "$@"; do
    k=$((k + 1))
    if [[ "$line" != "$first" ]]; then JWHY="null control: run $k differs from run 1 (run $k: ${line#* } | run 1: ${first#* })"; return 0; fi
  done
  if ! [[ "$first" =~ $LINE_RE ]]; then JWHY="unreadable probe result '$first' in run 1"; return 0; fi
  read -r rc n bad lens <<<"$first"
  if [[ "$n" == 0 ]]; then JWHY="no function named '$fn' in run 1 (not compiled: never called / lazy, or no such name)"; return 0; fi
  if [[ "$bad" != 0 ]]; then JWHY="$bad of $n matched header(s) not followed by 'Bytecode length: N' in run 1 (unknown format)"; return 0; fi
  if [[ -z "$max" ]]; then JV=REPORTED; JWHY="$n match(es), not gated"; return 0; fi
  IFS=, read -r -a lens_a <<<"$lens"
  for l in "${lens_a[@]}"; do if (( l > max )); then over="$over $l"; fi; done
  if [[ -n "$over" ]]; then JV=OVER; JWHY="length(s)$over > max $max"; else JV=WITHIN; JWHY="every length <= max $max"; fi
}

# over_limits LEN: the limits LEN is outside of (lib/v8limits.sh values; operators as inlining-budget-diff's cross())
over_limits() {
  local l=$1 o=""
  (( l <= TF_SMALL )) || o="$o, TurboFan small (<=$TF_SMALL)"
  (( l <= TF_SMALL_HN )) || o="$o, TurboFan small where a HeapNumber may cross the call (<=$TF_SMALL_HN)"
  (( l <= TF_ONE )) || o="$o, TurboFan single-inline (<=$TF_ONE)"
  (( l < MG_EAGER )) || o="$o, Maglev eager (greedy small) (<$MG_EAGER)"
  (( l <= MG_SMALL )) || o="$o, Maglev small (<=$MG_SMALL)"
  (( l < MG_ONE )) || o="$o, Maglev single-inline (<$MG_ONE)"
  if [[ -z "$o" ]]; then echo "within every limit"; else echo "over ${o#, }"; fi
}

# ---------------------------------------------------------------------------------------------
# --self-test: canned text through the same awk / judge code, then this script with a fake node
# ---------------------------------------------------------------------------------------------
self_test() {
  local d; d=$(mktemp -d)
  local fails=0
  check() { if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1"; echo "     want: $3"; echo "     got:  $2"; fails=$((fails + 1)); fi; }
  hdr() { printf '[generated bytecode for function: %s (0x%s <SharedFunctionInfo %s>)]\n' "$1" "$2" "$1"; }
  { hdr add 0a1b2c3d4e5f; printf '%s\n' 'Bytecode length: 6' 'Parameter count 3'; } >"$d/add"
  check "count: one header -> count 1, bad 0, its length" "$(awk -v fn=add "$COUNT_AWK" "$d/add")" "1 0 6"
  { hdr read.set 1; echo 'Bytecode length: 285'; hdr reader 2; echo 'Bytecode length: 40'
    hdr read 3; echo 'Bytecode length: 106'; hdr rea 4; echo 'Bytecode length: 9'; } >"$d/names"
  check "count: exact name (read never matches read.set, reader; rea never matches read)" \
    "$(awk -v fn=read "$COUNT_AWK" "$d/names")|$(awk -v fn=rea "$COUNT_AWK" "$d/names")" "1 0 106|1 0 9"
  { hdr f 1; echo 'Bytecode length: 106'; hdr f 2; echo 'Bytecode length: 35'
    hdr g 5; echo 'Bytecode length: 7'; hdr f 3; echo 'Bytecode length: 210'; hdr f 4; echo 'Bytecode length: 106'
    hdr f 6; hdr g 7; echo 'Bytecode length: 7'; hdr f 8; } >"$d/dups"
  check "count: same-name functions keep every length in input order (duplicates kept)" \
    "$(awk -v fn=f "$COUNT_AWK" "$d/dups")" "6 2 106,35,210,106"
  { hdr f 1; echo 'Parameter count 3'; hdr f 2; echo 'Bytecode length: 6'; hdr f 3; } >"$d/bad"
  check "count: a matched header not followed by 'Bytecode length: N' is counted bad (also at EOF)" \
    "$(awk -v fn=f "$COUNT_AWK" "$d/bad")" "3 2 6"
  { printf '[generated bytecode for function:  (0x1 <SharedFunctionInfo>)]\n'; echo 'Bytecode length: 400'
    hdr 'get value' 2; echo 'Bytecode length: 8'; } >"$d/anon"
  check "count: getter name with a space, anonymous (empty) name" \
    "$(awk -v fn='get value' "$COUNT_AWK" "$d/anon")|$(awk -v fn= "$COUNT_AWK" "$d/anon")" "1 0 8|1 0 400"
  check "count: no match -> 0 0 -" "$(awk -v fn=nosuch "$COUNT_AWK" "$d/dups")|$(awk -v fn=x "$COUNT_AWK" /dev/null)" "0 0 -|0 0 -"
  sed -e 's/0x\([0-9a-f]*\)/0x7ff\1abc/' "$d/dups" >"$d/dups2"
  judge f 999 "0 $(awk -v fn=f "$COUNT_AWK" "$d/dups")" "0 $(awk -v fn=f "$COUNT_AWK" "$d/dups2")"
  check "null control: captures differing only in 0x addresses compare SAME (past the null control)" \
    "$(cmp -s "$d/dups" "$d/dups2" && echo raw-same || echo raw-differs)|$JV|${JWHY%% (*}" \
    "raw-differs|NO-VERDICT|2 of 6 matched header(s) not followed by 'Bytecode length: N' in run 1"
  judge f 999 "0 1 0 6" "0 1 0 7"
  check "null control: run 2 with a changed length -> NO-VERDICT" "$JV|${JWHY%% (*}" "NO-VERDICT|null control: run 2 differs from run 1"
  judge f 6 "0 1 0 6" "0 1 0 6"
  check "gate: a length equal to the max is WITHIN (> not >=)" "$JV|$JWHY" "WITHIN|every length <= max 6"
  judge f 18 "0 2 0 6,19" "0 2 0 6,19" "0 2 0 6,19"
  check "gate: every same-name match is gated (6,19 vs 18 -> OVER)" "$JV|$JWHY" "OVER|length(s) 19 > max 18"
  judge lazy 100 "0 0 0 -" "0 0 0 -"
  check "judge: no match -> NO-VERDICT naming the fn" "$JV|$JWHY" \
    "NO-VERDICT|no function named 'lazy' in run 1 (not compiled: never called / lazy, or no such name)"
  judge f 100 "0 2 1 6" "0 2 1 6"
  check "judge: a bad header -> NO-VERDICT" "$JV|${JWHY%% (*}" "NO-VERDICT|1 of 2 matched header(s) not followed by 'Bytecode length: N' in run 1"
  judge f 100 "0 1 0 6" "3 0 0 -"
  check "judge: a driver exit != 0 in any run -> NO-VERDICT" "$JV|$JWHY" "NO-VERDICT|driver exited 3 in run 2"
  judge f "" "0 4 0 6,5,6,6" "0 4 0 6,5,6,6"
  check "judge: report mode (no max) -> REPORTED" "$JV|$JWHY" "REPORTED|4 match(es), not gated"
  check "worst: NO-VERDICT > OVER > WITHIN (either order)" \
    "$(vworst OVER NO-VERDICT) $(vworst NO-VERDICT OVER) $(vworst WITHIN OVER) $(vworst WITHIN WITHIN) $(vworst REPORTED NO-VERDICT)" \
    "NO-VERDICT NO-VERDICT OVER WITHIN NO-VERDICT"
  local x got=""
  for x in add '$x' _y 'get value' Store.read a.b 'get  value' 1x '' 'a b c' 'a-b'; do
    if [[ "$x" =~ $FN_RE ]]; then got="$got+"; else got="$got-"; fi
  done
  check "fn names: add \$x _y 'get value' accepted; Store.read a.b 'get  value' 1x '' 'a b c' a-b refused" "$got" "++++-------"
  local TF_SMALL=30 TF_SMALL_HN=75 TF_ONE=460 MG_EAGER=30 MG_SMALL=27 MG_ONE=100
  check "crossings: lib limits with cross() operators (TF <=, Maglev eager / single <, small <=)" \
    "$(over_limits 27)|$(over_limits 30)|$(over_limits 100)|$(over_limits 461)" \
    "within every limit|over Maglev eager (greedy small) (<30), Maglev small (<=27)|over TurboFan small (<=30), TurboFan small where a HeapNumber may cross the call (<=75), Maglev eager (greedy small) (<30), Maglev small (<=27), Maglev single-inline (<100)|over TurboFan small (<=30), TurboFan small where a HeapNumber may cross the call (<=75), TurboFan single-inline (<=460), Maglev eager (greedy small) (<30), Maglev small (<=27), Maglev single-inline (<100)"

  # --- this script end to end, with a fake node (logs argv, prints a version, cats a capture per filter) ---
  local fk="$d/fk" drv="$d/drv/driver.mjs" rc out
  mkdir -p "$fk" "$d/drv" "$d/tmp" "$d/cwd"; : >"$drv"
  printf '%s\n' '#!/bin/sh' 'd=$(dirname "$0")' 'printf "%s\n" "$*" >>"$d/log"' \
    'case "$1" in --version) echo "${FAKE_VER:-v26.8.2}"; exit 0 ;; --v8-options) exit 0 ;; esac' \
    'f=""; for a; do case "$a" in --print-bytecode-filter=*) f="${a#--print-bytecode-filter=}" ;; esac; done' \
    'n=$(( $(cat "$d/$f.n" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$d/$f.n"' \
    'src="$d/$f.txt"; [ -f "$d/$f.$n.txt" ] && src="$d/$f.$n.txt"' \
    '[ -f "$src" ] && sed "s/(0x/(0x$n/" "$src"' 'exit "${FAKE_RC:-0}"' >"$fk/node"
  chmod +x "$fk/node"
  cp "$d/add" "$fk/add.txt"; : >"$fk/lazy.txt"
  { hdr mid 1; echo 'Bytecode length: 211'; } >"$fk/mid.txt"
  { hdr dup 1; echo 'Bytecode length: 6'; hdr dup 2; echo 'Bytecode length: 19'; } >"$fk/dup.txt"
  { hdr read 1; echo 'Bytecode length: 6'; hdr read 2; echo 'Bytecode length: 5'
    hdr read 3; echo 'Bytecode length: 6'; hdr read 4; echo 'Bytecode length: 6'; } >"$fk/read.txt"
  spawn() { # ENV|- args... -> "rc|VERDICT line|node spawns"; output in $d/sp.out
    local -a e=()
    [[ "$1" == - ]] || e=("$1")
    shift
    rm -f "$fk"/*.n; : >"$fk/log"
    (cd "$d/cwd" && env ${e[@]+"${e[@]}"} TMPDIR="$d/tmp" "$BASH" "$SELF" --node "$fk/node" "$@") >"$d/sp.out" 2>&1 && rc=0 || rc=$?
    printf '%s|%s|%s' "$rc" "$(grep '^VERDICT ' "$d/sp.out" || true)" "$(wc -l <"$fk/log" | tr -d ' ')"
  }
  has() { grep -c -e "$1" "$d/sp.out" || true; }
  check "gate (fake node): 3 fns within -> exit 0; 8 spawns (--version, --v8-options, 3 fns x 2 runs)" \
    "$(spawn - --max add=6,mid=211,dup=19 --node-version v26.8.2 "$drv")" "0|VERDICT WITHIN|8"
  check "without --out nothing is written to disk (cwd and TMPDIR stay empty)" \
    "$(find "$d/tmp" "$d/cwd" -mindepth 1 | wc -l | tr -d ' ')" 0
  check "gate (fake node): over -> exit 1 OVER (FINAL=1 keeps the planned exit), reason names fn" \
    "$(spawn - --max mid=210 --node-version v26.8.2 "$drv")|$(has '^  mid: OVER -- length(s) 211 > max 210$')" "1|VERDICT OVER|4|1"
  check "gate (fake node): every same-name function is gated (dup 6,19 vs 18 -> OVER)" \
    "$(spawn - --max dup=18 --node-version v26.8.2 "$drv")" "1|VERDICT OVER|4"
  check "gate (fake node): node version mismatch -> exit 2 before any probe (1 spawn), reason names fn" \
    "$(spawn FAKE_VER=v26.8.1 --max mid=1 --node-version v26.8.2 "$drv")|$(has '^  mid: NO-VERDICT -- node version mismatch: ')" \
    "2|VERDICT NO-VERDICT|1|1"
  check "fn regex: a qualified name (Store.read) exits 2 with 0 spawns" \
    "$(spawn - --max Store.read=1 --node-version v26.8.2 "$drv")" "2|VERDICT NO-VERDICT|0"
  check "report mode (fake node): exit 0 REPORTED; read = 4 matches in input order" \
    "$(spawn - --fn read,dup "$drv")|$(has '^  read: 4 match(es): 6,5,6,6$')" "0|VERDICT REPORTED|6|1"
  check "lazy (no match) -> exit 2 NO-VERDICT, reason names fn" \
    "$(spawn - --max lazy=100 --node-version v26.8.2 "$drv")|$(has "^  lazy: NO-VERDICT -- no function named 'lazy' in run 1")" \
    "2|VERDICT NO-VERDICT|4|1"
  check "driver exit 1 -> exit 2 NO-VERDICT (never OVER)" \
    "$(spawn FAKE_RC=1 --max mid=1 --node-version v26.8.2 "$drv")|$(has '^  mid: NO-VERDICT -- driver exited 1 in run 1$')" \
    "2|VERDICT NO-VERDICT|4|1"
  { hdr mid 1; echo 'Bytecode length: 212'; } >"$fk/mid.2.txt"
  check "null control (fake node): run 2 prints another length -> exit 2 NO-VERDICT" \
    "$(spawn - --max mid=211 --node-version v26.8.2 "$drv")|$(has '^  mid: NO-VERDICT -- null control: run 2 differs from run 1')" \
    "2|VERDICT NO-VERDICT|4|1"
  rm -f "$fk/mid.2.txt"
  check "--out: report.txt + raw/ with one raw file per fn per run, 0x addresses kept raw" \
    "$(spawn - --out "$d/o" --max add=6,mid=211,dup=19 --node-version v26.8.2 "$drv")|$(grep -c '^VERDICT WITHIN$' "$d/o/report.txt" || true)|$(find "$d/o/raw" -type f | wc -l | tr -d ' ')|$(cat "$d/o/raw/dup.2.txt" | grep -c '(0x21 ' || true)" \
    "0|VERDICT WITHIN|8|1|6|1"
  got=""
  for x in '--fn add,add' '--runs 1 --fn add' '--runs 21 --fn add' '--fn add --max add=1 --node-version v26.8.2' \
    '--fn add --v8-flags --print_bytecode' '--fn add --v8-flags x.js' '--max add=1' '--max add=x --node-version v26.8.2' \
    '--max add=1 --node-version 26.8.2' '--fn add --nod-version v26.8.2' '--fn add'; do
    # shellcheck disable=SC2086
    out=$(spawn - $x "$drv"); got="$got${out%%|*}:${out##*|} "
  done
  out=$(spawn - --fn add); got="$got${out%%|*}:${out##*|} "
  out=$(spawn - --fn add "$drv" "$drv"); got="$got${out%%|*}:${out##*|}"
  check "refused before any spawn (exit 2, 0 spawns): repeated fn, runs 1 / 21, --fn with --max, *print-bytecode* / non-flag v8 flag, no --node-version, bad N, bad version, unknown option; then a valid --fn add runs; no DRIVER, two DRIVERs" \
    "$got" "2:0 2:0 2:0 2:0 2:0 2:0 2:0 2:0 2:0 2:0 0:4 2:0 2:0"

  if [[ -n "$FIXTURES" ]]; then
    # TASK 0 census (grep -A1 over the captures, no script awk): every matched header has its length line.
    local row file fn want pairs="" mis=""
    while IFS='|' read -r file fn want; do
      if [[ -r "$FIXTURES/$file" ]]; then got=$(awk -v fn="$fn" "$COUNT_AWK" "$FIXTURES/$file"); else got="missing $file"; fi
      check "fixture $file [$fn]" "$got" "$want"
      pairs="$pairs$file|$fn"$'\n'
    done <<'EOF'
add.txt|add|1 0 6
mid.txt|mid|1 0 211
big.txt|big|1 0 628
read.txt|read|4 0 6,5,6,6
Store.read.txt|Store.read|0 0 -
get-value.txt|get value|1 0 8
make.txt|make|1 0 11
dup.txt|dup|2 0 6,19
lazy.txt|lazy|0 0 -
inner.txt|inner|1 0 6
nosuchfn.txt|nosuchfn|0 0 -
empty-filter.txt||5 0 5,119,400,6,6
re-star.txt|read|4 0 6,5,6,6
all.txt|add|1 0 6
all.txt|mid|1 0 211
all.txt|big|1 0 628
all.txt|read|4 0 6,5,6,6
all.txt|dup|2 0 6,19
all.txt|inner|1 0 6
all.txt|lazy|0 0 -
all.txt|Store|1 0 8
all.txt|get value|1 0 8
EOF
    if [[ -r "$FIXTURES/v8-options-excerpt.txt" && -r "$FIXTURES/limits.txt" ]]; then
      got=$(awk "$LIMITS_AWK" "$FIXTURES/v8-options-excerpt.txt" | cmp -s - "$FIXTURES/limits.txt" && echo same || echo differs)
    else got="missing v8-options-excerpt.txt or limits.txt"; fi
    check "fixture LIMITS_AWK(v8-options-excerpt.txt) == limits.txt" "$got" same
    pairs="${pairs}re-star.txt|re*"$'\n'
    while IFS='|' read -r file fn; do
      [[ -n "$file" ]] || continue
      if [[ ! -r "$FIXTURES/$file" ]]; then mis="$mis missing:$file"; continue; fi
      row=$(awk -v fn="$fn" "$COUNT_AWK" "$FIXTURES/$file"); row="${row##* }"; [[ "$row" != - ]] || row=""
      row=$(distinct "$row" | awk 'NF' | paste -sd, -)
      [[ "$row" == "$(awk -v fn="$fn" "$BYTECODE_AWK" "$FIXTURES/$file")" ]] || mis="$mis $file[$fn]"
    done <<<"$pairs"
    check "fixture distinct(COUNT_AWK) == BYTECODE_AWK on all 23 pairs" "${mis:-none}" none
  fi
  rm -rf "$d"; echo
  if [[ $fails -eq 0 ]]; then echo "self-test: all checks passed"; return 0; fi
  echo "self-test: $fails check(s) FAILED"; return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned)
# ---------------------------------------------------------------------------------------------
FNLIST=""; MAXLIST=""; WANT_VER=""; RUNS=2; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""
SELFTEST=0; FIXTURES=""; POS=(); GOTOPT=" "
OPTS="--fn --max --node-version --runs --node --v8-flags --out --self-test --fixtures --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
# @include lib/args.sh
while [[ $# -gt 0 ]]; do
  a="$1"; v=""; EQ=0
  case "$a" in --*=*) v="${a#*=}"; a="${a%%=*}"; EQ=1 ;; esac
  case "$a" in
    -h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; exit 2 ;;
    --self-test) [[ $EQ -eq 0 ]] || die "$a takes no value"; SELFTEST=1 ;;
    --fn|--max|--node-version|--runs|--node|--v8-flags|--out|--fixtures)
      [[ "$GOTOPT" != *" $a "* ]] || die "$a given twice (give one comma list)"
      GOTOPT="$GOTOPT $a "
      if [[ $EQ -eq 0 ]] && ! need "$@"; then shift; fi
      [[ -n "$v" ]] || die "$a needs a non-empty value"
      case "$a" in
        --fn) FNLIST="$v" ;; --max) MAXLIST="$v" ;; --node-version) WANT_VER="$v" ;; --runs) RUNS="$v" ;;
        --node) NODE_BIN="$v" ;; --v8-flags) V8FLAGS="$v" ;; --out) OUT="$v" ;; --fixtures) FIXTURES="$v" ;;
      esac ;;
    -*) die "unknown option $a$(hint "$a") (see --help)" ;;
    *) POS+=("$a") ;;
  esac
  shift
done

if [[ $SELFTEST == 1 ]]; then
  g="${GOTOPT// --fixtures /}"
  [[ -z "${g// /}" && ${#POS[@]} -eq 0 ]] || die "--self-test takes only --fixtures DIR"
  if [[ -n "$FIXTURES" ]]; then [[ -d "$FIXTURES" && -r "$FIXTURES" && -x "$FIXTURES" ]] || die "--fixtures: not a readable directory: $FIXTURES"; fi
  if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi
fi
[[ -z "$FIXTURES" ]] || die "--fixtures goes with --self-test"
[[ "$FNLIST$MAXLIST$V8FLAGS" != *$'\n'* ]] || die "--fn / --max / --v8-flags: a newline is not allowed"

[[ -n "$FNLIST$MAXLIST" ]] || die "need --fn LIST (report) or --max fn=N[,fn=N] (gate) (see --help)"
[[ -z "$FNLIST" || -z "$MAXLIST" ]] || die "--fn (report) and --max (gate) are exclusive: give one"
[[ "$FNLIST$MAXLIST" != ,* && "$FNLIST$MAXLIST" != *, && "$FNLIST$MAXLIST" != *,,* ]] \
  || die "--fn / --max: empty entry (stray comma)"
TARGETS=(); MAXES=()
if [[ -n "$MAXLIST" ]]; then
  IFS=, read -r -a ENTS <<<"$MAXLIST"
  for e in ${ENTS[@]+"${ENTS[@]}"}; do
    [[ "$e" == *=* ]] || die "--max entries are fn=N, got '$e'"
    n="${e#*=}"
    [[ "$n" =~ ^[0-9]{1,9}$ ]] || die "--max ${e%%=*}: N must be an integer of 1..9 digits, got '$n'"
    TARGETS+=("${e%%=*}"); MAXES+=("$((10#$n))")
  done
  [[ -n "$WANT_VER" ]] || die "gate mode (--max) needs --node-version vX.Y.Z: the node version the maxima were taken on"
else
  IFS=, read -r -a TARGETS <<<"$FNLIST"
fi
[[ ${#TARGETS[@]} -gt 0 ]] || die "no function named (--fn / --max is empty)"
SEEN="|"
for t in "${TARGETS[@]}"; do
  [[ "$t" =~ $FN_RE ]] || die "fn must be a short V8 function name (e.g. read, get value; never Store.read), got '$t'"
  [[ "$SEEN" != *"|$t|"* ]] || die "fn '$t' is given twice"
  SEEN="$SEEN$t|"
done
[[ -z "$WANT_VER" || "$WANT_VER" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "--node-version must be vX.Y.Z (as \`node --version\` prints it), got '$WANT_VER'"
[[ "$RUNS" =~ ^[0-9]{1,2}$ ]] && RUNS=$((10#$RUNS)) && [[ $RUNS -ge 2 && $RUNS -le 20 ]] \
  || die "--runs must be an integer in [2, 20] (null control), got '$RUNS'"
read -r -a V8_EXTRA <<<"$V8FLAGS" || true
[[ -z "$V8FLAGS" || ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
  [[ "$f" == --* ]] || die "--v8-flags takes flags only (each starts with --), got '$f'"
  g="${f//_/-}"
  [[ "$g" != *print-bytecode* ]] || die "--v8-flags must not set $f: the probe sets --print-bytecode itself"
  g="${g#--}"; g="${g%%=*}"; g="${g#no}"; g="${g#-}"
  case "$g" in
    max*inlined*bytecode*)
      [[ "$f" =~ ^--[^=]+=[0-9]{1,9}$ && "${f:2:2}" != no ]] || die "--v8-flags: $f needs =N (an integer of 1..9 digits)" ;;
    reserve*inline*budget*)
      [[ "$f" =~ ^--[^=]+=[0-9]{1,9}(\.[0-9]{1,9})?$ && "${f:2:2}" != no ]] || die "--v8-flags: $f needs =X (a decimal number, e.g. 1.2)" ;;
  esac
done
[[ ${#POS[@]} -eq 1 ]] || die "need exactly one DRIVER file, got ${#POS[@]} (see --help)"
[[ -f "${POS[0]}" ]] || die "DRIVER not found (or not a file): ${POS[0]}"
DRV_DIR=$(cd "$(dirname "${POS[0]}")" && pwd); DRV_BASE=$(basename "${POS[0]}")
command -v "$NODE_BIN" >/dev/null 2>&1 || die "node binary not found: $NODE_BIN"
if [[ "$NODE_BIN" == */* ]]; then NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"; fi
if [[ -n "$OUT" ]]; then
  mkdir -p "$OUT/raw" 2>/dev/null || die "--out: cannot create $OUT/raw"
  OUT=$(cd "$OUT" && pwd)
  [[ -z "$(ls -A "$OUT/raw")" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
  REPORT="$OUT/report.txt"; : >"$REPORT"
else
  REPORT=/dev/null   # nothing is written to disk without --out
fi

# ---------------------------------------------------------------------------------------------
# node version (S-6): checked before any probe
# ---------------------------------------------------------------------------------------------
GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"
if [[ -n "$MAXLIST" ]]; then MODE="gate (maxima for node $WANT_VER)"; else MODE="report"; fi
say "bytecode-budget  node $GOT_VER  $NODE_BIN  (NODE_OPTIONS stripped)"
say "driver  $DRV_DIR/$DRV_BASE"
say "mode    $MODE  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }--print-bytecode --print-bytecode-filter=<fn>"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
if [[ -n "$WANT_VER" && "$GOT_VER" != "$WANT_VER" ]]; then
  for t in "${TARGETS[@]}"; do
    if [[ -n "$MAXLIST" ]]; then w="the maxima are for $WANT_VER"; else w="--node-version is $WANT_VER"; fi
    say "  $t: NO-VERDICT -- node version mismatch: $NODE_BIN --version is $GOT_VER, $w"
  done
  say "VERDICT NO-VERDICT"
  FINAL=1; exit 2
fi

# ---------------------------------------------------------------------------------------------
# limits (from this node binary, then --v8-flags overrides)
# ---------------------------------------------------------------------------------------------
# @include lib/v8limits.sh
for f in TF_SMALL TF_SMALL_HN TF_ONE MG_EAGER MG_SMALL MG_ONE; do
  [[ "${!f}" =~ ^[0-9]{1,9}$ ]] || die "inlining limit $f='${!f}' is not an integer (check --v8-flags)"
  printf -v "$f" '%s' "$((10#${!f}))"
done
say "limits  TurboFan small<=$TF_SMALL (<=$TF_SMALL_HN if a HeapNumber may cross) single<=$TF_ONE | Maglev eager (greedy small)<$MG_EAGER small<=$MG_SMALL single<$MG_ONE"
if [[ -n "$ASSUMED" ]]; then
  say "NOTE    limits not reported by this node binary, ASSUMED (node 26 defaults; crossings may be wrong):$ASSUMED"
fi
say ""

# ---------------------------------------------------------------------------------------------
# probe: fn x runs, each reduced to "<driver exit> <count> <bad> <lengths>"
# ---------------------------------------------------------------------------------------------
probe() { # fn k
  local rc=0 line
  if [[ -n "$OUT" ]]; then
    line=$( (cd "$DRV_DIR" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} --print-bytecode \
      --print-bytecode-filter="$1" "$DRV_BASE" 2>&1) | tee "$OUT/raw/${1// /-}.$2.txt" | awk -v fn="$1" "$COUNT_AWK") || rc=$?
  else
    line=$( (cd "$DRV_DIR" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} --print-bytecode \
      --print-bytecode-filter="$1" "$DRV_BASE" 2>&1) | awk -v fn="$1" "$COUNT_AWK") || rc=$?
  fi
  printf '%s %s\n' "$rc" "$line"
}

if [[ -n "$MAXLIST" ]]; then VERDICT=WITHIN; else VERDICT=REPORTED; fi
i=0
for fn in "${TARGETS[@]}"; do
  max=""; [[ -z "$MAXLIST" ]] || max="${MAXES[$i]}"
  i=$((i + 1))
  RL=()
  for k in $(seq 1 "$RUNS"); do RL+=("$(probe "$fn" "$k")"); done
  judge "$fn" "$max" "${RL[@]}"
  if [[ "${RL[0]}" =~ $LINE_RE ]]; then
    read -r _ n _ lens <<<"${RL[0]}"
    say "  $fn: $n match(es): $lens"
    if [[ "$lens" != - ]]; then
      while IFS= read -r l; do say "    $l bytes: $(over_limits "$l")"; done < <(distinct "$lens")
    fi
  fi
  say "  $fn: $JV -- $JWHY"
  VERDICT=$(vworst "$VERDICT" "$JV")
done
say ""
say "VERDICT $VERDICT"
FINAL=1
case "$VERDICT" in WITHIN|REPORTED) exit 0 ;; OVER) exit 1 ;; *) exit 2 ;; esac
