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
//     emissiveMap, heightMap, and the standardParams uniform block
//   - brdf.wgsl, pbr-lighting.wgsl, tbn.frag.wgsl, parallax.frag.wgsl and
//     ibl.wgsl, which this calls into, plus the IBL bindings that last one names
//   - the `lighting` storage binding those two need, and spotLightShadowParams,
//     which says which light in it the spot atlas belongs to
//   - HAS_VERTEX_TANGENTS, HAS_PARALLAX, HAS_AUTHORED_NORMALS and
//     HAS_FOLIAGE_SHADING, module-scope bool consts the host bakes in from
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
  // Depth of the parallax volume, in UV units — the same units fragUV is in, so
  // a mesh whose UVs tile ten times over a wall needs a tenth the value one
  // whose UVs cover it once does. 0 ⇒ this material samples flat, which is the
  // runtime off-switch next to HAS_PARALLAX's compile-time one.
  heightScale      : f32,
  // Distance in view space over which the parallax volume fades to nothing.
  // Detail is mipped away at range, where the march can only alias.
  parallaxFadeStart: f32,
  parallaxFadeEnd  : f32,
  _pad0            : f32,
  _pad1            : f32,
  _pad2            : f32,
  // Per mip, what alpha is multiplied by before the MASK cutoff, so a mip
  // keeps the coverage the base level has instead of the average its texels
  // sank to. All 1 for a material with nothing to preserve.
  alphaMipScale    : array<vec4f, 4>,
}

fn alphaMipScaleAt(level : u32) -> f32 {
  return standardParams.alphaMipScale[level / 4u][level % 4u];
}

// The scale for the mip the base colour is about to be read at, from the
// screen-space footprint of the texture — the same level the sampler picks.
// Takes derivatives, so it runs before any discard.
fn alphaCoverageScale(fragUV : vec2f) -> f32 {
  let texels = fragUV * vec2f(textureDimensions(baseColorMap));
  let dx = dpdx(texels);
  let dy = dpdy(texels);
  let lod = clamp(0.5 * log2(max(dot(dx, dx), dot(dy, dy))), 0.0, 15.0);
  let lo = u32(floor(lod));
  return mix(alphaMipScaleAt(lo), alphaMipScaleAt(min(lo + 1u, 15u)), fract(lod));
}

// The UV every map is sampled at: fragUV displaced along the view ray through
// the height map's volume, or fragUV itself where parallax is compiled out.
//
// Takes derivatives, so it must be called from uniform control flow — which is
// why the caller runs it above the alpha discard. `tbn` is the frame the normal
// map is applied through, reused here so the ray walks the same axes the relief
// was baked against; without vertex tangents that frame comes from screen-space
// derivatives and is rebuilt every frame, so relief can swim slightly as the
// camera turns. Prefer vertexTangents on anything parallax-mapped.
// How far the sun wraps past the terminator on a leaf, as a fraction of the
// lobe. A blade is thin enough to be lit from well behind its own horizon, and
// a hard Lambert terminator is what makes foliage read as stamped cardboard.
const FOLIAGE_WRAP: f32 = 0.6;

// Strength and tightness of light coming *through* a blade. Peaks looking into
// the sun, which is the whole character of a backlit field.
const FOLIAGE_TRANSMIT: f32 = 0.55;
const FOLIAGE_TRANSMIT_POWER: f32 = 3.0;

/**
 * Shading model for foliage: grass clumps and canopy cards.
 *
 * Not a cheaper standard material, a different one. It drops the entire
 * specular chain — no metallic-roughness, no GGX, no prefiltered probe, no
 * normal map, no tangent frame — because a leaf is a matte cutout and none of
 * it was describing anything. That also drops three of the five texture
 * fetches the standard path takes on every fragment, which is what makes it
 * affordable at the overdraw foliage draws at.
 *
 * What it adds is transmission, which the standard material has no term for and
 * which is the one thing that makes grass look like grass.
 *
 * `sunShadow` arrives with the cloud shadow already folded in, so an overcast
 * sweep still crosses a field shaded this way.
 */
