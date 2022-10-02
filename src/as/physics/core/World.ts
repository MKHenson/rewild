import { SHAPE_BOX, SHAPE_SPHERE, SHAPE_CYLINDER, SHAPE_PLANE, BODY_DYNAMIC, BODY_STATIC } from "../constants";
import { InfoDisplay } from "./Utils";
import { BruteForceBroadPhase } from "../collision/broadphase/BruteForceBroadPhase";
import { SAPBroadPhase } from "../collision/broadphase/sap/SAPBroadPhase";
import { DBVTBroadPhase } from "../collision/broadphase/dbvt/DBVTBroadPhase";
import { BoxBoxCollisionDetector } from "../collision/narrowphase/BoxBoxCollisionDetector";
import { BoxCylinderCollisionDetector } from "../collision/narrowphase/BoxCylinderCollisionDetector";
import { CylinderCylinderCollisionDetector } from "../collision/narrowphase/CylinderCylinderCollisionDetector";
import { SphereBoxCollisionDetector } from "../collision/narrowphase/SphereBoxCollisionDetector";
import { SphereCylinderCollisionDetector } from "../collision/narrowphase/SphereCylinderCollisionDetector";
import { SphereSphereCollisionDetector } from "../collision/narrowphase/SphereSphereCollisionDetector";
import { SpherePlaneCollisionDetector } from "../collision/narrowphase/SpherePlaneCollisionDetector_X";
import { BoxPlaneCollisionDetector } from "../collision/narrowphase/BoxPlaneCollisionDetector";
import { _Math } from "../math/Math";
import { Quat } from "../math/Quat";
import { Vec3 } from "../math/Vec3";
import { ShapeConfig } from "../shape/ShapeConfig";
import { Box } from "../shape/Box";
import { Sphere } from "../shape/Sphere";
import { Cylinder } from "../shape/Cylinder";
import { Plane } from "../shape/Plane";
import { Contact } from "../constraint/contact/Contact";
import { JointConfig } from "../constraint/joint/JointConfig";
import { HingeJoint } from "../constraint/joint/HingeJoint";
import { BallAndSocketJoint } from "../constraint/joint/BallAndSocketJoint";
import { DistanceJoint } from "../constraint/joint/DistanceJoint";
import { PrismaticJoint } from "../constraint/joint/PrismaticJoint";
import { SliderJoint } from "../constraint/joint/SliderJoint";
import { WheelJoint } from "../constraint/joint/WheelJoint";
import { RigidBody } from "./RigidBody";
import { Constraint } from "../constraint/Constraint";
import { BroadPhase } from "../collision/broadphase/BroadPhase";
import { Shape } from "../shape/Shape";
import { Joint } from "../constraint/joint/Joint";
import { CollisionDetector } from "../collision/narrowphase/CollisionDetector";
import { ContactLink } from "../constraint/contact/ContactLink";
import { EventDispatcher } from "../../core/EventDispatcher";
import { Event } from "../../core/Event";
import { PhysicsObject } from "./PhysicsObject";

const postLoop = new Event("post-loop");
export class WorldOptions {
  constructor(
    public worldscale: f32 = 1,
    public timestep: f32 = 0.01666, // 1/60
    public iterations: i32 = 8,
    public random: boolean = true,
    public gravity: Vec3 = new Vec3(0, -9.8, 0),
    public broadphase: i32 = 2,
    public info: boolean = false
  ) {}
}

/**
 * The class of physical computing world.
 * You must be added to the world physical all computing objects
 *
 * @author saharan
 * @author lo-th
 */

export class World extends EventDispatcher {
  scale: f32;
  invScale: f32;
  timeStep: f32; // 1/60;
  timerate: f32;

  paused: boolean;

  // timer: null;
  // preLoop: null; //function(){};
  //postLoop: null; //function(){};
  numIterations: i32;
  broadPhase!: BroadPhase;
  Btypes: string[];
  broadPhaseType: string;
  performance: InfoDisplay | null;
  isStat: boolean;
  enableRandomizer: boolean;
  rigidBodies: RigidBody | null;
  numRigidBodies: i32;
  contacts: Contact | null;
  unusedContacts: Contact | null;
  numContacts: i32;
  numContactPoints: i32;
  joints: Joint | null;
  numJoints: i32;
  numIslands: i32;
  gravity: Vec3;
  detectors: CollisionDetector[][];
  randX: i32;
  randA: i32;
  randB: i32;
  islandRigidBodies: Array<RigidBody | null>;
  islandStack: Array<RigidBody | null>;
  islandConstraints: Array<Constraint | null>;

