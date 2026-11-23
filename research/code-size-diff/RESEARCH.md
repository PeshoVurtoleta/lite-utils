# Research: `code-size-diff` (ROADMAP L4, target 1.3.0)

Status: research drop (INTAKE + self-checking probes + runnable prototype; not a shipped script).
Provenance: 2026-11-22T23:49Z-23:51Z, `darwin-arm64`, `/bin/bash 3.2.57(1)-release`, BSD awk,
load1 `3.86-4.30` (PRELIMINARY shared host; untimed, **REPORTED** tier), 4 env vars stripped
(`NODE_OPTIONS`, `NODE_V8_COVERAGE`, `NODE_COMPILE_CACHE`, `NODE_REDIRECT_WARNINGS`).
Node binaries probed on this host:
- `v22.23.5` (`V8 12.4.254.21-node.57`)
- `v24.22.3` (`V8 13.6.233.17-node.63`)
- `v26.8.2` (`V8 14.6.202.34-node.28`)
- `v27.0.0-alpha.0.1.0` (`V8 15.6.75.50-node.11`)

Self-checking probe runner: [probes/run-probes.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/code-size-diff/probes/run-probes.sh) (exits 0 iff all assertions pass; exits 1 on any drift).
Runnable blueprint: [code-size-diff.prototype.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/code-size-diff/code-size-diff.prototype.sh).

> **Coverage gap (UNCONFIRMED):** Only `darwin-arm64` was run here. **Linux x64** (variable-length x64
> instruction encoding under ASLR, mawk/gawk, and Ubuntu uutils `cmp`/`tail -c`/`seq`) is **UNCONFIRMED**
> and must be captured on one CI leg before 1.3.0 ships.

---

## 1. INTAKE Ladder, Kill Rules, and LEDGER Law Mapping

### 1.1 Question & Ladder
Question: Can a standalone bash + POSIX awk script compare V8 optimized machine-code byte sizes per named
function BEFORE vs AFTER using `--log-code` CSV, across Node 22 / 24 / 26 / 27+, obeying LiteUtils's
fail-closed template (ROADMAP section 1 items 1-7) and all applicable LEDGER laws?

| Rung | Gate / criterion | Kill rule | Status on darwin-arm64 |
| --- | --- | --- | --- |
| R1 Schema | `--log-code` emits parseable CSV with 0 empty `$9` tier markers across Node 22/24/26/27 | Kill `$9` keying if any supported Node emits `""` in `$9` on JS/Eval/Script | **PASS** (0 empty across all 4 majors) |
| R2 Determinism | Same driver byte-identical across runs (ASLR heap constants 8/8, S-8 natives 20/20) | Kill if native code size varies across ASLR runs on the same binary | **PASS arm64** (8/8 ASLR, 20/20 natives); **x64 UNCONFIRMED** |
| R3 Signal | Catches native inlining bloat (`bloat-before` vs `bloat-after`) and deopt-recompile churn (`deopt-reopt`) while staying `SAME` on line-shifted twins | Kill if line shifts DIFF or bloat reads SAME | **PASS** across Node 22/24/26/27 |
| R4 Guard & Honesty | Ambiguous same-named fn across two files -> `NO-VERDICT` (never swapped `SAME`); `--max` pins node + arch (or dropped per `Q-CSD-MODES`); Turbolev refused | Kill `--max` if sizes vary across CI legs without a build fingerprint (`Q-CSD-MODES`) | **PASS** (all refusals & guards verified) |
| R5 Linux x64 CI | Same probes green on Ubuntu x64 (x64 ASLR, mawk/gawk, uutils coreutils) | Hold release if x64 ASLR varies sizes | **OPEN** (1 CI capture needed) |

