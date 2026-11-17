// The plain box: its fill under its border.
fn effect(prim: Primitive, px: Pixel) -> vec4f {
  return withBorder(premultiply(prim.fill), prim, px.inner);
}
