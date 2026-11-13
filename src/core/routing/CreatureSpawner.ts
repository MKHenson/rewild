import { IResource } from 'models';
import { Vector3 } from 'rewild-common';
import { resolveClimatePreset } from 'rewild-renderer';
import { BiomeProbe } from 'rewild-renderer/lib/renderers/terrain/BiomeProbe';
import { Container, IAsset } from 'rewild-routing';
import { getCreaturePreset } from '../creatures/CreaturePresets';
import { CreatureWorld, Habitat, createHabitat } from '../creatures/Habitat';
import { DEFAULT_ROAM, HerdHome } from '../creatures/HerdHome';
import {
  PlannedCreature,
  PlannedGroup,
  SpawnBiome,
  SpawnSite,
  planChunkSpawns,
} from '../creatures/SpawnPlanner';
import { TemplateLoader } from '../TemplateLoader';
import { Creature, createCreatureWorld } from './Creature';
import { StateMachineData } from './Types';

/** Metres from the player inside which a group spawns, measured to its origin. */
export const SPAWN_RADIUS = 120;
/** Metres from the player past which a group despawns, measured to its origin. */
export const DESPAWN_RADIUS = 150;
/** Spawned creatures alive at once, at most. */
export const MAX_SPAWNED = 100;
/** Seconds between spawn checks. */
const CHECK_INTERVAL = 0.5;
/** Chunk coordinates are packed into one number in this range either side of 0. */
const CHUNK_KEY_RANGE = 32768;

const UP = new Vector3(0, 1, 0);

let active: CreatureSpawner | null = null;

/** The spawner of the running game, if one is mounted. */
export function getCreatureSpawner(): CreatureSpawner | null {
  return active;
}

/** One planned group, as `describe` reports it. */
export interface SpawnGroupReport {
  chunk: string;
  creature: string;
  members: number;
  state: string;
  distance: number;
  /** m/s the home drifts. */
  drift: number;
  /** Metres the home has drifted from where the group spawned. */
  drifted: number;
}

/** One live creature, as `describe` reports it. */
export interface SpawnedCreatureReport {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Ground height under it, or null where none is loaded. */
  ground: number | null;
  distance: number;
  visible: boolean;
  mode: string | null;
}

/** What a spawner is doing, for the debug console. */
export interface SpawnerReport {
  climate: string;
  player: [number, number, number] | null;
  playerChunk: string | null;
  heightsLoaded: boolean;
  biomes: Record<string, number>;
  live: number;
  chunks: number;
  groups: SpawnGroupReport[];
  creatures: SpawnedCreatureReport[];
}

type GroupState = 'idle' | 'loading' | 'live' | 'failed';

class SpawnGroup {
  state: GroupState = 'idle';
  creatures: Creature[] = [];
  /** Bumped on each spawn and despawn, so a late load can tell it is stale. */
  generation = 0;
  readonly home: HerdHome;

  constructor(readonly plan: PlannedGroup, habitat: Habitat) {
    const { rule } = plan;
    this.home = new HerdHome(
      plan.homeX,
      plan.homeZ,
      plan.heading,
      rule.drift ?? 0,
      rule.roam ?? DEFAULT_ROAM,
      habitat
    );
  }
}

function chunkKey(cx: number, cy: number): number {
  return (cx + CHUNK_KEY_RANGE) * CHUNK_KEY_RANGE * 2 + (cy + CHUNK_KEY_RANGE);
}

/**
 * Spawns the creatures the biomes' rules plan near the player, and despawns
 * them when the player leaves. Each chunk plans its groups once, when its
 * heights load, so it gives the same creatures each time. A group's animals
 * share its home, which drifts when the rule says so.
 */
export class CreatureSpawner extends Container implements SpawnSite {
  private data: StateMachineData | null = null;
  private world: CreatureWorld | null = null;
  private biomes: readonly SpawnBiome[] = [];
  private readonly chunks = new Map<number, SpawnGroup[]>();
  private readonly live: SpawnGroup[] = [];
  private readonly habitats = new Map<string, Habitat | null>();
  private readonly probe = new BiomeProbe();
  private readonly player = new Vector3();
  private timer = 0;
  /** Creatures live or loading. */
  private count = 0;
  private nearX0 = 0;
  private nearX1 = 0;
  private nearZ0 = 0;
  private nearZ1 = 0;
  private span = 0;

  constructor(
    private readonly templateLoader: TemplateLoader,
    parentObject3D: IAsset
  ) {
    super('Spawned creatures', true, parentObject3D);
  }

  mount(): void {
    super.mount();
    const data = this.stateMachine?.data as StateMachineData | undefined;
    if (!data?.gameManager) return;
    this.data = data;
    this.world = createCreatureWorld(data);
    this.biomes = resolveClimatePreset(
      data.renderer.terrainRenderer.climatePreset
    ).biomes;
    this.timer = 0;
    active = this;
  }

