struct FinalUniformStruct { 
    invViewProjectionMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    resolution: vec2f,
    iTime: f32,
    cloudiness: f32,
    sunPosition: vec3f,
    cameraPosition: vec3f,
    padding0: f32,
    foginess: f32,
}; 

@group(0) @binding(0) 
var sky: texture_2d<f32>;

@group(0) @binding(1) 
var clouds: texture_2d<f32>;

@group( 0 ) @binding(2) 
var<uniform> object: FinalUniformStruct;

@group(0) @binding(3)
var cloudsSampler: sampler;

@group( 0 ) @binding( 4 )
var depthTexture: texture_depth_2d;

var<private> sunDotUp: f32;


@fragment fn fs( 
  @builtin(position) fragCoord: vec4<f32>,
  ) -> @location(0) vec4f {
  // Define uv based on fragCoord
  let uv = fragCoord.xy / vec2(object.resolution);

  // Convert uv to texture coordinates
  let texCoord = vec2<i32>(uv * vec2<f32>(textureDimensions(depthTexture)));

  // Load the depth value directly
  let rawDepth = textureLoad(depthTexture, texCoord, 0);
  
  // Do not draw pixel if blocked by something in the z-buffer
  let sky = textureSampleLevel( sky, cloudsSampler, uv, 0 );
  let clouds = textureSampleLevel( clouds, cloudsSampler, uv, 0 );
 
  let preMultipliedClouds = vec4<f32>(clouds.rgb * clouds.a, clouds.a);

  // Blend sky and clouds based on alpha
  var blendedColor = sky * (1.0 - preMultipliedClouds.a) + preMultipliedClouds;
   
  let worldPos = worldFromScreenCoord( uv, rawDepth );

  if ( rawDepth < 1.0 ) {
    let startHeigh = -10.0;
    let endHeight = mix(2.0, 10.0, object.foginess);
    let startDistance = mix( 200.0, 0.0, object.foginess );
    let endDistance = mix( 800.0, 300.0, object.foginess );

    // Height based fog
    let t = saturate( (worldPos.y - startHeigh) / (endHeight - startHeigh) );
    let heightFogFactor = 1.0 - pow( t, 3.0 );

    // Distance based fog
    let distance = length(worldPos - object.cameraPosition);
    let distanceFogFactor = saturate( (distance - startDistance) / (endDistance - startDistance) );

    // Adjust blending based on fog factors
    let fogFactor = saturate( distanceFogFactor + ( heightFogFactor * smoothstep( 0.0, 0.3, saturate( distance / endDistance ) ) ) );

    let dir: vec3f = normalize( worldPos - object.cameraPosition );
    let sunDirection: vec3f = normalize( object.sunPosition );

    sunDotUp = dot(sunDirection, vec3f(0.0, 1.0, 0.0));

    let fogColor = getFogColor( dir, object.cameraPosition, sunDirection, blendedColor.rgb );
    return vec4f( 1.0 - exp( -fogColor / 8.6 ), max(blendedColor.a, fogFactor) );
  }

  return vec4f( adjustContrast(1.1, blendedColor.rgb), blendedColor.a );
}

fn worldFromScreenCoord( coord: vec2f, depthSample: f32 ) -> vec3f {
  let posClip = vec4f(coord.x * 2.0 - 1.0, (1.0 - coord.y) * 2.0 - 1.0, depthSample, 1.0);
  let posWordW = object.invViewProjectionMatrix * posClip;
  let posWorld = posWordW.xyz / posWordW.www;
  return posWorld;
}

fn adjustContrast( contrast: f32, input: vec3f ) -> vec3f {
    return (input - 0.5) * contrast + 0.5;
}