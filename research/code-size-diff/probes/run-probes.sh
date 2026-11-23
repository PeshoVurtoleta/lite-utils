#!/usr/bin/env bash
# Self-checking V8 --log-code probe & end-to-end verification suite for research/code-size-diff/.
# Exits 0 iff EVERY assertion passes; exits 1 on any failure (cannot pass silently on drift).
# Run: /bin/bash research/code-size-diff/probes/run-probes.sh
# Optional: NODE=/path/to/node /bin/bash research/code-size-diff/probes/run-probes.sh
set -euo pipefail
export LC_ALL=C

DIR=$(cd -- "$(dirname -- "$0")" && pwd)
PROTO="$DIR/../code-size-diff.prototype.sh"
NODE_BIN="${NODE:-node}"
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS)
# Exact same TRACE_FLAGS as code-size-diff.prototype.sh
BASE_FLAGS=(--log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot)

T=$(mktemp -d "${TMPDIR:-/tmp}/csd-probes.XXXXXX")
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
assert_eq() { # label got want
  if [[ "$2" == "$3" ]]; then OKS=$((OKS + 1)); printf 'ok %s\n' "$1"
  else FAILS=$((FAILS + 1)); printf 'FAIL %s: got [%s] want [%s]\n' "$1" "$2" "$3"
  fi
}
assert_contains() { # label haystack needle
  case "$2" in
    *"$3"*) OKS=$((OKS + 1)); printf 'ok %s\n' "$1" ;;
    *) FAILS=$((FAILS + 1)); printf 'FAIL %s: missing [%s]\n' "$1" "$3" ;;
  esac
}

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

echo "=== 1. Tier markers & 0 empty markers (markers.mjs) ==="
LF1=$(run_one m-def "" "$DIR/markers.mjs")
LF2=$(run_one m-nomag "--no-maglev" "$DIR/markers.mjs")
empty_cnt=$(awk -F, '$1 == "code-creation" && ($2 == "JS" || $2 == "Eval" || $2 == "Script") && (NF != 9 || $9 == "") { n++ } END { print n + 0 }' "$LF1" "$LF2")
assert_eq "markers: 0 empty or non-9-field JS/Eval/Script records" "$empty_cnt" "0"
got_mk=$({ awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /markers\.mjs/ { print $9 }' "$LF1"
  awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /markers\.mjs/ { print $9 }' "$LF2"; } | sort -u | tr '\n' ' ' | sed 's/ $//')
if [[ "$MAJOR" -ge 26 ]]; then
  assert_eq "markers (Node >= 26): 8 observed markers (* *' + +' ^ o* o+ ~)" "$got_mk" "* *' + +' ^ o* o+ ~"
elif [[ "$MAJOR" -eq 24 ]]; then
  assert_eq "markers (Node 24): 6 observed markers (* *' + +' ^ ~)" "$got_mk" "* *' + +' ^ ~"
else
  assert_eq "markers (Node 22): 3 observed markers (* ^ ~)" "$got_mk" "* ^ ~"
fi

echo "=== 2. Bloat pair via prototype: A/A SAME, line-shifted SAME, bloat DIFF (0 raw TABs) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/bloat-before.mjs" "$DIR/bloat-before.mjs" 2>&1) || rc=$?
assert_eq "A/A bloat-before vs bloat-before -> SAME (rc 0)" "$rc" "0"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/bloat-before.mjs" "$DIR/bloat-shifted.mjs" 2>&1) || rc=$?
assert_eq "line-shifted twin bloat-before vs bloat-shifted -> SAME (rc 0)" "$rc" "0"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/bloat-before.mjs" "$DIR/bloat-after.mjs" 2>&1) || rc=$?
assert_eq "must-fail bloat-before vs bloat-after -> DIFF (rc 1)" "$rc" "1"
has_tab=0; case "$out" in *$'\t'*) has_tab=1 ;; esac
assert_eq "D8: DIFF output contains 0 raw TABs" "$has_tab" "0"

echo "=== 3. Defect 1: ambiguous same-named fn across two files -> NO-VERDICT (rc 2) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/ambig-before.mjs" "$DIR/ambig-after.mjs" 2>&1) || rc=$?
assert_eq "ambiguous hot across ambig-small + ambig-big -> NO-VERDICT (rc 2)" "$rc" "2"
assert_contains "ambiguous hot names ambiguity reason" "$out" "ambiguous function name 'hot'"

echo "=== 4. Deopt churn + --turbolev refusal ==="
LFD=$(run_one deopt-def "" "$DIR/deopt-reopt.mjs")
opt_cnt=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /deopt-reopt\.mjs/ && $9 ~ /[+*]/ { n++ } END { print n + 0 }' "$LFD")
if [[ "$opt_cnt" -ge 2 ]]; then assert_eq "deopt-reopt triggers >= 2 optimized compiles ($opt_cnt)" "ok" "ok"
else assert_eq "deopt-reopt triggers >= 2 optimized compiles" "$opt_cnt" ">=2"
fi
if [[ "$MAJOR" -ge 26 ]]; then
  rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--turbolev" --report --fn deoptReopt "$DIR/deopt-reopt.mjs" 2>&1) || rc=$?
  assert_eq "--turbolev refused exit 2" "$rc" "2"
