declare module "models" {
  export type EditorType = "properties" | "ribbon" | "scene-graph" | "project-settings" | "actors";
  import { LoaderPresetType } from "src/core/loader-utils/LoaderPresets";
  import type { Timestamp } from "firebase/firestore";
  import type { IconType } from "rewild-ui";

  export type FactoryKey = "actor" | "container";

  export interface IDragDropAction {
    type: "cell-move" | "treenode";
  }

  export interface IGridCellAction extends IDragDropAction {
    editor: string;
    sizeX: number;
    sizeY: number;
  }

  export interface ITreeNodeAction extends IDragDropAction {
    node: ITreeNode;
  }

  export type Vector3 = [number, number, number];
  export type PropertyType =
    | "size"
    | "speed"
    | "geometry"
    | "pipeline"
    | "position"
    | "color"
    | "target"
    | "active"
    | "baseContainer"
    | "intensity";
  export type PropValueType = "string" | "boolean" | "enum" | "hidden" | "vec3";
  export type PropValue = string | boolean | number | Vector3;
  export type IOption = {
    value: string;
    label: string;
  };
  export type IProperty = {
    label: string;
    type: PropertyType;
    valueType: PropValueType;
    value: PropValue;
    options?: IOption[];
  };

  export type ITreeNode = {
    name?: string;
    icon?: IconType;
    iconSize?: "s" | "xs";
    canSelect?: boolean;
    canRename?: boolean;
    children?: ITreeNode[] | null;
    resource?: IResource;
    onDragOver?: (data: IDragDropAction | null, node: ITreeNode) => boolean;
    onDrop?: (data: IDragDropAction, node: ITreeNode) => boolean;
    onDragStart?: (node: ITreeNode) => IDragDropAction;
  };

  export interface ITemplateTreeNode extends ITreeNode {
    factoryKey: FactoryKey;
    template: () => ITreeNode;
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
      containers: ITreeNode[];
    };
    created: Timestamp;
    lastModified: Timestamp;
  }

  export interface ILevel {
    id?: string;
    name: string;
    project: string;
    activeOnStartup: boolean;
    hasTerrain: boolean;
    startEvent: string;
    created: Timestamp;
    lastModified: Timestamp;
    containers: IContainer[];
  }

  export interface IResource {
    id: string;
    name: string;
    type: "container" | "actor";
    properties: IProperty[];
  }

  export type BaseType = "static" | "dynamic" | "light";

  export interface IActor extends IResource {
    baseType: BaseType;
    actorLoaderPreset: LoaderPresetType;
    type: "actor";
  }

  export interface IContainer extends IResource {
    baseContainer: string;
    activeOnStartup: boolean;
    type: "container";
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
}
