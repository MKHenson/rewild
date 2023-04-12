import { BODY_NULL, BODY_DYNAMIC, BODY_STATIC } from "../constants";
import { MassInfo } from "../shape/MassInfo";
import { _Math } from "../math/Math";
import { Mat33 } from "../math/Mat33";
import { Quat } from "../math/Quat";
import { Vec3 } from "../math/Vec3";
import { Shape } from "../shape/Shape";
import { ContactLink } from "../constraint/contact/ContactLink";
import { JointLink } from "../constraint/joint/JointLink";
import { World } from "./World";
import { PhysicsObject } from "./PhysicsObject";
import { TransformNode } from "../../core/TransformNode";

/**
 * The class of rigid body.
 * Rigid body has the shape of a single or multiple collision processing,
 * I can set the parameters individually.
 * @author saharan
 * @author lo-th
 */

export class RigidBody extends PhysicsObject {
  position: Vec3;
  orientation: Quat;

  scale: f32;
  invScale: f32;

  // possible link to three Mesh;
  mesh: TransformNode | null;

  // The maximum number of shapes that can be added to a one rigid.
  //MAX_SHAPES = 64;//64;

  prev: RigidBody | null;
  next: RigidBody | null;

  // I represent the kind of rigid body.
  // Please do not change from the outside this variable.
  // If you want to change the type of rigid body, always
  // Please specify the type you want to set the arguments of setupMass method.
  type: i32;

  massInfo: MassInfo;

  newPosition: Vec3;
  controlPos: boolean;
  newOrientation: Quat;
  newRotation: Vec3;
  currentRotation: Vec3;
  controlRot: boolean;
  controlRotInTime: boolean;

  quaternion: Quat;
  pos: Vec3;

  // Is the translational velocity.
  linearVelocity: Vec3;
  // Is the angular velocity.
  angularVelocity: Vec3;

  //--------------------------------------------
  //  Please do not change from the outside this variables.
  //--------------------------------------------

  // It is a world that rigid body has been added.
  parent: World | null;
  contactLink: ContactLink | null;
  numContacts: i32;

  // An array of shapes that are included in the rigid body.
  shapes: Shape | null;
  // The number of shapes that are included in the rigid body.
  numShapes: i32;

  // It is the link array of joint that is connected to the rigid body.
  jointLink: JointLink | null;
  // The number of joints that are connected to the rigid body.
  numJoints: i32;
  // It is the world coordinate of the center of gravity in the sleep just before.
  private sleepPosition: Vec3;
  // It is a quaternion that represents the attitude of sleep just before.
  private sleepOrientation: Quat;
  // I will show this rigid body to determine whether it is a rigid body static.
  isStatic: boolean;
  // I indicates that this rigid body to determine whether it is a rigid body dynamic.
  isDynamic: boolean;

  isKinematic: boolean;

  // It is a rotation matrix representing the orientation.
  rotation: Mat33;

  //--------------------------------------------
  // It will be recalculated automatically from the shape, which is included.
  //--------------------------------------------

  // This is the weight.
  private mass: f32;
  // It is the reciprocal of the mass.
  inverseMass: f32;
  // It is the inverse of the inertia tensor in the world system.
  inverseInertia: Mat33;
  // It is the inertia tensor in the initial state.
  private localInertia: Mat33;
  // It is the inverse of the inertia tensor in the initial state.
  private inverseLocalInertia: Mat33;

  private tmpInertia: Mat33;

  // I indicates rigid body whether it has been added to the simulation Island.
  addedToIsland: boolean;
  // It shows how to sleep rigid body.
  allowSleep: boolean;
  // This is the time from when the rigid body at rest.
  sleepTime: f32;
  // I shows rigid body to determine whether it is a sleep state.
  sleeping: boolean;

