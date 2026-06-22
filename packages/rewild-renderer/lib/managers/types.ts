export interface IMaterialsTemplate {
  textures: {
    name: string;
    type?: 'texture' | 'cubemap';
    url?: string;
    urls?: string[];
  }[];
  materials: {
    name: string;
    type: 'lambert' | 'lambert-instanced' | 'phong' | 'wireframe' | 'gizmo' | 'sprite';
    diffuseMap?: string;
    normalMap?: string;
    specularMap?: string;
    emissiveMap?: string;
    color?: [number, number, number];
    opacity?: number;
    specularColor?: [number, number, number];
    shininess?: number;
    emissiveColor?: [number, number, number];
    emissiveIntensity?: number;
    ambientColor?: [number, number, number];
  }[];
}

export interface IGeometryTemplates {
  [name: string]: {
    type: string;
    url: string;
  };
}
