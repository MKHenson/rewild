// The waves every water surface shares (WaterWaves): where positions are
// measured from, the grid's LOD bands, and each cascade's tile and palette
// weights. The host declares `waves : Waves`.

const CASCADES: i32 = 4;

struct Waves {
  // x: mip bias on the slopes, from the quality tier. y: 1 to shade by the
  // waves, 0 to leave the normal flat. zw: the viewer's xz from the origin,
  // where chunk LODs were chosen.
  view : vec4f,
  // xy: the world xz positions are measured from, near the camera. z: the
  // wind speed in m/s the ocean spectrum was built for. w: 1 paints the raw
  // foam coverage in grey instead of the water.
  origin : vec4f,
  // Chunk-edge distances past which a coarser grid can appear, and that grid's
  // spacing in metres; unused entries are 0. See waterGridBands.
  lodDistance : array<vec4f, 2>,
  lodSpacing : array<vec4f, 2>,
  // x: the finest grid's spacing, used nearer than the first distance. y:
  // the crest glow's strength. z: the trough darkening's strength.
  grid : vec4f,
  // Per cascade: x tile size in metres, zw where the origin falls in the tile.
  cascade : array<vec4f, 4>,
  // Per cascade: each palette type's weight on it.
  cascadeTypes : array<vec4f, 4>,
}

// Where `rest` falls in cascade `c`'s tile.
fn cascadeUV(c: i32, rest: vec2f) -> vec2f {
  let cascade = waves.cascade[c];
  return rest / cascade.x + cascade.zw;
}
