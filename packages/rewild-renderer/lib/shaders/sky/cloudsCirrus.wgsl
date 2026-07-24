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
//
// Cost: ~14 noise3 fetches per pixel in clear sky (the coverage test early-outs
// before the ridge field is touched) and ~40 inside a patch. It only runs on sky
// pixels that survive the cumulus march, at 0.7x resolution, for 1/4 of them per
// frame.
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
// features into long streaks. Vertical squash is deliberately low: a cirrus
// deck is coherent top to bottom, and it is the shear below — not decorrelated
// noise — that should produce the fallstreaks.
const CIR_SQUASH_ALONG:  f32 = 0.35;
const CIR_SQUASH_ACROSS: f32 = 1.0;
const CIR_SQUASH_UP:     f32 = 0.6;

// ── Swirl ────────────────────────────────────────────────────────────────────
// The headline knob. A curl-noise displacement applied in unsquashed sheet
// space, so it rotates whole neighbourhoods and bends the strands into arcs.
// Curl specifically (rather than two independent noise displacements) because
// it is divergence-free: it swirls the domain instead of pooling it into
// sources and sinks, which is the difference between "swirled" and "marbled".
//
// CIR_SWIRL_AMP is where the character lives. It is a displacement in sheet
// units; the swirl cells are 1/CIR_SWIRL_FREQ across, so once the amplitude
// approaches that (~3.3 here) strands start curling right back on themselves.
// Below ~1.0 it reads as a gentle meander; above ~4.0 it turns turbulent and
// the streak character is lost.
const CIR_SWIRL_FREQ: f32 = 0.90;
const CIR_SWIRL_AMP:  f32 = 0.30;
// Central-difference step for the curl, in the swirl field's own units.
const CIR_CURL_EPS:   f32 = 0.10;

// Medium warp: isotropic, evaluated per tap at strand scale. This is what puts
// hooks and commas on individual strands once the swirl has bent the band.
const CIR_WARP_MED_FREQ: f32 = 0.85;
const CIR_WARP_MED_AMP:  f32 = 0.45;

// Fine fray, applied after the squash — pure edge detail on the strand
// outlines, so it is fine for this one to be anisotropic.
const CIR_WARP_FINE: f32 = 0.16;

// ── Filaments ────────────────────────────────────────────────────────────────
// Frequency of the ridge field relative to the coverage field, and how much
// extra it is stretched along the wind. The product of CIR_SQUASH_ALONG,
// CIR_FIL_STRETCH and CIR_FIL_FREQ lands back near 1.0 on purpose — the hairs
// end up ~2.6x finer *across* the wind while staying the same length along it.
const CIR_FIL_FREQ:    f32 = 2.6;
const CIR_FIL_STRETCH: f32 = 0.40;

// Hair sharpness: the exponent applied to the ridge field. Higher = thinner,
// more separated filaments with more clear sky between them. The feathered edge
// of a patch gets the sharp value (pure hair) and its core the soft one (nearly
// solid veil), which is how a real patch reads — dense head, wispy tail.
// Raising either of these means raising CIR_GAIN to keep the same coverage.
const CIR_HAIR_EDGE: f32 = 4.5;
const CIR_HAIR_CORE: f32 = 1.8;
const CIR_GAIN:      f32 = 2.6;

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

// Lateral drift between the top and bottom of the deck. This is the fallstreak.
// The across-component is small and only there to hook the tails.
const CIR_SHEAR_ALONG:  f32 = 0.85;
const CIR_SHEAR_ACROSS: f32 = 0.22;

// Optical depth per unit density per deck thickness. Higher = denser veil for
// the same coverage. object.cirrusOpacity remains the hard ceiling on alpha.
const CIR_EXTINCTION: f32 = 2.2;

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
fn cirSwirl(sheet: vec3f) -> vec2f {
    return cirCurl(sheet * CIR_SWIRL_FREQ + vec3f(4.1, 0.0, 9.3), CIR_CURL_EPS)
           * CIR_SWIRL_AMP;
}

// ─────────────────────────────────────────────────────────────────────────────
// Density
// ─────────────────────────────────────────────────────────────────────────────

// `sheet`    raw sheet coordinates for this tap (see cirSheet).
// `swirl`    coarse curl displacement, shared across the deck (see cirSwirl).
// `deckFrac` in [-0.5, 0.5] — height within the virtual deck, which drives the
//            fallstreak shear. 0.0 means mid-deck, no offset.
// `fine`     in [0, 1] — the detail-LOD weight.
fn cirrusDensityAt(sheet: vec3f, swirl: vec2f, deckFrac: f32, fine: f32) -> f32 {
    // Medium warp, isotropic and in raw space so that it varies as fast along a
    // strand as across it. That is the whole trick: a warp field elongated like
    // the strands can only translate them, while an isotropic one bends them.
    let med = vec2f(
        cirSigned(sheet * CIR_WARP_MED_FREQ + vec3f(9.1, 0.0, -3.4)),
        cirSigned(sheet * CIR_WARP_MED_FREQ + vec3f(-5.6, 4.2, 12.8))
    ) * CIR_WARP_MED_AMP;

    let uw = sheet.x + swirl.x + med.x;
    let vw = sheet.z + swirl.y + med.y;

    // Into strand space: squash along the wind, then shear for the fallstreak.
    var q = vec3f(
        uw * CIR_SQUASH_ALONG  + deckFrac * CIR_SHEAR_ALONG,
        sheet.y,
        vw * CIR_SQUASH_ACROSS + deckFrac * CIR_SHEAR_ACROSS
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
    let fq    = vec3f(q.x * CIR_FIL_STRETCH, q.y, q.z) * CIR_FIL_FREQ
                + vec3f(17.3, 0.0, 5.1);
    let ridge = cirRidge(fq, fine);

    // pow() is exp2(e * log2(base)) in WGSL, so a zero base can produce a NaN on
    // some drivers rather than 0. Clamp the base away from it.
    let hair = pow(max(ridge, 1e-4), mix(CIR_HAIR_EDGE, CIR_HAIR_CORE, cov));

    return saturate(cov * hair * CIR_GAIN);
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
fn cirrusLighting(sunDotDir: f32, thickness: f32) -> vec3f {
    let dayFactor  = smoothstep(-0.1, 0.2, sunDotUp);
    let dayColor   = vec3f(0.9, 0.93, 1.0) * 70.0;
    let duskColor  = vec3f(1.0, 0.62, 0.32) * 50.0;
    let nightColor = vec3f(0.04, 0.05, 0.12) * 1.5;
    let dusk       = smoothstep(0.25, 0.0, sunDotUp) * smoothstep(-0.1, 0.08, sunDotUp);

    var col = mix(nightColor, dayColor, dayFactor);
    col     = mix(col, duskColor, dusk);

    return col * cirrusPhase(sunDotDir) * mix(1.0, 0.78, saturate(thickness));
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
        let d     = cirrusDensityAt(sheet, cirSwirl(sheet), 0.0, 1.0);
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

    // One swirl evaluation for the whole deck — see cirSwirl.
    let swirl = cirSwirl(cirSheet(hitPos, basis));

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
            fine
        );
    }
    sum /= f32(CIR_TAPS);

    if (sum <= 0.0) { return vec4f(0.0); }

    // Beer-Lambert through the slanted deck; cirrusOpacity stays the ceiling on
    // alpha, so the existing setting keeps its meaning.
    let cover = 1.0 - exp(-sum * slant * CIR_EXTINCTION);
    let alpha = cover * object.cirrusOpacity * horizonFade;

    return vec4f(cirrusLighting(mu, sum), alpha);
}
