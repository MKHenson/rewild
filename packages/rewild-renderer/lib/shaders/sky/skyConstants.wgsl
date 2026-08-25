const PI: f32 = 3.141592653589793238462643383279502884197169;
const FOG_COLOR_DAY = vec3f( 0.66, 0.66, 0.69 );
const FOG_COLOR_NIGHT = vec3f( 0.03, 0.04, 0.08 );
const FOG_COLOR_STORM = vec3f( 0.55, 0.57, 0.45 );

// Evening aerial perspective, split by azimuth relative to the sun. The bottom
// few degrees of sky are ~100% fog (a horizontal ray crosses ~80 km of haze), so
// this pair — not the sky palette — is what the horizon band actually reads as.
// A single neutral pink here is what made the whole ring one flat colour: at
// sunset the sun-facing horizon is gold and the opposite horizon is a cool
// violet-grey, and having both is most of what sells the hour.
const FOG_COLOR_EVENING_SUN  = vec3f( 1.30, 0.52, 0.22 );
const FOG_COLOR_EVENING_AWAY = vec3f( 0.42, 0.36, 0.52 );

// Sky-glow floor for fog with the sun below the horizon. Airglow, starlight and
// scattered moonlight keep real night fog dark but never black — and the horizon has
// to stay continuous with the night sky, which sits around 1 HDR here. Without this
// the fog band quantised to pure black and read as a wall across the horizon.
const FOG_NIGHT_AMBIENT = vec3f( 0.30, 0.38, 0.70 );
// Ambient bounce onto clouds. EVENING is the golden-hour term: warm, because light
// reaching a cloud at low sun has been reddened by a long atmospheric path. It used to
// be all but identical to NIGHT — a cold blue-grey — which is why sunset decks read as
// flat and dead however the direct term was tuned.
const CLOUD_AMBIENT_DAY_COLOR = vec3f(0.5, 0.8, 1.0);
const CLOUD_AMBIENT_EVENING_COLOR = vec3f( 0.34, 0.17, 0.13 );
const CLOUD_AMBIENT_NIGHT_COLOR = vec3f( 0.10, 0.12, 0.17);


// Twilight window for the night sky, as sin(sun elevation). The first stars appear
// around -2 degrees and the sky is fully dark by -15, which brackets real civil to
// astronomical twilight.
//
// The atmosphere's own dayFactor is a far tighter -0.1..0.1 band and cannot serve
// here: it reads 0.5 with the sun exactly on the horizon, so the sky was already
// half a star field at sunset, and fully dark by -5.7 degrees.
const NIGHT_FADE_START: f32 = -0.035;
const NIGHT_FADE_END: f32 = -0.26;

// How far the twilight sky dims across that window. Needed because the star fade
// and the sky brightness share one blend — without it the longer fade just holds a
// bright sunset palette until it cuts to night. 1.0 at and above the horizon, so
// daylight is untouched.
const TWILIGHT_DIM_FLOOR: f32 = 0.15;

// ── Sky palette ──────────────────────────────────────────────────────────────
// Radiance ratios, scaled by skyBrightness in getAtmosphereColor. Components
// above 1.0 are deliberate — the sunset arc has to survive the ACES shoulder.
//
// The twilight set is sampled on two axes: view elevation (ZENITH → MID →
// HORIZON) and azimuth relative to the sun (AWAY vs SUN). Elevation is the
// first axis and the one that was missing: rays near the horizon cross far more
// air, so their blue is scattered out and what arrives is gold and red, while
// the zenith keeps its Rayleigh blue right through civil twilight. Keying the
// palette on sun proximity alone turns the whole dome one flat sepia at dusk.
const SKY_DAY_DEEP_BLUE: vec3f = vec3f( 0.40, 0.62, 1.00 );  // away from sun
const SKY_DAY_PALE_BLUE: vec3f = vec3f( 0.80, 0.95, 1.00 );  // toward sun

const SKY_DUSK_ZENITH:      vec3f = vec3f( 0.12, 0.30, 0.80 );
const SKY_DUSK_MID:         vec3f = vec3f( 0.30, 0.32, 0.60 );
const SKY_DUSK_HORIZON:     vec3f = vec3f( 0.62, 0.40, 0.48 );  // belt of Venus
const SKY_DUSK_SUN_ZENITH:  vec3f = vec3f( 0.24, 0.36, 0.78 );
const SKY_DUSK_SUN_MID:     vec3f = vec3f( 1.05, 0.62, 0.36 );
const SKY_DUSK_SUN_HORIZON: vec3f = vec3f( 1.70, 0.60, 0.20 );

// Tint for the additive horizon-haze term. Neutral white by day; left white at
// dusk it is precisely what bleaches the warm band back to grey.
const SKY_DUSK_HAZE_SUN:  vec3f = vec3f( 1.00, 0.50, 0.20 );
const SKY_DUSK_HAZE_AWAY: vec3f = vec3f( 0.44, 0.42, 0.66 );

const EARTH_RADIUS: f32 = 6300e3;
const CLOUD_START: f32 = 500.0;
const CLOUD_HEIGHT: f32 = 600.0;
const SUN_POWER: vec3f = vec3(1.0,0.9,0.6) * 1200.;
const LOW_SCATTER: vec3f = vec3(1.0, 0.7, 0.5); 