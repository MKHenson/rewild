/* global performance */
import { Event, EventDispatcher } from "rewild-common";
// import { AABB } from "../collision/AABB";
import { ArrayCollisionMatrix } from "../collision/ArrayCollisionMatrix";
import { Broadphase } from "../collision/Broadphase";
import { NaiveBroadphase } from "../collision/NaiveBroadphase";
import { OverlapKeeper } from "../collision/OverlapKeeper";
import { Callback, IntersectionOptions, Ray } from "../collision/Ray";
import { RaycastResult } from "../collision/RaycastResult";
import { Constraint } from "../constraints/Constraint";
import { ContactEquation } from "../equations/ContactEquation";
import { FrictionEquation } from "../equations/FrictionEquation";
import { ContactMaterial } from "../material/ContactMaterial";
import { Material } from "../material/Material";
// import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Shape } from "../shapes/Shape";
import { GSSolver } from "../solver/GSSolver";
import { Solver } from "../solver/Solver";
import { TupleDictionary } from "../utils/TupleDictionary";
import { Narrowphase } from "./Narrowphase";
import { SPHSystem } from "../objects";

export class WorldOptions {
  constructor(
    public gravity: Vec3 = new Vec3(0, 0, 0),
    public allowSleep: boolean = false,
    public broadphase: Broadphase = new NaiveBroadphase(),
    public solver: Solver = new GSSolver(),
    public quatNormalizeFast: boolean = false,
    public quatNormalizeSkip: i32 = 0
  ) {}
}

export class Profile {
  constructor(
    public solve: f32 = 0,
    public makeContactConstraints: f32 = 0,
    public broadphase: f32 = 0,
    public integrate: f32 = 0,
    public narrowphase: f32 = 0
  ) {}
}

const World_step_oldContacts: ContactEquation[] = []; // Pools for unused objects
const World_step_frictionEquationPool: FrictionEquation[] = [];
const World_step_p1: Body[] = []; // Reusable arrays for collision pairs
const World_step_p2: Body[] = [];
// const World_step_gvec = new Vec3(); // Temporary vectors and quats
// const World_step_vi = new Vec3();
// const World_step_vj = new Vec3();
// const World_step_wi = new Vec3();
// const World_step_wj = new Vec3();
// const World_step_t1 = new Vec3();
// const World_step_t2 = new Vec3();
// const World_step_rixn = new Vec3();
// const World_step_rjxn = new Vec3();
// const World_step_step_q = new Quaternion();
// const World_step_step_w = new Quaternion();
// const World_step_step_wq = new Quaternion();
// const invI_tau_dt = new Vec3();
// Temp stuff
// const tmpAABB1 = new AABB();
// const tmpArray1 = [];
const tmpRay = new Ray();
// const step_tmp1 = new Vec3();
const rayTestOptions = new IntersectionOptions();
rayTestOptions.skipBackfaces = true;

export class World extends EventDispatcher {
  dt: f32;
  allowSleep: boolean;
  contacts: ContactEquation[];
  frictionEquations: FrictionEquation[];
  quatNormalizeSkip: i32;
  quatNormalizeFast: boolean;
  time: f32;
  stepnumber: i32;
  default_dt: f32;
  nextId: i32;
  gravity: Vec3;
  broadphase: Broadphase;
  bodies: Body[];
  solver: Solver;
  constraints: Constraint[];
  narrowphase!: Narrowphase;
  collisionMatrix!: ArrayCollisionMatrix;
  collisionMatrixPrevious!: ArrayCollisionMatrix;
  bodyOverlapKeeper!: OverlapKeeper;
  shapeOverlapKeeper!: OverlapKeeper;
  materials!: Material[];
  contactmaterials!: ContactMaterial[];
  contactMaterialTable!: TupleDictionary<ContactMaterial>;
  defaultMaterial!: Material;
  defaultContactMaterial!: ContactMaterial;
  doProfiling: boolean;
  profile!: Profile;
  accumulator: f32;
  subsystems!: SPHSystem[];
  // addBodyEvent: any;
  // removeBodyEvent: any;
  idToBodyMap!: Map<i32, Body>;

