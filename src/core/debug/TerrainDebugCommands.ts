import { Renderer } from 'rewild-renderer';

export function registerTerrainDebugCommands(renderer: Renderer) {
  (window as any).setTerrainFarOnlyHeight = (above: number, below?: number) => {
    const terrain = renderer.terrainRenderer;
    terrain.farOnlyAbove = above;
    terrain.farOnlyBelow = Math.min(below ?? above * 0.8, above);

    console.log(
      `setTerrainFarOnlyHeight(${terrain.farOnlyAbove}, ` +
        `${terrain.farOnlyBelow}) — chunks fade out climbing from ` +
        `${terrain.farOnlyBelow} m to ${terrain.farOnlyAbove} m over the ` +
        `ground and stop streaming a little above that. Far-only now: ` +
        `${terrain.farOnly}.`
    );
  };
}
