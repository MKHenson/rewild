import { GridCell } from "./GridCell";
import { RibbonButtons } from "./editors/RibbonButtons";
import { EditorType, IWorkspaceCell } from "models";
import { Loading } from "../../common/Loading";
import { SceneGraph } from "./editors/SceneGraph";
import { ProjectSettings } from "./editors/ProjectSettings";
import { Component, register } from "../../Component";
import { projectStore } from "../../stores/Project";
import { InfoBox } from "../../common/InfoBox";
import { Properties } from "./editors/Properties";
import { ActorsTree } from "./editors/ActorsTree";
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

    const projectStoreProxy = this.observeStore(projectStore, (prop, prevVal, val) => {
      if (prop === "project" || prop === "project.workspace.cells" || prop === "error") {
        setCells(createCells(projectStoreProxy.project!.workspace.cells));
      }
    });

    const mapped = (type?: EditorType) => {
      if (!type) return null;
      if (type === "properties") return <Properties />;
      if (type === "scene-graph") return <SceneGraph />;
      if (type === "project-settings") return <ProjectSettings />;
      if (type === "ribbon") return <RibbonButtons onHome={this.props.onHome} />;
      if (type === "actors") return <ActorsTree />;
      return null;
    };

    const onCellsUpdated = (type: EditorType, rowStart: number, colStart: number, rowEnd: number, colEnd: number) => {
      projectStoreProxy.dirty = true;
      const cells = projectStoreProxy.project!.workspace.cells;
      let dir: "up" | "down" | "left" | "right" = "down";

      const newCells = cells.map((cell) => {
        if (cell.editor === type) {
          if (rowEnd > cell.rowEnd) dir = "down";
          else if (rowEnd < cell.rowEnd) dir = "up";
          else if (colEnd < cell.colEnd) dir = "left";
          else if (colEnd > cell.colEnd) dir = "right";

          return {
            ...cell,
            editor: type,
            colStart,
            rowStart,
            rowEnd,
            colEnd,
          };
        }
        return cell;
      });

      newCells.forEach((cell) => {
        for (const otherCell of newCells) {
          if (otherCell === cell) continue;

          if (
            (dir === "down" || dir === "up") &&
            otherCell.colStart === cell.colStart && // Same column
            otherCell.rowStart === cell.rowEnd - (dir === "down" ? 1 : -1) // At a horizontal join
          ) {
            // If the 'cell' is above the otherCell
            if (cell.rowStart < otherCell.rowStart) {
              if (dir === "down") {
                // If this is the last row
                if (otherCell.rowStart + 1 >= 6) {
                  otherCell.rowStart = 5;
                  cell.rowEnd -= 1;
                } else {
                  otherCell.rowStart += 1;
                }
              } else {
                otherCell.rowStart -= 1;
              }
            }
          } else if (
            (dir === "left" || dir === "right") &&
            otherCell.rowStart === cell.rowStart && // Same row
            otherCell.colStart === cell.colEnd - (dir === "right" ? 1 : -1) // At a horizontal join
          ) {
            // If the 'cell' is above the otherCell
            if (cell.colStart < otherCell.colStart) {
              if (dir === "right") {
                // If this is the last row
                if (otherCell.colStart + 1 >= 6) {
                  otherCell.colStart = 5;
                  cell.colEnd -= 1;
                } else {
                  otherCell.colStart += 1;
                }
              } else {
                otherCell.colStart -= 1;
              }
            }
          }
        }

        cell.colStart = cell.colStart > 6 ? 6 : cell.colStart;
        cell.rowStart = cell.rowStart > 6 ? 6 : cell.rowStart;
        cell.colEnd = cell.colEnd > 6 ? 6 : cell.colEnd;
        cell.rowEnd = cell.rowEnd > 6 ? 6 : cell.rowEnd;
      });

      projectStoreProxy.project!.workspace.cells = newCells;
    };

    return () => {
      if (projectStoreProxy.error)
        return (
          <InfoBox title="Error" variant="error">
            {projectStoreProxy.error}
          </InfoBox>
        );

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
              onEditorMoved={onCellsUpdated}
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
