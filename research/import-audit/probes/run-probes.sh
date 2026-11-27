#!/usr/bin/env bash
# Self-checking probe suite for research/import-audit/import-audit.prototype.sh.
# Pure bash 3.2 + POSIX awk + node (zero Python) -- portable to macOS and Linux CI legs.
# Exits 0 iff EVERY assertion passes and EVERY lane measured >= 1 case; exits 1 otherwise.
#
# Usage:
#   probes/run-probes.sh [--node BIN]
set -euo pipefail
export LC_ALL=C
unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS
unset CDPATH

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
DROP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
PROTO="$DROP_DIR/import-audit.prototype.sh"

NODE_BIN="${NODE:-/opt/homebrew/bin/node}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --node) [[ $# -ge 2 ]] || { echo "run-probes.sh: --node needs a value" >&2; exit 2; }; NODE_BIN="$2"; shift 2 ;;
    --node=*) NODE_BIN="${1#*=}"; shift ;;
    *) echo "run-probes.sh: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -x "$NODE_BIN" ]] || { echo "run-probes.sh: node not executable: $NODE_BIN" >&2; exit 2; }
[[ -f "$PROTO" ]] || { echo "run-probes.sh: prototype not found: $PROTO" >&2; exit 2; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/ia-probes.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

PROBE_ENV=(env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS -u NODE)
sha8() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print substr($1,1,8)}'; }

NODE_VER=$("${PROBE_ENV[@]}" "$NODE_BIN" --version)
V8_VER=$("${PROBE_ENV[@]}" "$NODE_BIN" -p 'process.versions.v8')
PROTO_SHA=$(sha8 "$PROTO")
UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOAD1=$(uptime | awk -F'load averages?: ' '{print $2}' | awk '{gsub(/,/, "", $1); print $1}')

echo "# import-audit probes/run-probes.sh"
echo "PROVENANCE utc=$UTC node=$NODE_VER v8=$V8_VER bin=$NODE_BIN proto_sha8=$PROTO_SHA load1=$LOAD1"
echo ""

TOTAL=0
PASS=0
FAIL=0

record_result() { # lane id status detail
  TOTAL=$((TOTAL + 1))
  if [[ "$3" == "PASS" ]]; then
    PASS=$((PASS + 1))
    printf 'PASS [%-8s] %-26s %s\n' "$1" "$2" "$4"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL [%-8s] %-26s %s\n' "$1" "$2" "$4"
  fi
}

# Check helper: returns 0 iff verdict/rc, non-empty baseline (when CLEAN/DIRTY), and required substrings match
verify_output() { # got_rc want_rc out_text want_verdict require_substr1 [require_substr2 ...]
  local grc="$1" wrc="$2" txt="$3" wv="$4"
  shift 4
  [[ "$grc" == "$wrc" ]] || return 1
  case "$txt" in *"VERDICT $wv"*) ;; *) return 1 ;; esac
  if [[ "$wv" == "CLEAN" || "$wv" == "DIRTY" ]]; then
    # Anti-zero-evidence gate: baseline snapshot MUST be reported with globals>=10 and protos>=50
    local bl
    bl=$(printf '%s\n' "$txt" | awk '/baseline snapshot: globals=[0-9]+ protos=[0-9]+ resources=[0-9]+/{print; exit}' || true)
    [[ -n "$bl" ]] || return 1
    local g p
    g=$(printf '%s\n' "$bl" | sed -n 's/.*globals=\([0-9][0-9]*\).*/\1/p')
    p=$(printf '%s\n' "$bl" | sed -n 's/.*protos=\([0-9][0-9]*\).*/\1/p')
    [[ -n "$g" && -n "$p" && "$g" -ge 10 && "$p" -ge 50 ]] || return 1
  fi
  local req
  for req in "$@"; do
    [[ -z "$req" ]] && continue
    case "$txt" in *"$req"*) ;; *) return 1 ;; esac
  done
  return 0
}

# ---------------------------------------------------------------------------------------------
# LANE 0: Control lane proving verify_output FAILS on zero-evidence or wrong token
# ---------------------------------------------------------------------------------------------
LANE0=0
if verify_output 0 0 $'  baseline snapshot: globals=0 protos=0 resources=0 (REPORTED)\nVERDICT CLEAN' CLEAN ""; then
  record_result "lane0" "zero-evidence-reject" "FAIL" "verify_output accepted globals=0 baseline!"
