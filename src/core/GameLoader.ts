import { findLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { StateMachine } from 'rewild-routing';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { DEFAULT_CLIMATE_PRESET, Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';
import { TemplateLoader } from './TemplateLoader';
import { ContainerWithState } from './routing/ContainerWithState';
import { StateMachineData } from './routing/Types';
import { GameManager } from './GameManager';
import { createChunkSnapshotProvider } from '../database/chunk-snapshots';
import { createBiomeMaskProvider } from '../database/biome-masks';
import { registerDebugCommands } from './debug';

/** Loads game files and assets and sends the created objects to wasm */

export async function loadInitialLevels(
  player: Player,
  gameManager: GameManager
) {
  const templateLoader = new TemplateLoader();
  const renderer: Renderer = gameManager.renderer;
  await templateLoader.load();

  // A fresh install — or a startup project that hasn't had a level authored
  // yet — has nothing to load. Rather than refusing to start, fall back to a
  // bare world: default sky, default-seed terrain, no actors. There is still
  // somewhere to stand, and the Player places itself on the surface.
  const project = (await getProjects(true)).at(0) ?? null;
  const level = project ? await findLevel(project.id) : null;

  const stateMachine = new StateMachine<StateMachineData>({
    renderer,
    player,
    gameManager,
  });

  if (project) {
    // Load the sky properties
    const skyRenderer = renderer.sky.skyRenderer;
    skyRenderer.cloudiness = project.sceneGraph.atmosphere.cloudiness as f32;
    skyRenderer.foginess = project.sceneGraph.atmosphere.foginess as f32;
    skyRenderer.windiness = project.sceneGraph.atmosphere.windiness as f32;
    skyRenderer.precipitation = project.sceneGraph.atmosphere
      .precipitation as f32;
    skyRenderer.temperature = project.sceneGraph.atmosphere.temperature as f32;
    skyRenderer.elevation = project.sceneGraph.atmosphere.elevation as f32;
    skyRenderer.dayNightCycle = project.sceneGraph.atmosphere
      .dayNightCycle as boolean;

    if (project.sceneGraph.terrain) {
      renderer.terrainRenderer.seed = project.sceneGraph.terrain.seed;
      renderer.terrainRenderer.climatePreset =
        project.sceneGraph.terrain.climatePreset ?? DEFAULT_CLIMATE_PRESET;
    }

    registerDebugCommands(renderer, project);
  }

  renderer.terrainRenderer.enabled = level ? level.hasTerrain : true;
  renderer.terrainRenderer.snapshotProvider = level?.id
    ? createChunkSnapshotProvider(level.id)
    : null;
  renderer.terrainRenderer.biomeMaskProvider = level?.id
    ? createBiomeMaskProvider(level.id)
    : null;

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
