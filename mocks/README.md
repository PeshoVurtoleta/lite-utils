# Known-Answer Corpus (`mocks/`) for `@zakkster/lite-utils`

Repository-only known-answer test corpus for all seven `@zakkster/lite-utils` tools.
This directory is NOT published to npm (`package.json` `files[]` excludes `mocks/`) and the 97 real-V8 cases do NOT run inside `npm test`.
Only the deterministic runner self-test (`node mocks/run.mjs --self-test`, fake tool only) runs inside `npm test` via `test/mocks-runner.test.mjs`.

Each subdirectory `mocks/<tool>/<case>/` holds one small, readable program pair (or single bench) plus a hand-written `case.json` written from the tool's documented claim before it is ever run.
Running `npm run mocks` executes every case through the real shipped root tools and checks exit code, tool verdict line, reason text, and forbidden-text rules.

## Quick start

```bash
# Run the full corpus on the primary Node binary (exit 0 = all as expected, 1 = mismatch, 2 = runner error)
npm run mocks -- --node /opt/homebrew/bin/node

# Release-gate mode: also fail (exit 1) if any `known` case now matches (stale `known` tag)
npm run mocks -- --node /opt/homebrew/bin/node --strict-known

# Validate every case.json and print the catalog table (0 tool spawns)
node mocks/run.mjs --list

# Inspect one case: claim, file diff, standalone command, and live raw tool output
node mocks/run.mjs --explain shape-diff/smi-to-double --node /opt/homebrew/bin/node

# Filter by tool, kind, or substring
node mocks/run.mjs --tool shape-diff,ic-diff --node /opt/homebrew/bin/node
node mocks/run.mjs --kind change,aa --repeat 2 --node /opt/homebrew/bin/node
node mocks/run.mjs --only file-mode --node /opt/homebrew/bin/node

# Fast deterministic self-test of the runner itself (< 5 s nominal, fake tool only, no V8 logging)
node mocks/run.mjs --self-test
```

## Runner flags (`mocks/run.mjs`)

| Flag | Description |
|---|---|
| `--node ABS` | Absolute path to the target `node` binary (default: current `node`). Never pass a bare `node` name. |
| `--tool LIST` | Comma-separated exact tool folder names (`shape-diff`, `bytecode-budget`, `inlining-budget-diff`, `deopt-diff`, `allocation-diff`, `ic-diff`, `alloc-per-op`). |
| `--kind LIST` | Comma-separated exact case kinds (`change`, `same`, `aa`, `limit`, `guard`, `teeth`). |
| `--only SUBSTR` | Case-ID substring filter (`<tool>/<case>`), combined via AND with `--tool` and `--kind`. |
| `--repeat K` | Run each selected case `K` times (`1..20`, default `1`). Any differing result across repeats is `MISMATCH`. |
| `--cap SEC` | Per-case timeout in seconds (`1..3600`, default `120`). Kills the whole child process group on expiry. |
| `--keep DIR` | Keep per-case staging directories and `tool-output.txt` inside `DIR` (must resolve outside the repo; symlinks refused). |
| `--json PATH` | Write structured run results JSON (including `node` and `process.versions.v8`) to `PATH` outside the repo. |
| `--strict-known` | Treat `KNOWN-MATCH` as exit `1` (used by `/release` so fixed findings drop their `known` tag). |
| `--list` | Validate all selected `case.json` files and print the catalog table (0 spawns, exit 0). |
| `--explain ID` | Print claim, file diff, standalone command, and live raw output for one `<tool>/<case>`. |
| `-v`, `--verbose` | Print the first matched evidence line indented beneath each passing row. |
| `--self-test [ROW]` | Run the deterministic fake-tool self-test (`S1`-`S14`), or one named row (e.g. `--self-test=S8`). |
| `-h`, `--help` | Print usage text and exit `2`. |

## Reading output and exit codes

