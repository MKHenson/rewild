import { Renderer } from '../../Renderer';
import { Geometry } from '../../geometry/Geometry';
import { DataTexture } from '../../textures/DataTexture';
import { ITexture } from '../../textures/ITexture';
import { TextureProperties } from '../../textures/Texture';
import { textureManager } from '../../textures/TextureManager';
import { generateNoiseMap } from './Noise';
import { Camera } from '../../core/Camera';
import { generateTerrainMesh } from './MeshGenerator';
import { Mesh } from '../../core/Mesh';
import { TerrainPass } from '../../materials/TerrainPass';
import { Box3, Vector2, Vector3 } from 'rewild-common';
import { PlaneGeometryFactory } from '../../geometry/PlaneGeometryFactory';
import { DiffusePass } from '../../materials/DiffusePass';
import { samplerManager } from '../../textures/SamplerManager';

export class TerrainRenderer {
  terrainTexture: ITexture;
  geometry: Geometry;
  mesh: Mesh;

  maxViewDst = 300;
  viewerPosition: Vector3;
  chunkSize: i32;
  chunksVisibleInViewDst: i32;
  terrainChunks: Map<string, TerrainChunk>;
  terrainChunksVisibleLastUpdate: TerrainChunk[];

  readonly mapChunkSizeLod = 241;
  private _levelOfDetail: number = 0; // Must be any int from 0 to 6

  simplify: HTMLButtonElement | null = null;

  constructor() {
    this.terrainChunks = new Map();
    this.viewerPosition = new Vector3();
    this.terrainChunksVisibleLastUpdate = [];
  }

  init(renderer: Renderer) {
    const { device } = renderer;

    if (!this.simplify) {
      this.simplify = document.createElement('button');
      this.simplify.innerText = 'Simplify';
      this.simplify.style.position = 'absolute';
      this.simplify.style.top = '0px';
      this.simplify.onclick = () => {
        this.levelOfDetail = this._levelOfDetail + 1;
        this.init(renderer);
      };
      document.body.appendChild(this.simplify);
    }

    const mapChunkSize = this.mapChunkSizeLod;
    this.chunkSize = mapChunkSize - 1;
    this.chunksVisibleInViewDst = Math.round(this.maxViewDst / mapChunkSize); // 4 chunks visible in view distance

    const noise = generateNoiseMap(mapChunkSize, mapChunkSize, 24);

    // Convert this noise map of f32 to a u8 texture. Each pixel will be a shader of grey
    // (0-255) based on the noise value.
    const data = new Uint8Array(mapChunkSize * mapChunkSize * 4);
    for (let i = 0; i < mapChunkSize * mapChunkSize; i++) {
      const value = Math.floor(Math.min(1, Math.max(0, noise[i])) * 255);
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255; // alpha
    }

    this.terrainTexture = textureManager.addTexture(
      new DataTexture(
        new TextureProperties('terrain1', false),
        data,
        mapChunkSize,
        mapChunkSize
      )
    );

    this.terrainTexture.load(device);

    const meshData = generateTerrainMesh(
      noise,
      mapChunkSize,
      mapChunkSize,
      this._levelOfDetail
    );
    this.geometry = new Geometry();

    this.geometry.vertices = new Float32Array(
      meshData.vertices.map((v) => v.toArray()).flat()
    );
    this.geometry.uvs = new Float32Array(
      meshData.uvs.map((v) => v.toArray()).flat()
    );
    this.geometry.indices = new Uint16Array(meshData.triangles);
    this.geometry.build(device);

    const terrainPass = new TerrainPass();
    terrainPass.terrainUniforms.texture = this.terrainTexture.gpuTexture;
    this.mesh = new Mesh(this.geometry, terrainPass);
    renderer.scene.addChild(this.mesh.transform);
  }

  get levelOfDetail() {
    return this._levelOfDetail;
  }

  set levelOfDetail(value: number) {
    this._levelOfDetail = value;

    if (this._levelOfDetail > 6) {
      this._levelOfDetail = 6;
    } else if (this._levelOfDetail < 0) {
      this._levelOfDetail = 0;
    }

    // Ensure its an integer
    this._levelOfDetail = Math.floor(this._levelOfDetail);
  }

  private updateVisibleChunks(camera: Camera, renderer: Renderer) {
    this.viewerPosition.set(
      camera.transform.position.x,
      0,
      camera.transform.position.z
    );

    for (const chunk of this.terrainChunksVisibleLastUpdate) {
      chunk.setVisible(false);
    }

    // Clear the last update array
    this.terrainChunksVisibleLastUpdate.length = 0;

    const currentChunkCoordX = Math.round(
      this.viewerPosition.x / this.chunkSize
    );
    const currentChunkCoordY = Math.round(
      this.viewerPosition.z / this.chunkSize
    );

    const chunksVisibleInViewDst = this.chunksVisibleInViewDst;

    for (
      let yOffset = -chunksVisibleInViewDst;
      yOffset <= chunksVisibleInViewDst;
      yOffset++
    ) {
      for (
        let xOffset = -chunksVisibleInViewDst;
        xOffset <= chunksVisibleInViewDst;
        xOffset++
      ) {
        const viewedChunkCoord = new Vector2(
          currentChunkCoordX + xOffset,
          currentChunkCoordY + yOffset
        );

        const mapId = `${viewedChunkCoord.x}:${viewedChunkCoord.y}`;

        if (this.terrainChunks.has(mapId)) {
          const chunk = this.terrainChunks.get(mapId)!;
          chunk.updateTerrainChunk(this.viewerPosition, this);

          if (chunk.mesh.visible) {
            this.terrainChunksVisibleLastUpdate.push(chunk);
          }
        } else {
          const newChunk = new TerrainChunk(viewedChunkCoord, this.chunkSize);
          renderer.scene.addChild(newChunk.mesh.transform);
          this.terrainChunks.set(mapId, newChunk);
        }
      }
    }
  }

  update(renderer: Renderer, camera: Camera) {
    this.updateVisibleChunks(camera, renderer);
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {}
}

export class TerrainChunk {
  position: Vector2;
  mesh: Mesh;
  bounds: Box3;

  constructor(coord: Vector2, size: i32) {
    this.position = coord.multiplyScalar(size);

    const diffuse = new DiffusePass();
    diffuse.diffuse.sampler = samplerManager.get('nearest-simple');
    this.mesh = new Mesh(PlaneGeometryFactory.new(1, 1), diffuse);
    this.mesh.transform.position.set(this.position.x, 0, this.position.y);
    this.mesh.transform.rotateX(-Math.PI / 2);
    this.mesh.transform.scale.set(size, size, size);

    this.bounds = new Box3();
    this.bounds.setFromCenterAndSize(
      this.mesh.transform.position,
      this.mesh.transform.scale
    );
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
