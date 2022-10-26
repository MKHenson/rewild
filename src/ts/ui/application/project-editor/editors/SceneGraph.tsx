import { Component, createEffect, createSignal, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { IContainer, IProject } from "models";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Loading } from "../../../common/Loading";
import { ITreeNode, Tree } from "../../../common/Tree";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { MaterialIcon } from "../../../common/MaterialIcon";

interface Props {
  project?: IProject;
  onChange: (val: IProject) => void;
}

export const SceneGraph: Component<Props> = (props) => {
  const [selectedNodes, setSelectedNodes] = createSignal<ITreeNode<IContainer>[]>([]);
  const [nodes, setNodes] = createSignal<ITreeNode<IContainer>[]>([]);

  createEffect(() => {
    if (props.project)
      setNodes(
        props.project.containers.map((container) => ({ name: container.name, resource: container } as ITreeNode))
      );
  });

  const onContainerAdd = () => {
    const newContainer = {
      name: `New Container ${props.project?.containers.length || ""}`,
      activeOnStartup: true,
    } as IContainer;

    props.onChange({
      ...props.project!,
      containers: props.project!.containers.concat(newContainer),
    });
  };

  const onContainerRemove = () => {
    props.onChange({
      ...props.project!,
      containers: props.project!.containers.filter((c) => !selectedNodes().find((selected) => selected.resource === c)),
    });
    setSelectedNodes([]);
  };

  const onSelectionChanged = (val: ITreeNode[]) => {
    setSelectedNodes(val);
  };

  return (
    <Card>
      <StyleSceneGraph>
        <div class="header">
          <Typography variant="h3">Scene</Typography>
        </div>
        <div class="nodes">
          <Show when={props.project} fallback={<Loading />}>
            <Tree onSelectionChanged={onSelectionChanged} selectedNodes={selectedNodes()} rootNodes={nodes()} />
          </Show>
        </div>
        <div class="graph-actions">
          <ButtonGroup>
            <Button variant="text" onClick={onContainerAdd}>
              <MaterialIcon icon="add_circle" size="s" />
            </Button>
            <Button variant="text" onClick={onContainerRemove}>
              <MaterialIcon icon="delete" size="s" />
            </Button>
          </ButtonGroup>
        </div>
      </StyleSceneGraph>
    </Card>
  );
};

const StyleSceneGraph = styled.div`
  display: grid;
  height: 100%;
  width: 100%;
  grid-template-rows: 20px 1fr 30px;

  .graph-actions button {
    color: ${(e) => e.theme?.colors.onSubtle};
    padding: 0.5rem;
  }

  .nodes {
    max-height: 100%;
    overflow: hidden;
  }
`;
