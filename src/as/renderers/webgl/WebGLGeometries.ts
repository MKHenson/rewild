import { BufferObjects } from "../../../common/GLEnums";
import {
  BaseAttribute,
  Float16BufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
} from "../../core/BufferAttribute";
import { AttributeTypes, BufferGeometry } from "../../core/BufferGeometry";
import { Event } from "../../core/Event";
import { Listener } from "../../core/EventDispatcher";
import { InstancedBufferGeometry } from "../../core/InstancedBufferGeometry";
import { arrayMax, toTypedArray } from "../../utils";
import { WebGLAttributes } from "./WebGLAttributes";
import { WebGLBindingStates } from "./WebGLBindingStates";
import { WebGLInfo } from "./WebGLInfo";

export class WebGLGeometries implements Listener {
  private geometries: Map<i32, boolean>;
  private wireframeAttributes: Map<BufferGeometry, BaseAttribute>;
  private bindingStates: WebGLBindingStates;
  private attributes: WebGLAttributes;
  private info: WebGLInfo;

  constructor(attributes: WebGLAttributes, info: WebGLInfo, bindingStates: WebGLBindingStates) {
    this.geometries = new Map();
    this.bindingStates = bindingStates;
    this.attributes = attributes;
    this.wireframeAttributes = new Map();
    this.info = info;
  }

  onEvent(event: Event): void {
    const attributes = this.attributes;
    const wireframeAttributes = this.wireframeAttributes;
    const info = this.info;
    const geometry = event.target as BufferGeometry;

    if (geometry.indexes !== null) {
      attributes.remove(geometry.indexes);
    }

    const attrKeys = geometry.attributes.keys();
    for (let i: i32 = 0, l: i32 = attrKeys.length; i < l; i++) {
      attributes.remove(geometry.attributes.get(attrKeys[i]));
    }

    geometry.removeEventListener("dispose", this);

    this.geometries.delete(geometry.id);

    const attribute = wireframeAttributes.get(geometry);

    if (attribute) {
      attributes.remove(attribute);
      wireframeAttributes.delete(geometry);
    }

    this.bindingStates.releaseStatesOfGeometry(geometry);

    if (geometry instanceof InstancedBufferGeometry) {
      geometry._maxInstanceCount = -1;
    }

    info.memory.geometries--;
  }

  get(object: Object, geometry: BufferGeometry): BufferGeometry {
    const geometries = this.geometries;
    const info = this.info;

    if (geometries.has(geometry.id) && geometries.get(geometry.id) === true) return geometry;

    geometry.addEventListener("dispose", this);

    geometries.set(geometry.id, true);

    info.memory.geometries++;

    return geometry;
  }

  update(geometry: BufferGeometry): void {
    const attributes = this.attributes;
    const geometryAttributes = geometry.attributes;

    // Updating index buffer in VAO now. See WebGLBindingStates.
    const keys = geometryAttributes.keys();
    for (let i = 0; i < keys.length; i++) {
      attributes.update(geometryAttributes.get(keys[i]), BufferObjects.ARRAY_BUFFER);
    }

    // morph targets

    const morphAttributes = geometry.morphAttributes;
    const morphAttrKeys = morphAttributes.keys();
    for (let i = 0; i < morphAttrKeys.length; i++) {
      const array = morphAttributes.get(morphAttrKeys[i]);

      for (let i = 0, l = array.length; i < l; i++) {
        attributes.update(array[i], BufferObjects.ARRAY_BUFFER);
      }
    }
  }

  private updateWireframeAttribute(geometry: BufferGeometry): void {
    const attributes = this.attributes;
    const wireframeAttributes = this.wireframeAttributes;
    const indices: i32[] = [];
    const geometryIndexes = geometry.indexes;
    const geometryPosition = geometry.getAttribute<Float16BufferAttribute>(AttributeTypes.POSITION)!;
    let version = 0;

    if (geometryIndexes !== null) {
      const array = geometryIndexes.array!;
      version = geometryIndexes.version;

      for (let i = 0, l = array.length; i < l; i += 3) {
        const a = array[i + 0];
        const b = array[i + 1];
        const c = array[i + 2];

        indices.push(a);
        indices.push(b);
        indices.push(b);
        indices.push(c);
        indices.push(c);
        indices.push(a);
      }
    } else {
      const array = geometryPosition.array;
      version = geometryPosition.version;

      for (let i = 0, l = array.length / 3 - 1; i < l; i += 3) {
        const a = i + 0;
        const b = i + 1;
        const c = i + 2;

        indices.push(a);
        indices.push(b);
        indices.push(b);
        indices.push(c);
        indices.push(c);
        indices.push(a);
      }
    }

    const attribute =
      arrayMax(indices, f32.NEGATIVE_INFINITY) > 65535
        ? new Uint32BufferAttribute(toTypedArray<i32, Uint32Array>(indices, Uint32Array.BYTES_PER_ELEMENT), 1)
        : new Uint16BufferAttribute(toTypedArray<i32, Uint16Array>(indices, Uint16Array.BYTES_PER_ELEMENT), 1);
    attribute.version = version;

    // Updating index buffer in VAO now. See WebGLBindingStates

    //

    const previousAttribute = wireframeAttributes.has(geometry) ? wireframeAttributes.get(geometry) : null;

    if (previousAttribute) attributes.remove(previousAttribute);

    //

    wireframeAttributes.set(geometry, attribute);
  }

  getWireframeAttribute(geometry: BufferGeometry): BaseAttribute {
    const wireframeAttributes = this.wireframeAttributes;
    const currentAttribute = wireframeAttributes.get(geometry);

    if (currentAttribute) {
      const geometryIndexes = geometry.indexes;

      if (geometryIndexes !== null) {
        // if the attribute is obsolete, create a new one

        const version = geometryIndexes.version;
        if (currentAttribute.version < version) {
          this.updateWireframeAttribute(geometry);
        }
      }
    } else {
      this.updateWireframeAttribute(geometry);
    }

    return wireframeAttributes.get(geometry);
  }
}
