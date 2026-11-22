#!/usr/bin/env bash
# Reproducible V8 shape-tracing probe suite backing research/shape-diff/RESEARCH.md.
# Run: /bin/bash research/shape-diff/probes/run-probes.sh
set -euo pipefail
export LC_ALL=C

DIR=$(cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN="${NODE:-node}"
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)

T=$(mktemp -d "${TMPDIR:-/tmp}/sd-probes.XXXXXX")
trap 'rm -rf -- "$T"' EXIT

VER=$("${PROBE_ENV[@]}" "$NODE_BIN" --version)
PA=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.platform + "-" + process.arch')
V8V=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.versions.v8')
echo "HOST: node=$VER v8=$V8V target=$PA bash=$BASH_VERSION"
echo ""

echo "=== 1. Log size: --log-maps (with details) vs --no-log-maps-details on unstable-all.mjs ==="
mkdir "$T/sz1" "$T/sz2"
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/sz1/run.log" "$DIR/unstable-all.mjs" >/dev/null 2>&1
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --no-log-maps-details --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/sz2/run.log" "$DIR/unstable-all.mjs" >/dev/null 2>&1
shopt -s nullglob
LF1=("$T"/sz1/isolate-0x*-*-run.log)
LF2=("$T"/sz2/isolate-0x*-*-run.log)
shopt -u nullglob
printf '  with details:    %s bytes  (%s lines)\n' "$(wc -c <"${LF1[0]}" | tr -d ' ')" "$(wc -l <"${LF1[0]}" | tr -d ' ')"
printf '  no-map-details:  %s bytes  (%s lines)\n' "$(wc -c <"${LF2[0]}" | tr -d ' ')" "$(wc -l <"${LF2[0]}" | tr -d ' ')"
echo ""

echo "=== 2. Verbatim --log-maps + stdout lines on unstable-all.mjs ==="
mkdir "$T/u"
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --trace-elements-transitions --trace-generalization \
  --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/u/run.log" "$DIR/unstable-all.mjs" >"$T/u/run.out" 2>&1
shopt -s nullglob; LFU=("$T"/u/isolate-0x*-*-run.log); shopt -u nullglob
echo "-- stdout (elements transition + [generalizing] for unstable-all.mjs) --"
grep "unstable-all.mjs" "$T/u/run.out" || true
echo "-- --log-maps event \$1 counts --"
awk -F, '{ c[$1]++ } END { for (k in c) printf "%6d  %s\n", c[k], k }' "${LFU[0]}" | sort -rn
echo "-- --log-maps map \$2 counts --"
awk -F, '$1 == "map" { c[$2]++ } END { for (k in c) printf "%6d  %s\n", c[k], k }' "${LFU[0]}" | sort -rn
echo "-- --log-maps lines attributed to unstable-all.mjs (with map-details elements kind) --"
awk -F, '
  function hex(s, i,v) { v=0; s=tolower(substr(s,3)); for(i=1;i<=length(s);i++) v=v*16+index("0123456789abcdef",substr(s,i,1))-1; return v }
  $1 == "map-details" { if (match($0, /elements kind: [A-Z0-9_]+/)) ek[$3] = substr($0, RSTART+15, RLENGTH-15); next }
  $1 == "code-creation" { n++; cs[n]=hex($5); ce[n]=cs[n]+$6; cn[n]=$7; mine[n]=(index($7,"unstable-all.mjs")>0) }
  $1 == "map" {
    p=hex($6); if (p==0) next
    h=0; for(i=n;i>=1;i--) if(p>=cs[i]&&p<ce[i]) { h=i; break }
    if (h && mine[h]) {
      extra = (ek[$4] != "" && ek[$5] != "" && ek[$4] != ek[$5]) ? ("  [EK: " ek[$4] " -> " ek[$5] "]") : ""
      print $0 extra
    }
  }
' "${LFU[0]}"
echo ""

echo "=== 3. Verbatim clean-and-literal.mjs ({a: i, b: 2} v{None} init + benign anon Symbol()) ==="
mkdir "$T/cl"
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --trace-elements-transitions --trace-generalization \
  --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/cl/run.log" "$DIR/clean-and-literal.mjs" >"$T/cl/run.out" 2>&1
