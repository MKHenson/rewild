import { ATLAS_TEXTURE, UIImage, UIImageLookup } from './image';
import {
  ATLAS_MIP_LEVELS,
  ATLAS_SIZE,
  AtlasBlock,
  blockSize,
  BuddyAllocator,
  IMAGE_BORDER,
  MAX_BLOCK,
} from './imageAtlas';
import { UnusedImages } from './imageCache';
import { fullMipLevels, MipmapGenerator } from './mipmaps';

/**
 * What `UIImages.add` takes, and what a loader gives: what WebGPU copies an
 * image from. For an `img` element, make an `ImageBitmap` of it first.
 */
export type UIImageSource = GPUImageCopyExternalImage['source'];

/** What a loader gives for a key: the image, and what it knows about it. */
export interface UILoadedImage {
  source: UIImageSource;
  /** Texels per CSS pixel. See `UIImageOptions`. */
  pixelRatio?: number;
  /** A URL that shows the image in the DOM, for the inspector's DOM side. */
  url?: string;
}

/**
 * Turns an image's key into an image. Each platform can set its own, so
 * nodes name only keys. `UIImages` closes an `ImageBitmap` it gives.
 */
export type UIImageLoader = (
  key: string
) => Promise<UIImageSource | UILoadedImage>;

/**
 * The default loader: takes the key as a URL, and fetches and decodes it. The
 * decode keeps the texels unpremultiplied, because macOS zeroes the colour of
 * clear texels in a premultiplied decode. The copy to the GPU premultiplies.
 */
export async function fetchImage(url: string): Promise<UILoadedImage> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`The image ${url} did not load: ${response.status}`);
  const source = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  return { source, url };
}

export interface UIImageOptions {
  /**
   * Texels per CSS pixel. A node with no size takes the texel size over it,
   * so an image drawn at twice its size for high DPI screens takes 2.
   * Defaults to what the loader gives, or 1.
   */
  pixelRatio?: number;
}

/** What the images hold, for the stats. */
export interface UIImageStats {
  /** Images in use in the atlas. */
  small: number;
  /** Images in use with their own texture. */
  large: number;
  /** Images in the cache, which nothing holds. */
  cached: number;
  /** Bytes of GPU memory: the atlas layers, with mips, and each large image, with mips. */
  bytes: number;
  /** Bytes of the images in the cache: their atlas blocks and their textures. */
  cachedBytes: number;
}

interface Entry {
  /** The holds: nodes with a `src`, and `load` and `add` calls, less `release` calls. */
  count: number;
  /** Null while it loads. */
  image: UIImage | null;
  ready: Promise<void>;
  /** A URL that shows it in the DOM. */
  url: string | null;
  /** The canvas it came from, for a data URL for the DOM. */
  canvas: HTMLCanvasElement | null;
  dataUrl: string | null;
  block: AtlasBlock | null;
  texture: GPUTexture | null;
  bytes: number;
}

const FORMAT: GPUTextureFormat = 'rgba8unorm';
const MB = 1024 * 1024;

/** Bytes of RGBA texels with mips: each level is a quarter of the one above. */
function mipBytes(width: number, height: number, levels: number): number {
  let bytes = 0;
  for (let level = 0; level < levels; level++)
    bytes += Math.max(1, width >> level) * Math.max(1, height >> level) * 4;
  return bytes;
}

function isLoaded(
  value: UIImageSource | UILoadedImage
): value is UILoadedImage {
  return 'source' in value;
}

/**
 * The UI's images, by key. Small images share an atlas: a texture array of
 * 2048 by 2048 layers, with a buddy allocator. A large image, one that does
 * not fit a 512 texel block with its border, has a texture of its own. Both
 * kinds bind as a texture array in bind group 1, so they share one shader
 * path. All small images draw in one run, and each large image in its own.
 *
 * A node with a `src` on a surface holds its image, and so do `load` and
 * `add`. Each `release` takes a hold away. An image that nothing holds goes
 * into a cache, and the one used longest ago is freed when the cache is over
 * `cacheBytes`. Images are premultiplied as they are copied, so filtering
 * and mips do not darken their edges.
 */
export class UIImages implements UIImageLookup {
  /** The layout of bind group 1, which holds an image texture and its sampler. */
  readonly bindGroupLayout: GPUBindGroupLayout;
  /**
   * Turns a key into an image. The default takes the key as a URL. Set it
   * before the first image loads.
   */
  loader: UIImageLoader = fetchImage;
  private _cacheBytes = 64 * MB;
  private entries = new Map<string, Entry>();
  private unused = new UnusedImages();
  private allocator = new BuddyAllocator();
  private atlas: GPUTexture | null = null;
  private atlasGroup: GPUBindGroup | null = null;
  private placeholder: GPUTexture;
  private placeholderGroup: GPUBindGroup;
  private groups = new Map<number, GPUBindGroup>();
  private nextTexture = ATLAS_TEXTURE + 1;
  private listeners = new Set<() => void>();
  private sampler: GPUSampler;
  private mipmaps: MipmapGenerator;
  private zeros: Uint8Array<ArrayBuffer> | null = null;
  /** Old atlases to destroy after the submit that copies them. */
  private retired: GPUTexture[] = [];

