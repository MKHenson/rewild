import {
  DESPAWN_RADIUS,
  SPAWN_RADIUS,
  getCreatureSpawner,
} from '../routing/CreatureSpawner';

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
        `heights load. A group spawns when its home is within ${SPAWN_RADIUS}m ` +
        `and despawns past ${DESPAWN_RADIUS}m, so idle groups further than ` +
        `${SPAWN_RADIUS}m are out of range.`
    );
    console.log('Biome weights at the player:', report.biomes);
    console.log('Planned groups, nearest first:');
    console.table(report.groups.slice(0, limit));
    console.log(
      'Live creatures, nearest first. y should match ground for land creatures:'
    );
    console.table(report.creatures.slice(0, limit));
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
