  // Outputs: directionalLight, directionalSpecular, otherLight, otherSpecular,
  //          shadowCastingSpotContrib, shadowCastingSpotSpecular
  // Requires in scope: normalizedNormal, viewPosition, lighting, spotLightShadowParams,
  //                    phongParams.specularColor, and `shadingShininess: f32` —
  //                    the Blinn-Phong exponent, declared by the including
  //                    shader (a uniform for uniform-material passes; terrain
  //                    blends it per-fragment from its material layers).
  var directionalLight = vec3f(0.0, 0.0, 0.0);
  var directionalSpecular = vec3f(0.0, 0.0, 0.0);
  var otherLight = vec3f(0.0, 0.0, 0.0);
  var otherSpecular = vec3f(0.0, 0.0, 0.0);
  var shadowCastingSpotContrib = vec3f(0.0, 0.0, 0.0);
  var shadowCastingSpotSpecular = vec3f(0.0, 0.0, 0.0);

  let viewDir = -normalize(viewPosition);
  // Energy-conserving Blinn-Phong normalization: keeps total reflected power
  // constant as shininess changes — broader lobes are proportionally dimmer.
  let specNorm = (shadingShininess + 8.0) / (8.0 * 3.14159265);

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
        specular = specNorm * pow(max(dot(normalizedNormal, H), 0.0), shadingShininess);
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
          specular = specNorm * pow(max(dot(normalizedNormal, H), 0.0), shadingShininess);
        }
        attenuation = lightDistanceAttenuation(dist, light.range);
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
        // A camera-mounted flashlight sits low and grazes the ground it lights,
        // which makes the diffuse hypersensitive to normal-mapped micro-relief —
        // the cone brightening and dimming with heading as the (slightly
        // directional) bumps swing N·L. Half-Lambert wrap lifts the floor so the
        // cone reads as lit, and mixing back toward flat damps the heading swing
        // while keeping a little surface shape. The 0.4 is the knob: 0 ⇒ a
        // perfectly even cone, 1 ⇒ full (swingy) normal shading.
        let wrap = dot(normalizedNormal, L) * 0.5 + 0.5;
        diffuse = mix(1.0, wrap * wrap, 0.4);
        if (diffuse > 0.0) {
          let H = normalize(L + viewDir);
          specular = specNorm * pow(max(dot(normalizedNormal, H), 0.0), shadingShininess);
        }
        // Inverse-square, the same curve the point light above uses.
        //
        // This replaces a plateau — full strength through the first 40% of
        // range, then a smooth fade — that existed because a camera-mounted
        // flashlight brightened and dimmed dramatically as the beam swung
        // between a near up-slope and a far down-valley. Worth being clear that
        // inverse-square makes that swing *larger*, not smaller: across a 3m to
        // 10m throw on a 15m light it is about 17x, where the plateau held it
        // under 2x.
        //
        // The swing is kept anyway because it is what light actually does, and
        // because the pipeline now has somewhere better to absorb it — a single
        // whole-frame ACES curve with a camera exposure (#189/#192), which
        // compresses a hot near-field instead of flattening the falloff that
        // produced it. If a specific light still reads badly, the fix belongs
        // in that light's range and intensity, not in the shading model.
        let distAttenuation = lightDistanceAttenuation(dist, light.range);
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
