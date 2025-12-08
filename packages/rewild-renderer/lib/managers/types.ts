export interface IMaterialsTemplate {
  textures: {
    name: string;
    type?: 'texture' | 'cubemap';
    url?: string;
    urls?: string[];
  }[];
  materials: {
    name: string;
    type: 'diffuse' | 'diffuse-instanced' | 'wireframe';
    diffuseMap?: string;
  }[];
}

export interface IGeometryTemplates {
  [name: string]: {
    type: string;
    url: string;
  };
}
