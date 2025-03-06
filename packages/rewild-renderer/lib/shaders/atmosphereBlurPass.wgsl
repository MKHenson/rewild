struct ObjectStruct { 
    resolution: vec2f,
    iTime: f32,
};
struct OurVertexShaderOutput {
  @builtin(position) position: vec4f, 
};


@vertex fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> OurVertexShaderOutput {
  let pos = array(
    // 1st triangle
    vec2f(-1.0, -1.0),  // bottom-left
    vec2f( 1.0, -1.0),  // bottom-right
    vec2f(-1.0,  1.0),  // top-left

    // 2nd triangle
    vec2f(-1.0,  1.0),  // top-left
    vec2f( 1.0, -1.0),  // bottom-right
    vec2f( 1.0,  1.0),  // top-right
  );

  var vsOutput: OurVertexShaderOutput;
  let xy = pos[vertexIndex];
  vsOutput.position = vec4f(xy, 0.0, 1.0);
  return vsOutput;
}

@group(0) @binding(0) 
var clouds: texture_2d<f32>;

@group( 0 ) @binding(1) 
var<uniform> object: ObjectStruct;

@group(0) @binding(2)
var mySampler: sampler;

const offsets = array<vec2i, 8>( 
  vec2i(-1,-1), vec2i(-1, 1), 
  vec2i(1, -1), vec2i(1, 1), 
  vec2i(1, 0), vec2i(0, -1), 
  vec2i(0, 1), vec2i(-1, 0)
);


@fragment fn fs( 
  @builtin(position) fragCoord: vec4<f32> 
  ) -> @location(0) vec4f {
  let q = fragCoord.xy / object.resolution;  
  
  return blur(clouds, q, vec2<f32>(1.0) / object.resolution);
}

const samples: i32 = 5;
const LOD: i32 = 1;  // gaussian done on MIPmap at scale LOD
const sLOD: i32 = 1 << u32(LOD); // was originally ( 1 << u32(LOD) )  tile size = 2^LOD
const sigma: f32 = f32(samples) * 0.22;

fn gaussian(i: vec2<f32>) -> f32 {
    let i2 = i / sigma;
    return exp(-0.5 * dot(i2, i2)) / (6.28 * sigma * sigma);
}

fn blur(sp: texture_2d<f32>, U: vec2<f32>, scale: vec2<f32>) -> vec4<f32> {
    var O: vec4<f32> = vec4<f32>(0.0);
    var totalWeight: f32 = 0.0;
    let s: i32 = samples / sLOD;

    for (var i: i32 = 0; i < s * s; i = i + 1) {
        let d: vec2<f32> = vec2<f32>(f32(i % s), f32(i / s)) * f32(sLOD) - f32(samples) / 2.0;
        let weight: f32 = gaussian(d);
        let sample: vec4<f32> = textureSampleLevel(sp, mySampler, U + scale * d, f32(LOD));
        O = O + weight * sample;
        totalWeight = totalWeight + weight;
    }

    O = O / totalWeight;
    return O;
}