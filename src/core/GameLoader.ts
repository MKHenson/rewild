import { StateMachine } from 'rewild-routing';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { DEFAULT_CLIMATE_PRESET, Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';
import { TemplateLoader } from './TemplateLoader';
import { ContainerWithState } from './routing/ContainerWithState';
import { CreatureSpawner } from './routing/CreatureSpawner';
import { StateMachineData } from './routing/Types';
import { GameManager } from './GameManager';
import { setTerrainProviders } from './TerrainProviders';
import { GameSource } from './GameSource';
import { applyAtmosphere, AtmosphereProps } from './AtmosphereSync';

/**
 * Points the terrain at a level. Settings that changed drop the chunks; call
 * `terrainRenderer.reload()` after it to drop them whatever changed.
 */
export function applyLevelTerrain(renderer: Renderer, source: GameSource) {
  const { level, read } = source;
  const terrain = level?.sceneGraph?.terrain;
  if (terrain) {
    renderer.terrainRenderer.seed = terrain.seed;
    renderer.terrainRenderer.climatePreset =
      terrain.climatePreset ?? DEFAULT_CLIMATE_PRESET;
    renderer.terrainRenderer.seaLevel = terrain.seaLevel ?? 0;
  }
  renderer.terrainRenderer.enabled = level ? level.hasTerrain : true;
  setTerrainProviders(renderer, read);
}

/** Sets the sky to a level's atmosphere, or to `fallback` for a level with none. */
export function applyLevelAtmosphere(
  renderer: Renderer,
  source: GameSource,
  fallback: AtmosphereProps
) {
  applyAtmosphere(renderer, source.level?.sceneGraph?.atmosphere ?? fallback);
}

/** Creates a level's actors in a new state machine. A source without a level gives a bare world. */
export async function loadLevel(
  source: GameSource,
  templateLoader: TemplateLoader,
  player: Player,
  gameManager: GameManager
) {
  const renderer: Renderer = gameManager.renderer;
  const { level, readLevel } = source;
  templateLoader.levelReader = readLevel;

  const stateMachine = new StateMachine<StateMachineData>({
    renderer,
    player,
    gameManager,
  });

  const levelRouter = new InGameLevel(
    level?.name ?? 'Untitled Level',
    new Asset3D(renderer.scene)
  );
  stateMachine.addNode(player, true);
  stateMachine.addNode(levelRouter, true);

  try {
    for (const container of level?.sceneGraph?.containers ?? []) {
      const containerRouter = new ContainerWithState(
        container,
        levelRouter.parentObject3D
      );
      levelRouter.addChild(containerRouter);

      for (const actor of container.actors) {
        const object = (await templateLoader.createResource(
          actor,
          renderer,
          gameManager
        )) as Asset3D;

        containerRouter.addAsset(object);
      }
    }
  } catch (err) {
    stateMachine.detachNode(player);
    stateMachine.dispose();
    throw err;
  }

  if (renderer.terrainRenderer.enabled)
    levelRouter.addChild(
      new CreatureSpawner(templateLoader, levelRouter.parentObject3D)
    );

  return stateMachine;
}
