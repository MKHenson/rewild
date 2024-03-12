import { CHUNK_SIZE } from 'rewild-common';
import { IBindable, Terrain } from 'rewild-wasmtime';
import { Renderer } from '../Renderer';
import { Geometry } from '../geometry/Geometry';
import { TerrainPipeline } from '../pipelines/terrain-pipeline/TerrainPipeline';
import { meshManager } from '../MeshManager';
import { pipelineManager } from './PipelineManager';
import { NoiseMap } from '../terrain/NoiseMap';
import { textureManager } from './TextureManager';
import { CanvasTexture } from 'src/core/renderer/textures/CanvasTexture';
import { MeshGenerator } from '../terrain/MeshGenerator';

export class TerrainManager implements IBindable {
  geometry: Geometry;
  terrainPipeline: TerrainPipeline;
  renderer: Renderer;
  noiseMap: NoiseMap;
  activeTerrains: Terrain[];

  constructor() {
    this.noiseMap = new NoiseMap(CHUNK_SIZE, 0.6, 4, 0.5, 2, [1.4, 0], 100);
    this.activeTerrains = [];
  }

  createBinding() {
    return {
      createChunk: this.createTerrainChunk.bind(this),
    };
  }

  async initialize(renderer: Renderer): Promise<void> {
    this.renderer = renderer;
    this.terrainPipeline = pipelineManager.getAsset('terrain');
  }

  addTerrain() {
    const newTerrain = new Terrain();
    this.activeTerrains.push(newTerrain);
    return newTerrain;
  }

  removeTerrain(terrain: Terrain) {
    const index = this.activeTerrains.indexOf(terrain);
    if (index !== -1) {
      this.activeTerrains.splice(index, 1);

      while (terrain.children.length) terrain.remove(terrain.children[0]);
    }
  }

  async createTerrainChunk(terrainPtr: any, chunkPtr: any) {
    const terrain = this.activeTerrains.find(
      (t) => t.transform.valueOf() === terrainPtr.valueOf()
    );

    if (!terrain) {
      return;
    }

    const canvas = this.noiseMap.generate().createCanvas();
    const texture = textureManager.addTexture(
      new CanvasTexture('terrain1', canvas, this.renderer.device)
    );
    await texture.load(this.renderer.device);

    this.terrainPipeline.defines = {
      diffuseMap: texture,
    };

    const meshData = MeshGenerator.generateTerrainMesh(this.noiseMap.noiseMap);
    const chunk = meshData.createMesh(this.renderer, chunkPtr);

    terrain.add(chunk);
    meshManager.addMesh(chunk);

    return;
  }
}

export const terrainManager = new TerrainManager();
