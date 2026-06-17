  // Project view-space fragment position into shadow map UV + depth.
  // lightMVPFromView = lightVP * camera.matrixWorld, baked each frame.
  let _lightSpacePos = directionalShadowParams.lightMVPFromView * vec4f(viewPosition, 1.0);
  let _projCoords = _lightSpacePos.xyz / _lightSpacePos.w;
  // NDC → UV: X maps [−1,+1]→[0,1], Y is flipped ([+1,−1]→[0,1])
  let _shadowUV = vec2f(_projCoords.x * 0.5 + 0.5, -_projCoords.y * 0.5 + 0.5);
  let _shadowDepth = _projCoords.z; // already [0,1] from our WebGPU-correct ortho matrix
  let _bias = 0.0005;

  // Unrolled 3×3 PCF — all 9 taps are in uniform control flow.
  // The depth-comparison sampler uses linear filtering so each tap is hardware-bilinear PCF.
  let _ts = 1.0 / 2048.0;
  var _shadowSum = 0.0;
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f(-_ts, -_ts), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f( 0.0, -_ts), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f( _ts, -_ts), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f(-_ts,  0.0), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV,                    _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f( _ts,  0.0), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f(-_ts,  _ts), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f( 0.0,  _ts), _shadowDepth - _bias);
  _shadowSum += textureSampleCompare(directionalShadowMap, directionalShadowSampler, _shadowUV + vec2f( _ts,  _ts), _shadowDepth - _bias);
  let _shadowSample = _shadowSum / 9.0;

  // Apply shadow only when the fragment is inside the shadow map coverage.
  let _inShadowBounds = (_shadowUV.x > 0.001 && _shadowUV.x < 0.999 &&
                         _shadowUV.y > 0.001 && _shadowUV.y < 0.999 &&
                         _shadowDepth > 0.0 && _shadowDepth < 1.0);
  var directionalShadowFactor = select(1.0, _shadowSample, _inShadowBounds);
