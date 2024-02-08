import { Renderer } from '../Renderer';
import { DebugPipeline } from '../pipelines/debug-pipeline/DebugPipeline';
import { Pipeline } from '../pipelines/Pipeline';
import { SkyboxPipeline } from '../pipelines/skybox-pipeline/SkyboxPipeline';
import { TerrainPipeline } from '../pipelines/terrain-pipeline/TerrainPipeline';
import { textureManager } from './TextureManager';
import { AssetManager } from './AssetManager';

class PipelineManager extends AssetManager<Pipeline<any>> {
  async initialize(renderer: Renderer): Promise<void> {
    this.assets.push(
      new DebugPipeline('coastal-floor', {
        diffuseMap: textureManager.getAsset('ground-coastal-1'),
        NUM_DIR_LIGHTS: 0,
        uvScaleX: '30.0',
        uvScaleY: '30.0',
      }),
      new DebugPipeline('crate', {
        diffuseMap: textureManager.getAsset('crate'),
        NUM_DIR_LIGHTS: 0,
      }),
      new DebugPipeline('basketball', {
        diffuseMap: textureManager.getAsset('basketball'),
        NUM_DIR_LIGHTS: 0,
      }),
      new DebugPipeline('simple', { NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline('earth', {
        diffuseMap: textureManager.getAsset('earth'),
        NUM_DIR_LIGHTS: 0,
      }),
      new DebugPipeline('concrete', {
        diffuseMap: textureManager.getAsset('block-concrete-4'),
        NUM_DIR_LIGHTS: 0,
      }),
      new SkyboxPipeline('skybox', {
        diffuseMap: textureManager.getAsset('desert-sky'),
      }),
      new SkyboxPipeline('stars', {
        diffuseMap: textureManager.getAsset('starry-sky'),
      }),
      new TerrainPipeline('terrain', {})
    );

    this.assets.forEach((p) => {
      p.build(renderer);
      p.initialize(renderer);
    });
  }
}

export const pipelineManager = new PipelineManager();
