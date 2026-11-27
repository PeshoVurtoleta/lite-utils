#!/usr/bin/env bash
# Self-checking V8 --log-code probe & end-to-end verification suite for research/code-size-diff/ (v4).
# Exits 0 iff EVERY assertion passes; exits 1 on any failure (cannot pass silently on drift).
# Run: /bin/bash research/code-size-diff/probes/run-probes.sh
# Optional: NODE=/path/to/node /bin/bash research/code-size-diff/probes/run-probes.sh
set -euo pipefail
export LC_ALL=C

DIR=$(cd -- "$(dirname -- "$0")" && pwd)
PROTO="$DIR/../code-size-diff.prototype.sh"
NODE_BIN="${NODE:-node}"
PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS -u NODE)
# Exact same TRACE_FLAGS as code-size-diff.prototype.sh
BASE_FLAGS=(--log-code --no-concurrent-recompilation --no-concurrent-sparkplug --no-node-snapshot)

T=$(mktemp -d "${TMPDIR:-/tmp}/csd-probes.XXXXXX")
trap 'rm -rf -- "$T"' EXIT

VER=$("${PROBE_ENV[@]}" "$NODE_BIN" --version)
PA=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.platform + "-" + process.arch')
V8V=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.versions.v8')
MAJOR=${VER#v}; MAJOR=${MAJOR%%.*}
BAD_PA="linux-x64"; [[ "$PA" != "linux-x64" ]] || BAD_PA="darwin-arm64"
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

RUN_ONE_RC=0
RUN_ONE_LF=""
run_one() { # tag extra_flags_csv script_path (sets RUN_ONE_RC and RUN_ONE_LF)
  local tag="$1" xflags="$2" scr="$3"
  local rd="$T/$tag"
  local -a xf=()
  mkdir -p "$rd"
  if [[ -n "$xflags" ]]; then IFS=',' read -r -a xf <<< "$xflags"; fi
  RUN_ONE_RC=0
  ( cd -- "$rd" && exec "${PROBE_ENV[@]}" "$NODE_BIN" ${xf[@]+"${xf[@]}"} "${BASE_FLAGS[@]}" "--logfile=$rd/run.log" "$scr" ) >/dev/null 2>&1 || RUN_ONE_RC=$?
  shopt -s nullglob; local lf=("$rd"/isolate-0x*-*-run.log); shopt -u nullglob
  RUN_ONE_LF="${lf[0]:-}"
}

# A1 (N1): Strict repeatability checker -- requires exit 0, NON-EMPTY signature, and >= min_recs markers
# matching the script basename on EVERY run. Sets REP_SAME and REP_SIG; returns 0 iff all runs pass & match.
REP_SAME=0
REP_SIG=""
repeat_check() { # tag_pfx runs xflags script file_pat min_recs
  local pfx="$1" runs="$2" xflags="$3" scr="$4" fpat="$5" min_recs="$6"
  local k sig cnt first="" same=0
  for k in $(seq 1 "$runs"); do
    run_one "${pfx}-${k}" "$xflags" "$scr"
    if [[ $RUN_ONE_RC -ne 0 || -z "$RUN_ONE_LF" ]]; then
      continue
    fi
    sig=$(awk -F, -v fp="$fpat" '$1 == "code-creation" && $2 == "JS" && index($7, fp) > 0 { split($7,a," "); printf "%s:%s:%s ", a[1], $9, $6 }' "$RUN_ONE_LF")
    cnt=$(awk -F, -v fp="$fpat" '$1 == "code-creation" && $2 == "JS" && index($7, fp) > 0 { n++ } END { print n + 0 }' "$RUN_ONE_LF")
    if [[ -z "$sig" || "$cnt" -lt "$min_recs" ]]; then
      continue
    fi
    [[ -n "$first" ]] || first="$sig"
    [[ "$sig" == "$first" ]] && same=$((same + 1))
  done
  REP_SAME=$same
  REP_SIG="${first% }"
  [[ "$same" -eq "$runs" && -n "$first" ]]
}

echo "=== 1. Tier markers, numeric CodeKind (\$3) table & 0 empty markers (markers.mjs) ==="
run_one m-def "" "$DIR/markers.mjs"; LF1="$RUN_ONE_LF"
run_one m-nomag "--no-maglev" "$DIR/markers.mjs"; LF2="$RUN_ONE_LF"
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
# A5 (N4): print observed $3 numeric CodeKind table and $1 event inventory directly from the trace
ck_tab=$(awk -F, '
  $1 == "code-creation" && ($2 == "Builtin" || $2 == "RegExp") { seen[$2 "=" $3 "(NF=" NF ")"] = 1 }
  $1 == "code-creation" && $2 == "JS" && $9 != "" { seen["JS:" $9 "=" $3] = 1 }
  END { for (k in seen) print k }
' "$LF1" "$LF2" | sort | tr '\n' ' ' | sed 's/ $//')
ev_list=$(awk -F, '{ seen[$1] = 1 } END { for (k in seen) print k }' "$LF1" "$LF2" | sort | tr '\n' ' ' | sed 's/ $//')
echo "  DATA CODEKIND_TABLE ($VER): $ck_tab"
echo "  DATA EVENTS ($VER): $ev_list"

echo "=== 2. Bloat pair via prototype: A/A SAME, line-shifted SAME, bloat DIFF (0 raw TABs) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/bloat-before.mjs" "$DIR/bloat-before.mjs" 2>&1) || rc=$?
assert_eq "A/A bloat-before vs bloat-before -> SAME (rc 0)" "$rc" "0"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/bloat-before.mjs" "$DIR/bloat-shifted.mjs" 2>&1) || rc=$?
assert_eq "line-shifted twin bloat-before vs bloat-shifted -> SAME (rc 0)" "$rc" "0"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/bloat-before.mjs" "$DIR/bloat-after.mjs" 2>&1) || rc=$?
assert_eq "must-fail bloat-before vs bloat-after -> DIFF (rc 1)" "$rc" "1"
has_tab=0; case "$out" in *$'\t'*) has_tab=1 ;; esac
assert_eq "D8: DIFF output contains 0 raw TABs" "$has_tab" "0"
# A5 (N4): print exact REPORTED sizes for bloat-before vs bloat-after
printf '%s\n' "$out" | grep -E 'REPORTED (before|after):' | sed 's/^/  DATA BLOAT /'

