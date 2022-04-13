import { Camera } from "../cameras/Camera";
import { Event } from "../core/Event";
import { Listener } from "../core/EventDispatcher";
import { KeyboardEvent, MouseEvent } from "../exports/io";
import { inputManager } from "../exports/io/InputManager";
import { Euler, EulerRotationOrder } from "../math/Euler";
import { Vector3 } from "../math/Vector3";

const _euler = new Euler(0, 0, 0, EulerRotationOrder.YXZ);
const _vector = new Vector3();

// const _changeEvent = { type: "change" };
// const _lockEvent = { type: "lock" };
// const _unlockEvent = { type: "unlock" };

const _PI_2: f32 = Mathf.PI / 2;

const direction = new Vector3(0, 0, -1);

export class PointerLockController implements Listener {
  minPolarAngle: f32;
  maxPolarAngle: f32;
  isLocked: boolean;
  camera: Camera;
  movingForward: boolean;
  movingBackward: boolean;
  movingLeft: boolean;
  movingRight: boolean;
  enabled: boolean;

  constructor(camera: Camera) {
    this.camera = camera;
    this.isLocked = false;
    this.movingForward = false;
    this.movingBackward = false;
    this.movingLeft = false;
    this.movingRight = false;
    this.enabled = true;

    // Set to constrain the pitch of the camera
    // Range is 0 to Math.PI radians
    this.minPolarAngle = 0; // radians
    this.maxPolarAngle = Mathf.PI; // radians

    this.connect();
  }

  onEvent(event: Event): void {
    if (event.type === "mousemove") this.onMouseMove(event.attachment as MouseEvent);
    else if (event.type === "keydown") {
      const keyboardEvent = event.attachment as KeyboardEvent;
      if (keyboardEvent.code == "KeyW") this.movingForward = true;
      else if (keyboardEvent.code == "KeyS") this.movingBackward = true;
      else if (keyboardEvent.code == "KeyA") this.movingLeft = true;
      else if (keyboardEvent.code == "KeyD") this.movingRight = true;
    } else if (event.type === "keyup") {
      const keyboardEvent = event.attachment as KeyboardEvent;
      if (keyboardEvent.code == "KeyW") this.movingForward = false;
      else if (keyboardEvent.code == "KeyS") this.movingBackward = false;
      else if (keyboardEvent.code == "KeyA") this.movingLeft = false;
      else if (keyboardEvent.code == "KeyD") this.movingRight = false;
    }
  }

  update(delta: f32): void {
    if (!this.enabled) return;
    if (this.movingForward) this.moveForward(5 * delta);
    else if (this.movingBackward) this.moveForward(-5 * delta);
    if (this.movingRight) this.moveRight(5 * delta);
    else if (this.movingLeft) this.moveRight(-5 * delta);
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.enabled) return;

    const movementX = f32(event.movementX);
    const movementY = f32(event.movementY);

    _euler.setFromQuaternion(this.camera.quaternion);

    _euler.y -= movementX * 0.002;
    _euler.x -= movementY * 0.002;

    _euler.x = Mathf.max(_PI_2 - this.maxPolarAngle, Mathf.min(_PI_2 - this.minPolarAngle, _euler.x));

    this.camera.quaternion.setFromEuler(_euler, false);
  }

  connect(): void {
    inputManager.addEventListener("mousemove", this);
    inputManager.addEventListener("keydown", this);
    inputManager.addEventListener("keyup", this);
  }

  disconnect(): void {
    inputManager.removeEventListener("mousemove", this);
    inputManager.removeEventListener("keydown", this);
    inputManager.removeEventListener("keyup", this);
  }

  dispose(): void {
    this.disconnect();
  }

  getObject(): Camera {
    return this.camera;
  }

  getDirection(v: Vector3): Vector3 {
    return v.copy(direction).applyQuaternion(this.camera.quaternion);
  }

  moveForward(distance: f32): void {
    // move forward parallel to the xz-plane
    // assumes camera.up is y-up
    _vector.setFromMatrixColumn(this.camera.matrix, 0);

    _vector.crossVectors(this.camera.up, _vector);

    this.camera.position.addScaledVector(_vector, distance);
  }

  moveRight(distance: f32): void {
    _vector.setFromMatrixColumn(this.camera.matrix, 0);

    this.camera.position.addScaledVector(_vector, distance);
  }
}