  constructor(private device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'ui-images',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: '2d-array' },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.sampler = device.createSampler({
      label: 'ui-images',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    this.mipmaps = new MipmapGenerator(device);
    this.placeholder = device.createTexture({
      label: 'ui-images-placeholder',
      size: [1, 1, 1],
      format: FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this.placeholderGroup = this.createGroup(this.placeholder);
  }

  /**
   * The most bytes the cache of unused images keeps. When it holds more, the
   * image used longest ago is freed. 64 MB by default.
   */
  get cacheBytes(): number {
    return this._cacheBytes;
  }

  set cacheBytes(bytes: number) {
    this._cacheBytes = bytes;
    this.trim();
  }

  /** The image, or undefined until it has loaded. A cached image is still here. */
  image(key: string): UIImage | undefined {
    return this.entries.get(key)?.image ?? undefined;
  }

  /** True when the key is loaded, loading or cached. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Holds the image, and loads it through `loader` when it is not loaded,
   * loading or cached. Call `release` when it is no longer needed. Use it to
   * load a screen's images before the screen opens.
   */
  load(key: string, options: UIImageOptions = {}): Promise<void> {
    const existing = this.entries.get(key);
    if (existing) {
      this.addHold(key, existing);
      return existing.ready;
    }
    const entry = this.createEntry();
    entry.ready = (async () => {
      const result = await this.loader(key);
      const loaded = isLoaded(result) ? result : { source: result };
      const { source } = loaded;
      try {
        // Freed from the cache while it loaded.
        if (this.entries.get(key) !== entry) return;
        entry.url = loaded.url ?? null;
        entry.canvas = canvasOf(source);
        this.upload(entry, source, {
          pixelRatio: options.pixelRatio ?? loaded.pixelRatio,
        });
      } finally {
        if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap)
          source.close();
      }
      // Released while it loaded.
      if (entry.count === 0) this.toCache(key, entry);
      this.changed();
    })();
    entry.ready.catch(() => {
      if (this.entries.get(key) !== entry) return;
      this.entries.delete(key);
      this.unused.remove(key);
    });
    this.entries.set(key, entry);
    return entry.ready;
  }

  /**
   * Holds the image for a node with a `src`, as `load` does. A key that does
   * not load is reported as a warning, and its nodes draw nothing.
   */
  hold(key: string): void {
    this.load(key).catch((error) =>
      console.warn(`The UI image "${key}" did not load`, error)
    );
  }

  /**
   * Adds an image that code made, such as a canvas it drew, and holds it. A
   * key that is loaded, loading or cached is only held once more.
   */
  add(key: string, source: UIImageSource, options: UIImageOptions = {}): void {
    const existing = this.entries.get(key);
    if (existing) {
      this.addHold(key, existing);
      return;
    }
    const entry = this.createEntry();
    entry.canvas = canvasOf(source);
    this.upload(entry, source, options);
    this.entries.set(key, entry);
    this.changed();
  }

  /**
   * Takes one hold away. With none left, the image goes into the cache, and
   * the cache frees the images used longest ago that put it over `cacheBytes`.
   */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || entry.count === 0 || --entry.count > 0) return;
    // An image still loading goes into the cache when it has loaded.
    if (entry.image) this.toCache(key, entry);
  }

  /** Frees each image in the cache now. */
  clearCache(): void {
    this.free(this.unused.trim(0));
  }

