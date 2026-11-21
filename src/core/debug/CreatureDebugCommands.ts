import { createWaterQuerySample } from 'rewild-renderer';
import { Creature } from '../routing/Creature';
import { getCreatureSpawner } from '../routing/CreatureSpawner';

/** Metres from a creature `goToCreature` puts the player. */
const VISIT_DISTANCE = 4;

// Creature spawning. Whether a creature appears depends on the spawner being
// mounted, the chunk under it having heights, the biome weight and the habitat
// at its home, and its distance; these print them apart.
export function registerCreatureDebugCommands() {
  (window as any).showCreatureSpawns = (limit = 20) => {
    const spawner = getCreatureSpawner();
    if (!spawner) {
      console.log(
        'showCreatureSpawns(limit = 20) — no spawner is mounted. Creatures ' +
          'spawn only in game, on a level with terrain.'
      );
      return;
    }

    const report = spawner.describe();
    console.log(
      `showCreatureSpawns() — climate '${report.climate}', player ` +
        `${report.player?.map((v) => v.toFixed(1)).join(', ') ?? 'missing'} ` +
        `in chunk ${report.playerChunk ?? '-'}, heights ` +
        `${report.heightsLoaded ? 'loaded' : 'not loaded'}. ` +
        `${report.live} creatures live or loading, ${report.chunks} chunks ` +
        `planned, ${report.groups.length} groups. A chunk is planned once its ` +
        `heights load. A group spawns when its home is within its habitat's ` +
        `spawnRadius and despawns past its despawnRadius, so idle groups ` +
        `further than spawnRadius are out of range.`
    );
    console.log('Biome weights at the player:', report.biomes);
    if (report.water)
      console.log('Sea biome weights at the player:', report.seaBiomes);
    console.log('Planned groups, nearest first:');
    console.table(report.groups.slice(0, limit));
    console.log(
      'Live creatures, nearest first. y should match ground for land creatures:'
    );
    console.table(report.creatures.slice(0, limit));
  };

  (window as any).showSeaBiomes = () => {
    const spawner = getCreatureSpawner();
    if (!spawner) {
      console.log(
        'showSeaBiomes() — no spawner is mounted. It reads the water in game, on a level with terrain.'
      );
      return;
    }
    const { water, seaBiomes } = spawner.describe();
    if (!water) {
      console.log('showSeaBiomes() — the player is not over water.');
      return;
    }
    const share = Object.values(seaBiomes).reduce((a, b) => a + b, 0);
    console.log(
      `showSeaBiomes() — ${water.depth} m deep, ${water.shore} m from shore, ` +
        `coverage ${water.coverage}. The sea biomes hold ${share.toFixed(2)} ` +
        `of the bed; the land biome under them holds the rest.`
    );
    console.table(seaBiomes);
  };

  (window as any).showCreaturesNear = (radius = 30) => {
    const player = getCreatureSpawner()?.gameData?.player?.asset;
    if (!player) {
      console.log('showCreaturesNear(radius = 30) — no player in game.');
      return;
    }
    const p = player.transform.position;
    const water = createWaterQuerySample();
    const rows = [];
    for (const creature of Creature.live) {
      const movement = creature.movement;
      if (!movement) continue;
      const { x, y, z, habitat, world } = movement;
      const distance = Math.hypot(x - p.x, y - p.y, z - p.z);
      if (distance > radius) continue;
      const wet = world.sampleWater(x, z, water) && water.wet;
      rows.push({
        name: creature.name,
        distance: +distance.toFixed(1),
        y: +y.toFixed(2),
        ground: +(world.sampleHeight(x, z) ?? NaN).toFixed(2),
        waterDepth: wet ? +water.depth.toFixed(2) : 0,
        mode: movement.activeMode,
        speed: +movement.speed.toFixed(2),
        inHabitat: habitat.canBe(x, z),
        canPass: habitat.canPass?.(x, z) ?? '-',
        stranded: movement.stranded,
        blocked: movement.blocked,
        gait: creature.swim?.gait ?? '-',
      });
    }
    rows.sort((a, b) => a.distance - b.distance);
    console.log(
      `showCreaturesNear(${radius}) — ${rows.length} creatures. A swimmer is ` +
        `stranded where the water is shallower than its bedMargin plus ` +
        `surfaceMargin; outside its habitat it still swims where it can pass.`
    );
    console.table(rows);
  };

  (window as any).goToCreature = (index = 0, creature?: string) => {
    const spawner = getCreatureSpawner();
    const player = spawner?.gameData?.player;
    if (!spawner || !player?.capsuleBody) {
      console.log(
        'goToCreature(index = 0, creature?) — no spawner is mounted. Creatures spawn ' +
          'only in game, on a level with terrain.'
      );
      return;
    }
    const target = spawner
      .liveCreatures()
      .filter((c) => !creature || c.name === creature)[index];
    if (!target) {
      console.log(
        `goToCreature(${index}${creature ? `, '${creature}'` : ''}) — no ` +
          `live creature at that index.`
      );
      return;
    }

    const { x, y, z } = target.transform.position;
    const ground =
      spawner.gameData!.renderer.terrainRenderer.sampleHeight(
        x,
        z - VISIT_DISTANCE
      ) ?? y;
    player.grounded = false;
    player.verticalVelocity = 0;
    player.stopMotion();
    player.capsuleBody.setTranslation(
      { x, y: Math.max(ground, y) + 2, z: z - VISIT_DISTANCE },
      true
    );
    console.log(
      `goToCreature(${index}) — ${target.id} at ${x.toFixed(1)}, ` +
        `${y.toFixed(1)}, ${z.toFixed(1)}. Look along +Z.`
    );
  };
}
