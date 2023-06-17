import { AttributeType, CHUNK_SIZE } from "rewild-common";
import { Renderer } from "../Renderer";
import { Geometry } from "../geometry/Geometry";
import { TerrainPipeline } from "../../core/pipelines/terrain-pipeline/TerrainPipeline";
import { Mesh } from "../Mesh";
import { meshManager } from "../MeshManager";
import { pipelineManager } from "./PipelineManager";
import { wasm } from "src/core/WasmManager";
import { NoiseMap } from "../terrain/NoiseMap";
import { textureManager } from "./TextureManager";
import { CanvasTexture } from "src/core/textures/CanvasTexture";

export class TerrainManager {
  geometry: Geometry;
  terrainPipeline: TerrainPipeline;
  renderer: Renderer;
  terrainPtr: any;
  noiseMap: NoiseMap;

  constructor() {
    this.noiseMap = new NoiseMap(CHUNK_SIZE, 0.6, 4, 0.5, 2, [1.4, 0], 100);
  }

  async initialize(renderer: Renderer): Promise<void> {
    this.renderer = renderer;
    this.terrainPipeline = pipelineManager.getAsset("terrain");
    this.terrainPtr = wasm.createTerrain("Terrain");

    const canvas = this.noiseMap.generate().createCanvas();
    document.body.appendChild(canvas);

    const texture = textureManager.addTexture(new CanvasTexture("terrain1", canvas, this.renderer.device));
    await texture.load(this.renderer.device);

    this.createTerrainChunk();
  }

  createTerrainChunk() {
    const geometry = new Geometry();
    const texture = textureManager.getAsset("terrain1");

    this.terrainPipeline.defines = {
      diffuseMap: texture,
    };

    let vecData: Array<f32[]> = new Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z: i32 = 0; z < CHUNK_SIZE; z++) {
      for (let x: i32 = 0; x < CHUNK_SIZE; x++) {
        vecData[CHUNK_SIZE * z + x] = [x, 0, z];
      }
    }

    // Create a simple triagle
    const vecDataFlat = [
      [0, 0, 50],
      [50, 0, 0],
      [0, 0, 0],

      [50, 0, 0],
      [0, 0, 50],
      [50, 0, 50],
    ];

    const uvDataFlat = [
      [0, 0],
      [1, 1],
      [0, 1],

      [1, 1],
      [0, 0],
      [1, 0],
    ];

    const data = new Float32Array(vecDataFlat.flat());
    geometry.setAttribute(AttributeType.POSITION, data, 3);

    const uvData = new Float32Array(uvDataFlat.flat());
    geometry.setAttribute(AttributeType.UV, uvData, 2);

    // const geometry = new PlaneGeometry(100, 100);
    geometry.build(this.renderer);

    const mesh = new Mesh(geometry, this.terrainPipeline, this.renderer, `TerrainChunk`);
    wasm.addChild(this.terrainPtr, mesh.transform as any);

    return meshManager.addMesh(mesh);
  }
}

export const terrainManager = new TerrainManager();
