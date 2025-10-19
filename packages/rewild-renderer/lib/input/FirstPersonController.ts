import {
  clamp,
  degToRad,
  mapLinear,
  radToDeg,
  Spherical,
  Vector3,
} from 'rewild-common';
import { ICameraController } from '../../types/ICamera';
import { IController } from './IController';

const _lookDirection = new Vector3();
const _spherical = new Spherical();
const _target = new Vector3();
const _targetPosition = new Vector3();

export class FirstPersonControls implements IController {
  object: ICameraController;
  domElement: HTMLElement | null;
  enabled: boolean;
  movementSpeed: f32;
  lookSpeed: f32;
  lookVertical: boolean;
  autoForward: boolean;
  activeLook: boolean;
  heightSpeed: boolean;
  heightCoef: f32;
  heightMin: f32;
  heightMax: f32;
  constrainVertical: boolean;
  verticalMin: f32;
  verticalMax: f32;
  mouseDragOn: boolean;

  // internals
  private _autoSpeedFactor: f32;
  private _pointerX: f32;
  private _pointerY: f32;
  private _moveForward: boolean;
  private _moveBackward: boolean;
  private _moveLeft: boolean;
  private _moveRight: boolean;
  private _moveUp: boolean;
  private _moveDown: boolean;
  private _viewHalfX: f32;
  private _viewHalfY: f32;
  private _lat: f32;
  private _lon: f32;

  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerDown: (e: PointerEvent) => void;
  private _onPointerUp: (e: PointerEvent) => void;
  private _onContextMenu: (e: MouseEvent) => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;

  /**
   * Constructs a new controls instance.
   *
   * @param {Object3D} object - The object that is managed by the controls.
   * @param {?HTMLDOMElement} domElement - The HTML element used for event listeners.
   */
  constructor(
    object: ICameraController,
    domElement: HTMLElement | null = null
  ) {
    this.object = object;
    this.domElement = domElement;

    this.movementSpeed = 1.0;
    this.lookSpeed = 0.005;
    this.lookVertical = true;
    this.autoForward = false;
    this.activeLook = true;
    this.heightSpeed = false;
    this.heightCoef = 1.0;
    this.heightMin = 0.0;
    this.heightMax = 1.0;
    this.constrainVertical = false;
    this.verticalMin = 0;
    this.verticalMax = Math.PI;
    this.mouseDragOn = false;

    // internals
    this._autoSpeedFactor = 0.0;

    this._pointerX = 0;
    this._pointerY = 0;

    this._moveForward = false;
    this._moveBackward = false;
    this._moveLeft = false;
    this._moveRight = false;

    this._viewHalfX = 0;
    this._viewHalfY = 0;

    this._lat = 0;
    this._lon = 0;

    // event listeners

    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onContextMenu = this.onContextMenu.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);

    //

    if (domElement !== null) {
      this.connect(domElement);
      this.onWindowResize();
    }

