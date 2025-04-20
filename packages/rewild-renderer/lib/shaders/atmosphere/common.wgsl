const PI: f32 = 3.141592653589793238462643383279502884197169;
const FOG_COLOR_DAY = vec3f( 0.55, 0.8, 1.0 );
const FOG_COLOR_EVENING = vec3f( 0.75, 0.7, 0.5 );
const CLOUD_AMBIENT_DAY_COLOR = vec3f(0.2, 0.5, 1.0);
const CLOUD_AMBIENT_NIGHT_COLOR = vec3f(0.1, 0.2, 0.5);
const EARTH_RADIUS: f32 = 6300e3;
const CLOUD_START: f32 = 600.0;
const CLOUD_HEIGHT: f32 = 600.0;
const SUN_POWER: vec3f = vec3(1.0,0.9,0.6) * 1200.;
const LOW_SCATTER: vec3f = vec3(1.0, 0.7, 0.5);

struct VaryingsStruct {
	@location( 0 ) vWorldPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32>,
	@builtin( position ) Vertex : vec4<f32>
};

struct ObjectStruct {
	modelMatrix : mat4x4<f32>,
	projectionMatrix : mat4x4<f32>,
	modelViewMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>,
    resolutionScale: f32,
	sunPosition : vec3<f32>,
    padding2: f32, // Padding to align the next field
	up : vec3<f32>,
    padding3: f32, // Padding to align the next field
	iTime: f32,
    resolutionX: f32,
    resolutionY: f32,
    cloudiness: f32
};

struct OutputStruct {
	@location(0) color: vec4<f32>
};

// Noise generation functions (by iq)
fn hash1( n: f32 ) -> f32 {
    return fract( sin( n ) * 43758.5453);
}

fn hash2( p: vec2f )  -> f32 {
    return fract( sin( dot( p, vec2f( 127.1,311.7 ))) * 43758.5453123);
}

fn hash3( p: vec3f ) -> vec3f {
	let p2 = vec3f( dot(p,vec3f(127.1,311.7, 74.7)),
			  dot(p,vec3f(269.5,183.3,246.1)),
			  dot(p,vec3f(113.5,271.9,124.6)));

	return -1.0 + 2.0 * fract( sin( p2 ) *43758.5453123 );
}

fn noise3( x: vec3f ) -> f32 {
    let p = floor(x);
    var f = fract(x);
    f = f * f * ( 3.0 - 2.0 * f );
	let uv = ( p.xy + vec2f( 37.0, 17.0 ) * p.z) + f.xy;
    let rg = textureSampleLevel( noiseTexture, noiseSampler, (uv + 0.5 ) / 256.0, 0.0).yx;
	return mix( rg.x, rg.y, f.z );
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


fn getFogColor(dir: vec3f, org: vec3f, vSunDirection: vec3f, originalColor: vec3f ) -> vec3f {
	let sunInSkyMask = clamp( pow(1.75 + 1.75 * sunDotUp, 1.0), 0.0, 1.0 );
    let mu = dot(vSunDirection, dir) * sunInSkyMask;

    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + 300.0);

    // Cloudiness is from 0 to 1. Lets get a number 
    let fogSunIntensityModifier = mix( 1.0, 0.95, object.cloudiness );
    let darknessModifier = mix( 1.0, 0.08, clamp(pow(object.cloudiness, 6.0), 0.0, 1.0) );

    let fogPhase = 0.8 * HenyeyGreenstein(mu, 0.75 * fogSunIntensityModifier); // + 0.5 * HenyeyGreenstein(mu, -0.6);

    var fogColor = mix( FOG_COLOR_EVENING, FOG_COLOR_DAY, clamp( sunDotUp, 0.0, 1.0 ) );

    // Reduce the fog color as the sun goes into the evening
    fogColor = fogColor * mix( 0.5, 1.0, sunDotUp );

    return mix( fogPhase * 0.1 * LOW_SCATTER * SUN_POWER + 10.0 * fogColor, originalColor.xyz, exp(-0.0003 * fogDistance )) * darknessModifier;
}

fn getAtmosphereColor(sun_direction: vec3f, dir: vec3f, mu: f32, nightColor: vec3f ) -> vec3f {
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
    var background = mix( nightColor, dayTimeColor, dayNightSkyRatio );

    // Draw the sun disk
    background += vec3f(1e4 * smoothstep(0.9998, 1.0, mu));

    return background;
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
	return ( 1. - inG * inG ) / ( pow( 1. + inG * inG - 2.0 * inG * mu, 1.5 ) * 4.0 * PI );
}

@vertex
fn vs( @location( 0 ) position : vec3<f32> ) -> VaryingsStruct {
	var worldPosition: vec4f = object.modelMatrix * vec4( position, 1.0 );
	varyings.vWorldPosition = worldPosition.xyz;
	varyings.Vertex = object.projectionMatrix * object.modelViewMatrix * vec4( position, 1.0 );
	varyings.Vertex.z = varyings.Vertex.w; // set z to camera.far
	varyings.vSunDirection = normalize( object.sunPosition );
	return varyings;
}