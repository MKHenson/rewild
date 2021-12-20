import { DataType, ShaderConstants, BufferObjects } from "../../../common/GLEnums";
import { BaseAttribute, BufferAttribute } from "../../core/BufferAttribute";
import { BufferGeometry } from "../../core/BufferGeometry";
import { InstancedBufferGeometry } from "../../core/InstancedBufferGeometry";
import { InterleavedBuffer } from "../../core/InterleavedBuffer";
import { InterleavedBufferAttribute } from "../../core/InterleavedBufferAttribute";
import { Object } from "../../core/Object";
import { Material } from "../../materials/Material";
import { InstancedMesh } from "../../objects/InstancedMesh";
import { ShaderRef } from "./ShaderRef";
import { WebGLAttributes } from "./WebGLAttributes";
import { BridgeManager } from "../../core/BridgeManager";
import { InstancedBufferAttribute } from "../../core/InstancedBufferAttribute";
import { InstancedInterleavedBuffer } from "../../core/InstancedInterleavedBuffer";

type StateMap = Map<boolean, BindingState>;

export class BindingState {
  geometry: BufferGeometry | null;
  program: ShaderRef | null;
  wireframe: boolean;
  newAttributes: i32[];
  enabledAttributes: i32[];
  attributeDivisors: i32[];
  object: i32;
  attributes: Map<symbol, CacheData>;
  index: BaseAttribute | null;
  attributesNum: i32;
}

class CacheData {
  public attribute: BaseAttribute;
  public data: InterleavedBuffer | null;
}

export class WebGLBindingStates {
  bindingStates: Map<i32, Map<i32, StateMap>>;
  defaultState!: BindingState;
  currentState!: BindingState;
  attributes!: WebGLAttributes;
  maxVertexAttributes: i32;

  constructor(attributes: WebGLAttributes) {
    this.maxVertexAttributes = BridgeManager.getBridge().getParameterI32(ShaderConstants.MAX_VERTEX_ATTRIBS);
    this.bindingStates = new Map();

    this.defaultState = this.createBindingState(-1);
    this.currentState = this.defaultState;
    this.attributes = attributes;
  }

  setup(object: Object, material: Material, program: ShaderRef, geometry: BufferGeometry, index: BaseAttribute): void {
    let updateBuffers = false;
    const attributes = this.attributes;
    const state = this.getBindingState(geometry, program, material);

    if (this.currentState !== state) {
      this.currentState = state;
      this.bindVertexArrayObject(state.object);
    }

    updateBuffers = this.needsUpdate(geometry, index);

    if (updateBuffers) this.saveCache(geometry, index);

    if (object instanceof InstancedMesh === true) {
      updateBuffers = true;
    }

    if (index !== null) {
      this.attributes.update(index, BufferObjects.ELEMENT_ARRAY_BUFFER);
    }

    if (updateBuffers) {
      this.setupVertexAttributes(object, material, program, geometry);

      if (index !== null) {
        BridgeManager.getBridge().bindBuffer(BufferObjects.ELEMENT_ARRAY_BUFFER, attributes.get(index).buffer);
      }
    }
  }

  private createVertexArrayObject(): i32 {
    return BridgeManager.getBridge().createVertexArray();
  }

  private bindVertexArrayObject(vao: i32): void {
    return BridgeManager.getBridge().bindVertexArray(vao);
  }

  private deleteVertexArrayObject(vao: i32): void {
    return BridgeManager.getBridge().deleteVertexArray(vao);
  }

  private getBindingState(geometry: BufferGeometry, program: ShaderRef, material: Material): BindingState {
    const wireframe = material.wireframe === true;

    let programMap = this.bindingStates.has(geometry.id) ? this.bindingStates.get(geometry.id) : null;

    if (programMap === null) {
      programMap = new Map();
      this.bindingStates.set(geometry.id, programMap);
    }

    let stateMap: StateMap | null = programMap!.has(program.id) ? programMap!.get(program.id) : null;

    if (stateMap === null) {
      stateMap = new Map();
      programMap!.set(program.id, stateMap!);
    }

    let state = stateMap.has(wireframe) ? stateMap.get(wireframe) : null;

    if (state === null) {
      state = this.createBindingState(this.createVertexArrayObject());
      stateMap.set(wireframe, state);
    }

    return state;
  }

