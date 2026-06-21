import { Color, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { DirectionLight } from '../../core/lights/DirectionLight';
import { PointLight } from '../../core/lights/PointLight';
import { SpotLight } from '../../core/lights/SpotLight';
import { Light } from '../../core/lights/Light';

const MAX_LIGHTS = 32;
// Reserve 4 slots for lights fading out so they can complete their transition.
const MAX_ACTIVE_LIGHTS = 28;
const MAX_DECAY_LIGHTS = 4;
const HEADER_BYTES = 16;
const LIGHT_STRIDE_FLOATS = 16;
const MAX_CANDIDATES = 256;
const HYSTERESIS_FACTOR = 1.1;
const FADE_IN_MS = 600;
const FADE_OUT_MS = 400;

export class Lighting implements ISharedUniformBuffer {
  lightingData: ArrayBuffer;
  lightingFloats: Float32Array;
  lightingInts: Uint32Array;
  private _direction: Vector3;
  private _position: Vector3;
  private _color: Color;

  private _activeLightSet: Set<Light>;
  private _candidateLights: Array<Light | null>;
  private _candidateScores: Float32Array;
  private _fadeFactors: Map<Light, number>;
  private _decayBuffer: Array<Light | null>;

  group: number;
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this._direction = new Vector3();
    this._position = new Vector3();
    this._color = new Color();
    this._activeLightSet = new Set();
    this._candidateLights = new Array(MAX_CANDIDATES).fill(null);
    this._candidateScores = new Float32Array(MAX_CANDIDATES);
    this._fadeFactors = new Map();
    this._decayBuffer = new Array(MAX_DECAY_LIGHTS).fill(null);

    const totalSize = HEADER_BYTES + MAX_LIGHTS * LIGHT_STRIDE_FLOATS * 4;
    this.lightingData = new ArrayBuffer(totalSize);
    this.lightingFloats = new Float32Array(this.lightingData);
    this.lightingInts = new Uint32Array(this.lightingData);
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    this.buffer = device.createBuffer({
      size: this.lightingData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.buffer,
          },
        },
      ],
    });
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    const { device } = renderer;
    const camPos = camera.transform.position;
    const dt = renderer.delta;

    const direction = this._direction;
    const position = this._position;
    const color = this._color;

    let lightCount = 0;
    let offset = HEADER_BYTES / 4;
    let numCandidates = 0;

    renderer.shadowCastingSpotLightIndex = -1;

    // Pass 1: directional lights always included; collect point/spot candidates.
    for (const light of renderer.currentRenderList.lights) {
      if (!light.transform.visible) continue;

      if (light instanceof DirectionLight) {
        if (lightCount >= MAX_LIGHTS) continue;

        direction
          .subVectors(light.target.position, light.transform.position)
          .normalize();
        direction.transformDirection(camera.matrixWorldInverse).normalize();
        color.copy(light.color);

        this.lightingFloats[offset + 0] = direction.x;
        this.lightingFloats[offset + 1] = direction.y;
        this.lightingFloats[offset + 2] = direction.z;
        this.lightingFloats[offset + 3] = light.intensity;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = 0.0;
        this.lightingFloats[offset + 8] = 0.0;
        this.lightingFloats[offset + 9] = 0.0;
        this.lightingFloats[offset + 10] = 0.0;
        this.lightingFloats[offset + 11] = 1.0; // lightType = directional
        this.lightingFloats[offset + 12] = 0.0;
        this.lightingFloats[offset + 13] = 0.0;
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      } else if (light instanceof PointLight || light instanceof SpotLight) {
        if (numCandidates >= MAX_CANDIDATES) continue;

        // Must use world position (matrixWorld) — lights may live inside a scene hierarchy.
        position.setFromMatrixPosition(light.transform.matrixWorld);
        const range = light instanceof PointLight
          ? (light as PointLight).radius
          : (light as SpotLight).range;

        const dx = position.x - camPos.x;
        const dy = position.y - camPos.y;
        const dz = position.z - camPos.z;
        const dist2 = dx * dx + dy * dy + dz * dz;
        // Weight score by how much of the frustum the light's sphere actually covers:
        // intensity / dist² inside range, intensity × range² / dist⁴ outside it.
        // Prevents high-intensity lights with a small range from outscoring nearby
        // lights once the camera is outside their sphere of influence.
        const rangeWeight = Math.min(1.0, (range * range) / (dist2 + 1.0));
        let score = light.intensity * rangeWeight / (dist2 + 1.0);

        if (this._activeLightSet.has(light)) score *= HYSTERESIS_FACTOR;

        this._candidateLights[numCandidates] = light;
        this._candidateScores[numCandidates] = score;
        numCandidates++;
      }
    }

    // Sort candidates descending by score (insertion sort — small N, no allocations).
    for (let i = 1; i < numCandidates; i++) {
      const keyLight = this._candidateLights[i];
      const keyScore = this._candidateScores[i];
      let j = i - 1;
      while (j >= 0 && this._candidateScores[j] < keyScore) {
        this._candidateLights[j + 1] = this._candidateLights[j];
        this._candidateScores[j + 1] = this._candidateScores[j];
        j--;
      }
      this._candidateLights[j + 1] = keyLight;
      this._candidateScores[j + 1] = keyScore;
    }

    const remainingSlots = MAX_LIGHTS - lightCount;
    const toWrite = Math.min(numCandidates, Math.min(remainingSlots, MAX_ACTIVE_LIGHTS));

    const fadeInStep = dt / FADE_IN_MS;
    const fadeOutStep = dt / FADE_OUT_MS;

    // Ramp up factors for the newly selected lights.
    for (let i = 0; i < toWrite; i++) {
      const light = this._candidateLights[i]!;
      const f = this._fadeFactors.get(light) ?? 0;
      this._fadeFactors.set(light, Math.min(1.0, f + fadeInStep));
    }

    // Ramp down factors for lights that have a non-zero factor but are not in the new selection.
    // Iterating _fadeFactors directly handles multi-frame decays correctly (not just last-frame exits).
    // Deleting the current key during for-of iteration is safe per the ECMAScript spec.
    let numDecay = 0;
    for (const decayLight of this._fadeFactors.keys()) {
      let inNewSelection = false;
      for (let j = 0; j < toWrite; j++) {
        if (this._candidateLights[j] === decayLight) {
          inNewSelection = true;
          break;
        }
      }
      if (inNewSelection) continue;

      const f = this._fadeFactors.get(decayLight)!;
      const newF = f - fadeOutStep;
      if (newF <= 0) {
        this._fadeFactors.delete(decayLight);
      } else {
        this._fadeFactors.set(decayLight, newF);
        if (numDecay < MAX_DECAY_LIGHTS) {
          this._decayBuffer[numDecay++] = decayLight;
        }
      }
    }

    // Pass 2: write selected (active) lights with fade-in factor.
    this._activeLightSet.clear();

    for (let i = 0; i < toWrite && lightCount < MAX_LIGHTS; i++) {
      const light = this._candidateLights[i]!;
      const factor = this._fadeFactors.get(light) ?? 1.0;
      this._activeLightSet.add(light);

      if (light instanceof PointLight) {
        position.setFromMatrixPosition(light.transform.matrixWorld);
        position.applyMatrix4(camera.matrixWorldInverse);
        color.copy(light.color);

        this.lightingFloats[offset + 0] = position.x;
        this.lightingFloats[offset + 1] = position.y;
        this.lightingFloats[offset + 2] = position.z;
        this.lightingFloats[offset + 3] = light.intensity * factor;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = light.radius;
        this.lightingFloats[offset + 8] = 0.0;
        this.lightingFloats[offset + 9] = 0.0;
        this.lightingFloats[offset + 10] = 0.0;
        this.lightingFloats[offset + 11] = 0.0; // lightType = point
        this.lightingFloats[offset + 12] = 0.0;
        this.lightingFloats[offset + 13] = 0.0;
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      } else if (light instanceof SpotLight) {
        position.setFromMatrixPosition(light.transform.matrixWorld);
        position.applyMatrix4(camera.matrixWorldInverse);

        direction
          .subVectors(light.target.position, light.transform.position)
          .normalize();
        direction.transformDirection(camera.matrixWorldInverse).normalize();
        color.copy(light.color);

        this.lightingFloats[offset + 0] = position.x;
        this.lightingFloats[offset + 1] = position.y;
        this.lightingFloats[offset + 2] = position.z;
        this.lightingFloats[offset + 3] = light.intensity * factor;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = light.range;
        this.lightingFloats[offset + 8] = direction.x;
        this.lightingFloats[offset + 9] = direction.y;
        this.lightingFloats[offset + 10] = direction.z;
        this.lightingFloats[offset + 11] = 2.0; // lightType = spot
        this.lightingFloats[offset + 12] = light.innerAngle;
        this.lightingFloats[offset + 13] = light.outerAngle;
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        if (light.castShadow) {
          renderer.shadowCastingSpotLightIndex = lightCount;
        }

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      }
    }

    // Pass 3: write decaying lights (fading out) into the reserved slots.
    for (let i = 0; i < numDecay && lightCount < MAX_LIGHTS; i++) {
      const light = this._decayBuffer[i]!;
      const factor = this._fadeFactors.get(light) ?? 0;
      if (factor <= 0) continue;

      if (light instanceof PointLight) {
        position.setFromMatrixPosition(light.transform.matrixWorld);
        position.applyMatrix4(camera.matrixWorldInverse);
        color.copy(light.color);

        this.lightingFloats[offset + 0] = position.x;
        this.lightingFloats[offset + 1] = position.y;
        this.lightingFloats[offset + 2] = position.z;
        this.lightingFloats[offset + 3] = light.intensity * factor;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = light.radius;
        this.lightingFloats[offset + 8] = 0.0;
        this.lightingFloats[offset + 9] = 0.0;
        this.lightingFloats[offset + 10] = 0.0;
        this.lightingFloats[offset + 11] = 0.0; // lightType = point
        this.lightingFloats[offset + 12] = 0.0;
        this.lightingFloats[offset + 13] = 0.0;
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      } else if (light instanceof SpotLight) {
        position.setFromMatrixPosition(light.transform.matrixWorld);
        position.applyMatrix4(camera.matrixWorldInverse);

        direction
          .subVectors(light.target.position, light.transform.position)
          .normalize();
        direction.transformDirection(camera.matrixWorldInverse).normalize();
        color.copy(light.color);

        this.lightingFloats[offset + 0] = position.x;
        this.lightingFloats[offset + 1] = position.y;
        this.lightingFloats[offset + 2] = position.z;
        this.lightingFloats[offset + 3] = light.intensity * factor;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = light.range;
        this.lightingFloats[offset + 8] = direction.x;
        this.lightingFloats[offset + 9] = direction.y;
        this.lightingFloats[offset + 10] = direction.z;
        this.lightingFloats[offset + 11] = 2.0; // lightType = spot
        this.lightingFloats[offset + 12] = light.innerAngle;
        this.lightingFloats[offset + 13] = light.outerAngle;
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      }
    }

    this.lightingInts[0] = lightCount;

    device.queue.writeBuffer(
      this.buffer,
      0,
      this.lightingData,
      0,
      this.lightingData.byteLength
    );
  }
}
