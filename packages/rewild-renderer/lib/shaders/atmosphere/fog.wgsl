

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


fn getFogColor(dir: vec3f, org: vec3f, vSunDirection: vec3f, originalColor: vec3f ) -> vec3f {
	let sunInSkyMask = clamp( pow(1.75 + 1.75 * sunDotUp, 1.0), 0.0, 1.0 );
    let mu = dot(vSunDirection, dir) * sunInSkyMask;

    let fogDistance = intersectSphere(org, dir, vec3f(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS + CLOUD_START);
    let foginess = object.foginess;
    let darknessModifier = mix( 1.0, 0.2, clamp(pow(object.cloudiness, 6.0), 0.0, 1.0) );

    let fogPhase = mix(0.4, 0.2, foginess * object.cloudiness) * HenyeyGreenstein(mu, mix( 0.8, 0.7, foginess * object.cloudiness ) ); // + 0.5 * HenyeyGreenstein(mu, -0.6);

    var fogColor = mix(FOG_COLOR_NIGHT, FOG_COLOR_EVENING, smoothstep(-0.2, 0.2, sunDotUp));
    fogColor = mix(fogColor, FOG_COLOR_DAY, smoothstep(0.2, 0.8, sunDotUp));

    let stormFactor = saturate( (object.cloudiness - 0.8) / 0.2 );
    fogColor = mix( fogColor, FOG_COLOR_STORM, stormFactor );

    let fogDensity = mix( 0.00002, 0.0008, foginess );

    // Reduce the fog color as the sun goes into the evening
    fogColor = fogColor * mix( 0.5, 1.0, sunDotUp );

    return mix( fogPhase * 0.1 * LOW_SCATTER * SUN_POWER * mix(1.0, 0.3, smoothstep( 0.8, 1.0, object.cloudiness )) + 10.0 * fogColor * darknessModifier, originalColor.xyz, exp(-fogDensity * fogDistance ));
}

fn getAtmosphereColor(sun_direction: vec3f, dir: vec3f, mu: f32, nightColor: vec3f ) -> vec3f {
    let up = dot(sun_direction, vec3f(0.0, 1.0, 0.0));
    let portionOfNightSky = pow(0.5 + 0.5 * up, 0.8);
    let portionOfDaySky = pow(0.5 + 0.5 * mu, 15.0);
    let dayNightSkyRatio = clamp(portionOfNightSky + portionOfDaySky, 0.0, 1.0);


    let skyPinkFactor = smoothstep( -0.3, 0.5, sunDotUp );
    let darkerBlue = vec3f(0.2, 0.52, 1.0);
    let lighterBlue = vec3f(0.8, 0.95, 1.0);

    let redyPink = vec3f( 0.95, 0.3, 0.2 );
    let deepOrange = vec3f( 1.0, 0.5, 0.2 );

    var dayTimeColor = 
        // mix between the colors of the sky at different times of day
        6.0 * mix( mix( redyPink, darkerBlue, skyPinkFactor ), mix( deepOrange, lighterBlue, skyPinkFactor ), portionOfDaySky ) + 
        
        // a white haze at the horizon that fades out with altitude
        mix(vec3f(3.5), vec3f(0.0), min(1.0, 2.3 * dir.y));

    // Calculate the background color based on the direction of the ray
    var background = mix( nightColor, dayTimeColor, dayNightSkyRatio );

    // Draw the sun disk
    background += vec3f(1e4 * smoothstep(0.9998, 1.0, mu));

    return background;
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