else
  record_result "lane0" "zero-evidence-reject" "PASS" "verify_output rejected empty baseline"
fi
LANE0=$((LANE0 + 1))

if verify_output 1 1 $'  baseline snapshot: globals=60 protos=120 resources=2 (REPORTED)\n  G added foo x1\nVERDICT DIRTY' DIRTY "G added bar x1"; then
  record_result "lane0" "wrong-token-reject" "FAIL" "verify_output accepted wrong record token!"
else
  record_result "lane0" "wrong-token-reject" "PASS" "verify_output rejected mismatched record token"
fi
LANE0=$((LANE0 + 1))

# ---------------------------------------------------------------------------------------------
# LANE 1: Separate premise pre-runs for EVERY must-fail module (fresh node VM per module)
# ---------------------------------------------------------------------------------------------
LANE1=0
PREMISE_CASES=(
  "add-global:add-global.mjs"
  "change-global:change-global.mjs"
  "delete-global:delete-global.mjs"
  "replace-crypto-getter:replace-crypto-getter.mjs"
  "accessor-global-add:accessor-global-add.mjs"
  "replace-array-map:replace-array-map.mjs"
  "symbol-array-proto:symbol-array-proto.mjs"
  "delete-proto-prop:delete-proto-prop.mjs"
  "tamper-primordials:tamper-primordials.mjs"
  "open-timer:open-timer.mjs"
  "unref-timer:unref-timer.mjs"
  "protector-array-iter:protector-array-iter.mjs"
  "throws:throws.mjs"
  "transitive-parent:transitive-parent.mjs"
  "cjs-dirty:cjs-dirty.cjs"
)

for pair in "${PREMISE_CASES[@]}"; do
  cid=${pair%%:*}
  cfile="$SCRIPT_DIR/${pair#*:}"
  prc=0
  pout=$("${PROBE_ENV[@]}" "$NODE_BIN" "$SCRIPT_DIR/check-premises.mjs" "$cid" "$cfile" 2>&1) || prc=$?
  LANE1=$((LANE1 + 1))
  if [[ $prc -eq 0 && "$pout" == *"PREMISE OK [$cid]"* ]]; then
    record_result "premise" "$cid" "PASS" "$pout"
  else
    record_result "premise" "$cid" "FAIL" "rc=$prc out=$pout"
  fi
done

# ---------------------------------------------------------------------------------------------
# LANE 2: Core + A1/A2/A5/A6/B2/B3/B8 matrix through import-audit.prototype.sh
# ---------------------------------------------------------------------------------------------
LANE2=0
run_probe() { # id file want_rc want_verdict extra_args_str req1 [req2 ...]
  local id="$1" file="$2" wrc="$3" wv="$4" extra="$5"
  shift 5
  local grc=0 gout=""
  if [[ -n "$extra" ]]; then
    # shellcheck disable=SC2086
    gout=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" $extra "$file" 2>&1) || grc=$?
  else
    gout=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$file" 2>&1) || grc=$?
  fi
  LANE2=$((LANE2 + 1))
  local bl ygc
  bl=$(printf '%s\n' "$gout" | awk '/baseline snapshot:/{gsub(/^ +/,""); print; exit}' || true)
  ygc=$(printf '%s\n' "$gout" | awk '/young GCs during import/{gsub(/^ +/,""); print; exit}' || true)
  if verify_output "$grc" "$wrc" "$gout" "$wv" "$@"; then
    record_result "matrix" "$id" "PASS" "rc=$grc $wv (${bl:-no-base}; ${ygc:-no-gc})"
  else
    local flat
    flat=$(printf '%s' "$gout" | tr '\n' '|' | cut -c1-240)
    record_result "matrix" "$id" "FAIL" "got_rc=$grc want=$wrc/$wv out=$flat"
  fi
}

