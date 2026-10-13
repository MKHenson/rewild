import { StateMachine } from 'rewild-routing';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { DEFAULT_CLIMATE_PRESET, Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';
import { TemplateLoader } from './TemplateLoader';
import { ContainerWithState } from './routing/ContainerWithState';
import { StateMachineData } from './routing/Types';
import { GameManager } from './GameManager';
import { setTerrainProviders } from './TerrainProviders';
import { loadGameSource } from './GameSource';
import { registerDebugCommands } from './debug';
import { applyAtmosphere } from './AtmosphereSync';

/** Loads game files and assets and sends the created objects to wasm */

export async function loadInitialLevels(
  projectId: string,
  player: Player,
  gameManager: GameManager
) {
  const templateLoader = new TemplateLoader();
  const renderer: Renderer = gameManager.renderer;
  await templateLoader.load();

  // A project without a start level falls back to a bare world: default sky,
  // the project's terrain, no actors. The Player places itself on the surface.
  const { project, level, read } = await loadGameSource(projectId);

  const stateMachine = new StateMachine<StateMachineData>({
    renderer,
    player,
    gameManager,
  });

  if (project.sceneGraph.terrain) {
    renderer.terrainRenderer.seed = project.sceneGraph.terrain.seed;
    renderer.terrainRenderer.climatePreset =
      project.sceneGraph.terrain.climatePreset ?? DEFAULT_CLIMATE_PRESET;
    renderer.terrainRenderer.seaLevel =
      project.sceneGraph.terrain.seaLevel ?? 0;
  }

  applyAtmosphere(renderer, project.sceneGraph.atmosphere);

  registerDebugCommands(renderer, project);

  renderer.terrainRenderer.enabled = level ? level.hasTerrain : true;
  setTerrainProviders(renderer, read);

  const levelRouter = new InGameLevel(
    level?.name ?? 'Untitled Level',
    new Asset3D(renderer.scene),
    false,
    player
  );
  stateMachine.addNode(player, true);
  stateMachine.addNode(levelRouter, true);

  for (const container of level?.containers ?? []) {
    const containerRouter = new ContainerWithState(
      container,
      levelRouter.parentObject3D
    );
    levelRouter.addChild(containerRouter);

    for (const actor of container.actors) {
      let object = (await templateLoader.createResource(
        actor,
        gameManager.renderer,
        gameManager
      )) as Asset3D;

      containerRouter.addAsset(object);
    }
  }

  return stateMachine;
}
