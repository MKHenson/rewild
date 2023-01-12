declare module "models" {
  export type EditorType = "properties" | "ribbon" | "scene-graph" | "project-settings" | "actors";
  import type { Timestamp } from "firebase/firestore";
  import type { IconType } from "src/ts/ui/common/MaterialIcon";

  export interface IDragData {
    type: "gridcell" | "treenode";
  }

  export type ITreeNode<Resource extends any = any> = {
    name: string;
    icon?: IconType;
    iconSize?: "s" | "xs";
    canSelect?: boolean;
    canRename?: boolean;
    children: ITreeNode<Resource>[];
    resource?: Resource;
    id?: Resource | string;
    onDragOver?: (data: IDragData, node: ITreeNode<Resource>) => boolean;
    onDrop?: (data: IDragData, node: ITreeNode<Resource>) => void;
    onDragStart?: (node: ITreeNode<Resource>) => IDragData;
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
      containers: ITreeNode<IResource>[];
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
