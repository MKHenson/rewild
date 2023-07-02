import { Vec3 } from "../math/Vec3";
import { Body } from "./Body";

const SPHSystem_getNeighbors_dist = new Vec3();
// Temp vectors for calculation
const SPHSystem_update_dist = new Vec3(),
  SPHSystem_update_a_pressure = new Vec3(),
  SPHSystem_update_a_visc = new Vec3(),
  SPHSystem_update_gradW = new Vec3(),
  SPHSystem_update_r_vec = new Vec3(),
  SPHSystem_update_u = new Vec3(); // Relative velocity

export class SPHSystem {
  particles: Body[];
  density: f32;
  smoothingRadius: f32;
  speedOfSound: f32;
  viscosity: f32;
  eps: f32;
  pressures: f32[];
  densities: f32[];
  neighbors: Body[][];

  /**
   * Smoothed-particle hydrodynamics system
   * @class SPHSystem
   * @constructor
   */
  constructor() {
    this.particles = [];

    /**
     * Density of the system (kg/m3).
     * @property {number} density
     */
    this.density = 1;

    /**
     * Distance below which two particles are considered to be neighbors.
     * It should be adjusted so there are about 15-20 neighbor particles within this radius.
     * @property {number} smoothingRadius
     */
    this.smoothingRadius = 1;
    this.speedOfSound = 1;

    /**
     * Viscosity of the system.
     * @property {number} viscosity
     */
    this.viscosity = 0.01;
    this.eps = 0.000001;

    // Stuff Computed per particle
    this.pressures = [];
    this.densities = [];
    this.neighbors = [];
  }

  /**
   * Add a particle to the system.
   * @method add
   * @param {Body} particle
   */
  add(particle: Body): void {
    this.particles.push(particle);
    if (this.neighbors.length < this.particles.length) {
      this.neighbors.push([]);
    }
  }

  /**
   * Remove a particle from the system.
   * @method remove
   * @param {Body} particle
   */
  remove(particle: Body): void {
    const idx = this.particles.indexOf(particle);
    if (idx !== -1) {
      this.particles.splice(idx, 1);
      if (this.neighbors.length > this.particles.length) {
        this.neighbors.pop();
      }
    }
  }

  /**
   * Get neighbors within smoothing volume, save in the array neighbors
   * @method getNeighbors
   * @param {Body} particle
   * @param {Array} neighbors
   */
  getNeighbors(particle: Body, neighbors: Body[]): void {
    const N = this.particles.length,
      id = particle.id,
      R2 = this.smoothingRadius * this.smoothingRadius,
      dist = SPHSystem_getNeighbors_dist;
    for (let i: i32 = 0; i !== N; i++) {
      const p = this.particles[i];
      p.position.vsub(particle.position, dist);
      if (id !== p.id && dist.norm2() < R2) {
        neighbors.push(p);
      }
    }
  }

  update() {
    const N = this.particles.length,
      dist = SPHSystem_update_dist,
      cs = this.speedOfSound,
      eps = this.eps;

    for (let i: i32 = 0; i !== N; i++) {
      const p = this.particles[i]; // Current particle
      const neighbors = this.neighbors[i];

      // Get neighbors
      neighbors.length = 0;
      this.getNeighbors(p, neighbors);
      neighbors.push(this.particles[i]); // Add current too
      const numNeighbors = neighbors.length;

      // Accumulate density for the particle
      let sum: f32 = 0.0;
      for (let j: i32 = 0; j != numNeighbors; j++) {
        //printf("Current particle has position %f %f %f\n",objects[id].pos.x(),objects[id].pos.y(),objects[id].pos.z());
        p.position.vsub(neighbors[j].position, dist);
        const len = dist.norm();

        const weight = this.w(len);
        sum += neighbors[j].mass * weight;
      }

      // Save
      this.densities[i] = sum;
      this.pressures[i] = cs * cs * (this.densities[i] - this.density);
    }

    // Add forces

    // Sum to these accelerations
    const a_pressure = SPHSystem_update_a_pressure;
    const a_visc = SPHSystem_update_a_visc;
    const gradW = SPHSystem_update_gradW;
    const r_vec = SPHSystem_update_r_vec;
    const u = SPHSystem_update_u;

    for (let i: i32 = 0; i != N; i++) {
      const particle = this.particles[i];

      a_pressure.set(0, 0, 0);
      a_visc.set(0, 0, 0);

      // Init vars
      let Pij: f32;
      let nabla: f32;
      // let Vij: f32;

      // Sum up for all other neighbors
      const neighbors = this.neighbors[i];
      const numNeighbors = neighbors.length;

      //printf("Neighbors: ");
      for (let j: i32 = 0; j != numNeighbors; j++) {
        const neighbor = neighbors[j];
        //printf("%d ",nj);

        // Get r once for all..
        particle.position.vsub(neighbor.position, r_vec);
        const r = r_vec.norm();

        // Pressure contribution
        Pij =
          -neighbor.mass *
          (this.pressures[i] / (this.densities[i] * this.densities[i] + eps) +
            this.pressures[j] / (this.densities[j] * this.densities[j] + eps));
        this.gradw(r_vec, gradW);
        // Add to pressure acceleration
        gradW.mult(Pij, gradW);
        a_pressure.vadd(gradW, a_pressure);

        // Viscosity contribution
        neighbor.velocity.vsub(particle.velocity, u);
        u.mult(
          (1.0 / (0.0001 + this.densities[i] * this.densities[j])) *
            this.viscosity *
            neighbor.mass,
          u
        );
        nabla = this.nablaw(r);
        u.mult(nabla, u);
        // Add to viscosity acceleration
        a_visc.vadd(u, a_visc);
      }

      // Calculate force
      a_visc.mult(particle.mass, a_visc);
      a_pressure.mult(particle.mass, a_pressure);

      // Add force to particles
      particle.force.vadd(a_visc, particle.force);
      particle.force.vadd(a_pressure, particle.force);
    }
  }

  // Calculate the weight using the W(r) weightfunction
  w(r: f32): f32 {
    // 315
    const h = this.smoothingRadius;
    return (
      (315.0 / (64.0 * Mathf.PI * Mathf.pow(h, 9))) *
      Mathf.pow(h * h - r * r, 3)
    );
  }

  // calculate gradient of the weight function
  gradw(rVec: Vec3, resultVec: Vec3): void {
    const r = rVec.norm(),
      h = this.smoothingRadius;
    rVec.mult(
      (945.0 / (32.0 * Mathf.PI * Mathf.pow(h, 9))) *
        Mathf.pow(h * h - r * r, 2),
      resultVec
    );
  }

  // Calculate nabla(W)
  nablaw(r: f32): f32 {
    const h = this.smoothingRadius;
    const nabla =
      (945.0 / (32.0 * Mathf.PI * Mathf.pow(h, 9))) *
      (h * h - r * r) *
      (7 * r * r - 3 * h * h);
    return nabla;
  }
}
