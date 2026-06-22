  // Outputs: directionalLight, directionalSpecular, otherLight, otherSpecular,
  //          shadowCastingSpotContrib, shadowCastingSpotSpecular
  // Requires in scope: normalizedNormal, viewPosition, lighting, spotLightShadowParams,
  //                    phongParams.specularColor, phongParams.shininess
  var directionalLight = vec3f(0.0, 0.0, 0.0);
  var directionalSpecular = vec3f(0.0, 0.0, 0.0);
  var otherLight = vec3f(0.0, 0.0, 0.0);
  var otherSpecular = vec3f(0.0, 0.0, 0.0);
  var shadowCastingSpotContrib = vec3f(0.0, 0.0, 0.0);
  var shadowCastingSpotSpecular = vec3f(0.0, 0.0, 0.0);

  let viewDir = -normalize(viewPosition);
  // Energy-conserving Blinn-Phong normalization: keeps total reflected power
  // constant as shininess changes — broader lobes are proportionally dimmer.
  let specNorm = (phongParams.shininess + 8.0) / (8.0 * 3.14159265);

  for (var i: u32 = 0; i < lighting.numLights; i++) {
    let light = lighting.lights[i];
    var diffuse = 0.0;
    var specular = 0.0;
    var attenuation = 1.0;

    if (light.lightType == 1.0) {
      // Directional
      let L = -light.positionOrDirection;
      diffuse = max(dot(normalizedNormal, L), 0.0);
      if (diffuse > 0.0) {
        let H = normalize(L + viewDir);
        specular = specNorm * pow(max(dot(normalizedNormal, H), 0.0), phongParams.shininess);
      }
      directionalLight += diffuse * light.intensity * light.color;
      directionalSpecular += specular * light.intensity * phongParams.specularColor;
    } else if (light.lightType == 0.0) {
      // Point
      let lightVec = light.positionOrDirection - viewPosition;
      let dist = length(lightVec);
      if (dist < light.range) {
        let L = normalize(lightVec);
        diffuse = max(dot(normalizedNormal, L), 0.0);
        if (diffuse > 0.0) {
          let H = normalize(L + viewDir);
          specular = specNorm * pow(max(dot(normalizedNormal, H), 0.0), phongParams.shininess);
        }
        attenuation = max(0.0, 1.0 - dist / light.range);
      } else {
        attenuation = 0.0;
      }
      otherLight += diffuse * light.intensity * light.color * attenuation;
      otherSpecular += specular * light.intensity * phongParams.specularColor * attenuation;
    } else {
      // Spot
      let lightVec = light.positionOrDirection - viewPosition;
      let dist = length(lightVec);
      if (dist < light.range) {
        let L = normalize(lightVec);
        diffuse = max(dot(normalizedNormal, L), 0.0);
        if (diffuse > 0.0) {
          let H = normalize(L + viewDir);
          specular = specNorm * pow(max(dot(normalizedNormal, H), 0.0), phongParams.shininess);
        }
        let distAttenuation = max(0.0, 1.0 - dist / light.range);
        let angle = acos(clamp(dot(-L, light.direction), 0.0, 1.0));
        let coneAttenuation = 1.0 - smoothstep(light.innerAngle, light.outerAngle, angle);
        attenuation = distAttenuation * coneAttenuation;
      } else {
        attenuation = 0.0;
      }
      let diffContrib = diffuse * light.intensity * light.color * attenuation;
      let specContrib = specular * light.intensity * phongParams.specularColor * attenuation;
      if (spotLightShadowParams.hasSpotShadow != 0u && i == spotLightShadowParams.lightIndex) {
        shadowCastingSpotContrib += diffContrib;
        shadowCastingSpotSpecular += specContrib;
      } else {
        otherLight += diffContrib;
        otherSpecular += specContrib;
      }
    }
  }
