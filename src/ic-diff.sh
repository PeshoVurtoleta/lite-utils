#!/usr/bin/env bash
# ic-diff.sh -- the INLINE-CACHE states of NAMED functions, DRIVER_BEFORE vs DRIVER_AFTER, on one node binary:
# per fn, the multiset of its IC sites (kind, key, final state) compared across the two drivers.
#
#   ic-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     driver mode: two drivers, one verdict
#   ic-diff.sh --self-test                                       canned checks, a fake node (no real node)
#   ic-diff.sh -h | --help                                       this text
#
#   e.g. ic-diff.sh --fn get,get\ value --v8-flags --no-lazy-feedback-allocation before/driver.js after/driver.js
#
# Options
#   --fn LIST          function names, comma separated (required)
#   --runs N           node runs per side, 2..20 (default 3). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node). Resolved ONCE, from the caller's directory, to an
#                      absolute path: a bare name through PATH (`command -v`; a function, alias or builtin is
#                      refused); a name with a slash is a path, never looked up on PATH. It must be an executable
#                      file, else exit 2 before any spawn ("node binary not found", "node binary is not a file on
#                      PATH (...)", "node binary is not an executable file", "node binary: cannot resolve the
#                      directory of ...", "node binary: a newline is not allowed in the resolved path",
#                      "node binary: an = is not allowed in the resolved path (env would read it as a NAME=value
#                      operand, not as the program): PATH"). The probes
#                      and every trace run (each in its driver's directory) run that one file, and the header names it.
#   --v8-flags STR     extra V8 flags for every trace run, split on spaces (flags only, each `--` and a letter).
#                      Refused, with `_` read as `-`: any *log*, *prof*, *concurrent-recompilation*,
#                      *interpreted-frames-native-stack* or *snapshot* flag, every --require* / --import* / --loader* /
#                      --experimental-loader* flag, a prefix match (a module of yours, preload or loader, is part of
#                      the measured process), every --env-file* / --experimental-config-file* /
#                      --experimental-default-config-file* flag, a prefix match (it loads environment variables or
#                      node options from a file into the measured process), and every --eval* / --print* flag, a
#                      prefix match (--eval / --print: node runs that code in the measured process instead of the
#                      driver, which becomes argv; V8's --print-* flags, e.g. --print-bytecode, print V8 internals
#                      into the measured run). -r / -e / -p are refused as non-flags.
#                      Refused too: any *stress-concurrent-inlining* flag (every spelling: --stress-concurrent-inlining
#                      implies --concurrent-recompilation in V8, which overrides the script's
#                      --no-concurrent-recompilation; a background compile makes the IC log a race).
#                      Accepted: V8 flags this node lists in --v8-options -- bool as --flag or --no-flag (never
#                      --noflag), numeric as --flag=N -- except log / trace / print / prof / perf / dump / snapshot /
#                      file flags. Refused, exit 2 at the latest after one --v8-options read and before any measured
#                      run: every node option (--run, --test, --watch, --check, --inspect, --cpu-prof, --snapshot-blob,
#                      ...), every string-valued V8 flag, and the tool's own flags above.
#   --out DIR          keep DIR/report.txt and DIR/raw/<side>/run.<k>.log (the IC log of run k) and
#                      DIR/raw/<side>/run.<k>.out (the driver's stdout + stderr). DIR/raw must be absent, or an
#                      empty, readable and writable directory that is not a symlink; DIR/report.txt must not be a
#                      symlink or a file with another hard link, or a DRIVER of this run (exit 2 before any spawn or
#                      write, "is an input file of this run"). DIR/raw/before and DIR/raw/after must be creatable:
#                      the first existing path above them must be a writable, searchable directory, else exit 2 before
#                      any spawn "--out: cannot create DIR/raw/before and DIR/raw/after (<first existing ancestor> is
#                      not a writable directory)". Without --out the logs go to one private temp dir, removed on
#                      every exit.
#   --self-test        canned checks (--log-ic text through the record awk, judge and diff_fn, then this script end
#                      to end on a fake node that counts spawns and mktemp calls): one "ok <label>" or
#                      "FAIL <label>: <got>" line per check, then "self-test: <C> check(s) ok" (exit 0) or
#                      "self-test: <n> check(s) FAILED" (exit 1)
#   -h, --help         this text (exit 2)
#   Each value option is given at most once and never empty; --fn / --v8-flags / --node take no newline, --out
#   no newline or CR, and --fn no empty entry (stray comma). --self-test takes no other argument. --self-test /
#   --help take no =value. An
#   unknown option exits 2 with a did-you-mean hint. Every refusal exits 2 before any spawn or disk write, but the
#   --v8-flags allowlist: it exits 2 after the --version and the first --v8-options spawn, still before any disk write.
#
# DRIVER: exactly two existing readable files (no newline or CR in the path). Each trace run is
#   `env -u NODE_OPTIONS -u NODE_COMPILE_CACHE <node> [v8 flags] --log-ic --no-concurrent-recompilation
#   --no-node-snapshot --logfile=<abs run dir>/run.log ./<driver file name>` with cwd = the driver's directory (`./`
#   keeps a file name starting with `-` a path), stdout + stderr to DIR/raw/<side>/run.<k>.out with --out, else
#   /dev/null. Runs alternate before / after for k = 1..N. Only a run's records are held in memory, never its log.
#   Each % in <abs run dir> is passed doubled (%%), which V8's --logfile expands back to one %.
# Spawns, every one under `env -u NODE_OPTIONS -u NODE_COMPILE_CACHE`: one --version, two --v8-options (the
#   --v8-flags allowlist read, then the hashed probe), then 2 x runs trace runs (runs 3: 9 spawns); a failing probe
#   exits 2 before anything is written. Probe die lines: `ic-diff: cannot run <node> --version`, `ic-diff: cannot run
#   <node> --v8-options`, `ic-diff: <node> --v8-options printed nothing`, `ic-diff: <node> --v8-options lists no V8
#   flag`, `ic-diff: cannot hash the <node> --v8-options output`.
#   Before the first spawn the script unsets NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE and
#   NODE_REDIRECT_WARNINGS, so no spawn inherits a preload, a coverage dir, a compile cache or a warning file.
# Log files: V8 writes isolate-0x<addr>-<pid>-run.log in the run dir (DIR/raw/<side>, else <private dir>/<side>);
#   exactly one such file per run is renamed run.<k>.log. Without --out: ONE
#   `mktemp -d "${TMPDIR:-/tmp}/ic-diff.XXXXXX"` after the three probes, removed on every exit.
# Signals: SIGINT / SIGTERM / SIGHUP during a trace run SIGKILLs that run at once (its output is never read), then
#   "ic-diff: interrupted (SIG<NAME>)" + VERDICT NO-VERDICT on stderr (and as the last two lines of DIR/report.txt
#   once it has its head), exit 2; one that lands while mktemp runs is held until the dir is named, then removes it;
#   one during the three probes takes effect when that probe ends; a signal after FINAL is set (the step right after
#   the verdict line) changes nothing; one that lands while the verdict line is still being written ends exit 2 with a
#   second VERDICT NO-VERDICT line.
#   A trace run reads the caller's stdin.
#   With --out: no mktemp; DIR holds report.txt and raw/<side>/run.<k>.{log,out} (4 x runs + 1 files; 13 for runs 3).
#   Known gap: when a run leaves != 1 isolate file, those files stay in its run dir and later runs of that side count
#   them too (still NO-VERDICT; the first such run is named).
# fn: a short V8 name, ^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$ (e.g. get, get value). Never qualified
#   (Store.get); a repeat is refused. fn owns a code entry when its code-creation name is fn + " " + a rest starting
#   `/` or `file:///` (a prefix test, never a split at the first space): get never matches getX, ge, `get value ...`
#   or node's own `get node:...`. fn is only compared with ==, never used as a regex.
# Records (IC_AWK, one pass over each run's whole log), one per IC site of fn (fn, kind, script, line:col, key), from
#   the LAST IC line at that site:
#   S fn<TAB>kind<TAB>base:line:col<TAB>key<TAB>final<TAB>mod<TAB>slow
#   base = the script's file name (the site key itself uses the full path: two same-named scripts never merge); key
#   `[]` at the keyed kinds (Keyed*, StoreInArrayLiteralIC), so a per-run Symbol hash never reaches the null control.
#   An IC pc is joined NEWEST-FIRST to the live code-creation entry whose [start, start+size) holds it; code-move
#   moves an entry; sfi-move is ignored.
# X (global: an X line makes every fn of that run NO-VERDICT; the first is named, then `(+<m> more X line(s))`), each
#   followed by ` at log line <n>`. A hex field (IC pc, code-creation start, code-move from / to) is wider than
#   `0x` + 13 digits when it has more than 15 bytes (awk sums it in a double, exact to 2^53):
#   unresolved pc (no code-creation holds it: compile cache or user snapshot code?)
#   IC pc in optimized code (Maglev / Turbofan, kind <12|13>)
#   code-move from an unknown start
#   code-move does not parse                      (NF not 3, or from / to not 0x-hex or too wide)
#   IC line not 11 fields                         (a torn or glued line)
#   IC line does not parse                        (pc not 0x-hex or too wide, line / col not decimal, or a TAB)
#   IC state outside X01P^NDG
#   code-creation does not parse                  (NF not 7 / 9, start not 0x-hex or too wide, size not decimal)
#   code kind outside the allowlist: <type,kind>  (NF 7: Builtin,3 BytecodeHandler,0 RegExp,4;
#                                                  NF 9: Eval,10 JS,10 JS,11 JS,12 JS,13 Script,10)
#   unknown IC kind <$1>                          (known: KeyedLoadIC KeyedStoreIC LoadGlobalIC LoadIC StoreIC
#                                                  StoreInArrayLiteralIC StoreGlobalIC)
#   unknown event <$1>                            (known: code-creation code-source-info delete heap-available
#                                                  heap-capacity new script-source v8-platform v8-version code-move
#                                                  sfi-move; code-delete is unknown)
# NO-VERDICT, per side, the first that applies (the first seven checked run by run, k = 1..N):
#   driver exited <rc> in run <k>
#   no IC log (no isolate-0x*-*-run.log written) in run <k>
#   another isolate or process logged (<n> isolate-0x*-*-run.log files) in run <k>   (a Worker, a forked child)
#   the log holds <n> v8-version line(s), want 1 in run <k>
#   a NUL byte in the log in run <k>                (BSD awk would cut the line at the NUL)
#   the log has no final newline in run <k>
#   cannot read the log (awk exited <rc>) in run <k>
#   unreadable IC log in run <k>: <X why>
#   null control: run <k> differs from run 1 (<n> record(s) differ, first: run 1 x<a> | run <k> x<b>  <record>)
#   no IC site of '<fn>' in run 1 (no such name, never called, or no feedback vector yet: try
#     --v8-flags=--no-lazy-feedback-allocation)
#   every IC site of '<fn>' is X (no feedback) in run 1: try --v8-flags=--no-lazy-feedback-allocation
#   Else the run-1 multisets V = `fn<TAB>kind<TAB>key<TAB>final[ mod]` of the two sides are compared (line:col is a
#   label, never compared): SAME, or DIFF with one `  before=<a> after=<b>  <V>` line per differing V.
# Report: `ic-diff  node <ver>  <abs node>  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE,
#   NODE_REDIRECT_WARNINGS stripped)`; `v8-opts sha256/8 <x>` =
#   the sha256/8 of the --v8-options byte stream (env -u NODE_OPTIONS <node> --v8-options | shasum -a 256), REPORTED,
#   never part of the verdict; `before  <abs driver>  sha256/8 <x>`; `after   ...`; `mode    diff  runs <N>  v8 flags
#   ...`; `out     <DIR>` (--out); then per fn `  <fn>: SAME -- identical IC multiset (before <n> | after <m>
#   site(s))`, `  <fn>: DIFF -- IC multiset differs (...)` + its before= / after= lines, or `  <fn>: NO-VERDICT --
#   <before|after>: <reason>`; then `VERDICT <SAME|DIFF|NO-VERDICT>`. Refusals and die lines go to stderr as
#   `ic-diff: <why>` + `VERDICT NO-VERDICT` and, once report.txt has its head, to report.txt.
# Verdict, over every fn (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT.
# Note: a LoadIC site in a fn with no feedback vector (< ~8-10 calls) logs NO line (absent, not X); StoreIC and
#   LoadGlobalIC sites there log X->X (node 26.8.2). --v8-flags=--no-lazy-feedback-allocation gives every fn one.
# Not detected: two sites of fn that swap states (the verdict key has no line:col); fn inlined into optimized code
#   (its sites run in the caller's code, never attributed to fn; an IC line from Maglev / Turbofan code is X); eval /
#   vm / data: scripts (their names start with neither `/` nor `file:///`); computed method names (named after the
#   enclosing literal); a detached child that outlives the driver. A Worker or a forked child that logs is caught
#   by the isolate-file count (NO-VERDICT).
# Known limit: on node 22 and 24 this tool ends NO-VERDICT (the code-kind numbering table is V8 14.x only), by design until a node 22 / 24 numbering is adopted; a NO-VERDICT, never a wrong verdict.
# Tier: on a user driver the verdict is STATISTICAL (IC states follow warm-up, GC and tier-up timing; run it under the
#   host quiet lock); --self-test is DETERMINISTIC (canned log text and a fake node).
# Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.

unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: once, before any spawn; no probe, allowlist read or trace run inherits them (the per-spawn strips stay)
unset CDPATH   # before the prologue: SELF, every cd and every "cd X && pwd" join resolve X itself, never a CDPATH entry
# @include lib/prologue.sh

# ---------------------------------------------------------------------------------------------
# awk programs (POSIX awk: mawk, gawk, BSD awk)
# ---------------------------------------------------------------------------------------------

# @include lib/msdiff.sh

# one whole --log-ic log -> S records of the functions in -v fns (comma list), then at most one global X line.
# Every code-creation entry is kept; an IC line's pc is joined NEWEST-FIRST to the live entry whose
# [start, start+size) holds it (addresses only ever compared as numbers, never printed); code-move re-adds the newest
# live entry starting at `from` at `to`; sfi-move is ignored. An entry belongs to fn when its name is fn + " " + a
# rest starting with `/` or `file:///` (prefix test, never a split at the first space). One S record per site
# (fn, kind, base:line:col, key; key `[]` at keyed kinds), from the LAST IC line at that site:
#   S fn<TAB>kind<TAB>base:line:col<TAB>key<TAB>final<TAB>mod<TAB>slow
# X <why> at log line <n>[ (+<m> more X line(s))]: the first line that cannot be read; X is global (every fn).
# fn is only ever compared with ==, never used as a regex. An address field (IC pc, code-creation start, code-move
# from / to) longer than 15 bytes (`0x` + 13 hex digits, < 2^52) does not parse: hex() sums in a double, exact to 2^53.
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
  if ($2 !~ /^0x[0-9a-fA-F]+$/ || length($2) > 15 || $4 !~ /^[0-9]+$/ || $5 !~ /^[0-9]+$/ || index($0, "\t") > 0) { x("IC line does not parse"); next }
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
  if ((NF != 7 && NF != 9) || $5 !~ /^0x[0-9a-fA-F]+$/ || length($5) > 15 || $6 !~ /^[0-9]+$/) { x("code-creation does not parse"); next }
  ty = $2 "," $3; ok = 0
  if (NF == 7) { if (ty in C7) ok = 1 } else if (ty in C9) ok = 1
  if (!ok) { x("code kind outside the allowlist: " safe(ty)); next }
  BASE = ""; SCR = ""; f = (NF == 9 ? owner($7) : "")
  add(hex($5), $6 + 0, $3, f, BASE, SCR); next
}
$1 == "code-move" {
  if (NF != 3 || $2 !~ /^0x[0-9a-fA-F]+$/ || $3 !~ /^0x[0-9a-fA-F]+$/ || length($2) > 15 || length($3) > 15) { x("code-move does not parse"); next }
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

# @include lib/common.sh
# @include lib/tracked.sh
# @include lib/v8flags.sh

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
    x=$(printf '%s\n' "${JREC[$i]}" | awk '/^X / && !n++ { print substr($0, 3) }')
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
# --self-test: canned --log-ic text through IC_AWK, judge and diff_fn, then this script end to end on a fake node
# ---------------------------------------------------------------------------------------------
self_test() {
  local d old got rc fails=0 oks=0 REPORT=/dev/null VERDICT=SAME FV="" JV="" JWHY="" x
  local H T L01 L1P LPP LPN LNN LM1 KTOP MONO POLY MEGA MAPS INL2 REW GTR XU R_M R_P R_X R_C R_A R_S1 R_S2 C2 NO
  local -a RCB RCA LGB LGA REB REA JRC JLOG JREC
  local TB=$'\t'
  d=$(mktemp -d) || { echo "FAIL self-test: mktemp -d"; echo; echo "self-test: 1 check(s) FAILED"; return 1; }
  # the temp dir goes on every exit path: this trap runs the script's own EXIT trap after it (with $? restored; set +e
  # so restoring a non-zero $? cannot cut the trap short)
  ST_D=$d
  eval "set -- $(trap -p EXIT)"; old=${3:-}
  # shellcheck disable=SC2064
  trap "st_rc=\$?; rm -rf \"\$ST_D\"; set +e; (exit \$st_rc); $old" EXIT
  check() { if [[ "$2" == "$3" ]]; then oks=$((oks + 1)); echo "ok $1"; else fails=$((fails + 1)); echo "FAIL $1: $2"; echo "  want: $3"; fi; }
  # FNS TEXT -> IC_AWK records (";" per line, "|" = TAB); a failing IC_AWK adds "!awk exited <rc>" (no row expects it)
  rec() { printf '%s\n' "$2" | { awk -v fns="$1" "$IC_AWK" || echo "!awk exited $?"; } | tr '\t\n' '|;'; }
  recs() { printf '%s\n' "$2" | awk -v fns="$1" "$IC_AWK"; }   # FNS TEXT -> the raw records

  # --- canned node v26.8.2 --log-ic text (p5-probe recheck2 drv-mono.js capture; the path is shortened to
  # file:///w/, two code-creation lines (caller, node's own `get`) and the IC lines after `get` are added) ---
  IFS= read -r -d '' H <<'EOF' || true
v8-version,14,6,202,34,-node.28,0
v8-platform,macos,macos
new,CodeRange,0x117bac000,0
code-creation,Builtin,3,3621,0x1065d4000,796,DeoptimizationEntry_Eager
code-creation,BytecodeHandler,0,9102,0x106762680,28,Wide
code-creation,JS,10,98126,0x3bcd762b52f8,52,ModuleJobBase node:internal/modules/esm/module_job:245:14,0x2603c8871ff0,~
StoreIC,0x3bcd762b5308,98137,247,17,X,X,0x000000000000,loader,,
code-creation,Script,10,98050,0x3bcd762b4fc8,103, file:///w/drv-mono.js:1:1,0x29a78805a8a0,~
script-source,82,file:///w/drv-mono.js,// mono: one receiver shape at the load site in get()\nfunction get(o) {\n  return o.x;\n}\n
code-creation,JS,10,98500,0x3bcd762b6900,40,caller file:///w/drv-mono.js:6:16,0x29a78805a950,~
code-creation,JS,10,98536,0x3bcd762b6930,5,get file:///w/drv-mono.js:2:13,0x29a78805a970,~
EOF
  IFS= read -r -d '' T <<'EOF' || true
code-creation,JS,12,98601,0x117c09fa0,272,get file:///w/drv-mono.js:2:13,0x29a78805a970,+'
LoadGlobalIC,0x3bcd762b501b,98728,8,1,0,1,0x28e309f99201,console,,
LoadIC,0x3bcd762b501f,98733,8,9,0,1,0x2e39d7717021,log,,
code-creation,JS,10,98779,0x3bcd762b6da0,16,get node:internal/console/constructor:218:14,0x2603c885fe28,~
LoadIC,0x3bcd762b6da8,98790,219,24,0,1,0x2e39d7717021,kColorInspectOptions,,
EOF
  H=${H%$'\n'}; T=${T%$'\n'}
  L01='LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,'
  L1P='LoadIC,0x3bcd762b6932,98560,3,12,1,P,0x29a78805c261,x,,'
  LPP='LoadIC,0x3bcd762b6932,98570,3,12,P,P,0x29a78805c289,x,,'
  LPN='LoadIC,0x3bcd762b6932,98580,3,12,P,N,0x000000000000,x,,'
  LNN='LoadIC,0x3bcd762b6932,98590,3,12,N,N,0x000000000000,x,,'
  LM1='LoadIC,0x3bcd762b6932,98565,3,12,^,1,0x29a78805c2b1,x,,'
  KTOP='KeyedLoadIC,0x3bcd762b5021,98700,7,46,0,1,0x0bc2f8040249,0,,'
  XU='LoadIC,0x3bcd762b9000,98551,3,12,0,1,0x29a78805c239,x,,'
  MONO="$H"$'\n'"$L01"$'\n'"$T"
  POLY="$H"$'\n'"$L01"$'\n'"$L1P"$'\n'"$LPP"$'\n'"$T"
  MEGA="$H"$'\n'"$L01"$'\n'"$L1P"$'\n'"$LPP"$'\n'"$LPN"$'\n'"$LNN"$'\n'"$T"
  MAPS="$H"$'\n'"$L01"$'\n'"$LM1"$'\n'"$L1P"$'\n'"$T"
  INL2="$H"$'\n'"$L01"$'\n'"$KTOP"$'\n'"$L1P"$'\n'"$LPP"$'\n'"$LPN"$'\n'"$LNN"$'\n'"$T"

  # --- IC_AWK: records (PLAN A1, A2 D-b / D-d, A6 S6) ---
  check "A1 records: mono fn=get -> exactly one LoadIC record; node's own 'get node:...' and the top-level sites give none" \
    "$(rec get "$MONO")" "S get|LoadIC|drv-mono.js:3:12|x|1||;"
  check "A1 records: the LAST IC line per site -> poly P, mega N, maps (^->1 then 1->P) P, inline2 (a top-level keyed line between) N" \
    "$(rec get "$POLY")#$(rec get "$MEGA")#$(rec get "$MAPS")#$(rec get "$INL2")" \
    "S get|LoadIC|drv-mono.js:3:12|x|P||;#S get|LoadIC|drv-mono.js:3:12|x|N||;#S get|LoadIC|drv-mono.js:3:12|x|P||;#S get|LoadIC|drv-mono.js:3:12|x|N||;"
  check "A1 records: exact names -- fn=ge, fn=getX and fn=caller (no IC line in its range) on mono -> 0 records each" \
    "$(rec ge "$MONO")#$(rec getX "$MONO")#$(rec caller "$MONO")" "##"
  REW=$(printf '%s\n' "$POLY" | sed -e 's/0x3bcd762b/0x2d0e1f44/g' -e 's/0x29a78805c/0x11aa2233c/g' -e 's/,98\([0-9][0-9][0-9]\),/,77\1,/g' \
    -e 's|file:///w/|file:///elsewhere/x/|g')
  check "A1 records: every pc, time, map and the script path rewritten consistently -> byte-identical records" \
    "$(printf '%s\n' "$REW" | grep -c -e '0x2d0e1f44.*,77[0-9][0-9][0-9],' -e ',77[0-9][0-9][0-9],0x2d0e1f44' || true)|$(rec get "$REW")" \
    "12|$(rec get "$POLY")"
  check "A1 join NEWEST-FIRST: a newer non-fn code-creation covering get's range -> 0 get records" \
    "$(rec get "$H"$'\n''code-creation,JS,10,98540,0x3bcd762b6920,64,other file:///w/drv-mono.js:9:1,0x29a78805a990,~'$'\n'"$L01")" ""
  check "A1 code-move: get moved, an IC line at the new start -> its record; at the old start -> X 'unresolved pc'" \
    "$(rec get "$H"$'\n''code-move,0x3bcd762b6930,0x3bcd762b7930'$'\n''LoadIC,0x3bcd762b7931,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''code-move,0x3bcd762b6930,0x3bcd762b7930'$'\n'"$L01")" \
    "S get|LoadIC|drv-mono.js:3:12|x|1||;#X unresolved pc (no code-creation holds it: compile cache or user snapshot code?) at log line 13;"
  check "A1 / D-b keyed site: KeyedLoadIC key 0 then key 35 at one get site -> ONE record, key []" \
    "$(rec get "$H"$'\n''KeyedLoadIC,0x3bcd762b6933,98600,3,14,0,1,0x0bc2f8040249,0,,'$'\n''KeyedLoadIC,0x3bcd762b6933,98610,3,14,1,1,0x0bc2f8040249,35,,')" \
    "S get|KeyedLoadIC|drv-mono.js:3:14|[]|1||;"
  GTR="$H"$'\n''code-creation,JS,10,98700,0x3bcd762b7a00,20,get value file:///w/drv-getter.js:4:8,0x29a78805a9b0,~'$'\n''LoadIC,0x3bcd762b7a02,98710,4,29,0,1,0x29a78805c2d9,_v,,'
  check "A2 D-d getter: fn='get value' -> its LoadIC record; fn=get and fn=value on the same log -> 0 records" \
    "$(rec 'get value' "$GTR")#$(rec get "$GTR")#$(rec value "$GTR")" "S get value|LoadIC|drv-getter.js:4:29|_v|1||;##"
  check "S6 one-digit line / col: '1,1,0,1' -> final 1 at :1:1; '1,1,1,P' at key y -> final P (the state is field 7)" \
    "$(rec get "$H"$'\n''LoadIC,0x3bcd762b6930,98551,1,1,0,1,0x29a78805c239,x,,'$'\n''LoadIC,0x3bcd762b6931,98552,1,1,1,P,0x29a78805c239,y,,')" \
    "S get|LoadIC|drv-mono.js:1:1|x|1||;S get|LoadIC|drv-mono.js:1:1|y|P||;"
  check "S6 a key equal to fn ('get') at a site of ANOTHER fn (ModuleJobBase) -> 0 records for --fn get" \
    "$(rec get "$H"$'\n''LoadIC,0x3bcd762b5310,98800,247,30,0,1,0x28e309fb2961,get,,')" ""
  check "S6 'X,X' at a StoreIC site of get -> kept, final X" \
    "$(rec get "$H"$'\n''StoreIC,0x3bcd762b6934,98575,3,5,X,X,0x000000000000,y,,')" "S get|StoreIC|drv-mono.js:3:5|y|X||;"
  check "S6 / A2 an IC line no code-creation holds -> X 'unresolved pc', never a guessed fn" \
    "$(rec get "$H"$'\n'"$XU")" "X unresolved pc (no code-creation holds it: compile cache or user snapshot code?) at log line 12;"
  check "A2 an IC pc in Maglev (kind 12) or Turbofan (kind 13) code of get -> X 'IC pc in optimized code'" \
    "$(rec get "$MONO"$'\n''LoadIC,0x117c09fb0,98610,3,12,1,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''code-creation,JS,13,98620,0x117c0a400,64,get file:///w/drv-mono.js:2:13,0x29a78805a970,*'$'\n''LoadIC,0x117c0a410,98630,3,12,1,1,0x29a78805c239,x,,')" \
    "S get|LoadIC|drv-mono.js:3:12|x|1||;X IC pc in optimized code (Maglev / Turbofan, kind 12) at log line 18;#X IC pc in optimized code (Maglev / Turbofan, kind 13) at log line 13;"
  check "A2 a code-move from an unknown start -> X; one with 4 fields -> X 'code-move does not parse'" \
    "$(rec get "$H"$'\n''code-move,0x3bcd762b6990,0x3bcd762b7930')#$(rec get "$H"$'\n''code-move,0x3bcd762b6930,0x3bcd762b7930,1')" \
    "X code-move from an unknown start at log line 12;#X code-move does not parse at log line 12;"
  check "A2 a 10-field IC line, and two IC lines glued into one (18 fields) -> X 'IC line not 11 fields'" \
    "$(rec get "$H"$'\n''LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,')#$(rec get "$H"$'\n''LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,xLoadIC,0x3bcd762b6930,98552,3,12,1,P,0x29a78805c239,x,,')" \
    "X IC line not 11 fields at log line 12;#X IC line not 11 fields at log line 12;"
  check "A2 an IC line with pc 0xZZ, with line 'a', or with a TAB -> X 'IC line does not parse'; state Q -> X 'IC state outside X01P^NDG'" \
    "$(rec get "$H"$'\n''LoadIC,0xZZ,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''LoadIC,0x3bcd762b6930,98551,a,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''LoadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x'$'\t''y,,')#$(rec get "$H"$'\n''LoadIC,0x3bcd762b6930,98551,3,12,0,Q,0x29a78805c239,x,,')" \
    "X IC line does not parse at log line 12;#X IC line does not parse at log line 12;#X IC line does not parse at log line 12;#X IC state outside X01P^NDG at log line 12;"
  check "A2 M15 a torn fragment whose \$1 does not end in IC ('x3bcd762b6930,...') -> X 'unknown event'; 'oadIC,...' -> X 'unknown IC kind'" \
    "$(rec get "$H"$'\n''x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''oadIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,')" \
    "X unknown event x3bcd762b6930 at log line 12;#X unknown IC kind oadIC at log line 12;"
  check "A2 KeyedHasIC -> X 'unknown IC kind'; code-delete -> X 'unknown event'; an X names the first line and counts the rest" \
    "$(rec get "$H"$'\n''KeyedHasIC,0x3bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''code-delete,0x3bcd762b6930'$'\n''code-delete,0x3bcd762b6900'$'\n'"$L01")" \
    "X unknown IC kind KeyedHasIC at log line 12;#S get|LoadIC|drv-mono.js:3:12|x|1||;X unknown event code-delete at log line 12 (+1 more X line(s));"
  check "A2 code-creation JS,14 -> X 'code kind outside the allowlist'; 8 fields, or size 'z' -> X 'code-creation does not parse'" \
    "$(rec get "$H"$'\n''code-creation,JS,14,98540,0x3bcd762b7000,5,get file:///w/drv-mono.js:2:13,0x29a78805a970,~')#$(rec get "$H"$'\n''code-creation,JS,10,98540,0x3bcd762b7000,5,get file:///w/drv-mono.js:2:13,~')#$(rec get "$H"$'\n''code-creation,JS,10,98540,0x3bcd762b7000,z,get file:///w/drv-mono.js:2:13,0x29a78805a970,~')" \
    "X code kind outside the allowlist: JS,14 at log line 12;#X code-creation does not parse at log line 12;#X code-creation does not parse at log line 12;"
  check "A9 hex width: an IC pc or a code-creation start of 0x + 14 digits (zero-padded, same value) -> X 'does not parse'; 0x + 13 digits -> a record" \
    "$(rec get "$H"$'\n''LoadIC,0x003bcd762b6930,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''code-creation,JS,10,98540,0x003bcd762b8000,5,get file:///w/drv-mono.js:2:13,0x29a78805a970,~'$'\n''LoadIC,0x3bcd762b8000,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get 'code-creation,JS,10,98540,0x1fffffffffff0,16,get file:///w/drv-mono.js:2:13,0x29a78805a970,~'$'\n''LoadIC,0x1fffffffffff8,98551,3,12,0,1,0x29a78805c239,x,,')" \
    "X IC line does not parse at log line 12;#X code-creation does not parse at log line 12 (+1 more X line(s));#S get|LoadIC|drv-mono.js:3:12|x|1||;"
  check "A9 hex width: a code-move from, or to, of 0x + 14 digits (zero-padded, same value) -> X 'code-move does not parse'" \
    "$(rec get "$H"$'\n''code-move,0x003bcd762b6930,0x3bcd762b8800'$'\n''LoadIC,0x3bcd762b8800,98551,3,12,0,1,0x29a78805c239,x,,')#$(rec get "$H"$'\n''code-move,0x3bcd762b6930,0x003bcd762b8800'$'\n''LoadIC,0x3bcd762b8800,98551,3,12,0,1,0x29a78805c239,x,,')" \
    "X code-move does not parse at log line 12 (+1 more X line(s));#X code-move does not parse at log line 12 (+1 more X line(s));"

  # --- judge: one side, from JRC (driver exits), JLOG (log reasons) and JREC (records per run) ---
  R_M=$(recs get "$MONO"); R_P=$(recs get "$POLY"); R_X=$(recs get "$H"$'\n'"$XU"); R_C=$(recs caller "$MONO")
  JRC=(0 0 0); JLOG=("" "" ""); JREC=("$R_M" "$R_M" "$R_M"); judge get
  check "judge: 3 identical runs -> OK" "$JV|$JWHY" "OK|"
  JRC=(0 3 0); judge get
  check "judge A2: driver exit 3 in run 2 -> 'driver exited 3 in run 2'" "$JV|$JWHY" "NO-VERDICT|driver exited 3 in run 2"
  JRC=(0 0 5); JLOG=("" "a NUL byte in the log" ""); judge get
  check "judge: a log reason in run 2 is named before run 3's driver exit (run by run)" "$JV|$JWHY" "NO-VERDICT|a NUL byte in the log in run 2"
  JRC=(0 0 0); JLOG=("" "" ""); JREC=("$R_M" "$R_M" "$R_X"); judge get
  check "judge A2: an X line in run 3 -> 'unreadable IC log in run 3: <why>'" "$JV|$JWHY" \
    "NO-VERDICT|unreadable IC log in run 3: unresolved pc (no code-creation holds it: compile cache or user snapshot code?) at log line 12"
  JRC=(0 0); JLOG=("" ""); JREC=("$R_M" "$R_P"); judge get
  check "judge A2: run 2 != run 1 -> null control naming run 2 and the first differing record" "$JV|$JWHY" \
    "NO-VERDICT|null control: run 2 differs from run 1 (2 record(s) differ, first: run 1 x1 | run 2 x0  LoadIC${TB}drv-mono.js:3:12${TB}x${TB}1${TB}${TB})"
  JREC=("$R_C" "$R_C"); judge caller
  check "judge A2: no IC site of fn (fn=caller) -> the empty guard" "$JV|$JWHY" \
    "NO-VERDICT|no IC site of 'caller' in run 1 (no such name, never called, or no feedback vector yet: try --v8-flags=--no-lazy-feedback-allocation)"
  R_A=$(recs get "$H"$'\n''StoreIC,0x3bcd762b6934,98575,3,5,X,X,0x000000000000,y,,'); JREC=("$R_A" "$R_A"); judge get
  check "judge A2: every site of fn X -> 'every IC site of 'get' is X'" "$JV|$JWHY" \
    "NO-VERDICT|every IC site of 'get' is X (no feedback) in run 1: try --v8-flags=--no-lazy-feedback-allocation"
  x='KeyedLoadIC,0x3bcd762b6933,98600,3,14,0,1,0x0bc2f8040249,symbol("k" hash 3ec16600),,'
  R_S1=$(recs get "$H"$'\n'"$x"); R_S2=$(recs get "$H"$'\n'"${x/3ec16600/24cef8b8}")
  JREC=("$R_S1" "$R_S2"); judge get; got="$JV|$(v_ms "$R_S1" get | sed 's/^ *//' | tr '\t' '|')"
  x=${x#Keyed}; JREC=("$(recs get "$H"$'\n'"$x")" "$(recs get "$H"$'\n'"${x/3ec16600/24cef8b8}")"); judge get
  check "D-b a Symbol key with a per-run hash at a KEYED site -> null control passes, V 'get KeyedLoadIC [] 1'; at a named LoadIC -> null control" \
    "$got#$JV" "OK|1 *|get|KeyedLoadIC|[]|1#NO-VERDICT"

  # --- diff_fn: both sides, from RCB / RCA, LGB / LGA, REB / REA ---
  RCB=(0 0); RCA=(0 0); LGB=("" ""); LGA=("" "")
  C2=$(recs get "$MONO"$'\n''LoadIC,0x3bcd762b6934,98552,3,20,0,1,0x29a78805c239,x,,')
  REB=("$C2" "$C2"); REA=("$R_M" "$R_M"); VERDICT=SAME; diff_fn get >"$d/df.out"
  check "A3 diff_fn: {1,1} vs {1} (two get sites of one V vs one) -> DIFF 'before=2 after=1' (a multiset, never sort -u)" \
    "$FV|$VERDICT|$(tr '\t\n' '|;' <"$d/df.out")" \
    "DIFF|DIFF|  get: DIFF -- IC multiset differs (before 2 | after 1 site(s));  before=2 after=1  get|LoadIC|x|1;"
  C2='code-creation,JS,10,1,0x3bcd762b7000,16,get file:///a/x.js:2:13,0x1,~'$'\n''code-creation,JS,10,2,0x3bcd762b7100,16,get file:///b/x.js:2:13,0x2,~'
  C2="$C2"$'\n''LoadIC,0x3bcd762b7104,3,3,12,0,1,0x5,x,,'$'\n''LoadIC,0x3bcd762b7104,4,3,12,1,P,0x6,x,,'$'\n''LoadIC,0x3bcd762b7004,5,3,12,0,1,0x5,x,,'
  R_A=$(recs get "$C2"); R_C=$(recs get "$C2"$'\n''LoadIC,0x3bcd762b7004,6,3,12,1,P,0x6,x,,')
  REB=("$R_A" "$R_A"); REA=("$R_C" "$R_C"); VERDICT=SAME; diff_fn get >"$d/df.out"
  check "A9 basename collision: get in /a/x.js and /b/x.js, same line:col, before {1,P} vs after {P,P} -> DIFF (the site key is the full path)" \
    "$FV|$(tr '\t\n' '|;' <"$d/df.out")" \
    "DIFF|  get: DIFF -- IC multiset differs (before 2 | after 2 site(s));  before=1 after=0  get|LoadIC|x|1;  before=1 after=2  get|LoadIC|x|P;"

  # --- this script end to end on a fake node (bash): it appends its argv to <its dir>/log, exits 7 if NODE_OPTIONS,
  # NODE_V8_COVERAGE, NODE_COMPILE_CACHE or NODE_REDIRECT_WARNINGS reached it; --version prints v26.8.2 (FAKE_VER_RC:
  # that exit); --v8-options cats ./v8opts.txt
  # (FAKE_OPTS_RC: that exit; FAKE_OPTS_EMPTY: prints nothing; both only on the FAKE_OPTS_AT-th --v8-options call, default
  # 1, counted in <its dir>/opts.n); else a trace run: exit 9 on a driver argument starting
  # with - (as node: "bad option"), copy ./ic.<n>.log or ./ic.log (n = its run count in that dir) to
  # isolate-0x7508000000-<pid>-<basename of --logfile> beside the --logfile path, expanded as V8 does (%% -> %, %p -> its
  # pid) (./iso2: a second isolate file too),
  # ./term: SIGTERM to its parent (this script), exit with ./rc or 0. A mktemp shim (first on PATH) logs each call
  # and, with ST_MKTERM set, sends SIGTERM to its parent after the dir is made ---
  local fk="$d/fk" mk="$d/mk" dr="$d/dr" b0 b1
  mkdir -p "$fk" "$mk" "$dr" "$d/cwd" "$d/tmp" "$d/cc"
  printf '%s\n' "#!$BASH" 'd=$(dirname "$0")' 'printf "%s\n" "$*" >>"$d/log"' \
    'if [ -n "${NODE_OPTIONS+x}" ] || [ -n "${NODE_COMPILE_CACHE+x}" ]; then echo "env leaked"; exit 7; fi' \
    'if [ -n "${NODE_OPTIONS+x}${NODE_V8_COVERAGE+x}${NODE_COMPILE_CACHE+x}${NODE_REDIRECT_WARNINGS+x}" ]; then echo "env leaked"; exit 7; fi' \
    'case "$1" in' \
    '  --version) if [ -n "${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; echo v26.8.2; exit 0 ;;' \
    '  --v8-options) k=$(( $(cat "$d/opts.n" 2>/dev/null || echo 0) + 1 )); echo "$k" >"$d/opts.n"' \
    '    if [ "$k" = "${FAKE_OPTS_AT:-1}" ]; then if [ -n "${FAKE_OPTS_RC:-}" ]; then exit "$FAKE_OPTS_RC"; fi; if [ -n "${FAKE_OPTS_EMPTY:-}" ]; then exit 0; fi; fi' \
    '    cat ./v8opts.txt; exit 0 ;;' \
    'esac' \
    'lf=""; drv=""; for a; do case "$a" in --logfile=*) lf="${a#--logfile=}" ;; esac; drv="$a"; done' \
    'lf="${lf//%%/@P@}"; lf="${lf//%p/$$}"; lf="${lf//@P@/%}"' \
    'case "$drv" in -*) echo "bad option: $drv" >&2; exit 9 ;; esac' \
    'c="$d/$(basename "$PWD").n"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$c"' \
    'src=./ic.log; if [ -f "./ic.$n.log" ]; then src="./ic.$n.log"; fi' \
    'if [ -n "$lf" ] && [ -f "$src" ]; then cp "$src" "$(dirname "$lf")/isolate-0x7508000000-$$-$(basename "$lf")"' \
    '  if [ -f ./iso2 ]; then cp "$src" "$(dirname "$lf")/isolate-0x7508800000-$$-$(basename "$lf")"; fi; fi' \
    'if [ -f ./term ]; then kill -TERM "$PPID"; fi' \
    'echo "driver ran"' 'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi' 'exit 0' >"$fk/node"
  chmod +x "$fk/node"
  printf '%s\n' "#!$BASH" "printf '%s\\n' \"\$*\" >>$(printf '%q' "$d/mk.log")" \
    "r=\$($(printf '%q' "$(command -v mktemp)") \"\$@\") || exit 1" 'printf "%s\n" "$r"' \
    'if [ -n "${ST_MKTERM:-}" ]; then kill -TERM "$PPID"; fi' 'exit 0' >"$mk/mktemp"
  chmod +x "$mk/mktemp"
  # ./v8opts.txt: a synopsis, then name / type lines byte-exact from test/fixtures/v8flags/v8-options.v26.8.2.txt
  # (:409-410, 527-528, 595-596, 641-642), then an empty line (the stream ends in two newlines: K4 / M26)
  local VO='  --lazy-feedback-allocation (Allocate feedback vectors lazily)
        type: bool  default: --lazy-feedback-allocation
  --turbo-filter (optimization filter for TurboFan compiler)
        type: string  default: --turbo-filter="*"
  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)
        type: int  default: --max-inlined-bytecode-size=460
  --trace-osr (trace on-stack replacement)
        type: bool  default: --no-trace-osr
'
  printf 'Synopsis:\n  fake v8 options\n%s\n' "$VO" >"$d/cwd/v8opts.txt"
  mkd() { mkdir -p "$dr/$1"; : >"$dr/$1/driver.js"; printf '%s\n' "$2" >"$dr/$1/ic.log"; }
  mkd mono "$MONO"; mkd mono2 "$(printf '%s\n' "$MONO" | sed -e 's/0x3bcd762b/0x2d0e1f44/g' -e 's|file:///w/|file:///elsewhere/x/|g')"
  mkd poly "$POLY"; mkd nc "$MONO"; printf '%s\n' "$POLY" >"$dr/nc/ic.2.log"
  mkd rc3 "$MONO"; echo 3 >"$dr/rc3/rc"; mkdir -p "$dr/nolog"; : >"$dr/nolog/driver.js"
  mkd v2 "$MONO"$'\n''v8-version,14,6,202,34,-node.28,0'; mkd xu "$MONO"$'\n'"$XU"
  mkd nul "$H"; printf '%s\000\n%s\n' "$L01" "$T" >>"$dr/nul/ic.log"         # a valid IC line, then a NUL right before its \n
  mkd nonl ""; printf '%s' "$MONO" >"$dr/nonl/ic.log"
  mkd iso2 "$MONO"; : >"$dr/iso2/iso2"; mkd term "$MONO"; : >"$dr/term/term"
  mkdir -p "$dr/dash"; : >"$dr/dash/-x.js"; printf '%s\n' "$MONO" >"$dr/dash/ic.log"
  NO="--node=$fk/node"
  spawn() { # [VAR=value ...] -- args... -> "rc|VERDICT line(s)|node spawns|mktemp calls"; output in $d/sp.out. Host
    local -a e=()   # NODE_OPTIONS / NODE_COMPILE_CACHE / NODE / editor env never reach the script (rows that need one set it)
    local r
    while [[ "$1" != -- ]]; do e+=("$1"); shift; done; shift
    rm -f "$fk"/*.n; : >"$fk/log"; : >"$d/mk.log"
    (cd "$d/cwd" && env -u NODE_OPTIONS -u NODE_COMPILE_CACHE -u NODE -u GIT_EDITOR -u EDITOR -u VISUAL PATH="$mk:$PATH" \
      TMPDIR="$d/tmp" ${e[@]+"${e[@]}"} "$BASH" "$SELF" "$@") >"$d/sp.out" 2>&1 && r=0 || r=$?
    printf '%s|%s|%s|%s' "$r" "$(awk '/^VERDICT /{ printf "%s%s", (n++ ? "," : ""), $0 }' "$d/sp.out")" \
      "$(wc -l <"$fk/log" | tr -d ' ')" "$(wc -l <"$d/mk.log" | tr -d ' ')"
  }
  has() { grep -c -F -x -e "$1" "$d/sp.out" || true; }
  ents() { find "$d/tmp" "$d/cwd" "$dr/mono" "$dr/poly" "$dr/rc3" "$dr/term" -mindepth 1 | wc -l | tr -d ' '; }
  check "A3 / A7 R-a e2e: mono vs poly (R=3) -> exit 1 DIFF, 9 spawns (log lines 1-3 --version, --v8-options, --v8-options, then 6 trace runs), 1 mktemp, the before=0 after=1 line" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "  before=0 after=1  get${TB}LoadIC${TB}x${TB}P")|$(sed -n 1p "$fk/log")+$(sed -n 2p "$fk/log")+$(sed -n 3p "$fk/log")|$(has "ic-diff  node v26.8.2  $fk/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)")" \
    "1|VERDICT DIFF|9|1|1|--version+--v8-options+--v8-options|1"
  check "A3 e2e: mono vs mono2 (every address and the script path changed) -> exit 0 SAME; TMPDIR and cwd keep no new entry" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")|$(has '  get: SAME -- identical IC multiset (before 1 | after 1 site(s))')|$(find "$d/tmp" "$d/cwd" -mindepth 1 | wc -l | tr -d ' ')" \
    "0|VERDICT SAME|9|1|1|1"
  check "A7 R-b: --runs 2 -> 7 spawns, --runs 5 -> 13 spawns" \
    "$(spawn -- "$NO" --runs 2 --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")#$(spawn -- "$NO" --runs 5 --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")" \
    "1|VERDICT DIFF|7|1#1|VERDICT DIFF|13|1"
  got=$(spawn -- "$NO" --v8-flags=--no-lazy-feedback-allocation --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")
  check "A7 R-c / K2: --v8-flags=--no-lazy-feedback-allocation -> probe argvs exactly --version / --v8-options / --v8-options; trace argvs 4-9 hold --no-node-snapshot and the flag once each" \
    "$got|$(sed -n 1p "$fk/log")+$(sed -n 2p "$fk/log")+$(sed -n 3p "$fk/log")|$(awk 'NR >= 4 { a = 0; b = 0; for (i = 1; i <= NF; i++) { if ($i == "--no-node-snapshot") a++; if ($i == "--no-lazy-feedback-allocation") b++ } printf "%d%d,", a, b }' "$fk/log")" \
    "1|VERDICT DIFF|9|1|--version+--v8-options+--v8-options|11,11,11,11,11,11,"
  check "A7 R-d / K2: NODE_OPTIONS and NODE_COMPILE_CACHE set in the environment never reach any spawn (mono vs mono -> SAME, 9 spawns)" \
    "$(spawn NODE_OPTIONS=--st-probe NODE_COMPILE_CACHE="$d/cc" -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")" "0|VERDICT SAME|9|1"
  check "A7 R-e / K3: --v8-options exit 1 (with --out) -> exit 2, 2 spawns, 0 mktemp, the die line once, no OUT dir; empty output -> exit 2, 2 spawns, die once" \
    "$(spawn FAKE_OPTS_RC=1 -- "$NO" --out "$d/oe" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "ic-diff: cannot run $fk/node --v8-options")|$([[ -e "$d/oe" ]] && echo exists || echo absent)#$(spawn FAKE_OPTS_EMPTY=1 -- "$NO" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "ic-diff: $fk/node --v8-options printed nothing")" \
    "2|VERDICT NO-VERDICT|2|0|1|absent#2|VERDICT NO-VERDICT|2|0|1"
  check "A7 K1: --version exit 1 (with --out) -> exit 2 after 1 spawn, 0 mktemp, the die line once, no OUT dir" \
    "$(spawn FAKE_VER_RC=1 -- "$NO" --out "$d/ov" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "ic-diff: cannot run $fk/node --version")|$([[ -e "$d/ov" ]] && echo exists || echo absent)" \
    "2|VERDICT NO-VERDICT|1|0|1|absent"
  got=$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js"); cp "$d/sp.out" "$d/g1.out"
  check "A7 R-f / K4: v8opts.txt ending in two newlines -> exactly one 'v8-opts sha256/8 ea67e28d' (the hash of the byte stream)" \
    "$got|$(has 'v8-opts sha256/8 ea67e28d')|$(grep -c -e '^v8-opts ' "$d/sp.out" || true)" "0|VERDICT SAME|9|1|1|1"
  printf 'Synopsis:\n  fake v8 options, second build\n%s\n' "$VO" >"$d/cwd/v8opts.txt"
  got="$got#$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")"
  printf 'Synopsis:\n  fake v8 options\n%s\n' "$VO" >"$d/cwd/v8opts.txt"
  check "A7 R-g control: a second v8opts.txt -> the same rc, VERDICT, spawns and every non-v8-opts line; its v8-opts line 5ed538ce" \
    "$got|$([[ "$(grep -v -e '^v8-opts ' "$d/g1.out")" == "$(grep -v -e '^v8-opts ' "$d/sp.out")" ]] && echo same || echo differs)|$(has 'v8-opts sha256/8 5ed538ce')" \
    "0|VERDICT SAME|9|1#0|VERDICT SAME|9|1|same|1"
  check "A4 --out: exit 1 DIFF, 0 mktemp, exactly 13 files (report.txt + 3 x 2 x {log,out}), no isolate file left; report.txt holds the verdict" \
    "$(spawn -- "$NO" --out "$d/o" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(find "$d/o" -type f | wc -l | tr -d ' ')|$(find "$d/o" -name 'isolate-*' | wc -l | tr -d ' ')|$(grep -c '^VERDICT DIFF$' "$d/o/report.txt" 2>/dev/null || true)|$(grep -c -F -x -e "$LPP" "$d/o/raw/after/run.2.log" 2>/dev/null || true)" \
    "1|VERDICT DIFF|9|0|13|0|1|1"
  check "A2 e2e: no isolate log written (after) -> 'no IC log (no isolate-0x*-*-run.log written) in run 1'" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/nolog/driver.js")|$(has '  get: NO-VERDICT -- after: no IC log (no isolate-0x*-*-run.log written) in run 1')" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A2 / M16 e2e: two isolate files in one run (after) -> 'another isolate or process logged (2 isolate-0x*-*-run.log files) in run 1'" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/iso2/driver.js")|$(has '  get: NO-VERDICT -- after: another isolate or process logged (2 isolate-0x*-*-run.log files) in run 1')" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A2 e2e: 2 v8-version lines (after) -> 'the log holds 2 v8-version line(s), want 1 in run 1'" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/v2/driver.js")|$(has '  get: NO-VERDICT -- after: the log holds 2 v8-version line(s), want 1 in run 1')" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A9 e2e: a NUL as the last byte before the \\n of a valid IC line (after) -> 'a NUL byte in the log in run 1', never SAME" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/nul/driver.js")|$(has '  get: NO-VERDICT -- after: a NUL byte in the log in run 1')" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A2 e2e: no final newline (after) -> 'the log has no final newline in run 1'" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/nonl/driver.js")|$(has '  get: NO-VERDICT -- after: the log has no final newline in run 1')" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A2 e2e: driver exit 3 (before) -> 'before: driver exited 3 in run 1'" \
    "$(spawn -- "$NO" --fn get "$dr/rc3/driver.js" "$dr/mono/driver.js")|$(has '  get: NO-VERDICT -- before: driver exited 3 in run 1')" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A2 e2e: an unresolved pc (after) -> 'unreadable IC log in run 1: unresolved pc ...'" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/xu/driver.js")|$(grep -c -e '^  get: NO-VERDICT -- after: unreadable IC log in run 1: unresolved pc (' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|9|1|1"
  check "A2 e2e: run 2 of after differs (mono, then poly) -> 'after: null control: run 2 differs from run 1', before passes" \
    "$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/nc/driver.js")|$(grep -c -e '^  get: NO-VERDICT -- after: null control: run 2 differs from run 1 (' "$d/sp.out" || true)|$(grep -c -e ' -- before: ' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|9|1|1|0"
  check "A2 e2e: --fn nosuch -> each side 'no IC site of 'nosuch' in run 1 (...'" \
    "$(spawn -- "$NO" --fn nosuch "$dr/mono/driver.js" "$dr/poly/driver.js")|$(grep -c -E -e "^  nosuch: NO-VERDICT -- (before|after): no IC site of 'nosuch' in run 1 \\(" "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|9|1|2"
  check "bug class: a driver named '-x.js' runs as ./-x.js (never read as a node option): 6 trace argvs end in ' ./-x.js', exit 0 SAME" \
    "$(spawn -- "$NO" --fn get "$dr/dash/-x.js" "$dr/dash/-x.js")|$(grep -c -e ' \./-x\.js$' "$fk/log" || true)" "0|VERDICT SAME|9|1|6"
  # relative PATH: node = $d/cwd/nm/node (this cwd) and a rogue nm/node in each driver dir; all 3 + 2R spawns must hit ONE
  mkdir -p "$d/cwd/nm" "$dr/rpb/nm" "$dr/rpa/nm"
  for x in "$d/cwd/nm" "$dr/rpb/nm" "$dr/rpa/nm"; do cp "$fk/node" "$x/node"; done
  mkd rpb "$MONO"; mkd rpa "$POLY"
  got=$(spawn PATH="nm:$mk:$PATH" -- --fn get "$dr/rpb/driver.js" "$dr/rpa/driver.js")
  check "A9 relative PATH (PATH=nm:...): all 3 + 2R spawns run the ONE binary resolved from the caller's cwd, named absolute in the header" \
    "${got%|*|*|*}|$(wc -l <"$d/cwd/nm/log" | tr -d ' ')|$(cat "$dr/rpb/nm/log" "$dr/rpa/nm/log" 2>/dev/null | wc -l | tr -d ' ')|$(has "ic-diff  node v26.8.2  $d/cwd/nm/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)")" \
    "1|9|0|1"
  rm -rf "$d/cwd/nm"
  # A4 retention: 3 cycles of SAME / DIFF / NO-VERDICT and 1 SIGTERM mid-run leave TMPDIR, cwd and the driver dirs as they were
  b0=$(ents); got=""
  for x in 1 2 3; do
    got="$got#$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono/driver.js")/$(spawn -- "$NO" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")/$(spawn -- "$NO" --fn get "$dr/rc3/driver.js" "$dr/mono/driver.js")"
  done
  got="$got#$(spawn -- "$NO" --fn get "$dr/term/driver.js" "$dr/mono/driver.js")|$(has 'ic-diff: interrupted (SIGTERM)')"
  b1=$(ents)
  check "A4 retention: 3 x (SAME / DIFF / NO-VERDICT) + 1 SIGTERM mid-run (before run 1) -> 1 mktemp each, 0 new entries in TMPDIR, cwd and the driver dirs" \
    "$got|$b0->$b1" \
    "$(printf '#0|VERDICT SAME|9|1/1|VERDICT DIFF|9|1/2|VERDICT NO-VERDICT|9|1%.0s' 1 2 3)#2|VERDICT NO-VERDICT|4|1|1|$b0->$b0"
  check "A9 signal window: a SIGTERM that lands while mktemp -d runs -> exit 2 'interrupted (SIGTERM)', 3 spawns, the new dir removed (0 entries in TMPDIR)" \
    "$(spawn ST_MKTERM=1 -- "$NO" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has 'ic-diff: interrupted (SIGTERM)')|$(find "$d/tmp" -mindepth 1 | wc -l | tr -d ' ')" \
    "2|VERDICT NO-VERDICT|3|1|1|0"
  rf() { # LABEL FRAGMENT args...: refused with exit 2, 0 spawns, 0 mktemp, a die line holding FRAGMENT
    local l="$1" f="$2"; shift 2
    check "refused before any spawn: $l -> exit 2, 0 spawns, 0 mktemp, '$f'" \
      "$(spawn -- "$@")|$(grep -F -e "$f" "$d/sp.out" | grep -c '^ic-diff: ' || true)" "2|VERDICT NO-VERDICT|0|0|1"
  }
  rf "repeated fn" "fn 'get' is given twice" "$NO" --fn get,get "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "qualified name" "fn must be a short V8 function name (e.g. get, get value; never Store.get), got 'Store.get'" "$NO" --fn Store.get "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "--runs 1" "--runs must be an integer in [2, 20] (null control), got '1'" "$NO" --runs 1 --fn get "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "--runs 21" "--runs must be an integer in [2, 20] (null control), got '21'" "$NO" --runs 21 --fn get "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "one DRIVER" "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got 1" "$NO" --fn get "$dr/mono/driver.js"
  rf "a log flag in --v8-flags" "--v8-flags must not set --log_ic: the script sets" "$NO" --fn get --v8-flags=--log_ic "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "a snapshot flag in --v8-flags" "--v8-flags must not set --node-snapshot: the script sets" "$NO" --fn get --v8-flags=--node-snapshot "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "a non-flag in --v8-flags" "--v8-flags takes flags only (each starts with -- and a letter), got 'x.js'" "$NO" --fn get --v8-flags=x.js "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "unknown option" "unknown option --nod (did you mean --node?)" "$NO" --fn get --nod x "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "a node binary that does not exist" "node binary is not an executable file: ./nonode" --fn get --node ./nonode "$dr/mono/driver.js" "$dr/poly/driver.js"
  rf "a bare node name not on PATH" "node binary not found: nonode" --fn get --node nonode "$dr/mono/driver.js" "$dr/poly/driver.js"

  # --- ext-audit B-four ic: the --out walk (C-11), MD-36 / MD-37 / MD-38 and the MD-40 / MD-42 / MD-44 --v8-flags arms;
  # every input is refused before any spawn: exit 2, 0 spawns, 0 mktemp, the die line once (no input needs file modes) ---
  rq() { # FRAGMENT -> the count of ic-diff: lines in $d/sp.out holding FRAGMENT
    grep -F -e "$1" "$d/sp.out" | grep -c '^ic-diff: ' || true
  }
  local o="" nl="$d/p/a"$'\n'"b"
  ln -s "$d/nowhere" "$d/o66"; printf 'x\n' >"$d/fx"; chmod 0755 "$d/fx"
  o="$(spawn -- "$NO" --fn get --out "$d/o66" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--out: cannot create $d/o66/raw/before and $d/o66/raw/after ($d/o66 is not a writable directory)")"
  o="$o#$(spawn -- "$NO" --fn get --out "$d/fx/o" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--out: cannot create $d/fx/o/raw/before and $d/fx/o/raw/after ($d/fx is not a writable directory)")"
  check "refused before any spawn: walk --out DIR a dangling symlink / --out F/o under a regular 0755 file F -> exit 2, 0 spawns, 0 mktemp, 'cannot create DIR/raw/before and DIR/raw/after (<first existing ancestor> is not a writable directory)'" \
    "$o" "2|VERDICT NO-VERDICT|0|0|1#2|VERDICT NO-VERDICT|0|0|1"
  mkdir -p "$d/o67a" "$d/e67" "$d/o67b"; ln -s "$d/e67" "$d/o67a/raw"; ln -s "$d/nowhere" "$d/o67b/raw"
  o="$(spawn -- "$NO" --fn get --out "$d/o67a" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--out: $d/o67a/raw is a symlink (refused: the writes would follow it)")"
  o="$o#$(spawn -- "$NO" --fn get --out "$d/o67b" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--out: $d/o67b/raw is a symlink (refused: the writes would follow it)")"
  check "refused before any spawn: MD-36 --out DIR whose raw/ is a symlink to an empty dir / a dangling symlink -> exit 2, 0 spawns, 0 mktemp, 'is a symlink (refused: the writes would follow it)'" \
    "$o" "2|VERDICT NO-VERDICT|0|0|1#2|VERDICT NO-VERDICT|0|0|1"
  mkdir -p "$d/o68"; printf 'KEEP\n' >"$d/o68/report.txt"; ln "$d/o68/report.txt" "$d/h"
  check "refused before any spawn: MD-37 --out DIR whose report.txt has a second hard link -> exit 2, 0 spawns, 0 mktemp, 'has another hard link (refused: the write would change that file too)', the other name still holds KEEP" \
    "$(spawn -- "$NO" --fn get --out "$d/o68" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--out: $d/o68/report.txt has another hard link (refused: the write would change that file too)")|$(cat "$d/h")" \
    "2|VERDICT NO-VERDICT|0|0|1|KEEP"
  mkdir -p "$nl"; cp "$fk/node" "$nl/node"
  check "refused before any spawn: MD-38 a PATH entry with a newline mid-name (a fake node copy in it) -> exit 2, 0 spawns, 0 mktemp, 'node binary: a newline is not allowed in the resolved path', 0 lines in the copy's log" \
    "$(spawn PATH="$nl:$mk:$PATH" -- --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "node binary: a newline is not allowed in the resolved path")|$(cat "$nl/log" 2>/dev/null | wc -l | tr -d ' ')" \
    "2|VERDICT NO-VERDICT|0|0|1|0"
  o=""
  for x in --env-file=F --env_file=F --env-file-if-exists=F --experimental-config-file=F --experimental-default-config-file=F; do
    o="$o#$(spawn -- "$NO" --fn get "--v8-flags=--no-lazy-feedback-allocation $x" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--v8-flags must not set $x: it loads environment variables or node options from a file")"
  done
  check "refused before any spawn: MD-40 --v8-flags --env-file=F / --env_file=F / --env-file-if-exists=F / --experimental-config-file=F / --experimental-default-config-file=F (environment or node options loaded from a file) -> exit 2, 0 spawns, 0 mktemp" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|0|0|1%.0s' 1 2 3 4 5)"
  o=""
  for x in --loader=F --loader --experimental-loader=F --experimental_loader=F --require-module --import=F --require=F; do
    o="$o#$(spawn -- "$NO" --fn get "--v8-flags=--no-lazy-feedback-allocation $x" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--v8-flags must not set $x: it loads a module of yours into the measured process")"
  done
  check "refused before any spawn: MD-42 --v8-flags --loader=F / --loader / --experimental-loader=F / --experimental_loader=F / --require-module / --import=F / --require=F (a module of yours; a prefix match) -> exit 2, 0 spawns, 0 mktemp" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|0|0|1%.0s' 1 2 3 4 5 6 7)"
  o=""
  for x in --eval=F --eval --print=F --print --print-bytecode; do
    o="$o#$(spawn -- "$NO" --fn get "--v8-flags=--no-lazy-feedback-allocation $x" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--v8-flags must not set $x: it runs code of yours in the measured process")"
  done
  check "refused before any spawn: MD-44 --v8-flags --eval=F / --eval / --print=F / --print / --print-bytecode (code run instead of the driver, or V8 internals printed into the run; a prefix match) -> exit 2, 0 spawns, 0 mktemp" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|0|0|1%.0s' 1 2 3 4 5)"

  # --- MD-46 / MD-56: the --v8-flags allowlist (v8fl_check right after --version: one --v8-options read, also with no
  # --v8-flags), then the hashed --v8-options probe (K3 on the second call) ---
  o=""
  for x in --openssl-config=F --trace-osr --turbo-filter=x --max-inlined-bytecode-size; do
    o="$o#$(spawn -- "$NO" --fn get --out "$d/o73" "--v8-flags=--no-lazy-feedback-allocation $x" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--v8-flags must not set $x: only V8 tuning flags of this node binary are accepted")|$([[ -e "$d/o73" ]] && echo exists || echo absent)"
  done
  check "MD-46 allowlist (with --out): --v8-flags --openssl-config=F (a node option) / --trace-osr (MD-53 family) / --turbo-filter=x (string-typed) / bare --max-inlined-bytecode-size (int, no =N) -> exit 2 after --version + one --v8-options (2 spawns), 0 mktemp, the die line once, no OUT dir" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|2|0|1|absent%.0s' 1 2 3 4)"
  printf 'Synopsis:\n  fake v8 options\n\n' >"$d/cwd/v8opts.txt"
  got="$(spawn -- "$NO" --out "$d/o74" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "ic-diff: $fk/node --v8-options lists no V8 flag")|$([[ -e "$d/o74" ]] && echo exists || echo absent)"
  printf 'Synopsis:\n  fake v8 options\n%s\n' "$VO" >"$d/cwd/v8opts.txt"
  check "MD-56: a --v8-options list with no V8 flag line (the old synopsis-only v8opts.txt), no --v8-flags, with --out -> exit 2, 2 spawns, 0 mktemp, 'lists no V8 flag' once, no OUT dir" \
    "$got" "2|VERDICT NO-VERDICT|2|0|1|absent"
  check "K3 second call: the hashed --v8-options probe exits 1 (FAKE_OPTS_AT=2, with --out) -> exit 2, 3 spawns, 0 mktemp, the die line once, no OUT dir; prints nothing -> exit 2, 3 spawns, die once" \
    "$(spawn FAKE_OPTS_AT=2 FAKE_OPTS_RC=1 -- "$NO" --out "$d/o75" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "ic-diff: cannot run $fk/node --v8-options")|$([[ -e "$d/o75" ]] && echo exists || echo absent)#$(spawn FAKE_OPTS_AT=2 FAKE_OPTS_EMPTY=1 -- "$NO" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(has "ic-diff: $fk/node --v8-options printed nothing")" \
    "2|VERDICT NO-VERDICT|3|0|1|absent#2|VERDICT NO-VERDICT|3|0|1"
  check "Q-ENV: NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE and NODE_REDIRECT_WARNINGS set in the environment never reach any spawn (unset at the top; mono vs mono2 -> SAME, 9 spawns, 1 mktemp), the head line names all four" \
    "$(spawn NODE_OPTIONS=--st-probe NODE_V8_COVERAGE="$d/cov" NODE_COMPILE_CACHE="$d/cc" NODE_REDIRECT_WARNINGS="$d/warn.txt" -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")|$(has "ic-diff  node v26.8.2  $fk/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)")" \
    "0|VERDICT SAME|9|1|1"

  # --- G4 (b64): R13 a % in the run dir (V8 expands %p / %% in --logfile: each trace argv doubles every %), R14 a
  # relative TMPDIR (the private dir is made absolute), R26 an = in the resolved node path, R6 *stress-concurrent-inlining* ---
  check "R13a --out DIR holding a % (o%pz%%q), mono vs mono2 -> rc 0 SAME, 9 spawns, 0 mktemp, raw/before/run.1.log kept, 6 trace argvs hold --logfile=DIR with the % doubled" \
    "$(spawn -- "$NO" --out "$d/o%pz%%q" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")|$([[ -f "$d/o%pz%%q/raw/before/run.1.log" ]] && echo 1 || echo 0)|$(grep -c -F -e "--logfile=${d//%/%%}/o%%pz%%%%q/raw/" "$fk/log" || true)" \
    "0|VERDICT SAME|9|0|1|6"
  mkdir -p "$d/t%p"
  check "R13b TMPDIR holding a % (t%p), mono vs mono2 -> rc 0 SAME, 9 spawns, 1 mktemp, 0 entries left in TMPDIR" \
    "$(spawn TMPDIR="$d/t%p" -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")|$(find "$d/t%p" -mindepth 1 | wc -l | tr -d ' ')" \
    "0|VERDICT SAME|9|1|0"
  check "R14 a relative TMPDIR (../tmp from the cwd), mono vs mono2 -> rc 0 SAME, 9 spawns, 1 mktemp, 6 trace argvs hold an absolute --logfile=/..., 0 entries left in TMPDIR" \
    "$(spawn TMPDIR=../tmp -- "$NO" --fn get "$dr/mono/driver.js" "$dr/mono2/driver.js")|$(grep -c -e ' --logfile=/' "$fk/log" || true)|$(find "$d/tmp" -mindepth 1 | wc -l | tr -d ' ')" \
    "0|VERDICT SAME|9|1|6|0"
  mkdir -p "$d/a=b"; cp "$fk/node" "$d/a=b/node"
  o="$(spawn -- --node "$d/a=b/node" --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): $d/a=b/node")|$(cat "$d/a=b/log" 2>/dev/null | wc -l | tr -d ' ')"
  o="$o#$(spawn PATH="$d/a=b:$mk:$PATH" -- --fn get "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): $d/a=b/node")|$(cat "$d/a=b/log" 2>/dev/null | wc -l | tr -d ' ')"
  check "R26 an = in the resolved node path (--node DIR/a=b/node; a bare node found via PATH=DIR/a=b:...) -> exit 2, 0 spawns, 0 mktemp, 'node binary: an = is not allowed in the resolved path' once, 0 lines in the copy's log" \
    "$o" "2|VERDICT NO-VERDICT|0|0|1|0#2|VERDICT NO-VERDICT|0|0|1|0"
  o=""
  for x in --stress-concurrent-inlining --stress_concurrent_inlining_attach_code --no-stress-concurrent-inlining; do
    o="$o#$(spawn -- "$NO" --fn get "--v8-flags=$x" "$dr/mono/driver.js" "$dr/poly/driver.js")|$(rq "--v8-flags must not set $x: --stress-concurrent-inlining implies --concurrent-recompilation in V8, which overrides the script's --no-concurrent-recompilation (a background compile makes the IC log a race; every spelling of the flag is refused)")"
  done
  check "R6 --v8-flags --stress-concurrent-inlining / --stress_concurrent_inlining_attach_code / --no-stress-concurrent-inlining (every spelling) -> exit 2, 0 spawns, 0 mktemp, the die line once" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|0|0|1%.0s' 1 2 3)"
  JRC=(0 0 0); JLOG=("" "" ""); JREC=("$R_M" "$R_M" "$R_P"); judge get
  check "NC3 judge: run 3 != run 1, runs 1 2 equal -> null control naming run 3" "$JV|$JWHY" \
    "NO-VERDICT|null control: run 3 differs from run 1 (2 record(s) differ, first: run 1 x1 | run 3 x0  LoadIC${TB}drv-mono.js:3:12${TB}x${TB}1${TB}${TB})"
  check "NC4 e2e: run 2 of before differs (mono, then poly) -> 'before: null control: run 2 differs from run 1', after passes" \
    "$(spawn -- "$NO" --fn get "$dr/nc/driver.js" "$dr/mono/driver.js")|$(grep -c -e '^  get: NO-VERDICT -- before: null control: run 2 differs from run 1 (' "$d/sp.out" || true)|$(grep -c -e ' -- after: ' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|9|1|1|0"

  if [[ $fails -eq 0 && $oks -gt 0 ]]; then echo "self-test: $oks check(s) ok"; return 0; fi
  echo "self-test: $((fails > 0 ? fails : 1)) check(s) FAILED"; return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write; the --v8-flags allowlist,
# lib/v8flags.sh, and the hashed --v8-options probe run after the --version spawn, at the marker line below)
# ---------------------------------------------------------------------------------------------
FNLIST=""; RUNS=3; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; POS=(); GOTOPT=" "; REPORT=/dev/null; OUT_NAMES=""
IC_TMP=""
OPTS="--fn --runs --node --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
# @include lib/args.sh
while [[ $# -gt 0 ]]; do
  a="$1"; v=""; EQ=0
  case "$a" in --*=*) v="${a#*=}"; a="${a%%=*}"; EQ=1 ;; esac
  case "$a" in
    -h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; DIED=1; exit 2 ;;
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
  [[ "$t" =~ $FN_RE ]] || die "fn must be a short V8 function name (e.g. get, get value; never Store.get), got '$t'"
  [[ "$SEEN" != *"|$t|"* ]] || die "fn '$t' is given twice"
  SEEN="$SEEN$t|"
done
[[ "$RUNS" =~ ^[0-9]{1,2}$ ]] && RUNS=$((10#$RUNS)) && [[ $RUNS -ge 2 && $RUNS -le 20 ]] \
  || die "--runs must be an integer in [2, 20] (null control), got '$RUNS'"
read -r -a V8_EXTRA <<<"$V8FLAGS" || true
[[ -z "$V8FLAGS" || ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
  [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
  g="${f//_/-}"
  case "$g" in
    *stress-concurrent-inlining*)
      die "--v8-flags must not set $f: --stress-concurrent-inlining implies --concurrent-recompilation in V8, which overrides the script's --no-concurrent-recompilation (a background compile makes the IC log a race; every spelling of the flag is refused)" ;;
    *log*|*prof*|*concurrent-recompilation*|*interpreted-frames-native-stack*|*snapshot*)
      die "--v8-flags must not set $f: the script sets ${TRACE_FLAGS[*]} --logfile itself (no *log*, *prof*, *concurrent-recompilation*, *interpreted-frames-native-stack* or *snapshot* flag)" ;;
    --require*|--import*|--loader*|--experimental-loader*)
      die "--v8-flags must not set $f: it loads a module of yours into the measured process (a preload or a module loader)" ;;
    --env-file*|--experimental-config-file*|--experimental-default-config-file*)
      die "--v8-flags must not set $f: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process" ;;
    --eval*|--print*)
      die "--v8-flags must not set $f: it runs code of yours in the measured process instead of the driver (--eval / --print: node evaluates it and the driver becomes argv), or prints V8 internals into the measured run (V8's --print-* flags)" ;;
  esac
done
[[ ${#POS[@]} -eq 2 ]] || die "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]} (see --help)"
nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}   # the raw DRIVER values, before any refusal prints them (G-X6, ruling Q-B75-FFSCOPE)
[[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER (before) not found (or not a readable file): ${POS[0]}"
[[ -f "${POS[1]}" && -r "${POS[1]}" ]] || die "DRIVER (after) not found (or not a readable file): ${POS[1]}"
[[ "$OUT" != -* ]] || OUT="./$OUT"
[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"   # the raw --out value, before any refusal prints it (G-X6, ruling Q-B75-FFSCOPE)
if [[ -n "$OUT" ]]; then
  [[ ! -e "$OUT" || -d "$OUT" ]] || die "--out: $OUT exists and is not a directory"
  [[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die "--out: $OUT/raw exists and is not a directory"
  [[ ! -e "$OUT/raw" || ( -r "$OUT/raw" && -x "$OUT/raw" ) ]] || die "--out: $OUT/raw is not readable"
  [[ ! -L "$OUT/raw" ]] || die "--out: $OUT/raw is a symlink (refused: the writes would follow it)"
  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
  [[ ! -L "$OUT/report.txt" ]] || die "--out: $OUT/report.txt is a symlink (refused: the write would follow it)"
  [[ ( -f "$OUT/report.txt" && -w "$OUT/report.txt" ) || ( ! -e "$OUT/report.txt" && ( ! -e "$OUT" || -w "$OUT" ) ) ]] || die "--out: cannot write $OUT/report.txt"
  [[ ! -e "$OUT/report.txt" ]] || { RL=$(find "$OUT/report.txt" -links +1 2>/dev/null) && [[ -z "$RL" ]]; } || die "--out: $OUT/report.txt has another hard link (refused: the write would change that file too)"
  # the mkdir -p below must succeed: walk up from raw/before to the first path that exists (or is a symlink, or `.`: an unsearchable cwd fails -e) and need a writable, searchable dir there
  OUT_UP="$OUT/raw/before"; while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw/before and $OUT/raw/after ($OUT_UP is not a writable directory)"
fi
# resolve the binary ONCE, from the caller's cwd: every spawn (probes and trace runs, each trace run in its driver dir)
# runs this absolute path, so a relative PATH entry can never pick a different node per cwd. A name with a slash is a path
# (never looked up on PATH): it goes straight to the -f / -x check, so a directory is named as such
NODE_RES=$NODE_BIN
if [[ "$NODE_BIN" != */* ]]; then NODE_RES=$(command -v -- "$NODE_BIN" 2>/dev/null) || die "node binary not found: $NODE_BIN"; fi
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH (a function, alias or builtin?): $NODE_BIN -> $NODE_RES"
[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
NODE_DIR=$(dirname -- "$NODE_RES"); [[ "$NODE_DIR" != - ]] || NODE_DIR=./-
NODE_DIR=$(cd -- "$NODE_DIR" 2>/dev/null && pwd) || die "node binary: cannot resolve the directory of $NODE_RES"
NODE_C="${NODE_DIR%/}/$(basename -- "$NODE_RES")"   # NODE_BIN keeps the user's name: every spawn runs NODE_RES
[[ "$NODE_C" -ef "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
NODE_RES=$NODE_C
[[ "$NODE_RES" != *$'\n'* ]] || die "node binary: a newline is not allowed in the resolved path"
[[ "$NODE_RES" != *=* ]] || die "node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): $NODE_RES"
DRV_B_DIR=$(cd -- "$(dirname -- "${POS[0]}")" && pwd); DRV_B_BASE=$(basename -- "${POS[0]}")
DRV_A_DIR=$(cd -- "$(dirname -- "${POS[1]}")" && pwd); DRV_A_BASE=$(basename -- "${POS[1]}")
[[ "$DRV_B_DIR/$DRV_B_BASE" -ef "${POS[0]}" ]] || die "DRIVER (before): cannot resolve the directory of ${POS[0]} (a symlink before '..'?)"
[[ "$DRV_A_DIR/$DRV_A_BASE" -ef "${POS[1]}" ]] || die "DRIVER (after): cannot resolve the directory of ${POS[1]} (a symlink before '..'?)"
DESC_B="${DRV_B_DIR%/}/$DRV_B_BASE  sha256/8 $(sha8 "$DRV_B_DIR/$DRV_B_BASE")"
DESC_A="${DRV_A_DIR%/}/$DRV_A_BASE  sha256/8 $(sha8 "$DRV_A_DIR/$DRV_A_BASE")"
# G-X6 (ruling Q-B66-X6): every path the report prints, refused before the first spawn or write if it holds a newline or a
# CR (it would forge report lines): the cwd, --node, the drivers and the name --out resolves to (nl_refuse, nl_dir)
nl_refuse "the cwd" "$PWD"
nl_refuse "--node (resolved)" "$NODE_RES"
nl_refuse "DRIVER (resolved)" "$DESC_B" "$DESC_A"
[[ -z "$OUT" ]] || nl_dir "--out (resolved)" "$OUT"
# rep_refuse prints the input value: it runs after the G-X6 newline / CR refusals above, before the first spawn or write (finding fd-rev-1, ruling Q-B74-FCSEAM)
[[ -z "$OUT" ]] || rep_refuse "${POS[@]}"

# --- every refusal but the --v8-flags allowlist is above this line; spawns start here: --version, the allowlist read
# (v8fl_check: one --v8-options, MD-56: also with no --v8-flags), the hashed --v8-options probe, then mktemp / OUT
# mkdir, the runs ---
GOT_VER=$("${PROBE_ENV[@]}" "$NODE_RES" --version 2>/dev/null) || die "cannot run $NODE_RES --version"
v8fl_check "$NODE_RES"
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

if [[ -n "$OUT" ]]; then
  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"
  # keep the logical OUT name when it is the same directory as the given OUT, else print the physical one
  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L
  nl_refuse "--out (resolved)" "$OUT"   # backstop (G-X6): a name the pre-spawn replay could not foresee
  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check
  RUNROOT="$OUT/raw"
else
  # the private log dir goes on every exit path: this trap runs the script's own EXIT trap after it (with $?
  # restored; set +e so restoring a non-zero $? cannot cut the trap short)
  eval "set -- $(trap -p EXIT)"; IC_OLD=${3:-}
  # shellcheck disable=SC2064
  trap "ic_rc=\$?; if [[ -n \$IC_TMP ]]; then rm -rf \"\$IC_TMP\"; fi; set +e; (exit \$ic_rc); $IC_OLD" EXIT
  # an INT / TERM / HUP while mktemp runs is only NOTED, so the new dir is always named before a die can run (bash 3.2
  # runs a pending trap after the assignment anyway; a shell that ran it before would leak the dir); then the shared
  # trap (lib/prologue.sh) is armed again and a noted signal dies here through it; the EXIT trap removes the dir
  IC_SIG=""; trap 'IC_SIG=INT' INT; trap 'IC_SIG=TERM' TERM; trap 'IC_SIG=HUP' HUP
  IC_TMP=$(mktemp -d "${TMPDIR:-/tmp}/ic-diff.XXXXXX") || IC_TMP=""
  sig_arm; [[ -z $IC_SIG ]] || _sig "$IC_SIG"
  [[ -n "$IC_TMP" && -d "$IC_TMP" ]] || die "cannot create a private log dir (mktemp -d)"
  IC_ABS=$(cd -- "$IC_TMP" && pwd) || die "cannot resolve the private log dir $IC_TMP"; IC_TMP=$IC_ABS
  mkdir "$IC_TMP/before" "$IC_TMP/after" || die "cannot create the private log dirs in $IC_TMP"
  RUNROOT="$IC_TMP"
fi
say "ic-diff  node $GOT_VER  $NODE_RES  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
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
  # a background job the main shell waits for (drv_wait, lib/prologue.sh): a SIGINT / SIGTERM / SIGHUP kills it at once
  # (exec: $! is node itself); `<&0` keeps the caller's stdin (a job without job control would get /dev/null)
  ( cd "$2" && rd=${rd//%/%%} && exec "${PROBE_ENV[@]}" "$NODE_RES" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "--logfile=$rd/run.log" "./$3" ) \
    >"$out" 2>&1 <&0 &
  drv_wait; rc=$DRV_RC
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