echo "=== 3. Defect 1: ambiguous same-named fn across two files -> NO-VERDICT (rc 2) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$DIR/ambig-before.mjs" "$DIR/ambig-after.mjs" 2>&1) || rc=$?
assert_eq "ambiguous hot across ambig-small + ambig-big -> NO-VERDICT (rc 2)" "$rc" "2"
assert_contains "ambiguous hot names ambiguity reason" "$out" "ambiguous function name 'hot'"

echo "=== 4. Deopt churn + --turbolev refusal (A6/A7 reason check) ==="
run_one deopt-def "" "$DIR/deopt-reopt.mjs"; LFD="$RUN_ONE_LF"
opt_cnt=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /deopt-reopt\.mjs/ && $9 ~ /[+*]/ { n++ } END { print n + 0 }' "$LFD")
if [[ "$opt_cnt" -ge 2 ]]; then assert_eq "deopt-reopt triggers >= 2 optimized compiles ($opt_cnt)" "ok" "ok"
else assert_eq "deopt-reopt triggers >= 2 optimized compiles" "$opt_cnt" ">=2"
fi
# A5 (N4): print exact deopt-reopt sizes (default + raw --turbolev on Node >= 26)
deopt_def_sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /deopt-reopt\.mjs/ { split($7,a," "); printf "%s:%s:%s ", (a[1]==""?"<top>":a[1]), $9, $6 }' "$LFD")
echo "  DATA DEOPT_DEFAULT ($VER): $deopt_def_sig"
if [[ "$MAJOR" -ge 26 ]]; then
  run_one deopt-tl "--turbolev" "$DIR/deopt-reopt.mjs"; LFT="$RUN_ONE_LF"
  deopt_tl_sig=$(awk -F, '$1 == "code-creation" && $2 == "JS" && $7 ~ /deopt-reopt\.mjs/ { split($7,a," "); printf "%s:%s:%s ", (a[1]==""?"<top>":a[1]), $9, $6 }' "$LFT")
  echo "  DATA DEOPT_TURBOLEV ($VER): $deopt_tl_sig"
fi
# A6/A7: --turbolev refused pre-spawn on ALL Node versions with exact reason text
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--turbolev" --report --fn deoptReopt "$DIR/deopt-reopt.mjs" 2>&1) || rc=$?
assert_eq "--turbolev refused exit 2" "$rc" "2"
assert_contains "A7: --turbolev refusal prints Turbolev reason" "$out" "Turbolev logs identical"

