#: lib/stage.sh -- stage_check, stage_write: the ref / file modes of a diff (ONE module file per side + one driver).
#: Reads BEFORE_REF AFTER_REF BEFORE_FILE AFTER_FILE MODULE DRIVER REPO OUT POS; uses die sha8 refuse_live (lib/common.sh).
#: stage_check (every refusal, before any disk write) sets STAGE_MODE (ref|file) STAGE_NAME STAGE_DRIVER STAGE_ABS_B
#: STAGE_ABS_A (file mode) STAGE_SHA_B STAGE_SHA_A (ref mode: full commit shas) and REPO (ref mode: its toplevel); it rewrites a
#: BEFORE_FILE AFTER_FILE DRIVER that starts with '-' as ./<value> (a name, never an option).
#: stage_write (after OUT exists) writes OUT/stage/before and OUT/stage/after; sets DRV_B DRV_A STAGE_SAME DESC_B
#: DESC_A DESC_D. Generic (no module or package names); bash 3.2, set -u safe.
# ---------------------------------------------------------------------------------------------
# ref / file staging: a frozen copy of one module per side, beside a copy of the driver
# ---------------------------------------------------------------------------------------------
STAGE_MODE=""; STAGE_NAME=""; STAGE_DRIVER=""; STAGE_ABS_B=""; STAGE_ABS_A=""; STAGE_SHA_B=""; STAGE_SHA_A=""
stage_check() { # refuse a bad ref / file staging (no disk write); set the STAGE_* inputs of stage_write
  local side ref sha x t="" b m
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
  # a path value that starts with '-' is a name, never an option: refuse_live, dirname, basename, grep and cp read ./-NAME
  [[ "$BEFORE_FILE" != -* ]] || BEFORE_FILE="./$BEFORE_FILE"; [[ "$AFTER_FILE" != -* ]] || AFTER_FILE="./$AFTER_FILE"; [[ "$DRIVER" != -* ]] || DRIVER="./$DRIVER"
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
      # the tree mode, not only the type: a tracked symlink (120000) is a blob too, and its staged text is the link target's path
      m=$(git --literal-pathspecs -C "$REPO" ls-tree "$sha" -- "$MODULE" 2>/dev/null) || m=""
      case "$m" in *$'\n'*) ;; "100644 blob "*|"100755 blob "*) m=ok ;; esac
      [[ "$m" == ok ]] || { m=${m%%[[:space:]]*}; die "--$side-ref: $MODULE at $ref is not a regular file in git (mode ${m:-none}): its staged text would not be the module"; }
      if [[ $side == before ]]; then STAGE_SHA_B="$sha"; else STAGE_SHA_A="$sha"; fi
    done
    STAGE_NAME=$(basename -- "$MODULE")
  else
    [[ -z "$MODULE" ]] || die "file mode takes no --module (the module name is --after's file name)"
    for side in before after; do
      if [[ $side == before ]]; then x="$BEFORE_FILE"; else x="$AFTER_FILE"; fi
      [[ -f "$x" && -r "$x" ]] || die "--$side not found (or not a readable file): $x"
    done
    refuse_live "$BEFORE_FILE" --before
    [[ ! "$BEFORE_FILE" -ef "$AFTER_FILE" ]] || die "--before and --after are the same file (hard link / symlink): --before must be a FROZEN copy"
    STAGE_NAME=$(basename -- "$AFTER_FILE")
    STAGE_ABS_B=$(cd -- "$(dirname -- "$BEFORE_FILE")" && pwd)/$(basename -- "$BEFORE_FILE")
    STAGE_ABS_A=$(cd -- "$(dirname -- "$AFTER_FILE")" && pwd)/$(basename -- "$AFTER_FILE")
    [[ "$STAGE_ABS_B" -ef "$BEFORE_FILE" ]] || die "--before: cannot resolve the directory of $BEFORE_FILE (a symlink before '..'?)"
    [[ "$STAGE_ABS_A" -ef "$AFTER_FILE" ]] || die "--after: cannot resolve the directory of $AFTER_FILE (a symlink before '..'?)"
  fi
  b=$(basename -- "$DRIVER")
  [[ "$STAGE_NAME" != "$b" ]] || die "the module and --driver have the same file name ($STAGE_NAME): rename the driver"
  # a case-insensitive file system (macOS, Windows) stages both under one name: refuse a pair equal up to ASCII case, on every host
  [[ "$(printf '%s' "$STAGE_NAME" | LC_ALL=C tr 'A-Z' 'a-z')" != "$(printf '%s' "$b" | LC_ALL=C tr 'A-Z' 'a-z')" ]] || die "the module and --driver have the same file name up to case ($STAGE_NAME / $b): rename the driver"
  # a non-ASCII or control byte (LC_ALL=C: [:print:] is 0x20-0x7E) can fold too (APFS: Unicode case, NFC / NFD): refuse it
  [[ "$STAGE_NAME$b" != *[![:print:]]* ]] || die "the module or --driver file name has a non-ASCII byte ($STAGE_NAME / $b): rename it"
  grep -q -F -e "'./$STAGE_NAME'" -e "\"./$STAGE_NAME\"" -- "$DRIVER" || die "--driver must import './$STAGE_NAME' (the staged module beside it): $DRIVER"
  STAGE_DRIVER=$(cd -- "$(dirname -- "$DRIVER")" && pwd)/$(basename -- "$DRIVER")
  # the import check above read $DRIVER through the kernel (physical path); the copy below reads STAGE_DRIVER (bash's
  # logical join). A symlink before '..' makes them two files (a decoy driver would be staged): refuse unless they are one
  [[ "$STAGE_DRIVER" -ef "$DRIVER" ]] || die "--driver: cannot resolve the directory of $DRIVER (a symlink before '..'?)"
  [[ ! -L "$OUT/stage" ]] || die "--out: $OUT/stage is a symlink (refused: the writes would follow it)"
  # an unreadable or unsearchable DIR/stage reads as empty to ls -A (its error is hidden), and an unwritable one fails only
  # in stage_write, after the first spawns and DIR/raw writes: refuse both here, before any spawn or write
  # (the same for an existing DIR that is not writable or not searchable: its new DIR/stage fails in stage_write)
  { [[ ! -e "$OUT/stage" ]] || { [[ -r "$OUT/stage" && -w "$OUT/stage" && -x "$OUT/stage" ]] && [[ -z "$(ls -A "$OUT/stage" 2>/dev/null)" ]]; }; } || die "--out: $OUT/stage is not empty (give a new or empty DIR)"
  [[ -e "$OUT/stage" || ! -e "$OUT" || ( -w "$OUT" && -x "$OUT" ) ]] \
    || die "--out: cannot create $OUT/stage ($OUT is not writable)"
}
stage_write() { # OUT/stage/<side>: that side's module as STAGE_NAME plus the driver; set DRV_B DRV_A STAGE_SAME DESC_*
  local side dir b x
  b=$(basename -- "$STAGE_DRIVER")
  mkdir -p -- "$OUT/stage" 2>/dev/null && mkdir -- "$OUT/stage/before" "$OUT/stage/after" 2>/dev/null \
    || die "--out: cannot create $OUT/stage/before and $OUT/stage/after"
  for side in before after; do
    dir="$OUT/stage/$side"
    if [[ $STAGE_MODE == ref ]]; then
      if [[ $side == before ]]; then x="$STAGE_SHA_B"; else x="$STAGE_SHA_A"; fi
      git -C "$REPO" cat-file blob "$x:$MODULE" >"$dir/$STAGE_NAME" || die "cannot read $MODULE at $x"   # plumbing: no textconv
    else
      if [[ $side == before ]]; then x="$BEFORE_FILE"; else x="$AFTER_FILE"; fi
      cp -- "$x" "$dir/$STAGE_NAME" || die "cannot copy $x"   # the copy IS the freeze: later edits to $x cannot leak in
    fi
    cp -- "$STAGE_DRIVER" "$dir/$b" || die "cannot copy $STAGE_DRIVER"
    # the belt (stage_check refuses every fold it knows): a file system that still maps the two names to one file
    [[ ! "$dir/$STAGE_NAME" -ef "$dir/$b" ]] || die "the staged module and driver are the same file on this file system (case / Unicode fold: $STAGE_NAME / $b): rename the driver"
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
