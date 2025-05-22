import { Box3, Vector2, Vector3 } from 'rewild-common';
import { DiffusePass } from '../../materials/DiffusePass';
import { Mesh } from '../../core/Mesh';
import { samplerManager } from '../../textures/SamplerManager';
import { LOFInfo, TerrainRenderer } from './TerrainRenderer';
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
  detailLevels: LOFInfo[];
  lodMesh: LODMesh[];
  previousLodIndex: i32;

  constructor(coord: Vector2, size: i32, detailLevels: LOFInfo[]) {
    this.position = coord.multiplyScalar(size);
    this.previousLodIndex = -1;
    this.detailLevels = detailLevels;

    this.lodMesh = new Array<LODMesh>(detailLevels.length);
    for (let i = 0; i < detailLevels.length; i++) {
      this.lodMesh[i] = new LODMesh(detailLevels[i].lod);
    }

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

    workerTest.postMessage({
      type: 'start',
      chunkSize,
      lod,
      position: this.position,
    });

    workerTest.onmessage = (event) => {
      const { texture, vertices, uvs, indices } = event.data;

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
      diffuse.diffuse.sampler = samplerManager.get('linear-clamped');
      diffuse.diffuse.texture = terrainTexture.gpuTexture;

      this.mesh = new Mesh(geometry, diffuse);
      this.transform.addChild(this.mesh.transform);
      this.visible = this._visible;

      workerTest.terminate();
    };
  }

  updateTerrainChunk(viewerPos: Vector3, terrainRenderer: TerrainRenderer) {
    const viewerDistFromNearestEdge = this.bounds.distanceToPoint(viewerPos);
    const isVisible = viewerDistFromNearestEdge <= terrainRenderer.maxViewDst;
    this.visible = isVisible;

    if (isVisible) {
      let lodIndex = 0;

      for (let i = 0; i < this.detailLevels.length - 1; i++) {
        const detailLevel = this.detailLevels[i];
        if (viewerDistFromNearestEdge > detailLevel.visibleDstThreshold) {
          lodIndex = i + 1;
        } else {
          break;
        }

        if (this.previousLodIndex !== lodIndex) {
          const lodMesh = this.lodMesh[lodIndex];
          if (lodMesh.hasMesh) {
            // Draw this mesh lodMesh
            lodMesh.mesh;
            this.previousLodIndex = lodIndex;
          } else if (!lodMesh.hasRequestedMesh) {
            lodMesh.requestMesh();
          }
        }
      }
    }
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

export class LODMesh {
  mesh: Mesh;
  lod: i32;
  hasRequestedMesh: boolean;
  hasMesh: boolean;

  constructor(lod: i32) {
    this.lod = lod;
    this.hasRequestedMesh = false;
    this.hasMesh = false;
  }

  requestMesh() {
    if (this.hasRequestedMesh) {
      return;
    }
    this.hasRequestedMesh = true;
  }
}