### 1.2 LEDGER Law Mapping
- **LEDGER law 3 (refuse before first spawn or write):** All CLI conflicts (D4 `--report` + `--max`), empty/trailing-comma lists (D5), newline/CR paths (`nl_refuse` / `nl_dir`, D6), `--out` symlink/hardlink/non-empty/input-collision checks, and `--v8-flags` preload/eval/print checks exit `2` with `0` spawns; runtime allowlist (`MD-46` / `MD-50..58`) exits `2` after one `--v8-options` read.
- **LEDGER law 4 (allowlist, never denylist; MD-46):** Prototype embeds `lib/v8flags.sh` verbatim (`v8fl_check` against `node --v8-options`), refusing all Node options (`--inspect`, `--eval`, `--run`, `--cpu-prof`), unknown flags, and string flags (`--sparkplug-filter=...`).
- **LEDGER law 5 (resolve once to one absolute path):** `NODE_RES` resolved once from caller cwd; `-`-led `--out` normalized to `./$OUT`.
- **LEDGER law 6 (test the tests -- every gate fails on old code):** `--self-test` (27 checks; 8/8 mutants killed) includes dedicated failing-on-old-code rows for Defect 1 (ambiguous fn), D2 (`get,get value` order), D3 (`v8fl_ok`), D4 (mode conflicts both orders), D5 (empty/trailing comma), D6 (newline path, existing and missing), D7 (`Q-CSD-KEY (a)` numeric tripwire), D8 (0 raw TABs), and D9 (nullctl drift); plus `probes/run-probes.sh` runs S-8 must-SAME and must-DIFF pairs end-to-end through the prototype.
- **LEDGER law 7 (portable oracles):** NUL check (`tr -d '\000' | cmp -s`), octal `\047` and `length($6) > 9` in POSIX awk, `FILENAME == ARGV[1]`, `set -f` around `V8_EXTRA` word-splitting. Linux mawk/gawk + uutils remains a CI LEAD.

---

## 2. Empirical 4-Node Probe Results (`darwin-arm64`)

