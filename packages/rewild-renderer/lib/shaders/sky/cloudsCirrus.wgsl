// Cirrus cloud helpers — included in cloudsTemporal.wgsl.
//
// Quality is driven by `${ }` defines rather than by swapping shader files —
// CIR_TAPS (3 = fallstreaks with depth, 1 = a flat sheet at roughly a third of
// the cost) and CIR_DETAIL_* are substituted in by TemporalCloudRenderer from
// its CIRRUS_QUALITY table. Everything else here is tuning, not tiering.
//
// The construction, in order of how much each part matters visually:
//
//   1. A *ridged* noise carves the coverage patch into separated hairs. Folding
//      value noise about its midpoint (1 - |2n-1|) puts sharp crests in the
//      field where there were smooth humps; on a domain this anisotropic those
//      crests read as fibre. Thresholding plain smooth fbm — which is what this
//      shader used to do — can only ever produce soft blobs, and stretching the
//      domain 3:1 just turns those blobs into ellipses.
//   2. A divergence-free (curl) swirl applied *before* the domain is squashed,
//      plus an isotropic medium warp. Sampling a warp field after the squash
//      makes the field as elongated as the strands, and an elongated warp slides
//      strands sideways as a group instead of bending them — that is what left
//      the earlier version looking like a bundle of parallel lines. Building the
//      warps in unsquashed space is what produces arcs, hooks and commas.
//   3. Three sheared taps through a virtual deck, so the hairs trail into
//      fallstreaks with soft ends instead of being a flat cut-out. Ice falling
//      out of a generating head into a wind shear is literally what makes a
//      mare's tail, so the shear is modelled directly.
//   4. Strands align to object.windDirection rather than a hardcoded axis.
//   5. Henyey-Greenstein forward scattering plus an optional 22-degree halo,
//      rather than a flat 0.5 + 0.5cos lobe. Ice scatters strongly forward,
//      which is why a thin veil in front of the sun goes brilliant while the
//      same veil opposite the sun stays dull grey.
//   6. A per-patch *regime* (cirrusRegime) that rewrites most of the tuning
//      above from windiness, cloudiness and two slow time drifts, so the sky
//      moves through real cirrus genera instead of always being the same cloud.
//
// Cost: ~15 noise3 fetches per pixel in clear sky (the coverage test early-outs
// before the ridge field is touched) and ~41 inside a patch — one more than
// before for the regime's spatial lookup, which is shared across taps. It only
// runs on sky pixels that survive the cumulus march, at 0.7x resolution, for 1/4
// of them per frame.
//
// No bindings or private vars here; all are declared in the host shader.
// Dependencies: fog.wgsl (intersectSphereBoth, SphereIntersect),
//               skyCommon.wgsl (noise3, hash1, ObjectStruct: cirrusCoverage/
//                               cirrusOpacity/windiness/windDirection/iTime),
//               skyConstants.wgsl (EARTH_RADIUS, PI).
// `sunDotUp` is read from the host shader's private var.

const CIRRUS_ALT:   f32 = 6000.0;
const CIRRUS_THICK: f32 = 50000.0;

// ─────────────────────────────────────────────────────────────────────────────
// Tuning. These are the knobs worth touching; everything below them is
// structure. Distances are in "sheet space" — world metres * CIR_SCALE, so one
// sheet unit is 5 km on the ground at the default scale.
// ─────────────────────────────────────────────────────────────────────────────

// Base noise frequency. Larger = smaller, more numerous cirrus patches.
const CIR_SCALE: f32 = 0.0002;

// Domain squash along / across the wind axis. A small along-value stretches
// features into long streaks; near 1.0 the streak character is gone and patches
// read as granular cloudlets. Vertical squash is deliberately low: a cirrus
// deck is coherent top to bottom, and it is the shear below — not decorrelated
// noise — that should produce the fallstreaks.
//
// The along-value is now picked per patch by cirrusRegime(); 0.35 was the old
// fixed value and sits inside this range.
const CIR_SQUASH_ALONG_MIN: f32 = 0.26;   // long ribbons
const CIR_SQUASH_ALONG_MAX: f32 = 0.58;   // chunky, granular
const CIR_SQUASH_ACROSS: f32 = 1.0;
const CIR_SQUASH_UP:     f32 = 0.6;

