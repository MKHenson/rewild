import { IProject } from 'models';
import { Renderer } from 'rewild-renderer';
import { registerChunkSnapshotDevCommands } from './ChunkSnapshotDevCommands';
import { registerShadowDebugCommands } from './ShadowDebugCommands';
import { registerSkyDebugCommands } from './SkyDebugCommands';

// One-stop registration for the window console commands, called wherever a
// renderer is bound to a loaded project (editor sync + game load). Commands
// close over the given renderer/project, so re-registering on a later load
// simply repoints them.
export function registerDebugCommands(renderer: Renderer, project: IProject) {
  registerSkyDebugCommands(renderer);
  registerShadowDebugCommands(renderer);
  registerChunkSnapshotDevCommands(renderer, project);
}
