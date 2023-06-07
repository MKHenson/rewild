import { AttributeType, CHUNK_SIZE, NoiseSimplex, create2DArray, INoise, NoisePerlin } from "rewild-common";
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
  noise1: INoise;
  noise2: INoise;

  constructor() {
    this.noise1 = new NoiseSimplex(100);
    this.noise2 = new NoisePerlin(100);
  }

  initialize(renderer: Renderer): void {
    this.renderer = renderer;
    this.terrainPipeline = pipelineManager.getAsset("terrain");
    this.terrainPtr = wasm.createTerrain("Terrain");
    this.createTerrainChunk();
  }

  // Initialize the canvas and render the noise
  createNoiseMap(map: f32[][]) {
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const width = map.length;
    const height = map[0].length;

    canvas.width = width;
    canvas.height = height;

    let noise: i32[] = new Array(width * height);

    for (let y: f32 = 0; y < height; y++) {
      for (let x: f32 = 0; x < width; x++) {
        let value = map[x][y];
        value = Mathf.floor(value * 255); // Convert noise value to grayscale
        noise[y * width + x] = value;
      }
    }

    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);

    for (let i = 0; i < noise.length; i++) {
      const value = noise[i];
      imageData.data[i * 4] = value; // Red component
      imageData.data[i * 4 + 1] = value; // Green component
      imageData.data[i * 4 + 2] = value; // Blue component
      imageData.data[i * 4 + 3] = 255; // Alpha component
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  public generateNoiseMap(mapWidth: u16, mapHeight: u16, scale: f32 = 0.01, noise: INoise): f32[][] {
    const noiseMap: f32[][] = create2DArray(mapWidth, mapHeight);

    for (let y: i32 = 0; y < mapHeight; y++) {
      for (let x: i32 = 0; x < mapHeight; x++) {
        const sampleX = f32(x) / f32(mapWidth) / scale;
        const sampleY = f32(y) / f32(mapHeight) / scale;

        const value = noise.get2D(sampleX, sampleY);
        noiseMap[x][y] = value;
      }
    }

    return noiseMap;
  }

  createTerrainChunk() {
    const geometry = new Geometry();

    const canvas1 = this.createNoiseMap(this.generateNoiseMap(CHUNK_SIZE, CHUNK_SIZE, 0.05, this.noise1));
    document.body.appendChild(canvas1);

    const canvas2 = this.createNoiseMap(this.generateNoiseMap(CHUNK_SIZE, CHUNK_SIZE, 0.05, this.noise2));
    document.body.appendChild(canvas2);

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