echo "=== 5. ASLR heap-constant stability (8 runs) + A1/N1 throwing must-fail control ==="
rc=0; repeat_check "aslr" 8 "" "$DIR/aslr-const.mjs" "aslr-const.mjs" 2 || rc=$?
assert_eq "ASLR heap-constant stability 8/8 identical non-empty ($PA)" "$rc:$REP_SAME/8" "0:8/8"
echo "  DATA ASLR ($VER): $REP_SIG"
printf 'throw new Error("A1-N1-must-fail");\n' > "$T/throw-ctrl.mjs"
rc=0; repeat_check "throw" 2 "" "$T/throw-ctrl.mjs" "throw-ctrl.mjs" 1 || rc=$?
if [[ "$rc" -ne 0 && "$REP_SAME" -eq 0 ]]; then
  assert_eq "A1/N1 must-fail: throwing driver FAILS repeatability lane (0/2, rc!=0)" "ok" "ok"
else
  assert_eq "A1/N1 must-fail: throwing driver FAILS repeatability lane" "rc=$rc same=$REP_SAME/2" "rc!=0 same=0/2"
fi

echo "=== 6. Sparkplug 10-run stability under --no-concurrent-sparkplug ==="
rc=0; repeat_check "sp" 10 "" "$DIR/sparkplug-10x.mjs" "sparkplug-10x.mjs" 3 || rc=$?
assert_eq "Sparkplug 10-run repeatability non-empty under --no-concurrent-sparkplug" "$rc:$REP_SAME/10" "0:10/10"
echo "  DATA SPARKPLUG ($VER): $REP_SIG"

echo "=== 7. Comma escaping in path (a,b/drv.mjs) ==="
mkdir -p "$T/a,b"
cp "$DIR/bloat-before.mjs" "$T/a,b/drv.mjs"
run_one comma "" "$T/a,b/drv.mjs"; LFC="$RUN_ONE_LF"
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
printf '%s\n' "$o1" | grep -E '  (get|get value): OK|REPORTED all tiers:' | sed 's/^/  DATA GETTER /'

echo "=== 9. S-8 natives control: must-SAME + must-DIFF through prototype + 20-run repeatability ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--allow-natives-syntax" --fn natFn "$DIR/natives-ctrl.mjs" "$DIR/natives-ctrl.mjs" 2>&1) || rc=$?
assert_eq "S-8 natives must-SAME -> SAME (rc 0)" "$rc" "0"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--allow-natives-syntax" --fn natFn "$DIR/natives-ctrl.mjs" "$DIR/natives-diff.mjs" 2>&1) || rc=$?
assert_eq "S-8 natives must-DIFF -> DIFF (rc 1)" "$rc" "1"
printf '%s\n' "$out" | grep -E 'REPORTED (before|after):' | sed 's/^/  DATA NATIVES_DIFF /'
rc=0; repeat_check "nat" 20 "--allow-natives-syntax" "$DIR/natives-ctrl.mjs" "natives-ctrl.mjs" 2 || rc=$?
assert_eq "S-8 natives 20-run determinism non-empty ($REP_SIG)" "$rc:$REP_SAME/20" "0:20/20"

echo "=== 10. Gate --platform-arch mismatch + --out artifacts + D3 allowlist (A7 reasons) ==="
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --max hot=5000 --node-version "$VER" --platform-arch "$BAD_PA" "$DIR/bloat-before.mjs" 2>&1) || rc=$?
assert_eq "D1 --platform-arch mismatch -> NO-VERDICT (rc 2)" "$rc" "2"
assert_contains "A7: --platform-arch mismatch prints reason" "$out" "platform-arch mismatch: got $PA, want $BAD_PA"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --max hot=5000 --node-version "$VER" --platform-arch "$PA" --out "$T/gate-out" "$DIR/bloat-before.mjs" 2>&1) || rc=$?
assert_eq "gate matching version + platform-arch + --out -> WITHIN (rc 0)" "$rc" "0"
has_out=0
[[ -s "$T/gate-out/report.txt" && -s "$T/gate-out/raw/one/run.1.log" && -s "$T/gate-out/raw/one/run.2.log" ]] && has_out=1
assert_eq "--out wrote report.txt + raw/one/run.{1,2}.log" "$has_out" "1"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --v8-flags "--inspect" --report --fn hot "$DIR/bloat-before.mjs" 2>&1) || rc=$?
assert_eq "D3 allowlist refuses --inspect (rc 2)" "$rc" "2"
assert_contains "A7: --inspect refusal prints allowlist reason" "$out" "--v8-flags must not set --inspect:"

