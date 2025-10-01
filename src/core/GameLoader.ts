import { getLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { Container, StateMachine } from 'rewild-routing';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';
import { TemplateLoader } from './TemplateLoader';

/** Loads game files and assets and sends the created objects to wasm */

export async function loadInitialLevels(player: Player, renderer: Renderer) {
  const templateLoader = new TemplateLoader();
  await templateLoader.load();

  const projects = await getProjects(true);
  const startupLevels = await Promise.all(
    projects.map((project) => getLevel(project.id))
  );

  const stateMachine = new StateMachine();

  for (const level of startupLevels) {
    const levelRouter = new InGameLevel(
      level.name,
      new Asset3D(renderer.scene),
      false,
      player
    );
    stateMachine.addNode(levelRouter, true);

    for (const container of level.containers) {
      const containerRouter = new Container(
        container.name,
        container.activeOnStartup,
        levelRouter.parentObject3D
      );
      levelRouter.addChild(containerRouter);

      for (const actor of container.actors) {
        let object = (await templateLoader.createResource(
          actor,
          renderer
        )) as Asset3D;

        levelRouter.addAsset(object);
      }
    }
  }

  return stateMachine;
}
