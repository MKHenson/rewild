  // directionalLight: contribution from the sun only (affected by geometry shadows).
  // otherLight: point lights and non-shadow-casting spot lights.
  // shadowCastingSpotContrib: the one shadow-casting spot light (multiplied by spotShadowFactor later).
  var directionalLight = vec3f(0.0, 0.0, 0.0);
  var otherLight = vec3f(0.0, 0.0, 0.0);
  var shadowCastingSpotContrib = vec3f(0.0, 0.0, 0.0);

  for (var i: u32 = 0; i < lighting.numLights; i++) {
      let light = lighting.lights[i];
      var diffuse = 0.0;
      var attenuation = 1.0;

      if (light.lightType == 1.0) {
        // Directional
        diffuse = max(dot(normalizedNormal, -light.positionOrDirection), 0.0);
        directionalLight += diffuse * light.intensity * light.color;
      } else if (light.lightType == 0.0) {
        // Point
        let lightVec = light.positionOrDirection - viewPosition;
        let dist = length(lightVec);
        if (dist < light.range) {
          let lightDir = normalize(lightVec);
          diffuse = max(dot(normalizedNormal, lightDir), 0.0);
          attenuation = max(0.0, 1.0 - dist / light.range);
        } else {
          attenuation = 0.0;
        }
        otherLight += diffuse * light.intensity * light.color * attenuation;
      } else {
        // Spot
        let lightVec = light.positionOrDirection - viewPosition;
        let dist = length(lightVec);
        if (dist < light.range) {
          let lightDir = normalize(lightVec);
          diffuse = max(dot(normalizedNormal, lightDir), 0.0);
          let distAttenuation = max(0.0, 1.0 - dist / light.range);
          let angle = acos(clamp(dot(-lightDir, light.direction), 0.0, 1.0));
          let coneAttenuation = 1.0 - smoothstep(light.innerAngle, light.outerAngle, angle);
          attenuation = distAttenuation * coneAttenuation;
        } else {
          attenuation = 0.0;
        }
        let _contrib = diffuse * light.intensity * light.color * attenuation;
        if (spotLightShadowParams.hasSpotShadow != 0u && i == spotLightShadowParams.lightIndex) {
          shadowCastingSpotContrib += _contrib;
        } else {
          otherLight += _contrib;
        }
      }
  }

  var totalLight = directionalLight + otherLight;