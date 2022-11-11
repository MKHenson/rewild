declare module "models" {
  export type EditorType = "properties" | "ribbon" | "scene-graph";

  export interface IProject {
    id?: string;
    name: string;
    description: string;
    workspace: IWorkspace;
    containers: IContainer[];
  }

  export interface IResource {
    id: string;
    type: "container";
  }

  export interface IContainer extends IResource {
    name: string;
    activeOnStartup: boolean;
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
