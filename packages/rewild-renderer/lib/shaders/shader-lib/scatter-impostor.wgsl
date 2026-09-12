// What the impostor's scene and shadow passes share: how a view direction
// maps onto the octahedral atlas, and how the billboard is framed for it.
//
// Both mirror ScatterImpostorBake.ts exactly — the bake positions its camera
// with the same frame and the same tile centres, so a tile drawn through this
// frame shows the model as it was captured from that direction.

struct ImpostorParams {
  // Model-space centre of the model's bounding sphere, w = its radius. The
  // billboard is this square, and every tile was captured through it.
  centre : vec4f,
  // x = tiles per atlas axis, y = alpha cutoff, z/w unused.
  atlas : vec4f,
}

// The direction clamped to the upper hemisphere the atlas covers — a tree seen
// from below its centre is shown from the horizon, not from nowhere.
fn impostorHemiDir(dir : vec3f) -> vec3f {
  return normalize(vec3f(dir.x, max(dir.y, 0.0), dir.z));
}

// Hemi-octahedral encode: a unit direction in the upper hemisphere onto the
// unit square, the pole at the centre and the horizon around the edge.
fn impostorOctUv(dir : vec3f) -> vec2f {
  let n = dir / (abs(dir.x) + abs(dir.y) + abs(dir.z));
  return vec2f(n.x + n.z, n.x - n.z) * 0.5 + 0.5;
}

// The billboard's right and up for a view direction, model space. Right-handed
// with the direction, so a tile's +u is +right and its +v is -up.
fn impostorRight(dir : vec3f) -> vec3f {
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(dir.y) > 0.999);
  return normalize(cross(up, dir));
}

fn impostorUp(dir : vec3f, right : vec3f) -> vec3f {
  return cross(dir, right);
}

fn quatConjugate(q : vec4f) -> vec4f {
  return vec4f(-q.xyz, q.w);
}
