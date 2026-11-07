#: lib/common.sh -- die say sha8 usage multiset devino top_of live_tops resolve_links is_tracked
#: refuse_live worst. Reads at call time: REPORT (say), AFTER_FILE and REPO (live_tops), $what (top_of's die text, through
#: bash dynamic scope: refuse_live's local label), $0 (usage). Sets TOP_OF (top_of; a local of live_tops) and LIVE_TOPS
#: (live_tops; a local of refuse_live). top_of and live_tops die on a git error: call them in the CURRENT shell, never
#: in $( ), <( ) or a pipe (a die there exits only the subshell, and the run goes on with no toplevels).
#: @SCRIPT@ is the script name (build.sh substitutes it).
# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
die() { printf '@SCRIPT@: %s\nVERDICT NO-VERDICT\n' "$*" >&2; exit 2; }
say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
sha8() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-8; }
usage() { sed -n '2,/^$/{s/^# \{0,1\}//;p;}' "$0"; }
multiset() { sort | uniq -c; }   # the ONE multiset: judge() and --self-test both use it (never sort -u)
devino() { # device:inode, following symlinks (GNU stat, else BSD / macOS stat)
  if stat -L -c '%d:%i' "$1" >/dev/null 2>&1; then stat -L -c '%d:%i' "$1"; else stat -L -f '%d:%i' "$1"; fi
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
  local f="$1" x t="" TOP_OF=""
  shift
  LIVE_TOPS=""
  if top_of . "$f"; then t="$t$TOP_OF"$'\n'; fi
  if [[ -n "$AFTER_FILE" ]] && top_of "$(dirname -- "$AFTER_FILE")" "$f"; then t="$t$TOP_OF"$'\n'; fi
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
    l=$(readlink "$p")
    case "$l" in /*) p="$l" ;; *) d=$(CDPATH= cd -P -- "$(dirname -- "$p")" 2>/dev/null && pwd -P) || die "cannot resolve the directory of $p (a link in the symlink chain of $1)"; p="$d/$l" ;; esac
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
  local f="$1" what="$2" p me top t LIVE_TOPS=""
  p=$(resolve_links "$f")
  for t in "$f" "$p"; do
    if is_tracked "$t"; then die "$what is a git-tracked working-tree file ($t): use a FROZEN copy (untracked) or --before-ref"; fi
  done
  me=$(devino "$f")
  live_tops "$f" "$(dirname "$f")" "$(dirname "$p")"
  while IFS= read -r top; do
    [[ -n "$top" ]] || continue
    for t in "$top/Signal.js" "$top/$(basename "$f")" "$top/$(basename "$p")"; do
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
