import { clamp, Quaternion, Vector2, Vector3 } from 'rewild-common';
import { ICameraController } from '../../types/ICamera';
import { OrthographicCamera } from '../core/OrthographicCamera';
import { IController } from './IController';

const _changeEvent = { type: 'change' };
const _startEvent = { type: 'start' };
const _endEvent = { type: 'end' };

export enum MOUSE {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  ROTATE = 0,
  DOLLY = 1,
  PAN = 2,
}

export enum TOUCH {
  ROTATE = 0,
  PAN = 1,
  DOLLY_PAN = 2,
  DOLLY_ROTATE = 3,
}

const _EPS: f32 = 0.000001;
const _STATE = {
  NONE: -1,
  ROTATE: 0,
  ZOOM: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
  TOUCH_ZOOM_PAN: 4,
};

const _v2 = new Vector2();
const _mouseChange = new Vector2();
const _objectUp = new Vector3();
const _pan = new Vector3();
const _axis = new Vector3();
const _quaternion = new Quaternion();
const _eyeDirection = new Vector3();
const _objectUpDirection = new Vector3();
const _objectSidewaysDirection = new Vector3();
const _moveDirection = new Vector3();

export class TrackballController implements IController {
  /**
   * The 3D object that is managed by the controls.
   */
  object: ICameraController;

  /**
   * The HTML element used for event listeners. If not provided via the constructor, {@link .connect} must be called
   * after `domElement` has been set.
   */
  domElement: HTMLElement;

  /**
   * When set to `false`, the controls will not respond to user input. Default is `true`.
   */
  enabled: boolean;

  _movePrev: Vector2;
  _moveCurr: Vector2;
  _lastAxis: Vector3;
  _zoomStart: Vector2;
  _zoomEnd: Vector2;
  _panStart: Vector2;
  _panEnd: Vector2;
  rotateSpeed: f32;
  zoomSpeed: f32;
  panSpeed: f32;
  noRotate: boolean;
  noZoom: boolean;
  noPan: boolean;
  staticMoving: boolean;
  dynamicDampingFactor: f32;
  minDistance: f32;
  maxDistance: f32;
  minZoom: f32;
  maxZoom: f32;
  screen: { left: f32; top: f32; width: f32; height: f32 };

  state: f32;
  keyState: f32;
  target: Vector3;
  _lastPosition: Vector3;
  _lastZoom: f32;
  _touchZoomDistanceStart: f32;
  _touchZoomDistanceEnd: f32;
  _lastAngle: f32;
  _eye: Vector3;

  _target0: Vector3;
  _position0: Vector3;
  _up0: Vector3;
  _zoom0: f32;

  _onPointerMove: (e: PointerEvent) => void;
  _onPointerDown: (e: PointerEvent) => void;
  _onPointerUp: (e: PointerEvent) => void;
  _onPointerCancel: (e: PointerEvent) => void;
  _onContextMenu: (e: MouseEvent) => void;
  _onMouseWheel: (e: WheelEvent) => void;
  _onKeyDown: (e: KeyboardEvent) => void;
  _onKeyUp: (e: KeyboardEvent) => void;
  _onTouchStart: (e: PointerEvent) => void;
  _onTouchMove: (e: PointerEvent) => void;
  _onTouchEnd: (e: PointerEvent) => void;
  _onMouseDown: (e: MouseEvent) => void;
  _onMouseMove: (e: MouseEvent) => void;
  _onMouseUp: (e?: MouseEvent) => void;

  _pointers: PointerEvent[];
  _pointerPositions: { [key: number]: Vector2 };

