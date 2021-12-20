import { EventDispatcher } from "../core/EventDispatcher";
import {
  Blending,
  Side,
  BlendingSrcFactor,
  BlendingDstFactor,
  BlendingEquation,
  DepthModes,
  StencilFunc,
  StencilOp,
  ShadowSide,
  Precision,
} from "../../common/GLEnums";
import * as MathUtils from "../math/MathUtils";
import { Plane } from "../math/Plane";
import { Event } from "../core/Event";
import { Vector2 } from "../math/Vector2";

let materialId: u32 = 0;

export class Material extends EventDispatcher {
  isMaterial: boolean = true;

  readonly id: u32 = materialId++;
  uuid: string;
  name: string;
  type: string;
  fog: boolean;
  blending: Blending;
  wireframe: boolean;
  side: Side;
  vertexColors: boolean;
  opacity: f32;
  transparent: boolean;
  blendSrc: BlendingSrcFactor;
  blendDst: BlendingDstFactor;
  blendEquation: BlendingEquation;
  blendSrcAlpha: f32; // TODO: This should be null - ensure we check this everywhere its used (NaN)
  blendDstAlpha: f32; // TODO: This should be null - ensure we check this everywhere its used (NaN)
  blendEquationAlpha: f32; // TODO: This should be null - ensure we check this everywhere its used (NaN)
  depthFunc: DepthModes;
  depthTest: boolean;
  depthWrite: boolean;
  stencilWriteMask: i32;
  stencilFunc: StencilFunc;
  stencilRef: i32;
  stencilFuncMask: i32;
  stencilFail: StencilOp;
  stencilZFail: StencilOp;
  stencilZPass: StencilOp;
  stencilWrite: boolean;
  clippingPlanes: Plane[] | null;
  clipIntersection: boolean;
  clipShadows: boolean;
  shadowSide: ShadowSide;
  colorWrite: boolean;
  precision: Precision; // TODO: This should be null
  polygonOffset: boolean;
  polygonOffsetVector: Vector2;
  dithering: boolean;
  alphaTest: f32;
  alphaToCoverage: boolean;
  transmission: f32;
  premultipliedAlpha: boolean;
  visible: boolean;
  toneMapped: boolean;
  flatShading: boolean;
  defaultAttributeValues: Map<string, Float32Array> | null;
  // TODO:
  // userData: any;
  version: u32;
  disposeEvent: Event = new Event("dispose");

  constructor() {
    super();

    this.uuid = MathUtils.generateUUID();
    this.type = "Material";
    this.name = "";
    this.type = "Material";

    this.fog = true;

    this.blending = Blending.NormalBlending;
    this.side = Side.FrontSide;
    this.vertexColors = false;

    this.opacity = 1;
    this.transmission = 0;
    this.transparent = false;

    this.blendSrc = BlendingSrcFactor.SrcAlphaFactor;
    this.blendDst = BlendingDstFactor.OneMinusSrcAlphaFactor;
    this.blendEquation = BlendingEquation.AddEquation;
    this.blendSrcAlpha = NaN;
    this.blendDstAlpha = NaN;
    this.blendEquationAlpha = NaN;

    this.depthFunc = DepthModes.LessEqualDepth;
    this.depthTest = true;
    this.depthWrite = true;

    this.stencilWriteMask = 0xff;
    this.stencilFunc = StencilFunc.AlwaysStencilFunc;
    this.stencilRef = 0;
    this.stencilFuncMask = 0xff;
    this.stencilFail = StencilOp.KeepStencilOp;
    this.stencilZFail = StencilOp.KeepStencilOp;
    this.stencilZPass = StencilOp.KeepStencilOp;
    this.stencilWrite = false;

    this.clippingPlanes = null;
    this.clipIntersection = false;
    this.clipShadows = false;

    this.shadowSide = ShadowSide.AutoSide;

    this.colorWrite = true;

    this.precision = Precision.Default; // override the renderer's default precision for this material

    this.polygonOffset = false;
    this.polygonOffsetVector = new Vector2();

    this.dithering = false;

    this.alphaTest = 0;
    this.alphaToCoverage = false;
    this.premultipliedAlpha = false;

    this.visible = true;

    this.toneMapped = true;
    this.disposeEvent.target = this;

    this.wireframe = false;
    this.defaultAttributeValues = null;

    // TODO:
    // this.userData = {};

    this.version = 0;
  }

