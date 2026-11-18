// A8: a lane that SIGKILLs its own process.
export const lanes = { sigkill: () => { process.kill(process.pid, 'SIGKILL'); } };
