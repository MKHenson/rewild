import {
  Object3D,
  DirectionalLight,
  AmbientLight,
  wasm,
  Player,
} from 'rewild-wasmtime';
import { pipelineManager } from './renderer/AssetManagers/PipelineManager';
import { Mesh } from './renderer/Mesh';
import { meshManager } from './renderer/MeshManager';
import { Geometry } from './renderer/geometry/Geometry';
import { Renderer } from './renderer/Renderer';
import { getLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { Container, StateMachine } from 'rewild-routing';
import { geometryManager } from './renderer/AssetManagers/GeometryManager';
import { LoaderPresetType, LoaderPresets } from './loader-utils/LoaderPresets';
import { InGameLevel } from './routing/InGameLevel';

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
      new Object3D('Scene', wasm.getScene()),
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
        let object: Object3D | null = null;
        const actorLoaderPreset = actor.actorLoaderPreset;

        // If the actor has a geometry and pipeline then it must be a mesh
        const geometry = actor.properties.find(
          (prop) => prop.type === 'geometry'
        )?.value as string;
        const pipeline = actor.properties.find(
          (prop) => prop.type === 'pipeline'
        )?.value as string;

        if (geometry && pipeline) {
          object = createMesh(
            renderer,
            geometryManager.getAsset(geometry),
            pipeline,
            actor.name
          );
        } else if (
          actorLoaderPreset === 'directional-light' ||
          actorLoaderPreset === 'ambient-light'
        ) {
          if (actorLoaderPreset === 'directional-light') {
            object = new DirectionalLight(actor.name);
          } else if (actorLoaderPreset === 'ambient-light') {
            object = new AmbientLight(actor.name);
          }
        }

        // Add the object to the container if it exists
        if (object) {
          levelRouter.addAsset(object);

          // If the actor has a preset
          if (
            actorLoaderPreset &&
            LoaderPresets[actorLoaderPreset as LoaderPresetType]
          ) {
            LoaderPresets[actorLoaderPreset as LoaderPresetType](actor, object);
          }
        }
      }
    }
  }

  return stateMachine;
}

function createMesh(
  renderer: Renderer,
  geometry: Geometry,
  pipelineName: string,
  name?: string
) {
  const pipeline = pipelineManager.getAsset(pipelineName)!;
  const mesh = new Mesh(geometry, pipeline, renderer, name);
  return meshManager.addMesh(mesh);
}
