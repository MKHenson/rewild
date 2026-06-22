// Reconstruct a perturbed normal using screen-space derivatives (Schüler method).
// Works without precomputed tangents. Call from fragment shaders only.
// normalSample: RGB normal map value already remapped from [0,1] to [-1,1].
// uv: the same UV coordinates used to sample the normal map.
fn perturbNormal(viewPos: vec3f, uv: vec2f, geometricNormal: vec3f, normalSample: vec3f) -> vec3f {
  let dpos_dx = dpdx(viewPos);
  let dpos_dy = dpdy(viewPos);
  let duv_dx  = dpdx(uv);
  let duv_dy  = dpdy(uv);
  let denom = duv_dx.x * duv_dy.y - duv_dy.x * duv_dx.y;
  let T = normalize((duv_dy.y * dpos_dx - duv_dx.y * dpos_dy) / denom);
  let B = normalize((-duv_dy.x * dpos_dx + duv_dx.x * dpos_dy) / denom);
  return normalize(mat3x3f(T, B, geometricNormal) * normalSample);
}
