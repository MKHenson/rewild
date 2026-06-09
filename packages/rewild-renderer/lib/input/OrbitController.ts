import { Matrix4, Quaternion, Spherical, Vector2, Vector3 } from 'rewild-common';
import { ICameraController } from '../../types/ICamera';
import { OrthographicCamera } from '../core/OrthographicCamera';
import { PerspectiveCamera } from '../core/PerspectiveCamera';
import { IController } from './IController';

// Local enums — not exported to avoid clashing with TrackballController's MOUSE/TOUCH exports
enum MOUSE {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  ROTATE = 0,
  DOLLY = 1,
  PAN = 2,
}

enum TOUCH {
  ROTATE = 0,
  PAN = 1,
  DOLLY_PAN = 2,
  DOLLY_ROTATE = 3,
}

const _STATE = {
  NONE: -1,
  ROTATE: 0,
  DOLLY: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
  TOUCH_PAN: 4,
  TOUCH_DOLLY_PAN: 5,
  TOUCH_DOLLY_ROTATE: 6,
};

const _EPS: f32 = 0.000001;
const _twoPI: f32 = 2 * Math.PI;

// Scratch vector — reused across methods to avoid allocations
const _v = new Vector3();

/**
 * Orbit controls — camera orbits around a target point.
 *
 * - Orbit  : left mouse drag (or one-finger touch)
 * - Zoom   : scroll wheel / middle-button drag / two-finger pinch
 * - Pan    : right mouse drag (or left + Ctrl/Shift/Meta) / two-finger drag
 * - Keys   : arrow keys pan; Ctrl/Shift + arrows rotate
 */
export class OrbitController implements IController {
  object: ICameraController;
  domElement: HTMLElement;
  enabled: boolean;
  state: number;

  /** The point the camera orbits around. */
  target: Vector3;
  /** Centre for minTargetRadius / maxTargetRadius clamping. */
  cursor: Vector3;

  minDistance: f32;
  maxDistance: f32;
  minZoom: f32;
  maxZoom: f32;
  minTargetRadius: f32;
  maxTargetRadius: f32;
  minPolarAngle: f32;
  maxPolarAngle: f32;
  minAzimuthAngle: f32;
  maxAzimuthAngle: f32;
  /** Clearance (world units) the camera and target must keep above the terrain surface.
   *  When getTerrainHeight is null, acts as an absolute Y floor instead. */
  minCameraY: f32;
  /** Optional callback that returns terrain Y at a world (x, z) position, or null when
   *  the terrain chunk is not loaded there yet. */
  getTerrainHeight: ((x: number, z: number) => number | null) | null;

  enableDamping: boolean;
  dampingFactor: f32;
  enableZoom: boolean;
  zoomSpeed: f32;
  enableRotate: boolean;
  rotateSpeed: f32;
  keyRotateSpeed: f32;
  enablePan: boolean;
  panSpeed: f32;
  screenSpacePanning: boolean;
  keyPanSpeed: f32;
  autoRotate: boolean;
  autoRotateSpeed: f32;

  keys: { LEFT: string; UP: string; RIGHT: string; BOTTOM: string };
  mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
  touches: { ONE: TOUCH; TWO: TOUCH };

  // Saved state for reset()
  target0: Vector3;
  position0: Vector3;
  zoom0: f32;

  _domElementKeyEvents: HTMLElement | null;

  // Spherical coordinate state
  _spherical: Spherical;
  _sphericalDelta: Spherical;
  _scale: f32;
  _panOffset: Vector3;

  _rotateStart: Vector2;
  _rotateEnd: Vector2;
  _rotateDelta: Vector2;
  _panStart: Vector2;
  _panEnd: Vector2;
  _panDelta: Vector2;
  _dollyStart: Vector2;
  _dollyEnd: Vector2;
  _dollyDelta: Vector2;

  // Quaternion to bring object.up into Y-up space
  _quat: Quaternion;
  _quatInverse: Quaternion;

