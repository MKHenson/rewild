
#include "./shader-lib/ui-element.wgsl"

@group(0) @binding(0) var<uniform> uni: UISharedUniforms;
@group(1) @binding(0) var<storage, read> transforms: array<UIInstanceData>;
 
@vertex fn vs(vert: Vertex) -> VSOutput {
  let vsOut = createVSOutput(vert, uni, transforms[vert.instanceIndex]);
  return vsOut;
}
 
@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
  if (isOutsideBorderRadius(vsOut, 10.0)) {
    discard;
  }

  let originalColor = vec4f(1.0, vsOut.uv.x, vsOut.uv.y, 0.6f);
  let borderColor = vec4f(1.0, 0.0, 0.0, 1.0);
  let finalColor = drawBorder(vsOut, originalColor, borderColor, 10.0, 5.0);
  return finalColor;
}