#!/usr/bin/env bash
# deopt-diff.sh -- the DEOPTIMIZATIONS of NAMED functions, DRIVER_BEFORE vs DRIVER_AFTER, on one node binary:
# per fn, the multiset of its deopt records (code tier, kind, reason) compared across the two drivers.
# Ref / file mode: ONE module file per side (two git refs, or a frozen copy and the live file), each staged beside a
# copy of ONE driver.
#
#   deopt-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     driver mode: two drivers, one verdict
#   deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before-ref REF --after-ref REF --module REL   ref mode
#   deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before FILE --after FILE                     file mode
#   deopt-diff.sh --self-test                                       canned checks, no real node
#   deopt-diff.sh -h | --help                                       this text
#
#   e.g. deopt-diff.sh --fn add,get\ value --v8-flags --allow-natives-syntax before/driver.js after/driver.js
#
# Options
#   --fn LIST          function names, comma separated (required)
#   --runs N           node runs per side, 2..20 (default 3). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node)
#   --v8-flags STR     extra V8 flags for every run, split on spaces (flags only, each starting with --). Refused,
#                      with `_` read as `-`: any *trace-deopt*, *trace-opt* or *concurrent-recompilation* flag (the
#                      script sets them) and any *trace-file-names* flag (it changes the <JSFunction NAME (sfi = ...)>
#                      text the records are read from)
#   --out DIR          keep DIR/report.txt and DIR/raw/before/run.<k>.txt, DIR/raw/after/run.<k>.txt (the raw
#                      output of run k, addresses kept). DIR/raw must be absent or empty. Without --out nothing
#                      is written to disk.
#                      Ref / file mode (required): also DIR/stage, absent or an empty directory (see Ref / file mode).
#   --before-ref REF   ref mode: the before side is --module as committed at REF (a commit-ish, resolved to its full
#                      sha; never starting with -). Goes with --after-ref.
#   --after-ref REF    ref mode: the after side, the same way. Both refs are required.
#   --module REL       ref mode (required): the module's path from the repo root (e.g. src/Thing.js): relative, no
#                      empty, . or .. segment; at each ref it must be a blob (`git cat-file -t`).
#   --before FILE      file mode: the before module, a FROZEN copy (see Frozen "before" below). Goes with --after;
#                      never with --before-ref / --after-ref, never with --module.
#   --after FILE       file mode: the after module (the live working-tree file may be given); NAME = its file name.
#   --driver FILE      ref / file mode (required): ONE driver that imports the module as './NAME' or "./NAME" (NAME =
#                      the file name of --module, or of --after); its own file name must differ from NAME.
#   --repo DIR         the git repo. Ref mode: the refs and --module are read there (default: the repo around the
#                      current directory). File mode: one more <top> for the Frozen "before" check below.
#   --self-test        canned checks (trace text through the record awk, judge and diff_fn, then this script end to
#                      end with a fake node that counts spawns, then the ref / file modes on a temp git repo): one
#                      "ok <label>" or "FAIL <label>: <got>" line per check, then "self-test: <C> check(s) ok" (exit 0)
#                      or "self-test: <n> check(s) FAILED" (exit 1)
#   -h, --help         this text (exit 2)
#   Each value option is given at most once and never empty; --fn / --v8-flags / --out take no newline and --fn
#   no empty entry (stray comma). --self-test takes no other argument. --self-test / --help take no =value.
#   A ref pair and a file pair are exclusive; --driver / --module / --repo go only with a ref / file pair; the seven
#   ref / file values take no newline.
#
# DRIVER (driver mode): exactly two existing readable files (ref / file mode: no DRIVER path; each side runs its
#   staged copy of --driver), each run as
#   `node [v8 flags] --trace-deopt-verbose --trace-opt --no-concurrent-recompilation DRIVER`
#   with cwd = its directory, NODE_OPTIONS stripped, stderr merged into stdout, piped through tee (to the --out raw
#   file, else /dev/null), tr (every NUL byte becomes `?`; the raw file keeps the NUL) and awk (keeps the trace
#   lines). One run per side per k serves every fn; runs alternate before / after for k = 1..N.
# fn: a short V8 name, ^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$ (e.g. add, get value). Never
#   qualified (Store.add). A repeated fn is refused. Matching is EXACT on the name between `<JSFunction ` and
#   ` (sfi = `: add never matches addX, ad or Store.add, get never matches get value; node internals of other
#   names are never counted.
# Records (E / D only from trace lines that start with `[`; addresses, sfi, opt id, bytecode offset, deopt exit,
#   deltas, pc, timings and paths are never part of a record):
#   E <fn>@<tier>[-OSR]              one per `[completed compiling ... <JSFunction fn ...> (target T)[ OSR] - took`
#   D <fn>@<tier><TAB><kind> (<reason>)   one per `[bailout (kind: K, reason: R): begin. deoptimizing ...
#                                    <JSFunction fn ...>, ... <Code T>, ...]`, K ~ ^deopt-[a-z]+$, T ~ ^[A-Z_]+$,
#                                    R non-empty, no tab, cut at the first `): begin. deoptimizing `
#   X <why>                          a line naming fn that cannot be read: a `[bailout` or `[completed compiling `
#                                    line that does not parse (e.g. "bailout: empty reason or a tab"); a line
#                                    starting `[completed compiling` with no space after it ("completed compiling:
#                                    no space after the prefix"); `[bailout` / `[completed compiling` text after
#                                    other output on the same line ("trace text not at line start"; a NUL byte
#                                    counts as other output: `abc<NUL>[bailout` and `<NUL>[bailout` are X too)
# Report lines (after "before  <abs path>  sha256/8 <x>" and "after   <abs path>  sha256/8 <x>"; ref / file mode: the
#   head in Ref / file mode below; run 1):
#   "  <fn>: before <e> optimized compile(s) [<unit> x<n>, ..], <d> deopt(s)" (the same for after; no [..] when e
#   is 0; not printed for a side whose run 1 did not finish cleanly)
#   "  <fn>: SAME -- identical deopt multiset (before <d> | after <d>)"
#   "  <fn>: DIFF -- deopt multiset differs (before <d> | after <d>)", then per record whose count differs:
#     "    before=<n> after=<m>  [<fn>@<tier>] <kind> (<reason>)"
#   "  <fn>: NO-VERDICT -- <before|after>: <reason>" (one line per side that has a reason below)
# NO-VERDICT reasons (per side, first that applies; the first two are checked run by run, k = 1..N):
#   cannot read driver output in run <k> (<tee|tr|awk> exited <rc>)
#                                    (in one run the first failure in the order awk > tr > tee > driver exit is named:
#                                    a failed awk before a failed tr, a failed tr before a failed tee, a failed tee
#                                    before the driver exit)
#   driver exited <rc> in run <k>
#   unparseable trace line naming '<fn>' in run <k>: <why>      (<why> = the first X record)
#   null control: run <k> differs from run 1 (<n> record(s) differ, first: run 1 x<a> | run <k> x<b>  [<unit>] <line>)
#                                    (E and D records of runs 2..N each compared with run 1)
#   no optimized compile of '<fn>' in run 1 (no E and no D record: never optimized, inlined only, or no such name)
# NO-VERDICT over every fn (ref / file mode; one line after the fn lines):
#   "  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise"
#                                    (the NOTE case below with a DIFF verdict: both sides are the same program, so
#                                    the DIFF becomes NO-VERDICT, exit 2; SAME and NO-VERDICT stay as they are)
# Verdict, over every fn (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT. If both sides pass, the run-1
#   D multisets are compared. Every refused argument exits 2 before any node is spawned and before anything is
#   written to disk. Spawns: one `node --version` (a failing one exits 2 before anything is written), then
#   2 x runs driver runs.
# Ref / file mode: --out DIR is required; DIR/stage must be absent or an empty directory (a DIR/stage that is not a
#   directory exits 2 "--out: DIR/stage exists and is not a directory"). After the --version spawn, DIR/stage/before
#   and DIR/stage/after each get that side's module as NAME (ref mode: `git cat-file blob <sha>:REL`, plumbing, no
#   textconv; file mode: a cp, so an edit after staging cannot leak in) plus a copy of --driver, and each side's
#   driver runs there (cwd = DIR/stage/<side>). One module file per side: a module with relative imports of its own
#   fails closed (its driver exits non-zero: NO-VERDICT). Head: "before  <REF> @ <sha 12>  <REL>  sha256/8 <x>" (ref)
#   or "before  <abs FILE>  sha256/8 <x>" (file), x = the staged copy's, the same for after, then
#   "driver  <abs --driver>  sha256/8 <x>", and when the two staged modules are byte-identical
#   "NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)".
#   The mode line says "diff (ref)" or "diff (file)". Spawns, lines and verdict as in driver mode, plus the
#   byte-identical NO-VERDICT above; DIR holds report.txt, raw/ and stage/ (2 x runs + 5 files). Every ref / file
#   refusal exits 2 before any spawn and before anything is written to DIR.
# Frozen "before" (file mode): --before must be a FROZEN copy. It is refused with NO-VERDICT when it, or the end of
#   its symlink chain, is git-tracked, or when it is the same file (device:inode) as a tracked <top>/Signal.js or
#   <top>/<same name>, <top> = the repo around the current directory, around --after, around --before and its link
#   target, and --repo; or when it is the same file as --after (-ef: a hard link or symlink, anywhere). Ref and file
#   modes need git (file mode for this check). Both refuse a set GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE,
#   GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES (each can make a tracked --before read as
#   untracked): each repo is found from its path. Ref mode is frozen by construction (both sides from git objects).
# Not detected: a deopt of an inlined function counts only for the JSFunction named on the bailout line (its
#   caller); a dependency invalidation of code that is not on the stack (`[marking dependent code ...]`, no
#   bailout line) is not a deopt record; a driver that itself prints trace-like text (`[bailout` /
#   `[completed compiling `) at line start is read as V8 trace output.
# Not detected (ref / file mode): a driver that reaches the live module by another path (an absolute path, or a
#   package self-reference) instead of './NAME'; a hard link of --before to a tracked file that is not --after,
#   <top>/Signal.js or <top>/<same name>; and a git error while checking (e.g. safe.directory "dubious ownership")
#   reads as untracked, so a tracked --before behind such an error is not refused. Known gaps, as in
#   bytecode-budget: a TRACKED SYMLINK --module is a blob (mode 120000), so ref mode stages its target TEXT as the
#   module (the driver then fails: NO-VERDICT, never a verdict on the link target); refs/replace swaps the staged
#   blob (a `git replace` of a ref's blob stages the replacement, and the head's sha256/8 is the replacement's); a
#   path value starting with '-' (e.g. --before -b.js) is read as an option by dirname / basename / stat and exits 2
#   only through the EXIT trap ("unexpected error (exit 1)", 0 spawns, nothing written). The stage checks
#   (lib/stage.sh): an unreadable (mode 000) DIR/stage passes the emptiness test, even when it is not empty, so the
#   run spends its --version spawn and writes DIR/raw/before, DIR/raw/after and an empty DIR/report.txt before it
#   dies "--out: cannot create DIR/stage/before and DIR/stage/after"; a DIR/stage that is a symlink to an empty
#   directory gets the staged copies written through it, outside DIR (as a DIR/raw symlink already gets the raw
#   files in driver mode).
# Tier: on a user driver the verdict is STATISTICAL (deopts follow tier-up timing; run it under the host quiet
#   lock); --self-test is DETERMINISTIC (canned text and a fake node).
# Tier (ref / file mode): STATISTICAL on the same terms (each staged side is a user driver; its null control stays),
#   while the staging, the refusals and the byte-identical NO-VERDICT are DETERMINISTIC, gated in npm test by the
#   --self-test ref / file rows (a temp git repo and a fake node; with no git on PATH they are one FAIL line and
#   --self-test exits 1).
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
# a line naming fn that is not a line-start `[completed compiling ` / `[bailout` line: X when it carries such text
substr($0, 1, 21) != "[completed compiling " && substr($0, 1, 8) != "[bailout" {
  if (!names($0)) next
  if (substr($0, 1, 20) == "[completed compiling") x("completed compiling: no space after the prefix")
  else if (index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0) x("trace text not at line start")
  next
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
  if (r == "" || index(r, "\t") > 0) { x("bailout: empty reason or a tab"); next }
  if (!match(s, /^0x[0-9a-fA-F]+ <JSFunction /) || !head(substr(s, RLENGTH + 1))) { x("bailout: malformed function"); next }
  if (NM != fn) { x("bailout: function name"); next }
  if (!match(REST, /^, 0x[0-9a-fA-F]+ <Code /)) { x("bailout: no code object"); next }
  s = substr(REST, RLENGTH + 1); p = index(s, ">"); t = substr(s, 1, p - 1)
  if (p == 0 || t !~ /^[A-Z_]+$/) { x("bailout: code tier"); next }
  if (substr(s, p, 3) != ">, " || s !~ /\]$/) { x("bailout: after code tier"); next }
  print "D " fn "@" t "\t" k " (" r ")"; next
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
'

