// test/final-trap.test.mjs -- G-FINAL (Q-F2a) rows for the lib/prologue.sh EXIT trap in the 5 built roots: an exit
// without FINAL=1 (a planned verdict sets it first) leaves as 2 NO-VERDICT, rc 0 included (a bash 3.2 `set -u` abort
// exits 0), and stays 2 with stderr closed.
// Oracle: .handoff/PLAN-b45-gfinal.md ASSERTIONS A1, A2, A3, A5 + addendum A1 (the stderr-closed row) -- never what a
// script printed. Expected values are hand-derived: the trap text, the census (bb 3 / ibd 2 / dd 2 / alloc 2 / ic 2
// command-position `exit 0` sites) and the raw `grep -c 'exit 0'` line counts (12 / 15 / 18 / 11 / 5).
// Teeth: every A1 / A2 / stderr-closed row has a must-fail twin = the same mutant of a copy of the live root with the
// literal pre-G-FINAL trap line put back (exact-once, count-checked); the twin must turn the row's check red. The A3
// scanner has exact-once mutants that must add exactly the violation they name.
// b70 G-SIG-1 (PLAN-b67-gsig.md TASK 5, ASSERTIONS A4 / A5): the trap now stays silent only when $DIED is set (die, the
// -h exit), not on any rc 2: NEW_TRAP is that line; the A4 row injects a non-die rc-2 abort (must print), the A5 row a
// signal after FINAL=1 (the planned rc 1 stands). Their twin = the live copy with the 465881b trap line put back and the
// shared signal trap unarmed (the sig_arm call dropped): the 465881b behaviour at the anchor (B66_TRAP).
// TIER: DETERMINISTIC (no V8 spawn: a logging fake node first on PATH must stay unused; no timed assertion).
// Every copy lives in one private mkdtemp dir, removed in after(). Every spawn is capSync, never inside assert.throws.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { capSync } from './spawn-cap.mjs';

// Every row is synchronous spawnSync, which buffers each report until the event loop turns: a file death then shows
// 0 subtests. Yield once BEFORE each test so the previous test's report flushes (test/death-signature.test.mjs hook row).
beforeEach(() => new Promise((r) => setImmediate(r)));

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const skip = process.platform === 'win32' ? 'bash scripts: POSIX hosts only' : false;
const GITVARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'];
// /bin/bash 3.2 probe (the skip32 spelling of test/deopt-diff-stage-boundary.test.mjs section 9)
const bv = existsSync('/bin/bash') ? capSync('/bin/bash', ['--version'], { encoding: 'utf8' }, 30000, '/bin/bash --version') : { status: null, stdout: '' };
const skip32 = skip || (bv.status === 0 && /version 3\.2\./.test(bv.stdout) ? false : '/bin/bash is not bash 3.2 on this host');
const hb = skip ? { stdout: '' } : capSync('bash', ['-c', 'printf %s "$BASH_VERSION"'], { encoding: 'utf8' }, 30000, 'bash version');
const HOST32 = /^3\.2\./.test(hb.stdout);

// tool -> [census of command-position `exit 0` sites, raw `grep -c 'exit 0'` lines, raw lines by context
// {comment, quoted, heredoc, code}] (hand-derived from the B0 census; bb raw 15 = the Q-ENV check label, review r1;
// dd raw 19 = G2's R6 e2e self-test check title "... -> exit 0 SAME ...", b61)
const TOOLS = {
    'allocation-diff': [2, 12, { comment: 3, quoted: 4, heredoc: 3, code: 2 }],
    'bytecode-budget': [3, 15, { comment: 4, quoted: 8, heredoc: 0, code: 3 }],
    'deopt-diff': [2, 19, { comment: 4, quoted: 12, heredoc: 1, code: 2 }],
    'ic-diff': [2, 11, { comment: 2, quoted: 7, heredoc: 0, code: 2 }],
    'inlining-budget-diff': [2, 5, { comment: 1, quoted: 2, heredoc: 0, code: 2 }],
};
// the G-SIG-1 trap line (b70), the 465881b one (G-FINAL, silent on any rc 2) and the literal pre-G-FINAL one (each root
// carries its own name for @SCRIPT@)
const NEW_TRAP = (t) => String.raw`trap 'rc=$?; if [[ -z $FINAL ]]; then set +e; [[ -n $DIED ]] || printf "` + t +
    String.raw`: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT` + '\n';
