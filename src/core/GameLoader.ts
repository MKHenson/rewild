import { getLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { StateMachine } from 'rewild-routing';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';
import { TemplateLoader } from './TemplateLoader';
import { ContainerWithState } from './routing/ContainerWithState';

/** Loads game files and assets and sends the created objects to wasm */

export async function loadInitialLevels(player: Player, renderer: Renderer) {
  const templateLoader = new TemplateLoader();
  await templateLoader.load();

  const project = (await getProjects(true)).at(0);
  if (!project) return null;

  const level = await getLevel(project.id);
  const stateMachine = new StateMachine();

  // Load the sky properties
  const skyRenderer = renderer.atmosphere.skyRenderer;
  skyRenderer.cloudiness = project.sceneGraph.atmosphere.cloudiness as f32;
  skyRenderer.foginess = project.sceneGraph.atmosphere.foginess as f32;
  skyRenderer.windiness = project.sceneGraph.atmosphere.windiness as f32;
  skyRenderer.elevation = project.sceneGraph.atmosphere.elevation as f32;
  skyRenderer.dayNightCycle = project.sceneGraph.atmosphere
    .dayNightCycle as boolean;

  const levelRouter = new InGameLevel(
    level.name,
    new Asset3D(renderer.scene),
    false,
    player
  );
  stateMachine.addNode(levelRouter, true);

  for (const container of level.containers) {
    const containerRouter = new ContainerWithState(
      container,
      levelRouter.parentObject3D
    );
    levelRouter.addChild(containerRouter);

    for (const actor of container.actors) {
      let object = (await templateLoader.createResource(
        actor,
        renderer
      )) as Asset3D;

      containerRouter.addAsset(object);
    }
  }

  return stateMachine;
}
