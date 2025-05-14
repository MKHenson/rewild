import { Box3, Vector2, Vector3 } from 'rewild-common';
import { DiffusePass } from '../../materials/DiffusePass';
import { Mesh } from '../../core/Mesh';
import { samplerManager } from '../../textures/SamplerManager';
import { TerrainRenderer } from './TerrainRenderer';
import { generateNoiseMap } from './Noise';
import { noiseToTexture } from './NoiseToTexture';
import { generateTerrainMesh } from './MeshGenerator';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';

const temp: Vector3 = new Vector3();

export class TerrainChunk {
  position: Vector2;
  mesh: Mesh;
  bounds: Box3;
  transform: Transform;

  constructor(coord: Vector2, size: i32) {
    this.position = coord.multiplyScalar(size);

    this.transform = new Transform();
    this.transform.position.set(this.position.x, 0, this.position.y);

    this.bounds = new Box3();
    this.bounds.setFromCenterAndSize(
      this.transform.position,
      temp.set(size, 0, size)
    );
  }

  async load(chunkSize: i32, lod: i32, renderer: Renderer) {
    const noise = generateNoiseMap(chunkSize, chunkSize, 24);
    const texture = noiseToTexture(chunkSize, chunkSize, noise);
    const meshData = generateTerrainMesh(noise, chunkSize, chunkSize, lod);

    const geometry = meshData.toGeometry();

    texture.load(renderer.device);
    geometry.build(renderer.device);

    const diffuse = new DiffusePass();
    diffuse.diffuse.sampler = samplerManager.get('linear');
    diffuse.diffuse.texture = texture.gpuTexture;

    this.mesh = new Mesh(geometry, diffuse);
    // this.mesh.transform.rotateX(-Math.PI / 2);
    this.transform.addChild(this.mesh.transform);

    this.setVisible(false);
  }

  updateTerrainChunk(viewerPos: Vector3, terrainRenderer: TerrainRenderer) {
    const viewerDistFromNearestEdge = this.bounds.distanceToPoint(viewerPos);
    const isVisible = viewerDistFromNearestEdge <= terrainRenderer.maxViewDst;
    this.setVisible(isVisible);
  }

  setVisible(visible: boolean) {
    if (visible) {
      this.mesh.visible = true;
    } else {
      this.mesh.visible = false;
    }
  }
}
