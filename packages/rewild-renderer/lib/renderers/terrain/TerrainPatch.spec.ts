import { placeTerrainPatch, TerrainPatchPlacement } from './TerrainPatch';

describe('placeTerrainPatch', () => {
  it('snaps the patch to the sample lattice around the eye', () => {
    const out = new TerrainPatchPlacement();
    expect(placeTerrainPatch(10.7, -3.2, 32, 0.08, 0, 0, 240, out)).toBe(true);

    expect(out.minX).toBe(-6);
    expect(out.maxX).toBe(26);
    expect(out.minZ).toBe(-20);
    expect(out.maxZ).toBe(12);
    expect(out.cellsX).toBe(400);
    expect(out.cellsZ).toBe(400);
    expect(out.gridX).toBe(-6);
    expect(out.gridZ).toBe(12);
    expect(out.eyeX).toBeCloseTo(10.7);
  });

  it('clips the grid to the chunk but keeps the whole rect to sink', () => {
    const out = new TerrainPatchPlacement();
    placeTerrainPatch(236, 0, 32, 0.08, 0, 0, 240, out);

    expect(out.minX).toBe(220);
    expect(out.maxX).toBe(252);
    expect(out.gridX).toBe(220);
    expect(out.cellsX).toBe(250);

    placeTerrainPatch(236, 0, 32, 0.08, 480, 0, 240, out);
    expect(out.minX).toBe(-260);
    expect(out.maxX).toBe(-228);
    expect(out.gridX).toBe(-240);
    expect(out.cellsX).toBe(150);
    expect(out.eyeX).toBeCloseTo(-244);
  });

  it('misses a chunk the patch does not reach', () => {
    const out = new TerrainPatchPlacement();
    expect(placeTerrainPatch(0, 0, 32, 0.08, 960, 0, 240, out)).toBe(false);
    expect(out.active).toBe(false);
  });

  it('fades displacement out before the patch edge', () => {
    const out = new TerrainPatchPlacement();
    placeTerrainPatch(0, 0, 32, 0.08, 0, 0, 240, out);

    expect(out.fadeEnd).toBeLessThanOrEqual(16 - 3);
    expect(out.fadeStart).toBeLessThan(out.fadeEnd);
  });
});
