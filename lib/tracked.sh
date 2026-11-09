#: lib/tracked.sh -- is_tracked (fail closed on a git error). Include on the line right after lib/common.sh: bash keeps
#: the last definition, so common.sh's refuse_live calls this one. Uses die (lib/common.sh). Reads $what through bash
#: dynamic scope (refuse_live's local label, e.g. --before; unset -> "is_tracked") for the die text only.
#: Returns 0 tracked; 1 untracked, ignored, outside a work tree, inside .git/ or a bare repo, no git on PATH, or a dir
#: that cannot be entered; dies (exit 2) on any other git answer, naming git's first output line.
#: A `-`-led dirname gets a "./" before the cd (bash reads `cd -- -` as OLDPWD).
#: The ls-files pathspec is literal and ASCII-case-folding: a match counts only as the exact name or the same inode (-ef); a name that did not match is swept by inode (one more git spawn), so any tracked hard link or symlink to the file in its directory or below counts as tracked.
#: Cold path (stage_check, before any spawn). Spawns: 3 git inside a work tree for a name with no literal match, 2 when it matched, 1 outside; 0 temp files. bash 3.2 safe.
is_tracked() { # path: 0 iff git tracks it in the work tree around it; a git error dies
  local d b out rc=0 l
  local e hit
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
    hit=0
    while IFS= read -r -d '' e; do
      if [[ "$e" == "$b" || "$d/$e" -ef "$1" ]]; then hit=1; fi
    done < <(exec 3>&1; rc=0; x=$(LC_ALL=C git --icase-pathspecs -C "$d" ls-files -z --error-unmatch -- ":(literal)$b" 2>&1 >&3) || rc=$?; printf '%s\n@rc=%s' "$x" "$rc")
    rc=${e##*@rc=}; out=${e%$'\n@rc='*}; l=${out%%$'\n'*}
    if [[ "$rc" == 0 ]]; then return $((1 - hit)); fi
    if [[ "$rc" == 1 && "$out" == *"did not match"* ]]; then   # icase folds ASCII only (LC_ALL=C): a name that did not match is matched by inode (Unicode case, ASCII aliases, NFC / NFD)
      while IFS= read -r -d '' e; do
        [[ ! "$d/$e" -ef "$1" ]] || return 0
      done < <(exec 3>&1; rc=0; x=$(LC_ALL=C git -C "$d" ls-files -z 2>&1 >&3) || rc=$?; printf '%s\n@rc=%s' "$x" "$rc")
      rc=${e##*@rc=}; out=${e%$'\n@rc='*}; l=${out%%$'\n'*}
      [[ "$rc" != 0 ]] || return 1
      out=""
    fi
    if [[ "$rc" == 1 ]]; then case "$out" in *"did not match"*) return 1 ;; esac; fi
  fi
  die "${what:-is_tracked}: git failed while checking whether $1 is tracked (${l:-no output, exit $rc}): fix it (e.g. git config --global --add safe.directory DIR) or use --before-ref"
}