  constructor(o: WorldOptions = new WorldOptions()) {
    super();

    this.paused = true;

    // this world scale defaut is 0.1 to 10 meters max for dynamique body
    this.scale = o.worldscale;
    this.invScale = 1 / this.scale;

    // The time between each step
    this.timeStep = o.timestep;
    this.timerate = this.timeStep * 1000;
    // this.timer = null;

    // this.preLoop = null; //function(){};
    // this.postLoop = null; //function(){};

    // The number of iterations for constraint solvers.
    this.numIterations = o.iterations;

    // It is a wide-area collision judgment that is used in order to reduce as much as possible a detailed collision judgment.
    switch (o.broadphase) {
      case 1:
        this.broadPhase = new BruteForceBroadPhase();
        break;
      case 2:
      default:
        this.broadPhase = new SAPBroadPhase();
        break;
      case 3:
        this.broadPhase = new DBVTBroadPhase();
        break;
    }

    this.Btypes = ["None", "BruteForce", "Sweep & Prune", "Bounding Volume Tree"];
    this.broadPhaseType = this.Btypes[o.broadphase];

    // This is the detailed information of the performance.
    this.performance = null;
    this.isStat = o.info;

    /**
     * Whether the constraints randomizer is enabled or not.
     *
     * @property enableRandomizer
     * @type {Boolean}
     */
    this.enableRandomizer = o.random;

    // The rigid body list
    this.rigidBodies = null;
    // number of rigid body
    this.numRigidBodies = 0;
    // The contact list
    this.contacts = null;
    this.unusedContacts = null;
    // The number of contact
    this.numContacts = 0;
    // The number of contact points
    this.numContactPoints = 0;
    //  The joint list
    this.joints = null;
    // The number of joints.
    this.numJoints = 0;
    // The number of simulation islands.
    this.numIslands = 0;

    // The gravity in the world.
    this.gravity = o.gravity;

    const numShapeTypes = 5; //4;//3;
    this.detectors = [];
    this.detectors.length = numShapeTypes;
    let i = numShapeTypes;
    while (i--) {
      this.detectors[i] = [];
      this.detectors[i].length = numShapeTypes;
    }

    this.detectors[SHAPE_SPHERE][SHAPE_SPHERE] = new SphereSphereCollisionDetector();
    this.detectors[SHAPE_SPHERE][SHAPE_BOX] = new SphereBoxCollisionDetector(false);
    this.detectors[SHAPE_BOX][SHAPE_SPHERE] = new SphereBoxCollisionDetector(true);
    this.detectors[SHAPE_BOX][SHAPE_BOX] = new BoxBoxCollisionDetector();

    // CYLINDER add
    this.detectors[SHAPE_CYLINDER][SHAPE_CYLINDER] = new CylinderCylinderCollisionDetector();

    this.detectors[SHAPE_CYLINDER][SHAPE_BOX] = new BoxCylinderCollisionDetector(true);
    this.detectors[SHAPE_BOX][SHAPE_CYLINDER] = new BoxCylinderCollisionDetector(false);

    this.detectors[SHAPE_CYLINDER][SHAPE_SPHERE] = new SphereCylinderCollisionDetector(true);
    this.detectors[SHAPE_SPHERE][SHAPE_CYLINDER] = new SphereCylinderCollisionDetector(false);

    // PLANE add

    this.detectors[SHAPE_PLANE][SHAPE_SPHERE] = new SpherePlaneCollisionDetector(true);
    this.detectors[SHAPE_SPHERE][SHAPE_PLANE] = new SpherePlaneCollisionDetector(false);

    this.detectors[SHAPE_PLANE][SHAPE_BOX] = new BoxPlaneCollisionDetector(true);
    this.detectors[SHAPE_BOX][SHAPE_PLANE] = new BoxPlaneCollisionDetector(false);

    // TETRA add
    //this.detectors[SHAPE_TETRA][SHAPE_TETRA] = new TetraTetraCollisionDetector();

    this.randX = 65535;
    this.randA = 98765;
    this.randB = 123456789;

    this.islandRigidBodies = [];
    this.islandStack = [];
    this.islandConstraints = [];

    if (this.isStat) this.performance = new InfoDisplay(this);
  }

  play(): void {
    // if (this.timer != null) return;

    // const _this = this;
    // this.timer = setInterval(function () {
    //   _this.step();
    // }, this.timerate);
    // //                this.timer = setInterval( this.loop.bind(this) , this.timerate );

    this.paused = false;
    if (!this.paused) return;
  }

  stop(): void {
    // if (this.timer == null) return;

    // clearInterval(this.timer);
    // this.timer = null;

    this.paused = true;
  }

