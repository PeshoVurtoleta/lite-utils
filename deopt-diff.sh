#!/usr/bin/env bash
# deopt-diff.sh -- the DEOPTIMIZATIONS of NAMED functions, DRIVER_BEFORE vs DRIVER_AFTER, on one node binary:
# per fn, the multiset of its deopt records (code tier, kind, reason) compared across the two drivers.
# Ref / file mode: ONE module file per side (two git refs, or a frozen copy and the live file), each staged beside a
# copy of ONE driver.
#
#   deopt-diff.sh [opts] --fn LIST DRIVER_BEFORE DRIVER_AFTER     driver mode: two drivers, one verdict
#   deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before-ref REF --after-ref REF --module REL   ref mode
#   deopt-diff.sh [opts] --fn LIST --out DIR --driver FILE --before FILE --after FILE                     file mode
#   deopt-diff.sh --self-test [--fixtures DIR]                      canned checks, no real node
#   deopt-diff.sh -h | --help                                       this text
#
#   e.g. deopt-diff.sh --fn add,get\ value --v8-flags --allow-natives-syntax before/driver.js after/driver.js
#
# Options
#   --fn LIST          function names, comma separated (required)
#   --runs N           node runs per side, 2..20 (default 3). Run 1 vs runs 2..N is the null control.
#   --node BIN         node binary (default: $NODE, else node), resolved ONCE to an absolute path from the caller's
#                      cwd (a bare name through PATH). It must be an executable file, else exit 2 before any node
#                      spawn ("node binary not found", "node binary is not a file on PATH (...)", "node binary is
#                      not an executable file", "node binary: cannot resolve the directory of ...", "node binary: a
#                      newline is not allowed in the resolved path").
#   --v8-flags STR     extra V8 flags for every run, split on spaces (flags only, each `--` and a letter). Refused,
#                      with `_` read as `-`: any *trace-deopt*, *trace-opt* or *concurrent-recompilation* flag (the
#                      script sets them), any *trace-file-names* flag (it changes the <JSFunction NAME (sfi = ...)>
#                      text the records are read from), every --require* / --import* / --loader* /
#                      --experimental-loader* flag, a prefix match (a module of yours, preload or loader, is part of
#                      the measured process), every --env-file* / --experimental-config-file* /
#                      --experimental-default-config-file* flag, a prefix match (it loads environment variables or
#                      node options from a file into the measured process), and every --eval* / --print* flag, a
#                      prefix match (--eval / --print: node runs that code in the measured process instead of the
#                      driver, which becomes argv; V8's --print-* flags, e.g. --print-bytecode, print V8 internals
#                      into the measured run). -r / -e / -p are refused as non-flags. Accepted: V8 flags this node
#                      lists in --v8-options -- bool as --flag or --no-flag (never --noflag), numeric as --flag=N --
#                      except log / trace / print / prof / perf / dump / snapshot / file flags. Refused, exit 2 at
#                      the latest after one --v8-options read and before any measured run: every node option (--run,
#                      --test, --watch, --check, --inspect, --cpu-prof, --snapshot-blob, ...), every string-valued V8
#                      flag, and the tool's own flags above.
#   --out DIR          keep DIR/report.txt and DIR/raw/before/run.<k>.txt, DIR/raw/after/run.<k>.txt (the raw
#                      output of run k, addresses kept). DIR/raw must be absent or an empty, readable and writable
#                      directory that is not a symlink; DIR/report.txt must not be a symlink or a file with another
#                      hard link. Without --out nothing is written to disk.
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
#   --fixtures DIR     with --self-test only: also the 17 fixture rows F1-F17 ("ok fixture ..."), read from the real
#                      node v26.8.2 traces in DIR (test/fixtures/deopt-diff/node-26.8.2; each <driver>.txt through the
#                      record awk and the tier section, deopt.txt and mono.txt end to end through the fake node: no
#                      real node spawn), so a clean run counts 17 more checks. A missing or unreadable <driver>.txt
#                      is one more "FAIL fixture <driver>.txt: missing or not a readable file" line (exit 1), and
#                      the rows reading it get empty text, so some of them fail too.
#   -h, --help         this text (exit 2)
#   Each value option is given at most once and never empty; --fn / --v8-flags / --out / --node / --fixtures take
#   no newline and --fn no empty entry (stray comma). --self-test with any other value option or a positional
#   argument exits "--self-test takes only --fixtures DIR"; --fixtures without --self-test exits "--fixtures goes
#   with --self-test"; DIR with a newline exits "--fixtures: a newline is not allowed", and DIR that is not a
#   readable, searchable directory "--fixtures: not a readable directory: DIR". --self-test / --help take no =value.
#   A ref pair and a file pair are exclusive; --driver / --module / --repo go only with a ref / file pair; the seven
#   ref / file values take no newline.
#
# DRIVER (driver mode): exactly two existing readable files (ref / file mode: no DRIVER path; each side runs its
#   staged copy of --driver), each run as
#   `node [v8 flags] --trace-deopt-verbose --trace-opt --no-concurrent-recompilation DRIVER`
#   with cwd = its directory, NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped
#   (unset at start, for every spawn), stderr merged into stdout, piped through tee (to the --out raw file, else
#   /dev/null), tr (every NUL byte becomes `?`; the raw file keeps the NUL) and awk (keeps the trace lines, and for
#   the tier section every line holding `;;; deoptimize at ` or `@@LITE-MARK` anywhere). The kept text of every run
#   is held in memory: dense markers grow it. One run per side per k serves every fn; runs alternate before / after
#   for k = 1..N.
# fn: a short V8 name, ^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$ (e.g. add, get value). Never
#   qualified (Store.add). A repeated fn is refused. Matching is EXACT on the name between `<JSFunction ` and
#   ` (sfi = `: add never matches addX, ad or Store.add, get never matches get value; node internals of other
#   names are never counted.
# Records (E / D only from trace lines that start with `[`; addresses, sfi, opt id, bytecode offset, deopt exit,
#   deltas, pc, timings and paths are never part of a record):
#   E <fn>@<tier>[-OSR]              one per `[completed compiling ... <JSFunction fn ...> (target T)[ OSR] - took`
#   D <fn>@<tier><TAB><kind> (<reason>)   one per `[bailout (kind: K, reason: R): begin. deoptimizing ...
#                                    <JSFunction fn ...>, ... <Code T>, ...]`, K ~ ^deopt-[a-z]+$, T ~ ^[A-Z_]+$,
#                                    R non-empty, no tab, CR, `[` or `]`, cut at the first `): begin. deoptimizing `
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
# Then the tier section (below), a blank line and "VERDICT <SAME|DIFF|NO-VERDICT>".
# Verdict, over every fn (NO-VERDICT > DIFF > SAME): exit 0 SAME, 1 DIFF, 2 NO-VERDICT. If both sides pass, the run-1
#   D multisets are compared. Every refused argument exits 2 before any node is spawned and before anything is written
#   to disk, except a --v8-flags allowlist refusal (lib/v8flags.sh): it exits 2 after the --version and --v8-options
#   spawns, before anything is written. Spawns: one `node --version` (a failing one exits 2 before anything is
#   written), one `node --v8-options` (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS
#   stripped; a failing one, or one that lists no V8 flag, exits 2 before anything is written), then 2 x runs driver
#   runs: 2 + 2 x runs in all (8 at --runs 3).
# Ref / file mode: --out DIR is required; DIR/stage must be absent or an empty directory (a DIR/stage that is not a
#   directory exits 2 "--out: DIR/stage exists and is not a directory"). After the --version and --v8-options spawns,
#   DIR/stage/before and DIR/stage/after each get that side's module as NAME (ref mode: `git cat-file blob <sha>:REL`,
#   plumbing, no textconv; file mode: a cp, so an edit after staging cannot leak in) plus a copy of --driver, and each
#   side's driver runs there (cwd = DIR/stage/<side>). One module file per side: a module with relative imports of its
#   own fails closed (its driver exits non-zero: NO-VERDICT). Head: "before  <REF> @ <sha 12>  <REL>  sha256/8 <x>"
#   (ref) or "before  <abs FILE>  sha256/8 <x>" (file), x = the staged copy's, the same for after, then
#   "driver  <abs --driver>  sha256/8 <x>", and when the two staged modules are byte-identical
#   "NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)".
#   The mode line says "diff (ref)" or "diff (file)". Spawns, lines and verdict as in driver mode, plus the
#   byte-identical NO-VERDICT above; DIR holds report.txt, raw/ and stage/ (2 x runs + 5 files). Every ref / file
#   refusal exits 2 before any spawn and before anything is written to DIR.
# Frozen "before" (file mode): --before must be a FROZEN copy. It is refused with NO-VERDICT when it, or the end of
#   its symlink chain, is git-tracked, or when it is the same file (device:inode) as a tracked <top>/Signal.js,
#   <top>/<same name> or <top>/<--after's name>, <top> = the repo around the current directory, around --after
#   and its link target, around --before and its link target, and --repo; or when it is the same file as --after
#   (-ef: a hard link or symlink, anywhere). Ref and file
#   modes need git (file mode for this check). Both refuse a set GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE,
#   GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES (each can make a tracked --before read as
#   untracked): each repo is found from its path. Ref mode is frozen by construction (both sides from git objects).
#   A git error while checking whether --before is tracked, or while finding the work tree around the current
#   directory, --after or --before (safe.directory "dubious ownership", a broken .git file, a bad config, a corrupt
#   index) exits 2: "--before: git failed while checking whether FILE is tracked (<git's first line>)"; a --repo git
#   cannot read exits 2 before this check: "--repo is not a git work tree: DIR". A chain the kernel followed but the
#   walk cannot finish (a race) exits 2 too: "--after: cannot resolve its symlink chain: FILE" (--after is a symlink)
#   and "cannot resolve the directory of P (a link in the symlink chain of ARG)" (ARG = the --before value).
# Not detected: a deopt of an inlined function counts only for the JSFunction named on the bailout line (its
#   caller); a dependency invalidation of code that is not on the stack (`[marking dependent code ...]`, no
#   bailout line) is not a deopt record; a driver that itself prints trace-like text (`[bailout` /
#   `[completed compiling `) at line start is read as V8 trace output.
# Not detected (ref / file mode): a driver that reaches the live module by another path (an absolute path, or a
#   package self-reference) instead of './NAME'; a hard link of --before to a tracked file that is not --after,
#   <top>/Signal.js, <top>/<same name> or <top>/<--after's name> (a hard link under another name or in a subdirectory
#   stays undetected); a tracked link inside --before's symlink chain (only --before and the end of its chain are
#   checked, not the intermediate hops); and a .git that git does not recognise as a
#   repository (unreadable, a corrupt HEAD, no objects/: git answers "not a git repository") reads as no repository,
#   so a tracked --before inside it is not refused. Known gap, as in bytecode-budget: refs/replace
#   swaps the staged blob (a `git replace` of a ref's blob stages the replacement, and the head's sha256/8 is the
#   replacement's).
# Refused (ref / file mode, lib/stage.sh; exit 2 before any spawn or write, as in bytecode-budget): a --module that
#   is not a regular file in git at a ref (a TRACKED SYMLINK is mode 120000: "is not a regular file in git (mode
#   120000)"); a module and --driver whose file names are equal up to ASCII case (one file on a case-insensitive
#   file system); a module or --driver file name with a non-ASCII byte (a Unicode case or NFC / NFD fold); a
#   --driver whose directory bash's cd resolves to another file than the one read (a symlink before '..': a decoy
#   driver would be staged); a --before or --after whose directory bash's cd resolves to another file than the one
#   read (a symlink before '..': "--before: cannot resolve the directory of FILE", the header would name a decoy
#   path); a DIR/stage that is a symlink ("is a symlink"; a dangling one is "exists and is not a
#   directory"); and an unreadable, unsearchable or unwritable DIR/stage, refused as "is not empty" even when it is
#   empty. A --before, --after or --driver value that starts with '-' is read as the file ./<value>, never as an
#   option. An existing DIR that is not writable or not searchable and has no DIR/stage is refused too (exit 2, before
#   any spawn or write): "--out: cannot create DIR/stage (DIR is not writable)".
# Tier section: read from run 1 of each side, printed after the fn lines (and the byte-identical NO-VERDICT line)
#   in every report that reaches VERDICT. Every line starts "tier    " and none holds " -- " (a " -- " in a reason
#   or file name prints as " - - "): "tier    REPORTED: run 1 of each side, never part of the verdict", then per
#   fn in --fn order its before lines, then its after lines; one side's lines, in this order:
#   "tier    <fn>  <side>  compiles MAGLEV a, MAGLEV-OSR b, TURBOFAN_JS c, TURBOFAN_JS-OSR d[, <unit> n, ..]"
#   "tier    <fn>  <side>  cycles <c>: <seq>"   seq = run 1's E (as its unit) and D (as deopt) records in order,
#                                    joined " > ", cut after 16 with " > .."; none when empty; c = D records with a
#                                    later E
#   "tier    <fn>  <side>  deopt <i>/<d>: <unit> <kind> (<reason>), bytecode offset <o>, at <file>:<l>:<c>[ inlined
#                                    at <file>:<l>:<c>]"   one per D record; <file> = the base name; the position
#                                    is the first line holding `;;; deoptimize at ` (anywhere in the line) after the
#                                    bailout line and before the next line-start `[` line: ", no source position"
#                                    when there is none, ", source position unreadable" when it does not parse
#   "tier    <fn>  <side>  deopts unreadable (<a> bailout line(s), <d> D record(s))"   instead of the deopt lines
#                                    when the line-start `[bailout` lines naming fn, the <a> of them whose bytecode
#                                    offset reads and the <d> D records are not one count
#   "tier    <fn>  <side>  ops until TURBOFAN_JS: after op <a>, before op <b>"   a = the last marker before fn's
#                                    first `[completed compiling` line of fn with `(target TURBOFAN_JS)` or node
#                                    22's `(target TURBOFAN)`, OSR or not; b = the first marker after it; or
#                                    "after op <a>", "before op <b>", "not compiled in run 1 (last marker op <n>)",
#                                    "no @@LITE-MARK op lines", "markers unreadable (<why>)"
#   "tier    <fn>  <side>  not reported (run 1: <rc>)"     instead of the side's lines when its run 1 did not
#                                    exit 0 (<rc> = the driver exit, or "<tee|tr|awk> <rc>")
#   "tier    <fn>  <side>  unreadable (awk exited <rc>)"   instead of the side's lines when the section's awk
#                                    exits non-zero, prints nothing, or prints a line not starting "tier    " (rc 0
#                                    for a clean exit); the verdict and exit stand
# Marker protocol (tier section): the driver writes `@@LITE-MARK op <n>` at line start (n = ops done so far, 1-15
#   digits, strictly increasing), recommended with fs.writeSync(1, ...). A line starting `@@LITE-MARK op` and then
#   end of line or a byte that is not a letter, digit, `_` or `-` is an op line: one that is not exactly
#   `@@LITE-MARK op <n>`, or whose n is not above the last n, reads "markers unreadable (<why>)", as does
#   `@@LITE-MARK` after column 1 of any kept line. Any other line starting `@@LITE-MARK` is ignored (e.g.
#   `@@LITE-MARK start`, `@@LITE-MARK opx 5`, `@@LITE-MARKop 7`, `@@LITE-MARK  op 6`).
# Not detected (tier section): an asynchronous marker writer (console.log, process.stdout.write) is not proven to
#   keep its order against the trace under a full pipe (a 20/20 in-order probe per writer at 1454 bytes per run
#   does not separate the writers); ops are only as fine as the marker spacing.
# Tier (tier section): REPORTED, gates nothing; it never moves the exit code or a verdict line.
# Tier: on a user driver the verdict is STATISTICAL (deopts follow tier-up timing; run it under the host quiet
#   lock); --self-test is DETERMINISTIC (canned text and a fake node), and so is --self-test --fixtures DIR (recorded
#   traces and the fake node). The natives pair is DETERMINISTIC too: DIR's deopt.mjs and mono.mjs on a real node,
#   `--fn add --v8-flags --allow-natives-syntax deopt.mjs mono.mjs` exits 1 DIFF and deopt.mjs against a
#   byte-identical copy exits 0 SAME (npm test asserts the exit codes on every node, the exact lines on
#   node v26.8.2 only).
# Tier (ref / file mode): STATISTICAL on the same terms (each staged side is a user driver; its null control stays),
#   while the staging, the refusals and the byte-identical NO-VERDICT are DETERMINISTIC, gated in npm test by the
#   --self-test ref / file rows (a temp git repo and a fake node; with no git on PATH they are one FAIL line and
#   --self-test exits 1).
# Any unexpected failure (a command that fails outside the checks above) exits 2 NO-VERDICT, never 1.

unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS   # Q-ENV: no node spawn sees one
unset CDPATH   # before the prologue: SELF, every cd and every "cd X && pwd" join resolve X itself, never a CDPATH entry
set -euo pipefail
# Fail closed: an exit without FINAL=1 (a planned verdict) becomes 2 NO-VERDICT, rc 0 included (a bash 3.2
# set -u abort exits 0); a die / usage 2 stays silent; set +e keeps 2 with stderr closed. Subshells do not inherit this trap.
FINAL=""
trap 'rc=$?; if [[ -z $FINAL ]]; then set +e; [[ $rc -eq 2 ]] || printf "deopt-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT
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
  if (index(r, "\r") > 0 || index(r, "[") > 0 || index(r, "]") > 0) { x("bailout: CR or bracket in the reason"); next }
  if (!match(s, /^0x[0-9a-fA-F]+ <JSFunction /) || !head(substr(s, RLENGTH + 1))) { x("bailout: malformed function"); next }
  if (NM != fn) { x("bailout: function name"); next }
  if (!match(REST, /^, 0x[0-9a-fA-F]+ <Code /)) { x("bailout: no code object"); next }
  s = substr(REST, RLENGTH + 1); p = index(s, ">"); t = substr(s, 1, p - 1)
  if (p == 0 || t !~ /^[A-Z_]+$/) { x("bailout: code tier"); next }
  if (substr(s, p, 3) != ">, " || index(s, "]") != length(s) || index(s, "[") > 0 || index(s, "\r") > 0) { x("bailout: after code tier"); next }
  print "D " fn "@" t "\t" k " (" r ")"; next
}
substr($0, 1, 21) == "[completed compiling " {
  if (!names($0)) next
  s = substr($0, 22)
  if (!match(s, /^0x[0-9a-fA-F]+ <JSFunction /) || !head(substr(s, RLENGTH + 1))) { x("completed compiling: malformed function"); next }
  if (NM != fn) { x("completed compiling: function name"); next }
  if (!match(REST, /^ \(target [A-Z_]+\)/)) { x("completed compiling: target"); next }
  t = substr(REST, 10, RLENGTH - 10); r = substr(REST, RLENGTH + 1)
  if (index(r, "]") != length(r) || index(r, "[") > 0 || index(r, "\r") > 0) { x("completed compiling: after target"); next }
  if (r ~ /^ OSR - took .*\]$/) t = t "-OSR"
  else if (r !~ /^ - took .*\]$/) { x("completed compiling: after target"); next }
  print "E " fn "@" t; next
}
'

