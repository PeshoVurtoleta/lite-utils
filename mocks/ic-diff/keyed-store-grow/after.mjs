function put(a, i, v) { a[i] = v; }
const arr = [];
for (let i = 0; i < 8; i++) put(arr, i, i);
if (arr[0] === -1) console.log(arr[0]);
