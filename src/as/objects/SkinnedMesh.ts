import { BufferGeometry } from "../core/BufferGeometry";
import { Material } from "../materials/Material";
import { MeshBasicMaterial } from "../materials/MeshBasicMaterial";
import { Vector3 } from "../math/Vector3";
import { MeshNode } from "./MeshNode";

export class SkinnedMesh extends MeshNode {
  constructor(geometry: BufferGeometry = new BufferGeometry(), materials: Material[] = [new MeshBasicMaterial()]) {
    super(geometry, materials);
  }

  boneTransform(index: i32, target: Vector3): void {}
}
