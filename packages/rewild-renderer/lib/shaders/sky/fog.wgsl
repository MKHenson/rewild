

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


// ─────────────────────────────────────────────────────────────────────────────
// Exponential height fog
//
// Fog is a dense layer up to a ceiling, falling off exponentially above it:
//   density(y) = baseDensity * exp(-max(y - ceiling, 0) / scaleHeight)
// so the fog layer is anchored to the world — pooling over low terrain — instead
// of following the camera. (A uniform-density layer's visual horizon always sits
// at eye level, which made the fog line climb mountains as the camera rose.)
// The transmittance integral along a ray has a closed form, evaluated below.
//
// A thin altitude-independent haze (HAZE_DENSITY) is kept on top of the layer
// for aerial perspective, so distant terrain and horizon clouds still fade
// even at foginess = 0.
// ─────────────────────────────────────────────────────────────────────────────

const FOG_BASE_HEIGHT: f32 = 50.0;   // lowest fog ceiling, and the scene haze's reference height
const HAZE_DENSITY: f32 = 0.00009;  // constant aerial-perspective haze

// Cloudiness at which the sky counts as fully overcast for lighting purposes.
// Cover beyond this adds no further occlusion — see getFogScatterColor().
const OVERCAST_FULL: f32 = 0.95;

// A broad haze over the ground fog, for scene pixels only: it thickens with
// foginess and reaches far above the ground layer, so distant terrain fades
// from any camera height. Thinner with altitude, never gone.
const SCENE_HAZE_DENSITY: f32 = 0.0005;       // per metre at FOG_BASE_HEIGHT, foginess 1
const SCENE_HAZE_SCALE_HEIGHT: f32 = 1200.0;

// The ground fog is a dense layer with a ceiling, thinning quickly above it, so
// from a peak its top reads as a surface over the valleys. Both the ceiling
// and the falloff rise with foginess: low settings pool in the valleys, full
// fog climbs over the mountains.
// Mirrored on the CPU in SkyRenderer.postRender — change both together.
const FOG_LAYER_DEPTH_MAX: f32 = 700.0;   // ceiling above FOG_BASE_HEIGHT at foginess 1
const FOG_FALLOFF_MIN: f32 = 15.0;        // scale height above the ceiling
const FOG_FALLOFF_MAX: f32 = 60.0;

fn heightFogCeiling(foginess: f32) -> f32 {
    return FOG_BASE_HEIGHT + FOG_LAYER_DEPTH_MAX * foginess * foginess;
}

fn heightFogOpticalDepth(org: vec3f, dir: vec3f, dist: f32) -> f32 {
    return exponentialOpticalDepth(
        org, dir, dist,
        0.01 * object.foginess * object.foginess,
        mix(FOG_FALLOFF_MIN, FOG_FALLOFF_MAX, object.foginess),
        heightFogCeiling(object.foginess)
    );
}

// Optical depth along the ray through a layer whose density is `baseDensity`
// at and below `ceiling` and falls off as exp(-(y - ceiling) / scaleHeight)
// above it.
//
// The ray is split where it crosses the base height: constant density below,
// the exact exponential integral above. Letting the exponential carry on below
// the base instead makes the fog below it e^(depth / scaleHeight) times too
// dense, which for a thin layer is hundreds of times.
fn exponentialOpticalDepth(
    org: vec3f, dir: vec3f, dist: f32,
    baseDensity: f32, scaleHeight: f32, ceiling: f32
) -> f32 {
    if (baseDensity <= 0.0) {
        return 0.0;
    }
    let d = max(dist, 0.0);

    // Near-horizontal ray: the density is ~constant along the path.
    if (abs(dir.y) < 1e-5) {
        return baseDensity * exp(-max(org.y - ceiling, 0.0) / scaleHeight) * d;
    }

    let tCross = (ceiling - org.y) / dir.y;
    var below = 0.0;
    var tAboveStart = 0.0;
    var tAboveEnd = 0.0;
    if (org.y < ceiling) {
        if (dir.y > 0.0) {
            below = min(tCross, d);
            tAboveStart = below;
            tAboveEnd = d;
        } else {
            below = d;
        }
    } else {
        tAboveEnd = select(d, min(tCross, d), dir.y < 0.0);
        below = d - tAboveEnd;
    }

    // ∫ exp(-(y(t) - base) / H) dt = (H / dir.y) · [e(start) - e(end)], with
    // every exponent ≤ 0 above the base, so nothing can overflow.
    var above = 0.0;
    if (tAboveEnd > tAboveStart) {
        let yStart = org.y + dir.y * tAboveStart;
        let yEnd = org.y + dir.y * tAboveEnd;
        above = (scaleHeight / dir.y) * (
            exp(-max(yStart - ceiling, 0.0) / scaleHeight) -
            exp(-max(yEnd - ceiling, 0.0) / scaleHeight)
        );
    }
    return baseDensity * (below + above);
}

