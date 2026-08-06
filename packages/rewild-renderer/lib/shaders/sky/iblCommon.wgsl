const IBL_PI: f32 = 3.141592653589793;

/**
 * World-space direction for a point on a cube face.
 *
 * `uv` runs 0..1 across the face with v increasing *downward*, matching
 * `fragCoord.xy / faceSize`. Identical to getCubeDirection() in starfield.wgsl
 * — see the FACE_BASIS comment in SkyCubeCapture.ts for why this convention,
 * rather than a lookAt, is the authority here.
 */
fn cubeDirection(faceIndex: u32, uv: vec2f) -> vec3f {
  let u = 2.0 * uv.x - 1.0;
  let v = 2.0 * uv.y - 1.0;
  switch (faceIndex) {
    case 0u: { return normalize(vec3f( 1.0, -v, -u)); } // +X
    case 1u: { return normalize(vec3f(-1.0, -v,  u)); } // -X
    case 2u: { return normalize(vec3f( u,  1.0,  v)); } // +Y
    case 3u: { return normalize(vec3f( u, -1.0, -v)); } // -Y
    case 4u: { return normalize(vec3f( u, -v,  1.0)); } // +Z
    default: { return normalize(vec3f(-u, -v, -1.0)); } // -Z
  }
}

/** Van der Corput radical inverse — the base-2 half of the Hammersley set. */
fn radicalInverseVdC(inBits: u32) -> f32 {
  var bits = inBits;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10; // / 2^32
}

/**
 * Hammersley point set. Deterministic rather than randomised: the prefilter is
 * re-run continuously as the sky moves, and a per-frame random offset would
 * turn a fixed sampling bias into visible ambient noise crawling over every
 * surface. A fixed sequence gives a fixed, invisible bias instead.
 */
fn hammersley(i: u32, count: u32) -> vec2f {
  return vec2f(f32(i) / f32(count), radicalInverseVdC(i));
}

/** Builds an orthonormal basis around `n` and rotates a tangent-space vector into it. */
fn tangentToWorld(n: vec3f, v: vec3f) -> vec3f {
  // Any up vector not parallel to n will do; the switch avoids a degenerate cross.
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(n.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, n));
  let bitangent = cross(n, tangent);
  return normalize(tangent * v.x + bitangent * v.y + n * v.z);
}

/**
 * GGX/Trowbridge-Reitz importance sample: returns a half-vector distributed by
 * D, so the estimator only has to weight by NdotL. `roughness` is perceptual
 * (glTF's) and squared here to get the alpha the distribution takes.
 */
fn importanceSampleGGX(xi: vec2f, n: vec3f, roughness: f32) -> vec3f {
  let a = roughness * roughness;

  let phi = 2.0 * IBL_PI * xi.x;
  let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));

  return tangentToWorld(
    n,
    vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta)
  );
}

/** Trowbridge-Reitz normal distribution, used for the prefilter's pdf. */
fn distributionGGX(nDotH: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(IBL_PI * d * d, 1e-7);
}
