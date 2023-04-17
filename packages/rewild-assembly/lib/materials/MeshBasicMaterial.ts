import { Material } from "./Material";
import { Combine, Color } from "rewild-common";
import { Texture } from "../textures/Texture";

/**
 * parameters = {
 *  color: <hex>,
 *  opacity: <float>,
 *  map: new THREE.Texture( <Image> ),
 *
 *  lightMap: new THREE.Texture( <Image> ),
 *  lightMapIntensity: <float>
 *
 *  aoMap: new THREE.Texture( <Image> ),
 *  aoMapIntensity: <float>
 *
 *  specularMap: new THREE.Texture( <Image> ),
 *
 *  alphaMap: new THREE.Texture( <Image> ),
 *
 *  envMap: new THREE.CubeTexture( [posx, negx, posy, negy, posz, negz] ),
 *  combine: THREE.Multiply,
 *  reflectivity: <float>,
 *  refractionRatio: <float>,
 *
 *  depthTest: <bool>,
 *  depthWrite: <bool>,
 *
 *  wireframe: <boolean>,
 *  wireframeLinewidth: <float>,
 * }
 */

export class MeshBasicMaterial extends Material {
  color: Color;
  wireframeLinewidth: f32;
  wireframeLinecap: string;
  wireframeLinejoin: string;

  map: Texture | null;

  lightMap: Texture | null;
  lightMapIntensity: f32;

  aoMap: Texture | null;
  aoMapIntensity: f32;

  specularMap: Texture | null;

  alphaMap: Texture | null;

  envMap: Texture | null;
  combine: Combine;
  reflectivity: f32;
  refractionRatio: f32;

  constructor() {
    super();

    this.type = "MeshBasicMaterial";

    this.color = new Color(1, 1, 1); // emissive

    this.map = null;

    this.lightMap = null;
    this.lightMapIntensity = 1.0;

    this.aoMap = null;
    this.aoMapIntensity = 1.0;

    this.specularMap = null;

    this.alphaMap = null;

    this.envMap = null;
    this.combine = Combine.MultiplyOperation;
    this.reflectivity = 1;
    this.refractionRatio = 0.98;

    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.wireframeLinecap = "round";
    this.wireframeLinejoin = "round";

    // TODO: ?
    // this.setValues(parameters);
  }

  copy(source: MeshBasicMaterial): MeshBasicMaterial {
    super.copy(source);

    this.color.copy(source.color);

    this.map = source.map;

    this.lightMap = source.lightMap;
    this.lightMapIntensity = source.lightMapIntensity;

    this.aoMap = source.aoMap;
    this.aoMapIntensity = source.aoMapIntensity;

    this.specularMap = source.specularMap;

    this.alphaMap = source.alphaMap;

    this.envMap = source.envMap;
    this.combine = source.combine;
    this.reflectivity = source.reflectivity;
    this.refractionRatio = source.refractionRatio;

    this.wireframe = source.wireframe;
    this.wireframeLinewidth = source.wireframeLinewidth;
    this.wireframeLinecap = source.wireframeLinecap;
    this.wireframeLinejoin = source.wireframeLinejoin;

    return this;
  }
}