  _lastPosition: Vector3;
  _lastQuaternion: Quaternion;
  _lastTargetPosition: Vector3;

  _pointers: number[];
  _pointerPositions: { [key: number]: Vector2 };
  _controlActive: boolean;

  _onPointerMove: (e: PointerEvent) => void;
  _onPointerDown: (e: PointerEvent) => void;
  _onPointerUp: (e: PointerEvent) => void;
  _onContextMenu: (e: MouseEvent) => void;
  _onMouseWheel: (e: WheelEvent) => void;
  _onKeyDown: (e: KeyboardEvent) => void;
  _onTouchStart: (e: PointerEvent) => void;
  _onTouchMove: (e: PointerEvent) => void;
  _onMouseDown: (e: MouseEvent) => void;
  _onMouseMove: (e: MouseEvent) => void;
  _interceptControlDown: (e: KeyboardEvent) => void;
  _interceptControlUp: (e: KeyboardEvent) => void;

  constructor(object: ICameraController, domElement: HTMLElement) {
    this.object = object;
    this.domElement = domElement;
    this.enabled = true;
    this.state = _STATE.NONE;

    this.target = new Vector3();
    this.cursor = new Vector3();

    this.minDistance = 0;
    this.maxDistance = Infinity;
    this.minZoom = 0;
    this.maxZoom = Infinity;
    this.minTargetRadius = 0;
    this.maxTargetRadius = Infinity;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle = Infinity;
    this.minCameraY = 0;
    this.getTerrainHeight = null;

    this.enableDamping = false;
    this.dampingFactor = 0.05;
    this.enableZoom = true;
    this.zoomSpeed = 1.0;
    this.enableRotate = true;
    this.rotateSpeed = 1.0;
    this.keyRotateSpeed = 1.0;
    this.enablePan = true;
    this.panSpeed = 1.0;
    this.screenSpacePanning = true;
    this.keyPanSpeed = 7.0;
    this.autoRotate = false;
    this.autoRotateSpeed = 2.0;

    this.keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp',
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown',
    };
    this.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
    this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

    this.target0 = this.target.clone();
    this.position0 = this.object.camera.transform.position.clone();
    this.zoom0 = this.object.zoom;

    this._domElementKeyEvents = null;

    this._spherical = new Spherical();
    this._sphericalDelta = new Spherical();
    this._scale = 1;
    this._panOffset = new Vector3();

    this._rotateStart = new Vector2();
    this._rotateEnd = new Vector2();
    this._rotateDelta = new Vector2();
    this._panStart = new Vector2();
    this._panEnd = new Vector2();
    this._panDelta = new Vector2();
    this._dollyStart = new Vector2();
    this._dollyEnd = new Vector2();
    this._dollyDelta = new Vector2();

    this._quat = new Quaternion().setFromUnitVectors(
      object.camera.transform.up,
      new Vector3(0, 1, 0)
    );
    this._quatInverse = this._quat.clone().invert();

    this._lastPosition = new Vector3();
    this._lastQuaternion = new Quaternion();
    this._lastTargetPosition = new Vector3();

    this._pointers = [];
    this._pointerPositions = {};
    this._controlActive = false;

    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onContextMenu = this.onContextMenu.bind(this);
    this._onMouseWheel = this.onMouseWheel.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onTouchStart = this.onTouchStart.bind(this);
    this._onTouchMove = this.onTouchMove.bind(this);
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._interceptControlDown = this.interceptControlDown.bind(this);
    this._interceptControlUp = this.interceptControlUp.bind(this);

    if (domElement !== null) {
      this.connect();
    }

