// uniforms
struct objectStruct {
	modelMatrix : mat4x4<f32>,
	projectionMatrix : mat4x4<f32>,
	modelViewMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>,
    padding1: f32, // Padding to align the next field
	sunPosition : vec3<f32>,
    padding2: f32, // Padding to align the next field
	up : vec3<f32>,
    padding3: f32, // Padding to align the next field
	iTime: f32,
    resolutionX: f32,
    resolutionY: f32,
    cloudiness: f32
};

@group( 0 ) @binding( 0 ) 
var<uniform> object : objectStruct;

@group( 0 ) @binding( 1 )
var noiseSampler: sampler;

@group( 0 ) @binding( 2 ) 
var noiseTexture: texture_2d<f32>;

@group( 0 ) @binding( 3 ) 
var pebblesTexture: texture_2d<f32>;

@group( 0 ) @binding( 4 )
var depthTexture: texture_depth_2d;

@group( 0 ) @binding( 5 )
var depthSampler: sampler_comparison;


// varyings
struct VaryingsStruct {
	@location( 0 ) vWorldPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32>,
	@builtin( position ) Vertex : vec4<f32>
};
var<private> varyings: VaryingsStruct;

struct OutputStruct {
	@location(0) color: vec4<f32>
};
var<private> output: OutputStruct;
var<private> sunDotUp: f32;

struct CloudResult {
    density: f32,
    cloudHeight: f32
};

const pi: f32 = 3.141592653589793238462643383279502884197169;
const cloudAmbientDayColor = vec3f(0.2, 0.5, 1.0);
const cloudAmbientNightColor = vec3f(0.1, 0.2, 0.5);
const fogColorDay = vec3f( 0.55, 0.8, 1.0 );
const fogColorEvening = vec3f( 0.75, 0.7, 0.5 );
const NUM_CLOUD_SAMPLES = 55;
const NUM_LIGHT_SAMPLES = 25;

// WEATHER STUFF
// ========================================================
// Cloud parameters
const EARTH_RADIUS: f32 = 6300e3;
const CLOUD_START: f32 = 600.0;
const CLOUD_HEIGHT: f32 = 600.0;
const SUN_POWER: vec3f = vec3(1.0,0.9,0.6) * 1200.;
const LOW_SCATTER: vec3f = vec3(1.0, 0.7, 0.5);


@vertex
fn vs( @location( 0 ) position : vec3<f32> ) -> VaryingsStruct {
	var worldPosition: vec4f = object.modelMatrix * vec4( position, 1.0 );
	varyings.vWorldPosition = worldPosition.xyz;
	varyings.Vertex = object.projectionMatrix * object.modelViewMatrix * vec4( position, 1.0 );
	varyings.Vertex.z = varyings.Vertex.w; // set z to camera.far
	varyings.vSunDirection = normalize( object.sunPosition );
	return varyings;
}

@fragment
fn fs( 
    @builtin(position) fragCoord: vec4<f32>,
	@location( 0 ) vWorldPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32> ) -> OutputStruct {

    // Define uv based on fragCoord
    let uv = fragCoord.xy / vec2(object.resolutionX, object.resolutionY);

    // Do not draw pixel if blocked by something in the z-buffer
    let rawDepth = textureSampleCompare( depthTexture, depthSampler, uv, 1 );
    if (rawDepth < 1.0) {
        // output.color = vec4<f32>(0.0, 0.0, 0.0, 0.0); // Set to fully transparent
        // return output;
    }

	let direction: vec3f = normalize( vWorldPosition - object.cameraPosition );

	// in scattering
    var cosTheta = dot( direction, vec3f(0.0, 1.0, 0.0) );

	// composition + solar disc
	let hemisphereMask: f32 = smoothstep( 0, 0.1, cosTheta );

	// The area below the horizon
    if ( hemisphereMask <= 0.0 ) {
        output.color = vec4f( 0.0,0.0,0.0, 0.0 );
        return output;
    }
    // The area above the horizon
    else {
        
        let atmosphereWithSunAndClouds = DrawCloudsAndSky( direction, object.cameraPosition, vSunDirection,  );
        output.color = atmosphereWithSunAndClouds;
        return output;
    } 
}

// ============================================================================
// CLOUD RENDERING
// ============================================================================

