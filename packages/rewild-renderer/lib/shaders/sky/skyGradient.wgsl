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

	// Vertical component of view direction: 1.0 = looking straight up, -1.0 = straight down
    var viewVertical = dot( direction, vec3f(0.0, 1.0, 0.0) );

    // Camera altitude relative to cloud layer
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(object.cameraPosition - earthCenter);
    const ATM_START_FS = EARTH_RADIUS + CLOUD_START;

     // Define uv based on fragCoord
    let uv = fragCoord.xy / vec2(object.resolutionX, object.resolutionY);

    if (camHeight >= ATM_START_FS) {
        // Inside or above clouds — skip depth early-out so atmosphere renders
        // over distant terrain when looking down from altitude.
        // Fade out stars when looking down from high altitude
        let nightSky: vec3f = sampleNightSky(direction);
        let downFade = smoothstep(-0.1, 0.1, viewVertical);
        let adjustedNightSky = nightSky * downFade;
        let atmosphereColor = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection, adjustedNightSky );
        output.color = vec4f( atmosphereColor, 1.0 );
        return output;
    }

    // Below clouds: do not draw pixel if blocked by something in the z-buffer
    let rawDepth = textureSampleCompare( depthTexture, depthSampler, uv, 1 );
    if (rawDepth < 1.0) {
         output.color = vec4f( 0.0, 0.0, 0.0, 0.0 );
        return output;
    }

    // Star visibility below horizon: only during twilight/night and near ground.
    // nightFactor: 1 = night/twilight, 0 = daytime
    // groundFactor: 1 = near ground, 0 = high altitude
    let nightFactor = smoothstep(0.1, -0.1, sunDotUp);
    let groundFactor = 1.0 - smoothstep(0.0, 300.0, object.cameraPosition.y);
    let starVisibility = nightFactor * groundFactor;

    // Below-horizon color: evaluate the atmosphere at a horizon-clamped direction
    // so the color exactly matches what's at the horizon edge (no palette mismatch).
    let horizonDir = normalize(vec3f(direction.x, max(0.001, direction.y), direction.z));
    let horizonNightSky = sampleNightSky(horizonDir) * starVisibility;
    let horizonFog = drawCloudsAndSky(horizonDir, object.cameraPosition, vSunDirection, horizonNightSky);

    // Below clouds — original hemisphere masking
	// Smooth transition: 0 = below horizon, 1 = above horizon
	let hemisphereMask: f32 = smoothstep( -0.3, -0.1, viewVertical );

    // Horizon transition band: blend between below-horizon color and atmosphere above
    if ( hemisphereMask < 1 && hemisphereMask > 0.0 ) {
        let nightSky: vec3f = sampleNightSky(direction);
        let atmosphereColor = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection, nightSky );
        output.color = vec4f( mix( horizonFog, atmosphereColor, hemisphereMask), 1.0 );
        return output;
    }
    // Below horizon: fog with optional stars during twilight near ground
    else if ( hemisphereMask <= 0.0 ) {
        output.color = vec4f( horizonFog, 1.0 );
        return output;
    }
    // Above horizon: full atmosphere
    else {
        let nightSky: vec3f = sampleNightSky(direction);
        let atmosphereColor = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection, nightSky );
        output.color = vec4f( atmosphereColor, 1.0 );
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
    const WISP_RADIUS: f32 = ATM_END + 2000.0;

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
    
    // High-altitude wisps — guard against camera being above the wisp sphere
    let wispDist = intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), WISP_RADIUS);
    if (wispDist > 0.0) {
        var intersectionPoint = cameraPos + wispDist * rotatedDir;
    
        let cloudCoverFactor = mix( 0.6, 0.3, object.cloudiness );
        color += mix(FOG_COLOR_STORM, vec3f(2.0), saturate(sunDotUp)) * max( 0.0, fbm(vec3f(1.0, 1.0, 1.8) * intersectionPoint * 0.001) - cloudCoverFactor) * 2.0;
    }

    let background = getAtmosphereColor(sun_direction, dir, mu, nightSky * 10.0);

    // Add the background color to the final color
    color += background;
    return color;
}

