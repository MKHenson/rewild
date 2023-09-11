import { IBindable, wasm } from "rewild-wasmtime";
import { Renderer } from "../Renderer";
import { Geometry } from "../geometry/Geometry";
import { TerrainPipeline } from "../../core/pipelines/terrain-pipeline/TerrainPipeline";
import { meshManager } from "../MeshManager";
import { pipelineManager } from "./PipelineManager";
import { NoiseMap } from "../terrain/NoiseMap";
import { Mesh } from "../Mesh";
import { geometryManager } from "./GeometryManager";

export class SkyboxManager implements IBindable {
  geometry: Geometry;
  terrainPipeline: TerrainPipeline;
  renderer: Renderer;
  noiseMap: NoiseMap;

  constructor() {}

  createBinding() {
    return {
      initializeSkybox: this.initializeSkybox.bind(this),
    };
  }

  async initialize(renderer: Renderer): Promise<void> {
    this.renderer = renderer;
    this.terrainPipeline = pipelineManager.getAsset("terrain");
  }

  async initializeSkybox(skyboxPtr: any) {
    const box = geometryManager.getAsset("box");
    const pipeline = pipelineManager.getAsset("skybox")!;
    const mesh = new Mesh(box, pipeline, this.renderer, "skybox");

    wasm.addChild(skyboxPtr, mesh.transform as any);
    return meshManager.addMesh(mesh);
  }
}

export const skyboxManager = new SkyboxManager();
