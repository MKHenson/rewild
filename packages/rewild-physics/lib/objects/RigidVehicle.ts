import { Event, Listener } from "rewild-common";

import { HingeConstraint } from "../constraints/HingeConstraint";
import { Vec3 } from "../math/Vec3";
import { Box } from "../shapes/Box";
import { Sphere } from "../shapes/Sphere";
import { World } from "../world/World";
import { Body, BodyOptions } from "./Body";

const torque = new Vec3();
const worldAxis = new Vec3();

export class RigidVehicle implements Listener {
  wheelBodies: Body[];
  coordinateSystem: Vec3;
  chassisBody: Body;
  constraints: HingeConstraint[];
  wheelAxes: Vec3[];
  wheelForces: f32[];

  /**
   * Simple vehicle helper class with spherical rigid body wheels.
   * @class RigidVehicle
   * @constructor
   * @param {Body} [options.chassisBody]
   */
  constructor(coordinateSystem: Vec3 | null = new Vec3(1, 2, 3), chassisBody: Body | null = null) {
    this.wheelBodies = [];

    /**
     * @property coordinateSystem
     * @type {Vec3}
     */
    this.coordinateSystem = !coordinateSystem ? new Vec3(1, 2, 3) : coordinateSystem.clone();

    /**
     * @property {Body} chassisBody
     */

    if (!chassisBody) {
      // No chassis body given. Create it!
      const chassisShape = new Box(new Vec3(5, 2, 0.5));
      const bodyOptions = new BodyOptions();
      bodyOptions.mass = 1;
      bodyOptions.shape = chassisShape;
      this.chassisBody = new Body(bodyOptions);
    } else this.chassisBody = chassisBody;

    /**
     * @property constraints
     * @type {Array}
     */
    this.constraints = [];

    this.wheelAxes = [];
    this.wheelForces = [];
  }

  /**
   * Add a wheel
   * @method addWheel
   * @param {object} options
   * @param {boolean} [options.isFrontWheel]
   * @param {Vec3} [options.position] Position of the wheel, locally in the chassis body.
   * @param {Vec3} [options.direction] Slide direction of the wheel along the suspension.
   * @param {Vec3} [options.axis] Axis of rotation of the wheel, locally defined in the chassis.
   * @param {Body} [options.body] The wheel body.
   */
  addWheel(body: Body | null = null, pos: Vec3 | null = null, ax: Vec3 | null = null): i32 {
    let wheelBody = body;
    if (!wheelBody) {
      const wheelOptions = new BodyOptions();
      wheelOptions.mass = 1;
      wheelOptions.shape = new Sphere(1.2);
      wheelBody = new Body(wheelOptions);
    }
    this.wheelBodies.push(wheelBody);
    this.wheelForces.push(0);

    // Position constrain wheels
    const position = pos ? pos.clone() : new Vec3();

    // Set position locally to the chassis
    const worldPosition = new Vec3();
    this.chassisBody.pointToWorldFrame(position, worldPosition);
    wheelBody.position.set(worldPosition.x, worldPosition.y, worldPosition.z);

    // Constrain wheel
    const axis = ax ? ax.clone() : new Vec3(0, 1, 0);
    this.wheelAxes.push(axis);

    const hingeConstraint = new HingeConstraint(this.chassisBody, wheelBody, position, Vec3.ZERO, axis, axis);
    hingeConstraint.collideConnected = false;
    this.constraints.push(hingeConstraint);

    return this.wheelBodies.length - 1;
  }

  /**
   * Set the steering value of a wheel.
   * @method setSteeringValue
   * @param {number} value
   * @param {integer} wheelIndex
   * @todo check coordinateSystem
   */
  setSteeringValue(value: f32, wheelIndex: i32): void {
    // Set angle of the hinge axis
    const axis = this.wheelAxes[wheelIndex];

    const c = Mathf.cos(value),
      s = Mathf.sin(value),
      x = axis.x,
      y = axis.y;
    this.constraints[wheelIndex].axisA.set(c * x - s * y, s * x + c * y, 0);
  }

  /**
   * Set the target rotational speed of the hinge constraint.
   * @method setMotorSpeed
   * @param {number} value
   * @param {integer} wheelIndex
   */
  setMotorSpeed(value: f32, wheelIndex: i32): void {
    const hingeConstraint = this.constraints[wheelIndex];
    hingeConstraint.enableMotor();
    hingeConstraint.setMotorSpeed(value);
    // hingeConstraint.motorTargetVelocity = value;
  }

  /**
   * Set the target rotational speed of the hinge constraint.
   * @method disableMotor
   * @param {number} value
   * @param {integer} wheelIndex
   */
  disableMotor(wheelIndex: i32): void {
    const hingeConstraint = this.constraints[wheelIndex];
    hingeConstraint.disableMotor();
  }

  /**
   * Set the wheel force to apply on one of the wheels each time step
   * @method setWheelForce
   * @param  {number} value
   * @param  {integer} wheelIndex
   */
  setWheelForce(value: f32, wheelIndex: i32): void {
    this.wheelForces[wheelIndex] = value;
  }

  /**
   * Apply a torque on one of the wheels.
   * @method applyWheelForce
   * @param  {number} value
   * @param  {integer} wheelIndex
   */
  applyWheelForce(value: f32, wheelIndex: i32): void {
    const axis = this.wheelAxes[wheelIndex];
    const wheelBody = this.wheelBodies[wheelIndex];
    const bodyTorque = wheelBody.torque;

    axis.scale(value, torque);
    wheelBody.vectorToWorldFrame(torque, torque);
    bodyTorque.vadd(torque, bodyTorque);
  }

  /**
   * Add the vehicle including its constraints to the world.
   * @method addToWorld
   * @param {World} world
   */
  addToWorld(world: World): void {
    const constraints = this.constraints;
    const bodies = this.wheelBodies.concat([this.chassisBody]);

    for (let i: i32 = 0; i < bodies.length; i++) {
      world.addBody(bodies[i]);
    }

    for (let i: i32 = 0; i < constraints.length; i++) {
      world.addConstraint(constraints[i]);
    }

    world.addEventListener("preStep", this);
  }

  onEvent(event: Event): void {
    if (event.type === "preStep") {
      this._update();
    }
  }

  _update(): void {
    const wheelForces = this.wheelForces;
    for (let i: i32 = 0; i < wheelForces.length; i++) {
      this.applyWheelForce(wheelForces[i], i);
    }
  }

  /**
   * Remove the vehicle including its constraints from the world.
   * @method removeFromWorld
   * @param {World} world
   */
  removeFromWorld(world: World): void {
    const constraints = this.constraints;
    const bodies = this.wheelBodies.concat([this.chassisBody]);

    for (let i: i32 = 0; i < bodies.length; i++) {
      world.remove(bodies[i]);
    }

    for (let i: i32 = 0; i < constraints.length; i++) {
      world.removeConstraint(constraints[i]);
    }
  }

  /**
   * Get current rotational velocity of a wheel
   * @method getWheelSpeed
   * @param {integer} wheelIndex
   */
  getWheelSpeed(wheelIndex: i32): f32 {
    const axis = this.wheelAxes[wheelIndex];
    const wheelBody = this.wheelBodies[wheelIndex];
    const w = wheelBody.angularVelocity;
    this.chassisBody.vectorToWorldFrame(axis, worldAxis);
    return w.dot(worldAxis);
  }
}
