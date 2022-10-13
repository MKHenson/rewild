import { Component, createEffect, createResource, createSignal, For, JSX, Resource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { styled } from "solid-styled-components";
import { Button } from "../../common/Button";
import { Card } from "../../common/Card";
import { Typography } from "../../common/Typography";
import { Divider } from "../../common/Divider";
import { MaterialIcon } from "../../common/MaterialIcon";
import { Loading } from "../../common/Loading";
import { getProject } from "./ProjectSelectorUtils";
import { GridCell } from "./GridCell";
import { IProject } from "models";

interface Props {
  onHome: () => void;
}

const numColumns = 5;
const numRows = 5;

export const Properties: Component<{ project: Resource<IProject | undefined> }> = (props) => {
  return (
    <Card>
      <Typography variant="h3">Properties</Typography>
      <Show when={!props.project.loading} fallback={<Loading />}>
        <>
          <Typography variant="h2">{props.project()?.name}</Typography>
          <Typography variant="light">{props.project()?.description}</Typography>
        </>
      </Show>
    </Card>
  );
};

export const Tools: Component<Props> = (props) => {
  return (
    <Card>
      <Button fullWidth onClick={props.onHome}>
        <MaterialIcon icon="home" size="s" /> Home
      </Button>
      <Divider />
      <Typography variant="h3">Tools</Typography>
    </Card>
  );
};

interface IWorkspace {
  type: string;
  colStart: number;
  rowStart: number;
  colEnd: number;
  rowEnd: number;
}

interface ICell {
  index: number;
  colStart: number;
  rowStart: number;
  colEnd: number;
  rowEnd: number;
  editor?: string;
}

function createCells(workspaces: IWorkspace[]): ICell[] {
  const toRet: ICell[] = [];
  for (let y = 0; y < numRows; y++)
    for (let x = 0; x < numColumns; x++) {
      const index = y * numColumns + x;

      const workspace = workspaces.find((editor) => editor.colStart === x + 1 && editor.rowStart === y + 1);
      toRet.push({
        rowStart: y + 1,
        colStart: x + 1,
        rowEnd: workspace ? (workspace.rowEnd <= y + 2 ? y + 2 : workspace.rowEnd) : y + 2,
        colEnd: workspace ? (workspace.colEnd <= x + 2 ? x + 2 : workspace.colEnd) : x + 2,
        index,
        editor: workspace?.type,
      });
    }

  return toRet;
}

export const Editor: Component<Props> = (props) => {
  const { project: projectId } = useParams<{ project: string }>();
  const [project] = createResource(projectId, getProject);
  const [workspace, setWorkspace] = createSignal<IWorkspace[]>([
    {
      type: "properties",
      colStart: 1,
      rowStart: 3,
      colEnd: 2,
      rowEnd: 4,
    },
    {
      type: "tools",
      colStart: 3,
      rowStart: 3,
      colEnd: 2,
      rowEnd: 4,
    },
  ]);
  const [cells, setCells] = createSignal<ICell[]>(createCells(workspace()));

  const mapped: { [index: string]: JSX.Element } = {
    properties: <Properties project={project} />,
    tools: <Tools {...props} />,
  };

  createEffect(() => {
    setCells(createCells(workspace()));
  });

  return (
    <StyledContainer>
      <For each={cells()}>
        {(cell, i) => (
          <GridCell
            index={cell.index}
            rowStart={cell.rowStart}
            rowEnd={cell.rowEnd}
            colStart={cell.colStart}
            colEnd={cell.colEnd}
            editor={cell.editor}
            editorElm={cell.editor ? mapped[cell.editor] : undefined}
            onEditorMoved={(editor, rowStart, colStart, rowEnd, colEnd) =>
              setWorkspace(
                workspace().map((e) =>
                  e.type === editor
                    ? {
                        type: editor,
                        colStart,
                        rowStart,
                        colEnd,
                        rowEnd,
                      }
                    : e
                )
              )
            }
          />
        )}
      </For>
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
