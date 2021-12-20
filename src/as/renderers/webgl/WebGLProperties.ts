import { ShaderRef } from "./ShaderRef";
import { Material } from "../../materials/Material";

export class MaterialProperties {
  public program: ShaderRef | null = null;
  public version: i32 = -1;
}

export class WebGLProperties {
  properties: Map<Material, MaterialProperties>;

  constructor() {
    this.properties = new Map();
  }

  get(object: Material): MaterialProperties {
    if (!this.properties.has(object)) {
      const props = new MaterialProperties();
      this.properties.set(object, props);
      return props;
    } else return this.properties.get!(object);
  }

  remove(object: Material): void {
    this.properties.delete(object);
  }

  // TODO: ?
  // update( object: Material, key, value ) {

  // 	this.properties.get( object )[ key ] = value;

  // }

  dispose(): void {
    this.properties = new Map();
  }
}