const B66_TRAP = (t) => String.raw`trap 'rc=$?; if [[ -z $FINAL ]]; then set +e; [[ $rc -eq 2 ]] || printf "` + t +
    String.raw`: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT` + '\n';
const OLD_TRAP = (t) => String.raw`trap 'rc=$?; if [[ -z $FINAL && $rc -ne 0 && $rc -ne 2 ]]; then printf "` + t +
    String.raw`: unexpected error (exit %s)\nVERDICT NO-VERDICT\n" "$rc" >&2; exit 2; fi' EXIT` + '\n';
const SIGARM = '\nsig_arm\nREPORT=""';   // the shared signal trap's arming call (lib/prologue.sh), once per root
const ANCHOR = 'export LC_ALL=C   # byte-wise sort / awk: stable multisets, emoji stripped as bytes\n';
const INJ = {   // the injected line, right after ANCHOR
    exit0: 'exit 0\n',                                        // A1: a planned-looking exit 0 with no FINAL
    unset: 'fu() { [[ -n $G_FINAL_UNSET ]]; }; fu\n',         // A2: a set -u abort (bash 3.2 exits 0 here)
    fail: 'false\n',                                          // stderr-closed row: a set -e failure (rc 1)
    rc2: 'sh -c "exit 2"\n',                                  // A4 (b70): a set -e abort with rc 2 that is not a die
    fsig: 'FINAL=1; kill -TERM $$; exit 1\n',                 // A5 (b70): a signal after the planned verdict
};