  /**
   * A URL that shows the image in the DOM, as the inspector's DOM side needs:
   * the URL the loader gave, or a data URL of the canvas it came from. Null
   * for other sources.
   */
  url(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.url) return entry.url;
    if (entry.canvas) entry.dataUrl ??= entry.canvas.toDataURL();
    return entry.dataUrl;
  }

  /** The bind group of a texture: the atlas, or a large image's own. */
  bindGroup(texture: number): GPUBindGroup {
    if (texture <= ATLAS_TEXTURE)
      return this.atlasGroup ?? this.placeholderGroup;
    return this.groups.get(texture) ?? this.placeholderGroup;
  }

  get stats(): UIImageStats {
    let small = 0;
    let large = 0;
    let bytes = this.atlas
      ? mipBytes(ATLAS_SIZE, ATLAS_SIZE, ATLAS_MIP_LEVELS) *
        this.allocator.layers
      : 0;
    for (const [key, entry] of this.entries) {
      if (entry.texture) bytes += entry.bytes;
      if (this.unused.has(key)) continue;
      if (entry.block) small++;
      if (entry.texture) large++;
    }
    return {
      small,
      large,
      cached: this.unused.size,
      bytes,
      cachedBytes: this.unused.bytes,
    };
  }

  /** Calls `listener` after an image loads, is added or is freed. */
  addListener(listener: () => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: () => void): void {
    this.listeners.delete(listener);
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.texture?.destroy();
    this.entries.clear();
    this.unused.trim(0);
    this.groups.clear();
    this.atlas?.destroy();
    this.atlas = null;
    this.atlasGroup = null;
    this.placeholder.destroy();
    this.listeners.clear();
  }

  private addHold(key: string, entry: Entry): void {
    entry.count++;
    this.unused.remove(key);
  }

  private toCache(key: string, entry: Entry): void {
    this.unused.add(key, entry.bytes);
    this.trim();
  }

  private trim(): void {
    this.free(this.unused.trim(this._cacheBytes));
  }

  /** Frees images that nothing holds: a large image's texture, or a small image's block. */
  private free(keys: string[]): void {
    if (!keys.length) return;
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      this.entries.delete(key);
      if (entry.block) this.allocator.release(entry.block);
      if (entry.texture) {
        this.groups.delete(entry.image!.texture);
        entry.texture.destroy();
      }
    }
    // A node can still name a freed image with `image`. It draws nothing now.
    this.changed();
  }

  private createEntry(): Entry {
    return {
      count: 1,
      image: null,
      ready: Promise.resolve(),
      url: null,
      canvas: null,
      dataUrl: null,
      block: null,
      texture: null,
      bytes: 0,
    };
  }

  private upload(
    entry: Entry,
    source: UIImageSource,
    options: UIImageOptions
  ): void {
    const { width, height } = source;
    const pixelRatio = options.pixelRatio ?? 1;
    const size = blockSize(width, height);
    const encoder = this.device.createCommandEncoder({ label: 'ui-images' });
    if (size !== null) {
      let block = this.allocator.allocate(size);
      if (!block) {
        this.growAtlas(encoder);
        block = this.allocator.allocate(size)!;
      }
      const atlas = this.atlas!;
      // A freed block keeps the last image's texels. Clear it, so the border
      // is clear for filtering and mips.
      this.zeros ??= new Uint8Array(MAX_BLOCK * MAX_BLOCK * 4);
      this.device.queue.writeTexture(
        { texture: atlas, origin: [block.x, block.y, block.layer] },
        this.zeros,
        { bytesPerRow: MAX_BLOCK * 4 },
        [size, size, 1]
      );
      const x = block.x + IMAGE_BORDER;
      const y = block.y + IMAGE_BORDER;
      this.device.queue.copyExternalImageToTexture(
        { source },
        {
          texture: atlas,
          origin: [x, y, block.layer],
          premultipliedAlpha: true,
        },
        [width, height]
      );
      this.mipmaps.generate(encoder, atlas, block.layer);
      entry.block = block;
      entry.bytes = mipBytes(size, size, ATLAS_MIP_LEVELS);
      entry.image = {
        width,
        height,
        pixelRatio,
        texture: ATLAS_TEXTURE,
        layer: block.layer,
        uv: [
          x / ATLAS_SIZE,
          y / ATLAS_SIZE,
          (x + width) / ATLAS_SIZE,
          (y + height) / ATLAS_SIZE,
        ],
      };
    } else {
      const limit = this.device.limits.maxTextureDimension2D;
      if (width > limit || height > limit)
        throw new Error(
          `An image of ${width} by ${height} is larger than the device's ${limit}`
        );
      const levels = fullMipLevels(width, height);
      const texture = this.device.createTexture({
        label: 'ui-image',
        size: [width, height, 1],
        format: FORMAT,
        mipLevelCount: levels,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source },
        { texture, premultipliedAlpha: true },
        [width, height]
      );
      this.mipmaps.generate(encoder, texture);
      const id = this.nextTexture++;
      this.groups.set(id, this.createGroup(texture));
      entry.texture = texture;
      entry.bytes = mipBytes(width, height, levels);
      entry.image = {
        width,
        height,
        pixelRatio,
        texture: id,
        layer: 0,
        uv: [0, 0, 1, 1],
      };
    }
    this.device.queue.submit([encoder.finish()]);
    for (const texture of this.retired) texture.destroy();
    this.retired.length = 0;
  }

  /** Adds a layer to the atlas: a larger array, with the old layers copied in. */
  private growAtlas(encoder: GPUCommandEncoder): void {
    const old = this.atlas;
    const oldLayers = this.allocator.layers;
    this.allocator.addLayer();
    const atlas = this.device.createTexture({
      label: 'ui-image-atlas',
      size: [ATLAS_SIZE, ATLAS_SIZE, this.allocator.layers],
      format: FORMAT,
      mipLevelCount: ATLAS_MIP_LEVELS,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    if (old) {
      for (let level = 0; level < ATLAS_MIP_LEVELS; level++) {
        const size = ATLAS_SIZE >> level;
        encoder.copyTextureToTexture(
          { texture: old, mipLevel: level },
          { texture: atlas, mipLevel: level },
          [size, size, oldLayers]
        );
      }
      // The copy is in this encoder. A texture destroyed after its submit
      // lives until the submitted work is done.
      this.retired.push(old);
    }
    this.atlas = atlas;
    this.atlasGroup = this.createGroup(atlas);
  }

  private createGroup(texture: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      label: 'ui-images',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView({ dimension: '2d-array' }) },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The source as a canvas element, for a data URL, or null. */
function canvasOf(source: UIImageSource): HTMLCanvasElement | null {
  return typeof HTMLCanvasElement !== 'undefined' &&
    source instanceof HTMLCanvasElement
    ? source
    : null;
}
