@group( 0 ) @binding( 0 )
var<uniform> object: ObjectStruct;

@group( 0 ) @binding( 1 )
var noiseSampler: sampler;

@group( 0 ) @binding( 2 )
var noiseTexture: texture_2d<f32>;

@group( 0 ) @binding( 5 )
var nightSkyCubemap: texture_cube<f32>;

var<private> varyings: VaryingsStruct;
var<private> output: OutputStruct;
var<private> sunDotUp: f32;

const STAR_ROTATION_OFFSET: f32 = -1.8; // radians

fn sampleNightSky(direction: vec3f) -> vec3f {
    let rotationAngle = STAR_ROTATION_OFFSET + object.iTime * 0.00001;
    let cosAngle = cos(rotationAngle);
    let sinAngle = sin(rotationAngle);
    let rotationMatrix = mat3x3<f32>(
        vec3f(cosAngle, -sinAngle, 0.0),
        vec3f(sinAngle, cosAngle, 0.0),
        vec3f(0.0, 0.0, 1.0)
    );

    let rotatedDir = rotationMatrix * direction;
    return textureSampleLevel(nightSkyCubemap, noiseSampler, rotatedDir, 0.0).rgb;
}

@fragment
fn fs( 
    @builtin(position) fragCoord: vec4<f32>,
	@location( 0 ) vRelPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32> ) -> OutputStruct {

    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));

	// vRelPosition is camera-relative, so the camera is at its origin.
	let direction: vec3f = normalize( vRelPosition );

	// Vertical component of view direction: 1.0 = looking straight up, -1.0 = straight down
    var viewVertical = dot( direction, vec3f(0.0, 1.0, 0.0) );

    // Camera altitude relative to cloud layer.
    // Camera-relative origin (camera at XZ = 0): keeps the spherical-earth
    // model translation-invariant so the sky doesn't break far from world
    // origin (see cloudsTemporal.wgsl for the full explanation).
    let org = vec3f(0.0, object.cameraPosition.y, 0.0);
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(org - earthCenter);
    const ATM_START_FS = EARTH_RADIUS + CLOUD_START;

    // NOTE: this pass is deliberately NOT depth-gated. Writing vec4f(0) on
    // terrain-occluded pixels used to punch black holes into the HDR blend
    // buffer, and the bloom pass (±15 texel Gaussian) averaged those zeros in,
    // producing a dark halo tracing every terrain silhouette. The gate saved
    // little — this is an analytic evaluation, not a raymarch — so the sky is
    // now evaluated full-screen and the composite pass discards it via its own
    // depth test. Only the expensive cloud raymarch stays depth-gated; the
    // bloom pass masks that one out by coverage weight instead.

    if (camHeight >= ATM_START_FS) {
        // Above the cloud layer. Fade out stars when looking down and when clouds are thick.
        let nightSky: vec3f = sampleNightSky(direction);
        let downFade = smoothstep(-0.1, 0.1, viewVertical);
        let cloudinessFade = 1.0 - object.cloudiness;
        let adjustedNightSky = nightSky * downFade * cloudinessFade;
        let atmosphereColor = drawSkyAndHorizonFog( direction, org, vSunDirection, adjustedNightSky );
        output.color = vec4f( atmosphereColor, 1.0 );
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
    // Stars fade with cloud coverage.
    let horizonDir = normalize(vec3f(direction.x, max(0.001, direction.y), direction.z));
    let horizonNightSky = sampleNightSky(horizonDir) * starVisibility * (1.0 - object.cloudiness);
    var horizonFog = drawSkyAndHorizonFog(horizonDir, org, vSunDirection, horizonNightSky);

    // Azimuth is undefined looking straight down — every azimuth converges on
    // that single direction — so painting the lower hemisphere with a
    // per-azimuth horizon colour compresses the whole 360-degree ring into a
    // singularity at the nadir. On screen this never mattered: you rarely look
    // straight down at fog, and terrain covers it when you do. The IBL capture
    // is what made it visible, because there the down face is a sixth of the
    // ambient and the pinch put a bright fan through the middle of it.
    //
    // Fade the azimuthal signal out over the last ~45 degrees, toward one
    // azimuth-independent colour. The stand-in direction is horizontal and
    // perpendicular to the sun, so its mu is exactly zero — a fair proxy for
    // the ring mean given how forward-peaked the fog phase function is, and
    // free of the degeneracy that interpolating the *direction* would hit on
    // the opposite azimuth. Colours are mixed rather than directions for the
    // same reason.
    let nadirFade = smoothstep(-0.7, -1.0, viewVertical);
    if (nadirFade > 0.0) {
        // cross() collapses with the sun overhead. Any horizontal direction is
        // correct there, since mu is zero for all of them.
        var sunPerp = vec3f(1.0, 0.0, 0.0);
        let perpAxis = cross(vSunDirection, vec3f(0.0, 1.0, 0.0));
        let perpLen = length(perpAxis);
        if (perpLen > 1e-3) {
            sunPerp = perpAxis / perpLen;
        }

        let nadirNightSky = sampleNightSky(sunPerp) * starVisibility * (1.0 - object.cloudiness);
        let nadirFog = drawSkyAndHorizonFog(sunPerp, org, vSunDirection, nadirNightSky);
        horizonFog = mix(horizonFog, nadirFog, nadirFade);
    }

    // Below clouds — original hemisphere masking
	// Smooth transition: 0 = below horizon, 1 = above horizon
	let hemisphereMask: f32 = smoothstep( -0.3, -0.1, viewVertical );

    // Horizon transition band: blend between below-horizon color and atmosphere above
    if ( hemisphereMask < 1 && hemisphereMask > 0.0 ) {
        let nightSky: vec3f = sampleNightSky(direction) * (1.0 - object.cloudiness);
        let atmosphereColor = drawSkyAndHorizonFog( direction, org, vSunDirection, nightSky );
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
        let nightSky: vec3f = sampleNightSky(direction) * (1.0 - object.cloudiness);
        let atmosphereColor = drawSkyAndHorizonFog( direction, org, vSunDirection, nightSky );
        output.color = vec4f( atmosphereColor, 1.0 );
        return output;
    } 
}

fn drawSkyAndHorizonFog(dir: vec3f, org: vec3f, vSunDirection: vec3f, nightSky: vec3f ) -> vec3f {
    let mu = dot(vSunDirection, dir);
    var color = getAtmosphereColor(vSunDirection, dir, mu, nightSky);
    color = getFogColor( dir, org, vSunDirection, color.rgb );
    return color;
}

