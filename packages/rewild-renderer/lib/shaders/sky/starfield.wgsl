// Night sky cubemap shader — renders stars, galaxy, and dust to a cubemap face.
// This is rendered once at init and sampled by the atmosphere shader with time-based rotation.

const PI: f32 = 3.141592653589793;
const GALAXY_NORMAL = vec3f(0.577, 0.577, 0.577);
const GALAXY_CENTER_DIR = vec3f(-0.707, 0, 0.707);
// Additional nebula clouds at different locations
const NEBULA2_NORMAL = vec3f(-0.707, 0.0, -0.707);
const NEBULA2_CENTER_DIR = vec3f(0.5, 0.5, 0.5);
const NEBULA3_NORMAL = vec3f(0.0, 0.707, 0.707);
const NEBULA3_CENTER_DIR = vec3f(0.707, 0.707, 0.0);
const NEBULA4_NORMAL = vec3f(0.707, -0.707, 0.0);
const NEBULA4_CENTER_DIR = vec3f(-0.5, -0.5, 0.707);

struct NightSkyUniforms {
  faceIndex: u32,
  faceSize: f32,
};

@group(0) @binding(0)
var<uniform> uniforms: NightSkyUniforms;

fn hash3( p: vec3f ) -> vec3f {
	let p2 = vec3f( dot(p,vec3f(127.1,311.7, 74.7)),
			  dot(p,vec3f(269.5,183.3,246.1)),
			  dot(p,vec3f(113.5,271.9,124.6)));

	return -1.0 + 2.0 * fract( sin( p2 ) *43758.5453123 );
}

fn proceduralNoise3D( p: vec3f ) -> f32 {
    let i = floor( p );
    let f = fract( p );
    let u = f*f*(3.0-2.0*f);

    return mix( mix( mix( dot( hash3( i + vec3f(0.0,0.0,0.0) ), f - vec3f(0.0,0.0,0.0) ), 
                          dot( hash3( i + vec3f(1.0,0.0,0.0) ), f - vec3f(1.0,0.0,0.0) ), u.x),
                     mix( dot( hash3( i + vec3f(0.0,1.0,0.0) ), f - vec3f(0.0,1.0,0.0) ), 
                          dot( hash3( i + vec3f(1.0,1.0,0.0) ), f - vec3f(1.0,1.0,0.0) ), u.x), u.y),
                mix( mix( dot( hash3( i + vec3f(0.0,0.0,1.0) ), f - vec3f(0.0,0.0,1.0) ), 
                          dot( hash3( i + vec3f(1.0,0.0,1.0) ), f - vec3f(1.0,0.0,1.0) ), u.x),
                     mix( dot( hash3( i + vec3f(0.0,1.0,1.0) ), f - vec3f(0.0,1.0,1.0) ), 
                          dot( hash3( i + vec3f(1.0,1.0,1.0) ), f - vec3f(1.0,1.0,1.0) ), u.x), u.y), u.z );
}

