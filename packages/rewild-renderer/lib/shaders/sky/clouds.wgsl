 
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

    // in scattering
    var cosTheta = dot( direction, vec3f(0.0, 1.0, 0.0) );
	let hemisphereMask: f32 = smoothstep( 0, 0.1, cosTheta );

    // Define uv based on fragCoord
    let uv = fragCoord.xy / vec2(object.resolutionX * object.resolutionScale, object.resolutionY * object.resolutionScale);

    // Do not draw pixel if blocked by something in the z-buffer
    let rawDepth = textureSampleCompare( depthTexture, depthSampler, uv, 1 );
    if (rawDepth < 1.0) {
         output.color = vec4f( 0.0, 0.0, 0.0, 0.0 );
        return output;
    }

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

    let fogDensity = mix(0.00001, 0.00009, object.foginess);
    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + CLOUD_START);
    let cloudAlphaAffectedByFogDistance = min( exp(-fogDensity * fogDistance ), color.a );
    
    return vec4f( getFogColor( dir, org, vSunDirection, color.rgb ), cloudAlphaAffectedByFogDistance);
}

fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f) -> vec4f {
    // Constants for the start and end of the atmosphere
    const ATM_START: f32 = EARTH_RADIUS + CLOUD_START;
    const ATM_END: f32 = ATM_START + CLOUD_HEIGHT;

    // Number of samples for ray marching
    var nbSample = NUM_CLOUD_SAMPLES;

    // Initialize the color to black
    var color = vec3f(0.0);

    // Calculate the intersection of the ray with the start and end of the atmosphere
    var distToAtmStart = intersectSphere(cameraPos, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), ATM_START);
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
            let result = clouds(rayStartPosition);
            let density = result.density;
            cloudHeight = result.cloudHeight;

            // If there is cloud density at this sample point
            if (density > 0.0) {
                // Calculate the light intensity scattered by the clouds
                let intensity = lightRay(rayStartPosition, phaseFunction, density, mu, sun_direction, cloudHeight);

                // Calculate the ambient light 
                // Calulate the ambient color based on the time of day and the sun direction
                
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
    return vec4f(color, max(1.0 - transmittance, sunAlpha));
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