# @include lib/common.sh

# @include lib/stage.sh

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
TRACE_FLAGS=(--trace-deopt-verbose --trace-opt --no-concurrent-recompilation)
# run_side keeps a line that starts with `[` or carries trace text anywhere (DEOPT_AWK turns the latter into X)
# shellcheck disable=SC2016
KEEP_AWK='/^\[/ || index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0'
ST_RE='^@ ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+)$'

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

# judge FN: one side. JRC[k-1] = the driver exit of run k (or "<tee|tr|awk> <rc>" when that tool failed), JREC[k-1] =
# FN's DEOPT_AWK records of run k. Sets JV (OK NO-VERDICT) and JWHY (the reason). Order: driver output / exit run by
# run, X record, null control (E+D), guard.
judge() {
  local fn="$1" n i x first nk dl
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
# --self-test: canned p3-probe rows through DEOPT_AWK, judge and diff_fn, then this script with a fake node
# ---------------------------------------------------------------------------------------------
self_test() {
  local d old got x rc fails=0 oks=0 REPORT=/dev/null VERDICT FV JV JWHY
  local T_DEOPT T_MONO DUMP E9 D10 P ED GE GD OSRC OSR LZM LZ
  local -a RCB RCA TXB TXA JRC JREC
  d=$(mktemp -d) || { echo "FAIL self-test: mktemp -d"; echo; echo "self-test: 1 check(s) FAILED"; return 1; }
  # the temp dir goes on every exit path: this trap runs the script's own EXIT trap after it (with $? restored; set +e
  # so restoring a non-zero $? cannot cut the trap short), and the script's trap is put back below
  ST_D=$d
  eval "set -- $(trap -p EXIT)"; old=${3:-}
  # shellcheck disable=SC2064
  trap "st_rc=\$?; rm -rf \"\$ST_D\"; set +e; (exit \$st_rc); $old" EXIT
  check() { if [[ "$2" == "$3" ]]; then oks=$((oks + 1)); echo "ok $1"; else fails=$((fails + 1)); echo "FAIL $1: $2"; echo "  want: $3"; fi; }
  # FN TEXT -> records (";" per line, "|" = TAB); a failing DEOPT_AWK adds "!awk exited <rc>" (no row expects it)
  rec() { printf '%s\n' "$2" | { awk -v fn="$1" "$DEOPT_AWK" || echo "!awk exited $?"; } | tr '\t\n' '|;'; }

  # --- canned node v26.8.2 trace text (p3-probe drv-deopt.js; the ;;; path is shortened, nothing else changed) ---
  IFS= read -r -d '' T_DEOPT <<'EOF' || true
[marking 0x2e180a004711 <JSFunction isPosixPathSeparator (sfi = 0x3bb48931d759)> for optimization to MAGLEV, ConcurrencyMode::kConcurrent, reason: hot and stable]
[compiling method 0x2e180a004711 <JSFunction isPosixPathSeparator (sfi = 0x3bb48931d759)> (target MAGLEV), mode: ConcurrencyMode::kSynchronous]
[completed compiling 0x2e180a004711 <JSFunction isPosixPathSeparator (sfi = 0x3bb48931d759)> (target MAGLEV) - took 0.002, 0.080, 0.001 ms]
[marking 0x2e180a004839 <JSFunction normalizeString (sfi = 0x3bb48931d981)> for optimization to MAGLEV, ConcurrencyMode::kConcurrent, reason: hot and stable]
[compiling method 0x2e180a004839 <JSFunction normalizeString (sfi = 0x3bb48931d981)> (target MAGLEV), mode: ConcurrencyMode::kSynchronous]
[completed compiling 0x2e180a004839 <JSFunction normalizeString (sfi = 0x3bb48931d981)> (target MAGLEV) - took 0.000, 0.223, 0.000 ms]
[manually marking 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> for optimization to TURBOFAN_JS, ConcurrencyMode::kSynchronous]
[compiling method 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS), mode: ConcurrencyMode::kSynchronous]
[completed compiling 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> (target TURBOFAN_JS) - took 0.009, 0.245, 0.003 ms]
[bailout (kind: deopt-eager, reason: not a Smi): begin. deoptimizing 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>, 0x140083075c49 <Code TURBOFAN_JS>, opt id 2, bytecode offset 2, deopt exit 0, FP to SP delta 32, caller SP 0x00016eeed198, pc 0x00011f6425b4]
            ;;; deoptimize at <file:///work/p3-probe/drv-deopt.js:1:31>
  reading input frame add => bytecode_offset=2, args=3, height=0, retval=0(#0); inputs:
      0: 0x060e65bf5b89 ;  [fp -  16]  0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)>
      1: 0x119675c00011 ;  [fp +  16]  0x119675c00011 <undefined>
      2: 0x119675c05811 ; x2 0x119675c05811 <String[1]: #x>
      3: 0x119675c05829 ;  [fp +  32]  0x119675c05829 <String[1]: #y>
      4: 0x0f7e008dd431 ;  [fp -  32]  0x0f7e008dd431 <ModuleContext[3]>
      5: 0x119675c05829 ;  [fp +  32]  0x119675c05829 <String[1]: #y>
  translating interpreted frame add => bytecode_offset=2, variable_frame_size=16, frame_size=104
    0x00016eeed190: [top +  96] <- 0x119675c05829 <String[1]: #y> ;  stack parameter (input #3)
    0x00016eeed188: [top +  88] <- 0x119675c05811 <String[1]: #x> ;  stack parameter (input #2)
    0x00016eeed180: [top +  80] <- 0x119675c00011 <undefined> ;  stack parameter (input #1)
    -------------------------
    0x00016eeed178: [top +  72] <- 0x0001049dd424 ;  bottommost caller's pc
    0x00016eeed170: [top +  64] <- 0x00016eeed200 ;  caller's fp
    0x00016eeed168: [top +  56] <- 0x0f7e008dd431 <ModuleContext[3]> ;  context (input #4)
    0x00016eeed160: [top +  48] <- 0x060e65bf5b89 <JSFunction add (sfi = 0xf7e008dc999)> ;  function (input #0)
    0x00016eeed158: [top +  40] <- 0x000000000003 ;  actual argument count
    0x00016eeed150: [top +  32] <- 0x140083075a01 <BytecodeArray[6]> ;  bytecode array
    0x00016eeed148: [top +  24] <- 0x004100000000 <Smi 65> ;  bytecode offset
    0x00016eeed140: [top +  16] <- 0x1e9f85eefff9 <arguments_marker> ;  feedback vector    -------------------------
    0x00016eeed138: [top +   8] <- 0x119675c0fff9 <the_hole_value> ;  padding
    0x00016eeed130: [top +   0] <- 0x119675c05829 <String[1]: #y> ;  accumulator (input #5)
[bailout end. code_invalidation: invalidated, took 0.353 ms]
EOF
  T_DEOPT=${T_DEOPT%$'\n'}
  E9=$(printf '%s\n' "$T_DEOPT" | sed -n 9p); D10=$(printf '%s\n' "$T_DEOPT" | sed -n 10p)
  T_MONO=$(printf '%s\n' "$T_DEOPT" | sed -n 1,9p); DUMP=$(printf '%s\n' "$T_DEOPT" | sed -n 11,33p); ED="$E9"$'\n'"$D10"
  GE='[completed compiling 0x1d9b12236109 <JSFunction get value (sfi = 0x120d8965ca39)> (target TURBOFAN_JS) - took 0.009, 0.330, 0.004 ms]'
  GD='[bailout (kind: deopt-eager, reason: out of bounds): begin. deoptimizing 0x1d9b12236109 <JSFunction get value (sfi = 0x120d8965ca39)>, 0x129b68535e01 <Code TURBOFAN_JS>, opt id 2, bytecode offset 0, deopt exit 3, FP to SP delta 32, caller SP 0x00016d1ad0b8, pc 0x000117b02608]'
  OSRC='[compiling method 0x173a526b5be1 <JSFunction loopFn (sfi = 0x3a0106c9c9b1)> (target MAGLEV) OSR, mode: ConcurrencyMode::kSynchronous]'
  OSR='[completed compiling 0x173a526b5be1 <JSFunction loopFn (sfi = 0x3a0106c9c9b1)> (target MAGLEV) OSR - took 0.000, 0.066, 0.000 ms]'
  LZM='[marking dependent code 0x08cb37b35d41 <Code TURBOFAN_JS> (0x3e849055ca99 <SharedFunctionInfo lazyFn>) (opt id 2) for deoptimization, reason: dependent prototype chain changed]'
  LZ='[bailout (kind: deopt-lazy, reason: (unknown)): begin. deoptimizing 0x3da5dec35cf1 <JSFunction lazyFn (sfi = 0x3e849055ca99)>, 0x08cb37b35d41 <Code TURBOFAN_JS>, opt id 2, bytecode offset 13, deopt exit 1, FP to SP delta 32, caller SP 0x00016b3b9210, pc 0x000119b825f0]'

  # --- DEOPT_AWK: records ---
  check "records: trace-deopt fn=add -> exactly 'E add@TURBOFAN_JS' and 'D add@TURBOFAN_JS<TAB>deopt-eager (not a Smi)'" \
    "$(rec add "$T_DEOPT")" "E add@TURBOFAN_JS;D add@TURBOFAN_JS|deopt-eager (not a Smi);"
  P=$(printf '%s\n' "$T_DEOPT" | sed -e 's/0x/0x9a/g' -e 's/opt id 2/opt id 7/' -e 's/bytecode offset 2,/bytecode offset 14,/' \
    -e 's/deopt exit 0/deopt exit 5/' -e 's/delta 32/delta 48/' -e 's/took [^m]* ms/took 9.1, 9.2, 9.3 ms/' \
    -e 's|file:///work/p3-probe/drv-deopt.js:1:31|file:///elsewhere/drv.js:9:9|')
  check "records: a copy with every 0x, opt id, offset 2->14, deopt exit, delta, took and path changed (6 lines) -> byte-identical records" \
    "$(printf '%s\n' "$P" | grep -c -e 'opt id 7, bytecode offset 14, deopt exit 5, FP to SP delta 48, caller SP 0x9a' -e 'took 9.1, 9.2, 9.3 ms' -e 'elsewhere/drv.js:9:9' || true)|$(rec add "$P")" \
    "6|E add@TURBOFAN_JS;D add@TURBOFAN_JS|deopt-eager (not a Smi);"
  JRC=(0 0); JREC=("$(printf '%s\n' "$DUMP" | awk -v fn=add "$DEOPT_AWK")" "")
  judge add
  check "records: the frame dump (lines 11-33, naming <JSFunction add twice) alone -> 0 records -> guard NO-VERDICT" \
    "$(printf '%s\n' "$DUMP" | grep -c '<JSFunction add ' || true)|$(rec add "$DUMP")|$JV|$JWHY" \
    "2||NO-VERDICT|no optimized compile of 'add' in run 1 (no E and no D record: never optimized, inlined only, or no such name)"
  check "records: exact names -- fn=ad and fn=addX on trace-deopt -> 0 records each" "$(rec ad "$T_DEOPT")#$(rec addX "$T_DEOPT")" "#"
  check "records: exact names -- fn=add on an addX trace, fn=get / fn=value on a 'get value' trace -> 0 records each" \
    "$(rec add "${E9//JSFunction add /JSFunction addX }"$'\n'"${D10//JSFunction add /JSFunction addX }")#$(rec get "$GE"$'\n'"$GD")#$(rec value "$GE"$'\n'"$GD")" "##"
  check "records: fn='get value' (a name with a space) -> its E and D" \
    "$(rec 'get value' "$GE"$'\n'"$GD")" "E get value@TURBOFAN_JS;D get value@TURBOFAN_JS|deopt-eager (out of bounds);"
  check "records: an OSR compile -> 'E loopFn@MAGLEV-OSR' (the compiling-method line gives none)" "$(rec loopFn "$OSRC"$'\n'"$OSR")" "E loopFn@MAGLEV-OSR;"
  check "records: a lazy deopt keeps a reason with parens; a marking-dependent-code line gives none" \
    "$(rec lazyFn "$LZM"$'\n'"$LZ")" "D lazyFn@TURBOFAN_JS|deopt-lazy ((unknown));"
  check "records: trace text glued after driver output, naming fn -> X 'trace text not at line start' (not naming fn -> none)" \
    "$(rec add "....$D10"$'\n'"[progress]$E9")#$(rec add "....${D10//JSFunction add /JSFunction addX }")" \
    "X trace text not at line start;X trace text not at line start;#"
  check "records: a bailout with an empty reason or a tab in it -> X 'bailout: empty reason or a tab'" \
    "$(rec add "${D10/not a Smi/}"$'\n'"${D10/not a Smi/not$'\t'a Smi}")" "X bailout: empty reason or a tab;X bailout: empty reason or a tab;"
  check "records: a line starting '[completed compilingX' (no space) naming fn -> X 'completed compiling: no space after the prefix'" \
    "$(rec add "[completed compilingX${E9#'[completed compiling'}")" "X completed compiling: no space after the prefix;"
  check "records: an unparseable bailout naming fn (kind deopt-Eager) -> X naming the kind" \
    "$(rec add "${D10/deopt-eager/deopt-Eager}")" "X bailout: kind 'deopt-Eager';"

  # --- judge: one side, from JRC (driver exits) and JREC (records per run) ---
  local R_ED R_E R_X R_E2 R_D2
  R_ED=$(rec add "$ED" | tr '|;' '\t\n'); R_E=$(rec add "$E9" | tr '|;' '\t\n'); R_X=$(rec add "${D10/deopt-eager/deopt-Eager}" | tr '|;' '\t\n')
  R_E2=$(rec add "$ED"$'\n'"${E9/TURBOFAN_JS)/MAGLEV)}" | tr '|;' '\t\n'); R_D2=$(rec add "$E9"$'\n'"${D10/not a Smi/wrong map}" | tr '|;' '\t\n')
  JRC=(0 0 0); JREC=("$R_ED" "$R_ED" "$R_ED"); judge add
  check "judge: 3 identical runs with E + D -> OK" "$JV|$JWHY" "OK|"
  JRC=(0 3 0); judge add
  check "judge: driver exit 3 in run 2 -> NO-VERDICT 'driver exited 3 in run 2'" "$JV|$JWHY" "NO-VERDICT|driver exited 3 in run 2"
  JRC=(0 "tee 141" 3); judge add
  check "judge: a tee failure in run 2 -> 'cannot read driver output in run 2 (tee exited 141)', named before a driver exit" \
    "$JV|$JWHY" "NO-VERDICT|cannot read driver output in run 2 (tee exited 141)"
  JRC=(0 0 0); JREC=("$R_ED" "$R_ED" "$R_X"$'\n'"$R_ED"); judge add
  check "judge: an X record in run 3 -> 'unparseable trace line naming 'add' in run 3: <why>'" \
    "$JV|$JWHY" "NO-VERDICT|unparseable trace line naming 'add' in run 3: bailout: kind 'deopt-Eager'"
  JREC=("$R_ED" "$R_ED" "$R_D2"); judge add
  check "judge: run 3 with DIFFERENT D records than run 1 -> null control naming run 3" "$JV|$JWHY" \
    "NO-VERDICT|null control: run 3 differs from run 1 (2 record(s) differ, first: run 1 x1 | run 3 x0  [add@TURBOFAN_JS] deopt-eager (not a Smi))"
  JRC=(0 0); JREC=("$R_ED" "$R_E2"); judge add
  check "judge: run 2 with one more E record (tier-up noise) -> null control (E and D are compared)" "$JV|$JWHY" \
    "NO-VERDICT|null control: run 2 differs from run 1 (1 record(s) differ, first: run 1 x0 | run 2 x1  [add@MAGLEV] compiled)"
  JREC=("" ""); judge add
  check "judge: no E and no D in run 1 -> the guard" "$JV|$JWHY" \
    "NO-VERDICT|no optimized compile of 'add' in run 1 (no E and no D record: never optimized, inlined only, or no such name)"

  # --- diff_fn: both sides from RCB / RCA and TXB / TXA (the trace lines of run k), verdict folded into VERDICT ---
  djhas() { grep -c -F -x -e "$1" "$d/dj.out" || true; }
  RCB=(0 0 0); RCA=(0 0 0)
  TXB=("$T_DEOPT" "$T_DEOPT" "$T_DEOPT"); TXA=("$T_DEOPT"$'\n'"$D10" "$T_DEOPT"$'\n'"$D10" "$T_DEOPT"$'\n'"$D10")
  VERDICT=SAME; diff_fn add >"$d/dj.out"
  check "diff_fn: 1 deopt vs 2 identical deopts -> DIFF, 'before=1 after=2  [add@TURBOFAN_JS] deopt-eager (not a Smi)'" \
    "$FV|$VERDICT|$(djhas '  add: DIFF -- deopt multiset differs (before 1 | after 2)')|$(djhas '    before=1 after=2  [add@TURBOFAN_JS] deopt-eager (not a Smi)')|$(djhas '  add: before 1 optimized compile(s) [add@TURBOFAN_JS x1], 1 deopt(s)')" \
    "DIFF|DIFF|1|1|1"
  TXB=("$T_MONO" "$T_MONO" "$T_MONO"); TXA=("$T_DEOPT" "$T_DEOPT" "$T_DEOPT")
  VERDICT=SAME; diff_fn add >"$d/dj.out"
  check "diff_fn: mono vs deopt -> DIFF, 'before=0 after=1'" \
    "$FV|$VERDICT|$(djhas '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" "DIFF|DIFF|1"
  TXA=("$T_MONO" "$T_MONO" "$T_MONO")
  VERDICT=SAME; diff_fn add >"$d/dj.out"
  check "diff_fn: mono vs mono -> SAME (empty deopt multisets past the guard)" \
    "$FV|$VERDICT|$(djhas '  add: SAME -- identical deopt multiset (before 0 | after 0)')" "SAME|SAME|1"
  TXB=("$T_DEOPT" "$T_DEOPT" "$T_DEOPT"); TXA=("$T_DEOPT" "$T_MONO" "$T_DEOPT")
  VERDICT=SAME; diff_fn add >"$d/dj.out"
  check "diff_fn: after run 2 lost the deopt -> NO-VERDICT naming after (no before line)" \
    "$FV|$VERDICT|$(djhas '  add: NO-VERDICT -- after: null control: run 2 differs from run 1 (1 record(s) differ, first: run 1 x1 | run 2 x0  [add@TURBOFAN_JS] deopt-eager (not a Smi))')|$(grep -c -e ' -- before: ' "$d/dj.out" || true)" \
    "NO-VERDICT|NO-VERDICT|1|0"
  TXB=("$T_DEOPT" "$T_DEOPT" "$T_MONO"); TXA=("$T_DEOPT" "$T_DEOPT" "$T_DEOPT")
  VERDICT=SAME; diff_fn add >"$d/dj.out"
  check "diff_fn: before run 3 lost the deopt -> NO-VERDICT naming before (no after line)" \
    "$FV|$VERDICT|$(grep -c -e '^  add: NO-VERDICT -- before: null control: run 3 differs from run 1 ' "$d/dj.out" || true)|$(grep -c -e ' -- after: ' "$d/dj.out" || true)" \
    "NO-VERDICT|NO-VERDICT|1|0"
  # judge stubbed OK (in a subshell): runs 2 differ from runs 1, so only a verdict read from run 1 says SAME 1 | 1
  RCB=(0 0); RCA=(0 0); TXB=("$ED" "$E9"); TXA=("$ED" "$ED"$'\n'"$D10")
  ( judge() { JV=OK; JWHY=""; }
    VERDICT=SAME; diff_fn add >"$d/dj.out"; printf '%s|%s' "$FV" "$VERDICT" >"$d/s2" )
  check "diff_fn: the verdict multisets are read from run 1 (judge stubbed OK; run 2 has 0 | 2 deopts)" \
    "$(cat "$d/s2" 2>/dev/null)|$(djhas '  add: SAME -- identical deopt multiset (before 1 | after 1)')" "SAME|SAME|1"
  check "worst: NO-VERDICT > DIFF > SAME, both argument orders" \
    "$(worst NO-VERDICT DIFF) $(worst DIFF NO-VERDICT) $(worst DIFF SAME) $(worst SAME DIFF) $(worst SAME NO-VERDICT) $(worst SAME SAME)" \
    "NO-VERDICT NO-VERDICT DIFF DIFF NO-VERDICT SAME"
  RCB=(0 0); RCA=(0 0); TXB=("$T_MONO" "$T_MONO"); TXA=("$T_DEOPT" "$T_DEOPT"); got=""
  for x in nosuch add - add nosuch - add isPosixPathSeparator - isPosixPathSeparator add; do
    if [[ $x == - ]]; then VERDICT=SAME; got="$got |"; else diff_fn "$x" >"$d/dj.out"; got="$got $FV>$VERDICT"; fi
  done
  check "diff_fn: fns fold with worst() (NO-VERDICT then DIFF, DIFF then NO-VERDICT, DIFF then SAME, SAME then DIFF)" "$got" \
    " NO-VERDICT>NO-VERDICT DIFF>NO-VERDICT | DIFF>DIFF NO-VERDICT>NO-VERDICT | DIFF>DIFF SAME>DIFF | SAME>SAME DIFF>DIFF"

  # --- this script end to end: a fake node (bash) logs argv, prints a version, cats ./trace.<n>.txt or ./trace.txt
  # from cwd (n = its run count in that driver dir), in a cwd ending in /after also cats $FAKE_AFTER_EXTRA (when set),
  # exits with ./rc or 0, and exits 7 if NODE_OPTIONS reached it ---
  local fk="$d/fk" D1 D2 out
  mkdir -p "$fk" "$d/cwd" "$d/tmp"
  printf '%s\n' "#!$BASH" 'd=$(dirname "$0")' 'printf "%s\n" "$*" >>"$d/log"' \
    'if [ -n "${NODE_OPTIONS+x}" ]; then echo "NODE_OPTIONS leaked"; exit 7; fi' \
    'case "$1" in --version) if [ -n "${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; echo v26.8.2; exit 0 ;; esac' \
    'c="$d/$(basename "$PWD").n"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$c"' \
    'if [ -f "./trace.$n.txt" ]; then cat "./trace.$n.txt"; elif [ -f ./trace.txt ]; then cat ./trace.txt; fi' \
    'case "$PWD" in */after) if [ -n "${FAKE_AFTER_EXTRA:-}" ]; then cat "$FAKE_AFTER_EXTRA"; fi ;; esac' \
    'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi' 'exit 0' >"$fk/node"
  chmod +x "$fk/node"
  # shim dirs put first on PATH: DIR/tee fails (exit 1) on the files under OUT/raw/ only (say() keeps the real tee);
  # DIR/tr fails (exit 6) on run_side's `tr '\000' '?'` only; DIR/awk fails (exit 5) on run_side's keep filter only
  mktee() { # DIR OUT
    mkdir -p "$1"
    printf '%s\n' "#!$BASH" "for a; do case \"\$a\" in $(printf '%q' "$2/raw/")*) cat >/dev/null; exit 1 ;; esac; done" \
      "exec $(command -v tee) \"\$@\"" >"$1/tee"
    chmod +x "$1/tee"
  }
  mktr() { printf '%s\n' "#!$BASH" 'case "$1" in "\\000") cat >/dev/null; exit 6 ;; esac' "exec $(command -v tr) \"\$@\"" >"$1/tr"; chmod +x "$1/tr"; }
  mkawk() { printf '%s\n' "#!$BASH" 'case "$1" in "/^\\["*) cat >/dev/null; exit 5 ;; esac' "exec $(command -v awk) \"\$@\"" >"$1/awk"; chmod +x "$1/awk"; }
  mktee "$d/shim" "$d/ot"                         # tee fails
  mktee "$d/shim2" "$d/oa"; mktr "$d/shim2"; mkawk "$d/shim2"   # tee, tr and awk fail
  mktee "$d/shim3" "$d/or"; mktr "$d/shim3"       # tee and tr fail
  mkd() { mkdir -p "$d/$1"; : >"$d/$1/driver.js"; printf '%s\n' "$2" >"$d/$1/trace.txt"; }
  mkd deop "$T_DEOPT"; mkd deop2 "$T_DEOPT"; mkd mono "$T_MONO"; mkd twice "$T_DEOPT"$'\n'"$D10"
  mkd nc "$T_DEOPT"; printf '%s\n' "$T_MONO" >"$d/nc/trace.2.txt"
  mkd rc3 "$T_DEOPT"; echo 3 >"$d/rc3/rc"
  mkd xb "$T_MONO"$'\n'"${D10/deopt-eager/deopt-Eager}"
  mkd glue "$T_MONO"$'\n'"....$D10"
  mkd nul "$T_MONO"; printf 'abc\000%s\n' "$D10" >>"$d/nul/trace.txt"     # driver text, a NUL, then a bailout: one line
  mkd nul0 "$T_MONO"; printf '\000%s\n' "$D10" >>"$d/nul0/trace.txt"      # a NUL, then a bailout: one line
  mkd gluee "....[completed compilingX${E9#'[completed compiling'}"$'\n'"$D10"
  D1="$d/mono/driver.js"; D2="$d/deop/driver.js"
  spawn() { # ENV|- args... -> "rc|VERDICT line(s)|node spawns"; output in $d/sp.out. Host NODE_OPTIONS / editor env
    local -a e=()  # never reach the child (rows that need one set it)
    [[ "$1" == - ]] || e=("$1")
    shift
    rm -f "$fk"/*.n; : >"$fk/log"
    (cd "$d/cwd" && env -u NODE_OPTIONS -u GIT_EDITOR -u EDITOR -u VISUAL ${e[@]+"${e[@]}"} TMPDIR="$d/tmp" \
      "$BASH" "$SELF" --node "$fk/node" "$@") >"$d/sp.out" 2>&1 && rc=0 || rc=$?
    printf '%s|%s|%s' "$rc" "$(awk '/^VERDICT /{ printf "%s%s", (n++ ? "," : ""), $0 }' "$d/sp.out")" "$(wc -l <"$fk/log" | tr -d ' ')"
  }
  has() { grep -c -F -x -e "$1" "$d/sp.out" || true; }
  check "e2e: 1 deopt vs 2 identical deopts (R=3) -> exit 1 DIFF, exactly 7 spawns, the before=1 after=2 line" \
    "$(spawn - --fn add "$D2" "$d/twice/driver.js")|$(has '    before=1 after=2  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" "1|VERDICT DIFF|7|1"
  check "e2e: mono vs deopt -> exit 1 DIFF (before=0 after=1)" \
    "$(spawn - --fn add "$D1" "$D2")|$(has '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" "1|VERDICT DIFF|7|1"
  check "e2e: mono vs mono -> exit 0 SAME; without --out nothing is written (cwd and TMPDIR stay empty)" \
    "$(spawn - --fn add "$D1" "$D1")|$(has '  add: SAME -- identical deopt multiset (before 0 | after 0)')|$(find "$d/cwd" "$d/tmp" -mindepth 1 | wc -l | tr -d ' ')" \
    "0|VERDICT SAME|7|1|0"
  check "e2e: NODE_OPTIONS set in the environment never reaches node (mono vs mono still SAME)" \
    "$(spawn NODE_OPTIONS=--st-probe --fn add "$D1" "$D1")" "0|VERDICT SAME|7"
  check "e2e: guard -> exit 2, each side says 'no optimized compile of 'nosuch' in run 1'" \
    "$(spawn - --fn nosuch "$D2" "$d/deop2/driver.js")|$(grep -c -E -e "^  nosuch: NO-VERDICT -- (before|after): no optimized compile of 'nosuch' in run 1 \\(" "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|7|2"
  check "e2e: null control -> exit 2 naming after: 'null control: run 2 differs from run 1'" \
    "$(spawn - --fn add "$D2" "$d/nc/driver.js")|$(grep -c -e '^  add: NO-VERDICT -- after: null control: run 2 differs from run 1 (' "$d/sp.out" || true)|$(grep -c -e ' -- before: ' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|7|1|0"
  check "e2e: driver exit 3 (before) -> exit 2 'before: driver exited 3 in run 1'" \
    "$(spawn - --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: driver exited 3 in run 1')" "2|VERDICT NO-VERDICT|7|1"
  check "e2e: an unparseable bailout naming fn (after) -> exit 2 'unparseable trace line naming 'add' in run 1: ...'" \
    "$(spawn - --fn add "$D2" "$d/xb/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: bailout: kind 'deopt-Eager'")" \
    "2|VERDICT NO-VERDICT|7|1"
  check "e2e: a bailout glued after driver output on one line (after) -> exit 2 'trace text not at line start', never DIFF" \
    "$(spawn - --fn add "$D2" "$d/glue/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")" \
    "2|VERDICT NO-VERDICT|7|1"
  check "e2e --out: driver text, a NUL, then a bailout on one line (after) -> exit 2 'trace text not at line start', never SAME; the raw file keeps the NUL" \
    "$(spawn - --out "$d/on" --fn add "$D1" "$d/nul/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")|$(tr -d -c '\000' <"$d/on/raw/after/run.1.txt" | wc -c | tr -d ' ')" \
    "2|VERDICT NO-VERDICT|7|1|1"
  check "e2e: a NUL, then a bailout at the start of a line (after) -> exit 2 'trace text not at line start', never SAME" \
    "$(spawn - --fn add "$D1" "$d/nul0/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")" \
    "2|VERDICT NO-VERDICT|7|1"
  check "e2e: '[completed compilingX' glued after driver output, then a bailout (after) -> exit 2 'trace text not at line start', never SAME" \
    "$(spawn - --fn add "$D2" "$d/gluee/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")" \
    "2|VERDICT NO-VERDICT|7|1"
  check "e2e --out: exit 1 DIFF; report.txt holds the verdict; raw/before + raw/after hold 3 + 3 files, addresses kept" \
    "$(spawn - --out "$d/o" --fn add "$D1" "$D2")|$(grep -c '^VERDICT DIFF$' "$d/o/report.txt" 2>/dev/null || true)|$(find "$d/o/raw/before" -type f | wc -l | tr -d ' ')+$(find "$d/o/raw/after" -type f | wc -l | tr -d ' ')|$(grep -c -F -x -e "$D10" "$d/o/raw/after/run.2.txt" 2>/dev/null || true)" \
    "1|VERDICT DIFF|7|1|3+3|1"
  check "e2e --out: a tee failure on a driver exiting 3 -> exit 2 'cannot read driver output in run 1 (tee exited 1)', not 'driver exited'" \
    "$(spawn "PATH=$d/shim:$PATH" --out "$d/ot" --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: cannot read driver output in run 1 (tee exited 1)')|$(grep -c -e 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|7|1|0"
  check "e2e --out: an awk + tr + tee failure on a driver exiting 3 -> 'cannot read driver output in run 1 (awk exited 5)'" \
    "$(spawn "PATH=$d/shim2:$PATH" --out "$d/oa" --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: cannot read driver output in run 1 (awk exited 5)')|$(grep -c -e 'tr exited' -e 'tee exited' -e 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|7|1|0"
  check "e2e --out: a tr + tee failure on a driver exiting 3 -> 'cannot read driver output in run 1 (tr exited 6)'" \
    "$(spawn "PATH=$d/shim3:$PATH" --out "$d/or" --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: cannot read driver output in run 1 (tr exited 6)')|$(grep -c -e 'tee exited' -e 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|7|1|0"
  check "e2e --out: a failing node --version -> exit 2 after 1 spawn, nothing written (no OUT dir)" \
    "$(spawn FAKE_VER_RC=1 --out "$d/ov" --fn add "$D1" "$D2")|$(grep -c -e '^deopt-diff: cannot run .*/node --version$' "$d/sp.out" || true)|$([[ -e "$d/ov" ]] && echo exists || echo absent)" \
    "2|VERDICT NO-VERDICT|1|1|absent"
  rf() { # LABEL FRAGMENT args...: refused with exit 2, 0 spawns, a die line holding FRAGMENT
    local l="$1" f="$2"; shift 2
    check "refused before any spawn: $l -> exit 2, 0 spawns, '$f'" \
      "$(spawn - "$@")|$(grep -F -e "$f" "$d/sp.out" | grep -c '^deopt-diff: ' || true)" "2|VERDICT NO-VERDICT|0|1"
  }
  rf "repeated fn" "fn 'add' is given twice" --fn add,add "$D1" "$D2"
  rf "qualified name" "fn must be a short V8 function name (e.g. add, get value; never Store.add), got 'Store.add'" --fn Store.add "$D1" "$D2"
  rf "--runs 1" "--runs must be an integer in [2, 20] (null control), got '1'" --runs 1 --fn add "$D1" "$D2"
  rf "--runs 21" "--runs must be an integer in [2, 20] (null control), got '21'" --runs 21 --fn add "$D1" "$D2"
  rf "one DRIVER" "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got 1" --fn add "$D1"
  rf "a trace-deopt flag in --v8-flags" "--v8-flags must not set --trace_deopt: the script sets" --fn add --v8-flags=--trace_deopt "$D1" "$D2"
  rf "a non-flag in --v8-flags" "--v8-flags takes flags only (each starts with --), got 'x.js'" --fn add --v8-flags=x.js "$D1" "$D2"
  rf "unknown option" "unknown option --nod (did you mean --node?)" --fn add --nod x "$D1" "$D2"
  rf "a trace-file-names flag in --v8-flags" "--v8-flags must not set --trace_file_names: it changes the <JSFunction NAME" \
    --fn add --v8-flags=--trace_file_names "$D1" "$D2"

  # --- ref / file modes end to end (lib/stage.sh): a temp git repo $d/st/R (m/trace.txt: r1 = T_MONO, r2 = T_DEOPT; a
  # driver.js importing './trace.txt'); the fake node cats ./trace.txt from cwd = OUT/stage/<side>. tg isolates every
  # git call (no editor, no global / system config, no hooks, no signing, the six GIT_* vars stage_check refuses
  # unset) and sspawn runs this script with those six unset too, so the rows also run from inside a git hook. With no
  # git on PATH, or a failed repo set-up, the 18 rows (S1-S4, R1-R14) are ONE FAIL line ---
  local g="$d/st" R="$d/st/R" frz="$d/st/frz/trace.txt" top="" sr=0
  local -a RR
  tg() { env -u GIT_EDITOR -u EDITOR -u VISUAL -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY \
    -u GIT_COMMON_DIR -u GIT_CEILING_DIRECTORIES GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 \
    git -c core.hooksPath=/dev/null -c core.editor=false -c commit.gpgSign=false -c tag.gpgSign=false \
    -c user.name=self-test -c user.email=self-test@example.invalid "$@"; }
  sspawn() { ( unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR GIT_CEILING_DIRECTORIES
    export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1; spawn "$@" ); }
  if command -v git >/dev/null 2>&1; then
    mkdir -p "$R/m" "$g/frz" "$g/hl" "$g/sd" "$g/shim4"
    printf '%s\n' "import './trace.txt';" >"$R/driver.js"; printf '%s\n' '// imports nothing' >"$g/sd/noimp.js"
    printf '%s\n' "$T_MONO" >"$R/m/trace.txt"; cp "$R/m/trace.txt" "$frz"; printf '%s\n' "$D10" >"$g/extra.txt"
    { tg init -q "$R" && tg -C "$R" add driver.js m/trace.txt && tg -C "$R" commit -q -m r1 && tg -C "$R" tag r1 \
      && printf '%s\n' "$T_DEOPT" >"$R/m/trace.txt" && tg -C "$R" commit -q -a -m r2 && tg -C "$R" tag r2 \
      && ln "$R/m/trace.txt" "$g/hl/trace.txt" && top=$(tg -C "$R" rev-parse --show-toplevel); } >"$g/git.log" 2>&1 || sr=$?
  fi
  if ! command -v git >/dev/null 2>&1; then
    check "ref / file modes: git on PATH (the 18 staged rows S1-S4, R1-R14 need git; no git fails closed)" "git not found on PATH" "git found"
  elif [[ $sr != 0 ]]; then
    check "ref / file modes: temp git repo set up (init, commits r1 r2, tags r1 r2)" "git exited $sr: $(tail -n 1 "$g/git.log")" "ok"
  else
    RR=(--module m/trace.txt --driver "$R/driver.js" --repo "$R")
    check "S1 ref mode (temp git repo): --before-ref r1 --after-ref r2 -> exit 1 DIFF, 7 spawns, the before=0 after=1 line, 'mode    diff (ref)  runs 3', no NOTE" \
      "$(sspawn - --out "$g/s1" --fn add --before-ref r1 --after-ref r2 "${RR[@]}")|$(has '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)')|$(has 'mode    diff (ref)  runs 3  v8 flags --trace-deopt-verbose --trace-opt --no-concurrent-recompilation')|$(grep -c -e '^NOTE ' "$d/sp.out" || true)" \
      "1|VERDICT DIFF|7|1|1|0"
    check "S2 ref mode: --before-ref r1 --after-ref r1 (byte-identical modules) -> exit 0 SAME plus the exact null-control NOTE" \
      "$(sspawn - --out "$g/s2" --fn add --before-ref r1 --after-ref r1 "${RR[@]}")|$(has 'NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)')" \
      "0|VERDICT SAME|7|1"
    # a tee shim rewrites the live --after to the r1 text while before run 2 (driver run 3) runs: after runs 2 and 3
    # still read the staged r2 copy, so a stage that aliased the live file would fail the after null control
    printf '%s\n' "#!$BASH" "for a; do case \"\$a\" in */raw/before/run.2.txt) cp $(printf '%q' "$frz") $(printf '%q' "$R/m/trace.txt") || exit 9 ;; esac; done" \
      "exec $(command -v tee) \"\$@\"" >"$g/shim4/tee"
    chmod +x "$g/shim4/tee"
    check "S3 file mode: --before a FROZEN r1 copy, --after the live tracked r2 file (rewritten to r1 at driver run 3) -> exit 1 DIFF; OUT holds exactly 11 files" \
      "$(sspawn "PATH=$g/shim4:$PATH" --out "$g/s3" --fn add --before "$frz" --after "$R/m/trace.txt" --driver "$R/driver.js")|$(find "$g/s3" -type f | wc -l | tr -d ' ')|$(cmp -s "$frz" "$R/m/trace.txt" && echo rewritten || echo kept)" \
      "1|VERDICT DIFF|7|11|rewritten"
    printf '%s\n' "$T_DEOPT" >"$R/m/trace.txt"
    check "S4 ref mode (MD-16): --before-ref r1 --after-ref r1 plus an after-only deopt -> exit 2, the DIFF line, then the byte-identical NO-VERDICT line" \
      "$(sspawn "FAKE_AFTER_EXTRA=$g/extra.txt" --out "$g/s4" --fn add --before-ref r1 --after-ref r1 "${RR[@]}")|$(has '  add: DIFF -- deopt multiset differs (before 0 | after 1)')|$(has '  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise')" \
      "2|VERDICT NO-VERDICT|7|1|1"
    srf() { # LABEL DIE-TEXT OUT|- ENV|- args...: exit 2, 0 spawns, 'deopt-diff: DIE-TEXT' once and no other die line;
      # OUT not created (an OUT that exists before the run is left as it was); '-' (no --out): cwd stays empty
      local l="$1" f="$2" o="$3" pre="" s w t; shift 3
      if [[ $o == - ]]; then t="nothing written"; w="cwd 0"
      elif [[ -e $o ]]; then t="OUT left as it was"; w="OUT unchanged"; pre=$(find "$o" | sort; find "$o" -type f -exec cksum {} + | sort)
      else t="no OUT"; w="no OUT"; fi
      s=$(sspawn "$@")
      s="$s|$(has "deopt-diff: $f")|$(grep -c -e '^deopt-diff: ' "$d/sp.out" || true)"
      if [[ $o == - ]]; then s="$s|cwd $(ls -A "$d/cwd" | wc -l | tr -d ' ')"
      elif [[ -n $pre ]]; then s="$s|OUT $([[ "$(find "$o" | sort; find "$o" -type f -exec cksum {} + | sort)" == "$pre" ]] && echo unchanged || echo changed)"
      elif [[ -e $o ]]; then s="$s|OUT created"; else s="$s|no OUT"; fi
      check "staged refusal $l -> exit 2, 0 spawns, its own die line once, $t" "$s" "2|VERDICT NO-VERDICT|0|1|1|$w"
    }
    srf "R1: --before-ref alone" "--before-ref and --after-ref go together" "$g/r1" - --out "$g/r1" --fn add --before-ref r1 "${RR[@]}"
    srf "R2: --before alone" "--before and --after go together" "$g/r2" - --out "$g/r2" --fn add --before "$frz" --driver "$R/driver.js"
    srf "R3: a ref pair and a file pair together" \
      "--before-ref/--after-ref (ref mode) and --before/--after (file mode) are exclusive: give one pair" \
      "$g/r3" - --out "$g/r3" --fn add --before-ref r1 --after-ref r2 "${RR[@]}" --before "$frz" --after "$R/m/trace.txt"
    srf "R4: a positional DRIVER in ref mode" "ref mode takes no DRIVER paths (give --driver FILE), got 1" \
      "$g/r4" - --out "$g/r4" --fn add --before-ref r1 --after-ref r2 "${RR[@]}" "$R/driver.js"
    srf "R5: ref mode without --out" "ref mode needs --out DIR (the staged copies are written to DIR/stage)" \
      - - --fn add --before-ref r1 --after-ref r2 "${RR[@]}"
    srf "R6: --driver in driver mode" "--driver / --module / --repo go only with --before-ref/--after-ref or --before/--after" \
      "$g/r6" - --out "$g/r6" --fn add --driver "$R/driver.js" "$D1" "$D2"
    srf "R7: a driver without the './trace.txt' import" "--driver must import './trace.txt' (the staged module beside it): $g/sd/noimp.js" \
      "$g/r7" - --out "$g/r7" --fn add --before-ref r1 --after-ref r2 --module m/trace.txt --driver "$g/sd/noimp.js" --repo "$R"
    srf "R8: a bad ref" "--before-ref: 'nosuch' is not a commit in $top (git fetch?)" \
      "$g/r8" - --out "$g/r8" --fn add --before-ref nosuch --after-ref r2 "${RR[@]}"
    srf "R9: a '..' --module" "--module must not have an empty, '.' or '..' segment, got 'm/../m/trace.txt'" \
      "$g/r9" - --out "$g/r9" --fn add --before-ref r1 --after-ref r2 --module m/../m/trace.txt --driver "$R/driver.js" --repo "$R"
    srf "R10: a git-tracked --before" \
      "--before is a git-tracked working-tree file ($R/m/trace.txt): use a FROZEN copy (untracked) or --before-ref" \
      "$g/r10" - --out "$g/r10" --fn add --before "$R/m/trace.txt" --after "$frz" --driver "$R/driver.js"
    srf "R11: --before a hard link of --after" \
      "--before and --after are the same file (hard link / symlink): --before must be a FROZEN copy" \
      "$g/r11" - --out "$g/r11" --fn add --before "$g/hl/trace.txt" --after "$R/m/trace.txt" --driver "$R/driver.js"
    srf "R12: GIT_DIR set" \
      "GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES is set: unset it (ref mode finds each repo from its path)" \
      "$g/r12" "GIT_DIR=$g/no-such.git" --out "$g/r12" --fn add --before-ref r1 --after-ref r2 "${RR[@]}"
    mkdir -p "$g/r13/stage/x"
    srf "R13: a non-empty OUT/stage" "--out: $g/r13/stage is not empty (give a new or empty DIR)" \
      "$g/r13" - --out "$g/r13" --fn add --before-ref r1 --after-ref r2 "${RR[@]}"
    mkdir -p "$g/r14"; printf 'x\n' >"$g/r14/stage"
    srf "R14: OUT/stage a regular file" "--out: $g/r14/stage exists and is not a directory" \
      "$g/r14" - --out "$g/r14" --fn add --before-ref r1 --after-ref r2 "${RR[@]}"
  fi

  rm -rf "$d"
  if [[ -n "$old" ]]; then trap -- "$old" EXIT; else trap - EXIT; fi
  echo
  if [[ $fails -eq 0 && $oks -gt 0 ]]; then echo "self-test: $oks check(s) ok"; return 0; fi
  echo "self-test: $((fails > 0 ? fails : 1)) check(s) FAILED"; return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write)
# ---------------------------------------------------------------------------------------------
FNLIST=""; RUNS=3; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; POS=(); GOTOPT=" "; REPORT=/dev/null
BEFORE_REF=""; AFTER_REF=""; BEFORE_FILE=""; AFTER_FILE=""; MODULE=""; DRIVER=""; REPO=""; STAGED=0; STAGE_SAME=0
OPTS="--fn --runs --node --v8-flags --out --self-test --help --before-ref --after-ref --before --after --module --driver --repo"
hint() { local o; for o in $OPTS; do if [[ "$o" == "$1"* || "$1" == "$o"* ]]; then printf ' (did you mean %s?)' "$o"; return 0; fi; done; }
# @include lib/args.sh
while [[ $# -gt 0 ]]; do
  a="$1"; v=""; EQ=0
  case "$a" in --*=*) v="${a#*=}"; a="${a%%=*}"; EQ=1 ;; esac
  case "$a" in
    -h|--help) [[ $EQ -eq 0 ]] || die "$a takes no value"; usage; exit 2 ;;
    --self-test) [[ $EQ -eq 0 ]] || die "$a takes no value"; SELFTEST=1 ;;
    --fn|--runs|--node|--v8-flags|--out|--before-ref|--after-ref|--before|--after|--module|--driver|--repo)
      [[ "$GOTOPT" != *" $a "* ]] || die "$a given twice (give one comma list)"
      GOTOPT="$GOTOPT $a "
      if [[ $EQ -eq 0 ]] && ! need "$@"; then shift; fi
      [[ -n "$v" ]] || die "$a needs a non-empty value"
      case "$a" in
        --fn) FNLIST="$v" ;; --runs) RUNS="$v" ;; --node) NODE_BIN="$v" ;; --v8-flags) V8FLAGS="$v" ;; --out) OUT="$v" ;;
        --before-ref) BEFORE_REF="$v" ;; --after-ref) AFTER_REF="$v" ;; --before) BEFORE_FILE="$v" ;; --after) AFTER_FILE="$v" ;;
        --module) MODULE="$v" ;; --driver) DRIVER="$v" ;; --repo) REPO="$v" ;;
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
if [[ -n "$BEFORE_REF$AFTER_REF$BEFORE_FILE$AFTER_FILE" ]]; then STAGED=1; fi
[[ $STAGED == 1 || -z "$DRIVER$MODULE$REPO" ]] || die "--driver / --module / --repo go only with --before-ref/--after-ref or --before/--after"
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
    *trace-file-names*)
      die "--v8-flags must not set $f: it changes the <JSFunction NAME (sfi = ...)> text the records are read from" ;;
  esac
