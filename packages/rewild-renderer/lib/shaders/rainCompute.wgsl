// Compute shader: simulates rain/snow particles in 3D world space.
//
// Each particle stores position + velocity. Physics drives velocity toward
// terminal (wind + gravity). On terrain contact:
//   Rain  — tiny fixed upward kick (1 m/s), 0.15 s arc then respawn.
//   Snow  — velocity zeroed, particle sits on terrain for ~1 s then respawns.
// _pad stores the countdown timer for both states.

struct Particle {
    position: vec3<f32>,
    seed:     f32,
    velocity: vec3<f32>,
    _pad:     f32,   // > 0 = seconds remaining in post-contact state before respawn
}

// ComputeUniforms layout (must match RainParticlePass.ts):
//   offset   0: cameraPos   (vec3, align=16, size=12)
//   offset  12: deltaTime   (f32)
//   offset  16: windDir     (vec2, align=8)
//   offset  24: windSpeed   (f32)
//   offset  28: temperature (f32)
//   offset  32: iTime       (f32)
//   offset  36: spawnRadius (f32)
//   offset  40: spawnHeight (f32)
//   offset  44-63: _pad0-_pad4 (5×f32)
//   offset  64: viewProj    (mat4x4, align=16, size=64)
//   offset 128: invViewProj (mat4x4, align=16, size=64)
//   struct size = 192 bytes
struct ComputeUniforms {
    cameraPos:   vec3<f32>,
    deltaTime:   f32,
    windDir:     vec2<f32>,
    windSpeed:   f32,
    temperature: f32,
    iTime:       f32,
    spawnRadius: f32,
    spawnHeight: f32,
    _pad0:       f32,
    _pad1:       f32,
    _pad2:       f32,
    _pad3:       f32,
    _pad4:       f32,
    viewProj:    mat4x4<f32>,
    invViewProj: mat4x4<f32>,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform>             u:         ComputeUniforms;
@group(0) @binding(2) var                      depthTex:  texture_depth_2d;

fn ihash(n: u32) -> u32 {
    var v = n;
    v ^= v >> 16u;
    v *= 0x45d9f3bu;
    v ^= v >> 16u;
    return v;
}
fn hf(n: u32) -> f32 {
    return f32(ihash(n)) / 4294967296.0;
}

fn spawnParticle(i: u32, windVel: vec3<f32>, fallSpeed: f32,
                 cameraPos: vec3<f32>, spawnRadius: f32, spawnHeight: f32) -> Particle {
    let tick = u32(u.iTime * 20.0) + 1u;
    let rx   = hf((i * 3911u) ^ tick);
    let rz   = hf((i * 7213u) ^ (tick * 3u + 1u));
    let ry   = hf((i * 5471u) ^ (tick * 7u + 2u));
    var p: Particle;
    p.seed     = rx;
    p.position = vec3f(
        cameraPos.x + (rx * 2.0 - 1.0) * spawnRadius,
        cameraPos.y + spawnHeight * ry,
        cameraPos.z + (rz * 2.0 - 1.0) * spawnRadius,
    );
    p.velocity = windVel + vec3f(0.0, -fallSpeed, 0.0);
    p._pad     = 0.0;
    return p;
}

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= arrayLength(&particles)) { return; }

    var p = particles[i];

    let rainFactor = u.temperature;
    let fallSpeed  = mix(1.0, 9.5, rainFactor);
    let windFactor = mix(0.2, 1.0, rainFactor);
    let gustAmp    = sin(u.iTime * 0.41) * 0.5
                   + sin(u.iTime * 1.17) * 0.3
                   + sin(u.iTime * 2.73) * 0.2;
    let gust       = 0.5 + gustAmp * 0.45;
    let effWind    = u.windSpeed * windFactor * (1.0 + gust * 0.5);
    let windVel    = vec3f(u.windDir.x * effWind, 0.0, u.windDir.y * effWind);

    // ── Post-contact state (rain arc or snow rest) ────────────────────────────
    if (p._pad > 0.0) {
        p._pad -= u.deltaTime;

        if (rainFactor > 0.5) {
            // Rain: ballistic arc under gravity only (no wind)
            p.velocity.y -= fallSpeed * u.deltaTime;
            p.position   += p.velocity * u.deltaTime;
        }
        // Snow: position and velocity are frozen — particle just sits there

        // Respawn when TTL expires OR particle has drifted outside spawn volume
        let off     = p.position - u.cameraPos;
        let outside = p._pad <= 0.0
                   || abs(off.x) > u.spawnRadius
                   || abs(off.z) > u.spawnRadius
                   || off.y < -10.0
                   || off.y > u.spawnHeight;

        if (outside) {
            p = spawnParticle(i, windVel, fallSpeed, u.cameraPos, u.spawnRadius, u.spawnHeight);
        }
        particles[i] = p;
        return;
    }

    // ── Normal physics ────────────────────────────────────────────────────────
    let wobbleAmp  = sin(u.iTime * 2.3 + p.seed * 6.28) * (1.0 - rainFactor) * 0.4;
    let wobble     = vec3f(-u.windDir.y * wobbleAmp, 0.0, u.windDir.x * wobbleAmp);
    let termVel    = windVel + vec3f(0.0, -fallSpeed, 0.0) + wobble;
    let blend      = min(u.deltaTime * 8.0, 1.0);
    p.velocity     = mix(p.velocity, termVel, blend);
    p.position    += p.velocity * u.deltaTime;

    // ── Depth-buffer collision ────────────────────────────────────────────────
    let clipPos = u.viewProj * vec4f(p.position, 1.0);
    if (clipPos.w > 0.001) {
        let ndc = clipPos.xyz / clipPos.w;

        // Skip particles outside near/far clip planes
        if (ndc.z >= 0.0 && ndc.z <= 1.0) {
            let uv   = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
            let dims = textureDimensions(depthTex);
            let tc   = vec2<i32>(i32(uv.x * f32(dims.x)), i32(uv.y * f32(dims.y)));

            if (tc.x >= 0 && tc.x < i32(dims.x) && tc.y >= 0 && tc.y < i32(dims.y)) {
                let depth = textureLoad(depthTex, tc, 0);
                // Compare NDC depths along the view ray, not world-space Y.
                // A distant hill behind the particle has depth ≈ 1.0 while a
                // close particle has ndc.z ≈ 0.9, so ndc.z < depth → no hit.
                // Only when the particle has actually reached the surface does
                // ndc.z ≥ depth. Epsilon handles the one-frame overshoot.
                if (depth < 1.0 && ndc.z >= depth - 0.002) {
                    let terrainH = u.invViewProj * vec4f(ndc.x, ndc.y, depth, 1.0);
                    let terrainY = terrainH.y / terrainH.w;

                    // Guard against ceilings / cliff faces: surface must be
                    // at or below the particle (particle fell into it from above).
                    if (terrainY <= p.position.y + 0.3) {
                        if (rainFactor > 0.5) {
                            // Rain: tiny fixed kick — same height regardless of fall speed,
                            // so distant particles don't appear to jump higher.
                            p.velocity   = vec3f(0.0, 1.0, 0.0);
                            p.position.y = terrainY + 0.1;
                            p._pad       = 0.15;
                        } else {
                            // Snow: freeze on terrain for ~1 s then respawn
                            p.velocity   = vec3f(0.0, 0.0, 0.0);
                            p.position.y = terrainY + 0.1;
                            p._pad       = 1.0;
                        }
                    }
                }
            }
        }
    }

    // ── Respawn if outside spawn volume ──────────────────────────────────────
    let offset  = p.position - u.cameraPos;
    let outside = abs(offset.x) > u.spawnRadius
               || abs(offset.z) > u.spawnRadius
               || offset.y < -10.0
               || offset.y > u.spawnHeight;

    if (outside) {
        p = spawnParticle(i, windVel, fallSpeed, u.cameraPos, u.spawnRadius, u.spawnHeight);
    }

    particles[i] = p;
}