  set polygonOffsetFactor(value: f32) {
    this.polygonOffsetVector.x = value;
  }
  get polygonOffsetFactor(): f32 {
    return this.polygonOffsetVector.x;
  }

  set polygonOffsetUnits(value: f32) {
    this.polygonOffsetVector.y = value;
  }
  get polygonOffsetUnits(): f32 {
    return this.polygonOffsetVector.y;
  }

  onBuild(/* shaderobject, renderer */): void {}

  onBeforeCompile(/* shaderobject, renderer */): void {}

  customProgramCacheKey(): string {
    return this.onBeforeCompile.toString();
  }

  // TODO:
  //   setValues(values) {
  //     if (values === undefined) return;

  //     for (const key in values) {
  //       const newValue = values[key];

  //       if (newValue === undefined) {
  //         console.warn("THREE.Material: '" + key + "' parameter is undefined.");
  //         continue;
  //       }

  //       // for backward compatability if shading is set in the constructor
  //       if (key === "shading") {
  //         console.warn(
  //           "THREE." +
  //             this.type +
  //             ": .shading has been removed. Use the boolean .flatShading instead."
  //         );
  //         this.flatShading = newValue === FlatShading ? true : false;
  //         continue;
  //       }

  //       const currentValue = this[key];

  //       if (currentValue === undefined) {
  //         console.warn(
  //           "THREE." +
  //             this.type +
  //             ": '" +
  //             key +
  //             "' is not a property of this material."
  //         );
  //         continue;
  //       }

  //       if (currentValue && currentValue.isColor) {
  //         currentValue.set(newValue);
  //       } else if (
  //         currentValue &&
  //         currentValue.isVector3 &&
  //         newValue &&
  //         newValue.isVector3
  //       ) {
  //         currentValue.copy(newValue);
  //       } else {
  //         this[key] = newValue;
  //       }
  //     }
  //   }

  // TODO:
  // toJSON( meta ) {

  // 	const isRoot = ( meta === undefined || typeof meta === 'string' );

  // 	if ( isRoot ) {

  // 		meta = {
  // 			textures: {},
  // 			images: {}
  // 		};

  // 	}

  // 	const data = {
  // 		metadata: {
  // 			version: 4.5,
  // 			type: 'Material',
  // 			generator: 'Material.toJSON'
  // 		}
  // 	};

  // 	// standard Material serialization
  // 	data.uuid = this.uuid;
  // 	data.type = this.type;

  // 	if ( this.name !== '' ) data.name = this.name;

  // 	if ( this.color && this.color.isColor ) data.color = this.color.getHex();

  // 	if ( this.roughness !== undefined ) data.roughness = this.roughness;
  // 	if ( this.metalness !== undefined ) data.metalness = this.metalness;

  // 	if ( this.sheen && this.sheen.isColor ) data.sheen = this.sheen.getHex();
  // 	if ( this.emissive && this.emissive.isColor ) data.emissive = this.emissive.getHex();
  // 	if ( this.emissiveIntensity && this.emissiveIntensity !== 1 ) data.emissiveIntensity = this.emissiveIntensity;

  // 	if ( this.specular && this.specular.isColor ) data.specular = this.specular.getHex();
  // 	if ( this.shininess !== undefined ) data.shininess = this.shininess;
  // 	if ( this.clearcoat !== undefined ) data.clearcoat = this.clearcoat;
  // 	if ( this.clearcoatRoughness !== undefined ) data.clearcoatRoughness = this.clearcoatRoughness;

