declare module "models" {
  export type EditorType = "properties" | "ribbon" | "scene-graph" | "project-settings" | "actors";
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

  export type PropType = "string" | "boolean" | "enum";
  export type PropValue = string | boolean | number;
  export type IOption = {
    value: string;
    label: string;
  };
  export type IProperty = {
    name: string;
    type: PropType;
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
    project: string;
    activeOnStartup: boolean;
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

  export type BaseType = "static";

  export interface IActor extends IResource {
    baseType: BaseType;
    pipeline: string;
    geometry: "box" | "sphere";
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
