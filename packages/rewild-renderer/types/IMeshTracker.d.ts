import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';
import { IMeshComponent } from './interfaces';

interface IMeshTracker {
  onAssignedToMesh(mesh: IMeshComponent): void;
  onUnassignedFromMesh(mesh: IMeshComponent): void;
}
