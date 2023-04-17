import { InstancedBufferAttribute } from "../core/InstancedBufferAttribute";
import { Intersection, MeshComponent } from "../components/MeshComponent";
import { EngineMatrix4 } from "../math/Matrix4";
import { Raycaster } from "../core/Raycaster";
import { BufferGeometry } from "../core/BufferGeometry";
import { Color } from "rewild-common";
import { Event } from "../core/Event";
import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";

const _instanceLocalMatrix = new EngineMatrix4();
const _instanceWorldMatrix = new EngineMatrix4();

const _instanceIntersects: Intersection[] = [];
const _mesh = new MeshComponent();

const disposeEvent: Event = new Event("dispose");

export class InstancedMesh extends MeshComponent {
  count: i32;
  instanceColor: InstancedBufferAttribute<f32, Float32Array> | null;
  instanceMatrix: InstancedBufferAttribute<f32, Float32Array>;

  constructor(geometry: BufferGeometry, materials: MeshPipelineInstance[], count: i32) {
    super(geometry, materials);

    this.instanceMatrix = new InstancedBufferAttribute(new Float32Array(count * 16), 16);
    this.instanceColor = null;

    this.count = count;

    this.transform!.frustumCulled = false;
  }

  copy(source: InstancedMesh): InstancedMesh {
    super.copy(source);

    this.instanceMatrix!.copy(source.instanceMatrix, source.instanceMatrix!.array.slice(0));

    if (source.instanceColor != null)
      this.instanceColor = source.instanceColor.clone(null) as InstancedBufferAttribute<f32, Float32Array>;

    this.count = source.count;

    return this;
  }

  getColorAt(index: i32, color: Color): void {
    color.fromF32Array(this.instanceColor!.array, index * 3);
  }

  getMatrixAt(index: i32, matrix: EngineMatrix4): void {
    matrix.fromArray(this.instanceMatrix.array, index * 16);
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    const matrixWorld = this.transform!.matrixWorld;
    const raycastTimes = this.count;

    _mesh.geometry = this.geometry;
    _mesh.materials = this.materials;

    for (let instanceId: i32 = 0; instanceId < raycastTimes; instanceId++) {
      // calculate the world matrix for each instance

      this.getMatrixAt(instanceId, _instanceLocalMatrix);

      _instanceWorldMatrix.multiplyMatricesSIMD(matrixWorld, _instanceLocalMatrix);

      // the mesh represents this single instance

      _mesh.transform!.matrixWorld = _instanceWorldMatrix;

      _mesh.raycast(raycaster, _instanceIntersects);

      // process the result of raycast

      for (let i = 0, l = _instanceIntersects.length; i < l; i++) {
        const intersect = _instanceIntersects[i];
        intersect.instanceId = instanceId;
        intersect.object = this;
        intersects.push(intersect);
      }

      _instanceIntersects.length = 0;
    }
  }

  setColorAt(index: i32, color: Color): void {
    if (this.instanceColor === null) {
      this.instanceColor = new InstancedBufferAttribute(new Float32Array(this.instanceMatrix.count * 3), 3);
    }

    color.toF32Array(this.instanceColor.array, index * 3);
  }

  setMatrixAt(index: i32, matrix: EngineMatrix4): void {
    matrix.toArray(this.instanceMatrix.array, index * 16);
  }

  updateMorphTargets(): void {}

  dispose(): void {
    disposeEvent.target = this;
    this.dispatchEvent(disposeEvent);
  }
}
