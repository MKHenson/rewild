import { Box3, Vector2, Vector3 } from 'rewild-common';
import { DiffusePass } from '../../materials/DiffusePass';
import { Mesh } from '../../core/Mesh';
import { samplerManager } from '../../textures/SamplerManager';
import { TerrainRenderer } from './TerrainRenderer';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { textureManager } from '../../textures/TextureManager';
import { DataTexture } from '../../textures/DataTexture';
import { TextureProperties } from '../../textures/Texture';
import { Geometry } from '../../geometry/Geometry';

const temp: Vector3 = new Vector3();

export class TerrainChunk {
  position: Vector2;
  mesh: Mesh;
  _visible: boolean = false;
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
    const workerTest = new Worker('/terrainWorker.js', {
      type: 'module',
    });

    workerTest.postMessage({ type: 'start', chunkSize, lod });

    workerTest.onmessage = (event) => {
      const { texture, vertices, uvs, indices } = event.data;
      console.log(
        'Received data from worker:',
        texture,
        vertices,
        uvs,
        indices
      );

      const terrainTexture = textureManager.addTexture(
        new DataTexture(
          new TextureProperties('terrain1', false),
          texture,
          chunkSize,
          chunkSize
        )
      );

      const geometry = new Geometry();
      geometry.vertices = vertices;
      geometry.uvs = uvs;
      geometry.indices = indices;

      terrainTexture.load(renderer.device);
      geometry.build(renderer.device);

      const diffuse = new DiffusePass();
      diffuse.diffuse.sampler = samplerManager.get('linear');
      diffuse.diffuse.texture = terrainTexture.gpuTexture;

      this.mesh = new Mesh(geometry, diffuse);
      this.transform.addChild(this.mesh.transform);
      this.visible = false;

      workerTest.terminate();
    };
  }

  updateTerrainChunk(viewerPos: Vector3, terrainRenderer: TerrainRenderer) {
    const viewerDistFromNearestEdge = this.bounds.distanceToPoint(viewerPos);
    const isVisible = viewerDistFromNearestEdge <= terrainRenderer.maxViewDst;
    this.visible = isVisible;
  }

  set visible(visible: boolean) {
    if (visible) {
      this._visible = true;
      if (this.mesh) {
        this.mesh.visible = true;
      }
    } else {
      this._visible = false;
      if (this.mesh) {
        this.mesh.visible = false;
      }
    }
  }

  get visible() {
    return this._visible;
  }
}
