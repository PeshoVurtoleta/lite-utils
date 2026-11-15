// ci-probe.mjs -- alloc-per-op TASK 0 / T0e (SPEC 4.G0 TASK 7, S-A17; ruling Q-B82-LINUX (a)): one CI leg of the
// dispatch-only alloc-probe workflow. Research only, not shipped (not in package.json files[]).
//   node ci-probe.mjs --os <ubuntu-latest|macos-latest|local> --node <22|24|26|26.8.2|M|M.m.p> --out /abs/leg.json
//   (cwd = a private mktemp dir outside the repo; the children run there: V8 flag runs leave files in cwd)
// Spawns ./band.mjs (r6-band.mjs verbatim) with process.execPath (resolved once, law 5), P 2, interleaved by round:
//   T0b band4 cells {1e6, 1e7} x {1e3, 1e4}, K 4, WARM 2e5, --expose-gc                     x ROUNDS (3)
//   T0d fence states fresh (1e6 1e4 4 2e5) / state-1e8 (1e8 1e4 4 2e5) / state-large (200 1 4 20), --expose-gc  x 3
//   T0c lb cell (S-A17): lb 1e6 1e4 K 6 WARM 5e6, FLAGS_A = --expose-gc --no-concurrent-recompilation,
//       env FORCE_RETRY 0                                                                    x LB_ROUNDS (20)
//       + 1 run at FORCE_RETRY 7 (the A3 / S-A20 must-fail control ci-report.mjs needs for the lb verdict)
// Writes ONE JSON (schema 1): { probe, schema, leg, provenance (incl. busyNodeStart / End = other node processes as
// { pid, pcpu }), band { sha256 }, plan, wallMs, jobs[] }; each job
// carries rc / signal / timedOut / ms / stderr head and `record` = the child's parsed JSON line (null when it did not
// parse: null is not zero). Law 3: every argument and the cwd / out / band.mjs / node checks are refused exit 2
// before the first spawn. Children get a minimal env (FORCE_RETRY for lb only; no NODE_OPTIONS). A child over
// TIMEOUT_MS is killed by its own pid only. Exit 0 = every job rc 0 with a parsed record, 1 = otherwise (the JSON is
// still written; ci-report.mjs judges it).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, type, arch, totalmem } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const die = (m) => { console.error('ci-probe: ' + m); process.exit(2); };
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = realpathSync(resolve(HERE, '..', '..'));
const OPTS = ['--os', '--node', '--out'];
const OS_PLATFORM = { 'ubuntu-latest': 'linux', 'macos-latest': 'darwin', local: 'darwin' };
const opt = {};
const av = process.argv.slice(2);
for (let i = 0; i < av.length; i++) {
    const a = av[i];
    if (!OPTS.includes(a)) {
        const near = OPTS.find((o) => a.startsWith('--') && o.slice(2, 4) === a.slice(2, 4));
        die((a.startsWith('--') ? 'unknown option ' : 'unexpected argument ') + JSON.stringify(a) + (near ? ' (did you mean ' + near + '?)' : ''));
    }
    if (Object.hasOwn(opt, a)) die('repeated option ' + a);
    if (i + 1 >= av.length) die(a + ' needs a value');
    opt[a] = av[++i];
}
for (const o of OPTS) if (!Object.hasOwn(opt, o)) die('missing ' + o + ' (usage: --os <ubuntu-latest|macos-latest|local> --node <spec> --out /abs/leg.json)');
const LEG_OS = opt['--os'], LEG_NODE = opt['--node'], OUT = opt['--out'];
if (!Object.hasOwn(OS_PLATFORM, LEG_OS)) die('--os must be one of ' + Object.keys(OS_PLATFORM).join(' | ') + ', got ' + JSON.stringify(LEG_OS));
if (OS_PLATFORM[LEG_OS] !== process.platform) die('--os ' + LEG_OS + ' needs platform ' + OS_PLATFORM[LEG_OS] + ', this is ' + process.platform);
// node spec: a major (22) or an exact release (26.8.2); the running node must match it (#128: a major keys on the range)
const MAJOR = /^[1-9][0-9]?$/, EXACT = /^[1-9][0-9]?\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.]+)?$/;
if (!MAJOR.test(LEG_NODE) && !EXACT.test(LEG_NODE)) die('--node must be a major (22) or an exact release (26.8.2), got ' + JSON.stringify(LEG_NODE));
const nodeOk = MAJOR.test(LEG_NODE) ? process.version.startsWith('v' + LEG_NODE + '.') : process.version === 'v' + LEG_NODE;
if (!nodeOk) die('--node ' + LEG_NODE + ' but this node is ' + process.version);
if (!isAbsolute(OUT)) die('--out must be an absolute path, got ' + JSON.stringify(OUT));
if (!/\.json$/.test(OUT)) die('--out must end in .json');
if (existsSync(OUT)) die('--out exists (never overwritten): ' + OUT);
if (!existsSync(dirname(OUT)) || !statSync(dirname(OUT)).isDirectory()) die('--out parent is not a directory: ' + dirname(OUT));
// cwd: private, outside the repo (law 10); also outside $GITHUB_WORKSPACE when set
const CWD = realpathSync(process.cwd());
const inside = (d, top) => d === top || d.startsWith(top + sep);
if (inside(CWD, ROOT)) die('cwd is inside the repo (' + CWD + '); run from a private mktemp -d');
const GWS = process.env.GITHUB_WORKSPACE;
if (GWS !== undefined && existsSync(GWS) && inside(CWD, realpathSync(GWS))) die('cwd is inside $GITHUB_WORKSPACE (' + CWD + ')');
const OUTDIR = realpathSync(dirname(OUT));
if (inside(OUTDIR, ROOT)) die('--out is inside the repo: ' + OUT);
// band.mjs and node: resolved once (law 5)
const BAND = join(HERE, 'band.mjs');
if (!existsSync(BAND) || !statSync(BAND).isFile()) die('missing ' + BAND);
const BAND_SHA256 = createHash('sha256').update(readFileSync(BAND)).digest('hex');
const EXEC = realpathSync(process.execPath);
if (!statSync(EXEC).isFile()) die('process.execPath is not a file: ' + EXEC);

