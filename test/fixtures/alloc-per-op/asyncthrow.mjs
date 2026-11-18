// A8: an async lane that rejects.
export const lanes = { asyncthrow: async () => { throw new Error('boom-async'); } };
