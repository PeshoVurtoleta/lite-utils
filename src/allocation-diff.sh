#!/usr/bin/env bash
# allocation-diff.sh -- young-generation GC EVENT COUNTS inside a marked window of a driver, DRIVER_BEFORE vs
# DRIVER_AFTER (diff mode) or one DRIVER against none (--zero), on one node binary. Counts, never bytes.
#
#   allocation-diff.sh [opts] DRIVER_BEFORE DRIVER_AFTER     diff mode: SAME / DIFF
#   allocation-diff.sh [opts] --zero DRIVER                  gate mode: ZERO / NONZERO
#   allocation-diff.sh --self-test                           canned checks, no real node
#   allocation-diff.sh -h | --help                           this text
#
# Options
#   --zero             gate mode: exactly one DRIVER. No young GC in the window of run 1 (and every run equal to
#                      run 1) -> ZERO, exit 0; else NONZERO, exit 1. Takes no value.
#   --runs N           node runs per side, 2..20 (default 3). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node)
#   --v8-flags STR     extra V8 flags for every run, split on spaces (flags only, each starting with --). Refused,
#                      with `_` read as `-`: any *trace-gc*, *semi-space* or *concurrent-recompilation* flag (the
#                      script sets the trace and a fixed 1 MB semi-space) and any *predictable-gc-schedule* flag
#                      (it forces both semi-space sizes to 4 MB)
#   --out DIR          keep DIR/report.txt, DIR/raw/<side>/run.<k>.txt (the raw stdout of run k) and
#                      DIR/raw/<side>/run.<k>.err (its stderr); <side> = before / after, or driver with --zero.
#                      DIR/raw must be absent or empty; DIR/report.txt must not be a DRIVER. With or without
#                      --out, the guard preload and its counts live in a private temp dir under $TMPDIR (else
#                      /tmp), removed on exit; without --out nothing else is written.
#   --self-test        canned checks: one "ok <label>" or "FAIL <label>: <got>" line per check, then
#                      "self-test: <C> check(s) ok" (exit 0) or "self-test: <n> check(s) FAILED" (exit 1)
#   -h, --help         this text (exit 2)
#   Each value option is given at most once and never empty; --v8-flags / --out / --node and DRIVER paths take no
#   newline. --self-test takes no other argument. --zero / --self-test / --help take no =value.
#
# DRIVER: an existing readable file (two in diff mode, one with --zero), each run as
#   `node [v8 flags] --trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation
#   --require <tmp>/gcn.cjs DRIVER 3><tmp>/gcn.<side>.<k>` with cwd = its directory, NODE_OPTIONS stripped, stderr to
#   its own file (never merged into stdout), stdout piped through tee (to the --out raw file, else /dev/null), tr
#   (every NUL byte becomes `?`; the raw file keeps the NUL) and the record awk. Only records are held in memory,
#   never trace text. Runs alternate before / after, k = 1..N.
# Guard: gcn.cjs (the tool's own preload, an absolute path) counts the run's GCs with v8.GCProfiler. Its 'exit'
#   listener, registered before any driver listener, allocates past two semi-spaces (>= 1 young GC after `end`: the
#   exit fence), writes `@@LITE-MARK gcn` to fd 1, then the count to fd 3. The count must equal g (below), else the
#   side reads NO-VERDICT: it catches a GC line lost from the trace (or glued after other text outside the window),
#   not a line moved across a marker nor a loss cancelled by extra lines.
# Markers: whole lines on stdout, each exactly once, in this order: `@@LITE-MARK start`, `@@LITE-MARK end`, then
#   `@@LITE-MARK gcn` (reserved: the guard's exit fence). Any other `@@LITE-MARK` line (e.g. `@@LITE-MARK op 7`) is
#   ignored. The output after gcn is read to EOF, never parsed (a second gcn line excepted).
# GC line: a line starting `[<digits>:0x` must match the whole --trace-gc line grammar (tail-anchored). Its kind =
#   the text between ` ms: ` and the first numeric token, one trailing ` (during sweeping)` dropped. Young = exactly
#   Scavenge, Minor Mark-Sweep, whose lines end `; ` (no collector text); old = exactly Mark-Compact, Incremental
#   Mark-Compact, whose lines end `; GC in old space requested`. These collector texts are the ones recorded on node
#   v26.8.2, not every text node can print: a GC line with any other reads X (NO-VERDICT), as does a line of one
#   class with the other class's text. Any other kind inside the window reads X; outside it, it is only counted.
# Records (pid, address, ms, MB, pause and reason never reach a record):
#   Y <kind> / O <kind>   one per young / old GC line strictly inside the window (between start and end)
#   X <why>               the output cannot be read: a GC line that fails the grammar or the kind / collector
#                         pairing (gc-tail-kind); an unknown kind in the window; `[<digits>:0x` after other text on
#                         a line in the window (a NUL byte counts as text); a marker missing, given twice or out of
#                         order; a line holding `@@LITE-MARK start`, `@@LITE-MARK end` or `@@LITE-MARK gcn` that is
#                         not exactly that line
#   G <g> <p>             last: g = GC lines before gcn, p = those between end and gcn
# NO-VERDICT reasons (per side, first that applies; each checked over runs k = 1..N before the next):
#   cannot read driver output in run <k> (<tee|tr|awk> exited <rc>)   (in one run the first failure in the order
#                                    awk > tr > tee > driver exit is named)
#   driver exited <rc> in run <k>
#   unparseable --trace-gc output in run <k>: <why>          (<why> = the run's first X record)
#   no GC line between @@LITE-MARK end and the tool's exit fence in run <k>   (tracing not shown to be on)
#   no guard count in run <k>        (the fd-3 count is missing, empty or not one decimal line; never read as 0)
#   trace lost <d> GC line(s) in run <k> (guard count <c>, trace <g>)               (g < count)
#   <d> GC line(s) in run <k> the guard did not count (guard count <c>, trace <g>)   (g > count)
#   old-generation GC in the window in run <k> (<kind>)     (a full GC empties the young generation)
#   null control: run <k> differs from run 1 (<n> kind(s) differ, first: run 1 x<a> | run <k> x<b>  <kind>)
# Report: a head (node, drivers with sha256/8, mode, flags), per side whose run 1 exited 0 its counts line
#   "  <side>: run 1 young <y> [<kind> x<n>, ..], old <o> in the window; <g> GC line(s) before the fence, <p> after
#   end; young per run <y1>,<y2>,.." (REPORTED), the verdict line(s), a blank line and "VERDICT <v>". Diff mode:
#   "  SAME -- identical young-GC multiset in the window (before <y> | after <y>)" or "  DIFF -- ..." then per kind
#   whose count differs "    before=<n> after=<m>  <kind>"; --zero: "  ZERO -- ..." or "  NONZERO -- ...";
#   "  NO-VERDICT -- <side>: <reason>". Exit 0 SAME / ZERO, 1 DIFF / NONZERO, 2 NO-VERDICT. Every refused argument
#   exits 2 before any node is spawned and before anything is written. Spawns: one `node --version` (a failing one
#   exits 2 before anything is written), then 2 x runs driver runs (1 x runs with --zero).
# Tier: the script logic is DETERMINISTIC (--self-test); a verdict on a user driver is STATISTICAL, and REPORTED
#   only (this repo has no statistical host).
# Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.

