import { OrbitController, Renderer, resolveClimatePreset } from 'rewild-renderer';
import {
  Lake,
  LakeCellReport,
  inspectLakeCells,
  lakeSpaceToWorld,
  worldToLakeSpace,
} from 'rewild-renderer/lib/renderers/terrain/Lakes';

// Lake inspection. A lake cell can roll nothing, lose to a neighbour, sit in
// the ocean's reach or fail its slope test, and all of those look the same from
// the camera: no water. These print which one it was, and fly to the lakes that
// did settle.

function activeOrbitController(): OrbitController | null {
  const detail: { renderer: Renderer | null; orbitController: OrbitController | null } = {
    renderer: null,
    orbitController: null,
  };
  document.dispatchEvent(new CustomEvent('request-renderer', { detail }));
  return detail.orbitController;
}

function reportsAround(renderer: Renderer, radiusMetres: number): LakeCellReport[] {
  const terrain = renderer.terrainRenderer;
  const camera = renderer.camera.camera.transform.position;
  const lo = new Float64Array(2);
  const hi = new Float64Array(2);
  worldToLakeSpace(camera.x - radiusMetres, camera.z + radiusMetres, lo);
  worldToLakeSpace(camera.x + radiusMetres, camera.z - radiusMetres, hi);
  return inspectLakeCells(
    terrain.seed,
    resolveClimatePreset(terrain.climatePreset),
    terrain.seaLevel,
    lo[0],
    lo[1],
    hi[0],
    hi[1]
  );
}

function settledNearest(renderer: Renderer, radiusMetres: number): Lake[] {
  const camera = renderer.camera.camera.transform.position;
  const world = new Float64Array(2);
  const distance = (lake: Lake) => {
    lakeSpaceToWorld(lake.u, lake.v, world);
    return Math.hypot(world[0] - camera.x, world[1] - camera.z);
  };
  return reportsAround(renderer, radiusMetres)
    .map((report) => report.lake)
    .filter((lake): lake is Lake => lake !== null)
    .sort((a, b) => distance(a) - distance(b));
}

export function registerLakeDebugCommands(renderer: Renderer) {
  (window as any).showLakes = (radiusKm = 5) => {
    const terrain = renderer.terrainRenderer;
    const climate = resolveClimatePreset(terrain.climatePreset);
    if (!climate.lakes) {
      console.log(`showLakes() — climate '${terrain.climatePreset}' has no lakes.`);
      return;
    }

    const camera = renderer.camera.camera.transform.position;
    const reports = reportsAround(renderer, radiusKm * 1000);
    const world = new Float64Array(2);
    const counts = new Map<string, number>();
    const rows: Record<string, unknown>[] = [];
    for (const report of reports) {
      counts.set(report.outcome, (counts.get(report.outcome) ?? 0) + 1);
      if (report.outcome === 'no roll') continue;
      lakeSpaceToWorld(report.u, report.v, world);
      const lake = report.lake;
      rows.push({
        cell: `${report.cellX},${report.cellY}`,
        outcome: report.outcome,
        x: Math.round(world[0]),
        z: Math.round(world[1]),
        distance: Math.round(Math.hypot(world[0] - camera.x, world[1] - camera.z)),
        rimSlope: Number.isNaN(report.rimSlope) ? '' : report.rimSlope.toFixed(1),
        tarnSlope: Number.isNaN(report.tarnSlope) ? '' : report.tarnSlope.toFixed(1),
        level: lake ? lake.level.toFixed(1) : '',
        radius: lake ? Math.round(lake.radius * terrain.metersPerSample) : '',
      });
    }

    const lakes = climate.lakes;
    console.log(
      `showLakes(${radiusKm}) — ${reports.length} lake cells within ${radiusKm} km ` +
        `of (${Math.round(camera.x)}, ${Math.round(camera.z)}), ` +
        `${lakes.cellSize * terrain.metersPerSample} m each. ` +
        Array.from(counts, ([outcome, n]) => `${outcome}: ${n}`).join(', ') +
        `.\nA lake needs a rim slope under ${lakes.maxRimSlope}°` +
        (lakes.tarns
          ? `; failing that, a tarn needs one under ${lakes.tarns.maxRimSlope}°.`
          : '; this climate has no tarns.') +
        ` 'crowded' lost to a neighbour's roll; 'ocean' is out at sea, or a tarn ` +
        `with its rim in the sea's reach. goToLake(i) flies to the i-th nearest settled lake.`
    );
    console.table(rows.sort((a, b) => (a.distance as number) - (b.distance as number)));
  };

  (window as any).goToLake = (index = 0, radiusKm = 10) => {
    const lakes = settledNearest(renderer, radiusKm * 1000);
    const lake = lakes[index];
    if (!lake) {
      console.warn(`goToLake(${index}) — only ${lakes.length} lakes within ${radiusKm} km.`);
      return;
    }
    const orbit = activeOrbitController();
    if (!orbit) {
      console.warn('goToLake() — no editor camera to move.');
      return;
    }

    const world = new Float64Array(2);
    lakeSpaceToWorld(lake.u, lake.v, world);
    const span = lake.reach * renderer.terrainRenderer.metersPerSample;
    orbit.target.set(world[0], lake.level, world[1]);
    renderer.camera.camera.transform.position.set(
      world[0],
      lake.level + span * 1.5,
      world[1] + span * 2
    );
    orbit.update();
    console.log(
      `goToLake(${index}) — ${lake.lagoon ? 'lagoon' : lake.tarn ? 'tarn' : 'lake'} ` +
        `at (${Math.round(world[0])}, ${Math.round(world[1])}), level ${lake.level.toFixed(1)} m.`
    );
  };
}
