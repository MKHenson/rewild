import { IController } from './IController';
import { ICameraController } from '../../types/ICamera';
import { Dispatcher, Euler, EulerRotationOrder, Vector3 } from 'rewild-common';

const _euler = new Euler(0, 0, 0, EulerRotationOrder.YXZ);
const _vector = new Vector3();

/**
 * Fires when the user moves the mouse.
 *
 * @event PointerLockControls#change
 * @type {Object}
 */
const _changeEvent: PointerLockEventType = { type: 'change' };

/**
 * Fires when the pointer lock status is "locked" (in other words: the mouse is captured).
 *
 * @event PointerLockControls#lock
 * @type {Object}
 */
const _lockEvent: PointerLockEventType = { type: 'lock' };

/**
 * Fires when the pointer lock status is "unlocked" (in other words: the mouse is not captured anymore).
 *
 * @event PointerLockControls#unlock
 * @type {Object}
 */
const _unlockEvent: PointerLockEventType = { type: 'unlock' };

const _MOUSE_SENSITIVITY = 0.002;
const _PI_2 = Math.PI / 2;

export type PointerLockEventType =
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'change' };

/**
 * The implementation of this class is based on the [Pointer Lock API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API}.
 * `PointerLockControls` is a perfect choice for first person 3D games.
 *
 * ```js
 * const controls = new PointerLockControls( camera, document.body );
 *
 * // add event listener to show/hide a UI (e.g. the game's menu)
 * controls.addEventListener( 'lock', function () {
 *
 * 	menu.style.display = 'none';
 *
 * } );
 *
 * controls.addEventListener( 'unlock', function () {
 *
 * 	menu.style.display = 'block';
 *
 * } );
 * ```
 *
 * @augments Controls
 * @three_import import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
 */
export class PointerLockController implements IController {
  object: ICameraController;
  domElement: HTMLElement | null;
  isLocked: boolean;
  minPolarAngle: f32;
  maxPolarAngle: f32;
  pointerSpeed: f32;
  enabled: boolean;
  moveSpeed: f32;

  private movingForward: boolean;
  private movingBackward: boolean;
  private movingLeft: boolean;
  private movingRight: boolean;
  public jumpRequested: boolean = false;

  moveCamera: boolean = false;
  movementVector: Vector3 = new Vector3(0, 0, 0);

  dispatcher: Dispatcher<PointerLockEventType>;

  private _onMouseMove: (event: MouseEvent) => void;
  private _onPointerlockChange: () => void;
  private _onPointerlockError: () => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;

  /**
   * Constructs a new controls instance.
   *
   * @param {Camera} camera - The camera that is managed by the controls.
   * @param {?HTMLDOMElement} domElement - The HTML element used for event listeners.
   */
  constructor(
    camera: ICameraController,
    domElement: HTMLElement | null = null
  ) {
    this.object = camera;
    this.domElement = domElement;
    this.isLocked = false;
    this.minPolarAngle = 0;
    this.moveSpeed = 1;
    this.maxPolarAngle = Math.PI;
    this.pointerSpeed = 1.0;
    this.dispatcher = new Dispatcher<PointerLockEventType>();
    this.enabled = true;

    // event listeners

    this._onMouseMove = this.onMouseMove.bind(this);
    this._onPointerlockChange = this.onPointerlockChange.bind(this);
    this._onPointerlockError = this.onPointerlockError.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);

    this.movingForward = false;
    this.movingBackward = false;
    this.movingLeft = false;
    this.movingRight = false;

