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
var noiseTexture: texture_2d<f32>;

@group( 0 ) @binding( 2 )
var noiseSampler: sampler;

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
const sunLight: vec3f  = normalize( vec3(  0.3, 0.15,  0.3 ) );
const sunColour: vec3f = vec3(1.0, .7, .55);
var<private> gTime: f32; 
var<private> cloudy: f32;
var<private> flash: vec3f;

const CLOUD_LOWER = 4800.0;
const CLOUD_UPPER = 7800.0;
const MOD2 = vec2f(.16632,.17369);
const MOD3 = vec3f(.16532,.17369,.15787);
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
	// let sundisk: f32 = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00018, cosTheta );
	
	// the initial color of this pixel
    var col: vec3f = DrawNightSky(direction, fragCoord.xy);

    // In this next section
	// max dist, essentially the scene depth
	let sceneDepth = 100000000000.0;
    
    // get the atmosphere color
    let scattering = calculate_scattering(
    	vec3f(0.0, PLANET_RADIUS, 0.0) + object.cameraPosition,				// the position of the camera
        direction, 					// the camera vector (ray direction of this pixel)
        sceneDepth, 					// max dist, essentially the scene depth
        vec3f(0.0,0.0,0.0),				// scene color, the color of the current pixel being rendered
        vSunDirection, 					// light direction
        vec3f(40.0),					// light intensity, 40 looks nice
        PLANET_POS,						// position of the planet
        PLANET_RADIUS,                  // radius of the planet in meters
        ATMOS_RADIUS,                   // radius of the atmosphere in meters
        RAY_BETA,						// Rayleigh scattering coefficient
        MIE_BETA,                       // Mie scattering coefficient
        ABSORPTION_BETA,                // Absorbtion coefficient
        AMBIENT_BETA,					// ambient scattering, turned off for now. This causes the air to glow a bit when no light reaches it
        G,                          	// Mie preferred scattering direction
        HEIGHT_RAY,                     // Rayleigh scale height
        HEIGHT_MIE,                     // Mie scale height
        HEIGHT_ABSORPTION,				// the height at which the most absorption happens
        ABSORPTION_FALLOFF,				// how fast the absorption falls off from the absorption height 
        PRIMARY_STEPS, 					// steps in the ray direction 
        LIGHT_STEPS 					// steps in the light direction
    );

    // Calculate the opacity of the atmosphere based on the sun's position and view direction
    let sunVisibility: f32 = clamp(dot(vSunDirection, vec3f(0.0, 1.0, 0.0)), -1.0, 1.0);
    let adjustedOpacity: vec3f = exp(-(RAY_BETA * scattering.x + MIE_BETA * scattering.y + ABSORPTION_BETA * scattering.z)) * sunVisibility;

    // This is a mask we apply to the stars so they cut off nicely below the horizon
    let upperHemisphereMask: f32 = clamp( dot( direction, vec3f(0.0, 1.0, 0.0) ) * 6.0, 0.0, 1.0 );
    col = mix(col * upperHemisphereMask, scattering, adjustedOpacity);

    

// 	// apply exposure, removing this makes the brighter colors look ugly
//     // you can play around with removing this
//     // col = 1.0 - exp(-col / 1.2);

