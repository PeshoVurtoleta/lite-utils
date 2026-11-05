#: lib/v8flags.sh -- the --v8-flags runtime V8 allowlist (MD-50..58): V8FL_AWK V8FL_RE V8FL_TAB, v8fl_read NODE,
#: v8fl_ok TOKEN, v8fl_check NODE. Reads V8_EXTRA[@] (v8fl_check) and die (lib/common.sh, include it first).
#: Sets V8FL_TAB = newline + one "name type" row per V8 flag of NODE + newline ("_" read as "-" in the name).
#: Cold path: v8fl_check runs once, right after the tool's --version probe, before any measured run. Spawns: exactly
#: one node (v8fl_read's `env -u NODE_OPTIONS -u NODE_COMPILE_CACHE NODE --v8-options`); v8fl_ok spawns nothing.
#: bash 3.2 safe (no ${x,,}, no declare -A, no mapfile; every =~ pattern sits in a variable).
#: Shared -h text (G2-G5 copy it verbatim into each tool's -h, re-wrapped at the tool's column):
#:   Accepted: V8 flags this node lists in --v8-options -- bool as --flag or --no-flag (never --noflag), numeric as
#:   --flag=N -- except log / trace / print / prof / perf / dump / snapshot / file flags. Refused, exit 2 after one
#:   --v8-options read and before any measured run: every node option (--run, --test, --watch, --check, --inspect,
#:   --cpu-prof, --snapshot-blob, ...), every string-valued V8 flag, and the tool's own flags above.
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
