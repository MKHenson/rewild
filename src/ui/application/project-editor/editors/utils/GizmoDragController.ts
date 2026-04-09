import { Plane, Quaternion, Ray, Vector3 } from 'rewild-common';
import { Mesh, Renderer, Transform } from 'rewild-renderer';
import { Gizmo } from 'rewild-renderer/lib/helpers/Gizmo';
import { Intersection } from 'rewild-renderer/lib/core/Raycaster';
import {
  GizmoDragMode,
  AXIS_DIRECTIONS,
  PLANE_NORMALS,
  isAxisMode,
  dragModeInvolvesY,
} from './GizmoDragTypes';
import {
  computeObjectHalfHeight,
  placeOnSurface,
  raycastMouseToWorld,
  computeRotationFromNormal,
} from './WorldPlacement';

const _planeHit = new Vector3();
const _constraintPlane = new Plane();
const _delta = new Vector3();
const _newPosition = new Vector3();
const _cameraDir = new Vector3();
const _planeNormal = new Vector3();
const _normalCopy = new Vector3();
const _tempQuat = new Quaternion();

export class GizmoDragController {
  private _isDragging = false;
  private mode: GizmoDragMode = GizmoDragMode.None;
  private startObjectPosition = new Vector3();
  private startObjectRotation: [number, number, number, number] = [0, 0, 0, 1];
  private dragStartPointOnPlane = new Vector3();
  private objectHalfHeight = 0;
  private transform: Transform | null = null;
  private lastRotation: [number, number, number, number] = [0, 0, 0, 1];

  private renderer: Renderer;
  private gizmo: Gizmo;

  constructor(renderer: Renderer, gizmo: Gizmo) {
    this.renderer = renderer;
    this.gizmo = gizmo;
  }

  get isDragging(): boolean {
    return this._isDragging;
  }

  tryStartDrag(
    intersection: Intersection,
    objectTransform: Transform,
    cameraTransform: Transform
  ): boolean {
    const mesh =
      intersection.object.component instanceof Mesh
        ? (intersection.object.component as Mesh)
        : null;

    const part = this.gizmo.identifyMesh(mesh);
    if (!part) return false;

    this.mode = part as GizmoDragMode;
    this.transform = objectTransform;
    this._isDragging = true;

    this.startObjectPosition.copy(objectTransform.position);
    const q = objectTransform.quaternion;
    this.startObjectRotation = [q.x, q.y, q.z, q.w];
    this.lastRotation = [...this.startObjectRotation];
    this.objectHalfHeight = computeObjectHalfHeight(objectTransform);

    this.buildConstraintPlane(cameraTransform);

    // Project the click point onto the constraint plane as our drag start reference
    _constraintPlane.projectPoint(
      intersection.point,
      this.dragStartPointOnPlane
    );

    return true;
  }

