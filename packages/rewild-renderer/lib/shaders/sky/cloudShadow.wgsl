// Cloud Shadow Map Shader
// Renders cloud density from above into a 2D shadow map.
// Each pixel represents a world XZ position; the fragment shader
// raymarches vertically through the cloud layer and accumulates density.

struct CloudShadowUniforms {
  worldSize: f32,
  centerX: f32,
  centerZ: f32,
  iTime: f32,
  cloudiness: f32,
  windiness: f32,
  sunDirX: f32,
  sunDirY: f32,
  sunDirZ: f32,
  padding0: f32,
  padding1: f32,
  padding2: f32,
};

@group(0) @binding(0) var<uniform> shadow: CloudShadowUniforms;
@group(0) @binding(1) var noiseSampler: sampler;
@group(0) @binding(2) var noiseTexture: texture_2d<f32>;
@group(0) @binding(3) var pebblesTexture: texture_2d<f32>;

struct VertexShaderOutput {
  @builtin(position) position: vec4f,
  @location(0) worldXZ: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexShaderOutput {
  let pos = array(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  var vsOutput: VertexShaderOutput;
  let xy = pos[vertexIndex];
  vsOutput.position = vec4f(xy, 0.0, 1.0);

  // Map clip-space [-1,1] to world XZ centered on shadow.center
  // Negate Y: clip Y=+1 is texture row 0 (UV.y=0), so we need to flip
  // so that UV.y=0 maps to worldZ = centerZ - halfSize (south)
  let halfSize = shadow.worldSize * 0.5;
  vsOutput.worldXZ = vec2f(
    shadow.centerX + xy.x * halfSize,
    shadow.centerZ - xy.y * halfSize
  );

  return vsOutput;
}

const NUM_SHADOW_SAMPLES: i32 = 32;

@fragment fn fs(
  @builtin(position) fragCoord: vec4f,
  @location(0) worldXZ: vec2f,
) -> @location(0) vec4f {
  // Sun direction (pointing toward the sun)
  let sunDir = normalize(vec3f(shadow.sunDirX, shadow.sunDirY, shadow.sunDirZ));

  // Skip if sun is below horizon — no shadows at night
  if (sunDir.y <= 0.01) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // For this ground XZ position, trace a ray from ground level upward along the sun direction
  // through the cloud layer. The ray goes from this XZ at CLOUD_START upward.
  // We need to find where the ray from (worldXZ, groundY) toward the sun passes through the
  // cloud layer [CLOUD_START, CLOUD_START + CLOUD_HEIGHT].
  //
  // Given a ground point, a ray toward the sun enters the cloud layer at CLOUD_START.
  // The XZ offset at cloud base = 0 (ray starts at cloud base).
  // At cloud top the XZ offset = sunDir.xz / sunDir.y * CLOUD_HEIGHT.
  // We sample along this slanted path through the cloud layer.

  let invSunY = 1.0 / sunDir.y;
  let stepSize = CLOUD_HEIGHT / f32(NUM_SHADOW_SAMPLES);

  var totalDensity: f32 = 0.0;

  for (var i = 0; i < NUM_SHADOW_SAMPLES; i++) {
    let h = f32(i) * stepSize;  // height offset from cloud base
    let sampleY = CLOUD_START + h;
    // Offset XZ based on sun angle: at height h, light arrives from an XZ offset
    let xzOffset = sunDir.xz * (h * invSunY);
    let samplePos = vec3f(worldXZ.x + xzOffset.x, sampleY, worldXZ.y + xzOffset.y);
    let density = cloudDensity(samplePos, shadow.windiness, shadow.cloudiness, shadow.iTime).density;
    totalDensity += density * stepSize;
  }

  // Convert accumulated density to shadow factor using Beer's law
  // Higher density = darker shadow
  let shadowFactor = 1.0 - exp(-totalDensity * 0.15);

  return vec4f(shadowFactor, 0.0, 0.0, 1.0);
}
