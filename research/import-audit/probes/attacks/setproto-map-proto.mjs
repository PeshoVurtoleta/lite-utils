// Re-parent Map.prototype onto a plain object (whose proto is Object.prototype): a [[Prototype]] edit.
Object.setPrototypeOf(Map.prototype, Object.create(Object.prototype));
export const ok = 1;
