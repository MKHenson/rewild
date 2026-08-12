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
//   - brdf.wgsl, pbr-lighting.wgsl, tbn.frag.wgsl and ibl.wgsl, which this
//     calls into, plus the IBL bindings that last one names
//   - the `lighting` storage binding those two need, and spotLightShadowParams,
//     which says which light in it the spot atlas belongs to
//   - HAS_VERTEX_TANGENTS, a module-scope bool const the host bakes in from
//     StandardPassBase.shaderDefines()

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
  emissiveStrength : f32,
  metallic         : f32,
  occlusionStrength: f32,
  normalScale      : f32,
  alphaCutoff      : f32,
  alphaMode        : u32,
  _pad0            : f32,
  _pad1            : f32,
}

// `sunShadow` is the cloud and cascade shadow product; `spotShadow` is the one
// shadow-casting spot's factor. Both are the caller's because the shadow
// includes that produce them are statement fragments spliced into its body.
fn shadeStandardSurface(
  fragUV: vec2f,
  normal: vec3f,
  // glTF's TANGENT in view space, xyz plus handedness. Read only where
  // HAS_VERTEX_TANGENTS says the pipeline supplies one; the hosts pass a
  // placeholder otherwise, since a parameter cannot be conditionally absent.
  tangent: vec4f,
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

  if (HAS_VERTEX_TANGENTS) {
    surface.normal = perturbNormalTangent(geometricNormal, tangent, normalSample);
  } else {
    surface.normal = perturbNormal(viewPosition, fragUV, geometricNormal, normalSample);
  }
  // Pre-perturbation, so horizon occlusion can tell how far the normal map has
  // tilted the shading normal off the triangle.
  surface.geometricNormal = geometricNormal;
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
  let direct = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
             + lit.punctualDiffuse + lit.punctualSpecular
             + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadow;
  var color = direct;

  // Occlusion describes light that never reached the pocket in the first place,
  // which is a statement about *indirect* light — direct lighting already
  // answers the question with N·L and the shadow maps, and multiplying it again
  // here would double-darken every crevice that faces away from the sun. So
  // glTF scopes it to indirect, IBL below and
  // nothing else.
  let occlusionSample = textureSample(occlusionMap, mySampler, fragUV).r;
  let occlusion = 1.0 + standardParams.occlusionStrength * (occlusionSample - 1.0);

  // Ambient, from the prefiltered sky rather than an authored constant. Both
  // lobes: a metal has no diffuse to catch a flat ambient with and used to go
  // black in shadow, and it is the specular half — a real reflection of a real
  // sky — that fixes that. Perceptual roughness rather than surface.alpha,
  // because that is what the prefiltered chain and the BRDF map are indexed by.
  let indirect = evaluateIbl(surface, roughness) * occlusion;
  color += indirect;

  let emissiveSample = textureSample(emissiveMap, mySampler, fragUV).rgb;
  let emissive = emissiveSample * standardParams.emissiveColor * standardParams.emissiveStrength;
  color += emissive;

  // Channel visualisation short-circuits here rather than earlier so the
  // debug views are of the *shaded* surface's own inputs — the same normal the
  // BRDF used, the same roughness, and for the two output channels the same
  // direct and indirect terms that would have been summed above.
  if (iblParams.debugChannel != DEBUG_CHANNEL_OFF) {
    return materialDebugColor(
      baseColor, metallic, roughness, surface.normal, occlusion, emissive,
      direct, indirect
    );
  }

  // OPAQUE ignores alpha entirely, and MASK has already resolved it to a yes or
  // no — both write 1.0, per glTF. Only BLEND lets it through, and only that
  // mode's pipeline has blending enabled to do anything with it.
  var alpha = 1.0;
  if (standardParams.alphaMode == ALPHA_MODE_BLEND) {
    alpha = baseColorSample.a;
  }

  return vec4f(color, alpha);
}
