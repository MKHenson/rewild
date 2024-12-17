pub mod vertex;
use vertex::Vertex;
use wgpu::util::DeviceExt;

pub struct Geometry {
    pub vertex_buffer: wgpu::Buffer,
    pub num_indices: u32,
    pub index_buffer: wgpu::Buffer,
}

#[rustfmt::skip]
const PLANE_VERTICES: &[Vertex] = &[
    Vertex { position: [0.0, 0.0, 0.0], tex_coords: [0.0, 0.0], }, // A
    Vertex { position: [1.0, 0.0, 0.0], tex_coords: [1.0, 0.0], }, // B
    Vertex { position: [0.0, 1.0, 0.0], tex_coords: [0.0, 1.0], }, // C
    Vertex { position: [1.0, 1.0, 0.0], tex_coords: [1.0, 1.0], }, // D
];

const PLANE_INDICES: &[u16] = &[2, 1, 0, 2, 3, 1];

impl Geometry {
    pub fn new(device: &wgpu::Device) -> Self {
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Vertex Buffer"),
            contents: bytemuck::cast_slice(PLANE_VERTICES),
            usage: wgpu::BufferUsages::VERTEX,
        });

        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Index Buffer"),
            contents: bytemuck::cast_slice(&PLANE_INDICES),
            usage: wgpu::BufferUsages::INDEX,
        });

        let num_indices = PLANE_INDICES.len() as u32;

        Geometry {
            vertex_buffer,
            index_buffer,
            num_indices,
        }
    }
}
