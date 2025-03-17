// uniforms
struct ObjectStruct {
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
var<uniform> object: ObjectStruct;

@group( 0 ) @binding( 1 )
var noiseSampler: sampler;

@group( 0 ) @binding( 2 ) 
var noiseTexture: texture_2d<f32>;

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
    sky: f32,
    cloudHeight: f32
};

const pi: f32 = 3.141592653589793238462643383279502884197169;
const cloudAmbientDayColor = vec3f(0.2, 0.5, 1.0);
const cloudAmbientNightColor = vec3f(0.1, 0.2, 0.5);
const fogColorDay = vec3f( 0.55, 0.8, 1.0 );
const fogColorEvening = vec3f( 0.75, 0.7, 0.5 );

// WEATHER STUFF
// ========================================================
// Cloud parameters
const EARTH_RADIUS: f32 = 6300e3;
const CLOUD_START: f32 = 1000.0;
const CLOUD_HEIGHT: f32 = 1200.0;
const SUN_POWER: vec3f = vec3(1.0,0.9,0.6) * 1200.;
const LOW_SCATTER: vec3f = vec3(1.0, 0.7, 0.5);

// ========================================================
// NIGHT SKY STUFF
const galaxyNormal = vec3f(0.577, 0.577, 0.577); // Which direction the galaxy is facing
const galaxyCenterDir = vec3f(-0.707, 0, 0.707); // The direction of the center of the galaxy

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

	let direction: vec3f = normalize( vWorldPosition - object.cameraPosition );

	// in scattering
	// var cosTheta: f32 = dot( direction, vSunDirection );
    var cosTheta = dot( direction, vec3f(0.0, 1.0, 0.0) );

	// composition + solar disc
	let hemisphereMask: f32 = smoothstep( -0.3, 0.1, cosTheta );

    // The area on the horizon where the sun and earth meet
    if ( hemisphereMask < 1 && hemisphereMask > 0.0 ) {
        let nightSky: vec3f = DrawNightSky(direction, fragCoord.xy);
        let atmosphereWithSunAndClouds = DrawCloudsAndSky( direction, object.cameraPosition, vSunDirection, nightSky );
        output.color = vec4f( mix( nightSky, atmosphereWithSunAndClouds, hemisphereMask), 1.0 );
        // output.color = vec4f( 1.0, 0.0, 0.0, 1.0 );
        return output;
    }
    // The area below the horizon
    else if ( hemisphereMask <= 0.0 ) {
        output.color = vec4f( 0.0,0.0,0.0, 1.0 );
        return output;
    }
    // The area above the horizon
    else {
        let nightSky: vec3f = DrawNightSky(direction, fragCoord.xy);
        let atmosphereWithSunAndClouds = DrawCloudsAndSky( direction, object.cameraPosition, vSunDirection, nightSky );
        output.color = vec4f( atmosphereWithSunAndClouds, 1.0 );
        return output;
    } 
}

// ============================================================================
// CLOUD RENDERING
// ============================================================================
fn DrawCloudsAndSky(dir: vec3f, org: vec3f, vSunDirection: vec3f, nightSky: vec3f ) -> vec3f {
	var color = vec3f(.0);
    
    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));

	let sunInSkyMask = clamp( pow(1.75 + 1.75 * sunDotUp, 1.0), 0.0, 1.0 );
    let mu = dot(vSunDirection, dir) * sunInSkyMask;
    
    color = skyRay(org, dir, vSunDirection, false, nightSky); 

    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + 160.0);

    // Cloudiness is from 0 to 1. Lets get a number 
    let fogSunIntensityModifier = mix( 1.0, 0.95, object.cloudiness );
    let darknessModifier = mix( 1.0, 0.18, clamp(pow(object.cloudiness, 9.0), 0.0, 1.0) );

    let fogPhase = 0.8 * HenyeyGreenstein(mu, 0.9 * fogSunIntensityModifier); //  + 0.5 * HenyeyGreenstein(mu, -0.6);

    var fogColor = mix( fogColorEvening, fogColorDay, clamp( sunDotUp, 0.0, 1.0 ) );

    // Reduce the fog color as the sun goes into the evening
    fogColor = fogColor * mix( 0.5, 1.0, sunDotUp );

    color = mix( fogPhase * 0.1 * LOW_SCATTER * SUN_POWER + 10.0 * fogColor, color, exp(-0.0003 * fogDistance )) * darknessModifier;
    
    // Adjust exposure
    var atmosphereWithSunAndClouds = vec3f( 1.0 - exp(-color / 8.6));

    return atmosphereWithSunAndClouds;
}

fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f, fast: bool, nightSky: vec3f) -> vec3f {
    // Constants for the start and end of the atmosphere
    const ATM_START: f32 = EARTH_RADIUS + CLOUD_START;
    const ATM_END: f32 = ATM_START + CLOUD_HEIGHT;

    // Initialize the color to black
    var color = vec3f(0.0);

    let mu = dot(sun_direction, dir);
    let cloudMovementSpeed = object.iTime * 0.00004 * mix(1.0, 0.3, object.cloudiness);

   // Create a rotation matrix around the z-axis
    let cosAngle = cos(cloudMovementSpeed);
    let sinAngle = sin(cloudMovementSpeed);
    let rotationMatrix = mat3x3<f32>(
        vec3f(cosAngle, -sinAngle, 0.0),
        vec3f(sinAngle, cosAngle, 0.0),
        vec3f(0.0, 0.0, 1.0)
    );

    // Rotate the direction vector
    let rotatedDir = rotationMatrix * dir;
    
    // Adds clouds at a higher altitude (1000 meters above the atmosphere)
    var intersectionPoint = cameraPos + intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_END + 2000.0) * rotatedDir;
    
    let cloudCoverFactor = mix( 0.6, 0.3, object.cloudiness );
    color += mix(cloudAmbientNightColor, vec3f(2.0), sunDotUp) * max( 0.0, fbm(vec3f(1.0, 1.0, 1.8) * intersectionPoint * 0.001) - cloudCoverFactor) * 2.0;

    let up = dot(sun_direction, vec3f(0.0, 1.0, 0.0));
    let portionOfNightSky = pow(0.5 + 0.5 * up, 2.0);
    let portionOfDaySky = pow(0.5 + 0.5 * mu, 15.0);
    let dayNightSkyRatio = clamp(portionOfNightSky + portionOfDaySky, 0.0, 1.0);


    let skyPinkFactor = smoothstep( -0.3, 0.5, sunDotUp );
    let darkerBlue = vec3f(0.2, 0.52, 1.0);
    let lighterBlue = vec3f(0.8, 0.95, 1.0);

    let redyPink = vec3f( 0.95, 0.3, 0.2 );
    let deepOrange = vec3f( 1.0, 0.5, 0.2 );

    var dayTimeColor = 
        // mix between the colors of the sky at different times of day
        6.0 * mix( mix( redyPink, darkerBlue, skyPinkFactor ), mix( deepOrange, lighterBlue, skyPinkFactor ), portionOfDaySky ) + 
        
        // a white haze at the horizon that fades out with altitude
        mix(vec3f(3.5), vec3f(0.0), min(1.0, 2.3 * dir.y));

    // Calculate the background color based on the direction of the ray
    var background = mix( nightSky * 10.0,  dayTimeColor, dayNightSkyRatio );

    // If not in fast mode, draw the sun disk
    background += vec3f(1e4 * smoothstep(0.9998, 1.0, mu));

    // Add the background color to the final color
    color += background;
    return color;
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

// ============================================================================
// NIGHT RENDERING THINGS 
// ============================================================================

