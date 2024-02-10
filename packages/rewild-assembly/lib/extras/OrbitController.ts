import { Camera } from '../cameras/Camera';
import { OrthographicCamera } from '../cameras/OrthographicCamera';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera';
import { inputManager } from './io/InputManager';
import { MouseEvent } from './io/MouseEvent';
import { EngineMatrix4 } from '../math/EngineMatrix4';
import { Spherical, Quaternion, Event, Listener } from 'rewild-common';
import { EngineVector2 } from '../math/Vector2';
import { EngineVector3 } from '../math/Vector3';

enum STATE {
  NONE = -1,
  ROTATE = 0,
  DOLLY = 1,
  PAN = 2,
  TOUCH_ROTATE = 3,
  TOUCH_DOLLY = 4,
  TOUCH_PAN = 5,
}

const EPS: f32 = 0.000001;

export class OrbitController implements Listener {
  object: Camera;
  enabled: boolean;
  target: EngineVector3;
  enableZoom: boolean;
  zoomSpeed: f32;
  minDistance: f32;
  maxDistance: f32;
  enableRotate: boolean;
  rotateSpeed: f32;
  minZoom: f32;
  maxZoom: f32;
  minPolarAngle: f32;
  maxPolarAngle: f32;
  minAzimuthAngle: f32;
  maxAzimuthAngle: f32;
  enablePan: boolean;
  autoRotate: boolean;
  autoRotateSpeed: f32;
  enableDamping: boolean;
  dampingFactor: f32;

  private spherical: Spherical;
  private sphericalDelta: Spherical;
  private scale: f32;
  private zoomChanged: boolean;
  private state: STATE;
  private panOffset: EngineVector3;

  private target0: EngineVector3;
  private position0: EngineVector3;
  private zoom0: f32;

  private rotateStart: EngineVector2;
  private rotateEnd: EngineVector2;
  private rotateDelta: EngineVector2;

  private panStart: EngineVector2;
  private panEnd: EngineVector2;
  private panDelta: EngineVector2;

  private dollyStart: EngineVector2;
  private dollyEnd: EngineVector2;
  private dollyDelta: EngineVector2;

  private updateLastPosition: EngineVector3;
  private updateOffset: EngineVector3;
  private updateQuat: Quaternion;
  private updateLastQuaternion: Quaternion;
  private updateQuatInverse: Quaternion;

  private panLeftV: EngineVector3;
  private panUpV: EngineVector3;
  private panInternalOffset: EngineVector3;

  constructor(object: Camera) {
    this.object = object;

    // Set to false to disable this control
    this.enabled = true;

    // "target" sets the location of focus, where the object orbits around
    this.target = new EngineVector3();

    // How far you can dolly in and out ( PerspectiveCamera only )
    this.minDistance = 0;
    this.maxDistance = Infinity;

    // Set to false to disable rotating
    this.enableRotate = true;
    this.rotateSpeed = 0.2;

    // Set to true to automatically rotate around the target
    // If auto-rotate is enabled, you must call controls.update() in your animation loop
    this.autoRotate = false;
    this.autoRotateSpeed = 2.0; // 30 seconds per round when fps is 60

    this.enableZoom = true;
    this.zoomSpeed = 1.0;
    this.minZoom = 0;
    this.maxZoom = Infinity;

    // How far you can orbit vertically, upper and lower limits.
    // Range is 0 to Mathf.PI radians.
    this.minPolarAngle = 0; // radians
    this.maxPolarAngle = Mathf.PI; // radians

    // How far you can orbit horizontally, upper and lower limits.
    // If set, must be a sub-interval of the interval [ - Mathf.PI, Mathf.PI ].
    this.minAzimuthAngle = -Infinity; // radians
    this.maxAzimuthAngle = Infinity; // radians

    // current position in spherical coordinates
    this.spherical = new Spherical();
    this.sphericalDelta = new Spherical();

    this.scale = 1;
    this.panOffset = new EngineVector3();
    this.zoomChanged = false;

    // Set to true to enable damping (inertia)
    // If damping is enabled, you must call controls.update() in your animation loop
    this.enableDamping = true;
    this.dampingFactor = 0.15;

    // for reset
    this.target0 = new EngineVector3();
    this.position0 = object.position.clone();
    this.zoom0 =
      object instanceof PerspectiveCamera
        ? (object as PerspectiveCamera).zoom
        : (object as OrthographicCamera).zoom;

    // Set to false to disable panning
    this.enablePan = true;

    // for update speedup
    this.updateOffset = new EngineVector3();
    // so camera.up is the orbit axis
    const updateQuat = new Quaternion().setFromUnitVectors(
      object.up,
      new EngineVector3(0, 1, 0)
    ) as Quaternion;
    this.updateQuat = updateQuat;
    this.updateQuatInverse = updateQuat.clone().invert() as Quaternion;
    this.updateLastPosition = new EngineVector3();
    this.updateLastQuaternion = new Quaternion();

    this.rotateStart = new EngineVector2();
    this.rotateEnd = new EngineVector2();
    this.rotateDelta = new EngineVector2();

    this.panStart = new EngineVector2();
    this.panEnd = new EngineVector2();
    this.panDelta = new EngineVector2();

    this.dollyStart = new EngineVector2();
    this.dollyEnd = new EngineVector2();
    this.dollyDelta = new EngineVector2();

    this.panLeftV = new EngineVector3();
    this.panUpV = new EngineVector3();
    this.panInternalOffset = new EngineVector3();

    this.state = STATE.NONE;

    inputManager.addEventListener('wheel', this);
    inputManager.addEventListener('mousedown', this);
  }

