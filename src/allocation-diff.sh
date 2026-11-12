#!/usr/bin/env bash
# allocation-diff.sh -- young-generation GC EVENT COUNTS inside a marked window of a driver, DRIVER_BEFORE vs
# DRIVER_AFTER (diff mode) or one DRIVER against none (--zero), on one node binary. Counts, never bytes.
#
#   allocation-diff.sh [opts] DRIVER_BEFORE DRIVER_AFTER     diff mode: SAME / DIFF
#   allocation-diff.sh [opts] --zero DRIVER                  gate mode: ZERO / NONZERO
#   allocation-diff.sh --self-test                           canned checks, a fake node (no real node)
#   allocation-diff.sh -h | --help                           this text
#
# Options
#   --zero             gate mode: exactly one DRIVER. No young GC in the window of run 1 (and every run equal to
#                      run 1) -> ZERO, exit 0; else NONZERO, exit 1. Takes no value. ZERO means less than one
#                      semi-space (1 MB) of young allocation in the window, not zero bytes.
#   --runs N           node runs per side, 2..20 (default 5). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node). Resolved ONCE, from the caller's directory, to an
#                      absolute path: a bare name through PATH (`command -v`; a function, alias or builtin is
#                      refused); a name with a slash is a path, never looked up on PATH. It must be an executable
#                      file, else exit 2 before any spawn ("node binary not found", "node binary is not a file on
#                      PATH (...)", "node binary is not an executable file", "node binary: cannot resolve the
#                      directory of ...", "node binary: a newline is not allowed in the resolved path", "node
#                      binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand,
#                      not as the program): PATH"). The --version probe and every run (each in its driver's
#                      directory) run that one file, and the head names it.
#   --v8-flags STR     extra V8 flags for every run, split on spaces (flags only, each `--` and a letter). Refused,
#                      with `_` read as `-`: any *trace-gc*, *semi-space* or *concurrent-recompilation* flag (the
#                      script sets the trace and a fixed 1 MB semi-space), any *predictable-gc-schedule* flag (it
#                      forces both semi-spaces to 4 MB), any *stress-concurrent-inlining* flag (every spelling:
#                      --stress-concurrent-inlining implies --concurrent-recompilation in V8, which overrides the
#                      script's --no-concurrent-recompilation), any *allocation-site-pretenuring* flag (every
#                      spelling: the script pins --no-allocation-site-pretenuring), every --require* / --import* /
#                      --loader* / --experimental-loader* flag, a prefix match (a module of yours, preload or loader,
#                      is part of the measured process, and a --require one runs ahead of the guard's own; -r is
#                      refused as a non-flag), every --env-file* / --experimental-config-file* /
#                      --experimental-default-config-file* flag, a prefix match (it loads environment variables or
#                      node options from a file into the measured process), and every --eval* / --print* flag, a
#                      prefix match (node runs that code in the measured process instead of the driver, which
#                      becomes argv; V8's --print-* flags, e.g. --print-bytecode, go with it; -e / -p are refused as
#                      non-flags). Accepted: V8 flags this node lists in --v8-options -- bool as --flag or --no-flag
#                      (never --noflag), numeric as --flag=N -- except log / trace / print / prof / perf / dump /
#                      snapshot / file flags. Refused, exit 2 at the latest after one --v8-options read and before any
#                      measured run: every node option (--run, --test, --watch, --check, --inspect, --cpu-prof,
#                      --snapshot-blob, ...), every string-valued V8 flag, and the tool's own flags above.
#   --out DIR          keep DIR/report.txt, DIR/raw/<side>/run.<k>.txt (the raw stdout of run k) and
#                      DIR/raw/<side>/run.<k>.err (its stderr); <side> = before / after, or driver with --zero.
#                      DIR/raw must be absent, or an empty, readable (and searchable) directory that is not a symlink;
#                      DIR/report.txt must not be a DRIVER, a symlink or a file with another hard link, and must be
#                      writable. With or without
#                      --out, the guard preload, its counts and each run's stdout (run.out, removed right after it
#                      is read) live in a private temp dir under $TMPDIR (else /tmp), removed by the EXIT trap (also
#                      on a refusal, an error, SIGINT, SIGTERM or SIGHUP); SIGKILL, or a signal inside $(mktemp -d)
#                      before the script has the dir's name, can leave one allocation-diff.XXXXXX behind; without
#                      --out nothing else is written.
#                      SIGINT / SIGTERM / SIGHUP during a driver run SIGKILLs that run at once (its output is never
#                      read), then "allocation-diff: interrupted (SIG<NAME>)" + VERDICT NO-VERDICT on stderr (and as
#                      the last two lines of DIR/report.txt once it has its head), exit 2; a signal after FINAL is
#                      set (the step right after the verdict line) changes nothing; one that lands while the verdict
#                      line is still being written ends exit 2 with a second VERDICT NO-VERDICT line. A signal during
#                      the --version / --v8-options probes takes effect when that step ends. A driver run reads the
#                      caller's stdin.
#   --self-test        canned checks (--trace-gc text through the record awk, the guard preload's sha256, then
#                      this script end to end on a fake node that counts spawns and mktemp calls): one
#                      "ok <label>" or "FAIL <label>: <got>" line per check, then "self-test: <C> check(s) ok"
#                      (exit 0) or "self-test: <n> check(s) FAILED" (exit 1)
#   -h, --help         this text (exit 2)
#   Each value option is given at most once and never empty; --v8-flags / --node take no newline, --out and DRIVER
#   paths no newline or CR. --self-test takes no other argument. --zero / --self-test / --help take no =value. An
#   unknown option exits 2 with a did-you-mean hint.
#
# DRIVER: an existing readable file (two in diff mode, one with --zero), each run as
#   `node [v8 flags] --trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation
#   --no-allocation-site-pretenuring --require <tmp>/gcn.cjs ./<driver file name> 3><tmp>/gcn.<side>.<k>` with cwd =
#   its directory (`./` keeps a file name starting with `-` a path), NODE_OPTIONS, NODE_V8_COVERAGE,
#   NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped (unset at start, for every spawn), stderr to its own file
#   (never merged into stdout), stdout to a regular file in the temp dir (never a pipe), read after the run through
#   tee (to the --out raw file, else /dev/null), tr (every NUL byte becomes `?`; the raw file keeps the NUL) and the
#   record awk, then 64 KiB is appended to it (a TMPDIR still full when the run ends fails that append) and it is
#   removed. Only records are held in memory, never trace text. Runs alternate before / after, k = 1..N.
# Driver contract: write each marker with fs.writeSync(1, '@@LITE-MARK start\n') (and end); never use
#   console.log or process.stdout in the driver, and never make stdout non-blocking. A pipe-era measurement (when
#   stdout was still a pipe; not re-measured on the regular file, where that pipe-only drop does not apply): on node
#   v26.8.2 (p4-probe, 5 of 5 runs) a console.log driver (pipe stdout touched) with a slow reader lost 268 of 666
#   in-window trace lines, and no glued or partial line marked the loss. Write `end` before exit, never in an
#   'exit' listener (-> NO-VERDICT). fd 3 is the guard's; writing to it or closing it reads no guard count.
#   An allocation TurboFan scalar-replaces is not an allocation: a loop that builds `{a: i, b: i + 1}` in the window
#   and reads one field can read young 0, ZERO, once it is optimized (escape analysis removed the object). ZERO is the
#   correct measurement there: the optimized code does not allocate. To measure the allocation, fix the driver and keep
#   the objects reachable: `keep[i & 1023] = hot(i)`.
# Guard: gcn.cjs (the tool's own preload, an absolute path) counts the run's GCs with v8.GCProfiler, on the main
#   thread only (in a Worker it returns at once: no profiler, no listener, no fence). Its 'exit' listener,
#   registered before any driver listener, allocates past two semi-spaces (>= 1 young GC after your `end`: the
#   exit fence), writes `@@LITE-MARK gcn` to fd 1, then the count to fd 3. The count must equal g
#   (below), else the side reads NO-VERDICT: it catches a GC line lost from the trace (or glued after other text
#   outside the window). GCs in your own 'exit' listeners land after gcn and are not counted; an allocating one
#   can read "the guard did not count". The guard is proven for drivers that write markers with fs.writeSync(1);
#   a console.log driver's counts may shift under the preload. Its preload is part of the measured process: a GC
#   at either edge of the window (`start` or `end`) can land before or after that marker from run to run. A flip
#   within one side reads NO-VERDICT; a flip in every run of one side and in no run of the other reads DIFF by 1
#   on identical drivers.
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
#                         not exactly that line (a trailing CR included)
#   G <g> <p>             last: g = GC lines before gcn, p = those between end and gcn
# NO-VERDICT reasons (per side, first that applies; each checked over runs k = 1..N before the next):
#   cannot read driver output in run <k> (<tee|tr|awk|append> exited <rc>)   (in one run the first failure in the
#                                    order awk > tr > tee > append > driver exit is named)
#   driver exited <rc> in run <k>
#   unparseable --trace-gc output in run <k>: <why>          (<why> = the run's first X record, or "no G record")
#   no GC line between @@LITE-MARK end and the tool's exit fence in run <k>   (tracing not shown to be on)
#   no guard count in run <k>        (the fd-3 count is missing, empty or not one canonical decimal line (no sign,
#                                    no leading zero, <= 9 digits); never read as 0)
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
#   exits 2 before any node is spawned and before anything is written, except a --v8-flags flag outside the allowlist
#   (after the --version and --v8-options spawns). Spawns: one `node --version` (a failing one exits 2 before
#   anything is written), one `node --v8-options` (also with no --v8-flags; a failing one exits 2 the same way), then
#   2 x runs driver runs (1 x runs with --zero): runs 5 -> 12 spawns (7 with --zero), runs 3 -> 8 (5).
# Not detected: young allocation under one semi-space (1 MB) in the window; large-object and old-space allocation
#   (no young GC); a Worker that triggers no GC; markers written asynchronously (a marker that lands late moves
#   the window); a GC line moved across a marker; a lost line cancelled by an extra one (e.g. a worker isolate's);
#   GCs after the count read (your 'exit' listeners). A cold window over-reports (S-7): start the window after
#   warm-up, or tier-up and lazy compilation allocate in it. A Worker's GC lines are in the trace but not in the
#   guard count: NO-VERDICT "<d> GC line(s) in run <k> the guard did not count". A child_process.fork() child runs
#   the guard preload on its own main thread and writes its own fence to the shared stdout: NO-VERDICT "@@LITE-MARK
#   gcn given twice". The script pins --no-allocation-site-pretenuring: a pretenured literal site allocates
#   straight into old space (no young GC), which would read a young-allocating window as ZERO.
# Tier: the script logic is DETERMINISTIC (--self-test); a verdict on a user driver is STATISTICAL, and REPORTED
#   only (this repo has no statistical host).
# Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.

unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: no node spawn sees one
unset CDPATH   # before the prologue: SELF, every cd and every "cd X && pwd" join resolve X itself, never a CDPATH entry
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
  if ($0 !~ /^\[[0-9]+:0x[0-9a-f]+\] +[0-9]+ ms: [A-Z][A-Za-z() -]* [0-9.]+ \([0-9.]+\) -> [0-9.]+ \([0-9.]+\) MB, pooled: [0-9.]+ MB, [0-9.]+ \/ [0-9.]+ ms +(\(\+ [^()]*\) +)?\(average mu = [0-9.]+, current mu = [0-9.]+\) [A-Za-z][A-Za-z ]*; (GC in old space requested)?$/) {
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
# @include lib/tracked.sh
# @include lib/v8flags.sh

TRACE_FLAGS=(--trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation --no-allocation-site-pretenuring)
ST_RE='^@ ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+)$'
G_RE='^G ([0-9]+) ([0-9]+)$'
CNT_RE=$'^(0|[1-9][0-9]{0,8})\n$'   # the guard's fd-3 file: exactly one canonical decimal line

# gcn.cjs, the guard preload: written once per invocation into the private temp dir (text = PLAN-phase4-g1 TASK 0d's
# evidence/p4-guard/0d/gcn.cjs + the R20 main-thread line). A heredoc, never $( ): no trailing-newline loss.
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
if (!require('worker_threads').isMainThread) return;
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
ycount() { printf '%s\n' "$1" | awk '/^Y /{n++} END{print n+0}'; }
# records -> "young <y> [<kind> x<n>, ..], old <o> in the window; <g> GC line(s) before the fence, <p> after end"
counts() {
  local y o u gl
  y=$(ycount "$1"); o=$(printf '%s\n' "$1" | awk '/^O /{n++} END{print n+0}')
  u=$(printf '%s\n' "$1" | awk '/^Y /{ print substr($0, 3) }' | multiset | awk '{ n = $1; sub(/^ *[0-9]+ /, ""); printf "%s%s x%d", (NR > 1 ? ", " : ""), $0, n }')
  gl=${1##*$'\n'}
  if [[ "$gl" =~ $G_RE ]]; then gl="${BASH_REMATCH[1]} GC line(s) before the fence, ${BASH_REMATCH[2]} after end"; else gl="no G record"; fi
  printf 'young %s%s, old %s in the window; %s' "$y" "${u:+ [$u]}" "$o" "$gl"
}

# judge: one side. JRC[k-1] = the driver exit of run k (or "<tee|tr|awk|append> <rc>" when that step failed), JREC[k-1] = the
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
  local d old got x fails=0 oks=0 REPORT=/dev/null TB0 AWKB c i o l
  local LS LDS LMC L2 LMM LMMDS LSX LFOO LIMM LMCR H1 T1 H2 T2 U1 S A1T GRAM TK NO fk mk dr b0 b1 TU
  TB0=${TMPDIR:-/tmp}; [[ "$TB0" == /* ]] || TB0="$PWD/$TB0"
  d=$(mktemp -d "$TB0/allocation-diff-st.XXXXXX") && d=$(cd "$d" && pwd) || { echo "FAIL self-test: mktemp -d"; echo; echo "self-test: 1 check(s) FAILED"; return 1; }
  # the temp dir goes on every exit path: this trap runs the script's own EXIT trap after it (with $? restored; set +e
  # so restoring a non-zero $? cannot cut the trap short)
  ST_D=$d
  eval "set -- $(trap -p EXIT)"; old=${3:-}
  # shellcheck disable=SC2064
  trap "st_rc=\$?; rm -rf \"\$ST_D\"; set +e; (exit \$st_rc); $old" EXIT
  check() { if [[ "$2" == "$3" ]]; then oks=$((oks + 1)); echo "ok $1"; else fails=$((fails + 1)); echo "FAIL $1: $2"; echo "  want: $3"; fi; }
  # TEXT -> GC_AWK records (";" per line); a failing GC_AWK adds "!awk exited <rc>" (no row expects it)
  rec() { printf '%s\n' "$1" | { awk "$GC_AWK" || echo "!awk exited $?"; } | tr '\n' ';'; }
  AWKB=$(command -v awk)

  # --- canned node v26.8.2 --trace-gc lines (p4-guard/raw/smoke.i.txt, p4-probe/raw/grammar.default.txt and
  # p4-probe/raw/S1.minorms.pre1.sparse.ws.run*.txt, verbatim) ---
  LS='[30520:0x7966000000]       39 ms: Scavenge 5.0 (6.1) -> 4.3 (6.6) MB, pooled: 0.0 MB, 0.48 / 0.00 ms (average mu = 1.000, current mu = 1.000) allocation failure; '
  LDS='[71888:0x78e8000000]       15 ms: Scavenge (during sweeping) 4.0 (5.6) -> 4.0 (5.6) MB, pooled: 0.0 MB, 0.04 / 0.00 ms (average mu = 0.921, current mu = 0.921) testing; '
  LMC='[71888:0x78e8000000]       15 ms: Mark-Compact 4.5 (5.4) -> 4.0 (5.4) MB, pooled: 0.0 MB, 1.03 / 0.00 ms (average mu = 0.921, current mu = 0.921) testing; GC in old space requested'
  L2='[71888:0x78e8000000]       24 ms: Incremental Mark-Compact 14.8 (16.7) -> 13.1 (15.3) MB, pooled: 0.0 MB, 1.75 / 0.00 ms (+ 0.0 ms in 20 steps since start of marking, biggest step 0.0 ms, walltime since start of marking 3 ms) (average mu = 0.875, current mu = 0.810) finalize incremental marking via stack guard; GC in old space requested'
  LMM='[61150:0x7590000000]       18 ms: Minor Mark-Sweep 4.9 (5.6) -> 4.2 (5.6) MB, pooled: 0.0 MB, 0.27 / 0.00 ms (average mu = 1.000, current mu = 1.000) allocation failure; '
  LMMDS='[71889:0x75a8000000]       15 ms: Minor Mark-Sweep (during sweeping) 4.0 (5.4) -> 4.0 (5.4) MB, pooled: 0.0 MB, 0.05 / 0.00 ms (average mu = 0.900, current mu = 0.900) testing; '
  # every pid, 0x, ms, MB, pause and reason changed
  LSX='[11111:0xabc0000001]     9999 ms: Scavenge 9.9 (8.8) -> 1.1 (2.2) MB, pooled: 3.3 MB, 7.77 / 8.88 ms (average mu = 0.123, current mu = 0.456) testing; '
  LFOO=${LS/ ms: Scavenge / ms: Foo }
  LIMM=${LS/ ms: Scavenge / ms: Incremental Minor Mark-Sweep }
  LMCR=${LMC/ ms: Mark-Compact / ms: Mark-Compact (reduce) }
  H1=${LS%% MB, pooled*}; T1=${LS#* MB, pooled}; H2=${L2%% MB, pooled*}; T2=${L2#* MB, pooled}
  U1="${L2/ ms: Incremental Mark-Compact / ms: Mark-Compact (reduce) }x"
  S=@@LITE-MARK
  win() { printf '%s start\n%s\n%s end\n%s\n%s gcn' "$S" "$1" "$S" "$LS" "$S"; }   # start, LINES, end, fence, gcn
  rep() { "$AWKB" -v n="$2" 'BEGIN { l = ARGV[1]; ARGV[1] = ""; for (i = 0; i < n; i++) print l }' "$1"; }   # LINE N

  # --- GC_AWK: records (PLAN-phase4-g1 A1', A1'', A3, A5', A13) ---
  A1T="$LS"$'\n'"$LS"$'\n'"$S start"$'\n'"$(rep "$LS" 3)"$'\n'"$S op 7"$'\n'"$S end"$'\n'"$LS"$'\n'"$S gcn"$'\n'"$LS"$'\n'"$LS"
  check "A1' records: 2 Scavenge, start, 3 Scavenge, op 7, end, 1 Scavenge, gcn, 2 Scavenge -> 3x 'Y Scavenge' + 'G 6 1'" \
    "$(rec "$A1T")" "Y Scavenge;Y Scavenge;Y Scavenge;G 6 1;"
  check "A1 records: every pid, 0x, ms, MB, pause and reason changed -> byte-identical records" \
    "$(rec "${A1T//"$LS"/$LSX}")|$(printf '%s\n' "${A1T//"$LS"/$LSX}" | grep -c -F -e "$LS" || true)" "$(rec "$A1T")|0"
  check "A1 / A3 records: Mark-Compact / Incremental Mark-Compact in the window -> O <kind>" \
    "$(rec "$(win "$LMC")")#$(rec "$(win "$L2")")" "O Mark-Compact;G 2 1;#O Incremental Mark-Compact;G 2 1;"
  check "A3 records: Scavenge (during sweeping), Minor Mark-Sweep, Minor Mark-Sweep (during sweeping) in the window -> Y <kind>" \
    "$(rec "$(win "$LDS")")#$(rec "$(win "$LMM")")#$(rec "$(win "$LMMDS")")" \
    "Y Scavenge;G 2 1;#Y Minor Mark-Sweep;G 2 1;#Y Minor Mark-Sweep;G 2 1;"
  check "A3 / A1' records: Foo, Incremental Minor Mark-Sweep, Mark-Compact (reduce) in the window -> X unknown GC kind" \
    "$(rec "$(win "$LFOO")")#$(rec "$(win "$LIMM")")#$(rec "$(win "$LMCR")")" \
    "X unknown GC kind 'Foo' in the window;G 2 1;#X unknown GC kind 'Incremental Minor Mark-Sweep' in the window;G 2 1;#X unknown GC kind 'Mark-Compact (reduce)' in the window;G 2 1;"
  check "A1 M2 records: '@@LITE-MARK started' -> X (not the start marker); a Mark-Compact outside the window -> counted in g only" \
    "$(rec "$S started"$'\n'"$(win "$LS")")#$(rec "$LMC"$'\n'"$(win "$LS")")" \
    "X a line holding @@LITE-MARK start, end or gcn that is not exactly that marker line;Y Scavenge;G 2 1;#Y Scavenge;G 3 1;"
  GRAM="X GC line does not match the --trace-gc grammar"; TK="X gc-tail-kind"
  check "A1'' records: N1 L1+x, N2 L1+space, N3 L2+x, N4 L2+' x' in the window -> X grammar" \
    "$(rec "$(win "${LS}x")")#$(rec "$(win "${LS} ")")#$(rec "$(win "${L2}x")")#$(rec "$(win "${L2} x")")" \
    "$GRAM;G 1 1;#$GRAM;G 1 1;#$GRAM;G 1 1;#$GRAM;G 1 1;"
  check "A1'' records: N5 H1+T2, N6 H2+T1, N7 L1+'GC in old space requested' in the window -> X gc-tail-kind" \
    "$(rec "$(win "${H1} MB, pooled${T2}")" | cut -d: -f1)#$(rec "$(win "${H2} MB, pooled${T1}")" | cut -d: -f1)#$(rec "$(win "${LS}GC in old space requested")" | cut -d: -f1)" \
    "$TK#$TK#$TK"
  check "A1'' records: U1 (Mark-Compact (reduce) + x) before start -> X grammar, the window still read" \
    "$(rec "$U1"$'\n'"$(win "$LS")")" "$GRAM;Y Scavenge;G 2 1;"
  check "A3 records: x + GC line, and a NUL (tr: ?) + GC line, in the window -> X not at line start; GC line + end glued -> X grammar" \
    "$(rec "$(win "x$LS")")#$(rec "$(win "abc?$LS")")#$(rec "$(win "${LS}$S end")" | cut -d';' -f1)" \
    "X GC line text not at line start in the window;G 1 1;#X GC line text not at line start in the window;G 1 1;#$GRAM"
  check "A3' records: gcn missing / given twice / before end -> X" \
    "$(rec "$S start"$'\n'"$S end"$'\n'"$LS")#$(rec "$(win "$LS")"$'\n'"$S gcn")#$(rec "$S start"$'\n'"$LS"$'\n'"$S gcn"$'\n'"$S end")" \
    "X no @@LITE-MARK gcn (the tool's exit fence);G 1 1;#Y Scavenge;X @@LITE-MARK gcn given twice;G 2 1;#Y Scavenge;X @@LITE-MARK gcn before @@LITE-MARK end;G 1 0;"
  check "A3' records: no marker at all; end before start -> X" \
    "$(rec "$LS")#$(rec "$S end"$'\n'"$(win "$LS")")" \
    "X no @@LITE-MARK start;X no @@LITE-MARK gcn (the tool's exit fence);G 1 0;#X @@LITE-MARK end before @@LITE-MARK start;Y Scavenge;G 2 1;"
  check "A13 records: a CR on the start / end / gcn marker line -> X 'not exactly that marker line' (and the marker counts as missing)" \
    "$(rec "$S start"$'\r'$'\n'"$LS"$'\n'"$S end"$'\n'"$LS"$'\n'"$S gcn")#$(rec "$S start"$'\n'"$LS"$'\n'"$S end"$'\r'$'\n'"$LS"$'\n'"$S gcn")#$(rec "$(win "$LS")"$'\r')" \
    "X a line holding @@LITE-MARK start, end or gcn that is not exactly that marker line;X @@LITE-MARK end before @@LITE-MARK start;X @@LITE-MARK gcn before @@LITE-MARK end;G 2 0;#Y Scavenge;X a line holding @@LITE-MARK start, end or gcn that is not exactly that marker line;Y Scavenge;X @@LITE-MARK gcn before @@LITE-MARK end;G 2 0;#Y Scavenge;X a line holding @@LITE-MARK start, end or gcn that is not exactly that marker line;X no @@LITE-MARK gcn (the tool's exit fence);G 2 1;"
  check "A5' records: 5,000 GC lines before start + 5,000 between end and gcn -> exactly 1 record line 'G 10000 5000'" \
    "$(rec "$(rep "$LS" 5000)"$'\n'"$S start"$'\n'"$S end"$'\n'"$(rep "$LS" 5000)"$'\n'"$S gcn")" "G 10000 5000;"

  # --- the guard preload text: gcn_cjs() == PLAN-phase4-g1 TASK 0d's evidence/p4-guard/0d/gcn.cjs + the R20 main-thread
  # line before `const v8` (A14) ---
  gcn_cjs >"$d/gcn.ref"
  if command -v sha256sum >/dev/null 2>&1; then x=$(sha256sum <"$d/gcn.ref"); else x=$(shasum -a 256 <"$d/gcn.ref"); fi
  check "A14 gcn_cjs() is p4-guard/0d/gcn.cjs + the R20 main-thread line: sha256 2089e91f.., 2042 bytes" \
    "${x%% *}|$(wc -c <"$d/gcn.ref" | tr -d ' ')" "2089e91faaf7896ba2585c4a7a3a324699adae09b1d42cf525e140fd3891b481|2042"

  # --- this script end to end on a fake node (bash): it appends its argv to <its dir>/log and "<rq> <fd3> <req>" to
  # <its dir>/req (rq: ok = an absolute --require cmp-equal to gcn_cjs(), else none / rel / bad), exits 7 if
  # NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE or NODE_REDIRECT_WARNINGS reached it, 9 on a driver argument
  # starting with - (as node: "bad option"); --version prints v26.8.2
  # (FAKE_VER_RC: that exit); --v8-options prints 7 name + type line pairs of test/fixtures/v8flags/v8-options.v26.8.2.txt
  # verbatim (expose-gc, lazy-feedback-allocation, max-inlined-bytecode-size, allow-natives-syntax, opt, turbo-filter
  # (string), trace-osr) and exits 0 (FAKE_V8O_RC: that exit); neither is a run. A run (n = its run count in that driver
  # dir) cats ./trace.<n>.txt or ./trace.txt; when rq = ok and no ./nocount it writes ./count.<n>, ./count or the number
  # of `[<digits>:0x` lines before the first gcn line to fd 3 (./rmcount: then deletes the tool's gcn.<side>.<k> files);
  # ./err.txt to stderr; exits ./rc.<n>, ./rc or 0. A mktemp shim (first on PATH) logs each call. ---
  fk="$d/fk"; mk="$d/mk"; dr="$d/dr"
  mkdir -p "$fk" "$mk" "$dr" "$d/cwd" "$d/tmp" "$d/sh"
  { printf '#!%s\nAWKB=%q\nREF=%q\n' "$BASH" "$AWKB" "$d/gcn.ref"; cat <<'FAKE_NODE'
d=$(dirname "$0")
printf '%s\n' "$*" >>"$d/log"
if [ -n "${NODE_OPTIONS+x}" ]; then echo "NODE_OPTIONS leaked"; exit 7; fi
if [ -n "${NODE_OPTIONS+x}${NODE_V8_COVERAGE+x}${NODE_COMPILE_CACHE+x}${NODE_REDIRECT_WARNINGS+x}" ]; then echo "a NODE_* env var leaked"; exit 7; fi
case "$1" in --version) if [ -n "${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; echo v26.8.2; exit 0 ;; esac
case "$1" in --v8-options) if [ -n "${FAKE_V8O_RC:-}" ]; then exit "$FAKE_V8O_RC"; fi
  printf '%s\n' '  --expose-gc (expose gc extension)' '        type: bool  default: --no-expose-gc' \
    '  --lazy-feedback-allocation (Allocate feedback vectors lazily)' '        type: bool  default: --lazy-feedback-allocation' \
    '  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)' '        type: int  default: --max-inlined-bytecode-size=460' \
    '  --allow-natives-syntax (allow natives syntax)' '        type: bool  default: --no-allow-natives-syntax' \
    '  --opt (alias for --turbofan)' '        type: bool  default: --opt' \
    '  --turbo-filter (optimization filter for TurboFan compiler)' '        type: string  default: --turbo-filter="*"' \
    '  --trace-osr (trace on-stack replacement)' '        type: bool  default: --no-trace-osr'
  exit 0 ;; esac
c="$d/$(basename "$PWD").n"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$c"
req=""; pv=""; drv=""
for a in "$@"; do if [ "$pv" = --require ]; then req=$a; fi; pv=$a; drv=$a; done
case "$drv" in -*) echo "bad option: $drv" >&2; exit 9 ;; esac
if [ -z "$req" ]; then rq=none; elif [ "${req#/}" = "$req" ]; then rq=rel; elif cmp -s "$req" "$REF"; then rq=ok; else rq=bad; fi
if [ -e /dev/fd/3 ]; then f3=yes; else f3=no; fi
printf '%s %s %s\n' "$rq" "$f3" "$req" >>"$d/req"
if [ -f "./trace.$n.txt" ]; then tf="./trace.$n.txt"; elif [ -f ./trace.txt ]; then tf=./trace.txt; else tf=/dev/null; fi
cat "$tf"
if [ "$rq" = ok ] && [ ! -f ./nocount ]; then
  if [ -f "./count.$n" ]; then cat "./count.$n" >&3; elif [ -f ./count ]; then cat ./count >&3
  else "$AWKB" '$0 == "@@LITE-MARK " "gcn" { exit } /\[[0-9]+:0x/ { c++ } END { printf "%d\n", c }' "$tf" >&3; fi
  if [ -f ./rmcount ]; then rm -f "$(dirname "$req")"/gcn.*.*; fi
fi 2>/dev/null
if [ -f ./err.txt ]; then cat ./err.txt >&2; fi
if [ -f "./rc.$n" ]; then exit "$(cat "./rc.$n")"; fi
if [ -f ./rc ]; then exit "$(cat ./rc)"; fi
exit 0
FAKE_NODE
  } >"$fk/node"
  { printf '#!%s\nMKB=%q\nLOG=%q\n' "$BASH" "$(command -v mktemp)" "$d/mk.log"; cat <<'FAKE_MKTEMP'
printf '%s\n' "$*" >>"$LOG"
r=$("$MKB" "$@") || exit 1
printf '%s\n' "$r"
FAKE_MKTEMP
  } >"$mk/mktemp"
  # shims, each first on PATH in its own row: awk (GC_AWK only, recognised by its gcn text) exits 5 / exits 0 with no
  # output / logs whether fd 3 is open in it; tee (the pipeline's, not `tee -a`) and tr (the pipeline's '\000' '?')
  # read their input and exit 4 / 6
  mkdir -p "$d/sh/a5" "$d/sh/a0" "$d/sh/a3" "$d/sh/tt" "$d/sh/tee"
  { printf '#!%s\n' "$BASH"; printf 'case "$1" in *"@@LITE-MARK gcn"*) cat >/dev/null; exit 5 ;; esac\n'; printf 'exec %q "$@"\n' "$AWKB"; } >"$d/sh/a5/awk"
  { printf '#!%s\n' "$BASH"; printf 'case "$1" in *"@@LITE-MARK gcn"*) cat >/dev/null; exit 0 ;; esac\n'; printf 'exec %q "$@"\n' "$AWKB"; } >"$d/sh/a0/awk"
  { printf '#!%s\n' "$BASH"; printf 'if [ -e /dev/fd/3 ]; then echo yes >>%q; else echo no >>%q; fi\n' "$d/awkfd3" "$d/awkfd3"; printf 'exec %q "$@"\n' "$AWKB"; } >"$d/sh/a3/awk"
  { printf '#!%s\n' "$BASH"; printf 'if [ "$1" != -a ]; then cat >/dev/null; exit 4; fi\n'; printf 'exec %q "$@"\n' "$(command -v tee)"; } >"$d/sh/tee/tee"
  cp "$d/sh/tee/tee" "$d/sh/tt/tee"
  { printf '#!%s\n' "$BASH"; printf 'if [ "$1" = %q ]; then cat >/dev/null; exit 6; fi\n' '\000'; printf 'exec %q "$@"\n' "$(command -v tr)"; } >"$d/sh/tt/tr"
  chmod +x "$fk/node" "$mk/mktemp" "$d/sh/a5/awk" "$d/sh/a0/awk" "$d/sh/a3/awk" "$d/sh/tee/tee" "$d/sh/tt/tee" "$d/sh/tt/tr"
  mkd() { mkdir -p "$dr/$1"; : >"$dr/$1/driver.js"; printf '%s\n' "$2" >"$dr/$1/trace.txt"; }   # NAME TRACE
  cnt() { printf -- "$2" >"$dr/$1/count"; }   # NAME FORMAT: the fake count file (\n and \000 escapes)
  NO="--node=$fk/node"
  spawn() { # [VAR=value ...] -- args... -> "rc|VERDICT line(s)|node spawns"; output in $d/sp.out. fd 3 closed; host
    local -a e=()   # NODE_OPTIONS / NODE / editor env never reach the script (rows that need one set it)
    local r
    while [[ "$1" != -- ]]; do e+=("$1"); shift; done; shift
    rm -f "$fk"/*.n; : >"$fk/log"; : >"$fk/req"; : >"$d/mk.log"
    (cd "$d/cwd" && env -u NODE_OPTIONS -u NODE -u GIT_EDITOR -u EDITOR -u VISUAL PATH="$mk:$PATH" TMPDIR="$d/tmp" \
      ${e[@]+"${e[@]}"} "$BASH" "$SELF" "$@") >"$d/sp.out" 2>&1 3>&- && r=0 || r=$?
    printf '%s|%s|%s' "$r" "$(awk '/^VERDICT /{ printf "%s%s", (n++ ? "," : ""), $0 }' "$d/sp.out")" "$(wc -l <"$fk/log" | tr -d ' ')"
  }
  has() { grep -c -F -x -e "$1" "$d/sp.out" || true; }
  reqs() { awk '{ print $1, $2 }' "$fk/req" | sort | uniq -c | awk '{ printf "%s%s %s x%s", (n++ ? "," : ""), $2, $3, $1 }'; }
  mkd y3 "$(win "$(rep "$LS" 3)")"; mkd y3b "$(win "$(rep "$LS" 3)")"; mkd y5 "$(win "$(rep "$LS" 5)")"; mkd y1 "$(win "$LS")"
  mkd z0 "$S start"$'\n'"$S end"$'\n'"$LS"$'\n'"$LS"$'\n'"$S gcn"; mkd z0b "$S start"$'\n'"$S end"$'\n'"$LS"$'\n'"$LS"$'\n'"$S gcn"
  mkd p0 "$S start"$'\n'"$S end"$'\n'"$S gcn"; mkd p0w "$S start"$'\n'"$(rep "$LS" 3)"$'\n'"$S end"$'\n'"$S gcn"
  mkd nc "$(win "$(rep "$LS" 3)")"; printf '%s\n' "$(win "$(rep "$LS" 4)")" >"$dr/nc/trace.2.txt"
  mkd mc "$(win "$LS"$'\n'"$LMC")"; mkd rc3 "$(win "$(rep "$LS" 3)")"; echo 3 >"$dr/rc3/rc"
  mkd nul "$S start"; printf 'abc\000%s\n%s end\n%s\n%s gcn\n' "$LS" "$S" "$LS" "$S" >>"$dr/nul/trace.txt"
  mkd post "$(win "$(rep "$LS" 3)")"$'\n'"$(rep "$LS" 4)"; mkd ngcn "$S start"$'\n'"$LS"$'\n'"$S end"$'\n'"$LS"
  mkd d666 "$(win "$(rep "$LS" 666)")"; mkd d667 "$(win "$(rep "$LS" 667)")"
  mkd e666 "$(win "$(rep "$LS" 666)")"; printf '%s\n' "$(win "$(rep "$LS" 667)")" >"$dr/e666/trace.3.txt"
  mkd err "$(win "$(rep "$LS" 3)")"; printf '%01024d' 0 | tr 0 e >"$dr/err/err.txt"

  # --- verdicts (A2 / A2' / A3 / A3' / A9 / A12(d)); every A3 row passes --runs 3 explicitly (A10) ---
  check "A2 e2e: diff 3 vs 5 (R=3) -> exit 1 DIFF, 8 spawns, '    before=3 after=5  Scavenge'" \
    "$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/y5/driver.js")|$(has '    before=3 after=5  Scavenge')" "1|VERDICT DIFF|8|1"
  check "A2 / A2' e2e: diff 3 vs 3, and 0 vs 0 (start, end, 2 Scavenge, gcn) -> exit 0 SAME" \
    "$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/y3b/driver.js")#$(spawn -- "$NO" --runs 3 "$dr/z0/driver.js" "$dr/z0b/driver.js")" \
    "0|VERDICT SAME|8#0|VERDICT SAME|8"
  check "A2' e2e: --zero on 0 young GC -> exit 0 ZERO, 5 spawns" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/z0/driver.js")|$(has '  ZERO -- no young GC in the window (every run equal to run 1)')" "0|VERDICT ZERO|5|1"
  check "A2 M9 e2e: --zero on 1 young GC -> exit 1 NONZERO" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/y1/driver.js")|$(has '  NONZERO -- 1 young GC(s) in the window (every run equal to run 1)')|$(has '  driver: run 1 young 1 [Scavenge x1], old 0 in the window; 2 GC line(s) before the fence, 1 after end; young per run 1,1,1')" \
    "1|VERDICT NONZERO|5|1|1"
  check "A3' e2e: markers + gcn, 0 GC lines -> exit 2 'no GC line between @@LITE-MARK end and the tool's exit fence in run 1'" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/p0/driver.js")|$(has "  NO-VERDICT -- driver: no GC line between @@LITE-MARK end and the tool's exit fence in run 1")" "2|VERDICT NO-VERDICT|5|1"
  check "A3' M14 e2e: 3 Scavenge in the window, none between end and gcn -> the same p = 0 reason" \
    "$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/p0w/driver.js")|$(has "  NO-VERDICT -- after: no GC line between @@LITE-MARK end and the tool's exit fence in run 1")" "2|VERDICT NO-VERDICT|8|1"
  check "A3 M8 e2e: run 2 differs from run 1 -> exit 2 null control naming run 2" \
    "$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/nc/driver.js")|$(has '  NO-VERDICT -- after: null control: run 2 differs from run 1 (1 kind(s) differ, first: run 1 x3 | run 2 x4  Scavenge)')" "2|VERDICT NO-VERDICT|8|1"
  check "A3 e2e: a Mark-Compact in the window -> exit 2 'old-generation GC in the window in run 1 (Mark-Compact)'" \
    "$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/mc/driver.js")|$(has '  NO-VERDICT -- after: old-generation GC in the window in run 1 (Mark-Compact)')" "2|VERDICT NO-VERDICT|8|1"
  check "A3 e2e: driver exit 3 -> exit 2 'driver exited 3 in run 1'" \
    "$(spawn -- "$NO" --runs 3 "$dr/rc3/driver.js" "$dr/y3/driver.js")|$(has '  NO-VERDICT -- before: driver exited 3 in run 1')" "2|VERDICT NO-VERDICT|8|1"
  check "A3 M10 e2e: a NUL-glued Scavenge line in the window -> exit 2 unparseable (not at line start); --out raw keeps the NUL" \
    "$(spawn -- "$NO" --runs 3 --out "$d/on" "$dr/y3/driver.js" "$dr/nul/driver.js")|$(has '  NO-VERDICT -- after: unparseable --trace-gc output in run 1: GC line text not at line start in the window')|$(tr -d -c '\000' <"$d/on/raw/after/run.1.txt" | wc -c | tr -d ' ')" \
    "2|VERDICT NO-VERDICT|8|1|1"
  check "A3 e2e: an awk shim exiting 5 is named before the driver's exit 3" \
    "$(spawn PATH="$d/sh/a5:$mk:$PATH" -- "$NO" --runs 3 "$dr/rc3/driver.js" "$dr/y3/driver.js")|$(has '  NO-VERDICT -- before: cannot read driver output in run 1 (awk exited 5)')|$(grep -c 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|8|1|0"
  check "A3' e2e: gcn missing -> exit 2 unparseable 'no @@LITE-MARK gcn'" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/ngcn/driver.js")|$(has "  NO-VERDICT -- driver: unparseable --trace-gc output in run 1: no @@LITE-MARK gcn (the tool's exit fence)")" "2|VERDICT NO-VERDICT|5|1"
  check "A3' M17 e2e: 4 Scavenge after gcn, count = g -> verdict unchanged (SAME)" \
    "$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/post/driver.js")" "0|VERDICT SAME|8"
  check "A9 M20 e2e: 666 x3 vs 666, 666, 667 -> exit 2 null control naming run 3" \
    "$(spawn -- "$NO" --runs 3 "$dr/d666/driver.js" "$dr/e666/driver.js")|$(has '  NO-VERDICT -- after: null control: run 3 differs from run 1 (1 kind(s) differ, first: run 1 x666 | run 3 x667  Scavenge)')" "2|VERDICT NO-VERDICT|8|1"
  check "A12(d) e2e: 667 x3 vs 666 x3 -> exit 1 DIFF by 1 (the edge-flip sentence)" \
    "$(spawn -- "$NO" --runs 3 "$dr/d667/driver.js" "$dr/d666/driver.js")|$(has '    before=667 after=666  Scavenge')" "1|VERDICT DIFF|8|1"
  check "A3 e2e: a driver writing 1 KB to stderr -> raw/after/run.1.err holds it, records + verdict unchanged; raw layout" \
    "$(spawn -- "$NO" --runs 3 --out "$d/oe" "$dr/y3/driver.js" "$dr/err/driver.js")|$(wc -c <"$d/oe/raw/after/run.1.err" | tr -d ' ')|$(grep -c 'eeee' "$d/oe/report.txt" || true)|$(ls "$d/oe/raw/before" | tr '\n' ' ')" \
    "0|VERDICT SAME|8|1024|0|run.1.err run.1.txt run.2.err run.2.txt run.3.err run.3.txt "
  check "e2e: --zero --out -> raw/driver only; report.txt holds the verdict" \
    "$(spawn -- "$NO" --runs 2 --zero --out "$d/oz" "$dr/z0/driver.js")|$(ls "$d/oz/raw" | tr '\n' ' ')|$(grep -c '^VERDICT ZERO$' "$d/oz/report.txt" || true)" "0|VERDICT ZERO|4|driver |1"
  check "A14(e) e2e: spawn argv = v8 flags first, the trace flags, --require <T>/gcn.cjs, ./<driver>" \
    "$(spawn -- "$NO" --runs 2 --v8-flags '--expose-gc' --zero "$dr/z0/driver.js" | cut -d'|' -f1)|$(sed -n 3p "$fk/log" | sed -E "s#$d/tmp/allocation-diff\\.[A-Za-z0-9]{6}/#<T>/#")" \
    "0|--expose-gc --trace-gc --min-semi-space-size=1 --max-semi-space-size=1 --no-concurrent-recompilation --no-allocation-site-pretenuring --require <T>/gcn.cjs ./driver.js"
  mkdir -p "$dr/dash"; : >"$dr/dash/-p.js"; printf '%s\n' "$(win "$(rep "$LS" 3)")" >"$dr/dash/trace.txt"
  check "A14(e) e2e: a driver named '-p.js' runs as ./-p.js (never read as a node option): 6 argvs end ' ./-p.js', SAME" \
    "$(spawn -- "$NO" --runs 3 "$dr/dash/-p.js" "$dr/dash/-p.js")|$(grep -c -e ' \./-p\.js$' "$fk/log" || true)" "0|VERDICT SAME|8|6"
  check "e2e: NODE_OPTIONS set in the environment never reaches a spawn (SAME, 8 spawns)" \
    "$(spawn NODE_OPTIONS=--st-probe -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/y3b/driver.js")" "0|VERDICT SAME|8"
  check "e2e: a failing --version (with --out) -> exit 2 after 1 spawn, no OUT dir, no temp dir" \
    "$(spawn FAKE_VER_RC=1 -- "$NO" --out "$d/ov" "$dr/y3/driver.js" "$dr/y3b/driver.js" | cut -d'|' -f1,3)|$([[ -e "$d/ov" ]] && echo exists || echo absent)|$(wc -l <"$d/mk.log" | tr -d ' ')" \
    "2|1|absent|0"
  check "A10 MD-31 e2e: no --runs -> runs 5: diff 12 spawns, --zero 7 spawns; the head says 'runs 5'" \
    "$(spawn -- "$NO" "$dr/y3/driver.js" "$dr/y3b/driver.js")|$(grep -c '^mode    diff  runs 5  ' "$d/sp.out" || true)#$(spawn -- "$NO" --zero "$dr/z0/driver.js")|$(grep -c '^mode    zero  runs 5  ' "$d/sp.out" || true)" \
    "0|VERDICT SAME|12|1#0|VERDICT ZERO|7|1"
  o=""
  for l in N1 N2 N3 N4 N5 N6 N7 U1; do
    case $l in N1) x="${LS}x" ;; N2) x="${LS} " ;; N3) x="${L2}x" ;; N4) x="${L2} x" ;; N5) x="${H1} MB, pooled${T2}" ;;
      N6) x="${H2} MB, pooled${T1}" ;; N7) x="${LS}GC in old space requested" ;; U1) x="" ;; esac
    if [[ $l == U1 ]]; then mkd "a$l" "$U1"$'\n'"$(win "$LS")"; else mkd "a$l" "$(win "$x")"; fi
    o="$o#$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/a$l/driver.js")|$(grep -c '^  NO-VERDICT -- after: unparseable --trace-gc output in run 1: ' "$d/sp.out" || true)"
  done
  check "A1'' e2e: N1-N7 in the window and U1 before start -> each exit 2 unparseable" "$o" "$(printf '#2|VERDICT NO-VERDICT|8|1%.0s' 1 2 3 4 5 6 7 8)"

  # --- A13 rows: run k > 1 only; tee + tr failing together; CR on one marker; awk exit 0 without G ---
  mkd k2 "$(win "$(rep "$LS" 3)")"; echo 3 >"$dr/k2/rc.2"
  mkd k3 "$(win "$(rep "$LS" 3)")"; printf '%s\n' "$S start"$'\n'"$(rep "$LS" 3)"$'\n'"$S end"$'\n'"$S gcn" >"$dr/k3/trace.2.txt"
  mkd k4 "$(win "$(rep "$LS" 3)")"; printf '%s\n' "$(win "$LFOO")" >"$dr/k4/trace.3.txt"
  check "A13 e2e: in run k > 1 only -- driver exit 3 (run 2), p = 0 (run 2), an X (run 3) -> each named with its run" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/k2/driver.js")|$(has '  NO-VERDICT -- driver: driver exited 3 in run 2')#$(spawn -- "$NO" --runs 3 --zero "$dr/k3/driver.js")|$(has "  NO-VERDICT -- driver: no GC line between @@LITE-MARK end and the tool's exit fence in run 2")#$(spawn -- "$NO" --runs 3 --zero "$dr/k4/driver.js")|$(has "  NO-VERDICT -- driver: unparseable --trace-gc output in run 3: unknown GC kind 'Foo' in the window")" \
    "2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1"
  check "A13 e2e: tee (exit 4) and tr (exit 6) failing in one run -> tr named; tee alone is named before the driver's exit 3" \
    "$(spawn PATH="$d/sh/tt:$mk:$PATH" -- "$NO" --runs 3 --zero "$dr/y3/driver.js")|$(has '  NO-VERDICT -- driver: cannot read driver output in run 1 (tr exited 6)')#$(spawn PATH="$d/sh/tee:$mk:$PATH" -- "$NO" --runs 3 --zero "$dr/rc3/driver.js")|$(has '  NO-VERDICT -- driver: cannot read driver output in run 1 (tee exited 4)')" \
    "2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1"
  mkd cr "$S start"$'\n'"$LS"$'\n'"$S end"$'\r'$'\n'"$LS"$'\n'"$S gcn"
  check "A13 e2e: a CR on the end marker line -> exit 2 unparseable 'not exactly that marker line'" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/cr/driver.js")|$(has '  NO-VERDICT -- driver: unparseable --trace-gc output in run 1: a line holding @@LITE-MARK start, end or gcn that is not exactly that marker line')" \
    "2|VERDICT NO-VERDICT|5|1"
  check "A13 e2e: the record awk exits 0 with no output (no G record) -> exit 2 'no G record', never ZERO" \
    "$(spawn PATH="$d/sh/a0:$mk:$PATH" -- "$NO" --runs 3 --zero "$dr/z0/driver.js")|$(has '  NO-VERDICT -- driver: unparseable --trace-gc output in run 1: no G record')" \
    "2|VERDICT NO-VERDICT|5|1"

  # --- the guard count (TASK 3g: A6, A13) ---
  mkd g6 "$A1T"; mkd g6b "$A1T"
  check "A6 e2e: G 6 / count 6 -> SAME; every spawn got the absolute cmp-equal preload and fd 3" \
    "$(spawn -- "$NO" --runs 3 "$dr/g6/driver.js" "$dr/g6b/driver.js")|$(reqs)" "0|VERDICT SAME|8|ok yes x6"
  mkd g7 "$A1T"; cnt g7 '7\n'; mkd g9 "$A1T"; cnt g9 '9\n'
  check "A6 e2e: count 7 -> 'trace lost 1 GC line in run 1'; count 9 -> 'trace lost 3 GC lines'" \
    "$(spawn -- "$NO" --runs 3 "$dr/g6/driver.js" "$dr/g7/driver.js")|$(has '  NO-VERDICT -- after: trace lost 1 GC line in run 1 (guard count 7, trace 6)')#$(spawn -- "$NO" --runs 3 "$dr/g9/driver.js" "$dr/g6/driver.js")|$(has '  NO-VERDICT -- before: trace lost 3 GC lines in run 1 (guard count 9, trace 6)')" \
    "2|VERDICT NO-VERDICT|8|1#2|VERDICT NO-VERDICT|8|1"
  mkd g5 "$A1T"; cnt g5 '5\n'; mkd g0 "$A1T"; cnt g0 '0\n'
  check "A6 e2e: count 5 -> '1 GC line in run 1 the guard did not count'; count 0 is a count -> '6 GC lines ...'" \
    "$(spawn -- "$NO" --runs 3 "$dr/g6/driver.js" "$dr/g5/driver.js")|$(has '  NO-VERDICT -- after: 1 GC line in run 1 the guard did not count (guard count 5, trace 6)')#$(spawn -- "$NO" --runs 3 --zero "$dr/g0/driver.js")|$(has '  NO-VERDICT -- driver: 6 GC lines in run 1 the guard did not count (guard count 0, trace 6)')" \
    "2|VERDICT NO-VERDICT|8|1#2|VERDICT NO-VERDICT|5|1"
  mkd gnone "$A1T"; : >"$dr/gnone/nocount"; mkd grm "$A1T"; : >"$dr/grm/rmcount"
  check "A6 e2e: fd 3 never written, or the count file deleted before the read -> 'no guard count in run 1'" \
    "$(spawn -- "$NO" --runs 3 "$dr/g6/driver.js" "$dr/gnone/driver.js")|$(has '  NO-VERDICT -- after: no guard count in run 1')#$(spawn -- "$NO" --runs 3 --zero "$dr/grm/driver.js")|$(has '  NO-VERDICT -- driver: no guard count in run 1')" \
    "2|VERDICT NO-VERDICT|8|1#2|VERDICT NO-VERDICT|5|1"
  i=0; o=""
  for c in '' '6' '7x\n' ' 6\n' '6 \n' '06\n' '-6\n' '+6\n' '6\n6\n' '6\n\n' '6\r\n' '6\000\n' '\0006\n' '1234567890\n' '0x6\n' '6.0\n'; do
    i=$((i + 1)); mkd "gb$i" "$A1T"; cnt "gb$i" "$c"
    o="$o#$(spawn -- "$NO" --runs 3 --zero "$dr/gb$i/driver.js")|$(has '  NO-VERDICT -- driver: no guard count in run 1')"
  done
  check "A14(b) e2e: 16 count files that are not one canonical decimal line (empty, no newline, sign, leading zero, 10 digits, NUL, CR, 2 lines, ...) -> each 'no guard count'" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|5|1%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16)"
  mkd gr2 "$A1T"; printf '7\n' >"$dr/gr2/count.2"; mkd gr3 "$A1T"; printf '5\n' >"$dr/gr3/count.3"
  check "e2e: a count mismatch in run 2 only / run 3 only -> named with its run" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/gr2/driver.js")|$(has '  NO-VERDICT -- driver: trace lost 1 GC line in run 2 (guard count 7, trace 6)')#$(spawn -- "$NO" --runs 3 --zero "$dr/gr3/driver.js")|$(has '  NO-VERDICT -- driver: 1 GC line in run 3 the guard did not count (guard count 5, trace 6)')" \
    "2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1"
  mkd gt1 "x$LS"$'\n'"$A1T"
  mkd gt2 "$S start"$'\n'"$LS"$'\n'"$S end"$'\n'"$LS"$'\n'"partial-write$LS"$'\n'"$S gcn"
  mkd gt4 "abc"; printf '\000%s\n%s\n' "$LS" "$A1T" >>"$dr/gt4/trace.txt"; printf '7\n' >"$dr/gt4/count"
  check "A13 e2e: a torn GC line glued after text before start / between end and gcn / after a NUL before start -> 'trace lost 1'" \
    "$(spawn -- "$NO" --runs 3 "$dr/g6/driver.js" "$dr/gt1/driver.js")|$(has '  NO-VERDICT -- after: trace lost 1 GC line in run 1 (guard count 7, trace 6)')#$(spawn -- "$NO" --runs 3 --zero "$dr/gt2/driver.js")|$(has '  NO-VERDICT -- driver: trace lost 1 GC line in run 1 (guard count 3, trace 2)')#$(spawn -- "$NO" --runs 3 --zero "$dr/gt4/driver.js")|$(has '  NO-VERDICT -- driver: trace lost 1 GC line in run 1 (guard count 7, trace 6)')" \
    "2|VERDICT NO-VERDICT|8|1#2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1"
  mkd gdg "$S start"$'\n'"$LS"$'\n'"$S end"$'\n'"$LS"$'\n'"$S gcn"$'\n'"$LS"$'\n'"$S gcn"; printf '3\n' >"$dr/gdg/count"
  check "A13 e2e: a driver-written @@LITE-MARK gcn (the tool's follows) -> X 'given twice'" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/gdg/driver.js")|$(has '  NO-VERDICT -- driver: unparseable --trace-gc output in run 1: @@LITE-MARK gcn given twice')" "2|VERDICT NO-VERDICT|5|1"
  mkd gx "$(win "$LFOO")"; printf '9\n' >"$dr/gx/count"; mkd gp0 "$S start"$'\n'"$S end"$'\n'"$S gcn"; : >"$dr/gp0/nocount"
  check "A6 judge order e2e: X + count mismatch -> the X; p = 0 + no count -> the p reason" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/gx/driver.js")|$(has "  NO-VERDICT -- driver: unparseable --trace-gc output in run 1: unknown GC kind 'Foo' in the window")#$(spawn -- "$NO" --runs 3 --zero "$dr/gp0/driver.js")|$(has "  NO-VERDICT -- driver: no GC line between @@LITE-MARK end and the tool's exit fence in run 1")" \
    "2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1"
  mkd gmc "$(win "$LS"$'\n'"$LMC")"; printf '4\n' >"$dr/gmc/count"
  mkd gnc "$(win "$(rep "$LS" 3)")"; printf '%s\n' "$(win "$(rep "$LS" 4)")" >"$dr/gnc/trace.2.txt"; printf '9\n' >"$dr/gnc/count.3"
  check "A6 judge order e2e: Mark-Compact + count 4 (g 3) -> the count; null control (run 2) + count mismatch (run 3) -> the count" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/gmc/driver.js")|$(has '  NO-VERDICT -- driver: trace lost 1 GC line in run 1 (guard count 4, trace 3)')#$(spawn -- "$NO" --runs 3 --zero "$dr/gnc/driver.js")|$(has '  NO-VERDICT -- driver: trace lost 5 GC lines in run 3 (guard count 9, trace 4)')" \
    "2|VERDICT NO-VERDICT|5|1#2|VERDICT NO-VERDICT|5|1"
  check "A6 e2e: R=3 --zero with counts -> 5 spawns, ZERO; driver exit 3 + count missing -> the driver exit named" \
    "$(spawn -- "$NO" --runs 3 --zero "$dr/z0/driver.js")|$(reqs)#$(spawn -- "$NO" --runs 3 "$dr/rc3/driver.js" "$dr/gnone/driver.js")|$(has '  NO-VERDICT -- before: driver exited 3 in run 1')|$(has '  NO-VERDICT -- after: no guard count in run 1')" \
    "0|VERDICT ZERO|5|ok yes x3#2|VERDICT NO-VERDICT|8|1|1"
  : >"$d/awkfd3"
  check "e2e: fd 3 (the guard count) is open in node only, never in the record awk" \
    "$(spawn PATH="$d/sh/a3:$mk:$PATH" -- "$NO" --runs 2 --zero "$dr/z0/driver.js")|$(grep -c yes "$d/awkfd3" || true)|$([[ $(grep -c no "$d/awkfd3" || true) -ge 2 ]] && echo seen || echo unseen)" "0|VERDICT ZERO|4|0|seen"
  spawn -- "$NO" --runs 2 --zero "$dr/z0/driver.js" >/dev/null; x=$(sed -n 1p "$fk/req" | awk '{ print $3 }')
  rm -f "$fk"/*.n; : >"$fk/log"; : >"$fk/req"; mkdir -p "$d/rel/rt"
  (cd "$d/rel" && env -u NODE_OPTIONS -u NODE TMPDIR=rt "$BASH" "$SELF" "$NO" --runs 2 --zero "$dr/z0/driver.js") >"$d/sp.out" 2>&1 3>&- && c=0 || c=$?
  x="$x#$c|$(sed -n 1p "$fk/req" | awk '{ print $3 }')|$(ls -A "$d/rel/rt" | wc -l | tr -d ' ')"
  rm -f "$fk"/*.n; : >"$fk/log"; : >"$fk/req"
  (cd "$d/cwd" && env -u NODE_OPTIONS -u NODE -u TMPDIR "$BASH" "$SELF" "$NO" --runs 2 --zero "$dr/z0/driver.js") >"$d/sp.out" 2>&1 3>&- && c=0 || c=$?
  TU=$(sed -n 1p "$fk/req" | awk '{ print $3 }'); TU=${TU%/gcn.cjs}
  x="$x#$c|$TU|$([[ -e "$TU" ]] && echo left || echo gone)"
  check "A13 e2e: the temp dir is <abs TMPDIR>/allocation-diff.XXXXXX (a relative TMPDIR made absolute; unset -> /tmp), gcn.cjs in it, removed on exit" \
    "$(printf '%s' "$x" | sed -E -e "s#$d/tmp/allocation-diff\\.[A-Za-z0-9]{6}/gcn\\.cjs#<T>#" -e "s#$d/rel/rt/allocation-diff\\.[A-Za-z0-9]{6}/gcn\\.cjs#<R>#" -e "s#/tmp/allocation-diff\\.[A-Za-z0-9]{6}\\|#<U>|#")" \
    "<T>#0|<R>|0#0|<U>|gone"
  # A13 / A14(a): --out DIR whose report.txt is a DRIVER, before or after (the file, a symlink, a hard link, DIR via a symlink)
  mkdir -p "$d/od1" "$d/od2" "$d/od3" "$d/od4"; printf 'DRIVER-BYTES\n' >"$d/od1/report.txt"; ln -s "$d/od1/report.txt" "$d/od2/report.txt"
  ln "$d/od1/report.txt" "$d/od3/report.txt"; ln -s "$d/od1" "$d/od4/link"
  o=""
  for x in "$d/od1" "$d/od2" "$d/od3" "$d/od4/link"; do
    o="$o#$(spawn -- "$NO" --runs 2 --out "$x" "$d/od1/report.txt" "$dr/y3/driver.js" | cut -d'|' -f1,3)|$(grep -c '^allocation-diff: --out: .*report.txt is the DRIVER (before) ' "$d/sp.out" || true)"
    o="$o/$(spawn -- "$NO" --runs 2 --out "$x" "$dr/y3/driver.js" "$d/od1/report.txt" | cut -d'|' -f1,3)|$(grep -c '^allocation-diff: --out: .*report.txt is the DRIVER (after) ' "$d/sp.out" || true)"
  done
  check "A14(a) e2e: --out DIR/report.txt is the BEFORE or the AFTER driver (file, symlink, hard link, DIR symlink) -> refused, 0 spawns, driver intact" \
    "$o|$(cat "$d/od1/report.txt")|$(ls -A "$d/od1" | tr '\n' ' ')" "$(printf '#2|0|1/2|0|1%.0s' 1 2 3 4)|DRIVER-BYTES|report.txt "
  check "e2e: --out ../od1 whose report.txt is the --zero driver given as ../od3/report.txt (relative paths) -> refused" \
    "$(cd "$d/cwd" && env -u NODE_OPTIONS TMPDIR="$d/tmp" "$BASH" "$SELF" "$NO" --runs 2 --zero --out ../od1 ../od3/report.txt >/dev/null 2>&1 3>&-; echo $?)|$(cat "$d/od1/report.txt")" \
    "2|DRIVER-BYTES"
  # relative PATH: node = $d/cwd/nm/node (the caller's cwd) and a rogue nm/node in each driver dir; all 2 + 2R spawns hit ONE
  mkdir -p "$d/cwd/nm" "$dr/rpb/nm" "$dr/rpa/nm"
  for x in "$d/cwd/nm" "$dr/rpb/nm" "$dr/rpa/nm"; do cp "$fk/node" "$x/node"; done
  mkd rpb "$(win "$(rep "$LS" 3)")"; mkd rpa "$(win "$(rep "$LS" 5)")"
  got=$(spawn PATH="nm:$mk:$PATH" -- --runs 3 "$dr/rpb/driver.js" "$dr/rpa/driver.js")
  check "A13 e2e relative PATH (PATH=nm:...): all 2 + 2R spawns run the ONE node resolved from the caller's cwd, named absolute in the head" \
    "${got%|*}|$(wc -l <"$d/cwd/nm/log" | tr -d ' ')|$(cat "$dr/rpb/nm/log" "$dr/rpa/nm/log" 2>/dev/null | wc -l | tr -d ' ')|$(has "allocation-diff  node v26.8.2  $d/cwd/nm/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)")" \
    "1|VERDICT DIFF|8|0|1"
  rm -rf "$d/cwd/nm"

  # --- -h, and refusals: each exit 2 before any spawn or disk write (A3 11 + A14(d)), except check 71's --v8-flags
  # sub-case (a token outside the allowlist): exit 2 after the --version and --v8-options spawns, before any disk write ---
  "$BASH" "$SELF" -h >"$d/h.out" 2>&1 3>&- && c=0 || c=$?
  check "-h: exit 2, the usage text from line 2, '--runs N ... (default 5)' once, the fd 3 contract once" \
    "$c|$(sed -n 1p "$d/h.out" | cut -c1-21)|$(grep -c '(default 5)' "$d/h.out" || true)|$(grep -c 'fd 3 is the guard' "$d/h.out" || true)" "2|allocation-diff.sh --|1|1"
  rf() { # LABEL FRAGMENT args...: refused with exit 2, 0 spawns, 0 mktemp, one die line holding FRAGMENT
    local l="$1" f="$2"; shift 2
    check "refused before any spawn: $l -> exit 2, 0 spawns, 0 mktemp, '$f'" \
      "$(spawn -- "$@")|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -F -e "$f" "$d/sp.out" | grep -c '^allocation-diff: ' || true)" "2|VERDICT NO-VERDICT|0|0|1"
  }
  rf "--zero with 2 DRIVERs" "--zero takes exactly one DRIVER, got 2" "$NO" --zero "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "diff with 1 DRIVER" "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got 1" "$NO" "$dr/y3/driver.js"
  rf "--runs 1" "--runs must be an integer in [2, 20] (null control), got '1'" "$NO" --runs 1 "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "--runs 21" "--runs must be an integer in [2, 20] (null control), got '21'" "$NO" --runs 21 "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "--v8-flags --trace_gc_verbose" "--v8-flags must not set --trace_gc_verbose: the script sets" "$NO" --v8-flags --trace_gc_verbose "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "--v8-flags --max-semi-space-size=4" "--v8-flags must not set --max-semi-space-size=4: the script fixes" "$NO" --v8-flags --max-semi-space-size=4 "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "--v8-flags --predictable-gc-schedule" "--v8-flags must not set --predictable-gc-schedule: it forces" "$NO" --v8-flags --predictable-gc-schedule "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "--v8-flags --predictable_gc_schedule" "--v8-flags must not set --predictable_gc_schedule: it forces" "$NO" --v8-flags --predictable_gc_schedule "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "a non-flag in --v8-flags" "--v8-flags takes flags only (each starts with -- and a letter), got 'foo'" "$NO" --v8-flags foo "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "unknown option" "unknown option --nod (did you mean --node?)" "$NO" --nod x "$dr/y3/driver.js" "$dr/y5/driver.js"
  rf "a newline in --out" "--v8-flags / --out / --node: a newline is not allowed" "$NO" --out $'a\nb' "$dr/y3/driver.js" "$dr/y5/driver.js"
  o=""
  for x in --require=./p.js --require --import=./p.mjs --import; do
    o="$o#$(spawn -- "$NO" "--v8-flags=--expose-gc $x" "$dr/y3/driver.js" "$dr/y5/driver.js" | cut -d'|' -f1,3)|$(grep -c -F -e "allocation-diff: --v8-flags must not set $x" "$d/sp.out" || true)"
  done
  x="$(spawn -- "$NO" --v8-flags '-r ./p.js' "$dr/y3/driver.js" "$dr/y5/driver.js" | cut -d'|' -f1,3)|$(grep -c -F -e "allocation-diff: --v8-flags takes flags only (each starts with -- and a letter), got '-r'" "$d/sp.out" || true)"
  # FLAG -> the exact MD-50 die line of lib/v8flags.sh's v8fl_check (a --v8-flags token outside the allowlist)
  v8m() { printf 'allocation-diff: --v8-flags must not set %s: only V8 tuning flags of this node binary are accepted (node'"'"'s own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)' "$1"; }
  check "A14(d) refused before any spawn: --v8-flags --require=F / --require / --import=F / --import (a preload ahead of the guard's) and -r F -> exit 2, 0 spawns; --experimental-require-module (not a V8 flag of this node) -> exit 2 after the --version and --v8-options spawns, one MD-50 die line" \
    "$o#$x#$(spawn -- "$NO" --runs 2 --v8-flags '--experimental-require-module' --zero "$dr/z0/driver.js" | cut -d'|' -f1,3)|$(grep -c -F -x -e "$(v8m --experimental-require-module)" "$d/sp.out" || true)" \
    "#2|0|1#2|0|1#2|0|1#2|0|1#2|0|1#2|2|1"

  # --- A5 retention: 3 cycles of SAME / DIFF / NONZERO / NO-VERDICT (x2) without --out -> 1 mktemp each, 0 new entries ---
  ents() { find "$d/tmp" "$d/cwd" "$dr/y3" "$dr/y3b" "$dr/y5" "$dr/y1" "$dr/mc" "$dr/gnone" -mindepth 1 | wc -l | tr -d ' '; }
  rm -rf "$d/tmp" "$d/cwd"; mkdir -p "$d/tmp" "$d/cwd"; b0=$(ents); o=""
  for x in 1 2 3; do
    for l in y3b y5 zero mc gnone; do
      if [[ $l == zero ]]; then got=$(spawn -- "$NO" --runs 3 --zero "$dr/y1/driver.js"); else got=$(spawn -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/$l/driver.js"); fi
      o="$o/${got%%|*}$(wc -l <"$d/mk.log" | tr -d ' ')"
    done
  done
  b1=$(ents)
  check "A5 retention: 3 x (SAME / DIFF / NONZERO / NO-VERDICT old GC / NO-VERDICT no count), no --out -> 1 logged mktemp each, 0 new entries in TMPDIR, cwd and the driver dirs" \
    "$o|$b0->$b1" "$(printf '/01/11/11/21/21%.0s' 1 2 3)|$b0->$b0"

  # --- MD-33 (A15): an unreadable --out DIR/raw is refused, never read as empty (ls -A on it fails silently) ---
  mkdir -p "$d/ou/raw/driver"; printf 'RUN1-BYTES\n' >"$d/ou/raw/driver/run.1.txt"; chmod 0300 "$d/ou/raw"
  x='is not readable'; [[ $EUID -ne 0 ]] || x='is not empty (give a new or empty DIR)'   # euid 0 reads a 0300 dir: refused as non-empty
  got=$(spawn -- "$NO" --runs 2 --zero --out "$d/ou" "$dr/z0/driver.js"); chmod 0700 "$d/ou/raw"   # mode restored before any read
  check "MD-33 refused before any spawn: --out DIR whose raw/ is mode 0300 (holding driver/run.1.txt) -> exit 2, 0 spawns, 0 mktemp, 'is not readable', run.1.txt unchanged" \
    "$got|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -c -F -x -e "allocation-diff: --out: $d/ou/raw $x" "$d/sp.out" || true)|$(cat "$d/ou/raw/driver/run.1.txt")|$(ls -A "$d/ou" | tr '\n' ' ')" \
    "2|VERDICT NO-VERDICT|0|0|1|RUN1-BYTES|raw "

  # --- MD-39 (ext-audit A13): a --v8-flags flag that loads environment variables or node options from a file ---
  o=""
  for x in --env-file=F --env_file=F --env-file-if-exists=F --experimental-config-file=F --experimental-default-config-file=F; do
    o="$o#$(spawn -- "$NO" "--v8-flags=--expose-gc $x" "$dr/y3/driver.js" "$dr/y5/driver.js" | cut -d'|' -f1,3)|$(grep -c -F -e "allocation-diff: --v8-flags must not set $x: it loads environment variables or node options from a file" "$d/sp.out" || true)"
  done
  check "MD-39 refused before any spawn: --v8-flags --env-file=F / --env_file=F / --env-file-if-exists=F / --experimental-config-file=F / --experimental-default-config-file=F (environment or node options loaded from a file) -> exit 2, 0 spawns" \
    "$o" "#2|0|1#2|0|1#2|0|1#2|0|1#2|0|1"

  # --- MD-42 (ext-audit A15): a --v8-flags flag that loads a module of yours (a prefix match) ---
  o=""
  for x in --loader=F --loader --experimental-loader=F --experimental_loader=F --require-module; do
    o="$o#$(spawn -- "$NO" "--v8-flags=--expose-gc $x" "$dr/y3/driver.js" "$dr/y5/driver.js" | cut -d'|' -f1,3)|$(grep -c -F -e "allocation-diff: --v8-flags must not set $x: it loads a module of yours into the measured process" "$d/sp.out" || true)"
  done
  check "MD-42 refused before any spawn: --v8-flags --loader=F / --loader / --experimental-loader=F / --experimental_loader=F / --require-module (a module of yours; a prefix match) -> exit 2, 0 spawns" \
    "$o" "#2|0|1#2|0|1#2|0|1#2|0|1#2|0|1"

  # --- MD-44 (ext-audit A17): a --v8-flags flag that runs code of yours in place of the driver (a prefix match) ---
  o=""
  for x in --eval=F --eval --print=F --print --print-bytecode; do
    o="$o#$(spawn -- "$NO" "--v8-flags=--expose-gc $x" "$dr/y3/driver.js" "$dr/y5/driver.js" | cut -d'|' -f1,3)|$(grep -c -F -e "allocation-diff: --v8-flags must not set $x: it runs code of yours in the measured process" "$d/sp.out" || true)"
  done
  check "MD-44 refused before any spawn: --v8-flags --eval=F / --eval / --print=F / --print / --print-bytecode (code run instead of the driver; a prefix match) -> exit 2, 0 spawns" \
    "$o" "#2|0|1#2|0|1#2|0|1#2|0|1#2|0|1"

  # --- MD-50 (lib/v8flags.sh): the runtime V8 allowlist, read from this node's --v8-options after --version ---
  o=""
  for x in --snapshot-blob=F --build-snapshot --openssl-config=F --experimental-print-required-tla --trace-osr --turbo-filter=x --noopt; do
    o="$o#$(spawn -- "$NO" --runs 2 --v8-flags "$x" --zero "$dr/z0/driver.js")|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -c -F -x -e "$(v8m "$x")" "$d/sp.out" || true)|$(tr '\n' ' ' <"$fk/log")"
  done
  x="$(spawn FAKE_V8O_RC=1 -- "$NO" --out "$d/ov8" "$dr/y3/driver.js" "$dr/y3b/driver.js" | cut -d'|' -f1,3)|$([[ -e "$d/ov8" ]] && echo exists || echo absent)|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -c -F -x -e "allocation-diff: cannot run $fk/node --v8-options" "$d/sp.out" || true)"
  check "MD-50 refused after the --v8-options read: --v8-flags --snapshot-blob=F / --build-snapshot / --openssl-config=F / --experimental-print-required-tla / --trace-osr / --turbo-filter=x / --noopt -> exit 2, 2 spawns (--version --v8-options), 0 mktemp, one die line; a failing --v8-options (with --out) -> exit 2 after 2 spawns, no OUT dir, no temp dir" \
    "$o#$x" "$(printf '#2|VERDICT NO-VERDICT|2|0|1|--version --v8-options %.0s' 1 2 3 4 5 6 7)#2|2|absent|0|1"
  x='--expose-gc --no-lazy-feedback-allocation --max-inlined-bytecode-size=30 --allow-natives-syntax'
  check "MD-50 accepted: --v8-flags '$x' --runs 2 --zero -> exit 0 ZERO, 4 spawns: --version, --v8-options, then 2 runs carrying the 4 flags first" \
    "$(spawn -- "$NO" --runs 2 --v8-flags "$x" --zero "$dr/z0/driver.js")|$(sed -n 1,2p "$fk/log" | tr '\n' ' ')|$(sed -n 3,4p "$fk/log" | awk -v p="$x --trace-gc --min-semi-space-size=1 " 'index($0, p) == 1 { n++ } END { print n + 0 }')|$(grep -c -F -e "$x" "$fk/log" || true)" \
    "0|VERDICT ZERO|4|--version --v8-options |2|2"
  # --- Q-ENV: the 4 env vars a node reads at start are unset at the top of this script (the fake exits 7 on any) ---
  check "Q-ENV e2e: NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS set in the environment reach no spawn (SAME, 8 spawns); the head names all four" \
    "$(spawn NODE_OPTIONS=--st-probe NODE_V8_COVERAGE="$d/cov" NODE_COMPILE_CACHE="$d/cc" NODE_REDIRECT_WARNINGS="$d/warn.txt" -- "$NO" --runs 3 "$dr/y3/driver.js" "$dr/y3b/driver.js")|$(has "allocation-diff  node v26.8.2  $fk/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)")" \
    "0|VERDICT SAME|8|1"

  # --- R6 (Q-B57-FLAG) / Q-RL-PRETEN: every spelling of a flag that undoes a pinned trace flag, refused before any spawn ---
  o=""
  for x in --stress-concurrent-inlining --stress_concurrent_inlining_attach_code --no-stress-concurrent-inlining; do
    o="$o#$(spawn -- "$NO" --v8-flags "$x" "$dr/y3/driver.js" "$dr/y5/driver.js")|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -c -F -x -e "allocation-diff: --v8-flags must not set $x: --stress-concurrent-inlining implies --concurrent-recompilation in V8, which overrides the script's --no-concurrent-recompilation (every spelling of the flag is refused)" "$d/sp.out" || true)"
  done
  check "R6 refused before any spawn: --v8-flags --stress-concurrent-inlining / --stress_concurrent_inlining_attach_code / --no-stress-concurrent-inlining -> exit 2, 0 spawns, 0 mktemp, the die line once" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|0|0|1%.0s' 1 2 3)"
  o=""
  for x in --allocation-site-pretenuring --allocation_site_pretenuring --no-allocation-site-pretenuring; do
    o="$o#$(spawn -- "$NO" --runs 2 --v8-flags "$x" --zero "$dr/z0/driver.js")|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -c -F -x -e "allocation-diff: --v8-flags must not set $x: the script pins --no-allocation-site-pretenuring (a pretenured literal site allocates straight into old space: no young GC, a wrong ZERO)" "$d/sp.out" || true)"
  done
  check "PRETEN refused before any spawn: --v8-flags --allocation-site-pretenuring / --allocation_site_pretenuring / --no-allocation-site-pretenuring -> exit 2, 0 spawns, 0 mktemp, the die line once" \
    "$o" "$(printf '#2|VERDICT NO-VERDICT|0|0|1%.0s' 1 2 3)"
  # R26: env reads an argument with an = as NAME=value; a wrapper at $d/a=b/node would exec the fake (its log counts)
  mkdir -p "$d/a=b"; printf '%s\n' "#!$BASH" "exec $(printf '%q' "$fk/node") \"\$@\"" >"$d/a=b/node"; chmod +x "$d/a=b/node"
  check "R26 refused before any spawn: --node <d>/a=b/node (an = in the resolved path) -> exit 2, 0 spawns, 0 mktemp, 'node binary: an = is not allowed in the resolved path'" \
    "$(spawn -- --node "$d/a=b/node" --runs 2 --zero "$dr/z0/driver.js")|$(wc -l <"$d/mk.log" | tr -d ' ')|$(grep -c -F -x -e "allocation-diff: node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): $d/a=b/node" "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|0|0|1"
  # R8 (Q-B57-C1): the young / old counts never come from `grep -c` (a grep that fails left them empty, read as 0: ZERO).
  # A grep shim first on PATH exits 2 on any -c argument, else runs the real grep
  mkdir -p "$d/sh/gc"
  { printf '#!%s\n' "$BASH"; printf 'for a in "$@"; do if [ "$a" = -c ]; then exit 2; fi; done\n'; printf 'exec %q "$@"\n' "$(command -v grep)"; } >"$d/sh/gc/grep"
  chmod +x "$d/sh/gc/grep"
  check "R8 e2e: a grep shim that fails every -c, first on PATH, --zero on 3 Scavenge -> exit 1 NONZERO, 'young 3 [Scavenge x3], old 0'" \
    "$(spawn PATH="$d/sh/gc:$mk:$PATH" -- "$NO" --runs 3 --zero "$dr/y3/driver.js")|$(has '  driver: run 1 young 3 [Scavenge x3], old 0 in the window; 4 GC line(s) before the fence, 1 after end; young per run 3,3,3')|$(has '  NONZERO -- 3 young GC(s) in the window (every run equal to run 1)')" \
    "1|VERDICT NONZERO|5|1|1"

  if [[ $fails -eq 0 && $oks -gt 0 ]]; then echo "self-test: $oks check(s) ok"; return 0; fi
  echo "self-test: $((fails > 0 ? fails : 1)) check(s) FAILED"; return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write, except a --v8-flags flag
# outside the allowlist: v8fl_check refuses it after the --version and --v8-options spawns, before any disk write)
# ---------------------------------------------------------------------------------------------
ZERO=0; RUNS=5; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; POS=(); GOTOPT=" "; REPORT=/dev/null; T=""
OPTS="--zero --runs --node --v8-flags --out --self-test --help"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
# @include lib/args.sh
while [[ $# -gt 0 ]]; do
  a="$1"; v=""; EQ=0
  case "$a" in --*=*) v="${a#*=}"; a="${a%%=*}"; EQ=1 ;; esac
  case "$a" in
    -h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; DIED=1; exit 2 ;;
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
  [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
  g="${f//_/-}"
  case "$g" in
    *trace-gc*|*concurrent-recompilation*)
      die "--v8-flags must not set $f: the script sets ${TRACE_FLAGS[*]} itself" ;;
    *stress-concurrent-inlining*)
      die "--v8-flags must not set $f: --stress-concurrent-inlining implies --concurrent-recompilation in V8, which overrides the script's --no-concurrent-recompilation (every spelling of the flag is refused)" ;;
    *semi-space*)
      die "--v8-flags must not set $f: the script fixes both semi-spaces at 1 MB (--min-semi-space-size=1 --max-semi-space-size=1)" ;;
    *allocation-site-pretenuring*)
      die "--v8-flags must not set $f: the script pins --no-allocation-site-pretenuring (a pretenured literal site allocates straight into old space: no young GC, a wrong ZERO)" ;;
    *predictable-gc-schedule*)
      die "--v8-flags must not set $f: it forces both semi-spaces to 4 MB (the script fixes them at 1 MB)" ;;
    --require*|--import*|--loader*|--experimental-loader*)
      die "--v8-flags must not set $f: it loads a module of yours into the measured process (a preload or a module loader; a --require one runs ahead of the guard's own --require <tmp>/gcn.cjs)" ;;
    --env-file*|--experimental-config-file*|--experimental-default-config-file*)
      die "--v8-flags must not set $f: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process" ;;
    --eval*|--print*)
      die "--v8-flags must not set $f: it runs code of yours in the measured process instead of the driver (node evaluates it; the driver becomes argv and never runs)" ;;
  esac
done
if [[ $ZERO == 1 ]]; then
  [[ ${#POS[@]} -eq 1 ]] || die "--zero takes exactly one DRIVER, got ${#POS[@]} (see --help)"
  SIDES=(driver)
else
  [[ ${#POS[@]} -eq 2 ]] || die "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]}; one DRIVER needs --zero (see --help)"
  SIDES=(before after)
fi
nl_refuse "DRIVER" ${POS[@]+"${POS[@]}"}   # the raw DRIVER values, before any refusal prints them (G-X6, ruling Q-B75-FFSCOPE)
for ((i = 0; i < ${#POS[@]}; i++)); do
  [[ -f "${POS[$i]}" && -r "${POS[$i]}" ]] || die "DRIVER (${SIDES[$i]}) not found (or not a readable file): ${POS[$i]}"
done
[[ "$OUT" != -* ]] || OUT="./$OUT"
[[ -z "$OUT" ]] || nl_refuse "--out" "$OUT"   # the raw --out value, before any refusal prints it (G-X6, ruling Q-B75-FFSCOPE)
if [[ -n "$OUT" ]]; then
  [[ ! -e "$OUT" || -d "$OUT" ]] || die "--out: $OUT exists and is not a directory"
  [[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die "--out: $OUT/raw exists and is not a directory"
  [[ ! -e "$OUT/raw" || ( -r "$OUT/raw" && -x "$OUT/raw" ) ]] || die "--out: $OUT/raw is not readable"
  [[ ! -L "$OUT/raw" ]] || die "--out: $OUT/raw is a symlink (refused: the writes would follow it)"
  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
  for ((i = 0; i < ${#POS[@]}; i++)); do   # -ef follows symlinks and sees hard links: refused before any truncation
    [[ ! "$OUT/report.txt" -ef "${POS[$i]}" ]] || die "--out: $OUT/report.txt is the DRIVER (${SIDES[$i]}) ${POS[$i]}"
  done
  [[ ! -L "$OUT/report.txt" ]] || die "--out: $OUT/report.txt is a symlink (refused: the write would follow it)"
  [[ ( -f "$OUT/report.txt" && -w "$OUT/report.txt" ) || ( ! -e "$OUT/report.txt" && ( ! -e "$OUT" || -w "$OUT" ) ) ]] || die "--out: cannot write $OUT/report.txt"
  [[ ! -e "$OUT/report.txt" ]] || { RL=$(find "$OUT/report.txt" -links +1 2>/dev/null) && [[ -z "$RL" ]]; } || die "--out: $OUT/report.txt has another hard link (refused: the write would change that file too)"
  OUT_UP="$OUT/raw/${SIDES[0]}"; while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw/${SIDES[0]}${SIDES[1]:+ and $OUT/raw/${SIDES[1]}} ($OUT_UP is not a writable directory)"
fi
NODE_RES=$NODE_BIN
if [[ "$NODE_BIN" != */* ]]; then NODE_RES=$(command -v -- "$NODE_BIN" 2>/dev/null) || die "node binary not found: $NODE_BIN"; fi
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH (a function, alias or builtin?): $NODE_BIN -> $NODE_RES"
[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
NODE_DIR=$(dirname -- "$NODE_RES"); [[ "$NODE_DIR" != - ]] || NODE_DIR=./-
NODE_DIR=$(cd -- "$NODE_DIR" 2>/dev/null && pwd) || die "node binary: cannot resolve the directory of $NODE_RES"
NODE_BIN="${NODE_DIR%/}/$(basename -- "$NODE_RES")"
[[ "$NODE_BIN" -ef "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
[[ "$NODE_BIN" != *$'\n'* ]] || die "node binary: a newline is not allowed in the resolved path"
[[ "$NODE_BIN" != *=* ]] || die "node binary: an = is not allowed in the resolved path (env would read it as a NAME=value operand, not as the program): $NODE_BIN"
DRV_DIR=(); DRV_BASE=(); DESC=()
for ((i = 0; i < ${#POS[@]}; i++)); do
  DRV_DIR[$i]=$(cd -- "$(dirname -- "${POS[$i]}")" && pwd); DRV_BASE[$i]=$(basename -- "${POS[$i]}")
  [[ "${DRV_DIR[$i]}/${DRV_BASE[$i]}" -ef "${POS[$i]}" ]] || die "DRIVER (${SIDES[$i]}): cannot resolve the directory of ${POS[$i]} (a symlink before '..'?)"
  DESC[$i]="${DRV_DIR[$i]%/}/${DRV_BASE[$i]}  sha256/8 $(sha8 "${DRV_DIR[$i]}/${DRV_BASE[$i]}")"
done
# G-X6 (ruling Q-B66-X6): every path the report prints, refused before the first spawn or write if it holds a newline or a
# CR (it would forge report lines): the cwd, --node, the drivers and the name --out resolves to (nl_refuse, nl_dir)
nl_refuse "the cwd" "$PWD"
nl_refuse "--node (resolved)" "$NODE_BIN"
nl_refuse "DRIVER (resolved)" "${DESC[@]}"
[[ -z "$OUT" ]] || nl_dir "--out (resolved)" "$OUT"

# --- every refusal that spawns nothing is above this line; spawns start here: --version, the --v8-options read
# (v8fl_check refuses here, before any disk write or run), then disk writes, then the runs ---
GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"
v8fl_check "$NODE_BIN"
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
  for s in "${SIDES[@]}"; do mkdir -p -- "$OUT/raw/$s" 2>/dev/null || die "--out: cannot create $OUT/raw/$s"; done
  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L
  nl_refuse "--out (resolved)" "$OUT"   # backstop (G-X6): a name the pre-spawn replay could not foresee
  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check
fi
say "allocation-diff  node $GOT_VER  $NODE_BIN  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
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
run_side() { # dir base rawfile errfile cntfile: one node run of ./base in dir; sets RUN_RC (the driver exit, or
  # "<tee|tr|awk|append> <rc>"), RUN_TX, RUN_CNT (the guard count, "" when the count file is missing, empty or malformed)
  local tx st n t r a sz c nrc=0 ar=0
  # stdout is a regular file, never a pipe (Q-B70-ADPIPE): $T/run.out (T is under its EXIT trap; no mktemp per run). The
  # run is a background job the main shell waits for (drv_wait, lib/prologue.sh), so a SIGINT / SIGTERM / SIGHUP kills
  # it at once (exec: $! is node itself); `<&0` keeps the caller's stdin (a job without job control would get /dev/null).
  # stderr goes to its own file; fd 3 (the guard count file, truncated per run) is opened for node only, never for tee /
  # tr / awk. run_side runs in the main shell (set -e live): every step that can fail carries its own guard
  ( cd "$1" && exec env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" \
    --require "$T/gcn.cjs" "./$2" 2>"$4" 3>"$5" ) >"$T/run.out" <&0 &
  drv_wait; nrc=$DRV_RC
  # the file is read through tee, tr and awk; the exits (node, tee, tr, awk) ride on a last "@ n t r a" line, so a tee /
  # tr / awk failure is never reported as the driver's exit. tr turns each NUL into `?` before awk (BSD awk cuts a line
  # at a NUL, which would hide a GC line glued after it); GC_AWK then reads the glue as X. $( ) holds GC_AWK's records
  # only, never trace text. || true: set -e never cuts the parse short (its exits ride on the "@" line)
  tx=$(<"$T/run.out" tee "${3:-/dev/null}" | tr '\000' '?' | awk "$GC_AWK"; printf '@ %s %s\n' "$nrc" "${PIPESTATUS[*]}") || true
  # the file has been read (tee has already run, so raw/ never sees this): 64 KiB more fails if TMPDIR is still full now.
  # The brace silences a redirect-open failure too; an inline 2>/dev/null comes after the >> and would not. rm, not a
  # truncate: the next run's redirect makes a new file, so a run whose redirect fails reads no earlier run's output
  { printf '%65536s' '' >>"$T/run.out"; } 2>/dev/null || ar=$?
  rm -f -- "$T/run.out" || true
  st=${tx##*$'\n'}
  if [[ "$tx" == *$'\n'* ]]; then tx=${tx%$'\n'*}; else tx=""; fi
  [[ "$st" =~ $ST_RE ]] || die "cannot read the exit status of the run of $1/$2 (got '$st')"
  n=${BASH_REMATCH[1]}; t=${BASH_REMATCH[2]}; r=${BASH_REMATCH[3]}; a=${BASH_REMATCH[4]}
  if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else RUN_RC=$n; fi
  # a full TMPDIR is named after a tee / tr / awk failure and before the driver exit (awk > tr > tee > append > driver)
  if [[ $ar != 0 && $RUN_RC != *' '* ]]; then RUN_RC="append $ar"; fi
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
