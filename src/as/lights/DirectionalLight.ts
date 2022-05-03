import { Light } from "./Light";
import { DirectionalLightShadow } from "./DirectionalLightShadow";
import { TransformNode } from "../core/TransformNode";
import { Color } from "../math/Color";

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
