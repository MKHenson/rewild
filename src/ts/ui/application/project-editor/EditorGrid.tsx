import { Component, createEffect, createSignal, For, Show } from "solid-js";
import { produce } from "solid-js/store";
import { styled } from "solid-styled-components";
import { GridCell } from "./GridCell";
import { RibbonButtons } from "./editors/RibbonButtons";
import { Properties } from "./editors/Properties";
import { EditorType, IWorkspaceCell } from "models";
import { Loading } from "../../common/Loading";
import { SceneGraph } from "./editors/SceneGraph";
import { useEditor } from "./EditorProvider";
import { ProjectSettings } from "./editors/ProjectSettings";
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

export const EditorGrid: Component<Props> = (props) => {
  const [cells, setCells] = createSignal<IWorkspaceCell[]>([]);
  const { project, setProjectStore, setDirty } = useEditor();

  createEffect(() => {
    if (project.workspace) setCells(createCells(project.workspace.cells));
  });

  const mapped = (type?: EditorType) => {
    if (!type) return null;
    if (type === "properties") return <Properties />;
    if (type === "scene-graph") return <SceneGraph />;
    if (type === "project-settings") return <ProjectSettings />;
    if (type === "ribbon") return <RibbonButtons onHome={props.onHome} />;
    return null;
  };

  return (
    <StyledContainer>
      <Show when={project} fallback={<Loading />}>
        <For each={cells()}>
          {(cell, i) => {
            const editor = mapped(cell.editor);
            return (
              <GridCell
                rowStart={cell.rowStart}
                rowEnd={cell.rowEnd}
                colStart={cell.colStart}
                colEnd={cell.colEnd}
                editor={cell.editor}
                hasElement={!!editor}
                editorElm={editor}
                onEditorMoved={(editor, rowStart, colStart, rowEnd, colEnd) => {
                  setDirty(true);
                  setProjectStore(
                    produce((state) => {
                      const cell = state.workspace!.cells.find((c) => c.editor === editor)!;
                      cell.editor = editor;
                      cell.colStart = colStart;
                      cell.rowStart = rowStart;
                      cell.rowEnd = rowEnd;
                      cell.colEnd = colEnd;
                    })
                  );
                }}
              />
            );
          }}
        </For>
      </Show>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  height: 100%;
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  grid-template-rows: 50px 1fr 1fr 1fr 1fr;
`;