  unMount(): void {
    if (active === this) active = null;
    this.clear();
    this.data = null;
    this.world = null;
    super.unMount();
  }

  dispose(): void {
    if (active === this) active = null;
    this.clear();
    super.dispose();
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.world) {
      this.timer -= delta;
      if (this.timer <= 0) {
        this.timer = CHECK_INTERVAL;
        this.refresh();
      }
      this.driftHomes(delta);
    }
    super.onUpdate(delta, total);
  }

  biomeWeight(name: string, x: number, z: number): number {
    if (!this.data) return 0;
    this.probe.probe(this.data.renderer.terrainRenderer, x, z);
    return this.probe.weightOf(name);
  }

  habitat(creature: string): Habitat | null {
    let habitat = this.habitats.get(creature);
    if (habitat !== undefined) return habitat;
    if (!this.world) return null;

    const template = this.templateLoader.templateLibrary.assets.find(
      (asset) => asset.name === creature
    );
    habitat = null;
    if (!template?.preset)
      console.warn(`Spawn rule creature '${creature}' is not a creature.`);
    else
      habitat = createHabitat(
        getCreaturePreset(template.preset).habitat,
        this.world
      );
    this.habitats.set(creature, habitat);
    return habitat;
  }

  describe(): SpawnerReport {
    const { world, data, player } = this;
    const terrain = data?.renderer.terrainRenderer ?? null;
    const report: SpawnerReport = {
      climate: terrain?.climatePreset ?? '',
      player: null,
      playerChunk: null,
      heightsLoaded: false,
      biomes: {},
      live: this.count,
      chunks: this.chunks.size,
      groups: [],
      creatures: [],
    };
    if (!world || !terrain || !world.playerPosition(player)) return report;

    report.player = [player.x, player.y, player.z];
    report.playerChunk = terrain.chunkIdAt(player.x, player.z);
    report.heightsLoaded = world.sampleHeight(player.x, player.z) !== null;
    const count = this.probe.probe(terrain, player.x, player.z);
    const climate = this.probe.climate!;
    for (let i = 0; i < count; i++)
      report.biomes[climate.biomes[this.probe.biomes![i]].name] =
        this.probe.weights![i];

    this.chunks.forEach((groups, key) => {
      const cx = Math.floor(key / (CHUNK_KEY_RANGE * 2)) - CHUNK_KEY_RANGE;
      const cy = (key % (CHUNK_KEY_RANGE * 2)) - CHUNK_KEY_RANGE;
      for (const group of groups)
        report.groups.push({
          chunk: `${cx},${cy}`,
          creature: group.plan.rule.creature,
          members: group.plan.members.length,
          state: group.state,
          distance: Math.round(
            Math.hypot(group.plan.homeX - player.x, group.plan.homeZ - player.z)
          ),
          drift: group.home.speed,
          drifted:
            Math.round(
              Math.hypot(
                group.home.x - group.home.originX,
                group.home.z - group.home.originZ
              ) * 10
            ) / 10,
        });
    });
    report.groups.sort((a, b) => a.distance - b.distance);

    for (const creature of this.liveCreatures()) {
      const { position } = creature.transform;
      report.creatures.push({
        id: creature.id,
        x: Math.round(position.x * 10) / 10,
        y: Math.round(position.y * 10) / 10,
        z: Math.round(position.z * 10) / 10,
        ground: world.sampleHeight(position.x, position.z),
        distance: Math.round(position.distanceTo(player)),
        visible: creature.skinned.visible,
        mode: creature.movement?.activeMode ?? null,
      });
    }
    return report;
  }

  /** Every live creature, nearest the player first. */
  liveCreatures(): Creature[] {
    const creatures: Creature[] = [];
    for (const group of this.live) creatures.push(...group.creatures);
    if (this.world?.playerPosition(this.player))
      creatures.sort(
        (a, b) =>
          a.transform.position.distanceTo(this.player) -
          b.transform.position.distanceTo(this.player)
      );
    return creatures;
  }

  /** The game data the spawner reads, while mounted. */
  get gameData(): StateMachineData | null {
    return this.data;
  }

  private refresh(): void {
    const { world, data, player } = this;
    if (!world || !data || !world.playerPosition(player)) return;
    const span = data.renderer.terrainRenderer.chunkSize;
    if (!span) return;

    this.span = span;
    this.nearX0 = Math.round((player.x - DESPAWN_RADIUS) / span);
    this.nearX1 = Math.round((player.x + DESPAWN_RADIUS) / span);
    this.nearZ0 = Math.round((player.z - DESPAWN_RADIUS) / span);
    this.nearZ1 = Math.round((player.z + DESPAWN_RADIUS) / span);
    this.chunks.forEach(this.dropIfFar);

    for (let cx = this.nearX0; cx <= this.nearX1; cx++)
      for (let cy = this.nearZ0; cy <= this.nearZ1; cy++) {
        const groups = this.chunkGroups(cx, cy);
        if (!groups) continue;
        for (let i = 0; i < groups.length; i++) this.updateGroup(groups[i]);
      }
  }

  private readonly dropIfFar = (groups: SpawnGroup[], key: number): void => {
    const cx = Math.floor(key / (CHUNK_KEY_RANGE * 2)) - CHUNK_KEY_RANGE;
    const cy = (key % (CHUNK_KEY_RANGE * 2)) - CHUNK_KEY_RANGE;
    if (
      cx >= this.nearX0 &&
      cx <= this.nearX1 &&
      cy >= this.nearZ0 &&
      cy <= this.nearZ1
    )
      return;
    for (let i = 0; i < groups.length; i++) this.despawn(groups[i]);
    this.chunks.delete(key);
  };

  /** The chunk's groups, planned on first use. Null until its heights load. */
  private chunkGroups(cx: number, cy: number): SpawnGroup[] | null {
    const key = chunkKey(cx, cy);
    const cached = this.chunks.get(key);
    if (cached) return cached;

    const { world, data, span } = this;
    if (!world || !data) return null;
    if (world.sampleHeight(cx * span, cy * span) === null) return null;

    const plans = planChunkSpawns(
      data.renderer.terrainRenderer.seed,
      cx,
      cy,
      span,
      this.biomes,
      this,
      world
    );
    const groups = plans.map(
      (plan) => new SpawnGroup(plan, this.habitat(plan.rule.creature)!)
    );
    this.chunks.set(key, groups);
    return groups;
  }

  private updateGroup(group: SpawnGroup): void {
    const { plan } = group;
    const distance = Math.hypot(
      plan.homeX - this.player.x,
      plan.homeZ - this.player.z
    );
    if (group.state === 'idle') {
      if (
        distance < SPAWN_RADIUS &&
        this.count + plan.members.length <= MAX_SPAWNED
      )
        this.spawn(group);
    } else if (group.state !== 'failed' && distance > DESPAWN_RADIUS)
      this.despawn(group);
  }

  private spawn(group: SpawnGroup): void {
    const { members, rule } = group.plan;
    const generation = ++group.generation;
    group.state = 'loading';
    this.count += members.length;

    Promise.all(members.map((m) => this.createCreature(rule.creature, m)))
      .then((creatures) => {
        if (group.generation !== generation || !this.world) {
          for (const creature of creatures) creature.dispose();
          return;
        }
        group.creatures = creatures;
        group.state = 'live';
        this.live.push(group);
        const { home } = group;
        for (const creature of creatures) {
          this.addAsset(creature);
          this.parentObject3D.add(creature);
          creature.load();
          creature.mount();
          if (creature.movement) {
            creature.movement.homeX = home.x;
            creature.movement.homeZ = home.z;
          }
        }
      })
      .catch((err) => {
        console.error(err);
        if (group.generation !== generation) return;
        group.state = 'failed';
        this.count -= members.length;
      });
  }

  private despawn(group: SpawnGroup): void {
    if (group.state !== 'loading' && group.state !== 'live') return;
    group.generation++;
    this.count -= group.plan.members.length;

    if (group.state === 'live') {
      const { creatures } = group;
      for (let i = 0; i < creatures.length; i++) {
        const creature = creatures[i];
        this.parentObject3D.remove(creature);
        this.removeAsset(creature);
        creature.dispose();
      }
      creatures.length = 0;
      const index = this.live.indexOf(group);
      if (index > -1) {
        this.live[index] = this.live[this.live.length - 1];
        this.live.pop();
      }
    }
    group.state = 'idle';
  }

  private driftHomes(dt: number): void {
    const { live } = this;
    for (let i = 0; i < live.length; i++) {
      const { home, creatures } = live[i];
      if (home.speed <= 0) continue;
      home.update(dt);
      for (let c = 0; c < creatures.length; c++) {
        const movement = creatures[c].movement;
        if (!movement) continue;
        movement.homeX = home.x;
        movement.homeZ = home.z;
      }
    }
  }

  private async createCreature(
    template: string,
    planned: PlannedCreature
  ): Promise<Creature> {
    const { data } = this;
    if (!data) throw new Error('The spawner is not mounted.');
    const resource: IResource = {
      id: planned.id,
      name: template,
      type: 'actor',
      templateId: template,
    };
    const asset = await this.templateLoader.createResource(
      resource,
      data.renderer,
      data.gameManager
    );
    if (!(asset instanceof Creature)) {
      (asset as IAsset).dispose?.();
      throw new Error(`Spawn rule creature '${template}' is not a creature.`);
    }
    asset.initialPosition.set(planned.x, planned.y, planned.z);
    asset.initialRotation.setFromAxisAngle(UP, planned.heading);
    return asset;
  }

  private clear(): void {
    this.chunks.forEach(this.despawnAll);
    this.chunks.clear();
    this.habitats.clear();
  }

  private readonly despawnAll = (groups: SpawnGroup[]): void => {
    for (let i = 0; i < groups.length; i++) this.despawn(groups[i]);
  };
}
