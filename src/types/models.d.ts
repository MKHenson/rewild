declare module 'models' {
  export type EditorType =
    | 'properties'
    | 'ribbon'
    | 'scene-graph'
    | 'project-settings'
    | 'actors'
    | 'viewport';
  import type { IDragDropAction, ITreeNode } from 'rewild-ui';

  export type FactoryKey = 'actor' | 'container' | 'sky';

  export interface ITreeNodeAction extends IDragDropAction {
    node: ITreeNode<IResource>;
  }

  export type Vector3 = [number, number, number];
  export type PropertyType =
    | 'size'
    | 'speed'
    | 'templateId'
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
    | 'intensity';
  export type PropValueType =
    | 'string'
    | 'boolean'
    | 'enum'
    | 'hidden'
    | 'vec3'
    | 'float';
  export type PropValue = string | boolean | number | Vector3;
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
  export type IProperty = {
    label: string;
    type: PropertyType;
    valueType: PropValueType;
    value: PropValue;
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
    workspace: IWorkspace;
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

  export interface IResource {
    id: string;
    name: string;
    type: 'container' | 'actor';
    properties: IProperty[];
  }

  export type BaseType = 'static' | 'dynamic' | 'light';

  export interface IActor extends IResource {
    baseType: BaseType;
    type: 'actor';
  }

  export interface IContainer extends IResource {
    activeOnStartup: boolean;
    type: 'container';
    actors: IActor[];
  }

  export interface IWorkspace {
    cells: IWorkspaceCell[];
  }

  interface IWorkspaceCell {
    colStart: number;
    rowStart: number;
    colEnd: number;
    rowEnd: number;
    editor?: EditorType;
  }

  export interface ITemplateItems {
    assets: ITemplateItem[];
  }

  export interface ITemplateItemBase {
    name: string;
  }

  export interface IAsset {
    materialId: string;
    geometryId: string;
  }

  export interface ICharacter extends IAsset {
    abilities: string[];
  }

  export type ITemplateItem =
    | (ITemplateItemBase & { type: 'asset'; resource: IAsset })
    | (ITemplateItemBase & { type: 'character'; resource: ICharacter });
}