# @include lib/prologue.sh

# ---------------------------------------------------------------------------------------------
# awk programs (POSIX awk: mawk, gawk, BSD awk)
# ---------------------------------------------------------------------------------------------

# @include lib/msdiff.sh

# --trace-gc stdout (NUL already `?`) -> Y / O / X records, then one G line. Records only: no trace text is printed.
# st: 0 before start, 1 in the window, 2 after end, 3 after gcn (read to EOF, never parsed; never exit early: tee
# would take a SIGPIPE). The GC line grammar is one whole-line tail-anchored ERE (PLAN-phase4-g1 A9 ERE', K
# expanded); the kind lists below are the only place young / old are defined.
# shellcheck disable=SC2016
GC_AWK='
function x(why) { print "X " why }
BEGIN { st = 0; ss = 0; se = 0; g = 0; p = 0 }
st == 3 { if ($0 == "@@LITE-MARK gcn") x("@@LITE-MARK gcn given twice"); next }
$0 == "@@LITE-MARK gcn" { if (st != 2) x("@@LITE-MARK gcn before @@LITE-MARK end"); st = 3; next }
/^\[[0-9]+:0x/ {
  if ($0 !~ /^\[[0-9]+:0x[0-9a-f]+\] +[0-9]+ ms: [A-Z][A-Za-z() -]* [0-9.]+ \([0-9.]+\) -> [0-9.]+ \([0-9.]+\) MB, pooled: [0-9.]+ MB, [0-9.]+ \/ [0-9.]+ ms (\(\+ [^()]*\) )?\(average mu = [0-9.]+, current mu = [0-9.]+\) [A-Za-z][A-Za-z ]*; (GC in old space requested)?$/) {
    x("GC line does not match the --trace-gc grammar"); next
  }
  k = $0; sub(/^\[[0-9]+:0x[0-9a-f]+\] +[0-9]+ ms: /, "", k); sub(/ [0-9].*$/, "", k); sub(/ \(during sweeping\)$/, "", k)
  yg = (k == "Scavenge" || k == "Minor Mark-Sweep"); od = (k == "Mark-Compact" || k == "Incremental Mark-Compact")
  if ((yg && $0 !~ /; $/) || (od && $0 !~ /; GC in old space requested$/)) { x("gc-tail-kind: a " k " line with a collector text that kind is not seen with"); next }
  g++
  if (st == 2) p++
  if (st == 1) {
    if (yg) print "Y " k
    else if (od) print "O " k
    else x("unknown GC kind \047" k "\047 in the window")
  }
  next
}
st == 1 && /\[[0-9]+:0x/ { x("GC line text not at line start in the window"); next }
$0 == "@@LITE-MARK start" { if (st != 0) x("@@LITE-MARK start given twice or after @@LITE-MARK end"); else { st = 1; ss = 1 }; next }
$0 == "@@LITE-MARK end" { if (st == 0) x("@@LITE-MARK end before @@LITE-MARK start"); else if (st == 2) x("@@LITE-MARK end given twice"); else { st = 2; se = 1 }; next }
index($0, "@@LITE-MARK start") > 0 || index($0, "@@LITE-MARK end") > 0 || index($0, "@@LITE-MARK gcn") > 0 {
  x("a line holding @@LITE-MARK start, end or gcn that is not exactly that marker line"); next
}
END {
  if (st < 3) {
    if (!ss) x("no @@LITE-MARK start"); else if (!se) x("no @@LITE-MARK end")
    x("no @@LITE-MARK gcn (the tool\047s exit fence)")
  }
  print "G " g " " p
}
'

# @include lib/common.sh

TRACE_FLAGS=(--trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation)
ST_RE='^@ ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+)$'
G_RE='^G ([0-9]+) ([0-9]+)$'
CNT_RE=$'^(0|[1-9][0-9]{0,8})\n$'   # the guard's fd-3 file: exactly one canonical decimal line

# gcn.cjs, the guard preload: written once per invocation into the private temp dir (text = PLAN-phase4-g1 TASK 0d's
# evidence/p4-guard/0d/gcn.cjs, byte for byte). A heredoc, never $( ): no trailing-newline loss.
gcn_cjs() {
cat <<'GCN_CJS'
'use strict';
// allocation-diff.sh guard preload (TASK 0d = 0c's gcn-id.cjs + the A6 exit fence). Counts the run's GCs
// with v8.GCProfiler; its 'exit' listener is registered here, before any driver listener, and on exit:
// (1) fence: 2^17 {a,b} into a 1024-slot ring (> 2 semi-spaces of 1 MB -> >= 1 young GC after `end`);
// (2) writes `@@LITE-MARK gcn` to fd 1; (3) reads the count; (4) writes it to fd 3. GCs caused by the read
// or by later 'exit' listeners land after gcn. The first 'beforeExit' starts a 2nd profiler and stops the
// 1st (its statistics array is the big allocation) with one more loop turn, so the GCs that causes are
// counted. Counted gcTypes: Scavenge, MinorMarkSweep, MarkSweepCompact (IncrementalMarking prints no
// --trace-gc line; an unknown type is not counted, so the count reads low and the judge fails closed).
const v8 = require('v8');
const fs = require('fs');
const gcnBuf = Buffer.alloc(24);
let gcnP = new v8.GCProfiler();
let gcnQ = null;
let gcnN = 0;
gcnP.start();
function gcnCount(st) {
  let n = 0;
  for (let i = 0; i < st.length; i++) {
    const t = st[i].gcType;
    if (t === 'Scavenge' || t === 'MinorMarkSweep' || t === 'MarkSweepCompact') n++;
  }
  return n;
}
function gcnNoop() {}
process.on('beforeExit', () => {
  if (gcnQ !== null) return;
  gcnQ = new v8.GCProfiler();
  gcnQ.start();
  gcnN = gcnCount(gcnP.stop().statistics);
  gcnP = null;
  setImmediate(gcnNoop);
});
process.on('exit', () => {
  const ring = new Array(1024).fill(null);
  for (let i = 0; i < 131072; i++) ring[i & 1023] = { a: i, b: i };
  fs.writeSync(1, '@@LITE-MARK gcn\n');
  let n = gcnN;
  if (gcnP !== null) n += gcnCount(gcnP.stop().statistics);
  if (gcnQ !== null) n += gcnCount(gcnQ.stop().statistics);
  let e = gcnBuf.length - 1;
  gcnBuf[e] = 10;
  do { gcnBuf[--e] = 48 + (n % 10); n = (n / 10) | 0; } while (n > 0);
  try { fs.writeSync(3, gcnBuf, e, gcnBuf.length - e); } catch (x) { /* fd 3 absent: no count (fails closed) */ }
});
GCN_CJS
}

# records -> the null-control multiset (Y and O, as "*<TAB><kind>"); records -> the verdict multiset (Y only)
nc_ms() { printf '%s\n' "$1" | awk '/^[YO] /{ print "*\t" substr($0, 3) }' | multiset; }
y_ms() { printf '%s\n' "$1" | awk '/^Y /{ print "*\t" substr($0, 3) }' | multiset; }
ycount() { printf '%s\n' "$1" | grep -c '^Y ' || true; }
# records -> "young <y> [<kind> x<n>, ..], old <o> in the window; <g> GC line(s) before the fence, <p> after end"
counts() {
  local y o u gl
  y=$(ycount "$1"); o=$(printf '%s\n' "$1" | grep -c '^O ' || true)
  u=$(printf '%s\n' "$1" | awk '/^Y /{ print substr($0, 3) }' | multiset | awk '{ n = $1; sub(/^ *[0-9]+ /, ""); printf "%s%s x%d", (NR > 1 ? ", " : ""), $0, n }')
  gl=${1##*$'\n'}
  if [[ "$gl" =~ $G_RE ]]; then gl="${BASH_REMATCH[1]} GC line(s) before the fence, ${BASH_REMATCH[2]} after end"; else gl="no G record"; fi
  printf 'young %s%s, old %s in the window; %s' "$y" "${u:+ [$u]}" "$o" "$gl"
}

# judge: one side. JRC[k-1] = the driver exit of run k (or "<tee|tr|awk> <rc>" when that tool failed), JREC[k-1] = the
# GC_AWK records of run k, JCNT[k-1] = the guard count of run k ("" = none). Sets JV (OK NO-VERDICT) and JWHY. Order,
# each over k = 1..N: driver output / exit, X record (and a readable G line), p = 0, the guard count vs g, an O record,
# the null control (Y+O multiset of run k vs run 1).
judge() {
  local n i x o last first nk dl g c d w
  local -a jp=() jg=()
  JV=NO-VERDICT; JWHY=""
  n=${#JRC[@]}
  for ((i = 0; i < n; i++)); do
    case "${JRC[$i]}" in
      0) ;;
      *' '*) JWHY="cannot read driver output in run $((i + 1)) (${JRC[$i]%% *} exited ${JRC[$i]#* })"; return 0 ;;
      *) JWHY="driver exited ${JRC[$i]} in run $((i + 1))"; return 0 ;;
    esac
  done
  for ((i = 0; i < n; i++)); do
    x=$(printf '%s\n' "${JREC[$i]}" | awk '!f && /^X /{ print substr($0, 3); f = 1 }')
    if [[ -n "$x" ]]; then JWHY="unparseable --trace-gc output in run $((i + 1)): $x"; return 0; fi
    last=${JREC[$i]##*$'\n'}
    if [[ ! "$last" =~ $G_RE ]]; then JWHY="unparseable --trace-gc output in run $((i + 1)): no G record"; return 0; fi
    jg[$i]=${BASH_REMATCH[1]}; jp[$i]=${BASH_REMATCH[2]}
  done
  for ((i = 0; i < n; i++)); do
    if [[ ${jp[$i]} == 0 ]]; then JWHY="no GC line between @@LITE-MARK end and the tool's exit fence in run $((i + 1))"; return 0; fi
  done
  for ((i = 0; i < n; i++)); do
    c=${JCNT[$i]:-}
    if [[ -z "$c" ]]; then JWHY="no guard count in run $((i + 1))"; return 0; fi
    g=$((10#${jg[$i]})); c=$((10#$c))
    if ((g < c)); then
      d=$((c - g)); w=lines; [[ $d != 1 ]] || w=line
      JWHY="trace lost $d GC $w in run $((i + 1)) (guard count $c, trace $g)"; return 0
    fi
    if ((g > c)); then
      d=$((g - c)); w=lines; [[ $d != 1 ]] || w=line
      JWHY="$d GC $w in run $((i + 1)) the guard did not count (guard count $c, trace $g)"; return 0
    fi
  done
  for ((i = 0; i < n; i++)); do
    o=$(printf '%s\n' "${JREC[$i]}" | awk '!f && /^O /{ print substr($0, 3); f = 1 }')
    if [[ -n "$o" ]]; then JWHY="old-generation GC in the window in run $((i + 1)) ($o)"; return 0; fi
  done
  first=$(nc_ms "${JREC[0]}")
  for ((i = 1; i < n; i++)); do
    nk=$(nc_ms "${JREC[$i]}")
    if [[ "$nk" != "$first" ]]; then
      dl=$(awk "$MSDIFF_AWK" <(printf '%s\n' "$first") <(printf '%s\n' "$nk") | sort -k3 \
        | awk -v k="$((i + 1))" '{ n++; if (n == 1) { l = $0; sub(/^  before=[0-9]+ after=[0-9]+  /, "", l); a = $1; b = $2
            sub(/^before=/, "", a); sub(/^after=/, "", b); f = "run 1 x" a " | run " k " x" b "  " l } }
          END { printf "%d kind(s) differ, first: %s", n, f }')
      JWHY="null control: run $((i + 1)) differs from run 1 ($dl)"; return 0
    fi
  done
  JV=OK
}

# side_line SIDE RC1 REC1 YLIST: the REPORTED counts line of one side (only when its run 1 exited 0)
side_line() { if [[ "$2" == 0 ]]; then say "  $1: run 1 $(counts "$3"); young per run $4"; fi; }

self_test() {
  # TASK 4 (B2) fills this in; until then it fails closed
  echo "FAIL self-test: no checks yet"
  echo
  echo "self-test: 1 check(s) FAILED"
  return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write)
# ---------------------------------------------------------------------------------------------
ZERO=0; RUNS=3; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; POS=(); GOTOPT=" "; REPORT=/dev/null; T=""
OPTS="--zero --runs --node --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
# @include lib/args.sh
while [[ $# -gt 0 ]]; do
  a="$1"; v=""; EQ=0
  case "$a" in --*=*) v="${a#*=}"; a="${a%%=*}"; EQ=1 ;; esac
  case "$a" in
    -h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; exit 2 ;;
    --self-test) [[ $EQ -eq 0 ]] || die "$a takes no value"; SELFTEST=1 ;;
    --zero) [[ $EQ -eq 0 ]] || die "$a takes no value"; ZERO=1 ;;
    --runs|--node|--v8-flags|--out)
      [[ "$GOTOPT" != *" $a "* ]] || die "$a given twice"
      GOTOPT="$GOTOPT $a "
      if [[ $EQ -eq 0 ]] && ! need "$@"; then shift; fi
      [[ -n "$v" ]] || die "$a needs a non-empty value"
      case "$a" in
        --runs) RUNS="$v" ;; --node) NODE_BIN="$v" ;; --v8-flags) V8FLAGS="$v" ;; --out) OUT="$v" ;;
      esac ;;
    -*) die "unknown option $a$(hint "$a") (see --help)" ;;
    *) POS+=("$a") ;;
  esac
  shift
