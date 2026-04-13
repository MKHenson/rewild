 
const NUM_CLOUD_SAMPLES = 80;
const NUM_LIGHT_SAMPLES = 20;

@group( 0 ) @binding( 0 ) 
var<uniform> object : ObjectStruct;

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

    // Calculate camera altitude relative to cloud layer for hemisphere masking
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(object.cameraPosition - earthCenter);
    const ATM_START_FS = EARTH_RADIUS + CLOUD_START;

    // in scattering
    var cosTheta = dot( direction, vec3f(0.0, 1.0, 0.0) );

    // Define uv based on fragCoord
    let uv = fragCoord.xy / vec2(object.resolutionX * object.resolutionScale, object.resolutionY * object.resolutionScale);

    if (camHeight >= ATM_START_FS) {
        // Inside or above clouds — skip depth early-out so clouds render over
        // distant terrain. skyRay() handles early-out when the ray misses the
        // cloud shell entirely.
        let atmosphereWithSunAndClouds = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection );
        output.color = atmosphereWithSunAndClouds;
        return output;
    }

    // Below clouds: do not draw pixel if blocked by something in the z-buffer
    let rawDepth = textureSampleCompare( depthTexture, depthSampler, uv, 1 );
    if (rawDepth < 1.0) {
         output.color = vec4f( 0.0, 0.0, 0.0, 0.0 );
        return output;
    }

    // Below clouds — original hemisphere mask: only render upward
	let hemisphereMask: f32 = smoothstep( 0, 0.1, cosTheta );

	// The area below the horizon
    if ( hemisphereMask <= 0.0 ) {
        output.color = vec4f( 0.0,0.0,0.0, 0.0 );
        return output;
    }
    // The area above the horizon
    else {
        let atmosphereWithSunAndClouds = drawCloudsAndSky( direction, object.cameraPosition, vSunDirection,  );
        output.color = atmosphereWithSunAndClouds;
        return output;
    } 
}


fn drawCloudsAndSky(dir: vec3f, org: vec3f, vSunDirection: vec3f ) -> vec4f {
	var color = vec4f(.0);   
    color = skyRay(org, dir, vSunDirection); 

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(org - earthCenter);
    const ATM_START_DCS = EARTH_RADIUS + CLOUD_START;

    var cloudAlpha = color.a;
    if (camHeight < ATM_START_DCS) {
        // Only apply distance-based fog alpha attenuation when below clouds
        let fogDensity = mix(0.00001, 0.00009, object.foginess);
        let fogDistance = intersectSphere(org, dir, earthCenter, ATM_START_DCS);
        cloudAlpha = min( exp(-fogDensity * fogDistance ), color.a );
    }
    
    return vec4f( getFogColor( dir, org, vSunDirection, color.rgb ), cloudAlpha);
}

fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f) -> vec4f {
    // Constants for the cloud shell boundaries
    const ATM_START: f32 = EARTH_RADIUS + CLOUD_START;
    const ATM_END: f32 = ATM_START + CLOUD_HEIGHT;
    const CLOUD_FOG_DENSITY: f32 = 0.003;
    const TRANSITION_ZONE: f32 = 50.0;

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(cameraPos - earthCenter);

    // Intersect with both sphere shells (inner = cloud base, outer = cloud top)
    let hitInner = intersectSphereBoth(cameraPos, dir, earthCenter, ATM_START);
    let hitOuter = intersectSphereBoth(cameraPos, dir, earthCenter, ATM_END);

    var tStart: f32;
    var tEnd: f32;
    var isInsideClouds = false;

    if (camHeight < ATM_START) {
        // Case 1: Below clouds
        // Camera is inside both spheres → tFar is the exit for each
        if (!hitInner.hit) { return vec4f(0.0); }
        tStart = hitInner.tFar;   // Exit of inner sphere = entry into cloud layer
        tEnd = hitOuter.tFar;     // Exit of outer sphere = exit from cloud layer
    } else if (camHeight <= ATM_END) {
        // Case 2: Inside cloud layer
        // Camera is outside inner sphere, inside outer sphere
        isInsideClouds = true;
        tStart = 0.0;
        if (hitInner.hit && hitInner.tNear > 0.0) {
            // Ray hits inner sphere — cloud volume ends at inner sphere entry
            tEnd = hitInner.tNear;
        } else {
            // Ray misses inner sphere — cloud volume ends at outer sphere exit
            tEnd = hitOuter.tFar;
        }
        tEnd = min(tEnd, 2000.0); // Cap ray length for performance
    } else {
        // Case 3: Above clouds
        // Camera is outside both spheres (above)
        if (!hitOuter.hit || hitOuter.tNear < 0.0) { return vec4f(0.0); }
        tStart = hitOuter.tNear;  // Entry into outer sphere = entry into cloud layer
        if (hitInner.hit && hitInner.tNear > 0.0) {
            // Ray hits inner sphere = exit from cloud layer
            tEnd = hitInner.tNear;
        } else {
            // Ray skims through outer sphere without hitting inner
            tEnd = hitOuter.tFar;
        }
    }

    if (tStart >= tEnd || tEnd <= 0.0) { return vec4f(0.0); }

    // Check if ray hits the Earth — don't render clouds behind the planet
    let hitEarth = intersectSphereBoth(cameraPos, dir, earthCenter, EARTH_RADIUS);
    if (hitEarth.hit && hitEarth.tNear > 0.0) {
        tEnd = min(tEnd, hitEarth.tNear);
        if (tStart >= tEnd) { return vec4f(0.0); }
    }

    // Adaptive sample count based on ray length and altitude case
    let rayLength = tEnd - tStart;
    var nbSample = i32(f32(NUM_CLOUD_SAMPLES) * min(1.0, rayLength / 2000.0));
    if (isInsideClouds) {
        nbSample = i32(f32(nbSample) * 0.3); // 70% fewer samples inside clouds
    }
    nbSample = max(nbSample, 8); // Floor at 8 samples minimum

    // Initialize the color to black
    var color = vec3f(0.0);

    // Step size for ray marching
    let stepS = rayLength / f32(nbSample);

    // Calculate the starting position of the ray
    var rayStartPosition = cameraPos + tStart * dir;

    // Initialize the transmittance to 1 (no light absorbed)
    var transmittance = 1.0;
    let mu = dot(sun_direction, dir);

    // Calculate the phase function for Mie scattering
    let phaseFunction = numericalMieFit(mu);
    rayStartPosition += dir * stepS * hash1(dot(dir, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001);

    let sunDotUp3 = pow(sunDotUp, 3.0);

    // Ray march through the cloud volume
    for (var i = 0; i < nbSample; i++) {
        var cloudHeight: f32;
        let result = clouds(rayStartPosition);
        let density = result.density;
        cloudHeight = result.cloudHeight;

        // If there is cloud density at this sample point
        if (density > 0.0) {
            // Calculate the light intensity scattered by the clouds
            let intensity = lightRay(rayStartPosition, phaseFunction, density, mu, sun_direction, cloudHeight);

            // Calculate the ambient light color based on time of day
            var cloudAmbientColor = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_EVENING_COLOR, smoothstep(-0.2, 0.2, sunDotUp));
            cloudAmbientColor = mix(cloudAmbientColor, CLOUD_AMBIENT_DAY_COLOR, smoothstep(0.2, 0.8, sunDotUp));

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

    // Cloud interior fog effect — provides immersive in-cloud experience
    // Uses smooth transition zone to avoid visual popping at altitude boundaries
    let insideBlend = smoothstep(ATM_START - TRANSITION_ZONE, ATM_START + TRANSITION_ZONE, camHeight)
                    * (1.0 - smoothstep(ATM_END - TRANSITION_ZONE, ATM_END + TRANSITION_ZONE, camHeight));
    if (insideBlend > 0.0) {
        let fogAmount = 1.0 - exp(-CLOUD_FOG_DENSITY * rayLength);
        var cloudFogColor = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_EVENING_COLOR, smoothstep(-0.2, 0.2, sunDotUp));
        cloudFogColor = mix(cloudFogColor, CLOUD_AMBIENT_DAY_COLOR, smoothstep(0.2, 0.8, sunDotUp));
        color = mix(color, cloudFogColor * 0.5, fogAmount * insideBlend);
    }

    let background = getAtmosphereColor(sun_direction, dir, mu, vec3f(0.0));

    color += background * pow(transmittance, 2.0);

    // Sun disc: drawn only in this pass so clouds naturally occlude it via transmittance.
    // Atmospheric extinction fades the disc during dusk/dawn (sunDotUp ±0.1).
    let sunExtinction = smoothstep(-0.1, 0.1, sunDotUp);

    // Atmospheric optical depth: at the horizon, sunlight traverses ~25-40x more
    // atmosphere than overhead (airmass). This naturally dims the sun disc at low
    // elevations — matching the real-world effect where the setting sun appears dim
    // and red even on a clear day. Without this, the 500.0 intensity overwhelms
    // cloud transmittance because horizontal rays graze the bottom of the cloud
    // layer where density is shaped to be near zero.
    let airmass = 1.0 / max(sunDotUp, 0.04);
    let atmosphericDimming = exp(-0.15 * airmass);

    let sunDisc = 500.0 * smoothstep(0.9998, 1.0, mu) * sunExtinction * atmosphericDimming;
    color += vec3f(sunDisc) * pow(transmittance, 2.0);

    // Alpha: cloud coverage OR sun disc presence.
    // Ensures the sun is visible through the composite even when there are no clouds.
    let sunAlpha = smoothstep(0.9995, 1.0, mu) * sunExtinction;
    var alpha = max(1.0 - transmittance, sunAlpha);

    // Inside clouds: boost alpha with fog contribution for smooth transition
    if (insideBlend > 0.0) {
        let fogAlpha = 1.0 - exp(-CLOUD_FOG_DENSITY * rayLength);
        alpha = max(alpha, fogAlpha * insideBlend);
    }

    return vec4f(color, alpha);
}

fn clouds(position: vec3f) -> CloudDensityResult {
    return cloudDensity(position, object.windiness, object.cloudiness, object.iTime);
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

fn lightRay(rayStartPosition: vec3f, phaseFunction: f32, dC: f32, mu: f32, sun_direction: vec3f, cloudHeight2: f32) -> f32 {
    // Initialize the starting position of the light ray
    var rayStartPos = rayStartPosition;
    
    // Number of samples for light ray marching
    var nbSampleLight = NUM_LIGHT_SAMPLES;

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
        let result = clouds( rayStartPos + sun_direction * f32(j) * stepL);
        cloudHeight = result.cloudHeight;
        lighRayDen += result.density;
    }

     // Calculate the angle between the sun direction and the vertical direction (y-axis)
    let sunAngle = dot(sun_direction, vec3f(0.0, 1.0, 0.0));

    // Apply a gradient-based reduction to the light intensity if the sun is below the horizon
    let sunIntensityModifier = smoothstep(0.0, 0.1, sunAngle);

    // Calculate the scattering amount based on the angle between the light ray and the view direction
    let scatterAmount: f32 = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
    
    // Calculate the Beer's law attenuation
    let beersLaw: f32 = exp(-stepL * lighRayDen) + 0.5 * scatterAmount * exp(-0.1 * stepL * lighRayDen) + scatterAmount * 0.4 * exp(-0.02 * stepL * lighRayDen);
    
    // Return the final light intensity
    return sunIntensityModifier * beersLaw * phaseFunction * mix(0.05 + 1.5 * pow(min(1.0, dC * 8.5), 0.3 + 5.5 * cloudHeight), 1.0, clamp(lighRayDen * 0.4, 0.0, 1.0));
}