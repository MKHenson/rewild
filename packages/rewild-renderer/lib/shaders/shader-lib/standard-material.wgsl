// The metallic-roughness surface — everything a standard material does between
// its texture samples and its final colour, shared by standard.wgsl and
// standard-instanced.wgsl.
//
// A function rather than a spliced statement fragment (as total-lighting.frag
// is) because the two hosts differ in what they wrap around it: the per-mesh
// pass applies a selection tint, the instanced one has no per-instance selected
// flag to apply it with. Everything up to that point is identical, and it is
// the part where a divergence between the two would be a silent shading bug
// rather than a compile error.
//
// Requires from the including shader — by these exact names, at whatever group
// and binding its own layout puts them:
//   - mySampler, baseColorMap, normalMap, metallicRoughnessMap, occlusionMap,
//     emissiveMap, and the standardParams uniform block
//   - brdf.wgsl, pbr-lighting.wgsl and tbn.frag.wgsl, which this calls into
//   - the `lighting` storage binding those two need, and spotLightShadowParams,
//     which says which light in it the spot atlas belongs to

// glTF alphaMode. Shared numbering with ALPHA_MODES in StandardMaterial.ts.
const ALPHA_MODE_OPAQUE: u32 = 0u;
const ALPHA_MODE_MASK  : u32 = 1u;
const ALPHA_MODE_BLEND : u32 = 2u;

struct StandardParams {
  // Multiplied by the corresponding texture channel, as glTF's *Factor
  // parameters are. A material with no map is the factor alone, because every
  // map defaults to white. The fourth component is the opacity factor.
  baseColorFactor  : vec4f,
  emissiveColor    : vec3f,
  roughness        : f32,
  // Flat ambient, and temporary: #201 replaces it with sky-captured IBL and
  // deletes it. It is here because without any ambient term a face turned away
  // from every light is pure black, which makes the BRDF impossible to judge.
  ambientColor     : vec3f,
  emissiveStrength : f32,
  metallic         : f32,
  occlusionStrength: f32,
  normalScale      : f32,
  alphaCutoff      : f32,
  alphaMode        : u32,
  _pad0            : f32,
  _pad1            : f32,
  _pad2            : f32,
}

// `sunShadow` is the cloud and cascade shadow product; `spotShadow` is the one
// shadow-casting spot's factor. Both are the caller's because the shadow
// includes that produce them are statement fragments spliced into its body.
fn shadeStandardSurface(
  fragUV: vec2f,
  normal: vec3f,
  viewPosition: vec3f,
  vertexColor: vec4f,
  isFrontFacing: bool,
  sunShadow: f32,
  spotShadow: f32
) -> vec4f {
  // baseColorMap is sRGB-declared (#190), so this sample is already linear.
  // Vertex colour is linear by glTF's definition and multiplies in unchanged.
  let baseColorSample = textureSample(baseColorMap, mySampler, fragUV)
                      * standardParams.baseColorFactor * vertexColor;
  let baseColor = baseColorSample.rgb;

  // Alpha is decided before any shading, so a masked-out fragment costs a
  // texture fetch rather than a light loop. `discard` demotes the invocation to
  // a helper, so the derivatives perturbNormal takes below are still defined
  // across the quad.
  if (standardParams.alphaMode == ALPHA_MODE_MASK && baseColorSample.a < standardParams.alphaCutoff) {
    discard;
  }

  // A back face is lit by the mirror of its normal — otherwise every leaf card
  // and every open shell is black from behind. Single-sided materials cull
  // their back faces, so this is a no-op for them rather than a branch worth
  // gating on doubleSided.
  let facing = select(-1.0, 1.0, isFrontFacing);
  let geometricNormal = normalize(normal) * facing;
  // glTF's normalTexture.scale, which tilts X and Y while leaving Z alone —
  // so it flattens or exaggerates the relief rather than rotating it. Applied
  // before perturbNormal, which renormalizes.
  let normalSample = (textureSample(normalMap, mySampler, fragUV).rgb * 2.0 - 1.0)
                   * vec3f(standardParams.normalScale, standardParams.normalScale, 1.0);

  // G is roughness and B is metallic, per glTF. A standalone grayscale
  // roughness map works in this slot too, since R = G = B in one.
  let metallicRoughnessSample = textureSample(metallicRoughnessMap, mySampler, fragUV);
  let roughness = standardParams.roughness * metallicRoughnessSample.g;
  let metallic = standardParams.metallic * metallicRoughnessSample.b;

  var surface: PbrSurface;
  surface.normal = perturbNormal(viewPosition, fragUV, geometricNormal, normalSample);
  surface.viewPosition = viewPosition;
  surface.diffuseColor = diffuseColorFromBaseColor(baseColor, metallic);
  surface.f0 = f0FromBaseColor(baseColor, metallic);
  surface.alpha = perceptualRoughnessToAlpha(roughness);

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );

  // Shadows attenuate diffuse and specular together — a blocked light delivers
  // neither.
  var color = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
            + lit.punctualDiffuse + lit.punctualSpecular
            + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadow;

  // Occlusion describes light that never reached the pocket in the first place,
  // which is a statement about *indirect* light — direct lighting already
  // answers the question with N·L and the shadow maps, and multiplying it again
  // here would double-darken every crevice that faces away from the sun. So
  // glTF scopes it to indirect, and today the only indirect term is the flat
  // ambient below. #201's IBL takes that term's place and inherits the multiply.
  //
  // Consequence worth knowing: with ambientColor at its default black, an
  // occlusion map has no visible effect at all.
  let occlusionSample = textureSample(occlusionMap, mySampler, fragUV).r;
  let occlusion = 1.0 + standardParams.occlusionStrength * (occlusionSample - 1.0);

  // Ambient lands on the diffuse colour only, so a metal stays black under it
  // rather than picking up a grey wash no reflection would produce.
  color += surface.diffuseColor * standardParams.ambientColor * occlusion;

  let emissiveSample = textureSample(emissiveMap, mySampler, fragUV).rgb;
  color += emissiveSample * standardParams.emissiveColor * standardParams.emissiveStrength;

  // OPAQUE ignores alpha entirely, and MASK has already resolved it to a yes or
  // no — both write 1.0, per glTF. Only BLEND lets it through, and only that
  // mode's pipeline has blending enabled to do anything with it.
  var alpha = 1.0;
  if (standardParams.alphaMode == ALPHA_MODE_BLEND) {
    alpha = baseColorSample.a;
  }

  return vec4f(color, alpha);
}
