// The tangent frame, as a matrix whose columns are T, B and the geometric
// normal — so it takes a tangent-space vector into whatever space the normal was
// given in. Returned rather than applied because a normal map is not the only
// thing that needs it: parallax walks the view ray across UV in the same frame,
// and building it twice would let the two disagree.

// Reconstructed from screen-space derivatives (Schüler method). Works without
// precomputed tangents. Call from fragment shaders only, and from uniform
// control flow — it takes derivatives.
fn tbnFromDerivatives(viewPos: vec3f, uv: vec2f, geometricNormal: vec3f) -> mat3x3f {
  let dpos_dx = dpdx(viewPos);
  let dpos_dy = dpdy(viewPos);
  let duv_dx  = dpdx(uv);
  let duv_dy  = dpdy(uv);
  let denom = duv_dx.x * duv_dy.y - duv_dy.x * duv_dx.y;
  let T = normalize((duv_dy.y * dpos_dx - duv_dx.y * dpos_dy) / denom);
  let B = normalize((-duv_dy.x * dpos_dx + duv_dx.x * dpos_dy) / denom);
  return mat3x3f(T, B, geometricNormal);
}

// The geometry's own frame — glTF's TANGENT, in the same space the normal has
// already been transformed into, with handedness in w. Preferred wherever the
// geometry carries one: it is the frame the normal map was baked against, so
// mirrored UVs and hard seams come out right rather than approximately right, it
// needs no derivatives, and it is stable as the camera turns where the
// derivative frame wobbles. Fragment-only only because its inputs are
// interpolated.
fn tbnFromTangent(geometricNormal: vec3f, tangent: vec4f) -> mat3x3f {
  let T = normalize(tangent.xyz - geometricNormal * dot(geometricNormal, tangent.xyz));
  // w is +1 or -1, and carries every bit of the mirroring a baked map needs
  let B = cross(geometricNormal, T) * tangent.w;
  return mat3x3f(T, B, geometricNormal);
}

// Perturb the geometric normal by a normal map sample, through the derivative
// frame. normalSample: RGB already remapped from [0,1] to [-1,1]. uv: the same
// coordinates the normal map was sampled at.
fn perturbNormal(viewPos: vec3f, uv: vec2f, geometricNormal: vec3f, normalSample: vec3f) -> vec3f {
  return normalize(tbnFromDerivatives(viewPos, uv, geometricNormal) * normalSample);
}

// The same perturbation through the geometry's own tangent frame.
fn perturbNormalTangent(geometricNormal: vec3f, tangent: vec4f, normalSample: vec3f) -> vec3f {
  return normalize(tbnFromTangent(geometricNormal, tangent) * normalSample);
}
