declare module "models" {
  export type EditorType = "properties" | "ribbon";

  export interface IProject {
    id?: string;
    name: string;
    description: string;
    workspace: IWorkspace;
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