  /**
   * The physics world
   * @class World
   * @constructor
   * @extends EventTarget
   * @param {object} [options]
   * @param {Vec3} [options.gravity]
   * @param {boolean} [options.allowSleep]
   * @param {Broadphase} [options.broadphase]
   * @param {Solver} [options.solver]
   * @param {boolean} [options.quatNormalizeFast]
   * @param {number} [options.quatNormalizeSkip]
   */
  constructor(options: WorldOptions = new WorldOptions()) {
    super();

    /**
     * Currently / last used timestep. Is set to -1 if not available. This value is updated before each internal step, which means that it is "fresh" inside event callbacks.
     * @property {Number} dt
     */
    this.dt = -1;

    /**
     * Makes bodies go to sleep when they've been inactive
     * @property allowSleep
     * @type {Boolean}
     * @default false
     */
    this.allowSleep = !!options.allowSleep;

    /**
     * All the current contacts (instances of ContactEquation) in the world.
     * @property contacts
     * @type {Array}
     */
    this.contacts = [];
    this.frictionEquations = [];

    /**
     * How often to normalize quaternions. Set to 0 for every step, 1 for every second etc.. A larger value increases performance. If bodies tend to explode, set to a smaller value (zero to be sure nothing can go wrong).
     * @property quatNormalizeSkip
     * @type {Number}
     * @default 0
     */
    this.quatNormalizeSkip = options.quatNormalizeSkip;

    /**
     * Set to true to use fast quaternion normalization. It is often enough accurate to use. If bodies tend to explode, set to false.
     * @property quatNormalizeFast
     * @type {Boolean}
     * @see Quaternion.normalizeFast
     * @see Quaternion.normalize
     * @default false
     */
    this.quatNormalizeFast = options.quatNormalizeFast;

    /**
     * The wall-clock time since simulation start
     * @property time
     * @type {Number}
     */
    this.time = 0.0;

    /**
     * Number of timesteps taken since start
     * @property stepnumber
     * @type {Number}
     */
    this.stepnumber = 0;

    /// Default and last timestep sizes
    this.default_dt = 1 / 60;

    this.nextId = 0;
    /**
     * @property gravity
     * @type {Vec3}
     */
    this.gravity = new Vec3();
    if (options.gravity) {
      this.gravity.copy(options.gravity);
    }

    /**
     * The broadphase algorithm to use. Default is NaiveBroadphase
     * @property broadphase
     * @type {Broadphase}
     */
    this.broadphase = options.broadphase;

    /**
     * @property bodies
     * @type {Array}
     */
    this.bodies = [];

    /**
     * The solver algorithm to use. Default is GSSolver
     * @property solver
     * @type {Solver}
     */
    this.solver = options.solver;

    /**
     * @property constraints
     * @type {Array}
     */
    this.constraints = [];

    /**
     * @property narrowphase
     * @type {Narrowphase}
     */
    this.narrowphase = new Narrowphase(this);

    /**
     * @property {ArrayCollisionMatrix} collisionMatrix
     * @type {ArrayCollisionMatrix}
     */
    this.collisionMatrix = new ArrayCollisionMatrix();

    /**
     * CollisionMatrix from the previous step.
     * @property {ArrayCollisionMatrix} collisionMatrixPrevious
     * @type {ArrayCollisionMatrix}
     */
    this.collisionMatrixPrevious = new ArrayCollisionMatrix();

    this.bodyOverlapKeeper = new OverlapKeeper();
    this.shapeOverlapKeeper = new OverlapKeeper();

    /**
     * All added materials
     * @property materials
     * @type {Array}
     */
    this.materials = [];

    /**
     * @property contactmaterials
     * @type {Array}
     */
    this.contactmaterials = [];

    /**
     * Used to look up a ContactMaterial given two instances of Material.
     * @property {TupleDictionary} contactMaterialTable
     */
    this.contactMaterialTable = new TupleDictionary();

    this.defaultMaterial = new Material("default");

    /**
     * This contact material is used if no suitable contactmaterial is found for a contact.
     * @property defaultContactMaterial
     * @type {ContactMaterial}
     */
    this.defaultContactMaterial = new ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      0.3,
      0.0
    );

    /**
     * @property doProfiling
     * @type {Boolean}
     */
    this.doProfiling = false;

    /**
     * @property profile
     * @type {Object}
     */
    this.profile = new Profile();

    /**
     * Time accumulator for interpolation. See http://gafferongames.com/game-physics/fix-your-timestep/
     * @property {Number} accumulator
     */
    this.accumulator = 0;

