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

  let NUM_SAMPLES = 10.0;
  let BLOOM_AMOUNT = 0.001;
  let BLOOM_THRESHOLD = 0.6;
  let jitterSeed = hash(dot(fragCoord.xy, vec2(1.12, 2.251)) + time * 0.0001);

  var bloomSum = vec4f(0.0);
  var bloomWeight = 0.0;

  for(var i: i32 = 1; i <= i32(NUM_SAMPLES); i++)
  {
      let fi = f32(i) / NUM_SAMPLES;
      // Golden angle spiral gives uniform coverage with no visible rings
      let phi = f32(i) * 2.399963 + jitterSeed * 6.2831853;
      let r = blurRadius * sqrt(fi);
      let sampleUV = uv + vec2(sin(phi), cos(phi)) * r;
      let s = textureSampleLevel(ourTexture, ourSampler, sampleUV, 0.0);
      let brightness = dot(s.rgb, vec3f(0.2126, 0.7152, 0.0722));
      let gaussWeight = exp(-fi * fi * 3.0);
      let contribution = max(0.0, brightness - BLOOM_THRESHOLD) * gaussWeight;
      bloomSum += s * contribution;
      bloomWeight += contribution;
  }

  let originalColor = textureSampleLevel(ourTexture, ourSampler, uv, 0.0);
  var bloom = vec4f(0.0);
  if (bloomWeight > 0.0) {
      bloom = bloomSum / bloomWeight;
  }

  let exposure = 0.05;
  let tonemapped = tonemapACES(exposure * originalColor.rgb);
  let finalRGB = clamp(tonemapped + bloom.rgb * BLOOM_AMOUNT, vec3f(0.0), vec3f(1.0));
  return vec4f(finalRGB, originalColor.w);
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