# cold path, REPORTED tier (run 1 of one side, after the verdict lines; never part of the verdict): -v fn side,
# ARGV[1] = fn's DEOPT_AWK records of run 1, ARGV[2] = run 1's kept lines. Prints only lines starting "tier    ",
# none holding " -- ". Compiles / cycles from the records; per D record its bailout line's bytecode offset and the
# first `;;; deoptimize at` line before the next line-start `[` line (paired in order, only when every line-start
# `[bailout` line naming fn is read and is one D record); ops from `@@LITE-MARK op <n>` lines around fn's first
# TURBOFAN_JS[-OSR] compile line (node 22 prints the tier as `(target TURBOFAN)`: D5). An unreadable marker /
# position is named, never guessed.
# shellcheck disable=SC2016
TIER_AWK='
function names(s,   t, p, c) {                    # as DEOPT_AWK names() (its test reordered)
  t = "<JSFunction " fn
  while ((p = index(s, t)) > 0) {
    s = substr(s, p + length(t)); c = substr(s, 1, 1)
    if (s == "" || substr(s, 1, 8) == " (sfi = " || c == ">") return 1
  }
  return 0
}
function emit(s) { while (index(s, " -- ") > 0) sub(/ -- /, " - - ", s); print "tier    " fn "  " side "  " s }
function bad(why) { if (MB == "") MB = why }
function posof(s,   r, n, q, g, b) {              # text after ";;; deoptimize at " -> ", at b:l:c[ inlined at b:l:c]"
  r = ""; n = 0
  while (s != "") {
    if (n == 0 && substr(s, 1, 1) == "<") s = substr(s, 2)
    else if (n > 0 && substr(s, 1, 13) == " inlined at <") s = substr(s, 14)
    else return ", source position unreadable"
    q = index(s, ">"); if (q == 0) return ", source position unreadable"
    g = substr(s, 1, q - 1); s = substr(s, q + 1)
    if (!match(g, /:[0-9]+:[0-9]+$/)) return ", source position unreadable"
    b = substr(g, 1, RSTART - 1); sub(/.*\//, "", b)
    if (b == "") return ", source position unreadable"
    r = r (n > 0 ? " inlined at " : ", at ") b substr(g, RSTART); n++
  }
  return (n > 0 ? r : ", source position unreadable")
}
FILENAME == ARGV[1] {                               # records, in trace order (X: the verdict lines name it)
  if (substr($0, 1, 2) == "E ") {
    u = substr($0, length(fn) + 4); EV[++NE] = u
    if (!(u in CN)) { CN[u] = 0; if (u != "MAGLEV" && u != "MAGLEV-OSR" && u != "TURBOFAN_JS" && u != "TURBOFAN_JS-OSR") OT[++NO] = u }
    CN[u]++
  } else if (substr($0, 1, 2) == "D ") {
    s = substr($0, length(fn) + 4); p = index(s, "\t"); EV[++NE] = "deopt"; DR[++ND] = substr(s, 1, p - 1) " " substr(s, p + 1)
  }
  next
}
{
  if (index($0, "@@LITE-MARK") > 1) bad("@@LITE-MARK not at line start")
  if (substr($0, 1, 1) == "[") {
    PD = 0
    if (substr($0, 1, 8) == "[bailout") {
      if (!names($0)) next
      NB++; s = $0; p = index(s, "): begin. deoptimizing "); q = 0; o = ""
      if (p > 0) { s = substr(s, p); q = index(s, ", bytecode offset ") }
      if (q > 0) { o = substr(s, q + 18); q = index(o, ","); o = (q > 1 ? substr(o, 1, q - 1) : "") }
      if (o ~ /^-?[0-9]+$/) { NRD++; OF[NRD] = o; PS[NRD] = ", no source position"; PD = NRD }
    } else if (!TF && match($0, /^\[completed compiling 0x[0-9a-fA-F]+ <JSFunction /) && substr($0, RLENGTH + 1, length(fn)) == fn &&
      (s = substr($0, RLENGTH + 1 + length(fn))) ~ /^ \(sfi = 0x[0-9a-fA-F]+\)> \(target TURBOFAN(_JS)?\)( OSR)? - took .*\]$/ &&
      index(s, "]") == length(s) && index(s, "[") == 0 && index(s, "\r") == 0) { TF = 1; TA = LM }
    next
  }
  if (PD > 0 && substr($0, 1, 11) != "@@LITE-MARK" && (p = index($0, ";;; deoptimize at ")) > 0) { PS[PD] = posof(substr($0, p + 18)); PD = 0; next }
  if (substr($0, 1, 14) == "@@LITE-MARK op" && substr($0, 15, 1) !~ /[A-Za-z0-9_-]/) {
    n = substr($0, 16)
    if (substr($0, 15, 1) != " " || n !~ /^[0-9]+$/ || length(n) > 15) bad("bad op line" (NM > 0 ? " after op " LM : "") ": want @@LITE-MARK op <1-15 digits>")
    else if (NM > 0 && n + 0 <= LM + 0) bad("op " n " after op " LM)
    else { NM++; LM = n; if (TF && TB == "") TB = n }
  }
}
END {
  s = "compiles MAGLEV " (CN["MAGLEV"] + 0) ", MAGLEV-OSR " (CN["MAGLEV-OSR"] + 0) ", TURBOFAN_JS " (CN["TURBOFAN_JS"] + 0) \
    ", TURBOFAN_JS-OSR " (CN["TURBOFAN_JS-OSR"] + 0)
  for (i = 1; i <= NO; i++) s = s ", " OT[i] " " CN[OT[i]]
  emit(s)
  c = 0; p = 0; s = ""
  for (i = 1; i <= NE; i++) {
    if (EV[i] == "deopt") p++; else { c += p; p = 0 }
    if (i <= 16) s = s (i > 1 ? " > " : "") EV[i]
  }
  if (NE > 16) s = s " > .."
  emit("cycles " c ": " (NE > 0 ? s : "none"))
  if (NB != ND || NRD != NB) emit("deopts unreadable (" (NRD + 0) " bailout line(s), " (ND + 0) " D record(s))")
  else for (i = 1; i <= ND; i++) emit("deopt " i "/" ND ": " DR[i] ", bytecode offset " OF[i] PS[i])
  if (MB != "") s = "markers unreadable (" MB ")"
  else if (NM == 0) s = "no @@LITE-MARK op lines"
  else if (!TF) s = "not compiled in run 1 (last marker op " LM ")"
  else if (TA != "" && TB != "") s = "after op " TA ", before op " TB
  else if (TA != "") s = "after op " TA
  else s = "before op " TB
  emit("ops until TURBOFAN_JS: " s)
}
'

# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
die() { printf 'deopt-diff: %s\nVERDICT NO-VERDICT\n' "$*" >&2; exit 2; }
say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
sha8() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-8; }
usage() { sed -n '2,/^$/{s/^# \{0,1\}//;p;}' "$0"; }
multiset() { sort | uniq -c; }   # the ONE multiset: judge() and --self-test both use it (never sort -u)
devino() { # device:inode, following symlinks (GNU stat, else BSD / macOS stat)
  if stat -L -c '%d:%i' -- "$1" >/dev/null 2>&1; then stat -L -c '%d:%i' -- "$1"; else stat -L -f '%d:%i' -- "$1"; fi
}
top_of() { # dir file: 0 and TOP_OF = the toplevel of the work tree around dir; 1 outside a work tree (or no git); dies
  # on any other git answer, naming file. The classifier is is_tracked's (lib/tracked.sh), copied word for word.
  local d="$1" out rc=0 l
  TOP_OF=""
  command -v git >/dev/null 2>&1 || return 1
  out=$(LC_ALL=C git -C "$d" rev-parse --is-inside-work-tree 2>&1) || rc=$?
  l=${out%%$'\n'*}
  if [[ $rc -ne 0 ]]; then
    case "$l" in "fatal: not a git repository (or any "*) return 1 ;; esac
  elif [[ "$out" == false ]]; then
    return 1
  elif [[ "$out" == true ]]; then
    rc=0
    out=$(LC_ALL=C git -C "$d" rev-parse --show-toplevel 2>&1) || rc=$?
    l=${out%%$'\n'*}
    [[ $rc -ne 0 ]] || { TOP_OF="$out"; return 0; }
  fi
  die "${what:-top_of}: git failed while checking whether $2 is tracked (${l:-no output, exit $rc}): fix it (e.g. git config --global --add safe.directory DIR) or use --before-ref"
}
live_tops() { # file dirs...: LIVE_TOPS = the repo toplevels around cwd, --after, --repo and each given dir (sort -u, one
  # per line); a git error dies naming file (top_of). CURRENT shell only: never in $( ), <( ) or a pipe
  local f="$1" x r t="" TOP_OF=""
  shift
  LIVE_TOPS=""
  if top_of . "$f"; then t="$t$TOP_OF"$'\n'; fi
  if [[ -n "$AFTER_FILE" ]] && top_of "$(dirname -- "$AFTER_FILE")" "$f"; then t="$t$TOP_OF"$'\n'; fi
  if [[ -L "$AFTER_FILE" && -e "$AFTER_FILE" ]]; then
    r=$(resolve_links "$AFTER_FILE" 2>/dev/null) || die "--after: cannot resolve its symlink chain: $AFTER_FILE"
    if top_of "$(dirname -- "$r")" "$f"; then t="$t$TOP_OF"$'\n'; fi
  fi
  if [[ -n "$REPO" ]] && top_of "$REPO" "$f"; then t="$t$TOP_OF"$'\n'; fi
  for x in "$@"; do if top_of "$x" "$f"; then t="$t$TOP_OF"$'\n'; fi; done
  [[ -z "$t" ]] || LIVE_TOPS=$(printf '%s' "$t" | sort -u)
}
resolve_links() { # path: follow a symlink chain (at most 40 hops) and print its end. A relative link joins onto the
  # PHYSICAL directory of the link (a logical join collapses a symlinked dir's '..' onto the wrong parent); dies if
  # that directory cannot be entered
  local p="$1" l n=0 d
  while [[ -L "$p" ]]; do
    n=$((n + 1)); [[ $n -le 40 ]] || die "symlink chain too long (or a loop) at $1"
    l=$(readlink -- "$p") || die "cannot read the symlink $p (in the chain of $1)"
    case "$l" in /*) p="$l" ;; *) d=$(dirname -- "$p"); [[ $d != -* ]] || d="./$d"
      d=$(CDPATH= cd -P -- "$d" 2>/dev/null && pwd -P) || die "cannot resolve the directory of $p (a link in the symlink chain of $1)"; p="$d/$l" ;; esac
  done
  printf '%s\n' "$p"
}
is_tracked() { # path: 0 iff git tracks it in the work tree around it
  local d b
  d=$(dirname -- "$1"); [[ $d != -* ]] || d="./$d"
  d=$(CDPATH= cd -P -- "$d" 2>/dev/null && pwd -P) || return 1
  b=$(basename -- "$1")
  git -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1 && git -C "$d" ls-files --error-unmatch -- "$b" >/dev/null 2>&1
}
refuse_live() { # file label: die unless file is a FROZEN copy (not tracked, not an alias of a tracked file)
  local f="$1" what="$2" p me top t LIVE_TOPS=""
  p=$(resolve_links "$f")
  for t in "$f" "$p"; do
    if is_tracked "$t"; then die "$what is a git-tracked working-tree file ($t): use a FROZEN copy (untracked) or --before-ref"; fi
  done
  me=$(devino "$f")
  live_tops "$f" "$(dirname -- "$f")" "$(dirname -- "$p")"
  while IFS= read -r top; do
    [[ -n "$top" ]] || continue
    for t in "$top/Signal.js" "$top/$(basename -- "$f")" "$top/$(basename -- "$p")" \
      ${AFTER_FILE:+"$top/$(basename -- "$AFTER_FILE")"}; do
      if [[ -e "$t" ]] && [[ "$(devino "$t")" == "$me" ]] && is_tracked "$t"; then
        die "$what is the same file as the live $t (hard link / symlink): use a FROZEN copy or --before-ref"
      fi
    done
  done < <(printf '%s\n' "$LIVE_TOPS")
}
worst() { # NO-VERDICT > DIFF > SAME
  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT
  elif [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF
  else echo SAME; fi
}
is_tracked() { # path: 0 iff git tracks it in the work tree around it; a git error dies
  local d b out rc=0 l
  command -v git >/dev/null 2>&1 || return 1
  d=$(dirname -- "$1"); [[ $d != -* ]] || d="./$d"
  d=$(cd -P -- "$d" 2>/dev/null && pwd -P) || return 1
  b=$(basename -- "$1")
  out=$(LC_ALL=C git -C "$d" rev-parse --is-inside-work-tree 2>&1) || rc=$?
  l=${out%%$'\n'*}
  if [[ $rc -ne 0 ]]; then
    case "$l" in "fatal: not a git repository (or any "*) return 1 ;; esac
  elif [[ "$out" == false ]]; then
    return 1
  elif [[ "$out" == true ]]; then
    rc=0
    out=$(LC_ALL=C git --literal-pathspecs -C "$d" ls-files --error-unmatch -- "$b" 2>&1) || rc=$?
    l=${out%%$'\n'*}
    [[ $rc -ne 0 ]] || return 0
    if [[ $rc -eq 1 ]]; then case "$out" in *"did not match"*) return 1 ;; esac; fi
  fi
  die "${what:-is_tracked}: git failed while checking whether $1 is tracked (${l:-no output, exit $rc}): fix it (e.g. git config --global --add safe.directory DIR) or use --before-ref"
}

# ---------------------------------------------------------------------------------------------
# ref / file staging: a frozen copy of one module per side, beside a copy of the driver
# ---------------------------------------------------------------------------------------------
STAGE_MODE=""; STAGE_NAME=""; STAGE_DRIVER=""; STAGE_ABS_B=""; STAGE_ABS_A=""; STAGE_SHA_B=""; STAGE_SHA_A=""
stage_check() { # refuse a bad ref / file staging (no disk write); set the STAGE_* inputs of stage_write
  local side ref sha x t="" b m
  [[ -z "$BEFORE_REF$AFTER_REF" || -z "$BEFORE_FILE$AFTER_FILE" ]] \
    || die "--before-ref/--after-ref (ref mode) and --before/--after (file mode) are exclusive: give one pair"
  if [[ -n "$BEFORE_REF$AFTER_REF" ]]; then
    STAGE_MODE=ref
    [[ -n "$BEFORE_REF" && -n "$AFTER_REF" ]] || die "--before-ref and --after-ref go together"
  else
    STAGE_MODE=file
    [[ -n "$BEFORE_FILE" && -n "$AFTER_FILE" ]] || die "--before and --after go together"
  fi
  [[ ${#POS[@]} -eq 0 ]] || die "$STAGE_MODE mode takes no DRIVER paths (give --driver FILE), got ${#POS[@]}"
  for x in "$BEFORE_REF" "$AFTER_REF" "$BEFORE_FILE" "$AFTER_FILE" "$MODULE" "$DRIVER" "$REPO"; do
    [[ "$x" != *$'\n'* ]] || die "--before-ref / --after-ref / --before / --after / --module / --driver / --repo: a newline is not allowed"
  done
  # a path value that starts with '-' is a name, never an option: refuse_live, dirname, basename, grep and cp read ./-NAME
  [[ "$BEFORE_FILE" != -* ]] || BEFORE_FILE="./$BEFORE_FILE"; [[ "$AFTER_FILE" != -* ]] || AFTER_FILE="./$AFTER_FILE"; [[ "$DRIVER" != -* ]] || DRIVER="./$DRIVER"
  [[ -n "$OUT" ]] || die "$STAGE_MODE mode needs --out DIR (the staged copies are written to DIR/stage)"
  [[ -n "$DRIVER" ]] || die "$STAGE_MODE mode needs --driver FILE (a driver that imports the module as './<name>')"
  [[ -f "$DRIVER" && -r "$DRIVER" ]] || die "--driver not found (or not a readable file): $DRIVER"
  [[ -z "${GIT_DIR+x}${GIT_WORK_TREE+x}${GIT_INDEX_FILE+x}${GIT_OBJECT_DIRECTORY+x}${GIT_COMMON_DIR+x}${GIT_CEILING_DIRECTORIES+x}" ]] || die "GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES is set: unset it ($STAGE_MODE mode finds each repo from its path)"
  command -v git >/dev/null 2>&1 || die "$STAGE_MODE mode needs git (ref mode reads the refs; file mode checks that --before is a frozen copy)"
  if [[ -n "$REPO" ]]; then
    t=$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null) || die "--repo is not a git work tree: $REPO"
  elif [[ $STAGE_MODE == ref ]]; then
    t=$(git rev-parse --show-toplevel 2>/dev/null) || die "ref mode: the cwd is not inside a git work tree (give --repo DIR)"
  fi
  if [[ $STAGE_MODE == ref ]]; then
    [[ -n "$MODULE" ]] || die "ref mode needs --module REL (the module's path from the repo root, e.g. src/Thing.js)"
    [[ "$MODULE" != /* ]] || die "--module must be relative to the repo root, got '$MODULE'"
    case "/$MODULE/" in */./*|*/../*|*//*) die "--module must not have an empty, '.' or '..' segment, got '$MODULE'" ;; esac
    REPO="$t"
    for side in before after; do
      if [[ $side == before ]]; then ref="$BEFORE_REF"; else ref="$AFTER_REF"; fi
      [[ "$ref" != -* ]] || die "--$side-ref must not start with '-', got '$ref'"
      sha=$(git -C "$REPO" rev-parse --verify --quiet "$ref^{commit}") || die "--$side-ref: '$ref' is not a commit in $REPO (git fetch?)"
      [[ "$(git -C "$REPO" cat-file -t "$sha:$MODULE" 2>/dev/null)" == blob ]] || die "--$side-ref: $ref ($sha) has no file $MODULE"
      # the tree mode, not only the type: a tracked symlink (120000) is a blob too, and its staged text is the link target's path
      m=$(git --literal-pathspecs -C "$REPO" ls-tree "$sha" -- "$MODULE" 2>/dev/null) || m=""
      case "$m" in *$'\n'*) ;; "100644 blob "*|"100755 blob "*) m=ok ;; esac
      [[ "$m" == ok ]] || { m=${m%%[[:space:]]*}; die "--$side-ref: $MODULE at $ref is not a regular file in git (mode ${m:-none}): its staged text would not be the module"; }
      if [[ $side == before ]]; then STAGE_SHA_B="$sha"; else STAGE_SHA_A="$sha"; fi
    done
    STAGE_NAME=$(basename -- "$MODULE")
  else
    [[ -z "$MODULE" ]] || die "file mode takes no --module (the module name is --after's file name)"
    for side in before after; do
      if [[ $side == before ]]; then x="$BEFORE_FILE"; else x="$AFTER_FILE"; fi
      [[ -f "$x" && -r "$x" ]] || die "--$side not found (or not a readable file): $x"
    done
    refuse_live "$BEFORE_FILE" --before
    [[ ! "$BEFORE_FILE" -ef "$AFTER_FILE" ]] || die "--before and --after are the same file (hard link / symlink): --before must be a FROZEN copy"
    STAGE_NAME=$(basename -- "$AFTER_FILE")
    STAGE_ABS_B=$(cd -- "$(dirname -- "$BEFORE_FILE")" && pwd)/$(basename -- "$BEFORE_FILE")
    STAGE_ABS_A=$(cd -- "$(dirname -- "$AFTER_FILE")" && pwd)/$(basename -- "$AFTER_FILE")
    [[ "$STAGE_ABS_B" -ef "$BEFORE_FILE" ]] || die "--before: cannot resolve the directory of $BEFORE_FILE (a symlink before '..'?)"
    [[ "$STAGE_ABS_A" -ef "$AFTER_FILE" ]] || die "--after: cannot resolve the directory of $AFTER_FILE (a symlink before '..'?)"
  fi
  b=$(basename -- "$DRIVER")
  [[ "$STAGE_NAME" != "$b" ]] || die "the module and --driver have the same file name ($STAGE_NAME): rename the driver"
  # a case-insensitive file system (macOS, Windows) stages both under one name: refuse a pair equal up to ASCII case, on every host
  [[ "$(printf '%s' "$STAGE_NAME" | LC_ALL=C tr 'A-Z' 'a-z')" != "$(printf '%s' "$b" | LC_ALL=C tr 'A-Z' 'a-z')" ]] || die "the module and --driver have the same file name up to case ($STAGE_NAME / $b): rename the driver"
  # a non-ASCII or control byte (LC_ALL=C: [:print:] is 0x20-0x7E) can fold too (APFS: Unicode case, NFC / NFD): refuse it
  [[ "$STAGE_NAME$b" != *[![:print:]]* ]] || die "the module or --driver file name has a non-ASCII byte ($STAGE_NAME / $b): rename it"
  grep -q -F -e "'./$STAGE_NAME'" -e "\"./$STAGE_NAME\"" -- "$DRIVER" || die "--driver must import './$STAGE_NAME' (the staged module beside it): $DRIVER"
  STAGE_DRIVER=$(cd -- "$(dirname -- "$DRIVER")" && pwd)/$(basename -- "$DRIVER")
  # the import check above read $DRIVER through the kernel (physical path); the copy below reads STAGE_DRIVER (bash's
  # logical join). A symlink before '..' makes them two files (a decoy driver would be staged): refuse unless they are one
  [[ "$STAGE_DRIVER" -ef "$DRIVER" ]] || die "--driver: cannot resolve the directory of $DRIVER (a symlink before '..'?)"
  [[ ! -L "$OUT/stage" ]] || die "--out: $OUT/stage is a symlink (refused: the writes would follow it)"
  # an unreadable or unsearchable DIR/stage reads as empty to ls -A (its error is hidden), and an unwritable one fails only
  # in stage_write, after the first spawns and DIR/raw writes: refuse both here, before any spawn or write
  # (the same for an existing DIR that is not writable or not searchable: its new DIR/stage fails in stage_write)
  { [[ ! -e "$OUT/stage" ]] || { [[ -r "$OUT/stage" && -w "$OUT/stage" && -x "$OUT/stage" ]] && [[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]; }; } || die "--out: $OUT/stage is not empty (give a new or empty DIR)"
  [[ -e "$OUT/stage" || ! -e "$OUT" || ( -w "$OUT" && -x "$OUT" ) ]] \
    || die "--out: cannot create $OUT/stage ($OUT is not writable)"
}
stage_write() { # OUT/stage/<side>: that side's module as STAGE_NAME plus the driver; set DRV_B DRV_A STAGE_SAME DESC_*
  local side dir b x
  b=$(basename -- "$STAGE_DRIVER")
  mkdir -p -- "$OUT/stage" 2>/dev/null && mkdir -- "$OUT/stage/before" "$OUT/stage/after" 2>/dev/null \
    || die "--out: cannot create $OUT/stage/before and $OUT/stage/after"
  for side in before after; do
    dir="$OUT/stage/$side"
    if [[ $STAGE_MODE == ref ]]; then
      if [[ $side == before ]]; then x="$STAGE_SHA_B"; else x="$STAGE_SHA_A"; fi
      git -C "$REPO" cat-file blob "$x:$MODULE" >"$dir/$STAGE_NAME" || die "cannot read $MODULE at $x"   # plumbing: no textconv
    else
      if [[ $side == before ]]; then x="$BEFORE_FILE"; else x="$AFTER_FILE"; fi
      cp -- "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"   # the copy IS the freeze: later edits to $x cannot leak in
    fi
    cp -- "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"
    # the belt (stage_check refuses every fold it knows): a file system that still maps the two names to one file
    [[ ! "$dir/$STAGE_NAME" -ef "$dir/$b" ]] || die "the staged module and driver are the same file on this file system (case / Unicode fold: $STAGE_NAME / $b): rename the driver"
  done
  DRV_B="$OUT/stage/before/$b"; DRV_A="$OUT/stage/after/$b"
  if cmp -s "$OUT/stage/before/$STAGE_NAME" "$OUT/stage/after/$STAGE_NAME"; then STAGE_SAME=1; else STAGE_SAME=0; fi
  if [[ $STAGE_MODE == ref ]]; then
    DESC_B="$BEFORE_REF @ ${STAGE_SHA_B:0:12}  $MODULE  sha256/8 $(sha8 "$OUT/stage/before/$STAGE_NAME")"
    DESC_A="$AFTER_REF @ ${STAGE_SHA_A:0:12}  $MODULE  sha256/8 $(sha8 "$OUT/stage/after/$STAGE_NAME")"
  else
    DESC_B="$STAGE_ABS_B  sha256/8 $(sha8 "$OUT/stage/before/$STAGE_NAME")"
    DESC_A="$STAGE_ABS_A  sha256/8 $(sha8 "$OUT/stage/after/$STAGE_NAME")"
  fi
  DESC_D="$STAGE_DRIVER  sha256/8 $(sha8 "$DRV_B")"
}

# `node --v8-options` -> "name type" per flag. A name line is exactly `  --<name> (` (one space before the paren: the
# synopsis lines and uppercase names drop out); the NEXT line must be its `type:` line, else the name is dropped.
# shellcheck disable=SC2016
V8FL_AWK='
p != "" { if (match($0, /^ +type: [a-z0-9_]+/)) { t = substr($0, RSTART, RLENGTH); sub(/^ +type: /, "", t); print p " " t }; p = "" }
/^  --[a-z0-9_-]+ \(/ { p = $1; sub(/^--/, "", p); gsub(/_/, "-", p) }
'
# MD-53 deny families, matched against "-<name>-" (= `(^|-)X(-|$)` on the bare name)
V8FL_RE='-(log|logfile|prof|profile|profiling|profiler|trace|print|perf|redirect|dump|stats|verbose|snapshot|gdbjit|counters|help|abort|fuzzing|file|logger)-'
V8FL_TAB=""
v8fl_read() { # NODE: V8FL_TAB from ONE `NODE --v8-options` capture; fails closed (die) on a spawn error, rc, 0 rows
  local raw rows rc=0
  raw=$(env -u NODE_OPTIONS -u NODE_COMPILE_CACHE "$1" --v8-options 2>/dev/null) || rc=$?
  [[ $rc -eq 0 ]] || die "cannot run $1 --v8-options"
  [[ -n "$raw" ]] || die "$1 --v8-options printed nothing"
  rows=$(printf '%s\n' "$raw" | LC_ALL=C awk "$V8FL_AWK") || rows=""
  [[ -n "$rows" ]] || die "$1 --v8-options lists no V8 flag"
  V8FL_TAB=$'\n'"$rows"$'\n'
}
v8fl_ok() { # TOKEN: 0 iff TOKEN is a V8 tuning flag in V8FL_TAB, in its value form (pure bash, 0 spawns)
  local nl=$'\n' g b t re v=0 neg=0
  g=${1//_/-}
  [[ "$g" == --* ]] || return 1
  b=${g#--}
  if [[ "$b" == *=* ]]; then v=1; [[ -n "${b#*=}" ]] || return 1; b=${b%%=*}; fi
  if [[ "$b" == no-* && "$V8FL_TAB" != *"$nl$b "* ]]; then b=${b#no-}; neg=1; fi
  case "$b" in ''|*[!abcdefghijklmnopqrstuvwxyz0123456789-]*) return 1 ;; esac
  re="$nl$b ([a-z0-9_]+)$nl"
  [[ "$V8FL_TAB" =~ $re ]] || return 1                  # not a V8 flag of this node (every node option)
  t=${BASH_REMATCH[1]}
  [[ "$t" != string ]] || return 1                      # string-typed: a file name, path or filter
  if [[ "-$b-" =~ $V8FL_RE ]]; then return 1; fi        # MD-53 family
  if [[ $neg -eq 1 && "$t" != bool && "$t" != maybe_bool ]]; then return 1; fi   # --no- on a non-bool
  case "$t" in bool|maybe_bool) [[ $v -eq 0 ]] ;; *) [[ $v -eq 1 ]] ;; esac     # value form (MD-58)
}
v8fl_check() { # NODE: one read (MD-56: also with no --v8-flags), then die on the first refused V8_EXTRA token
  local f
  v8fl_read "$1"
  for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
    v8fl_ok "$f" || die "--v8-flags must not set $f: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)"
  done
}

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
TRACE_FLAGS=(--trace-deopt-verbose --trace-opt --no-concurrent-recompilation)
# run_side keeps a line that starts with `[` or carries trace text anywhere (DEOPT_AWK turns the latter into X)
# shellcheck disable=SC2016
KEEP_AWK='/^\[/ || index($0, "[bailout") > 0 || index($0, "[completed compiling") > 0'
# ... and, for the REPORTED tier section only (TIER_AWK), a `;;; deoptimize at` line and a @@LITE-MARK line. A line
# kept only by this clause neither starts with `[` nor holds trace text: DEOPT_AWK prints nothing for it (and keeps no
# state across lines), so the records of every run are the same as without the clause
# shellcheck disable=SC2016
KEEP_AWK+=' || index($0, ";;; deoptimize at ") > 0 || index($0, "@@LITE-MARK") > 0'
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
    x=$(printf '%s\n' "${JREC[$i]}" | awk '/^X / && !n++ { print substr($0, 3) }')
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

# diff_fn FN: one fn, from RCB/RCA (driver exits) and TXB/TXA (the kept lines of run k, KEEP_AWK, at index k-1): records per
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

# tier_fn FN SIDE RC TEXT: the REPORTED tier lines of FN on one side, from run 1 (RC = its RUN_RC, TEXT = its kept
# lines). Cold path, after every verdict line: never sets VERDICT / FV / JV and never moves the exit code. A run 1
# that did not exit 0 prints "not reported"; a failing awk prints one "unreadable (awk exited <rc>)" line (MD-20).
tier_fn() {
  local rec out= rest l ok=0 rc=0
  if [[ "$3" != 0 ]]; then say "tier    $1  $2  not reported (run 1: $3)"; return 0; fi
  rec=$(printf '%s\n' "$4" | awk -v fn="$1" "$DEOPT_AWK") || rc=$?
  if [[ $rc == 0 ]]; then out=$(awk -v fn="$1" -v side="$2" "$TIER_AWK" <(printf '%s\n' "$rec") <(printf '%s\n' "$4") \
    && printf . || { rc=$?; printf .; exit "$rc"; }) || rc=$?; fi
  # print only if awk exited 0 with output and EVERY line starts `tier    ` (an empty line is foreign; the `.` keeps
  # trailing newlines); else one unreadable line (MD-20, A9 (1))
  out=${out%.}; out=${out%$'\n'}; rest=$out
  if [[ $rc == 0 && -n "$out" ]]; then
    ok=1; while :; do l=${rest%%$'\n'*}; [[ "$l" == "tier    "* ]] || ok=0; [[ "$rest" == *$'\n'* ]] || break; rest=${rest#*$'\n'}; done
  fi
  if [[ $ok == 1 ]]; then say "$out"; else say "tier    $1  $2  unreadable (awk exited $rc)"; fi
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

  # --- TIER_AWK (the REPORTED tier section; PLAN A1 / A2): canned text the run_side way (tr, KEEP_AWK), a fresh
  # DEOPT_AWK pass, then TIER_AWK as tier_fn runs it. tie FN TEXT [LINE] -> line LINE ($ = the last; all when none),
  # "tier    FN  s  " cut, ";" per line ---
  local SEMI INL LZE BEND XB PRE
  SEMI=$(printf '%s\n' "$T_DEOPT" | sed -n 11p); INL='            ;;; deoptimize at <file:///a/inner.js:2:33> inlined at <file:///b/drv.js:3:31>'
  LZE="${E9//JSFunction add /JSFunction lazyFn }"; BEND="${T_DEOPT##*$'\n'}"; XB="${D10/deopt-eager/deopt-Eager}"
  PRE=$(printf '%s\n' "$T_DEOPT" | sed -n 1,6p)
  mko() { printf '@@LITE-MARK op %s\n' "$@"; }
  tie() {
    local k r
    k=$(printf '%s\n' "$2" | tr '\000' '?' | awk "$KEEP_AWK"); r=$(printf '%s\n' "$k" | awk -v fn="$1" "$DEOPT_AWK")
    { awk -v fn="$1" -v side=s "$TIER_AWK" <(printf '%s\n' "$r") <(printf '%s\n' "$k") || echo "tier    $1  s  !awk exited $?"; } \
      | sed -n "${3:-1,\$}p" | cut -c "$((14 + ${#1}))"- | tr '\n' ';'
  }
  check "T1 A1 compiles + cycles: fn=add -> TURBOFAN_JS 1, 'cycles 0' (no E after the D); + E9 -> 'cycles 1'; an OSR compile -> MAGLEV-OSR 1" \
    "$(tie add "$T_DEOPT" 1)$(tie add "$T_DEOPT" 2)$(tie add "$T_DEOPT"$'\n'"$E9" 2)$(tie loopFn "$OSRC"$'\n'"$OSR" 1)" \
    "compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0;cycles 0: TURBOFAN_JS > deopt;cycles 1: TURBOFAN_JS > deopt > TURBOFAN_JS;compiles MAGLEV 0, MAGLEV-OSR 1, TURBOFAN_JS 0, TURBOFAN_JS-OSR 0;"
  check "T2 A1 deopt line: bytecode offset and ';;;' position as base names (offset 2; the P copy: offset 14, /elsewhere/drv.js; an inlined chain)" \
    "$(tie add "$T_DEOPT" 3)$(tie add "$P" 3)$(tie add "$ED"$'\n'"$INL" 3)" \
    "deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at drv-deopt.js:1:31;deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 14, at drv.js:9:9;deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at inner.js:2:33 inlined at drv.js:3:31;"
  check "T3 A1 a ';;;' line only after the next line-start '[' line -> 'no source position'; an unread bailout naming fn -> 'deopts unreadable (1 bailout line(s), 0 D record(s))'" \
    "$(tie lazyFn "$LZE"$'\n'"$LZ"$'\n'"$BEND"$'\n'"$SEMI" 3)$(tie add "$T_MONO"$'\n'"$XB" 3)" \
    "deopt 1/1: TURBOFAN_JS deopt-lazy ((unknown)), bytecode offset 13, no source position;deopts unreadable (1 bailout line(s), 0 D record(s));"
  check "T4 A2 ops window: 1 2 TF 3 -> 'after op 2, before op 3'; TF 3 4 -> 'before op 3'; 1 2 TF -> 'after op 2'; none; '@@LITE-MARK start' ignored" \
    "$(tie add "$PRE"$'\n'"$(mko 1 2)"$'\n'"$E9"$'\n'"$(mko 3)" '$')$(tie add "$PRE"$'\n'"$E9"$'\n'"$(mko 3 4)" '$')$(tie add "$PRE"$'\n'"$(mko 1 2)"$'\n'"$E9" '$')$(tie add "$T_MONO" '$')$(tie add "$PRE"$'\n'"$(mko 1)"$'\n'"@@LITE-MARK start"$'\n'"$E9"$'\n'"$(mko 3)" '$')" \
    "ops until TURBOFAN_JS: after op 2, before op 3;ops until TURBOFAN_JS: before op 3;ops until TURBOFAN_JS: after op 2;ops until TURBOFAN_JS: no @@LITE-MARK op lines;ops until TURBOFAN_JS: after op 1, before op 3;"
  check "T5 A2 markers unreadable: op 5 then 4; op 2 then 2 (strictly increasing); '@@LITE-MARK' past column 1; a bad op line" \
    "$(tie add "$PRE"$'\n'"$(mko 5 4)"$'\n'"$E9" '$')$(tie add "$PRE"$'\n'"$(mko 2 2)"$'\n'"$E9" '$')$(tie add "$PRE"$'\n'"$(mko 1)"$'\n'"x@@LITE-MARK op 9"$'\n'"$E9" '$')$(tie add "$PRE"$'\n'"$(mko 1)"$'\n'"@@LITE-MARK op x"$'\n'"$E9" '$')" \
    "ops until TURBOFAN_JS: markers unreadable (op 4 after op 5);ops until TURBOFAN_JS: markers unreadable (op 2 after op 2);ops until TURBOFAN_JS: markers unreadable (@@LITE-MARK not at line start);ops until TURBOFAN_JS: markers unreadable (bad op line after op 1: want @@LITE-MARK op <1-15 digits>);"
  check "T6 A2 'not compiled in run 1': ops 1 2 3, no TURBOFAN_JS compile; ops 1 2 around a TURBOFAN_JS line with a glued tail (DEOPT_AWK: X) -> last marker op 2" \
    "$(tie add "$PRE"$'\n'"$(mko 1 2 3)" '$')$(tie add "$PRE"$'\n'"$(mko 1)"$'\n'"${E9}zz"$'\n'"$(mko 2)" '$')" \
    "ops until TURBOFAN_JS: not compiled in run 1 (last marker op 3);ops until TURBOFAN_JS: not compiled in run 1 (last marker op 2);"

  # --- this script end to end: a fake node (bash) logs argv, prints a version, answers --v8-options with $fk/v8o.txt
  # (ten lines of test/fixtures/v8flags/v8-options.v26.8.2.txt, verbatim: allow-natives-syntax bool,
  # max-inlined-bytecode-size int, lazy-feedback-allocation bool, turbo-filter string, trace-osr bool; exit
  # $FAKE_V8O_RC instead when set) before its run counter, cats ./trace.<n>.txt or ./trace.txt
  # from cwd (n = its run count in that driver dir), in a cwd ending in /after also cats $FAKE_AFTER_EXTRA (when set),
  # exits with ./rc or 0, and exits 7 if NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE or NODE_REDIRECT_WARNINGS
  # reached it ---
  local fk="$d/fk" D1 D2 out
  mkdir -p "$fk" "$d/cwd" "$d/tmp"
  printf '%s\n' "#!$BASH" 'd=$(dirname "$0")' 'printf "%s\n" "$*" >>"$d/log"' \
    'if [ -n "${NODE_OPTIONS+x}" ]; then echo "NODE_OPTIONS leaked"; exit 7; fi' \
    'if [ -n "${NODE_OPTIONS+x}${NODE_V8_COVERAGE+x}${NODE_COMPILE_CACHE+x}${NODE_REDIRECT_WARNINGS+x}" ]; then echo "a NODE_* env var leaked"; exit 7; fi' \
    'case "$1" in --version) if [ -n "${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi; echo v26.8.2; exit 0 ;; esac' \
    'case "$1" in --v8-options) if [ -n "${FAKE_V8O_RC:-}" ]; then exit "$FAKE_V8O_RC"; fi; cat "$d/v8o.txt"; exit 0 ;; esac' \
    'c="$d/$(basename "$PWD").n"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$c"' \
    'if [ -f "./trace.$n.txt" ]; then cat "./trace.$n.txt"; elif [ -f ./trace.txt ]; then cat ./trace.txt; fi' \
    'case "$PWD" in */after) if [ -n "${FAKE_AFTER_EXTRA:-}" ]; then cat "$FAKE_AFTER_EXTRA"; fi ;; esac' \
    'if [ -f ./rc ]; then exit "$(cat ./rc)"; fi' 'exit 0' >"$fk/node"
  chmod +x "$fk/node"
  printf '%s\n' \
    '  --allow-natives-syntax (allow natives syntax)' \
    '        type: bool  default: --no-allow-natives-syntax' \
    '  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)' \
    '        type: int  default: --max-inlined-bytecode-size=460' \
    '  --lazy-feedback-allocation (Allocate feedback vectors lazily)' \
    '        type: bool  default: --lazy-feedback-allocation' \
    '  --turbo-filter (optimization filter for TurboFan compiler)' \
    '        type: string  default: --turbo-filter="*"' \
    '  --trace-osr (trace on-stack replacement)' \
    '        type: bool  default: --no-trace-osr' >"$fk/v8o.txt"
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
  check "e2e: 1 deopt vs 2 identical deopts (R=3) -> exit 1 DIFF, exactly 8 spawns, the before=1 after=2 line" \
    "$(spawn - --fn add "$D2" "$d/twice/driver.js")|$(has '    before=1 after=2  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" "1|VERDICT DIFF|8|1"
  check "e2e: mono vs deopt -> exit 1 DIFF (before=0 after=1)" \
    "$(spawn - --fn add "$D1" "$D2")|$(has '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" "1|VERDICT DIFF|8|1"
  check "e2e: mono vs mono -> exit 0 SAME; without --out nothing is written (cwd and TMPDIR stay empty)" \
    "$(spawn - --fn add "$D1" "$D1")|$(has '  add: SAME -- identical deopt multiset (before 0 | after 0)')|$(find "$d/cwd" "$d/tmp" -mindepth 1 | wc -l | tr -d ' ')" \
    "0|VERDICT SAME|8|1|0"
  check "e2e: NODE_OPTIONS set in the environment never reaches node (mono vs mono still SAME)" \
    "$(spawn NODE_OPTIONS=--st-probe --fn add "$D1" "$D1")" "0|VERDICT SAME|8"
  check "e2e: guard -> exit 2, each side says 'no optimized compile of 'nosuch' in run 1'" \
    "$(spawn - --fn nosuch "$D2" "$d/deop2/driver.js")|$(grep -c -E -e "^  nosuch: NO-VERDICT -- (before|after): no optimized compile of 'nosuch' in run 1 \\(" "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|8|2"
  check "e2e: null control -> exit 2 naming after: 'null control: run 2 differs from run 1'" \
    "$(spawn - --fn add "$D2" "$d/nc/driver.js")|$(grep -c -e '^  add: NO-VERDICT -- after: null control: run 2 differs from run 1 (' "$d/sp.out" || true)|$(grep -c -e ' -- before: ' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|8|1|0"
  check "e2e: driver exit 3 (before) -> exit 2 'before: driver exited 3 in run 1'" \
    "$(spawn - --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: driver exited 3 in run 1')" "2|VERDICT NO-VERDICT|8|1"
  cp "$d/sp.out" "$d/rc3.out"   # read by T8 and T13
  check "e2e: an unparseable bailout naming fn (after) -> exit 2 'unparseable trace line naming 'add' in run 1: ...'" \
    "$(spawn - --fn add "$D2" "$d/xb/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: bailout: kind 'deopt-Eager'")" \
    "2|VERDICT NO-VERDICT|8|1"
  check "e2e: a bailout glued after driver output on one line (after) -> exit 2 'trace text not at line start', never DIFF" \
    "$(spawn - --fn add "$D2" "$d/glue/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")" \
    "2|VERDICT NO-VERDICT|8|1"
  check "e2e --out: driver text, a NUL, then a bailout on one line (after) -> exit 2 'trace text not at line start', never SAME; the raw file keeps the NUL" \
    "$(spawn - --out "$d/on" --fn add "$D1" "$d/nul/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")|$(tr -d -c '\000' <"$d/on/raw/after/run.1.txt" | wc -c | tr -d ' ')" \
    "2|VERDICT NO-VERDICT|8|1|1"
  check "e2e: a NUL, then a bailout at the start of a line (after) -> exit 2 'trace text not at line start', never SAME" \
    "$(spawn - --fn add "$D1" "$d/nul0/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")" \
    "2|VERDICT NO-VERDICT|8|1"
  check "e2e: '[completed compilingX' glued after driver output, then a bailout (after) -> exit 2 'trace text not at line start', never SAME" \
    "$(spawn - --fn add "$D2" "$d/gluee/driver.js")|$(has "  add: NO-VERDICT -- after: unparseable trace line naming 'add' in run 1: trace text not at line start")" \
    "2|VERDICT NO-VERDICT|8|1"
  check "e2e --out: exit 1 DIFF; report.txt holds the verdict; raw/before + raw/after hold 3 + 3 files, addresses kept" \
    "$(spawn - --out "$d/o" --fn add "$D1" "$D2")|$(grep -c '^VERDICT DIFF$' "$d/o/report.txt" 2>/dev/null || true)|$(find "$d/o/raw/before" -type f | wc -l | tr -d ' ')+$(find "$d/o/raw/after" -type f | wc -l | tr -d ' ')|$(grep -c -F -x -e "$D10" "$d/o/raw/after/run.2.txt" 2>/dev/null || true)" \
    "1|VERDICT DIFF|8|1|3+3|1"
  check "e2e --out: a tee failure on a driver exiting 3 -> exit 2 'cannot read driver output in run 1 (tee exited 1)', not 'driver exited'" \
    "$(spawn "PATH=$d/shim:$PATH" --out "$d/ot" --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: cannot read driver output in run 1 (tee exited 1)')|$(grep -c -e 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|8|1|0"
  check "e2e --out: an awk + tr + tee failure on a driver exiting 3 -> 'cannot read driver output in run 1 (awk exited 5)'" \
    "$(spawn "PATH=$d/shim2:$PATH" --out "$d/oa" --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: cannot read driver output in run 1 (awk exited 5)')|$(grep -c -e 'tr exited' -e 'tee exited' -e 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|8|1|0"
  check "e2e --out: a tr + tee failure on a driver exiting 3 -> 'cannot read driver output in run 1 (tr exited 6)'" \
    "$(spawn "PATH=$d/shim3:$PATH" --out "$d/or" --fn add "$d/rc3/driver.js" "$D2")|$(has '  add: NO-VERDICT -- before: cannot read driver output in run 1 (tr exited 6)')|$(grep -c -e 'tee exited' -e 'driver exited' "$d/sp.out" || true)" \
    "2|VERDICT NO-VERDICT|8|1|0"
  check "e2e --out: a failing node --version -> exit 2 after 1 spawn, nothing written (no OUT dir)" \
    "$(spawn FAKE_VER_RC=1 --out "$d/ov" --fn add "$D1" "$D2")|$(grep -c -e '^deopt-diff: cannot run .*/node --version$' "$d/sp.out" || true)|$([[ -e "$d/ov" ]] && echo exists || echo absent)" \
    "2|VERDICT NO-VERDICT|1|1|absent"
  # --- MD-46 (MD-50..58, lib/v8flags.sh): the --v8-flags allowlist, read from the fake node's canned --v8-options ---
  check "MD-50 accepted: --v8-flags '--allow-natives-syntax --no-lazy-feedback-allocation --max-inlined-bytecode-size=30' -> exit 1 DIFF, 8 spawns, spawn 2 is the --v8-options read" \
    "$(spawn - --fn add --v8-flags '--allow-natives-syntax --no-lazy-feedback-allocation --max-inlined-bytecode-size=30' "$D1" "$D2")|$(sed -n 2p "$fk/log")" \
    "1|VERDICT DIFF|8|--v8-options"
  local f; got=""; x=0
  for f in --snapshot-blob=F --turbo-filter=x --trace-osr --max-inlined-bytecode-size; do
    x=$((x + 1))
    got="$got#$(spawn - --out "$d/oa$x" --fn add --v8-flags "$f" "$D1" "$D2")|$(has "deopt-diff: --v8-flags must not set $f: only V8 tuning flags of this node binary are accepted (node's own options, and V8 flags that log, trace, print, profile, dump or take a file or path, are refused)")|$([[ -e "$d/oa$x" ]] && echo exists || echo absent)"
  done
  check "MD-50 refused after the --v8-options read: --out + --v8-flags --snapshot-blob=F (no V8 flag) / --turbo-filter=x (string) / --trace-osr (trace family) / --max-inlined-bytecode-size (int, no =N) -> exit 2, 2 spawns, the allowlist die line once, no OUT dir" \
    "$got" "#2|VERDICT NO-VERDICT|2|1|absent#2|VERDICT NO-VERDICT|2|1|absent#2|VERDICT NO-VERDICT|2|1|absent#2|VERDICT NO-VERDICT|2|1|absent"
  check "MD-56 a failing node --v8-options (FAKE_V8O_RC=1) -> exit 2 after 2 spawns, 'cannot run .../node --v8-options', nothing written (no OUT dir)" \
    "$(spawn FAKE_V8O_RC=1 --out "$d/ow" --fn add "$D1" "$D2")|$(grep -c -e '^deopt-diff: cannot run .*/node --v8-options$' "$d/sp.out" || true)|$([[ -e "$d/ow" ]] && echo exists || echo absent)" \
    "2|VERDICT NO-VERDICT|2|1|absent"

  # --- the REPORTED tier section end to end (PLAN A3, A5, MD-20, A9): mx / dx are mono / deop driver dirs whose
  # trace.txt put() rewrites between runs; mktaw DIR BODY writes an awk shim (first on PATH) that runs BODY for
  # TIER_AWK only (the one awk with `-v side=` as its 3rd / 4th args) and never reads stdin ---
  local EX N4L
  EX=$(printf '%s\n' "$SEMI" '@@LITE-MARK op 1' '@@LITE-MARK op 2' '@@LITE-MARK op x' '....@@LITE-MARK op 3')
  mkd mx "$T_MONO"; mkd dx "$T_DEOPT"
  put() { printf '%s\n' "$T_MONO$1" >"$d/mx/trace.txt"; printf '%s\n' "$T_DEOPT$1" >"$d/dx/trace.txt"; }
  sm() { [[ "$(grep -v -e '^tier    ' "$d/m0.out" || true)" == "$(grep -v -e '^tier    ' "$d/sp.out" || true)" ]] && echo same || echo differs; }
  uw() { echo "$(has "tier    add  before  unreadable (awk exited $1)")$(has "tier    add  after  unreadable (awk exited $1)")"; }
  mktaw() { mkdir -p "$1"; printf '%s\n' "#!$BASH" "case \"\${3:-} \${4:-}\" in \"-v side=\"*) $2 ;; esac" \
    "exec $(command -v awk) \"\$@\"" >"$1/awk"; chmod +x "$1/awk"; }
  mktaw "$d/ta5" 'exit 5'; mktaw "$d/ta0" 'exit 0'; mktaw "$d/tap" 'echo "tier    add  x  PARTIAL"; exit 5'
  mktaw "$d/taf" 'echo "tier    add  x  OK"; echo FOREIGN; exit 0'
  mktaw "$d/tam" 'echo "tier    add  x  OK"; echo "tier   add  x  3SP"; echo "tier    add  x  OK"; exit 0'
  mktaw "$d/tab" 'echo "tier    add  x  OK"; echo; exit 0'
  put ""; got=$(spawn - --fn add "$d/mx/driver.js" "$d/dx/driver.js"); cp "$d/sp.out" "$d/m0.out"
  got="$got#$(has 'tier    add  after  deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at drv-deopt.js:1:31')"
  put $'\n'"$EX"
  check "T7 A3 never moves the verdict: mono|deop without, then with 5 extra lines (';;;', ops 1 2, 'op x', '....@@LITE-MARK op 3') -> same rc, VERDICT, 8 spawns, non-tier lines; tier lines read them" \
    "$got#$(spawn - --fn add "$d/mx/driver.js" "$d/dx/driver.js")#$(sm)#$(has 'tier    add  before  ops until TURBOFAN_JS: markers unreadable (bad op line after op 2: want @@LITE-MARK op <1-15 digits>)')$(has 'tier    add  after  ops until TURBOFAN_JS: markers unreadable (bad op line after op 2: want @@LITE-MARK op <1-15 digits>)')" \
    "1|VERDICT DIFF|8#1#1|VERDICT DIFF|8#same#11"
  put ""
  check "T8 MD-20 / A5: TIER_AWK exits 5, or exits 0 printing nothing -> 'unreadable (awk exited 5|0)' per side; rc, VERDICT, spawns, non-tier lines unchanged; run 1 exit 3 -> 'not reported (run 1: 3)'" \
    "$(spawn "PATH=$d/ta5:$PATH" --fn add "$d/mx/driver.js" "$d/dx/driver.js")|$(uw 5)|$(sm)#$(spawn "PATH=$d/ta0:$PATH" --fn add "$d/mx/driver.js" "$d/dx/driver.js")|$(uw 0)|$(sm)#$(grep -c -F -x -e 'tier    add  before  not reported (run 1: 3)' "$d/rc3.out" || true)" \
    "1|VERDICT DIFF|8|11|same#1|VERDICT DIFF|8|11|same#1"
  IFS= read -r -d '' N4L <<'EOF' || true
tier    REPORTED: run 1 of each side, never part of the verdict
tier    add  before  compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0
tier    add  before  cycles 0: TURBOFAN_JS
tier    add  before  ops until TURBOFAN_JS: no @@LITE-MARK op lines
tier    add  after  compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0
tier    add  after  cycles 0: TURBOFAN_JS > deopt
tier    add  after  deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at drv-deopt.js:1:31
tier    add  after  ops until TURBOFAN_JS: no @@LITE-MARK op lines
tier    addX  before  compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 0, TURBOFAN_JS-OSR 0
tier    addX  before  cycles 0: none
tier    addX  before  ops until TURBOFAN_JS: no @@LITE-MARK op lines
tier    addX  after  compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 0, TURBOFAN_JS-OSR 0
tier    addX  after  cycles 0: none
tier    addX  after  ops until TURBOFAN_JS: no @@LITE-MARK op lines
EOF
  check "T9 A9 (2) N4: --fn add,addX mono|deop -> exit 2, 8 spawns; tier lines exactly: header, then per fn in --fn order its before lines, then its after lines" \
    "$(spawn - --fn add,addX "$D1" "$D2")|$(grep -e '^tier    ' "$d/sp.out" || true)" "2|VERDICT NO-VERDICT|8|${N4L%$'\n'}"
  mkdir -p "$d/mixb" "$d/mixa"
  for x in mixb mixa; do
    : >"$d/$x/driver.js"; printf '%s\n' "$T_DEOPT" >"$d/$x/trace.1.txt"; printf '%s\n' "$T_MONO" >"$d/$x/trace.2.txt"; printf '%s\n' "$T_MONO" >"$d/$x/trace.3.txt"
  done
  check "T10 A9 (2) N5: each dir's run 1 deopts, runs 2 3 do not -> exit 2 (null control), 3 + 3 runs, both sides' tier deopt line read from run 1" \
    "$(spawn - --fn add "$d/mixb/driver.js" "$d/mixa/driver.js")|$(cat "$fk/mixb.n" 2>/dev/null)+$(cat "$fk/mixa.n" 2>/dev/null)|$(has 'tier    add  before  deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at drv-deopt.js:1:31')$(has 'tier    add  after  deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at drv-deopt.js:1:31')" \
    "2|VERDICT NO-VERDICT|8|3+3|11"
  check "T11 A9 (2) N6: TIER_AWK prints 'tier    add  x  PARTIAL' then exits 5 -> no PARTIAL line, 'unreadable (awk exited 5)' per side; rc, VERDICT, spawns, non-tier lines unchanged" \
    "$(spawn "PATH=$d/tap:$PATH" --fn add "$d/mx/driver.js" "$d/dx/driver.js")|$(grep -c -e PARTIAL "$d/sp.out" || true)|$(uw 5)|$(sm)" "1|VERDICT DIFF|8|0|11|same"
  got=""
  for x in taf tam tab; do got="$got#$(spawn "PATH=$d/$x:$PATH" --fn add "$d/mx/driver.js" "$d/dx/driver.js")|$(grep -c -e FOREIGN -e '  x  ' "$d/sp.out" || true)|$(uw 0)"; done
  check "T12 A9 (1) N7: TIER_AWK exits 0 after a tier line + a foreign line, a 3-space 'tier' line between 2 tier lines, or a tier line + an empty line -> no shim line, 'unreadable (awk exited 0)' per side" \
    "$got" "#1|VERDICT DIFF|8|0|11#1|VERDICT DIFF|8|0|11#1|VERDICT DIFF|8|0|11"
  check "T13 A9 (2) gv-cmp sub-check 8: before run 1 exits 3 -> the after side still reads its own run 1: 'tier    add  after  compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0'" \
    "$(grep -c -F -x -e 'tier    add  after  compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0' "$d/rc3.out" || true)" "1"
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
  rf "a non-flag in --v8-flags" "--v8-flags takes flags only (each starts with -- and a letter), got 'x.js'" --fn add --v8-flags=x.js "$D1" "$D2"
  rf "unknown option" "unknown option --nod (did you mean --node?)" --fn add --nod x "$D1" "$D2"
  rf "a trace-file-names flag in --v8-flags" "--v8-flags must not set --trace_file_names: it changes the <JSFunction NAME" \
    --fn add --v8-flags=--trace_file_names "$D1" "$D2"

  # --- ref / file modes end to end (lib/stage.sh): a temp git repo $d/st/R (m/trace.txt: r1 = T_MONO, r2 = T_DEOPT; a
  # driver.js importing './trace.txt'); the fake node cats ./trace.txt from cwd = OUT/stage/<side>. tg isolates every
  # git call (no editor, no global / system config, no hooks, no signing, the six GIT_* vars stage_check refuses
  # unset) and sspawn runs this script with those six unset too, so the rows also run from inside a git hook. With no
  # git on PATH, or a failed repo set-up, the 23 rows (S1-S4, R1-R17, GT1-GT2) are ONE FAIL line ---
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
    check "ref / file modes: git on PATH (the 23 staged rows S1-S4, R1-R17, GT1-GT2 need git; no git fails closed)" "git not found on PATH" "git found"
  elif [[ $sr != 0 ]]; then
    check "ref / file modes: temp git repo set up (init, commits r1 r2, tags r1 r2)" "git exited $sr: $(tail -n 1 "$g/git.log")" "ok"
  else
    RR=(--module m/trace.txt --driver "$R/driver.js" --repo "$R")
    check "S1 ref mode (temp git repo): --before-ref r1 --after-ref r2 -> exit 1 DIFF, 8 spawns, the before=0 after=1 line, 'mode    diff (ref)  runs 3', no NOTE" \
      "$(sspawn - --out "$g/s1" --fn add --before-ref r1 --after-ref r2 "${RR[@]}")|$(has '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)')|$(has 'mode    diff (ref)  runs 3  v8 flags --trace-deopt-verbose --trace-opt --no-concurrent-recompilation')|$(grep -c -e '^NOTE ' "$d/sp.out" || true)" \
      "1|VERDICT DIFF|8|1|1|0"
    check "S2 ref mode: --before-ref r1 --after-ref r1 (byte-identical modules) -> exit 0 SAME plus the exact null-control NOTE" \
      "$(sspawn - --out "$g/s2" --fn add --before-ref r1 --after-ref r1 "${RR[@]}")|$(has 'NOTE    before and after modules are byte-identical: this run is a null control (expect SAME)')" \
      "0|VERDICT SAME|8|1"
    # a tee shim rewrites the live --after to the r1 text while before run 2 (driver run 3) runs: after runs 2 and 3
    # still read the staged r2 copy, so a stage that aliased the live file would fail the after null control
    printf '%s\n' "#!$BASH" "for a; do case \"\$a\" in */raw/before/run.2.txt) cp $(printf '%q' "$frz") $(printf '%q' "$R/m/trace.txt") || exit 9 ;; esac; done" \
      "exec $(command -v tee) \"\$@\"" >"$g/shim4/tee"
    chmod +x "$g/shim4/tee"
    check "S3 file mode: --before a FROZEN r1 copy, --after the live tracked r2 file (rewritten to r1 at driver run 3) -> exit 1 DIFF; OUT holds exactly 11 files" \
      "$(sspawn "PATH=$g/shim4:$PATH" --out "$g/s3" --fn add --before "$frz" --after "$R/m/trace.txt" --driver "$R/driver.js")|$(find "$g/s3" -type f | wc -l | tr -d ' ')|$(cmp -s "$frz" "$R/m/trace.txt" && echo rewritten || echo kept)" \
      "1|VERDICT DIFF|8|11|rewritten"
    printf '%s\n' "$T_DEOPT" >"$R/m/trace.txt"
    check "S4 ref mode (MD-16): --before-ref r1 --after-ref r1 plus an after-only deopt -> exit 2, the DIFF line, then the byte-identical NO-VERDICT line" \
      "$(sspawn "FAKE_AFTER_EXTRA=$g/extra.txt" --out "$g/s4" --fn add --before-ref r1 --after-ref r1 "${RR[@]}")|$(has '  add: DIFF -- deopt multiset differs (before 0 | after 1)')|$(has '  NO-VERDICT -- before and after modules are byte-identical: the DIFF is run-to-run noise')" \
      "2|VERDICT NO-VERDICT|8|1|1"
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
    # D1: d1/L -> d1/real/sub, so d1/L/../driver.js is d1/real/driver.js to the kernel (imports ./trace.txt) and the
    # DECOY d1/driver.js to bash's logical cd, which stage_write would copy
    mkdir -p "$g/d1/real/sub"; ln -s "$g/d1/real/sub" "$g/d1/L"
    printf '%s\n' "import './trace.txt';" >"$g/d1/real/driver.js"; printf '%s\n' '// DECOY' >"$g/d1/driver.js"
    srf "R15: a decoy --driver (DIR/L/../driver.js, L a symlink to DIR/real/sub)" \
      "--driver: cannot resolve the directory of $g/d1/L/../driver.js (a symlink before '..'?)" \
      "$g/r15" - --out "$g/r15" --fn add --before-ref r1 --after-ref r2 --module m/trace.txt --driver "$g/d1/L/../driver.js" --repo "$R"
    # D6: a case-insensitive file system would stage the module TRACE.TXT and the driver trace.txt as one file
    mkdir -p "$g/d6/drv"; printf '%s\n' "$T_DEOPT" >"$g/d6/TRACE.TXT"; printf '%s\n' "import './TRACE.TXT';" >"$g/d6/drv/trace.txt"
    srf "R16: --after TRACE.TXT with --driver trace.txt (the same file name up to case)" \
      "the module and --driver have the same file name up to case (TRACE.TXT / trace.txt): rename the driver" \
      "$g/r16" - --out "$g/r16" --fn add --before "$frz" --after "$g/d6/TRACE.TXT" --driver "$g/d6/drv/trace.txt"
    # Q-DD6a (i): APFS folds Unicode case and NFC / NFD, so an NFC-named module and an NFD-named driver would stage as
    # one file: a byte outside printable ASCII in either name is refused (both names built from printf octal escapes)
    local nfc nfd; nfc="tr$(printf '\303\251')ce.txt"; nfd="tre$(printf '\314\201')ce.txt"
    mkdir -p "$g/du/drv"; printf '%s\n' "$T_DEOPT" >"$g/du/$nfc"; printf '%s\n' "import './$nfc';" >"$g/du/drv/$nfd"
    srf "R17: --after an NFC-named module with an NFD-named --driver (non-ASCII file names)" \
      "the module or --driver file name has a non-ASCII byte ($nfc / $nfd): rename it" \
      "$g/r17" - --out "$g/r17" --fn add --before "$frz" --after "$g/du/$nfc" --driver "$g/du/drv/$nfd"
    # GT1 (G-TRACKED, lib/tracked.sh): a tracked --before in a copy of the repo that git cannot read (a garbage .git
    # file, a gitfile to a missing dir, a bad config line, an index cut to 10 bytes) is a git error, never "untracked"
    local gt=""
    for x in gitfile gitmiss config index; do
      cp -R "$R" "$g/gt-$x"
      case $x in
        gitfile) rm -rf "$g/gt-$x/.git"; printf 'garbage\n' >"$g/gt-$x/.git" ;;
        gitmiss) rm -rf "$g/gt-$x/.git"; printf 'gitdir: %s\n' "$g/gt-none" >"$g/gt-$x/.git" ;;
        config) printf '[core\n' >>"$g/gt-$x/.git/config" ;;
        index) head -c 10 "$R/.git/index" >"$g/gt-$x/.git/index" ;;
      esac
      gt="$gt$(sspawn - --out "$g/gto-$x" --fn add --before "$g/gt-$x/m/trace.txt" --after "$frz" --driver "$R/driver.js")|$(grep -c -F -e "deopt-diff: --before: git failed while checking whether $g/gt-$x/m/trace.txt is tracked (" "$d/sp.out" || true)|$([[ -e "$g/gto-$x" ]] && echo OUT || echo no OUT) "
    done
    check "GT1 file mode refused before any spawn: a tracked --before in a repo copy git cannot read (a garbage .git file, a gitfile to a missing dir, a bad config line, an index cut to 10 bytes) -> each exit 2, 0 spawns, 'git failed while checking whether' once, no OUT" \
      "$gt" "2|VERDICT NO-VERDICT|0|1|no OUT 2|VERDICT NO-VERDICT|0|1|no OUT 2|VERDICT NO-VERDICT|0|1|no OUT 2|VERDICT NO-VERDICT|0|1|no OUT "
    # GT2: an untracked --before inside the repo (git answers "did not match") is a FROZEN copy: accepted
    mkdir -p "$R/u"; cp "$frz" "$R/u/trace.txt"
    check "GT2 file mode: an untracked --before inside the repo (r1, T_MONO) --after the live tracked m/trace.txt (r2, T_DEOPT) -> accepted: exit 1 DIFF, 8 spawns, the before=0 after=1 line" \
      "$(sspawn - --out "$g/gt2" --fn add --before "$R/u/trace.txt" --after "$R/m/trace.txt" --driver "$R/driver.js")|$(has '    before=0 after=1  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" \
      "1|VERDICT DIFF|8|1"
  fi

  # --- MD-36 / MD-37 (ext-audit B-four dd): --out DIR whose raw/ is a symlink, or whose report.txt has another hard link ---
  mkdir -p "$d/o36" "$d/e36"; ln -s "$d/e36" "$d/o36/raw"
  rf "MD-36 --out DIR whose raw/ is a symlink to an empty dir" "/o36/raw is a symlink (refused: the writes would follow it)" \
    --fn add --out "$d/o36" "$D1" "$D2"
  mkdir -p "$d/o37"; printf 'KEEP\n' >"$d/o37/report.txt"; ln "$d/o37/report.txt" "$d/h37"
  rf "MD-37 --out DIR whose report.txt has a second hard link" \
    "/o37/report.txt has another hard link (refused: the write would change that file too)" --fn add --out "$d/o37" "$D1" "$D2"

  # --- MD-39 (ext-audit A13): a --v8-flags flag that loads environment variables or node options from a file ---
  local o=""
  for x in --env-file=F --env_file=F --env-file-if-exists=F --experimental-config-file=F --experimental-default-config-file=F; do
    o="$o#$(spawn - --fn add "--v8-flags=--allow-natives-syntax $x" "$D1" "$D2")|$(grep -c -F -e "deopt-diff: --v8-flags must not set $x: it loads environment variables or node options from a file" "$d/sp.out" || true)"
  done
  check "MD-39 refused before any spawn: --v8-flags --env-file=F / --env_file=F / --env-file-if-exists=F / --experimental-config-file=F / --experimental-default-config-file=F (environment or node options loaded from a file) -> exit 2, 0 spawns" \
    "$o" "#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1"

  # --- MD-42 (ext-audit A15): a --v8-flags flag that loads a module of yours (a prefix match) ---
  o=""
  for x in --loader=F --loader --experimental-loader=F --experimental_loader=F --require-module --import=F --require=F; do
    o="$o#$(spawn - --fn add "--v8-flags=--allow-natives-syntax $x" "$D1" "$D2")|$(grep -c -F -e "deopt-diff: --v8-flags must not set $x: it loads a module of yours into the measured process" "$d/sp.out" || true)"
  done
  check "MD-42 refused before any spawn: --v8-flags --loader=F / --loader / --experimental-loader=F / --experimental_loader=F / --require-module / --import=F / --require=F (a module of yours; a prefix match) -> exit 2, 0 spawns" \
    "$o" "#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1"

  # --- MD-44 / MD-47 (ext-audit A17): a --v8-flags flag that runs code of yours in place of the driver, or V8's --print-* ---
  o=""
  for x in --eval=F --eval --print=F --print --print-bytecode; do
    o="$o#$(spawn - --fn add "--v8-flags=--allow-natives-syntax $x" "$D1" "$D2")|$(grep -c -F -e "deopt-diff: --v8-flags must not set $x: it runs code of yours in the measured process" "$d/sp.out" || true)"
  done
  check "MD-44 refused before any spawn: --v8-flags --eval=F / --eval / --print=F / --print / --print-bytecode (code run instead of the driver, or V8 internals printed into the run; a prefix match) -> exit 2, 0 spawns" \
    "$o" "#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1#2|VERDICT NO-VERDICT|0|1"

  # --- Q-ENV: the 4 env vars a node reads at start are unset at the top of this script (the fake exits 7 on any) ---
  check "Q-ENV e2e: NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS set in the environment reach no spawn (mono vs mono SAME, 8 spawns); the head names all four" \
    "$(export NODE_V8_COVERAGE="$d/cov" NODE_COMPILE_CACHE="$d/cc" NODE_REDIRECT_WARNINGS="$d/warn.txt"; spawn NODE_OPTIONS=--st-probe --fn add "$D1" "$D1")|$(has "deopt-diff  node v26.8.2  $fk/node  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)")" \
    "0|VERDICT SAME|8|1"
  # --- T14 (D5): node 22 prints `(target TURBOFAN)` where node 26 prints `(target TURBOFAN_JS)`; the ops window reads both ---
  check "T14 D5 ops window on node 22's '(target TURBOFAN)' and '(target TURBOFAN) OSR': 1 2 TF 3 -> 'after op 2, before op 3'; the control '(target TURBOFANX)' -> 'not compiled in run 1'" \
    "$(tie add "$PRE"$'\n'"$(mko 1 2)"$'\n'"${E9/(target TURBOFAN_JS)/(target TURBOFAN)}"$'\n'"$(mko 3)" '$')$(tie add "$PRE"$'\n'"$(mko 1 2)"$'\n'"${E9/(target TURBOFAN_JS)/(target TURBOFAN) OSR}"$'\n'"$(mko 3)" '$')$(tie add "$PRE"$'\n'"$(mko 1 2)"$'\n'"${E9/(target TURBOFAN_JS)/(target TURBOFANX)}"$'\n'"$(mko 3)" '$')" \
    "ops until TURBOFAN_JS: after op 2, before op 3;ops until TURBOFAN_JS: after op 2, before op 3;ops until TURBOFAN_JS: not compiled in run 1 (last marker op 3);"

  # --- S-9 real-trace fixtures (--fixtures DIR, the node v26.8.2 set in test/fixtures/deopt-diff/node-26.8.2): F1-F17.
  # Expected values are that README's grep census; trace lines are picked by fn name (never by counting or indexing
  # MAGLEV or separator lines). Each file is read by redirection only; a missing or unreadable one is one more
  # `FAIL fixture <file>` line, and the rows reading it get empty text (some fail too). F12 / F13 run this script
  # on fixture copies served by the fake node above (0 real-node spawns) ---
  if [[ -n "$FIXTURES" ]]; then
    local FXD FXM FXA FXB FXC FXO FXE FXF nb ndx
    for x in deopt mono a-lazy b-invalidate c-inlined d-osr e-getter f-marks; do
      [[ -f "$FIXTURES/$x.txt" && -r "$FIXTURES/$x.txt" ]] || check "fixture $x.txt" "missing or not a readable file" "a readable file"
    done
    fxt() { if [[ -f "$FIXTURES/$1.txt" && -r "$FIXTURES/$1.txt" ]]; then cat <"$FIXTURES/$1.txt"; fi; }
    fdx() { printf '%s\n' "$2" | awk -v fn="$1" "$DEOPT_AWK" | grep -c -e '^D ' -e '^X ' || true; }
    FXD=$(fxt deopt); FXM=$(fxt mono); FXA=$(fxt a-lazy); FXB=$(fxt b-invalidate)
    FXC=$(fxt c-inlined); FXO=$(fxt d-osr); FXE=$(fxt e-getter); FXF=$(fxt f-marks)
    check "fixture F1 deopt.txt: fn=add -> exactly 'E add@TURBOFAN_JS' and 'D add@TURBOFAN_JS<TAB>deopt-eager (not a Smi)'" \
      "$(rec add "$FXD")" "E add@TURBOFAN_JS;D add@TURBOFAN_JS|deopt-eager (not a Smi);"
    check "fixture F2 mono.txt: fn=add -> exactly 'E add@TURBOFAN_JS' (no bailout)" "$(rec add "$FXM")" "E add@TURBOFAN_JS;"
    check "fixture F3 a-lazy.txt: fn=lazyFn -> its E and the lazy D (reason with parens); the marking-dependent-code line gives none" \
      "$(rec lazyFn "$FXA")" "E lazyFn@TURBOFAN_JS;D lazyFn@TURBOFAN_JS|deopt-lazy ((unknown));"
    check "fixture F4 b-invalidate.txt: fn=offFn -> only its E (the one marking-dependent-code line naming offFn gives no D)" \
      "$(printf '%s\n' "$FXB" | grep -c -F -e '<SharedFunctionInfo offFn>' || true)|$(rec offFn "$FXB")" "1|E offFn@TURBOFAN_JS;"
    check "fixture F5 c-inlined.txt: fn=outer -> its E and D; fn=inner (named on 2 frame-dump lines) -> 0 records" \
      "$(rec outer "$FXC")#$(printf '%s\n' "$FXC" | grep -c -F -e '<JSFunction inner (sfi = ' || true)|$(rec inner "$FXC")" \
      "E outer@TURBOFAN_JS;D outer@TURBOFAN_JS|deopt-eager (not a Smi);#2|"
    check "fixture F6 d-osr.txt: fn=loopFn -> exactly 'E loopFn@MAGLEV-OSR' (the compiling-method OSR line gives none)" \
      "$(rec loopFn "$FXO")" "E loopFn@MAGLEV-OSR;"
    check "fixture F7 e-getter.txt: fn='get value' -> its E and D (out of bounds)" \
      "$(rec 'get value' "$FXE")" "E get value@TURBOFAN_JS;D get value@TURBOFAN_JS|deopt-eager (out of bounds);"
    check "fixture F8 e-getter.txt: exact names -- fn=value and fn=get -> 0 records each" "$(rec value "$FXE")#$(rec get "$FXE")" "#"
    check "fixture F9 f-marks.txt: fn=add -> exactly 'E add@TURBOFAN_JS' (the 10 marker lines give none)" "$(rec add "$FXF")" "E add@TURBOFAN_JS;"
    check "fixture F10 deopt.txt: exact names -- fn=ad and fn=addX -> 0 records each" "$(rec ad "$FXD")#$(rec addX "$FXD")" "#"
    nb=$(printf '%s\n' "$FXD" "$FXM" "$FXA" "$FXB" "$FXC" "$FXO" "$FXE" "$FXF" | grep -c -e '^\[bailout (' || true)
    ndx=$(( $(fdx add "$FXD") + $(fdx add "$FXM") + $(fdx lazyFn "$FXA") + $(fdx offFn "$FXB") + $(fdx outer "$FXC") \
      + $(fdx loopFn "$FXO") + $(fdx 'get value' "$FXE") + $(fdx add "$FXF") ))
    check "fixture F11 all 8 files: line-start '[bailout (' lines == D + X records of each file's fn (add add lazyFn offFn outer loopFn 'get value' add)" \
      "$nb|$ndx" "4|4"
    mkdir -p "$d/fxd" "$d/fxd2" "$d/fxm"
    for x in fxd fxd2 fxm; do : >"$d/$x/driver.js"; done
    fxt deopt >"$d/fxd/trace.txt"; fxt deopt >"$d/fxd2/trace.txt"; fxt mono >"$d/fxm/trace.txt"
    check "fixture F12 e2e (the fake node serving deopt.txt | mono.txt): --fn add -> exit 1 DIFF, 8 spawns, 'before=1 after=0  [add@TURBOFAN_JS] deopt-eager (not a Smi)'" \
      "$(spawn - --fn add "$d/fxd/driver.js" "$d/fxm/driver.js")|$(has '  add: DIFF -- deopt multiset differs (before 1 | after 0)')|$(has '    before=1 after=0  [add@TURBOFAN_JS] deopt-eager (not a Smi)')" \
      "1|VERDICT DIFF|8|1|1"
    check "fixture F13 e2e (the fake node serving deopt.txt | a copy): --fn add -> exit 0 SAME (before 1 | after 1), 8 spawns" \
      "$(spawn - --fn add "$d/fxd/driver.js" "$d/fxd2/driver.js")|$(has '  add: SAME -- identical deopt multiset (before 1 | after 1)')" "0|VERDICT SAME|8|1"
    check "fixture F14 f-marks.txt tier lines: fn=add -> TURBOFAN_JS 1, 'cycles 0: TURBOFAN_JS', 'ops until TURBOFAN_JS: after op 50, before op 60'" \
      "$(tie add "$FXF")" \
      "compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0;cycles 0: TURBOFAN_JS;ops until TURBOFAN_JS: after op 50, before op 60;"
    check "fixture F15 deopt.txt tier lines: fn=add -> the deopt at offset 2, 'at deopt.mjs:2:31', 'after op 2, before op 3'" \
      "$(tie add "$FXD")" \
      "compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0;cycles 0: TURBOFAN_JS > deopt;deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at deopt.mjs:2:31;ops until TURBOFAN_JS: after op 2, before op 3;"
    check "fixture F16 c-inlined.txt tier lines: fn=outer -> 'at c-inlined.mjs:2:33 inlined at c-inlined.mjs:3:31'" \
      "$(tie outer "$FXC")" \
      "compiles MAGLEV 0, MAGLEV-OSR 0, TURBOFAN_JS 1, TURBOFAN_JS-OSR 0;cycles 0: TURBOFAN_JS > deopt;deopt 1/1: TURBOFAN_JS deopt-eager (not a Smi), bytecode offset 2, at c-inlined.mjs:2:33 inlined at c-inlined.mjs:3:31;ops until TURBOFAN_JS: no @@LITE-MARK op lines;"
    check "fixture F17 d-osr.txt tier lines: fn=loopFn -> 'MAGLEV-OSR 1', 'cycles 0: MAGLEV-OSR'" \
      "$(tie loopFn "$FXO")" \
      "compiles MAGLEV 0, MAGLEV-OSR 1, TURBOFAN_JS 0, TURBOFAN_JS-OSR 0;cycles 0: MAGLEV-OSR;ops until TURBOFAN_JS: no @@LITE-MARK op lines;"
  fi

  rm -rf "$d"
  if [[ -n "$old" ]]; then trap -- "$old" EXIT; else trap - EXIT; fi
  echo
  if [[ $fails -eq 0 && $oks -gt 0 ]]; then echo "self-test: $oks check(s) ok"; return 0; fi
  echo "self-test: $((fails > 0 ? fails : 1)) check(s) FAILED"; return 1
}