// 	// output.color = vec4f( col.rgb, 1.0 ); 
// 	// return output;



    // Attempt to add weather stuff
    // 	float m = (iMouse.x/iResolution.x)*30.0;
	gTime = object.iTime * 0.0005;
    
    // Sets how cloudy things are. Goes from -0.5 to 0.5
    cloudy = object.cloudiness;
    
    var lightning: f32 = 0.0;
    
    // When should the lightning be activated - based on the cloudiness. 
    // If the cloudy is from -0.5 to 0.5. A value of 0.5 here would mean only show the lightning
    // if the clouds are at their darkest
    if (cloudy >= .4) {
        var f = (gTime + 1.5) % 2.5;
        
        // The duration of the flash itself
        if (f < .8) {
            f = smoothstep(.8, .0, f) * 1.5;
            lightning = fract(-gTime * (1.5 - Hash1(gTime * 0.3) * 0.002)) * f;
        }
    }
    
    // Creates the lightning flash
    flash = clamp( vec3f( 1., 1.0, 1.2 ) * lightning, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0) );

 	var pos: vec2f;
 	if (direction.y > 0.0)
	{
		let result = RenderClouds(object.cameraPosition, direction, vSunDirection, col, scattering);
        col = result.sky;
        pos = result.outPos;
	} 
	
    let l: f32 = exp(-length(pos) * .00002);
	col = mix( vec3f( .6 - cloudy * 1.2 ) + flash * 0.3, col, max(l, .2) );
    
    // Gets the UV coordinates 
    var xy: vec2f = fragCoord.xy /  vec2f( object.resolutionX, object.resolutionY );
    // To mimic the shadertoy coordinate system
    xy.y = 1.0 - xy.y;
    var uv = (-1.0 + 2.0 * xy) * vec2f(object.resolutionX / object.resolutionY, 1.0);
	

	
 	let st: vec2f =  uv * vec2f( .5 + ( xy.y + 1.0 ) *.3, .02 ) + vec2f( object.iTime * .5 + xy.y * .2, object.iTime *.2 );
	
    // Rain...
 	var f = textureSample(noiseTexture, noiseSampler, st).y * textureSample(noiseTexture, noiseSampler, st *.773).x * 1.55;
	let rain = clamp(cloudy - .25, 0.0, 1.0);
    
    let rainDensity = 25.0;
	f = clamp(pow(abs(f), 15.0) * 5.0 * ( rain * rain * rainDensity ), 0.0, ( xy.y + .1 ) *.9 );
	
    // Mix the rain color with the lightning
    col = mix( max(col, vec3(0.0,0.0,0.0)), vec3f( 0.15, .15, .15 ) + flash, f );
	// col = clamp( col, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0) );

    // let sunDiscAmount: f32 = max( dot( direction, vSunDirection), 0.0 );  // sunLight
    
    // // Add the sun disk
    // col = col + sunColour * min(pow(sunDiscAmount, 1500.0) * 5.0, 1.0);

    // Add the sun haze
	// col = col + sunColour * min(pow(sunDiscAmount, 10.0) * .6, 1.0);
    
    // Brightens the scene...
	col = pow(col, vec3(.7));


    output.color = vec4f( col, 1.0 );
    return output;
}








// ============================================================================
// THIS STUFF IS WEATHER RELATED
// ============================================================================
// Weather. By David Hoskins, May 2014.
// @ https://www.shadertoy.com/view/4dsXWn
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// Who needs mathematically correct simulations?! :)
// It ray-casts to the bottom layer then steps through to the top layer.
// It uses the same number of steps for all positions.
// The larger steps at the horizon don't cause problems as they are far away.
// So the detail is where it matters.
// Unfortunately this can't be used to go through the cloud layer,
// but it's fast and has a massive draw distance.



fn Hash1( p: f32 ) -> f32
{
	var p2 = fract(vec2f(p) * MOD2);
    p2 += dot(p2.yx, p2.xy+19.19);
	return fract(p2.x * p2.y);
}

fn Hash3(pParam: vec3f) -> f32
{
	var p  = fract(pParam * MOD3);
    p += dot(p.xyz, p.yzx + 19.19);
    return fract(p.x * p.y * p.z);
}

// Try with perlin
// fn Noise( x: vec3f ) -> f32
// { 
//     let p = floor(x);
//     var f = fract(x);
// 	f = f*f*(3.0-2.0*f);
	
// 	var uv = ( p.xy + vec2(37.0,17.0) * p.z ) + f.xy;

//     uv.y = 1.0 - uv.y;

// 	// let rg = textureLod( noiseTexture, (uv+ 0.5)/256.0, 0.0 ).yx;
//     // let rg = textureSampleLevel(noiseTexture, noiseSampler, (uv + 0.5) / 256.0, 0.0).yx;
//     let rg = vec2<f32>(perlinNoise((uv + 0.5) ), perlinNoise((uv + 0.5)));