  // 	if ( this.clearcoatMap && this.clearcoatMap.isTexture ) {

  // 		data.clearcoatMap = this.clearcoatMap.toJSON( meta ).uuid;

  // 	}

  // 	if ( this.clearcoatRoughnessMap && this.clearcoatRoughnessMap.isTexture ) {

  // 		data.clearcoatRoughnessMap = this.clearcoatRoughnessMap.toJSON( meta ).uuid;

  // 	}

  // 	if ( this.clearcoatNormalMap && this.clearcoatNormalMap.isTexture ) {

  // 		data.clearcoatNormalMap = this.clearcoatNormalMap.toJSON( meta ).uuid;
  // 		data.clearcoatNormalScale = this.clearcoatNormalScale.toArray();

  // 	}

  // 	if ( this.map && this.map.isTexture ) data.map = this.map.toJSON( meta ).uuid;
  // 	if ( this.matcap && this.matcap.isTexture ) data.matcap = this.matcap.toJSON( meta ).uuid;
  // 	if ( this.alphaMap && this.alphaMap.isTexture ) data.alphaMap = this.alphaMap.toJSON( meta ).uuid;

  // 	if ( this.lightMap && this.lightMap.isTexture ) {

  // 		data.lightMap = this.lightMap.toJSON( meta ).uuid;
  // 		data.lightMapIntensity = this.lightMapIntensity;

  // 	}

  // 	if ( this.aoMap && this.aoMap.isTexture ) {

  // 		data.aoMap = this.aoMap.toJSON( meta ).uuid;
  // 		data.aoMapIntensity = this.aoMapIntensity;

  // 	}

  // 	if ( this.bumpMap && this.bumpMap.isTexture ) {

  // 		data.bumpMap = this.bumpMap.toJSON( meta ).uuid;
  // 		data.bumpScale = this.bumpScale;

  // 	}

  // 	if ( this.normalMap && this.normalMap.isTexture ) {

  // 		data.normalMap = this.normalMap.toJSON( meta ).uuid;
  // 		data.normalMapType = this.normalMapType;
  // 		data.normalScale = this.normalScale.toArray();

  // 	}

  // 	if ( this.displacementMap && this.displacementMap.isTexture ) {

  // 		data.displacementMap = this.displacementMap.toJSON( meta ).uuid;
  // 		data.displacementScale = this.displacementScale;
  // 		data.displacementBias = this.displacementBias;

  // 	}

  // 	if ( this.roughnessMap && this.roughnessMap.isTexture ) data.roughnessMap = this.roughnessMap.toJSON( meta ).uuid;
  // 	if ( this.metalnessMap && this.metalnessMap.isTexture ) data.metalnessMap = this.metalnessMap.toJSON( meta ).uuid;

  // 	if ( this.emissiveMap && this.emissiveMap.isTexture ) data.emissiveMap = this.emissiveMap.toJSON( meta ).uuid;
  // 	if ( this.specularMap && this.specularMap.isTexture ) data.specularMap = this.specularMap.toJSON( meta ).uuid;

  // 	if ( this.envMap && this.envMap.isTexture ) {

  // 		data.envMap = this.envMap.toJSON( meta ).uuid;

  // 		if ( this.combine !== undefined ) data.combine = this.combine;

  // 	}

  // 	if ( this.envMapIntensity !== undefined ) data.envMapIntensity = this.envMapIntensity;
  // 	if ( this.reflectivity !== undefined ) data.reflectivity = this.reflectivity;
  // 	if ( this.refractionRatio !== undefined ) data.refractionRatio = this.refractionRatio;

  // 	if ( this.gradientMap && this.gradientMap.isTexture ) {

  // 		data.gradientMap = this.gradientMap.toJSON( meta ).uuid;

  // 	}