# ---------------------------------------------------------------------------------------------
# options (every check below runs before any node is spawned and before any disk write; the --v8-flags allowlist,
# lib/v8flags.sh, runs after the --version spawn, at the marker line below)
# ---------------------------------------------------------------------------------------------
FNLIST=""; RUNS=3; NODE_BIN="${NODE:-node}"; V8FLAGS=""; OUT=""; SELFTEST=0; FIXTURES=""; POS=(); GOTOPT=" "; REPORT=/dev/null
BEFORE_REF=""; AFTER_REF=""; BEFORE_FILE=""; AFTER_FILE=""; MODULE=""; DRIVER=""; REPO=""; STAGED=0; STAGE_SAME=0
OPTS="--fn --runs --node --v8-flags --out --self-test --help --before-ref --after-ref --before --after --module --driver --repo"
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
    --fn|--runs|--node|--v8-flags|--out|--fixtures|--before-ref|--after-ref|--before|--after|--module|--driver|--repo)
      [[ "$GOTOPT" != *" $a "* ]] || die "$a given twice (give one comma list)"
      GOTOPT="$GOTOPT $a "
      if [[ $EQ -eq 0 ]] && ! need "$@"; then shift; fi
      [[ -n "$v" ]] || die "$a needs a non-empty value"
      case "$a" in
        --fn) FNLIST="$v" ;; --runs) RUNS="$v" ;; --node) NODE_BIN="$v" ;; --v8-flags) V8FLAGS="$v" ;; --out) OUT="$v" ;;
        --fixtures) FIXTURES="$v" ;;
        --before-ref) BEFORE_REF="$v" ;; --after-ref) AFTER_REF="$v" ;; --before) BEFORE_FILE="$v" ;; --after) AFTER_FILE="$v" ;;
        --module) MODULE="$v" ;; --driver) DRIVER="$v" ;; --repo) REPO="$v" ;;
      esac ;;
    -*) die "unknown option $a$(hint "$a") (see --help)" ;;
    *) POS+=("$a") ;;
  esac
  shift