const DIR = realpathSync(mkdtempSync(join(tmpdir(), 'ft-root-')));
after(() => rmSync(DIR, { recursive: true, force: true }));
function cleanEnv(extra = {}) {   // no GIT_* location var, no editor, no NODE_* tool input, no G_FINAL_UNSET
    const e = { ...process.env };
    for (const k of [...GITVARS, 'GIT_EDITOR', 'EDITOR', 'VISUAL', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'NODE_REDIRECT_WARNINGS', 'G_FINAL_UNSET', 'FINAL']) delete e[k];
    e.NODE_V8_COVERAGE = undefined;   // node re-adds a deleted NODE_V8_COVERAGE to a child env; undefined strips it
    return { ...e, ...extra };
}
function once(src, from, to, what) {   // an exact-once, count-checked edit
    const n = src.split(from).length - 1;
    assert.equal(n, 1, `${what}: anchor must match exactly once, matched ${n}`);
    return src.replace(from, () => to);
}
const live = (t) => readFileSync(join(PKG, `${t}.sh`), 'utf8');
// a copy of root t: inj injected after ANCHOR; old = true: the literal pre-G-FINAL trap line put back (the twin);
// old = 'b66': the 465881b trap line put back and the sig_arm call dropped (the A4 / A5 twin)
const made = new Map();
function mutant(t, inj, old) {
    const key = `${t}.${inj}.${old === 'b66' ? 'b66' : old ? 'old' : 'new'}`;
    if (made.has(key)) return made.get(key);
    let src = once(live(t), ANCHOR, ANCHOR + INJ[inj], `${t} ${inj}`);
    if (old === 'b66') src = once(once(src, NEW_TRAP(t), B66_TRAP(t), `${t} b66 trap`), SIGARM, '\nREPORT=""', `${t} sig_arm`);
    else if (old) src = once(src, NEW_TRAP(t), OLD_TRAP(t), `${t} old trap`);
    const p = join(DIR, 'm', `${key}.sh`);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, src); chmodSync(p, 0o755);
    const line = live(t).slice(0, live(t).indexOf(ANCHOR)).split('\n').length + 1;   // the injected line's number
    const m = { p, line };
    made.set(key, m);
    return m;
}
// one case dir: a logging fake node first on PATH (must stay unused), a private TMPDIR and cwd
function mkCase() {
    const d = mkdtempSync(join(DIR, 'c-'));
    const bin = join(d, 'bin'), log = join(d, 'node.log');
    mkdirSync(bin); mkdirSync(join(d, 'tmp')); mkdirSync(join(d, 'cwd'));
    writeFileSync(join(bin, 'node'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\nexit 0\n`);
    chmodSync(join(bin, 'node'), 0o755);
    return { d, bin, tmp: join(d, 'tmp'), cwd: join(d, 'cwd'), spawns: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0) };
}
// bash = 'bash' (the host's) or '/bin/bash'; closed = run with stderr closed (2>&-, through an exec wrapper)
function run(c, bash, script, closed = false) {
    const args = closed ? ['-c', 'exec "$0" "$1" --self-test 2>&-', bash, script] : [script, '--self-test'];
    return capSync(closed ? '/bin/sh' : bash, args, { encoding: 'utf8', cwd: c.cwd, env: cleanEnv({ PATH: c.bin + ':' + process.env.PATH, TMPDIR: c.tmp }) }, 30000, `final-trap ${script}`);
}
const msg = (r) => `rc=${r.status} signal=${r.signal}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
const UNEXP = (t, rc) => `${t}: unexpected error (exit ${rc})\nVERDICT NO-VERDICT\n`;

// ---- the checks (each takes a finished run; a twin asserts the check is red on its run) ----
function checkA1(t, c, r) {
    assert.equal(r.status, 2, msg(r));
    assert.equal(r.stdout, '', msg(r));
    assert.equal(r.stderr, UNEXP(t, 0), msg(r));
    assert.equal(c.spawns(), 0, 'a node spawn');
}
function checkA2(t, m, c, r) {   // bash 3.2: the unbound-variable line, then the trap's (exit 0) message
    assert.equal(r.status, 2, msg(r));
    assert.equal(r.stdout, '', msg(r));
    assert.equal(r.stderr, `${m.p}: line ${m.line}: G_FINAL_UNSET: unbound variable\n` + UNEXP(t, 0), msg(r));
    assert.equal(c.spawns(), 0, 'a node spawn');
}
function checkHost(t, c, r) {   // any bash: rc 2 and the trap's message (exit <n>)
    assert.equal(r.status, 2, msg(r));
    assert.equal(r.stdout, '', msg(r));
    assert.match(r.stderr, new RegExp(`^${t}: unexpected error \\(exit \\d+\\)\\nVERDICT NO-VERDICT\\n$`, 'm'), msg(r));
    assert.equal(c.spawns(), 0, 'a node spawn');
}
function checkA4(t, c, r) {   // b70 A4: a non-die rc-2 abort is an unexpected error, never a silent 2
    assert.equal(r.status, 2, msg(r));
    assert.equal(r.stdout, '', msg(r));
    assert.equal(r.stderr, UNEXP(t, 2), msg(r));
    assert.equal(c.spawns(), 0, 'a node spawn');
}
function checkA5(c, r) {   // b70 A5: a signal after FINAL=1 changes nothing: the planned rc 1, no interrupted line
    assert.equal(r.signal, null, msg(r));
    assert.equal(r.status, 1, msg(r));
    assert.equal(r.stdout, '', msg(r));
    assert.doesNotMatch(r.stderr, /interrupted/, msg(r));
    assert.doesNotMatch(r.stderr, /VERDICT/, msg(r));
    assert.equal(c.spawns(), 0, 'a node spawn');
}
function checkClosed(c, r) {   // stderr closed: nothing can be printed; the exit code alone says NO-VERDICT
    assert.equal(r.status, 2, msg(r));
    assert.equal(r.stdout, '', msg(r));
    assert.equal(c.spawns(), 0, 'a node spawn');
}

for (const t of Object.keys(TOOLS)) {
    test(`A0 ${t}: the root carries the G-FINAL trap line exactly once (the twins' anchor) and not the pre-G-FINAL one`, { skip }, () => {
        const src = live(t);
        assert.equal(src.split(NEW_TRAP(t)).length - 1, 1, 'G-SIG-1 trap line');
        assert.equal(src.split(B66_TRAP(t)).length - 1, 0, '465881b trap line');
        assert.equal(src.split(OLD_TRAP(t)).length - 1, 0, 'pre-G-FINAL trap line');
        assert.equal(src.split(SIGARM).length - 1, 1, 'sig_arm call (the A4 / A5 twin anchor)');
        assert.equal(src.split(ANCHOR).length - 1, 1, 'LC_ALL anchor');
    });

    // ---- A1 (every host) ----
    test(`A1 ${t}: an injected exit 0 with no FINAL -> rc 2, empty stdout, stderr exactly "${t}: unexpected error (exit 0)" + NO-VERDICT, 0 node spawns`, { skip }, () => {
        const c = mkCase();
        checkA1(t, c, run(c, 'bash', mutant(t, 'exit0').p));
    });
    test(`A1 twin ${t}: the same mutant with the pre-G-FINAL trap line -> rc 0 and the A1 check is red`, { skip }, () => {
        const c = mkCase();
        const r = run(c, 'bash', mutant(t, 'exit0', true).p);
        assert.equal(r.status, 0, msg(r));
        assert.throws(() => checkA1(t, c, r), assert.AssertionError);
    });

    // ---- A4 / A5 (b70 G-SIG-1, every host) ----
    test(`G-SIG A4 ${t}: an injected rc-2 abort that is not a die (sh -c "exit 2") -> rc 2, empty stdout, stderr exactly "${t}: unexpected error (exit 2)" + NO-VERDICT, 0 spawns`, { skip }, () => {
        const c = mkCase();
        checkA4(t, c, run(c, 'bash', mutant(t, 'rc2').p));
    });
    test(`G-SIG A4 twin ${t}: the 465881b trap (silent on any rc 2) -> rc 2 with empty stderr and the A4 check is red`, { skip }, () => {
        const c = mkCase();
        const r = run(c, 'bash', mutant(t, 'rc2', 'b66').p);
        assert.equal(r.status, 2, msg(r));
        assert.equal(r.stderr, '', msg(r));
        assert.throws(() => checkA4(t, c, r), assert.AssertionError);
    });
    test(`G-SIG A5 ${t}: FINAL=1; kill -TERM $$; exit 1 -> rc 1 (not a signal end), no "interrupted", no VERDICT line, 0 spawns`, { skip }, () => {
        const c = mkCase();
        checkA5(c, run(c, 'bash', mutant(t, 'fsig').p));
    });
    test(`G-SIG A5 twin ${t}: no shared signal trap (465881b) -> the run ends by SIGTERM and the A5 check is red`, { skip }, () => {
        const c = mkCase();
        const r = run(c, 'bash', mutant(t, 'fsig', 'b66').p);
        assert.equal(r.signal, 'SIGTERM', msg(r));
        assert.throws(() => checkA5(c, r), assert.AssertionError);
    });

    // ---- A2 (bash 3.2 lane + an always-run host-bash row) ----
    test(`A2 ${t} /bin/bash 3.2: a set -u abort in a function -> rc 2, the unbound-variable line + "(exit 0)" + NO-VERDICT, 0 spawns`, { skip: skip32 }, () => {
        const c = mkCase(), m = mutant(t, 'unset');
        checkA2(t, m, c, run(c, '/bin/bash', m.p));
    });
    test(`A2 twin ${t} /bin/bash 3.2: the pre-G-FINAL trap -> rc 0 (FINDING 2) and the A2 check is red`, { skip: skip32 }, () => {
        const c = mkCase(), m = mutant(t, 'unset', true);
        const r = run(c, '/bin/bash', m.p);
        assert.equal(r.status, 0, msg(r));
        assert.throws(() => checkA2(t, m, c, r), assert.AssertionError);
    });
    test(`A2 host ${t}: the same mutant on the host bash -> rc 2, stderr "${t}: unexpected error (exit <n>)" + NO-VERDICT`, { skip }, (tt) => {
        const c = mkCase();
        const r = run(c, 'bash', mutant(t, 'unset').p);
        tt.diagnostic(`host bash ${hb.stdout}: rc=${r.status} stderr=${JSON.stringify(r.stderr)}${HOST32 ? '' : ' (not 3.2: no teeth vs the pre-G-FINAL trap here)'}`);
        checkHost(t, c, r);
    });

    // ---- stderr closed (addendum A1): a set -e failure must not fall back to rc 1 when the trap's printf fails ----
    test(`A1 stderr-closed ${t}: an injected set -e failure (false) with 2>&- -> rc 2, empty stdout, 0 spawns`, { skip }, () => {
        const c = mkCase();
        checkClosed(c, run(c, 'bash', mutant(t, 'fail').p, true));
    });
    test(`A1 stderr-closed twin ${t}: the pre-G-FINAL trap with 2>&- -> rc 1 (fail-open to DIFF) and the check is red`, { skip }, () => {
        const c = mkCase();
        const r = run(c, 'bash', mutant(t, 'fail', true).p, true);
        assert.equal(r.status, 1, msg(r));
        assert.throws(() => checkClosed(c, r), assert.AssertionError);
    });
    test(`A1 stderr-closed ${t}: an injected exit 0 with 2>&- -> rc 2 (pre-G-FINAL trap: rc 0)`, { skip }, () => {
        const c = mkCase();
        const r = run(c, 'bash', mutant(t, 'exit0').p, true);
        checkClosed(c, r);
        const c2 = mkCase();
        const r2 = run(c2, 'bash', mutant(t, 'exit0', true).p, true);
        assert.equal(r2.status, 0, msg(r2));
        assert.throws(() => checkClosed(c2, r2), assert.AssertionError);
    });
}

// =====================================================================================================================
// A3 lint: a bash context scanner (code / subshell / comment / quoted / heredoc body, per byte) over each root
// =====================================================================================================================
// ctx per char: 'c' main-shell code, 's' subshell code ($( ), ( ), backquotes), '#' comment, 'q' quoted text or ${ },
// 'h' heredoc body (the terminator line included)
function scan(src) {
    const n = src.length, ctx = new Array(n), st = [], pend = [];
    let i = 0;
    const inSub = () => st.some((s) => s === 'sub' || s === 'par' || s === 'bq');
    const cc = () => (inSub() ? 's' : 'c');
    while (i < n) {
        const ch = src[i], t = st[st.length - 1];
        if (t === 'dq' || t === 'brace') {
            if (ch === '\\' && t === 'dq') { ctx[i] = ctx[i + 1] = 'q'; i += 2; continue; }
            if ((ch === '"' && t === 'dq') || (ch === '}' && t === 'brace')) { ctx[i] = 'q'; st.pop(); i++; continue; }
            if (ch === '"') { ctx[i] = 'q'; st.push('dq'); i++; continue; }
            if (ch === "'" && t === 'brace') { const j = src.indexOf("'", i + 1); for (let k = i; k <= j; k++) ctx[k] = 'q'; i = j + 1; continue; }
            if (ch === '$' && (src[i + 1] === '(' || src[i + 1] === '{')) { ctx[i] = ctx[i + 1] = 'q'; st.push(src[i + 1] === '(' ? 'sub' : 'brace'); i += 2; continue; }
            if (ch === '`' && t === 'dq') { ctx[i] = 'q'; st.push('bq'); i++; continue; }
            ctx[i] = 'q'; i++; continue;
        }
        if (ch === '\n') {
            ctx[i] = cc(); i++;
            while (pend.length) {   // heredoc bodies start after this newline
                const { word, strip } = pend.shift();
                for (;;) {
                    const e = src.indexOf('\n', i), end = e < 0 ? n : e;
                    const line = src.slice(i, end);
                    for (let k = i; k <= Math.min(end, n - 1); k++) ctx[k] = 'h';
                    i = end + 1;
                    if ((strip ? line.replace(/^\t+/, '') : line) === word || e < 0) break;
                }
            }
            continue;
        }
        if (ch === '\\') { ctx[i] = cc(); if (i + 1 < n) ctx[i + 1] = cc(); i += 2; continue; }
        if (ch === "'") { const j = src.indexOf("'", i + 1); for (let k = i; k <= j; k++) ctx[k] = 'q'; i = j + 1; continue; }
        if (ch === '$' && src[i + 1] === "'") {   // $'...': backslash escapes
            let k = i + 2; ctx[i] = ctx[i + 1] = 'q';
            while (k < n && src[k] !== "'") { if (src[k] === '\\') ctx[k++] = 'q'; ctx[k++] = 'q'; }
            ctx[k] = 'q'; i = k + 1; continue;
        }
        if (ch === '"') { ctx[i] = 'q'; st.push('dq'); i++; continue; }
        if (ch === '$' && src[i + 1] === '{') { ctx[i] = ctx[i + 1] = 'q'; st.push('brace'); i += 2; continue; }
        if (ch === '$' && src[i + 1] === '(') { ctx[i] = ctx[i + 1] = cc(); st.push('sub'); i += 2; continue; }
        if (ch === '`') { ctx[i] = cc(); if (t === 'bq') st.pop(); else st.push('bq'); i++; continue; }
        if (ch === '(') { ctx[i] = cc(); st.push('par'); i++; continue; }
        if (ch === ')') { ctx[i] = cc(); if (t === 'sub' || t === 'par') st.pop(); i++; continue; }   // a case pattern ) pops nothing
        if (ch === '#' && (i === 0 || /[\s;&|()]/.test(src[i - 1]))) {
            const e = src.indexOf('\n', i), end = e < 0 ? n : e;
            for (let k = i; k < end; k++) ctx[k] = '#';
            i = end; continue;
        }
        if (ch === '<' && src[i + 1] === '<' && src[i + 2] !== '<' && (i === 0 || src[i - 1] !== '<')) {
            const m = /^<<(-?)[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(src.slice(i, i + 80));
            if (m) { pend.push({ word: m[3], strip: m[1] === '-' }); for (let k = i; k < i + m[0].length; k++) ctx[k] = cc(); i += m[0].length; continue; }
        }
        ctx[i] = cc(); i++;
    }
    return { ctx, open: st.length };
}
const CLASS = { c: 'code', s: 'code', '#': 'comment', q: 'quoted', h: 'heredoc' };
// the lint: census = main-shell command-position `exit 0` sites; violations = such a site with no `FINAL=1;` earlier
// on its line (code bytes only) and a line before that is not `FINAL=1`, plus every main-shell bare `exit` / `exit "$v"`
function lint(src) {
    const { ctx, open } = scan(src);
    const lines = src.split('\n');
    const sites = [], violations = [];
    const re = /(?<![A-Za-z0-9_\-.$/])exit(?![A-Za-z0-9_-])/g;
    let m;
    while ((m = re.exec(src))) {
        const p = m.index;
        if (ctx[p] !== 'c') continue;
        const ls = src.lastIndexOf('\n', p - 1) + 1, le = src.indexOf('\n', p), ln = src.slice(0, p).split('\n').length;
        let before = '';
        for (let k = ls; k < p; k++) before += ctx[k] === 'c' ? src[k] : ' ';
        before = before.replace(/\s+$/, '');
        if (!(before === '' || /[;&|{()!]$/.test(before) || /(^|[\s;&|{()])(then|else|do|elif)$/.test(before))) continue;
        const rest = src.slice(p + 4, le < 0 ? undefined : le);
        const a = /^[ \t]*(\d+\b|"[^"]*"|\$\w+|\$\{[^}]*\})?/.exec(rest)[1];
        const arg = a === undefined ? (/^[ \t]*($|[;&|)}])/.test(rest) ? 'bare' : 'other') : /^\d+$/.test(a) ? a : 'var';
        if (arg === 'bare' || arg === 'var' || arg === 'other') { violations.push(`line ${ln}: main-shell exit with arg ${arg}: ${lines[ln - 1]}`); continue; }
        if (arg !== '0') continue;
        sites.push(ln);
        if (!/(^|[\s;&|{()])FINAL=1;/.test(before) && !/^\s*FINAL=1$/.test(lines[ln - 2] || '')) violations.push(`line ${ln}: exit 0 without FINAL=1: ${lines[ln - 1]}`);
    }
    // every raw `exit 0` line, classed by the context of its occurrences (one class per line, else 'mixed')
    const raw = { comment: 0, quoted: 0, heredoc: 0, code: 0, mixed: 0 };
    let rawLines = 0, off = 0;
    for (const l of lines) {
        const cls = new Set();
        for (let j = l.indexOf('exit 0'); j >= 0; j = l.indexOf('exit 0', j + 1)) cls.add(CLASS[ctx[off + j]]);
        if (cls.size) { rawLines++; raw[cls.size === 1 ? [...cls][0] : 'mixed']++; }
        off += l.length + 1;
    }
    return { sites, violations, raw, rawLines, open };
}
const LAST = /^(FINAL=1; )?case "\$VERDICT" in [A-Z|]+\) exit 0 ;; [A-Z|]+\) exit 1 ;; \*\) exit 2 ;; esac$/;

for (const [t, [census, rawN, byCtx]] of Object.entries(TOOLS)) {
    test(`A3 ${t}: ${census} main-shell exit 0 sites, each FINAL=1 first; 0 violations; raw grep ${rawN} lines = ${JSON.stringify(byCtx)}; last line = the verdict case`, () => {
        const src = live(t), L = lint(src);
        assert.equal(L.open, 0, 'the scanner ended inside a quote / substitution');
        assert.deepEqual(L.violations, []);
        assert.equal(L.sites.length, census, `sites at lines ${L.sites.join(',')}`);
        assert.equal(L.rawLines, rawN, 'raw grep -c "exit 0"');
        assert.deepEqual(L.raw, { ...byCtx, mixed: 0 });
        assert.equal(L.raw.code, census, 'code lines = census (one site per code line)');
        assert.ok(src.endsWith('\n'), 'the root ends in a newline');
        const ls = src.split('\n');
        assert.match(ls[ls.length - 2], LAST, 'the last line is the verdict case');
    });
    test(`A3 must-fail ${t}: FINAL=1 dropped from the self-test pass branch -> exactly 1 violation`, () => {
        const L = lint(once(live(t), 'then FINAL=1; exit 0;', 'then exit 0;', `${t} self-test pass`));
        assert.equal(L.violations.length, 1, L.violations.join('\n'));
        assert.match(L.violations[0], /exit 0 without FINAL=1: .*if self_test; then exit 0;/);
    });
    test(`A3 must-fail ${t}: the A1 injection (exit 0), a bare exit and exit "$v" at the LC_ALL anchor -> 1 violation each`, () => {
        for (const [inj, rx] of [['exit 0\n', /exit 0 without FINAL=1: exit 0$/], ['exit\n', /exit with arg bare: exit$/], ['exit "$v"\n', /exit with arg var: exit "\$v"$/]]) {
            const L = lint(once(live(t), ANCHOR, ANCHOR + inj, `${t} inject`));
            assert.equal(L.violations.length, 1, `${JSON.stringify(inj)}: ${L.violations.join('\n')}`);
            assert.match(L.violations[0], rx);
        }
    });
}
test('A3 must-fail bytecode-budget: the standalone FINAL=1 line before the report-mode verdict case deleted -> exactly 1 violation', () => {
    const L = lint(once(live('bytecode-budget'), '\nFINAL=1\ncase "$VERDICT" in WITHIN', '\ncase "$VERDICT" in WITHIN', 'bb standalone FINAL=1'));
    assert.equal(L.violations.length, 1, L.violations.join('\n'));
    assert.match(L.violations[0], /exit 0 without FINAL=1: case "\$VERDICT" in WITHIN/);
});
test('A3 scanner control: the alloc FAKE_NODE heredoc exit 0 lines are heredoc, a quoted fake-node exit 0 is quoted', () => {
    const src = live('allocation-diff'), { ctx } = scan(src);
    const at = (needle) => { const p = src.indexOf(needle); assert.ok(p >= 0, needle); assert.equal(src.indexOf(needle, p + 1), -1, `${needle} twice`); return ctx[p + needle.indexOf('exit 0')]; };
    assert.equal(at('\nexit 0\n'), 'h');
    assert.equal(at('\n  exit 0 ;; esac\n'), 'h');
    assert.equal(at('cat >/dev/null; exit 0 ;; esac'), 'q');
});

// =====================================================================================================================
// A5: 20 cycles of the A1 / A2 mutants over every root: 0 node spawns, 0 entries left in a private TMPDIR / cwd
// =====================================================================================================================
test('A5: 20 cycles x 5 roots x (A1 exit 0, A2 unset) -> every run rc 2, 0 node spawns, TMPDIR and cwd stay empty', { skip }, () => {
    const c = mkCase();
    let runs = 0;
    for (let k = 0; k < 20; k++) {
        for (const t of Object.keys(TOOLS)) {
            for (const inj of ['exit0', 'unset']) {
                const r = run(c, 'bash', mutant(t, inj).p);
                assert.equal(r.status, 2, `cycle ${k} ${t} ${inj}: ${msg(r)}`);
                runs++;
            }
        }
    }
    assert.equal(runs, 200);
    assert.equal(c.spawns(), 0, 'a node spawn');
    assert.deepEqual(readdirSync(c.tmp), [], 'TMPDIR entries left');
    assert.deepEqual(readdirSync(c.cwd), [], 'cwd entries left');
});
