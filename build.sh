#!/bin/bash
# build.sh [OUTDIR] -- generate each shipped script from src/<name>.sh + lib/*.sh, and copy each
# allowlisted src/*.mjs node tool verbatim (ROADMAP S-2).
#
# For every src/<name>.sh (name ^[a-z0-9][a-z0-9-]*\.sh$, never build.sh) writes OUTDIR/<name>.sh
# (default OUTDIR = the directory of this file, the repo root). src and lib are read from that
# directory, never from the cwd. OUTDIR must not be src/ or lib/ (checked after symlinks resolve).
# The generated files are committed; shipped scripts never source.
#
# Marker grammar (src only, one per line, the WHOLE line, column 0):
#   # @include lib/<file>.sh        <file> = [a-z0-9-]+
# The marker line is replaced by the lib file's text minus its leading `#:` lines (the fragment's
# authoring notes); a lib that leaves 0 lines aborts (empty fragment). Depth 1: a lib that mentions
# @include in any letter case aborts (no nesting, no cycles). Any other src line that mentions
# @include in any letter case aborts (a near-miss marker is never copied through as a comment).
# A src or lib containing a NUL byte aborts. In the expanded text @SCRIPT@ becomes <name> without .sh.
#
# Every .sh output is written to OUTDIR/.<name>.sh.tmp.<pid> and checked with `bash -n`.
#
# .mjs step: the allowlist MJS (today alloc-per-op.mjs) is copied byte for byte to OUTDIR/<name>.mjs. No
# @include expansion and no @SCRIPT@ substitution: a .mjs never goes through the .sh expander. Each listed
# src/<name>.mjs must exist, be a regular file (not a symlink), end in a newline, contain no NUL byte and
# have line 1 exactly `#!/usr/bin/env node`; a src/*.mjs not on the allowlist aborts. node is resolved
# once (`command -v node`) and must be an absolute path. The copy goes to OUTDIR/.<stem>.tmp.<pid>.mjs
# (the .mjs suffix keeps `node --check` off the "type":"module" unknown-extension error), is compared
# with `cmp -s` to its src, checked with `node --check` (NODE_OPTIONS and NODE_V8_COVERAGE unset).
#
# Every output (.sh and .mjs) is made executable, and moved into place by ONE final loop only after ALL
# outputs passed (all or nothing across both kinds); the EXIT trap removes leftover temps.
#
# Exit codes: 0 built; 2 aborted (`build.sh: <file>: <why>` on stderr, no output file changed).
# bash 3.2 safe: no mapfile, no declare -A, no ${x,,}. Runs under LC_ALL=C (byte-wise matching).

set -euo pipefail
export LC_ALL=C