All results below were verified by running [probes/run-probes.sh](file:///Users/zakkster/Work/Portfolio/LiteLibrariesSuite/LiteUtils/research/code-size-diff/probes/run-probes.sh) on all four Node binaries (22/22 ok on `v22.23.5`, 22/22 ok on `v24.22.3`, 23/23 ok on `v26.8.2`, 23/23 ok on `v27.0.0-alpha.0.1.0`):

### 2.1 Cross-Node CSV Schema & Numeric `CodeKind` (`$3`) vs Symbolic Marker (`$9`)

| Node version | V8 version | `Builtin` `$3` | `RegExp` `$3` | `~` (Ign) `$3` | `^` (SP) `$3` | `+`/`+'`/`o+` `$3` | `*`/`*'`/`o*` `$3` | Observed `$9` markers (`markers.mjs`) | Empty `$9`? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `v22.23.5` | `12.4.254.21` | `2` (NF=7) | `3` (NF=7) | `9` | `10` | *(Maglev off by def)* | `12` | `~ ^ *` (OSR prints `*`, no `'`) | **0** |
| `v24.22.3` | `13.6.233.17` | `2` (NF=7) | `3` (NF=7) | `9` | `10` | `11` (`+`, `+'`) | `12` (`*`, `*'`) | `~ ^ + +' * *'` (OSR prints `+`/`*`) | **0** |
| `v26.8.2` | `14.6.202.34` | `3` (NF=7) | `4` (NF=7) | `10` | `11` | `12` (`+`, `+'`, `o+`) | `13` (`*`, `*'`, `o*`) | `~ ^ + +' o+ * *' o*` (8 of 10) | **0** |
| `v27.0.0-alpha.0.1.0` | `15.6.75.50` | `3` (NF=7) | `4` (NF=7) | `10` | `11` | `12` (`+`, `+'`, `o+`) | `13` (`*`, `*'`, `o*`) | `~ ^ + +' o+ * *' o*` (8 of 10) | **0** |

Key takeaways:
1. This directly explains why `ic-diff.sh` (`LEDGER.md #83, #110`) returns `NO-VERDICT` on Node 22/24 (`Builtin,2` and `JS,9/10/11/12` instead of `Builtin,3` and `JS,10/11/12/13`), and resolves `R2-L4-1` (`MINORS-PLAN.md` item 4) without hardcoding V8 enum tables!
2. **`Q-CSD-KEY (a)` version-free tripwire holds on all 4 majors:** within any single log, each base tier (`ignition`, `sparkplug`, `maglev`, `turbo`) maps to **exactly one** numeric `$3`, and distinct base tiers map to **distinct** numeric `$3`. Any violation fails closed (`X`).
3. **Unobserved markers (`o+'`, `o*'`):** Never emitted on any of the 4 Node majors (even `osrCaptures()` capturing a mutable module `let` emitted `o+` / `o*` on Node 26/27 and `+` / `*` on Node 22/24). Kept in the closed allowlist defensively; any truly unknown marker triggers `X`.
4. **Event `$1` inventory (identical 9 events on all 4 Node majors):** `code-creation`, `code-source-info`, `script-source`, `new`, `delete`, `v8-version`, `v8-platform`, `heap-capacity`, `heap-available` (plus `code-move` under GC; `sfi-move` and `code-deopt` were not observed in these runs and stay in the allowlist only defensively).

### 2.2 Verbatim Real Trace Lines (`node v26.8.2`, `probes/markers.mjs` & `probes/deopt-reopt.mjs`)

```text
code-creation,JS,10,75116,0x3e3b7ba1efd0,36,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,~
code-creation,JS,11,76011,0x115886e60,416,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,^
code-creation,JS,12,75250,0x115849500,756,multiCtx file://<REPO>/research/code-size-diff/probes/markers.mjs:27:27,0xd0cdce93df8,+
code-creation,JS,12,75309,0x115849860,768,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,+'
code-creation,JS,12,76950,0x11584a2e0,780,modOsr file://<REPO>/research/code-size-diff/probes/markers.mjs:14:16,0xd0cdce90d78,o+
code-creation,JS,13,75951,0x115849be0,528,multiCtx file://<REPO>/research/code-size-diff/probes/markers.mjs:27:27,0xd0cdce93df8,*
code-creation,JS,13,76363,0x11584a080,536,modHot file://<REPO>/research/code-size-diff/probes/markers.mjs:8:16,0xd0cdce90d30,*'
code-creation,JS,13,75109,0x122e4cd60,552,modOsr file://<REPO>/research/code-size-diff/probes/markers.mjs:14:16,0x3f7583290d68,o*
```

### 2.3 Key Behavioral Measurements (Reproduced by `probes/run-probes.sh`)
- **Inlining bloat (`bloat-before.mjs` vs `bloat-after.mjs`, `v26.8.2`):** `hot` Ignition `38 -> 72 B`, Maglev `824 -> 1144 B`, TurboFan `596 -> 644 B` -> `DIFF` (`rc 1`, `0` raw TABs). Line-shifted twin (`bloat-shifted.mjs`) -> `SAME` (`rc 0`).
- **Ambiguous same-named function (`ambig-before.mjs` vs `ambig-after.mjs`):** Two modules (`ambig-small.mjs`, `ambig-big.mjs`) each define `hot`; swapping import order returns **`NO-VERDICT` (`rc 2`)** across all 4 Node majors (never false `SAME`).
- **Deopt-recompile churn & `--turbolev` (`deopt-reopt.mjs`, `v26.8.2`):** Default logs `~ 6`, `+' 348`, `*' 204`, `+' 392`, `*' 344` (plus top-level `o+ 796`). With `--turbolev`, final compile logs identical `JS,13,*'` at `336 B` (`344 -> 336`). Prototype refuses `--turbolev` / `--turbolev-future` by exact name and refuses default-on Turbolev via `--v8-options` (`LEDGER #107 G5c`).
- **ASLR heap-constant repeatability (`aslr-const.mjs`, arm64):** `8/8` identical on all 4 Node majors (`v26.8.2`: `aslrHot:~:63  +':880  *':680`). **x64 UNCONFIRMED.**
- **Sparkplug (`sparkplug-10x.mjs`):** `--no-concurrent-sparkplug` accepted on all 4 Node majors and `10/10` identical. Sparkplug stays opt-in (default `--tiers turbo,maglev`) because its emission depends on `--baseline-batch-compilation-threshold=4096` (coupling to unrelated functions in the driver: `bloat-before` emits `0` `^`, `bloat-after` emits `^`) and tier path, and it is a non-inlining baseline compiler.
- **Comma escaping (`a,b/drv.mjs`):** Escaped as `a\x2Cb/drv.mjs` (`NF=9`, `0` raw commas) on all 4 Node majors.
- **S-8 natives control (`natives-ctrl.mjs` vs `natives-diff.mjs`):** `must-SAME` (`rc 0`), `must-DIFF` (`rc 1`), and `20/20` identical across all 4 Node majors (`v22`: `~12 *244`; `v24`: `~12 *'220`; `v26`: `~12 *'220`; `v27`: `~12 *'212`).

---

## 3. Architecture, Exit Table, and Shared `lib/*.sh` Reuse Map

### 3.1 Exit Table per Mode

| Mode | Invocation | Exit `0` | Exit `1` | Exit `2` |
| --- | --- | --- | --- | --- |
| `diff` (default) | `--fn LIST BEFORE AFTER` | `VERDICT SAME` | `VERDICT DIFF` | `VERDICT NO-VERDICT` (refusal, parse `X`, ambiguous `A`, nullctl, guard) |
| `report` | `--report --fn LIST DRIVER` | `VERDICT OK` | *(never)* | `VERDICT NO-VERDICT` |
| `gate` *(if `Q-CSD-MODES (b)`)* | `--max fn=N --node-version vX.Y.Z --platform-arch OS-ARCH DRIVER` | `VERDICT WITHIN` | `VERDICT OVER` | `VERDICT NO-VERDICT` (incl. version or platform-arch mismatch) |
| `self-test` | `--self-test` | all checks ok | `>= 1` check FAILED | unexpected error / bad extra arg |
| `help` | `-h \| --help` | *(never)* | *(never)* | usage text printed to stderr |

### 3.2 Exact `lib/*.sh` Reuse Map (Verified Against Live `lib/`)
- `lib/prologue.sh`: strict mode, `nocasematch`, `posix`, `FINAL`/`DIED` fail-closed EXIT trap, `_sig`, `sig_arm`, `drv_wait`, `LC_ALL=C`.
- `lib/msdiff.sh`: `MSDIFF_AWK` only.
- `lib/common.sh`: `die`, `say`, `sha8`, `usage`, `multiset` (`sort | uniq -c`), `worst` (`SAME/DIFF/NO-VERDICT` for `diff` mode), `nl_refuse`, `nl_dir`, `rep_refuse`.
  - Note: report/gate modes use a local `vworst()` lattice (`OK/WITHIN/OVER/NO-VERDICT`), matching `src/bytecode-budget.sh:304`, because `lib/common.sh`'s `worst()` knows only `SAME/DIFF/NO-VERDICT`.
- `lib/args.sh`: `need()` (supports both `--opt val` and `--opt=val`, refusing empty `--opt=`).
- `lib/v8flags.sh`: **verbatim** `V8FL_AWK`, `V8FL_RE`, `v8fl_read`, `v8fl_ok`, `v8fl_check` (zero edits to `lib/v8flags.sh`; Turbolev check stays local per `Q-CSD-TLLIB (a)`).
- `lib/nullctl.sh`: file-based `cmp -s` + `MSDIFF_AWK` null-control pattern over run 1..N multiset files in `$MSDIR`.
- `lib/tracked.sh` + `lib/stage.sh`: only if `Q-CSD-REF (b)` is ruled (driver-mode only recommended for 1.3.0).

### 3.3 Alternatives That Lost
- **`max` or `last` size instead of multiset:** Loses because deopt-recompile churn (`Maglev 348 -> TurboFan 204 -> Maglev 392 -> TurboFan 344`) collapses to a single number and hides recompilation regressions.
- **Builtin-relative numeric `$3` (`MINORS-PLAN` item 4 / `DRAFT`) instead of `$9` + tripwire:** Loses because `$9` directly encodes OSR (`o+`/`o*`), context specialization (`+'`/`*'`), and tier across Node 22/24/26/27 without enum arithmetic, while the `Q-CSD-KEY (a)` tripwire preserves the numeric-consistency fail-closed invariant.
- **Allowing ambiguous same-named functions across files (`--fn hot` merging `a.mjs` + `b.mjs`):** Loses because swapping sizes between `a.mjs` and `b.mjs` produces a false `VERDICT SAME` (exit 0). Refusing >1 definition location fails closed (`NO-VERDICT`).
- **Folding OSR (`o+`/`o*`) into non-OSR (`+`/`*`):** Loses because an OSR loop compile replacing a regular entry compile (or vice versa) is a meaningful compilation-tier change.
- **Modifying `lib/v8flags.sh` to share one `--v8-options` capture with Turbolev:** Loses because touching `lib/v8flags.sh` moves the sha256 of every 1.0.0 root script and breaks LiteSignal's S-11 vendored pin.

---

## 4. Maintainer Rulings Needed (`Q-CSD-*`, Recommended Option First)

- **`Q-CSD-INTAKE`:** How to proceed into 1.3.0.
  - **(a) (Recommended)** Run one CI capture of `probes/run-probes.sh` on Ubuntu x64 (Node 22/24/26/latest) to close Rung R5, adopt the ruled `Q-CSD-*` answers into a PROPOSAL, then brief planner.
  - (b) Go straight to planner now and put the Ubuntu x64 capture in G0 TASK 0.
  - (c) Shelve and start from the earlier DRAFT.
- **`Q-CSD-MODES`:** Which verdict modes ship in 1.3.0.
  - **(a) (Recommended)** `diff` + `--report` only (no `--max`). Aligns with S-5 (user-driver code size is STATISTICAL with no statistical host) and avoids per-OS/arch/build-flag ceiling maintenance.
  - (b) `diff` + `--report` + `--max`, pinned to `--node-version`, `--platform-arch`, AND a build fingerprint (`--v8-options` sha + pointer-compression/sandbox config), only after an S-6-style 20-run settle across all CI legs.
  - (c) `--max` with `--node-version` + `--platform-arch` only (current prototype; still exposed if two binaries share version+arch with different build flags).
- **`Q-CSD-MAXQ` (only if `Q-CSD-MODES (b)`):** What `--max` bounds.
  - **(a) (Recommended)** Per tier (`--max fn:turbo=N`), missing tier -> `NO-VERDICT`.
  - (b) Max across selected tiers (prototype).
  - (c) Sum across multiset.
- **`Q-CSD-KEY`:** How tiers are classified.
  - **(a) (Recommended, implemented in prototype)** `$9` symbolic marker + version-free tripwire (1:1 mapping between base tier and numeric `$3` within each log, else `X`). Verified on Node 22/24/26/27.
  - (b) `$9` marker only (no `$3` consistency tripwire).
  - (c) Builtin-relative numeric `$3` (`R2-L4-1`).
- **`Q-CSD-NAME`:** Same-named function defined at >1 location (`file:line:col`).
  - **(a) (Recommended, implemented in prototype)** Ambiguous name -> `NO-VERDICT` (exit 2), preventing swapped-file false `SAME`.
  - (b) Key `V` on `fn + basename` (still merges two `index.mjs` files in different dirs).
  - (c) Document as known limit (retains wrong verdict).
- **`Q-CSD-SPARK`:** Sparkplug (`^`) in default verdict.
  - **(a) (Recommended, implemented in prototype)** Default `--tiers turbo,maglev`, `sparkplug` opt-in; pass `--no-concurrent-sparkplug` for synchronous compilation; documented reason = batch threshold (`4096`) + tier-path dependence + non-inlining baseline.
  - (b) Include `sparkplug` in default `--tiers`.
  - (c) Never selectable (REPORTED only).
- **`Q-CSD-TLLIB`:** Where the Turbolev check lives.
  - **(a) (Recommended, implemented in prototype)** Local in `src/code-size-diff.sh` with one extra `--v8-options` spawn (0 changes to `lib/v8flags.sh` or 1.0.0 root shas).
  - (b) Extract `lib/turbolev.sh` and update `inlining-budget-diff.sh` (moves 1.0.0 root sha; S-11 drift).
- **`Q-CSD-CTX`:** Context-specialization apostrophe (`+'` vs `+`, `*'` vs `*`).
  - **(a) (Recommended, implemented in prototype)** Strip `'` from verdict key; keep `ctx` column for REPORTED.
  - (b) Keep `'` in verdict key (specialization gain/loss at equal size -> `DIFF`).
  - (c) Strip `'` and print a REPORTED note if `ctx` differs across sides.
- **`Q-CSD-OSR`:** OSR compiles (`o+`, `o*`).
  - **(a) (Recommended, implemented in prototype)** Separate keys (`maglev-osr`, `turbo-osr`) inside their base tier's `--tiers` selection.
  - (b) Fold OSR into `maglev` / `turbo`.
  - (c) Exclude OSR unless explicitly listed in `--tiers`.
- **`Q-CSD-REF`:** Ref / file staging (`lib/stage.sh`).
  - **(a) (Recommended)** Driver mode only in 1.3.0 (matching `ic-diff` 1.0.0; staging parity deferred to LEAD-1).
  - (b) Include `lib/stage.sh` ref/file modes in 1.3.0.
- **`Q-CSD-TL`:** Turbolev handling.
  - **(a) (Recommended, verified live)** Refuse `--turbolev` / `--turbolev-future` by exact name (any `-`/`_`, any `=value`) after `v8fl_check`, and refuse a default-on node (`LEDGER #107 G5c`).
  - (b) Allow and tag header.
  - (c) Opt-in flag to allow.
