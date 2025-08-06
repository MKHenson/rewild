import { Camera } from '../lib/core/Camera';

export interface ICameraController {
  zoom: f32;
  camera: Camera;
  updateProjectionMatrix: () => void;
  isOrthographicCamera: boolean;
  isPerspectiveCamera: boolean;
}
