export const defaultPipelineDescriptor: Partial<GPURenderPipelineDescriptor> = {
  primitive: {
    topology: "triangle-list",
    cullMode: "back",
    frontFace: "ccw",
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less",
  },
  multisample: {
    count: 4,
  },
};
