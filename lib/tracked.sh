#: lib/tracked.sh -- is_tracked (fail closed on a git error). Include on the line right after lib/common.sh: bash keeps
#: the last definition, so common.sh's refuse_live calls this one. Uses die (lib/common.sh). Reads $what through bash
#: dynamic scope (refuse_live's local label, e.g. --before; unset -> "is_tracked") for the die text only.
#: Returns 0 tracked; 1 untracked, ignored, outside a work tree, inside .git/ or a bare repo, no git on PATH, or a dir
#: that cannot be entered; dies (exit 2) on any other git answer, naming git's first output line.
#: A `-`-led dirname gets a "./" before the cd (bash reads `cd -- -` as OLDPWD).
#: Cold path (stage_check, before any spawn). Spawns: 2 git inside a work tree, 1 outside; 0 temp files. bash 3.2 safe.
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
