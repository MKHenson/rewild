  var totalLight = vec3f(0.0, 0.0, 0.0);

  for (var i: u32 = 0; i < lighting.numLights; i++) {
      let light = lighting.lights[i];
      var diffuse = 0.0;
      var attenuation = 1.0;

      if (light.range < 0.0) {
        diffuse = max(dot(normalizedNormal, -light.positionOrDirection), 0.0);
      } else {
        let lightVec = light.positionOrDirection - viewPosition;
        let distance = length(lightVec);
        if (distance < light.range) {
           let lightDir = normalize(lightVec);
           diffuse = max(dot(normalizedNormal, lightDir), 0.0);
           attenuation = max(0.0, 1.0 - distance / light.range);
        } else {
           attenuation = 0.0;
        }
      }

      totalLight += diffuse * light.intensity * light.color * attenuation;
  }