  setGravity(ar: f32[]): void {
    this.gravity.fromArray(ar);
  }

  getInfo(): string {
    return this.isStat ? this.performance!.show() : "";
  }

  // Reset the world and remove all rigid bodies, shapes, joints and any object from the world.
  clear(): void {
    this.stop();
    // this.preLoop = null;
    // this.postLoop = null;

    this.randX = 65535;

    while (this.joints != null) {
      this.removeJoint(this.joints!);
    }
    while (this.contacts != null) {
      this.removeContact(this.contacts!);
    }
    while (this.rigidBodies != null) {
      this.removeRigidBody(this.rigidBodies!);
    }
  }

  /**
   * I'll add a rigid body to the world.
   * Rigid body that has been added will be the operands of each step.
   * @param  rigidBody  Rigid body that you want to add
   */
  addRigidBody(rigidBody: RigidBody): void {
    if (rigidBody.parent) {
      throw new Error("It is not possible to be added to more than one world one of the rigid body");
    }

    rigidBody.setParent(this);
    //rigidBody.awake();

    for (let shape = rigidBody.shapes; shape != null; shape = shape!.next) {
      this.addShape(shape);
    }
    if (this.rigidBodies != null) {
      this.rigidBodies!.prev = rigidBody;
      rigidBody.next = this.rigidBodies;
    }
    this.rigidBodies = rigidBody;
    this.numRigidBodies++;
  }

