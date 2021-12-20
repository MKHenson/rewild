import { PipelineResourceType } from "../../../../common/PipelineResourceType";
import { GameManager } from "../../gameManager";
import { Texture } from "../../GPUTexture";
import { defaultPipelineDescriptor } from "../defaultPipelineDescriptor";
import { Pipeline } from "../Pipeline";
import { LightingResource } from "../resources/LightingResource";
import { MaterialResource } from "../resources/MaterialResource";
import { TextureResource } from "../resources/TextureResource";
import { mathConstants, mathFunctions } from "../shader-lib/math-functions";
import { shader, shaderBuilder } from "../shader-lib/utils";

// prettier-ignore
const vertexShader = shader<DebugDefines>`
struct Uniforms {
  projMatrix: mat4x4<f32>;
  modelViewMatrix: mat4x4<f32>;
  normalMatrix: mat3x3<f32>;
};
[[group(${e => e.groupIndex(PipelineResourceType.Transform)}), binding(0)]] var<uniform> uniforms: Uniforms;

struct Output {
    [[builtin(position)]] Position : vec4<f32>;
    [[location(0)]] vFragUV : vec2<f32>;
    [[location(1)]] vNormal : vec3<f32>;
    [[location(2)]] vViewPosition : vec3<f32>;
};

[[stage(vertex)]]
fn main([[location(0)]] pos: vec4<f32>, [[location(1)]] norm: vec3<f32>, [[location(2)]] uv: vec2<f32>) -> Output {
    var output: Output;
    var mvPosition = vec4<f32>( pos.xyz, 1.0 );

    mvPosition = uniforms.modelViewMatrix * mvPosition;

    output.vViewPosition = - mvPosition.xyz;
    output.Position = uniforms.projMatrix * mvPosition;
    output.vFragUV = uv;

    var transformedNormal = uniforms.normalMatrix * norm.xyz;
    output.vNormal = normalize( transformedNormal );

    return output;
}
`;