    this._setOrientation();
  }

  connect(element: HTMLElement) {
    if (this.domElement !== null) this.disconnect();
    this.domElement = element;

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  disconnect() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);

    const domElement = this.domElement;
    if (domElement === null) return;

    domElement.removeEventListener('pointerdown', this._onPointerMove);
    domElement.removeEventListener('pointermove', this._onPointerDown);
    domElement.removeEventListener('pointerup', this._onPointerUp);
    domElement.removeEventListener('contextmenu', this._onContextMenu);
  }

  dispose() {
    this.disconnect();
  }

  /**
   * Must be called if the application window is resized.
   */
  onWindowResize() {
    if ((this.domElement as Node) === document) {
      this._viewHalfX = window.innerWidth / 2;
      this._viewHalfY = window.innerHeight / 2;
    } else {
      this._viewHalfX = this.domElement!.offsetWidth / 2;
      this._viewHalfY = this.domElement!.offsetHeight / 2;
    }
  }

  lookAt(x: f32, y: f32, z: f32): FirstPersonControls {
    _target.set(x, y, z);

    this.object.camera.lookAt(_target.x, _target.y, _target.z);

    this._setOrientation();

    return this;
  }

  update(delta: f32) {
    if (this.enabled === false) return;

    if (this.heightSpeed) {
      const y = clamp(
        this.object.camera.transform.position.y,
        this.heightMin,
        this.heightMax
      );
      const heightDelta = y - this.heightMin;

      this._autoSpeedFactor = delta * (heightDelta * this.heightCoef);
    } else {
      this._autoSpeedFactor = 0.0;
    }

    const actualMoveSpeed = delta * this.movementSpeed;

    if (this._moveForward || (this.autoForward && !this._moveBackward))
      this.object.camera.transform.translateZ(
        -(actualMoveSpeed + this._autoSpeedFactor)
      );
    if (this._moveBackward)
      this.object.camera.transform.translateZ(actualMoveSpeed);

    if (this._moveLeft)
      this.object.camera.transform.translateX(-actualMoveSpeed);
    if (this._moveRight)
      this.object.camera.transform.translateX(actualMoveSpeed);

    if (this._moveUp) this.object.camera.transform.translateY(actualMoveSpeed);
    if (this._moveDown)
      this.object.camera.transform.translateY(-actualMoveSpeed);

    let actualLookSpeed = delta * this.lookSpeed;

    if (!this.activeLook) {
      actualLookSpeed = 0;
    }

    let verticalLookRatio = 1;

    if (this.constrainVertical) {
      verticalLookRatio = Math.PI / (this.verticalMax - this.verticalMin);
    }

    this._lon -= this._pointerX * actualLookSpeed;
    if (this.lookVertical)
      this._lat -= this._pointerY * actualLookSpeed * verticalLookRatio;

    this._lat = Math.max(-85, Math.min(85, this._lat));

    let phi = degToRad(90 - this._lat);
    const theta = degToRad(this._lon);

    if (this.constrainVertical) {
      phi = mapLinear(phi, 0, Math.PI, this.verticalMin, this.verticalMax);
    }

    const position = this.object.camera.transform.position;

    _targetPosition.setFromSphericalCoords(1, phi, theta).add(position);

    this.object.camera.lookAt(
      _targetPosition.x,
      _targetPosition.y,
      _targetPosition.z
    );
  }

  _setOrientation() {
    const quaternion = this.object.camera.transform.quaternion;

    _lookDirection.set(0, 0, -1).applyQuaternion(quaternion);
    _spherical.setFromVector3(_lookDirection);

    this._lat = 90 - radToDeg(_spherical.phi);
    this._lon = radToDeg(_spherical.theta);
  }

  private onPointerDown(event: PointerEvent) {
    if ((this.domElement as Node) !== document) {
      this.domElement!.focus();
    }

    if (this.activeLook) {
      switch (event.button) {
        case 0:
          this._moveForward = true;
          break;
        case 2:
          this._moveBackward = true;
          break;
      }
    }

    this.mouseDragOn = true;
  }

  private onPointerUp(event: PointerEvent) {
    if (this.activeLook) {
      switch (event.button) {
        case 0:
          this._moveForward = false;
          break;
        case 2:
          this._moveBackward = false;
          break;
      }
    }

    this.mouseDragOn = false;
  }

  private onPointerMove(event: PointerEvent) {
    if ((this.domElement as Node) === document) {
      this._pointerX = event.pageX - this._viewHalfX;
      this._pointerY = event.pageY - this._viewHalfY;
    } else {
      this._pointerX =
        event.pageX - this.domElement!.offsetLeft - this._viewHalfX;
      this._pointerY =
        event.pageY - this.domElement!.offsetTop - this._viewHalfY;
    }
  }

  private onKeyDown(event: KeyboardEvent) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this._moveForward = true;
        break;

      case 'ArrowLeft':
      case 'KeyA':
        this._moveLeft = true;
        break;

      case 'ArrowDown':
      case 'KeyS':
        this._moveBackward = true;
        break;

      case 'ArrowRight':
      case 'KeyD':
        this._moveRight = true;
        break;

      case 'KeyR':
        this._moveUp = true;
        break;
      case 'KeyF':
        this._moveDown = true;
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this._moveForward = false;
        break;

      case 'ArrowLeft':
      case 'KeyA':
        this._moveLeft = false;
        break;

      case 'ArrowDown':
      case 'KeyS':
        this._moveBackward = false;
        break;

      case 'ArrowRight':
      case 'KeyD':
        this._moveRight = false;
        break;

      case 'KeyR':
        this._moveUp = false;
        break;
      case 'KeyF':
        this._moveDown = false;
        break;
    }
  }

  private onContextMenu(event: MouseEvent) {
    if (this.enabled === false) return;
    event.preventDefault();
  }
}
