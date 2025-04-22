const GALAXY_NORMAL = vec3f(0.577, 0.577, 0.577); // Which direction the galaxy is facing
const GALAXY_CENTER_DIR = vec3f(-0.707, 0, 0.707); // The direction of the center of the galaxy

struct CloudResult {
  sky: f32,
  cloudHeight: f32
};

@group( 0 ) @binding( 0 ) 
var<uniform> object: ObjectStruct;

@group( 0 ) @binding( 1 )
var noiseSampler: sampler;

@group( 0 ) @binding( 2 ) 
var noiseTexture: texture_2d<f32>;

@group( 0 ) @binding( 3 )
var depthTexture: texture_depth_2d;

@group( 0 ) @binding( 4 )
var depthSampler: sampler_comparison;

var<private> varyings: VaryingsStruct;
var<private> output: OutputStruct;
var<private> sunDotUp: f32;


@fragment
fn fs( 
    @builtin(position) fragCoord: vec4<f32>,
	@location( 0 ) vWorldPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32> ) -> OutputStruct {

    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));

	let direction: vec3f = normalize( vWorldPosition - object.cameraPosition );

	// in scattering
	// var cosTheta: f32 = dot( direction, vSunDirection );
    var cosTheta = dot( direction, vec3f(0.0, 1.0, 0.0) );
	let hemisphereMask: f32 = smoothstep( -0.3, 0.1, cosTheta );

     // Define uv based on fragCoord
    let uv = fragCoord.xy / vec2(object.resolutionX, object.resolutionY);

    // Do not draw pixel if blocked by something in the z-buffer
    let rawDepth = textureSampleCompare( depthTexture, depthSampler, uv, 1 );
    if (rawDepth < 1.0) {
         output.color = vec4f( 0.0, 0.0, 0.0, 0.0 );
        return output;
    }

    // The area on the horizon where the sun and earth meet
    if ( hemisphereMask < 1 && hemisphereMask > 0.0 ) {
        let nightSky: vec3f = drawNightSky(direction, fragCoord.xy);
        let atmosphereWithSunAndClouds = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection, nightSky );
        output.color = vec4f( mix( nightSky, atmosphereWithSunAndClouds, hemisphereMask), 1.0 );
        // output.color = vec4f( 1.0, 0.0, 0.0, 1.0 );
        return output;
    }
    // The area below the horizon
    else if ( hemisphereMask <= 0.0 ) {
        output.color = vec4f( 0.0, 0.0, 0.0, 1.0 );
        return output;
    }
    // The area above the horizon
    else {
        let nightSky: vec3f = drawNightSky(direction, fragCoord.xy);
        let atmosphereWithSunAndClouds = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection, nightSky );
        output.color = vec4f( atmosphereWithSunAndClouds, 1.0 );
        // output.color = vec4f(  0.0, 0.0, 1.0, 1.0 );
        return output;
    } 
}

fn drawCloudsAndSky(dir: vec3f, org: vec3f, vSunDirection: vec3f, nightSky: vec3f ) -> vec3f {
    var color = vec3f(.0);   
    color = skyRay(org, dir, vSunDirection, nightSky); 
	color = getFogColor( dir, org, vSunDirection, color.rgb );

    // Adjust exposure
    var colorAdjustedExposure = vec3f( 1.0 - exp(-color / 8.6));
    return colorAdjustedExposure;
}


fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f, nightSky: vec3f) -> vec3f {
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
    color += mix(FOG_COLOR_STORM, vec3f(2.0), sunDotUp) * max( 0.0, fbm(vec3f(1.0, 1.0, 1.8) * intersectionPoint * 0.001) - cloudCoverFactor) * 2.0;

    let background = getAtmosphereColor(sun_direction, dir, mu, nightSky * 10.0);

    // Add the background color to the final color
    color += background;
    return color;
}

fn drawNightSky(dir2: vec3f, fragCoord: vec2f ) -> vec3f {
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
	var starIntensity = mix(-1.5, 2.0, proceduralNoise3D(500.0 * rotatedDir) + 0.10 * proceduralNoise3D(2.0 * rotatedDir));
	starIntensity = clamp(starIntensity, 0.0, 1.0);
	let starColor = vec3f(
		0.7 + 0.3 * proceduralNoise3D(100.0 * rotatedDir),
		0.7 + 0.3 * proceduralNoise3D(103.0 * rotatedDir),
		0.7 + 0.3 * proceduralNoise3D(106.0 * rotatedDir)
	);
	let stars = starIntensity * starColor;

	// Stars (pixel perfect)
	let starScale = 30.0;
	let ypm = vec2f( // This is to make the stars more evenly distributed
		yp.x / PI,
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
		starYpm.x * PI,
		asin(starYpm.y)
	);

	let starUvVec3 = rotatedDir;
	var starUv = starUvVec3.xy / starUvVec3.z;
	starUv.x /= ar;

	let starCoord = (starUv + 1.0) / 2.0 * vec2f(object.resolutionX, object.resolutionY);
	var starIntensity2 = 0.0;

	if (all(floor(starCoord) == floor(fragCoord))) { // Apparently fragCoord has values that end in .5?
		starIntensity2 = fract(sin(dot(cell, vec2f(113.5, 271.9))) * 43758.5453);
		starIntensity2 *= 0.7 + 0.7 * proceduralNoise3D(20.0 * rotatedDir) + 0.4 * proceduralNoise3D(2.0 * rotatedDir);
	}

	let stars2 = vec3f(starIntensity2);

	// Galaxy
	var galaxyPlane = 8.0 * dot(GALAXY_NORMAL, rotatedDir);
	galaxyPlane = 1.0 / (galaxyPlane * galaxyPlane + 1.0);
	var galaxyCenter = dot(GALAXY_CENTER_DIR, rotatedDir) * 0.5 + 0.5;
	galaxyCenter = galaxyCenter * galaxyCenter;
	let galaxyIntensity = galaxyPlane * galaxyCenter;
	let galaxyColor = vec3f(0.5, 0.5, 1.0);
	let galaxy = 0.8 * galaxyIntensity * galaxyColor;

	// Dust
	var d = 0.0;
	d += 1.00 * proceduralNoise3D(10.0 * rotatedDir);
	d += 0.50 * proceduralNoise3D(20.0 * rotatedDir);
	d += 0.25 * proceduralNoise3D(100.0 * rotatedDir);
	d += 0.20 * proceduralNoise3D(200.0 * rotatedDir);
	let dustColor = vec3f(0.5, 0.4, 0.3);
	let dust = vec3f(1.0 - (d * 0.6 + 1.2) * galaxyPlane * galaxyCenter) + dustColor;

	let color = stars + stars2 + galaxy * dust;
	return color;
}
 

fn dirToYawPitch( dir: vec3f ) -> vec2f {
	return vec2f(atan2(dir.x, dir.z), asin(dir.y));
} 