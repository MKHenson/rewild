  // Reconstruct world position from view-space position
  let worldPosition = (cloudShadowParams.invViewMatrix * vec4f(viewPosition, 1.0)).xyz;

  // Sample cloud shadow map
  var cloudShadowFactor = 1.0;
  {
    let shadowUV = vec2f(
      (worldPosition.x - cloudShadowParams.centerX) / cloudShadowParams.worldSize + 0.5,
      (worldPosition.z - cloudShadowParams.centerZ) / cloudShadowParams.worldSize + 0.5
    );

    // Only apply shadow inside the map coverage area
    if (shadowUV.x >= 0.0 && shadowUV.x <= 1.0 && shadowUV.y >= 0.0 && shadowUV.y <= 1.0) {
      // Fade out at edges
      let edgeFade = smoothstep(0.0, 0.05, shadowUV.x) * smoothstep(1.0, 0.95, shadowUV.x)
                   * smoothstep(0.0, 0.05, shadowUV.y) * smoothstep(1.0, 0.95, shadowUV.y);

      let shadowDensity = textureSampleLevel(cloudShadowMap, cloudShadowSampler, shadowUV, 0.0).r;
      cloudShadowFactor = 1.0 - (shadowDensity * cloudShadowParams.shadowIntensity * edgeFade);
      cloudShadowFactor = max(cloudShadowFactor, 0.3); // Never fully black
    }
  }
