import { GridCell } from './GridCell';
import { RibbonButtons } from './editors/RibbonButtons';
import { EditorType } from 'models';
import { Loading, Component, register, InfoBox } from 'rewild-ui';
import { SceneGraph } from './editors/SceneGraph';
import { ProjectSettings } from './editors/ProjectSettings';
import { projectStore } from '../../stores/ProjectStore';
import { Properties } from './editors/Properties';
import { ActorsTree } from './editors/ActorsTree';
import { EditorViewport } from './editors/EditorViewport';
interface Props {
  onHome: () => void;
}

const numColumns = 5;
const numRows = 5;

@register('x-editor-grid')
export class EditorGrid extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(
      projectStore,
      (prop, prevVal, val) => {
        if (
          prop === 'project' ||
          prop === 'project.workspace.cells' ||
          prop === 'error' ||
          prop === 'loading'
        ) {
          this.render();
        }
      }
    );

    const onCellsUpdated = (
      type: EditorType,
      rowStart: number,
      colStart: number,
      rowEnd: number,
      colEnd: number,
      interaction: 'drop' | 'button'
    ) => {
      projectStoreProxy.dirty = true;
      const cells = projectStoreProxy.project!.workspace.cells;
      let dir: 'up' | 'down' | 'left' | 'right' | 'none' = 'none';

      const newCells = cells.map((cell) => {
        if (cell.editor === type) {
          if (interaction === 'button') {
            if (rowEnd > cell.rowEnd) dir = 'down';
            else if (rowEnd < cell.rowEnd) dir = 'up';
            else if (colEnd < cell.colEnd) dir = 'left';
            else if (colEnd > cell.colEnd) dir = 'right';
          }

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
            (dir === 'down' || dir === 'up') &&
            otherCell.colStart === cell.colStart && // Same column
            otherCell.rowStart === cell.rowEnd - (dir === 'down' ? 1 : -1) // At a horizontal join
          ) {
            // If the 'cell' is above the otherCell
            if (cell.rowStart < otherCell.rowStart) {
              if (dir === 'down') {
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
            (dir === 'left' || dir === 'right') &&
            otherCell.rowStart === cell.rowStart && // Same row
            otherCell.colStart === cell.colEnd - (dir === 'right' ? 1 : -1) // At a horizontal join
          ) {
            // If the 'cell' is above the otherCell
            if (cell.colStart < otherCell.colStart) {
              if (dir === 'right') {
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

    // First create all the cells we're going to work with
    const allCells: GridCell[] = [];
    const cellsCache: { [id: string]: GridCell } = {};
    for (let y = 0; y < numRows; y++)
      for (let x = 0; x < numColumns; x++) {
        const newCell = (
          <GridCell
            rowStart={y + 1}
            colStart={x + 1}
            rowEnd={y + 2}
            colEnd={x + 2}
            onEditorMoved={onCellsUpdated}
          />
        ) as GridCell;
        cellsCache[`${x + 1}-${y + 1}`] = newCell;
        allCells.push(newCell);
      }

    // Now create each of the editors
    const editors: { [key in EditorType]: HTMLElement } = {
      properties: <Properties />,
      'scene-graph': <SceneGraph />,
      viewport: <EditorViewport />,
      'project-settings': <ProjectSettings />,
      ribbon: <RibbonButtons onHome={this.props.onHome} />,
      actors: <ActorsTree />,
    };

    return () => {
      if (projectStoreProxy.error)
        return (
          <InfoBox title="Error" variant="error">
            {projectStoreProxy.error}
          </InfoBox>
        );

      if (projectStoreProxy.loading) return <Loading />;

      // For each render
      // Reset each of the cells to their original position and area and remove any editor it may have had
      for (let y = 0; y < numRows; y++)
        for (let x = 0; x < numColumns; x++) {
          const gridCell = cellsCache[`${x + 1}-${y + 1}`];
          gridCell.setGridArea(y + 1, x + 1, y + 2, x + 2);
          gridCell.setEditor(null);
          gridCell._props.editor = undefined;
        }

      // Now for each cell in the project, assign it to its grid cell, set the area, and the editor
      projectStoreProxy.project?.workspace.cells.forEach((cell) => {
        if (!cell.editor) return;

        const editor = editors[cell.editor];
        const cellId = `${cell.colStart}-${cell.rowStart}`;
        const gridCell = cellsCache[cellId];
        gridCell.setGridArea(
          cell.rowStart,
          cell.colStart,
          cell.rowEnd,
          cell.colEnd
        );
        gridCell.setEditor(editor);
        gridCell._props.editor = cell.editor;
      });

      return allCells;
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

  x-info-box {
    position: absolute;
    width: 400px;
    left: calc(50% - 150px);
    top: calc(50% - 100px);
  }
`);