run_probe "empty"                  "$SCRIPT_DIR/empty.mjs"                 0 CLEAN      ""            ""
run_probe "add-global"             "$SCRIPT_DIR/add-global.mjs"            1 DIRTY      ""            "G added __ia_added x1"
run_probe "change-global"          "$SCRIPT_DIR/change-global.mjs"         1 DIRTY      ""            "G changed queueMicrotask x1"
run_probe "delete-global"          "$SCRIPT_DIR/delete-global.mjs"         1 DIRTY      ""            "G deleted btoa x1"
run_probe "A5-replace-crypto"      "$SCRIPT_DIR/replace-crypto-getter.mjs" 1 DIRTY      ""            "G changed crypto x1"
run_probe "A1-replace-array-map"   "$SCRIPT_DIR/replace-array-map.mjs"     1 DIRTY      ""            "G proto Array.map [changed] x1"
run_probe "A2-symbol-array-proto"  "$SCRIPT_DIR/symbol-array-proto.mjs"    1 DIRTY      ""            "G proto Array.Symbol(lite.ia.sym) [added] x1"
run_probe "delete-proto-prop"      "$SCRIPT_DIR/delete-proto-prop.mjs"     1 DIRTY      ""            "G proto Array.at [deleted] x1"
run_probe "tamper-primordials"     "$SCRIPT_DIR/tamper-primordials.mjs"    1 DIRTY      ""            "G proto Array.Symbol(Symbol.iterator) [changed] x1" "G proto Object.get [added] x1" "G proto Map.get [changed] x1" "  P "
run_probe "open-timer"             "$SCRIPT_DIR/open-timer.mjs"            1 DIRTY      ""            "H Timeout x1"
run_probe "B6-unref-timer-limit"   "$SCRIPT_DIR/unref-timer.mjs"           0 CLEAN      ""            ""
run_probe "protector-array-iter"   "$SCRIPT_DIR/protector-array-iter.mjs"  1 DIRTY      ""            "G proto Array.Symbol(Symbol.iterator) [changed] x1" "  P "
run_probe "A6-hang-tla"            "$SCRIPT_DIR/hang-tla.mjs"              2 NO-VERDICT "--timeout 1" "timed out after 1s"
run_probe "A6-unsettled-tla"       "$SCRIPT_DIR/unsettled-tla.mjs"         2 NO-VERDICT ""            "driver exited 13"
run_probe "throws"                 "$SCRIPT_DIR/throws.mjs"                2 NO-VERDICT ""            "missing or duplicate R ok"
run_probe "B3-transitive-parent"   "$SCRIPT_DIR/transitive-parent.mjs"     1 DIRTY      ""            "G added __ia_transitive_global x1"
run_probe "B2-cjs-clean"           "$SCRIPT_DIR/cjs-clean.cjs"             0 CLEAN      ""            ""
run_probe "B2-cjs-dirty"           "$SCRIPT_DIR/cjs-dirty.cjs"             1 DIRTY      ""            "G added __ia_cjs_global x1"

# Special check A5-accessor-global-add: DIRTY + G added __ia_trap_getter x1 + getter NEVER invoked!
grc=0; gout=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$SCRIPT_DIR/accessor-global-add.mjs" 2>&1) || grc=$?
LANE2=$((LANE2 + 1))
if verify_output "$grc" 1 "$gout" DIRTY "G added __ia_trap_getter x1" && [[ "$gout" != *"__ia_getter_was_invoked"* ]]; then
  record_result "matrix" "A5-accessor-no-invoke" "PASS" "rc=1 DIRTY; trap getter added and never invoked"
else
  record_result "matrix" "A5-accessor-no-invoke" "FAIL" "rc=$grc out=$(printf '%s' "$gout" | tr '\n' '|')"
fi

# Special check B8-alloc-import: CLEAN (rc 0) AND young GCs > 0 (REPORTED only, never changes verdict!)
grc=0; gout=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$SCRIPT_DIR/alloc-import.mjs" 2>&1) || grc=$?
LANE2=$((LANE2 + 1))
ygc_vals=$(printf '%s\n' "$gout" | sed -n 's/.*young GCs during import per run: \([0-9,]*\).*/\1/p' | head -n 1 || true)
ygc_r1=${ygc_vals%%,*}
if verify_output "$grc" 0 "$gout" CLEAN "" && [[ -n "$ygc_r1" && "$ygc_r1" -ge 1 ]]; then
  record_result "matrix" "B8-alloc-reported-only" "PASS" "rc=0 CLEAN with young_gc=$ygc_vals (>0, REPORTED only)"
else
  record_result "matrix" "B8-alloc-reported-only" "FAIL" "rc=$grc young_gc=${ygc_vals:-none}"
fi

