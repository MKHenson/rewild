import { IProject } from 'models';
import { Renderer } from 'rewild-renderer';
import { registerChunkSnapshotDevCommands } from './ChunkSnapshotDevCommands';
import { registerRenderQualityCommands } from './RenderQualityCommands';
import { registerShadowDebugCommands } from './ShadowDebugCommands';
import { registerSkyDebugCommands } from './SkyDebugCommands';
import { registerPbrHarnessCommands } from './PbrHarnessCommands';
import { registerTerrainPerfCommands } from './TerrainPerfCommands';
import { registerGltfImportCommands } from './GltfImportCommands';
import { registerScatterDebugCommands } from './ScatterDebugCommands';

// One-stop registration for the window console commands, called wherever a
// renderer is bound to a loaded project (editor sync + game load). Commands
// close over the given renderer/project, so re-registering on a later load
// simply repoints them.
export function registerDebugCommands(renderer: Renderer, project: IProject) {
  registerRenderQualityCommands(renderer);
  registerSkyDebugCommands(renderer);
  registerShadowDebugCommands(renderer);
  registerTerrainPerfCommands(renderer);
  registerPbrHarnessCommands(renderer);
  registerGltfImportCommands(renderer);
  registerScatterDebugCommands(renderer);
  registerChunkSnapshotDevCommands(renderer, project);
}
