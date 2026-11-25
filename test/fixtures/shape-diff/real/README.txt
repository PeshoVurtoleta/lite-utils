test/fixtures/shape-diff/real/ -- real node captures for shape-diff (LiteUtils 1.2.0, b105 G-L B0c, PLAN-SD-L TASK 0c)
=====================================================================================================================

Rulings: SPEC-1.2.0 Q-B103-CAPMAJORS (a) (majors 22 / 24 / 26 / 27), Q-B103-CAPSIZE (a) as amended by A10 / Q-B105-CAPSIZE (a) "excerpts only" (the proven trim
stays; no capture is placed), Q-B103-SD-REALCAP (a) (<= 60-line excerpts embedded as self-test heredocs), Q-B103-SD-D5 (a) (D5 census),
addendum A2 (i) as amended by A10 (G-L delivers excerpts, PROVENANCE, expect, census; the full captures
stay evidence).

Layout
------
  _src/trim.awk              the verdict-preserving trim (Q-B103-CAPSIZE (a)); usage: awk -f trim.awk LOG LOG
  _src/d-a-events.mjs        the D-A driver (EventEmitter setMaxListeners; RECHECK2 section 5), 20000 calls of mk()
  <major>/PROVENANCE.txt     one capture set per major: 22 = v22.23.5, 24 = v24.22.3, 26 = v26.8.2,
                             27 = v27.0.0-alpha.0.1.0 (ALPHA: re-cut at GA)
  <major>/expect.txt         raw-grep counts on the rewritten UNTRIMMED logs + the D5 census per capture
  <major>/excerpt/run.log    <= 60 verbatim lines of the unstable-all V8 map log
  <major>/excerpt/run.out    <= 60 verbatim lines of the unstable-all stdout + stderr (2>&1)
  <major>/excerpt/driver.mjs research/shape-diff/probes/unstable-all.mjs, byte-identical
  (no <major>/<name>.{log,out}: A10 "excerpts only" -- each trimmed log is 6.6 - 10.4 MB, PROVENANCE `placed=NONE`;
   the full captures (untrimmed + trimmed .log.gz, .out, MAP_AWK / SHAPE_STDOUT_AWK records) are gitignored evidence
   under .handoff/evidence/b103-cap/<major>/)

How a capture was made (per major, per driver; drivers unstable-all, helper-del, clean-and-literal from
research/shape-diff/probes/ read in place and sha256-pinned in PROVENANCE, plus _src/d-a-events.mjs)
-----------------------------------------------------------------------------------------------------
  - TRACE_FLAGS parsed from the frozen prototype's `TRACE_FLAGS=(` block (7 flags; PROVENANCE `flags=` is the argv
    verbatim, one line). The driver is copied into a private realpath'd mktemp dir and run there as
      node <flags> --logfile=<dir>/run.log ./<name>.mjs   >  <name>.out  2>&1
    (cwd = <dir>; child env: NODE_* and editor variables stripped, TMPDIR private). V8 writes
    <dir>/isolate-0x<addr>-<pid>-run.log; exactly one such file is required.
  - Path rewrite: every occurrence of the private dir (exact string) becomes `/w` in both the log and the out, so
    script URLs read `file:///w/<name>.mjs`. Counts are in PROVENANCE `rewrite_count`; the residual count of
    `/Users/`, `/var/folders`, `/private/`, the node binary path and the tmpdir is 0 in every file.
  - Trim (logs only): _src/trim.awk drops script-source, code-source-info, new, delete, heap-available,
    heap-capacity, sfi-move lines and map-details lines whose address is in no `map,Transition` from / to field.
    Proof: the prototype's MAP_AWK (cut by its exact `MAP_AWK='` / `'` delimiter lines, the cut-golden.sh method)
    gives byte-identical records on the untrimmed and the trimmed log, for inc_trans=0 and inc_trans=1
    (PROVENANCE `map_records ... EQUAL`); a trim.awk copy that also drops code-creation changes them
    (`DIFFERS (control has teeth)`) on every capture.

Excerpt format (what the G-E capture reader / self-test heredocs consume)
-------------------------------------------------------------------------
  - Plain ASCII, printable bytes 0x20-0x7e plus LF only: no TAB, no NUL, no CR; every file ends in LF; <= 60 lines.
  - Lines are verbatim from ONE capture (the major's unstable-all run) in original order, except the path rewrite
    above (file:///w/unstable-all.mjs). V8 escapes newlines inside a map-details line as the two characters `\n`,
    so each map-details record is one line.
  - run.log holds: v8-version, v8-platform, the code-creation lines of the code objects the kept map events
    resolve to (target fns Point, work), those map events (Transition HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS,
    Normalize DeletingProperty, 2 x Deprecate) and, for the Transition, the last map-details line of its from and
    to address before it. Every kept map pc resolves inside a kept code-creation range.
  - run.out holds the stdout lines with a Point / work frame at file:///w/: the ELEM line
    `elements transition [PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS] in ~work+N at file:///w/unstable-all.mjs:42`
    and the Point GEN line `x:s{Any;const}->d{Any;const} (+1 maps)`.
  - Definite prototype verdict on every major (frozen proto eb7c1b65, fake node replaying the excerpt, --runs 2,
    --fn Point,work, driver.mjs as BEFORE and AFTER): rc 0, `VERDICT SAME`, Point SAME (2 | 2 sites), work SAME
    (3 | 3 sites). MAP_AWK records (fns=Point,work, inc_trans=0):
      K Point / R Point / K work / R work /
      M work MAP_ELEM_DICT unstable-all.mjs:43:31 HOLEY_ELEMENTS -> DICTIONARY_ELEMENTS 1 /
      M work MAP_NORMALIZE unstable-all.mjs:44:19 DeletingProperty 1 /
      M Point MAP_DEPRECATE unstable-all.mjs:14:30 - 2
    SHAPE_STDOUT_AWK records: E work ELEM unstable-all.mjs:42 PACKED_SMI_ELEMENTS -> PACKED_DOUBLE_ELEMENTS 1 /
      E Point GEN unstable-all.mjs:14 x:s{Any;const}->d{Any;const} (+1 maps) 1
    The records are identical across 22 / 24 / 26 / 27; the excerpt bytes differ (v8-version, addresses, times).
    Each PROVENANCE.txt `[excerpt]` section carries the excerpt sha256s, the records and the verdict lines.

D5 census (Q-B103-SD-D5)
------------------------
  expect.txt `D5 transitions_without_map-details`: Transitions whose from or to map has no map-details line,
  counted at parse time (MAP_AWK's view: no map-details line for the address before the Transition) and anywhere in
  the log. b105: 0 / 0 on all 16 captures (4 majors x 4 drivers).

Generators (evidence, not shipped): .handoff/b103/task0/cap/capture.mjs, .handoff/b103/task0/cap/excerpt.mjs.
