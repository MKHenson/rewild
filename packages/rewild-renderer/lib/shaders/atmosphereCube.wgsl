// uniforms
struct objectStruct {
	modelMatrix : mat4x4<f32>,
	projectionMatrix : mat4x4<f32>,
	modelViewMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>,
	sunPosition : vec3<f32>,
	up : vec3<f32>,
	rayleigh : f32, 
	turbidity : f32, 
	mieCoefficient : f32, 
	mieDirectionalG : f32
};

@binding( 0 ) @group( 0 )
var<uniform> object : objectStruct;


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
const ATMOS_RADIUS = 6471e3; /* radius of the atmosphere */

// scattering coeffs
const RAY_BETA=vec3f(5.5e-6, 13.0e-6, 22.4e-6); /* rayleigh, affects the color of the sky */
const MIE_BETA= vec3f(21e-6); /* mie, affects the color of the blob around the sun */
const AMBIENT_BETA= vec3f(0.0); /* ambient, affects the scattering color when there is no lighting from the sun */
const ABSORPTION_BETA= vec3f(2.04e-5, 4.97e-5, 1.95e-6); /* what color gets absorbed by the atmosphere (Due to things like ozone) */
const G= 0.7; /* mie scattering direction, or how big the blob around the sun is */

// and the heights (how far to go up before the scattering has no effect)
const HEIGHT_RAY = 8e3; /* rayleigh height */
const HEIGHT_MIE = 1.2e3; /* and mie */
const HEIGHT_ABSORPTION = 30e3; /* at what height the absorption is at it's maximum */
const ABSORPTION_FALLOFF = 4e3; /* how much the absorption decreases the further away it gets from the maximum height */

// and the steps (more looks better, but is slower)
// the primary step has the most effect on looks

// and these on desktop
const PRIMARY_STEPS = 16; // 32 /* primary steps, affects quality the most */
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

// fn jodieReinhardTonemap(c: vec3f) -> vec3f{
//     let l: f32 = dot(c, vec3(0.2126, 0.7152, 0.0722));
//     var tc: vec3f = c / (c + 1.0);

//     return mix(c / (l + 1.0), tc, tc);
// }

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
fn fs( @location( 0 ) vSunE : f32,
	@location( 1 ) vBetaR : vec3<f32>,
	@location( 2 ) vWorldPosition : vec3<f32>,
	@location( 3 ) positionLocal : vec3<f32>,
	@location( 4 ) vSunDirection : vec3<f32>,
	@location( 5 ) vBetaM : vec3<f32>,
	@location( 6 ) vSunfade : f32 ) -> OutputStruct {

	let direction: vec3f = normalize( vWorldPosition - object.cameraPosition );

	// optical length
	// cutoff angle at 90 to avoid singularity in next formula.
	let zenithAngle: f32 = acos( max( 0.0, dot( object.up, direction ) ) );
	let inverse: f32 = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
	let sR: f32 = rayleighZenithLength * inverse;
	let sM: f32 = mieZenithLength * inverse;

	// combined extinction factor
	let Fex: vec3f = exp( -( vBetaR * sR + vBetaM * sM ) );

	// in scattering
	let cosTheta: f32 = dot( direction, vSunDirection );

	let rPhase: f32 = rayleighPhase( cosTheta * 0.5 + 0.5 );
	let betaRTheta: vec3f = vBetaR * rPhase;

	let mPhase: f32 = hgPhase( cosTheta, object.mieDirectionalG );
	let betaMTheta: vec3f = vBetaM * mPhase;

	var Lin: vec3f = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
	Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( object.up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

	// nightsky
	let theta: f32 = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
	let phi: f32 = atan2( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
	let uv: vec2f = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
	var L0: vec3f = vec3( 0.1 ) * Fex;

	// composition + solar disc
	let sundisk: f32 = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00018, cosTheta );
	L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

	let texColor: vec3f = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
	let retColor: vec3f = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );


	// the color of this pixel
    var col: vec3f = vec3(0.0);

	

	// max dist, essentially the scene depth
	let sceneDepth = 100000000000.0;

	// the camera vector (ray direction of this pixel)
	let camera_vector = normalize(vWorldPosition - object.cameraPosition);
    
    // get the atmosphere color
    col += calculate_scattering(
    	vec3f(0.0, PLANET_RADIUS, 0.0) + object.cameraPosition,				// the position of the camera
        camera_vector, 					// the camera vector (ray direction of this pixel)
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
    )  + sundisk;

	// apply exposure, removing this makes the brighter colors look ugly
    // you can play around with removing this
    col = 1.0 - exp(-col / 1.2);

	output.color = vec4f( col.rgb, 1.0 ); 
	
	return output;
} 