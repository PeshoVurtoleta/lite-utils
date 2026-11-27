#!/usr/bin/env node
// mocks/run.mjs -- Known-answer corpus runner for @zakkster/lite-utils (repo-only, zero deps).
// Runs hand-written case.json suites against the seven root tools, verifies exit code + tool
// verdict line + reason text + forbid rules, and exits 0 (all as expected), 1 (mismatch/error),
// or 2 (runner/CLI/schema error or signal). Never writes inside the repository tree.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = fs.realpathSync(path.resolve(path.dirname(SELF_FILE), '..'));
const DEFAULT_CASES_DIR = path.join(REPO_ROOT, 'mocks');

const WANT_TOOLS = new Map([
  ['shape-diff.sh', { dir: 'shape-diff', modes: ['diff'], isMjs: false }],
  ['bytecode-budget.sh', { dir: 'bytecode-budget', modes: ['diff', 'gate'], isMjs: false }],
  ['inlining-budget-diff.sh', { dir: 'inlining-budget-diff', modes: ['diff'], isMjs: false }],
  ['deopt-diff.sh', { dir: 'deopt-diff', modes: ['diff'], isMjs: false }],
  ['allocation-diff.sh', { dir: 'allocation-diff', modes: ['diff', 'zero'], isMjs: false }],
  ['ic-diff.sh', { dir: 'ic-diff', modes: ['diff'], isMjs: false }],
  ['alloc-per-op.mjs', { dir: 'alloc-per-op', modes: ['apogate', 'apoab'], isMjs: true }],
]);
const WANT_TOOL_DIRS = new Set([...WANT_TOOLS.values()].map((t) => t.dir));

const MODES = {
  diff: ['SAME', 'DIFF', 'NO-VERDICT'],
  zero: ['ZERO', 'NONZERO', 'NO-VERDICT'],
  gate: ['WITHIN', 'OVER', 'NO-VERDICT'],
  apogate: ['PASS', 'FAIL', 'NO-VERDICT'],
  apoab: ['SAME', 'DIFF', 'NO-VERDICT'],
};

const KINDS = new Set(['change', 'same', 'aa', 'limit', 'guard', 'teeth']);
const TOP_KEYS = new Set([
  'tool', 'mode', 'class', 'kind', 'claim', 'files', 'argv',
  'expect', 'expect_by_major', 'known', 'teeth_got',
]);
const FILE_OBJ_KEYS = new Set(['src', 'dir', 'name']);
const EXPECT_KEYS = new Set(['verdict', 'text', 'forbid']);
const MATCHER_KEYS = new Set(['stream', 'all']);
const RESERVED_PH = new Set(['node', 'node_ver', 'out']);

const SCRUB_ENV_KEYS = [
  'NODE',
  'NODE_OPTIONS',
  'NODE_V8_COVERAGE',
  'NODE_COMPILE_CACHE',
  'NODE_REDIRECT_WARNINGS',
  'NODE_NO_WARNINGS',
  'BASH_ENV',
  'ENV',
  'SHELLOPTS',
  'BASHOPTS',
  'CDPATH',
  'POSIXLY_CORRECT',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_CEILING_DIRECTORIES',
  'GIT_EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'EDITOR',
  'VISUAL',
];

const KNOWN_FLAGS = [
  '--node', '--tool', '--kind', '--only', '--repeat', '--cap',
  '--keep', '--json', '--strict-known', '--list', '--explain',
  '-v', '--verbose', '--self-test', '-h', '--help',
];

const SELF_TEST_ROWS = [
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7',
  'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14',
];

const DEFAULT_CAP_SEC = 120;
// Self-test internal caps (ms): rows NOT meant to time out get a generous cap (a cold fork under a
// loaded host is not a verdict); only the hang sub-cases (S8, S9/S10 TIMEOUT) use the short one.
const SELF_TEST_RUN_CAP_MS = 5000;
const SELF_TEST_HANG_CAP_MS = 300;
const CLOSE_FALLBACK_MS = 500;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

let activeChild = null;
let activeCleanup = null;

function killGroup(child) {
  if (child && child.pid > 1) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (e) {
      if (e && e.code === 'ESRCH') {
        try { child.kill('SIGKILL'); } catch {}
      }
    }
  }
}

