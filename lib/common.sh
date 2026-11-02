#: lib/common.sh -- die say sha8 usage multiset devino live_tops resolve_links is_tracked
#: refuse_live worst. Reads at call time: REPORT (say), AFTER_FILE and REPO (live_tops), $0 (usage).
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
live_tops() { # dirs...: repo toplevels around cwd, --after, --repo and each given dir
  { git rev-parse --show-toplevel 2>/dev/null || true
    [[ -n "$AFTER_FILE" ]] && git -C "$(dirname "$AFTER_FILE")" rev-parse --show-toplevel 2>/dev/null || true
    [[ -n "$REPO" ]] && git -C "$REPO" rev-parse --show-toplevel 2>/dev/null || true
    for x in "$@"; do git -C "$x" rev-parse --show-toplevel 2>/dev/null || true; done; } | sort -u
}
resolve_links() { # path: follow a symlink chain (at most 40 hops) and print its end
  local p="$1" l n=0
  while [[ -L "$p" ]]; do
    n=$((n + 1)); [[ $n -le 40 ]] || die "symlink chain too long (or a loop) at $1"
    l=$(readlink "$p")
    case "$l" in /*) p="$l" ;; *) p="$(dirname "$p")/$l" ;; esac
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
  local f="$1" what="$2" p me top t
  p=$(resolve_links "$f")
  for t in "$f" "$p"; do
    if is_tracked "$t"; then die "$what is a git-tracked working-tree file ($t): use a FROZEN copy (untracked) or --before-ref"; fi
  done
  me=$(devino "$f")
  while IFS= read -r top; do
    [[ -n "$top" ]] || continue
    for t in "$top/Signal.js" "$top/$(basename "$f")" "$top/$(basename "$p")"; do
      if [[ -e "$t" ]] && [[ "$(devino "$t")" == "$me" ]] && is_tracked "$t"; then
        die "$what is the same file as the live $t (hard link / symlink): use a FROZEN copy or --before-ref"
      fi
    done
  done < <(live_tops "$(dirname "$f")" "$(dirname "$p")")
}
worst() { # NO-VERDICT > DIFF > SAME
  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT
  elif [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF
  else echo SAME; fi
}
