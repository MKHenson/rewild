import { Material } from "../../materials/Material";
import { MeshBasicMaterial } from "../../materials/MeshBasicMaterial";
import { DebugMaterial } from "../../materials/DebugMaterial";
import { BridgeManager } from "../../core/BridgeManager";
import { ShaderRef } from "./ShaderRef";

const shaders: ShaderRef[] = [];

function getShader(name: string): ShaderRef {
  for (let i = 0, l = shaders.length; i < l; i++) {
    if (shaders[i].name == name) return shaders[i];
  }

  throw new Error(`Shader ${name} not found`);
}

export class WebGLPrograms {
  constructor() {}

  getProgram(material: Material): ShaderRef {
    if (material instanceof MeshBasicMaterial) {
      const toRet = getShader("QuadShader");
      toRet.mainTexture = BridgeManager.getBridge().getTexureIndex("./media/uv-grid.jpg");
      return toRet;
    } else if (material instanceof DebugMaterial) {
      const toRet = getShader("DebugShader");
      return toRet;
    } else return getShader("Test");
  }
}

export function createShader(name: string, shaderIndex: i32): ShaderRef {
  const newShader = new ShaderRef(name, shaderIndex);
  shaders.push(newShader);
  return newShader;
}
