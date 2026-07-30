import { Renderer } from '..';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { BloomPass } from './BloomPass';
import { ToneMapPass } from './ToneMapPass';

/**
 * Turns the composited HDR frame into the displayable image.
 *
 * By the time this runs, the HDR scene target holds everything: geometry from
 * the scene pass, with sky, clouds, fog and god rays composited over it in HDR
 * by the atmosphere pass. This stage extracts bloom from that frame and then
 * applies exposure and the single whole-frame tone curve on the way to the
 * swapchain.
 *
 * Both parts used to live elsewhere — bloom inside the sky renderer, ACES inside
 * the sky composite — which made sense only while they were sky-specific. Bloom
 * now sources the whole frame and the tone curve covers the whole frame, so
 * neither belongs to the sky any more.
 *
 * Order matters and is the reason these are owned together: bloom reads the same
 * target the atmosphere composite writes, so it cannot run until that pass is
 * submitted, and the tone map needs bloom's result. Keeping them in one class
 * keeps that sequence in one place.
 */
export class FrameCompositor {
  readonly bloom: BloomPass;
  readonly toneMap: ToneMapPass;

  perfMonitor: PerformanceMonitor = new PerformanceMonitor();

  private initialized = false;
  /** Quality revision bloom was last built against; -1 until first build. */
  private builtQualityRevision = -1;

  constructor() {
    this.bloom = new BloomPass();
    this.toneMap = new ToneMapPass();
  }

  /**
   * Builds the tone map pipeline. Bloom is deferred to init(), because it sizes
   * its targets from the scene target and has to be rebuilt on resize.
   */
  initToneMap(renderer: Renderer): void {
    this.toneMap.init(renderer);
    this.perfMonitor.init(renderer.device, ['bloom']);
  }

  /**
   * (Re)builds the bloom chain against the current scene colour target. Safe to
   * call repeatedly; must be called after a resize, since bloom's targets are
   * derived from the canvas size.
   */
  init(renderer: Renderer): void {
    this.bloom.quality = renderer.quality.level;
    this.builtQualityRevision = renderer.quality.revision;
    this.bloom.sourceTexture = renderer.sceneColorTarget;
    this.bloom.init(renderer);
    this.initialized = true;
  }

  /**
   * Bloom + tone map. Call once per frame, after the atmosphere composite has
   * been submitted — bloom reads the target that pass writes.
   */
  render(renderer: Renderer, targetView: GPUTextureView): void {
    if (!this.initialized) return;

    // Bloom's Gaussian kernel is baked into its shader per tier, so a quality
    // change means a rebuild. An integer compare is free to do every frame.
    if (renderer.quality.hasChangedSince(this.builtQualityRevision)) {
      this.init(renderer);
    }

    this.bloom.render(renderer, this.perfMonitor.getTimestampWrites('bloom'));

    const encoder = renderer.device.createCommandEncoder({
      label: 'frame compositor encoder',
    });
    this.toneMap.render(renderer, encoder, targetView, this.bloom.renderTarget);
    renderer.device.queue.submit([encoder.finish()]);

    this.perfMonitor.resolveAndLog();
  }

  dispose(): void {
    this.bloom.dispose();
    this.toneMap.dispose();
    this.perfMonitor.dispose();
    this.initialized = false;
  }
}
