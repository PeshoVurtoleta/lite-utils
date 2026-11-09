#: lib/prologue.sh -- strict mode, the fail-closed EXIT trap, SELF, LC_ALL=C.
#: Include right after the script's header comment. Reads $0. Sets FINAL (every planned exit 0 or 1 sets
#: FINAL=1 first; rc 0 without it becomes 2), REPORT (empty until the tool assigns it), SELF. @SCRIPT@ is the script name (build.sh substitutes it).
set -euo pipefail
[[ ! -o posix ]] || set +o posix   # inherited posix mode (POSIXLY_CORRECT, SHELLOPTS=posix, sh): no <( ) on bash 3.2, other -e rules; drops the var for children; only when set: an unconditional call turns bash 3.2's expand_aliases off
# Fail closed: an exit without FINAL=1 (a planned verdict) becomes 2 NO-VERDICT, rc 0 included (a bash 3.2
# set -u abort exits 0); a die / usage 2 stays silent; set +e keeps 2 with stderr closed. Subshells do not inherit this trap.
FINAL=""
trap 'rc=$?; if [[ -z $FINAL ]]; then set +e; [[ $rc -eq 2 ]] || printf "@SCRIPT@: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT
REPORT=""   # die reads it: an inherited $REPORT is never a report file
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
export LC_ALL=C   # byte-wise sort / awk: stable multisets, emoji stripped as bytes
