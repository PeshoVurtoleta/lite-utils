// ci-report.mjs -- alloc-per-op TASK 0 / T0e (SPEC 4.G0 TASK 7 / A6; ruling Q-B82-LINUX (a)): judges the leg JSONs of
// the dispatch-only alloc-probe workflow. Research only, not shipped.
//   node ci-report.mjs DIR [--legs os:node,os:node,...]
// DIR holds the leg JSONs (ci-probe.mjs schema 2; a schema 1 leg is NO VERDICT, b89 U1), directly or one folder deep (`gh run download --dir DIR` puts each
// artifact in DIR/<artifact-name>/). Expected legs (allowlist, law 4): default the 8 of alloc-probe.yml, ubuntu-latest
// + macos-latest x 22 / 24 / 26 / 26.8.2; --legs replaces the list (e.g. local:26.8.2 for a local wrap).
// Per leg, PASS / FAIL / NO VERDICT for each constant:
//   lo    band4 (T0b cells, judged windows 1..K-1, lanes with from 0 and a known truth): FAIL when err < -32 / sub,
//         err = bpo - truth. Teeth (S-A30, Q-B83-LOTEETH (a) -> Q-B89-LOTEETH (a)): lo x 0.25 must flag >= 1 boxskip
//         window per cell (boxskip skips one box per measured bracket: err -16 / sub = -lo / 2), POOLED across the
//         legs; a cell where no leg flags = lo NO VERDICT on every leg. boxskip is also an ordinary lo / hi row (err >=
//         -lo; a miss prints Q-B82-BANDRE); box / box2 / box15 are ordinary rows only. (b89: the old driver's -16 B per
//         sub-window box bias, which the box-lane control keyed on, is gone with S-A39.) The data-independent
//         must-fail is fixtures/a6-proof.mjs row R2 (-0.0040 at sub 1e4).
//   hi    same windows: FAIL when err > hiFixed + hiRel, hiFixed = 524288 / N, hiRel = 0.001 x peak (peak = max of
//         the row's non-null judged windows). Teeth: hi = 0 must flag >= 1 window on the leg.
//         A null window is never counted in-band (reported as voids); a cell with no non-null window = NO VERDICT.
//   lb    T0c's lb cell, FORCE_RETRY 0 runs, late3 row: FAIL when retries summed over windows 0-2 > 6 or window 2 >
//         1.0; window 2 null = NO VERDICT; every counted lane / window must read calls === N + SUB x reruns (null or
//         off = NO VERDICT: the probe's own oracle). Controls (else NO VERDICT): S-A20 FR0 -- 0 re-runs in windows
//         0-2 -> window 2 <= 0.01, else window 2 <= 524288 / N + 16 x SUB x re-runs / N (null window 2 misses); the
//         FORCE_RETRY 7 run must read window 2 > 1.0 with forced 7 in window 1.
//   F1    every record's fence suite: F1.gcs >= 1 (a sync minor gc() inside a GCProfiler bracket).
//   F2    F2.gcs >= 1 and F2's new-space used delta < its allocated bytes (the used-size drop).
//   Fnull Fnull.gcs === 0 (an empty bracket: the fences' teeth). F0 is recorded only (E25).
// A4 (b89 U1; SPEC C-37, C-30; b88 plan-A1 section D A4-2). band.mjs measures through src bracketS2 / makeDriver.
//   names the leg's census and every job record's census list all 8 names (src SPACES + XSPACES); a missing name
//         prints `Q-B88-XNAMES: <leg> lacks <name>` and FAILs; a census not an array of strings = NO VERDICT.
//   a4    band4 cells, windows 1..K-1 of lateTier (truth 0), late3 (C2; truth 16 from window 3) and box8 (truth 128):
//         FAIL when err < -32 / sub or err > hiFixed + hiRel (the lo / hi formulas; truth per window). A cell / lane
//         with no non-null window = NO VERDICT. Every a4 miss, and every lo / hi miss, prints
//         `Q-B82-BANDRE: <lane> <cell> <leg>`. lo / hi judge the G0 lanes only (as before A4); the probe self-check
//         skips lateTier / late3 / box8 (A4L) in band4 records (the band judges them; #132 (b): never stricter than the band).
//         S-A49 (Q-B89-LATE3W2 (a), C-37): late3 / lateTier count every call incl. retried attempts, so re-runs move
//         their switch earlier; window sw - 1 (sw = the row's switch window) is judged with hi + 16 x sub x R / n, R =
//         the row's reruns summed over windows 0..sw-1 (the S-A20 lb formula); every other window keeps the plain band.
//         sw not an integer in 2..K-1 (late3: not its from; lateTier: not 3), or in any of those windows reruns not a
//         Number.isInteger >= 0 or calls not an integer === n + sub x reruns = that row NO VERDICT (named `S-A49: ...`),
//         never counted. The miss test is NaN-safe: !(err >= -lo && err <= lim).
//   ctl   the ctl cell (src SELF_TEST_LANES old / nlo, n 1e5 sub 1e4 K 5 WARM 2e5): each row's peak / voids / verdict
//         must re-derive from its windows with src gateVerdict(peak, max, bandOf(n, sub)) and max = the src row's
//         and the record's cell = the src row's n / sub / windows / warm (else NO VERDICT); old and nlo must each read FAIL in >= 1 leg, pooled across legs (#132 (a)); a lane that
//         reads FAIL in no leg FAILs ctl on every leg; each leg prints its own rows.
// Leg-level NO VERDICT (every constant): provenance node not matching the leg's node spec (a major keys on the range,
// #128), platform not the leg's OS, pointerCompression !== 0 (null = unknown = NO VERDICT), band.mjs sha256 not the
// pinned a4-band, src sha256 not 64 hex (and run level: the legs disagree on it). A failed / unparsable / inconsistent job record, a malformed row (lane a string, truth null or a
// number, from an integer, sw null or an integer (S-A49), K windows with bpo null or a number; b83 G0-1; b89: the mode's exact lane set, a census,
// ctl rows' max / peak / voids / verdict), or a record failing the probe self-check
// (truth 16 windows >= 8 B/op; truth 0 windows < max(8, 524288 / N + 0.001 x peak), S-A31 / Q-B83-SELFN (a)) is NO
// VERDICT for the constants it feeds. A missing T0b cell, fence
// state or lb run = NO VERDICT for its constants.
// Run: exit 2 (NO VERDICT) on any NO VERDICT, a missing / duplicate / unexpected leg, or an unparsable / non-ci-probe
// file (NO VERDICT wins, Q-B82-RUNVERDICT (a)); else 1 on any FAIL; else 0. The report is printed in every case.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gateVerdict, bandOf, SPACES, XSPACES, SELF_TEST_LANES } from '../../src/alloc-per-op.mjs';

