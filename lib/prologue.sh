#: lib/prologue.sh -- strict mode, the fail-closed EXIT trap, SELF, LC_ALL=C.
#: Include right after the script's header comment. Reads $0. Sets FINAL (a planned verdict sets
#: FINAL=1 before exit 1), SELF. @SCRIPT@ is the script name (build.sh substitutes it).
set -euo pipefail
# Fail closed: an exit that is not a planned verdict (FINAL=1), a die / usage (2) or 0 becomes 2 NO-VERDICT,
# so a command that fails under set -e can never pose as exit 1 DIFF. Subshells do not inherit this trap.
FINAL=""
trap 'rc=$?; if [[ -z $FINAL && $rc -ne 0 && $rc -ne 2 ]]; then printf "@SCRIPT@: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
export LC_ALL=C   # byte-wise sort / awk: stable multisets, emoji stripped as bytes
