import { TransformNode } from "../core/TransformNode";
import { Color } from "rewild-common";
import { DirectionalLight } from "./DirectionalLight";

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

export function setLightIntensity(light: Light, intensity: f32): Light {
  light.intensity = intensity;
  return light;
}

export function setLightColor(light: Light, r: f32, g: f32, b: f32): Light {
  light.color.setRGB(r, g, b);
  return light;
}

export function setLightTarget(light: Light, tx: f32, ty: f32, tz: f32): Light {
  if (light instanceof DirectionalLight) {
    (light as DirectionalLight).target.position.set(tx, ty, tz);
  }
  return light;
}