echo "=== 11. Shape-diff 1.2.0 lessons live (C1 SYMLINK/, C2 '-' dir, C3 special paths .mjs/.cjs, C4 path-length A/A) ==="
# C1: --out SYMLINK/ and --out SYMLINK/.
mkdir -p "$T/c1-real"
ln -s "$T/c1-real" "$T/c1-sym"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --report --fn hot --out "$T/c1-sym/" "$DIR/bloat-before.mjs" 2>&1) || rc=$?
assert_eq "C1: --out SYMLINK/ refused (rc 2)" "$rc" "2"
assert_contains "C1: --out SYMLINK/ prints symlink reason" "$out" "is a symlink (refused)"

# C2: driver in a directory named '-'
mkdir -p "$T/c2work/-"
cp "$DIR/bloat-before.mjs" "$T/c2work/-/drv.mjs"
rc=0; out=$(cd "$T/c2work" && OLDPWD=/nonexistent_csd_oldpwd /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --report --fn hot -- -/drv.mjs 2>&1) || rc=$?
assert_eq "C2: driver in '-' dir runs cleanly (rc 0)" "$rc" "0"
assert_contains "C2: driver in '-' dir emits VERDICT OK" "$out" "VERDICT OK"

# C3: special-char driver paths (.mjs AND .cjs) vs plain driver -> SAME with non-zero REPORTED sizes
mkdir -p "$T/c3-plain"
cp "$DIR/bloat-before.mjs" "$T/c3-plain/drv.mjs"
cp "$DIR/bloat-before.mjs" "$T/c3-plain/drv.cjs"
c3_dirs=("sp dir" "a,b" "x [1]" "x for 0x1" "q'dir" 'q"dir' "c:dir")
c3_fail=0
for ext in mjs cjs; do
  for dname in "${c3_dirs[@]}"; do
    mkdir -p "$T/c3-$ext/$dname"
    cp "$DIR/bloat-before.mjs" "$T/c3-$ext/$dname/drv.$ext"
    rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$T/c3-plain/drv.$ext" "$T/c3-$ext/$dname/drv.$ext" 2>&1) || rc=$?
    has_rep=0
    case "$out" in *"REPORTED after:"*B*) has_rep=1 ;; esac
    if [[ "$rc" -ne 0 || "$has_rep" -ne 1 ]]; then
      c3_fail=$((c3_fail + 1))
      printf '  C3 FAIL (%s, dir=[%s]): rc=%s has_rep=%s\n%s\n' "$ext" "$dname" "$rc" "$has_rep" "$out"
    fi
  done
done
assert_eq "C3: all 7 special-char dirs x (.mjs, .cjs) = 14 pairs -> SAME with non-zero bytes" "$c3_fail" "0"

# C4: path-length A/A (short vs >120-char longer dir) -> SAME with non-zero REPORTED sizes
mkdir -p "$T/c4/s" "$T/c4/very_long_directory_name_0123456789_abcdefghij_klmnopqrstuvwxyz_0123456789/nested_subdir_padding_0123456789"
cp "$DIR/bloat-before.mjs" "$T/c4/s/drv.mjs"
cp "$DIR/bloat-before.mjs" "$T/c4/very_long_directory_name_0123456789_abcdefghij_klmnopqrstuvwxyz_0123456789/nested_subdir_padding_0123456789/drv.mjs"
rc=0; out=$(/bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --fn hot "$T/c4/s/drv.mjs" "$T/c4/very_long_directory_name_0123456789_abcdefghij_klmnopqrstuvwxyz_0123456789/nested_subdir_padding_0123456789/drv.mjs" 2>&1) || rc=$?
c4_nz=0; case "$out" in *"REPORTED before:"*B*"REPORTED after:"*B*) c4_nz=1 ;; esac
assert_eq "C4: path-length A/A -> SAME with non-zero REPORTED bytes" "$rc:$c4_nz" "0:1"

echo ""
if [[ $FAILS -eq 0 ]]; then
  echo "code-size-diff probes ($VER): $OKS assertion(s) ok"
  exit 0
else
  echo "code-size-diff probes ($VER): $FAILS assertion(s) FAILED ($OKS ok)"
  exit 1
fi
