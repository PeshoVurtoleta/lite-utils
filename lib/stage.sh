#: lib/stage.sh -- stage_check, stage_write: the ref / file modes of a diff (ONE module file per side + one driver).
#: Reads BEFORE_REF AFTER_REF BEFORE_FILE AFTER_FILE MODULE DRIVER REPO OUT POS; uses die sha8 refuse_live (lib/common.sh).
#: stage_check (every refusal, before any disk write) sets STAGE_MODE (ref|file) STAGE_NAME STAGE_DRIVER STAGE_ABS_B
#: STAGE_ABS_A (file mode) STAGE_SHA_B STAGE_SHA_A (ref mode: full commit shas) and REPO (ref mode: its toplevel).
#: stage_write (after OUT exists) writes OUT/stage/before and OUT/stage/after; sets DRV_B DRV_A STAGE_SAME DESC_B
#: DESC_A DESC_D. Generic (no module or package names); bash 3.2, set -u safe.
# ---------------------------------------------------------------------------------------------
# ref / file staging: a frozen copy of one module per side, beside a copy of the driver
# ---------------------------------------------------------------------------------------------
STAGE_MODE=""; STAGE_NAME=""; STAGE_DRIVER=""; STAGE_ABS_B=""; STAGE_ABS_A=""; STAGE_SHA_B=""; STAGE_SHA_A=""
stage_check() { # refuse a bad ref / file staging (no disk write); set the STAGE_* inputs of stage_write
  local side ref sha x t=""
  [[ -z "$BEFORE_REF$AFTER_REF" || -z "$BEFORE_FILE$AFTER_FILE" ]] \
    || die "--before-ref/--after-ref (ref mode) and --before/--after (file mode) are exclusive: give one pair"
  if [[ -n "$BEFORE_REF$AFTER_REF" ]]; then
    STAGE_MODE=ref
    [[ -n "$BEFORE_REF" && -n "$AFTER_REF" ]] || die "--before-ref and --after-ref go together"
  else
    STAGE_MODE=file
    [[ -n "$BEFORE_FILE" && -n "$AFTER_FILE" ]] || die "--before and --after go together"
  fi
  [[ ${#POS[@]} -eq 0 ]] || die "$STAGE_MODE mode takes no DRIVER paths (give --driver FILE), got ${#POS[@]}"
  for x in "$BEFORE_REF" "$AFTER_REF" "$BEFORE_FILE" "$AFTER_FILE" "$MODULE" "$DRIVER" "$REPO"; do
    [[ "$x" != *$'\n'* ]] || die "--before-ref / --after-ref / --before / --after / --module / --driver / --repo: a newline is not allowed"
  done
  [[ -n "$OUT" ]] || die "$STAGE_MODE mode needs --out DIR (the staged copies are written to DIR/stage)"
  [[ -n "$DRIVER" ]] || die "$STAGE_MODE mode needs --driver FILE (a driver that imports the module as './<name>')"
  [[ -f "$DRIVER" && -r "$DRIVER" ]] || die "--driver not found (or not a readable file): $DRIVER"
  [[ -z "${GIT_DIR+x}${GIT_WORK_TREE+x}${GIT_INDEX_FILE+x}${GIT_OBJECT_DIRECTORY+x}${GIT_COMMON_DIR+x}${GIT_CEILING_DIRECTORIES+x}" ]] || die "GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR or GIT_CEILING_DIRECTORIES is set: unset it ($STAGE_MODE mode finds each repo from its path)"
  command -v git >/dev/null 2>&1 || die "$STAGE_MODE mode needs git (ref mode reads the refs; file mode checks that --before is a frozen copy)"
  if [[ -n "$REPO" ]]; then
    t=$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null) || die "--repo is not a git work tree: $REPO"
  elif [[ $STAGE_MODE == ref ]]; then
    t=$(git rev-parse --show-toplevel 2>/dev/null) || die "ref mode: the cwd is not inside a git work tree (give --repo DIR)"
  fi
  if [[ $STAGE_MODE == ref ]]; then
    [[ -n "$MODULE" ]] || die "ref mode needs --module REL (the module's path from the repo root, e.g. src/Thing.js)"
    [[ "$MODULE" != /* ]] || die "--module must be relative to the repo root, got '$MODULE'"
    case "/$MODULE/" in */./*|*/../*|*//*) die "--module must not have an empty, '.' or '..' segment, got '$MODULE'" ;; esac
    REPO="$t"
    for side in before after; do
      if [[ $side == before ]]; then ref="$BEFORE_REF"; else ref="$AFTER_REF"; fi
      [[ "$ref" != -* ]] || die "--$side-ref must not start with '-', got '$ref'"
      sha=$(git -C "$REPO" rev-parse --verify --quiet "$ref^{commit}") || die "--$side-ref: '$ref' is not a commit in $REPO (git fetch?)"
      [[ "$(git -C "$REPO" cat-file -t "$sha:$MODULE" 2>/dev/null)" == blob ]] || die "--$side-ref: $ref ($sha) has no file $MODULE"
      if [[ $side == before ]]; then STAGE_SHA_B="$sha"; else STAGE_SHA_A="$sha"; fi
    done
    STAGE_NAME=$(basename "$MODULE")
  else
    [[ -z "$MODULE" ]] || die "file mode takes no --module (the module name is --after's file name)"
    for side in before after; do
      if [[ $side == before ]]; then x="$BEFORE_FILE"; else x="$AFTER_FILE"; fi
      [[ -f "$x" && -r "$x" ]] || die "--$side not found (or not a readable file): $x"
    done
    refuse_live "$BEFORE_FILE" --before
    [[ ! "$BEFORE_FILE" -ef "$AFTER_FILE" ]] || die "--before and --after are the same file (hard link / symlink): --before must be a FROZEN copy"
    STAGE_NAME=$(basename "$AFTER_FILE")
    STAGE_ABS_B=$(cd "$(dirname "$BEFORE_FILE")" && pwd)/$(basename "$BEFORE_FILE")
    STAGE_ABS_A=$(cd "$(dirname "$AFTER_FILE")" && pwd)/$(basename "$AFTER_FILE")
  fi
  [[ "$STAGE_NAME" != "$(basename "$DRIVER")" ]] || die "the module and --driver have the same file name ($STAGE_NAME): rename the driver"
  grep -q -F -e "'./$STAGE_NAME'" -e "\"./$STAGE_NAME\"" "$DRIVER" || die "--driver must import './$STAGE_NAME' (the staged module beside it): $DRIVER"
  STAGE_DRIVER=$(cd "$(dirname "$DRIVER")" && pwd)/$(basename "$DRIVER")
  [[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]] || die "--out: $OUT/stage is not empty (give a new or empty DIR)"
}
stage_write() { # OUT/stage/<side>: that side's module as STAGE_NAME plus the driver; set DRV_B DRV_A STAGE_SAME DESC_*
  local side dir b x
  b=$(basename "$STAGE_DRIVER")
  mkdir -p "$OUT/stage" && mkdir "$OUT/stage/before" "$OUT/stage/after" 2>/dev/null \
    || die "--out: cannot create $OUT/stage/before and $OUT/stage/after"
  for side in before after; do
    dir="$OUT/stage/$side"
    if [[ $STAGE_MODE == ref ]]; then
      if [[ $side == before ]]; then x="$STAGE_SHA_B"; else x="$STAGE_SHA_A"; fi
      git -C "$REPO" cat-file blob "$x:$MODULE" >"$dir/$STAGE_NAME" || die "cannot read $MODULE at $x"   # plumbing: no textconv
    else
      if [[ $side == before ]]; then x="$BEFORE_FILE"; else x="$AFTER_FILE"; fi
      cp "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"   # the copy IS the freeze: later edits to $x cannot leak in
    fi
    cp "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"
  done
  DRV_B="$OUT/stage/before/$b"; DRV_A="$OUT/stage/after/$b"
  if cmp -s "$OUT/stage/before/$STAGE_NAME" "$OUT/stage/after/$STAGE_NAME"; then STAGE_SAME=1; else STAGE_SAME=0; fi
  if [[ $STAGE_MODE == ref ]]; then
    DESC_B="$BEFORE_REF @ ${STAGE_SHA_B:0:12}  $MODULE  sha256/8 $(sha8 "$OUT/stage/before/$STAGE_NAME")"
    DESC_A="$AFTER_REF @ ${STAGE_SHA_A:0:12}  $MODULE  sha256/8 $(sha8 "$OUT/stage/after/$STAGE_NAME")"
  else
    DESC_B="$STAGE_ABS_B  sha256/8 $(sha8 "$OUT/stage/before/$STAGE_NAME")"
    DESC_A="$STAGE_ABS_A  sha256/8 $(sha8 "$OUT/stage/after/$STAGE_NAME")"
  fi
  DESC_D="$STAGE_DRIVER  sha256/8 $(sha8 "$DRV_B")"
}
