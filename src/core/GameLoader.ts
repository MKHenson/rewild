import { getLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { Container, StateMachine } from 'rewild-routing';
// import { LoaderPresetType, LoaderPresets } from './loader-utils/LoaderPresets';
import { InGameLevel } from './routing/InGameLevel';
import { Asset3D } from './routing/Asset3D';
import { Geometry, Mesh, Renderer } from 'rewild-renderer';
import { Player } from './routing/Player';

/** Loads game files and assets and sends the created objects to wasm */

export async function loadInitialLevels(player: Player, renderer: Renderer) {
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
        // const actorLoaderPreset = actor.actorLoaderPreset;

        // If the actor has a geometry and pipeline then it must be a mesh
        const geometry = actor.properties.find(
          (prop) => prop.type === 'geometry'
        )?.value as string;
        const materialId = actor.properties.find(
          (prop) => prop.type === 'material'
        )?.value as string;

        if (geometry && materialId) {
          object = createMesh(
            renderer,
            renderer.geometryManager.get(geometry),
            materialId,
            actor.name
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

          // // If the actor has a preset
          // if (
          //   actorLoaderPreset &&
          //   LoaderPresets[actorLoaderPreset as LoaderPresetType]
          // ) {
          //   LoaderPresets[actorLoaderPreset as LoaderPresetType](actor, object);
          // }
        }
      }
    }
  }

  return stateMachine;
}

function createMesh(
  renderer: Renderer,
  geometry: Geometry,
  materialId: string,
  name?: string
) {
  const pipeline = renderer.materialManager.get(materialId)!;
  const mesh = new Mesh(geometry, pipeline);
  mesh.transform.name = name || 'Mesh';
  const asset = new Asset3D(mesh.transform);
  return asset;
}
