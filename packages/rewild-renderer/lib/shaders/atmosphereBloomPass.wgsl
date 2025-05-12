struct ObjectStruct { 
    resolution: vec2f,
    iTime: f32,
};

@group(0) @binding(0) 
var ourSampler: sampler;

@group(0) @binding(1) 
var ourTexture: texture_2d<f32>;

@group( 0 ) @binding( 2 ) 
var<uniform> object: ObjectStruct;


@fragment fn fs( 
  @builtin(position) fragCoord: vec4<f32> 
  ) -> @location(0) vec4f {
  let uv = fragCoord.xy / object.resolution.xy;
  let blurRadius = vec2f(5.0) / object.resolution.xy;
  let time = object.iTime * 0.001;

  var sum = vec4f(0.0);
  let NUM_SAMPLES = 10.0;
  let phiOffset = hash(dot(fragCoord.xy, vec2(1.12,2.251)) + time * 0.0001);

  for(var i: i32 = 0; i < i32(NUM_SAMPLES); i++)
  {
      let r = blurRadius * f32(i) / NUM_SAMPLES;
      let phi = (f32(i) / NUM_SAMPLES + phiOffset) * 2.0 * 3.1415926;
      let uv = uv + vec2(sin(phi), cos(phi)) * r; 

      sum += textureSampleLevel( ourTexture, ourSampler, uv, 0.0);
  }

  let BLOOM_AMOUNT = 0.03; 
  let originalColor = textureSampleLevel( ourTexture, ourSampler, uv, 0.0);
  sum = vec4f( mix(originalColor.xyz, sum.xyz / NUM_SAMPLES, BLOOM_AMOUNT), originalColor.w );

  let exposure = 0.09;// * ( 1.0 + 0.2 * sin( 0.5 ) * sin( 1.8  ));
  return vec4f(tonemapACES( exposure * sum.xyz ), sum.w); 
}


fn hash( n: f32 ) -> f32 {
    return fract(sin(n)*43758.5453);
}

// https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
fn tonemapACES( x: vec3f ) -> vec3f {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return (x*(a*x+b))/(x*(c*x+d)+e);
}