declare module 'models' {
  export type EditorType =
    | 'properties'
    | 'ribbon'
    | 'scene-graph'
    | 'project-settings'
    | 'actors'
    | 'viewport';
  import type { IDragDropAction, ITreeNode, IconType } from 'rewild-ui';

  export type FactoryKey = 'actor' | 'container' | 'sky';

  export interface ITreeNodeAction extends IDragDropAction {
    node: ITreeNode<IResource>;
  }

  export type Vector3 = [number, number, number];
  export type Vector4 = [number, number, number, number];
  export type PropertyType =
    | 'size'
    | 'speed'
    | 'material'
    | 'position'
    | 'cloudiness'
    | 'foginess'
    | 'windiness'
    | 'elevation'
    | 'dayNightCycle'
    | 'color'
    | 'target'
    | 'active'
    | 'geometry'
    | 'intensity'
    | 'radius'
    | 'camera-transform';
  export type PropValueType =
    | 'string'
    | 'boolean'
    | 'enum'
    | 'vec3'
    | 'float'
    | 'object';

  export type PropValueObject = Record<
    string,
    string | boolean | number | Vector3
  >;
  export type PropValue = string | boolean | number | Vector3 | PropValueObject;
  export type IOption = {
    value: string;
    label: string;
  };
  export type IValueOptions = {
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
  };

  export type IPropertyValue = {
    type: PropertyType;
    value: PropValue;
  };

  export type CustomEditorType = 'camera-capture';

  export type IProperty = {
    label: string;
    valueType: PropValueType;
    hidden?: boolean;
    customEditor?: CustomEditorType;
    valueOptions?: IValueOptions;
    options?: IOption[];
  };

  export interface ITemplateTreeNode extends ITreeNode<IResource> {
    factoryKey: FactoryKey;
    template: () => ITreeNode<IResource>;
  }

  export interface IDataTable<T> {
    getOne(id: string): Promise<(T & { id: string }) | null>;
    getMany(query: IDataTableQuery<T>): Promise<{
      items: (T & { id: string })[];
      cursor: string | number | Partial<T>;
    }>;

    remove(id: string): Promise<boolean>;
    add(token: T): Promise<T & { id: string }>;
    patch(id: string, token: Partial<T>): Promise<void>;
  }

  export interface IDataTableQuery<Query> {
    limit?: number;
    cursor?: string | number | unknown;
    where?: [
      keyof Query,
      '==' | '!=' | '<' | '<=' | '>' | '>=',
      number | string | boolean
    ][];
    sort?: [keyof Query, 'asc' | 'desc'][];
  }

  export interface IProject {
    id?: string;
    level: string;
    name: string;
    description: string;
    activeOnStartup: boolean;
    startEvent: string;
    sceneGraph: {
      containers: IContainer[];
      atmosphere: {
        elevation: PropValue;
        cloudiness: PropValue;
        foginess: PropValue;
        windiness: PropValue;
        dayNightCycle: PropValue;
      };
    };
    created: number;
    lastModified: number;
  }

  export interface ILevel {
    id?: string;
    name: string;
    project: string;
    activeOnStartup: boolean;
    hasTerrain: boolean;
    startEvent: string;
    created: number;
    lastModified: number;
    containers: IContainer[];
  }

  export type ResourceType = 'container' | 'actor' | 'player-start';
  export interface IResource {
    id: string;
    name: string;
    type: ResourceType;
    properties?: IPropertyValue[];
    templateId?: string;
  }

  export interface IActor extends IResource {
    type: 'actor';
  }

  export interface IContainerPod {
    asset3D: {
      id: string;
      position: Vector3;
      rotation: Vector4;
    }[];
  }

  export interface IContainer extends IResource {
    activeOnStartup: boolean;
    type: 'container';
    pod: IContainerPod;
    actors: IActor[];
  }

  export interface IActorTemplates {
    'actor-templates': {
      name: string;
      icon: IconType;
      actors: {
        name: string;
        templateId?: string;
        type?: ResourceType;
        properties?: IPropertyValue[];
      }[];
    }[];
  }

  export interface ITemplateItems {
    assets: ITemplateItem[];
  }

  export interface ITemplateItemBase {
    name: string;
    behaviors?: string[];
  }

  export interface IResource3D {
    materialId: string;
    geometryId: string;
    physics?: {
      mass?: number;
      friction?: number;
      restitution?: number;
      bodyType?: 'dynamic' | 'fixed' | 'kinematic';
      shape?:
        | {
            type: 'box';
            // Full extents (width, height, depth). Will be converted to half-extents for Rapier.
            size: [number, number, number];
          }
        | {
            type: 'sphere';
            radius: number;
          };
    };
  }

  export interface ILight {
    radius: number;
    color: Vector3;
    intensity: number;
  }

  export interface ICharacter extends IResource3D {
    abilities: string[];
  }

  export type ITemplateItem =
    | (ITemplateItemBase & { type: 'asset'; resource: IResource3D })
    | (ITemplateItemBase & { type: 'light'; resource: ILight })
    | (ITemplateItemBase & { type: 'character'; resource: ICharacter });
}
