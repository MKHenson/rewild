// Rain on a surface (RainWetness). Water soaks into porous surfaces and darkens
// them; a film on top makes them glossy. iblParams.rain says how wet the world
// is: x the soak, y the film, both 0..1. Porosity follows roughness, so rough
// ground darkens most while smooth and metal surfaces only take the film.
// Surfaces facing the sky take the most rain and faces turned down none; only
// near-level ones hold a film. Where rain is falling, drops land on level
// surfaces and spread rings that ripple the film (rainRipples). The host
// includes ibl.wgsl.

// Albedo of a fully porous surface, soaked.
const RAIN_DARKEN: f32 = 0.5;
// Roughness below which a surface counts as sealed, and above which it is
// fully porous.
const RAIN_SEALED: f32 = 0.2;
const RAIN_POROUS: f32 = 0.8;
// The film's roughness, and how far toward it a level surface goes.
const RAIN_FILM_ROUGHNESS: f32 = 0.12;
const RAIN_FILM_SHARE: f32 = 0.85;
// Share of the soak a wall takes, beside a face turned to the sky.
const RAIN_WALL_SOAK: f32 = 0.4;
// A leaf's albedo, soaked: leaves shed water, so they darken little.
const RAIN_LEAF_DARKEN: f32 = 0.85;

struct RainWet {
  color : vec3f,
  roughness : f32,
}

// `color`, `roughness` and `metallic` after the rain, on a surface whose
// world normal rises `up`. `damp` 0..1 is how soaked it already is by other
// water, which the rain does not darken again.
fn rainWet(color: vec3f, roughness: f32, metallic: f32, up: f32, damp: f32) -> RainWet {
  var out: RainWet;
  out.color = color;
  out.roughness = roughness;
  let soak = iblParams.rain.x;
  let film = iblParams.rain.y;
  if (soak <= 0.0 && film <= 0.0) {
    return out;
  }
  let exposed = smoothstep(-0.3, 0.0, up) * mix(RAIN_WALL_SOAK, 1.0, smoothstep(0.0, 0.7, up));
  let level = smoothstep(0.3, 0.9, up);
  let porous = smoothstep(RAIN_SEALED, RAIN_POROUS, roughness) * (1.0 - metallic);
  let soaked = soak * exposed * porous * (1.0 - damp);
  out.color = color * mix(1.0, RAIN_DARKEN, soaked);
  let filmed = film * level * RAIN_FILM_SHARE;
  out.roughness = mix(roughness, min(roughness, RAIN_FILM_ROUGHNESS), filmed);
  return out;
}

// What the rain does to a leaf's albedo.
fn rainLeaf() -> f32 {
  return mix(1.0, RAIN_LEAF_DARKEN, iblParams.rain.x);
}

// Drops land on a grid RAIN_CELL metres apart, one somewhere in the middle of
// each cell, again every RAIN_PERIOD seconds at a time of its own. Light rain
// lands in only some cells. A drop's ring spreads to RAIN_RING_REACH metres,
// inside its cell, RAIN_RING_WIDTH wide, RAIN_RING_HEIGHT high, and flattens
// as it spreads. A second layer, half a cell over, fills the gaps.
//
// Seen from above, a wet surface reflects a few percent of an overcast sky
// that looks the same whichever way a ring tilts it, so a ring in the
// reflection alone does not show. The rings tilt the shading normal too, and
// their crests catch the light: RAIN_RING_GLINT brighter at the top of one.
const RAIN_CELL: f32 = 0.9;
const RAIN_PERIOD: f32 = 1.0;
const RAIN_RING_REACH: f32 = 0.17;
const RAIN_RING_WIDTH: f32 = 0.03;
const RAIN_RING_HEIGHT: f32 = 0.005;
const RAIN_RING_GLINT: f32 = 0.6;
// On water, whose own colour is too dark to brighten, a crest shows as this
// much foam.
const RAIN_RING_FOAM: f32 = 0.3;
// The ring's profile, sin(πx)·exp(−x²), peaks at about this.
const RAIN_RING_PEAK: f32 = 0.6;
// View metres over which the rings fade out, before they shimmer.
const RAIN_RIPPLE_NEAR: f32 = 15.0;
const RAIN_RIPPLE_FAR: f32 = 45.0;