// ── Swirl ────────────────────────────────────────────────────────────────────
// The headline knob. A curl-noise displacement applied in unsquashed sheet
// space, so it rotates whole neighbourhoods and bends the strands into arcs.
// Curl specifically (rather than two independent noise displacements) because
// it is divergence-free: it swirls the domain instead of pooling it into
// sources and sinks, which is the difference between "swirled" and "marbled".
//
// The amplitude is where the character lives. It is a displacement in sheet
// units; the swirl cells are 1/CIR_SWIRL_FREQ across, so once the amplitude
// approaches that (~1.1 here) strands start curling right back on themselves,
// and past it the streak character is lost entirely. Keep the range below that.
const CIR_SWIRL_FREQ: f32 = 0.90;
// Amplitude range, driven by windiness and the slow drift — a calm upper air
// meanders, a sheared one turns the bands into arcs and hooks.
const CIR_SWIRL_AMP_CALM:  f32 = 0.16;
const CIR_SWIRL_AMP_WINDY: f32 = 0.48;
// Central-difference step for the curl, in the swirl field's own units.
const CIR_CURL_EPS:   f32 = 0.10;

// Medium warp: isotropic, evaluated per tap at strand scale. This is what puts
// hooks and commas on individual strands once the swirl has bent the band.
const CIR_WARP_MED_FREQ: f32 = 0.85;
const CIR_WARP_MED_CALM:  f32 = 0.28;
const CIR_WARP_MED_WINDY: f32 = 0.62;

// Fine fray, applied after the squash — pure edge detail on the strand
// outlines, so it is fine for this one to be anisotropic.
const CIR_WARP_FINE: f32 = 0.16;

// ── Filaments ────────────────────────────────────────────────────────────────
// Frequency of the ridge field relative to the coverage field, and how much
// extra it is stretched along the wind. CIR_FIL_STRETCH * CIR_FIL_FREQ lands
// back near 1.0 on purpose — the hairs end up ~2.6x finer *across* the wind
// while staying the same length along it. cirrusRegime() drifts the frequency
// and derives the stretch from this lock, so that invariant holds at every
// point of the drift instead of only at the old fixed pair (2.6 / 0.40).
const CIR_FIL_FREQ_MIN:   f32 = 2.0;   // coarse fibres
const CIR_FIL_FREQ_MAX:   f32 = 3.4;   // fine, densely packed
const CIR_FIL_ALONG_LOCK: f32 = 1.04;

// Hair sharpness: the exponent applied to the ridge field. Higher = thinner,
// more separated filaments with more clear sky between them. The feathered edge
// of a patch gets the sharp value (pure hair) and its core the soft one (nearly
// solid veil), which is how a real patch reads — dense head, wispy tail.
//
// Driven by cloudiness: a shallow deck stays hairy and separated, a deep one
// mats together into spissatus and finally a featureless cirrostratus veil.
// Softening the exponents raises the density the ridge field produces, so the
// gain has to come down over the same range or the veil saturates to a flat
// sheet and loses all structure.
const CIR_HAIR_EDGE_THIN: f32 = 5.4;
const CIR_HAIR_EDGE_DEEP: f32 = 2.4;
const CIR_HAIR_CORE_THIN: f32 = 2.3;
const CIR_HAIR_CORE_DEEP: f32 = 0.7;
const CIR_GAIN_THIN:      f32 = 3.0;
const CIR_GAIN_DEEP:      f32 = 1.9;

// ── Deck ─────────────────────────────────────────────────────────────────────
// CIRRUS_THICK above is a fudged 50 km so the sphere test stays forgiving at
// grazing angles; a real cirrus deck is 1-2 km. Rather than re-tuning that shell
// (and invalidating existing coverage/opacity settings), the taps are spread
// over this depth around the midplane hit.
//
// CIR_TAPS is supplied by the pipeline (CIRRUS_QUALITY in TemporalCloudRenderer)
// rather than hardcoded here. It bounds a loop, so it has to be a WGSL `const`
// and cannot come from a uniform — hence the `${ }` substitution, which means
// changing the tier recompiles the module.
const CIR_TAPS: i32 = ${ CIRRUS_TAPS };
const CIR_DECK: f32 = 2400.0;

