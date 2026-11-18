// A8: a lane that throws synchronously on its first call.
export const lanes = { syncthrow: () => { throw new Error('boom-sync'); } };
