// Night sky cubemap shader — renders stars, galaxy, and dust to a cubemap face.
// This is rendered once at init and sampled by the atmosphere shader with time-based rotation.

const PI: f32 = 3.141592653589793;
const GALAXY_NORMAL = vec3f(0.577, 0.577, 0.577);
const GALAXY_CENTER_DIR = vec3f(-0.707, 0, 0.707);

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

  // Stars (noise-based) — boosted slightly to compensate for removed pixel-perfect stars
  var starIntensity = mix(-1.2, 2.0, proceduralNoise3D(500.0 * dir) + 0.10 * proceduralNoise3D(2.0 * dir));
  starIntensity = clamp(starIntensity, 0.0, 1.0);
  let starColor = vec3f(
    0.7 + 0.3 * proceduralNoise3D(100.0 * dir),
    0.7 + 0.3 * proceduralNoise3D(103.0 * dir),
    0.7 + 0.3 * proceduralNoise3D(106.0 * dir)
  );
  let stars = starIntensity * starColor;

  // Galaxy
  var galaxyPlane = 8.0 * dot(GALAXY_NORMAL, dir);
  galaxyPlane = 1.0 / (galaxyPlane * galaxyPlane + 1.0);
  var galaxyCenter = dot(GALAXY_CENTER_DIR, dir) * 0.5 + 0.5;
  galaxyCenter = galaxyCenter * galaxyCenter;
  let galaxyIntensity = galaxyPlane * galaxyCenter;
  let galaxyColor = vec3f(0.5, 0.5, 1.0);
  let galaxy = 0.8 * galaxyIntensity * galaxyColor;

  // Dust
  var d = 0.0;
  d += 1.00 * proceduralNoise3D(10.0 * dir);
  d += 0.50 * proceduralNoise3D(20.0 * dir);
  d += 0.25 * proceduralNoise3D(100.0 * dir);
  d += 0.20 * proceduralNoise3D(200.0 * dir);
  let dustColor = vec3f(0.5, 0.4, 0.3);
  let dust = vec3f(1.0 - (d * 0.6 + 1.2) * galaxyPlane * galaxyCenter) + dustColor;

  let color = stars + galaxy * dust;
  return vec4f(color, 1.0);
}