const BAND_SHA256 = '8bf8b284fecdbe90b67b2af38d04c8a8bf56784e856a090e9639c960ac755009'; // band.mjs a4-band + boxskip + row sw (b90 U1, S-A49)
const LOCAL_SRC = fileURLToPath(new URL('../../src/alloc-per-op.mjs', import.meta.url));
const LOCAL_SRC_SHA256 = createHash('sha256').update(readFileSync(LOCAL_SRC)).digest('hex');
const NAMES8 = [...SPACES, ...XSPACES];
const A4L = ['lateTier', 'late3', 'box8'];
const S49 = ['late3', 'lateTier']; // S-A49: window sw - 1 judged with hi + 16 x sub x R / n
const BAND4_LANES = ['empty', 'f64', 'box', 'box2', 'box15', 'boxskip', 'boxc', 'obj', 'late', 'lateTier', 'late3', 'throw', 'box8'];
const CTL_LANES = ['old', 'nlo'];
const CTL_ROWS = Object.fromEntries(CTL_LANES.map((name) => [name, SELF_TEST_LANES.find((L) => L.name === name)]));
const VERDICTS = ['PASS', 'FAIL', 'NO VERDICT'];
const OS_PLATFORM = { 'ubuntu-latest': 'linux', 'macos-latest': 'darwin', local: 'darwin' };
const DEFAULT_LEGS = ['ubuntu-latest', 'macos-latest'].flatMap((o) => ['22', '24', '26', '26.8.2'].map((n) => o + ':' + n));
const CELLS = [[1e6, 1e3], [1e6, 1e4], [1e7, 1e3], [1e7, 1e4]];
const FENCE_MODES = [['fresh', 1e6, 1e4, 4, 2e5], ['state-1e8', 1e8, 1e4, 4, 2e5], ['state-large', 200, 1, 4, 20]];
const LB = { n: 1e6, sub: 1e4, k: 6, warm: 5e6 };
const CONSTS = ['lo', 'hi', 'lb', 'F1', 'F2', 'Fnull', 'names', 'a4', 'ctl'];
const BOXL = ['boxskip']; // Q-B89-LOTEETH (a): the lo x 0.25 pooled data control
const MAJOR = /^[1-9][0-9]?$/, EXACT = /^[1-9][0-9]?\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.]+)?$/;