done

if [[ $SELFTEST == 1 ]]; then
  [[ ( -z "${GOTOPT// /}" || "$GOTOPT" == "  --fixtures " ) && ${#POS[@]} -eq 0 ]] || die "--self-test takes only --fixtures DIR"
  if [[ -n "$FIXTURES" ]]; then
    [[ "$FIXTURES" != *$'\n'* ]] || die "--fixtures: a newline is not allowed"
    [[ -d "$FIXTURES" && -r "$FIXTURES" && -x "$FIXTURES" ]] || die "--fixtures: not a readable directory: $FIXTURES"
  fi
  if self_test; then FINAL=1; exit 0; else FINAL=1; exit 1; fi
fi
[[ -z "$FIXTURES" ]] || die "--fixtures goes with --self-test"
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
  [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
  g="${f//_/-}"
  case "$g" in
    *trace-deopt*|*trace-opt*|*concurrent-recompilation*)
      die "--v8-flags must not set $f: the script sets --trace-deopt-verbose --trace-opt --no-concurrent-recompilation itself" ;;
    *trace-file-names*)
      die "--v8-flags must not set $f: it changes the <JSFunction NAME (sfi = ...)> text the records are read from" ;;
    --require*|--import*|--loader*|--experimental-loader*)
      die "--v8-flags must not set $f: it loads a module of yours into the measured process (a preload or a module loader)" ;;
    --env-file*|--experimental-config-file*|--experimental-default-config-file*)
      die "--v8-flags must not set $f: it loads environment variables or node options from a file (e.g. a NODE_OPTIONS preload) into the measured process" ;;
    --eval*|--print*)
      die "--v8-flags must not set $f: it runs code of yours in the measured process instead of the driver (--eval / --print: node evaluates it and the driver becomes argv), or prints V8 internals into the measured run (V8's --print-* flags)" ;;
  esac
