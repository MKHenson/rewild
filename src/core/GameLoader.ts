import {
  Object3D,
  DirectionalLight,
  AmbientLight,
  wasm,
  Player,
} from 'rewild-wasmtime';
import { pipelineManager } from './renderer/AssetManagers/PipelineManager';
import { Mesh } from './renderer/Mesh';
import { ContainerTypes } from 'rewild-common';
import { meshManager } from './renderer/MeshManager';
import { Geometry } from './renderer/geometry/Geometry';
import { Renderer } from './renderer/Renderer';
import { getLevel } from '../api/levels';
import { getProjects } from '../api/projects';
import { StateMachine } from 'rewild-routing';
import { geometryManager } from './renderer/AssetManagers/GeometryManager';
import { LoaderPresetType, LoaderPresets } from './loader-utils/LoaderPresets';

/** Loads game files and assets and sends the created objects to wasm */
export class GameLoader {
  renderer: Renderer;
  loadedPtrs: any[];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.loadedPtrs = [];
  }

  async loadSystemContainers() {
    const containerLvl1Ptr = wasm.createContainer(
      ContainerTypes.Level1,
      ContainerTypes.Level1,
      true
    );
    const box = geometryManager.getAsset('box');
    const sphere = geometryManager.getAsset('sphere');

    const containerMainMenuPtr = wasm.createContainer(
      ContainerTypes.MainMenu,
      ContainerTypes.MainMenu,
      true
    );
    const containerEditorPtr = wasm.createContainer(
      ContainerTypes.Editor,
      ContainerTypes.Editor,
      true
    );

    wasm.addAsset(
      containerMainMenuPtr as any,
      this.createMesh(sphere, 'earth').transform as any
    );
    wasm.addAsset(
      containerMainMenuPtr as any,
      this.createMesh(box, 'stars', 'skybox').transform as any
    );

    wasm.addNodeToRuntime(containerLvl1Ptr, false);
    wasm.addNodeToRuntime(containerMainMenuPtr, true);
    wasm.addNodeToRuntime(containerEditorPtr, false);
  }

  async loadInitialLevels(player: Player) {
    const projects = await getProjects(true);
    const startupLevels = await Promise.all(
      projects.map((project) => getLevel(project.id))
    );

    const stateMachine = new StateMachine();

    for (const level of startupLevels) {
      const levelPtr = wasm.createLevel(level.name);

      // Add player to level
      wasm.addAsset(levelPtr as any, player.transformPtr as any);

      this.loadedPtrs.push(levelPtr);
      wasm.addNodeToRuntime(levelPtr, true);

      for (const container of level.containers) {
        const containerPtr = wasm.createContainer(
          container.name,
          ContainerTypes.Default,
          container.activeOnStartup
        );
        wasm.addChildNode(levelPtr, containerPtr);

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
            object = this.createMesh(
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
            wasm.addAsset(containerPtr as any, object.transform as any);

            // If the actor has a preset
            if (
              actorLoaderPreset &&
              LoaderPresets[actorLoaderPreset as LoaderPresetType]
            ) {
              LoaderPresets[actorLoaderPreset as LoaderPresetType](
                actor,
                object
              );
            }
          }
        }
      }
    }

    return stateMachine;
  }

  unloadInitialLevels() {
    for (const ptr of this.loadedPtrs) {
      wasm.removeNodeFromRuntime(ptr);
    }

    this.loadedPtrs.length = 0;
  }

  createMesh(geometry: Geometry, pipelineName: string, name?: string) {
    const pipeline = pipelineManager.getAsset(pipelineName)!;
    const mesh = new Mesh(geometry, pipeline, this.renderer, name);
    return meshManager.addMesh(mesh);
  }
}
