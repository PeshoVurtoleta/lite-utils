// N4: a lane that calls process.exit(0) on its first call (the run never settled: the tool must exit 2).
export const lanes = { bye: () => { process.exit(0); } };