done
[[ "$OUT" != -* ]] || OUT="./$OUT"
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
# resolve the binary ONCE, from the caller's cwd: every spawn (--version, the --v8-options read, each run in its
# driver dir) runs this absolute path, so a relative PATH entry can never pick a different node per cwd. A name with a
# slash is a path (never looked up on PATH): it goes straight to the -f / -x check, so a directory is named as such
NODE_RES=$NODE_BIN
if [[ "$NODE_BIN" != */* ]]; then NODE_RES=$(command -v -- "$NODE_BIN" 2>/dev/null) || die "node binary not found: $NODE_BIN"; fi
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH (a function, alias or builtin?): $NODE_BIN -> $NODE_RES"
[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
NODE_DIR=$(dirname -- "$NODE_RES"); [[ "$NODE_DIR" != - ]] || NODE_DIR=./-
NODE_DIR=$(cd -- "$NODE_DIR" 2>/dev/null && pwd) || die "node binary: cannot resolve the directory of $NODE_RES"
NODE_BIN="${NODE_DIR%/}/$(basename -- "$NODE_RES")"
[[ "$NODE_BIN" -ef "$NODE_RES" ]] || die "node binary is not an executable file: $NODE_RES"
[[ "$NODE_BIN" != *$'\n'* ]] || die "node binary: a newline is not allowed in the resolved path"
if [[ $STAGED == 0 ]]; then
  DRV_B_DIR=$(cd -- "$(dirname -- "${POS[0]}")" && pwd); DRV_B_BASE=$(basename -- "${POS[0]}")
  DRV_A_DIR=$(cd -- "$(dirname -- "${POS[1]}")" && pwd); DRV_A_BASE=$(basename -- "${POS[1]}")
  [[ "$DRV_B_DIR/$DRV_B_BASE" -ef "${POS[0]}" ]] || die "DRIVER (before): cannot resolve the directory of ${POS[0]} (a symlink before '..'?)"
  [[ "$DRV_A_DIR/$DRV_A_BASE" -ef "${POS[1]}" ]] || die "DRIVER (after): cannot resolve the directory of ${POS[1]} (a symlink before '..'?)"
  DESC_B="${DRV_B_DIR%/}/$DRV_B_BASE  sha256/8 $(sha8 "$DRV_B_DIR/$DRV_B_BASE")"
  DESC_A="${DRV_A_DIR%/}/$DRV_A_BASE  sha256/8 $(sha8 "$DRV_A_DIR/$DRV_A_BASE")"
fi

# --- every refusal but the --v8-flags allowlist is above this line; spawns start here: --version, then the --v8-options read (lib/v8flags.sh: an allowlist refusal exits 2 there), then disk writes (--out only), then the runs ---
GOT_VER=$(env -u NODE_OPTIONS "$NODE_BIN" --version 2>/dev/null) || die "cannot run $NODE_BIN --version"
v8fl_check "$NODE_BIN"   # lib/v8flags.sh: ONE --v8-options read, then the --v8-flags allowlist (MD-50..58)
if [[ -n "$OUT" ]]; then
  mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" 2>/dev/null || die "--out: cannot create $OUT/raw/before and $OUT/raw/after"
  # keep the logical OUT name when it is the same directory as the given OUT, else print the physical one
  OUT_L=$(cd -- "$OUT" && pwd); [[ "$OUT_L" -ef "$OUT" ]] || OUT_L=$(cd -P -- "$OUT" && pwd -P); OUT=$OUT_L
  REPORT="$OUT/report.txt"; { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"   # backstop: a write that races the check
fi
MODE=diff
if [[ $STAGED == 1 ]]; then
  stage_write   # lib/stage.sh: OUT/stage/before and OUT/stage/after, each the module + the driver
  DRV_B_DIR=$(dirname -- "$DRV_B"); DRV_B_BASE=$(basename -- "$DRV_B")
  DRV_A_DIR=$(dirname -- "$DRV_A"); DRV_A_BASE=$(basename -- "$DRV_A")
  MODE="diff ($STAGE_MODE)"
fi
say "deopt-diff  node $GOT_VER  $NODE_BIN  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
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
# runs: k = 1..R, before then after; each keeps its driver exit and its kept lines (KEEP_AWK) (raw output to --out only)
# ---------------------------------------------------------------------------------------------
RUN_RC=0; RUN_TX=""
run_side() { # dir base rawfile: one node run of dir/base; sets RUN_RC (the driver exit, or "<tee|tr|awk> <rc>") RUN_TX
  local tx st n t r a
  # the pipeline's four exits (node, tee, tr, awk) ride on a last "@ n t r a" line, so a tee / tr / awk failure is
  # never reported as the driver's exit. tr turns each NUL into `?` before awk (BSD awk cuts a line at a NUL, which
  # would drop a `[bailout` glued after it); DEOPT_AWK then reads the glue as X "trace text not at line start"
  tx=$( (cd -- "$1" && env -u NODE_OPTIONS "$NODE_BIN" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "./$2" 2>&1) \
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
say "tier    REPORTED: run 1 of each side, never part of the verdict"   # A5: in every report that reaches VERDICT
for fn in "${TARGETS[@]}"; do
  tier_fn "$fn" before "${RCB[0]}" "${TXB[0]}"; tier_fn "$fn" after "${RCA[0]}" "${TXA[0]}"
done
say ""
say "VERDICT $VERDICT"
FINAL=1; case "$VERDICT" in SAME) exit 0 ;; DIFF) exit 1 ;; *) exit 2 ;; esac
