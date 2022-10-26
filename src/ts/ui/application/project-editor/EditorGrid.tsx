import { Component, createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { styled } from "solid-styled-components";
import { getProject } from "./hooks/ProjectEditorAPI";
import { GridCell } from "./GridCell";
import { RibbonButtons } from "./editors/RibbonButtons";
import { Properties } from "./editors/Properties";
import { EditorType, IWorkspaceCell, IProject } from "models";
import { Loading } from "../../common/Loading";
import { updateProject } from "./hooks/ProjectEditorAPI";
import { SceneGraph } from "./editors/SceneGraph";

interface Props {
  onHome: () => void;
}

const numColumns = 5;
const numRows = 5;

function createCells(workspaceCells: IWorkspaceCell[]): IWorkspaceCell[] {
  const toRet: IWorkspaceCell[] = [];
  for (let y = 0; y < numRows; y++)
    for (let x = 0; x < numColumns; x++) {
      const workspace = workspaceCells.find((editor) => editor.colStart === x + 1 && editor.rowStart === y + 1);
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
  const { project: projectId } = useParams<{ project: string }>();
  const [projectResource] = createResource(projectId, getProject);
  const [cells, setCells] = createSignal<IWorkspaceCell[]>([]);
  const [project, setProject] = createSignal<IProject>();
  const [projectDirty, setProjectDirty] = createSignal(false);
  const [mutating, setMutating] = createSignal(false);

  const updateProjectState = (token: IProject) => {
    const updatedProject = token;
    setProject(updatedProject);
    setCells(createCells(updatedProject.workspace.cells));
    setProjectDirty(true);
  };

  createEffect(() => {
    if (projectResource()) {
      updateProjectState(projectResource()!);
      setProjectDirty(false);
    }
  });

  const onSave = async () => {
    setMutating(true);
    await updateProject(project()!);
    setProjectDirty(false);
    setMutating(false);
  };

  const mapped = (type: EditorType) => {
    if (type === "properties") return <Properties project={projectResource} />;
    if (type === "scene-graph")
      return <SceneGraph project={project()} onChange={(token) => updateProjectState(token)} />;
    if (type === "ribbon")
      return (
        <RibbonButtons mutating={mutating()} projectDirty={projectDirty()} onHome={props.onHome} onSave={onSave} />
      );
    return null;
  };

  return (
    <StyledContainer>
      <Show when={project()} fallback={<Loading />}>
        <For each={cells()}>
          {(cell, i) => (
            <GridCell
              rowStart={cell.rowStart}
              rowEnd={cell.rowEnd}
              colStart={cell.colStart}
              colEnd={cell.colEnd}
              editor={cell.editor}
              editorElm={cell.editor ? mapped(cell.editor) : undefined}
              onEditorMoved={(editor, rowStart, colStart, rowEnd, colEnd) =>
                updateProjectState({
                  ...project()!,
                  workspace: {
                    cells: project()!.workspace.cells.map((e) =>
                      e.editor === editor
                        ? ({
                            editor,
                            colStart,
                            rowStart,
                            colEnd,
                            rowEnd,
                          } as IWorkspaceCell)
                        : e
                    ),
                  },
                })
              }
            />
          )}
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
