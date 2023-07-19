import { CHUNK_SIZE } from "rewild-common";
import { IBindable, wasm } from "rewild-wasmtime";
import { Renderer } from "../Renderer";
import { Geometry } from "../geometry/Geometry";
import { TerrainPipeline } from "../../core/pipelines/terrain-pipeline/TerrainPipeline";
import { meshManager } from "../MeshManager";
import { pipelineManager } from "./PipelineManager";
import { NoiseMap } from "../terrain/NoiseMap";
import { textureManager } from "./TextureManager";
import { CanvasTexture } from "src/core/textures/CanvasTexture";
import { MeshGenerator } from "../terrain/MeshGenerator";

export class TerrainManager implements IBindable {
  geometry: Geometry;
  terrainPipeline: TerrainPipeline;
  renderer: Renderer;
  noiseMap: NoiseMap;

  constructor() {
    this.noiseMap = new NoiseMap(CHUNK_SIZE, 0.6, 4, 0.5, 2, [1.4, 0], 100);
  }

  createBinding() {
    return {
      createChunk: this.createTerrainChunk.bind(this),
    };
  }

  async initialize(renderer: Renderer): Promise<void> {
    this.renderer = renderer;
    this.terrainPipeline = pipelineManager.getAsset("terrain");
  }

  async createTerrainChunk(terrainPtr: any) {
    const canvas = this.noiseMap.generate().createCanvas();
    const texture = textureManager.addTexture(new CanvasTexture("terrain1", canvas, this.renderer.device));
    await texture.load(this.renderer.device);

    this.terrainPipeline.defines = {
      diffuseMap: texture,
    };

    const meshData = MeshGenerator.generateTerrainMesh(this.noiseMap.noiseMap);
    const mesh = meshData.createMesh(this.renderer);
    wasm.addChild(terrainPtr, mesh.transform as any);
    return meshManager.addMesh(mesh);
  }
}

export const terrainManager = new TerrainManager();