  // 	if ( this.transmission !== undefined ) data.transmission = this.transmission;
  // 	if ( this.transmissionMap && this.transmissionMap.isTexture ) data.transmissionMap = this.transmissionMap.toJSON( meta ).uuid;
  // 	if ( this.thickness !== undefined ) data.thickness = this.thickness;
  // 	if ( this.thicknessMap && this.thicknessMap.isTexture ) data.thicknessMap = this.thicknessMap.toJSON( meta ).uuid;
  // 	if ( this.attenuationDistance !== undefined ) data.attenuationDistance = this.attenuationDistance;
  // 	if ( this.attenuationColor !== undefined ) data.attenuationColor = this.attenuationColor.getHex();

  // 	if ( this.size !== undefined ) data.size = this.size;
  // 	if ( this.shadowSide !== null ) data.shadowSide = this.shadowSide;
  // 	if ( this.sizeAttenuation !== undefined ) data.sizeAttenuation = this.sizeAttenuation;

  // 	if ( this.blending !== NormalBlending ) data.blending = this.blending;
  // 	if ( this.side !== FrontSide ) data.side = this.side;
  // 	if ( this.vertexColors ) data.vertexColors = true;

  // 	if ( this.opacity < 1 ) data.opacity = this.opacity;
  // 	if ( this.transparent === true ) data.transparent = this.transparent;

  // 	data.depthFunc = this.depthFunc;
  // 	data.depthTest = this.depthTest;
  // 	data.depthWrite = this.depthWrite;
  // 	data.colorWrite = this.colorWrite;

  // 	data.stencilWrite = this.stencilWrite;
  // 	data.stencilWriteMask = this.stencilWriteMask;
  // 	data.stencilFunc = this.stencilFunc;
  // 	data.stencilRef = this.stencilRef;
  // 	data.stencilFuncMask = this.stencilFuncMask;
  // 	data.stencilFail = this.stencilFail;
  // 	data.stencilZFail = this.stencilZFail;
  // 	data.stencilZPass = this.stencilZPass;

  // 	// rotation (SpriteMaterial)
  // 	if ( this.rotation && this.rotation !== 0 ) data.rotation = this.rotation;

  // 	if ( this.polygonOffset === true ) data.polygonOffset = true;
  // 	if ( this.polygonOffsetFactor !== 0 ) data.polygonOffsetFactor = this.polygonOffsetFactor;
  // 	if ( this.polygonOffsetUnits !== 0 ) data.polygonOffsetUnits = this.polygonOffsetUnits;

  // 	if ( this.linewidth && this.linewidth !== 1 ) data.linewidth = this.linewidth;
  // 	if ( this.dashSize !== undefined ) data.dashSize = this.dashSize;
  // 	if ( this.gapSize !== undefined ) data.gapSize = this.gapSize;
  // 	if ( this.scale !== undefined ) data.scale = this.scale;

  // 	if ( this.dithering === true ) data.dithering = true;

  // 	if ( this.alphaTest > 0 ) data.alphaTest = this.alphaTest;
  // 	if ( this.alphaToCoverage === true ) data.alphaToCoverage = this.alphaToCoverage;
  // 	if ( this.premultipliedAlpha === true ) data.premultipliedAlpha = this.premultipliedAlpha;

  // 	if ( this.wireframe === true ) data.wireframe = this.wireframe;
  // 	if ( this.wireframeLinewidth > 1 ) data.wireframeLinewidth = this.wireframeLinewidth;
  // 	if ( this.wireframeLinecap !== 'round' ) data.wireframeLinecap = this.wireframeLinecap;
  // 	if ( this.wireframeLinejoin !== 'round' ) data.wireframeLinejoin = this.wireframeLinejoin;

  // 	if ( this.morphTargets === true ) data.morphTargets = true;
  // 	if ( this.morphNormals === true ) data.morphNormals = true;

  // 	if ( this.flatShading === true ) data.flatShading = this.flatShading;

  // 	if ( this.visible === false ) data.visible = false;