fn getCubeDirection(faceIndex: u32, uv: vec2f) -> vec3f {
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

struct VertexOutput {
  @builtin(position) position: vec4f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let pos = array(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  return output;
}

@fragment fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / uniforms.faceSize;
  let dir = getCubeDirection(uniforms.faceIndex, uv);

  // Stars (noise-based) — HDR: power curve concentrates intensity at noise peaks.
  // Bright stars store values > 1 in rgba16float; dim stars → 0. No clamp.
  // pow(4)*900: noise peaks ≈ 0.45 → ~6 HDR, ≈ 0.50 → ~56 HDR (bright glow),
  // ≈ 0.55 → ~126 HDR (prominent halo). Most sky stays at 0; only the top few percent
  // of noise peaks produce visible stars. 3x multiplier from 300 enables selective bloom.
  var starIntensity = max(0.0, mix(-1.2, 2.0, proceduralNoise3D(500.0 * dir) + 0.10 * proceduralNoise3D(2.0 * dir)));
  starIntensity = pow(starIntensity, 4.0) * 900.0;
  let starColor = vec3f(
    0.7 + 0.3 * proceduralNoise3D(100.0 * dir),
    0.7 + 0.3 * proceduralNoise3D(103.0 * dir),
    0.7 + 0.3 * proceduralNoise3D(106.0 * dir)
  );
  let stars = starIntensity * starColor;

  // Main galaxy: Milky Way-like structure with noise-based swirls and color variation
  var galaxyPlane = 8.0 * dot(GALAXY_NORMAL, dir);
  galaxyPlane = 1.0 / (galaxyPlane * galaxyPlane + 1.0);
  var galaxyCenter = dot(GALAXY_CENTER_DIR, dir) * 0.5 + 0.5;
  galaxyCenter = galaxyCenter * galaxyCenter;

  // Add swirling detail with multi-octave noise
  let swirl = (proceduralNoise3D(5.0 * dir) + 0.5 * proceduralNoise3D(15.0 * dir)) * 0.75;
  let galaxyDetail = galaxyPlane * galaxyCenter * (0.6 + 0.4 * swirl);

  // Color varies from blue nebula to orange/red dust
  let nebulaBlue = proceduralNoise3D(3.0 * dir);
  let dustOrange = proceduralNoise3D(7.0 * dir);
  let galaxyColor = mix(
    vec3f(0.3, 0.4, 0.8),  // Blue nebula
    vec3f(0.9, 0.5, 0.2),  // Orange dust
    0.5 + 0.5 * (nebulaBlue + dustOrange) * 0.5
  );
  let galaxy = 10.0 * galaxyDetail * galaxyColor;

  // Secondary nebula: purple/blue
  var nebula2Plane = 6.0 * dot(NEBULA2_NORMAL, dir);
  nebula2Plane = 1.0 / (nebula2Plane * nebula2Plane + 1.0);
  var nebula2Center = dot(NEBULA2_CENTER_DIR, dir) * 0.5 + 0.5;
  nebula2Center = nebula2Center * nebula2Center;
  let nebula2Swirl = proceduralNoise3D(8.0 * dir) * 0.8;
  let nebula2Intensity = nebula2Plane * nebula2Center * (0.4 + 0.6 * nebula2Swirl);
  let nebula2Color = mix(vec3f(0.3, 0.2, 0.7), vec3f(0.5, 0.3, 0.6), 0.5 + 0.5 * proceduralNoise3D(6.0 * dir));
  let nebula2 = 5.0 * nebula2Intensity * nebula2Color;

  // Tertiary nebula: cyan/teal
  var nebula3Plane = 5.0 * dot(NEBULA3_NORMAL, dir);
  nebula3Plane = 1.0 / (nebula3Plane * nebula3Plane + 1.0);
  var nebula3Center = dot(NEBULA3_CENTER_DIR, dir) * 0.5 + 0.5;
  nebula3Center = nebula3Center * nebula3Center;
  let nebula3Swirl = proceduralNoise3D(7.0 * dir) * 0.7;
  let nebula3Intensity = nebula3Plane * nebula3Center * (0.3 + 0.7 * nebula3Swirl);
  let nebula3Color = mix(vec3f(0.2, 0.6, 0.8), vec3f(0.3, 0.5, 0.7), 0.5 + 0.5 * proceduralNoise3D(9.0 * dir));
  let nebula3 = 4.5 * nebula3Intensity * nebula3Color;

  // Quaternary nebula: faint blue/magenta
  var nebula4Plane = 5.5 * dot(NEBULA4_NORMAL, dir);
  nebula4Plane = 1.0 / (nebula4Plane * nebula4Plane + 1.0);
  var nebula4Center = dot(NEBULA4_CENTER_DIR, dir) * 0.5 + 0.5;
  nebula4Center = nebula4Center * nebula4Center;
  let nebula4Swirl = proceduralNoise3D(9.0 * dir) * 0.6;
  let nebula4Intensity = nebula4Plane * nebula4Center * (0.2 + 0.8 * nebula4Swirl);
  let nebula4Color = mix(vec3f(0.4, 0.1, 0.6), vec3f(0.3, 0.4, 0.8), 0.5 + 0.5 * proceduralNoise3D(5.0 * dir));
  let nebula4 = 3.5 * nebula4Intensity * nebula4Color;

  // Dust: cosmic dust clouds that darken regions (extinction)
  var d = 0.0;
  d += 1.00 * proceduralNoise3D(10.0 * dir);
  d += 0.50 * proceduralNoise3D(20.0 * dir);
  d += 0.25 * proceduralNoise3D(100.0 * dir);
  d += 0.20 * proceduralNoise3D(200.0 * dir);

  // Subtle dust extinction: mostly preserves nebula colors, slight reddening
  let dustFactor = 1.0 - clamp(d * 0.25, 0.0, 0.4);
  let dustTint = mix(vec3f(1.0), vec3f(1.0, 0.85, 0.8), clamp(d * 0.15, 0.0, 1.0));

  // Combine all nebulae with dust attenuation and tint
  let allNebulae = galaxy + nebula2 + nebula3 + nebula4;
  let nebulaeWithDust = allNebulae * (dustFactor * dustTint);
  let color = stars + nebulaeWithDust;

  return vec4f(color, 1.0);
}