  constructor(Position: Vec3, Rotation: Quat) {
    super();
    this.position = Position || new Vec3();
    this.orientation = Rotation || new Quat();

    this.scale = 1;
    this.invScale = 1;

    this.mesh = null;

    this.id = i32.MAX_VALUE;
    this.name = "";

    this.prev = null;
    this.next = null;

    this.type = BODY_NULL;

    this.massInfo = new MassInfo();

    this.newPosition = new Vec3();
    this.controlPos = false;
    this.newOrientation = new Quat();
    this.newRotation = new Vec3();
    this.currentRotation = new Vec3();
    this.controlRot = false;
    this.controlRotInTime = false;

    this.quaternion = new Quat();
    this.pos = new Vec3();

    this.linearVelocity = new Vec3();
    this.angularVelocity = new Vec3();

    this.parent = null;
    this.contactLink = null;
    this.numContacts = 0;

    this.shapes = null;
    this.numShapes = 0;

    this.jointLink = null;
    this.numJoints = 0;

    this.sleepPosition = new Vec3();
    this.sleepOrientation = new Quat();
    this.isStatic = false;
    this.isDynamic = false;

    this.isKinematic = false;

    this.rotation = new Mat33();

    this.mass = 0;
    this.inverseMass = 0;
    this.inverseInertia = new Mat33();
    this.localInertia = new Mat33();
    this.inverseLocalInertia = new Mat33();

    this.tmpInertia = new Mat33();

    this.addedToIsland = false;
    this.allowSleep = true;
    this.sleepTime = 0;
    this.sleeping = false;
  }

  setParent(world: World): void {
    this.parent = world;
    this.scale = this.parent!.scale;
    this.invScale = this.parent!.invScale;
    this.id = this.parent!.numRigidBodies;
    if (!this.name) this.name = this.id.toString();

    this.updateMesh();
  }

