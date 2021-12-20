import { AttributeType } from "../../../common/ShaderConstants";
import { AttributeTypes } from "../../core/BufferGeometry";
import { BridgeManager } from "../../core/BridgeManager";

let shaderRedID = 0;

class ShaderAttribute {
  constructor(public location: i32, public locationSize: i32, public name: string) {}
}

export class ShaderRef {
  name: string;
  id: i32;
  shaderIndex: i32;
  uModelViewMatrix: i32;
  // uViewMatrix: i32;
  uMainTexture: i32;
  uProjMatrix: i32;
  mainTexture: i32;

  private attributes: Map<symbol, ShaderAttribute>;

  constructor(name: string, shaderIndex: i32) {
    this.name = name;
    this.mainTexture = -1;
    this.id = shaderRedID++;
    const bridge = BridgeManager.getBridge();
    this.shaderIndex = shaderIndex;
    this.uModelViewMatrix = bridge.getUniformLocation(shaderIndex, "modelViewMatrix");
    // this.uViewMatrix = getUniformLocation(this.shaderIndex, "cameraMatrix");
    this.uProjMatrix = bridge.getUniformLocation(shaderIndex, "projectionMatrix");
    this.uMainTexture = bridge.getUniformLocation(shaderIndex, "mainTexture");
    this.attributes = new Map();
  }

  getAttributes(): Map<symbol, ShaderAttribute> {
    return this.attributes;
  }

  addAttribute(type: AttributeType, location: i32, locationSize: i32, name: string): void {
    let shaderSymbol = AttributeTypes.POSITION;

    if (type === AttributeType.Normal) shaderSymbol = AttributeTypes.NORMAL;
    else if (type === AttributeType.UV) shaderSymbol = AttributeTypes.UV;

    this.attributes.set(shaderSymbol, new ShaderAttribute(location, locationSize, name));
  }
}