    /**
     * @property subsystems
     * @type {Array}
     */
    this.subsystems = [];

    this.idToBodyMap = new Map();

    this.broadphase.setWorld(this);
  }

  /**
   * Get the contact material between materials m1 and m2
   * @method getContactMaterial
   * @param {Material} m1
   * @param {Material} m2
   * @return {ContactMaterial} The contact material if it was found.
   */
  getContactMaterial(m1: Material, m2: Material): ContactMaterial | null {
    return this.contactMaterialTable.get(m1.id, m2.id); //this.contactmaterials[this.mats2cmat[i+j*this.materials.length]];
  }

  /**
   * Get number of objects in the world.
   * @method numObjects
   * @return {Number}
   * @deprecated
   */
  numObjects(): i32 {
    return this.bodies.length;
  }

  /**
   * Store old collision state info
   * @method collisionMatrixTick
   */
  collisionMatrixTick(): void {
    const temp = this.collisionMatrixPrevious;
    this.collisionMatrixPrevious = this.collisionMatrix;
    this.collisionMatrix = temp;
    this.collisionMatrix.reset();

    this.bodyOverlapKeeper.tick();
    this.shapeOverlapKeeper.tick();
  }

  /**
   * Add a rigid body to the simulation.
   * @method add
   * @param {Body} body
   * @todo If the simulation has not yet started, why recrete and copy arrays for each body? Accumulate in dynamic arrays in this case.
   * @todo Adding an array of bodies should be possible. This would save some loops too
   * @deprecated Use .addBody instead
   */
  addBody(body: Body): void {
    if (this.bodies.indexOf(body) !== -1) {
      return;
    }
    body.index = this.bodies.length;
    this.bodies.push(body);
    body.world = this;
    body.initPosition.copy(body.position);
    body.initVelocity.copy(body.velocity);
    body.timeLastSleepy = this.time;
    if (body instanceof Body) {
      body.initAngularVelocity.copy(body.angularVelocity);
      body.initQuaternion.copy(body.quaternion);
    }
    this.collisionMatrix.setNumObjects(this.bodies.length);
    addBodyEvent.body = body;
    this.idToBodyMap.set(body.id, body);
    this.dispatchEvent(addBodyEvent);
  }

  add(body: Body): void {
    this.addBody(body);
  }

  /**
   * Add a constraint to the simulation.
   * @method addConstraint
   * @param {Constraint} c
   */
  addConstraint(c: Constraint): void {
    this.constraints.push(c);
  }

  /**
   * Removes a constraint
   * @method removeConstraint
   * @param {Constraint} c
   */
  removeConstraint(c: Constraint): void {
    const idx = this.constraints.indexOf(c);
    if (idx !== -1) {
      this.constraints.splice(idx, 1);
    }
  }

  /**
   * Raycast test
   * @method rayTest
   * @param {Vec3} from
   * @param {Vec3} to
   * @param {RaycastResult} result
   * @deprecated Use .raycastAll, .raycastClosest or .raycastAny instead.
   */
  rayTest(from: Vec3, to: Vec3, result: RaycastResult): void {
    if (result instanceof RaycastResult) {
      // Do raycastclosest
      this.raycastClosest(from, to, rayTestOptions, result);
    } else {
      // Do raycastAll
      this.raycastAll(from, to, rayTestOptions, result);
    }
  }

  /**
   * Ray cast against all bodies. The provided callback will be executed for each hit with a RaycastResult as single argument.
   * @method raycastAll
   * @param  {Vec3} from
   * @param  {Vec3} to
   * @param  {Object} options
   * @param  {number} [options.collisionFilterMask=-1]
   * @param  {number} [options.collisionFilterGroup=-1]
   * @param  {boolean} [options.skipBackfaces=false]
   * @param  {boolean} [options.checkCollisionResponse=true]
   * @param  {Function} callback
   * @return {boolean} True if any body was hit.
   */
  raycastAll(
    from: Vec3,
    to: Vec3,
    options: IntersectionOptions,
    callback: Callback | null = null
  ): boolean {
    options.mode = Ray.ALL;
    options.from = from;
    options.to = to;
    options.callback = callback;
    return tmpRay.intersectWorld(this, options);
  }

  /**
   * Ray cast, and stop at the first result. Note that the order is random - but the method is fast.
   * @method raycastAny
   * @param  {Vec3} from
   * @param  {Vec3} to
   * @param  {Object} options
   * @param  {number} [options.collisionFilterMask=-1]
   * @param  {number} [options.collisionFilterGroup=-1]
   * @param  {boolean} [options.skipBackfaces=false]
   * @param  {boolean} [options.checkCollisionResponse=true]
   * @param  {RaycastResult} result
   * @return {boolean} True if any body was hit.
   */
  raycastAny(
    from: Vec3,
    to: Vec3,
    options: IntersectionOptions,
    result: RaycastResult
  ): boolean {
    options.mode = Ray.ANY;
    options.from = from;
    options.to = to;
    options.result = result;
    return tmpRay.intersectWorld(this, options);
  }

  /**
   * Ray cast, and return information of the closest hit.
   * @method raycastClosest
   * @param  {Vec3} from
   * @param  {Vec3} to
   * @param  {Object} options
   * @param  {number} [options.collisionFilterMask=-1]
   * @param  {number} [options.collisionFilterGroup=-1]
   * @param  {boolean} [options.skipBackfaces=false]
   * @param  {boolean} [options.checkCollisionResponse=true]
   * @param  {RaycastResult} result
   * @return {boolean} True if any body was hit.
   */
  raycastClosest(
    from: Vec3,
    to: Vec3,
    options: IntersectionOptions,
    result: RaycastResult
  ): boolean {
    options.mode = Ray.CLOSEST;
    options.from = from;
    options.to = to;
    options.result = result;
    return tmpRay.intersectWorld(this, options);
  }

  /**
   * Remove a rigid body from the simulation.
   * @method remove
   * @param {Body} body
   * @deprecated Use .removeBody instead
   */
  remove(body: Body): void {
    body.world = null;
    const n = this.bodies.length - 1,
      bodies = this.bodies,
      idx = bodies.indexOf(body);
    if (idx !== -1) {
      bodies.splice(idx, 1); // Todo: should use a garbage free method

      // Recompute index
      for (let i: i32 = 0; i !== bodies.length; i++) {
        bodies[i].index = i;
      }

      this.collisionMatrix.setNumObjects(n);
      removeBodyEvent.body = body;
      this.idToBodyMap.delete(body.id);
      this.dispatchEvent(removeBodyEvent);
    }
  }

  /**
   * Remove a rigid body from the simulation.
   * @method removeBody
   * @param {Body} body
   */
  removeBody(body: Body): void {
    this.remove(body);
  }

  getBodyById(id: i32): Body {
    return this.idToBodyMap.get(id) as Body;
  }

  // TODO Make a faster map
  getShapeById(id: i32): Shape | null {
    const bodies = this.bodies;
    for (let i: i32 = 0, bl = bodies.length; i < bl; i++) {
      const shapes = bodies[i].shapes;
      for (let j: i32 = 0, sl = shapes.length; j < sl; j++) {
        const shape = shapes[j];
        if (shape.id === id) {
          return shape;
        }
      }
    }

    return null;
  }

  /**
   * Adds a material to the World.
   * @method addMaterial
   * @param {Material} m
   * @todo Necessary?
   */
  addMaterial(m: Material): void {
    this.materials.push(m);
  }

  /**
   * Adds a contact material to the World
   * @method addContactMaterial
   * @param {ContactMaterial} cmat
   */
  addContactMaterial(cmat: ContactMaterial): void {
    // Add contact material
    this.contactmaterials.push(cmat);

    // Add current contact material to the material table
    this.contactMaterialTable.set(
      cmat.materials[0].id,
      cmat.materials[1].id,
      cmat
    );
  }

  /**
   * Step the physics world forward in time.
   *
   * There are two modes. The simple mode is fixed timestepping without interpolation. In this case you only use the first argument. The second case uses interpolation. In that you also provide the time since the function was last used, as well as the maximum fixed timesteps to take.
   *
   * @method step
   * @param {Number} dt                       The fixed time step size to use.
   * @param {Number} [timeSinceLastCalled]    The time elapsed since the function was last called.
   * @param {Number} [maxSubSteps=10]         Maximum number of fixed steps to take per function call.
   *
   * @example
   *     // fixed timestepping without interpolation
   *     world.step(1/60);
   *
   * @see http://bulletphysics.org/mediawiki-1.5.8/index.php/Stepping_The_World
   */
  step(dt: f32, timeSinceLastCalled: f32, maxSubSteps: i32 = 20): void {
    maxSubSteps = maxSubSteps || 10;
    timeSinceLastCalled = timeSinceLastCalled || 0;

    if (timeSinceLastCalled === 0) {
      // Fixed, simple stepping

      this.internalStep(dt);

      // Increment time
      this.time += dt;
    } else {
      this.accumulator += timeSinceLastCalled;
      let substeps: i32 = 0;
      while (this.accumulator >= dt && substeps < maxSubSteps) {
        // Do fixed steps to catch up
        this.internalStep(dt);
        this.accumulator -= dt;
        substeps++;
      }

      const t = (this.accumulator % dt) / dt;
      for (let j: i32 = 0; j !== this.bodies.length; j++) {
        const b = this.bodies[j];
        b.previousPosition.lerp(b.position, t, b.interpolatedPosition);
        b.previousQuaternion.slerp(b.quaternion, t, b.interpolatedQuaternion);
        b.previousQuaternion.normalize();
      }
      this.time += timeSinceLastCalled;
    }
  }

  internalStep(dt: f32): void {
    this.dt = dt;

    // const world = this,
    //   that = this;

    let contacts = this.contacts,
      p1 = World_step_p1,
      p2 = World_step_p2,
      N = this.numObjects(),
      bodies = this.bodies,
      solver = this.solver,
      gravity = this.gravity,
      doProfiling = this.doProfiling,
      profile = this.profile,
      DYNAMIC = Body.DYNAMIC,
      profilingStart: f64 = 0,
      constraints = this.constraints,
      frictionEquationPool = World_step_frictionEquationPool,
      // gnorm = gravity.norm(),
      gx = gravity.x,
      gy = gravity.y,
      gz = gravity.z;
    let i: i32 = 0;

    if (doProfiling) {
      profilingStart = performance.now();
    }

    // Add gravity to all objects
    for (i = 0; i !== N; i++) {
      const bi = bodies[i];
      if (bi.type === DYNAMIC) {
        // Only for dynamic bodies
        const f = bi.force,
          m = bi.mass;
        f.x += m * gx;
        f.y += m * gy;
        f.z += m * gz;
      }
    }

    // Update subsystems
    for (
      let i: i32 = 0, Nsubsystems = this.subsystems.length;
      i !== Nsubsystems;
      i++
    ) {
      this.subsystems[i].update();
    }

    // Collision detection
    if (doProfiling) {
      profilingStart = performance.now();
    }
    p1.length = 0; // Clean up pair arrays from last step
    p2.length = 0;
    this.broadphase.collisionPairs(this, p1, p2);
    if (doProfiling) {
      profile.broadphase = f32(performance.now() - profilingStart);
    }

    // Remove constrained pairs with collideConnected == false
    let Nconstraints = constraints.length;
    for (i = 0; i !== Nconstraints; i++) {
      const c = constraints[i];
      if (!c.collideConnected) {
        for (let j: i32 = p1.length - 1; j >= 0; j -= 1) {
          if (
            (c.bodyA === p1[j] && c.bodyB === p2[j]) ||
            (c.bodyB === p1[j] && c.bodyA === p2[j])
          ) {
            p1.splice(j, 1);
            p2.splice(j, 1);
          }
        }
      }
    }

    this.collisionMatrixTick();

    // Generate contacts
    if (doProfiling) {
      profilingStart = performance.now();
    }
    const oldcontacts = World_step_oldContacts;
    const NoldContacts = contacts.length;

    for (i = 0; i != NoldContacts; i++) {
      oldcontacts.push(contacts[i]);
    }
    contacts.length = 0;

    // Transfer FrictionEquation from current list to the pool for reuse
    const NoldFrictionEquations = this.frictionEquations.length;
    for (i = 0; i !== NoldFrictionEquations; i++) {
      frictionEquationPool.push(this.frictionEquations[i]);
    }
    this.frictionEquations.length = 0;

    this.narrowphase.getContacts(
      p1,
      p2,
      this,
      contacts,
      oldcontacts, // To be reused
      this.frictionEquations,
      frictionEquationPool
    );

    if (doProfiling) {
      profile.narrowphase = f32(performance.now() - profilingStart);
    }

    // Loop over all collisions
    if (doProfiling) {
      profilingStart = performance.now();
    }

    // Add all friction eqs
    for (let i: i32 = 0; i < this.frictionEquations.length; i++) {
      solver.addEquation(this.frictionEquations[i]);
    }

    const ncontacts = contacts.length;
    for (let k: i32 = 0; k !== ncontacts; k++) {
      // Current contact
      const c = contacts[k];

      // Get current collision indeces
      const bi = c.bi,
        bj = c.bj,
        si = c.si,
        sj = c.sj;

      // // Get collision properties
      // let cm: ContactMaterial;
      // if (bi.material && bj.material) {
      //   cm = this.getContactMaterial(bi.material, bj.material) || this.defaultContactMaterial;
      // } else {
      //   cm = this.defaultContactMaterial;
      // }

      // c.enabled = bi.collisionResponse && bj.collisionResponse && si.collisionResponse && sj.collisionResponse;

      // let mu = cm.friction;
      // c.restitution = cm.restitution;

      // If friction or restitution were specified in the material, use them
      if (bi.material && bj.material) {
        // if (bi.material.friction >= 0 && bj.material.friction >= 0) {
        // mu = bi.material.friction * bj.material.friction;
        // }

        if (bi.material!.restitution >= 0 && bj.material!.restitution >= 0) {
          c.restitution = bi.material!.restitution * bj.material!.restitution;
        }
      }

      // c.setSpookParams(
      //           cm.contactEquationStiffness,
      //           cm.contactEquationRelaxation,
      //           dt
      //       );

      solver.addEquation(c);

      // // Add friction constraint equation
      // if(mu > 0){

      // 	// Create 2 tangent equations
      // 	const mug = mu * gnorm;
      // 	const reducedMass = (bi.invMass + bj.invMass);
      // 	if(reducedMass > 0){
      // 		reducedMass = 1/reducedMass;
      // 	}
      // 	const pool = frictionEquationPool;
      // 	const c1 = pool.length ? pool.pop() : new FrictionEquation(bi,bj,mug*reducedMass);
      // 	const c2 = pool.length ? pool.pop() : new FrictionEquation(bi,bj,mug*reducedMass);
      // 	this.frictionEquations.push(c1, c2);

      // 	c1.bi = c2.bi = bi;
      // 	c1.bj = c2.bj = bj;
      // 	c1.minForce = c2.minForce = -mug*reducedMass;
      // 	c1.maxForce = c2.maxForce = mug*reducedMass;

      // 	// Copy over the relative vectors
      // 	c1.ri.copy(c.ri);
      // 	c1.rj.copy(c.rj);
      // 	c2.ri.copy(c.ri);
      // 	c2.rj.copy(c.rj);

      // 	// Construct tangents
      // 	c.ni.tangents(c1.t, c2.t);

      //           // Set spook params
      //           c1.setSpookParams(cm.frictionEquationStiffness, cm.frictionEquationRelaxation, dt);
      //           c2.setSpookParams(cm.frictionEquationStiffness, cm.frictionEquationRelaxation, dt);

      //           c1.enabled = c2.enabled = c.enabled;

      // 	// Add equations to solver
      // 	solver.addEquation(c1);
      // 	solver.addEquation(c2);
      // }

      if (
        bi.allowSleep &&
        bi.type === Body.DYNAMIC &&
        bi.sleepState === Body.SLEEPING &&
        bj.sleepState === Body.AWAKE &&
        bj.type !== Body.STATIC
      ) {
        const speedSquaredB = bj.velocity.norm2() + bj.angularVelocity.norm2();
        const speedLimitSquaredB = Mathf.pow(bj.sleepSpeedLimit, 2);
        if (speedSquaredB >= speedLimitSquaredB * 2) {
          bi._wakeUpAfterNarrowphase = true;
        }
      }

      if (
        bj.allowSleep &&
        bj.type === Body.DYNAMIC &&
        bj.sleepState === Body.SLEEPING &&
        bi.sleepState === Body.AWAKE &&
        bi.type !== Body.STATIC
      ) {
        const speedSquaredA = bi.velocity.norm2() + bi.angularVelocity.norm2();
        const speedLimitSquaredA = Mathf.pow(bi.sleepSpeedLimit, 2);
        if (speedSquaredA >= speedLimitSquaredA * 2) {
          bj._wakeUpAfterNarrowphase = true;
        }
      }

      // Now we know that i and j are in contact. Set collision matrix state
      this.collisionMatrix.set(bi, bj, true);

      if (!this.collisionMatrixPrevious.get(bi, bj)) {
        // First contact!
        // We reuse the collideEvent object, otherwise we will end up creating new objects for each new contact, even if there's no event listener attached.
        World_step_collideEvent.body = bj;
        World_step_collideEvent.contact = c;
        bi.dispatchEvent(World_step_collideEvent);

        World_step_collideEvent.body = bi;
        bj.dispatchEvent(World_step_collideEvent);
      }

      this.bodyOverlapKeeper.set(bi.id, bj.id);
      this.shapeOverlapKeeper.set(si!.id, sj!.id);
    }

    this.emitContactEvents();

    if (doProfiling) {
      profile.makeContactConstraints = f32(performance.now() - profilingStart);
      profilingStart = performance.now();
    }

    // Wake up bodies
    for (i = 0; i !== N; i++) {
      const bi = bodies[i];
      if (bi._wakeUpAfterNarrowphase) {
        bi.wakeUp();
        bi._wakeUpAfterNarrowphase = false;
      }
    }

    // Add user-added constraints
    Nconstraints = constraints.length;
    for (i = 0; i !== Nconstraints; i++) {
      const c = constraints[i];
      c.update();
      for (let j: i32 = 0, Neq = c.equations.length; j !== Neq; j++) {
        const eq = c.equations[j];
        solver.addEquation(eq);
      }
    }

    // Solve the constrained system
    solver.solve(dt, this.bodies);

    if (doProfiling) {
      profile.solve = f32(performance.now() - profilingStart);
    }

    // Remove all contacts from solver
    solver.removeAllEquations();

    // Apply damping, see http://code.google.com/p/bullet/issues/detail?id=74 for details
    const pow = Mathf.pow;
    for (i = 0; i != N; i++) {
      const bi = bodies[i];
      if (bi.type & DYNAMIC) {
        // Only for dynamic bodies
        const ld = pow(1.0 - bi.linearDamping, dt);
        const v = bi.velocity;
        v.mult(ld, v);
        const av = bi.angularVelocity;
        if (av) {
          const ad = pow(1.0 - bi.angularDamping, dt);
          av.mult(ad, av);
        }
      }
    }

    this.dispatchEvent(World_step_preStepEvent);

    // Invoke pre-step callbacks
    for (i = 0; i !== N; i++) {
      const bi = bodies[i];
      if (bi.preStep) {
        bi.preStep(bi);
      }
    }

    // Leap frog
    // vnew = v + h*f/m
    // xnew = x + h*vnew
    if (doProfiling) {
      profilingStart = performance.now();
    }
    const stepnumber = this.stepnumber;
    const quatNormalize = stepnumber % (this.quatNormalizeSkip + 1) === 0;
    const quatNormalizeFast = this.quatNormalizeFast;

    for (i = 0; i !== N; i++) {
      bodies[i].integrate(dt, quatNormalize, quatNormalizeFast);
    }
    this.clearForces();

    this.broadphase.dirty = true;

    if (doProfiling) {
      profile.integrate = f32(performance.now() - profilingStart);
    }

    // Update world time
    this.time += dt;
    this.stepnumber += 1;

    this.dispatchEvent(World_step_postStepEvent);

    // Invoke post-step callbacks
    for (i = 0; i !== N; i++) {
      const bi = bodies[i];
      const postStep = bi.postStep;
      if (postStep) {
        postStep(bi);
      }
    }

    // Sleeping update
    if (this.allowSleep) {
      for (i = 0; i !== N; i++) {
        bodies[i].sleepTick(this.time);
      }
    }
  }

  emitContactEvents(): void {
    additions.length = 0;
    removals.length = 0;

    const hasBeginContact = this.hasAnyEventListener("beginContact");
    const hasEndContact = this.hasAnyEventListener("endContact");

    if (hasBeginContact || hasEndContact) {
      this.bodyOverlapKeeper.getDiff(additions, removals);
    }

    if (hasBeginContact) {
      for (let i: i32 = 0, l = additions.length; i < l; i += 2) {
        beginContactEvent.bodyA = this.getBodyById(additions[i]);
        beginContactEvent.bodyB = this.getBodyById(additions[i + 1]);
        this.dispatchEvent(beginContactEvent);
      }
      beginContactEvent.bodyA = beginContactEvent.bodyB = null;
    }

    if (hasEndContact) {
      for (let i: i32 = 0, l = removals.length; i < l; i += 2) {
        endContactEvent.bodyA = this.getBodyById(removals[i]);
        endContactEvent.bodyB = this.getBodyById(removals[i + 1]);
        this.dispatchEvent(endContactEvent);
      }
      endContactEvent.bodyA = endContactEvent.bodyB = null;
    }

    additions.length = removals.length = 0;

    const hasBeginShapeContact = this.hasAnyEventListener("beginShapeContact");
    const hasEndShapeContact = this.hasAnyEventListener("endShapeContact");

    if (hasBeginShapeContact || hasEndShapeContact) {
      this.shapeOverlapKeeper.getDiff(additions, removals);
    }

    if (hasBeginShapeContact) {
      for (let i: i32 = 0, l = additions.length; i < l; i += 2) {
        const shapeA = this.getShapeById(additions[i]);
        const shapeB = this.getShapeById(additions[i + 1]);
        beginShapeContactEvent.shapeA = shapeA;
        beginShapeContactEvent.shapeB = shapeB;
        beginShapeContactEvent.bodyA = shapeA ? shapeA.body : null;
        beginShapeContactEvent.bodyB = shapeB ? shapeB.body : null;
        this.dispatchEvent(beginShapeContactEvent);
      }
      beginShapeContactEvent.bodyA = beginShapeContactEvent.bodyB = null;
      beginShapeContactEvent.shapeA = beginShapeContactEvent.shapeB = null;
    }

    if (hasEndShapeContact) {
      for (let i: i32 = 0, l = removals.length; i < l; i += 2) {
        const shapeA = this.getShapeById(removals[i]);
        const shapeB = this.getShapeById(removals[i + 1]);
        endShapeContactEvent.shapeA = shapeA;
        endShapeContactEvent.shapeB = shapeB;
        endShapeContactEvent.bodyA = shapeA ? shapeA.body : null;
        endShapeContactEvent.bodyB = shapeB ? shapeB.body : null;
        this.dispatchEvent(endShapeContactEvent);
      }
      endShapeContactEvent.bodyA = endShapeContactEvent.bodyB = null;
      endShapeContactEvent.shapeA = endShapeContactEvent.shapeB = null;
    }
  }

  /**
   * Sets all body forces in the world to zero.
   * @method clearForces
   */
  clearForces(): void {
    const bodies = this.bodies;
    const N = bodies.length;
    for (let i: i32 = 0; i != N; i++) {
      const b = bodies[i];
      // force = b.force,
      // tau = b.torque;

      b.force.set(0, 0, 0);
      b.torque.set(0, 0, 0);
    }
  }
}