done

if [[ $SELFTEST == 1 ]]; then
  [[ -z "${GOTOPT// /}" && ${#POS[@]} -eq 0 && $ZERO == 0 ]] || die "--self-test takes no other argument"
  if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi
fi
[[ "$V8FLAGS$OUT$NODE_BIN" != *$'\n'* ]] || die "--v8-flags / --out / --node: a newline is not allowed"
[[ "$RUNS" =~ ^[0-9]{1,2}$ ]] && RUNS=$((10#$RUNS)) && [[ $RUNS -ge 2 && $RUNS -le 20 ]] \
  || die "--runs must be an integer in [2, 20] (null control), got '$RUNS'"
read -r -a V8_EXTRA <<<"$V8FLAGS" || true
[[ -z "$V8FLAGS" || ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
  [[ "$f" == --* ]] || die "--v8-flags takes flags only (each starts with --), got '$f'"
  g="${f//_/-}"
  case "$g" in
    *trace-gc*|*concurrent-recompilation*)
      die "--v8-flags must not set $f: the script sets ${TRACE_FLAGS[*]} itself" ;;
    *semi-space*)
      die "--v8-flags must not set $f: the script fixes both semi-spaces at 1 MB (--min-semi-space-size=1 --max-semi-space-size=1)" ;;
    *predictable-gc-schedule*)
      die "--v8-flags must not set $f: it forces both semi-spaces to 4 MB (the script fixes them at 1 MB)" ;;
  esac
done
if [[ $ZERO == 1 ]]; then
  [[ ${#POS[@]} -eq 1 ]] || die "--zero takes exactly one DRIVER, got ${#POS[@]} (see --help)"
  SIDES=(driver)
else
  [[ ${#POS[@]} -eq 2 ]] || die "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]}; one DRIVER needs --zero (see --help)"
  SIDES=(before after)
fi
for ((i = 0; i < ${#POS[@]}; i++)); do
  [[ "${POS[$i]}" != *$'\n'* ]] || die "DRIVER: a newline is not allowed in a path"
  [[ -f "${POS[$i]}" && -r "${POS[$i]}" ]] || die "DRIVER (${SIDES[$i]}) not found (or not a readable file): ${POS[$i]}"
done
if [[ -n "$OUT" ]]; then
  [[ ! -e "$OUT" || -d "$OUT" ]] || die "--out: $OUT exists and is not a directory"
  [[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die "--out: $OUT/raw exists and is not a directory"
  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
  for ((i = 0; i < ${#POS[@]}; i++)); do   # -ef follows symlinks and sees hard links: refused before any truncation
    [[ ! "$OUT/report.txt" -ef "${POS[$i]}" ]] || die "--out: $OUT/report.txt is the DRIVER (${SIDES[$i]}) ${POS[$i]}"
  done
fi
NODE_RES=$(command -v "$NODE_BIN" 2>/dev/null) || die "node binary not found: $NODE_BIN"
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH (a function, alias or builtin?): $NODE_BIN -> $NODE_RES"
NODE_BIN="$(cd "$(dirname "$NODE_RES")" && pwd)/$(basename "$NODE_RES")"
DRV_DIR=(); DRV_BASE=(); DESC=()
for ((i = 0; i < ${#POS[@]}; i++)); do
  DRV_DIR[$i]=$(cd "$(dirname "${POS[$i]}")" && pwd); DRV_BASE[$i]=$(basename "${POS[$i]}")
  DESC[$i]="${DRV_DIR[$i]}/${DRV_BASE[$i]}  sha256/8 $(sha8 "${DRV_DIR[$i]}/${DRV_BASE[$i]}")"
done

# --- every refusal is above this line; spawns start here: --version, then disk writes, then the runs ---
GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"
# the temp dir (gcn.cjs, the guard counts, driver stderr without --out) goes on every exit path: this trap runs the
# prologue's EXIT trap after it (with $? restored; set +e so restoring a non-zero $? cannot cut the trap short). It is
# set before mktemp, and T is absolute from the start (a relative TMPDIR is taken from the caller's cwd).
eval "set -- $(trap -p EXIT)"; OLD_TRAP=${3:-}
# shellcheck disable=SC2064
trap "t_rc=\$?; if [[ -n \"\$T\" ]]; then rm -rf \"\$T\"; fi; set +e; (exit \$t_rc); $OLD_TRAP" EXIT
TB=${TMPDIR:-/tmp}; [[ "$TB" == /* ]] || TB="$PWD/$TB"
T=$(mktemp -d "$TB/allocation-diff.XXXXXX") || die "cannot create a temp dir in $TB"
gcn_cjs >"$T/gcn.cjs" || die "cannot write $T/gcn.cjs"
if [[ -n "$OUT" ]]; then
  for s in "${SIDES[@]}"; do mkdir -p "$OUT/raw/$s" 2>/dev/null || die "--out: cannot create $OUT/raw/$s"; done
  OUT=$(cd "$OUT" && pwd)
  REPORT="$OUT/report.txt"; : >"$REPORT"
fi
say "allocation-diff  node $GOT_VER  $NODE_BIN  (NODE_OPTIONS stripped)"
if [[ $ZERO == 1 ]]; then
  say "driver  ${DESC[0]}"
  say "mode    zero  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
else
  say "before  ${DESC[0]}"
  say "after   ${DESC[1]}"
  say "mode    diff  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
fi
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
say ""

# ---------------------------------------------------------------------------------------------
# runs: k = 1..R, before then after (or the one driver); each keeps its driver exit and its GC_AWK records
# ---------------------------------------------------------------------------------------------
RUN_RC=0; RUN_TX=""; RUN_CNT=""
run_side() { # dir base rawfile errfile cntfile: one node run of dir/base; sets RUN_RC (the driver exit, or
  # "<tee|tr|awk> <rc>"), RUN_TX, RUN_CNT (the guard count, "" when the count file is missing, empty or malformed)
  local tx st n t r a sz c
  # the pipeline's four exits (node, tee, tr, awk) ride on a last "@ n t r a" line, so a tee / tr / awk failure is never
  # reported as the driver's exit. Nothing reads stdout before tee (the fast reader); stderr goes to its own file, never
  # into the pipe. tr turns each NUL into `?` before awk (BSD awk cuts a line at a NUL, which would hide a GC line glued
  # after it); GC_AWK then reads the glue as X. $( ) holds GC_AWK's records only, never trace text. fd 3 (the guard
  # count file, truncated per run) is opened for node only, never for tee / tr / awk.
  tx=$( (cd "$1" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" \
    --require "$T/gcn.cjs" "$2" 2>"$4" 3>"$5") \
    | tee "${3:-/dev/null}" | tr '\000' '?' | awk "$GC_AWK"; printf '@ %s\n' "${PIPESTATUS[*]}")
  st=${tx##*$'\n'}
  if [[ "$tx" == *$'\n'* ]]; then tx=${tx%$'\n'*}; else tx=""; fi
  [[ "$st" =~ $ST_RE ]] || die "cannot read the exit status of the run of $1/$2 (got '$st')"
  n=${BASH_REMATCH[1]}; t=${BASH_REMATCH[2]}; r=${BASH_REMATCH[3]}; a=${BASH_REMATCH[4]}
  if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else RUN_RC=$n; fi
  RUN_TX="$tx"
  # the count: one canonical decimal line. Read with a sentinel (no trailing-newline loss) and length-checked against
  # the file size (bash drops a NUL byte from $( ), which would otherwise pass "1<NUL>2").
  RUN_CNT=""
  if [[ -f "$5" ]]; then
    sz=$(wc -c <"$5" | tr -d ' '); c=$(cat "$5"; printf x); c=${c%x}
    if [[ "${#c}" == "$sz" && "$c" =~ $CNT_RE ]]; then RUN_CNT=${BASH_REMATCH[1]}; fi
  fi
}
RC0=(); RC1=(); REC0=(); REC1=(); CN0=(); CN1=(); YL0=""; YL1=""
for k in $(seq 1 "$RUNS"); do
  for ((i = 0; i < ${#SIDES[@]}; i++)); do
    s=${SIDES[$i]}
    if [[ -n "$OUT" ]]; then raw="$OUT/raw/$s/run.$k.txt"; err="$OUT/raw/$s/run.$k.err"; else raw=""; err="$T/$s.run.$k.err"; fi
    run_side "${DRV_DIR[$i]}" "${DRV_BASE[$i]}" "$raw" "$err" "$T/gcn.$s.$k"
    if [[ "$RUN_RC" == 0 ]]; then y=$(ycount "$RUN_TX"); else y=-; fi
    if [[ $i == 0 ]]; then RC0+=("$RUN_RC"); REC0+=("$RUN_TX"); CN0+=("$RUN_CNT"); YL0="${YL0:+$YL0,}$y"
    else RC1+=("$RUN_RC"); REC1+=("$RUN_TX"); CN1+=("$RUN_CNT"); YL1="${YL1:+$YL1,}$y"; fi
  done
done

if [[ $ZERO == 1 ]]; then
  JRC=("${RC0[@]}"); JREC=("${REC0[@]}"); JCNT=("${CN0[@]}"); judge
  side_line driver "${RC0[0]}" "${REC0[0]}" "$YL0"
  if [[ $JV == NO-VERDICT ]]; then
    VERDICT=NO-VERDICT; say "  NO-VERDICT -- driver: $JWHY"
  else
    Y=$(ycount "${REC0[0]}")
    if [[ $Y -eq 0 ]]; then
      VERDICT=ZERO; say "  ZERO -- no young GC in the window (every run equal to run 1)"
    else
      VERDICT=NONZERO; say "  NONZERO -- $Y young GC(s) in the window (every run equal to run 1)"
    fi
  fi
else
  JRC=("${RC0[@]}"); JREC=("${REC0[@]}"); JCNT=("${CN0[@]}"); judge; VB=$JV; WB=$JWHY
  JRC=("${RC1[@]}"); JREC=("${REC1[@]}"); JCNT=("${CN1[@]}"); judge; VA=$JV; WA=$JWHY
  side_line before "${RC0[0]}" "${REC0[0]}" "$YL0"
  side_line after "${RC1[0]}" "${REC1[0]}" "$YL1"
  if [[ $VB == NO-VERDICT || $VA == NO-VERDICT ]]; then
    VERDICT=NO-VERDICT
    if [[ $VB == NO-VERDICT ]]; then say "  NO-VERDICT -- before: $WB"; fi
    if [[ $VA == NO-VERDICT ]]; then say "  NO-VERDICT -- after: $WA"; fi
  else
    MSB=$(y_ms "${REC0[0]}"); MSA=$(y_ms "${REC1[0]}"); YB=$(ycount "${REC0[0]}"); YA=$(ycount "${REC1[0]}")
    if [[ "$MSB" == "$MSA" ]]; then
      VERDICT=SAME; say "  SAME -- identical young-GC multiset in the window (before $YB | after $YA)"
    else
      VERDICT=DIFF; say "  DIFF -- young-GC multiset in the window differs (before $YB | after $YA)"
      while IFS= read -r l; do say "  $l"; done < <(awk "$MSDIFF_AWK" <(printf '%s\n' "$MSB") <(printf '%s\n' "$MSA") | sort -k3)
    fi
  fi
fi
say ""
say "VERDICT $VERDICT"
FINAL=1; case "$VERDICT" in SAME|ZERO) exit 0 ;; DIFF|NONZERO) exit 1 ;; *) exit 2 ;; esac
