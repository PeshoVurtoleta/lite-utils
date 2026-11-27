#!/usr/bin/env bash
# Assert-case runner for research/import-audit/import-audit.prototype.sh (bash 3.2 / macOS BSD userland).
# Usage: run-assert.sh <abs-node-path> <out-log>
# Exit: 0 all rows pass; 1 any MISMATCH or premise failure; 2 runner failure.
# A MISMATCH is a finding about the prototype, not a runner bug. Expectations are frozen in
# ASSERT-EXPECT.tsv and sha-pinned in ASSERT-SHA.txt; this script never learns them from a run.
set -u
export LC_ALL=C
unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS NODE
unset CDPATH

HERE=$(cd -- "$(dirname -- "$0")" && pwd)
PROTO=/Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/import-audit/import-audit.prototype.sh
EXPECT="$HERE/ASSERT-EXPECT.tsv"
SHAFILE="$HERE/ASSERT-SHA.txt"
ROWS_EXPECTED=14

die2() { printf 'run-assert: %s\n' "$*" >&2; exit 2; }

[ $# -eq 2 ] || die2 "usage: run-assert.sh <abs-node-path> <out-log>"
NODE_BIN=$1
LOG=$2
case "$NODE_BIN" in /*) ;; *) die2 "node path must be absolute" ;; esac
case "$LOG" in /*) ;; *) die2 "out-log path must be absolute" ;; esac
[ -x "$NODE_BIN" ] || die2 "node not executable: $NODE_BIN"
[ -f "$PROTO" ] || die2 "prototype not found: $PROTO"
[ -f "$EXPECT" ] || die2 "missing $EXPECT"
[ -f "$SHAFILE" ] || die2 "missing $SHAFILE"

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

# Self-check 1: every pinned file must match its frozen sha256 (expectations first).
: > "$LOG" || die2 "cannot write $LOG"
emit() { printf '%s\n' "$*" | tee -a "$LOG"; }

pinned=0
while IFS= read -r line; do
  case "$line" in
    sha256\ *)
      want=$(printf '%s\n' "$line" | awk '{print $2}')
      name=$(printf '%s\n' "$line" | awk '{print $3}')
      [ -f "$HERE/$name" ] || die2 "pinned file missing: $name"
      got=$(sha256_of "$HERE/$name")
      [ "$got" = "$want" ] || die2 "sha256 differs from ASSERT-SHA.txt for $name (frozen $want, now $got)"
      pinned=$((pinned + 1))
      ;;
  esac
done < "$SHAFILE"
[ "$pinned" -ge 4 ] || die2 "ASSERT-SHA.txt pins too few files ($pinned)"
grep -q '^sha256 [0-9a-f]\{64\} ASSERT-EXPECT.tsv$' "$SHAFILE" || die2 "ASSERT-SHA.txt does not pin ASSERT-EXPECT.tsv"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/ia-assert.XXXXXX") || die2 "mktemp failed"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK" || die2 "cd failed"

PENV="env -u NODE_OPTIONS -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS -u NODE"
NODE_VER=$($PENV "$NODE_BIN" --version) || die2 "node --version failed"
emit "# import-audit assert runner"
emit "PROVENANCE utc=$(date -u +%Y-%m-%dT%H:%M:%SZ) node=$NODE_VER bin=$NODE_BIN expect_sha8=$(sha256_of "$EXPECT" | cut -c1-8) load1=$(uptime | sed 's/.*load averages*: *//' | awk '{print $1}')"

# run_tool <mode> <module> -> sets T_RC, T_OUT (CR stripped, stderr merged)
T_RC=0
T_OUT=""
run_tool() {
  local mode=$1 mod=$2 f="$WORK/tool.out"
  : > "$f"
  case "$mode" in
    file)
      $PENV /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --timeout 5 "$mod" > "$f" 2>&1
      T_RC=$?
      ;;
    pipe)
      $PENV /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --timeout 5 "$mod" 2>&1 | cat > "$f"
      T_RC=${PIPESTATUS[0]}
      ;;
    pty)
      script -q "$f" $PENV /bin/bash "$PROTO" --node "$NODE_BIN" --runs 2 --timeout 5 "$mod" > /dev/null 2>&1
      T_RC=$?
      ;;
    *) die2 "unknown stdout mode: $mode" ;;
  esac
  T_OUT=$(tr -d '\r' < "$f")
}

