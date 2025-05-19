(self as any).Mathf = Math;
(self as any).f32 = { EPSILON: Number.EPSILON };
(self as any).i32 = { MAX_VALUE: Number.MAX_VALUE };
(self as any).unchecked = function (t: any) {
  return t;
};
(self as any).u32 = function (t: any) {
  return t | 0;
};
(self as any).i32 = function (t: any) {
  return t | 0;
};
(self as any).f32 = function (t: any) {
  return t;
};
