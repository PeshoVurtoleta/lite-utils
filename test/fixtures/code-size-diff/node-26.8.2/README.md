# code-size-diff real-trace fixtures (node v26.8.2)

S-9 captures: real V8 `--log-code` traces of the six S-8 live drivers, replayed by the node:test file through
the BUILT root (a replay node stands in for `node`). Every `.log` here is an EXCERPT of a real capture (rule
below); nothing in an excerpted line was edited.

- Node: v26.8.2 (`node --version`), V8 14.6.202.34-node.28, `/opt/homebrew/bin/node` (Homebrew)
- Host: Darwin arm64 (`uname -sm`), platform-arch `darwin-arm64`
- Date: 2026-11-28
- Capture dirs (private `mktemp -d`, characters `[A-Za-z0-9/._-]` only, so no home path enters a trace):
  tf-* and mg-* in `/private/tmp/csd-fx-node-26.8.2.cPDpk2AQ/`; sp-* (recaptured for PLAN A6, the sp drivers
  without `%NeverOptimizeFunction`) in `/private/tmp/csd-fx-node-26.8.2.rtlu0roK/`. `PROVENANCE.txt` names the
  capture dir of every file. Each driver was staged ALONE as `./drv.mjs`, the name the tool runs, so every target
  record reads `natFn file:///<capture dir>/drv.mjs:L:C` (or `medFn ...`). A replay rewrites that capture dir to
  the side dir it runs in.
- Drivers: `../live/<drv>.mjs` (see `../live/README.md`), for drv = tf-ctrl, tf-diff, mg-ctrl, mg-diff, sp-ctrl,
  sp-diff; 3 runs each, files `<drv>.run1.log` .. `<drv>.run3.log` (18 logs).

## Capture command (cwd = the capture dir)

    env -u NODE -u NODE_OPTIONS -u NODE_COMPILE_CACHE -u NODE_REDIRECT_WARNINGS -u GIT_EDITOR \
      -u GIT_SEQUENCE_EDITOR -u EDITOR -u VISUAL -u NODE_V8_COVERAGE \
      /opt/homebrew/bin/node <lane flags> --log-code --no-concurrent-recompilation --no-concurrent-sparkplug \
      --no-node-snapshot --logfile=<capture dir>/run.log ./drv.mjs

Lane flags: tf-* and mg-* `--allow-natives-syntax`; sp-* `--allow-natives-syntax --no-baseline-batch-compilation`.
The argv order is the tool's (V8 extra flags, then the trace flags, then `--logfile`, then the driver). Every
run exited 0, printed `done` as its last stdout line, printed 0 `PREMISE:` lines, and wrote exactly one
`isolate-0x*-*-run.log`.

## Excerpt rule (PLAN A7)

Each full log was 2176240 .. 2182800 bytes (over the 512 KB verbatim limit), so each committed file is the
`v8-version` line plus every `code-creation` line, in log order (`grep -a -E '^(v8-version|code-creation),'`):
2945 .. 2965 lines, 234106 .. 237256 bytes. The full logs stay in `.handoff/csd-130/evidence/g4-cap/full/`.
Replayed through the frozen prototype (`8f6d0b4 / 45375555`), every pair (tf A/A, tf diff, tf `--report`, mg A/A,
mg diff with `--tiers maglev`, sp A/A, sp diff with `--tiers sparkplug`) gives whole output BYTE-equal from the
excerpts and from the full logs (the staging dir masked).

## Target records (identical in all 3 runs of each driver)

| drv | target | records (name:$9:$6) |
|---|---|---|
| tf-ctrl | natFn | `natFn:~:12 natFn:*':220` |
| tf-diff | natFn | `natFn:~:63 natFn:*':244` |
| mg-ctrl | natFn | `natFn:~:12 natFn:+':392` |
| mg-diff | natFn | `natFn:~:63 natFn:+':456` |
| sp-ctrl | medFn | `medFn:~:69 medFn:^:576 medFn:+':900 medFn:*':720` |
| sp-diff | medFn | `medFn:~:88 medFn:^:664 medFn:+':976 medFn:*':476` |

Per-file lines and sha256: `PROVENANCE.txt`.
