// spawn-spy.mjs -- b86 G2 H1 (SPEC 4.G2 TASK 8 ZERO-SPAWN MECHANISM). Used as `node --import <this file URL> TOOL ...`.
// At preload it appends one JSON line {pid, ppid, child, execArgv, argv} (argv = process.argv.slice(2)) to the file named by $APO_SPY. execArgv is inherited
// by a re-spawned child, so every child records itself too: "0 spawns" = exactly 1 line.
// APO_SPY_DROP=<api> sets v8[api] = undefined on the default node:v8 export and exits 3 if it is still a function.
import { appendFileSync } from 'node:fs';
import v8 from 'node:v8';

const file = process.env.APO_SPY;
if (typeof file === 'string' && file !== '') {
    appendFileSync(file, JSON.stringify({
        pid: process.pid,
        ppid: process.ppid,
        child: process.env.ALLOC_PER_OP_CHILD ?? null,
        execArgv: process.execArgv.slice(),
        argv: process.argv.slice(2),
    }) + '\n');
}
// APO_SPY_CHILD=<SIGKILL|exit code>: acts only in the re-spawned child (ALLOC_PER_OP_CHILD=1), at preload, before the tool loads
const act = process.env.APO_SPY_CHILD;
if (typeof act === 'string' && act !== '' && !/^(SIGKILL|[0-9]+)$/.test(act)) {
    process.stderr.write('spawn-spy: APO_SPY_CHILD must be SIGKILL or digits, got ' + JSON.stringify(act) + '\n');
    process.exit(3);   // fail closed: an unknown action is never ignored
}
if (typeof act === 'string' && act !== '' && process.env.ALLOC_PER_OP_CHILD === '1') {
    if (act === 'SIGKILL') process.kill(process.pid, 'SIGKILL');
    else process.exit(Number(act));
}
const drop = process.env.APO_SPY_DROP;
if (typeof drop === 'string' && drop !== '') {
    try { v8[drop] = undefined; } catch { /* checked below */ }
    if (typeof v8[drop] === 'function') {
        process.stderr.write('spawn-spy: could not drop v8.' + drop + '\n');
        process.exit(3);
    }
}
// APO_SPY_SCMISS=1: acts only in the re-spawned child (ALLOC_PER_OP_CHILD=1): wraps v8.getHeapSpaceStatistics on the default
// node:v8 export so every entry's space_used_size reads 0 (names unchanged; preflight's SPACES check still passes), which makes
// selfCheck's positive control miss. Anything but '1' or unset exits 3 (fail closed, as APO_SPY_CHILD).
const scm = process.env.APO_SPY_SCMISS;
if (scm !== undefined && scm !== '1') {
    process.stderr.write('spawn-spy: APO_SPY_SCMISS must be 1, got ' + JSON.stringify(scm) + '\n');
    process.exit(3);
}
if (scm === '1' && process.env.ALLOC_PER_OP_CHILD === '1') {
    const real = v8.getHeapSpaceStatistics;
    v8.getHeapSpaceStatistics = function () {
        const a = real.call(v8);
        for (let i = 0; i < a.length; i++) a[i] = { ...a[i], space_used_size: 0 };
        return a;
    };
}
