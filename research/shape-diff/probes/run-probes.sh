#!/usr/bin/env bash
# Self-checking V8 shape-tracing probe & end-to-end verification suite for research/shape-diff/.
# Exits 0 iff EVERY assertion passes; exits 1 on any failure (cannot pass silently on drift).
# Run: /bin/bash research/shape-diff/probes/run-probes.sh
# Optional: NODE=/path/to/node /bin/bash research/shape-diff/probes/run-probes.sh
set -euo pipefail
export LC_ALL=C

DIR=$(cd -- "$(dirname -- "$0")" && pwd)
PROTO="$DIR/../shape-diff.prototype.sh"
NODE_BIN="${NODE:-node}"
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)
BASE_FLAGS=(--log-maps --trace-elements-transitions --trace-generalization --no-sparkplug --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot)

T=$(mktemp -d "${TMPDIR:-/tmp}/sd-probes.XXXXXX")
trap 'rm -rf -- "$T"' EXIT

VER=$("${PROBE_ENV[@]}" "$NODE_BIN" --version)
PA=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.platform + "-" + process.arch')
V8V=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.versions.v8')
MAJOR=${VER#v}; MAJOR=${MAJOR%%.*}
LOAD1=$(uptime 2>/dev/null | sed -n 's/.*load averages*: *\([^ ,]*\).*/\1/p' || echo "?")
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "PROVENANCE: date=$NOW load1=$LOAD1 node=$VER v8=$V8V target=$PA bash=$BASH_VERSION (REPORTED, untimed)"
echo ""

OKS=0; FAILS=0
assert_eq() {
  if [[ "$2" == "$3" ]]; then OKS=$((OKS + 1)); printf 'ok %s\n' "$1"
  else FAILS=$((FAILS + 1)); printf 'FAIL %s: got [%s] want [%s]\n' "$1" "$2" "$3"
  fi
}
assert_contains() {
  case "$2" in
    *"$3"*) OKS=$((OKS + 1)); printf 'ok %s\n' "$1" ;;
    *) FAILS=$((FAILS + 1)); printf 'FAIL %s: missing [%s]\n' "$1" "$3" ;;
  esac
}

echo "=== 1. Raw 3-stream run with --no-sparkplug --no-node-snapshot: rc=0, unresolved_nonzero=0 ==="
mkdir "$T/raw"
rc=0
"${PROBE_ENV[@]}" "$NODE_BIN" "${BASE_FLAGS[@]}" "--logfile=$T/raw/run.log" "$DIR/unstable-all.mjs" >"$T/raw/run.out" 2>&1 || rc=$?
assert_eq "3-stream run with --no-sparkplug exits 0 (fixes Node 22 SIGTRAP)" "$rc" "0"
shopt -s nullglob; LF=("$T"/raw/isolate-0x*-*-run.log); shopt -u nullglob
unres=$(awk -F, '
  function hex(s, i,v){ v=0; s=tolower(substr(s,3)); for(i=1;i<=length(s);i++) v=v*16+index("0123456789abcdef",substr(s,i,1))-1; return v }
  $1 == "code-creation" { n++; cs[n]=hex($5); ce[n]=cs[n]+$6; next }
  $1 == "map" { p=hex($6); if(p==0) next; h=0; for(i=n;i>=1;i--) if(p>=cs[i]&&p<ce[i]) { h=i; break }; if(!h) u++ }
  END { print u+0 }
' "${LF[0]}")
assert_eq "0 unresolved non-zero map pcs (snapshot kept off)" "$unres" "0"
elem_seen=$(grep -c 'elements transition \[PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS\] in ~work+' "$T/raw/run.out" || true)
if [[ "$elem_seen" -ge 1 ]]; then assert_eq "inline elements transition traced on $VER ($elem_seen line)" "ok" "ok"
else assert_eq "inline elements transition traced on $VER" "$elem_seen" ">=1"
fi

echo "=== 2. Node 22/24 N4 + clean A/A: clean-and-literal.mjs vs itself -> SAME (0 instability) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn=Point,makeLit,work "$DIR/clean-and-literal.mjs" "$DIR/clean-and-literal.mjs" 2>&1) || rc=$?
assert_eq "A/A clean-and-literal (incl. {a:i,b:2} + anon Symbol()) -> SAME (rc 0)" "$rc" "0"
assert_contains "makeLit has 0 instability sites (N4 no-op s->s + v{None} filtered)" "$out" "makeLit: SAME -- identical shape-instability multiset (before 0 | after 0 site(s))"

echo "=== 3. D7 + N4 add-field: {a:i,b:2} vs {a:i,b:2,c:3} -> SAME (0 instability) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn mk "$DIR/addf-before.mjs" "$DIR/addf-after.mjs" 2>&1) || rc=$?
assert_eq "add-field addf-before vs addf-after -> SAME (rc 0)" "$rc" "0"
assert_contains "add-field normal transitions 2 -> 3" "$out" "normal-transitions: before=2 after=3"

echo "=== 4. Must-fail DIFF (clean vs unstable-all) + 0 raw TABs + --out artifacts ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --out "$T/sd-out" --fn Point,work "$DIR/clean-and-literal.mjs" "$DIR/unstable-all.mjs" 2>&1) || rc=$?
assert_eq "clean vs unstable-all -> DIFF (rc 1)" "$rc" "1"
assert_contains "DIFF catches GEN x:s->d" "$out" "Point  GEN  x:s{Any;const}->d{Any;const}"
assert_contains "DIFF catches MAP_DEPRECATE" "$out" "Point  MAP_DEPRECATE"
assert_contains "DIFF catches ELEM PACKED_SMI -> PACKED_DOUBLE" "$out" "work  ELEM  PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS"
assert_contains "DIFF catches MAP_ELEM_DICT HOLEY -> DICTIONARY" "$out" "work  MAP_ELEM_DICT  HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS"
assert_contains "DIFF catches MAP_NORMALIZE DeletingProperty" "$out" "work  MAP_NORMALIZE  DeletingProperty"
has_tab=0; case "$out" in *$'\t'*) has_tab=1 ;; esac
assert_eq "DIFF output contains 0 raw TABs" "$has_tab" "0"
has_out=0
[[ -s "$T/sd-out/report.txt" && -s "$T/sd-out/raw/before/run.1.log" && -s "$T/sd-out/raw/after/run.2.out" ]] && has_out=1
assert_eq "--out wrote report.txt + raw/{before,after}/run.{1,2}.{log,out}" "$has_out" "1"