const P = 2, ROUNDS = 3, LB_ROUNDS = 20, TIMEOUT_MS = 900000;
const GX = ['--expose-gc'], FLAGS_A = ['--expose-gc', '--no-concurrent-recompilation'];
const jobs = [];
for (let k = 0; k < ROUNDS; k++) {
    for (const [n, s] of [[1e6, 1e3], [1e6, 1e4], [1e7, 1e3], [1e7, 1e4]]) jobs.push({ group: 'band', mode: 'band4', n, sub: s, k: 4, warm: 2e5, flags: GX, forceRetry: 0, round: k });
    for (const [mode, n, s, K, warm] of [['fresh', 1e6, 1e4, 4, 2e5], ['state-1e8', 1e8, 1e4, 4, 2e5], ['state-large', 200, 1, 4, 20]])
        jobs.push({ group: 'fence', mode, n, sub: s, k: K, warm, flags: GX, forceRetry: 0, round: k });
}
for (let k = 0; k < LB_ROUNDS; k++) jobs.push({ group: 'lb', mode: 'lb', n: 1e6, sub: 1e4, k: 6, warm: 5e6, flags: FLAGS_A, forceRetry: 0, round: k });
jobs.push({ group: 'lb', mode: 'lb', n: 1e6, sub: 1e4, k: 6, warm: 5e6, flags: FLAGS_A, forceRetry: 7, round: 0 });

