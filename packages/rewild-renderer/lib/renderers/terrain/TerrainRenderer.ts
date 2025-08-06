import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import { Vector2, Vector3 } from 'rewild-common';
import { TerrainChunk } from './TerrainChunk';

export class LOFInfo {
  lod: i32;
  visibleDstThreshold: f32;
}

const viewerMoveThresholdForChunkUpdate = 25;
const sqrViewerMoveThresholdForChunkUpdate =
  viewerMoveThresholdForChunkUpdate * viewerMoveThresholdForChunkUpdate;

export class TerrainRenderer {
  viewPosOld: Vector3;
  viewerPosition: Vector3;
  chunkSize: i32;
  chunksVisibleInViewDst: i32;
  terrainChunks: Map<string, TerrainChunk>;
  terrainChunksVisibleLastUpdate: TerrainChunk[];
  detailLevels: LOFInfo[] = [
    { lod: 0, visibleDstThreshold: 600 },
    { lod: 5, visibleDstThreshold: 800 },
    { lod: 6, visibleDstThreshold: 1000 },
  ];

  _hasInitiallyUpdatedTerrain: boolean = false;
  readonly mapChunkSizeLod = 241;
  private _levelOfDetail: number = 0; // Must be any int from 0 to 6

  constructor() {
    this.terrainChunks = new Map();
    this.viewerPosition = new Vector3();
    this.terrainChunksVisibleLastUpdate = [];
  }

  get maxViewDst() {
    return this.detailLevels.at(-1)!.visibleDstThreshold;
  }

  init(renderer: Renderer) {
    const mapChunkSize = this.mapChunkSizeLod;
    this.chunkSize = mapChunkSize - 1;
    this.chunksVisibleInViewDst = Math.round(this.maxViewDst / mapChunkSize);
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

  private updateVisibleChunks(renderer: Renderer) {
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
          chunk.updateTerrainChunk(this.viewerPosition, this, renderer);

          if (chunk.visible) {
            this.terrainChunksVisibleLastUpdate.push(chunk);
          }
        } else {
          const newChunk = new TerrainChunk(
            viewedChunkCoord,
            this.chunkSize,
            this.mapChunkSizeLod,
            this.detailLevels
          );
          newChunk.visible = false;
          renderer.scene.addChild(newChunk.transform);
          this.terrainChunks.set(mapId, newChunk);
        }
      }
    }
  }

  update(renderer: Renderer, camera: Camera) {
    this.viewerPosition.set(
      camera.transform.position.x,
      0,
      camera.transform.position.z
    );

    if (!this.viewPosOld) {
      this.viewPosOld = new Vector3();
      this.viewPosOld.copy(this.viewerPosition);
    }

    if (!this._hasInitiallyUpdatedTerrain) {
      this.updateVisibleChunks(renderer);

      if (this.terrainChunksVisibleLastUpdate.length > 0)
        this._hasInitiallyUpdatedTerrain = true;
    } else if (
      this.viewPosOld.distanceToSquared(this.viewerPosition) >
      sqrViewerMoveThresholdForChunkUpdate
    ) {
      this.viewPosOld.copy(this.viewerPosition);

      this.updateVisibleChunks(renderer);
    }
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {}

  dispose() {
    for (const chunk of this.terrainChunks.values()) {
      chunk.dispose();
    }
    this.terrainChunks.clear();
    this.terrainChunksVisibleLastUpdate.length = 0;
  }
}
