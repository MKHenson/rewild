import { RENDER_QUALITIES } from '../../utils/RenderQuality';
import { terrainDetailFade, terrainShaderDefines } from './TerrainQuality';

describe('TerrainQuality', () => {
  // The values that were hardcoded in terrain.wgsl before the table existed.
  // `high` is the default tier, so this is what guarantees the change was not
  // also a silent quality change.
  it('reproduces the previously hardcoded shader values at high', () => {
    expect(terrainShaderDefines('high')).toEqual({
      POM_MIN_STEPS: '8.0',
      POM_MAX_STEPS: '16.0',
      POM_REFINE_STEPS: '6',
      HAS_TERRAIN_PARALLAX: true,
      HAS_TERRAIN_NO_TILE: true,
    });
    expect(terrainDetailFade('high')).toEqual({ start: 150, end: 200 });
  });

  it('names a value for every tier', () => {
    for (const quality of RENDER_QUALITIES) {
      expect(Object.keys(terrainShaderDefines(quality))).toHaveLength(5);
      expect(terrainDetailFade(quality).end).toBeGreaterThan(0);
    }
  });

  it('gets cheaper as the tier falls', () => {
    const descending = ['ultra', 'high', 'medium', 'low'] as const;

    for (let i = 1; i < descending.length; i++) {
      const richer = terrainShaderDefines(descending[i - 1]);
      const cheaper = terrainShaderDefines(descending[i]);

      expect(Number(cheaper.POM_MAX_STEPS)).toBeLessThan(
        Number(richer.POM_MAX_STEPS)
      );
      expect(Number(cheaper.POM_MIN_STEPS)).toBeLessThan(
        Number(richer.POM_MIN_STEPS)
      );
      expect(Number(cheaper.POM_REFINE_STEPS)).toBeLessThanOrEqual(
        Number(richer.POM_REFINE_STEPS)
      );

      const richerFade = terrainDetailFade(descending[i - 1]);
      const cheaperFade = terrainDetailFade(descending[i]);
      expect(cheaperFade.start).toBeLessThan(richerFade.start);
      expect(cheaperFade.end).toBeLessThan(richerFade.end);
    }
  });

  it('keeps the march inside the fade it is gated by', () => {
    // Relief has to finish fading before it is gone, or the shader gates the
    // march on a window that closed before it opened.
    for (const quality of RENDER_QUALITIES) {
      const fade = terrainDetailFade(quality);
      expect(fade.end).toBeGreaterThan(fade.start);
    }
  });

  it('drops the second no-tile tap only at the cheapest tier', () => {
    for (const quality of ['ultra', 'high', 'medium'] as const) {
      expect(terrainShaderDefines(quality).HAS_TERRAIN_NO_TILE).toBe(true);
    }
    expect(terrainShaderDefines('low').HAS_TERRAIN_NO_TILE).toBe(false);
  });

  it('never trades away detail normals by tier', () => {
    // They are gated by the fade distance at runtime instead, so near fragments
    // keep them at every tier. A define here would take them at arm's length
    // too, where the macro normal cannot stand in for them.
    for (const quality of RENDER_QUALITIES) {
      expect(terrainShaderDefines(quality)).not.toHaveProperty(
        'HAS_TERRAIN_DETAIL_NORMAL'
      );
    }
  });

  it('compiles the march out only at the cheapest tier', () => {
    expect(terrainShaderDefines('low').HAS_TERRAIN_PARALLAX).toBe(false);
    for (const quality of ['ultra', 'high', 'medium'] as const) {
      expect(terrainShaderDefines(quality).HAS_TERRAIN_PARALLAX).toBe(true);
    }
  });
});