shopt -s nullglob; LFCL=("$T"/cl/isolate-0x*-*-run.log); shopt -u nullglob
echo "-- stdout for clean-and-literal.mjs --"
grep "clean-and-literal.mjs" "$T/cl/run.out" || true
echo "-- map lines with symbol() in clean-and-literal.mjs --"
awk -F, '
  function hex(s, i,v) { v=0; s=tolower(substr(s,3)); for(i=1;i<=length(s);i++) v=v*16+index("0123456789abcdef",substr(s,i,1))-1; return v }
  $1 == "map-details" { if (match($0, /elements kind: [A-Z0-9_]+/)) ek[$3] = substr($0, RSTART+15, RLENGTH-15); next }
  $1 == "code-creation" { n++; cs[n]=hex($5); ce[n]=cs[n]+$6; mine[n]=(index($7,"clean-and-literal.mjs")>0) }
  $1 == "map" && $10 ~ /^symbol\(/ {
    p=hex($6); h=0; for(i=n;i>=1;i--) if(p>=cs[i]&&p<ce[i]) { h=i; break }
    if (h && mine[h]) print $0 "  [EK: " ek[$4] " -> " ek[$5] "]"
  }
' "${LFCL[0]}"
echo ""

echo "=== 4. Compiled vs Ran (uncalled.mjs: default lazy, --no-lazy --always-sparkplug, --log-function-events, --log-ic) ==="
mkdir "$T/uc1" "$T/uc2" "$T/uc3"
"${PROBE_ENV[@]}" "$NODE_BIN" --log-function-events --log-maps --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/uc1/run.log" "$DIR/uncalled.mjs" >/dev/null 2>&1
shopt -s nullglob; LFU1=("$T"/uc1/isolate-0x*-*-run.log); shopt -u nullglob
SID=$(awk -F, '$1 == "script-details" && $3 ~ /uncalled\.mjs/ { print $2 }' "${LFU1[0]}")
echo "-- default lazy (--log-function-events + --log-maps) --"
awk -F, -v sid="$SID" '($1 == "code-creation" && $7 ~ /uncalled\.mjs/) || ($1 == "function" && $3 == sid && $2 == "interpreter") { print }' "${LFU1[0]}"

"${PROBE_ENV[@]}" "$NODE_BIN" --no-lazy --always-sparkplug --log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/uc2/run.log" "$DIR/uncalled.mjs" >/dev/null 2>&1
shopt -s nullglob; LFU2=("$T"/uc2/isolate-0x*-*-run.log); shopt -u nullglob
echo "-- --no-lazy --always-sparkplug (--log-code) --"
awk -F, '$1 == "code-creation" && $7 ~ /uncalled\.mjs/ { print }' "${LFU2[0]}"

"${PROBE_ENV[@]}" "$NODE_BIN" --no-lazy --no-lazy-feedback-allocation --log-ic --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/uc3/run.log" "$DIR/uncalled.mjs" >/dev/null 2>&1
shopt -s nullglob; LFU3=("$T"/uc3/isolate-0x*-*-run.log); shopt -u nullglob
echo "-- --no-lazy --no-lazy-feedback-allocation --log-ic (IC fires ONLY on calledOnce) --"
awk -F, '
  function hex(s, i,v) { v=0; s=tolower(substr(s,3)); for(i=1;i<=length(s);i++) v=v*16+index("0123456789abcdef",substr(s,i,1))-1; return v }
  $1 == "code-creation" && $7 ~ /uncalled\.mjs/ { n++; cs[n]=hex($5); ce[n]=cs[n]+$6; cn[n]=$7; print "CODE: " $0 }
  $1 ~ /IC$/ { p=hex($2); for(i=n;i>=1;i--) if(p>=cs[i]&&p<ce[i]) { print "IC(" cn[i] "): " $0; break } }
' "${LFU3[0]}"
echo ""

echo "=== 5. Builtin blind spots: push-silent.mjs + builtins-dirty.mjs ==="
mkdir "$T/ps" "$T/bd"
"${PROBE_ENV[@]}" "$NODE_BIN" --allow-natives-syntax --log-maps --trace-elements-transitions --trace-generalization \
  --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/ps/run.log" "$DIR/push-silent.mjs" >"$T/ps/run.out" 2>&1
echo "-- push-silent.mjs stdout (excluding node:* modules and Node bootstrap from+0) --"
grep -E "^(PUSH_PROOF:|elements transition|\[generalizing\])" "$T/ps/run.out" | grep -v "at node:" | grep -v "in from+0" | grep -v " \[\]$" || true

"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --trace-elements-transitions --trace-generalization \
  --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/bd/run.log" "$DIR/builtins-dirty.mjs" >"$T/bd/run.out" 2>&1
shopt -s nullglob; LFBD=("$T"/bd/isolate-0x*-*-run.log); shopt -u nullglob
echo "-- builtins-dirty.mjs unattributed elements transitions (stdout) --"
grep "^elements transition" "$T/bd/run.out" | grep "<unknown>" || true
echo "-- builtins-dirty.mjs Reflect.deleteProperty map line (with owner) --"
awk -F, '
  function hex(s, i,v) { v=0; s=tolower(substr(s,3)); for(i=1;i<=length(s);i++) v=v*16+index("0123456789abcdef",substr(s,i,1))-1; return v }
  $1 == "code-creation" { n++; cs[n]=hex($5); ce[n]=cs[n]+$6; cn[n]=$2 ":" $7 }
  $1 == "map" && $9 == "DeletingProperty" {
    p=hex($6); h=0; for(i=n;i>=1;i--) if(p>=cs[i]&&p<ce[i]) { h=i; break }
    print $0 "  [OWNER=" (h ? cn[h] : "NONE") "]"
  }
' "${LFBD[0]}"
echo ""

echo "=== 6. Per-run entropy check (2 consecutive runs of unstable-all.mjs + clean-and-literal.mjs) ==="
mkdir "$T/e1" "$T/e2"
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --trace-generalization --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/e1/run.log" "$DIR/unstable-all.mjs" >"$T/e1/run.out" 2>&1
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --trace-generalization --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/e2/run.log" "$DIR/unstable-all.mjs" >"$T/e2/run.out" 2>&1
echo "-- Class(0x...) pointer changes across runs --"
grep "Holder" "$T/e1/run.out" || true
grep "Holder" "$T/e2/run.out" || true
mkdir "$T/s1" "$T/s2"
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/s1/run.log" "$DIR/clean-and-literal.mjs" >/dev/null 2>&1
"${PROBE_ENV[@]}" "$NODE_BIN" --log-maps --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot \
  "--logfile=$T/s2/run.log" "$DIR/clean-and-literal.mjs" >/dev/null 2>&1
shopt -s nullglob; LFS1=("$T"/s1/isolate-0x*-*-run.log); LFS2=("$T"/s2/isolate-0x*-*-run.log); shopt -u nullglob
echo "-- Symbol() hash changes across runs --"
awk -F, '$1 == "map" && $7 == 25 && $10 ~ /^symbol\(/ { print "run1: " $0 }' "${LFS1[0]}"
awk -F, '$1 == "map" && $7 == 25 && $10 ~ /^symbol\(/ { print "run2: " $0 }' "${LFS2[0]}"
