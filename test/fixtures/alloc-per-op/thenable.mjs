// A8: a lane returning a thenable that rejects.
export const lanes = { thenablerej: () => ({ then(_ok, no) { no(new Error('boom-thenable')); } }) };