fn DrawCloudsAndSky(dir: vec3f, org: vec3f, vSunDirection: vec3f ) -> vec4f {
	var color = vec4f(.0);
    
    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));
 
    color = skyRay(org, dir, vSunDirection, false); 

 

	let sunInSkyMask = clamp( pow(1.75 + 1.75 * sunDotUp, 1.0), 0.0, 1.0 );
    let mu = dot(vSunDirection, dir) * sunInSkyMask;

    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + 100.0);

    // Cloudiness is from 0 to 1. Lets get a number 
    let fogSunIntensityModifier = mix( 1.0, 1.0, object.cloudiness );
    let darknessModifier = mix( 1.0, 0.08, clamp(pow(object.cloudiness, 6.0), 0.0, 1.0) );

    let fogPhase = 0.8 * HenyeyGreenstein(mu, 0.6 * fogSunIntensityModifier) + 0.5 * HenyeyGreenstein(mu, -0.6);

    var fogColor = mix( fogColorEvening, fogColorDay, clamp( sunDotUp, 0.0, 1.0 ) );

    // Reduce the fog color as the sun goes into the evening
    fogColor = fogColor * mix( 0.5, 1.0, sunDotUp );

    // Calculate the height of the clouds above the camera
    let cloudHeightAboveCamera = max(0.0, dir.y);

    // Adjust the fog effect based its distance 
    let fogFactor = exp(-0.0002 * fogDistance);

    let fogAffectedAlpha = mix( 0.4, color.a, fogFactor );

    return vec4f( mix( fogPhase * 0.1 * LOW_SCATTER * SUN_POWER + 10.0 * fogColor, color.xyz, exp(-0.0003 * fogDistance )) * darknessModifier, fogAffectedAlpha );

    ////  Adjust exposure
    // var atmosphereWithSunAndClouds = vec3f( 1.0 - exp(-color / 8.6));

    // return atmosphereWithSunAndClouds;


    // Adjust exposure
    // var atmosphereWithSunAndClouds = vec3f( 1.0 - exp(-color.xyz / 8.6));

    // return vec4f(atmosphereWithSunAndClouds, color.w);
}

fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f, fast: bool) -> vec4f {
    // Constants for the start and end of the atmosphere
    const ATM_START: f32 = EARTH_RADIUS + CLOUD_START;
    const ATM_END: f32 = ATM_START + CLOUD_HEIGHT;

    // Number of samples for ray marching
    var nbSample = NUM_CLOUD_SAMPLES;
    if (fast) {
        nbSample = 13;
    }

    // Initialize the color to black
    var color = vec3f(0.0);

    // Calculate the intersection of the ray with the start and end of the atmosphere
    let distToAtmStart = intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_START);
    let distToAtmEnd = intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_END);

    // Calculate the starting position of the ray inside the atmosphere
    var rayStartPosition = cameraPos + distToAtmStart * dir;
    let stepS = (distToAtmEnd - distToAtmStart) / f32(nbSample);

    // Initialize the transmittance to 1 (no light absorbed)
    var transmittance = 1.0;
    let mu = dot(sun_direction, dir);

    // Calculate the phase function for Mie scattering
    let phaseFunction = numericalMieFit(mu);
    rayStartPosition += dir * stepS * hash1(dot(dir, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001);

    let sunDotUp3 = pow(sunDotUp, 3.0);

    // If the ray is pointing upwards
    if (dir.y > 0.015) {
        for (var i = 0; i < nbSample; i++) {
            var cloudHeight: f32;
            let result = clouds(rayStartPosition, fast);
            let density = result.density;
            cloudHeight = result.cloudHeight;

            // If there is cloud density at this sample point
            if (density > 0.0) {
                // Calculate the light intensity scattered by the clouds
                let intensity = lightRay(rayStartPosition, phaseFunction, density, mu, sun_direction, cloudHeight, fast);

                // Calculate the ambient light 
                // Calulate the ambient color based on the time of day and the sun direction
                let cloudAmbientColor = mix(cloudAmbientNightColor, cloudAmbientDayColor, sunDotUp);

                let ambient = (0.5 + 0.6 * cloudHeight) * cloudAmbientColor * 6.5 + vec3f(0.8) * max(0.0, 1.0 - 2.0 * cloudHeight);

                // Calculate the radiance (light emitted by the clouds)
                var radiance = ambient + ( SUN_POWER * intensity * mix( vec3f(0.8, 0.5, 0.3), vec3f(1.0), clamp(sunDotUp3, 0.0, 1.0) ) );
                radiance *= density;
                color += transmittance * (radiance - radiance * exp(-density * stepS)) / density; // By Seb Hillaire
                transmittance *= exp(-density * stepS);

                // If the transmittance is very low, stop the loop
                if (transmittance <= 0.05) {
                    break;
                }
            }

            // Move to the next sample point
            rayStartPosition += dir * stepS;
        }
    }

    // color += transmittance;

    let up = dot(sun_direction, vec3f(0.0, 1.0, 0.0));
    let portionOfNightSky = pow(0.5 + 0.5 * up, 2.0);
    let portionOfDaySky = pow(0.5 + 0.5 * mu, 15.0);
    let dayNightSkyRatio = clamp(portionOfNightSky + portionOfDaySky, 0.0, 1.0);

    // Calculate the background color based on the direction of the ray
    var background = 
        mix( vec3f(0.0) * 10.0, 
            
            // A dark blue color for most of the sky mixed with a light blue color closer the sun
            6.0 * mix(vec3f(0.2, 0.52, 1.0), vec3f(0.8, 0.95, 1.0), portionOfDaySky) + 
            
            // a white haze at the horizon that fades out with altitude
            mix(vec3f(3.5), vec3f(0.0), min(1.0, 2.3 * dir.y)),

        dayNightSkyRatio );

    // If not in fast mode, draw the sun disk
    background += transmittance * vec3f(1e4 * smoothstep(0.9998, 1.0, mu));

    color += background * transmittance;

    return vec4f(color, 1.0 - transmittance);
}

