import { getLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { Container, StateMachine } from 'rewild-routing';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { Mesh, Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';
import { ITemplateItems, Vector3 } from 'models';

/** Loads game files and assets and sends the created objects to wasm */

export async function loadInitialLevels(player: Player, renderer: Renderer) {
  const templateLibrary = (await fetch('/templates/template-library.json').then(
    (res) => res.json()
  )) as ITemplateItems;

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
        let object: Asset3D | null = null;
        const preset = actor.properties.find((p) => p.type === 'templateId');

        const template = preset
          ? templateLibrary.assets.find((asset) => asset.name === preset.value)
          : null;

        if (template?.resource.geometryId && template?.resource.materialId) {
          const mesh = new Mesh(
            renderer.geometryManager.get(template?.resource.geometryId),
            renderer.materialManager.get(template?.resource.materialId)
          );
          mesh.transform.name = actor.name || 'Mesh';
          object = new Asset3D(mesh.transform);
          const initialPos =
            (actor.properties.find((p) => p.type === 'position')
              ?.value as Vector3) || null;
          if (initialPos)
            object.initialPosition.set(
              initialPos[0],
              initialPos[1],
              initialPos[2]
            );
        }
        // else if (
        //   actorLoaderPreset === 'directional-light' ||
        //   actorLoaderPreset === 'ambient-light'
        // ) {
        //   if (actorLoaderPreset === 'directional-light') {
        //     object = new DirectionalLight(actor.name);
        //   } else if (actorLoaderPreset === 'ambient-light') {
        //     object = new AmbientLight(actor.name);
        //   }
        // }

        // Add the object to the container if it exists
        if (object) {
          levelRouter.addAsset(object);
        }
      }
    }
  }

  return stateMachine;
}