    this.update();
  }

  connect(element?: HTMLElement | null) {
    if (element) this.domElement = element;

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointercancel', this._onPointerUp);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('wheel', this._onMouseWheel, {
      passive: false,
    });

    const doc = this.domElement.getRootNode() as EventTarget;
    doc.addEventListener('keydown', this._interceptControlDown as EventListener, {
      passive: true,
      capture: true,
    });

    this.domElement.style.touchAction = 'none';
  }

  disconnect() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('wheel', this._onMouseWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);

    this.stopListenToKeyEvents();

    const doc = this.domElement.getRootNode() as EventTarget;
    doc.removeEventListener('keydown', this._interceptControlDown as EventListener, true);

    this.domElement.style.touchAction = 'auto';
  }

  dispose() {
    this.disconnect();
  }

  onWindowResize() {
    // Uses domElement.clientWidth/Height directly — nothing to cache here
  }

  lookAt(x: number, y: number, z: number) {
    this.target.set(x, y, z);
    this.update();
    return this;
  }

  cancelInteraction() {
    this.state = _STATE.NONE;
    this._sphericalDelta.set(0, 0, 0);
    this._panOffset.set(0, 0, 0);
    this._scale = 1;
  }

  saveState() {
    this.target0.copy(this.target);
    this.position0.copy(this.object.camera.transform.position);
    this.zoom0 = this.object.zoom;
  }

  reset() {
    this.target.copy(this.target0);
    this.object.camera.transform.position.copy(this.position0);
    this.object.zoom = this.zoom0;
    this.object.updateProjectionMatrix();
    this.update();
    this.state = _STATE.NONE;
  }

  listenToKeyEvents(domElement: HTMLElement) {
    domElement.addEventListener('keydown', this._onKeyDown);
    this._domElementKeyEvents = domElement;
  }

  stopListenToKeyEvents() {
    if (this._domElementKeyEvents !== null) {
      this._domElementKeyEvents.removeEventListener('keydown', this._onKeyDown);
      this._domElementKeyEvents = null;
    }
  }

  update(delta: number = 0) {
    const position = this.object.camera.transform.position;

    _v.copy(position).sub(this.target);

    // Rotate offset into Y-up space
    _v.applyQuaternion(this._quat);

    this._spherical.setFromVector3(_v);

    if (this.autoRotate && this.state === _STATE.NONE) {
      this._rotateLeft(this._getAutoRotationAngle(delta));
    }

    if (this.enableDamping) {
      this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
      this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
    } else {
      this._spherical.theta += this._sphericalDelta.theta;
      this._spherical.phi += this._sphericalDelta.phi;
    }

    // Clamp azimuth angle
    let min = this.minAzimuthAngle;
    let max = this.maxAzimuthAngle;

    if (isFinite(min) && isFinite(max)) {
      if (min < -Math.PI) min += _twoPI;
      else if (min > Math.PI) min -= _twoPI;

      if (max < -Math.PI) max += _twoPI;
      else if (max > Math.PI) max -= _twoPI;

      if (min <= max) {
        this._spherical.theta = Math.max(min, Math.min(max, this._spherical.theta));
      } else {
        this._spherical.theta =
          this._spherical.theta > (min + max) / 2
            ? Math.max(min, this._spherical.theta)
            : Math.min(max, this._spherical.theta);
      }
    }

    // Clamp polar angle
    this._spherical.phi = Math.max(
      this.minPolarAngle,
      Math.min(this.maxPolarAngle, this._spherical.phi)
    );
    this._spherical.makeSafe();

    // Apply pan offset (with optional damping)
    if (this.enableDamping) {
      this.target.addScaledVector(this._panOffset, this.dampingFactor);
    } else {
      this.target.add(this._panOffset);
    }

    // Clamp target distance from cursor
    this.target.sub(this.cursor);
    this.target.clampLength(this.minTargetRadius, this.maxTargetRadius);
    this.target.add(this.cursor);

    // Scale radius (zoom)
    const prevRadius = this._spherical.radius;
    this._spherical.radius = this._clampDistance(this._spherical.radius * this._scale);
    const zoomChanged = prevRadius !== this._spherical.radius;

    _v.setFromSpherical(this._spherical);

    // Rotate back to camera-up-vector space
    _v.applyQuaternion(this._quatInverse);

    position.copy(this.target).add(_v);

    // Keep the camera above terrain
    if (this.getTerrainHeight) {
      const th = this.getTerrainHeight(position.x, position.z);
      if (th !== null && position.y < th + this.minCameraY) {
        position.y = th + this.minCameraY;
      }
    }

    this.object.camera.lookAt(this.target.x, this.target.y, this.target.z);

    // Orthographic zoom
    if (this.object.isOrthographicCamera) {
      const prevZoom = this.object.zoom;
      this.object.zoom = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.object.zoom / this._scale)
      );
      if (prevZoom !== this.object.zoom) {
        this.object.updateProjectionMatrix();
      }
    }

    // Reset deltas
    if (this.enableDamping) {
      this._sphericalDelta.theta *= 1 - this.dampingFactor;
      this._sphericalDelta.phi *= 1 - this.dampingFactor;
      this._panOffset.multiplyScalar(1 - this.dampingFactor);
    } else {
      this._sphericalDelta.set(0, 0, 0);
      this._panOffset.set(0, 0, 0);
    }

    this._scale = 1;

    // Determine if the camera actually moved
    if (
      zoomChanged ||
      this._lastPosition.distanceToSquared(this.object.camera.transform.position) > _EPS ||
      8 * (1 - this._lastQuaternion.dot(this.object.camera.transform.quaternion)) > _EPS ||
      this._lastTargetPosition.distanceToSquared(this.target) > _EPS
    ) {
      this._lastPosition.copy(this.object.camera.transform.position);
      this._lastQuaternion.copy(this.object.camera.transform.quaternion);
      this._lastTargetPosition.copy(this.target);
      return true;
    }

    return false;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  _getAutoRotationAngle(deltaTime: number): f32 {
    if (deltaTime > 0) {
      return (_twoPI / 60) * this.autoRotateSpeed * deltaTime;
    }
    return (_twoPI / 60 / 60) * this.autoRotateSpeed;
  }

  _getZoomScale(delta: number): f32 {
    return Math.pow(0.95, this.zoomSpeed * Math.abs(delta * 0.01));
  }

  _rotateLeft(angle: f32) {
    this._sphericalDelta.theta -= angle;
  }

  _rotateUp(angle: f32) {
    this._sphericalDelta.phi -= angle;
  }

  _panLeft(distance: f32, objectMatrix: Matrix4) {
    _v.setFromMatrixColumn(objectMatrix, 0); // camera X axis
    _v.multiplyScalar(-distance);
    this._panOffset.add(_v);
  }

  _panUp(distance: f32, objectMatrix: Matrix4) {
    if (this.screenSpacePanning) {
      _v.setFromMatrixColumn(objectMatrix, 1); // camera Y axis
    } else {
      _v.setFromMatrixColumn(objectMatrix, 0);
      _v.crossVectors(this.object.camera.transform.up, _v);
    }
    _v.multiplyScalar(distance);
    this._panOffset.add(_v);
  }

  _pan(deltaX: f32, deltaY: f32) {
    const el = this.domElement;
    const matrix = this.object.camera.transform.matrixWorld;

    if (this.object.isPerspectiveCamera) {
      const perspCam = this.object as PerspectiveCamera;
      _v.copy(this.object.camera.transform.position).sub(this.target);
      let targetDistance = _v.length();
      targetDistance *= Math.tan(((perspCam.fov / 2) * Math.PI) / 180.0);
      this._panLeft((2 * deltaX * targetDistance) / el.clientHeight, matrix);
      this._panUp((2 * deltaY * targetDistance) / el.clientHeight, matrix);
    } else if (this.object.isOrthographicCamera) {
      const orthCam = this.object as OrthographicCamera;
      this._panLeft(
        (deltaX * (orthCam.right - orthCam.left)) / this.object.zoom / el.clientWidth,
        matrix
      );
      this._panUp(
        (deltaY * (orthCam.top - orthCam.bottom)) / this.object.zoom / el.clientHeight,
        matrix
      );
    } else {
      console.warn('OrbitController: unknown camera type — pan disabled.');
      this.enablePan = false;
    }
  }

  _dollyOut(scale: f32) {
    if (this.object.isPerspectiveCamera || this.object.isOrthographicCamera) {
      this._scale /= scale;
    } else {
      console.warn('OrbitController: unknown camera type — dolly disabled.');
      this.enableZoom = false;
    }
  }

  _dollyIn(scale: f32) {
    if (this.object.isPerspectiveCamera || this.object.isOrthographicCamera) {
      this._scale *= scale;
    } else {
      console.warn('OrbitController: unknown camera type — dolly disabled.');
      this.enableZoom = false;
    }
  }

  _clampDistance(dist: f32): f32 {
    return Math.max(this.minDistance, Math.min(this.maxDistance, dist));
  }

  // ─── Mouse handlers ───────────────────────────────────────────────────────

  _handleMouseDownRotate(event: MouseEvent) {
    this._rotateStart.set(event.clientX, event.clientY);
  }

  _handleMouseDownDolly(event: MouseEvent) {
    this._dollyStart.set(event.clientX, event.clientY);
  }

  _handleMouseDownPan(event: MouseEvent) {
    this._panStart.set(event.clientX, event.clientY);
  }

  _handleMouseMoveRotate(event: MouseEvent) {
    this._rotateEnd.set(event.clientX, event.clientY);
    this._rotateDelta
      .subVectors(this._rotateEnd, this._rotateStart)
      .multiplyScalar(this.rotateSpeed);

    const el = this.domElement;
    this._rotateLeft((_twoPI * this._rotateDelta.x) / el.clientHeight);
    this._rotateUp((_twoPI * this._rotateDelta.y) / el.clientHeight);
    this._rotateStart.copy(this._rotateEnd);
    this.update();
  }

  _handleMouseMoveDolly(event: MouseEvent) {
    this._dollyEnd.set(event.clientX, event.clientY);
    this._dollyDelta.subVectors(this._dollyEnd, this._dollyStart);

    if (this._dollyDelta.y > 0) {
      this._dollyOut(this._getZoomScale(this._dollyDelta.y));
    } else if (this._dollyDelta.y < 0) {
      this._dollyIn(this._getZoomScale(this._dollyDelta.y));
    }

    this._dollyStart.copy(this._dollyEnd);
    this.update();
  }

  _handleMouseMovePan(event: MouseEvent) {
    this._panEnd.set(event.clientX, event.clientY);
    this._panDelta
      .subVectors(this._panEnd, this._panStart)
      .multiplyScalar(this.panSpeed);

    this._pan(this._panDelta.x, this._panDelta.y);
    this._panStart.copy(this._panEnd);
    this.update();
  }

  _handleMouseWheel(event: { clientX: number; clientY: number; deltaY: number }) {
    if (event.deltaY < 0) {
      this._dollyIn(this._getZoomScale(event.deltaY));
    } else if (event.deltaY > 0) {
      this._dollyOut(this._getZoomScale(event.deltaY));
    }
    this.update();
  }

  _handleKeyDown(event: KeyboardEvent) {
    let needsUpdate = false;

    switch (event.code) {
      case this.keys.UP:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enableRotate)
            this._rotateUp((_twoPI * this.keyRotateSpeed) / this.domElement.clientHeight);
        } else {
          if (this.enablePan) this._pan(0, this.keyPanSpeed);
        }
        needsUpdate = true;
        break;

      case this.keys.BOTTOM:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enableRotate)
            this._rotateUp((-_twoPI * this.keyRotateSpeed) / this.domElement.clientHeight);
        } else {
          if (this.enablePan) this._pan(0, -this.keyPanSpeed);
        }
        needsUpdate = true;
        break;

      case this.keys.LEFT:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enableRotate)
            this._rotateLeft((_twoPI * this.keyRotateSpeed) / this.domElement.clientHeight);
        } else {
          if (this.enablePan) this._pan(this.keyPanSpeed, 0);
        }
        needsUpdate = true;
        break;

      case this.keys.RIGHT:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enableRotate)
            this._rotateLeft((-_twoPI * this.keyRotateSpeed) / this.domElement.clientHeight);
        } else {
          if (this.enablePan) this._pan(-this.keyPanSpeed, 0);
        }
        needsUpdate = true;
        break;
    }

    if (needsUpdate) {
      event.preventDefault();
      this.update();
    }
  }

  // ─── Touch handlers ───────────────────────────────────────────────────────

  _handleTouchStartRotate(event: PointerEvent) {
    if (this._pointers.length === 1) {
      this._rotateStart.set(event.pageX, event.pageY);
    } else {
      const pos = this._getSecondPointerPosition(event);
      this._rotateStart.set(
        0.5 * (event.pageX + pos.x),
        0.5 * (event.pageY + pos.y)
      );
    }
  }

  _handleTouchStartPan(event: PointerEvent) {
    if (this._pointers.length === 1) {
      this._panStart.set(event.pageX, event.pageY);
    } else {
      const pos = this._getSecondPointerPosition(event);
      this._panStart.set(
        0.5 * (event.pageX + pos.x),
        0.5 * (event.pageY + pos.y)
      );
    }
  }

  _handleTouchStartDolly(event: PointerEvent) {
    const pos = this._getSecondPointerPosition(event);
    const dx = event.pageX - pos.x;
    const dy = event.pageY - pos.y;
    this._dollyStart.set(0, Math.sqrt(dx * dx + dy * dy));
  }

  _handleTouchStartDollyPan(event: PointerEvent) {
    if (this.enableZoom) this._handleTouchStartDolly(event);
    if (this.enablePan) this._handleTouchStartPan(event);
  }

  _handleTouchStartDollyRotate(event: PointerEvent) {
    if (this.enableZoom) this._handleTouchStartDolly(event);
    if (this.enableRotate) this._handleTouchStartRotate(event);
  }

  _handleTouchMoveRotate(event: PointerEvent) {
    if (this._pointers.length === 1) {
      this._rotateEnd.set(event.pageX, event.pageY);
    } else {
      const pos = this._getSecondPointerPosition(event);
      this._rotateEnd.set(
        0.5 * (event.pageX + pos.x),
        0.5 * (event.pageY + pos.y)
      );
    }

    this._rotateDelta
      .subVectors(this._rotateEnd, this._rotateStart)
      .multiplyScalar(this.rotateSpeed);

    const el = this.domElement;
    this._rotateLeft((_twoPI * this._rotateDelta.x) / el.clientHeight);
    this._rotateUp((_twoPI * this._rotateDelta.y) / el.clientHeight);
    this._rotateStart.copy(this._rotateEnd);
  }

  _handleTouchMovePan(event: PointerEvent) {
    if (this._pointers.length === 1) {
      this._panEnd.set(event.pageX, event.pageY);
    } else {
      const pos = this._getSecondPointerPosition(event);
      this._panEnd.set(
        0.5 * (event.pageX + pos.x),
        0.5 * (event.pageY + pos.y)
      );
    }

    this._panDelta
      .subVectors(this._panEnd, this._panStart)
      .multiplyScalar(this.panSpeed);
    this._pan(this._panDelta.x, this._panDelta.y);
    this._panStart.copy(this._panEnd);
  }

  _handleTouchMoveDolly(event: PointerEvent) {
    const pos = this._getSecondPointerPosition(event);
    const dx = event.pageX - pos.x;
    const dy = event.pageY - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    this._dollyEnd.set(0, distance);
    this._dollyDelta.set(
      0,
      Math.pow(this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed)
    );
    this._dollyOut(this._dollyDelta.y);
    this._dollyStart.copy(this._dollyEnd);
  }

  _handleTouchMoveDollyPan(event: PointerEvent) {
    if (this.enableZoom) this._handleTouchMoveDolly(event);
    if (this.enablePan) this._handleTouchMovePan(event);
  }

  _handleTouchMoveDollyRotate(event: PointerEvent) {
    if (this.enableZoom) this._handleTouchMoveDolly(event);
    if (this.enableRotate) this._handleTouchMoveRotate(event);
  }

  // ─── Pointer tracking ─────────────────────────────────────────────────────

  _addPointer(event: PointerEvent) {
    this._pointers.push(event.pointerId);
  }

  _removePointer(event: PointerEvent) {
    delete this._pointerPositions[event.pointerId];
    for (let i = 0; i < this._pointers.length; i++) {
      if (this._pointers[i] === event.pointerId) {
        this._pointers.splice(i, 1);
        return;
      }
    }
  }

  _isTrackingPointer(event: PointerEvent): boolean {
    for (let i = 0; i < this._pointers.length; i++) {
      if (this._pointers[i] === event.pointerId) return true;
    }
    return false;
  }

  _trackPointer(event: PointerEvent) {
    let position = this._pointerPositions[event.pointerId];
    if (position === undefined) {
      position = new Vector2();
      this._pointerPositions[event.pointerId] = position;
    }
    position.set(event.pageX, event.pageY);
  }

  _getSecondPointerPosition(event: PointerEvent): Vector2 {
    const id =
      event.pointerId === this._pointers[0] ? this._pointers[1] : this._pointers[0];
    return this._pointerPositions[id];
  }

  _customWheelEvent(event: WheelEvent): { clientX: number; clientY: number; deltaY: number } {
    const newEvent = {
      clientX: event.clientX,
      clientY: event.clientY,
      deltaY: event.deltaY,
    };

    switch (event.deltaMode) {
      case 1: // LINE_MODE
        newEvent.deltaY *= 16;
        break;
      case 2: // PAGE_MODE
        newEvent.deltaY *= 100;
        break;
    }

    // Pinch-to-zoom via Ctrl generates smaller deltas — amplify to match wheel feel
    if (event.ctrlKey && !this._controlActive) {
      newEvent.deltaY *= 10;
    }

    return newEvent;
  }

  // ─── DOM event listeners ──────────────────────────────────────────────────

  onPointerDown(event: PointerEvent) {
    if (!this.enabled) return;

    if (this._pointers.length === 0) {
      this.domElement.setPointerCapture(event.pointerId);
      this.domElement.addEventListener('pointermove', this._onPointerMove);
      this.domElement.addEventListener('pointerup', this._onPointerUp);
    }

    if (this._isTrackingPointer(event)) return;

    this._addPointer(event);

    if (event.pointerType === 'touch') {
      this.onTouchStart(event);
    } else {
      this.onMouseDown(event);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (!this.enabled) return;

    if (event.pointerType === 'touch') {
      this.onTouchMove(event);
    } else {
      this.onMouseMove(event);
    }
  }

  onPointerUp(event: PointerEvent) {
    this._removePointer(event);

    switch (this._pointers.length) {
      case 0:
        this.domElement.releasePointerCapture(event.pointerId);
        this.domElement.removeEventListener('pointermove', this._onPointerMove);
        this.domElement.removeEventListener('pointerup', this._onPointerUp);
        this.state = _STATE.NONE;
        break;

      case 1: {
        const id = this._pointers[0];
        const pos = this._pointerPositions[id];
        // Revert to single-touch state
        this.onTouchStart({ pointerId: id, pageX: pos.x, pageY: pos.y } as PointerEvent);
        break;
      }
    }
  }

  onMouseDown(event: MouseEvent) {
    let mouseAction: MOUSE;

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
        mouseAction = -1 as MOUSE;
    }

    switch (mouseAction) {
      case MOUSE.DOLLY:
        if (!this.enableZoom) return;
        this._handleMouseDownDolly(event);
        this.state = _STATE.DOLLY;
        break;

      case MOUSE.ROTATE:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (!this.enablePan) return;
          this._handleMouseDownPan(event);
          this.state = _STATE.PAN;
        } else {
          if (!this.enableRotate) return;
          this._handleMouseDownRotate(event);
          this.state = _STATE.ROTATE;
        }
        break;

      case MOUSE.PAN:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (!this.enableRotate) return;
          this._handleMouseDownRotate(event);
          this.state = _STATE.ROTATE;
        } else {
          if (!this.enablePan) return;
          this._handleMouseDownPan(event);
          this.state = _STATE.PAN;
        }
        break;

      default:
        this.state = _STATE.NONE;
    }
  }

  onMouseMove(event: MouseEvent) {
    switch (this.state) {
      case _STATE.ROTATE:
        if (!this.enableRotate) return;
        this._handleMouseMoveRotate(event);
        break;

      case _STATE.DOLLY:
        if (!this.enableZoom) return;
        this._handleMouseMoveDolly(event);
        break;

      case _STATE.PAN:
        if (!this.enablePan) return;
        this._handleMouseMovePan(event);
        break;
    }
  }

  onMouseWheel(event: WheelEvent) {
    if (!this.enabled || !this.enableZoom || this.state !== _STATE.NONE) return;

    event.preventDefault();
    this._handleMouseWheel(this._customWheelEvent(event));
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.enabled) return;
    this._handleKeyDown(event);
  }

  onTouchStart(event: PointerEvent) {
    this._trackPointer(event);

    switch (this._pointers.length) {
      case 1:
        switch (this.touches.ONE) {
          case TOUCH.ROTATE:
            if (!this.enableRotate) return;
            this._handleTouchStartRotate(event);
            this.state = _STATE.TOUCH_ROTATE;
            break;

          case TOUCH.PAN:
            if (!this.enablePan) return;
            this._handleTouchStartPan(event);
            this.state = _STATE.TOUCH_PAN;
            break;

          default:
            this.state = _STATE.NONE;
        }
        break;

      case 2:
        switch (this.touches.TWO) {
          case TOUCH.DOLLY_PAN:
            if (!this.enableZoom && !this.enablePan) return;
            this._handleTouchStartDollyPan(event);
            this.state = _STATE.TOUCH_DOLLY_PAN;
            break;

          case TOUCH.DOLLY_ROTATE:
            if (!this.enableZoom && !this.enableRotate) return;
            this._handleTouchStartDollyRotate(event);
            this.state = _STATE.TOUCH_DOLLY_ROTATE;
            break;

          default:
            this.state = _STATE.NONE;
        }
        break;

      default:
        this.state = _STATE.NONE;
    }
  }

  onTouchMove(event: PointerEvent) {
    this._trackPointer(event);

    switch (this.state) {
      case _STATE.TOUCH_ROTATE:
        if (!this.enableRotate) return;
        this._handleTouchMoveRotate(event);
        this.update();
        break;

      case _STATE.TOUCH_PAN:
        if (!this.enablePan) return;
        this._handleTouchMovePan(event);
        this.update();
        break;

      case _STATE.TOUCH_DOLLY_PAN:
        if (!this.enableZoom && !this.enablePan) return;
        this._handleTouchMoveDollyPan(event);
        this.update();
        break;

      case _STATE.TOUCH_DOLLY_ROTATE:
        if (!this.enableZoom && !this.enableRotate) return;
        this._handleTouchMoveDollyRotate(event);
        this.update();
        break;

      default:
        this.state = _STATE.NONE;
    }
  }

  onContextMenu(event: MouseEvent) {
    if (!this.enabled) return;
    event.preventDefault();
  }

  interceptControlDown(event: KeyboardEvent) {
    if (event.key === 'Control') {
      this._controlActive = true;
      const doc = this.domElement.getRootNode() as EventTarget;
      doc.addEventListener('keyup', this._interceptControlUp as EventListener, {
        passive: true,
        capture: true,
      });
    }
  }

  interceptControlUp(event: KeyboardEvent) {
    if (event.key === 'Control') {
      this._controlActive = false;
      const doc = this.domElement.getRootNode() as EventTarget;
      doc.removeEventListener('keyup', this._interceptControlUp as EventListener, true);
    }
  }

  dispatchEvent(_e: { type: string }) {}
}
