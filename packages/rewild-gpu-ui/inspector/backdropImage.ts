const IMAGE_WIDTH = 960;
const IMAGE_HEIGHT = 640;

let image: HTMLCanvasElement | null = null;
let imageUrl = '';

/**
 * A test image for glass: bands of colour, sharp shapes and text, so the
 * blur and the saturation show. It is drawn once, and the Mica side and the
 * DOM side use the same pixels.
 */
export function testImage(): { canvas: HTMLCanvasElement; url: string } {
  if (!image) {
    image = document.createElement('canvas');
    image.width = IMAGE_WIDTH;
    image.height = IMAGE_HEIGHT;
    const g = image.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, IMAGE_HEIGHT);
    sky.addColorStop(0, '#1b3b6f');
    sky.addColorStop(0.55, '#e0835a');
    sky.addColorStop(1, '#2a1a3a');
    g.fillStyle = sky;
    g.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
    const colours = ['#f2c14e', '#4ea5d9', '#e4572e', '#76b041', '#f7f7f2'];
    for (let i = 0; i < 24; i++) {
      g.fillStyle = colours[i % colours.length];
      g.fillRect(i * 40, IMAGE_HEIGHT - 120 - (i % 5) * 30, 20, 400);
    }
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.fillStyle = colours[(i + 2) % colours.length];
      g.arc(80 + i * 105, 150 + (i % 3) * 70, 34 + (i % 4) * 8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.font = 'bold 120px Roboto, sans-serif';
    g.fillText('Mica', 330, 380);
    imageUrl = image.toDataURL('image/png');
  }
  return { canvas: image, url: imageUrl };
}

const SHADER = /* wgsl */ `
struct Params {
  canvas: vec2f,
  image: vec2f,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var picture: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// Places the image as CSS's background-size: cover, centred.
@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let scale = max(params.canvas.x / params.image.x, params.canvas.y / params.image.y);
  let offset = (params.canvas - params.image * scale) * 0.5;
  let uv = (position.xy - offset) / (params.image * scale);
  return vec4f(textureSampleLevel(picture, linearSampler, uv, 0.0).rgb, 1.0);
}
`;

/**
 * Draws the test image under the Mica side, and gives the UI a copy of it
 * as its backdrop, as the game gives its scene.
 */
export class BackdropImage {
  /** What the UI blurs. The same size as the canvas. */
  scene: GPUTexture | null = null;
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private params: GPUBuffer;
  private texture: GPUTexture;

  constructor(private device: GPUDevice, private format: GPUTextureFormat) {
    const { canvas } = testImage();
    this.texture = device.createTexture({
      label: 'inspector-test-image',
      size: [canvas.width, canvas.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: canvas },
      { texture: this.texture },
      [canvas.width, canvas.height]
    );
    const module = device.createShaderModule({
      label: 'inspector-backdrop',
      code: SHADER,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'inspector-backdrop',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    });
    this.params = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: this.texture.createView() },
        {
          binding: 2,
          resource: device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
          }),
        },
      ],
    });
  }

  /** Draws the image into the canvas and into `scene`, both `width` by `height` device pixels. */
  draw(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    width: number,
    height: number
  ): void {
    if (this.scene?.width !== width || this.scene?.height !== height) {
      this.scene?.destroy();
      this.scene = this.device.createTexture({
        label: 'inspector-scene',
        size: [width, height],
        format: this.format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    }
    this.device.queue.writeBuffer(
      this.params,
      0,
      new Float32Array([width, height, this.texture.width, this.texture.height])
    );
    for (const target of [this.scene.createView(), view]) {
      const pass = encoder.beginRenderPass({
        label: 'inspector-backdrop',
        colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(3);
      pass.end();
    }
  }

  dispose(): void {
    this.scene?.destroy();
    this.texture.destroy();
    this.params.destroy();
  }
}
