
#include "./shader-lib/ui-element.wgsl"

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f,
  @location(2) uv: vec2f,
  @location(3) color: vec4f,
  @location(4) borderColor: vec4f,
  @location(5) borderRadius: f32,
  @location(6) texcoord : vec2f,
};

struct MeterData {
  fullColor: vec4f,
  emptyColor: vec4f,
  value: f32,
}

@group(0) @binding(0) var<uniform> uni: UISharedUniforms;
@group(1) @binding(0) var<storage, read> transforms: array<UIInstanceData>;
@group(2) @binding(0) var<uniform> meter: MeterData;
 
@vertex fn vs(vert: Vertex) -> VSOutput {
  let vsOut = createVSOutput(vert, uni, transforms[vert.instanceIndex]);
  return vsOut;
}

fn sin_01(x: f32) -> f32 {
  return (sin(x) + 1.0) /  2.0;
}
 
@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
  let borderRadius = vsOut.borderRadius;
  let borderSize = 1.0;
  let softness = 0.5;

  let dist = getDistanceFromRoundedBox(vsOut, borderRadius);
  let alpha = 1.0 - smoothstep(0.0, softness, dist);
  let borderMix = smoothstep(-borderSize - softness, -borderSize + softness, dist);

  let flashingOpacity = mix( mix(0.5, 0.9, sin_01(uni.totalTime / 50.0f)), 1.0, meter.value );

  let shade = mix(0.6, 1.0, vsOut.uv.y);
  let fillColor = mix( meter.emptyColor, meter.fullColor, meter.value );
  let shadedFill = vec4f(fillColor.rgb * shade, fillColor.a);
  let backgroundColor = vec4f(meter.emptyColor.rgb * mix(0.2, 0.5, vsOut.uv.y), 0.9 );

  let isFilled = vsOut.localPos.x < (vsOut.size.x * meter.value);
  let mixedFillAndBg = select( backgroundColor, shadedFill, isFilled );

  let borderColor = vsOut.borderColor;
  let finalColor = mix(mixedFillAndBg, borderColor, borderMix);

  if (alpha <= 0.0) {
    discard;
  }

  return vec4f( finalColor.xyz, flashingOpacity * alpha );
}