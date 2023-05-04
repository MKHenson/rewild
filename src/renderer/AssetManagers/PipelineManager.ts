import { Renderer } from "../Renderer";
import { DebugPipeline } from "../../core/pipelines/debug-pipeline/DebugPipeline";
import { Pipeline } from "../../core/pipelines/Pipeline";
import { SkyboxPipeline } from "../../core/pipelines/skybox-pipeline/SkyboxPipeline";
import { textureManager } from "../TextureManager";
import { AssetManager } from "./AssetManager";

class PipelineManager extends AssetManager<Pipeline<any>> {
  initialize(renderer: Renderer): void {
    this.assets.push(
      new DebugPipeline("coastal-floor", {
        diffuseMap: textureManager.find("ground-coastal-1"),
        NUM_DIR_LIGHTS: 0,
        uvScaleX: "30.0",
        uvScaleY: "30.0",
      }),
      new DebugPipeline("crate", { diffuseMap: textureManager.find("crate"), NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("simple", { NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("earth", { diffuseMap: textureManager.find("earth"), NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("concrete", { diffuseMap: textureManager.find("block-concrete-4"), NUM_DIR_LIGHTS: 0 }),
      new SkyboxPipeline("skybox", { diffuseMap: textureManager.find("desert-sky") }),
      new SkyboxPipeline("stars", { diffuseMap: textureManager.find("starry-sky") })
    );

    this.assets.forEach((p) => {
      p.build(renderer);
      p.initialize(renderer);
    });
  }
}

export const pipelineManager = new PipelineManager();
