test/fixtures/shape-diff/canned/ -- canned inputs for shape-diff (1.2.0, SPEC-1.2.0 / PLAN-SD-E TASK 0, b104 G-E B0).
No file here needs a real node. Every input is ASCII with no TAB and no NUL (the proto's own inputs hold none either).
Paths inside the inputs are rewritten to file:///w/ form. In map-details lines the `\n` pairs are literal backslash-n
text, exactly as the prototype self-test writes them.

The BEFORE build is the frozen prototype: .handoff/b103/engine/frozen/proto.sh, i.e.
`git show 37efd97:research/shape-diff/shape-diff.prototype.sh`, sha256 eb7c1b65... (frozen/SHA.txt). golden-proto/
was cut from that copy only, never from research/. The generator scripts are .handoff/b103/engine/mk-canned.sh and
cut-golden.sh.

unit/ -- a file holds the value the proto self-test feeds awk, plus one final "\n" (mrec / srec use printf '%s\n').
  H.log      proto heredoc H (body at proto:817-825): a v8-version / platform header plus Builtin and JS code-creation
             lines (clean, uncalled ~ and ^, optDel *, dictArr, helperDel).
  L1.log     proto L1 (proto:830): H + one Transition in clean. Gives K + R + T, and K only for uncalled (row 1). Run
             with inc_trans=1 it gives M MAP_TRANSITION (include-transitions unit row). NOTE: maps 0x101 / 0x102 have
             no map-details line, so L1 is itself a D5 Transition. Per SPEC-1.2.0 A7 (Q-B104-L1D5) this file stays
             the proto's verbatim input; the port amends its own L1.
  L2.log     proto L2 (proto:835-839): Normalize / NormalizeCached in optDel (2 hits), and in Builtin:ReflectDeleteProperty,
             NONE (pc 0) and user:helperDel -> UM (row 2, N1 + N5).
  L3.log     proto L3 (proto:845-848): HOLEY -> DICTIONARY_ELEMENTS through map-details -> MAP_ELEM_DICT (row 3).
  L4.log     proto L4 (proto:849-852): HOLEY -> HOLEY symbol transition -> normal T (row 3 control).
  OUT1.out   proto heredoc OUT1 (body at proto:865-873): v{None} and s->s no-ops -> I, the dual reason pair folded
             (hits=2), Class(0x..) / {symbol 0x..} normalized, splice+1700 and user:otherElem -> UE (row 4).
  OUT2.out   proto OUT2 (proto:881): a malformed generalizing line -> X (row 5).
  da.out     D-A: a GEN line in node:events (setMaxListeners; line 1, verbatim from RECHECK2 section 5), an ELEM line in
             node:internal/util (helper) and a GEN line in evalmachine.<anonymous> (vmFn) (lines 2-3, verbatim from
             PLAN-SD-E TASK 0; they hold the RECHECK2 section 5 fragments). fns=mk,setMaxListeners. The
             proto prints nothing (it drops every frame that is not a file path). The port must print, in this order:
             UE GEN|node:setMaxListeners|_maxListeners:h{Any;const}->t{Any;mutable};
             UE ELEM|node:helper|PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS;
             UE GEN|other:vmFn|p:s{Any;const}->d{Any;const};   (PLAN-SD-E A3, row 16)
  db.out     D-B, fns=mk, one A4 case per line: (1) crafted key `k:v{None;const}->` on a real const->mutable GEN,
             (2) the `plain` control, (3) a real v{None} init (`w:`), (4) a payload with no arrow (`weird payload`).
             Proto on the whole file: I mk|2 (line 1 is wrongly a no-op) + E for lines 2 and 4. Per line, the port must
             give: (1) E mk|GEN|s.mjs:3|k:v{None;const}->:d{Any;const}->d{Any;mutable}|1  (2) E ...|plain:...|1
             (3) I mk|1  (4) E mk|GEN|s.mjs:3|weird payload|1   (PLAN-SD-E A4, row 17)
  m3b.out    kills M3b, fns=mk: a non-target user GEN -> UE GEN|user:helperGen|y:s{Any;const}->d{Any;const};
             and a non-target LHS==RHS no-op -> nothing (PLAN-SD-E A5, row 18).
  d5.log     Q-B103-SD-D5: H, then a Transition in target dictArr whose TO map (0x502) has no map-details line, one in
             non-target user helperDel whose FROM map (0x503) has none, one with NONE owner (pc 0) where neither map has
             one, and a control Transition in dictArr whose maps (0x506 / 0x507) both have details (same kind).
             Proto: silent normal T (T dictArr|2; T helperDel|1 is there only because helperDel is in fns). The port
             (Q-B103-SD-D5 (a)) gives an `N dictArr` record for the target and `UM MAP_EK_UNKNOWN|<owner>|-` for the
             non-target ones (rows 20-21). Golden records run it with fns=dictArr,helperDel.
  pc47.log   SPEC A2 (iv), R5: two JS code objects at ADJACENT 47-bit addresses (a47 at 0x7ff000000000, b47 at
             0x7ff000000010, 16 bytes each) and one Deprecate in each, back to back with no code event between (same
             pc_gen generation). The pcs 0x7ff000000008 / 0x7ff000000018 (140668768878600 / 140668768878616) print the
             same under "%.6g" (1.40669e+14). MAP_AWK keys pc_gen[p] / pc_hit[p] by the pc as a number (proto:336-340);
             an awk that renders a subscript past its int range through CONVFMT collides the two and gives b47's event to
             a47. Correct: M a47|...|x|1 and M b47|...|y|1. Collided: two M a47 lines.

e2e/<driver>/ -- one driver dir per name: driver.mjs (never executed), map.log (replayed as the isolate map log),
  out.txt (replayed as the trace stdout), and out.<n>.txt / map.<n>.log for run n where a run must differ. Every
  Transition's from / to maps have a map-details line (so D5 does not fire in e2e). Target fn: mk. A pair is
  BEFORE/AFTER:
  mono/mono2   A/A: same records, different file, addresses and lines (the cross-side diff strips locations) -> rc 0.
  mono/addf    addf adds a y field generalization in mk -> DIFF, rc 1.
  mono/nc      nc run 2 (out.2.txt) adds that GEN -> the AFTER null control fails -> NO-VERDICT, rc 2.
  mono/umd     umd adds a Builtin:ReflectDeleteProperty Normalize (UM) -> NO-VERDICT, rc 2.
  mono/da      da adds the node:events setMaxListeners GEN line. Proto: SAME rc 0 (D-A drops it). Port: NO-VERDICT rc 2
               with a line ending `before=0 after=1  UNATTR  GEN  node:setMaxListeners  _maxListeners:h{Any;const}->t{Any;mutable}`.
  tr1/tr2      tr2 has one more normal Transition in mk (key y): default SAME rc 0 (REPORTED before=1 after=2);
               with --include-transitions DIFF rc 1.

fake-node.sh -- the fake `node` (its header comment is the contract): --version (FAKE_VER, default v26.8.2;
  FAKE_VER_RC), --v8-options (10 flag / type pairs byte-exact from test/fixtures/v8flags/v8-options.v26.8.2.txt),
  exit 7 on a leaked NODE_* var, FAKE_LOG = one argv line per call. A trace run replays ./map[.n].log into
  isolate-0x7508000000-<pid>-<basename of --logfile> beside the --logfile path and cats ./out[.n].txt; n = the
  number of run.*.out files beside --logfile. It writes nothing outside that log dir and FAKE_LOG.
  It fails closed: exit 9 on no arguments, -e / -p / --eval / --print, a last argument that is empty or starts
  with -, or no ABSOLUTE --logfile=<path>; exit 8 when ./map[.n].log or ./out[.n].txt is missing (or the copy
  fails). Each refusal prints a named `fake-node: ...` stderr line.

golden-proto/ -- the frozen proto's outputs (cut-golden.sh). Every private temp path is replaced by @T@.
  Layout B3 must reproduce under its own mktemp root @T@ (the reports and argv lines embed it): --node @T@/fk/node
  (a copy of fake-node.sh), --out @T@/out/<case>, drivers @T@/e2e/<name>/driver.mjs (a copy of canned/e2e/), cwd
  @T@/cwd, TMPDIR=@T@/tmp, PATH = a mktemp-logging shim dir + /usr/bin:/bin (no node), --fn mk, default --runs 3.
  SOURCES.txt         the frozen sha256 and the cut ranges: MAP_AWK program proto:220-415, SHAPE_STDOUT_AWK
                      proto:425-584, and the unit ranges above.
  records.txt         one line per unit input: `unit/<file> MAP|SHAPE fns=<list> inc=<0|1|-> rc=<awk rc> | <records>`,
                      records in the self-test form (TAB -> |, newline -> ;).
  self-test.stdout.txt / self-test.meta.txt   --self-test with no node on PATH: rc 0, 15 ok, 0 spawns, 1 mktemp.
  e2e/<before>-<after>[-inc]/ report.txt (the --out report), argv.txt (every fake-node argv), meta.txt (rc, node
                      spawns, mktemp calls, TMPDIR entries left, stdout == report). Every pair: 8 spawns (--version,
                      --v8-options, 2 sides x 3 runs), 1 mktemp, 0 entries left.
