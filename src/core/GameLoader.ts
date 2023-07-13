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
import { terrainManager } from "src/renderer/AssetManagers/TerrainManager";

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

    const ball = this.createMesh(sphere, "simple", "ball");
    const ballPhysics = wasm.createPhysicsComponent(wasm.createBodyBall(1, 20));
    const properties = wasm.getFloat32Array(wasm.getPhysicsComponentProperties(ballPhysics as any));
    properties[9] = 30; // mass
    properties[1] = 20; // pos y
    wasm.addComponent(ball.transform as any, ballPhysics);

    wasm.addAsset(containerLvl1Ptr, terrainManager.terrainPtr);
    wasm.addAsset(containerLvl1Ptr, this.createMesh(box, "skybox", "skybox").transform as any);
    wasm.addAsset(containerLvl1Ptr, ball.transform as any);

    for (let i = 0; i < 20; i++)
      wasm.addAsset(containerLvl1Ptr, this.createMesh(box, "concrete", `building-${i}`).transform as any);
    for (let i = 0; i < 20; i++)
      wasm.addAsset(containerLvl1Ptr, this.createMesh(box, "crate", `crate-${i}`).transform as any);

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

    const box = geometryManager.getAsset("box");
    const sphere = geometryManager.getAsset("sphere");

    for (const level of startupLevels) {
      for (const container of level.containers) {
        const containerPtr = wasm.createContainer(container.name, ContainerTypes.Default);
        this.loadedContainerPtrs.push(containerPtr);

        for (const actor of container.actors) {
          if (actor.geometry && actor.pipeline) {
            const geometry = actor.properties.find((prop) => prop.name === "Geometry")?.value;
            const size = actor.properties.find((prop) => prop.name === "Size")?.value;
            const speed = actor.properties.find((prop) => prop.name === "Speed")?.value;
            const newMesh = this.createMesh(geometry === "sphere" ? sphere : box, actor.pipeline);
            const planetComponent = wasm.createPlanetComponent(size as number, speed as number);
            wasm.addComponent(newMesh.transform as any, planetComponent as any);
            wasm.addAsset(containerPtr, newMesh.transform as any);
          }
        }

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
