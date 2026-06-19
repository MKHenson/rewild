  // Select cascade by view-space depth (viewPosition.z is negative looking forward).
  let _viewDepth = -viewPosition.z;
  var _cascadeIdx = 2u;
  if (_viewDepth < directionalShadowParams.cascadeSplits.x) {
    _cascadeIdx = 0u;
  } else if (_viewDepth < directionalShadowParams.cascadeSplits.y) {
    _cascadeIdx = 1u;
  }

  // Atlas UV offsets: each cascade occupies a 1024×1024 quadrant in the 2048×2048 atlas.
  // Cascade 0 = top-left (0, 0), cascade 1 = top-right (0.5, 0), cascade 2 = bottom-left (0, 0.5).
  var _uvOffset = vec2f(0.0, 0.5); // default: cascade 2
  if (_cascadeIdx == 0u) {
    _uvOffset = vec2f(0.0, 0.0);
  } else if (_cascadeIdx == 1u) {
    _uvOffset = vec2f(0.5, 0.0);
  }

  // Normal-offset bias: push the receiver along its surface normal before projecting.
  // This eliminates slope-dependent self-shadowing (acne) without needing the light direction.
  // Each cascade's offset scales with its approximate world-space texel size so that
  // near cascades stay sharp while far cascades (with coarser texels) get enough clearance.
  let _cascadeNormalOffsets = array<f32, 3>(0.5, 0.8, 1.2);
  let _biasedViewPos = viewPosition + normalizedNormal * _cascadeNormalOffsets[_cascadeIdx];

  // Project view-space position into this cascade's light clip space.
  let _lightSpacePos = directionalShadowParams.lightMVPFromView[_cascadeIdx] * vec4f(_biasedViewPos, 1.0);
  let _projCoords = _lightSpacePos.xyz / _lightSpacePos.w;
  // NDC → cascade-local UV: X [−1,+1]→[0,1], Y flipped [+1,−1]→[0,1]
  let _cascadeUV = vec2f(_projCoords.x * 0.5 + 0.5, -_projCoords.y * 0.5 + 0.5);
  // Map cascade-local [0,1]×[0,1] into the atlas quadrant
  let _shadowUV = _cascadeUV * 0.5 + _uvOffset;
  let _shadowDepth = _projCoords.z; // already [0,1] from WebGPU-correct ortho matrix
  let _bias = 0.0002;
  let _shadowSample = pcfSample3x3(shadowAtlas, shadowSampler, _shadowUV, _shadowDepth - _bias);

  // Apply shadow only when the fragment falls within the cascade's local UV coverage.
  let _inShadowBounds = (_cascadeUV.x > 0.001 && _cascadeUV.x < 0.999 &&
                         _cascadeUV.y > 0.001 && _cascadeUV.y < 0.999 &&
                         _shadowDepth >= 0.0 && _shadowDepth <= 1.0);
  var directionalShadowFactor = select(1.0, _shadowSample, _inShadowBounds);
  // Fade shadows to zero as the sun approaches the horizon (cascadeSplits.w = sun dir Y).
  // Avoids broken shadow maps at grazing angles regardless of terrain height.
  // 0 at horizon, 1 at ~17° elevation (smoothstep 0→0.3).
  let _sunElevationFade = smoothstep(0.0, 0.3, directionalShadowParams.cascadeSplits.w);
  directionalShadowFactor = mix(1.0, directionalShadowFactor, _sunElevationFade);
  // Clamp shadow darkness — prevents pitch-black shadows where ambient light would exist.
  directionalShadowFactor = mix(0.25, 1.0, directionalShadowFactor);