  /**
   * I'll add a shape to rigid body.
   * If you add a shape, please call the setupMass method to step up to the start of the next.
   * @param   shape shape to Add
   */
  addShape(shape: Shape): void {
    if (shape.parent) {
      throw new Error("It is not possible that you add a shape which already has an associated body.");
    }

    if (this.shapes != null) {
      this.shapes!.prev = shape;
      shape.next = this.shapes;
    }
    this.shapes = shape;
    shape.parent = this;
    if (this.parent) this.parent!.addShape(shape);
    this.numShapes++;
  }
  /**
   * I will delete the shape from the rigid body.
   * If you delete a shape, please call the setupMass method to step up to the start of the next.
   * @param shape {Shape} to delete
   * @return void
   */
  removeShape(shape: Shape): void {
    const remove = shape;
    if (remove.parent != this) return;
    const prev = remove.prev;
    const next = remove.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.shapes == remove) this.shapes = next;
    remove.prev = null;
    remove.next = null;
    remove.parent = null;
    if (this.parent) this.parent.removeShape(remove);
    this.numShapes--;
  }

  remove(): void {
    this.dispose();
  }

  dispose(): void {
    this.parent!.removeRigidBody(this);
  }

  checkContact(name: string): void {
    this.parent!.checkContact(this.name, name);
  }

  /**
   * Calulates mass datas(center of gravity, mass, moment inertia, etc...).
   * If the parameter type is set to BODY_STATIC, the rigid body will be fixed to the space.
   * If the parameter adjustPosition is set to true, the shapes' relative positions and
   * the rigid body's position will be adjusted to the center of gravity.
   * @param type
   * @param adjustPosition
   * @return void
   */
  setupMass(type: i32, AdjustPosition: boolean = true): void {
    const adjustPosition = AdjustPosition;

    this.type = type || BODY_STATIC;
    this.isDynamic = this.type === BODY_DYNAMIC;
    this.isStatic = this.type === BODY_STATIC;

    this.mass = 0;
    this.localInertia.set(0, 0, 0, 0, 0, 0, 0, 0, 0);

    const tmpM = new Mat33();
    const tmpV = new Vec3();

    for (let shape = this.shapes; shape != null; shape = shape!.next) {
      shape.calculateMassInfo(this.massInfo);
      const shapeMass = this.massInfo.mass;

      tmpV.addScaledVector(shape.relativePosition, shapeMass);
      this.mass += shapeMass;
      this.rotateInertia(shape.relativeRotation, this.massInfo.inertia, tmpM);
      this.localInertia.add(tmpM);

      // add offset inertia
      this.localInertia.addOffset(shapeMass, shape.relativePosition);
    }

    this.inverseMass = 1 / this.mass;
    tmpV.scaleEqual(this.inverseMass);

    if (adjustPosition) {
      this.position.add(tmpV);

      for (let shape = this.shapes; shape != null; shape = shape!.next) {
        shape.relativePosition.subEqual(tmpV);
      }

      // subtract offset inertia
      this.localInertia.subOffset(this.mass, tmpV);
    }

    this.inverseLocalInertia.invert(this.localInertia);

    //}

    if (this.type === BODY_STATIC) {
      this.inverseMass = 0;
      this.inverseLocalInertia.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    this.syncShapes();
    this.awake();
  }

  /**
   * Awake the rigid body.
   */
  awake(): void {
    if (!this.allowSleep || !this.sleeping) return;
    this.sleeping = false;
    this.sleepTime = 0;
    // awake connected constraints
    let cs = this.contactLink;
    while (cs != null) {
      cs.body!.sleepTime = 0;
      cs.body!.sleeping = false;
      cs = cs.next;
    }
    let js = this.jointLink;
    while (js != null) {
      js.body!.sleepTime = 0;
      js.body!.sleeping = false;
      js = js.next;
    }
    for (let shape = this.shapes; shape != null; shape = shape!.next) {
      shape.updateProxy();
    }
  }

  /**
   * Sleep the rigid body.
   */
  sleep(): void {
    if (!this.allowSleep || this.sleeping) return;

    this.linearVelocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.sleepPosition.copy(this.position);
    this.sleepOrientation.copy(this.orientation);

    this.sleepTime = 0;
    this.sleeping = true;
    for (let shape = this.shapes; shape != null; shape = shape!.next) {
      shape.updateProxy();
    }
  }

  testWakeUp(): void {
    if (
      this.linearVelocity.testZero() ||
      this.angularVelocity.testZero() ||
      this.position.testDiff(this.sleepPosition) ||
      this.orientation.testDiff(this.sleepOrientation)
    )
      this.awake(); // awake the body
  }

  /**
   * Get whether the rigid body has not any connection with others.
   * @return {void}
   */
  isLonely(): boolean {
    return this.numJoints == 0 && this.numContacts == 0;
  }

  /**
   * The time integration of the motion of a rigid body, you can update the information such as the shape.
   * This method is invoked automatically when calling the step of the World,
   * There is no need to call from outside usually.
   * @param  timeStep time
   * @return {void}
   */

  updatePosition(timeStep: f32): void {
    switch (this.type) {
      case BODY_STATIC:
        this.linearVelocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);

        // ONLY FOR TEST
        if (this.controlPos) {
          this.position.copy(this.newPosition);
          this.controlPos = false;
        }
        if (this.controlRot) {
          this.orientation.copy(this.newOrientation);
          this.controlRot = false;
        }
        /*this.linearVelocity.x=0;
                this.linearVelocity.y=0;
                this.linearVelocity.z=0;
                this.angularVelocity.x=0;
                this.angularVelocity.y=0;
                this.angularVelocity.z=0;*/
        break;
      case BODY_DYNAMIC:
        if (this.isKinematic) {
          this.linearVelocity.set(0, 0, 0);
          this.angularVelocity.set(0, 0, 0);
        }

        if (this.controlPos) {
          this.linearVelocity.subVectors(this.newPosition, this.position).multiplyScalar(1 / timeStep);
          this.controlPos = false;
        }

        if (this.controlRot) {
          this.angularVelocity.copy(this.getAxis());
          this.orientation.copy(this.newOrientation);
          this.controlRot = false;
        }

        this.position.addScaledVector(this.linearVelocity, timeStep);
        this.orientation.addTime(this.angularVelocity, timeStep);

        this.updateMesh();

        break;
      default:
        throw new Error("Invalid type.");
    }

    this.syncShapes();
    this.updateMesh();
  }

  getAxis(): Vec3 {
    return new Vec3(0, 1, 0).applyMatrix3(this.inverseLocalInertia, true).normalize();
  }

  rotateInertia(rot: Mat33, inertia: Mat33, out: Mat33): void {
    this.tmpInertia.multiplyMatrices(rot, inertia);
    out.multiplyMatrices(this.tmpInertia, rot, true);
  }

  syncShapes(): void {
    this.rotation.setQuat(this.orientation);
    this.rotateInertia(this.rotation, this.inverseLocalInertia, this.inverseInertia);

    for (let shape = this.shapes; shape != null; shape = shape!.next) {
      shape.position.copy(shape.relativePosition).applyMatrix3(this.rotation, true).add(this.position);
      // add by QuaziKb
      shape.rotation.multiplyMatrices(this.rotation, shape.relativeRotation);
      shape.updateProxy();
    }
  }

  //---------------------------------------------
  // APPLY IMPULSE FORCE
  //---------------------------------------------

  applyImpulse(position: Vec3, force: Vec3): void {
    this.linearVelocity.addScaledVector(force, this.inverseMass);
    const rel = new Vec3().copy(position).sub(this.position).cross(force).applyMatrix3(this.inverseInertia, true);
    this.angularVelocity.add(rel);
  }

  //---------------------------------------------
  // SET DYNAMIQUE POSITION AND ROTATION
  //---------------------------------------------

  setPosition(pos: Vec3): void {
    this.newPosition.copy(pos).multiplyScalar(this.invScale);
    this.controlPos = true;
    if (!this.isKinematic) this.isKinematic = true;
  }

  setQuaternion(q: Quat): void {
    this.newOrientation.set(q.x, q.y, q.z, q.w);
    this.controlRot = true;
    if (!this.isKinematic) this.isKinematic = true;
  }

  setRotation(rot: Quat): void {
    this.newOrientation = new Quat().setFromEuler(
      rot.x * _Math.degtorad,
      rot.y * _Math.degtorad,
      rot.z * _Math.degtorad
    ); //this.rotationVectToQuad( rot );
    this.controlRot = true;
  }

  //---------------------------------------------
  // RESET DYNAMIQUE POSITION AND ROTATION
  //---------------------------------------------

  resetPosition(x: f32, y: f32, z: f32): void {
    this.linearVelocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.position.set(x, y, z).multiplyScalar(this.invScale);
    //this.position.set( x*OIMO.WorldScale.invScale, y*OIMO.WorldScale.invScale, z*OIMO.WorldScale.invScale );
    this.awake();
  }

  resetQuaternion(q: Quat): void {
    this.angularVelocity.set(0, 0, 0);
    this.orientation = new Quat(q.x, q.y, q.z, q.w);
    this.awake();
  }

  resetRotation(x: f32, y: f32, z: f32): void {
    this.angularVelocity.set(0, 0, 0);
    this.orientation = new Quat().setFromEuler(x * _Math.degtorad, y * _Math.degtorad, z * _Math.degtorad); //this.rotationVectToQuad( new Vec3(x,y,z) );
    this.awake();
  }

  //---------------------------------------------
  // GET POSITION AND ROTATION
  //---------------------------------------------

  getPosition(): Vec3 {
    return this.pos;
  }

  getQuaternion(): Quat {
    return this.quaternion;
  }

  //---------------------------------------------
  // AUTO UPDATE THREE MESH
  //---------------------------------------------

  connectMesh(mesh: TransformNode): void {
    this.mesh = mesh;
    this.updateMesh();
  }

  updateMesh(): void {
    this.pos.scale(this.position, this.scale);
    this.quaternion.copy(this.orientation);

    if (this.mesh == null) return;

    // this.mesh.position.copy(this.getPosition());
    // this.mesh.quaternion.copy(this.getQuaternion());

    this.mesh!.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh!.quaternion.set(this.quaternion.x, this.quaternion.y, this.quaternion.z, this.quaternion.w);
  }
}
