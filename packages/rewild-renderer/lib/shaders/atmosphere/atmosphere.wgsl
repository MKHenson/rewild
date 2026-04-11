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

@group( 0 ) @binding( 5 )
var nightSkyCubemap: texture_cube<f32>;

var<private> varyings: VaryingsStruct;
var<private> output: OutputStruct;
var<private> sunDotUp: f32;

fn sampleNightSky(direction: vec3f) -> vec3f {
    // Apply time-based rotation (moved from drawNightSky)
    let dir = direction + vec3f( 0.0, 0.0, object.iTime * 0.0000005 );

    let rotationAngle = object.iTime * 0.00001;
    let cosAngle = cos(rotationAngle);
    let sinAngle = sin(rotationAngle);
    let rotationMatrix = mat3x3<f32>(
        vec3f(cosAngle, -sinAngle, 0.0),
        vec3f(sinAngle, cosAngle, 0.0),
        vec3f(0.0, 0.0, 1.0)
    );

    let rotatedDir = rotationMatrix * dir;
    return textureSampleLevel(nightSkyCubemap, noiseSampler, rotatedDir, 0.0).rgb;
}

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
	let hemisphereMask: f32 = smoothstep( -0.3, -0.1, cosTheta );

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
        let nightSky: vec3f = sampleNightSky(direction);
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
        let nightSky: vec3f = sampleNightSky(direction);
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