// Lateral drift between the top and bottom of the deck. This is the fallstreak,
// and it is the single clearest read on windiness: calm air leaves the ice in
// short straight tufts (cirrus fibratus), while strong shear drags it far
// downwind into the long hooked mare's tails of cirrus uncinus.
// The across-component is small and only there to hook the tails.
const CIR_SHEAR_ALONG_CALM:   f32 = 0.30;
const CIR_SHEAR_ALONG_WINDY:  f32 = 1.50;
const CIR_SHEAR_ACROSS_CALM:  f32 = 0.06;
const CIR_SHEAR_ACROSS_WINDY: f32 = 0.36;

// Optical depth per unit density per deck thickness. Higher = denser veil for
// the same coverage. object.cirrusOpacity remains the hard ceiling on alpha.
const CIR_EXTINCTION_THIN: f32 = 1.5;
const CIR_EXTINCTION_DEEP: f32 = 3.6;

// Anti-shimmer LOD, in metres of ray length. The clouds buffer runs at 0.7x and
// 3/4 of its pixels are reprojected from history, so filaments finer than a
// pixel crawl and ghost. Fading the two finest octaves out with distance is both
// cheaper and stabler than trying to filter them afterwards — without this the
// extra detail is a net loss over a blobbier shader.
//
// Also pipeline-supplied: lower tiers pull these in so they do less work per tap
// as well as fewer taps.
const CIR_DETAIL_NEAR: f32 = ${ CIRRUS_DETAIL_NEAR };
const CIR_DETAIL_FAR:  f32 = ${ CIRRUS_DETAIL_FAR };

// 22-degree halo strength (hexagonal ice prisms). Set to 0.0 to disable.
const CIR_HALO: f32 = 0.35;

// ── Lighting ────────────────────────────────────────────────────────────────
// Direct sunlight on the ice, as radiance.
//
// Calibrate these against the *composited* value, not this function's output.
// The host blends the result as `color += transmittance * rgb * alpha` with
// alpha capped by object.cirrusOpacity (0.2 by default), and then attenuates the
// sky behind by pow(transmittance, 2.0) — so at alpha 0.2 a cirrus adds a fifth
// of its own radiance while removing 36% of the sky it covers. Break-even
// against the background is therefore radiance > ~1.8x the sky behind it, and
// anything dimmer paints a smudge that *darkens* the sky rather than a cloud
// catching the sun. A dusk sky runs 2-3 radiance, so the lit term needs tens.
//
// Hue survives the ACES shoulder here because alpha divides the value back down
// into the middle of the curve before it is tonemapped.
const CIRRUS_SUN_DAY:   vec3f = vec3f(0.92, 0.95, 1.00) * 85.0;
const CIRRUS_SUN_GOLD:  vec3f = vec3f(1.00, 0.34, 0.13) * 55.0;
const CIRRUS_SUN_EMBER: vec3f = vec3f(1.00, 0.18, 0.22) * 40.0;

// Skylight on the deck — the unlit floor. Deliberately small: it is added to
// every tap regardless of sun angle, so raising it to where it reads on its own
// flattens the lit/unlit contrast that the direct term above is there to create.
const CIRRUS_AMBIENT_DAY:   vec3f = vec3f(0.45, 0.62, 1.00) * 5.0;
const CIRRUS_AMBIENT_DUSK:  vec3f = vec3f(0.34, 0.24, 0.40) * 5.0;
const CIRRUS_AMBIENT_NIGHT: vec3f = vec3f(0.05, 0.06, 0.14) * 1.0;

// The cirrus deck sits at CIRRUS_ALT, so its horizon is depressed by
// acos(R / (R + alt)) ~ 0.044 in sin(elevation) terms: the sun is still well
// clear of the deck's horizon when it has already set for the viewer. Offsetting
// the ramps by this is what keeps high ice gold and burning while the cumulus
// below it has already gone red — the "last thing lit in the sky" look.
const CIR_HORIZON_LIFT: f32 = 0.044;

