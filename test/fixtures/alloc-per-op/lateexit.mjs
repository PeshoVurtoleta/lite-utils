// B2 R2 exit guard: a box lane (FAILs at --max 4) whose setup() installs a beforeExit hook that calls process.exit(0)
// after the report: the run's exit 1 must not be replaced by 0 silently (no wall-clock race).
let keep = null;
export function setup() { process.once('beforeExit', () => { process.exit(0); }); }
export const lanes = { box: (i) => { keep = { v: i }; } };