  updateDrag(mouseRay: Ray, altKeyHeld: boolean): void {
    if (!this._isDragging || !this.transform) return;

    const autoPlace = !altKeyHeld && !dragModeInvolvesY(this.mode);
    const excludes = [this.transform, this.gizmo.transform];

    if (autoPlace) {
      // Raycast mouse directly against world geometry for intuitive placement
      const worldHit = raycastMouseToWorld(mouseRay, this.renderer, excludes);

      if (worldHit) {
        if (this.mode === GizmoDragMode.PlaneXZ) {
          // Place exactly where the mouse points on the world
          _newPosition.set(
            worldHit.point.x,
            worldHit.point.y + this.objectHalfHeight,
            worldHit.point.z
          );
        } else {
          // Axis constraint: take only the constrained axis from the world hit
          const axisDir = AXIS_DIRECTIONS[this.mode];
          _newPosition.copy(this.startObjectPosition);
          if (axisDir.x !== 0) _newPosition.x = worldHit.point.x;
          if (axisDir.z !== 0) _newPosition.z = worldHit.point.z;

          // Downward raycast at the constrained position for Y
          const surfaceResult = placeOnSurface(
            this.renderer,
            _newPosition,
            this.objectHalfHeight,
            excludes
          );
          if (surfaceResult) {
            _newPosition.y = surfaceResult.y;
          }
        }

        // Apply rotation from surface normal
        const rotation = worldHit.face
          ? computeRotationFromNormal(worldHit.face.normal)
          : this.lastRotation;
        this.lastRotation = rotation;
        this.transform.rotation.setFromQuaternion(
          _tempQuat.set(rotation[0], rotation[1], rotation[2], rotation[3])
        );

        this.transform.position.copy(_newPosition);
        this.gizmo.transform.position.copy(_newPosition);
        this.renderer.sceneBVH?.markObjectMoved(this.transform);
        return;
      }
      // Fall through to constraint-plane math if world raycast misses
    }

    // Constraint-plane math: used for Y-involved modes, alt-held, or world-raycast miss
    const hit = mouseRay.intersectPlane(_constraintPlane, _planeHit);
    if (!hit) return;

    _delta.copy(_planeHit).sub(this.dragStartPointOnPlane);

    if (isAxisMode(this.mode)) {
      const axisDir = AXIS_DIRECTIONS[this.mode];
      const projected = axisDir.dot(_delta);
      _delta.copy(axisDir).multiplyScalar(projected);
    }

    _newPosition.copy(this.startObjectPosition).add(_delta);

    this.transform.position.copy(_newPosition);
    this.gizmo.transform.position.copy(_newPosition);
    this.renderer.sceneBVH?.markObjectMoved(this.transform);
  }

  endDrag(): {
    position: [number, number, number];
    rotation: [number, number, number, number];
  } | null {
    if (!this._isDragging || !this.transform) {
      this.reset();
      return null;
    }

    const pos = this.transform.position;
    const result = {
      position: [pos.x, pos.y, pos.z] as [number, number, number],
      rotation: [...this.lastRotation] as [number, number, number, number],
    };

    this.reset();
    return result;
  }

  setDragMode(mode: GizmoDragMode, cameraTransform: Transform): void {
    if (!this._isDragging || !this.transform) return;
    // Update the start reference to current position so mode change is seamless
    this.startObjectPosition.copy(this.transform.position);
    this.mode = mode;
    this.buildConstraintPlane(cameraTransform);
    // Reset the drag start point on the new plane
    _constraintPlane.projectPoint(
      this.transform.position,
      this.dragStartPointOnPlane
    );
  }

  private buildConstraintPlane(cameraTransform: Transform): void {
    const objectPos = this.startObjectPosition;

    if (isAxisMode(this.mode)) {
      // For axis modes, create a plane that contains the axis and faces the camera
      const axisDir = AXIS_DIRECTIONS[this.mode];
      _cameraDir.copy(objectPos).sub(cameraTransform.position).normalize();

      // Cross product gives plane normal perpendicular to both axis and camera direction
      _planeNormal.crossVectors(axisDir, _cameraDir);
      // Cross again with axis to get a normal that's perpendicular to the axis
      // but in the plane facing the camera
      _planeNormal.crossVectors(_planeNormal, axisDir).normalize();

      if (_planeNormal.lengthSq() < 0.001) {
        // Camera is looking along the axis — fall back to world up or right
        _planeNormal.set(0, 1, 0);
        if (Math.abs(axisDir.dot(_planeNormal)) > 0.9) {
          _planeNormal.set(1, 0, 0);
        }
      }

      _constraintPlane.setFromNormalAndCoplanarPoint(_planeNormal, objectPos);
    } else {
      // For plane modes, use the natural plane normal
      const normal = PLANE_NORMALS[this.mode];
      _constraintPlane.setFromNormalAndCoplanarPoint(
        _normalCopy.copy(normal),
        objectPos
      );
    }
  }

  private reset(): void {
    this._isDragging = false;
    this.mode = GizmoDragMode.None;
    this.transform = null;
    this.objectHalfHeight = 0;
  }
}
