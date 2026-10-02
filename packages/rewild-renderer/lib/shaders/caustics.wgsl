// Caustics by photon splatting (Caustics), after Evan Wallace's WebGL Water.
// A grid over one cascade's tile, a vertex per FFT texel, refracts the sun
// through the wave normal there and lands it on a plane below. A ray is stored
// where it lands less where a calm surface would land it, so the texture is
// indexed by where the sun's ray entered the water. The grid reaches past the
// tile by a margin, so every ray that lands in the tile is drawn and the
// result tiles. A fragment adds the ratio of the area on the surface to the
// area on the plane, so focused light folds into bright lines. Instance 0
// lands on the shallow plane (r), instance 1 on the deep one (g).

// Mirrors CAUSTIC_CASCADE in shader-lib/caustics.wgsl.
const CASCADE: i32 = 3;
// Air over water's index of refraction.
const AIR_TO_WATER: f32 = 0.75;
// The ocean's slopes are divided by the surface's stretch, floored as
// water.wgsl floors it.
const MIN_STRETCH: f32 = 0.1;

struct Build {
  // xyz: the way toward the sun, in the air.
  toSun : vec4f,
  // x: cells per side, the margin included. y: margin cells each side. z:
  // the tile's metres. w: most metres a ray lands from where a calm surface
  // would land it.
  grid : vec4f,
  // x, y: metres down to the shallow and deep planes. z: square metres of a
  // texel. w: the most light one triangle adds to a texel.
  planes : vec4f,
}

@group(0) @binding(0) var<uniform> build : Build;
@group(0) @binding(1) var oceanSlopes : texture_2d_array<f32>;

struct VertexOutput {
  @builtin(position) position : vec4f,
  // Metres across the tile where the ray entered the water.
  @location(0) entry : vec2f,
  @location(1) @interpolate(flat) plane : u32,
}

@vertex
fn vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) plane: u32) -> VertexOutput {
  let cells = u32(build.grid.x);
  let cell = vertex / 6u;
  let k = vertex % 6u;
  let corner = vec2u(
    select(0u, 1u, k == 1u || k == 4u || k == 5u),
    select(0u, 1u, k == 2u || k == 3u || k == 5u)
  );
  let size = i32(textureDimensions(oceanSlopes).x);
  let texel = vec2i(vec2u(cell % cells, cell / cells) + corner) - vec2i(i32(build.grid.y));
  let wrapped = ((texel % size) + size) % size;
  let d = textureLoad(oceanSlopes, wrapped, CASCADE, 0);
  let tile = build.grid.z;
  let entry = (vec2f(texel) + 0.5) / f32(size) * tile;

  let slopes = vec2f(d.x / max(d.z + 1.0, MIN_STRETCH), d.y / max(d.w + 1.0, MIN_STRETCH));
  let normal = normalize(vec3f(-slopes.x, 1.0, -slopes.y));
  let incident = -build.toSun.xyz;
  let ray = refract(incident, normal, AIR_TO_WATER);
  let calm = refract(incident, vec3f(0.0, 1.0, 0.0), AIR_TO_WATER);
  let depth = select(build.planes.x, build.planes.y, plane == 1u);
  var shift = (ray.xz / max(-ray.y, 0.05) - calm.xz / max(-calm.y, 0.05)) * depth;
  let reach = length(shift);
  if (reach > build.grid.w) {
    shift *= build.grid.w / reach;
  }
  let landed = (entry + shift) / tile;

  var out: VertexOutput;
  out.position = vec4f(landed.x * 2.0 - 1.0, 1.0 - landed.y * 2.0, 0.0, 1.0);
  out.entry = entry;
  out.plane = plane;
  return out;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  let dx = dpdx(input.entry);
  let dy = dpdy(input.entry);
  let light = min(abs(dx.x * dy.y - dx.y * dy.x) / build.planes.z, build.planes.w);
  return select(vec4f(light, 0.0, 0.0, 0.0), vec4f(0.0, light, 0.0, 0.0), input.plane == 1u);
}
