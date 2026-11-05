// test/nul-awk.mjs -- the host-awk NUL probe and the BSD-NUL PATH shim for the NUL mutant rows (b37 maintainer ruling,
// 2026-11-05, "NUL mutants": "Probe the host awk; if it is NUL-clean, run those mutant rows with a PATH shim awk that
// cuts each record at the first NUL (BSD behaviour), so the kill stays live on every CI leg. Probe + shim are pinned by
// their own row."). The tools pipe trace text through `tr '\000' '?'` before awk because BSD awk (macOS) cuts a record
// at a NUL; gawk / mawk (Linux) keep the NUL, so a mutant that drops the tr stage is unobservable there. The shim gives
// the mutant rows the BSD record semantics on any host.
//
// probeAwk(env)            -> { awk, len, nulClean }: the first `awk` on env.PATH reads 'a<NUL>b\n'; length($0) 3 =
//                             NUL-clean, 1 = truncating; anything else throws (fail closed: no guess).
// buildNulCutAwk(dir, env) -> { dir, awk, real, perl }: writes DIR/awk, a perl script that cuts each STDIN record
//                             (a '\n'-terminated line) at its first NUL (the NUL and the rest of that line dropped, the
//                             '\n' kept) and feeds the result to the REAL awk: the first `awk` on env.PATH with DIR
//                             removed, resolved to an absolute path when the shim is written (never the shim itself).
//                             argv passes through unchanged (program, -v, -f, -F, file operands: one exec, no parsing);
//                             the exit status is the real awk's (a signal-killed awk -> 128 + signal, as bash reports).
//                             LIMIT: only stdin is cut; a file operand reaches the real awk as is (every NUL path the
//                             mutant rows exercise is a stdin pipe: `... | tr | awk "$KEEP_AWK"` / `awk "$GC_AWK"`).
//                             Stdin is pumped by the shim, so an awk that never reads it (BEGIN-only, file operands)
//                             still exits: the pump stops when awk exits, and stdin bytes it had read are dropped.
// buildNulCleanAwk(dir, env) -> the same shape: DIR/awk EMULATES a NUL-clean awk on a truncating host (each stdin NUL
//                             mapped to byte 0xFF before the real awk, every 0xFF of its stdout mapped back to NUL).
//                             Test-only: it lets a macOS run pin the probe's NUL-clean branch and the shim on top of a
//                             NUL-clean awk (the Linux case). A real 0xFF byte in the input would read as a NUL.
// Needs perl (Essential on Debian / Ubuntu as perl-base; /usr/bin/perl on macOS); absent -> throws (fail closed).
// nulTmpDir(prefix)        -> a fresh mkdtemp dir under os.tmpdir() (the shim dir of a test file), removed on 'exit' AND
//                             on SIGINT / SIGTERM (b39 NL: 'exit' never fires on a default-action signal, so a killed test
//                             process leaked one dd-nul-* / ad-nul-* dir). On the signal: its own signal listeners come off
//                             first (so the re-raise cannot loop back into this handler; any OTHER SIGINT / SIGTERM listener
//                             would see the signal twice and decide the exit -- none exists today), the dir is removed (rm
//                             force: idempotent; a failed rm still re-raises), then the SAME signal is re-raised at this
//                             process, so it still dies by that signal (status null, signal SIGINT / SIGTERM, as with no
//                             listener at all).
//                             LIMIT: the handler runs only when the process next yields to the event loop (after every
//                             spawnSync in the current synchronous turn; under node --test the runner may exit first and the
//                             file runs on until then); SIGKILL is never cleaned.
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync, realpathSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NUL_SIGNALS = ['SIGINT', 'SIGTERM'];
export function nulTmpDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    const rm = () => rmSync(dir, { recursive: true, force: true });
    const onSignal = (sig) => {
        for (const s of NUL_SIGNALS) process.removeListener(s, onSignal);
        process.removeListener('exit', rm);
        try { rm(); } catch { /* the re-raise below must still happen */ }
        process.kill(process.pid, sig);
    };
    process.on('exit', rm);
    for (const s of NUL_SIGNALS) process.on(s, onSignal);
    return dir;
}

// the absolute path of the FILE `name` on pathVar (bash `type -P`: never a function, alias or builtin), or ''
export function whichOn(name, pathVar, env = process.env) {
    const r = spawnSync('bash', ['-c', 'type -P -- "$1" || true', 'which', name],
        { encoding: 'utf8', env: { ...env, PATH: pathVar ?? '' }, timeout: 30000 });
    if (r.status !== 0) throw new Error(`nul-awk: cannot run bash to resolve ${name}: ${r.stderr || r.error}`);
    const p = r.stdout.trim();
    return p.startsWith('/') ? p : '';
}

export function probeAwk(env = process.env) {
    const awk = whichOn('awk', env.PATH, env);
    if (!awk) throw new Error(`nul-awk probe: no awk on PATH (${env.PATH})`);
    const r = spawnSync(awk, ['{ print length($0) }'], { input: Buffer.from('a\0b\n', 'latin1'), env, timeout: 30000 });
    const out = r.stdout ? r.stdout.toString('latin1') : '';
    if (r.status !== 0 || (out !== '3\n' && out !== '1\n')) {
        throw new Error(`nul-awk probe: ${awk} on 'a<NUL>b' exited ${r.status} printing ${JSON.stringify(out)} (want "3" or "1")`);
    }
    return { awk, len: out === '3\n' ? 3 : 1, nulClean: out === '3\n' };
}

// a path embedded in a perl single-quoted literal and in a #! line: plain bytes only, fail closed otherwise
function safePath(p, what) {
    if (!/^\/[A-Za-z0-9._\/+@:-]*$/.test(p)) throw new Error(`nul-awk: ${what} path ${JSON.stringify(p)} is not plain (no quote, space or backslash)`);
    return p;
}

