import { wasm } from "rewild-wasmtime";
import { pipelineManager } from "../renderer/AssetManagers/PipelineManager";
import { Mesh } from "../renderer/Mesh";
import { ContainerTypes } from "rewild-common";
import { meshManager } from "../renderer/MeshManager";
import { Geometry } from "../renderer/geometry/Geometry";
import { Renderer } from "../renderer/Renderer";
import { getLevel } from "../api/levels";
import { getProjects } from "../api/projects";
import { geometryManager } from "../renderer/AssetManagers/GeometryManager";
import { LoaderPresetType, LoaderPresets } from "./loader-utils/LoaderPresets";

/** Loads game files and assets and sends the created objects to wasm */
export class GameLoader {
  renderer: Renderer;
  loadedPtrs: any[];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.loadedPtrs = [];
  }

  async loadSystemContainers() {
    const containerLvl1Ptr = wasm.createContainer(ContainerTypes.Level1, ContainerTypes.Level1, true);
    const box = geometryManager.getAsset("box");
    const sphere = geometryManager.getAsset("sphere");

    const containerMainMenuPtr = wasm.createContainer(ContainerTypes.MainMenu, ContainerTypes.MainMenu, true);
    const containerEditorPtr = wasm.createContainer(ContainerTypes.Editor, ContainerTypes.Editor, true);

    wasm.addAsset(containerMainMenuPtr as any, this.createMesh(sphere, "earth").transform as any);
    wasm.addAsset(containerMainMenuPtr as any, this.createMesh(box, "stars", "skybox").transform as any);

    wasm.addNodeToRuntime(containerLvl1Ptr, false);
    wasm.addNodeToRuntime(containerMainMenuPtr, true);
    wasm.addNodeToRuntime(containerEditorPtr, false);
  }

  async loadInitialLevels() {
    const projects = await getProjects(true);
    const startupLevels = await Promise.all(projects.map((project) => getLevel(project.id)));

    for (const level of startupLevels) {
      const levelPtr = wasm.createLevel(level.name);

      // Add player to level
      wasm.addAsset(levelPtr as any, this.renderer.player.transformPtr as any);

      this.loadedPtrs.push(levelPtr);
      wasm.addNodeToRuntime(levelPtr, true);

      for (const container of level.containers) {
        const containerPtr = wasm.createContainer(container.name, ContainerTypes.Default, container.activeOnStartup);
        wasm.addChildNode(levelPtr, containerPtr);

        for (const actor of container.actors) {
          const geometry = actor.properties.find((prop) => prop.type === "geometry")?.value as string;
          const pipeline = actor.properties.find((prop) => prop.type === "pipeline")?.value as string;

          if (geometry && pipeline) {
            const newMesh = this.createMesh(geometryManager.getAsset(geometry), pipeline, actor.name);

            const actorLoaderPreset = actor.actorLoaderPreset;

            // If the actor has a rigid body type, add it to the mesh
            if (actorLoaderPreset && LoaderPresets[actorLoaderPreset as LoaderPresetType]) {
              const component = LoaderPresets[actorLoaderPreset as LoaderPresetType](actor);
              newMesh.addComponent(component);
            }

            wasm.addAsset(containerPtr as any, newMesh.transform as any);
          }
        }
      }
    }
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
