import { BufferGeometry } from "../core/BufferGeometry";
import { Material } from "../materials/Material";
import { MeshBasicMaterial } from "../materials/MeshBasicMaterial";
import { EngineVector3 } from "../math/Vector3";
import { MeshComponent } from "../components/MeshComponent";

export class SkinnedMesh extends MeshComponent {
  constructor(geometry: BufferGeometry = new BufferGeometry(), materials: Material[] = [new MeshBasicMaterial()]) {
    super(geometry, materials);
  }

  boneTransform(index: i32, target: EngineVector3): void {}
}