ROOT=$(cd "$(dirname "$0")" && pwd)
TMPS=()
cleanup() {
  local rc=$? t
  if [[ ${#TMPS[@]} -gt 0 ]]; then
    for t in "${TMPS[@]}"; do rm -f "$t"; done
  fi
  if [[ $rc -ne 0 && $rc -ne 2 ]]; then
    printf 'build.sh: %s: unexpected error (exit %s)\n' "$ROOT" "$rc" >&2
    exit 2
  fi
}
trap cleanup EXIT

die() { # file why...
  local f="$1"; shift
  printf 'build.sh: %s: %s\n' "$f" "$*" >&2
  exit 2
}

ends_nl() { # file: 0 iff non-empty and its last byte is \n
  local last
  [[ -s "$1" ]] || return 1
  last=$(tail -c 1 "$1"; printf x)
  [[ "$last" == $'\nx' ]]
}

[[ $# -le 1 ]] || die "build.sh" "usage: build.sh [OUTDIR]"
OUT="${1:-$ROOT}"
mkdir -p "$OUT" 2>/dev/null || die "$OUT" "cannot create the output directory"
OUT=$(cd "$OUT" && pwd) || die "$OUT" "cannot enter the output directory"
[[ ! "$OUT" -ef "$ROOT/src" && ! "$OUT" -ef "$ROOT/lib" ]] || die "$OUT" "OUTDIR must not be src/ or lib/"

MARKER_RE='^# @include lib/[a-z0-9-]+\.sh$'
NAME_RE='^[a-z0-9][a-z0-9-]*\.sh$'

shopt -s nullglob
SRCS=("$ROOT"/src/*.sh)
shopt -u nullglob
[[ ${#SRCS[@]} -gt 0 ]] || die "src/" "no src/*.sh to build"

# .mjs allowlist (copied verbatim, see the header). Checked before any output is written.
MJS=(alloc-per-op.mjs)
MJS_LINE1='#!/usr/bin/env node'
shopt -s nullglob
MJS_SRCS=("$ROOT"/src/*.mjs)
shopt -u nullglob
if [[ ${#MJS_SRCS[@]} -gt 0 ]]; then
  for src in "${MJS_SRCS[@]}"; do
    name=$(basename "$src")
    ok=0
    for m in "${MJS[@]}"; do [[ "$name" != "$m" ]] || ok=1; done
    [[ $ok -eq 1 ]] || die "src/$name" "not on the .mjs allowlist (${MJS[*]})"
  done
fi
for name in "${MJS[@]}"; do
  src="$ROOT/src/$name"
  rel="src/$name"
  [[ -e "$src" || -L "$src" ]] || die "$rel" "not found (an allowlisted .mjs is required)"
  [[ -f "$src" && ! -L "$src" ]] || die "$rel" "not a regular file"
  ends_nl "$src" || die "$rel" "empty or no final newline"
  tr -d '\000' <"$src" | cmp -s - "$src" || die "$rel" "contains a NUL byte"
  IFS= read -r line1 <"$src" || die "$rel" "cannot read line 1"
  [[ "$line1" == "$MJS_LINE1" ]] || die "$rel" "line 1 is not exactly '$MJS_LINE1'"
done
NODE_BIN=$(command -v node 2>/dev/null) || NODE_BIN=''
[[ "$NODE_BIN" == /* ]] || die "src/${MJS[0]}" "node --check needs node at an absolute path (command -v node gave '$NODE_BIN')"

# expand_lib REL STEM: print lib REL (e.g. lib/common.sh) minus its leading #: lines, @SCRIPT@ -> STEM
expand_lib() {
  local rel="$1" stem="$2" f="$ROOT/$1" line head=1 emitted=0
  [[ -f "$f" ]] || die "$rel" "not found"
  ends_nl "$f" || die "$rel" "empty or no final newline"
  tr -d '\000' <"$f" | cmp -s - "$f" || die "$rel" "contains a NUL byte"
  while IFS= read -r line; do
    if [[ $head -eq 1 && "$line" == '#:'* ]]; then continue; fi
    head=0
    [[ "$line" != *@[Ii][Nn][Cc][Ll][Uu][Dd][Ee]* ]] || die "$rel" "@include inside a lib (depth 1: no nesting)"
    printf '%s\n' "${line//@SCRIPT@/$stem}"
    emitted=$((emitted + 1))
  done <"$f"
  [[ $emitted -gt 0 ]] || die "$rel" "empty fragment (only #: header lines)"
}

OUT_TMPS=()
OUT_NAMES=()
for src in "${SRCS[@]}"; do
  name=$(basename "$src")
  rel="src/$name"
  [[ "$name" =~ $NAME_RE && "$name" != build.sh ]] || die "$rel" "bad script name (want [a-z0-9][a-z0-9-]*.sh, not build.sh)"
  [[ -f "$src" ]] || die "$rel" "not a regular file"
  ends_nl "$src" || die "$rel" "empty or no final newline"
  tr -d '\000' <"$src" | cmp -s - "$src" || die "$rel" "contains a NUL byte"
  stem="${name%.sh}"
  tmp="$OUT/.$name.tmp.$$"
  TMPS+=("$tmp")
  { : >"$tmp"; } 2>/dev/null || die "$rel" "cannot write $OUT"
  n=0
  while IFS= read -r line; do
    n=$((n + 1))
    if [[ "$line" =~ $MARKER_RE ]]; then
      lib="${line#\# @include }"
      [[ -f "$ROOT/$lib" ]] || die "$rel" "line $n: $lib not found"
      expand_lib "$lib" "$stem"
    elif [[ "$line" == *@[Ii][Nn][Cc][Ll][Uu][Dd][Ee]* ]]; then
      die "$rel" "line $n: malformed @include marker (want exactly '# @include lib/<file>.sh')"
    else
      printf '%s\n' "${line//@SCRIPT@/$stem}"
    fi
  done <"$src" >"$tmp"
  if grep -q '@SCRIPT@' "$tmp"; then die "$rel" "output still contains @SCRIPT@"; fi
  bash_bin="${BASH:-bash}"
  "$bash_bin" -n "$tmp" 2>/dev/null || die "$rel" "generated output fails bash -n"
  chmod +x "$tmp"
  OUT_TMPS+=("$tmp")
  OUT_NAMES+=("$name")
done

# .mjs step: verbatim copy, never through the .sh expander above.
for name in "${MJS[@]}"; do
  src="$ROOT/src/$name"
  rel="src/$name"
  tmp="$OUT/.${name%.mjs}.tmp.$$.mjs"
  TMPS+=("$tmp")
  { : >"$tmp"; } 2>/dev/null || die "$rel" "cannot write $OUT"
  cp "$src" "$tmp" 2>/dev/null || die "$rel" "cannot copy into $OUT"
  cmp -s "$src" "$tmp" || die "$rel" "copy is not byte-equal to its src"
  env -u NODE_OPTIONS -u NODE_V8_COVERAGE "$NODE_BIN" --check "$tmp" >/dev/null 2>&1 || die "$rel" "node --check fails"
  chmod +x "$tmp"
  OUT_TMPS+=("$tmp")
  OUT_NAMES+=("$name")
done

# the ONE move loop: reached only when every .sh and .mjs output passed
i=0
while [[ $i -lt ${#OUT_NAMES[@]} ]]; do
  mv -f "${OUT_TMPS[$i]}" "$OUT/${OUT_NAMES[$i]}" || die "${OUT_NAMES[$i]}" "cannot move into $OUT"
  i=$((i + 1))
done
