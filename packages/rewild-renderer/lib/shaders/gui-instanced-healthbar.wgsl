
#include "./shader-lib/ui-element.wgsl"

struct HealthbarData {
  playerHealth: f32,
}

@group(0) @binding(0) var<uniform> uni: UISharedUniforms;
@group(1) @binding(0) var<storage, read> transforms: array<UIInstanceData>;
@group(2) @binding(0) var<uniform> healthData: HealthbarData;
 
@vertex fn vs(vert: Vertex) -> VSOutput {
  let vsOut = createVSOutput(vert, uni, transforms[vert.instanceIndex]);
  return vsOut;
}

fn sin_01(x: f32) -> f32 {
  return (sin(x) + 1.0) /  2.0;
}
 
@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
  let borderRadius = 10.0;
  let borderSize = 1.0;
  let softness = 1.0;

  let dist = getDistanceFromRoundedBox(vsOut, borderRadius);
  let alpha = 1.0 - smoothstep(0.0, softness, dist);
  let borderMix = smoothstep(-borderSize - softness, -borderSize + softness, dist);

  let healthFlashingOpacity = mix( mix(0.5, 0.9, sin_01(uni.totalTime / 50.0f)), 1.0, healthData.playerHealth );

  let healthyColor = vec4f(mix(0.0, 0.5, vsOut.uv.x), mix(0.5, 1.0, vsOut.uv.y), mix(0.0, 0.3, 1.0 - vsOut.uv.x), 0.9 );
  let unHealthyColor = vec4f(mix(0.5, 1.0, vsOut.uv.y), 0.0, 0.0, 0.9 );

  let originalColor = mix( unHealthyColor, healthyColor, healthData.playerHealth );
  let backgroundColor = vec4f(mix(0.2, 0.5, vsOut.uv.y), 0.0, 0.0, 0.9 );

  let localX = vsOut.localPos.x;
  let width = vsOut.size.x;
  let isHealth = localX < (width * healthData.playerHealth);

  let mixedHealthAndBg = select( backgroundColor, originalColor, isHealth );

  let borderColor = vec4f(0.3, 0.3, 0.3, 0.9);
  let finalColor = mix(mixedHealthAndBg, borderColor, borderMix);

  if (alpha <= 0.0) {
    discard;
  }

  return vec4f( finalColor.xyz, healthFlashingOpacity * alpha );
}