/** Fraction of background light surviving along the ray (0 = full fog, 1 = clear). */
fn fogTransmittance(org: vec3f, dir: vec3f, dist: f32) -> f32 {
    let d = max(dist, 0.0);
    let opticalDepth = HAZE_DENSITY * d + heightFogOpticalDepth(org, dir, d);
    return exp(-min(opticalDepth, 50.0));
}

/** fogTransmittance plus the scene haze: what reaches the eye from a scene pixel. */
fn sceneFogTransmittance(org: vec3f, dir: vec3f, dist: f32) -> f32 {
    let d = max(dist, 0.0);
    let opticalDepth = HAZE_DENSITY * d
        + heightFogOpticalDepth(org, dir, d)
        + exponentialOpticalDepth(org, dir, d, SCENE_HAZE_DENSITY * object.foginess, SCENE_HAZE_SCALE_HEIGHT, FOG_BASE_HEIGHT);
    return exp(-min(opticalDepth, 50.0));
}

/** How much brighter the fully-cold, fully-desaturated colour reads. 1.0 = plain
 *  grey; above that it lifts toward a pale white-out. */
const COLD_LIFT: f32 = 1.12;

/**
 * Applies the climate colour cast. temperature 0.5 is neutral.
 *
 *   hot  (→1) — multiplicative warm cast: red up, blue down.
 *   cold (→0) — desaturates toward white rather than tinting blue.
 *
 * The two ends work differently on purpose. A per-channel multiply can only ever
 * remove colour, so expressing "cold" as (1 - k·cool) on R/G and (1 + k·cool) on
 * B just drives the result toward saturated blue as k grows — at k=1 red and
 * green hit zero. Desaturating toward the colour's own luminance (and lifting it
 * slightly) is what actually reads as a cold white-out.
 *
 * `neutralize` (0–1) fades the whole effect out — used under heavy overcast,
 * where the sky should be colourless regardless of season.
 *
 * Mirrored on the CPU in SkyRenderer.update() for the directional light —
 * change both together.
 */
fn applyClimateTint(color: vec3f, temperature: f32, neutralize: f32) -> vec3f {
    let warm = max(temperature - 0.5, 0.0) * 2.0;
    let cool = max(0.5 - temperature, 0.0) * 2.0;

    let warmTint = vec3f(1.0 + 0.35 * warm, 1.0 + 0.085 * warm, 1.0 - 0.07 * warm);
    var result = color * mix(warmTint, vec3f(1.0), neutralize);

    let luma = dot(result, vec3f(0.2126, 0.7152, 0.0722));
    return mix(result, vec3f(luma * COLD_LIFT), cool * (1.0 - neutralize));
}

/**
 * Fully fog-saturated colour for a given view/sun direction: what an infinitely
 * thick wall of fog looks like. Callers blend toward the background colour with
 * fogTransmittance() — or use it directly as an alpha-blended overlay.
 */
