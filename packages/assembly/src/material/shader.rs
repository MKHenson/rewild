use wgpu::{ShaderModule, ShaderModuleDescriptor, ShaderSource};

pub struct Shader {
    pub shader_module: ShaderModule,
    pub vertex_entry_point: &'static str,
    pub fragment_entry_point: &'static str,
}

impl Shader {
    pub fn new(
        device: &wgpu::Device,
        shader_source: &'static str,
        vertex_entry: &'static str,
        fragment_entry: &'static str,
    ) -> Self {
        let shader_module = device.create_shader_module(ShaderModuleDescriptor {
            label: Some("Shader"),
            source: ShaderSource::Wgsl(shader_source.into()),
        });

        Self {
            shader_module,
            vertex_entry_point: vertex_entry,
            fragment_entry_point: fragment_entry,
        }
    }
}