  /**
   * I will remove the rigid body from the world.
   * Rigid body that has been deleted is excluded from the calculation on a step-by-step basis.
   * @param  rigidBody  Rigid body to be removed
   */
  removeRigidBody(rigidBody: RigidBody): void {
    const remove = rigidBody;
    if (remove.parent != this) return;
    remove.awake();
    let js = remove.jointLink;
    while (js != null) {
      const joint = js.joint;
      js = js.next;
      this.removeJoint(joint);
    }
    for (let shape = rigidBody.shapes; shape != null; shape = shape!.next) {
      this.removeShape(shape);
    }
    const prev = remove.prev;
    const next = remove.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.rigidBodies == remove) this.rigidBodies = next;
    remove.prev = null;
    remove.next = null;
    remove.parent = null;
    this.numRigidBodies--;
  }

  getByName(name: string): PhysicsObject | null {
    let body = this.rigidBodies;
    while (body != null) {
      if (body.name == name) return body;
      body = body.next;
    }

    let joint = this.joints;
    while (joint != null) {
      if (joint.name == name) return joint;
      joint = joint.next;
    }

    return null;
  }

  /**
   * I'll add a shape to the world..
   * Add to the rigid world, and if you add a shape to a rigid body that has been added to the world,
   * Shape will be added to the world automatically, please do not call from outside this method.
   * @param  shape  Shape you want to add
   */
  addShape(shape: Shape): void {
    if (!shape.parent || !shape.parent!.parent) {
      throw new Error("It is not possible to be added alone to shape world");
    }

    shape.proxy = this.broadPhase.createProxy(shape);
    shape.updateProxy();
    this.broadPhase.addProxy(shape.proxy!);
  }

  /**
   * I will remove the shape from the world.
   * Add to the rigid world, and if you add a shape to a rigid body that has been added to the world,
   * Shape will be added to the world automatically, please do not call from outside this method.
   * @param  shape  Shape you want to delete
   */
  removeShape(shape: Shape): void {
    this.broadPhase.removeProxy(shape.proxy!);
    shape.proxy = null;
  }

  /**
   * I'll add a joint to the world.
   * Joint that has been added will be the operands of each step.
   * @param  shape Joint to be added
   */
  addJoint(joint: Joint): void {
    if (joint.parent) {
      throw new Error("It is not possible to be added to more than one world one of the joint");
    }
    if (this.joints != null) (this.joints.prev = joint).next = this.joints;
    this.joints = joint;
    joint.setParent(this);
    this.numJoints++;
    joint.awake();
    joint.attach();
  }

  /**
   * I will remove the joint from the world.
   * Joint that has been added will be the operands of each step.
   * @param  shape Joint to be deleted
   */
  removeJoint(joint: Joint): void {
    const remove = joint;
    const prev = remove.prev;
    const next = remove.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.joints == remove) this.joints = next;
    remove.prev = null;
    remove.next = null;
    this.numJoints--;
    remove.awake();
    remove.detach();
    remove.parent = null;
  }

  addContact(s1: Shape, s2: Shape): void {
    let newContact: Contact;
    if (this.unusedContacts != null) {
      newContact = this.unusedContacts!;
      this.unusedContacts = this.unusedContacts!.next;
    } else {
      newContact = new Contact();
    }
    newContact.attach(s1, s2);
    newContact.detector = this.detectors[s1.type][s2.type];
    if (this.contacts) {
      this.contacts!.prev = newContact;
      newContact.next = this.contacts;
    }
    this.contacts = newContact;
    this.numContacts++;
  }

  removeContact(contact: Contact): void {
    const prev = contact.prev;
    const next = contact.next;
    if (next) next.prev = prev;
    if (prev) prev.next = next;
    if (this.contacts == contact) this.contacts = next;
    contact.prev = null;
    contact.next = null;
    contact.detach();
    contact.next = this.unusedContacts;
    this.unusedContacts = contact;
    this.numContacts--;
  }

  getContact(b1: string, b2: string): Contact | null {
    // b1 = b1.constructor == RigidBody ? b1.name : b1;
    // b2 = b2.constructor == RigidBody ? b2.name : b2;

    let n1: string, n2: string;
    let contact = this.contacts;
    while (contact != null) {
      n1 = contact.body1!.name;
      n2 = contact.body2!.name;
      if ((n1 == b1 && n2 == b2) || (n2 == b1 && n1 == b2)) {
        if (contact.touching) return contact;
        else return null;
      } else contact = contact.next;
    }
    return null;
  }

  checkContact(name1: string, name2: string): boolean {
    let n1: string, n2: string;
    let contact = this.contacts;
    while (contact != null) {
      n1 = contact.body1!.name || " ";
      n2 = contact.body2!.name || " ";
      if ((n1 == name1 && n2 == name2) || (n2 == name1 && n1 == name2)) {
        if (contact.touching) return true;
        else return false;
      } else contact = contact.next;
    }

    // Unsure if this is correct
    return false;
  }

  callSleep(body: RigidBody): boolean {
    if (!body.allowSleep) return false;
    if (body.linearVelocity.lengthSq() > 0.04) return false;
    if (body.angularVelocity.lengthSq() > 0.25) return false;
    return true;
  }

  /**
   * I will proceed only time step seconds time of World.
   */
  step(): void {
    const stat = this.isStat;

    if (stat) this.performance!.setTime(0);

    let body = this.rigidBodies;

    while (body != null) {
      body.addedToIsland = false;

      if (body.sleeping) body.testWakeUp();

      body = body.next;
    }

    //------------------------------------------------------
    //   UPDATE BROADPHASE CONTACT
    //------------------------------------------------------

    if (stat) this.performance!.setTime(1);

    this.broadPhase.detectPairs();

    const pairs = this.broadPhase.pairs;

    let i: i32 = this.broadPhase.numPairs;
    //do{
    while (i--) {
      //for(const i=0, l=numPairs; i<l; i++){
      const pair = pairs[i];
      let s1: Shape | null;
      let s2: Shape | null;
      if (pair.shape1!.id < pair.shape2!.id) {
        s1 = pair.shape1;
        s2 = pair.shape2;
      } else {
        s1 = pair.shape2;
        s2 = pair.shape1;
      }

      let link: ContactLink | null;
      if (s1!.numContacts < s2!.numContacts) link = s1!.contactLink;
      else link = s2!.contactLink;

      let exists = false;
      while (link) {
        let contact: Contact | null = link.contact!;
        if (contact!.shape1 == s1 && contact!.shape2 == s2) {
          contact!.persisting = true;
          exists = true; // contact already exists
          break;
        }
        link = link.next;
      }
      if (!exists) {
        this.addContact(s1!, s2!);
      }
    } // while(i-- >0);

    if (stat) this.performance!.calcBroadPhase();

    //------------------------------------------------------
    //   UPDATE NARROWPHASE CONTACT
    //------------------------------------------------------

    // update & narrow phase
    this.numContactPoints = 0;
    let contact: Contact | null = this.contacts;
    while (contact != null) {
      if (!contact.persisting) {
        if (contact.shape1!.aabb.intersectTest(contact.shape2!.aabb)) {
          /*const aabb1=contact.shape1.aabb;
                const aabb2=contact.shape2.aabb;
                if(
	                aabb1.minX>aabb2.maxX || aabb1.maxX<aabb2.minX ||
	                aabb1.minY>aabb2.maxY || aabb1.maxY<aabb2.minY ||
	                aabb1.minZ>aabb2.maxZ || aabb1.maxZ<aabb2.minZ
                ){*/
          const next: Contact | null = contact.next;
          if (next) this.removeContact(contact);
          contact = next;
          continue;
        }
      }
      const b1 = contact!.body1!;
      const b2 = contact!.body2!;

      if ((b1.isDynamic && !b1.sleeping) || (b2.isDynamic && !b2.sleeping)) contact!.updateManifold();

      this.numContactPoints += contact!.manifold.numPoints;
      contact!.persisting = false;
      contact!.constraint!.addedToIsland = false;
      contact = contact!.next;
    }

    if (stat) this.performance!.calcNarrowPhase();

    //------------------------------------------------------
    //   SOLVE ISLANDS
    //------------------------------------------------------

    const invTimeStep: f32 = 1 / this.timeStep;
    let joint: Joint | null;
    let constraint: Constraint;

    for (joint = this.joints; joint != null; joint = joint!.next) {
      joint.addedToIsland = false;
    }

    // clear old island array
    this.islandRigidBodies = [];
    this.islandConstraints = [];
    this.islandStack = [];

    if (stat) this.performance!.setTime(1);

    this.numIslands = 0;

    // build and solve simulation islands

    for (let base = this.rigidBodies; base != null; base = base!.next) {
      if (base.addedToIsland || base.isStatic || base.sleeping) continue; // ignore

      if (base.isLonely()) {
        // update single body
        if (base.isDynamic) {
          base.linearVelocity.addScaledVector(this.gravity, this.timeStep);
          /*base.linearVelocity.x+=this.gravity.x*this.timeStep;
                    base.linearVelocity.y+=this.gravity.y*this.timeStep;
                    base.linearVelocity.z+=this.gravity.z*this.timeStep;*/
        }
        if (this.callSleep(base)) {
          base.sleepTime += this.timeStep;
          if (base.sleepTime > 0.5) base.sleep();
          else base.updatePosition(this.timeStep);
        } else {
          base.sleepTime = 0;
          base.updatePosition(this.timeStep);
        }
        this.numIslands++;
        continue;
      }

      let islandNumRigidBodies: i32 = 0;
      let islandNumConstraints: i32 = 0;
      let stackCount: i32 = 1;
      // add rigid body to stack
      this.islandStack[0] = base;
      base.addedToIsland = true;

      // build an island
      do {
        // get rigid body from stack
        body = this.islandStack[--stackCount]!;
        this.islandStack[stackCount] = null;
        body.sleeping = false;
        // add rigid body to the island
        this.islandRigidBodies[islandNumRigidBodies++] = body;
        if (body.isStatic) continue;

        // search connections
        for (let cs = body.contactLink; cs != null; cs = cs!.next) {
          const contact = cs.contact!;
          constraint = contact.constraint!;
          if (constraint.addedToIsland || !contact.touching) continue; // ignore

          // add constraint to the island
          this.islandConstraints[islandNumConstraints++] = constraint;
          constraint.addedToIsland = true;
          const next = cs.body!;

          if (next.addedToIsland) continue;

          // add rigid body to stack
          this.islandStack[stackCount++] = next;
          next.addedToIsland = true;
        }
        for (let js = body.jointLink; js != null; js = js!.next) {
          constraint = js.joint;

          if (constraint.addedToIsland) continue; // ignore

          // add constraint to the island
          this.islandConstraints[islandNumConstraints++] = constraint;
          constraint.addedToIsland = true;
          const next = js.body!;
          if (next.addedToIsland || !next.isDynamic) continue;

          // add rigid body to stack
          this.islandStack[stackCount++] = next;
          next.addedToIsland = true;
        }
      } while (stackCount != 0);

      // update velocities
      const gVel = new Vec3().addScaledVector(this.gravity, this.timeStep);
      /*const gx=this.gravity.x*this.timeStep;
            const gy=this.gravity.y*this.timeStep;
            const gz=this.gravity.z*this.timeStep;*/
      let j: i32 = islandNumRigidBodies;
      while (j--) {
        //or(const j=0, l=islandNumRigidBodies; j<l; j++){
        body = this.islandRigidBodies[j]!;
        if (body.isDynamic) {
          body.linearVelocity.addEqual(gVel);
          /*body.linearVelocity.x+=gx;
                    body.linearVelocity.y+=gy;
                    body.linearVelocity.z+=gz;*/
        }
      }

      // randomizing order
      if (this.enableRandomizer) {
        //for(const j=1, l=islandNumConstraints; j<l; j++){
        j = islandNumConstraints;
        while (j--) {
          if (j != 0) {
            const swap = i32(((this.randX = (this.randX * this.randA + this.randB) & 0x7fffffff) / 2147483648.0) * j);
            constraint = this.islandConstraints[j]!;
            this.islandConstraints[j] = this.islandConstraints[swap];
            this.islandConstraints[swap] = constraint;
          }
        }
      }

      // solve contraints

      j = islandNumConstraints;
      while (j--) {
        //for(j=0, l=islandNumConstraints; j<l; j++){
        this.islandConstraints[j]!.preSolve(this.timeStep, invTimeStep); // pre-solve
      }
      let k: i32 = this.numIterations;
      while (k--) {
        //for(const k=0, l=this.numIterations; k<l; k++){
        j = islandNumConstraints;
        while (j--) {
          //for(j=0, m=islandNumConstraints; j<m; j++){
          this.islandConstraints[j]!.solve(); // main-solve
        }
      }
      j = islandNumConstraints;
      while (j--) {
        //for(j=0, l=islandNumConstraints; j<l; j++){
        this.islandConstraints[j]!.postSolve(); // post-solve
        this.islandConstraints[j] = null; // gc
      }

      // sleeping check

      let sleepTime: f32 = 10;
      j = islandNumRigidBodies;
      while (j--) {
        //for(j=0, l=islandNumRigidBodies;j<l;j++){
        body = this.islandRigidBodies[j]!;
        if (this.callSleep(body)) {
          body.sleepTime += this.timeStep;
          if (body.sleepTime < sleepTime) sleepTime = body.sleepTime;
        } else {
          body.sleepTime = 0;
          sleepTime = 0;
          continue;
        }
      }
      if (sleepTime > 0.5) {
        // sleep the island
        j = islandNumRigidBodies;
        while (j--) {
          //for(j=0, l=islandNumRigidBodies;j<l;j++){
          this.islandRigidBodies[j]!.sleep();
          this.islandRigidBodies[j] = null; // gc
        }
      } else {
        // update positions
        j = islandNumRigidBodies;
        while (j--) {
          //for(j=0, l=islandNumRigidBodies;j<l;j++){
          this.islandRigidBodies[j]!.updatePosition(this.timeStep);
          this.islandRigidBodies[j] = null; // gc
        }
      }
      this.numIslands++;
    }

    //------------------------------------------------------
    //   END SIMULATION
    //------------------------------------------------------

    if (stat) this.performance!.calcEnd();

    this.dispatchEvent(postLoop);
  }

  // remove someting to world

  // remove(obj): void {}

  // add someting to world

  // add(o): void {
  //   o = o || {};

  //   const type = o.type || "box";
  //   if (type.constructor == String) type = [type];
  //   const isJoint = type[0].substring(0, 5) == "joint" ? true : false;

  //   if (isJoint) return this.initJoint(type[0], o);
  //   else return this.initBody(type, o);
  // }

  initBody(type: string, o: BodyOptions, sc: ShapeConfig = new ShapeConfig()): RigidBody {
    const invScale = this.invScale;

    // body dynamic or static
    const move = o.move;
    const kinematic = o.kinematic;

    // POSITION

    // body position
    const position = o.pos.multiplyScalar(invScale);
    // let pos = o.pos;
    // pos = pos.map(function (x: f32): f32 {
    //   return x * invScale;
    // });

    // shape position
    const posShape = o.posShape.multiplyScalar(invScale);
    // let posShape = o.posShape;
    // posShape = posShape.map(function (x: f32): f32 {
    //   return x * invScale;
    // });

    // ROTATION

    // body rotation in degree
    const rot = o.rot.multiplyScalar(_Math.degtorad);
    const rotation = new Quat().setFromEuler(rot.x, rot.y, rot.z);
    // let rot = o.rot;
    // rot = rot.map(function (x: f32): f32 {
    //   return x * _Math.degtorad;
    // });

    // shape rotation in degree
    const rotShape = o.rotShape.multiplyScalar(_Math.degtorad);
    // let rotShape = o.rotShape;
    // rotShape = rot.map(function (x: f32): f32 {
    //   return x * _Math.degtorad;
    // });

    // SIZE

    // shape size
    const size = o.size.multiplyScalar(invScale);
    // let size: f32[] = o.size;
    // if (size.length == 1) {
    //   size[1] = size[0];
    // }
    // if (size.length == 2) {
    //   size[2] = size[0];
    // }
    // size = size.map(function (x) {
    //   return x * invScale;
    // });

    // // body physics settings
    // const sc = new ShapeConfig();
    // // The density of the shape.
    // if (o.density != undefined) sc.density = o.density;
    // // The coefficient of friction of the shape.
    // if (o.friction != undefined) sc.friction = o.friction;
    // // The coefficient of restitution of the shape.
    // if (o.restitution != undefined) sc.restitution = o.restitution;
    // // The bits of the collision groups to which the shape belongs.
    // if (o.belongsTo != undefined) sc.belongsTo = o.belongsTo;
    // // The bits of the collision groups with which the shape collides.
    // if (o.collidesWith != undefined) sc.collidesWith = o.collidesWith;

    // if (o.config != null) {
    //   if (o.config[0] != undefined) sc.density = o.config[0];
    //   if (o.config[1] != undefined) sc.friction = o.config[1];
    //   if (o.config[2] != undefined) sc.restitution = o.config[2];
    //   if (o.config[3] != undefined) sc.belongsTo = o.config[3];
    //   if (o.config[4] != undefined) sc.collidesWith = o.config[4];
    // }

    /* if(o.massPos){
            o.massPos = o.massPos.map(function(x) { return x * invScale; });
            sc.relativePosition.set( o.massPos[0], o.massPos[1], o.massPos[2] );
        }
        if(o.massRot){
            o.massRot = o.massRot.map(function(x) { return x * _Math.degtorad; });
            const q = new Quat().setFromEuler( o.massRot[0], o.massRot[1], o.massRot[2] );
            sc.relativeRotation = new Mat33().setQuat( q );//_Math.EulerToMatrix( o.massRot[0], o.massRot[1], o.massRot[2] );
        }*/

    // const position = new Vec3(pos[0], pos[1], pos[2]);
    // const rotation = new Quat().setFromEuler(rot[0], rot[1], rot[2]);

    // rigidbody
    const body = new RigidBody(position, rotation);
    //const body = new RigidBody( p[0], p[1], p[2], r[0], r[1], r[2], r[3], this.scale, this.invScale );

    // SHAPES

    let shape!: Shape, n: i32;

    // for (let i: i32 = 0; i < type.length; i++) {
    //   n = i * 3;

    //   if (posShape[n] != undefined) sc.relativePosition.set(posShape[n], posShape[n + 1], posShape[n + 2]);
    //   if (rotShape[n] != undefined)
    //     sc.relativeRotation.setQuat(new Quat().setFromEuler(rotShape[n], rotShape[n + 1], rotShape[n + 2]));

    //   const curType: string = type[i];
    //   if (curType == "sphere") shape = new Sphere(sc, size[n]);
    //   else if (curType == "cylinder") shape = new Cylinder(sc, size[n], size[n + 1]);
    //   else if (curType == "box") shape = new Box(sc, size[n], size[n + 1], size[n + 2]);
    //   else if (curType == "plane") shape = new Plane(sc);

    //   body.addShape(shape);
    // }

    sc.relativePosition.set(posShape.x, posShape.y, posShape.z);
    sc.relativeRotation.setQuat(new Quat().setFromEuler(rotShape.x, rotShape.y, rotShape.z));
    if (type == "sphere") shape = new Sphere(sc, size.x);
    else if (type == "cylinder") shape = new Cylinder(sc, size.x, size.y);
    else if (type == "box") shape = new Box(sc, size.x, size.y, size.z);
    else if (type == "plane") shape = new Plane(sc);

    body.addShape(shape);

    // body can sleep or not
    if (o.neverSleep || kinematic) body.allowSleep = false;
    else body.allowSleep = true;

    body.isKinematic = kinematic;

    // body static or dynamic
    if (move) {
      if (o.massPos || o.massRot) body.setupMass(BODY_DYNAMIC, false);
      else body.setupMass(BODY_DYNAMIC, true);

      // body can sleep or not
      //if( o.neverSleep ) body.allowSleep = false;
      //else body.allowSleep = true;
    } else {
      body.setupMass(BODY_STATIC);
    }

    if (o.name != null) body.name = o.name!;
    //else if( move ) body.name = this.numRigidBodies;

    // finaly add to physics world
    this.addRigidBody(body);

    // force sleep on not
    if (move) {
      if (o.sleep) body.sleep();
      else body.awake();
    }

    return body;
  }

  initJoint(type: string, o: JointOptions): Joint {
    //const type = type;
    const invScale = this.invScale;

    const axe1 = o.axe1;
    const axe2 = o.axe2;
    let pos1 = o.pos1;
    let pos2 = o.pos2;

    pos1 = pos1.map(function (x) {
      return x * invScale;
    });
    pos2 = pos2.map(function (x) {
      return x * invScale;
    });

    let min: f32, max: f32;
    if (type == "jointDistance") {
      min = o.min || 0;
      max = o.max || 10;
      min = min * invScale;
      max = max * invScale;
    } else {
      min = o.min || 57.29578;
      max = o.max || 0;
      min = min * _Math.degtorad;
      max = max * _Math.degtorad;
    }

    const limit = o.limit;
    const spring = o.spring;
    const motor = o.motor;

    // joint setting
    const jc = new JointConfig();
    jc.scale = this.scale;
    jc.invScale = this.invScale;
    jc.allowCollision = o.collision;
    jc.localAxis1.set(axe1[0], axe1[1], axe1[2]);
    jc.localAxis2.set(axe2[0], axe2[1], axe2[2]);
    jc.localAnchorPoint1.set(pos1[0], pos1[1], pos1[2]);
    jc.localAnchorPoint2.set(pos2[0], pos2[1], pos2[2]);

    let b1: RigidBody = o.body1;
    let b2: RigidBody = o.body2;

    // if (o.body1.constructor == String) {
    //   b1 = this.getByName(o.body1) as RigidBody;
    // } else if (o.body1.constructor == Number) {
    //   b1 = this.getByName(o.body1) as RigidBody;
    // } else if (o.body1.constructor == RigidBody) {
    //   b1 = o.body1;
    // }

    // if (o.body2.constructor == String) {
    //   b2 = this.getByName(o.body2) as RigidBody;
    // } else if (o.body2.constructor == Number) {
    //   b2 = this.getByName(o.body2) as RigidBody;
    // } else if (o.body2.constructor == RigidBody) {
    //   b2 = o.body2;
    // }

    // if (b1 == null || b2 == null) throw new Error("Can't add joint attach rigidbodys not find !");

    jc.body1 = b1;
    jc.body2 = b2;

    let joint!: Joint;
    switch (type) {
      case "jointDistance":
        joint = new DistanceJoint(jc, min, max);
        if (spring != null) (joint as DistanceJoint).limitMotor.setSpring(spring[0], spring[1]);
        if (motor != null) (joint as DistanceJoint).limitMotor.setMotor(motor[0], motor[1]);
        break;
      case "jointHinge":
      case "joint":
        joint = new HingeJoint(jc, min, max);
        if (spring != null) (joint as HingeJoint).limitMotor.setSpring(spring[0], spring[1]); // soften the joint ex: 100, 0.2
        if (motor != null) (joint as HingeJoint).limitMotor.setMotor(motor[0], motor[1]);
        break;
      case "jointPrisme":
        joint = new PrismaticJoint(jc, min, max);
        break;
      case "jointSlide":
        joint = new SliderJoint(jc, min, max);
        break;
      case "jointBall":
        joint = new BallAndSocketJoint(jc);
        break;
      case "jointWheel":
        joint = new WheelJoint(jc);
        if (limit != null) (joint as WheelJoint).rotationalLimitMotor1.setLimit(limit[0], limit[1]);
        if (spring != null) (joint as WheelJoint).rotationalLimitMotor1.setSpring(spring[0], spring[1]);
        if (motor != null) (joint as WheelJoint).rotationalLimitMotor1.setMotor(motor[0], motor[1]);
        break;
    }

    joint.name = o.name;
    // finaly add to physics world
    this.addJoint(joint);

    return joint;
  }
}