fn rainHash(cell: vec2i, salt: u32) -> f32 {
  var x = (bitcast<u32>(cell.x) * 747796405u) ^ (bitcast<u32>(cell.y) * 2891336453u) ^ (salt * 277803737u);
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x & 0xffffffu) / 16777216.0;
}

// One layer of rings at world `p`: xy the slope along world x and z, z 0..1
// how near a crest the point lies.
fn rainRippleLayer(p: vec2f, salt: u32) -> vec3f {
  let cellF = floor(p / RAIN_CELL);
  let cell = vec2i(cellF);
  if (rainHash(cell, salt + 3u) > iblParams.rainPatter.x) {
    return vec3f(0.0);
  }
  let centre = (cellF + 0.3 + 0.4 * vec2f(rainHash(cell, salt), rainHash(cell, salt + 1u))) * RAIN_CELL;
  let life = fract(iblParams.rainPatter.z / RAIN_PERIOD + rainHash(cell, salt + 2u));
  let d = p - centre;
  let r = length(d);
  let x = (r - life * RAIN_RING_REACH) / RAIN_RING_WIDTH;
  if (abs(x) > 3.0 || r < 1e-5) {
    return vec3f(0.0);
  }
  let fade = (1.0 - life) * (1.0 - life);
  let pi = 3.14159265;
  let wave = exp(-x * x);
  let dhdx = (pi * cos(pi * x) - 2.0 * x * sin(pi * x)) * wave;
  let slope = dhdx * RAIN_RING_HEIGHT / RAIN_RING_WIDTH * fade;
  let crest = saturate(sin(pi * x) * wave / RAIN_RING_PEAK) * fade;
  return vec3f(d / r * slope, crest);
}

// The falling rain's rings at world `p`, `distance` metres from the camera:
// xy the slope along world x and z, z 0..1 how near a crest; 0 where none
// fall.
fn rainRipples(p: vec2f, distance: f32) -> vec3f {
  let strength = iblParams.rainPatter.x * (1.0 - smoothstep(RAIN_RIPPLE_NEAR, RAIN_RIPPLE_FAR, distance));
  if (strength <= 0.0) {
    return vec3f(0.0);
  }
  var ripples = rainRippleLayer(p, 0u);
  if (iblParams.rainPatter.y > 1.5) {
    let other = rainRippleLayer(p + vec2f(0.5 * RAIN_CELL), 17u);
    ripples = vec3f(ripples.xy + other.xy, max(ripples.z, other.z));
  }
  return ripples * min(strength * 2.0, 1.0);
}

struct RainPatter {
  // The view-space normal, rippled.
  normal : vec3f,
  // 0..1 how near a ring's crest; brightens the surface by RAIN_RING_GLINT.
  crest : f32,
}

// The rain's rings on a surface with view-space `normal` at view-space
// `viewPosition`, where `wet` 0..1 of a film lies on it if it is level:
// iblParams.rain.y for a surface the rain wets, 1 for open water.
fn rainPatter(normal: vec3f, viewPosition: vec3f, wet: f32) -> RainPatter {
  var out: RainPatter;
  out.normal = normal;
  out.crest = 0.0;
  if (iblParams.rainPatter.x <= 0.0 || wet <= 0.0) {
    return out;
  }
  let toWorld = mat3x3f(iblParams.viewToWorld[0].xyz, iblParams.viewToWorld[1].xyz, iblParams.viewToWorld[2].xyz);
  let worldN = toWorld * normal;
  let film = wet * smoothstep(0.3, 0.9, worldN.y);
  if (film <= 0.0) {
    return out;
  }
  let world = (iblParams.viewToWorld * vec4f(viewPosition, 1.0)).xyz;
  let ripples = rainRipples(world.xz, length(viewPosition)) * film;
  out.normal = normalize(transpose(toWorld) * normalize(worldN + vec3f(-ripples.x, 0.0, -ripples.y)));
  out.crest = ripples.z;
  return out;
}

// What a ring's crest does to the surface's colour.
fn rainGlint(crest: f32) -> f32 {
  return 1.0 + RAIN_RING_GLINT * crest;
}
