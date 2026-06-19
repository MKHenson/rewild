  // Spot light shadow — samples the bottom-right quadrant (0.5,0.5)→(1.0,1.0) of the shadow atlas.
  // Returns 1.0 (fully lit) when no shadow-casting spot light exists or fragment is outside the cone.
  var spotShadowFactor = 1.0;
  if (spotLightShadowParams.hasSpotShadow != 0u) {
    let _biasedPos = viewPosition + normalizedNormal * 0.3;
    let _lsp = spotLightShadowParams.lightMVPFromView * vec4f(_biasedPos, 1.0);
    let _pc = _lsp.xyz / _lsp.w;
    // NDC [-1,+1] → quadrant-local UV [0,1], Y flipped
    let _spotUV = vec2f(_pc.x * 0.5 + 0.5, -_pc.y * 0.5 + 0.5);
    // Map quadrant-local UV into atlas bottom-right quadrant: offset (0.5, 0.5)
    let _atlasUV = _spotUV * 0.5 + vec2f(0.5, 0.5);
    let _depth = _pc.z;
    let _inBounds = (_spotUV.x > 0.001 && _spotUV.x < 0.999 &&
                     _spotUV.y > 0.001 && _spotUV.y < 0.999 &&
                     _depth >= 0.0 && _depth <= 1.0);
    let _bias = 0.0002;
    spotShadowFactor = select(1.0, pcfSample3x3(shadowAtlas, shadowSampler, _atlasUV, _depth - _bias), _inBounds);
  }
