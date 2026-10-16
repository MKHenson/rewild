import { IResource, Vector3 } from 'models';
import { Vector3 as Point } from 'rewild-common';
import {
  Mesh,
  PointLight,
  PortalPass,
  Renderer,
  Transform,
  createPortalViewCube,
} from 'rewild-renderer';
import { Asset3D } from './Asset3D';
import type { AssetReader } from '../../database/local-asset-store';
import { PortalSound } from '../audio/PortalSound';
import { PortalOpening } from './PortalOpening';
import { GameManager } from '../GameManager';
import { PortalTrigger } from './behaviours/PortalTrigger';
import { audio } from '../audio/audio';

/** The level file a portal shows: its destination seen from that level's PlayerStart. */
export const PORTAL_VIEW_ASSET_TYPE = 'portal-view';
export const PORTAL_VIEW_FILENAME = 'view';

/** Reads the files of any level in the open project. */
export type LevelReader = (levelId: string) => AssetReader | null;

/** How far the portal's light reaches, in portal radii. */
const LIGHT_RANGE = 40;
/** The light's steady glow while closed, as a share of its glow when open. */
const CLOSED_GLOW = 0.25;
/** How many times more often the lightning bursts while opening or closing. */
const POWERING_RATE = 6;

/**
 * A sphere that shows its target level and takes the player there. In a game
 * it starts closed, small and bobbing, and opens as the player nears it (see
 * PortalOpening); in the editor it is always open.
 */
export class PortalAsset extends Asset3D {
  readonly pass = new PortalPass();
  readonly sphere: Mesh;
  /** Glows in the tint and flashes with the lightning. */
  readonly light = new PointLight();
  radius = 1;
  targetLevel = '';
  /** Its sounds in a game; null in the editor. */
  sound: PortalSound | null = null;
  /** Open in the editor; `mount` closes it for a game. */
  opening = new PortalOpening(true);

  private renderer: Renderer;
  private readLevel: LevelReader | null;
  private viewCube: GPUTexture | null = null;
  private loadedLevel: string | null = null;
  private disposed = false;

  constructor(
    renderer: Renderer,
    readLevel: LevelReader | null,
    gameManager?: GameManager
  ) {
    super(new Transform());
    this.renderer = renderer;
    this.readLevel = readLevel;
    this.sphere = new Mesh(renderer.geometryManager.get('sphere'), this.pass);
    this.sphere.castShadow = false;
    this.transform.addChild(this.sphere.transform);
    this.transform.addChild(this.light.transform);
    this.pass.light = this.light;
    renderer.addPortal(this.pass);
    this.transform.userData.portal = this;
    if (gameManager) {
      this.addBehavior(new PortalTrigger());
      this.sound = new PortalSound(gameManager.sound, audio);
    }
  }

  mount(): void {
    super.mount();
    this.opening = new PortalOpening(false);
    this.pass.arcs.spawning = false;
    this.applyProperties();
    this.sound?.hum(this.transform.position, this.radius);
  }

  /** Opens or closes the portal by how near `eye` is, `seconds` after the last tick. */
  tick(seconds: number, eye: Point): void {
    const distance = eye.distanceTo(this.transform.position);
    switch (this.opening.update(seconds, distance, this.radius)) {
      case 'opening':
        this.sound?.open(this.transform.position);
        break;
      case 'burst':
        this.pass.arcs.burst();
        break;
    }
    const arcs = this.pass.arcs;
    arcs.spawning = this.opening.openness > 0;
    arcs.rate = this.opening.isChanging ? POWERING_RATE : 1;
    this.applyOpening();
  }

  applyProperties(resource: IResource = this.data) {
    const properties = this.buildObjectFromProperties(resource);
    if (!properties) return;

    this.radius = (properties.radius as number) || 3;
    this.light.radius = this.radius * LIGHT_RANGE;

    const tint = properties.color as Vector3 | undefined;
    if (tint) {
      this.pass.portal.tint.setRGB(tint[0], tint[1], tint[2]);
      this.light.color.setRGB(tint[0], tint[1], tint[2]);
    }
    if (typeof properties.intensity === 'number')
      this.pass.portal.glow = properties.intensity;
    this.applyOpening();

    this.targetLevel = (properties.targetLevel as string) || '';
    if (this.targetLevel !== this.loadedLevel) void this.loadView();
  }

  // Sizes and lifts the sphere, and sets the light's glow, by how open it is.
  private applyOpening() {
    const opening = this.opening;
    const size = this.radius * opening.scale;
    this.sphere.transform.scale.set(size, size, size);
    this.sphere.transform.position.y = this.radius * opening.bob;
    this.pass.lightGlowScale =
      CLOSED_GLOW + (1 - CLOSED_GLOW) * opening.openness;
    this.light.intensity = this.pass.lightLevel;
    this.sound?.setOpenness(opening.openness);
  }

  /** Releases the view cube and the pass's buffers, and drops any load in flight. */
  dispose(): void {
    this.disposed = true;
    this.viewCube?.destroy();
    this.viewCube = null;
    this.pass.portal.view = null;
    this.pass.dispose();
    this.renderer.removePortal(this.pass);
    this.sound?.dispose();
    this.sound = null;
    delete this.transform.userData.portal;
  }

  private isStale(levelId: string) {
    return (
      this.disposed || this.loadedLevel !== levelId || this.renderer.disposed
    );
  }

  private async loadView() {
    if (this.disposed) return;
    const levelId = this.targetLevel;
    this.loadedLevel = levelId;

    const read = levelId ? this.readLevel?.(levelId) : null;
    const data = read
      ? await read(PORTAL_VIEW_ASSET_TYPE, PORTAL_VIEW_FILENAME)
      : null;
    if (this.isStale(levelId)) return;

    let cube: GPUTexture | null = null;
    if (data) {
      try {
        const strip = await createImageBitmap(new Blob([data]));
        if (this.isStale(levelId)) {
          strip.close();
          return;
        }
        cube = createPortalViewCube(this.renderer, strip);
        strip.close();
      } catch (err) {
        console.warn(
          `Could not decode the portal view of level ${levelId}`,
          err
        );
      }
    }

    this.viewCube?.destroy();
    this.viewCube = cube;
    this.pass.portal.view = cube;
  }
}