// Noise generation functions (by iq)
fn hash1( n: f32 ) -> f32 {
    return fract( sin( n ) * 43758.5453);
}

fn hash2( p: vec2f )  -> f32 {
    return fract( sin( dot( p, vec2f( 127.1,311.7 ))) * 43758.5453123);
}

fn noise3( x: vec3f ) -> f32 {
    let p = floor(x);
    var f = fract(x);
    f = f * f * ( 3.0 - 2.0 * f );
	let uv = ( p.xy + vec2f( 37.0, 17.0 ) * p.z) + f.xy;
    let rg = textureSampleLevel( noiseTexture, noiseSampler, (uv + 0.5 ) / 256.0, 0.0).yx;
	return mix( rg.x, rg.y, f.z );
}

/**
 * The fbm function generates fractal Brownian motion (fbm) noise.
 * This function is used to create complex, natural-looking textures by combining multiple layers of noise.
 *
 * @param p2 - The input 3D vector used to generate the noise.
 * @return The generated fbm noise value.
 */
fn fbm( position: vec3f )  -> f32 {
    var p = position;
    let m = mat3x3<f32>( 0.00,  0.80,  0.60,
              -0.80,  0.36, -0.48,
              -0.60, -0.48,  0.64 );    
    var f: f32;
    f  = 0.5000 * noise3( p ); 
    p = m * p * 2.02;
    
    f += 0.2500 * noise3( p ); 
    p = m * p * 2.03;
    
    f += 0.1250 * noise3( p );
    return f;
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

fn clouds(position: vec3f, fast: bool) -> CloudResult {
    // Speed at which clouds move, based on time
    let cloudMovementSpeed = object.iTime * 0.004 * mix(1.0, 0.3, object.cloudiness);
    var p = position;

    var result: CloudResult;
    // Calculate the height above the Earth's surface
    let atmoHeight: f32 = length(p - vec3f(0.0, -EARTH_RADIUS, 0.0)) - EARTH_RADIUS;
    
    // Normalize the cloud height to a range of 0 to 1
    let cloudHeight = clamp((atmoHeight - CLOUD_START) / CLOUD_HEIGHT, 0.0, 1.0);
    result.cloudHeight = cloudHeight;

    // Move the clouds in the z direction
    p.z += cloudMovementSpeed * 10.3;
    
    // Sample the large-scale weather pattern
    var largeWeather: f32 = clamp((textureSampleLevel(pebblesTexture, noiseSampler, -0.00005 * p.zx, 0.0).x - 0.18) * 5.0 *  object.cloudiness, 0.0, 2.0);

    // Move the clouds in the x direction
    p.x += cloudMovementSpeed * 8.3;
    
    // Sample the smaller-scale weather pattern and combine with large-scale pattern
    var weather: f32 = largeWeather * max( clamp( pow(object.cloudiness, 6.1), 0.0, 1.0 ), textureSampleLevel(pebblesTexture, noiseSampler, 0.0002 * p.zx, 0.0).x - 0.28) / 0.52;
    
    // Apply smoothstep to the cloud height to create a smooth transition
    weather *= smoothstep(0.0, 0.5, cloudHeight) * smoothstep(1.0, 0.5, cloudHeight);
    
    // Shape the clouds using a power function
    let cloudShape: f32 = pow(weather, 0.3 + 1.5 * smoothstep(0.2, 0.5, cloudHeight));
    
    // If the cloud shape is zero, return early
    if (cloudShape <= 0.0) {
        result.density = 0.0;
        return result;
    }

    // Move the clouds further in the x direction
    p.x += cloudMovementSpeed * 12.3;
    // Calculate the cloud density using fractal Brownian motion (fbm)
    var den = max(0.0, cloudShape - 0.7 * fbm(p * 0.01));

    // If the cloud density is zero, return early
    if (den <= 0.0) {
        result.density = 0.0;
        return result;
    }
    
    // If in fast mode, return a simplified cloud density
    if (fast) {
        result.density = largeWeather * 0.2 * min(1.0, 5.0 * den);
        return result; 
    }

    // Move the clouds in the y direction
    p.y += cloudMovementSpeed * 15.2;
    // Calculate the final cloud density using fbm
    den = max(0.0, den - 0.2 * fbm(p * 0.05));
    
    // Calculate the final density value based on the cloud density and weather pattern
    result.density = largeWeather * 0.2 * min(1.0, 5.0 * den);
    return result; 
}

/**
 * The numericalMieFit function calculates an approximation of the Mie scattering phase function.
 * This function is optimized to capture the low-intensity behavior of Mie scattering.
 *
 * @param costh - The cosine of the scattering angle.
 * @return The approximated Mie scattering phase function value.
 */
fn numericalMieFit(costh: f32) -> f32 {
    // Precomputed parameters from https://www.shadertoy.com/view/4sjBDG
    let p0: f32 = 9.805233e-06;
    let p1: f32 = -65.0;
    let p2: f32 = -55.0;
    let p3: f32 = 0.8194068;
    let p4: f32 = 0.1388198;
    let p5: f32 = -83.70334;
    let p6: f32 = 7.810083;
    let p7: f32 = 0.002054747;
    let p8: f32 = 0.02600563;
    let p9: f32 = -4.552125e-12;

    // Calculate an intermediate value based on the cosine of the scattering angle and a precomputed parameter
    let p1_intermediate: f32 = costh + p3;
    
    // Calculate the exponential values for the fit
    let expValues: vec4f = exp(vec4f(
        p1 * costh + p2,  // Exponential term 1
        p5 * p1_intermediate * p1_intermediate,  // Exponential term 2
        p6 * costh,  // Exponential term 3
        p9 * costh  // Exponential term 4
    ));
    
    // Precomputed weights for the exponential terms
    let expValWeight: vec4f = vec4f(
        p0,  // Weight for term 1
        p4,  // Weight for term 2
        p7,  // Weight for term 3
        p8   // Weight for term 4
    );
    
    // Calculate the dot product of the exponential values and their weights to get the final phase function value
    return dot(expValues, expValWeight);
}

fn lightRay(rayStartPosition: vec3f, phaseFunction: f32, dC: f32, mu: f32, sun_direction: vec3f, cloudHeight2: f32, fast: bool) -> f32 {
    // Initialize the starting position of the light ray
    var rayStartPos = rayStartPosition;
    
    // Number of samples for light ray marching
    var nbSampleLight = NUM_LIGHT_SAMPLES;
    if (fast) {
        nbSampleLight = 7;
    }

    // Maximum distance for the light ray
    let zMaxl: f32 = 600.0;
    // Step size for each sample along the light ray
    let stepL: f32 = zMaxl / f32(nbSampleLight);
    
    // Initialize the light ray density to zero
    var lighRayDen: f32 = 0.0;
    // Offset the starting position slightly to avoid artifacts
    rayStartPos += sun_direction * stepL * hash1(dot(rayStartPos, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001);

    // Initialize the cloud height
    var cloudHeight: f32 = 0.0;

    // Sample the light ray
    for (var j = 0; j < nbSampleLight; j++) {
        // Get the cloud density and height at the current sample point
        let result = clouds( rayStartPos + sun_direction * f32(j) * stepL, fast);
        cloudHeight = result.cloudHeight;
        lighRayDen += result.density;
    }

     // Calculate the angle between the sun direction and the vertical direction (y-axis)
    let sunAngle = dot(sun_direction, vec3f(0.0, 1.0, 0.0));
    // Apply a gradient-based reduction to the light intensity if the sun is below the horizon
    let sunIntensityModifier = smoothstep(0.0, 0.1, sunAngle);
    
    // If in fast mode, return a simplified calculation
    if (fast) {
        return (0.5 * exp(-0.4 * stepL * lighRayDen) + max(0.0, -mu * 0.6 + 0.3) * exp(-0.02 * stepL * lighRayDen)) * phaseFunction;
    }

    // Calculate the scattering amount based on the angle between the light ray and the view direction
    let scatterAmount: f32 = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
    // Calculate the Beer's law attenuation
    let beersLaw: f32 = exp(-stepL * lighRayDen) + 0.5 * scatterAmount * exp(-0.1 * stepL * lighRayDen) + scatterAmount * 0.4 * exp(-0.02 * stepL * lighRayDen);
    // Return the final light intensity
    return sunIntensityModifier * beersLaw * phaseFunction * mix(0.05 + 1.5 * pow(min(1.0, dC * 8.5), 0.3 + 5.5 * cloudHeight), 1.0, clamp(lighRayDen * 0.4, 0.0, 1.0));
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