// 	return rg.x; // mix( rg.x, rg.y, f.z );
// }

// // Function to get noise value from the buffer
// fn getNoiseValue(index: u32) -> f32 {
//     return noiseBuffer[index % arrayLength(&noiseBuffer)];
// }

// // Perlin noise function
// =========
// fn perlinNoise(uv: vec2<f32>) -> f32 {
//     let wrapSize: f32 = 256.0;
//     let x = floor(uv.x) % wrapSize;
//     let y = floor(uv.y) % wrapSize;
//     let xf = fract(uv.x);
//     let yf = fract(uv.y);

//     let topRight = getNoiseValue(u32((x + 1.0) + (y + 1.0) * wrapSize));
//     let topLeft = getNoiseValue(u32(x + (y + 1.0) * wrapSize));
//     let bottomRight = getNoiseValue(u32((x + 1.0) + y * wrapSize));
//     let bottomLeft = getNoiseValue(u32(x + y * wrapSize));

//     let u = xf * xf * (3.0 - 2.0 * xf);
//     let v = yf * yf * (3.0 - 2.0 * yf);

//     let top = mix(bottomLeft, bottomRight, u);
//     let bottom = mix(topLeft, topRight, u);

//     return mix(top, bottom, v);
// }


// // FAST NOISE
// // =========
// fn Noise(p: vec3f) -> f32 {
//     let i: vec3i = vec3i(floor(p));
//     let f: vec3f = fract(p);

//     let u: vec3f = f * f * (3.0 - 2.0 * f);

//     let a: i32 = i.x + i.y * 57 + i.z * 113;
//     let b: i32 = a + 1;
//     let c: i32 = a + 57;
//     let d: i32 = c + 1;
//     let e: i32 = a + 113;
//     let f1: i32 = e + 1;
//     let g: i32 = c + 113;
//     let h: i32 = g + 1;

//     return mix(
//         mix(mix(Hash(a), Hash(b), u.x),
//             mix(Hash(c), Hash(d), u.x), u.y),
//         mix(mix(Hash(e), Hash(f1), u.x),
//             mix(Hash(g), Hash(h), u.x), u.y),
//         u.z);
// }

fn Hash(n: i32) -> f32 {
    let x: f32 = sin(f32(n) * 1.0) * 43758.5453;
    return fract(x);
}


// Texture Noise
// ==============
fn Noise( x: vec3f ) -> f32
{ 
    let p = floor(x);
    var f = fract(x);
	f = f * f *( 3.0-2.0 * f );
	
	var uv = ( p.xy + vec2(37.0,17.0) * p.z ) + f.xy;

    // uv.y = 1.0 - uv.y;

	// let rg = textureLod( noiseTexture, (uv+ 0.5)/256.0, 0.0 ).yx;
    let rg = textureSampleLevel(noiseTexture, noiseSampler, (uv + 0.5) / 256.0, 0.0).yx;
	return mix( rg.x, rg.y, f.z );
}

// // Original Noise - Slow
// // ==============
// fn Noise(p: vec3f) -> f32
// {
//     let i: vec3f = floor(p);
// 	var f: vec3f = fract(p); 
// 	f *= f * (3.0-2.0*f);

//     return mix(
// 		mix(mix(Hash3(i + vec3f(0.,0.,0.)), Hash3(i + vec3f(1.,0.,0.)),f.x),
// 			mix(Hash3(i + vec3f(0.,1.,0.)), Hash3(i + vec3f(1.,1.,0.)),f.x),
// 			f.y),
// 		mix(mix(Hash3(i + vec3f(0.,0.,1.)), Hash3(i + vec3f(1.,0.,1.)),f.x),
// 			mix(Hash3(i + vec3f(0.,1.,1.)), Hash3(i + vec3f(1.,1.,1.)),f.x),
// 			f.y),
// 		f.z);
// }


const m = mat3x3<f32>(
    vec3<f32>( 0.00,  0.80,  0.60),
    vec3<f32>(-0.80,  0.36, -0.48),
    vec3<f32>(-0.60, -0.48,  0.64)
) * 2.345;