function handleSignal(sig) {
  if (activeChild) {
    killGroup(activeChild);
    activeChild = null;
  }
  if (activeCleanup) {
    const fn = activeCleanup;
    activeCleanup = null;
    try { fn(); } catch {}
  }
  process.stderr.write(`mocks/run.mjs: interrupted (${sig})\n`);
  process.exit(2);
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

function usage() {
  return [
    'mocks/run.mjs -- Known-answer corpus runner for @zakkster/lite-utils (repo-only)',
    '',
    'Usage:',
    '  node mocks/run.mjs [options]',
    '  node mocks/run.mjs --list [--tool LIST] [--kind LIST] [--only SUBSTR]',
    '  node mocks/run.mjs --explain <tool>/<case> [--node ABS]',
    '  node mocks/run.mjs --self-test [ROW] [--node ABS]',
    '  node mocks/run.mjs -h | --help',
    '',
    'Options:',
    '  --node ABS        absolute path to node binary (default: current node)',
    '  --tool LIST       comma-separated tool dir names (e.g. shape-diff,ic-diff)',
    '  --kind LIST       comma-separated kinds (change,same,aa,limit,guard,teeth)',
    '  --only SUBSTR     substring filter on <tool>/<case> (AND with --tool/--kind)',
    '  --repeat K        run each selected case K times, integer 1..20 (default: 1)',
    '  --cap SEC         per-case timeout in seconds, integer 1..3600 (default: 120)',
    '  --keep DIR        retain staging dirs + tool-output.txt outside the repo',
    '  --json PATH       write run results JSON outside the repo (includes v8 version)',
    '  --strict-known    exit 1 on any KNOWN-MATCH (used by /release)',
    '  --list            validate selected cases and print catalog table (0 spawns)',
    '  --explain ID      show claim, diff, standalone command, and run one case',
    '  -v, --verbose     print matched evidence line under each OK / LIMIT row',
    '  --self-test [ROW] run deterministic fake-tool self-test (S1-S14, < 3 s)',
    '  -h, --help        this text (exit 2)',
    '',
    'Exit codes:',
    '  0  all selected cases as expected (OK / LIMIT / TEETH-OK / KNOWN; KNOWN-MATCH unless --strict-known)',
    '  1  any MISMATCH / TIMEOUT / SPAWN-ERROR / SIGNAL / RCn / INCONSISTENT / TEETH-FAILED / strict KNOWN-MATCH',
    '  2  runner / CLI / schema error, -h / --help, or SIGINT / SIGTERM',
    '',
  ].join('\n');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function editDist(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function didYouMean(flag) {
  let best = null;
  let bestD = 3;
  for (const cand of KNOWN_FLAGS) {
    const d = editDist(flag, cand);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return best ? ` (did you mean ${best}?)` : '';
}

function stripTrailingSlashes(p) {
  let s = p;
  while (s.length > 1) {
    if (s.endsWith('/.')) s = s.slice(0, -2) || '/';
    else if (s.endsWith('/')) s = s.slice(0, -1) || '/';
    else break;
  }
  return s;
}

function guardOutsideRepo(rawPath, flagName, repoReal, kind) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new Error(`${flagName}: path must not be empty`);
  }
  if (/[\0\r\n]/.test(rawPath)) {
    throw new Error(`${flagName}: control characters not allowed in path`);
  }
  const trimmed = stripTrailingSlashes(rawPath);
  const abs = path.resolve(trimmed);

  // Refuse a symlink at the target path itself (after trailing slash / /. strip).
  let selfLstat = null;
  try {
    selfLstat = fs.lstatSync(abs);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') {
      throw new Error(`${flagName}: cannot stat ${abs}: ${e ? e.message : 'error'}`);
    }
  }
  if (selfLstat && selfLstat.isSymbolicLink()) {
    throw new Error(`${flagName}: symlink refused (${rawPath})`);
  }

  // Resolve the nearest existing ancestor via realpath and reconstruct the full real target.
  const tail = [];
  let cur = abs;
  while (true) {
    try {
      fs.lstatSync(cur);
      break;
    } catch (e) {
      if (!e || e.code !== 'ENOENT') {
        throw new Error(`${flagName}: cannot inspect ancestor ${cur}: ${e ? e.message : 'error'}`);
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  }
  const realAnc = fs.realpathSync(cur);
  const resolved = tail.length ? path.join(realAnc, ...tail) : realAnc;

  if (resolved === repoReal || resolved.startsWith(repoReal + path.sep)) {
    throw new Error(`${flagName}: must resolve outside repository (${repoReal}), got ${resolved}`);
  }

  if (kind === 'keep') {
    if (selfLstat && !selfLstat.isDirectory()) {
      throw new Error(`${flagName}: exists and is not a directory (${abs})`);
    }
  } else if (kind === 'json') {
    if (selfLstat && selfLstat.isDirectory()) {
      throw new Error(`${flagName}: path is a directory (${abs})`);
    }
    const parent = path.dirname(abs);
    let pStat;
    try {
      pStat = fs.statSync(parent);
    } catch {
      throw new Error(`${flagName}: parent directory does not exist (${parent})`);
    }
    if (!pStat.isDirectory()) {
      throw new Error(`${flagName}: parent is not a directory (${parent})`);
    }
    try {
      fs.accessSync(parent, fs.constants.W_OK);
    } catch {
      throw new Error(`${flagName}: parent directory is not writable (${parent})`);
    }
  }
  return resolved;
}

function buildScrubbedEnv(tmpDir, baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const k of SCRUB_ENV_KEYS) {
    env[k] = undefined;
  }
  for (const k of Object.keys(env)) {
    if (k.startsWith('BASH_FUNC_')) env[k] = undefined;
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.TMPDIR = tmpDir;
  return env;
}

function parsePositiveInt(val, flagName, min, max) {
  if (!/^[0-9]+$/.test(val)) {
    throw new Error(`${flagName}: must be an integer in ${min}..${max}, got ${JSON.stringify(val)}`);
  }
  const n = Number(val);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${flagName}: must be an integer in ${min}..${max}, got ${val}`);
  }
  return n;
}

function parseCsvAllowlist(val, flagName, allowSet) {
  if (!val) throw new Error(`${flagName}: must not be empty`);
  const parts = val.split(',');
  const out = new Set();
  for (const p of parts) {
    if (!p || !allowSet.has(p)) {
      throw new Error(`${flagName}: unknown value ${JSON.stringify(p)} (allowed: ${[...allowSet].join(', ')})`);
    }
    out.add(p);
  }
  return out;
}

function parseCli(argv) {
  const opts = {
    node: null,
    tools: null,
    kinds: null,
    only: null,
    repeat: 1,
    cap: DEFAULT_CAP_SEC,
    keep: null,
    json: null,
    strictKnown: false,
    list: false,
    explain: null,
    verbose: false,
    selfTest: false,
    selfTestRow: null,
    help: false,
  };
  const seen = new Set();
  function mark(name) {
    if (seen.has(name)) throw new Error(`duplicate flag: ${name}`);
    seen.add(name);
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      return opts;
    }
    if (arg === '-v' || arg === '--verbose') {
      mark('--verbose');
      opts.verbose = true;
      continue;
    }
    if (arg === '--strict-known') {
      mark('--strict-known');
      opts.strictKnown = true;
      continue;
    }
    if (arg === '--list') {
      mark('--list');
      opts.list = true;
      continue;
    }
    if (arg === '--self-test' || arg.startsWith('--self-test=')) {
      mark('--self-test');
      opts.selfTest = true;
      if (arg.startsWith('--self-test=')) {
        const row = arg.slice('--self-test='.length);
        if (!row) throw new Error('--self-test: row name must not be empty');
        opts.selfTestRow = row;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        opts.selfTestRow = argv[++i];
      }
      continue;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq >= 0 ? arg.slice(0, eq) : arg;
      let val;
      if (['--node', '--tool', '--kind', '--only', '--repeat', '--cap', '--keep', '--json', '--explain'].includes(name)) {
        mark(name);
        if (eq >= 0) {
          val = arg.slice(eq + 1);
        } else {
          if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${name}: missing value`);
          val = argv[++i];
        }
        if (val === '') throw new Error(`${name}: value must not be empty`);
        if (name === '--node') opts.node = val;
        else if (name === '--tool') opts.tools = parseCsvAllowlist(val, '--tool', WANT_TOOL_DIRS);
        else if (name === '--kind') opts.kinds = parseCsvAllowlist(val, '--kind', KINDS);
        else if (name === '--only') opts.only = val;
        else if (name === '--repeat') opts.repeat = parsePositiveInt(val, '--repeat', 1, 20);
        else if (name === '--cap') opts.cap = parsePositiveInt(val, '--cap', 1, 3600);
        else if (name === '--keep') opts.keep = val;
        else if (name === '--json') opts.json = val;
        else if (name === '--explain') opts.explain = val;
        continue;
      }
      throw new Error(`unknown option: ${name}${didYouMean(name)}`);
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}${didYouMean(arg)}`);
    }
    throw new Error(`unexpected positional argument: ${arg}`);
  }

  if (opts.selfTest) {
    for (const f of seen) {
      if (f !== '--self-test' && f !== '--node') {
        throw new Error(`--self-test takes only --node, got ${f}`);
      }
    }
    if (opts.selfTestRow !== null && !SELF_TEST_ROWS.includes(opts.selfTestRow)) {
      throw new Error(`--self-test: unknown row ${JSON.stringify(opts.selfTestRow)} (allowed: ${SELF_TEST_ROWS.join(', ')})`);
    }
  }
  if (opts.list && opts.explain !== null) {
    throw new Error('--list and --explain cannot be combined');
  }
  if (opts.explain !== null && (opts.tools || opts.kinds || opts.only)) {
    throw new Error('--explain cannot be combined with --tool, --kind, or --only');
  }
  return opts;
}

function probeNodeBinary(rawNode) {
  const target = rawNode === null ? process.execPath : rawNode;
  if (!path.isAbsolute(target)) {
    throw new Error(`--node: must be an absolute path, got ${JSON.stringify(target)}`);
  }
  if (/[\0\r\n]/.test(target)) {
    throw new Error('--node: control characters not allowed');
  }
  let realNode;
  try {
    realNode = fs.realpathSync(target);
  } catch (e) {
    throw new Error(`--node: cannot resolve ${target}: ${e ? e.message : 'error'}`);
  }
  if (/[=\r\n\0]/.test(realNode)) {
    throw new Error(`--node: disallowed character in resolved path (${realNode})`);
  }
  const st = fs.statSync(realNode);
  if (!st.isFile()) {
    throw new Error(`--node: not a regular file (${realNode})`);
  }
  try {
    fs.accessSync(realNode, fs.constants.X_OK);
  } catch {
    throw new Error(`--node: not executable (${realNode})`);
  }
  const env = buildScrubbedEnv(os.tmpdir());
  const vr = spawnSync(realNode, ['--version'], {
    encoding: 'utf8',
    timeout: 10000,
    killSignal: 'SIGKILL',
    env,
  });
  if (vr.error || vr.status !== 0) {
    throw new Error(`--node: cannot run ${realNode} --version`);
  }
  const nodeVer = (vr.stdout || '').trim();
  const m = nodeVer.match(/^v([0-9]+)\.[0-9]+\.[0-9]+/);
  if (!m) {
    throw new Error(`--node: unparseable version ${JSON.stringify(nodeVer)} from ${realNode}`);
  }
  const v8r = spawnSync(realNode, ['-p', 'process.versions.v8'], {
    encoding: 'utf8',
    timeout: 10000,
    killSignal: 'SIGKILL',
    env,
  });
  const v8Ver = (v8r.status === 0 && !v8r.error) ? (v8r.stdout || '').trim() : 'unknown';
  return { nodeAbs: realNode, nodeVer, major: m[1], v8Ver };
}

function checkRelativePath(val, where, singleSegment) {
  if (typeof val !== 'string' || val.length === 0) {
    throw new Error(`${where}: must be a non-empty relative path`);
  }
  if (/[\0\r\n\\]/.test(val)) {
    throw new Error(`${where}: disallowed character in path ${JSON.stringify(val)}`);
  }
  if (val.startsWith('/')) {
    throw new Error(`${where}: absolute path refused (${val})`);
  }
  const segs = val.split('/');
  for (const s of segs) {
    if (s === '' || s === '.' || s === '..') {
      throw new Error(`${where}: invalid path segment in ${JSON.stringify(val)}`);
    }
  }
  if (singleSegment && segs.length !== 1) {
    throw new Error(`${where}: must be a single file name, got ${JSON.stringify(val)}`);
  }
}

function normalizeMatchers(rawText, verdict, kind, where) {
  const needsText = kind === 'change' || kind === 'guard' || kind === 'limit' || kind === 'aa' || verdict === 'NO-VERDICT';
  if (rawText === undefined) {
    if (needsText) {
      throw new Error(`${where}: expect.text is required for kind=${kind} verdict=${verdict}`);
    }
    return [];
  }
  if (!Array.isArray(rawText) || rawText.length === 0) {
    throw new Error(`${where}: expect.text must be a non-empty array`);
  }
  const allowStderr = verdict === 'NO-VERDICT' || kind === 'guard';
  // Shorthand flat array of non-empty strings -> one stdout matcher
  if (rawText.every((x) => typeof x === 'string')) {
    if (rawText.some((x) => x.length === 0)) {
      throw new Error(`${where}: expect.text contains an empty string`);
    }
    return [{ stream: 'stdout', all: rawText.slice() }];
  }
  const out = [];
  for (let i = 0; i < rawText.length; i++) {
    const item = rawText[i];
    const iw = `${where}.text[${i}]`;
    if (Array.isArray(item)) {
      if (item.length === 0 || item.some((s) => typeof s !== 'string' || s.length === 0)) {
        throw new Error(`${iw}: must be a non-empty array of non-empty strings`);
      }
      out.push({ stream: 'stdout', all: item.slice() });
    } else if (isPlainObject(item)) {
      for (const k of Object.keys(item)) {
        if (!MATCHER_KEYS.has(k)) throw new Error(`${iw}: unknown key ${JSON.stringify(k)}`);
      }
      if (item.stream !== 'stdout' && item.stream !== 'stderr') {
        throw new Error(`${iw}: stream must be "stdout" or "stderr"`);
      }
      if (item.stream === 'stderr' && !allowStderr) {
        throw new Error(`${iw}: stream "stderr" is forbidden on kind=${kind} verdict=${verdict}`);
      }
      if (!Array.isArray(item.all) || item.all.length === 0 || item.all.some((s) => typeof s !== 'string' || s.length === 0)) {
        throw new Error(`${iw}: all must be a non-empty array of non-empty strings`);
      }
      out.push({ stream: item.stream, all: item.all.slice() });
    } else {
      throw new Error(`${iw}: invalid matcher entry`);
    }
  }
  return out;
}

function validateExpectObj(rawExp, mode, kind, where) {
  if (!isPlainObject(rawExp)) {
    throw new Error(`${where}: must be an object`);
  }
  for (const k of Object.keys(rawExp)) {
    if (!EXPECT_KEYS.has(k)) {
      throw new Error(`${where}: unknown key ${JSON.stringify(k)}`);
    }
  }
  const validWords = MODES[mode];
  if (typeof rawExp.verdict !== 'string' || !validWords.includes(rawExp.verdict)) {
    throw new Error(`${where}: invalid verdict ${JSON.stringify(rawExp.verdict)} for mode ${mode} (allowed: ${validWords.join(', ')})`);
  }
  const matchers = normalizeMatchers(rawExp.text, rawExp.verdict, kind, where);
  let forbid = [];
  if (rawExp.forbid !== undefined) {
    if (!Array.isArray(rawExp.forbid) || rawExp.forbid.some((s) => typeof s !== 'string' || s.length === 0)) {
      throw new Error(`${where}: forbid must be an array of non-empty strings`);
    }
    forbid = rawExp.forbid.slice();
  }
  return { verdict: rawExp.verdict, matchers, forbid };
}

function validateCase(raw, caseDir, id, toolMap = WANT_TOOLS) {
  if (!isPlainObject(raw)) {
    throw new Error(`${id}: case.json must be a JSON object`);
  }
  for (const k of Object.keys(raw)) {
    if (!TOP_KEYS.has(k)) {
      throw new Error(`${id}: unknown key in case.json: ${JSON.stringify(k)}`);
    }
  }
  if (typeof raw.tool !== 'string' || !toolMap.has(raw.tool)) {
    throw new Error(`${id}: unknown tool ${JSON.stringify(raw.tool)}`);
  }
  const toolSpec = toolMap.get(raw.tool);
  const mode = raw.mode === undefined ? 'diff' : raw.mode;
  if (typeof mode !== 'string' || !Object.hasOwn(MODES, mode) || !toolSpec.modes.includes(mode)) {
    throw new Error(`${id}: invalid mode ${JSON.stringify(mode)} for tool ${raw.tool}`);
  }
  if (typeof raw.class !== 'string' || raw.class.trim().length === 0) {
    throw new Error(`${id}: class must be a non-empty string`);
  }
  if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) {
    throw new Error(`${id}: invalid kind ${JSON.stringify(raw.kind)}`);
  }
  if (typeof raw.claim !== 'string' || raw.claim.trim().length === 0) {
    throw new Error(`${id}: claim must be a non-empty string`);
  }

  let known = null;
  if (raw.known !== undefined && raw.known !== null) {
    if (typeof raw.known !== 'string' || raw.known.trim().length === 0) {
      throw new Error(`${id}: known must be a non-empty string or null`);
    }
    if (raw.kind === 'teeth') {
      throw new Error(`${id}: known is forbidden on kind="teeth"`);
    }
    known = raw.known;
  }

  let teethGot = null;
  if (raw.kind === 'teeth') {
    if (typeof raw.teeth_got !== 'string' || !MODES[mode].includes(raw.teeth_got)) {
      throw new Error(`${id}: teeth_got must be a valid verdict in ${MODES[mode].join(', ')}`);
    }
    teethGot = raw.teeth_got;
  } else if (raw.teeth_got !== undefined) {
    throw new Error(`${id}: teeth_got is only allowed on kind="teeth"`);
  }

  if (!isPlainObject(raw.files) || Object.keys(raw.files).length === 0) {
    throw new Error(`${id}: files must be a non-empty object`);
  }
  const files = {};
  const caseReal = fs.realpathSync(caseDir);
  for (const [ph, spec] of Object.entries(raw.files)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ph) || RESERVED_PH.has(ph)) {
      throw new Error(`${id}: invalid file placeholder ${JSON.stringify(ph)}`);
    }
    let src;
    let dir = ph;
    let name = 'driver.mjs';
    if (typeof spec === 'string') {
      src = spec;
    } else if (isPlainObject(spec)) {
      for (const k of Object.keys(spec)) {
        if (!FILE_OBJ_KEYS.has(k)) {
          throw new Error(`${id}: files.${ph} unknown key ${JSON.stringify(k)}`);
        }
      }
      src = spec.src;
      if (spec.dir !== undefined) dir = spec.dir;
      if (spec.name !== undefined) name = spec.name;
    } else {
      throw new Error(`${id}: files.${ph} must be a string or object`);
    }
    checkRelativePath(src, `${id}: files.${ph}.src`, false);
    checkRelativePath(dir, `${id}: files.${ph}.dir`, false);
    checkRelativePath(name, `${id}: files.${ph}.name`, true);
    const srcAbs = path.join(caseDir, src);
    let st;
    try {
      st = fs.lstatSync(srcAbs);
    } catch {
      throw new Error(`${id}: files.${ph}.src does not exist (${src})`);
    }
    if (st.isSymbolicLink() || !st.isFile()) {
      throw new Error(`${id}: files.${ph}.src must be a regular non-symlink file (${src})`);
    }
    const srcReal = fs.realpathSync(srcAbs);
    if (!srcReal.startsWith(caseReal + path.sep)) {
      throw new Error(`${id}: files.${ph}.src escapes case directory (${src})`);
    }
    files[ph] = { src, srcAbs, dir, name };
  }

  if (!Array.isArray(raw.argv) || raw.argv.length === 0 || raw.argv.some((x) => typeof x !== 'string')) {
    throw new Error(`${id}: argv must be a non-empty array of strings`);
  }
  const availPh = new Set([...RESERVED_PH, ...Object.keys(files)]);
  for (const arg of raw.argv) {
    for (const m of arg.matchAll(/\{([^}]*)\}/g)) {
      if (!availPh.has(m[1])) {
        throw new Error(`${id}: unfilled placeholder {${m[1]}} in argv`);
      }
    }
  }

  const expect = validateExpectObj(raw.expect, mode, raw.kind, `${id}: expect`);
  const expectByMajor = {};
  if (raw.expect_by_major !== undefined) {
    if (!isPlainObject(raw.expect_by_major)) {
      throw new Error(`${id}: expect_by_major must be an object`);
    }
    for (const [maj, majExp] of Object.entries(raw.expect_by_major)) {
      if (!/^[0-9]+$/.test(maj)) {
        throw new Error(`${id}: expect_by_major key must be digits only, got ${JSON.stringify(maj)}`);
      }
      expectByMajor[maj] = validateExpectObj(majExp, mode, raw.kind, `${id}: expect_by_major.${maj}`);
    }
  }

  if (raw.kind === 'teeth') {
    if (teethGot === expect.verdict) {
      throw new Error(`${id}: teeth_got (${teethGot}) must differ from expect.verdict (${expect.verdict})`);
    }
    for (const [maj, majExp] of Object.entries(expectByMajor)) {
      if (teethGot === majExp.verdict) {
        throw new Error(`${id}: teeth_got (${teethGot}) must differ from expect_by_major.${maj}.verdict`);
      }
    }
  }

  return {
    id,
    dir: caseDir,
    tool: raw.tool,
    toolDir: toolSpec.dir,
    isMjs: toolSpec.isMjs,
    mode,
    className: raw.class,
    kind: raw.kind,
    claim: raw.claim,
    files,
    argv: raw.argv.slice(),
    expect,
    expectByMajor,
    known,
    teethGot,
  };
}

function discoverCases(casesRoot, toolFilter, kindFilter, onlySubstr, toolMap = WANT_TOOLS) {
  const allowedDirs = new Set([...toolMap.values()].map((t) => t.dir));
  const out = [];
  let topEntries;
  try {
    topEntries = fs.readdirSync(casesRoot, { withFileTypes: true });
  } catch (e) {
    throw new Error(`cannot read cases directory ${casesRoot}: ${e ? e.message : 'error'}`);
  }
  topEntries.sort((a, b) => a.name.localeCompare(b.name));

  for (const te of topEntries) {
    if (!te.isDirectory()) continue;
    if (!allowedDirs.has(te.name)) {
      throw new Error(`unknown tool directory under mocks/: ${te.name}`);
    }
    if (toolFilter && !toolFilter.has(te.name)) continue;
    const toolPath = path.join(casesRoot, te.name);
    const caseEntries = fs.readdirSync(toolPath, { withFileTypes: true });
    caseEntries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ce of caseEntries) {
      if (!ce.isDirectory()) continue;
      const caseDir = path.join(toolPath, ce.name);
      const id = `${te.name}/${ce.name}`;
      const jsonPath = path.join(caseDir, 'case.json');
      let text;
      try {
        const st = fs.lstatSync(jsonPath);
        if (st.isSymbolicLink() || !st.isFile()) {
          throw new Error('case.json must be a regular non-symlink file');
        }
        text = fs.readFileSync(jsonPath, 'utf8');
      } catch (e) {
        throw new Error(`${id}: missing or unreadable case.json (${e ? e.message : 'error'})`);
      }
      let raw;
      try {
        raw = JSON.parse(text);
      } catch (e) {
        throw new Error(`${id}: invalid JSON in case.json (${e ? e.message : 'error'})`);
      }
      const validated = validateCase(raw, caseDir, id, toolMap);
      if (validated.toolDir !== te.name) {
        throw new Error(`${id}: case sits in ${te.name}/ but tool is ${validated.tool}`);
      }
      if (kindFilter && !kindFilter.has(validated.kind)) continue;
      if (onlySubstr && !id.includes(onlySubstr)) continue;
      out.push(validated);
    }
  }
  return out;
}

function resolveExpect(c, major) {
  if (Object.hasOwn(c.expectByMajor, major)) {
    return c.expectByMajor[major];
  }
  return c.expect;
}

function spawnCapped(cmd, args, cwd, env, capMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stdout = '';
    let stderr = '';
    let outBytes = 0;
    let errBytes = 0;
    let exited = false;
    let exitedAt = 0;
    let closed = false;
    let settled = false;
    let timedOut = false;
    let spawnError = null;
    let exitCode = null;
    let exitSignal = null;
    let capTimer = null;
    let fallbackTimer = null;

    const child = spawn(cmd, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChild = child;

    function clearTimers() {
      if (capTimer !== null) { clearTimeout(capTimer); capTimer = null; }
      if (fallbackTimer !== null) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    }

    function finish() {
      if (settled) return;
      settled = true;
      clearTimers();
      if (activeChild === child) activeChild = null;
      resolve({
        stdout,
        stderr,
        status: exitCode,
        signal: exitSignal,
        timedOut,
        spawnError,
        ms: Date.now() - t0,
      });
    }

    function triggerKill() {
      timedOut = true;
      killGroup(child);
      fallbackTimer = setTimeout(() => {
        if (child.stdout) child.stdout.destroy();
        if (child.stderr) child.stderr.destroy();
        finish();
      }, CLOSE_FALLBACK_MS);
    }

    capTimer = setTimeout(() => {
      setImmediate(() => {
        if (closed || settled) return;
        if (exited) {
          const sinceExit = Date.now() - exitedAt;
          if (sinceExit < CLOSE_FALLBACK_MS) {
            capTimer = setTimeout(() => {
              setImmediate(() => {
                if (!closed && !settled) triggerKill();
              });
            }, CLOSE_FALLBACK_MS - sinceExit);
            return;
          }
        }
        triggerKill();
      });
    }, capMs);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (outBytes < MAX_OUTPUT_BYTES) {
          outBytes += chunk.length;
          stdout += chunk.toString('utf8');
        }
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (errBytes < MAX_OUTPUT_BYTES) {
          errBytes += chunk.length;
          stderr += chunk.toString('utf8');
        }
      });
    }

    child.on('error', (err) => {
      spawnError = err;
      finish();
    });
    child.on('exit', (code, signal) => {
      exited = true;
      exitedAt = Date.now();
      exitCode = code;
      exitSignal = signal;
    });
    child.on('close', (code, signal) => {
      closed = true;
      if (!exited) {
        exitCode = code;
        exitSignal = signal;
      }
      finish();
    });
  });
}

function decodeVerdict(c, res, capMs) {
  if (res.timedOut) {
    const label = capMs >= 1000 && capMs % 1000 === 0 ? `${capMs / 1000}s` : `${capMs}ms`;
    return { got: `TIMEOUT(${label})`, fatal: true, consistent: true, reason: `timed out after ${label}` };
  }
  if (res.spawnError) {
    const code = res.spawnError.code || 'ERR';
    return { got: `SPAWN-ERROR(${code})`, fatal: true, consistent: true, reason: res.spawnError.message || code };
  }
  if (res.signal !== null) {
    return { got: `SIGNAL(${res.signal})`, fatal: true, consistent: true, reason: `killed by ${res.signal}` };
  }
  if (res.status === null || res.status < 0 || res.status > 2) {
    return { got: `RC${String(res.status)}`, fatal: true, consistent: true, reason: `unexpected exit ${String(res.status)}` };
  }

  const rcWord = MODES[c.mode][res.status];

  if (!c.isMjs) {
    const found = [];
    for (const line of res.stdout.split('\n')) {
      const m = line.match(/^VERDICT ([A-Z-]+)$/);
      if (m) found.push(m[1]);
    }
    if (res.status === 2) {
      for (const line of res.stderr.split('\n')) {
        const m = line.match(/^VERDICT ([A-Z-]+)$/);
        if (m) found.push(m[1]);
      }
    }
    if (found.length === 0) {
      return { got: rcWord, fatal: false, consistent: false, reason: 'missing VERDICT line' };
    }
    const uniq = new Set(found);
    if (uniq.size > 1) {
      return { got: rcWord, fatal: false, consistent: false, reason: `conflicting VERDICT lines (${[...uniq].join(', ')})` };
    }
    if (found[0] !== rcWord) {
      return { got: rcWord, fatal: false, consistent: false, reason: `VERDICT line "${found[0]}" != exit ${res.status} (${rcWord})` };
    }
    return { got: rcWord, fatal: false, consistent: true, reason: '' };
  }

  // alloc-per-op.mjs summary cross-check
  const re = c.mode === 'apogate'
    ? /^gate --max .+ \(peak B\/op\): (PASS|FAIL|NO VERDICT)(?: \(.*\))?$/
    : /^A\/B --tol .+ \(peak B\/op\): (SAME|DIFF|NO VERDICT)$/;
  const summaryWords = [];
  for (const line of res.stdout.split('\n')) {
    const m = line.match(re);
    if (m) summaryWords.push(m[1] === 'NO VERDICT' ? 'NO-VERDICT' : m[1]);
  }
  if (res.status === 0 || res.status === 1) {
    if (summaryWords.length === 0) {
      return { got: rcWord, fatal: false, consistent: false, reason: 'missing alloc-per-op summary line' };
    }
    const uniq = new Set(summaryWords);
    if (uniq.size > 1 || summaryWords[0] !== rcWord) {
      return { got: rcWord, fatal: false, consistent: false, reason: `summary "${summaryWords.join(',')}" != exit ${res.status} (${rcWord})` };
    }
    return { got: rcWord, fatal: false, consistent: true, reason: '' };
  }
  // status === 2: either a NO VERDICT summary on stdout (e.g. VOID / within-band)
  // or a refusal / preflight error on stderr carrying 'alloc-per-op:' (with no conflicting summary).
  if (summaryWords.length > 0) {
    if (summaryWords.some((w) => w !== 'NO-VERDICT')) {
      return { got: rcWord, fatal: false, consistent: false, reason: `exit 2 with non-NO-VERDICT summary (${summaryWords.join(',')})` };
    }
    return { got: rcWord, fatal: false, consistent: true, reason: '' };
  }
  if (res.stderr.trim().length === 0 || !res.stderr.includes('alloc-per-op:')) {
    return { got: rcWord, fatal: false, consistent: false, reason: 'exit 2 without alloc-per-op stderr message or NO VERDICT summary' };
  }
  return { got: rcWord, fatal: false, consistent: true, reason: '' };
}

function checkReasonAndForbid(resolvedExp, stdout, stderr) {
  const outLines = stdout.split('\n');
  const errLines = stderr.split('\n');
  const matched = [];
  const errors = [];

  for (const matcher of resolvedExp.matchers) {
    const lines = matcher.stream === 'stderr' ? errLines : outLines;
    const hit = lines.find((line) => matcher.all.every((tok) => line.includes(tok)));
    if (hit === undefined) {
      errors.push(`missing ${matcher.stream} line with ${JSON.stringify(matcher.all)}`);
    } else {
      matched.push(hit);
    }
  }
  for (const bad of resolvedExp.forbid) {
    const hit = outLines.find((l) => l.includes(bad)) ?? errLines.find((l) => l.includes(bad));
    if (hit !== undefined) {
      errors.push(`forbid matched ${JSON.stringify(bad)}`);
    }
  }
  return { ok: errors.length === 0, matched, errors };
}

function judgeCase(c, resolvedExp, decoded, textCheck, strictKnown) {
  if (c.kind === 'teeth') {
    const ok = !decoded.fatal && decoded.consistent && decoded.got === c.teethGot && decoded.got !== resolvedExp.verdict;
    return {
      status: ok ? 'TEETH-OK' : 'TEETH-FAILED',
      fail: !ok,
      detail: ok ? '' : (decoded.reason || `got ${decoded.got}, wanted teeth_got=${c.teethGot}`),
    };
  }
  if (c.known !== null) {
    if (decoded.fatal || !decoded.consistent) {
      return { status: 'MISMATCH', fail: true, detail: decoded.reason || decoded.got };
    }
    if (decoded.got === resolvedExp.verdict) {
      if (!textCheck.ok) {
        return { status: 'MISMATCH', fail: true, detail: textCheck.errors.join('; ') };
      }
      return {
        status: 'KNOWN-MATCH',
        fail: Boolean(strictKnown),
        detail: `known=${c.known} now matches`,
      };
    }
    return { status: 'KNOWN', fail: false, detail: `known=${c.known}` };
  }
  if (decoded.fatal) {
    return { status: decoded.got, fail: true, detail: decoded.reason };
  }
  if (!decoded.consistent) {
    return { status: 'INCONSISTENT', fail: true, detail: decoded.reason };
  }
  if (decoded.got === resolvedExp.verdict && textCheck.ok) {
    return { status: c.kind === 'limit' ? 'LIMIT' : 'OK', fail: false, detail: '' };
  }
  const detail = decoded.got !== resolvedExp.verdict
    ? `expect=${resolvedExp.verdict} got=${decoded.got}`
    : textCheck.errors.join('; ');
  return { status: 'MISMATCH', fail: true, detail };
}

async function runSingleInvocation(c, ctx) {
  const stageName = `${c.id.replace(/[\\/]/g, '__')}${ctx.repeatIdx > 0 ? `__r${ctx.repeatIdx}` : ''}`;
  const stage = path.join(ctx.workRoot, stageName);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const stageTmp = path.join(stage, 'tmp');
  fs.mkdirSync(stageTmp, { recursive: true });

  const subs = {
    node: ctx.nodeInfo.nodeAbs,
    node_ver: ctx.nodeInfo.nodeVer,
    out: path.join(stage, 'out'),
  };
  for (const [ph, fspec] of Object.entries(c.files)) {
    const destDir = path.join(stage, fspec.dir);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, fspec.name);
    fs.copyFileSync(fspec.srcAbs, destPath);
    subs[ph] = destPath;
  }

  const argv = c.argv.map((a) => a.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => subs[k]));
  const toolAbs = path.join(ctx.toolsDir, c.tool);
  const env = buildScrubbedEnv(stageTmp, ctx.baseEnv);
  const cmd = c.isMjs ? ctx.nodeInfo.nodeAbs : toolAbs;
  const args = c.isMjs ? [toolAbs, ...argv] : argv;

  const res = await spawnCapped(cmd, args, stage, env, ctx.capMs);
  if (ctx.keep) {
    const outText = res.stdout + (res.stderr ? `\n--- stderr ---\n${res.stderr}` : '');
    fs.writeFileSync(path.join(stage, 'tool-output.txt'), outText);
  }
  const resolvedExp = resolveExpect(c, ctx.nodeInfo.major);
  const decoded = decodeVerdict(c, res, ctx.capMs);
  const textCheck = checkReasonAndForbid(resolvedExp, res.stdout, res.stderr);
  const judged = judgeCase(c, resolvedExp, decoded, textCheck, ctx.strictKnown);
  return {
    resolvedExp,
    decoded,
    textCheck,
    judged,
    res,
    cmd,
    args,
    stage,
  };
}

async function runCaseWithRepeat(c, ctx) {
  let last = null;
  const seenSig = new Set();
  let totalMs = 0;
  for (let r = 0; r < ctx.repeat; r++) {
    const cur = await runSingleInvocation(c, { ...ctx, repeatIdx: r });
    totalMs += cur.res.ms;
    seenSig.add(`${cur.judged.status}|${cur.decoded.got}`);
    last = cur;
    if (cur.judged.fail) break;
  }
  if (ctx.repeat > 1 && !last.judged.fail && seenSig.size > 1) {
    return {
      ...last,
      judged: {
        status: 'MISMATCH',
        fail: true,
        detail: `flipped across ${ctx.repeat} repeats: ${[...seenSig].join(' vs ')}`,
      },
      totalMs,
    };
  }
  return { ...last, totalMs };
}

function formatSimpleDiff(aLabel, aText, bLabel, bText) {
  const aLines = aText.replace(/\n$/, '').split('\n');
  const bLines = bText.replace(/\n$/, '').split('\n');
  const out = [`--- ${aLabel}`, `+++ ${bLabel}`];
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    const al = aLines[i];
    const bl = bLines[i];
    if (al === bl) {
      out.push(`  ${al}`);
    } else {
      if (al !== undefined) out.push(`- ${al}`);
      if (bl !== undefined) out.push(`+ ${bl}`);
    }
  }
  return out.join('\n');
}

function printList(cases, major) {
  console.log(`cases: ${cases.length}`);
  for (const c of cases) {
    const exp = resolveExpect(c, major);
    const kn = c.known ? ` known=${c.known}` : '';
    console.log(`${c.id.padEnd(40)} ${c.kind.padEnd(7)} ${exp.verdict.padEnd(11)} [${c.className}]${kn} -- ${c.claim}`);
  }
}

async function runExplain(cases, explainId, ctx) {
  const c = cases.find((x) => x.id === explainId);
  if (!c) {
    throw new Error(`--explain: case not found: ${explainId}`);
  }
  const exp = resolveExpect(c, ctx.nodeInfo.major);
  console.log(`case:   ${c.id}`);
  console.log(`tool:   ${c.tool} (mode=${c.mode})`);
  console.log(`kind:   ${c.kind}`);
  console.log(`class:  ${c.className}`);
  console.log(`claim:  ${c.claim}`);
  console.log(`expect: ${exp.verdict}` + (c.known ? ` (known=${c.known})` : '') + (c.teethGot ? ` (teeth_got=${c.teethGot})` : ''));
  if (exp.matchers.length) {
    console.log(`text:   ${JSON.stringify(exp.matchers)}`);
  }
  if (exp.forbid.length) {
    console.log(`forbid: ${JSON.stringify(exp.forbid)}`);
  }
  const phs = Object.keys(c.files);
  if (c.files.before && c.files.after) {
    const bt = fs.readFileSync(c.files.before.srcAbs, 'utf8');
    const at = fs.readFileSync(c.files.after.srcAbs, 'utf8');
    console.log('\n--- files (before -> after) ---');
    console.log(formatSimpleDiff(c.files.before.src, bt, c.files.after.src, at));
    for (const ph of phs) {
      if (ph === 'before' || ph === 'after') continue;
      console.log(`\n--- file ${ph}: ${c.files[ph].src} ---`);
      console.log(fs.readFileSync(c.files[ph].srcAbs, 'utf8').trimEnd());
    }
  } else {
    for (const ph of phs) {
      console.log(`\n--- file ${ph}: ${c.files[ph].src} ---`);
      console.log(fs.readFileSync(c.files[ph].srcAbs, 'utf8').trimEnd());
    }
  }
  const cmdPreview = [
    c.isMjs ? ctx.nodeInfo.nodeAbs : `./${c.tool}`,
    ...(c.isMjs ? [`./${c.tool}`] : []),
    ...c.argv.map((a) => a
      .replace(/\{node\}/g, ctx.nodeInfo.nodeAbs)
      .replace(/\{node_ver\}/g, ctx.nodeInfo.nodeVer)
      .replace(/\{out\}/g, '/tmp/mocks-explain-out')
      .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => path.join('mocks', c.id, c.files[k].src))),
  ].join(' ');
  console.log(`\ncommand: ${cmdPreview}`);
  console.log('\n--- live output ---');
  const res = await runSingleInvocation(c, { ...ctx, repeatIdx: 0 });
  if (res.res.stdout) process.stdout.write(res.res.stdout);
  if (res.res.stderr) process.stdout.write(`--- stderr ---\n${res.res.stderr}`);
  const secs = (res.res.ms / 1000).toFixed(2);
  console.log(`\nresult: ${res.judged.status}  expect=${res.resolvedExp.verdict}  got=${res.decoded.got}  ${secs}s` + (res.judged.detail ? `  (${res.judged.detail})` : ''));
  return res.judged.fail ? 1 : 0;
}

// -----------------------------------------------------------------------------
// Deterministic fake-tool self-test (rows S1-S14, internal ms cap, 0 real V8)
// -----------------------------------------------------------------------------
async function runSelfTest(nodeInfo, onlyRow) {
  const stRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-mocks-st-'));
  const cleanup = () => { fs.rmSync(stRoot, { recursive: true, force: true }); };
  activeCleanup = cleanup;

  const toolsDir = path.join(stRoot, 'tools');
  const casesDir = path.join(stRoot, 'cases');
  const workDir = path.join(stRoot, 'work');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.mkdirSync(casesDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const fakeToolMap = new Map([
    ['shape-diff.sh', { dir: 'shape-diff', modes: ['diff'], isMjs: false }],
    ['alloc-per-op.mjs', { dir: 'alloc-per-op', modes: ['apogate', 'apoab'], isMjs: true }],
  ]);

  // Fake bash tool controlled by its first argument (mode keyword)
  const fakeSh = path.join(toolsDir, 'shape-diff.sh');
  fs.writeFileSync(fakeSh, [
    '#!/usr/bin/env bash',
    'cmd="$1"',
    'case "$cmd" in',
    '  diff_ok)',
    '    echo "mk: DIFF -- GEN Smi->Double"',
    '    echo "VERDICT DIFF"',
    '    exit 1 ;;',
    '  same_ok)',
    '    echo "mk: SAME -- evidence"',
    '    echo "VERDICT SAME"',
    '    exit 0 ;;',
    '  split_reason)',
    '    echo "mk: DIFF -- something"',
    '    echo "other: GEN Smi->Double"',
    '    echo "VERDICT DIFF"',
    '    exit 1 ;;',
    '  multi_ok)',
    '    echo "line1: alpha beta"',
    '    echo "line2: gamma delta"',
    '    echo "guard err: refused bad opt" >&2',
    '    echo "VERDICT NO-VERDICT" >&2',
    '    exit 2 ;;',
    '  forbid_hit)',
    '    echo "mk: DIFF -- GEN Smi->Double"',
    '    echo "unexpected warning: BADTOKEN"',
    '    echo "VERDICT DIFF"',
    '    exit 1 ;;',
    '  no_verdict_line)',
    '    echo "mk: DIFF -- GEN Smi->Double"',
    '    exit 1 ;;',
    '  mismatch_verdict)',
    '    echo "mk: DIFF -- GEN Smi->Double"',
    '    echo "VERDICT SAME"',
    '    exit 1 ;;',
    '  conflict_verdict)',
    '    echo "VERDICT SAME"',
    '    echo "VERDICT NO-VERDICT" >&2',
    '    exit 2 ;;',
    '  hang_grandchild)',
    '    gpid_file="$2"',
    '    sleep 10 &',
    '    gp=$!',
    '    printf "%s\\n" "$gp" > "$gpid_file"',
    '    wait "$gp"',
    '    echo "VERDICT SAME"',
    '    exit 0 ;;',
    '  rc3)',
    '    echo "boom" >&2',
    '    exit 3 ;;',
    '  env_probe)',
    '    printf "COV=%s\\n" "${NODE_V8_COVERAGE-<unset>}"',
    '    printf "BASH=%s\\n" "${BASH_ENV-<unset>}"',
    '    printf "NOPT=%s\\n" "${NODE_OPTIONS-<unset>}"',
    '    if env | grep -q "^SHELLOPTS="; then echo "SHOPT=SET"; else echo "SHOPT=<unset>"; fi',
    '    printf "GEDIT=%s\\n" "${GIT_EDITOR-<unset>}"',
    '    echo "VERDICT SAME"',
    '    exit 0 ;;',
    '  flip)',
    '    state="$2"',
    '    if [ -f "$state" ]; then',
    '      echo "mk: DIFF -- GEN"',
    '      echo "VERDICT DIFF"',
    '      exit 1',
    '    else',
    '      : > "$state"',
    '      echo "mk: SAME"',
    '      echo "VERDICT SAME"',
    '      exit 0',
    '    fi ;;',
    'esac',
    'echo "VERDICT NO-VERDICT" >&2',
    'exit 2',
    '',
  ].join('\n'));
  fs.chmodSync(fakeSh, 0o755);

  const fakeMjs = path.join(toolsDir, 'alloc-per-op.mjs');
  fs.writeFileSync(fakeMjs, [
    'const cmd = process.argv[2];',
    'if (cmd === "pass") {',
    '  console.log("f64  0.0000 B/op");',
    '  console.log("gate --max 1 (peak B/op): PASS");',
    '  process.exit(0);',
    '} else if (cmd === "wrong_summary") {',
    '  console.log("gate --max 1 (peak B/op): PASS");',
    '  process.exit(1);',
    '} else if (cmd === "rc2_empty") {',
    '  process.exit(2);',
    '} else if (cmd === "rc2_ok") {',
    '  console.error("alloc-per-op: NO VERDICT: lane returned value");',
    '  process.exit(2);',
    '} else if (cmd === "rc2_nv_summary") {',
    '  console.log("gate --max 1 (peak B/op): NO VERDICT (within band -0/+1: lane f64)");',
    '  process.exit(2);',
    '} else if (cmd === "rc2_pass_summary") {',
    '  console.log("gate --max 1 (peak B/op): PASS");',
    '  console.error("alloc-per-op: NO VERDICT: x");',
    '  process.exit(2);',
    '}',
    'process.exit(2);',
    '',
  ].join('\n'));

  function makeCase(toolDir, name, cfg, extraFiles = { 'driver.mjs': '// stub\n' }) {
    const dir = path.join(casesDir, toolDir, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [fn, content] of Object.entries(extraFiles)) {
      fs.writeFileSync(path.join(dir, fn), content);
    }
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(cfg, null, 2) + '\n');
    return validateCase(cfg, dir, `${toolDir}/${name}`, fakeToolMap);
  }

  function makeCtx(extra = {}) {
    return {
      toolsDir,
      workRoot: workDir,
      nodeInfo,
      capMs: SELF_TEST_RUN_CAP_MS,
      repeat: 1,
      keep: false,
      strictKnown: false,
      baseEnv: process.env,
      ...extra,
    };
  }

  function pollDead(pid, deadlineMs) {
    return new Promise((resolve) => {
      const end = Date.now() + deadlineMs;
      function check() {
        try {
          process.kill(pid, 0);
        } catch (e) {
          if (e && e.code === 'ESRCH') return resolve(true);
        }
        if (Date.now() >= end) return resolve(false);
        setTimeout(check, 20);
      }
      check();
    });
  }

  const rows = [
    ['S1', 'OK change case (exit 1 DIFF + single-line stdout text)', async () => {
      const c = makeCase('shape-diff', 's1', {
        tool: 'shape-diff.sh', class: 's1', kind: 'change', claim: 's1 claim',
        files: { a: 'driver.mjs' }, argv: ['diff_ok', '{a}'],
        expect: { verdict: 'DIFF', text: ['mk', 'GEN'] },
      });
      const r = await runCaseWithRepeat(c, makeCtx());
      if (r.judged.status !== 'OK' || r.judged.fail) throw new Error(`got ${r.judged.status}: ${r.judged.detail}`);
    }],
    ['S2', 'Wrong verdict (SAME when expecting DIFF)', async () => {
      const c = makeCase('shape-diff', 's2', {
        tool: 'shape-diff.sh', class: 's2', kind: 'change', claim: 's2 claim',
        files: { a: 'driver.mjs' }, argv: ['same_ok', '{a}'],
        expect: { verdict: 'DIFF', text: ['mk', 'GEN'] },
      });
      const r = await runCaseWithRepeat(c, makeCtx());
      if (r.judged.status !== 'MISMATCH' || !r.judged.fail) throw new Error(`expected MISMATCH, got ${r.judged.status}`);
    }],
    ['S3', 'DIFF for wrong reason (tokens split across 2 lines)', async () => {
      const c = makeCase('shape-diff', 's3', {
        tool: 'shape-diff.sh', class: 's3', kind: 'change', claim: 's3 claim',
        files: { a: 'driver.mjs' }, argv: ['split_reason', '{a}'],
        expect: { verdict: 'DIFF', text: ['mk', 'GEN'] },
      });
      const r = await runCaseWithRepeat(c, makeCtx());
      if (r.judged.status !== 'MISMATCH' || !r.judged.fail) throw new Error(`expected MISMATCH, got ${r.judged.status}`);
    }],
    ['S4', 'Multi-matcher text + guard stderr allowed + change stderr refused', async () => {
      const c = makeCase('shape-diff', 's4', {
        tool: 'shape-diff.sh', class: 's4', kind: 'guard', claim: 's4 claim',
        files: { a: 'driver.mjs' }, argv: ['multi_ok', '{a}'],
        expect: {
          verdict: 'NO-VERDICT',
          text: [
            ['alpha', 'beta'],
            ['gamma', 'delta'],
            { stream: 'stderr', all: ['guard err', 'refused'] },
          ],
        },
      });
      const r = await runCaseWithRepeat(c, makeCtx());
      if (r.judged.status !== 'OK' || r.judged.fail) throw new Error(`guard multi failed: ${r.judged.status} ${r.judged.detail}`);
      let rejected = false;
      try {
        validateCase({
          tool: 'shape-diff.sh', class: 's4b', kind: 'change', claim: 's4b',
          files: { a: 'driver.mjs' }, argv: ['diff_ok', '{a}'],
          expect: { verdict: 'DIFF', text: [{ stream: 'stderr', all: ['x'] }] },
        }, path.join(casesDir, 'shape-diff', 's4'), 'shape-diff/s4b', fakeToolMap);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('stderr matcher was NOT rejected on change DIFF case');
    }],
    ['S5', 'forbid substring hit -> MISMATCH', async () => {
      const c = makeCase('shape-diff', 's5', {
        tool: 'shape-diff.sh', class: 's5', kind: 'change', claim: 's5 claim',
        files: { a: 'driver.mjs' }, argv: ['forbid_hit', '{a}'],
        expect: { verdict: 'DIFF', text: ['mk', 'GEN'], forbid: ['BADTOKEN'] },
      });
      const r = await runCaseWithRepeat(c, makeCtx());
      if (r.judged.status !== 'MISMATCH' || !r.judged.fail) throw new Error(`expected MISMATCH, got ${r.judged.status}`);
    }],
    ['S6', 'Missing / mismatched / conflicting VERDICT line -> INCONSISTENT', async () => {
      for (const cmd of ['no_verdict_line', 'mismatch_verdict', 'conflict_verdict']) {
        const c = makeCase('shape-diff', `s6-${cmd}`, {
          tool: 'shape-diff.sh', class: 's6', kind: 'change', claim: 's6 claim',
          files: { a: 'driver.mjs' }, argv: [cmd, '{a}'],
          expect: { verdict: 'DIFF', text: ['mk'] },
        });
        const r = await runCaseWithRepeat(c, makeCtx());
        if (r.judged.status !== 'INCONSISTENT' || !r.judged.fail) {
          throw new Error(`${cmd}: expected INCONSISTENT, got ${r.judged.status}`);
        }
      }
    }],
    ['S7', 'alloc-per-op summary cross-check (PASS / wrong / rc2 empty / rc2 ok / rc2 NV summary / rc2 PASS summary)', async () => {
      const cPass = makeCase('alloc-per-op', 's7-pass', {
        tool: 'alloc-per-op.mjs', mode: 'apogate', class: 's7', kind: 'change', claim: 's7',
        files: { b: 'driver.mjs' }, argv: ['pass', '{b}'],
        expect: { verdict: 'PASS', text: ['f64'] },
      });
      const r1 = await runCaseWithRepeat(cPass, makeCtx());
      if (r1.judged.status !== 'OK' || r1.judged.fail) throw new Error(`pass failed: ${r1.judged.status}`);

      const cWrong = makeCase('alloc-per-op', 's7-wrong', {
        tool: 'alloc-per-op.mjs', mode: 'apogate', class: 's7', kind: 'change', claim: 's7',
        files: { b: 'driver.mjs' }, argv: ['wrong_summary', '{b}'],
        expect: { verdict: 'FAIL', text: ['PASS'] },
      });
      const r2 = await runCaseWithRepeat(cWrong, makeCtx());
      if (r2.judged.status !== 'INCONSISTENT' || !r2.judged.fail) throw new Error(`wrong_summary expected INCONSISTENT, got ${r2.judged.status}`);

      const cEmpty = makeCase('alloc-per-op', 's7-empty', {
        tool: 'alloc-per-op.mjs', mode: 'apogate', class: 's7', kind: 'guard', claim: 's7',
        files: { b: 'driver.mjs' }, argv: ['rc2_empty', '{b}'],
        expect: { verdict: 'NO-VERDICT', text: [{ stream: 'stderr', all: ['alloc-per-op:'] }] },
      });
      const r3 = await runCaseWithRepeat(cEmpty, makeCtx());
      if (r3.judged.status !== 'INCONSISTENT' || !r3.judged.fail) throw new Error(`rc2_empty expected INCONSISTENT, got ${r3.judged.status}`);

      const cOk2 = makeCase('alloc-per-op', 's7-ok2', {
        tool: 'alloc-per-op.mjs', mode: 'apogate', class: 's7', kind: 'guard', claim: 's7',
        files: { b: 'driver.mjs' }, argv: ['rc2_ok', '{b}'],
        expect: { verdict: 'NO-VERDICT', text: [{ stream: 'stderr', all: ['alloc-per-op:', 'NO VERDICT'] }] },
      });
      const r4 = await runCaseWithRepeat(cOk2, makeCtx());
      if (r4.judged.status !== 'OK' || r4.judged.fail) throw new Error(`rc2_ok failed: ${r4.judged.status}`);

      // R15: exit 2 + every summary NO VERDICT (stderr empty) -> OK
      const cNv = makeCase('alloc-per-op', 's7-nv-summary', {
        tool: 'alloc-per-op.mjs', mode: 'apogate', class: 's7', kind: 'guard', claim: 's7',
        files: { b: 'driver.mjs' }, argv: ['rc2_nv_summary', '{b}'],
        expect: { verdict: 'NO-VERDICT', text: [['within band']] },
      });
      const r5 = await runCaseWithRepeat(cNv, makeCtx());
      if (r5.judged.status !== 'OK' || r5.judged.fail) throw new Error(`rc2_nv_summary failed: ${r5.judged.status} ${r5.judged.detail}`);

      // R15: exit 2 + PASS summary (even with alloc-per-op: stderr) -> INCONSISTENT
      const cPass2 = makeCase('alloc-per-op', 's7-pass-summary', {
        tool: 'alloc-per-op.mjs', mode: 'apogate', class: 's7', kind: 'guard', claim: 's7',
        files: { b: 'driver.mjs' }, argv: ['rc2_pass_summary', '{b}'],
        expect: { verdict: 'NO-VERDICT', text: [{ stream: 'stderr', all: ['alloc-per-op:'] }] },
      });
      const r6 = await runCaseWithRepeat(cPass2, makeCtx());
      if (r6.judged.status !== 'INCONSISTENT' || !r6.judged.fail) throw new Error(`rc2_pass_summary expected INCONSISTENT, got ${r6.judged.status}`);
    }],
    ['S8', 'TIMEOUT with lingering grandchild reaped by group kill (poll ESRCH <= 2s)', async () => {
      const gpidFile = path.join(stRoot, 's8.gpid');
      let gpid = 0;
      try {
        const c = makeCase('shape-diff', 's8', {
          tool: 'shape-diff.sh', class: 's8', kind: 'same', claim: 's8',
          files: { a: 'driver.mjs' }, argv: ['hang_grandchild', gpidFile, '{a}'],
          expect: { verdict: 'SAME' },
        });
        const r = await runCaseWithRepeat(c, makeCtx({ capMs: SELF_TEST_HANG_CAP_MS }));
        if (!r.judged.status.startsWith('TIMEOUT(') || !r.judged.fail) {
          throw new Error(`expected TIMEOUT, got ${r.judged.status}`);
        }
        const rawPid = fs.existsSync(gpidFile) ? fs.readFileSync(gpidFile, 'utf8').trim() : '';
        gpid = Number(rawPid);
        if (!Number.isInteger(gpid) || gpid <= 1) {
          throw new Error(`grandchild pid file missing or invalid: ${JSON.stringify(rawPid)}`);
        }
        const dead = await pollDead(gpid, 2000);
        if (!dead) {
          throw new Error(`grandchild ${gpid} still alive after 2000 ms (group kill failed)`);
        }
      } finally {
        if (gpid > 1) {
          try { process.kill(gpid, 'SIGKILL'); } catch {}
        }
      }
    }],
    ['S9', 'known case: TIMEOUT/RC3 -> MISMATCH; match -> KNOWN-MATCH (strict fails)', async () => {
      const gpidFile = path.join(stRoot, 's9.gpid');
      let gpid = 0;
      try {
        const cTo = makeCase('shape-diff', 's9-to', {
          tool: 'shape-diff.sh', class: 's9', kind: 'change', claim: 's9', known: 'BUG-1',
          files: { a: 'driver.mjs' }, argv: ['hang_grandchild', gpidFile, '{a}'],
          expect: { verdict: 'DIFF', text: ['mk'] },
        });
        const rTo = await runCaseWithRepeat(cTo, makeCtx({ capMs: SELF_TEST_HANG_CAP_MS }));
        if (fs.existsSync(gpidFile)) gpid = Number(fs.readFileSync(gpidFile, 'utf8').trim()) || 0;
        if (rTo.judged.status !== 'MISMATCH' || !rTo.judged.fail) {
          throw new Error(`known+TIMEOUT expected MISMATCH, got ${rTo.judged.status}`);
        }
      } finally {
        if (gpid > 1) { try { process.kill(gpid, 'SIGKILL'); } catch {} }
      }
      const cRc3 = makeCase('shape-diff', 's9-rc3', {
        tool: 'shape-diff.sh', class: 's9', kind: 'change', claim: 's9', known: 'BUG-1',
        files: { a: 'driver.mjs' }, argv: ['rc3', '{a}'],
        expect: { verdict: 'DIFF', text: ['mk'] },
      });
      const rRc3 = await runCaseWithRepeat(cRc3, makeCtx());
      if (rRc3.judged.status !== 'MISMATCH' || !rRc3.judged.fail) {
        throw new Error(`known+RC3 expected MISMATCH, got ${rRc3.judged.status}`);
      }
      const cMatch = makeCase('shape-diff', 's9-match', {
        tool: 'shape-diff.sh', class: 's9', kind: 'change', claim: 's9', known: 'BUG-1',
        files: { a: 'driver.mjs' }, argv: ['diff_ok', '{a}'],
        expect: { verdict: 'DIFF', text: ['mk', 'GEN'] },
      });
      const rDefault = await runCaseWithRepeat(cMatch, makeCtx({ strictKnown: false }));
      if (rDefault.judged.status !== 'KNOWN-MATCH' || rDefault.judged.fail) {
        throw new Error(`known match default: got ${rDefault.judged.status} fail=${rDefault.judged.fail}`);
      }
      const rStrict = await runCaseWithRepeat(cMatch, makeCtx({ strictKnown: true }));
      if (rStrict.judged.status !== 'KNOWN-MATCH' || !rStrict.judged.fail) {
        throw new Error(`known match strict: got ${rStrict.judged.status} fail=${rStrict.judged.fail}`);
      }
    }],
    ['S10', 'teeth case: teeth_got -> TEETH-OK; TIMEOUT / wrong verdict -> TEETH-FAILED', async () => {
      const cOk = makeCase('shape-diff', 's10-ok', {
        tool: 'shape-diff.sh', class: 's10', kind: 'teeth', claim: 's10', teeth_got: 'DIFF',
        files: { a: 'driver.mjs' }, argv: ['diff_ok', '{a}'],
        expect: { verdict: 'SAME' },
      });
      const rOk = await runCaseWithRepeat(cOk, makeCtx());
      if (rOk.judged.status !== 'TEETH-OK' || rOk.judged.fail) throw new Error(`teeth ok failed: ${rOk.judged.status}`);

      const gpidFile = path.join(stRoot, 's10.gpid');
      let gpid = 0;
      try {
        const cTo = makeCase('shape-diff', 's10-to', {
          tool: 'shape-diff.sh', class: 's10', kind: 'teeth', claim: 's10', teeth_got: 'DIFF',
          files: { a: 'driver.mjs' }, argv: ['hang_grandchild', gpidFile, '{a}'],
          expect: { verdict: 'SAME' },
        });
        const rTo = await runCaseWithRepeat(cTo, makeCtx({ capMs: SELF_TEST_HANG_CAP_MS }));
        if (fs.existsSync(gpidFile)) gpid = Number(fs.readFileSync(gpidFile, 'utf8').trim()) || 0;
        if (rTo.judged.status !== 'TEETH-FAILED' || !rTo.judged.fail) {
          throw new Error(`teeth+TIMEOUT expected TEETH-FAILED, got ${rTo.judged.status}`);
        }
      } finally {
        if (gpid > 1) { try { process.kill(gpid, 'SIGKILL'); } catch {} }
      }
      const cSame = makeCase('shape-diff', 's10-same', {
        tool: 'shape-diff.sh', class: 's10', kind: 'teeth', claim: 's10', teeth_got: 'DIFF',
        files: { a: 'driver.mjs' }, argv: ['same_ok', '{a}'],
        expect: { verdict: 'SAME' },
      });
      const rSame = await runCaseWithRepeat(cSame, makeCtx());
      if (rSame.judged.status !== 'TEETH-FAILED' || !rSame.judged.fail) {
        throw new Error(`teeth+SAME expected TEETH-FAILED, got ${rSame.judged.status}`);
      }
    }],
    ['S11', 'Schema refusals + missing case.json + zero selected cases -> exit 2', async () => {
      const stubDir = path.join(casesDir, 'shape-diff', 's11-stub');
      fs.mkdirSync(stubDir, { recursive: true });
      fs.writeFileSync(path.join(stubDir, 'driver.mjs'), '// s11\n');
      const base = {
        tool: 'shape-diff.sh', class: 's11', kind: 'same', claim: 's11',
        files: { a: 'driver.mjs' }, argv: ['same_ok', '{a}'],
        expect: { verdict: 'SAME' },
      };
      const badCases = [
        ['unknown key', { ...base, bogus: 1 }],
        ['unfilled placeholder', { ...base, argv: ['same_ok', '{typo}'] }],
        ['dotdot file', { ...base, files: { a: '../driver.mjs' } }],
        ['non-digit expect_by_major', { ...base, expect_by_major: { v22: { verdict: 'SAME' } } }],
        ['invalid verdict word', { ...base, expect: { verdict: 'BOGUS' } }],
      ];
      for (const [label, obj] of badCases) {
        let threw = false;
        try { validateCase(obj, stubDir, 'shape-diff/s11', fakeToolMap); } catch { threw = true; }
        if (!threw) throw new Error(`schema did not refuse: ${label}`);
      }
      // Dir without case.json -> discoverCases throws
      const badRoot = path.join(stRoot, 'bad-cases');
      fs.mkdirSync(path.join(badRoot, 'shape-diff', 'missing-json'), { recursive: true });
      let threwMissing = false;
      try { discoverCases(badRoot, null, null, null, fakeToolMap); } catch { threwMissing = true; }
      if (!threwMissing) throw new Error('missing case.json not refused');

      // Zero selected cases -> CLI exits 2
      const emptyRoot = path.join(stRoot, 'empty-cases');
      fs.mkdirSync(emptyRoot, { recursive: true });
      const found = discoverCases(emptyRoot, null, null, null, fakeToolMap);
      if (found.length !== 0) throw new Error('expected 0 cases in empty root');
      const zeroR = spawnSync(nodeInfo.nodeAbs, [SELF_FILE, '--only', '__never_matches_anything_xyz__'], {
        encoding: 'utf8',
        timeout: 10000,
        killSignal: 'SIGKILL',
        env: buildScrubbedEnv(stRoot),
      });
      if (zeroR.status !== 2) throw new Error(`zero selected cases expected exit 2, got ${zeroR.status}`);
      if (!String(zeroR.stderr).includes('no cases selected')) {
        throw new Error(`zero selected cases: stderr lacks "no cases selected": ${JSON.stringify(zeroR.stderr)}`);
      }
    }],
    ['S12', 'CLI refusals: unknown flag hint, bad --cap/--repeat, valued flag missing value, --keep/--json inside repo or symlink', async () => {
      let msg = '';
      try { parseCli(['--repaet', '2']); } catch (e) { msg = e.message; }
      if (!msg.includes('did you mean --repeat')) throw new Error(`missing hint: ${msg}`);
      for (const bad of [['--cap', 'abc'], ['--cap', '0'], ['--repeat', '0'], ['--repeat', '21']]) {
        let threw = false;
        try { parseCli(bad); } catch { threw = true; }
        if (!threw) throw new Error(`bad numeric not refused: ${bad.join(' ')}`);
      }
      // R17: a valued flag never swallows the next flag as its value
      for (const bad of [['--keep', '--strict-known'], ['--json', '--verbose'], ['--node', '--list']]) {
        let swallowMsg = '';
        try { parseCli(bad); } catch (e) { swallowMsg = e.message; }
        if (!swallowMsg.includes(`${bad[0]}: missing value`)) {
          throw new Error(`valued flag swallowed next flag: ${bad.join(' ')} (${swallowMsg || 'accepted'})`);
        }
      }
      // Inside repo refused for --keep and --json
      for (const [flag, p, kind] of [
        ['--keep', path.join(REPO_ROOT, 'mocks-tmp-bad'), 'keep'],
        ['--json', path.join(REPO_ROOT, 'out.json'), 'json'],
      ]) {
        let threw = false;
        try { guardOutsideRepo(p, flag, REPO_ROOT, kind); } catch { threw = true; }
        if (!threw) throw new Error(`${flag} inside repo not refused`);
      }
      // Symlink pointing into repo OR outside repo (with and without trailing / or /.) refused
      const outTarget = path.join(stRoot, 'real-outside');
      fs.mkdirSync(outTarget, { recursive: true });
      const linkOut = path.join(stRoot, 'lnk-out');
      fs.symlinkSync(outTarget, linkOut);
      for (const variant of [linkOut, `${linkOut}/`, `${linkOut}/.`]) {
        let threw = false;
        try { guardOutsideRepo(variant, '--keep', REPO_ROOT, 'keep'); } catch { threw = true; }
        if (!threw) throw new Error(`--keep outside symlink variant not refused: ${variant}`);
      }
      const linkKeep = path.join(stRoot, 'lnk-keep');
      fs.symlinkSync(REPO_ROOT, linkKeep);
      for (const variant of [linkKeep, `${linkKeep}/`, `${linkKeep}/.`]) {
        let threw = false;
        try { guardOutsideRepo(variant, '--keep', REPO_ROOT, 'keep'); } catch { threw = true; }
        if (!threw) throw new Error(`--keep symlink variant not refused: ${variant}`);
      }
      const linkJson = path.join(stRoot, 'lnk.json');
      fs.symlinkSync(path.join(REPO_ROOT, 'package.json'), linkJson);
      let threwLinkJson = false;
      try { guardOutsideRepo(linkJson, '--json', REPO_ROOT, 'json'); } catch { threwLinkJson = true; }
      if (!threwLinkJson) throw new Error('--json symlink not refused');
      // Parent symlink into repo refused for --json
      let threwParentLink = false;
      try { guardOutsideRepo(path.join(linkKeep, 'res.json'), '--json', REPO_ROOT, 'json'); } catch { threwParentLink = true; }
      if (!threwParentLink) throw new Error('--json under symlink into repo not refused');
    }],
    ['S13', 'Env scrub proof: BASH_ENV, NODE_V8_COVERAGE, NODE_OPTIONS, SHELLOPTS, GIT_EDITOR', async () => {
      if (process.env.LITE_MOCKS_S13_INNER !== '1') {
        const covDir = path.join(stRoot, 's13-cov');
        const beFile = path.join(stRoot, 's13-bashenv.sh');
        fs.mkdirSync(covDir, { recursive: true });
        fs.writeFileSync(beFile, 'echo BASH_ENV_SOURCED\n');
        const r = spawnSync(nodeInfo.nodeAbs, [SELF_FILE, '--self-test=S13', '--node', nodeInfo.nodeAbs], {
          encoding: 'utf8',
          timeout: 15000,
          killSignal: 'SIGKILL',
          env: {
            ...process.env,
            LITE_MOCKS_S13_INNER: '1',
            NODE_V8_COVERAGE: covDir,
            BASH_ENV: beFile,
            NODE_OPTIONS: '--no-deprecation',
            SHELLOPTS: 'noclobber',
            GIT_EDITOR: 'false',
          },
        });
        if (r.error || r.status !== 0) {
          throw new Error(`S13 inner failed (status=${r.status}): ${(r.stdout + r.stderr).trim()}`);
        }
        return;
      }
      const c = makeCase('shape-diff', 's13', {
        tool: 'shape-diff.sh', class: 's13', kind: 'same', claim: 's13',
        files: { a: 'driver.mjs' }, argv: ['env_probe', '{a}'],
        expect: {
          verdict: 'SAME',
          text: [
            ['COV=<unset>'],
            ['BASH=<unset>'],
            ['NOPT=<unset>'],
            ['SHOPT=<unset>'],
            ['GEDIT=<unset>'],
          ],
          forbid: ['BASH_ENV_SOURCED'],
        },
      });
      const r = await runCaseWithRepeat(c, makeCtx());
      if (r.judged.status !== 'OK' || r.judged.fail) {
        throw new Error(`env leaked: ${r.judged.detail} | stdout=${JSON.stringify(r.res.stdout.trim())}`);
      }
    }],
    ['S14', '--repeat 2 with flipping fake tool -> MISMATCH', async () => {
      const stateFile = path.join(stRoot, 's14.flip');
      const c = makeCase('shape-diff', 's14', {
        tool: 'shape-diff.sh', class: 's14', kind: 'same', claim: 's14',
        files: { a: 'driver.mjs' }, argv: ['flip', stateFile, '{a}'],
        expect: { verdict: 'SAME' },
      });
      const r = await runCaseWithRepeat(c, makeCtx({ repeat: 2 }));
      if (r.judged.status !== 'MISMATCH' || !r.judged.fail) {
        throw new Error(`expected MISMATCH on flip, got ${r.judged.status}`);
      }
    }],
  ];

  const selected = onlyRow ? rows.filter(([id]) => id === onlyRow) : rows;
  let failed = 0;
  try {
    for (const [id, desc, fn] of selected) {
      try {
        await fn();
        console.log(`ok ${id} ${desc}`);
      } catch (e) {
        failed++;
        console.log(`FAIL ${id} ${desc}: ${e ? e.message : String(e)}`);
      }
    }
  } finally {
    activeCleanup = null;
    cleanup();
  }

  if (failed > 0) {
    console.log(`self-test: ${failed} row(s) FAILED (${selected.length - failed}/${selected.length} ok)`);
    return 1;
  }
  console.log(`self-test: ${selected.length} row(s) ok`);
  return 0;
}

async function main() {
  let opts;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`mocks/run.mjs: ${e.message}\n`);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(usage());
    process.exit(2);
  }

  // R17: --keep / --json are refused BEFORE the --node probe spawns anything.
  let keepDir = null;
  let jsonPath = null;
  try {
    if (opts.keep !== null) keepDir = guardOutsideRepo(opts.keep, '--keep', REPO_ROOT, 'keep');
    if (opts.json !== null) jsonPath = guardOutsideRepo(opts.json, '--json', REPO_ROOT, 'json');
  } catch (e) {
    process.stderr.write(`mocks/run.mjs: ${e.message}\n`);
    process.exit(2);
  }

  let nodeInfo;
  try {
    nodeInfo = probeNodeBinary(opts.node);
  } catch (e) {
    process.stderr.write(`mocks/run.mjs: ${e.message}\n`);
    process.exit(2);
  }

  if (opts.selfTest) {
    const rc = await runSelfTest(nodeInfo, opts.selfTestRow);
    process.exit(rc);
  }

  let cases;
  try {
    cases = discoverCases(DEFAULT_CASES_DIR, opts.tools, opts.kinds, opts.only);
  } catch (e) {
    process.stderr.write(`mocks/run.mjs: ${e.message}\n`);
    process.exit(2);
  }

  if (cases.length === 0) {
    process.stderr.write('mocks/run.mjs: no cases selected\n');
    process.exit(2);
  }

  if (opts.list) {
    printList(cases, nodeInfo.major);
    process.exit(0);
  }

  let workRoot;
  let removeWork = false;
  if (keepDir !== null) {
    try {
      fs.mkdirSync(keepDir, { recursive: true });
    } catch (e) {
      process.stderr.write(`mocks/run.mjs: --keep: cannot create directory (${keepDir}): ${e ? e.message : 'error'}\n`);
      process.exit(2);
    }
    workRoot = keepDir;
  } else {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-mocks-'));
    removeWork = true;
    activeCleanup = () => { fs.rmSync(workRoot, { recursive: true, force: true }); };
  }

  const ctx = {
    toolsDir: REPO_ROOT,
    workRoot,
    nodeInfo,
    capMs: opts.cap * 1000,
    repeat: opts.repeat,
    keep: keepDir !== null,
    strictKnown: opts.strictKnown,
    baseEnv: process.env,
  };

  // R17: no process.exit inside this try -- every exit goes through the finally (stage removal).
  let rc = 2;
  try {
    if (opts.explain !== null) {
      rc = await runExplain(cases, opts.explain, ctx);
    } else {
      console.log(`node ${nodeInfo.nodeVer} (v8 ${nodeInfo.v8Ver}, ${nodeInfo.nodeAbs})  cases ${cases.length}  repeat ${opts.repeat}  cap ${opts.cap}s`);
      const counts = {
        OK: 0, LIMIT: 0, 'TEETH-OK': 0, KNOWN: 0, 'KNOWN-MATCH': 0, failed: 0,
      };
      const jsonRows = [];
      for (const c of cases) {
        const r = await runCaseWithRepeat(c, ctx);
        const st = r.judged.status;
        if (r.judged.fail) counts.failed++;
        if (Object.hasOwn(counts, st)) counts[st]++;
        const secs = (r.totalMs / 1000).toFixed(1);
        const note = r.judged.detail ? `  (${r.judged.detail})` : '';
        console.log(`${st.padEnd(13)} ${c.id.padEnd(40)} expect=${r.resolvedExp.verdict.padEnd(10)} got=${r.decoded.got.padEnd(11)} [${c.className}] ${secs}s${note}`);
        if (opts.verbose && !r.judged.fail && r.textCheck.matched.length > 0) {
          console.log(`    | ${r.textCheck.matched[0].slice(0, 200)}`);
        }
        if (r.judged.fail) {
          const lines = (r.res.stdout + (r.res.stderr ? `\n${r.res.stderr}` : ''))
            .split('\n')
            .filter((l) => l.trim().length > 0)
            .slice(-8);
          for (const l of lines) console.log(`    | ${l.slice(0, 200)}`);
        }
        jsonRows.push({
          id: c.id,
          tool: c.tool,
          kind: c.kind,
          class: c.className,
          known: c.known,
          expect: r.resolvedExp.verdict,
          got: r.decoded.got,
          status: st,
          fail: r.judged.fail,
          detail: r.judged.detail,
          secs: Number(secs),
        });
      }

      const passed = cases.length - counts.failed;
      console.log(
        `summary: ${passed}/${cases.length} as expected ` +
        `(OK=${counts.OK} LIMIT=${counts.LIMIT} TEETH-OK=${counts['TEETH-OK']} KNOWN=${counts.KNOWN} KNOWN-MATCH=${counts['KNOWN-MATCH']} fail=${counts.failed}) ` +
        `node=${nodeInfo.nodeVer} v8=${nodeInfo.v8Ver}`
      );

      if (jsonPath !== null) {
        const payload = {
          node: nodeInfo.nodeVer,
          v8: nodeInfo.v8Ver,
          nodePath: nodeInfo.nodeAbs,
          capSec: opts.cap,
          repeat: opts.repeat,
          strictKnown: opts.strictKnown,
          summary: counts,
          rows: jsonRows,
        };
        fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n');
      }

      rc = counts.failed > 0 ? 1 : 0;
    }
  } catch (e) {
    process.stderr.write(`mocks/run.mjs: ${e ? e.message : String(e)}\n`);
    rc = 2;
  } finally {
    activeCleanup = null;
    if (removeWork) {
      fs.rmSync(workRoot, { recursive: true, force: true });
    }
  }
  process.exit(rc);
}

main();