  onEvent(event: Event): void {
    const mouseEvent = event.attachment as MouseEvent;
    if (event.type === 'mousedown') this.onMouseDown(mouseEvent);
    else if (event.type === 'mouseup') this.onMouseUp(mouseEvent);
    else if (event.type === 'mousemove') this.onMouseMove(mouseEvent);
    else if (event.type === 'wheel') this.onMouseWheel(mouseEvent);
  }

  private onMouseDown(event: MouseEvent): void {
    if (this.enabled === false) return;

    if (event.button === 0) {
      if (this.enableRotate === false) return;
      this.rotateStart.set(f32(event.clientX), f32(event.clientY));
      this.state = STATE.ROTATE;
    } else if (event.button === 2) {
      if (this.enableZoom === false) return;
      this.dollyStart.set(f32(event.clientX), f32(event.clientY));
      this.state = STATE.DOLLY;
    } else if (event.button === 1) {
      if (this.enablePan === false) return;
      this.panStart.set(f32(event.clientX), f32(event.clientY));
      this.state = STATE.PAN;
    }

    if (this.state != STATE.NONE) {
      inputManager.addEventListener('mousemove', this);
      inputManager.addEventListener('mouseup', this);
      //   this.dispatchEvent(START_EVENT);
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.enabled === false) return;
    //     // event.preventDefault();
    if (this.state === STATE.ROTATE) {
      if (this.enableRotate === false) return;
      this.rotateEnd.set(f32(event.clientX), f32(event.clientY));
      this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);
      // const element = this.domElement === document ? this.domElement.body : this.domElement;
      // rotating across whole screen goes 360 degrees around
      this.rotateLeft(
        ((2 * Mathf.PI * this.rotateDelta.x) / f32(event.targetWidth)) *
          this.rotateSpeed
      );
      // rotating up and down along whole screen attempts to go 360, but limited to 180
      this.rotateUp(
        ((2 * Mathf.PI * this.rotateDelta.y) / f32(event.targetHeight)) *
          this.rotateSpeed
      );
      this.rotateStart.copy(this.rotateEnd);
      this.update();
    } else if (this.state === STATE.DOLLY) {
      if (this.enableZoom === false) return;
      this.dollyEnd.set(f32(event.clientX), f32(event.clientY));
      this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);
      if (this.dollyDelta.y > 0) {
        this.dollyIn(this.getZoomScale());
      } else if (this.dollyDelta.y < 0) {
        this.dollyOut(this.getZoomScale());
      }
      this.dollyStart.copy(this.dollyEnd);
      this.update();
    } else if (this.state === STATE.PAN) {
      if (this.enablePan === false) return;
      this.panEnd.set(f32(event.clientX), f32(event.clientY));
      this.panDelta.subVectors(this.panEnd, this.panStart);
      this.pan(
        this.panDelta.x,
        this.panDelta.y,
        f32(event.targetWidth),
        f32(event.targetHeight)
      );
      this.panStart.copy(this.panEnd);
      this.update();
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (this.enabled === false) return;
    inputManager.removeEventListener('mousemove', this);
    inputManager.removeEventListener('mouseup', this);

    //     this.dispatchEvent(END_EVENT);
    this.state = STATE.NONE;
  }

  private onMouseWheel(event: MouseEvent): void {
    if (
      this.enabled === false ||
      this.enableZoom === false ||
      (this.state != STATE.NONE && this.state != STATE.ROTATE)
    )
      return;

    // event.preventDefault();
    // event.stopPropagation();

    if (event.delta < 0) {
      this.dollyOut(this.getZoomScale());
    } else if (event.delta > 0) {
      this.dollyIn(this.getZoomScale());
    }

    this.update();

    // this.dispatchEvent(START_EVENT); // not sure why these are here...
    // this.dispatchEvent(END_EVENT);
  }

  reset(): void {
    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    if (this._checkPerspectiveCamera(this.object)) {
      (this.object as PerspectiveCamera).zoom = this.zoom0;
      (this.object as PerspectiveCamera).updateProjectionMatrix();
    } else {
      (this.object as OrthographicCamera).zoom = this.zoom0;
      (this.object as OrthographicCamera).updateProjectionMatrix();
    }

    // this.dispatchEvent(CHANGE_EVENT);

    this.update();

    this.state = STATE.NONE;
  }

  saveState(): void {
    this.target0.copy(this.target);
    this.position0.copy(this.object.position);
    // Check whether the camera has zoom property
    if (
      this._checkOrthographicCamera(this.object) ||
      this._checkPerspectiveCamera(this.object)
    ) {
      this.zoom0 = (this.object as OrthographicCamera).zoom;
    }
  }

  update(): boolean {
    const position = this.object.position;
    this.updateOffset.copy(position).sub(this.target);

    // rotate offset to "y-axis-is-up" space
    this.updateOffset.applyQuaternion(this.updateQuat);

    // angle from z-axis around y-axis
    this.spherical.setFromVector3(this.updateOffset);

    if (this.autoRotate && this.state === STATE.NONE) {
      this.rotateLeft(this.getAutoRotationAngle());
    }

    this.spherical.theta += this.sphericalDelta.theta;
    this.spherical.phi += this.sphericalDelta.phi;

    // restrict theta to be between desired limits
    this.spherical.theta = Mathf.max(
      this.minAzimuthAngle,
      Mathf.min(this.maxAzimuthAngle, this.spherical.theta)
    );

    // restrict phi to be between desired limits
    this.spherical.phi = Mathf.max(
      this.minPolarAngle,
      Mathf.min(this.maxPolarAngle, this.spherical.phi)
    );

    this.spherical.makeSafe();

    this.spherical.radius *= this.scale;

    // restrict radius to be between desired limits
    this.spherical.radius = Mathf.max(
      this.minDistance,
      Mathf.min(this.maxDistance, this.spherical.radius)
    );

    // move target to panned location
    this.target.add(this.panOffset);

    this.updateOffset.setFromSpherical(this.spherical);

    // rotate offset back to "camera-up-vector-is-up" space
    this.updateOffset.applyQuaternion(this.updateQuatInverse);

    position.copy(this.target).add(this.updateOffset);

    this.object.lookAt(this.target.x, this.target.y, this.target.z);

    if (this.enableDamping === true) {
      this.sphericalDelta.theta *= 1 - this.dampingFactor;
      this.sphericalDelta.phi *= 1 - this.dampingFactor;
    } else {
      this.sphericalDelta.set(0, 0, 0);
    }

    this.scale = 1;
    this.panOffset.set(0, 0, 0);

    // update condition is:
    // min(camera displacement, camera rotation in radians)^2 > EPS
    // using small-angle approximation cos(x/2) = 1 - x^2 / 8

    if (
      this.zoomChanged ||
      this.updateLastPosition.distanceToSquared(this.object.position) > EPS ||
      8.0 * (1.0 - this.updateLastQuaternion.dot(this.object.quaternion)) > EPS
    ) {
      //   this.dispatchEvent(CHANGE_EVENT);
      this.updateLastPosition.copy(this.object.position);
      this.updateLastQuaternion.copy(this.object.quaternion);
      this.zoomChanged = false;
      return true;
    }
    return false;
  }

  panLeft(distance: f32, objectMatrix: EngineMatrix4): void {
    this.panLeftV.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
    this.panLeftV.multiplyScalar(-distance);
    this.panOffset.add(this.panLeftV);
  }

  panUp(distance: f32, objectMatrix: EngineMatrix4): void {
    this.panUpV.setFromMatrixColumn(objectMatrix, 1); // get Y column of objectMatrix
    this.panUpV.multiplyScalar(distance);
    this.panOffset.add(this.panUpV);
  }

  // deltaX and deltaY are in pixels; right and down are positive
  pan(deltaX: f32, deltaY: f32, clientWidth: f32, clientHeight: f32): void {
    // const element = this.domElement === document ? this.domElement.body : this.domElement;

    if (this._checkPerspectiveCamera(this.object)) {
      const persCam = this.object as PerspectiveCamera;

      // perspective
      const position = persCam.position;
      this.panInternalOffset.copy(position).sub(this.target);
      var targetDistance = this.panInternalOffset.length();

      // half of the fov is center to top of screen
      targetDistance *= Mathf.tan(((persCam.fov / 2) * Mathf.PI) / 180.0);

      // we actually don't use screenWidth, since perspective camera is fixed to screen height
      this.panLeft(
        (2 * deltaX * targetDistance) / clientHeight,
        persCam.matrix
      );
      this.panUp((2 * deltaY * targetDistance) / clientHeight, persCam.matrix);
    } else if (this._checkOrthographicCamera(this.object)) {
      const ortho = this.object as OrthographicCamera;
      // orthographic
      this.panLeft(
        (deltaX * (ortho.right - ortho.left)) / ortho.zoom / clientWidth,
        ortho.matrix
      );
      this.panUp(
        (deltaY * (ortho.top - ortho.bottom)) / ortho.zoom / clientHeight,
        ortho.matrix
      );
    } else {
      // camera neither orthographic nor perspective
      this.enablePan = false;
    }
  }

  dollyIn(dollyScale: f32): void {
    if (this._checkPerspectiveCamera(this.object)) {
      this.scale /= dollyScale;
    } else if (this._checkOrthographicCamera(this.object)) {
      const ortho = this.object as OrthographicCamera;
      ortho.zoom = Mathf.max(
        this.minZoom,
        Mathf.min(this.maxZoom, ortho.zoom * dollyScale)
      );
      ortho.updateProjectionMatrix();
      this.zoomChanged = true;
    } else {
      this.enableZoom = false;
    }
  }

  dollyOut(dollyScale: f32): void {
    if (this._checkPerspectiveCamera(this.object)) {
      this.scale *= dollyScale;
    } else if (this._checkOrthographicCamera(this.object)) {
      const ortho = this.object as OrthographicCamera;
      ortho.zoom = Mathf.max(
        this.minZoom,
        Mathf.min(this.maxZoom, ortho.zoom / dollyScale)
      );
      ortho.updateProjectionMatrix();
      this.zoomChanged = true;
    } else {
      this.enableZoom = false;
    }
  }

  getAutoRotationAngle(): f32 {
    return ((2 * Mathf.PI) / 60 / 60) * this.autoRotateSpeed;
  }

  getZoomScale(): f32 {
    return Mathf.pow(0.95, this.zoomSpeed);
  }

  rotateLeft(angle: f32): void {
    this.sphericalDelta.theta -= angle;
  }

  rotateUp(angle: f32): void {
    this.sphericalDelta.phi -= angle;
  }

  getPolarAngle(): f32 {
    return this.spherical.phi;
  }

  getAzimuthalAngle(): f32 {
    return this.spherical.theta;
  }

  dispose(): void {
    // this.domElement.removeEventListener("contextmenu", this.onContextMenu, false);
    inputManager.removeEventListener('mousedown', this);
    inputManager.removeEventListener('wheel', this);

    // this.domElement.removeEventListener("touchstart", this.onTouchStart, false);
    // this.domElement.removeEventListener("touchend", this.onTouchEnd, false);
    // this.domElement.removeEventListener("touchmove", this.onTouchMove, false);

    inputManager.removeEventListener('mousemove', this);
    inputManager.removeEventListener('mouseup', this);

    // this.window.removeEventListener("keydown", this.onKeyDown, false);
    //this.dispatchEvent( { type: 'dispose' } ); // should this be added here?
  }

  /**
   * TS typeguard. Checks whether the provided camera is PerspectiveCamera.
   * If the check passes (returns true) the passed camera will have the type PerspectiveCamera in the if branch where the check was performed.
   * @param camera Object to be checked.
   */
  private _checkPerspectiveCamera(camera: Camera): boolean {
    return camera instanceof PerspectiveCamera;
  }
  /**
   * TS typeguard. Checks whether the provided camera is OrthographicCamera.
   * If the check passes (returns true) the passed camera will have the type OrthographicCamera in the if branch where the check was performed.
   * @param camera Object to be checked.
   */
  private _checkOrthographicCamera(camera: Camera): boolean {
    return camera instanceof OrthographicCamera;
  }
}
