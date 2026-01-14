struct UISharedUniforms {
  resolution: vec2f,
  totalTime: f32,
};

struct UIInstanceData {
  offset: vec2f,
  size: vec2f,
  backgroundColor: vec4f,
  borderColor: vec4f,
  borderRadius: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};
 
struct Vertex {
  @location(0) position: vec2f,
  @location(1) uv: vec2f,
  @builtin(instance_index) instanceIndex: u32,
};
 


fn createVSOutput(vert: Vertex, global: UISharedUniforms, instanceData: UIInstanceData) -> VSOutput {
  var vsOut: VSOutput;
  
  let position = (vert.position * instanceData.size) + instanceData.offset;
 
  // convert the position from pixels to a 0.0 to 1.0 value
  let zeroToOne = position / global.resolution;
 
  // convert from 0 <-> 1 to 0 <-> 2
  let zeroToTwo = zeroToOne * 2.0;
 
  // covert from 0 <-> 2 to -1 <-> +1 (clip space)
  let flippedClipSpace = zeroToTwo - 1.0;
 
  // flip Y
  let clipSpace = flippedClipSpace * vec2f(1, -1);
 
  vsOut.position = vec4f(clipSpace, 0.0, 1.0);
  vsOut.localPos = vert.position * instanceData.size;
  vsOut.size = instanceData.size;
  vsOut.uv = vert.uv;
  vsOut.color = instanceData.backgroundColor;
  vsOut.borderColor = instanceData.borderColor;
  vsOut.borderRadius = instanceData.borderRadius;
  return vsOut;
}

fn sdRoundedBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn getDistanceFromRoundedBox(vsOut: VSOutput, radius: f32) -> f32 {
  let halfSize = vsOut.size / 2.0;
  let centerPos = vsOut.localPos - halfSize;
  return sdRoundedBox(centerPos, halfSize, radius);
}

fn isOutsideBorderRadius(vsOut: VSOutput, radius: f32) -> bool {
  let halfSize = radius;
  let localPos = vsOut.localPos;
  let width = vsOut.size.x;
  let height = vsOut.size.y;
  let x = localPos.x;
  let y = localPos.y;

  // Check if the fragment is outside the curved corner radius
  if ((x < halfSize && y < halfSize && distance(localPos, vec2f(halfSize, halfSize)) > halfSize) ||
      (x > (width - halfSize) && y < halfSize && distance(localPos, vec2f(width - halfSize, halfSize)) > halfSize) ||
      (x < halfSize && y > (height - halfSize) && distance(localPos, vec2f(halfSize, height - halfSize)) > halfSize) ||
      (x > (width - halfSize) && y > (height - halfSize) && distance(localPos, vec2f(width - halfSize, height - halfSize)) > halfSize)) {
    return true;
  }

  return false;
}

fn drawBorder(vsOut: VSOutput, originCol: vec4f, borderColor: vec4f, radius: f32, borderSize: f32) -> vec4f {
  let halfSize = radius;
  let halfSizeInner = radius - borderSize;
  let localPos = vsOut.localPos;
  let width = vsOut.size.x;
  let height = vsOut.size.y;
  let x = localPos.x;
  let y = localPos.y;

  // Top left corner
  if (x < halfSize && y < halfSize && distance(localPos, vec2f(halfSize, halfSize)) < halfSize && distance(localPos, vec2f(halfSizeInner + borderSize, halfSizeInner + borderSize)) > halfSizeInner) {
    return borderColor;
  } 
  // Top right corner
  else if (x > (width - halfSize) && y < halfSize && distance(localPos, vec2f(width - halfSize, halfSize)) < halfSize && distance(localPos, vec2f(width - halfSizeInner - borderSize, halfSizeInner + borderSize)) > halfSizeInner) {
    return borderColor;
  } 
  // Bottom left corner
  else if (x < halfSize && y > (height - halfSize) && distance(localPos, vec2f(halfSize, height - halfSize)) < halfSize && distance(localPos, vec2f(halfSizeInner + borderSize, height - halfSizeInner - borderSize)) > halfSizeInner) {
    return borderColor;
  }
  // Bottom right corner
  else if (x > (width - halfSize) && y > (height - halfSize) && distance(localPos, vec2f(width - halfSize, height - halfSize)) < halfSize && distance(localPos, vec2f(width - halfSizeInner - borderSize, height - halfSizeInner - borderSize)) > halfSizeInner) {
    return borderColor;
  }
  // Left edge
  else if (x < borderSize) {
    return borderColor;
  }
  // Right edge
  else if (x > (width - borderSize)) {
    return borderColor;
  }
  // Top edge
  else if (x > halfSize && x < (width - halfSize) && y > 0 && y < borderSize) {
    return borderColor;
  }
  // Bottom edge
  else if (x > halfSize && x < (width - halfSize) && y > (height - borderSize) && y < height) {
    return borderColor;
  }
  else {
    return originCol;
  }
}