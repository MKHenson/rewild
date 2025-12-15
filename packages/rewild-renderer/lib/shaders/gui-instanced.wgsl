
#include "./shader-lib/ui-element.wgsl"

@group(0) @binding(0) var<uniform> uni: UISharedUniforms;
@group(1) @binding(0) var<storage, read> uiInstanceData: array<UIInstanceData>;
 
@vertex fn vs(vert: Vertex) -> VSOutput {
  let vsOut = createVSOutput(vert, uni, uiInstanceData[vert.instanceIndex]);
  return vsOut;
}
 
@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
  let radius = 0.0;
  let borderSize = 1.0;
  let softness = 1.0;

  let dist = getDistanceFromRoundedBox(vsOut, radius);

  let alpha = 1.0 - smoothstep(0.0, softness, dist);
  let borderMix = smoothstep(-borderSize - softness, -borderSize + softness, dist);

  let originalColor = vsOut.color;
  
  let borderColor = vec4f(1.0, 0.0, 0.0, 1.0);

  let mixedColor = mix(originalColor, borderColor, borderMix);

  if (alpha <= 0.0) {
    discard;
  }

  return vec4f(mixedColor.rgb, mixedColor.a * alpha);
}