//--------------------------------------------------------------------------
fn FBM( pParam: vec3f ) -> f32
{
    var p = pParam * .0005; 
    var f: f32;
	
	f = 0.5000 * Noise(p); p = m*p; p.y -= gTime * 0.0008;
	f += 0.2500 * Noise(p); p = m*p;  p.y += gTime * .00006;
	f += 0.1250 * Noise(p); p = m*p;
	f += 0.0625   * Noise(p); p = m*p;
	f += 0.03125  * Noise(p); p = m*p;
	f += 0.015625 * Noise(p);
    return f;
} 

//--------------------------------------------------------------------------
fn MapSH(p: vec3f) -> f32
{
	var h = -( FBM(p) - cloudy -.6 ); 
    h *= smoothstep( CLOUD_UPPER + 100., CLOUD_UPPER, p.y );
	return h;
}


//--------------------------------------------------------------------------
fn CalculateCloudDensity( p: vec3f) -> f32
{
	let h: f32 = -(FBM(p)-cloudy-.6);
	return h;
}

//--------------------------------------------------------------------------
fn CalculateCloudShadow( p: vec3f, sunDirection: vec3f ) -> f32
{
    let l: f32 = MapSH(p + sunDirection) - MapSH(p + sunDirection * 200.);
    return clamp(-l * 0.03, 0.06, 1.0);
}


struct RenderCloudsOutput {
    outPos: vec2f,
    sky: vec3f
};

//--------------------------------------------------------------------------
// Grab all sky information for a given ray from camera
fn RenderClouds( cameraPostion: vec3f, rayDirection: vec3f, vSunDirection: vec3f, originalSky: vec3f, atmoshpereColor: vec3f ) -> RenderCloudsOutput
{
    var toReturn: RenderCloudsOutput;
    
	// Do the blue and sun...	
	var sky: vec3f = originalSky;
	
	// Find the start and end of the cloud layer...
	var cloudLayerStart: f32 = (( CLOUD_LOWER - cameraPostion.y) / rayDirection.y);
	let cloudLayerEnd: f32 = (( CLOUD_UPPER - cameraPostion.y) / rayDirection.y);
	
	// Start position...
	var cloudRayStartPos: vec3f = vec3(cameraPostion.x + rayDirection.x * cloudLayerStart, 0.0, cameraPostion.z + rayDirection.z * cloudLayerStart);
	
    toReturn.outPos = cloudRayStartPos.xz;

    // Offset the start position by a random amount to give less uniform clouds
    cloudLayerStart += Hash3(cloudRayStartPos) * 150.0;

	// Trace clouds through that layer...

    // Step size is the amount of distance between each ray cast
	var stepSize: vec3f = rayDirection * ((cloudLayerEnd - cloudLayerStart) / 40.0);
	
    // The x value indicates how much light is blocked by the clouds, creating shadows
    // This y value indicates the density of the clouds at the current position along the ray
    var cloudLighting: vec2f;

	var accumulatedLightingAndDensity: vec2f = vec2(0.0, .0);
	cloudLighting.x = 1.0;
    
    // Original amount was 55
	// I think this is as small as the loop can be
	// for a reasonable cloud density illusion.
	for (var i: i32 = 0; i < 40; i++)
	{
		if (accumulatedLightingAndDensity.y >= 1.0) {
            break;
        }

		var cloudDensity: f32 = CalculateCloudDensity(cloudRayStartPos);

		cloudLighting.y = max(cloudDensity, 0.0); 
        cloudLighting.x = CalculateCloudShadow(cloudRayStartPos, vSunDirection); 
        
		accumulatedLightingAndDensity += cloudLighting * (1.0 - accumulatedLightingAndDensity.y);

		cloudRayStartPos += stepSize;
	} 
    
	let shadowAmount = vec3( pow( accumulatedLightingAndDensity.x, .4 ) );
	var clouds: vec3f = mix( shadowAmount, sunColour, max( 1.0 - accumulatedLightingAndDensity.y, 0.6 ) * 0.6 );
       
    // Adds the lightning flash to the clouds
    clouds += flash * ( accumulatedLightingAndDensity.y + accumulatedLightingAndDensity.x + .2 ) * .5;

    // Merges the clouds with the sky
	sky = mix(sky, min(clouds, vec3f(1.0, 1.0, 1.0)), accumulatedLightingAndDensity.y );
	
    toReturn.sky = clamp(sky, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0));
    return toReturn;
}

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
	randPos = mix(vec2(0.1), vec2(0.9), randPos); // Avoid the edges, where the stars can clip in and out
	let starYpm = (cell + randPos) / starScale;
	let starYp = vec2( // This undoes the above transformation
		starYpm.x * pi,
		asin(starYpm.y)
	);

	let starUvVec3 = rotatedDir;
	var starUv = starUvVec3.xy / starUvVec3.z;
	starUv.x /= ar;

	let starCoord = (starUv + 1.0) / 2.0 * vec2f(object.resolutionX, object.resolutionY);
	var starIntensity2 = 0.0;

	if (all(floor(starCoord) == floor(fragCoord))) { // Apparently fragCoord has values that end in .5?
		starIntensity2 = fract(sin(dot(cell, vec2(113.5, 271.9))) * 43758.5453);
		starIntensity2 *= 0.7 + 0.7 * noiseForStars(20.0 * rotatedDir) + 0.4*noiseForStars(2.0 * rotatedDir);
	}

	let stars2 = vec3(starIntensity2);

	// Galaxy
	var galaxyPlane = 8.0 * dot(galaxyNormal, rotatedDir);
	galaxyPlane = 1.0 / (galaxyPlane * galaxyPlane + 1.0);
	var galaxyCenter = dot(galaxyCenterDir, rotatedDir) * 0.5 + 0.5;
	galaxyCenter = galaxyCenter * galaxyCenter;
	let galaxyIntensity = galaxyPlane * galaxyCenter;
	let galaxyColor = vec3(0.5, 0.5, 1.0);
	let galaxy = 0.8 * galaxyIntensity * galaxyColor;

	// Dust
	var d = 0.0;
	d += 1.00 * noiseForStars(10.0 * rotatedDir);
	d += 0.50 * noiseForStars(20.0 * rotatedDir);
	d += 0.25 * noiseForStars(100.0 * rotatedDir);
	d += 0.20 * noiseForStars(200.0 * rotatedDir);
	let dustColor = vec3(0.5, 0.4, 0.3);
	let dust = vec3(1.0 - (d * 0.6 + 1.2) * galaxyPlane * galaxyCenter) + dustColor;

	let color = stars + stars2 + galaxy * dust;
	return color;
}