  // 	if ( this.toneMapped === false ) data.toneMapped = false;

  // 	if ( JSON.stringify( this.userData ) !== '{}' ) data.userData = this.userData;

  // 	// TODO: Copied from Object3D.toJSON

  // 	function extractFromCache( cache ) {

  // 		const values = [];

  // 		for ( const key in cache ) {

  // 			const data = cache[ key ];
  // 			delete data.metadata;
  // 			values.push( data );

  // 		}

  // 		return values;

  // 	}

  // 	if ( isRoot ) {

  // 		const textures = extractFromCache( meta.textures );
  // 		const images = extractFromCache( meta.images );

  // 		if ( textures.length > 0 ) data.textures = textures;
  // 		if ( images.length > 0 ) data.images = images;

  // 	}

  // 	return data;

  // }

  clone(): Material {
    return new Material().copy(this);
  }

  copy(source: Material): Material {
    this.name = source.name;

    this.fog = source.fog;

    this.blending = source.blending;
    this.side = source.side;
    this.vertexColors = source.vertexColors;

    this.opacity = source.opacity;
    this.transparent = source.transparent;

    this.blendSrc = source.blendSrc;
    this.blendDst = source.blendDst;
    this.blendEquation = source.blendEquation;
    this.blendSrcAlpha = source.blendSrcAlpha;
    this.blendDstAlpha = source.blendDstAlpha;
    this.blendEquationAlpha = source.blendEquationAlpha;

    this.depthFunc = source.depthFunc;
    this.depthTest = source.depthTest;
    this.depthWrite = source.depthWrite;

    this.stencilWriteMask = source.stencilWriteMask;
    this.stencilFunc = source.stencilFunc;
    this.stencilRef = source.stencilRef;
    this.stencilFuncMask = source.stencilFuncMask;
    this.stencilFail = source.stencilFail;
    this.stencilZFail = source.stencilZFail;
    this.stencilZPass = source.stencilZPass;
    this.stencilWrite = source.stencilWrite;

    const srcPlanes = source.clippingPlanes;
    let dstPlanes: Plane[] | null = null;

    if (srcPlanes !== null) {
      const n = srcPlanes.length;
      dstPlanes = new Array(n);

      for (let i = 0; i !== n; ++i) {
        dstPlanes[i] = srcPlanes[i].clone();
      }
    }

    this.clippingPlanes = dstPlanes;
    this.clipIntersection = source.clipIntersection;
    this.clipShadows = source.clipShadows;

    this.shadowSide = source.shadowSide;

    this.colorWrite = source.colorWrite;

    this.precision = source.precision;

    this.polygonOffset = source.polygonOffset;
    this.polygonOffsetFactor = source.polygonOffsetFactor;
    this.polygonOffsetUnits = source.polygonOffsetUnits;

    this.dithering = source.dithering;

    this.alphaTest = source.alphaTest;
    this.alphaToCoverage = source.alphaToCoverage;
    this.premultipliedAlpha = source.premultipliedAlpha;

    this.visible = source.visible;

    this.toneMapped = source.toneMapped;

    const defaultAttributeValues = this.defaultAttributeValues;
    if (defaultAttributeValues) {
      source.defaultAttributeValues = new Map();
      const defaultAttKeys = defaultAttributeValues.keys();

      const sourceDefaultAttributeValues = source.defaultAttributeValues;

      for (let i: i32 = 0, l: i32 = defaultAttKeys.length; i < l; i++)
        sourceDefaultAttributeValues!.set(defaultAttKeys[i], defaultAttributeValues.get(defaultAttKeys[i]));
    }

    // TODO:
    // this.userData = JSON.parse( JSON.stringify( source.userData ) );

    return this;
  }

  dispose(): void {
    this.dispatchEvent(this.disposeEvent);
  }

  set needsUpdate(value: boolean) {
    if (value === true) this.version++;
  }
}
