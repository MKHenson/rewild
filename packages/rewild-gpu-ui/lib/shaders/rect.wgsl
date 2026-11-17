// The plain box: its fill under its border.
fn effect(prim: Primitive, local: vec2f, inner: f32) -> vec4f {
  return withBorder(premultiply(prim.fill), prim, inner);
}
