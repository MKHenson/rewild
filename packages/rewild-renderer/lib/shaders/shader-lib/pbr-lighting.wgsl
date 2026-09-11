// Direct lighting accumulation for the metallic-roughness BRDF.
//
// Unlike total-lighting.frag.wgsl and total-lighting-phong.frag.wgsl — which are
// statement fragments spliced into a fragment body — this is a function. The
// surface goes in as a struct and the buckets come back as one, so a caller
// parameterises it rather than arranging for the right locals to happen to be
// in scope. terrain.wgsl will need exactly that when it adopts PBR in #202,
// since it blends its material parameters per-fragment.
//
// The result is split into three buckets because each is multiplied by a
// different shadow factor: the sun takes cloud and cascade shadows, the one
// shadow-casting spot takes the spot atlas, and everything else takes neither.
//
// Requires from the including shader:
//   - the `lighting` storage binding, whose group/binding index belongs to that
//     shader's layout and so cannot be declared here
//   - total-lighting.wgsl, for the Light struct and lightDistanceAttenuation
//   - brdf.wgsl, for evaluateBRDF
//
// The shadow-casting spot is identified by arguments rather than by reading
// spotLightShadowParams, so this file does not additionally depend on
// spot-light-shadow.wgsl having been included.

struct PbrSurface {
  // View space, normalized, after normal mapping. What the diffuse lobes use.
  normal: vec3f,
  /**
   * View space, normalized. What the specular lobes use — the GGX distribution,
   * Fresnel and the reflection vector, direct and image-based alike. The same
   * as `normal` for an ordinary surface. Differs where the shading normal is
   * authored for a shape the triangles do not have: that normal says how much
   * light the surface gathers, and the triangle's own says where it reflects.
   */
  specularNormal: vec3f,
  /**
   * View space, normalized, *before* normal mapping — the surface the geometry
   * actually has. Only used for horizon occlusion (see horizonOcclusion), which
   * is the one thing that needs to know how far the shading normal has been
   * tilted away from what the triangle can support.
   */
  geometricNormal: vec3f,
  // View-space fragment position. The eye is at the origin in view space, which
  // is what makes the view vector just `normalize(-viewPosition)`.
  viewPosition: vec3f,
  diffuseColor: vec3f,
  f0: vec3f,
  // Roughness², i.e. the output of perceptualRoughnessToAlpha.
  alpha: f32,
}

struct PbrLightAccum {
  directionalDiffuse: vec3f,
  directionalSpecular: vec3f,
  punctualDiffuse: vec3f,
  punctualSpecular: vec3f,
  spotShadowDiffuse: vec3f,
  spotShadowSpecular: vec3f,
}

fn accumulatePbrLighting(
  surface: PbrSurface,
  hasShadowSpot: u32,
  shadowSpotIndex: u32
) -> PbrLightAccum {
  var accum: PbrLightAccum;
  accum.directionalDiffuse = vec3f(0.0);
  accum.directionalSpecular = vec3f(0.0);
  accum.punctualDiffuse = vec3f(0.0);
  accum.punctualSpecular = vec3f(0.0);
  accum.spotShadowDiffuse = vec3f(0.0);
  accum.spotShadowSpecular = vec3f(0.0);

  let N = surface.normal;
  let Ns = surface.specularNormal;
  let V = normalize(-surface.viewPosition);

  // The reflection vector depends only on Ns and V, not on any light, so the
  // horizon term is computed once and applied to every light's specular.
  let specularHorizon = horizonOcclusion(reflect(-V, Ns), surface.geometricNormal);

  for (var i: u32 = 0; i < lighting.numLights; i++) {
    let light = lighting.lights[i];
    let radiance = light.color * light.intensity;

    if (light.lightType == 1.0) {
      // Directional. positionOrDirection is the direction the light travels, so
      // the vector *toward* the light is its negation.
      let brdf = evaluateBRDF(
        N, Ns, V, -light.positionOrDirection,
        surface.diffuseColor, surface.f0, surface.alpha
      );
      accum.directionalDiffuse += brdf.diffuse * radiance;
      accum.directionalSpecular += brdf.specular * radiance * specularHorizon;
      continue;
    }

    let lightVec = light.positionOrDirection - surface.viewPosition;
    let dist = length(lightVec);
    if (dist >= light.range) {
      continue;
    }
    let L = lightVec / max(dist, 1e-4);

    var attenuation = lightDistanceAttenuation(dist, light.range);
    let isSpot = light.lightType == 2.0;
    if (isSpot) {
      let angle = acos(clamp(dot(-L, light.direction), 0.0, 1.0));
      attenuation *= 1.0 - smoothstep(light.innerAngle, light.outerAngle, angle);
    }
    if (attenuation <= 0.0) {
      continue;
    }

    let brdf = evaluateBRDF(
      N, Ns, V, L, surface.diffuseColor, surface.f0, surface.alpha
    );
    let diffuse = brdf.diffuse * radiance * attenuation;
    let specular = brdf.specular * radiance * attenuation * specularHorizon;

    if (isSpot && hasShadowSpot != 0u && i == shadowSpotIndex) {
      accum.spotShadowDiffuse += diffuse;
      accum.spotShadowSpecular += specular;
    } else {
      accum.punctualDiffuse += diffuse;
      accum.punctualSpecular += specular;
    }
  }

  return accum;
}
