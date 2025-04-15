
const SAMPLES = 1;  // HIGHER = NICER = SLOWER
const DISTRIBUTION_BIAS = 0.6; // between 0. and 1.
const PIXEL_MULTIPLIER =  1.5; // between 1. and 3. (keep low)
const INVERSE_HUE_TOLERANCE = 20.0; // (2. - 30.)
const GOLDEN_ANGLE = 2.3999632; //3PI-sqrt(5)PI
const sample2D = mat2x2(cos(GOLDEN_ANGLE), sin(GOLDEN_ANGLE), -sin(GOLDEN_ANGLE), cos(GOLDEN_ANGLE));

struct ObjectStruct { 
    resolution: vec2f,
    iTime: f32,
}; 

@group(0) @binding(0) 
var clouds: texture_2d<f32>;

@group( 0 ) @binding(1) 
var<uniform> object: ObjectStruct;

@group(0) @binding(2)
var textureSampler: sampler;

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
 
  let newFrameSample = textureSampleLevel(clouds, textureSampler, q, 0); 
  return vec4f( sirBirdDenoise(q, object.resolution),  newFrameSample.a );
} 


fn sirBirdDenoise( uv: vec2f, imageResolution: vec2f ) -> vec3f {
    
    var denoisedColor = vec3(0.);    
    let sampleRadius = sqrt(f32(SAMPLES));
    let sampleTrueRadius = 0.5/(sampleRadius*sampleRadius);
    let samplePixel = vec2(1.0/imageResolution.x,1.0/imageResolution.y); 
    let sampleCenter = textureSampleLevel(clouds, textureSampler, uv, 0).rgb;
    let sampleCenterNorm = normalize(sampleCenter);
    let sampleCenterSat = length(sampleCenter);
    
    var influenceSum = 0.0;
    let brightnessSum = 0.0;
    
    var pixelRotated = vec2(0.,1.);
    
    for (var x = 0.0; x <= f32(SAMPLES); x = x + 1.0 ) {
        
        pixelRotated *= sample2D;
        
        var pixelOffset    = PIXEL_MULTIPLIER * pixelRotated*sqrt(x)*0.5;
        var pixelInfluence = 1.0-sampleTrueRadius*pow(dot(pixelOffset,pixelOffset),DISTRIBUTION_BIAS);
        pixelOffset *= samplePixel;
        var thisDenoisedColor = textureSampleLevel(clouds, textureSampler, uv + pixelOffset, 0).rgb;

        pixelInfluence *= pixelInfluence*pixelInfluence;

        /*
         * HUE + SATURATION FILTER
         */
        pixelInfluence      *=   
            pow(0.5 + 0.5 * dot( sampleCenterNorm, normalize(thisDenoisedColor) ),INVERSE_HUE_TOLERANCE)
            * pow(1.0 - abs( length(thisDenoisedColor)-length(sampleCenterSat)), 8.);

        // Ensure pixelInfluence is not negative
        pixelInfluence = max(pixelInfluence, 0.0);
            
        influenceSum += pixelInfluence;
        denoisedColor += thisDenoisedColor*pixelInfluence;
    }
    
    return denoisedColor / influenceSum;
}