// prettier-ignore
const fragmentShader = shader<DebugDefines>`


struct MaterialData {
  diffuse: vec4<f32>;
  emissive: vec4<f32>;
  opacity: f32;
  metalness: f32;
  roughness: f32;
};

struct SceneLightingUniform {
  ambientLightColor: vec4<f32>;
};

struct LightingConfigUniform {
  numDirectionalLights: u32;
};

struct DirectionLightUniform {
  direction : vec4<f32>;
  color : vec4<f32>;
};

struct DirectionLightsUniform {
  directionalLights: array<DirectionLightUniform>;
};

// INTERNAL STRUCTS
struct IncidentLight {
  color: vec3<f32>;
  direction: vec3<f32>;
  visible: bool;
};

struct ReflectedLight {
  directDiffuse: vec3<f32>;
  directSpecular: vec3<f32>;
  indirectDiffuse: vec3<f32>;
  indirectSpecular: vec3<f32>;
};

struct PhysicalMaterial {
  diffuseColor: vec3<f32>;
  specularColor: vec3<f32>;
  roughness: f32;
  specularF90: f32;
};

struct GeometricContext {
  position: vec3<f32>;
  normal: vec3<f32>;
  viewDir: vec3<f32>;
};

struct DirectionalLight {
  direction: vec3<f32>;
  color: vec3<f32>;
};


[[group(${e => e.groupIndex(PipelineResourceType.Material)}), binding(0)]] var<uniform> materialData: MaterialData;
${e => e.defines.diffuse && `
[[group(${e.groupIndex(PipelineResourceType.Diffuse)}), binding(0)]] var mySampler: sampler;
[[group(${e.groupIndex(PipelineResourceType.Diffuse)}), binding(1)]] var myTexture: texture_2d<f32>;
`}
[[group(${e => e.groupIndex(PipelineResourceType.Lighting)}), binding(0)]] var<uniform> lightingConfigUniform: LightingConfigUniform;
[[group(${e => e.groupIndex(PipelineResourceType.Lighting)}), binding(1)]] var<storage, read> directionLightsUniform: DirectionLightsUniform;
[[group(${e => e.groupIndex(PipelineResourceType.Lighting)}), binding(2)]] var<uniform> sceneLightingUniform: SceneLightingUniform;

${mathConstants}
${mathFunctions}

fn packNormalToRGB( normal: vec3<f32> ) -> vec3<f32> {
  return normalize( normal ) * 0.5 + 0.5;
}

fn getDirectionalLightInfo( directionalLight: DirectionalLight, geometry: GeometricContext, light: ptr<function, IncidentLight> ) {
  (*light).color = directionalLight.color;
  (*light).direction = directionalLight.direction;
  (*light).visible = true;
}

fn BRDF_Lambert( diffuseColor: vec3<f32> ) -> vec3<f32> {
  return RECIPROCAL_PI * diffuseColor;
}

fn F_Schlick( f0: vec3<f32>, f90: f32, dotVH: f32  ) -> vec3<f32> {
  var fresnel: f32 = exp2( ( -5.55473 * dotVH - 6.98316 ) * dotVH );
  return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}

fn V_GGX_SmithCorrelated( alpha: f32, dotNL: f32, dotNV: f32 ) -> f32 {
  var a2: f32 = pow2( alpha );
  var gv: f32 = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
  var gl: f32 = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
  return 0.5 / max( gv + gl, EPSILON );
}

fn D_GGX( alpha: f32, dotNH: f32 ) -> f32 {
  var a2: f32 = pow2( alpha );
  var denom: f32 = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
  return RECIPROCAL_PI * a2 / pow2( denom );
}

fn BRDF_GGX( lightDir: vec3<f32>, viewDir: vec3<f32>, normal: vec3<f32>, f0: vec3<f32>, f90: f32, roughness: f32 ) -> vec3<f32> {
  var alpha: f32 = pow2( roughness );
  var halfDir: vec3<f32> = normalize( lightDir + viewDir );
  var dotNL: f32 = saturate( dot( normal, lightDir ) );
  var dotNV: f32 = saturate( dot( normal, viewDir ) );
  var dotNH: f32 = saturate( dot( normal, halfDir ) );
  var dotVH: f32 = saturate( dot( viewDir, halfDir ) );
  var F: vec3<f32> = F_Schlick( f0, f90, dotVH );
  var V: f32 = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
  var D: f32 = D_GGX( alpha, dotNH );
  return F * ( V * D );
}

fn DFGApprox( normal: vec3<f32>, viewDir: vec3<f32>, roughness: f32 ) -> vec2<f32> {
  var dotNV = saturate( dot( normal, viewDir ) );
  var c0 = vec4<f32>( -1.0, - 0.0275, - 0.572, 0.022 );
  var c1 = vec4<f32>( 1.0, 0.0425, 1.04, - 0.04 );
  var r = roughness * c0 + c1;
  var a004: f32 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
  var fab = vec2<f32>( - 1.04, 1.04 ) * a004 + r.zw;
  return fab;
}

fn computeMultiscattering( normal: vec3<f32>, viewDir: vec3<f32>, specularColor: vec3<f32>, specularF90: f32, roughness: f32, singleScatter: ptr<function, vec3<f32>>, multiScatter: ptr<function, vec3<f32>> ) {
  var fab = DFGApprox( normal, viewDir, roughness );
  var FssEss = specularColor * fab.x + specularF90 * fab.y;
  var Ess = fab.x + fab.y;
  var Ems = 1.0 - Ess;
  var Favg = specularColor + ( 1.0 - specularColor ) * 0.047619;
  var Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
  (*singleScatter) = (*singleScatter) + FssEss;
  (*multiScatter) = (*multiScatter) + (Fms * Ems);
}

fn RE_Direct_Physical( directLight: IncidentLight, geometry: GeometricContext, material: PhysicalMaterial, reflectedLight: ptr<function, ReflectedLight> ) {
  var dotNL: f32 = saturate( dot( geometry.normal, directLight.direction ) );
  var irradiance: vec3<f32> = dotNL * directLight.color;
  // #ifdef USE_CLEARCOAT
  //     var dotNLcc: f32 = saturate( dot( geometry.clearcoatNormal, directLight.direction ) );
  //     var ccIrradiance: vec3<f32> = dotNLcc * directLight.color;
  //     clearcoatSpecular = clearcoatSpecular + ccIrradiance * BRDF_GGX( directLight.direction, geometry.viewDir, geometry.clearcoatNormal, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
  // #endif
  // #ifdef USE_SHEEN
  //     (*reflectedLight).directSpecular = (*reflectedLight).directSpecular + irradiance * BRDF_Sheen( directLight.direction, geometry.viewDir, geometry.normal, material.sheenColor, material.sheenRoughness );
  // #endif
  (*reflectedLight).directSpecular = (*reflectedLight).directSpecular + irradiance * BRDF_GGX( directLight.direction, geometry.viewDir, geometry.normal, material.specularColor, material.specularF90, material.roughness );
  (*reflectedLight).directDiffuse = (*reflectedLight).directDiffuse + irradiance * BRDF_Lambert( material.diffuseColor );
}

fn RE_IndirectDiffuse_Physical( irradiance: vec3<f32>, geometry: GeometricContext, material: PhysicalMaterial, reflectedLight: ptr<function, ReflectedLight> ) {
  (*reflectedLight).indirectDiffuse = (*reflectedLight).indirectDiffuse + (irradiance * BRDF_Lambert( material.diffuseColor ));
}

fn RE_IndirectSpecular_Physical( radiance: vec3<f32>, irradiance: vec3<f32>, clearcoatRadiance: vec3<f32>, geometry: GeometricContext, material: PhysicalMaterial, reflectedLight: ptr<function, ReflectedLight> ) {
  // #ifdef USE_CLEARCOAT
  //     clearcoatSpecular = clearcoatSpecular + (clearcoatRadiance * EnvironmentBRDF( geometry.clearcoatNormal, geometry.viewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness ));
  // #endif
  var singleScattering = vec3<f32>( 0.0 );
  var multiScattering = vec3<f32>( 0.0 );
  var cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
  computeMultiscattering( geometry.normal, geometry.viewDir, material.specularColor, material.specularF90, material.roughness, &singleScattering, &multiScattering );
  var diffuse = material.diffuseColor * ( 1.0 - ( singleScattering + multiScattering ) );
  (*reflectedLight).indirectSpecular = (*reflectedLight).indirectSpecular + (radiance * singleScattering);
  (*reflectedLight).indirectSpecular = (*reflectedLight).indirectSpecular + (multiScattering * cosineWeightedIrradiance);
  (*reflectedLight).indirectDiffuse = (*reflectedLight).indirectDiffuse + (diffuse * cosineWeightedIrradiance);
}

fn changeDiffuseToRed( colorPtr: ptr<function, vec4<f32>> ) {
  (*colorPtr).g = 0.0;
  (*colorPtr).b = 0.0;
}

[[stage(fragment)]]
fn main(
  [[location(0)]] vFragUV: vec2<f32>,
  [[location(1)]] vNormal : vec3<f32>,
  [[location(2)]] vViewPosition : vec3<f32>
) -> [[location(0)]] vec4<f32> {

  var normal = normalize( vNormal );
  var geometryNormal = normal;

  var totalEmissiveRadiance: vec3<f32> = materialData.emissive.xyz;
  // vec3<f32> outgoingLight = totalEmissiveRadiance;

  var diffuseColor = vec4<f32>( materialData.diffuse.xyz, materialData.opacity );
  var reflectedLight: ReflectedLight = ReflectedLight( vec3<f32>( 0.0 ), vec3<f32>( 0.0 ), vec3<f32>( 0.0 ), vec3<f32>( 0.0 ) );

  ${e => e.defines.diffuse &&
  `var texelColor = textureSample(myTexture, mySampler, vFragUV);
  diffuseColor = diffuseColor * texelColor;`}

  // TODO: Alpha test - discard early

  // Metalness
  var metalnessFactor: f32 = materialData.metalness;
  // TODO:
  ${e => e.defines.metalnessMap &&
    `vec4 texelMetalness = = textureSample(metalnessMap, mySampler, vFragUV);
    metalnessFactor *= texelMetalness.b;`
  }

  // Roughness
  var roughnessFactor: f32 = materialData.roughness;
  // TODO:
  ${e => e.defines.roughnessMap &&
    `vec4 texelRoughness = = textureSample(roughnessMap, mySampler, vFragUV);
    roughnessFactor *= texelRoughness.b;`
  }

  var isOrthographic = false;
  var geometry: GeometricContext;
  geometry.position = -vViewPosition;
  geometry.normal = normal;
  geometry.viewDir =  select(normalize( vViewPosition ), vec3<f32>( 0.0, 0.0, 1.0 ), isOrthographic ); // Same as ternary operator (select( false, true, condition ))

  var directLight: IncidentLight;


  var material: PhysicalMaterial;

  material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );

  var dxy: vec3<f32> = max( abs( dpdx( geometryNormal ) ), abs( dpdy( geometryNormal ) ) );
  var geometryRoughness: f32 = max( max( dxy.x, dxy.y ), dxy.z );

  material.roughness = max( roughnessFactor, 0.0525 );
  material.roughness = material.roughness + geometryRoughness;
  material.roughness = min( material.roughness, 1.0 );

  // #ifdef IOR
  //     #ifdef SPECULAR
  //         float specularIntensityFactor = specularIntensity;
  //         vec3 specularColorFactor = specularColor;
  //         #ifdef USE_SPECULARINTENSITYMAP
  //             specularIntensityFactor *= texture2D( specularIntensityMap, vUv ).a;
  //         #endif
  //         #ifdef USE_SPECULARCOLORMAP
  //             specularColorFactor *= specularColorMapTexelToLinear( texture2D( specularColorMap, vUv ) ).rgb;
  //         #endif
  //         material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
  //     #else
  //         float specularIntensityFactor = 1.0;
  //         vec3 specularColorFactor = vec3( 1.0 );
  //         material.specularF90 = 1.0;
  //     #endif
  //     material.specularColor = mix( min( pow2( ( ior - 1.0 ) / ( ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
  // #else
      material.specularColor = mix( vec3<f32>( 0.04 ), diffuseColor.rgb, metalnessFactor );
      material.specularF90 = 1.0;
  // #endif


  // Lighting
  // ========
  var numDirectionalLights = lightingConfigUniform.numDirectionalLights;

  for (var i : u32 = 0u; i < numDirectionalLights; i = i + 1u) {
    var directionalLight: DirectionalLight;
    directionalLight.direction = directionLightsUniform.directionalLights[i].direction.xyz;
    directionalLight.color = directionLightsUniform.directionalLights[i].color.xyz;

    getDirectionalLightInfo( directionalLight, geometry, &directLight );
    RE_Direct_Physical( directLight, geometry, material, &reflectedLight );
  }

  // #if defined( RE_IndirectDiffuse )
  var iblIrradiance = vec3<f32>( 0.0 );
  var irradiance = sceneLightingUniform.ambientLightColor.xyz;

  // TODO
  // irradiance = irradiance + getLightProbeIrradiance( lightProbe, geometry.normal );

  // #if defined( RE_IndirectSpecular )
  var radiance = vec3<f32>( 0.0 );
  var clearcoatRadiance = vec3<f32>( 0.0 );

  // #if defined( RE_IndirectDiffuse )
    // #ifdef USE_LIGHTMAP
    //   vec4 lightMapTexel = texture2D( lightMap, vUv2 );
    //   vec3 lightMapIrradiance = lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;
    //   #ifndef PHYSICALLY_CORRECT_LIGHTS
    //       lightMapIrradiance *= PI;
    //   #endif
    //   irradiance = irradiance + lightMapIrradiance;
    // #endif
    // #if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
    //   iblIrradiance = iblIrradiance + getIBLIrradiance( geometry.normal );
    // #endif
  // #endif

  // #if defined( RE_IndirectDiffuse )
    RE_IndirectDiffuse_Physical( irradiance, geometry, material, &reflectedLight );
  // #endif
  // #if defined( RE_IndirectSpecular )
    RE_IndirectSpecular_Physical( radiance, iblIrradiance, clearcoatRadiance, geometry, material, &reflectedLight );
  // #endif

  var totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  var totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  var outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
  return vec4<f32>( outgoingLight.xyz, 1.0);
}
`;