| Status | Meaning | Exit |
|---|---|---|
| `OK` | Verdict matched, all `expect.text` matchers hit, and 0 `expect.forbid` hits. | 0 |
| `LIMIT` | Same as `OK` for a documented tool limit (`kind: "limit"`). | 0 |
| `TEETH-OK` | Runner teeth case (`kind: "teeth"`): tool returned `teeth_got` instead of the deliberately wrong `expect.verdict`. | 0 |
| `KNOWN` | Case tagged `known: "<id>"` returned a different valid verdict (known open bug). | 0 |
| `KNOWN-MATCH` | Case tagged `known: "<id>"` now matches `expect`. Pass by hand; exit `1` under `--strict-known`. | 0 / 1 |
| `MISMATCH` | Wrong verdict, missing reason text, forbidden text hit, repeat flip, or fatal error on a `known` case. | 1 |
| `INCONSISTENT` | Tool's exit code disagreed with its `VERDICT` / summary line (or line missing / conflicting). | 1 |
| `TIMEOUT(Ns)` / `SPAWN-ERROR(...)` / `SIGNAL(...)` / `RCn` | Process-group timeout, spawn failure, signal kill, or exit code outside `0..2`. | 1 |
| `TEETH-FAILED` | Teeth case did not return `teeth_got` (or timed out / errored). | 1 |

Runner, CLI, and schema errors (unknown `case.json` key, unfilled `{placeholder}`, symlinked `--keep`/`--json`, 0 selected cases, or `SIGINT`/`SIGTERM`) exit `2` before spawning tools.

## Multi-Node shell loop

`mocks/run.mjs` tests one Node binary per invocation and never downloads binaries.
To check several local Node versions sequentially (under the host quiet lock when sharing a machine):

```bash
OUT=$(mktemp -d)
for nb in \
  /opt/homebrew/bin/node \
  .handoff/nodes/v22.23.5/x/node-v22.23.5-darwin-arm64/bin/node \
  .handoff/nodes/v24.22.3/x/node-v24.22.3-darwin-arm64/bin/node \
  .handoff/nodes/v27.0.0-alpha.0.1.0/x/node-v27.0.0-alpha.0.1.0-darwin-arm64/bin/node; do
  ver=$("$nb" --version)
  echo "=== $ver ==="
  /opt/homebrew/bin/node mocks/run.mjs --node "$nb" --strict-known --json "$OUT/results.$ver.json"
done
```

## Tool catalogs

- [shape-diff](shape-diff/README.md) (27 cases)
- [bytecode-budget](bytecode-budget/README.md) (14 cases)
- [inlining-budget-diff](inlining-budget-diff/README.md) (10 cases)
- [deopt-diff](deopt-diff/README.md) (14 cases)
- [ic-diff](ic-diff/README.md) (12 cases)
- [allocation-diff](allocation-diff/README.md) (10 cases)
- [alloc-per-op](alloc-per-op/README.md) (10 cases)

## Adding a case

1. Create `mocks/<tool>/<kebab-case-name>/` with small, ASCII-only program files and a hand-written `case.json`.
2. Write `claim` and `expect` from the tool's `-h` or `README.md` contract **before** running the tool.
   - `change`, `guard`, `limit`, `aa`, and any `NO-VERDICT` expectation must include `expect.text`.
   - Each matcher checks that all listed substrings appear on **one** line. `stream: "stderr"` is allowed only on `NO-VERDICT` / `guard` cases.
   - Never put observed numbers (counts, bytecode lengths, B/op) in `expect` or comments.
   - Use `expect_by_major` only for variance documented by the tool (`ic-diff` 22/24, `ic-diff` 27 state H (Q-B123-H (a)), `inlining-budget-diff` maglev 22, `bytecode-budget` prerelease gate). The Q-B122-DRIFT refusal pins (`ic-diff` poly-to-mega 27, `allocation-diff` guard-old-gc 22) are gone: retired by the Q-B123-H (a) / Q-B123-GCSET (a) engine fixes.
3. Validate with `node mocks/run.mjs --list --tool <tool>` and verify ASCII (`LC_ALL=C grep -rn '[^ -~]' mocks/<tool>/<name>` prints nothing).
4. Run with `--repeat 2` (or `--repeat 3` for `allocation-diff` and `alloc-per-op`) across supported Node binaries and add a row to `mocks/<tool>/README.md`.
