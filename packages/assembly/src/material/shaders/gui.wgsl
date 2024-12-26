// Vertex Shader
// ==============
struct GUIElementUniform {
    position:vec2<f32>,
    size:vec2<f32>,
    radius: f32
};

@group(1) @binding(0) 
var<uniform> gui_element: GUIElementUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) tex_coords: vec2<f32>
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) tex_coords: vec2<f32>,
    @location(1) local_position: vec2<f32>
}

@vertex
fn vs_main(
    model: VertexInput,
    @builtin(vertex_index) vertex_index: u32
) -> VertexOutput {
    var out: VertexOutput;
    out.tex_coords = model.tex_coords;
    
    // This must match the vertex data in the buffer
    var positions = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0)
    ); 

    let pos = positions[vertex_index] * gui_element.size + gui_element.position;
    out.clip_position = vec4<f32>(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0, model.position.z, 1.0);
    out.local_position = positions[vertex_index] * gui_element.size; // Pass local position to fragment shader
    
    return out;
}

// Fragment Shader
// ================

@group(0) @binding(0)
var t_diffuse: texture_2d<f32>;
@group(0) @binding(1)
var s_diffuse: sampler;

@group(1) @binding(1)
var<uniform> window_size: vec2<f32>;

@fragment 
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let normalized_radius = gui_element.radius / min(window_size.x, window_size.y);

    // Calculate the distance from the fragment to the nearest corner
    let corner_dist = vec2<f32>(
        min(in.local_position.x, gui_element.size.x - in.local_position.x),
        min(in.local_position.y, gui_element.size.y - in.local_position.y)
    );

    // Check if the fragment is outside the rounded corner radius
    if corner_dist.x < normalized_radius && corner_dist.y < normalized_radius {
        let dist = length(corner_dist - vec2<f32>(normalized_radius, normalized_radius));
        if dist > normalized_radius {
            discard;
        }
    }

     return textureSample(t_diffuse, s_diffuse, in.tex_coords);
}