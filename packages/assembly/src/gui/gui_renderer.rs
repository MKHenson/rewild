use crate::{
    geometry::{vertex::Vertex, Geometry},
    material::shader::Shader,
    renderer::Renderer,
    state::GuiElementUniform,
};
use wgpu::{util::DeviceExt, Queue, RenderPipelineDescriptor};
use wgpu::{PrimitiveTopology, RenderPass};

pub struct GuiRenderer {
    pub pipeline: wgpu::RenderPipeline,
    pub geometry: Geometry,
    pub gui_element_uniform: GuiElementUniform,
    pub gui_element_buffer: wgpu::Buffer,
    pub window_size_buffer: wgpu::Buffer,
    pub gui_element_bind_group: wgpu::BindGroup,
    pub window_size: [f32; 2],
}

impl GuiRenderer {
    pub fn new(renderer: &Renderer) -> Self {
        let size = renderer.window().inner_size();
        let device = &renderer.device;

        let geometry = Geometry::new(device);
        let shader = Shader::new(
            device,
            include_str!("../material/shaders/gui.wgsl"),
            "vs_main",
            "fs_main",
        );

        let gui_element_uniform = GuiElementUniform {
            x: 0.5,
            y: 0.5,
            width: 0.2,
            height: 0.2,
            radius: 20.0,
            _padding: 0.0,
        };

        let gui_element_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Gui Element Buffer"),
            contents: bytemuck::cast_slice(&[gui_element_uniform]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let window_size = [size.width as f32, size.height as f32];
        let window_size_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Window Size Buffer"),
            contents: bytemuck::cast_slice(&window_size),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let gui_element_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                ],
                label: Some("gui_element_bind_group_layout"),
            });

        let gui_element_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &gui_element_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: gui_element_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: window_size_buffer.as_entire_binding(),
                },
            ],
            label: Some("gui_element_bind_group"),
        });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Render Pipeline Layout"),
                bind_group_layouts: &[&gui_element_bind_group_layout],
                push_constant_ranges: &[],
            });

        let render_pipeline = device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Render Pipeline"),
            cache: None,
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader.shader_module,
                entry_point: &shader.vertex_entry_point,
                buffers: &[Vertex::desc()],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader.shader_module,
                entry_point: &shader.fragment_entry_point,
                targets: &[Some(wgpu::ColorTargetState {
                    format: renderer.config.format,
                    // blend: Some(wgpu::BlendState::REPLACE),
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                // Setting this to anything other than Fill requires Features::NON_FILL_POLYGON_MODE
                polygon_mode: wgpu::PolygonMode::Fill,
                // Requires Features::DEPTH_CLIP_CONTROL
                unclipped_depth: false,
                // Requires Features::CONSERVATIVE_RASTERIZATION
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
        });

        Self {
            geometry,
            gui_element_bind_group,
            gui_element_buffer,
            gui_element_uniform,
            pipeline: render_pipeline,
            window_size,
            window_size_buffer,
        }
    }

    pub fn update(&mut self, queue: &Queue) {
        queue.write_buffer(
            &self.gui_element_buffer,
            0,
            bytemuck::cast_slice(&[self.gui_element_uniform]),
        );

        queue.write_buffer(
            &self.window_size_buffer,
            0,
            bytemuck::cast_slice(&self.window_size),
        );
    }

    pub fn render(&self, render_pass: &mut RenderPass) {
        let geometry = &self.geometry;
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_bind_group(0, &self.gui_element_bind_group, &[]);
        render_pass.set_vertex_buffer(0, geometry.vertex_buffer.slice(..));
        render_pass.set_index_buffer(geometry.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        render_pass.draw_indexed(0..geometry.num_indices, 0, 0..1);
    }
}
