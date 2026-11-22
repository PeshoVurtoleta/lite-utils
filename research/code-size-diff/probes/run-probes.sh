#!/usr/bin/env bash
# Reproducible V8 --log-code probe suite backing research/code-size-diff/RESEARCH.md.
# Run: /bin/bash research/code-size-diff/probes/run-probes.sh
set -euo pipefail
export LC_ALL=C

DIR=$(cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN="${NODE:-node}"
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)
BASE_FLAGS=(--log-code --no-concurrent-recompilation --no-node-snapshot)

T=$(mktemp -d "${TMPDIR:-/tmp}/csd-probes.XXXXXX")
trap 'rm -rf -- "$T"' EXIT

VER=$("${PROBE_ENV[@]}" "$NODE_BIN" --version)
PA=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.platform + "-" + process.arch')
V8V=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.versions.v8')
echo "HOST: node=$VER v8=$V8V target=$PA bash=$BASH_VERSION"
echo ""

run_one() { # tag extra_flags_csv script_path
  local tag="$1" xflags="$2" scr="$3"
  local rd="$T/$tag"
  local -a xf=()
  mkdir -p "$rd"
  if [[ -n "$xflags" ]]; then IFS=',' read -r -a xf <<< "$xflags"; fi
  "${PROBE_ENV[@]}" "$NODE_BIN" ${xf[@]+"${xf[@]}"} "${BASE_FLAGS[@]}" "--logfile=$rd/run.log" "$scr" >/dev/null 2>&1
  shopt -s nullglob; local lf=("$rd"/isolate-0x*-*-run.log); shopt -u nullglob
  printf '%s' "${lf[0]}"
}

echo "=== 1. Markers (default flags + --no-maglev) ==="
LF1=$(run_one m-def "" "$DIR/markers.mjs")
LF2=$(run_one m-nomag "--no-maglev" "$DIR/markers.mjs")
echo "-- default --"
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /markers\.mjs/ { print }' "$LF1"
echo "-- --no-maglev --"
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /markers\.mjs/ { print }' "$LF2"
echo "-- distinct markers observed across both runs --"
{ awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /markers\.mjs/ { print $9 }' "$LF1"
  awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /markers\.mjs/ { print $9 }' "$LF2"; } | sort -u | tr '\n' ' '; echo ""
echo ""

echo "=== 2. Bloat pair (bloat-before.mjs vs bloat-after.mjs) ==="
LFB=$(run_one bloat-b "" "$DIR/bloat-before.mjs")
LFA=$(run_one bloat-a "" "$DIR/bloat-after.mjs")
echo "-- before --"
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /bloat-before\.mjs/ { print }' "$LFB"
echo "-- after --"
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /bloat-after\.mjs/ { print }' "$LFA"
echo ""

echo "=== 3. Deopt-recompile churn + --turbolev marker collision ==="
LFD1=$(run_one deopt-def "" "$DIR/deopt-reopt.mjs")
LFD2=$(run_one deopt-tl "--turbolev" "$DIR/deopt-reopt.mjs")
echo "-- default --"
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /deopt-reopt\.mjs/ { print }' "$LFD1"
echo "-- --turbolev --"
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /deopt-reopt\.mjs/ { print }' "$LFD2"
echo ""

echo "=== 4. ASLR heap-constant stability (8 runs) ==="
first=""
same=0
for k in 1 2 3 4 5 6 7 8; do
  LF=$(run_one "aslr-$k" "" "$DIR/aslr-const.mjs")
  sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /aslr-const\.mjs/ { split($7,a," "); printf "%s:%s:%s ", a[1], $9, $6 }' "$LF")
  if [[ -z "$first" ]]; then first="$sig"; fi
  if [[ "$sig" == "$first" ]]; then same=$((same + 1)); fi
done
echo "8-run identical: $same/8  sig=$first"
echo ""

echo "=== 5. Sparkplug 10-run repeatability (default --concurrent-sparkplug vs --no-concurrent-sparkplug) ==="
for mode in "default" "no-conc-sp"; do
  xf=""
  if [[ "$mode" == "no-conc-sp" ]]; then xf="--no-concurrent-sparkplug"; fi
  first=""
  same=0
  diffs=""
  for k in 1 2 3 4 5 6 7 8 9 10; do
    LF=$(run_one "sp-$mode-$k" "$xf" "$DIR/sparkplug-10x.mjs")
    sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /sparkplug-10x\.mjs/ { split($7,a," "); printf "%s:%s:%s ", a[1], $9, $6 }' "$LF")
    if [[ -z "$first" ]]; then first="$sig"; fi
    if [[ "$sig" == "$first" ]]; then same=$((same + 1))
    else diffs="${diffs}    run $k DIFFERS: $sig"$'\n'
    fi
  done
  echo "  [$mode] 10-run identical: $same/10"
  echo "    run 1: $first"
  if [[ -n "$diffs" ]]; then printf '%s' "$diffs"; fi
done
echo ""

echo "=== 6. Comma escaping in path (a,b/drv.mjs) ==="
mkdir -p "$T/a,b"
cp "$DIR/bloat-before.mjs" "$T/a,b/drv.mjs"
LFC=$(run_one comma "" "$T/a,b/drv.mjs")
awk -F, '$1 == "code-creation" && $7 ~ /drv\.mjs/ { print "NF=" NF "  " $0 }' "$LFC" | head -n 3
echo ""

echo "=== 7. Getter + plain fn (getter-order.mjs) ==="
LFG=$(run_one getter "" "$DIR/getter-order.mjs")
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /getter-order\.mjs/ { print }' "$LFG"
echo ""

echo "=== 8. S-8 natives control (natives-ctrl.mjs) ==="
LFN=$(run_one natives "--allow-natives-syntax" "$DIR/natives-ctrl.mjs")
awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /natives-ctrl\.mjs/ { print }' "$LFN"
echo ""

echo "=== 9. Event field-1 inventory on bloat-before.mjs ==="
awk -F, '{ c[$1]++ } END { for (k in c) printf "%6d  %s\n", c[k], k }' "$LFB" | sort -rn
