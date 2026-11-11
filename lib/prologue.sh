#: lib/prologue.sh -- strict mode, the fail-closed EXIT trap, the INT / TERM / HUP trap, SELF, LC_ALL=C.
#: Include right after the script's header comment. Reads $0. Sets FINAL (every planned exit 0 or 1 sets
#: FINAL=1 first; rc 0 without it becomes 2), DIED (die and the -h exit set it: their exit 2 stays silent), SIG_PID
#: (the pid of the driver run drv_wait waits for, else empty), REPORT (empty until the tool assigns it), SELF.
#: Defines _sig, sig_arm, drv_wait and arms the signal trap (G-SIG, ruling Q-B66-SIG). A driver run that the signal
#: must reach is `( cd DIR && exec env .. NODE .. ) >FILE 2>&1 <&0 & drv_wait` (DRV_RC = its exit; `<&0` keeps the
#: caller's stdin, ruling Q-B67-STDIN). @SCRIPT@ is the script name (build.sh substitutes it).
set -euo pipefail
[[ ! -o posix ]] || set +o posix   # inherited posix mode (POSIXLY_CORRECT, SHELLOPTS=posix, sh): no <( ) on bash 3.2, other -e rules; drops the var for children; only when set: an unconditional call turns bash 3.2's expand_aliases off
# Fail closed: an exit without FINAL=1 (a planned verdict) becomes 2 NO-VERDICT, rc 0 included (a bash 3.2
# set -u abort exits 0); only an exit with DIED set (die, the -h exit) stays silent, any other prints its rc; set +e
# keeps 2 with stderr closed. Subshells do not inherit this trap (a die in $( ) sets DIED only there: the one such
# site, refuse_live in lib/common.sh, sets DIED in the main shell when its $( ) fails; no driver run is in a $( )).
# The INT / TERM / HUP trap is armed before REPORT, SELF and LC_ALL are set.
FINAL=""
DIED=""; SIG_PID=""
trap 'rc=$?; if [[ -z $FINAL ]]; then set +e; [[ -n $DIED ]] || printf "@SCRIPT@: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT
# _sig NAME: a trapped SIGINT / SIGTERM / SIGHUP. After FINAL=1 it does nothing (the planned exit stands). Else it
# ignores further signals, kills the recorded driver (SIGKILL: a bounded exit; an interrupted run's output is never
# read), reaps it (a signal between the `&` and drv_wait's assignment: the bare wait covers that run), then dies
# "interrupted (SIG<NAME>)" (stderr, and the report once it has its head). Before lib/common.sh is loaded there is
# no die: the same two lines go to stderr. bash runs the trap only between commands: a foreground command or a $( )
# that is running when the signal lands (the --version / -p / --v8-options probes and other short steps; every
# driver run is a drv_wait job, never a $( )) ends first
_sig() {
  [[ -z $FINAL ]] || return 0
  trap '' INT TERM HUP
  if [[ -n $SIG_PID ]]; then kill -KILL "$SIG_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  if declare -F die >/dev/null; then die "interrupted (SIG$1)"; fi
  DIED=1; printf '@SCRIPT@: interrupted (SIG%s)\nVERDICT NO-VERDICT\n' "$1" >&2; exit 2
}
sig_arm() { trap '_sig INT' INT; trap '_sig TERM' TERM; trap '_sig HUP' HUP; }
drv_wait() { SIG_PID=$!; DRV_RC=0; wait "$SIG_PID" || DRV_RC=$?; SIG_PID=""; }   # the job just started with &
DRV_RC=0
sig_arm
REPORT=""   # die reads it: an inherited $REPORT is never a report file
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
export LC_ALL=C   # byte-wise sort / awk: stable multisets, emoji stripped as bytes