# check_row <exit> <verdict> <regex-list> -> 0 iff T_RC / verdict / every regex match
check_row() {
  local wexit=$1 wverd=$2 wre=$3 gverd re
  [ "$T_RC" = "$wexit" ] || return 1
  gverd=$(printf '%s\n' "$T_OUT" | grep '^VERDICT ' | tail -n 1 | sed 's/^VERDICT //')
  [ "$gverd" = "$wverd" ] || return 1
  if [ "$wre" != "-" ]; then
    while IFS= read -r re; do
      [ -n "$re" ] || continue
      printf '%s\n' "$T_OUT" | grep -Eq -- "$re" || return 1
    done <<EOT
$(printf '%s\n' "$wre" | awk '{ n = split($0, a, ";;"); for (i = 1; i <= n; i++) print a[i] }')
EOT
  fi
  return 0
}

verdict_of() { printf '%s\n' "$T_OUT" | grep '^VERDICT ' | tail -n 1 | sed 's/^VERDICT //'; }
records_of() { printf '%s\n' "$T_OUT" | grep -E '^  [GHP] ' | sed 's/^  //' | tr '\n' ';' | sed 's/;$//'; }

premise_run() { # case -> PR_RC
  $PENV "$NODE_BIN" "$HERE/premises.mjs" "$1" > "$WORK/prem.out" 2> "$WORK/prem.err"
  PR_RC=$?
}

rows_run=0
pass=0
mismatch=0
pfail=0

while IFS="$(printf '\t')" read -u 9 -r c mode wexit wverd wre prem; do
  case "$c" in ''|'#'*) continue ;; esac
  rows_run=$((rows_run + 1))
  pstate=n/a
  if [ "$prem" != "n/a" ]; then
    pstate=ok
    premise_run "$c"
    if [ "$PR_RC" -ne 0 ]; then
      pstate=FAIL
      emit "  premise: $c exit $PR_RC: $(head -n 1 "$WORK/prem.err")"
    fi
    if [ "$prem" = "fail-on-broken" ]; then
      premise_run "$c.broken"
      if [ "$PR_RC" -ne 1 ]; then
        pstate=FAIL
        emit "  premise: $c.broken must exit 1 (teeth) but exited $PR_RC"
      fi
    fi
  fi
  run_tool "$mode" "$HERE/$c.mjs"
  if [ "$pstate" = "FAIL" ]; then
    pfail=$((pfail + 1))
    res=PREMISE-FAIL
  elif check_row "$wexit" "$wverd" "$wre"; then
    pass=$((pass + 1))
    res=PASS
  else
    mismatch=$((mismatch + 1))
    res=MISMATCH
  fi
  emit "ROW $c $mode premise=$pstate exit=$T_RC verdict=$(verdict_of) records=[$(records_of)] -> $res"
done 9< "$EXPECT"

# CONTROL: a deliberately wrong expectation (CLEAN / exit 0 for a module that changes parseInt) MUST mismatch.
run_tool file "$HERE/same-value-new-attrs.mjs"
if check_row 0 CLEAN "-"; then
  emit "ROW CONTROL file premise=n/a exit=$T_RC verdict=$(verdict_of) records=[$(records_of)] -> PASS"
  emit "CONTROL FAILED: a wrong expectation reported PASS (checker has no teeth)"
  emit "TOTAL rows=$rows_run pass=$pass mismatch=$mismatch premise_fail=$pfail"
  exit 2
fi
emit "ROW CONTROL file premise=n/a exit=$T_RC verdict=$(verdict_of) records=[$(records_of)] -> MISMATCH (expected: control must mismatch)"

# Self-check 2: row accounting.
shown=$(grep -c '^ROW ' "$LOG")
rc_final=0
if [ "$rows_run" -ne "$ROWS_EXPECTED" ]; then
  emit "RUNNER: rows_run=$rows_run != rows_expected=$ROWS_EXPECTED"
  rc_final=2
fi
if [ "$shown" -ne $((rows_run + 1)) ]; then
  emit "RUNNER: ROW lines=$shown != rows_run+control=$((rows_run + 1))"
  rc_final=2
fi
emit "TOTAL rows=$rows_run pass=$pass mismatch=$mismatch premise_fail=$pfail"
[ "$rc_final" -eq 0 ] || exit "$rc_final"
[ "$mismatch" -eq 0 ] && [ "$pfail" -eq 0 ] && [ "$pass" -eq "$rows_run" ] && exit 0
exit 1
