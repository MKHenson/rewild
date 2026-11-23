import { createWaterQuerySample } from 'rewild-renderer';
import { Creature } from '../routing/Creature';
import {
  SCHOOL_BUDGET,
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

  (window as any).showSchools = (limit = 20) => {
    const spawner = getCreatureSpawner();
    if (!spawner) {
      console.log(
        'showSchools(limit = 20) — no spawner is mounted. Schools swim only ' +
          'in game, on a level with terrain.'
      );
      return;
    }
    const report = spawner.describe();
    const members = report.schools.reduce((n, s) => n + s.members, 0);
    console.log(
      `showSchools() — ${report.schools.length} schools live, ${members} ` +
        `members. Spawned schools hold ${report.schoolMembers} of the ` +
        `${SCHOOL_BUDGET} member budget; placed schools sit outside it. ` +
        `x, y, z is the school's home; evade means members felt the player.`
    );
    console.table(report.schools.slice(0, limit));
  };

  (window as any).goToSchool = (index = 0) => {
    const spawner = getCreatureSpawner();
    const player = spawner?.gameData?.player;
    if (!spawner || !player?.capsuleBody) {
      console.log(
        'goToSchool(index = 0) — no spawner is mounted. Schools swim only in ' +
          'game, on a level with terrain.'
      );
      return;
    }
    const target = spawner.liveSchools()[index];
    if (!target) {
      console.log(`goToSchool(${index}) — no live school at that index.`);
      return;
    }
    const school = target.school!;
    const { home, count } = school;
    if (count === 0) {
      console.log(
        `goToSchool(${index}) — ${target.id} has no members (state ` +
          `${school.state}). Its home had no water to swim in when it spawned.`
      );
      return;
    }

    let cx = 0;
    let cy = 0;
    let cz = 0;
    let y0 = Infinity;
    let y1 = -Infinity;
    let reach = 0;
    for (let i = 0; i < count; i++) {
      cx += school.px[i] / count;
      cy += school.py[i] / count;
      cz += school.pz[i] / count;
      y0 = Math.min(y0, school.py[i]);
      y1 = Math.max(y1, school.py[i]);
    }
    for (let i = 0; i < count; i++)
      reach = Math.max(
        reach,
        Math.hypot(school.px[i] - cx, school.pz[i] - cz)
      );

    const terrain = spawner.gameData!.renderer.terrainRenderer;
    const water = createWaterQuerySample();
    const wet = terrain.waterQuery.sample(cx, cz, water) && water.wet;
    const standZ = cz - VISIT_DISTANCE * 0.75;
    const ground = terrain.sampleHeight(cx, standZ) ?? cy;
    player.grounded = false;
    player.verticalVelocity = 0;
    player.stopMotion();
    player.capsuleBody.setTranslation(
      { x: cx, y: Math.max(ground + 1, cy), z: standZ },
      true
    );
    console.log(
      `goToSchool(${index}) — ${target.id} (${target.presetName}), state ` +
        `${school.state}. Moved you 3m short of its members, looking along +Z.`
    );
    console.table({
      members: count,
      drawn: target.drawn,
      bodyLength: +school.length.toFixed(3),
      centre: `${cx.toFixed(1)}, ${cy.toFixed(2)}, ${cz.toFixed(1)}`,
      memberY: `${y0.toFixed(2)} to ${y1.toFixed(2)}`,
      widest: +reach.toFixed(1),
      waterLevel: wet ? +water.level.toFixed(2) : 'dry',
      waterDepth: wet ? +water.depth.toFixed(2) : 0,
      homeFromCentre: +Math.hypot(home.x - cx, home.z - cz).toFixed(1),
    });
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