interface DebugDefines {
  diffuse?: Texture;
  metalnessMap?: Texture;
  roughnessMap?: Texture;
}

export class DebugPipeline extends Pipeline<DebugDefines> {
  constructor(name: string, defines: DebugDefines) {
    super(name, vertexShader, fragmentShader, defines);
  }

  initialize(gameManager: GameManager): void {
    super.initialize(gameManager);

    const vertSource = shaderBuilder(this.vertexSource, this);
    const fragSource = shaderBuilder(this.fragmentSource, this);

    this.renderPipeline = gameManager.device.createRenderPipeline({
      ...defaultPipelineDescriptor,
      vertex: {
        module: gameManager.device.createShaderModule({
          code: vertSource,
        }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3, // (3 + 2)
            attributes: [
              {
                shaderLocation: 0,
                format: "float32x3",
                offset: 0,
              },
              // {
              //   shaderLocation: 1,
              //   format: "float32x3",
              //   offset: 12,
              // },
            ],
          },
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
            attributes: [
              {
                shaderLocation: 1,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
            attributes: [
              {
                shaderLocation: 2,
                format: "float32x2",
                offset: 0,
              },
            ],
          },
        ],
      },
      fragment: {
        module: gameManager.device.createShaderModule({
          code: fragSource,
        }),
        entryPoint: "main",
        targets: [{ format: gameManager.format }],
      },
    });

    const materialResource = new MaterialResource(this.groupIndex(PipelineResourceType.Material), 0);
    this.addResource(PipelineResourceType.Material, materialResource);

    const lightingResource = new LightingResource(this.groupIndex(PipelineResourceType.Lighting), 0);
    this.addResource(PipelineResourceType.Lighting, lightingResource);

    if (this.defines.diffuse) {
      const group = this.groupIndex(PipelineResourceType.Diffuse);
      const resource = new TextureResource(this.defines.diffuse, group, 0);
      this.addResource(PipelineResourceType.Diffuse, resource);
    }
  }
}
