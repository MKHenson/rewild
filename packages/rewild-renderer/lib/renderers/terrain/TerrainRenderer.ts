import { Renderer } from '../../Renderer';
import { Geometry } from '../../geometry/Geometry';
import { ITexture } from '../../textures/ITexture';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { Vector2, Vector3 } from 'rewild-common';
import { TerrainChunk } from './TerrainChunk';

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
      chunk.visible = false;
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

          if (chunk.visible) {
            this.terrainChunksVisibleLastUpdate.push(chunk);
          }
        } else {
          const newChunk = new TerrainChunk(viewedChunkCoord, this.chunkSize);
          newChunk.load(this.chunkSize, this._levelOfDetail, renderer);

          renderer.scene.addChild(newChunk.transform);
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
