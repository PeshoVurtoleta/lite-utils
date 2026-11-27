#!/usr/bin/env bash
# run-attacks.sh <abs-node> <out-log> -- reviewer-attack rows for import-audit.prototype.sh (ia-1.4.0 U4).
# Exit 0 all PASS, 1 any MISMATCH, 2 runner failure (sha drift, row count, control did not mismatch).
set -u
unset NODE_OPTIONS NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_REDIRECT_WARNINGS NODE
die2() { echo "RUNNER-FAIL: $*" >&2; exit 2; }
[ $# -eq 2 ] || die2 "usage: run-attacks.sh <abs-node> <out-log>"
NODE_BIN=$1; LOG=$2
case "$NODE_BIN" in /*) ;; *) die2 "node path must be absolute" ;; esac
[ -x "$NODE_BIN" ] || die2 "node not executable: $NODE_BIN"
HERE=$(cd "$(dirname "$0")" && pwd) || die2 "cd"
TOOL=$(cd "$HERE/../.." && pwd)/import-audit.prototype.sh
[ -f "$TOOL" ] || die2 "tool missing"
# sha pin: every line of ATTACK-SHA.txt after utc= must still match
[ -f "$HERE/ATTACK-SHA.txt" ] || die2 "ATTACK-SHA.txt missing"
while read -r h f; do
  case "$h" in utc=*|'#'*|'') continue ;; esac
  got=$(shasum -a 256 "$HERE/$f" | awk '{print $1}')
  [ "$got" = "$h" ] || die2 "sha drift: $f"
done < "$HERE/ATTACK-SHA.txt"
W=$(mktemp -d "${TMPDIR:-/tmp}/ia-atk.XXXXXX") || die2 "mktemp"
cd "$W" || die2 "cd W"
printf 'hello\n' > "$W/stdin.txt"
VER=$("$NODE_BIN" -p 'process.version + " v8=" + process.versions.v8' </dev/null 2>/dev/null) || die2 "node -p"
{ echo "# import-audit run-attacks.sh"
  echo "PROVENANCE utc=$(date -u +%Y-%m-%dT%H:%M:%SZ) node=$VER bin=$NODE_BIN tool_sha8=$(shasum -a 256 "$TOOL" | cut -c1-8) expect_sha8=$(shasum -a 256 "$HERE/ATTACK-EXPECT.tsv" | cut -c1-8) load1=$(sysctl -n vm.loadavg | awk '{print $2}')"
} > "$LOG"
rows=0; pass=0; mism=0; want_rows=0
run_row() { # case mode exits regex -> sets R_LINE, R_OK (1 pass / 0 mismatch)
  local c=$1 m=$2 ex=$3 rx=$4 out rc verdict recs ok=1 r
  case "$m" in
    null) out=$(/bin/bash "$TOOL" --node "$NODE_BIN" --runs 2 --timeout 5 "$HERE/$c.mjs" </dev/null 2>&1); rc=$? ;;
    file) out=$(/bin/bash "$TOOL" --node "$NODE_BIN" --runs 2 --timeout 5 "$HERE/$c.mjs" <"$W/stdin.txt" 2>&1); rc=$? ;;
    pipe) out=$(printf 'hi\n' | /bin/bash "$TOOL" --node "$NODE_BIN" --runs 2 --timeout 5 "$HERE/$c.mjs" 2>&1); rc=$? ;;
    *) die2 "bad mode $m" ;;
  esac
  verdict=$(printf '%s\n' "$out" | awk '/^VERDICT /{print $2; exit} /NO-VERDICT/{print "NO-VERDICT"; exit}')
  [ -n "$verdict" ] || verdict=NONE
  recs=$(printf '%s\n' "$out" | awk '/^  [GHP] /{sub(/^  /,""); printf "%s;", $0}')
  case "|$ex|" in *"|$rc|"*) ;; *) ok=0 ;; esac
  if [ "$rx" != "-" ]; then
    r=$rx
    while :; do
      one=${r%%;;*}
      printf '%s\n' "$out" | /usr/bin/grep -a -Eq -- "$one" || ok=0
      [ "$one" = "$r" ] && break
      r=${r#*;;}
    done
  fi
  R_OK=$ok
  R_LINE="ROW $c $m exit=$rc verdict=$verdict records=[$recs] want_exit=$ex"
}
while IFS="$(printf '\t')" read -r c m ex rx <&9; do
  case "$c" in '#'*|'') continue ;; esac
  want_rows=$((want_rows + 1))
  [ -f "$HERE/$c.mjs" ] || die2 "missing module $c.mjs"
  run_row "$c" "$m" "$ex" "$rx"
  rows=$((rows + 1))
  if [ "$R_OK" = 1 ]; then pass=$((pass + 1)); echo "$R_LINE -> PASS" >> "$LOG"
  else mism=$((mism + 1)); echo "$R_LINE -> MISMATCH" >> "$LOG"; fi
done 9< "$HERE/ATTACK-EXPECT.tsv"
# must-fail control: lazy1 is CLEAN; demanding exit 1 must MISMATCH
run_row lazy1 null 1 -
if [ "$R_OK" = 1 ]; then echo "$R_LINE -> CONTROL PASSED (runner has no teeth)" >> "$LOG"; die2 "control row passed"; fi
echo "$R_LINE -> CONTROL MISMATCH (required)" >> "$LOG"
[ "$rows" -eq "$want_rows" ] && [ "$rows" -gt 0 ] || die2 "rows_run=$rows want=$want_rows"
n=$(awk '/^ROW /' "$LOG" | wc -l | tr -d ' ')
[ "$n" -eq $((rows + 1)) ] || die2 "ROW lines $n != rows+control $((rows + 1))"
echo "TOTAL rows=$rows pass=$pass mismatch=$mism" >> "$LOG"
tail -1 "$LOG"
[ "$mism" -eq 0 ] && exit 0 || exit 1
