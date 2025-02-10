import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';
import { Mesh } from '../lib/core/Mesh';

interface IMeshTracker {
  onAssignedToMesh(mesh: Mesh): void;
  onUnassignedFromMesh(mesh: Mesh): void;
}
