#: lib/nullctl.sh -- null-control loop: a TEXT MACRO expanded inside judge(), not a function.
#: Reads judge()'s locals key tier v side k, globals RUNS OUT MSDIFF_AWK. Sets v why shown (judge locals)
#: when run 1 and run k of one side differ.
  for side in before after; do
    for k in $(seq 2 "$RUNS"); do
      if [[ -z "$v" ]] && ! cmp -s "$OUT/ms/$key.$tier.$side.1.txt" "$OUT/ms/$key.$tier.$side.$k.txt"; then
        v=NO-VERDICT; why="null control: $side run 1 vs $side run $k differ (tier-up noise on this host)"
        shown=$(awk "$MSDIFF_AWK" "$OUT/ms/$key.$tier.$side.1.txt" "$OUT/ms/$key.$tier.$side.$k.txt" | sort -k3)
      fi
    done
  done
