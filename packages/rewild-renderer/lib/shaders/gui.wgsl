struct Uniforms {
  resolution: vec2f,
};
 
struct Vertex {
  @location(0) position: vec2f,
  @location(1) offset: vec2f,
  @location(2) size: vec2f,
};
 
struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec2f,
  @location(1) size: vec2f
};
 
@group(0) @binding(0) var<uniform> uni: Uniforms;
 
@vertex fn vs(vert: Vertex) -> VSOutput {
  var vsOut: VSOutput;
  
  let position = (vert.position * vert.size) + vert.offset;
 
  // convert the position from pixels to a 0.0 to 1.0 value
  let zeroToOne = position / uni.resolution;
 
  // convert from 0 <-> 1 to 0 <-> 2
  let zeroToTwo = zeroToOne * 2.0;
 
  // covert from 0 <-> 2 to -1 <-> +1 (clip space)
  let flippedClipSpace = zeroToTwo - 1.0;
 
  // flip Y
  let clipSpace = flippedClipSpace * vec2f(1, -1);
 
  vsOut.position = vec4f(clipSpace, 0.0, 1.0);
  vsOut.localPos = vert.position * vert.size;
  vsOut.size = vert.size;
  return vsOut;
}
 
@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
  let halfSize = 5.0f;
  let localPos = vsOut.localPos;

  // Check if the fragment is outside the curved corner radius
  if ((localPos.x < halfSize && localPos.y < halfSize && distance(localPos, vec2f(halfSize, halfSize)) > halfSize) ||
      (localPos.x > (vsOut.size.x - halfSize) && localPos.y < halfSize && distance(localPos, vec2f(vsOut.size.x - halfSize, halfSize)) > halfSize) ||
      (localPos.x < halfSize && localPos.y > (vsOut.size.y - halfSize) && distance(localPos, vec2f(halfSize, vsOut.size.y - halfSize)) > halfSize) ||
      (localPos.x > (vsOut.size.x - halfSize) && localPos.y > (vsOut.size.y - halfSize) && distance(localPos, vec2f(vsOut.size.x - halfSize, vsOut.size.y - halfSize)) > halfSize)) {
    discard;
  }

  return vec4f(1.0, 0.0, 0.0, 0.6f);
}