const die = (m) => { console.error('ci-report: ' + m); console.log('NO VERDICT (usage)'); process.exit(2); };
const OPTS = ['--legs'];
const pos = [], opt = {};
const av = process.argv.slice(2);
for (let i = 0; i < av.length; i++) {
    const a = av[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    if (!OPTS.includes(a)) die('unknown option ' + a + (a.slice(2, 4) === 'le' ? ' (did you mean --legs?)' : ''));
    if (Object.hasOwn(opt, a)) die('repeated option ' + a);
    if (i + 1 >= av.length) die(a + ' needs a value');
    opt[a] = av[++i];
}
if (pos.length !== 1) die('usage: DIR [--legs os:node,...]');
const DIR = resolve(pos[0]);
if (!existsSync(DIR) || !statSync(DIR).isDirectory()) die('no such dir ' + DIR);
const LEGS = opt['--legs'] === undefined ? DEFAULT_LEGS : opt['--legs'].split(',');
for (const l of LEGS) {
    const m = /^([a-z-]+):(.+)$/.exec(l);
    if (!m || !Object.hasOwn(OS_PLATFORM, m[1]) || !(MAJOR.test(m[2]) || EXACT.test(m[2]))) die('--legs: bad leg ' + JSON.stringify(l) + ' (os ' + Object.keys(OS_PLATFORM).join(' | ') + ', node a major or M.m.p)');
}
if (new Set(LEGS).size !== LEGS.length) die('--legs: duplicate leg');

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nodeMatches = (spec, v) => typeof v === 'string' && (MAJOR.test(spec) ? v.startsWith('v' + spec + '.') : v === 'v' + spec);
const say = (s) => console.log(s);

// ---- load -------------------------------------------------------------------------------------------------------
const problems = [];
const legs = new Map();
const paths = [];
for (const e of readdirSync(DIR, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(DIR, e.name);
    if (e.isFile() && e.name.endsWith('.json')) paths.push(p);
    else if (e.isDirectory()) for (const f of readdirSync(p).sort()) if (f.endsWith('.json')) paths.push(join(p, f));
}
for (const p of paths) {
    let j;
    try { j = JSON.parse(readFileSync(p, 'utf8')); } catch (err) { problems.push(p + ': unparsable (' + err.message + ')'); continue; }
    if (isObj(j) && j.probe === 'ci-probe' && j.schema === 1) { problems.push(p + ': schema 1 leg (pre-A4): ci-report needs schema 2 (census, src sha256, A4 lanes)'); continue; }
    if (!isObj(j) || j.probe !== 'ci-probe' || j.schema !== 2 || !isObj(j.leg) || typeof j.leg.os !== 'string' || typeof j.leg.node !== 'string'
        || !isObj(j.provenance) || !isObj(j.band) || !Array.isArray(j.jobs)) { problems.push(p + ': not a ci-probe schema 2 leg'); continue; }
    const key = j.leg.os + ':' + j.leg.node;
    if (!LEGS.includes(key)) { problems.push(p + ': unexpected leg ' + key); continue; }
    if (legs.has(key)) { problems.push(p + ': duplicate leg ' + key + ' (also ' + legs.get(key).path + ')'); continue; }
    legs.set(key, { path: p, j });
}
for (const l of LEGS) if (!legs.has(l)) problems.push('missing leg ' + l);

// ---- judge one leg ----------------------------------------------------------------------------------------------
const truthAt = (row, w) => (row.truth === null ? null : (w >= row.from ? row.truth : 0));
const HEX64 = /^[0-9a-f]{64}$/;
const isCensus = (c) => Array.isArray(c) && c.every((x) => typeof x === 'string');
// ctl row re-derivation (src runSelfTestLanes rule): peak = max of windows 1..K-1 (any null = null), voids = null
// windows over all K, verdict = voids ? NO VERDICT : gateVerdict(peak, max, bandOf(n, sub)); '' = consistent
function ctlRowBad(row, r) {
    const ref = CTL_ROWS[row.lane];
    if (!ref) return row.lane + ' is not a ctl lane';
    if (row.max !== ref.max) return row.lane + ' max ' + row.max + ' is not src ' + ref.max;
    if (r.n !== ref.n || r.sub !== ref.sub || r.k !== ref.windows || r.warm !== ref.warm) return row.lane + ` record cell n${r.n} s${r.sub} k${r.k} warm${r.warm} is not the src SELF_TEST_LANES cell`;
    if (!(row.peak === null || num(row.peak)) || !Number.isInteger(row.voids) || !VERDICTS.includes(row.verdict)) return row.lane + ' peak / voids / verdict malformed';
    let peak = null, voids = 0;
    for (let w = 0; w < r.k; w++) if (row.windows[w].bpo === null) voids++;
    for (let w = 1; w < r.k; w++) { const b = row.windows[w].bpo; if (b === null) { peak = null; break; } if (peak === null || b > peak) peak = b; }
    const verdict = voids !== 0 ? 'NO VERDICT' : gateVerdict(peak, ref.max, bandOf(r.n, r.sub));
    if (row.peak !== peak || row.voids !== voids || row.verdict !== verdict) return row.lane + ' peak ' + row.peak + ' / voids ' + row.voids + ' / verdict ' + row.verdict + ' do not re-derive (' + peak + ' / ' + voids + ' / ' + verdict + ')';
    return '';
}
// S-A49 row guard: '' = the row's switch window (late3: its from; lateTier: 3, band.mjs START = 1 + WARM + 3N) and the
// reruns of windows 0..sw-1 are usable, each window tied to the lane's own counter: calls === n + sub x reruns (as lb)
function s49Bad(row, r) {
    if (!Number.isInteger(row.sw) || !(row.sw >= 2 && row.sw <= r.k - 1)) return 'sw ' + JSON.stringify(row.sw ?? null) + ' is not an integer in 2..' + (r.k - 1);
    if (row.lane === 'late3' && row.sw !== row.from) return 'sw ' + row.sw + ' is not its from ' + row.from;
    if (row.lane === 'lateTier' && row.sw !== 3) return 'sw ' + row.sw + ' is not lateTier\'s 3';
    for (let w = 0; w < row.sw; w++) {
        const x = row.windows[w].reruns;
        if (!Number.isInteger(x)) return 'w' + w + ' reruns ' + JSON.stringify(x ?? null) + ' is not an integer';
        if (!(x >= 0)) return 'w' + w + ' reruns ' + x + ' < 0';
        const c = row.windows[w].calls;
        if (!Number.isInteger(c)) return 'w' + w + ' calls ' + JSON.stringify(c ?? null) + ' is not an integer';
        if (c !== r.n + r.sub * x) return 'w' + w + ' calls ' + c + ' is not n + sub x reruns ' + (r.n + r.sub * x);
    }
    return '';
}
function judge(key, j) {
    const nv = Object.fromEntries(CONSTS.map((c) => [c, []]));
    const fail = Object.fromEntries(CONSTS.map((c) => [c, []]));
    const info = [];
    let legLevel = false;
    const all = (msg) => { legLevel = true; for (const c of CONSTS) nv[c].push(msg); };
    const [os, spec] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const pr = j.provenance;
    if (!nodeMatches(spec, pr.node)) all('provenance node ' + JSON.stringify(pr.node) + ' does not match leg node ' + spec);
    if (pr.platform !== OS_PLATFORM[os]) all('platform ' + JSON.stringify(pr.platform) + ' is not ' + OS_PLATFORM[os]);
    if (pr.pointerCompression !== 0) all('pointerCompression ' + JSON.stringify(pr.pointerCompression ?? null) + ' (need 0; null = unknown)');
    if (j.band.sha256 !== BAND_SHA256) all('band.mjs sha256 ' + String(j.band.sha256).slice(0, 8) + ' is not the pinned ' + BAND_SHA256.slice(0, 8));
    if (!isObj(j.src) || typeof j.src.sha256 !== 'string' || !HEX64.test(j.src.sha256)) all('src sha256 missing or not 64 hex');
    else if (j.src.sha256 !== LOCAL_SRC_SHA256) info.push('src sha256 ' + j.src.sha256.slice(0, 8) + ' differs from the local src ' + LOCAL_SRC_SHA256.slice(0, 8) + ' (ctl re-derivation uses the local gateVerdict)');
    // census (P3): the leg's own node lists all 8 names (Q-B88-XNAMES)
    if (!isCensus(j.census)) nv.names.push('leg census missing or not an array of strings');
    else for (const name of NAMES8) if (!j.census.includes(name)) fail.names.push('Q-B88-XNAMES: ' + key + ' lacks ' + name);
    // job records: consistency + self-check; a bad record voids the constants it feeds
    const good = [];
    for (const job of j.jobs) {
        const feeds = !isObj(job) ? CONSTS : job.group === 'band' ? ['lo', 'hi', 'a4', 'F1', 'F2', 'Fnull', 'names'] : job.group === 'lb' ? ['lb', 'F1', 'F2', 'Fnull', 'names']
            : job.group === 'ctl' ? ['ctl', 'F1', 'F2', 'Fnull', 'names'] : ['F1', 'F2', 'Fnull', 'names'];
        const tag = isObj(job) ? `${job.mode} n${job.n} s${job.sub} fr${job.forceRetry} r${job.round}` : 'job';
        const bad = (m) => { for (const c of feeds) nv[c].push(tag + ': ' + m); };
        if (!isObj(job) || !['band', 'lb', 'fence', 'ctl'].includes(job.group)) { bad('malformed job'); continue; }
        const r = job.record;
        if (job.rc !== 0 || !isObj(r) || Object.hasOwn(r, 'error')) { bad(`rc ${job.rc}${job.timedOut ? ' TIMEOUT' : ''}${isObj(r) && r.error ? ' error ' + r.error : ''}${job.parseError ? ' unparsable' : ''}`); continue; }
        if (r.probe !== 'a4-band' || r.mode !== job.mode || r.n !== job.n || r.sub !== job.sub || r.k !== job.k || r.warm !== job.warm || r.forceRetry !== job.forceRetry
            || r.node !== pr.node || !Array.isArray(r.rows) || !isObj(r.fence)) { bad('record does not match its job / leg'); continue; }
        if (!isCensus(r.census)) { bad('record census missing or not an array of strings'); continue; }
        const want = r.mode === 'band4' ? BAND4_LANES : r.mode === 'ctl' ? CTL_LANES : null;
        if (want !== null && !(r.rows.length === want.length && r.rows.every((row, i) => isObj(row) && row.lane === want[i]))) { bad('row set is not ' + want.join(',')); continue; }
        let sc = null;
        for (const row of r.rows) {
            if (!isObj(row) || typeof row.lane !== 'string' || !(row.truth === null || num(row.truth)) || !Number.isInteger(row.from) || !(row.sw === null || Number.isInteger(row.sw)) || !Array.isArray(row.windows) || row.windows.length !== r.k) { sc = 'malformed row'; break; }
            for (let w = 0; w < r.k; w++) {
                const win = row.windows[w];
                if (!isObj(win) || !(win.bpo === null || num(win.bpo))) { sc = row.lane + ' w' + w + ' bpo not a number or null'; break; }
            }
            if (sc) break;
            if (r.mode === 'ctl') { const cb = ctlRowBad(row, r); if (cb) { sc = cb; break; } continue; }
            if (r.mode === 'band4' && A4L.includes(row.lane)) continue; // judged by the a4 band, never by a stricter self-check (#132 (b))
            let peak = null;
            for (let w = 1; w < r.k; w++) { const b = row.windows[w].bpo; if (b !== null && (peak === null || b > peak)) peak = b; }
            const clean = Math.max(8, 524288 / r.n + 0.001 * (peak === null ? 0 : peak)); // S-A31 (Q-B83-SELFN (a))
            for (let w = 1; w < r.k; w++) {
                const win = row.windows[w], tr = truthAt(row, w);
                if (tr === null || win.bpo === null) continue;
                if (tr === 16 && !(win.bpo >= 8)) { sc = row.lane + ' w' + w + ' box ' + win.bpo + ' < 8'; break; }
                if (tr === 0 && !(win.bpo < clean)) { sc = row.lane + ' w' + w + ' clean ' + win.bpo + ' >= ' + clean; break; }
            }
            if (sc) break;
        }
        if (sc) { bad('self-check ' + sc); continue; }
        for (const name of NAMES8) if (!r.census.includes(name)) fail.names.push('Q-B88-XNAMES: ' + key + ' lacks ' + name + ' (child ' + tag + ')');
        good.push([job, r]);
    }
    // ---- lo / hi ----
    const band = good.filter(([job]) => job.group === 'band');
    let hzFlags = 0;
    const ctl = {}; // cell -> lo x 0.25 box flags on this leg (pooled across legs by the caller, S-A30)
    for (const [n, s] of CELLS) {
        const recs = band.filter(([, r]) => r.mode === 'band4' && r.n === n && r.sub === s);
        const cell = `cell n${n} s${s}`;
        if (recs.length === 0) { nv.lo.push(cell + ' missing'); nv.hi.push(cell + ' missing'); continue; }
        const lo = 32 / s;
        let nonNull = 0, voids = 0, loF = 0, hiF = 0, ctlBox = 0, errMin = null, errMax = null, boxMin = null, wins = 0;
        for (const [job, r] of recs) for (const row of r.rows) {
            if (row.from !== 0 || row.truth === null || A4L.includes(row.lane)) continue; // G0 lanes only (a4 judges A4L)
            let peak = null;
            for (let w = 1; w < r.k; w++) { const b = row.windows[w].bpo; if (b !== null && (peak === null || b > peak)) peak = b; }
            const hi = 524288 / n + 0.001 * (peak === null ? 0 : peak);
            for (let w = 1; w < r.k; w++) {
                const win = row.windows[w];
                wins++;
                if (win.bpo === null) { voids++; continue; }
                nonNull++;
                const err = win.bpo - row.truth;
                if (errMin === null || err < errMin) errMin = err;
                if (errMax === null || err > errMax) errMax = err;
                if (err < -lo) { loF++; fail.lo.push(`Q-B82-BANDRE: ${row.lane} ${cell} ${key} -- r${job.round} ${row.lane} w${w} err ${err.toFixed(6)} < -${lo.toFixed(6)}`); }
                if (err > hi) { hiF++; fail.hi.push(`Q-B82-BANDRE: ${row.lane} ${cell} ${key} -- r${job.round} ${row.lane} w${w} err ${err.toFixed(6)} > ${hi.toFixed(6)}`); }
                if (err > 0) hzFlags++;
                if (BOXL.includes(row.lane)) {
                    if (err < -lo * 0.25) ctlBox++;
                    if (num(win.sum)) { const pb = (win.sum - 16 * n) / (n / s); if (boxMin === null || pb < boxMin) boxMin = pb; }
                }
            }
        }
        info.push(`${cell}: records ${recs.length} windows ${wins} voids ${voids} err ${errMin === null ? 'null' : errMin.toFixed(6)}..${errMax === null ? 'null' : errMax.toFixed(6)} lo-flags ${loF} hi-flags ${hiF} box min per-sub-window err ${boxMin} (REPORTED) control lo x 0.25 box flags ${ctlBox}`);
        if (nonNull === 0) { nv.lo.push(cell + ' all-null windows'); nv.hi.push(cell + ' all-null windows'); continue; }
        ctl[cell] = ctlBox;
    }
    if (band.length && hzFlags < 1) nv.hi.push('control hi = 0 flags 0 windows (no teeth)');
    // ---- a4: lateTier, late3 (C2), box8 in band (err in [-lo, hi], truth per window) ----
    for (const [n, s] of CELLS) {
        const recs = band.filter(([, r]) => r.mode === 'band4' && r.n === n && r.sub === s);
        const cell = `cell n${n} s${s}`;
        if (recs.length === 0) { nv.a4.push(cell + ' missing'); continue; }
        const lo = 32 / s;
        for (const lane of A4L) {
            let nonNull = 0, voids = 0, miss = 0, errMin = null, errMax = null;
            const s49 = [];
            for (const [job, r] of recs) {
                const row = r.rows.find((x) => x.lane === lane);
                let peak = null;
                for (let w = 1; w < r.k; w++) { const b = row.windows[w].bpo; if (b !== null && (peak === null || b > peak)) peak = b; }
                const hi = 524288 / n + 0.001 * (peak === null ? 0 : peak);
                let sw = null, allow = 0; // S-A49: only window sw - 1 gets the allowance
                if (S49.includes(lane)) {
                    const why = s49Bad(row, r);
                    if (why) { nv.a4.push(`S-A49: ${lane} ${cell} ${key} r${job.round}: ${why} -> row NO VERDICT (not counted)`); continue; }
                    sw = row.sw;
                    let R = 0;
                    for (let w = 0; w < sw; w++) R += row.windows[w].reruns;
                    allow = 16 * s * R / n;
                    s49.push(`r${job.round} w${sw - 1} R ${R} allow ${allow.toFixed(6)} bpo ${row.windows[sw - 1].bpo}`);
                }
                for (let w = 1; w < r.k; w++) {
                    const b = row.windows[w].bpo, tr = truthAt(row, w);
                    if (b === null) { voids++; continue; }
                    nonNull++;
                    const err = b - tr;
                    if (errMin === null || err < errMin) errMin = err;
                    if (errMax === null || err > errMax) errMax = err;
                    const lim = w === sw - 1 ? hi + allow : hi;
                    if (!(err >= -lo && err <= lim)) { miss++; fail.a4.push(`Q-B82-BANDRE: ${lane} ${cell} ${key} -- r${job.round} w${w} bpo ${b} truth ${tr} err ${err.toFixed(6)} outside [-${lo.toFixed(6)}, ${lim.toFixed(6)}]`); }
                }
            }
            info.push(`a4 ${cell} ${lane}: records ${recs.length} judged windows ${nonNull} voids ${voids} err ${errMin === null ? 'null' : errMin.toFixed(6)}..${errMax === null ? 'null' : errMax.toFixed(6)} misses ${miss}${s49.length ? ' S-A49 ' + s49.join('; ') : ''}`);
            if (nonNull === 0) nv.a4.push(`${cell} ${lane} all-null windows`);
        }
    }
    // ---- ctl: old / nlo verdict rows (pooled across legs by the caller) ----
    const ctlRecs = good.filter(([job, r]) => job.group === 'ctl' && r.mode === 'ctl');
    const ctlF = { old: 0, nlo: 0 };
    if (ctlRecs.length === 0) nv.ctl.push('no ctl record');
    for (const [job, r] of ctlRecs) for (const row of r.rows) {
        if (row.verdict === 'FAIL') ctlF[row.lane]++;
        info.push(`ctl n${r.n} s${r.sub} r${job.round} ${row.lane}: verdict ${row.verdict} peak ${row.peak} max ${row.max} voids ${row.voids} windows ${JSON.stringify(row.windows.map((w) => w.bpo))}`);
    }
    // ---- lb ----
    const lbRecs = good.filter(([job, r]) => job.group === 'lb' && r.mode === 'lb' && r.n === LB.n && r.sub === LB.sub && r.k === LB.k && r.warm === LB.warm);
    const fr0 = lbRecs.filter(([, r]) => r.forceRetry === 0), fr7 = lbRecs.filter(([, r]) => r.forceRetry === 7);
    if (fr0.length === 0) nv.lb.push('no FORCE_RETRY 0 lb run');
    if (fr7.length === 0) nv.lb.push('no FORCE_RETRY 7 control run');
    const hist = new Map();
    for (const [job, r] of lbRecs) {
        const tag = `lb fr${r.forceRetry} r${job.round}`;
        for (const row of r.rows) if (row.counts) for (let w = 0; w < r.k; w++) {
            const win = row.windows[w];
            if (!(num(win.calls) && num(win.reruns) && win.calls === r.n + r.sub * win.reruns)) nv.lb.push(`${tag} ${row.lane} w${w} calls ${win.calls ?? null} != n + sub x reruns ${win.reruns ?? null}`);
        }
        const late = r.rows.find((x) => x.lane === 'late3');
        if (!late) { nv.lb.push(tag + ' no late3 row'); continue; }
        const W = late.windows;
        if (![0, 1, 2].every((w) => num(W[w].retries))) { nv.lb.push(tag + ' retries not numbers'); continue; }
        const R = W[0].retries + W[1].retries + W[2].retries, w2 = W[2].bpo;
        const RR = [0, 1, 2].every((w) => num(W[w].reruns)) ? W[0].reruns + W[1].reruns + W[2].reruns : null;
        if (r.forceRetry === 0) {
            hist.set(R, (hist.get(R) || 0) + 1);
            if (R > 6) fail.lb.push(`${tag} retries(0-2) ${R} > 6`);
            if (w2 === null) nv.lb.push(tag + ' window 2 null');
            else if (w2 > 1.0) fail.lb.push(`${tag} window 2 ${w2} > 1.0`);
            // S-A20 FR0 control (r6-report A3): 0 re-runs in windows 0-2 -> window 2 <= 0.01; else <= 524288 / N +
            // 16 x SUB x re-runs / N; null window 2 or unknown re-runs = a control miss (NO VERDICT, as r6-report)
            const bound = RR === null ? null : RR === 0 ? 0.01 : 524288 / r.n + 16 * r.sub * RR / r.n;
            if (bound === null || w2 === null || !(w2 <= bound)) nv.lb.push(`${tag} S-A20 FR0 control miss (window 2 ${w2}, re-runs(0-2) ${RR}, bound ${bound})`);
        } else if (r.forceRetry === 7) {
            if (!(w2 !== null && w2 > 1.0 && W[1].forced === 7)) nv.lb.push(`${tag} control did not fire (window 2 ${w2}, forced ${W[1].forced ?? null})`);
        }
    }
    info.push(`lb: FORCE_RETRY 0 runs ${fr0.length}, retries(0-2) histogram ${[...hist].sort((a, b) => a[0] - b[0]).map(([v, c]) => v + ':' + c).join(' ') || 'none'}; FORCE_RETRY 7 controls ${fr7.length}`);
    // ---- fences ----
    for (const [mode, n, s, k, warm] of FENCE_MODES) if (!good.some(([job, r]) => job.group === 'fence' && r.mode === mode && r.n === n && r.sub === s && r.k === k && r.warm === warm)) {
        for (const c of ['F1', 'F2', 'Fnull']) nv[c].push('fence state ' + mode + ' missing');
    }
    let fn = 0, f0 = 0;
    for (const [job, r] of good) {
        const F = r.fence, tag = `${r.mode} n${r.n} s${r.sub} fr${r.forceRetry} r${job.round}`;
        fn++;
        const g = (x) => (isObj(x) && Number.isInteger(x.gcs) ? x.gcs : null);
        if (g(F.F0) !== null && g(F.F0) >= 1) f0++;
        if (g(F.F1) === null) nv.F1.push(tag + ' F1 missing'); else if (!(g(F.F1) >= 1)) fail.F1.push(tag + ' F1 gcs ' + g(F.F1));
        if (g(F.F2) === null || !Array.isArray(F.F2.used) || !num(F.F2.used[0]) || !num(F.F2.bytes)) nv.F2.push(tag + ' F2 missing');
        else if (!(g(F.F2) >= 1 && F.F2.used[0] < F.F2.bytes)) fail.F2.push(`${tag} F2 gcs ${g(F.F2)} used ${F.F2.used[0]} / bytes ${F.F2.bytes}`);
        if (g(F.Fnull) === null) nv.Fnull.push(tag + ' Fnull missing'); else if (g(F.Fnull) !== 0) fail.Fnull.push(tag + ' Fnull gcs ' + g(F.Fnull));
    }
    if (fn === 0) for (const c of ['F1', 'F2', 'Fnull']) nv[c].push('no fence record');
    info.push(`fence: records ${fn}, F0 >= 1 GC ${f0}/${fn} (recorded only, E25)`);
    const verdict = Object.fromEntries(CONSTS.map((c) => [c, nv[c].length ? 'NO VERDICT' : fail[c].length ? 'FAIL' : 'PASS']));
    return { verdict, nv, fail, info, ctl, ctlF: ctlRecs.length ? ctlF : null, legLevel };
}

// ---- report -----------------------------------------------------------------------------------------------------
say(`ci-report ${DIR}  legs expected ${LEGS.length} found ${legs.size}  problems ${problems.length}`);
for (const p of problems) say('  PROBLEM ' + p + ' -> NO VERDICT');
let anyNv = problems.length > 0, anyFail = false;
const tally = Object.fromEntries(CONSTS.map((c) => [c, { PASS: 0, FAIL: 0, 'NO VERDICT': 0 }]));
const judged = new Map();
for (const key of LEGS) {
    if (!legs.has(key)) continue;
    let res;
    try { res = judge(key, legs.get(key).j); } catch (err) { // a malformed record the checks above missed: never a crash, never a PASS
        res = { verdict: Object.fromEntries(CONSTS.map((c) => [c, 'NO VERDICT'])), nv: Object.fromEntries(CONSTS.map((c) => [c, ['judge threw: ' + err.message]])), fail: Object.fromEntries(CONSTS.map((c) => [c, []])), info: [], ctl: {}, ctlF: null };
    }
    judged.set(key, res);
}
// S-A30 (Q-B83-LOTEETH (a)): the lo x 0.25 control is pooled per cell across the judged legs; a cell where no leg flags
// a box window has no teeth -> lo NO VERDICT on every leg that judged that cell. Each leg keeps its own lo PASS / FAIL.
// A leg with a leg-level NO VERDICT (node / platform / pointer compression / band sha) contributes nothing to the pool.
const pooled = new Map();
for (const res of judged.values()) if (!res.legLevel) for (const [cell, c] of Object.entries(res.ctl)) { const p = pooled.get(cell) || { legs: 0, flags: 0 }; p.legs++; p.flags += c; pooled.set(cell, p); }
for (const res of judged.values()) for (const cell of Object.keys(res.ctl)) {
    const p = pooled.get(cell) || { legs: 0, flags: 0 };
    if (p.flags < 1) { res.nv.lo.push(`${cell} pooled control lo x 0.25 flags 0 boxskip windows over ${p.legs} legs (no teeth)`); res.verdict.lo = 'NO VERDICT'; }
}
// A4 (#132 (a)): old and nlo must each read FAIL in >= 1 leg (the ctl cell), pooled across the legs without a leg-level
// NO VERDICT; a lane no leg flags FAILs ctl on every leg that judged it (its control has no teeth there).
const ctlPool = { old: { legs: 0, fail: 0 }, nlo: { legs: 0, fail: 0 } };
for (const res of judged.values()) if (!res.legLevel && res.ctlF) for (const lane of CTL_LANES) { ctlPool[lane].legs++; if (res.ctlF[lane] >= 1) ctlPool[lane].fail++; }
for (const res of judged.values()) if (res.ctlF) for (const lane of CTL_LANES) if (ctlPool[lane].fail < 1) {
    res.fail.ctl.push(`pooled control ${lane} read FAIL in 0 of ${ctlPool[lane].legs} legs (cell n1e5 s1e4): no teeth`);
    if (res.verdict.ctl === 'PASS') res.verdict.ctl = 'FAIL';
}
// run level: every leg measured the same src
const srcShas = new Set([...legs.values()].map(({ j }) => (isObj(j.src) ? j.src.sha256 : null)));
if (srcShas.size > 1) { say('  PROBLEM legs disagree on the src sha256: ' + [...srcShas].map((x) => String(x).slice(0, 8)).join(' ') + ' -> NO VERDICT'); anyNv = true; }
for (const key of LEGS) {
    if (!legs.has(key)) { say(`\n## ${key}: MISSING -> NO VERDICT`); for (const c of CONSTS) tally[c]['NO VERDICT']++; anyNv = true; continue; }
    const { path, j } = legs.get(key);
    const pr = j.provenance;
    const res = judged.get(key);
    say(`\n## ${key}  ${path}`);
    say(`  provenance node ${pr.node} v8 ${pr.v8} pointerCompression ${JSON.stringify(pr.pointerCompression ?? null)} ${pr.platform} ${pr.arch} cpus ${pr.cpus} load ${JSON.stringify(pr.loadavgStart ?? null)} -> ${JSON.stringify(pr.loadavgEnd ?? null)} busy node ${JSON.stringify(pr.busyNodeStart ?? null)} -> ${JSON.stringify(pr.busyNodeEnd ?? null)} jobs ${j.jobs.length} wall ${j.wallMs} ms`);
    for (const l of res.info) say('  ' + l);
    for (const c of CONSTS) {
        tally[c][res.verdict[c]]++;
        if (res.verdict[c] === 'NO VERDICT') anyNv = true; else if (res.verdict[c] === 'FAIL') anyFail = true;
        say(`  ${c.padEnd(5)} ${res.verdict[c]}`);
        for (const m of res.nv[c].slice(0, 6)) say('        no verdict: ' + m);
        for (const m of res.fail[c].slice(0, 6)) say('        fail: ' + m);
        if (res.nv[c].length > 6 || res.fail[c].length > 6) say(`        (${res.nv[c].length} no-verdict / ${res.fail[c].length} fail lines in total)`);
    }
}
say('\n## lo x 0.25 control pooled per cell (S-A30)');
for (const [cell, p] of [...pooled].sort()) say(`  ${cell}: boxskip windows flagged ${p.flags} over ${p.legs} legs ${p.flags >= 1 ? 'ok (fires)' : 'MISS (no teeth) -> lo NO VERDICT'}`);
say('\n## ctl old / nlo pooled (A4, #132 (a))');
for (const lane of CTL_LANES) say(`  ${lane}: legs reading FAIL ${ctlPool[lane].fail} of ${ctlPool[lane].legs} ${ctlPool[lane].fail >= 1 ? 'ok (fires)' : 'MISS (no teeth) -> ctl FAIL'}`);
say('\n## per constant over ' + LEGS.length + ' legs');
for (const c of CONSTS) say(`  ${c.padEnd(5)} PASS ${tally[c].PASS}  FAIL ${tally[c].FAIL}  NO VERDICT ${tally[c]['NO VERDICT']}`);
const code = anyNv ? 2 : anyFail ? 1 : 0;
say(`\nVERDICT ${code === 0 ? 'PASS' : code === 1 ? 'FAIL' : 'NO VERDICT'} (exit ${code})`);
process.exitCode = code;
