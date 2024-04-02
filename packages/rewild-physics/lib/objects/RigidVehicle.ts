import { Vec3 } from '../math/Vec3';
import { Body, BodyOptions } from '../objects/Body';
import { Sphere } from '../shapes/Sphere';
import { Box } from '../shapes/Box';
import { HingeConstraint } from '../constraints/HingeConstraint';
import { World } from '../world/World';
import { Listener, Event } from 'rewild-common';

/**
 * Simple vehicle helper class with spherical rigid body wheels.
 */
export class RigidVehicle implements Listener {
  /**
   * The bodies of the wheels.
   */
  wheelBodies: Body[];
  coordinateSystem: Vec3;
  /**
   * The chassis body.
   */
  chassisBody: Body;
  /**
   * The constraints.
   */
  constraints: HingeConstraint[];
  /**
   * The wheel axes.
   */
  wheelAxes: Vec3[];
  /**
   * The wheel forces.
   */
  wheelForces: f32[];

  constructor(
    coordinateSystem: Vec3 | null = new Vec3(1, 2, 3),
    chassisBody: Body | null = null
  ) {
    this.wheelBodies = [];
    this.coordinateSystem = !coordinateSystem
      ? new Vec3(1, 2, 3)
      : coordinateSystem.clone();

    if (chassisBody) {
      this.chassisBody = chassisBody;
    } else {
      // No chassis body given. Create it!
      const bodyOptions = new BodyOptions();
      bodyOptions.mass = 1;
      bodyOptions.shape = new Box(new Vec3(5, 0.5, 2));
      this.chassisBody = new Body(bodyOptions);
    }

    this.constraints = [];
    this.wheelAxes = [];
    this.wheelForces = [];
  }

  /**
   * Add a wheel
   */
  addWheel(
    /** The wheel body */
    body: Body | null = null,
    /** Position of the wheel, locally in the chassis body. */
    pos: Vec3 | null = null,
    /** Axis of rotation of the wheel, locally defined in the chassis. */
    ax: Vec3 | null = null,
    /** Slide direction of the wheel along the suspension. */
    direction: Vec3 | null = null
  ): number {
    let wheelBody: Body;

    if (body) {
      wheelBody = body;
    } else {
      // No wheel body given. Create it!
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
    const axis = ax ? ax.clone() : new Vec3(0, 0, 1);
    this.wheelAxes.push(axis);

    const hingeConstraint = new HingeConstraint(
      this.chassisBody,
      wheelBody,
      position,
      Vec3.ZERO,
      axis,
      axis
    );
    hingeConstraint.collideConnected = false;
    this.constraints.push(hingeConstraint);

    return this.wheelBodies.length - 1;
  }

  /**
   * Set the steering value of a wheel.
   * @todo check coordinateSystem
   */
  setSteeringValue(value: f32, wheelIndex: i32): void {
    // Set angle of the hinge axis
    const axis = this.wheelAxes[wheelIndex];

    const c = Mathf.cos(value);
    const s = Mathf.sin(value);
    const x = axis.x;
    const z = axis.z;
    this.constraints[wheelIndex].axisA.set(-c * x + s * z, 0, s * x + c * z);
  }

  /**
   * Set the target rotational speed of the hinge constraint.
   */
  setMotorSpeed(value: f32, wheelIndex: i32): void {
    const hingeConstraint = this.constraints[wheelIndex];
    hingeConstraint.enableMotor();
    hingeConstraint.motorTargetVelocity = value;
  }

  /**
   * Set the target rotational speed of the hinge constraint.
   */
  disableMotor(wheelIndex: i32): void {
    const hingeConstraint = this.constraints[wheelIndex];
    hingeConstraint.disableMotor();
  }

  /**
   * Set the wheel force to apply on one of the wheels each time step
   */
  setWheelForce(value: f32, wheelIndex: i32): void {
    this.wheelForces[wheelIndex] = value;
  }

  /**
   * Apply a torque on one of the wheels.
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

    world.addEventListener('preStep', this);
  }

  onEvent(event: Event): void {
    if (event.type == 'preStep') {
      this._update();
    }
  }

  private _update(): void {
    const wheelForces = this.wheelForces;
    for (let i: i32 = 0; i < wheelForces.length; i++) {
      this.applyWheelForce(wheelForces[i], i);
    }
  }

  /**
   * Remove the vehicle including its constraints from the world.
   */
  removeFromWorld(world: World): void {
    const constraints = this.constraints;
    const bodies = this.wheelBodies.concat([this.chassisBody]);

    for (let i: i32 = 0; i < bodies.length; i++) {
      world.removeBody(bodies[i]);
    }

    for (let i: i32 = 0; i < constraints.length; i++) {
      world.removeConstraint(constraints[i]);
    }
  }

  /**
   * Get current rotational velocity of a wheel
   */
  getWheelSpeed(wheelIndex: i32): f32 {
    const axis = this.wheelAxes[wheelIndex];
    const wheelBody = this.wheelBodies[wheelIndex];
    const w = wheelBody.angularVelocity;
    this.chassisBody.vectorToWorldFrame(axis, worldAxis);
    return w.dot(worldAxis);
  }
}

const torque = new Vec3();

const worldAxis = new Vec3();