// Beer coefficient for the accumulated density, in place of a self-shadow march.
// Gives a dense generating head a darker core than its wispy tail.
const CIR_SELF_SHADOW: f32 = 1.3;

// ─────────────────────────────────────────────────────────────────────────────
// Noise primitives
// ─────────────────────────────────────────────────────────────────────────────

// Single-octave value noise remapped to [-1, 1]. Used only for warp fields,
// where one octave is plenty — they are coarse by construction and a second
// octave would double the fetch count for almost no visible change.
fn cirSigned(p: vec3f) -> f32 {
    return noise3(p) * 2.0 - 1.0;
}

// 2D curl of a scalar noise potential, taken in the horizontal (x, z) plane of
// sheet space. Divergence-free by construction: the displacement it produces
// rotates the domain rather than compressing it, which is what makes the
// strands wrap into arcs and eddies instead of just wobbling.
//
// noise3 is exactly 256-periodic, so a central difference straddling the wrap
// is still consistent and needs no special case.
fn cirCurl(p: vec3f, e: f32) -> vec2f {
    let dx = noise3(p + vec3f(e, 0.0, 0.0)) - noise3(p - vec3f(e, 0.0, 0.0));
    let dz = noise3(p + vec3f(0.0, 0.0, e)) - noise3(p - vec3f(0.0, 0.0, e));
    // (dψ/dz, -dψ/dx) — the 2D curl of the potential ψ.
    return vec2f(dz, -dx) / (2.0 * e);
}

// 4-octave value fbm, range [0, 0.9375]. The coverage field.
fn cirFbm(p: vec3f) -> f32 {
    let m = mat3x3<f32>(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );
    var q = p;
    var f = 0.5000 * noise3(q);
    q = m * q * 2.02;
    f += 0.2500 * noise3(q);
    q = m * q * 2.02;
    f += 0.1250 * noise3(q);
    q = m * q * 2.02;
    f += 0.0625 * noise3(q);
    return f;
}

