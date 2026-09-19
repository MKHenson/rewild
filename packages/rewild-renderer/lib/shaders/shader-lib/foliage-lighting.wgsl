// The foliage shading model: grass clumps, canopy cards and the impostors
// baked off them. Shared by standard-material.wgsl, which routes a
// HAS_FOLIAGE_SHADING material here, and scatter-impostor.wgsl, which shades a
// foliage layer's billboards through the same lobes so the tier handover does
// not change the tree's brightness.
//
// Requires from the including shader — by these exact names, at whatever group
// and binding its own layout puts them:
//   - the `lighting` storage binding
//   - iblIrradianceMap, iblSampler and iblParams
//   - brdf.wgsl, for BRDF_PI, and total-lighting.wgsl, for
//     lightDistanceAttenuation

// How far the sun wraps past the terminator on a leaf, as a fraction of the
// lobe. A blade is thin enough to be lit from well behind its own horizon, and
// a hard Lambert terminator is what makes foliage read as stamped cardboard.
//
// It costs contrast, though: the wrap is a floor under every blade whatever way
// it points, and too much of one flattens a field into a single tone. This is
// the knob to reach for if foliage reads as posterised.
const FOLIAGE_WRAP: f32 = 0.4;

// Normalisation for the lobe above: linear, so a sun-facing blade peaks at
// Lambert's 1 and foliage sits level with the ground it stands in. Averaged
// over blades pointing every way this comes out brighter than Lambert, which
// is accepted — a squared normalisation puts the average right and the peak
// at 1/(1+w), and the whole plant reads darker than its surroundings.
const FOLIAGE_WRAP_NORM: f32 = 1.0 + FOLIAGE_WRAP;

// Scale on the sky irradiance a blade receives. 1 is what the standard path
// gives a surface with no occlusion map, and matches the impostor tier. Lower
// it to stand in for the self-shadowing a crown has and a lone blade does not;
// it is a constant on every fragment, so it flattens contrast as it darkens.
// Baked per-vertex AO in the scatter meshes is the real answer.
const FOLIAGE_AMBIENT: f32 = 1.0;

// Strength and tightness of light coming *through* a blade. Peaks looking into
// the sun, which is the whole character of a backlit field.
const FOLIAGE_TRANSMIT: f32 = 0.55;
const FOLIAGE_TRANSMIT_POWER: f32 = 3.0;

// Cosine of the view angle to a card's plane below which the card is gone.
// A card seen face on is 1 and edge on is 0; 0.25 fades the last 14 degrees.
// Wider hides more card edges and thins a crown seen from below or a field
// seen from the ground, where many cards stand near edge on.
const FOLIAGE_EDGE_FADE: f32 = 0.45;

/**
 * How much of a card's cutout survives at the angle it is seen from.
 *
 * A card is a flat quad standing in for a spray of leaves, and the one view
 * that gives it away is along its own plane, where it is a line. Eroding the
 * cutout to nothing as the view ray comes level with the card is what keeps
 * that line from ever being drawn. Multiplied into the alpha before the mask
 * cutoff, so the leaf shrinks from its soft edges rather than switching off.
 *
 * The plane is the triangle's own, off position derivatives, and not the
 * vertex normal: under HAS_AUTHORED_NORMALS that describes the whole crown, and
 * the fade is about the card. Takes derivatives, so it runs before any discard.
 *
 * Camera-relative by construction, so the shadow passes never apply it — a
 * card edge on to the camera is not edge on to the sun.
 */
fn foliageEdgeFade(viewPosition: vec3f) -> f32 {
  let plane = normalize(cross(dpdx(viewPosition), dpdy(viewPosition)));
  let V = normalize(-viewPosition);
  return smoothstep(0.0, FOLIAGE_EDGE_FADE, abs(dot(plane, V)));
}

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
            * max(0.0, (dot(N, L) + FOLIAGE_WRAP) / FOLIAGE_WRAP_NORM);
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
  let ambient = textureSampleLevel(iblIrradianceMap, iblSampler, worldN, 0.0).rgb
              * FOLIAGE_AMBIENT;

  // Transmitted light is tinted by the blade it came through, so it takes the
  // albedo like the rest.
  return vec4f(albedo * (direct + ambient + transmitted), 1.0);
}
