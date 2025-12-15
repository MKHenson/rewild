import { IRenderable } from '../../types/interfaces';
import { UIElement } from '../core/UIElement';
import { Geometry } from '../geometry/Geometry';
import { GUIGeometryFactory } from '../geometry/GUIGeometryFactory';
import { UIElementHealthPass } from '../materials/UIElementHealthPass';
import { Renderer } from '../Renderer';
import guiShader from '../shaders/gui.wgsl';

export class GuiRenderer implements IRenderable {
  bindGroup: GPUBindGroup;

  instanceBuffer: GPUBuffer;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  resolutionValue: Float32Array;
  prevNumElements: i32;

  geometry: Geometry;

  dispose(): void {
    this.geometry.dispose();
  }

  async initialize(renderer: Renderer) {
    const { device, presentationFormat, canvas } = renderer;
    this.prevNumElements = 0;

    this.geometry = GUIGeometryFactory.new();
    this.geometry.build(renderer.device);
    const uiMaterial = renderer.materialManager.get('ui-material');
    const uiHealthMaterial = renderer.materialManager.get(
      'ui-health-material'
    ) as UIElementHealthPass;

    canvas.addEventListener('click', (e) => {
      if (!e.altKey) {
        uiHealthMaterial.healthUniforms.health += 0.1;
        return;
      }
      uiHealthMaterial.healthUniforms.health -= 0.1;

      const newElement = new UIElement(this.geometry, uiMaterial);
      renderer.ui.addChild(newElement.transform);
      newElement.x = Math.random() * 800;
      newElement.y = Math.random() * 800;
      newElement.width = Math.random() * 500;
      newElement.height = Math.random() * 300;
    });

    const elmA = new UIElement(this.geometry, uiMaterial);
    const healthBar = new UIElement(this.geometry, uiHealthMaterial);
    renderer.ui.addChild(elmA.transform);
    renderer.ui.addChild(healthBar.transform);

    elmA.x = 0;
    elmA.y = 0;
    elmA.width = 100;
    elmA.height = 100;

    healthBar.width = 250;
    healthBar.height = 40;
    healthBar.x = renderer.canvas.width / 2 - healthBar.width / 2;
    healthBar.y = renderer.canvas.height - healthBar.height - 30;

    const module = device.createShaderModule({
      code: guiShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'gui pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 2 * 4, // (2) floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [
              {
                // uv
                shaderLocation: 1,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
          {
            arrayStride: 4 * 4, // (4) floats, 4 bytes each
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x2' }, // offset
              { shaderLocation: 3, offset: 8, format: 'float32x2' }, // size
            ],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      multisample: {
        count: renderer.sampleCount,
      },
    });

    // resolution size of the canvas stored as a vec2
    const uniformBufferSize = 2 * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformValues = new Float32Array(uniformBufferSize / 4);
    this.resolutionValue = this.uniformValues.subarray(0, 2);

    this.bindGroup = device.createBindGroup({
      label: 'bind group for object',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    // Now create the buffers for the element data
    const elementData = new Float32Array(renderer.ui.children.length * 4);
    for (let i = 0; i < renderer.ui.children.length; i++) {
      const element = renderer.ui.children[i].component as UIElement;
      elementData.set(
        [element.x, element.y, element.width, element.height],
        i * 4
      );
    }

    this.instanceBuffer = device.createBuffer({
      label: 'element buffer',
      size: elementData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.instanceBuffer, 0, elementData);

    return this;
  }

  update(): void {}

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    const { device, canvas } = renderer;
    const geometry = this.geometry;

    if (renderer.ui.children.length !== this.prevNumElements) {
      const elementData = new Float32Array(renderer.ui.children.length * 4);
      for (let i = 0; i < renderer.ui.children.length; i++) {
        const element = renderer.ui.children[i].component as UIElement;
        elementData.set(
          [element.x, element.y, element.width, element.height],
          i * 4
        );
      }
      this.instanceBuffer.destroy();
      this.instanceBuffer = device.createBuffer({
        label: 'element buffer',
        size: elementData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      device.queue.writeBuffer(this.instanceBuffer, 0, elementData);
      this.prevNumElements = renderer.ui.children.length;
    }

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setVertexBuffer(2, this.instanceBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

    // Set the uniform values in our JavaScript side Float32Array
    this.resolutionValue.set([canvas.width, canvas.height]);

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformValues as BufferSource
    );

    pass.setBindGroup(0, this.bindGroup);
    pass.drawIndexed(
      geometry.indices?.length || 0,
      renderer.ui.children.length
    );
  }
}
