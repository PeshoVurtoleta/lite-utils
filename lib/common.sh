#: lib/common.sh -- die say sha8 usage multiset devino top_of live_tops resolve_links is_tracked
#: refuse_live rep_refuse worst nl_refuse nl_dir. Reads at call time: REPORT (say, die), AFTER_FILE (live_tops: the toplevels around its dir and,
#: for a symlink, around the dir of its chain's end; refuse_live: its name joins the cand list) and REPO
#: (live_tops), $what (top_of's die text, through bash dynamic scope: refuse_live's local label), $0 (usage), OUT and
#: OUT_NAMES (rep_refuse; OUT_NAMES unset = report.txt only).
#: Sets DIED (die, first: lib/prologue.sh's EXIT trap stays silent), TOP_OF (top_of; a local of live_tops) and
#: LIVE_TOPS (live_tops; a local of refuse_live). top_of and
#: live_tops die on a git error: call them in the CURRENT shell, never in $( ), <( ) or a pipe (a die there exits
#: only the subshell, and the run goes on with no toplevels). live_tops resolves a symlinked --after in $( ) but
#: checks that subshell's status and dies in the current shell ("--after: cannot resolve its symlink chain").
#: resolve_links and is_tracked give a `-`-led dirname a "./" before the cd (bash reads `cd -- -` as OLDPWD).
#: nl_refuse / nl_dir (G-X6, ruling Q-B66-X6): cold path, before the first spawn or write; nl_refuse is a pure `case` (no
#: fork); nl_dir also reads PWD (the caller checks "the cwd" first) and dies only through nl_refuse.
#: @SCRIPT@ is the script name (build.sh substitutes it).
# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
die() { # the report gets the line only from the main shell and only once it has its head (a 0-byte report stays 0 bytes);
  # DIED first: the EXIT trap stays silent (lib/prologue.sh)
  DIED=1
  printf '@SCRIPT@: %s\nVERDICT NO-VERDICT\n' "$*" >&2
  if [[ $BASH_SUBSHELL -eq 0 && -s "${REPORT:-/dev/null}" ]]; then { printf '@SCRIPT@: %s\nVERDICT NO-VERDICT\n' "$*" >>"$REPORT"; } 2>/dev/null || true; fi
  exit 2
}
say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
sha8() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | tr -d '\\' | cut -c1-8; }
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
  p=$(resolve_links "$f") || { DIED=1; exit 2; }   # its die ran in the $( ) (DIED unset here)
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
rep_refuse() { # file...: die if a file this run writes in place in OUT (report.txt, and each name in OUT_NAMES) is one of
  # this run's own input files (-ef: the same file under any name; an empty operand never matches). Cold path, before any spawn or write
  local x n
  for n in report.txt ${OUT_NAMES-}; do
    for x in "$@"; do
      [[ -z "$x" || ! "$OUT/$n" -ef "$x" ]] || die "--out: $OUT/$n is an input file of this run ($x): the run would overwrite it"
    done
  done
}
worst() { # NO-VERDICT > DIFF > SAME
  if [[ $1 == NO-VERDICT || $2 == NO-VERDICT ]]; then echo NO-VERDICT
  elif [[ $1 == DIFF || $2 == DIFF ]]; then echo DIFF
  else echo SAME; fi
}
nl_refuse() { # label str...: die if any str holds a newline or a CR (a path the report prints would forge report lines);
  # the value is never printed
  local l="$1" s
  shift
  for s in "$@"; do
    case "$s" in *$'\n'*|*$'\r'*) die "$l: a newline or a CR is not allowed (it would forge report lines)" ;; esac
  done
}
nl_dir() { # label dir: nl_refuse dir and the name the head prints for dir once `mkdir -p` made it (read-only, no write).
  # P = mkdir -p's physical walk, replayed: the deepest existing ancestor (the OUT_UP walk, its `!= .` guard kept) by
  # cd -P, then the rest one name at a time (an existing name -> cd -P, a new name is a new real dir, `..` pops a new
  # name, else goes to the physical parent). The head prints the logical name (PWD joined, `.` / `..` folded) when it is
  # -ef P (the same walk over it ends at P), else P (pwd -P). An unreplayable walk (a file or a dangling link in the way)
  # checks nothing more: the root's own check or mkdir dies, and its post-resolve backstop stays
  local x e t c cur new p="" lg=""
  nl_refuse "$1" "$2"
  t="$2"; [[ $t == /* ]] || t="$PWD/$t"
  while [[ -n $t ]]; do
    c=${t%%/*}; if [[ $t == */* ]]; then t=${t#*/}; else t=""; fi
    case "$c" in ""|.) ;; ..) lg=${lg%/*} ;; *) lg="$lg/$c" ;; esac
  done
  for x in "$2" "${lg:-/}"; do
    [[ $x != -* ]] || x="./$x"
    e=$x; while [[ ! -e "$e" && ! -L "$e" && "$e" != . ]]; do e=$(dirname -- "$e"); done
    if [[ $e == . ]]; then t=$x; else t=${x#"$e"}; fi
    cur=$(CDPATH= cd -P -- "$e" 2>/dev/null && pwd -P) || break
    new=""
    while [[ -n $t ]]; do
      c=${t%%/*}; if [[ $t == */* ]]; then t=${t#*/}; else t=""; fi
      case "$c" in
        ""|.) ;;
        ..) if [[ -n $new ]]; then new=${new%/*}; else cur=${cur%/*}; fi ;;
        *) if [[ -z $new && ( -e "$cur/$c" || -L "$cur/$c" ) ]]; then cur=$(CDPATH= cd -P -- "$cur/$c" 2>/dev/null && pwd -P) || break 2
           else new="$new/$c"; fi ;;
      esac
    done
    cur="${cur%/}$new"; [[ -n $cur ]] || cur=/
    if [[ -z $p ]]; then p=$cur; elif [[ $cur == "$p" ]]; then p=${lg:-/}; fi
  done
  [[ -z $p ]] || nl_refuse "$1" "$p"
}
