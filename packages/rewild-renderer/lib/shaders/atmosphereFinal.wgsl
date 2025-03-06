struct ObjectStruct { 
    invProjectionMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    resolution: vec2f,
    iTime: f32,
    cloudiness: f32,
    sunPosition: vec3f,
    cameraPosition: vec3f,
    padding0: f32,
};

struct OurVertexShaderOutput {
  @builtin(position) position: vec4f, 
  @location(0) vSunDirection : vec3<f32>
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
  vsOutput.vSunDirection = normalize( object.sunPosition );
  return vsOutput;
}

@group(0) @binding(0) 
var sky: texture_2d<f32>;

@group(0) @binding(1) 
var clouds: texture_2d<f32>;

@group( 0 ) @binding(2) 
var<uniform> object: ObjectStruct;

@group(0) @binding(3)
var cloudsSampler: sampler;

@group( 0 ) @binding( 4 )
var depthTexture: texture_depth_2d;

// @group( 0 ) @binding( 5 )
// var depthSampler: sampler_comparison;

// WEATHER STUFF
// ========================================================
// Cloud parameters
const EARTH_RADIUS: f32 = 6300e3;
const CLOUD_START: f32 = 1000.0;
const CLOUD_HEIGHT: f32 = 1200.0;
const SUN_POWER: vec3f = vec3(1.0,0.9,0.6) * 800.;
const LOW_SCATTER: vec3f = vec3(1.0, 0.7, 0.5);
const pi: f32 = 3.141592653589793238462643383279502884197169;
const cloudAmbientDayColor = vec3f(0.2, 0.5, 1.0);
const cloudAmbientNightColor = vec3f(0.1, 0.2, 0.5);
const fogColorDay = vec3f( 0.55, 0.8, 1.0 );
const fogColorEvening = vec3f( 0.75, 0.7, 0.5 );

@fragment fn fs( 
  @builtin(position) fragCoord: vec4<f32>,
  @location(0) vSunDirection : vec3<f32>
  ) -> @location(0) vec4f {
  // Define uv based on fragCoord
  let uv = fragCoord.xy / vec2(object.resolution);

  // Convert uv to texture coordinates
  let texCoord = vec2<i32>(uv * vec2<f32>(textureDimensions(depthTexture)));

  // Load the depth value directly
  let rawDepth = textureLoad(depthTexture, texCoord, 0);

  if (rawDepth < 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0); 
  }

  let temp = fragCoord.xy * object.iTime;
  
  // Do not draw pixel if blocked by something in the z-buffer
  let sky = textureSampleLevel( sky, cloudsSampler, uv, 0 );
  let clouds = textureSampleLevel( clouds, cloudsSampler, uv, 0 );
 

  // Apply smoothstep to the cloud alpha to soften edges
  let smoothAlpha = smoothstep(0.0, 1.0, clouds.a ); 
  let preMultipliedClouds = vec4<f32>(clouds.rgb * smoothAlpha, smoothAlpha);

  // Blend sky and clouds based on alpha
  var blendedColor = sky * (1.0 - preMultipliedClouds.a) + preMultipliedClouds;


  // // Add global fog to the scene 
  // // ========================================================

  // // Convert NDC to view space using the inverse projection matrix
  // let viewPos = getViewPosition( uv, rawDepth, object.invProjectionMatrix );

  // // Convert view space to world space using the inverse view matrix
  // var worldPos = object.invViewMatrix * vec4f(viewPos.xyz, 1.0);

  // // Calculate the direction from the camera to the world position
  // let dir = normalize( worldPos.xyz - object.cameraPosition );
 

  // let test = dot(dir, vSunDirection);
  return vec4f( adjustContrast(1.1, blendedColor.rgb), blendedColor.a  );
}

fn getViewPosition(uv: vec2<f32>, linearDepth: f32, invProjectionMatrix: mat4x4<f32>) -> vec4<f32> {
    var clipPos = vec4<f32>(uv.x * 2.0 - 1.0, ( uv.y * 2.0 - 1.0 ) * -1.0, 0.0, 1.0);

    // 2) Depth is in view space, so move clipPos.z = NDC
    //    We can approximate by reprojecting with the camera proj matrix if we have an inverse.
    //    Alternatively, if we have 'viewZ' from perspectiveDepthToViewZ, set clipPos.z to that reprojected coordinate.
    clipPos.z = linearDepth * 2.0 - 1.0;

    // 3) Transform by inverseProjectionMatrix to get view-space
    var viewPos = invProjectionMatrix * clipPos;
    // Perspective divide
    return vec4f( viewPos.xyz / viewPos.w, viewPos.w );
}

/**
 * The HenyeyGreenstein function calculates the Henyey-Greenstein phase function.
 * This function is used to model the scattering of light in a medium, such as the atmosphere.
 * It describes the angular distribution of scattered light.
 *
 * @param mu - The cosine of the scattering angle.
 * @param inG - The asymmetry parameter, which determines the directionality of the scattering.
 *              A value of 0 represents isotropic scattering, positive values represent forward scattering,
 *              and negative values represent backward scattering.
 * @return The phase function value, which describes the probability of light being scattered in a particular direction.
 */
fn HenyeyGreenstein( mu: f32, inG: f32)  -> f32 {
	return ( 1. - inG * inG ) / ( pow( 1. + inG * inG - 2.0 * inG * mu, 1.5 ) * 4.0 * pi );
}

  /**
* The intersectSphere function calculates the intersection of a ray with a sphere. 
* It returns the distance from the ray's origin to the intersection point. 
* If there is no intersection, it returns -1.0.
*/
fn intersectSphere(origin: vec3f, dir: vec3f, spherePos: vec3f, sphereRad: f32)  -> f32 {
    // Calculate the vector from the ray origin to the sphere center
	let oc = origin - spherePos;

    // Calculate the coefficients of the quadratic equation
	let b = 2.0 * dot(dir, oc);
	let c = dot(oc, oc) - sphereRad*sphereRad;
	let disc = b * b - 4.0 * c;

	if (disc < 0.0) {
		return -1.0; 
    }

    // Calculate the square root of the discriminant
    var divider = 0.0;
    if ( b < 0.0 ) {
        divider = -sqrt(disc);
    }
    else { 
        divider = sqrt(disc);
    }

    // Calculate the two possible solutions of the quadratic equation
    var q = (-b + (divider)) / 2.0;
	var t0 = q;
	var t1 = c / q;

    // Ensure t0 is the smaller value
	if ( t0 > t1 ) {
		var temp = t0;
		t0 = t1;
		t1 = temp;
	}

    // If both solutions are negative, the sphere is behind the ray
	if ( t1 < 0.0 ) {
		return -1.0;
    }
    
    // If t0 is negative, the intersection point is in front of the ray origin
    if (t0 < 0.0) {
        return t1;
    }

    // Return the nearest intersection point
    return t0;
}

fn adjustContrast( contrast: f32, input: vec3f ) -> vec3f {
    return (input - 0.5) * contrast + 0.5;
}