fn DrawNightSky(dir2: vec3f, fragCoord: vec2f ) -> vec3f {
    let dir = dir2 + vec3f( 0.0, 0.0, object.iTime * 0.0000005 );
    let ar = (object.resolutionX / object.resolutionY) * 200.0;

    // Rotation angle based on time
    let rotationAngle = object.iTime * 0.00001; // Adjust the speed of rotation as needed

    // Rotation matrix around the Y-axis
    let cosAngle = cos(rotationAngle);
    let sinAngle = sin(rotationAngle);
    let rotationMatrix = mat3x3<f32>(
        vec3f(cosAngle, -sinAngle, 0.0),
        vec3f(sinAngle, cosAngle, 0.0),
        vec3f(0.0, 0.0, 1.0)
    );

    // Apply the rotation to the direction vector
    let rotatedDir = rotationMatrix * dir;
	let yp = dirToYawPitch(rotatedDir);

	// Stars (noise-based)
	var starIntensity = mix(-1.5, 2.0, noiseForStars(500.0 * rotatedDir) + 0.10 * noiseForStars(2.0 * rotatedDir));
	starIntensity = clamp(starIntensity, 0.0, 1.0);
	let starColor = vec3f(
		0.7 + 0.3 * noiseForStars(100.0 * rotatedDir),
		0.7 + 0.3 * noiseForStars(103.0 * rotatedDir),
		0.7 + 0.3 * noiseForStars(106.0 * rotatedDir)
	);
	let stars = starIntensity * starColor;

	// Stars (pixel perfect)
	let starScale = 30.0;
	let ypm = vec2f( // This is to make the stars more evenly distributed
		yp.x / pi,
		sin(yp.y)
	);

	let cell = floor(ypm * starScale);
	var randPos = vec2f(  // Copilot-generated, may not be the best, but looks fine
		fract(sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453),
		fract(sin(dot(cell, vec2f(269.5, 183.3))) * 43758.5453)
	);
	randPos = mix(vec2f(0.1), vec2f(0.9), randPos); // Avoid the edges, where the stars can clip in and out
	let starYpm = (cell + randPos) / starScale;
	let starYp = vec2f( // This undoes the above transformation
		starYpm.x * pi,
		asin(starYpm.y)
	);

	let starUvVec3 = rotatedDir;
	var starUv = starUvVec3.xy / starUvVec3.z;
	starUv.x /= ar;

	let starCoord = (starUv + 1.0) / 2.0 * vec2f(object.resolutionX, object.resolutionY);
	var starIntensity2 = 0.0;

	if (all(floor(starCoord) == floor(fragCoord))) { // Apparently fragCoord has values that end in .5?
		starIntensity2 = fract(sin(dot(cell, vec2f(113.5, 271.9))) * 43758.5453);
		starIntensity2 *= 0.7 + 0.7 * noiseForStars(20.0 * rotatedDir) + 0.4*noiseForStars(2.0 * rotatedDir);
	}

	let stars2 = vec3f(starIntensity2);

	// Galaxy
	var galaxyPlane = 8.0 * dot(galaxyNormal, rotatedDir);
	galaxyPlane = 1.0 / (galaxyPlane * galaxyPlane + 1.0);
	var galaxyCenter = dot(galaxyCenterDir, rotatedDir) * 0.5 + 0.5;
	galaxyCenter = galaxyCenter * galaxyCenter;
	let galaxyIntensity = galaxyPlane * galaxyCenter;
	let galaxyColor = vec3f(0.5, 0.5, 1.0);
	let galaxy = 0.8 * galaxyIntensity * galaxyColor;

	// Dust
	var d = 0.0;
	d += 1.00 * noiseForStars(10.0 * rotatedDir);
	d += 0.50 * noiseForStars(20.0 * rotatedDir);
	d += 0.25 * noiseForStars(100.0 * rotatedDir);
	d += 0.20 * noiseForStars(200.0 * rotatedDir);
	let dustColor = vec3f(0.5, 0.4, 0.3);
	let dust = vec3f(1.0 - (d * 0.6 + 1.2) * galaxyPlane * galaxyCenter) + dustColor;

	let color = stars + stars2 + galaxy * dust;
	return color;
}

fn hashForStars( p: vec3f ) -> vec3f {
	let p2 = vec3f( dot(p,vec3f(127.1,311.7, 74.7)),
			  dot(p,vec3f(269.5,183.3,246.1)),
			  dot(p,vec3f(113.5,271.9,124.6)));

	return -1.0 + 2.0 * fract( sin( p2 ) *43758.5453123 );
}

fn dirToYawPitch( dir: vec3f ) -> vec2f {
	return vec2f(atan2(dir.x, dir.z), asin(dir.y));
}

fn noiseForStars( p: vec3f ) -> f32
{
    let i = floor( p );
    let f = fract( p );
    let u = f*f*(3.0-2.0*f);

    return mix( mix( mix( dot( hashForStars( i + vec3f(0.0,0.0,0.0) ), f - vec3f(0.0,0.0,0.0) ), 
                          dot( hashForStars( i + vec3f(1.0,0.0,0.0) ), f - vec3f(1.0,0.0,0.0) ), u.x),
                     mix( dot( hashForStars( i + vec3f(0.0,1.0,0.0) ), f - vec3f(0.0,1.0,0.0) ), 
                          dot( hashForStars( i + vec3f(1.0,1.0,0.0) ), f - vec3f(1.0,1.0,0.0) ), u.x), u.y),
                mix( mix( dot( hashForStars( i + vec3f(0.0,0.0,1.0) ), f - vec3f(0.0,0.0,1.0) ), 
                          dot( hashForStars( i + vec3f(1.0,0.0,1.0) ), f - vec3f(1.0,0.0,1.0) ), u.x),
                     mix( dot( hashForStars( i + vec3f(0.0,1.0,1.0) ), f - vec3f(0.0,1.0,1.0) ), 
                          dot( hashForStars( i + vec3f(1.0,1.0,1.0) ), f - vec3f(1.0,1.0,1.0) ), u.x), u.y), u.z );
}