fn getFogScatterColor(dir: vec3f, vSunDirection: vec3f) -> vec3f {
    // Sun visibility: fades sun-driven scattering during dusk/dawn (sunDotUp ±0.1).
    // 0 = sun below horizon (no direct scatter), 1 = sun above horizon (full scatter)
    let sunVisibility = smoothstep(-0.1, 0.1, sunDotUp);
    let mu = dot(vSunDirection, dir) * sunVisibility;

    let foginess = object.foginess;

    // Cloud occlusion: clouds block sunlight from reaching the lower atmosphere.
    // At 0% cloudiness = full sun. Squared curve, so light clouds have a modest
    // effect and heavy clouds are dramatic.
    //
    // The drive plateaus at OVERCAST_FULL. The squared curve is still steepening
    // at the top, so without the clamp the last 10% of cloudiness dropped fog
    // brightness ~4x (0.24 → 0.06) and full overcast went almost black. Real
    // overcast reads flat and grey, not dark — so total cover lights the fog the
    // same as heavy cover.
    let cloudOcclusion = mix(1.0, 0.05, pow(min(object.cloudiness, OVERCAST_FULL), 2.0));

    // Combined sun strength: elevation + cloud cover
    let effectiveSunStrength = sunVisibility * cloudOcclusion;

    // Henyey-Greenstein forward scattering (g=0.76 base, reduced in stormy/foggy conditions)
    let fogPhase = mix(0.4, 0.2, foginess * object.cloudiness) * HenyeyGreenstein(mu, mix( 0.76, 0.68, foginess * object.cloudiness ) );

    // Evening haze, split by azimuth. Uses the raw view-sun angle rather than the
    // sunVisibility-scaled `mu` above: the gold-to-violet split across the ring is
    // a property of where the sun is, and fades out through the evening window
    // below rather than collapsing to the perpendicular colour as the sun sets.
    let wedge = saturate(0.5 + 0.5 * dot(vSunDirection, dir));
    let sunWedge = wedge * wedge;
    let eveningColor = mix(FOG_COLOR_EVENING_AWAY, FOG_COLOR_EVENING_SUN, sunWedge);

    // Fog color transitions: night → evening (at horizon) → day. The evening
    // window reaches down to -9 degrees so the warm band outlives the sunset,
    // roughly tracking the sky's own NIGHT_FADE ramp.
    var fogColor = mix(FOG_COLOR_NIGHT, eveningColor, smoothstep(-0.16, 0.0, sunDotUp));
    fogColor = mix(fogColor, FOG_COLOR_DAY, smoothstep(0.0, 0.3, sunDotUp));

    let stormFactor = saturate( (object.cloudiness - 0.8) / 0.2 );
    fogColor = mix( fogColor, FOG_COLOR_STORM, stormFactor );

    // W1.3: shift horizon fog toward neutral gray under overcast (daytime only)
    let overcastDayFactor_fog = smoothstep(-0.05, 0.15, sunDotUp);
    let overcastFactor_fog    = smoothstep(0.8, 0.9, object.cloudiness) * overcastDayFactor_fog;
    fogColor = mix(fogColor, vec3f(0.73, 0.73, 0.73), overcastFactor_fog);

    // Extreme overcast (0.9→1.0): desaturate toward luminance so the storm tint's
    // khaki cast reads as neutral grey. Unlike the W1.3 blend above this isn't
    // gated by sun elevation — a maxed-out sky is colourless at any hour — and it
    // preserves brightness (night stays dark, day stays bright) by pulling toward
    // the fog's own luminance rather than a fixed grey.
    let neutralSwing = smoothstep(0.9, 1.0, object.cloudiness);
    let fogLuma = dot(fogColor, vec3f(0.2126, 0.7152, 0.0722));
    fogColor = mix(fogColor, vec3f(fogLuma), neutralSwing);

    // Fog brightness: scales with both sun elevation and cloud cover.
    // Overcast skies produce dimmer, flatter fog even during daylight.
    let fogBrightness = mix(0.01, 1.0, effectiveSunStrength);
    fogColor = fogColor * fogBrightness;

    // Sun scatter contribution: warm forward-scattering glow from the sun.
    // Gated by sun elevation AND cloud cover — heavy clouds block the direct
    // sun beam that drives forward scattering in the fog layer.
    let sunScatter = effectiveSunStrength * fogPhase * 0.1 * LOW_SCATTER * SUN_POWER;

    // Climate tint fades out under extreme overcast: a maxed-out sky is neutral
    // grey regardless of season, so the cast is cancelled over the same 0.9→1.0
    // bracket that desaturates fogColor above. Without that the tint re-applies
    // the hue after the desaturation and heavy cover still looks warm.
    // Night sky-glow. Added rather than folded into the fogBrightness floor on
    // purpose: that floor is also what dims fog under daytime overcast (via
    // cloudOcclusion in effectiveSunStrength), so raising it would have brightened
    // overcast days by ~6x as a side effect. Gating on nightFactor keeps the change
    // confined to the hours that are actually broken.
    let nightFactor = 1.0 - sunVisibility;
    let nightAmbient = FOG_NIGHT_AMBIENT * nightFactor;

    return applyClimateTint(sunScatter + 10.0 * fogColor + nightAmbient, object.temperature, neutralSwing);
}

