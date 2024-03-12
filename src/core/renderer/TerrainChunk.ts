import { wasm } from 'rewild-wasmtime/lib/WasmManager';
import { Mesh } from './Mesh';
import { Geometry } from './geometry/Geometry';
import { Pipeline } from './pipelines/Pipeline';
import { Renderer } from './Renderer';

export class TerrainChunk extends Mesh {
  heightValues: Float32Array;

  constructor(
    chunkPtr: any,
    mapSize: i32,
    heights: f32[],
    geometry: Geometry,
    pipeline: Pipeline<any>,
    renderer: Renderer,
    name: string = 'TerrainChunk'
  ) {
    super(geometry, pipeline, renderer, name, chunkPtr);

    this.heightValues = wasm.getFloat32Array(
      wasm.generateTerrainChunkHeightmap(chunkPtr, mapSize)
    );

    this.heightValues.set(heights);

    wasm.generateChunkPhysicsBody(chunkPtr, geometry.bufferGeometry as any);
  }
}
