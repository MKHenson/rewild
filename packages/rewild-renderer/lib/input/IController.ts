import { ICameraController } from '../../types/ICamera';

/**
 * Abstract base class for controls.
 */
export interface IController {
  /**
   * The 3D object that is managed by the controls.
   */
  object: ICameraController;

  /**
   * The HTML element used for event listeners. If not provided via the constructor, {@link .connect} must be called
   * after `domElement` has been set.
   */
  domElement: HTMLElement | null;

  /**
   * When set to `false`, the controls will not respond to user input. Default is `true`.
   */
  enabled: boolean;

  /**
   * Connects the controls to the DOM. This method has so called "side effects" since it adds the module's event
   * listeners to the DOM.
   */
  connect(element: HTMLElement): void;

  lookAt(x: number, y: number, z: number): void;

  onWindowResize(): void;

  /**
   * Disconnects the controls from the DOM.
   */
  disconnect(): void;

  /**
   * Call this method if you no longer want use to the controls. It frees all internal resources and removes all event
   * listeners.
   */
  dispose(): void;

  /**
   * Controls should implement this method if they have to update their internal state per simulation step.
   */
  update(delta: number): void;
}
