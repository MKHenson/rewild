

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

/**
 * Result of a sphere intersection that returns both hit distances.
 * tNear is the smaller root, tFar the larger. Both may be negative
 * (sphere behind the ray). hit is false when the ray misses entirely.
 */
struct SphereHit {
  tNear: f32,
  tFar: f32,
  hit: bool,
};

/**
 * Returns both intersection distances of a ray with a sphere.
 * Unlike intersectSphere(), this does not discard negative roots — the caller
 * can decide which root(s) to use based on camera altitude relative to the sphere.
 */
fn intersectSphereBoth(origin: vec3f, dir: vec3f, spherePos: vec3f, sphereRad: f32) -> SphereHit {
    let oc = origin - spherePos;
    // Half-b optimisation (a = 1 for normalised dir)
    let halfB = dot(dir, oc);
    let c = dot(oc, oc) - sphereRad * sphereRad;
    let quarterDisc = halfB * halfB - c;

    if (quarterDisc < 0.0) {
        return SphereHit(-1.0, -1.0, false);
    }

    let sqrtDisc = sqrt(quarterDisc);
    let tNear = -halfB - sqrtDisc;
    let tFar  = -halfB + sqrtDisc;

    return SphereHit(tNear, tFar, true);
}


fn getFogColor(dir: vec3f, org: vec3f, vSunDirection: vec3f, originalColor: vec3f ) -> vec3f {
    // Sun visibility: fades sun-driven scattering during dusk/dawn (sunDotUp ±0.1).
    // 0 = sun below horizon (no direct scatter), 1 = sun above horizon (full scatter)
    let sunVisibility = smoothstep(-0.1, 0.1, sunDotUp);
    let mu = dot(vSunDirection, dir) * sunVisibility;

    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + CLOUD_START);
    let fogDistanceToEarth = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS);
    let foginess = object.foginess;

    // Cloud occlusion: clouds block sunlight from reaching the lower atmosphere.
    // At 0% cloudiness = full sun, at 100% = only ~5% of sunlight penetrates.
    // Uses a squared curve so light clouds have modest effect, heavy clouds are dramatic.
    let cloudOcclusion = mix(1.0, 0.05, pow(object.cloudiness, 2.0));

    // Combined sun strength: elevation + cloud cover
    let effectiveSunStrength = sunVisibility * cloudOcclusion;

    // Henyey-Greenstein forward scattering (g=0.76 base, reduced in stormy/foggy conditions)
    let fogPhase = mix(0.4, 0.2, foginess * object.cloudiness) * HenyeyGreenstein(mu, mix( 0.76, 0.68, foginess * object.cloudiness ) );

    // Fog color transitions: night → evening (at horizon) → day
    var fogColor = mix(FOG_COLOR_NIGHT, FOG_COLOR_EVENING, smoothstep(-0.1, 0.0, sunDotUp));
    fogColor = mix(fogColor, FOG_COLOR_DAY, smoothstep(0.0, 0.3, sunDotUp));

    let stormFactor = saturate( (object.cloudiness - 0.8) / 0.2 );
    fogColor = mix( fogColor, FOG_COLOR_STORM, stormFactor );

    let fogDensity = mix( 0.00002, 0.0008, foginess );

    // Fog brightness: scales with both sun elevation and cloud cover.
    // Overcast skies produce dimmer, flatter fog even during daylight.
    let fogBrightness = mix(0.01, 1.0, effectiveSunStrength);
    fogColor = fogColor * fogBrightness;

    // Sun scatter contribution: warm forward-scattering glow from the sun.
    // Gated by sun elevation AND cloud cover — heavy clouds block the direct
    // sun beam that drives forward scattering in the fog layer.
    let sunScatter = effectiveSunStrength * fogPhase * 0.1 * LOW_SCATTER * SUN_POWER;

    // Camera above clouds looking down at earth: render as solid fog layer.
    // Fires when fogDistance = -1 (no cloud-sphere exit ahead) and fogDistanceToEarth > 0.
    if ( fogDistanceToEarth - fogDistance > 0 ) {
        return sunScatter + 10.0 * fogColor;
    }
    return mix( sunScatter + 10.0 * fogColor, originalColor.xyz, exp(-fogDensity * fogDistance ));
}

fn getAtmosphereColor(sun_direction: vec3f, dir: vec3f, mu: f32, nightColor: vec3f ) -> vec3f {
    // Day-night blend factor: 0 = full night, 1 = full day.
    // Dusk/dawn transition occurs at sunDotUp ±0.1 (~6° above/below horizon).
    let dayFactor = smoothstep(-0.1, 0.1, sunDotUp);

    // Sun proximity gradient: bright near the sun, dark away from it.
    // Drives the warm glow around the sun and sky color variation by view angle.
    let sunProximity = pow(max(0.0, 0.5 + 0.5 * mu), 15.0);

    // During twilight only, sun proximity extends a subtle warm glow toward the sun.
    // Fades to zero once the sun is fully below the horizon.
    let twilightGlow = sunProximity * smoothstep(-0.1, 0.05, sunDotUp) * (1.0 - dayFactor);
    let dayNightRatio = clamp(dayFactor + twilightGlow * 0.5, 0.0, 1.0);

    // Sun elevation blend for sky color palette:
    // 0 = sunset/sunrise warm colors, 1 = daytime cool colors
    let sunElevationBlend = smoothstep(-0.05, 0.15, sunDotUp);

    // Sky color palette
    let deepBlue = vec3f(0.2, 0.52, 1.0);       // Away from sun, daytime
    let paleBlue = vec3f(0.8, 0.95, 1.0);        // Toward sun, daytime
    let sunsetRed = vec3f(0.95, 0.3, 0.2);       // Away from sun, sunset
    let sunsetOrange = vec3f(1.0, 0.5, 0.2);     // Toward sun, sunset

    // Blend sky colors by sun elevation and viewing angle relative to sun
    let skyColor = mix(
        mix(sunsetRed, deepBlue, sunElevationBlend),
        mix(sunsetOrange, paleBlue, sunElevationBlend),
        sunProximity
    );

    // Sky brightness: dimmer at sunset, full brightness at noon
    let skyBrightness = mix(2.0, 6.0, smoothstep(0.0, 0.3, sunDotUp));

    // Altitude-based atmosphere thinning:
    // As the camera rises above the cloud layer the atmosphere gradually thins toward
    // black space. Full sky at/below cloud top (~1100 m), fades to nothing at ~15 km.
    // This gives the "going into space" effect — blue sky → dark blue → black, with
    // stars becoming visible through the thinning atmosphere even during daytime.
    let camAlt = object.cameraPosition.y;
    let atmosphereDensity = 1.0 - smoothstep(1100.0, 12000.0, camAlt);

    // Horizon haze: atmospheric scattering brightens the horizon.
    // Fades with altitude (thinner air) and scales with daylight (minimal at night).
    let horizonHaze = mix(0.3, 3.5, dayFactor) * max(0.0, 1.0 - 2.3 * dir.y) * atmosphereDensity;

    // Sky colour scales with atmospheric density; at high altitude the sky dims toward black
    var dayTimeColor = skyBrightness * skyColor * atmosphereDensity + vec3f(horizonHaze);

    // At high altitude the daytime atmosphere fades, letting the night sky (stars/space)
    // show through — even during the day, which is physically correct for near-space.
    let effectiveDayNight = dayNightRatio * atmosphereDensity;

    // Blend between night sky and daytime atmosphere
    return mix( nightColor, dayTimeColor, effectiveDayNight );
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