fn shadeFoliage(
  albedo: vec3f,
  normal: vec3f,
  viewPosition: vec3f,
  sunShadow: f32
) -> vec4f {
  let N = normalize(normal);
  let V = normalize(-viewPosition);

  var direct = vec3f(0.0);
  var transmitted = vec3f(0.0);

  // Every light type, through the same two lobes. A lamp aimed at a field is
  // the case the wrap and transmit terms exist for, so restricting this to the
  // sun would put grass in a spot's cone lit only by the sky.
  //
  // Punctual lights reuse the standard model's falloff and cone, so a blade and
  // the ground it stands in take the same light. What foliage does not take is
  // the spot *shadow*: the atlas tap is 3x3 PCF and the overdraw here does not
  // carry it, so foliage inside a cone is lit whether or not something blocks
  // it. Only sunShadow, which the caller already has, reaches this model.
  for (var i: u32 = 0u; i < lighting.numLights; i = i + 1u) {
    let light = lighting.lights[i];
    // Both lobes are Lambertian, so both carry the 1/pi the standard model
    // applies through diffuseLambert. Without it foliage comes out pi times
    // brighter than everything around it.
    var radiance = light.color * light.intensity / BRDF_PI;
    var L: vec3f;

    if (light.lightType == 1.0) {
      // positionOrDirection is the direction the light travels, so the vector
      // toward it is its negation.
      L = normalize(-light.positionOrDirection);
      radiance *= sunShadow;
    } else {
      // Rejected on the square, so a light that does not reach this fragment
      // costs a dot and a compare rather than a sqrt. Every punctual light in
      // the buffer pays this much per foliage fragment, at foliage overdraw.
      let lightVec = light.positionOrDirection - viewPosition;
      let d2 = dot(lightVec, lightVec);
      if (d2 >= light.range * light.range) {
        continue;
      }
      let dist = sqrt(d2);
      L = lightVec / max(dist, 1e-4);

      var attenuation = lightDistanceAttenuation(dist, light.range);
      if (light.lightType == 2.0) {
        let angle = acos(clamp(dot(-L, light.direction), 0.0, 1.0));
        attenuation *= 1.0 - smoothstep(light.innerAngle, light.outerAngle, angle);
      }
      if (attenuation <= 0.0) {
        continue;
      }
      radiance *= attenuation;
    }

    direct += radiance
            * max(0.0, (dot(N, L) + FOLIAGE_WRAP) / (1.0 + FOLIAGE_WRAP));
    transmitted += radiance
                 * pow(max(0.0, dot(V, -L)), FOLIAGE_TRANSMIT_POWER)
                 * FOLIAGE_TRANSMIT;
  }

  // Diffuse irradiance only. The specular probe and the BRDF lookup are the
  // expensive half of evaluateIbl and a blade has nothing to reflect with.
  //
  // No 1/pi here: the irradiance cube already holds irradiance/pi, which is
  // why evaluateIbl multiplies the diffuse colour by it directly.
  let worldN = normalize((iblParams.viewToWorld * vec4f(N, 0.0)).xyz);
  let ambient = textureSampleLevel(iblIrradianceMap, iblSampler, worldN, 0.0).rgb;

  // Transmitted light is tinted by the blade it came through, so it takes the
  // albedo like the rest.
  return vec4f(albedo * (direct + ambient + transmitted), 1.0);
}