# ---------------------------------------------------------------------------------------------
# LANE 3: C1 tricky paths (space, comma, brackets, quotes, colon, %20, '-' dir) + C2 path-length A/A
# ---------------------------------------------------------------------------------------------
LANE3=0
TRICKY_DIRS=("sp dir" "a,b" "x [1]" "q'dir" 'q"dir' "c:dir" "pct%20dir" "-")
for td in "${TRICKY_DIRS[@]}"; do
  mkdir -p "$WORK/tricky/$td"
  cp "$SCRIPT_DIR/empty.mjs" "$WORK/tricky/$td/m.mjs"
  grc=0
  if [[ "$td" == "-" ]]; then
    gout=$(cd "$WORK/tricky" && OLDPWD=/nonexistent_ia_oldpwd "${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" -- -/m.mjs 2>&1) || grc=$?
  else
    gout=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$WORK/tricky/$td/m.mjs" 2>&1) || grc=$?
  fi
  LANE3=$((LANE3 + 1))
  if verify_output "$grc" 0 "$gout" CLEAN ""; then
    record_result "C1-path" "dir[$td]" "PASS" "rc=0 CLEAN"
  else
    record_result "C1-path" "dir[$td]" "FAIL" "rc=$grc out=$(printf '%s' "$gout" | tr '\n' '|' | cut -c1-180)"
  fi
done

# %20 dirty check (proves pathToFileURL loads the actual file, not a wrong path)
cp "$SCRIPT_DIR/add-global.mjs" "$WORK/tricky/pct%20dir/dirty.mjs"
grc=0; gout=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$WORK/tricky/pct%20dir/dirty.mjs" 2>&1) || grc=$?
LANE3=$((LANE3 + 1))
if verify_output "$grc" 1 "$gout" DIRTY "G added __ia_added x1"; then
  record_result "C1-path" "pct%20dir-dirty" "PASS" "rc=1 DIRTY G added __ia_added x1"
else
  record_result "C1-path" "pct%20dir-dirty" "FAIL" "rc=$grc"
fi

# C2 path-length A/A: short dir vs >120-char nested dir -> identical CLEAN + identical baseline counts
SHORT_D="$WORK/c2/s"
LONG_D="$WORK/c2/long_aaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbb/ccccccccccccccccccccccccc/ddddddddddddddddddddddddd"
mkdir -p "$SHORT_D" "$LONG_D"
cp "$SCRIPT_DIR/empty.mjs" "$SHORT_D/m.mjs"
cp "$SCRIPT_DIR/empty.mjs" "$LONG_D/m.mjs"
rc_s=0; out_s=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$SHORT_D/m.mjs" 2>&1) || rc_s=$?
rc_l=0; out_l=$("${PROBE_ENV[@]}" /bin/bash "$PROTO" --node "$NODE_BIN" "$LONG_D/m.mjs" 2>&1) || rc_l=$?
bl_s=$(printf '%s\n' "$out_s" | awk '/baseline snapshot:/{gsub(/^ +/,""); print; exit}' || true)
bl_l=$(printf '%s\n' "$out_l" | awk '/baseline snapshot:/{gsub(/^ +/,""); print; exit}' || true)
LANE3=$((LANE3 + 1))
if verify_output "$rc_s" 0 "$out_s" CLEAN "" && verify_output "$rc_l" 0 "$out_l" CLEAN "" && [[ "$bl_s" == "$bl_l" ]]; then
  record_result "C2-pathlen" "short-vs-long-AA" "PASS" "both CLEAN; len_s=${#SHORT_D} len_l=${#LONG_D}; $bl_s"
else
  record_result "C2-pathlen" "short-vs-long-AA" "FAIL" "rc_s=$rc_s rc_l=$rc_l bl_s=[$bl_s] bl_l=[$bl_l]"
fi

# ---------------------------------------------------------------------------------------------
# Final lane accounting: FAIL if ANY lane measured 0 cases or ANY assertion failed!
# ---------------------------------------------------------------------------------------------
echo ""
echo "LANES lane0=$LANE0 lane1=$LANE1 lane2=$LANE2 lane3=$LANE3 total=$TOTAL pass=$PASS fail=$FAIL"
if [[ $LANE0 -eq 0 || $LANE1 -eq 0 || $LANE2 -eq 0 || $LANE3 -eq 0 || $FAIL -ne 0 ]]; then
  echo "OVERALL FAIL"
  exit 1
fi
echo "OVERALL PASS"
exit 0
