// Render shader: draws rain/snow particles as instanced billboarded quads.
//
// Rain: thin elongated quad oriented along the velocity + gravity direction.
//       The "right" edge is perpendicular to both velocity and the camera
//       direction, giving a perspective-correct streak regardless of viewangle.
// Snow: small square quad billboarded to always face the camera, with a
//       circular alpha mask applied in the fragment shader.
// Both shapes are blended by temperature (0=snow, 1=rain).

struct Particle {
    position: vec3<f32>,
    seed:     f32,
    velocity: vec3<f32>,
    _pad:     f32,
}

// RenderUniforms layout (must match RainParticlePass.ts):
//   offset   0: viewProj     (mat4x4, size=64)
//   offset  64: cameraPos    (vec3,   size=12)
//   offset  76: temperature  (f32)
//   offset  80: windDir      (vec2,   align=8)
//   offset  88: windSpeed    (f32) — gust-adjusted effective speed
//   offset  92: precipitation(f32)
//   offset  96-111: padding
//   struct size = 112 bytes
struct RenderUniforms {
    viewProj:     mat4x4<f32>,
    cameraPos:    vec3<f32>,
    temperature:  f32,
    windDir:      vec2<f32>,
    windSpeed:    f32,
    precipitation: f32,
    sunUpDot:     f32,  // sun elevation: -1=night, 0=horizon, +1=zenith
    _pad1:        f32,
    _pad2:        f32,
    _pad3:        f32,
}

@group(0) @binding(0) var<storage, read> particles:  array<Particle>;
@group(0) @binding(1) var<uniform>        u:          RenderUniforms;

struct VertexOutput {
    @builtin(position) clipPos:   vec4f,
    @location(0)       uv:        vec2f,  // [0,1]² over the quad
    @location(1)       nearFade:  f32,    // fade out very close particles
}

// Six vertices per quad (two triangles, CCW).
// uv.x: 0=left, 1=right  |  uv.y: 0=head(bottom), 1=tail(top)
const QUAD_UV = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
);

@vertex
fn vs(
    @builtin(vertex_index)   vi: u32,
    @builtin(instance_index) ii: u32,
) -> VertexOutput {
    let lUV = QUAD_UV[vi];
    let p   = particles[ii];

    let rainFactor = u.temperature;  // 0 = snow, 1 = rain

    // ── Rain streak geometry ──────────────────────────────────────────────
    // Use the particle's stored velocity for streak direction so bounce arcs
    // show an upward streak rather than a downward one.
    let fallSpeed  = mix(1.0, 9.5, rainFactor);
    let windVel    = vec3f(u.windDir.x * u.windSpeed, 0.0, u.windDir.y * u.windSpeed);
    let pvLen      = length(p.velocity);
    var velDir: vec3f;
    if (pvLen > 0.05) {
        velDir = p.velocity / pvLen;
    } else {
        velDir = normalize(windVel + vec3f(0.0, -fallSpeed, 0.0));
    }

    let toCamera = normalize(u.cameraPos - p.position);

    // Right vector: perp to velocity and to camera direction, giving the quad width
    var rainRight = cross(velDir, toCamera);
    if (length(rainRight) < 0.001) {
        rainRight = cross(velDir, vec3f(0.0, 0.0, 1.0));
    }
    rainRight = normalize(rainRight);

    // head (uv.y=0) = current drop position; tail (uv.y=1) = where it was
    let rainWidth   = 0.016;
    let rainLength  = 0.40;
    let rainOffset  = rainRight * ((lUV.x - 0.5) * rainWidth)
                    - velDir   * ((lUV.y - 0.5) * rainLength);

    // ── Snow flake geometry ───────────────────────────────────────────────
    // Cylindrical billboard: always faces camera, aligned with world Y
    var snowRight = cross(vec3f(0.0, 1.0, 0.0), toCamera);
    if (length(snowRight) < 0.001) {
        snowRight = vec3f(1.0, 0.0, 0.0);
    }
    snowRight = normalize(snowRight);
    let snowUp = normalize(cross(toCamera, snowRight));

    // Vary flake size slightly per particle for a natural look
    let snowSize   = mix(0.05, 0.10, p.seed);
    let snowOffset = snowRight * ((lUV.x - 0.5) * snowSize)
                   + snowUp   * ((lUV.y - 0.5) * snowSize);

    // ── Blend and output ──────────────────────────────────────────────────
    let worldOffset = mix(snowOffset, rainOffset, rainFactor);
    let worldPos    = p.position + worldOffset;

    // Fade out particles very close to the camera (avoids sudden pop-in clipping)
    let camDist  = length(u.cameraPos - p.position);
    let nearFade = smoothstep(0.5, 2.0, camDist);

    var out: VertexOutput;
    out.clipPos  = u.viewProj * vec4f(worldPos, 1.0);
    out.uv       = lUV;
    out.nearFade = nearFade;
    return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
    let rainFactor = u.temperature;

    // ── Rain streak: thin soft line ───────────────────────────────────────
    let rainEdge    = abs(in.uv.x - 0.5) * 2.0;               // 0 = center, 1 = edge
    let rainCapFade = smoothstep(0.0, 0.12, in.uv.y)           // fade at head
                    * smoothstep(1.0, 0.88, in.uv.y);          // fade at tail
    let rainAlpha   = smoothstep(1.0, 0.0, rainEdge) * rainCapFade * 0.38;

    // ── Snow flake: soft circle ───────────────────────────────────────────
    let snowDist  = length(in.uv - vec2f(0.5)) * 2.0;          // 0=center, 1=edge
    let snowAlpha = smoothstep(1.0, 0.2, snowDist) * 0.55;

    // ── Blend, apply precipitation & near-fade ────────────────────────────
    let alpha = mix(snowAlpha, rainAlpha, rainFactor) * in.nearFade;

    let rainColor = vec3f(0.76, 0.83, 0.91);
    let snowColor = vec3f(0.95, 0.97, 1.00);
    let color     = mix(snowColor, rainColor, rainFactor);

    // Time-of-day tint: night → dusk/dawn → day
    let s = u.sunUpDot;
    var tint: vec3f;
    if (s < -0.1) {
        tint = vec3f(0.10, 0.12, 0.30);
    } else if (s < 0.0) {
        tint = mix(vec3f(0.10, 0.12, 0.30), vec3f(0.80, 0.50, 0.20), (s + 0.1) / 0.1);
    } else if (s < 0.3) {
        tint = mix(vec3f(0.80, 0.50, 0.20), vec3f(1.0, 1.0, 1.0), s / 0.3);
    } else {
        tint = vec3f(1.0, 1.0, 1.0);
    }

    return vec4f(color * tint, alpha);
}