  private createBindingState(vao: i32): BindingState {
    const newAttributes: i32[] = new Array<i32>(this.maxVertexAttributes);
    const enabledAttributes: i32[] = new Array<i32>(this.maxVertexAttributes);
    const attributeDivisors: i32[] = new Array<i32>(this.maxVertexAttributes);

    for (let i: i32 = 0; i < this.maxVertexAttributes; i++) {
      newAttributes[i] = 0;
      enabledAttributes[i] = 0;
      attributeDivisors[i] = 0;
    }

    return {
      // for backward compatibility on non-VAO support browser
      geometry: null,
      program: null,
      wireframe: false,

      newAttributes: newAttributes,
      enabledAttributes: enabledAttributes,
      attributeDivisors: attributeDivisors,
      object: vao,
      attributes: new Map(),
      index: null,
      attributesNum: -1,
    };
  }

  private needsUpdate(geometry: BufferGeometry, index: BaseAttribute): boolean {
    const cachedAttributes = this.currentState.attributes;
    const geometryAttributes = geometry.attributes;

    let attributesNum = 0;

    const geometryAttributesKeys = geometryAttributes.keys();
    for (let i: i32 = 0, l: i32 = geometryAttributesKeys.length; i < l; i++) {
      const key = geometryAttributesKeys[i];
      const cachedAttribute = cachedAttributes.has(key) ? cachedAttributes.get(key) : null;
      const geometryAttribute = geometryAttributes.get(key);

      const attrData =
        geometryAttribute instanceof InterleavedBufferAttribute
          ? (geometryAttribute as InterleavedBufferAttribute).data
          : null;

      if (cachedAttribute === null) return true;
      if (cachedAttribute.attribute !== geometryAttribute) return true;
      if (cachedAttribute.data !== attrData) return true;

      attributesNum++;
    }

    if (this.currentState.attributesNum !== attributesNum) return true;

    if (this.currentState.index !== index) return true;

    return false;
  }

  private saveCache(geometry: BufferGeometry, index: BaseAttribute): void {
    const cache: Map<symbol, CacheData> = new Map();
    const attributes = geometry.attributes;
    let attributesNum = 0;

    const attributeKeys = attributes.keys();
    for (let i: i32 = 0, l: i32 = attributeKeys.length; i < l; i++) {
      const key = attributeKeys[i];
      const attribute = attributes.get(key);
      const attrData =
        attribute instanceof InterleavedBufferAttribute ? (attribute as InterleavedBufferAttribute).data : null;

      const data: CacheData = {
        attribute: attribute,
        data: attrData,
      };

      // if (attribute.data) {
      //   data.data = attribute.data;
      // }

      cache.set(key, data);

      attributesNum++;
    }

    this.currentState.attributes = cache;
    this.currentState.attributesNum = attributesNum;
    this.currentState.index = index;
  }

  initAttributes(): void {
    const newAttributes = this.currentState.newAttributes;

    for (let i: i32 = 0, il: i32 = newAttributes.length; i < il; i++) {
      newAttributes[i] = 0;
    }
  }

  enableAttribute(attribute: i32): void {
    this.enableAttributeAndDivisor(attribute, 0);
  }

  private enableAttributeAndDivisor(attribute: i32, meshPerAttribute: i32): void {
    const newAttributes = this.currentState.newAttributes;
    const enabledAttributes = this.currentState.enabledAttributes;
    const attributeDivisors = this.currentState.attributeDivisors;

    newAttributes[attribute] = 1;

    if (enabledAttributes[attribute] === 0) {
      BridgeManager.getBridge().enableVertexAttribArray(attribute);
      enabledAttributes[attribute] = 1;
    }

    if (attributeDivisors[attribute] !== meshPerAttribute) {
      // const extension = capabilities.isWebGL2 ? gl : extensions.get("ANGLE_instanced_arrays");

      // extension[capabilities.isWebGL2 ? "vertexAttribDivisor" : "vertexAttribDivisorANGLE"](
      //   attribute,
      //   meshPerAttribute
      // );
      BridgeManager.getBridge().vertexAttribDivisor(attribute, meshPerAttribute);
      attributeDivisors[attribute] = meshPerAttribute;
    }
  }