  keys: string[];
  mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };

  constructor(object: ICameraController, domElement: HTMLElement) {
    this.object = object;
    this.domElement = domElement;

    // API

    this.enabled = true;

    this.screen = { left: 0, top: 0, width: 0, height: 0 };

    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.2;
    this.panSpeed = 0.3;

    this.noRotate = false;
    this.noZoom = false;
    this.noPan = false;

    this.staticMoving = false;
    this.dynamicDampingFactor = 0.2;

    this.minDistance = 0;
    this.maxDistance = Infinity;

    this.minZoom = 0;
    this.maxZoom = Infinity;

    this.keys = ['KeyA' /*A*/, 'KeyS' /*S*/, 'KeyD' /*D*/];

    this.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
    this.state = _STATE.NONE;
    this.keyState = _STATE.NONE;

    this.target = new Vector3();

    // internals

    this._lastPosition = new Vector3();
    this._lastZoom = 1;
    this._touchZoomDistanceStart = 0;
    this._touchZoomDistanceEnd = 0;
    this._lastAngle = 0;

    this._eye = new Vector3();

    this._movePrev = new Vector2();
    this._moveCurr = new Vector2();

    this._lastAxis = new Vector3();

    this._zoomStart = new Vector2();
    this._zoomEnd = new Vector2();

    this._panStart = new Vector2();
    this._panEnd = new Vector2();

    this._pointers = [];
    this._pointerPositions = {};

    // event listeners

    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onPointerCancel = this.onPointerCancel.bind(this);
    this._onContextMenu = this.onContextMenu.bind(this);
    this._onMouseWheel = this.onMouseWheel.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);

    this._onTouchStart = this.onTouchStart.bind(this);
    this._onTouchMove = this.onTouchMove.bind(this);
    this._onTouchEnd = this.onTouchEnd.bind(this);

    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);

    // for reset
    this._target0 = this.target.clone();
    this._position0 = this.object.camera.transform.position.clone();
    this._up0 = this.object.camera.transform.up.clone();
    this._zoom0 = this.object.zoom;

    if (domElement !== null) {
      this.connect();
      this.onWindowResize();
    }

    // force an update at start
    this.update();
  }

  connect(element?: HTMLElement | null) {
    if (this.domElement !== null) this.disconnect();
    if (element) this.domElement = element;

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointercancel', this._onPointerCancel);
    this.domElement.addEventListener('wheel', this._onMouseWheel, {
      passive: false,
    });
    this.domElement.addEventListener('contextmenu', this._onContextMenu);

    this.domElement.style.touchAction = 'none'; // disable touch scroll
  }

  disconnect() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);

    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerCancel);
    this.domElement.removeEventListener('wheel', this._onMouseWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);

    this.domElement.style.touchAction = 'auto'; // disable touch scroll
  }

  dispose() {
    this.disconnect();
  }

  onWindowResize() {
    const box = this.domElement.getBoundingClientRect();
    // adjustments come from similar code in the jquery offset() function
    const d = this.domElement.ownerDocument.documentElement;

    this.screen.left = box.left + window.pageXOffset - d.clientLeft;
    this.screen.top = box.top + window.pageYOffset - d.clientTop;
    this.screen.width = box.width;
    this.screen.height = box.height;
  }

  update() {
    this._eye.subVectors(this.object.camera.transform.position, this.target);

    if (!this.noRotate) {
      this._rotateCamera();
    }

    if (!this.noZoom) {
      this._zoomCamera();
    }

    if (!this.noPan) {
      this._panCamera();
    }

    this.object.camera.transform.position.addVectors(this.target, this._eye);

    if (this.object.isPerspectiveCamera) {
      this._checkDistances();

      this.object.camera.lookAt(this.target.x, this.target.y, this.target.z);

      if (
        this._lastPosition.distanceToSquared(
          this.object.camera.transform.position
        ) > _EPS
      ) {
        this.dispatchEvent(_changeEvent);

        this._lastPosition.copy(this.object.camera.transform.position);
      }
    } else if (this.object.isOrthographicCamera) {
      this.object.camera.lookAt(this.target.x, this.target.y, this.target.z);

      if (
        this._lastPosition.distanceToSquared(
          this.object.camera.transform.position
        ) > _EPS ||
        this._lastZoom !== this.object.zoom
      ) {
        this.dispatchEvent(_changeEvent);

        this._lastPosition.copy(this.object.camera.transform.position);
        this._lastZoom = this.object.zoom;
      }
    } else {
      console.warn('THREE.TrackballControls: Unsupported camera type.');
    }
  }

  reset() {
    this.state = _STATE.NONE;
    this.keyState = _STATE.NONE;

    this.target.copy(this._target0);
    this.object.camera.transform.position.copy(this._position0);
    this.object.camera.transform.up.copy(this._up0);
    this.object.zoom = this._zoom0;

    this.object.updateProjectionMatrix();

    this._eye.subVectors(this.object.camera.transform.position, this.target);

    this.object.camera.lookAt(this.target.x, this.target.y, this.target.z);

    this.dispatchEvent(_changeEvent);

    this._lastPosition.copy(this.object.camera.transform.position);
    this._lastZoom = this.object.zoom;
  }

  lookAt(x: number, y: number, z: number) {
    this.target.set(x, y, z);
    return this;
  }

  _panCamera() {
    _mouseChange.copy(this._panEnd).sub(this._panStart);

    if (_mouseChange.lengthSq()) {
      if (this.object.isOrthographicCamera) {
        const orthCam = this.object as OrthographicCamera;
        const scale_x =
          (orthCam.right - orthCam.left) /
          orthCam.zoom /
          this.domElement.clientWidth;
        const scale_y =
          (orthCam.top - orthCam.bottom) /
          orthCam.zoom /
          this.domElement.clientWidth;

        _mouseChange.x *= scale_x;
        _mouseChange.y *= scale_y;
      }

      _mouseChange.multiplyScalar(this._eye.length() * this.panSpeed);

      _pan
        .copy(this._eye)
        .cross(this.object.camera.transform.up)
        .setLength(_mouseChange.x);
      _pan.add(
        _objectUp
          .copy(this.object.camera.transform.up)
          .setLength(_mouseChange.y)
      );

      this.object.camera.transform.position.add(_pan);
      this.target.add(_pan);

      if (this.staticMoving) {
        this._panStart.copy(this._panEnd);
      } else {
        this._panStart.add(
          _mouseChange
            .subVectors(this._panEnd, this._panStart)
            .multiplyScalar(this.dynamicDampingFactor)
        );
      }
    }
  }

  _rotateCamera() {
    _moveDirection.set(
      this._moveCurr.x - this._movePrev.x,
      this._moveCurr.y - this._movePrev.y,
      0
    );
    let angle = _moveDirection.length();

    if (angle) {
      this._eye.copy(this.object.camera.transform.position).sub(this.target);

      _eyeDirection.copy(this._eye).normalize();
      _objectUpDirection.copy(this.object.camera.transform.up).normalize();
      _objectSidewaysDirection
        .crossVectors(_objectUpDirection, _eyeDirection)
        .normalize();

      _objectUpDirection.setLength(this._moveCurr.y - this._movePrev.y);
      _objectSidewaysDirection.setLength(this._moveCurr.x - this._movePrev.x);

      _moveDirection.copy(_objectUpDirection.add(_objectSidewaysDirection));

      _axis.crossVectors(_moveDirection, this._eye).normalize();

      angle *= this.rotateSpeed;
      _quaternion.setFromAxisAngle(_axis, angle);

      this._eye.applyQuaternion(_quaternion);
      this.object.camera.transform.up.applyQuaternion(_quaternion);

      this._lastAxis.copy(_axis);
      this._lastAngle = angle;
    } else if (!this.staticMoving && this._lastAngle) {
      this._lastAngle *= Math.sqrt(1.0 - this.dynamicDampingFactor);
      this._eye.copy(this.object.camera.transform.position).sub(this.target);
      _quaternion.setFromAxisAngle(this._lastAxis, this._lastAngle);
      this._eye.applyQuaternion(_quaternion);
      this.object.camera.transform.up.applyQuaternion(_quaternion);
    }

    this._movePrev.copy(this._moveCurr);
  }

  _zoomCamera() {
    let factor;

    if (this.state === _STATE.TOUCH_ZOOM_PAN) {
      factor = this._touchZoomDistanceStart / this._touchZoomDistanceEnd;
      this._touchZoomDistanceStart = this._touchZoomDistanceEnd;

      if (this.object.isPerspectiveCamera) {
        this._eye.multiplyScalar(factor);
      } else if (this.object.isOrthographicCamera) {
        const orthCam = this.object as OrthographicCamera;
        orthCam.zoom = clamp(orthCam.zoom / factor, this.minZoom, this.maxZoom);

        if (this._lastZoom !== orthCam.zoom) {
          this.object.updateProjectionMatrix();
        }
      } else {
        console.warn('THREE.TrackballControls: Unsupported camera type');
      }
    } else {
      factor = 1.0 + (this._zoomEnd.y - this._zoomStart.y) * this.zoomSpeed;

      if (factor !== 1.0 && factor > 0.0) {
        if (this.object.isPerspectiveCamera) {
          this._eye.multiplyScalar(factor);
        } else if (this.object.isOrthographicCamera) {
          const orthCam = this.object as OrthographicCamera;
          orthCam.zoom = clamp(
            orthCam.zoom / factor,
            this.minZoom,
            this.maxZoom
          );

          if (this._lastZoom !== orthCam.zoom) {
            this.object.updateProjectionMatrix();
          }
        } else {
          console.warn('THREE.TrackballControls: Unsupported camera type');
        }
      }

      if (this.staticMoving) {
        this._zoomStart.copy(this._zoomEnd);
      } else {
        this._zoomStart.y +=
          (this._zoomEnd.y - this._zoomStart.y) * this.dynamicDampingFactor;
      }
    }
  }

  _getMouseOnScreen(pageX: i32, pageY: i32) {
    _v2.set(
      (pageX - this.screen.left) / this.screen.width,
      (pageY - this.screen.top) / this.screen.height
    );

    return _v2;
  }

  _getMouseOnCircle(pageX: i32, pageY: i32) {
    _v2.set(
      (pageX - this.screen.width * 0.5 - this.screen.left) /
        (this.screen.width * 0.5),
      (this.screen.height + 2 * (this.screen.top - pageY)) / this.screen.width // screen.width intentional
    );

    return _v2;
  }

  _addPointer(event: PointerEvent) {
    this._pointers.push(event);
  }

  _removePointer(event: PointerEvent) {
    delete this._pointerPositions[event.pointerId];

    for (let i = 0; i < this._pointers.length; i++) {
      if (this._pointers[i].pointerId == event.pointerId) {
        this._pointers.splice(i, 1);
        return;
      }
    }
  }

  _trackPointer(event: PointerEvent) {
    let position = this._pointerPositions[event.pointerId];

    if (position === undefined) {
      position = new Vector2();
      this._pointerPositions[event.pointerId] = position;
    }

    position.set(event.pageX, event.pageY);
  }

  _getSecondPointerPosition(event: PointerEvent) {
    const pointer =
      event.pointerId === this._pointers[0].pointerId
        ? this._pointers[1]
        : this._pointers[0];

    return this._pointerPositions[pointer.pointerId];
  }

  _checkDistances() {
    if (!this.noZoom || !this.noPan) {
      if (this._eye.lengthSq() > this.maxDistance * this.maxDistance) {
        this.object.camera.transform.position.addVectors(
          this.target,
          this._eye.setLength(this.maxDistance)
        );
        this._zoomStart.copy(this._zoomEnd);
      }

      if (this._eye.lengthSq() < this.minDistance * this.minDistance) {
        this.object.camera.transform.position.addVectors(
          this.target,
          this._eye.setLength(this.minDistance)
        );
        this._zoomStart.copy(this._zoomEnd);
      }
    }
  }

  onPointerDown(event: PointerEvent) {
    if (this.enabled === false) return;

    if (this._pointers.length === 0) {
      this.domElement.setPointerCapture(event.pointerId);

      this.domElement.addEventListener('pointermove', this._onPointerMove);
      this.domElement.addEventListener('pointerup', this._onPointerUp);
    }

    //

    this._addPointer(event);

    if (event.pointerType === 'touch') {
      this._onTouchStart(event);
    } else {
      this._onMouseDown(event);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (this.enabled === false) return;

    if (event.pointerType === 'touch') {
      this._onTouchMove(event);
    } else {
      this._onMouseMove(event);
    }
  }

  onPointerUp(event: PointerEvent) {
    if (this.enabled === false) return;

    if (event.pointerType === 'touch') {
      this._onTouchEnd(event);
    } else {
      this._onMouseUp();
    }

    //

    this._removePointer(event);

    if (this._pointers.length === 0) {
      this.domElement.releasePointerCapture(event.pointerId);

      this.domElement.removeEventListener('pointermove', this._onPointerMove);
      this.domElement.removeEventListener('pointerup', this._onPointerUp);
    }
  }

  onPointerCancel(event: PointerEvent) {
    this._removePointer(event);
  }

  onKeyUp() {
    if (this.enabled === false) return;

    this.keyState = _STATE.NONE;

    window.addEventListener('keydown', this._onKeyDown);
  }

  onKeyDown(event: KeyboardEvent) {
    if (this.enabled === false) return;

    window.removeEventListener('keydown', this._onKeyDown);

    if (this.keyState !== _STATE.NONE) {
      return;
    } else if (event.code === this.keys[_STATE.ROTATE] && !this.noRotate) {
      this.keyState = _STATE.ROTATE;
    } else if (event.code === this.keys[_STATE.ZOOM] && !this.noZoom) {
      this.keyState = _STATE.ZOOM;
    } else if (event.code === this.keys[_STATE.PAN] && !this.noPan) {
      this.keyState = _STATE.PAN;
    }
  }

  onMouseDown(event: MouseEvent) {
    let mouseAction;

    switch (event.button) {
      case 0:
        mouseAction = this.mouseButtons.LEFT;
        break;

      case 1:
        mouseAction = this.mouseButtons.MIDDLE;
        break;

      case 2:
        mouseAction = this.mouseButtons.RIGHT;
        break;

      default:
        mouseAction = -1;
    }

    switch (mouseAction) {
      case MOUSE.DOLLY:
        this.state = _STATE.ZOOM;
        break;

      case MOUSE.ROTATE:
        this.state = _STATE.ROTATE;
        break;

      case MOUSE.PAN:
        this.state = _STATE.PAN;
        break;

      default:
        this.state = _STATE.NONE;
    }

    const state = this.keyState !== _STATE.NONE ? this.keyState : this.state;

    if (state === _STATE.ROTATE && !this.noRotate) {
      this._moveCurr.copy(this._getMouseOnCircle(event.pageX, event.pageY));
      this._movePrev.copy(this._moveCurr);
    } else if (state === _STATE.ZOOM && !this.noZoom) {
      this._zoomStart.copy(this._getMouseOnScreen(event.pageX, event.pageY));
      this._zoomEnd.copy(this._zoomStart);
    } else if (state === _STATE.PAN && !this.noPan) {
      this._panStart.copy(this._getMouseOnScreen(event.pageX, event.pageY));
      this._panEnd.copy(this._panStart);
    }

    this.dispatchEvent(_startEvent);
  }

  onMouseMove(event: MouseEvent) {
    const state = this.keyState !== _STATE.NONE ? this.keyState : this.state;

    if (state === _STATE.ROTATE && !this.noRotate) {
      this._movePrev.copy(this._moveCurr);
      this._moveCurr.copy(this._getMouseOnCircle(event.pageX, event.pageY));
    } else if (state === _STATE.ZOOM && !this.noZoom) {
      this._zoomEnd.copy(this._getMouseOnScreen(event.pageX, event.pageY));
    } else if (state === _STATE.PAN && !this.noPan) {
      this._panEnd.copy(this._getMouseOnScreen(event.pageX, event.pageY));
    }
  }

  onMouseUp() {
    this.state = _STATE.NONE;

    this.dispatchEvent(_endEvent);
  }

  onMouseWheel(event: WheelEvent) {
    if (this.enabled === false) return;

    if (this.noZoom === true) return;

    event.preventDefault();

    switch (event.deltaMode) {
      case 2:
        // Zoom in pages
        this._zoomStart.y -= event.deltaY * 0.025;
        break;

      case 1:
        // Zoom in lines
        this._zoomStart.y -= event.deltaY * 0.01;
        break;

      default:
        // undefined, 0, assume pixels
        this._zoomStart.y -= event.deltaY * 0.00025;
        break;
    }

    this.dispatchEvent(_startEvent);
    this.dispatchEvent(_endEvent);
  }

  onContextMenu(event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
  }

  onTouchStart(event: PointerEvent) {
    this._trackPointer(event);

    switch (this._pointers.length) {
      case 1:
        this.state = _STATE.TOUCH_ROTATE;
        this._moveCurr.copy(
          this._getMouseOnCircle(
            this._pointers[0].pageX,
            this._pointers[0].pageY
          )
        );
        this._movePrev.copy(this._moveCurr);
        break;

      default:
        // 2 or more
        this.state = _STATE.TOUCH_ZOOM_PAN;
        const dx = this._pointers[0].pageX - this._pointers[1].pageX;
        const dy = this._pointers[0].pageY - this._pointers[1].pageY;
        this._touchZoomDistanceEnd = this._touchZoomDistanceStart = Math.sqrt(
          dx * dx + dy * dy
        );

        const x = (this._pointers[0].pageX + this._pointers[1].pageX) / 2;
        const y = (this._pointers[0].pageY + this._pointers[1].pageY) / 2;
        this._panStart.copy(this._getMouseOnScreen(x, y));
        this._panEnd.copy(this._panStart);
        break;
    }

    this.dispatchEvent(_startEvent);
  }

  onTouchMove(event: PointerEvent) {
    this._trackPointer(event);

    switch (this._pointers.length) {
      case 1:
        this._movePrev.copy(this._moveCurr);
        this._moveCurr.copy(this._getMouseOnCircle(event.pageX, event.pageY));
        break;

      default:
        // 2 or more

        const position = this._getSecondPointerPosition(event);

        const dx = event.pageX - position.x;
        const dy = event.pageY - position.y;
        this._touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);

        const x = (event.pageX + position.x) / 2;
        const y = (event.pageY + position.y) / 2;
        this._panEnd.copy(this._getMouseOnScreen(x, y));
        break;
    }
  }

  onTouchEnd(event: PointerEvent) {
    switch (this._pointers.length) {
      case 0:
        this.state = _STATE.NONE;
        break;

      case 1:
        this.state = _STATE.TOUCH_ROTATE;
        this._moveCurr.copy(this._getMouseOnCircle(event.pageX, event.pageY));
        this._movePrev.copy(this._moveCurr);
        break;

      case 2:
        this.state = _STATE.TOUCH_ZOOM_PAN;

        for (let i = 0; i < this._pointers.length; i++) {
          if (this._pointers[i].pointerId !== event.pointerId) {
            const position =
              this._pointerPositions[this._pointers[i].pointerId];
            this._moveCurr.copy(this._getMouseOnCircle(position.x, position.y));
            this._movePrev.copy(this._moveCurr);
            break;
          }
        }

        break;
    }

    this.dispatchEvent(_endEvent);
  }

  dispatchEvent(e: { type: string }) {}
}
