import { AttributeType, CHUNK_SIZE } from "rewild-common";
import { Renderer } from "../Renderer";
import { Geometry } from "../geometry/Geometry";
import { TerrainPipeline } from "../../core/pipelines/terrain-pipeline/TerrainPipeline";
import { Mesh } from "../Mesh";
import { meshManager } from "../MeshManager";
import { pipelineManager } from "./PipelineManager";
import { wasm } from "src/core/WasmManager";

export class TerrainManager {
  geometry: Geometry;
  terrainPipeline: TerrainPipeline;
  renderer: Renderer;
  terrainPtr: any;

  constructor() {}

  initialize(renderer: Renderer): void {
    this.renderer = renderer;
    this.terrainPipeline = pipelineManager.getAsset("terrain");
    this.terrainPtr = wasm.createTerrain("Terrain");
    this.createTerrainChunk();
  }

  createTerrainChunk() {
    const geometry = new Geometry();

    const vecData: Array<f32[]> = new Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z: i32 = 0; z < CHUNK_SIZE; z++) {
      for (let x: i32 = 0; x < CHUNK_SIZE; x++) {
        vecData[CHUNK_SIZE * z + x] = [x, 0, z];
      }
    }

    const data = new Float32Array(vecData.flat());
    geometry.setAttribute(AttributeType.POSITION, data, 3);

    // const geometry = new PlaneGeometry(100, 100);
    geometry.build(this.renderer);

    const mesh = new Mesh(geometry, this.terrainPipeline, this.renderer, `TerrainChunk`);
    wasm.addChild(this.terrainPtr, mesh.transform as any);

    return meshManager.addMesh(mesh);
  }
}

export const terrainManager = new TerrainManager();