fn getFogColor(dir: vec3f, org: vec3f, vSunDirection: vec3f, originalColor: vec3f ) -> vec3f {
    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + CLOUD_START);
    let fogDistanceToEarth = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS);

    let scatterColor = getFogScatterColor(dir, vSunDirection);

    // Camera above clouds looking down at earth: render as solid fog layer.
    // Fires when fogDistance = -1 (no cloud-sphere exit ahead) and fogDistanceToEarth > 0.
    if ( fogDistanceToEarth - fogDistance > 0 ) {
        return scatterColor;
    }
    return mix( scatterColor, originalColor.xyz, fogTransmittance(org, dir, fogDistance) );
}

fn getAtmosphereColor(sun_direction: vec3f, dir: vec3f, mu: f32, nightColor: vec3f ) -> vec3f {
    // Day-night blend factor: 0 = full night, 1 = full day.
    // Dusk/dawn transition occurs at sunDotUp ±0.1 (~6° above/below horizon).
    // Drives the horizon haze and the twilight glow only — the night sky itself
    // runs on the much longer NIGHT_FADE_* ramp below.
    let dayFactor = smoothstep(-0.1, 0.1, sunDotUp);
    let nightDayFactor = smoothstep(NIGHT_FADE_END, NIGHT_FADE_START, sunDotUp);

    // Overcast has two independent effects, deliberately timed differently:
    //   greyFactor — desaturates the sky toward flat overcast grey. Ramps in
    //     early and is fully grey by 0.9, so a heavily-clouded-but-not-total sky
    //     (~0.8) reads as bright natural overcast rather than a dark sky.
    //   darkFactor — dims the sky. Held back to the 0.9→1.0 bracket so only a
    //     near-total overcast actually goes dark. (Previously both shared one
    //     0.7→0.95 ramp, so 0.8 was ~35% dimmed and looked unnaturally dark.)
    // Both gated by day so the night sky is unaffected.
    let overcastDayFactor = smoothstep(-0.05, 0.15, sunDotUp);
    let greyFactor        = smoothstep(0.5, 0.9, object.cloudiness) * overcastDayFactor;
    let darkFactor        = smoothstep(0.9, 1.0, object.cloudiness) * overcastDayFactor;
    let overcastFactor    = greyFactor;

    // Sun proximity gradient: bright near the sun, dark away from it.
    // Soften the sun halo edge under cloud cover (sharp clear-sky halo → diffuse glow).
    let sunSharpness  = mix(15.0, 3.0, overcastFactor);
    let sunProximity = pow(max(0.0, 0.5 + 0.5 * mu), sunSharpness);

    // Broad sun-facing wedge, for the twilight palette only. sunProximity is a
    // ~30 degree halo — right for the daytime whitening around the sun, far too
    // tight for the sunset arc, which spreads across most of a hemisphere.
    // 1 at the sun, 0.25 at 90 degrees, 0 opposite.
    let sunWedge = pow(max(0.0, 0.5 + 0.5 * mu), mix(2.0, 4.0, overcastFactor));

    // During twilight only, sun proximity extends a subtle warm glow toward the sun.
    // Fades to zero once the sun is fully below the horizon.
    let twilightGlow = sunProximity * smoothstep(-0.1, 0.05, sunDotUp) * (1.0 - dayFactor);
    let dayNightRatio = clamp(nightDayFactor + twilightGlow * 0.5, 0.0, 1.0);

    // Sun elevation blend for sky color palette:
    // 0 = sunset/sunrise warm colors, 1 = daytime cool colors
    let sunElevationBlend = smoothstep(-0.05, 0.15, sunDotUp);

    // Vertical structure of the twilight sky. Two nested weights rather than one
    // ramp: the warm band is squeezed into the last few degrees above the horizon
    // (wHorizon is already down to 0.11 at 10 degrees) while the violet mid-band
    // it sits under runs up to roughly 45 degrees.
    // Base clamped away from zero: pow() is exp2(e * log2(base)) in WGSL, which
    // can NaN on a zero base on some drivers rather than returning 0.
    let down = max(1.0 - saturate(dir.y), 1e-4);
    let wHorizon = pow(down, 12.0);
    let wLow     = pow(down, 3.0);

    let duskAway = mix(mix(SKY_DUSK_ZENITH, SKY_DUSK_MID, wLow), SKY_DUSK_HORIZON, wHorizon);
    let duskSun  = mix(mix(SKY_DUSK_SUN_ZENITH, SKY_DUSK_SUN_MID, wLow), SKY_DUSK_SUN_HORIZON, wHorizon);

    // Blend sky colors by sun elevation and viewing angle relative to sun. The
    // daytime sky gets its own vertical gradient from horizonHaze below, so it
    // only needs the sun-proximity axis here.
    let skyColorClear = mix(
        mix(duskAway, duskSun, sunWedge),
        mix(SKY_DAY_DEEP_BLUE, SKY_DAY_PALE_BLUE, sunProximity),
        sunElevationBlend
    );

    // W1.2: shift sky toward pale overcast gray under heavy cloud cover
    let overcastZenith = vec3f(1, 1, 1);
    let skyColor = mix(skyColorClear, overcastZenith, overcastFactor);

    // Sky brightness: dimmer at sunset, full brightness at noon.
    // W1.4: dim the sun contribution through clouds (0.15 at full overcast).
    //
    // Below the horizon this used to floor at 2.0, which was fine while the night
    // blend cut in at -0.1 but holds a bright sunset palette across the longer fade.
    // twilightDim is exactly 1.0 at and above the horizon, so daylight is untouched.
    let twilightDim = mix(TWILIGHT_DIM_FLOOR, 1.0, smoothstep(NIGHT_FADE_END, 0.0, sunDotUp));
    let skyBrightness = mix(2.0, 6.0, smoothstep(0.0, 0.3, sunDotUp)) * twilightDim;
    let sunDim = mix(1.0, 0.3, darkFactor);

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

    // Neutral white by day, but at dusk it carries the same warm/cool split as
    // the palette. As a plain white additive it is the single largest term in the
    // bottom 25 degrees at sunset, so leaving it achromatic desaturates the arc
    // back to grey no matter what the palette does. Overcast pulls it back to
    // white, where a colourless sky is what we want anyway.
    let hazeTint = mix(
        mix(SKY_DUSK_HAZE_AWAY, SKY_DUSK_HAZE_SUN, sunWedge),
        vec3f(1.0),
        max(sunElevationBlend, overcastFactor)
    );

    // Sky colour scales with atmospheric density; at high altitude the sky dims toward black
    var dayTimeColor = skyBrightness * skyColor * atmosphereDensity * sunDim + horizonHaze * hazeTint;

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