export class ContactEvent extends Event {
  bodyA: Body | null;
  bodyB: Body | null;
  shapeA: Shape | null;
  shapeB: Shape | null;

  constructor(type: string) {
    super(type);
    this.bodyA = null;
    this.bodyB = null;
    this.shapeA = null;
    this.shapeB = null;
  }
}

export class CollideEvent extends Event {
  body: Body | null;
  contact: ContactEquation | null;

  constructor(type: string) {
    super(type);
    this.body = null;
    this.contact = null;
  }
}

export class BodyEvent extends Event {
  body: Body | null;

  constructor(type: string) {
    super(type);
    this.body = null;
  }
}

/**
 * Dispatched after the world has stepped forward in time.
 * @event postStep
 */
const World_step_postStepEvent = new Event("postStep"); // Reusable event objects to save memory
/**
 * Dispatched before the world steps forward in time.
 * @event preStep
 */
const World_step_preStepEvent = new Event("preStep");

/**
 * Dispatched after a body has been added to the world.
 * @event addBody
 * @param {Body} body The body that has been added to the world.
 */
const addBodyEvent = new BodyEvent("addBody");

/**
 * Dispatched after a body has been removed from the world.
 * @event removeBody
 * @param {Body} body The body that has been removed from the world.
 */
const removeBodyEvent = new BodyEvent("removeBody");

const World_step_collideEvent = new CollideEvent(Body.COLLIDE_EVENT_NAME);

const additions: i32[] = [];
const removals: i32[] = [];
const beginContactEvent = new ContactEvent("beginContact");
const endContactEvent = new ContactEvent("endContact");
const beginShapeContactEvent = new ContactEvent("beginShapeContact");
const endShapeContactEvent = new ContactEvent("endShapeContact");
