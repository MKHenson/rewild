// Generates the tiling noise volumes the cumulus density samples, and their mips.
//
//   shape  (64³ or 128³, by tier): r = Perlin-Worley, g/b/a = Worley at 8, 16, 32
//                                  cells per tile
//   detail (64³):                  r/g/b = Worley at 4, 8, 16 cells per tile
//
// Worley channels are inverted F1: 1 at a feature point, falling to 0 a cell away,
// so their peaks are the billows. Every lattice wraps at its cell count, so both
// volumes tile seamlessly under a repeat sampler.
//
// Mirrored in scripts/cloud-noise-stats.mjs, which measures the distributions that
// cloudDensity.wgsl's remap constants are derived from — change both together.

@group(0) @binding(0) var shapeVolume: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var detailVolume: texture_storage_3d<rgba8unorm, write>;

// Mip chain: each level is a 2x2x2 box average of the one above. The volumes are
// powers of two and tile, so the box never straddles a seam.
@group(0) @binding(2) var mipSource: texture_3d<f32>;
@group(0) @binding(3) var mipTarget: texture_storage_3d<rgba8unorm, write>;

fn pcg3d(input: vec3u) -> vec3u {
    var v = input * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn hashCell(cell: vec3i, period: i32, seed: u32) -> vec3f {
    let wrapped = vec3u((cell % period + period) % period);
    return vec3f(pcg3d(wrapped + vec3u(seed, seed * 3u, seed * 7u))) * (1.0 / 4294967295.0);
}

fn worley(uvw: vec3f, period: i32, seed: u32) -> f32 {
    let p = uvw * f32(period);
    let cell = vec3i(floor(p));
    let local = fract(p);
    var minDistSq = 1.0;
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let offset = vec3i(x, y, z);
                let delta = vec3f(offset) + hashCell(cell + offset, period, seed) - local;
                minDistSq = min(minDistSq, dot(delta, delta));
            }
        }
    }
    return 1.0 - sqrt(minDistSq);
}

fn perlin(uvw: vec3f, period: i32, seed: u32) -> f32 {
    let p = uvw * f32(period);
    let cell = vec3i(floor(p));
    let f = fract(p);
    let fade = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    var corners: array<f32, 8>;
    for (var i = 0; i < 8; i++) {
        let offset = vec3i(i & 1, (i >> 1) & 1, (i >> 2) & 1);
        let gradient = hashCell(cell + offset, period, seed) * 2.0 - 1.0;
        corners[i] = dot(gradient, f - vec3f(offset));
    }
    let x00 = mix(corners[0], corners[1], fade.x);
    let x10 = mix(corners[2], corners[3], fade.x);
    let x01 = mix(corners[4], corners[5], fade.x);
    let x11 = mix(corners[6], corners[7], fade.x);
    return mix(mix(x00, x10, fade.y), mix(x01, x11, fade.y), fade.z);
}

@compute @workgroup_size(4, 4, 4)
fn generateShape(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(shapeVolume);
    if (any(id >= size)) { return; }
    let uvw = (vec3f(id) + 0.5) / vec3f(size);

    let w8 = worley(uvw, 8, 11u);
    let w16 = worley(uvw, 16, 12u);
    let w32 = worley(uvw, 32, 13u);

    let perlinFbm = (perlin(uvw, 8, 21u) * 0.5 + perlin(uvw, 16, 22u) * 0.25 + perlin(uvw, 32, 23u) * 0.125) / 0.875;
    let perlin01 = saturate(perlinFbm + 0.5);

    // Perlin dilated by the Worley fbm: Perlin's connected shapes, with the cells'
    // rounded billows pushed up through them.
    let worleyFbm = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
    let perlinWorley = worleyFbm + perlin01 * (1.0 - worleyFbm);

    textureStore(shapeVolume, id, vec4f(perlinWorley, w8, w16, w32));
}

@compute @workgroup_size(4, 4, 4)
fn generateDetail(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(detailVolume);
    if (any(id >= size)) { return; }
    let uvw = (vec3f(id) + 0.5) / vec3f(size);
    textureStore(detailVolume, id, vec4f(worley(uvw, 4, 31u), worley(uvw, 8, 32u), worley(uvw, 16, 33u), 1.0));
}

@compute @workgroup_size(4, 4, 4)
fn downsample(@builtin(global_invocation_id) id: vec3u) {
    if (any(id >= textureDimensions(mipTarget))) { return; }
    let base = vec3i(id * 2u);
    var sum = vec4f(0.0);
    for (var i = 0; i < 8; i++) {
        sum += textureLoad(mipSource, base + vec3i(i & 1, (i >> 1) & 1, (i >> 2) & 1), 0);
    }
    textureStore(mipTarget, id, sum * 0.125);
}
