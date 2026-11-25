// The plain surface effect: it changes nothing. See ui.wgsl for the contract.

fn surfacePlace(p: vec2f) -> vec2f {
  return p;
}

fn surfaceColor(color: vec4f, p: vec2f) -> vec4f {
  return color;
}
