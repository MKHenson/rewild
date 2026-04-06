import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';
import { IVisualComponent } from './interfaces';

interface IMeshTracker {
  onAssignedToMesh(mesh: IVisualComponent): void;
  onUnassignedFromMesh(mesh: IVisualComponent): void;
}
