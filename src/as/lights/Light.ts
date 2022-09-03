import { TransformNode } from "../core/TransformNode";
import { Color } from "../../common/math/Color";

export class Light extends TransformNode {
  isLight: boolean = true;
  color: Color;
  intensity: f32;

  constructor(color: Color, intensity: f32 = 1) {
    super();

    this.type = "Light";

    this.color = new Color(color.r, color.g, color.b);
    this.intensity = intensity;
  }

  dispose(): void {
    // Empty here in base class; some subclasses override.
  }

  copy(source: TransformNode, recursive: boolean = true): TransformNode {
    const lightSource = source as Light;
    super.copy(lightSource);

    this.color.copy(lightSource.color);
    this.intensity = lightSource.intensity;

    return this;
  }

  // TODO:
  // toJSON( meta ) {

  // 	const data = super.toJSON( meta );

  // 	data.object.color = this.color.getHex();
  // 	data.object.intensity = this.intensity;

  // 	if ( this.groundColor != undefined ) data.object.groundColor = this.groundColor.getHex();

  // 	if ( this.distance != undefined ) data.object.distance = this.distance;
  // 	if ( this.angle != undefined ) data.object.angle = this.angle;
  // 	if ( this.decay != undefined ) data.object.decay = this.decay;
  // 	if ( this.penumbra != undefined ) data.object.penumbra = this.penumbra;

  // 	if ( this.shadow != undefined ) data.object.shadow = this.shadow.toJSON();

  // 	return data;

  // }
}