fi

echo "=== 5. ASLR heap-constant stability (8 runs) ==="
first=""; same=0
for k in 1 2 3 4 5 6 7 8; do
  LF=$(run_one "aslr-$k" "" "$DIR/aslr-const.mjs")
  sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /aslr-const\.mjs/ { split($7,a," "); printf "%s:%s:%s ", a[1], $9, $6 }' "$LF")
  [[ -n "$first" ]] || first="$sig"
  [[ "$sig" == "$first" ]] && same=$((same + 1))
done
assert_eq "ASLR heap-constant stability 8/8 identical ($PA)" "$same/8" "8/8"

echo "=== 6. Sparkplug 10-run stability under --no-concurrent-sparkplug ==="
first=""; same=0
for k in 1 2 3 4 5 6 7 8 9 10; do
  LF=$(run_one "sp-$k" "" "$DIR/sparkplug-10x.mjs")
  sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /sparkplug-10x\.mjs/ { split($7,a," "); printf "%s:%s:%s ", a[1], $9, $6 }' "$LF")
  [[ -n "$first" ]] || first="$sig"
  [[ "$sig" == "$first" ]] && same=$((same + 1))
done
assert_eq "Sparkplug 10-run repeatability under --no-concurrent-sparkplug" "$same/10" "10/10"

echo "=== 7. Comma escaping in path (a,b/drv.mjs) ==="
mkdir -p "$T/a,b"
cp "$DIR/bloat-before.mjs" "$T/a,b/drv.mjs"
LFC=$(run_one comma "" "$T/a,b/drv.mjs")
esc_cnt=$(grep -c 'a\\x2Cb/drv\.mjs' "$LFC" || true)
raw_cnt=$(grep -c 'a,b/drv\.mjs' "$LFC" || true)
if [[ "$esc_cnt" -gt 0 && "$raw_cnt" -eq 0 ]]; then assert_eq "comma in dir escaped as \\x2C ($esc_cnt hits, 0 raw)" "ok" "ok"
else assert_eq "comma in dir escaped as \\x2C" "esc=$esc_cnt raw=$raw_cnt" "esc>0 raw=0"
fi

echo "=== 8. D2 getter + plain fn order independence through prototype ==="
rc1=0; o1=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --report --fn "get,get value" "$DIR/getter-order.mjs" 2>&1) || rc1=$?
rc2=0; o2=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --report --fn "get value,get" "$DIR/getter-order.mjs" 2>&1) || rc2=$?
assert_eq "D2 both orders exit 0" "$rc1:$rc2" "0:0"
assert_contains "D2 'get,get value' reports 'get value'" "$o1" "  get value: OK"
assert_contains "D2 'get value,get' reports 'get'" "$o2" "  get: OK"

echo "=== 9. S-8 natives control: must-SAME + must-DIFF through prototype + 20-run repeatability ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--allow-natives-syntax" --fn natFn "$DIR/natives-ctrl.mjs" "$DIR/natives-ctrl.mjs" 2>&1) || rc=$?
assert_eq "S-8 natives must-SAME -> SAME (rc 0)" "$rc" "0"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--allow-natives-syntax" --fn natFn "$DIR/natives-ctrl.mjs" "$DIR/natives-diff.mjs" 2>&1) || rc=$?
assert_eq "S-8 natives must-DIFF -> DIFF (rc 1)" "$rc" "1"
first=""; same=0
for k in $(seq 1 20); do
  LF=$(run_one "nat-$k" "--allow-natives-syntax" "$DIR/natives-ctrl.mjs")
  sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /natives-ctrl\.mjs/ { split($7,a," "); printf "%s:%s:%s ", a[1], $9, $6 }' "$LF")
  [[ -n "$first" ]] || first="$sig"
  [[ "$sig" == "$first" ]] && same=$((same + 1))
done
assert_eq "S-8 natives 20-run determinism ($first)" "$same/20" "20/20"

echo "=== 10. Gate --platform-arch mismatch + --out artifacts + D3 allowlist ==="
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --max hot=5000 --node-version "$VER" --platform-arch linux-x64 "$DIR/bloat-before.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "D1 --platform-arch mismatch -> NO-VERDICT (rc 2)" "$rc" "2"
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --max hot=5000 --node-version "$VER" --platform-arch "$PA" --out "$T/gate-out" "$DIR/bloat-before.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "gate matching version + platform-arch + --out -> WITHIN (rc 0)" "$rc" "0"
has_out=0
[[ -s "$T/gate-out/report.txt" && -s "$T/gate-out/raw/one/run.1.log" && -s "$T/gate-out/raw/one/run.2.log" ]] && has_out=1
assert_eq "--out wrote report.txt + raw/one/run.{1,2}.log" "$has_out" "1"
rc=0; /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--inspect" --report --fn hot "$DIR/bloat-before.mjs" >/dev/null 2>&1 || rc=$?
assert_eq "D3 allowlist refuses --inspect (rc 2)" "$rc" "2"

echo ""
if [[ $FAILS -eq 0 ]]; then
  echo "code-size-diff probes ($VER): $OKS assertion(s) ok"
  exit 0
else
  echo "code-size-diff probes ($VER): $FAILS assertion(s) FAILED ($OKS ok)"
  exit 1
fi
