import { Material } from "./Material";

export class DebugMaterial extends Material {
  constructor() {
    super();
    this.type = "DebugMaterial";
  }

  copy(source: DebugMaterial): DebugMaterial {
    super.copy(source);
    return this;
  }
}
