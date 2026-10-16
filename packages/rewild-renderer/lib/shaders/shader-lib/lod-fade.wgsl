// The cross-fade between scatter LOD tiers.
//
// A tier's band is four distances: it fades in over [x, y] and out over
// [z, w]. Around a handover the outgoing tier's fade-out and the incoming
// tier's fade-in cover the same metres and sum to one, and the fragment stage
// turns the two weights into complementary screen-door patterns — the pixels
// one tier drops are exactly the pixels the other keeps, so depth stays
// opaque and nothing is drawn twice. A band whose edge has no width (tier 0's
// near, or a tier the bias has shifted) fades nowhere.

// Fade-in and fade-out weights for an instance at `distance`.
fn lodFadeWeights(distance : f32, band : vec4f) -> vec2f {
  let fadeIn = select(
    1.0,
    clamp((distance - band.x) / max(band.y - band.x, 1e-4), 0.0, 1.0),
    band.y > band.x
  );
  let fadeOut = select(
    1.0,
    clamp((band.w - distance) / max(band.w - band.z, 1e-4), 0.0, 1.0),
    band.w > band.z
  );
  return vec2f(fadeIn, fadeOut);
}

// The screen-door threshold of a pixel, 0 to 1: interleaved gradient noise over
// the pixel grid. Whatever fades in keeps the pixels below its weight, and what
// it replaces keeps the rest. Terrain chunks fade in against the horizon ring
// with it too.
fn fadePattern(fragCoord : vec2f) -> f32 {
  return fract(
    52.9829189 * fract(dot(floor(fragCoord), vec2f(0.06711056, 0.00583715)))
  );
}

// Whether this pixel is one of the tier's under its weights: the outgoing tier
// keeps the pixels below its weight, the incoming one keeps the rest.
fn lodFadeKeeps(fragCoord : vec2f, fade : vec2f) -> bool {
  let pattern = fadePattern(fragCoord);
  return pattern < fade.y && pattern >= 1.0 - fade.x;
}
