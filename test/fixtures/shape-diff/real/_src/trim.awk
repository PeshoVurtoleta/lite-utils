# trim.awk -- verdict-preserving trim of a shape-diff --log-maps capture (Q-B103-CAPSIZE (a), b105 G-L B0c).
# Usage (two passes over the SAME file): awk -f trim.awk LOG LOG > LOG.trimmed
# Pass 1 collects every address named in a `map,Transition` from ($4) or to ($5) field.
# Pass 2 drops ONLY:
#   - the line types the prototype's MAP_AWK skips unread: script-source, code-source-info, new, delete,
#     heap-available, heap-capacity (MAP_AWK's only heap-* event types), sfi-move;
#   - map-details lines whose address ($3) is in no Transition from / to field (MAP_AWK reads
#     map-details only to look up a Transition's from / to elements kind).
# Every other line (v8-version, v8-platform, map-create, code-creation, code-move, code-deopt, map, any
# unknown line) passes through byte-identical and in order. Proof: MAP_AWK records of the untrimmed and the
# trimmed log are byte-identical (sha256 recorded in each real/<major>/PROVENANCE.txt).
BEGIN { FS = "," }
NR == FNR {
  if ($1 == "map" && $2 == "Transition") { keep[$4] = 1; keep[$5] = 1 }
  next
}
$1 == "script-source" || $1 == "code-source-info" || $1 == "new" || $1 == "delete" { next }
$1 == "heap-available" || $1 == "heap-capacity" || $1 == "sfi-move" { next }
$1 == "map-details" && !($3 in keep) { next }
{ print }
