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
	rayleigh : f32, 
	turbidity : f32, 
	mieCoefficient : f32, 
	mieDirectionalG : f32, 
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

// @group(0) @binding(1) var<storage, read> noiseBuffer: array<f32>;


// varyings
struct VaryingsStruct {
	@location( 0 ) vSunE : f32,
	@location( 1 ) vBetaR : vec3<f32>,
	@location( 2 ) vWorldPosition : vec3<f32>,
	@location( 3 ) positionLocal : vec3<f32>,
	@location( 4 ) vSunDirection : vec3<f32>,
	@location( 5 ) vBetaM : vec3<f32>,
	@location( 6 ) vSunfade : f32,
	@builtin( position ) Vertex : vec4<f32>
};
var<private> varyings: VaryingsStruct;

// ============================================================================
// first, lets define some constants to use (planet radius, position, and scattering coefficients)
const PLANET_POS  = vec3f(0.0); /* the position of the planet */
const PLANET_RADIUS  = 6371e3; /* radius of the planet */
const ATMOS_RADIUS = 6431e3; /* radius of the atmosphere */

// scattering coeffs
const RAY_BETA=vec3f(5.5e-6, 13.0e-6, 22.4e-6); /* rayleigh, affects the color of the sky */
const MIE_BETA= vec3f(21e-6); /* mie, affects the color of the blob around the sun */
const AMBIENT_BETA= vec3f(0.0); /* ambient, affects the scattering color when there is no lighting from the sun */
const ABSORPTION_BETA= vec3f(2.04e-5, 4.97e-5, 1.95e-6); /* what color gets absorbed by the atmosphere (Due to things like ozone) */
const G= 0.78; /* mie scattering direction, or how big the blob around the sun is */

// and the heights (how far to go up before the scattering has no effect)
const HEIGHT_RAY = 6e3; /* rayleigh height */
const HEIGHT_MIE = 1.2e3; /* and mie */
const HEIGHT_ABSORPTION = 80e3; /* at what height the absorption is at it's maximum */
const ABSORPTION_FALLOFF = 8e3; /* how much the absorption decreases the further away it gets from the maximum height */

// and the steps (more looks better, but is slower)
// the primary step has the most effect on looks

// and these on desktop
const PRIMARY_STEPS = 8; // 32 /* primary steps, affects quality the most */
const LIGHT_STEPS = 4; // 8 /* light steps, how much steps in the light direction are taken */
// ============================================================================


// constants for atmospheric scattering
const e : f32 = 2.71828182845904523536028747135266249775724709369995957;
const pi: f32 = 3.141592653589793238462643383279502884197169;

// wavelength of used primaries, according to preetham
const lambda: vec3f = vec3f( 680E-9, 550E-9, 450E-9 );
// this pre-calculation replaces older TotalRayleigh(vec3 lambda) function:
// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
const totalRayleigh: vec3f = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

// mie stuff
// K coefficient for the primaries
const v: f32 = 4.0;
const K: vec3f = vec3( 0.686, 0.678, 0.666 );
// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
const MieConst: vec3f = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

// earth shadow hack
// cutoffAngle = pi / 1.95;
const cutoffAngle: f32 = 1.6110731556870734;
const steepness: f32 = 1.5;
const EE: f32 = 1000.0;



// WEATHER STUFF
// ========================================================
// Cloud parameters
const EARTH_RADIUS: f32 = 6300e3;
const CLOUD_START: f32 = 800.0;
const CLOUD_HEIGHT: f32 = 1200.0;
const SUN_POWER: vec3f = vec3(1.0,0.9,0.6) * 800.;
const LOW_SCATTER: vec3f = vec3(1.0, 0.7, 0.5);
// Define a constant variable for cloudiness
const CLOUDINESS: f32 = 0.5; 
// ========================================================




// NIGHT SKY STUFF
const galaxyNormal = vec3f(0.577, 0.577, 0.577); // Which direction the galaxy is facing
const galaxyCenterDir = vec3f(-0.707, 0, 0.707); // The direction of the center of the galaxy

fn sunIntensity( zenithAngleCos: f32 ) -> f32 {
	let zenithAngleCosClamped = clamp( zenithAngleCos, -1.0, 1.0 );
	return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCosClamped ) ) / steepness ) ) );
}