const pv = process.config && process.config.variables;
const pcRaw = pv !== null && typeof pv === 'object' && Object.hasOwn(pv, 'v8_enable_pointer_compression') ? pv.v8_enable_pointer_compression : null;
// other node processes (pid + %CPU only; never the env), read after every refusal: busy-node provenance (null = ps
// unavailable or failed; null is not "none")
const PS = ['/bin/ps', '/usr/bin/ps'].find((p) => existsSync(p)) ?? null;
function busyNodes() {
    if (PS === null) return null;
    const r = spawnSync(PS, ['-Ao', 'pid=,pcpu=,comm='], { encoding: 'utf8', env: {}, timeout: 10000 });
    if (r.status !== 0 || typeof r.stdout !== 'string') return null;
    const out = [];
    for (const l of r.stdout.split('\n')) {
        const m = /^\s*(\d+)\s+([\d.]+)\s+(.*)$/.exec(l);
        if (m && Number(m[1]) !== process.pid && /(^|\/)node$/.test(m[3].trim())) out.push({ pid: Number(m[1]), pcpu: Number(m[2]) });
    }
    return out;
}
const envOrNull = (k) => (typeof process.env[k] === 'string' ? process.env[k] : null);
const cpuList = cpus();
const provenance = {
    date: new Date().toISOString(), node: process.version, v8: process.versions.v8,
    pointerCompression: typeof pcRaw === 'number' || typeof pcRaw === 'boolean' ? pcRaw : null,
    platform: process.platform, osType: type(), osRelease: release(), arch: arch(), cpus: cpuList.length,
    cpuModel: cpuList.length ? cpuList[0].model : null, totalmem: totalmem(), loadavgStart: loadavg(), loadavgEnd: null, busyNodeStart: busyNodes(), busyNodeEnd: null,
    execPath: EXEC, runner: { os: envOrNull('RUNNER_OS'), arch: envOrNull('RUNNER_ARCH'), imageOS: envOrNull('ImageOS'), imageVersion: envOrNull('ImageVersion') },
};
const t0 = Date.now();
let next = 0, bad = 0;
function one(j, idx) {
    return new Promise((res) => {
        const ts = Date.now();
        const c = spawn(EXEC, [...j.flags, BAND, j.mode, String(j.n), String(j.sub), String(j.k), String(j.warm)],
            { cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'], env: j.group === 'lb' ? { FORCE_RETRY: String(j.forceRetry) } : {} });
        let o = '', e = '', timedOut = false;
        const tm = setTimeout(() => { timedOut = true; c.kill('SIGKILL'); }, TIMEOUT_MS);
        c.stdout.on('data', (d) => { o += d; });
        c.stderr.on('data', (d) => { e += d; });
        c.on('error', (err) => { e += 'spawn error: ' + err.message; });
        c.on('close', (rc, sig) => {
            clearTimeout(tm);
            let record = null, parseError = null;
            try { record = JSON.parse(o.trim()); } catch (err) { parseError = err.message + ' | stdout head ' + JSON.stringify(o.slice(0, 400)); }
            const ok = rc === 0 && record !== null && typeof record === 'object' && !Array.isArray(record) && !Object.hasOwn(record, 'error');
            if (!ok) bad++;
            j.pid = c.pid === undefined ? null : c.pid; j.rc = rc; j.signal = sig; j.timedOut = timedOut; j.ms = Date.now() - ts;
            j.stderr = e ? e.slice(0, 400) : null; j.parseError = parseError; j.record = record;
            console.log(`job ${idx + 1}/${jobs.length} ${j.mode} n${j.n} s${j.sub} fr${j.forceRetry} r${j.round} pid=${j.pid} rc=${rc}${sig ? ' sig=' + sig : ''}${timedOut ? ' TIMEOUT' : ''} ${j.ms} ms`);
            res();
        });
    });
}
async function worker() { while (next < jobs.length) { const i = next++; await one(jobs[i], i); } }
await Promise.all(Array.from({ length: P }, worker));
provenance.loadavgEnd = loadavg();
provenance.busyNodeEnd = busyNodes();
const leg = { probe: 'ci-probe', schema: 1, leg: { os: LEG_OS, node: LEG_NODE }, provenance, band: { file: 'band.mjs', sha256: BAND_SHA256 },
    plan: { p: P, rounds: ROUNDS, lbRounds: LB_ROUNDS, timeoutMs: TIMEOUT_MS, jobs: jobs.length }, wallMs: Date.now() - t0, jobs };
writeFileSync(OUT, JSON.stringify(leg) + '\n', { flag: 'wx' });
console.log(`ci-probe ${LEG_OS} node ${LEG_NODE} (${process.version}): jobs ${jobs.length} bad ${bad} wall ${leg.wallMs} ms -> ${OUT}`);
process.exitCode = bad ? 1 : 0;
