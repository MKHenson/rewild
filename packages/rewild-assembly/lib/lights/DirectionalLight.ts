import { Light } from "./Light";
import { DirectionalLightShadow } from "./DirectionalLightShadow";
import { TransformNode } from "../core/TransformNode";
import { Color } from "rewild-common";

export class DirectionalLight extends Light {
  target: TransformNode;
  shadow: DirectionalLightShadow;

  constructor(color: Color, intensity: f32) {
    super(color, intensity);

    this.type = "DirectionalLight";

    this.position.copy(TransformNode.DefaultUp);

    this.target = new TransformNode();
    this.shadow = new DirectionalLightShadow();

    this.updateMatrix();
  }

  dispose(): void {
    this.shadow.dispose();
  }

  copy(source: TransformNode, recursive?: boolean): TransformNode {
    super.copy(source, recursive);

    const sourceLight = source as DirectionalLight;

    this.target = sourceLight.clone();
    this.shadow = sourceLight.shadow.clone() as DirectionalLightShadow;

    return this;
  }
}

export function createDiectionalLight(name: string | null = null): Light {
  const light = new DirectionalLight(new Color(1, 1, 1), 1);
  if (name) light.name = name;
  return light;
}
