// f64 + box in one bench (A5 / A6).
const a = new Float64Array(2);
let keep = null;
export const lanes = {
    f64: (i) => { a[i & 1] = i + 0.5; },
    box: (i) => { keep = { v: i }; },
};
