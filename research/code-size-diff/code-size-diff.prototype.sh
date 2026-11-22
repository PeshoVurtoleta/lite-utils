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
#   - self-test (--self-test): canned --log-code traces through CODESIZE_AWK, judge,
#       TURBOLEV_AWK, and lib/v8flags.sh v8fl_ok allowlist checks
#
# Architectural note on promotion to src/code-size-diff.sh:
#   The [PROTOTYPE SHIMS] sections below stand in for LiteUtils's build-time `# @include lib/*.sh`
#   fragments (prologue, msdiff, common, tracked, v8flags, args, stage) so this prototype runs
#   standalone directly from research/code-size-diff/.

# =============================================================================================
# [PROTOTYPE SHIMS] -- replaced by `# @include lib/prologue.sh` in src/code-size-diff.sh
# =============================================================================================
# WHY strict mode + nocasematch + posix + LC_ALL=C:
#   - `shopt -u nocasematch` prevents inherited BASHOPTS=nocasematch (bash >= 4.1) from folding
#     uppercase/lowercase keys into false SAME (LEDGER #121 / ic-fable-1).
#   - `set +o posix` (only when set) restores `<( )` process substitution on bash 3.2 without
#     disabling expand_aliases unconditionally.
#   - `LC_ALL=C` enforces byte-wise sort / awk / regex ranges across macOS and Linux locales.
set -euo pipefail
shopt -u nocasematch 2>/dev/null || true
[[ ! -o posix ]] || set +o posix
export LC_ALL=C

# WHY fail-closed EXIT trap (LiteUtils Law #5):
#   Every planned exit 0 (SAME / WITHIN / OK) or exit 1 (DIFF / OVER) sets FINAL=1 first.
#   Any unplanned abort -- including bash 3.2's quirk where `set -u` can exit 0 -- is coerced
#   to exit 2 (NO-VERDICT) so a script error can NEVER masquerade as SAME or DIFF.
FINAL=""
DIED=""
SIG_PID=""
DRV_RC=0
TMP_DIR=""
REPORT=""
trap 'rc=$?; if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf -- "$TMP_DIR"; fi; if [[ -z "$FINAL" ]]; then set +e; [[ -n "$DIED" ]] || printf "code-size-diff: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT

# WHY SIGINT / SIGTERM / SIGHUP kills only the active driver pid (never bare `wait`):
#   On bash >= 5, bare `wait` also waits for open `< <( )` subshells that nobody drains inside
#   the trap, causing a hang (LEDGER lib-opus-c-1). SIGKILLing $SIG_PID + $(jobs -pr) guarantees
#   a bounded exit and ensures partial driver output is never parsed.
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

# WHY worst() lattice: NO-VERDICT dominates DIFF/OVER, which dominates SAME/WITHIN/OK.
worst() {
  case "$1:$2" in
    *NO-VERDICT*) echo NO-VERDICT ;;
    *DIFF*|*OVER*)
      case "$1" in DIFF|OVER) echo "$1" ;; *) echo "$2" ;; esac ;;
    *) echo "$2" ;;
  esac
}

# =============================================================================================
# [PROTOTYPE SHIMS] -- replaced by `# @include lib/msdiff.sh` in src/code-size-diff.sh
# =============================================================================================
# WHY multiset (`sort | uniq -c`, never `sort -u`, LiteUtils Law #2):
#   A function that compiles Maglev 348 B once vs one that compiles Maglev 348 B, deopts, and
#   recompiles Maglev 392 B MUST produce a DIFF. Collapsing to `max` / `last` hides recompile churn.
multiset() { LC_ALL=C sort | LC_ALL=C uniq -c; }

# WHY FILENAME == ARGV[1] (never FNR == NR): empty BEFORE file must not hijack AFTER lines.
# Matches lib/msdiff.sh verbatim.
# shellcheck disable=SC2016
MSDIFF_AWK='
function key(s) { sub(/^ *[0-9]+ /, "", s); return s }
function show(k,   u, l) { u = k; sub(/\t.*/, "", u); l = k; sub(/^[^\t]*\t/, "", l); return (u == "*") ? l : "[" u "] " l }
FILENAME == ARGV[1] { k = key($0); b[k] = $1 + 0; all[k] = 1; next }
{ k = key($0); a[k] = $1 + 0; all[k] = 1 }
END { for (k in all) if (b[k] + 0 != a[k] + 0) printf "  before=%d after=%d  %s\n", b[k], a[k], show(k) }
'

