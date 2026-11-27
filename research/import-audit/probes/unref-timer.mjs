// B6: leaves an unref'd timer handle open after import completes
setInterval(() => {}, 60_000).unref();
export const ok = 1;
