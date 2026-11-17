import { loadAtlasTexture } from './atlas';
import type { Bounds } from './font';
import type { UIIconName } from './iconNames';

export interface IconData {
  name: string;
  /**
   * The quad in ems from the top left of the icon's square, with y down. The
   * square is one em, lucide's 24-unit grid.
   */
  planeBounds: Bounds;
  /** The quad's cell in texels from the atlas's top left, on texel centres. */
  atlasBounds: Bounds;
}

/**
 * An SDF atlas of lucide icons, as `scripts/build-icon-atlas.mjs` writes it.
 * The image is grey, so red, green and blue hold the same distance and the
 * text shader's median reads it.
 */
export interface IconAtlasData {
  atlas: {
    type: string;
    /** The width of the distance field across an edge, in texels. */
    distanceRange: number;
    /** Texels per em. */
    size: number;
    width: number;
    height: number;
    yOrigin: 'top';
  };
  icons: IconData[];
}

/**
 * The UI icons: lucide icons in one distance field atlas. Drawing needs
 * `texture`.
 */
export class UIIcons {
  readonly distanceRange: number;
  /** The atlas, or null for icons made with no GPU. */
  texture: GPUTexture | null = null;
  private icons = new Map<string, IconData>();

  constructor(data: IconAtlasData) {
    this.distanceRange = data.atlas.distanceRange;
    for (const icon of data.icons) this.icons.set(icon.name, icon);
  }

  has(name: string): boolean {
    return this.icons.has(name);
  }

  /** The icon, or undefined when the atlas does not have it. */
  icon(name: UIIconName): IconData | undefined {
    return this.icons.get(name);
  }

  /**
   * Loads the atlas JSON from `url` and its PNG from the same folder, with
   * the same name.
   */
  static async load(device: GPUDevice, url: string): Promise<UIIcons> {
    const data = (await (await fetch(url)).json()) as IconAtlasData;
    const icons = new UIIcons(data);
    icons.texture = await loadAtlasTexture(
      device,
      url.replace(/\.json$/, '.png'),
      'ui-icons'
    );
    return icons;
  }

  dispose(): void {
    this.texture?.destroy();
    this.texture = null;
  }
}