fn hashForStars( p: vec3f ) -> vec3f {
	let p2 = vec3( dot(p,vec3(127.1,311.7, 74.7)),
			  dot(p,vec3(269.5,183.3,246.1)),
			  dot(p,vec3(113.5,271.9,124.6)));

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

    return mix( mix( mix( dot( hashForStars( i + vec3(0.0,0.0,0.0) ), f - vec3(0.0,0.0,0.0) ), 
                          dot( hashForStars( i + vec3(1.0,0.0,0.0) ), f - vec3(1.0,0.0,0.0) ), u.x),
                     mix( dot( hashForStars( i + vec3(0.0,1.0,0.0) ), f - vec3(0.0,1.0,0.0) ), 
                          dot( hashForStars( i + vec3(1.0,1.0,0.0) ), f - vec3(1.0,1.0,0.0) ), u.x), u.y),
                mix( mix( dot( hashForStars( i + vec3(0.0,0.0,1.0) ), f - vec3(0.0,0.0,1.0) ), 
                          dot( hashForStars( i + vec3(1.0,0.0,1.0) ), f - vec3(1.0,0.0,1.0) ), u.x),
                     mix( dot( hashForStars( i + vec3(0.0,1.0,1.0) ), f - vec3(0.0,1.0,1.0) ), 
                          dot( hashForStars( i + vec3(1.0,1.0,1.0) ), f - vec3(1.0,1.0,1.0) ), u.x), u.y), u.z );
}