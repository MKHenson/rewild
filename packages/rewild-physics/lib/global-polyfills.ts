let globalRef = window as any;

globalRef.Mathf = Math;
globalRef.f32 = function (t: number) {
  return t;
};
globalRef.f32.EPSILON = Number.EPSILON;
globalRef.f32.MAX_VALUE = Number.MAX_VALUE;
globalRef.f32.MIN_VALUE = Number.MIN_VALUE;
globalRef.f32.NaN = Number.NaN;

globalRef.unchecked = function (t: number) {
  return t;
};
globalRef.u32 = function (t: number) {
  return t | 0;
};
globalRef.i32 = function (t: number) {
  return t | 0;
};

globalRef.i32.MAX_VALUE = Number.MAX_VALUE;
globalRef.i32.MIN_VALUE = Number.MIN_VALUE;