fn totalMie( T: f32 ) -> vec3f {
	let c: f32 = ( 0.2 * T ) * 10E-18;
	return 0.434 * c * MieConst;
}

@vertex
fn vs( @location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	var worldPosition: vec4f = object.modelMatrix * vec4( position, 1.0 );
	varyings.vWorldPosition = worldPosition.xyz;

	varyings.Vertex = object.projectionMatrix * object.modelViewMatrix * vec4( position, 1.0 );
	varyings.Vertex.z = varyings.Vertex.w; // set z to camera.far

	varyings.vSunDirection = normalize( object.sunPosition );
	varyings.vSunE = sunIntensity( dot( varyings.vSunDirection, object.up ) );
	varyings.vSunfade = 1.0 - clamp( 1.0 - exp( ( object.sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

	let rayleighCoefficient: f32 = object.rayleigh - ( 1.0 * ( 1.0 - varyings.vSunfade ) );

	// extinction (absorption + out scattering)
	// rayleigh coefficients
	varyings.vBetaR = totalRayleigh * rayleighCoefficient;

	// mie coefficients
	varyings.vBetaM = totalMie( object.turbidity ) * object.mieCoefficient;

	return varyings;
}


// constants for atmospheric scattering
const n: f32 = 1.0003; // refractive index of air
const N: f32 = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

// optical length at zenith for molecules
const rayleighZenithLength: f32 = 8.4E3;
const mieZenithLength: f32 = 1.25E3;
const sunSize: f32 = 1;
// 66 arc seconds -> degrees, and the cosine of that
const sunAngularDiameterCos: f32 = 0.999856676946448443553574619906976478926848692873900859324 - (0.0001 * sunSize);

// 3.0 / ( 16.0 * pi )
const THREE_OVER_SIXTEENPI: f32 = 0.05968310365946075;
// 1.0 / ( 4.0 * pi )
const ONE_OVER_FOURPI: f32 = 0.07957747154594767;

fn rayleighPhase( cosTheta: f32 ) -> f32 {
	return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}

fn hgPhase( cosTheta: f32, g: f32 ) -> f32 {
	let g2: f32 = pow( g, 2.0 );
	let inverse: f32 = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
	return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

struct OutputStruct {
	@location(0) color: vec4<f32>
};
var<private> output : OutputStruct;

/*
Next we'll define the main scattering function.
This traces a ray from start to end and takes a certain amount of samples along this ray, in order to calculate the color.
For every sample, we'll also trace a ray in the direction of the light, 
because the color that reaches the sample also changes due to scattering
*/
fn calculate_scattering(
	camPos: vec3f, 				// the start of the ray (the camera position)
    dir: vec3f, 					// the direction of the ray (the camera vector)
    max_dist: f32, 			// the maximum distance the ray can travel (because something is in the way, like an object)
    scene_color: vec3f,			// the color of the scene
    light_dir: vec3f, 			// the direction of the light
    light_intensity: vec3f,		// how bright the light is, affects the brightness of the atmosphere
    planet_position: vec3f, 		// the position of the planet
    planet_radius: f32, 		// the radius of the planet
    atmo_radius: f32, 			// the radius of the atmosphere
    beta_ray: vec3f, 				// the amount rayleigh scattering scatters the colors (for earth: causes the blue atmosphere)
    beta_mie: vec3f, 				// the amount mie scattering scatters colors
    beta_absorption: vec3f,   	// how much air is absorbed
    beta_ambient: vec3f,			// the amount of scattering that always occurs, cna help make the back side of the atmosphere a bit brighter
    g: f32, 					// the direction mie scatters the light in (like a cone). closer to -1 means more towards a single direction
    height_ray: f32, 			// how high do you have to go before there is no rayleigh scattering?
    height_mie: f32, 			// the same, but for mie
    height_absorption: f32,	// the height at which the most absorption happens
    absorption_falloff: f32,	// how fast the absorption falls off from the absorption height
    steps_i: i32, 				// the amount of steps along the 'primary' ray, more looks better but slower
    steps_l: i32 				// the amount of steps along the light ray, more looks better but slower
) -> vec3f {
	var start = camPos;
    // add an offset to the camera position, so that the atmosphere is in the correct position
    start -= planet_position;
    // calculate the start and end position of the ray, as a distance along the ray
    // we do this with a ray sphere intersect
    var a: f32 = dot(dir, dir);
    var b: f32 = 2.0 * dot(dir, start);
    var c: f32 = dot(start, start) - (atmo_radius * atmo_radius);
    var d: f32 = (b * b) - 4.0 * a * c;
    
    // stop early if there is no intersect
    if (d < 0.0) {
		return scene_color;
	}
    
    // calculate the ray length
    var ray_length: vec2f = vec2f(
        max((-b - sqrt(d)) / (2.0 * a), 0.0),
        min((-b + sqrt(d)) / (2.0 * a), max_dist)
    );
    
    // if the ray did not hit the atmosphere, return a black color
    if (ray_length.x > ray_length.y) {
		return scene_color;
	}

    // prevent the mie glow from appearing if there's an object in front of the camera
    let allow_mie = max_dist > ray_length.y;
    // make sure the ray is no longer than allowed
    ray_length.y = min(ray_length.y, max_dist);
    ray_length.x = max(ray_length.x, 0.0);
    // get the step size of the ray
    let step_size_i: f32 = (ray_length.y - ray_length.x) / f32(steps_i);
    
    // next, set how far we are along the ray, so we can calculate the position of the sample
    // if the camera is outside the atmosphere, the ray should start at the edge of the atmosphere
    // if it's inside, it should start at the position of the camera
    // the min statement makes sure of that
    var ray_pos_i: f32 = ray_length.x + step_size_i * 0.5;
    
    // these are the values we use to gather all the scattered light
    var total_ray: vec3f = vec3(0.0); // for rayleigh
    var total_mie: vec3f = vec3(0.0); // for mie
    
    // initialize the optical depth. This is used to calculate how much air was in the ray
    var opt_i: vec3f = vec3(0.0);
    
    // also init the scale height, avoids some vec2's later on
    let scale_height: vec2f = vec2(height_ray, height_mie);
    
    // Calculate the Rayleigh and Mie phases.
    // This is the color that will be scattered for this ray
    // mu, mumu and gg are used quite a lot in the calculation, so to speed it up, precalculate them
    let mu: f32 = dot(dir, light_dir);
    let mumu: f32 = mu * mu;
    let gg: f32 = g * g;
    let phase_ray: f32 = 3.0 / (50.2654824574 /* (16 * pi) */) * (1.0 + mumu);
    var phase_mie: f32 = 0.0;
	
	if ( allow_mie ) {
		phase_mie = 3.0 / (25.1327412287 /* (8 * pi) */) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
	}
    
    // now we need to sample the 'primary' ray. this ray gathers the light that gets scattered onto it
    for (var i: i32 = 0; i < steps_i; i++) {
        
        // calculate where we are along this ray
        let pos_i: vec3f = start + dir * ray_pos_i;
        
        // and how high we are above the surface
        let height_i: f32 = length(pos_i) - planet_radius;
        
        // now calculate the density of the particles (both for rayleigh and mie)
        var density: vec3f = vec3(exp(-height_i / scale_height), 0.0);
        
        // and the absorption density. this is for ozone, which scales together with the rayleigh, 
        // but absorbs the most at a specific height, so use the sech function for a nice curve falloff for this height
        // clamp it to avoid it going out of bounds. This prevents weird black spheres on the night side
        let denom: f32 = (height_absorption - height_i) / absorption_falloff;
        density.z = (1.0 / (denom * denom + 1.0)) * density.x;
        
        // multiply it by the step size here
        // we are going to use the density later on as well
        density *= step_size_i;
        
        // Add these densities to the optical depth, so that we know how many particles are on this ray.
        opt_i += density;
        
        // Calculate the step size of the light ray.
        // again with a ray sphere intersect
        // a, b, c and d are already defined
        a = dot(light_dir, light_dir);
        b = 2.0 * dot(light_dir, pos_i);
        c = dot(pos_i, pos_i) - (atmo_radius * atmo_radius);
        d = (b * b) - 4.0 * a * c;

        // no early stopping, this one should always be inside the atmosphere
        // calculate the ray length
        let step_size_l: f32 = (-b + sqrt(d)) / (2.0 * a * f32(steps_l));

        // and the position along this ray
        // this time we are sure the ray is in the atmosphere, so set it to 0
        var ray_pos_l: f32 = step_size_l * 0.5;

        // and the optical depth of this ray
        var opt_l: vec3f = vec3(0.0);
            
        // now sample the light ray
        // this is similar to what we did before
        for (var l: i32 = 0; l < steps_l; l++) {

            // calculate where we are along this ray
            let pos_l: vec3f = pos_i + light_dir * ray_pos_l;

            // the heigth of the position
            let height_l: f32 = length(pos_l) - planet_radius;

            // calculate the particle density, and add it
            // this is a bit verbose
            // first, set the density for ray and mie
            var density_l: vec3f = vec3(exp(-height_l / scale_height), 0.0);
            
            // then, the absorption
            let denom: f32 = (height_absorption - height_l) / absorption_falloff;
            density_l.z = (1.0 / (denom * denom + 1.0)) * density_l.x;
            
            // multiply the density by the step size
            density_l *= step_size_l;
            
            // and add it to the total optical depth
            opt_l += density_l;
            
            // and increment where we are along the light ray.
            ray_pos_l += step_size_l;
            
        }
        
        // Now we need to calculate the attenuation
        // this is essentially how much light reaches the current sample point due to scattering
        let attn: vec3f = exp(-beta_ray * (opt_i.x + opt_l.x) - beta_mie * (opt_i.y + opt_l.y) - beta_absorption * (opt_i.z + opt_l.z));

        // accumulate the scattered light (how much will be scattered towards the camera)
        total_ray += density.x * attn;
        total_mie += density.y * attn;

        // and increment the position on this ray
        ray_pos_i += step_size_i;
    	
    }
    
    // calculate how much light can pass through the atmosphere
    let opacity: vec3f = exp(-(beta_mie * opt_i.y + beta_ray * opt_i.x + beta_absorption * opt_i.z));
    
	// calculate and return the final color
    return (
		phase_ray * beta_ray * total_ray // rayleigh color
		+ phase_mie * beta_mie * total_mie // mie
		+ opt_i.x * beta_ambient // and ambient
    ) * light_intensity + scene_color * opacity; // now make sure the background is rendered correctly
}

@fragment
fn fs( 
     @builtin(position) fragCoord: vec4<f32>,
    @location( 0 ) vSunE : f32,
	@location( 1 ) vBetaR : vec3<f32>,
	@location( 2 ) vWorldPosition : vec3<f32>,
	@location( 3 ) positionLocal : vec3<f32>,
	@location( 4 ) vSunDirection : vec3<f32>,
	@location( 5 ) vBetaM : vec3<f32>,
	@location( 6 ) vSunfade : f32 ) -> OutputStruct {

	let direction: vec3f = normalize( vWorldPosition - object.cameraPosition );

	// in scattering
	let cosTheta: f32 = dot( direction, vSunDirection );

	// composition + solar disc
	let sunMask: f32 = smoothstep( 0, 0.58, cosTheta );
	
	// the initial color of this pixel
    var nightSky: vec3f = DrawNightSky(direction, fragCoord.xy);

    // // In this next section
	// // max dist, essentially the scene depth
	// let sceneDepth = 100000000000.0;
    
    // // get the atmosphere color
    // let scattering = calculate_scattering(
    // 	vec3f(0.0, PLANET_RADIUS, 0.0) + object.cameraPosition,				// the position of the camera
    //     direction, 					// the camera vector (ray direction of this pixel)
    //     sceneDepth, 					// max dist, essentially the scene depth
    //     vec3f(0.0,0.0,0.0),				// scene color, the color of the current pixel being rendered
    //     vSunDirection, 					// light direction
    //     vec3f(40.0),					// light intensity, 40 looks nice
    //     PLANET_POS,						// position of the planet
    //     PLANET_RADIUS,                  // radius of the planet in meters
    //     ATMOS_RADIUS,                   // radius of the atmosphere in meters
    //     RAY_BETA,						// Rayleigh scattering coefficient
    //     MIE_BETA,                       // Mie scattering coefficient
    //     ABSORPTION_BETA,                // Absorbtion coefficient
    //     AMBIENT_BETA,					// ambient scattering, turned off for now. This causes the air to glow a bit when no light reaches it
    //     G,                          	// Mie preferred scattering direction
    //     HEIGHT_RAY,                     // Rayleigh scale height
    //     HEIGHT_MIE,                     // Mie scale height
    //     HEIGHT_ABSORPTION,				// the height at which the most absorption happens
    //     ABSORPTION_FALLOFF,				// how fast the absorption falls off from the absorption height 
    //     PRIMARY_STEPS, 					// steps in the ray direction 
    //     LIGHT_STEPS 					// steps in the light direction
    // );

    // // Calculate the opacity of the atmosphere based on the sun's position and view direction
    // let sunVisibility: f32 = clamp(dot(vSunDirection, vec3f(0.0, 1.0, 0.0)), -1.0, 1.0);
    // let adjustedOpacity: vec3f = exp(-(RAY_BETA * scattering.x + MIE_BETA * scattering.y + ABSORPTION_BETA * scattering.z)) * sunVisibility;

    // // This is a mask we apply to the stars so they cut off nicely below the horizon
    // let upperHemisphereMask: f32 = clamp( dot( direction, vec3f(0.0, 1.0, 0.0) ) * 6.0, 0.0, 1.0 );
    // col = mix(col * upperHemisphereMask, scattering, adjustedOpacity);

    

// 	// apply exposure, removing this makes the brighter colors look ugly
//     // you can play around with removing this
//     // col = 1.0 - exp(-col / 1.2);



    let dir = direction;
    let org = object.cameraPosition;    
	var color = vec3f(.0);
    let sun_direction = vSunDirection;
    
	var fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS);
    let mu = dot(sun_direction, dir);
    
    // Sky
    // if( fogDistance == -1. ) {
        color = skyRay(org, dir, sun_direction, false); 
        fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS+160.0);
    // }
   
    
    let fogPhase = 0.5 * HenyeyGreenstein(mu, 0.9) + 0.5 * HenyeyGreenstein(mu, -0.6);

    output.color = vec4f( mix( fogPhase * 0.1 * LOW_SCATTER * SUN_POWER + 10.0 * vec3f( 0.55, 0.8, 1.0 ), color, exp(-0.0003 * fogDistance )), 1.0 );
    
    // Adjust exposure
    let atmosphereWithSunAndClouds = vec3f( 1.0 - exp(-output.color.rgb / 8.6));
    output.color = vec4f( mix( nightSky, atmosphereWithSunAndClouds, sunMask), 1.0 );
    return output;
}








// ============================================================================
// CLOUD RENDERING
// ============================================================================


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

struct CloudResult {
    sky: f32,
    cloudHeight: f32
};




fn clouds(position: vec3f, fast: bool) -> CloudResult {
    // Speed at which clouds move, based on time
    let cloudMovementSpeed = object.iTime * 0.001;
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
    let largeWeather: f32 = clamp((textureSampleLevel(pebblesTexture, noiseSampler, -0.00005 * p.zx, 0.0).x - 0.18) * 5.0, 0.0, 3.0 * CLOUDINESS);

    // Move the clouds in the x direction
    p.x += cloudMovementSpeed * 8.3;
    
    // Sample the smaller-scale weather pattern and combine with large-scale pattern
    var weather: f32 = largeWeather * max( clamp( pow(CLOUDINESS, 3.1), 0.0, 1.0 ), textureSampleLevel(pebblesTexture, noiseSampler, 0.0002 * p.zx, 0.0).x - 0.28) / 0.72;
    
    // Apply smoothstep to the cloud height to create a smooth transition
    weather *= smoothstep(0.0, 0.5, cloudHeight) * smoothstep(1.0, 0.5, cloudHeight);
    // Shape the clouds using a power function
    let cloudShape: f32 = pow(weather, 0.3 + 1.5 * smoothstep(0.2, 0.5, cloudHeight));
    
    // If the cloud shape is zero, return early
    if (cloudShape <= 0.0) {
        result.sky = 0.0;
        return result;
    }

    // Move the clouds further in the x direction
    p.x += cloudMovementSpeed * 12.3;
    // Calculate the cloud density using fractal Brownian motion (fbm)
    var den = max(0.0, cloudShape - 0.7 * fbm(p * 0.01));

    // If the cloud density is zero, return early
    if (den <= 0.0) {
        result.sky = 0.0;
        return result;
    }
    
    // If in fast mode, return a simplified cloud density
    if (fast) {
        result.sky = largeWeather * 0.2 * min(1.0, 5.0 * den);
        return result; 
    }

    // Move the clouds in the y direction
    p.y += cloudMovementSpeed * 15.2;
    // Calculate the final cloud density using fbm
    den = max(0.0, den - 0.2 * fbm(p * 0.05));
    
    // Calculate the final sky value based on the cloud density and weather pattern
    result.sky = largeWeather * 0.2 * min(1.0, 5.0 * den);
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
    var nbSampleLight = 20;
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
        let result = clouds(rayStartPos + sun_direction * f32(j) * stepL, fast);
        cloudHeight = result.cloudHeight;
        lighRayDen += result.sky;
    }
    
    // If in fast mode, return a simplified calculation
    if (fast) {
        return (0.5 * exp(-0.4 * stepL * lighRayDen) + max(0.0, -mu * 0.6 + 0.3) * exp(-0.02 * stepL * lighRayDen)) * phaseFunction;
    }

    // Calculate the scattering amount based on the angle between the light ray and the view direction
    let scatterAmount: f32 = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
    // Calculate the Beer's law attenuation
    let beersLaw: f32 = exp(-stepL * lighRayDen) + 0.5 * scatterAmount * exp(-0.1 * stepL * lighRayDen) + scatterAmount * 0.4 * exp(-0.02 * stepL * lighRayDen);
    // Return the final light intensity
    return beersLaw * phaseFunction * mix(0.05 + 1.5 * pow(min(1.0, dC * 8.5), 0.3 + 5.5 * cloudHeight), 1.0, clamp(lighRayDen * 0.4, 0.0, 1.0));
}

fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f, fast: bool) -> vec3f {
    // Constants for the start and end of the atmosphere
    const ATM_START: f32 = EARTH_RADIUS + CLOUD_START;
    const ATM_END: f32 = ATM_START + CLOUD_HEIGHT;

    // Number of samples for ray marching
    var nbSample = 35;
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

    // If the ray is pointing upwards
    if (dir.y > 0.015) {
        for (var i = 0; i < nbSample; i++) {
            var cloudHeight: f32;
            let result = clouds(rayStartPosition, fast);
            let density = result.sky;
            cloudHeight = result.cloudHeight;

            // If there is cloud density at this sample point
            if (density > 0.0) {
                // Calculate the light intensity scattered by the clouds
                let intensity = lightRay(rayStartPosition, phaseFunction, density, mu, sun_direction, cloudHeight, fast);

                // Calculate the ambient light
                let ambient = (0.5 + 0.6 * cloudHeight) * vec3f(0.2, 0.5, 1.0) * 6.5 + vec3f(0.8) * max(0.0, 1.0 - 2.0 * cloudHeight);

                // Calculate the radiance (light emitted by the clouds)
                var radiance = ambient + SUN_POWER * intensity;
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

    // If not in fast mode, add some additional clouds to the sky    
    if (!fast) {
        // Adds clouds at a higher altitude (1000 meters above the atmosphere)
        let intersectionPoint = cameraPos + intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_END + 1000.0) * dir;
        color += transmittance * vec3f(3.0) * max(0.0, fbm(vec3f(1.0, 1.0, 1.8) * intersectionPoint * 0.002) - 0.4);
    }

    // Calculate the background color based on the direction of the ray
    var background = 6.0 * mix(vec3f(0.2, 0.52, 1.0), vec3f(0.8, 0.95, 1.0), pow(0.5 + 0.5 * mu, 15.0)) + mix(vec3f(3.5), vec3f(0.0), min(1.0, 2.3 * dir.y));

    // If not in fast mode, draw the sun disk
    if (!fast) {
        background += transmittance * vec3f(1e4 * smoothstep(0.9998, 1.0, mu));
    }

    // Add the background color to the final color
    color += background * transmittance;

    return color;
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