done
if [[ $STAGED == 1 ]]; then
  [[ -z $OUT || ( ! -e $OUT/stage && ! -L $OUT/stage ) || -d $OUT/stage ]] || die "--out: $OUT/stage exists and is not a directory"
  stage_check   # lib/stage.sh: every ref / file refusal, before any disk write (--out is required)
else
  [[ ${#POS[@]} -eq 2 ]] || die "need exactly two DRIVER files (DRIVER_BEFORE DRIVER_AFTER), got ${#POS[@]} (see --help)"
  [[ "${POS[0]}${POS[1]}" != *$'\n'* ]] || die "DRIVER: a newline is not allowed in a path"
  [[ -f "${POS[0]}" && -r "${POS[0]}" ]] || die "DRIVER (before) not found (or not a readable file): ${POS[0]}"
  [[ -f "${POS[1]}" && -r "${POS[1]}" ]] || die "DRIVER (after) not found (or not a readable file): ${POS[1]}"
fi
if [[ -n "$OUT" ]]; then
  [[ ! -e "$OUT" || -d "$OUT" ]] || die "--out: $OUT exists and is not a directory"
  [[ ! -e "$OUT/raw" || -d "$OUT/raw" ]] || die "--out: $OUT/raw exists and is not a directory"
  [[ -z "$(ls -A "$OUT/raw" 2>/dev/null)" ]] || die "--out: $OUT/raw is not empty (give a new or empty DIR)"
fi
command -v "$NODE_BIN" >/dev/null 2>&1 || die "node binary not found: $NODE_BIN"
if [[ "$NODE_BIN" == */* ]]; then NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"; fi
if [[ $STAGED == 0 ]]; then
  DRV_B_DIR=$(cd "$(dirname "${POS[0]}")" && pwd); DRV_B_BASE=$(basename "${POS[0]}")
  DRV_A_DIR=$(cd "$(dirname "${POS[1]}")" && pwd); DRV_A_BASE=$(basename "${POS[1]}")
  DESC_B="$DRV_B_DIR/$DRV_B_BASE  sha256/8 $(sha8 "$DRV_B_DIR/$DRV_B_BASE")"
  DESC_A="$DRV_A_DIR/$DRV_A_BASE  sha256/8 $(sha8 "$DRV_A_DIR/$DRV_A_BASE")"
fi

# --- every refusal is above this line; spawns start here: --version, then disk writes (--out only), then the runs ---
GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"
if [[ -n "$OUT" ]]; then
  mkdir -p "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"
  OUT=$(cd "$OUT" && pwd)
  REPORT="$OUT/report.txt"; : >"$REPORT"
fi
MODE=diff
if [[ $STAGED == 1 ]]; then
  stage_write   # lib/stage.sh: OUT/stage/before and OUT/stage/after, each the module + the driver
  DRV_B_DIR=$(dirname "$DRV_B"); DRV_B_BASE=$(basename "$DRV_B")
  DRV_A_DIR=$(dirname "$DRV_A"); DRV_A_BASE=$(basename "$DRV_A")
  MODE="diff ($STAGE_MODE)"
fi
say "deopt-diff  node $GOT_VER  $NODE_BIN  (NODE_OPTIONS stripped)"
say "before  $DESC_B"
say "after   $DESC_A"
if [[ $STAGED == 1 ]]; then
  say "driver  $DESC_D"
  if [[ $STAGE_SAME == 1 ]]; then say "NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)"; fi
fi
say "mode    $MODE  runs $RUNS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi
say ""

# ---------------------------------------------------------------------------------------------
# runs: k = 1..R, before then after; each keeps its driver exit and its `[` lines (raw output to --out only)
# ---------------------------------------------------------------------------------------------
RUN_RC=0; RUN_TX=""
run_side() { # dir base rawfile: one node run of dir/base; sets RUN_RC (the driver exit, or "<tee|tr|awk> <rc>") RUN_TX
  local tx st n t r a
  # the pipeline's four exits (node, tee, tr, awk) ride on a last "@ n t r a" line, so a tee / tr / awk failure is
  # never reported as the driver's exit. tr turns each NUL into `?` before awk (BSD awk cuts a line at a NUL, which
  # would drop a `[bailout` glued after it); DEOPT_AWK then reads the glue as X "trace text not at line start"
  tx=$( (cd "$1" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "$2" 2>&1) \
    | tee "${3:-/dev/null}" | tr '\000' '?' | awk "$KEEP_AWK"; printf '@ %s\n' "${PIPESTATUS[*]}")
  st=${tx##*$'\n'}
  if [[ "$tx" == *$'\n'* ]]; then tx=${tx%$'\n'*}; else tx=""; fi
  [[ "$st" =~ $ST_RE ]] || die "cannot read the exit status of the run of $1/$2 (got '$st')"
  n=${BASH_REMATCH[1]}; t=${BASH_REMATCH[2]}; r=${BASH_REMATCH[3]}; a=${BASH_REMATCH[4]}
  if [[ $a != 0 ]]; then RUN_RC="awk $a"; elif [[ $r != 0 ]]; then RUN_RC="tr $r"; elif [[ $t != 0 ]]; then RUN_RC="tee $t"; else RUN_RC=$n; fi
  RUN_TX="$tx"
}
RCB=(); RCA=(); TXB=(); TXA=()
for k in $(seq 1 "$RUNS"); do
  run_side "$DRV_B_DIR" "$DRV_B_BASE" "${OUT:+$OUT/raw/before/run.$k.txt}"; RCB+=("$RUN_RC"); TXB+=("$RUN_TX")
  run_side "$DRV_A_DIR" "$DRV_A_BASE" "${OUT:+$OUT/raw/after/run.$k.txt}"; RCA+=("$RUN_RC"); TXA+=("$RUN_TX")
done

VERDICT=SAME
for fn in "${TARGETS[@]}"; do diff_fn "$fn"; done
if [[ $STAGED == 1 && $STAGE_SAME == 1 && $VERDICT == DIFF ]]; then   # MD-16: both sides are the same program
  say "  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise"
  VERDICT=NO-VERDICT
fi
say ""
say "VERDICT $VERDICT"
FINAL=1; case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
