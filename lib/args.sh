#: lib/args.sh -- need(): value of --opt=value or of the next argument.
#: Reads/writes the caller's arg-loop variables a and v; die from lib/common.sh.
need() { # value from --opt=value (returns 0) or from the next argument (returns 1: caller shifts)
  if [[ -n "$v" ]]; then return 0; fi
  [[ $# -ge 2 ]] || die "$a needs a value"
  v="$2"; return 1
}