// Ridged fbm, range [0, 1]. `1 - |2n-1|` folds value noise about its midpoint,
// so the smooth hump between two lattice points becomes a sharp crest. This is
// the fibre generator.
//
// `fine` in [0,1] fades the top two octaves for the LOD described above; the
// result is renormalised by the surviving weights so distant cirrus keeps the
// same mean density instead of thinning out as detail drops.
fn cirRidge(p: vec3f, fine: f32) -> f32 {
    let m = mat3x3<f32>(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );
    var q = p;
    var f = 0.5333 * (1.0 - abs(2.0 * noise3(q) - 1.0));
    var w = 0.5333;
    q = m * q * 2.11;
    f += 0.2667 * (1.0 - abs(2.0 * noise3(q) - 1.0));
    w += 0.2667;

    if (fine > 0.01) {
        let f3 = fine * 0.1333;
        q = m * q * 2.07;
        f += f3 * (1.0 - abs(2.0 * noise3(q) - 1.0));
        w += f3;

        let f4 = fine * fine * 0.0667;
        q = m * q * 2.13;
        f += f4 * (1.0 - abs(2.0 * noise3(q) - 1.0));
        w += f4;
    }

    return f / w;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet space
// ─────────────────────────────────────────────────────────────────────────────

// Horizontal basis: `along` points downwind (the strand axis), `across` is
// perpendicular to it.
struct CirBasis {
    along:  vec3f,
    across: vec3f,
};

fn cirrusBasis() -> CirBasis {
    var wd = object.windDirection;
    // windDirection is zero before the first weather update; fall back to a
    // fixed diagonal so the sky still looks right in that case.
    if (dot(wd, wd) < 1e-6) { wd = vec2f(0.7071, -0.7071); }
    wd = normalize(wd);

    var b: CirBasis;
    b.along  = vec3f(wd.x, 0.0, wd.y);
    b.across = vec3f(-wd.y, 0.0, wd.x);
    return b;
}

// Raw sheet coordinates for a camera-relative position: x downwind, y up,
// z across. Unsquashed and unwarped — every warp field is built from these, and
// only the final density lookup works in the squashed space.
//
// The camera's world XZ is added back so the pattern stays anchored to the world
// rather than riding along with the camera.
fn cirSheet(position: vec3f, b: CirBasis) -> vec3f {
    let worldPos = position + vec3f(object.cameraPosition.x, 0.0, object.cameraPosition.z);
    let scroll   = object.iTime * 0.00035 * object.windiness;
    return vec3f(
        dot(worldPos, b.along) * CIR_SCALE + scroll,
        worldPos.y * CIR_SCALE * CIR_SQUASH_UP,
        dot(worldPos, b.across) * CIR_SCALE
    );
}

// The coarse swirl for a point. Pulled out of cirrusDensityAt so it can be
// evaluated once per pixel instead of once per deck tap: it is a property of the
// air mass at a scale of tens of kilometres, and the taps span two, so sharing
// it costs nothing visible and saves two thirds of the four fetches.
fn cirSwirl(sheet: vec3f, amp: f32) -> vec2f {
    return cirCurl(sheet * CIR_SWIRL_FREQ + vec3f(4.1, 0.0, 9.3), CIR_CURL_EPS)
           * amp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regime — which kind of cirrus this patch of sky is
// ─────────────────────────────────────────────────────────────────────────────
//
// Cirrus genus is a property of the upper air, and the two weather uniforms
// already say most of what is needed:
//
//   windiness  → shear. Weak shear leaves fine straight parallel filaments
//                (fibratus). Strong shear drags ice out of its generating head
//                into long hooked fallstreaks (uncinus, "mare's tails") and
//                bends whole bands into arcs.
//   cloudiness → deck depth. A shallow deck stays hairy and separated; a deep
//                one mats together into spissatus and finally the featureless
//                halo-bearing veil of cirrostratus, where strand character is
//                gone entirely.
//
// On top of that, two slow sinusoidal drifts and one low-frequency noise
// lookup. The drifts are what keep the sky from looking the same every evening
// at the same weather settings; the noise is what stops the whole dome changing
// character as a single unit, so one part of the sky can be hooked and another
// straight at the same moment.
//
// Cost: one noise3 per pixel (not per tap) plus two sines — cirrusRaySample
// evaluates this once and hands it to every tap, the same way it shares cirSwirl.

// Angular rate of the slow drift. iTime is totalDeltaTime * 0.3 and
// totalDeltaTime is milliseconds, so iTime ~ 300 * seconds: 3.0e-5 is a period
// of about 12 minutes. The second drift runs at the golden ratio of the first,
// so the pair is incommensurate and the combination never visibly repeats.
const CIR_REGIME_RATE:  f32 = 3.0e-5;
// Frequency of the spatial term, in sheet units — cells roughly 45 km across.
const CIR_REGIME_SPACE: f32 = 0.11;
// How far the spatial term pulls a patch away from the global drift. At 0 the
// whole sky shares one character; at 1 the drift stops mattering.
const CIR_REGIME_SPREAD: f32 = 0.45;

struct CirRegime {
    squashAlong: f32,
    swirl:       f32,
    warpMed:     f32,
    shearAlong:  f32,
    shearAcross: f32,
    hairEdge:    f32,
    hairCore:    f32,
    filFreq:     f32,
    filStretch:  f32,
    gain:        f32,
    extinction:  f32,
};

fn cirrusRegime(sheet: vec3f) -> CirRegime {
    let wind  = saturate(object.windiness);
    let depth = saturate(object.cloudiness);

    let t      = object.iTime * CIR_REGIME_RATE;
    let driftA = 0.5 + 0.5 * sin(t);
    let driftB = 0.5 + 0.5 * sin(t * 0.61803 + 2.4);

    // One low-frequency lookup, shared by both axes. The second uses its
    // complement so the two do not move together across a patch boundary.
    // (`patch` itself is a WGSL reserved keyword — hence airMass.)
    let airMass = noise3(sheet * CIR_REGIME_SPACE + vec3f(31.7, 0.0, 12.9));
    let ra = mix(driftA, airMass, CIR_REGIME_SPREAD);
    let rb = mix(driftB, 1.0 - airMass, CIR_REGIME_SPREAD);

    var r: CirRegime;

    // Shear: almost entirely windiness, with a little drift so a windy sky is
    // not always identically hooked.
    let shearT = saturate(wind * 0.85 + ra * 0.15);
    r.shearAlong  = mix(CIR_SHEAR_ALONG_CALM,  CIR_SHEAR_ALONG_WINDY,  shearT);
    r.shearAcross = mix(CIR_SHEAR_ACROSS_CALM, CIR_SHEAR_ACROSS_WINDY, shearT);
    r.swirl       = mix(CIR_SWIRL_AMP_CALM,    CIR_SWIRL_AMP_WINDY,    shearT);
    r.warpMed     = mix(CIR_WARP_MED_CALM,     CIR_WARP_MED_WINDY,     shearT);

    // Depth: entirely cloudiness. Hair softens, gain compensates, deck thickens.
    r.hairEdge   = mix(CIR_HAIR_EDGE_THIN,  CIR_HAIR_EDGE_DEEP,  depth);
    r.hairCore   = mix(CIR_HAIR_CORE_THIN,  CIR_HAIR_CORE_DEEP,  depth);
    r.gain       = mix(CIR_GAIN_THIN,       CIR_GAIN_DEEP,       depth);
    r.extinction = mix(CIR_EXTINCTION_THIN, CIR_EXTINCTION_DEEP, depth);

    // Elongation: drift picks ribbons vs granular, but a deep deck is pulled
    // back toward isotropic regardless — a cirrostratus veil has no grain.
    let elongation = mix(CIR_SQUASH_ALONG_MIN, CIR_SQUASH_ALONG_MAX, ra);
    r.squashAlong  = mix(elongation, CIR_SQUASH_ALONG_MAX, depth * 0.6);

    // Fibre fineness drifts freely; stretch follows from the along-wind lock.
    r.filFreq    = mix(CIR_FIL_FREQ_MIN, CIR_FIL_FREQ_MAX, rb);
    r.filStretch = CIR_FIL_ALONG_LOCK / r.filFreq;

    return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Density
// ─────────────────────────────────────────────────────────────────────────────

// `sheet`    raw sheet coordinates for this tap (see cirSheet).
// `swirl`    coarse curl displacement, shared across the deck (see cirSwirl).
// `deckFrac` in [-0.5, 0.5] — height within the virtual deck, which drives the
//            fallstreak shear. 0.0 means mid-deck, no offset.
// `fine`     in [0, 1] — the detail-LOD weight.
// `reg`      the patch's cirrus regime (see cirrusRegime) — shared across taps.
fn cirrusDensityAt(sheet: vec3f, swirl: vec2f, deckFrac: f32, fine: f32, reg: CirRegime) -> f32 {
    // Medium warp, isotropic and in raw space so that it varies as fast along a
    // strand as across it. That is the whole trick: a warp field elongated like
    // the strands can only translate them, while an isotropic one bends them.
    let med = vec2f(
        cirSigned(sheet * CIR_WARP_MED_FREQ + vec3f(9.1, 0.0, -3.4)),
        cirSigned(sheet * CIR_WARP_MED_FREQ + vec3f(-5.6, 4.2, 12.8))
    ) * reg.warpMed;

    let uw = sheet.x + swirl.x + med.x;
    let vw = sheet.z + swirl.y + med.y;

    // Into strand space: squash along the wind, then shear for the fallstreak.
    var q = vec3f(
        uw * reg.squashAlong   + deckFrac * reg.shearAlong,
        sheet.y,
        vw * CIR_SQUASH_ACROSS + deckFrac * reg.shearAcross
    );

    // Fine fray — high-frequency detail on the strand outlines only.
    let d0 = cirSigned(q * 3.1 + vec3f(11.2, 1.7, -4.4));
    let d1 = cirSigned(q * 3.1 + vec3f(-7.9, 3.3, 8.6));
    q += vec3f(d1 * CIR_WARP_FINE * 0.5, 0.0, d0 * CIR_WARP_FINE);

    // Coverage: where there is cirrus at all. Threshold maps coverage [0,1] to
    // [0.58, 0.10], landing in the bulk of the fbm distribution so that
    // coverage = 0.3 gives roughly 30% of the sky.
    let n         = cirFbm(q);
    let threshold = 0.58 - object.cirrusCoverage * smoothstep(0.0, 0.5, object.cloudiness) * 0.48;
    let cov       = clamp((n - threshold) / 0.30, 0.0, 1.0);

    // Early-out before the ridge field: most sky pixels stop here, which is what
    // keeps the average cost down despite the extra octaves.
    if (cov <= 0.0) { return 0.0; }

    // Filaments. Stretched harder along the wind than the coverage field, so the
    // hairs are fine across and long downwind.
    let fq    = vec3f(q.x * reg.filStretch, q.y, q.z) * reg.filFreq
                + vec3f(17.3, 0.0, 5.1);
    let ridge = cirRidge(fq, fine);

    // pow() is exp2(e * log2(base)) in WGSL, so a zero base can produce a NaN on
    // some drivers rather than 0. Clamp the base away from it.
    let hair = pow(max(ridge, 1e-4), mix(reg.hairEdge, reg.hairCore, cov));

    return saturate(cov * hair * reg.gain);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lighting
// ─────────────────────────────────────────────────────────────────────────────

// Scattering lobe for ice crystals. A Henyey-Greenstein forward lobe over a weak
// isotropic base: g = 0.65 is broad enough that the glow spreads tens of degrees
// around the sun rather than sitting in a tight spot. Normalised so the value is
// ~0.6 at 90 degrees from the sun and ~2.6 looking straight at it.
fn cirrusPhase(mu: f32) -> f32 {
    let g     = 0.65;
    let g2    = g * g;
    let denom = max(1.0 + g2 - 2.0 * g * mu, 1e-3);
    let hg    = (1.0 - g2) / (4.0 * PI * denom * sqrt(denom));

    var p = 0.55 + 1.75 * hg + 0.18 * mu;

    if (CIR_HALO > 0.0) {
        // 22-degree halo. It can only appear where there is cirrus between the
        // viewer and the sun, which is exactly where this gets multiplied in.
        let theta = acos(clamp(mu, -1.0, 1.0));
        let x     = (theta - 0.3840) / 0.030;
        p += CIR_HALO * exp(-x * x) * smoothstep(-0.05, 0.1, sunDotUp);
    }

    return p;
}

// `thickness` in [0,1] is the accumulated density, used only to grey down the
// densest parts — cirrus is optically thin, so a full self-shadow march would
// cost several more taps to change very little.
//
// Direct and ambient are separate terms rather than one blended colour. The
// deck sits at 6 km, so it stays in sunlight for ~20 minutes after the ground is
// in shadow, and that light has crossed a long grazing path — gold, then ember
// red. Keeping the skylight term additive is what leaves the unlit side blue
// while the lit side burns, which is the whole look; one lerped colour can only
// ever be flat.
fn cirrusLighting(sunDotDir: f32, thickness: f32) -> vec3f {
    // Sun elevation as the deck sees it, not as the ground does.
    let deckSunUp = sunDotUp + CIR_HORIZON_LIFT;

    // warmT reaches 1 with the sun on the deck's horizon (the old ramp still
    // held a quarter of the blue-white day colour there, which is what diluted
    // the dusk hue); emberT only starts once the sun is below it.
    let warmT  = 1.0 - smoothstep(0.0, 0.30, deckSunUp);
    let emberT = 1.0 - smoothstep(-0.15, 0.0, deckSunUp);

    var sunColor = mix(CIRRUS_SUN_DAY, CIRRUS_SUN_GOLD, warmT);
    sunColor     = mix(sunColor, CIRRUS_SUN_EMBER, emberT);

    // The earth's shadow climbs past the deck from below; direct light is gone
    // by roughly -12 degrees, well after the ground has lost it.
    let lit = smoothstep(-0.21, -0.05, deckSunUp);

    var ambient = mix(CIRRUS_AMBIENT_NIGHT, CIRRUS_AMBIENT_DAY, smoothstep(-0.15, 0.15, sunDotUp));
    ambient     = mix(ambient, CIRRUS_AMBIENT_DUSK, warmT * lit);

    let selfShadow = exp(-CIR_SELF_SHADOW * saturate(thickness));

    return ambient + sunColor * lit * cirrusPhase(sunDotDir) * selfShadow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ray sampling
// ─────────────────────────────────────────────────────────────────────────────

// Returns (rgb=lit colour, a=opacity) for blending into skyRay() via remaining
// transmittance.
fn cirrusRaySample(cameraPos: vec3f, dir: vec3f, sunDirection: vec3f) -> vec4f {
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight   = length(cameraPos - earthCenter);
    let mu          = dot(sunDirection, dir);
    let basis       = cirrusBasis();

    const CIR_INNER: f32 = EARTH_RADIUS + CIRRUS_ALT;
    const CIR_OUTER: f32 = CIR_INNER + CIRRUS_THICK;
    const CIR_MID:   f32 = CIR_INNER + CIRRUS_THICK * 0.5;

    // Inside the layer: thin tint on the ice sheet itself.
    if (camHeight > CIR_INNER && camHeight < CIR_OUTER) {
        let sheet = cirSheet(cameraPos, basis);
        let reg   = cirrusRegime(sheet);
        let d     = cirrusDensityAt(sheet, cirSwirl(sheet, reg.swirl), 0.0, 1.0, reg);
        return vec4f(cirrusLighting(mu, d), clamp(d * 0.15, 0.0, 0.15));
    }

    // Project the ray onto the cirrus midplane sphere.
    let hitMid = intersectSphereBoth(cameraPos, dir, earthCenter, CIR_MID);
    if (!hitMid.hit) { return vec4f(0.0); }

    // Below midplane -> tFar (exit up through sphere); above -> tNear (enter down).
    let t = select(hitMid.tFar, hitMid.tNear, camHeight > CIR_MID);
    if (t <= 0.0) { return vec4f(0.0); }

    // Fade at very grazing angles to avoid horizon wrap-around.
    let cosAngle    = abs(dir.y);
    let horizonFade = smoothstep(0.0, 0.07, cosAngle);
    if (horizonFade <= 0.0) { return vec4f(0.0); }

    let fine = 1.0 - smoothstep(CIR_DETAIL_NEAR, CIR_DETAIL_FAR, t);

    // Path length through the deck, in deck thicknesses.
    let slant  = clamp(1.0 / max(cosAngle, 0.07), 1.0, 6.0);
    let hitPos = cameraPos + dir * t;

    // One regime and one swirl evaluation for the whole deck — both are
    // properties of the air mass at a scale far larger than the deck spans.
    let hitSheet = cirSheet(hitPos, basis);
    let reg      = cirrusRegime(hitSheet);
    let swirl    = cirSwirl(hitSheet, reg.swirl);

    // Jitter the tap positions so three taps spread over a slanted deck dither
    // rather than band. The temporal accumulator averages the noise away — this
    // is the same hash the cumulus march uses for its own start offset.
    let jitter = (hash1(dot(dir, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001) - 0.5)
                 / f32(CIR_TAPS);

    // Stepping along the ray (rather than straight up) gives the deck real
    // parallax: looking through it at a slant should show its top and bottom
    // offset sideways, which is why cirrus piles into a haze band toward the
    // horizon. The spread is capped well below `slant` because three taps cannot
    // resolve the tens of kilometres a truly grazing ray would cover.
    let spread = CIR_DECK * min(slant, 2.5);

    var sum = 0.0;
    for (var i = 0; i < CIR_TAPS; i++) {
        let frac = (f32(i) + 0.5) / f32(CIR_TAPS) - 0.5 + jitter;
        sum += cirrusDensityAt(
            cirSheet(hitPos + dir * (frac * spread), basis),
            swirl,
            frac,
            fine,
            reg
        );
    }
    sum /= f32(CIR_TAPS);

    if (sum <= 0.0) { return vec4f(0.0); }

    // Beer-Lambert through the slanted deck; cirrusOpacity stays the ceiling on
    // alpha, so the existing setting keeps its meaning.
    let cover = 1.0 - exp(-sum * slant * reg.extinction);
    let alpha = cover * object.cirrusOpacity * horizonFade;

    return vec4f(cirrusLighting(mu, sum), alpha);
}
