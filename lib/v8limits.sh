#: lib/v8limits.sh -- this node binary's inlining limits (one `--v8-options` spawn), then --v8-flags overrides.
#: Reads NODE_BIN V8_EXTRA[@] LIMITS_AWK (lib/v8probe.sh). Sets LIMITS ASSUMED f, defines lim(), and sets
#: TF_SMALL TF_SMALL_HN TF_ONE TF_CUM SCALE MG_SMALL MG_ONE MG_EAGER MG_CUM (node 26 defaults when unreported).
LIMITS=$("$NODE_BIN" --v8-options 2>/dev/null | awk "$LIMITS_AWK")
for f in ${V8_EXTRA[@]+"${V8_EXTRA[@]}"}; do
  case "$f" in --max*inlined*bytecode*=*|--reserve*inline*budget*=*)
    f="${f#--}"; f="${f//_/-}"; LIMITS=$(printf '%s\n%s\n' "$LIMITS" "$f") ;;
  esac
done
# lim VAR KEY DEFAULT: VAR = this binary's value (or the last --v8-flags override). A limit the binary does not
# report falls back to the node 26 default and is listed in ASSUMED, which the report prints as a NOTE.
ASSUMED=""
lim() {
  local v
  v=$(printf '%s\n' "$LIMITS" | awk -F= -v k="$2" '$1 == k { v = $2 } END { print v }')
  if [[ -z "$v" ]]; then v="$3"; ASSUMED="$ASSUMED $2=$3"; fi
  printf -v "$1" '%s' "$v"   # bash >= 3.1, so macOS /bin/bash 3.2 too
}
lim TF_SMALL max-inlined-bytecode-size-small 30; lim TF_SMALL_HN max-inlined-bytecode-size-small-with-heapnum-in-out 75
lim TF_ONE max-inlined-bytecode-size 460; lim TF_CUM max-inlined-bytecode-size-cumulative 920
lim SCALE reserve-inline-budget-scale-factor 1.2
lim MG_SMALL max-maglev-inlined-bytecode-size-small 27; lim MG_ONE max-maglev-inlined-bytecode-size 100
lim MG_EAGER max-maglev-eager-inlined-bytecode-size 30
lim MG_CUM max-maglev-inlined-bytecode-size-cumulative 920
