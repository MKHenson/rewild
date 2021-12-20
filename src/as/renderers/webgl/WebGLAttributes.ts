import { BaseAttribute, Float16BufferAttribute } from "../../core/BufferAttribute";
import { GLBufferAttribute } from "../../core/GLBufferAttribute";
import { InterleavedBufferAttribute } from "../../core/InterleavedBufferAttribute";
import { BufferObjects, DataType } from "../../../common/GLEnums";
import { BridgeManager } from "../../core/BridgeManager";

class MountedBuffer {
  public buffer: i32;
  public type: DataType;
  public bytesPerElement: usize;
  public version: i32;
}

export class WebGLAttributes {
  buffers: Map<BaseAttribute, MountedBuffer>;

  constructor() {
    this.buffers = new Map();
  }

  private createBuffer(attribute: BaseAttribute, bufferType: BufferObjects): MountedBuffer {
    const array = attribute.getArray();
    const usage = attribute.getUsage();
    const bridge = BridgeManager.getBridge();

    const buffer = bridge.createBuffer();

    bridge.bindBuffer(bufferType, buffer);
    bridge.bufferData(bufferType, array, usage);

    if (attribute.onUploadCallback) {
      attribute.onUploadCallback();
    }

    let type: DataType = DataType.FLOAT;
    let bytesPerElement: usize = 0;

    if (array instanceof Float32Array) {
      type = DataType.FLOAT;
      bytesPerElement = Float32Array.BYTES_PER_ELEMENT;
    } else if (array instanceof Float64Array) {
      console.warn("THREE.WebGLAttributes: Unsupported data buffer format: Float64Array.");
    } else if (array instanceof Uint16Array) {
      bytesPerElement = Uint16Array.BYTES_PER_ELEMENT;
      if (attribute instanceof Float16BufferAttribute) {
        type = DataType.HALF_FLOAT;
      } else {
        type = DataType.UNSIGNED_SHORT;
      }
    } else if (array instanceof Int16Array) {
      type = DataType.SHORT;
      bytesPerElement = Int16Array.BYTES_PER_ELEMENT;
    } else if (array instanceof Uint32Array) {
      type = DataType.UNSIGNED_INT;
      bytesPerElement = Uint32Array.BYTES_PER_ELEMENT;
    } else if (array instanceof Int32Array) {
      type = DataType.INT;
      bytesPerElement = Int32Array.BYTES_PER_ELEMENT;
    } else if (array instanceof Int8Array) {
      type = DataType.BYTE;
      bytesPerElement = Int8Array.BYTES_PER_ELEMENT;
    } else if (array instanceof Uint8Array) {
      type = DataType.UNSIGNED_BYTE;
      bytesPerElement = Uint8Array.BYTES_PER_ELEMENT;
    } else if (array instanceof Uint8ClampedArray) {
      type = DataType.UNSIGNED_BYTE;
      bytesPerElement = Uint8ClampedArray.BYTES_PER_ELEMENT;
    }

    return {
      buffer: buffer,
      type: type,
      bytesPerElement: bytesPerElement,
      version: attribute.version,
    };
  }

  private updateBuffer(buffer: i32, attribute: BaseAttribute, bufferType: BufferObjects, bytesPerElement: usize): void {
    const array = attribute.getArray();
    const updateRange = attribute.getUpdateRange()!;
    const bridge = BridgeManager.getBridge();
    bridge.bindBuffer(bufferType, buffer);

    if (updateRange.count === -1) {
      // Not using update ranges
      bridge.bufferSubData(bufferType, 0, array, 0, 0);
    } else {
      bridge.bufferSubData(
        bufferType,
        updateRange.offset * i32(bytesPerElement),
        array,
        updateRange.offset,
        updateRange.count
      );

      updateRange.count = -1; // reset range
    }
  }

  //

  get(attribute: BaseAttribute): MountedBuffer {
    if (attribute instanceof InterleavedBufferAttribute) attribute = attribute.data;

    return this.buffers.get(attribute);
  }

  remove(attribute: BaseAttribute): void {
    if (attribute instanceof InterleavedBufferAttribute) attribute = attribute.data;

    const data = this.buffers.get(attribute);

    if (data) {
      BridgeManager.getBridge().deleteBuffer(data.buffer);
      this.buffers.delete(attribute);
    }
  }

  update(attribute: BaseAttribute, bufferType: BufferObjects): void {
    if (attribute instanceof GLBufferAttribute) {
      const cached = this.buffers.get(attribute);
      if (!cached || cached.version < attribute.version) {
        this.buffers.set(attribute, {
          buffer: attribute.buffer,
          type: attribute.type,
          bytesPerElement: attribute.elementSize,
          version: attribute.version,
        });
      }
      return;
    }
    if (attribute instanceof InterleavedBufferAttribute) attribute = (attribute as InterleavedBufferAttribute).data;
    const data = this.buffers.has(attribute) ? this.buffers.get(attribute) : null;
    if (data === null) {
      this.buffers.set(attribute, this.createBuffer(attribute, bufferType));
    } else if (data.version < attribute.version) {
      this.updateBuffer(data.buffer, attribute, bufferType, data.bytesPerElement);
      data.version = attribute.version;
    }
  }
}
