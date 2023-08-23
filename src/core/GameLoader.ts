import { wasm, PhysicsComponent } from "rewild-wasmtime";
import { pipelineManager } from "../renderer/AssetManagers/PipelineManager";
import { Mesh } from "../renderer/Mesh";
import { ContainerTypes } from "rewild-common";
import { meshManager } from "../renderer/MeshManager";
import { Geometry } from "../renderer/geometry/Geometry";
import { Renderer } from "../renderer/Renderer";
import { getLevel } from "../api/levels";
import { getProjects } from "../api/projects";
import { geometryManager } from "../renderer/AssetManagers/GeometryManager";
import { Vector3 } from "models";
// import { terrainManager } from "src/renderer/AssetManagers/TerrainManager";

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

    const physicsComponent = new PhysicsComponent();
    physicsComponent.mass = 30;
    physicsComponent.positionY = 20;
    const ball = this.createMesh(sphere, "simple", "ball");
    ball.addComponent(physicsComponent);

    wasm.addAsset(containerLvl1Ptr as any, this.createMesh(box, "skybox", "skybox").transform as any);
    wasm.addAsset(containerLvl1Ptr as any, ball.transform as any);

    // for (let i = 0; i < 20; i++)
    //   wasm.addAsset(containerLvl1Ptr as any, this.createMesh(box, "concrete", `building-${i}`).transform as any);
    // for (let i = 0; i < 20; i++)
    //   wasm.addAsset(containerLvl1Ptr as any, this.createMesh(box, "crate", `crate-${i}`).transform as any);

    const containerTestPtr = wasm.createContainer(ContainerTypes.TestLevel, ContainerTypes.TestLevel, true);
    wasm.addAsset(containerTestPtr as any, this.createMesh(box, "skybox", "skybox").transform as any);

    const containerMainMenuPtr = wasm.createContainer(ContainerTypes.MainMenu, ContainerTypes.MainMenu, true);
    const containerEditorPtr = wasm.createContainer(ContainerTypes.Editor, ContainerTypes.Editor, true);

    wasm.addAsset(containerMainMenuPtr as any, this.createMesh(sphere, "earth").transform as any);
    wasm.addAsset(containerMainMenuPtr as any, this.createMesh(box, "stars", "skybox").transform as any);

    wasm.addNodeToRuntime(containerLvl1Ptr, false);
    wasm.addNodeToRuntime(containerMainMenuPtr, true);
    wasm.addNodeToRuntime(containerEditorPtr, false);
    wasm.addNodeToRuntime(containerTestPtr, false);
  }

  async loadInitialLevels() {
    const projects = await getProjects(true);
    const startupLevels = await Promise.all(projects.map((project) => getLevel(project.id)));

    const box = geometryManager.getAsset("box");
    const sphere = geometryManager.getAsset("sphere");

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
          const geometry = actor.properties.find((prop) => prop.type === "geometry")?.value;
          const pipeline = actor.properties.find((prop) => prop.type === "pipeline")?.value;

          if (geometry && pipeline) {
            const newMesh = this.createMesh(geometry === "sphere" ? sphere : box, pipeline as string, actor.name);

            const position = actor.properties.find((prop) => prop.type === "position")?.value as Vector3;
            wasm.setPosition(newMesh.transform as any, position[0], position[1], position[2]);

            const size = actor.properties.find((prop) => prop.type === "size")?.value;
            const speed = actor.properties.find((prop) => prop.type === "speed")?.value;

            if (size && speed) {
              const planetComponent = wasm.createPlanetComponent(size as number, speed as number);
              wasm.addComponent(newMesh.transform as any, planetComponent as any);
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
