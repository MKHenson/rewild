import { Color, Vector3 } from 'rewild-common';
import { Node } from 'rewild-routing';
import { PointLight } from 'node_modules/rewild-renderer/lib/core/lights/PointLight';
import {
  Raycaster,
  Intersection,
} from 'node_modules/rewild-renderer/lib/core/Raycaster';
import { StateMachineData } from './Types';

const LIGHT_COUNT = 100;
const GRID_SIZE = 10; // 10x10 grid
const SPREAD = 250; // ±125 units in X and Z
const LIGHT_HEIGHT_ABOVE_TERRAIN = 3.0;
const RAYCAST_ORIGIN_Y = 500.0;
const LIGHT_RADIUS = 20.0;
const LIGHT_INTENSITY = 2.0;

// Pre-allocated for raycasting — no allocations inside onUpdate.
const _origin = new Vector3();
const _direction = new Vector3(0, -1, 0);
const _intersects: Intersection[] = [];

export class LightingTester extends Node {
  private _lights: PointLight[] = [];
  private _positioned: boolean[] = new Array(LIGHT_COUNT).fill(false);
  private _allPositioned = false;
  private _raycaster = new Raycaster(
    _origin,
    _direction,
    0,
    RAYCAST_ORIGIN_Y + 200
  );

  constructor() {
    super('LightingTester', false);
  }

  mount(): void {
    super.mount();

    const stateData = this.stateMachine?.data as StateMachineData;
    const renderer = stateData.renderer;

    // Create 100 point lights in a 10x10 grid.
    // Start at a default Y until BVH raycasting places them on the terrain.
    let idx = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = -SPREAD / 2 + (col / (GRID_SIZE - 1)) * SPREAD;
        const z = -SPREAD / 2 + (row / (GRID_SIZE - 1)) * SPREAD;

        const hue = idx / LIGHT_COUNT;
        const light = new PointLight(hsvToRgb(hue, 0.8, 1.0), LIGHT_INTENSITY);
        light.radius = LIGHT_RADIUS;
        light.transform.position.set(x, RAYCAST_ORIGIN_Y, z);
        renderer.scene.addChild(light.transform);

        this._lights[idx] = light;
        this._positioned[idx] = false;
        idx++;
      }
    }
  }

  unMount(): void {
    super.unMount();

    for (let i = 0; i < this._lights.length; i++) {
      this._lights[i].transform.removeFromParent();
    }

    this._lights.length = 0;
    this._allPositioned = false;
  }

  onUpdate(delta: f32, total: u32): void {
    if (this._allPositioned) return;

    const stateData = this.stateMachine?.data as StateMachineData;
    const sceneBVH = stateData.renderer.sceneBVH;
    if (!sceneBVH) return;

    let allDone = true;

    for (let i = 0; i < LIGHT_COUNT; i++) {
      if (this._positioned[i]) continue;

      const light = this._lights[i];
      const lx = light.transform.position.x;
      const lz = light.transform.position.z;

      _origin.set(lx, RAYCAST_ORIGIN_Y, lz);
      this._raycaster.set(_origin, _direction);
      _intersects.length = 0;
      this._raycaster.intersectBVHScene(sceneBVH, _intersects);

      if (_intersects.length > 0) {
        const terrainY = _intersects[0].point.y;
        light.transform.position.set(
          lx,
          terrainY + LIGHT_HEIGHT_ABOVE_TERRAIN,
          lz
        );
        this._positioned[i] = true;
      } else {
        allDone = false;
      }
    }

    if (allDone) this._allPositioned = true;
  }
}

/** Simple HSV→Color conversion — called only during mount, not per-frame. */
function hsvToRgb(h: f32, s: f32, v: f32): Color {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: f32, g: f32, b: f32;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
      break;
  }
  return new Color(r, g, b);
}
