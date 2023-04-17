import { GPUBufferUsageFlags } from "rewild-common";
import { BufferArray } from "../renderer/geometry/Geometry";

export function createBufferFromF32(
  device: GPUDevice,
  data: Float32Array,
  usageFlag: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    // mappedAtCreation is true so we can interact with it via the CPU
    mappedAtCreation: true,
  });

  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

export function createBuffer(
  device: GPUDevice,
  data: BufferArray,
  usageFlag: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    // mappedAtCreation is true so we can interact with it via the CPU
    mappedAtCreation: true,
  });

  var dst = buffer.getMappedRange();
  new Uint8Array(dst).set(new Uint8Array(data));
  buffer.unmap();
  return buffer;
}

export function createIndexBufferU32(
  device: GPUDevice,
  data: Uint32Array,
  usageFlag: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    // mappedAtCreation is true so we can interact with it via the CPU
    mappedAtCreation: true,
  });
  new Uint32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}
