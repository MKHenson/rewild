import { GridCell } from "./GridCell";
import { RibbonButtons } from "./editors/RibbonButtons";
// import { Properties } from "./editors/Properties";
import { EditorType, IWorkspaceCell } from "models";
import { Loading } from "../../common/Loading";
import { SceneGraph } from "./editors/SceneGraph";
// import { useEditor } from "./EditorProvider";
import { ProjectSettings } from "./editors/ProjectSettings";
import { Component, register } from "../../Component";
import { projectStore } from "../../stores/Project";
import { InfoBox } from "../../common/InfoBox";
interface Props {
  onHome: () => void;
}

const numColumns = 5;
const numRows = 5;

function createCells(workspaceCells: IWorkspaceCell[]): IWorkspaceCell[] {
  const toRet: IWorkspaceCell[] = [];
  for (let y = 0; y < numRows; y++)
    for (let x = 0; x < numColumns; x++) {
      const workspace = workspaceCells.find((cell) => cell.colStart === x + 1 && cell.rowStart === y + 1);
      toRet.push({
        rowStart: y + 1,
        colStart: x + 1,
        rowEnd: workspace ? (workspace.rowEnd <= y + 2 ? y + 2 : workspace.rowEnd) : y + 2,
        colEnd: workspace ? (workspace.colEnd <= x + 2 ? x + 2 : workspace.colEnd) : x + 2,
        editor: workspace?.editor,
      });
    }

  return toRet;
}

@register("x-editor-grid")
export class EditorGrid extends Component<Props> {
  init() {
    const [cells, setCells] = this.useState<IWorkspaceCell[]>([]);
    const projectStoreProxy = this.observeStore(projectStore, (prop, prevVal, val, path) => {
      if (prop === "project" || prop === "cells" || prop === "error") {
        setCells(createCells(projectStoreProxy.project!.workspace.cells));
      }
    });

    const mapped = (type?: EditorType) => {
      if (!type) return null;
      //   if (type === "properties") return <Properties />;
      if (type === "scene-graph") return <SceneGraph />;
      if (type === "project-settings") return <ProjectSettings />;
      if (type === "ribbon") return <RibbonButtons onHome={this.props.onHome} />;
      return null;
    };

    return () => {
      if (projectStoreProxy.error)
        return (
          <InfoBox title="Error" variant="error">
            {projectStoreProxy.error}
          </InfoBox>
        );

      // this.useEffect(() => {
      //   if (projectStoreProxy.project?.workspace) {
      //     setCells(createCells(projectStoreProxy.project.workspace.cells), false);
      //   }
      // }, [projectStoreProxy.project?.workspace]);

      return projectStoreProxy.project! ? (
        cells().map((cell, i) => {
          const editor = mapped(cell.editor);
          return (
            <GridCell
              rowStart={cell.rowStart}
              rowEnd={cell.rowEnd}
              colStart={cell.colStart}
              colEnd={cell.colEnd}
              editor={cell.editor}
              hasElement={!!editor}
              editorElm={editor || undefined}
              onEditorMoved={(editor, rowStart, colStart, rowEnd, colEnd) => {
                projectStoreProxy.dirty = true;
                projectStoreProxy.project!.workspace.cells = projectStoreProxy.project!.workspace.cells.map((cell) => {
                  if (cell.editor === editor)
                    return {
                      ...cell,
                      editor,
                      colStart,
                      rowStart,
                      rowEnd: rowEnd > 6 ? 6 : rowEnd,
                      colEnd: colEnd > 6 ? 6 : colEnd,
                    };
                  return cell;
                });
              }}
            />
          );
        })
      ) : (
        <Loading />
      );
    };
  }

  getStyle() {
    return StyledEditorGrid;
  }
}

const StyledEditorGrid = cssStylesheet(css`
  :host {
    height: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
    grid-template-rows: 50px 1fr 1fr 1fr 1fr;
  }
`);
