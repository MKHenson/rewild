import { Renderer } from 'rewild-renderer';
import { AoDebugView } from 'rewild-renderer/lib/renderers/ao/AmbientOcclusion';

const VIEWS: AoDebugView[] = ['off', 'raw', 'blurred'];

export function registerAoDebugCommands(renderer: Renderer) {
  const ao = renderer.ambientOcclusion;

  (window as any).setAoEnabled = (enabled?: boolean) => {
    if (typeof enabled !== 'boolean') {
      const tier = renderer.quality.aspect('ao');
      const applied = ao.applies(renderer);
      console.log(
        `setAoEnabled(bool) — currently ${ao.enabled}, tier ${tier}, ` +
          `applied ${applied}. The low tier and any material debug channel ` +
          'keep it off.'
      );
      return;
    }
    ao.enabled = enabled;
    renderer.metrics.reset();
    console.log(`SSAO ${enabled ? 'ON' : 'OFF'}. Metrics window cleared.`);
  };

  (window as any).showAoBuffer = (view?: AoDebugView) => {
    if (!view || !VIEWS.includes(view)) {
      console.log(
        `showAoBuffer(view) — view is one of ${VIEWS.join(' | ')}, currently ` +
          `'${ao.debugView}'. raw is before the blur, blurred is what the ` +
          'resolve reads. White is open sky.'
      );
      return;
    }
    ao.debugView = view;
  };

  (window as any).tuneAo = (
    intensity?: number,
    radiusScale?: number,
    directStrength?: number
  ) => {
    if (typeof intensity !== 'number') {
      console.log(
        `tuneAo(intensity, radiusScale?, directStrength?) — currently ` +
          `${ao.intensity}, ${ao.radiusScale}, ${ao.directStrength}. ` +
          'intensity is an exponent on visibility; radiusScale multiplies the ' +
          'tier radius; directStrength (0..1) is the share of AO that also ' +
          'darkens sunlight.'
      );
      return;
    }
    ao.intensity = intensity;
    if (typeof radiusScale === 'number') ao.radiusScale = radiusScale;
    if (typeof directStrength === 'number') ao.directStrength = directStrength;
    console.log(
      `SSAO intensity ${ao.intensity}, radius x${ao.radiusScale}, ` +
        `direct ${ao.directStrength}`
    );
  };

  (window as any).setShadowFloors = (ground?: number, foliage?: number) => {
    const shadows = renderer.directionalShadowRenderer;
    const withAo = ao.applies(renderer);
    const floors = shadows.shadowFloors(withAo);
    const which = withAo ? 'with SSAO' : 'without SSAO';
    if (typeof ground !== 'number') {
      console.log(
        `setShadowFloors(ground, foliage?) — the least sun a shadowed ` +
          `fragment keeps. Currently ${floors.ground}, ${floors.foliage} ` +
          `(${which}). Sets the pair in force; toggle setAoEnabled to tune ` +
          'the other.'
      );
      return;
    }
    floors.ground = ground;
    if (typeof foliage === 'number') floors.foliage = foliage;
    console.log(
      `Shadow floors ${which}: ground ${floors.ground}, foliage ${floors.foliage}`
    );
  };
}
