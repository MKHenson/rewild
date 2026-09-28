// The atmosphere composite's uniforms (SkyCompositePass). The fog functions
// (fog.wgsl) read them as `object`. The sea spray binds the same buffer, so its
// fog matches the scene's.
struct FinalUniformStruct {
    invViewProjectionMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    resolution: vec2f,
    iTime: f32,
    cloudiness: f32,
    sunPosition: vec3f,
    cameraPosition: vec3f,
    // World height of the sea surface, where the horizon ring's ground lies.
    seaLevel: f32,
    foginess: f32,
    temperature: f32,
    lightningFlash: f32,
    exposure: f32,
};