echo "=== 5. N1 non-target user helper (200 calls): helper-clean vs helper-del -> NO-VERDICT (rc 2) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn mk "$DIR/helper-clean.mjs" "$DIR/helper-del.mjs" 2>&1) || rc=$?
assert_eq "N1 non-target helper del() at 200 calls -> NO-VERDICT (rc 2, NOT false SAME)" "$rc" "2"
assert_contains "N1 names user:del in unattributed/external diff" "$out" "user:del"

echo "=== 6. D1 builtin mutations: builtins-clean vs builtins-dirty -> NO-VERDICT (rc 2) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn mutBuiltins "$DIR/builtins-clean.mjs" "$DIR/builtins-dirty.mjs" 2>&1) || rc=$?
assert_eq "D1 Reflect.deleteProperty + splice -> NO-VERDICT (rc 2, NOT false SAME)" "$rc" "2"
assert_contains "D1 names Builtin:ReflectDeleteProperty" "$out" "Builtin:ReflectDeleteProperty"
assert_contains "D1 names splice ELEM" "$out" "UNATTR  ELEM  splice"

echo "=== 7. D2 compiled-but-uncalled -> NO-VERDICT (default lazy & --no-lazy) ==="
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn neverCalledParenFn "$DIR/uncalled.mjs" "$DIR/uncalled.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "D2 neverCalledParenFn (default lazy) -> NO-VERDICT (rc 2)" "$rc" "2"
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--no-lazy" --fn neverCalledTop "$DIR/uncalled.mjs" "$DIR/uncalled.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "D2 neverCalledTop (--no-lazy) -> NO-VERDICT (rc 2)" "$rc" "2"

echo "=== 8. Array.prototype.push(1.5): 1 cold call = 0 lines vs 200 calls = 2 lines ==="
p1_out=$("${PROBE_ENV[@]}" "$NODE_BIN" --allow-natives-syntax --no-sparkplug --trace-elements-transitions "$DIR/push-silent.mjs" 2>&1)
assert_contains "push-silent.mjs proves hadSmi=true hasDouble=true" "$p1_out" "PUSH_PROOF: hadSmi=true hasDouble=true"
c1=$(printf '%s\n' "$p1_out" | grep -c 'in push+' || true)
c200=$("${PROBE_ENV[@]}" "$NODE_BIN" --no-sparkplug --trace-elements-transitions "$DIR/push-200.mjs" 2>&1 | grep -c 'in push+' || true)
assert_eq "push(1 cold call) prints 0 lines; push(200 calls) prints 2 lines" "$c1:$c200" "0:2"

echo "=== 9. D8/D9/N6 CLI refusals ==="
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--inspect" --fn mk "$DIR/addf-before.mjs" "$DIR/addf-before.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "D8 allowlist refuses --inspect (rc 2)" "$rc" "2"
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--always-sparkplug" --fn mk "$DIR/addf-before.mjs" "$DIR/addf-before.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "refuses --always-sparkplug conflict (rc 2)" "$rc" "2"
ln -s "$T/raw" "$T/sym-out"
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --out "$T/sym-out" --fn mk "$DIR/addf-before.mjs" "$DIR/addf-before.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "D9 refuses symlink --out dir itself (rc 2)" "$rc" "2"

echo ""
if [[ $FAILS -eq 0 ]]; then
  echo "shape-diff probes ($VER): $OKS assertion(s) ok"
  exit 0
else
  echo "shape-diff probes ($VER): $FAILS assertion(s) FAILED ($OKS ok)"
  exit 1
fi
