// C-23 bench: box (FAILs at --max 4) + the A6 gc-every-1000th lane (VOID).
let keep = null;
let c = 0;
export const lanes = {
    box: (i) => { keep = { v: i }; },
    gcl: () => { if (++c % 1000 === 0) globalThis.gc(); },
};
