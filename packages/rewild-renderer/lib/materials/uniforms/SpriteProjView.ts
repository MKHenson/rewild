import { Renderer } from '../..';
import { IPerMeshUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Transform } from '../../core/Transform';
import type { Sprite3D } from '../../core/Sprite3D';

export class SpriteProjView implements IPerMeshUniformBuffer {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  // Layout: projMatrix(64) + viewPosition(12) + rotationAngle(4) + scale(8) + selected(4) + pad(4) = 96 bytes
  private _valuesArray: Float32Array;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this._valuesArray = new Float32Array(24); // 96 bytes / 4 = 24 floats
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    const uniformBufferSize = 96;
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'sprite per-mesh bind group',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.buffer },
        },
      ],
    });
  }

  prepare(renderer: Renderer, camera: Camera, transform: Transform): void {
    const { device } = renderer;
    const projElements = camera.projectionMatrix.elements;
    const mvElements = transform.modelViewMatrix.elements;
    const values = this._valuesArray;

    const sprite = transform.component as Sprite3D | null;
    const alwaysOnScreen = sprite ? sprite.alwaysOnScreen : false;
    const rotationOffset = sprite ? sprite.rotationOffset : 0;

    // Extract view-space position from modelViewMatrix (translation column)
    let viewX = mvElements[12];
    let viewY = mvElements[13];
    let viewZ = mvElements[14];

    let scaleX = transform.scale.x;
    let scaleY = transform.scale.y;

    // clipW = -viewZ for perspective projection
    const clipW = -viewZ;

    if (alwaysOnScreen) {
      // Project to NDC to check if offscreen
      const clipX =
        projElements[0] * viewX +
        projElements[4] * viewY +
        projElements[8] * viewZ +
        projElements[12];
      const clipY =
        projElements[1] * viewX +
        projElements[5] * viewY +
        projElements[9] * viewZ +
        projElements[13];

      let ndcX: number;
      let ndcY: number;

      if (clipW > 0) {
        ndcX = clipX / clipW;
        ndcY = clipY / clipW;
      } else {
        // Behind camera: compute mirrored direction
        const fakeW = Math.abs(clipW) || 1;
        ndcX = -(clipX / fakeW);
        ndcY = -(clipY / fakeW);
        // Push far enough to trigger edge clamping
        const len = Math.sqrt(ndcX * ndcX + ndcY * ndcY) || 1;
        ndcX = (ndcX / len) * 2;
        ndcY = (ndcY / len) * 2;
      }

      const isOffscreen =
        clipW <= 0 || Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1;

      if (isOffscreen) {
        // Compute the perspective-correct scale from the original depth
        // so the clamped icon approximates the sprite's apparent world size
        const originalClipW = clipW > 0 ? clipW : Math.abs(viewZ) || 1;

        // Place clamped sprite at a fixed near depth
        const fixedZ = -2.0;
        const fixedClipW = -fixedZ;

        // Ratio preserves apparent size: objects closer look bigger
        const depthRatio = fixedClipW / originalClipW;

        // Account for the sprite quad's half-size in NDC so it doesn't overflow
        // Quad vertices are in [-0.5, 0.5], so half-extent = scale * 0.5
        const halfQuadNdcX =
          (scaleX * 0.5 * depthRatio * Math.abs(projElements[0])) / fixedClipW;
        const halfQuadNdcY =
          (scaleY * 0.5 * depthRatio * Math.abs(projElements[5])) / fixedClipW;

        // Margin = 1.0 minus enough space for the quad to sit flush at the edge
        const marginX = Math.max(0.5, 1.0 - halfQuadNdcX - 0.01);
        const marginY = Math.max(0.5, 1.0 - halfQuadNdcY - 0.01);

        const len = Math.sqrt(ndcX * ndcX + ndcY * ndcY) || 1;
        const dirX = ndcX / len;
        const dirY = ndcY / len;

        // Scale direction to reach the margin box edge
        const scaleToEdge = Math.min(
          marginX / (Math.abs(dirX) || 0.001),
          marginY / (Math.abs(dirY) || 0.001)
        );

        const clampedX = dirX * scaleToEdge;
        const clampedY = dirY * scaleToEdge;

        // Convert clamped NDC back to view space at the fixed depth
        viewX = (clampedX * -fixedZ) / projElements[0];
        viewY = (clampedY * -fixedZ) / projElements[5];
        viewZ = fixedZ;

        // Scale to preserve apparent world size at the new depth
        scaleX *= depthRatio;
        scaleY *= depthRatio;
      }
    } else if (clipW <= 0) {
      // Behind camera and not always-on-screen: hide by zeroing scale
      scaleX = 0;
      scaleY = 0;
    }

    // Write projection matrix (16 floats at offset 0)
    for (let i = 0; i < 16; i++) {
      values[i] = projElements[i];
    }

    // viewPosition (3 floats at offset 16)
    values[16] = viewX;
    values[17] = viewY;
    values[18] = viewZ;

    // rotationAngle (1 float at offset 19)
    values[19] = rotationOffset;

    // scale (2 floats at offset 20)
    values[20] = scaleX;
    values[21] = scaleY;

    // selected (1 float at offset 22)
    values[22] = transform.selected ? 1.0 : 0.0;

    // padding (1 float at offset 23) = 0
    values[23] = 0;

    device.queue.writeBuffer(
      this.buffer,
      0,
      values.buffer,
      values.byteOffset,
      values.byteLength
    );
  }
}
