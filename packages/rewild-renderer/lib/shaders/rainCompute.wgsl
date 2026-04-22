// Compute shader: simulates rain/snow particles in 3D world space.
//
// Each particle has a 3D position and a per-particle seed. Particles fall
// with gravity + wind, wrap around the camera when they leave the spawn
// volume, and interpolate between rain (fast, wind-aligned) and snow
// (slow, lateral wobble) based on temperature.

struct Particle {
    position: vec3<f32>,
    seed:     f32,
}

// ComputeUniforms layout (must match RainParticlePass.ts):
//   offset  0: cameraPos  (vec3, align=16, size=12)
//   offset 12: deltaTime  (f32)
//   offset 16: windDir    (vec2, align=8)
//   offset 24: windSpeed  (f32)
//   offset 28: temperature(f32)
//   offset 32: iTime      (f32)
//   offset 36: spawnRadius(f32)
//   offset 40: spawnHeight(f32)
//   offset 44-63: padding
//   struct size = 64 bytes
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
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform>             u:         ComputeUniforms;

// Fast integer hash → float in [0, 1)
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

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= arrayLength(&particles)) { return; }

    var p = particles[i];

    // Blend physics between snow (0) and rain (1) by temperature
    let rainFactor  = u.temperature;
    let fallSpeed   = mix(1.0, 9.5, rainFactor);         // m/s: snow~1, rain~9.5
    let windFactor  = mix(0.4, 1.0, rainFactor);         // snow drifts less with wind
    let gustAmp     = sin(u.iTime * 0.41) * 0.5
                    + sin(u.iTime * 1.17) * 0.3
                    + sin(u.iTime * 2.73) * 0.2;
    let gust        = 0.5 + gustAmp * 0.45;
    let effWind     = u.windSpeed * windFactor * (1.0 + gust * 0.5);

    let windVel     = vec3f(u.windDir.x * effWind, 0.0, u.windDir.y * effWind);
    let gravity     = vec3f(0.0, -fallSpeed, 0.0);

    // Snow-only: lateral wobble perpendicular to wind
    let wobbleAmp   = sin(u.iTime * 2.3 + p.seed * 6.28) * (1.0 - rainFactor) * 0.4;
    let wobble      = vec3f(-u.windDir.y * wobbleAmp, 0.0, u.windDir.x * wobbleAmp);

    p.position += (windVel + gravity + wobble) * u.deltaTime;

    // Respawn if the particle has left the spawn volume around the camera
    let offset   = p.position - u.cameraPos;
    let outside  = abs(offset.x) > u.spawnRadius
                || abs(offset.z) > u.spawnRadius
                || offset.y < -10.0
                || offset.y > u.spawnHeight;

    if (outside) {
        // Hash on (particle index × prime) XOR coarse time tick — gives unique
        // per-particle spawn position that changes each time it respawns
        let tick = u32(u.iTime * 20.0) + 1u;
        let rx   = hf((i * 3911u) ^ tick);
        let rz   = hf((i * 7213u) ^ (tick * 3u + 1u));
        let ry   = hf((i * 5471u) ^ (tick * 7u + 2u));

        p.seed     = rx;  // refresh seed for visual variation per particle
        p.position = vec3f(
            u.cameraPos.x + (rx * 2.0 - 1.0) * u.spawnRadius,
            u.cameraPos.y + u.spawnHeight * ry,
            u.cameraPos.z + (rz * 2.0 - 1.0) * u.spawnRadius,
        );
    }

    particles[i] = p;
}
