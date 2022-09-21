import { Material } from "./Material";
import { Color } from "../../common/math/Color";
import { Texture } from "../textures/Texture";

/**
 * parameters = {
 *  color: <hex>,
 *  map: new THREE.Texture( <Image> ),
 *  alphaMap: new THREE.Texture( <Image> ),
 *  rotation: <float>,
 *  sizeAttenuation: <bool>
 * }
 */

export class SpriteMaterial extends Material {
  color: Color;
  map: Texture | null;
  alphaMap: Texture | null;
  rotation: f32;
  sizeAttenuation: boolean;

  constructor() {
    super();

    this.type = "SpriteMaterial";
    this.color = new Color(1, 1, 1);
    this.map = null;
    this.alphaMap = null;
    this.rotation = 0;
    this.sizeAttenuation = true;
    this.transparent = true;
  }

  copy(source: SpriteMaterial): SpriteMaterial {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.alphaMap = source.alphaMap;
    this.rotation = source.rotation;
    this.sizeAttenuation = source.sizeAttenuation;
    return this;
  }
}
