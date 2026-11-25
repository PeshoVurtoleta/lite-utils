#!/bin/bash
# fake-node.sh -- a canned stand-in for `node` for shape-diff's e2e rows: ZERO real node spawns.
# (test/fixtures/shape-diff/canned/README.txt says what each canned file exercises.)
#
#   FAKE_LOG=<file>   append "$*" (this call's argv, space-joined) to <file>: spawn count = its line count
#   FAKE_VER=<v>      what --version prints (default v26.8.2)
#   FAKE_VER_RC=<n>   --version exits <n> and prints nothing
#
# Env leak (exit 7, prints "env leaked"): a var the caller must strip reached this call --
#   --v8-options: NODE_OPTIONS or NODE_COMPILE_CACHE (the two lib/v8flags.sh v8fl_read strips);
#   every other call: NODE_OPTIONS, NODE_V8_COVERAGE, NODE_COMPILE_CACHE or NODE_REDIRECT_WARNINGS.
# --version     prints FAKE_VER.
# --v8-options  prints a synopsis line, then 10 name / type line pairs byte-exact from
#               test/fixtures/v8flags/v8-options.v26.8.2.txt (sparkplug / always-sparkplug / concurrent-sparkplug
#               are bool, sparkplug-filter is string, max-inlined-bytecode-size is int).
# Fail closed: exit 9 (named stderr line) on no arguments, on -e / -p / --eval / --print anywhere, when the last
#   argument is empty or starts with - (node's "bad option"), or when there is no ABSOLUTE --logfile=<path>.
# Otherwise a trace run: cwd is the driver's dir, the last argument is the driver. n = the number of run.*.out
#   files beside the --logfile path (the caller's stdout file of this run is already open there, so run k counts
#   k; none -> 1). Copies ./map.<n>.log, else ./map.log, to <dir of --logfile>/isolate-0x7508000000-<pid>-<basename
#   of --logfile> (the --logfile value expanded as V8 does: %% -> %, %p -> pid); cats ./out.<n>.txt, else
#   ./out.txt, to stdout; exit 8 (named stderr line) if the map log or the out file is missing or the copy fails;
#   exits with the content of ./rc, else 0.
[ -z "${FAKE_LOG:-}" ] || printf '%s\n' "$*" >>"$FAKE_LOG"
case "${1:-}" in
  --v8-options)
    if [ -n "${NODE_OPTIONS+x}${NODE_COMPILE_CACHE+x}" ]; then echo "env leaked"; exit 7; fi ;;
  *)
    if [ -n "${NODE_OPTIONS+x}${NODE_V8_COVERAGE+x}${NODE_COMPILE_CACHE+x}${NODE_REDIRECT_WARNINGS+x}" ]; then
      echo "env leaked"; exit 7
    fi ;;
esac
case "${1:-}" in
  --version)
    if [ -n "${FAKE_VER_RC:-}" ]; then exit "$FAKE_VER_RC"; fi
    printf '%s\n' "${FAKE_VER:-v26.8.2}"; exit 0 ;;
  --v8-options)
    cat <<'EOF'
The following syntax for options is accepted (both '-' and '--' are ok):
  --maglev (enable the maglev optimizing compiler)
        type: bool  default: --maglev
  --trace-generalization (trace map generalization)
        type: bool  default: --no-trace-generalization
  --sparkplug (enable Sparkplug baseline compiler)
        type: bool  default: --sparkplug
  --always-sparkplug (directly tier up to Sparkplug code)
        type: bool  default: --no-always-sparkplug
  --concurrent-sparkplug (compile Sparkplug code in a background thread)
        type: bool  default: --concurrent-sparkplug
  --sparkplug-filter (filter for Sparkplug baseline compiler)
        type: string  default: --sparkplug-filter="*"
  --concurrent-recompilation (optimizing hot functions asynchronously on a separate thread)
        type: bool  default: --concurrent-recompilation
  --max-inlined-bytecode-size (maximum size of bytecode for a single inlining)
        type: int  default: --max-inlined-bytecode-size=460
  --log-maps (Log map creation)
        type: bool  default: --no-log-maps
  --trace-elements-transitions (trace elements transitions)
        type: bool  default: --no-trace-elements-transitions

EOF
    exit 0 ;;
esac
[ "$#" -ge 1 ] || { echo "fake-node: no arguments (not --version, --v8-options or a trace run)" >&2; exit 9; }
lf=""; drv=""
for a in "$@"; do
  case "$a" in
    -e|-p|--eval|--print|--eval=*|--print=*|-pe|-ep) echo "fake-node: eval / print is not a trace run: $*" >&2; exit 9 ;;
    --logfile=*) lf="${a#--logfile=}" ;;
  esac
  drv="$a"
done
case "$drv" in ""|-*) echo "fake-node: bad option (the last argument is not a driver path): $drv" >&2; exit 9 ;; esac
case "$lf" in /*) ;; *) echo "fake-node: trace run needs an absolute --logfile: $*" >&2; exit 9 ;; esac
lf="${lf//%%/@P@}"; lf="${lf//%p/$$}"; lf="${lf//@P@/%}"
n=0
for f in "$(dirname "$lf")"/run.*.out; do [ ! -e "$f" ] || n=$((n + 1)); done
[ "$n" -ge 1 ] || n=1
src=./map.log; [ ! -f "./map.$n.log" ] || src="./map.$n.log"
[ -f "$src" ] || { echo "fake-node: no $src in $PWD" >&2; exit 8; }
cp "$src" "$(dirname "$lf")/isolate-0x7508000000-$$-$(basename "$lf")" || exit 8
out=./out.txt; [ ! -f "./out.$n.txt" ] || out="./out.$n.txt"
[ -f "$out" ] || { echo "fake-node: no $out in $PWD" >&2; exit 8; }
cat "$out"
if [ -f ./rc ]; then exit "$(cat ./rc)"; fi
exit 0