# =============================================================================================
# [PROTOTYPE SHIMS] -- replaced by `# @include lib/v8flags.sh` in src/code-size-diff.sh
# =============================================================================================
# WHY runtime `--v8-options` ALLOWLIST (LEDGER law 4 / MD-50..58), NEVER a denylist alone:
#   A denylist silently accepts unknown flags, node CLI options (--run, --test, --eval,
#   --inspect, --cpu-prof), string-valued V8 flags (--sparkplug-filter=...), and non-bool
#   --no-* flags. Reading `node --v8-options` once and allowing ONLY known non-string,
#   non-tracing V8 tuning flags of THIS node binary fails closed by default.
# Matches lib/v8flags.sh verbatim; also saves V8_OPTS_RAW so TURBOLEV_AWK reuses the same spawn.
# shellcheck disable=SC2016
V8FL_AWK='
p != "" { if (match($0, /^ +type: [a-z0-9_]+/)) { t = substr($0, RSTART, RLENGTH); sub(/^ +type: /, "", t); print p " " t }; p = "" }
/^  --[a-z0-9_-]+ \(/ { p = $1; sub(/^--/, "", p); gsub(/_/, "-", p) }
'
V8FL_RE='-(log|logfile|prof|profile|profiling|profiler|trace|print|perf|redirect|dump|stats|verbose|snapshot|gdbjit|counters|help|abort|fuzzing|file|logger)-'
V8FL_TAB=""
V8_OPTS_RAW=""
v8fl_read() { # NODE: sets V8_OPTS_RAW and V8FL_TAB from ONE `NODE --v8-options` capture
  local rows rc=0
  V8_OPTS_RAW=$(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS "$1" --v8-options 2>/dev/null) || rc=$?
  [[ $rc -eq 0 ]] || die "cannot run $1 --v8-options"
  [[ -n "$V8_OPTS_RAW" ]] || die "$1 --v8-options printed nothing"
  rows=$(printf '%s\n' "$V8_OPTS_RAW" | LC_ALL=C awk "$V8FL_AWK") || rows=""
  [[ -n "$rows" ]] || die "$1 --v8-options lists no V8 flag"
  V8FL_TAB=$'\n'"$rows"$'\n'
}
v8fl_ok() { # TOKEN: 0 iff TOKEN is a known V8 tuning flag in V8FL_TAB in its valid value form
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
v8fl_check() { # NODE: one read (also with empty V8_EXTRA, MD-56), then die on first refused token
  local f g
  v8fl_read "$1"
  for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
    v8fl_ok "$f" || die "--v8-flags must not set $f: only V8 tuning flags of this node binary are accepted (node options, unknown flags, string flags, and log/trace/print/prof/dump/snapshot/file flags are refused)"
    # Tool-specific exact-name refusals AFTER allowlist (LEDGER #107 G5c):
    # WHY exact-name (not *turbolev* glob): allows --no-turbolev and --max-turbolev-inline-depth.
    g=${f//_/-}
    case "$g" in
      --turbolev|--turbolev=*|--turbolev-future|--turbolev-future=*)
        die "--v8-flags must not set $f: Turbolev logs identical *' markers to TurboFan in --log-code" ;;
    esac
  done
}

# =============================================================================================
# CORE PARSER: CODESIZE_AWK (single-pass POSIX awk over one V8 --log-code CSV file)
# =============================================================================================
# Input:  -v fns="fn1,fn2"   (comma-separated exact target short names)
# Output:
#   C <fn><TAB><tier><TAB><base_tier><TAB><size><TAB><loc><TAB><ctx>
#     - Emits ALL tiers for target functions so ONE awk pass feeds BOTH the gated selected-tier
#       verdict AND the REPORTED all-tier summary.
#   X <why> at log line <n> [(+<m> more X line(s))]
#     - Global fail-closed parse/integrity error.
#
# WHY key on symbolic field $9 instead of numeric field $3 (V8 CodeKind enum):
#   - `ic-diff.sh` gates on V8-14/15 numeric $3 (`10/11/12/13`), causing NO-VERDICT on Node 22/24
#     (LEDGER #110, #128). Field $9 carries V8's symbolic CodeKindToMarker() string directly.
#   - EMPIRICAL NOTE (node v26.8.2 darwin-arm64): 8 of the 10 markers below (`~`, `^`, `+`, `+'`,
#     `o+`, `*`, `*'`, `o*`) were observed live in `probes/markers.mjs`; `o+'` and `o*'` were NOT
#     emitted by V8 14.6 (even for OSR closures capturing outer `let`) and are kept defensively.
#     Node 22/24 and Linux x64 are NOT yet tested (see RESEARCH.md section 5).
#
# WHY `break` MUST be INSIDE the `if (rest starts with / or file:///)` guard:
#   - Subtle order-dependence bug if `break` sits outside: given `--fn 'get,get value'`, a line
#     for `get value file:///...` starts with `get `, fails the `rest` path check (`value ...`),
#     and an unconditional `break` would abort the loop BEFORE checking `i=2` (`get value`),
#     silently dropping `get value`! Putting `break` inside the path match fixes both orders.
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
  # Tight allowlist of non-code-creation events observed under
  # `--log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot` (node v26.8.2).
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

  # Non-JS code-creation $2 types (7 fields).
  nonjs["Builtin"] = 1
  nonjs["BytecodeHandler"] = 1
  nonjs["RegExp"] = 1
  nonjs["Stub"] = 1
  nonjs["Handler"] = 1
  nonjs["Wasm"] = 1

  # JS code-creation $2 types (9 fields, carry symbolic marker in $9).
  js_ty["JS"] = 1
  js_ty["Eval"] = 1
  js_ty["Script"] = 1

  # Closed map of V8 CodeKindToMarker() ($9) -> "<tier> <base_tier> <ctx>"
  # WHY octal \047 (never \x27): POSIX / BSD awk guarantees octal escapes in string literals.
  # Observed on node v26.8.2: ~ ^ + +\047 o+ * *\047 o*  (o+\047 and o*\047 unobserved; defensive)
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
  # WHY length($6) <= 9 (never {1,9} regex interval, which older mawk rejects):
  # exact in awk doubles and bash integer arithmetic (< 10^9 bytes).
  if ($3 !~ /^[0-9]+$/ || $5 !~ /^0x[0-9a-fA-F]+$/ || $6 !~ /^[0-9]+$/ || length($6) > 9 || $8 !~ /^0x[0-9a-fA-F]+$/) {
    failx("JS code-creation does not parse (" ty ")")
    next
  }
  if (!($9 in mk)) {
    failx("unknown code tier marker " $9)
    next
  }
  if (ty != "JS") next

  name_loc = $7
  for (i = 1; i <= nf; i++) {
    pfx = fn_pfx[i]
    pl = fn_len[i] + 1
    if (substr(name_loc, 1, pl) != pfx) continue
    rest = substr(name_loc, pl + 1)
    if (substr(rest, 1, 1) == "/" || substr(rest, 1, 8) == "file:///") {
      split(mk[$9], mparts, " ")
      printf "C %s\t%s\t%s\t%d\t%s\t%s\n", flist[i], mparts[1], mparts[2], ($6 + 0), loc_base(rest), mparts[3]
      break
    }
  }
}
END {
  if (NX > 0) {
    printf "X %s at log line %d%s\n", XW, XL, (NX > 1 ? " (+" (NX - 1) " more X line(s))" : "")
  }
}
'

# =============================================================================================
# TURBOLEV DEFAULT-ON CHECK (ported from inlining-budget-diff.sh, LEDGER #107 G5c)
# =============================================================================================
# WHY check node --v8-options default from V8_OPTS_RAW (0 extra spawns):
#   Probed in `probes/deopt-reopt.mjs`: `--turbolev` logs `JS,13,*'` identically to TurboFan
#   while changing code size (344 B -> 336 B). Must refuse default-on Turbolev too.
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
# RECORD EXTRACTORS & VERDICT JUDGE
# =============================================================================================
s_ms() { # records fn tiers (null control: keeps loc)
  printf '%s\n' "$1" | awk -v fn="$2" -v ts="$3" '
    BEGIN { FS = "\t"; p = "C " fn "\t"; n = split(ts, a, ","); for (i = 1; i <= n; i++) wt[a[i]] = 1 }
    substr($0, 1, length(p)) == p && ($3 in wt) { print "*\t" $2 "\t" $4 "\t" $5 }
  ' | multiset
}

v_ms() { # records fn tiers (cross-side diff: strips loc so comment/line edits never false-DIFF)
  printf '%s\n' "$1" | awk -v fn="$2" -v ts="$3" '
    BEGIN { FS = "\t"; p = "C " fn "\t"; n = split(ts, a, ","); for (i = 1; i <= n; i++) wt[a[i]] = 1 }
    substr($0, 1, length(p)) == p && ($3 in wt) { print "*\t" fn "\t" $2 "\t" $4 }
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

judge() { # fn tiers
  local fn="$1" tiers="$2" n i x first nk dl counts sel ign
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
  first=$(s_ms "${JREC[0]}" "$fn" "$tiers")
  for ((i = 1; i < n; i++)); do
    nk=$(s_ms "${JREC[$i]}" "$fn" "$tiers")
    if [[ "$nk" != "$first" ]]; then
      dl=$(awk "$MSDIFF_AWK" <(printf '%s\n' "$first") <(printf '%s\n' "$nk") | sort -k3 \
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
#   Empirically verified on node v26.8.2 (`probes/sparkplug-10x.mjs`): `--no-concurrent-recompilation`
#   does NOT disable `--concurrent-sparkplug` (default on in V8 14.6), leaving a background Sparkplug
#   thread that raced the log (9/10 repeatability in one 10-run pass). Disabling both makes all
#   compilation synchronous on the main thread.
TRACE_FLAGS=(--log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot)
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)

RUN_RC=0; RUN_LOG=""; RUN_REC=""
run_side() { # side dir base k
  local rd="$RUNROOT/$1" out=/dev/null lf n rc=0 ar=0 rd_esc
  local -a LF
  if [[ -n "$OUT" ]]; then out="$rd/run.$4.out"; fi
  rd_esc=${rd//%/%%}
  ( cd "$2" && exec "${PROBE_ENV[@]}" "$NODE_RES" ${V8_EXTRA[@]+"${V8_EXTRA[@]}"} "${TRACE_FLAGS[@]}" "--logfile=$rd_esc/run.log" "./$3" ) \
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
# --self-test: canned --log-code traces + judge + TURBOLEV_AWK + v8fl_ok allowlist checks
# =============================================================================================
self_test() {
  local oks=0 fails=0 SQ="'" H B1 B2 OSR DEOPT BOTH_GET BAD_MK BAD_NF BAD_EV GOT
  local -a JRC JLOG JREC
  local JV="" JWHY=""
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

  B2=$(printf '%s\n' "$B1" | sed -e 's/,JS,10,/,JS,8,/g' -e 's/,JS,12,/,JS,14,/g' -e 's/,JS,13,/,JS,15,/g')
  check "records: normal hot fn ignores node:internal and parses ~, +', *'" \
    "$(rec hot "$B1")" \
    "C hot|ignition|ignition|38|drv.mjs:2:13|0;C hot|maglev|maglev|824|drv.mjs:2:13|1;C hot|turbo|turbo|596|drv.mjs:2:13|1;"
  check "numeric CodeKind (\$3) shift independence via \$9 markers" \
    "$(rec hot "$B2")" "$(rec hot "$B1")"

  OSR="$H"$'\n''code-creation,JS,12,98800,0x114c0a100,780,loop file:///tmp/a\x2Cb/drv.mjs:5:1,0x29a78805aa10,o+'
  OSR="$OSR"$'\n''code-creation,JS,13,98900,0x114c0a500,552,loop file:///tmp/a\x2Cb/drv.mjs:5:1,0x29a78805aa10,o*'
  check "OSR markers + comma-escaped dir path" \
    "$(rec loop "$OSR")" \
    "C loop|maglev-osr|maglev|780|drv.mjs:5:1|0;C loop|turbo-osr|turbo|552|drv.mjs:5:1|0;"

  # Regression check for --fn 'get,get value' vs --fn 'get value,get' (order independence!)
  BOTH_GET="$H"$'\n''code-creation,JS,12,98940,0x114c0a600,340,get file:///w/g.mjs:6:13,0x29a78805ab00,+'$SQ
  BOTH_GET="$BOTH_GET"$'\n''code-creation,JS,13,98950,0x114c0a800,220,get value file:///w/g.mjs:4:12,0x29a78805ab10,*'$SQ
  check "fn order: 'get,get value' matches BOTH (no early break drop)" \
    "$(rec 'get,get value' "$BOTH_GET")" \
    "C get|maglev|maglev|340|g.mjs:6:13|1;C get value|turbo|turbo|220|g.mjs:4:12|1;"
  check "fn order: 'get value,get' matches BOTH identically" \
    "$(rec 'get value,get' "$BOTH_GET")" \
    "C get|maglev|maglev|340|g.mjs:6:13|1;C get value|turbo|turbo|220|g.mjs:4:12|1;"
  check "exact prefix: 'get' alone ignores 'get value'" \
    "$(rec get "$BOTH_GET")" \
    "C get|maglev|maglev|340|g.mjs:6:13|1;"

  DEOPT="$H"$'\n''code-creation,JS,12,99000,0x114c0b000,348,churn file:///w/d.mjs:1:1,0x29a78805ac00,+'
  DEOPT="$DEOPT"$'\n''code-creation,JS,13,99010,0x114c0b200,204,churn file:///w/d.mjs:1:1,0x29a78805ac00,*'
  DEOPT="$DEOPT"$'\n''code-creation,JS,12,99020,0x114c0b400,392,churn file:///w/d.mjs:1:1,0x29a78805ac00,+'
  check "deopt-recompile churn multiset retains both Maglev compiles" \
    "$(v_ms "$(printf '%s\n' "$DEOPT" | awk -v fns=churn "$CODESIZE_AWK")" churn "turbo,maglev" | sed 's/^ *//' | tr '\t\n' '|;')" \
    "1 *|churn|maglev|348;1 *|churn|maglev|392;1 *|churn|turbo|204;"

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
  judge cold "turbo,maglev"
  check "guard: ignition-only fn -> NO-VERDICT with warmup hint" "$JV:${JWHY%%:*}" \
    "NO-VERDICT:no compile of 'cold' in selected tiers (turbo,maglev) in run 1 (saw ignition bytecode x1"
  judge ghost "turbo,maglev"
  check "guard: never-compiled fn -> NO-VERDICT missing hint" "$JV:$JWHY" \
    "NO-VERDICT:no compile of 'ghost' in run 1 (no such name or never called)"

  GOT=$(printf '  --turbolev (use maglev)\n        type: bool  default: --no-turbolev\n  --turbolev-future (exp)\n        type: bool  default: --no-turbolev-future\n' | awk "$TURBOLEV_AWK")
  check "turbolev check: both off" "$GOT" "off off"
  GOT=$(printf '  --turbolev (use maglev)\n        type: bool  default: --turbolev\n' | awk "$TURBOLEV_AWK")
  check "turbolev check: default on detected" "$GOT" "on absent"

  # LEDGER law 4 allowlist unit tests (canned V8FL_TAB -- no node spawn)
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
  check "v8fl_ok allowlist: valid bool/int accepted; node opts, unknown, string, log, neg-int refused" \
    "$ok_m$ok_i$bad_ev$bad_ins$bad_unk$bad_str$bad_log$bad_neg" "11111111"

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
# CLI PARSING & VALIDATION
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
  --fn LIST                comma-separated short function names (e.g. get,get\ value)
  --tiers LIST             subset of turbo,maglev,sparkplug,ignition (default: turbo,maglev)
  --report                 single-driver mode: print sizes and exit 0 OK / 2 NO-VERDICT
  --max fn=N[,fn=N]        gate mode: fail (exit 1 OVER) if max selected-tier size > N
  --node-version vX.Y.Z    required with --max (optional elsewhere); exact `node --version` match
  --platform-arch OS-ARCH  required with --max (optional elsewhere); exact `process.platform + "-" + process.arch`
                           match (e.g. darwin-arm64, linux-x64). Mismatch -> exit 2 NO-VERDICT.
  --runs N                 runs per side, 2..20 (default: 3)
  --node BIN               node binary (default: $NODE or node)
  --v8-flags STR           extra V8 tuning flags (validated against `node --v8-options` allowlist)
  --out DIR                keep DIR/report.txt and DIR/raw/<side>/run.<k>.{log,out}
  --self-test              run canned checks on CODESIZE_AWK, judge, TURBOLEV_AWK, v8fl_ok
  -h, --help               this text (exit 2)
EOF
  DIED=1; exit 2
}

MODE="diff"
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
  case "$1" in
    -h|--help) usage ;;
    --self-test) self_test ;;
    --report) MODE="report"; shift ;;
    --fn) [[ $# -ge 2 ]] || die "--fn needs a value"; FNLIST="$2"; shift 2 ;;
    --tiers) [[ $# -ge 2 ]] || die "--tiers needs a value"; TIERS="$2"; shift 2 ;;
    --max) [[ $# -ge 2 ]] || die "--max needs a value"; MODE="gate"; MAXSPEC="$2"; shift 2 ;;
    --node-version) [[ $# -ge 2 ]] || die "--node-version needs a value"; WANT_VER="$2"; shift 2 ;;
    --platform-arch) [[ $# -ge 2 ]] || die "--platform-arch needs a value"; WANT_PA="$2"; shift 2 ;;
    --runs) [[ $# -ge 2 ]] || die "--runs needs a value"; RUNS="$2"; shift 2 ;;
    --node) [[ $# -ge 2 ]] || die "--node needs a value"; NODE_BIN="$2"; shift 2 ;;
    --v8-flags) [[ $# -ge 2 ]] || die "--v8-flags needs a value"; V8FLAGS="$2"; shift 2 ;;
    --out) [[ $# -ge 2 ]] || die "--out needs a value"; OUT="$2"; shift 2 ;;
    --) shift; while [[ $# -gt 0 ]]; do POS+=("$1"); shift; done ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *) POS+=("$1"); shift ;;
  esac
done

RE_INT='^[0-9]+$'
[[ "$RUNS" =~ $RE_INT && "$RUNS" -ge 2 && "$RUNS" -le 20 ]] || die "--runs must be 2..20, got '$RUNS'"

IFS=',' read -r -a TIER_ARR <<< "$TIERS"
SEEN_TIERS=","
for t in "${TIER_ARR[@]}"; do
  case "$t" in
    turbo|maglev|sparkplug|ignition) ;;
    *) die "--tiers accepts only turbo,maglev,sparkplug,ignition (got '$t')" ;;
  esac
  [[ "$SEEN_TIERS" != *",$t,"* ]] || die "--tiers has duplicate '$t'"
  SEEN_TIERS="${SEEN_TIERS}${t},"
done

FN_RE='^[A-Za-z_$][A-Za-z0-9_$]*( [A-Za-z_$][A-Za-z0-9_$]*)?$'
PA_RE='^[a-z0-9]+-[a-z0-9_]+$'
TARGETS=()
MAX_VALS=()
if [[ "$MODE" == "gate" ]]; then
  [[ -z "$FNLIST" ]] || die "--max and --fn are mutually exclusive"
  [[ -n "$WANT_VER" ]] || die "--max requires --node-version vX.Y.Z"
  # WHY require --platform-arch with --max:
  #   Native machine-code byte sizes differ between arm64 and x64 (and OS ABIs). Checking only
  #   --node-version lets an arm64 limit give a wrong WITHIN or OVER verdict on x64 Linux CI!
  [[ -n "$WANT_PA" ]] || die "--max requires --platform-arch OS-ARCH (e.g. darwin-arm64, linux-x64)"
  IFS=',' read -r -a PAIR_ARR <<< "$MAXSPEC"
  for pair in "${PAIR_ARR[@]}"; do
    [[ "$pair" == *=* ]] || die "--max entry must be fn=N, got '$pair'"
    fn=${pair%%=*}; lim=${pair#*=}
    [[ "$fn" =~ $FN_RE ]] || die "invalid function name in --max: '$fn'"
    [[ "$lim" =~ $RE_INT && ${#lim} -le 9 ]] || die "invalid max byte limit for '$fn': '$lim' (want 1..9 digits)"
    TARGETS+=("$fn"); MAX_VALS+=("$lim")
    FNLIST="${FNLIST:+$FNLIST,}$fn"
  done
else
  [[ -n "$FNLIST" ]] || die "--fn LIST is required"
  IFS=',' read -r -a TARGETS <<< "$FNLIST"
  for fn in "${TARGETS[@]}"; do
    [[ "$fn" =~ $FN_RE ]] || die "invalid function name in --fn: '$fn'"
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

# Early syntactic/conflict refusals on --v8-flags BEFORE any spawn; full allowlist runs via v8fl_check
V8_EXTRA=()
if [[ -n "$V8FLAGS" ]]; then
  # shellcheck disable=SC2206
  V8_EXTRA=($V8FLAGS)
  [[ ${#V8_EXTRA[@]} -gt 0 ]] || die "--v8-flags needs at least one flag, got only blanks"
  for f in "${V8_EXTRA[@]}"; do
    [[ "$f" == --[A-Za-z]* ]] || die "--v8-flags takes flags only (each starts with -- and a letter), got '$f'"
    g=${f//_/-}
    case "$g" in
      *stress-concurrent-inlining*|*concurrent-recompilation*|*concurrent-sparkplug*)
        die "--v8-flags must not set $f: conflicts with synchronous compilation flags" ;;
      --require*|--import*|--loader*|--experimental-loader*|--env-file*|--experimental-config-file*|--experimental-default-config-file*|--eval*|--print*)
        die "--v8-flags must not set $f: node preload/eval/print flag is refused" ;;
    esac
  done
fi

# --out validation BEFORE any spawn or write (mirrors src/ic-diff.sh)
if [[ -n "$OUT" ]]; then
  [[ "$OUT" != -* ]] || OUT="./$OUT"
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
    for inp in "${POS[@]}"; do
      [[ ! "$OUT/report.txt" -ef "$inp" ]] || die "--out: $OUT/report.txt is an input file of this run"
    done
  fi
  OUT_UP="$OUT/raw/before"
  while [[ ! -e "$OUT_UP" && ! -L "$OUT_UP" && "$OUT_UP" != . ]]; do OUT_UP=$(dirname -- "$OUT_UP"); done
  [[ -d "$OUT_UP" && -w "$OUT_UP" && -x "$OUT_UP" ]] || die "--out: cannot create $OUT/raw ($OUT_UP is not a writable directory)"
fi

# Resolve node binary ONCE to an absolute path
NODE_RES=$NODE_BIN
if [[ "$NODE_RES" != */* ]]; then
  NODE_RES=$(command -v -- "$NODE_RES" 2>/dev/null) || die "node binary not found: $NODE_BIN"
fi
[[ "$NODE_RES" == */* ]] || die "node binary is not a file on PATH: $NODE_BIN -> $NODE_RES"
[[ -f "$NODE_RES" && -x "$NODE_RES" ]] || die "node binary is not executable: $NODE_RES"
NODE_DIR=$(cd -- "$(dirname -- "$NODE_RES")" && pwd)
NODE_RES="${NODE_DIR%/}/$(basename -- "$NODE_RES")"

# --- Spawns start here: --version + platform-arch probe (one node -p), then v8fl_check (--v8-options) ---
# WHY probe process.version + process.platform + process.arch from NODE_RES itself:
#   `uname -m` can disagree with a Rosetta/x64 binary on Apple Silicon. One `node -p` call gives
#   exact version + OS + CPU arch of the node binary in a single spawn.
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

# LEDGER law 4 runtime V8 allowlist + Turbolev default-on check (ONE --v8-options capture)
v8fl_check "$NODE_RES"
TL_STATE=$(printf '%s\n' "$V8_OPTS_RAW" | awk "$TURBOLEV_AWK")
case "$TL_STATE" in
  on\ *|*\ on) die "Turbolev is on by default in this V8 ($TL_STATE); --log-code cannot distinguish Turbolev from TurboFan" ;;
  \?*|*\ \?)   die "cannot read the --turbolev default from $NODE_RES --v8-options" ;;
esac

# Create --out dirs OR private temp dir
if [[ -n "$OUT" ]]; then
  if [[ "$MODE" == "diff" ]]; then
    mkdir -p -- "$OUT/raw/before" "$OUT/raw/after" || die "--out: cannot create $OUT/raw/{before,after}"
  else
    mkdir -p -- "$OUT/raw/one" || die "--out: cannot create $OUT/raw/one"
  fi
  OUT=$(cd -- "$OUT" && pwd)
  REPORT="$OUT/report.txt"
  { : >"$REPORT"; } 2>/dev/null || die "--out: cannot write $REPORT"
  RUNROOT="$OUT/raw"
else
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/code-size-diff.XXXXXX") || die "cannot create temp dir"
  TMP_DIR=$(cd -- "$TMP_DIR" && pwd)
  if [[ "$MODE" == "diff" ]]; then mkdir "$TMP_DIR/before" "$TMP_DIR/after"
  else mkdir "$TMP_DIR/one"
  fi
  RUNROOT="$TMP_DIR"
fi

say "code-size-diff (prototype)  node $GOT_VER  target $GOT_PA  $NODE_RES  (NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE, NODE_REDIRECT_WARNINGS stripped)"
say "mode    $MODE  runs $RUNS  tiers $TIERS  v8 flags ${V8FLAGS:+$V8FLAGS }${TRACE_FLAGS[*]}"
if [[ -n "$OUT" ]]; then say "out     $OUT"; fi

# =============================================================================================
# EXECUTION & VERDICT
# =============================================================================================
if [[ "$MODE" == "diff" ]]; then
  DRV_B_DIR=$(cd -- "$(dirname -- "${POS[0]}")" && pwd); DRV_B_BASE=$(basename -- "${POS[0]}")
  DRV_A_DIR=$(cd -- "$(dirname -- "${POS[1]}")" && pwd); DRV_A_BASE=$(basename -- "${POS[1]}")
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
    JRC=("${RCB[@]}"); JLOG=("${LGB[@]}"); JREC=("${REB[@]}"); judge "$fn" "$TIERS"; VB=$JV; WB=$JWHY
    JRC=("${RCA[@]}"); JLOG=("${LGA[@]}"); JREC=("${REA[@]}"); judge "$fn" "$TIERS"; VA=$JV; WA=$JWHY
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
  DRV_DIR=$(cd -- "$(dirname -- "${POS[0]}")" && pwd); DRV_BASE=$(basename -- "${POS[0]}")
  say "driver  ${DRV_DIR%/}/$DRV_BASE"
  say ""

  RCO=(); LGO=(); REO=()
  for k in $(seq 1 "$RUNS"); do
    run_side one "$DRV_DIR" "$DRV_BASE" "$k"; RCO+=("$RUN_RC"); LGO+=("$RUN_LOG"); REO+=("$RUN_REC")
  done

  VERDICT=$([[ "$MODE" == "gate" ]] && echo WITHIN || echo OK)
  for idx in "${!TARGETS[@]}"; do
    fn="${TARGETS[$idx]}"
    JRC=("${RCO[@]}"); JLOG=("${LGO[@]}"); JREC=("${REO[@]}"); judge "$fn" "$TIERS"
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
    VERDICT=$(worst "$VERDICT" "$FV")
  done
  say ""
  say "VERDICT $VERDICT"
  FINAL=1
  case "$VERDICT" in OK|WITHIN) exit 0 ;; OVER) exit 1 ;; *) exit 2 ;; esac
fi
