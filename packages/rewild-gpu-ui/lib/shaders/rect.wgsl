// The plain box: its fill under its border. A glass box also gets its light.
fn effect(prim: Primitive, px: Pixel) -> vec4f {
  let box = withBorder(premultiply(prim.fill), prim, px.inner);
  if (prim.params.z == KIND_GLASS) {
    return glassLight(prim, px, box);
  }
  return box;
}
