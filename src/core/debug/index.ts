import { IProject } from 'models';
import { Renderer } from 'rewild-renderer';
import { registerChunkSnapshotDevCommands } from './ChunkSnapshotDevCommands';
import { registerRenderQualityCommands } from './RenderQualityCommands';
import { registerShadowDebugCommands } from './ShadowDebugCommands';
import { registerSkyDebugCommands } from './SkyDebugCommands';
import { registerPbrHarnessCommands } from './PbrHarnessCommands';
import { registerGltfImportCommands } from './GltfImportCommands';
import {
  registerScatterDebugCommands,
  registerWindDebugCommands,
} from './ScatterDebugCommands';

// One-stop registration for the window console commands, called wherever a
// renderer is bound to a loaded project (editor sync + game load). Commands
// close over the given renderer/project, so re-registering on a later load
// simply repoints them.
export function registerDebugCommands(renderer: Renderer, project: IProject) {
  registerRenderQualityCommands(renderer);
  registerSkyDebugCommands(renderer);
  registerShadowDebugCommands(renderer);
  registerPbrHarnessCommands(renderer);
  registerGltfImportCommands(renderer);
  registerScatterDebugCommands(renderer);
  registerWindDebugCommands(renderer);
  registerChunkSnapshotDevCommands(renderer, project);
}
