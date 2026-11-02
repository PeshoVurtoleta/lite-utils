#: lib/modes.sh -- DEFAULT_DRIVER, write_driver, and the driver / ref / file mode dispatch.
#: Reads DRIVER BEFORE_REF AFTER_REF BEFORE_FILE AFTER_FILE POS REPO OUT; uses die sha8 usage
#: refuse_live. Sets DESC_B DESC_A STAGED DRV_B DRV_A (and REPO in ref mode).
DEFAULT_DRIVER="// inline-diff default driver: signal read / set / peek, computed, effect, batch hot paths.
import { signal, computed, effect, batch } from './Signal.js';
const a = signal(0), b = signal(1);
const c = computed(() => a() + b());
const d = computed(() => c() * 2);
const sink = new Int32Array(1);
effect(() => { sink[0] = (sink[0] + d()) | 0; });
function step(i) {
    a.set(i);
    b.set(i ^ 1);
    batch(() => { a.set(i + 1); b.set(i); });
    return (a.peek() + c.peek() + d()) | 0;
}
let acc = 0;
for (let i = 0; i < 300000; i++) acc = (acc + step(i)) | 0;
if (acc === 7 && sink[0] === 7) console.log('');
"

write_driver() { # dir
  if [[ -n "$DRIVER" ]]; then
    [[ -f "$DRIVER" ]] || die "--driver not found: $DRIVER"
    grep -qE "['\"]\./Signal\.js['\"]" "$DRIVER" || die "--driver must import './Signal.js'"
    cp "$DRIVER" "$1/driver.mjs"
  else
    printf '%s' "$DEFAULT_DRIVER" >"$1/driver.mjs"
  fi
}

DESC_B=""; DESC_A=""; STAGED=1
if [[ -n "$BEFORE_REF$AFTER_REF" ]]; then
  [[ -n "$BEFORE_REF" && -n "$AFTER_REF" ]] || die "--before-ref and --after-ref go together"
  [[ ${#POS[@]} -eq 0 && -z "$BEFORE_FILE$AFTER_FILE" ]] || die "ref mode takes no driver paths / --before / --after"
  REPO="${REPO:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
  [[ -n "$REPO" ]] || die "ref mode: not inside a git repo (use --repo)"
  for side in before after; do
    if [[ $side == before ]]; then ref="$BEFORE_REF"; else ref="$AFTER_REF"; fi
    sha=$(git -C "$REPO" rev-parse --short --verify --quiet "$ref^{commit}") || die "unknown git ref '$ref' in $REPO (git fetch origin $ref?)"
    dir="$OUT/stage/$side"; mkdir -p "$dir"
    git -C "$REPO" show "$sha:Signal.js" >"$dir/Signal.js" 2>/dev/null || die "$ref has no Signal.js"
    if git -C "$REPO" cat-file -e "$sha:Watch.js" 2>/dev/null; then git -C "$REPO" show "$sha:Watch.js" >"$dir/Watch.js"; fi
    write_driver "$dir"
    d="$ref @ $sha  Signal.js sha256/8 $(sha8 "$dir/Signal.js")"
    if [[ $side == before ]]; then DESC_B="$d"; else DESC_A="$d"; fi
  done
  DRV_B="$OUT/stage/before/driver.mjs"; DRV_A="$OUT/stage/after/driver.mjs"
elif [[ -n "$BEFORE_FILE$AFTER_FILE" ]]; then
  [[ -n "$BEFORE_FILE" && -n "$AFTER_FILE" ]] || die "--before and --after go together"
  [[ ${#POS[@]} -eq 0 ]] || die "file mode takes no driver paths"
  command -v git >/dev/null 2>&1 || die "file mode needs git to check that --before is a frozen copy (or use --before-ref)"
  [[ -f "$BEFORE_FILE" ]] || die "--before not found: $BEFORE_FILE"
  refuse_live "$BEFORE_FILE" "--before"
  if [[ -f "$(dirname "$BEFORE_FILE")/Watch.js" ]]; then refuse_live "$(dirname "$BEFORE_FILE")/Watch.js" "the Watch.js beside --before"; fi
  for side in before after; do
    if [[ $side == before ]]; then f="$BEFORE_FILE"; else f="$AFTER_FILE"; fi
    [[ -f "$f" ]] || die "--$side not found: $f"
    dir="$OUT/stage/$side"; mkdir -p "$dir"
    cp "$f" "$dir/Signal.js"     # the copy IS the freeze: edits to $f during the run cannot leak in
    w="$(dirname "$f")/Watch.js"
    if [[ -f "$w" ]]; then cp "$w" "$dir/Watch.js"
    elif grep -q '"./Watch.js"' "$dir/Signal.js"; then die "no Watch.js beside $f (Signal.js re-exports it)"; fi
    write_driver "$dir"
    d="$f  sha256/8 $(sha8 "$dir/Signal.js")"
    if [[ $side == before ]]; then DESC_B="$d"; else DESC_A="$d"; fi
  done
  DRV_B="$OUT/stage/before/driver.mjs"; DRV_A="$OUT/stage/after/driver.mjs"
else
  STAGED=0
  [[ ${#POS[@]} -eq 2 ]] || { usage >&2; die "need DRIVER_BEFORE DRIVER_AFTER, --before-ref/--after-ref, or --before/--after"; }
  for f in "${POS[@]}"; do [[ -f "$f" ]] || die "driver not found: $f"; done
  DRV_B=$(cd "$(dirname "${POS[0]}")" && pwd)/$(basename "${POS[0]}")
  DRV_A=$(cd "$(dirname "${POS[1]}")" && pwd)/$(basename "${POS[1]}")
  DESC_B="$DRV_B  sha256/8 $(sha8 "$DRV_B")"; DESC_A="$DRV_A  sha256/8 $(sha8 "$DRV_A")"
fi
