import { wasm } from "./WasmManager";
import { pipelineManager } from "../renderer/AssetManagers/PipelineManager";
import { Mesh } from "../renderer/Mesh";
import { ContainerTypes } from "rewild-common";
import { meshManager } from "../renderer/MeshManager";
import { Geometry } from "../renderer/geometry/Geometry";
import { Renderer } from "../renderer/Renderer";
import { getLevel } from "../api/levels";
import { getProjects } from "../api/projects";
import { geometryManager } from "../renderer/AssetManagers/GeometryManager";

/** Loads game files and assets and sends the created objects to wasm */
export class GameLoader {
  renderer: Renderer;
  loadedContainerPtrs: any[];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.loadedContainerPtrs = [];
  }

  async loadSystemContainers() {
    const containerLvl1Ptr = wasm.createContainer(ContainerTypes.Level1, ContainerTypes.Level1);
    const box = geometryManager.getAsset("box");
    const sphere = geometryManager.getAsset("sphere");
    const plane = geometryManager.getAsset("plane");

    wasm.addAsset(containerLvl1Ptr, this.createMesh(box, "skybox", "skybox").transform as any);
    wasm.addAsset(containerLvl1Ptr, this.createMesh(sphere, "simple", "ball").transform as any);

    for (let i = 0; i < 20; i++)
      wasm.addAsset(containerLvl1Ptr, this.createMesh(box, "concrete", `building-${i}`).transform as any);
    for (let i = 0; i < 20; i++)
      wasm.addAsset(containerLvl1Ptr, this.createMesh(box, "crate", `crate-${i}`).transform as any);

    wasm.addAsset(containerLvl1Ptr, this.createMesh(plane, "coastal-floor", "floor").transform as any);

    const containerTestPtr = wasm.createContainer(ContainerTypes.TestLevel, ContainerTypes.TestLevel);
    wasm.addAsset(containerTestPtr, this.createMesh(box, "skybox", "skybox").transform as any);

    const containerMainMenuPtr = wasm.createContainer(ContainerTypes.MainMenu, ContainerTypes.MainMenu);
    const containerEditorPtr = wasm.createContainer(ContainerTypes.Editor, ContainerTypes.Editor);

    wasm.addAsset(containerMainMenuPtr, this.createMesh(sphere, "earth").transform as any);
    wasm.addAsset(containerMainMenuPtr, this.createMesh(box, "stars", "skybox").transform as any);

    wasm.addAsset(containerLvl1Ptr, this.renderer.player.transformPtr as any);

    wasm.addContainer(containerLvl1Ptr, false);
    wasm.addContainer(containerMainMenuPtr, true);
    wasm.addContainer(containerEditorPtr, false);
    wasm.addContainer(containerTestPtr, false);
  }

  async loadInitialLevels() {
    const projects = await getProjects(true);
    const startupLevels = await Promise.all(projects.map((project) => getLevel(project.id)));

    for (const level of startupLevels) {
      for (const container of level.containers) {
        const containerPtr = wasm.createContainer(container.name, ContainerTypes.Default);
        this.loadedContainerPtrs.push(containerPtr);

        wasm.addContainer(containerPtr, container.activeOnStartup);
      }
    }
  }

  unloadInitialLevels() {
    for (const containerPtr of this.loadedContainerPtrs) {
      wasm.removeContainer(containerPtr);
    }

    this.loadedContainerPtrs.length = 0;
  }

  createMesh(geometry: Geometry, pipelineName: string, name?: string) {
    const pipeline = pipelineManager.getAsset(pipelineName)!;
    const mesh = new Mesh(geometry, pipeline, this.renderer, name);
    return meshManager.addMesh(mesh);
  }
}