// the perl pump shared by the shim (cut) and the emulator (map): fork the real awk with stdin = a pipe the parent
// fills from its own STDIN; select() with a SIGCHLD wake-up stops the pump when awk exits without reading
function pumpScript(perl, real, mode) {
    const xform = mode === 'cut'
        ? [
            '  my $out = \'\';',
            '  while (length $c) {',
            '    if ($cut) { my $i = index($c, "\\n"); if ($i < 0) { $c = \'\'; } else { $cut = 0; $c = substr($c, $i); } }',
            '    else { my $i = index($c, "\\0"); if ($i < 0) { $out .= $c; $c = \'\'; } else { $out .= substr($c, 0, $i); $cut = 1; $c = substr($c, $i + 1); } }',
            '  }',
        ]
        : ['  (my $out = $c) =~ tr/\\0/\\377/;'];
    const child = mode === 'cut'
        ? ['  exec { $real } $real, @ARGV;', '  POSIX::_exit(127);']
        : [
            // the emulator maps awk's stdout back (0xFF -> NUL) through a pipe the grandparent reads in its own process
            '  pipe(my $or, my $ow) or POSIX::_exit(126);',
            '  my $ap = fork(); defined $ap or POSIX::_exit(126);',
            '  if ($ap == 0) { close $or; open(STDOUT, \'>&\', $ow) or POSIX::_exit(126); close $ow; exec { $real } $real, @ARGV; POSIX::_exit(127); }',
            '  close $ow; close STDIN; binmode $or; binmode STDOUT;',
            '  while (1) { my $g = sysread($or, my $b, 65536); if (!defined $g) { next if $!{EINTR}; last } last if !$g;',
            '    $b =~ tr/\\377/\\0/; my $o = 0; while ($o < length $b) { my $k = syswrite(STDOUT, $b, length($b) - $o, $o); if (!defined $k) { next if $!{EINTR}; last } $o += $k } }',
            '  waitpid($ap, 0); my $s = $?;',
            '  POSIX::_exit(($s & 127) ? 128 + ($s & 127) : ($s >> 8));',
        ];
    return [
        `#!${perl}`,
        `# ${mode === 'cut' ? 'nul-awk shim (test/nul-awk.mjs): each stdin record cut at its first NUL, then the real awk' : 'nul-awk EMULATOR (test/nul-awk.mjs, test-only): a NUL-clean awk on a truncating host'}`,
        'use strict;',
        'use POSIX ();',
        `my $real = '${real}';`,
        '$SIG{PIPE} = \'IGNORE\';',
        'pipe(my $r, my $w) or die "nul-awk: pipe: $!\\n";',
        'my $pid = fork();',
        'defined $pid or die "nul-awk: fork: $!\\n";',
        'if ($pid == 0) {',
        '  close $w; open(STDIN, \'<&\', $r) or POSIX::_exit(126); close $r; $SIG{PIPE} = \'DEFAULT\';',
        ...child,
        '}',
        'close $r; binmode $w; binmode STDIN;',
        '$SIG{CHLD} = sub {};',
        'my $in = fileno(STDIN); my $cut = 0; my $st;',
        'while (defined $in) {',
        '  if (waitpid($pid, POSIX::WNOHANG()) == $pid) { $st = $?; last }',
        '  my $rin = \'\'; vec($rin, $in, 1) = 1;',
        '  my $n = select(my $ro = $rin, undef, undef, 0.05);',
        '  next if $n == 0 || ($n < 0 && $!{EINTR});',
        '  last if $n < 0;',
        '  my $c; my $got = sysread(STDIN, $c, 65536);',
        '  if (!defined $got) { next if $!{EINTR}; last }',
        // EOF inside a cut record: end it, so a final NUL-led record with no trailing newline stays a (now empty) record
        '  if ($got == 0) { syswrite($w, "\\n") if $cut; last }',
        ...xform,
        '  my $off = 0;',
        '  while ($off < length $out) { my $k = syswrite($w, $out, length($out) - $off, $off); if (!defined $k) { next if $!{EINTR}; $in = undef; last } $off += $k }',
        '}',
        'close $w;',
        'if (!defined $st) { while (waitpid($pid, 0) == -1 && $!{EINTR}) {} $st = $?; }',
        'exit(($st & 127) ? 128 + ($st & 127) : ($st >> 8));',
        '',
    ].join('\n');
}

function build(dir, env, mode) {
    const d = realpathSync(resolve(dir));
    const perl = whichOn('perl', env.PATH, env);
    if (!perl) throw new Error('nul-awk: perl not found on PATH (the shim is a perl script)');
    // the real awk: env.PATH without DIR (by realpath), so the shim can never resolve to itself
    const rest = (env.PATH || '').split(':').filter((e) => e !== '' && !(existsSync(e) && realpathSync(e) === d)).join(':');
    const real = whichOn('awk', rest, env);
    if (!real) throw new Error(`nul-awk: no awk on PATH without ${d}`);
    const awk = join(d, 'awk');
    if (realpathSync(real) === awk || realpathSync(real).startsWith(d + '/')) throw new Error(`nul-awk: the real awk ${real} resolves into the shim dir`);
    writeFileSync(awk, pumpScript(safePath(perl, 'perl'), safePath(real, 'awk'), mode));
    chmodSync(awk, 0o755);
    return { dir: d, awk, real, perl };
}
export function buildNulCutAwk(dir, env = process.env) { return build(dir, env, 'cut'); }
export function buildNulCleanAwk(dir, env = process.env) { return build(dir, env, 'map'); }