fn parallaxUV(fragUV: vec2f, viewPosition: vec3f, tbn: mat3x3f) -> vec2f {
  // Const-folded away where parallax is off — but heightMap is still named
  // below, which is what keeps it in the `layout: 'auto'` bind group layout the
  // material binds its texture into. WGSL counts a resource as statically
  // accessed if it appears in the body, reachable or not.
  if (!HAS_PARALLAX) {
    return fragUV;
  }

  let fade = 1.0 - smoothstep(
    standardParams.parallaxFadeStart,
    standardParams.parallaxFadeEnd,
    length(viewPosition)
  );

  // View-space eye is the origin, so surface→eye is -viewPosition. tbn's columns
  // are T, B and N, so dotting against each takes a view-space direction into
  // tangent space.
  let viewDir = -normalize(viewPosition);
  let viewTS = vec3f(
    dot(viewDir, tbn[0]),
    dot(viewDir, tbn[1]),
    dot(viewDir, tbn[2])
  );

  return parallaxOcclusionUV(
    fragUV,
    dpdx(fragUV),
    dpdy(fragUV),
    viewTS,
    standardParams.heightScale * fade
  );
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
  // A back face is lit by the mirror of its normal — otherwise every leaf card
  // and every open shell is black from behind. Single-sided materials cull
  // their back faces, so this is a no-op for them rather than a branch worth
  // gating on doubleSided.
  //
  // HAS_AUTHORED_NORMALS opts out, for geometry whose normals describe a shape
  // the triangles do not have: a canopy's cards carry the crown's outward
  // normal, which is not the card's own and so must not follow its winding.
  // Mirroring one turns it inward and the card goes black — on whichever half
  // of them faces away, which changes as the camera moves.
  let facing = select(-1.0, 1.0, isFrontFacing || HAS_AUTHORED_NORMALS);
  let geometricNormal = normalize(normal) * facing;

  // One frame for both jobs that need one: the normal map is applied through it,
  // and parallax marches the view ray across UV in it. The branch is on a
  // module-scope const rather than a uniform because one side takes derivatives.
  var tbn: mat3x3f;
  if (!HAS_FOLIAGE_SHADING) {
    if (HAS_VERTEX_TANGENTS) {
      tbn = tbnFromTangent(geometricNormal, tangent);
    } else {
      tbn = tbnFromDerivatives(viewPosition, fragUV, geometricNormal);
    }
  }

  // Every map below reads at the displaced UV, including the alpha the mask
  // tests — a cutout should cut where the relief actually put its edge. The
  // frame above is still built from fragUV: the displaced UV's derivatives jump
  // wherever the march lands on a different feature.
  var uv = fragUV;
  if (!HAS_FOLIAGE_SHADING) {
    uv = parallaxUV(fragUV, viewPosition, tbn);
  }

  // baseColorMap is sRGB-declared (#190), so this sample is already linear.
  // Vertex colour is linear by glTF's definition and multiplies in unchanged.
  let baseColorSample = textureSample(baseColorMap, mySampler, uv)
                      * standardParams.baseColorFactor * vertexColor;
  let baseColor = baseColorSample.rgb;

  // Alpha is decided before any shading, so a masked-out fragment costs a
  // texture fetch rather than a light loop. `discard` demotes the invocation to
  // a helper, so the derivatives taken above are still defined across the quad.
  // The alpha is rescaled for the mip it came from — see alphaMipScale — so a
  // leaf holds its coverage down the chain instead of thinning to nothing.
  // The branch is on a uniform, so the derivatives inside stay in uniform
  // control flow and an opaque material pays nothing for them.
  if (standardParams.alphaMode == ALPHA_MODE_MASK) {
    if (baseColorSample.a * alphaCoverageScale(fragUV) < standardParams.alphaCutoff) {
      discard;
    }
  }

  // Everything below is the metallic-roughness model. Foliage leaves here, so
  // the four remaining texture fetches and the whole specular chain compile out
  // for it. The cutout above is shared deliberately: both models must cut in
  // the same place or a layer changes silhouette when its shading model does.
  if (HAS_FOLIAGE_SHADING) {
    return shadeFoliage(baseColorSample.rgb, geometricNormal, viewPosition, sunShadow);
  }

  // glTF's normalTexture.scale, which tilts X and Y while leaving Z alone —
  // so it flattens or exaggerates the relief rather than rotating it. Applied
  // before the frame, which renormalizes.
  let normalSample = (textureSample(normalMap, mySampler, uv).rgb * 2.0 - 1.0)
                   * vec3f(standardParams.normalScale, standardParams.normalScale, 1.0);

  // G is roughness and B is metallic, per glTF. A standalone grayscale
  // roughness map works in this slot too, since R = G = B in one.
  let metallicRoughnessSample = textureSample(metallicRoughnessMap, mySampler, uv);
  let roughness = standardParams.roughness * metallicRoughnessSample.g;
  let metallic = standardParams.metallic * metallicRoughnessSample.b;

  var surface: PbrSurface;

  surface.normal = normalize(tbn * normalSample);
  surface.specularNormal = surface.normal;
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

  // Occlusion describes light that never reached the pocket in the first place,
  // which is a statement about *indirect* light — direct lighting already
  // answers the question with N·L and the shadow maps, and multiplying it again
  // here would double-darken every crevice that faces away from the sun. So
  // glTF scopes it to indirect, the IBL below, and nothing else.
  let occlusionSample = textureSample(occlusionMap, mySampler, uv).r;
  let occlusion = 1.0 + standardParams.occlusionStrength * (occlusionSample - 1.0);

  // Shadows attenuate diffuse and specular together — a blocked light delivers
  // neither.
  let direct = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
             + lit.punctualDiffuse + lit.punctualSpecular
             + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadow;
  var color = direct;

  // Ambient, from the prefiltered sky rather than an authored constant. Both
  // lobes: a metal has no diffuse to catch a flat ambient with and used to go
  // black in shadow, and it is the specular half — a real reflection of a real
  // sky — that fixes that. Perceptual roughness rather than surface.alpha,
  // because that is what the prefiltered chain and the BRDF map are indexed by.
  let indirect = evaluateIbl(surface, roughness) * occlusion;
  color += indirect;

  let emissiveSample = textureSample(emissiveMap, mySampler, uv).rgb;
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