export class JointOptions {
  constructor(
    public body1: RigidBody,
    public body2: RigidBody,
    public axe1: f32[] = [1, 0, 0],
    public axe2: f32[] = [1, 0, 0],
    public pos1: f32[] = [0, 0, 0],
    public pos2: f32[] = [0, 0, 0],
    public limit: f32[] | null = null,
    public spring: f32[] | null = null,
    public motor: f32[] | null = null,
    public min: f32 = 0,
    public max: f32 = 0,
    public name: string = "",
    public collision: boolean = false
  ) {}
}

export class BodyOptions {
  constructor(
    // public density: f32 = 1,
    // public friction: f32 = 0.2,
    // public restitution: f32 = 0.2,
    // public belongsTo: f32 = 1,
    // public collidesWith: f32 = 0xffffffff,
    // public config: f32[] | null = null,
    public size: Vec3 = new Vec3(1, 1, 1),
    public rot: Vec3 = new Vec3(0, 0, 0),
    public rotShape: Vec3 = new Vec3(0, 0, 0),
    public pos: Vec3 = new Vec3(0, 0, 0),
    public posShape: Vec3 = new Vec3(0, 0, 0),
    public move: boolean = false,
    public neverSleep: boolean = false,
    public sleep: boolean = false,
    public kinematic: boolean = false,
    public massPos: boolean = false,
    public massRot: boolean = false,
    public name: string | null = null
  ) {}
}