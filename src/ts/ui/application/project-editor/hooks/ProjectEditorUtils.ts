import { IWorkspace } from "models";

export const defaultWorkspace = (): IWorkspace => {
  return {
    cells: [
      {
        editor: "ribbon",
        colStart: 3,
        colEnd: 4,
        rowStart: 1,
        rowEnd: 2,
      },
      {
        editor: "properties",
        colStart: 5,
        colEnd: 6,
        rowStart: 2,
        rowEnd: 4,
      },
    ],
  };
};