    if (this.domElement !== null) {
      this.connect(this.domElement);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code == 'KeyW') this.movingForward = true;
    else if (e.code == 'KeyS') this.movingBackward = true;
    else if (e.code == 'KeyA') this.movingLeft = true;
    else if (e.code == 'KeyD') this.movingRight = true;
    else if (e.code == 'Space') this.jumpRequested = true;
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code == 'KeyW') this.movingForward = false;
    else if (e.code == 'KeyS') this.movingBackward = false;
    else if (e.code == 'KeyA') this.movingLeft = false;
    else if (e.code == 'KeyD') this.movingRight = false;
    else if (e.code == 'Space') this.jumpRequested = false;
  }

  lookAt(x: number, y: number, z: number): void {
    this.object.camera.lookAt(x, y, z);

    // Sync the internal euler angles to match the new camera orientation
    // This prevents the mouse movement from overriding the lookAt target
    _euler.setFromQuaternion(this.object.camera.transform.quaternion);
  }

  onWindowResize(): void {}
  update(delta: number): void {
    if (!this.enabled) return;

    // Clear movement vector after applying so it doesn't accumulate across frames.
    this.movementVector.set(0, 0, 0);

    if (this.movingForward) this.moveForward(this.moveSpeed * delta);
    else if (this.movingBackward) this.moveForward(-this.moveSpeed * delta);
    if (this.movingRight) this.moveRight(this.moveSpeed * delta);
    else if (this.movingLeft) this.moveRight(-this.moveSpeed * delta);
  }

  connect(element: HTMLElement) {
    if (this.domElement !== null) this.disconnect();
    this.domElement = element;

    this.domElement.ownerDocument.addEventListener(
      'mousemove',
      this._onMouseMove
    );
    this.domElement.ownerDocument.addEventListener(
      'pointerlockchange',
      this._onPointerlockChange
    );
    this.domElement.ownerDocument.addEventListener(
      'pointerlockerror',
      this._onPointerlockError
    );
    this.domElement.ownerDocument.addEventListener('keydown', this._onKeyDown);
    this.domElement.ownerDocument.addEventListener('keyup', this._onKeyUp);
  }

  disconnect() {
    this.unlock();
    this.domElement?.ownerDocument.removeEventListener(
      'mousemove',
      this._onMouseMove
    );
    this.domElement?.ownerDocument.removeEventListener(
      'pointerlockchange',
      this._onPointerlockChange
    );
    this.domElement?.ownerDocument.removeEventListener(
      'pointerlockerror',
      this._onPointerlockError
    );
    this.domElement?.ownerDocument.removeEventListener(
      'keydown',
      this._onKeyDown
    );
    this.domElement?.ownerDocument.removeEventListener('keyup', this._onKeyUp);
  }

  dispose() {
    this.disconnect();
  }

  /**
   * Returns the look direction of the camera.
   *
   * @param {Vector3} v - The target vector that is used to store the method's result.
   * @return {Vector3} The normalized direction vector.
   */
  getDirection(v: Vector3): Vector3 {
    return v
      .set(0, 0, -1)
      .applyQuaternion(this.object.camera.transform.quaternion);
  }

  /**
   * Moves the camera forward in the direction it's looking.
   *
   * @param {number} distance - The signed distance.
   */
  moveForward(distance: f32) {
    if (this.enabled === false) return;

    const camera = this.object;
    // Get the actual forward direction of the camera (including vertical component)
    this.getDirection(_vector);

    if (this.moveCamera)
      camera.camera.transform.position.addScaledVector(_vector, distance);
    else this.movementVector.addScaledVector(_vector, distance);
  }

  /**
   * Moves the camera sidewards parallel to the xz-plane.
   *
   * @param {number} distance - The signed distance.
   */
  moveRight(distance: f32) {
    if (this.enabled === false) return;
    const camera = this.object;
    _vector.setFromMatrixColumn(camera.camera.transform.matrix, 0);

    if (this.moveCamera)
      camera.camera.transform.position.addScaledVector(_vector, distance);
    else this.movementVector.addScaledVector(_vector, distance);
  }

  /**
   * Activates the pointer lock.
   *
   * @param {boolean} [unadjustedMovement=false] - Disables OS-level adjustment for mouse acceleration, and accesses raw mouse input instead.
   * Setting it to true will disable mouse acceleration.
   */
  lock(unadjustedMovement = false) {
    this.domElement?.requestPointerLock({
      unadjustedMovement,
    });
  }

  /**
   * Exits the pointer lock.
   */
  unlock() {
    this.domElement?.ownerDocument.exitPointerLock();
  }

  // event listeners

  private onMouseMove(event: MouseEvent) {
    if (this.enabled === false || this.isLocked === false) return;

    const camera = this.object;
    _euler.setFromQuaternion(camera.camera.transform.quaternion);

    _euler.y -= event.movementX * _MOUSE_SENSITIVITY * this.pointerSpeed;
    _euler.x -= event.movementY * _MOUSE_SENSITIVITY * this.pointerSpeed;

    _euler.x = Math.max(
      _PI_2 - this.maxPolarAngle,
      Math.min(_PI_2 - this.minPolarAngle, _euler.x)
    );

    camera.camera.transform.quaternion.setFromEuler(_euler, false);

    this.dispatcher.dispatch(_changeEvent);
  }

  private onPointerlockChange() {
    if (this.domElement?.ownerDocument.pointerLockElement === this.domElement) {
      this.dispatcher.dispatch(_lockEvent);

      this.isLocked = true;
    } else {
      this.dispatcher.dispatch(_unlockEvent);

      this.isLocked = false;
    }
  }

  private onPointerlockError() {
    console.error('THREE.PointerLockControls: Unable to use Pointer Lock API');
  }
}
