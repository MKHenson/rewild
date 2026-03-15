import { IMaterialPass, Renderer } from '..';
import { Camera } from '../core/Camera';
import { Geometry } from '../geometry/Geometry';
import { UIElement } from '../core/UIElement';

export interface IUIElementPass extends IMaterialPass {
  prepareUniforms(
    renderer: Renderer,
    camera: Camera,
    elements: UIElement[]
  ): void;
  setPassState(pass: GPURenderPassEncoder, geometry: Geometry): void;
}
