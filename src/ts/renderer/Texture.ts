export abstract class Texture {
  webglTexture: WebGLTexture | null;
  source: TexImageSource | null;
  loading: boolean;
  flip: boolean;
  path: string;

  constructor(path: string) {
    this.path = path;
    this.webglTexture = null;
    this.loading = false;
    this.source = null;
    this.flip = false;
  }

  init(gl: WebGL2RenderingContext) {
    if (this.source === null) throw new Error(`Image has no source!`);

    var tex = gl.createTexture()!;
    if (this.flip === true) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip the texture by the Y Position, So 0,0 is bottom left corner.

    // Set text buffer for work
    gl.bindTexture(gl.TEXTURE_2D, tex);

    // Push image to GPU.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);

    // Setup up scaling
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Setup down scaling
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);

    // Precalc different sizes of texture for better quality rendering.
    gl.generateMipmap(gl.TEXTURE_2D);

    // Unbind
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Stop flipping textures
    if (this.flip === true) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.webglTexture = tex;
  }

  abstract load(path: string): Promise<void>;
}

export class TextureHtmlImage extends Texture {
  constructor(path: string) {
    super(path);
  }

  load() {
    console.log(`Loading image '${this.path}'...`);
    const image = new Image();

    return new Promise<void>((resolve, reject) => {
      image.onload = () => {
        console.log(`Image '${this.path}' loaded`);
        this.source = image;
        resolve();
      };

      image.onerror = () => {
        reject(new Error(`Could not load image ${this.path}`));
      };

      image.src = this.path;
    });
  }
}
