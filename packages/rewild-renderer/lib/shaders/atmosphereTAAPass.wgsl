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

@group(0) @binding(1) 
var prevFrame: texture_2d<f32>;

@group( 0 ) @binding(2) 
var<uniform> object: ObjectStruct;

@group(0) @binding(3) 
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
  let uv =  vec2i(floor(fragCoord.xy));
 
 
  let newFrameSample = textureSampleLevel(clouds, mySampler, q, 0);
  let newFrame = RGBToYCoCg(newFrameSample.xyz);
  var history = RGBToYCoCg(textureSampleLevel(prevFrame, mySampler, q, 0).xyz);
  
  var colorAvg = newFrame;
  var colorVar = newFrame * newFrame;
    
  // Marco Salvi's Implementation (by Chris Wyman)
  for( var i = 0; i < 8; i++)
  {
      let fetch = RGBToYCoCg(textureLoad(prevFrame, uv + offsets[i], 0).xyz);
      colorAvg += fetch;
      colorVar += fetch*fetch;
  }

  colorAvg /= 9.0;
  colorVar /= 9.0;
  let gColorBoxSigma = 0.75;
	let sigma = sqrt(max(vec3(0.0), colorVar - colorAvg*colorAvg));
	let colorMin = colorAvg - gColorBoxSigma * sigma;
	let colorMax = colorAvg + gColorBoxSigma * sigma;
    
  history = clamp(history, colorMin, colorMax);
  
	return vec4f(YCoCgToRGB(mix(newFrame, history, 0.75)), newFrameSample.a);
}


fn RGBToYCoCg( RGB: vec3f ) -> vec3f {
	let Y = dot(RGB, vec3(  1, 2,  1 )) * 0.25;
	let Co= dot(RGB, vec3(  2, 0, -2 )) * 0.25 + ( 0.5 * 256.0/255.0 );
	let Cg= dot(RGB, vec3( -1, 2, -1 )) * 0.25 + ( 0.5 * 256.0/255.0 );
	return vec3f(Y, Co, Cg);
}

fn YCoCgToRGB( YCoCg: vec3f ) -> vec3f {
	let Y= YCoCg.x;
	let Co= YCoCg.y - ( 0.5 * 256.0 / 255.0 );
	let Cg= YCoCg.z - ( 0.5 * 256.0 / 255.0 );
	let R= Y + Co-Cg;
	let G= Y + Cg;
	let B= Y - Co-Cg;
	return vec3f(R,G,B);
}