  disableUnusedAttributes(): void {
    const newAttributes = this.currentState.newAttributes;
    const enabledAttributes = this.currentState.enabledAttributes;
    const bridge = BridgeManager.getBridge();

    for (let i: i32 = 0, il: i32 = enabledAttributes.length; i < il; i++) {
      if (enabledAttributes[i] !== newAttributes[i]) {
        bridge.disableVertexAttribArray(i);
        enabledAttributes[i] = 0;
      }
    }
  }

  private vertexAttribPointer(
    index: i32,
    size: i32,
    type: DataType,
    normalized: boolean,
    stride: i32,
    offset: i32
  ): void {
    if (type === DataType.INT || type === DataType.UNSIGNED_INT) {
      BridgeManager.getBridge().vertexAttribIPointer(index, size, type, stride, offset);
    } else {
      BridgeManager.getBridge().vertexAttribPointer(index, size, type, normalized, stride, offset);
    }
  }

  private setupVertexAttributes(
    object: Object,
    material: Material,
    program: ShaderRef,
    geometry: BufferGeometry
  ): void {
    // if (capabilities.isWebGL2 === false && (object instanceof InstancedMesh || geometry instanceof InstancedBufferGeometry)) {
    //   if (extensions.get("ANGLE_instanced_arrays") === null) return;
    // }
    const bridge = BridgeManager.getBridge();
    const attributes = this.attributes;
    this.initAttributes();

    const geometryAttributes = geometry.attributes;

    const programAttributes = program.getAttributes();

    const materialDefaultAttributeValues = material.defaultAttributeValues;

    const programAttributeKeys = programAttributes.keys();
    for (let i: i32 = 0, l: i32 = programAttributeKeys.length; i < l; i++) {
      const programAttribute = programAttributes.get(programAttributeKeys[i]);

      if (programAttribute.location >= 0) {
        let geometryAttribute = geometryAttributes.has(programAttributeKeys[i])
          ? geometryAttributes.get(programAttributeKeys[i])
          : null;

        if (geometryAttribute === null) {
          const instancedMesh = object as InstancedMesh;
          if (programAttribute.name === "instanceMatrix" && instancedMesh.instanceMatrix)
            geometryAttribute = instancedMesh.instanceMatrix;
          if (programAttribute.name === "instanceColor" && instancedMesh.instanceColor)
            geometryAttribute = instancedMesh.instanceColor;
        }

        if (geometryAttribute !== null) {
          const normalized = geometryAttribute.normalized;
          const size = geometryAttribute.itemSize;

          const attribute = attributes.get(geometryAttribute);

          // TODO Attribute may not be available on context restore

          if (attribute === undefined) continue;

          const buffer = attribute.buffer;
          const type = attribute.type;
          const bytesPerElement = attribute.bytesPerElement;

          const instancedGeometry =
            geometry instanceof InstancedBufferGeometry ? (geometry as InstancedBufferGeometry) : null;

          if (geometryAttribute instanceof InterleavedBufferAttribute) {
            const interleavedAttr = geometryAttribute as InterleavedBufferAttribute;
            const data = interleavedAttr.data;
            const stride = data.stride;
            const offset = interleavedAttr.offset;

            if (data && data instanceof InstancedInterleavedBuffer) {
              const interleavedBuffer = data as InstancedInterleavedBuffer;
              for (let i = 0; i < programAttribute.locationSize; i++) {
                this.enableAttributeAndDivisor(programAttribute.location + i, interleavedBuffer.meshPerAttribute);
              }

              if (
                object instanceof InstancedMesh !== true &&
                instancedGeometry &&
                instancedGeometry._maxInstanceCount === -1
              ) {
                instancedGeometry._maxInstanceCount = interleavedBuffer.meshPerAttribute * interleavedBuffer.count;
              }
            } else {
              for (let i = 0; i < programAttribute.locationSize; i++) {
                this.enableAttribute(programAttribute.location + i);
              }
            }

            bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, buffer);

            for (let i = 0; i < programAttribute.locationSize; i++) {
              this.vertexAttribPointer(
                programAttribute.location + i,
                size / programAttribute.locationSize,
                type,
                normalized,
                stride * bytesPerElement,
                (offset + (size / programAttribute.locationSize) * i) * bytesPerElement
              );
            }
          } else {
            if (geometryAttribute instanceof InstancedBufferAttribute) {
              for (let i = 0; i < programAttribute.locationSize; i++) {
                this.enableAttributeAndDivisor(programAttribute.location + i, geometryAttribute.meshPerAttribute);
              }

              if (
                object instanceof InstancedMesh !== true &&
                instancedGeometry &&
                instancedGeometry._maxInstanceCount === -1
              ) {
                instancedGeometry._maxInstanceCount = geometryAttribute.meshPerAttribute * geometryAttribute.count;
              }
            } else {
              for (let i: i32 = 0; i < programAttribute.locationSize; i++) {
                this.enableAttribute(programAttribute.location + i);
              }
            }

            bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, buffer);

            for (let i: i32 = 0; i < programAttribute.locationSize; i++) {
              this.vertexAttribPointer(
                programAttribute.location + i,
                size / programAttribute.locationSize,
                type,
                normalized,
                size * bytesPerElement,
                (size / programAttribute.locationSize) * i * bytesPerElement
              );
            }
          }
        } else if (materialDefaultAttributeValues !== null) {
          const value = materialDefaultAttributeValues.has(programAttribute.name)
            ? materialDefaultAttributeValues.get(programAttribute.name)
            : null;

          if (value !== null) {
            switch (value.length) {
              case 2:
                bridge.vertexAttrib2fv(programAttribute.location, value);
                break;

              case 3:
                bridge.vertexAttrib3fv(programAttribute.location, value);
                break;

              case 4:
                bridge.vertexAttrib4fv(programAttribute.location, value);
                break;

              default:
                bridge.vertexAttrib1fv(programAttribute.location, value);
            }
          }
        }
      }
    }

    this.disableUnusedAttributes();
  }

  dispose(): void {
    this.reset();
    const bindingStates = this.bindingStates;
    const bindingStatesKeys = bindingStates.keys();

    for (let i: i32 = 0, l: i32 = bindingStatesKeys.length; i < l; i++) {
      const geometryId = bindingStatesKeys[i];
      const programMap = bindingStates.get(geometryId);

      const programMapKeys = programMap.keys();
      for (let p: i32 = 0, pl: i32 = programMapKeys.length; p < pl; p++) {
        const programId = programMapKeys[p];
        const stateMap = programMap.get(programId);

        const stateMapKeys = stateMap.keys();
        for (let s: i32 = 0, sl: i32 = stateMapKeys.length; s < sl; s++) {
          const wireframe = stateMapKeys[s];
          this.deleteVertexArrayObject(stateMap.get(wireframe).object);

          stateMap.delete(wireframe);
        }

        programMap.delete(programId);
      }

      bindingStates.delete(geometryId);
    }
  }

  releaseStatesOfGeometry(geometry: BufferGeometry): void {
    if (!this.bindingStates.has(geometry.id)) return;

    const programMap = this.bindingStates.get(geometry.id);

    const programMapKeys = programMap.keys();
    for (let i: i32 = 0, l: i32 = programMapKeys.length; i < l; i++) {
      const programId = programMapKeys[i];
      const stateMap = programMap.get(programId);

      const stateMapKeys = stateMap.keys();
      for (let k: i32 = 0, kL: i32 = stateMapKeys.length; k < kL; k++) {
        const wireframe = stateMapKeys[k];

        this.deleteVertexArrayObject(stateMap.get(wireframe).object);

        stateMap.delete(wireframe);
      }

      programMap.delete(programId);
    }

    this.bindingStates.delete(geometry.id);
  }

  releaseStatesOfProgram(program: ShaderRef): void {
    const geometryIds = this.bindingStates.keys();
    for (let i: i32 = 0, l: i32 = geometryIds.length; i < l; i++) {
      const geometryId = geometryIds[i];
      const programMap = this.bindingStates.get(geometryId);

      if (!programMap.has(program.id)) continue;

      const stateMap = programMap.get(program.id);

      const stateMapKeys = stateMap.keys();
      for (let k: i32 = 0, kL: i32 = stateMapKeys.length; k < kL; k++) {
        const wireframe = stateMapKeys[k];
        this.deleteVertexArrayObject(stateMap.get(wireframe).object);

        stateMap.delete(wireframe);
      }

      programMap.delete(program.id);
    }
  }

  reset(): void {
    this.resetDefaultState();

    if (this.currentState === this.defaultState) return;

    this.currentState = this.defaultState;
    this.bindVertexArrayObject(this.currentState.object);
  }

  // for backward-compatilibity

  resetDefaultState(): void {
    this.defaultState.geometry = null;
    this.defaultState.program = null;
    this.defaultState.wireframe = false;
  }
}
