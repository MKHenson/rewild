import { Box3, Vector2, Vector3 } from 'rewild-common';
import { TerrainPass } from '../../materials/TerrainPass';
import { Mesh } from '../../core/Mesh';
import { LOFInfo, TerrainRenderer } from './TerrainRenderer';
import { Renderer } from '../..';
import { IComponent, Transform } from '../../core/Transform';
import { DataTexture } from '../../textures/DataTexture';
import { TextureProperties } from '../../textures/Texture';
import { Geometry } from '../../geometry/Geometry';
import { Raycaster, Intersection } from '../../core/Raycaster';

const temp: Vector3 = new Vector3();

export class TerrainChunk implements IComponent {
  position: Vector2;
  _visible: boolean = false;
  bounds: Box3;
  transform: Transform;
  detailLevels: LOFInfo[];
  lodMesh: LODMesh[];
  chunkSize: i32;

  constructor(
    coord: Vector2,
    size: i32,
    chunkSize: i32,
    detailLevels: LOFInfo[]
  ) {
    this.position = coord.multiplyScalar(size);
    this.chunkSize = chunkSize;
    this.detailLevels = detailLevels;

    this.lodMesh = new Array<LODMesh>(detailLevels.length);

    this.transform = new Transform();
    this.transform.component = this;
    this.transform.position.set(this.position.x, 0, this.position.y);

    for (let i = 0; i < detailLevels.length; i++) {
      this.lodMesh[i] = new LODMesh(
        detailLevels[i].lod,
        this.transform,
        this.position,
        chunkSize
      );
    }

    this.bounds = new Box3();
    this.bounds.setFromCenterAndSize(
      this.transform.position,
      temp.set(size, 0, size)
    );
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]) {
    for (const chunk of this.lodMesh) {
      if (chunk.mesh && chunk.mesh.visible) {
        // const mesh = chunk.mesh;
        // mesh.raycast(raycaster, intersects);
      }
    }
  }

  dispose() {
    for (const lod of this.lodMesh) {
      if (lod.mesh) {
        lod.mesh.geometry.dispose();
        lod.mesh.material.dispose();
      }
    }
  }

  updateTerrainChunk(
    viewerPos: Vector3,
    terrainRenderer: TerrainRenderer,
    renderer: Renderer
  ) {
    const viewerDistFromNearestEdge =
      this.transform.position.distanceTo(viewerPos);
    const isVisible = viewerDistFromNearestEdge <= terrainRenderer.maxViewDst;
    this.visible = isVisible;

    for (const lod of this.lodMesh) {
      if (lod.mesh) {
        lod.mesh.visible = false;
      }
    }

    if (isVisible) {
      let lodIndex = 0;

      for (let i = 0; i < this.detailLevels.length - 1; i++) {
        const detailLevel = this.detailLevels[i];
        if (viewerDistFromNearestEdge > detailLevel.visibleDstThreshold) {
          lodIndex = i + 1;
        } else {
          break;
        }
      }

      const lodMesh = this.lodMesh[lodIndex];
      if (lodMesh.mesh) {
        lodMesh.mesh.visible = true;
      } else if (!lodMesh.hasRequestedMesh) {
        lodMesh.requestMesh(renderer);
      }
    }
  }

  set visible(visible: boolean) {
    if (visible) {
      this._visible = true;
      this.transform.visible = true;
    } else {
      this._visible = false;
      this.transform.visible = false;
    }
  }

  get visible() {
    return this._visible;
  }
}

export class LODMesh {
  mesh: Mesh;
  lod: i32;
  position: Vector2;
  hasRequestedMesh: boolean;
  transform: Transform;
  chunkSize: i32;

  constructor(
    lod: i32,
    transform: Transform,
    position: Vector2,
    chunkSize: i32
  ) {
    this.lod = lod;
    this.hasRequestedMesh = false;
    this.transform = transform;
    this.chunkSize = chunkSize;
    this.position = position;
  }

  requestMesh(renderer: Renderer) {
    if (this.hasRequestedMesh) {
      return;
    }
    this.hasRequestedMesh = true;
    this.load(this.chunkSize, this.lod, renderer);
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

      const terrainTexture = renderer.textureManager.addTexture(
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
      geometry.computeNormals();

      terrainTexture.load(renderer);
      geometry.build(renderer.device);

      const terrainPass = new TerrainPass();
      terrainPass.terrainUniforms.sampler =
        renderer.samplerManager.get('linear-clamped');
      terrainPass.terrainUniforms.texture = terrainTexture.gpuTexture;
      terrainPass.terrainUniforms.albedoTexture = renderer.textureManager.get(
        'rocky-mountain-texture-seamless'
      ).gpuTexture;

      this.mesh = new Mesh(geometry, terrainPass);
      this.transform.addChild(this.mesh.transform);

      workerTest.terminate();
    };
  }
}
