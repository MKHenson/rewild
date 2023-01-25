declare module "models" {
  export type EditorType = "properties" | "ribbon" | "scene-graph" | "project-settings" | "actors";
  import type { Timestamp } from "firebase/firestore";
  import type { IconType } from "src/ts/ui/common/MaterialIcon";

  export interface IDragData {
    type: "gridcell" | "treenode";
  }

  export type PropType = "string" | "boolean";
  export type PropValue = string | boolean | number;
  export type IProperty = {
    name: string;
    type: PropType;
    value: PropValue;
  };

  export type ITreeNode = {
    name: string;
    icon?: IconType;
    iconSize?: "s" | "xs";
    canSelect?: boolean;
    canRename?: boolean;
    children: ITreeNode[];
    resource?: IResource;
    id?: IResource | string;
    onDragOver?: (data: IDragData, node: ITreeNode) => boolean;
    onDrop?: (data: IDragData, node: ITreeNode) => void;
    onDragStart?: (node: ITreeNode) => IDragData;
  };

  export interface IProject {
    id?: string;
    level: string;
    name: string;
    description: string;
    activeOnStartup: boolean;
    startEvent: string;
    workspace: IWorkspace;
    containers: IContainer[];
    sceneGraph: {
      containers: ITreeNode[];
    };
    created: Timestamp;
    lastModified: Timestamp;
  }

  export interface ILevel {
    id?: string;
    project: string;
    activeOnStartup: boolean;
    startEvent: string;
    created: Timestamp;
    lastModified: Timestamp;
    containers: IContainer[];
  }

  export interface IResource {
    id: string;
    type: "container" | "actor";
  }

  export interface IEditorResource extends IResource {
    properties: IProperty[];
  }

  export type BaseType = "static";

  export interface IActor extends IResource {
    name: string;
    baseType: BaseType;
    pipeline: string;
    geometry: "box" | "sphere";
    type: "actor";
  }

  export interface IContainer extends IResource {
    name: string;
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
