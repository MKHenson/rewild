// PCF soft-shadow helper — shared by directional and spot-light shadow sampling.
// Increase PCF_SPREAD to soften edges (1.0 = one shadow-atlas texel per tap step).
const PCF_SPREAD: f32 = 1.0;
const PCF_ATLAS_SIZE: f32 = 2048.0;

fn pcfSample3x3(
  shadowMap: texture_depth_2d,
  shadowSampler: sampler_comparison,
  uv: vec2f,
  depth: f32
) -> f32 {
  let _ts = PCF_SPREAD / PCF_ATLAS_SIZE;
  var _sum = 0.0;
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f(-_ts, -_ts), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f( 0.0, -_ts), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f( _ts, -_ts), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f(-_ts,  0.0), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv,                     depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f( _ts,  0.0), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f(-_ts,  _ts), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f( 0.0,  _ts), depth);
  _sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f( _ts,  _ts), depth);
  return _sum / 9.0;
}
